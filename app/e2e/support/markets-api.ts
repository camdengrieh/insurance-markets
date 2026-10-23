// The test world's markets API (api/, our host behind CloudFront): the standalone build reads Limitless through it
// (app/src/core/markets-api-limitless.ts), because Limitless sends no CORS headers for the page. Like the mock XO, it
// answers with a small, labelled test market, in the shapes api/markets.ts serves (a list row with each field's source,
// a detail with its books). Every other path of the host, the order relays included, is answered "503, offline".

export const MOCK_LIMITLESS_SLUG = "mock-limitless-market-test-world-1792756800000";
export const MOCK_LIMITLESS_TITLE = "Mock Limitless market (test world)";
const YES = "1111111111111111111111111111111111111111111111111111111111111111111111111";
const NO = "2222222222222222222222222222222222222222222222222222222222222222222222222";

function untrusted(value: string): { readonly untrusted: true; readonly value: string } {
  return { untrusted: true, value };
}

function outcomes(): unknown[] {
  return [
    { index: 0, role: "yes", label: untrusted("Yes"), tokenId: YES, displayPrice: "0.42", lastTrade: null, lastTradeSource: { source: null, reason: "The chain index does not read this venue's chain on this server." } },
    { index: 1, role: "no", label: untrusted("No"), tokenId: NO, displayPrice: "0.58", lastTrade: null, lastTradeSource: { source: null, reason: "The chain index does not read this venue's chain on this server." } },
  ];
}

// The answer for one GET on the markets API host, or null for "offline".
export function mockMarketsApi(pathname: string, search: URLSearchParams, nowMs: number): unknown {
  const readAt = nowMs - 20_000;
  const origin = { source: "venue_api", asOfMs: readAt, ageMs: 20_000 };
  if (pathname === "/v1/markets" && search.get("venue") === "limitless") {
    return {
      asOfMs: nowMs,
      venues: [{ venue: "limitless", state: { kind: "ok", reason: null, next: null }, rows: 1, readAtMs: readAt, ageMs: 20_000, fresh: true }],
      total: 1,
      markets: [
        {
          venue: "limitless",
          marketId: MOCK_LIMITLESS_SLUG,
          native: { slug: MOCK_LIMITLESS_SLUG, trade_type: "clob", market_type: "single", yes_token: YES, no_token: NO },
          title: untrusted(MOCK_LIMITLESS_TITLE),
          status: "active",
          closesAtUtc: new Date(nowMs + 30 * 86_400_000).toISOString(),
          category: "other",
          outcomes: outcomes(),
          volume: { amount: "1234.5", unit: "usd", windowHours: null },
          resolution: null,
          fields: { title: origin, outcomes: origin, status: origin, closesAt: origin, displayPrice: origin, volume: origin, resolution: { source: null, reason: "The chain index does not read this venue's chain on this server." } },
          prov: { source: `limitless:/markets/active`, fetchedAtMs: readAt, freshness: "live", transport: "T1" },
        },
      ],
      next: null,
    };
  }
  if (pathname === `/v1/markets/limitless/${MOCK_LIMITLESS_SLUG}`) {
    return {
      asOfMs: nowMs,
      market: {
        venue: "limitless",
        marketId: MOCK_LIMITLESS_SLUG,
        native: { slug: MOCK_LIMITLESS_SLUG },
        title: untrusted(MOCK_LIMITLESS_TITLE),
        status: "active",
        timesUtc: { closesAt: new Date(nowMs + 30 * 86_400_000).toISOString() },
        tick: "0.001",
        collateral: { symbol: "USDC", chain: "eip155:8453", decimals: 6, custody: "self" },
        category: "other",
        feeModel: "unknown",
        outcomes: outcomes().map((outcome) => ({ ...(outcome as Record<string, unknown>), displayPrice: undefined })),
        rules: { sha256: null, recipe: "rules-v2", text: untrusted("A test-world market: it resolves to nothing and exists only in this test."), mechanism: "unknown", void: "unknown" },
      },
      resolution: null,
      books: [
        { tokenId: YES, book: { bids: [{ price: "0.41", size: "100" }], asks: [{ price: "0.43", size: "50" }], asOfMs: readAt, derived: "native" }, source: origin },
        { tokenId: NO, book: { bids: [{ price: "0.57", size: "50" }], asks: [{ price: "0.59", size: "100" }], asOfMs: readAt, derived: "complement" }, source: origin },
      ],
      fields: { market: origin, rules: { source: null, reason: "The venue's rule fields cannot be fingerprinted (rules-v2)." }, status: origin, resolution: { source: null, reason: "not read" } },
    };
  }
  return null;
}
