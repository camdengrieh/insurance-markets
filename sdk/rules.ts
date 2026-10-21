// Rules hash and masked hash (docs/market-linking-design.md section 5 and 6.7). The ONE rules fingerprint recipe
// for every client: the linker pins it, pm_verify_link recomputes it and the dApp's venue readers fill
// Market.rules.sha256 with it, so a proposed or approved link can be re-checked anywhere
// (docs/sdk-and-api-design.md step 2). Pure and isomorphic.
//
// rulesSha256  = sha256( canonical rule text )                           recipe "rules-v2"
// maskedSha256 = sha256( rule text with entity/date/time/number/venue spans replaced by
//                        slot markers )                                  recipe "mask-v1"
//
// The rules hash is an equality pin: any change to the rule-bearing fields changes it, and a
// pinned link then suspends. The masked hash is only a TEMPLATE key (it ignores dates, numbers,
// venue names and listed entities). Equal masked hashes are never proof of equal questions, so
// nothing in pm/links treats them as such.
//
// Canonical text (rules-v2): join the venue's rule-bearing fields with U+241F, decode a fixed set
// of entities once, NFC, drop format and control characters (zero-width, bidi), collapse all
// whitespace to single spaces, trim. Case is kept: a case change is a change.
//
// rules-v2 does NOT strip HTML. v1 deleted everything from a "<letter" to the next ">" (or to the
// end of the joined record), so text such as "A<B" hid every later field from the pin. Markup is
// kept as literal text: rendering is not part of the contract, and an edit inside a tag is still an
// edit. NFC, not NFKC: NFKC folds "10^2" (superscript) into "102", a different number with the
// same pin. NFKC is applied only to the masked template form (mask-v1), which is a template key.
//
// Restricted-terms venues (Kalshi): the functions hold the text in memory only and return hashes;
// callers must never persist the canonical or masked text for those venues.

import type { Result } from "./model.js";
import { sha256Hex } from "./hash.js";

export const RULES_HASH_RECIPE = "rules-v2";
export const MASK_RECIPE = "mask-v1";
export const FIELD_SEPARATOR = "␟";
export const ARRAY_SEPARATOR = "␞";
// Same ceiling as the untrusted-text guardrail; longer input is refused rather than truncated,
// because a truncated hash would pin something other than the rules.
export const MAX_RULE_CHARS = 65_536;

export type RuleVenue = "xo" | "polymarket" | "kalshi" | "limitless" | "udx";

// Rule-bearing fields per venue, in hash order (design section 5).
export const RULE_FIELDS: Readonly<Record<RuleVenue, readonly string[]>> = Object.freeze({
  polymarket: ["description", "resolutionSource", "endDate"],
  kalshi: ["rules_primary", "rules_secondary", "close_time"],
  limitless: ["description", "expirationTimestamp"],
  xo: ["rules", "resolutionSources", "resolverAddress", "expiresAt"],
  udx: ["description", "expires_at"],
});

export function isRuleVenue(value: unknown): value is RuleVenue {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(RULE_FIELDS, value);
}

export type HashError =
  | "NO_RECIPE"
  | "MISSING_FIELD"
  | "BAD_FIELD_TYPE"
  | "TOO_LONG"
  | "EMPTY";

// ---------------------------------------------------------------------------------------------
// Entities

const NAMED_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
});

// Decodes once: "&amp;lt;" becomes "&lt;", never "<". Unknown or invalid entities stay as is.
export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,8});/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return whole;
      }
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

// ---------------------------------------------------------------------------------------------
// Canonical text

export function canonicalRuleText(joined: string): string {
  const noInvisible = joined.normalize("NFC").replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, (c) => (/\s|\u0085/u.test(c) ? " " : ""));
  return noInvisible.replace(/[\s\u0085]+/gu, " ").trim();
}

export type FieldValue = string | number | null | readonly (string | number)[];

// Entities are decoded once per field and separator characters (also ones an entity decodes to)
// become spaces, so field boundaries stay unambiguous.
function scrub(text: string): string {
  return decodeEntities(text).split(FIELD_SEPARATOR).join(" ").split(ARRAY_SEPARATOR).join(" ");
}

function fieldToText(value: FieldValue): Result<string, HashError> {
  if (value === null) return { ok: true, value: "" };
  if (typeof value === "string") return { ok: true, value: scrub(value) };
  if (typeof value === "number") {
    return Number.isSafeInteger(value)
      ? { ok: true, value: String(value) }
      : { ok: false, error: "BAD_FIELD_TYPE", detail: "numeric rule fields must be safe integers" };
  }
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value as readonly unknown[]) {
      if (typeof item === "string") parts.push(scrub(item));
      else if (typeof item === "number" && Number.isSafeInteger(item)) parts.push(String(item));
      else return { ok: false, error: "BAD_FIELD_TYPE", detail: "array items must be strings or safe integers" };
    }
    return { ok: true, value: parts.join(ARRAY_SEPARATOR) };
  }
  return { ok: false, error: "BAD_FIELD_TYPE" };
}

export interface CanonicalRules {
  readonly text: string;
  readonly rulesSha256: string;
}

// `fields` is already in recipe order.
export function canonicalizeFields(fields: readonly FieldValue[]): Result<CanonicalRules, HashError> {
  const texts: string[] = [];
  let total = 0;
  for (const field of fields) {
    const t = fieldToText(field);
    if (!t.ok) return t;
    total += t.value.length;
    if (total > MAX_RULE_CHARS) return { ok: false, error: "TOO_LONG" };
    texts.push(t.value);
  }
  const text = canonicalRuleText(texts.join(FIELD_SEPARATOR));
  // Only separators left means every rule field was empty: that would pin "nothing".
  if (text.replaceAll(FIELD_SEPARATOR, "").replaceAll(ARRAY_SEPARATOR, "").trim() === "") {
    return { ok: false, error: "EMPTY", detail: "all rule-bearing fields are empty" };
  }
  return { ok: true, value: { text, rulesSha256: sha256Hex(text) } };
}

// Reads the venue's rule fields out of a raw market record. A field that is absent (not null) is an
// error: a schema change must not silently produce a different hash.
export function canonicalizeRecord(
  venue: string,
  record: Readonly<Record<string, unknown>>,
): Result<CanonicalRules, HashError> {
  if (!isRuleVenue(venue)) return { ok: false, error: "NO_RECIPE", detail: venue };
  const fields: FieldValue[] = [];
  for (const name of RULE_FIELDS[venue]) {
    if (!Object.prototype.hasOwnProperty.call(record, name)) {
      return { ok: false, error: "MISSING_FIELD", detail: name };
    }
    fields.push(record[name] as FieldValue);
  }
  return canonicalizeFields(fields);
}

// ---------------------------------------------------------------------------------------------
// Masking

export const MARKERS = Object.freeze({
  url: "⟦URL⟧",
  addr: "⟦ADDR⟧",
  date: "⟦DATE⟧",
  time: "⟦TIME⟧",
  venue: "⟦VENUE⟧",
  entity: "⟦ENT⟧",
  num: "⟦NUM⟧",
});

const MONTH =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const WORD_START = "(?<![\\p{L}\\p{N}])";
const WORD_END = "(?![\\p{L}\\p{N}])";
const TZ = "(?:UTC|GMT|ET|EST|EDT|CT|CST|CDT|PT|PST|PDT|MT|MST|MDT|Z)";

const URL_RE = /https?:\/\/[^\s␟]+/gu;
const ADDR_RE = /0x[0-9a-fA-F]{40,64}(?![0-9a-fA-F])/gu;
const ISO_DATE_RE =
  /(?<![\p{L}\p{N}])\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?(?![\p{L}\p{N}])/gu;
const MONTH_DATE_RE = new RegExp(
  `${WORD_START}(?:${MONTH}\\.? \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?|\\d{1,2}(?:st|nd|rd|th)? (?:of )?${MONTH}\\.?(?:,? \\d{4})?|${MONTH}\\.?,? \\d{4})${WORD_END}`,
  "gu",
);
const SLASH_DATE_RE = /(?<![\p{L}\p{N}])\d{1,2}\/\d{1,2}\/\d{2,4}(?![\p{L}\p{N}])/gu;
const TIME_RE = new RegExp(
  `${WORD_START}(?:\\d{1,2}:\\d{2}(?::\\d{2})?(?: ?[AaPp]\\.?[Mm]\\.?)?|\\d{1,2} ?[AaPp]\\.?[Mm]\\.?)(?: ?${TZ})?${WORD_END}`,
  "gu",
);
const NUM_RE = /(?<![\p{L}\p{N}])[$€£]?\d[\d,]*(?:\.\d+)?(?:%|(?:st|nd|rd|th)|[kKmMbB])?(?![\p{L}\p{N}])/gu;

// Display names that identify a venue. Longer names first so "Polymarket US" wins over "Polymarket".
const VENUE_NAMES = [
  "Polymarket US",
  "Polymarket",
  "Kalshi",
  "Limitless",
  "Predict.fun",
  "PredictIt",
  "Hyperliquid",
  "Manifold",
  "Opinion",
  "Trueo",
  "XO Market",
  "XO",
];

const VENUE_RE = new RegExp(
  `${WORD_START}(?:${VENUE_NAMES.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})${WORD_END}`,
  "gu",
);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface MaskOptions {
  // Entity alias table (clubs, candidates, central banks, tickers). Matched case-insensitively as
  // whole words, longest first. The table must be versioned by the caller.
  readonly entities?: readonly string[];
}

// Applies mask-v1 to canonical rule text. Literal marker characters in the input are removed first
// so hostile text cannot forge a marker.
export function maskRuleText(canonical: string, options: MaskOptions = {}): string {
  // NFKC here only: a template key may fold compatibility forms, the equality pin may not.
  let text = canonical.normalize("NFKC").replace(/[⟦⟧]/gu, " ");
  text = text.replace(URL_RE, MARKERS.url);
  text = text.replace(ADDR_RE, MARKERS.addr);
  text = text.replace(ISO_DATE_RE, MARKERS.date);
  text = text.replace(MONTH_DATE_RE, MARKERS.date);
  text = text.replace(SLASH_DATE_RE, MARKERS.date);
  text = text.replace(TIME_RE, MARKERS.time);
  text = text.replace(VENUE_RE, MARKERS.venue);
  const entities = [...new Set((options.entities ?? []).map((e) => e.normalize("NFKC").trim()).filter((e) => e !== ""))]
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
  if (entities.length > 0) {
    const entityRe = new RegExp(`${WORD_START}(?:${entities.map(escapeRegExp).join("|")})${WORD_END}`, "giu");
    text = text.replace(entityRe, MARKERS.entity);
  }
  text = text.replace(NUM_RE, MARKERS.num);
  return text.replace(/ {2,}/g, " ").trim();
}

export interface RuleHashes {
  readonly canonical: string;
  readonly masked: string;
  readonly rulesSha256: string;
  readonly maskedSha256: string;
}

export function hashCanonical(canonical: CanonicalRules, options: MaskOptions = {}): RuleHashes {
  const masked = maskRuleText(canonical.text, options);
  return {
    canonical: canonical.text,
    masked,
    rulesSha256: canonical.rulesSha256,
    maskedSha256: sha256Hex(masked),
  };
}

// One call from a raw market record to both pins.
export function hashRuleRecord(
  venue: string,
  record: Readonly<Record<string, unknown>>,
  options: MaskOptions = {},
): Result<RuleHashes, HashError> {
  const canonical = canonicalizeRecord(venue, record);
  if (!canonical.ok) return canonical;
  return { ok: true, value: hashCanonical(canonical.value, options) };
}

// Fingerprint of the entity table, recorded in bundle manifests so a changed alias table is visible.
export function entityTableSha256(entities: readonly string[]): string {
  const sorted = [...new Set(entities.map((e) => e.normalize("NFKC").trim()).filter((e) => e !== ""))].sort();
  return sha256Hex(JSON.stringify(sorted));
}

// ---------------------------------------------------------------------------------------------
// Rule-field builders: the one place each venue's raw record becomes the record `canonicalizeRecord` hashes.
// The linker, the pm adapters and the dApp's venue readers all call these, so the fields, their order and
// what counts as "missing" cannot drift between clients. A builder returns null when the record cannot be
// hashed honestly (a required field is absent, or the read was lossy); callers show "no fingerprint".

export type RuleRecord = Readonly<Record<string, FieldValue>>;

const isText = (value: unknown): value is string => typeof value === "string";

// Gamma market record. The description of the market itself only: an event description shown as a display
// fallback is not part of the fingerprint.
export function polymarketRuleFields(market: { readonly description?: unknown; readonly resolutionSource?: unknown; readonly endDate?: unknown }): RuleRecord | null {
  if (!isText(market.description) || !isText(market.endDate)) return null;
  return { description: market.description, resolutionSource: isText(market.resolutionSource) ? market.resolutionSource : null, endDate: market.endDate };
}

export function limitlessRuleFields(market: { readonly description?: unknown; readonly expirationTimestamp?: unknown }): RuleRecord | null {
  const expiry = market.expirationTimestamp;
  if (!isText(market.description) || (typeof expiry !== "string" && typeof expiry !== "number")) return null;
  return { description: market.description, expirationTimestamp: typeof expiry === "number" && !Number.isSafeInteger(expiry) ? String(expiry) : expiry };
}

export function kalshiRuleFields(market: { readonly rules_primary?: unknown; readonly rules_secondary?: unknown; readonly close_time?: unknown }): RuleRecord | null {
  if (!isText(market.rules_primary) || !isText(market.close_time)) return null;
  // rules_secondary is absent on many markets; absence is treated as empty, never as drift.
  return { rules_primary: market.rules_primary, rules_secondary: isText(market.rules_secondary) ? market.rules_secondary : null, close_time: market.close_time };
}

export function udxRuleFields(market: { readonly description?: unknown; readonly expires_at?: unknown }): RuleRecord | null {
  if (!isText(market.description) || !isText(market.expires_at)) return null;
  return { description: market.description, expires_at: market.expires_at };
}

// The shape of an XO market detail as src/xo/client.ts decodes it (structural, so the SDK imports nothing).
export interface XoRuleDetail {
  readonly rules: {
    readonly description: string | null;
    readonly outcomeRules: readonly { readonly outcomeIndex: number; readonly rule: string }[];
    readonly outcomeRulesTotal: number;
  };
  readonly resolutionSources: readonly string[];
  readonly resolutionSourcesTotal: number;
  readonly resolverAddress: string | null;
  readonly expiresAt: string | null;
  readonly omissions: readonly string[];
}

// The decoder records every cut or dropped rule-bearing field in `omissions`; a hash over what was kept would pin
// something other than the rules.
export const XO_RULE_OMISSION = /^(rules[ .]|\d+ outcomeRules |outcomeRules\[|resolutionSources |\d+ resolutionSources )/;
export const XO_MAX_RESOLUTION_SOURCES = 20;

export function xoLossyRuleRead(detail: XoRuleDetail): string | null {
  if (detail.rules.outcomeRulesTotal > detail.rules.outcomeRules.length) return "outcomeRules were not all read";
  if (detail.resolutionSourcesTotal > detail.resolutionSources.length) return "resolutionSources were not all read";
  return detail.omissions.some((o) => XO_RULE_OMISSION.test(o)) ? "a rule-bearing field was cut or dropped when read" : null;
}

// The XO rules text as shown and hashed: the description, then one paragraph per outcome rule.
export function xoRulesText(detail: XoRuleDetail): string {
  const description = detail.rules.description === null ? "" : String(detail.rules.description);
  const parts = description === "" ? [] : [description];
  for (const rule of detail.rules.outcomeRules) parts.push(`Outcome ${rule.outcomeIndex}: ${String(rule.rule)}`);
  return parts.join("\n\n");
}

export function xoRuleFields(detail: XoRuleDetail): RuleRecord | null {
  if (xoLossyRuleRead(detail) !== null) return null;
  const text = xoRulesText(detail);
  if (text === "") return null;
  return {
    rules: text,
    resolutionSources: detail.resolutionSources.slice(0, XO_MAX_RESOLUTION_SOURCES).map(String),
    resolverAddress: detail.resolverAddress,
    expiresAt: detail.expiresAt,
  };
}

// The fingerprint a reader puts in Market.rules.sha256: lowercase hex, or "" when there is nothing honest to
// hash ("no fingerprint", which never matches anything).
export function rulesFingerprint(venue: RuleVenue, record: RuleRecord | null): string {
  if (record === null) return "";
  const result = canonicalizeRecord(venue, record);
  return result.ok ? result.value.rulesSha256 : "";
}

// For venues with no recipe in RULE_FIELDS: the same canonicalisation (rules-v2) over the reader's own ordered
// fields. Such a fingerprint detects change on that venue; it is never compared with another venue's.
export function rulesFingerprintOfFields(fields: readonly FieldValue[]): string {
  const result = canonicalizeFields(fields);
  return result.ok ? result.value.rulesSha256 : "";
}
