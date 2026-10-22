import { describe, expect, it } from "vitest";

import type { FetchLike } from "../../model.js";
import { createPolymarketAdapter } from "./adapter.js";
import { CLOB_ORIGIN, DATA_ORIGIN, GAMMA_ORIGIN } from "./constants.js";

// OPT-IN live drift suite (APP_LIVE=1). It is written, not run by default and not run by the workflow that built
// it. GET only; nothing is sent but a path and query; the only header is the fixed research User-Agent. It asks the
// real hosts whether what the adapter assumes still holds (shapes still parse, the CORS table of dapp-design 4.2
// still reads "*" for the three hosts) and reports drift as a failing test. It places no order and signs nothing.
// Run: APP_LIVE=1 pnpm --dir app exec vitest run ../sdk/venues/polymarket/live
//
// Pacing: sequential, a handful of requests, far inside every documented limit (note 08 section 2.6).

const LIVE = process.env["APP_LIVE"] === "1";
const USER_AGENT = "insurance-markets-research/0.1";
// A public test address with no positions: it exercises the envelope, not anyone's data.
const PUBLIC_TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ORIGIN_UNDER_TEST = "http://127.0.0.1:5173";

const liveFetch: FetchLike = async (input, init) => {
  if (init?.method === "POST") throw new Error("the live suite never sends a POST");
  const response = await fetch(input, { method: "GET", headers: { "user-agent": USER_AGENT } });
  return {
    ok: response.ok,
    status: response.status,
    headers: { get: (name) => response.headers.get(name) },
    json: () => response.json() as Promise<unknown>,
    text: () => response.text(),
  };
};

describe.skipIf(!LIVE)("polymarket live drift (APP_LIVE=1)", () => {
  const adapter = createPolymarketAdapter({ fetch: liveFetch, nowMs: () => Date.now() });

  it("lists open markets and every row still parses", async () => {
    const result = await adapter.listMarketsDetailed({ limit: 20 });
    expect(result.page.items.length).toBeGreaterThan(0);
    expect(result.rejected).toEqual([]);
  });

  it("reads one market, its books, its fee and its token table consistently", async () => {
    const { page } = await adapter.listMarketsDetailed({ limit: 10 });
    const summary = page.items.find((item) => item.status === "active");
    expect(summary).toBeDefined();
    if (summary === undefined) return;
    const market = await adapter.getMarket(summary.ref);
    expect(market.outcomes.length).toBeGreaterThanOrEqual(2);
    const books = await adapter.getBooks(
      market.outcomes.map((outcome) => ({ venue: "polymarket" as const, tokenId: outcome.tokenId })),
      { deadlineMs: Date.now() + 20_000 },
    );
    for (const book of books) {
      if (book.ok) {
        for (const side of [book.value.bids, book.value.asks]) {
          expect(side.every((level, index) => index === 0 || (side[index - 1]?.price ?? "") !== level.price)).toBe(true);
        }
      } else {
        // A market with no book is NOT_FOUND or EMPTY_BOOK; anything else is drift.
        expect(["NOT_FOUND", "EMPTY_BOOK"]).toContain(book.error);
      }
    }
    expect((await adapter.crossCheckTokens(market)).problems).toEqual([]);
    expect(["curve_pq", "unknown"]).toContain((await adapter.getFeeSpec(market)).modelId);
  });

  it("v2 positions still answer with the {data, pagination} envelope", async () => {
    const page = await adapter.getPositionsByAddress(PUBLIC_TEST_ADDRESS, { limit: 5 });
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.rejected).toEqual([]);
  });

  it("the three hosts still answer CORS with * for a foreign origin (dapp-design 4.2)", async () => {
    for (const url of [`${GAMMA_ORIGIN}/status`, `${DATA_ORIGIN}/v2/status`, `${CLOB_ORIGIN}/time`]) {
      const response = await fetch(url, { method: "GET", headers: { "user-agent": USER_AGENT, origin: ORIGIN_UNDER_TEST } });
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }
  });
});
