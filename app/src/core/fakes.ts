// Test doubles for the fetch ports and timers. Pure TypeScript, no test-runner import, so adapters' tests in
// other directories can reuse them. Nothing here is imported by application code.

import type { TimerApi } from "./cache";
import type { RawFetch, RawInit, RawResponse } from "./fetch";

// A manual clock plus timers: `advance(ms)` moves time and fires what is due, in order.
export class FakeTimers implements TimerApi {
  now: number;
  readonly pending = new Map<number, { at: number; run: () => void }>();
  #next = 1;

  constructor(start = 0) {
    this.now = start;
  }

  setTimeout(handler: () => void, ms: number): unknown {
    const id = this.#next++;
    this.pending.set(id, { at: this.now + ms, run: handler });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number);
  }

  clock = (): number => this.now;

  // A sleep that resolves when the fake clock reaches the wake time.
  sleep = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
      this.setTimeout(resolve, ms);
    });

  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      let nextId: number | undefined;
      let nextAt = Infinity;
      for (const [id, timer] of this.pending) {
        if (timer.at <= target && timer.at < nextAt) {
          nextAt = timer.at;
          nextId = id;
        }
      }
      if (nextId === undefined) break;
      const timer = this.pending.get(nextId);
      this.pending.delete(nextId);
      this.now = Math.max(this.now, nextAt);
      timer?.run();
    }
    this.now = target;
  }
}

export interface RawResponseOptions {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  // Deliver the body as these byte chunks through a reader instead of `body`.
  readonly chunks?: readonly Uint8Array[];
  // No reader at all: only text() works.
  readonly noStream?: boolean;
  readonly type?: string;
}

export function rawResponse(options: RawResponseOptions = {}): RawResponse {
  const status = options.status ?? 200;
  const headers = new Map(Object.entries(options.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]));
  const text = options.body ?? "";
  const chunks = options.chunks ?? [new TextEncoder().encode(text)];
  let index = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    ...(options.type === undefined ? {} : { type: options.type }),
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    body:
      options.noStream === true
        ? null
        : {
            getReader: () => ({
              read: async () => {
                const value = chunks[index];
                index += 1;
                return value === undefined ? { done: true } : { done: false, value };
              },
              cancel: async () => {
                index = chunks.length;
              },
            }),
          },
    text: async () => text,
  };
}

export interface RawCall {
  readonly url: string;
  readonly init: RawInit;
}

// A raw fetch that records every call and answers with `handler`. Rejects when the request is aborted while the
// handler's promise is pending, like a real fetch.
export class FakeRaw {
  readonly calls: RawCall[] = [];
  handler: (url: string, init: RawInit) => Promise<RawResponse> | RawResponse;

  constructor(handler: (url: string, init: RawInit) => Promise<RawResponse> | RawResponse = () => rawResponse({ body: "{}" })) {
    this.handler = handler;
  }

  fetch: RawFetch = (url, init) => {
    this.calls.push({ url, init });
    return new Promise<RawResponse>((resolve, reject) => {
      if (init.signal.aborted) {
        reject(new DOMException("aborted", "AbortError"));
        return;
      }
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      Promise.resolve(this.handler(url, init)).then(resolve, reject);
    });
  };
}

// A handler that never answers (until aborted).
export function hang(): Promise<RawResponse> {
  return new Promise<RawResponse>(() => undefined);
}
