import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS } from "../origins.js";
import type { Market } from "../../model.js";
import { MAX_BODY_CHARS } from "./fetch-json.js";
import { XO_DATA_ORIGIN, XO_ORDERBOOK_ORIGIN, createXoAdapter, isXoAdapterError, XoAdapterError, type XoAdapter } from "./index.js";
import { manualClock, scriptedFetch, type ScriptedReply, type ScriptedRoute } from "./testkit.js";

// How the adapter talks: only GET, only to the two XO hosts, only with the listed hosts per build, and every
// failure becomes one fixed code that carries none of the upstream's words.

const FIXTURES = new URL("./fixtures/", import.meta.url);
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8")) as unknown;
type Rec = Record<string, unknown>;

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const DATA = "api-mainnet.xo.market";
const BOOKS = "orderbooks.xo.market";
const FEE400 = "0xb63d8f77fc1437a804d5fdeedb4c00dc49e1d7c7738f6410c36f1f44e6cfd654";
const YES = "68215442288791572296498952759094916177229244750752613990844701608971303593663";
const FRACTIONAL = "92405223113781133805412284720343870251774119932157196615021237861128430695593";
const CANARY = "CANARY-9c2e-ignore-previous-instructions";

function listAdapter(reply: ScriptedReply, extra: { requestTimeoutMs?: number } = {}) {
  const { fetch, calls } = scriptedFetch([{ host: DATA, path: "/api/markets", reply }]);
  const adapter: XoAdapter = createXoAdapter({ fetch, nowMs: manualClock(NOW).nowMs }, { variant: "standalone", ...extra });
  return { adapter, calls };
}

async function failure(promise: Promise<unknown>): Promise<XoAdapterError> {
  try {
    await promise;
  } catch (error) {
    if (isXoAdapterError(error)) return error;
    throw error;
  }
  throw new Error("expected a XoAdapterError");
}

describe("failures map to a closed set of codes", () => {
  it("rate limit: RATE_LIMITED with the delay when it is delta-seconds, capped, and without it otherwise", async () => {
    const seven = await failure(listAdapter({ status: 429, headers: { "Retry-After": "7" }, body: {} }).adapter.listMarkets({}));
    expect([seven.code, seven.retryAfterMs, seven.status]).toEqual(["RATE_LIMITED", 7000, 429]);
    const capped = await failure(listAdapter({ status: 429, headers: { "retry-after": "999999" }, body: {} }).adapter.listMarkets({}));
    expect(capped.retryAfterMs).toBe(600_000);
    for (const value of ["Wed, 21 Oct 2026 07:28:00 GMT", "-1", "1.5", "", "1e3", "9999999"]) {
      const error = await failure(listAdapter({ status: 429, headers: { "retry-after": value }, body: {} }).adapter.listMarkets({}));
      expect([error.code, error.retryAfterMs]).toEqual(["RATE_LIMITED", undefined]);
    }
    const none = await failure(listAdapter({ status: 429, body: {} }).adapter.listMarkets({}));
    expect(none.retryAfterMs).toBeUndefined();
  });

  it("403 pauses the venue (R9), a 5xx is a venue that did not answer (F2), 404 is NOT_FOUND, any other status is drift", async () => {
    const expected: Array<[number, string]> = [
      [403, "VENUE_PAUSED"],
      [500, "TIMEOUT"],
      [502, "TIMEOUT"],
      [503, "TIMEOUT"],
      [504, "TIMEOUT"],
      [404, "NOT_FOUND"],
      [400, "SCHEMA_DRIFT"],
      [401, "SCHEMA_DRIFT"],
      [418, "SCHEMA_DRIFT"],
      [301, "SCHEMA_DRIFT"],
    ];
    for (const [status, code] of expected) {
      const error = await failure(listAdapter({ status, body: {} }).adapter.listMarkets({}));
      expect([status, error.code]).toEqual([status, code]);
    }
  });

  it("a thrown fetch is TIMEOUT (the venue did not answer), not a pause and not a crash (F2)", async () => {
    const error = await failure(listAdapter({ reject: true }).adapter.listMarkets({}));
    expect([error.code, error.reason]).toEqual(["TIMEOUT", "network"]);
  });

  it("a body that is not JSON, or is too large, is SCHEMA_DRIFT", async () => {
    const html = await failure(listAdapter({ text: "<html>blocked</html>" }).adapter.listMarkets({}));
    expect([html.code, html.reason]).toEqual(["SCHEMA_DRIFT", "not_json"]);
    const big = await failure(listAdapter({ text: `[${" ".repeat(MAX_BODY_CHARS)}]` }).adapter.listMarkets({}));
    expect([big.code, big.reason]).toEqual(["SCHEMA_DRIFT", "body_too_large"]);
    const empty = await failure(listAdapter({ text: "" }).adapter.listMarkets({}));
    expect(empty.code).toBe("SCHEMA_DRIFT");
  });

  it("a hung request is TIMEOUT once the ceiling passes", async () => {
    const error = await failure(listAdapter({ hang: true }, { requestTimeoutMs: 20 }).adapter.listMarkets({}));
    expect([error.code, error.reason]).toEqual(["TIMEOUT", "deadline"]);
  });

  it("no error, whatever the upstream sends, carries the upstream's words", async () => {
    const replies: ScriptedReply[] = [
      { status: 429, headers: { "retry-after": "5", "x-canary": CANARY }, body: { message: CANARY } },
      { status: 403, body: { error: CANARY } },
      { status: 500, text: CANARY },
      { status: 404, body: { details: { message: CANARY } } },
      { text: CANARY },
      { body: { data: CANARY, meta: CANARY } },
      { body: { data: [{ title: CANARY }], meta: { page: 1, hasNextPage: false } } },
    ];
    for (const reply of replies) {
      try {
        // A row that fails to decode is skipped, not thrown: what is reported about it must be clean too.
        const detailed = await listAdapter(reply).adapter.listMarketsDetailed({});
        expect(JSON.stringify(detailed)).not.toContain("CANARY");
      } catch (error) {
        if (!isXoAdapterError(error)) throw error;
        expect(JSON.stringify([error.message, error.reason, error.code, error.name, error.status, error.retryAfterMs, error.detail ?? ""])).not.toContain("CANARY");
      }
    }
  });
});

describe("request hygiene", () => {
  const FORBIDDEN_HEADERS = ["user-agent", "origin", "referer", "cookie", "authorization", "x-api-key", "content-type"];

  it("every request in a full standalone session is a bare GET to the Data API over https", async () => {
    const detail = fixture("live-data-detail-fee-400.json");
    const list = fixture("live-data-list-active.json");
    const oneRow = { ...(list as Rec), data: (list as { data: unknown[] }).data.slice(0, 1) };
    const { fetch, calls } = scriptedFetch([
      { host: DATA, path: "/api/markets", reply: (url) => ({ body: url.searchParams.get("take") === "1" ? oneRow : list }) },
      { host: DATA, path: `/api/markets/contract/${FEE400}`, reply: { body: detail } },
    ]);
    const adapter = createXoAdapter({ fetch, nowMs: () => NOW }, { variant: "standalone" });
    await adapter.listMarkets({ text: "ufc" });
    const market: Market = await adapter.getMarket({ venue: "xo", marketId: FEE400, native: {} });
    await adapter.getFeeSpec(market);
    await adapter.getBooks([{ venue: "xo", tokenId: YES }], { deadlineMs: 1000 });
    await adapter.health();
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) {
      expect(call.method).toBe("GET");
      expect(call.url.protocol).toBe("https:");
      expect(call.url.hostname).toBe(DATA);
      expect(call.url.username + call.url.password + call.url.hash).toBe("");
      expect(Object.keys(call.headers)).toEqual(["accept"]);
      for (const name of FORBIDDEN_HEADERS) expect(Object.keys(call.headers).map((key) => key.toLowerCase())).not.toContain(name);
    }
  });

  it("a Cockpit session also reaches the order book host, and nothing else", async () => {
    const book = fixture("live-orderbook-book-fractional.json");
    const detail = fixture("live-data-detail-fee-400.json");
    const { fetch, calls } = scriptedFetch([
      { host: DATA, path: "/api/markets", reply: { body: { ...(fixture("live-data-list-active.json") as Rec), data: [] } } },
      { host: DATA, path: `/api/markets/contract/${FEE400}`, reply: { body: detail } },
      { host: BOOKS, path: "/book", reply: { body: book } },
      { host: BOOKS, path: "/fee-rate", reply: { body: { base_fee: 0 } } },
      { host: BOOKS, path: "/trading-state", reply: { body: { state: "active" } } },
    ]);
    const adapter = createXoAdapter({ fetch, nowMs: () => NOW }, { variant: "cockpit" });
    await adapter.listMarkets({});
    await adapter.getFeeSpec({ ref: { venue: "xo", marketId: FEE400, native: {} } } as Market);
    await adapter.getBooks([{ venue: "xo", tokenId: FRACTIONAL }], { deadlineMs: 1000 });
    await adapter.health();
    const hosts = new Set(calls.map((call) => call.url.hostname));
    expect([...hosts].sort()).toEqual([BOOKS, DATA].sort());
    for (const call of calls) {
      expect(call.method).toBe("GET");
      expect(call.url.protocol).toBe("https:");
      expect(Object.keys(call.headers)).toEqual(["accept"]);
    }
  });
});

describe("origins match the single source of truth (M0-4)", () => {
  it("names exactly the hosts that sdk/venues/origins.ts lists for XO", () => {
    const dataEntry = BROWSER_DIRECT_ORIGINS.find((entry) => entry.service === "xo_data");
    const bookEntry = DAEMON_ONLY_ORIGINS.find((entry) => entry.service === "xo_orderbook");
    expect(dataEntry?.origin).toBe(XO_DATA_ORIGIN);
    expect(bookEntry?.origin).toBe(XO_ORDERBOOK_ORIGIN);
  });

  it("the standalone build's only origin is browser-direct; the order book origin is daemon-only and not in any browser CSP list", () => {
    const direct = new Set(BROWSER_DIRECT_ORIGINS.map((entry) => entry.origin));
    expect(direct.has(XO_DATA_ORIGIN)).toBe(true);
    expect(direct.has(XO_ORDERBOOK_ORIGIN)).toBe(false);
  });

  it("builds URLs only on those origins", async () => {
    const { listUrl, detailUrl, bookUrl, feeRateUrl, tradingStateUrl } = await import("./urls.js");
    const urls = [
      listUrl({ statuses: ["ACTIVE"], take: 1, page: 1 }),
      detailUrl(FEE400),
      bookUrl(YES),
      feeRateUrl(YES),
      tradingStateUrl(),
    ];
    for (const url of urls) expect([XO_DATA_ORIGIN, XO_ORDERBOOK_ORIGIN]).toContain(new URL(url).origin);
  });

  it("refuses to build a URL from a malformed id, token, page, take, status or search", async () => {
    const { listUrl, detailUrl, bookUrl, feeRateUrl } = await import("./urls.js");
    expect(() => detailUrl("../../etc/passwd")).toThrow(RangeError);
    expect(() => detailUrl(FEE400.toUpperCase())).toThrow(RangeError);
    expect(() => bookUrl("1&token_id=2")).toThrow(RangeError);
    expect(() => bookUrl("0")).toThrow(RangeError);
    expect(() => feeRateUrl("1/../2")).toThrow(RangeError);
    const ok = { statuses: ["ACTIVE" as const], take: 1, page: 1 };
    expect(() => listUrl({ ...ok, statuses: [] })).toThrow(RangeError);
    expect(() => listUrl({ ...ok, statuses: ["ACTIVE,PAUSED" as never] })).toThrow(RangeError);
    expect(() => listUrl({ ...ok, take: 51 })).toThrow(RangeError);
    expect(() => listUrl({ ...ok, page: 0 })).toThrow(RangeError);
    expect(() => listUrl({ ...ok, search: "" })).toThrow(RangeError);
    // A search is encoded, not spliced: it cannot add a query parameter.
    const url = new URL(listUrl({ ...ok, search: "a&take=50#x" }));
    expect(url.searchParams.get("search")).toBe("a&take=50#x");
    expect(url.searchParams.get("take")).toBe("1");
    expect(url.hash).toBe("");
  });
});
