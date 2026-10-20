import type { Dec, Prov, Untrusted } from "../../core/ports";
import type { EntryStatus, ForecastStatusState, QCoverage, QualityStatus, QualityTier, AssessmentSource, QuoteMethod, QuotientVenue, RetiredReason, Side, SpreadDirection } from "./constants";

// What the client hands to the Signals screen. Every probability is an exact decimal on the 0 to 1 scale, a value
// Quotient did not give is null (never 0), and every string a stranger can influence is an Untrusted<string>.
//
// A row's probability is NOT a displayable number by itself. `qYesRaw` is Q's probability for Quotient's YES side
// of the row; whether that is the venue's YES token is the row's `orientation`, and the only way to a number for
// the screen is qNumber() in orientation.ts, which returns nothing while the orientation is unproven (M3-6).

export type RowKind = "mispriced" | "signal" | "sports_signal" | "lookup";

export const REFUSAL_CODES = ["missing_field", "wrong_type", "unknown_enum", "unit_not_a_number", "unit_out_of_range", "inconsistent"] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

// Why one row was not accepted. `field` is a name this client wrote, never upstream text.
export interface RowRefusal {
  readonly code: RefusalCode;
  readonly field: string;
}

export type OrientationReason =
  | "sports_yes_side_needs_link"
  | "sports_yes_side_missing"
  | "hl_outcomes_needs_link"
  | "q_side_disagrees_with_probability"
  | "link_does_not_match";

export type Orientation =
  | { readonly proven: true; readonly basis: "venue_yes" }
  | { readonly proven: true; readonly basis: "via_link"; readonly yesOutcomeIndex: number; readonly tokenId: string; readonly linkId: string }
  | { readonly proven: false; readonly reason: OrientationReason };

export interface QuoteView {
  readonly method: QuoteMethod | null;
  // The selected probability (a midpoint, a bid, an ask or a last trade), NOT an executable price.
  readonly probability: Dec | null;
  readonly yesBid: Dec | null;
  readonly yesAsk: Dec | null;
  readonly observedAtMs: number | null;
  readonly venueTimestampMs: number | null;
  // The row's own claim of freshness; the client re-derives its own from observedAtMs.
  readonly reportedFresh: boolean | null;
}

export interface QualityView {
  readonly status: QualityStatus | null;
  readonly tier: QualityTier | null;
  readonly assessmentSource: AssessmentSource | null;
  // Free text from Quotient: an untrusted slot.
  readonly basis: Untrusted<string> | null;
  readonly liveSample: number | null;
  readonly historicalSample: number | null;
}

export interface ForecastView {
  readonly id: string | null;
  readonly createdAtMs: number;
  readonly deltaFromPrior: Dec | null;
  readonly thesis: Untrusted<string> | null;
}

export interface SignalView {
  readonly side: Side;
  readonly qSide: Side | null;
  readonly isActive: boolean | null;
  readonly inPlay: boolean | null;
  readonly entryEligible: boolean | null;
  readonly entryStatus: EntryStatus | null;
  readonly retiredReason: RetiredReason | null;
  // entry_q arrives on a 0 to 100 scale and is normalised here.
  readonly entryQ: Dec | null;
  readonly convictionTier: 1 | 2 | 3 | null;
  readonly livePriced: boolean | null;
  // null = unknown, NOT safe.
  readonly drawdownRiskElevated: boolean | null;
  readonly capacityUsdAt2c: Dec | null;
  readonly capacityBasis: "depth-2c" | "volume-fallback" | null;
}

// One listing of a sports game on a venue. Choose the one on the user's venue by its venue and marketKey; there
// is no "primary" and never markets[0].
export interface SportsListing {
  readonly venue: QuotientVenue;
  readonly marketKey: string | null;
  readonly signalSide: Side | null;
  readonly price: Dec | null;
  readonly signalAvailable: boolean | null;
  readonly entryEligible: boolean | null;
  readonly entryStatus: EntryStatus | null;
}

export interface SportsView {
  // The team or player every probability on the row is for. Exact upstream text, used only for equality with a
  // human-approved link and for display in an untrusted slot.
  readonly yesSide: Untrusted<string> | null;
  readonly listings: readonly SportsListing[];
  readonly listingsRejected: number;
}

// Prov of the port, except that `venue` is the venue the row is ABOUT and is null for a sports signal, which lists
// several venues and has no single one (the publisher is always Quotient, in `source`).
export interface QuotientProv extends Omit<Prov, "venue" | "license" | "transport"> {
  readonly venue: Prov["venue"] | null;
  readonly license: "own_use_only";
  readonly transport: "T0" | "T2" | "T3";
}

export interface QuotientRow {
  readonly rowId: string;
  readonly kind: RowKind;
  // marketKey, or null for a sports signal that carries no top-level market.
  readonly key: string | null;
  readonly venue: QuotientVenue | null;
  readonly nativeMarketId: string | null;
  readonly question: Untrusted<string> | null;
  readonly coverage: QCoverage | null;
  // sports rows carry no coverage; they are covered by the rule "all covered sports are experimental".
  readonly coverageAssumed: boolean;
  readonly qYesRaw: Dec;
  readonly forecast: ForecastView;
  readonly quote: QuoteView | null;
  readonly marketOdds: Dec | null;
  readonly spread: Dec | null;
  readonly spreadDirection: SpreadDirection | null;
  readonly inDispute: boolean | null;
  readonly forecastStatus: ForecastStatusState | null;
  readonly quality: QualityView | null;
  readonly signal: SignalView | null;
  readonly sports: SportsView | null;
  readonly orientation: Orientation;
  readonly prov: QuotientProv;
}

export interface RowSet {
  readonly route: "mispriced" | "signals" | "lookup";
  readonly rows: readonly QuotientRow[];
  readonly rejected: readonly RowRefusal[];
  // More rows than MAX_ROWS were sent; the extra ones were not read.
  readonly truncated: boolean;
  readonly count: number | null;
}

export interface PerformanceSnapshot {
  readonly generatedAtMs: number | null;
  // A bounded, sanitised JSON excerpt for a labelled untrusted slot. The live field names were never captured,
  // so nothing is extracted from it.
  readonly excerpt: Untrusted<string>;
  readonly excerptTruncated: boolean;
  readonly shape: "unverified";
}
