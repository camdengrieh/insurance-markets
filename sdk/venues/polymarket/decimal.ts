import { cmpQty, decFromNumber, parseQty, subQty, toDec, type Qty } from "../../money/qty.js";

// Decimal-string helpers for the Polymarket adapter, a thin layer over sdk/money/qty.ts (exact bigint arithmetic,
// no floating point). The wire gives prices and sizes as strings like "0.380" and JSON numbers like 0.3799999982;
// the adapter needs a canonical text form, a comparison and a complement, nothing more. Every helper returns
// null for anything that is not an exact plain decimal, so a caller cannot sort or add garbage.
//
// The unit tag "price" is used only to satisfy the Qty type; no arithmetic here mixes quantities of
// different meaning, and the adapter's outputs are plain decimal strings (ports.ts Dec).

export type Dec = string;

function qtyOf(input: unknown): Qty | null {
  return parseQty("price", input, { allowNegative: true, maxScale: 36 });
}

// Canonical form: no leading zeros (except "0"), no trailing fractional zeros, no "-0", no exponent.
export function parseDec(input: unknown): Dec | null {
  const q = qtyOf(input);
  return q === null ? null : toDec(q);
}

// A JSON number as the decimal string of its shortest round-trip form: exact for any value the venue wrote with
// at most 15 significant digits (sdk/money/qty.ts decFromNumber says the same).
export function numberToDec(input: unknown): Dec | null {
  return parseDec(decFromNumber(input));
}

// A number or a decimal string, whichever the route uses.
export function numericToDec(input: unknown): Dec | null {
  return typeof input === "number" ? numberToDec(input) : parseDec(input);
}

// -1, 0 or 1; null when either side is not a decimal.
export function cmpDec(a: Dec, b: Dec): -1 | 0 | 1 | null {
  const left = qtyOf(a);
  const right = qtyOf(b);
  return left === null || right === null ? null : cmpQty(left, right);
}

export function isPositive(dec: Dec): boolean {
  return cmpDec(dec, "0") === 1;
}

// 0 < p < 1: the only prices a Polymarket book level can carry.
export function isOpenUnitInterval(dec: Dec): boolean {
  return cmpDec(dec, "0") === 1 && cmpDec(dec, "1") === -1;
}

// 1 - p, exactly. Used only for a synthetic complement book.
export function oneMinus(dec: Dec): Dec | null {
  const q = qtyOf(dec);
  const one = qtyOf("1");
  return q === null || one === null ? null : toDec(subQty(one, q));
}
