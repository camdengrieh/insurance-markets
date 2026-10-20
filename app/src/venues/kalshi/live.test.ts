import { describe, expect, it } from "vitest";

import type { AdapterDeps, FetchLike } from "../../core/ports";
import { DISCLOSURE_VERSION } from "../../core/venue-policy";
import { createKalshiAdapter, kalshiRegisteredOrigin } from "./index";

// Live drift suite: OPT-IN, and doubly so because Kalshi's terms are restricted. It runs only with APP_LIVE=1 AND
// APP_LIVE_RESTRICTED=1 (the operator accepting the clause for this run). It sends real GET requests without any
// Origin header, no credential and no POST; one request carries a reserved example Origin to read the 403 the
// research recorded (docs/dapp-design.md 4.2, M0-7). The product never sends an Origin and never works around a
// block (R10). Nothing is written anywhere. It is written but has not been run.

const LIVE = process.env.APP_LIVE === "1" && process.env.APP_LIVE_RESTRICTED === "1";
const USER_AGENT = "insurance-markets-research/0.1";
const ORIGIN = kalshiRegisteredOrigin("kalshi") ?? "";

const liveFetch: FetchLike = async (input, init) => {
  const response = await fetch(input, {
    method: "GET",
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...(init?.headers ?? {}) },
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
  });
  return { ok: response.ok, status: response.status, headers: { get: (name) => response.headers.get(name) }, json: () => response.json() as Promise<unknown>, text: () => response.text() };
};

const deps: AdapterDeps = { fetch: liveFetch, nowMs: () => Date.now() };

describe.skipIf(!LIVE)("kalshi live drift (APP_LIVE=1 and APP_LIVE_RESTRICTED=1)", () => {
  const adapter = createKalshiAdapter(deps, { build: "cockpit", switches: () => ({ enabled: { kalshi: true }, disclosureAccepted: { kalshi: DISCLOSURE_VERSION } }) });

  it("answers the exchange status", async () => {
    expect((await adapter.health()).notes).toContain("exchange_active");
  }, 30_000);

  it("lists binary markets that match the schema, with few rows dropped", async () => {
    const page = await adapter.listMarkets({ limit: 50 });
    expect(page.items.length).toBeGreaterThan(0);
    const report = adapter.lastReadReport();
    expect(report.dropped / Math.max(report.parsed + report.dropped, 1)).toBeLessThan(0.05);
  }, 60_000);

  it("reads a market, an uncrossed book on both tokens, and a fee model or an honest unknown", async () => {
    const page = await adapter.listMarkets({ limit: 20 });
    for (const item of page.items) {
      const market = await adapter.getMarket(item.ref);
      const [yes, no] = market.outcomes;
      if (yes === undefined || no === undefined) continue;
      const books = await adapter.getBooks([{ venue: "kalshi", tokenId: yes.tokenId }, { venue: "kalshi", tokenId: no.tokenId }], { deadlineMs: 20_000 });
      if (books[0]?.ok === true && books[1]?.ok === true) {
        const fee = await adapter.getFeeSpec(market);
        expect(["curve_pq", "unknown"]).toContain(fee.modelId);
        return;
      }
    }
    throw new Error("no listed market had a readable book");
  }, 120_000);

  it("reproduces the CORS table row: 403 whenever an Origin is sent (so the page cannot read it)", async () => {
    const response = await fetch(`${ORIGIN}/trade-api/v2/exchange/status`, { headers: { "user-agent": USER_AGENT, origin: "https://example.org" } });
    expect(response.status).toBe(403);
  }, 30_000);
});
