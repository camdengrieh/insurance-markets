// Gates and labels for an edge (docs/aggregation-design.md 5.1, 5.6, 5.7; docs/research/10
// section 5). Pure decision logic over facts the caller has already established.
//
// Allowed labels in the MVP are indicative_discrepancy, hedged_discrepancy, structural_violation,
// model_edge and relative_value_signal. `executable_arbitrage` is deliberately NOT a value of
// EdgeLabel: it stays disabled until the promotion rule D2 is met (200 or more gold links with a
// Wilson lower bound of at least 0.97 per class, and two real fills reconciling the modelled
// fee to the charged fee). No tool may claim guaranteed profit.
//
// Every gate fails closed: an input that is missing or unknown counts as a failed gate, and every
// failure is reported as a machine-readable reason so the caller can show why a label was
// downgraded.

import type { BasisAxis, BasisClass, Exhaustive, LinkState } from "../types.js";
import { DEFAULTS, DEFAULT_DELTA } from "./edge.js";
import { cmp, type Rational } from "./rational.js";

export type EdgeLabel =
  | "structural_violation"
  | "hedged_discrepancy"
  | "indicative_discrepancy"
  | "model_edge"
  | "relative_value_signal";

export type EdgeKind = "within_venue_structure" | "cross_venue_pair" | "model" | "factor";

export interface BasisInfo {
  readonly class: BasisClass;
  readonly axes: readonly BasisAxis[];
}

// Per-share adverse-divergence haircut for a basis (5.6). null means the pair can never be
// labelled hedged: an unresolved condition_scope axis.
export function haircutForBasis(basis: BasisInfo): Rational | null {
  if (basis.axes.includes("condition_scope")) return DEFAULT_DELTA.condition_scope;
  if (basis.class === "settlement_source" || basis.axes.includes("source")) return DEFAULT_DELTA.settlement_source;
  if (basis.class === "settlement_window" || basis.axes.includes("timing")) return DEFAULT_DELTA.timing;
  return DEFAULT_DELTA.identical;
}

export interface GateInput {
  readonly kind: EdgeKind;
  // Net edge per share after every friction including the haircut; null when not computable.
  readonly net: Rational | null;
  readonly tau: Rational;
  readonly rulesHashesUnchanged: boolean;
  readonly allTradable: boolean;
  readonly nearClose: boolean;
  readonly disputeOrProposalFlag: boolean;
  readonly booksNative: boolean;
  readonly depthComplete: boolean;
  // Largest timestamp gap between legs; null when unknown.
  readonly skewMs: number | null;
  readonly feesUsable: boolean;
  // within_venue_structure: whether the package direction is allowed by exhaustiveness.
  readonly exhaustive?: Exhaustive;
  readonly directionAllowed?: boolean;
  // cross_venue_pair
  readonly linkState?: LinkState | "none";
  readonly basis?: BasisInfo;
  // model: whether the forecast was shrunk toward the mid.
  readonly forecastShrunk?: boolean;
}

export interface LabelDecision {
  readonly label: EdgeLabel;
  // Gates that failed; empty when the label is the best one available for this kind.
  readonly reasons: readonly string[];
  // Always true: the executable tier is off until D2.
  readonly executableDisabled: true;
}

export function evaluateGates(input: GateInput): string[] {
  const failed: string[] = [];
  if (!input.rulesHashesUnchanged) failed.push("rules_hash_changed");
  if (!input.allTradable) failed.push("not_tradable");
  if (input.nearClose) failed.push("near_close");
  if (input.disputeOrProposalFlag) failed.push("dispute_or_proposal_flag");
  if (!input.booksNative) failed.push("books_not_native");
  if (!input.depthComplete) failed.push("depth_incomplete");
  if (!input.feesUsable) failed.push("fee_model_unverified");
  const skewLimit = input.kind === "cross_venue_pair" ? DEFAULTS.maxSkewMsHedged : DEFAULTS.maxSkewMsExecutable;
  if (input.skewMs === null) failed.push("skew_unknown");
  else if (input.skewMs > skewLimit) failed.push("leg_skew_too_large");
  if (input.net === null) failed.push("net_edge_unknown");
  else if (cmp(input.net, input.tau) <= 0) failed.push("net_edge_not_above_tau");
  if (input.kind === "within_venue_structure") {
    if (input.directionAllowed !== true) failed.push("direction_not_allowed_by_exhaustiveness");
  }
  if (input.kind === "cross_venue_pair") {
    if (input.linkState !== "verified") failed.push("link_not_verified");
    if (input.basis === undefined) failed.push("basis_unknown");
    else if (haircutForBasis(input.basis) === null) failed.push("basis_unresolved");
  }
  return failed;
}

export function assignLabel(input: GateInput): LabelDecision {
  const base = { executableDisabled: true } as const;
  switch (input.kind) {
    case "factor":
      return { label: "relative_value_signal", reasons: [], ...base };
    case "model": {
      // A forecast edge is directional and always shrunk; unshrunk is not even a model edge.
      if (input.forecastShrunk !== true) return { label: "indicative_discrepancy", reasons: ["forecast_not_shrunk"], ...base };
      return { label: "model_edge", reasons: [], ...base };
    }
    case "within_venue_structure": {
      const reasons = evaluateGates(input);
      return { label: reasons.length === 0 ? "structural_violation" : "indicative_discrepancy", reasons, ...base };
    }
    case "cross_venue_pair": {
      const reasons = evaluateGates(input);
      return { label: reasons.length === 0 ? "hedged_discrepancy" : "indicative_discrepancy", reasons, ...base };
    }
  }
}
