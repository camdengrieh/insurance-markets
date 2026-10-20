import { parseRetryAfterMs } from "../../core/budget";
import { isAdapterException } from "../../core/errors";
import { adapterErrorOfFetch, isFetchError } from "../../core/fetch";
import type { AdapterDeps } from "../../core/ports";
import { UDX_MAX_BODY_CHARS, UDX_PAUSE_MS, UDX_VERSION } from "./constants";
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
  if (notFound.includes(status)) return new AdapterFailure("udx", "NOT_FOUND", `http_${status}`);
  if (status === 429) return new AdapterFailure("udx", "RATE_LIMITED", "http_429", retryAfterMs);
  if (status === 401 || status === 403) return new AdapterFailure("udx", "VENUE_PAUSED", `http_${status}`, retryAfterMs ?? UDX_PAUSE_MS);
  if (status === 404) return new AdapterFailure("udx", "NOT_FOUND", "http_404");
  if (status === 408 || status === 504) return new AdapterFailure("udx", "TIMEOUT", `http_${status}`);
  if (status >= 500) return new AdapterFailure("udx", "VENUE_PAUSED", `http_${status}`, retryAfterMs);
  return new AdapterFailure("udx", "SCHEMA_DRIFT", `http_${status}`);
}

export async function getJson(deps: AdapterDeps, options: GetOptions): Promise<unknown> {
  const now = deps.nowMs();
  const deadline = options.deadlineAtMs ?? now + DEFAULT_TIMEOUT_MS;
  const remaining = deadline - now;
  if (remaining <= 0) throw new AdapterFailure("udx", "TIMEOUT", "deadline_passed");

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AdapterFailure("udx", "TIMEOUT", "deadline"));
    }, remaining);
  });

  const work = (async (): Promise<unknown> => {
    let response;
    try {
      // The API version is pinned by a header. The Cockpit's fetch may drop it (the daemon pins its own); a
      // response that names another version is refused below, and a shape that changed fails the schemas.
      response = await deps.fetch(options.url, { method: "GET", headers: { "udx-version": UDX_VERSION }, signal: controller.signal });
    } catch (error) {
      if (isAdapterException(error)) throw error;
      // The fetch layer's own refusals (not paired, paused, needs the Cockpit, bridge errors) keep their meaning.
      const mapped = adapterErrorOfFetch(error);
      if (mapped !== null && isFetchError(error)) throw new AdapterFailure("udx", mapped, `fetch_${error.code}`, error.retryAfterMs);
      throw new AdapterFailure("udx", "TIMEOUT", "no_response");
    }
    if (!response.ok) {
      throw statusToFailure(response.status, parseRetryAfterMs(response.headers.get("retry-after"), deps.nowMs()), options.notFoundStatuses ?? []);
    }
    const answered = response.headers.get("udx-version");
    if (answered !== null && answered !== UDX_VERSION) throw new AdapterFailure("udx", "SCHEMA_DRIFT", "version_mismatch");
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new AdapterFailure("udx", "TIMEOUT", "body_unreadable");
    }
    if (text.length > UDX_MAX_BODY_CHARS) throw new AdapterFailure("udx", "SCHEMA_DRIFT", "body_too_large");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AdapterFailure("udx", "SCHEMA_DRIFT", "invalid_json");
    }
  })();
  work.catch(() => undefined);

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
