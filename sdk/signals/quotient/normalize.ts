import type * as z from "zod/v4";

import { cmpQty, decFromNumber, parseQty, toDec, type Qty } from "../../money/qty.js";
import { parseIsoMs } from "../../format.js";
import { freshnessOf, ttlFor } from "../../venues/cache.js";
import type { Dec, Untrusted } from "../../model.js";
import { untrustedField } from "../../text.js";
import {
  ASSESSMENT_SOURCES,
  CLOCK_SKEW_MS,
  CONDITION_ID,
  CONSISTENCY_TOLERANCE,
  ENTRY_STATUSES,
  FORECAST_STATUS_STATES,
  MARKET_KEY,
  MAX_ROWS,
  MAX_SPORTS_LISTINGS,
  NATIVE_ID,
  QUALITY_STATUSES,
  QUALITY_TIERS,
  QUOTE_METHODS,
  Q_COVERAGE_STATES,
  QUOTIENT_VENUES,
  RETIRED_REASONS,
  SIDES,
  SIGNAL_ID,
  SPREAD_DIRECTIONS,
  type AssessmentSource,
  type EntryStatus,
  type ForecastStatusState,
  type QCoverage,
  type QualityStatus,
  type QualityTier,
  type QuoteMethod,
  type QuotientVenue,
  type RetiredReason,
  type Side,
  type SpreadDirection,
} from "./constants.js";
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
} from "./model.js";
import {
  lookupEnvelopeSchema,
  lookupRowSchema,
  mispricedEnvelopeSchema,
  mispricedRowSchema,
  signalsEnvelopeSchema,
  sportsListingSchema,
  sportsSignalSchema,
  standardSignalSchema,
} from "./schemas.js";
import { absDiff, nonNegativeDec, probability, within } from "./units.js";

// Raw (hostile, unversioned) JSON -> QuotientRow. The one validator of a Quotient body: the dApp's Signals screen
// and pm's signal tools both read through it, and neither fetches here. Fail closed per row: a row with an unknown
// enum, a value out of its unit range, a missing field, an inconsistent derived number or a timestamp in the future
// is refused with a reason that names the FIELD (written here, never copied from upstream) and is counted. The rest
// of the page still renders. A whole response that is not the expected envelope is a failure of the response (the
// caller reports SCHEMA_DRIFT).
//
// Where the dApp's reader and pm's parser used to disagree, the stricter rule is the one kept here: a number that
// arrives in two fields must be the same number, a timestamp is a full ISO date-time with an offset, and a field
// either reader required is required.

export interface IngestContext {
  // When the body was received. Also the reference for "in the future".
  readonly fetchedAtMs: number;
  // T0 browser-direct or the daemon's proxy without a key, T2 with the user's key, T3 imported by the user (or handed
  // back by the user's own agent).
  readonly transport: "T0" | "T2" | "T3";
  readonly route: "mispriced" | "signals" | "lookup";
}

class Refuse extends Error {
  readonly code: RefusalCode;
  readonly field: string;
  constructor(code: RefusalCode, field: string) {
    super(`${code}:${field}`);
    this.code = code;
    this.field = field;
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
function parseStructure<S extends z.ZodType>(schema: S, row: unknown, prefix = ""): z.infer<S> {
  const parsed = schema.safeParse(row);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const path = issue?.path ?? [];
  const field = path.length === 0 ? (prefix === "" ? "row" : prefix) : `${prefix === "" ? "" : `${prefix}.`}${pathOf(path)}`;
  throw new Refuse(walk(row, path) === undefined ? "missing_field" : "wrong_type", field);
}

function oneOf<T extends string>(field: string, value: unknown, list: readonly T[]): T {
  if (typeof value !== "string" || !(list as readonly string[]).includes(value)) throw new Refuse("unknown_enum", field);
  return value as T;
}

function optionalOneOf<T extends string>(field: string, value: unknown, list: readonly T[]): T | null {
  return value === undefined || value === null ? null : oneOf(field, value, list);
}

function requiredOneOf<T extends string>(field: string, value: unknown, list: readonly T[]): T {
  if (value === undefined || value === null) throw new Refuse("missing_field", field);
  return oneOf(field, value, list);
}

function prob(field: string, value: unknown, scale: "unit" | "percent"): { readonly dec: Dec; readonly qty: Qty } {
  const result = probability(value, scale);
  if (!result.ok) throw new Refuse(result.reason === "not_a_number" ? "unit_not_a_number" : "unit_out_of_range", field);
  return { dec: result.value, qty: result.qty };
}

function optionalProbQty(field: string, value: unknown, scale: "unit" | "percent"): { readonly dec: Dec; readonly qty: Qty } | null {
  return value === undefined || value === null ? null : prob(field, value, scale);
}

function optionalProb(field: string, value: unknown, scale: "unit" | "percent"): Dec | null {
  return optionalProbQty(field, value, scale)?.dec ?? null;
}

function same(a: Qty, b: Qty): boolean {
  return cmpQty(a, b) === 0;
}

// An id from the row: a string, or a safe integer written as one, matching `pattern`.
function idString(field: string, value: unknown, pattern: RegExp): string {
  const text = typeof value === "number" ? (Number.isSafeInteger(value) ? String(value) : "") : typeof value === "string" ? value : "";
  if (!pattern.test(text)) throw new Refuse("wrong_type", field);
  return text;
}

// marketKey is `<venue>:<native id>`; the venue part must be the row's venue, or the join key lies. A native id the
// row also states must be the key's id.
function identity(prefix: string, venue: QuotientVenue, key: string, native: unknown): { readonly key: string; readonly nativeMarketId: string } {
  const keyField = `${prefix}marketKey`;
  if (!MARKET_KEY.test(key)) throw new Refuse("wrong_type", keyField);
  if (!key.startsWith(`${venue}:`)) throw new Refuse("inconsistent", keyField);
  const id = key.slice(venue.length + 1);
  if (native !== undefined && native !== null && idString(`${prefix}nativeMarketId`, native, NATIVE_ID) !== id) throw new Refuse("inconsistent", `${prefix}nativeMarketId`);
  return { key, nativeMarketId: id };
}

function conditionId(field: string, value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (!CONDITION_ID.test(value)) throw new Refuse("wrong_type", field);
  return value.toLowerCase();
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A timestamp is a full ISO date-time with an explicit offset (an end date may be a bare date, read as UTC). A
// present value in any other form refuses the row; a time stamped later than the receipt (beyond the clock skew)
// refuses it too, unless the field is a deadline in the future by nature.
function timeMs(field: string, value: string | null | undefined, ctx: IngestContext, kind: "past" | "deadline"): number | null {
  if (value === undefined || value === null) return null;
  const shaped = ISO_DATE_TIME.test(value) || (kind === "deadline" && ISO_DATE.test(value));
  const ms = shaped ? parseIsoMs(value) : null;
  if (ms === null) throw new Refuse("wrong_type", field);
  if (kind === "past" && ms > ctx.fetchedAtMs + CLOCK_SKEW_MS) throw new Refuse("future_timestamp", field);
  return ms;
}

function requiredTimeMs(field: string, value: string | null | undefined, ctx: IngestContext): number {
  const ms = timeMs(field, value, ctx, "past");
  if (ms === null) throw new Refuse("missing_field", field);
  return ms;
}

function requiredBool(field: string, value: boolean | null | undefined): boolean {
  if (value === undefined || value === null) throw new Refuse("missing_field", field);
  return value;
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

interface ReadQuote {
  readonly view: QuoteView;
  readonly selected: Qty | null;
}

function quote(prefix: string, value: z.infer<typeof mispricedRowSchema>["venue_quote"], ctx: IngestContext): ReadQuote | null {
  if (value === undefined || value === null) return null;
  const field = `${prefix}venue_quote`;
  const method: QuoteMethod | null = optionalOneOf(`${field}.quote_method`, value.quote_method, QUOTE_METHODS);
  const selected = optionalProbQty(`${field}.selected_probability`, value.selected_probability, "unit");
  return {
    view: {
      method,
      probability: selected?.dec ?? null,
      yesBid: optionalProb(`${field}.yes_bid`, value.yes_bid, "unit"),
      yesAsk: optionalProb(`${field}.yes_ask`, value.yes_ask, "unit"),
      observedAtMs: timeMs(`${field}.observed_at`, value.observed_at, ctx, "past"),
      venueTimestampMs: timeMs(`${field}.venue_timestamp`, value.venue_timestamp, ctx, "past"),
      // The vocabulary of `freshness` was not captured. Only the exact word "fresh" counts as fresh; any other
      // value (including one never seen) is "not fresh", and the caller's own age check applies on top.
      reportedFresh: value.freshness === undefined || value.freshness === null ? null : value.freshness === "fresh",
    },
    selected: selected?.qty ?? null,
  };
}

function forecastStatus(value: { readonly state: string } | null | undefined): ForecastStatusState | null {
  return value === undefined || value === null ? null : oneOf("forecast_status.state", value.state, FORECAST_STATUS_STATES);
}

function forecastView(f: z.infer<typeof mispricedRowSchema>["forecast"], ctx: IngestContext): { readonly view: ForecastView; readonly qYes: { readonly dec: Dec; readonly qty: Qty } } {
  const created = requiredTimeMs("forecast.created_at", f.created_at, ctx);
  const qYes = prob("forecast.probability", f.probability, "unit");
  const delta = f.delta_from_prior === undefined || f.delta_from_prior === null ? null : signedDelta(f.delta_from_prior);
  return {
    view: { id: f.id === undefined || f.id === null ? null : idString("forecast.id", f.id, /^[A-Za-z0-9_.#:-]{1,100}$/), createdAtMs: created, deltaFromPrior: delta, thesis: text("description", f.thesis) },
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

function sportsOrientation(yesSide: Untrusted<string> | null): Orientation {
  return yesSide === null ? { proven: false, reason: "sports_yes_side_missing" } : { proven: false, reason: "sports_yes_side_needs_link" };
}

function yesSideOf(value: string | null | undefined): Untrusted<string> | null {
  return value === undefined || value === null || value.length === 0 ? null : untrustedField("outcome", value, "quotient");
}

// ---- mispriced -------------------------------------------------------------------------------------------------------------

function mispricedRow(raw: unknown, ctx: IngestContext): QuotientRow {
  const row = parseStructure(mispricedRowSchema, raw);
  const venue = oneOf("venue", row.venue, QUOTIENT_VENUES);
  const { key, nativeMarketId } = identity("", venue, row.marketKey, row.nativeMarketId);
  const coverage = oneOf("q_coverage", row.q_coverage, Q_COVERAGE_STATES);
  const direction: SpreadDirection = oneOf("spread_direction", row.spread_direction, SPREAD_DIRECTIONS);
  const { view, qYes } = forecastView(row.forecast, ctx);
  const quotientOdds = prob("quotient_odds", row.quotient_odds, "unit");
  const marketOdds = prob("market_odds", row.market_odds, "unit");
  const spread = prob("spread", row.spread, "unit");
  const read = quote("", row.venue_quote, ctx);
  const status = forecastStatus(row.forecast_status);
  const qual = quality(row.forecast.quality);

  // The same number arrives in several fields: they must be the same number, or a unit or orientation error hides
  // in one of them.
  if (!same(qYes.qty, quotientOdds.qty)) throw new Refuse("inconsistent", "quotient_odds");
  if (read?.selected != null && !same(read.selected, marketOdds.qty)) throw new Refuse("inconsistent", "market_odds");
  // The spread is Quotient's own rounding of |q - market|; the direction is the sign of q - market.
  const gap = absDiff(quotientOdds.qty, marketOdds.qty);
  if (!within(spread.qty, gap, CONSISTENCY_TOLERANCE)) throw new Refuse("inconsistent", "spread");
  const order = cmpQty(quotientOdds.qty, marketOdds.qty);
  if (order !== 0 && (direction === "q_higher") !== (order > 0)) throw new Refuse("inconsistent", "spread_direction");

  const isSports = row.sports !== undefined && row.sports !== null;
  const yesSide = yesSideOf(row.sports?.yes_side);
  const sports: SportsView | null = isSports ? { yesSide, listings: [], listingsRejected: 0, listingRefusals: [] } : null;

  return {
    rowId: `mispriced:${key}`,
    kind: "mispriced",
    key,
    venue,
    nativeMarketId,
    conditionId: conditionId("condition_id", row.condition_id),
    question: text("title", row.question),
    coverage,
    coverageAssumed: false,
    qYesRaw: qYes.dec,
    forecast: view,
    quote: read?.view ?? null,
    marketOdds: marketOdds.dec,
    spread: spread.dec,
    spreadDirection: direction,
    inDispute: bool(row.inDispute),
    forecastStatus: status,
    quality: qual,
    signal: null,
    sports,
    endsAtMs: timeMs("end_date", row.end_date, ctx, "deadline"),
    orientation: isSports ? sportsOrientation(yesSide) : orientationOfStandard(venue, qYes.qty, null),
    prov: provFor(ctx, venue, read?.view ?? null),
  };
}

// ---- signals ---------------------------------------------------------------------------------------------------------------

type AnySignal = z.infer<typeof standardSignalSchema> | z.infer<typeof sportsSignalSchema>;

interface SignalInputs {
  readonly side: Side;
  readonly qSide: Side | null;
  readonly livePriced: boolean | null;
  readonly entryQ: Dec | null;
  readonly entryPm: Dec | null;
  // A standard signal must state its own eligibility and whether it is active; a sports signal states eligibility
  // per listing.
  readonly standard: boolean;
}

function signalView(row: AnySignal, inputs: SignalInputs): SignalView {
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
    id: idString("id", row.id, SIGNAL_ID),
    side: inputs.side,
    qSide: inputs.qSide,
    isActive: inputs.standard ? requiredBool("is_active", row.is_active) : bool(row.is_active),
    inPlay: bool(row.in_play),
    entryEligible: inputs.standard ? requiredBool("entry_eligible", row.entry_eligible) : bool(row.entry_eligible),
    entryStatus: inputs.standard ? requiredOneOf<EntryStatus>("entry_status", row.entry_status, ENTRY_STATUSES) : optionalOneOf<EntryStatus>("entry_status", row.entry_status, ENTRY_STATUSES),
    retiredReason: optionalOneOf<RetiredReason>("retired_reason", row.retired_reason, RETIRED_REASONS),
    entryQ: inputs.entryQ,
    entryPm: inputs.entryPm,
    convictionTier,
    livePriced: inputs.livePriced,
    drawdownRiskElevated: bool(row.drawdown_risk_elevated),
    capacityUsdAt2c: capacity,
    capacityBasis: optionalOneOf("capacity_basis", row.capacity_basis, ["depth-2c", "volume-fallback"] as const),
  };
}

function signalForecast(row: AnySignal, ctx: IngestContext): ForecastView {
  const updated = requiredTimeMs("forecast_updated_at", row.forecast_updated_at, ctx);
  return { id: null, createdAtMs: updated, deltaFromPrior: null, thesis: text("description", row.thesis) };
}

function signalQuality(row: AnySignal): QualityView | null {
  return quality(row.quality as z.infer<typeof mispricedRowSchema>["forecast"]["quality"]);
}

function standardSignal(raw: unknown, ctx: IngestContext): QuotientRow {
  const row = parseStructure(standardSignalSchema, raw);
  const side = oneOf<Side>("side", row.side, SIDES);
  const qSide = optionalOneOf<Side>("q_side", row.q_side, SIDES);
  const venue = oneOf("market.venue", row.market.venue, QUOTIENT_VENUES);
  const { key, nativeMarketId } = identity("market.", venue, row.market.marketKey, row.market.nativeMarketId);
  const coverage = oneOf("market.q_coverage", row.market.q_coverage, Q_COVERAGE_STATES);
  const qYes = prob("latest_q", row.latest_q, "unit");
  const entryQ = optionalProb("entry_q", row.entry_q, "percent");
  const entryPm = optionalProb("entry_pm", row.entry_pm, "percent");
  const read = quote("", row.venue_quote, ctx);

  // The market price is stated beside latest_q, inside `market`, or only as the venue quote's selected probability.
  // Every place that states it must state the same number, and at least one must.
  const top = optionalProbQty("market_odds", row.market_odds, "unit");
  const inMarket = optionalProbQty("market.market_odds", row.market.market_odds, "unit");
  if (top !== null && inMarket !== null && !same(top.qty, inMarket.qty)) throw new Refuse("inconsistent", "market.market_odds");
  const stated = top ?? inMarket;
  if (stated !== null && read?.selected != null && !same(stated.qty, read.selected)) throw new Refuse("inconsistent", "market_odds");
  if (stated === null && read?.selected == null) throw new Refuse("missing_field", "market_odds");

  const forecast = signalForecast(row, ctx);
  const status = forecastStatus(row.forecast_status);
  const signal = signalView(row, { side, qSide, livePriced: bool(row.live_priced), entryQ, entryPm, standard: true });
  const qual = signalQuality(row);

  return {
    rowId: `signal:${key}:${signal.id}`,
    kind: "signal",
    key,
    venue,
    nativeMarketId,
    conditionId: conditionId("market.condition_id", row.market.condition_id),
    question: text("title", row.market.question),
    coverage,
    coverageAssumed: false,
    qYesRaw: qYes.dec,
    forecast,
    quote: read?.view ?? null,
    marketOdds: stated?.dec ?? null,
    spread: null,
    spreadDirection: null,
    inDispute: bool(row.market.inDispute),
    forecastStatus: status,
    quality: qual,
    signal,
    sports: null,
    endsAtMs: timeMs("market.end_date", row.market.end_date, ctx, "deadline"),
    orientation: orientationOfStandard(venue, qYes.qty, qSide ?? null),
    prov: provFor(ctx, venue, read?.view ?? null),
  };
}

function sportsListing(item: unknown, rowQuestion: string | null | undefined, ctx: IngestContext): SportsListing {
  const listing = parseStructure(sportsListingSchema, item, "markets");
  const venue = oneOf("markets.venue", listing.venue, QUOTIENT_VENUES);
  const { key, nativeMarketId } = identity("markets.", venue, listing.marketKey, listing.nativeMarketId);
  const coverage = optionalOneOf<QCoverage>("markets.q_coverage", listing.q_coverage, Q_COVERAGE_STATES);
  const read = quote("markets.", listing.venue_quote, ctx);
  return {
    venue,
    marketKey: key,
    nativeMarketId,
    conditionId: conditionId("markets.condition_id", listing.condition_id),
    question: text("title", listing.question ?? rowQuestion),
    // Every covered sports market is "experimental" (research 12 section 2); a listing without the label is too.
    coverage: coverage ?? "experimental",
    coverageAssumed: coverage === null,
    signalSide: optionalOneOf<Side>("markets.signal_side", listing.signal_side, SIDES),
    price: optionalProb("markets.price", listing.price, "unit"),
    quote: read?.view ?? null,
    signalAvailable: bool(listing.signal_available),
    entryEligible: requiredBool("markets.entry_eligible", listing.entry_eligible),
    entryStatus: requiredOneOf<EntryStatus>("markets.entry_status", listing.entry_status, ENTRY_STATUSES),
  };
}

function sportsSignal(raw: unknown, ctx: IngestContext, index: number): QuotientRow {
  const row = parseStructure(sportsSignalSchema, raw);
  const qYes = prob("pick.probability", row.pick.probability, "unit");
  const yesSide = yesSideOf(row.sports.yes_side);
  const forecast = signalForecast(row, ctx);
  const status = forecastStatus(row.forecast_status);
  const qual = signalQuality(row);
  const listings: SportsListing[] = [];
  const listingRefusals: RowRefusal[] = [];
  for (const item of row.markets.slice(0, MAX_SPORTS_LISTINGS)) {
    try {
      listings.push(sportsListing(item, row.question, ctx));
    } catch (error) {
      if (!(error instanceof Refuse)) throw error;
      listingRefusals.push({ code: error.code, field: error.field, index });
    }
  }
  // A sports signal's own side is per listing; the row has no single side, so the signal view carries YES as the
  // reference side only to satisfy the type and sets nothing else from it.
  const signal = signalView(row, { side: "YES", qSide: null, livePriced: null, entryQ: null, entryPm: null, standard: false });
  const sports: SportsView = { yesSide, listings, listingsRejected: listingRefusals.length, listingRefusals };
  return {
    rowId: `sports_signal:${signal.id}`,
    kind: "sports_signal",
    key: null,
    venue: null,
    nativeMarketId: null,
    conditionId: null,
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
    endsAtMs: timeMs("resolves_at", row.resolves_at, ctx, "deadline"),
    orientation: sportsOrientation(yesSide),
    prov: provFor(ctx, null, null),
  };
}

function signalRow(raw: unknown, ctx: IngestContext, index: number): QuotientRow {
  const kind = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>)["kind"] : undefined;
  if (kind === undefined || kind === null) return standardSignal(raw, ctx);
  if (kind === "sports_game") return sportsSignal(raw, ctx, index);
  throw new Refuse("unknown_enum", "kind");
}

// ---- lookup ---------------------------------------------------------------------------------------------------------------

function lookupRow(raw: unknown, ctx: IngestContext): QuotientRow {
  const row = parseStructure(lookupRowSchema, raw);
  const venue = oneOf("venue", row.venue, QUOTIENT_VENUES);
  const { key, nativeMarketId } = identity("", venue, row.marketKey, undefined);
  const coverage = row.q_coverage === undefined || row.q_coverage === null ? null : oneOf("q_coverage", row.q_coverage, Q_COVERAGE_STATES);
  const { view, qYes } = forecastView(row.forecast, ctx);
  const qual = quality(row.forecast.quality);
  const isSports = row.sports !== undefined && row.sports !== null;
  const yesSide = yesSideOf(row.sports?.yes_side);
  return {
    rowId: `lookup:${key}`,
    kind: "lookup",
    key,
    venue,
    nativeMarketId,
    conditionId: null,
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
    sports: isSports ? { yesSide, listings: [], listingsRejected: 0, listingRefusals: [] } : null,
    endsAtMs: null,
    orientation: isSports ? sportsOrientation(yesSide) : orientationOfStandard(venue, qYes.qty, null),
    prov: provFor(ctx, venue, null),
  };
}

// ---- envelopes -------------------------------------------------------------------------------------------------------------

export type IngestOutcome = { readonly ok: true; readonly set: RowSet } | { readonly ok: false; readonly reason: "bad_envelope" | "every_row_refused"; readonly rejected: readonly RowRefusal[] };

export function ingest(body: unknown, ctx: IngestContext): IngestOutcome {
  let rawRows: readonly unknown[];
  let count: number | null = null;
  let build: (raw: unknown, index: number) => QuotientRow;
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
    build = (raw, index) => signalRow(raw, ctx, index);
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
  rawRows.slice(0, MAX_ROWS).forEach((raw, index) => {
    try {
      const row = build(raw, index);
      // A repeated row (same id) is dropped, not shown twice.
      if (seen.has(row.rowId)) {
        rejected.push({ code: "inconsistent", field: "rowId", index });
        return;
      }
      seen.add(row.rowId);
      rows.push(row);
    } catch (error) {
      if (!(error instanceof Refuse)) throw error;
      rejected.push({ code: error.code, field: error.field, index });
    }
  });
  if (rows.length === 0 && rejected.length > 0) return { ok: false, reason: "every_row_refused", rejected };
  return { ok: true, set: { route: ctx.route, rows, rejected, truncated, count } };
}

export type { RowKind };
