// One mapping from "something went wrong while reading" to the closed AdapterError set the tiles have words
// for. Adapters throw different error classes (core AdapterException, FetchError from the app's fetch, the XO
// adapter's own, per-venue AdapterFailure). They all carry a `code` from the port's closed list, so this reads
// the code and nothing else: an error's message can contain upstream text and is never read, kept or shown.

import { isFetchError, adapterErrorOfFetch } from "../../core/fetch";
import type { AdapterError } from "../../core/ports";

const CODES: ReadonlySet<string> = new Set<AdapterError>(["RATE_LIMITED", "STALE", "NOT_SUPPORTED", "SCHEMA_DRIFT", "VENUE_PAUSED", "NOT_FOUND", "TIMEOUT", "EMPTY_BOOK"]);

export interface Failure {
  // "UNKNOWN" when the error is not one the app knows: shown as a generic failure, never guessed at.
  readonly code: AdapterError | "UNKNOWN";
  // The host is reachable only through the local Cockpit (a blocked-in-browsers venue), which is different
  // from "the venue is down".
  readonly needsCockpit: boolean;
  // The Cockpit build has no (valid) session token: the page is not paired, or its session ended. Different from
  // "the venue refused", and the fix is on the user's side.
  readonly unauthorized: boolean;
  readonly retryAfterMs: number | null;
}

export function failureOf(error: unknown): Failure {
  if (isFetchError(error)) {
    const mapped = adapterErrorOfFetch(error);
    return { code: mapped ?? "UNKNOWN", needsCockpit: error.code === "needs_cockpit", unauthorized: error.code === "unauthorized" || (error.code === "bridge" && error.bridgeCode === "unauthorized"), retryAfterMs: error.retryAfterMs };
  }
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; retryAfterMs?: unknown };
    if (typeof candidate.code === "string" && CODES.has(candidate.code)) {
      const wait = typeof candidate.retryAfterMs === "number" && Number.isFinite(candidate.retryAfterMs) && candidate.retryAfterMs >= 0 ? candidate.retryAfterMs : null;
      return { code: candidate.code as AdapterError, needsCockpit: false, unauthorized: false, retryAfterMs: wait };
    }
  }
  return { code: "UNKNOWN", needsCockpit: false, unauthorized: false, retryAfterMs: null };
}

export function isAdapterErrorCode(value: unknown): value is AdapterError {
  return typeof value === "string" && CODES.has(value);
}
