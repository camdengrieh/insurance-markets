// pm_signal_parse: validate and normalise a PAID Quotient body that the agent hands back.
//
// Everything here is memory-only. Nothing is written, cached, logged or exported; the module has
// no file, network or process access (a test scans the source to keep it that way). Quotient's
// terms bar redistribution, so rows go back to the same agent that paid for them and nowhere else.
//
// The body is validated by the shared Quotient validator (sdk/signals/quotient), the same one the
// dApp's Signals screen reads through: structure, closed lists, unit scales, a number that arrives
// in two fields being the same number, ISO timestamps and timestamps in the future. Shapes come from
// the OpenAPI 20.5.0 spec only (research 12, section 5): no real paid body was ever read. An unknown
// venue or an unknown value of an enum REJECTS that row and sets schemaDrift, because a new value may
// change what the row means.
//
// What stays here is this tool's own contract: the flag, the input caps (the agent passes only the
// rows it selected, as a bare array or under one of markets/signals/items/data), one output row per
// sports listing, and the demotions that say why a row cannot be used as an input.

import { ingest, type QuoteMethod, type QuoteView, type QuotientRow as ValidatedRow, type RowRefusal, type SportsListing } from "../../sdk/signals/quotient/index.js";
import { sanitizeField, UNTRUSTED_DATA_NOTICE, type UntrustedContent } from "../../src/guardrails/untrusted.js";
import { ZERO, absR, cmp, eq, ratToDecExact, sub, type Rational, type SDec } from "../core/rational.js";
import {
  DISCLOSURE,
  LIVE_QUOTE_VENUES,
  MAX_BODY_BYTES,
  MAX_ROWS,
  QUALITY_STATUSES,
  QUALITY_TIERS,
  QUOTIENT_CLAUSE,
  SPREAD_DIRECTIONS,
  type EntryStatus,
  type ForecastState,
  type QCoverage,
  type QuotientVenue,
  type RetiredReason,
} from "./constants.js";
import { flagOff, type FlagContext, type FlagOff } from "./flag.js";
import { toRational } from "./numbers.js";

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
  // A field name written by the validator, never a value taken from the row.
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

type Obj = Readonly<Record<string, unknown>>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Own properties only, so a hostile `__proto__` or inherited key can never be read.
function get(o: Obj, key: string): unknown {
  return Object.hasOwn(o, key) ? o[key] : undefined;
}

// ---------------------------------------------------------------------------------------------
// Refusals: the validator's reasons in this tool's vocabulary

const VENUE_FIELDS: readonly string[] = ["venue", "market.venue", "markets.venue"];
const KEY_FIELDS: readonly string[] = ["marketKey", "market.marketKey", "markets.marketKey"];
const NATIVE_FIELDS: readonly string[] = ["nativeMarketId", "market.nativeMarketId", "markets.nativeMarketId"];

function rejectCode(refusal: RowRefusal): RejectCode {
  const { code, field } = refusal;
  switch (code) {
    case "missing_field":
      return field === "market_odds" ? "NO_QUOTE" : "MISSING_FIELD";
    case "wrong_type":
      if (field === "row") return "BAD_ROW";
      return KEY_FIELDS.includes(field) ? "BAD_MARKET_KEY" : "BAD_FIELD";
    case "unknown_enum":
      return VENUE_FIELDS.includes(field) ? "UNKNOWN_VENUE" : "UNKNOWN_ENUM";
    case "unit_not_a_number":
      return "BAD_FIELD";
    case "unit_out_of_range":
      return "OUT_OF_RANGE";
    case "inconsistent":
      return KEY_FIELDS.includes(field) || NATIVE_FIELDS.includes(field) ? "MARKET_KEY_MISMATCH" : "INCONSISTENT";
    case "future_timestamp":
      return "FUTURE_TIMESTAMP";
  }
}

function rejected(refusal: RowRefusal): RejectedRow {
  return { index: refusal.index, code: rejectCode(refusal), field: refusal.field };
}

// ---------------------------------------------------------------------------------------------
// Row builders: a validated row in, this tool's row (with its demotions) out

function rational(dec: string): Rational {
  const r = toRational(dec);
  // The validator hands over plain decimal strings; anything else is a bug, not data.
  if (!r.ok) throw new Error("validated decimal did not parse");
  return r.value;
}

function dec(r: Rational): string {
  const text = ratToDecExact(r);
  // Decimals and exact divisions by 100 always terminate; anything else is a bug, not data.
  if (text === null) throw new Error("decimal did not terminate");
  return text;
}

function ratSigned(r: Rational): SDec {
  const neg = r.n < 0n;
  return neg ? `-${dec({ n: -r.n, d: r.d })}` : dec(r);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function resanitised(field: "title" | "generic" | "description", value: { readonly value: string } | null): UntrustedContent | null {
  return value === null ? null : sanitizeField(field, value.value, "quotient");
}

function quoteInfo(venue: QuotientVenue, view: QuoteView | null, nowMs: number): QuoteInfo {
  if (view === null) return { method: null, freshness: "unreported", liveVerified: null, observedAt: null, ageMs: null };
  return {
    method: view.method,
    freshness: view.reportedFresh === null ? "unreported" : view.reportedFresh ? "fresh" : "not_fresh",
    liveVerified: view.method === null ? null : view.method !== "graph_snapshot" && (LIVE_QUOTE_VENUES as readonly string[]).includes(venue),
    observedAt: view.observedAtMs === null ? null : iso(view.observedAtMs),
    ageMs: view.observedAtMs === null ? null : Math.max(0, nowMs - view.observedAtMs),
  };
}

function qualityOf(row: ValidatedRow): QuotientRow["quality"] {
  const q = row.quality;
  if (q === null) return null;
  return {
    status: q.status,
    tier: q.tier,
    assessmentSource: q.assessmentSource,
    basis: resanitised("generic", q.basis),
    liveN: q.liveSample,
    historicalN: q.historicalSample,
  };
}

interface Common {
  readonly source: RowSource;
  readonly signalId: string | null;
  readonly venue: QuotientVenue;
  readonly marketKey: string;
  readonly marketId: string;
  readonly conditionId: string | null;
  readonly question: UntrustedContent | null;
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
  readonly thesis: { readonly value: string } | null;
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
    // The validator refused a reported spread more than 0.01 away; a smaller gap is Quotient's rounding.
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
    if (need.ok) {
      if (c.capacity === null) add("CAPACITY_UNKNOWN");
      else if (cmp(c.capacity, need.value) < 0) add("CAPACITY_BELOW_SIZE");
    }
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
    venue: c.venue,
    marketKey: c.marketKey,
    marketId: c.marketId,
    conditionId: c.conditionId,
    question: c.question,
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
    ...(o.includeText === true && c.thesis !== null ? { thesis: sanitizeField("description", c.thesis.value, "quotient") } : {}),
    warnings,
    demotions,
    usable: demotions.length === 0,
  };
}

function sportsOrientation(row: ValidatedRow): Orientation {
  return { kind: "sports_yes_side", yesSide: resanitised("generic", row.sports?.yesSide ?? null), mappedToTokens: false };
}

// Mispriced rows (research 12, section 5.2).
function mispricedRow(row: ValidatedRow, o: ParseOptions): QuotientRow {
  const venue = row.venue as QuotientVenue;
  const id = row.nativeMarketId as string;
  return finish(
    {
      source: "mispriced",
      signalId: null,
      venue,
      marketKey: `${venue}:${id}`,
      marketId: id,
      conditionId: row.conditionId,
      question: resanitised("title", row.question),
      q: rational(row.qYesRaw),
      orientation: row.sports === null ? { kind: "venue_yes" } : sportsOrientation(row),
      market: row.marketOdds === null ? null : rational(row.marketOdds),
      side: null,
      atPublish: null,
      qCoverage: row.coverage as QCoverage,
      entryEligible: null,
      entryStatus: null,
      inPlay: null,
      isActive: null,
      retiredReason: null,
      forecastState: row.forecastStatus,
      quote: quoteInfo(venue, row.quote, o.nowMs),
      forecastMs: row.forecast.createdAtMs,
      quality: qualityOf(row),
      inDispute: row.inDispute,
      drawdown: null,
      isSignal: false,
      capacity: null,
      endMs: row.endsAtMs,
      reportedSpread: row.spread === null ? null : rational(row.spread),
      thesis: row.forecast.thesis,
      warnings: [],
    },
    o,
  );
}

// Non-sports signals (research 12, section 5.1).
function signalRow(row: ValidatedRow, o: ParseOptions): QuotientRow {
  const venue = row.venue as QuotientVenue;
  const id = row.nativeMarketId as string;
  const signal = row.signal;
  if (signal === null) throw new Error("a validated signal row has no signal view");
  const quote = quoteInfo(venue, row.quote, o.nowMs);
  // live_priced is true only for a verified live Polymarket International or Kalshi quote.
  const live = signal.livePriced;
  const q2: QuoteInfo = live === null ? quote : { ...quote, liveVerified: quote.liveVerified === false ? false : live };
  const warnings: string[] = [];
  let atPublish: QuotientRow["atPublish"] = null;
  if (signal.entryQ !== null || signal.entryPm !== null) {
    // entry_q is documented on 0..100. A value below 1 there (below 0.01 once normalised) may mean the scale changed.
    if (signal.entryQ !== null) {
      const eq0 = rational(signal.entryQ);
      if (cmp(eq0, ZERO) > 0 && cmp(eq0, { n: 1n, d: 100n }) < 0) warnings.push("entry_q_below_1_on_a_0_100_scale");
    }
    atPublish = { q: signal.entryQ === null ? null : dec(rational(signal.entryQ)), marketPrice: signal.entryPm === null ? null : dec(rational(signal.entryPm)) };
  }
  const market = row.marketOdds ?? row.quote?.probability ?? null;
  return finish(
    {
      source: "signal",
      signalId: signal.id,
      venue,
      marketKey: `${venue}:${id}`,
      marketId: id,
      conditionId: row.conditionId,
      question: resanitised("title", row.question),
      q: rational(row.qYesRaw),
      orientation: { kind: "venue_yes" },
      market: market === null ? null : rational(market),
      side: signal.side,
      atPublish,
      qCoverage: row.coverage as QCoverage,
      entryEligible: signal.entryEligible,
      entryStatus: signal.entryStatus,
      inPlay: signal.inPlay,
      isActive: signal.isActive,
      retiredReason: signal.retiredReason,
      forecastState: row.forecastStatus,
      quote: q2,
      forecastMs: row.forecast.createdAtMs,
      quality: qualityOf(row),
      inDispute: row.inDispute,
      drawdown: signal.drawdownRiskElevated,
      isSignal: true,
      capacity: signal.capacityUsdAt2c === null ? null : rational(signal.capacityUsdAt2c),
      endMs: row.endsAtMs,
      reportedSpread: null,
      thesis: row.forecast.thesis,
      warnings,
    },
    o,
  );
}

// Sports signals (kind "sports_game", API 20.0.0): one result per graph-linked listing, each with
// its own eligibility. No venue is primary; never take markets[0].
function sportsRows(row: ValidatedRow, o: ParseOptions): QuotientRow[] {
  const signal = row.signal;
  if (signal === null || row.sports === null) throw new Error("a validated sports row has no signal or sports view");
  return row.sports.listings.map((listing: SportsListing) => {
    const market = listing.price ?? listing.quote?.probability ?? null;
    return finish(
      {
        source: "signal_sports_listing",
        signalId: signal.id,
        venue: listing.venue,
        marketKey: listing.marketKey,
        marketId: listing.nativeMarketId,
        conditionId: listing.conditionId,
        question: resanitised("title", listing.question),
        q: rational(row.qYesRaw),
        orientation: sportsOrientation(row),
        market: market === null ? null : rational(market),
        side: listing.signalSide,
        atPublish: null,
        qCoverage: listing.coverage,
        entryEligible: listing.entryEligible,
        entryStatus: listing.entryStatus,
        inPlay: signal.inPlay,
        isActive: signal.isActive,
        retiredReason: signal.retiredReason,
        forecastState: row.forecastStatus,
        quote: quoteInfo(listing.venue, listing.quote, o.nowMs),
        forecastMs: row.forecast.createdAtMs,
        quality: qualityOf(row),
        inDispute: null,
        drawdown: signal.drawdownRiskElevated,
        isSignal: true,
        capacity: null,
        endMs: row.endsAtMs,
        reportedSpread: null,
        thesis: row.forecast.thesis,
        warnings: [],
      },
      o,
    );
  });
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

  // The rows the agent selected, in the envelope of the route they came from.
  const envelope = kind === "mispriced" ? { markets: rawRows } : { signals: rawRows };
  const outcome = ingest(envelope, { fetchedAtMs: options.nowMs, transport: "T3", route: kind });
  const validated = outcome.ok ? outcome.set.rows : [];
  const refusals = outcome.ok ? outcome.set.rejected : outcome.rejected;

  const rows: QuotientRow[] = [];
  const rejectedRows: RejectedRow[] = refusals.map(rejected);
  for (const row of validated) {
    if (row.kind === "mispriced") rows.push(mispricedRow(row, options));
    else if (row.kind === "sports_signal") {
      rows.push(...sportsRows(row, options));
      for (const refusal of row.sports?.listingRefusals ?? []) rejectedRows.push(rejected(refusal));
    } else rows.push(signalRow(row, options));
  }
  rejectedRows.sort((a, b) => a.index - b.index);

  return {
    ok: true,
    kind,
    parsedAtMs: options.nowMs,
    rows,
    rejected: rejectedRows,
    schemaDrift: rejectedRows.some((r) => r.code === "UNKNOWN_ENUM" || r.code === "UNKNOWN_VENUE"),
    counts: { received: rawRows.length, parsed: rows.length, usable: rows.filter((r) => r.usable).length, rejected: rejectedRows.length },
    restricted: { source: "quotient", memoryOnly: true, persisted: false, exported: false },
    clause: QUOTIENT_CLAUSE,
    disclosure: DISCLOSURE,
    untrustedNotice: UNTRUSTED_DATA_NOTICE,
  };
}
