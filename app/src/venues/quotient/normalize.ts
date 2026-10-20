import type * as z from "zod/v4";

import { cmpQty, decFromNumber, parseQty, toDec, type Qty } from "../../core/money";
import { parseIsoMs } from "../../core/format";
import { freshnessOf, ttlFor } from "../../core/cache";
import type { Dec, Untrusted } from "../../core/ports";
import { untrustedField } from "../../core/untrusted";
import {
  ASSESSMENT_SOURCES,
  CONSISTENCY_TOLERANCE,
  ENTRY_STATUSES,
  FORECAST_STATUS_STATES,
  MARKET_KEY,
  MAX_ROWS,
  QUALITY_STATUSES,
  QUALITY_TIERS,
  QUOTE_METHODS,
  Q_COVERAGE_STATES,
  QUOTIENT_VENUES,
  RETIRED_REASONS,
  SIDES,
  SPREAD_DIRECTIONS,
  type AssessmentSource,
  type EntryStatus,
  type ForecastStatusState,
  type QualityStatus,
  type QualityTier,
  type QuoteMethod,
  type QuotientVenue,
  type RetiredReason,
  type Side,
  type SpreadDirection,
} from "./constants";
import type {
  ForecastView,
  Orientation,
  QualityView,
  QuoteView,
  QuotientProv,
  QuotientRow,
  RefusalCode,
  RowKind,
  RowRefusal,
  RowSet,
  SignalView,
  SportsListing,
  SportsView,
} from "./model";
import {
  lookupEnvelopeSchema,
  lookupRowSchema,
  mispricedEnvelopeSchema,
  mispricedRowSchema,
  signalsEnvelopeSchema,
  sportsListingSchema,
  sportsSignalSchema,
  standardSignalSchema,
} from "./schemas";
import { nonNegativeDec, probability, within } from "./units";

// Raw (hostile, unversioned) JSON -> QuotientRow. Fail closed per row: a row with an unknown enum, a value out of
// its unit range, a missing field or an inconsistent derived number is refused with a reason that names the
// FIELD (written here, never copied from upstream) and is counted. The rest of the page still renders. A whole
// response that is not the expected envelope is a failure of the response (the caller reports SCHEMA_DRIFT).

export interface IngestContext {
  readonly fetchedAtMs: number;
  // T0 browser-direct or the daemon's proxy without a key, T2 with the user's key, T3 imported by the user.
  readonly transport: "T0" | "T2" | "T3";
  readonly route: "mispriced" | "signals" | "lookup";
}

class Refuse extends Error {
  readonly refusal: RowRefusal;
  constructor(code: RefusalCode, field: string) {
    super(`${code}:${field}`);
    this.refusal = { code, field };
  }
}

function pathOf(path: ReadonlyArray<PropertyKey>): string {
  return path.map((part) => String(part)).join(".");
}

function walk(value: unknown, path: ReadonlyArray<PropertyKey>): unknown {
  let current = value;
  for (const part of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<PropertyKey, unknown>)[part];
  }
  return current;
}

// zod says what is wrong; the raw row says whether it was absent or the wrong type. The path names come from the
// schema above, not from the data.
function parseStructure<S extends z.ZodType>(schema: S, row: unknown): z.infer<S> {
  const parsed = schema.safeParse(row);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const path = issue?.path ?? [];
  const field = path.length === 0 ? "row" : pathOf(path);
  throw new Refuse(walk(row, path) === undefined ? "missing_field" : "wrong_type", field);
}

function oneOf<T extends string>(field: string, value: unknown, list: readonly T[]): T {
  if (typeof value !== "string" || !(list as readonly string[]).includes(value)) throw new Refuse("unknown_enum", field);
  return value as T;
}

function optionalOneOf<T extends string>(field: string, value: unknown, list: readonly T[]): T | null {
  return value === undefined || value === null ? null : oneOf(field, value, list);
}

function prob(field: string, value: unknown, scale: "unit" | "percent"): { readonly dec: Dec; readonly qty: Qty } {
  const result = probability(value, scale);
  if (!result.ok) throw new Refuse(result.reason === "not_a_number" ? "unit_not_a_number" : "unit_out_of_range", field);
  return { dec: result.value, qty: result.qty };
}

function optionalProb(field: string, value: unknown, scale: "unit" | "percent"): Dec | null {
  return value === undefined || value === null ? null : prob(field, value, scale).dec;
}

function idString(field: string, value: unknown): string {
  const text = typeof value === "number" ? (Number.isSafeInteger(value) ? String(value) : "") : typeof value === "string" ? value : "";
  if (!/^[A-Za-z0-9_.#:-]{1,100}$/.test(text)) throw new Refuse("wrong_type", field);
  return text;
}

// marketKey is `<venue>:<native id>`; the venue part must be the row's venue, or the join key lies.
function marketKey(field: string, key: string, venue: QuotientVenue): string {
  if (!MARKET_KEY.test(key)) throw new Refuse("wrong_type", field);
  if (!key.startsWith(`${venue}:`)) throw new Refuse("inconsistent", field);
  return key;
}

function bool(value: boolean | null | undefined): boolean | null {
  return value === undefined ? null : value;
}

function text(field: "title" | "description" | "generic" | "outcome", value: string | null | undefined): Untrusted<string> | null {
  return value === undefined || value === null ? null : untrustedField(field, value, "quotient");
}

function sample(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const qty = parseQty("shares", typeof value === "number" ? String(value) : value);
  if (qty === null || qty.scale !== 0 || qty.atomic > 1_000_000_000n) throw new Refuse("unit_out_of_range", "quality.sample");
  return Number(qty.atomic);
}

function quality(value: z.infer<typeof mispricedRowSchema>["forecast"]["quality"]): QualityView | null {
  if (value === undefined || value === null) return null;
  const status: QualityStatus | null = optionalOneOf("quality.status", value.status, QUALITY_STATUSES);
  const tier: QualityTier | null = optionalOneOf("quality.tier", value.tier, QUALITY_TIERS);
  const assessmentSource: AssessmentSource | null = optionalOneOf("quality.assessment_source", value.assessment_source, ASSESSMENT_SOURCES);
  return {
    status,
    tier,
    assessmentSource,
    basis: text("generic", value.basis),
    liveSample: sample(value.live?.n),
    historicalSample: sample(value.historical?.n),
  };
}

function quote(value: z.infer<typeof mispricedRowSchema>["venue_quote"]): QuoteView | null {
  if (value === undefined || value === null) return null;
  const method: QuoteMethod | null = optionalOneOf("venue_quote.quote_method", value.quote_method, QUOTE_METHODS);
  const observed = value.observed_at === undefined || value.observed_at === null ? null : parseIsoMs(value.observed_at);
  const venueTs = value.venue_timestamp === undefined || value.venue_timestamp === null ? null : parseIsoMs(value.venue_timestamp);
  return {
    method,
    probability: optionalProb("venue_quote.selected_probability", value.selected_probability, "unit"),
    yesBid: optionalProb("venue_quote.yes_bid", value.yes_bid, "unit"),
    yesAsk: optionalProb("venue_quote.yes_ask", value.yes_ask, "unit"),
    observedAtMs: observed,
    venueTimestampMs: venueTs,
    // The vocabulary of `freshness` was not captured. Only the exact word "fresh" counts as fresh; any other
    // value (including one never seen) is "not fresh", and the client's own age check applies on top.
    reportedFresh: value.freshness === undefined || value.freshness === null ? null : value.freshness === "fresh",
  };
}

function forecastStatus(value: { readonly state: string } | null | undefined): ForecastStatusState | null {
  return value === undefined || value === null ? null : oneOf("forecast_status.state", value.state, FORECAST_STATUS_STATES);
}

function forecastView(f: z.infer<typeof mispricedRowSchema>["forecast"]): { readonly view: ForecastView; readonly qYes: { readonly dec: Dec; readonly qty: Qty } } {
  const created = parseIsoMs(f.created_at);
  if (created === null) throw new Refuse("wrong_type", "forecast.created_at");
  const qYes = prob("forecast.probability", f.probability, "unit");
  const delta = f.delta_from_prior === undefined || f.delta_from_prior === null ? null : signedDelta(f.delta_from_prior);
  return {
    view: { id: f.id === undefined || f.id === null ? null : idString("forecast.id", f.id), createdAtMs: created, deltaFromPrior: delta, thesis: text("description", f.thesis) },
    qYes,
  };
}

// delta_from_prior is a signed change in probability (-1 to 1).
function signedDelta(value: unknown): Dec {
  const raw = typeof value === "number" ? decFromNumber(value) : value;
  const qty = parseQty("price", raw, { allowNegative: true });
  if (qty === null) throw new Refuse("unit_not_a_number", "forecast.delta_from_prior");
  const one = parseQty("price", "1");
  const magnitude = qty.atomic < 0n ? { ...qty, atomic: -qty.atomic } : qty;
  if (one === null || cmpQty(magnitude, one) > 0) throw new Refuse("unit_out_of_range", "forecast.delta_from_prior");
  return toDec(qty);
}

function provFor(ctx: IngestContext, venue: QuotientVenue | null, quoteView: QuoteView | null): QuotientProv {
  const ttlMs = ttlFor("quotient_lists");
  return {
    venue: venue === null ? null : venue === "hl_outcomes" ? "hyperliquid" : venue,
    source: `quotient:${ctx.route}`,
    fetchedAtMs: ctx.fetchedAtMs,
    ...(quoteView?.observedAtMs != null ? { venueTsMs: quoteView.observedAtMs } : {}),
    transport: ctx.transport,
    freshness: freshnessOf(ctx.fetchedAtMs, ttlMs, ctx.fetchedAtMs),
    ttlMs,
    license: "own_use_only",
  };
}

function orientationOfStandard(venue: QuotientVenue, qYes: Qty, side: string | null): Orientation {
  // hl_outcomes covers sports game winners only, which carry a yes_side; a row without one cannot be mapped.
  if (venue === "hl_outcomes") return { proven: false, reason: "hl_outcomes_needs_link" };
  // q_side is the side Q favours now. If it contradicts the probability on the same row, one of them is on
  // another scale or another orientation (the 17.11.0 class of bug): do not show the number.
  const half = parseQty("price", "0.5");
  if (side !== null && half !== null) {
    const order = cmpQty(qYes, half);
    if ((side === "YES" && order < 0) || (side === "NO" && order > 0)) return { proven: false, reason: "q_side_disagrees_with_probability" };
  }
  return { proven: true, basis: "venue_yes" };
}

// ---- mispriced -------------------------------------------------------------------------------------------------------------

function mispricedRow(raw: unknown, ctx: IngestContext): QuotientRow {
  const row = parseStructure(mispricedRowSchema, raw);
  const venue = oneOf("venue", row.venue, QUOTIENT_VENUES);
  const key = marketKey("marketKey", row.marketKey, venue);
  const coverage = oneOf("q_coverage", row.q_coverage, Q_COVERAGE_STATES);
  const direction: SpreadDirection = oneOf("spread_direction", row.spread_direction, SPREAD_DIRECTIONS);
  const { view, qYes } = forecastView(row.forecast);
  const quotientOdds = prob("quotient_odds", row.quotient_odds, "unit");
  const marketOdds = prob("market_odds", row.market_odds, "unit");
  const spread = prob("spread", row.spread, "unit");
  const quoteView = quote(row.venue_quote);
  const status = forecastStatus(row.forecast_status);
  const qual = quality(row.forecast.quality);

  // The same number arrives in several fields: they must agree, or a unit or orientation error hides in one.
  if (!within(qYes.qty, quotientOdds.qty, CONSISTENCY_TOLERANCE)) throw new Refuse("inconsistent", "quotient_odds");
  if (quoteView?.probability != null) {
    const selected = parseQty("price", quoteView.probability);
    if (selected !== null && !within(selected, marketOdds.qty, CONSISTENCY_TOLERANCE)) throw new Refuse("inconsistent", "market_odds");
  }
  const gap = absGap(quotientOdds.qty, marketOdds.qty);
  if (!within(spread.qty, gap, CONSISTENCY_TOLERANCE)) throw new Refuse("inconsistent", "spread");
  const tolerance = parseQty("price", CONSISTENCY_TOLERANCE);
  if (tolerance !== null && cmpQty(gap, tolerance) > 0) {
    const higher = cmpQty(quotientOdds.qty, marketOdds.qty) > 0;
    if ((direction === "q_higher") !== higher) throw new Refuse("inconsistent", "spread_direction");
  }

  const yesSide = row.sports?.yes_side;
  const isSports = row.sports !== undefined && row.sports !== null;
  const sports: SportsView | null = isSports ? { yesSide: yesSide === undefined || yesSide === null || yesSide.length === 0 ? null : untrustedField("outcome", yesSide, "quotient"), listings: [], listingsRejected: 0 } : null;
  let orientation: Orientation;
  if (isSports) {
    orientation = yesSide === undefined || yesSide === null || yesSide.length === 0 ? { proven: false, reason: "sports_yes_side_missing" } : { proven: false, reason: "sports_yes_side_needs_link" };
  } else {
    orientation = orientationOfStandard(venue, qYes.qty, null);
  }

  return {
    rowId: `mispriced:${key}`,
    kind: "mispriced",
    key,
    venue,
    nativeMarketId: idString("nativeMarketId", row.nativeMarketId),
    question: text("title", row.question),
    coverage,
    coverageAssumed: false,
    qYesRaw: qYes.dec,
    forecast: view,
    quote: quoteView,
    marketOdds: marketOdds.dec,
    spread: spread.dec,
    spreadDirection: direction,
    inDispute: bool(row.inDispute),
    forecastStatus: status,
    quality: qual,
    signal: null,
    sports,
    orientation,
    prov: provFor(ctx, venue, quoteView),
  };
}

function absGap(a: Qty, b: Qty): Qty {
  const scale = Math.max(a.scale, b.scale);
  const left = a.atomic * 10n ** BigInt(scale - a.scale);
  const right = b.atomic * 10n ** BigInt(scale - b.scale);
  const diff = left >= right ? left - right : right - left;
  return { unit: "price", atomic: diff, scale };
}

// ---- signals ---------------------------------------------------------------------------------------------------------------

function signalView(row: z.infer<typeof standardSignalSchema> | z.infer<typeof sportsSignalSchema>, side: Side, qSide: Side | null, livePriced: boolean | null, entryQ: Dec | null): SignalView {
  const tier = row.conviction_tier;
  let convictionTier: 1 | 2 | 3 | null = null;
  if (tier !== undefined && tier !== null) {
    const qty = parseQty("shares", typeof tier === "number" ? String(tier) : tier);
    if (qty === null || qty.scale !== 0) throw new Refuse("unit_not_a_number", "conviction_tier");
    if (qty.atomic < 1n || qty.atomic > 3n) throw new Refuse("unit_out_of_range", "conviction_tier");
    convictionTier = Number(qty.atomic) as 1 | 2 | 3;
  }
  const capacityRaw = row.capacity_usd_at_2c;
  let capacity: Dec | null = null;
  if (capacityRaw !== undefined && capacityRaw !== null) {
    capacity = nonNegativeDec(capacityRaw);
    if (capacity === null) throw new Refuse("unit_not_a_number", "capacity_usd_at_2c");
  }
  return {
    side,
    qSide,
    isActive: bool(row.is_active),
    inPlay: bool(row.in_play),
    entryEligible: bool(row.entry_eligible),
    entryStatus: optionalOneOf<EntryStatus>("entry_status", row.entry_status, ENTRY_STATUSES),
    retiredReason: optionalOneOf<RetiredReason>("retired_reason", row.retired_reason, RETIRED_REASONS),
    entryQ,
    convictionTier,
    livePriced,
    drawdownRiskElevated: bool(row.drawdown_risk_elevated),
    capacityUsdAt2c: capacity,
    capacityBasis: optionalOneOf("capacity_basis", row.capacity_basis, ["depth-2c", "volume-fallback"] as const),
  };
}

function signalForecast(row: z.infer<typeof standardSignalSchema> | z.infer<typeof sportsSignalSchema>): ForecastView {
  const updated = row.forecast_updated_at === undefined || row.forecast_updated_at === null ? null : parseIsoMs(row.forecast_updated_at);
  if (updated === null) throw new Refuse("missing_field", "forecast_updated_at");
  return { id: null, createdAtMs: updated, deltaFromPrior: null, thesis: text("description", row.thesis) };
}

function signalQuality(row: z.infer<typeof standardSignalSchema> | z.infer<typeof sportsSignalSchema>): QualityView | null {
  return quality(row.quality as z.infer<typeof mispricedRowSchema>["forecast"]["quality"]);
}

function standardSignal(raw: unknown, ctx: IngestContext): QuotientRow {
  const row = parseStructure(standardSignalSchema, raw);
  const side = oneOf<Side>("side", row.side, SIDES);
  const qSide = optionalOneOf<Side>("q_side", row.q_side, SIDES);
  const venue = oneOf("market.venue", row.market.venue, QUOTIENT_VENUES);
  const key = marketKey("market.marketKey", row.market.marketKey, venue);
  const coverage = oneOf("market.q_coverage", row.market.q_coverage, Q_COVERAGE_STATES);
  const qYes = prob("latest_q", row.latest_q, "unit");
  const entryQ = row.entry_q === undefined || row.entry_q === null ? null : prob("entry_q", row.entry_q, "percent").dec;
  const marketOdds = optionalProb("market_odds", row.market_odds, "unit");
  const quoteView = quote(row.venue_quote);
  const forecast = signalForecast(row);
  const status = forecastStatus(row.forecast_status);
  const signal = signalView(row, side, qSide, bool(row.live_priced), entryQ);
  const qual = signalQuality(row);

  return {
    rowId: `signal:${key}:${idString("id", row.id)}`,
    kind: "signal",
    key,
    venue,
    nativeMarketId: idString("market.nativeMarketId", row.market.nativeMarketId),
    question: text("title", row.market.question),
    coverage,
    coverageAssumed: false,
    qYesRaw: qYes.dec,
    forecast,
    quote: quoteView,
    marketOdds,
    spread: null,
    spreadDirection: null,
    inDispute: null,
    forecastStatus: status,
    quality: qual,
    signal,
    sports: null,
    orientation: orientationOfStandard(venue, qYes.qty, qSide ?? null),
    prov: provFor(ctx, venue, quoteView),
  };
}

function sportsSignal(raw: unknown, ctx: IngestContext): QuotientRow {
  const row = parseStructure(sportsSignalSchema, raw);
  const qYes = prob("pick.probability", row.pick.probability, "unit");
  const yesSide = row.sports.yes_side;
  const forecast = signalForecast(row);
  const status = forecastStatus(row.forecast_status);
  const qual = signalQuality(row);
  const listings: SportsListing[] = [];
  let rejected = 0;
  for (const item of row.markets.slice(0, 64)) {
    const parsed = sportsListingSchema.safeParse(item);
    if (!parsed.success) {
      rejected += 1;
      continue;
    }
    const listing = parsed.data;
    try {
      const venue = oneOf("markets.venue", listing.venue, QUOTIENT_VENUES);
      const key = listing.marketKey === undefined || listing.marketKey === null ? null : marketKey("markets.marketKey", listing.marketKey, venue);
      listings.push({
        venue,
        marketKey: key,
        signalSide: optionalOneOf<Side>("markets.signal_side", listing.signal_side, SIDES),
        price: optionalProb("markets.price", listing.price, "unit"),
        signalAvailable: bool(listing.signal_available),
        entryEligible: bool(listing.entry_eligible),
        entryStatus: optionalOneOf<EntryStatus>("markets.entry_status", listing.entry_status, ENTRY_STATUSES),
      });
    } catch (error) {
      if (!(error instanceof Refuse)) throw error;
      rejected += 1;
    }
  }
  // A sports signal's own side is per listing; the row has no single side, so the signal view carries YES as the
  // reference side only to satisfy the type and sets nothing else from it.
  const signal = signalView(row, "YES", null, null, null);
  const sports: SportsView = {
    yesSide: yesSide === undefined || yesSide === null || yesSide.length === 0 ? null : untrustedField("outcome", yesSide, "quotient"),
    listings,
    listingsRejected: rejected,
  };
  return {
    rowId: `sports_signal:${idString("id", row.id)}`,
    kind: "sports_signal",
    key: null,
    venue: null,
    nativeMarketId: null,
    question: null,
    // Every covered sports market is "experimental" (research 12 section 2). The row carries no coverage field.
    coverage: "experimental",
    coverageAssumed: true,
    qYesRaw: qYes.dec,
    forecast,
    quote: null,
    marketOdds: null,
    spread: null,
    spreadDirection: null,
    inDispute: null,
    forecastStatus: status,
    quality: qual,
    signal,
    sports,
    orientation: sports.yesSide === null ? { proven: false, reason: "sports_yes_side_missing" } : { proven: false, reason: "sports_yes_side_needs_link" },
    prov: provFor(ctx, null, null),
  };
}

function signalRow(raw: unknown, ctx: IngestContext): QuotientRow {
  const kind = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>)["kind"] : undefined;
  if (kind === undefined || kind === null) return standardSignal(raw, ctx);
  if (kind === "sports_game") return sportsSignal(raw, ctx);
  throw new Refuse("unknown_enum", "kind");
}

// ---- lookup ---------------------------------------------------------------------------------------------------------------

function lookupRow(raw: unknown, ctx: IngestContext): QuotientRow {
  const row = parseStructure(lookupRowSchema, raw);
  const venue = oneOf("venue", row.venue, QUOTIENT_VENUES);
  const key = marketKey("marketKey", row.marketKey, venue);
  const coverage = row.q_coverage === undefined || row.q_coverage === null ? null : oneOf("q_coverage", row.q_coverage, Q_COVERAGE_STATES);
  const { view, qYes } = forecastView(row.forecast);
  const qual = quality(row.forecast.quality);
  const isSports = row.sports !== undefined && row.sports !== null;
  const yesSide = row.sports?.yes_side;
  return {
    rowId: `lookup:${key}`,
    kind: "lookup",
    key,
    venue,
    nativeMarketId: key.slice(venue.length + 1),
    question: text("title", row.question),
    coverage,
    coverageAssumed: false,
    qYesRaw: qYes.dec,
    forecast: view,
    quote: null,
    marketOdds: null,
    spread: null,
    spreadDirection: null,
    inDispute: null,
    forecastStatus: null,
    quality: qual,
    signal: null,
    sports: isSports ? { yesSide: yesSide === undefined || yesSide === null || yesSide.length === 0 ? null : untrustedField("outcome", yesSide, "quotient"), listings: [], listingsRejected: 0 } : null,
    orientation: isSports
      ? yesSide === undefined || yesSide === null || yesSide.length === 0
        ? { proven: false, reason: "sports_yes_side_missing" }
        : { proven: false, reason: "sports_yes_side_needs_link" }
      : orientationOfStandard(venue, qYes.qty, null),
    prov: provFor(ctx, venue, null),
  };
}

// ---- envelopes -------------------------------------------------------------------------------------------------------------

export type IngestOutcome = { readonly ok: true; readonly set: RowSet } | { readonly ok: false; readonly reason: "bad_envelope" | "every_row_refused"; readonly rejected: readonly RowRefusal[] };

export function ingest(body: unknown, ctx: IngestContext): IngestOutcome {
  let rawRows: readonly unknown[];
  let count: number | null = null;
  let build: (raw: unknown) => QuotientRow;
  if (ctx.route === "mispriced") {
    const envelope = mispricedEnvelopeSchema.safeParse(body);
    if (!envelope.success) return { ok: false, reason: "bad_envelope", rejected: [] };
    rawRows = envelope.data.markets;
    count = envelope.data.count ?? null;
    build = (raw) => mispricedRow(raw, ctx);
  } else if (ctx.route === "signals") {
    const envelope = signalsEnvelopeSchema.safeParse(body);
    if (!envelope.success) return { ok: false, reason: "bad_envelope", rejected: [] };
    rawRows = envelope.data.signals;
    build = (raw) => signalRow(raw, ctx);
  } else {
    const envelope = lookupEnvelopeSchema.safeParse(body);
    if (!envelope.success) return { ok: false, reason: "bad_envelope", rejected: [] };
    rawRows = envelope.data.markets;
    build = (raw) => lookupRow(raw, ctx);
  }
  const truncated = rawRows.length > MAX_ROWS;
  const rows: QuotientRow[] = [];
  const rejected: RowRefusal[] = [];
  const seen = new Set<string>();
  for (const raw of rawRows.slice(0, MAX_ROWS)) {
    try {
      const row = build(raw);
      // A repeated row (same id) is dropped, not shown twice.
      if (seen.has(row.rowId)) {
        rejected.push({ code: "inconsistent", field: "rowId" });
        continue;
      }
      seen.add(row.rowId);
      rows.push(row);
    } catch (error) {
      if (!(error instanceof Refuse)) throw error;
      rejected.push(error.refusal);
    }
  }
  if (rows.length === 0 && rejected.length > 0) return { ok: false, reason: "every_row_refused", rejected };
  return { ok: true, set: { route: ctx.route, rows, rejected, truncated, count } };
}

export type { RowKind };
