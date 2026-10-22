import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { Market, TokenRef } from "../../model.js";
import { createXoAdapter, isXoAdapterError, xoBookAvailability, xoCaps, xoVariantForMode, XoAdapterError, type XoAdapter, type XoVariant } from "./index.js";
import { manualClock, scriptedFetch, type ScriptedReply, type ScriptedRoute } from "./testkit.js";

// The daemon-fetch variant switch (Cockpit versus standalone), books, /fee-rate and health. Offline fixtures only.

const FIXTURES = new URL("./fixtures/", import.meta.url);
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8")) as unknown;
type Rec = Record<string, unknown>;
const clone = <T>(value: T): T => structuredClone(value);

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const DATA = "api-mainnet.xo.market";
const BOOKS = "orderbooks.xo.market";
const FEE400 = "0xb63d8f77fc1437a804d5fdeedb4c00dc49e1d7c7738f6410c36f1f44e6cfd654";
const YES = "68215442288791572296498952759094916177229244750752613990844701608971303593663";
const NO = "6530318981470987186894988035298961845748217855361759807272408942024241321361";
// live-orderbook-book-fractional.json is the book of this token.
const FRACTIONAL = "92405223113781133805412284720343870251774119932157196615021237861128430695593";

// A health probe asks for one row, so the recorded page is cut to one.
const oneRowList = (): unknown => {
  const body = clone(fixture("live-data-list-active.json")) as { data: unknown[] };
  body.data = body.data.slice(0, 1);
  return body;
};

const token = (tokenId: string, venue: TokenRef["venue"] = "xo"): TokenRef => ({ venue, tokenId });

function bookRoute(tokenId: string, reply: ScriptedReply | ((url: URL) => ScriptedReply)): ScriptedRoute {
  return { host: BOOKS, path: "/book", query: { token_id: tokenId }, reply };
}

function build(routes: readonly ScriptedRoute[], variant: XoVariant, extra: { requestTimeoutMs?: number } = {}) {
  const { fetch, calls } = scriptedFetch(routes);
  const clock = manualClock(NOW);
  const adapter: XoAdapter = createXoAdapter({ fetch, nowMs: clock.nowMs }, { variant, ...extra });
  return { adapter, calls, clock };
}

async function failure(promise: Promise<unknown>): Promise<XoAdapterError> {
  try {
    await promise;
  } catch (error) {
    if (isXoAdapterError(error)) return error;
    throw error;
  }
  throw new Error("expected a XoAdapterError");
}

describe("variant switch", () => {
  it("selects the Cockpit variant only for the exact mode name", () => {
    expect(xoVariantForMode("cockpit")).toBe("cockpit");
    for (const mode of ["standalone", "development", "test", "production", "Cockpit", "cockpit ", ""]) expect(xoVariantForMode(mode)).toBe("standalone");
  });

  it("states what each variant can do, and always says polling only", () => {
    expect(xoCaps("standalone")).toEqual({
      listMarkets: true,
      search: true,
      getMarket: true,
      getBook: false,
      getBooksBatch: false,
      getFeeSpec: true,
      getResolution: true,
      getPositionsByAddress: false,
      stream: false,
    });
    expect(xoCaps("cockpit").getBook).toBe(true);
    expect(xoCaps("cockpit").stream).toBe(false);
  });

  it("shows the fixed 'needs the Cockpit' tile where a standalone book would be", () => {
    expect(xoBookAvailability(xoCaps("standalone"))).toEqual({ state: "needs_cockpit", text: "needs the Cockpit" });
    expect(xoBookAvailability(xoCaps("cockpit"))).toEqual({ state: "available" });
  });

  it("refuses an unknown variant", () => {
    const { fetch } = scriptedFetch([]);
    expect(() => createXoAdapter({ fetch, nowMs: () => NOW }, { variant: "hosted" as XoVariant })).toThrow(RangeError);
  });
});

describe("standalone: no books, and no request to the orderbook host", () => {
  it("answers NOT_SUPPORTED for every token without sending anything (M0-2, M0-8)", async () => {
    const { adapter, calls } = build([], "standalone");
    const results = await adapter.getBooks([token(YES), token(NO), token("junk")], { deadlineMs: 5000 });
    expect(results).toEqual([
      { ok: false, error: "NOT_SUPPORTED" },
      { ok: false, error: "NOT_SUPPORTED" },
      { ok: false, error: "NOT_SUPPORTED" },
    ]);
    expect(calls).toHaveLength(0);
    expect(adapter.caps.getBook).toBe(false);
  });

  it("answers an empty token list with an empty list", async () => {
    const { adapter, calls } = build([], "standalone");
    expect(await adapter.getBooks([], { deadlineMs: 5000 })).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("reads the fee spec from the Data API alone", async () => {
    const detail = clone(fixture("live-data-detail-fee-400.json"));
    const { adapter, calls } = build([{ host: DATA, path: `/api/markets/contract/${FEE400}`, reply: { body: detail } }], "standalone");
    const market = { ref: { venue: "xo", marketId: FEE400, native: {} } } as Market;
    const spec = await adapter.getFeeSpec(market);
    expect(spec.modelId).toBe("ad_valorem_bps");
    expect(spec.taker?.bps).toBe(400);
    expect(calls.map((call) => call.url.hostname)).toEqual([DATA]);
  });

  it("health probes the Data API and says the order book state needs the Cockpit", async () => {
    const { adapter, calls } = build([{ host: DATA, path: "/api/markets", reply: { body: oneRowList() } }], "standalone");
    const health = await adapter.health();
    expect(health.ok).toBe(true);
    expect(health.notes).toEqual(["data api: reachable", "order book state needs the Cockpit"]);
    expect(calls).toHaveLength(1);
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual({ marketType: "2,4", statuses: "ACTIVE", take: "1", page: "1" });
  });

  it("health is not ok when the Data API is unreachable", async () => {
    const { adapter } = build([{ host: DATA, path: "/api/markets", reply: { reject: true } }], "standalone");
    expect(await adapter.health()).toEqual({ ok: false, notes: ["data api: TIMEOUT", "order book state needs the Cockpit"] });
  });
});

describe("cockpit: books", () => {
  it("reads a book, keeps sizes as shares, sorts both sides and marks it native", async () => {
    const wire = clone(fixture("live-orderbook-book-fractional.json")) as { bids: unknown[]; asks: unknown[] };
    // Shuffle the wire order: the adapter must not trust it.
    wire.bids.reverse();
    wire.asks.reverse();
    const { adapter, calls } = build([bookRoute(FRACTIONAL, { body: wire })], "cockpit");
    const [result] = await adapter.getBooks([token(FRACTIONAL)], { deadlineMs: 5000 });
    expect(calls[0]?.url.href).toBe(`https://orderbooks.xo.market/book?token_id=${FRACTIONAL}`);
    expect(result?.ok).toBe(true);
    if (result === undefined || !result.ok) throw new Error("unreachable");
    const book = result.value;
    expect(book.bids.map((level) => level.price)).toEqual(["0.1", "0.041", "0.04", "0.02", "0.01"]);
    expect(book.asks.map((level) => level.price)).toEqual(["0.35", "0.4", "0.5", "0.96"]);
    // Shares, not micro-shares: "1271.980687" stays 1271.980687 and is not scaled by 1e6 in either direction.
    expect(book.bids.map((level) => level.size)).toEqual(["50", "1271.980687", "1000", "300", "1000"]);
    expect(book.asks.map((level) => level.size)).toEqual(["20.317466", "28.571424", "10", "200"]);
    expect(book.derived).toBe("native");
    expect(book.token).toEqual({ venue: "xo", tokenId: FRACTIONAL });
    expect(book.asOfMs).toBe(NOW);
    expect(book.venueTsMs).toBe(1792352671117);
    expect(book.hash).toBe("80d1fea4b8b259aebc5afdc489ac9ee983feb81f49522ad484ba9fbe947245c1");
  });

  it("keeps a one-sided book as one side, and reports a book with no orders on either side as EMPTY_BOOK", async () => {
    const oneSided = clone(fixture("live-orderbook-book-fractional.json")) as Rec;
    oneSided.asks = [];
    const empty = fixture("live-orderbook-book-empty.json") as Rec;
    const { adapter } = build([bookRoute(FRACTIONAL, { body: oneSided }), bookRoute(YES, { body: empty })], "cockpit");
    const [a, b] = await adapter.getBooks([token(FRACTIONAL), token(YES)], { deadlineMs: 5000 });
    expect(a?.ok).toBe(true);
    if (a !== undefined && a.ok) {
      expect(a.value.asks).toEqual([]);
      expect(a.value.bids).toHaveLength(5);
    }
    expect(b).toEqual({ ok: false, error: "EMPTY_BOOK" });
  });

  it("maps a missing book to NOT_FOUND and a book for another token to SCHEMA_DRIFT", async () => {
    const other = fixture("orderbook-book.json");
    const { adapter } = build(
      [bookRoute(YES, { status: 404, body: fixture("orderbook-error-404-book-unknown-token.json") }), bookRoute(NO, { body: other })],
      "cockpit",
    );
    expect(await adapter.getBooks([token(YES), token(NO)], { deadlineMs: 5000 })).toEqual([
      { ok: false, error: "NOT_FOUND" },
      { ok: false, error: "SCHEMA_DRIFT" },
    ]);
  });

  it("refuses a crossed or locked book as SCHEMA_DRIFT instead of showing it", async () => {
    // The recorded two-sided book with its best levels edited (a synthetic edit of a capture) so the bid meets or
    // passes the ask.
    const crossed = clone(fixture("live-orderbook-book-two-sided.json")) as Rec;
    crossed.bids = [{ price: "0.500", size: "10" }];
    crossed.asks = [{ price: "0.400", size: "10" }];
    const locked = clone(fixture("live-orderbook-book-two-sided.json")) as Rec;
    locked.bids = [{ price: "0.400", size: "10" }];
    locked.asks = [{ price: "0.400", size: "10" }];
    const twoSided = String((fixture("live-orderbook-book-two-sided.json") as Rec).asset_id);
    for (const body of [crossed, locked]) {
      const { adapter } = build([bookRoute(twoSided, { body })], "cockpit");
      expect(await adapter.getBooks([token(twoSided)], { deadlineMs: 5000 })).toEqual([{ ok: false, error: "SCHEMA_DRIFT" }]);
    }
    const { adapter } = build([bookRoute(twoSided, { body: fixture("live-orderbook-book-two-sided.json") })], "cockpit");
    const [intact] = await adapter.getBooks([token(twoSided)], { deadlineMs: 5000 });
    expect(intact?.ok).toBe(true);
  });

  it("does not request a token that is not a decimal id or not an XO token", async () => {
    const { adapter, calls } = build([], "cockpit");
    const results = await adapter.getBooks([token("0xabc"), token(""), token("12 3"), token(YES, "polymarket")], { deadlineMs: 5000 });
    expect(results.every((result) => !result.ok && result.error === "NOT_FOUND")).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("asks once for a token named twice", async () => {
    const { adapter, calls } = build([bookRoute(FRACTIONAL, { body: fixture("live-orderbook-book-fractional.json") })], "cockpit");
    const results = await adapter.getBooks([token(FRACTIONAL), token(FRACTIONAL)], { deadlineMs: 5000 });
    expect(results.map((result) => result.ok)).toEqual([true, true]);
    expect(calls).toHaveLength(1);
  });

  it("spends the whole-call deadline on the injected clock and reports the rest as TIMEOUT", async () => {
    const wire = fixture("live-orderbook-book-fractional.json");
    const tokens = ["1", "2", "3", "4"];
    let advance: (ms: number) => void = () => undefined;
    const routes = tokens.map((id) => bookRoute(id, () => {
      advance(600);
      return { body: { ...(wire as Rec), asset_id: id } };
    }));
    const { adapter, calls, clock } = build(routes, "cockpit");
    advance = clock.advance;
    const results = await adapter.getBooks(tokens.map((id) => token(id)), { deadlineMs: 1000 });
    // 1000 ms budget: the first request starts at 0 ms, the second at 600 ms, the third would start at 1200 ms.
    expect(results.map((result) => (result.ok ? "ok" : result.error))).toEqual(["ok", "ok", "TIMEOUT", "TIMEOUT"]);
    expect(calls).toHaveLength(2);
  });

  it("treats a zero, negative or non-finite deadline as no time at all", async () => {
    for (const deadlineMs of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { adapter, calls } = build([bookRoute(YES, { body: fixture("live-orderbook-book-two-sided.json") })], "cockpit");
      const [result] = await adapter.getBooks([token(YES)], { deadlineMs });
      expect(result).toEqual({ ok: false, error: "TIMEOUT" });
      expect(calls).toHaveLength(0);
    }
  });

  it("gives up on a hung upstream when the request ceiling passes", async () => {
    const { adapter } = build([bookRoute(YES, { hang: true })], "cockpit", { requestTimeoutMs: 25 });
    const [result] = await adapter.getBooks([token(YES)], { deadlineMs: 60_000 });
    expect(result).toEqual({ ok: false, error: "TIMEOUT" });
  });

  it("reports a rate limit and a refusal per token, and keeps the other results", async () => {
    const { adapter } = build(
      [
        bookRoute(YES, { status: 429, headers: { "retry-after": "3" }, body: {} }),
        bookRoute(NO, { status: 403, body: {} }),
        bookRoute(FRACTIONAL, { body: fixture("live-orderbook-book-fractional.json") }),
      ],
      "cockpit",
    );
    const results = await adapter.getBooks([token(YES), token(NO), token(FRACTIONAL)], { deadlineMs: 5000 });
    expect(results.map((result) => (result.ok ? "ok" : result.error))).toEqual(["RATE_LIMITED", "VENUE_PAUSED", "ok"]);
  });
});

describe("cockpit: fee spec", () => {
  const detailRoute: ScriptedRoute = { host: DATA, path: `/api/markets/contract/${FEE400}`, reply: { body: fixture("live-data-detail-fee-400.json") } };
  const market = { ref: { venue: "xo", marketId: FEE400, native: {} } } as Market;
  const rate = (tokenId: string, reply: ScriptedReply): ScriptedRoute => ({ host: BOOKS, path: "/fee-rate", query: { token_id: tokenId }, reply });

  it("uses the larger of the Data API figure and /fee-rate, which only ever raises it", async () => {
    const zero = build([detailRoute, rate(YES, { body: { base_fee: 0 } }), rate(NO, { body: { base_fee: 0 } })], "cockpit");
    expect((await zero.adapter.getFeeSpec(market)).taker?.bps).toBe(400);
    const higher = build([detailRoute, rate(YES, { body: { base_fee: 0 } }), rate(NO, { body: { base_fee: 800 } })], "cockpit");
    const spec = await higher.adapter.getFeeSpec(market);
    expect(spec.taker).toEqual({ bps: 800, rate: "0.08" });
    expect(spec.modelId).toBe("ad_valorem_bps");
  });

  it("falls back to the Data API figure when /fee-rate fails, but not when it answers something that is not a fee", async () => {
    const down = build([detailRoute, rate(YES, { status: 500, body: {} }), rate(NO, { reject: true })], "cockpit");
    expect((await down.adapter.getFeeSpec(market)).taker?.bps).toBe(400);
    const odd = build([detailRoute, rate(YES, { body: { base_fee: "800" } }), rate(NO, { body: { base_fee: -1 } })], "cockpit");
    expect((await odd.adapter.getFeeSpec(market)).taker?.bps).toBe(400);
  });

  it("stays unknown when the Data API has no usable config, even if /fee-rate answers a figure", async () => {
    const body = clone(fixture("live-data-detail-fee-400.json")) as Rec;
    delete body.effectiveFeeConfig;
    const { adapter } = build(
      [{ host: DATA, path: `/api/markets/contract/${FEE400}`, reply: { body } }, rate(YES, { body: { base_fee: 800 } }), rate(NO, { body: { base_fee: 800 } })],
      "cockpit",
    );
    expect((await adapter.getFeeSpec(market)).modelId).toBe("unknown");
  });
});

describe("cockpit: health", () => {
  const list: ScriptedRoute = { host: DATA, path: "/api/markets", reply: { body: oneRowList() } };
  const state = (reply: ScriptedReply): ScriptedRoute => ({ host: BOOKS, path: "/trading-state", reply });

  it("is ok while trading is active", async () => {
    const { adapter } = build([list, state({ body: fixture("orderbook-trading-state.json") })], "cockpit");
    expect(await adapter.health()).toEqual({ ok: true, notes: ["data api: reachable", "trading: active"] });
  });

  it("is not ok when trading is paused or the state is anything else", async () => {
    const paused = build([list, state({ body: { state: "paused" } })], "cockpit");
    expect(await paused.adapter.health()).toEqual({ ok: false, notes: ["data api: reachable", "trading: paused"] });
    for (const body of [{ state: "maintenance" }, { state: 1 }, {}, [], null]) {
      const { adapter } = build([list, state({ body })], "cockpit");
      expect(await adapter.health()).toEqual({ ok: false, notes: ["data api: reachable", "trading: unknown state"] });
    }
  });

  it("reports an unreachable order book without hiding that the Data API is up", async () => {
    const { adapter } = build([list, state({ status: 403, body: {} })], "cockpit");
    expect(await adapter.health()).toEqual({ ok: false, notes: ["data api: reachable", "order book: VENUE_PAUSED"] });
  });
});
