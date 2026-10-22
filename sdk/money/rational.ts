// Exact rational arithmetic on bigint. The engine needs products of prices, sizes, fee rates and
// day fractions, so a single fixed scale is not enough; a reduced fraction never loses a digit.
// No floating point anywhere: decimals enter through the strict money grammar of
// sdk/money/amount.ts (over decimal.ts) and leave through explicit, directed rounding (decimal.ts roundDiv).
//
// Signed decimal strings ("-0.0152") are only ever produced here for results (edges can be
// negative). Input decimals stay unsigned `Dec` strings (sdk/model.ts).

import { formatAtomic, parseDecimalAtomic, type ParseResult } from "./amount.js";
import { pow10, roundDiv, type RoundMode } from "./decimal.js";
import type { Fixed } from "./fixed.js";

export { roundDiv, type RoundMode };

// Signed decimal string used for results such as net edges.
export type SDec = string;

export interface Rational {
  readonly n: bigint;
  // Always positive; the fraction is always in lowest terms.
  readonly d: bigint;
}

function abs(x: bigint): bigint {
  return x < 0n ? -x : x;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

export function rat(n: bigint, d: bigint = 1n): Rational {
  if (d === 0n) throw new RangeError("rational with zero denominator");
  const sign = d < 0n ? -1n : 1n;
  const num = n * sign;
  const den = d * sign;
  const g = gcd(num, den);
  return g <= 1n ? { n: num, d: den } : { n: num / g, d: den / g };
}

export const ZERO: Rational = { n: 0n, d: 1n };
export const ONE: Rational = { n: 1n, d: 1n };

export function ratFromInt(value: bigint | number): Rational {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new RangeError("ratFromInt needs a safe integer");
  }
  return { n: BigInt(value), d: 1n };
}

// Strict decimal parse (same grammar as the money guardrail, up to 18 decimal places).
export function ratFromDec(input: unknown): ParseResult<Rational> {
  const parsed = parseDecimalAtomic(input, 18);
  if (!parsed.ok) return parsed;
  return { ok: true, value: rat(parsed.value, pow10(18)) };
}

// For constants in code and tests only: throws on bad input instead of returning a result.
export function dec(input: string): Rational {
  const parsed = ratFromDec(input);
  if (!parsed.ok) throw new RangeError(`invalid decimal constant: ${parsed.reason}`);
  return parsed.value;
}

export function ratFromFixed(value: Fixed): Rational {
  return rat(value.units, pow10(value.scale));
}

// Exact conversion; null when the value does not fit the scale without rounding.
export function ratToFixed(value: Rational, scale: number): Fixed | null {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) return null;
  const scaled = value.n * pow10(scale);
  if (scaled % value.d !== 0n) return null;
  return { units: scaled / value.d, scale };
}

export function add(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Rational, b: Rational): Rational {
  return rat(a.n * b.n, a.d * b.d);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.n === 0n) throw new RangeError("division by zero");
  return rat(a.n * b.d, a.d * b.n);
}

export function neg(a: Rational): Rational {
  return { n: -a.n, d: a.d };
}

export function absR(a: Rational): Rational {
  return a.n < 0n ? neg(a) : a;
}

export function sign(a: Rational): -1 | 0 | 1 {
  return a.n < 0n ? -1 : a.n > 0n ? 1 : 0;
}

export function isZero(a: Rational): boolean {
  return a.n === 0n;
}

export function cmp(a: Rational, b: Rational): -1 | 0 | 1 {
  const x = a.n * b.d;
  const y = b.n * a.d;
  return x < y ? -1 : x > y ? 1 : 0;
}

export function lt(a: Rational, b: Rational): boolean {
  return cmp(a, b) < 0;
}
export function le(a: Rational, b: Rational): boolean {
  return cmp(a, b) <= 0;
}
export function gt(a: Rational, b: Rational): boolean {
  return cmp(a, b) > 0;
}
export function ge(a: Rational, b: Rational): boolean {
  return cmp(a, b) >= 0;
}
export function eq(a: Rational, b: Rational): boolean {
  return a.n === b.n && a.d === b.d;
}

export function min(a: Rational, b: Rational): Rational {
  return cmp(a, b) <= 0 ? a : b;
}
export function max(a: Rational, b: Rational): Rational {
  return cmp(a, b) >= 0 ? a : b;
}

export function sum(values: readonly Rational[]): Rational {
  let total = ZERO;
  for (const v of values) total = add(total, v);
  return total;
}

// ---------------------------------------------------------------------------------------------
// Rounding. Always explicit: fees round up, displayed vwaps round against the trader. RoundMode and roundDiv
// (integer division with a stated direction) are the shared ones from decimal.ts, re-exported above.

// Number of units of 10^-scale after rounding.
export function roundRat(value: Rational, scale: number, mode: RoundMode): bigint {
  assertScale(scale);
  return roundDiv(value.n * pow10(scale), value.d, mode);
}

// Rounds onto the 10^-scale grid and returns the grid value as a rational.
export function roundToGrid(value: Rational, scale: number, mode: RoundMode): Rational {
  return rat(roundRat(value, scale, mode), pow10(scale));
}

export function floorRat(value: Rational): bigint {
  return roundDiv(value.n, value.d, "floor");
}

export function ceilRat(value: Rational): bigint {
  return roundDiv(value.n, value.d, "ceil");
}

function assertScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > 30) throw new RangeError("scale out of range");
}

// Canonical decimal text at `scale` places (trailing zeros trimmed), rounded in the stated
// direction. The sign is kept: edges can be negative.
export function ratToDec(value: Rational, scale: number, mode: RoundMode): SDec {
  return formatAtomic(roundRat(value, scale, mode), scale);
}

// Exact decimal text when the value terminates (denominator has only the factors 2 and 5),
// otherwise null. Products and sums of decimals always terminate.
export function ratToDecExact(value: Rational): SDec | null {
  let d = value.d;
  let twos = 0;
  let fives = 0;
  while (d % 2n === 0n) {
    d /= 2n;
    twos += 1;
  }
  while (d % 5n === 0n) {
    d /= 5n;
    fives += 1;
  }
  if (d !== 1n) return null;
  const places = Math.max(twos, fives);
  return formatAtomic(value.n * (pow10(places) / value.d), places);
}

// Ratio helper for displays such as "net / capital": null when the denominator is zero.
export function ratioOrNull(numerator: Rational, denominator: Rational): Rational | null {
  return isZero(denominator) ? null : div(numerator, denominator);
}
