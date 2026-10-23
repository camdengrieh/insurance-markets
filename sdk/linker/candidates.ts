// From scored pairs and native groups to candidate inputs (links/schema.ts CandidateInput). Pure:
// nothing here writes a registry. The job (pm/linker/candidates.ts) proposes these through
// store.proposeLink, which only ever creates state "candidate". Nothing in this module can approve.

import { SYNTHETIC_PREFIX, computeLinkId, type CandidateInput, type LinkLeg, type ProposerSource } from "../links/schema.js";
import { MINOR_TIMING_MINUTES } from "./constants.js";
import { featureKey, type MarketFeatures } from "./features.js";
import { closeDeltaMinutes, evidenceCode, scorePair, type PairScore } from "./score.js";
import type { Pair } from "./block.js";

export function legOf(f: MarketFeatures): LinkLeg {
  return {
    venue: f.venue,
    marketId: f.marketId,
    outcomeMap: [0, 1],
    rulesSha256: f.rulesSha256,
    maskedSha256: f.maskedSha256,
    closeUtc: f.closeUtc,
    voidPolicy: f.voidPolicy,
    resolverId: f.resolverId,
    // Unknown for XO (the allowlist is not read here); not applicable elsewhere.
    creatorAllowlisted: null,
    groupKey: f.groupKey,
  };
}

function syntheticOf(legs: readonly LinkLeg[]): boolean | null {
  const flags = legs.map((l) => l.marketId.startsWith(SYNTHETIC_PREFIX));
  if (flags.every((x) => x)) return true;
  if (flags.every((x) => !x)) return false;
  return null; // a mix can never be a valid link
}

function earliestClose(legs: readonly LinkLeg[]): string {
  return [...legs.map((l) => l.closeUtc)].sort()[0] as string;
}

export interface ScoredCandidate {
  readonly kind: "pair";
  readonly input: CandidateInput;
  readonly score: PairScore;
  readonly blockKey: string;
  readonly linkId: string;
}

// A same-question proposal for one pair, or null when the pair cannot be a valid two-leg link.
export function pairCandidate(a: MarketFeatures, b: MarketFeatures, score: PairScore): CandidateInput | null {
  if (a.outcomes !== 2 || b.outcomes !== 2) return null;
  const legs = [legOf(a), legOf(b)];
  const synthetic = syntheticOf(legs);
  if (synthetic === null) return null;
  const delta = score.closeDeltaMinutes;
  if (delta === null) return null;
  const proof: CandidateInput["proof"] = { level: "P_unproven", evidence: [{ method: "statistics_hint", detail: evidenceCode(score) }] };
  const validUntil = earliestClose(legs);
  if (score.sameQuestion && score.sameTemplate && a.voidPolicy === b.voidPolicy && delta === 0) {
    return { relation: "identity", legs, basis: { class: "identical", axes: [], cutoffDeltaMinutes: 0 }, proof, validUntil, synthetic };
  }
  if (delta > 0) {
    return {
      relation: "near_identity",
      legs,
      basis: {
        class: "settlement_window",
        // The two pinned close instants: our own timestamps, not venue text.
        axes: [{ axis: "timing_cutoff", legA: 0, legB: 1, a: legs[0]?.closeUtc ?? "", b: legs[1]?.closeUtc ?? "", severity: delta <= MINOR_TIMING_MINUTES ? "minor" : "major" }],
        cutoffDeltaMinutes: delta,
      },
      proof,
      validUntil,
      synthetic,
    };
  }
  // Same close, different rule text: the reviewer must name the axes; the statistics cannot.
  return { relation: "near_identity", legs, basis: { class: "different", axes: [], cutoffDeltaMinutes: 0 }, proof, validUntil, synthetic };
}

export function scoreCandidates(pairs: readonly Pair[]): { candidates: ScoredCandidate[]; vetoed: number; belowLine: number; invalid: number } {
  const candidates: ScoredCandidate[] = [];
  let vetoed = 0;
  let belowLine = 0;
  let invalid = 0;
  for (const p of pairs) {
    const score = scorePair(p.a, p.b);
    if (score.vetoes.length > 0) {
      vetoed += 1;
      continue;
    }
    if (!score.proposable) {
      belowLine += 1;
      continue;
    }
    const input = pairCandidate(p.a, p.b, score);
    if (input === null) {
      invalid += 1;
      continue;
    }
    candidates.push({ kind: "pair", input, score, blockKey: p.blockKey, linkId: computeLinkId(input) });
  }
  // Best first, then by id so ties are stable.
  candidates.sort((x, y) => y.score.bps - x.score.bps || (x.linkId < y.linkId ? -1 : x.linkId > y.linkId ? 1 : 0));
  return { candidates, vetoed, belowLine, invalid };
}

// ---------------------------------------------------------------------------------------------
// Within-venue structure: native neg-risk partitions and same-template ladders (cheap, no books).

export interface GroupCandidate {
  readonly kind: "partition" | "ladder";
  readonly input: CandidateInput;
  readonly source: ProposerSource;
  readonly linkId: string;
  readonly groupKey: string;
}

function groupBasis(legs: readonly LinkLeg[]): CandidateInput["basis"] {
  const closes = new Set(legs.map((l) => l.closeUtc));
  const voids = new Set(legs.map((l) => l.voidPolicy));
  if (closes.size === 1 && voids.size === 1) return { class: "identical", axes: [], cutoffDeltaMinutes: 0 };
  const delta = legs.length === 2 ? closeDeltaMinutes(legs[0]?.closeUtc ?? "", legs[1]?.closeUtc ?? "") : null;
  return { class: "different", axes: [], cutoffDeltaMinutes: delta };
}

export function groupCandidates(features: readonly MarketFeatures[]): GroupCandidate[] {
  const out: GroupCandidate[] = [];
  const byGroup = new Map<string, MarketFeatures[]>();
  for (const f of [...features].sort((a, b) => (featureKey(a) < featureKey(b) ? -1 : 1))) {
    if (f.groupKey === null || f.outcomes !== 2) continue;
    const key = `${f.venue}|${f.groupKey}`;
    const list = byGroup.get(key);
    if (list === undefined) byGroup.set(key, [f]);
    else list.push(f);
  }
  for (const [key, members] of [...byGroup.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (members.length < 2 || members.length > 32) continue;
    const legs = members.map(legOf);
    const synthetic = syntheticOf(legs);
    if (synthetic === null) continue;
    const first = members[0] as MarketFeatures;
    if (first.groupKind === "neg_risk") {
      // The venue states "at most one Yes" (E1): exclusive, not exhaustive. Provenance, not proof.
      const input: CandidateInput = {
        relation: "partition",
        exhaustiveness: "E1_exclusive_only",
        legs,
        basis: groupBasis(legs),
        proof: { level: "P0_native", evidence: [{ method: "native_hook", detail: "polymarket.negRiskMarketID" }] },
        validUntil: earliestClose(legs),
        synthetic,
      };
      out.push({ kind: "partition", input, source: "native_hook", linkId: computeLinkId(input), groupKey: key });
    }
    // Same masked template inside one native group with different numbers or dates: a ladder.
    const byMask = new Map<string, MarketFeatures[]>();
    for (const m of members) {
      const list = byMask.get(m.maskedSha256);
      if (list === undefined) byMask.set(m.maskedSha256, [m]);
      else list.push(m);
    }
    for (const [mask, rungs] of [...byMask.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (rungs.length < 2) continue;
      const numberSets = new Set(rungs.map((r) => r.numbers.join(",")));
      const dateSets = new Set(rungs.map((r) => r.dates.join(",")));
      const axis = numberSets.size === rungs.length && rungs.every((r) => r.numbers.length > 0) ? "threshold" : dateSets.size === rungs.length && rungs.every((r) => r.dates.length > 0) ? "date" : null;
      if (axis === null) continue;
      const rungLegs = rungs.map(legOf);
      const input: CandidateInput = {
        relation: "ladder",
        ladder: { axis, monotonicity: "unknown" },
        legs: rungLegs,
        basis: groupBasis(rungLegs),
        proof: { level: "P_unproven", evidence: [{ method: "statistics_hint", detail: `same-template.${axis}.${rungs.length}` }] },
        validUntil: earliestClose(rungLegs),
        synthetic,
      };
      out.push({ kind: "ladder", input, source: "statistics", linkId: computeLinkId(input), groupKey: `${key}|${mask.slice(0, 8)}` });
    }
  }
  return out;
}
