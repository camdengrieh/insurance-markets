import { describe, expect, it } from "vitest";

import { isSafeUpstreamPath, isSafeUpstreamQuery } from "@bridge/contract";

import { FetchError } from "../../core/fetch";
import type { AdapterDeps, Book, MarketRef, Result, TokenRef } from "../../core/ports";
import { isUntrusted } from "../../core/untrusted";
import { DISCLOSURE_VERSION, type VenueSwitches } from "../../core/venue-policy";
import { fakeFetch, type FakeRoute } from "../limitless/fixtures/fake-fetch";
import { isAdapterFailure } from "./errors";
import findRecorded from "./fixtures/markets_find_recorded.json";
import listRecorded from "./fixtures/markets_active_recorded.json";
import metadataRecorded from "./fixtures/metadata_recorded.json";
import btcBook from "./fixtures/orderbook_btc_recorded.json";
import nflBook from "./fixtures/orderbook_nfl_recorded.json";
import unauthRecorded from "./fixtures/unauth_401_recorded.json";
import { createSxAdapter, sxRegisteredOrigin, tokenIdOf, type SxAdapter } from "./index";

// Fixed clock: 2026-10-19 12:00 UTC, before the recorded crypto market expires (16:00 UTC).
const NOW = Date.parse("2026-10-19T12:00:00Z");
// A test origin. headers.config.ts does not list a host for SX Bet yet, so the adapter is given one here.
const ORIGIN = "https://sx.example.test";
const ROWS = listRecorded.data.markets as Array<Record<string, unknown> & { marketHash: string }>;
const FIND_ROW = findRecorded.data[0] as Record<string, unknown> & { marketHash: string };
const HASH = FIND_ROW.marketHash;
const NFL_HASH = nflBook.response.data.marketHash;
const BTC_HASH = btcBook.response.data.marketHash;
const ON: VenueSwitches = { enabled: { sx: true }, disclosureAccepted: {} };

function rig(routes: Record<string, FakeRoute>, options: { build?: "standalone" | "cockpit"; switches?: VenueSwitches; origin?: string } = {}) {
  const fake = fakeFetch(routes);
  const deps: AdapterDeps = { fetch: fake.fetch, nowMs: () => NOW };
  const adapter: SxAdapter = createSxAdapter(deps, {
    build: options.build ?? "cockpit",
    switches: () => options.switches ?? ON,
    origin: options.origin ?? ORIGIN,
  });
  return { ...fake, adapter };
}

function ref(hash: string): MarketRef {
  return { venue: "sx", marketId: hash, native: { market_hash: hash } };
}
function token(hash: string, side: 1 | 2): TokenRef {
  return { venue: "sx", tokenId: tokenIdOf(hash, side) };
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
  return { ...FIND_ROW, ...overrides };
}
function level(percent: string, stake: string) {
  return { percentageOdds: percent, size: stake };
}
function book(one: unknown[], two: unknown[], hash = NFL_HASH, version: string | null = "000001") {
  return { status: "success", data: { marketHash: hash, outcomeOne: one, outcomeTwo: two, version } };
}

const LIST = `GET ${ORIGIN}/markets/active`;
const FIND = `GET ${ORIGIN}/markets/find`;
const SNAPSHOT = `GET ${ORIGIN}/orderbook-v3/snapshot`;

describe("the venue is off by default and needs the Cockpit and a host (M0-2)", () => {
  it("is switched off until the user turns it on, and sends nothing while off", async () => {
    for (const switches of [{ enabled: {}, disclosureAccepted: {} }, { enabled: { sx: false }, disclosureAccepted: {} }] as VenueSwitches[]) {
      const { adapter, calls } = rig({}, { switches });
      expect(await failureOf(adapter.listMarkets({}))).toMatchObject({ code: "NOT_SUPPORTED", detail: "switched_off" });
      expect(await adapter.getBooks([token(HASH, 1)], { deadlineMs: 5_000 })).toEqual([{ ok: false, error: "NOT_SUPPORTED" }]);
      expect(await adapter.health()).toEqual({ ok: false, notes: ["switched_off"] });
      expect(calls).toHaveLength(0);
    }
  });

  it("refuses every call in the standalone build before any request", async () => {
    const { adapter, calls } = rig({}, { build: "standalone" });
    expect(await failureOf(adapter.listMarkets({}))).toMatchObject({ code: "NOT_SUPPORTED", detail: "needs_cockpit" });
    expect(await failureOf(adapter.getMarket(ref(HASH)))).toMatchObject({ detail: "needs_cockpit" });
    expect(calls).toHaveLength(0);
  });

  it("fails closed when no host is registered", async () => {
    const { adapter, calls } = rig({}, { origin: "http://insecure.example" });
    expect(adapter.origin).toBeNull();
    expect(await failureOf(adapter.listMarkets({}))).toMatchObject({ code: "NOT_SUPPORTED", detail: "origin_not_registered" });
    expect(await adapter.getBooks([token(HASH, 1)], { deadlineMs: 5_000 })).toEqual([{ ok: false, error: "NOT_SUPPORTED" }]);
    expect(calls).toHaveLength(0);
  });

  it("takes its host from headers.config.ts only, and a restricted-venue disclosure is not required", () => {
    // It names no host itself: with nothing registered it has none.
    const fake = fakeFetch({});
    const adapter = createSxAdapter({ fetch: fake.fetch, nowMs: () => NOW }, { build: "cockpit", switches: () => ({ enabled: { sx: true }, disclosureAccepted: { sx: DISCLOSURE_VERSION } }) });
    expect(adapter.origin).toBe(sxRegisteredOrigin("sx"));
  });
});

describe("fixture contract (M0-1)", () => {
  it("lists the recorded rows: hostile-safe titles, fixed outcome numbers, no price and no volume (null, not zero)", async () => {
    const { adapter, calls } = rig({ [LIST]: { json: listRecorded } });
    const page = await adapter.listMarkets({ limit: 3 });
    expect(calls[0]?.url).toBe(`${ORIGIN}/markets/active?pageSize=3`);
    expect(page.items.map((i) => i.ref.marketId)).toEqual(ROWS.map((r) => r.marketHash));
    const first = page.items[0];
    expect(isUntrusted(first?.title)).toBe(true);
    expect(first?.title.value).toBe("NFL: Dallas Cowboys vs Philadelphia Eagles: Over 49.5 / Under 49.5");
    expect(first?.status).toBe("active");
    expect(first?.closesAtUtc).toBeNull();
    expect(first?.ref.native).toEqual({ market_hash: ROWS[0]?.marketHash, game_time_utc: "2026-11-26T21:30:00.000Z" });
    expect(first?.outcomes.map((o) => [o.index, o.role, o.tokenId, o.displayPrice])).toEqual([
      [0, "label", `${ROWS[0]?.marketHash}#1`, null],
      [1, "label", `${ROWS[0]?.marketHash}#2`, null],
    ]);
    expect(first?.volume).toEqual({ amount: null, unit: "unknown", windowHours: null });
    expect(first?.prov).toMatchObject({ transport: "T1", license: "unknown" });
    expect(page.next).toBe(listRecorded.data.nextKey);
  });

  it("reads a crypto market with its expiry, and shows it closed once the expiry passes", async () => {
    const { adapter } = rig({ [FIND]: { json: findRecorded } });
    const market = await adapter.getMarket(ref(HASH));
    expect(market.timesUtc).toEqual({ closesAt: "2026-10-19T16:00:00.000Z" });
    expect(market.status).toBe("active");
    expect(market.tick).toBe("0.00125");
    expect(market.collateral).toEqual({ symbol: "USDC", chain: "eip155:4162", decimals: 6, custody: "smart_account" });
    expect(market.rules).toMatchObject({ sha256: "", sources: [], mechanism: "unknown" });
    expect(market.rules.cutoffUtc).toBe("2026-10-19T16:00:00.000Z");
    expect(market.tradable.ok).toBe(false);
    expect(market.tradable.reasons).toEqual(expect.arrayContaining(["rules_text_not_loaded", "fee_unknown_without_key", "legacy_book_route"]));
    const late = createSxAdapter({ fetch: fakeFetch({ [FIND]: { json: findRecorded } }).fetch, nowMs: () => Date.parse("2026-10-19T16:00:01Z") }, { build: "cockpit", switches: () => ON, origin: ORIGIN });
    expect((await late.getMarket(ref(HASH))).status).toBe("closed");
  });

  it("converts a maker stake at the maker's odds into shares exactly (BTC book, hand-checked)", async () => {
    const { adapter } = rig({ [SNAPSHOT]: { json: btcBook.response } });
    const [one, two] = await adapter.getBooks([token(BTC_HASH, 1), token(BTC_HASH, 2)], { deadlineMs: 5_000 });
    const first = okBook(one);
    // 63.75 USDC at 63.75 percent is 100 shares; 189 at 63 is 300; 183.375 at 61.125 is 300.
    expect(first.bids).toEqual([
      { price: "0.6375", size: "100" },
      { price: "0.63", size: "300" },
      { price: "0.61125", size: "300" },
    ]);
    // A taker buying outcome one pays 1 minus the odds of a maker betting on outcome two (32.75, 32, 31.375 percent).
    expect(first.asks).toEqual([
      { price: "0.6725", size: "100" },
      { price: "0.68", size: "300" },
      { price: "0.68625", size: "300" },
    ]);
    const second = okBook(two);
    expect(second.bids.map((l) => l.price)).toEqual(["0.3275", "0.32", "0.31375"]);
    expect(second.asks.map((l) => l.price)).toEqual(["0.3625", "0.37", "0.38875"]);
    expect(second.asks[0]?.size).toBe("100");
    // The frame is read from the docs and unverified by a fill: indicative, never executable.
    expect(first.derived).toBe("complement");
    expect(first.hash).toBe(btcBook.response.data.version);
  });

  it("rounds a share count DOWN to six decimals, never up", async () => {
    const { adapter } = rig({ [SNAPSHOT]: { json: nflBook.response } });
    const first = okBook((await adapter.getBooks([token(NFL_HASH, 1)], { deadlineMs: 5_000 }))[0]);
    // 8179.636363 USDC at 78 percent is 10486.713285897... shares: rounded down it is ...285, and rounding to the
    // nearest would give ...286, which would overstate the depth.
    const level78 = first.bids.find((l) => l.price === "0.78");
    expect(level78?.size).toBe("10486.713285");
    expect(first.bids[0]).toEqual({ price: "0.78375", size: "152" });
    // An uncrossed market: the best bid 0.78375 sits below the best ask 1 - 0.21 = 0.79.
    expect(first.asks[0]?.price).toBe("0.79");
    // Prices are sorted explicitly.
    expect(first.bids.map((l) => Number(l.price))).toEqual([...first.bids.map((l) => Number(l.price))].sort((a, b) => b - a));
  });

  it("serves both outcomes from one venue book", async () => {
    const { adapter, calls } = rig({ [SNAPSHOT]: { json: nflBook.response } });
    await adapter.getBooks([token(NFL_HASH, 1), token(NFL_HASH, 2)], { deadlineMs: 5_000 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${ORIGIN}/orderbook-v3/snapshot?marketHash=${NFL_HASH}`);
  });

  it("sorts a shuffled book explicitly and merges equal prices", async () => {
    const body = book([level("50000000000000000000", "1000000"), level("60000000000000000000", "3000000"), level("50000000000000000000", "1000000")], [level("30000000000000000000", "6000000")]);
    const { adapter } = rig({ [SNAPSHOT]: { json: body } });
    const first = okBook((await adapter.getBooks([token(NFL_HASH, 1)], { deadlineMs: 5_000 }))[0]);
    expect(first.bids).toEqual([
      { price: "0.6", size: "5" },
      { price: "0.5", size: "4" },
    ]);
  });
});

describe("books fail closed", () => {
  const cases: Array<[string, unknown]> = [
    ["a crossed book", book([level("60000000000000000000", "1000000")], [level("40000000000000000000", "1000000")])],
    ["a locked-or-worse book", book([level("70000000000000000000", "1000000")], [level("40000000000000000000", "1000000")])],
    ["odds off the ladder", book([level("50050000000000000000", "1000000")], [])],
    ["odds of zero", book([level("0", "1000000")], [])],
    ["odds of one hundred percent", book([level("100000000000000000000", "1000000")], [])],
    ["odds above one hundred percent", book([level("120000000000000000000", "1000000")], [])],
    ["a non-digit odds string", book([level("50.0", "1000000")], [])],
    ["a negative stake", book([level("50000000000000000000", "-1")], [])],
    ["a numeric stake", book([{ percentageOdds: "50000000000000000000", size: 1000000 }], [])],
    ["a book for another market", book([level("50000000000000000000", "1000000")], [], `0x${"a".repeat(64)}`)],
    ["a failure envelope", { status: "error", data: null }],
    ["a missing side", { status: "success", data: { marketHash: NFL_HASH, outcomeOne: [] } }],
  ];
  for (const [name, body] of cases) {
    it(`reports SCHEMA_DRIFT for ${name}`, async () => {
      const { adapter } = rig({ [SNAPSHOT]: { json: body } });
      expect((await adapter.getBooks([token(NFL_HASH, 1)], { deadlineMs: 5_000 }))[0]).toEqual({ ok: false, error: "SCHEMA_DRIFT" });
    });
  }

  it("accepts the two documented off-ladder exceptions, 0.1 and 99.9 percent", async () => {
    const body = book([level("99900000000000000000", "1000000")], [level("100000000000000000", "1000000")]);
    const { adapter } = rig({ [SNAPSHOT]: { json: body } });
    // 99.9 + 0.1 = 100: crossed, so it is still refused, but for being crossed and not for the odds.
    expect((await adapter.getBooks([token(NFL_HASH, 1)], { deadlineMs: 5_000 }))[0]).toEqual({ ok: false, error: "SCHEMA_DRIFT" });
    const ok = rig({ [SNAPSHOT]: { json: book([level("99900000000000000000", "1000000")], []) } });
    const first = okBook((await ok.adapter.getBooks([token(NFL_HASH, 1)], { deadlineMs: 5_000 }))[0]);
    expect(first.bids[0]?.price).toBe("0.999");
  });

  it("reports EMPTY_BOOK for two empty sides, and returns a one-sided book as it is", async () => {
    const empty = rig({ [SNAPSHOT]: { json: book([], []) } });
    expect(await empty.adapter.getBooks([token(NFL_HASH, 1)], { deadlineMs: 5_000 })).toEqual([{ ok: false, error: "EMPTY_BOOK" }]);
    const one = rig({ [SNAPSHOT]: { json: book([level("50000000000000000000", "2000000")], []) } });
    const first = okBook((await one.adapter.getBooks([token(NFL_HASH, 1)], { deadlineMs: 5_000 }))[0]);
    expect(first.bids).toEqual([{ price: "0.5", size: "4" }]);
    expect(first.asks).toEqual([]);
  });

  it("maps tokens of another venue and malformed ids to NOT_SUPPORTED without a request", async () => {
    const { adapter, calls } = rig({});
    const results = await adapter.getBooks([{ venue: "kalshi", tokenId: "X#1" }, { venue: "sx", tokenId: HASH }, { venue: "sx", tokenId: `${HASH}#3` }, { venue: "sx", tokenId: "0xabc#1" }], { deadlineMs: 5_000 });
    expect(results.every((r) => !r.ok && r.error === "NOT_SUPPORTED")).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe("status, rows and the list", () => {
  const status = async (overrides: Record<string, unknown>, expected: string) => {
    const { adapter } = rig({ [FIND]: { json: { status: "success", data: [row(overrides)] } } });
    expect((await adapter.getMarket(ref(HASH))).status).toBe(expected);
  };
  it("maps only ACTIVE and fails closed on every other value", async () => {
    await status({ status: "ACTIVE" }, "active");
    await status({ status: "SETTLED" }, "unknown");
    await status({ status: "active" }, "unknown");
    await status({ status: "ACTIVE​" }, "unknown");
  });

  it("ignores an expiry it cannot read, and reads a game time only as plausible unix seconds", async () => {
    await status({ marketMeta: "not json" }, "active");
    await status({ marketMeta: JSON.stringify({ expiresAt: "yesterday" }) }, "active");
    const { adapter } = rig({ [LIST]: { json: { status: "success", data: { markets: [{ ...ROWS[0], gameTime: 12345 }], nextKey: null } } } });
    const item = (await adapter.listMarkets({})).items[0];
    expect(item?.ref.native).not.toHaveProperty("game_time_utc");
    expect(item?.closesAtUtc).toBeNull();
  });

  it("skips markets that are not on the central book and counts them, drops malformed rows and counts those", async () => {
    const parlay = { ...ROWS[1], marketHash: `0x${"b".repeat(64)}`, tradingModes: ["RFQ"] };
    const broken = { ...ROWS[2], marketHash: "nope" };
    const { adapter } = rig({ [LIST]: { json: { status: "success", data: { markets: [ROWS[0], parlay, broken, ROWS[1]], nextKey: null } } } });
    const page = await adapter.listMarkets({});
    expect(page.items.map((i) => i.ref.marketId)).toEqual([ROWS[0]?.marketHash, ROWS[1]?.marketHash]);
    expect(adapter.lastReadReport()).toMatchObject({ parsed: 2, dropped: 1, skippedUnsupported: 1 });
    expect(page.next).toBeNull();
  });

  it("throws SCHEMA_DRIFT when every row is malformed, when most are, and when the envelope is wrong", async () => {
    const bad = { marketHash: "nope" };
    const env = (markets: unknown[]) => ({ status: "success", data: { markets, nextKey: null } });
    expect(await failureOf(rig({ [LIST]: { json: env([bad, bad]) } }).adapter.listMarkets({}))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "no_valid_rows" });
    expect(await failureOf(rig({ [LIST]: { json: env([bad, bad, ROWS[0]]) } }).adapter.listMarkets({}))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "too_many_invalid_rows" });
    expect(await failureOf(rig({ [LIST]: { json: { status: "error" } } }).adapter.listMarkets({}))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "list_shape" });
  });

  it("clamps the page size to the venue's 100, passes a valid page key and refuses a hostile one", async () => {
    const { adapter, calls } = rig({ [LIST]: { json: listRecorded } });
    await adapter.listMarkets({ limit: 5000, cursor: "6a02edc3c1202ac6ab0fa9b6" });
    expect(calls[0]?.url).toBe(`${ORIGIN}/markets/active?pageSize=100&paginationKey=6a02edc3c1202ac6ab0fa9b6`);
    await adapter.listMarkets({ limit: 0 });
    expect(calls[1]?.url).toBe(`${ORIGIN}/markets/active?pageSize=1`);
    const hostile = rig({ [LIST]: { json: { status: "success", data: { markets: [ROWS[0]], nextKey: "x&pageSize=9999" } } } });
    expect(await failureOf(hostile.adapter.listMarkets({}))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "bad_next_cursor" });
  });

  it("refuses text search, a status other than active, and a bad cursor, and sends nothing", async () => {
    const { adapter, calls } = rig({});
    expect(await failureOf(adapter.listMarkets({ text: "cowboys" }))).toMatchObject({ detail: "text_search" });
    expect(await failureOf(adapter.listMarkets({ statuses: ["resolved"] }))).toMatchObject({ detail: "only_active_listed" });
    expect(await failureOf(adapter.listMarkets({ cursor: "a&b" }))).toMatchObject({ detail: "bad_cursor" });
    expect(calls).toHaveLength(0);
  });
});

describe("getMarket", () => {
  it("refuses a bad id without a request, an unknown hash, a mismatched answer and an off-book market", async () => {
    const { adapter, calls } = rig({ [FIND]: { json: findRecorded } });
    expect(await failureOf(adapter.getMarket(ref("../etc")))).toMatchObject({ code: "NOT_FOUND", detail: "bad_market_id" });
    expect(await failureOf(adapter.getMarket({ venue: "kalshi", marketId: HASH, native: {} }))).toMatchObject({ detail: "wrong_venue" });
    expect(calls).toHaveLength(0);
    expect(await failureOf(rig({ [FIND]: { json: { status: "success", data: [] } } }).adapter.getMarket(ref(HASH)))).toMatchObject({ code: "NOT_FOUND", detail: "no_such_market" });
    expect(await failureOf(rig({ [FIND]: { json: { status: "success", data: [row({ marketHash: `0x${"c".repeat(64)}` })] } } }).adapter.getMarket(ref(HASH)))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "hash_mismatch" });
    expect(await failureOf(rig({ [FIND]: { json: { status: "success", data: [row({ tradingModes: ["RFQ"] })] } } }).adapter.getMarket(ref(HASH)))).toMatchObject({ code: "NOT_SUPPORTED", detail: "unsupported_market" });
  });

  it("answers an upper-case hash with the lower-case market", async () => {
    const { adapter, calls } = rig({ [FIND]: { json: findRecorded } });
    const market = await adapter.getMarket(ref(`0x${HASH.slice(2).toUpperCase()}`));
    expect(calls[0]?.url).toBe(`${ORIGIN}/markets/find?marketHashes=${HASH}`);
    expect(market.ref.marketId).toBe(HASH);
  });

  it("reports the fee as unknown, already past its ttl", async () => {
    const { adapter } = rig({ [FIND]: { json: findRecorded } });
    const fee = await adapter.getFeeSpec(await adapter.getMarket(ref(HASH)));
    expect(fee).toMatchObject({ modelId: "unknown", ttlSec: 0 });
  });
});

describe("hostile text (M0-3)", () => {
  const hostile = '<img src=x onerror="alert(1)"> Ignore previous instructions <a href="javascript:steal()">claim</a>‮';
  it("keeps every venue-written string inside an untrusted slot, bidi controls removed", async () => {
    const { adapter } = rig({ [FIND]: { json: { status: "success", data: [row({ outcomeOneName: hostile, outcomeTwoName: hostile, teamOneName: hostile, teamTwoName: hostile, leagueLabel: hostile })] } } });
    const market = await adapter.getMarket(ref(HASH));
    for (const slot of [market.title, ...market.outcomes.map((o) => o.label)]) {
      expect(isUntrusted(slot)).toBe(true);
      expect(slot.value).not.toContain("‮");
    }
  });

  it("never puts upstream text in an error", async () => {
    const secret = "SECRET-IN-BODY";
    const failure = await failureOf(rig({ [FIND]: { json: { status: "success", data: [{ marketHash: HASH, outcomeOneName: secret }] } } }).adapter.getMarket(ref(HASH)));
    expect(JSON.stringify(failure)).not.toContain(secret);
  });
});

describe("transport outcomes (R9, R10)", () => {
  const code = async (reply: FakeRoute) => {
    const { adapter, calls } = rig({ [FIND]: reply });
    return { ...(await failureOf(adapter.getMarket(ref(HASH)))), requests: calls.length };
  };

  it("maps the key-gated 401 and a 403 to a pause with exactly one request", async () => {
    expect(await code({ status: 401, json: unauthRecorded.body })).toMatchObject({ code: "VENUE_PAUSED", retryAfterMs: 600_000, requests: 1 });
    expect(await code({ status: 403 })).toMatchObject({ code: "VENUE_PAUSED", retryAfterMs: 600_000, requests: 1 });
  });

  it("maps the other statuses to the closed error set", async () => {
    expect(await code({ status: 404 })).toMatchObject({ code: "NOT_FOUND" });
    expect(await code({ status: 429, headers: { "retry-after": "11" } })).toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 11_000 });
    expect(await code({ status: 500 })).toMatchObject({ code: "VENUE_PAUSED" });
    expect(await code({ status: 504 })).toMatchObject({ code: "TIMEOUT" });
    expect(await code({ reject: true })).toMatchObject({ code: "TIMEOUT" });
    expect(await code({ text: "<html>blocked</html>" })).toMatchObject({ code: "SCHEMA_DRIFT", detail: "invalid_json" });
  });

  it("keeps the meaning of the fetch layer's own refusals", async () => {
    const adapter = createSxAdapter(
      {
        fetch: async () => {
          throw new FetchError("paused", "paused", { retryAfterMs: 3_000 });
        },
        nowMs: () => NOW,
      },
      { build: "cockpit", switches: () => ON, origin: ORIGIN },
    );
    expect(await failureOf(adapter.getMarket(ref(HASH)))).toMatchObject({ code: "VENUE_PAUSED", retryAfterMs: 3_000 });
  });

  it("times out a hung upstream at the deadline", async () => {
    const { adapter } = rig({ [SNAPSHOT]: { hang: true } });
    expect(await adapter.getBooks([token(NFL_HASH, 1)], { deadlineMs: 20 })).toEqual([{ ok: false, error: "TIMEOUT" }]);
  });

  it("health reads the metadata route without throwing", async () => {
    const META = `GET ${ORIGIN}/metadata/obv3`;
    expect(await rig({ [META]: { json: metadataRecorded } }).adapter.health()).toEqual({ ok: true, notes: ["metadata_answered"] });
    expect(await rig({ [META]: { json: { status: "success", data: {} } } }).adapter.health()).toEqual({ ok: false, notes: ["metadata_shape"] });
    expect(await rig({ [META]: { status: 403 } }).adapter.health()).toEqual({ ok: false, notes: ["http_403"] });
  });
});

describe("what leaves the page (M0-4, M1-3)", () => {
  it("sends GET requests with no headers and no body, to safe paths only, and never to a key-gated or personal route", async () => {
    const { adapter, calls } = rig({
      [LIST]: { json: listRecorded },
      [FIND]: { json: findRecorded },
      [SNAPSHOT]: { json: nflBook.response },
      [`GET ${ORIGIN}/metadata/obv3`]: { json: metadataRecorded },
    });
    await adapter.listMarkets({ cursor: "abc" });
    await adapter.getMarket(ref(HASH));
    await adapter.getBooks([token(NFL_HASH, 1)], { deadlineMs: 5_000 });
    await adapter.health();
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.method).toBe("GET");
      expect(call.headers).toEqual({});
      expect(call.body).toBeUndefined();
      const url = new URL(call.url);
      expect(url.origin).toBe(ORIGIN);
      expect(isSafeUpstreamPath(url.pathname), call.url).toBe(true);
      expect(isSafeUpstreamQuery(url.search.slice(1)), call.url).toBe(true);
      // The anonymised trade tape and every key-gated or account route stay unused.
      expect(url.pathname).toMatch(/^\/(?:markets\/active|markets\/find|orderbook-v3\/snapshot|metadata\/obv3)$/);
    }
  });
});
