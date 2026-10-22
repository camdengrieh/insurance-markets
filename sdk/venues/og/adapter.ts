import { MemoryStore, type TimerApi } from "../cache.js";
import type {
  AdapterCaps,
  AdapterDeps,
  AdapterError,
  Book,
  FeeSpec,
  ListMarketsQuery,
  Market,
  MarketRef,
  MarketSummary,
  Page,
  Result,
  TokenRef,
  VenueHealth,
  VenueReadAdapter,
} from "../../model.js";
import { AdapterFailure, assertEnabled, clampInt, getJson, isAdapterFailure, queryOf, resolveDeadline, type GateOptions } from "../novig/shared.js";
import {
  OG_BOOK_DEPTH,
  OG_EVENTS_DEFAULT,
  OG_EVENTS_MAX,
  OG_INSTRUMENT_PAGES_MAX,
  OG_INSTRUMENTS_LIMIT,
  OG_LIST_TTL_MS,
  OG_MARKETS_PER_EVENT,
  OG_MAX_BOOK_AGE_MS,
  OG_PUBLIC_PATH,
  OG_READ_SERVICE,
} from "./constants.js";
import { BookShapeError, bookOf, feeSpecOf, groupMarkets, marketIdOf, marketOf, parseMarketId, quoteOf, summaryOf, type Grouped, type OgMarket, type OgQuote } from "./map.js";
import { bookResultSchema, envelopeSchema, EVENT_SYMBOL, eventRowSchema, instrumentSchema, INSTRUMENT_SYMBOL, OPAQUE_CURSOR, pageResultSchema, tickerSchema, type OgInstrument, type OgTicker } from "./schemas.js";

// OG (North American Derivatives Exchange: OG.com Markets, Crypto.com | Derivatives North America, Nadex): a regulated
// US exchange with its own central limit order book. This adapter reads the public FCM market-data routes only:
// GET requests, no key, no signature, no private route. REFERENCE PRICES ONLY: OFF until the user switches it on
// and accepts the disclosure, and everything it reads stays in memory.
// Sources: docs/research/venues/crypto-com-derivatives-north-america-cdna-and-og-og-com.md, docs/dapp-design.md 4.6, 4.8.

const CAPS: AdapterCaps = {
  listMarkets: true,
  // The routes have no text search.
  search: false,
  getMarket: true,
  getBook: true,
  getBooksBatch: false,
  getFeeSpec: true,
  getResolution: false,
  getPositionsByAddress: false,
  stream: false,
};

// Both the exchange's error codes the adapter understands.
const CODE_INVALID_INSTRUMENT = 40004;

const ORIGIN = /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

// The origin comes from sdk/venues/origins.ts, the single source of every origin the app may name. This picks the one
// whose service id is "og" and returns null while no such entry exists.
export function ogOriginFrom(entries: ReadonlyArray<{ readonly origin: string; readonly service: string | null }>): string | null {
  const found = entries.find((entry) => entry.service === OG_READ_SERVICE);
  return found !== undefined && ORIGIN.test(found.origin) ? found.origin : null;
}

export interface OgOptions extends GateOptions {
  // https origin of the public market-data host, from sdk/venues/origins.ts (`ogOriginFrom`). Null or absent: the
  // adapter answers NOT_SUPPORTED ("origin_not_configured") and sends nothing.
  readonly origin?: string | null;
  // "T0" in the standalone build, "T1" through the Cockpit's read proxy.
  readonly transport?: "T0" | "T1";
  // Events read per list page (default 5). An event can list hundreds of instruments, one request each.
  readonly eventsPerPage?: number;
  // Also list spreads, totals and props (default: headline markets only).
  readonly allMarkets?: boolean;
  readonly timers?: TimerApi;
}

export interface OgReadReport {
  readonly events: number;
  readonly markets: number;
  readonly skippedNotBinary: number;
  readonly skippedNotHeadline: number;
  readonly skippedOverCap: number;
  // Events whose instrument list ran past what one read returns: some of their markets may be missing.
  readonly truncatedEvents: number;
  readonly fetchedAtMs: number;
}

export interface OgRow {
  // Aligned with page.items; one quote per outcome.
  readonly quotes: readonly OgQuote[];
}

export interface OgMarketDetail {
  readonly market: Market;
  readonly notes: readonly string[];
  readonly quotes: readonly OgQuote[];
}

export interface OgAdapter extends VenueReadAdapter {
  readonly id: "og";
  lastReadReport(): OgReadReport;
  listMarketsDetailed(q: ListMarketsQuery): Promise<{ readonly page: Page<MarketSummary>; readonly rows: readonly OgRow[] }>;
  getMarketDetail(ref: MarketRef): Promise<OgMarketDetail>;
  clearMemory(): void;
}

export function createOgAdapter(deps: AdapterDeps, options: OgOptions = {}): OgAdapter {
  const transport = options.transport ?? "T0";
  const gate: GateOptions = { ...(options.switches === undefined ? {} : { switches: options.switches }), ...(options.build === undefined ? {} : { build: options.build }) };
  const origin = options.origin ?? null;
  if (origin !== null && !ORIGIN.test(origin)) throw new RangeError("origin must be a plain https origin");
  const eventsPerPage = clampInt(options.eventsPerPage, OG_EVENTS_DEFAULT, 1, OG_EVENTS_MAX);
  const headlineOnly = options.allMarkets !== true;
  const storeOptions = { nowMs: deps.nowMs, ...(options.timers === undefined ? {} : { timers: options.timers }) };
  // R3: restricted-terms data lives in memory only.
  const markets = new MemoryStore<OgMarket>("og-market", storeOptions);
  let report: OgReadReport = { events: 0, markets: 0, skippedNotBinary: 0, skippedNotHeadline: 0, skippedOverCap: 0, truncatedEvents: 0, fetchedAtMs: 0 };

  // The gate, then the origin: both are refusals that send nothing.
  function ready(): string {
    assertEnabled("og", gate);
    if (origin === null) throw new AdapterFailure("og", "NOT_SUPPORTED", "origin_not_configured");
    return origin;
  }

  // One public route. The answer is an envelope; code 0 carries `result`. Code 40004 ("Invalid instrument", also
  // how a settled instrument answers) is NOT_FOUND; any other code is a drift. The message is never quoted.
  async function route(host: string, name: string, params: ReadonlyArray<readonly [string, string | number | undefined]>, deadlineAtMs?: number): Promise<unknown> {
    const body = await getJson(deps, "og", {
      url: `${host}${OG_PUBLIC_PATH}/${name}${queryOf(params)}`,
      ...(deadlineAtMs === undefined ? {} : { deadlineAtMs }),
      // The exchange reports an error inside a 400 body.
      bodyStatuses: [400],
    });
    const envelope = envelopeSchema.safeParse(body);
    if (!envelope.success) throw new AdapterFailure("og", "SCHEMA_DRIFT", "envelope");
    if (envelope.data.code === CODE_INVALID_INSTRUMENT) throw new AdapterFailure("og", "NOT_FOUND", "invalid_instrument");
    if (envelope.data.code !== 0) throw new AdapterFailure("og", "SCHEMA_DRIFT", `code_${Math.abs(envelope.data.code) % 100000}`);
    return envelope.data.result;
  }

  async function instrumentsOf(host: string, event: string, wantedKey: string | undefined, deadlineAtMs?: number): Promise<{ list: OgInstrument[]; truncated: boolean }> {
    const list: OgInstrument[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < OG_INSTRUMENT_PAGES_MAX; page += 1) {
      const result = await route(host, "get-instruments", [["event_symbols", event], ["limit", OG_INSTRUMENTS_LIMIT], ["cursor", cursor]], deadlineAtMs);
      const parsed = pageResultSchema.safeParse(result);
      if (!parsed.success) throw new AdapterFailure("og", "SCHEMA_DRIFT", "instruments_envelope");
      for (const row of parsed.data.data) {
        const instrument = instrumentSchema.safeParse(row);
        if (instrument.success) list.push(instrument.data);
      }
      const next = parsed.data.next_cursor;
      if (next === null || next === undefined || next === "" || parsed.data.data.length === 0) return { list, truncated: false };
      if (!OPAQUE_CURSOR.test(next)) throw new AdapterFailure("og", "SCHEMA_DRIFT", "bad_next_cursor");
      // A wanted market found on this page needs no further reading.
      if (wantedKey !== undefined && list.some((instrument) => instrument.symbol === wantedKey || instrument.event_details?.metaData?.["PREDICT_MARKET_ID"] === wantedKey)) return { list, truncated: false };
      cursor = next;
    }
    return { list, truncated: true };
  }

  async function tickersFor(host: string, symbols: readonly string[], deadlineAtMs?: number): Promise<Map<string, OgTicker>> {
    const out = new Map<string, OgTicker>();
    for (let at = 0; at < symbols.length; at += 100) {
      const chunk = symbols.slice(at, at + 100);
      const result = await route(host, "get-tickers", [["instrument_name", chunk.join(",")]], deadlineAtMs);
      const parsed = pageResultSchema.safeParse(result);
      if (!parsed.success) throw new AdapterFailure("og", "SCHEMA_DRIFT", "tickers_envelope");
      for (const row of parsed.data.data) {
        const ticker = tickerSchema.safeParse(row);
        // Only a ticker for an instrument that was asked for counts.
        if (ticker.success && chunk.includes(ticker.data.i)) out.set(ticker.data.i, ticker.data);
      }
    }
    return out;
  }

  // A ticker failure that says nothing about the venue's health leaves prices empty ("no data"), never zero.
  async function tickersOrEmpty(host: string, symbols: readonly string[], deadlineAtMs?: number): Promise<Map<string, OgTicker>> {
    if (symbols.length === 0) return new Map();
    try {
      return await tickersFor(host, symbols, deadlineAtMs);
    } catch (error) {
      if (isAdapterFailure(error) && (error.code === "RATE_LIMITED" || error.code === "VENUE_PAUSED")) throw error;
      return new Map();
    }
  }

  async function listDetailed(query: ListMarketsQuery): Promise<{ page: Page<MarketSummary>; rows: OgRow[] }> {
    const host = ready();
    if (query.text !== undefined && query.text.trim() !== "") throw new AdapterFailure("og", "NOT_SUPPORTED", "search_not_supported");
    const wanted = query.statuses === undefined || query.statuses.length === 0 ? ["active"] : query.statuses;
    // Instruments disappear from the listing when an event settles, so only active markets can be listed.
    if (!wanted.includes("active")) throw new AdapterFailure("og", "NOT_SUPPORTED", "status_not_supported");
    const limit = clampInt(query.limit, eventsPerPage, 1, OG_EVENTS_MAX);
    if (query.cursor !== undefined && query.cursor !== "" && !OPAQUE_CURSOR.test(query.cursor)) throw new AdapterFailure("og", "NOT_SUPPORTED", "bad_cursor");

    const eventsResult = await route(host, "get-events", [["since", 0], ["limit", limit], ["cursor", query.cursor === "" ? undefined : query.cursor]]);
    const eventsPage = pageResultSchema.safeParse(eventsResult);
    if (!eventsPage.success) throw new AdapterFailure("og", "SCHEMA_DRIFT", "events_envelope");
    const events: string[] = [];
    for (const row of eventsPage.data.data) {
      const parsed = eventRowSchema.safeParse(row);
      if (parsed.success && !events.includes(parsed.data.symbol)) events.push(parsed.data.symbol);
    }
    if (eventsPage.data.data.length > 0 && events.length === 0) throw new AdapterFailure("og", "SCHEMA_DRIFT", "events_do_not_match_schema");
    const next = eventsPage.data.next_cursor;
    if (next !== null && next !== undefined && next !== "" && !OPAQUE_CURSOR.test(next)) throw new AdapterFailure("og", "SCHEMA_DRIFT", "bad_next_cursor");

    const groups: Grouped[] = [];
    let truncatedEvents = 0;
    // One event at a time: an event can list hundreds of instruments and the route is shared and rate-limited.
    for (const event of events) {
      const { list, truncated } = await instrumentsOf(host, event, undefined);
      if (truncated) truncatedEvents += 1;
      groups.push(groupMarkets(list, event, OG_MARKETS_PER_EVENT, headlineOnly));
    }
    const all = groups.flatMap((group) => group.markets);
    const tickers = await tickersOrEmpty(host, all.flatMap((market) => market.instruments.map((instrument) => instrument.symbol)));
    const now = deps.nowMs();
    const items: MarketSummary[] = [];
    const rows: OgRow[] = [];
    for (const market of all) {
      markets.set(marketIdOf(market), market, OG_LIST_TTL_MS);
      items.push(summaryOf(market, tickers, now, transport));
      rows.push({ quotes: market.instruments.map((instrument) => quoteOf(instrument.symbol, tickers.get(instrument.symbol))) });
    }
    report = {
      events: events.length,
      markets: items.length,
      skippedNotBinary: groups.reduce((sum, group) => sum + group.skipped.notBinary, 0),
      skippedNotHeadline: groups.reduce((sum, group) => sum + group.skipped.notHeadline, 0),
      skippedOverCap: groups.reduce((sum, group) => sum + group.skipped.overCap, 0),
      truncatedEvents,
      fetchedAtMs: now,
    };
    return { page: { items, next: next === null || next === undefined || next === "" ? null : next }, rows };
  }

  async function detail(ref: MarketRef): Promise<OgMarketDetail> {
    const host = ready();
    if (ref.venue !== "og") throw new AdapterFailure("og", "NOT_FOUND", "wrong_venue");
    const parsed = parseMarketId(ref.marketId);
    if (parsed === null || !EVENT_SYMBOL.test(parsed.event)) throw new AdapterFailure("og", "NOT_FOUND", "bad_market_id");
    const { list } = await instrumentsOf(host, parsed.event, parsed.key);
    // The same grouping as the list, over every market of the event, then the wanted one.
    const grouped = groupMarkets(list, parsed.event, Number.MAX_SAFE_INTEGER, false);
    const market = grouped.markets.find((candidate) => candidate.key === parsed.key);
    if (market === undefined) throw new AdapterFailure("og", "NOT_FOUND", "market_not_listed");
    markets.set(marketIdOf(market), market, OG_LIST_TTL_MS);
    const tickers = await tickersOrEmpty(host, market.instruments.map((instrument) => instrument.symbol));
    const now = deps.nowMs();
    const built = marketOf(market, now);
    const notes = [
      "These are reference prices only. The venue's own trading needs a verified account with a futures commission merchant.",
      "The venue's listing carries no lifecycle state here, so a market that has just closed may still appear as active until it disappears from the list.",
    ];
    if (built.fee.modelId === "curve_pq") notes.push("The fee is the US schedule from the venue's help centre, not an API field.");
    if (built.fee.modelId === "unknown") notes.push("The fee for this category or customer region is not modelled.");
    return { market: built, notes, quotes: market.instruments.map((instrument) => quoteOf(instrument.symbol, tickers.get(instrument.symbol))) };
  }

  async function getBooks(tokens: readonly TokenRef[], opts: { readonly deadlineMs: number }): Promise<ReadonlyArray<Result<Book, AdapterError>>> {
    const out: Array<Result<Book, AdapterError>> = tokens.map(() => ({ ok: false, error: "NOT_FOUND" }));
    let host: string;
    try {
      host = ready();
    } catch {
      return tokens.map(() => ({ ok: false, error: "NOT_SUPPORTED" }));
    }
    const deadlineAtMs = resolveDeadline(opts.deadlineMs, deps.nowMs());
    const failure = (error: unknown): AdapterError => (isAdapterFailure(error) ? error.code : error instanceof BookShapeError ? "SCHEMA_DRIFT" : "TIMEOUT");
    // One request per distinct instrument, in order.
    const done = new Map<string, Result<Book, AdapterError>>();
    for (const [index, token] of tokens.entries()) {
      if (token.venue !== "og" || !INSTRUMENT_SYMBOL.test(token.tokenId)) continue;
      const cached = done.get(token.tokenId);
      if (cached !== undefined) {
        out[index] = cached;
        continue;
      }
      let result: Result<Book, AdapterError>;
      try {
        const answer = await route(host, "get-book", [["instrument_name", token.tokenId], ["depth", OG_BOOK_DEPTH]], deadlineAtMs);
        const parsed = bookResultSchema.safeParse(answer);
        if (!parsed.success) throw new AdapterFailure("og", "SCHEMA_DRIFT", "book_envelope");
        // The venue must answer for the instrument that was asked for.
        if (parsed.data.instrument_name !== undefined && parsed.data.instrument_name !== token.tokenId) throw new AdapterFailure("og", "SCHEMA_DRIFT", "book_instrument_mismatch");
        const built = bookOf(token.tokenId, parsed.data.data[0], deps.nowMs());
        if (built.venueTsMs !== null && deps.nowMs() - built.venueTsMs > OG_MAX_BOOK_AGE_MS) result = { ok: false, error: "STALE" };
        else if (built.book.bids.length === 0 && built.book.asks.length === 0) result = { ok: false, error: "EMPTY_BOOK" };
        else result = { ok: true, value: built.book };
      } catch (error) {
        result = { ok: false, error: failure(error) };
      }
      done.set(token.tokenId, result);
      out[index] = result;
    }
    return out;
  }

  async function getFeeSpec(market: Market): Promise<FeeSpec> {
    ready();
    if (market.ref.venue !== "og") throw new AdapterFailure("og", "NOT_FOUND", "wrong_venue");
    // The fee is a documented table, not an API field: it is re-derived from the market at the moment of the
    // question so that the category and the expiry of the documented constants are checked now.
    const cached = markets.get(market.ref.marketId);
    const source = cached ?? (await refetch(market.ref));
    return feeSpecOf(source, deps.nowMs());
  }

  async function refetch(ref: MarketRef): Promise<OgMarket> {
    await detail(ref);
    const found = markets.get(ref.marketId);
    if (found === undefined) throw new AdapterFailure("og", "NOT_FOUND", "market_not_listed");
    return found;
  }

  async function health(): Promise<VenueHealth> {
    const host = ready();
    const result = await route(host, "get-events", [["limit", 1]]);
    const parsed = pageResultSchema.safeParse(result);
    return parsed.success ? { ok: true, notes: ["The public market-data route answered."] } : { ok: false, notes: ["The events answer is not the shape this adapter reads."] };
  }

  return {
    id: "og",
    caps: CAPS,
    listMarkets: async (query) => (await listDetailed(query)).page,
    listMarketsDetailed: async (query) => listDetailed(query),
    getMarket: async (ref) => (await detail(ref)).market,
    getMarketDetail: detail,
    getBooks,
    getFeeSpec,
    health,
    lastReadReport: () => report,
    clearMemory: () => markets.clear(),
  };
}
