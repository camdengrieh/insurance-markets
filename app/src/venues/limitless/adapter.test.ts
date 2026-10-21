import { describe, expect, it } from "vitest";

import { decide } from "../../../../bridge/allowlist";
import { FetchError, resolveUpstream } from "../../core/fetch";
import type { AdapterDeps, Book, Market, MarketRef, Result, TokenRef } from "../../core/ports";
import { isUntrusted } from "../../core/untrusted";
import { DEFAULT_SWITCHES, type VenueSwitches } from "../../core/venue-policy";
import { isAdapterFailure } from "./errors";
import { fakeFetch, type FakeRoute } from "./fixtures/fake-fetch";
import detailRecorded from "./fixtures/market_detail_recorded.json";
import listCaptured from "./fixtures/markets_active_list_captured_2026-10-20.json";
import bookRecorded from "./fixtures/orderbook_recorded.json";
import { createLimitlessAdapter, limitlessRegisteredOrigin, type LimitlessAdapter } from "./index";

// Fixed clock: 2026-10-19, the day the fixtures were recorded. Nothing here reads the real time or network.
const NOW = 1_792_368_171_000;
const ORIGIN = "https://api.limitless.exchange";
const SLUG = detailRecorded.slug;
const YES = detailRecorded.tokens.yes;
const NO = detailRecorded.tokens.no;

function rig(routes: Record<string, FakeRoute>, options: { build?: "standalone" | "cockpit"; switches?: VenueSwitches; origin?: string } = {}) {
  const fake = fakeFetch(routes);
  const deps: AdapterDeps = { fetch: fake.fetch, nowMs: () => NOW };
  const adapter: LimitlessAdapter = createLimitlessAdapter(deps, {
    build: options.build ?? "cockpit",
    ...(options.switches === undefined ? {} : { switches: () => options.switches as VenueSwitches }),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
  });
  return { ...fake, adapter };
}

const DETAIL = `GET ${ORIGIN}/markets/${SLUG}`;
const BOOK = `GET ${ORIGIN}/markets/${SLUG}/orderbook`;
const LIST = `GET ${ORIGIN}/markets/active`;

function ref(slug: string): MarketRef {
  return { venue: "limitless", marketId: slug, native: { slug } };
}
function token(tokenId: string, marketId?: string): TokenRef {
  return { venue: "limitless", tokenId, ...(marketId === undefined ? {} : { marketId }) };
}
async function failureOf(promise: Promise<unknown>): Promise<{ code: string; detail: string; retryAfterMs: number | null }> {
  try {
    await promise;
  } catch (error) {
    if (isAdapterFailure(error)) return { code: error.code, detail: error.detail, retryAfterMs: error.retryAfterMs };
    throw error;
  }
  throw new Error("expected a failure");
}
function okBook(result: Result<Book, string> | undefined): Book {
  if (result === undefined || !result.ok) throw new Error(`expected a book, got ${JSON.stringify(result)}`);
  return result.value;
}
function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...detailRecorded, ...overrides };
}
// The list envelope as captured live on 2026-10-20 (data, totalMarketsCount); a test that needs other rows or another
// total puts them into this envelope.
function listOf(data: unknown[], totalMarketsCount: number): Record<string, unknown> {
  return { ...(listCaptured as Record<string, unknown>), data, totalMarketsCount };
}
function level(price: number, size: number, side: "BUY" | "SELL") {
  return { price, size, side };
}
function bookBody(bids: unknown[], asks: unknown[], tokenId = YES) {
  return { bids, asks, tokenId };
}

describe("registry", () => {
  it("takes the host from headers.config.ts, the single source of truth", () => {
    expect(limitlessRegisteredOrigin("limitless")).toBe(ORIGIN);
    expect(rig({}).adapter.origin).toBe(ORIGIN);
  });
});

describe("fixture contract (M0-1)", () => {
  it("reads the recorded market: ids stay decimal strings, roles are fixed, the price is a display price", async () => {
    const { adapter, calls } = rig({ [DETAIL]: { json: detailRecorded } });
    const market = await adapter.getMarket(ref(SLUG));
    expect(calls).toHaveLength(1);
    expect(market.ref).toMatchObject({ venue: "limitless", marketId: SLUG });
    expect(market.outcomes.map((o) => [o.index, o.role, o.tokenId])).toEqual([
      [0, "yes", YES],
      [1, "no", NO],
    ]);
    expect(market.outcomes.every((o) => isUntrusted(o.label))).toBe(true);
    expect(isUntrusted(market.title)).toBe(true);
    expect(market.title.value).toBe("Will Trump acquire Greenland before 2027?");
    expect(market.status).toBe("active");
    expect(market.collateral).toEqual({ symbol: "USDC", chain: "eip155:8453", decimals: 6, custody: "self" });
    // Never claimed tradable by a read-only adapter, and the fee is unknown so it fails closed.
    expect(market.tradable.ok).toBe(false);
    expect(market.tradable.reasons).toContain("fee_model_unknown");
    expect(market.fee.modelId).toBe("unknown");
    expect(market.fee.ttlSec).toBe(0);
    expect(market.prov.adapterVersion).toBe("limitless-0.1");
  });

  it("lists with exact decimal display prices and a volume in dollars, not micro-units", async () => {
    const { adapter } = rig({ [LIST]: { json: listOf([detailRecorded], 1) } });
    const page = await adapter.listMarkets({});
    const item = page.items[0];
    expect(item?.outcomes.map((o) => o.displayPrice)).toEqual(["0.451", "0.549"]);
    expect(item?.volume).toEqual({ amount: "25670.282381", unit: "usd", windowHours: null });
    expect(item?.prov.transport).toBe("T1");
    expect(item?.prov.license).toBe("unknown");
    expect(page.next).toBeNull();
  });

  it("reads the captured live list: three real markets, each modelled or counted, none invented", async () => {
    const { adapter } = rig({ [LIST]: { json: listCaptured } });
    const page = await adapter.listMarkets({ limit: 3 });
    const report = adapter.lastReadReport();
    expect(report.parsed + report.dropped + report.skippedUnsupported).toBe(listCaptured.data.length);
    expect(page.items.map((i) => i.ref.marketId)).toEqual(listCaptured.data.slice(0, page.items.length).map((m) => m.slug));
  });

  it("reads the recorded YES book: sizes are shares (6-dp base units), prices exact, sorted explicitly", async () => {
    const { adapter, calls } = rig({ [DETAIL]: { json: detailRecorded }, [BOOK]: { json: bookRecorded } });
    const results = await adapter.getBooks([token(YES, SLUG)], { deadlineMs: 5_000 });
    const book = okBook(results[0]);
    expect(book.bids).toEqual([{ price: "0.003", size: "863.898323" }]);
    expect(book.asks.map((l) => l.price)).toEqual(["0.899", "0.9", "0.95", "0.997"]);
    expect(book.asks[0]?.size).toBe("12.362");
    expect(book.derived).toBe("native");
    expect(book.token).toEqual({ venue: "limitless", tokenId: YES });
    expect(calls.map((c) => c.url)).toEqual([`${ORIGIN}/markets/${SLUG}`, `${ORIGIN}/markets/${SLUG}/orderbook`]);
  });

  it("serves the NO token as the exact complement of the YES book, labelled so, from one venue book", async () => {
    const { adapter, calls } = rig({ [DETAIL]: { json: detailRecorded }, [BOOK]: { json: bookRecorded } });
    const results = await adapter.getBooks([token(YES, SLUG), token(NO, SLUG)], { deadlineMs: 5_000 });
    const no = okBook(results[1]);
    expect(no.derived).toBe("complement");
    expect(no.bids.map((l) => l.price)).toEqual(["0.101", "0.1", "0.05", "0.003"]);
    expect(no.bids[0]?.size).toBe("12.362");
    expect(no.asks).toEqual([{ price: "0.997", size: "863.898323" }]);
    // One detail read and one book read serve both tokens.
    expect(calls).toHaveLength(2);
  });

  it("sorts a shuffled book explicitly and merges equal prices", async () => {
    const body = bookBody(
      [level(0.2, 1_000_000, "BUY"), level(0.4, 2_000_000, "BUY"), level(0.2, 3_000_000, "BUY")],
      [level(0.9, 1_000_000, "SELL"), level(0.6, 1_500_000, "SELL")],
    );
    const { adapter } = rig({ [DETAIL]: { json: detailRecorded }, [BOOK]: { json: body } });
    const book = okBook((await adapter.getBooks([token(YES, SLUG)], { deadlineMs: 5_000 }))[0]);
    expect(book.bids).toEqual([
      { price: "0.4", size: "2" },
      { price: "0.2", size: "4" },
    ]);
    expect(book.asks.map((l) => l.price)).toEqual(["0.6", "0.9"]);
  });
});

describe("books fail closed", () => {
  const cases: Array<[string, unknown]> = [
    ["a crossed book", bookBody([level(0.6, 1_000_000, "BUY")], [level(0.5, 1_000_000, "SELL")])],
    ["a price of zero", bookBody([level(0, 1_000_000, "BUY")], [level(0.5, 1_000_000, "SELL")])],
    ["a price of one", bookBody([level(0.2, 1_000_000, "BUY")], [level(1, 1_000_000, "SELL")])],
    ["a price above one", bookBody([level(0.2, 1_000_000, "BUY")], [level(1.4, 1_000_000, "SELL")])],
    ["a negative size", bookBody([level(0.2, -5, "BUY")], [level(0.5, 1_000_000, "SELL")])],
    ["a fractional size", bookBody([level(0.2, 1.5, "BUY")], [level(0.5, 1_000_000, "SELL")])],
    ["a bid labelled SELL", bookBody([level(0.2, 1_000_000, "SELL")], [level(0.5, 1_000_000, "SELL")])],
    ["a book for another token", bookBody([level(0.2, 1_000_000, "BUY")], [level(0.5, 1_000_000, "SELL")], "99")],
    ["a string price", bookBody([{ price: "0.2", size: 1_000_000 }], [])],
    ["a missing side", { bids: [], tokenId: YES }],
  ];
  for (const [name, body] of cases) {
    it(`reports SCHEMA_DRIFT for ${name}`, async () => {
      const { adapter } = rig({ [DETAIL]: { json: detailRecorded }, [BOOK]: { json: body } });
      expect((await adapter.getBooks([token(YES, SLUG)], { deadlineMs: 5_000 }))[0]).toEqual({ ok: false, error: "SCHEMA_DRIFT" });
    });
  }

  it("reports EMPTY_BOOK for two empty sides, and returns a one-sided book as it is", async () => {
    const empty = rig({ [DETAIL]: { json: detailRecorded }, [BOOK]: { json: bookBody([], []) } });
    expect((await empty.adapter.getBooks([token(YES, SLUG)], { deadlineMs: 5_000 }))[0]).toEqual({ ok: false, error: "EMPTY_BOOK" });
    const one = rig({ [DETAIL]: { json: detailRecorded }, [BOOK]: { json: bookBody([level(0.3, 2_000_000, "BUY")], []) } });
    const book = okBook((await one.adapter.getBooks([token(YES, SLUG)], { deadlineMs: 5_000 }))[0]);
    expect(book.bids).toHaveLength(1);
    expect(book.asks).toEqual([]);
  });

  it("drops zero-size levels instead of showing depth that is not there", async () => {
    const body = bookBody([level(0.3, 0, "BUY"), level(0.2, 1_000_000, "BUY")], [level(0.5, 0, "SELL")]);
    const { adapter } = rig({ [DETAIL]: { json: detailRecorded }, [BOOK]: { json: body } });
    const book = okBook((await adapter.getBooks([token(YES, SLUG)], { deadlineMs: 5_000 }))[0]);
    expect(book.bids).toEqual([{ price: "0.2", size: "1" }]);
    expect(book.asks).toEqual([]);
  });

  it("does not guess which market a bare token id belongs to", async () => {
    const { adapter, calls } = rig({});
    expect(await adapter.getBooks([token(YES)], { deadlineMs: 5_000 })).toEqual([{ ok: false, error: "NOT_FOUND" }]);
    expect(calls).toHaveLength(0);
  });

  it("refuses a market hint whose token pair does not contain the token", async () => {
    const { adapter } = rig({ [DETAIL]: { json: detailRecorded }, [BOOK]: { json: bookRecorded } });
    expect(await adapter.getBooks([token("123456", SLUG)], { deadlineMs: 5_000 })).toEqual([{ ok: false, error: "NOT_FOUND" }]);
  });

  it("maps tokens of another venue and malformed ids to NOT_SUPPORTED without a request", async () => {
    const { adapter, calls } = rig({});
    const results = await adapter.getBooks([{ venue: "kalshi", tokenId: "X#yes" }, token("0xabc")], { deadlineMs: 5_000 });
    expect(results).toEqual([
      { ok: false, error: "NOT_SUPPORTED" },
      { ok: false, error: "NOT_SUPPORTED" },
    ]);
    expect(calls).toHaveLength(0);
  });

  it("does not offer books for a market that is not a CLOB", async () => {
    const amm = row({ tradeType: "amm" });
    const { adapter } = rig({ [DETAIL]: { json: amm } });
    expect(await adapter.getBooks([token(YES, SLUG)], { deadlineMs: 5_000 })).toEqual([{ ok: false, error: "NOT_SUPPORTED" }]);
    const market = await adapter.getMarket(ref(SLUG));
    expect(market.tradable.reasons).toContain("trade_type_not_clob");
  });
});

describe("the venue is off until the Cockpit and the switch say so (M0-2)", () => {
  it("refuses every call in the standalone build before any request", async () => {
    const { adapter, calls } = rig({}, { build: "standalone" });
    expect(await failureOf(adapter.listMarkets({}))).toMatchObject({ code: "NOT_SUPPORTED", detail: "needs_cockpit" });
    expect(await failureOf(adapter.getMarket(ref(SLUG)))).toMatchObject({ code: "NOT_SUPPORTED", detail: "needs_cockpit" });
    expect(await adapter.getBooks([token(YES, SLUG)], { deadlineMs: 5_000 })).toEqual([{ ok: false, error: "NOT_SUPPORTED" }]);
    expect(await adapter.health()).toEqual({ ok: false, notes: ["needs_cockpit"] });
    expect(calls).toHaveLength(0);
  });

  it("refuses every call when the user switched the venue off", async () => {
    const off: VenueSwitches = { enabled: { limitless: false }, disclosureAccepted: {} };
    const { adapter, calls } = rig({}, { switches: off });
    expect(await failureOf(adapter.listMarkets({}))).toMatchObject({ code: "NOT_SUPPORTED", detail: "switched_off" });
    expect(calls).toHaveLength(0);
  });

  it("reads the switch on every call, so turning the venue off takes effect at once", async () => {
    let switches: VenueSwitches = DEFAULT_SWITCHES;
    const fake = fakeFetch({ [LIST]: { json: listOf([detailRecorded], 1) } });
    const adapter = createLimitlessAdapter({ fetch: fake.fetch, nowMs: () => NOW }, { build: "cockpit", switches: () => switches });
    await adapter.listMarkets({});
    switches = { enabled: { limitless: false }, disclosureAccepted: {} };
    expect(await failureOf(adapter.listMarkets({}))).toMatchObject({ detail: "switched_off" });
    expect(fake.calls).toHaveLength(1);
  });

  it("fails closed when no origin is registered", async () => {
    const { adapter, calls } = rig({}, { origin: "http://insecure.example" });
    expect(adapter.origin).toBeNull();
    expect(await failureOf(adapter.listMarkets({}))).toMatchObject({ code: "NOT_SUPPORTED", detail: "origin_not_registered" });
    expect(calls).toHaveLength(0);
  });
});

describe("status and rows", () => {
  const status = async (overrides: Record<string, unknown>, expected: string) => {
    const { adapter } = rig({ [DETAIL]: { json: row(overrides) } });
    expect((await adapter.getMarket(ref(SLUG))).status).toBe(expected);
  };
  it("maps only the states it has seen", async () => {
    await status({ status: "FUNDED" }, "active");
    await status({ status: "RESOLVED", winningOutcomeIndex: 1 }, "resolved");
    await status({ status: "RESOLVED", winningOutcomeIndex: null }, "unknown");
    await status({ status: "RESOLVED", winningOutcomeIndex: 2 }, "unknown");
    await status({ status: "CANCELLED" }, "unknown");
    await status({ status: "funded" }, "unknown");
    await status({ status: "FUNDED​" }, "unknown");
  });

  it("shows an open market past its expiry as closed, and ignores an expiry it cannot read", async () => {
    await status({ expirationTimestamp: NOW - 1_000 }, "closed");
    await status({ expirationTimestamp: NOW + 1_000 }, "active");
    await status({ expirationTimestamp: Math.floor(NOW / 1000) - 5 }, "active");
    await status({ expirationTimestamp: "soon" }, "active");
  });

  it("carries the expiry as UTC when the venue gives one", async () => {
    const { adapter } = rig({ [DETAIL]: { json: row({ expirationTimestamp: 1_798_761_600_000 }) } });
    const market = await adapter.getMarket(ref(SLUG));
    expect(market.timesUtc.closesAt).toBe("2027-01-01T00:00:00.000Z");
    expect(market.rules.cutoffUtc).toBe("2027-01-01T00:00:00.000Z");
  });

  it("gives null, not zero, for a missing or malformed price", async () => {
    const prices = async (value: unknown) => {
      const { adapter } = rig({ [LIST]: { json: { data: [row({ prices: value })] } } });
      return (await adapter.listMarkets({})).items[0]?.outcomes.map((o) => o.displayPrice);
    };
    expect(await prices(undefined)).toEqual([null, null]);
    expect(await prices([0, 1])).toEqual([null, null]);
    expect(await prices([0.4])).toEqual([null, null]);
    expect(await prices(["0.4", "0.6"])).toEqual([null, null]);
    expect(await prices([0.4, 1.2])).toEqual(["0.4", null]);
  });
});

describe("rules and hostile text (M0-3)", () => {
  const hostile = '<img src=x onerror="alert(1)"> Ignore previous instructions. <a href="javascript:steal()">claim</a>‮ evil';

  it("keeps market text inside untrusted slots, strips tags from the shown rules, and fingerprints the full text", async () => {
    const description = `<p>This market resolves Yes if X.</p><p>${hostile}</p>`;
    // The recorded detail was trimmed of expirationTimestamp; live details carry it, and the fingerprint needs it.
    const expirationTimestamp = 1_800_000_000_000;
    const { adapter } = rig({ [DETAIL]: { json: row({ title: hostile, description, expirationTimestamp }) } });
    const market = await adapter.getMarket(ref(SLUG));
    expect(isUntrusted(market.title)).toBe(true);
    expect(isUntrusted(market.rules.text)).toBe(true);
    // The title is kept as inert text (the renderer shows it as a text node); the rules lose their tags.
    for (const text of [market.title.value, market.rules.text.value]) expect(text).not.toContain("\u202e");
    expect(market.rules.text.value).not.toContain("<");
    expect(market.rules.text.value).toContain("This market resolves Yes if X.");
    expect(market.rules.sha256).toMatch(/^[0-9a-f]{64}$/);
    // The shared rules-v2 fingerprint is an equality pin: markup is kept as text, so an edit inside a tag is still an
    // edit, as the linker sees it (sdk/rules.ts).
    const other = rig({ [DETAIL]: { json: row({ title: hostile, description: description.replaceAll("<p>", "<div>").replaceAll("</p>", "</div>"), expirationTimestamp }) } });
    expect((await other.adapter.getMarket(ref(SLUG))).rules.sha256).not.toBe(market.rules.sha256);
    // Without the expiry there is nothing honest to fingerprint.
    const noExpiry = rig({ [DETAIL]: { json: row({ title: hostile, description }) } });
    expect((await noExpiry.adapter.getMarket(ref(SLUG))).rules.sha256).toBe("");
  });

  it("gives an empty fingerprint, never a fake one, when the venue sent no rules text", async () => {
    const { adapter } = rig({ [DETAIL]: { json: row({ description: undefined }) } });
    const market = await adapter.getMarket(ref(SLUG));
    expect(market.rules.text.value).toBe("");
    expect(market.rules.sha256).toBe("");
  });

  it("never puts upstream text in an error", async () => {
    const secret = "SECRET-TOKEN-IN-BODY";
    const { adapter } = rig({ [DETAIL]: { json: { slug: SLUG, title: secret, status: 5 } } });
    const failure = await failureOf(adapter.getMarket(ref(SLUG)));
    expect(JSON.stringify(failure)).not.toContain(secret);
    expect(failure.code).toBe("SCHEMA_DRIFT");
  });

  it("keeps only plain slugs from the venue's cross-venue hints", async () => {
    const hinted = row({ metadata: { isPolyArbitrage: true, externalSlug: "some-poly-slug", externalProvider: "polymarket" } });
    const a = await rig({ [DETAIL]: { json: hinted } }).adapter.getMarket(ref(SLUG));
    expect(a.ref.native).toMatchObject({ is_poly_arbitrage: "true", external_slug: "some-poly-slug", external_provider: "polymarket" });
    const bad = row({ metadata: { externalSlug: "javascript:alert(1)", externalProvider: "<b>" } });
    const b = await rig({ [DETAIL]: { json: bad } }).adapter.getMarket(ref(SLUG));
    expect(b.ref.native).not.toHaveProperty("external_slug");
    expect(b.ref.native).not.toHaveProperty("external_provider");
  });
});

describe("list", () => {
  it("skips group and non-USDC markets and counts them, drops malformed rows and counts those", async () => {
    const group = { slug: "a-group", marketType: "group", title: "G", markets: [] };
    const otherToken = row({ slug: "other-collateral", collateralToken: { address: "0x0000000000000000000000000000000000000001", decimals: 6, symbol: "XYZ" } });
    const wrongDecimals = row({ slug: "wrong-decimals", collateralToken: { ...detailRecorded.collateralToken, decimals: 18 } });
    const malformed = row({ slug: "bad-row", tokens: { yes: "abc", no: "1" } });
    const { adapter } = rig({ [LIST]: { json: listOf([detailRecorded, group, otherToken, wrongDecimals, malformed, row({ slug: "second-ok", tokens: { yes: "11", no: "22" } })], 6) } });
    const page = await adapter.listMarkets({ limit: 6 });
    expect(page.items.map((i) => i.ref.marketId)).toEqual([SLUG, "second-ok"]);
    expect(adapter.lastReadReport()).toMatchObject({ parsed: 2, dropped: 1, skippedUnsupported: 3 });
  });

  it("throws SCHEMA_DRIFT when every row is malformed or most are", async () => {
    const bad = row({ tokens: {} });
    const all = rig({ [LIST]: { json: { data: [bad, bad] } } });
    expect(await failureOf(all.adapter.listMarkets({}))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "no_valid_rows" });
    const most = rig({ [LIST]: { json: { data: [bad, bad, detailRecorded] } } });
    expect(await failureOf(most.adapter.listMarkets({}))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "too_many_invalid_rows" });
    const wrong = rig({ [LIST]: { json: { markets: [] } } });
    expect(await failureOf(wrong.adapter.listMarkets({}))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "list_shape" });
  });

  it("pages by page number, clamps the page size to the venue's 25, and stops at the total", async () => {
    const { adapter, calls } = rig({ [LIST]: { json: listOf([detailRecorded], 60) } });
    const first = await adapter.listMarkets({ limit: 100 });
    expect(calls[0]?.url).toBe(`${ORIGIN}/markets/active?limit=25&page=1`);
    expect(first.next).toBe("2");
    await adapter.listMarkets({ limit: 0, cursor: "3" });
    expect(calls[1]?.url).toBe(`${ORIGIN}/markets/active?limit=1&page=3`);
    const last = rig({ [LIST]: { json: listOf([detailRecorded], 21) } });
    expect((await last.adapter.listMarkets({ limit: 20, cursor: "2" })).next).toBeNull();
  });

  it("does not support text search, resolved-only listing, or a bad cursor, and sends nothing", async () => {
    const { adapter, calls } = rig({});
    expect(await failureOf(adapter.listMarkets({ text: "greenland" }))).toMatchObject({ code: "NOT_SUPPORTED", detail: "text_search" });
    expect(await failureOf(adapter.listMarkets({ statuses: ["resolved"] }))).toMatchObject({ code: "NOT_SUPPORTED", detail: "only_active_listed" });
    expect(await failureOf(adapter.listMarkets({ cursor: "0" }))).toMatchObject({ code: "NOT_SUPPORTED", detail: "bad_cursor" });
    expect(await failureOf(adapter.listMarkets({ cursor: "../x" }))).toMatchObject({ detail: "bad_cursor" });
    expect(calls).toHaveLength(0);
  });
});

describe("getMarket", () => {
  it("refuses a bad id without a request, a mismatched answer, and an unmodelled market", async () => {
    const { adapter, calls } = rig({ [DETAIL]: { json: detailRecorded } });
    expect(await failureOf(adapter.getMarket(ref("../etc/passwd")))).toMatchObject({ code: "NOT_FOUND", detail: "bad_market_id" });
    expect(await failureOf(adapter.getMarket({ venue: "kalshi", marketId: SLUG, native: {} }))).toMatchObject({ code: "NOT_SUPPORTED", detail: "wrong_venue" });
    expect(calls).toHaveLength(0);

    const mismatch = rig({ [DETAIL]: { json: row({ slug: "a-different-market" }) } });
    expect(await failureOf(mismatch.adapter.getMarket(ref(SLUG)))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "slug_mismatch" });

    const group = rig({ [DETAIL]: { json: row({ marketType: "group" }) } });
    expect(await failureOf(group.adapter.getMarket(ref(SLUG)))).toMatchObject({ code: "NOT_SUPPORTED", detail: "unsupported_market" });
  });

  it("reports the fee as unknown, already past its ttl", async () => {
    const { adapter } = rig({ [DETAIL]: { json: detailRecorded } });
    const market: Market = await adapter.getMarket(ref(SLUG));
    const fee = await adapter.getFeeSpec(market);
    expect(fee).toMatchObject({ modelId: "unknown", ttlSec: 0 });
  });
});

describe("transport outcomes", () => {
  const code = async (reply: FakeRoute) => {
    const { adapter } = rig({ [DETAIL]: reply });
    return failureOf(adapter.getMarket(ref(SLUG)));
  };

  it("maps HTTP statuses to the closed error set and never retries around a block", async () => {
    expect(await code({ status: 404 })).toMatchObject({ code: "NOT_FOUND" });
    expect(await code({ status: 429, headers: { "retry-after": "7" } })).toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 7_000 });
    expect(await code({ status: 403 })).toMatchObject({ code: "VENUE_PAUSED", retryAfterMs: 600_000 });
    expect(await code({ status: 401 })).toMatchObject({ code: "VENUE_PAUSED" });
    expect(await code({ status: 425 })).toMatchObject({ code: "VENUE_PAUSED", detail: "maintenance" });
    expect(await code({ status: 500 })).toMatchObject({ code: "VENUE_PAUSED" });
    expect(await code({ status: 504 })).toMatchObject({ code: "TIMEOUT" });
    expect(await code({ status: 418 })).toMatchObject({ code: "SCHEMA_DRIFT" });
  });

  it("maps a network failure, bad JSON and an oversize body", async () => {
    expect(await code({ reject: true })).toMatchObject({ code: "TIMEOUT" });
    expect(await code({ text: "<html>blocked</html>" })).toMatchObject({ code: "SCHEMA_DRIFT", detail: "invalid_json" });
    expect(await code({ text: "x".repeat(4_000_001) })).toMatchObject({ code: "SCHEMA_DRIFT", detail: "body_too_large" });
  });

  it("passes the fetch layer's own refusals through with their meaning", async () => {
    const paused = createLimitlessAdapter(
      {
        fetch: async () => {
          throw new FetchError("paused", "paused", { retryAfterMs: 5_000 });
        },
        nowMs: () => NOW,
      },
      { build: "cockpit" },
    );
    expect(await failureOf(paused.getMarket(ref(SLUG)))).toMatchObject({ code: "VENUE_PAUSED", retryAfterMs: 5_000 });
    const unpaired = createLimitlessAdapter(
      {
        fetch: async () => {
          throw new FetchError("unauthorized", "not paired");
        },
        nowMs: () => NOW,
      },
      { build: "cockpit" },
    );
    expect(await failureOf(unpaired.getMarket(ref(SLUG)))).toMatchObject({ code: "NOT_SUPPORTED" });
  });

  it("times out a hung upstream at the deadline, reading it as a duration or an absolute time", async () => {
    const { adapter } = rig({ [DETAIL]: { json: detailRecorded }, [BOOK]: { hang: true } });
    expect(await adapter.getBooks([token(YES, SLUG)], { deadlineMs: 20 })).toEqual([{ ok: false, error: "TIMEOUT" }]);
    const absolute = rig({ [DETAIL]: { json: detailRecorded }, [BOOK]: { hang: true } });
    expect(await absolute.adapter.getBooks([token(YES, SLUG)], { deadlineMs: NOW + 20 })).toEqual([{ ok: false, error: "TIMEOUT" }]);
  });

  it("health reports without throwing", async () => {
    const ok = rig({ [LIST]: { json: { data: [] } } });
    expect(await ok.adapter.health()).toEqual({ ok: true, notes: ["markets_active_answered"] });
    const maintenance = rig({ [LIST]: { status: 425 } });
    expect(await maintenance.adapter.health()).toEqual({ ok: false, notes: ["maintenance"] });
  });
});

describe("what leaves the page (M0-4, M1-3)", () => {
  it("sends GET requests with no headers, no body, to the registered origin only, and every one passes the daemon allowlist", async () => {
    const { adapter, calls } = rig({
      [LIST]: { json: listOf([detailRecorded], 1) },
      [DETAIL]: { json: detailRecorded },
      [BOOK]: { json: bookRecorded },
    });
    await adapter.listMarkets({ limit: 5 });
    await adapter.getMarket(ref(SLUG));
    await adapter.getBooks([token(YES, SLUG), token(NO, SLUG)], { deadlineMs: 5_000 });
    await adapter.health();
    expect(calls.length).toBeGreaterThan(3);
    for (const call of calls) {
      expect(call.method).toBe("GET");
      expect(call.headers).toEqual({});
      expect(call.body).toBeUndefined();
      const target = resolveUpstream(call.url);
      expect(target.service).toBe("limitless");
      expect(target.transport).toBe("daemon_only");
      const verdict = decide({ service: target.service, method: "GET", path: target.path, query: target.query });
      expect(verdict.ok, call.url).toBe(true);
    }
  });
});
