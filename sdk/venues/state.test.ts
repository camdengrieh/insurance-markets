import { describe, expect, it } from "vitest";

import type { FetchLike } from "../model.js";
import {
  createStateGuardedFetch,
  READ_OK,
  stateOfAdapterError,
  VENUE_PAUSE_MS,
  venueKeys,
  venueReadState,
  venueStateNext,
  venueStateReason,
  VenueStateTracker,
  worstState,
} from "./state.js";
import { adapterErrorOfFetch, FetchError, isBlockPage, MAX_RETRY_AFTER_MS } from "./transport.js";
import { fakeResponse, FAKE_BLOCK_PAGE, json } from "./testkit/index.js";

const HOST = "gamma-api.polymarket.com";
const AT = Date.parse("2026-10-22T12:03:00.000Z");

describe("the rule (R9, R10)", () => {
  it("blocks at once on a 403, for the full window, and says when", () => {
    const tracker = new VenueStateTracker();
    tracker.record(HOST, { status: 403, retryAfterMs: null }, AT);
    expect(tracker.state(HOST, AT + 1)).toEqual({ kind: "blocked", signal: "http_403", status: 403, atMs: AT, untilMs: AT + VENUE_PAUSE_MS });
    expect(tracker.check(HOST, AT + 1)).toEqual({ paused: true, untilMs: AT + VENUE_PAUSE_MS, reason: "forbidden", signal: "http_403" });
    expect(tracker.state(HOST, AT + VENUE_PAUSE_MS)).toEqual(READ_OK);
  });

  it("throttles on a 429 with Retry-After, and pauses on the third 429 in a row", () => {
    const tracker = new VenueStateTracker();
    tracker.record(HOST, { status: 429, retryAfterMs: 30_000 }, AT);
    expect(tracker.state(HOST, AT + 1)).toMatchObject({ kind: "throttled", signal: "retry_after", untilMs: AT + 30_000 });
    tracker.record(HOST, { status: 429, retryAfterMs: null }, AT + 1);
    tracker.record(HOST, { status: 429, retryAfterMs: null }, AT + 2);
    expect(tracker.state(HOST, AT + 3)).toMatchObject({ kind: "throttled", signal: "http_429_repeated", untilMs: AT + 2 + VENUE_PAUSE_MS });
  });

  it("a success between 429s clears the strikes; a 404 or a 500 does not", () => {
    const tracker = new VenueStateTracker();
    tracker.record(HOST, { status: 429, retryAfterMs: null }, 0);
    tracker.record(HOST, { status: 429, retryAfterMs: null }, 1);
    tracker.record(HOST, { status: 200, retryAfterMs: null }, 2);
    tracker.record(HOST, { status: 429, retryAfterMs: null }, 3);
    tracker.record(HOST, { status: 500, retryAfterMs: null }, 4);
    tracker.record(HOST, { status: 404, retryAfterMs: null }, 5);
    tracker.record(HOST, { status: 429, retryAfterMs: null }, 6);
    expect(tracker.check(HOST, 6).paused).toBe(false);
    tracker.record(HOST, { status: 429, retryAfterMs: null }, 7);
    expect(tracker.check(HOST, 8)).toMatchObject({ paused: true, reason: "rate_limited" });
  });

  it("blocks on the third 401 in a row, not the first", () => {
    const tracker = new VenueStateTracker();
    tracker.record(HOST, { status: 401, retryAfterMs: null }, 0);
    tracker.record(HOST, { status: 401, retryAfterMs: null }, 1);
    expect(tracker.state(HOST, 2).kind).toBe("ok");
    tracker.record(HOST, { status: 401, retryAfterMs: null }, 2);
    expect(tracker.state(HOST, 3)).toMatchObject({ kind: "blocked", signal: "http_401_repeated", status: 401 });
  });

  it("a web page served with 200 is a block, not drift", () => {
    const tracker = new VenueStateTracker();
    tracker.record(HOST, { status: 200, retryAfterMs: null, blockPage: true }, AT);
    expect(tracker.state(HOST, AT + 1)).toMatchObject({ kind: "blocked", signal: "block_page", status: 200 });
    expect(isBlockPage("text/html; charset=utf-8", "")).toBe(true);
    expect(isBlockPage(null, `﻿  ${FAKE_BLOCK_PAGE}`)).toBe(true);
    expect(isBlockPage("application/json", '{"html":"<html>"}')).toBe(false);
    expect(isBlockPage("text/plain", "OK")).toBe(false);
    expect(adapterErrorOfFetch(new FetchError("blocked", "x"))).toBe("VENUE_PAUSED");
    expect(adapterErrorOfFetch(new FetchError("not_json", "x"))).toBe("SCHEMA_DRIFT");
  });

  it("never shortens a pause, never turns a block into a throttle, and caps Retry-After at a day", () => {
    const tracker = new VenueStateTracker();
    tracker.record(HOST, { status: 429, retryAfterMs: 30_000 }, 0);
    tracker.record(HOST, { status: 403, retryAfterMs: null }, 10_000);
    tracker.record(HOST, { status: 429, retryAfterMs: 1000 }, 11_000);
    expect(tracker.check(HOST, 20_000)).toMatchObject({ paused: true, untilMs: 10_000 + VENUE_PAUSE_MS, reason: "forbidden" });
    tracker.record(HOST, { status: 429, retryAfterMs: 2 * VENUE_PAUSE_MS }, 12_000);
    expect(tracker.state(HOST, 20_000)).toMatchObject({ kind: "blocked", signal: "http_403", atMs: 10_000, untilMs: 12_000 + 2 * VENUE_PAUSE_MS });
    const other = new VenueStateTracker();
    other.record(HOST, { status: 429, retryAfterMs: MAX_RETRY_AFTER_MS * 40 }, 0);
    expect(other.check(HOST, 1)).toMatchObject({ untilMs: MAX_RETRY_AFTER_MS, reason: "retry_after" });
  });

  it("keys are per host, case-insensitive, and reset clears everything", () => {
    const tracker = new VenueStateTracker();
    tracker.record("Clob.Polymarket.com", { status: 403, retryAfterMs: null }, 0);
    expect(tracker.check("clob.polymarket.com", 1).paused).toBe(true);
    expect(tracker.check(HOST, 1).paused).toBe(false);
    tracker.reset();
    expect(tracker.check("clob.polymarket.com", 1).paused).toBe(false);
  });
});

describe("a venue over its hosts", () => {
  it("knows each venue's hosts and services from the origin registry; chain RPCs belong to no venue", () => {
    expect(venueKeys("polymarket").hosts).toEqual(expect.arrayContaining(["gamma-api.polymarket.com", "clob.polymarket.com", "data-api.polymarket.com"]));
    expect(venueKeys("polymarket").services).toEqual(expect.arrayContaining(["polymarket_gamma", "polymarket_clob", "polymarket_data"]));
    expect(venueKeys("polymarket").hosts).not.toContain("polygon-bor-rpc.publicnode.com");
  });

  it("is the worst of its hosts, and a declared chain_only wins", () => {
    const tracker = new VenueStateTracker();
    tracker.record("clob.polymarket.com", { status: 429, retryAfterMs: 5000 }, AT);
    expect(venueReadState(tracker, "polymarket", AT + 1).kind).toBe("throttled");
    tracker.record("gamma-api.polymarket.com", { status: 403, retryAfterMs: null }, AT);
    expect(venueReadState(tracker, "polymarket", AT + 1)).toMatchObject({ kind: "blocked", status: 403 });
    tracker.record("polymarket_gamma", { status: 403, retryAfterMs: null }, AT);
    expect(venueReadState(tracker, "polymarket", AT + 1, "service").kind).toBe("blocked");
    tracker.declareChainOnly("polymarket", "its API is not used here.");
    expect(venueReadState(tracker, "polymarket", AT + 1)).toEqual({ kind: "chain_only", reason: "its API is not used here." });
    expect(venueReadState(tracker, "xo", AT + 1)).toEqual(READ_OK);
  });

  it("worstState keeps the first time a block began", () => {
    const a = { kind: "blocked", signal: "http_403", status: 403, atMs: 10, untilMs: 100 } as const;
    const b = { kind: "blocked", signal: "block_page", status: 200, atMs: 50, untilMs: 200 } as const;
    expect(worstState([READ_OK, a, b])).toMatchObject({ signal: "block_page", atMs: 10, untilMs: 200 });
  });

  it("a reader's error code gives a state when no answer was seen", () => {
    expect(stateOfAdapterError("RATE_LIMITED", 5000, AT)).toEqual({ kind: "throttled", signal: "limited", status: null, atMs: AT, untilMs: AT + 5000 });
    expect(stateOfAdapterError("VENUE_PAUSED", null, AT)).toEqual({ kind: "blocked", signal: "refused", status: null, atMs: AT, untilMs: null });
    expect(stateOfAdapterError("SCHEMA_DRIFT", null, AT)).toEqual(READ_OK);
  });
});

describe("the stated reason", () => {
  it("names the venue, the time and the status", () => {
    expect(venueStateReason({ kind: "blocked", signal: "http_403", status: 403, atMs: AT, untilMs: AT + VENUE_PAUSE_MS }, "Polymarket", AT)).toBe("Polymarket blocked our reads at 2026-10-22 12:03 UTC: 403");
    expect(venueStateReason({ kind: "blocked", signal: "block_page", status: 200, atMs: AT, untilMs: null }, "Polymarket", AT)).toBe("Polymarket blocked our reads at 2026-10-22 12:03 UTC: it served a web page where data was expected (status 200)");
    expect(venueStateReason({ kind: "throttled", signal: "retry_after", status: 429, atMs: AT, untilMs: AT + 30_000 }, "XO Market", AT + 1000)).toBe("XO Market throttled our reads (429): retry after 29 s");
    expect(venueStateReason({ kind: "chain_only", reason: "its API needs a key." }, "Predict.fun", AT)).toBe("Predict.fun is read from the chain only: its API needs a key.");
    expect(venueStateReason(READ_OK, "XO Market", AT)).toBeNull();
    expect(venueStateNext({ kind: "blocked", signal: "http_403", status: 403, atMs: AT, untilMs: AT + VENUE_PAUSE_MS }, AT)).toBe("Nothing is retried around it; reads may be sent again after 2026-10-22 12:13 UTC.");
  });
});

describe("createStateGuardedFetch", () => {
  function counting(answer: Parameters<typeof fakeResponse>[0]): { fetch: FetchLike; calls: string[] } {
    const calls: string[] = [];
    return { calls, fetch: async (url) => (calls.push(url), fakeResponse(answer)) };
  }

  it("turns a 200 web page into a blocked FetchError and refuses the next request before sending", async () => {
    const inner = counting({ status: 200, body: FAKE_BLOCK_PAGE, contentType: "text/html" });
    const tracker = new VenueStateTracker();
    const fetch = createStateGuardedFetch({ inner: inner.fetch, tracker, nowMs: () => AT });
    await expect(fetch(`https://${HOST}/markets`)).rejects.toMatchObject({ code: "blocked", signal: "block_page" });
    await expect(fetch(`https://${HOST}/markets`)).rejects.toMatchObject({ code: "paused", signal: "block_page", retryAfterMs: VENUE_PAUSE_MS });
    expect(inner.calls).toHaveLength(1);
  });

  it("passes data through and lets the reader parse it", async () => {
    const inner = counting(json({ a: 1 }));
    const fetch = createStateGuardedFetch({ inner: inner.fetch, tracker: new VenueStateTracker(), nowMs: () => AT });
    const response = await fetch(`https://${HOST}/markets`);
    expect(await response.json()).toEqual({ a: 1 });
  });
});
