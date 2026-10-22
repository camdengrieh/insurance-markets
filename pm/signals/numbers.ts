// Number handling for third-party JSON. A paid Quotient body arrives as JSON numbers, which are
// IEEE doubles by the time anything can see them. The shortest round-trip text of a double is
// the decimal the sender wrote for every value of up to 15 significant digits, so we turn each
// number into that text (sdk/money/decimal.ts decFromNumber) and then into an exact rational.
// Nothing is ever multiplied or compared as a float; unit changes (0-100 to 0-1) are exact
// rational divisions.

import { decFromNumber, isDec } from "../../sdk/money/decimal.js";
import { ratFromDec, rat, cmp, ZERO, ONE, div, type Rational } from "../core/rational.js";

const MAX_MAGNITUDE = 1e12;

// Plain non-negative decimal text for a JSON number or numeric string, else null.
export function decimalText(value: unknown): string | null {
  if (typeof value === "string") return isDec(value) ? value : null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_MAGNITUDE) return null;
  const text = decFromNumber(value);
  return isDec(text) ? text : null;
}

export type NumResult = { readonly ok: true; readonly value: Rational } | { readonly ok: false; readonly code: "BAD_NUMBER" | "OUT_OF_RANGE" };

export function toRational(value: unknown): NumResult {
  const text = decimalText(value);
  if (text === null) return { ok: false, code: "BAD_NUMBER" };
  const parsed = ratFromDec(text);
  return parsed.ok ? { ok: true, value: parsed.value } : { ok: false, code: "BAD_NUMBER" };
}

// Probability on a 0..1 scale. Anything outside is OUT_OF_RANGE, never silently rescaled: a
// value of 55 on a 0..1 field is a unit error to be reported, not a probability to be guessed.
export function prob01(value: unknown): NumResult {
  const r = toRational(value);
  if (!r.ok) return r;
  return cmp(r.value, ONE) > 0 || cmp(r.value, ZERO) < 0 ? { ok: false, code: "OUT_OF_RANGE" } : r;
}

// Probability on a 0..100 scale (entry_q, entry_pm), returned on 0..1 by an exact division.
export function pct100(value: unknown): NumResult {
  const r = toRational(value);
  if (!r.ok) return r;
  const scaled = div(r.value, rat(100n));
  return cmp(scaled, ONE) > 0 ? { ok: false, code: "OUT_OF_RANGE" } : { ok: true, value: scaled };
}
