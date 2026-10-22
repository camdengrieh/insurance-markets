import { DEFAULT_TAKE, MAX_TAKE, decodeBook, decodeMarketDetail, decodeMarketPage, type ListStatus } from "./api/client.js";
import type { MarketDetail as XoDetail } from "./api/types.js";

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
import { XoAdapterError, isXoAdapterError } from "./errors.js";
import { DEFAULT_REQUEST_TIMEOUT_MS, getJson } from "./fetch-json.js";
import { bookOf, feeSpecOf, marketOf, summaryOf, type MarketDetailResult } from "./map.js";
import { XO_CONDITION_ID, XO_TOKEN_ID, bookUrl, detailUrl, feeRateUrl, listUrl, tradingStateUrl } from "./urls.js";

// The XO read adapter (docs/dapp-design.md 7.2 M0 and 7.4 row C1).
//
// One adapter, two builds, chosen by `variant`:
//   standalone  a static page in a bare browser. Talks to the Data API only (CORS-open). Markets, rules, fee
//               parameters and the venue's display price. NO order books: the orderbook host answers a browser
//               origin with no allow-origin header, so getBooks says NOT_SUPPORTED without sending anything and
//               the explorer shows a "needs the Cockpit" tile instead of an empty book.
//   cockpit     served by the local daemon. The injected fetch maps both XO hosts onto the daemon's read proxy,
//               so the same adapter also reads books, /fee-rate and /trading-state.
// The adapter builds absolute upstream URLs and calls deps.fetch; it never reads a global. It sets no
// user-agent (the daemon's proxy pins its own) and sends no credential. Every failure is a XoAdapterError
// carrying a code from the port's closed AdapterError set.

export type XoVariant = "standalone" | "cockpit";

export interface XoAdapterOptions {
  readonly variant: XoVariant;
  // Per-request ceiling in ms; getBooks also respects its own deadline. Default 8000.
  readonly requestTimeoutMs?: number;
}

export interface SkippedListRow {
  readonly index: number;
  readonly reason: string;
}

export interface DetailedPage {
  readonly page: Page<MarketSummary>;
  // Rows that failed validation. One malformed (or hostile) user-created market never breaks the page.
  readonly skipped: readonly SkippedListRow[];
}

export interface XoAdapter extends VenueReadAdapter {
  readonly variant: XoVariant;
  listMarketsDetailed(q: ListMarketsQuery): Promise<DetailedPage>;
  // getMarket plus what was cut or dropped while decoding, and the settlement facts the port's Market has no slot for.
  getMarketDetail(ref: MarketRef): Promise<MarketDetailResult>;
}

// Only the exact name "cockpit" selects the Cockpit variant. Anything else, including a dev or test mode, gets
// the standalone variant: the one that sends the fewest requests and none to the daemon-only host.
export function xoVariantForMode(mode: string): XoVariant {
  return mode === "cockpit" ? "cockpit" : "standalone";
}

export function xoCaps(variant: XoVariant): AdapterCaps {
  return {
    listMarkets: true,
    search: true,
    getMarket: true,
    // XO books exist only behind the daemon's proxy. XO has no batch book route that this adapter uses.
    getBook: variant === "cockpit",
    getBooksBatch: false,
    getFeeSpec: true,
    getResolution: true,
    // Positions by address are the portfolio WP's (Data API portfolio by Kernel account); not part of this adapter.
    getPositionsByAddress: false,
    stream: false,
  };
}

export type BookAvailability =
  | { readonly state: "available" }
  | { readonly state: "needs_cockpit"; readonly text: "needs the Cockpit" };

// What the Markets screen shows where an XO book would be: the live book, or the fixed "needs the Cockpit"
// tile. Never an empty book (an empty book reads as "no liquidity").
export function xoBookAvailability(caps: Pick<AdapterCaps, "getBook">): BookAvailability {
  return caps.getBook ? { state: "available" } : { state: "needs_cockpit", text: "needs the Cockpit" };
}

// Port statuses to the Data API's status filter. XO has no "disputed" status, and "unknown" is not a query.
const STATUS_QUERY: Readonly<Record<Status, readonly ListStatus[]>> = {
  pending: ["PENDING"],
  active: ["ACTIVE"],
  paused: ["PAUSED", "UPDATE_REQUIRED"],
  closed: ["CLOSED"],
  determined: ["RESOLVED"],
  resolved: ["CLOSED"],
  voided: ["VOIDED", "VOIDED_CLOSED"],
  disputed: [],
  unknown: [],
};

export function xoStatusesFor(statuses: readonly Status[] | undefined): readonly ListStatus[] {
  const wanted = statuses ?? (["active"] as const);
  const out: ListStatus[] = [];
  for (const status of wanted) {
    const mapped = Object.hasOwn(STATUS_QUERY, status) ? STATUS_QUERY[status] : [];
    for (const entry of mapped) if (!out.includes(entry)) out.push(entry);
  }
  return out;
}

const CURSOR = /^[1-9][0-9]{0,4}$/;

function decodeOr<T>(decode: () => T): T {
  try {
    return decode();
  } catch (error) {
    if (error instanceof XoAdapterError) throw error;
    // The shared decoders throw plain errors whose text is built from field paths and fixed phrases only.
    throw new XoAdapterError("SCHEMA_DRIFT", "decode", { detail: error instanceof Error ? error.message.slice(0, 200) : "decode" });
  }
}

function conditionIdOf(ref: MarketRef): string {
  if (ref.venue !== "xo") throw new XoAdapterError("NOT_FOUND", "wrong_venue");
  const id = ref.marketId.toLowerCase();
  if (!XO_CONDITION_ID.test(id)) throw new XoAdapterError("NOT_FOUND", "bad_condition_id");
  return id;
}

function limitOf(limit: number | undefined): number {
  const take = limit ?? DEFAULT_TAKE;
  if (!Number.isInteger(take) || take < 1 || take > MAX_TAKE) throw new XoAdapterError("NOT_SUPPORTED", "invalid_limit");
  return take;
}

function pageOf(cursor: string | undefined): number {
  if (cursor === undefined) return 1;
  if (!CURSOR.test(cursor) || Number(cursor) > 10_000) throw new XoAdapterError("NOT_SUPPORTED", "invalid_cursor");
  return Number(cursor);
}

function searchOf(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  // The Data API search is a title-only, case-insensitive substring match; 100 printable characters at most.
  if (trimmed.length > 100 || /[\u0000-\u001f\u007f]/.test(trimmed)) throw new XoAdapterError("NOT_SUPPORTED", "invalid_search");
  return trimmed;
}

// { "base_fee": 0 } -> 0. Anything else is not a fee figure.
function feeRateOf(json: unknown): number {
  const value = typeof json === "object" && json !== null && !Array.isArray(json) && Object.hasOwn(json, "base_fee") ? (json as { base_fee: unknown }).base_fee : undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 10_000) throw new XoAdapterError("SCHEMA_DRIFT", "fee_rate_shape");
  return value;
}

export function createXoAdapter(deps: AdapterDeps, options: XoAdapterOptions): XoAdapter {
  const variant = options.variant;
  if (variant !== "standalone" && variant !== "cockpit") throw new RangeError("variant must be standalone or cockpit");
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const caps = xoCaps(variant);

  async function listMarketsDetailed(q: ListMarketsQuery): Promise<DetailedPage> {
    const take = limitOf(q.limit);
    const page = pageOf(q.cursor);
    const search = searchOf(q.text);
    const statuses = xoStatusesFor(q.statuses);
    // A status the venue does not have (only "disputed" or "unknown" asked for) is an empty answer, not a request.
    if (statuses.length === 0) return { page: { items: [], next: null }, skipped: [] };
    const url = listUrl({ statuses, take, page, ...(search === undefined ? {} : { search }) });
    const json = await getJson(deps, url, requestTimeoutMs);
    const fetchedAtMs = deps.nowMs();
    const decoded = decodeOr(() => decodeMarketPage(json, take));
    const seen = new Set<string>();
    const items: MarketSummary[] = [];
    for (const row of decoded.markets) {
      // Rows can shift between pages, so one market may appear twice.
      if (seen.has(row.conditionId)) continue;
      seen.add(row.conditionId);
      items.push(summaryOf(row, fetchedAtMs, fetchedAtMs));
    }
    const next = decoded.meta.hasNextPage && page < 10_000 ? String(page + 1) : null;
    return { page: { items, next }, skipped: decoded.skipped };
  }

  async function fetchDetail(conditionId: string): Promise<{ readonly detail: XoDetail; readonly fetchedAtMs: number }> {
    const json = await getJson(deps, detailUrl(conditionId), requestTimeoutMs);
    const fetchedAtMs = deps.nowMs();
    const detail = decodeOr(() => decodeMarketDetail(json));
    if (detail.conditionId !== conditionId) throw new XoAdapterError("SCHEMA_DRIFT", "condition_id_mismatch");
    return { detail, fetchedAtMs };
  }

  async function getMarketDetail(ref: MarketRef): Promise<MarketDetailResult> {
    const { detail, fetchedAtMs } = await fetchDetail(conditionIdOf(ref));
    return marketOf(detail, fetchedAtMs, fetchedAtMs);
  }

  async function oneBook(tokenId: string, budgetMs: number): Promise<Result<Book, AdapterError>> {
    try {
      const json = await getJson(deps, bookUrl(tokenId), Math.min(budgetMs, requestTimeoutMs));
      const fetchedAtMs = deps.nowMs();
      const book = decodeOr(() => decodeBook(json, tokenId));
      if (book.bids.length === 0 && book.asks.length === 0) return { ok: false, error: "EMPTY_BOOK" };
      // A crossed or locked book (best bid at or above best ask) is never a state the matching engine leaves behind:
      // it is corrupt or mid-update, so it is refused rather than shown or priced (pm/core/books.ts refuses it too).
      const bestBid = book.bids[0];
      const bestAsk = book.asks[0];
      if (bestBid !== undefined && bestAsk !== undefined && bestBid.priceMicro >= bestAsk.priceMicro) return { ok: false, error: "SCHEMA_DRIFT" };
      return { ok: true, value: bookOf(book, fetchedAtMs) };
    } catch (error) {
      if (isXoAdapterError(error)) return { ok: false, error: error.code };
      throw error;
    }
  }

  async function getBooks(tokens: readonly TokenRef[], opts: { readonly deadlineMs: number }): Promise<ReadonlyArray<Result<Book, AdapterError>>> {
    // Standalone: nothing is sent. The orderbook host is not in the page's CSP and is not browser-readable.
    if (!caps.getBook) return tokens.map(() => ({ ok: false, error: "NOT_SUPPORTED" }) as const);
    const startedAtMs = deps.nowMs();
    // deadlineMs is a budget in milliseconds for the whole call, spent on the injected clock.
    const budgetMs = Number.isFinite(opts.deadlineMs) ? opts.deadlineMs : 0;
    const cache = new Map<string, Result<Book, AdapterError>>();
    const results: Array<Result<Book, AdapterError>> = [];
    // One request at a time: the orderbook documents 5 requests per second per client.
    for (const token of tokens) {
      if (token.venue !== "xo" || !XO_TOKEN_ID.test(token.tokenId)) {
        results.push({ ok: false, error: "NOT_FOUND" });
        continue;
      }
      const cached = cache.get(token.tokenId);
      if (cached !== undefined) {
        results.push(cached);
        continue;
      }
      const remainingMs = budgetMs - (deps.nowMs() - startedAtMs);
      const result: Result<Book, AdapterError> = remainingMs <= 0 ? { ok: false, error: "TIMEOUT" } : await oneBook(token.tokenId, remainingMs);
      cache.set(token.tokenId, result);
      results.push(result);
    }
    return results;
  }

  async function getFeeSpec(market: Market): Promise<FeeSpec> {
    const { detail, fetchedAtMs } = await fetchDetail(conditionIdOf(market.ref));
    const rates: number[] = [];
    if (caps.getBook) {
      // /fee-rate answers 0 for every token, even a nonexistent one, so it can only raise the figure, never lower
      // it or make it known. Upstream trouble degrades to the Data API figure alone.
      for (const outcome of detail.outcomes) {
        try {
          rates.push(feeRateOf(await getJson(deps, feeRateUrl(outcome.tokenId), requestTimeoutMs)));
        } catch (error) {
          if (!isXoAdapterError(error)) throw error;
        }
      }
    }
    return feeSpecOf(detail, fetchedAtMs, rates);
  }

  async function health(): Promise<VenueHealth> {
    const notes: string[] = [];
    let ok = true;
    const fail = (what: string, error: XoAdapterError): void => {
      ok = false;
      notes.push(`${what}: ${error.code}`);
    };
    // Data API reachability: the smallest valid list request.
    try {
      const json = await getJson(deps, listUrl({ statuses: ["ACTIVE"], take: 1, page: 1 }), requestTimeoutMs);
      decodeOr(() => decodeMarketPage(json, 1));
      notes.push("data api: reachable");
    } catch (error) {
      if (!isXoAdapterError(error)) throw error;
      fail("data api", error);
    }
    if (!caps.getBook) {
      // GET /trading-state is on the orderbook host, which a browser cannot read.
      notes.push("order book state needs the Cockpit");
      return { ok, notes };
    }
    try {
      const json = await getJson(deps, tradingStateUrl(), requestTimeoutMs);
      const state = typeof json === "object" && json !== null && !Array.isArray(json) && Object.hasOwn(json, "state") ? (json as { state: unknown }).state : undefined;
      if (state === "active") {
        notes.push("trading: active");
      } else if (state === "paused") {
        ok = false;
        notes.push("trading: paused");
      } else {
        ok = false;
        notes.push("trading: unknown state");
      }
    } catch (error) {
      if (!isXoAdapterError(error)) throw error;
      fail("order book", error);
    }
    return { ok, notes };
  }

  return {
    id: "xo",
    caps,
    variant,
    listMarkets: async (q) => (await listMarketsDetailed(q)).page,
    listMarketsDetailed,
    getMarket: async (ref) => (await getMarketDetail(ref)).market,
    getMarketDetail,
    getBooks,
    getFeeSpec,
    health,
  };
}
