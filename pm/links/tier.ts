// Tier caps for links (design section 7.5 and 9). The cap is a ceiling, never a promotion:
//   effective cap = min(reviewer's stored cap, structural ceiling, time/state checks, class gate)
// A class gate comes from the gold-set evaluation (goldset/evaluate.ts). With no evaluation
// every class is capped at indicative_discrepancy, which is the honest state of an empty dataset.
// executable_arbitrage does not exist here: it stays disabled until the D2 criteria hold.

import {
  UNPRICED_AXES,
  isCrossVenue,
  legsVenues,
  type Link,
  type Tier,
} from "./schema.js";

const RANK: Readonly<Record<Tier, number>> = Object.freeze({
  indicative_discrepancy: 0,
  structural_violation: 1,
  hedged_discrepancy: 2,
});

export function tierRank(tier: Tier): number {
  return RANK[tier];
}

export function minTier(a: Tier, b: Tier): Tier {
  return RANK[a] <= RANK[b] ? a : b;
}

// ---------------------------------------------------------------------------------------------
// Class keys and gates

export interface ClassKeyParts {
  readonly relation: string;
  readonly venues: readonly string[];
  readonly family: string | null;
}

// A "class" is the unit the gold-set bound applies to: relation, venue set and template family.
export function classKeyOf(parts: ClassKeyParts): string {
  const venues = [...new Set(parts.venues)].sort().join("+");
  return `${parts.relation}|${venues}|${parts.family ?? "untemplated"}`;
}

export function classKeyForLink(link: Pick<Link, "relation" | "legs" | "templateId">): string {
  return classKeyOf({
    relation: link.relation,
    venues: legsVenues(link),
    family: link.templateId ?? null,
  });
}

export interface ClassGate {
  // qLevel precision bound met (design 13.4): allows structural_violation within one venue.
  readonly q: boolean;
  // q plus rLevel precision and axis-extraction recall met: allows hedged_discrepancy.
  readonly hedged: boolean;
}
export type ClassGates = Readonly<Record<string, ClassGate>>;

// ---------------------------------------------------------------------------------------------
// Approvals

// Two human keys when a cross-venue long basket rests on an exhaustiveness clause alone (G14).
export function requiredApprovals(link: Pick<Link, "relation" | "exhaustiveness" | "legs">): 1 | 2 {
  return link.relation === "partition" && link.exhaustiveness === "E2_by_rule_clause" && isCrossVenue(link)
    ? 2
    : 1;
}

// Proof as the product should present it: a P3 or unproven candidate that a human approved is
// human-verified (P4). Anything not approved keeps the proposer's claim.
export function effectiveProofLevel(link: Pick<Link, "proof" | "state" | "approvals">): Link["proof"]["level"] {
  const level = link.proof.level;
  if (link.state === "approved" && link.approvals.length > 0 && (level === "P3_llm_assisted" || level === "P_unproven")) {
    return "P4_human";
  }
  return level;
}

// ---------------------------------------------------------------------------------------------
// Caps

export interface TierCapResult {
  readonly cap: Tier;
  // Why the cap is below the structural maximum. Machine-readable.
  readonly reasons: readonly string[];
  // Non-blocking facts the reader should see next to the cap.
  readonly notes: readonly string[];
}

type CapInput = Pick<Link, "relation" | "ladder" | "exhaustiveness" | "legs" | "basis">;

// The highest tier the structure of the record could ever allow, ignoring state, time and gates.
export function structuralCeiling(link: CapInput): TierCapResult {
  const reasons: string[] = [];
  const notes: string[] = [];
  const cross = isCrossVenue(link);

  if (link.relation === "related") reasons.push("relation_related_signal_only");
  if (link.basis.class === "different") reasons.push("basis_different");
  for (const axis of link.basis.axes) {
    if (axis.severity === "fatal") reasons.push(`axis_fatal:${axis.axis}`);
    else if (UNPRICED_AXES.includes(axis.axis)) reasons.push(`axis_unpriced:${axis.axis}`);
  }
  if (link.legs.some((leg) => leg.voidPolicy === "unknown")) reasons.push("void_policy_unknown");
  if (link.basis.cutoffDeltaMinutes === null) reasons.push("cutoff_delta_unknown");
  if (link.relation === "ladder" && (link.ladder === undefined || link.ladder.monotonicity === "unknown")) {
    reasons.push("ladder_polarity_unknown");
  }
  if (link.relation === "partition") {
    if (link.exhaustiveness === undefined || link.exhaustiveness === "E0_unknown") {
      reasons.push("exhaustiveness_unproven");
    } else if (link.exhaustiveness === "E1_exclusive_only") {
      notes.push("short_basket_only");
    }
  }
  for (const leg of link.legs) {
    if (leg.venue === "xo" && leg.creatorAllowlisted !== true) {
      reasons.push(leg.creatorAllowlisted === null ? "xo_creator_unknown" : "xo_creator_not_allowlisted");
    }
  }
  if (link.legs.some((leg) => leg.venue === "kalshi")) notes.push("manual_leg_required:kalshi");

  const ceiling: Tier = cross ? "hedged_discrepancy" : "structural_violation";
  return {
    cap: reasons.length > 0 ? "indicative_discrepancy" : ceiling,
    reasons: [...new Set(reasons)],
    notes: [...new Set(notes)],
  };
}

export interface CapContext {
  readonly now: Date;
  readonly gates?: ClassGates;
}

export function computeTierCap(link: Link, ctx: CapContext): TierCapResult {
  const base = structuralCeiling(link);
  const reasons = [...base.reasons];
  const notes = [...base.notes];
  let cap: Tier = base.cap;

  if (link.state !== "approved") {
    reasons.push(`state_${link.state}`);
    cap = "indicative_discrepancy";
  }
  if (ctx.now.getTime() >= Date.parse(link.validUntil)) {
    reasons.push("expired");
    cap = "indicative_discrepancy";
  }
  cap = minTier(cap, link.tierCap);

  const gate = ctx.gates?.[classKeyForLink(link)];
  if (gate === undefined) {
    if (cap !== "indicative_discrepancy") reasons.push("class_gate_not_evaluated");
    cap = "indicative_discrepancy";
  } else if (isCrossVenue(link)) {
    if (!gate.hedged) {
      if (cap !== "indicative_discrepancy") reasons.push("class_gate_hedged_not_passed");
      cap = "indicative_discrepancy";
    }
  } else if (!gate.q) {
    if (cap !== "indicative_discrepancy") reasons.push("class_gate_q_not_passed");
    cap = "indicative_discrepancy";
  }

  return { cap, reasons: [...new Set(reasons)], notes };
}
