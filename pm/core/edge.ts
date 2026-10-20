// Closed-form edge helpers that sit around the basket walk (docs/aggregation-design.md 5.4 to
// 5.7): capital-lock charge, resolution-risk haircut and scenarios, model (forecast) edge,
// fixed-cost amortisation, and the default parameters chosen in the design ("D" values).
// Everything is exact rational arithmetic.

import {
  ONE,
  ZERO,
  add,
  cmp,
  div,
  dec,
  eq,
  mul,
  ratFromInt,
  sub,
  sum,
  ceilRat,
  type Rational,
} from "./rational.js";

// ---------------------------------------------------------------------------------------------
// Design defaults (marked D in the design: starting points to calibrate, not findings)

export const DEFAULTS = {
  // Marginal stopping threshold, 0.5 cent per share.
  tau: dec("0.005"),
  // Hurdle rate for capital lock, 8% APY (an assumption, not a sourced figure).
  hurdleApy: dec("0.08"),
  // Shrinkage of an external forecast toward the venue mid until 200 resolved forecasts exist.
  lambdaQ: dec("0.25"),
  minResolvedForecastsForLambda: 200,
  // Leg timestamp skew limits.
  maxSkewMsExecutable: 5_000,
  maxSkewMsHedged: 60_000,
} as const;

// Adverse-divergence probability per share, by basis (5.6). null means the pair is never
// priced as an arbitrage because the basis is unresolved.
export const DEFAULT_DELTA = {
  identical: dec("0.005"),
  timing: dec("0.02"),
  settlement_source: dec("0.05"),
  condition_scope: null,
} as const;

// ---------------------------------------------------------------------------------------------
// Capital lock (5.5)

const DAYS_PER_YEAR = ratFromInt(365);

// lambda = rho x T / 365 per unit of capital, T in (possibly fractional) days.
export function lockRate(rhoAnnual: Rational, days: Rational): Rational {
  return div(mul(rhoAnnual, days), DAYS_PER_YEAR);
}

// T = T0 + P(dispute) x Delta, using the latest plausible resolution among the legs.
export function effectiveDays(t0Days: Rational, pDispute: Rational, deltaDays: Rational): Rational {
  return add(t0Days, mul(pDispute, deltaDays));
}

// ---------------------------------------------------------------------------------------------
// Resolution risk (5.6)

// Hedged pair with unit payoff when the legs agree and payoff 0 on an adverse divergence:
// EV = (1 - delta)(1 - C) - delta C = 1 - C - delta. The haircut per share is exactly delta.
export function haircutEv(costPerShare: Rational, delta: Rational): Rational {
  return sub(sub(ONE, costPerShare), delta);
}

export interface Scenario {
  readonly probability: Rational;
  // Total payoff per share of the package in this scenario.
  readonly payoff: Rational;
}

export interface ScenarioResult {
  readonly ev: Rational;
  // Worst case over scenarios with non-zero probability, per share, net of cost.
  readonly worst: Rational;
}

export type ScenarioError = "PROBABILITIES_NOT_ONE" | "NO_SCENARIOS" | "NEGATIVE_PROBABILITY";

export function scenarioEv(
  costPerShare: Rational,
  scenarios: readonly Scenario[],
): { readonly ok: true; readonly value: ScenarioResult } | { readonly ok: false; readonly error: ScenarioError } {
  if (scenarios.length === 0) return { ok: false, error: "NO_SCENARIOS" };
  if (scenarios.some((s) => cmp(s.probability, ZERO) < 0)) return { ok: false, error: "NEGATIVE_PROBABILITY" };
  if (!eq(sum(scenarios.map((s) => s.probability)), ONE)) return { ok: false, error: "PROBABILITIES_NOT_ONE" };
  let ev = ZERO;
  let worst: Rational | null = null;
  for (const s of scenarios) {
    const outcome = sub(s.payoff, costPerShare);
    ev = add(ev, mul(s.probability, outcome));
    if (cmp(s.probability, ZERO) > 0 && (worst === null || cmp(outcome, worst) < 0)) worst = outcome;
  }
  return { ok: true, value: { ev, worst: worst ?? ZERO } };
}

// ---------------------------------------------------------------------------------------------
// Forecast versus price (5.4)

export interface ModelEdgeInput {
  // Ask on the side being bought and the venue mid for the same outcome.
  readonly ask: Rational;
  readonly mid: Rational;
  // The forecast probability for the same outcome (oriented to the venue's token).
  readonly q: Rational;
  // Shrinkage in [0, 1]; use DEFAULTS.lambdaQ until enough forecasts have resolved.
  readonly lambdaQ: Rational;
  readonly feePerShare: Rational;
}

export interface ModelEdge {
  readonly qEff: Rational;
  // EV per share = q_eff - (ask + fee). Directional, never an arbitrage.
  readonly ev: Rational;
}

export function modelEdge(input: ModelEdgeInput): ModelEdge | null {
  if (cmp(input.lambdaQ, ZERO) < 0 || cmp(input.lambdaQ, ONE) > 0) return null;
  const qEff = add(input.mid, mul(input.lambdaQ, sub(input.q, input.mid)));
  return { qEff, ev: sub(qEff, add(input.ask, input.feePerShare)) };
}

// ---------------------------------------------------------------------------------------------
// Fixed costs (5.5, example 4)

// A fixed rebalancing cost spread over N trades per rebalance.
export function amortisedFixedCost(fixedCost: Rational, tradesPerRebalance: Rational): Rational {
  return div(fixedCost, tradesPerRebalance);
}

// Smallest share count at which a fixed cost stays within `maxShareOfProfit` of the profit
// (netPerShare x shares). Exact ratio first; callers round up for a share count.
export function minSharesForFixedCostShare(fixedCost: Rational, netPerShare: Rational, maxShareOfProfit: Rational): Rational | null {
  if (cmp(netPerShare, ZERO) <= 0 || cmp(maxShareOfProfit, ZERO) <= 0) return null;
  return div(fixedCost, mul(maxShareOfProfit, netPerShare));
}

export function ceilShares(value: Rational): bigint {
  return ceilRat(value);
}
