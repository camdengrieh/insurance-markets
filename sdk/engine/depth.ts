// Depth-aware versions of the relation checks: build the basket legs from normalised books and
// run the marginal walk. Thin wrappers; the maths lives in basket.ts.
//
// Executability: a basket is only executable when every leg's book is native. A leg built from a
// complement-derived book (for example the NO side of a YES-only venue) shows the price but
// carries `executable: false`.

import type { Exhaustive, FeeSpec } from "../model.js";
import { walkBasket, type BasketLeg, type BasketOutcome, type BasketParams } from "./basket.js";
import type { ParsedBook } from "./books.js";
import type { FeeResult, FeeRole } from "./fees.js";
import { ONE, ZERO, ratFromInt } from "../money/rational.js";

export interface BookLeg {
  readonly id: string;
  readonly book: ParsedBook;
  readonly spec: FeeSpec;
  readonly role?: FeeRole;
}

export type DepthParams = Omit<BasketParams, "guaranteedPayoff">;

export interface DepthResult {
  readonly outcome: BasketOutcome;
  // False when any leg trades against a complement-derived book.
  readonly executable: boolean;
}

function toLeg(l: BookLeg, side: "buy" | "sell"): BasketLeg {
  return {
    id: l.id,
    side,
    levels: side === "buy" ? l.book.asks : l.book.bids,
    spec: l.spec,
    ...(l.role === undefined ? {} : { role: l.role }),
  };
}

function run(legs: readonly BookLeg[], sides: readonly ("buy" | "sell")[], payoff: BasketParams["guaranteedPayoff"], params: DepthParams): FeeResult<DepthResult> {
  const basket = legs.map((l, i) => toLeg(l, sides[i] ?? "buy"));
  const outcome = walkBasket(basket, { ...params, guaranteedPayoff: payoff });
  if (!outcome.ok) return outcome;
  return { ok: true, value: { outcome: outcome.value, executable: legs.every((l) => l.book.derived === "native") } };
}

// Two buys that together pay exactly 1: a cross-venue pair (YES here, NO there) or a same-venue
// complement. The link registry, not this function, decides whether the pair is really a pair.
export function walkPair(a: BookLeg, b: BookLeg, params: DepthParams): FeeResult<DepthResult> {
  return run([a, b], ["buy", "buy"], ONE, params);
}

// Buy every YES of a set that is exhaustive by rule: pays exactly 1.
export function walkPartitionLong(legs: readonly BookLeg[], exhaustive: Exhaustive, params: DepthParams): FeeResult<DepthResult> | { readonly ok: false; readonly code: "NOT_EXHAUSTIVE"; readonly detail: string } {
  if (exhaustive !== "proven" && exhaustive !== "by_rule") {
    return { ok: false, code: "NOT_EXHAUSTIVE", detail: `long basket needs an exhaustive set, got exhaustive=${exhaustive}` };
  }
  return run(legs, legs.map(() => "buy" as const), ONE, params);
}

// Buy every NO (`legs` hold the NO-token books): pays at least n - 1 when at most one outcome
// resolves YES, so it is valid for exclusive sets whether or not they are exhaustive.
export function walkPartitionShort(noLegs: readonly BookLeg[], params: DepthParams): FeeResult<DepthResult> {
  return run(noLegs, noLegs.map(() => "buy" as const), ratFromInt(noLegs.length - 1), params);
}

// A => B: sell A into its bids, buy B from its asks. The package never pays less than 0.
export function walkImplication(antecedent: BookLeg, consequent: BookLeg, params: DepthParams): FeeResult<DepthResult> {
  return run([antecedent, consequent], ["sell", "buy"], ZERO, params);
}
