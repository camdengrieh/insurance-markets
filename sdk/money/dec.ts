// Plain decimal-string helpers for the readers that receive prices as JSON numbers (Hyperliquid, Manifold). No
// arithmetic on floats: a JSON number is turned into a decimal string once (toFixed is a correctly rounded decimal
// expansion, not arithmetic) and everything after that is the shared string and bigint work of decimal.ts.

import { canonicalDec, compareDecimal, complementOfOne, isDec } from "./decimal.js";

export { complementOfOne, isDec };

// "629.0" -> "629", "0.50" -> "0.5". Throws on a string that is not a plain non-negative decimal.
export function canonDec(value: string): string {
  const canonical = canonicalDec(value);
  if (canonical === null) throw new Error("not a decimal");
  return canonical;
}

// A finite, non-negative JSON number as a canonical decimal string with at most `dp` decimals, or null.
export function numberToDec(value: number, dp: number): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 1e21) return null;
  return canonicalDec(value.toFixed(dp));
}

// Exact comparison of two plain non-negative decimal strings: negative, zero or positive. Throws on anything else.
export function compareDec(a: string, b: string): number {
  const order = compareDecimal(a, b);
  if (order === null) throw new Error("not a decimal");
  return order;
}
