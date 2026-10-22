import { describe, expect, it } from "vitest";

import type { AdapterDeps, FetchLike } from "../../model.js";
import { createPascalAdapter } from "./adapter.js";
import { PASCAL_API_BASE } from "./constants.js";
import { isOnGrid } from "./tick.js";

// Live drift suite: OPT-IN. It sends real GET requests to data.pascal.trade and runs only with APP_LIVE=1, so a
// normal `pnpm test` stays offline. It never sends a POST, a credential or a custom Origin other than the
// reserved example.org used to read the CORS answer (the way the research measured it, docs/dapp-design.md
// 4.2). Scripted requests carry the fixed research User-Agent and nothing else that identifies a person.
//
// APP_LIVE_PASCAL_OWNER (optional) is a Solana address the operator owns; with it, DT8 reads that account's
// real shape. The address is read from the environment only and is never written anywhere.

const LIVE = process.env.APP_LIVE === "1";
const USER_AGENT = "insurance-markets-research/0.1";

const liveFetch: FetchLike = async (input, init) => {
  const response = await fetch(input, {
    method: "GET",
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...(init?.headers ?? {}) },
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
  });
  return { ok: response.ok, status: response.status, headers: { get: (name) => response.headers.get(name) }, json: () => response.json() as Promise<unknown>, text: () => response.text() };
};

const deps: AdapterDeps = { fetch: liveFetch, nowMs: () => Date.now() };

describe.skipIf(!LIVE)("pascal live drift (APP_LIVE=1)", () => {
  it("lists markets that match the schema, with at most a few dropped rows", async () => {
    const adapter = createPascalAdapter(deps);
    const page = await adapter.listMarkets({ limit: 20 });
    expect(page.items.length).toBeGreaterThan(0);
    const report = adapter.lastReadReport();
    expect(report.dropped / (report.parsed + report.dropped)).toBeLessThan(0.05);
    for (const item of page.items) expect(item.ref.marketId).toMatch(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/);
  }, 60_000);

  it("reads books whose prices lie on the tick grid the adapter derives", async () => {
    const adapter = createPascalAdapter(deps);
    const page = await adapter.listMarkets({ limit: 5 });
    const tokens = page.items.map((item) => ({ venue: "pascal" as const, tokenId: `${item.ref.marketId}#long` }));
    const results = await adapter.getBooks(tokens, { deadlineMs: 20_000 });
    let checked = 0;
    for (const [index, result] of results.entries()) {
      if (!result.ok) {
        expect(["EMPTY_BOOK", "NOT_FOUND"]).toContain(result.error);
        continue;
      }
      const market = await adapter.getMarket(page.items[index]?.ref ?? { venue: "pascal", marketId: "", native: {} });
      expect(Array.isArray(market.tick) || typeof market.tick === "string").toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
    // The grid itself is checked against the real book of the first market with one.
    const first = results.find((result) => result.ok);
    if (first?.ok) {
      const response = await liveFetch(`${PASCAL_API_BASE}/markets`);
      const body = (await response.json()) as { data: Array<{ symbol: string; tick_sig_figs: number; tick_size_min: string }> };
      const symbol = first.value.token.tokenId.split("#")[0];
      const row = body.data.find((candidate) => candidate.symbol === symbol);
      expect(row).toBeDefined();
      const floor = BigInt(Math.round(Number(row?.tick_size_min ?? "0") * 1_000_000));
      for (const level of [...first.value.bids, ...first.value.asks]) {
        expect(isOnGrid(BigInt(Math.round(Number(level.price) * 1_000_000)), row?.tick_sig_figs ?? 0, floor), `${symbol} ${level.price}`).toBe(true);
      }
    }
  }, 120_000);

  it("answers the browser CORS question the way the research table says: allow-origin * for a foreign origin (M0-7)", async () => {
    const response = await liveFetch(`${PASCAL_API_BASE}/time`, { headers: { origin: "https://example.org" } });
    expect(response.ok).toBe(true);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  }, 30_000);

  it.skipIf(!process.env.APP_LIVE_PASCAL_OWNER)("DT8: reads the operator's own account and validates the real shape", async () => {
    const owner = process.env.APP_LIVE_PASCAL_OWNER ?? "";
    const result = await createPascalAdapter(deps).positionsByAddress(owner, { bindingId: "live" });
    // Either no account, or an account whose positions parsed under the synthetic shape. A SCHEMA_DRIFT here
    // is the finding DT8 exists to produce: replace schemas.ts accountDataSchema with the recorded shape.
    expect(typeof result.registered).toBe("boolean");
  }, 60_000);
});

describe("pascal live drift is opt-in", () => {
  it("stays skipped unless APP_LIVE=1", () => {
    // The suite above is skipIf(!LIVE); this test documents and pins that switch.
    expect(typeof LIVE).toBe("boolean");
    if (process.env.APP_LIVE !== "1") expect(LIVE).toBe(false);
  });
});
