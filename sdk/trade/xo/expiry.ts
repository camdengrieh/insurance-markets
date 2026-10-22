import { SigningError } from "./errors.js";

// A signed order carries no timestamp, so the signature is a bearer instrument: anyone holding
// it can submit it until it expires. expiration = 0 means it never does, and so, in practice,
// does an expiration in the year 10^13. These helpers refuse 0 unless the caller says so by name,
// keep GTD expirations in the future, and cap the lifetime at DEFAULT_MAX_TTL_SECONDS unless the
// caller names a larger maximum. The minimum stays opt-in. The exchange sweeps expired GTD orders
// about every 10 seconds, so the bound is soft by up to that much (docs/research/07 D14).

// One hour: the same ceiling as CEILINGS.orderExpirySeconds in src/config.ts.
export const DEFAULT_MAX_TTL_SECONDS = 3600;

// Order lifetime rules (docs/phase1-gap-closing.md OR2, OR17, section 5.2; docs/research/22 h.3, A17):
//   - the default lifetime is 300 s, counted from the XO clock (`GET /time`), which clears a
//     Polymarket-style 3-minute floor with margin; the gateway's real minimum is NOT ESTABLISHABLE
//     WITHOUT A LIVE ORDER, so shorter is something to learn from a rejection, not to assume;
//   - when an order is submitted at least 90 s of its life must remain, so an approval that took long
//     cannot turn into an order that dies before it is matched. A prepared item that waited too long is
//     refused and prepared again;
//   - the expiration is a whole number of seconds and is never 0 (0 means "never", a bearer order).
export const DEFAULT_ORDER_TTL_SECONDS = 300;
export const MIN_REMAINING_TTL_SECONDS = 90;

export type GtdOptions = {
  allowNeverExpires?: boolean;
  minTtlSeconds?: number;
  maxTtlSeconds?: number;
};

function assertSeconds(value: unknown, label: string): bigint {
  if (typeof value === "bigint") {
    if (value < 1n) throw new SigningError("invalid_expiration", `${label} must be a positive integer`);
    return value;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new SigningError("invalid_expiration", `${label} must be a positive integer`);
  }
  return BigInt(value);
}

// The maximum in force: the caller's, or the compiled-in default.
function effectiveMaxTtl(options: GtdOptions): number {
  return options.maxTtlSeconds ?? DEFAULT_MAX_TTL_SECONDS;
}

function assertBounds(options: GtdOptions): void {
  for (const [label, bound] of [["minTtlSeconds", options.minTtlSeconds], ["maxTtlSeconds", options.maxTtlSeconds]] as const) {
    if (bound !== undefined && (!Number.isSafeInteger(bound) || bound < 1)) {
      throw new SigningError("invalid_expiration", `${label} must be a positive integer`);
    }
  }
  if (options.minTtlSeconds !== undefined && options.minTtlSeconds > effectiveMaxTtl(options)) {
    throw new SigningError("invalid_expiration", "minTtlSeconds must not exceed maxTtlSeconds");
  }
}

// Checks an expiration against the clock. Returns it unchanged when acceptable.
export function assertGtdExpiration(expiration: bigint, nowSeconds: number | bigint, options: GtdOptions = {}): bigint {
  assertBounds(options);
  if (typeof expiration !== "bigint" || expiration < 0n) {
    throw new SigningError("invalid_expiration", "expiration must be a non-negative bigint");
  }
  if (expiration === 0n) {
    if (options.allowNeverExpires === true) return 0n;
    throw new SigningError(
      "never_expiring_order",
      "expiration 0 makes a never-expiring bearer order; set allowNeverExpires to permit it",
    );
  }
  const now = assertSeconds(nowSeconds, "nowSeconds");
  const ttl = expiration - now;
  if (ttl < 1n) {
    throw new SigningError("invalid_expiration", "expiration is not in the future");
  }
  if (options.minTtlSeconds !== undefined && ttl < BigInt(options.minTtlSeconds)) {
    throw new SigningError("invalid_expiration", "expiration is sooner than minTtlSeconds");
  }
  if (ttl > BigInt(effectiveMaxTtl(options))) {
    throw new SigningError("invalid_expiration", "expiration is later than maxTtlSeconds");
  }
  return expiration;
}

// now + ttl as unix seconds. ttlSeconds 0 would mean "never"; it is refused without the flag. Leaving
// the TTL out gives the default of 300 s.
export function gtdExpirationFromTtl(
  nowSeconds: number | bigint,
  ttlSeconds: number = DEFAULT_ORDER_TTL_SECONDS,
  options: GtdOptions = {},
): bigint {
  if (ttlSeconds === 0) {
    if (options.allowNeverExpires === true) return 0n;
    throw new SigningError(
      "never_expiring_order",
      "a TTL of 0 makes a never-expiring bearer order; set allowNeverExpires to permit it",
    );
  }
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new SigningError("invalid_expiration", "ttlSeconds must be a positive integer");
  }
  const expiration = assertSeconds(nowSeconds, "nowSeconds") + BigInt(ttlSeconds);
  return assertGtdExpiration(expiration, nowSeconds, options);
}

// Whole unix seconds from a millisecond clock reading, rounded down. A fractional second never ends
// up in a signed expiration.
export function wholeSeconds(nowMs: number): bigint {
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs) || nowMs < 0) {
    throw new SigningError("invalid_expiration", "the clock reading must be a non-negative number of milliseconds");
  }
  return BigInt(Math.floor(nowMs / 1000));
}

// The expiration for an order prepared now with the default lifetime.
export function defaultGtdExpiration(nowSeconds: number | bigint, options: GtdOptions = {}): bigint {
  return gtdExpirationFromTtl(nowSeconds, DEFAULT_ORDER_TTL_SECONDS, options);
}

// The check at submit: the expiration is set (never 0, with no opt-out), in whole seconds, and at
// least `minRemainingSeconds` (default 90) are left. Returns the seconds remaining.
export function assertRemainingTtl(
  expiration: bigint,
  nowSeconds: number | bigint,
  minRemainingSeconds: number = MIN_REMAINING_TTL_SECONDS,
): bigint {
  if (typeof expiration !== "bigint" || expiration < 0n) {
    throw new SigningError("invalid_expiration", "expiration must be a non-negative bigint");
  }
  if (expiration === 0n) {
    throw new SigningError("never_expiring_order", "expiration 0 makes a never-expiring bearer order; GTD orders always expire");
  }
  if (!Number.isSafeInteger(minRemainingSeconds) || minRemainingSeconds < 1) {
    throw new SigningError("invalid_expiration", "minRemainingSeconds must be a positive integer");
  }
  const remaining = expiration - assertSeconds(nowSeconds, "nowSeconds");
  if (remaining < BigInt(minRemainingSeconds)) {
    throw new SigningError(
      "invalid_expiration",
      remaining < 1n ? "the order has already expired" : `less than ${minRemainingSeconds} seconds of the order's life remain`,
    );
  }
  return remaining;
}
