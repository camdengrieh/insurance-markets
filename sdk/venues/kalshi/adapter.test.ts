import { describe, expect, it } from "vitest";

import { canPersist } from "../cache.js";
import { FetchError } from "../transport.js";
import type { AdapterDeps, MarketRef, TokenRef } from "../../model.js";
import { DISCLOSURE_VERSION, venuePolicy, type VenueSwitches } from "../policy.js";
import { fakeFetch, type FakeRoute } from "../limitless/fixtures/fake-fetch.js";
import { isAdapterFailure } from "./errors.js";
import { createKalshiAdapter, kalshiRegisteredOrigin, tokenIdOf, type KalshiAdapter } from "./index.js";

// No Kalshi payload of any kind lives in this repo: the Kalshi Developer Agreement bars caching or aggregating its
// data, and no invented market data is committed either. These tests need no payload. They feed the adapter an
// empty object or a garbage string (a test input, not market data) and check the gate, the allowlist, the error
// mapping and the fail-closed behavior. Shape and unit handling is checked by the opt-in live suite (live.test.ts).

// Fixed clock: 2026-10-19 12:00 UTC.
const NOW = Date.parse("2026-10-19T12:00:00Z");
const ORIGIN = "https://external-api.kalshi.com";
const API = `${ORIGIN}/trade-api/v2`;
// An identifier used only as a path segment; no request ever returns data for it.
const TICKER = "KXTEST-1";
const ON: VenueSwitches = { enabled: { kalshi: true }, disclosureAccepted: { kalshi: DISCLOSURE_VERSION } };

function rig(routes: Record<string, FakeRoute>, options: { build?: "standalone" | "cockpit"; switches?: VenueSwitches; origin?: string } = {}) {
  const fake = fakeFetch(routes);
  const deps: AdapterDeps = { fetch: fake.fetch, nowMs: () => NOW };
  const adapter: KalshiAdapter = createKalshiAdapter(deps, {
    build: options.build ?? "cockpit",
    switches: () => options.switches ?? ON,
    ...(options.origin === undefined ? {} : { origin: options.origin }),
  });
  return { ...fake, adapter };
}

function ref(ticker: string, event?: string): MarketRef {
  return { venue: "kalshi", marketId: ticker, native: { ticker, ...(event === undefined ? {} : { event_ticker: event }) } };
}
function token(ticker: string, side: "yes" | "no"): TokenRef {
  return { venue: "kalshi", tokenId: tokenIdOf(ticker, side) };
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
async function settle(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (!isAdapterFailure(error)) throw error;
  }
}

const LIST = `GET ${API}/markets?`;
const MARKET = `GET ${API}/markets/${TICKER}`;
const BOOK = `GET ${API}/markets/${TICKER}/orderbook`;
const EMPTY: FakeRoute = { json: {} };

describe("registry", () => {
  it("takes the host from sdk/venues/origins.ts, the single source of truth", () => {
    expect(kalshiRegisteredOrigin("kalshi")).toBe(ORIGIN);
    expect(rig({}).adapter.origin).toBe(ORIGIN);
  });
});

describe("restricted terms: off by default, memory-only (M0-2, M1-6, R3, R8)", () => {
  it("is off until the user turns it on and accepts the clause, and sends nothing while off", async () => {
    const off: VenueSwitches[] = [
      { enabled: {}, disclosureAccepted: {} },
      { enabled: { kalshi: true }, disclosureAccepted: {} },
      { enabled: {}, disclosureAccepted: { kalshi: DISCLOSURE_VERSION } },
      { enabled: { kalshi: true }, disclosureAccepted: { kalshi: "0" } },
      { enabled: { kalshi: false }, disclosureAccepted: { kalshi: DISCLOSURE_VERSION } },
    ];
    for (const switches of off) {
      const { adapter, calls } = rig({}, { switches });
      expect(await failureOf(adapter.listMarkets({}))).toMatchObject({ code: "NOT_SUPPORTED", detail: "restricted_off" });
      expect(await failureOf(adapter.getMarket(ref(TICKER)))).toMatchObject({ detail: "restricted_off" });
      expect(await adapter.getBooks([token(TICKER, "yes")], { deadlineMs: 5_000 })).toEqual([{ ok: false, error: "NOT_SUPPORTED" }]);
      expect(await adapter.health()).toEqual({ ok: false, notes: ["restricted_off"] });
      expect(calls).toHaveLength(0);
    }
  });

  it("is off by default when no switches are given at all", async () => {
    const fake = fakeFetch({});
    const adapter = createKalshiAdapter({ fetch: fake.fetch, nowMs: () => NOW }, { build: "cockpit" });
    expect(await failureOf(adapter.listMarkets({}))).toMatchObject({ detail: "restricted_off" });
    expect(fake.calls).toHaveLength(0);
  });

  it("reads 'off: restricted terms' in the standalone build even when switched on; accepted and standalone says needs the Cockpit", async () => {
    const off = rig({}, { build: "standalone", switches: { enabled: {}, disclosureAccepted: {} } });
    expect(await failureOf(off.adapter.listMarkets({}))).toMatchObject({ detail: "restricted_off" });
    const on = rig({}, { build: "standalone" });
    expect(await failureOf(on.adapter.listMarkets({}))).toMatchObject({ detail: "needs_cockpit" });
    expect(on.calls).toHaveLength(0);
  });

  it("takes effect at once when the user turns it off again", async () => {
    let switches: VenueSwitches = ON;
    const fake = fakeFetch({ [LIST]: EMPTY });
    const adapter = createKalshiAdapter({ fetch: fake.fetch, nowMs: () => NOW }, { build: "cockpit", switches: () => switches });
    await settle(adapter.listMarkets({}));
    expect(fake.calls).toHaveLength(1);
    switches = { enabled: {}, disclosureAccepted: {} };
    expect(await failureOf(adapter.listMarkets({}))).toMatchObject({ detail: "restricted_off" });
    expect(fake.calls).toHaveLength(1);
  });

  it("is memory-only own-use data that no module may persist, and the policy is restricted and off by default", () => {
    const { adapter } = rig({});
    expect(adapter.memoryOnly).toBe(true);
    expect(canPersist("market_data", "own_use_only")).toBe(false);
    expect(venuePolicy("kalshi")).toMatchObject({ restricted: true, defaultEnabled: false, tier: "restricted_off" });
  });
});

describe("books fail closed", () => {
  const cases: Array<[string, unknown]> = [
    ["an empty object", {}],
    ["an empty orderbook_fp", { orderbook_fp: {} }],
    ["a string orderbook_fp", { orderbook_fp: "garbage" }],
    ["a bare string", "garbage"],
    ["a null body", null],
  ];
  for (const [name, body] of cases) {
    it(`reports SCHEMA_DRIFT for ${name}`, async () => {
      const { adapter } = rig({ [BOOK]: { json: body } });
      expect((await adapter.getBooks([token(TICKER, "yes")], { deadlineMs: 5_000 }))[0]).toEqual({ ok: false, error: "SCHEMA_DRIFT" });
    });
  }

  it("maps tokens of another venue and malformed ids to NOT_SUPPORTED without a request", async () => {
    const { adapter, calls } = rig({});
    const results = await adapter.getBooks([{ venue: "limitless", tokenId: "1" }, { venue: "kalshi", tokenId: "NOHASH" }, { venue: "kalshi", tokenId: `${TICKER}#maybe` }, { venue: "kalshi", tokenId: "../x#yes" }], { deadlineMs: 5_000 });
    expect(results.every((r) => !r.ok && r.error === "NOT_SUPPORTED")).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe("list answers fail closed", () => {
  it("throws SCHEMA_DRIFT when the envelope is wrong", async () => {
    expect(await failureOf(rig({ [LIST]: { json: { data: [] } } }).adapter.listMarkets({}))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "list_shape" });
    expect(await failureOf(rig({ [LIST]: EMPTY }).adapter.listMarkets({}))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "list_shape" });
    expect(await failureOf(rig({ [LIST]: { json: "garbage" } }).adapter.listMarkets({}))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "list_shape" });
  });
});

describe("list parameters", () => {
  it("maps one port status to the route's status, pages by the opaque cursor, and clamps the page size", async () => {
    const { adapter, calls } = rig({ [LIST]: EMPTY });
    await settle(adapter.listMarkets({ statuses: ["resolved"], limit: 5000, cursor: "AbC_-=123" }));
    expect(calls[0]?.url).toBe(`${API}/markets?status=settled&limit=100&mve_filter=exclude&cursor=AbC_-=123`);
    await settle(adapter.listMarkets({ statuses: ["pending"], limit: 0 }));
    expect(calls[1]?.url).toBe(`${API}/markets?status=unopened&limit=1&mve_filter=exclude`);
  });

  it("refuses text search, several statuses, statuses it cannot list and a hostile cursor, and sends nothing", async () => {
    const { adapter, calls } = rig({});
    expect(await failureOf(adapter.listMarkets({ text: "senate" }))).toMatchObject({ code: "NOT_SUPPORTED", detail: "text_search" });
    expect(await failureOf(adapter.listMarkets({ statuses: ["active", "closed"] }))).toMatchObject({ detail: "one_status_per_call" });
    expect(await failureOf(adapter.listMarkets({ statuses: ["voided"] }))).toMatchObject({ detail: "status_not_listable" });
    expect(await failureOf(adapter.listMarkets({ cursor: "a&status=all" }))).toMatchObject({ detail: "bad_cursor" });
    expect(await failureOf(adapter.listMarkets({ cursor: "../x" }))).toMatchObject({ detail: "bad_cursor" });
    expect(calls).toHaveLength(0);
  });
});

describe("getMarket", () => {
  it("refuses a bad id and another venue's ref without a request, and an answer of the wrong shape", async () => {
    const { adapter, calls } = rig({ [MARKET]: EMPTY });
    expect(await failureOf(adapter.getMarket(ref("../etc")))).toMatchObject({ code: "NOT_FOUND", detail: "bad_market_id" });
    expect(await failureOf(adapter.getMarket({ venue: "xo", marketId: TICKER, native: {} }))).toMatchObject({ detail: "wrong_venue" });
    expect(calls).toHaveLength(0);
    expect(await failureOf(adapter.getMarket(ref(TICKER)))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "market_shape" });
  });
});

describe("errors never carry upstream text", () => {
  it("keeps the body out of a failure", async () => {
    const secret = "SECRET-IN-BODY";
    const failure = await failureOf(rig({ [MARKET]: { json: { market: secret } } }).adapter.getMarket(ref(TICKER)));
    expect(JSON.stringify(failure)).not.toContain(secret);
  });
});

describe("transport outcomes (R9, R10)", () => {
  const code = async (reply: FakeRoute) => {
    const { adapter, calls } = rig({ [MARKET]: reply });
    const failure = await failureOf(adapter.getMarket(ref(TICKER)));
    return { ...failure, requests: calls.length };
  };

  it("maps a 403 to a pause and makes exactly one request: nothing retries around a block", async () => {
    expect(await code({ status: 403 })).toMatchObject({ code: "VENUE_PAUSED", retryAfterMs: 600_000, requests: 1 });
  });

  it("maps the other statuses to the closed error set", async () => {
    expect(await code({ status: 404 })).toMatchObject({ code: "NOT_FOUND" });
    expect(await code({ status: 429, headers: { "retry-after": "9" } })).toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 9_000 });
    expect(await code({ status: 401 })).toMatchObject({ code: "VENUE_PAUSED" });
    expect(await code({ status: 500 })).toMatchObject({ code: "VENUE_PAUSED" });
    expect(await code({ status: 504 })).toMatchObject({ code: "TIMEOUT" });
    expect(await code({ status: 418 })).toMatchObject({ code: "SCHEMA_DRIFT" });
    expect(await code({ reject: true })).toMatchObject({ code: "TIMEOUT" });
    expect(await code({ text: "<html>Forbidden</html>" })).toMatchObject({ code: "SCHEMA_DRIFT", detail: "invalid_json" });
    expect(await code({ text: "x".repeat(4_000_001) })).toMatchObject({ code: "SCHEMA_DRIFT", detail: "body_too_large" });
  });

  it("keeps the meaning of the fetch layer's own refusals (daemon pause, restricted-venue switch)", async () => {
    for (const [fetchCode, bridgeCode, expected] of [
      ["paused", null, "VENUE_PAUSED"],
      ["bridge", "venue_disabled", "VENUE_PAUSED"],
      ["bridge", "venue_paused", "VENUE_PAUSED"],
      ["unauthorized", null, "NOT_SUPPORTED"],
    ] as const) {
      const adapter = createKalshiAdapter(
        {
          fetch: async () => {
            throw new FetchError(fetchCode, "x", { bridgeCode });
          },
          nowMs: () => NOW,
        },
        { build: "cockpit", switches: () => ON },
      );
      expect(await failureOf(adapter.getMarket(ref(TICKER)))).toMatchObject({ code: expected });
    }
  });

  it("times out a hung upstream at the deadline", async () => {
    const { adapter } = rig({ [BOOK]: { hang: true } });
    expect(await adapter.getBooks([token(TICKER, "yes")], { deadlineMs: 20 })).toEqual([{ ok: false, error: "TIMEOUT" }]);
  });

  it("health fails closed without throwing on a wrong shape or an error status", async () => {
    const STATUS = `GET ${API}/exchange/status`;
    expect(await rig({ [STATUS]: { json: { nope: 1 } } }).adapter.health()).toEqual({ ok: false, notes: ["status_shape"] });
    expect(await rig({ [STATUS]: { status: 403 } }).adapter.health()).toEqual({ ok: false, notes: ["http_403"] });
  });
});

// That every request also passes the Cockpit's read proxy (the app's resolveUpstream and the daemon allowlist) is
// checked where those live: app/src/core/fetch-kalshi.test.ts.
describe("what leaves the page (M0-4, M1-3, R10)", () => {
  it("sends GET requests with no headers, no body and no Origin, to the registered origin only", async () => {
    const { adapter, calls } = rig({
      [LIST]: EMPTY,
      [MARKET]: EMPTY,
      [BOOK]: EMPTY,
      [`GET ${API}/exchange/status`]: EMPTY,
    });
    await settle(adapter.listMarkets({ cursor: "AbC" }));
    await settle(adapter.getMarket(ref(TICKER)));
    await settle(adapter.getBooks([token(TICKER, "yes"), token(TICKER, "no")], { deadlineMs: 5_000 }));
    await settle(adapter.health());
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) {
      expect(call.method).toBe("GET");
      expect(call.headers).toEqual({});
      expect(call.body).toBeUndefined();
      expect(call.url.startsWith(`${ORIGIN}/`)).toBe(true);
    }
  });

  it("never reaches a signed route: no URL contains the portfolio, orders or fills routes", async () => {
    const { adapter, calls } = rig({ [LIST]: EMPTY, [MARKET]: EMPTY, [BOOK]: EMPTY });
    await settle(adapter.listMarkets({}));
    await settle(adapter.getMarket(ref(TICKER)));
    await settle(adapter.getBooks([token(TICKER, "yes")], { deadlineMs: 5_000 }));
    for (const call of calls) expect(call.url).not.toMatch(/portfolio|\/orders\b|fills|settlements|balance/);
  });
});
