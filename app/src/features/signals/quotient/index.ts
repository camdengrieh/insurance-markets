// The Quotient client (M3-1 to M3-3, M3-6; docs/dapp-design.md 4.7 and 7.2). Import from here.
//
// Quotient is a forecast and signal publisher, not a venue: there is no VenueReadAdapter here and no order book.
// It is OFF unless a gate says otherwise, is used per user (their own key or their own agent's payment), keeps
// everything in memory, and never pays on its own. This folder is the host side (the paid-call flow, the user's
// pasted key, the licence clause, the spend meter); the body is validated by the shared validator in
// sdk/signals/quotient, re-exported here so the screens have one import path.

export {
  ADAPTER_VERSION,
  AMOUNT_CEILING_FACTOR,
  MAX_CALL_USD,
  MAX_DAY_USD,
  PINNED_API_VERSION,
  PINNED_PAYMENT,
  QUOTIENT_ATTRIBUTION,
  QUOTIENT_HOST,
  QUOTIENT_ORIGIN,
  QUOTIENT_READ_SERVICE,
  QUOTIENT_SHAPE_STATUS,
} from "./constants";

export {
  ASSESSMENT_SOURCES,
  ENTRY_STATUSES,
  FORECAST_STATUS_STATES,
  LIVE_QUOTE_VENUES,
  MARKET_KEY,
  QUALITY_STATUSES,
  QUALITY_TIERS,
  QUOTE_METHODS,
  QUOTIENT_VENUES,
  Q_COVERAGE_STATES,
  RETIRED_REASONS,
  ingest,
  probability,
} from "@sdk/signals/quotient";
export type {
  EntryStatus,
  ForecastStatusState,
  ForecastView,
  IngestContext,
  IngestOutcome,
  Orientation,
  OrientationReason,
  PerformanceSnapshot,
  QCoverage,
  QualityView,
  QuoteMethod,
  QuoteView,
  QuotientProv,
  QuotientRow,
  QuotientVenue,
  RefusalCode,
  RetiredReason,
  RowRefusal,
  RowSet,
  SignalView,
  SportsListing,
  SportsView,
} from "@sdk/signals/quotient";

export {
  FAILED_CLOSED_REASONS,
  REFUSAL_REASONS,
  REFUSAL_TEXT,
  UNAVAILABLE_REASONS,
  UNAVAILABLE_TEXT,
  QuotientConfigError,
  approvalFor,
  createQuotientClient,
  parseImportText,
  parsePerformance,
} from "./client";
export type {
  CallOptions,
  FailedClosedReason,
  KeyAccess,
  Okay,
  Origin,
  PaidCallApproval,
  QuotientClient,
  QuotientClientOptions,
  QuotientClientStatus,
  QuotientGate,
  QuotientResult,
  RefusalReason,
  RowsResult,
  UnavailableReason,
} from "./client";

export {
  DISCLOSURE_KEYS,
  LICENCE_CLAUSE_BODY,
  LICENCE_CLAUSE_QUOTES,
  LICENCE_CLAUSE_SOURCE,
  LICENCE_CLAUSE_TITLE,
  SPREAD_LABELS,
  TRACK_RECORD_CAVEATS,
  WHY_NOT_ARBITRAGE,
  capSpreadLabel,
  disclosuresFor,
  labelFor,
} from "./disclosures";
export type { Disclosures, SpreadLabel } from "./disclosures";

export { GATE_NAMES, allPass, gatesOf, listingOn, qNumber, withOrientationLink } from "./orientation";
export type { Gate, GateContext, GateName, OrientationLink, QNumber } from "./orientation";

export { amountCeiling, decodeChallengeHeader, judgeChallenge } from "./payment";
export type { ChallengeVerdict, HardStop, Mismatch, MismatchField, PaymentRequired } from "./payment";

export { FORBIDDEN_PATH_PATTERNS, MISPRICED_SORTS, MISPRICED_VENUES, ROUTES, ROUTE_IDS, RouteParamError, SIGNAL_STATUSES, UPSTREAM_PATH_PATTERNS, buildRequest, encodeMarketKey, isRouteId } from "./routes";
export type { BuiltRequest, LookupParams, MispricedParams, RouteId, RouteSpec, SignalsParams } from "./routes";

export { HARD_MAX_DAILY_BUDGET_USD, SpendMeter } from "./spend";
export type { SpendSnapshot } from "./spend";
