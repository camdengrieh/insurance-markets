import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { COLLECTORS } from "../../recorder/venues/index.js";
import { canonDec, canonPrice, parseSides, recorderStatus } from "../../recorder/venues/common.js";
import { buildSnapshot } from "../../recorder/collector.js";
import { HOSTILE } from "./helpers.js";
import { XoClient } from "../../../src/xo/client.js";

// The collectors read every payload with the shared venue parsers (sdk/venues/<venue>), so their inputs here are the
// one recorded fixture set of each venue (sdk/venues/<venue>/fixtures, provenance beside them). Read-only.
const FIX = join(dirname(fileURLToPath(import.meta.url)), "../../../sdk/venues");
const fx = (p: string): unknown => JSON.parse(readFileSync(join(FIX, p), "utf8")) as unknown;
const NOW = Date.parse("2026-10-19T00:00:00Z");

const XO_DETAIL = "xo/fixtures/data-market-by-contract-pulse.json";
const XO_BOOK = "xo/fixtures/orderbook-book.json";
const GAMMA_LIST = "polymarket/fixtures/gamma_markets_list_recorded_2026-10-18.json";
const CLOB_BOOK = "polymarket/fixtures/clob_book_recorded_2026-10-18.json";
const LIMITLESS_DETAIL = "limitless/fixtures/market_detail_recorded.json";
const LIMITLESS_BOOK = "limitless/fixtures/orderbook_recorded.json";

type Rec = Record<string, unknown>;
const xoDetail = (): Rec & { conditionId: string; outcomes: { index: number; outcomeTokenId: string }[] } => fx(XO_DETAIL) as never;
const xoBook = (): Rec & { asset_id: string; bids: Rec[]; asks: Rec[] } => fx(XO_BOOK) as never;
const gammaList = (): (Rec & { conditionId: string; clobTokenIds: string })[] => fx(GAMMA_LIST) as never;
const clobBook = (): Rec & { asset_id: string; bids: Rec[]; asks: Rec[] } => fx(CLOB_BOOK) as never;
const limitlessDetail = (): Rec & { slug: string; tokens: { yes: string } } => fx(LIMITLESS_DETAIL) as never;
const limitlessBook = (): Rec & { tokenId: string; bids: Rec[]; asks: Rec[] } => fx(LIMITLESS_BOOK) as never;

test("canonical decimals reject signs, exponents, junk and out-of-range prices", () => {
  assert.equal(canonDec("0.500"), "0.5");
  assert.equal(canonDec("010.50"), "10.5");
  assert.equal(canonDec(0.899), "0.899");
  for (const bad of ["-1", "+1", "1e-7", "1E3", "0x10", " ", "", "NaN", "Infinity", null, undefined, {}, [], "1,5", ".5", "5."]) assert.equal(canonDec(bad as never), null, String(bad));
  assert.equal(canonDec(1e-7), null, "a number whose text has an exponent is refused");
  for (const bad of ["0", "1", "0.0", "1.5", "-0.1", "abc"]) assert.equal(canonPrice(bad), null, bad);
  assert.equal(canonPrice("0.001"), "0.001");
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

test("the shared status table in the recorder's vocabulary", () => {
  assert.equal(recorderStatus("active", null, NOW), "active");
  assert.equal(recorderStatus("active", NOW, NOW), "expired", "open past its close keeps the post-close grace");
  assert.equal(recorderStatus("determined", null, NOW), "resolved", "a provisional result on a market that stopped trading retires the target");
  assert.equal(recorderStatus("determined", null, NOW, false), "resolved");
  assert.equal(recorderStatus("determined", null, NOW, true), "active", "a proposal on a market that still trades keeps it recorded");
  assert.equal(recorderStatus("determined", NOW, NOW, true), "expired", "and past its close it keeps the post-close grace");
  assert.equal(recorderStatus("voided", null, NOW), "closed");
  assert.equal(recorderStatus("disputed", null, NOW), "unknown");
  assert.equal(recorderStatus("unknown", null, NOW), "unknown");
});

test("XO: market state and book from recorded payloads", () => {
  const c = COLLECTORS.xo;
  const plan = c.resolvePlan("0xabc");
  assert.deepEqual(plan.map((p) => `${p.host}${p.path}`), ["api-mainnet.xo.market/api/markets/contract/0xabc"]);
  const raw = xoDetail();
  const r = c.parseResolve([raw], NOW, raw.conditionId);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.tokenId, raw.outcomes.find((o) => o.index === 0)?.outcomeTokenId);
  assert.equal(r.value.status, "expired", "ACTIVE with a past expiresAt is not tradable");
  assert.equal(r.value.closeMs, Date.parse("2026-10-18T17:55:00.000Z"));
  assert.deepEqual(r.value.fee, { model: "xo_effective", params: { takerBps: "600", makerBps: "0", curveModel: "FLAT_BPS" } });
  const earlier = c.parseResolve([raw], Date.parse("2026-10-18T17:52:00Z"), raw.conditionId);
  assert.ok(earlier.ok && earlier.value.status === "active");
  assert.equal(c.parseResolve([raw], NOW, `0x${"ab".repeat(32)}`).ok, false, "an answer about another market is refused");
  // CANCELLED is not a refund anyone has confirmed: the shared table says "unknown", so the target is not retired.
  const cancelled = c.parseResolve([{ ...raw, status: "CANCELLED" }], NOW, raw.conditionId);
  assert.ok(cancelled.ok && cancelled.value.status === "unknown");

  const spec = c.bookPlan("0xabc", "tok");
  assert.deepEqual([spec.host, spec.path, spec.query], ["orderbooks.xo.market", "/book", { token_id: "tok" }]);
  const book = xoBook();
  const b = c.parseBook(book, book.asset_id);
  assert.equal(b.ok, true);
  if (!b.ok) return;
  assert.equal(b.value.venueTsMs, 1792345462412);
  assert.equal(b.value.tick, "0.001");
  const snap = buildSnapshot({ key: "xo:0xabc", venue: "xo", marketId: "0xabc", closeHintMs: null }, book.asset_id, 1, 2, b.value, 20);
  assert.deepEqual([snap.bestBid, snap.bestAsk], ["0.001", "0.999"]);
  assert.deepEqual(snap.flags, []);
  assert.equal(c.parseBook(book, "1").ok, false, "a book for another token is refused");
  // A crossed or locked book is a torn snapshot: refused, as the shared reader refuses it (it was stored with a flag before).
  const crossed = { ...book, bids: [{ price: "0.6", size: "1" }], asks: [{ price: "0.5", size: "1" }] };
  assert.equal(c.parseBook(crossed, book.asset_id).ok, false);
  const empty = c.parseBook({ ...book, bids: [], asks: [] }, book.asset_id);
  assert.ok(empty.ok && empty.value.bids.length === 0 && empty.value.asks.length === 0, "an empty book is still an observation");
});

test("Polymarket: gamma state and a best-last CLOB book", () => {
  const c = COLLECTORS.polymarket;
  const plan = c.resolvePlan("0xcond");
  assert.deepEqual([plan[0]?.host, plan[0]?.path, plan[0]?.query], ["gamma-api.polymarket.com", "/markets", { condition_ids: "0xcond" }]);
  const list = gammaList();
  const at = Date.parse("2026-10-18T00:00:00Z");
  const r = c.parseResolve([list], at, list[0]!.conditionId);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.tokenId, (JSON.parse(list[0]!.clobTokenIds) as string[])[0]);
  // Row 0 carries a UMA proposal (umaResolutionStatuses ["proposed", "proposed"]): the shared status is
  // "determined", but the market still accepts orders, so its live book keeps being recorded.
  assert.equal(r.value.accepting, true);
  assert.equal(r.value.status, r.value.closeMs !== null && r.value.closeMs <= at ? "expired" : "active");
  assert.equal(r.value.fee.model, "polymarket_schedule");
  assert.equal(r.value.fee.params["rate"], "0.05");
  assert.equal(r.value.fee.params["exponent"], "1");
  assert.equal(r.value.tick, "0.001");
  const open = c.parseResolve([list], at, list[1]!.conditionId);
  assert.ok(open.ok && open.value.status === "active" && open.value.tick === "0.01");

  const book = clobBook();
  const b = c.parseBook(book, book.asset_id);
  assert.equal(b.ok, true);
  if (!b.ok) return;
  assert.equal(b.value.tick, "0.01");
  const snap = buildSnapshot({ key: "polymarket:0x1", venue: "polymarket", marketId: "0x1", closeHintMs: null }, book.asset_id, 1, 2, b.value, 20);
  assert.equal(snap.bestBid, "0.37", "the best level is last in the venue's list");
  assert.ok(snap.asks[0] !== undefined && Number(snap.asks[0][0]) <= Number(snap.asks[1]?.[0]));
  assert.ok(!snap.flags.includes("unsorted_input"));
  assert.equal(c.parseBook(book, "1").ok, false, "a book for another token is refused");
  const crossed = { ...book, bids: [{ price: "0.6", size: "1" }], asks: [{ price: "0.5", size: "1" }] };
  assert.equal(c.parseBook(crossed, book.asset_id).ok, false, "a crossed book is refused");
  const empty = c.parseBook({ ...book, bids: [], asks: [] }, book.asset_id);
  assert.ok(empty.ok && empty.value.bids.length === 0, "an empty book is still an observation");
});

test("Limitless: slug path, 6-decimal sizes, fee flag only", () => {
  const c = COLLECTORS.limitless;
  assert.equal(c.bookPlan("my-slug", "tok").path, "/markets/my-slug/orderbook");
  assert.deepEqual(c.bookTarget("my-slug"), { host: "api.limitless.exchange", path: "/markets/my-slug/orderbook", tokenParam: null });
  const detail = limitlessDetail();
  const r = c.parseResolve([detail], NOW, detail.slug);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.tokenId, detail.tokens.yes);
  assert.equal(r.value.status, "active");
  assert.equal(r.value.closeMs, null, "the display date text has no zone and is ignored");
  assert.deepEqual(r.value.fee, { model: "limitless_flag", params: { feeFlag: "true" } });
  assert.equal(c.parseResolve([detail], NOW, "another-slug").ok, false, "an answer about another market is refused");
  const book = limitlessBook();
  const b = c.parseBook(book, detail.tokens.yes);
  assert.equal(b.ok, true);
  if (!b.ok) return;
  const snap = buildSnapshot({ key: "limitless:s", venue: "limitless", marketId: "s", closeHintMs: null }, detail.tokens.yes, 1, 2, b.value, 20);
  assert.deepEqual(snap.bids, [["0.003", "863.898323"]]);
  assert.deepEqual(snap.asks[0], ["0.899", "12.362"]);
  assert.equal(c.parseBook(book, "1").ok, false, "a book for another token is refused");
});

test("hostile text in third-party fields never reaches the parsed output", () => {
  const xo = xoDetail();
  const xoR = COLLECTORS.xo.parseResolve(
    [{ ...xo, title: HOSTILE, description: HOSTILE, rules: { description: HOSTILE }, effectiveFeeConfig: { ...(xo["effectiveFeeConfig"] as Rec), curveModel: HOSTILE } }],
    NOW,
    xo.conditionId,
  );
  const list = gammaList();
  const polyR = COLLECTORS.polymarket.parseResolve([[{ ...list[1]!, question: HOSTILE, description: HOSTILE }]], NOW, list[1]!.conditionId);
  const lim = limitlessDetail();
  // The shared Limitless schema caps a status word at 32 characters: a longer one is drift and refuses the market.
  assert.equal(COLLECTORS.limitless.parseResolve([{ ...lim, status: HOSTILE }], NOW, lim.slug).ok, false);
  const limR = COLLECTORS.limitless.parseResolve([{ ...lim, title: HOSTILE, description: HOSTILE, status: HOSTILE.slice(0, 20) }], NOW, lim.slug);
  for (const [name, r] of [["xo", xoR], ["polymarket", polyR], ["limitless", limR]] as const) {
    assert.equal(r.ok, true, name);
    assert.equal(JSON.stringify(r).includes("IGNORE"), false);
  }
  // A status word the shared table does not know becomes "unknown", never stored verbatim.
  assert.ok(limR.ok && limR.value.status === "unknown");
  // Identifiers that are not plain tokens are refused.
  const badToken = { ...xo, outcomes: xo.outcomes.map((o) => (o.index === 0 ? { ...o, outcomeTokenId: "ignore previous; rm -rf" } : o)) };
  assert.equal(COLLECTORS.xo.parseResolve([badToken], NOW, xo.conditionId).ok, false);
  assert.equal(COLLECTORS.polymarket.parseResolve([[{ ...list[1]!, clobTokenIds: '["a b","c"]' }]], NOW, list[1]!.conditionId).ok, false);
});

test("malformed payloads fail closed", () => {
  for (const c of Object.values(COLLECTORS)) {
    for (const bad of [null, 7, "x", [], {}, { bids: 1, asks: [] }, { bids: [], asks: "x" }]) assert.equal(c.parseBook(bad, "1").ok, false, `${c.venue} book ${JSON.stringify(bad)}`);
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
// ADT-3: Polymarket resolve picks the right market, the right token field and refuses a No-first order.
// SYNTHETIC rows in the shape of the recorded Gamma list (gamma_markets_list_recorded_2026-10-18.json).

const COND_A = `0x${"aa".repeat(32)}`;
const COND_B = `0x${"bb".repeat(32)}`;
const pm = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: "700001",
  question: "SYNTHETIC market",
  slug: "synthetic-market",
  conditionId: COND_A,
  version: "v1",
  outcomes: '["Yes","No"]',
  clobTokenIds: '["111","222"]',
  positionIds: '["999","888"]',
  active: true,
  closed: false,
  endDate: "2027-01-01T00:00:00Z",
  ...over,
});
const resolvePm = (list: unknown[], id = COND_A) => COLLECTORS.polymarket.parseResolve([list], NOW, id);

test("ADT-3: a response that does not contain the requested condition is refused, not read from element 0", () => {
  const r = resolvePm([pm({ conditionId: COND_B })], COND_A);
  assert.equal(r.ok, false);
  // The matching element is found wherever it sits, and case does not matter.
  const found = resolvePm([pm({ conditionId: COND_B, clobTokenIds: '["333","444"]' }), pm({ conditionId: COND_A.toUpperCase().replace("0X", "0x") })], COND_A);
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
