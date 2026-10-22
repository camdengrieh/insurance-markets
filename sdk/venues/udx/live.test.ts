import { describe, expect, it } from "vitest";

import type { AdapterDeps, FetchLike } from "../../model.js";
import { DISCLOSURE_VERSION } from "../policy.js";
import { UDX_VERSION, createUdxAdapter } from "./index.js";

// Live drift suite: OPT-IN, and doubly so because the venue is restricted (US-only, own-use data). It runs only
// with APP_LIVE=1 AND APP_LIVE_RESTRICTED=1 (the operator accepting the clause for this run). It sends real GET
// requests to the Underdog Exchange API host with the pinned API version header, no credential and no POST. The
// host is named here, in a test, because sdk/venues/origins.ts does not list the venue yet. One request carries a
// reserved example Origin to read the CORS answer the way the research measured it (docs/dapp-design.md 4.2,
// M0-7). Nothing is written anywhere. It is written but has not been run.

const LIVE = process.env.APP_LIVE === "1" && process.env.APP_LIVE_RESTRICTED === "1";
const USER_AGENT = "insurance-markets-research/0.1";
const ORIGIN = "https://api.underdogexchange.com";

const liveFetch: FetchLike = async (input, init) => {
  const response = await fetch(input, {
    method: "GET",
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...(init?.headers ?? {}) },
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
  });
  return { ok: response.ok, status: response.status, headers: { get: (name) => response.headers.get(name) }, json: () => response.json() as Promise<unknown>, text: () => response.text() };
};

const deps: AdapterDeps = { fetch: liveFetch, nowMs: () => Date.now() };

describe.skipIf(!LIVE)("udx live drift (APP_LIVE=1 and APP_LIVE_RESTRICTED=1)", () => {
  const adapter = createUdxAdapter(deps, { build: "cockpit", origin: ORIGIN, switches: () => ({ enabled: { udx: true }, disclosureAccepted: { udx: DISCLOSURE_VERSION } }) });

  it("answers the market list under the pinned API version", async () => {
    expect((await adapter.health()).ok).toBe(true);
  }, 30_000);

  it("lists single-leg markets that match the schema, with few rows dropped", async () => {
    const page = await adapter.listMarkets({ limit: 100 });
    expect(page.items.length).toBeGreaterThan(0);
    const report = adapter.lastReadReport();
    expect(report.dropped / Math.max(report.parsed + report.dropped, 1)).toBeLessThan(0.05);
  }, 60_000);

  it("reads an uncrossed YES book and its exact complement for listed markets", async () => {
    const page = await adapter.listMarkets({ limit: 20 });
    let checked = 0;
    for (const item of page.items) {
      const [yes, no] = item.outcomes;
      if (yes === undefined || no === undefined) continue;
      const books = await adapter.getBooks([{ venue: "udx", tokenId: yes.tokenId }, { venue: "udx", tokenId: no.tokenId }], { deadlineMs: 20_000 });
      if (books[0]?.ok === true && books[1]?.ok === true) {
        expect(books[1].value.derived).toBe("complement");
        checked += 1;
      }
      if (checked >= 3) break;
    }
    expect(checked).toBeGreaterThan(0);
  }, 120_000);

  it("names the pinned API version in its responses", async () => {
    const response = await fetch(`${ORIGIN}/markets?limit=1`, { headers: { "user-agent": USER_AGENT, "udx-version": UDX_VERSION } });
    expect(response.headers.get("udx-version")).toBe(UDX_VERSION);
  }, 30_000);

  it("reproduces the CORS table row: no allow-origin header for a third-party origin (needs the Cockpit)", async () => {
    const response = await fetch(`${ORIGIN}/markets?limit=1`, { headers: { "user-agent": USER_AGENT, origin: "https://example.org", "udx-version": UDX_VERSION } });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  }, 30_000);
});
