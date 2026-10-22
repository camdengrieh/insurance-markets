// The closed lists and limits a Quotient body is validated against (docs/research/12-quotient.md, read 2026-10-18/19,
// OpenAPI 20.5.0). Nothing here was observed by a call from this project: no paid response was ever captured. Every
// value is a CHECK the validator enforces, never something it learns from a response.
//
// Anything outside a list fails closed with a reason. Quotient adds values often, so a new one hides the row until
// a person extends the list here. The host, the payment tuple and the route table are the host's concern and live
// with the client that calls Quotient (app/src/features/signals/quotient); this module never fetches.

export const QUOTIENT_VENUES = ["polymarket", "polymarket_us", "kalshi", "hl_outcomes"] as const;
export type QuotientVenue = (typeof QUOTIENT_VENUES)[number];
// Only these two get verified live quotes (research 12 section 6).
export const LIVE_QUOTE_VENUES: readonly QuotientVenue[] = ["polymarket", "kalshi"];

export const Q_COVERAGE_STATES = ["forecasting", "experimental", "under_review", "research_only"] as const;
export type QCoverage = (typeof Q_COVERAGE_STATES)[number];

// Matched exactly. A spelling the list does not hold ("last", "fresh_last", "Midpoint") is an unknown enum.
export const QUOTE_METHODS = ["midpoint", "bid", "ask", "fresh last", "graph_snapshot"] as const;
export type QuoteMethod = (typeof QUOTE_METHODS)[number];

export const SPREAD_DIRECTIONS = ["q_higher", "q_lower"] as const;
export type SpreadDirection = (typeof SPREAD_DIRECTIONS)[number];

export const FORECAST_STATUS_STATES = ["warning", "caution", "converged", "converging", "sideways", "diverging"] as const;
export type ForecastStatusState = (typeof FORECAST_STATUS_STATES)[number];

export const ENTRY_STATUSES = [
  "eligible",
  "in_play",
  "retired",
  "legacy",
  "deadline_passed",
  "no_forecast",
  "no_quote",
  "no_entry_price",
  "price_extreme",
  "price_too_high",
  "gap_too_small",
  "gap_too_wide",
  "deadline_too_far",
  "moved_against",
  "flip_hold",
  "live_catalysts",
  "unmapped",
  "closed",
] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const RETIRED_REASONS = ["resolved", "flipped", "fading_q", "expired", "under_review"] as const;
export type RetiredReason = (typeof RETIRED_REASONS)[number];

export const QUALITY_STATUSES = ["rated", "insufficient", "unavailable", "stale", "unsupported"] as const;
export const QUALITY_TIERS = ["strong", "mixed", "caution"] as const;
export const ASSESSMENT_SOURCES = ["live", "historical"] as const;
export type QualityStatus = (typeof QUALITY_STATUSES)[number];
export type QualityTier = (typeof QUALITY_TIERS)[number];
export type AssessmentSource = (typeof ASSESSMENT_SOURCES)[number];

export const SIDES = ["YES", "NO"] as const;
export type Side = (typeof SIDES)[number];

// marketKey: `polymarket:<id>`, `kalshi:<TICKER>`, `polymarket_us:<id>`, `hl_outcomes:#<id>`. Never question text.
// The id starts with a letter, a digit or '#', and is at most 100 characters of [A-Za-z0-9_.#-].
export const MARKET_KEY = /^(polymarket|polymarket_us|kalshi|hl_outcomes):[A-Za-z0-9#][A-Za-z0-9_.#-]{0,99}$/;
// A native market id on its own: the same alphabet as the id part of a marketKey.
export const NATIVE_ID = /^[A-Za-z0-9#][A-Za-z0-9_.#-]{0,99}$/;
// A signal id.
export const SIGNAL_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
// A Polymarket condition id.
export const CONDITION_ID = /^0x[0-9a-fA-F]{64}$/;

// ---- limits ---------------------------------------------------------------------------------------------------------------

// Rows past this many are not read (the set says it was truncated).
export const MAX_ROWS = 500;
// Listings of one sports signal past this many are not read.
export const MAX_SPORTS_LISTINGS = 50;
// Tolerance when a derived number (the spread) is checked against the fields it came from: Quotient rounds.
export const CONSISTENCY_TOLERANCE = "0.01";
// A timestamp later than the moment the body was received plus this is refused: the row is not about the past.
export const CLOCK_SKEW_MS = 5 * 60_000;
