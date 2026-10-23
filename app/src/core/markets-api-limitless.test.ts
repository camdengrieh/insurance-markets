import { describe, expect, it } from "vitest";

import { createLimitlessAdapter } from "@sdk/venues/limitless";
import { fakeFetch } from "@sdk/venues/limitless/fixtures/fake-fetch";
import detailRecorded from "@sdk/venues/limitless/fixtures/market_detail_recorded.json";
import listCaptured from "@sdk/venues/limitless/fixtures/markets_active_list_captured_2026-10-20.json";
import bookRecorded from "@sdk/venues/limitless/fixtures/orderbook_recorded.json";

import { resolveUpstream } from "./fetch";
import { MARKETS_API_ORIGIN } from "./markets-api";
import { createMarketsApiLimitlessAdapter, VIA_MARKETS_API } from "./markets-api-limitless";
import type { Book, Market, MarketSummary } from "./ports";

// Limitless in the standalone build, read through our markets API. The API's answers here are built the way api/markets.ts
// builds them (present() for a list row, market() for a detail), from what the SDK's own Limitless reader makes of the
// recorded venue fixtures: so this checks that the page reads back what the API serves. No network.

const NOW = 1_792_368_171_000;
const VENUE = "https://api.limitless.exchange";
const API = MARKETS_API_ORIGIN ?? "https://api.invalid";
const SLUG = detailRecorded.slug;
// The API read the venue 40 s before the page asked it.
const API_READ_AT = NOW - 40_000;

async function sdkReads(): Promise<{ readonly summaries: readonly MarketSummary[]; readonly market: Market; readonly books: readonly Book[] }> {
  const fake = fakeFetch({
    [`GET ${VENUE}/markets/active`]: { json: { ...(listCaptured as Record<string, unknown>), data: [detailRecorded, ...(listCaptured as { data: unknown[] }).data], totalMarketsCount: 4 } },
    [`GET ${VENUE}/markets/${SLUG}`]: { json: detailRecorded },
    [`GET ${VENUE}/markets/${SLUG}/orderbook`]: { json: bookRecorded },
  });
  const reader = createLimitlessAdapter({ fetch: fake.fetch, nowMs: () => API_READ_AT }, { build: "cockpit" });
  const page = await reader.listMarkets({ limit: 10 });
  const market = await reader.getMarket({ venue: "limitless", marketId: SLUG, native: {} });
  const books = (await reader.getBooks(market.outcomes.map((outcome) => ({ venue: "limitless" as const, tokenId: outcome.tokenId, marketId: SLUG })), { deadlineMs: 5_000 })).flatMap((result) => (result.ok ? [result.value] : []));
  return { summaries: page.items, market, books };
}

// GET /v1/markets: api/markets.ts present() for each row.
function apiList(summaries: readonly MarketSummary[], extra: unknown[] = []): unknown {
  const origin = { source: "venue_api", asOfMs: API_READ_AT, ageMs: 40_000 };
  const markets = summaries.map((summary) => ({
    venue: "limitless",
    marketId: summary.ref.marketId,
    native: summary.ref.native,
    title: summary.title,
    status: summary.status,
    closesAtUtc: summary.closesAtUtc,
    category: summary.category?.category ?? null,
    outcomes: summary.outcomes.map((outcome) => ({ ...outcome, lastTrade: null, lastTradeSource: { source: null, reason: "The chain index does not read this venue's chain on this server." } })),
    volume: summary.volume,
    resolution: null,
    fields: { title: origin, outcomes: origin, status: origin, closesAt: origin, displayPrice: origin, volume: origin, resolution: { source: null, reason: "not read" } },
    prov: { source: summary.prov.source, fetchedAtMs: summary.prov.fetchedAtMs, freshness: summary.prov.freshness, transport: summary.prov.transport },
  }));
  return JSON.parse(JSON.stringify({ asOfMs: NOW, venues: [], total: markets.length + extra.length, markets: [...markets, ...extra], next: "50" }));
}

// GET /v1/markets/limitless/:slug: api/markets.ts market().
function apiDetail(market: Market, books: readonly Book[], missing: "none" | "no" = "none"): unknown {
  const origin = { source: "cache", asOfMs: API_READ_AT, ageMs: 40_000 };
  return JSON.parse(
    JSON.stringify({
      asOfMs: NOW,
      market: {
        venue: "limitless",
        marketId: market.ref.marketId,
        native: market.ref.native,
        title: market.title,
        status: market.status,
        timesUtc: market.timesUtc,
        tick: market.tick,
        collateral: market.collateral,
        category: market.category?.category ?? null,
        feeModel: market.fee.modelId,
        outcomes: market.outcomes.map((outcome) => ({ index: outcome.index, role: outcome.role, label: outcome.label, tokenId: outcome.tokenId, lastTrade: null, lastTradeSource: { source: null, reason: "Not looked up." } })),
        rules: { sha256: market.rules.sha256, recipe: "rules-v2", text: market.rules.text, mechanism: market.rules.mechanism, void: market.rules.void, ...(market.rules.cutoffUtc === undefined ? {} : { cutoffUtc: market.rules.cutoffUtc }) },
      },
      resolution: null,
      books: market.outcomes.map((outcome) => {
        const book = books.find((entry) => entry.token.tokenId === outcome.tokenId);
        if (book === undefined || (missing === "no" && outcome.role === "no")) return { tokenId: outcome.tokenId, book: null, source: { source: null, reason: "The book was not read in time; ask again." } };
        return { tokenId: outcome.tokenId, book: { bids: book.bids, asks: book.asks, asOfMs: book.asOfMs, derived: book.derived }, source: origin };
      }),
      fields: { market: origin, rules: origin, status: origin, resolution: { source: null, reason: "not read" } },
    }),
  );
}

describe("Limitless through our markets API (standalone build)", () => {
  it("reads back the rows the API serves, says they came via our markets API, and keeps the time the API read the venue", async () => {
    const { summaries } = await sdkReads();
    const fake = fakeFetch({ [`GET ${API}/v1/markets?venue=limitless`]: { json: apiList(summaries, [{ venue: "limitless", marketId: "bad id" }]) } });
    const adapter = createMarketsApiLimitlessAdapter({ fetch: fake.fetch, nowMs: () => NOW }, API);
    const page = await adapter.listMarkets({ limit: 20 });
    expect(fake.calls.map((call) => call.url)).toEqual([`${API}/v1/markets?venue=limitless&limit=20`]);
    expect(page.items.map((item) => item.ref.marketId)).toEqual(summaries.map((summary) => summary.ref.marketId));
    expect(page.next).toBe("50");
    expect(adapter.lastReadReport()).toMatchObject({ parsed: summaries.length, dropped: 1 });
    const first = page.items[0] as MarketSummary;
    const original = summaries[0] as MarketSummary;
    expect(first.title.value).toBe(original.title.value);
    expect(first.outcomes).toEqual(original.outcomes);
    expect(first.status).toBe(original.status);
    expect(first.volume).toEqual(original.volume);
    expect(first.prov).toMatchObject({ venue: "limitless", source: VIA_MARKETS_API, fetchedAtMs: API_READ_AT, transport: "T0" });
    // The next page goes by the API's cursor.
    await adapter.listMarkets({ limit: 20, cursor: "50" }).catch(() => undefined);
    expect(fake.calls[1]?.url).toBe(`${API}/v1/markets?venue=limitless&limit=20&cursor=50`);
    // Never the venue's own host, which sends no CORS headers for the page.
    for (const call of fake.calls) expect(resolveUpstream(call.url).service).toBe("markets_api");
  });

  it("reads a market and its books from the detail, with the time the API read each book; a book it lacks is an error, never empty", async () => {
    const { summaries, market, books } = await sdkReads();
    const fake = fakeFetch({
      [`GET ${API}/v1/markets?venue=limitless`]: { json: apiList(summaries) },
      [`GET ${API}/v1/markets/limitless/${SLUG}`]: { json: apiDetail(market, books, "no") },
    });
    const adapter = createMarketsApiLimitlessAdapter({ fetch: fake.fetch, nowMs: () => NOW }, API);
    const read = await adapter.getMarket({ venue: "limitless", marketId: SLUG, native: {} });
    expect(read.title.value).toBe(market.title.value);
    expect(read.outcomes).toEqual(market.outcomes);
    expect(read.rules.sha256).toBe(market.rules.sha256);
    expect(read.tick).toBe("0.001");
    expect(read.prov).toMatchObject({ source: VIA_MARKETS_API, fetchedAtMs: API_READ_AT });
    expect(read.fee.modelId).toBe("unknown");
    const [yes, no] = await adapter.getBooks(market.outcomes.map((outcome) => ({ venue: "limitless" as const, tokenId: outcome.tokenId, marketId: SLUG })), { deadlineMs: 5_000 });
    const yesBook = books.find((book) => book.token.tokenId === market.outcomes[0]?.tokenId);
    expect(yes?.ok && yes.value.bids).toEqual(yesBook?.bids);
    expect(yes?.ok && yes.value.asks).toEqual(yesBook?.asks);
    expect(yes?.ok && yes.value.asOfMs).toBe(yesBook?.asOfMs);
    expect(no).toEqual({ ok: false, error: "STALE" });
    // One detail read serves both outcomes.
    expect(fake.calls.filter((call) => call.url.endsWith(`/v1/markets/limitless/${SLUG}`))).toHaveLength(2);
  });

  it("maps the API's refusals to typed errors and refuses a text search before asking", async () => {
    const adapter = (status: number) => createMarketsApiLimitlessAdapter({ fetch: fakeFetch({ [`GET ${API}/v1/markets`]: { status, json: { error: { code: "x", message: "y" } } } }).fetch, nowMs: () => NOW }, API);
    await expect(adapter(404).getMarket({ venue: "limitless", marketId: SLUG, native: {} })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(adapter(429).listMarkets({})).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(adapter(503).listMarkets({})).rejects.toMatchObject({ code: "VENUE_PAUSED" });
    await expect(adapter(200).listMarkets({ text: "rain" })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    await expect(adapter(200).getMarket({ venue: "limitless", marketId: "../x", native: {} })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
