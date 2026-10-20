import type { Secret } from "../config.js";
import { formatAtomic } from "../guardrails/amount.js";
import { USDC_E_DECIMALS } from "../guardrails/constants.js";
import type { EmbeddedHandler, EmbeddedReply } from "../relay/client.js";
import { SAFETY_NOTICES } from "../relay/contract.js";
import { FLAG_NAMES, type FlagEnv } from "../relay/flags.js";
import { createEmbeddedRelay, type EmbeddedRelay, type EmbeddedRelayOptions } from "../../relay/embedded.js";
import { RelayConfigError } from "../../relay/config.js";
import { CryptoError } from "../../relay/crypto.js";
import { StoreError } from "../../relay/store.js";
import { LocalPathError, ensureDataDir, resolveDataDir, type PathContext } from "./paths.js";
import { MasterKeyError, recoverRotation, resolveMasterKey, type ResolvedMasterKey } from "./master-key.js";

// The local mode's runtime: resolve the data directory and the master key, start the in-process relay,
// and give the tools a client that works from the first request on.
//
// The relay is started in the background right after the MCP server begins to listen, so tools/list
// never waits for it (the key derivation alone takes a fraction of a second). A call that needs the
// relay waits for it. If it cannot start, every relay call answers `precondition_failed` with a fixed
// sentence saying why, and the read tools keep working; nothing is half-started and nothing falls back
// to a weaker mode.

export const LOCAL_VERSION = "0.2.0";

export type LocalStatus =
  | { readonly state: "idle" }
  | { readonly state: "starting" }
  | {
      readonly state: "ready";
      readonly dataDir: string;
      readonly dataDirCreated: boolean;
      readonly relay: EmbeddedRelay;
      readonly masterKey: Omit<ResolvedMasterKey, "secret"> | null;
    }
  | { readonly state: "failed"; readonly code: string; readonly message: string; readonly dataDir: string | null };

export interface LocalRuntimeOptions {
  readonly env: FlagEnv;
  // Where the start-up block and any failure go. Never stdout: that is the MCP channel.
  readonly stderr: { write(text: string): unknown };
  readonly path?: PathContext;
  // Seams for tests: injected clock, fetch, sleep, KDF cost and so on.
  readonly relay?: Partial<EmbeddedRelayOptions>;
}

export interface LocalRuntime {
  readonly handler: EmbeddedHandler;
  status(): LocalStatus;
  // Starts the relay if it is not started yet. Never rejects: a failure is the `failed` status.
  start(): Promise<LocalStatus>;
  close(): Promise<void>;
}

const FALSY = new Set(["0", "false", "no", "off"]);

function credentialStoreOn(env: FlagEnv): boolean {
  const raw = env["RELAY_CREDENTIAL_STORE"];
  return !(typeof raw === "string" && FALSY.has(raw.trim().toLowerCase()));
}

// Turns whatever stopped the start into a code and one fixed sentence. No path, no key, no value.
export function describeStartFailure(error: unknown): { readonly code: string; readonly message: string } {
  if (error instanceof LocalPathError || error instanceof MasterKeyError) return { code: error.code, message: error.message };
  if (error instanceof StoreError && error.code === "locked") {
    return {
      code: "data_dir_locked",
      message:
        "Another xo-market process is already using this data directory (only one may, because the daily caps and the single-send rule live there). Close the other session. If none is open, delete the leftover store.lock in the data directory and start again. Do not use a new XO_DATA_DIR: that splits the caps and the stored credential, and a second XO API key would be created.",
    };
  }
  if (error instanceof StoreError && error.code === "keyring_missing") {
    return { code: "keyring_missing", message: "The data directory has sealed credentials but its keyring.json is missing. Restore it from your backup; nothing was opened." };
  }
  if (error instanceof CryptoError && error.code === "wrong_master_key") {
    return { code: "wrong_master_key", message: "The master key does not match this data directory (XO_MASTER_KEY, or master.key in it). Nothing was opened. Use the key you started it with." };
  }
  if (error instanceof CryptoError) return { code: `crypto_${error.code}`, message: "The credential store could not be opened with the key given." };
  if (error instanceof RelayConfigError) {
    const named = [...new Set(error.issues.map((issue) => issue.variable))].join(", ");
    return { code: "config_invalid", message: `The configuration is not usable (${named}). The variable names are in the message; the values are not shown.` };
  }
  const name = error instanceof Error ? ((error as { code?: unknown }).code ?? error.name) : "unknown";
  return { code: "start_failed", message: `The local relay could not start (${String(name).slice(0, 40)}). Nothing was sent.` };
}

function failureReply(status: Extract<LocalStatus, { state: "failed" }>): EmbeddedReply {
  return {
    status: 422,
    bodyText: JSON.stringify({
      error: {
        code: "precondition_failed",
        message: `The local relay is not running: ${status.message}`,
        details: { reason: "local_relay_not_started", cause: status.code },
      },
    }),
  };
}

export function createLocalRuntime(options: LocalRuntimeOptions): LocalRuntime {
  let status: LocalStatus = { state: "idle" };
  let starting: Promise<LocalStatus> | undefined;

  async function startNow(): Promise<LocalStatus> {
    let dataDir: string | null = null;
    try {
      dataDir = resolveDataDir(options.env, options.path);
      const ensured = await ensureDataDir(dataDir);
      await recoverRotation(dataDir);
      let secret: Secret | undefined;
      let masterKey: Omit<ResolvedMasterKey, "secret"> | null = null;
      if (credentialStoreOn(options.env)) {
        const resolved = await resolveMasterKey({ env: options.env, dataDir });
        secret = resolved.secret;
        masterKey = { source: resolved.source, created: resolved.created, tightened: resolved.tightened, staleFile: resolved.staleFile };
      }
      const relay = await createEmbeddedRelay({
        dataDir,
        env: options.env,
        ...(secret === undefined ? {} : { masterSecret: secret }),
        ...options.relay,
      });
      status = { state: "ready", dataDir, dataDirCreated: ensured.created, relay, masterKey };
      options.stderr.write(startupBanner(status));
    } catch (error) {
      const failure = describeStartFailure(error);
      status = { state: "failed", code: failure.code, message: failure.message, dataDir };
      options.stderr.write(`xo-market (local mode ${LOCAL_VERSION}) could not start its relay: ${failure.message}\nThe read tools still work; anything that prepares or sends will say the relay is not running.\n`);
    }
    return status;
  }

  const start = (): Promise<LocalStatus> => {
    if (status.state === "ready" || status.state === "failed") return Promise.resolve(status);
    status = { state: "starting" };
    starting ??= startNow();
    return starting;
  };

  return {
    handler: async (request) => {
      const current = await start();
      if (current.state === "ready") return current.relay.handler(request);
      if (current.state === "failed") return failureReply(current);
      return failureReply({ state: "failed", code: "start_failed", message: "The local relay did not start.", dataDir: null });
    },
    status: () => status,
    start,
    async close() {
      if (starting !== undefined) await starting.catch(() => undefined);
      if (status.state === "ready") await status.relay.close();
    },
  };
}

// ---- the start-up block -------------------------------------------------------------------------------------------------------------

// One short block on stderr: where the state is, which write paths are on, and the three things every
// user must know before putting money behind this (SAFETY_NOTICES, the same sentences the tools carry).
export function startupBanner(status: Extract<LocalStatus, { state: "ready" }>): string {
  const { relay } = status;
  const flags = relay.flags();
  const envFlags = relay.config.flags;
  const owners = relay.owners();
  const key =
    status.masterKey === null
      ? "credential store OFF (no credentials are kept)"
      : status.masterKey.source === "env"
        ? "XO_MASTER_KEY from the environment (nothing on disk)"
        : `key file master.key in the data directory${status.masterKey.created ? " (created now)" : ""}; it protects against copies of the files, not against malware running as you`;
  const writes = FLAG_NAMES.filter((name) => name !== "KILL").map((name) => {
    const requested = envFlags[name] === true;
    const effective = flags[name] === true;
    return `${name} ${requested ? (effective ? "ON" : "requested but held (a live-test result is not recorded; RELAY_ARM=" + name + " arms it for your own test)") : "off"}`;
  });
  const allOff = FLAG_NAMES.filter((name) => name !== "KILL").every((name) => envFlags[name] !== true);
  const ownerLine =
    owners.mode === "explicit"
      ? `XO_OWNER names ${owners.owners.length} wallet(s)`
      : owners.mode === "any"
        ? "any wallet (XO_ALLOW_ANY_OWNER); each is kept apart"
        : owners.owners.length > 0
          ? "bound to the first wallet that signed (set XO_OWNER to change it)"
          : "the first wallet whose signature is accepted will be bound (or set XO_OWNER)";
  const lines = [
    `xo-market local mode ${LOCAL_VERSION}: relay in this process, no server, no relay key`,
    `  data dir:   ${status.dataDir}${status.dataDirCreated ? " (created now, mode 0700)" : ""}`,
    `  master key: ${key}`,
    ...(status.masterKey?.tightened === true ? ["  warning:    master.key was readable by others; it is now 0600. Treat the key as exposed if the machine is shared."] : []),
    ...(status.masterKey?.staleFile === true ? ["  note:       XO_MASTER_KEY is set, so master.key in the data directory is ignored; delete it once you are sure."] : []),
    `  owner:      ${ownerLine}`,
    `  kill switch ${flags.KILL ? "ON: every write is refused" : "off"}; ${allOff ? "all write paths are OFF (the default)" : "write paths: " + writes.join("; ")}`,
    `  caps:       $${formatAtomic(relay.config.limits.maxOrderAtomic, USDC_E_DECIMALS)} per order, $${formatAtomic(relay.config.limits.maxDailyAtomic, USDC_E_DECIMALS)} per day, per account`,
    ...(relay.issues.length > 0 ? [`  warning:    these settings had a bad value and use their default: ${relay.issues.join(", ")}`] : []),
    `  ${SAFETY_NOTICES.advisoryCaps}`,
    `  ${SAFETY_NOTICES.dedicatedCredential}`,
    `  ${SAFETY_NOTICES.approvalMode} Recommended: approval-gated signing.`,
  ];
  return `${lines.join("\n")}\n`;
}
