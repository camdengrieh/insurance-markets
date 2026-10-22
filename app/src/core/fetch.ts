// The fetch ports (docs/dapp-design.md 4.1 principle 3, 1.3 B4 and B7, 4.8 R1 and R10).
//
// Adapters never touch a global: they call `deps.fetch` with an absolute upstream URL (ports.ts FetchLike).
// This module builds the implementations:
//
//   resolveUpstream(url)       the ONE function that turns an absolute upstream URL into a service id, path and
//                              query, using the closed lists of headers.config.ts. The Cockpit's fetch uses
//                              the same function to build /ui/read/<service>/... (fetch-cockpit.ts);
//   createDirectFetch(...)     the standalone build: straight to a CORS-open host, no credentials, no cookies,
//                              no referrer, no redirect, a header allowlist (no User-Agent: a custom one makes
//                              every cross-origin GET a preflight), a timeout and a response size cap;
//   createGuardedFetch(...)    wraps either one with the per-host token bucket (M0-6) and the venue state rule of
//                              sdk/venues/state.ts (the R9 pause after three 429s or any 403, Retry-After, and a block
//                              page served as success). It never retries around a block (R10).
//
// Every refusal is a FetchError with a stable code; adapterErrorOfFetch maps it onto the closed AdapterError set.

import { JSON_RPC_READ_METHODS, isSafeUpstreamPath, isSafeUpstreamQuery } from "@bridge/contract";

import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS, type ReadService } from "../../headers.config";
import { isPauseSignal } from "@sdk/venues/state";
import { isBlockPage } from "@sdk/venues/transport";

import { HostBudgets, VenuePauses, parseRetryAfterMs, type Clock } from "./budget";
import type { TimerApi } from "./cache";
import type { AdapterError, FetchLike, FetchResponseLike } from "./ports";

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_THROTTLE_WAIT_MS = 5_000;

// ---- errors ----------------------------------------------------------------------------------------------------------------------

// The error contract a reader and its host share lives in the SDK (sdk/venues/transport.ts).
export { FETCH_ERROR_CODES, FetchError, adapterErrorOfFetch, adapterErrorOfStatus, isFetchError, isNeedsCockpit, type FetchErrorCode } from "@sdk/venues/transport";
import { FetchError, isFetchError } from "@sdk/venues/transport";

// ---- URL -> service (the single mapping) -------------------------------------------------------------------------------------

export interface UpstreamTarget {
  readonly service: ReadService;
  readonly origin: string;
  readonly host: string;
  // Absolute path, no query.
  readonly path: string;
  // Query without the leading "?".
  readonly query: string;
  // Browser-direct hosts may be called by the standalone build; daemon-only hosts only through the Cockpit.
  readonly transport: "browser_direct" | "daemon_only";
}

interface OriginRow {
  readonly service: ReadService;
  readonly transport: UpstreamTarget["transport"];
}

const ORIGIN_TABLE: ReadonlyMap<string, OriginRow> = new Map<string, OriginRow>([
  ...BROWSER_DIRECT_ORIGINS.map((entry): [string, OriginRow] => [entry.origin, { service: entry.service, transport: "browser_direct" }]),
  ...DAEMON_ONLY_ORIGINS.flatMap((entry): Array<[string, OriginRow]> => (entry.service === null ? [] : [[entry.origin, { service: entry.service, transport: "daemon_only" }]])),
]);

export function originOfService(service: ReadService): string | undefined {
  for (const [origin, row] of ORIGIN_TABLE) if (row.service === service) return origin;
  return undefined;
}

// Throws FetchError (unsafe_url, origin_not_allowed). Never returns a target for a host outside the closed lists.
export function resolveUpstream(input: string): UpstreamTarget {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new FetchError("unsafe_url", "not an absolute URL");
  }
  if (url.protocol !== "https:") throw new FetchError("unsafe_url", "only https upstreams are allowed");
  if (url.username !== "" || url.password !== "" || url.port !== "" || url.hash !== "") {
    throw new FetchError("unsafe_url", "credentials, a port or a fragment in an upstream URL");
  }
  const row = ORIGIN_TABLE.get(url.origin);
  if (row === undefined) throw new FetchError("origin_not_allowed", "host is not on the closed list");
  const query = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  if (!isSafeUpstreamPath(url.pathname) || !isSafeUpstreamQuery(query)) {
    throw new FetchError("unsafe_url", "path or query is not allowed", { service: row.service });
  }
  return Object.freeze({ service: row.service, origin: url.origin, host: url.host, path: url.pathname, query, transport: row.transport });
}

// The URL that is actually requested: rebuilt from the checked parts, so what is sent is exactly what was checked.
export function canonicalUrl(target: UpstreamTarget): string {
  return `${target.origin}${target.path}${target.query === "" ? "" : `?${target.query}`}`;
}

// ---- POST rules shared by both builds ---------------------------------------------------------------------------------

const RPC_SERVICES: ReadonlySet<ReadService> = new Set(["xo_rpc", "hyperliquid_rpc", "rpc_base", "rpc_polygon", "rpc_bnb"]);
const READ_METHODS: ReadonlySet<string> = new Set(JSON_RPC_READ_METHODS);
export const MAX_POST_BODY_BYTES = 256 * 1024;

function bodyBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

// A POST is allowed only for a read: JSON-RPC with read-only methods to an RPC host, Hyperliquid /info, and the
// Polymarket CLOB batch-books route. Everything else is refused here, before any request leaves.
export function checkPost(target: UpstreamTarget, body: string | undefined): void {
  if (body === undefined || body.length === 0) throw new FetchError("method_not_allowed", "a POST needs a JSON body", { service: target.service });
  if (bodyBytes(body) > MAX_POST_BODY_BYTES) throw new FetchError("body_too_large", "request body is too large", { service: target.service });
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new FetchError("method_not_allowed", "a POST body must be JSON", { service: target.service });
  }
  if (RPC_SERVICES.has(target.service)) {
    const calls = Array.isArray(parsed) ? parsed : [parsed];
    if (calls.length === 0 || calls.length > 100) throw new FetchError("rpc_method_not_allowed", "empty or oversized JSON-RPC batch", { service: target.service });
    for (const call of calls) {
      const method = typeof call === "object" && call !== null ? (call as { method?: unknown }).method : undefined;
      if (typeof method !== "string" || !READ_METHODS.has(method)) {
        throw new FetchError("rpc_method_not_allowed", "only read-only JSON-RPC methods are allowed", { service: target.service });
      }
    }
    return;
  }
  if (target.service === "hyperliquid_info" && target.path === "/info") {
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || typeof (parsed as { type?: unknown }).type !== "string") {
      throw new FetchError("method_not_allowed", "Hyperliquid /info needs an object with a string type", { service: target.service });
    }
    return;
  }
  if (target.service === "polymarket_clob" && (target.path === "/books" || target.path === "/prices" || target.path === "/midpoints" || target.path === "/spreads")) return;
  throw new FetchError("method_not_allowed", "this service has no read-only POST route", { service: target.service });
}

// ---- the raw transport -------------------------------------------------------------------------------------------------------

// The slice of fetch and Response the direct and Cockpit ports need. The global fetch satisfies it; tests inject
// a fake. `RawInit` fixes every option that matters for privacy and safety.
export interface RawInit {
  readonly method: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal: AbortSignal;
  readonly credentials: "omit";
  readonly redirect: "manual";
  readonly referrerPolicy: "no-referrer";
  readonly cache: "no-store";
  readonly mode: "cors";
}

export interface RawBodyReader {
  read(): Promise<{ readonly done: boolean; readonly value?: Uint8Array }>;
  cancel(): Promise<void>;
}

export interface RawResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly type?: string;
  readonly headers: { get(name: string): string | null };
  readonly body?: { getReader(): RawBodyReader } | null;
  text(): Promise<string>;
}

export type RawFetch = (input: string, init: RawInit) => Promise<RawResponse>;

export interface DirectFetchOptions {
  readonly rawFetch: RawFetch;
  readonly timers: TimerApi;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

// Request headers the page may send. Everything else (User-Agent, Origin, Referer, Cookie, Authorization, ...) is
// dropped: the browser owns them, and a custom one would turn a simple GET into a preflight.
const BASE_HEADERS: ReadonlySet<string> = new Set(["accept", "content-type"]);
const SERVICE_HEADERS: Readonly<Partial<Record<ReadService, ReadonlySet<string>>>> = {
  // A user-pasted Quotient key (mode A) is the one credential a standalone page may attach.
  quotient: new Set(["x-quotient-api-key"]),
};

export function allowedHeaders(service: ReadService, headers: Readonly<Record<string, string>> | undefined, post: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  const extra = SERVICE_HEADERS[service];
  for (const [name, value] of Object.entries(headers ?? {})) {
    const key = name.toLowerCase();
    if (!BASE_HEADERS.has(key) && extra?.has(key) !== true) continue;
    if (typeof value !== "string" || /[\r\n\u0000]/.test(value)) continue;
    out[key] = value;
  }
  if (out["accept"] === undefined) out["accept"] = "application/json";
  if (post) out["content-type"] = "application/json";
  else delete out["content-type"];
  return out;
}

class Deadline {
  readonly signal: AbortSignal;
  timedOut = false;
  readonly #controller = new AbortController();
  readonly #timers: TimerApi;
  readonly #handle: unknown;

  constructor(timers: TimerApi, timeoutMs: number, outer: AbortSignal | undefined) {
    this.#timers = timers;
    this.signal = this.#controller.signal;
    this.#handle = timers.setTimeout(() => {
      this.timedOut = true;
      this.#controller.abort();
    }, timeoutMs);
    if (outer !== undefined) {
      if (outer.aborted) this.#controller.abort();
      else outer.addEventListener("abort", () => this.#controller.abort(), { once: true });
    }
  }

  // Rejects when the deadline fires or the caller aborts, whatever the underlying promise does.
  race<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => reject(new DOMException("aborted", "AbortError"));
      if (this.signal.aborted) {
        onAbort();
        return;
      }
      this.signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (value) => {
          this.signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error: unknown) => {
          this.signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  }

  done(): void {
    this.#timers.clearTimeout(this.#handle);
  }
}

export function translateTransportError(error: unknown, deadline: Deadline, service: ReadService | null): FetchError {
  if (isFetchError(error)) return error;
  if (deadline.timedOut) return new FetchError("timeout", "the upstream did not answer in time", { service });
  if (deadline.signal.aborted) return new FetchError("aborted", "the request was cancelled", { service });
  return new FetchError("network", "the request failed before an answer", { service });
}

// Reads at most maxBytes of the body as UTF-8 text.
async function readCapped(response: RawResponse, maxBytes: number, deadline: Deadline, service: ReadService | null): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new FetchError("too_large", "the response is over the size cap", { service });
  const reader = response.body?.getReader();
  if (reader === undefined) {
    const text = await deadline.race(response.text());
    if (text.length > maxBytes) throw new FetchError("too_large", "the response is over the size cap", { service });
    return text;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const part = await deadline.race(reader.read());
    if (part.done) break;
    const value = part.value;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      void reader.cancel().catch(() => undefined);
      throw new FetchError("too_large", "the response is over the size cap", { service });
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(joined);
}

function toFetchResponse(response: RawResponse, text: string): FetchResponseLike {
  let cached: unknown;
  let parsed = false;
  return {
    ok: response.ok,
    status: response.status,
    headers: { get: (name: string) => response.headers.get(name) },
    async json(): Promise<unknown> {
      if (!parsed) {
        try {
          cached = JSON.parse(text);
        } catch {
          throw new FetchError("not_json", "the response body is not JSON");
        }
        parsed = true;
      }
      return cached;
    },
    async text(): Promise<string> {
      return text;
    },
  };
}

function isRedirect(response: RawResponse): boolean {
  return response.type === "opaqueredirect" || response.status === 0 || (response.status >= 300 && response.status < 400);
}

// The standalone build's port. Refuses daemon-only hosts with `needs_cockpit`.
export function createDirectFetch(options: DirectFetchOptions): FetchLike {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  return async (input, init) => {
    const target = resolveUpstream(input);
    if (target.transport === "daemon_only") {
      throw new FetchError("needs_cockpit", "this host is reachable only through the local Cockpit", { service: target.service });
    }
    const post = init?.method === "POST";
    if (post) checkPost(target, init?.body);
    const headers = allowedHeaders(target.service, init?.headers, post);
    const deadline = new Deadline(options.timers, timeoutMs, init?.signal);
    try {
      const response = await deadline.race(
        options.rawFetch(canonicalUrl(target), {
          method: post ? "POST" : "GET",
          headers,
          ...(post && init?.body !== undefined ? { body: init.body } : {}),
          signal: deadline.signal,
          credentials: "omit",
          redirect: "manual",
          referrerPolicy: "no-referrer",
          cache: "no-store",
          mode: "cors",
        }),
      );
      if (isRedirect(response)) throw new FetchError("redirect", "the upstream redirected; redirects are never followed", { service: target.service });
      const text = await readCapped(response, maxBytes, deadline, target.service);
      // A JSON endpoint that answers success with a web page is a block (a bot wall or challenge page), not drift.
      if (response.status >= 200 && response.status < 300 && isBlockPage(response.headers.get("content-type"), text)) {
        throw new FetchError("blocked", "the venue answered with a web page instead of data", { service: target.service, signal: "block_page" });
      }
      return toFetchResponse(response, text);
    } catch (error) {
      throw translateTransportError(error, deadline, target.service);
    } finally {
      deadline.done();
    }
  };
}

// Shared with fetch-cockpit.ts.
export const internals = { Deadline, readCapped, toFetchResponse, isRedirect };

// ---- budget, pause and Retry-After wrapper ----------------------------------------------------------------------------

export interface GuardOptions {
  readonly inner: FetchLike;
  readonly nowMs: Clock;
  // Waits `ms`; injected so a test advances a fake clock instead of sleeping.
  readonly sleep: (ms: number) => Promise<void>;
  readonly budgets?: HostBudgets;
  readonly pauses?: VenuePauses;
  readonly maxWaitMs?: number;
}

export interface GuardedFetch extends FetchLike {
  readonly pauses: VenuePauses;
  readonly budgets: HostBudgets;
}

export function createGuardedFetch(options: GuardOptions): GuardedFetch {
  const budgets = options.budgets ?? new HostBudgets(options.nowMs);
  const pauses = options.pauses ?? new VenuePauses();
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_THROTTLE_WAIT_MS;
  const guarded: FetchLike = async (input, init) => {
    // The host decides the bucket and the pause. A URL that does not resolve never reaches the inner port.
    const target = resolveUpstream(input);
    const pause = pauses.check(target.host, options.nowMs());
    if (pause.paused) {
      throw new FetchError("paused", `this host is paused (${pause.reason})`, { service: target.service, retryAfterMs: Math.max(0, pause.untilMs - options.nowMs()), signal: pause.signal });
    }
    const slot = budgets.reserve(target.host, maxWaitMs);
    if (!slot.ok) {
      throw new FetchError("throttled", "too many requests to this host; try again shortly", { service: target.service, retryAfterMs: slot.retryAfterMs });
    }
    if (slot.waitMs > 0) {
      await options.sleep(slot.waitMs);
      // A 403 or a third 429 may have landed while this call waited: honour it, do not send.
      const again = pauses.check(target.host, options.nowMs());
      if (again.paused) {
        throw new FetchError("paused", `this host is paused (${again.reason})`, { service: target.service, retryAfterMs: Math.max(0, again.untilMs - options.nowMs()), signal: again.signal });
      }
    }
    let response: FetchResponseLike;
    try {
      response = await options.inner(input, init);
    } catch (error) {
      const at = options.nowMs();
      if (isFetchError(error) && error.code === "blocked") pauses.record(target.host, { status: 200, retryAfterMs: null, blockPage: true }, at);
      // The daemon paused this venue itself (a block page it saw, or its own count): hold the same pause here, so
      // the page refuses before sending and can say why.
      else if (isFetchError(error) && error.code === "bridge" && error.bridgeCode === "venue_paused" && isPauseSignal(error.signal)) {
        pauses.hold(target.host, error.signal, at, error.retryAfterMs === null ? null : at + error.retryAfterMs);
      }
      throw error;
    }
    const now = options.nowMs();
    pauses.record(target.host, { status: response.status, retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after"), now) }, now);
    return response;
  };
  return Object.assign(guarded, { pauses, budgets });
}
