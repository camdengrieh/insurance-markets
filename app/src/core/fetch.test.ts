import { describe, expect, it } from "vitest";

import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS } from "../../headers.config";
import { HostBudgets, SERVICE_BUDGETS, VenuePauses } from "./budget";
import { FakeRaw, FakeTimers, hang, rawResponse } from "./fakes";
import {
  FetchError,
  adapterErrorOfFetch,
  adapterErrorOfStatus,
  canonicalUrl,
  createDirectFetch,
  createGuardedFetch,
  isFetchError,
  isNeedsCockpit,
  originOfService,
  resolveUpstream,
  type FetchErrorCode,
} from "./fetch";
import type { FetchLike } from "./ports";

async function codeOf(promise: Promise<unknown>): Promise<FetchErrorCode | "no error"> {
  try {
    await promise;
    return "no error";
  } catch (error) {
    if (isFetchError(error)) return error.code;
    throw error;
  }
}

describe("resolveUpstream", () => {
  it("maps every listed origin to its service and transport", () => {
    for (const entry of BROWSER_DIRECT_ORIGINS) {
      const target = resolveUpstream(`${entry.origin}/some/path?a=1&b=2`);
      expect(target.service).toBe(entry.service);
      expect(target.transport).toBe("browser_direct");
      expect(target.path).toBe("/some/path");
      expect(target.query).toBe("a=1&b=2");
    }
    for (const entry of DAEMON_ONLY_ORIGINS) {
      if (entry.service === null) {
        expect(() => resolveUpstream(`${entry.origin}/x`)).toThrow(FetchError);
        continue;
      }
      expect(resolveUpstream(`${entry.origin}/x`).transport).toBe("daemon_only");
    }
    expect(originOfService("xo_data")).toBe("https://api-mainnet.xo.market");
  });

  it("refuses everything outside the closed list", async () => {
    const cases: Array<[string, FetchErrorCode]> = [
      ["http://api-mainnet.xo.market/api/markets", "unsafe_url"],
      ["https://api-mainnet.xo.market:8443/api", "unsafe_url"],
      ["https://user:pass@api-mainnet.xo.market/api", "unsafe_url"],
      ["https://api-mainnet.xo.market/api#frag", "unsafe_url"],
      ["https://api-mainnet.xo.market.evil.example/api", "origin_not_allowed"],
      ["https://evil.example/api", "origin_not_allowed"],
      ["https://api.paybox.sh/mcp", "origin_not_allowed"],
      ["https://app.paybox.sh/", "origin_not_allowed"],
      ["https://api.trueo.com/health", "origin_not_allowed"],
      ["https://mainnet-bundler.xo.market/", "origin_not_allowed"],
      ["ftp://api-mainnet.xo.market/", "unsafe_url"],
      ["//api-mainnet.xo.market/api", "unsafe_url"],
      ["/ui/read/xo_data/api", "unsafe_url"],
      ["not a url", "unsafe_url"],
      ["https://api-mainnet.xo.market/a/%2e%2e%2fb", "unsafe_url"],
      ["https://api-mainnet.xo.market/a%2fb", "unsafe_url"],
      ["https://api-mainnet.xo.market/api?x=a b[]", "unsafe_url"],
    ];
    for (const [url, code] of cases) {
      expect(await codeOf(Promise.resolve().then(() => resolveUpstream(url))), url).toBe(code);
    }
  });

  it("normalises dot segments before the safety check, so a traversal cannot name another path", () => {
    expect(resolveUpstream("https://api-mainnet.xo.market/a/../b").path).toBe("/b");
    expect(resolveUpstream("https://api-mainnet.xo.market/a/%2e%2e/b").path).toBe("/b");
    expect(canonicalUrl(resolveUpstream("https://api-mainnet.xo.market/a/%2e%2e/b?x=1"))).toBe("https://api-mainnet.xo.market/b?x=1");
  });
});

describe("createDirectFetch", () => {
  const timers = new FakeTimers();
  function direct(raw: FakeRaw, extra: { maxBytes?: number; timeoutMs?: number } = {}): FetchLike {
    return createDirectFetch({ rawFetch: raw.fetch, timers, ...extra });
  }

  it("sends a private, credential-free request with only safe headers", async () => {
    const raw = new FakeRaw(() => rawResponse({ body: '{"ok":true}', headers: { "content-type": "application/json" } }));
    const response = await direct(raw)("https://gamma-api.polymarket.com/markets?limit=10", {
      headers: { "User-Agent": "insurance-markets-xo-plugin/0.2", Origin: "https://evil.example", Referer: "https://x.example", Cookie: "a=b", Authorization: "Bearer x", "X-Custom": "1", Accept: "application/json" },
    });
    expect(await response.json()).toEqual({ ok: true });
    const call = raw.calls[0];
    expect(call?.url).toBe("https://gamma-api.polymarket.com/markets?limit=10");
    expect(call?.init.headers).toEqual({ accept: "application/json" });
    expect(call?.init.method).toBe("GET");
    expect(call?.init.credentials).toBe("omit");
    expect(call?.init.redirect).toBe("manual");
    expect(call?.init.referrerPolicy).toBe("no-referrer");
    expect(call?.init.mode).toBe("cors");
    expect(call?.init.body).toBeUndefined();
  });

  // FS-2 / A5: licence-restricted data is "memory only"; the browser's disk HTTP cache is not that.
  it("never lets the browser's HTTP cache keep an upstream answer (no-store for every service)", async () => {
    const raw = new FakeRaw();
    for (const url of [
      "https://quotient-api-gateway.onrender.com/api/v1/signals",
      "https://api.gemini.com/v1/prediction-markets/events",
      "https://api.novig.com/nbx/v1/markets",
      "https://gamma-api.polymarket.com/markets",
    ]) {
      await direct(raw)(url);
    }
    expect(raw.calls).toHaveLength(4);
    for (const call of raw.calls) expect(call.init.cache, call.url).toBe("no-store");
  });

  it("passes the user-pasted Quotient key to Quotient only", async () => {
    const raw = new FakeRaw();
    await direct(raw)("https://quotient-api-gateway.onrender.com/api/v1/signals", { headers: { "X-Quotient-Api-Key": "qt_test" } });
    await direct(raw)("https://gamma-api.polymarket.com/markets", { headers: { "X-Quotient-Api-Key": "qt_test" } });
    expect(raw.calls[0]?.init.headers).toEqual({ accept: "application/json", "x-quotient-api-key": "qt_test" });
    expect(raw.calls[1]?.init.headers).toEqual({ accept: "application/json" });
  });

  it("drops a header value with a line break", async () => {
    const raw = new FakeRaw();
    await direct(raw)("https://quotient-api-gateway.onrender.com/x", { headers: { "X-Quotient-Api-Key": "a\r\nX-Evil: 1" } });
    expect(raw.calls[0]?.init.headers).toEqual({ accept: "application/json" });
  });

  it("refuses a daemon-only host with needs_cockpit and sends nothing (M0-2)", async () => {
    const raw = new FakeRaw();
    for (const url of ["https://orderbooks.xo.market/book?token_id=1", "https://api.limitless.exchange/markets/active", "https://external-api.kalshi.com/trade-api/v2/exchange/status"]) {
      const promise = direct(raw)(url);
      expect(await codeOf(promise), url).toBe("needs_cockpit");
      await promise.catch((error: unknown) => expect(isNeedsCockpit(error)).toBe(true));
    }
    expect(raw.calls).toHaveLength(0);
  });

  it("times out when the upstream never answers", async () => {
    const t = new FakeTimers();
    const raw = new FakeRaw(() => hang());
    const promise = createDirectFetch({ rawFetch: raw.fetch, timers: t, timeoutMs: 5000 })("https://api.manifold.markets/v0/markets");
    const settled = codeOf(promise);
    t.advance(4999);
    t.advance(1);
    expect(await settled).toBe("timeout");
    expect(t.pending.size).toBe(0);
  });

  it("times out while reading a body that stalls", async () => {
    const t = new FakeTimers();
    const stalled = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { getReader: () => ({ read: () => new Promise<{ done: boolean }>(() => undefined), cancel: async () => undefined }) },
      text: async () => "",
    };
    const raw = new FakeRaw(() => stalled);
    const settled = codeOf(createDirectFetch({ rawFetch: raw.fetch, timers: t, timeoutMs: 1000 })("https://api.manifold.markets/v0/markets"));
    await Promise.resolve();
    await Promise.resolve();
    t.advance(1000);
    expect(await settled).toBe("timeout");
  });

  it("reports a caller cancellation as aborted, not as a timeout", async () => {
    const controller = new AbortController();
    const raw = new FakeRaw(() => hang());
    const settled = codeOf(direct(raw)("https://api.manifold.markets/v0/markets", { signal: controller.signal }));
    controller.abort();
    expect(await settled).toBe("aborted");
  });

  it("reports a transport failure as network", async () => {
    const raw = new FakeRaw(() => Promise.reject(new TypeError("fetch failed")));
    expect(await codeOf(direct(raw)("https://api.manifold.markets/v0/markets"))).toBe("network");
  });

  it("never follows a redirect", async () => {
    for (const response of [rawResponse({ status: 302, headers: { location: "https://evil.example/" } }), rawResponse({ status: 0, type: "opaqueredirect" })]) {
      const raw = new FakeRaw(() => response);
      expect(await codeOf(direct(raw)("https://api.manifold.markets/v0/markets"))).toBe("redirect");
    }
  });

  it("caps the response by declared length, by streamed bytes and without a stream", async () => {
    expect(await codeOf(direct(new FakeRaw(() => rawResponse({ headers: { "content-length": "5000" }, body: "{}" })), { maxBytes: 1000 })("https://api.manifold.markets/v0/m"))).toBe("too_large");
    const big = new TextEncoder().encode("x".repeat(600));
    const streamed = new FakeRaw(() => rawResponse({ chunks: [big, big, big] }));
    expect(await codeOf(direct(streamed, { maxBytes: 1000 })("https://api.manifold.markets/v0/m"))).toBe("too_large");
    const plain = new FakeRaw(() => rawResponse({ noStream: true, body: "x".repeat(2000) }));
    expect(await codeOf(direct(plain, { maxBytes: 1000 })("https://api.manifold.markets/v0/m"))).toBe("too_large");
    const ok = new FakeRaw(() => rawResponse({ chunks: [big, big] }));
    expect((await direct(ok, { maxBytes: 1200 })("https://api.manifold.markets/v0/m")).status).toBe(200);
  });

  it("decodes a body split across chunks, including a multi-byte character", async () => {
    const bytes = new TextEncoder().encode('{"t":"héllo"}');
    const raw = new FakeRaw(() => rawResponse({ chunks: [bytes.slice(0, 8), bytes.slice(8)] }));
    const response = await direct(raw)("https://api.manifold.markets/v0/m");
    expect(await response.json()).toEqual({ t: "héllo" });
    expect(await response.text()).toBe('{"t":"héllo"}');
  });

  it("returns a non-2xx answer to the adapter and reports a non-JSON body only when it is parsed", async () => {
    const raw = new FakeRaw(() => rawResponse({ status: 500, body: "<html>oops</html>" }));
    const response = await direct(raw)("https://api.manifold.markets/v0/m");
    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
    expect(await codeOf(response.json())).toBe("not_json");
  });

  describe("POST is allowed only for reads", () => {
    const rpc = (method: string): string => JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] });

    it("allows read-only JSON-RPC to an RPC host, single and batched", async () => {
      const raw = new FakeRaw();
      await direct(raw)("https://base-rpc.publicnode.com", { method: "POST", body: rpc("eth_call") });
      await direct(raw)("https://rpc-mainnet-2.xo.market/", { method: "POST", body: `[${rpc("eth_getCode")},${rpc("eth_blockNumber")}]` });
      expect(raw.calls).toHaveLength(2);
      expect(raw.calls[0]?.init.method).toBe("POST");
      expect(raw.calls[0]?.init.headers).toEqual({ accept: "application/json", "content-type": "application/json" });
    });

    it("refuses every JSON-RPC method that sends, signs or changes state", async () => {
      const raw = new FakeRaw();
      for (const method of ["eth_sendRawTransaction", "eth_sendUserOperation", "eth_sendTransaction", "eth_sign", "personal_sign", "debug_traceCall", "anvil_setBalance", "eth_subscribe"]) {
        expect(await codeOf(direct(raw)("https://base-rpc.publicnode.com", { method: "POST", body: rpc(method) })), method).toBe("rpc_method_not_allowed");
      }
      expect(await codeOf(direct(raw)("https://base-rpc.publicnode.com", { method: "POST", body: `[${rpc("eth_call")},${rpc("eth_sendRawTransaction")}]` }))).toBe("rpc_method_not_allowed");
      expect(await codeOf(direct(raw)("https://base-rpc.publicnode.com", { method: "POST", body: "[]" }))).toBe("rpc_method_not_allowed");
      expect(await codeOf(direct(raw)("https://base-rpc.publicnode.com", { method: "POST", body: '{"jsonrpc":"2.0","id":1}' }))).toBe("rpc_method_not_allowed");
      expect(raw.calls).toHaveLength(0);
    });

    it("allows Hyperliquid /info and refuses its exchange route", async () => {
      const raw = new FakeRaw();
      await direct(raw)("https://api.hyperliquid.xyz/info", { method: "POST", body: '{"type":"meta"}' });
      expect(await codeOf(direct(raw)("https://api.hyperliquid.xyz/exchange", { method: "POST", body: '{"type":"order"}' }))).toBe("method_not_allowed");
      expect(await codeOf(direct(raw)("https://api.hyperliquid.xyz/info", { method: "POST", body: "[]" }))).toBe("method_not_allowed");
      expect(await codeOf(direct(raw)("https://api.hyperliquid.xyz/info", { method: "POST", body: '{"type":5}' }))).toBe("method_not_allowed");
      expect(raw.calls).toHaveLength(1);
    });

    it("allows the Polymarket CLOB batch-books read and refuses a POST to anything else", async () => {
      const raw = new FakeRaw();
      await direct(raw)("https://clob.polymarket.com/books", { method: "POST", body: '[{"token_id":"1"}]' });
      expect(await codeOf(direct(raw)("https://clob.polymarket.com/order", { method: "POST", body: "{}" }))).toBe("method_not_allowed");
      expect(await codeOf(direct(raw)("https://gamma-api.polymarket.com/markets", { method: "POST", body: "{}" }))).toBe("method_not_allowed");
      expect(await codeOf(direct(raw)("https://api-mainnet.xo.market/api", { method: "POST", body: "{}" }))).toBe("method_not_allowed");
      expect(raw.calls).toHaveLength(1);
    });

    it("refuses a POST without a JSON body or with an oversized one", async () => {
      const raw = new FakeRaw();
      expect(await codeOf(direct(raw)("https://base-rpc.publicnode.com", { method: "POST" }))).toBe("method_not_allowed");
      expect(await codeOf(direct(raw)("https://base-rpc.publicnode.com", { method: "POST", body: "not json" }))).toBe("method_not_allowed");
      expect(await codeOf(direct(raw)("https://clob.polymarket.com/books", { method: "POST", body: `["${"x".repeat(300_000)}"]` }))).toBe("body_too_large");
      expect(raw.calls).toHaveLength(0);
    });
  });
});

describe("createGuardedFetch", () => {
  const XO_DATA = "https://api-mainnet.xo.market/api/markets";

  function setup(handler: () => ReturnType<FetchLike>, options: { budgets?: HostBudgets } = {}) {
    const timers = new FakeTimers();
    const calls: number[] = [];
    const inner: FetchLike = async (url, init) => {
      calls.push(timers.now);
      void url;
      void init;
      return handler();
    };
    const guarded = createGuardedFetch({ inner, nowMs: timers.clock, sleep: timers.sleep, ...(options.budgets === undefined ? {} : { budgets: options.budgets }) });
    return { timers, calls, guarded };
  }

  const ok = () => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}), text: async () => "{}" });
  const status = (code: number, headers: Record<string, string> = {}) => () =>
    Promise.resolve({ ok: false, status: code, headers: { get: (name: string) => headers[name.toLowerCase()] ?? null }, json: async () => ({}), text: async () => "{}" });

  // M0-6: a 100-search burst against one host.
  it("holds the per-host bucket under a 100-request burst (M0-6)", async () => {
    const { timers, calls, guarded } = setup(ok);
    const budget = SERVICE_BUDGETS.xo_data;
    const results = Array.from({ length: 100 }, () => guarded(XO_DATA).then(() => "sent" as const, (error: unknown) => (isFetchError(error) ? error.code : "other")));
    // Let the first reservations settle, then move the fake clock in 100 ms steps.
    for (let step = 0; step < 80; step += 1) {
      await Promise.resolve();
      timers.advance(100);
      await Promise.resolve();
    }
    const outcomes = await Promise.all(results);
    const sent = outcomes.filter((outcome) => outcome === "sent").length;
    const throttled = outcomes.filter((outcome) => outcome === "throttled").length;
    expect(sent + throttled).toBe(100);
    expect(sent).toBeGreaterThanOrEqual(budget.burst);
    expect(sent).toBeLessThanOrEqual(budget.burst + Math.ceil(budget.perSecond * 5) + 1);
    expect(calls).toHaveLength(sent);
    // At no moment has the host been sent more than burst + rate x elapsed.
    for (const [index, at] of calls.entries()) {
      expect(index + 1).toBeLessThanOrEqual(budget.burst + Math.ceil((budget.perSecond * at) / 1000) + 1);
    }
  });

  it("refuses a host outside the closed list before anything is sent", async () => {
    const { calls, guarded } = setup(ok);
    expect(await codeOf(guarded("https://evil.example/x"))).toBe("origin_not_allowed");
    expect(calls).toHaveLength(0);
  });

  it("pauses a host for ten minutes after any 403 and then resumes (R9)", async () => {
    let answer = status(403);
    const { timers, calls, guarded } = setup(() => answer());
    const first = await guarded(XO_DATA);
    expect(first.status).toBe(403);
    answer = ok;
    const blocked = guarded(XO_DATA);
    expect(await codeOf(blocked)).toBe("paused");
    await blocked.catch((error: unknown) => expect(error instanceof FetchError && error.retryAfterMs).toBeGreaterThan(0));
    expect(calls).toHaveLength(1);
    // Another host is unaffected.
    expect((await guarded("https://api.manifold.markets/v0/markets")).status).toBe(200);
    timers.advance(600_000);
    expect((await guarded(XO_DATA)).status).toBe(200);
  });

  it("pauses after three 429s and honours Retry-After", async () => {
    let answer = status(429);
    const { timers, calls, guarded } = setup(() => answer());
    await guarded(XO_DATA);
    timers.advance(2000);
    await guarded(XO_DATA);
    timers.advance(2000);
    await guarded(XO_DATA);
    expect(await codeOf(guarded(XO_DATA))).toBe("paused");
    expect(calls).toHaveLength(3);
    timers.advance(600_000);
    answer = status(429, { "retry-after": "30" });
    await guarded(XO_DATA);
    expect(await codeOf(guarded(XO_DATA))).toBe("paused");
    timers.advance(30_000);
    answer = ok;
    expect((await guarded(XO_DATA)).status).toBe(200);
  });

  it("a call that waited for a token does not send if the host was paused meanwhile", async () => {
    const timers = new FakeTimers();
    const budgets = new HostBudgets(timers.clock, { "api-mainnet.xo.market": { burst: 1, perSecond: 1 } });
    const pauses = new VenuePauses();
    const calls: string[] = [];
    const inner: FetchLike = async (url) => {
      calls.push(url);
      return status(403)();
    };
    const guarded = createGuardedFetch({ inner, nowMs: timers.clock, sleep: timers.sleep, budgets, pauses });
    const first = guarded(XO_DATA);
    const second = codeOf(guarded(XO_DATA));
    await first;
    timers.advance(1000);
    expect(await second).toBe("paused");
    expect(calls).toHaveLength(1);
  });

  it("a request that would wait longer than the limit is refused locally and is not counted as a 429", async () => {
    const timers = new FakeTimers();
    const budgets = new HostBudgets(timers.clock, { "api-mainnet.xo.market": { burst: 1, perSecond: 0.1 } });
    const pauses = new VenuePauses();
    const guarded = createGuardedFetch({ inner: async () => ok(), nowMs: timers.clock, sleep: timers.sleep, budgets, pauses, maxWaitMs: 1000 });
    await guarded(XO_DATA);
    const refused = guarded(XO_DATA);
    expect(await codeOf(refused)).toBe("throttled");
    expect(pauses.check("api-mainnet.xo.market", timers.now).paused).toBe(false);
  });
});

describe("error mapping", () => {
  it("maps fetch errors onto the closed adapter set", () => {
    const map = (code: FetchErrorCode, extra: { bridgeCode?: string } = {}) => adapterErrorOfFetch(new FetchError(code, "x", extra));
    expect(map("timeout")).toBe("TIMEOUT");
    expect(map("network")).toBe("TIMEOUT");
    expect(map("throttled")).toBe("RATE_LIMITED");
    expect(map("paused")).toBe("VENUE_PAUSED");
    expect(map("needs_cockpit")).toBe("NOT_SUPPORTED");
    expect(map("too_large")).toBe("SCHEMA_DRIFT");
    expect(map("not_json")).toBe("SCHEMA_DRIFT");
    expect(map("bridge", { bridgeCode: "venue_paused" })).toBe("VENUE_PAUSED");
    expect(map("bridge", { bridgeCode: "venue_disabled" })).toBe("VENUE_PAUSED");
    expect(map("bridge", { bridgeCode: "upstream_timeout" })).toBe("TIMEOUT");
    expect(map("bridge", { bridgeCode: "rate_limited" })).toBe("RATE_LIMITED");
    expect(map("bridge", { bridgeCode: "path_not_allowed" })).toBe("NOT_SUPPORTED");
    expect(adapterErrorOfFetch(new Error("x"))).toBeNull();
  });

  it("maps upstream statuses", () => {
    expect(adapterErrorOfStatus(404)).toBe("NOT_FOUND");
    expect(adapterErrorOfStatus(429)).toBe("RATE_LIMITED");
    expect(adapterErrorOfStatus(403)).toBe("VENUE_PAUSED");
    expect(adapterErrorOfStatus(503)).toBe("TIMEOUT");
    expect(adapterErrorOfStatus(418)).toBe("SCHEMA_DRIFT");
  });
});
