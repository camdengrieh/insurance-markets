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
import { SX_LIST_PAGE_DEFAULT, SX_LIST_PAGE_MAX, SX_MAX_DROPPED_SHARE, checkedOrigin, registeredOrigin } from "./constants.js";
import { AdapterFailure, isAdapterFailure } from "./errors.js";
import { getJson, resolveDeadline } from "./http.js";
import { bookOf, isClob, marketOf, parseBook, parseTokenId, summaryOf, unknownFee } from "./map.js";
import { MARKET_HASH, PAGE_KEY, bookEnvelopeSchema, findEnvelopeSchema, listEnvelopeSchema, metadataEnvelopeSchema, rowSchema, type SxBookBody, type SxRow } from "./schemas.js";

// SX Bet: a peer-to-peer sports exchange. Read-only, keyless public routes only; every request is a GET without a
// credential. The host sends no CORS header to a third-party origin (docs/dapp-design.md 4.2), so the adapter
// works only through the local Cockpit's read proxy; in the standalone build every call is refused before any
// request. It is off until the user turns the venue on (sdk/venues/policy.ts), and until sdk/venues/origins.ts lists a
// host for it, every call is refused with "origin_not_registered". Sources: docs/research/venues/sx-bet.md,
// docs/dapp-design.md 4.6 and 7.2 (C5).

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

export interface SxOptions {
  readonly build: BuildKind;
  // Read on every call. The default is the venue's own default: OFF.
  readonly switches?: () => VenueSwitches;
  // Test seam: an https origin that replaces the one in sdk/venues/origins.ts.
  readonly origin?: string;
}

export interface SxReadReport {
  readonly parsed: number;
  readonly dropped: number;
  // Markets that do not trade on the central order book (parlays and the like): skipped, not repaired.
  readonly skippedUnsupported: number;
  readonly fetchedAtMs: number;
}

export interface SxAdapter extends VenueReadAdapter {
  readonly id: "sx";
  readonly origin: string | null;
  lastReadReport(): SxReadReport;
}

function onlyActive(statuses: readonly Status[] | undefined): void {
  if (statuses === undefined || statuses.length === 0) return;
  if (!statuses.includes("active")) throw new AdapterFailure("sx", "NOT_SUPPORTED", "only_active_listed");
}

function hashOf(ref: MarketRef): string {
  if (ref.venue !== "sx") throw new AdapterFailure("sx", "NOT_SUPPORTED", "wrong_venue");
  if (!MARKET_HASH.test(ref.marketId)) throw new AdapterFailure("sx", "NOT_FOUND", "bad_market_id");
  return ref.marketId.toLowerCase();
}

type BookRead = { readonly ok: true; readonly body: SxBookBody } | { readonly ok: false; readonly error: AdapterError };

export function createSxAdapter(deps: AdapterDeps, options: SxOptions): SxAdapter {
  const origin = options.origin !== undefined ? checkedOrigin(options.origin) : registeredOrigin("sx");
  const switches = options.switches ?? ((): VenueSwitches => DEFAULT_SWITCHES);
  let report: SxReadReport = { parsed: 0, dropped: 0, skippedUnsupported: 0, fetchedAtMs: 0 };

  // The one place that decides whether a call may go out at all.
  function guard(): string {
    const state = venueState("sx", switches(), options.build);
    if (!state.enabled) throw new AdapterFailure("sx", "NOT_SUPPORTED", state.reason);
    if (origin === null) throw new AdapterFailure("sx", "NOT_SUPPORTED", "origin_not_registered");
    return origin;
  }

  async function listMarkets(q: ListMarketsQuery): Promise<Page<MarketSummary>> {
    const base = guard();
    if (q.text !== undefined && q.text !== "") throw new AdapterFailure("sx", "NOT_SUPPORTED", "text_search");
    onlyActive(q.statuses);
    const limit = Math.min(Math.max(Math.trunc(q.limit ?? SX_LIST_PAGE_DEFAULT), 1), SX_LIST_PAGE_MAX);
    if (q.cursor !== undefined && q.cursor !== "" && !PAGE_KEY.test(q.cursor)) throw new AdapterFailure("sx", "NOT_SUPPORTED", "bad_cursor");
    const fetchedAtMs = deps.nowMs();
    const key = q.cursor === undefined || q.cursor === "" ? "" : `&paginationKey=${q.cursor}`;
    const body = await getJson(deps, { url: `${base}/markets/active?pageSize=${limit}${key}` });
    const envelope = listEnvelopeSchema.safeParse(body);
    if (!envelope.success) throw new AdapterFailure("sx", "SCHEMA_DRIFT", "list_shape");

    const items: MarketSummary[] = [];
    let dropped = 0;
    let skipped = 0;
    for (const raw of envelope.data.data.markets) {
      const row = rowSchema.safeParse(raw);
      if (!row.success) {
        dropped += 1;
        continue;
      }
      if (!isClob(row.data)) {
        skipped += 1;
        continue;
      }
      items.push(summaryOf(row.data, base, fetchedAtMs));
    }
    report = { parsed: items.length, dropped, skippedUnsupported: skipped, fetchedAtMs };
    if (envelope.data.data.markets.length > 0 && items.length === 0 && skipped === 0) throw new AdapterFailure("sx", "SCHEMA_DRIFT", "no_valid_rows");
    if (items.length + dropped > 0 && dropped / (items.length + dropped) > SX_MAX_DROPPED_SHARE) throw new AdapterFailure("sx", "SCHEMA_DRIFT", "too_many_invalid_rows");

    const next = envelope.data.data.nextKey;
    if (typeof next === "string" && next !== "" && !PAGE_KEY.test(next)) throw new AdapterFailure("sx", "SCHEMA_DRIFT", "bad_next_cursor");
    return { items, next: typeof next === "string" && next !== "" ? next : null };
  }

  async function readMarket(hash: string, base: string): Promise<SxRow> {
    const body = await getJson(deps, { url: `${base}/markets/find?marketHashes=${hash}`, notFoundStatuses: [404] });
    const envelope = findEnvelopeSchema.safeParse(body);
    if (!envelope.success) throw new AdapterFailure("sx", "SCHEMA_DRIFT", "find_shape");
    // An unknown hash answers with an empty list.
    if (envelope.data.data.length === 0) throw new AdapterFailure("sx", "NOT_FOUND", "no_such_market");
    const row = rowSchema.safeParse(envelope.data.data[0]);
    if (!row.success) throw new AdapterFailure("sx", "SCHEMA_DRIFT", "market_shape");
    // The venue answered for a different market than the one asked for: never show it as the requested one.
    if (row.data.marketHash.toLowerCase() !== hash) throw new AdapterFailure("sx", "SCHEMA_DRIFT", "hash_mismatch");
    if (!isClob(row.data)) throw new AdapterFailure("sx", "NOT_SUPPORTED", "unsupported_market");
    return row.data;
  }

  async function getMarket(ref: MarketRef): Promise<Market> {
    const base = guard();
    const row = await readMarket(hashOf(ref), base);
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
    // One venue book per market serves both of its outcomes.
    const fetched = new Map<string, Promise<BookRead>>();
    const read = (hash: string): Promise<BookRead> => {
      let pending = fetched.get(hash);
      if (pending === undefined) {
        pending = getJson(deps, { url: `${base}/orderbook-v3/snapshot?marketHash=${hash}`, deadlineAtMs, notFoundStatuses: [404] }).then(
          (body): BookRead => {
            const parsed = bookEnvelopeSchema.safeParse(body);
            return parsed.success ? { ok: true, body: parsed.data.data } : { ok: false, error: "SCHEMA_DRIFT" };
          },
          (error: unknown): BookRead => ({ ok: false, error: isAdapterFailure(error) ? error.code : "SCHEMA_DRIFT" }),
        );
        fetched.set(hash, pending);
      }
      return pending;
    };

    const out: Array<Result<Book, AdapterError>> = [];
    for (const token of tokens) {
      const id = token.venue === "sx" ? parseTokenId(token.tokenId) : null;
      if (id === null) {
        out.push(fail("NOT_SUPPORTED"));
        continue;
      }
      const venueBook = await read(id.marketHash);
      if (!venueBook.ok) {
        out.push(fail(venueBook.error));
        continue;
      }
      // The book must be for the market we asked about; anything else is a mix-up, not a book.
      if (venueBook.body.marketHash.toLowerCase() !== id.marketHash) {
        out.push(fail("SCHEMA_DRIFT"));
        continue;
      }
      const parsed = parseBook(venueBook.body);
      if (!parsed.ok) {
        out.push(fail("SCHEMA_DRIFT"));
        continue;
      }
      if (parsed.one.length === 0 && parsed.two.length === 0) {
        out.push(fail("EMPTY_BOOK"));
        continue;
      }
      out.push({ ok: true, value: bookOf(id.side, id.marketHash, parsed, deps.nowMs()) });
    }
    return out;
  }

  async function getFeeSpec(market: Market): Promise<FeeSpec> {
    const base = guard();
    // The per-account rate is a keyed route; without a key the fee is unknown, already past its ttl.
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
      const body = await getJson(deps, { url: `${base}/metadata/obv3` });
      const metadata = metadataEnvelopeSchema.safeParse(body);
      if (!metadata.success) return { ok: false, notes: ["metadata_shape"] };
      return { ok: true, notes: ["metadata_answered"] };
    } catch (error) {
      return { ok: false, notes: [isAdapterFailure(error) ? error.detail : "unavailable"] };
    }
  }

  return { id: "sx", caps: CAPS, origin, listMarkets, getMarket, getBooks, getFeeSpec, health, lastReadReport: () => report };
}
