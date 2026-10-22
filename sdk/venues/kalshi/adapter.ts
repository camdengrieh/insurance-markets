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
} from "../../model.js";
import { DEFAULT_SWITCHES, venueState, type BuildKind, type VenueSwitches } from "../policy.js";
import { KALSHI_API_PREFIX, KALSHI_LIST_PAGE_DEFAULT, KALSHI_LIST_PAGE_MAX, KALSHI_LIST_STATUS, checkedOrigin, registeredOrigin } from "./constants.js";
import { AdapterFailure, isAdapterFailure } from "./errors.js";
import { getJson, resolveDeadline } from "./http.js";
import { bookOf, feeSpecOf, marketOf, parseTokenId, unknownFee } from "./map.js";
import { parseBookEnvelope, parseEventBody, parseExchangeStatus, parseListBody, parseMarketBody, parseSeriesBody, readBook, type KalshiBookRead, type KalshiMarketRead } from "./parse.js";
import { CURSOR, TICKER } from "./schemas.js";

// Kalshi: a CFTC-regulated USD exchange. Read-only, public market data only; every request is a GET without any
// credential. RESTRICTED TERMS (docs/dapp-design.md 4.8 R3, R5, R8, R10 and fork F5): the adapter is OFF until the
// user turns the venue on and accepts the clause (sdk/venues/policy.ts decides), it is excluded from the
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
  // Test seam: an https origin that replaces the one in sdk/venues/origins.ts.
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

function statusParam(statuses: readonly Status[] | undefined): string {
  const wanted = statuses === undefined || statuses.length === 0 ? (["active"] as const) : [...new Set(statuses)];
  if (wanted.length !== 1) throw new AdapterFailure("kalshi", "NOT_SUPPORTED", "one_status_per_call");
  const status = wanted[0];
  const param = status === undefined ? undefined : KALSHI_LIST_STATUS[status];
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

  async function readMarket(ticker: string, base: string, deadlineAtMs?: number): Promise<KalshiMarketRead> {
    const body = await getJson(deps, { url: `${base}${KALSHI_API_PREFIX}/markets/${ticker}`, ...(deadlineAtMs === undefined ? {} : { deadlineAtMs }), notFoundStatuses: [404] });
    // The shared parser refuses another market's answer, a non-binary or combo market, and untrustworthy ticks.
    const read = parseMarketBody(body, ticker);
    if (!read.ok) throw new AdapterFailure("kalshi", read.error, read.detail);
    return read.value;
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
    const read = parseListBody(body, base, fetchedAtMs);
    const counts = read.ok ? read.value : read.counts;
    if (counts !== null) report = { parsed: counts.parsed, dropped: counts.dropped, skippedUnsupported: counts.skippedUnsupported, fetchedAtMs };
    if (!read.ok) throw new AdapterFailure("kalshi", read.error, read.detail);
    return { items: read.value.items, next: read.value.next };
  }

  async function getMarket(ref: MarketRef): Promise<Market> {
    const base = guard();
    const ticker = tickerOf(ref);
    const read = await readMarket(ticker, base);
    return marketOf(read.row, read.ticks, base, deps.nowMs());
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
    const fetched = new Map<string, Promise<Result<KalshiBookRead, AdapterError>>>();
    const read = (ticker: string): Promise<Result<KalshiBookRead, AdapterError>> => {
      let pending = fetched.get(ticker);
      if (pending === undefined) {
        pending = getJson(deps, { url: `${base}${KALSHI_API_PREFIX}/markets/${ticker}/orderbook`, deadlineAtMs, notFoundStatuses: [404] }).then(
          (body): Result<KalshiBookRead, AdapterError> => {
            const envelope = parseBookEnvelope(body);
            if (envelope === null) return { ok: false, error: "SCHEMA_DRIFT" };
            const book = readBook(envelope);
            return book.ok ? book : { ok: false, error: book.error };
          },
          (error: unknown): Result<KalshiBookRead, AdapterError> => ({ ok: false, error: isAdapterFailure(error) ? error.code : "SCHEMA_DRIFT" }),
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
      out.push({ ok: true, value: bookOf(id.side, id.ticker, venueBook.value, deps.nowMs()) });
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
    const event = parseEventBody(eventBody, eventTicker);
    if (event === null) throw new AdapterFailure("kalshi", "SCHEMA_DRIFT", "event_shape");
    const seriesBody = await getJson(deps, { url: `${base}${KALSHI_API_PREFIX}/series/${event.seriesTicker}`, notFoundStatuses: [404] });
    const series = parseSeriesBody(seriesBody, event.seriesTicker);
    if (series === null) throw new AdapterFailure("kalshi", "SCHEMA_DRIFT", "series_shape");
    return feeSpecOf(series, base, deps.nowMs());
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
      const status = parseExchangeStatus(body);
      if (status === null) return { ok: false, notes: ["status_shape"] };
      return { ok: status.exchangeActive && status.tradingActive, notes: [status.exchangeActive ? "exchange_active" : "exchange_inactive", status.tradingActive ? "trading_active" : "trading_inactive"] };
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
