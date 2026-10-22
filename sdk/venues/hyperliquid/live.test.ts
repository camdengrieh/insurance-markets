import { describe, expect, it } from "vitest";

import type { AdapterDeps, FetchLike } from "../../model.js";
import { HYPERLIQUID_INFO_URL, createHyperliquidAdapter } from "./adapter.js";

// Opt-in drift suite. It does NOT run unless APP_LIVE=1. It sends read-only POSTs to the public info route (the same
// requests the adapter makes) and is the evidence behind HYPERLIQUID_SHAPE_STATUS: it passed on 2026-10-21 and
// 2026-10-22, when the status was set to "verified". A failure here means the venue drifted from what the adapter
// and the status claim: the shapes, the settlement path, the CORS header, the 0.00001 price step or the whole-share lot.
const LIVE = process.env.APP_LIVE === "1";
const USER_AGENT = "insurance-markets-research/0.1";

const liveFetch: FetchLike = async (input, init) => {
  const response = await fetch(input, {
    method: init?.method ?? "GET",
    headers: { ...(init?.headers ?? {}), "user-agent": USER_AGENT },
    ...(init?.body === undefined ? {} : { body: init.body }),
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
  });
  return { ok: response.ok, status: response.status, headers: response.headers, json: () => response.json(), text: () => response.text() };
};

describe.skipIf(!LIVE)("Hyperliquid live drift (APP_LIVE=1)", () => {
  const deps: AdapterDeps = { fetch: liveFetch, nowMs: () => Date.now() };

  it("answers an allMids POST from a foreign Origin with access-control-allow-origin", async () => {
    const response = await fetch(HYPERLIQUID_INFO_URL, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://example.org", "user-agent": USER_AGENT },
      body: JSON.stringify({ type: "allMids" }),
    });
    expect(response.status).toBe(200);
    // Measured "*" on 2026-10-22; the standalone build reads this route straight from the page.
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("lists outcomes whose rows all parse", async () => {
    const adapter = createHyperliquidAdapter(deps);
    const page = await adapter.listMarkets({ statuses: ["active", "closed"], limit: 50 });
    expect(page.items.length).toBeGreaterThan(0);
    expect(adapter.lastReadReport().dropped).toBe(0);
    expect(adapter.lastReadReport().midsAvailable).toBe(true);
  });

  it("reads a live Yes and No book that mirror each other", async () => {
    const adapter = createHyperliquidAdapter(deps);
    const page = await adapter.listMarkets({ limit: 20 });
    const withPrice = page.items.find((m) => m.outcomes.every((o) => o.displayPrice !== null));
    expect(withPrice).toBeDefined();
    const tokens = (withPrice?.outcomes ?? []).map((o) => ({ venue: "hyperliquid" as const, tokenId: o.tokenId }));
    const [yes, no] = await adapter.getBooks(tokens, { deadlineMs: Date.now() + 10_000 });
    expect(yes?.ok || (!yes?.ok && yes?.error === "EMPTY_BOOK")).toBe(true);
    expect(no?.ok || (!no?.ok && no?.error === "EMPTY_BOOK")).toBe(true);
  });

  it("reads a settled outcome that has left outcomeMeta as resolved, and an unsettled one is not found", async () => {
    const adapter = createHyperliquidAdapter(deps);
    // Outcome 1 is the first recurring BTC binary, settled long ago and no longer listed.
    const settled = await adapter.getMarket({ venue: "hyperliquid", marketId: "1", native: {} });
    expect(settled.status).toBe("resolved");
    const page = await adapter.listMarkets({ limit: 1 });
    const listed = page.items[0]?.ref.marketId;
    expect(listed).toBeDefined();
    const raw = await fetch(HYPERLIQUID_INFO_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": USER_AGENT },
      body: JSON.stringify({ type: "settledOutcome", outcome: Number(listed) }),
    });
    expect(raw.status).toBe(200);
    expect(await raw.json()).toBeNull();
  });

  it("keeps every live book level on the 0.00001 step with whole-share sizes", async () => {
    const adapter = createHyperliquidAdapter(deps);
    const page = await adapter.listMarkets({ limit: 20 });
    const tokens = page.items.slice(0, 10).flatMap((m) => m.outcomes.map((o) => ({ venue: "hyperliquid" as const, tokenId: o.tokenId })));
    const books = await adapter.getBooks(tokens, { deadlineMs: Date.now() + 20_000 });
    let levels = 0;
    for (const book of books) {
      if (!book.ok) continue;
      for (const level of [...book.value.bids, ...book.value.asks]) {
        levels += 1;
        expect(level.price).toMatch(/^0\.[0-9]{1,5}$/);
        expect(level.size).toMatch(/^[1-9][0-9]*$/);
      }
    }
    expect(levels).toBeGreaterThan(0);
  });
});
