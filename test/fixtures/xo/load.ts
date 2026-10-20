import { readFileSync } from "node:fs";

import type { FetchLike, HttpOptions } from "../../../src/xo/http.js";

// Test helpers for the XO client: fixture loading and a strict fetch stub. A request that no
// route matches throws, so a test can never pass by accident through an unexpected call.

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), "utf8")) as unknown;
}

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
  // Every listed query parameter must be present with this exact value.
  readonly query?: Readonly<Record<string, string>>;
  readonly reply: (call: Call) => Response | Promise<Response>;
}

export function stubFetch(routes: readonly Route[]): { readonly fetchImpl: FetchLike; readonly calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input);
    const call: Call = { url, init };
    calls.push(call);
    const route = routes.find(
      (r) =>
        r.host === url.hostname &&
        r.path === url.pathname &&
        Object.entries(r.query ?? {}).every(([key, value]) => url.searchParams.get(key) === value),
    );
    if (route === undefined) throw new Error(`stub: no route for ${url.hostname}${url.pathname}${url.search}`);
    return route.reply(call);
  };
  return { fetchImpl, calls };
}

export const ORDERBOOK = "orderbooks.xo.market";
export const DATA_API = "api-mainnet.xo.market";

export function orderbookRoute(path: string, body: unknown, query?: Record<string, string>, status = 200): Route {
  return { host: ORDERBOOK, path, ...(query === undefined ? {} : { query }), reply: () => jsonResponse(body, { status }) };
}

export function dataRoute(path: string, body: unknown, query?: Record<string, string>, status = 200): Route {
  return { host: DATA_API, path: `/api${path}`, ...(query === undefined ? {} : { query }), reply: () => jsonResponse(body, { status }) };
}

// No throttle delay and no real sleeping, so retries and paging finish instantly.
export function fastOptions(fetchImpl: FetchLike, extra: Partial<HttpOptions> = {}): HttpOptions {
  return { fetchImpl, minIntervalMs: 0, sleep: async () => undefined, ...extra };
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
