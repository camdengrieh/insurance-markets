// Exact linear program for the general no-arbitrage test (docs/research/15 section 4, Appendix
// A). The closed-form checks in relations.ts cover single relations; this solver handles sets
// that combine relations (a composite contract on one venue against single outcomes on another)
// and void/alternative-resolution states, which is how the research shows an apparent
// arbitrage collapses to zero.
//
//   maximize t   s.t.   t <= sum_j A[w][j] (net shares of j) + sum(sell proceeds) - sum(buy cost)
//                       for every state w, with each ladder level bounded by its size.
//
// `x = 0` is feasible with t = 0, so the optimum is never negative and an arbitrage exists iff
// it is strictly positive. Arithmetic is exact (bigint rationals) with Bland's rule, so it
// terminates and never returns a rounding artefact. The duals of the state rows form a
// probability vector over states: the coherent price vector, and a no-arbitrage certificate
// when the optimum is zero. States must include void and alternative-resolution rows explicitly.
// This is a bounded teaching-size solver (tens of states and levels), not a general LP library.

import type { FeeSpec } from "../model.js";
import type { ParsedLevel } from "./books.js";
import { unitEconomics, checkFeeSpec, type FeeErrorCode, type FeeRole } from "./fees.js";
import { ONE, ZERO, add, cmp, div, mul, neg, sub, sum, type Rational } from "../money/rational.js";

export type SimplexResult =
  | { readonly ok: true; readonly value: Rational; readonly x: readonly Rational[]; readonly duals: readonly Rational[] }
  | { readonly ok: false; readonly error: "UNBOUNDED" | "NEGATIVE_RHS" | "ITERATION_LIMIT" | "SHAPE" };

const MAX_PIVOTS = 20_000;

// maximize c.x subject to A x <= b, x >= 0, b >= 0. Returns the optimum, x and the duals of the
// constraint rows (the reduced costs of the slack variables).
export function simplexMax(c: readonly Rational[], A: readonly (readonly Rational[])[], b: readonly Rational[]): SimplexResult {
  const m = A.length;
  const n = c.length;
  if (b.length !== m || A.some((row) => row.length !== n)) return { ok: false, error: "SHAPE" };
  if (b.some((v) => cmp(v, ZERO) < 0)) return { ok: false, error: "NEGATIVE_RHS" };
  const width = n + m + 1;
  const T: Rational[][] = A.map((row, i) => {
    const full: Rational[] = [...row];
    for (let k = 0; k < m; k += 1) full.push(k === i ? ONE : ZERO);
    full.push(b[i] ?? ZERO);
    return full;
  });
  let z: Rational[] = [...c.map(neg), ...new Array<Rational>(m + 1).fill(ZERO)];
  const basis: number[] = Array.from({ length: m }, (_, i) => n + i);
  const at = (row: readonly Rational[], j: number): Rational => row[j] ?? ZERO;

  for (let pivots = 0; ; pivots += 1) {
    if (pivots > MAX_PIVOTS) return { ok: false, error: "ITERATION_LIMIT" };
    // Bland: lowest index with a negative reduced cost.
    let enter = -1;
    for (let j = 0; j < n + m; j += 1) {
      if (cmp(at(z, j), ZERO) < 0) {
        enter = j;
        break;
      }
    }
    if (enter < 0) break;
    let row = -1;
    let bestRatio: Rational | null = null;
    for (let i = 0; i < m; i += 1) {
      const t = T[i];
      if (t === undefined) continue;
      const coef = at(t, enter);
      if (cmp(coef, ZERO) <= 0) continue;
      const ratio = div(at(t, width - 1), coef);
      const better =
        bestRatio === null ||
        cmp(ratio, bestRatio) < 0 ||
        (cmp(ratio, bestRatio) === 0 && (basis[i] ?? 0) < (basis[row] ?? 0));
      if (better) {
        bestRatio = ratio;
        row = i;
      }
    }
    if (row < 0) return { ok: false, error: "UNBOUNDED" };
    const pivotRow = T[row];
    if (pivotRow === undefined) return { ok: false, error: "SHAPE" };
    const piv = at(pivotRow, enter);
    const normalised = pivotRow.map((v) => div(v, piv));
    T[row] = normalised;
    for (let i = 0; i < m; i += 1) {
      const t = T[i];
      if (i === row || t === undefined) continue;
      const f = at(t, enter);
      if (cmp(f, ZERO) === 0) continue;
      T[i] = t.map((v, j) => sub(v, mul(f, at(normalised, j))));
    }
    const fz = at(z, enter);
    z = z.map((v, j) => sub(v, mul(fz, at(normalised, j))));
    basis[row] = enter;
  }

  const x: Rational[] = new Array<Rational>(n).fill(ZERO);
  basis.forEach((bi, i) => {
    if (bi < n) x[bi] = at(T[i] ?? [], width - 1);
  });
  return { ok: true, value: at(z, width - 1), x, duals: z.slice(n, n + m) };
}

// ---------------------------------------------------------------------------------------------
// Arbitrage LP

export type ArbSide = "buy" | "sell";

export interface ArbColumn {
  readonly contract: number;
  readonly side: ArbSide;
  readonly price: Rational;
  readonly size: Rational;
  // Effective cost of a buy (price + fee + lock) or proceeds of a sell (price - fee - lock).
  readonly cost: Rational;
}

export interface ArbTrade {
  readonly contract: number;
  readonly side: ArbSide;
  readonly price: Rational;
  readonly qty: Rational;
}

export interface ArbSolution {
  // Guaranteed profit: the minimum over all states, maximised. Never negative.
  readonly value: Rational;
  readonly trades: readonly ArbTrade[];
  // Dual of each state row. Sums to 1 whenever value > 0.
  readonly statePrices: readonly Rational[];
}

export type ArbError = "UNBOUNDED" | "NEGATIVE_RHS" | "ITERATION_LIMIT" | "SHAPE";

// payoff[w][j] is what one share of contract j pays in state w (fractions allowed for void
// payoffs). `columns` lists every ladder level in the order they should be offered to the solver.
export function solveArbColumns(
  payoff: readonly (readonly Rational[])[],
  columns: readonly ArbColumn[],
): { readonly ok: true; readonly value: ArbSolution } | { readonly ok: false; readonly error: ArbError } {
  const W = payoff.length;
  const k = columns.length;
  const n = k + 1; // last variable is t
  const A: Rational[][] = [];
  const b: Rational[] = [];
  for (let w = 0; w < W; w += 1) {
    const row: Rational[] = [];
    for (const col of columns) {
      const a = payoff[w]?.[col.contract];
      if (a === undefined) return { ok: false, error: "SHAPE" };
      row.push(col.side === "buy" ? sub(col.cost, a) : sub(a, col.cost));
    }
    row.push(ONE);
    A.push(row);
    b.push(ZERO);
  }
  columns.forEach((col, idx) => {
    const row: Rational[] = new Array<Rational>(n).fill(ZERO);
    row[idx] = ONE;
    A.push(row);
    b.push(col.size);
  });
  const objective: Rational[] = [...new Array<Rational>(k).fill(ZERO), ONE];
  const res = simplexMax(objective, A, b);
  if (!res.ok) return res;
  const trades: ArbTrade[] = [];
  columns.forEach((col, idx) => {
    const q = res.x[idx];
    if (q !== undefined && cmp(q, ZERO) !== 0) trades.push({ contract: col.contract, side: col.side, price: col.price, qty: q });
  });
  return { ok: true, value: { value: res.value, trades, statePrices: res.duals.slice(0, W) } };
}

export interface ArbContract {
  // Ladders best first: asks ascending, bids descending.
  readonly asks: readonly ParsedLevel[];
  readonly bids: readonly ParsedLevel[];
  readonly spec: FeeSpec;
  readonly role?: FeeRole;
}

export interface ArbSpecParams {
  readonly payoff: readonly (readonly Rational[])[];
  readonly contracts: readonly ArbContract[];
  // lambda = rho x T / 365 per unit of capital; a buy locks its price, a sell locks 1 - price.
  readonly lockRate?: Rational;
  readonly nowMs: number;
}

// Builds the columns from FeeSpecs (fee-on-top for buys, withheld from sells), then solves.
export function solveArb(
  params: ArbSpecParams,
): { readonly ok: true; readonly value: ArbSolution } | { readonly ok: false; readonly error: ArbError | FeeErrorCode; readonly detail?: string } {
  const lockRate = params.lockRate ?? ZERO;
  const columns: ArbColumn[] = [];
  for (let j = 0; j < params.contracts.length; j += 1) {
    const contract = params.contracts[j];
    if (contract === undefined) continue;
    const usable = checkFeeSpec(contract.spec, params.nowMs);
    if (!usable.ok) return { ok: false, error: usable.code, detail: usable.detail };
    for (const side of ["buy", "sell"] as const) {
      for (const level of side === "buy" ? contract.asks : contract.bids) {
        const econ = unitEconomics(contract.spec, contract.role ?? "taker", side, level.price);
        if (!econ.ok) return { ok: false, error: econ.code, detail: econ.detail };
        const lock = mul(lockRate, side === "buy" ? level.price : sub(ONE, level.price));
        const cost = side === "buy" ? add(econ.value.effective, lock) : sub(econ.value.effective, lock);
        columns.push({ contract: j, side, price: level.price, size: level.size, cost });
      }
    }
  }
  const solved = solveArbColumns(params.payoff, columns);
  return solved.ok ? solved : { ok: false, error: solved.error };
}

// E_pi[A_j] for each contract: where the coherent price vector says contract j should trade.
export function impliedPrices(payoff: readonly (readonly Rational[])[], statePrices: readonly Rational[]): Rational[] {
  const J = payoff[0]?.length ?? 0;
  const out: Rational[] = [];
  for (let j = 0; j < J; j += 1) {
    out.push(sum(payoff.map((row, w) => mul(statePrices[w] ?? ZERO, row[j] ?? ZERO))));
  }
  return out;
}

// P&L of a trade list in one state: sum of qty x (payoff - price) for buys and qty x (price -
// payoff) for sells, minus `fee(trade)` per trade when given. Used to evaluate a plan in states
// it was not optimised for, such as the void rows that wipe out an apparent arbitrage.
export function planPnl(
  trades: readonly ArbTrade[],
  payoffRow: readonly Rational[],
  fee?: (trade: ArbTrade) => Rational,
): Rational {
  let total = ZERO;
  for (const t of trades) {
    const pay = payoffRow[t.contract] ?? ZERO;
    const gross = t.side === "buy" ? mul(t.qty, sub(pay, t.price)) : mul(t.qty, sub(t.price, pay));
    total = add(total, gross);
    if (fee !== undefined) total = sub(total, fee(t));
  }
  return total;
}
