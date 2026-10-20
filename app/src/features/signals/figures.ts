// Formatting for the figures on a Signals row. Exact decimal strings in, text out: no floating point, and a value
// that is not a plain decimal in range prints as "n/a" (null is not zero).

import { NULL_TEXT, formatPercent } from "../../core/format";
import { parseQty } from "../../core/money";
import type { Dec } from "../../core/ports";

const PLAIN_DECIMAL = /^-?(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,12})?$/;

// A probability on the 0 to 1 scale as a percent with one decimal ("0.62" -> "62.0%").
export function probabilityText(value: Dec | null): string {
  if (value === null || !PLAIN_DECIMAL.test(value)) return NULL_TEXT;
  return formatPercent(parseQty("price", value));
}

// A difference between two probabilities, in percentage points with a sign ("-0.025" -> "-2.5 points").
export function pointsText(value: Dec | null): string {
  if (value === null || !PLAIN_DECIMAL.test(value)) return NULL_TEXT;
  const negative = value.startsWith("-");
  const magnitude = negative ? value.slice(1) : value;
  const percent = formatPercent(parseQty("price", magnitude));
  if (percent === NULL_TEXT) return NULL_TEXT;
  const isZero = /^0(?:\.0+)?$/.test(magnitude);
  return `${negative && !isZero ? "-" : isZero ? "" : "+"}${percent.replace("%", "")} points`;
}

// A USD amount from a plain decimal string, for fixed price labels ("0.02" -> "$0.02").
export function usdLabel(value: Dec): string {
  return PLAIN_DECIMAL.test(value) && !value.startsWith("-") ? `$${value}` : NULL_TEXT;
}
