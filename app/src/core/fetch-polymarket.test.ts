import { describe, expect, it } from "vitest";

import { createPolymarketAdapter } from "@sdk/venues/polymarket";
import { harness } from "@sdk/venues/polymarket/fixtures/harness";
import { recorded, SENATE_YES } from "@sdk/venues/polymarket/fixtures/load";

import { createGuardedFetch } from "./fetch";

// The Polymarket reader (sdk/venues/polymarket) on top of core's guarded fetch: the R9 pause is core's, the reader
// must report it and must not work around it. It lives in the app because the guarded fetch is the app's.

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

function setup(handler: (url: string) => { status: number; body?: unknown; headers?: Record<string, string> }) {
  const inner = harness((url) => handler(url));
  const guarded = createGuardedFetch({ inner: inner.deps.fetch, nowMs: inner.deps.nowMs, sleep: async () => {} });
  return { inner, adapter: createPolymarketAdapter({ fetch: guarded, nowMs: inner.deps.nowMs }), clock: inner.clock };
}

describe("adapter over the guarded fetch (R9, R10)", () => {
  it("a 403 pauses that host: the next call is VENUE_PAUSED and makes no request; other hosts still work", async () => {
    const { inner, adapter, clock } = setup((url) => {
      if (url.startsWith(`${CLOB}/book`)) return { status: 403 };
      return { status: 200, body: { markets: [], next_cursor: null } };
    });
    const first = await adapter.getBooks([{ venue: "polymarket", tokenId: SENATE_YES }], { deadlineMs: clock.now + 60_000 });
    expect(first).toEqual([{ ok: false, error: "VENUE_PAUSED" }]);
    const requestsAfterFirst = inner.calls.length;
    const second = await adapter.getBooks([{ venue: "polymarket", tokenId: SENATE_YES }], { deadlineMs: clock.now + 60_000 });
    expect(second).toEqual([{ ok: false, error: "VENUE_PAUSED" }]);
    expect(inner.calls.length).toBe(requestsAfterFirst);
    // Gamma is another host and is not paused.
    await expect(adapter.listMarkets({})).resolves.toEqual({ items: [], next: null });
    // Ten minutes later the pause is over and the book is asked for again (and refused again).
    clock.now += 10 * 60 * 1000 + 1;
    await adapter.getBooks([{ venue: "polymarket", tokenId: SENATE_YES }], { deadlineMs: clock.now + 60_000 });
    expect(inner.calls.length).toBe(requestsAfterFirst + 2);
  });

  it("three 429 answers in a row pause the host and the error carries how long to wait", async () => {
    const { inner, adapter } = setup(() => ({ status: 429 }));
    const codes: string[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await adapter.listMarkets({});
      } catch (error) {
        codes.push((error as { code: string }).code);
      }
    }
    expect(codes).toEqual(["RATE_LIMITED", "RATE_LIMITED", "RATE_LIMITED", "VENUE_PAUSED"]);
    expect(inner.calls).toHaveLength(3);
  });

  it("a healthy answer after a rate limit clears the strike", async () => {
    let calls = 0;
    const { adapter } = setup(() => {
      calls += 1;
      return calls === 1 ? { status: 429 } : { status: 200, body: { markets: [], next_cursor: null } };
    });
    await expect(adapter.listMarkets({})).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(adapter.listMarkets({})).resolves.toEqual({ items: [], next: null });
  });

  it("serves the recorded book through the guard unchanged", async () => {
    const { adapter, clock } = setup(() => ({ status: 200, body: recorded.senateBook() }));
    const results = await adapter.getBooks([{ venue: "polymarket", tokenId: SENATE_YES }], { deadlineMs: clock.now + 60_000 });
    expect(results[0]?.ok).toBe(true);
    expect(GAMMA).toContain("polymarket");
  });
});
