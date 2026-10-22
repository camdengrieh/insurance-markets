import type { AdapterDeps, FetchLike, FetchResponseLike } from "../../../model.js";

// A fake fetch for adapter tests: URL -> answer, every call recorded. Pure TypeScript, no Node API.

export interface FakeAnswer {
  readonly status?: number;
  readonly body?: unknown;
  readonly text?: string;
  readonly headers?: Readonly<Record<string, string>>;
  // Throws instead of answering (a network failure).
  readonly throws?: unknown;
  // Not JSON: json() rejects.
  readonly notJson?: boolean;
}

export interface Call {
  readonly url: string;
  readonly init: Parameters<FetchLike>[1];
}

export interface Harness {
  readonly deps: AdapterDeps;
  readonly calls: Call[];
  clock: { now: number };
  inFlightMax(): number;
}

export function response(answer: FakeAnswer): FetchResponseLike {
  const status = answer.status ?? 200;
  const headers = new Map(Object.entries(answer.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    json: () => (answer.notJson === true ? Promise.reject(new SyntaxError("not json")) : Promise.resolve(answer.body)),
    text: () => Promise.resolve(answer.text ?? (typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body ?? ""))),
  };
}

// `routes` maps an exact URL, or a function of the URL, to an answer. An unrouted URL fails the test loudly.
export function harness(
  routes: Readonly<Record<string, FakeAnswer>> | ((url: string) => FakeAnswer | undefined),
  start = 1_792_344_900_000,
): Harness {
  const calls: Call[] = [];
  const clock = { now: start };
  let inFlight = 0;
  let max = 0;
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    inFlight += 1;
    max = Math.max(max, inFlight);
    try {
      // Yield so concurrent calls overlap in the test.
      await Promise.resolve();
      const answer = typeof routes === "function" ? routes(url) : routes[url];
      if (answer === undefined) throw new Error(`unrouted URL in test: ${url}`);
      if (answer.throws !== undefined) throw answer.throws;
      return response(answer);
    } finally {
      inFlight -= 1;
    }
  };
  return { deps: { fetch, nowMs: () => clock.now }, calls, clock, inFlightMax: () => max };
}
