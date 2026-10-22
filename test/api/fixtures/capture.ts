// Records the JSON-RPC exchanges of ONE indexer pass per chain, for test/api/indexer.test.ts to replay. Run by hand:
//
//   tsx test/api/fixtures/capture.ts
//
// It reads public chain data only (the venues' own pinned contracts' logs, block headers and code), through the API's
// own honest fetch (User-Agent insurance-markets-api/0.1), over the SDK's public RPCs, a handful of requests per chain.
// The block ranges are the ones the SDK's chain recordings already read (sdk/chain/<venue>/fixtures), so the same fills
// and resolutions appear. Exchanges another recording already holds with the same answer are left out of this file: the
// SDK's chain recordings, and the pinned contracts' runtime code (test/fixtures/chain-bytecode). The test replays all of
// them (recorded.ts).

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CHAIN_SPECS, type ChainSpec } from "../../../api/indexer/chains.js";
import { ChainIndexer } from "../../../api/indexer/indexer.js";
import { RpcPool } from "../../../api/indexer/rpc-pool.js";
import { SqliteIndexStore } from "../../../api/store.js";
import { createHonestFetch } from "../../../api/upstream.js";
import { DEFAULT_RPC, type ChainConfig, type ChainKey } from "../../../api/config.js";
import { createRpcPort, rpcPostFromFetch } from "../../../sdk/chain/rpc.js";
import { recordingPost, type RecordedExchange } from "../../../sdk/chain/fixtures/replay.js";
import { knownExchanges } from "./recorded.js";

const HERE = dirname(fileURLToPath(import.meta.url));

// The pass each chain's recording holds: where the index starts, how many blocks it reads in its one range.
export const CAPTURE_INPUTS: Readonly<Record<ChainKey, { readonly startBlock: string; readonly span: number }>> = {
  // The SDK's Polymarket recording read OrderFilled at block 95961282.
  polygon: { startBlock: "95961280", span: 3 },
  // The SDK's Limitless recording read five ConditionResolution logs in 52928761..52928960.
  base: { startBlock: "52928761", span: 200 },
  // The SDK's XO recording read OrderFilled in 12792617..12792636.
  xo: { startBlock: "12792617", span: 20 },
};

export const INDEXER_METHODS = ["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getLogs", "eth_getCode", "eth_getStorageAt"] as const;

export function captureSpec(chain: ChainKey): ChainSpec {
  return { ...CHAIN_SPECS[chain], initialSpan: CAPTURE_INPUTS[chain].span, maxSpan: CAPTURE_INPUTS[chain].span };
}

export function captureConfig(chain: ChainKey, rpc: string): ChainConfig {
  return { chain, rpcUrls: [rpc], startBlock: BigInt(CAPTURE_INPUTS[chain].startBlock), confirmations: 64 };
}

const keyOf = (e: { method: string; params: unknown }): string => JSON.stringify([e.method, e.params]);

async function capture(chain: ChainKey): Promise<{ rpc: string; exchanges: RecordedExchange[] }> {
  const rpc = DEFAULT_RPC[chain][0] as string;
  const sink: RecordedExchange[] = [];
  const honest = createHonestFetch({ fetchImpl: globalThis.fetch });
  const nowMs = Date.now;
  const port = createRpcPort({ url: rpc, post: recordingPost(rpcPostFromFetch(honest, { nowMs, maxBodyChars: 8_000_000 }), sink), methods: [...INDEXER_METHODS], maxLogBlockRange: 10_000n });
  const store = SqliteIndexStore.open(":memory:");
  const indexer = new ChainIndexer({ spec: captureSpec(chain), config: captureConfig(chain, rpc), store, pool: new RpcPool(CHAIN_SPECS[chain].chainId, [port], nowMs), nowMs, maxRangesPerPass: 1, log: (line) => console.log(line) });
  await indexer.pass();
  const status = indexer.status();
  console.log(chain, status.state, status.reason, status.cursorBlock, store.counts());
  if (status.state === "rpc_failed" || status.state === "pin_failed") throw new Error(`${chain}: ${status.state}`);
  const known = new Map(knownExchanges(chain).map((e) => [keyOf(e), JSON.stringify(e.response)]));
  const own = sink.filter((e) => known.get(keyOf(e)) !== JSON.stringify(e.response));
  store.close();
  return { rpc, exchanges: own };
}

async function main(): Promise<void> {
  const out: Record<string, unknown> = {
    source:
      "One ChainIndexer pass per chain, recorded by test/api/fixtures/capture.ts through the API's honest fetch over the SDK's public RPCs. Exchanges already in the SDK's chain recordings with the same answer are left out; the test replays both.",
    captured_at: new Date().toISOString().slice(0, 10),
    chains: {},
  };
  for (const chain of ["polygon", "base", "xo"] as const) {
    const recorded = await capture(chain);
    (out["chains"] as Record<string, unknown>)[chain] = { rpc: recorded.rpc, inputs: CAPTURE_INPUTS[chain], exchanges: recorded.exchanges };
  }
  writeFileSync(join(HERE, "indexer-recorded_2026-10-22.json"), `${JSON.stringify(out)}\n`);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) await main();
