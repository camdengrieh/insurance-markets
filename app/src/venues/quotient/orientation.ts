import { cmpQty, parseQty } from "../../core/money";
import type { Dec } from "../../core/ports";
import { LIVE_QUOTE_VENUES, QUOTE_MAX_AGE_MS, DEFAULT_MAX_FORECAST_AGE_H, type QuotientVenue } from "./constants";
import type { Orientation, OrientationReason, QuotientRow, SportsListing } from "./model";

// Which outcome is Q's number about? (docs/research/26 8.4, dapp-design 4.7: "map Quotient's YES to the venue
// token BEFORE any edge; orientation unproven hides the number", M3-6.)
//
// Non-sports binary rows are about the venue's YES. A sports row's probabilities are about `sports.yes_side` (a
// team or player), and neither the title nor the outcome order says which outcome that is. That mapping is only
// ever made by a human-approved link, supplied here as an OrientationLink, and only when it names the SAME
// marketKey and the SAME yes_side text, byte for byte. There is no fuzzy match and no guess.

export interface OrientationLink {
  readonly linkId: string;
  readonly marketKey: string;
  // Exactly Quotient's `sports.yes_side` text, as sanitised by this client (compared with ===).
  readonly yesSide: string;
  // The index of the outcome on the target venue that the yes_side corresponds to, and its token.
  readonly yesOutcomeIndex: number;
  readonly tokenId: string;
}

// Returns a row with the link's orientation if (and only if) it matches; otherwise the row is returned with an
// explicit "link_does_not_match" so the screen says why the number stays hidden.
export function withOrientationLink(row: QuotientRow, link: OrientationLink): QuotientRow {
  // A sports signal has no top-level market: the link names one of its listings instead.
  const keyMatches = row.key !== null ? row.key === link.marketKey : (row.sports?.listings ?? []).some((listing) => listing.marketKey === link.marketKey);
  const matches =
    row.sports !== null &&
    row.sports.yesSide !== null &&
    keyMatches &&
    row.sports.yesSide.value === link.yesSide &&
    Number.isInteger(link.yesOutcomeIndex) &&
    link.yesOutcomeIndex >= 0 &&
    link.yesOutcomeIndex <= 1 &&
    link.tokenId.length > 0 &&
    link.linkId.length > 0;
  if (!matches) return { ...row, orientation: { proven: false, reason: "link_does_not_match" } };
  return { ...row, orientation: { proven: true, basis: "via_link", yesOutcomeIndex: link.yesOutcomeIndex, tokenId: link.tokenId, linkId: link.linkId } };
}

export type QNumber =
  | { readonly shown: true; readonly value: Dec; readonly about: { readonly outcome: "yes" } | { readonly outcome: "linked"; readonly index: number; readonly tokenId: string } }
  | { readonly shown: false; readonly reason: OrientationReason };

// The only route from a row to a probability a screen may print. While the orientation is unproven it returns no
// number at all (not 0, not 0.5, not a dimmed value).
export function qNumber(row: QuotientRow): QNumber {
  const o: Orientation = row.orientation;
  if (!o.proven) return { shown: false, reason: o.reason };
  if (o.basis === "venue_yes") return { shown: true, value: row.qYesRaw, about: { outcome: "yes" } };
  return { shown: true, value: row.qYesRaw, about: { outcome: "linked", index: o.yesOutcomeIndex, tokenId: o.tokenId } };
}

// The listing on the user's venue: exactly one, found by venue and marketKey. Zero or several (or a listing with
// no marketKey) answers null; it never falls back to the first one.
export function listingOn(row: QuotientRow, venue: QuotientVenue, key: string): SportsListing | null {
  const matches = (row.sports?.listings ?? []).filter((listing) => listing.venue === venue && listing.marketKey === key);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

// ---- gates ---------------------------------------------------------------------------------------------------------------

export const GATE_NAMES = ["orientation", "coverage", "forecast_age", "quote_live", "not_in_dispute", "forecast_status", "entry_eligible", "drawdown_risk", "capacity"] as const;
export type GateName = (typeof GATE_NAMES)[number];

export interface Gate {
  readonly name: GateName;
  readonly pass: boolean;
  readonly reason: string | null;
}

export interface GateContext {
  readonly nowMs: number;
  // `experimental` (all sports) shows only behind an explicit opt-in (research 12 10.4).
  readonly allowExperimental?: boolean;
  readonly maxForecastAgeHours?: number;
  readonly maxQuoteAgeMs?: number;
  // The user's intended size; capacity below it demotes the row.
  readonly sizeUsd?: Dec;
}

const pass = (name: GateName): Gate => ({ name, pass: true, reason: null });
const fail = (name: GateName, reason: string): Gate => ({ name, pass: false, reason });

// Pure in (row, context): re-run on every render, because ages move. A row is a candidate to look at only when
// every gate passes; a failing gate demotes it, it never deletes it, and none of them makes a trade.
export function gatesOf(row: QuotientRow, ctx: GateContext): readonly Gate[] {
  const gates: Gate[] = [];

  gates.push(row.orientation.proven ? pass("orientation") : fail("orientation", row.orientation.reason));

  if (row.coverage === "forecasting") gates.push(pass("coverage"));
  else if (row.coverage === "experimental" && ctx.allowExperimental === true) gates.push(pass("coverage"));
  else gates.push(fail("coverage", row.coverage === null ? "coverage_unknown" : `coverage_${row.coverage}`));

  const maxAgeMs = (ctx.maxForecastAgeHours ?? DEFAULT_MAX_FORECAST_AGE_H) * 3_600_000;
  const forecastAge = ctx.nowMs - row.forecast.createdAtMs;
  if (forecastAge < -2000) gates.push(fail("forecast_age", "forecast_time_in_the_future"));
  else gates.push(forecastAge <= maxAgeMs ? pass("forecast_age") : fail("forecast_age", "forecast_too_old"));

  // A sports signal carries one quote per listing; the screen gates each listing, not the row.
  if (row.kind === "mispriced" || row.kind === "signal") gates.push(quoteGate(row, ctx));

  if (row.kind === "mispriced") {
    gates.push(row.inDispute === false ? pass("not_in_dispute") : fail("not_in_dispute", row.inDispute === true ? "in_dispute" : "dispute_state_unknown"));
  }

  if (row.kind !== "lookup") {
    const state = row.forecastStatus;
    gates.push(state === null ? fail("forecast_status", "forecast_status_unknown") : state === "warning" || state === "caution" ? fail("forecast_status", `forecast_status_${state}`) : pass("forecast_status"));
  }

  if (row.signal !== null && row.kind !== "sports_signal") {
    const s = row.signal;
    if (s.entryEligible !== true || s.entryStatus !== "eligible" || s.inPlay === true || s.isActive === false) {
      gates.push(fail("entry_eligible", s.entryStatus === null ? "entry_status_unknown" : `entry_${s.entryStatus}`));
    } else gates.push(pass("entry_eligible"));
    gates.push(s.drawdownRiskElevated === false ? pass("drawdown_risk") : fail("drawdown_risk", s.drawdownRiskElevated === true ? "drawdown_risk_elevated" : "drawdown_risk_unknown"));
    gates.push(capacityGate(s.capacityUsdAt2c, ctx.sizeUsd));
  }
  return gates;
}

function capacityGate(capacity: Dec | null, size: Dec | undefined): Gate {
  if (capacity === null) return fail("capacity", "capacity_unknown");
  if (size === undefined) return pass("capacity");
  const have = parseQty("usd", capacity);
  const need = parseQty("usd", size);
  if (have === null || need === null) return fail("capacity", "capacity_unknown");
  return cmpQty(have, need) >= 0 ? pass("capacity") : fail("capacity", "capacity_below_size");
}

function quoteGate(row: QuotientRow, ctx: GateContext): Gate {
  const quote = row.quote;
  if (row.venue === null || !LIVE_QUOTE_VENUES.includes(row.venue)) return fail("quote_live", "venue_has_no_live_quotes");
  if (quote === null) return fail("quote_live", "no_quote");
  if (quote.method === null) return fail("quote_live", "quote_method_unknown");
  if (quote.method === "graph_snapshot") return fail("quote_live", "graph_snapshot_quote");
  if (row.signal?.livePriced === false) return fail("quote_live", "not_live_priced");
  if (quote.reportedFresh === false) return fail("quote_live", "quote_reported_not_fresh");
  if (quote.observedAtMs === null) return fail("quote_live", "quote_time_unknown");
  const age = ctx.nowMs - quote.observedAtMs;
  if (age < -2000) return fail("quote_live", "quote_time_in_the_future");
  return age <= (ctx.maxQuoteAgeMs ?? QUOTE_MAX_AGE_MS) ? pass("quote_live") : fail("quote_live", "quote_too_old");
}

export function allPass(gates: readonly Gate[]): boolean {
  return gates.every((gate) => gate.pass);
}
