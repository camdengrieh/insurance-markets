// The program the end-to-end suites start: the real Cockpit daemon (bridge/main.ts, every route module it
// discovers, the built Cockpit app) next to the local mock XO, in one process. Nothing here reaches the network.
//
//   node --import tsx bridge/test/e2e/daemon-main.ts [--data-dir <abs>] [--read-only] [--no-hostile] [--no-mock] [serve options]
//
// What is real: the HTTP front, Host and Origin pinning, pairing, tokens, the allowlist and read proxy, the SSE feed, the
// tool-class guard, ARM and kill, the audit adapter, the static server and the security headers.
// What is a stand-in: the relay runtime (a stub that says "ready" and has no relay), so no tool call, prepare or sign
// can happen; and the read proxy's upstream, which is a fetch that serves only the mock XO's two loopback
// listeners and refuses every other host (it prints a `blocked` line for each refusal).
//
// stdout is a protocol for the harness, one JSON object per line: {event:"ready"|"blocked"|"closed", ...}. stderr is
// the daemon's own, unchanged (that is where the pairing link and the agent token are printed).

import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CockpitContext } from "../../../src/local/cli.js";
import type { LocalRuntime, LocalStatus } from "../../../src/local/runtime.js";
import { startMockXo, type MockXo } from "../../../test/mock-xo/server.js";
import { loadOptionalModules, startCockpitDaemon } from "../../main.js";
import { createProxyModule, type UpstreamFetch } from "../../proxy.js";
import { HOSTILE_CASES } from "./corpus.js";

function emit(value: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

// Nothing in this process may reach a host outside 127.0.0.1: not the proxy, and not a plugin tool that the daemon runs
// in-process either. The global fetch is replaced by one that refuses (and says so on stdout); the proxy's own upstream
// below is built on the original, behind its own loopback check.
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const host = new URL(raw).hostname;
  if (host !== "127.0.0.1") {
    emit({ event: "blocked", host });
    return Promise.reject(new TypeError("refused: only 127.0.0.1 is reachable from the e2e daemon"));
  }
  return realFetch(input, init);
}) as typeof fetch;

interface Own {
  readonly dataDir: string | undefined;
  readonly readOnly: boolean;
  readonly hostile: boolean;
  readonly mock: boolean;
  readonly rest: readonly string[];
}

function parseOwn(argv: readonly string[]): Own {
  let dataDir: string | undefined;
  let readOnly = false;
  let hostile = true;
  let mock = true;
  const rest: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === "--data-dir") {
      dataDir = argv[index + 1];
      index += 1;
    } else if (arg === "--read-only") readOnly = true;
    else if (arg === "--no-hostile") hostile = false;
    else if (arg === "--no-mock") mock = false;
    else rest.push(arg);
  }
  return { dataDir, readOnly, hostile, mock, rest };
}

async function main(): Promise<void> {
  const own = parseOwn(process.argv.slice(2));
  const dataDir = own.dataDir ?? (await mkdtemp(join(tmpdir(), "cockpit-e2e-")));
  await mkdir(dataDir, { recursive: true, mode: 0o700 });

  let mockXo: MockXo | undefined;
  const hostile: { id: string; title: string; conditionId: string; slug: string }[] = [];
  if (own.mock) {
    const started = await startMockXo({ chains: false });
    if (!started.ok) {
      emit({ event: "unavailable", reason: started.reason });
      process.exitCode = 2;
      return;
    }
    mockXo = started.mock;
    if (own.hostile) {
      for (const item of HOSTILE_CASES) {
        const market = mockXo.state.addMarket({ seed: `hostile-${item.id}`, title: item.title, kind: "clob", status: "ACTIVE", midTicks: 500 });
        hostile.push({ id: item.id, title: item.title, conditionId: market.conditionId, slug: market.slug });
      }
    }
  }

  // The proxy's only upstream: the mock's loopback listeners. Anything else is refused and reported.
  const allowed = new Set<string>();
  const origins: Record<string, string> = {};
  if (mockXo !== undefined) {
    origins["xo_data"] = mockXo.urls.dataApi;
    origins["xo_orderbook"] = mockXo.urls.orderbook;
    allowed.add(new URL(mockXo.urls.dataApi).host);
    allowed.add(new URL(mockXo.urls.orderbook).host);
  }
  const upstream: UpstreamFetch = async (url, init) => {
    const host = new URL(url).host;
    if (!allowed.has(host)) {
      emit({ event: "blocked", host });
      throw new Error("refused: not a mock listener");
    }
    return realFetch(url, init);
  };

  const status: LocalStatus = own.readOnly
    ? { state: "failed", code: "data_dir_locked", message: "locked by another process", dataDir }
    : { state: "ready", dataDir, dataDirCreated: false, relay: {} as never, masterKey: null };
  let killed = 0;
  const runtime: LocalRuntime = {
    handler: async () => ({ status: 200, bodyText: "{}" }),
    status: () => status,
    start: async () => status,
    close: async () => undefined,
  };
  const context: CockpitContext = {
    args: own.rest,
    env: {},
    runtime,
    version: "0.0.0-e2e",
    stderr: process.stderr,
    engageKill: async () => {
      killed += 1;
      emit({ event: "kill", count: killed });
      return true;
    },
  };

  // The daemon discovers its real modules; the proxy is swapped for one that points at the mock.
  const discovered = await loadOptionalModules();
  const modules = discovered.map((entry) => (entry.name === "proxy" ? { name: "proxy", source: createProxyModule({ fetch: upstream, origins }) } : entry));
  const handle = await startCockpitDaemon(context, { modules });

  emit({
    event: "ready",
    pid: process.pid,
    port: handle.daemon.port,
    origin: handle.daemon.origin,
    role: handle.role,
    dataDir,
    modules: modules.map((entry) => entry.name),
    mock: mockXo === undefined ? null : { dataApi: mockXo.urls.dataApi, orderbook: mockXo.urls.orderbook },
    hostile,
  });

  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  await handle.close();
  await mockXo?.stop();
  emit({ event: "closed" });
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error: unknown) => {
    process.stderr.write(`e2e daemon failed: ${error instanceof Error ? error.name : "error"}\n`);
    process.exit(1);
  },
);
