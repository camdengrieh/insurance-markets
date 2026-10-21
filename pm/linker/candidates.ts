// From scored pairs and native groups to candidate inputs, and from candidate inputs into the
// working registry through store.proposeLink (state "candidate", never anything else). Stale
// candidates of the linker's own are vetoed here; a human-approved link whose pinned leg changed
// is suspended (the safe direction). Nothing in this module can approve.

import { vetoLink, findLink, proposeLink, suspendLink, type Outcome, type Registry } from "../links/store.js";
import { SYNTHETIC_PREFIX, computeLinkId, type CandidateInput, type Link, type LinkLeg, type ProposerSource } from "../links/schema.js";
import { LINKER_HANDLE, MAX_PROPOSALS_PER_RUN, MINOR_TIMING_MINUTES } from "./constants.js";
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
  if (score.identicalRules && score.sameTemplate && a.voidPolicy === b.voidPolicy && delta === 0) {
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

// ---------------------------------------------------------------------------------------------
// Into the registry

export interface ProposalOutcome {
  readonly registry: Registry;
  readonly proposed: readonly { readonly linkId: string; readonly kind: string }[];
  readonly existing: number;
  readonly refused: readonly { readonly linkId: string; readonly errors: readonly string[] }[];
  readonly capped: number;
}

export function proposeAll(
  registry: Registry,
  items: readonly { readonly input: CandidateInput; readonly linkId: string; readonly kind: string; readonly source: ProposerSource }[],
  today: string,
): ProposalOutcome {
  let reg = registry;
  const proposed: { linkId: string; kind: string }[] = [];
  const refused: { linkId: string; errors: readonly string[] }[] = [];
  let existing = 0;
  let capped = 0;
  for (const item of items) {
    if (findLink(reg, item.linkId) !== undefined) {
      existing += 1;
      continue;
    }
    if (proposed.length >= MAX_PROPOSALS_PER_RUN) {
      capped += 1;
      continue;
    }
    const r: Outcome<{ registry: Registry; link: Link }> = proposeLink(reg, item.input, { source: item.source, id: LINKER_HANDLE }, { today });
    if (r.ok) {
      reg = r.value.registry;
      proposed.push({ linkId: r.value.link.linkId, kind: item.kind });
    } else refused.push({ linkId: item.linkId, errors: r.errors });
  }
  return { registry: reg, proposed, existing, refused, capped };
}

export interface RetireOutcome {
  readonly registry: Registry;
  readonly vetoed: readonly { readonly linkId: string; readonly reason: string }[];
  readonly suspended: readonly { readonly linkId: string; readonly reason: string }[];
}

// A leg seen this run with a different rules hash or close time, or a close in the past: the
// linker's own candidates are vetoed (revoked); an approved link is suspended for human review.
export function retireStale(registry: Registry, seen: ReadonlyMap<string, MarketFeatures>, nowMs: number, today: string): RetireOutcome {
  let reg = registry;
  const vetoed: { linkId: string; reason: string }[] = [];
  const suspended: { linkId: string; reason: string }[] = [];
  for (const link of [...registry.links].sort((a, b) => (a.linkId < b.linkId ? -1 : 1))) {
    if (link.state !== "candidate" && link.state !== "approved") continue;
    const reasons: string[] = [];
    link.legs.forEach((leg, i) => {
      const f = seen.get(`${leg.venue}:${leg.marketId}`);
      if (f !== undefined && f.rulesSha256 !== leg.rulesSha256) reasons.push(`leg${i}:rules_hash_changed`);
      if (f !== undefined && f.closeUtc !== leg.closeUtc) reasons.push(`leg${i}:close_time_changed`);
      const close = Date.parse(leg.closeUtc);
      if (Number.isFinite(close) && close <= nowMs) reasons.push(`leg${i}:closed`);
    });
    if (reasons.length === 0) continue;
    const reason = reasons.join(",").slice(0, 200);
    if (link.state === "candidate") {
      if (link.proposedBy.id !== LINKER_HANDLE) continue; // not ours to veto
      const r = vetoLink(reg, link.linkId, { source: "statistics", id: LINKER_HANDLE }, reason, { today });
      if (r.ok) {
        reg = r.value;
        vetoed.push({ linkId: link.linkId, reason });
      }
    } else if (reasons.some((x) => !x.endsWith(":closed"))) {
      // Expiry alone is handled by validUntil; a changed pin is what a human must look at.
      const r = suspendLink(reg, link.linkId, LINKER_HANDLE, `linker: ${reason}`.slice(0, 300), { today });
      if (r.ok) {
        reg = r.value;
        suspended.push({ linkId: link.linkId, reason });
      }
    }
  }
  return { registry: reg, vetoed, suspended };
}
