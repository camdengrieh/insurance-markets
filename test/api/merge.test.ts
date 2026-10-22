import assert from "node:assert/strict";
import { test } from "node:test";

import { API_LIMITS } from "../../api/config.js";
import type { ServingPolicy } from "../../api/serving.js";
import { SqliteIndexStore } from "../../api/store.js";
import { POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_CTF_EXCHANGE } from "../../sdk/chain/polymarket/constants.js";
import type { FetchLike } from "../../sdk/model.js";
import { apiServability } from "../../sdk/venues/licence.js";
import { fakeVenue, json } from "../../sdk/venues/testkit/index.js";
import { Clock, forbiddenFetch, polymarketFixtures, startHarness, testConfig } from "./helpers.js";

// Index fields merged with venue rows, field by field (docs/sdk-and-api-design.md sections 6 and 7). No venue on a chain
// the index reads is served today (XO, Polymarket and Limitless have no licence class), so this test serves Polymarket
// through a TEST policy that stands in for a class someone may record later; main.ts never takes a policy. The rows are
// Polymarket's recorded Gamma answer (sdk/venues/polymarket/fixtures); the index rows are written by the test, in the
// shape the indexer writes them, for the recorded markets' own condition and token ids.

const NOW = Date.parse("2026-10-22T12:03:00.000Z");
const TEST_POLICY: ServingPolicy = {
  servability: (venue) => (venue === "polymarket" ? { served: true, licence: "open", dataTerms: "none_found" } : apiServability(venue)),
};

function roomy() {
  const config = testConfig();
  return { ...config, limits: { ...API_LIMITS, markets: { capacity: 1_000, refillPerSecond: 1 } } };
}

test("rows carry the last trade and the settlement from the index, each with its source and age, beside the venue's fields", async () => {
  const fixtures = await polymarketFixtures();
  const clock = new Clock(NOW);
  let state: "ok" | "blocked_page" = "ok";
  const ok = fakeVenue("ok", { [fixtures.listUrl]: json(fixtures.listBody) }, { venue: "polymarket", nowMs: clock.read });
  const blocked = fakeVenue("blocked_page", () => null, { venue: "polymarket", nowMs: clock.read });
  const fetch: FetchLike = (input, init) => (state === "ok" ? ok.raw(input, init) : blocked.raw(input, init));
  const store = SqliteIndexStore.open(":memory:");
  const h = await startHarness({ config: roomy(), policy: TEST_POLICY, store, fetchFor: (venue) => (venue === "polymarket" ? fetch : forbiddenFetch(venue, [])), clock });
  try {
    const first = await h.get("/v1/markets?venue=polymarket");
    assert.equal(first.status, 200);
    const rows = first.json["markets"] as Array<Record<string, unknown>>;
    assert.ok(rows.length >= 1);
    const row = rows[0] as Record<string, unknown>;
    const outcomes = row["outcomes"] as Array<Record<string, unknown>>;
    const conditionId = String(row["marketId"]).toLowerCase();
    const yes = String(outcomes[0]?.["tokenId"]);
    // Before the index has anything: null with the reason, never zero and never "unresolved".
    assert.equal(outcomes[0]?.["lastTrade"], null);
    assert.match(String((outcomes[0]?.["lastTradeSource"] as Record<string, unknown>)["reason"]), /has not started/);
    const fields0 = row["fields"] as Record<string, Record<string, unknown>>;
    assert.equal(fields0["resolution"]?.["source"], null);

    // The index reads a range holding a fill of the Yes token and the condition's resolution.
    store.initCursor(137, 95_961_279n, `0x${"11".repeat(32)}`, 1_792_000_000, NOW);
    const indexedMs = NOW + 1_000;
    store.applyRange({
      chainId: 137,
      fromBlock: 95_961_280n,
      toBlock: 95_961_282n,
      toHash: `0x${"22".repeat(32)}`,
      toTimeS: 1_792_000_006,
      fills: [{ chainId: 137, exchange: POLYMARKET_CTF_EXCHANGE.toLowerCase(), txHash: `0x${"33".repeat(32)}`, logIndex: 4, block: 95_961_281n, tokenId: yes, side: "buy", maker: `0x${"44".repeat(20)}`, taker: `0x${"55".repeat(20)}`, makerAmount: "3240000", takerAmount: "5000000", fee: "0", timeLoS: 1_792_000_000, timeHiS: 1_792_000_006, indexedMs }],
      resolutions: [{ chainId: 137, ledger: POLYMARKET_CONDITIONAL_TOKENS.toLowerCase(), conditionId, kind: "ctf", payouts: ["1", "0"], denominator: "1", oracle: `0x${"66".repeat(20)}`, questionId: `0x${"77".repeat(32)}`, block: 95_961_282n, txHash: `0x${"88".repeat(32)}`, logIndex: 9, timeLoS: 1_792_000_000, timeHiS: 1_792_000_006, indexedMs }],
      preparations: [],
      undecoded: 0,
      dropped: 0,
      indexedMs,
    });
    clock.advance(5_000);
    const second = await h.get("/v1/markets?venue=polymarket");
    const merged = (second.json["markets"] as Array<Record<string, unknown>>).find((r) => String(r["marketId"]).toLowerCase() === conditionId) as Record<string, unknown>;
    const mergedOutcomes = merged["outcomes"] as Array<Record<string, unknown>>;
    assert.deepEqual(mergedOutcomes[0]?.["lastTrade"], {
      price: "0.648",
      side: "buy",
      shares: "5",
      collateral: "3.24",
      block: "95961281",
      txHash: `0x${"33".repeat(32)}`,
      exchange: POLYMARKET_CTF_EXCHANGE.toLowerCase(),
      tradedBetweenUtc: [new Date(1_792_000_000_000).toISOString(), new Date(1_792_000_006_000).toISOString()],
    });
    assert.deepEqual(mergedOutcomes[0]?.["lastTradeSource"], { source: "chain", asOfMs: indexedMs, ageMs: 4_000, via: "Polygon 137 OrderFilled, block 95961281" });
    assert.equal(mergedOutcomes[1]?.["lastTrade"], null);
    assert.deepEqual(merged["resolution"], { state: "resolved", payouts: ["1", "0"], denominator: "1", winningIndex: 0 });
    assert.equal(merged["status"], "resolved");
    const fields = merged["fields"] as Record<string, Record<string, unknown>>;
    assert.equal(fields["resolution"]?.["source"], "chain");
    assert.equal(fields["status"]?.["source"], "chain");
    // The rest of the row is the venue's, read 5 s ago: cache with its age, never live.
    assert.equal(fields["title"]?.["source"], "cache");
    assert.equal(fields["title"]?.["ageMs"], 5_000);

    // The venue then serves a web page where data was expected: its rows stay, with every chain field, and the fields
    // only the venue holds are null with the reason.
    state = "blocked_page";
    clock.advance(60_000);
    const third = await h.get("/v1/markets?venue=polymarket");
    const kept = (third.json["markets"] as Array<Record<string, unknown>>).find((r) => String(r["marketId"]).toLowerCase() === conditionId) as Record<string, unknown>;
    const keptFields = kept["fields"] as Record<string, Record<string, unknown>>;
    assert.equal(keptFields["displayPrice"]?.["source"], null);
    assert.match(String(keptFields["displayPrice"]?.["reason"]), /Polymarket blocked our reads at .*web page/);
    assert.equal(keptFields["resolution"]?.["source"], "chain");
    assert.equal(((kept["outcomes"] as Array<Record<string, unknown>>)[0]?.["lastTradeSource"] as Record<string, unknown>)["source"], "chain");
    assert.equal(blocked.calls.length, 1);
  } finally {
    await h.close();
  }
});
