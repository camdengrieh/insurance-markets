// Fixed words for the market page: closed enums become sentences written by this app, so no venue text decides what a
// label says. Each map is a typed Record, so the compiler fails when ports.ts adds a member.

import { qtyOfDec, splitDecimal } from "../../core/money";
import type { Collateral, FeeModelId, FeeParams, FeeSpec, Market, ResolutionMechanism, VoidPolicy } from "../../core/ports";

export const MECHANISM_TEXT: Readonly<Record<ResolutionMechanism, string>> = Object.freeze({
  uma_oo: "UMA optimistic oracle (a proposal can be disputed)",
  chainlink: "Chainlink data feed",
  exchange: "decided by the venue itself",
  xo_manual_modra: "XO's manual resolution by the market's resolver",
  pyth: "Pyth data feed",
  external_parity: "follows another venue's result",
  optimistic_council: "optimistic result with a council as the last word",
  protocol_mark: "the protocol's own mark",
  unknown: "not stated or not recognised",
});

export const VOID_TEXT: Readonly<Record<VoidPolicy, string>> = Object.freeze({
  fifty_fifty: "a voided market pays 50 / 50",
  refund: "a voided market is refunded",
  last_traded_price: "a voided market settles at the last traded price",
  scalar: "a voided market settles on a scalar value",
  invalid_reverse_trades: "a voided market reverses its trades",
  unknown: "not stated: read the rules text",
});

export const MODEL_TEXT: Readonly<Record<FeeModelId, string>> = Object.freeze({
  curve_pq: "a curve in price and quantity (fee depends on how far the price is from 0 or 1)",
  curve_min: "a curve with a minimum fee",
  ad_valorem_bps: "a percentage of the amount, in basis points",
  profit_pct: "a percentage of profit",
  amm_stack: "built into the pool's price (the quote already includes it)",
  unknown: "unknown: no net-of-fee number is shown anywhere",
});

export const PAYER_TEXT: Readonly<Record<FeeSpec["payer"], string>> = Object.freeze({
  buyer_adds_seller_withholds: "the buyer pays on top; the seller has it withheld",
  outcome_tokens: "taken from the outcome tokens",
  in_pool: "inside the pool price",
});

export const CUSTODY_TEXT: Readonly<Record<Collateral["custody"], string>> = Object.freeze({
  self: "held by you",
  smart_account: "held in your smart account",
  venue: "held by the venue",
  broker: "held by a broker",
});

// A decimal the venue reported (the shared grammar, sign allowed), shown only if it is one.
export function safeDecimal(value: string | undefined): string | null {
  return value !== undefined && splitDecimal(value, { allowNegative: true }).ok ? value : null;
}

export function feeParamLines(label: string, params: FeeParams | undefined): string[] {
  if (params === undefined) return [];
  const lines: string[] = [];
  const rate = safeDecimal(params.rate);
  if (rate !== null) lines.push(`${label} rate ${rate}`);
  const bps = safeDecimal(params.bps);
  if (bps !== null && !bps.startsWith("-")) lines.push(`${label} ${bps} basis points`);
  const multiplier = safeDecimal(params.multiplier);
  if (multiplier !== null) lines.push(`${label} multiplier ${multiplier}`);
  const exponent = safeDecimal(params.exponent);
  if (exponent !== null) lines.push(`${label} exponent ${exponent}`);
  // amm_stack parts, as fractions of the amount (Trueo: the pool's LP fee and the hook's fee).
  const lpFee = safeDecimal(params.lpFee);
  if (lpFee !== null) lines.push(`${label} pool fee ${lpFee}`);
  const hookFee = safeDecimal(params.hookFee);
  if (hookFee !== null) lines.push(`${label} hook fee ${hookFee}`);
  const extraFee = safeDecimal(params.extraFee);
  if (extraFee !== null) lines.push(`${label} extra fee ${extraFee}`);
  return lines;
}

export interface FeeView {
  readonly model: string;
  readonly known: boolean;
  readonly lines: readonly string[];
  readonly payer: string;
  readonly ttlSec: number | null;
  readonly verifiedAt: string | null;
}

export function feeView(spec: FeeSpec): FeeView {
  const known = spec.modelId !== "unknown" && Object.hasOwn(MODEL_TEXT, spec.modelId);
  return {
    model: Object.hasOwn(MODEL_TEXT, spec.modelId) ? MODEL_TEXT[spec.modelId] : MODEL_TEXT.unknown,
    known,
    lines: known ? [...feeParamLines("taker", spec.taker), ...feeParamLines("maker", spec.maker)] : [],
    payer: Object.hasOwn(PAYER_TEXT, spec.payer) ? PAYER_TEXT[spec.payer] : "not stated",
    ttlSec: Number.isFinite(spec.ttlSec) && spec.ttlSec >= 0 ? spec.ttlSec : null,
    verifiedAt: typeof spec.verifiedAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(spec.verifiedAt) ? spec.verifiedAt.slice(0, 10) : null,
  };
}

// Adapter reasons are short fixed tokens; anything else is withheld rather than shown.
const REASON = /^[a-z0-9][a-z0-9_:. -]{0,59}$/i;
export function safeReasons(reasons: readonly string[]): string[] {
  return reasons.map((reason) => (REASON.test(reason) ? reason.replace(/[_:]/g, " ") : "another reason (withheld)"));
}

export type Tick = Market["tick"];

export function tickLines(tick: Tick): string[] {
  if (typeof tick === "string") {
    const dec = safeDecimal(tick);
    return dec === null || qtyOfDec("price", dec) === null ? [] : [`${dec}`];
  }
  return tick.flatMap((range) => {
    const from = safeDecimal(range.from);
    const to = safeDecimal(range.to);
    const step = safeDecimal(range.tick);
    return from === null || to === null || step === null ? [] : [`${step} from ${from} to ${to}`];
  });
}
