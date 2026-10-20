import { describe, expect, it } from "vitest";

import { parseReadProxyTarget } from "@bridge/contract";

import { createAppFetch, createCockpitFetch, readProxyRequestFor } from "./fetch-cockpit";
import { FakeRaw, FakeTimers, rawResponse } from "./fakes";
import { FetchError, adapterErrorOfFetch, isFetchError, type FetchErrorCode, type RawInit, type RawResponse } from "./fetch";

const TOKEN = `cku_${"A".repeat(43)}`;

function envelope(service: string, upstreamStatus: number, body: unknown, retryAfterS: number | null = null): string {
  return JSON.stringify({ service, upstream_status: upstreamStatus, fetched_at: "2026-10-19T09:30:05Z", fetched_at_ms: 1_792_402_205_000, bytes: 10, retry_after_s: retryAfterS, body });
}

function setup(handler: (url: string, init: RawInit) => Promise<RawResponse> | RawResponse, token: string | null = TOKEN) {
  const raw = new FakeRaw(handler);
  const timers = new FakeTimers();
  const fetch = createCockpitFetch({ rawFetch: raw.fetch, timers, getToken: () => token });
  return { raw, timers, fetch };
}

async function codeOf(promise: Promise<unknown>): Promise<FetchErrorCode | "no error"> {
  try {
    await promise;
    return "no error";
  } catch (error) {
    if (isFetchError(error)) return error.code;
    throw error;
  }
}

describe("the single URL -> read-proxy mapping", () => {
  it("builds /ui/read/<service>/<path>?<query> for browser-direct and daemon-only hosts", () => {
    expect(readProxyRequestFor("https://api-mainnet.xo.market/api/markets?take=50&statuses=ACTIVE")).toEqual({
      service: "xo_data",
      requestPath: "/ui/read/xo_data/api/markets?take=50&statuses=ACTIVE",
    });
    expect(readProxyRequestFor("https://orderbooks.xo.market/book?token_id=123").requestPath).toBe("/ui/read/xo_orderbook/book?token_id=123");
    expect(readProxyRequestFor("https://external-api.kalshi.com/trade-api/v2/exchange/status").requestPath).toBe("/ui/read/kalshi/trade-api/v2/exchange/status");
    expect(readProxyRequestFor("https://base-rpc.publicnode.com").requestPath).toBe("/ui/read/rpc_base/");
  });

  it("round-trips through the daemon's own parser", () => {
    const { requestPath } = readProxyRequestFor("https://gamma-api.polymarket.com/markets?limit=10&closed=false");
    expect(parseReadProxyTarget(requestPath)).toEqual({ service: "polymarket_gamma", path: "/markets", query: "limit=10&closed=false" });
    const rpc = readProxyRequestFor("https://polygon-bor-rpc.publicnode.com").requestPath;
    expect(parseReadProxyTarget(rpc)).toEqual({ service: "rpc_polygon", path: "/", query: "" });
  });

  it("refuses a host that is not on the list", () => {
    expect(() => readProxyRequestFor("https://evil.example/x")).toThrow(FetchError);
    expect(() => readProxyRequestFor("https://api.paybox.sh/mcp")).toThrow(FetchError);
  });
});

describe("createCockpitFetch", () => {
  it("sends only the bearer token, to the same origin, with no credentials, cookies or custom headers", async () => {
    const { raw, fetch } = setup(() => rawResponse({ body: envelope("polymarket_gamma", 200, [{ id: 1 }]) }));
    const response = await fetch("https://gamma-api.polymarket.com/markets?limit=1", { headers: { "User-Agent": "x", Origin: "https://evil.example", "X-Quotient-Api-Key": "qt_x", Cookie: "a=b" } });
    expect(raw.calls).toHaveLength(1);
    expect(raw.calls[0]?.url).toBe("/ui/read/polymarket_gamma/markets?limit=1");
    expect(raw.calls[0]?.init.headers).toEqual({ accept: "application/json", authorization: `Bearer ${TOKEN}` });
    expect(raw.calls[0]?.init.credentials).toBe("omit");
    expect(raw.calls[0]?.init.redirect).toBe("manual");
    expect(raw.calls[0]?.init.referrerPolicy).toBe("no-referrer");
    expect(raw.calls[0]?.init.cache).toBe("no-store");
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 1 }]);
    expect(await response.text()).toBe('[{"id":1}]');
  });

  it("unwraps the upstream status and Retry-After so adapters see an ordinary response", async () => {
    const { fetch } = setup(() => rawResponse({ body: envelope("kalshi", 429, { message: "slow down" }, 7) }));
    const response = await fetch("https://external-api.kalshi.com/trade-api/v2/markets");
    expect(response.ok).toBe(false);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7");
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("etag")).toBeNull();
  });

  it("proxies a read-only JSON-RPC POST and refuses a write before any request", async () => {
    const { raw, fetch } = setup(() => rawResponse({ body: envelope("rpc_base", 200, { result: "0x" }) }));
    const read = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: ["0x0000000000000000000000000000000000000001", "latest"] });
    await fetch("https://base-rpc.publicnode.com", { method: "POST", body: read });
    expect(raw.calls[0]?.url).toBe("/ui/read/rpc_base/");
    expect(raw.calls[0]?.init.method).toBe("POST");
    expect(raw.calls[0]?.init.body).toBe(read);
    expect(raw.calls[0]?.init.headers).toEqual({ accept: "application/json", authorization: `Bearer ${TOKEN}`, "content-type": "application/json" });
    const write = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: ["0x00"] });
    expect(await codeOf(fetch("https://base-rpc.publicnode.com", { method: "POST", body: write }))).toBe("rpc_method_not_allowed");
    expect(raw.calls).toHaveLength(1);
  });

  it("needs a token and sends nothing without one", async () => {
    const { raw, fetch } = setup(() => rawResponse(), null);
    expect(await codeOf(fetch("https://gamma-api.polymarket.com/markets"))).toBe("unauthorized");
    expect(raw.calls).toHaveLength(0);
    const empty = setup(() => rawResponse(), "");
    expect(await codeOf(empty.fetch("https://gamma-api.polymarket.com/markets"))).toBe("unauthorized");
  });

  it("turns the daemon's own errors into FetchError with the bridge code", async () => {
    const body = JSON.stringify({ error: { code: "venue_paused", message: "paused after repeated 429", retry_after_s: 30 } });
    const { fetch } = setup(() => rawResponse({ status: 503, body }));
    try {
      await fetch("https://external-api.kalshi.com/trade-api/v2/markets");
      expect.unreachable();
    } catch (error) {
      expect(isFetchError(error)).toBe(true);
      if (!isFetchError(error)) return;
      expect(error.code).toBe("bridge");
      expect(error.bridgeCode).toBe("venue_paused");
      expect(error.retryAfterMs).toBe(30_000);
      expect(error.service).toBe("kalshi");
      expect(adapterErrorOfFetch(error)).toBe("VENUE_PAUSED");
    }
  });

  it("maps scope, path and timeout errors from the daemon", async () => {
    const make = (status: number, code: string) => setup(() => rawResponse({ status, body: JSON.stringify({ error: { code, message: "x" } }) })).fetch("https://gamma-api.polymarket.com/markets");
    expect(await codeOf(make(403, "scope_denied"))).toBe("bridge");
    await make(504, "upstream_timeout").catch((error: unknown) => expect(adapterErrorOfFetch(error)).toBe("TIMEOUT"));
    await make(403, "venue_disabled").catch((error: unknown) => expect(adapterErrorOfFetch(error)).toBe("VENUE_PAUSED"));
  });

  it("rejects an answer that is not the contract's envelope", async () => {
    const cases: Array<[string, string]> = [
      ["not json", "<html>"],
      ["wrong service", envelope("manifold", 200, {})],
      ["missing fields", JSON.stringify({ service: "polymarket_gamma", body: {} })],
      ["extra field", JSON.stringify({ ...JSON.parse(envelope("polymarket_gamma", 200, {})), extra: 1 })],
      ["bad timestamp", JSON.stringify({ ...JSON.parse(envelope("polymarket_gamma", 200, {})), fetched_at: "yesterday" })],
    ];
    for (const [name, body] of cases) {
      const { fetch } = setup(() => rawResponse({ body }));
      expect(await codeOf(fetch("https://gamma-api.polymarket.com/markets")), name).toBe("bad_envelope");
    }
    const { fetch } = setup(() => rawResponse({ status: 500, body: '{"oops":true}' }));
    expect(await codeOf(fetch("https://gamma-api.polymarket.com/markets"))).toBe("bad_envelope");
  });

  it("never follows a redirect from the daemon", async () => {
    const { fetch } = setup(() => rawResponse({ status: 302, headers: { location: "https://evil.example/" } }));
    expect(await codeOf(fetch("https://gamma-api.polymarket.com/markets"))).toBe("redirect");
  });

  it("times out", async () => {
    const t = new FakeTimers();
    const raw = new FakeRaw(() => new Promise(() => undefined));
    const fetch = createCockpitFetch({ rawFetch: raw.fetch, timers: t, getToken: () => TOKEN, timeoutMs: 2000 });
    const settled = codeOf(fetch("https://gamma-api.polymarket.com/markets"));
    t.advance(2000);
    expect(await settled).toBe("timeout");
  });

  it("refuses a URL outside the closed list without sending anything", async () => {
    const { raw, fetch } = setup(() => rawResponse());
    expect(await codeOf(fetch("https://evil.example/x"))).toBe("origin_not_allowed");
    expect(raw.calls).toHaveLength(0);
  });
});

describe("createAppFetch picks the port for the build", () => {
  it("cockpit mode goes through /ui/read; standalone mode goes direct and refuses daemon-only hosts", async () => {
    const timers = new FakeTimers();
    const cockpitRaw = new FakeRaw(() => rawResponse({ body: envelope("xo_orderbook", 200, { bids: [] }) }));
    const cockpit = createAppFetch({ mode: "cockpit", rawFetch: cockpitRaw.fetch, timers, getToken: () => TOKEN });
    await cockpit("https://orderbooks.xo.market/book?token_id=1");
    expect(cockpitRaw.calls[0]?.url).toBe("/ui/read/xo_orderbook/book?token_id=1");

    const directRaw = new FakeRaw(() => rawResponse({ body: "{}" }));
    const standalone = createAppFetch({ mode: "standalone", rawFetch: directRaw.fetch, timers, getToken: () => null });
    expect(await codeOf(standalone("https://orderbooks.xo.market/book?token_id=1"))).toBe("needs_cockpit");
    await standalone("https://api-mainnet.xo.market/api/markets");
    expect(directRaw.calls[0]?.url).toBe("https://api-mainnet.xo.market/api/markets");
  });
});
