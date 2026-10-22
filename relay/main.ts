import { stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { Secret } from "../src/config.js";
import { RELAY_USER_AGENT } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import type { FlagEnv, Flags } from "../src/relay/flags.js";
import { createAlertSink, TripwireRegistry, type AlertSink, type HookRunner, type TripwireChecker } from "./alerts.js";
import { createRelayAudit, RotatingLog, type RelayAudit } from "./audit.js";
import { RelayKeyring } from "./auth.js";
import { CapabilityRegistry, FlagGate } from "./capabilities.js";
import {
  assertStartable,
  createTtyPrompt,
  describeConfig,
  loadRelayConfig,
  RELAY_ENV,
  RelayConfigError,
  resolveMasterSecret,
  type MasterSecretPrompt,
  type RelayConfig,
  type RelayHttpConfig,
} from "./config.js";
import { DurableLedger, ledgerLimitsFrom } from "./ledger.js";
import { OwnerPolicy, type OwnerGate } from "./owners.js";
import { PreparedStore } from "./prepared.js";
import { startRelayServer, type RunningServer } from "./server.js";
import { openRelayStorage, type FsLike, type RelayStorage } from "./store.js";
import type { KdfParams } from "./crypto.js";
import type { AccountDirectory } from "./health.js";
import { CLOB_UPSTREAM_HOSTS } from "./clob.js";
import { createUpstream, XO_UPSTREAM_HOSTS, type AllowedHost, type Upstream } from "./upstream.js";
import type { RelayContext, RelayServices, RouteTable } from "./types.js";
import { healAtStart, prepareWiring, runUpkeep, type Wiring } from "./wiring.js";
import { routes as defaultRoutes } from "./routes.js";

// Assembles the relay (storage, audit, alerts, tripwires, capabilities, ledger, prepared items,
// upstream, server) and runs it. `pnpm relay` runs this file.
//
// Start-up refuses, with a message that names the variable and never the value, when: the data
// directory is not named, there is no relay key, the credential store is on and there is no master
// secret, or another process holds the data directory. It prints the bound address and the flag
// state, never a secret.

export interface CoreServices extends RelayServices {
  readonly config: RelayConfig;
  readonly state: RelayStorage["state"];
  readonly locks: RelayStorage["locks"];
  readonly secrets: RelayStorage["secrets"];
  readonly audit: RelayAudit;
  readonly alerts: AlertSink;
  readonly tripwires: TripwireRegistry;
  readonly capabilities: CapabilityRegistry;
  readonly flagGate: FlagGate;
  readonly ledger: DurableLedger;
  readonly prepared: PreparedStore;
  readonly upstream: Upstream;
  // Absent for the in-process relay, which has no listener and no shared key.
  readonly keyring?: RelayKeyring;
}

export interface CreateRelayOptions {
  readonly env: FlagEnv;
  // Required when the credential store is on. Never read from a file by this code.
  readonly masterSecret?: Secret;
  // Everything below is for tests and for the streams that plug into the relay.
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly fs?: FsLike;
  readonly kdf?: KdfParams;
  readonly allowWeakKdf?: boolean;
  readonly accounts?: AccountDirectory;
  readonly tripwireCheckers?: readonly TripwireChecker[];
  readonly routes?: RouteTable;
  readonly extraServices?: Partial<RelayServices>;
  readonly http?: Partial<RelayHttpConfig>;
  readonly port?: number;
  readonly newRequestId?: () => string;
  readonly hookRunner?: HookRunner;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly isProcessAlive?: (pid: number) => boolean;
  readonly extraUpstreamHosts?: readonly AllowedHost[];
  readonly compactAfterBytes?: number;
  // Background maintenance (expiring prepared items, periodic tripwire checks). On by default.
  readonly maintenance?: boolean;
  // Called once the core exists and before the listener opens (relay/wiring.ts binds the account
  // directory and the creation watcher here).
  readonly onCore?: (core: { readonly services: CoreServices; readonly flags: () => Flags }) => void;
  // Extra upkeep, run on the same 60 s round as the prepared-item sweep (relay/wiring.ts runUpkeep).
  readonly upkeep?: (context: RelayContext) => Promise<void>;
  // Which owners the listener serves for writes (relay/owners.ts). createProductionRelay sets the XO_OWNER policy;
  // a bare createRelay (tests) serves any owner.
  readonly owners?: OwnerGate;
}

export interface Relay {
  readonly url: string;
  readonly port: number;
  readonly config: RelayConfig;
  readonly services: CoreServices;
  // The effective flags, as handlers see them.
  readonly flags: () => Flags;
  readonly server: RunningServer;
  readonly recovered: { readonly interruptedSends: number; readonly tornJournalBytes: number };
  close(): Promise<void>;
  // Test hook: drop everything without an orderly shutdown, as a crash would.
  abandon(): Promise<void>;
}

// Everything the relay is except its HTTP listener: storage, audit, alerts, tripwires, facts, flags,
// ledger, prepared items and the upstream client, with start-up recovery done. createRelay puts the
// listener on top of this; the in-process relay (relay/embedded.ts) uses it without one.
export interface AssembleOptions extends CreateRelayOptions {
  // False for the in-process relay: no relay key is read or needed.
  readonly requireRelayKey?: boolean;
}

export interface AssembledCore {
  readonly config: RelayConfig;
  readonly services: CoreServices;
  readonly flags: () => Flags;
  readonly recovered: { readonly interruptedSends: number; readonly tornJournalBytes: number };
  // Orderly shutdown of everything assembled (alerts, audit, storage). The caller stops what it started on top.
  close(): Promise<void>;
  // Test hook: release file handles without flushing, as a crash would.
  abandon(): Promise<void>;
}

export async function assembleCore(options: AssembleOptions): Promise<AssembledCore> {
  const loaded = loadRelayConfig(options.env, { requireRelayKey: options.requireRelayKey !== false });
  const config = assertStartable(loaded, options.masterSecret !== undefined);
  const dataDir = config.dataDir as string;
  const now = options.now ?? Date.now;
  const keys = config.keys;
  const keyring = keys.current === undefined ? undefined : new RelayKeyring(keys.current, keys.next);
  // Everything the relay holds that must never reach a log: the keys, the master secret and the
  // Base RPC URL (which usually carries an API key in its path or query), whole and in pieces.
  const scrubList: string[] = [...(keyring?.secrets() ?? [])];
  if (options.masterSecret !== undefined) scrubList.push(options.masterSecret.reveal());
  if (config.baseRpcUrl !== undefined) {
    const rpc = config.baseRpcUrl.reveal();
    const parsed = new URL(rpc);
    scrubList.push(rpc, parsed.pathname, parsed.search, ...parsed.pathname.split("/"), ...parsed.search.slice(1).split(/[=&]/));
  }
  const scrub = (): readonly string[] => scrubList.filter((entry) => entry.length >= 8);

  const storage = await openRelayStorage({
    dir: dataDir,
    ...(options.fs === undefined ? {} : { fs: options.fs }),
    now,
    ...(config.credentialStore && options.masterSecret !== undefined ? { masterSecret: options.masterSecret } : {}),
    ...(options.kdf === undefined ? {} : { kdf: options.kdf }),
    ...(options.allowWeakKdf === true ? { allowWeakKdf: true } : {}),
    ...(options.isProcessAlive === undefined ? {} : { isProcessAlive: options.isProcessAlive }),
    ...(options.compactAfterBytes === undefined ? {} : { compactAfterBytes: options.compactAfterBytes }),
  });

  let audit: RelayAudit | undefined;
  let alertLog: RotatingLog | undefined;
  try {
    const logsDir = join(dataDir, "logs");
    audit = await createRelayAudit({ dir: logsDir, ...(options.fs === undefined ? {} : { fs: options.fs }), now, scrub });
    alertLog = new RotatingLog({ dir: logsDir, name: "alerts.log", ...(options.fs === undefined ? {} : { fs: options.fs }) });
    const alerts = createAlertSink({
      log: alertLog,
      now,
      audit,
      scrub,
      ...(config.alertHookEnabled && config.alertCommand !== undefined ? { hook: { command: config.alertCommand, ...(options.hookRunner === undefined ? {} : { run: options.hookRunner }) } } : {}),
    });
    const tripwires = await TripwireRegistry.open({ store: storage.state, now, alerts, audit, acknowledge: config.acknowledgedTripwires });
    const capabilities = await CapabilityRegistry.open({ store: storage.state, now, audit });
    const flagGate = new FlagGate({ envFlags: config.flags, armed: config.armedFlags, registry: capabilities, enforce: config.enforceFlagFacts, audit });
    const ledger = new DurableLedger({ store: storage.state, locks: storage.locks, now, limits: ledgerLimitsFrom(config, capabilities), audit });
    const prepared = new PreparedStore({ store: storage.state, now, audit });

    // The allowlist: the XO hosts, a configured Base RPC and a declared self-host, nothing else.
    // XO's hosts, the two CLOB venues' (relay/clob.ts) and whatever the caller adds (a Base RPC, a self-host).
    const hosts: AllowedHost[] = [...XO_UPSTREAM_HOSTS, ...CLOB_UPSTREAM_HOSTS, ...(options.extraUpstreamHosts ?? [])];
    if (config.baseRpcUrl !== undefined) hosts.push({ host: new URL(config.baseRpcUrl.reveal()).hostname.toLowerCase(), methods: ["GET", "POST"] });
    if (config.selfHostUrl !== undefined) {
      const url = new URL(config.selfHostUrl);
      hosts.push({ host: url.hostname.toLowerCase(), pathPrefix: url.pathname, methods: ["GET"] });
    }
    const upstream = createUpstream({
      hosts,
      now,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
      onEvent: (event) => {
        if (event.type === "requires_key") {
          void capabilities.record({ id: "UO9", state: "no", source: "probe", note: `${event.host} answered 401 or 403; the relay stops and does not look for a key.` }).catch(() => undefined);
          void alerts.raise({ id: "upstream_requires_key", severity: "critical", message: `${event.host} now asks for a key. The relay stopped sending to it and will not look for a key.` });
        } else if (event.type === "blocked") {
          void alerts.raise({ id: "upstream_blocked", severity: "critical", message: `${event.host} answered with a Cloudflare challenge. The relay stopped sending to it and will not work around it.` });
        } else if (event.type === "state") {
          void audit?.write({ ev: "upstream", host: event.host, state: event.state, outcome: event.state === "ok" ? "ok" : "refused" });
        }
      },
    });

    const services: CoreServices = {
      config,
      state: storage.state,
      locks: storage.locks,
      secrets: storage.secrets,
      audit,
      alerts,
      tripwires,
      capabilities,
      flagGate,
      ledger,
      prepared,
      upstream,
      ...(keyring === undefined ? {} : { keyring }),
      ...(options.tripwireCheckers === undefined ? {} : { tripwireCheckers: options.tripwireCheckers }),
      ...(options.accounts === undefined ? {} : { accounts: options.accounts }),
      ...options.extraServices,
    };

    // Recovery. Anything that was mid-send when the last process stopped is ambiguous and stays so.
    const interrupted = await prepared.recoverInterrupted();
    for (const record of interrupted) {
      for (const id of record.reservationIds) await ledger.markAmbiguous(id, "send interrupted by a restart").catch(() => undefined);
    }
    if (interrupted.length > 0) {
      await alerts.raise({
        id: "send_interrupted_by_restart",
        severity: "critical",
        message: `${interrupted.length} send(s) were in flight when the relay stopped. They are marked ambiguous, their reservations stay held, and nothing will be sent again for them.`,
      });
    }
    await prepared.sweep();
    await ledger.prune();

    const flags = (): Flags => flagGate.effective();
    const open = { audit, alerts };
    return {
      config,
      services,
      flags,
      recovered: { interruptedSends: interrupted.length, tornJournalBytes: storage.state.recovery.tornTailBytes },
      async close() {
        await open.alerts.close();
        await open.audit.close();
        await storage.close();
      },
      async abandon() {
        // File handles are released (a dead process would release them too); nothing is flushed,
        // renamed or removed, and the data-directory lock file stays behind.
        await open.alerts.close().catch(() => undefined);
        await open.audit.close().catch(() => undefined);
        storage.abandon();
      },
    };
  } catch (error) {
    await audit?.close().catch(() => undefined);
    await alertLog?.close().catch(() => undefined);
    await storage.close().catch(() => undefined);
    throw error;
  }
}

export async function createRelay(options: CreateRelayOptions): Promise<Relay> {
  const core = await assembleCore(options);
  const { config, services, flags } = core;
  const now = options.now ?? Date.now;
  const keyring = services.keyring as RelayKeyring;
  const audit = services.audit;
  const tripwires = services.tripwires;
  const prepared = services.prepared;
  let server: RunningServer | undefined;
  const stopper = new AbortController();
  const timers: NodeJS.Timeout[] = [];
  try {
    options.onCore?.({ services, flags });
    server = await startRelayServer({
      keyring,
      services,
      flags,
      routes: options.routes ?? defaultRoutes,
      now,
      port: options.port ?? config.port,
      http: { ...config.http, ...options.http },
      audit,
      ...(options.owners === undefined ? {} : { owners: options.owners }),
      ...(options.newRequestId === undefined ? {} : { newRequestId: options.newRequestId }),
    });

    if (options.maintenance !== false) {
      timers.push(
        setInterval(() => {
          void prepared.sweep().catch(() => undefined);
          const upkeep = options.upkeep;
          if (upkeep !== undefined) void upkeep({ flags, now, requestId: "req_maintenance", signal: stopper.signal, services }).catch(() => undefined);
        }, 60_000),
      );
      const checkers = options.tripwireCheckers ?? [];
      if (checkers.length > 0) {
        timers.push(
          setInterval(() => {
            void tripwires.recheck(checkers).catch(() => undefined);
          }, config.tripwireIntervalS * 1000),
        );
      }
      for (const timer of timers) timer.unref();
    }

    await audit.write({
      ev: "startup",
      outcome: "ok",
      state: tripwires.isTripped() ? "tripwire_active" : "ready",
      note: `port ${server.port}; kill ${flags().KILL ? "on" : "off"}; ${config.enforceFlagFacts ? "flag facts enforced" : "flag facts NOT enforced"}; user agent ${RELAY_USER_AGENT}`,
      sync: true,
    });

    const running = server;
    const stopTimers = (): void => {
      for (const timer of timers) clearInterval(timer);
      stopper.abort();
    };
    return {
      url: running.origin,
      port: running.port,
      config,
      services,
      flags,
      server: running,
      recovered: core.recovered,
      async close() {
        stopTimers();
        await audit.write({ ev: "shutdown", outcome: "ok", sync: true });
        await running.close();
        await core.close();
      },
      async abandon() {
        stopTimers();
        await running.close({ graceMs: 0 });
        await core.abandon();
      },
    };
  } catch (error) {
    for (const timer of timers) clearInterval(timer);
    stopper.abort();
    await server?.close({ graceMs: 0 }).catch(() => undefined);
    await core.close().catch(() => undefined);
    throw error;
  }
}

// The relay as `pnpm relay` runs it: createRelay plus the pieces that make it serve the whole contract
// (relay/wiring.ts): the account directory, the XO request signer, the userop options, the creation
// watcher, the upkeep rounds and the start-up credential heal. The in-process relay (relay/embedded.ts)
// uses the same wiring. Anything the caller passes (accounts, extraServices, tripwire checkers) replaces
// or extends the default, so a test can still build a bare relay with createRelay.
export async function createProductionRelay(options: CreateRelayOptions): Promise<Relay> {
  const now = options.now ?? Date.now;
  const wiring: Wiring = prepareWiring({
    env: options.env,
    now,
    ...(options.accounts === undefined ? {} : { accounts: options.accounts }),
    ...(options.extraServices === undefined ? {} : { extraServices: options.extraServices }),
    ...(options.maintenance === false ? { creationIntervalMs: 0 } : {}),
  });
  const checkers = options.tripwireCheckers ?? [];
  // The owner policy needs the relay's state, which exists once the core is assembled (before the listener opens).
  let policy: OwnerPolicy | undefined;
  const owners: OwnerGate = options.owners ?? {
    checkRoute: (route, owner) => {
      if (policy === undefined) throw new RelayError("internal", "The owner policy is not ready.");
      policy.checkRoute(route, owner);
    },
    // Not ready means nothing is served yet: fail closed.
    serves: (owner) => policy?.serves(owner) ?? false,
    bindAfterSubmit: (preparedId) => policy?.bindAfterSubmit(preparedId) ?? Promise.resolve(),
  };
  let relay: Relay;
  try {
    relay = await createRelay({
      onCore: (core) => {
        policy = OwnerPolicy.open(options.env, core.services);
        wiring.bind(core);
      },
      upkeep: (context) => runUpkeep(context, checkers),
      ...options,
      accounts: wiring.accounts,
      extraServices: wiring.extraServices,
      owners,
    });
  } catch (error) {
    wiring.stop();
    throw error;
  }
  await healAtStart({ flags: relay.flags, now, requestId: "req_startup", signal: new AbortController().signal, services: relay.services });
  return {
    ...relay,
    async close() {
      wiring.stop();
      await relay.close();
    },
    async abandon() {
      wiring.stop();
      await relay.abandon();
    },
  };
}

// ---- the command line -------------------------------------------------------------------------------------------

const USAGE = `Usage: pnpm relay [--check] [--help]

Starts the XO relay on 127.0.0.1. Configuration is read from the environment:
  RELAY_DATA_DIR        directory for state (required, no default)
  XO_RELAY_KEY          shared key the plugin sends in X-Relay-Key (required)
  XO_RELAY_KEY_NEXT     a second accepted key while the first is being rotated out
  RELAY_MASTER_KEY      master secret for the credential store (or be asked on a terminal)
  RELAY_PORT            port to bind (default 8787; 0 picks a free one)
  RELAY_CREDENTIAL_STORE=off   run without the credential store (no master secret needed)
  XO_OWNER              the wallet(s) this relay serves for writes (else the first owner whose signature is accepted;
                        XO_ALLOW_ANY_OWNER=1 serves every owner). Funding needs XO_OWNER or an earlier signed action.
  ENABLE_* / XO_ENABLE_CREATE / KILL   write switches (all off by default)
  RELAY_ARM             comma list of write flags to arm for a live test run
--check validates the configuration and exits without starting.
Nothing here prints a secret.
`;

export interface MainIo {
  readonly stdout?: { write(text: string): unknown };
  readonly stderr?: { write(text: string): unknown };
  readonly prompt?: MasterSecretPrompt;
  // Resolves when the process should stop. Defaults to SIGINT/SIGTERM.
  readonly stopSignal?: Promise<void>;
  // Receives the running relay once it is up (tests use it to find the port).
  readonly onStarted?: (relay: Relay) => void;
  readonly createOptions?: Partial<CreateRelayOptions>;
}

async function keyringExists(dataDir: string): Promise<boolean> {
  try {
    await stat(join(dataDir, "secrets", "keyring.json"));
    return true;
  } catch {
    return false;
  }
}

export async function main(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, io: MainIo = {}): Promise<number> {
  const out = io.stdout ?? process.stdout;
  const err = io.stderr ?? process.stderr;
  if (argv.includes("--help") || argv.includes("-h")) {
    out.write(USAGE);
    return 0;
  }
  const check = argv.includes("--check");

  const loaded = loadRelayConfig(env);
  for (const issue of loaded.issues) err.write(`${issue.fatal ? "error" : "warning"}: ${issue.variable}: ${issue.message}\n`);
  if (loaded.fatal.length > 0) return 2;
  const config = loaded.config;

  let masterSecret: Secret | undefined;
  if (config.credentialStore) {
    const prompt = io.prompt ?? createTtyPrompt();
    const resolved = await resolveMasterSecret(env, [config.keys.current, config.keys.next], prompt, !(await keyringExists(config.dataDir as string)));
    if (!resolved.ok) {
      err.write(`error: ${RELAY_ENV.masterKey}: ${resolved.message}\n`);
      return 2;
    }
    masterSecret = resolved.secret;
    // The secret now lives only in memory. Take it out of the environment this process hands on.
    if (env === process.env) delete process.env[RELAY_ENV.masterKey];
  }

  if (check) {
    for (const line of describeConfig(config, config.flags)) out.write(`${line}\n`);
    out.write("configuration is valid\n");
    return 0;
  }

  let relay: Relay;
  try {
    relay = await createProductionRelay({ env, ...(masterSecret === undefined ? {} : { masterSecret }), ...io.createOptions });
  } catch (error) {
    if (error instanceof RelayConfigError) {
      for (const issue of error.issues) err.write(`error: ${issue.variable}: ${issue.message}\n`);
    } else {
      // Fixed text plus the error's class; the message could carry a path or a value.
      err.write(`error: the relay could not start (${error instanceof Error ? (error as { code?: string }).code ?? error.name : "unknown"}).\n`);
    }
    return 1;
  }

  out.write(`xo relay listening on ${relay.url}\n`);
  for (const line of describeConfig(relay.config, relay.flags())) out.write(`${line}\n`);
  if (relay.recovered.interruptedSends > 0) out.write(`warning: ${relay.recovered.interruptedSends} interrupted send(s) are held as ambiguous\n`);
  io.onStarted?.(relay);

  // SIGUSR2 switches every write off at once, without a restart. SIGINT and SIGTERM stop gracefully.
  const onKill = (): void => {
    void relay.services.flagGate.engageKill("operator signal");
    out.write("kill switch engaged by signal\n");
  };
  let stop: () => void = () => undefined;
  const stopped = io.stopSignal ?? new Promise<void>((resolve) => (stop = resolve));
  if (io.stopSignal === undefined) {
    process.once("SIGINT", () => stop());
    process.once("SIGTERM", () => stop());
    process.on("SIGUSR2", onKill);
  }
  await stopped;
  process.off("SIGUSR2", onKill);
  out.write("shutting down\n");
  await relay.close();
  return 0;
}

// Runs only when this file is the program (`pnpm relay`). The name check matters for bundles: in
// dist/local.mjs this module is bundled in, import.meta.url is the bundle's and equals argv[1], and
// without the check the bundle would start the HTTP relay instead of the MCP server.
if (process.argv[1] !== undefined && /(?:^|[\\/])main\.(?:ts|js|mjs)$/.test(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
