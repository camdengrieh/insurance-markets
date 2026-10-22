import type { AdapterError, MarketSummary, TickRanges } from "../../model.js";
import { KALSHI_MAX_DROPPED_SHARE } from "./constants.js";
import { isModelled, parseBook, sourceUrlsOf, summaryOf, tickRangesOf, type KalshiEvent, type KalshiSeries, type RawLevel, type TokenSeparator } from "./map.js";
import {
  CURSOR,
  TICKER,
  bookBodySchema,
  bookEnvelopeSchema,
  eventEnvelopeSchema,
  exchangeStatusSchema,
  listEnvelopeSchema,
  marketEnvelopeSchema,
  rowHeadSchema,
  rowSchema,
  seriesEnvelopeSchema,
  type KalshiBookBody,
  type KalshiRow,
} from "./schemas.js";

// The one Kalshi parser: venue answer bodies in, validated values or a closed error out. It does no I/O and holds
// no state. The dApp reader (adapter.ts) and pm/adapters/kalshi.ts both call it; each keeps its own transport,
// gate and error type. RESTRICTED TERMS: nothing here stores, caches or exports a body; the values it returns are
// held by the caller in memory only (sdk/venues/policy.ts, pm/adapters/policy.ts).
//
// A failure carries a code from the closed AdapterError set and a short fixed detail token. Neither ever quotes
// upstream text.

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AdapterError; readonly detail: string };

const fail = (error: AdapterError, detail: string): { readonly ok: false; readonly error: AdapterError; readonly detail: string } => ({ ok: false, error, detail });

// ---- one market ---------------------------------------------------------------------------------------------------------------

export interface KalshiMarketRead {
  readonly row: KalshiRow;
  readonly ticks: TickRanges;
}

// GET /markets/{ticker}: { market: row }. The venue answering for another market, a market that is not a plain
// binary one, and price ranges that do not tile [0, 1] are each refused, never shown as the requested market.
export function parseMarketBody(body: unknown, ticker: string): Parsed<KalshiMarketRead> {
  const envelope = marketEnvelopeSchema.safeParse(body);
  if (!envelope.success) return fail("SCHEMA_DRIFT", "market_shape");
  const row = rowSchema.safeParse(envelope.data.market);
  if (!row.success) return fail("SCHEMA_DRIFT", "market_shape");
  if (row.data.ticker !== ticker) return fail("SCHEMA_DRIFT", "ticker_mismatch");
  if (!isModelled(row.data)) return fail("NOT_SUPPORTED", "unsupported_market");
  const ticks = tickRangesOf(row.data.price_ranges);
  if (ticks === null) return fail("SCHEMA_DRIFT", "price_ranges");
  return { ok: true, value: { row: row.data, ticks } };
}

// ---- the market list ----------------------------------------------------------------------------------------------------------

export interface KalshiListCounts {
  readonly parsed: number;
  // Rows that failed validation (a bad head, a bad row, price ranges that do not tile [0, 1]).
  readonly dropped: number;
  // Rows that are not plain binary markets (scalar, combo legs): skipped, not repaired.
  readonly skippedUnsupported: number;
}

export interface KalshiListRead extends KalshiListCounts {
  readonly items: readonly MarketSummary[];
  // Every row not returned, by its index in the answer, so a host can report it instead of dropping it silently.
  readonly rejected: ReadonlyArray<{ readonly index: number; readonly reason: "invalid_row" | "unsupported_market" }>;
  readonly next: string | null;
}

export type ParsedList = { readonly ok: true; readonly value: KalshiListRead } | { readonly ok: false; readonly error: AdapterError; readonly detail: string; readonly counts: KalshiListCounts | null };

// GET /markets: { markets: [row], cursor }. An answer where every row fails, or more than half of the modelled
// rows fail, is a changed shape (SCHEMA_DRIFT), as is a next cursor outside the closed alphabet.
export function parseListBody(body: unknown, origin: string, nowMs: number, separator?: TokenSeparator): ParsedList {
  const envelope = listEnvelopeSchema.safeParse(body);
  if (!envelope.success) return { ...fail("SCHEMA_DRIFT", "list_shape"), counts: null };
  const items: MarketSummary[] = [];
  const rejected: Array<{ index: number; reason: "invalid_row" | "unsupported_market" }> = [];
  let dropped = 0;
  let skipped = 0;
  envelope.data.markets.forEach((raw, index) => {
    const head = rowHeadSchema.safeParse(raw);
    if (!head.success) {
      dropped += 1;
      rejected.push({ index, reason: "invalid_row" });
      return;
    }
    if (!isModelled(head.data)) {
      skipped += 1;
      rejected.push({ index, reason: "unsupported_market" });
      return;
    }
    const row = rowSchema.safeParse(raw);
    if (!row.success || tickRangesOf(row.data.price_ranges) === null) {
      dropped += 1;
      rejected.push({ index, reason: "invalid_row" });
      return;
    }
    items.push(summaryOf(row.data, origin, nowMs, separator));
  });
  const counts: KalshiListCounts = { parsed: items.length, dropped, skippedUnsupported: skipped };
  if (envelope.data.markets.length > 0 && items.length === 0 && skipped === 0) return { ...fail("SCHEMA_DRIFT", "no_valid_rows"), counts };
  if (items.length + dropped > 0 && dropped / (items.length + dropped) > KALSHI_MAX_DROPPED_SHARE) return { ...fail("SCHEMA_DRIFT", "too_many_invalid_rows"), counts };
  const next = envelope.data.cursor;
  if (typeof next === "string" && next !== "" && !CURSOR.test(next)) return { ...fail("SCHEMA_DRIFT", "bad_next_cursor"), counts };
  return { ok: true, value: { ...counts, items, rejected, next: typeof next === "string" && next !== "" ? next : null } };
}

// ---- books --------------------------------------------------------------------------------------------------------------------

export interface KalshiBookRead {
  readonly yesBids: readonly RawLevel[];
  readonly noBids: readonly RawLevel[];
}

// GET /markets/{ticker}/orderbook: { orderbook_fp: { yes_dollars, no_dollars } }.
export function parseBookEnvelope(body: unknown): KalshiBookBody | null {
  const parsed = bookEnvelopeSchema.safeParse(body);
  return parsed.success ? parsed.data.orderbook_fp : null;
}

// One venue book, validated and sorted. A bad level or a crossed book is a drift (a book is not "empty" because its
// levels were bad); two empty sides are EMPTY_BOOK.
export function readBook(body: KalshiBookBody): Parsed<KalshiBookRead> {
  const parsed = parseBook(body);
  if (!parsed.ok) return fail("SCHEMA_DRIFT", parsed.reason);
  if (parsed.yesBids.length === 0 && parsed.noBids.length === 0) return fail("EMPTY_BOOK", "empty_book");
  return { ok: true, value: { yesBids: parsed.yesBids, noBids: parsed.noBids } };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// GET /markets/orderbooks?tickers=A&tickers=B. The answer is a list of entries that each name their ticker; its
// envelope key was never captured, so the first non-empty list whose entries all name a ticker is used, and an
// entry's book may sit under `orderbook_fp` or on the entry itself. Every book is validated as a single book is.
// A comma-joined `tickers` value makes the venue answer 200 with a bogus empty book, so any ticker holding a comma
// makes the whole answer unusable (null), as does a malformed book.
export function parseBatchBooks(json: unknown): Map<string, KalshiBookBody> | null {
  if (!isRecord(json)) return null;
  for (const value of Object.values(json)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const out = new Map<string, KalshiBookBody>();
    for (const item of value as unknown[]) {
      const ticker = isRecord(item) ? item["ticker"] : undefined;
      if (typeof ticker === "string" && ticker.includes(",")) return null;
      if (!isRecord(item) || typeof ticker !== "string" || !TICKER.test(ticker)) {
        out.clear();
        break;
      }
      const holder = isRecord(item["orderbook_fp"]) ? item["orderbook_fp"] : item;
      const book = bookBodySchema.safeParse(holder);
      if (!book.success) return null;
      out.set(ticker, book.data);
    }
    if (out.size > 0) return out;
  }
  return null;
}

// ---- event, series and fees ---------------------------------------------------------------------------------------------------

// GET /events/{event_ticker}: { event }. Null when the shape is wrong or the answer names another event.
export function parseEventBody(body: unknown, eventTicker: string): KalshiEvent | null {
  const parsed = eventEnvelopeSchema.safeParse(body);
  if (!parsed.success || parsed.data.event.event_ticker !== eventTicker) return null;
  const event = parsed.data.event;
  return {
    eventTicker: event.event_ticker,
    seriesTicker: event.series_ticker,
    mutuallyExclusive: typeof event.mutually_exclusive === "boolean" ? event.mutually_exclusive : null,
    sources: sourceUrlsOf(event.settlement_sources),
  };
}

// GET /series/{series_ticker}: { series }. Null when the shape is wrong or the answer names another series.
// `GET /series` (the full list) ignores `limit` and answers more than 3.5 MB: no host may call it.
export function parseSeriesBody(body: unknown, seriesTicker: string): KalshiSeries | null {
  const parsed = seriesEnvelopeSchema.safeParse(body);
  if (!parsed.success || parsed.data.series.ticker !== seriesTicker) return null;
  const series = parsed.data.series;
  return { ticker: series.ticker, feeType: series.fee_type, feeMultiplier: series.fee_multiplier, sources: sourceUrlsOf(series.settlement_sources) };
}

// Scheduled or event-level fee overrides (GET /series/fee_changes, GET /events/fee_changes). Their shapes were never
// captured, so the reading is tolerant and conservative: "present" when an entry names one of the tickers, "clear"
// when the answer is empty or every entry is identifiable and none matches, "inconclusive" otherwise. A host must
// treat anything but "clear" as an unknown fee.
export function feeChangesVerdict(json: unknown, tickers: readonly string[]): "clear" | "present" | "inconclusive" {
  if (!isRecord(json)) return "inconclusive";
  const arrays = Object.values(json).filter((v): v is unknown[] => Array.isArray(v));
  if (arrays.length === 0) return Object.keys(json).length === 0 ? "clear" : "inconclusive";
  let identifiable = true;
  for (const items of arrays) {
    for (const item of items) {
      if (!isRecord(item)) return "inconclusive";
      const keys = [item["series_ticker"], item["event_ticker"]].filter((k): k is string => typeof k === "string");
      if (keys.length === 0) identifiable = false;
      if (keys.some((k) => tickers.includes(k))) return "present";
    }
  }
  const total = arrays.reduce((n, a) => n + a.length, 0);
  return total > 0 && !identifiable ? "inconclusive" : "clear";
}

// ---- exchange status ----------------------------------------------------------------------------------------------------------

export interface KalshiExchangeStatus {
  readonly exchangeActive: boolean;
  readonly tradingActive: boolean;
  // Shards whose own flags are not both true. Zero when the venue lists none.
  readonly inactiveShards: number;
}

// GET /exchange/status. Null when the shape is wrong.
export function parseExchangeStatus(body: unknown): KalshiExchangeStatus | null {
  const parsed = exchangeStatusSchema.safeParse(body);
  if (!parsed.success) return null;
  const shards = parsed.data.exchange_index_statuses;
  const inactiveShards = Array.isArray(shards) ? (shards as unknown[]).filter((s) => isRecord(s) && (s["exchange_active"] !== true || s["trading_active"] !== true)).length : 0;
  return { exchangeActive: parsed.data.exchange_active, tradingActive: parsed.data.trading_active, inactiveShards };
}
