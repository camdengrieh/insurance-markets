import { adapterErrorOfFetch, adapterErrorOfStatus, isFetchError, parseRetryAfterMs } from "../transport.js";
import type { AdapterDeps, FetchResponseLike } from "../../model.js";
import { MAX_DEADLINE_TIMER_MS } from "./constants.js";
import { PolymarketError } from "./errors.js";

// One place that turns an HTTP answer into either parsed JSON or a PolymarketError, on top of the injected fetch.
// The pause after three 429s or any 403 (R9), the per-host token bucket and Retry-After belong to the host's guarded
// fetch (the dApp's app/src/core/fetch.ts createGuardedFetch), which the host wires around this adapter; its refusals
// arrive here as FetchErrors and are mapped with the shared table (sdk/venues/transport.ts). This module never
// retries and never tries another route, host or header after a refusal (R10). It sends no custom headers: a custom
// User-Agent or Authorization header would make every cross-origin read a preflight in the browser build, and the
// daemon adds its own pinned User-Agent.

export type Query = ReadonlyArray<readonly [string, string]>;

// Path segments and query values are encoded with encodeURIComponent so a hostile slug, cursor or search text
// cannot add a path, a parameter or a fragment.
export function seg(value: string): string {
  return encodeURIComponent(value);
}

export function buildUrl(origin: string, path: string, query: Query = []): string {
  if (query.length === 0) return `${origin}${path}`;
  const pairs = query.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return `${origin}${path}?${pairs.join("&")}`;
}

export function statusError(route: string, response: FetchResponseLike, nowMs: number): PolymarketError {
  const status = response.status;
  // 451 is "unavailable for legal reasons", the shape a geoblock can take; core maps only 401 and 403 to a pause.
  const code = status === 451 ? "VENUE_PAUSED" : adapterErrorOfStatus(status);
  const retryAfterMs = status === 429 || status === 503 ? parseRetryAfterMs(response.headers.get("retry-after"), nowMs) : null;
  const detail =
    code === "VENUE_PAUSED"
      ? `HTTP ${status}: refused; may be Polymarket's own geoblock or its CDN; not retried and not worked around`
      : code === "SCHEMA_DRIFT"
        ? `HTTP ${status}: the venue rejected the request shape`
        : `HTTP ${status}`;
  return new PolymarketError(code, route, detail, { status, retryAfterMs });
}

export interface GetOptions {
  // Absolute deadline on the injected clock; past it the call fails TIMEOUT without a request.
  readonly deadlineMs?: number;
}

function signalFor(deps: AdapterDeps, deadlineMs: number | undefined, route: string): AbortSignal | undefined {
  if (deadlineMs === undefined) return undefined;
  const remaining = deadlineMs - deps.nowMs();
  if (!(remaining > 0)) throw new PolymarketError("TIMEOUT", route, "deadline reached before the request");
  return AbortSignal.timeout(Math.min(Math.ceil(remaining), MAX_DEADLINE_TIMER_MS));
}

async function send(deps: AdapterDeps, route: string, url: string, options: GetOptions): Promise<FetchResponseLike> {
  const signal = signalFor(deps, options.deadlineMs, route);
  let response: FetchResponseLike;
  try {
    response = await deps.fetch(url, signal === undefined ? { method: "GET" } : { method: "GET", signal });
  } catch (error) {
    // core's FetchError carries a stable code (paused, throttled, timeout, needs_cockpit ...). Anything else is
    // a network failure, a browser CORS block or a timeout, which look alike to a page; none of them is "no data".
    const code = adapterErrorOfFetch(error) ?? "TIMEOUT";
    const retryAfterMs = isFetchError(error) ? error.retryAfterMs : null;
    throw new PolymarketError(code, route, isFetchError(error) ? `transport refused (${error.code})` : "no HTTP answer (network failure, CORS block or timeout)", {
      retryAfterMs,
      cause: error,
    });
  }
  if (!response.ok) throw statusError(route, response, deps.nowMs());
  return response;
}

export async function getJson(deps: AdapterDeps, route: string, url: string, options: GetOptions = {}): Promise<unknown> {
  const response = await send(deps, route, url, options);
  try {
    return await response.json();
  } catch {
    throw new PolymarketError("SCHEMA_DRIFT", route, "the answer is not JSON");
  }
}

// For routes whose body is not parsed (status checks): the status code is the whole answer.
export async function getText(deps: AdapterDeps, route: string, url: string, options: GetOptions = {}): Promise<string> {
  const response = await send(deps, route, url, options);
  try {
    return await response.text();
  } catch {
    throw new PolymarketError("SCHEMA_DRIFT", route, "the answer could not be read");
  }
}
