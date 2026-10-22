// Builders that turn a venue's raw fee parameters into a FeeSpec using the parameter
// conventions of fees.ts. Adapters call these so nobody invents parameter names.
// Every builder takes the provenance of the numbers (url, field, granularity, verifiedAt, ttlSec)
// because a FeeSpec without a source or a read date must fail closed.

import type { Dec, FeeGranularity, FeeParams, FeeSpec, FeeSpecId, VenueId } from "../model.js";

// The id a quote names its fee by: the spec's venue and model, for example "xo:curve_pq". Derived, never stored,
// so it cannot claim a model the spec does not carry; an unknown model gives "<venue>:unknown".
export function feeSpecId(spec: Pick<FeeSpec, "venue" | "modelId">): FeeSpecId {
  return `${spec.venue}:${spec.modelId}`;
}

export interface FeeSource {
  readonly url: string;
  readonly field: string;
  readonly granularity: FeeGranularity;
  // ISO date the parameters were read.
  readonly verifiedAt: string;
  readonly ttlSec: number;
}

// The rounding of a venue whose source does not say how the fee is rounded. The engine refuses to price it
// (engine/fees.ts parseRounding), so no fee amount, net cost or executable label is ever derived from a guess.
export const ROUNDING_UNKNOWN = "unknown";

function base(venue: VenueId, modelId: FeeSpec["modelId"], source: FeeSource, payer: FeeSpec["payer"]): Omit<FeeSpec, "taker" | "maker" | "rounding"> {
  return {
    venue,
    modelId,
    payer,
    paramsSource: { url: source.url, field: source.field, granularity: source.granularity },
    verifiedAt: source.verifiedAt,
    ttlSec: source.ttlSec,
  };
}

// XO: fee = C x bps/10000 x p x (1-p) per fill, charged in collateral to the order's maker account: added
// to a buy and withheld from a sell (docs.xo.market/guides/fees and docs.xo.market/product/trading/fees,
// read 2026-10-22: "the base rate is used in the fee curve, rather than charged as a flat percentage";
// integer form with floor division; "Each fill's fee is rounded down separately"). Floor to the micro-dollar,
// once per order here: a sum floored once is never below the venue's per-fill floors, and above them by
// under one micro-dollar per fill. `takerBps` must already be the max of /fee-rate and
// effectiveFeeConfig.takerFeeBps (see reconcileXoFeeBps).
export function xoFeeSpec(args: { takerBps: Dec; makerBps?: Dec; source: FeeSource }): FeeSpec {
  return {
    ...base("xo", "curve_pq", args.source, "buyer_adds_seller_withholds"),
    taker: { bps: args.takerBps },
    ...(args.makerBps === undefined ? {} : { maker: { bps: args.makerBps } }),
    rounding: "floor:6",
  };
}

// Polymarket (international): C x rate x p x (1-p), taker only. `rate` and `exponent` come from the
// market's own feeSchedule, never from a category default. Makers are never charged, so maker is recorded
// as an explicit zero. The rounding MODE is not published: docs.polymarket.com/trading/fees (read
// 2026-10-22) says only "Fees are rounded to 5 decimal places. The smallest fee charged is 0.00001 USDC.
// Anything smaller rounds to zero"; the exchange contract only bounds a fee the operator passes in
// (ctf-exchange-v2 src/exchange/mixins/Fees.sol validateFee), and the official client estimates with floats
// (clob-client-v2 src/fees). So the spec carries ROUNDING_UNKNOWN and the engine does not price it.
export function polymarketFeeSpec(args: { rate: Dec; exponent?: Dec; source: FeeSource }): FeeSpec {
  const taker: FeeParams = { rate: args.rate, ...(args.exponent === undefined ? {} : { exponent: args.exponent }) };
  return {
    ...base("polymarket", "curve_pq", args.source, "buyer_adds_seller_withholds"),
    taker,
    maker: { rate: "0" },
    rounding: ROUNDING_UNKNOWN,
  };
}

// Polymarket US: theta x C x p x (1-p), one flat exchange-wide theta read live.
export function polymarketUsFeeSpec(args: { theta: Dec; source: FeeSource }): FeeSpec {
  return {
    ...base("polymarket_us", "curve_pq", args.source, "buyer_adds_seller_withholds"),
    taker: { rate: args.theta },
    maker: { rate: "0" },
    rounding: "half_up:5",
  };
}

// Kalshi: trade fee = ceil_6dp(0.07 x M x C x p x (1-p)) for takers, then a rounding fee that puts the
// member's balance change back on its grid: $0.01 for non-direct members, $0.0001 for direct ones
// (docs.kalshi.com/getting_started/fee_rounding, read 2026-10-22). The spec aligns to the cent, the coarser
// grid, so a direct member's fee is never understated; for one fill it reproduces the page's worked example
// (0.055 of revenue, model fee 0.00363825, net fee 0.005). The fee accumulator makes an order cost what one
// equivalent fill would; what it leaves unrebated at the end of a multi-fill order (under one grid unit, and
// up to $0.000001 per fill of separate ceilings) is not modelled. The 0.07 coefficient is from third-party
// guides (sdk/venues/kalshi/constants.ts KALSHI_TAKER_COEFFICIENT). `makerFees` is true only for series
// whose fee_type is quadratic_with_maker_fees; leave it undefined when unknown (maker unknown).
export function kalshiFeeSpec(args: { multiplier: Dec; makerFees?: boolean; source: FeeSource }): FeeSpec {
  const spec: FeeSpec = {
    ...base("kalshi", "curve_pq", args.source, "buyer_adds_seller_withholds"),
    taker: { rate: "0.07", multiplier: args.multiplier },
    rounding: "ceil:6,align:2",
  };
  if (args.makerFees === undefined) return spec;
  return { ...spec, maker: args.makerFees ? { rate: "0.0175", multiplier: args.multiplier } : { rate: "0" } };
}

// Limitless: buy fee is paid in outcome tokens, sell fee in USDC, takers only.
export function limitlessFeeSpec(args: { buyBps: Dec; sellBps: Dec; source: FeeSource }): FeeSpec {
  return {
    ...base("limitless", "ad_valorem_bps", args.source, "outcome_tokens"),
    taker: { buyBps: args.buyBps, sellBps: args.sellBps },
    maker: { rate: "0" },
  };
}

// Predict.fun: base x min(p, 1-p) x shares, makers pay nothing. `feeRateBps` is the per-market
// value signed into the order.
export function predictFunFeeSpec(args: { feeRateBps: Dec; source: FeeSource }): FeeSpec {
  return {
    ...base("predictfun", "curve_min", args.source, "buyer_adds_seller_withholds"),
    taker: { bps: args.feeRateBps },
    maker: { rate: "0" },
  };
}

// Opinion: taker bps of notional with a minimum fee per order (a non-zero fee is at least
// `minFee`).
export function opinionFeeSpec(args: { takerBps: Dec; minFee: Dec; source: FeeSource }): FeeSpec {
  return {
    ...base("opinion", "ad_valorem_bps", args.source, "buyer_adds_seller_withholds"),
    taker: { bps: args.takerBps },
    rounding: `min:${args.minFee}`,
  };
}

// Trueo: Uniswap LP fee (poolKey.fee / 1e6) plus the hook's fee (feeNumerator / FEE_DENOMINATOR), both
// read on chain per pool. The hook takes its fee in afterSwap through the return delta, so V4Quoter, which
// simulates the hook, already quotes both (payer in_pool, docs/research/11 section 6 and verification row 8):
// nothing is added on top and nothing is rounded beyond the pool's own integer swap maths, which is inside
// the quote. A caller that cannot read either part must not build this spec. `gas` is a fixed cost per swap.
export function trueoFeeSpec(args: { lpFee: Dec; hookFee: Dec; extraFee?: Dec; gas?: Dec; source: FeeSource }): FeeSpec {
  const taker: FeeParams = {
    lpFee: args.lpFee,
    hookFee: args.hookFee,
    ...(args.extraFee === undefined ? {} : { extraFee: args.extraFee }),
    ...(args.gas === undefined ? {} : { gas: args.gas }),
  };
  return {
    ...base("trueo", "amm_stack", args.source, "in_pool"),
    taker,
  };
}

// A venue whose fee is not known. Evaluates to a MODEL_UNKNOWN failure everywhere.
export function unknownFeeSpec(venue: VenueId, source: FeeSource): FeeSpec {
  return { ...base(venue, "unknown", source, "buyer_adds_seller_withholds") };
}
