import { sha256, toBytes } from "viem";

import { addQty, cmpQty, decFromNumber, fromAtomic, parseQty, subQty, toDec, type Qty } from "../../money/qty.js";
import type { Book, Collateral, Dec, FeeSpec, Level, Market, MarketGroup, MarketRef, MarketSummary, Outcome, OutcomeSummary, Rules, Status, TickRanges } from "../../model.js";
import { kalshiRuleFields, rulesFingerprint } from "../../rules.js";
import { untrustedField } from "../../text.js";
import { makeProv } from "../policy.js";
import {
  KALSHI_ADAPTER_VERSION,
  KALSHI_API_PREFIX,
  KALSHI_COLLATERAL_DECIMALS,
  KALSHI_COLLATERAL_SYMBOL,
  KALSHI_FEE_TTL_SEC,
  KALSHI_LIST_TTL_MS,
  KALSHI_TAKER_COEFFICIENT,
} from "./constants.js";
import { TICKER, type KalshiBookBody, type KalshiRow } from "./schemas.js";

// Pure mapping from validated Kalshi values to the SDK read model. One parser for every host: the dApp reader
// (adapter.ts) and pm/adapters/kalshi.ts both build their markets, list rows and books here.

export const SCHEMA_DESCRIPTOR =
  "kalshi market v2: ticker event_ticker title status market_type close_time price_ranges rules_primary rules_secondary yes_sub_title no_sub_title last_price_dollars volume_24h_fp exchange_index mve_collection_ticker";
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

// A binary market has no outcome-token ids; a side is named by the ticker, a separator and the side. Tickers hold
// neither "#" nor ":". The dApp names a side TICKER#yes; pm/ names it TICKER:yes (its tools, links and tests use
// that form), so the separator is the host's choice and every builder takes it.
export type TokenSeparator = "#" | ":";
export const KALSHI_TOKEN_SEPARATOR: TokenSeparator = "#";

export function tokenIdOf(ticker: string, side: Side, separator: TokenSeparator = KALSHI_TOKEN_SEPARATOR): string {
  return `${ticker}${separator}${side}`;
}

export function parseTokenId(tokenId: string, separator: TokenSeparator = KALSHI_TOKEN_SEPARATOR): { readonly ticker: string; readonly side: Side } | null {
  const at = tokenId.lastIndexOf(separator);
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

// ---- rows -----------------------------------------------------------------------------------------------------------------------

// A market this parser models: a binary market that is not a combo leg. Anything else is skipped and counted, not
// repaired.
export function isModelled(row: { readonly market_type: string; readonly mve_collection_ticker?: unknown }): boolean {
  const combo = row.mve_collection_ticker;
  return row.market_type === "binary" && (combo === undefined || combo === null || combo === "");
}

// ---- tick -----------------------------------------------------------------------------------------------------------------------

// price_ranges[] must tile [0, 1] without gaps: each range starts where the last ended, every step is positive and
// no larger than the range's end. Anything else makes the row invalid (a tick that cannot be trusted is not guessed).
export function tickRangesOf(ranges: KalshiRow["price_ranges"]): TickRanges | null {
  const out: Array<{ from: string; to: string; tick: string }> = [];
  let previousEnd: Qty = ZERO;
  for (const range of ranges) {
    const start = parseQty("price", range.start, { maxScale: 6 });
    const end = parseQty("price", range.end, { maxScale: 6 });
    const step = parseQty("price", range.step, { maxScale: 6 });
    if (start === null || end === null || step === null) return null;
    if (cmpQty(start, previousEnd) !== 0 || cmpQty(end, start) <= 0 || cmpQty(end, ONE) > 0 || step.atomic <= 0n || cmpQty(step, end) > 0) return null;
    out.push({ from: toDec(start), to: toDec(end), tick: toDec(step) });
    previousEnd = end;
  }
  return cmpQty(previousEnd, ONE) === 0 ? out : null;
}

// ---- status ---------------------------------------------------------------------------------------------------------------------

// The documented lifecycle, from the status word alone. `amended` restarts the settlement timer after a dispute:
// still not final. Anything else is unknown (fail closed).
export function kalshiStatus(raw: string | null): Status {
  switch (raw) {
    case "initialized":
      return "pending";
    case "active":
      return "active";
    case "inactive":
      return "paused";
    case "closed":
      return "closed";
    case "determined":
      return "determined";
    case "disputed":
    case "amended":
      return "disputed";
    case "finalized":
      return "resolved";
    default:
      return "unknown";
  }
}

// A row's status: the lifecycle word, then the row's own facts. An active market past its close time is closed, not
// trading, and one whose close time cannot be read is unknown. `finalized` needs a winner to count as resolved.
export function statusOf(row: KalshiRow, nowMs: number): Status {
  const status = kalshiStatus(row.status);
  if (status === "active") {
    const closes = msOf(row.close_time);
    if (closes === null) return "unknown";
    return nowMs >= closes ? "closed" : "active";
  }
  if (status === "resolved") return row.result === "yes" || row.result === "no" ? "resolved" : "unknown";
  return status;
}

// ---- prices ---------------------------------------------------------------------------------------------------------------------

// A dollar price in the open interval (0, 1), or null. "0.0000" means "none yet", never a price of zero.
export function dollarPrice(value: unknown): Qty | null {
  if (typeof value !== "string") return null;
  const q = parseQty("price", value, { maxScale: 6 });
  if (q === null || q.atomic <= 0n || cmpQty(q, ONE) >= 0) return null;
  return q;
}

// ---- event and series -----------------------------------------------------------------------------------------------------------

// What the shared parser reads from the market's event and series (parse.ts parseEventBody, parseSeriesBody).
export interface KalshiEvent {
  readonly eventTicker: string;
  readonly seriesTicker: string;
  // The venue's flag; mutually exclusive is NOT exhaustive, so a group is never marked proven from it.
  readonly mutuallyExclusive: boolean | null;
  readonly sources: readonly string[];
}

export interface KalshiSeries {
  readonly ticker: string;
  readonly feeType: string;
  readonly feeMultiplier: number;
  readonly sources: readonly string[];
}

const MAX_SOURCES = 20;
const SOURCE_URL = /^https:\/\/[^\s]{1,292}$/;

// Settlement sources: https URLs only, at most twenty, each at most 300 characters. Names are not read.
export function sourceUrlsOf(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value.slice(0, MAX_SOURCES) as unknown[]) {
    const url = typeof item === "object" && item !== null && !Array.isArray(item) ? (item as { readonly url?: unknown }).url : undefined;
    if (typeof url === "string" && SOURCE_URL.test(url)) out.push(url);
  }
  return out;
}

// ---- market ---------------------------------------------------------------------------------------------------------------------

// Facts read beside the market, when the host read them. Neither read changes what the row itself says.
export interface KalshiMarketContext {
  readonly event?: KalshiEvent | null;
  readonly series?: KalshiSeries | null;
  readonly separator?: TokenSeparator;
}

const EXCHANGE_INDEX = /^(?:0|[1-9][0-9]{0,8})$/;

export function refOf(row: KalshiRow, event: KalshiEvent | null = null): MarketRef {
  const native: Record<string, string> = { ticker: row.ticker, event_ticker: row.event_ticker, market_type: row.market_type };
  if (event !== null) native["series_ticker"] = event.seriesTicker;
  const index = typeof row.exchange_index === "number" && Number.isSafeInteger(row.exchange_index) ? String(row.exchange_index) : null;
  if (index !== null && EXCHANGE_INDEX.test(index)) native["exchange_index"] = index;
  return { venue: "kalshi", marketId: row.ticker, native };
}

function subtitle(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function outcomesOf(row: KalshiRow, separator: TokenSeparator = KALSHI_TOKEN_SEPARATOR): readonly Outcome[] {
  return [
    { index: 0, role: "yes", label: untrustedField("outcome", subtitle(row.yes_sub_title, "Yes"), "kalshi"), tokenId: tokenIdOf(row.ticker, "yes", separator) },
    { index: 1, role: "no", label: untrustedField("outcome", subtitle(row.no_sub_title, "No"), "kalshi"), tokenId: tokenIdOf(row.ticker, "no", separator) },
  ];
}

// The venue's last traded YES price, when there is one. It is a display price, never a quote.
export function outcomeSummariesOf(row: KalshiRow, separator: TokenSeparator = KALSHI_TOKEN_SEPARATOR): readonly OutcomeSummary[] {
  const last = dollarPrice(row.last_price_dollars);
  return outcomesOf(row, separator).map((outcome, index) => ({
    ...outcome,
    displayPrice: last === null ? null : toDec(index === 0 ? last : subQty(ONE, last)),
  }));
}

function volumeOf(row: KalshiRow): MarketSummary["volume"] {
  const volume = typeof row.volume_24h_fp === "string" ? parseQty("contracts", row.volume_24h_fp, { maxScale: 6 }) : null;
  return volume === null ? { amount: null, unit: "unknown", windowHours: null } : { amount: toDec(volume), unit: "contracts", windowHours: 24 };
}

export function summaryOf(row: KalshiRow, origin: string, nowMs: number, separator: TokenSeparator = KALSHI_TOKEN_SEPARATOR): MarketSummary {
  const closes = msOf(row.close_time);
  return {
    ref: refOf(row),
    title: untrustedField("title", row.title, "kalshi"),
    status: statusOf(row, nowMs),
    closesAtUtc: closes === null ? null : iso(closes),
    outcomes: outcomeSummariesOf(row, separator),
    volume: volumeOf(row),
    // Licence class own_use_only comes from the policy table: memory-only, never exported.
    prov: makeProv({ venue: "kalshi", source: `${origin}${KALSHI_API_PREFIX}/markets`, fetchedAtMs: nowMs, nowMs, ttlMs: KALSHI_LIST_TTL_MS }),
  };
}

export function rulesOf(row: KalshiRow, context: KalshiMarketContext = {}): Rules {
  const secondary = typeof row.rules_secondary === "string" ? row.rules_secondary : "";
  const text = untrustedField("rules", `${row.rules_primary} ${secondary}`, "kalshi");
  const closes = msOf(row.close_time);
  // Settlement sources live on the series and the event; they are listed only when the host read them.
  const sources = [...new Set([...(context.series?.sources ?? []), ...(context.event?.sources ?? [])])];
  return {
    text,
    // Over the full rule fields and the close time, never the capped display copy (the shared recipe, finding A2). The
    // series' settlement sources are not part of the recipe, so a change to them is not covered.
    sha256: rulesFingerprint("kalshi", kalshiRuleFields(row)),
    sources,
    mechanism: "exchange",
    void: "unknown",
    ...(closes === null ? {} : { cutoffUtc: iso(closes) }),
    ...(typeof row.can_close_early === "boolean" ? { canCloseEarly: row.can_close_early } : {}),
  };
}

// ---- fees -----------------------------------------------------------------------------------------------------------------------

// The validated fee inputs of a series. Only the quadratic families are read: taker = coefficient x fee_multiplier x
// C x P x (1 - P). The multiplier must be a positive decimal of at most six places. Each host builds its own fee
// spec from these (the dApp's below, pm's with sdk/engine/fee-specs.ts).
export type KalshiFeeInputs =
  | { readonly ok: true; readonly feeType: "quadratic" | "quadratic_with_maker_fees"; readonly multiplier: Dec }
  | { readonly ok: false; readonly reason: "fee_type_not_modelled" | "multiplier_invalid" };

export function feeInputsOf(series: Pick<KalshiSeries, "feeType" | "feeMultiplier">): KalshiFeeInputs {
  if (series.feeType !== "quadratic" && series.feeType !== "quadratic_with_maker_fees") return { ok: false, reason: "fee_type_not_modelled" };
  const text = decFromNumber(series.feeMultiplier);
  const multiplier = text === null ? null : parseQty("price", text, { maxScale: 6 });
  if (multiplier === null || multiplier.atomic <= 0n) return { ok: false, reason: "multiplier_invalid" };
  return { ok: true, feeType: series.feeType, multiplier: toDec(multiplier) };
}

export function unknownFee(origin: string, ticker: string, nowMs: number): FeeSpec {
  return {
    venue: "kalshi",
    modelId: "unknown",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: `${origin}${KALSHI_API_PREFIX}/markets/${ticker}`, field: "series.fee_type", granularity: "series" },
    verifiedAt: iso(nowMs),
    // Zero: past its ttl already, so no net-of-fee number and no executable label may be built from it.
    ttlSec: 0,
  };
}

// The dApp models the plain quadratic series only (its spec has no maker side): taker = coefficient x fee_multiplier
// x C x P x (1 - P), rounded up. Series with maker fees, combo fees or a flat fee stay unknown here.
export function feeSpecOf(series: KalshiSeries, origin: string, nowMs: number): FeeSpec {
  const fallback = unknownFee(origin, series.ticker, nowMs);
  const inputs = feeInputsOf(series);
  if (!inputs.ok || inputs.feeType !== "quadratic") return fallback;
  const multiplier = parseQty("price", inputs.multiplier, { maxScale: 6 });
  const coefficient = parseQty("price", KALSHI_TAKER_COEFFICIENT);
  if (multiplier === null || coefficient === null) return fallback;
  const rate = fromAtomic("price", coefficient.atomic * multiplier.atomic, coefficient.scale + multiplier.scale);
  return {
    venue: "kalshi",
    modelId: "curve_pq",
    taker: { rate: toDec(rate) },
    rounding: "ceil_6dp",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: `${origin}${KALSHI_API_PREFIX}/series/${series.ticker}`, field: "fee_type,fee_multiplier", granularity: "series" },
    verifiedAt: iso(nowMs),
    ttlSec: KALSHI_FEE_TTL_SEC,
  };
}

// ---- market ---------------------------------------------------------------------------------------------------------------------

function groupOf(row: KalshiRow, event: KalshiEvent | null): MarketGroup {
  return { key: row.event_ticker, kind: event?.mutuallyExclusive === true ? "mutually_exclusive" : "event", exhaustive: "unknown" };
}

export function marketOf(row: KalshiRow, ticks: TickRanges, origin: string, nowMs: number, context: KalshiMarketContext = {}): Market {
  const event = context.event ?? null;
  const opens = msOf(row.open_time);
  const closes = msOf(row.close_time);
  const expected = msOf(row.expected_expiration_time);
  const latest = msOf(row.latest_expiration_time);
  const status = statusOf(row, nowMs);
  const reasons = ["read_only_adapter", "fee_model_unread"];
  if (status !== "active") reasons.push("not_active");
  return {
    ref: refOf(row, event),
    title: untrustedField("title", row.title, "kalshi"),
    outcomes: outcomesOf(row, context.separator),
    rules: rulesOf(row, context),
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
    group: groupOf(row, event),
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
export function bookOf(
  side: Side,
  ticker: string,
  parsed: { readonly yesBids: readonly RawLevel[]; readonly noBids: readonly RawLevel[] },
  nowMs: number,
  separator: TokenSeparator = KALSHI_TOKEN_SEPARATOR,
): Book {
  const own = side === "yes" ? parsed.yesBids : parsed.noBids;
  const other = side === "yes" ? parsed.noBids : parsed.yesBids;
  return {
    token: { venue: "kalshi", tokenId: tokenIdOf(ticker, side, separator) },
    bids: own.map(levelOut),
    asks: asksFrom(other).map(levelOut),
    asOfMs: nowMs,
    derived: "native",
  };
}
