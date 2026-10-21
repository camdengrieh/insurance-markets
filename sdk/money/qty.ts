// Exact money, share and price arithmetic (docs/dapp-design.md 4.4 valuation rules, aggregation-design 2.3).
//
// Rules this module enforces by construction:
//   - no floating point on money: a quantity is a bigint of atomic units plus a decimal scale;
//   - a quantity carries its unit, so dollars, shares, prices and another collateral (USDC.e, TYD) never mix;
//   - micro-units enter only through fromMicro / fromBaseUnits, which turn the raw integer into a real
//     quantity at once ("670000" micro-USDC is 0.67 USD), so there is no way to add 670000 to a dollar total;
//   - null is not zero: a missing value is excluded from a total and counted, never added as 0;
//   - text that is not an exact plain decimal (exponent, separators, sign mid-text, spaces) parses to null.
//
// Pure functions, no clock, no network, no global.

import type { Dec } from "../model.js";

export type { Dec };

// A programming error: two quantities of different units were combined. It is thrown, never returned, so
// a unit mix-up cannot turn into a wrong number on the screen.
export class UnitMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitMismatchError";
  }
}

// "usd" and "usdc_e" are different units on purpose (a USDC.e balance is not a USD total), as are "tyd"
// (Trueo's ERC-4626 share, not USD) and the outcome-token units.
export const QTY_UNITS = ["usd", "usdc_e", "shares", "contracts", "price", "tyd"] as const;
export type QtyUnit = (typeof QTY_UNITS)[number];

export function isQtyUnit(value: unknown): value is QtyUnit {
  return typeof value === "string" && (QTY_UNITS as readonly string[]).includes(value);
}

// 10^36 covers an 18-decimal token with 18 more digits of product scale.
export const MAX_SCALE = 36;
export const MAX_TEXT_CHARS = 100;
export const DEFAULT_PARSE_SCALE = 18;

export interface Qty {
  readonly unit: QtyUnit;
  readonly atomic: bigint;
  // Number of decimal places `atomic` carries. Always normalised to the smallest scale that is exact.
  readonly scale: number;
}

export type RoundingMode = "down" | "up" | "half_up";

const POW10_CACHE: bigint[] = [1n];
function pow10(n: number): bigint {
  while (POW10_CACHE.length <= n) POW10_CACHE.push((POW10_CACHE[POW10_CACHE.length - 1] ?? 1n) * 10n);
  return POW10_CACHE[n] ?? 1n;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function make(unit: QtyUnit, atomic: bigint, scale: number): Qty {
  if (!isQtyUnit(unit)) throw new RangeError("unknown unit");
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) throw new RangeError("scale out of range");
  let value = atomic;
  let places = scale;
  while (places > 0 && value % 10n === 0n) {
    value /= 10n;
    places -= 1;
  }
  if (value === 0n) places = 0;
  return Object.freeze({ unit, atomic: value, scale: places });
}

// ---- construction -----------------------------------------------------------------------------------------------

const DECIMAL = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

export interface ParseOptions {
  // Most fractional digits the text may carry (extra trailing zeros are fine). Default 18.
  readonly maxScale?: number;
  readonly allowNegative?: boolean;
}

// "0.534" -> Qty. Null for anything that is not an exact plain decimal within the scale limit.
export function parseQty(unit: QtyUnit, text: unknown, options: ParseOptions = {}): Qty | null {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_TEXT_CHARS) return null;
  const match = DECIMAL.exec(text);
  if (match === null) return null;
  const negative = match[1] === "-";
  if (negative && options.allowNegative !== true) return null;
  const whole = match[2] ?? "0";
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  const maxScale = Math.min(options.maxScale ?? DEFAULT_PARSE_SCALE, MAX_SCALE);
  if (fraction.length > maxScale) return null;
  const atomic = BigInt(whole + fraction);
  return make(unit, negative ? -atomic : atomic, fraction.length);
}

// A Dec (decimal string) from an upstream field becomes a quantity; null for anything not exact.
export function qtyOfDec(unit: QtyUnit, dec: Dec | null | undefined, options: ParseOptions = {}): Qty | null {
  return dec === null || dec === undefined ? null : parseQty(unit, dec, options);
}

export function zero(unit: QtyUnit): Qty {
  return make(unit, 0n, 0);
}

export function fromAtomic(unit: QtyUnit, atomic: bigint, scale: number): Qty {
  return make(unit, atomic, scale);
}

// Venue raw integers with a known number of decimals: XO micro-shares (6), Limitless sizes (6), Myriad (18),
// Trueo outcome tokens (18). The raw value is an unsigned integer string or a bigint; anything else is null.
export function fromBaseUnits(unit: QtyUnit, raw: unknown, decimals: number): Qty | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_SCALE) return null;
  let atomic: bigint;
  if (typeof raw === "bigint") {
    atomic = raw;
  } else if (typeof raw === "string" && raw.length > 0 && raw.length <= 80 && /^(0|[1-9][0-9]*)$/.test(raw)) {
    atomic = BigInt(raw);
  } else {
    return null;
  }
  if (atomic < 0n) return null;
  return make(unit, atomic, decimals);
}

// XO's Data API sends prices, positions and balances as micro-unit integer strings.
export function fromMicro(unit: QtyUnit, raw: unknown): Qty | null {
  return fromBaseUnits(unit, raw, 6);
}

// The exact base-unit integer, or null when the quantity has more places than `decimals`.
export function toBaseUnits(q: Qty, decimals: number): bigint | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_SCALE) return null;
  if (q.scale > decimals) return null;
  return q.atomic * pow10(decimals - q.scale);
}

export function toMicro(q: Qty): bigint | null {
  return toBaseUnits(q, 6);
}

// A JSON number from an upstream (Polymarket Data API v2) to an exact decimal string. The shortest decimal
// that round-trips is what the sender wrote for any value of 15 significant digits or fewer, so that is what
// is returned. Non-finite, unsafe integers and exponents beyond +-30 are null (fail closed, never rounded).
export function decFromNumber(value: unknown): Dec | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (Number.isInteger(value)) return Number.isSafeInteger(value) ? String(value) : null;
  const text = String(value);
  const match = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
  if (match === null) return DECIMAL.test(text) ? text : null;
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

// ---- arithmetic -------------------------------------------------------------------------------------------------

function requireSameUnit(a: Qty, b: Qty): void {
  if (a.unit !== b.unit) throw new UnitMismatchError(`cannot combine ${a.unit} and ${b.unit}`);
}

function toScale(q: Qty, scale: number): bigint {
  return q.atomic * pow10(scale - q.scale);
}

export function addQty(a: Qty, b: Qty): Qty {
  requireSameUnit(a, b);
  const scale = Math.max(a.scale, b.scale);
  return make(a.unit, toScale(a, scale) + toScale(b, scale), scale);
}

export function subQty(a: Qty, b: Qty): Qty {
  requireSameUnit(a, b);
  const scale = Math.max(a.scale, b.scale);
  return make(a.unit, toScale(a, scale) - toScale(b, scale), scale);
}

export function negQty(q: Qty): Qty {
  return make(q.unit, -q.atomic, q.scale);
}

export function cmpQty(a: Qty, b: Qty): -1 | 0 | 1 {
  requireSameUnit(a, b);
  const scale = Math.max(a.scale, b.scale);
  const left = toScale(a, scale);
  const right = toScale(b, scale);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function eqQty(a: Qty, b: Qty): boolean {
  return a.unit === b.unit && cmpQty(a, b) === 0;
}

export function signOf(q: Qty): -1 | 0 | 1 {
  return q.atomic < 0n ? -1 : q.atomic > 0n ? 1 : 0;
}

export function isZero(q: Qty): boolean {
  return q.atomic === 0n;
}

// Divide `value` by 10^drop, rounding the magnitude by `mode` (half_up is half away from zero).
function divRound(value: bigint, drop: number, mode: RoundingMode): bigint {
  if (drop <= 0) return value;
  const divisor = pow10(drop);
  const magnitude = abs(value);
  let quotient = magnitude / divisor;
  const remainder = magnitude % divisor;
  if (remainder !== 0n) {
    if (mode === "up") quotient += 1n;
    else if (mode === "half_up" && remainder * 2n >= divisor) quotient += 1n;
  }
  return value < 0n ? -quotient : quotient;
}

// Round to `scale` places. A scale at or above the current one is exact (no change of value).
export function roundQty(q: Qty, scale: number, mode: RoundingMode): Qty {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) throw new RangeError("scale out of range");
  if (scale >= q.scale) return q;
  return make(q.unit, divRound(q.atomic, q.scale - scale, mode), scale);
}

const NOTIONAL_OUT: readonly QtyUnit[] = ["usd", "usdc_e", "tyd"];

// Shares (or contracts) times a price is a collateral amount, exactly (no rounding: scales add).
export function notional(size: Qty, price: Qty, out: QtyUnit): Qty {
  if (size.unit !== "shares" && size.unit !== "contracts") throw new UnitMismatchError(`size must be shares or contracts, got ${size.unit}`);
  if (price.unit !== "price") throw new UnitMismatchError(`price must be a price, got ${price.unit}`);
  if (!NOTIONAL_OUT.includes(out)) throw new UnitMismatchError(`${out} is not a collateral unit`);
  if (price.atomic < 0n || size.atomic < 0n) throw new RangeError("size and price must not be negative");
  return make(out, size.atomic * price.atomic, size.scale + price.scale);
}

// q * bps / 10000, exact (four more places). bps is a non-negative integer.
export function mulBps(q: Qty, bps: number): Qty {
  if (!Number.isInteger(bps) || bps < 0 || bps > 1_000_000) throw new RangeError("bps must be an integer from 0 to 1000000");
  return make(q.unit, q.atomic * BigInt(bps), q.scale + 4);
}

// ---- totals: null is not zero -------------------------------------------------------------------------------------

export interface TotalRow {
  readonly unit: QtyUnit;
  readonly value: Qty | null;
}

export interface UnitTotal {
  readonly unit: QtyUnit;
  // null when no row of this unit had a value: an empty sum is "no data", never 0.
  readonly total: Qty | null;
  readonly included: number;
  // Rows with a null value. The screen prints this count next to the total (M2-4).
  readonly excluded: number;
}

// One total per unit, in first-seen order. A row whose value carries a different unit than its row.unit is a
// programming error and throws.
export function sumRows(rows: readonly TotalRow[]): readonly UnitTotal[] {
  const order: QtyUnit[] = [];
  const state = new Map<QtyUnit, { total: Qty | null; included: number; excluded: number }>();
  for (const row of rows) {
    if (!isQtyUnit(row.unit)) throw new RangeError("unknown unit");
    let entry = state.get(row.unit);
    if (entry === undefined) {
      entry = { total: null, included: 0, excluded: 0 };
      state.set(row.unit, entry);
      order.push(row.unit);
    }
    if (row.value === null) {
      entry.excluded += 1;
      continue;
    }
    if (row.value.unit !== row.unit) throw new UnitMismatchError(`row of ${row.unit} carries ${row.value.unit}`);
    entry.total = entry.total === null ? row.value : addQty(entry.total, row.value);
    entry.included += 1;
  }
  return order.map((unit) => {
    const entry = state.get(unit);
    return Object.freeze({ unit, total: entry?.total ?? null, included: entry?.included ?? 0, excluded: entry?.excluded ?? 0 });
  });
}

// ---- text ---------------------------------------------------------------------------------------------------------------

function groupDigits(digits: string): string {
  let out = "";
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) out += ",";
    out += digits[index];
  }
  return out;
}

export interface DecimalTextOptions {
  readonly thousands?: boolean;
  // Always print a leading "+" for positive values (PnL columns).
  readonly plus?: boolean;
}

// Exact decimal text of a quantity: no exponent, no trailing zeros, "-" for negative.
export function toDec(q: Qty, options: DecimalTextOptions = {}): Dec {
  const negative = q.atomic < 0n;
  const digits = abs(q.atomic).toString().padStart(q.scale + 1, "0");
  const whole = digits.slice(0, digits.length - q.scale);
  const fraction = digits.slice(digits.length - q.scale);
  const body = `${options.thousands === true ? groupDigits(whole) : whole}${fraction === "" ? "" : `.${fraction}`}`;
  if (negative) return `-${body}`;
  return options.plus === true && q.atomic > 0n ? `+${body}` : body;
}

// Fixed `places` decimal places, rounded by `mode` (default toward zero, so a display never shows more than
// is there). A non-zero value that rounds to zero is NOT hidden: the caller checks `roundedToZero`.
export function toFixedText(q: Qty, places: number, mode: RoundingMode = "down", options: DecimalTextOptions = {}): { readonly text: string; readonly roundedToZero: boolean } {
  if (!Number.isInteger(places) || places < 0 || places > MAX_SCALE) throw new RangeError("places out of range");
  const rounded = q.scale > places ? divRound(q.atomic, q.scale - places, mode) : q.atomic * pow10(places - q.scale);
  const negative = rounded < 0n;
  const digits = abs(rounded).toString().padStart(places + 1, "0");
  const whole = digits.slice(0, digits.length - places);
  const fraction = digits.slice(digits.length - places);
  const body = `${options.thousands === true ? groupDigits(whole) : whole}${places === 0 ? "" : `.${fraction}`}`;
  const text = negative ? `-${body}` : options.plus === true && rounded > 0n ? `+${body}` : body;
  return { text, roundedToZero: rounded === 0n && q.atomic !== 0n };
}
