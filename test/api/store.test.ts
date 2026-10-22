import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { toEventSelector, type AbiEvent } from "viem";

import { CONDITION_PREPARATION_ABI, CONDITION_PREPARATION_TOPIC } from "../../api/indexer/events.js";
import { SqliteIndexStore, type FillRow } from "../../api/store.js";

// The index store's contract (every implementation keeps it), and the one event fragment the API adds to the SDK's.

function fill(block: bigint, logIndex: number, tokenId = "7"): FillRow {
  return { chainId: 3223, exchange: "0xexchange", txHash: `0x${block.toString(16)}${logIndex}`, logIndex, block, tokenId, side: "buy", maker: "0xm", taker: "0xt", makerAmount: "500000", takerAmount: "1000000", fee: "0", timeLoS: 1, timeHiS: 2, indexedMs: 10 };
}

test("a range is written with its cursor or not at all, and must follow the cursor", () => {
  const store = SqliteIndexStore.open(":memory:");
  store.initCursor(3223, 99n, `0x${"aa".repeat(32)}`, 1, 0);
  const base = { chainId: 3223, toHash: `0x${"bb".repeat(32)}`, toTimeS: 2, resolutions: [], preparations: [], undecoded: 0, dropped: 0, indexedMs: 10 };
  assert.throws(() => store.applyRange({ ...base, fromBlock: 101n, toBlock: 110n, fills: [] }), /does not follow/);
  store.applyRange({ ...base, fromBlock: 100n, toBlock: 110n, fills: [fill(105n, 1), fill(105n, 3), fill(104n, 9)] });
  assert.equal(store.cursor(3223)?.block, 110n);
  assert.equal(store.lastFills(3223, ["7"]).get("7")?.logIndex, 3, "the newest fill by block, then log index");
  store.applyRange({ ...base, fromBlock: 111n, toBlock: 120n, fills: [fill(115n, 0)], undecoded: 2 });
  assert.equal(store.incompleteRanges(3223), 1);
  // A rewind keeps blocks up to its block and deletes every row above it.
  const deleted = store.rewind(3223, 105n, `0x${"cc".repeat(32)}`, 3, 20);
  assert.equal(deleted, 1);
  assert.equal(store.cursor(3223)?.block, 105n);
  assert.equal(store.incompleteRanges(3223), 0);
  assert.equal(store.counts().fills, 3);
  assert.throws(() => store.rewind(3223, 200n, `0x${"cc".repeat(32)}`, 3, 20), /cannot move forward/);
  // Fills are pruned by when they were indexed; nothing else is.
  assert.equal(store.pruneFills(11), 3);
  store.close();
});

test("ConditionPreparation is the verified ABI's event", () => {
  const excerpt = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "verified-abi-condition-preparation_2026-10-22.json"), "utf8")) as { contracts: Array<{ entries: AbiEvent[] }> };
  assert.equal(excerpt.contracts.length, 2);
  for (const contract of excerpt.contracts) {
    assert.equal(contract.entries.length, 1);
    assert.equal(toEventSelector(contract.entries[0] as AbiEvent), CONDITION_PREPARATION_TOPIC);
  }
  assert.equal(toEventSelector(CONDITION_PREPARATION_ABI[0]), CONDITION_PREPARATION_TOPIC);
});
