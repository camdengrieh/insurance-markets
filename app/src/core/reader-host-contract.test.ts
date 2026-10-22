import { describe, expect, it } from "vitest";

import { decide } from "@bridge/allowlist";
import { isSafeUpstreamPath, isSafeUpstreamQuery } from "@bridge/contract";
import { createDefiLlamaClient } from "@sdk/venues/defillama/client";
import { DEFILLAMA_ORIGIN, DEFILLAMA_VOLUME_PATH, DEFILLAMA_VOLUME_QUERY } from "@sdk/venues/defillama/constants";
import captured from "@sdk/venues/defillama/fixtures/overview_dexs_captured_2026-10-20.json";
import { createGeminiAdapter } from "@sdk/venues/gemini/adapter";
import { GEMINI_API_BASE } from "@sdk/venues/gemini/constants";
import { HYPERLIQUID_INFO_URL } from "@sdk/venues/hyperliquid";
import { createManifoldAdapter, MANIFOLD_API_BASE } from "@sdk/venues/manifold";
import { createNovigAdapter } from "@sdk/venues/novig/adapter";
import { NOVIG_API_BASE } from "@sdk/venues/novig/constants";
import { depsOf, type FakeCall } from "@sdk/venues/novig/fixtures/fake-fetch";
import { createOgAdapter, ogOriginFrom } from "@sdk/venues/og/adapter";
import { OG_PUBLIC_PATH } from "@sdk/venues/og/constants";
import { BROWSER_DIRECT_ORIGINS } from "@sdk/venues/origins";
import { DISCLOSURE_VERSION, type VenueSwitches } from "@sdk/venues/policy";
import { createSxAdapter, tokenIdOf as sxTokenIdOf } from "@sdk/venues/sx";
import findRecorded from "@sdk/venues/sx/fixtures/markets_find_recorded.json";
import nflBook from "@sdk/venues/sx/fixtures/orderbook_nfl_recorded.json";
import { createUdxAdapter, tokenIdOf as udxTokenIdOf } from "@sdk/venues/udx";

import { NEVER_IN_APP_HOSTS } from "../../headers.config";
import { resolveUpstream } from "./fetch";

// What this host (the page's fetch and the Cockpit daemon) promises about the shared venue readers in sdk/venues. The
// readers themselves are tested next to their code in sdk/; these checks need the app's fetch and the daemon's
// contract, which sdk/ may not import, so they live here.
//
// The Cockpit build maps every absolute upstream URL onto the daemon's read proxy (core/fetch.ts resolveUpstream),
// and the daemon allows only the routes in bridge/allowlist.ts. The first block runs each module's real requests
// through BOTH, so a route an adapter asks for that the daemon would refuse (or a host the page could not map) fails
// here and not in a user's Cockpit.

const NOW = Date.parse("2026-10-19T12:00:00Z");

function allowedByTheDaemon(calls: readonly FakeCall[]): void {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    const target = resolveUpstream(call.url);
    const [path, query = ""] = [target.path, target.query];
    const verdict = decide({ service: target.service, method: call.method, path, query });
    expect(verdict, call.url).toMatchObject({ ok: true });
    if (verdict.ok) {
      expect(verdict.allowed.method).toBe("GET");
      expect(verdict.allowed.url).toBe(call.url);
    }
  }
}

describe("every request reaches the daemon's allowlist unchanged", () => {
  // The restricted venues commit no response body, so these runs get empty or garbage answers: the adapters still
  // build and send the same requests, which is all this test looks at (it never reads an answer).
  it("Novig: list, detail, events and book", async () => {
    const marketId = "market-under-test";
    const { deps, calls } = depsOf(
      {
        [`GET ${NOVIG_API_BASE}/catalog/markets?`]: { json: { items: [], next: "" } },
        [`GET ${NOVIG_API_BASE}/catalog/events?`]: { json: { items: [] } },
        [`GET ${NOVIG_API_BASE}/catalog/markets/${marketId}`]: { json: {} },
        [`GET ${NOVIG_API_BASE}/types/event-statuses`]: { json: [] },
      },
      { now: NOW },
    );
    const switches: VenueSwitches = { enabled: { novig: true }, disclosureAccepted: { novig: DISCLOSURE_VERSION } };
    const adapter = createNovigAdapter(deps, { switches, transport: "T1" });
    await adapter.listMarkets({ limit: 50, cursor: "0:cursor-under-test" }).catch(() => undefined);
    await adapter.getMarketDetail({ venue: "novig", marketId, native: {} }).catch(() => undefined);
    await adapter.getBooks([{ venue: "novig", tokenId: "outcome-under-test", marketId }], { deadlineMs: 5000 });
    await adapter.health();
    allowedByTheDaemon(calls);
    expect(new Set(calls.map((call) => resolveUpstream(call.url).service))).toEqual(new Set(["novig"]));
  });

  it("Gemini: list (search, category, offset) and one event", async () => {
    const { deps, calls } = depsOf(
      {
        [`GET ${GEMINI_API_BASE}/events/event-under-test`]: { json: {} },
        [`GET ${GEMINI_API_BASE}/events`]: { json: { data: [], pagination: { limit: 10, offset: 0, total: 0 } } },
      },
      { now: NOW },
    );
    const switches: VenueSwitches = { enabled: { gemini: true }, disclosureAccepted: { gemini: DISCLOSURE_VERSION } };
    const adapter = createGeminiAdapter(deps, { switches, category: "Pro Football", transport: "T1" });
    await adapter.listMarkets({ text: "dallas & green bay", cursor: "0:10" });
    await adapter.listMarkets({ statuses: ["resolved"] });
    await adapter.getMarketDetail({ venue: "gemini", marketId: "event-under-test", native: {} }).catch(() => undefined);
    await adapter.health();
    allowedByTheDaemon(calls);
  });

  it("DefiLlama: the volume overview", async () => {
    const { deps, calls } = depsOf({ [`GET ${DEFILLAMA_ORIGIN}${DEFILLAMA_VOLUME_PATH}?${DEFILLAMA_VOLUME_QUERY}`]: { json: captured } }, { now: NOW });
    await createDefiLlamaClient(deps, { transport: "T1" }).predictionVolumes();
    allowedByTheDaemon(calls);
  });

  // OG: its host is not in sdk/venues/origins.ts, so there is no service the page could map it onto and no route the
  // daemon would allow. The full check runs by itself the day the registry lists service "og" (with its origin, its
  // routes in bridge/allowlist.ts and its row in sdk/venues/policy.ts).
  // (the ReadService type has no "og" yet, so the comparison goes through string)
  const ogEntry = BROWSER_DIRECT_ORIGINS.find((entry) => (entry.service as string) === "og");
  it.skipIf(ogEntry === undefined)("OG: events and book (runs once sdk/venues/origins.ts lists service 'og')", async () => {
    const origin = ogOriginFrom(BROWSER_DIRECT_ORIGINS);
    expect(origin).not.toBeNull();
    const route = `${origin}${OG_PUBLIC_PATH}`;
    const { deps, calls } = depsOf(
      {
        [`GET ${route}/get-events`]: { json: { code: 0, result: { data: [] } } },
        [`GET ${route}/get-book`]: { json: {} },
      },
      { now: 1_792_379_400_000 },
    );
    const switches: VenueSwitches = { enabled: { og: true }, disclosureAccepted: { og: DISCLOSURE_VERSION } };
    const adapter = createOgAdapter(deps, { switches, origin, transport: "T1" });
    await adapter.listMarkets({});
    await adapter.getBooks([{ venue: "og", tokenId: "instrument-under-test" }], { deadlineMs: 5000 });
    allowedByTheDaemon(calls);
  });
});

// Requests the daemon's read proxy will accept at all (bridge/contract.ts): the path and query alphabet of every URL a
// reader builds. SX Bet and Underdog have no registry entry yet, so they run against a test origin; the shape of their
// paths and queries is what is checked.
function safeForTheProxy(calls: readonly FakeCall[]): void {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    const url = new URL(call.url);
    expect(isSafeUpstreamPath(url.pathname), call.url).toBe(true);
    expect(isSafeUpstreamQuery(url.search.slice(1)), call.url).toBe(true);
  }
}

describe("every request passes the read proxy's path and query contract", () => {
  it("Hyperliquid: the one /info URL", () => {
    expect(isSafeUpstreamPath(new URL(HYPERLIQUID_INFO_URL).pathname)).toBe(true);
  });

  it("Manifold: a search, and a hostile search term kept inside the safe alphabet", async () => {
    const { deps, calls } = depsOf({ [`GET ${MANIFOLD_API_BASE}/search-markets`]: { json: [] } }, { now: NOW });
    const adapter = createManifoldAdapter(deps);
    await adapter.listMarkets({ text: "vance 2028", limit: 3 });
    await adapter.listMarkets({ limit: 100_000, text: "a&filter=all #\u202e b" });
    safeForTheProxy(calls);
  });

  it("SX Bet: list, find, book snapshot and metadata", async () => {
    const origin = "https://sx.example.test";
    const { deps, calls } = depsOf({ [`GET ${origin}/`]: { json: {} } }, { now: NOW });
    const adapter = createSxAdapter(deps, { build: "cockpit", switches: () => ({ enabled: { sx: true }, disclosureAccepted: {} }), origin });
    const hash = (findRecorded.data[0] as { marketHash: string }).marketHash;
    const bookHash = nflBook.response.data.marketHash;
    await adapter.listMarkets({ cursor: "abc" }).catch(() => undefined);
    await adapter.getMarket({ venue: "sx", marketId: hash, native: { market_hash: hash } }).catch(() => undefined);
    await adapter.getBooks([{ venue: "sx", tokenId: sxTokenIdOf(bookHash, 1) }], { deadlineMs: 5_000 });
    await adapter.health();
    safeForTheProxy(calls);
  });

  it("Underdog: list, market and both order books", async () => {
    const origin = "https://udx.example.test";
    const ticker = "ticker-under-test";
    const { deps, calls } = depsOf({ [`GET ${origin}/`]: { json: {} } }, { now: NOW });
    const switches = { enabled: { udx: true }, disclosureAccepted: { udx: DISCLOSURE_VERSION } };
    const adapter = createUdxAdapter(deps, { build: "cockpit", switches: () => switches, origin });
    await adapter.listMarkets({}).catch(() => undefined);
    await adapter.getMarket({ venue: "udx", marketId: ticker, native: { ticker } }).catch(() => undefined);
    await adapter.getBooks([{ venue: "udx", tokenId: udxTokenIdOf(ticker, "yes") }, { venue: "udx", tokenId: udxTokenIdOf(ticker, "no") }], { deadlineMs: 5_000 });
    await adapter.health();
    safeForTheProxy(calls);
  });
});

describe("hosts the app may never name", () => {
  it("lists Trueo's first-party API host: the Trueo reader reads Base on-chain instead", () => {
    expect(Object.keys(NEVER_IN_APP_HOSTS)).toContain("api.trueo.com");
  });
});
