// Market metadata for a Conviction creation (docs/phase1-gap-closing.md gate 5, section 3.5 rows CR3 and CR4,
// N8; research note 23 sections 3, 8 and the Verification section).
//
// What this file does, all of it pure (no network, no clock, no storage; the caller passes `nowMs`):
//   1. Builds the nine-key metadata JSON from a draft that already passed the offline lint
//      (`lintMarketDraft` is called here, never re-implemented). It never invents a key: the nine keys are
//      the ones every one of the 138 fetched XO files has, and nothing else is emitted [23 sec 3.1].
//   2. Checks any metadata JSON (ours, or the oracle's suggestion) against the deterministic shape and
//      content rules M01 to M10, C02 to C05 and R10 of [23 sec 8]. Findings are fixed-text codes; they never
//      repeat market text.
//   3. Builds the metaDataURI for a URL the user declares for their own host, and ONLY when
//      ENABLE_SELF_HOSTED_METADATA is on (otherwise it refuses with `flag_off`, or `kill_switch`). There is
//      no "draft plus link" substitute: if hosting is not accepted, creation stays blocked (N8, T6).
//   4. Provides the text-fact extractors (numbers, dates, times, comparators, entities) that the diff
//      guard in diff.ts compares.
//
// Honest scope. XO's oracle and indexer have never been seen to fetch a URI outside XO's two buckets (0 of
// 585 precedent, CR4); whether `image_url` or `tags` may be omitted, or whether an extra key breaks the
// indexer, is NOT ESTABLISHABLE WITHOUT XO. The checks here are plugin rules built from observed
// uniformity (138 of 138), not XO's validator. A pass does not mean XO will approve the market.

import { keccak256, stringToBytes } from "viem";

import type { GuardrailConfig } from "../../config.js";
import { RULES_LENGTH, lintMarketDraft, type LintResult, type MarketDraft } from "../../create/lint.js";
import { sanitizeUntrusted } from "../../guardrails/untrusted.js";
import { requireFlag, type Flags } from "../../relay/flags.js";
import { USDC_E_ADDRESS, type Hex } from "../chain/constants.js";

// ---- the schema ------------------------------------------------------------------------------------------

// The nine top-level keys of every metadata file seen (138 of 138), in the order the files list them [23 sec 3.1].
export const METADATA_KEYS = Object.freeze([
  "title",
  "description",
  "category",
  "tags",
  "subcategories",
  "image_url",
  "rules",
  "resolution_sources",
  "outcomes",
] as const);
export type MetadataKey = (typeof METADATA_KEYS)[number];

export interface MetadataOutcome {
  readonly id: 0 | 1;
  readonly title: string;
}
export interface OutcomeRule {
  readonly outcomeIndex: 0 | 1;
  readonly rule: string;
}
export interface MetadataJson {
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly subcategories: readonly string[];
  readonly image_url: string;
  readonly rules: { readonly description: string; readonly outcomeRules: readonly OutcomeRule[] };
  readonly resolution_sources: readonly string[];
  readonly outcomes: readonly MetadataOutcome[];
}

// Top-level categories seen in the metadata sample and in the Data API's category paths (M04) [23 sec 3.1].
export const METADATA_CATEGORIES: readonly string[] = Object.freeze([
  "SPORTS",
  "CRYPTO",
  "FINANCE",
  "POLITICS",
  "TECH",
  "CULTURE",
  "SOCIAL",
  "MENTIONS",
  "OTHER",
  "WEB3",
  "SCIENCE",
  "LEGAL",
  "WEATHER",
]);

// Hosts the observed files and images live on (564 GCS and 21 S3 metadata files; the image buckets are
// their siblings). Observed, never pinned: the buckets migrated on 2026-10-13 and acceptance of any other
// host is unknown [phase1 sec 2.2, 23 sec 2]. They are used for two things only: a declared self-host must
// NOT point into them (you cannot write there), and an image hosted there needs no "unproven host" warning.
export const XO_METADATA_HOSTS: readonly string[] = Object.freeze([
  "storage.googleapis.com/market-metadata-mainnet/",
  "market-metadata-623756711122.s3.eu-west-1.amazonaws.com/",
]);
export const XO_IMAGE_HOSTS: readonly string[] = Object.freeze([
  "storage.googleapis.com/market-image-mainnet/",
  "market-images-623756711122.s3.eu-west-1.amazonaws.com/",
]);

// Plugin choices (hard caps keep a hostile file from becoming a memory or scan problem; the observed
// maxima are far below them: rules.description 2,616 characters, a title under 200).
export const METADATA_LIMITS = Object.freeze({
  maxBytes: 65_536,
  title: 300,
  description: 3000,
  rulesDescription: 6000,
  outcomeRule: 1000,
  outcomeTitle: 100,
  tag: 60,
  subcategory: 60,
  category: 40,
  tags: 20,
  subcategories: 6,
  sources: 12,
  url: 2048,
  // M03 / M09 soft ranges from [23 sec 8.1].
  outcomeRuleMin: 20,
  outcomeRuleMax: 420,
  rulesWarnMin: 300,
  rulesWarnMax: 2700,
  // The URI length XO's own files stay under (96 to 105); the contract has no limit (C03).
  uriWarnChars: 200,
});

// ---- the rule catalogue ----------------------------------------------------------------------------------

// The 39 pre-flight checks of [23 sec 8]: 10 metadata shape (M), 5 on-chain parameter (C), 15 content (R)
// and 9 operational (O). Severity is the note's: BLOCK (do not send), WARN (send only after the user
// accepts), INFO. `mixed` means the note gives one severity per branch.
export const PREFLIGHT_RULE_IDS = Object.freeze([
  "M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08", "M09", "M10",
  "C01", "C02", "C03", "C04", "C05",
  "R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08", "R09", "R10", "R11", "R12", "R13", "R14", "R15",
  "O01", "O02", "O03", "O04", "O05", "O06", "O07", "O08", "O09",
] as const);
export type PreflightRuleId = (typeof PREFLIGHT_RULE_IDS)[number];

export interface PreflightRule {
  readonly severity: "block" | "warn" | "info" | "mixed";
  readonly summary: string;
}

export const PREFLIGHT_RULES: Readonly<Record<PreflightRuleId, PreflightRule>> = Object.freeze({
  M01: { severity: "block", summary: "Exactly the nine keys, with the observed types." },
  M02: { severity: "block", summary: "Two outcomes with ids 0 and 1 and distinct titles; Yes and No preferred." },
  M03: { severity: "mixed", summary: "Two outcome rules with indices 0 and 1, 20 to 420 characters each." },
  M04: { severity: "warn", summary: "A known upper-case category and one or two subcategories." },
  M05: { severity: "info", summary: "Three to five short tags (empty is allowed)." },
  M06: { severity: "warn", summary: "An https image URL; the host's acceptance is unproven." },
  M07: { severity: "mixed", summary: "One to six distinct https sources and no placeholder domain." },
  M08: { severity: "warn", summary: "The title reads as a question and its numbers and dates appear in the rules." },
  M09: { severity: "warn", summary: "rules.description of 300 to 2,700 characters." },
  M10: { severity: "block", summary: "No e-mail address or phone number; handles and profile links need a human look." },
  C01: { severity: "block", summary: "The collateral token is USDC.e." },
  C02: { severity: "block", summary: "startsAt within 60 s of chain time, not after expiresAt; expiresAt at least one hour away." },
  C03: { severity: "warn", summary: "An https, UUID-named .json URI of at most 200 characters." },
  C04: { severity: "block", summary: "An explicit calendar date in the rules lies within 24 hours of expiresAt." },
  C05: { severity: "mixed", summary: "A horizon above 365 days needs a human; under 1 day and above 120 days warn." },
  R01: { severity: "block", summary: "Two mutually exclusive, exhaustive outcomes; say what a draw resolves to." },
  R02: { severity: "block", summary: "A future event: no date earlier than now and a start more than an hour away." },
  R03: { severity: "mixed", summary: "An absolute cutoff: a date, a clock time and a timezone." },
  R04: { severity: "warn", summary: "A primary source with URL, a fallback, a precedence sentence and an unavailable-source clause." },
  R05: { severity: "warn", summary: "A primary source that actually publishes the metric." },
  R06: { severity: "warn", summary: "Void and edge-case clauses; prefer a fixed cutoff that resolves No." },
  R07: { severity: "warn", summary: "Thresholds with unit, comparator, reference time and snapshot rule." },
  R08: { severity: "warn", summary: "Entities named: league, season, round, both teams, token contract and chain." },
  R09: { severity: "block", summary: "No duplicate of a live market." },
  R10: { severity: "block", summary: "No mention of XO or its metrics." },
  R11: { severity: "block", summary: "No prohibited topic (violence, self-harm, personal data)." },
  R12: { severity: "block", summary: "Objective, archived, publicly verifiable resolution." },
  R13: { severity: "warn", summary: "Not a composite of independent claims." },
  R14: { severity: "warn", summary: "Key facts in the rules, not in a thesis or note." },
  R15: { severity: "info", summary: "Prefer a proven family template (sports, one to seven days)." },
  O01: { severity: "block", summary: "The account holds at least the fee in USDC.e plus the seed and a buffer; allowance covers the fee." },
  O02: { severity: "block", summary: "The batch is exactly approve(manager) then createConvictionMarket." },
  O03: { severity: "block", summary: "Cadence (the plugin sets no cap; this rule stays as a user-visible warning)." },
  O04: { severity: "warn", summary: "The account profile shows the XO Catalyst badge (ToS Annex A)." },
  O05: { severity: "block", summary: "Persist an intent hash; reconcile by CLOBMarketCreated; never auto-retry." },
  O06: { severity: "info", summary: "After inclusion parse CLOBMarketCreated and poll MarketReviewed." },
  O07: { severity: "block", summary: "On UPDATE_REQUIRED diff the suggestion and its expiry before accepting." },
  O08: { severity: "info", summary: "Seed only when the orderbook says active; retry 422 with backoff." },
  O09: { severity: "block", summary: "Selector closed or paused: stop and record the capability closed." },
});

// The rules this file enforces itself (as findings of validateMetadata, checkCreateParams or the URI checks).
// The others live in src/create/lint.ts (the draft's wording), in the relay (balances, duplicates, cadence), in
// review.ts (O05 to O07, O09) or in seed.ts (O08). Nothing is silently dropped: this list says where the line is.
export const METADATA_ENFORCED_RULES: readonly PreflightRuleId[] = Object.freeze([
  "M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08", "M09", "M10", "C01", "C02", "C03", "C04", "C05", "R10",
] as const);

// ---- findings --------------------------------------------------------------------------------------------

export type CheckSeverity = "block" | "warn" | "info";

export interface MetadataCheck {
  readonly rule: PreflightRuleId;
  // Stable snake_case code.
  readonly code: string;
  readonly severity: CheckSeverity;
  // Where in the JSON, as a fixed path such as "rules.outcomeRules[1]".
  readonly path: string;
  // Fixed text. It never contains text from the checked file.
  readonly message: string;
}

export interface MetadataValidation {
  // True when the file parsed into the nine-key shape and no check blocked.
  readonly ok: boolean;
  readonly checks: readonly MetadataCheck[];
  readonly blocks: number;
  readonly warns: number;
  readonly infos: number;
  readonly metadata: MetadataJson | null;
}

function tally(checks: readonly MetadataCheck[], metadata: MetadataJson | null): MetadataValidation {
  const blocks = checks.filter((entry) => entry.severity === "block").length;
  const warns = checks.filter((entry) => entry.severity === "warn").length;
  const infos = checks.length - blocks - warns;
  return { ok: metadata !== null && blocks === 0, checks, blocks, warns, infos, metadata };
}

class CheckSink {
  readonly items: MetadataCheck[] = [];
  add(rule: PreflightRuleId, code: string, severity: CheckSeverity, path: string, message: string): void {
    this.items.push({ rule, code, severity, path, message });
  }
}

// ---- text facts ------------------------------------------------------------------------------------------

// Every extractor bounds its input, so a hostile field cannot make a scan slow.
const MAX_FACT_CHARS = 14_000;

function bounded(text: string): string {
  return text.length > MAX_FACT_CHARS ? text.slice(0, MAX_FACT_CHARS) : text;
}

const MONTH_NUMBER: Readonly<Record<string, number>> = Object.freeze({
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
});
const MONTH_WORD = "(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\\.?";

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
function daysInMonth(year: number | null, month: number): number {
  if (month === 2) return year !== null && isLeap(year) ? 29 : year === null ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
function two(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export interface DateFact {
  // "YYYY-MM-DD", "--MM-DD" when the text gives no year, "YYYY" prefixed by Y ("Y2026") for a bare year, or
  // "~a/b/c" for a slash date whose order is unknown.
  readonly key: string;
  readonly year: number | null;
  readonly month: number;
  readonly day: number;
  // "HH:MM" when the text is an ISO date-time.
  readonly time: string | null;
  // The zone of that time: "UTC" for Z or a zero offset, the offset text for another, null when absent.
  readonly zone: string | null;
}
export interface TimeFact {
  // 24-hour "HH:MM".
  readonly clock: string;
  // Upper-case zone label as written ("UTC", "ET"), or null when none was written.
  readonly zone: string | null;
}

interface Span {
  readonly start: number;
  readonly end: number;
}

function overlaps(spans: readonly Span[], start: number, end: number): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}

function validDay(year: number | null, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

interface DateScan {
  readonly facts: DateFact[];
  readonly spans: Span[];
}

function scanDates(input: string): DateScan {
  const text = bounded(input);
  const entries: { readonly fact: DateFact; readonly span: Span }[] = [];
  const spans: Span[] = [];
  const push = (fact: DateFact, start: number, end: number): void => {
    if (overlaps(spans, start, end)) return;
    spans.push({ start, end });
    entries.push({ fact, span: { start, end } });
  };
  const monthOf = (word: string): number => MONTH_NUMBER[word.toLowerCase().replace(/\.$/, "")] ?? 0;

  // ISO, with an optional time part: 2026-12-31 or 2026-12-31T23:59:59Z.
  const iso = /(?<![\p{L}\p{N}])(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?(?![\p{L}\p{N}])/gu;
  for (const match of text.matchAll(iso)) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!validDay(year, month, day)) continue;
    const time = match[4] !== undefined && match[5] !== undefined && Number(match[4]) < 24 && Number(match[5]) < 60 ? `${match[4]}:${match[5]}` : null;
    const offset = match[6];
    const zone = time === null || offset === undefined ? null : offset === "Z" || /^[+-]00:?00$/.test(offset) ? "UTC" : offset;
    push({ key: `${match[1]}-${match[2]}-${match[3]}`, year, month, day, time, zone }, match.index ?? 0, (match.index ?? 0) + match[0].length);
  }

  // "December 31, 2026", "Dec. 31 2026", "December 31st, 2026".
  const monthDayYear = new RegExp(`(?<![\\p{L}\\p{N}])(${MONTH_WORD})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,\\s*|\\s+)(\\d{4})(?![\\p{L}\\p{N}])`, "giu");
  for (const match of text.matchAll(monthDayYear)) {
    const month = monthOf(match[1] ?? "");
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (!validDay(year, month, day)) continue;
    push({ key: `${year}-${two(month)}-${two(day)}`, year, month, day, time: null, zone: null }, match.index ?? 0, (match.index ?? 0) + match[0].length);
  }

  // "31 December 2026", "31st of December, 2026".
  const dayMonthYear = new RegExp(`(?<![\\p{L}\\p{N}])(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_WORD})(?:\\s*,\\s*|\\s+)(\\d{4})(?![\\p{L}\\p{N}])`, "giu");
  for (const match of text.matchAll(dayMonthYear)) {
    const month = monthOf(match[2] ?? "");
    const day = Number(match[1]);
    const year = Number(match[3]);
    if (!validDay(year, month, day)) continue;
    push({ key: `${year}-${two(month)}-${two(day)}`, year, month, day, time: null, zone: null }, match.index ?? 0, (match.index ?? 0) + match[0].length);
  }

  // Slash dates: the order (US or not) is not knowable, so the raw text is the key.
  const slash = /(?<![\p{L}\p{N}/])(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?![\p{L}\p{N}/])/gu;
  for (const match of text.matchAll(slash)) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (a < 1 || a > 31 || b < 1 || b > 31) continue;
    push({ key: `~${a}/${b}/${match[3]}`, year: null, month: 0, day: 0, time: null, zone: null }, match.index ?? 0, (match.index ?? 0) + match[0].length);
  }

  // Without a year: "December 31", "31 December".
  const monthDay = new RegExp(`(?<![\\p{L}\\p{N}])(${MONTH_WORD})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?![\\p{L}\\p{N}])`, "giu");
  for (const match of text.matchAll(monthDay)) {
    const month = monthOf(match[1] ?? "");
    const day = Number(match[2]);
    if (!validDay(null, month, day)) continue;
    push({ key: `--${two(month)}-${two(day)}`, year: null, month, day, time: null, zone: null }, match.index ?? 0, (match.index ?? 0) + match[0].length);
  }
  const dayMonth = new RegExp(`(?<![\\p{L}\\p{N}])(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_WORD})(?![\\p{L}\\p{N}])`, "giu");
  for (const match of text.matchAll(dayMonth)) {
    const month = monthOf(match[2] ?? "");
    const day = Number(match[1]);
    if (!validDay(null, month, day)) continue;
    push({ key: `--${two(month)}-${two(day)}`, year: null, month, day, time: null, zone: null }, match.index ?? 0, (match.index ?? 0) + match[0].length);
  }

  // A bare year ("by the end of 2026", "the 2026-27 season"). A price such as "$2000" is not one: a
  // currency sign or a comma in front keeps it a number.
  const bareYear = /(?<![\p{L}\p{N}.,$€£¥/:-])((?:19|20)\d{2})(?![\p{L}\p{N}%/:]|[.,]\d)/gu;
  for (const match of text.matchAll(bareYear)) {
    const year = Number(match[1]);
    push({ key: `Y${year}`, year, month: 0, day: 0, time: null, zone: null }, match.index ?? 0, (match.index ?? 0) + match[0].length);
  }
  entries.sort((a, b) => a.span.start - b.span.start);
  return { facts: entries.map((entry) => entry.fact), spans };
}

// Every calendar date the text states, de-duplicated, in order of appearance.
export function extractDates(text: string): DateFact[] {
  const seen = new Set<string>();
  const out: DateFact[] = [];
  for (const fact of scanDates(text).facts) {
    const key = `${fact.key}|${fact.time ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fact);
  }
  return out;
}

const ZONES = "UTC|GMT|Z|EST|EDT|ET|CST|CDT|CT|MST|MDT|MT|PST|PDT|PT|BST|CET|CEST|IST|JST|AEST|AEDT|HKT|SGT|KST|UTC[+-]\\d{1,2}";

interface TimeScan {
  readonly facts: TimeFact[];
  readonly spans: Span[];
}

function scanTimes(input: string, blocked: readonly Span[]): TimeScan {
  const text = bounded(input);
  const facts: TimeFact[] = [];
  const spans: Span[] = [];
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}:])(\\d{1,2}):(\\d{2})(?::(\\d{2}))?(?:\\s?(a\\.?m\\.?|p\\.?m\\.?))?(?:\\s?(${ZONES})(?![\\p{L}\\p{N}]))?(?![\\p{L}\\p{N}:])`, "giu");
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlaps(blocked, start, end)) continue;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const meridiem = (match[4] ?? "").toLowerCase().replace(/\./g, "");
    if (meridiem !== "") {
      if (hour < 1 || hour > 12) continue;
      hour = hour % 12 + (meridiem === "pm" ? 12 : 0);
    }
    if (hour > 23 || minute > 59) continue;
    spans.push({ start, end });
    facts.push({ clock: `${two(hour)}:${two(minute)}`, zone: match[5] === undefined ? null : match[5].toUpperCase() });
  }
  return { facts, spans };
}

// Every clock time the text states ("23:59 UTC", "11:30 pm ET"), de-duplicated. Times inside an ISO
// date-time are reported by `extractDates` (their `time`), not here.
export function extractTimes(text: string): TimeFact[] {
  const dates = scanDates(text);
  const seen = new Set<string>();
  const out: TimeFact[] = [];
  for (const fact of scanTimes(text, dates.spans).facts) {
    const key = `${fact.clock}|${fact.zone ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fact);
  }
  return out;
}

// Replace spans with spaces, so later scans cannot read digits that belong to a date, a time or a URL.
function maskSpans(text: string, spans: readonly Span[]): string {
  if (spans.length === 0) return text;
  const chars = text.split("");
  for (const span of spans) for (let index = span.start; index < Math.min(span.end, chars.length); index += 1) chars[index] = " ";
  return chars.join("");
}

function linkSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s)>\]"'<]+/giu)) spans.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  for (const match of text.matchAll(/(?<![\p{L}\p{N}@.-])(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)>\]"'<]*)?(?![\p{L}\p{N}@-])/giu)) {
    const start = match.index ?? 0;
    if (!overlaps(spans, start, start + match[0].length)) spans.push({ start, end: start + match[0].length });
  }
  for (const match of text.matchAll(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu)) spans.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  return spans;
}

// Move the decimal point of "whole.fraction" by `shift` places (positive: right) without floats.
function shiftDecimal(whole: string, fraction: string, shift: number): string {
  const digits = `${whole}${fraction}`;
  const point = whole.length + shift;
  let integer: string;
  let rest: string;
  if (point <= 0) {
    integer = "0";
    rest = `${"0".repeat(-point)}${digits}`;
  } else if (point >= digits.length) {
    integer = `${digits}${"0".repeat(point - digits.length)}`;
    rest = "";
  } else {
    integer = digits.slice(0, point);
    rest = digits.slice(point);
  }
  integer = integer.replace(/^0+(?=\d)/, "");
  rest = rest.replace(/0+$/, "");
  return rest === "" ? integer : `${integer}.${rest}`;
}

const SUFFIX_SHIFT: Readonly<Record<string, number>> = Object.freeze({ k: 3, thousand: 3, m: 6, million: 6, b: 9, bn: 9, billion: 9 });

// Every number the text states, normalised and de-duplicated: "$7,429.65" and "7429.65" are "7429.65";
// "3%" and "3 percent" are "3%"; "100k" is "100000". Numbers inside dates, clock times, links and e-mail
// addresses are not numbers here (those are other facts).
export function extractNumbers(input: string): string[] {
  const text = bounded(input);
  const dates = scanDates(text);
  const times = scanTimes(text, dates.spans);
  const masked = maskSpans(text, [...dates.spans, ...times.spans, ...linkSpans(text)]);
  const pattern = /(?<![\p{L}\p{N}_])[$€£¥]?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:\s?(%|percent\b|per\s?cent\b)|(k|m|bn|b)(?![\p{L}\p{N}])|\s(thousand|million|billion)\b)?/giu;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of masked.matchAll(pattern)) {
    const whole = (match[1] ?? "").replace(/,/g, "");
    const fraction = (match[2] ?? "").slice(1);
    const suffix = (match[4] ?? match[5] ?? "").toLowerCase();
    const shift = suffix === "" ? 0 : (SUFFIX_SHIFT[suffix] ?? 0);
    const value = shiftDecimal(whole, fraction, shift);
    const token = match[3] !== undefined ? `${value}%` : value;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

// Comparison and direction wording. Losing one of these families in a rewrite is the "at least" versus
// "more than" kind of change: a boundary or a direction moved (R07).
const COMPARATOR_FAMILIES: readonly (readonly [string, RegExp])[] = Object.freeze([
  ["at_least", /\bat least\b|\bor more\b|\bor (?:higher|greater|above|over)\b|\bno (?:less|fewer) than\b|\bnot (?:less|fewer|lower|below) than\b|\bgreater than or equal\b|\bminimum of\b|≥|>=/iu],
  ["more_than", /\bmore than(?! or equal)\b|\bgreater than(?! or equal)\b|\babove\b|\bover\b|\bexceed(?:s|ed|ing)?\b|\bhigher than(?! or equal)\b|\bbeyond\b/iu],
  ["at_most", /\bat most\b|\bor (?:less|fewer|lower|below|under)\b|\bno more than\b|\bless than or equal\b|\bmaximum of\b|≤|<=/iu],
  ["less_than", /\bless than(?! or equal)\b|\bfewer than(?! or equal)\b|\bbelow\b|\bunder\b|\blower than(?! or equal)\b/iu],
  ["rise", /\b(?:rise|rises|rose|rising|increase\w*|gain\w*|climb\w*|surge\w*|rally|rallies)\b/iu],
  ["fall", /\b(?:fall|falls|fell|falling|decline\w*|drop\w*|decrease\w*|plunge\w*|crash\w*|close(?:s)? down|down by)\b/iu],
]);

export function extractComparators(input: string): string[] {
  const text = bounded(input).normalize("NFKC");
  return COMPARATOR_FAMILIES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

export interface EntityFact {
  // The entity as written (trimmed), at most 80 characters.
  readonly text: string;
  // Letters and digits only, lower-case.
  readonly key: string;
  // Lower-case significant words of at least three letters.
  readonly words: readonly string[];
}

const ENTITY_STOP = new Set(
  (
    "this that the a an in on at by for to of and or but yes no not if else otherwise will would should can could may might must is are was were be been it its as with from than then " +
    "there these those which who whom what when where how why all any each every some such only also both either neither primary secondary source sources market markets resolution resolves " +
    "resolve resolved outcome outcomes rule rules position positions note notes final official unless until after before during while however therefore " +
    "january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec " +
    "monday tuesday wednesday thursday friday saturday sunday"
  ).split(" "),
);
const ACRONYM_STOP = new Set(["UTC", "GMT", "ET", "EST", "EDT", "CT", "CST", "CDT", "MT", "MST", "MDT", "PT", "PST", "PDT", "AM", "PM", "OR", "AND", "NO", "YES", "URL", "API", "USD", "EUR", "GBP", "FAQ"]);
const CONNECTORS = new Set(["of", "de", "del", "da", "di", "la", "le", "van", "von", "der", "du"]);

export function squash(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function cleanWord(word: string): string {
  return word.replace(/['’]s$/iu, "").replace(/[.\-&']+$/u, "");
}

function isCapitalized(word: string): boolean {
  return /^\p{Lu}/u.test(word);
}
function isAcronym(word: string): boolean {
  return /^\p{Lu}[\p{Lu}\p{N}&.\-]*$/u.test(word) && (word.match(/\p{Lu}/gu) ?? []).length >= 2;
}

// Proper-noun phrases: runs of capitalised words (with "of", "de" and the like between them) and
// acronyms. A single capitalised word at the start of a sentence is not an entity. Heuristic and
// English-biased: it errs towards reporting a name, never towards inventing one.
export function extractEntities(input: string): EntityFact[] {
  const text = bounded(input);
  const dateScan = scanDates(text);
  const masked = maskSpans(text, [...linkSpans(text), ...dateScan.spans, ...scanTimes(text, dateScan.spans).spans]);
  const wordPattern = /[\p{L}][\p{L}\p{N}'’&.\-]*/gu;
  interface Token {
    readonly raw: string;
    readonly clean: string;
    readonly start: number;
    readonly end: number;
  }
  const tokens: Token[] = [];
  for (const match of masked.matchAll(wordPattern)) {
    const raw = match[0];
    tokens.push({ raw, clean: cleanWord(raw), start: match.index ?? 0, end: (match.index ?? 0) + raw.length });
  }
  const atSentenceStart = (start: number): boolean => {
    const before = masked.slice(0, start);
    return before.trim() === "" || /[.!?:;]["')\]”’]*\s+$/u.test(before) || /\n\s*$/u.test(before);
  };
  const out: EntityFact[] = [];
  const seen = new Set<string>();
  let index = 0;
  while (index < tokens.length) {
    const first = tokens[index] as Token;
    if (!isCapitalized(first.clean) || first.clean === "") {
      index += 1;
      continue;
    }
    const run: Token[] = [first];
    let next = index + 1;
    while (next < tokens.length) {
      const candidate = tokens[next] as Token;
      const previous = run[run.length - 1] as Token;
      if (!/^[ \t]+$/.test(masked.slice(previous.end, candidate.start))) break;
      if (isCapitalized(candidate.clean)) {
        run.push(candidate);
        next += 1;
        continue;
      }
      const after = tokens[next + 1];
      if (CONNECTORS.has(candidate.clean) && after !== undefined && isCapitalized(after.clean) && /^[ \t]+$/.test(masked.slice(candidate.end, after.start))) {
        run.push(candidate, after);
        next += 2;
        continue;
      }
      break;
    }
    const startedSentence = atSentenceStart(first.start);
    index = next;

    // Drop leading stop words ("The White House", "Will Bitcoin"). Having dropped one, the rest no
    // longer starts a sentence.
    let words = run;
    let strippedLeading = false;
    while (words.length > 0 && (ENTITY_STOP.has(squash((words[0] as Token).clean)) || ACRONYM_STOP.has((words[0] as Token).clean))) {
      words = words.slice(1);
      strippedLeading = true;
    }
    if (words.length === 0) continue;
    if (words.length === 1) {
      const only = words[0] as Token;
      const acronym = isAcronym(only.clean);
      if (!acronym && startedSentence && !strippedLeading) continue;
      if (acronym && ACRONYM_STOP.has(only.clean.replace(/[.]/g, ""))) continue;
      if (ENTITY_STOP.has(squash(only.clean))) continue;
    }
    const entityText = words.map((word) => word.clean).join(" ").slice(0, 80);
    const key = squash(entityText);
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    const significant = words
      .map((word) => squash(word.clean))
      .filter((word) => word.length >= 3 && !CONNECTORS.has(word) && !ENTITY_STOP.has(word));
    out.push({ text: entityText, key, words: significant });
  }
  return out;
}

// Whether `entity` is still present in a text, given that text squashed and its set of squashed words.
export function entityPresent(entity: EntityFact, haystack: string, wordSet: ReadonlySet<string>): boolean {
  // A short name ("US", "BTC") must match a whole word; as a substring it would match almost anything.
  if (entity.key.length < 4) return wordSet.has(entity.key);
  if (haystack.includes(entity.key)) return true;
  return entity.words.length > 0 && entity.words.every((word) => haystack.includes(word));
}

export function wordSetOf(text: string): Set<string> {
  const set = new Set<string>();
  for (const match of bounded(text).matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’&.\-]*/gu)) set.add(squash(cleanWord(match[0])));
  return set;
}

// ---- shape and content validation ------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// Control, invisible and bidi characters never belong in a market file: they hide text from the human
// who signs and from the reviewer. Newlines are allowed only in the two long text fields.
const HIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const LONG_TEXT_PATHS = new Set(["description", "rules.description"]);

function hiddenIn(path: string, value: string): boolean {
  const text = LONG_TEXT_PATHS.has(path) ? value.replace(/[\n\r\t]/g, " ") : value;
  return HIDDEN.test(text);
}

function parseHttpsUrl(value: string): URL | null {
  if (value.length === 0 || value.length > METADATA_LIMITS.url || /[\s\p{Cc}]/u.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

const PLACEHOLDER_HOSTS = /^(?:example\.(?:com|org|net)|localhost|test\.com|domain\.com|yoursite\.com|your-?domain\.com|placeholder\.\w+)$|\.(?:example|test|invalid|local|localhost|internal)$/;
function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":") || /^\[.*\]$/.test(host);
}
function isPlaceholderHost(host: string): boolean {
  return PLACEHOLDER_HOSTS.test(host) || isIpLiteral(host);
}

function startsWithBucket(url: URL, buckets: readonly string[]): boolean {
  const target = `${url.hostname.toLowerCase()}${url.pathname}`;
  return buckets.some((bucket) => target.startsWith(bucket.toLowerCase()));
}

// Whether a URI is inside one of XO's two metadata buckets. The oracle's suggestions are always there
// (233 of 233); a suggestion that is not must never be fetched on its own.
export function isXoMetadataUri(uri: string): boolean {
  const url = parseHttpsUrl(uri);
  return url !== null && url.port === "" && url.username === "" && url.password === "" && startsWithBucket(url, XO_METADATA_HOSTS);
}

const SOCIAL_HOSTS = /^(?:twitter\.com|x\.com|instagram\.com|facebook\.com|tiktok\.com|t\.me|linkedin\.com|reddit\.com|youtube\.com|threads\.net|bsky\.app)$/;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/u;
const PHONE = /(?<![\p{N}])(?:\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}|\(\d{3}\)\s?\d{3}-\d{4}|\d{3}-\d{3}-\d{4})(?![\p{N}])/u;
const HANDLE = /(?<![\w@])@[A-Za-z0-9_]{2,30}\b/;
const XO_MENTION = /\bXO\b|\bXO\s+Market\b/;
// Flags from the shared sanitizer that mean the text is trying to steer a reader. "url" and
// "wallet-address" are expected in rules text and are not reported.
const SUSPICIOUS_FLAGS = new Set(["instruction-like", "tool-reference", "role-marker", "code-fence", "markup", "mixed-script", "hex-blob", "had-bidi-controls", "had-tag-chars"]);

type ShapeResult = { readonly metadata: MetadataJson } | { readonly metadata: null };

// Reads a value into the nine-key shape, recording M01, M02 and M03 structure findings. Returns null
// metadata when the shape is not usable; the content checks are skipped then.
function readShape(value: unknown, sink: CheckSink): ShapeResult {
  if (!isPlainObject(value)) {
    sink.add("M01", "not_an_object", "block", "$", "The metadata is not a JSON object.");
    return { metadata: null };
  }
  const keys = Object.keys(value);
  const missing = METADATA_KEYS.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !(METADATA_KEYS as readonly string[]).includes(key));
  if (missing.length > 0) sink.add("M01", "keys_missing", "block", "$", `${missing.length} of the nine required keys are missing: ${missing.join(", ")}.`);
  if (extra.length > 0) sink.add("M01", "keys_extra", "warn", "$", `${extra.length} unexpected key(s). Only the nine observed keys are ever emitted.`);

  let usable = missing.length === 0;
  const str = (path: string, field: unknown, max: number, allowEmpty = false): string | null => {
    if (typeof field !== "string") {
      sink.add("M01", "wrong_type", "block", path, "This field must be a string.");
      usable = false;
      return null;
    }
    if (!allowEmpty && field.trim() === "") {
      sink.add("M01", "empty_text", "block", path, "This field must not be empty.");
      usable = false;
      return null;
    }
    if (field.length > max) {
      sink.add("M01", "too_long", "block", path, `This field is longer than ${max} characters.`);
      usable = false;
      return null;
    }
    return field;
  };
  const strings = (path: string, field: unknown, maxItems: number, maxChars: number): string[] | null => {
    if (!Array.isArray(field)) {
      sink.add("M01", "wrong_type", "block", path, "This field must be an array of strings.");
      usable = false;
      return null;
    }
    if (field.length > maxItems) {
      sink.add("M01", "too_many_items", "block", path, `This array has more than ${maxItems} items.`);
      usable = false;
      return null;
    }
    const out: string[] = [];
    field.forEach((item: unknown, position) => {
      const text = str(`${path}[${position}]`, item, maxChars);
      if (text !== null) out.push(text);
    });
    return out.length === field.length ? out : null;
  };

  const title = str("title", value["title"], METADATA_LIMITS.title);
  const description = str("description", value["description"], METADATA_LIMITS.description);
  const category = str("category", value["category"], METADATA_LIMITS.category);
  const tags = strings("tags", value["tags"], METADATA_LIMITS.tags, METADATA_LIMITS.tag);
  const subcategories = strings("subcategories", value["subcategories"], METADATA_LIMITS.subcategories, METADATA_LIMITS.subcategory);
  const imageUrl = str("image_url", value["image_url"], METADATA_LIMITS.url);
  const sources = strings("resolution_sources", value["resolution_sources"], METADATA_LIMITS.sources, METADATA_LIMITS.url);

  let rulesDescription: string | null = null;
  const outcomeRules: OutcomeRule[] = [];
  const rules = value["rules"];
  if (!isPlainObject(rules)) {
    sink.add("M01", "wrong_type", "block", "rules", "rules must be an object with description and outcomeRules.");
    usable = false;
  } else {
    const ruleKeys = Object.keys(rules).sort().join(",");
    if (ruleKeys !== "description,outcomeRules") {
      sink.add("M01", "rules_keys", "block", "rules", "rules must have exactly description and outcomeRules.");
      usable = false;
    }
    rulesDescription = str("rules.description", rules["description"], METADATA_LIMITS.rulesDescription);
    const list = rules["outcomeRules"];
    if (!Array.isArray(list)) {
      sink.add("M03", "outcome_rules_type", "block", "rules.outcomeRules", "outcomeRules must be an array of exactly two rules.");
      usable = false;
    } else {
      if (list.length !== 2) {
        sink.add("M03", "outcome_rules_count", "block", "rules.outcomeRules", "There must be exactly two outcome rules.");
        usable = false;
      }
      list.slice(0, 8).forEach((item: unknown, position) => {
        const path = `rules.outcomeRules[${position}]`;
        if (!isPlainObject(item) || Object.keys(item).sort().join(",") !== "outcomeIndex,rule") {
          sink.add("M03", "outcome_rule_shape", "block", path, "Each outcome rule must be {outcomeIndex, rule}.");
          usable = false;
          return;
        }
        const index = item["outcomeIndex"];
        const rule = str(`${path}.rule`, item["rule"], METADATA_LIMITS.outcomeRule);
        if (index !== position || (index !== 0 && index !== 1)) {
          sink.add("M03", "outcome_rule_index", "block", path, "The outcome rules must carry indices 0 and 1, in that order.");
          usable = false;
          return;
        }
        if (rule !== null) outcomeRules.push({ outcomeIndex: index, rule });
      });
    }
  }

  const outcomes: MetadataOutcome[] = [];
  const outcomeList = value["outcomes"];
  if (!Array.isArray(outcomeList)) {
    sink.add("M02", "outcomes_type", "block", "outcomes", "outcomes must be an array of exactly two outcomes.");
    usable = false;
  } else {
    if (outcomeList.length !== 2) {
      sink.add("M02", "outcomes_count", "block", "outcomes", "There must be exactly two outcomes.");
      usable = false;
    }
    outcomeList.slice(0, 8).forEach((item: unknown, position) => {
      const path = `outcomes[${position}]`;
      if (!isPlainObject(item) || Object.keys(item).sort().join(",") !== "id,title") {
        sink.add("M02", "outcome_shape", "block", path, "Each outcome must be {id, title}.");
        usable = false;
        return;
      }
      const id = item["id"];
      const outcomeTitle = str(`${path}.title`, item["title"], METADATA_LIMITS.outcomeTitle);
      if (id !== position || (id !== 0 && id !== 1)) {
        sink.add("M02", "outcome_id", "block", path, "The outcomes must carry ids 0 and 1, in that order.");
        usable = false;
        return;
      }
      if (outcomeTitle !== null) outcomes.push({ id, title: outcomeTitle });
    });
  }

  if (
    !usable ||
    title === null ||
    description === null ||
    category === null ||
    tags === null ||
    subcategories === null ||
    imageUrl === null ||
    sources === null ||
    rulesDescription === null ||
    outcomeRules.length !== 2 ||
    outcomes.length !== 2
  ) {
    return { metadata: null };
  }
  return {
    metadata: {
      title,
      description,
      category,
      tags,
      subcategories,
      image_url: imageUrl,
      rules: { description: rulesDescription, outcomeRules },
      resolution_sources: sources,
      outcomes,
    },
  };
}

export interface ValidateContext {
  // The expiry the market will have (unix seconds). Enables C04.
  readonly expiresAtS?: number;
}

// Checks any metadata JSON (a draft's, a hosted file's or the oracle's suggestion) against the
// deterministic rules. Never throws and never repeats text from the file.
export function validateMetadata(value: unknown, context: ValidateContext = {}): MetadataValidation {
  const sink = new CheckSink();
  const shape = readShape(value, sink);
  const metadata = shape.metadata;
  if (metadata === null) return tally(sink.items, null);

  // Hidden characters anywhere.
  const textFields: { readonly path: string; readonly text: string }[] = [
    { path: "title", text: metadata.title },
    { path: "description", text: metadata.description },
    { path: "category", text: metadata.category },
    { path: "rules.description", text: metadata.rules.description },
    ...metadata.tags.map((text, index) => ({ path: `tags[${index}]`, text })),
    ...metadata.subcategories.map((text, index) => ({ path: `subcategories[${index}]`, text })),
    ...metadata.rules.outcomeRules.map((entry, index) => ({ path: `rules.outcomeRules[${index}].rule`, text: entry.rule })),
    ...metadata.outcomes.map((entry, index) => ({ path: `outcomes[${index}].title`, text: entry.title })),
  ];
  for (const field of textFields) {
    if (hiddenIn(field.path, field.text)) {
      sink.add("M01", "hidden_characters", "block", field.path, "This field contains control, invisible or bidirectional characters.");
    }
    const flags = sanitizeUntrusted(field.text, { maxChars: 3000, source: "market-metadata" }).flags.filter((flag) => SUSPICIOUS_FLAGS.has(flag));
    if (flags.length > 0) sink.add("M01", "suspicious_text", "warn", field.path, `The text trips the untrusted-text heuristics (${flags.join(", ")}). Read it yourself.`);
  }
  // Size.
  const bytes = stringToBytes(JSON.stringify(metadata)).length;
  if (bytes > METADATA_LIMITS.maxBytes) sink.add("M01", "file_too_large", "block", "$", `The JSON is larger than ${METADATA_LIMITS.maxBytes} bytes.`);

  // M02: outcomes.
  const [first, second] = metadata.outcomes as readonly [MetadataOutcome, MetadataOutcome];
  if (first.title.trim().toLowerCase() === second.title.trim().toLowerCase()) {
    sink.add("M02", "outcome_titles_equal", "block", "outcomes", "The two outcomes have the same title.");
  }
  if (first.title !== "Yes" || second.title !== "No") {
    sink.add("M02", "outcomes_not_yes_no", "info", "outcomes", "The outcomes are not Yes and No (111 of 138 observed files use Yes and No).");
  }

  // M03: outcome rule length.
  metadata.rules.outcomeRules.forEach((entry, index) => {
    const length = entry.rule.trim().length;
    if (length < METADATA_LIMITS.outcomeRuleMin || length > METADATA_LIMITS.outcomeRuleMax) {
      sink.add("M03", "outcome_rule_length", "warn", `rules.outcomeRules[${index}]`, `An outcome rule is usually ${METADATA_LIMITS.outcomeRuleMin} to ${METADATA_LIMITS.outcomeRuleMax} characters.`);
    }
  });

  // M04: category and subcategories.
  if (!METADATA_CATEGORIES.includes(metadata.category)) {
    sink.add("M04", "category_unknown", "warn", "category", "The category is not one of the upper-case top-level categories seen on XO.");
  }
  if (metadata.subcategories.length < 1 || metadata.subcategories.length > 2) {
    sink.add("M04", "subcategories_count", "warn", "subcategories", "XO's files carry one or two subcategories.");
  }

  // M05: tags.
  if (metadata.tags.length === 0) {
    sink.add("M05", "tags_empty", "info", "tags", "No tags. The oracle's own versions have none and activate, but XO's originals have three to five.");
  } else if (metadata.tags.length < 3 || metadata.tags.length > 5) {
    sink.add("M05", "tags_count", "info", "tags", "XO's originals carry three to five tags.");
  }

  // M06: image.
  const image = parseHttpsUrl(metadata.image_url);
  if (image === null) {
    sink.add("M06", "image_url_invalid", "block", "image_url", "image_url must be an https URL.");
  } else if (!startsWithBucket(image, XO_IMAGE_HOSTS)) {
    sink.add("M06", "image_host_unproven", "warn", "image_url", "The image is not on an XO image bucket. Whether XO's indexer accepts another host is unproven.");
  }

  // M07: sources.
  if (metadata.resolution_sources.length === 0) {
    sink.add("M07", "sources_missing", "block", "resolution_sources", "At least one resolution source is required.");
  }
  if (metadata.resolution_sources.length > 6) {
    sink.add("M07", "sources_many", "warn", "resolution_sources", "XO's files carry one to six sources.");
  }
  const seenSources = new Set<string>();
  metadata.resolution_sources.forEach((source, index) => {
    const path = `resolution_sources[${index}]`;
    const url = parseHttpsUrl(source);
    if (url === null) {
      let insecure = false;
      try {
        insecure = new URL(source).protocol === "http:";
      } catch {
        insecure = false;
      }
      if (insecure) sink.add("M07", "source_insecure", "warn", path, "A source uses http, not https.");
      else sink.add("M07", "source_invalid", "block", path, "A source is not a valid https URL.");
      return;
    }
    if (isPlaceholderHost(hostOf(url))) sink.add("M07", "source_placeholder", "block", path, "A source is a placeholder, local or raw-IP address (a past market was rejected for example.com).");
    if (seenSources.has(url.href)) sink.add("M07", "source_duplicate", "warn", path, "A source is listed twice.");
    seenSources.add(url.href);
    if (SOCIAL_HOSTS.test(hostOf(url)) && url.pathname.replace(/\//g, "") !== "") {
      sink.add("M10", "social_profile_url", "warn", path, "A source is a social-media profile or post. Check that it is an official account, not a private person.");
    }
  });

  // M08: title.
  const title = metadata.title.trim();
  const question = /\?\s*$/.test(title) || /^(?:will|is|are|does|do|did|can|has|have|who|what|which|where|when|how)\b/i.test(title);
  if (!question) sink.add("M08", "title_not_question", "warn", "title", "The title does not read as a question.");
  const ruleText = `${metadata.rules.description} ${metadata.rules.outcomeRules.map((entry) => entry.rule).join(" ")}`;
  const ruleNumbers = new Set(extractNumbers(ruleText));
  if (extractNumbers(title).some((number) => !ruleNumbers.has(number))) {
    sink.add("M08", "title_number_not_in_rules", "warn", "title", "A number in the title does not appear in the rules.");
  }
  const ruleDates = extractDates(ruleText);
  const dateInRules = (fact: DateFact): boolean => {
    if (fact.key.startsWith("Y")) return ruleDates.some((other) => other.year === fact.year);
    if (fact.key.startsWith("~")) return ruleDates.some((other) => other.key === fact.key);
    return ruleDates.some((other) => (fact.year === null ? other.month === fact.month && other.day === fact.day : other.key === fact.key));
  };
  if (extractDates(title).some((fact) => !dateInRules(fact))) {
    sink.add("M08", "title_date_not_in_rules", "warn", "title", "A date in the title does not appear in the rules.");
  }

  // M09: rules length.
  const rulesLength = metadata.rules.description.trim().length;
  if (rulesLength < METADATA_LIMITS.rulesWarnMin || rulesLength > METADATA_LIMITS.rulesWarnMax) {
    sink.add("M09", "rules_length", "warn", "rules.description", `rules.description is usually ${METADATA_LIMITS.rulesWarnMin} to ${METADATA_LIMITS.rulesWarnMax} characters (2,616 at most in the observed files).`);
  }
  if (rulesLength < RULES_LENGTH.tooShort) {
    sink.add("M09", "rules_too_short", "warn", "rules.description", "rules.description is too short to state a checkable condition.");
  }

  // M10 and R10: personal data and the project itself.
  for (const field of textFields) {
    if (EMAIL.test(field.text)) sink.add("M10", "email_address", "block", field.path, "This field contains an e-mail address.");
    if (PHONE.test(field.text)) sink.add("M10", "phone_number", "block", field.path, "This field contains a phone number.");
    if (HANDLE.test(field.text)) sink.add("M10", "handle", "warn", field.path, "This field contains an @handle. Check that it is not a private person.");
    if (XO_MENTION.test(field.text)) sink.add("R10", "mentions_xo", "block", field.path, "This field mentions XO. Markets about the project or its metrics are not permitted.");
  }

  // C04: dates versus the expiry.
  if (context.expiresAtS !== undefined) {
    const expiry = context.expiresAtS;
    if (!Number.isSafeInteger(expiry) || expiry <= 0) {
      sink.add("C04", "expiry_invalid", "block", "$", "The expiry is not a valid unix time.");
    } else {
      // Only full calendar dates can be compared (not a bare year or an order-ambiguous slash date).
      const dates = extractDates(`${metadata.title} ${metadata.rules.description}`).filter((fact) => fact.month > 0);
      if (dates.length > 0 && !dates.some((fact) => dateNearExpiry(fact, expiry))) {
        sink.add("C04", "date_differs_from_expiry", "block", "rules.description", "No explicit calendar date in the title or rules is within 24 hours of the expiry (the oracle has sent markets back for this).");
      }
    }
  }
  return tally(sink.items, metadata);
}

const DAY_S = 86_400;

// Whether a stated date is within 24 hours of the expiry, counting the whole UTC day of the date.
function dateNearExpiry(fact: DateFact, expiryS: number): boolean {
  const years = fact.year === null ? candidateYears(expiryS) : [fact.year];
  return years.some((year) => {
    const start = Date.UTC(year, fact.month - 1, fact.day) / 1000;
    if (!Number.isFinite(start)) return false;
    return expiryS >= start - DAY_S && expiryS <= start + 2 * DAY_S;
  });
}
function candidateYears(expiryS: number): number[] {
  const year = new Date(expiryS * 1000).getUTCFullYear();
  return [year - 1, year, year + 1];
}

// ---- the on-chain parameters (C01, C02, C05) -----------------------------------------------------------

export interface CreateParams {
  // The collateral token the create call will name.
  readonly collateral: string;
  // Chain time when the batch is built, and the two uint40 arguments.
  readonly chainNowS: number;
  readonly startsAtS: number;
  readonly expiresAtS: number;
  // The user has accepted a horizon above 365 days.
  readonly longHorizonAccepted?: boolean;
}

export function checkCreateParams(params: CreateParams): MetadataCheck[] {
  const sink = new CheckSink();
  if (params.collateral.toLowerCase() !== USDC_E_ADDRESS.toLowerCase()) {
    sink.add("C01", "collateral_not_usdce", "block", "collateralToken", "The collateral token must be USDC.e.");
  }
  const whole = [params.chainNowS, params.startsAtS, params.expiresAtS].every((value) => Number.isSafeInteger(value) && value > 0);
  if (!whole) {
    sink.add("C02", "times_invalid", "block", "times", "The chain time, startsAt and expiresAt must be positive whole seconds.");
    return sink.items;
  }
  if (Math.abs(params.startsAtS - params.chainNowS) > 60) sink.add("C02", "starts_at_off", "block", "startsAt", "startsAt must be within 60 seconds of chain time.");
  if (params.startsAtS > params.expiresAtS) sink.add("C02", "starts_after_expiry", "block", "startsAt", "startsAt is after expiresAt.");
  if (params.expiresAtS < params.chainNowS + 3600) sink.add("C02", "expiry_too_soon", "block", "expiresAt", "expiresAt must be at least one hour after chain time.");
  const horizon = params.expiresAtS - params.chainNowS;
  if (horizon > 365 * DAY_S && params.longHorizonAccepted !== true) {
    sink.add("C05", "horizon_over_year", "block", "expiresAt", "The market closes more than 365 days out. Creation needs the user's explicit acceptance of that.");
  } else if (horizon > 120 * DAY_S) {
    sink.add("C05", "horizon_long", "warn", "expiresAt", "Markets closing more than 120 days out pass first review less often (about 38 to 46 percent).");
  }
  if (horizon < DAY_S) sink.add("C05", "horizon_short", "warn", "expiresAt", "Markets closing within a day pass first review less often (about 40 percent, with 12 percent rejects) and can expire while still in review.");
  return sink.items;
}

// ---- the URI of a declared self-host (C03, CR4, N8) ----------------------------------------------------------

export interface UriBuild {
  readonly ok: boolean;
  // The normalised URI to put on chain; null when not ok.
  readonly uri: string | null;
  readonly checks: readonly MetadataCheck[];
}

function uriFindings(declared: string): { readonly uri: string | null; readonly checks: MetadataCheck[] } {
  const sink = new CheckSink();
  if (typeof declared !== "string" || declared.length === 0 || declared.length > METADATA_LIMITS.url || /[\s\p{Cc}\p{Cf}]/u.test(declared)) {
    sink.add("C03", "uri_invalid", "block", "metaDataURI", "The metadata URL is empty, too long or contains whitespace or hidden characters.");
    return { uri: null, checks: sink.items };
  }
  let url: URL;
  try {
    url = new URL(declared);
  } catch {
    sink.add("C03", "uri_invalid", "block", "metaDataURI", "The metadata URL is not a valid URL.");
    return { uri: null, checks: sink.items };
  }
  if (url.protocol !== "https:") sink.add("C03", "uri_not_https", "block", "metaDataURI", "The metadata URL must use https.");
  if (url.username !== "" || url.password !== "") sink.add("C03", "uri_credentials", "block", "metaDataURI", "The metadata URL must not contain a user name or password.");
  if (url.search !== "" || url.hash !== "") sink.add("C03", "uri_query", "block", "metaDataURI", "The metadata URL must not carry a query or fragment (a signed URL would expire before XO reads it).");
  if (url.port !== "") sink.add("C03", "uri_port", "block", "metaDataURI", "The metadata URL must use the default https port.");
  const host = url.hostname.toLowerCase();
  if (isPlaceholderHost(host) || !host.includes(".")) sink.add("C03", "uri_host_local", "block", "metaDataURI", "The metadata URL must be a public host name, not localhost, a raw IP address or a placeholder.");
  if (startsWithBucket(url, XO_METADATA_HOSTS) || startsWithBucket(url, XO_IMAGE_HOSTS)) {
    sink.add("C03", "uri_xo_bucket", "block", "metaDataURI", "The URL points into one of XO's own buckets. You cannot write there; it would reuse another market's file.");
  }
  if (host.split(".").some((label) => label.startsWith("xn--"))) sink.add("C03", "uri_punycode", "warn", "metaDataURI", "The host name uses punycode. Check it is the host you mean.");
  if (!/\.json$/i.test(url.pathname)) sink.add("C03", "uri_not_json_name", "warn", "metaDataURI", "XO's own files are named <uuid>.json.");
  else if (!/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i.test(url.pathname)) {
    sink.add("C03", "uri_not_uuid_name", "warn", "metaDataURI", "XO's own files are named with a UUID.");
  }
  if (url.href.length > METADATA_LIMITS.uriWarnChars) sink.add("C03", "uri_long", "warn", "metaDataURI", `XO's own URIs are 96 to 105 characters; this one is longer than ${METADATA_LIMITS.uriWarnChars}.`);
  if (url.href !== declared) sink.add("C03", "uri_normalised", "info", "metaDataURI", "The URL was normalised (case, escapes or a trailing slash). The normalised form is what goes on chain.");
  sink.add("C03", "self_hosted_unproven", "warn", "metaDataURI", "XO's oracle has never been seen to accept a URI outside XO's own buckets (0 of 585). If it ignores or rejects it the $1 fee is spent.");
  const blocked = sink.items.some((entry) => entry.severity === "block");
  return { uri: blocked ? null : url.href, checks: sink.items };
}

// The metaDataURI for a URL the user declared for their own host. Refuses with `flag_off` (or
// `kill_switch`) unless ENABLE_SELF_HOSTED_METADATA is on: there is no substitute path.
export function buildMetadataUri(declaredUrl: string, flags: Flags): UriBuild {
  requireFlag(flags, "ENABLE_SELF_HOSTED_METADATA");
  const found = uriFindings(declaredUrl);
  return { ok: found.uri !== null, uri: found.uri, checks: found.checks };
}

// ---- canonical text and hash -----------------------------------------------------------------------------

function ordered(metadata: MetadataJson): Record<string, unknown> {
  return {
    title: metadata.title,
    description: metadata.description,
    category: metadata.category,
    tags: [...metadata.tags],
    subcategories: [...metadata.subcategories],
    image_url: metadata.image_url,
    rules: {
      description: metadata.rules.description,
      outcomeRules: metadata.rules.outcomeRules.map((entry) => ({ outcomeIndex: entry.outcomeIndex, rule: entry.rule })),
    },
    resolution_sources: [...metadata.resolution_sources],
    outcomes: metadata.outcomes.map((entry) => ({ id: entry.id, title: entry.title })),
  };
}

// The nine keys in the observed order, compact. What the content hash covers.
export function canonicalMetadataText(metadata: MetadataJson): string {
  return JSON.stringify(ordered(metadata));
}

// The same content, indented, for a person to read and publish. The bytes may be re-saved with other
// whitespace: `hostedMatches` compares the parsed content, not the bytes.
export function prettyMetadataText(metadata: MetadataJson): string {
  return `${JSON.stringify(ordered(metadata), null, 2)}\n`;
}

export function metadataContentHash(metadata: MetadataJson): Hex {
  return keccak256(stringToBytes(canonicalMetadataText(metadata)));
}

export type HostedMatch =
  | { readonly matches: true }
  | { readonly matches: false; readonly reason: "too_large" | "not_json" | "invalid" | "differs" };

// Whether the file served at the declared URL is the file we built. The relay fetches the URL (its
// allowlist includes the declared self-host) and calls this before it sends anything.
export function hostedMatches(hostedText: string, expected: MetadataJson): HostedMatch {
  if (typeof hostedText !== "string" || hostedText.length > METADATA_LIMITS.maxBytes * 2) return { matches: false, reason: "too_large" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(hostedText);
  } catch {
    return { matches: false, reason: "not_json" };
  }
  const shape = validateMetadata(parsed);
  if (shape.metadata === null) return { matches: false, reason: "invalid" };
  return canonicalMetadataText(shape.metadata) === canonicalMetadataText(expected) ? { matches: true } : { matches: false, reason: "differs" };
}

// ---- the builder -----------------------------------------------------------------------------------------

export interface MetadataExtras {
  // Required: all nine keys are always emitted and image_url is one of them. Hosted by the user.
  readonly imageUrl: string;
  readonly tags?: readonly string[];
  readonly subcategories?: readonly string[];
  // [rule for outcome 0, rule for outcome 1]. When absent a fixed neutral pair is used and a warning says so.
  readonly outcomeRules?: readonly [string, string];
}

export interface BuildMetadataInput {
  readonly draft: MarketDraft;
  readonly extras: MetadataExtras;
  readonly nowMs: number;
  readonly config: GuardrailConfig;
}

export interface BuiltMetadata {
  readonly ok: true;
  readonly metadata: MetadataJson;
  readonly text: string;
  readonly canonicalText: string;
  readonly contentHash: Hex;
  readonly expiresAtS: number;
  readonly lint: LintResult;
  readonly checks: readonly MetadataCheck[];
  readonly warnings: readonly string[];
}
export interface MetadataRefusal {
  readonly ok: false;
  readonly reason: "lint_failed" | "close_date_invalid" | "metadata_invalid" | "uri_invalid";
  readonly message: string;
  readonly lint: LintResult | null;
  readonly checks: readonly MetadataCheck[];
}
export type BuildMetadataResult = BuiltMetadata | MetadataRefusal;

export const DEFAULT_OUTCOME_RULES: readonly [string, string] = Object.freeze([
  "Resolves to Yes if the condition described in the market rules is met, according to the primary source.",
  "Resolves to No if the condition described in the market rules is not met, according to the primary source.",
] as const);

function tidy(text: unknown): string {
  return typeof text === "string" ? text.normalize("NFC").trim() : "";
}
function tidyList(items: unknown): string[] {
  return Array.isArray(items) ? items.map((item: unknown) => tidy(item)) : [];
}

// Builds the nine-key JSON from a draft. The draft goes through `lintMarketDraft` first; any failing
// lint item refuses the build. No flag is needed for this dry run; the URI step has one.
export function buildMetadata(input: BuildMetadataInput): BuildMetadataResult {
  // The draft and the extras come from an agent: anything that is not the expected shape is a refusal, not a crash.
  let lint: LintResult;
  try {
    if (typeof input.draft !== "object" || input.draft === null || typeof input.extras !== "object" || input.extras === null) throw new TypeError("not objects");
    lint = lintMarketDraft(input.draft, { nowMs: input.nowMs, config: input.config });
  } catch {
    return { ok: false, reason: "lint_failed", message: "The draft or the extras are not in the expected shape.", lint: null, checks: [] };
  }
  if (lint.verdict === "fail") {
    return { ok: false, reason: "lint_failed", message: `The draft has ${lint.counts.fail} failing lint item(s). Fix them first.`, lint, checks: [] };
  }
  const closeMs = Date.parse(input.draft.closeDate);
  if (!Number.isFinite(closeMs) || closeMs <= 0) {
    return { ok: false, reason: "close_date_invalid", message: "The close date could not be read.", lint, checks: [] };
  }
  const warnings: string[] = [];
  if (closeMs % 1000 !== 0) warnings.push("The close date has fractional seconds; the on-chain expiry is rounded down to the whole second.");
  const expiresAtS = Math.floor(closeMs / 1000);

  const title = tidy(input.draft.title);
  const description = tidy(input.draft.description) !== "" ? tidy(input.draft.description) : title;
  const outcomeRules = input.extras.outcomeRules ?? DEFAULT_OUTCOME_RULES;
  if (input.extras.outcomeRules === undefined) {
    warnings.push("No per-outcome rules were given, so a fixed neutral pair was used. Write outcome rules that restate the Yes and No conditions.");
  }
  const outcomeTitles = tidyList(input.draft.outcomes);
  const candidate = {
    title,
    description,
    category: tidy(input.draft.category).toUpperCase(),
    tags: tidyList(input.extras.tags),
    subcategories: tidyList(input.extras.subcategories),
    image_url: tidy(input.extras.imageUrl),
    rules: {
      description: tidy(input.draft.rules),
      outcomeRules: [
        { outcomeIndex: 0, rule: tidy(outcomeRules[0]) },
        { outcomeIndex: 1, rule: tidy(outcomeRules[1]) },
      ],
    },
    resolution_sources: tidyList(input.draft.resolutionSources),
    outcomes: [
      { id: 0, title: outcomeTitles[0] ?? "" },
      { id: 1, title: outcomeTitles[1] ?? "" },
    ],
  };
  const validation = validateMetadata(candidate, { expiresAtS });
  if (!validation.ok || validation.metadata === null) {
    return { ok: false, reason: "metadata_invalid", message: `The metadata fails ${validation.blocks} check(s). Fix them first.`, lint, checks: validation.checks };
  }
  const metadata = validation.metadata;
  return {
    ok: true,
    metadata,
    text: prettyMetadataText(metadata),
    canonicalText: canonicalMetadataText(metadata),
    contentHash: metadataContentHash(metadata),
    expiresAtS,
    lint,
    checks: validation.checks,
    warnings,
  };
}

export interface CreationMetadataInput extends BuildMetadataInput {
  // The URL the user will host the file at. Required for the real path.
  readonly declaredUrl: string;
  readonly flags: Flags;
}
export type CreationMetadata = (BuiltMetadata & { readonly uri: string; readonly uriChecks: readonly MetadataCheck[] }) | MetadataRefusal;

// The real creation path: the JSON plus the metaDataURI for the user's own host. Throws a RelayError
// (`flag_off`, or `kill_switch`) before doing anything else when ENABLE_SELF_HOSTED_METADATA is off.
export function buildCreationMetadata(input: CreationMetadataInput): CreationMetadata {
  requireFlag(input.flags, "ENABLE_SELF_HOSTED_METADATA");
  const built = buildMetadata(input);
  if (!built.ok) return built;
  const hosting = buildMetadataUri(input.declaredUrl, input.flags);
  if (!hosting.ok || hosting.uri === null) {
    return { ok: false, reason: "uri_invalid", message: "The declared metadata URL is not usable.", lint: built.lint, checks: [...built.checks, ...hosting.checks] };
  }
  return { ...built, uri: hosting.uri, uriChecks: hosting.checks, checks: [...built.checks, ...hosting.checks] };
}
