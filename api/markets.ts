import type { Category } from "../sdk/category.js";
import type { AdapterError, Book, FeeSpec, FetchLike, FieldOrigin, Market, MarketRef, MarketSummary, VenueId, VenueReadAdapter } from "../sdk/model.js";
import { RULES_HASH_RECIPE } from "../sdk/rules.js";
import { createLimitlessAdapter } from "../sdk/venues/limitless/adapter.js";
import { venuePolicy } from "../sdk/venues/policy.js";
import { createPolymarketAdapter } from "../sdk/venues/polymarket/adapter.js";
import { sourceSummary, type ChainField } from "../sdk/venues/state-fields.js";
import { createStateGuardedFetch, READ_OK, stateOfAdapterError, venueReadState, venueStateNext, venueStateReason, type VenueReadState, type VenueStateTracker } from "../sdk/venues/state.js";
import { createTrueoAdapter } from "../sdk/venues/trueo/adapter.js";
import { createXoAdapter } from "../sdk/venues/xo/adapter.js";
import { indexedLastTrades, indexedResolution, type IndexAnswer, type LastTrade } from "./chain-fields.js";
import type { ChainSpec } from "./indexer/chains.js";
import type { ServingPolicy } from "./serving.js";
import type { IndexStore } from "./store.js";

// Venue reads for the free endpoints (docs/sdk-and-api-design.md sections 4 and 6). Only a venue the serving policy serves
// gets a reader; every other venue is never asked. Each reader is an SDK reader (sdk/venues/<venue>) over the API's honest
// fetch behind the shared state rule (sdk/venues/state.ts): a throttled or blocked venue is refused before sending and
// nothing retries around it.
//
// Answers are kept in memory only (sdk/venues/cache.ts canPersist: market data never reaches disk) with the time they
// were read. A row read for this request is "venue_api"; a row kept from an earlier read is "cache" with its age, never
// "live"; a blocked venue keeps its rows with the fields only the venue holds nulled and the reason stated. The chain
// index (chain-fields.ts) adds each outcome's last trade and the settlement, field by field, with their own sources.

// The venues the API has a reader for. Which of them is served is the policy's decision alone.
export const API_READER_VENUES = ["trueo", "xo", "polymarket", "limitless"] as const satisfies readonly VenueId[];
export type ApiReaderVenue = (typeof API_READER_VENUES)[number];

// A venue's list is read again at most this often; a request in between gets the kept rows, labelled "cache".
export const LIST_REFRESH_MS = 60_000;
export const DETAIL_REFRESH_MS = 60_000;
export const BOOK_REFRESH_MS = 15_000;
export const FEE_REFRESH_MS = 15_000;
// Each refresh reads at most MAX_LIST_PAGES pages of LIST_PAGE_LIMIT rows (each reader clamps the limit to its own
// maximum): the list covers the first rows in the venue's own order, never more, and says how many it holds.
export const MAX_LIST_PAGES = 3;
export const LIST_PAGE_LIMIT = 50;
export const MAX_DETAIL_ENTRIES = 500;

export const DEFAULT_PAGE = 50;
export const MAX_PAGE = 100;

export interface MarketsOptions {
  readonly policy: ServingPolicy;
  // The fetch each venue's reader is given before the state guard: the honest fetch in main.ts, a fake per venue in tests.
  readonly fetchFor: (venue: VenueId) => FetchLike;
  readonly tracker: VenueStateTracker;
  readonly nowMs: () => number;
  readonly store: IndexStore | null;
  // The chain the index reads for a venue, when it does.
  readonly chainOf: (venue: VenueId) => ChainSpec | null;
  // Trueo is read on chain: the Base RPC its reader uses.
  readonly trueoRpcUrl: string;
  // An upstream read started for a request is waited on for at most this long.
  readonly budgetMs: number;
}

interface ReadError {
  readonly code: AdapterError | "UNEXPECTED";
  readonly atMs: number;
}

interface ListEntry {
  rows: readonly MarketSummary[];
  readAtMs: number | null;
  error: ReadError | null;
  inflight: Promise<void> | null;
}

type BookResults = ReadonlyArray<{ readonly ok: true; readonly value: Book } | { readonly ok: false; readonly error: AdapterError }>;

interface Loaded {
  readonly key: string;
  readonly market: Market;
  readonly readAtMs: number;
  readonly fresh: boolean;
  // Set when the venue is blocked or chain-only: no book is read and none is shown.
  readonly reason: string | null;
  readonly books: Timed<BookResults> | undefined;
  readonly booksFresh: boolean;
  readonly bookFailure: string | null;
}

export interface TradeView {
  readonly market: Market;
  readonly marketOrigin: Origin;
  readonly books: ReadonlyArray<{ readonly tokenId: string; readonly book: Book | null; readonly source: Origin }>;
  readonly fee: FeeSpec | null;
  readonly feeOrigin: Origin;
  readonly venueReason: string | null;
}

interface Timed<T> {
  readonly value: T;
  readonly readAtMs: number;
}

export type Origin = (FieldOrigin & { readonly ageMs?: number }) | { readonly source: null; readonly reason: string };

export interface StateView {
  readonly kind: VenueReadState["kind"];
  readonly reason: string | null;
  readonly next: string | null;
}

function codeOf(error: unknown): AdapterError | "UNEXPECTED" {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const known: readonly string[] = ["RATE_LIMITED", "STALE", "NOT_SUPPORTED", "SCHEMA_DRIFT", "VENUE_PAUSED", "NOT_FOUND", "TIMEOUT", "EMPTY_BOOK"];
  return typeof code === "string" && known.includes(code) ? (code as AdapterError) : "UNEXPECTED";
}

function retryAfterOf(error: unknown): number | null {
  const value = typeof error === "object" && error !== null ? (error as { retryAfterMs?: unknown }).retryAfterMs : undefined;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

const READ_ERROR_TEXT: Readonly<Record<ReadError["code"], string>> = {
  RATE_LIMITED: "the venue asked us to slow down",
  STALE: "the venue's answer was stale",
  NOT_SUPPORTED: "the venue does not offer this read",
  SCHEMA_DRIFT: "the venue's answer did not have the shape its reader checks",
  VENUE_PAUSED: "reads from the venue are paused",
  NOT_FOUND: "the venue did not find it",
  TIMEOUT: "the venue did not answer in time",
  EMPTY_BOOK: "the venue's book was empty",
  UNEXPECTED: "the read failed",
};

// A promise raced against the budget: the answer, or "late" (the work carries on and fills the cache when it ends).
async function within<T>(work: Promise<T>, budgetMs: number): Promise<T | "late"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), budgetMs);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function withAge(origin: FieldOrigin, nowMs: number): Origin {
  return origin.source === null ? origin : { ...origin, ageMs: Math.max(0, nowMs - origin.asOfMs) };
}

function answerOrigin<T>(answer: IndexAnswer<T>, nowMs: number): Origin {
  return answer.ok ? { source: "chain", asOfMs: answer.asOfMs, ageMs: Math.max(0, nowMs - answer.asOfMs), via: answer.via } : { source: null, reason: answer.reason };
}

export class MarketService {
  readonly #options: MarketsOptions;
  readonly #readers = new Map<VenueId, VenueReadAdapter>();
  readonly #lists = new Map<VenueId, ListEntry>();
  readonly #details = new Map<string, Timed<Market>>();
  readonly #books = new Map<string, Timed<BookResults>>();
  readonly #fees = new Map<string, Timed<FeeSpec>>();

  constructor(options: MarketsOptions) {
    this.#options = options;
    for (const venue of API_READER_VENUES) {
      if (!options.policy.servability(venue).served) continue;
      const fetch = createStateGuardedFetch({ inner: options.fetchFor(venue), tracker: options.tracker, nowMs: options.nowMs, keyOf: () => venue });
      const deps = { fetch, nowMs: options.nowMs };
      this.#readers.set(venue, this.#create(venue, deps));
    }
  }

  #create(venue: ApiReaderVenue, deps: { readonly fetch: FetchLike; readonly nowMs: () => number }): VenueReadAdapter {
    switch (venue) {
      case "trueo":
        return createTrueoAdapter(deps, { rpcUrl: this.#options.trueoRpcUrl });
      case "xo":
        // A server is not a browser: the orderbook host's missing CORS header does not apply, as for the Cockpit daemon.
        return createXoAdapter(deps, { variant: "cockpit" });
      case "polymarket":
        return createPolymarketAdapter(deps);
      case "limitless":
        return createLimitlessAdapter(deps, { build: "cockpit" });
    }
  }

  // The venues served AND read by this API, in a fixed order.
  servedVenues(): VenueId[] {
    return API_READER_VENUES.filter((venue) => this.#readers.has(venue));
  }

  hasReader(venue: VenueId): boolean {
    return this.#readers.has(venue);
  }

  caps(venue: VenueId): VenueReadAdapter["caps"] | null {
    return this.#readers.get(venue)?.caps ?? null;
  }

  displayName(venue: VenueId): string {
    const policy = venuePolicy(venue);
    // Trueo has no API: "blocked" means its RPC refused us, and the sentence says so.
    return policy.transport === "T0-RPC" ? `${policy.name} (through its Base RPC)` : policy.name;
  }

  // Whether the venue's API may be asked now: not paused by the shared rule, and not declared chain-only.
  #mayAsk(venue: VenueId, nowMs: number): boolean {
    return this.#readers.has(venue) && !this.#options.tracker.check(venue, nowMs).paused && this.state(venue, nowMs).kind !== "chain_only";
  }

  state(venue: VenueId, nowMs: number): VenueReadState {
    return this.#readers.has(venue) ? venueReadState(this.#options.tracker, venue, nowMs) : READ_OK;
  }

  stateView(venue: VenueId, nowMs: number): StateView {
    const state = this.state(venue, nowMs);
    return { kind: state.kind, reason: venueStateReason(state, this.displayName(venue), nowMs), next: venueStateNext(state, nowMs) };
  }

  listInfo(venue: VenueId, nowMs: number): { readonly rows: number; readonly readAtMs: number | null; readonly ageMs: number | null; readonly lastError: string | null } | null {
    const entry = this.#lists.get(venue);
    if (entry === undefined) return null;
    return {
      rows: entry.rows.length,
      readAtMs: entry.readAtMs,
      ageMs: entry.readAtMs === null ? null : Math.max(0, nowMs - entry.readAtMs),
      lastError: entry.error === null ? null : READ_ERROR_TEXT[entry.error.code],
    };
  }

  #noteFailure(venue: VenueId, error: unknown): ReadError {
    const now = this.#options.nowMs();
    const code = codeOf(error);
    // A reader's RATE_LIMITED or VENUE_PAUSED that the guard did not see (its own mapping) still pauses the venue.
    if (this.state(venue, now).kind === "ok") {
      const derived = stateOfAdapterError(code, retryAfterOf(error), now);
      if (derived.kind === "throttled") this.#options.tracker.hold(venue, "limited", now, derived.untilMs);
      if (derived.kind === "blocked") this.#options.tracker.hold(venue, "refused", now, derived.untilMs);
    }
    return { code, atMs: now };
  }

  async #readList(venue: VenueId, entry: ListEntry): Promise<void> {
    const reader = this.#readers.get(venue);
    if (reader === undefined) return;
    try {
      const rows: MarketSummary[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
        const answer = await reader.listMarkets(cursor === undefined ? { limit: LIST_PAGE_LIMIT } : { limit: LIST_PAGE_LIMIT, cursor });
        rows.push(...answer.items);
        if (answer.next === null) break;
        cursor = answer.next;
      }
      const seen = new Set<string>();
      const kept: MarketSummary[] = [];
      for (const row of rows) {
        if (row.ref.venue !== venue || seen.has(row.ref.marketId)) continue;
        seen.add(row.ref.marketId);
        kept.push(row);
      }
      entry.rows = kept;
      entry.readAtMs = this.#options.nowMs();
      entry.error = null;
    } catch (error) {
      entry.error = this.#noteFailure(venue, error);
    }
  }

  // The venue's rows: read now when the kept ones are older than LIST_REFRESH_MS and the venue may be asked, else kept.
  // `fresh` is true only when the rows come from a read finished during this call.
  async list(venue: VenueId): Promise<{ readonly rows: readonly MarketSummary[]; readonly fresh: boolean; readonly readAtMs: number | null }> {
    const entry = this.#lists.get(venue) ?? { rows: [], readAtMs: null, error: null, inflight: null };
    this.#lists.set(venue, entry);
    const now = this.#options.nowMs();
    const due = entry.readAtMs === null || now - entry.readAtMs >= LIST_REFRESH_MS;
    if (due && this.#mayAsk(venue, now)) {
      const before = entry.readAtMs;
      entry.inflight ??= this.#readList(venue, entry).finally(() => {
        entry.inflight = null;
      });
      const done = await within(entry.inflight, this.#options.budgetMs);
      if (done !== "late" && entry.readAtMs !== null && entry.readAtMs !== before) return { rows: entry.rows, fresh: true, readAtMs: entry.readAtMs };
    }
    return { rows: entry.rows, fresh: false, readAtMs: entry.readAtMs };
  }

  // ---- rows as served ----------------------------------------------------------------------------------------------

  #chainField(venue: VenueId, row: MarketSummary): ChainField {
    const spec = this.#options.chainOf(venue);
    const store = this.#options.store;
    if (venuePolicy(venue).transport === "T0-RPC") return { ok: false, reason: `${venuePolicy(venue).name} is read from its contracts: its status is the settlement.` };
    if (spec === null || store === null) return { ok: false, reason: "The chain index does not read this venue's chain on this server." };
    const answer = indexedResolution(store, spec, row);
    return answer.ok ? { ok: true, resolution: answer.value, asOfMs: answer.asOfMs, via: answer.via } : answer;
  }

  #lastTrades(venue: VenueId, row: MarketSummary): Map<string, IndexAnswer<LastTrade>> {
    const spec = this.#options.chainOf(venue);
    const store = this.#options.store;
    if (spec === null || store === null) {
      const reason = venuePolicy(venue).transport === "T0-RPC" ? `${venuePolicy(venue).name} trades on AMM pools, which the index does not read.` : "The chain index does not read this venue's chain on this server.";
      return new Map(row.outcomes.map((o) => [o.tokenId, { ok: false as const, reason }]));
    }
    return indexedLastTrades(store, spec, row.outcomes);
  }

  // One list row with every field's origin and age.
  present(venue: VenueId, row: MarketSummary, fresh: boolean, nowMs: number): Record<string, unknown> {
    const state = this.state(venue, nowMs);
    const sourced = sourceSummary(row, { state, name: this.displayName(venue), nowMs, fresh, chain: this.#chainField(venue, row) });
    const chainNative = venuePolicy(venue).transport === "T0-RPC";
    // A chain-native venue's "API" is its contracts: what the reader read just now is a chain read.
    const origin = (o: FieldOrigin): Origin => withAge(chainNative && o.source === "venue_api" ? { source: "chain", asOfMs: o.asOfMs, via: "Base 8453" } : o, nowMs);
    const trades = this.#lastTrades(venue, row);
    const summary = sourced.summary;
    return {
      venue,
      marketId: summary.ref.marketId,
      native: summary.ref.native,
      title: summary.title,
      status: summary.status,
      closesAtUtc: summary.closesAtUtc,
      category: summary.category?.category ?? null,
      outcomes: summary.outcomes.map((outcome) => {
        const trade = trades.get(outcome.tokenId) ?? { ok: false as const, reason: "Not looked up." };
        return { ...outcome, lastTrade: trade.ok ? trade.value : null, lastTradeSource: answerOrigin(trade, nowMs) };
      }),
      volume: summary.volume,
      resolution: sourced.resolution,
      fields: Object.fromEntries(Object.entries(sourced.fields).map(([key, value]) => [key, origin(value)])),
      prov: { source: summary.prov.source, fetchedAtMs: summary.prov.fetchedAtMs, freshness: summary.prov.freshness, licence: summary.prov.license, transport: summary.prov.transport },
    };
  }

  // ---- one market ---------------------------------------------------------------------------------------------------

  #refOf(venue: VenueId, marketId: string): MarketRef {
    const kept = this.#lists.get(venue)?.rows.find((row) => row.ref.marketId.toLowerCase() === marketId.toLowerCase());
    return kept?.ref ?? { venue, marketId, native: {} };
  }

  #trim<T>(map: Map<string, T>): void {
    while (map.size > MAX_DETAIL_ENTRIES) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
  }

  // The market and its books, read now when the kept ones are due and the venue may be asked, else kept. A venue error with
  // nothing kept is thrown as { code } for the server to state.
  async #load(venue: VenueId, marketId: string, reader: VenueReadAdapter): Promise<Loaded> {
    const key = `${venue}|${marketId.toLowerCase()}`;
    let now = this.#options.nowMs();
    const mayAsk = this.#mayAsk(venue, now);
    let kept = this.#details.get(key);
    let fresh = false;
    let failure: ReadError | null = null;
    if (mayAsk && (kept === undefined || now - kept.readAtMs >= DETAIL_REFRESH_MS)) {
      try {
        const read = await within(reader.getMarket(this.#refOf(venue, marketId)), this.#options.budgetMs);
        if (read !== "late") {
          kept = { value: read, readAtMs: this.#options.nowMs() };
          this.#details.delete(key);
          this.#details.set(key, kept);
          this.#trim(this.#details);
          fresh = true;
        }
      } catch (error) {
        failure = this.#noteFailure(venue, error);
      }
    }
    now = this.#options.nowMs();
    if (kept === undefined) {
      throw Object.assign(new Error("market unavailable"), { code: failure?.code ?? (mayAsk ? "TIMEOUT" : "VENUE_PAUSED") });
    }
    const market = kept.value;
    const state = this.state(venue, now);
    const reason = state.kind === "blocked" || state.kind === "chain_only" ? venueStateReason(state, this.displayName(venue), now) : null;

    // Books: the venue alone holds them; a blocked venue has none, and a kept one is "cache" with its age.
    let books: Timed<BookResults> | undefined = this.#books.get(key);
    let booksFresh = false;
    let bookFailure: string | null = null;
    if (reason === null && this.#mayAsk(venue, now) && (books === undefined || now - books.readAtMs >= BOOK_REFRESH_MS)) {
      try {
        const tokens = market.outcomes.map((o) => ({ venue, tokenId: o.tokenId, marketId: market.ref.marketId }));
        // An absolute deadline on the injected clock (the readers' contract: Polymarket's reader takes only that form).
        const read = await within(reader.getBooks(tokens, { deadlineMs: this.#options.nowMs() + this.#options.budgetMs }), this.#options.budgetMs);
        if (read !== "late") {
          books = { value: read, readAtMs: this.#options.nowMs() };
          this.#books.delete(key);
          this.#books.set(key, books);
          this.#trim(this.#books);
          booksFresh = true;
        }
      } catch (error) {
        bookFailure = READ_ERROR_TEXT[this.#noteFailure(venue, error).code];
      }
    }
    return { key, market, readAtMs: kept.readAtMs, fresh, reason, books, booksFresh, bookFailure };
  }

  #readOrigin(venue: VenueId, asOfMs: number, isFresh: boolean, now: number): Origin {
    const chainNative = venuePolicy(venue).transport === "T0-RPC";
    return isFresh ? { source: chainNative ? "chain" : "venue_api", asOfMs, ageMs: Math.max(0, now - asOfMs), ...(chainNative ? { via: "Base 8453" } : {}) } : { source: "cache", asOfMs, ageMs: Math.max(0, now - asOfMs) };
  }

  // One book per outcome of the market, each with its origin, or null with the reason.
  #bookRows(venue: VenueId, loaded: Loaded, now: number): Array<{ readonly tokenId: string; readonly book: Book | null; readonly source: Origin }> {
    const { market, reason, books, booksFresh, bookFailure } = loaded;
    return market.outcomes.map((outcome, index) => {
      const answer = books?.value[index];
      if (reason !== null) return { tokenId: outcome.tokenId, book: null, source: { source: null, reason } };
      if (books === undefined || answer === undefined) return { tokenId: outcome.tokenId, book: null, source: { source: null, reason: bookFailure === null ? "The book was not read in time; ask again." : `The book could not be read: ${bookFailure}.` } };
      if (!answer.ok) return { tokenId: outcome.tokenId, book: null, source: { source: null, reason: `The book could not be read: ${READ_ERROR_TEXT[answer.error]}.` } };
      return { tokenId: outcome.tokenId, book: answer.value, source: this.#readOrigin(venue, books.readAtMs, booksFresh, now) };
    });
  }

  // What a quote or an order needs (docs/sdk-and-api-design.md section 4: quote and route prepare): the market, each
  // outcome's book and the fee the venue states now, each with its origin. The fee is the reader's getFeeSpec (the value
  // the venue charges, re-read at most every FEE_REFRESH_MS), or the market's own when the reader has no separate read.
  // Null when the venue has no reader; a venue error with nothing kept is thrown as { code }.
  async tradeView(venue: VenueId, marketId: string): Promise<TradeView | null> {
    const reader = this.#readers.get(venue);
    if (reader === undefined) return null;
    const loaded = await this.#load(venue, marketId, reader);
    let now = this.#options.nowMs();
    const marketOrigin = this.#readOrigin(venue, loaded.readAtMs, loaded.fresh, now);
    let fee: FeeSpec | null;
    let feeOrigin: Origin;
    if (!reader.caps.getFeeSpec) {
      fee = loaded.market.fee;
      feeOrigin = marketOrigin;
    } else {
      let kept = this.#fees.get(loaded.key);
      let fresh = false;
      let failure: string | null = null;
      if (loaded.reason === null && this.#mayAsk(venue, now) && (kept === undefined || now - kept.readAtMs >= FEE_REFRESH_MS)) {
        try {
          const read = await within(reader.getFeeSpec(loaded.market), this.#options.budgetMs);
          if (read !== "late") {
            kept = { value: read, readAtMs: this.#options.nowMs() };
            this.#fees.delete(loaded.key);
            this.#fees.set(loaded.key, kept);
            this.#trim(this.#fees);
            fresh = true;
          }
        } catch (error) {
          failure = READ_ERROR_TEXT[this.#noteFailure(venue, error).code];
        }
      }
      now = this.#options.nowMs();
      if (kept === undefined) {
        fee = null;
        feeOrigin = { source: null, reason: loaded.reason ?? (failure === null ? "The fee was not read in time; ask again." : `The fee could not be read: ${failure}.`) };
      } else {
        fee = kept.value;
        feeOrigin = this.#readOrigin(venue, kept.readAtMs, fresh, now);
      }
    }
    now = this.#options.nowMs();
    return { market: loaded.market, marketOrigin, books: this.#bookRows(venue, loaded, now), fee, feeOrigin, venueReason: loaded.reason };
  }

  // The market, its rules fingerprint and its books, each with its origin. Null when the venue has no reader; a venue
  // error with nothing kept is thrown as { code } for the server to state.
  async market(venue: VenueId, marketId: string): Promise<Record<string, unknown> | null> {
    const reader = this.#readers.get(venue);
    if (reader === undefined) return null;
    const loaded = await this.#load(venue, marketId, reader);
    const { market } = loaded;
    const now = this.#options.nowMs();
    const marketOrigin = this.#readOrigin(venue, loaded.readAtMs, loaded.fresh, now);
    const summaryLike: MarketSummary = {
      ref: market.ref,
      title: market.title,
      status: market.status,
      closesAtUtc: market.timesUtc.closesAt ?? null,
      outcomes: market.outcomes.map((o) => ({ index: o.index, role: o.role, label: o.label, tokenId: o.tokenId, displayPrice: null })),
      volume: { amount: null, unit: "unknown", windowHours: null },
      prov: { venue, source: market.prov.source, fetchedAtMs: market.prov.fetchedAtMs, transport: venuePolicy(venue).transport, freshness: "unknown", ttlMs: DETAIL_REFRESH_MS, license: venuePolicy(venue).license },
    };
    const chain = this.#chainField(venue, summaryLike);
    const trades = this.#lastTrades(venue, summaryLike);
    const bookRows = this.#bookRows(venue, loaded, now).map((row) => ({
      tokenId: row.tokenId,
      book: row.book === null ? null : { bids: row.book.bids, asks: row.book.asks, asOfMs: row.book.asOfMs, derived: row.book.derived, ...(row.book.convention === undefined ? {} : { convention: row.book.convention }) },
      source: row.source,
    }));
    const settledOnChain = chain.ok && chain.resolution.state === "resolved";
    return {
      market: {
        venue,
        marketId: market.ref.marketId,
        native: market.ref.native,
        title: market.title,
        status: settledOnChain ? "resolved" : market.status,
        timesUtc: market.timesUtc,
        tick: market.tick,
        ...(market.minSize === undefined ? {} : { minSize: market.minSize }),
        collateral: market.collateral,
        ...(market.group === undefined ? {} : { group: market.group }),
        category: market.category?.category ?? null,
        feeModel: market.fee.modelId,
        outcomes: market.outcomes.map((outcome) => {
          const trade = trades.get(outcome.tokenId) ?? { ok: false as const, reason: "Not looked up." };
          return { index: outcome.index, role: outcome.role, label: outcome.label, tokenId: outcome.tokenId, lastTrade: trade.ok ? trade.value : null, lastTradeSource: answerOrigin(trade, now) };
        }),
        rules: {
          // The one rules fingerprint recipe (sdk/rules.ts); "" from a reader means the rules cannot be fingerprinted.
          sha256: market.rules.sha256 === "" ? null : market.rules.sha256,
          recipe: RULES_HASH_RECIPE,
          text: market.rules.text,
          mechanism: market.rules.mechanism,
          void: market.rules.void,
          ...(market.rules.cutoffUtc === undefined ? {} : { cutoffUtc: market.rules.cutoffUtc }),
        },
      },
      resolution: chain.ok ? chain.resolution : null,
      books: bookRows,
      fields: {
        market: marketOrigin,
        rules: market.rules.sha256 === "" ? { source: null, reason: "The venue's rule fields cannot be fingerprinted (rules-v2)." } : marketOrigin,
        status: settledOnChain && chain.ok ? { source: "chain", asOfMs: chain.asOfMs, ageMs: Math.max(0, now - chain.asOfMs), via: chain.via } : marketOrigin,
        resolution: chain.ok ? { source: "chain", asOfMs: chain.asOfMs, ageMs: Math.max(0, now - chain.asOfMs), via: chain.via } : { source: null, reason: chain.reason },
      },
    };
  }
}

// ---- list filtering -------------------------------------------------------------------------------------------------------

export interface ListQuery {
  readonly venue: VenueId | null;
  readonly category: Category | null;
  readonly q: string | null;
  readonly limit: number;
  readonly offset: number;
}

export function matchesQuery(row: MarketSummary, query: ListQuery): boolean {
  if (query.category !== null && (row.category?.category ?? "other") !== query.category) return false;
  if (query.q !== null && !row.title.value.toLowerCase().includes(query.q)) return false;
  return true;
}
