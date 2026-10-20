import { access } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { useEmbeddedRelay } from "../relay/client.js";
import { parseFlags, type FlagEnv } from "../relay/flags.js";
import { OWNER_ENV } from "../../relay/embedded.js";
import { parseOwner } from "../xo/account/derive.js";
import { DATA_DIR_ENV, LocalPathError, resolveDataDir } from "./paths.js";
import { MASTER_KEY_ENV, MASTER_KEY_FILE, MASTER_KEY_NEXT_ENV, MasterKeyError, rotateMasterKey } from "./master-key.js";
import { createLocalRuntime, describeStartFailure, LOCAL_VERSION, type LocalRuntime, type LocalRuntimeOptions } from "./runtime.js";
import { createLocalMcpServer } from "./server.js";

// Command line of dist/local.mjs.
//
//   node dist/local.mjs                       serve MCP over stdio (what an MCP client runs)
//   node dist/local.mjs check                 say what would be used, without creating or opening anything
//   node dist/local.mjs rotate-master-key     re-seal the stored credentials under a new master key
//   node dist/local.mjs serve [options]       run the Cockpit daemon (bridge/main) on the same runtime
//   node dist/local.mjs shim [options]        stdio MCP front for a running Cockpit daemon (bridge/shim): holds no relay
//   node dist/local.mjs --help | --version
//
// stdout belongs to the MCP protocol while serving; everything human-readable goes to stderr there.
// SIGUSR2 engages the relay's one-way kill switch at runtime (both serving modes); SIGINT and SIGTERM stop.

const USAGE = `xo-market local mode ${LOCAL_VERSION}

Usage:
  node dist/local.mjs                      serve the MCP tools over stdio (the relay runs inside this process)
  node dist/local.mjs check                show the data directory and settings; creates and opens nothing
  node dist/local.mjs rotate-master-key    re-seal stored credentials under a new master key (stop the server first)
  node dist/local.mjs serve [options]      run the Cockpit daemon (loopback web UI and agent terminal) in this process;
                                           needs a build that includes it, otherwise it says so and exits 1
  node dist/local.mjs shim [options]       serve the MCP tools over stdio by forwarding each call to the running Cockpit
                                           daemon (no relay, ledger or key in this process); see shim --help

Settings (environment variables):
  XO_DATA_DIR        state directory (absolute path). Default: your OS's per-user data directory.
  XO_MASTER_KEY      master key for the credential store (16 to 1024 characters). Default: a random
                     key kept in master.key inside the data directory, mode 0600.
  XO_MASTER_KEY_NEXT the new key for rotate-master-key (required with XO_MASTER_KEY; optional with a key file)
  XO_OWNER           the wallet address(es) this process serves. Default: the first wallet that signs.
  XO_ALLOW_ANY_OWNER=1   serve any wallet (each one is kept apart)
  ENABLE_USEROP_SUBMIT, ENABLE_TRADING, ENABLE_FUNDING, ENABLE_WITHDRAW, XO_ENABLE_CREATE   write paths (all off)
  XO_KILL_SWITCH=1   refuse every write
  kill -USR2 <pid>   engage the kill switch of a running process (one way: only a restart lifts it)
  XO_MAX_ORDER_USD, XO_MAX_DAILY_USD   caps (default 10 and 50)
Caps are advisory against a compromised or prompt-injected agent. Use a dedicated PayBox credential as the
XO owner, and prefer approval-gated signing.
`;

interface Io {
  readonly stdout: { write(text: string): unknown };
  readonly stderr: { write(text: string): unknown };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function check(env: FlagEnv, io: Io): Promise<number> {
  let dataDir: string;
  try {
    dataDir = resolveDataDir(env);
  } catch (error) {
    io.stderr.write(`error: ${error instanceof LocalPathError ? error.message : "the data directory could not be resolved"}\n`);
    return 2;
  }
  const flags = parseFlags(env);
  const on = Object.entries(flags.flags).filter(([, value]) => value === true).map(([name]) => name);
  let ownerLine = "the first wallet whose signature is accepted";
  const ownerRaw = typeof env[OWNER_ENV] === "string" ? (env[OWNER_ENV] as string).trim() : "";
  if (ownerRaw !== "") {
    try {
      const parts = ownerRaw.split(/[\s,]+/).filter((part) => part !== "");
      for (const part of parts) parseOwner(part);
      ownerLine = `${parts.length} wallet(s) named in ${OWNER_ENV}`;
    } catch {
      io.stderr.write(`error: ${OWNER_ENV} holds a value that is not a usable wallet address\n`);
      return 2;
    }
  }
  const hasKeyFile = await exists(join(dataDir, MASTER_KEY_FILE));
  const envKey = typeof env[MASTER_KEY_ENV] === "string" && (env[MASTER_KEY_ENV] as string) !== "";
  io.stdout.write(
    [
      `xo-market local mode ${LOCAL_VERSION}`,
      `data dir:   ${dataDir} (${(await exists(dataDir)) ? "exists" : "will be created, mode 0700"})`,
      `master key: ${envKey ? `${MASTER_KEY_ENV} from the environment` : hasKeyFile ? "key file in the data directory" : "a key file will be created in the data directory"}`,
      `owner:      ${ownerLine}`,
      `write flags on: ${on.length === 0 ? "none (all off)" : on.join(", ")}`,
      ...flags.issues.map((issue) => `warning:    ${issue.variable}: ${issue.message}`),
      "",
    ].join("\n"),
  );
  return 0;
}

async function rotate(env: FlagEnv, io: Io): Promise<number> {
  try {
    const dataDir = resolveDataDir(env);
    const result = await rotateMasterKey({ env, dataDir });
    if (result.alreadyRotated) {
      io.stdout.write(`The data directory is already under the new key. Set ${MASTER_KEY_ENV} to the value you gave as ${MASTER_KEY_NEXT_ENV}.\n`);
    } else if (result.source === "env") {
      io.stdout.write(`Re-sealed ${result.secrets} secret(s) for ${result.accounts} account(s). From now on set ${MASTER_KEY_ENV} to the value you gave as ${MASTER_KEY_NEXT_ENV}; the old value no longer opens anything.\n`);
    } else {
      io.stdout.write(`Re-sealed ${result.secrets} secret(s) for ${result.accounts} account(s) under a new random key kept in ${MASTER_KEY_FILE}. The old key no longer opens anything.\n`);
    }
    return 0;
  } catch (error) {
    if (error instanceof MasterKeyError || error instanceof LocalPathError) io.stderr.write(`error: ${error.message}\n`);
    else io.stderr.write(`error: ${describeStartFailure(error).message}\n`);
    return 1;
  }
}

// ---- the Cockpit hook (ask A1) -------------------------------------------------------------------------------------------------------
//
// `serve` hands the running local runtime to bridge/main.ts, which is owned by the Cockpit stream and
// is loaded only now, so a plain `node dist/local.mjs` never evaluates a line of it. The contract:
//
//   bridge/main.ts exports  startCockpit(context: CockpitContext): Promise<CockpitHandle>
//
// It must start listening (loopback only) before it resolves, must not write to stdout, and must never
// throw a message that quotes a request. close() stops it and releases its sockets; the CLI then closes
// the runtime. The daemon calls context.engageKill for POST /ui/kill: the same one-way switch SIGUSR2 uses.

export interface CockpitContext {
  // Arguments after `serve`, unparsed.
  readonly args: readonly string[];
  // The environment with the master key variables removed (the runtime has its own copy).
  readonly env: FlagEnv;
  readonly runtime: LocalRuntime;
  readonly version: string;
  readonly stderr: { write(text: string): unknown };
  // Engages the relay's kill switch. Resolves true when it is latched, false when no relay is running
  // (then nothing can write anyway). Never rejects.
  engageKill(reason: string): Promise<boolean>;
}

export interface CockpitHandle {
  close(): Promise<void>;
}

export type StartCockpit = (context: CockpitContext) => Promise<CockpitHandle>;

type CockpitLoad =
  | { readonly kind: "ready"; readonly start: StartCockpit }
  | { readonly kind: "absent" }
  | { readonly kind: "broken"; readonly reason: string };

function isModuleNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ERR_MODULE_NOT_FOUND";
}

// `override` (a module path or file URL) exists for tests; production passes nothing and gets bridge/main.
async function loadCockpit(override: string | undefined): Promise<CockpitLoad> {
  let loaded: unknown;
  try {
    if (override !== undefined) {
      loaded = await import(isAbsolute(override) ? pathToFileURL(override).href : override);
    } else {
      // scripts/build-local.mjs swaps in an empty stub if bridge/main.ts is ever absent; tsx raises
      // ERR_MODULE_NOT_FOUND then. The module is type-checked like any other.
      loaded = await import("../../bridge/main.js");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Missing is only "the entry itself is missing"; a missing import inside it is a broken module.
    if (isModuleNotFound(error) && (override !== undefined ? message.includes(override) : /bridge[\\/]main/.test(message))) return { kind: "absent" };
    return { kind: "broken", reason: error instanceof Error ? String((error as { code?: unknown }).code ?? error.name).slice(0, 40) : "unknown" };
  }
  const start = (loaded as { startCockpit?: unknown } | null)?.startCockpit;
  if (typeof start !== "function") return { kind: "absent" };
  return { kind: "ready", start: start as StartCockpit };
}

// ---- runtime kill (R6) and signals -----------------------------------------------------------------------------------------------------

// Latches the relay's kill switch (the same call the standalone relay's SIGUSR2 makes). If the relay is
// still starting, waits for it, so a kill sent in the first seconds is not lost.
async function engageRuntimeKill(runtime: LocalRuntime, reason: string): Promise<boolean> {
  try {
    // start() is idempotent and never rejects; calling it also covers a kill that arrives before the relay began.
    const status = await runtime.start();
    if (status.state !== "ready") return false;
    await status.relay.services.flagGate.engageKill(reason);
    return true;
  } catch {
    // The latch is set before the audit write, so a failed audit write still leaves the switch on.
    return runtime.status().state === "ready";
  }
}

export interface SignalSource {
  once(signal: NodeJS.Signals, listener: () => void): unknown;
  on(signal: NodeJS.Signals, listener: () => void): unknown;
}

function watchSignals(signals: SignalSource, io: Io, runtime: LocalRuntime, stop: () => void): void {
  signals.once("SIGINT", stop);
  signals.once("SIGTERM", stop);
  try {
    // Not available on Windows; there the kill is the Cockpit's button or a restart with XO_KILL_SWITCH=1.
    signals.on("SIGUSR2", () => {
      void engageRuntimeKill(runtime, "operator signal").then((engaged) => {
        io.stderr.write(engaged ? "xo-market: kill switch engaged by signal; every write is refused until restart\n" : "xo-market: kill signal received, but no relay is running (nothing can write)\n");
      });
    });
  } catch {
    io.stderr.write("xo-market: this platform has no SIGUSR2; the kill switch cannot be engaged by signal\n");
  }
}

export interface CliDeps {
  // Tests: a module path (or file URL) used instead of bridge/main.
  readonly cockpitModule?: string;
  // Tests: injected clock, fetch, KDF cost and so on for the runtime.
  readonly runtime?: Partial<Omit<LocalRuntimeOptions, "env" | "stderr">>;
  readonly signals?: SignalSource;
  readonly exit?: (code: number) => void;
  // Tests: how long a daemon may take to close before the process exits 1 anyway (default 10 s).
  readonly stopGraceMs?: number;
}

// The runtime keeps its own copy of the environment; the master key leaves this process's own
// environment so nothing that process spawns inherits it.
function takeEnvironment(env: FlagEnv): { readonly snapshot: FlagEnv; readonly visible: FlagEnv } {
  const snapshot: FlagEnv = { ...env };
  delete process.env[MASTER_KEY_ENV];
  delete process.env[MASTER_KEY_NEXT_ENV];
  const visible: FlagEnv = Object.fromEntries(Object.entries(snapshot).filter(([name]) => name !== MASTER_KEY_ENV && name !== MASTER_KEY_NEXT_ENV));
  return { snapshot, visible };
}

function serve(env: FlagEnv, io: Io, deps: CliDeps): void {
  const { snapshot } = takeEnvironment(env);
  const runtime = createLocalRuntime({ env: snapshot, stderr: io.stderr, ...deps.runtime });
  useEmbeddedRelay(runtime.handler);
  const handle = serveStdio(createLocalMcpServer, {
    onerror: (error) => {
      // The class of the problem only: a message could quote a request.
      io.stderr.write(`xo-market: protocol error (${error.name})\n`);
    },
  });
  void runtime.start();

  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    void (async () => {
      await runtime.close().catch(() => undefined);
      await handle.close().catch(() => undefined);
      process.exit(0);
    })();
  };
  watchSignals(deps.signals ?? process, io, runtime, stop);
  process.stdin.once("end", stop);
  process.stdin.once("close", stop);
}

const COCKPIT_STOP_GRACE_MS = 10_000;

async function serveCockpit(args: readonly string[], env: FlagEnv, io: Io, deps: CliDeps): Promise<number | undefined> {
  // Load first: with no daemon in this build nothing is created on disk and nothing listens.
  const loaded = await loadCockpit(deps.cockpitModule);
  if (loaded.kind === "absent") {
    io.stderr.write("error: this build has no Cockpit daemon (bridge/main is not part of it), so `serve` has nothing to run. The stdio MCP server (no command) is unaffected.\n");
    return 1;
  }
  if (loaded.kind === "broken") {
    io.stderr.write(`error: the Cockpit daemon could not be loaded (${loaded.reason}). Nothing was started.\n`);
    return 1;
  }
  const { snapshot, visible } = takeEnvironment(env);
  const runtime = createLocalRuntime({ env: snapshot, stderr: io.stderr, ...deps.runtime });
  // The tools the daemon serves reach the relay through this process-wide client, as in stdio mode.
  useEmbeddedRelay(runtime.handler);
  let handle: CockpitHandle;
  try {
    handle = await loaded.start({
      args,
      env: visible,
      runtime,
      version: LOCAL_VERSION,
      stderr: io.stderr,
      engageKill: (reason) => engageRuntimeKill(runtime, reason),
    });
  } catch (error) {
    // Name and code only: a message from the daemon could quote a request.
    const name = error instanceof Error ? String((error as { code?: unknown }).code ?? error.name).slice(0, 40) : "unknown";
    io.stderr.write(`error: the Cockpit daemon could not start (${name}). Nothing is listening.\n`);
    useEmbeddedRelay(undefined);
    await runtime.close().catch(() => undefined);
    return 1;
  }
  void runtime.start();

  const exit = deps.exit ?? ((code: number): void => process.exit(code));
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    void (async () => {
      // A daemon that will not close must not keep a stopped session alive.
      const timer = setTimeout(() => exit(1), deps.stopGraceMs ?? COCKPIT_STOP_GRACE_MS);
      timer.unref?.();
      await handle.close().catch(() => undefined);
      await runtime.close().catch(() => undefined);
      clearTimeout(timer);
      exit(0);
    })();
  };
  // No stdin watch here: the Cockpit is not on stdio, and a detached session has no stdin.
  watchSignals(deps.signals ?? process, io, runtime, stop);
  return undefined;
}

// `shim`: the stdio MCP server an agent host launches when the Cockpit daemon (not this process) owns the relay. It
// forwards each tool call to the daemon with the agent token and never starts a relay of its own.
async function runShim(args: readonly string[], env: FlagEnv, io: Io): Promise<number | undefined> {
  let module: typeof import("../../bridge/shim.js");
  try {
    module = await import("../../bridge/shim.js");
  } catch {
    io.stderr.write("error: this build has no stdio shim (bridge/shim is not part of it).\n");
    return 1;
  }
  const result = await module.runShimCli(args, env, io);
  if ("exit" in result) return result.exit;
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    void result.handle.close().catch(() => undefined).finally(() => process.exit(0));
  };
  process.stdin.once("end", stop);
  process.stdin.once("close", stop);
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return undefined;
}

// Returns an exit code for the one-shot commands, or undefined when the process is now serving.
export async function runCli(
  argv: readonly string[],
  env: FlagEnv = process.env,
  io: Io = { stdout: process.stdout, stderr: process.stderr },
  deps: CliDeps = {},
): Promise<number | undefined> {
  const [command] = argv;
  if (command === "--help" || command === "-h" || command === "help") {
    io.stdout.write(USAGE);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    io.stdout.write(`${LOCAL_VERSION}\n`);
    return 0;
  }
  if (command === "check") return check(env, io);
  if (command === "rotate-master-key") return rotate(env, io);
  if (command === "serve") return serveCockpit(argv.slice(1), env, io, deps);
  if (command === "shim") return runShim(argv.slice(1), env, io);
  if (command !== undefined) {
    io.stderr.write(`unknown command; see --help\n`);
    return 2;
  }
  serve(env, io, deps);
  return undefined;
}

export { DATA_DIR_ENV };
