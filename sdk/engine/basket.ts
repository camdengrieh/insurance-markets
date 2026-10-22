// Basket edge: the fee-adjusted, lock-adjusted net edge of a package of legs that together pay a
// known amount, and the marginal depth walk that sizes it (docs/aggregation-design.md 5.0, 5.1,
// 5.2; docs/research/10 section 6.2).
//
// One formula covers the cross-venue complement pair, the within-venue complement, the long and
// short partition sets and an implication hedge. Per basket unit (one share of each leg):
//
//   net = guaranteedPayoff + sum(sell prices) - sum(buy prices)
//         - fees - lock - reserve - haircut
//
// where a buy costs `price + fee` and a sell yields `price - fee` (see unitEconomics for the
// token-fee case), `lock = lockRate x capital`, and capital per leg is the price for a buy and
// `1 - price` (posted collateral) for a sell. The walk takes `min(size)` across every leg's
// current level while the MARGINAL net stays above `tau`, so the best level is never mistaken
// for the size to trade. Fixed costs (gas, bridge) do not depend on the level, so they are
// subtracted from the totals instead of the marginal test.
//
// This is a read-only calculator. It labels nothing and executes nothing.

import type { FeeSpec } from "../model.js";
import type { ParsedLevel } from "./books.js";
import {
  checkFeeSpec,
  fixedCostPerOrder,
  orderFee,
  unitEconomics,
  type FeeResult,
  type FeeRole,
  type Fill,
} from "./fees.js";
import {
  ONE,
  ZERO,
  add,
  cmp,
  div,
  floorRat,
  min,
  mul,
  ratFromInt,
  ratioOrNull,
  sub,
  sum,
  type Rational,
} from "../money/rational.js";

export type LegSide = "buy" | "sell";

export interface BasketLeg {
  readonly id: string;
  readonly side: LegSide;
  // The ladder this leg trades against, best level first: asks for a buy, bids for a sell.
  readonly levels: readonly ParsedLevel[];
  readonly spec: FeeSpec;
  readonly role?: FeeRole;
}

export type LockBase = "price" | "price_plus_fee";

export interface BasketParams {
  // Guaranteed payoff of one basket unit before costs: +1 for a complement or complete long set,
  // n - 1 for buying every NO of an n-way partition, 0 for an implication hedge.
  readonly guaranteedPayoff: Rational;
  // Marginal stopping threshold per share; a level is taken only when its net is strictly above.
  readonly tau: Rational;
  // lambda = rho x T / 365, the capital-lock charge per unit of capital (see edge.ts lockRate).
  readonly lockRate?: Rational;
  // Whether the lock charge also applies to the fee (Examples 2 and 4 do, 1 and 6.2 do not).
  readonly lockBase?: LockBase;
  // Flat per-share allowances: basis plus legging reserve, and resolution-risk haircut delta.
  readonly reservePerShare?: Rational;
  readonly haircutPerShare?: Rational;
  // Fixed cost for the whole package (gas, bridge), in collateral units.
  readonly fixedCost?: Rational;
  readonly maxQty?: Rational;
  // Lot size such as 1 for integer contracts; the taken quantity is cut down to a multiple.
  readonly qtyStep?: Rational;
  readonly nowMs: number;
}

export interface LegPrice {
  readonly id: string;
  readonly side: LegSide;
  readonly price: Rational;
  readonly spec: FeeSpec;
  readonly role?: FeeRole;
}

export interface LevelLeg {
  readonly id: string;
  readonly side: LegSide;
  readonly price: Rational;
  readonly fee: Rational;
  // Cash per delivered share after the fee: price + fee for a buy, price - fee for a sell.
  readonly effective: Rational;
  // Capital tied up per share (price for a buy, 1 - price for a sell), fee excluded.
  readonly capital: Rational;
  readonly settlementContingent: boolean;
}

export interface LevelEdge {
  readonly legs: readonly LevelLeg[];
  readonly gross: Rational;
  readonly fees: Rational;
  readonly lock: Rational;
  readonly reserve: Rational;
  readonly haircut: Rational;
  readonly net: Rational;
}

// Per-share economics at one set of leg prices. This is the closed-form net edge.
export function levelEdge(
  legs: readonly LegPrice[],
  params: Pick<BasketParams, "guaranteedPayoff" | "lockRate" | "lockBase" | "reservePerShare" | "haircutPerShare" | "nowMs">,
): FeeResult<LevelEdge> {
  const out: LevelLeg[] = [];
  let gross = params.guaranteedPayoff;
  for (const leg of legs) {
    const usable = checkFeeSpec(leg.spec, params.nowMs);
    if (!usable.ok) return usable;
    const econ = unitEconomics(leg.spec, leg.role ?? "taker", leg.side, leg.price);
    if (!econ.ok) return econ;
    gross = leg.side === "buy" ? sub(gross, leg.price) : add(gross, leg.price);
    out.push({
      id: leg.id,
      side: leg.side,
      price: leg.price,
      fee: econ.value.fee,
      effective: econ.value.effective,
      capital: leg.side === "buy" ? leg.price : sub(ONE, leg.price),
      settlementContingent: econ.value.settlementContingent,
    });
  }
  const fees = sum(out.map((l) => l.fee));
  const lockBase = params.lockBase ?? "price";
  const capital = sum(out.map((l) => (lockBase === "price_plus_fee" ? add(l.capital, l.fee) : l.capital)));
  const lock = mul(params.lockRate ?? ZERO, capital);
  const reserve = params.reservePerShare ?? ZERO;
  const haircut = params.haircutPerShare ?? ZERO;
  const net = sub(sub(sub(sub(gross, fees), lock), reserve), haircut);
  return { ok: true, value: { legs: out, gross, fees, lock, reserve, haircut, net } };
}

// ---------------------------------------------------------------------------------------------
// Depth walk

export interface BasketStep {
  readonly index: number;
  readonly qty: Rational;
  readonly edge: LevelEdge;
  readonly taken: boolean;
}

export type StopReason = "below_tau" | "depth_exhausted" | "no_depth" | "max_qty";

export interface BasketLegFills {
  readonly id: string;
  readonly side: LegSide;
  readonly fills: readonly Fill[];
  readonly notional: Rational;
}

export interface BasketTotals {
  readonly qty: Rational;
  // Capital deployed excluding fees (buy: price, sell: 1 - price), the base the docs quote
  // returns against.
  readonly capital: Rational;
  readonly gross: Rational;
  readonly fees: Rational;
  readonly netOfFees: Rational;
  readonly lock: Rational;
  readonly reserve: Rational;
  readonly haircut: Rational;
  readonly fixedCost: Rational;
  readonly net: Rational;
  readonly returnOnCapital: Rational | null;
}

export interface BasketOutcome {
  // Steps that were taken, in walk order.
  readonly steps: readonly BasketStep[];
  // The first level that failed the threshold (shown as the "stop" row), if that was the reason.
  readonly rejected: BasketStep | null;
  readonly stopReason: StopReason;
  readonly perLeg: readonly BasketLegFills[];
  readonly totals: BasketTotals;
}

interface Cursor {
  index: number;
  remaining: Rational;
}

// Deliverable size of a level: a token-fee buy delivers (1 - f) of the gross shares.
function deliverable(leg: BasketLeg, level: ParsedLevel): FeeResult<Rational> {
  if (leg.spec.payer !== "outcome_tokens" || leg.side !== "buy") return { ok: true, value: level.size };
  const econ = unitEconomics(leg.spec, leg.role ?? "taker", leg.side, level.price);
  if (!econ.ok) return econ;
  // effective = p / (1 - f)  =>  (1 - f) = p / effective
  return { ok: true, value: mul(level.size, div(level.price, econ.value.effective)) };
}

export function walkBasket(legs: readonly BasketLeg[], params: BasketParams): FeeResult<BasketOutcome> {
  if (legs.length === 0) throw new RangeError("a basket needs at least one leg");
  for (const leg of legs) {
    const usable = checkFeeSpec(leg.spec, params.nowMs);
    if (!usable.ok) return usable;
  }
  let fixed = params.fixedCost ?? ZERO;
  for (const leg of legs) {
    const f = fixedCostPerOrder(leg.spec, leg.role ?? "taker");
    if (!f.ok) return f;
    fixed = add(fixed, f.value);
  }

  const cursors: Cursor[] = [];
  for (const leg of legs) {
    const first = leg.levels[0];
    if (first === undefined) {
      cursors.push({ index: 0, remaining: ZERO });
      continue;
    }
    const size = deliverable(leg, first);
    if (!size.ok) return size;
    cursors.push({ index: 0, remaining: size.value });
  }

  const steps: BasketStep[] = [];
  let rejected: BasketStep | null = null;
  let stopReason: StopReason = "depth_exhausted";
  let total = ZERO;

  for (;;) {
    const current: { leg: BasketLeg; level: ParsedLevel; cursor: Cursor }[] = [];
    let exhausted = false;
    for (let i = 0; i < legs.length; i += 1) {
      const leg = legs[i];
      const cursor = cursors[i];
      const level = leg?.levels[cursor?.index ?? 0];
      if (leg === undefined || cursor === undefined || level === undefined) {
        exhausted = true;
        break;
      }
      current.push({ leg, level, cursor });
    }
    if (exhausted) {
      stopReason = steps.length === 0 && legs.some((l) => l.levels.length === 0) ? "no_depth" : "depth_exhausted";
      break;
    }
    let qty = current[0]?.cursor.remaining ?? ZERO;
    for (const c of current) qty = min(qty, c.cursor.remaining);
    if (params.maxQty !== undefined) {
      const room = sub(params.maxQty, total);
      if (cmp(room, ZERO) <= 0) {
        stopReason = "max_qty";
        break;
      }
      qty = min(qty, room);
    }
    const edge = levelEdge(
      current.map((c) => ({
        id: c.leg.id,
        side: c.leg.side,
        price: c.level.price,
        spec: c.leg.spec,
        ...(c.leg.role === undefined ? {} : { role: c.leg.role }),
      })),
      params,
    );
    if (!edge.ok) return edge;
    if (cmp(edge.value.net, params.tau) <= 0) {
      rejected = { index: steps.length + 1, qty, edge: edge.value, taken: false };
      stopReason = "below_tau";
      break;
    }
    steps.push({ index: steps.length + 1, qty, edge: edge.value, taken: true });
    total = add(total, qty);
    // Advance every cursor by qty; a drained level moves to the next one.
    for (const c of current) {
      c.cursor.remaining = sub(c.cursor.remaining, qty);
      if (cmp(c.cursor.remaining, ZERO) <= 0) {
        c.cursor.index += 1;
        const next = c.leg.levels[c.cursor.index];
        if (next !== undefined) {
          const size = deliverable(c.leg, next);
          if (!size.ok) return size;
          c.cursor.remaining = size.value;
        }
      }
    }
  }

  const trimmed = applyQtyStep(steps, params.qtyStep);
  return { ok: true, value: finalise(legs, trimmed, rejected, stopReason, fixed) };
}

// Cuts the taken quantity down to a multiple of `step`, removing from the last steps first.
function applyQtyStep(steps: readonly BasketStep[], step: Rational | undefined): BasketStep[] {
  if (step === undefined) return [...steps];
  if (cmp(step, ZERO) <= 0) throw new RangeError("qtyStep must be positive");
  const total = sum(steps.map((s) => s.qty));
  const target = mul(ratFromInt(floorRat(div(total, step))), step);
  let remaining = target;
  const out: BasketStep[] = [];
  for (const s of steps) {
    if (cmp(remaining, ZERO) <= 0) break;
    const qty = min(s.qty, remaining);
    out.push({ ...s, qty });
    remaining = sub(remaining, qty);
  }
  return out;
}

function finalise(
  legs: readonly BasketLeg[],
  steps: readonly BasketStep[],
  rejected: BasketStep | null,
  stopReason: StopReason,
  fixed: Rational,
): BasketOutcome {
  const perLeg: BasketLegFills[] = legs.map((leg) => {
    const fills: Fill[] = [];
    for (const s of steps) {
      const l = s.edge.legs.find((x) => x.id === leg.id);
      if (l === undefined) continue;
      const last = fills[fills.length - 1];
      if (last !== undefined && cmp(last.price, l.price) === 0) fills[fills.length - 1] = { price: last.price, qty: add(last.qty, s.qty) };
      else fills.push({ price: l.price, qty: s.qty });
    }
    return { id: leg.id, side: leg.side, fills, notional: sum(fills.map((f) => mul(f.price, f.qty))) };
  });
  const each = (pick: (s: BasketStep) => Rational): Rational => sum(steps.map((s) => mul(pick(s), s.qty)));
  const qty = sum(steps.map((s) => s.qty));
  const capital = each((s) => sum(s.edge.legs.map((l) => l.capital)));
  const gross = each((s) => s.edge.gross);
  const fees = each((s) => s.edge.fees);
  const lock = each((s) => s.edge.lock);
  const reserve = each((s) => s.edge.reserve);
  const haircut = each((s) => s.edge.haircut);
  const netOfFees = sub(gross, fees);
  const fixedCost = cmp(qty, ZERO) > 0 ? fixed : ZERO;
  const net = sub(sub(sub(sub(netOfFees, lock), reserve), haircut), fixedCost);
  return {
    steps,
    rejected,
    stopReason,
    perLeg,
    totals: {
      qty,
      capital,
      gross,
      fees,
      netOfFees,
      lock,
      reserve,
      haircut,
      fixedCost,
      net,
      returnOnCapital: ratioOrNull(net, capital),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Re-pricing the chosen lot with the venue's exact order-level rounding

export interface RepricedBasket {
  readonly smoothFees: Rational;
  readonly roundedFees: Rational;
  readonly perLegFees: readonly { readonly id: string; readonly fee: Rational }[];
  // Net after replacing the smooth fees by the rounded order fees.
  readonly net: Rational;
}

// The walk uses the smooth per-share formula so the marginal test stays linear. Once the lot is
// chosen, fees must be recomputed the way the venue charges them (round once per order). Legs
// that pay their fee in outcome tokens are repriced in delivered shares, an approximation.
export function repriceOrders(legs: readonly BasketLeg[], outcome: BasketOutcome): FeeResult<RepricedBasket> {
  const perLegFees: { id: string; fee: Rational }[] = [];
  for (const leg of legs) {
    const fills = outcome.perLeg.find((p) => p.id === leg.id)?.fills ?? [];
    if (fills.length === 0) {
      perLegFees.push({ id: leg.id, fee: ZERO });
      continue;
    }
    const fee = orderFee(leg.spec, leg.role ?? "taker", leg.side, fills);
    if (!fee.ok) return fee;
    perLegFees.push({ id: leg.id, fee: fee.value });
  }
  const roundedFees = sum(perLegFees.map((p) => p.fee));
  const smoothFees = outcome.totals.fees;
  return {
    ok: true,
    value: { smoothFees, roundedFees, perLegFees, net: sub(outcome.totals.net, sub(roundedFees, smoothFees)) },
  };
}
