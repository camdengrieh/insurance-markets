import { describe, expect, it } from "vitest";

import type { AdapterDeps, FetchLike } from "../../model.js";
import { createSxAdapter } from "./index.js";

// Live drift suite: OPT-IN. It sends real GET requests to the SX Bet API host and runs only with APP_LIVE=1, so a
// normal `pnpm test` stays offline. The host is named here, in a test, because sdk/venues/origins.ts does not list
// SX Bet yet. It sends no POST, no credential and no key, and uses only the keyless public routes (the legacy
// order-book snapshot is deprecated: it gets a much stricter rate limit from 2026-12-01). One request carries a
// reserved example Origin to read the CORS answer the way the research measured it (docs/dapp-design.md 4.2,
// M0-7). Scripted requests carry the fixed research User-Agent only. It is written but has not been run.

const LIVE = process.env.APP_LIVE === "1";
const USER_AGENT = "insurance-markets-research/0.1";
const ORIGIN = "https://api.sx.bet";

const liveFetch: FetchLike = async (input, init) => {
  const response = await fetch(input, {
    method: "GET",
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...(init?.headers ?? {}) },
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
  });
  return { ok: response.ok, status: response.status, headers: { get: (name) => response.headers.get(name) }, json: () => response.json() as Promise<unknown>, text: () => response.text() };
};

const deps: AdapterDeps = { fetch: liveFetch, nowMs: () => Date.now() };

describe.skipIf(!LIVE)("sx bet live drift (APP_LIVE=1)", () => {
  const adapter = createSxAdapter(deps, { build: "cockpit", origin: ORIGIN, switches: () => ({ enabled: { sx: true }, disclosureAccepted: {} }) });

  it("answers the metadata route for the chain the adapter pins", async () => {
    expect((await adapter.health()).ok).toBe(true);
  }, 30_000);

  it("lists markets that match the schema, with few rows dropped", async () => {
    const page = await adapter.listMarkets({ limit: 50 });
    expect(page.items.length).toBeGreaterThan(0);
    const report = adapter.lastReadReport();
    expect(report.dropped / Math.max(report.parsed + report.dropped, 1)).toBeLessThan(0.05);
  }, 60_000);

  it("reads uncrossed books on the venue's ladder for listed markets (the maker-frame reading holds)", async () => {
    const page = await adapter.listMarkets({ limit: 30 });
    let checked = 0;
    for (const item of page.items) {
      const [one, two] = item.outcomes;
      if (one === undefined || two === undefined) continue;
      const books = await adapter.getBooks([{ venue: "sx", tokenId: one.tokenId }, { venue: "sx", tokenId: two.tokenId }], { deadlineMs: 20_000 });
      for (const result of books) {
        // A crossed or off-ladder book is the drift this suite exists to catch.
        if (!result.ok) expect(["EMPTY_BOOK", "NOT_FOUND"]).toContain(result.error);
        else checked += 1;
      }
      if (checked >= 4) break;
    }
    expect(checked).toBeGreaterThan(0);
  }, 180_000);

  it("reproduces the CORS table row: no allow-origin header for a third-party origin (needs the Cockpit)", async () => {
    const response = await fetch(`${ORIGIN}/metadata/obv3`, { headers: { "user-agent": USER_AGENT, origin: "https://example.org" } });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  }, 30_000);
});
