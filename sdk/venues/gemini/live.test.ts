import { describe, expect, it } from "vitest";

import type { AdapterDeps, FetchLike } from "../../model.js";
import { DISCLOSURE_VERSION } from "../policy.js";
import { createGeminiAdapter } from "./adapter.js";

// Live drift suite: OPT-IN. It sends real GET requests to api.gemini.com and runs only with APP_LIVE=1, so a normal
// `pnpm test` stays offline. GET only: no key, no signature, no order route, no WebSocket, no custom Origin. Requests
// are spaced by 1.2 s (the public limit is 120 a minute, 1 a second recommended) and carry the fixed research
// User-Agent and nothing else that identifies a person. It was written and NOT run by the stream that built it.
// The category keeps answers small: a sports game event embeds all its child markets (1.1 MB for three events).

const LIVE = process.env.APP_LIVE === "1";
const USER_AGENT = "insurance-markets-research/0.1";
let lastAt = 0;

const liveFetch: FetchLike = async (input, init) => {
  const wait = lastAt + 1200 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastAt = Date.now();
  const response = await fetch(input, {
    method: "GET",
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...(init?.headers ?? {}) },
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
  });
  return { ok: response.ok, status: response.status, headers: { get: (name) => response.headers.get(name) }, json: () => response.json() as Promise<unknown>, text: () => response.text() };
};
const deps: AdapterDeps = { fetch: liveFetch, nowMs: () => Date.now() };
const switches = { enabled: { gemini: true }, disclosureAccepted: { gemini: DISCLOSURE_VERSION } };

describe.skipIf(!LIVE)("gemini live drift (APP_LIVE=1)", () => {
  it("lists events that match the schema, with at most a few dropped", async () => {
    const adapter = createGeminiAdapter(deps, { switches, category: "Crypto" });
    const { page, rows } = await adapter.listMarketsDetailed({ limit: 5 });
    expect(page.items.length).toBeGreaterThan(0);
    const report = adapter.lastReadReport();
    expect(report.dropped / (report.parsed + report.dropped)).toBeLessThan(0.2);
    for (const row of rows) for (const quote of row.quotes) expect(quote.tokenId).toMatch(/^[A-Za-z0-9._-]+$/);
  }, 120_000);

  it("reads one event, its rules fingerprint and its fee status", async () => {
    const adapter = createGeminiAdapter(deps, { switches, category: "Politics" });
    const page = await adapter.listMarkets({ limit: 3 });
    const first = page.items[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const detail = await adapter.getMarketDetail(first.ref);
    expect(detail.market.rules.sha256 === "" || /^[0-9a-f]{64}$/.test(detail.market.rules.sha256)).toBe(true);
    expect(["curve_pq", "unknown"]).toContain(detail.market.fee.modelId);
  }, 120_000);

  it("keeps the REST depth field empty (depth is WebSocket only)", async () => {
    const adapter = createGeminiAdapter(deps, { switches });
    expect(adapter.caps.getBook).toBe(false);
    expect((await adapter.health()).ok).toBe(true);
  }, 60_000);
});
