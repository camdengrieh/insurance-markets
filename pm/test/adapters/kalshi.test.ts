import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AdapterFailure,
  KalshiDisabledError,
  adapterDescriptor,
  createAdapters,
  createKalshiAdapter,
  evaluateKalshiGate,
  feeChangesVerdict,
  kalshiStatus,
  parseBatchBooks,
  type KalshiGate,
} from "../../adapters/index.js";
import type { PmVenueAdapter } from "../../adapters/types.js";
import { checkFeeSpec } from "../../../sdk/engine/fees.js";
import { canonicalizeRecord } from "../../links/hash.js";
import { NOW, fast, nowMs, route, stubFetch, type Route } from "./helpers.js";

const HOST = "external-api.kalshi.com";
const P = "/trade-api/v2";

// No Kalshi payload of any kind is committed: Kalshi's terms bar caching or aggregating its data, and no
// invented market, event, series or book is committed either. These tests need no payload. Where a reply is
// needed they use an empty object, a garbage string, null or an error status (test inputs, not market data).
const TICKER = "KXTEST-1";
const ACK = adapterDescriptor("kalshi", NOW).clauseSha256;
const GATE: KalshiGate = { enabled: true, acknowledgedClauseSha256: ACK };

function live(rs: readonly Route[], opts: { feeChanges?: "check" | "skip"; now?: () => number } = {}) {
  const stub = stubFetch(rs);
  const adapter: PmVenueAdapter = createKalshiAdapter(GATE, {
    http: fast(stub.fetchImpl),
    nowMs: opts.now ?? nowMs,
    ...(opts.feeChanges === undefined ? {} : { feeChanges: opts.feeChanges }),
  });
  return { adapter, calls: stub.calls };
}

const ref = { venue: "kalshi" as const, marketId: TICKER, native: {} };

async function failure(promise: Promise<unknown>): Promise<AdapterFailure> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof AdapterFailure, `expected AdapterFailure, got ${String(error)}`);
    return error;
  }
  assert.fail("expected the promise to reject");
}

describe("kalshi adapter: OFF by default, restricted terms", () => {
  it("cannot be created without an explicit enable and the clause acknowledgement", () => {
    for (const gate of [undefined, { enabled: false }, { enabled: false, acknowledgedClauseSha256: ACK }] as const) {
      assert.throws(() => createKalshiAdapter(gate, { nowMs }), (e: unknown) => e instanceof KalshiDisabledError && e.status === "off");
    }
    for (const gate of [{ enabled: true }, { enabled: true, acknowledgedClauseSha256: "0".repeat(64) }, { enabled: true, acknowledgedClauseSha256: ACK.toUpperCase() }] as const) {
      assert.throws(() => createKalshiAdapter(gate, { nowMs }), (e: unknown) => e instanceof KalshiDisabledError && e.status === "ack_required");
    }
    assert.equal(evaluateKalshiGate(GATE, NOW), "enabled");
    assert.ok(createKalshiAdapter(GATE, { nowMs }));
  });

  it("createAdapters hands out a disabled Kalshi adapter that never touches the network", async () => {
    const stub = stubFetch([]);
    for (const kalshi of [undefined, { enabled: true }] as const) {
      const set = createAdapters({ nowMs, http: fast(stub.fetchImpl), ...(kalshi === undefined ? {} : { kalshi }) });
      assert.equal(set.kalshiStatus, kalshi === undefined ? "off" : "ack_required");
      assert.ok(set.kalshiDisclosure?.includes("memory"));
      const k = set.kalshi;
      assert.ok(Object.entries(k.caps).every(([, v]) => v === false));
      assert.equal((await failure(k.listMarkets({}))).code, "NOT_SUPPORTED");
      assert.equal((await failure(k.getMarket(ref))).code, "NOT_SUPPORTED");
      const books = await k.getBooks([{ venue: "kalshi", tokenId: `${TICKER}:yes` }], { deadlineMs: 1000 });
      assert.equal(books[0]?.ok === false && books[0].error, "NOT_SUPPORTED");
      const h = await k.health();
      assert.equal(h.ok, false);
    }
    assert.equal(stub.calls.length, 0);
  });

  it("createAdapters turns the live adapter on only with the matching acknowledgement", () => {
    const on = createAdapters({ nowMs, kalshi: GATE });
    assert.equal(on.kalshiStatus, "enabled");
    assert.equal(on.kalshi.caps.getBooksBatch, true);
    assert.equal(createAdapters({ nowMs, kalshi: { enabled: true, acknowledgedClauseSha256: "x" } }).kalshiStatus, "ack_required");
  });

  it("is described as restricted, memory only, never recordable or exportable, with the clause", () => {
    const d = createAdapters({ nowMs }).kalshi.descriptor;
    assert.equal(d.venue, "kalshi");
    assert.equal(d.restrictedTerms, true);
    assert.equal(d.memoryOnly, true);
    assert.equal(d.mayPersist, false);
    assert.equal(d.mayExport, false);
    assert.equal(d.recordable, false);
    assert.equal(d.defaultEnabled, false);
    assert.equal(d.termsReason, "restricted");
    assert.ok(/caching|aggregating/.test(d.clause));
    assert.ok(d.disclosure?.includes(d.clause));
    assert.deepEqual(d.hosts, [HOST]);
    // Even at a time when the registry's terms section is long expired, Kalshi stays restricted.
    const later = adapterDescriptor("kalshi", Date.parse("2030-01-01T00:00:00Z"));
    assert.equal(later.recordable, false);
    assert.equal(later.mayExport, false);
  });
});

describe("kalshi adapter: refusals and error mapping (no payload)", () => {
  it("maps every Kalshi status", () => {
    const table: Array<[string | null, string]> = [
      ["initialized", "pending"], ["inactive", "paused"], ["active", "active"], ["closed", "closed"],
      ["determined", "determined"], ["disputed", "disputed"], ["amended", "disputed"], ["finalized", "resolved"], ["x", "unknown"], [null, "unknown"],
    ];
    for (const [raw, status] of table) assert.equal(kalshiStatus(raw), status, String(raw));
  });

  it("refuses foreign refs and odd tickers without a request", async () => {
    const { adapter, calls } = live([]);
    assert.equal((await failure(adapter.getMarket({ venue: "xo", marketId: TICKER, native: {} }))).code, "NOT_SUPPORTED");
    assert.equal((await failure(adapter.getMarket({ venue: "kalshi", marketId: "../series", native: {} }))).code, "NOT_FOUND");
    assert.equal((await failure(adapter.getMarket({ venue: "kalshi", marketId: "A/B", native: {} }))).code, "NOT_FOUND");
    assert.equal(calls.length, 0);
  });

  it("maps a wrong-shaped market answer and the error statuses to the closed error set", async () => {
    for (const body of [{}, "garbage", null]) {
      const { adapter } = live([route(HOST, `${P}/markets/${TICKER}`, body)]);
      assert.equal((await failure(adapter.getMarket(ref))).code, "SCHEMA_DRIFT");
    }
    for (const [status, code] of [[404, "NOT_FOUND"], [429, "RATE_LIMITED"]] as const) {
      const { adapter } = live([route(HOST, `${P}/markets/${TICKER}`, {}, { status })]);
      assert.equal((await failure(adapter.getMarket(ref))).code, code, String(status));
    }
  });

  it("refuses search, several statuses, unlistable statuses and odd cursors without a request", async () => {
    const { adapter, calls } = live([]);
    assert.equal((await failure(adapter.listMarkets({ text: "senate" }))).code, "NOT_SUPPORTED");
    assert.equal((await failure(adapter.listMarkets({ statuses: ["active", "closed"] }))).code, "NOT_SUPPORTED");
    assert.equal((await failure(adapter.listMarkets({ statuses: ["voided"] }))).code, "NOT_SUPPORTED");
    assert.equal((await failure(adapter.listMarkets({ cursor: "a b" }))).code, "NOT_SUPPORTED");
    assert.equal(calls.length, 0);
    assert.equal(adapter.caps.search, false);
  });

  it("builds the list URL: one status per call, combos excluded, page size clamped, cursor passed through", async () => {
    const { adapter, calls } = live([route(HOST, `${P}/markets`, {})]);
    await adapter.listMarkets({ limit: 5000 }).catch(() => undefined);
    const q = Object.fromEntries(calls[0]!.url.searchParams);
    assert.equal(q["status"], "open");
    assert.equal(q["limit"], "200");
    assert.equal(q["mve_filter"], "exclude");
    await adapter.listMarkets({ statuses: ["resolved"], cursor: "abc=" }).catch(() => undefined);
    assert.equal(calls[1]!.url.searchParams.get("status"), "settled");
    assert.equal(calls[1]!.url.searchParams.get("cursor"), "abc=");
  });

  it("health fails closed on a wrong shape or an error status", async () => {
    assert.equal((await live([route(HOST, `${P}/exchange/status`, { x: 1 })]).adapter.health()).ok, false);
    assert.equal((await live([route(HOST, `${P}/exchange/status`, {}, { status: 500 })]).adapter.health()).ok, false);
  });

  it("books: other venues' tokens and malformed ids are NOT_SUPPORTED without a request; wrong shapes drift; errors map", async () => {
    const tok = (ticker: string) => ({ venue: "kalshi" as const, tokenId: `${ticker}:yes` });
    const { adapter, calls } = live([]);
    const out = await adapter.getBooks([{ venue: "kalshi", tokenId: "no-colon" }, { venue: "xo", tokenId: `${TICKER}:yes` }], { deadlineMs: 5000 });
    assert.deepEqual(out.map((r) => (r.ok ? "ok" : r.error)), ["NOT_SUPPORTED", "NOT_SUPPORTED"]);
    assert.equal(calls.length, 0);

    const shapes = live([
      route(HOST, `${P}/markets/orderbooks`, {}, { status: 400 }),
      route(HOST, `${P}/markets/${TICKER}/orderbook`, {}),
      route(HOST, `${P}/markets/KXTEST-GONE/orderbook`, {}, { status: 404 }),
    ]);
    const res = await shapes.adapter.getBooks([tok(TICKER), tok("KXTEST-GONE")], { deadlineMs: 5000 });
    assert.deepEqual(res.map((r) => (r.ok ? "ok" : r.error)), ["SCHEMA_DRIFT", "NOT_FOUND"]);
  });

  it("does not answer rate limiting with more requests", async () => {
    const limited = live([route(HOST, `${P}/markets/orderbooks`, {}, { status: 429 })]);
    const rl = await limited.adapter.getBooks([{ venue: "kalshi", tokenId: `${TICKER}:yes` }, { venue: "kalshi", tokenId: "KXTEST-2:yes" }], { deadlineMs: 5000 });
    assert.deepEqual(rl.map((r) => (r.ok ? "ok" : r.error)), ["RATE_LIMITED", "RATE_LIMITED"]);
    // One batch request plus its single retry; no single-book requests.
    assert.ok(limited.calls.every((c) => c.url.pathname === `${P}/markets/orderbooks`));

    const single = live([route(HOST, `${P}/markets/${TICKER}/orderbook`, {}, { status: 429 })]);
    const [r] = await single.adapter.getBooks([{ venue: "kalshi", tokenId: `${TICKER}:yes` }], { deadlineMs: 5000 });
    assert.equal(r?.ok === false && r.error, "RATE_LIMITED");
  });

  it("parseBatchBooks and feeChangesVerdict fail closed on empty or garbage input", () => {
    assert.equal(parseBatchBooks("x"), null);
    assert.equal(parseBatchBooks(null), null);
    assert.equal(feeChangesVerdict(null, [TICKER]), "inconclusive");
    assert.equal(feeChangesVerdict({ cursor: "abc" }, [TICKER]), "inconclusive");
    assert.equal(feeChangesVerdict({ changes: ["x"] }, [TICKER]), "inconclusive");
    assert.equal(feeChangesVerdict({}, [TICKER]), "clear");
  });
});
