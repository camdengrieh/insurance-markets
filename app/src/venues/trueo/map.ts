import { getAddress, sha256, toBytes } from "viem";

import { fromAtomic, toDec, type Qty } from "../../core/money";
import type { Book, Collateral, FeeSpec, Level, Market, MarketRef, MarketSummary, Outcome, OutcomeSummary, Prov, Rules, Status } from "../../core/ports";
import { untrustedField } from "../../core/untrusted";
import { MARKET_STATUS, TRUEO_ADAPTER_VERSION, TRUEO_FEE_TTL_SEC, TRUEO_LIST_TTL_MS, WINNING, type TrueoDeployment } from "./constants";
import { ratioQty, sqrtPriceToPrice } from "./math";
import type { Address } from "./rpc";
import type { MarketData, PoolState } from "./reads";

// Raw chain data -> the port's types. Trueo has no order book: prices come from Uniswap v4 pools, and a "book"
// is a ladder of simulated quotes. All amounts are TYD (an ERC-4626 share over USDC), never dollars.

export const STATUS_NAMES: readonly string[] = ["created", "open_for_resolution", "resolution_proposed", "dispute_raised", "set_by_council", "reset_by_council", "escalated_dispute_raised", "finalized"];

export function collateralOf(deployment: TrueoDeployment): Collateral {
  return { symbol: "TYD", chain: deployment.caip2, decimals: deployment.tydDecimals, custody: "self" };
}

export function marketIdOf(chainId: number, address: Address): string {
  return `${chainId}:${getAddress(address)}`;
}

export function refOf(data: MarketData): MarketRef {
  return {
    venue: "trueo",
    marketId: marketIdOf(data.chainId, data.address),
    native: {
      chain_id: String(data.chainId),
      market: getAddress(data.address),
      yes_token: getAddress(data.yesToken),
      no_token: getAddress(data.noToken),
      yes_pool_id: data.yes.id,
      no_pool_id: data.no.id,
      hook: getAddress(data.hook.address),
      hook_generation: data.hook.generation,
      version: data.version,
    },
  };
}

// The venue's own status, derived from time by the contract. A finalized market is resolved (YES or NO) or
// voided (CANCELED, which pays 0.5 TYD per YES or NO token); any other winning value on a finalized market is
// unknown, never a guess. Pause flags win over a live status.
export function statusOf(data: MarketData): Status {
  switch (data.status) {
    case MARKET_STATUS.Created:
      return data.paused || data.yes.paused === true || data.no.paused === true ? "paused" : "active";
    case MARKET_STATUS.OpenForResolution:
      return "closed";
    case MARKET_STATUS.ResolutionProposed:
    case MARKET_STATUS.SetByCouncil:
      return "determined";
    case MARKET_STATUS.DisputeRaised:
    case MARKET_STATUS.ResetByCouncil:
    case MARKET_STATUS.EscalatedDisputeRaised:
      return "disputed";
    case MARKET_STATUS.Finalized:
      if (data.winning === WINNING.Yes || data.winning === WINNING.No) return "resolved";
      if (data.winning === WINNING.Canceled) return "voided";
      return "unknown";
    default:
      return "unknown";
  }
}

function isoOfSeconds(seconds: bigint): string | null {
  if (seconds <= 0n || seconds > 4_102_444_800n) return null;
  return new Date(Number(seconds) * 1000).toISOString();
}

// ---- prices ---------------------------------------------------------------------------------------------------------------

// TYD per outcome token from the pool's slot0, or null (uninitialised, unreadable, paused, out of bounds).
export function spotPrice(pool: PoolState, token: Address): Qty | null {
  if (pool.sqrtPriceX96 === null || pool.paused !== false) return null;
  const outcomeIsCurrency0 = pool.key.currency0.toLowerCase() === token.toLowerCase();
  return sqrtPriceToPrice(pool.sqrtPriceX96, outcomeIsCurrency0);
}

export function outcomeIsCurrency0(pool: PoolState, token: Address): boolean {
  return pool.key.currency0.toLowerCase() === token.toLowerCase();
}

export function outcomesOf(data: MarketData): readonly Outcome[] {
  // Fixed labels, not read from the chain: the contract has no label for an outcome.
  return [
    { index: 0, role: "yes", label: untrustedField("outcome", "Yes", "trueo"), tokenId: getAddress(data.yesToken) },
    { index: 1, role: "no", label: untrustedField("outcome", "No", "trueo"), tokenId: getAddress(data.noToken) },
  ];
}

export function outcomeSummariesOf(data: MarketData): readonly OutcomeSummary[] {
  const yes = spotPrice(data.yes, data.yesToken);
  const no = spotPrice(data.no, data.noToken);
  return outcomesOf(data).map((outcome, index) => ({ ...outcome, displayPrice: (index === 0 ? yes : no) === null ? null : toDec((index === 0 ? yes : no) as Qty) }));
}

// ---- provenance -------------------------------------------------------------------------------------------------------

export function provOf(nowMs: number, source: string, ttlMs: number): Prov {
  return {
    venue: "trueo",
    source,
    fetchedAtMs: nowMs,
    transport: "T0-RPC",
    freshness: "live",
    ttlMs,
    // On-chain state is public; the terms bar scraping the app, not reading the chain.
    license: "open",
  };
}

export function summaryOf(data: MarketData, nowMs: number): MarketSummary {
  return {
    ref: refOf(data),
    title: untrustedField("title", data.question, "trueo"),
    status: statusOf(data),
    closesAtUtc: isoOfSeconds(data.endOfTrading),
    outcomes: outcomeSummariesOf(data),
    // Volume is not on-chain without scanning swap logs, and the app's JSON is off limits.
    volume: { amount: null, unit: "unknown", windowHours: null },
    prov: provOf(nowMs, `eth_call:${data.chainId}`, TRUEO_LIST_TTL_MS),
  };
}

// ---- rules -------------------------------------------------------------------------------------------------------------

// The text a rules hash is taken over: NFKC-normalised, whitespace collapsed (aggregation-design 2.1). Taken
// before any display bound, so a change past the display cut still changes the hash.
export function normalizeForHash(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function sha256Hex(value: string): string {
  return sha256(toBytes(value)).slice(2);
}

export function rulesOf(data: MarketData): Rules {
  const parts = [data.question];
  if (data.source !== null && data.source !== "") parts.push(`Source: ${data.source}`);
  if (data.additionalInfo !== null && data.additionalInfo !== "") parts.push(`Additional info: ${data.additionalInfo}`);
  const full = parts.join("\n");
  const end = isoOfSeconds(data.endOfTrading);
  return {
    text: untrustedField("rules", full, "trueo"),
    sha256: sha256Hex(normalizeForHash(full)),
    // The source is free text written by the market's creator, so it is inside the text and not listed as a link.
    sources: [],
    mechanism: "optimistic_council",
    ...(end === null ? {} : { cutoffUtc: end }),
    // CANCELED pays 0.5 TYD per YES or NO token held.
    void: "fifty_fifty",
  };
}

export function tradableOf(data: MarketData, yes: Qty | null, no: Qty | null): { readonly ok: boolean; readonly reasons: readonly string[] } {
  const reasons: string[] = [];
  if (data.status !== MARKET_STATUS.Created) reasons.push(`status_${STATUS_NAMES[data.status] ?? "unknown"}`);
  if (data.paused) reasons.push("market_paused");
  if (data.yes.paused === true || data.no.paused === true) reasons.push("pool_paused");
  if (data.yes.paused === null || data.no.paused === null) reasons.push("pool_pause_state_unknown");
  if (yes === null || no === null) reasons.push("price_unavailable");
  return { ok: reasons.length === 0, reasons };
}

// ---- fee ----------------------------------------------------------------------------------------------------------------------

// The all-in fee on a swap is the pool's LP fee (pips, 1e-6) plus the hook's fee (feeNumerator / 10,000), taken
// by the hook in afterSwap from the unspecified currency. A quote already includes both, so the spec says
// "in_pool": a consumer must not add this fee on top of a quoted price. The hook's rate is admin-settable and was
// not readable when the research was written, so it is read every time; any piece that is unreadable, dynamic
// or inconsistent makes the model "unknown" and the aggregator fails closed.
export function feeSpecOf(data: MarketData, hookFee: { readonly numerator: bigint; readonly denominator: bigint } | null, deployment: TrueoDeployment, nowMs: number): FeeSpec {
  const unknown: FeeSpec = {
    modelId: "unknown",
    payer: "in_pool",
    paramsSource: { url: `${deployment.caip2}:${getAddress(data.hook.address)}`, field: "poolKey.fee,hook.feeNumerator,hook.FEE_DENOMINATOR", granularity: "market" },
    verifiedAt: new Date(nowMs).toISOString(),
    ttlSec: 0,
  };
  if (hookFee === null || hookFee.denominator !== 10_000n || hookFee.numerator >= hookFee.denominator) return unknown;
  const yesFee = data.yes.key.fee;
  if (data.yes.dynamicFee || data.no.dynamicFee || data.yes.key.fee !== data.no.key.fee || yesFee >= 1_000_000) return unknown;
  // The pool's live LP fee (slot0) must be the one its key names; an unreadable or different value means this is
  // not the static-fee pool the rate below assumes.
  if (data.yes.lpFee !== yesFee || data.no.lpFee !== yesFee) return unknown;
  // lp / 1e6 + numerator / 1e4, over a common denominator of 1e10.
  const rate = fromAtomic("price", BigInt(yesFee) * 10_000n + hookFee.numerator * 1_000_000n, 10);
  return {
    modelId: "amm_stack",
    taker: { rate: toDec(rate) },
    payer: "in_pool",
    paramsSource: unknown.paramsSource,
    verifiedAt: unknown.verifiedAt,
    ttlSec: TRUEO_FEE_TTL_SEC,
  };
}

// ---- market -----------------------------------------------------------------------------------------------------------

export function marketOf(data: MarketData, hookFee: { readonly numerator: bigint; readonly denominator: bigint } | null, deployment: TrueoDeployment, nowMs: number): Market {
  const yes = spotPrice(data.yes, data.yesToken);
  const no = spotPrice(data.no, data.noToken);
  const end = isoOfSeconds(data.endOfTrading);
  return {
    ref: refOf(data),
    title: untrustedField("title", data.question, "trueo"),
    outcomes: outcomesOf(data),
    rules: rulesOf(data),
    status: statusOf(data),
    tradable: tradableOf(data, yes, no),
    // Trading is not cut off at endOfTrading: it is the earliest a resolution may be proposed.
    timesUtc: end === null ? {} : { closesAt: end },
    // A pool, not a book: the price moves continuously. "0" means no tick grid.
    tick: "0",
    collateral: collateralOf(deployment),
    fee: feeSpecOf(data, hookFee, deployment, nowMs),
    prov: { fetchedAtMs: nowMs, source: `eth_call:${data.chainId}`, adapterVersion: TRUEO_ADAPTER_VERSION, schemaHash: sha256Hex("trueo v2 market: VERSION getCurrentStatus winningPosition paymentToken yesToken noToken getPoolKeys getPoolIds getSlot0 poolPaused") },
  };
}

// ---- books --------------------------------------------------------------------------------------------------------------

export interface LadderPoint {
  // Whole shares quoted (cumulative).
  readonly shares: bigint;
  // TYD, raw 6-decimal units: paid (asks) or received (bids) for exactly `shares`.
  readonly amountRaw: bigint;
}

const LEVEL_SCALE = 9;

// A cumulative ladder of exact quotes becomes marginal levels: the price of the NEXT block of shares is the extra
// TYD divided by the extra shares, so summing level sizes times prices reproduces each quoted total. Asks round
// up and bids round down, so a rounded level is never better than the quote. The ladder ends at the first point
// that is missing or not strictly increasing in cost.
export function levelsFromLadder(points: ReadonlyArray<LadderPoint | null>, side: "asks" | "bids", tydDecimals: number): readonly Level[] {
  const levels: Level[] = [];
  let previous: LadderPoint = { shares: 0n, amountRaw: 0n };
  const unit = 10n ** BigInt(tydDecimals);
  for (const point of points) {
    if (point === null) break;
    const shares = point.shares - previous.shares;
    const amount = point.amountRaw - previous.amountRaw;
    if (shares <= 0n || amount <= 0n) break;
    const price = ratioQty("price", amount, shares * unit, LEVEL_SCALE, side === "asks" ? "ceil" : "floor");
    levels.push({ price: toDec(price), size: shares.toString() });
    previous = point;
  }
  return levels;
}

export function bookOf(token: Address, bids: readonly Level[], asks: readonly Level[], nowMs: number): Book {
  return {
    token: { venue: "trueo", tokenId: getAddress(token) },
    bids,
    asks,
    asOfMs: nowMs,
    // The quotes are simulations against the pool's own state, so this is the pool's executable ladder, not a
    // complement of the other outcome's book.
    derived: "native",
  };
}

