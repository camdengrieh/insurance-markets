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
import { LIMITLESS_LIST_PAGE_DEFAULT, LIMITLESS_LIST_PAGE_MAX, LIMITLESS_TOKEN_INDEX_MAX, checkedOrigin, registeredOrigin } from "./constants.js";
import { AdapterFailure, isAdapterFailure } from "./errors.js";
import { getJson, resolveDeadline } from "./http.js";
import { bookOf, isClob, marketOf, unknownFee, type TokenPair } from "./map.js";
import { parseBookBody, parseDetailBody, parseListBody, type LimitlessBookRead } from "./parse.js";
import { SLUG, type LimitlessRow } from "./schemas.js";

// Limitless (Base): a CLOB with Yes/No outcome tokens. Read-only; every request is a GET to the venue's API
// host. The host sends no CORS header to a third-party origin (docs/dapp-design.md 4.2), so this adapter works
// only through the local Cockpit's read proxy (service "limitless"); in the standalone build every call is
// refused before any request with the reason the UI shows as "needs the Cockpit". Sources:
// docs/research/09-venues-onchain-clob.md section 2.3, docs/dapp-design.md 4.6 and 7.2 (M0-2, C5).

const CAPS: AdapterCaps = {
  listMarkets: true,
  // `/markets/search` is not on the daemon's allowlist, so there is no text search.
  search: false,
  getMarket: true,
  getBook: true,
  getBooksBatch: false,
  getFeeSpec: true,
  getResolution: false,
  // The populated /portfolio/{account}/positions answer was never recorded (DT8): not built.
  getPositionsByAddress: false,
  stream: false,
};

export interface LimitlessOptions {
  // "standalone" refuses every call (the host is CORS-blocked); "cockpit" reads through the daemon.
  readonly build: BuildKind;
  // Read on every call, so switching the venue off takes effect at once. Default: the venue's own defaults.
  readonly switches?: () => VenueSwitches;
  // Test seam: an https origin that replaces the one in sdk/venues/origins.ts.
  readonly origin?: string;
}

export interface LimitlessReadReport {
  readonly parsed: number;
  readonly dropped: number;
  // Rows that are not a single Yes/No market on USDC (groups, other collateral): skipped, not repaired.
  readonly skippedUnsupported: number;
  readonly fetchedAtMs: number;
}

export interface LimitlessAdapter extends VenueReadAdapter {
  readonly id: "limitless";
  // Whether an origin is registered for this venue in sdk/venues/origins.ts (or given for a test).
  readonly origin: string | null;
  lastReadReport(): LimitlessReadReport;
}

// Port statuses -> what `/markets/active` can list. Only active markets are listed by that route.
function onlyActive(statuses: readonly Status[] | undefined): void {
  if (statuses === undefined || statuses.length === 0) return;
  if (!statuses.includes("active")) throw new AdapterFailure("limitless", "NOT_SUPPORTED", "only_active_listed");
}

function parsePage(cursor: string | undefined): number {
  if (cursor === undefined || cursor === "") return 1;
  if (!/^[1-9][0-9]{0,5}$/.test(cursor)) throw new AdapterFailure("limitless", "NOT_SUPPORTED", "bad_cursor");
  return Number(cursor);
}

function slugOf(ref: MarketRef): string {
  if (ref.venue !== "limitless") throw new AdapterFailure("limitless", "NOT_SUPPORTED", "wrong_venue");
  if (!SLUG.test(ref.marketId)) throw new AdapterFailure("limitless", "NOT_FOUND", "bad_market_id");
  return ref.marketId;
}

type Loaded = { readonly ok: true } | { readonly ok: false; readonly error: AdapterError };

export function createLimitlessAdapter(deps: AdapterDeps, options: LimitlessOptions): LimitlessAdapter {
  const origin = options.origin !== undefined ? checkedOrigin(options.origin) : registeredOrigin("limitless");
  const switches = options.switches ?? ((): VenueSwitches => DEFAULT_SWITCHES);
  let report: LimitlessReadReport = { parsed: 0, dropped: 0, skippedUnsupported: 0, fetchedAtMs: 0 };
  // token id -> market, filled by every list and detail read. Bounded; cleared rather than grown.
  const tokenIndex = new Map<string, { readonly slug: string; readonly pair: TokenPair; readonly clob: boolean }>();

  // The one place that decides whether a call may go out at all.
  function guard(): string {
    const state = venueState("limitless", switches(), options.build);
    if (!state.enabled) throw new AdapterFailure("limitless", "NOT_SUPPORTED", state.reason);
    if (origin === null) throw new AdapterFailure("limitless", "NOT_SUPPORTED", "origin_not_registered");
    return origin;
  }

  function remember(row: LimitlessRow): void {
    if (tokenIndex.size >= LIMITLESS_TOKEN_INDEX_MAX) tokenIndex.clear();
    const entry = { slug: row.slug, pair: { yes: row.tokens.yes, no: row.tokens.no }, clob: isClob(row) };
    tokenIndex.set(row.tokens.yes, entry);
    tokenIndex.set(row.tokens.no, entry);
  }

  async function readDetail(slug: string, base: string, deadlineAtMs?: number): Promise<LimitlessRow> {
    const body = await getJson(deps, { url: `${base}/markets/${slug}`, ...(deadlineAtMs === undefined ? {} : { deadlineAtMs }), notFoundStatuses: [404] });
    // The shared parser refuses another market's answer and a market it does not model.
    const read = parseDetailBody(body, slug);
    if (!read.ok) throw new AdapterFailure("limitless", read.error, read.detail);
    remember(read.value);
    return read.value;
  }

  async function listMarkets(q: ListMarketsQuery): Promise<Page<MarketSummary>> {
    const base = guard();
    if (q.text !== undefined && q.text !== "") throw new AdapterFailure("limitless", "NOT_SUPPORTED", "text_search");
    onlyActive(q.statuses);
    const limit = Math.min(Math.max(Math.trunc(q.limit ?? LIMITLESS_LIST_PAGE_DEFAULT), 1), LIMITLESS_LIST_PAGE_MAX);
    const page = parsePage(q.cursor);
    const fetchedAtMs = deps.nowMs();
    const body = await getJson(deps, { url: `${base}/markets/active?limit=${limit}&page=${page}` });
    const read = parseListBody(body, base, fetchedAtMs, page, limit);
    const counts = read.ok ? read.value : read.counts;
    if (counts !== null) report = { parsed: counts.parsed, dropped: counts.dropped, skippedUnsupported: counts.skippedUnsupported, fetchedAtMs };
    if (!read.ok) throw new AdapterFailure("limitless", read.error, read.detail);
    for (const row of read.value.rows) remember(row);
    return { items: read.value.items, next: read.value.hasMore ? String(page + 1) : null };
  }

  async function getMarket(ref: MarketRef): Promise<Market> {
    const base = guard();
    const slug = slugOf(ref);
    const row = await readDetail(slug, base);
    return marketOf(row, base, deps.nowMs());
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
    const books = new Map<string, Promise<Result<LimitlessBookRead, AdapterError>>>();
    const markets = new Map<string, Promise<Loaded>>();

    const ensureMarket = (slug: string): Promise<Loaded> => {
      let pending = markets.get(slug);
      if (pending === undefined) {
        pending = readDetail(slug, base, deadlineAtMs).then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error: isAdapterFailure(error) ? error.code : "SCHEMA_DRIFT" }),
        );
        markets.set(slug, pending);
      }
      return pending;
    };
    // The book must name the token we think is YES; the shared parser checks it.
    const ensureBook = (slug: string, yesTokenId: string): Promise<Result<LimitlessBookRead, AdapterError>> => {
      let pending = books.get(slug);
      if (pending === undefined) {
        pending = getJson(deps, { url: `${base}/markets/${slug}/orderbook`, deadlineAtMs, notFoundStatuses: [404] }).then(
          (body): Result<LimitlessBookRead, AdapterError> => {
            const read = parseBookBody(body, yesTokenId);
            return read.ok ? read : { ok: false, error: read.error };
          },
          (error: unknown): Result<LimitlessBookRead, AdapterError> => ({ ok: false, error: isAdapterFailure(error) ? error.code : "SCHEMA_DRIFT" }),
        );
        books.set(slug, pending);
      }
      return pending;
    };

    const out: Array<Result<Book, AdapterError>> = [];
    for (const token of tokens) {
      if (token.venue !== "limitless" || !/^[0-9]{1,78}$/.test(token.tokenId)) {
        out.push(fail("NOT_SUPPORTED"));
        continue;
      }
      let known = tokenIndex.get(token.tokenId);
      if (known === undefined) {
        // A token id alone does not name a market. The caller's market id is a hint that is checked against the
        // venue's own token pair below, never trusted.
        const hinted = token.marketId !== undefined && SLUG.test(token.marketId) ? token.marketId : null;
        if (hinted === null) {
          out.push(fail("NOT_FOUND"));
          continue;
        }
        const loaded = await ensureMarket(hinted);
        if (!loaded.ok) {
          out.push(fail(loaded.error));
          continue;
        }
        known = tokenIndex.get(token.tokenId);
      }
      if (known === undefined) {
        out.push(fail("NOT_FOUND"));
        continue;
      }
      if (!known.clob) {
        out.push(fail("NOT_SUPPORTED"));
        continue;
      }
      const venueBook = await ensureBook(known.slug, known.pair.yes);
      if (!venueBook.ok) {
        out.push(fail(venueBook.error));
        continue;
      }
      out.push({ ok: true, value: bookOf(token.tokenId === known.pair.yes ? "yes" : "no", token.tokenId, venueBook.value, deps.nowMs()) });
    }
    return out;
  }

  async function getFeeSpec(market: Market): Promise<FeeSpec> {
    const base = guard();
    // Past its ttl at birth: the venue documents a 0.40 to 3.00 percent range but no machine-readable model.
    return unknownFee(base, market.ref.marketId, deps.nowMs());
  }

  async function health(): Promise<VenueHealth> {
    let base: string;
    try {
      base = guard();
    } catch (error) {
      return { ok: false, notes: [isAdapterFailure(error) ? error.detail : "unavailable"] };
    }
    try {
      await getJson(deps, { url: `${base}/markets/active?limit=1&page=1` });
      return { ok: true, notes: ["markets_active_answered"] };
    } catch (error) {
      return { ok: false, notes: [isAdapterFailure(error) ? error.detail : "unavailable"] };
    }
  }

  return {
    id: "limitless",
    caps: CAPS,
    origin,
    listMarkets,
    getMarket,
    getBooks,
    getFeeSpec,
    health,
    lastReadReport: () => report,
  };
}
