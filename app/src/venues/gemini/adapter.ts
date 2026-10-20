import { MemoryStore, type TimerApi } from "../../core/cache";
import type { AdapterCaps, AdapterDeps, AdapterError, Book, FeeSpec, ListMarketsQuery, Market, MarketRef, MarketSummary, Page, Result, Status, TokenRef, VenueHealth, VenueReadAdapter } from "../../core/ports";
import { untrustedField } from "../../core/untrusted";
import type { Untrusted } from "../../core/ports";
import { GEMINI_API_BASE, GEMINI_DETAIL_TTL_MS, GEMINI_MAX_OFFSET, GEMINI_PAGE_DEFAULT, GEMINI_PAGE_MAX } from "./constants";
import { apiStatusFor, feeSpecOf, marketOf, parseEvent, quoteOf, summaryOf, winnerOf, type GeminiEvent, type GeminiQuote } from "./map";
import { listSchema, TICKER } from "./schemas";
import { AdapterFailure, assertEnabled, clampInt, decodeStatusCursor, getJson, nextStatusCursor, queryOf, type GateOptions } from "../novig/shared";

// Gemini Predictions (Gemini Titan): a regulated US exchange. This adapter reads the public events route only: GET
// requests, no key, no signature, no account route. REFERENCE PRICES ONLY: OFF until the user switches it on and
// accepts the disclosure, everything it reads stays in memory, and it has no order books (depth is WebSocket only).
// Sources: docs/research/venues/gemini-predictions.md, docs/dapp-design.md 4.6, 4.8.

const CAPS: AdapterCaps = {
  listMarkets: true,
  search: true,
  getMarket: true,
  getBook: false,
  getBooksBatch: false,
  getFeeSpec: true,
  getResolution: false,
  getPositionsByAddress: false,
  stream: false,
};

const CATEGORY = /^[A-Za-z][A-Za-z &-]{0,63}$/;
const SEARCH_MAX_CHARS = 100;

export interface GeminiOptions extends GateOptions {
  // "T0" in the standalone build, "T1" through the Cockpit's read proxy.
  readonly transport?: "T0" | "T1";
  // One venue category (Sports, Crypto, Politics, ...). A sports game embeds all its child markets, so narrowing
  // keeps answers small.
  readonly category?: string;
  readonly timers?: TimerApi;
}

export interface GeminiRow {
  // Aligned with page.items.
  readonly quotes: readonly GeminiQuote[];
  readonly category: Untrusted<string> | null;
  readonly contractCount: number;
  readonly childEventCount: number;
}

export interface GeminiReadReport {
  readonly parsed: number;
  readonly dropped: number;
  readonly droppedCombos: number;
  readonly fetchedAtMs: number;
}

export interface GeminiMarketDetail {
  readonly market: Market;
  readonly notes: readonly string[];
  readonly quotes: readonly GeminiQuote[];
  readonly settlement: { readonly winningTokenId: string; readonly winningOutcomeIndex: number; readonly resolvedAt: string | null } | null;
}

export interface GeminiAdapter extends VenueReadAdapter {
  readonly id: "gemini";
  lastReadReport(): GeminiReadReport;
  listMarketsDetailed(q: ListMarketsQuery): Promise<{ readonly page: Page<MarketSummary>; readonly rows: readonly GeminiRow[] }>;
  getMarketDetail(ref: MarketRef): Promise<GeminiMarketDetail>;
  clearMemory(): void;
}

export function createGeminiAdapter(deps: AdapterDeps, options: GeminiOptions = {}): GeminiAdapter {
  const transport = options.transport ?? "T0";
  const gate: GateOptions = { ...(options.switches === undefined ? {} : { switches: options.switches }), ...(options.build === undefined ? {} : { build: options.build }) };
  if (options.category !== undefined && !CATEGORY.test(options.category)) throw new RangeError("category must be plain words");
  const storeOptions = { nowMs: deps.nowMs, ...(options.timers === undefined ? {} : { timers: options.timers }) };
  // R3: restricted-terms data lives in memory only.
  const events = new MemoryStore<GeminiEvent>("gemini-event", storeOptions);
  let report: GeminiReadReport = { parsed: 0, dropped: 0, droppedCombos: 0, fetchedAtMs: 0 };

  async function listDetailed(query: ListMarketsQuery): Promise<{ page: Page<MarketSummary>; rows: GeminiRow[] }> {
    assertEnabled("gemini", gate);
    const wanted: readonly Status[] = query.statuses === undefined || query.statuses.length === 0 ? ["active"] : query.statuses;
    const apiStatuses = [...new Set(wanted.map((status) => apiStatusFor(status)).filter((value): value is string => value !== null))];
    // A status the venue cannot express must be said, not turned into an empty page.
    if (apiStatuses.length === 0) throw new AdapterFailure("gemini", "NOT_SUPPORTED", "status_not_supported");
    const limit = clampInt(query.limit, GEMINI_PAGE_DEFAULT, 1, GEMINI_PAGE_MAX);
    const cursor = decodeStatusCursor("gemini", query.cursor, apiStatuses.length);
    const offset = cursor.opaque === "" ? 0 : Number(cursor.opaque);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > GEMINI_MAX_OFFSET || String(offset) !== (cursor.opaque === "" ? "0" : cursor.opaque)) throw new AdapterFailure("gemini", "NOT_SUPPORTED", "bad_cursor");
    const search = query.text === undefined ? "" : query.text.trim().slice(0, SEARCH_MAX_CHARS);
    const body = await getJson(deps, "gemini", {
      url: `${GEMINI_API_BASE}/events${queryOf([
        ["status", apiStatuses[cursor.index]],
        ["category", options.category],
        ["search", search],
        ["limit", limit],
        ["offset", offset === 0 ? undefined : offset],
      ])}`,
    });
    const list = listSchema.safeParse(body);
    if (!list.success) throw new AdapterFailure("gemini", "SCHEMA_DRIFT", "events_envelope");
    const now = deps.nowMs();
    const items: MarketSummary[] = [];
    const rows: GeminiRow[] = [];
    let dropped = 0;
    let droppedCombos = 0;
    for (const raw of list.data.data) {
      const parsed = parseEvent(raw);
      if (!parsed.ok) {
        dropped += 1;
        if (parsed.reason === "combo") droppedCombos += 1;
        continue;
      }
      const event = parsed.event;
      events.set(event.shell.ticker.toLowerCase(), event, GEMINI_DETAIL_TTL_MS);
      items.push(summaryOf(event, now, transport));
      rows.push({
        quotes: event.contracts.map((contract) => quoteOf(contract)),
        category: event.shell.category === undefined ? null : untrustedField("category", event.shell.category, "gemini"),
        contractCount: event.contracts.length,
        childEventCount: event.childEvents,
      });
    }
    // An empty page is a real answer; a page whose events all fail is a changed shape.
    if (list.data.data.length > 0 && items.length === 0) throw new AdapterFailure("gemini", "SCHEMA_DRIFT", "events_do_not_match_schema");
    report = { parsed: items.length, dropped, droppedCombos, fetchedAtMs: now };
    const consumed = offset + list.data.data.length;
    const total = list.data.pagination?.total;
    const more = list.data.data.length > 0 && total !== undefined && consumed < total && consumed <= GEMINI_MAX_OFFSET;
    return { page: { items, next: nextStatusCursor(cursor.index, apiStatuses.length, more ? String(consumed) : null) }, rows };
  }

  async function detail(ref: MarketRef): Promise<GeminiMarketDetail> {
    assertEnabled("gemini", gate);
    if (ref.venue !== "gemini") throw new AdapterFailure("gemini", "NOT_FOUND", "wrong_venue");
    if (!TICKER.test(ref.marketId)) throw new AdapterFailure("gemini", "NOT_FOUND", "bad_event_ticker");
    const body = await getJson(deps, "gemini", { url: `${GEMINI_API_BASE}/events/${ref.marketId}`, notFoundStatuses: [404] });
    const parsed = parseEvent(body);
    if (!parsed.ok) throw new AdapterFailure("gemini", parsed.reason === "combo" ? "NOT_SUPPORTED" : "SCHEMA_DRIFT", parsed.reason);
    // The venue must answer for the event that was asked for.
    if (parsed.event.shell.ticker.toLowerCase() !== ref.marketId.toLowerCase()) throw new AdapterFailure("gemini", "SCHEMA_DRIFT", "event_ticker_mismatch");
    const event = parsed.event;
    events.set(event.shell.ticker.toLowerCase(), event, GEMINI_DETAIL_TTL_MS);
    const now = deps.nowMs();
    const market = marketOf(event, now);
    const notes = [
      "These are reference prices only. Order book depth is not available in this build.",
      "A displayed price is the last trade or the best quote of the contract's YES side; it is not an executable price.",
    ];
    if (market.fee.modelId === "curve_pq") notes.push("The fee is the documented schedule, not an API field. The maker fee is waived by a promotion that the API does not show.");
    if (event.childEvents > 0) notes.push("This game has further markets (spreads, totals, props) that are not listed here.");
    const winner = winnerOf(event);
    return {
      market,
      notes,
      quotes: event.contracts.map((contract) => quoteOf(contract)),
      settlement: winner === null ? null : { winningTokenId: winner.tokenId, winningOutcomeIndex: winner.outcomeIndex, resolvedAt: winner.resolvedAt },
    };
  }

  async function getBooks(tokens: readonly TokenRef[]): Promise<ReadonlyArray<Result<Book, AdapterError>>> {
    // No REST depth exists (the contractOrderbooks field was null on every sample) and the CSP allows no WebSocket.
    // NOT_SUPPORTED, never an empty book.
    return tokens.map(() => ({ ok: false, error: "NOT_SUPPORTED" }));
  }

  async function getFeeSpec(market: Market): Promise<FeeSpec> {
    assertEnabled("gemini", gate);
    if (market.ref.venue !== "gemini") throw new AdapterFailure("gemini", "NOT_FOUND", "wrong_venue");
    // The fee is a documented schedule, so there is nothing to read live. It is re-derived from the event so that
    // the listing date and the expiry of the documented constants are checked at the moment of the question.
    const cached = events.get(market.ref.marketId.toLowerCase());
    const event = cached ?? (await detailEvent(market.ref));
    return feeSpecOf(event, deps.nowMs());
  }

  async function detailEvent(ref: MarketRef): Promise<GeminiEvent> {
    await detail(ref);
    const event = events.get(ref.marketId.toLowerCase());
    if (event === undefined) throw new AdapterFailure("gemini", "SCHEMA_DRIFT", "event_not_kept");
    return event;
  }

  async function health(): Promise<VenueHealth> {
    assertEnabled("gemini", gate);
    const body = await getJson(deps, "gemini", { url: `${GEMINI_API_BASE}/events?status=active&limit=1` });
    const list = listSchema.safeParse(body);
    if (!list.success) return { ok: false, notes: ["The events answer is not the shape this adapter reads."] };
    return { ok: true, notes: ["The public events route answered."] };
  }

  return {
    id: "gemini",
    caps: CAPS,
    listMarkets: async (query) => (await listDetailed(query)).page,
    listMarketsDetailed: async (query) => listDetailed(query),
    getMarket: async (ref) => (await detail(ref)).market,
    getMarketDetail: detail,
    getBooks,
    getFeeSpec,
    health,
    lastReadReport: () => report,
    clearMemory: () => events.clear(),
  };
}
