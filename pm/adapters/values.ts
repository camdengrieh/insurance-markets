// Small, strict value readers shared by the adapters. Venue JSON is untrusted: every reader
// returns null (never a guess) when a value is not in the exact expected shape.
//
// Decimals: venues send prices as strings ("0.3800") and sometimes as JSON numbers (Polymarket
// tick 0.01, fee rate 0.04). A JSON number has already been through a double, so it is accepted
// only when its shortest round-trip text is a plain decimal with at most 15 significant digits;
// that text is exact for any value a human typed. Anything else (exponent form, NaN, 1e21, a
// 17-digit tail) is refused instead of rounded.

import { createHash } from "node:crypto";

import { ratFromDec, ratToDecExact } from "../core/rational.js";
import type { Dec } from "../types.js";

export type Rec = Readonly<Record<string, unknown>>;

export function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Own properties only, so inherited names can never satisfy a read.
export function get(rec: Rec, key: string): unknown {
  return Object.hasOwn(rec, key) ? rec[key] : undefined;
}

export function str(rec: Rec, key: string, max = 20_000): string | null {
  const value = get(rec, key);
  return typeof value === "string" && value.length <= max ? value : null;
}

export function bool(rec: Rec, key: string): boolean | null {
  const value = get(rec, key);
  return typeof value === "boolean" ? value : null;
}

const PLAIN_DECIMAL = /^(?:0|[1-9][0-9]{0,29})(?:\.[0-9]{1,29})?$/;
const LOOSE_DECIMAL = /^[0-9]{1,30}(?:\.[0-9]{1,30})?$/;

// Normalised plain decimal ("0.3800" -> "0.38", "1.0" -> "1"), or null.
export function plainDec(value: unknown): Dec | null {
  if (typeof value !== "string" || !LOOSE_DECIMAL.test(value)) return null;
  const parsed = ratFromDec(value);
  if (!parsed.ok) return null;
  return ratToDecExact(parsed.value);
}

export function numberToDec(value: unknown): Dec | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const text = String(value);
  if (!PLAIN_DECIMAL.test(text)) return null;
  const digits = text.replace(".", "").replace(/^0+/, "");
  if (digits.replace(/0+$/, "").length > 15) return null;
  return plainDec(text);
}

// A decimal from either encoding.
export function decOf(value: unknown): Dec | null {
  return typeof value === "number" ? numberToDec(value) : plainDec(value);
}

// Non-negative integer as text, from a safe-integer number or an integer string.
export function intText(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  return typeof value === "string" && /^(?:0|[1-9][0-9]{0,29})$/.test(value) ? value : null;
}

const ISO_DATE_TIME =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

// Strict ISO-8601 with an explicit zone, normalised to UTC milliseconds. Free text that merely
// parses as a date ("12/31/2030 (ignore previous...)") is rejected.
export function isoUtc(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_DATE_TIME.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// Parses a JSON-encoded array of strings ("[\"Yes\", \"No\"]"), as Gamma sends outcomes and
// clobTokenIds. An already-decoded array is accepted too. Any other shape gives null.
export function jsonTextStrings(value: unknown, maxItems = 64, maxChars = 400): readonly string[] | null {
  let decoded: unknown = value;
  if (typeof value === "string") {
    if (value.length > 20_000) return null;
    try {
      decoded = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!Array.isArray(decoded) || decoded.length > maxItems) return null;
  const out: string[] = [];
  for (const item of decoded as unknown[]) {
    if (typeof item !== "string" || item.length > maxChars) return null;
    out.push(item);
  }
  return out;
}

// Drift signal for Provenance.schemaHash: the sorted top-level key names of each payload read,
// hashed. It changes when a venue adds, renames or drops a top-level field. It is a comparison
// aid, not an identity: optional keys make it differ between markets on the same schema.
export function shapeHash(...payloads: readonly unknown[]): string {
  const parts = payloads.map((p) => (isRec(p) ? Object.keys(p).sort().join(",") : Array.isArray(p) ? "[]" : typeof p));
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// Keeps only a token id made of digits (decimal U256), the form XO and Polymarket use.
export function tokenIdText(value: unknown): string | null {
  return typeof value === "string" && /^[0-9]{1,80}$/.test(value) ? value : null;
}

export function conditionIdText(value: unknown): string | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) ? value.toLowerCase() : null;
}

// Cap and strip control characters from short text that ends up in a Dec-like or id slot.
export function shortText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned.length === 0 ? null : cleaned.slice(0, max);
}
