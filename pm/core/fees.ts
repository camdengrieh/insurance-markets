// FeeSpec evaluation (docs/aggregation-design.md section 3.3, docs/research/10 section 6.1 and its
// verification V3/V6/V7). A FeeSpec names a model and carries named decimal parameters; this
// module is the only place that knows what the parameter names mean.
//
// Parameter conventions (all values are plain decimal strings):
//   rate        fee coefficient as a fraction, "0.04"          } exactly one of rate / bps,
//   bps         fee coefficient in basis points, "400"          } never both (ambiguous)
//   multiplier  optional factor on the coefficient (Kalshi fee_multiplier), default "1"
//   exponent    curve_pq only; anything but "1" fails closed (never observed otherwise)
//   buyBps / sellBps   ad_valorem_bps side overrides (Limitless buy and sell fees differ)
//   lpFee, hookFee, extraFee   amm_stack fractions (lpFee and hookFee are required)
//
// `rounding` is a comma separated list of steps applied in order to the ORDER-LEVEL fee:
//   "ceil:6" "floor:6" "half_up:5" "half_even:5" "trunc:6"   round to that many decimals
//   "min:0.00001"                                             floor of a non-zero fee
//   "none" or absent                                          exact, no rounding
//
// Everything unknown fails closed with a code; nothing here ever guesses a fee.

import type { Dec, FeeParams, FeeSpec } from "../types.js";
import {
  ONE,
  ZERO,
  add,
  cmp,
  div,
  eq,
  isZero,
  max,
  min,
  mul,
  ratFromDec,
  roundToGrid,
  sub,
  sum,
  type Rational,
  type RoundMode,
} from "./rational.js";

export type FeeErrorCode =
  | "MODEL_UNKNOWN"
  | "PARAMS_MISSING"
  | "PARAMS_INVALID"
  | "SPEC_STALE"
  | "SPEC_TIME_INVALID"
  | "ROUNDING_UNSUPPORTED"
  | "EXPONENT_UNSUPPORTED"
  | "PRICE_INVALID";

export type FeeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: FeeErrorCode; readonly detail: string };

function fail(code: FeeErrorCode, detail: string): { readonly ok: false; readonly code: FeeErrorCode; readonly detail: string } {
  return { ok: false, code, detail };
}

function ok<T>(value: T): FeeResult<T> {
  return { ok: true, value };
}

export type FeeRole = "taker" | "maker";
export type FeeSide = "buy" | "sell";

// ---------------------------------------------------------------------------------------------
// Spec validity

const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

// A spec is usable only when its model is known and its parameters were read recently enough.
// `nowMs` is injected so tests and callers control the clock.
export function checkFeeSpec(spec: FeeSpec, nowMs: number): FeeResult<FeeSpec> {
  if (spec.modelId === "unknown") return fail("MODEL_UNKNOWN", `fee model unknown for ${spec.id}`);
  if (!Number.isInteger(spec.ttlSec) || spec.ttlSec <= 0) return fail("SPEC_TIME_INVALID", "ttlSec must be a positive integer");
  const verified = Date.parse(spec.verifiedAt);
  if (!Number.isFinite(verified)) return fail("SPEC_TIME_INVALID", "verifiedAt is not a valid date");
  if (verified > nowMs + MAX_FUTURE_SKEW_MS) return fail("SPEC_TIME_INVALID", "verifiedAt is in the future");
  if (nowMs > verified + spec.ttlSec * 1000) return fail("SPEC_STALE", `fee parameters for ${spec.id} are past their ttl`);
  return ok(spec);
}

// ---------------------------------------------------------------------------------------------
// Rounding steps

export type RoundingStep =
  | { readonly kind: "round"; readonly mode: RoundMode; readonly places: number }
  | { readonly kind: "min"; readonly floor: Rational };

const ROUND_MODES: readonly RoundMode[] = ["ceil", "floor", "trunc", "half_up", "half_even"];

export function parseRounding(text: string | undefined): FeeResult<readonly RoundingStep[]> {
  if (text === undefined || text === "" || text === "none") return ok([]);
  const steps: RoundingStep[] = [];
  for (const raw of text.split(",")) {
    const part = raw.trim();
    const colon = part.indexOf(":");
    if (colon < 0) return fail("ROUNDING_UNSUPPORTED", "rounding step needs a colon");
    const head = part.slice(0, colon);
    const arg = part.slice(colon + 1);
    if (head === "min") {
      const floor = ratFromDec(arg);
      if (!floor.ok) return fail("ROUNDING_UNSUPPORTED", "min step needs a decimal");
      steps.push({ kind: "min", floor: floor.value });
      continue;
    }
    const mode = ROUND_MODES.find((m) => m === head);
    if (mode === undefined || !/^[0-9]{1,2}$/.test(arg)) return fail("ROUNDING_UNSUPPORTED", "unknown rounding step");
    steps.push({ kind: "round", mode, places: Number(arg) });
  }
  return ok(steps);
}

export function applyRounding(raw: Rational, steps: readonly RoundingStep[]): Rational {
  let value = raw;
  for (const step of steps) {
    if (step.kind === "round") value = roundToGrid(value, step.places, step.mode);
    else if (cmp(raw, ZERO) > 0) value = max(value, step.floor);
  }
  return value;
}

// ---------------------------------------------------------------------------------------------
// Parameter access

function readParam(params: FeeParams, name: string): FeeResult<Rational | undefined> {
  const text = params.values[name];
  if (text === undefined) return ok(undefined);
  const parsed = ratFromDec(text);
  if (!parsed.ok) return fail("PARAMS_INVALID", `fee parameter ${name}: ${parsed.reason}`);
  return ok(parsed.value);
}

function requireParam(params: FeeParams, name: string): FeeResult<Rational> {
  const value = readParam(params, name);
  if (!value.ok) return value;
  if (value.value === undefined) return fail("PARAMS_MISSING", `fee parameter ${name} is missing`);
  return ok(value.value);
}

function paramsFor(spec: FeeSpec, role: FeeRole): FeeResult<FeeParams> {
  const params = role === "taker" ? spec.taker : spec.maker;
  // A missing role is unknown, never zero. Zero must be stated as { rate: "0" }.
  if (params === undefined) return fail("PARAMS_MISSING", `${role} fee parameters are not recorded for ${spec.id}`);
  return ok(params);
}

const BPS_DENOMINATOR = 10_000n;

// Reads rate or bps (never both), applies the optional multiplier, and range-checks to [0, 1].
function coefficient(params: FeeParams): FeeResult<Rational> {
  const rate = readParam(params, "rate");
  if (!rate.ok) return rate;
  const bps = readParam(params, "bps");
  if (!bps.ok) return bps;
  if (rate.value !== undefined && bps.value !== undefined) return fail("PARAMS_INVALID", "both rate and bps given");
  let base: Rational;
  if (rate.value !== undefined) base = rate.value;
  else if (bps.value !== undefined) base = div(bps.value, { n: BPS_DENOMINATOR, d: 1n });
  else return fail("PARAMS_MISSING", "neither rate nor bps given");
  const mult = readParam(params, "multiplier");
  if (!mult.ok) return mult;
  const value = mult.value === undefined ? base : mul(base, mult.value);
  if (cmp(value, ONE) > 0) return fail("PARAMS_INVALID", "fee coefficient above 1");
  return ok(value);
}

// ---------------------------------------------------------------------------------------------
// Smooth per-share fee

function checkPrice(price: Rational): FeeResult<Rational> {
  if (cmp(price, ZERO) <= 0 || cmp(price, ONE) >= 0) return fail("PRICE_INVALID", "price must be strictly between 0 and 1");
  return ok(price);
}

// Exact, unrounded fee for one share filled at `price`, in collateral units. For `profit_pct`
// the fee is charged on the winning profit at settlement; the value returned is the worst case
// (the share wins), so costs are never understated.
export function feePerShare(spec: FeeSpec, role: FeeRole, side: FeeSide, price: Rational): FeeResult<Rational> {
  const p = checkPrice(price);
  if (!p.ok) return p;
  if (spec.modelId === "unknown") return fail("MODEL_UNKNOWN", `fee model unknown for ${spec.id}`);
  const params = paramsFor(spec, role);
  if (!params.ok) return params;
  const q = sub(ONE, price);
  switch (spec.modelId) {
    case "curve_pq": {
      const exponent = readParam(params.value, "exponent");
      if (!exponent.ok) return exponent;
      if (exponent.value !== undefined && !eq(exponent.value, ONE)) {
        return fail("EXPONENT_UNSUPPORTED", "only exponent 1 is verified; refusing to price");
      }
      const c = coefficient(params.value);
      if (!c.ok) return c;
      return ok(mul(c.value, mul(price, q)));
    }
    case "curve_min": {
      const c = coefficient(params.value);
      if (!c.ok) return c;
      return ok(mul(c.value, min(price, q)));
    }
    case "ad_valorem_bps": {
      const sideBps = readParam(params.value, side === "buy" ? "buyBps" : "sellBps");
      if (!sideBps.ok) return sideBps;
      let c: FeeResult<Rational>;
      if (sideBps.value !== undefined) {
        // A side-specific override replaces the generic coefficient; the multiplier still applies.
        const mult = readParam(params.value, "multiplier");
        if (!mult.ok) return mult;
        const base = div(sideBps.value, { n: BPS_DENOMINATOR, d: 1n });
        c = ok(mult.value === undefined ? base : mul(base, mult.value));
      } else {
        c = coefficient(params.value);
      }
      if (!c.ok) return c;
      if (cmp(c.value, ONE) > 0) return fail("PARAMS_INVALID", "fee coefficient above 1");
      return ok(mul(c.value, price));
    }
    case "profit_pct": {
      const c = coefficient(params.value);
      if (!c.ok) return c;
      return ok(mul(c.value, q));
    }
    case "amm_stack": {
      const lp = requireParam(params.value, "lpFee");
      if (!lp.ok) return lp;
      const hook = requireParam(params.value, "hookFee");
      if (!hook.ok) return hook;
      const extra = readParam(params.value, "extraFee");
      if (!extra.ok) return extra;
      // When the quote already comes from the pool (payer in_pool) the LP and hook fees are
      // inside the price; only an explicit extra fee is added on top.
      const stack = spec.payer === "in_pool" ? ZERO : add(lp.value, hook.value);
      return ok(mul(add(stack, extra.value ?? ZERO), price));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Per-share economics (fee-on-top versus net)

export interface UnitEconomics {
  readonly price: Rational;
  // Fee per delivered share in collateral units (cash equivalent).
  readonly fee: Rational;
  // Buy: all-in cost per delivered share. Sell: proceeds per share after the fee.
  readonly effective: Rational;
  // True when the fee is only charged in some outcomes (profit_pct), so `fee` is a worst case.
  readonly settlementContingent: boolean;
}

export function unitEconomics(spec: FeeSpec, role: FeeRole, side: FeeSide, price: Rational): FeeResult<UnitEconomics> {
  const raw = feePerShare(spec, role, side, price);
  if (!raw.ok) return raw;
  const contingent = spec.modelId === "profit_pct";
  if (spec.payer === "outcome_tokens" && side === "buy") {
    // The fee is withheld as a fraction f of the bought shares: paying p per gross share
    // delivers (1 - f) shares, so the cost per delivered share is p / (1 - f).
    const f = div(raw.value, price);
    if (cmp(f, ONE) >= 0) return fail("PARAMS_INVALID", "token fee fraction must be below 1");
    const effective = div(price, sub(ONE, f));
    return ok({ price, fee: sub(effective, price), effective, settlementContingent: contingent });
  }
  if (side === "buy") return ok({ price, fee: raw.value, effective: add(price, raw.value), settlementContingent: contingent });
  return ok({ price, fee: raw.value, effective: sub(price, raw.value), settlementContingent: contingent });
}

// ---------------------------------------------------------------------------------------------
// Order-level fee with the venue's rounding

export interface Fill {
  readonly price: Rational;
  readonly qty: Rational;
}

// Sums the exact fee over all fills of one order and rounds once, which is how Kalshi
// accumulates an order's fills. Venues that round per fill differ by at most half a rounding
// unit per fill; callers needing that precision must price fills as separate orders.
export function orderFee(spec: FeeSpec, role: FeeRole, side: FeeSide, fills: readonly Fill[]): FeeResult<Rational> {
  const steps = parseRounding(spec.rounding);
  if (!steps.ok) return steps;
  const parts: Rational[] = [];
  for (const fill of fills) {
    if (cmp(fill.qty, ZERO) <= 0) return fail("PARAMS_INVALID", "fill quantity must be positive");
    const per = feePerShare(spec, role, side, fill.price);
    if (!per.ok) return per;
    parts.push(mul(per.value, fill.qty));
  }
  const smooth = sum(parts);
  // A zero fee stays zero: the minimum only applies to a charged fee.
  if (isZero(smooth)) return ok(ZERO);
  return ok(applyRounding(smooth, steps.value));
}

// Fixed cost per order in collateral units (gas); zero unless the spec records one.
export function fixedCostPerOrder(spec: FeeSpec, role: FeeRole = "taker"): FeeResult<Rational> {
  const params = role === "taker" ? spec.taker : spec.maker;
  if (params === undefined) return ok(ZERO);
  const gas = readParam(params, "gas");
  if (!gas.ok) return gas;
  return ok(gas.value ?? ZERO);
}

// ---------------------------------------------------------------------------------------------
// XO specifics (docs/research/10 V3)

export interface XoFeeReconciliation {
  // max of every known source; null when no source is known.
  readonly bps: Dec | null;
  // True only when both sources are present and equal. XO's /fee-rate and the Data API
  // effectiveFeeConfig disagreed live (0 versus 400 bps), so anything else is unreconciled.
  readonly agreed: boolean;
  readonly sourcesKnown: number;
}

export function reconcileXoFeeBps(feeRateEndpoint: Dec | null, effectiveTakerFeeBps: Dec | null): XoFeeReconciliation {
  const values: Rational[] = [];
  for (const text of [feeRateEndpoint, effectiveTakerFeeBps]) {
    if (text === null) continue;
    const parsed = ratFromDec(text);
    if (parsed.ok) values.push(parsed.value);
  }
  if (values.length === 0) return { bps: null, agreed: false, sourcesKnown: 0 };
  let top = values[0] ?? ZERO;
  for (const v of values) top = max(top, v);
  const bps = top.d === 1n ? top.n.toString() : null;
  const agreed = values.length === 2 && eq(values[0] ?? ZERO, values[1] ?? ONE);
  return { bps, agreed, sourcesKnown: values.length };
}

// XO's documented integer form: fee_micro = feeBps * C * tick * (1000 - tick) / (10_000 * 1000 *
// 1000) with C in micro-shares, tick in 1..999 (price = tick / 1000) and the result in
// micro-collateral. Integer division floors. The docs do not say which direction XO rounds in
// practice, so reconcile against one real fill before trusting the last micro-unit.
export function xoFeeMicro(feeBps: bigint, cMicroShares: bigint, tick: bigint): bigint {
  if (feeBps < 0n || cMicroShares < 0n || tick <= 0n || tick >= 1000n) throw new RangeError("xoFeeMicro input out of range");
  return (feeBps * cMicroShares * tick * (1000n - tick)) / (BPS_DENOMINATOR * 1000n * 1000n);
}
