import { parseRetryAfterMs } from "../transport.js";
import { isAdapterException } from "../errors.js";
import type { AdapterDeps } from "../../model.js";
import { PASCAL_MAX_BODY_CHARS } from "./constants.js";
import { AdapterFailure } from "./errors.js";

// One GET through the injected fetch, with a deadline, a body cap and a fixed mapping from transport outcomes
// to AdapterError. The adapter never reads a global fetch, never sets Origin, Referer or User-Agent (a
// browser cannot, and a custom header would break CORS safelisting), and never puts upstream text into an
// error. Pascal reads are all GET (the read-only POST search routes are not used).

export const DEFAULT_TIMEOUT_MS = 20_000;
// R9: a 403 pauses the venue for ten minutes. Core's pause table owns the policy; the adapter only reports it.
export const FORBIDDEN_PAUSE_MS = 10 * 60_000;

// Epoch milliseconds are above 1e12 from 2001 to 2286. A smaller number cannot be an absolute deadline, so it
// is read as a duration from now. That keeps `deadlineMs` safe whichever way a caller meant it.
export function resolveDeadline(deadlineMs: number | undefined, nowMs: number, fallbackMs = DEFAULT_TIMEOUT_MS): number {
  if (deadlineMs === undefined || !Number.isFinite(deadlineMs) || deadlineMs <= 0) return nowMs + fallbackMs;
  return deadlineMs < 1e12 ? nowMs + deadlineMs : deadlineMs;
}

export interface GetOptions {
  readonly url: string;
  // Absolute time on deps.nowMs.
  readonly deadlineAtMs?: number;
  // Statuses that mean "no such thing" for this call.
  readonly notFoundStatuses?: readonly number[];
}

function statusToFailure(status: number, retryAfterMs: number | null, notFound: readonly number[]): AdapterFailure {
  if (notFound.includes(status)) return new AdapterFailure("pascal", "NOT_FOUND", `http_${status}`);
  if (status === 429) return new AdapterFailure("pascal", "RATE_LIMITED", "http_429", retryAfterMs);
  if (status === 403) return new AdapterFailure("pascal", "VENUE_PAUSED", "http_403", retryAfterMs ?? FORBIDDEN_PAUSE_MS);
  if (status === 404) return new AdapterFailure("pascal", "NOT_FOUND", "http_404");
  if (status === 408 || status === 504) return new AdapterFailure("pascal", "TIMEOUT", `http_${status}`);
  if (status >= 500) return new AdapterFailure("pascal", "VENUE_PAUSED", `http_${status}`, retryAfterMs);
  return new AdapterFailure("pascal", "SCHEMA_DRIFT", `http_${status}`);
}

export async function getJson(deps: AdapterDeps, options: GetOptions): Promise<unknown> {
  const now = deps.nowMs();
  const deadline = options.deadlineAtMs ?? now + DEFAULT_TIMEOUT_MS;
  const remaining = deadline - now;
  if (remaining <= 0) throw new AdapterFailure("pascal", "TIMEOUT", "deadline_passed");

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AdapterFailure("pascal", "TIMEOUT", "deadline"));
    }, remaining);
  });

  const work = (async (): Promise<unknown> => {
    let response;
    try {
      response = await deps.fetch(options.url, { method: "GET", signal: controller.signal });
    } catch (error) {
      // A fetch layer that already speaks AdapterException (the Cockpit's proxy mapper) is passed through.
      if (isAdapterException(error)) throw error;
      // Network failure, CORS refusal, CSP refusal or abort: the venue gave no answer.
      throw new AdapterFailure("pascal", "TIMEOUT", "no_response");
    }
    if (!response.ok) {
      throw statusToFailure(response.status, parseRetryAfterMs(response.headers.get("retry-after"), deps.nowMs()), options.notFoundStatuses ?? []);
    }
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new AdapterFailure("pascal", "TIMEOUT", "body_unreadable");
    }
    if (text.length > PASCAL_MAX_BODY_CHARS) throw new AdapterFailure("pascal", "SCHEMA_DRIFT", "body_too_large");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AdapterFailure("pascal", "SCHEMA_DRIFT", "invalid_json");
    }
  })();
  // If the deadline wins, the late result must not become an unhandled rejection.
  work.catch(() => undefined);

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
