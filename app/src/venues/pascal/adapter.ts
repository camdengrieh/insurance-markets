import { fromAtomic, notional, parseQty, toDec, type Qty } from "../../core/money";
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
  Prov,
  Result,
  Status,
  TokenRef,
  VenueHealth,
  VenueReadAdapter,
} from "../../core/ports";
import { isSolanaAddress } from "./base58";
import {
  PASCAL_API_BASE,
  PASCAL_BOOKS_MAX_SYMBOLS,
  PASCAL_LIST_PAGE_DEFAULT,
  PASCAL_LIST_PAGE_MAX,
  PASCAL_LIST_TTL_MS,
  PASCAL_MAX_DROPPED_SHARE,
  PASCAL_MAX_STATE_LAG_MS,
  PASCAL_TERMS_NOTE,
} from "./constants";
import { AdapterFailure } from "./errors";
import { getJson, resolveDeadline } from "./http";
import { bookOf, COLLATERAL, complement, crossed, feeSpecOf, isCrossedPair, marketOf, parseTokenId, provOf, refOf, sortLevels, statusOf, summaryOf, tokenIdOf, type RawLevel } from "./map";
import type { VenuePosition } from "./positions";
import { parseRows, type PascalRow } from "./rows";
import { accountDataSchema, accountPositionSchema, bookSchema, booksDataSchema, envelopeSchema, marketsDataSchema, msOf, SYMBOL } from "./schemas";

// Pascal (Solana): a noncustodial exchange with an off-chain central limit order book. Read-only, keyless,
// every request a GET to the data host. Market data is T0 (browser-direct, CORS `*`). There are no outcome
// tokens: a market has a long side (pays p) and a short side (pays 1 - p), and the short book is the long
// book read from the other end, so it is a labelled complement and never extra liquidity.
// Sources: docs/research/venues/pascal.md, docs/dapp-design.md 4.2, 4.6, 7.2 (M0).

const CAPS: AdapterCaps = {
  listMarkets: true,
  // Free text is matched client-side over the full snapshot (the venue's text-search route is a POST and is
  // not used).
  search: true,
  getMarket: true,
  getBook: true,
  getBooksBatch: true,
  getFeeSpec: true,
  // Resolved markets and settlement prices come from /markets/resolved, whose shape was never recorded.
  getResolution: false,
  getPositionsByAddress: true,
  stream: false,
};

export interface PascalReadReport {
  readonly parsed: number;
  readonly dropped: number;
  readonly fetchedAtMs: number;
}

export interface PascalAccountSummary {
  readonly collateralUsd: string | null;
  readonly pendingDepositsUsd: string | null;
}

export interface PascalPositions {
  // false: the venue answered 404 for this owner (no Pascal account).
  readonly registered: boolean;
  readonly account: PascalAccountSummary | null;
  readonly positions: readonly VenuePosition[];
  // Positions with no mark (no market in the list, or a one-sided book): their value is null, not zero.
  readonly unmarked: number;
  // The populated /accounts/{owner} answer was never observed; the UI labels this "synthetic-shape tested".
  readonly shape: "synthetic";
  readonly prov: Prov;
}

export interface PascalOptions {
  // Label for the transport of the injected fetch: "T0" in the standalone build, "T1" through the daemon.
  readonly transport?: "T0" | "T1";
}

export interface PascalAdapter extends VenueReadAdapter {
  readonly id: "pascal";
  lastReadReport(): PascalReadReport;
  positionsByAddress(owner: string, options: { readonly bindingId: string; readonly deadlineMs?: number }): Promise<PascalPositions>;
}

interface Snapshot {
  readonly fetchedAtMs: number;
  readonly stateTimeMs: number | undefined;
  readonly serverTimeMs: number | undefined;
  readonly rows: readonly PascalRow[];
  readonly bySymbol: ReadonlyMap<string, PascalRow>;
  readonly dropped: number;
}

interface Unwrapped {
  readonly data: unknown;
  readonly stateTimeMs: number | undefined;
  readonly serverTimeMs: number | undefined;
}

// {status:"success", data, seq, state_time_ms, server_time_ms}. Anything else is a drift, except an error
// envelope that names the one code this adapter understands.
export function unwrapEnvelope(body: unknown): Unwrapped {
  const parsed = envelopeSchema.safeParse(body);
  if (!parsed.success) throw new AdapterFailure("pascal", "SCHEMA_DRIFT", "envelope");
  const envelope = parsed.data;
  if (envelope.status !== "success") {
    const record = body as { code?: unknown; error?: unknown };
    const named = typeof record.code === "string" ? record.code : typeof record.error === "string" ? record.error : (record.error as { code?: unknown } | undefined)?.code;
    if (named === "RATE_LIMITED") throw new AdapterFailure("pascal", "RATE_LIMITED", "venue_error");
    throw new AdapterFailure("pascal", "SCHEMA_DRIFT", "venue_error");
  }
  return { data: envelope.data, stateTimeMs: msOf(envelope.state_time_ms) ?? undefined, serverTimeMs: msOf(envelope.server_time_ms) ?? undefined };
}

function stateLagMs(unwrapped: Unwrapped): number {
  return unwrapped.stateTimeMs !== undefined && unwrapped.serverTimeMs !== undefined ? unwrapped.serverTimeMs - unwrapped.stateTimeMs : 0;
}

function canonicalUsd(text: string | undefined): string | null {
  const qty = text === undefined ? null : parseQty("usd", text, { maxScale: 6 });
  return qty === null ? null : toDec(qty);
}

function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor === "") return 0;
  if (!/^\d{1,6}$/.test(cursor)) throw new AdapterFailure("pascal", "NOT_SUPPORTED", "bad_cursor");
  return Number(cursor);
}

export function createPascalAdapter(deps: AdapterDeps, options: PascalOptions = {}): PascalAdapter {
  const transport = options.transport ?? "T0";
  let cached: Snapshot | undefined;
  let inflight: Promise<Snapshot> | undefined;
  let report: PascalReadReport = { parsed: 0, dropped: 0, fetchedAtMs: 0 };

  async function loadSnapshot(deadlineAtMs: number | undefined): Promise<Snapshot> {
    const body = await getJson(deps, { url: `${PASCAL_API_BASE}/markets`, ...(deadlineAtMs === undefined ? {} : { deadlineAtMs }) });
    const unwrapped = unwrapEnvelope(body);
    if (stateLagMs(unwrapped) > PASCAL_MAX_STATE_LAG_MS) throw new AdapterFailure("pascal", "STALE", "state_behind_server");
    const list = marketsDataSchema.safeParse(unwrapped.data);
    if (!list.success) throw new AdapterFailure("pascal", "SCHEMA_DRIFT", "markets_not_a_list");
    const { rows, dropped } = parseRows(list.data);
    // An empty list is a real answer only if the venue sent no rows; a list of rows that all fail is a drift.
    if (list.data.length > 0 && (rows.length === 0 || dropped / list.data.length > PASCAL_MAX_DROPPED_SHARE)) {
      throw new AdapterFailure("pascal", "SCHEMA_DRIFT", "rows_do_not_match_schema");
    }
    const fetchedAtMs = deps.nowMs();
    report = { parsed: rows.length, dropped, fetchedAtMs };
    return {
      fetchedAtMs,
      stateTimeMs: unwrapped.stateTimeMs,
      serverTimeMs: unwrapped.serverTimeMs,
      rows,
      bySymbol: new Map(rows.map((row) => [row.symbol, row] as const)),
      dropped,
    };
  }

  // One in-flight request, and a short memory cache: /markets is one answer of about 6 MB with no paging.
  async function snapshot(deadlineAtMs?: number): Promise<Snapshot> {
    if (cached !== undefined && deps.nowMs() - cached.fetchedAtMs < PASCAL_LIST_TTL_MS) return cached;
    if (inflight === undefined) {
      inflight = loadSnapshot(deadlineAtMs)
        .then((value) => {
          cached = value;
          return value;
        })
        .finally(() => {
          inflight = undefined;
        });
    }
    return inflight;
  }

  function allowedStatuses(query: ListMarketsQuery): ReadonlySet<Status> {
    return new Set<Status>(query.statuses === undefined || query.statuses.length === 0 ? ["active"] : query.statuses);
  }

  async function listMarkets(query: ListMarketsQuery): Promise<Page<MarketSummary>> {
    const statuses = allowedStatuses(query);
    // /markets lists only unresolved markets, so a request that wants nothing else cannot be served from it.
    // Silence would read as "no markets": say so.
    if (![...statuses].some((status) => status === "active" || status === "unknown")) throw new AdapterFailure("pascal", "NOT_SUPPORTED", "only_unresolved_markets");
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? PASCAL_LIST_PAGE_DEFAULT), 1), PASCAL_LIST_PAGE_MAX);
    const offset = parseCursor(query.cursor);
    const snap = await snapshot();
    const now = deps.nowMs();
    const needle = query.text === undefined ? "" : query.text.trim().toLowerCase().slice(0, 200);

    // Filter and order the cheap row form first; build (and sanitise) summaries for the one page only.
    const matched = snap.rows.filter((row) => statuses.has(statusOf(row, now)) && (needle === "" || row.titleText.toLowerCase().includes(needle) || row.symbol.toLowerCase().includes(needle)));
    // Busiest first (24 hour notional), then by symbol, so a page is deterministic.
    const volumeOf = (row: PascalRow): bigint => (row.volume24h === null ? -1n : row.volume24h.atomic * 10n ** BigInt(6 - Math.min(row.volume24h.scale, 6)));
    matched.sort((a, b) => {
      const va = volumeOf(a);
      const vb = volumeOf(b);
      if (va !== vb) return va > vb ? -1 : 1;
      return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
    });
    const items = matched.slice(offset, offset + limit).map((row) => summaryOf(row, now, snap.stateTimeMs, transport));
    return { items, next: offset + limit < matched.length ? String(offset + limit) : null };
  }

  async function getMarket(ref: MarketRef): Promise<Market> {
    if (ref.venue !== "pascal" || !SYMBOL.test(ref.marketId)) throw new AdapterFailure("pascal", "NOT_FOUND", "bad_ref");
    const snap = await snapshot();
    const row = snap.bySymbol.get(ref.marketId);
    if (row === undefined) throw new AdapterFailure("pascal", "NOT_FOUND", "unknown_symbol");
    return marketOf(row, deps.nowMs(), snap.stateTimeMs);
  }

  function parseBookSide(levels: readonly (readonly [string, string])[]): RawLevel[] | null {
    const out: RawLevel[] = [];
    for (const [priceText, sizeText] of levels) {
      const price = parseQty("price", priceText, { maxScale: 6 });
      const size = parseQty("contracts", sizeText, { maxScale: 6 });
      if (price === null || size === null) return null;
      // A price of 0 or 1 is not a quote; a zero size is an empty level.
      if (price.atomic <= 0n || price.atomic >= 10n ** BigInt(price.scale)) return null;
      out.push({ price, size });
    }
    return out;
  }

  async function getBooks(tokens: readonly TokenRef[], opts: { readonly deadlineMs: number }): Promise<ReadonlyArray<Result<Book, AdapterError>>> {
    const results: Array<Result<Book, AdapterError> | undefined> = tokens.map(() => undefined);
    const wanted = new Map<string, number[]>();
    tokens.forEach((token, index) => {
      const parsed = token.venue === "pascal" ? parseTokenId(token.tokenId) : null;
      if (parsed === null || !SYMBOL.test(parsed.symbol)) {
        results[index] = { ok: false, error: "NOT_FOUND" };
        return;
      }
      const list = wanted.get(parsed.symbol) ?? [];
      list.push(index);
      wanted.set(parsed.symbol, list);
    });

    const deadlineAtMs = resolveDeadline(opts.deadlineMs, deps.nowMs());
    const symbols = [...wanted.keys()];
    for (let from = 0; from < symbols.length; from += PASCAL_BOOKS_MAX_SYMBOLS) {
      const chunk = symbols.slice(from, from + PASCAL_BOOKS_MAX_SYMBOLS);
      let failure: AdapterError | undefined;
      let unwrapped: Unwrapped | undefined;
      try {
        const body = await getJson(deps, { url: `${PASCAL_API_BASE}/books?symbols=${chunk.join(",")}`, deadlineAtMs });
        unwrapped = unwrapEnvelope(body);
      } catch (error) {
        failure = error instanceof AdapterFailure ? error.code : "TIMEOUT";
      }
      const books = unwrapped === undefined ? undefined : booksDataSchema.safeParse(unwrapped.data);
      for (const symbol of chunk) {
        for (const index of wanted.get(symbol) ?? []) {
          const side = parseTokenId(tokens[index]?.tokenId ?? "")?.side ?? "long";
          if (failure !== undefined) {
            results[index] = { ok: false, error: failure };
            continue;
          }
          if (books === undefined || !books.success || unwrapped === undefined) {
            results[index] = { ok: false, error: "SCHEMA_DRIFT" };
            continue;
          }
          if (stateLagMs(unwrapped) > PASCAL_MAX_STATE_LAG_MS) {
            results[index] = { ok: false, error: "STALE" };
            continue;
          }
          const raw = Object.hasOwn(books.data.books, symbol) ? books.data.books[symbol] : undefined;
          if (raw === undefined) {
            results[index] = { ok: false, error: "NOT_FOUND" };
            continue;
          }
          const shape = bookSchema.safeParse(raw);
          const bids = shape.success ? parseBookSide(shape.data.bids) : null;
          const asks = shape.success ? parseBookSide(shape.data.asks) : null;
          if (bids === null || asks === null) {
            results[index] = { ok: false, error: "SCHEMA_DRIFT" };
            continue;
          }
          if (bids.length === 0 && asks.length === 0) {
            results[index] = { ok: false, error: "EMPTY_BOOK" };
            continue;
          }
          // A crossed book cannot come from a price-time matching engine; do not show it as a book.
          if (crossed(sortLevels(bids, "bids"), sortLevels(asks, "asks"))) {
            results[index] = { ok: false, error: "SCHEMA_DRIFT" };
            continue;
          }
          const book = bookOf(side, bids, asks, symbol, deps.nowMs(), unwrapped.stateTimeMs);
          results[index] = { ok: true, value: book };
        }
      }
    }
    return results.map((entry) => entry ?? { ok: false as const, error: "NOT_FOUND" as const });
  }

  async function getFeeSpec(market: Market): Promise<FeeSpec> {
    // Re-read, because the rate is per market and can change: the snapshot is at most a list TTL old.
    const snap = await snapshot();
    const row = market.ref.venue === "pascal" ? snap.bySymbol.get(market.ref.marketId) : undefined;
    if (row === undefined) throw new AdapterFailure("pascal", "NOT_FOUND", "unknown_symbol");
    return feeSpecOf(row, deps.nowMs());
  }

  async function health(): Promise<VenueHealth> {
    const notes = ["noncustodial exchange: off-chain order book, on-chain USDC settlement on Solana", "reads are unauthenticated GETs", PASCAL_TERMS_NOTE];
    try {
      const body = await getJson(deps, { url: `${PASCAL_API_BASE}/time` });
      const unwrapped = unwrapEnvelope(body);
      if (unwrapped.serverTimeMs === undefined) return { ok: false, notes: [...notes, "answer carries no server time"] };
      const skew = Math.abs(deps.nowMs() - unwrapped.serverTimeMs);
      return { ok: true, notes: skew > 60_000 ? [...notes, `this device's clock differs from the venue's by ${Math.round(skew / 1000)} seconds`] : notes };
    } catch (error) {
      const code = error instanceof AdapterFailure ? error.code : "TIMEOUT";
      return { ok: false, notes: [...notes, `unreachable: ${code}`] };
    }
  }

  async function positionsByAddress(owner: string, opts: { readonly bindingId: string; readonly deadlineMs?: number }): Promise<PascalPositions> {
    if (!isSolanaAddress(owner)) throw new AdapterFailure("pascal", "NOT_FOUND", "bad_owner");
    const deadlineAtMs = resolveDeadline(opts.deadlineMs, deps.nowMs());
    let body: unknown;
    try {
      body = await getJson(deps, { url: `${PASCAL_API_BASE}/accounts/${owner}`, deadlineAtMs, notFoundStatuses: [404] });
    } catch (error) {
      if (error instanceof AdapterFailure && error.code === "NOT_FOUND") {
        return { registered: false, account: null, positions: [], unmarked: 0, shape: "synthetic", prov: provOf(deps.nowMs(), undefined, `${PASCAL_API_BASE}/accounts`, transport, PASCAL_LIST_TTL_MS) };
      }
      throw error;
    }
    const unwrapped = unwrapEnvelope(body);
    const data = accountDataSchema.safeParse(unwrapped.data);
    // An answer with neither collateral nor a position list is not an account.
    if (!data.success || (data.data.collateral_usd === undefined && data.data.positions === undefined)) throw new AdapterFailure("pascal", "SCHEMA_DRIFT", "account_shape");

    const snap = await snapshot(deadlineAtMs);
    const now = deps.nowMs();
    const prov = provOf(now, unwrapped.stateTimeMs, `${PASCAL_API_BASE}/accounts`, transport, PASCAL_LIST_TTL_MS);
    const positions: VenuePosition[] = [];
    let unmarked = 0;
    for (const raw of data.data.positions ?? []) {
      const entry = accountPositionSchema.safeParse(raw);
      if (!entry.success) throw new AdapterFailure("pascal", "SCHEMA_DRIFT", "position_shape");
      const signed = entry.data.position_size ?? entry.data.size;
      if (signed === undefined) throw new AdapterFailure("pascal", "SCHEMA_DRIFT", "position_size_missing");
      const size = BigInt(signed);
      if (size === 0n) continue;
      const side = size > 0n ? "long" : "short";
      const qty = fromAtomic("contracts", size < 0n ? -size : size, 0);
      const row = snap.bySymbol.get(entry.data.symbol);
      // Mark at the best bid of the side being held: a long sells at the bid; a short buys back at the ask,
      // which is a bid of 1 - ask on the short side. One-sided or crossed: no mark, and no value.
      let markPrice: Qty | null = null;
      if (row !== undefined && !(row.bestBid !== null && row.bestAsk !== null && isCrossedPair(row.bestBid, row.bestAsk))) {
        markPrice = side === "long" ? row.bestBid : row.bestAsk === null ? null : complement(row.bestAsk);
      }
      if (markPrice === null) unmarked += 1;
      const value = markPrice === null ? null : toDec(notional(qty, markPrice, "usd"));
      positions.push({
        id: `pascal:${owner}:${entry.data.symbol}`,
        holder: { bindingId: opts.bindingId },
        market: row === undefined ? { venue: "pascal", marketId: entry.data.symbol, native: { symbol: entry.data.symbol } } : refOf(row),
        outcome: {
          index: side === "long" ? 0 : 1,
          role: row === undefined || row.scalar !== null || row.labels.kind !== "default" ? "label" : side === "long" ? "yes" : "no",
          tokenId: tokenIdOf(entry.data.symbol, side),
        },
        shape: "long_short",
        qty: toDec(qty),
        qtyUnit: "contracts_1usd",
        free: null,
        reserved: null,
        // The cost of a position is not in any field this adapter has seen.
        cost: { total: null, avg: null, fees: null, source: "unknown" },
        mark: { price: markPrice === null ? null : toDec(markPrice), basis: markPrice === null ? "none" : "bid", asOfMs: now },
        value,
        pnl: { realized: null, unrealized: null, total: null, source: "unavailable" },
        status: "open",
        collateral: COLLATERAL,
        prov,
      });
    }
    return {
      registered: true,
      account: { collateralUsd: canonicalUsd(data.data.collateral_usd), pendingDepositsUsd: canonicalUsd(data.data.pending_deposits) },
      positions,
      unmarked,
      shape: "synthetic",
      prov,
    };
  }

  return {
    id: "pascal",
    caps: CAPS,
    listMarkets,
    getMarket,
    getBooks,
    getFeeSpec,
    health,
    lastReadReport: () => report,
    positionsByAddress,
  };
}
