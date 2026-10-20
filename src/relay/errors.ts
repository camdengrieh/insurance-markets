// Stable error codes shared by the plugin and the relay (docs/phase1-gap-closing.md section 5.4,
// invariant 7, plus the Wave 0 additions below). A code never changes meaning once it is listed
// here: tools, tests and the relay all compare against these strings, never against message text.
//
// This file has no imports, so it stays portable (the plugin bundle and the relay both use it).

export const ERROR_CODES = [
  // Invariant 7.
  "owner_mismatch", // the signature recovers to someone other than the owner
  "stale_nonce", // the account nonce moved since prepare
  "expired", // the prepared item (or the order it holds) is out of time
  "cap_exceeded", // per-order, daily, funding or seed cap
  "kill_switch", // KILL is on: every write is refused
  "flag_off", // the feature flag for this write path is off (the default)
  "capability_unknown", // a fact this step depends on is not recorded yet (fail closed)
  "upstream_requires_key", // an XO host answered 401 or 403; the relay never looks for a key
  "upstream_rejected", // an XO host refused the request; details carry its code and sanitised text
  "ambiguous", // the outcome of a send is unknown; reconcile, never resend
  // Wave 0 additions named by the task.
  "relay_not_configured", // XO_RELAY_URL / XO_RELAY_KEY are missing or invalid (plugin side)
  "tripwire", // a pinned on-chain property changed; the relay is read-only
  "pending", // accepted, still in flight; poll the status route
  // Needed by every handler and by the transport, listed now so no stream invents its own.
  "invalid_request", // schema or semantic validation failed
  "unauthorized", // missing or wrong X-Relay-Key, or a disallowed Host or Origin
  "not_found", // unknown route, prepared_id, order or user operation
  "rate_limited", // too many requests (relay or upstream)
  "not_implemented", // the route exists in the contract but no handler is registered yet
  "account_mismatch", // a caller-supplied account differs from the one derived from the owner
  "signature_invalid", // the signature is malformed or fails the digest recomputation
  "prepared_used", // the prepared item was already submitted (single use)
  "precondition_failed", // account state or an earlier step is missing; details say which
  "internal", // a bug or an unreadable store; never carries upstream text
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(ERROR_CODES);

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && CODE_SET.has(value);
}

// HTTP status the relay uses for each code. The plugin never relies on the status alone; the
// body's code is authoritative. `pending` is not an error for the caller, so it maps to 202.
export const ERROR_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = Object.freeze({
  owner_mismatch: 403,
  stale_nonce: 409,
  expired: 410,
  cap_exceeded: 422,
  kill_switch: 503,
  flag_off: 403,
  capability_unknown: 422,
  upstream_requires_key: 502,
  upstream_rejected: 502,
  ambiguous: 409,
  relay_not_configured: 503,
  tripwire: 503,
  pending: 202,
  invalid_request: 400,
  unauthorized: 401,
  not_found: 404,
  rate_limited: 429,
  not_implemented: 501,
  account_mismatch: 403,
  signature_invalid: 422,
  prepared_used: 409,
  precondition_failed: 422,
  internal: 500,
});

export type ErrorDetails = Readonly<Record<string, string | number | boolean | null | readonly string[]>>;

export interface RelayErrorBody {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: ErrorDetails;
}

const MAX_MESSAGE_CHARS = 500;

// The one error type handlers throw. The message must be fixed text written by this project:
// never an upstream body, never market text (a title goes through marketTitleSlot in contract.ts).
export class RelayError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails | undefined;

  constructor(code: ErrorCode, message: string, details?: ErrorDetails) {
    super(message.length > MAX_MESSAGE_CHARS ? `${message.slice(0, MAX_MESSAGE_CHARS - 1)}…` : message);
    this.name = "RelayError";
    this.code = code;
    this.details = details;
  }

  get httpStatus(): number {
    return ERROR_HTTP_STATUS[this.code];
  }

  toBody(): RelayErrorBody {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}

export function relayError(code: ErrorCode, message: string, details?: ErrorDetails): RelayError {
  return new RelayError(code, message, details);
}

export function isRelayError(value: unknown): value is RelayError {
  return value instanceof RelayError;
}

// Anything that is not a RelayError becomes `internal` with fixed text, so a stray exception can
// never put a secret or an upstream body on the wire.
export function toRelayErrorBody(error: unknown): RelayErrorBody {
  return isRelayError(error)
    ? error.toBody()
    : { code: "internal", message: "The relay failed unexpectedly. Nothing was sent." };
}
