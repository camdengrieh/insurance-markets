// Closed-form relation checks at top of book (docs/aggregation-design.md 4.2, 5.2, 5.3 and
// docs/research/15 section 3). Each check turns a relation between linked markets into a hedge
// package whose payoff is known, then prices that package with levelEdge so fees, lock and
// reserves are applied the same way everywhere. Nothing here decides whether a relation is TRUE:
// that comes from the human-approved link registry. These functions only say what the prices
// imply if it is.
//
// Quotes are best bid and best ask per leg; use the basket walk (basket.ts) for depth.
//
// Relation types handled:
//   complement   YES + NO of one market           (b1)  check only, mirrored books cannot cross
//   partition    exactly one of n pays            (b2)  long and short baskets
//   exclusive    at most one of n pays            (b3)  short basket only, never long
//   implication  A => B, so p_A <= p_B            (d)   sell A, buy B
//   ladder       threshold and date ladders       (c)   pairwise implications on a lattice
//   bucket       bucket = G(k1) - G(k2)           (c)   replication check
// Joint/conditional (e) and factor/cross-asset (g, h) relations are deferred: signals only.

import type { Exhaustive, FeeSpec } from "../model.js";
import { levelEdge, type BasketParams, type LegPrice, type LevelEdge } from "./basket.js";
import type { FeeErrorCode, FeeRole } from "./fees.js";
import { ONE, ZERO, add, cmp, ratFromInt, sub, type Rational } from "../money/rational.js";

export interface QuotedLeg {
  readonly id: string;
  readonly bid: Rational | null;
  readonly ask: Rational | null;
  readonly spec: FeeSpec;
  readonly role?: FeeRole;
  // Native ask of this outcome's NO token when the venue publishes one. Otherwise the NO ask is
  // taken as 1 - bid, valid only where the NO book mirrors the YES book.
  readonly noAsk?: Rational | null;
}

export type RelationParams = Pick<BasketParams, "lockRate" | "lockBase" | "reservePerShare" | "haircutPerShare" | "nowMs">;

export type PackageResult =
  | { readonly kind: "ok"; readonly edge: LevelEdge }
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "error"; readonly code: FeeErrorCode; readonly detail: string };

function leg(q: QuotedLeg, side: "buy" | "sell", price: Rational): LegPrice {
  return { id: q.id, side, price, spec: q.spec, ...(q.role === undefined ? {} : { role: q.role }) };
}

function priced(legs: readonly (LegPrice | null)[], payoff: Rational, params: RelationParams): PackageResult {
  const present: LegPrice[] = [];
  for (const l of legs) {
    if (l === null) return { kind: "unavailable", reason: "a leg has no quote on the needed side" };
    present.push(l);
  }
  const edge = levelEdge(present, { guaranteedPayoff: payoff, ...params });
  if (!edge.ok) return { kind: "error", code: edge.code, detail: edge.detail };
  return { kind: "ok", edge: edge.value };
}

// ---------------------------------------------------------------------------------------------
// (b1) complement

export interface ComplementCheck {
  // Buy YES and NO: pays exactly 1.
  readonly long: PackageResult;
  // Sell YES and NO: owes exactly 1.
  readonly short: PackageResult;
  // A positive GROSS gap on a mirrored venue is a stale print or a crossed book, not an edge.
  readonly grossGapSuspect: boolean;
}

export function complementCheck(yes: QuotedLeg, no: QuotedLeg, params: RelationParams): ComplementCheck {
  const long = priced([yes.ask === null ? null : leg(yes, "buy", yes.ask), no.ask === null ? null : leg(no, "buy", no.ask)], ONE, params);
  const short = priced(
    [yes.bid === null ? null : leg(yes, "sell", yes.bid), no.bid === null ? null : leg(no, "sell", no.bid)],
    ratFromInt(-1),
    params,
  );
  const grossPositive = (r: PackageResult): boolean => r.kind === "ok" && cmp(r.edge.gross, ZERO) > 0;
  return { long, short, grossGapSuspect: grossPositive(long) || grossPositive(short) };
}

// ---------------------------------------------------------------------------------------------
// (b2) partition and (b3) exclusive-but-not-exhaustive

export interface PartitionCheck {
  readonly n: number;
  readonly sumAsk: Rational | null;
  readonly sumBid: Rational | null;
  // Buy every YES. Offered only when the set is exhaustive by rule or proven.
  readonly long: PackageResult;
  // Buy every NO (pays at least n - 1 whenever at most one outcome resolves YES). Valid for both
  // exhaustive and merely exclusive sets, so it is the only direction offered for the latter.
  readonly short: PackageResult;
}

export function partitionCheck(legs: readonly QuotedLeg[], exhaustive: Exhaustive, params: RelationParams): PartitionCheck {
  const n = legs.length;
  const sumOf = (pick: (l: QuotedLeg) => Rational | null): Rational | null => {
    let total = ZERO;
    for (const l of legs) {
      const v = pick(l);
      if (v === null) return null;
      total = add(total, v);
    }
    return total;
  };
  if (n < 2) {
    const unavailable: PackageResult = { kind: "unavailable", reason: "a set needs at least two outcomes" };
    return { n, sumAsk: null, sumBid: null, long: unavailable, short: unavailable };
  }
  const longAllowed = exhaustive === "proven" || exhaustive === "by_rule";
  const long: PackageResult = longAllowed
    ? priced(legs.map((l) => (l.ask === null ? null : leg(l, "buy", l.ask))), ONE, params)
    : { kind: "unavailable", reason: `long basket needs an exhaustive set, got exhaustive=${exhaustive}` };
  const short = priced(
    legs.map((l) => {
      const noAsk = l.noAsk !== undefined ? l.noAsk : l.bid === null ? null : sub(ONE, l.bid);
      return noAsk === null ? null : leg({ ...l, id: `${l.id}:no` }, "buy", noAsk);
    }),
    ratFromInt(n - 1),
    params,
  );
  return { n, sumAsk: sumOf((l) => l.ask), sumBid: sumOf((l) => l.bid), long, short };
}

// ---------------------------------------------------------------------------------------------
// (d) implication

// A => B (A true forces B true), so p_A <= p_B. Violation trade: sell A at its bid, buy B at its
// ask; the package never pays less than 0, so net edge = bid_A - ask_B - fees.
export function implicationCheck(antecedent: QuotedLeg, consequent: QuotedLeg, params: RelationParams): PackageResult {
  return priced(
    [
      antecedent.bid === null ? null : leg(antecedent, "sell", antecedent.bid),
      consequent.ask === null ? null : leg(consequent, "buy", consequent.ask),
    ],
    ZERO,
    params,
  );
}

// ---------------------------------------------------------------------------------------------
// (c) ladders

export type LadderDirection = "above" | "below";
// "terminal": the value at the deadline decides. "touch": reaching the strike any time up to the
// deadline decides (hit-by-date markets).
export type LadderKind = "terminal" | "touch";

export interface Rung {
  readonly quote: QuotedLeg;
  readonly strike: Rational;
  readonly deadlineMs: number;
  readonly direction: LadderDirection;
  readonly kind: LadderKind;
}

// True when `a` resolving YES forces `b` YES, for rungs of one underlying and one measure.
//   terminal above/below: same deadline only; a higher strike (above) or lower strike (below) is
//     the stronger event.
//   touch: stronger means a harder strike AND an earlier-or-equal deadline. Strikes that move one
//     way and deadlines the other are INCOMPARABLE (ETH 2,900 by Oct 31 versus 3,000 by Dec 31).
// Different kinds or directions are never compared: touch versus terminal semantics differ.
export function rungImplies(a: Rung, b: Rung): boolean {
  if (a.kind !== b.kind || a.direction !== b.direction) return false;
  const strikeOrder = cmp(a.strike, b.strike);
  const harder = a.direction === "above" ? strikeOrder >= 0 : strikeOrder <= 0;
  if (a.kind === "terminal") {
    if (a.deadlineMs !== b.deadlineMs) return false;
    return harder && strikeOrder !== 0;
  }
  if (a.deadlineMs > b.deadlineMs) return false;
  const sameStrike = strikeOrder === 0;
  const sameDeadline = a.deadlineMs === b.deadlineMs;
  return harder && !(sameStrike && sameDeadline);
}

export interface LadderPair {
  readonly antecedent: string;
  readonly consequent: string;
  readonly result: PackageResult;
}

export interface LadderCheck {
  readonly pairsChecked: number;
  readonly incomparablePairs: number;
  readonly pairs: readonly LadderPair[];
  // Pairs whose net edge after fees is above zero (callers compare against tau).
  readonly violations: readonly LadderPair[];
}

export function ladderCheck(rungs: readonly Rung[], params: RelationParams): LadderCheck {
  const pairs: LadderPair[] = [];
  let incomparable = 0;
  for (let i = 0; i < rungs.length; i += 1) {
    for (let j = i + 1; j < rungs.length; j += 1) {
      const a = rungs[i];
      const b = rungs[j];
      if (a === undefined || b === undefined) continue;
      let antecedent: Rung;
      let consequent: Rung;
      if (rungImplies(a, b)) {
        antecedent = a;
        consequent = b;
      } else if (rungImplies(b, a)) {
        antecedent = b;
        consequent = a;
      } else {
        incomparable += 1;
        continue;
      }
      pairs.push({
        antecedent: antecedent.quote.id,
        consequent: consequent.quote.id,
        result: implicationCheck(antecedent.quote, consequent.quote, params),
      });
    }
  }
  const violations = pairs.filter((p) => p.result.kind === "ok" && cmp(p.result.edge.net, ZERO) > 0);
  return { pairsChecked: pairs.length, incomparablePairs: incomparable, pairs, violations };
}

// ---------------------------------------------------------------------------------------------
// Bucket = difference of two ladder rungs

export interface BucketCheck {
  // Sell G(k1), buy the bucket and buy G(k2): never pays less than 0 when bucket + G(k2) = G(k1).
  readonly longBucket: PackageResult;
  // The reverse: buy G(k1), sell the bucket and sell G(k2).
  readonly shortBucket: PackageResult;
}

// `easier` is G(k1), the lower-threshold rung; `harder` is G(k2), the higher one. The identity
// bucket[k1, k2) = G(k1) - G(k2) holds only if the tie rules at both boundaries are consistent;
// the approved link must record that, this function cannot see it.
export function bucketCheck(bucket: QuotedLeg, easier: QuotedLeg, harder: QuotedLeg, params: RelationParams): BucketCheck {
  const longBucket = priced(
    [
      easier.bid === null ? null : leg(easier, "sell", easier.bid),
      bucket.ask === null ? null : leg(bucket, "buy", bucket.ask),
      harder.ask === null ? null : leg(harder, "buy", harder.ask),
    ],
    ZERO,
    params,
  );
  const shortBucket = priced(
    [
      easier.ask === null ? null : leg(easier, "buy", easier.ask),
      bucket.bid === null ? null : leg(bucket, "sell", bucket.bid),
      harder.bid === null ? null : leg(harder, "sell", harder.bid),
    ],
    ZERO,
    params,
  );
  return { longBucket, shortBucket };
}
