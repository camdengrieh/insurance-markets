import { sha256, toBytes } from "viem";

import { addQty, cmpQty, fromAtomic, parseQty, subQty, toDec, type Qty } from "../../money/qty.js";
import type { Book, Collateral, FeeSpec, Level, Market, MarketRef, MarketSummary, Outcome, OutcomeSummary, Rules, Status } from "../../model.js";
import { rulesFingerprint, udxRuleFields } from "../../rules.js";
import { untrustedField } from "../../text.js";
import { makeProv } from "../policy.js";
import {
  UDX_ADAPTER_VERSION,
  UDX_COLLATERAL_DECIMALS,
  UDX_COLLATERAL_SYMBOL,
  UDX_FEE_READ_AT,
  UDX_FEE_TTL_SEC,
  UDX_LIST_TTL_MS,
  UDX_MAKER_COEFFICIENT,
  UDX_TAKER_COEFFICIENT,
} from "./constants.js";
import { TICKER, type UdxBookBody, type UdxRow } from "./schemas.js";

export const SCHEMA_DESCRIPTOR = "udx market v1: ticker description expires_at status tick_size minimum_price maximum_price external_ids";
export const UDX_SCHEMA_HASH = sha256(toBytes(SCHEMA_DESCRIPTOR)).slice(2);

export const COLLATERAL: Collateral = Object.freeze({
  symbol: UDX_COLLATERAL_SYMBOL,
  chain: "offchain",
  decimals: UDX_COLLATERAL_DECIMALS,
  custody: "venue",
});

const ONE = fromAtomic("price", 1n, 0);
const ZERO = fromAtomic("price", 0n, 0);

// ---- tokens ---------------------------------------------------------------------------------------------------------------------

export type Side = "yes" | "no";

// A binary market has no outcome-token ids. A side is named by the ticker and the side; tickers hold no "#".
export function tokenIdOf(ticker: string, side: Side): string {
  return `${ticker}#${side}`;
}

export function parseTokenId(tokenId: string): { readonly ticker: string; readonly side: Side } | null {
  const at = tokenId.lastIndexOf("#");
  if (at <= 0) return null;
  const side = tokenId.slice(at + 1);
  const ticker = tokenId.slice(0, at);
  if ((side !== "yes" && side !== "no") || !TICKER.test(ticker)) return null;
  return { ticker, side };
}

// ---- times ----------------------------------------------------------------------------------------------------------------------

// Timestamps carry up to six fractional digits ("2026-10-22T18:30:00.000000Z"). The shape is checked first because
// Date.parse is lenient.
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
export function msOf(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_UTC.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

// ---- row ------------------------------------------------------------------------------------------------------------------------

// A combo carries its legs; a single-leg row does not. Combos are not modelled.
export function isCombo(row: UdxRow): boolean {
  return row.legs !== undefined || row.ticker.startsWith("UDXCOMBO");
}

// The price rules: a tick, a minimum and a maximum, all inside (0, 1), minimum below maximum. Anything else makes
// the row invalid (a tick that cannot be trusted is not guessed).
export function priceRules(row: UdxRow): { readonly tick: string; readonly min: Qty; readonly max: Qty } | null {
  const tick = parseQty("price", row.tick_size, { maxScale: 6 });
  const min = parseQty("price", row.minimum_price, { maxScale: 6 });
  const max = parseQty("price", row.maximum_price, { maxScale: 6 });
  if (tick === null || min === null || max === null) return null;
  if (tick.atomic <= 0n || cmpQty(tick, ONE) >= 0) return null;
  if (cmpQty(min, ZERO) <= 0 || cmpQty(max, ONE) >= 0 || cmpQty(min, max) >= 0) return null;
  return { tick: toDec(tick), min, max };
}

// The documented lifecycle only. An open market past its expiry is closed, not trading; one whose expiry cannot be
// read is unknown (a market with no known end is not shown as trading). `expired` is past expiry.
export function statusOf(row: UdxRow, nowMs: number): Status {
  const expires = msOf(row.expires_at);
  switch (row.status) {
    case "unopened":
      return "pending";
    case "open":
      if (expires === null) return "unknown";
      return nowMs >= expires ? "closed" : "active";
    case "paused":
      return "paused";
    case "closed":
    case "expired":
      return "closed";
    default:
      return "unknown";
  }
}

// The venue's own data-provider ids for the underlying game, kept only if they are plain tokens. They are join
// hints for linking, never a link.
function providerIds(row: UdxRow): Record<string, string> {
  const out: Record<string, string> = {};
  const ids = row.external_ids;
  if (typeof ids !== "object" || ids === null || Array.isArray(ids)) return out;
  const optic = (ids as Record<string, unknown>)["optic_odds"];
  if (typeof optic !== "object" || optic === null || Array.isArray(optic)) return out;
  for (const [key, name] of [["fixture_id", "optic_fixture_id"], ["market_id", "optic_market_id"], ["team_id", "optic_team_id"], ["player_id", "optic_player_id"]] as const) {
    const value = (optic as Record<string, unknown>)[key];
    if (typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value)) out[name] = value;
  }
  return out;
}

export function refOf(row: UdxRow): MarketRef {
  return { venue: "udx", marketId: row.ticker, native: { ticker: row.ticker, ...providerIds(row) } };
}

export function outcomesOf(row: UdxRow): readonly Outcome[] {
  return [
    { index: 0, role: "yes", label: untrustedField("outcome", "Yes", "udx"), tokenId: tokenIdOf(row.ticker, "yes") },
    { index: 1, role: "no", label: untrustedField("outcome", "No", "udx"), tokenId: tokenIdOf(row.ticker, "no") },
  ];
}

// The market routes carry no price, volume or open interest: both are null, never zero.
export function outcomeSummariesOf(row: UdxRow): readonly OutcomeSummary[] {
  return outcomesOf(row).map((outcome) => ({ ...outcome, displayPrice: null }));
}

export function summaryOf(row: UdxRow, origin: string, nowMs: number): MarketSummary {
  const expires = msOf(row.expires_at);
  return {
    ref: refOf(row),
    // The venue has no title: its description is the question.
    title: untrustedField("title", row.description, "udx"),
    status: statusOf(row, nowMs),
    closesAtUtc: expires === null ? null : iso(expires),
    outcomes: outcomeSummariesOf(row),
    volume: { amount: null, unit: "unknown", windowHours: null },
    // Licence class own_use_only comes from the policy table: memory-only, never exported.
    prov: makeProv({ venue: "udx", source: `${origin}/markets`, fetchedAtMs: nowMs, nowMs, ttlMs: UDX_LIST_TTL_MS }),
  };
}

export function rulesOf(row: UdxRow): Rules {
  const text = untrustedField("rules", row.description, "udx");
  const expires = msOf(row.expires_at);
  return {
    text,
    // Over the full description and the expiry, never the capped display copy (the shared recipe, finding A2).
    sha256: rulesFingerprint("udx", udxRuleFields(row)),
    sources: [],
    mechanism: "exchange",
    void: "unknown",
    ...(expires === null ? {} : { cutoffUtc: iso(expires) }),
  };
}

// taker 0.07 x C x P x (1 - P), maker 0.0175 x the same, per trade, nearest cent with halves to even (the UDX Fee
// Schedule effective 2026-10-09, underdog-exchange.pactsafe.io/versions/6ac6db492c7c473ca250669f.pdf, listed
// on legal.underdogexchange.com, read 2026-10-22: "Round = rounds the fee to the nearest cent; amounts exactly
// halfway between two cents are rounded to the nearest even cent"; engine grammar "half_even:2"). The engine rounds
// the order once, so an order the venue splits into several trades can differ by up to half a cent per trade. The
// schedule charges a combination market's maker 0.07, not 0.0175; this spec does not tell those markets apart. A
// venue document, not an API field: it carries its read date and a fourteen-day ttl.
export function feeSpec(origin: string): FeeSpec {
  return {
    venue: "udx",
    modelId: "curve_pq",
    taker: { rate: UDX_TAKER_COEFFICIENT },
    maker: { rate: UDX_MAKER_COEFFICIENT },
    rounding: "half_even:2",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: `${origin}/markets`, field: "fee schedule effective 2026-10-09 (a venue document, not fetched): taker 0.07 and maker 0.0175 x C x P x (1 - P)", granularity: "category" },
    verifiedAt: UDX_FEE_READ_AT,
    ttlSec: UDX_FEE_TTL_SEC,
  };
}

export function marketOf(row: UdxRow, tick: string, origin: string, nowMs: number): Market {
  const expires = msOf(row.expires_at);
  const status = statusOf(row, nowMs);
  const reasons = ["read_only_adapter", "no_volume_or_last_price"];
  if (status !== "active") reasons.push("not_active");
  return {
    ref: refOf(row),
    title: untrustedField("title", row.description, "udx"),
    outcomes: outcomesOf(row),
    rules: rulesOf(row),
    status,
    tradable: { ok: false, reasons },
    timesUtc: expires === null ? {} : { closesAt: iso(expires) },
    tick,
    collateral: COLLATERAL,
    fee: feeSpec(origin),
    prov: { fetchedAtMs: nowMs, source: `${origin}/markets/${row.ticker}`, adapterVersion: UDX_ADAPTER_VERSION, schemaHash: UDX_SCHEMA_HASH },
  };
}

// ---- books ----------------------------------------------------------------------------------------------------------------------

export interface RawLevel {
  readonly price: Qty;
  readonly size: Qty;
}

// Merge equal prices, drop empty levels, sort explicitly: bids descending, asks ascending. The venue says "best
// first"; the order is never trusted.
export function sortLevels(levels: readonly RawLevel[], side: "bids" | "asks"): readonly RawLevel[] {
  const merged: RawLevel[] = [];
  for (const level of levels) {
    if (level.size.atomic === 0n) continue;
    const at = merged.findIndex((existing) => cmpQty(existing.price, level.price) === 0);
    const found = merged[at];
    if (found === undefined) merged.push(level);
    else merged[at] = { price: found.price, size: addQty(found.size, level.size) };
  }
  return merged.sort((a, b) => (side === "bids" ? -cmpQty(a.price, b.price) : cmpQty(a.price, b.price)));
}

export type ParsedBook = { readonly ok: true; readonly bids: readonly RawLevel[]; readonly asks: readonly RawLevel[] } | { readonly ok: false; readonly reason: "invalid_level" | "crossed" };

function readSide(levels: UdxBookBody["bids"]): RawLevel[] | null {
  const out: RawLevel[] = [];
  for (const [priceText, sizeText] of levels) {
    const price = parseQty("price", priceText, { maxScale: 6 });
    const size = parseQty("contracts", sizeText, { maxScale: 6 });
    if (price === null || size === null || price.atomic <= 0n || cmpQty(price, ONE) >= 0) return null;
    out.push({ price, size });
  }
  return out;
}

export function parseBook(body: UdxBookBody): ParsedBook {
  const bids = readSide(body.bids);
  const asks = readSide(body.asks);
  if (bids === null || asks === null) return { ok: false, reason: "invalid_level" };
  const sortedBids = sortLevels(bids, "bids");
  const sortedAsks = sortLevels(asks, "asks");
  const bid = sortedBids[0];
  const ask = sortedAsks[0];
  if (bid !== undefined && ask !== undefined && cmpQty(bid.price, ask.price) >= 0) return { ok: false, reason: "crossed" };
  return { ok: true, bids: sortedBids, asks: sortedAsks };
}

function levelOut(level: RawLevel): Level {
  return { price: toDec(level.price), size: toDec(level.size) };
}

function mirror(levels: readonly RawLevel[], to: "bids" | "asks"): readonly RawLevel[] {
  return sortLevels(levels.map((level) => ({ price: subQty(ONE, level.price), size: level.size })), to);
}

// The venue publishes the YES book only (every price is a YES price). The NO book is the same book read from the
// other end: it carries no liquidity of its own, so it is labelled a complement.
export function bookOf(side: Side, ticker: string, parsed: { readonly bids: readonly RawLevel[]; readonly asks: readonly RawLevel[] }, nowMs: number): Book {
  const out = side === "yes" ? { bids: parsed.bids, asks: parsed.asks } : { bids: mirror(parsed.asks, "bids"), asks: mirror(parsed.bids, "asks") };
  return {
    token: { venue: "udx", tokenId: tokenIdOf(ticker, side) },
    bids: out.bids.map(levelOut),
    asks: out.asks.map(levelOut),
    asOfMs: nowMs,
    derived: side === "yes" ? "native" : "complement",
  };
}
