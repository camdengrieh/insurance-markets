// Untrusted text: everything a market creator or an upstream service can influence (docs/dapp-design.md 1.3 B5,
// 6 rows 5 and 6). The type is defined in model.ts and re-exported here; this module is the only place that
// builds one from raw text.
//
// The sanitiser is the shared one (untrusted.ts), reused unchanged: it normalises, strips
// bidi controls, zero-width and control characters, collapses whitespace and caps the length. It does NOT
// remove markup or links, and nothing here pretends it does: the control is that an Untrusted<string> is only
// ever rendered as a text node inside a fixed "untrusted" slot (never as HTML, never as a link target, never
// inside an approval-adjacent surface beyond APPROVAL_SLOT_MAX_CHARS).

import { FIELD_LIMITS, UNTRUSTED_DATA_NOTICE, sanitizeUntrusted, type UntrustedField } from "./untrusted.js";

import type { Prov, Untrusted } from "./model.js";

export type { Prov, Untrusted };
export type { UntrustedField };
export { FIELD_LIMITS, UNTRUSTED_DATA_NOTICE };

// The one slot near an approval (Signature Card, order ticket) gets at most this many characters.
export const APPROVAL_SLOT_MAX_CHARS = 80;

export const EXTERNAL_LINK_REL = "noopener noreferrer nofollow";
const MAX_URL_CHARS = 2048;

export function untrusted<T>(value: T): Untrusted<T> {
  return Object.freeze({ untrusted: true as const, value });
}

export function isUntrusted(value: unknown): value is Untrusted<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { untrusted?: unknown; value?: unknown };
  return candidate.untrusted === true && "value" in candidate;
}

export interface SanitizedText {
  readonly text: Untrusted<string>;
  // Informational heuristics from the shared sanitiser ("markup", "url", "instruction-like", ...). Hints for a
  // human: nothing may depend on them for safety, and a missing flag proves nothing.
  readonly flags: readonly string[];
  readonly truncated: boolean;
}

// Raw upstream text of a known field kind -> sanitised, branded, length-capped.
export function sanitizeText(field: UntrustedField, input: unknown, source?: string): SanitizedText {
  const result = sanitizeUntrusted(input, { maxChars: FIELD_LIMITS[field], ...(source === undefined ? {} : { source }) });
  return Object.freeze({ text: untrusted(result.text), flags: result.flags, truncated: result.truncated });
}

// The common case: the branded string only.
export function untrustedField(field: UntrustedField, input: unknown, source?: string): Untrusted<string> {
  return sanitizeText(field, input, source).text;
}

// Text for an approval-adjacent slot: sanitised again at the slot length, so a long title cannot push the
// real summary off the card. Returns a plain string because it is destined for a text node.
export function approvalSlotText(value: Untrusted<string>, maxChars: number = APPROVAL_SLOT_MAX_CHARS): string {
  const limit = Math.min(Math.max(maxChars, 16), APPROVAL_SLOT_MAX_CHARS);
  return sanitizeUntrusted(value.value, { maxChars: limit }).text;
}

// The only way to read an Untrusted<string> out: the result goes into `textContent` or a React text child.
export function forTextNode(value: Untrusted<string>): string {
  return value.value;
}

// A link target from market data (rules sources) is shown as text first; it becomes a real link only if it is a
// plain https URL without credentials. javascript:, data:, http:, userinfo and odd ports return null.
export function safeHttpsUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_URL_CHARS) return null;
  if (/[\u0000- \u007f-\u009f\\<>"'`]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  if (!/^[a-z0-9.-]+$/.test(url.hostname) || !url.hostname.includes(".")) return null;
  // A numeric last label is an IPv4 address (loopback, LAN): never a link target from market data.
  if (/^[0-9]+$/.test(url.hostname.split(".").pop() ?? "")) return null;
  return url.href;
}
