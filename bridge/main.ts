import { mkdir, open, rename, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import type { CockpitContext, CockpitHandle } from "../src/local/cli.js";
import type { LocalStatus } from "../src/local/runtime.js";
import { AGENT_TOKEN_PREFIX, AgentTokenStore, Auth, COCKPIT_DIR_NAME, DEFAULT_AGENT_SCOPES, ScopeListError, parseScopeList, type Clock, type InstanceRole, type RandomBytes } from "./auth.js";
import { attachEffectiveFlags } from "./arming.js";
import { MCP_PATH, type TokenScope } from "./contract.js";
import { createEmbeddedRelayClient } from "../src/relay/client.js";
import { attachRelayRuntime, inboxOf } from "./inbox.js";
import { restoreInbox } from "./inbox-restore.js";
import { killControllerOf } from "./kill.js";
import { startDaemon, type BridgeModuleSource, type Daemon, type DaemonStartError } from "./server.js";
import { createStaticSite, defaultAppDir, type StaticSite } from "./static.js";
import { attachStatusRuntime } from "./status.js";
import { toolGateOf } from "./tool-classes.js";

// Entry point of the Cockpit daemon: `node dist/local.mjs serve [options]` loads this module and calls
// startCockpit (the contract is in src/local/cli.ts: listen on loopback before resolving, never write to
// stdout, never throw a message that quotes a request).
//
//   serve [--agent-scope read,prepare[,submit]] [--rotate-agent-token] [--app-dir <absolute path>] [--port N]
//
//   --agent-scope        the ceiling of the agent token (default read,prepare). `submit` is still refused
//                        unless an ARM window is open. S1 signing (the agent submits) needs it.
//   --rotate-agent-token replace the stored agent token; the old one stops working. The new one is printed
//                        once, on stderr.
//   --app-dir            serve a Cockpit build from another absolute path (default: app/dist/cockpit
//                        next to this program).
//   --port               listen on a fixed port instead of a random free one. Host and Origin are pinned to
//                        whichever port is used. A stable port lets an MCP client keep its endpoint URL.
//
// Everything operators read goes to stderr. The pairing link (with its secret fragment) and a new agent token
// are printed there and nowhere else.

export class CockpitStartError extends Error {
  readonly code: "usage" | "module_load_failed" | "listen_failed" | "module_failed" | "route_invalid" | "start_failed";
  constructor(code: CockpitStartError["code"]) {
    super(code);
    this.name = "CockpitStartError";
    this.code = code;
  }
}

export interface CockpitArgs {
  readonly agentScopes: readonly TokenScope[];
  readonly rotateAgentToken: boolean;
  readonly appDir: string | undefined;
  readonly port: number;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

function takeValue(args: readonly string[], index: number, name: string): { readonly value: string; readonly next: number } {
  const arg = args[index] as string;
  const eq = arg.indexOf("=");
  if (eq !== -1) return { value: arg.slice(eq + 1), next: index + 1 };
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new UsageError(`${name} needs a value.`);
  return { value, next: index + 2 };
}

export function parseCockpitArgs(args: readonly string[]): CockpitArgs {
  let agentScopes: readonly TokenScope[] = DEFAULT_AGENT_SCOPES;
  let rotateAgentToken = false;
  let appDir: string | undefined;
  let port = 0;
  let index = 0;
  while (index < args.length) {
    const arg = args[index] as string;
    const name = arg.split("=")[0];
    if (name === "--rotate-agent-token" && !arg.includes("=")) {
      rotateAgentToken = true;
      index += 1;
    } else if (name === "--agent-scope") {
      const taken = takeValue(args, index, "--agent-scope");
      try {
        agentScopes = parseScopeList(taken.value);
      } catch (error) {
        throw new UsageError(error instanceof ScopeListError ? error.message : "--agent-scope is not usable.");
      }
      index = taken.next;
    } else if (name === "--app-dir") {
      const taken = takeValue(args, index, "--app-dir");
      if (!isAbsolute(taken.value)) throw new UsageError("--app-dir must be an absolute path.");
      appDir = taken.value;
      index = taken.next;
    } else if (name === "--port") {
      const taken = takeValue(args, index, "--port");
      const parsed = Number(taken.value);
      if (!/^\d{4,5}$/.test(taken.value) || !Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) throw new UsageError("--port must be a number from 1024 to 65535.");
      port = parsed;
      index = taken.next;
    } else {
      throw new UsageError("Unknown option for `serve`. Options: --agent-scope, --rotate-agent-token, --app-dir, --port.");
    }
  }
  return { agentScopes, rotateAgentToken, appDir, port };
}

// ---- optional route modules ----------------------------------------------------------------------------------------------

// The other bridge streams' files, in registration order (the audit adapter first, so the sink is attached
// before anything else emits). Each may export `bridgeModule` (a BridgeModule or a factory). A file that is
// absent is skipped; a file that is present and fails to load stops the daemon (a half-registered daemon
// would run without a guard or a route its page expects). A file with no `bridgeModule` is a library and is
// skipped.
interface ModuleLoader {
  readonly name: string;
  readonly load: () => Promise<unknown>;
}

// Each import sits in its own try block on purpose: esbuild then treats a file that does not exist yet as a
// warning instead of a build error, so `pnpm build:local` works while another stream has not delivered
// its file. The runtime error is still thrown by import() and is judged by loadOptionalModules.
const OPTIONAL_MODULES: readonly ModuleLoader[] = [
  {
    name: "audit-adapter",
    load: async () => {
      try {
        return await import("./audit-adapter.js");
      } catch (error) {
        throw error;
      }
    },
  },
  {
    name: "tool-classes",
    load: async () => {
      try {
        return await import("./tool-classes.js");
      } catch (error) {
        throw error;
      }
    },
  },
  {
    name: "arming",
    load: async () => {
      try {
        return await import("./arming.js");
      } catch (error) {
        throw error;
      }
    },
  },
  {
    name: "kill",
    load: async () => {
      try {
        return await import("./kill.js");
      } catch (error) {
        throw error;
      }
    },
  },
  {
    name: "proxy",
    load: async () => {
      try {
        return await import("./proxy.js");
      } catch (error) {
        throw error;
      }
    },
  },
  {
    name: "events",
    load: async () => {
      try {
        return await import("./events.js");
      } catch (error) {
        throw error;
      }
    },
  },
  {
    name: "status",
    load: async () => {
      try {
        return await import("./status.js");
      } catch (error) {
        throw error;
      }
    },
  },
  {
    name: "inbox",
    load: async () => {
      try {
        return await import("./inbox.js");
      } catch (error) {
        throw error;
      }
    },
  },
  {
    name: "paybox-signer",
    load: async () => {
      try {
        return await import("./paybox-signer.js");
      } catch (error) {
        throw error;
      }
    },
  },
];

export const OPTIONAL_MODULE_NAMES: readonly string[] = OPTIONAL_MODULES.map((entry) => entry.name);

// "Cannot find module '/x/proxy.js' imported from ..." names the file that is missing; only a miss of the
// module's own file counts as absent, not a miss of something it imports.
function missingFile(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || (error as { code?: unknown }).code !== "ERR_MODULE_NOT_FOUND") return undefined;
  const message = (error as { message?: unknown }).message;
  const match = typeof message === "string" ? /Cannot find (?:module|package) '([^']+)'/.exec(message) : null;
  return match?.[1];
}

export async function loadOptionalModules(
  loaders: readonly ModuleLoader[] = OPTIONAL_MODULES,
): Promise<readonly { readonly name: string; readonly source: BridgeModuleSource }[]> {
  const out: { readonly name: string; readonly source: BridgeModuleSource }[] = [];
  for (const loader of loaders) {
    let loaded: unknown;
    try {
      loaded = await loader.load();
    } catch (error) {
      const missing = missingFile(error);
      if (missing !== undefined && new RegExp(`(?:^|[\\\\/])${loader.name}(?:\\.[a-z]+)?$`).test(missing)) continue;
      throw new CockpitStartError("module_load_failed");
    }
    const exported = (loaded as { bridgeModule?: unknown } | null)?.bridgeModule;
    if (typeof exported === "function" || (typeof exported === "object" && exported !== null)) {
      out.push({ name: loader.name, source: exported as BridgeModuleSource });
    }
  }
  return out;
}

// ---- the daemon's own files in the data directory ---------------------------------------------------------------------------

export const DAEMON_INFO_FILE = "daemon.json";

// <data dir>/cockpit/daemon.json tells a local helper (the stdio shim) where the running daemon listens. It
// holds no secret: the version, the process number, the port and the start time. Written only by the instance
// that owns the data directory, removed when it stops.
async function writeDaemonInfo(dir: string, info: { readonly version: string; readonly port: number; readonly started_at: string }): Promise<() => Promise<void>> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, DAEMON_INFO_FILE);
  const temp = `${file}.tmp-${process.pid}`;
  const handle = await open(temp, "w", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify({ ...info, pid: process.pid })}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, file);
  return async () => {
    await rm(file, { force: true }).catch(() => undefined);
  };
}

// ---- start --------------------------------------------------------------------------------------------------------------------

export interface CockpitOverrides {
  // Replaces the optional-module discovery (tests).
  readonly modules?: readonly { readonly name: string; readonly source: BridgeModuleSource }[];
  readonly site?: StaticSite;
  readonly clock?: Clock;
  readonly random?: RandomBytes;
}

export interface CockpitDaemonHandle extends CockpitHandle {
  readonly daemon: Daemon;
  readonly role: InstanceRole;
}

function roleOf(status: LocalStatus): InstanceRole {
  return status.state === "ready" ? "writer" : "read_only";
}

function readOnlyReason(status: LocalStatus): string {
  if (status.state === "failed") {
    return status.code === "data_dir_locked"
      ? "another xo-market process owns the data directory, so this one serves reads only"
      : `the local relay did not start (${status.code}), so this instance serves reads only`;
  }
  return "the local relay is not running, so this instance serves reads only";
}

// The joins between the daemon's modules and the in-process relay that no single module owns:
//   - the inbox reads the relay's prepared records and the audit adapter writes the relay's audit log;
//   - the kill latch also learns of a kill the relay engaged on its own (SIGUSR2, the environment), so the status
//     bar shows KILLED without a refused write first;
//   - a prepared item in a settled tool answer (any class except submit) is offered to the inbox, which checks it
//     against the relay's record and rebuilds it before it is listed.
// (After this, startCockpitDaemon restores the inbox items that were in flight before a restart.)
// Each is a no-op on a read-only instance: there is no relay, so no record, no sink and no kill to learn of.
function joinRelay(daemon: Daemon, context: CockpitContext): void {
  const host = daemon.host;
  attachRelayRuntime(host, context.runtime);
  attachStatusRuntime(host, context.runtime);
  // The ARM window and the S2 signer ask the relay which write flags are really on (the environment's request AND the
  // capability fact or RELAY_ARM), not the raw environment. No relay, or one that cannot answer: every flag is off.
  attachEffectiveFlags(host, () => {
    try {
      const status = context.runtime.status();
      const relay = status.state === "ready" ? status.relay : undefined;
      return typeof relay?.flags === "function" ? relay.flags() : undefined;
    } catch {
      return undefined;
    }
  });
  killControllerOf(host).observe(() => {
    try {
      const status = context.runtime.status();
      return status.state === "ready" && status.relay.services.flagGate.killEngaged === true;
    } catch {
      return false;
    }
  });
  toolGateOf(host).onResult((event) => {
    if (event.toolClass === "submit" || event.outcome !== "ok") return;
    inboxOf(host).ingestToolResult(event.structured, event.principal.requestedBy);
  });
}

export async function startCockpitDaemon(context: CockpitContext, overrides: CockpitOverrides = {}): Promise<CockpitDaemonHandle> {
  const stderr = context.stderr;
  let args: CockpitArgs;
  try {
    args = parseCockpitArgs(context.args);
  } catch (error) {
    stderr.write(`error: ${error instanceof UsageError ? error.message : "The options for `serve` could not be read."}\n`);
    throw new CockpitStartError("usage");
  }

  // The relay decides who owns the data directory. Waiting for it here (it never rejects) means the role is
  // settled before the first token is minted; the listening socket opens right after.
  const status = await context.runtime.start();
  const role = roleOf(status);
  let currentRole: InstanceRole = role;
  const roleNow = (): InstanceRole => (context.runtime.status().state === "ready" ? currentRole : "read_only");

  const dataDir = status.state === "ready" ? status.dataDir : status.state === "failed" ? status.dataDir : null;
  const cockpitDir = dataDir === null ? null : join(dataDir, COCKPIT_DIR_NAME);

  // The agent token. A writer keeps (or creates, or rotates) it; a read-only instance only reads the stored
  // hash and never writes to a directory it does not own.
  let agentHash: { readonly id: string; readonly sha256: string } | undefined;
  let newAgentToken: string | undefined;
  if (cockpitDir !== null) {
    const store = new AgentTokenStore({ dir: cockpitDir, ...(overrides.random === undefined ? {} : { random: overrides.random }), ...(overrides.clock === undefined ? {} : { clock: overrides.clock }) });
    try {
      if (role === "writer") {
        const ensured = await store.ensure(args.rotateAgentToken);
        agentHash = ensured.hash;
        newAgentToken = ensured.token;
        if (ensured.tightened === true) stderr.write("xo-market cockpit: agent-token.json was readable by others; it is now 0600.\n");
      } else {
        agentHash = await store.peek();
        if (args.rotateAgentToken) stderr.write("xo-market cockpit: --rotate-agent-token ignored: this instance does not own the data directory.\n");
      }
    } catch {
      stderr.write("xo-market cockpit: the agent token file could not be read or written; agent access is off for this run.\n");
    }
  } else if (args.rotateAgentToken) {
    stderr.write("xo-market cockpit: --rotate-agent-token ignored: there is no data directory.\n");
  }

  const auth = new Auth({
    instance: roleNow,
    agentScopes: args.agentScopes,
    ...(agentHash === undefined ? {} : { agentHash }),
    ...(overrides.clock === undefined ? {} : { clock: overrides.clock }),
    ...(overrides.random === undefined ? {} : { random: overrides.random }),
  });

  const site = overrides.site ?? createStaticSite(args.appDir ?? defaultAppDir());
  let modules: readonly { readonly name: string; readonly source: BridgeModuleSource }[];
  try {
    modules = overrides.modules ?? (await loadOptionalModules());
  } catch (error) {
    stderr.write("error: a Cockpit module failed to load, so the daemon was not started.\n");
    throw error instanceof CockpitStartError ? error : new CockpitStartError("module_load_failed");
  }

  let daemon: Daemon;
  try {
    daemon = await startDaemon({
      version: context.version,
      stderr,
      env: context.env,
      port: args.port,
      auth,
      site,
      modules,
      dataDir: () => dataDir,
      engageKill: context.engageKill,
      ...(overrides.clock === undefined ? {} : { clock: overrides.clock }),
      ...(overrides.random === undefined ? {} : { random: overrides.random }),
    });
  } catch (error) {
    const code = (error as Partial<DaemonStartError> | null)?.code;
    const name = (error as Partial<DaemonStartError> | null)?.module;
    stderr.write(`error: the Cockpit daemon could not start${code === undefined ? "" : ` (${code}${name === undefined ? "" : `: ${name}`})`}.\n`);
    throw new CockpitStartError(code === "listen_failed" || code === "module_failed" || code === "route_invalid" ? code : "start_failed");
  }

  joinRelay(daemon, context);

  // The inbox items that were in flight when the daemon last stopped: their ids are kept in <cockpit dir>/inbox-ids.json
  // and each is read back from the relay (GET /v1/prepared/{id}) and checked like a freshly prepared item, or dropped
  // with a reason on stderr (bridge/inbox-restore.ts). Only the writer keeps the list: a read-only instance has no
  // relay to read back from and never writes to a directory it does not own.
  if (role === "writer" && cockpitDir !== null) {
    await restoreInbox(daemon.host, { dir: cockpitDir, relay: createEmbeddedRelayClient(context.runtime.handler) });
  }

  let removeInfo: (() => Promise<void>) | undefined;
  if (role === "writer" && cockpitDir !== null) {
    try {
      removeInfo = await writeDaemonInfo(cockpitDir, { version: context.version, port: daemon.port, started_at: new Date((overrides.clock ?? Date.now)()).toISOString() });
    } catch {
      stderr.write("xo-market cockpit: daemon.json could not be written; a helper will not find this daemon by itself.\n");
    }
  }

  const hasMcp = daemon.host.routes().some((route) => route.key === `POST ${MCP_PATH}`);
  const lines = [
    `xo-market cockpit ${context.version}: listening on ${daemon.origin} (loopback only; Host and Origin are pinned to it)`,
    role === "writer" ? "  mode:   writer (owns the data directory)" : `  mode:   READ ONLY: ${readOnlyReason(status)}. Nothing can be prepared or sent from here.`,
    `  agent:  ${hasMcp ? `MCP endpoint ${daemon.origin}${MCP_PATH}` : "no MCP endpoint in this build"}; ceiling scopes: ${auth.agentScopes.join(", ")}${auth.agentScopes.includes("submit") ? " (a submit also needs an open ARM window)" : ""}`,
  ];
  stderr.write(`${lines.join("\n")}\n`);
  if (newAgentToken !== undefined) {
    stderr.write(
      `xo-market cockpit: NEW AGENT TOKEN (shown once; only its hash is stored). Give it to your MCP client as a bearer token (${AGENT_TOKEN_PREFIX}...):\n  ${newAgentToken}\n`,
    );
  } else if (auth.hasAgentToken()) {
    stderr.write("xo-market cockpit: the stored agent token is in use (restart with --rotate-agent-token to replace it).\n");
  }
  if (!(await site.available())) {
    stderr.write(`xo-market cockpit: the Cockpit app is not built (app/dist/cockpit/index.html is missing).${hasMcp ? " The agent endpoint still works." : ""} Build the page with: pnpm --dir app run build:cockpit\n`);
  }
  daemon.announcePairing({ force: true });

  let closed: Promise<void> | undefined;
  return {
    daemon,
    role,
    close: () =>
      (closed ??= (async () => {
        currentRole = "read_only";
        await daemon.close();
        await removeInfo?.();
      })()),
  };
}

export async function startCockpit(context: CockpitContext): Promise<CockpitHandle> {
  return startCockpitDaemon(context);
}
