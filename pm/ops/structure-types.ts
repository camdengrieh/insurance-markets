// Types for pm_check_structure (docs/aggregation-design.md 5.2, 5.3, 9.1): within-venue
// complement, partition and ladder checks for one group on injected books.
//
// Everything here is data shape only. The maths is in pm/core, the orchestration in
// structure.ts. The result is an ALERT: it names a price relation that looks off, says how far
// it was checked (mid, top of book after fees, or depth walked), and lists every reason a
// stronger label was withheld. It never claims guaranteed profit and places no orders.

import type { UntrustedContent } from "../../src/guardrails/untrusted.js";
import type { EdgeLabel } from "../core/labels.js";
import type { SDec } from "../core/rational.js";
import type { Book, Dec, Exhaustive, FeeSpec, GroupKind, Status, Untrusted, VenueId } from "../types.js";

export const STRUCTURE_SCHEMA_VERSION = "pm_check_structure/v1" as const;

// Caps keep the pairwise ladder scan and the output bounded.
export const MAX_GROUP_MEMBERS = 64;
export const MAX_LADDER_FINDINGS = 20;

// Defaults marked D in the design: starting points to calibrate, not findings.
export const STRUCTURE_DEFAULTS = {
  // Legging reserve per share for a multi-order basket on one venue (5.7 uses 0.2 cent).
  reservePerShare: "0.002",
  // A book older than this is not priced at all.
  maxBookAgeMs: 60_000,
  // Within this window of the close the label is withheld (8.3 "within a configurable window").
  nearCloseMs: 3_600_000,
} as const;

export type StructureCheckKind = "complement" | "partition" | "ladder";
export const STRUCTURE_CHECK_KINDS: readonly StructureCheckKind[] = ["complement", "partition", "ladder"];

// ---------------------------------------------------------------------------------------------
// Input

export type RungDirection = "above" | "below";
// "terminal": the value at the deadline decides. "touch": reaching the strike by the deadline.
export type RungKind = "terminal" | "touch";

// Ladder metadata comes from the adapter or an approved structure record. It is never guessed
// from titles: a member without it is simply left out of the ladder check.
export interface RungSpec {
  readonly strike: Dec;
  readonly deadlineMs: number;
  readonly direction: RungDirection;
  readonly kind: RungKind;
}

export interface RulesPin {
  // sha256 pinned when the group was approved or first read, and the hash recomputed now.
  readonly pinned: string;
  readonly current: string;
}

export interface StructureMember {
  // Venue market id. Restricted charset so it is safe to echo in reasons.
  readonly id: string;
  readonly label: Untrusted<string>;
  readonly status: Status;
  readonly tradable: boolean;
  // null = unknown, which fails closed (the label is withheld).
  readonly closesAtMs: number | null;
  // UMA proposal or dispute, Kalshi disputed or amended, and similar venue flags.
  readonly disputeOrProposal: boolean;
  readonly yes: Book | null;
  // The venue's own NO book (XO, Kalshi). When absent the NO side is the complement of the YES
  // book: shown, but synthetic and never labelled structural.
  readonly no: Book | null;
  readonly fee: FeeSpec;
  readonly rung?: RungSpec;
  readonly rulesPin?: RulesPin;
}

export interface StructureGroup {
  readonly venue: VenueId;
  readonly key: string;
  readonly kind: GroupKind;
  readonly exhaustive: Exhaustive;
  // false when the member list may be truncated (a paged read that did not finish).
  readonly membersComplete: boolean;
  readonly members: readonly StructureMember[];
  // Latest plausible resolution across the members, UTC ms. null fails closed.
  readonly resolutionAtMs: number | null;
  readonly disputeTail?: { readonly probability: Dec; readonly deltaDays: Dec };
}

export interface StructureOptions {
  readonly checks?: readonly StructureCheckKind[];
  readonly tau?: Dec;
  readonly hurdleApy?: Dec;
  readonly reservePerShare?: Dec;
  readonly haircutPerShare?: Dec;
  readonly maxBookAgeMs?: number;
  readonly nearCloseMs?: number;
  readonly maxQty?: Dec;
  // false skips the depth walk; labels then stay indicative (depth_incomplete).
  readonly walkDepth?: boolean;
  readonly lockBase?: "price" | "price_plus_fee";
}

// ---------------------------------------------------------------------------------------------
// Output

export type BookState =
  | "ok"
  | "bid_only"
  | "ask_only"
  | "empty"
  | "no_book"
  | "stale"
  | "time_invalid"
  | "crossed"
  | "malformed";

export interface MemberView {
  readonly ref: string;
  readonly id: string;
  // Market text, only ever inside this fixed untrusted slot.
  readonly label: UntrustedContent;
  readonly status: Status;
  readonly tradable: boolean;
  readonly yesBook: BookState;
  readonly noBook: "native" | "derived" | "missing";
  readonly ageMs: number | null;
  readonly bid: Dec | null;
  readonly ask: Dec | null;
  readonly mid: Dec | null;
}

export type FindingVerdict =
  // Net edge after fees, lock and reserve is above tau at the top of book.
  | "candidate"
  // The mid prices look off, but the executable edge does not clear tau (or cannot be computed).
  | "mid_gap_only"
  | "no_edge"
  | "unavailable";

// How far the finding was checked. "mid" is a reference price only, not something one can trade.
export type PriceBasis = "none" | "mid" | "top_of_book_after_fees" | "depth_walk_after_fees";

export type Direction =
  | "buy_all_yes"
  | "buy_all_no"
  | "buy_yes_and_no"
  | "sell_yes_and_no"
  | "sell_stronger_buy_weaker";

export interface TopEdge {
  // Per share of the package, after the stated friction. Costs are rounded up, gross and net
  // rounded down, so the display never flatters the edge.
  readonly gross: SDec;
  readonly fees: SDec;
  readonly lock: SDec;
  readonly reserve: SDec;
  readonly haircut: SDec;
  readonly net: SDec;
}

export interface DepthEdge {
  // Shares of the package taken before the marginal net edge falls to tau (or depth runs out).
  readonly qty: SDec;
  readonly capital: SDec;
  readonly gross: SDec;
  readonly fees: SDec;
  readonly lock: SDec;
  readonly reserve: SDec;
  readonly haircut: SDec;
  readonly fixedCost: SDec;
  readonly net: SDec;
  readonly returnOnCapital: SDec | null;
  // Net after replacing the smooth fee by the venue's per-order rounding.
  readonly netAfterOrderRounding: SDec;
  readonly stopReason: string;
}

export interface StructureFinding {
  readonly id: string;
  readonly check: StructureCheckKind;
  readonly direction: Direction;
  readonly members: readonly string[];
  readonly verdict: FindingVerdict;
  // null when there is no discrepancy to label.
  readonly label: EdgeLabel | null;
  readonly basis: PriceBasis;
  // Package payoff minus package cost at mid prices, no fees. null when any mid is unknown.
  readonly midGap: SDec | null;
  readonly top: TopEdge | null;
  readonly depth: DepthEdge | null;
  // True only when every book used is a real resting book (no complement-derived side).
  readonly booksNative: boolean;
  // Machine-readable reasons: failed gates, unavailable sides, unusable fee models.
  readonly reasons: readonly string[];
  // Fixed codes for risks the prices cannot show (void, ties, per-rung resolution).
  readonly caveats: readonly string[];
}

export interface CheckSummary {
  readonly kind: StructureCheckKind;
  readonly status: "evaluated" | "not_applicable" | "refused";
  readonly itemsEvaluated: number;
  readonly candidates: number;
  readonly midGapOnly: number;
  readonly noEdge: number;
  readonly unavailable: number;
  readonly reasons: readonly string[];
}

export interface PartitionFacts {
  readonly n: number;
  // "1" only for an exhaustive set; a merely exclusive set can sum to less than 1.
  readonly expectedSum: "1" | "at_most_1" | "unknown";
  readonly sumAsk: Dec | null;
  readonly sumBid: Dec | null;
  readonly sumMid: Dec | null;
}

export interface StructureResult {
  readonly schema: typeof STRUCTURE_SCHEMA_VERSION;
  readonly group: {
    readonly venue: VenueId;
    readonly key: string;
    readonly kind: GroupKind;
    readonly exhaustive: Exhaustive;
    readonly membersComplete: boolean;
    readonly memberCount: number;
  };
  readonly asOfMs: number;
  readonly params: {
    readonly tau: Dec;
    readonly hurdleApy: Dec;
    readonly reservePerShare: Dec;
    readonly haircutPerShare: Dec;
    readonly maxBookAgeMs: number;
    readonly nearCloseMs: number;
  };
  readonly members: readonly MemberView[];
  readonly partition: PartitionFacts | null;
  readonly checks: readonly CheckSummary[];
  // Candidates and mid-gap alerts, plus both partition directions even when they show no edge.
  readonly findings: readonly StructureFinding[];
  readonly summary: {
    readonly alerts: number;
    readonly highestLabel: EdgeLabel | null;
    readonly ladderFindingsOmitted: number;
  };
  readonly notice: string;
}

export type StructureErrorCode =
  | "INPUT_INVALID"
  | "GROUP_TOO_LARGE"
  | "TOO_FEW_MEMBERS"
  | "UNSAFE_ID"
  | "DUPLICATE_ID"
  | "VENUE_MISMATCH";
