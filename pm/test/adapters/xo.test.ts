import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AdapterFailure, createXoAdapter, xoStatusOf } from "../../adapters/index.js";
import { canonicalizeRecord } from "../../links/hash.js";
import { checkFeeSpec } from "../../../sdk/engine/fees.js";
import { feeSpecId } from "../../../sdk/engine/fee-specs.js";
import type { PmVenueAdapter } from "../../adapters/types.js";
import { NOW, fast, nowMs, patch, route, stubFetch, xoFixture, type Route } from "./helpers.js";

const ORDERBOOK = "orderbooks.xo.market";
const DATA = "api-mainnet.xo.market";

const detail = xoFixture("live-data-detail-fee-400.json");
const obMarket = xoFixture("live-orderbook-market-fee-400.json");
const feeRateZero = xoFixture("live-orderbook-fee-rate-zero-type4.json");
const twoSided = xoFixture("live-orderbook-book-two-sided.json");
const emptyBook = xoFixture("live-orderbook-book-empty.json");
const listFixture = xoFixture("data-markets-list.json");
const CID = String(detail["conditionId"]);
const YES = String((obMarket["tokens"] as Array<Record<string, unknown>>)[0]?.["token_id"]);

function marketRoutes(d: unknown = detail, ob: unknown = obMarket): Route[] {
  return [route(DATA, `/api/markets/contract/${CID}`, d), route(ORDERBOOK, `/markets/${CID}`, ob), route(ORDERBOOK, "/fee-rate", feeRateZero)];
}

function adapterFor(routes: readonly Route[], extra: { now?: () => number } = {}) {
  const stub = stubFetch(routes);
  const adapter: PmVenueAdapter = createXoAdapter({ http: fast(stub.fetchImpl), nowMs: extra.now ?? nowMs });
  return { adapter, calls: stub.calls };
}

async function failure(promise: Promise<unknown>): Promise<AdapterFailure> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof AdapterFailure, `expected AdapterFailure, got ${String(error)}`);
    return error;
  }
  assert.fail("expected the promise to reject");
}

describe("xo adapter: getMarket", () => {
  it("maps slots to roles, takes tick and collateral from XO facts, and pins the rules", async () => {
    const { adapter } = adapterFor(marketRoutes());
    const m = await adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.equal(m.ref.marketId, CID);
    assert.deepEqual(m.outcomes.map((o) => [o.index, o.role]), [[0, "yes"], [1, "no"]]);
    assert.equal(m.outcomes[0]?.tokenId, YES);
    assert.equal(m.tick, "0.001");
    // XO settles in bridged USDC.e on chain 3223 (the shared reader's XO_COLLATERAL, as pm/registry/records.ts says).
    assert.deepEqual(m.collateral, { symbol: "USDC.e", chain: "eip155:3223", decimals: 6, custody: "smart_account" });
    assert.equal(m.status, "active");
    assert.deepEqual(m.tradable, { ok: true, reasons: [] });
    assert.equal(m.rules.mechanism, "xo_manual_modra");
    assert.equal(m.rules.void, "unknown");
    // The sha256 slot is the pm/links rules-v2 value and recomputes from the exposed fields.
    const recomputed = canonicalizeRecord("xo", m.extras.ruleFields);
    assert.equal(recomputed.ok, true);
    if (recomputed.ok) assert.equal(m.rules.sha256, recomputed.value.rulesSha256);
    assert.match(m.rules.sha256, /^[0-9a-f]{64}$/);
    assert.equal(m.extras.rulesHashRecipe, "rules-v2");
    assert.equal(m.timesUtc.closesAt, "2026-12-31T23:59:00.000Z");
    assert.equal(m.prov.fetchedAtMs, NOW);
  });

  it("uses the larger fee figure and says the two XO sources disagree", async () => {
    const { adapter } = adapterFor(marketRoutes());
    const m = await adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.equal(m.fee.modelId, "curve_pq");
    assert.equal(feeSpecId(m.fee), "xo:curve_pq");
    assert.deepEqual(m.fee.taker, { bps: "400" });
    assert.deepEqual(m.fee.maker, { bps: "0" });
    assert.ok(m.extras.warnings.some((w) => w.includes("disagree")));
    // The spec is usable by the engine while fresh.
    assert.equal(checkFeeSpec(m.fee, NOW).ok, true);
  });

  it("makes the fee unknown when XO gives no usable figure, never zero", async () => {
    const noFee = patch(detail, [["effectiveFeeConfig"], null]);
    const { adapter } = adapterFor(marketRoutes(noFee));
    const m = await adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.equal(m.fee.modelId, "unknown");
    const checked = checkFeeSpec(m.fee, NOW);
    assert.equal(checked.ok, false);
  });

  it("makes the fee unknown for a fee curve model the shared parser does not understand", async () => {
    const config = detail["effectiveFeeConfig"] as Record<string, unknown>;
    const conviction = patch(detail, [["effectiveFeeConfig"], { ...config, curveModel: "CONVICTION_CURVE" }]);
    const m = await adapterFor(marketRoutes(conviction)).adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.equal(m.fee.modelId, "unknown");
    assert.ok(m.extras.warnings.some((w) => w.includes("fee is unknown")));
  });

  it("is not tradable while the review status is missing or asks for an update", async () => {
    const update = patch(detail, [["reviewStatus"], "UPDATE_REQUIRED"]);
    let m = await adapterFor(marketRoutes(update)).adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.equal(m.tradable.ok, false);
    assert.ok(m.tradable.reasons.includes("review_update_required"));
    assert.ok(m.extras.warnings.includes("XO review status is UPDATE_REQUIRED"));
    const missing = patch(detail, [["reviewStatus"], null]);
    m = await adapterFor(marketRoutes(missing)).adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.equal(m.tradable.ok, false);
    assert.ok(m.tradable.reasons.includes("review_status_missing"));
  });

  it("gives roles by slot even when the titles are team names", async () => {
    const teams = patch(detail);
    const outcomes = teams["outcomes"] as Array<Record<string, unknown>>;
    outcomes[0] = { ...outcomes[0], title: "AURORA" };
    outcomes[1] = { ...outcomes[1], title: "FALCONS" };
    const { adapter } = adapterFor(marketRoutes(teams));
    const m = await adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.deepEqual(m.outcomes.map((o) => o.role), ["yes", "no"]);
    assert.equal(m.outcomes[0]?.label.value, "AURORA");
    assert.equal(m.outcomes[0]?.label.untrusted, true);
  });

  it("is not tradable when paused, expired or not live on the orderbook", async () => {
    const paused = patch(detail, [["status"], "PAUSED"]);
    let m = await adapterFor(marketRoutes(paused)).adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.equal(m.status, "paused");
    assert.equal(m.tradable.ok, false);
    assert.ok(m.tradable.reasons.includes("lifecycle_paused"));

    // ACTIVE metadata past its expiry is not open (Pulse rows stay ACTIVE past expiresAt).
    const after = Date.parse("2027-01-02T00:00:00Z");
    m = await adapterFor(marketRoutes(), { now: () => after }).adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.equal(m.status, "closed");
    assert.ok(m.tradable.reasons.includes("lifecycle_expired_unresolved"));

    const inactive = patch(obMarket, [["active"], false]);
    m = await adapterFor(marketRoutes(detail, inactive)).adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.ok(m.tradable.reasons.includes("orderbook_inactive"));
  });

  it("fails closed on rules it cannot hash: a sentinel that is not hex and embeds the market id", async () => {
    const noRules = patch(detail, [["rules"], {}]);
    const m = await adapterFor(marketRoutes(noRules)).adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.equal(m.extras.rulesHashRecipe, null);
    assert.equal(m.rules.sha256, `unavailable:xo:${CID}`);
    assert.equal(m.tradable.ok, false);
    assert.ok(m.tradable.reasons.includes("rules_unavailable"));
    assert.ok(!("rules" in m.extras.ruleFields));
  });

  it("changes the pinned rules hash when the rule text changes by one character", async () => {
    const a = await adapterFor(marketRoutes()).adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    const rules = detail["rules"] as Record<string, unknown>;
    const edited = patch(detail, [["rules"], { ...rules, description: `${String(rules["description"])}.` }]);
    const b = await adapterFor(marketRoutes(edited)).adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.notEqual(a.rules.sha256, b.rules.sha256);
  });

  it("TM-15: a review-rejected market is not tradable even when it is otherwise open", async () => {
    const rejected = patch(detail, [["reviewStatus"], "REJECT"]);
    const m = await adapterFor(marketRoutes(rejected)).adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.equal(m.tradable.ok, false);
    assert.ok(m.tradable.reasons.includes("review_rejected"));
    const ok = await adapterFor(marketRoutes()).adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.equal(ok.tradable.reasons.includes("review_rejected"), false);
  });

  describe("a lossy read of a rule-bearing field is unhashable (ADT-1)", () => {
    const rules = detail["rules"] as Record<string, unknown>;
    const outcomeRules = rules["outcomeRules"] as Array<Record<string, unknown>>;

    async function load(d: Record<string, unknown>) {
      return adapterFor(marketRoutes(d)).adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    }
    function assertUnhashable(m: Awaited<ReturnType<typeof load>>, label: string) {
      assert.equal(m.extras.rulesHashRecipe, null, label);
      assert.equal(m.rules.sha256, `unavailable:xo:${CID}`, label);
      assert.equal(m.tradable.ok, false, label);
      assert.ok(m.tradable.reasons.includes("rules_unavailable"), label);
    }

    it("description cut at the client cap", async () => {
      const long = (tail: string) => patch(detail, [["rules"], { ...rules, description: `${"A".repeat(20_000)}${tail}` }]);
      assertUnhashable(await load(long(" ORIGINAL TAIL")), "description");
      assertUnhashable(await load(long(" CHANGED TAIL: resolves NO always")), "description changed");
    });

    it("more outcome rules than the client reads", async () => {
      const many = Array.from({ length: 12 }, (_, i) => ({ rule: `rule ${i}`, outcomeIndex: i % 2 }));
      assertUnhashable(await load(patch(detail, [["rules"], { ...rules, outcomeRules: many }])), "outcomeRules");
    });

    it("more resolution sources than the client reads", async () => {
      const many = Array.from({ length: 25 }, (_, i) => `https://example.invalid/s${i}`);
      assertUnhashable(await load(patch(detail, [["resolutionSources"], many])), "resolutionSources");
    });

    it("a source that is not text, and an outcome rule that is not text", async () => {
      assertUnhashable(await load(patch(detail, [["resolutionSources"], ["https://example.invalid/a", 42]])), "non-text source");
      const bad = [{ ...outcomeRules[0], rule: 7 }, outcomeRules[1]];
      assertUnhashable(await load(patch(detail, [["rules"], { ...rules, outcomeRules: bad }])), "non-text rule");
    });

    it("a source longer than the client cap", async () => {
      assertUnhashable(await load(patch(detail, [["resolutionSources"], [`https://example.invalid/${"x".repeat(2_500)}`]])), "long source");
    });

    it("an intact read still hashes", async () => {
      const m = await load(detail);
      assert.match(m.rules.sha256, /^[0-9a-f]{64}$/);
      assert.equal(m.extras.rulesHashRecipe, "rules-v2");
    });
  });

  it("refuses a ref from another venue or a non-condition id before any request", async () => {
    const { adapter, calls } = adapterFor(marketRoutes());
    assert.equal((await failure(adapter.getMarket({ venue: "polymarket", marketId: CID, native: {} }))).code, "NOT_SUPPORTED");
    assert.equal((await failure(adapter.getMarket({ venue: "xo", marketId: "market-slug", native: {} }))).code, "NOT_FOUND");
    assert.equal(calls.length, 0);
  });

  it("maps transport trouble to the closed AdapterError vocabulary", async () => {
    const cases: Array<[number, string]> = [[404, "NOT_FOUND"], [429, "RATE_LIMITED"], [500, "VENUE_PAUSED"]];
    for (const [status, code] of cases) {
      const { adapter } = adapterFor([route(DATA, `/api/markets/contract/${CID}`, { message: "x" }, { status }), route(ORDERBOOK, `/markets/${CID}`, obMarket)]);
      assert.equal((await failure(adapter.getMarket({ venue: "xo", marketId: CID, native: {} }))).code, code, String(status));
    }
    const drift = adapterFor([route(DATA, `/api/markets/contract/${CID}`, { nope: true }), route(ORDERBOOK, `/markets/${CID}`, obMarket)]);
    assert.equal((await failure(drift.adapter.getMarket({ venue: "xo", marketId: CID, native: {} }))).code, "SCHEMA_DRIFT");
  });

  it("re-reads fee parameters in getFeeSpec instead of trusting the passed market", async () => {
    const { adapter, calls } = adapterFor(marketRoutes());
    const m = await adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    const before = calls.length;
    const spec = await adapter.getFeeSpec(m);
    assert.ok(calls.length > before);
    assert.equal(feeSpecId(spec), "xo:curve_pq");
  });
});

describe("xo adapter: statuses", () => {
  it("maps every lifecycle to a status, with provisional results as determined", () => {
    assert.equal(xoStatusOf("open"), "active");
    assert.equal(xoStatusOf("resolved_provisional"), "determined");
    assert.equal(xoStatusOf("settled"), "resolved");
    assert.equal(xoStatusOf("closed_no_winner"), "closed");
    assert.equal(xoStatusOf("review_required"), "paused");
    // A cancelled market is not a confirmed refund: the shared table says "unknown", never "voided".
    assert.equal(xoStatusOf("cancelled"), "unknown");
    assert.equal(xoStatusOf("unknown"), "unknown");
  });
});

describe("xo adapter: getBooks", () => {
  const token = (id: string) => ({ venue: "xo" as const, tokenId: id });
  const TWO = String(twoSided["asset_id"]);

  it("returns sorted native books tagged best_first with venue timestamp and hash", async () => {
    const { adapter } = adapterFor([route(ORDERBOOK, "/book", twoSided, { query: { token_id: TWO } })]);
    const [r] = await adapter.getBooks([token(TWO)], { deadlineMs: 5000 });
    assert.ok(r?.ok);
    if (!r?.ok) return;
    const b = r.value;
    assert.equal(b.convention, "best_first");
    assert.equal(b.derived, "native");
    assert.equal(b.bids[0]?.price, "0.105");
    assert.equal(b.bids.at(-1)?.price, "0.001");
    assert.equal(b.asks[0]?.price, "0.135");
    assert.equal(b.asks.at(-1)?.price, "0.999");
    assert.equal(b.venueTsMs, 1792352650399);
    assert.equal(b.hash, twoSided["hash"]);
    assert.equal(b.asOfMs, NOW);
    assert.deepEqual(b.token, { venue: "xo", tokenId: TWO });
    // Strictly sorted.
    for (let i = 1; i < b.bids.length; i += 1) assert.ok(Number(b.bids[i - 1]?.price) > Number(b.bids[i]?.price));
  });

  it("reports an empty book, a missing book and a token mix-up as distinct errors", async () => {
    const EMPTY = String(emptyBook["asset_id"]);
    const { adapter } = adapterFor([
      route(ORDERBOOK, "/book", emptyBook, { query: { token_id: EMPTY } }),
      route(ORDERBOOK, "/book", { error: "No orderbook exists" }, { query: { token_id: "999" }, status: 404 }),
      // The venue answers with a different token than asked.
      route(ORDERBOOK, "/book", twoSided, { query: { token_id: "12345" } }),
    ]);
    const out = await adapter.getBooks([token(EMPTY), token("999"), token("12345"), { venue: "polymarket", tokenId: "1" }, token("not-a-token")], { deadlineMs: 5000 });
    assert.deepEqual(out.map((r) => (r.ok ? "ok" : r.error)), ["EMPTY_BOOK", "NOT_FOUND", "SCHEMA_DRIFT", "NOT_SUPPORTED", "NOT_SUPPORTED"]);
  });

  it("stops reading when the call budget is spent and says so per token", async () => {
    // The clock moves only when a request is made: each read costs 600 ms of the 1000 ms budget.
    let t = NOW;
    const stub = stubFetch([route(ORDERBOOK, "/book", twoSided, { query: { token_id: TWO } })]);
    const timed = async (input: string, init: RequestInit): Promise<Response> => {
      t += 600;
      return stub.fetchImpl(input, init);
    };
    const adapter = createXoAdapter({ http: fast(timed), nowMs: () => t });
    const out = await adapter.getBooks([token(TWO), token(TWO), token(TWO)], { deadlineMs: 1000 });
    assert.deepEqual(out.map((r) => (r.ok ? "ok" : r.error)), ["ok", "ok", "TIMEOUT"]);
  });

  it("rejects a crossed book as drift instead of pricing it", async () => {
    const crossed = patch(twoSided, [["bids"], [{ price: "0.500", size: "10" }]], [["asks"], [{ price: "0.400", size: "10" }]]);
    const { adapter } = adapterFor([route(ORDERBOOK, "/book", crossed, { query: { token_id: TWO } })]);
    const [r] = await adapter.getBooks([token(TWO)], { deadlineMs: 5000 });
    assert.equal(r?.ok, false);
    if (r && !r.ok) assert.equal(r.error, "SCHEMA_DRIFT");
  });
});

describe("xo adapter: listMarkets", () => {
  it("pages on hasNextPage only and keeps the page number as the cursor", async () => {
    const withNext = patch(listFixture, [["meta", "hasNextPage"], true]);
    const { adapter, calls } = adapterFor([route(DATA, "/api/markets", withNext)]);
    const page = await adapter.listMarkets({ limit: 50, cursor: "2" });
    assert.equal(page.next, "3");
    assert.ok(page.items.length > 0);
    assert.ok(page.items.every((m) => m.ref.venue === "xo" && /^0x[0-9a-f]{64}$/.test(m.ref.marketId)));
    const q = Object.fromEntries(calls[0]!.url.searchParams);
    assert.equal(q["marketType"], "2,4");
    assert.equal(q["take"], "50");
    assert.equal(q["page"], "2");
    assert.equal(q["statuses"], "ACTIVE");
  });

  it("stops at the last page", async () => {
    const last = patch(listFixture, [["meta", "hasNextPage"], false]);
    const page = await adapterFor([route(DATA, "/api/markets", last)]).adapter.listMarkets({});
    assert.equal(page.next, null);
  });

  it("clamps the page size to 50, passes search through and refuses a bad cursor or status", async () => {
    const { adapter, calls } = adapterFor([route(DATA, "/api/markets", listFixture)]);
    await adapter.listMarkets({ limit: 5000, text: "ufc" });
    assert.equal(calls[0]!.url.searchParams.get("take"), "50");
    assert.equal(calls[0]!.url.searchParams.get("search"), "ufc");
    assert.equal((await failure(adapter.listMarkets({ cursor: "abc" }))).code, "NOT_SUPPORTED");
    assert.equal((await failure(adapter.listMarkets({ statuses: ["disputed"] }))).code, "NOT_SUPPORTED");
    assert.equal(calls.length, 1);
  });

  it("maps requested statuses onto XO list statuses", async () => {
    const { adapter, calls } = adapterFor([route(DATA, "/api/markets", listFixture)]);
    await adapter.listMarkets({ statuses: ["paused", "pending"] });
    // UPDATE_REQUIRED reads as "paused" (the creator must update the market), so a paused query asks for it too.
    assert.equal(calls[0]!.url.searchParams.get("statuses"), "PENDING,PAUSED,UPDATE_REQUIRED");
  });
});

describe("xo adapter: health, caps and transport rules", () => {
  it("reads /trading-state", async () => {
    for (const [body, ok] of [[{ state: "active" }, true], [{ state: "paused" }, false], [{ state: "weird" }, false]] as const) {
      const { adapter } = adapterFor([route(ORDERBOOK, "/trading-state", body)]);
      assert.equal((await adapter.health()).ok, ok);
    }
    const down = adapterFor([route(ORDERBOOK, "/trading-state", { e: 1 }, { status: 500 })]);
    const h = await down.adapter.health();
    assert.equal(h.ok, false);
    assert.ok(h.notes[0]?.includes("VENUE_PAUSED"));
  });

  it("declares what it cannot do instead of guessing", () => {
    const { adapter } = adapterFor([]);
    assert.equal(adapter.caps.getBooksBatch, false);
    assert.equal(adapter.caps.stream, false);
    assert.equal(adapter.caps.getPositionsByAddress, false);
    assert.equal(adapter.id, "xo");
  });

  it("only reaches the two XO read hosts, with the plugin User-Agent, GET only", async () => {
    const stub = stubFetch([...marketRoutes(), route(ORDERBOOK, "/book", twoSided, { query: { token_id: String(twoSided["asset_id"]) } })]);
    // A caller-supplied host list cannot widen the allowlist.
    const adapter = createXoAdapter({ http: { ...fast(stub.fetchImpl), allowedHosts: ["evil.example"] }, nowMs });
    await adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    await adapter.getBooks([{ venue: "xo", tokenId: String(twoSided["asset_id"]) }], { deadlineMs: 5000 });
    assert.ok(stub.calls.length >= 4);
    for (const c of stub.calls) {
      assert.ok([ORDERBOOK, DATA].includes(c.url.hostname));
      assert.equal(c.init.method, "GET");
      assert.equal(c.init.body, undefined);
      assert.equal(new Headers(c.init.headers).get("user-agent"), "insurance-markets-xo-plugin/0.2");
    }
  });

  it("carries the data-terms descriptor: XO data may persist, the adapter is on by default", () => {
    const { adapter } = adapterFor([]);
    assert.equal(adapter.descriptor.venue, "xo");
    assert.equal(adapter.descriptor.restrictedTerms, false);
    assert.equal(adapter.descriptor.defaultEnabled, true);
    assert.equal(adapter.descriptor.recordable, true);
  });
});

describe("xo adapter: category", () => {
  it("attaches the fixed-taxonomy verdict from categoryPath (the captured detail is SPORTS > MMA > UFC)", async () => {
    const { adapter } = adapterFor(marketRoutes());
    const m = await adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.deepEqual(m.category, { category: "sports", confidence: "native", matched: ["common:sports"] });
  });

  it("falls back to the title's words when XO sends no category path, and to 'other' when those say nothing", async () => {
    const noPath = patch(detail, [["categoryPath"], []], [["category"], undefined]);
    const { adapter } = adapterFor(marketRoutes(noPath));
    const m = await adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.deepEqual(m.category, { category: "sports", confidence: "keyword", matched: ["keyword:ufc"] });
    const blank = patch(noPath, [["title"], "Something with no category words"]);
    const other = await adapterFor(marketRoutes(blank)).adapter.getMarket({ venue: "xo", marketId: CID, native: {} });
    assert.deepEqual(other.category, { category: "other", confidence: "none", matched: [] });
  });
});
