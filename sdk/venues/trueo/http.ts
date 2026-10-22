import { parseRetryAfterMs } from "../transport.js";
import { isAdapterException } from "../errors.js";
import type { AdapterDeps } from "../../model.js";
import { TRUEO_MAX_BODY_CHARS } from "./constants.js";
import { AdapterFailure } from "./errors.js";

// One JSON-RPC POST through the injected fetch, with a deadline, a body cap and a fixed mapping from transport
// outcomes to AdapterError. The adapter never reads a global fetch and never sets Origin, Referer or
// User-Agent. The only header is the content type JSON-RPC needs; it makes a browser send a CORS preflight, which
// the public RPC hosts answer (research 26 section C9).

export const DEFAULT_TIMEOUT_MS = 15_000;
export const FORBIDDEN_PAUSE_MS = 10 * 60_000;

// Epoch milliseconds are above 1e12 from 2001 to 2286. A smaller number cannot be an absolute deadline, so it
// is read as a duration from now.
export function resolveDeadline(deadlineMs: number | undefined, nowMs: number, fallbackMs = DEFAULT_TIMEOUT_MS): number {
  if (deadlineMs === undefined || !Number.isFinite(deadlineMs) || deadlineMs <= 0) return nowMs + fallbackMs;
  return deadlineMs < 1e12 ? nowMs + deadlineMs : deadlineMs;
}

function statusToFailure(status: number, retryAfterMs: number | null): AdapterFailure {
  if (status === 429) return new AdapterFailure("trueo", "RATE_LIMITED", "http_429", retryAfterMs);
  if (status === 403) return new AdapterFailure("trueo", "VENUE_PAUSED", "http_403", retryAfterMs ?? FORBIDDEN_PAUSE_MS);
  if (status === 408 || status === 504) return new AdapterFailure("trueo", "TIMEOUT", `http_${status}`);
  if (status === 404) return new AdapterFailure("trueo", "NOT_FOUND", "http_404");
  if (status >= 500) return new AdapterFailure("trueo", "VENUE_PAUSED", `http_${status}`, retryAfterMs);
  return new AdapterFailure("trueo", "SCHEMA_DRIFT", `http_${status}`);
}

export async function postJson(deps: AdapterDeps, url: string, body: unknown, deadlineAtMs: number): Promise<unknown> {
  const now = deps.nowMs();
  const remaining = deadlineAtMs - now;
  if (remaining <= 0) throw new AdapterFailure("trueo", "TIMEOUT", "deadline_passed");

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AdapterFailure("trueo", "TIMEOUT", "deadline"));
    }, remaining);
  });

  const work = (async (): Promise<unknown> => {
    let response;
    try {
      response = await deps.fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    } catch (error) {
      // A fetch layer that already speaks AdapterException (the Cockpit's proxy mapper) is passed through.
      if (isAdapterException(error)) throw error;
      throw new AdapterFailure("trueo", "TIMEOUT", "no_response");
    }
    if (!response.ok) throw statusToFailure(response.status, parseRetryAfterMs(response.headers.get("retry-after"), deps.nowMs()));
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new AdapterFailure("trueo", "TIMEOUT", "body_unreadable");
    }
    if (text.length > TRUEO_MAX_BODY_CHARS) throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "body_too_large");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "invalid_json");
    }
  })();
  work.catch(() => undefined);

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
