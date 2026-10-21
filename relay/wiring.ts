import { RelayError } from "../src/relay/errors.js";
import type { FlagEnv, Flags } from "../src/relay/flags.js";
import type { TripwireChecker } from "./alerts.js";
import { createCreationRuntime, type CreationRuntime } from "./creation.js";
import { credentialReadiness, ensureCredentialsReady, healCredentialStates, signL2, TRIPLET_SECRET_NAME } from "./credentials.js";
import { followOpenFundings, sweepFundings } from "./funding.js";
import type { AccountDirectory } from "./health.js";
import type { CoreServices } from "./main.js";
import { defaultClob } from "./clob.js";
import { defaultOrders, type L2Auth } from "./orders.js";
import type { RelayContext, RelayServices } from "./types.js";
import { confirmOperationAbsent, createAccountDirectory, loadUserOpOptions, type UserOpExtensions, type UserOpOptions } from "./userops.js";

// The pieces that turn the assembled core (relay/main.ts assembleCore) into a relay that can serve the
// whole contract: the account directory, the XO request signer, the userop options, the creation
// runtime and the upkeep rounds. Both ways of running the relay use this one file, `pnpm relay` (main.ts)
// and the in-process relay (embedded.ts), so they cannot drift apart. The pieces that are not wired
// here are listed in docs/runbook.md under "known gaps".

// ---- signing XO requests with the stored credential -----------------------------------------------------------------------------

// The order routes sign their XO calls through `services.l2auth`. Their built-in default reads the vault
// under a different secret name than the credential flow writes (hmac_triplet against xo_triplet), so a
// relay wired only with defaults connects an account and then finds no credentials at order time. This
// adapter makes the credential module (the one that stores, probes and validates the triplet) the single
// signer: the HMAC variant, the server clock and the XO_ADDRESS header all come from it.
export function credentialL2Auth(getServices: () => CoreServices | undefined, now: () => number): L2Auth {
  const contextOf = (): Pick<RelayContext, "services" | "now"> => {
    const services = getServices();
    if (services === undefined) throw new RelayError("internal", "The relay is not ready.");
    return { services, now };
  };
  return {
    async has(account) {
      const secrets = getServices()?.secrets;
      if (secrets === undefined) return false;
      try {
        return await secrets.has(account.toLowerCase(), TRIPLET_SECRET_NAME);
      } catch {
        return false;
      }
    },
    async headers(request) {
      const context = contextOf();
      // A stored credential that was never validated (a transient failure ended the first probes) is tried again here.
      if (credentialReadiness(context.services, request.account).state === "stored") await ensureCredentialsReady(context, request.account);
      const signed = await signL2(context, { account: request.account, method: request.method, path: request.path, ...(request.body === "" ? {} : { body: request.body }) });
      return Object.fromEntries(Object.entries(signed.headers).map(([name, value]) => [name.toLowerCase(), value]));
    },
  };
}

// ---- the wiring -------------------------------------------------------------------------------------------------------------------

export interface WiringInput {
  readonly env: FlagEnv;
  readonly now: () => number;
  readonly userops?: UserOpOptions;
  readonly useropExtensions?: UserOpExtensions;
  readonly extraServices?: Partial<RelayServices>;
  // Replaces the account directory built from the relay's own XO readers (tests).
  readonly accounts?: AccountDirectory;
  // False starts no creation runtime. By default one is started, unless the caller already supplies
  // creation extensions or a createdMarkets service of its own (then theirs is the one that runs).
  readonly creation?: boolean;
  // 0 starts no watcher timer (tests); undefined uses the runtime's own interval (30 s).
  readonly creationIntervalMs?: number;
}

export interface Wiring {
  readonly accounts: AccountDirectory;
  readonly extraServices: Partial<RelayServices>;
  // Names of environment variables that had a bad value and were replaced by a safe default. Never values.
  readonly issues: readonly string[];
  readonly creation: CreationRuntime | undefined;
  // Call once the core exists and before the relay serves anything.
  bind(core: { readonly services: CoreServices; readonly flags: () => Flags }): void;
  stop(): void;
}

export function prepareWiring(input: WiringInput): Wiring {
  const loaded = loadUserOpOptions(input.env);
  const useropOptions: UserOpOptions = { ...loaded.options, ...input.userops };
  // The directories are looked up through the relay they belong to, so they are built before the relay exists.
  let services: CoreServices | undefined;
  const accounts = input.accounts ?? createAccountDirectory({ upstream: () => services?.upstream, options: useropOptions, now: input.now });
  const callerOwnsCreation = input.useropExtensions !== undefined || input.extraServices?.useropExtensions !== undefined || input.extraServices?.createdMarkets !== undefined;
  const creation =
    input.creation === false || callerOwnsCreation
      ? undefined
      : createCreationRuntime({ now: input.now, ...(input.creationIntervalMs === undefined ? {} : { intervalMs: input.creationIntervalMs }) });
  const extraServices: Partial<RelayServices> = {
    l2auth: credentialL2Auth(() => services, input.now),
    userops: useropOptions,
    ...creation?.extraServices,
    ...(input.useropExtensions === undefined ? {} : { useropExtensions: input.useropExtensions }),
    ...input.extraServices,
  };
  return {
    accounts,
    extraServices,
    issues: loaded.issues.map((issue) => issue.variable),
    creation,
    bind(core) {
      services = core.services;
      // Resumes every watcher from the store and starts the loop (relay/creation.ts, WIRING).
      creation?.attach({ services: core.services, flags: core.flags });
    },
    stop() {
      creation?.stop();
    },
  };
}

// ---- upkeep -----------------------------------------------------------------------------------------------------------------------

// One round of background upkeep: expire prepared items, orders and funding records, release operation
// reservations that are provably gone, follow open fundings and re-check tripwires. A failing step is
// retried at the next round; it never changes an outcome.
export async function runUpkeep(context: RelayContext, checkers: readonly TripwireChecker[]): Promise<void> {
  const core = context.services as CoreServices;
  const step = async (run: () => Promise<unknown>): Promise<void> => {
    try {
      await run();
    } catch {
      // See above.
    }
  };
  await step(() => core.prepared.sweep());
  await step(() => defaultOrders.sweep(context));
  await step(() => defaultClob.sweep(context));
  await step(() => sweepFundings(context));
  // Reservations held by operations (creation fee) come back only when the operation is provably gone.
  // Funding and order reservations are the other sweeps' business and read as unknown here.
  await step(() =>
    core.ledger.sweep(async (reservation) => {
      if (reservation.kind === "fund" || reservation.category === "order" || reservation.category === "seed") return { verdict: "unknown" };
      return confirmOperationAbsent(context, reservation);
    }),
  );
  await step(() => followOpenFundings(context));
  if (checkers.length > 0) await step(() => core.tripwires.recheck(checkers));
}

// At start-up: make the credential records agree with the vault (a crash right after a key was minted).
export async function healAtStart(context: RelayContext): Promise<void> {
  try {
    await healCredentialStates(context);
  } catch {
    // A start-up heal that cannot run is retried at the next start; credentials are checked again before every use.
  }
}
