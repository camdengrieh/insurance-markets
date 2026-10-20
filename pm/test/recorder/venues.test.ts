import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { COLLECTORS } from "../../recorder/venues/index.js";
import { canonDec, canonPrice, fromBaseUnits, parseSides } from "../../recorder/venues/common.js";
import { buildSnapshot } from "../../recorder/collector.js";
import { HOSTILE } from "./helpers.js";
import { XoClient } from "../../../src/xo/client.js";

// Recorded public payloads kept by the research notes; read-only inputs for the parsers.
const FIX = join(dirname(fileURLToPath(import.meta.url)), "../../../docs/research/fixtures");
const fx = (p: string): unknown => JSON.parse(readFileSync(join(FIX, p), "utf8")) as unknown;
const NOW = Date.parse("2026-10-19T00:00:00Z");

test("canonical decimals reject signs, exponents, junk and out-of-range prices", () => {
  assert.equal(canonDec("0.500"), "0.5");
  assert.equal(canonDec("010.50"), "10.5");
  assert.equal(canonDec(0.899), "0.899");
  for (const bad of ["-1", "+1", "1e-7", "1E3", "0x10", " ", "", "NaN", "Infinity", null, undefined, {}, [], "1,5", ".5", "5."]) assert.equal(canonDec(bad as never), null, String(bad));
  assert.equal(canonDec(1e-7), null, "a number whose text has an exponent is refused");
  for (const bad of ["0", "1", "0.0", "1.5", "-0.1", "abc"]) assert.equal(canonPrice(bad), null, bad);
  assert.equal(canonPrice("0.001"), "0.001");
  assert.equal(fromBaseUnits(150000000, 6), "150");
  assert.equal(fromBaseUnits(863898323, 6), "863.898323");
  assert.equal(fromBaseUnits("12362000", 6), "12.362");
  assert.equal(fromBaseUnits(1.5, 6), null);
  assert.equal(fromBaseUnits(-1, 6), null);
  assert.equal(fromBaseUnits(2 ** 60, 6), null);
});

test("parseSides sorts, truncates, merges nothing silently and raises flags", () => {
  const r = parseSides(
    [{ price: "0.30", size: "5" }, { price: "0.35", size: "7" }, { price: "abc", size: "1" }, { price: "1.2", size: "1" }, { price: "0.2", size: "0" }],
    [{ price: "0.34", size: "2" }, { price: "0.36", size: "3" }, { price: "0.36", size: "4" }],
    "best_first",
    2,
  );
  assert.deepEqual(r.bids, [["0.35", "7"], ["0.3", "5"]]);
  assert.deepEqual(r.asks, [["0.34", "2"], ["0.36", "3"]]);
  assert.ok(r.flags.includes("bad_level"));
  assert.ok(r.flags.includes("unsorted_input"), "bids were ascending but the venue says best first");
  assert.ok(r.flags.includes("duplicate_price"));
  assert.ok(r.flags.includes("truncated"));
  assert.ok(r.flags.includes("crossed"), "best bid 0.35 is above best ask 0.34");
  assert.equal(r.nBids, 2);
  assert.equal(r.nAsks, 3);
  const empty = parseSides([], [], "best_first", 5);
  assert.deepEqual(empty.flags, ["empty_asks", "empty_bids"]);
});

test("XO: market state and book from recorded payloads", () => {
  const c = COLLECTORS.xo;
  const plan = c.resolvePlan("0xabc");
  assert.deepEqual(plan.map((p) => `${p.host}${p.path}`), ["api-mainnet.xo.market/api/markets/contract/0xabc"]);
  const r = c.parseResolve([fx("xo/data-market-by-contract-pulse.json")], NOW, "0xabc");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const raw = fx("xo/data-market-by-contract-pulse.json") as { outcomes: { index: number; outcomeTokenId: string }[] };
  assert.equal(r.value.tokenId, raw.outcomes.find((o) => o.index === 0)?.outcomeTokenId);
  assert.equal(r.value.status, "expired", "ACTIVE with a past expiresAt is not tradable");
  assert.equal(r.value.closeMs, Date.parse("2026-10-18T17:55:00.000Z"));
  assert.deepEqual(r.value.fee, { model: "xo_effective", params: { takerBps: "600", makerBps: "0", curveModel: "FLAT_BPS" } });
  const earlier = c.parseResolve([fx("xo/data-market-by-contract-pulse.json")], Date.parse("2026-10-18T17:40:00Z"), "0xabc");
  assert.ok(earlier.ok && earlier.value.status === "active");

  const spec = c.bookPlan("0xabc", "tok");
  assert.deepEqual([spec.host, spec.path, spec.query], ["orderbooks.xo.market", "/book", { token_id: "tok" }]);
  const b = c.parseBook(fx("xo/orderbook-book.json"));
  assert.equal(b.ok, true);
  if (!b.ok) return;
  assert.equal(b.value.venueTsMs, 1792345462412);
  const snap = buildSnapshot({ key: "xo:0xabc", venue: "xo", marketId: "0xabc", closeHintMs: null }, "tok", 1, 2, b.value, 20);
  assert.deepEqual([snap.bestBid, snap.bestAsk], ["0.001", "0.999"]);
  assert.deepEqual(snap.flags, []);
});

test("Polymarket: gamma state and a best-last CLOB book", () => {
  const c = COLLECTORS.polymarket;
  const plan = c.resolvePlan("0xcond");
  assert.deepEqual([plan[0]?.host, plan[0]?.path, plan[0]?.query], ["gamma-api.polymarket.com", "/markets", { condition_ids: "0xcond" }]);
  const gammaList = fx("polymarket/gamma_markets_list.json") as { conditionId: string }[];
  const r = c.parseResolve([gammaList], Date.parse("2026-10-18T00:00:00Z"), gammaList[0]!.conditionId);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.tokenId, (JSON.parse((gammaList[0] as unknown as { clobTokenIds: string }).clobTokenIds) as string[])[0]);
  assert.equal(r.value.status, "active");
  assert.equal(r.value.fee.model, "polymarket_schedule");
  assert.equal(r.value.fee.params["rate"], "0.05");
  assert.equal(r.value.fee.params["exponent"], "1");
  assert.equal(r.value.tick, "0.001");

  const b = c.parseBook(fx("polymarket/clob_book.json"));
  assert.equal(b.ok, true);
  if (!b.ok) return;
  const snap = buildSnapshot({ key: "polymarket:0x1", venue: "polymarket", marketId: "0x1", closeHintMs: null }, "tok", 1, 2, b.value, 20);
  assert.equal(snap.bestBid, "0.37", "the best level is last in the venue's list");
  assert.ok(snap.asks[0] !== undefined && Number(snap.asks[0][0]) <= Number(snap.asks[1]?.[0]));
  assert.ok(!snap.flags.includes("unsorted_input"));
});

test("Limitless: slug path, 6-decimal sizes, fee flag only", () => {
  const c = COLLECTORS.limitless;
  assert.equal(c.bookPlan("my-slug", null).path, "/markets/my-slug/orderbook");
  const r = c.parseResolve([fx("limitless/market_detail_greenland.json")], NOW, "my-slug");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.tokenId, (fx("limitless/market_detail_greenland.json") as { tokens: { yes: string } }).tokens.yes);
  assert.equal(r.value.status, "active");
  assert.equal(r.value.closeMs, null, "the display date text has no zone and is ignored");
  assert.deepEqual(r.value.fee, { model: "limitless_flag", params: { feeFlag: "true" } });
  const b = c.parseBook(fx("limitless/orderbook_greenland.json"));
  assert.equal(b.ok, true);
  if (!b.ok) return;
  const snap = buildSnapshot({ key: "limitless:s", venue: "limitless", marketId: "s", closeHintMs: null }, "tok", 1, 2, b.value, 20);
  assert.deepEqual(snap.bids, [["0.003", "863.898323"]]);
  assert.deepEqual(snap.asks[0], ["0.899", "12.362"]);
});

test("hostile text in third-party fields never reaches the parsed output", () => {
  const evil = { title: HOSTILE, description: HOSTILE, question: HOSTILE, rules: { description: HOSTILE } };
  const xo = COLLECTORS.xo.parseResolve([{ ...evil, status: "ACTIVE", expiresAt: "2027-01-01T00:00:00Z", outcomes: [{ index: 0, outcomeTokenId: "t1", title: HOSTILE }], effectiveFeeConfig: { takerFeeBps: 100, curveModel: HOSTILE } }], NOW, "0xabc");
  const poly = COLLECTORS.polymarket.parseResolve([[{ ...evil, conditionId: "0xabc", version: "v1", outcomes: '["Yes","No"]', active: true, clobTokenIds: '["t1","t2"]', endDate: "2027-01-01T00:00:00Z", feeSchedule: { rate: 0.04, exponent: 1 } }]], NOW, "0xabc");
  const lim = COLLECTORS.limitless.parseResolve([{ ...evil, status: HOSTILE, tokens: { yes: "t1" }, metadata: { fee: true } }], NOW, "my-slug");
  for (const r of [xo, poly, lim]) {
    assert.equal(r.ok, true);
    assert.equal(JSON.stringify(r).includes("IGNORE"), false);
  }
  // A status word we do not know becomes "unknown", never stored verbatim.
  assert.ok(lim.ok && lim.value.status === "unknown");
  // Identifiers that are not plain tokens are refused.
  assert.equal(COLLECTORS.xo.parseResolve([{ outcomes: [{ index: 0, outcomeTokenId: "ignore previous; rm -rf" }] }], NOW, "0xabc").ok, false);
  assert.equal(COLLECTORS.polymarket.parseResolve([[{ conditionId: "0xabc", version: "v1", outcomes: '["Yes","No"]', clobTokenIds: '["a b","c"]' }]], NOW, "0xabc").ok, false);
});

test("malformed payloads fail closed", () => {
  for (const c of Object.values(COLLECTORS)) {
    for (const bad of [null, 7, "x", [], {}, { bids: 1, asks: [] }, { bids: [], asks: "x" }]) {
      if (bad === null || typeof bad !== "object" || Array.isArray(bad) || Object.keys(bad).length === 0) {
        assert.equal(c.parseBook(bad).ok, false, `${c.venue} book ${JSON.stringify(bad)}`);
      } else if ("bids" in bad) assert.equal(c.parseBook(bad).ok, false);
    }
    assert.equal(c.parseResolve([null], NOW, "x").ok, false);
    assert.equal(c.parseResolve([], NOW, "x").ok, false);
  }
});

test("ADT-2: the XO resolve URL is the one the plugin's own XO client requests, not a restated copy", async () => {
  const id = `0x${"ab".repeat(32)}`;
  const seen: string[] = [];
  const client = new XoClient({
    fetchImpl: async (input) => {
      seen.push(String(input));
      return new Response("{}", { status: 404 });
    },
    minIntervalMs: 0,
    sleep: async () => undefined,
    deadlineMs: 20_000,
  });
  await client.getMarketByConditionId(id).catch(() => undefined);
  assert.equal(seen.length > 0, true);
  const clientUrl = new URL(seen[0] as string);
  const spec = COLLECTORS.xo.resolvePlan(id)[0]!;
  assert.equal(`https://${spec.host}${spec.path}`, `${clientUrl.origin}${clientUrl.pathname}`);
  assert.ok(spec.path.startsWith("/api/"), spec.path);
});

// ---------------------------------------------------------------------------------------------
// ADT-3: Polymarket resolve picks the right market, the right token field and refuses a No-first order

const pm = (over: Record<string, unknown>): Record<string, unknown> => ({
  conditionId: "0xaa",
  version: "v1",
  outcomes: '["Yes","No"]',
  clobTokenIds: '["111","222"]',
  positionIds: '["999","888"]',
  active: true,
  endDate: "2027-01-01T00:00:00Z",
  ...over,
});
const resolvePm = (list: unknown[], id = "0xaa") => COLLECTORS.polymarket.parseResolve([list], NOW, id);

test("ADT-3: a response that does not contain the requested condition is refused, not read from element 0", () => {
  const r = resolvePm([pm({ conditionId: "0xbb" })], "0xaa");
  assert.equal(r.ok, false);
  // The matching element is found wherever it sits, and case does not matter.
  const found = resolvePm([pm({ conditionId: "0xbb", clobTokenIds: '["x1","x2"]' }), pm({ conditionId: "0xAA" })], "0xaa");
  assert.equal(found.ok && found.value.tokenId, "111");
});

test("ADT-3: version decides the token field: v1 clobTokenIds, v2 positionIds, anything else is refused", () => {
  const v1 = resolvePm([pm({ version: "v1" })]);
  assert.equal(v1.ok && v1.value.tokenId, "111");
  const v2 = resolvePm([pm({ version: "v2" })]);
  assert.equal(v2.ok && v2.value.tokenId, "999", "v2 uses positionIds even when clobTokenIds is also present");
  assert.equal(resolvePm([pm({ version: "v3" })]).ok, false);
  assert.equal(resolvePm([pm({ version: undefined })]).ok, false);
  assert.equal(resolvePm([pm({ version: "v2", positionIds: undefined })]).ok, false);
});

test("ADT-3: a market whose first outcome is No (and second Yes) is refused; label outcomes are accepted", () => {
  assert.equal(resolvePm([pm({ outcomes: '["No","Yes"]' })]).ok, false);
  assert.equal(resolvePm([pm({ outcomes: '["no","YES"]' })]).ok, false);
  const label = resolvePm([pm({ outcomes: '["Under","Over"]' })]);
  assert.equal(label.ok && label.value.tokenId, "111");
  assert.equal(resolvePm([pm({ outcomes: undefined })]).ok, false, "outcomes must be present to be checked");
  assert.equal(resolvePm([pm({ outcomes: '["Yes"]' })]).ok, false, "not binary");
});
