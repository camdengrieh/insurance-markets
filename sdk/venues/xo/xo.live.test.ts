import { describe, expect, it } from "vitest";

import type { FetchLike } from "../../model.js";
import { createXoAdapter, XO_DATA_ORIGIN, XO_ORDERBOOK_ORIGIN } from "./index.js";

// Opt-in live drift suite (docs/dapp-design.md M0-7). It is skipped unless APP_LIVE=1, it is NOT part of any
// default or CI run, and it was written but never run when this file was added (no network was used).
//
// What it does when asked: GET requests only, one at a time, about three per second, with the scripted-research
// user-agent, to the two public XO read hosts and the XO explorer. It sends no body, no credential and no cookie,
// and it follows no redirect. It never sends anything to any other host. It reproduces the XO rows of the CORS
// table in dapp-design 4.2 and checks that the recorded response shapes still decode.
//
//   APP_LIVE=1 pnpm --dir app exec vitest run ../sdk/venues/xo/xo.live.test.ts

const LIVE = process.env.APP_LIVE === "1";
const suite = LIVE ? describe : describe.skip;

const USER_AGENT = "insurance-markets-research/0.1";
const FOREIGN_ORIGIN = "https://example.org";
// What the Cockpit's own page origin looks like (a random loopback port).
const COCKPIT_LIKE_ORIGIN = "http://127.0.0.1:41999";
const EXPLORER = "https://explorer-mainnet.xo.market";
const PACE_MS = 330;
const TIMEOUT_MS = 10_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url: string, origin?: string): Promise<{ status: number; allowOrigin: string | null; text: string }> {
  await sleep(PACE_MS);
  const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: "application/json" };
  if (origin !== undefined) headers.origin = origin;
  const response = await fetch(url, { method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: response.status, allowOrigin: response.headers.get("access-control-allow-origin"), text: await response.text() };
}

// The adapter's injected fetch for a Node run: no Origin header (a daemon is a plain client), the research user-agent.
const liveFetch: FetchLike = async (input, init) => {
  await sleep(PACE_MS);
  return fetch(input, {
    method: "GET",
    headers: { "user-agent": USER_AGENT, ...(init?.headers ?? {}) },
    redirect: "error",
    signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
  });
};

const deps = { fetch: liveFetch, nowMs: (): number => Date.now() };

suite("XO live drift (APP_LIVE=1, GET only)", () => {
  it("CORS: the Data API and the explorer answer a foreign origin with *", async () => {
    for (const url of [`${XO_DATA_ORIGIN}/api/markets?marketType=2,4&statuses=ACTIVE&take=1&page=1`, `${EXPLORER}/api/v2/stats`]) {
      const result = await get(url, FOREIGN_ORIGIN);
      expect(result.status).toBe(200);
      expect(result.allowOrigin).toBe("*");
    }
  });

  it("CORS: the order book answers 200 but gives neither a foreign origin nor a loopback Cockpit origin an allow-origin", async () => {
    for (const origin of [FOREIGN_ORIGIN, COCKPIT_LIKE_ORIGIN]) {
      const result = await get(`${XO_ORDERBOOK_ORIGIN}/time`, origin);
      expect(result.status).toBe(200);
      expect(result.allowOrigin === null || (result.allowOrigin !== "*" && result.allowOrigin !== origin)).toBe(true);
    }
  });

  it("standalone: the list still decodes, with no skipped rows, and every row has the documented shape", async () => {
    const adapter = createXoAdapter(deps, { variant: "standalone" });
    const detailed = await adapter.listMarketsDetailed({ limit: 10 });
    expect(detailed.skipped).toEqual([]);
    expect(detailed.page.items.length).toBeGreaterThan(0);
    for (const item of detailed.page.items) {
      expect(item.ref.marketId).toMatch(/^0x[0-9a-f]{64}$/);
      expect(item.outcomes.map((o) => o.role)).toEqual(["yes", "no"]);
      for (const outcome of item.outcomes) {
        expect(outcome.tokenId).toMatch(/^[1-9][0-9]{0,77}$/);
        expect(outcome.displayPrice === null || /^0\.[0-9]{1,6}$/.test(outcome.displayPrice)).toBe(true);
      }
      expect(item.status).not.toBe("unknown");
    }
  });

  it("standalone: the second page is a different page", async () => {
    const adapter = createXoAdapter(deps, { variant: "standalone" });
    const first = await adapter.listMarkets({ limit: 5 });
    expect(first.next).toBe("2");
    const second = await adapter.listMarkets({ limit: 5, cursor: first.next ?? "2" });
    const firstIds = new Set(first.items.map((item) => item.ref.marketId));
    expect(second.items.some((item) => !firstIds.has(item.ref.marketId))).toBe(true);
  });

  it("standalone: a market's rules, hash and fee decode, and the detail route's price is still the constant 500000", async () => {
    const adapter = createXoAdapter(deps, { variant: "standalone" });
    const [first] = (await adapter.listMarkets({ limit: 1 })).items;
    expect(first).toBeDefined();
    if (first === undefined) return;
    const market = await adapter.getMarket(first.ref);
    expect(market.rules.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(market.tick).toBe("0.001");
    expect(["curve_pq", "unknown"]).toContain(market.fee.modelId);
    const raw = JSON.parse((await get(`${XO_DATA_ORIGIN}/api/markets/contract/${market.ref.marketId}`)).text) as { outcomes: Array<{ currentPrice: string }> };
    expect(raw.outcomes.map((outcome) => outcome.currentPrice)).toEqual(["500000", "500000"]);
  });

  it("cockpit variant over a plain client: books decode, sorted, with prices on the 0.001 tick", async () => {
    const adapter = createXoAdapter(deps, { variant: "cockpit" });
    const [first] = (await adapter.listMarkets({ limit: 1 })).items;
    if (first === undefined) throw new Error("no active market to read a book for");
    const results = await adapter.getBooks(first.outcomes.map((o) => ({ venue: "xo" as const, tokenId: o.tokenId })), { deadlineMs: 15_000 });
    for (const result of results) {
      if (!result.ok) {
        expect(["EMPTY_BOOK", "NOT_FOUND"]).toContain(result.error);
        continue;
      }
      const bids = result.value.bids.map((level) => level.price);
      const asks = result.value.asks.map((level) => level.price);
      expect(bids).toEqual([...bids].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)));
      expect(asks).toEqual([...asks].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
      for (const price of [...bids, ...asks]) expect(price).toMatch(/^0\.[0-9]{1,3}$/);
    }
    const health = await adapter.health();
    expect(typeof health.ok).toBe("boolean");
  });
});
