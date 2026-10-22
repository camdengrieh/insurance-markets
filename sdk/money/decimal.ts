// The one decimal grammar and the exact operations every money helper is built on: decimal text to an integer of
// atomic units at N decimals and back, comparison of two scaled integers, and integer division with a stated
// rounding. amount.ts, fixed.ts, rational.ts, qty.ts and dec.ts are views over these functions, and so are the
// plugin's signing and CLOB amounts, the relay, the dApp's tickets and pm's signal parser.
//
// The grammar is sdk/model.ts `Dec`: ASCII digits with no leading zero except a lone "0", then optionally "." and at
// least one digit. No sign, exponent, hex prefix, separators, spaces, ".5", "5." or trailing newline, and at most
// MAX_DECIMAL_CHARS characters. A leading "-" is accepted only where a caller asks for signed text.
//
// Pure: no floating point on any value, no clock, no I/O. A failure is a fixed code and never echoes the input,
// which may be attacker-shaped.

import type { Dec } from "../model.js";

// Longest decimal text any parser accepts.
export const MAX_DECIMAL_CHARS = 40;
// Most decimal places a conversion handles: an 18-decimal token with 18 more digits of product scale.
export const MAX_DECIMALS = 36;

// The plain non-negative grammar, for schema validators that need a pattern. Parsers use splitDecimal.
export const DEC_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const GRAMMAR = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

export type DecimalFailure =
  // Not a string.
  | "not_text"
  // Empty or longer than MAX_DECIMAL_CHARS.
  | "length"
  // Not the grammar.
  | "grammar"
  // A "-" where the caller did not allow one.
  | "sign"
  // More fractional digits than the conversion allows. Trailing zeros count: "1.50" has two places.
  | "precision"
  // The number of decimals asked for is not an integer from 0 to MAX_DECIMALS.
  | "decimals";

export type DecimalResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: DecimalFailure };

export interface SignOptions {
  readonly allowNegative?: boolean;
}

export interface DecimalParts {
  readonly negative: boolean;
  // Digits before the point, without leading zeros ("0" for zero).
  readonly whole: string;
  // Digits after the point exactly as written, trailing zeros included; "" when there is no point.
  readonly fraction: string;
}

function fail(failure: DecimalFailure): { readonly ok: false; readonly failure: DecimalFailure } {
  return { ok: false, failure };
}

const POW10: bigint[] = [1n];

// 10^n for 0 <= n, cached.
export function pow10(n: number): bigint {
  if (!Number.isInteger(n) || n < 0) throw new RangeError("pow10 needs a non-negative integer");
  while (POW10.length <= n) POW10.push((POW10[POW10.length - 1] ?? 1n) * 10n);
  return POW10[n] ?? 1n;
}

function validDecimals(decimals: number): boolean {
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= MAX_DECIMALS;
}

// ---- parse ----------------------------------------------------------------------------------------------------------

// The one parser: decimal text into its sign, whole digits and fraction digits.
export function splitDecimal(text: unknown, options: SignOptions = {}): DecimalResult<DecimalParts> {
  if (typeof text !== "string") return fail("not_text");
  if (text.length === 0 || text.length > MAX_DECIMAL_CHARS) return fail("length");
  const match = GRAMMAR.exec(text);
  if (match === null) return fail("grammar");
  const negative = match[1] === "-";
  if (negative && options.allowNegative !== true) return fail("sign");
  return { ok: true, value: { negative, whole: match[2] ?? "0", fraction: match[3] ?? "" } };
}

// True for a plain non-negative decimal with at most `maxDecimals` fractional digits (as written).
export function isDec(text: unknown, maxDecimals: number = MAX_DECIMALS): text is Dec {
  const parts = splitDecimal(text);
  return parts.ok && parts.value.fraction.length <= maxDecimals;
}

// "12.5" at 6 decimals is 12500000n. More fractional digits than `decimals` is refused, never rounded, even when
// the extra digits are zeros.
export function decToAtomic(text: unknown, decimals: number, options: SignOptions = {}): DecimalResult<bigint> {
  if (!validDecimals(decimals)) return fail("decimals");
  const parts = splitDecimal(text, options);
  if (!parts.ok) return parts;
  const { negative, whole, fraction } = parts.value;
  if (fraction.length > decimals) return fail("precision");
  const magnitude = BigInt(whole + fraction.padEnd(decimals, "0"));
  return { ok: true, value: negative ? -magnitude : magnitude };
}

// A non-negative integer string ("670000") as a bigint: the grammar with no fraction. null for anything else.
export function parseAtomicInteger(text: unknown): bigint | null {
  const parsed = decToAtomic(text, 0);
  return parsed.ok ? parsed.value : null;
}

// Decimal text as an exact integer at the scale it was written with ("0.50" is 50n at scale 2).
export function scaledOf(text: unknown, options: SignOptions = {}): { readonly atomic: bigint; readonly scale: number } | null {
  const parts = splitDecimal(text, options);
  if (!parts.ok) return null;
  const { negative, whole, fraction } = parts.value;
  const magnitude = BigInt(whole + fraction);
  return { atomic: negative ? -magnitude : magnitude, scale: fraction.length };
}

// Canonical form of decimal text: no trailing fractional zeros, no "-0". null for anything not the grammar.
export function canonicalDec(text: unknown, options: SignOptions = {}): string | null {
  const value = scaledOf(text, options);
  return value === null ? null : atomicToDec(value.atomic, value.scale);
}

// ---- format ---------------------------------------------------------------------------------------------------------

export interface AtomicParts {
  readonly negative: boolean;
  readonly whole: string;
  // Exactly `decimals` digits, zero-padded, not trimmed.
  readonly fraction: string;
}

// An atomic integer split at `decimals` places, for formatters that pad, group or trim. Formatting has no upper
// bound on `decimals` (an exact rational product can carry more places than any parser accepts).
export function splitAtomic(value: bigint, decimals: number): AtomicParts {
  if (!Number.isInteger(decimals) || decimals < 0) throw new RangeError("decimals out of range");
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");
  return { negative, whole: digits.slice(0, digits.length - decimals), fraction: digits.slice(digits.length - decimals) };
}

// Inverse of decToAtomic: 12500000n at 6 decimals is "12.5". Trailing zeros are trimmed, the sign is kept.
export function atomicToDec(value: bigint, decimals: number): string {
  const { negative, whole, fraction } = splitAtomic(value, decimals);
  const trimmed = fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${trimmed === "" ? "" : `.${trimmed}`}`;
}

// ---- compare --------------------------------------------------------------------------------------------------------

// Three-way comparison of a / 10^aScale and b / 10^bScale, exactly.
export function compareScaled(a: bigint, aScale: number, b: bigint, bScale: number): -1 | 0 | 1 {
  const scale = Math.max(aScale, bScale);
  const left = a * pow10(scale - aScale);
  const right = b * pow10(scale - bScale);
  return left < right ? -1 : left > right ? 1 : 0;
}

// Three-way comparison of two decimal texts; null when either is not the grammar.
export function compareDecimal(a: unknown, b: unknown, options: SignOptions = {}): -1 | 0 | 1 | null {
  const left = scaledOf(a, options);
  const right = scaledOf(b, options);
  return left === null || right === null ? null : compareScaled(left.atomic, left.scale, right.atomic, right.scale);
}

// 1 - p for a decimal p in [0, 1], exactly; null for anything else.
export function complementOfOne(text: unknown): Dec | null {
  const value = scaledOf(text);
  if (value === null) return null;
  const one = pow10(value.scale);
  return value.atomic > one ? null : atomicToDec(one - value.atomic, value.scale);
}

// ---- rounding -------------------------------------------------------------------------------------------------------

export type RoundMode = "floor" | "ceil" | "trunc" | "half_up" | "half_even";

// Integer division of n by d (d > 0) with a stated direction. `half_up` rounds ties away from zero; `half_even`
// rounds ties to the even integer.
export function roundDiv(n: bigint, d: bigint, mode: RoundMode): bigint {
  if (d <= 0n) throw new RangeError("roundDiv needs a positive denominator");
  const q = n / d; // truncates toward zero
  const r = n % d;
  if (r === 0n) return q;
  const negative = n < 0n;
  const floor = negative ? q - 1n : q;
  switch (mode) {
    case "trunc":
      return q;
    case "floor":
      return floor;
    case "ceil":
      return floor + 1n;
    case "half_up":
    case "half_even": {
      const twice = 2n * (r < 0n ? -r : r);
      if (twice < d) return q;
      if (twice > d) return negative ? q - 1n : q + 1n;
      // exact tie
      if (mode === "half_up") return negative ? q - 1n : q + 1n;
      return q % 2n === 0n ? q : negative ? q - 1n : q + 1n;
    }
  }
}

// ---- JSON numbers ---------------------------------------------------------------------------------------------------

// A JSON number to exact decimal text. The shortest decimal that round-trips is what the sender wrote for any value
// of 15 significant digits or fewer, so that is what is returned, with its sign. Non-finite values, unsafe
// integers and exponents beyond +-30 are null (fail closed, never rounded).
export function decFromNumber(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (Number.isInteger(value)) return Number.isSafeInteger(value) ? String(value) : null;
  const text = String(value);
  const match = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
  if (match === null) return GRAMMAR.test(text) ? text : null;
  const exponent = Number(match[4]);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 30) return null;
  const digits = (match[2] ?? "") + (match[3] ?? "");
  const point = 1 + exponent;
  let out: string;
  if (point <= 0) out = `0.${"0".repeat(-point)}${digits}`;
  else if (point >= digits.length) out = digits + "0".repeat(point - digits.length);
  else out = `${digits.slice(0, point)}.${digits.slice(point)}`;
  return `${match[1] ?? ""}${out}`;
}
