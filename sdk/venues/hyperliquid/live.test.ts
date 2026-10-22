import { describe, expect, it } from "vitest";

import type { AdapterDeps, FetchLike } from "../../model.js";
import { HYPERLIQUID_INFO_URL, createHyperliquidAdapter } from "./adapter.js";

// Opt-in drift suite. It does NOT run unless APP_LIVE=1, and it was written but not run when this file was
// authored. It sends read-only POSTs to the public info route (the same requests the adapter makes) and is
// the evidence needed to move HYPERLIQUID_SHAPE_STATUS from "unverified" to "verified": a person runs it,
// reads the result, and edits the constant by hand. It also records the one CORS fact still open: whether
// the POST response (not just the preflight) carries access-control-allow-origin.
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
    // Not asserted equal to "*": the point is to record what the POST really answers (dapp-design 10 item 23).
    console.info("hyperliquid POST /info access-control-allow-origin:", response.headers.get("access-control-allow-origin"));
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
});
