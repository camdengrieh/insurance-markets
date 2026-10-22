// Error bodies the mock serves. One place, so the read mock and the write mock agree on the text.
//
// Basis of each body:
//   fixture    recorded in sdk/venues/xo/fixtures (live GET)
//   docs       quoted from the XO docs or OpenAPI (docs/research/01, 02, 03); the exact live text is M
//   synthetic  invented by this mock because the real service's body was never observed; labelled M
//
// The orderbook's errors are {"error": "<text>"}. The Data API (NestJS) has two shapes, a validation
// shape and a NotFound shape that echoes the request path and query (the echo is attacker-influenced
// text on the real service, and tests rely on it being reproduced).

import type { MockReply } from "./listener.js";

export type ErrorBasis = "fixture" | "docs" | "synthetic";

const reply = (status: number, json: unknown, headers?: Record<string, string>): MockReply => ({
  status,
  json,
  ...(headers === undefined ? {} : { headers }),
});

// ---- orderbook (orderbooks.xo.market) --------------------------------------------------------------

// The Rust integer parser's complaint about a token id that is not a decimal number. Only the "digit 10"
// form is recorded (fixture orderbook-error-400-bad-token); the other texts are the parser's standard
// messages, labelled M.
export function badTokenIdText(raw: string): string {
  if (raw.length === 0) return "invalid token_id: cannot parse integer from empty string";
  for (const char of raw) {
    if (char >= "0" && char <= "9") continue;
    // A letter is read as a base-36 digit ("a" is 10), which is how "digit 10" arises in the recording.
    if (/^[a-zA-Z]$/.test(char)) return `invalid token_id: digit ${String(parseInt(char, 36))} is out of range for base 10`;
    return "invalid token_id: invalid digit found in string";
  }
  return "invalid token_id: invalid digit found in string";
}

export const orderbookErrors = {
  // 400 on a token id that is not decimal digits (basis: fixture for "digit 10", otherwise synthetic).
  badTokenId: (raw: string): MockReply => reply(400, { error: badTokenIdText(raw) }),
  // 400 on a decimal token id of 2^256 or more (synthetic).
  tokenIdTooLarge: (): MockReply => reply(400, { error: "invalid token_id: number too large to fit in target type" }),
  // 400 on a missing required query parameter: plain text, as observed live (docs/research/02 V12).
  missingParameter: (name: string): MockReply => ({ status: 400, text: `Failed to deserialize query string: missing field \`${name}\`` }),
  // 400 on an address that is not 0x plus 40 hex digits (synthetic).
  badAddress: (): MockReply => reply(400, { error: "invalid address" }),
  // 400 on a side that is not BUY or SELL (synthetic).
  badSide: (): MockReply => reply(400, { error: "invalid side: expected BUY or SELL" }),
  // 400 on an off-tick price (docs: "invalid price tick"). Write path.
  invalidTick: (): MockReply => reply(400, { error: "invalid price tick" }),
  // 400 on a resting duplicate (docs OpenAPI Error400). Write path.
  duplicateOrder: (): MockReply => reply(400, { error: "duplicate order: same signed-payload hash is already resting" }),
  // 401 without L2 credentials (fixture orderbook-error-401-orders).
  l2Required: (): MockReply => reply(401, { error: "HMAC L2 credentials required" }),
  // 401 without L1 credentials (synthetic: the live text was never observed).
  l1Required: (): MockReply => reply(401, { error: "L1 authentication required" }),
  // 404 for a token with no book (fixture orderbook-error-404-book-unknown-token).
  noBook: (): MockReply => reply(404, { error: "No orderbook exists for the requested token id" }),
  // 404 for an unknown market: the body is the requested condition id (fixture orderbook-error-404-market-unknown).
  unknownMarket: (conditionId: string): MockReply => reply(404, { error: conditionId }),
  // 404 for a route the mock does not serve (synthetic).
  routeNotFound: (): MockReply => reply(404, { error: "route not found" }),
  // 422 business-rule failures (docs; write path). The numbers are the docs' illustrative ones.
  marketNotActive: (status: string): MockReply => reply(422, { error: `market is not active (status: ${status})` }),
  insufficientBalance: (): MockReply => reply(422, { error: "insufficient balance" }),
  insufficientPosition: (): MockReply => reply(422, { error: "insufficient position" }),
  sizeBelowMinimum: (min: string, got: string): MockReply => reply(422, { error: `size below minimum: min ${min}, got ${got}` }),
  notionalBelowMinimum: (min: string, got: string): MockReply => reply(422, { error: `notional below minimum: min ${min}, got ${got}` }),
  // 429 with retry_after_ms (docs: {"error":"rate limit exceeded","retry_after_ms":387}); the Retry-After
  // header in whole seconds is added as well so a client that reads either one gets the hint.
  rateLimited: (retryAfterMs: number): MockReply =>
    reply(429, { error: "rate limit exceeded", retry_after_ms: retryAfterMs }, { "retry-after": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) }),
  // 503 while trading is paused (docs: 503 trading_paused with Retry-After: 60). Write path.
  tradingPaused: (): MockReply => reply(503, { error: "trading_paused" }, { "retry-after": "60" }),
  // 501 for a surface the mock has not built yet. The label is what a failing test reads.
  notBuilt: (what: string): MockReply => reply(501, { error: `mock: ${what} is not built yet (TODO-for-mock-write)` }),
  serverError: (): MockReply => reply(503, { error: "upstream unavailable" }),
} as const;

// ---- Data API (api-mainnet.xo.market) ---------------------------------------------------------------------------

export const dataApiErrors = {
  // 400 for take above the observed limit (fixture data-error-400-take-over-max).
  takeOverMax: (): MockReply => reply(400, { statusCode: 400, message: ["validations.MAXIMUM_NOT_OBSERVED"], error: "Bad Request" }),
  // 400 for a malformed parameter (synthetic, same NestJS validation shape).
  invalidParameter: (code: string): MockReply => reply(400, { statusCode: 400, message: [code], error: "Bad Request" }),
  // 404 for a market (fixture data-error-404-market): echoes the request path.
  marketNotFound: (path: string, timestamp: string): MockReply =>
    reply(404, { statusCode: 404, timestamp, path, resource: "Market", details: { message: "Market not found" }, name: "ResourceNotFoundError" }),
  // 404 for an address with no profile (fixture data-error-404-user-portfolio): echoes path and query.
  userNotFound: (pathWithQuery: string, timestamp: string): MockReply =>
    reply(404, {
      statusCode: 404,
      timestamp,
      path: pathWithQuery,
      response: { message: "User not found", error: "Not Found", statusCode: 404 },
      status: 404,
      options: {},
      message: "User not found",
      name: "NotFoundException",
    }),
  // 429 (body shape observed once live, 3 of about 250 requests, and recorded in docs/research/02; no fixture file).
  rateLimited: (timestamp: string, retryAfterMs: number): MockReply =>
    reply(429, { statusCode: 429, message: "Rate limit exceeded", error: "Too Many Requests", timestamp }, { "retry-after": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) }),
  routeNotFound: (path: string, timestamp: string): MockReply =>
    reply(404, { statusCode: 404, timestamp, path, message: `Cannot GET ${path}`, error: "Not Found" }),
  serverError: (): MockReply => reply(503, { statusCode: 503, message: "Service Unavailable", error: "Service Unavailable" }),
} as const;

// ---- JSON-RPC ----------------------------------------------------------------------------------------------------------------

export const JSON_RPC = Object.freeze({
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  // Provider-defined: "limit exceeded" / key required.
  limitExceeded: -32005,
  keyRequired: -32001,
});

export type RpcId = string | number | null;

export function rpcError(id: RpcId, code: number, message: string, data?: unknown): { jsonrpc: "2.0"; id: RpcId; error: { code: number; message: string; data?: unknown } } {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

export function rpcResult(id: RpcId, result: unknown): { jsonrpc: "2.0"; id: RpcId; result: unknown } {
  return { jsonrpc: "2.0", id, result };
}
