// The transport contract between a venue reader and the host that injects its fetch (docs/dapp-design.md 4.8 R1,
// R9 and R10). The host's fetch (the dApp's guarded fetch, the Cockpit's proxy fetch, a server fetch) refuses or
// fails with a FetchError carrying a stable code; a reader maps that, or an unexpected HTTP status, onto the closed
// AdapterError set. Pure: no clock (the caller passes nowMs), no network, no global.

import type { AdapterError } from "../model.js";
import type { ReadService } from "./origins.js";

// Retry-After is honoured up to a day; anything longer is treated as a day.
export const MAX_RETRY_AFTER_MS = 86_400_000;

// ---- errors ----------------------------------------------------------------------------------------------------------------------

export const FETCH_ERROR_CODES = [
  "unsafe_url", // not https, has credentials or a port, or a path or query the proxy would refuse
  "origin_not_allowed", // host is not on the closed list for this build
  "needs_cockpit", // a daemon-only host asked of the standalone build: the UI shows "needs the Cockpit"
  "method_not_allowed", // a POST that is not a known read
  "rpc_method_not_allowed", // a JSON-RPC method that is not read-only
  "body_too_large", // request body over the limit
  "timeout",
  "aborted", // the caller cancelled
  "network", // the request failed before any answer
  "redirect", // the upstream answered with a redirect; never followed
  "too_large", // response over the size cap
  "not_json",
  "paused", // R9 pause or Retry-After cooldown for this host
  "throttled", // the local token bucket would make the caller wait too long
  "unauthorized", // Cockpit fetch without a token
  "bridge", // the daemon answered with its own error (bridgeCode says which)
  "bad_envelope", // the daemon's read-proxy answer is not the contract's envelope
] as const;
export type FetchErrorCode = (typeof FETCH_ERROR_CODES)[number];

export class FetchError extends Error {
  readonly code: FetchErrorCode;
  readonly service: ReadService | null;
  // The daemon's BridgeErrorCode when code is "bridge".
  readonly bridgeCode: string | null;
  readonly retryAfterMs: number | null;
  constructor(code: FetchErrorCode, message: string, extra: { service?: ReadService | null; bridgeCode?: string | null; retryAfterMs?: number | null } = {}) {
    super(message);
    this.name = "FetchError";
    this.code = code;
    this.service = extra.service ?? null;
    this.bridgeCode = extra.bridgeCode ?? null;
    this.retryAfterMs = extra.retryAfterMs ?? null;
  }
}

export function isFetchError(value: unknown): value is FetchError {
  return value instanceof FetchError;
}

export function isNeedsCockpit(value: unknown): boolean {
  return isFetchError(value) && value.code === "needs_cockpit";
}

// Daemon codes that mean "this venue is off or paused" rather than "your request was wrong".
const BRIDGE_PAUSED = new Set(["venue_paused", "venue_disabled"]);

// FetchError -> the closed adapter set. Null for an error that is not a FetchError (the caller decides).
export function adapterErrorOfFetch(error: unknown): AdapterError | null {
  if (!isFetchError(error)) return null;
  switch (error.code) {
    case "timeout":
    case "network":
      return "TIMEOUT";
    case "throttled":
      return "RATE_LIMITED";
    case "paused":
      return "VENUE_PAUSED";
    case "needs_cockpit":
    case "origin_not_allowed":
    case "method_not_allowed":
    case "rpc_method_not_allowed":
    case "unsafe_url":
    case "unauthorized":
      return "NOT_SUPPORTED";
    case "bridge":
      if (error.bridgeCode === "upstream_timeout") return "TIMEOUT";
      // The daemon's own per-service limit: slow down, as for the page's local bucket. Not "unsupported".
      if (error.bridgeCode === "rate_limited") return "RATE_LIMITED";
      if (error.bridgeCode !== null && BRIDGE_PAUSED.has(error.bridgeCode)) return "VENUE_PAUSED";
      return "NOT_SUPPORTED";
    case "too_large":
    case "not_json":
    case "bad_envelope":
    case "redirect":
      return "SCHEMA_DRIFT";
    case "aborted":
    case "body_too_large":
      return "TIMEOUT";
  }
}

// An upstream HTTP status the adapter did not expect, as an adapter error.
export function adapterErrorOfStatus(status: number): AdapterError {
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status === 401 || status === 403) return "VENUE_PAUSED";
  if (status >= 500) return "TIMEOUT";
  return "SCHEMA_DRIFT";
}

// The Retry-After header: delay-seconds or an HTTP date. Anything else is null. Capped at 24 hours.
export function parseRetryAfterMs(header: string | null | undefined, nowMs: number): number | null {
  if (header === null || header === undefined) return null;
  const text = header.trim();
  if (/^[0-9]{1,12}$/.test(text)) return Math.min(Number(text) * 1000, MAX_RETRY_AFTER_MS);
  if (text.length > 64 || !/^[A-Za-z]{3},/.test(text)) return null;
  const date = Date.parse(text);
  if (!Number.isFinite(date)) return null;
  return Math.min(Math.max(date - nowMs, 0), MAX_RETRY_AFTER_MS);
}
