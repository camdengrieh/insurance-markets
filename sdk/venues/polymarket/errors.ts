import { AdapterException } from "../errors.js";
import type { AdapterError } from "../../model.js";

// Every failure the adapter reports. The port's listMarkets, getMarket, getFeeSpec and health return values, not
// Results, so they throw this (an AdapterException, the class core/ catches); getBooks returns the code inside a
// Result. The message is fixed text built from the route's name and the HTTP status. It never carries a response
// body (third-party text), a URL query or an address, because errors are logged and shown.

export class PolymarketError extends AdapterException {
  readonly route: string;
  readonly status: number | undefined;

  constructor(
    code: AdapterError,
    route: string,
    detail: string,
    extra: { status?: number; retryAfterMs?: number | null; cause?: unknown } = {},
  ) {
    super(code, `polymarket ${route}: ${code}: ${detail}`, extra.retryAfterMs ?? null);
    this.name = "PolymarketError";
    this.route = route;
    this.status = extra.status;
    // The underlying transport error (a FetchError), so a caller can still ask core's isNeedsCockpit(error.cause).
    if (extra.cause !== undefined) this.cause = extra.cause;
  }
}

export function isPolymarketError(value: unknown): value is PolymarketError {
  return value instanceof PolymarketError;
}

// The port code for any thrown value; anything not ours is reported as drift, never swallowed.
export function codeOf(error: unknown): AdapterError {
  return error instanceof AdapterException ? error.code : "SCHEMA_DRIFT";
}

export function drift(route: string, detail: string): PolymarketError {
  return new PolymarketError("SCHEMA_DRIFT", route, detail);
}
