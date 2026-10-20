// Fixed words for every code the Signals screen shows. Everything here is app text: a reason token from the Quotient
// client is a name this project wrote (never upstream text), and the words for it are written here. A token that is
// not in a table prints as "a reason this screen has no words for" and never as the raw string.

import type { QCoverage, QuotientVenue, OrientationReason, RefusalCode, SpreadLabel } from "../../venues/quotient";
import { ENTRY_STATUSES } from "../../venues/quotient";
import type { VenueId } from "../../core/ports";
import type { LinkLabelReason, LinkReason } from "./links/verify";

export const QUOTIENT_VENUE_NAMES: Readonly<Record<QuotientVenue, string>> = Object.freeze({
  polymarket: "Polymarket",
  polymarket_us: "Polymarket US",
  kalshi: "Kalshi",
  hl_outcomes: "Hyperliquid outcomes",
});

export function quotientVenueName(venue: QuotientVenue | null): string {
  return venue !== null && Object.hasOwn(QUOTIENT_VENUE_NAMES, venue) ? QUOTIENT_VENUE_NAMES[venue] : "several venues";
}

// The venue id the explorer's readers know, for a Quotient venue (null: no reader).
export const VENUE_OF_QUOTIENT: Readonly<Record<QuotientVenue, VenueId | null>> = Object.freeze({
  polymarket: "polymarket",
  polymarket_us: "polymarket_us",
  kalshi: "kalshi",
  hl_outcomes: "hyperliquid",
});

export const COVERAGE_BADGE: Readonly<Record<QCoverage, string>> = Object.freeze({
  forecasting: "forecasting",
  experimental: "experimental: no established edge",
  under_review: "under review",
  research_only: "research only",
});

export const ORIENTATION_TEXT: Readonly<Record<OrientationReason, string>> = Object.freeze({
  sports_yes_side_needs_link: "A sports forecast is about one named side, and nothing here proves which outcome on the venue that side is. A reviewed link would.",
  sports_yes_side_missing: "Quotient did not name the side this sports forecast is about, so it cannot be matched to an outcome.",
  hl_outcomes_needs_link: "Hyperliquid outcomes need a reviewed link to say which outcome the forecast is about.",
  q_side_disagrees_with_probability: "The row's own side and its probability disagree, so which outcome the number is about is unproven.",
  link_does_not_match: "A link was offered but it does not name this exact market and side, so it was not used.",
});

export function orientationText(reason: string): string {
  return Object.hasOwn(ORIENTATION_TEXT, reason) ? ORIENTATION_TEXT[reason as OrientationReason] : "The outcome this number is about is unproven.";
}

const GATE_TEXT: Readonly<Record<string, string>> = Object.freeze({
  // orientation (same tokens as OrientationReason)
  ...ORIENTATION_TEXT,
  coverage_unknown: "Quotient did not state a coverage class.",
  coverage_experimental: "Experimental coverage (every sports market): live, but no edge is established. Shown only if you opt in.",
  coverage_under_review: "Quotient has paused forecasting for this class.",
  coverage_research_only: "Quotient does not stand behind a forecast for this class.",
  forecast_time_in_the_future: "The forecast is dated in the future, so its age cannot be trusted.",
  forecast_too_old: "The forecast is older than the age window.",
  venue_has_no_live_quotes: "Quotient does not verify live quotes on this venue, so there is no quote to compare with.",
  no_quote: "No venue quote came with the row.",
  quote_method_unknown: "The quote's method is not stated.",
  graph_snapshot_quote: "The quote is a graph snapshot, not a live quote.",
  not_live_priced: "The row says it was not priced from a live quote.",
  quote_reported_not_fresh: "The row itself says its quote is not fresh.",
  quote_time_unknown: "The quote's time is not stated.",
  quote_time_in_the_future: "The quote is dated in the future.",
  quote_too_old: "The quote is older than ten minutes.",
  in_dispute: "The market is in dispute.",
  dispute_state_unknown: "Whether the market is in dispute is not stated.",
  forecast_status_unknown: "The forecast's status is not stated.",
  forecast_status_warning: "Quotient flags this forecast with a warning.",
  forecast_status_caution: "Quotient flags this forecast with a caution.",
  entry_status_unknown: "The entry status is not stated.",
  drawdown_risk_elevated: "Drawdown risk is elevated.",
  drawdown_risk_unknown: "Drawdown risk is not stated. Unknown is not the same as safe.",
  capacity_unknown: "The depth available near the price is not stated.",
  capacity_below_size: "The depth available is below the size you gave.",
});

export function gateReasonText(reason: string | null): string {
  if (reason === null) return "";
  if (Object.hasOwn(GATE_TEXT, reason)) return GATE_TEXT[reason] ?? "";
  if (reason.startsWith("entry_")) {
    const status = reason.slice("entry_".length);
    if ((ENTRY_STATUSES as readonly string[]).includes(status)) return `Quotient's entry status is "${status.replaceAll("_", " ")}", not eligible.`;
  }
  return "A reason this screen has no words for. The check failed.";
}

export const GATE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  orientation: "Which outcome the number is about",
  coverage: "Coverage class",
  forecast_age: "Forecast age",
  quote_live: "Live venue quote",
  not_in_dispute: "Not in dispute",
  forecast_status: "Forecast status",
  entry_eligible: "Entry eligible",
  drawdown_risk: "Drawdown risk",
  capacity: "Depth near the price",
});

export function gateLabel(name: string): string {
  return Object.hasOwn(GATE_LABELS, name) ? (GATE_LABELS[name] ?? name) : "a check";
}

export const REFUSAL_CODE_TEXT: Readonly<Record<RefusalCode, string>> = Object.freeze({
  missing_field: "a field is missing",
  wrong_type: "a field has the wrong type",
  unknown_enum: "a value is not one this client knows",
  unit_not_a_number: "a number is not a number",
  unit_out_of_range: "a number is out of range",
  inconsistent: "two numbers in the row disagree",
});

export function refusalCodeText(code: string): string {
  return Object.hasOwn(REFUSAL_CODE_TEXT, code) ? REFUSAL_CODE_TEXT[code as RefusalCode] : "the row was refused";
}

export const SPREAD_LABEL_TEXT: Readonly<Record<SpreadLabel, string>> = Object.freeze({
  indicative: "indicative: a model view against one quote, not an executable edge",
  model_edge: "model edge: every check passed, still only a model's view against one quote",
  structural_violation: "structural violation",
  hedged_discrepancy: "hedged discrepancy",
});

export function spreadLabelText(label: unknown): string {
  return Object.hasOwn(SPREAD_LABEL_TEXT, String(label)) ? SPREAD_LABEL_TEXT[label as SpreadLabel] : SPREAD_LABEL_TEXT.indicative;
}

// ---- link overlay -----------------------------------------------------------------------------------------------------

export const PROOF_TEXT: Readonly<Record<string, string>> = Object.freeze({
  P0_native: "Native hook (provenance, not verification)",
  P2_template: "Template-approved",
  P4_human: "Human-reviewed",
});

export const LINK_STATE_TEXT: Readonly<Record<string, string>> = Object.freeze({
  template_approved: "template approved",
  human_approved: "human approved",
  executable_eligible: "executable eligible",
});

export const LINK_REASON_TEXT: Readonly<Record<LinkReason, string>> = Object.freeze({
  link_expired: "The link is past its valid-until date.",
  rules_hash_changed: "The rules text of a leg changed since the link was reviewed. The link is suspended.",
  rules_hash_unavailable: "A leg's rules could not be hashed the way the link pins them, so they were not compared.",
  close_time_changed: "A leg's close time changed since the link was reviewed. The link is suspended.",
  close_time_unknown: "A leg's close time could not be read.",
  leg_not_active: "A leg is no longer open for trading (closed, paused, determined, disputed, resolved or voided). The link is suspended.",
  leg_status_unknown: "A leg's status could not be read, so the link could not be called verified.",
  leg_unreadable: "A leg could not be read, so the link could not be checked.",
});

export const LINK_LABEL_REASON_TEXT: Readonly<Record<LinkLabelReason, string>> = Object.freeze({
  link_not_verified: "the link is not verified right now",
  leg_book_unavailable: "a leg's order book is not available here, so no spread is computed",
  class_bound_unproven: "this class of link has not passed its settlement bound",
  bound_passed: "this class has passed its bound; the label is still capped",
});
