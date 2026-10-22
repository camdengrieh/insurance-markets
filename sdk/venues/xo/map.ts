import { sha256 } from "viem";

import { rulesFingerprint, xoRuleFields } from "../../rules.js";

import { lifecycleOf, resolveTakerFee } from "./api/client.js";
import { formatMicro, MICRO } from "./api/units.js";
import type {
  Lifecycle,
  ListedOutcome,
  MarketDetail as XoDetail,
  MarketSummary as XoRow,
  OrderBook as XoBook,
} from "./api/types.js";
import { FIELD_LIMITS, HARD_MAX_CHARS, TRUNCATION_MARKER, sanitizeUntrusted } from "../../untrusted.js";

import { categorise, type CategoryVerdict } from "../../category.js";
import type {
  Book,
  Collateral,
  FeeSpec,
  Level,
  Market,
  MarketRef,
  MarketSummary,
  Outcome,
  OutcomeSummary,
  Prov,
  Rules,
  Status,
  Untrusted,
} from "../../model.js";
import { XO_DATA_ORIGIN } from "./urls.js";

// Pure mapping from the shared XO decoders' output (./api/client.ts, already strict and bounded) to the venue
// port. Nothing here touches the network or the clock; callers pass `nowMs` and `fetchedAtMs`.
//
// Units, once: the Data API sends prices, positions and balances in MICRO units ("394000" is 0.394). The
// decoders turn them into bigint micro units and `formatMicro` turns those into exact decimal strings. The
// orderbook already speaks decimals: prices ("0.394") and sizes in SHARES with up to six decimals
// ("1271.980687"). The decoders hold those as micro-scaled bigints too, but they are shares, not micro-shares,
// and are formatted back unchanged. Nothing here uses floating point.

export const ADAPTER_VERSION = "xo-adapter/1";
export const XO_SOURCE_LIST = "xo_data:/markets";
export const XO_SOURCE_DETAIL = "xo_data:/markets/contract";
export const XO_SOURCE_BOOK = "xo_orderbook:/book";
export const XO_TICK = "0.001";
export const XO_COLLATERAL: Collateral = Object.freeze({ symbol: "USDC.e", chain: "eip155:3223", decimals: 6, custody: "smart_account" });
export const LIST_TTL_MS = 30_000;
export const FEE_TTL_SEC = 300;

// The fields this adapter reads, hashed into Market.prov.schemaHash. Adding or dropping a field changes the
// hash, and a test pins the value, so a decoder change cannot slip through unnoticed.
const SCHEMA_DESCRIPTOR = [
  "list:id,conditionId,title,slug,type,status,startsAt,expiresAt,winningOutcomeId,totalVolumeInUSD,categoryPath[name,slug],outcomes[id,index,outcomeTokenId,title,currentPrice]",
  "detail:+rules[description,outcomeRules],description,resolutionSources,resolverAddress,resolutionType,reviewStatus,collateralToken.decimals,effectiveFeeConfig[takerFeeBps,makerFeeBps,curveModel]",
  "book:market,asset_id,timestamp,hash,bids,asks,tick_size,neg_risk",
].join("|");

// ---- hashing and text -------------------------------------------------------------------------------------------

const encoder = new TextEncoder();

export function sha256Hex(text: string): string {
  return sha256(encoder.encode(text), "hex").slice(2);
}

export const XO_SCHEMA_HASH = sha256Hex(SCHEMA_DESCRIPTOR);

// The rules fingerprint is the shared rules-v2 recipe (sdk/rules.ts): the same fields, in the same order, that the
// linker pins and pm_verify_link recomputes, so a proposed or approved XO leg can be re-checked in the page. A
// lossy read (a rule-bearing field cut or dropped by the decoder) has no fingerprint ("").
export function rulesSha256(detail: XoDetail): string {
  return rulesFingerprint("xo", xoRuleFields(detail));
}

// Untrusted slot with the shared sanitiser rule applied first (control, bidi and invisible characters stripped,
// whitespace collapsed, length capped). The text is still hostile data: it is markup-inert only because the UI
// renders it as a text node inside the fixed untrusted slot.
export function untrustedText(value: string, maxChars: number): Untrusted<string> {
  return { untrusted: true, value: sanitizeUntrusted(value, { maxChars, source: "xo-market" }).text };
}

// Rules keep their paragraph breaks (the sanitiser alone would fold them into one line), so each line is
// sanitised on its own and the total stays under the shared hard cap.
export function untrustedParagraphs(lines: readonly string[], maxTotal: number = HARD_MAX_CHARS): Untrusted<string> {
  const kept: string[] = [];
  let total = 0;
  let truncated = false;
  for (const line of lines) {
    for (const piece of line.split(/\r?\n/)) {
      const text = sanitizeUntrusted(piece, { maxChars: FIELD_LIMITS.rules, source: "xo-market" }).text;
      if (text === "") continue;
      if (total + text.length + 1 > maxTotal) {
        truncated = true;
        break;
      }
      kept.push(text);
      total += text.length + 1;
    }
    if (truncated) break;
  }
  const joined = kept.join("\n");
  return { untrusted: true, value: truncated ? `${joined}${TRUNCATION_MARKER}` : joined };
}

// ---- numbers ----------------------------------------------------------------------------------------------------

// A display price is shown only when it is strictly inside (0, 1). Zero and one are placeholders on list rows,
// never evidence of a price, and null is not zero.
export function displayPrice(micro: bigint | null): string | null {
  return micro === null || micro <= 0n || micro >= MICRO ? null : formatMicro(micro);
}

function bpsRate(bps: number): string {
  // bps/10000 as an exact decimal: bps * 100 micro units.
  return formatMicro(BigInt(bps) * 100n);
}

// ---- status -----------------------------------------------------------------------------------------------------

type StatusFacts = Pick<XoRow, "status" | "startsAt" | "expiresAt" | "settlement">;

// Fail closed: an unknown or lookalike status is "unknown", an ACTIVE market with no expiry is "unknown", and an
// ACTIVE market past its expiry is "closed" (the Pulse rows stay ACTIVE after expiresAt). UPDATE_REQUIRED and
// CANCELLED are not shown as trading.
export function statusOf(facts: StatusFacts, nowMs: number): Status {
  return statusOfLifecycle(lifecycleOf(facts, nowMs));
}

// The one lifecycle-to-status table (pm/adapters/xo.ts uses it too). RESOLVED (a winner recorded, payout not final) is
// "determined"; CLOSED with a winner is "resolved"; CLOSED without one, or ACTIVE past expiry, is "closed"; a market
// the creator must update is not tradable, so it reads "paused". CANCELLED is not a refund anyone has confirmed, so
// it is "unknown", never "voided".
export function statusOfLifecycle(lifecycle: Lifecycle): Status {
  switch (lifecycle) {
    case "open":
      return "active";
    case "pending":
      return "pending";
    case "paused":
    case "review_required":
      return "paused";
    case "expired_unresolved":
    case "closed_no_winner":
      return "closed";
    case "resolved_provisional":
      return "determined";
    case "settled":
      return "resolved";
    case "voided":
      return "voided";
    case "cancelled":
    case "unknown":
      return "unknown";
  }
}

// ---- refs, summaries --------------------------------------------------------------------------------------------

// The shared decoder cuts a source at 2000 characters, so a source of that length may have lost its tail and is not
// trusted as a link.
const SOURCE_CAP = 2000;
const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;

export function refOf(row: Pick<XoRow, "conditionId" | "id" | "slug" | "kind">): MarketRef {
  const native: Record<string, string> = { id: String(row.id), kind: row.kind };
  // The slug is creator-written: kept only when it has the plain shape of a slug, so no free text rides in `native`.
  if (SAFE_SLUG.test(row.slug)) native.slug = row.slug;
  return { venue: "xo", marketId: row.conditionId, native };
}

export function listProv(fetchedAtMs: number): Prov {
  return {
    venue: "xo",
    source: XO_SOURCE_LIST,
    fetchedAtMs,
    transport: "T0",
    freshness: "recent",
    ttlMs: LIST_TTL_MS,
    // XO's terms bar harvesting for unauthorised purposes and state no data licence: unresolved, so not "open".
    license: "unknown",
  };
}

function outcomeSummary(outcome: ListedOutcome): OutcomeSummary {
  return {
    index: outcome.index,
    role: outcome.slot,
    label: untrustedText(outcome.title, FIELD_LIMITS.outcome),
    tokenId: outcome.tokenId,
    displayPrice: displayPrice(outcome.displayPriceMicro),
  };
}

// ---- category ---------------------------------------------------------------------------------------------------

// XO's categoryPath, root first: the names and slugs go to the fixed table (sdk/category.ts), never to the screen.
export function categoryOf(row: Pick<XoRow, "categoryPath" | "title">): CategoryVerdict {
  const native: string[] = [];
  for (const entry of row.categoryPath) {
    native.push(String(entry.name));
    if (entry.slug !== null) native.push(String(entry.slug));
  }
  return categorise({ venue: "xo", native, title: String(row.title) });
}

// The path as the venue wrote it ("SPORTS > Football > Premier League"), for the inspector's untrusted slot only.
export function categoryNativeOf(row: Pick<XoRow, "categoryPath">): Untrusted<string> | undefined {
  if (row.categoryPath.length === 0) return undefined;
  return untrustedText(row.categoryPath.map((entry) => String(entry.name)).join(" > "), FIELD_LIMITS.category);
}

function categoryFields(row: Pick<XoRow, "categoryPath" | "title">): { readonly category: CategoryVerdict; readonly categoryNative?: Untrusted<string> } {
  const categoryNative = categoryNativeOf(row);
  return { category: categoryOf(row), ...(categoryNative === undefined ? {} : { categoryNative }) };
}

export function summaryOf(row: XoRow, nowMs: number, fetchedAtMs: number): MarketSummary {
  return {
    ref: refOf(row),
    title: untrustedText(row.title, FIELD_LIMITS.title),
    status: statusOf(row, nowMs),
    closesAtUtc: row.expiresAt,
    outcomes: row.outcomes.map(outcomeSummary),
    // totalVolumeInUSD is a decimal USD figure with six decimals; the window is lifetime, not a rolling window.
    volume: { amount: row.totalVolumeUsdMicro === null ? null : formatMicro(row.totalVolumeUsdMicro), unit: "usd", windowHours: null },
    prov: listProv(fetchedAtMs),
    ...categoryFields(row),
  };
}

// ---- detail -----------------------------------------------------------------------------------------------------

// The fee, as far as it is known. XO has two disagreeing sources (/fee-rate answers 0 for every token, the Data
// API says 400 to 800 bps) and a field named FLAT_BPS next to docs that describe a p(1-p) curve. Until a real
// fill reconciles them the spec is the CEILING: the larger bps figure applied to notional (ad valorem), which is
// never below the curve. XO_FEE_STATUS says so; no executable label or net-of-fee edge may be built on it.
export const XO_FEE_STATUS = "ceiling_unreconciled" as const;

export function feeSpecOf(detail: XoDetail, fetchedAtMs: number, feeRateBps: readonly number[]): FeeSpec {
  const paramsSource = {
    url: `${XO_DATA_ORIGIN}/api/markets/contract/${detail.conditionId}`,
    field: "effectiveFeeConfig.takerFeeBps",
    granularity: "market" as const,
  };
  const base = {
    payer: "buyer_adds_seller_withholds" as const,
    paramsSource,
    verifiedAt: new Date(fetchedAtMs).toISOString(),
    ttlSec: FEE_TTL_SEC,
  };
  const config = detail.effectiveFeeConfig;
  // Only the one curve model seen on long-form markets is understood. CONVICTION_CURVE and anything new fail closed.
  if (config === null || config.curveModel !== "FLAT_BPS") return { modelId: "unknown", ...base };
  const assessment = resolveTakerFee({ effective: config, feeRateBps });
  if (assessment.takerFeeBps === null) return { modelId: "unknown", ...base };
  return {
    modelId: "ad_valorem_bps",
    taker: { bps: assessment.takerFeeBps, rate: bpsRate(assessment.takerFeeBps) },
    maker: { bps: config.makerFeeBps, rate: bpsRate(config.makerFeeBps) },
    rounding: "ceil",
    ...base,
  };
}

export interface TradableFacts {
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

// Metadata only: "ok" means the Data API says the market is open and approved. It is never an executable
// quote; a book is still needed before anything is priced or traded.
export function tradableOf(detail: XoDetail, nowMs: number): TradableFacts {
  const reasons: string[] = [];
  const status = statusOf(detail, nowMs);
  if (status !== "active") reasons.push(`status_${status}`);
  if (detail.reviewStatus === null) reasons.push("review_status_missing");
  else if (detail.reviewStatus !== "APPROVE") reasons.push(`review_${detail.reviewStatus.toLowerCase()}`);
  if (detail.effectiveFeeConfig !== null && detail.effectiveFeeConfig.eligible === false) reasons.push("fee_config_not_eligible");
  return { ok: reasons.length === 0, reasons };
}

// Plain-https URLs only. Resolution sources are creator-written; a javascript: or data: URL, an address with
// embedded credentials or an over-long string is dropped (and counted), never passed on as a link.
export function safeSources(sources: readonly string[]): { readonly kept: readonly string[]; readonly dropped: number } {
  const kept: string[] = [];
  let dropped = 0;
  for (const source of sources) {
    const text = source.trim();
    let url: URL | undefined;
    try {
      url = text.length < SOURCE_CAP ? new URL(text) : undefined;
    } catch {
      url = undefined;
    }
    if (url !== undefined && url.protocol === "https:" && url.username === "" && url.password === "" && url.hostname !== "") kept.push(text);
    else dropped += 1;
  }
  return { kept, dropped };
}

export function rulesOf(detail: XoDetail, dropped: { sources: number }): Rules {
  const lines: string[] = [detail.rules.description ?? detail.description ?? ""];
  for (const entry of [...detail.rules.outcomeRules].sort((a, b) => a.outcomeIndex - b.outcomeIndex)) {
    lines.push(`${entry.outcomeIndex === 0 ? "Yes" : "No"}: ${entry.rule}`);
  }
  const { kept, dropped: droppedCount } = safeSources(detail.resolutionSources);
  dropped.sources = droppedCount;
  const rules: {
    text: Untrusted<string>;
    sha256: string;
    sources: readonly string[];
    mechanism: Rules["mechanism"];
    void: Rules["void"];
    resolver?: string;
    cutoffUtc?: string;
    windowStartUtc?: string;
  } = {
    text: untrustedParagraphs(lines),
    sha256: rulesSha256(detail),
    sources: kept,
    // Exact match only: any other resolutionType is "unknown", not a guess.
    mechanism: detail.resolutionType === "MANUAL" ? "xo_manual_modra" : "unknown",
    // XO states its void handling in each market's own rules text ("trades reversed or funds returned"). It is
    // never parsed from prose, so it is unknown here.
    void: "unknown",
  };
  if (detail.resolverAddress !== null) rules.resolver = detail.resolverAddress;
  if (detail.expiresAt !== null) rules.cutoffUtc = detail.expiresAt;
  if (detail.startsAt !== null) rules.windowStartUtc = detail.startsAt;
  return rules;
}

export interface MarketDetailResult {
  readonly market: Market;
  // Fixed sentences about what was cut, capped or dropped on the way in (never upstream text).
  readonly notes: readonly string[];
  readonly settlement: { readonly winningOutcomeIndex: 0 | 1 | null; readonly resolvedAt: string | null };
  readonly fee: { readonly status: typeof XO_FEE_STATUS };
}

export function marketOf(detail: XoDetail, nowMs: number, fetchedAtMs: number): MarketDetailResult {
  const dropped = { sources: 0 };
  const rules = rulesOf(detail, dropped);
  const notes = [...detail.omissions];
  if (dropped.sources > 0) notes.push(`${dropped.sources} resolution source(s) were not plain https links and were left out`);
  if (detail.feeConfigProblem !== null) notes.push("effectiveFeeConfig was present but unusable; the fee is unknown");
  const outcomes: Outcome[] = detail.outcomes.map((outcome) => ({
    index: outcome.index,
    role: outcome.slot,
    label: untrustedText(outcome.title, FIELD_LIMITS.outcome),
    tokenId: outcome.tokenId,
  }));
  const timesUtc: { opensAt?: string; closesAt?: string } = {};
  if (detail.startsAt !== null) timesUtc.opensAt = detail.startsAt;
  if (detail.expiresAt !== null) timesUtc.closesAt = detail.expiresAt;
  const market: Market = {
    ref: refOf(detail),
    title: untrustedText(detail.title, FIELD_LIMITS.title),
    outcomes,
    rules,
    status: statusOf(detail, nowMs),
    tradable: tradableOf(detail, nowMs),
    timesUtc,
    tick: XO_TICK,
    collateral: XO_COLLATERAL,
    fee: feeSpecOf(detail, fetchedAtMs, []),
    prov: { fetchedAtMs, source: XO_SOURCE_DETAIL, adapterVersion: ADAPTER_VERSION, schemaHash: XO_SCHEMA_HASH },
    ...categoryFields(detail),
  };
  return {
    market,
    notes,
    settlement: { winningOutcomeIndex: detail.settlement.winningOutcomeIndex, resolvedAt: detail.settlement.resolvedAt },
    fee: { status: XO_FEE_STATUS },
  };
}

// ---- books ------------------------------------------------------------------------------------------------------

const levelOf = (level: { readonly priceMicro: bigint; readonly sizeMicro: bigint }): Level => ({
  price: formatMicro(level.priceMicro),
  size: formatMicro(level.sizeMicro),
});

// The decoder has already sorted both sides (bids high to low, asks low to high). The book is native: it is the
// venue's own book for this token, never a complement of the other outcome.
export function bookOf(book: XoBook, fetchedAtMs: number): Book {
  const result: { token: Book["token"]; bids: readonly Level[]; asks: readonly Level[]; asOfMs: number; venueTsMs: number; derived: "native"; hash?: string } = {
    token: { venue: "xo", tokenId: book.tokenId },
    bids: book.bids.map(levelOf),
    asks: book.asks.map(levelOf),
    asOfMs: fetchedAtMs,
    venueTsMs: book.timestampMs,
    derived: "native",
  };
  if (book.hash !== null) result.hash = book.hash;
  return result;
}
