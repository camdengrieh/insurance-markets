import type { AdapterDeps, VenueId } from "../../model.js";
import { AdapterFailure } from "./errors.js";

// One request through the injected fetch, with a deadline, a body cap and a fixed mapping from transport
// outcomes to AdapterError. The adapter never reads a global fetch, never sets Origin, Referer or
// User-Agent (a browser cannot, and a custom header would break CORS safelisting), and never puts
// upstream text into an error.

export const DEFAULT_TIMEOUT_MS = 10_000;
// A body larger than this is not a market list; fail closed instead of parsing it.
export const MAX_BODY_CHARS = 4_000_000;

// Epoch milliseconds are above 1e12 from 2001 to 2286. A smaller number cannot be an absolute deadline, so it
// is read as a duration from now. This keeps `deadlineMs` safe whichever way a caller meant it.
export function resolveDeadline(deadlineMs: number | undefined, nowMs: number, fallbackMs = DEFAULT_TIMEOUT_MS): number {
  if (deadlineMs === undefined || !Number.isFinite(deadlineMs) || deadlineMs <= 0) return nowMs + fallbackMs;
  return deadlineMs < 1e12 ? nowMs + deadlineMs : deadlineMs;
}

export interface RequestOptions {
  readonly venue: VenueId;
  readonly url: string;
  readonly method?: "GET" | "POST";
  // POST only: sent as application/json.
  readonly body?: unknown;
  // Absolute time on deps.nowMs.
  readonly deadlineAtMs?: number;
  // HTTP statuses that mean "no such thing" for this call (some venues answer 4xx or 5xx for an unknown id).
  readonly notFoundStatuses?: readonly number[];
}

function statusToFailure(venue: VenueId, status: number, notFound: readonly number[]): AdapterFailure {
  if (notFound.includes(status)) return new AdapterFailure(venue, "NOT_FOUND", `http_${status}`);
  if (status === 429) return new AdapterFailure(venue, "RATE_LIMITED", "http_429");
  if (status === 404) return new AdapterFailure(venue, "NOT_FOUND", "http_404");
  if (status === 408 || status === 504) return new AdapterFailure(venue, "TIMEOUT", `http_${status}`);
  if (status >= 500) return new AdapterFailure(venue, "VENUE_PAUSED", `http_${status}`);
  return new AdapterFailure(venue, "SCHEMA_DRIFT", `http_${status}`);
}

export async function requestJson(deps: AdapterDeps, options: RequestOptions): Promise<unknown> {
  const { venue, url } = options;
  const now = deps.nowMs();
  const deadline = options.deadlineAtMs ?? now + DEFAULT_TIMEOUT_MS;
  const remaining = deadline - now;
  if (remaining <= 0) throw new AdapterFailure(venue, "TIMEOUT", "deadline_passed");

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AdapterFailure(venue, "TIMEOUT", "deadline"));
    }, remaining);
  });

  const method = options.method ?? "GET";
  const init =
    method === "POST"
      ? { method, headers: { "content-type": "application/json" }, body: JSON.stringify(options.body ?? {}), signal: controller.signal }
      : { method, signal: controller.signal };

  const work = (async (): Promise<unknown> => {
    let response;
    try {
      response = await deps.fetch(url, init);
    } catch {
      // Network failure, CORS refusal or abort: the venue gave no answer.
      throw new AdapterFailure(venue, "TIMEOUT", "no_response");
    }
    if (!response.ok) throw statusToFailure(venue, response.status, options.notFoundStatuses ?? []);
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new AdapterFailure(venue, "TIMEOUT", "body_unreadable");
    }
    if (text.length > MAX_BODY_CHARS) throw new AdapterFailure(venue, "SCHEMA_DRIFT", "body_too_large");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AdapterFailure(venue, "SCHEMA_DRIFT", "invalid_json");
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
