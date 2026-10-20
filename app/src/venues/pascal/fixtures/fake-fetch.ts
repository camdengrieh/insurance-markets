import type { FetchLike, FetchResponseLike } from "../../../core/ports";

// A scripted fetch for adapter tests: no network, pure code. Each route matches "METHOD url-prefix" and answers
// with a body (serialised to JSON), a text or a status. A call no route matches throws, so a test can never
// pass through an unexpected request. Every call is recorded.

export interface FakeCall {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | undefined;
}

export interface FakeReply {
  readonly status?: number;
  readonly json?: unknown;
  readonly text?: string;
  readonly headers?: Readonly<Record<string, string>>;
  // Never resolves: a hung upstream.
  readonly hang?: boolean;
  // Rejects like a network, CORS or CSP failure.
  readonly reject?: boolean;
}

export type FakeRoute = FakeReply | ((call: FakeCall) => FakeReply);

export interface FakeFetch {
  readonly fetch: FetchLike;
  readonly calls: FakeCall[];
}

export function response(reply: FakeReply): FetchResponseLike {
  const status = reply.status ?? 200;
  const text = reply.text ?? (reply.json === undefined ? "" : JSON.stringify(reply.json));
  const headers = new Map(Object.entries(reply.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
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
    const call: FakeCall = { url: input, method: init?.method ?? "GET", headers: init?.headers ?? {}, body: init?.body };
    calls.push(call);
    const key = Object.keys(routes).find((route) => {
      const space = route.indexOf(" ");
      return call.method === route.slice(0, space) && call.url.startsWith(route.slice(space + 1));
    });
    if (key === undefined) throw new TypeError(`no route for ${call.method} ${call.url}`);
    const entry = routes[key];
    const reply = typeof entry === "function" ? entry(call) : entry;
    if (reply === undefined) throw new TypeError("empty route");
    if (reply.reject === true) throw new TypeError("Failed to fetch");
    if (reply.hang === true) await new Promise<never>(() => undefined);
    return response(reply);
  };
  return { fetch, calls };
}
