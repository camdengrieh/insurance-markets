// Quotient body validation (docs/sdk-and-api-design.md section 3: "signals: Quotient body validation only, no
// fetching"). A caller hands over a body it already holds (the dApp's client after its own guarded fetch, an import
// pasted by the user, or a body the user's own agent paid for) and gets typed rows and per-row refusals back. The
// request, the payment check, the licence clause and the spend meter belong to the caller.

export {
  ASSESSMENT_SOURCES,
  CLOCK_SKEW_MS,
  CONDITION_ID,
  CONSISTENCY_TOLERANCE,
  ENTRY_STATUSES,
  FORECAST_STATUS_STATES,
  LIVE_QUOTE_VENUES,
  MARKET_KEY,
  MAX_ROWS,
  MAX_SPORTS_LISTINGS,
  NATIVE_ID,
  QUALITY_STATUSES,
  QUALITY_TIERS,
  QUOTE_METHODS,
  QUOTIENT_VENUES,
  Q_COVERAGE_STATES,
  RETIRED_REASONS,
  SIDES,
  SIGNAL_ID,
  SPREAD_DIRECTIONS,
} from "./constants.js";
export type {
  AssessmentSource,
  EntryStatus,
  ForecastStatusState,
  QCoverage,
  QualityStatus,
  QualityTier,
  QuoteMethod,
  QuotientVenue,
  RetiredReason,
  Side,
  SpreadDirection,
} from "./constants.js";

export { ingest } from "./normalize.js";
export type { IngestContext, IngestOutcome } from "./normalize.js";

export { REFUSAL_CODES } from "./model.js";
export type {
  ForecastView,
  Orientation,
  OrientationReason,
  PerformanceSnapshot,
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

export { absDiff, nonNegativeDec, probability, within } from "./units.js";
export type { UnitResult, UnitScale } from "./units.js";
