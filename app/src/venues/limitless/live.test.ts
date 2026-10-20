import { describe, expect, it } from "vitest";

import type { AdapterDeps, FetchLike } from "../../core/ports";
import { DEFAULT_SWITCHES } from "../../core/venue-policy";
import { createLimitlessAdapter, limitlessRegisteredOrigin } from "./index";

// Live drift suite: OPT-IN. It sends real GET requests to the Limitless API host and runs only with APP_LIVE=1, so
// a normal `pnpm test` stays offline. It sends no POST, no credential, and one request that carries a reserved
// example Origin to read the CORS answer the way the research measured it (docs/dapp-design.md 4.2, M0-7); the
// product itself never sends an Origin. Scripted requests carry the fixed research User-Agent and nothing else
// that identifies a person. It is written but has not been run.

const LIVE = process.env.APP_LIVE === "1";
const USER_AGENT = "insurance-markets-research/0.1";
const ORIGIN = limitlessRegisteredOrigin("limitless") ?? "";

const liveFetch: FetchLike = async (input, init) => {
  const response = await fetch(input, {
    method: "GET",
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...(init?.headers ?? {}) },
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
  });
  return { ok: response.ok, status: response.status, headers: { get: (name) => response.headers.get(name) }, json: () => response.json() as Promise<unknown>, text: () => response.text() };
};

const deps: AdapterDeps = { fetch: liveFetch, nowMs: () => Date.now() };

describe.skipIf(!LIVE)("limitless live drift (APP_LIVE=1)", () => {
  const adapter = createLimitlessAdapter(deps, { build: "cockpit", switches: () => DEFAULT_SWITCHES });

  it("lists markets that match the schema, with few rows dropped", async () => {
    const page = await adapter.listMarkets({ limit: 20 });
    expect(page.items.length).toBeGreaterThan(0);
    const report = adapter.lastReadReport();
    expect(report.dropped / Math.max(report.parsed + report.dropped, 1)).toBeLessThan(0.05);
    for (const item of page.items) expect(item.outcomes.map((o) => o.tokenId).every((id) => /^[0-9]{1,78}$/.test(id))).toBe(true);
  }, 60_000);

  it("reads a market and a YES book whose NO side is its exact complement", async () => {
    const page = await adapter.listMarkets({ limit: 10 });
    for (const item of page.items) {
      const market = await adapter.getMarket(item.ref);
      const [yes, no] = market.outcomes;
      if (yes === undefined || no === undefined) continue;
      const books = await adapter.getBooks([{ venue: "limitless", tokenId: yes.tokenId, marketId: item.ref.marketId }, { venue: "limitless", tokenId: no.tokenId, marketId: item.ref.marketId }], { deadlineMs: 20_000 });
      if (books[0]?.ok === true && books[1]?.ok === true) {
        expect(books[1].value.derived).toBe("complement");
        expect(books[0].value.bids.length + books[0].value.asks.length).toBeGreaterThan(0);
        return;
      }
    }
    throw new Error("no listed market had a readable book");
  }, 120_000);

  it("reproduces the CORS table row: no allow-origin header for a third-party origin (needs the Cockpit)", async () => {
    const response = await fetch(`${ORIGIN}/markets/active?limit=1&page=1`, { headers: { "user-agent": USER_AGENT, origin: "https://example.org" } });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  }, 30_000);
});
