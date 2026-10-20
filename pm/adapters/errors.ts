// Adapter failure type and the one place transport errors are translated into the closed
// AdapterError vocabulary of pm/types.ts (docs/aggregation-design.md 2.4).
//
// Upstream bodies are attacker-influenced, so a detail string here is built from our own fixed
// text, field paths and status codes only. It never carries upstream text.

import type { AdapterError } from "../types.js";
import { XoError } from "../../src/xo/http.js";

export class AdapterFailure extends Error {
  readonly code: AdapterError;
  readonly detail: string;

  constructor(code: AdapterError, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "AdapterFailure";
    this.code = code;
    this.detail = detail;
  }
}

export function fail(code: AdapterError, detail: string): never {
  throw new AdapterFailure(code, detail);
}

// The shared transport (src/xo/http.ts) throws XoError. Mapping:
//   timeout          TIMEOUT
//   rate_limited     RATE_LIMITED
//   not_found        NOT_FOUND
//   invalid_response SCHEMA_DRIFT (not JSON, too large, bad UTF-8)
//   blocked          NOT_SUPPORTED (host not allowed, request budget spent, bad URL)
//   upstream_error   VENUE_PAUSED (5xx, 403, network failure: the venue is not giving us data)
//   invalid_input    NOT_SUPPORTED
export function toAdapterFailure(error: unknown): AdapterFailure {
  if (error instanceof AdapterFailure) return error;
  if (error instanceof XoError) {
    const status = error.status === undefined ? "" : ` (HTTP ${error.status})`;
    switch (error.kind) {
      case "timeout":
        return new AdapterFailure("TIMEOUT", `request timed out${status}`);
      case "rate_limited":
        return new AdapterFailure("RATE_LIMITED", `rate limited${status}`);
      case "not_found":
        return new AdapterFailure("NOT_FOUND", `not found${status}`);
      case "invalid_response":
        // XoError.message for this kind is built from our own text (path and problem names).
        return new AdapterFailure("SCHEMA_DRIFT", error.message);
      case "blocked":
        return new AdapterFailure("NOT_SUPPORTED", error.message);
      case "invalid_input":
        return new AdapterFailure("NOT_SUPPORTED", error.message);
      case "upstream_error":
        return new AdapterFailure("VENUE_PAUSED", `upstream unavailable${status}`);
    }
  }
  return new AdapterFailure("SCHEMA_DRIFT", "unexpected error while reading the venue response");
}
