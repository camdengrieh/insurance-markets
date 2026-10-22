// A fake venue for each read state (docs/sdk-and-api-design.md section 6, "Tests"): test support only, imported by
// tests and never by a reader. Pure code with no Node import, so it may sit in sdk/ under the boundary check.
//
//   ok            answers each request from the test's routes (a recorded venue answer), 404 for anything else;
//   throttled     answers every request 429 with a Retry-After;
//   blocked_403   answers every request 403 with an HTML error page;
//   blocked_page  answers every request 200 with an HTML page where JSON was expected (a bot wall or challenge page);
//   chain_only    must never be asked: any request fails the test.
//
// The pages below are minimal stand-ins written for these tests: they are not a recording of any venue's page, and no
// test reads their words, only that they are HTML.

import type { FetchLike, FetchResponseLike, VenueId } from "../../model.js";
import { createStateGuardedFetch, VenueStateTracker } from "../state.js";

export const FAKE_VENUE_STATES = ["ok", "throttled", "blocked_403", "blocked_page", "chain_only"] as const;
export type FakeVenueState = (typeof FAKE_VENUE_STATES)[number];

export interface FakeAnswer {
  readonly status?: number;
  // Sent as the body text: JSON for a data answer.
  readonly body: string;
  readonly contentType?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

// An exact URL, or a function of it, to the answer the venue gives when it is ok. null or undefined: 404.
export type FakeRoutes = Readonly<Record<string, FakeAnswer>> | ((url: URL) => FakeAnswer | null | undefined);

export const FAKE_RETRY_AFTER_S = 30;
export const FAKE_FORBIDDEN_PAGE = "<!DOCTYPE html><html><head><title>403</title></head><body><p>Forbidden (test page)</p></body></html>";
export const FAKE_BLOCK_PAGE = "<!DOCTYPE html><html><head><title>Checking</title></head><body><p>Challenge (test page)</p></body></html>";
export const CHAIN_ONLY_REASON = "this test declares its API unused.";

export function json(body: unknown, status = 200): FakeAnswer {
  return { status, body: JSON.stringify(body), contentType: "application/json" };
}

export function fakeResponse(answer: FakeAnswer): FetchResponseLike {
  const status = answer.status ?? 200;
  const headers = new Map<string, string>(Object.entries(answer.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
  if (answer.contentType !== undefined) headers.set("content-type", answer.contentType);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    json: async () => JSON.parse(answer.body) as unknown,
    text: async () => answer.body,
  };
}

function answerFor(state: FakeVenueState, routes: FakeRoutes, url: string, retryAfterS: number): FakeAnswer {
  switch (state) {
    case "ok": {
      const answer = typeof routes === "function" ? routes(new URL(url)) : routes[url];
      return answer ?? json({ error: "not found" }, 404);
    }
    case "throttled":
      return { status: 429, body: JSON.stringify({ error: "too many requests" }), contentType: "application/json", headers: { "retry-after": String(retryAfterS) } };
    case "blocked_403":
      return { status: 403, body: FAKE_FORBIDDEN_PAGE, contentType: "text/html; charset=utf-8" };
    case "blocked_page":
      return { status: 200, body: FAKE_BLOCK_PAGE, contentType: "text/html; charset=utf-8" };
    case "chain_only":
      throw new Error(`a chain-only venue's API was asked: ${url}`);
  }
}

export interface FakeVenue {
  readonly state: FakeVenueState;
  // The venue itself, unguarded: what a host's transport would receive.
  readonly raw: FetchLike;
  // The same behind the shared rule (createStateGuardedFetch): what a reader is given.
  readonly fetch: FetchLike;
  readonly tracker: VenueStateTracker;
  // Every URL the venue was asked, in order (a refused-before-sending request is not here).
  readonly calls: string[];
}

export interface FakeVenueOptions {
  readonly venue: VenueId;
  readonly nowMs: () => number;
  readonly retryAfterS?: number;
  // A tracker shared with other fakes (one host's view of several venues).
  readonly tracker?: VenueStateTracker;
}

export function fakeVenue(state: FakeVenueState, routes: FakeRoutes, options: FakeVenueOptions): FakeVenue {
  const calls: string[] = [];
  const retryAfterS = options.retryAfterS ?? FAKE_RETRY_AFTER_S;
  const tracker = options.tracker ?? new VenueStateTracker();
  if (state === "chain_only") tracker.declareChainOnly(options.venue, CHAIN_ONLY_REASON);
  const raw: FetchLike = async (input) => {
    calls.push(input);
    return fakeResponse(answerFor(state, routes, input, retryAfterS));
  };
  return { state, raw, fetch: createStateGuardedFetch({ inner: raw, tracker, nowMs: options.nowMs }), tracker, calls };
}
