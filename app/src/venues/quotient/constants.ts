import type { Dec } from "../../core/ports";

// Pinned facts about the Quotient gateway (docs/research/12-quotient.md, read 2026-10-18/19; nothing here was
// observed by a call from this project: no paid call was ever made, and the free routes were read by research
// only). Every value is a CHECK the client enforces, never something it learns from a response.

export const QUOTIENT_ORIGIN = "https://quotient-api-gateway.onrender.com";
export const QUOTIENT_HOST = "quotient-api-gateway.onrender.com";
// The id of the read-proxy service in app/headers.config.ts. One service is one origin.
export const QUOTIENT_READ_SERVICE = "quotient";
// The OpenAPI version the shapes below were written against. Seven breaking majors in eight months: a response
// is still validated field by field, this only labels the evidence.
export const PINNED_API_VERSION = "20.5.0";
export const ADAPTER_VERSION = "quotient-client/0.1.0";
export const QUOTIENT_ATTRIBUTION = "Quotient (quotient.social)";

// ---- the payment tuple (research 12 section 4 and 10.6) ----------------------------------------------------------------
// An unpaid GET to a paid route answers 402 with an x402 v2 challenge. The client never pays; it only checks that
// the challenge names exactly this tuple, so the UI can say "payment required" truthfully and a lookalike payee
// is a hard stop. The challenge is "authoritative" for the price per Quotient's terms, so the amount is checked
// against a ceiling instead of equality.
export const PINNED_PAYMENT = Object.freeze({
  x402Version: 2,
  scheme: "exact",
  network: "eip155:8453",
  // USDC on Base.
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  // Quotient's receiver, constant across every route in the live challenges.
  payTo: "0xC3d01FD2F79d4c57aD106AB8ecc12a5dE24F97cB",
  maxTimeoutSeconds: 300,
  decimals: 6,
});

// The challenge amount may be at most this multiple of the table price (research 12 10.6 step 2) and never above
// MAX_CALL_USD. Both must hold.
export const AMOUNT_CEILING_FACTOR = 2;
// The data budget of research 12 10.6 / 26 8.3. It is outside any trading cap and applies to the spend meter.
export const MAX_CALL_USD: Dec = "0.05";
export const MAX_DAY_USD: Dec = "2";

// ---- the closed lists ---------------------------------------------------------------------------------------------------
// Anything outside a list fails closed with a reason (M3-2). Quotient adds values often, so a new one hides the
// row until a person extends the list here.

export const QUOTIENT_VENUES = ["polymarket", "polymarket_us", "kalshi", "hl_outcomes"] as const;
export type QuotientVenue = (typeof QUOTIENT_VENUES)[number];
// Only these two get verified live quotes (research 12 section 6).
export const LIVE_QUOTE_VENUES: readonly QuotientVenue[] = ["polymarket", "kalshi"];

export const Q_COVERAGE_STATES = ["forecasting", "experimental", "under_review", "research_only"] as const;
export type QCoverage = (typeof Q_COVERAGE_STATES)[number];

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
export const MARKET_KEY = /^(polymarket|polymarket_us|kalshi|hl_outcomes):[A-Za-z0-9_.#-]{1,100}$/;

// ---- limits ---------------------------------------------------------------------------------------------------------------

export const MAX_BODY_CHARS = 4_000_000;
export const MAX_ROWS = 500;
// A venue quote older than this is not "live" for any gate, whatever the row says about itself.
export const QUOTE_MAX_AGE_MS = 10 * 60 * 1000;
// The default forecast-age window of /markets/mispriced and /markets (48 h).
export const DEFAULT_MAX_FORECAST_AGE_H = 48;
// Tolerance when a derived number (spread, direction) is checked against the fields it came from: Quotient rounds.
export const CONSISTENCY_TOLERANCE = "0.01";
export const REQUEST_TIMEOUT_MS = 20_000;

// ---- what is NOT verified ---------------------------------------------------------------------------------------------------
// The UI shows this beside Quotient figures (a capability that is not recorded as proven shows "unproven"). It is
// a constant, not a measurement: a person edits it after running the opt-in live suite and reading the result.
export const QUOTIENT_SHAPE_STATUS = Object.freeze({
  status: "unverified" as "unverified" | "verified",
  verifiedAgainst: null as string | null,
  evidence:
    "Field names come from the OpenAPI 20.5.0 summary in docs/research/12-quotient.md. No paid response was ever captured; the 402 challenge shape was decoded by research from unpaid requests.",
  unverified: Object.freeze([
    "the envelope of GET /api/v1/signals (read as {signals: [...]})",
    "the envelope of GET /api/v1/markets/lookup (read as {markets: [...]})",
    "the field names inside the sports-signal listings (venue, marketKey, signal_side, price, ...)",
    "whether latest_q is the probability of YES (read so) or of the signal's own side",
    "the vocabulary of venue_quote.freshness (only the word 'fresh' is read as fresh)",
    "the fields of the free performance snapshot (kept as a sanitised excerpt, nothing extracted)",
    "that the gateway accepts x-quotient-api-key on a browser-origin call",
    "that the gateway's 402 body carries the full challenge when the PAYMENT-REQUIRED header is hidden by a proxy",
  ]),
});
