import type { AdapterDeps, FetchLike, FetchResponseLike } from "../../../core/ports";

// A scripted fetch for the Quotient tests: no network, pure code. Routes match "GET url-prefix". A call no route
// matches throws, so a test can never pass through an unexpected request. Every call is recorded, including its
// headers, so a test can prove which header went where (and that no payment header ever did).

export interface FakeReply {
  readonly status?: number;
  readonly json?: unknown;
  readonly text?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly reject?: boolean;
}

export interface FakeCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
}

export type FakeRoute = FakeReply | ((call: FakeCall) => FakeReply);

export interface FakeFetch {
  readonly fetch: FetchLike;
  readonly calls: FakeCall[];
}

export function reply(r: FakeReply): FetchResponseLike {
  const status = r.status ?? 200;
  const text = r.text ?? (r.json === undefined ? "" : JSON.stringify(r.json));
  const headers = new Map(Object.entries(r.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    json: async () => JSON.parse(text) as unknown,
    text: async () => text,
  };
}

export function fakeFetch(routes: Readonly<Record<string, FakeRoute>>): FakeFetch {
  const calls: FakeCall[] = [];
  const fetch: FetchLike = async (input, init) => {
    const call: FakeCall = { url: input, method: init?.method ?? "GET", headers: init?.headers ?? {} };
    calls.push(call);
    const key = Object.keys(routes).find((route) => {
      const space = route.indexOf(" ");
      return call.method === route.slice(0, space) && call.url.startsWith(route.slice(space + 1));
    });
    if (key === undefined) throw new TypeError(`no route for ${call.method} ${call.url}`);
    const entry = routes[key];
    const r = typeof entry === "function" ? entry(call) : entry;
    if (r === undefined) throw new TypeError("empty route");
    if (r.reject === true) throw new TypeError("Failed to fetch");
    return reply(r);
  };
  return { fetch, calls };
}

// A fixed clock: 2026-10-18T17:35:00Z.
export const NOW = 1_792_344_900_000;

export function depsOf(fake: FakeFetch, clock: { now: number } = { now: NOW }): AdapterDeps {
  return { fetch: fake.fetch, nowMs: () => clock.now };
}
