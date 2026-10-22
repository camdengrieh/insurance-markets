import { adapterErrorOfFetch } from "../transport.js";
import type { AdapterDeps, FetchResponseLike } from "../../model.js";
import { XoAdapterError } from "./errors.js";

// One GET, one JSON value, one closed set of failures. Used for both XO hosts.
//
// - GET only, no body, no credential, one header (accept is CORS-safelisted; a custom user-agent would not be,
//   so the page never sets one and the daemon's proxy sets its own).
// - Failures become XoAdapterError with a fixed reason. Upstream text is never copied into an error.
// - The body is read as text and bounded before JSON.parse, so an oversized or hostile body costs one string.

export const MAX_BODY_CHARS = 2 * 1024 * 1024;
export const DEFAULT_REQUEST_TIMEOUT_MS = 8000;
const MAX_RETRY_AFTER_MS = 10 * 60 * 1000;

function retryAfterMs(headers: FetchResponseLike["headers"]): number | undefined {
  const raw = headers.get("retry-after");
  // Delta-seconds only. An HTTP-date is not trusted: it would need a clock comparison against the venue's.
  if (raw === null || !/^[0-9]{1,6}$/.test(raw.trim())) return undefined;
  return Math.min(Number(raw.trim()) * 1000, MAX_RETRY_AFTER_MS);
}

function errorForStatus(response: FetchResponseLike): XoAdapterError {
  const status = response.status;
  if (status === 404) return new XoAdapterError("NOT_FOUND", "http_404", { status });
  if (status === 429) {
    const wait = retryAfterMs(response.headers);
    return new XoAdapterError("RATE_LIMITED", "http_429", wait === undefined ? { status } : { status, retryAfterMs: wait });
  }
  // dapp-design R9: any 403 pauses the venue; nothing retries around it.
  if (status === 403) return new XoAdapterError("VENUE_PAUSED", "http_403", { status });
  // A server error is the venue (or the daemon's proxy) not answering. It is not a pause: nothing was refused, so the
  // screen must not say "refused repeated requests" (it says the venue did not answer, like every other reader).
  if (status >= 500) return new XoAdapterError("TIMEOUT", "http_5xx", { status });
  return new XoAdapterError("SCHEMA_DRIFT", "http_unexpected_status", { status });
}

export async function getJson(deps: AdapterDeps, url: string, timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS): Promise<unknown> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new XoAdapterError("TIMEOUT", "no_time_left");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new XoAdapterError("TIMEOUT", "deadline"));
    }, timeoutMs);
  });
  const work = (async (): Promise<unknown> => {
    let response: FetchResponseLike;
    try {
      response = await deps.fetch(url, { method: "GET", headers: { accept: "application/json" }, signal: controller.signal });
    } catch (error) {
      // A thrown fetch is a network, CORS, CSP or proxy failure. The shared fetch layer's own codes keep their
      // meaning (a local pause is VENUE_PAUSED, a throttle RATE_LIMITED); anything else is "did not answer".
      throw new XoAdapterError(adapterErrorOfFetch(error) ?? "TIMEOUT", "network");
    }
    if (!response.ok) throw errorForStatus(response);
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new XoAdapterError("TIMEOUT", "network");
    }
    if (text.length > MAX_BODY_CHARS) throw new XoAdapterError("SCHEMA_DRIFT", "body_too_large");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new XoAdapterError("SCHEMA_DRIFT", "not_json");
    }
  })();
  // If the deadline wins, the late result of `work` must not become an unhandled rejection.
  work.catch(() => undefined);
  try {
    return await Promise.race([work, expired]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
