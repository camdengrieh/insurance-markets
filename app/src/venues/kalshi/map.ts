import { sha256, toBytes } from "viem";

import { addQty, cmpQty, decFromNumber, fromAtomic, parseQty, subQty, toDec, type Qty } from "../../core/money";
import type { Book, Collateral, FeeSpec, Level, Market, MarketRef, MarketSummary, Outcome, OutcomeSummary, Rules, Status, TickRanges } from "../../core/ports";
import { kalshiRuleFields, rulesFingerprint } from "@sdk/rules";
import { untrustedField } from "../../core/untrusted";
import { makeProv } from "../../core/venue-policy";
import {
  KALSHI_ADAPTER_VERSION,
  KALSHI_API_PREFIX,
  KALSHI_COLLATERAL_DECIMALS,
  KALSHI_COLLATERAL_SYMBOL,
  KALSHI_FEE_TTL_SEC,
  KALSHI_LIST_TTL_MS,
  KALSHI_TAKER_COEFFICIENT,
} from "./constants";
import { TICKER, type KalshiBookBody, type KalshiRow } from "./schemas";

export const SCHEMA_DESCRIPTOR = "kalshi market v1: ticker event_ticker title status market_type close_time price_ranges rules_primary rules_secondary yes_sub_title no_sub_title last_price_dollars volume_24h_fp";
export const KALSHI_SCHEMA_HASH = sha256(toBytes(SCHEMA_DESCRIPTOR)).slice(2);

export const COLLATERAL: Collateral = Object.freeze({
  symbol: KALSHI_COLLATERAL_SYMBOL,
  chain: "offchain",
  decimals: KALSHI_COLLATERAL_DECIMALS,
  custody: "venue",
});

const ONE = fromAtomic("price", 1n, 0);
const ZERO = fromAtomic("price", 0n, 0);

// ---- tokens ---------------------------------------------------------------------------------------------------------------------

export type Side = "yes" | "no";

// A binary market has no outcome-token ids; a side is named by the ticker and the side. Tickers hold no "#".
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

// An ISO-8601 UTC timestamp as epoch milliseconds, or null. Date.parse is lenient, so the shape is checked first.
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
export function msOf(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_UTC.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

// ---- tick -----------------------------------------------------------------------------------------------------------------------

// price_ranges[] must tile [0, 1] without gaps: each range starts where the last ended, every step is positive.
// Anything else makes the row invalid (a tick that cannot be trusted is not guessed).
export function tickRangesOf(ranges: KalshiRow["price_ranges"]): TickRanges | null {
  const out: Array<{ from: string; to: string; tick: string }> = [];
  let previousEnd: Qty = ZERO;
  for (const range of ranges) {
    const start = parseQty("price", range.start, { maxScale: 6 });
    const end = parseQty("price", range.end, { maxScale: 6 });
    const step = parseQty("price", range.step, { maxScale: 6 });
    if (start === null || end === null || step === null) return null;
    if (cmpQty(start, previousEnd) !== 0 || cmpQty(end, start) <= 0 || cmpQty(end, ONE) > 0 || step.atomic <= 0n) return null;
    out.push({ from: toDec(start), to: toDec(end), tick: toDec(step) });
    previousEnd = end;
  }
  return cmpQty(previousEnd, ONE) === 0 ? out : null;
}

// ---- status ---------------------------------------------------------------------------------------------------------------------

// The documented lifecycle only. `finalized` needs a winner to count as resolved. An active market past its
// close time is closed, not trading, and one whose close time cannot be read is unknown. Anything else is unknown
// (fail closed).
export function statusOf(row: KalshiRow, nowMs: number): Status {
  const closes = msOf(row.close_time);
  switch (row.status) {
    case "initialized":
      return "pending";
    case "active":
      if (closes === null) return "unknown";
      return nowMs >= closes ? "closed" : "active";
    case "inactive":
      return "paused";
    case "closed":
      return "closed";
    case "determined":
      return "determined";
    case "disputed":
      return "disputed";
    case "finalized":
      return row.result === "yes" || row.result === "no" ? "resolved" : "unknown";
    default:
      return "unknown";
  }
}

// ---- prices ---------------------------------------------------------------------------------------------------------------------

// A dollar price in the open interval (0, 1), or null. "0.0000" means "none yet", never a price of zero.
export function dollarPrice(value: unknown): Qty | null {
  if (typeof value !== "string") return null;
  const q = parseQty("price", value, { maxScale: 6 });
  if (q === null || q.atomic <= 0n || cmpQty(q, ONE) >= 0) return null;
  return q;
}

// ---- market ---------------------------------------------------------------------------------------------------------------------

export function refOf(row: KalshiRow): MarketRef {
  return { venue: "kalshi", marketId: row.ticker, native: { ticker: row.ticker, event_ticker: row.event_ticker, market_type: row.market_type } };
}

function subtitle(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function outcomesOf(row: KalshiRow): readonly Outcome[] {
  return [
    { index: 0, role: "yes", label: untrustedField("outcome", subtitle(row.yes_sub_title, "Yes"), "kalshi"), tokenId: tokenIdOf(row.ticker, "yes") },
    { index: 1, role: "no", label: untrustedField("outcome", subtitle(row.no_sub_title, "No"), "kalshi"), tokenId: tokenIdOf(row.ticker, "no") },
  ];
}

// The venue's last traded YES price, when there is one. It is a display price, never a quote.
export function outcomeSummariesOf(row: KalshiRow): readonly OutcomeSummary[] {
  const last = dollarPrice(row.last_price_dollars);
  return outcomesOf(row).map((outcome, index) => ({
    ...outcome,
    displayPrice: last === null ? null : toDec(index === 0 ? last : subQty(ONE, last)),
  }));
}

function volumeOf(row: KalshiRow): MarketSummary["volume"] {
  const volume = typeof row.volume_24h_fp === "string" ? parseQty("contracts", row.volume_24h_fp, { maxScale: 6 }) : null;
  return volume === null ? { amount: null, unit: "unknown", windowHours: null } : { amount: toDec(volume), unit: "contracts", windowHours: 24 };
}

export function summaryOf(row: KalshiRow, origin: string, nowMs: number): MarketSummary {
  const closes = msOf(row.close_time);
  return {
    ref: refOf(row),
    title: untrustedField("title", row.title, "kalshi"),
    status: statusOf(row, nowMs),
    closesAtUtc: closes === null ? null : iso(closes),
    outcomes: outcomeSummariesOf(row),
    volume: volumeOf(row),
    // Licence class own_use_only comes from the policy table: memory-only, never exported.
    prov: makeProv({ venue: "kalshi", source: `${origin}${KALSHI_API_PREFIX}/markets`, fetchedAtMs: nowMs, nowMs, ttlMs: KALSHI_LIST_TTL_MS }),
  };
}

export function rulesOf(row: KalshiRow): Rules {
  const secondary = typeof row.rules_secondary === "string" ? row.rules_secondary : "";
  const text = untrustedField("rules", `${row.rules_primary} ${secondary}`, "kalshi");
  const closes = msOf(row.close_time);
  return {
    text,
    // Over the full rule fields and the close time, never the capped display copy (the shared recipe, finding A2). The
    // series' settlement sources are not read here, so a change to them is not covered.
    sha256: rulesFingerprint("kalshi", kalshiRuleFields(row)),
    // Settlement sources live on the series, which getMarket does not read.
    sources: [],
    mechanism: "exchange",
    void: "unknown",
    ...(closes === null ? {} : { cutoffUtc: iso(closes) }),
    ...(typeof row.can_close_early === "boolean" ? { canCloseEarly: row.can_close_early } : {}),
  };
}

export function unknownFee(origin: string, ticker: string, nowMs: number): FeeSpec {
  return {
    modelId: "unknown",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: `${origin}${KALSHI_API_PREFIX}/markets/${ticker}`, field: "series.fee_type", granularity: "series" },
    verifiedAt: iso(nowMs),
    // Zero: past its ttl already, so no net-of-fee number and no executable label may be built from it.
    ttlSec: 0,
  };
}

// Only the plain quadratic series is modelled: taker = coefficient x fee_multiplier x C x P x (1 - P), rounded up.
// Series with maker fees, combo fees or a flat fee are not modelled here and stay unknown.
export function feeSpecOf(series: { readonly ticker: string; readonly fee_type: string; readonly fee_multiplier: number }, origin: string, nowMs: number): FeeSpec {
  const fallback = unknownFee(origin, series.ticker, nowMs);
  if (series.fee_type !== "quadratic") return fallback;
  const multiplierText = decFromNumber(series.fee_multiplier);
  const multiplier = multiplierText === null ? null : parseQty("price", multiplierText, { maxScale: 6 });
  const coefficient = parseQty("price", KALSHI_TAKER_COEFFICIENT);
  if (multiplier === null || coefficient === null || multiplier.atomic <= 0n) return fallback;
  const rate = fromAtomic("price", coefficient.atomic * multiplier.atomic, coefficient.scale + multiplier.scale);
  return {
    modelId: "curve_pq",
    taker: { rate: toDec(rate) },
    rounding: "ceil_6dp",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: `${origin}${KALSHI_API_PREFIX}/series/${series.ticker}`, field: "fee_type,fee_multiplier", granularity: "series" },
    verifiedAt: iso(nowMs),
    ttlSec: KALSHI_FEE_TTL_SEC,
  };
}

export function marketOf(row: KalshiRow, ticks: TickRanges, origin: string, nowMs: number): Market {
  const opens = msOf(row.open_time);
  const closes = msOf(row.close_time);
  const expected = msOf(row.expected_expiration_time);
  const latest = msOf(row.latest_expiration_time);
  const status = statusOf(row, nowMs);
  const reasons = ["read_only_adapter", "fee_model_unread"];
  if (status !== "active") reasons.push("not_active");
  return {
    ref: refOf(row),
    title: untrustedField("title", row.title, "kalshi"),
    outcomes: outcomesOf(row),
    rules: rulesOf(row),
    status,
    tradable: { ok: false, reasons },
    timesUtc: {
      ...(opens === null ? {} : { opensAt: iso(opens) }),
      ...(closes === null ? {} : { closesAt: iso(closes) }),
      ...(expected === null ? {} : { expectedResolutionAt: iso(expected) }),
      ...(latest === null ? {} : { latestResolutionAt: iso(latest) }),
    },
    tick: ticks,
    collateral: COLLATERAL,
    group: { key: row.event_ticker, kind: "event", exhaustive: "unknown" },
    fee: unknownFee(origin, row.ticker, nowMs),
    prov: { fetchedAtMs: nowMs, source: `${origin}${KALSHI_API_PREFIX}/markets/${row.ticker}`, adapterVersion: KALSHI_ADAPTER_VERSION, schemaHash: KALSHI_SCHEMA_HASH },
  };
}

// ---- books ----------------------------------------------------------------------------------------------------------------------

export interface RawLevel {
  readonly price: Qty;
  readonly size: Qty;
}

// Merge equal prices, drop empty levels, sort explicitly: bids descending, asks ascending. The venue sends the
// best level last and says so; the order is never trusted.
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

export type ParsedBook = { readonly ok: true; readonly yesBids: readonly RawLevel[]; readonly noBids: readonly RawLevel[] } | { readonly ok: false; readonly reason: "invalid_level" | "crossed" };

function readSide(levels: KalshiBookBody["yes_dollars"]): RawLevel[] | null {
  const out: RawLevel[] = [];
  for (const [priceText, sizeText] of levels ?? []) {
    const price = dollarPrice(priceText);
    const size = parseQty("contracts", sizeText, { maxScale: 6 });
    if (price === null || size === null) return null;
    out.push({ price, size });
  }
  return out;
}

// The venue lists bids only: YES bids and NO bids. A YES ask is a NO bid read from the other end, so a book is
// crossed when the best YES bid and the best NO bid add up to one or more.
export function parseBook(body: KalshiBookBody): ParsedBook {
  const yes = readSide(body.yes_dollars);
  const no = readSide(body.no_dollars);
  if (yes === null || no === null) return { ok: false, reason: "invalid_level" };
  const yesBids = sortLevels(yes, "bids");
  const noBids = sortLevels(no, "bids");
  const bestYes = yesBids[0];
  const bestNo = noBids[0];
  if (bestYes !== undefined && bestNo !== undefined && cmpQty(addQty(bestYes.price, bestNo.price), ONE) >= 0) return { ok: false, reason: "crossed" };
  return { ok: true, yesBids, noBids };
}

function levelOut(level: RawLevel): Level {
  return { price: toDec(level.price), size: toDec(level.size) };
}

function asksFrom(otherBids: readonly RawLevel[]): readonly RawLevel[] {
  return sortLevels(otherBids.map((level) => ({ price: subQty(ONE, level.price), size: level.size })), "asks");
}

// Both sides are the venue's own: YES bids are real, and YES asks are the NO bids it holds, so each token's book
// is native.
export function bookOf(side: Side, ticker: string, parsed: { readonly yesBids: readonly RawLevel[]; readonly noBids: readonly RawLevel[] }, nowMs: number): Book {
  const own = side === "yes" ? parsed.yesBids : parsed.noBids;
  const other = side === "yes" ? parsed.noBids : parsed.yesBids;
  return {
    token: { venue: "kalshi", tokenId: tokenIdOf(ticker, side) },
    bids: own.map(levelOut),
    asks: asksFrom(other).map(levelOut),
    asOfMs: nowMs,
    derived: "native",
  };
}
