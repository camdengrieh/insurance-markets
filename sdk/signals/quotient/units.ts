import { cmpQty, decFromNumber, fromAtomic, negQty, parseQty, signOf, subQty, toDec, type Qty } from "../../money/qty.js";
import type { Dec } from "../../model.js";

// Quotient mixes scales in one object (research 12 section 5.1): `entry_q` and `entry_pm` are 0 to 100,
// `latest_q`, `market_odds`, `quotient_odds` and `venue_quote.selected_probability` are 0 to 1, `*_cents` are on
// the signal's own side. Everything is turned into an exact decimal on the 0 to 1 scale at ingest, by moving the
// decimal point (never by floating-point division). A value outside its documented range, a non-number or a
// percent-looking value in a 0 to 1 field is a unit failure: the row is refused with a reason, never clamped.

export type UnitScale = "unit" | "percent";
export type UnitResult = { readonly ok: true; readonly value: Dec; readonly qty: Qty } | { readonly ok: false; readonly reason: "not_a_number" | "out_of_range" };

const ZERO = parseQty("price", "0");
const ONE = parseQty("price", "1");

function qtyOfJson(value: unknown): Qty | null {
  if (typeof value === "number") {
    const text = decFromNumber(value);
    return text === null ? null : parseQty("price", text);
  }
  // A numeric string is accepted only as a plain decimal: "55%" and "0.55 " are not numbers.
  if (typeof value === "string") return parseQty("price", value);
  return null;
}

// scale "unit": the value must be in [0, 1]. scale "percent": in [0, 100], returned divided by 100 exactly.
export function probability(value: unknown, scale: UnitScale): UnitResult {
  const parsed = qtyOfJson(value);
  if (parsed === null || ZERO === null || ONE === null) return { ok: false, reason: "not_a_number" };
  const qty = scale === "percent" ? fromAtomic("price", parsed.atomic, parsed.scale + 2) : parsed;
  if (cmpQty(qty, ZERO) < 0 || cmpQty(qty, ONE) > 0) return { ok: false, reason: "out_of_range" };
  return { ok: true, value: toDec(qty), qty };
}

// A non-negative decimal amount (USD capacity, pp edge): exact, or null. Never 0 for a missing value.
export function nonNegativeDec(value: unknown): Dec | null {
  const qty = qtyOfJson(value);
  if (qty === null || qty.atomic < 0n) return null;
  return toDec(qty);
}

// |a - b| as an exact decimal.
export function absDiff(a: Qty, b: Qty): Qty {
  const diff = subQty(a, b);
  return signOf(diff) < 0 ? negQty(diff) : diff;
}

export function within(a: Qty, b: Qty, tolerance: Dec): boolean {
  const limit = parseQty("price", tolerance);
  return limit !== null && cmpQty(absDiff(a, b), limit) <= 0;
}
