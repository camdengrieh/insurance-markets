// Display text for quantities, times and ages. No locale, no Intl, no floating point: the same input prints
// the same text on every machine, which is what the tests pin.
//
// Rules: a missing value prints NULL_TEXT, never "0"; a non-zero amount that rounds to zero prints "<" and
// the smallest step, never "$0.00"; a unit is always printed (a number without a unit is a bug);
// USDC.e and TYD are labelled as what they are, not as dollars.

import { fromAtomic, toFixedText, type Qty, type QtyUnit, type RoundingMode } from "./money";

export const NULL_TEXT = "n/a";
export const UNPROVEN_TEXT = "unproven";

const UNIT_SUFFIX: Readonly<Record<QtyUnit, string>> = Object.freeze({
  usd: "",
  usdc_e: " USDC.e",
  shares: " shares",
  contracts: " contracts",
  price: "",
  tyd: " TYD",
});

export interface AmountFormat {
  readonly places?: number;
  readonly mode?: RoundingMode;
  readonly plus?: boolean;
}

function smallestStep(places: number): string {
  return places === 0 ? "1" : `0.${"0".repeat(places - 1)}1`;
}

// "$1,234.50", "1,234.50 USDC.e", "12.5 shares". Dollar amounts default to 2 places, rounded toward zero.
export function formatQty(q: Qty | null, format: AmountFormat = {}): string {
  if (q === null) return NULL_TEXT;
  const places = format.places ?? defaultPlaces(q.unit);
  const mode = format.mode ?? "down";
  const { text, roundedToZero } = toFixedText(q, places, mode, { thousands: true, ...(format.plus === true ? { plus: true } : {}) });
  const negative = text.startsWith("-");
  const sign = negative ? "-" : text.startsWith("+") ? "+" : "";
  const magnitude = sign === "" ? text : text.slice(1);
  const dollar = q.unit === "usd" ? "$" : "";
  const suffix = UNIT_SUFFIX[q.unit];
  if (roundedToZero) {
    const sensibleSign = q.atomic < 0n ? "-" : "";
    return `${sensibleSign}<${dollar}${smallestStep(places)}${suffix}`;
  }
  return `${sign}${dollar}${magnitude}${suffix}`;
}

function defaultPlaces(unit: QtyUnit): number {
  switch (unit) {
    case "usd":
    case "usdc_e":
    case "tyd":
      return 2;
    case "shares":
    case "contracts":
      return 2;
    case "price":
      return 3;
  }
}

export function formatUsd(q: Qty | null, format: AmountFormat = {}): string {
  if (q !== null && q.unit !== "usd") throw new RangeError("formatUsd needs a usd quantity");
  return formatQty(q, format);
}

// price * 100: the same digits with the point moved two places right (exact).
function timesHundred(q: Qty): Qty {
  return q.scale >= 2 ? fromAtomic(q.unit, q.atomic, q.scale - 2) : fromAtomic(q.unit, q.atomic * 10n ** BigInt(2 - q.scale), 0);
}

function inUnitInterval(q: Qty): boolean {
  return q.atomic >= 0n && q.atomic <= 10n ** BigInt(q.scale);
}

// A price in [0, 1] as cents with one decimal place: 0.534 -> "53.4c". An out-of-range price prints as a
// plain number so a scalar market never shows a misleading percent.
export function formatPriceCents(price: Qty | null): string {
  if (price === null) return NULL_TEXT;
  if (price.unit !== "price") throw new RangeError("formatPriceCents needs a price");
  if (!inUnitInterval(price)) return formatQty(price, { places: 3 });
  return `${toFixedText(timesHundred(price), 1, "down").text}c`;
}

// A probability as a percent with one decimal: 0.534 -> "53.4%". Out of range is unknown, not clamped.
export function formatPercent(probability: Qty | null): string {
  if (probability === null) return NULL_TEXT;
  if (probability.unit !== "price") throw new RangeError("formatPercent needs a price");
  if (!inUnitInterval(probability)) return NULL_TEXT;
  return `${toFixedText(timesHundred(probability), 1, "down").text}%`;
}

// ---- time --------------------------------------------------------------------------------------------------------------------

function two(value: number): string {
  return value.toString().padStart(2, "0");
}

// "2026-10-19 09:30:05 UTC". Everything the app shows is UTC; XO cutoffs are UTC and Polymarket's are ET
// (about five hours apart), so a local time zone would hide the difference.
export function formatUtc(ms: number | null | undefined, withSeconds = true): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return NULL_TEXT;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return NULL_TEXT;
  const day = `${date.getUTCFullYear().toString().padStart(4, "0")}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}`;
  const time = `${two(date.getUTCHours())}:${two(date.getUTCMinutes())}${withSeconds ? `:${two(date.getUTCSeconds())}` : ""}`;
  return `${day} ${time} UTC`;
}

// An upstream ISO-8601 timestamp, only if it parses to a finite time; otherwise null (never "now").
export function parseIsoMs(text: unknown): number | null {
  if (typeof text !== "string" || text.length < 10 || text.length > 40) return null;
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(text)) return null;
  // A date-time without an offset is read as UTC, never as the viewer's local time.
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) && text.length > 10;
  const normalized = text.replace(" ", "T");
  const ms = Date.parse(hasOffset || normalized.length === 10 ? normalized : `${normalized}Z`);
  return Number.isFinite(ms) ? ms : null;
}

// "12 s ago", "4 min ago", "3 h ago", "2 d ago". A time in the future prints "in the future" (a clock or
// feed fault the user should see), and an unknown time prints NULL_TEXT.
export function formatAge(nowMs: number, thenMs: number | null | undefined): string {
  if (thenMs === null || thenMs === undefined || !Number.isFinite(thenMs) || !Number.isFinite(nowMs)) return NULL_TEXT;
  const delta = nowMs - thenMs;
  if (delta < -2000) return "in the future";
  const seconds = Math.max(0, Math.floor(delta / 1000));
  if (seconds < 90) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return NULL_TEXT;
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 90) return `${seconds} s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 120) return `${minutes} min`;
  return `${Math.ceil(minutes / 60)} h`;
}

// ---- addresses --------------------------------------------------------------------------------------------------------------

// Tables may show the short form (0x plus six hex digits, then the last six); every confirmation, deposit
// target and binding screen shows the full address (dapp-design section 6 row 25).
export function shortAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NULL_TEXT;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}
