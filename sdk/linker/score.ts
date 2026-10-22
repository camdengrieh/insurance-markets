// Deterministic pair scoring in integer basis points. Documented formula (docs/linker-runbook.md):
//
//   score = ( W_title * J(titleTokens) + W_rules * J(ruleTokens) + W_numbers * A(numbers)
//           + W_dates * A(dates) + W_entities * J(entities) + W_close * P(closeDelta) ) / sum(W)
//
//   J(x)  = Jaccard index of the two hash sets in bps (0 when both are empty)
//   A(x)  = J(x) when both sides have values; 5000 when both are empty; 2500 when one is empty
//   P(d)  = 10000 when d <= 60 min; 0 when d >= 7 days; linear in between
//   rulesSha256 equal (identical rule text) short-circuits to 10000.
//
// Symmetric (every term is symmetric), monotone in shared tokens (adding a shared token can only
// raise a Jaccard term), and integer-only. Two hard vetoes stop a pair whatever its score.

import {
  AGREEMENT_BOTH_EMPTY_BPS,
  AGREEMENT_ONE_EMPTY_BPS,
  BAND_GOOD_BPS,
  BAND_STRONG_BPS,
  CANDIDATE_MIN_BPS,
  CLOSE_WINDOW_MINUTES,
  DATE_VETO_CLOSE_DELTA_MINUTES,
  NEAR_CLOSE_MINUTES,
  WEIGHTS,
  WEIGHT_SUM,
  type Band,
} from "./constants.js";
import type { MarketFeatures } from "./features.js";

export function jaccardBps(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setB = new Set(b);
  let shared = 0;
  for (const x of new Set(a)) if (setB.has(x)) shared += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : Math.floor((shared * 10000) / union);
}

export function agreementBps(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return AGREEMENT_BOTH_EMPTY_BPS;
  if (a.length === 0 || b.length === 0) return AGREEMENT_ONE_EMPTY_BPS;
  return jaccardBps(a, b);
}

export function closeDeltaMinutes(aUtc: string, bUtc: string): number | null {
  const a = Date.parse(aUtc);
  const b = Date.parse(bUtc);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.ceil(Math.abs(a - b) / 60_000);
}

export function closeProximityBps(deltaMinutes: number | null): number {
  if (deltaMinutes === null) return 0;
  if (deltaMinutes <= NEAR_CLOSE_MINUTES) return 10000;
  if (deltaMinutes >= CLOSE_WINDOW_MINUTES) return 0;
  return Math.floor(10000 - ((deltaMinutes - NEAR_CLOSE_MINUTES) * 10000) / (CLOSE_WINDOW_MINUTES - NEAR_CLOSE_MINUTES));
}

export function bandOf(bps: number): Band {
  return bps >= BAND_STRONG_BPS ? "strong" : bps >= BAND_GOOD_BPS ? "good" : "weak";
}

export type Veto = "number_disagreement" | "date_disagreement";

export interface PairScore {
  readonly bps: number;
  readonly parts: {
    readonly title: number;
    readonly rules: number;
    readonly numbers: number;
    readonly dates: number;
    readonly entities: number;
    readonly close: number;
  };
  readonly closeDeltaMinutes: number | null;
  readonly identicalRules: boolean;
  readonly sameTemplate: boolean;
  readonly vetoes: readonly Veto[];
  // Above the proposal line and not vetoed.
  readonly proposable: boolean;
  readonly band: Band;
}

function disjoint(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setB = new Set(b);
  return !a.some((x) => setB.has(x));
}

export function scorePair(a: MarketFeatures, b: MarketFeatures): PairScore {
  const delta = closeDeltaMinutes(a.closeUtc, b.closeUtc);
  const parts = {
    title: jaccardBps(a.titleTokens, b.titleTokens),
    rules: jaccardBps(a.ruleTokens, b.ruleTokens),
    numbers: agreementBps(a.numbers, b.numbers),
    dates: agreementBps(a.dates, b.dates),
    entities: jaccardBps(a.entities, b.entities),
    close: closeProximityBps(delta),
  };
  const identicalRules = a.rulesSha256 === b.rulesSha256;
  const weighted =
    WEIGHTS.title * parts.title +
    WEIGHTS.rules * parts.rules +
    WEIGHTS.numbers * parts.numbers +
    WEIGHTS.dates * parts.dates +
    WEIGHTS.entities * parts.entities +
    WEIGHTS.close * parts.close;
  const bps = identicalRules ? 10000 : Math.floor(weighted / WEIGHT_SUM);
  const vetoes: Veto[] = [];
  if (!identicalRules) {
    if (disjoint(a.numbers, b.numbers)) vetoes.push("number_disagreement");
    if (disjoint(a.dates, b.dates) && (delta === null || delta > DATE_VETO_CLOSE_DELTA_MINUTES)) vetoes.push("date_disagreement");
  }
  return {
    bps,
    parts,
    closeDeltaMinutes: delta,
    identicalRules,
    sameTemplate: a.maskedSha256 === b.maskedSha256,
    vetoes,
    proposable: vetoes.length === 0 && bps >= CANDIDATE_MIN_BPS,
    band: bandOf(bps),
  };
}

// Short code for the evidence slot: no spaces, so it would also pass next to a restricted leg.
export function evidenceCode(s: PairScore): string {
  const h = s.closeDeltaMinutes === null ? "x" : String(Math.min(99999, Math.ceil(s.closeDeltaMinutes / 60)));
  return `s${s.bps}.t${s.parts.title}.r${s.parts.rules}.n${s.parts.numbers}.d${s.parts.dates}.c${h}h`;
}
