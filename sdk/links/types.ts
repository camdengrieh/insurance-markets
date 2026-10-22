// The engine's view of a link (docs/aggregation-design.md section 4.2): what a label, a signal or a
// report carries about the link a pair of markets came from. The registry record itself (its schema,
// states and tiers) is schema.ts; these names overlap it on purpose and are imported by path, not
// through the barrel.

import type { MarketRef, VoidPolicy } from "../model.js";

export type LinkRelation =
  | "identity"
  | "complement"
  | "subset"
  | "superset"
  | "overlap"
  | "disjoint"
  | "partition"
  | "ladder_threshold"
  | "ladder_date"
  | "implication"
  | "exclusive"
  | "joint";

export type LinkState = "discovered" | "candidate" | "verified" | "suspended" | "rejected";
export type BasisClass = "identical" | "settlement_window" | "settlement_source";
export type BasisAxis = "timing" | "source" | "condition_scope";

export interface LinkLeg {
  readonly ref: MarketRef;
  // Pinned rules hash; a mismatch on refresh suspends the link.
  readonly rulesSha256: string;
  readonly closeUtc: string;
  readonly source: string;
  readonly void: VoidPolicy;
  // outcomeMap[i] is the index of the linked outcome on the other leg(s).
  readonly outcomeMap: readonly number[];
}

export interface Link {
  readonly linkId: string;
  readonly relation: LinkRelation;
  readonly legs: readonly LinkLeg[];
  readonly basis: {
    readonly class: BasisClass;
    readonly axes: readonly BasisAxis[];
    readonly cutoffDeltaH: number;
  };
  readonly evidence: { readonly methods: readonly string[]; readonly quotedFragments: readonly string[] };
  readonly state: LinkState;
  readonly reviewer?: string;
  readonly reviewedAt?: string;
  // Earlier of the two closes.
  readonly validUntil: string;
  readonly schemaVersion: number;
}

// Lightweight reference to a registry link, carried on results so a signal can name the exact
// approved link (and its pinned hash) it came from. Only a verified registry link may appear.
export interface LinkRef {
  readonly linkId: string;
  readonly relation: LinkRelation;
  readonly state: LinkState;
  // sha256 over the canonical link record as pinned by the registry.
  readonly recordSha256: string;
}
