import { afterEach, describe, expect, it } from "vitest";

import { createAdapterDeps, createBrowserEnv } from "./env";
import { FakeRaw, FakeTimers, rawResponse } from "./fakes";
import { isFetchError } from "./fetch";
import { isHidden } from "./cache";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("createBrowserEnv", () => {
  it("reads the globals lazily at call time", async () => {
    const env = createBrowserEnv();
    const seen: string[] = [];
    globalThis.fetch = (async (input: unknown) => {
      seen.push(String(input));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const controller = new AbortController();
    const response = await env.rawFetch("https://api.manifold.markets/v0/markets", {
      method: "GET",
      headers: {},
      signal: controller.signal,
      credentials: "omit",
      redirect: "manual",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      mode: "cors",
    });
    expect(response.status).toBe(200);
    expect(seen).toEqual(["https://api.manifold.markets/v0/markets"]);
    expect(Math.abs(env.nowMs() - Date.now())).toBeLessThan(1000);
    const r = env.random();
    expect(r >= 0 && r < 1).toBe(true);
  });

  it("sleeps and cancels with real timers", async () => {
    const env = createBrowserEnv();
    const started = Date.now();
    await env.sleep(15);
    expect(Date.now() - started).toBeGreaterThanOrEqual(10);
    let fired = false;
    const handle = env.timers.setTimeout(() => {
      fired = true;
    }, 5);
    env.timers.clearTimeout(handle);
    await env.sleep(20);
    expect(fired).toBe(false);
  });
});

describe("createAdapterDeps", () => {
  function envWith(raw: FakeRaw, timers: FakeTimers) {
    return { rawFetch: raw.fetch, timers, nowMs: timers.clock, sleep: timers.sleep, random: () => 0.5 };
  }

  it("standalone: direct, guarded, with the injected clock", async () => {
    const timers = new FakeTimers(5000);
    const raw = new FakeRaw(() => rawResponse({ body: '{"x":1}' }));
    const deps = createAdapterDeps({ mode: "standalone", env: envWith(raw, timers) });
    expect(deps.nowMs()).toBe(5000);
    const response = await deps.fetch("https://api.manifold.markets/v0/markets");
    expect(await response.json()).toEqual({ x: 1 });
    expect(raw.calls[0]?.url).toBe("https://api.manifold.markets/v0/markets");
    // A daemon-only host never leaves the page in this build.
    await expect(deps.fetch("https://orderbooks.xo.market/book?token_id=1")).rejects.toSatisfy((error: unknown) => isFetchError(error) && error.code === "needs_cockpit");
    expect(raw.calls).toHaveLength(1);
  });

  it("cockpit: goes through the daemon with the current token, and the guard pauses the host after a 403", async () => {
    const timers = new FakeTimers();
    let token: string | null = null;
    const envelope = (status: number) => JSON.stringify({ service: "kalshi", upstream_status: status, fetched_at: "2026-10-19T09:30:05Z", fetched_at_ms: 1, bytes: 2, retry_after_s: null, body: {} });
    let status = 200;
    const raw = new FakeRaw(() => rawResponse({ body: envelope(status) }));
    const deps = createAdapterDeps({ mode: "cockpit", env: envWith(raw, timers), getToken: () => token });
    await expect(deps.fetch("https://external-api.kalshi.com/trade-api/v2/exchange/status")).rejects.toSatisfy((error: unknown) => isFetchError(error) && error.code === "unauthorized");
    token = `cku_${"B".repeat(43)}`;
    status = 403;
    expect((await deps.fetch("https://external-api.kalshi.com/trade-api/v2/exchange/status")).status).toBe(403);
    expect(raw.calls[raw.calls.length - 1]?.url).toBe("/ui/read/kalshi/trade-api/v2/exchange/status");
    await expect(deps.fetch("https://external-api.kalshi.com/trade-api/v2/exchange/status")).rejects.toSatisfy((error: unknown) => isFetchError(error) && error.code === "paused");
    expect(deps.guarded.pauses.check("external-api.kalshi.com", timers.now).paused).toBe(true);
  });
});

describe("isHidden", () => {
  it("is true only for an explicit hidden state", () => {
    expect(isHidden({ visibilityState: "hidden" })).toBe(true);
    expect(isHidden({ visibilityState: "visible" })).toBe(false);
    expect(isHidden({})).toBe(false);
    expect(isHidden(undefined)).toBe(false);
  });
});
