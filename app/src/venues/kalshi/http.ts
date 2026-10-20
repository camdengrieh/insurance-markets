import { parseRetryAfterMs } from "../../core/budget";
import { isAdapterException } from "../../core/errors";
import { adapterErrorOfFetch, isFetchError } from "../../core/fetch";
import type { AdapterDeps } from "../../core/ports";
import { KALSHI_MAX_BODY_CHARS, KALSHI_PAUSE_MS } from "./constants";
import { AdapterFailure } from "./errors";

// One GET through the injected fetch, with a deadline, a body cap and a fixed mapping from transport outcomes to
// AdapterError. The adapter never reads a global fetch, never sets Origin, Referer or User-Agent, and never puts
// upstream text into an error. In the Cockpit build the injected fetch maps the absolute URL onto the daemon's
// read proxy; this module neither knows nor cares.

export const DEFAULT_TIMEOUT_MS = 20_000;

// Epoch milliseconds are above 1e12 from 2001 to 2286. A smaller number cannot be an absolute deadline, so it
// is read as a duration from now. That keeps `deadlineMs` safe whichever way a caller meant it.
export function resolveDeadline(deadlineMs: number | undefined, nowMs: number, fallbackMs = DEFAULT_TIMEOUT_MS): number {
  if (deadlineMs === undefined || !Number.isFinite(deadlineMs) || deadlineMs <= 0) return nowMs + fallbackMs;
  return deadlineMs < 1e12 ? nowMs + deadlineMs : deadlineMs;
}

export interface GetOptions {
  readonly url: string;
  readonly deadlineAtMs?: number;
  // Statuses that mean "no such thing" for this call.
  readonly notFoundStatuses?: readonly number[];
}

function statusToFailure(status: number, retryAfterMs: number | null, notFound: readonly number[]): AdapterFailure {
  if (notFound.includes(status)) return new AdapterFailure("kalshi", "NOT_FOUND", `http_${status}`);
  if (status === 429) return new AdapterFailure("kalshi", "RATE_LIMITED", "http_429", retryAfterMs);
  if (status === 401 || status === 403) return new AdapterFailure("kalshi", "VENUE_PAUSED", `http_${status}`, retryAfterMs ?? KALSHI_PAUSE_MS);
  if (status === 404) return new AdapterFailure("kalshi", "NOT_FOUND", "http_404");
  if (status === 408 || status === 504) return new AdapterFailure("kalshi", "TIMEOUT", `http_${status}`);
  if (status >= 500) return new AdapterFailure("kalshi", "VENUE_PAUSED", `http_${status}`, retryAfterMs);
  return new AdapterFailure("kalshi", "SCHEMA_DRIFT", `http_${status}`);
}

export async function getJson(deps: AdapterDeps, options: GetOptions): Promise<unknown> {
  const now = deps.nowMs();
  const deadline = options.deadlineAtMs ?? now + DEFAULT_TIMEOUT_MS;
  const remaining = deadline - now;
  if (remaining <= 0) throw new AdapterFailure("kalshi", "TIMEOUT", "deadline_passed");

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AdapterFailure("kalshi", "TIMEOUT", "deadline"));
    }, remaining);
  });

  const work = (async (): Promise<unknown> => {
    let response;
    try {
      response = await deps.fetch(options.url, { method: "GET", signal: controller.signal });
    } catch (error) {
      if (isAdapterException(error)) throw error;
      // The fetch layer's own refusals (not paired, paused, needs the Cockpit, bridge errors) keep their meaning.
      const mapped = adapterErrorOfFetch(error);
      if (mapped !== null && isFetchError(error)) throw new AdapterFailure("kalshi", mapped, `fetch_${error.code}`, error.retryAfterMs);
      throw new AdapterFailure("kalshi", "TIMEOUT", "no_response");
    }
    if (!response.ok) {
      throw statusToFailure(response.status, parseRetryAfterMs(response.headers.get("retry-after"), deps.nowMs()), options.notFoundStatuses ?? []);
    }
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new AdapterFailure("kalshi", "TIMEOUT", "body_unreadable");
    }
    if (text.length > KALSHI_MAX_BODY_CHARS) throw new AdapterFailure("kalshi", "SCHEMA_DRIFT", "body_too_large");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AdapterFailure("kalshi", "SCHEMA_DRIFT", "invalid_json");
    }
  })();
  work.catch(() => undefined);

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
