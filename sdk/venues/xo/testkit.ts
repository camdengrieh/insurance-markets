import type { AdapterDeps, FetchLike, FetchResponseLike } from "../../model.js";

// Test double for the injected fetch: pure code with no Node import, so it can sit beside the adapter without
// tripping the bundle boundary check. Only the XO tests import it, and nothing reachable from main.tsx does.
// A request that no route matches throws, so a test can never pass through an unexpected call.

export interface ScriptedReply {
  readonly status?: number;
  readonly body?: unknown;
  // Sent as the response text when set (for non-JSON and oversize cases); `body` is ignored then.
  readonly text?: string;
  readonly headers?: Readonly<Record<string, string>>;
  // Never resolves: a hung upstream.
  readonly hang?: boolean;
  // Rejects like a network, CORS or CSP failure.
  readonly reject?: boolean;
}

export interface ScriptedRoute {
  readonly host: string;
  readonly path: string;
  // Every listed query parameter must be present with exactly this value.
  readonly query?: Readonly<Record<string, string>>;
  readonly reply: ScriptedReply | ((url: URL) => ScriptedReply);
}

export interface RecordedCall {
  readonly url: URL;
  readonly method: string | undefined;
  readonly headers: Readonly<Record<string, string>>;
}

export function replyResponse(reply: ScriptedReply): FetchResponseLike {
  const status = reply.status ?? 200;
  const headers = new Map(Object.entries(reply.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
  const text = reply.text ?? JSON.stringify(reply.body ?? null);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    json: async () => JSON.parse(text) as unknown,
    text: async () => text,
  };
}

export function scriptedFetch(routes: readonly ScriptedRoute[]): { readonly fetch: FetchLike; readonly calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    calls.push({ url, method: init?.method, headers: init?.headers ?? {} });
    const route = routes.find(
      (candidate) =>
        candidate.host === url.hostname &&
        candidate.path === url.pathname &&
        Object.entries(candidate.query ?? {}).every(([key, value]) => url.searchParams.get(key) === value),
    );
    if (route === undefined) throw new Error(`no scripted route for ${url.hostname}${url.pathname}${url.search}`);
    const reply = typeof route.reply === "function" ? route.reply(url) : route.reply;
    if (reply.reject === true) throw new TypeError("Failed to fetch");
    if (reply.hang === true) {
      return new Promise<FetchResponseLike>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    return replyResponse(reply);
  };
  return { fetch, calls };
}

// A fixed clock the test advances by hand.
export function manualClock(startMs: number): { readonly nowMs: () => number; advance(ms: number): void; set(ms: number): void } {
  let now = startMs;
  return {
    nowMs: () => now,
    advance: (ms) => {
      now += ms;
    },
    set: (ms) => {
      now = ms;
    },
  };
}

export function depsOf(fetch: FetchLike, nowMs: () => number): AdapterDeps {
  return { fetch, nowMs };
}
