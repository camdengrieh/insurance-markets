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
  Status,
  TokenRef,
  VenueHealth,
  VenueReadAdapter,
} from "../../core/ports";
import { DEFAULT_SWITCHES, venueState, type BuildKind, type VenueSwitches } from "../../core/venue-policy";
import { KALSHI_API_PREFIX, KALSHI_LIST_PAGE_DEFAULT, KALSHI_LIST_PAGE_MAX, KALSHI_MAX_DROPPED_SHARE, checkedOrigin, registeredOrigin } from "./constants";
import { AdapterFailure, isAdapterFailure } from "./errors";
import { getJson, resolveDeadline } from "./http";
import { bookOf, feeSpecOf, marketOf, parseBook, parseTokenId, summaryOf, tickRangesOf, unknownFee } from "./map";
import { CURSOR, TICKER, bookEnvelopeSchema, eventEnvelopeSchema, exchangeStatusSchema, listEnvelopeSchema, marketEnvelopeSchema, rowHeadSchema, rowSchema, seriesEnvelopeSchema, type KalshiRow } from "./schemas";

// Kalshi: a CFTC-regulated USD exchange. Read-only, public market data only; every request is a GET without any
// credential. RESTRICTED TERMS (docs/dapp-design.md 4.8 R3, R5, R8, R10 and fork F5): the adapter is OFF until the
// user turns the venue on and accepts the clause (core/venue-policy.ts decides), it is excluded from the
// day-zero daemon list, it has no cache and touches no storage, and its rows are marked own-use-only so no
// other module persists or exports them. The host answers 403 whenever an Origin header is sent, so it is read
// only through the local Cockpit's plain client; this adapter never works around a block (a 403 is a pause).

const CAPS: AdapterCaps = {
  listMarkets: true,
  // The public markets route has no text search.
  search: false,
  getMarket: true,
  getBook: true,
  getBooksBatch: false,
  getFeeSpec: true,
  getResolution: false,
  // Positions are signed routes needing the user's own key: not built.
  getPositionsByAddress: false,
  stream: false,
};

export interface KalshiOptions {
  // "standalone" refuses every call (the host is blocked for browsers); "cockpit" reads through the daemon.
  readonly build: BuildKind;
  // Read on every call. The default is the venue's own default: OFF, until the clause is accepted.
  readonly switches?: () => VenueSwitches;
  // Test seam: an https origin that replaces the one in headers.config.ts.
  readonly origin?: string;
}

export interface KalshiReadReport {
  readonly parsed: number;
  readonly dropped: number;
  // Rows that are not binary markets (scalar and the like): skipped, not repaired.
  readonly skippedUnsupported: number;
  readonly fetchedAtMs: number;
}

export interface KalshiAdapter extends VenueReadAdapter {
  readonly id: "kalshi";
  readonly origin: string | null;
  // Restricted terms: the rows this adapter returns must be kept in memory only and never exported.
  readonly memoryOnly: true;
  lastReadReport(): KalshiReadReport;
}

// Port status -> the route's `status` query value. Only these can be listed; one value per call.
const LISTABLE: Readonly<Partial<Record<Status, string>>> = { active: "open", pending: "unopened", paused: "paused", closed: "closed", resolved: "settled" };

function statusParam(statuses: readonly Status[] | undefined): string {
  const wanted = statuses === undefined || statuses.length === 0 ? (["active"] as const) : [...new Set(statuses)];
  if (wanted.length !== 1) throw new AdapterFailure("kalshi", "NOT_SUPPORTED", "one_status_per_call");
  const status = wanted[0];
  const param = status === undefined ? undefined : LISTABLE[status];
  if (param === undefined) throw new AdapterFailure("kalshi", "NOT_SUPPORTED", "status_not_listable");
  return param;
}

function tickerOf(ref: MarketRef): string {
  if (ref.venue !== "kalshi") throw new AdapterFailure("kalshi", "NOT_SUPPORTED", "wrong_venue");
  if (!TICKER.test(ref.marketId)) throw new AdapterFailure("kalshi", "NOT_FOUND", "bad_market_id");
  return ref.marketId;
}

export function createKalshiAdapter(deps: AdapterDeps, options: KalshiOptions): KalshiAdapter {
  const origin = options.origin !== undefined ? checkedOrigin(options.origin) : registeredOrigin("kalshi");
  const switches = options.switches ?? ((): VenueSwitches => DEFAULT_SWITCHES);
  let report: KalshiReadReport = { parsed: 0, dropped: 0, skippedUnsupported: 0, fetchedAtMs: 0 };

  // The one place that decides whether a call may go out at all.
  function guard(): string {
    const state = venueState("kalshi", switches(), options.build);
    if (!state.enabled) throw new AdapterFailure("kalshi", "NOT_SUPPORTED", state.reason);
    if (origin === null) throw new AdapterFailure("kalshi", "NOT_SUPPORTED", "origin_not_registered");
    return origin;
  }

  async function readMarket(ticker: string, base: string, deadlineAtMs?: number): Promise<KalshiRow> {
    const body = await getJson(deps, { url: `${base}${KALSHI_API_PREFIX}/markets/${ticker}`, ...(deadlineAtMs === undefined ? {} : { deadlineAtMs }), notFoundStatuses: [404] });
    const envelope = marketEnvelopeSchema.safeParse(body);
    if (!envelope.success) throw new AdapterFailure("kalshi", "SCHEMA_DRIFT", "market_shape");
    const row = rowSchema.safeParse(envelope.data.market);
    if (!row.success) throw new AdapterFailure("kalshi", "SCHEMA_DRIFT", "market_shape");
    // The venue answered for a different market than the one asked for: never show it as the requested one.
    if (row.data.ticker !== ticker) throw new AdapterFailure("kalshi", "SCHEMA_DRIFT", "ticker_mismatch");
    if (row.data.market_type !== "binary") throw new AdapterFailure("kalshi", "NOT_SUPPORTED", "unsupported_market");
    return row.data;
  }

  async function listMarkets(q: ListMarketsQuery): Promise<Page<MarketSummary>> {
    const base = guard();
    if (q.text !== undefined && q.text !== "") throw new AdapterFailure("kalshi", "NOT_SUPPORTED", "text_search");
    const status = statusParam(q.statuses);
    const limit = Math.min(Math.max(Math.trunc(q.limit ?? KALSHI_LIST_PAGE_DEFAULT), 1), KALSHI_LIST_PAGE_MAX);
    if (q.cursor !== undefined && q.cursor !== "" && !CURSOR.test(q.cursor)) throw new AdapterFailure("kalshi", "NOT_SUPPORTED", "bad_cursor");
    const fetchedAtMs = deps.nowMs();
    // Combos (multivariate events) are excluded: their legs are not modelled.
    const cursor = q.cursor === undefined || q.cursor === "" ? "" : `&cursor=${q.cursor}`;
    const body = await getJson(deps, { url: `${base}${KALSHI_API_PREFIX}/markets?status=${status}&limit=${limit}&mve_filter=exclude${cursor}` });
    const envelope = listEnvelopeSchema.safeParse(body);
    if (!envelope.success) throw new AdapterFailure("kalshi", "SCHEMA_DRIFT", "list_shape");

    const items: MarketSummary[] = [];
    let dropped = 0;
    let skipped = 0;
    for (const raw of envelope.data.markets) {
      const head = rowHeadSchema.safeParse(raw);
      if (!head.success) {
        dropped += 1;
        continue;
      }
      if (head.data.market_type !== "binary") {
        skipped += 1;
        continue;
      }
      const row = rowSchema.safeParse(raw);
      if (!row.success || tickRangesOf(row.data.price_ranges) === null) {
        dropped += 1;
        continue;
      }
      items.push(summaryOf(row.data, base, fetchedAtMs));
    }
    report = { parsed: items.length, dropped, skippedUnsupported: skipped, fetchedAtMs };
    if (envelope.data.markets.length > 0 && items.length === 0 && skipped === 0) throw new AdapterFailure("kalshi", "SCHEMA_DRIFT", "no_valid_rows");
    if (items.length + dropped > 0 && dropped / (items.length + dropped) > KALSHI_MAX_DROPPED_SHARE) throw new AdapterFailure("kalshi", "SCHEMA_DRIFT", "too_many_invalid_rows");

    const next = envelope.data.cursor;
    if (typeof next === "string" && next !== "" && !CURSOR.test(next)) throw new AdapterFailure("kalshi", "SCHEMA_DRIFT", "bad_next_cursor");
    return { items, next: typeof next === "string" && next !== "" ? next : null };
  }

  async function getMarket(ref: MarketRef): Promise<Market> {
    const base = guard();
    const ticker = tickerOf(ref);
    const row = await readMarket(ticker, base);
    const ticks = tickRangesOf(row.price_ranges);
    if (ticks === null) throw new AdapterFailure("kalshi", "SCHEMA_DRIFT", "price_ranges");
    return marketOf(row, ticks, base, deps.nowMs());
  }

  async function getBooks(tokens: readonly TokenRef[], opts: { readonly deadlineMs: number }): Promise<ReadonlyArray<Result<Book, AdapterError>>> {
    const fail = (error: AdapterError): Result<Book, AdapterError> => ({ ok: false, error });
    let base: string;
    try {
      base = guard();
    } catch (error) {
      const code = isAdapterFailure(error) ? error.code : "NOT_SUPPORTED";
      return tokens.map(() => fail(code));
    }
    const deadlineAtMs = resolveDeadline(opts.deadlineMs, deps.nowMs());
    // One venue book per market serves both of its tokens.
    const fetched = new Map<string, Promise<{ readonly ok: true; readonly body: ReturnType<typeof bookEnvelopeSchema.parse>["orderbook_fp"] } | { readonly ok: false; readonly error: AdapterError }>>();
    const read = (ticker: string) => {
      let pending = fetched.get(ticker);
      if (pending === undefined) {
        pending = getJson(deps, { url: `${base}${KALSHI_API_PREFIX}/markets/${ticker}/orderbook`, deadlineAtMs, notFoundStatuses: [404] }).then(
          (body) => {
            const parsed = bookEnvelopeSchema.safeParse(body);
            return parsed.success ? { ok: true as const, body: parsed.data.orderbook_fp } : { ok: false as const, error: "SCHEMA_DRIFT" as AdapterError };
          },
          (error: unknown) => ({ ok: false as const, error: isAdapterFailure(error) ? error.code : ("SCHEMA_DRIFT" as AdapterError) }),
        );
        fetched.set(ticker, pending);
      }
      return pending;
    };

    const out: Array<Result<Book, AdapterError>> = [];
    for (const token of tokens) {
      const id = token.venue === "kalshi" ? parseTokenId(token.tokenId) : null;
      if (id === null) {
        out.push(fail("NOT_SUPPORTED"));
        continue;
      }
      const venueBook = await read(id.ticker);
      if (!venueBook.ok) {
        out.push(fail(venueBook.error));
        continue;
      }
      const parsed = parseBook(venueBook.body);
      if (!parsed.ok) {
        out.push(fail("SCHEMA_DRIFT"));
        continue;
      }
      if (parsed.yesBids.length === 0 && parsed.noBids.length === 0) {
        out.push(fail("EMPTY_BOOK"));
        continue;
      }
      out.push({ ok: true, value: bookOf(id.side, id.ticker, parsed, deps.nowMs()) });
    }
    return out;
  }

  // The fee lives on the series. Two reads: the market's event names its series, the series names the fee model.
  // Anything but a plain quadratic series is unknown (fail closed, never a default); a failed read throws.
  async function getFeeSpec(market: Market): Promise<FeeSpec> {
    const base = guard();
    const ticker = tickerOf(market.ref);
    const eventTicker = market.ref.native["event_ticker"];
    const now = deps.nowMs();
    if (eventTicker === undefined || !TICKER.test(eventTicker)) return unknownFee(base, ticker, now);
    const eventBody = await getJson(deps, { url: `${base}${KALSHI_API_PREFIX}/events/${eventTicker}`, notFoundStatuses: [404] });
    const event = eventEnvelopeSchema.safeParse(eventBody);
    if (!event.success || event.data.event.event_ticker !== eventTicker) throw new AdapterFailure("kalshi", "SCHEMA_DRIFT", "event_shape");
    const seriesTicker = event.data.event.series_ticker;
    const seriesBody = await getJson(deps, { url: `${base}${KALSHI_API_PREFIX}/series/${seriesTicker}`, notFoundStatuses: [404] });
    const series = seriesEnvelopeSchema.safeParse(seriesBody);
    if (!series.success || series.data.series.ticker !== seriesTicker) throw new AdapterFailure("kalshi", "SCHEMA_DRIFT", "series_shape");
    return feeSpecOf(series.data.series, base, deps.nowMs());
  }

  async function health(): Promise<VenueHealth> {
    let base: string;
    try {
      base = guard();
    } catch (error) {
      return { ok: false, notes: [isAdapterFailure(error) ? error.detail : "unavailable"] };
    }
    try {
      const body = await getJson(deps, { url: `${base}${KALSHI_API_PREFIX}/exchange/status` });
      const status = exchangeStatusSchema.safeParse(body);
      if (!status.success) return { ok: false, notes: ["status_shape"] };
      return { ok: status.data.exchange_active && status.data.trading_active, notes: [status.data.exchange_active ? "exchange_active" : "exchange_inactive", status.data.trading_active ? "trading_active" : "trading_inactive"] };
    } catch (error) {
      return { ok: false, notes: [isAdapterFailure(error) ? error.detail : "unavailable"] };
    }
  }

  return {
    id: "kalshi",
    caps: CAPS,
    origin,
    memoryOnly: true,
    listMarkets,
    getMarket,
    getBooks,
    getFeeSpec,
    health,
    lastReadReport: () => report,
  };
}
