import { describe, expect, it } from "vitest";

import { isSafeUpstreamPath, isSafeUpstreamQuery } from "@bridge/contract";

import { FetchError } from "../../core/fetch";
import type { AdapterDeps, MarketRef, TokenRef } from "../../core/ports";
import { DISCLOSURE_VERSION, venuePolicy, type VenueSwitches } from "../../core/venue-policy";
import { fakeFetch, type FakeRoute } from "../limitless/fixtures/fake-fetch";
import { isAdapterFailure } from "./errors";
import { UDX_VERSION, createUdxAdapter, tokenIdOf, udxRegisteredOrigin, type UdxAdapter } from "./index";

// Underdog (UDX) has restricted terms: no response body of the venue is committed to this repository. These tests hold
// only what needs no payload: the gate, request hygiene, the closed error set on empty and garbage answers, and what
// leaves the page. Everything that reads a venue answer is covered by the opt-in live drift test (live.test.ts).

// Fixed clock: 2026-10-19 12:00 UTC.
const NOW = Date.parse("2026-10-19T12:00:00Z");
// A test origin. headers.config.ts does not list a host for UDX yet, so the adapter is given one here.
const ORIGIN = "https://udx.example.test";
// A test input for requests that must never be sent or that only provoke an error status; not venue data.
const DAL = "ticker-under-test";
const ON: VenueSwitches = { enabled: { udx: true }, disclosureAccepted: { udx: DISCLOSURE_VERSION } };
const VERSION_HEADER = { "udx-version": UDX_VERSION };

function rig(routes: Record<string, FakeRoute>, options: { build?: "standalone" | "cockpit"; switches?: VenueSwitches; origin?: string } = {}) {
  const fake = fakeFetch(routes);
  const deps: AdapterDeps = { fetch: fake.fetch, nowMs: () => NOW };
  const adapter: UdxAdapter = createUdxAdapter(deps, {
    build: options.build ?? "cockpit",
    switches: () => options.switches ?? ON,
    origin: options.origin ?? ORIGIN,
  });
  return { ...fake, adapter };
}

function ref(ticker: string): MarketRef {
  return { venue: "udx", marketId: ticker, native: { ticker } };
}
function token(ticker: string, side: "yes" | "no"): TokenRef {
  return { venue: "udx", tokenId: tokenIdOf(ticker, side) };
}
async function failureOf(promise: Promise<unknown>): Promise<{ code: string; detail: string; retryAfterMs: number | null }> {
  try {
    await promise;
  } catch (error) {
    if (isAdapterFailure(error)) return { code: error.code, detail: error.detail, retryAfterMs: error.retryAfterMs };
    throw error;
  }
  throw new Error("expected a failure");
}
function book(bids: unknown[], asks: unknown[], ticker = DAL) {
  return { orderbook: { ticker, bids, asks } };
}

const LIST = `GET ${ORIGIN}/markets?`;
const MARKET = `GET ${ORIGIN}/markets/${DAL}`;
const BOOK = `GET ${ORIGIN}/markets/${DAL}/orderbook`;
const EMPTY_LIST = { markets: [] };

describe("restricted terms: off by default, memory-only (M0-2, R3, R8)", () => {
  it("is off until the user turns it on and accepts the clause, and sends nothing while off", async () => {
    const off: VenueSwitches[] = [
      { enabled: {}, disclosureAccepted: {} },
      { enabled: { udx: true }, disclosureAccepted: {} },
      { enabled: {}, disclosureAccepted: { udx: DISCLOSURE_VERSION } },
      { enabled: { udx: true }, disclosureAccepted: { udx: "0" } },
    ];
    for (const switches of off) {
      const { adapter, calls } = rig({}, { switches });
      expect(await failureOf(adapter.listMarkets({}))).toMatchObject({ code: "NOT_SUPPORTED", detail: "restricted_off" });
      expect(await failureOf(adapter.getMarket(ref(DAL)))).toMatchObject({ detail: "restricted_off" });
      expect(await adapter.getBooks([token(DAL, "yes")], { deadlineMs: 5_000 })).toEqual([{ ok: false, error: "NOT_SUPPORTED" }]);
      expect(await adapter.health()).toEqual({ ok: false, notes: ["restricted_off"] });
      expect(calls).toHaveLength(0);
    }
  });

  it("is off by default when no switches are given at all", async () => {
    const fake = fakeFetch({});
    const adapter = createUdxAdapter({ fetch: fake.fetch, nowMs: () => NOW }, { build: "cockpit", origin: ORIGIN });
    expect(await failureOf(adapter.listMarkets({}))).toMatchObject({ detail: "restricted_off" });
    expect(fake.calls).toHaveLength(0);
  });

  it("reads 'off: restricted terms' in the standalone build; accepted and standalone says needs the Cockpit", async () => {
    const off = rig({}, { build: "standalone", switches: { enabled: {}, disclosureAccepted: {} } });
    expect(await failureOf(off.adapter.listMarkets({}))).toMatchObject({ detail: "restricted_off" });
    const on = rig({}, { build: "standalone" });
    expect(await failureOf(on.adapter.listMarkets({}))).toMatchObject({ detail: "needs_cockpit" });
    expect(on.calls).toHaveLength(0);
  });

  it("fails closed when no host is registered", async () => {
    const { adapter, calls } = rig({}, { origin: "http://insecure.example" });
    expect(adapter.origin).toBeNull();
    expect(await failureOf(adapter.listMarkets({}))).toMatchObject({ detail: "origin_not_registered" });
    expect(await adapter.getBooks([token(DAL, "yes")], { deadlineMs: 5_000 })).toEqual([{ ok: false, error: "NOT_SUPPORTED" }]);
    expect(calls).toHaveLength(0);
  });

  it("takes its host from headers.config.ts only", () => {
    const fake = fakeFetch({});
    const adapter = createUdxAdapter({ fetch: fake.fetch, nowMs: () => NOW }, { build: "cockpit", switches: () => ON });
    expect(adapter.origin).toBe(udxRegisteredOrigin("udx"));
  });

  it("keeps everything it returns as memory data that no module may persist", () => {
    const { adapter } = rig({});
    expect(adapter.memoryOnly).toBe(true);
    expect(venuePolicy("udx")).toMatchObject({ restricted: true, defaultEnabled: false, tier: "restricted_off" });
  });
});

describe("books fail closed", () => {
  const cases: Array<[string, unknown]> = [
    ["a crossed book", book([["0.6", "1"]], [["0.5", "1"]])],
    ["a locked book", book([["0.5", "1"]], [["0.5", "1"]])],
    ["a price of zero", book([["0", "1"]], [["0.5", "1"]])],
    ["a price of one", book([["0.2", "1"]], [["1", "1"]])],
    ["a negative size", book([["0.2", "-1"]], [])],
    ["an exponent size", book([["0.2", "1e3"]], [])],
    ["a numeric price", book([[0.2, "1"]], [])],
    ["a three-element level", book([["0.2", "1", "x"]], [])],
    ["a missing side", { orderbook: { ticker: DAL, bids: [] } }],
    ["no orderbook", { bids: [], asks: [] }],
  ];
  for (const [name, body] of cases) {
    it(`reports SCHEMA_DRIFT for ${name}`, async () => {
      const { adapter } = rig({ [BOOK]: { json: body } });
      expect((await adapter.getBooks([token(DAL, "yes")], { deadlineMs: 5_000 }))[0]).toEqual({ ok: false, error: "SCHEMA_DRIFT" });
    });
  }


  it("reports EMPTY_BOOK for two empty sides", async () => {
    const empty = rig({ [BOOK]: { json: book([], []) } });
    expect(await empty.adapter.getBooks([token(DAL, "yes")], { deadlineMs: 5_000 })).toEqual([{ ok: false, error: "EMPTY_BOOK" }]);
  });

  it("maps tokens of another venue and malformed ids to NOT_SUPPORTED without a request", async () => {
    const { adapter, calls } = rig({});
    const results = await adapter.getBooks([{ venue: "kalshi", tokenId: "X#yes" }, { venue: "udx", tokenId: DAL }, { venue: "udx", tokenId: `${DAL}#maybe` }, { venue: "udx", tokenId: "../x#yes" }], { deadlineMs: 5_000 });
    expect(results.every((r) => !r.ok && r.error === "NOT_SUPPORTED")).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe("the list and getMarket refuse what they cannot serve", () => {
  it("throws SCHEMA_DRIFT when every row is malformed, and when the envelope is wrong", async () => {
    const bad = { ticker: "UDXBAD" };
    expect(await failureOf(rig({ [LIST]: { json: { markets: [bad, bad] } } }).adapter.listMarkets({}))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "no_valid_rows" });
    expect(await failureOf(rig({ [LIST]: { json: { data: [] } } }).adapter.listMarkets({}))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "list_shape" });
  });

  it("maps one port status to the route's status, clamps the page size, and refuses what it cannot list", async () => {
    const { adapter, calls } = rig({ [LIST]: { json: EMPTY_LIST } });
    await adapter.listMarkets({ statuses: ["paused"], limit: 5000 });
    expect(calls[0]?.url).toBe(`${ORIGIN}/markets?status=paused&type=single_leg&limit=100`);
    await adapter.listMarkets({ statuses: ["pending"], limit: 0 });
    expect(calls[1]?.url).toBe(`${ORIGIN}/markets?status=unopened&type=single_leg&limit=1`);
    expect(await failureOf(adapter.listMarkets({ text: "any text" }))).toMatchObject({ detail: "text_search" });
    expect(await failureOf(adapter.listMarkets({ statuses: ["active", "closed"] }))).toMatchObject({ detail: "one_status_per_call" });
    expect(await failureOf(adapter.listMarkets({ statuses: ["resolved"] }))).toMatchObject({ detail: "status_not_listable" });
    expect(await failureOf(adapter.listMarkets({ cursor: "a&status=all" }))).toMatchObject({ detail: "bad_cursor" });
    expect(calls).toHaveLength(2);
  });

  it("getMarket refuses a bad id without a request and an answer that is not a market", async () => {
    const { adapter, calls } = rig({});
    expect(await failureOf(adapter.getMarket(ref("../etc")))).toMatchObject({ code: "NOT_FOUND", detail: "bad_market_id" });
    expect(await failureOf(adapter.getMarket({ venue: "kalshi", marketId: DAL, native: {} }))).toMatchObject({ detail: "wrong_venue" });
    expect(calls).toHaveLength(0);
    expect(await failureOf(rig({ [MARKET]: { json: { ticker: DAL } } }).adapter.getMarket(ref(DAL)))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "market_shape" });
  });

  it("never puts upstream text in an error", async () => {
    const secret = "SECRET-IN-BODY";
    const failure = await failureOf(rig({ [MARKET]: { json: { market: { ticker: DAL, description: secret } } } }).adapter.getMarket(ref(DAL)));
    expect(JSON.stringify(failure)).not.toContain(secret);
  });
});

describe("transport outcomes (R9, R10)", () => {
  const code = async (reply: FakeRoute) => {
    const { adapter, calls } = rig({ [MARKET]: reply });
    return { ...(await failureOf(adapter.getMarket(ref(DAL)))), requests: calls.length };
  };

  it("maps a 401 and a 403 to a pause with exactly one request", async () => {
    expect(await code({ status: 401 })).toMatchObject({ code: "VENUE_PAUSED", retryAfterMs: 600_000, requests: 1 });
    expect(await code({ status: 403 })).toMatchObject({ code: "VENUE_PAUSED", retryAfterMs: 600_000, requests: 1 });
  });

  it("maps the other statuses to the closed error set", async () => {
    expect(await code({ status: 404 })).toMatchObject({ code: "NOT_FOUND" });
    expect(await code({ status: 429, headers: { "retry-after": "2" } })).toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 2_000 });
    expect(await code({ status: 500 })).toMatchObject({ code: "VENUE_PAUSED" });
    expect(await code({ status: 504 })).toMatchObject({ code: "TIMEOUT" });
    expect(await code({ reject: true })).toMatchObject({ code: "TIMEOUT" });
    expect(await code({ text: "<html>blocked</html>" })).toMatchObject({ code: "SCHEMA_DRIFT", detail: "invalid_json" });
    expect(await code({ text: "x".repeat(4_000_001) })).toMatchObject({ code: "SCHEMA_DRIFT", detail: "body_too_large" });
  });


  it("refuses an answer that names another API version", async () => {
    expect(await code({ json: {}, headers: { "udx-version": "2026-01-01" } })).toMatchObject({ code: "SCHEMA_DRIFT", detail: "version_mismatch" });
  });

  it("keeps the meaning of the fetch layer's own refusals", async () => {
    const adapter = createUdxAdapter(
      {
        fetch: async () => {
          throw new FetchError("bridge", "x", { bridgeCode: "venue_disabled" });
        },
        nowMs: () => NOW,
      },
      { build: "cockpit", switches: () => ON, origin: ORIGIN },
    );
    expect(await failureOf(adapter.getMarket(ref(DAL)))).toMatchObject({ code: "VENUE_PAUSED" });
  });

  it("times out a hung upstream at the deadline", async () => {
    const { adapter } = rig({ [BOOK]: { hang: true } });
    expect(await adapter.getBooks([token(DAL, "yes")], { deadlineMs: 20 })).toEqual([{ ok: false, error: "TIMEOUT" }]);
  });

  it("health reads one market page without throwing", async () => {
    expect(await rig({ [LIST]: { json: { nope: 1 } } }).adapter.health()).toEqual({ ok: false, notes: ["list_shape"] });
    expect(await rig({ [LIST]: { status: 403 } }).adapter.health()).toEqual({ ok: false, notes: ["http_403"] });
  });
});

describe("what leaves the page (M0-4, M1-3)", () => {
  it("sends GET requests whose only header is the API version, to safe public paths only", async () => {
    const { adapter, calls } = rig({
      [LIST]: { json: EMPTY_LIST },
      [MARKET]: { json: {} },
      [BOOK]: { json: {} },
    });
    await adapter.listMarkets({});
    await adapter.getMarket(ref(DAL)).catch(() => undefined);
    await adapter.getBooks([token(DAL, "yes"), token(DAL, "no")], { deadlineMs: 5_000 });
    await adapter.health();
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.method).toBe("GET");
      expect(call.headers).toEqual(VERSION_HEADER);
      expect(call.body).toBeUndefined();
      const url = new URL(call.url);
      expect(url.origin).toBe(ORIGIN);
      expect(isSafeUpstreamPath(url.pathname), call.url).toBe(true);
      expect(isSafeUpstreamQuery(url.search.slice(1)), call.url).toBe(true);
      // The trade tape, candlesticks and every keyed route stay unused.
      expect(url.pathname).toMatch(/^\/markets(?:\/[A-Za-z0-9._-]+(?:\/orderbook)?)?$/);
    }
  });
});
