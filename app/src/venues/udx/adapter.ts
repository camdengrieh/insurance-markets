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
import { UDX_BOOK_DEPTH, UDX_LIST_PAGE_DEFAULT, UDX_LIST_PAGE_MAX, UDX_MAX_DROPPED_SHARE, checkedOrigin, registeredOrigin } from "./constants";
import { AdapterFailure, isAdapterFailure } from "./errors";
import { getJson, resolveDeadline } from "./http";
import { bookOf, feeSpec, isCombo, marketOf, parseBook, parseTokenId, priceRules, summaryOf } from "./map";
import { PAGE_TOKEN, TICKER, bookEnvelopeSchema, listEnvelopeSchema, marketEnvelopeSchema, rowSchema, type UdxBookBody, type UdxRow } from "./schemas";

// Underdog Exchange (UDX): a CFTC-regulated US exchange. Read-only, keyless public routes only; every request is a
// GET without a credential. RESTRICTED (docs/dapp-design.md 4.8 R3, R8 and fork F5): US-only with a linked Underdog
// account, so the adapter is OFF until the user turns the venue on and accepts the clause (core/venue-policy.ts
// decides), has no cache and touches no storage, and its rows are marked own-use-only so no other module persists
// or exports them. The host sends no CORS header to a third-party origin, so it works only through the local
// Cockpit's read proxy; in the standalone build every call is refused before any request. Until headers.config.ts
// lists a host for it, every call is refused with "origin_not_registered". Sources:
// docs/research/venues/underdog-udx.md, docs/dapp-design.md 4.6 and 7.2 (C5).

const CAPS: AdapterCaps = {
  listMarkets: true,
  search: false,
  getMarket: true,
  getBook: true,
  getBooksBatch: false,
  getFeeSpec: true,
  getResolution: false,
  getPositionsByAddress: false,
  stream: false,
};

export interface UdxOptions {
  readonly build: BuildKind;
  // Read on every call. The default is the venue's own default: OFF, until the clause is accepted.
  readonly switches?: () => VenueSwitches;
  // Test seam: an https origin that replaces the one in headers.config.ts.
  readonly origin?: string;
}

export interface UdxReadReport {
  readonly parsed: number;
  readonly dropped: number;
  // Combos: skipped, not repaired (their legs and own books are not modelled).
  readonly skippedUnsupported: number;
  readonly fetchedAtMs: number;
}

export interface UdxAdapter extends VenueReadAdapter {
  readonly id: "udx";
  readonly origin: string | null;
  // Restricted terms: the rows this adapter returns must be kept in memory only and never exported.
  readonly memoryOnly: true;
  lastReadReport(): UdxReadReport;
}

// Port status -> the route's `status` query value. One value per call.
const LISTABLE: Readonly<Partial<Record<Status, string>>> = { active: "open", pending: "unopened", paused: "paused", closed: "closed" };

function statusParam(statuses: readonly Status[] | undefined): string {
  const wanted = statuses === undefined || statuses.length === 0 ? (["active"] as const) : [...new Set(statuses)];
  if (wanted.length !== 1) throw new AdapterFailure("udx", "NOT_SUPPORTED", "one_status_per_call");
  const status = wanted[0];
  const param = status === undefined ? undefined : LISTABLE[status];
  if (param === undefined) throw new AdapterFailure("udx", "NOT_SUPPORTED", "status_not_listable");
  return param;
}

function tickerOf(ref: MarketRef): string {
  if (ref.venue !== "udx") throw new AdapterFailure("udx", "NOT_SUPPORTED", "wrong_venue");
  if (!TICKER.test(ref.marketId)) throw new AdapterFailure("udx", "NOT_FOUND", "bad_market_id");
  return ref.marketId;
}

// `next_page_url` is a relative URL carrying an opaque `page` token. The URL is never followed as given: only the
// token is taken, checked against a closed alphabet, and put into a request this adapter builds itself.
function nextCursor(nextPageUrl: string | null | undefined): string | null {
  if (nextPageUrl === null || nextPageUrl === undefined || nextPageUrl === "") return null;
  if (!nextPageUrl.startsWith("/markets?")) throw new AdapterFailure("udx", "SCHEMA_DRIFT", "bad_next_cursor");
  const token = new URLSearchParams(nextPageUrl.slice("/markets?".length)).get("page");
  if (token === null || !PAGE_TOKEN.test(token)) throw new AdapterFailure("udx", "SCHEMA_DRIFT", "bad_next_cursor");
  return token;
}

type BookRead = { readonly ok: true; readonly body: UdxBookBody } | { readonly ok: false; readonly error: AdapterError };

export function createUdxAdapter(deps: AdapterDeps, options: UdxOptions): UdxAdapter {
  const origin = options.origin !== undefined ? checkedOrigin(options.origin) : registeredOrigin("udx");
  const switches = options.switches ?? ((): VenueSwitches => DEFAULT_SWITCHES);
  let report: UdxReadReport = { parsed: 0, dropped: 0, skippedUnsupported: 0, fetchedAtMs: 0 };

  // The one place that decides whether a call may go out at all.
  function guard(): string {
    const state = venueState("udx", switches(), options.build);
    if (!state.enabled) throw new AdapterFailure("udx", "NOT_SUPPORTED", state.reason);
    if (origin === null) throw new AdapterFailure("udx", "NOT_SUPPORTED", "origin_not_registered");
    return origin;
  }

  async function listMarkets(q: ListMarketsQuery): Promise<Page<MarketSummary>> {
    const base = guard();
    if (q.text !== undefined && q.text !== "") throw new AdapterFailure("udx", "NOT_SUPPORTED", "text_search");
    const status = statusParam(q.statuses);
    const limit = Math.min(Math.max(Math.trunc(q.limit ?? UDX_LIST_PAGE_DEFAULT), 1), UDX_LIST_PAGE_MAX);
    if (q.cursor !== undefined && q.cursor !== "" && !PAGE_TOKEN.test(q.cursor)) throw new AdapterFailure("udx", "NOT_SUPPORTED", "bad_cursor");
    const fetchedAtMs = deps.nowMs();
    const page = q.cursor === undefined || q.cursor === "" ? "" : `&page=${q.cursor}`;
    const body = await getJson(deps, { url: `${base}/markets?status=${status}&type=single_leg&limit=${limit}${page}` });
    const envelope = listEnvelopeSchema.safeParse(body);
    if (!envelope.success) throw new AdapterFailure("udx", "SCHEMA_DRIFT", "list_shape");

    const items: MarketSummary[] = [];
    let dropped = 0;
    let skipped = 0;
    for (const raw of envelope.data.markets) {
      const row = rowSchema.safeParse(raw);
      if (!row.success) {
        dropped += 1;
        continue;
      }
      if (isCombo(row.data)) {
        skipped += 1;
        continue;
      }
      if (priceRules(row.data) === null) {
        dropped += 1;
        continue;
      }
      items.push(summaryOf(row.data, base, fetchedAtMs));
    }
    report = { parsed: items.length, dropped, skippedUnsupported: skipped, fetchedAtMs };
    if (envelope.data.markets.length > 0 && items.length === 0 && skipped === 0) throw new AdapterFailure("udx", "SCHEMA_DRIFT", "no_valid_rows");
    if (items.length + dropped > 0 && dropped / (items.length + dropped) > UDX_MAX_DROPPED_SHARE) throw new AdapterFailure("udx", "SCHEMA_DRIFT", "too_many_invalid_rows");
    return { items, next: nextCursor(envelope.data.next_page_url) };
  }

  async function readMarket(ticker: string, base: string): Promise<UdxRow> {
    const body = await getJson(deps, { url: `${base}/markets/${ticker}`, notFoundStatuses: [404] });
    const envelope = marketEnvelopeSchema.safeParse(body);
    if (!envelope.success) throw new AdapterFailure("udx", "SCHEMA_DRIFT", "market_shape");
    const row = rowSchema.safeParse(envelope.data.market);
    if (!row.success) throw new AdapterFailure("udx", "SCHEMA_DRIFT", "market_shape");
    // The venue answered for a different market than the one asked for: never show it as the requested one.
    if (row.data.ticker !== ticker) throw new AdapterFailure("udx", "SCHEMA_DRIFT", "ticker_mismatch");
    if (isCombo(row.data)) throw new AdapterFailure("udx", "NOT_SUPPORTED", "unsupported_market");
    return row.data;
  }

  async function getMarket(ref: MarketRef): Promise<Market> {
    const base = guard();
    const row = await readMarket(tickerOf(ref), base);
    const rules = priceRules(row);
    if (rules === null) throw new AdapterFailure("udx", "SCHEMA_DRIFT", "price_rules");
    return marketOf(row, rules.tick, base, deps.nowMs());
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
    const fetched = new Map<string, Promise<BookRead>>();
    const read = (ticker: string): Promise<BookRead> => {
      let pending = fetched.get(ticker);
      if (pending === undefined) {
        pending = getJson(deps, { url: `${base}/markets/${ticker}/orderbook?depth=${UDX_BOOK_DEPTH}`, deadlineAtMs, notFoundStatuses: [404] }).then(
          (body): BookRead => {
            const parsed = bookEnvelopeSchema.safeParse(body);
            return parsed.success ? { ok: true, body: parsed.data.orderbook } : { ok: false, error: "SCHEMA_DRIFT" };
          },
          (error: unknown): BookRead => ({ ok: false, error: isAdapterFailure(error) ? error.code : "SCHEMA_DRIFT" }),
        );
        fetched.set(ticker, pending);
      }
      return pending;
    };

    const out: Array<Result<Book, AdapterError>> = [];
    for (const token of tokens) {
      const id = token.venue === "udx" ? parseTokenId(token.tokenId) : null;
      if (id === null) {
        out.push(fail("NOT_SUPPORTED"));
        continue;
      }
      const venueBook = await read(id.ticker);
      if (!venueBook.ok) {
        out.push(fail(venueBook.error));
        continue;
      }
      // The book must be for the market we asked about; anything else is a mix-up, not a book.
      if (venueBook.body.ticker !== id.ticker) {
        out.push(fail("SCHEMA_DRIFT"));
        continue;
      }
      const parsed = parseBook(venueBook.body);
      if (!parsed.ok) {
        out.push(fail("SCHEMA_DRIFT"));
        continue;
      }
      if (parsed.bids.length === 0 && parsed.asks.length === 0) {
        out.push(fail("EMPTY_BOOK"));
        continue;
      }
      out.push({ ok: true, value: bookOf(id.side, id.ticker, parsed, deps.nowMs()) });
    }
    return out;
  }

  async function getFeeSpec(_market: Market): Promise<FeeSpec> {
    // The schedule is a venue document, not an API field: the spec carries the date it was read and a ttl.
    return feeSpec(guard());
  }

  async function health(): Promise<VenueHealth> {
    let base: string;
    try {
      base = guard();
    } catch (error) {
      return { ok: false, notes: [isAdapterFailure(error) ? error.detail : "unavailable"] };
    }
    try {
      const body = await getJson(deps, { url: `${base}/markets?status=open&type=single_leg&limit=1` });
      return listEnvelopeSchema.safeParse(body).success ? { ok: true, notes: ["markets_answered"] } : { ok: false, notes: ["list_shape"] };
    } catch (error) {
      return { ok: false, notes: [isAdapterFailure(error) ? error.detail : "unavailable"] };
    }
  }

  return { id: "udx", caps: CAPS, origin, memoryOnly: true, listMarkets, getMarket, getBooks, getFeeSpec, health, lastReadReport: () => report };
}
