import type { AdapterError, MarketSummary } from "../../model.js";
import { LIMITLESS_MAX_DROPPED_SHARE } from "./constants.js";
import { isModelled, parseBook, summaryOf, type RawLevel } from "./map.js";
import { bookSchema, listEnvelopeSchema, rowHeadSchema, singleRowSchema, type LimitlessRow } from "./schemas.js";

// The one Limitless parser: venue answer bodies in, validated values or a closed error out. It does no I/O and
// holds no state. The dApp reader (adapter.ts) calls it; it is exported so the other hosts that read Limitless
// (the pm recorder's collector and the linker's discovery) can move onto it.
//
// A failure carries a code from the closed AdapterError set and a short fixed detail token. Neither ever quotes
// upstream text.

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AdapterError; readonly detail: string };

const fail = (error: AdapterError, detail: string): { readonly ok: false; readonly error: AdapterError; readonly detail: string } => ({ ok: false, error, detail });

// ---- one market ---------------------------------------------------------------------------------------------------------------

// GET /markets/{slug}: the market itself. The venue answering for another market, and a market this parser does not
// model (a group, another collateral), are each refused, never shown as the requested market.
export function parseDetailBody(body: unknown, slug: string): Parsed<LimitlessRow> {
  const parsed = singleRowSchema.safeParse(body);
  if (!parsed.success) return fail("SCHEMA_DRIFT", "market_shape");
  if (parsed.data.slug !== slug) return fail("SCHEMA_DRIFT", "slug_mismatch");
  if (!isModelled(parsed.data)) return fail("NOT_SUPPORTED", "unsupported_market");
  return { ok: true, value: parsed.data };
}

// ---- the market list ----------------------------------------------------------------------------------------------------------

export interface LimitlessListCounts {
  readonly parsed: number;
  // Rows that failed validation.
  readonly dropped: number;
  // Rows that are not a single Yes/No market on USDC (groups, other collateral): skipped, not repaired.
  readonly skippedUnsupported: number;
}

export interface LimitlessListRead extends LimitlessListCounts {
  readonly items: readonly MarketSummary[];
  // The validated rows behind `items`, in the same order (a host indexes their token pairs).
  readonly rows: readonly LimitlessRow[];
  // Every row not returned, by its index in the answer.
  readonly rejected: ReadonlyArray<{ readonly index: number; readonly reason: "invalid_row" | "unsupported_market" }>;
  // Whether another page exists: from totalMarketsCount when it is a plain count, else from a full page.
  readonly hasMore: boolean;
}

export type ParsedList = { readonly ok: true; readonly value: LimitlessListRead } | { readonly ok: false; readonly error: AdapterError; readonly detail: string; readonly counts: LimitlessListCounts | null };

// GET /markets/active?limit=&page=: { data: [row], totalMarketsCount }. An answer where every row fails, or more than
// half of the modelled rows fail, is a changed shape (SCHEMA_DRIFT).
export function parseListBody(body: unknown, origin: string, nowMs: number, page: number, limit: number): ParsedList {
  const envelope = listEnvelopeSchema.safeParse(body);
  if (!envelope.success) return { ...fail("SCHEMA_DRIFT", "list_shape"), counts: null };
  const items: MarketSummary[] = [];
  const rows: LimitlessRow[] = [];
  const rejected: Array<{ index: number; reason: "invalid_row" | "unsupported_market" }> = [];
  let dropped = 0;
  let skipped = 0;
  envelope.data.data.forEach((raw, index) => {
    const head = rowHeadSchema.safeParse(raw);
    if (!head.success) {
      dropped += 1;
      rejected.push({ index, reason: "invalid_row" });
      return;
    }
    // Group markets list their children inside; their shape was never recorded, so they are not modelled.
    if (head.data.marketType !== "single") {
      skipped += 1;
      rejected.push({ index, reason: "unsupported_market" });
      return;
    }
    const row = singleRowSchema.safeParse(raw);
    if (!row.success) {
      dropped += 1;
      rejected.push({ index, reason: "invalid_row" });
      return;
    }
    if (!isModelled(row.data)) {
      skipped += 1;
      rejected.push({ index, reason: "unsupported_market" });
      return;
    }
    rows.push(row.data);
    items.push(summaryOf(row.data, origin, nowMs));
  });
  const counts: LimitlessListCounts = { parsed: items.length, dropped, skippedUnsupported: skipped };
  const modelled = items.length + dropped;
  if (envelope.data.data.length > 0 && items.length === 0 && skipped === 0) return { ...fail("SCHEMA_DRIFT", "no_valid_rows"), counts };
  if (modelled > 0 && dropped / modelled > LIMITLESS_MAX_DROPPED_SHARE) return { ...fail("SCHEMA_DRIFT", "too_many_invalid_rows"), counts };
  const total = envelope.data.totalMarketsCount;
  const hasMore = (typeof total === "number" && Number.isSafeInteger(total) && total >= 0 ? page * limit < total : envelope.data.data.length >= limit) && envelope.data.data.length > 0;
  return { ok: true, value: { ...counts, items, rows, rejected, hasMore } };
}

// ---- books --------------------------------------------------------------------------------------------------------------------

export interface LimitlessBookRead {
  readonly bids: readonly RawLevel[];
  readonly asks: readonly RawLevel[];
}

// GET /markets/{slug}/orderbook: the YES-side book. It must name the token the caller holds as YES (anything else is
// a mix-up, not a book). A bad level, a level on the wrong side or a crossed book is a drift; two empty sides are
// EMPTY_BOOK.
export function parseBookBody(body: unknown, yesTokenId: string): Parsed<LimitlessBookRead> {
  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) return fail("SCHEMA_DRIFT", "book_shape");
  if (parsed.data.tokenId !== yesTokenId) return fail("SCHEMA_DRIFT", "token_mismatch");
  const book = parseBook(parsed.data);
  if (!book.ok) return fail("SCHEMA_DRIFT", book.reason);
  if (book.bids.length === 0 && book.asks.length === 0) return fail("EMPTY_BOOK", "empty_book");
  return { ok: true, value: { bids: book.bids, asks: book.asks } };
}
