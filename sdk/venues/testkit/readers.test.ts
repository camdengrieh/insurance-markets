import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { MarketSummary } from "../../model.js";
import { createPinGuard } from "../../chain/pins.js";
import { loadRecording, replayPort } from "../../chain/fixtures/load.js";
import { KNOWN_MARKETS } from "../../chain/fixtures/scenarios.js";
import { createPolymarketAdapter } from "../polymarket/adapter.js";
import { keysetEnvelope, recorded } from "../polymarket/fixtures/load.js";
import { createXoAdapter } from "../xo/index.js";
import { CHAIN_NOT_ASKED, readChainResolutions, sourceSummary } from "../state-fields.js";
import { READ_OK, venueReadState, venueStateReason } from "../state.js";
import { CHAIN_ONLY_REASON, FAKE_RETRY_AFTER_S, FAKE_VENUE_STATES, fakeVenue, json, type FakeVenueState } from "./index.js";

// The readers and the field-source rule against a fake venue in each state (docs/sdk-and-api-design.md section 6). The
// ok answers are the venues' own recordings (sdk/venues/<venue>/fixtures); the chain answers are the recorded JSON-RPC
// exchanges of sdk/chain/xo/fixtures, replayed.

const NOW = Date.parse("2026-10-22T12:03:00.000Z");
const nowMs = (): number => NOW;
const GAMMA_LIST = "https://gamma-api.polymarket.com/markets/keyset?closed=false&limit=50";

function polymarketVenue(state: FakeVenueState) {
  const venue = fakeVenue(state, { [GAMMA_LIST]: json(keysetEnvelope(recorded.marketsList(), null)) }, { venue: "polymarket", nowMs });
  return { venue, adapter: createPolymarketAdapter({ fetch: venue.fetch, nowMs }) };
}

const XO_FIXTURES = new URL("../xo/fixtures/", import.meta.url);
const xoResolvedBody = (): unknown => JSON.parse(readFileSync(new URL("data-markets-closed-resolved.json", XO_FIXTURES), "utf8")) as unknown;

function xoVenue(state: FakeVenueState) {
  const venue = fakeVenue(state, (url) => (url.host === "api-mainnet.xo.market" && url.pathname === "/api/markets" ? json(xoResolvedBody()) : null), { venue: "xo", nowMs });
  return { venue, adapter: createXoAdapter({ fetch: venue.fetch, nowMs }, { variant: "standalone" }) };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "no error";
  } catch (error) {
    return String((error as { code?: unknown }).code);
  }
}

describe.each(FAKE_VENUE_STATES)("the Polymarket reader against a %s venue", (state) => {
  it("reads, or reports the state with the right code, and never retries around it", async () => {
    const { venue, adapter } = polymarketVenue(state);
    if (state === "chain_only") {
      // The host does not ask a chain-only venue; the state says so before any request.
      expect(venueReadState(venue.tracker, "polymarket", NOW)).toEqual({ kind: "chain_only", reason: CHAIN_ONLY_REASON });
      expect(venue.calls).toHaveLength(0);
      return;
    }
    const first = await codeOf(adapter.listMarkets({}));
    const second = await codeOf(adapter.listMarkets({}));
    const read = venueReadState(venue.tracker, "polymarket", NOW + 1);
    switch (state) {
      case "ok":
        expect([first, second]).toEqual(["no error", "no error"]);
        expect(read).toEqual(READ_OK);
        expect(venue.calls).toHaveLength(2);
        break;
      case "throttled":
        expect(first).toBe("RATE_LIMITED");
        // The cooldown refuses the second read before it is sent.
        expect(second).toBe("VENUE_PAUSED");
        expect(venue.calls).toHaveLength(1);
        expect(read).toMatchObject({ kind: "throttled", signal: "retry_after", untilMs: NOW + FAKE_RETRY_AFTER_S * 1000 });
        expect(venueStateReason(read, "Polymarket", NOW)).toBe(`Polymarket throttled our reads (429): retry after ${FAKE_RETRY_AFTER_S} s`);
        break;
      case "blocked_403":
        expect([first, second]).toEqual(["VENUE_PAUSED", "VENUE_PAUSED"]);
        expect(venue.calls).toHaveLength(1);
        expect(read).toMatchObject({ kind: "blocked", signal: "http_403", status: 403 });
        expect(venueStateReason(read, "Polymarket", NOW)).toBe("Polymarket blocked our reads at 2026-10-22 12:03 UTC: 403");
        break;
      case "blocked_page":
        // A web page with status 200 is a block, never SCHEMA_DRIFT.
        expect([first, second]).toEqual(["VENUE_PAUSED", "VENUE_PAUSED"]);
        expect(venue.calls).toHaveLength(1);
        expect(read).toMatchObject({ kind: "blocked", signal: "block_page", status: 200 });
        break;
    }
  });
});

describe.each(FAKE_VENUE_STATES)("the XO reader against a %s venue", (state) => {
  it("reads, or reports the state with the right code", async () => {
    const { venue, adapter } = xoVenue(state);
    if (state === "chain_only") {
      expect(venueReadState(venue.tracker, "xo", NOW).kind).toBe("chain_only");
      expect(venue.calls).toHaveLength(0);
      return;
    }
    const code = await codeOf(adapter.listMarkets({ statuses: ["resolved", "closed"] }));
    const expected: Record<Exclude<FakeVenueState, "chain_only">, string[]> = { ok: ["no error"], throttled: ["RATE_LIMITED", "VENUE_PAUSED"], blocked_403: ["VENUE_PAUSED"], blocked_page: ["VENUE_PAUSED"] };
    expect(expected[state]).toContain(code);
    expect(code).not.toBe("SCHEMA_DRIFT");
  });
});

describe("a blocked venue's rows keep their chain fields and say why the rest are missing", () => {
  async function xoRows(): Promise<MarketSummary[]> {
    const { adapter } = xoVenue("ok");
    const page = await adapter.listMarkets({ statuses: ["resolved", "closed"] });
    return page.items.filter((row) => row.ref.marketId.toLowerCase() === KNOWN_MARKETS.xoResolved.conditionId);
  }

  it("reads the settlement from the pinned Conditional Tokens and labels kept fields as cache", async () => {
    const rows = await xoRows();
    expect(rows).toHaveLength(1);
    const row = rows[0] as MarketSummary;

    // Then XO serves a web page where data was expected.
    const blocked = xoVenue("blocked_page");
    expect(await codeOf(blocked.adapter.listMarkets({ statuses: ["resolved", "closed"] }))).toBe("VENUE_PAUSED");
    const state = venueReadState(blocked.venue.tracker, "xo", NOW + 1);
    expect(state.kind).toBe("blocked");

    const { port } = replayPort(loadRecording("xo"));
    const chain = await readChainResolutions("xo", rows, { port, guard: createPinGuard(port) }, () => NOW + 2);
    const read = chain.get(row.ref.marketId.toLowerCase());
    expect(read).toMatchObject({ ok: true, via: "XO chain 3223", asOfMs: NOW + 2 });

    const sourced = sourceSummary(row, { state, name: "XO Market", nowMs: NOW + 3, fresh: false, chain: read ?? null });
    const reason = "XO Market blocked our reads at 2026-10-22 12:03 UTC: it served a web page where data was expected (status 200)";
    expect(sourced.fields.title).toEqual({ source: "cache", asOfMs: row.prov.fetchedAtMs });
    expect(sourced.fields.closesAt.source).toBe("cache");
    expect(sourced.fields.displayPrice).toEqual({ source: null, reason });
    expect(sourced.fields.volume).toEqual({ source: null, reason });
    expect(sourced.fields.resolution).toMatchObject({ source: "chain", via: "XO chain 3223" });
    expect(sourced.summary.outcomes.every((outcome) => outcome.displayPrice === null)).toBe(true);
    expect(sourced.summary.volume.amount).toBeNull();
    expect(sourced.summary.prov.freshness).not.toBe("live");
    // The recorded payout vector of this condition is [1, 0] over 1: outcome 0 won, on chain.
    expect(sourced.resolution).toEqual({ state: "resolved", payouts: ["1", "0"], denominator: "1", winningIndex: 0 });
    expect(sourced.summary.status).toBe("resolved");
    expect(sourced.fields.status).toMatchObject({ source: "chain", via: "XO chain 3223" });
  });

  it("an ok venue's fresh rows are venue_api and the chain is not asked", async () => {
    const [row] = await xoRows();
    const sourced = sourceSummary(row as MarketSummary, { state: READ_OK, name: "XO Market", nowMs: NOW, fresh: true, chain: null });
    expect(sourced.fields.displayPrice.source).toBe("venue_api");
    expect(sourced.fields.title.source).toBe("venue_api");
    expect(sourced.fields.resolution).toEqual({ source: null, reason: CHAIN_NOT_ASKED });
    expect(sourced.summary).toEqual(expect.objectContaining({ status: (row as MarketSummary).status, volume: (row as MarketSummary).volume }));
  });

  it("a throttled venue keeps its prices as read; only the book waits", async () => {
    const [row] = await xoRows();
    const sourced = sourceSummary(row as MarketSummary, { state: { kind: "throttled", signal: "retry_after", status: 429, atMs: NOW, untilMs: NOW + 30_000 }, name: "XO Market", nowMs: NOW, fresh: true, chain: null });
    expect(sourced.fields.displayPrice.source).toBe("venue_api");
  });
});
