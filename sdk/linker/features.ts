// Market text -> a feature record that holds NO text: token hashes, number hashes, date hashes,
// entity hashes, the two rule hashes, the close time and the category. Text is canonicalised with
// the existing recipes (sdk/rules.ts canonicalRuleText + maskRuleText) first, so the same
// market gives the same features whatever whitespace, entities or markup the venue sent.
// Pure: no clock, no I/O.

import { sha256Hex } from "../hash.js";
import type { LinkVenueId } from "../links/schema.js";
import type { VoidPolicy } from "../model.js";
import { canonicalRuleText, maskRuleText, MARKERS } from "../rules.js";
import { MIN_TOKEN_CHARS, STOPWORDS, TOKEN_HASH_CHARS } from "./constants.js";

export interface MarketFeatures {
  readonly venue: LinkVenueId;
  readonly marketId: string;
  // Hashes of the lowercase masked title tokens, sorted and unique.
  readonly titleTokens: readonly string[];
  // Hashes of the lowercase masked rule tokens.
  readonly ruleTokens: readonly string[];
  // Hashes of normalised numbers found in title and rules ("80k" and "80,000" hash alike).
  readonly numbers: readonly string[];
  // Hashes of dates found in title and rules, as YYYY-MM-DD (0000 when the year is absent).
  readonly dates: readonly string[];
  // Hashes of capitalised words of the title (names, teams, tickers), lowercase.
  readonly entities: readonly string[];
  readonly rulesSha256: string;
  readonly maskedSha256: string;
  // YYYY-MM-DDTHH:MM:SSZ
  readonly closeUtc: string;
  readonly category: string;
  readonly categoryConfidence: "native" | "keyword" | "none";
  readonly voidPolicy: VoidPolicy;
  readonly resolverId: string | null;
  // Venue group key (XO root event, Polymarket neg-risk id), or null.
  readonly groupKey: string | null;
  readonly groupKind: "neg_risk" | "event" | null;
  readonly outcomes: number;
}

export function tokenHash(kind: "t" | "n" | "d" | "e", value: string): string {
  return sha256Hex(`pm-linker:${kind}:${value}`).slice(0, TOKEN_HASH_CHARS);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

// Lowercase NFKC words of a masked text, stopwords and slot markers dropped.
export function tokensOf(masked: string): string[] {
  const out: string[] = [];
  for (const raw of masked.normalize("NFKC").toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < MIN_TOKEN_CHARS || STOPWORDS.has(raw)) continue;
    out.push(raw);
  }
  return unique(out);
}

const MARKER_WORDS = new Set(Object.values(MARKERS).map((m) => m.replace(/[⟦⟧]/g, "").toLowerCase()));

const NUMBER_RE = /(?<![\p{L}\p{N}])[$€£]?(\d[\d,]*(?:\.\d+)?)(%|[kKmMbB])?(?![\p{L}\p{N}])/gu;

// "$81,742.9593" -> "81742.9593", "80k" -> "80000", "1.5m" -> "1500000", "12%" -> "12%".
export function normaliseNumber(digits: string, suffix: string | undefined): string {
  const plain = digits.replace(/,/g, "");
  const [intPart = "0", frac = ""] = plain.split(".");
  let value = `${intPart.replace(/^0+(?=\d)/, "")}${frac === "" ? "" : `.${frac.replace(/0+$/, "")}`}`.replace(/\.$/, "");
  const scale = suffix === undefined ? 0 : { k: 3, m: 6, b: 9 }[suffix.toLowerCase()] ?? 0;
  if (scale > 0) {
    const [i = "0", f = ""] = value.split(".");
    const shifted = (i + f.padEnd(scale, "0")).slice(0, i.length + scale);
    const rest = f.length > scale ? `.${f.slice(scale)}` : "";
    value = `${shifted.replace(/^0+(?=\d)/, "")}${rest}`;
  }
  return suffix === "%" ? `${value}%` : value;
}

export function numbersOf(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NUMBER_RE)) out.push(normaliseNumber(m[1] ?? "", m[2]));
  return unique(out);
}

const MONTHS: Readonly<Record<string, string>> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
};
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
// An ISO date with an optional time and zone (the venues' close fields) is one date span.
const ISO_DATE_RE = /(?<![\p{L}\p{N}])(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?(?![\p{L}\p{N}])/gu;
// Epoch seconds or milliseconds (Limitless expirationTimestamp) are dates, not thresholds.
const EPOCH_RE = /(?<![\p{L}\p{N}.])(\d{10}|\d{13})(?![\p{L}\p{N}.])/gu;
const TIME_RE = /(?<![\p{L}\p{N}])\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?: ?(?:[AaPp]\.?[Mm]\.?))?(?: ?(?:UTC|GMT|ET|EST|EDT|CT|CST|CDT|PT|PST|PDT|MT|MST|MDT|Z))?(?![\p{L}\p{N}])/gu;
const MONTH_DAY_RE = new RegExp(`(?<![\\p{L}\\p{N}])${MONTH}\\.? (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?(?![\\p{L}\\p{N}])`, "giu");
const DAY_MONTH_RE = new RegExp(`(?<![\\p{L}\\p{N}])(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MONTH}\\.?(?:,? (\\d{4}))?(?![\\p{L}\\p{N}])`, "giu");
const MONTH_YEAR_RE = new RegExp(`(?<![\\p{L}\\p{N}])${MONTH}\\.?,? (\\d{4})(?![\\p{L}\\p{N}])`, "giu");

function monthNumber(name: string): string {
  return MONTHS[name.toLowerCase().slice(0, 3)] ?? "00";
}

// Each pattern consumes its span before the next runs, so "31 Dec 2026" is one date, not two.
function scanDates(text: string): { dates: string[]; rest: string } {
  const out: string[] = [];
  let t = text.normalize("NFKC");
  t = t.replace(ISO_DATE_RE, (_m, y: string, mo: string, d: string) => {
    out.push(`${y}-${mo}-${d}`);
    return " ";
  });
  t = t.replace(MONTH_DAY_RE, (_m, mon: string, d: string, y: string | undefined) => {
    out.push(`${y ?? "0000"}-${monthNumber(mon)}-${d.padStart(2, "0")}`);
    return " ";
  });
  t = t.replace(DAY_MONTH_RE, (_m, d: string, mon: string, y: string | undefined) => {
    out.push(`${y ?? "0000"}-${monthNumber(mon)}-${d.padStart(2, "0")}`);
    return " ";
  });
  t = t.replace(MONTH_YEAR_RE, (_m, mon: string, y: string) => {
    out.push(`${y}-${monthNumber(mon)}-00`);
    return " ";
  });
  t = t.replace(EPOCH_RE, (whole: string) => {
    const stamp = toUtcStamp(whole);
    if (stamp === null) return whole;
    out.push(stamp.slice(0, 10));
    return " ";
  });
  t = t.replace(TIME_RE, " ");
  return { dates: unique(out), rest: t };
}

export function datesOf(text: string): string[] {
  return scanDates(text).dates;
}

// Numbers that are not part of a date (the digits of "December 31, 2026" are not thresholds).
export function numbersOutsideDates(text: string): string[] {
  return numbersOf(scanDates(text).rest);
}

// Capitalised words and all-caps tokens of the (unmasked) canonical title, lowercased.
export function entitiesOf(title: string): string[] {
  const out: string[] = [];
  for (const word of title.normalize("NFKC").split(/[^\p{L}\p{N}]+/u)) {
    if (word.length < 2) continue;
    const first = word[0] ?? "";
    const isCapitalised = first !== first.toLowerCase() && first === first.toUpperCase();
    const isAcronym = word.length >= 2 && word.length <= 6 && word === word.toUpperCase() && /\p{L}/u.test(word);
    if (!isCapitalised && !isAcronym) continue;
    const lower = word.toLowerCase();
    if (STOPWORDS.has(lower) || MARKER_WORDS.has(lower)) continue;
    out.push(lower);
  }
  return unique(out);
}

export interface FeatureInput {
  readonly venue: LinkVenueId;
  readonly marketId: string;
  readonly title: string;
  // Canonical rule text (sdk/rules.ts canonicalizeRecord output) and its two hashes.
  readonly rulesCanonical: string;
  readonly rulesSha256: string;
  readonly maskedSha256: string;
  readonly closeUtc: string;
  readonly category: string;
  readonly categoryConfidence: MarketFeatures["categoryConfidence"];
  readonly voidPolicy: VoidPolicy;
  readonly resolverId: string | null;
  readonly groupKey: string | null;
  readonly groupKind: MarketFeatures["groupKind"];
  readonly outcomes: number;
}

export function buildFeatures(input: FeatureInput): MarketFeatures {
  const title = canonicalRuleText(input.title);
  const maskedTitle = maskRuleText(title);
  const maskedRules = maskRuleText(input.rulesCanonical);
  const both = `${title} ${input.rulesCanonical}`;
  return {
    venue: input.venue,
    marketId: input.marketId,
    titleTokens: unique(tokensOf(maskedTitle).map((t) => tokenHash("t", t))),
    ruleTokens: unique(tokensOf(maskedRules).map((t) => tokenHash("t", t))),
    numbers: unique(numbersOutsideDates(both).map((n) => tokenHash("n", n))),
    dates: unique(datesOf(both).map((d) => tokenHash("d", d))),
    entities: unique(entitiesOf(title).map((e) => tokenHash("e", e))),
    rulesSha256: input.rulesSha256,
    maskedSha256: input.maskedSha256,
    closeUtc: input.closeUtc,
    category: input.category,
    categoryConfidence: input.categoryConfidence,
    voidPolicy: input.voidPolicy,
    resolverId: input.resolverId,
    groupKey: input.groupKey,
    groupKind: input.groupKind,
    outcomes: input.outcomes,
  };
}

export function featureKey(f: Pick<MarketFeatures, "venue" | "marketId">): string {
  return `${f.venue}:${f.marketId}`;
}

// YYYY-MM-DDTHH:MM:SSZ from any ISO instant or epoch milliseconds; null when unparseable.
export function toUtcStamp(input: unknown): string | null {
  let ms: number;
  if (typeof input === "number") ms = input;
  else if (typeof input === "string" && /^\d{10,16}$/.test(input.trim())) ms = Number(input.trim());
  else if (typeof input === "string") ms = Date.parse(input);
  else return null;
  if (!Number.isFinite(ms)) return null;
  if (ms > 0 && ms < 100_000_000_000) ms *= 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
