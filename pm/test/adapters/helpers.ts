// Test helpers for pm/adapters: a strict fetch stub (an unmatched request throws, so a test can
// never pass through an unexpected call), fixture loaders and fast transport options. Not a test
// file itself (the pm gate globs *.test.ts).

import { existsSync, readFileSync } from "node:fs";

import type { FetchLike } from "../../../src/xo/http.js";
import type { TransportOptions } from "../../adapters/transport.js";

export const NOW = Date.parse("2026-10-20T12:00:00Z");
export const nowMs = (): number => NOW;

export function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

export interface Call {
  readonly url: URL;
  readonly init: RequestInit;
}

export interface Route {
  readonly host: string;
  readonly path: string;
  // Every listed query parameter must be present with this exact value (first occurrence).
  readonly query?: Readonly<Record<string, string>>;
  // Optional extra predicate on the whole call.
  readonly when?: (call: Call) => boolean;
  readonly reply: (call: Call) => Response | Promise<Response>;
}

export function route(host: string, path: string, body: unknown, extra: { status?: number; query?: Record<string, string>; when?: (c: Call) => boolean } = {}): Route {
  return {
    host,
    path,
    ...(extra.query === undefined ? {} : { query: extra.query }),
    ...(extra.when === undefined ? {} : { when: extra.when }),
    reply: () => jsonResponse(body, { status: extra.status ?? 200 }),
  };
}

export function stubFetch(routes: readonly Route[]): { readonly fetchImpl: FetchLike; readonly calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input);
    const call: Call = { url, init };
    calls.push(call);
    const hit = routes.find(
      (r) =>
        r.host === url.hostname &&
        r.path === url.pathname &&
        Object.entries(r.query ?? {}).every(([key, value]) => url.searchParams.get(key) === value) &&
        (r.when === undefined || r.when(call)),
    );
    if (hit === undefined) throw new Error(`stub: no route for ${url.hostname}${url.pathname}${url.search}`);
    return hit.reply(call);
  };
  return { fetchImpl, calls };
}

// No throttle delay and no real sleeping, so retries finish instantly.
export function fast(fetchImpl: FetchLike, extra: Partial<TransportOptions> = {}): TransportOptions {
  return { fetchImpl, minIntervalMs: 0, sleep: async () => undefined, deadlineMs: 20_000, ...extra };
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

type Obj = Record<string, unknown>;

export function xoFixture(name: string): Obj {
  return JSON.parse(readFileSync(new URL(`../../../sdk/venues/xo/fixtures/${name}`, import.meta.url), "utf8")) as Obj;
}

// Real captures under docs/research/fixtures (live GET responses; nothing in them is hand-written). Returns null when
// the file is absent, and a test suite that is built on one skips instead of failing on a checkout without the
// research notes. polymarket.test.ts takes its market, CLOB record and book from here, and an override of one or
// two fields of a capture is the only way that suite makes another state.
export function researchFixture(venue: "polymarket" | "kalshi", name: string): unknown | null {
  const url = new URL(`../../../docs/research/fixtures/${venue}/${name}`, import.meta.url);
  return existsSync(url) ? (JSON.parse(readFileSync(url, "utf8")) as unknown) : null;
}

export function patch(base: unknown, ...edits: Array<[ReadonlyArray<string | number>, unknown]>): Obj {
  const copy = structuredClone(base) as Obj;
  for (const [path, value] of edits) {
    let cursor = copy;
    for (const key of path.slice(0, -1)) cursor = cursor[String(key)] as Obj;
    const last = String(path[path.length - 1]);
    if (value === undefined) delete cursor[last];
    else cursor[last] = value;
  }
  return copy;
}
