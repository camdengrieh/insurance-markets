import { sha256, toBytes } from "viem";

import { addQty, cmpQty, fromAtomic, subQty, toDec, type Qty } from "../../money/qty.js";
import type { Book, Collateral, FeeSpec, Level, Market, MarketRef, MarketSummary, Outcome, OutcomeSummary, Prov, Rules, Status, TickRanges } from "../../model.js";
import { untrustedField } from "../../text.js";
import {
  PASCAL_ADAPTER_VERSION,
  PASCAL_API_BASE,
  PASCAL_CHAIN,
  PASCAL_COLLATERAL_DECIMALS,
  PASCAL_COLLATERAL_SYMBOL,
  PASCAL_FEE_TTL_SEC,
  PASCAL_LIST_TTL_MS,
} from "./constants.js";
import { ONE_PRICE, type PascalRow } from "./rows.js";
import { tickFor } from "./tick.js";

export const SCHEMA_DESCRIPTOR = "pascal markets v1: symbol taker_fee_rate maker_rebate_share tick_size_min tick_sig_figs display_attributes best_bid best_ask";
export const PASCAL_SCHEMA_HASH = sha256(toBytes(SCHEMA_DESCRIPTOR)).slice(2);

export const COLLATERAL: Collateral = Object.freeze({ symbol: PASCAL_COLLATERAL_SYMBOL, chain: PASCAL_CHAIN, decimals: PASCAL_COLLATERAL_DECIMALS, custody: "venue" });

export type Side = "long" | "short";

// There are no outcome tokens. The id of a side is the market symbol and the side; symbols hold no "#".
export function tokenIdOf(symbol: string, side: Side): string {
  return `${symbol}#${side}`;
}

export function parseTokenId(tokenId: string): { readonly symbol: string; readonly side: Side } | null {
  const at = tokenId.lastIndexOf("#");
  if (at <= 0) return null;
  const side = tokenId.slice(at + 1);
  if (side !== "long" && side !== "short") return null;
  return { symbol: tokenId.slice(0, at), side };
}

export function isoOrNull(ms: number | null): string | null {
  if (ms === null) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function refOf(row: PascalRow): MarketRef {
  const native: Record<string, string> = { symbol: row.symbol, event: row.event };
  if (row.reference !== null) {
    native.polymarket_slug = row.reference.market_slug;
    native.polymarket_condition_id = row.reference.condition_id;
    // The Polymarket token that wins when this Pascal market settles to 1 (the long side), and its reverse.
    native.polymarket_long_token_id = row.reference.market_outcome_token_id;
    native.polymarket_short_token_id = row.reference.reverse_outcome_token_id;
  }
  return { venue: "pascal", marketId: row.symbol, native };
}

// `/markets` lists unresolved markets and gives no trading-state field, so "active" is the most the list can
// say; past the expected resolution time the state is unknown (the market may be awaiting resolution).
export function statusOf(row: PascalRow, nowMs: number): Status {
  if (row.expectedResolutionMs !== null && nowMs > row.expectedResolutionMs) return "unknown";
  return "active";
}

// ---- prices ------------------------------------------------------------------------------------------------------------------

// Mid of a two-sided, uncrossed top of book; null otherwise. A display price, never an executable one.
export function isCrossedPair(bid: Qty, ask: Qty): boolean {
  return cmpQty(bid, ask) >= 0;
}

export function midOf(bid: Qty | null, ask: Qty | null): Qty | null {
  if (bid === null || ask === null || isCrossedPair(bid, ask)) return null;
  const sum = addQty(bid, ask);
  return fromAtomic("price", sum.atomic * 5n, sum.scale + 1);
}

export function complement(price: Qty): Qty {
  return subQty(ONE_PRICE, price);
}

// ---- outcomes -------------------------------------------------------------------------------------------------------------------

function roleFor(row: PascalRow, side: Side): "yes" | "no" | "label" {
  // A scalar market has no yes or no, and neither does one whose labels are named or not understood.
  if (row.scalar !== null || row.labels.kind !== "default") return "label";
  return side === "long" ? "yes" : "no";
}

function labelFor(row: PascalRow, side: Side): string {
  return side === "long" ? row.labels.long : row.labels.short;
}

export function outcomesOf(row: PascalRow): readonly Outcome[] {
  return (["long", "short"] as const).map((side, index) => ({
    index,
    role: roleFor(row, side),
    label: untrustedField("outcome", labelFor(row, side), "pascal"),
    tokenId: tokenIdOf(row.symbol, side),
  }));
}

export function outcomeSummariesOf(row: PascalRow): readonly OutcomeSummary[] {
  const mid = midOf(row.bestBid, row.bestAsk);
  return outcomesOf(row).map((outcome, index) => ({
    ...outcome,
    displayPrice: mid === null ? null : toDec(index === 0 ? mid : complement(mid)),
  }));
}

// ---- fee --------------------------------------------------------------------------------------------------------------------

// Taker fee per fill: size * price * (1 - price) * taker_fee_rate, USD, six decimals. The maker gets
// maker_rebate_share of it back, expressed here as a negative rate. Read per market, never hard-coded
// (91 of 3,255 markets use 0.01 / 0.50 instead of 0.02 / 0.25).
export function feeSpecOf(row: PascalRow, nowMs: number): FeeSpec {
  const rebate = fromAtomic("price", row.takerFeeRate.atomic * row.makerRebateShare.atomic, row.takerFeeRate.scale + row.makerRebateShare.scale);
  const rebateText = rebate.atomic === 0n ? "0" : `-${toDec(rebate)}`;
  return {
    venue: "pascal",
    modelId: "curve_pq",
    taker: { rate: toDec(row.takerFeeRate) },
    maker: { rate: rebateText },
    rounding: "usd_6dp",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: `${PASCAL_API_BASE}/markets`, field: "taker_fee_rate,maker_rebate_share", granularity: "market" },
    verifiedAt: new Date(nowMs).toISOString(),
    ttlSec: PASCAL_FEE_TTL_SEC,
  };
}

// ---- market --------------------------------------------------------------------------------------------------------------------

export function provOf(nowMs: number, venueTsMs: number | undefined, source: string, transport: "T0" | "T1", ttlMs: number): Prov {
  return {
    venue: "pascal",
    source,
    fetchedAtMs: nowMs,
    ...(venueTsMs === undefined ? {} : { venueTsMs }),
    transport,
    freshness: "live",
    ttlMs,
    // The Platform Data clause is unresolved (docs/research/venues/pascal.md section 12): unknown, not "open".
    license: "unknown",
  };
}

export function summaryOf(row: PascalRow, nowMs: number, venueTsMs: number | undefined, transport: "T0" | "T1"): MarketSummary {
  return {
    ref: refOf(row),
    title: untrustedField("title", row.titleText, "pascal"),
    status: statusOf(row, nowMs),
    // Pascal publishes no close time, only an expected resolution time (in Market.timesUtc).
    closesAtUtc: null,
    outcomes: outcomeSummariesOf(row),
    volume: { amount: row.volume24h === null ? null : toDec(row.volume24h), unit: row.volume24h === null ? "unknown" : "usd", windowHours: row.volume24h === null ? null : 24 },
    prov: provOf(nowMs, venueTsMs, `${PASCAL_API_BASE}/markets`, transport, PASCAL_LIST_TTL_MS),
  };
}

function rulesOf(row: PascalRow): Rules {
  const range = row.scalar === null ? "" : `\nScalar market: settles to a value between 0 and 1 across ${row.scalar.lower} to ${row.scalar.upper}.`;
  const referenced = row.reference !== null;
  return {
    text: untrustedField("rules", `${row.descriptionText}${range}`, "pascal"),
    // The rules text is a file on a host this build does not read, so no hash exists. An empty hash means
    // "no rules text was available" and never equals a real one.
    sha256: "",
    sources: row.rulesUrl === null ? [] : [row.rulesUrl],
    // A referenced market settles to Polymarket's published resolution, even a disputed one; the rest are
    // settled by the Pascal team with no on-chain oracle.
    mechanism: referenced ? "external_parity" : "unknown",
    void: row.scalar !== null ? "scalar" : "unknown",
  };
}

export function marketOf(row: PascalRow, nowMs: number, venueTsMs: number | undefined): Market {
  const opens = isoOrNull(row.listingMs);
  const resolves = isoOrNull(row.expectedResolutionMs);
  const tick: string | TickRanges = tickFor(row.sigFigs, row.tickMinMicro);
  return {
    ref: refOf(row),
    title: untrustedField("title", row.titleText, "pascal"),
    outcomes: outcomesOf(row),
    rules: rulesOf(row),
    status: statusOf(row, nowMs),
    // Read-only adapter. The venue publishes no trading-state field, and the rules are not loaded.
    tradable: { ok: false, reasons: ["read_only_adapter", "trading_state_not_reported", "rules_text_not_loaded"] },
    timesUtc: { ...(opens === null ? {} : { opensAt: opens }), ...(resolves === null ? {} : { expectedResolutionAt: resolves }) },
    tick,
    // Sizes are whole contracts; one contract pays up to 1 USD.
    minSize: "1",
    collateral: COLLATERAL,
    // Events can omit an "Other" market, so exhaustiveness is not claimed.
    group: { key: row.event, kind: "event", exhaustive: "unknown" },
    fee: feeSpecOf(row, nowMs),
    prov: { fetchedAtMs: nowMs, source: `${PASCAL_API_BASE}/markets`, adapterVersion: PASCAL_ADAPTER_VERSION, schemaHash: PASCAL_SCHEMA_HASH },
  };
}

// ---- books --------------------------------------------------------------------------------------------------------------------

export interface RawLevel {
  readonly price: Qty;
  readonly size: Qty;
}

function cmpPrice(a: Qty, b: Qty): number {
  return cmpQty(a, b);
}

// Merge equal prices, drop empty levels, sort explicitly: bids descending, asks ascending.
export function sortLevels(levels: readonly RawLevel[], side: "bids" | "asks"): readonly RawLevel[] {
  const merged: RawLevel[] = [];
  for (const level of levels) {
    if (level.size.atomic === 0n) continue;
    const at = merged.findIndex((existing) => cmpPrice(existing.price, level.price) === 0);
    const found = merged[at];
    if (found === undefined) merged.push(level);
    else merged[at] = { price: found.price, size: addQty(found.size, level.size) };
  }
  return merged.sort((a, b) => (side === "bids" ? -cmpPrice(a.price, b.price) : cmpPrice(a.price, b.price)));
}

function levelOut(level: RawLevel): Level {
  return { price: toDec(level.price), size: toDec(level.size) };
}

export function crossed(bids: readonly RawLevel[], asks: readonly RawLevel[]): boolean {
  const bid = bids[0];
  const ask = asks[0];
  return bid !== undefined && ask !== undefined && cmpPrice(bid.price, ask.price) >= 0;
}

// The long side is the venue's book. The short side is the same book read from the other end (buying "no" at
// 1 - p hits the bids): it carries no liquidity of its own, so it is labelled a complement and never counts as
// extra depth.
export function bookOf(side: Side, bids: readonly RawLevel[], asks: readonly RawLevel[], symbol: string, nowMs: number, venueTsMs: number | undefined): Book {
  const sortedBids = sortLevels(bids, "bids");
  const sortedAsks = sortLevels(asks, "asks");
  const mirror = (levels: readonly RawLevel[], to: "bids" | "asks"): readonly RawLevel[] => sortLevels(levels.map((level) => ({ price: complement(level.price), size: level.size })), to);
  const out = side === "long" ? { bids: sortedBids, asks: sortedAsks } : { bids: mirror(sortedAsks, "bids"), asks: mirror(sortedBids, "asks") };
  return {
    token: { venue: "pascal", tokenId: tokenIdOf(symbol, side) },
    bids: out.bids.map(levelOut),
    asks: out.asks.map(levelOut),
    asOfMs: nowMs,
    ...(venueTsMs === undefined ? {} : { venueTsMs }),
    derived: side === "long" ? "native" : "complement",
  };
}
