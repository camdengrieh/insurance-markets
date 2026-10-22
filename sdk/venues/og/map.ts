import { sha256, toBytes } from "viem";

import { parseIsoMs } from "../../format.js";
import { addQty, cmpQty, fromAtomic, parseQty, toDec, type Qty } from "../../money/qty.js";
import type { Book, Collateral, Dec, FeeSpec, Level, Market, MarketRef, MarketSummary, Outcome, OutcomeSummary, Rules, Status } from "../../model.js";
import { untrustedField } from "../../text.js";
import { makeProv } from "../policy.js";
import { openUnitPrice } from "../novig/shared.js";
import {
  OG_ADAPTER_VERSION,
  OG_FEE_TTL_SEC,
  OG_FEE_VERIFIED_AT,
  OG_FLAT_FEE_CATEGORIES,
  OG_LIST_TTL_MS,
  OG_MAKER_COEFFICIENT,
  OG_PUBLIC_PATH,
  OG_TAKER_COEFFICIENT,
} from "./constants.js";
import { bookRowSchema, PREDICT_MARKET_ID, SCHEMA_DESCRIPTOR, type OgInstrument, type OgTicker } from "./schemas.js";

export const OG_SCHEMA_HASH = sha256(toBytes(SCHEMA_DESCRIPTOR)).slice(2);

// Funds sit with the exchange's affiliated FCM (OG Broker), in a segregated account.
export const COLLATERAL: Collateral = Object.freeze({ symbol: "USD", chain: "offchain", decimals: 2, custody: "broker" });

// ---- metadata ----------------------------------------------------------------------------------------------------------

// Matching metadata lives in event_details.metaData. A value is read only if it is a short string.
export function metaOf(instrument: OgInstrument, name: string): string | undefined {
  const value = instrument.event_details?.metaData?.[name];
  return typeof value === "string" && value.trim() !== "" && value.length <= 400 ? value : undefined;
}

function attributeOf(instrument: OgInstrument, name: string): string | undefined {
  const value = instrument.event_details?.attributes?.[name];
  return typeof value === "string" && value.length <= 40 ? value : undefined;
}

function strikeIndexOf(instrument: OgInstrument): number {
  const text = attributeOf(instrument, "STRIKE_INDEX");
  return text !== undefined && /^[0-9]{1,6}$/.test(text) ? Number(text) : Number.MAX_SAFE_INTEGER;
}

// ---- grouping ----------------------------------------------------------------------------------------------------------

// A market is the set of instruments that share a PREDICT_MARKET_ID inside one event: a two-way moneyline is two
// instruments, "Party to control the Senate" is one per party. Each instrument is its own binary option that pays $1
// if ITS outcome happens; there is no separate "No" instrument. An instrument with no market id stands alone.
export interface OgMarket {
  readonly event: string;
  readonly key: string;
  readonly instruments: readonly OgInstrument[];
}

export function marketIdOf(market: OgMarket): string {
  return `${market.event}:${market.key}`;
}

const MARKET_ID = /^([A-Za-z0-9][A-Za-z0-9._-]{0,99}):([A-Za-z0-9][A-Za-z0-9._-]{0,159})$/;

export function parseMarketId(marketId: string): { readonly event: string; readonly key: string } | null {
  const match = MARKET_ID.exec(marketId);
  return match === null ? null : { event: match[1] as string, key: match[2] as string };
}

export function keyOf(instrument: OgInstrument): string {
  const id = metaOf(instrument, "PREDICT_MARKET_ID");
  return id !== undefined && PREDICT_MARKET_ID.test(id) ? id : instrument.symbol;
}

// The headline markets of an event: binary options over the full game or period-less, and for sports only the
// moneyline. The rest (spreads, totals, hundreds of props) is skipped and counted, not shown.
export function isHeadline(instrument: OgInstrument): boolean {
  if (instrument.inst_type !== "BINARY_OPTION") return false;
  const period = metaOf(instrument, "PREDICT_PERIOD_TYPE");
  if (period !== undefined && period !== "Full-Game") return false;
  const category = metaOf(instrument, "PREDICT_CATEGORY");
  if (category === "Sports") return metaOf(instrument, "PREDICT_CONTRACT_TYPE") === "Moneyline";
  return true;
}

export interface Grouped {
  readonly markets: readonly OgMarket[];
  // Instruments left out, by reason, so a screen can say what was not shown.
  readonly skipped: { readonly notBinary: number; readonly notHeadline: number; readonly overCap: number };
}

export function groupMarkets(instruments: readonly OgInstrument[], eventSymbol: string, maxMarkets: number, headlineOnly: boolean): Grouped {
  const byKey = new Map<string, OgInstrument[]>();
  let notBinary = 0;
  let notHeadline = 0;
  for (const instrument of instruments) {
    if (instrument.underlying_symbol !== eventSymbol) continue;
    if (instrument.inst_type !== "BINARY_OPTION") {
      notBinary += 1;
      continue;
    }
    if (headlineOnly && !isHeadline(instrument)) {
      notHeadline += 1;
      continue;
    }
    const key = keyOf(instrument);
    const list = byKey.get(key) ?? [];
    list.push(instrument);
    byKey.set(key, list);
  }
  const all: OgMarket[] = [...byKey.entries()].map(([key, list]) => ({
    event: eventSymbol,
    key,
    instruments: [...list].sort((a, b) => strikeIndexOf(a) - strikeIndexOf(b) || (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0)),
  }));
  const markets = all.slice(0, maxMarkets);
  return { markets, skipped: { notBinary, notHeadline, overCap: Math.max(0, all.length - markets.length) } };
}

// ---- titles, labels, status -------------------------------------------------------------------------------------------

function first(market: OgMarket): OgInstrument {
  return market.instruments[0] as OgInstrument;
}

export function titleTextOf(market: OgMarket): string {
  const head = first(market);
  const name = metaOf(head, "NAME");
  const type = metaOf(head, "PREDICT_CONTRACT_TYPE");
  if (name !== undefined) return type !== undefined && type !== name ? `${name}: ${type}` : name;
  return head.display_name ?? market.event;
}

function labelTextOf(instrument: OgInstrument): string {
  return metaOf(instrument, "PARTICIPANT") ?? instrument.event_details?.eventName ?? instrument.display_name ?? instrument.symbol;
}

// The public `tradable` flag is not reliable for lifecycle (research section 4), and instruments disappear from the
// listing once an event settles. So a listed market is "active" if any of its instruments says tradable, and "closed"
// if none does; the tradable.reasons carry "lifecycle_not_checked".
export function statusOf(market: OgMarket): Status {
  return market.instruments.some((instrument) => instrument.tradable === true) ? "active" : "closed";
}

export function refOf(market: OgMarket): MarketRef {
  const head = first(market);
  const native: Record<string, string> = { event: market.event, key: market.key };
  const league = metaOf(head, "LEAGUE");
  if (league !== undefined && /^[A-Za-z0-9 _.-]{1,40}$/.test(league)) native.league = league;
  const date = isoOrNull(metaOf(head, "EVENT_DATE"));
  if (date !== null) native.eventDate = date;
  return { venue: "og", marketId: marketIdOf(market), native };
}

export function isoOrNull(text: string | undefined): string | null {
  const ms = parseIsoMs(text);
  if (ms === null) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// ---- quotes ------------------------------------------------------------------------------------------------------------

export interface OgQuote {
  readonly tokenId: string;
  readonly bid: Dec | null;
  readonly ask: Dec | null;
  readonly last: Dec | null;
  readonly volume24h: Dec | null;
  readonly crossed: boolean;
  readonly asOfMs: number | null;
}

export function midOf(bid: Qty, ask: Qty): Qty | null {
  if (cmpQty(bid, ask) >= 0) return null;
  const sum = addQty(bid, ask);
  return fromAtomic("price", sum.atomic * 5n, sum.scale + 1);
}

export function quoteOf(symbol: string, ticker: OgTicker | undefined): OgQuote {
  if (ticker === undefined) return { tokenId: symbol, bid: null, ask: null, last: null, volume24h: null, crossed: false, asOfMs: null };
  const bid = openUnitPrice(ticker.b, 4);
  const ask = openUnitPrice(ticker.k, 4);
  const last = openUnitPrice(ticker.a, 4);
  const crossed = bid !== null && ask !== null && cmpQty(bid, ask) >= 0;
  const volume = parseQty("contracts", ticker.v, { maxScale: 2 });
  return {
    tokenId: symbol,
    bid: crossed || bid === null ? null : toDec(bid),
    ask: crossed || ask === null ? null : toDec(ask),
    last: last === null ? null : toDec(last),
    volume24h: volume === null ? null : toDec(volume),
    crossed,
    asOfMs: ticker.t ?? null,
  };
}

// A display price (never executable): the middle of an uncrossed two-sided top of book, else nothing. A last trade
// alone is not offered as a price.
function displayPriceOf(ticker: OgTicker | undefined): Dec | null {
  if (ticker === undefined) return null;
  const bid = openUnitPrice(ticker.b, 4);
  const ask = openUnitPrice(ticker.k, 4);
  if (bid === null || ask === null) return null;
  const mid = midOf(bid, ask);
  return mid === null ? null : toDec(mid);
}

// ---- outcomes ----------------------------------------------------------------------------------------------------------

export function outcomesOf(market: OgMarket): readonly Outcome[] {
  return market.instruments.map((instrument, index) => ({
    index,
    // Each instrument is its own binary option; there is no No instrument to name a yes/no pair.
    role: "label",
    label: untrustedField("outcome", labelTextOf(instrument), "og"),
    tokenId: instrument.symbol,
  }));
}

export function outcomeSummariesOf(market: OgMarket, tickers: ReadonlyMap<string, OgTicker>): readonly OutcomeSummary[] {
  return outcomesOf(market).map((outcome) => ({ ...outcome, displayPrice: displayPriceOf(tickers.get(outcome.tokenId)) }));
}

// 24 hour contracts over every outcome. One missing figure makes the sum unknown, never a partial total.
export function volumeOf(market: OgMarket, tickers: ReadonlyMap<string, OgTicker>): MarketSummary["volume"] {
  let total: Qty | null = null;
  for (const instrument of market.instruments) {
    const volume = parseQty("contracts", tickers.get(instrument.symbol)?.v, { maxScale: 2 });
    if (volume === null) return { amount: null, unit: "unknown", windowHours: null };
    total = total === null ? volume : addQty(total, volume);
  }
  return total === null ? { amount: null, unit: "unknown", windowHours: null } : { amount: toDec(total), unit: "contracts", windowHours: 24 };
}

// ---- fee ---------------------------------------------------------------------------------------------------------------

// US customers, most markets: taker 0.07 x C x P x (1 - P), maker 0.0175 x C x P x (1 - P). Crypto, FX, commodities
// and equity indices pay a flat $0.02 a contract, and customers outside the US pay $0.02 everywhere; neither fits the
// port's curve models, so they read "unknown". The table is a help-centre page, not an API field: it carries its read
// date and expires, and the customer's region is unknown to this app, so it is stated as the US schedule.
export function feeSpecOf(market: OgMarket, nowMs: number): FeeSpec {
  const unknown: FeeSpec = {
    venue: "og",
    modelId: "unknown",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: `${OG_PUBLIC_PATH}/get-instruments`, field: "help-centre fee table (not an API field)", granularity: "category" },
    verifiedAt: OG_FEE_VERIFIED_AT,
    ttlSec: 0,
  };
  const verifiedMs = parseIsoMs(OG_FEE_VERIFIED_AT) as number;
  if (nowMs > verifiedMs + OG_FEE_TTL_SEC * 1000) return unknown;
  const category = metaOf(first(market), "PREDICT_CATEGORY");
  if (category === undefined || OG_FLAT_FEE_CATEGORIES.includes(category.toLowerCase())) return unknown;
  return {
    venue: "og",
    modelId: "curve_pq",
    taker: { rate: OG_TAKER_COEFFICIENT },
    maker: { rate: OG_MAKER_COEFFICIENT },
    rounding: "unknown",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: `${OG_PUBLIC_PATH}/get-instruments`, field: "help-centre fee table, US customers (not an API field)", granularity: "category" },
    verifiedAt: OG_FEE_VERIFIED_AT,
    ttlSec: OG_FEE_TTL_SEC,
  };
}

// ---- rules -------------------------------------------------------------------------------------------------------------

export function rulesOf(market: OgMarket): Rules {
  const parts = [`OG event contract: ${titleTextOf(market)}.`];
  const participants = market.instruments.map((instrument) => labelTextOf(instrument));
  parts.push(`Each outcome is its own contract that pays $1 if it happens: ${participants.join("; ")}.`);
  parts.push("The public market-data routes publish no rules text; the contract terms are in the exchange rulebook. Cancelled or postponed events are settled by the exchange's rules, not refunded at the entry price.");
  const text = parts.join(" ");
  return {
    text: untrustedField("rules", text, "og"),
    // No rules text is published, so no hash exists. An empty hash means "unknown" and never equals a real one.
    sha256: "",
    sources: [],
    mechanism: "exchange",
    void: "unknown",
  };
}

// ---- tick and size -----------------------------------------------------------------------------------------------------

function coarsest(values: readonly (string | undefined)[], unit: "price" | "shares"): Dec | undefined {
  let best: Qty | null = null;
  for (const text of values) {
    const parsed = parseQty(unit, text, { maxScale: 6 });
    if (parsed === null || parsed.atomic <= 0n) continue;
    if (best === null || cmpQty(parsed, best) > 0) best = parsed;
  }
  return best === null ? undefined : toDec(best);
}

export function tickOf(market: OgMarket): Dec {
  return coarsest(market.instruments.map((instrument) => instrument.price_tick_size), "price") ?? "0";
}

export function minSizeOf(market: OgMarket): Dec | undefined {
  return coarsest(market.instruments.map((instrument) => instrument.qty_tick_size), "shares");
}

// ---- summary and market -----------------------------------------------------------------------------------------------

export function summaryOf(market: OgMarket, tickers: ReadonlyMap<string, OgTicker>, nowMs: number, transport: "T0" | "T1"): MarketSummary {
  return {
    ref: refOf(market),
    title: untrustedField("title", titleTextOf(market), "og"),
    status: statusOf(market),
    // The venue's expiry on sports contracts is a placeholder months away, so no close time is claimed.
    closesAtUtc: null,
    outcomes: outcomeSummariesOf(market, tickers),
    volume: volumeOf(market, tickers),
    prov: makeProv({ venue: "og", source: `${OG_PUBLIC_PATH}/get-instruments`, fetchedAtMs: nowMs, nowMs, ttlMs: OG_LIST_TTL_MS, transport }),
  };
}

export function marketOf(market: OgMarket, nowMs: number): Market {
  const minSize = minSizeOf(market);
  return {
    ref: refOf(market),
    title: untrustedField("title", titleTextOf(market), "og"),
    outcomes: outcomesOf(market),
    rules: rulesOf(market),
    status: statusOf(market),
    tradable: { ok: false, reasons: ["read_only_adapter", "reference_prices_only", "lifecycle_not_checked", "rules_text_not_published"] },
    timesUtc: {},
    tick: tickOf(market),
    ...(minSize === undefined ? {} : { minSize }),
    collateral: COLLATERAL,
    group: { key: market.event, kind: "event", exhaustive: "unknown" },
    fee: feeSpecOf(market, nowMs),
    prov: { fetchedAtMs: nowMs, source: `${OG_PUBLIC_PATH}/get-instruments`, adapterVersion: OG_ADAPTER_VERSION, schemaHash: OG_SCHEMA_HASH },
  };
}

// ---- books -------------------------------------------------------------------------------------------------------------

export class BookShapeError extends Error {
  readonly reason: "bad_price" | "bad_size" | "crossed" | "bad_shape";
  constructor(reason: BookShapeError["reason"]) {
    super(reason);
    this.name = "BookShapeError";
    this.reason = reason;
  }
}

interface RawLevel {
  readonly price: Qty;
  readonly size: Qty;
}

function levelsOf(rows: ReadonlyArray<readonly [string, string]>): RawLevel[] {
  const out: RawLevel[] = [];
  for (const [priceText, sizeText] of rows) {
    const price = openUnitPrice(priceText, 4);
    if (price === null) throw new BookShapeError("bad_price");
    const size = parseQty("shares", sizeText, { maxScale: 2 });
    if (size === null) throw new BookShapeError("bad_size");
    if (size.atomic === 0n) continue;
    out.push({ price, size });
  }
  return out;
}

function sortLevels(levels: readonly RawLevel[], side: "bids" | "asks"): readonly RawLevel[] {
  const merged: RawLevel[] = [];
  for (const level of levels) {
    const at = merged.findIndex((existing) => cmpQty(existing.price, level.price) === 0);
    const found = merged[at];
    if (found === undefined) merged.push(level);
    else merged[at] = { price: found.price, size: addQty(found.size, level.size) };
  }
  return merged.sort((a, b) => (side === "bids" ? -cmpQty(a.price, b.price) : cmpQty(a.price, b.price)));
}

const levelOut = (level: RawLevel): Level => ({ price: toDec(level.price), size: toDec(level.size) });

// One instrument is one binary option with its own two-sided book: a native book. Sorted explicitly (bids
// descending, asks ascending), equal prices merged, zero sizes dropped. A crossed book is a drift.
export function bookOf(symbol: string, row: unknown, nowMs: number): { readonly book: Book; readonly venueTsMs: number | null } {
  const parsed = bookRowSchema.safeParse(row);
  if (!parsed.success) throw new BookShapeError("bad_shape");
  const bids = sortLevels(levelsOf(parsed.data.bids), "bids");
  const asks = sortLevels(levelsOf(parsed.data.asks), "asks");
  const bestBid = bids[0];
  const bestAsk = asks[0];
  if (bestBid !== undefined && bestAsk !== undefined && cmpQty(bestBid.price, bestAsk.price) >= 0) throw new BookShapeError("crossed");
  const venueTsMs = parsed.data.t !== undefined && parsed.data.t > 0 ? parsed.data.t : null;
  return {
    book: {
      token: { venue: "og", tokenId: symbol },
      bids: bids.map(levelOut),
      asks: asks.map(levelOut),
      asOfMs: nowMs,
      ...(venueTsMs === null ? {} : { venueTsMs }),
      derived: "native",
    },
    venueTsMs,
  };
}
