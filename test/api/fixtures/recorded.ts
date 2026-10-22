import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ChainKey } from "../../../api/config.js";
import type { RecordedExchange, Recording } from "../../../sdk/chain/fixtures/replay.js";

// The JSON-RPC answers the indexer test replays: this folder's recording of one indexer pass per chain
// (indexer-recorded_2026-10-22.json, written by capture.ts), plus what other recordings already hold: the SDK's chain
// recording of the same venue (sdk/chain/<venue>/fixtures) and the pinned contracts' runtime code read on 2026-10-22
// (test/fixtures/chain-bytecode, re-hashed against the pins by test/chain-pins.test.ts).

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");

const SDK_RECORDING: Readonly<Record<ChainKey, string>> = { polygon: "polymarket", base: "limitless", xo: "xo" };

export interface IndexerRecording {
  readonly rpc: string;
  readonly inputs: { readonly startBlock: string; readonly span: number };
  readonly exchanges: readonly RecordedExchange[];
}

export function knownExchanges(chain: ChainKey): RecordedExchange[] {
  const sdk = JSON.parse(readFileSync(join(REPO, "sdk", "chain", SDK_RECORDING[chain], "fixtures", "recorded_2026-10-22.json"), "utf8")) as Recording;
  const dir = join(REPO, "test", "fixtures", "chain-bytecode", chain);
  const code = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const sidecar = JSON.parse(readFileSync(join(dir, file), "utf8")) as { readonly address: string };
      const hex = readFileSync(join(dir, file.replace(/\.json$/, ".hex")), "utf8").trim().toLowerCase();
      return { method: "eth_getCode", params: [sidecar.address, "latest"], response: { result: hex } };
    });
  return [...sdk.exchanges, ...code];
}

export function indexerRecording(chain: ChainKey): IndexerRecording {
  const all = JSON.parse(readFileSync(join(HERE, "indexer-recorded_2026-10-22.json"), "utf8")) as { readonly chains: Record<ChainKey, IndexerRecording> };
  return all.chains[chain];
}

// Every answer the replay may give for a chain: this folder's recording first.
export function replayExchanges(chain: ChainKey): RecordedExchange[] {
  return [...knownExchanges(chain), ...indexerRecording(chain).exchanges];
}
