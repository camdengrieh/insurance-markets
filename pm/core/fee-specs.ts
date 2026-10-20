// Builders that turn a venue's raw fee parameters into a FeeSpec using the parameter
// conventions of pm/core/fees.ts. Adapters call these so nobody invents parameter names.
// Every builder takes the provenance of the numbers (url, field, granularity, verifiedAt, ttlSec)
// because a FeeSpec without a source or a read date must fail closed.

import type { Dec, FeeGranularity, FeeSpec } from "../types.js";

export interface FeeSource {
  readonly url: string;
  readonly field: string;
  readonly granularity: FeeGranularity;
  // ISO date the parameters were read.
  readonly verifiedAt: string;
  readonly ttlSec: number;
}

function base(id: string, modelId: FeeSpec["modelId"], source: FeeSource, payer: FeeSpec["payer"]): Omit<FeeSpec, "taker" | "maker" | "rounding"> {
  return {
    id,
    modelId,
    payer,
    paramsSource: { url: source.url, field: source.field, granularity: source.granularity },
    verifiedAt: source.verifiedAt,
    ttlSec: source.ttlSec,
  };
}

// XO: fee = C x bps/10000 x p x (1-p), added to a buy and withheld from a sell. `takerBps` must
// already be the max of /fee-rate and effectiveFeeConfig.takerFeeBps (see reconcileXoFeeBps).
// Rounding direction is not documented; the integer form floors, so the spec floors to 6 places.
export function xoFeeSpec(args: { takerBps: Dec; makerBps?: Dec; source: FeeSource }): FeeSpec {
  return {
    ...base("xo:curve_pq", "curve_pq", args.source, "buyer_adds_seller_withholds"),
    taker: { values: { bps: args.takerBps } },
    ...(args.makerBps === undefined ? {} : { maker: { values: { bps: args.makerBps } } }),
    rounding: "floor:6",
  };
}

// Polymarket (international): C x rate x p x (1-p), taker only, 5 dp, minimum 0.00001. `rate`
// and `exponent` come from the market's own feeSchedule, never from a category default.
// Makers are never charged, so maker is recorded as an explicit zero.
export function polymarketFeeSpec(args: { rate: Dec; exponent?: Dec; source: FeeSource }): FeeSpec {
  const values: Record<string, Dec> = { rate: args.rate };
  if (args.exponent !== undefined) values["exponent"] = args.exponent;
  return {
    ...base("polymarket:curve_pq", "curve_pq", args.source, "buyer_adds_seller_withholds"),
    taker: { values },
    maker: { values: { rate: "0" } },
    rounding: "half_up:5,min:0.00001",
  };
}

// Polymarket US: theta x C x p x (1-p), one flat exchange-wide theta read live.
export function polymarketUsFeeSpec(args: { theta: Dec; source: FeeSource }): FeeSpec {
  return {
    ...base("polymarket_us:curve_pq", "curve_pq", args.source, "buyer_adds_seller_withholds"),
    taker: { values: { rate: args.theta } },
    maker: { values: { rate: "0" } },
    rounding: "half_up:5",
  };
}

// Kalshi: ceil_6dp(0.07 x M x C x p x (1-p)) for takers, then the order is rounded up to the cent
// grid. The cent step is a conservative stand-in for Kalshi's rounding fee and accumulator
// rebate (it can overstate by under one cent per order). `makerFees` is true only for series
// whose fee_type is quadratic_with_maker_fees; leave it undefined when unknown (maker unknown).
export function kalshiFeeSpec(args: { multiplier: Dec; makerFees?: boolean; source: FeeSource }): FeeSpec {
  const spec: FeeSpec = {
    ...base("kalshi:curve_pq", "curve_pq", args.source, "buyer_adds_seller_withholds"),
    taker: { values: { rate: "0.07", multiplier: args.multiplier } },
    rounding: "ceil:6,ceil:2",
  };
  if (args.makerFees === undefined) return spec;
  return { ...spec, maker: { values: args.makerFees ? { rate: "0.0175", multiplier: args.multiplier } : { rate: "0" } } };
}

// Limitless: buy fee is paid in outcome tokens, sell fee in USDC, takers only.
export function limitlessFeeSpec(args: { buyBps: Dec; sellBps: Dec; source: FeeSource }): FeeSpec {
  return {
    ...base("limitless:ad_valorem_bps", "ad_valorem_bps", args.source, "outcome_tokens"),
    taker: { values: { buyBps: args.buyBps, sellBps: args.sellBps } },
    maker: { values: { rate: "0" } },
  };
}

// Predict.fun: base x min(p, 1-p) x shares, makers pay nothing. `feeRateBps` is the per-market
// value signed into the order.
export function predictFunFeeSpec(args: { feeRateBps: Dec; source: FeeSource }): FeeSpec {
  return {
    ...base("predictfun:curve_min", "curve_min", args.source, "buyer_adds_seller_withholds"),
    taker: { values: { bps: args.feeRateBps } },
    maker: { values: { rate: "0" } },
  };
}

// Opinion: taker bps of notional with a minimum fee per order (a non-zero fee is at least
// `minFee`).
export function opinionFeeSpec(args: { takerBps: Dec; minFee: Dec; source: FeeSource }): FeeSpec {
  return {
    ...base("opinion:ad_valorem_bps", "ad_valorem_bps", args.source, "buyer_adds_seller_withholds"),
    taker: { values: { bps: args.takerBps } },
    rounding: `min:${args.minFee}`,
  };
}

// Trueo: Uniswap LP fee plus an admin-settable hook fee. When the price comes from V4Quoter the
// two are already inside it (payer in_pool). hookFee is required; its live value was NOT FOUND,
// so a caller that cannot read it must not build this spec. `gas` is a fixed cost per swap.
export function trueoFeeSpec(args: { lpFee: Dec; hookFee: Dec; extraFee?: Dec; gas?: Dec; source: FeeSource }): FeeSpec {
  const values: Record<string, Dec> = { lpFee: args.lpFee, hookFee: args.hookFee };
  if (args.extraFee !== undefined) values["extraFee"] = args.extraFee;
  if (args.gas !== undefined) values["gas"] = args.gas;
  return {
    ...base("trueo:amm_stack", "amm_stack", args.source, "in_pool"),
    taker: { values },
  };
}

// A venue whose fee is not known. Evaluates to a MODEL_UNKNOWN failure everywhere.
export function unknownFeeSpec(venue: string, source: FeeSource): FeeSpec {
  return { ...base(`${venue}:unknown`, "unknown", source, "buyer_adds_seller_withholds") };
}
