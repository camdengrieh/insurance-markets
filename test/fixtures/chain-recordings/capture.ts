// One-time recording of the chain readers' JSON-RPC traffic (sdk/chain/fixtures/scenarios.ts), from the public RPCs
// the dApp itself uses (sdk/venues/origins.ts: rpc_polygon, rpc_base, xo_rpc). Run it by hand, never from a test:
//
//   pnpm exec tsx test/fixtures/chain-recordings/capture.ts            (prints the plan, makes no request)
//   pnpm exec tsx test/fixtures/chain-recordings/capture.ts --run      (makes the requests)
//
// Each scenario runs the SDK's own readers through the one JSON-RPC port, over a transport that records every request
// and answer, and writes sdk/chain/<venue>/fixtures/recorded_<date>.json. Read-only methods only (the port's
// allowlist), batched where the node allows, the fixed User-Agent below and no other identifying header, no key; a
// 401, 403 or 429 stops the run.
//
// The holder whose positions are read is the maker of the first buy in the recorded block's OrderFilled logs: an
// address taken from the venue exchange's own public event logs, never one looked up anywhere else.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { FetchLike } from "../../../sdk/model.js";
import { createRpcPort, rpcPostFromFetch, type RpcPort } from "../../../sdk/chain/rpc.js";
import { recordingPost, type RecordedExchange, type Recording } from "../../../sdk/chain/fixtures/replay.js";
import { limitlessScenario, polymarketScenario, SCENARIO_METHODS, xoScenario, type ScenarioResult } from "../../../sdk/chain/fixtures/scenarios.js";
import { POLYGON_RPC_URL } from "../../../sdk/chain/polymarket/constants.js";
import { BASE_RPC_URL } from "../../../sdk/chain/limitless/constants.js";
import { XO_RPC_URL } from "../../../sdk/chain/xo/pins.js";

const USER_AGENT = "insurance-markets-research/0.1";
const CAPTURED_AT = "2026-10-22";
const SDK_CHAIN = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "sdk", "chain");

const liveFetch: FetchLike = async (input, init) => {
  const response = await fetch(input, {
    method: init?.method ?? "GET",
    redirect: "error",
    headers: { ...(init?.headers ?? {}), "user-agent": USER_AGENT },
    ...(init?.body === undefined ? {} : { body: init.body }),
    signal: AbortSignal.timeout(40_000),
  });
  if (response.status === 401 || response.status === 403 || response.status === 429) throw new Error(`HTTP ${String(response.status)}: stop, do not look for a key or retry`);
  return { ok: response.ok, status: response.status, headers: { get: (name) => response.headers.get(name) }, json: () => response.json() as Promise<unknown>, text: () => response.text() };
};

const SCENARIOS: ReadonlyArray<{ readonly venue: string; readonly url: string; readonly run: (port: RpcPort) => Promise<ScenarioResult> }> = [
  { venue: "polymarket", url: POLYGON_RPC_URL, run: (port) => polymarketScenario(port) },
  { venue: "limitless", url: BASE_RPC_URL, run: (port) => limitlessScenario(port) },
  { venue: "xo", url: XO_RPC_URL, run: (port) => xoScenario(port) },
];

async function main(): Promise<void> {
  if (!process.argv.includes("--run")) {
    for (const scenario of SCENARIOS) console.log(`plan: ${scenario.venue} over ${scenario.url}`);
    console.log("Pass --run to make the requests.");
    return;
  }
  for (const scenario of SCENARIOS) {
    const exchanges: RecordedExchange[] = [];
    const port = createRpcPort({ url: scenario.url, post: recordingPost(rpcPostFromFetch(liveFetch, { maxBodyChars: 4_000_000 }), exchanges), methods: SCENARIO_METHODS, maxResultChars: 4_000_000 });
    const result = await scenario.run(port);
    const recording: Recording = {
      source: `the readers of sdk/chain run once by test/fixtures/chain-recordings/capture.ts against ${scenario.url} (read-only JSON-RPC, User-Agent ${USER_AGENT})`,
      rpc: scenario.url,
      captured_at: CAPTURED_AT,
      inputs: result.inputs,
      exchanges,
    };
    const file = join(SDK_CHAIN, scenario.venue, "fixtures", `recorded_${CAPTURED_AT}.json`);
    writeFileSync(file, `${JSON.stringify(recording, null, 1)}\n`);
    console.log(
      `${scenario.venue}: block ${result.inputs.block}, ${String(result.fills.length)} fills, holder ${result.holder === null ? "none" : "from a fill"}, ${String(result.targets.length)} targets, ` +
        `${String(result.positions?.positions.filter((p) => p.balance !== null && p.balance > 0n).length ?? 0)} non-zero, refused ${String(result.positions?.refused.length ?? 0)}, ` +
        `scan ${String(result.scan?.tokenIds.length ?? 0)} ids complete ${String(result.scan?.complete)}, ${String(exchanges.length)} exchanges`,
    );
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
