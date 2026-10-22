import type { FetchLike, FetchResponseLike } from "../../../model.js";

// A scripted fetch for adapter tests: no network. Each route is matched on "METHOD url-prefix" and answers
// with a body (serialised to JSON) or a status. Every call is recorded.

export interface FakeCall {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | undefined;
}

export interface FakeReplyValue {
  readonly status?: number;
  readonly json?: unknown;
  readonly text?: string;
}

export type FakeReply = FakeReplyValue | ((call: FakeCall) => FakeReplyValue | Promise<FakeReplyValue>);

export interface FakeFetch {
  readonly fetch: FetchLike;
  readonly calls: FakeCall[];
}

export function reply(init: { status?: number; json?: unknown; text?: string }): FetchResponseLike {
  const status = init.status ?? 200;
  const text = init.text ?? (init.json === undefined ? "" : JSON.stringify(init.json));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => JSON.parse(text) as unknown,
    text: async () => text,
  };
}

export function fakeFetch(routes: Readonly<Record<string, FakeReply>>): FakeFetch {
  const calls: FakeCall[] = [];
  const fetch: FetchLike = async (input, init) => {
    const call: FakeCall = { url: input, method: init?.method ?? "GET", headers: init?.headers ?? {}, body: init?.body };
    calls.push(call);
    const key = Object.keys(routes).find((route) => {
      const space = route.indexOf(" ");
      return call.method === route.slice(0, space) && call.url.startsWith(route.slice(space + 1));
    });
    if (key === undefined) throw new TypeError("no route");
    const entry = routes[key];
    const resolved = typeof entry === "function" ? await entry(call) : entry;
    return reply(resolved ?? { status: 500 });
  };
  return { fetch, calls };
}
