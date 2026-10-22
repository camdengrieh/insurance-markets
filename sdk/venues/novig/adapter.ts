import { fromAtomic, toDec } from "../../money/qty.js";
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
  Status,
  TokenRef,
  VenueHealth,
  VenueReadAdapter,
} from "../../model.js";
import {
  NOVIG_API_BASE,
  NOVIG_BOOK_DEPTH,
  NOVIG_DEFAULT_MARKET_TYPES,
  NOVIG_EVENTS_FETCH_LIMIT,
  NOVIG_EVENTS_TTL_MS,
  NOVIG_MARKET_TTL_MS,
  NOVIG_PAGE_DEFAULT,
  NOVIG_PAGE_MAX,
  NOVIG_QTY_DECIMALS,
} from "./constants.js";
import { BookShapeError, bookOf, eventStatusFor, feeCharge, feeSpecOf, marketOf, summaryOf } from "./map.js";
import { bookSchema, eventSchema, marketSchema, pageSchema, typeListSchema, ID, type NovigEvent, type NovigMarket } from "./schemas.js";
import {
  AdapterFailure,
  assertEnabled,
  clampInt,
  decodeStatusCursor,
  getJson,
  isAdapterFailure,
  nextStatusCursor,
  queryOf,
  resolveDeadline,
  type GateOptions,
} from "./shared.js";

// Novig (Ludlow Exchange): a regulated US sports exchange with its own central limit order book. This adapter reads
// the unauthenticated /v3/public catalog only: GET requests, no key, no signature, no account route. It is a
// REFERENCE-PRICE source, OFF until the user switches it on and accepts the disclosure, and everything it reads stays
// in memory. Sources: docs/research/venues/novig.md, docs/dapp-design.md 4.6, 4.8.

const CAPS: AdapterCaps = {
  listMarkets: true,
  // The public routes have no text search. A text filter over one page would look complete and be wrong.
  search: false,
  getMarket: true,
  getBook: true,
  getBooksBatch: false,
  getFeeSpec: true,
  getResolution: false,
  getPositionsByAddress: false,
  stream: false,
};

export interface NovigOptions extends GateOptions {
  // "T0" in the standalone build, "T1" through the Cockpit's read proxy.
  readonly transport?: "T0" | "T1";
  // Market types to list (default MONEY, SPREAD, TOTAL). Upper-case words only.
  readonly marketTypes?: readonly string[];
  // Also list games in play. Off by default: resting orders are voided at the start of play and the fee applies.
  readonly includeLive?: boolean;
  // Lets the memory stores drop themselves after the idle period (sdk/venues/cache.ts). Tests inject fakes.
  readonly timers?: TimerApi;
}

export interface NovigReadReport {
  readonly parsed: number;
  readonly dropped: number;
  readonly fetchedAtMs: number;
  // Rows shown without an event title because the events request did not cover their event.
  readonly titlesMissing: number;
}

export interface NovigMarketDetail {
  readonly market: Market;
  // Fixed sentences written by this adapter, never text from the venue.
  readonly notes: readonly string[];
  readonly fee: { readonly charge: "when_live" | "always" | "unknown"; readonly makerCredit: string | null };
}

export interface NovigAdapter extends VenueReadAdapter {
  readonly id: "novig";
  lastReadReport(): NovigReadReport;
  getMarketDetail(ref: MarketRef): Promise<NovigMarketDetail>;
  // Drops everything this adapter holds (page hide, the settings "clear" control).
  clearMemory(): void;
}

const TYPE_WORD = /^[A-Z0-9_]{1,64}$/;

export function createNovigAdapter(deps: AdapterDeps, options: NovigOptions = {}): NovigAdapter {
  const transport = options.transport ?? "T0";
  const gate: GateOptions = { ...(options.switches === undefined ? {} : { switches: options.switches }), ...(options.build === undefined ? {} : { build: options.build }) };
  const marketTypes = (options.marketTypes ?? NOVIG_DEFAULT_MARKET_TYPES).filter((word) => TYPE_WORD.test(word));
  if (marketTypes.length === 0) throw new RangeError("marketTypes needs at least one upper-case word");
  const includeLive = options.includeLive === true;
  const storeOptions = { nowMs: deps.nowMs, ...(options.timers === undefined ? {} : { timers: options.timers }) };
  // R3: restricted-terms data lives in memory only.
  const eventsByStatus = new MemoryStore<ReadonlyMap<string, NovigEvent>>("novig-events", storeOptions);
  const eventById = new MemoryStore<NovigEvent>("novig-event", storeOptions);
  const marketById = new MemoryStore<NovigMarket>("novig-market", storeOptions);
  const marketOfOutcome = new MemoryStore<string>("novig-outcome-index", storeOptions);
  let report: NovigReadReport = { parsed: 0, dropped: 0, fetchedAtMs: 0, titlesMissing: 0 };

  function remember(market: NovigMarket): void {
    marketById.set(market.marketId, market, NOVIG_MARKET_TTL_MS);
    for (const outcome of market.outcomes) marketOfOutcome.set(outcome.outcomeId, market.marketId, NOVIG_MARKET_TTL_MS);
  }

  // A degraded title is acceptable when the events read fails in a way that says nothing about the venue's health.
  // A pause or a rate limit is never swallowed.
  function degradable(error: unknown): boolean {
    return isAdapterFailure(error) && (error.code === "NOT_FOUND" || error.code === "SCHEMA_DRIFT" || error.code === "TIMEOUT");
  }

  async function eventsFor(eventStatus: string, deadlineAtMs: number | undefined): Promise<ReadonlyMap<string, NovigEvent>> {
    const cached = eventsByStatus.get(eventStatus);
    if (cached !== undefined) return cached;
    const body = await getJson(deps, "novig", {
      url: `${NOVIG_API_BASE}/catalog/events${queryOf([["status", eventStatus], ["limit", NOVIG_EVENTS_FETCH_LIMIT]])}`,
      ...(deadlineAtMs === undefined ? {} : { deadlineAtMs }),
    });
    const page = pageSchema.safeParse(body);
    if (!page.success) throw new AdapterFailure("novig", "SCHEMA_DRIFT", "events_envelope");
    const map = new Map<string, NovigEvent>();
    for (const row of page.data.items) {
      const parsed = eventSchema.safeParse(row);
      if (parsed.success) map.set(parsed.data.eventId, parsed.data);
    }
    eventsByStatus.set(eventStatus, map, NOVIG_EVENTS_TTL_MS);
    return map;
  }

  async function eventOne(eventId: string, deadlineAtMs: number | undefined): Promise<NovigEvent> {
    const cached = eventById.get(eventId);
    if (cached !== undefined) return cached;
    const body = await getJson(deps, "novig", {
      url: `${NOVIG_API_BASE}/catalog/events/${eventId}`,
      ...(deadlineAtMs === undefined ? {} : { deadlineAtMs }),
      notFoundStatuses: [404],
    });
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) throw new AdapterFailure("novig", "SCHEMA_DRIFT", "event_shape");
    eventById.set(eventId, parsed.data, 5 * 60_000);
    return parsed.data;
  }

  async function marketOne(marketId: string, deadlineAtMs: number | undefined, fresh = false): Promise<NovigMarket> {
    if (!ID.test(marketId)) throw new AdapterFailure("novig", "NOT_FOUND", "bad_market_id");
    if (!fresh) {
      const cached = marketById.get(marketId);
      if (cached !== undefined) return cached;
    }
    const body = await getJson(deps, "novig", {
      url: `${NOVIG_API_BASE}/catalog/markets/${marketId}`,
      ...(deadlineAtMs === undefined ? {} : { deadlineAtMs }),
      notFoundStatuses: [404],
    });
    const parsed = marketSchema.safeParse(body);
    if (!parsed.success) throw new AdapterFailure("novig", "SCHEMA_DRIFT", "market_shape");
    // The venue must answer for the market that was asked for.
    if (parsed.data.marketId !== marketId) throw new AdapterFailure("novig", "SCHEMA_DRIFT", "market_id_mismatch");
    remember(parsed.data);
    return parsed.data;
  }

  async function listMarkets(query: ListMarketsQuery): Promise<Page<MarketSummary>> {
    assertEnabled("novig", gate);
    if (query.text !== undefined && query.text.trim() !== "") throw new AdapterFailure("novig", "NOT_SUPPORTED", "search_not_supported");
    const wanted: readonly Status[] = query.statuses === undefined || query.statuses.length === 0 ? ["active"] : query.statuses;
    const eventStatuses = [...new Set(wanted.flatMap((status) => eventStatusFor(status, includeLive) ?? []))];
    // A status the venue cannot express must be said, not turned into an empty page.
    if (eventStatuses.length === 0) throw new AdapterFailure("novig", "NOT_SUPPORTED", "status_not_supported");
    const limit = clampInt(query.limit, NOVIG_PAGE_DEFAULT, 1, NOVIG_PAGE_MAX);
    const cursor = decodeStatusCursor("novig", query.cursor, eventStatuses.length);
    const eventStatus = eventStatuses[cursor.index] as string;
    const body = await getJson(deps, "novig", {
      url: `${NOVIG_API_BASE}/catalog/markets${queryOf([
        ["marketType", marketTypes.join(",")],
        ["eventStatus", eventStatus],
        ["limit", limit],
        ["after", cursor.opaque],
      ])}`,
    });
    const page = pageSchema.safeParse(body);
    if (!page.success) throw new AdapterFailure("novig", "SCHEMA_DRIFT", "markets_envelope");
    const rows: NovigMarket[] = [];
    let dropped = 0;
    for (const item of page.data.items) {
      const parsed = marketSchema.safeParse(item);
      if (parsed.success) rows.push(parsed.data);
      else dropped += 1;
    }
    // An empty page is a real answer; a page of rows that all fail is a changed shape.
    if (page.data.items.length > 0 && rows.length === 0) throw new AdapterFailure("novig", "SCHEMA_DRIFT", "rows_do_not_match_schema");

    let events: ReadonlyMap<string, NovigEvent> = new Map();
    if (rows.length > 0) {
      try {
        events = await eventsFor(eventStatus, undefined);
      } catch (error) {
        if (!degradable(error)) throw error;
      }
    }
    const now = deps.nowMs();
    let titlesMissing = 0;
    const items = rows.map((row) => {
      const event = events.get(row.eventId);
      if (event === undefined) titlesMissing += 1;
      remember(row);
      return summaryOf(row, event, eventStatus, now, transport);
    });
    report = { parsed: rows.length, dropped, fetchedAtMs: now, titlesMissing };
    return { items, next: nextStatusCursor(cursor.index, eventStatuses.length, page.data.next) };
  }

  async function detail(ref: MarketRef): Promise<NovigMarketDetail> {
    assertEnabled("novig", gate);
    if (ref.venue !== "novig") throw new AdapterFailure("novig", "NOT_FOUND", "wrong_venue");
    const market = await marketOne(ref.marketId, undefined, true);
    let event: NovigEvent | undefined;
    try {
      event = await eventOne(market.eventId, undefined);
    } catch (error) {
      if (!degradable(error)) throw error;
    }
    const now = deps.nowMs();
    const notes: string[] = [];
    if (event === undefined) notes.push("The event title could not be read, so the title shows only the venue's market code.");
    const charge = feeCharge(market);
    if (charge === "when_live") notes.push("Taker fills are free before the game starts; fills while it is in play pay the taker fee.");
    if (charge === "unknown") notes.push("The fee charging rule is missing or not understood, so no fee is modelled.");
    notes.push("A settled market can be regraded by the venue, so a settlement is shown as provisional until the event is final.");
    return { market: marketOf(market, event, now), notes, fee: { charge, makerCredit: market.fee?.makerCredit ?? null } };
  }

  async function getMarket(ref: MarketRef): Promise<Market> {
    return (await detail(ref)).market;
  }

  async function getBooks(tokens: readonly TokenRef[], opts: { readonly deadlineMs: number }): Promise<ReadonlyArray<Result<Book, AdapterError>>> {
    const out: Array<Result<Book, AdapterError>> = tokens.map(() => ({ ok: false, error: "NOT_FOUND" }));
    try {
      assertEnabled("novig", gate);
    } catch {
      return tokens.map(() => ({ ok: false, error: "NOT_SUPPORTED" }));
    }
    const deadlineAtMs = resolveDeadline(opts.deadlineMs, deps.nowMs());
    // Group by market so one market costs one book request however many of its outcomes are asked for.
    const groups = new Map<string, number[]>();
    tokens.forEach((token, index) => {
      if (token.venue !== "novig" || !ID.test(token.tokenId)) return;
      const marketId = token.marketId ?? marketOfOutcome.get(token.tokenId);
      if (marketId === undefined || !ID.test(marketId)) return;
      const list = groups.get(marketId) ?? [];
      list.push(index);
      groups.set(marketId, list);
    });
    const failure = (error: unknown): AdapterError => (isAdapterFailure(error) ? error.code : error instanceof BookShapeError ? "SCHEMA_DRIFT" : "TIMEOUT");
    for (const [marketId, indexes] of groups) {
      try {
        const market = await marketOne(marketId, deadlineAtMs);
        const body = await getJson(deps, "novig", {
          url: `${NOVIG_API_BASE}/catalog/markets/${marketId}/book${queryOf([["depth", NOVIG_BOOK_DEPTH]])}`,
          deadlineAtMs,
          notFoundStatuses: [404],
        });
        const parsed = bookSchema.safeParse(body);
        if (!parsed.success || parsed.data.marketId !== marketId) throw new AdapterFailure("novig", "SCHEMA_DRIFT", "book_shape");
        const now = deps.nowMs();
        for (const index of indexes) {
          const token = tokens[index] as TokenRef;
          try {
            const book = bookOf(market, token.tokenId, parsed.data, now);
            out[index] = book.bids.length === 0 && book.asks.length === 0 ? { ok: false, error: "EMPTY_BOOK" } : { ok: true, value: book };
          } catch (error) {
            out[index] = { ok: false, error: failure(error) };
          }
        }
      } catch (error) {
        for (const index of indexes) out[index] = { ok: false, error: failure(error) };
      }
    }
    return out;
  }

  async function getFeeSpec(market: Market): Promise<FeeSpec> {
    assertEnabled("novig", gate);
    if (market.ref.venue !== "novig") throw new AdapterFailure("novig", "NOT_FOUND", "wrong_venue");
    try {
      const fresh = await marketOne(market.ref.marketId, undefined, true);
      return feeSpecOf(fresh, deps.nowMs());
    } catch (error) {
      // Unknown parameters fail closed: a spec that says "unknown", never a guessed fee. A pause is still a pause.
      if (isAdapterFailure(error) && (error.code === "RATE_LIMITED" || error.code === "VENUE_PAUSED")) throw error;
      return { modelId: "unknown", payer: "buyer_adds_seller_withholds", paramsSource: { url: `${NOVIG_API_BASE}/catalog/markets/${market.ref.marketId}`, field: "fee.coefficient", granularity: "market" }, verifiedAt: new Date(deps.nowMs()).toISOString(), ttlSec: 0 };
    }
  }

  async function health(): Promise<VenueHealth> {
    assertEnabled("novig", gate);
    const body = await getJson(deps, "novig", { url: `${NOVIG_API_BASE}/types/event-statuses` });
    const list = typeListSchema.safeParse(body);
    if (!list.success) return { ok: false, notes: ["The event status list is not the shape this adapter reads."] };
    const known = list.data.includes("OPEN_PREGAME");
    return { ok: known, notes: known ? ["The public catalog answered."] : ["The public catalog answered without the status this adapter lists by."] };
  }

  return {
    id: "novig",
    caps: CAPS,
    listMarkets,
    getMarket,
    getBooks,
    getFeeSpec,
    health,
    lastReadReport: () => report,
    getMarketDetail: detail,
    clearMemory: () => {
      eventsByStatus.clear();
      eventById.clear();
      marketById.clear();
      marketOfOutcome.clear();
    },
  };
}

// Display helper kept next to the adapter that defines the unit: API quantity (one cent of payout) to shares.
export function sharesOfQty(qty: number): string {
  return toDec(fromAtomic("shares", BigInt(qty), NOVIG_QTY_DECIMALS));
}
