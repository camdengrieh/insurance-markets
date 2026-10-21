import { sha256, toBytes } from "viem";

import { categorise, type CategoryVerdict } from "../../core/category";
import { addQty, cmpQty, decFromNumber, fromAtomic, fromBaseUnits, parseQty, subQty, toDec, type Qty } from "../../core/money";
import type { Book, Collateral, FeeSpec, Level, Market, MarketRef, MarketSummary, Outcome, OutcomeSummary, Prov, Rules, Status, Untrusted } from "../../core/ports";
import { rulesHashOf } from "../../core/rules-hash";
import { untrustedField } from "../../core/untrusted";
import { makeProv } from "../../core/venue-policy";
import {
  BASE_USDC_LOWER,
  LIMITLESS_ADAPTER_VERSION,
  LIMITLESS_CHAIN,
  LIMITLESS_COLLATERAL_DECIMALS,
  LIMITLESS_COLLATERAL_SYMBOL,
  LIMITLESS_LIST_TTL_MS,
} from "./constants";
import { SLUG, type LimitlessBookBody, type LimitlessRow } from "./schemas";

export const SCHEMA_DESCRIPTOR = "limitless market v1: slug title status tradeType marketType collateralToken tokens description prices winningOutcomeIndex volumeFormatted expirationTimestamp metadata categories tags";
export const LIMITLESS_SCHEMA_HASH = sha256(toBytes(SCHEMA_DESCRIPTOR)).slice(2);

export const COLLATERAL: Collateral = Object.freeze({
  symbol: LIMITLESS_COLLATERAL_SYMBOL,
  chain: LIMITLESS_CHAIN,
  decimals: LIMITLESS_COLLATERAL_DECIMALS,
  custody: "self",
});

const ONE = fromAtomic("price", 1n, 0);

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

// ---- tokens ---------------------------------------------------------------------------------------------------------------------

export interface TokenPair {
  readonly yes: string;
  readonly no: string;
}

// ---- row checks -----------------------------------------------------------------------------------------------------------

// A market this adapter models: one Yes/No pair, USDC on Base with six decimals. Anything else is skipped and
// counted, not repaired.
export function isModelled(row: LimitlessRow): boolean {
  return row.marketType === "single" && row.collateralToken.address.toLowerCase() === BASE_USDC_LOWER && row.collateralToken.decimals === LIMITLESS_COLLATERAL_DECIMALS && row.tokens.yes !== row.tokens.no;
}

export function isClob(row: LimitlessRow): boolean {
  return row.tradeType === "clob";
}

// Milliseconds since the epoch, only if it is plausibly one (2001 to 2099). Seconds, strings and anything odd
// are null: an expiry that cannot be read is unknown, not guessed.
export function expiryMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  return value >= 1e12 && value < 4.1e12 ? value : null;
}

export function winnerIndex(value: unknown): 0 | 1 | null {
  return value === 0 || value === 1 ? value : null;
}

// FUNDED is the only open state seen. RESOLVED needs a winner. Everything else is unknown (fail closed), and an
// open market past its expiry is closed, not trading.
export function statusOf(row: LimitlessRow, nowMs: number): Status {
  const closes = expiryMs(row.expirationTimestamp);
  if (row.status === "FUNDED") return closes !== null && nowMs >= closes ? "closed" : "active";
  if (row.status === "RESOLVED") return winnerIndex(row.winningOutcomeIndex) === null ? "unknown" : "resolved";
  return "unknown";
}

// ---- prices ---------------------------------------------------------------------------------------------------------------

// A display price in the open interval (0, 1), or null. Never 0, never a guess.
export function priceOfNumber(value: unknown): Qty | null {
  const dec = decFromNumber(value);
  if (dec === null) return null;
  const q = parseQty("price", dec, { maxScale: 12 });
  if (q === null || q.atomic <= 0n || cmpQty(q, ONE) >= 0) return null;
  return q;
}

export function displayPrices(row: LimitlessRow): readonly [string | null, string | null] {
  const prices = row.prices;
  if (!Array.isArray(prices) || prices.length !== 2) return [null, null];
  const yes = priceOfNumber(prices[0]);
  const no = priceOfNumber(prices[1]);
  return [yes === null ? null : toDec(yes), no === null ? null : toDec(no)];
}

// Sizes are integers in 6-decimal base units (30000000 is 30 shares).
export function sharesOfNumber(value: unknown): Qty | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
  return fromBaseUnits("shares", String(value), 6);
}

// ---- market ---------------------------------------------------------------------------------------------------------------

function metadataText(row: LimitlessRow, key: string): string | null {
  const metadata = row.metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function metadataFlag(row: LimitlessRow, key: string): boolean | null {
  const metadata = row.metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : null;
}

export function refOf(row: LimitlessRow): MarketRef {
  const native: Record<string, string> = { slug: row.slug, trade_type: row.tradeType, market_type: row.marketType, yes_token: row.tokens.yes, no_token: row.tokens.no };
  // Cross-venue hooks the venue publishes. Kept only if they are plain slugs; they are hints, never a link.
  const poly = metadataFlag(row, "isPolyArbitrage");
  if (poly !== null) native.is_poly_arbitrage = String(poly);
  const external = metadataText(row, "externalSlug");
  if (external !== null && SLUG.test(external)) native.external_slug = external;
  const provider = metadataText(row, "externalProvider");
  if (provider !== null && /^[A-Za-z0-9_-]{1,32}$/.test(provider)) native.external_provider = provider;
  return { venue: "limitless", marketId: row.slug, native };
}

export function outcomesOf(row: LimitlessRow): readonly Outcome[] {
  return [
    { index: 0, role: "yes", label: untrustedField("outcome", "Yes", "limitless"), tokenId: row.tokens.yes },
    { index: 1, role: "no", label: untrustedField("outcome", "No", "limitless"), tokenId: row.tokens.no },
  ];
}

export function outcomeSummariesOf(row: LimitlessRow): readonly OutcomeSummary[] {
  const [yes, no] = displayPrices(row);
  return outcomesOf(row).map((outcome, index) => ({ ...outcome, displayPrice: index === 0 ? yes : no }));
}

export function provOf(origin: string, nowMs: number, ttlMs: number, path: string, venueTsMs?: number): Prov {
  return makeProv({ venue: "limitless", source: `${origin}${path}`, fetchedAtMs: nowMs, nowMs, ttlMs, ...(venueTsMs === undefined ? {} : { venueTsMs }) });
}

// ---- category ---------------------------------------------------------------------------------------------------------

const MAX_CATEGORY_WORDS = 20;
const MAX_CATEGORY_CHARS = 64;

// The venue sends `categories` and `tags` as lists of strings (the capture); an object with a `name` is read too.
function wordsOf(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list.slice(0, MAX_CATEGORY_WORDS)) {
    const text = typeof item === "string" ? item : item !== null && typeof item === "object" && typeof (item as { name?: unknown }).name === "string" ? (item as { name: string }).name : null;
    if (text !== null && text !== "") out.push(text.slice(0, MAX_CATEGORY_CHARS));
  }
  return out;
}

// Categories first, then tags: the first fixed-table hit decides (core/category.ts), and the title is the last resort.
export function categoryOf(row: Pick<LimitlessRow, "categories" | "tags" | "title">): CategoryVerdict {
  return categorise({ venue: "limitless", native: [...wordsOf(row.categories), ...wordsOf(row.tags)], title: row.title });
}

// The venue's own category words, joined, for the inspector's untrusted slot only (tags are not shown).
export function categoryNativeOf(row: Pick<LimitlessRow, "categories">): Untrusted<string> | undefined {
  const words = wordsOf(row.categories);
  return words.length === 0 ? undefined : untrustedField("category", words.join(", "), "limitless");
}

function categoryFields(row: Pick<LimitlessRow, "categories" | "tags" | "title">): { readonly category: CategoryVerdict; readonly categoryNative?: Untrusted<string> } {
  const categoryNative = categoryNativeOf(row);
  return { category: categoryOf(row), ...(categoryNative === undefined ? {} : { categoryNative }) };
}

function volumeOf(row: LimitlessRow): MarketSummary["volume"] {
  const volume = typeof row.volumeFormatted === "string" ? parseQty("usd", row.volumeFormatted, { maxScale: 6 }) : null;
  // The figure is the market's cumulative volume, not a window: windowHours stays null.
  return volume === null ? { amount: null, unit: "unknown", windowHours: null } : { amount: toDec(volume), unit: "usd", windowHours: null };
}

export function summaryOf(row: LimitlessRow, origin: string, nowMs: number): MarketSummary {
  const closes = expiryMs(row.expirationTimestamp);
  return {
    ref: refOf(row),
    title: untrustedField("title", row.title, "limitless"),
    status: statusOf(row, nowMs),
    closesAtUtc: closes === null ? null : iso(closes),
    outcomes: outcomeSummariesOf(row),
    volume: volumeOf(row),
    prov: provOf(origin, nowMs, LIMITLESS_LIST_TTL_MS, "/markets/active"),
    ...categoryFields(row),
  };
}

// Tags become spaces, like the XO adapter's rules recipe. The result is still hostile text: it goes through the
// shared sanitiser and stays in an untrusted slot. Entities are left as written, never decoded.
export function htmlToText(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

// The description is HTML from the market creator. The shared sanitiser turns tags into spaces and collapses
// whitespace, and the fingerprint is taken over that cleaned text, so two renderings of one text agree.
export function rulesOf(row: LimitlessRow): Rules {
  const text = untrustedField("rules", typeof row.description === "string" ? htmlToText(row.description) : "", "limitless");
  const closes = expiryMs(row.expirationTimestamp);
  return {
    text,
    // Over the full description and the expiry, never the capped display copy (the shared recipe, finding A2).
    sha256: rulesHashOf([typeof row.description === "string" ? row.description : "", typeof row.expirationTimestamp === "number" || typeof row.expirationTimestamp === "string" ? String(row.expirationTimestamp) : ""]),
    sources: [],
    // Resolution differs by market (feeds, venue team, parity with another venue); the row does not say.
    mechanism: "unknown",
    void: "unknown",
    ...(closes === null ? {} : { cutoffUtc: iso(closes) }),
  };
}

export function unknownFee(origin: string, slug: string, nowMs: number): FeeSpec {
  return {
    modelId: "unknown",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: `${origin}/markets/${slug}`, field: "metadata.fee", granularity: "market" },
    verifiedAt: iso(nowMs),
    // Zero: past its ttl already, so no net-of-fee number and no executable label may be built from it.
    ttlSec: 0,
  };
}

export function marketOf(row: LimitlessRow, origin: string, nowMs: number): Market {
  const closes = expiryMs(row.expirationTimestamp);
  const status = statusOf(row, nowMs);
  const reasons = ["read_only_adapter", "fee_model_unknown"];
  if (!isClob(row)) reasons.push("trade_type_not_clob");
  if (status !== "active") reasons.push("not_active");
  return {
    ref: refOf(row),
    title: untrustedField("title", row.title, "limitless"),
    outcomes: outcomesOf(row),
    rules: rulesOf(row),
    status,
    tradable: { ok: false, reasons },
    timesUtc: closes === null ? {} : { closesAt: iso(closes) },
    // Inferred from the recorded book (all prices have three decimals); the venue's tick was never read.
    tick: "0.001",
    collateral: COLLATERAL,
    fee: unknownFee(origin, row.slug, nowMs),
    prov: { fetchedAtMs: nowMs, source: `${origin}/markets/${row.slug}`, adapterVersion: LIMITLESS_ADAPTER_VERSION, schemaHash: LIMITLESS_SCHEMA_HASH },
    ...categoryFields(row),
  };
}

// ---- books ----------------------------------------------------------------------------------------------------------------

export interface RawLevel {
  readonly price: Qty;
  readonly size: Qty;
}

// Merge equal prices, drop empty levels, sort explicitly: bids descending, asks ascending.
export function sortLevels(levels: readonly RawLevel[], side: "bids" | "asks"): readonly RawLevel[] {
  const merged: RawLevel[] = [];
  for (const level of levels) {
    if (level.size.atomic === 0n) continue;
    const at = merged.findIndex((existing) => cmpQty(existing.price, level.price) === 0);
    const found = merged[at];
    if (found === undefined) merged.push(level);
    else merged[at] = { price: found.price, size: addQty(found.size, level.size) };
  }
  return merged.sort((a, b) => (side === "bids" ? -cmpQty(a.price, b.price) : cmpQty(a.price, b.price)));
}

export function crossed(bids: readonly RawLevel[], asks: readonly RawLevel[]): boolean {
  const bid = bids[0];
  const ask = asks[0];
  return bid !== undefined && ask !== undefined && cmpQty(bid.price, ask.price) >= 0;
}

export type ParsedBook =
  | { readonly ok: true; readonly bids: readonly RawLevel[]; readonly asks: readonly RawLevel[] }
  | { readonly ok: false; readonly reason: "invalid_level" | "wrong_side" | "crossed" };

// Validates and sorts the venue's YES-side book. A level that is not a price in (0, 1) with a non-negative
// integer size, or that sits on the wrong side, makes the whole book a drift: a book is not "empty" because its
// levels were bad.
export function parseBook(body: LimitlessBookBody): ParsedBook {
  const read = (levels: LimitlessBookBody["bids"], expectSide: "BUY" | "SELL"): RawLevel[] | null => {
    const out: RawLevel[] = [];
    for (const level of levels) {
      const price = priceOfNumber(level.price);
      const size = sharesOfNumber(level.size);
      if (price === null || size === null) return null;
      if (level.side !== undefined && level.side !== expectSide) return null;
      out.push({ price, size });
    }
    return out;
  };
  const bids = read(body.bids, "BUY");
  const asks = read(body.asks, "SELL");
  if (bids === null || asks === null) return { ok: false, reason: "invalid_level" };
  const sortedBids = sortLevels(bids, "bids");
  const sortedAsks = sortLevels(asks, "asks");
  if (crossed(sortedBids, sortedAsks)) return { ok: false, reason: "crossed" };
  return { ok: true, bids: sortedBids, asks: sortedAsks };
}

function levelOut(level: RawLevel): Level {
  return { price: toDec(level.price), size: toDec(level.size) };
}

function mirror(levels: readonly RawLevel[], to: "bids" | "asks"): readonly RawLevel[] {
  return sortLevels(levels.map((level) => ({ price: subQty(ONE, level.price), size: level.size })), to);
}

// The venue publishes the YES book. The NO book is the same book read from the other end (buying NO at
// 1 - p hits the YES bids): it carries no liquidity of its own, so it is labelled a complement.
export function bookOf(side: "yes" | "no", tokenId: string, parsed: { readonly bids: readonly RawLevel[]; readonly asks: readonly RawLevel[] }, nowMs: number): Book {
  const out = side === "yes" ? { bids: parsed.bids, asks: parsed.asks } : { bids: mirror(parsed.asks, "bids"), asks: mirror(parsed.bids, "asks") };
  return {
    token: { venue: "limitless", tokenId },
    bids: out.bids.map(levelOut),
    asks: out.asks.map(levelOut),
    asOfMs: nowMs,
    derived: side === "yes" ? "native" : "complement",
  };
}
