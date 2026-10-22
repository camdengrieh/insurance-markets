import { describe, expect, it } from "vitest";

import type { AdapterDeps, FetchLike } from "../../model.js";
import { DISCLOSURE_VERSION } from "../policy.js";
import { createNovigAdapter } from "./adapter.js";

// Live drift suite: OPT-IN. It sends real GET requests to api.novig.com and runs only with APP_LIVE=1, so a normal
// `pnpm test` stays offline. GET only: no key, no signature, no POST, no custom Origin. Requests are spaced by 1.2 s
// (the public routes answered 429 after about 13 back-to-back calls) and carry the fixed research User-Agent and
// nothing else that identifies a person. It was written and NOT run by the stream that built it.

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
const switches = { enabled: { novig: true }, disclosureAccepted: { novig: DISCLOSURE_VERSION } };

describe.skipIf(!LIVE)("novig live drift (APP_LIVE=1)", () => {
  it("lists markets that match the schema, with at most a few dropped rows, and titles them from events", async () => {
    const adapter = createNovigAdapter(deps, { switches });
    const page = await adapter.listMarkets({ limit: 20 });
    expect(page.items.length).toBeGreaterThan(0);
    const report = adapter.lastReadReport();
    expect(report.dropped / (report.parsed + report.dropped)).toBeLessThan(0.05);
    expect(report.titlesMissing / Math.max(report.parsed, 1)).toBeLessThan(0.5);
  }, 120_000);

  it("reads one market's book and the venue's own error codes", async () => {
    const adapter = createNovigAdapter(deps, { switches });
    const page = await adapter.listMarkets({ limit: 3 });
    const first = page.items[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const results = await adapter.getBooks(first.outcomes.map((outcome) => ({ venue: "novig" as const, tokenId: outcome.tokenId, marketId: first.ref.marketId })), { deadlineMs: 30_000 });
    for (const result of results) {
      if (!result.ok) expect(["EMPTY_BOOK", "NOT_FOUND"]).toContain(result.error);
    }
    const detail = await adapter.getMarketDetail(first.ref);
    // the fee object is the one the adapter models, or it says unknown
    expect(["curve_pq", "unknown"]).toContain(detail.market.fee.modelId);
  }, 120_000);

  it("answers the type list the adapter lists by", async () => {
    expect((await createNovigAdapter(deps, { switches }).health()).ok).toBe(true);
  }, 60_000);
});
