// pm_signal_parse: validate and normalise a PAID Quotient body that the agent hands back.
//
// Everything here is memory-only. Nothing is written, cached, logged or exported; the module has
// no file, network or process access (a test scans the source to keep it that way). Quotient's
// terms bar redistribution, so rows go back to the same agent that paid for them and nowhere else.
//
// Shapes come from the OpenAPI 20.5.0 spec only (research 12, section 5): no real paid body was
// ever read. The parser is therefore strict about what safety depends on and lenient about the
// rest. Unknown fields are ignored. An unknown venue or an unknown value of an enum we rely on
// (entry_status, q_coverage, quote_method, forecast_status.state, ...) REJECTS that row and sets
// schemaDrift, because a new value may change what the row means. Units are normalised exactly
// (0..100 to 0..1) and a value outside its documented scale is rejected, never guessed.

import { sanitizeField, UNTRUSTED_DATA_NOTICE, type UntrustedContent } from "../../src/guardrails/untrusted.js";
import { ZERO, absR, cmp, eq, ratToDecExact, sub, type Rational, type SDec } from "../core/rational.js";
import {
  DISCLOSURE,
  ENTRY_STATUSES,
  FORECAST_STATES,
  LIVE_QUOTE_VENUES,
  MAX_BODY_BYTES,
  MAX_ROWS,
  QUALITY_STATUSES,
  QUALITY_TIERS,
  QUOTE_METHODS,
  QUOTIENT_CLAUSE,
  Q_COVERAGE,
  RETIRED_REASONS,
  SPREAD_DIRECTIONS,
  isQuotientVenue,
  type EntryStatus,
  type ForecastState,
  type QCoverage,
  type QuoteMethod,
  type QuotientVenue,
  type RetiredReason,
} from "./constants.js";
import { flagOff, type FlagContext, type FlagOff } from "./flag.js";
import { NATIVE_ID_RE, parseMarketKey } from "./keys.js";
import { pct100, prob01, toRational } from "./numbers.js";

export const ROW_SOURCES = ["mispriced", "signal", "signal_sports_listing"] as const;
export type RowSource = (typeof ROW_SOURCES)[number];
export type ParseKind = "mispriced" | "signals";

// Why a row cannot be used as an input. Every code is fixed text; none echoes row content.
export const DEMOTIONS = [
  "FORECAST_AGE_UNKNOWN",
  "FORECAST_STALE",
  "QUOTE_UNVERIFIED",
  "QUOTE_NOT_LIVE",
  "QUOTE_NOT_FRESH",
  "QUOTE_STALE",
  "IN_DISPUTE",
  "NOT_ENTRY_ELIGIBLE",
  "ENTRY_STATUS_NOT_ELIGIBLE",
  "IN_PLAY",
  "SIGNAL_INACTIVE",
  "SIGNAL_RETIRED",
  "FORECAST_STATUS_WARNING",
  "DRAWDOWN_RISK_ELEVATED_OR_UNKNOWN",
  "CAPACITY_UNKNOWN",
  "CAPACITY_BELOW_SIZE",
  "COVERAGE_UNDER_REVIEW",
  "COVERAGE_RESEARCH_ONLY",
  "COVERAGE_EXPERIMENTAL",
  "ORIENTATION_UNMAPPED",
] as const;
export type Demotion = (typeof DEMOTIONS)[number];

export type RejectCode =
  | "BAD_ROW"
  | "MISSING_FIELD"
  | "BAD_FIELD"
  | "BAD_MARKET_KEY"
  | "MARKET_KEY_MISMATCH"
  | "UNKNOWN_VENUE"
  | "UNKNOWN_ENUM"
  | "OUT_OF_RANGE"
  | "INCONSISTENT"
  | "NO_QUOTE"
  | "FUTURE_TIMESTAMP";

export interface RejectedRow {
  readonly index: number;
  readonly code: RejectCode;
  // A field name from this module, never a value taken from the row.
  readonly field: string;
}

export type Orientation =
  | { readonly kind: "venue_yes" }
  // Sports rows are probabilities for the team or player named in sports.yes_side; title or
  // outcome order does not identify it. Map it to token ids before any edge.
  | { readonly kind: "sports_yes_side"; readonly yesSide: UntrustedContent | null; readonly mappedToTokens: false };

export interface QuoteInfo {
  readonly method: QuoteMethod | null;
  readonly freshness: "fresh" | "not_fresh" | "unreported";
  readonly liveVerified: boolean | null;
  readonly observedAt: string | null;
  readonly ageMs: number | null;
}

export interface QuotientRow {
  readonly source: RowSource;
  readonly signalId: string | null;
  readonly venue: QuotientVenue;
  readonly marketKey: string;
  readonly marketId: string;
  readonly conditionId: string | null;
  readonly question: UntrustedContent | null;
  // Q's probability for the oriented outcome (venue YES, or sports.yes_side), exact decimal 0..1.
  readonly qYes: string;
  readonly orientation: Orientation;
  // The selected quote Quotient built its spread on. Not an executable price.
  readonly marketOdds: string | null;
  // Recomputed here from qYes and marketOdds. Quotient's reported spread is only cross-checked.
  readonly spread: string | null;
  readonly qMinusMarket: SDec | null;
  readonly spreadDirection: (typeof SPREAD_DIRECTIONS)[number] | null;
  readonly side: "YES" | "NO" | null;
  readonly qForSide: string | null;
  readonly atPublish: { readonly q: string | null; readonly marketPrice: string | null } | null;
  readonly qCoverage: QCoverage;
  readonly entryEligible: boolean | null;
  readonly entryStatus: EntryStatus | null;
  readonly inPlay: boolean | null;
  readonly isActive: boolean | null;
  readonly retiredReason: RetiredReason | null;
  readonly forecastState: ForecastState | null;
  readonly quote: QuoteInfo;
  readonly forecast: { readonly createdAt: string | null; readonly ageMs: number | null };
  readonly quality: {
    readonly status: (typeof QUALITY_STATUSES)[number] | null;
    readonly tier: (typeof QUALITY_TIERS)[number] | null;
    readonly assessmentSource: "live" | "historical" | null;
    readonly basis: UntrustedContent | null;
    readonly liveN: number | null;
    readonly historicalN: number | null;
  } | null;
  readonly inDispute: boolean | null;
  // null means unknown, which is not safe.
  readonly drawdownRiskElevated: boolean | null;
  readonly capacityUsd: string | null;
  readonly endDate: string | null;
  readonly thesis?: UntrustedContent;
  readonly warnings: readonly string[];
  readonly demotions: readonly Demotion[];
  // True only when no demotion applies. Never a trade instruction.
  readonly usable: boolean;
}

export interface ParseOptions {
  readonly nowMs: number;
  readonly maxForecastAgeMs?: number;
  readonly maxQuoteAgeMs?: number;
  // Sports markets are all `experimental` (no established edge): visible only on explicit opt-in.
  readonly allowExperimental?: boolean;
  // Smallest capacity (dollars, decimal string) a signal must show.
  readonly minCapacityUsd?: string;
  readonly includeText?: boolean;
}

export const DEFAULT_MAX_FORECAST_AGE_MS = 24 * 3_600_000;
export const DEFAULT_MAX_QUOTE_AGE_MS = 15 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;

export interface ParseSuccess {
  readonly ok: true;
  readonly kind: ParseKind;
  readonly parsedAtMs: number;
  readonly rows: readonly QuotientRow[];
  readonly rejected: readonly RejectedRow[];
  // True when a row was rejected for an unknown venue or enum: the API may have changed.
  readonly schemaDrift: boolean;
  readonly counts: { readonly received: number; readonly parsed: number; readonly usable: number; readonly rejected: number };
  readonly restricted: {
    readonly source: "quotient";
    readonly memoryOnly: true;
    readonly persisted: false;
    readonly exported: false;
  };
  readonly clause: string;
  readonly disclosure: readonly string[];
  readonly untrustedNotice: string;
}

export type ParseFailure = {
  readonly ok: false;
  readonly error: "BAD_INPUT" | "TOO_LARGE" | "BAD_SHAPE" | "TOO_MANY_ROWS";
  readonly detail: string;
};
export type ParseResult = ParseSuccess | ParseFailure | FlagOff;

// ---------------------------------------------------------------------------------------------
// Readers

type Obj = Readonly<Record<string, unknown>>;

class RowError extends Error {
  constructor(
    readonly code: RejectCode,
    readonly field: string,
  ) {
    super(code);
  }
}

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Own properties only, so a hostile `__proto__` or inherited key can never be read.
function get(o: Obj, key: string): unknown {
  return Object.hasOwn(o, key) ? o[key] : undefined;
}

function nested(o: Obj, key: string): Obj | null {
  const v = get(o, key);
  return isObj(v) ? v : null;
}

function missing(v: unknown): boolean {
  return v === undefined || v === null;
}

function readEnum<T extends string>(o: Obj, key: string, allowed: readonly T[], required: boolean): T | null {
  const v = get(o, key);
  if (missing(v)) {
    if (required) throw new RowError("MISSING_FIELD", key);
    return null;
  }
  if (typeof v !== "string") throw new RowError("BAD_FIELD", key);
  if (!(allowed as readonly string[]).includes(v)) throw new RowError("UNKNOWN_ENUM", key);
  return v as T;
}

function readBool(o: Obj, key: string, required = false): boolean | null {
  const v = get(o, key);
  if (missing(v)) {
    if (required) throw new RowError("MISSING_FIELD", key);
    return null;
  }
  if (typeof v !== "boolean") throw new RowError("BAD_FIELD", key);
  return v;
}

function readProb(o: Obj, key: string, scale: "01" | "100", required: boolean): Rational | null {
  const v = get(o, key);
  if (missing(v)) {
    if (required) throw new RowError("MISSING_FIELD", key);
    return null;
  }
  const r = scale === "01" ? prob01(v) : pct100(v);
  if (!r.ok) throw new RowError(r.code === "OUT_OF_RANGE" ? "OUT_OF_RANGE" : "BAD_FIELD", key);
  return r.value;
}

function dec(r: Rational): string {
  const text = ratToDecExact(r);
  // Decimals and exact divisions by 100 always terminate; anything else is a bug, not data.
  if (text === null) throw new RowError("BAD_FIELD", "decimal");
  return text;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function readTime(o: Obj, key: string, allowDateOnly = false): number | null {
  const v = get(o, key);
  if (missing(v)) return null;
  if (typeof v !== "string") throw new RowError("BAD_FIELD", key);
  if (!ISO.test(v) && !(allowDateOnly && DATE_ONLY.test(v))) throw new RowError("BAD_FIELD", key);
  const ms = Date.parse(DATE_ONLY.test(v) ? `${v}T00:00:00Z` : v);
  if (Number.isNaN(ms)) throw new RowError("BAD_FIELD", key);
  return ms;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function readText(o: Obj, key: string): string | null {
  const v = get(o, key);
  return typeof v === "string" ? v : null;
}

function readCount(o: Obj, key: string): number | null {
  const v = get(o, key);
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000_000 ? v : null;
}

function text(field: "title" | "generic" | "description", value: string | null): UntrustedContent | null {
  return value === null ? null : sanitizeField(field, value, "quotient");
}

// ---------------------------------------------------------------------------------------------
// Row builders

interface Identity {
  readonly venue: QuotientVenue;
  readonly marketKey: string;
  readonly marketId: string;
  readonly conditionId: string | null;
}

function readIdentity(m: Obj): Identity {
  const venueRaw = get(m, "venue");
  if (missing(venueRaw)) throw new RowError("MISSING_FIELD", "venue");
  if (!isQuotientVenue(venueRaw)) throw new RowError("UNKNOWN_VENUE", "venue");
  const keyRaw = get(m, "marketKey");
  if (missing(keyRaw)) throw new RowError("MISSING_FIELD", "marketKey");
  const key = parseMarketKey(keyRaw);
  if (key === null) throw new RowError("BAD_MARKET_KEY", "marketKey");
  if (key.venue !== venueRaw) throw new RowError("MARKET_KEY_MISMATCH", "marketKey");
  const native = get(m, "nativeMarketId");
  if (!missing(native)) {
    const asText = typeof native === "number" && Number.isSafeInteger(native) ? String(native) : native;
    if (typeof asText !== "string" || !NATIVE_ID_RE.test(asText)) throw new RowError("BAD_FIELD", "nativeMarketId");
    if (asText !== key.id) throw new RowError("MARKET_KEY_MISMATCH", "nativeMarketId");
  }
  const cond = get(m, "condition_id");
  let conditionId: string | null = null;
  if (!missing(cond)) {
    if (typeof cond !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(cond)) throw new RowError("BAD_FIELD", "condition_id");
    conditionId = cond.toLowerCase();
  }
  return { venue: key.venue, marketKey: `${key.venue}:${key.id}`, marketId: key.id, conditionId };
}

function readQuote(venue: QuotientVenue, q: Obj | null, nowMs: number): { quote: QuoteInfo; selected: Rational | null } {
  if (q === null) {
    return { quote: { method: null, freshness: "unreported", liveVerified: null, observedAt: null, ageMs: null }, selected: null };
  }
  const rawMethod = get(q, "quote_method");
  let method: QuoteMethod | null = null;
  if (!missing(rawMethod)) {
    if (typeof rawMethod !== "string") throw new RowError("BAD_FIELD", "quote_method");
    const norm = rawMethod.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!(QUOTE_METHODS as readonly string[]).includes(norm)) throw new RowError("UNKNOWN_ENUM", "quote_method");
    method = norm as QuoteMethod;
  }
  const freshRaw = get(q, "freshness");
  const freshness: QuoteInfo["freshness"] =
    typeof freshRaw !== "string" ? "unreported" : freshRaw.trim().toLowerCase() === "fresh" ? "fresh" : "not_fresh";
  const observed = readTime(q, "observed_at");
  if (observed !== null && observed > nowMs + CLOCK_SKEW_MS) throw new RowError("FUTURE_TIMESTAMP", "observed_at");
  const selected = readProb(q, "selected_probability", "01", false);
  const liveVerified =
    method === null ? null : method !== "graph_snapshot" && (LIVE_QUOTE_VENUES as readonly string[]).includes(venue);
  return {
    quote: {
      method,
      freshness,
      liveVerified,
      observedAt: observed === null ? null : iso(observed),
      ageMs: observed === null ? null : Math.max(0, nowMs - observed),
    },
    selected,
  };
}

function readQuality(o: Obj): QuotientRow["quality"] {
  const q = nested(o, "quality");
  if (q === null) return null;
  const status = readEnum(q, "status", QUALITY_STATUSES, false);
  const tier = readEnum(q, "tier", QUALITY_TIERS, false);
  const src = readEnum(q, "assessment_source", ["live", "historical"] as const, false);
  const live = nested(q, "live");
  const hist = nested(q, "historical");
  return {
    status,
    tier,
    assessmentSource: src,
    basis: text("generic", readText(q, "basis")),
    liveN: live === null ? null : readCount(live, "n"),
    historicalN: hist === null ? null : readCount(hist, "n"),
  };
}

interface Common {
  readonly source: RowSource;
  readonly signalId: string | null;
  readonly identity: Identity;
  readonly question: string | null;
  readonly q: Rational;
  readonly orientation: Orientation;
  readonly market: Rational | null;
  readonly side: "YES" | "NO" | null;
  readonly atPublish: QuotientRow["atPublish"];
  readonly qCoverage: QCoverage;
  readonly entryEligible: boolean | null;
  readonly entryStatus: EntryStatus | null;
  readonly inPlay: boolean | null;
  readonly isActive: boolean | null;
  readonly retiredReason: RetiredReason | null;
  readonly forecastState: ForecastState | null;
  readonly quote: QuoteInfo;
  readonly forecastMs: number | null;
  readonly quality: QuotientRow["quality"];
  readonly inDispute: boolean | null;
  readonly drawdown: boolean | null;
  readonly isSignal: boolean;
  readonly capacity: Rational | null;
  readonly endMs: number | null;
  readonly reportedSpread: Rational | null;
  readonly reportedDirection: (typeof SPREAD_DIRECTIONS)[number] | null;
  readonly thesis: string | null;
  readonly warnings: readonly string[];
}

function finish(c: Common, o: ParseOptions): QuotientRow {
  const warnings = [...c.warnings];
  let spread: string | null = null;
  let diff: Rational | null = null;
  let direction: (typeof SPREAD_DIRECTIONS)[number] | null = null;
  if (c.market !== null) {
    diff = sub(c.q, c.market);
    spread = dec(absR(diff));
    if (cmp(diff, ZERO) > 0) direction = "q_higher";
    else if (cmp(diff, ZERO) < 0) direction = "q_lower";
    if (c.reportedDirection !== null && direction !== null && c.reportedDirection !== direction) {
      throw new RowError("INCONSISTENT", "spread_direction");
    }
    if (c.reportedSpread !== null && cmp(absR(sub(c.reportedSpread, absR(diff))), { n: 1n, d: 100n }) > 0) {
      // Quotient's spread is built on its own selected quote; a large gap means the inputs we
      // were given do not describe the same quote.
      throw new RowError("INCONSISTENT", "spread");
    }
    if (c.reportedSpread !== null && !eq(c.reportedSpread, absR(diff))) warnings.push("reported_spread_differs_slightly");
  }

  const demotions: Demotion[] = [];
  const add = (d: Demotion) => {
    if (!demotions.includes(d)) demotions.push(d);
  };
  const maxForecast = o.maxForecastAgeMs ?? DEFAULT_MAX_FORECAST_AGE_MS;
  const maxQuote = o.maxQuoteAgeMs ?? DEFAULT_MAX_QUOTE_AGE_MS;
  const forecastAge = c.forecastMs === null ? null : Math.max(0, o.nowMs - c.forecastMs);
  if (forecastAge === null) add("FORECAST_AGE_UNKNOWN");
  else if (forecastAge > maxForecast) add("FORECAST_STALE");
  if (c.quote.method === null) add("QUOTE_UNVERIFIED");
  else if (c.quote.liveVerified === false) add("QUOTE_NOT_LIVE");
  if (c.quote.freshness === "not_fresh") add("QUOTE_NOT_FRESH");
  if (c.quote.ageMs !== null && c.quote.ageMs > maxQuote) add("QUOTE_STALE");
  if (c.inDispute === true) add("IN_DISPUTE");
  if (c.entryEligible === false) add("NOT_ENTRY_ELIGIBLE");
  if (c.entryStatus !== null && c.entryStatus !== "eligible") add("ENTRY_STATUS_NOT_ELIGIBLE");
  if (c.inPlay === true || c.entryStatus === "in_play") add("IN_PLAY");
  if (c.isActive === false) add("SIGNAL_INACTIVE");
  if (c.retiredReason !== null) add("SIGNAL_RETIRED");
  if (c.forecastState === "warning" || c.forecastState === "caution") add("FORECAST_STATUS_WARNING");
  // null means unknown, which is not safe; only signals carry the field.
  if (c.isSignal && c.drawdown !== false) add("DRAWDOWN_RISK_ELEVATED_OR_UNKNOWN");
  if (o.minCapacityUsd !== undefined) {
    const need = toRational(o.minCapacityUsd);
    if (!need.ok) throw new RowError("BAD_FIELD", "minCapacityUsd");
    if (c.capacity === null) add("CAPACITY_UNKNOWN");
    else if (cmp(c.capacity, need.value) < 0) add("CAPACITY_BELOW_SIZE");
  }
  if (c.qCoverage === "under_review") add("COVERAGE_UNDER_REVIEW");
  else if (c.qCoverage === "research_only") add("COVERAGE_RESEARCH_ONLY");
  else if (c.qCoverage === "experimental" && o.allowExperimental !== true) add("COVERAGE_EXPERIMENTAL");
  if (c.orientation.kind === "sports_yes_side") add("ORIENTATION_UNMAPPED");

  let qForSide: string | null = null;
  if (c.side !== null) qForSide = dec(c.side === "YES" ? c.q : sub({ n: 1n, d: 1n }, c.q));

  return {
    source: c.source,
    signalId: c.signalId,
    venue: c.identity.venue,
    marketKey: c.identity.marketKey,
    marketId: c.identity.marketId,
    conditionId: c.identity.conditionId,
    question: text("title", c.question),
    qYes: dec(c.q),
    orientation: c.orientation,
    marketOdds: c.market === null ? null : dec(c.market),
    spread,
    qMinusMarket: diff === null ? null : ratSigned(diff),
    spreadDirection: direction,
    side: c.side,
    qForSide,
    atPublish: c.atPublish,
    qCoverage: c.qCoverage,
    entryEligible: c.entryEligible,
    entryStatus: c.entryStatus,
    inPlay: c.inPlay,
    isActive: c.isActive,
    retiredReason: c.retiredReason,
    forecastState: c.forecastState,
    quote: c.quote,
    forecast: { createdAt: c.forecastMs === null ? null : iso(c.forecastMs), ageMs: forecastAge },
    quality: c.quality,
    inDispute: c.inDispute,
    drawdownRiskElevated: c.drawdown,
    capacityUsd: c.capacity === null ? null : dec(c.capacity),
    endDate: c.endMs === null ? null : iso(c.endMs),
    ...(o.includeText === true && c.thesis !== null ? { thesis: sanitizeField("description", c.thesis, "quotient") } : {}),
    warnings,
    demotions,
    usable: demotions.length === 0,
  };
}

function ratSigned(r: Rational): SDec {
  const neg = r.n < 0n;
  const text = ratToDecExact(neg ? { n: -r.n, d: r.d } : r);
  if (text === null) throw new RowError("BAD_FIELD", "decimal");
  return neg ? `-${text}` : text;
}

function readCoverage(m: Obj | null, fallback: QCoverage | null): QCoverage {
  const v = m === null ? null : readEnum(m, "q_coverage", Q_COVERAGE, fallback === null);
  if (v !== null) return v;
  if (fallback !== null) return fallback;
  throw new RowError("MISSING_FIELD", "q_coverage");
}

function checkFuture(ms: number | null, nowMs: number, field: string): void {
  if (ms !== null && ms > nowMs + CLOCK_SKEW_MS) throw new RowError("FUTURE_TIMESTAMP", field);
}

// Mispriced rows: top-level market fields (research 12, section 5.2).
function mispricedRow(row: Obj, o: ParseOptions): QuotientRow {
  const identity = readIdentity(row);
  const q = readProb(row, "quotient_odds", "01", true) as Rational;
  const { quote, selected } = readQuote(identity.venue, nested(row, "venue_quote"), o.nowMs);
  const odds = readProb(row, "market_odds", "01", false);
  if (odds !== null && selected !== null && !eq(odds, selected)) throw new RowError("INCONSISTENT", "market_odds");
  const market = odds ?? selected;
  if (market === null) throw new RowError("NO_QUOTE", "market_odds");
  const forecast = nested(row, "forecast");
  const forecastMs = forecast === null ? null : readTime(forecast, "created_at");
  checkFuture(forecastMs, o.nowMs, "created_at");
  if (forecast !== null) {
    const fp = readProb(forecast, "probability", "01", false);
    if (fp !== null && !eq(fp, q)) throw new RowError("INCONSISTENT", "probability");
  }
  const sports = nested(row, "sports");
  const yesSide = sports === null ? null : readText(sports, "yes_side");
  const orientation: Orientation =
    sports === null ? { kind: "venue_yes" } : { kind: "sports_yes_side", yesSide: text("generic", yesSide), mappedToTokens: false };
  const fs = nested(row, "forecast_status");
  const endMs = readTime(row, "end_date", true);
  return finish(
    {
      source: "mispriced",
      signalId: null,
      identity,
      question: readText(row, "question"),
      q,
      orientation,
      market,
      side: null,
      atPublish: null,
      qCoverage: readCoverage(row, null),
      entryEligible: null,
      entryStatus: null,
      inPlay: null,
      isActive: null,
      retiredReason: null,
      forecastState: fs === null ? null : readEnum(fs, "state", FORECAST_STATES, false),
      quote,
      forecastMs,
      quality: forecast === null ? null : readQuality(forecast),
      inDispute: readBool(row, "inDispute"),
      drawdown: null,
      isSignal: false,
      capacity: null,
      endMs,
      reportedSpread: readProb(row, "spread", "01", false),
      reportedDirection: readEnum(row, "spread_direction", SPREAD_DIRECTIONS, false),
      thesis: forecast === null ? null : readText(forecast, "thesis"),
      warnings: [],
    },
    o,
  );
}

function atPublish(row: Obj, warnings: string[]): QuotientRow["atPublish"] {
  const eq0 = readProb(row, "entry_q", "100", false);
  const ep = readProb(row, "entry_pm", "100", false);
  if (eq0 === null && ep === null) return null;
  const raw = get(row, "entry_q");
  // entry_q is documented on 0..100. A value below 1 may mean the scale changed to 0..1.
  if (typeof raw === "number" && raw > 0 && raw < 1) warnings.push("entry_q_below_1_on_a_0_100_scale");
  return { q: eq0 === null ? null : dec(eq0), marketPrice: ep === null ? null : dec(ep) };
}

// Non-sports signals (research 12, section 5.1).
function signalRow(row: Obj, o: ParseOptions): QuotientRow {
  const m = nested(row, "market");
  if (m === null) throw new RowError("MISSING_FIELD", "market");
  const identity = readIdentity(m);
  const q = readProb(row, "latest_q", "01", true) as Rational;
  const { quote, selected } = readQuote(identity.venue, nested(row, "venue_quote"), o.nowMs);
  const odds = readProb(m, "market_odds", "01", false);
  if (odds !== null && selected !== null && !eq(odds, selected)) throw new RowError("INCONSISTENT", "market_odds");
  const market = odds ?? selected;
  if (market === null) throw new RowError("NO_QUOTE", "market_odds");
  const side = readEnum(row, "side", ["YES", "NO"] as const, true);
  const fs = nested(row, "forecast_status");
  const forecastMs = readTime(row, "forecast_updated_at");
  checkFuture(forecastMs, o.nowMs, "forecast_updated_at");
  const id = get(row, "id");
  const live = readBool(row, "live_priced");
  const warnings: string[] = [];
  // live_priced is true only for a verified live Polymarket International or Kalshi quote.
  const q2: QuoteInfo = live === null ? quote : { ...quote, liveVerified: quote.liveVerified === false ? false : live };
  const capRaw = get(row, "capacity_usd_at_2c");
  let capacity: Rational | null = null;
  if (!missing(capRaw)) {
    const c = toRational(capRaw);
    if (!c.ok) throw new RowError("BAD_FIELD", "capacity_usd_at_2c");
    capacity = c.value;
  }
  return finish(
    {
      source: "signal",
      signalId: typeof id === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(id) ? id : null,
      identity,
      question: readText(m, "question"),
      q,
      orientation: { kind: "venue_yes" },
      market,
      side,
      atPublish: atPublish(row, warnings),
      qCoverage: readCoverage(m, null),
      entryEligible: readBool(row, "entry_eligible", true),
      entryStatus: readEnum(row, "entry_status", ENTRY_STATUSES, true),
      inPlay: readBool(row, "in_play"),
      isActive: readBool(row, "is_active", true),
      retiredReason: readEnum(row, "retired_reason", RETIRED_REASONS, false),
      forecastState: fs === null ? null : readEnum(fs, "state", FORECAST_STATES, false),
      quote: q2,
      forecastMs,
      quality: readQuality(row),
      inDispute: readBool(m, "inDispute"),
      drawdown: readBool(row, "drawdown_risk_elevated"),
      isSignal: true,
      capacity,
      endMs: readTime(m, "end_date", true),
      reportedSpread: null,
      reportedDirection: null,
      thesis: readText(row, "thesis"),
      warnings,
    },
    o,
  );
}

// Sports signals (kind "sports_game", API 20.0.0): one result per graph-linked listing, each with
// its own eligibility. No venue is primary; never take markets[0].
function sportsRows(row: Obj, o: ParseOptions, rejected: RejectedRow[], index: number): QuotientRow[] {
  const pick = nested(row, "pick");
  const sports = nested(row, "sports");
  const listings = get(row, "markets");
  if (pick === null || sports === null || !Array.isArray(listings)) throw new RowError("MISSING_FIELD", "pick");
  const q = readProb(pick, "probability", "01", true) as Rational;
  const forecastMs = readTime(row, "forecast_updated_at");
  checkFuture(forecastMs, o.nowMs, "forecast_updated_at");
  const id = get(row, "id");
  const out: QuotientRow[] = [];
  for (const listing of listings.slice(0, 50)) {
    try {
      if (!isObj(listing)) throw new RowError("BAD_ROW", "markets");
      const identity = readIdentity(listing);
      const price = readProb(listing, "price", "01", false);
      const quoteInfo = readQuote(identity.venue, nested(listing, "venue_quote"), o.nowMs);
      const market = price ?? quoteInfo.selected;
      const fs = nested(row, "forecast_status");
      out.push(
        finish(
          {
            source: "signal_sports_listing",
            signalId: typeof id === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(id) ? id : null,
            identity,
            question: readText(listing, "question") ?? readText(row, "question"),
            q,
            orientation: { kind: "sports_yes_side", yesSide: text("generic", readText(sports, "yes_side")), mappedToTokens: false },
            market,
            side: readEnum(listing, "signal_side", ["YES", "NO"] as const, false),
            atPublish: null,
            // Every covered sports market is `experimental`; a missing label is treated the same way.
            qCoverage: readCoverage(listing, "experimental"),
            entryEligible: readBool(listing, "entry_eligible", true),
            entryStatus: readEnum(listing, "entry_status", ENTRY_STATUSES, true),
            inPlay: readBool(row, "in_play"),
            isActive: readBool(row, "is_active"),
            retiredReason: readEnum(row, "retired_reason", RETIRED_REASONS, false),
            forecastState: fs === null ? null : readEnum(fs, "state", FORECAST_STATES, false),
            quote: quoteInfo.quote,
            forecastMs,
            quality: readQuality(row),
            inDispute: null,
            drawdown: readBool(row, "drawdown_risk_elevated"),
            isSignal: true,
            capacity: null,
            endMs: readTime(row, "resolves_at"),
            reportedSpread: null,
            reportedDirection: null,
            thesis: readText(row, "thesis"),
            warnings: [],
          },
          o,
        ),
      );
    } catch (e) {
      if (e instanceof RowError) rejected.push({ index, code: e.code, field: e.field });
      else throw e;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Entry point

function extractRows(parsed: unknown): readonly unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!isObj(parsed)) return null;
  const keys = ["markets", "signals", "items", "data"].filter((k) => Array.isArray(get(parsed, k)));
  if (keys.length !== 1) return null;
  return get(parsed, keys[0] as string) as readonly unknown[];
}

export function parseSignalBody(ctx: FlagContext, kind: ParseKind, body: unknown, options: ParseOptions): ParseResult {
  if (!ctx.enabled) return flagOff();
  if (!Number.isFinite(options.nowMs)) return { ok: false, error: "BAD_INPUT", detail: "nowMs must be a finite number" };
  if (kind !== "mispriced" && kind !== "signals") return { ok: false, error: "BAD_INPUT", detail: "kind must be mispriced or signals" };
  if (options.minCapacityUsd !== undefined && !toRational(options.minCapacityUsd).ok) {
    return { ok: false, error: "BAD_INPUT", detail: "minCapacityUsd must be a plain decimal string" };
  }
  for (const ms of [options.maxForecastAgeMs, options.maxQuoteAgeMs]) {
    if (ms !== undefined && (!Number.isFinite(ms) || ms < 0)) return { ok: false, error: "BAD_INPUT", detail: "age limits must be non-negative numbers of milliseconds" };
  }

  let parsed: unknown = body;
  if (typeof body === "string") {
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return { ok: false, error: "TOO_LARGE", detail: `body exceeds ${MAX_BODY_BYTES} bytes; pass only the selected rows` };
    try {
      parsed = JSON.parse(body);
    } catch {
      return { ok: false, error: "BAD_INPUT", detail: "body is not valid JSON" };
    }
  } else {
    try {
      const size = JSON.stringify(body)?.length ?? 0;
      if (size > MAX_BODY_BYTES) return { ok: false, error: "TOO_LARGE", detail: `body exceeds ${MAX_BODY_BYTES} bytes; pass only the selected rows` };
    } catch {
      return { ok: false, error: "BAD_INPUT", detail: "body is not serialisable JSON" };
    }
  }

  const rawRows = extractRows(parsed);
  if (rawRows === null) return { ok: false, error: "BAD_SHAPE", detail: "expected an array of rows or an object with exactly one of markets, signals, items or data holding an array" };
  if (rawRows.length > MAX_ROWS) return { ok: false, error: "TOO_MANY_ROWS", detail: `at most ${MAX_ROWS} rows per call` };

  const rows: QuotientRow[] = [];
  const rejected: RejectedRow[] = [];
  rawRows.forEach((raw, index) => {
    try {
      if (!isObj(raw)) throw new RowError("BAD_ROW", "row");
      if (kind === "mispriced") {
        rows.push(mispricedRow(raw, options));
      } else if (get(raw, "kind") === "sports_game") {
        rows.push(...sportsRows(raw, options, rejected, index));
      } else {
        rows.push(signalRow(raw, options));
      }
    } catch (e) {
      if (e instanceof RowError) rejected.push({ index, code: e.code, field: e.field });
      else throw e;
    }
  });

  return {
    ok: true,
    kind,
    parsedAtMs: options.nowMs,
    rows,
    rejected,
    schemaDrift: rejected.some((r) => r.code === "UNKNOWN_ENUM" || r.code === "UNKNOWN_VENUE"),
    counts: { received: rawRows.length, parsed: rows.length, usable: rows.filter((r) => r.usable).length, rejected: rejected.length },
    restricted: { source: "quotient", memoryOnly: true, persisted: false, exported: false },
    clause: QUOTIENT_CLAUSE,
    disclosure: DISCLOSURE,
    untrustedNotice: UNTRUSTED_DATA_NOTICE,
  };
}
