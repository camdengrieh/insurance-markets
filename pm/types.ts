// Venue-agnostic types shared by every pm/ module (docs/aggregation-design.md section 2.1 to 2.5).
// Types only, plus a very small exact-decimal bridge. Real math lives in pm/core.
//
// Decimal rule: at the edges (adapter input, tool output) a number is a plain decimal string
// (`Dec`); inside the engine it is a `Fixed` (bigint units plus an explicit scale). Floating
// point is never used for money, prices or share counts. `null` means unknown and is never zero.

import { formatAtomic, parseDecimalAtomic } from "../src/guardrails/amount.js";

// ---------------------------------------------------------------------------------------------
// Decimals

// Non-negative plain decimal string such as "0.534" (no sign, exponent, hex or separators).
export type Dec = string;

// Exact fixed-point value: the real number is units / 10^scale. Scale is 0..18 so it round-trips
// through the guardrail parser. Fixed values with different scales are never mixed implicitly;
// use `alignFixed` first. Micro-units (scale 6) are never added to dollars (scale 0) by accident
// because the scale travels with the value.
export interface Fixed {
  readonly units: bigint;
  readonly scale: number;
}

export type FixedResult =
  | { readonly ok: true; readonly value: Fixed }
  | { readonly ok: false; readonly reason: string };

// Reuses the same strict grammar as the money guardrail (src/guardrails/amount.ts). Extra
// precision beyond `scale` is rejected, never rounded.
export function decToFixed(input: unknown, scale: number): FixedResult {
  const parsed = parseDecimalAtomic(input, scale);
  return parsed.ok ? { ok: true, value: { units: parsed.value, scale } } : parsed;
}

// 534000n at scale 6 gives "0.534". Negative values keep their sign (edges can be negative).
export function fixedToDec(value: Fixed): string {
  return formatAtomic(value.units, value.scale);
}

// Rescales upward exactly (always lossless). Returns null when the target scale is smaller and
// the value would lose digits, so callers must handle precision loss explicitly.
export function rescaleFixed(value: Fixed, scale: number): Fixed | null {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) return null;
  if (scale >= value.scale) {
    return { units: value.units * 10n ** BigInt(scale - value.scale), scale };
  }
  const divisor = 10n ** BigInt(value.scale - scale);
  return value.units % divisor === 0n ? { units: value.units / divisor, scale } : null;
}

// Three-way compare across scales without rounding. Returns -1, 0 or 1.
export function compareFixed(a: Fixed, b: Fixed): -1 | 0 | 1 {
  const scale = Math.max(a.scale, b.scale);
  const x = a.units * 10n ** BigInt(scale - a.scale);
  const y = b.units * 10n ** BigInt(scale - b.scale);
  return x < y ? -1 : x > y ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Untrusted text

// Market text, theses and rules are data written by third parties. Wrapping them in the type
// forces tools to pass them through src/guardrails/untrusted.ts before returning them.
export interface Untrusted<T> {
  readonly untrusted: true;
  readonly value: T;
}

export function untrusted<T>(value: T): Untrusted<T> {
  return { untrusted: true, value };
}

// ---------------------------------------------------------------------------------------------
// Identity

export const VENUE_IDS = [
  "xo",
  "polymarket",
  "polymarket_us",
  "kalshi",
  "limitless",
  "trueo",
  "world",
  "predictfun",
  "opinion",
  "hyperliquid",
  "manifold",
] as const;
export type VenueId = (typeof VENUE_IDS)[number];

export function isVenueId(value: unknown): value is VenueId {
  return typeof value === "string" && (VENUE_IDS as readonly string[]).includes(value);
}

export interface MarketRef {
  readonly venue: VenueId;
  // XO/Polymarket: conditionId; Kalshi: ticker; Limitless: slug; Trueo: `${chainId}:${marketAddress}`.
  readonly marketId: string;
  // eventId, slug, series, rootEventSlug, negRiskMarketID, marketKey and similar venue keys.
  readonly native: Readonly<Record<string, string>>;
}

export type OutcomeRole = "yes" | "no" | "label";

// Outcome order matters: never match on title text (XO index 0 is the "Yes" token even for
// team-named markets).
export interface OutcomeRef {
  readonly index: number;
  readonly role: OutcomeRole;
  readonly label: Untrusted<string>;
  // XO outcomeTokenId; Polymarket clobTokenIds[i] for version "v1", else positionIds[i].
  readonly tokenId: string;
}

export interface TokenRef {
  readonly venue: VenueId;
  readonly tokenId: string;
}

// ---------------------------------------------------------------------------------------------
// Rules, status, market

export type VoidPolicy =
  | "fifty_fifty"
  | "refund"
  | "last_traded_price"
  | "scalar"
  | "invalid_reverse_trades"
  | "unknown";

export type ResolutionMechanism =
  | "uma_oo"
  | "chainlink"
  | "exchange"
  | "xo_manual_modra"
  | "pyth"
  | "external_parity"
  | "optimistic_council"
  | "protocol_mark"
  | "unknown";

export interface Rules {
  readonly text: Untrusted<string>;
  // sha256 of NFKC-normalised, whitespace-collapsed rules text (hex, lowercase).
  readonly sha256: string;
  readonly sources: readonly string[];
  readonly mechanism: ResolutionMechanism;
  readonly resolver?: string;
  readonly cutoffUtc?: string;
  readonly windowStartUtc?: string;
  readonly void: VoidPolicy;
  readonly canCloseEarly?: boolean;
}

export type Status =
  | "pending"
  | "active"
  | "paused"
  | "closed"
  | "determined"
  | "disputed"
  | "resolved"
  | "voided"
  | "unknown";

// Tick is either one global step or per-price-range steps (Kalshi price_ranges[]).
export interface TickRange {
  readonly from: Dec;
  readonly to: Dec;
  readonly step: Dec;
}
export type Tick = Dec | readonly TickRange[];

export type Custody = "self" | "smart_account" | "venue" | "broker";

export interface Collateral {
  readonly symbol: string;
  // CAIP-2 chain id, for example "eip155:137".
  readonly chain: string;
  readonly decimals: number;
  readonly custody: Custody;
}

export type GroupKind = "neg_risk" | "mutually_exclusive" | "event" | "series";
export type Exhaustive = "proven" | "by_rule" | "no" | "unknown";

export interface MarketGroup {
  readonly key: string;
  readonly kind: GroupKind;
  readonly exhaustive: Exhaustive;
}

export interface Provenance {
  readonly fetchedAtMs: number;
  readonly source: string;
  readonly adapterVersion: string;
  readonly schemaHash: string;
}

export interface Market {
  readonly ref: MarketRef;
  readonly title: Untrusted<string>;
  readonly outcomes: readonly OutcomeRef[];
  readonly rules: Rules;
  readonly status: Status;
  readonly tradable: { readonly ok: boolean; readonly reasons: readonly string[] };
  readonly timesUtc: {
    readonly opensAt?: string;
    readonly closesAt?: string;
    readonly expectedResolutionAt?: string;
    readonly latestResolutionAt?: string;
  };
  readonly tick: Tick;
  readonly minSize?: Dec;
  readonly collateral: Collateral;
  readonly group?: MarketGroup;
  readonly fee: FeeSpec;
  readonly prov: Provenance;
}

// Listing row: enough to find and link a market without the full rules.
export interface MarketSummary {
  readonly ref: MarketRef;
  readonly title: Untrusted<string>;
  readonly status: Status;
  readonly closesAt?: string;
}

// ---------------------------------------------------------------------------------------------
// Books and quotes

export interface BookLevel {
  readonly price: Dec;
  // Size in shares. XO sizes carry up to 6 decimals.
  readonly size: Dec;
}

// The sort convention a venue uses for raw levels, kept as a tag on the raw side so the
// normaliser's output can be checked. Normalised books are always bids desc, asks asc.
export type BookConvention =
  | "best_first" // XO, Polymarket US
  | "best_last" // Polymarket CLOB, Kalshi
  | "yes_side_only" // Limitless, Predict.fun (NO folded into the YES book)
  | "mirrored_per_token" // Opinion
  | "amm_pool"; // Trueo (price from pool state, no resting orders)

export type BookDerivation = "native" | "complement";

export interface Book {
  readonly token: TokenRef;
  // Always sorted explicitly: bids descending, asks ascending.
  readonly bids: readonly BookLevel[];
  readonly asks: readonly BookLevel[];
  // Convention of the raw venue payload this book was normalised from.
  readonly convention: BookConvention;
  readonly asOfMs: number;
  readonly venueTsMs?: number;
  readonly hash?: string;
  // "complement" books are synthetic (1 - opposite side) and are never executable.
  readonly derived: BookDerivation;
}

export type QuoteSide = "buy" | "sell";

// A depth-walked price for a stated size. Prices that cannot be computed are null, not zero.
export interface Quote {
  readonly token: TokenRef;
  readonly side: QuoteSide;
  readonly requestedSize: Dec;
  readonly filledSize: Dec;
  readonly bestPrice: Dec | null;
  // Volume-weighted average price over the filled depth, null when nothing filled.
  readonly vwap: Dec | null;
  readonly feeSpecId: FeeSpecId;
  readonly derived: BookDerivation;
  readonly asOfMs: number;
}

// ---------------------------------------------------------------------------------------------
// Fees

export type FeeModelId =
  | "curve_pq"
  | "curve_min"
  | "ad_valorem_bps"
  | "profit_pct"
  | "amm_stack"
  | "unknown";

// Names a fee model plus the parameter source it was read from, for example "xo:curve_pq".
// Unknown models use "unknown" and fail closed.
export type FeeSpecId = string;

export interface FeeParams {
  // Venue-specific named parameters as exact decimal strings, e.g. { rate: "0.04" } or { bps: "400" }.
  readonly values: Readonly<Record<string, Dec>>;
}

export type FeePayer = "buyer_adds_seller_withholds" | "outcome_tokens" | "in_pool";
export type FeeGranularity = "market" | "series" | "event" | "token" | "category";

export interface FeeSpec {
  readonly id: FeeSpecId;
  readonly modelId: FeeModelId;
  readonly taker?: FeeParams;
  readonly maker?: FeeParams;
  readonly rounding?: string;
  readonly payer: FeePayer;
  readonly paramsSource: { readonly url: string; readonly field: string; readonly granularity: FeeGranularity };
  // ISO date the parameters were read; past verifiedAt + ttlSec or modelId "unknown" => fail closed.
  readonly verifiedAt: string;
  readonly ttlSec: number;
}

// ---------------------------------------------------------------------------------------------
// Links (human-approved, hash-pinned registry records)

export type LinkRelation =
  | "identity"
  | "complement"
  | "subset"
  | "superset"
  | "overlap"
  | "disjoint"
  | "partition"
  | "ladder_threshold"
  | "ladder_date"
  | "implication"
  | "exclusive"
  | "joint";

export type LinkState = "discovered" | "candidate" | "verified" | "suspended" | "rejected";
export type BasisClass = "identical" | "settlement_window" | "settlement_source";
export type BasisAxis = "timing" | "source" | "condition_scope";

export interface LinkLeg {
  readonly ref: MarketRef;
  // Pinned rules hash; a mismatch on refresh suspends the link.
  readonly rulesSha256: string;
  readonly closeUtc: string;
  readonly source: string;
  readonly void: VoidPolicy;
  // outcomeMap[i] is the index of the linked outcome on the other leg(s).
  readonly outcomeMap: readonly number[];
}

export interface Link {
  readonly linkId: string;
  readonly relation: LinkRelation;
  readonly legs: readonly LinkLeg[];
  readonly basis: {
    readonly class: BasisClass;
    readonly axes: readonly BasisAxis[];
    readonly cutoffDeltaH: number;
  };
  readonly evidence: { readonly methods: readonly string[]; readonly quotedFragments: readonly string[] };
  readonly state: LinkState;
  readonly reviewer?: string;
  readonly reviewedAt?: string;
  // Earlier of the two closes.
  readonly validUntil: string;
  readonly schemaVersion: number;
}

// Lightweight reference to a registry link, carried on results so a signal can name the exact
// approved link (and its pinned hash) it came from. Only a verified registry link may appear.
export interface LinkRef {
  readonly linkId: string;
  readonly relation: LinkRelation;
  readonly state: LinkState;
  // sha256 over the canonical link record as pinned by the registry.
  readonly recordSha256: string;
}

// ---------------------------------------------------------------------------------------------
// Adapter plumbing

export type AdapterError =
  | "RATE_LIMITED"
  | "STALE"
  | "NOT_SUPPORTED"
  | "SCHEMA_DRIFT"
  | "VENUE_PAUSED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "EMPTY_BOOK";

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E; readonly detail?: string };

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
  // XO pages on meta.hasNextPage only; false means the venue said there is no more.
  readonly hasNext: boolean;
}

// ccxt-style capability map: false means NOT_SUPPORTED, never a guess.
export interface AdapterCaps {
  readonly listMarkets: boolean;
  readonly search: boolean;
  readonly getMarket: boolean;
  readonly getBook: boolean;
  readonly getBooksBatch: boolean;
  readonly getFeeSpec: boolean;
  readonly getResolution: boolean;
  readonly getPositionsByAddress: boolean;
  readonly stream: false;
}

export interface VenueReadAdapter {
  readonly id: VenueId;
  readonly caps: AdapterCaps;
  listMarkets(q: {
    statuses?: Status[];
    cursor?: string;
    limit?: number;
    text?: string;
  }): Promise<Page<MarketSummary>>;
  getMarket(ref: MarketRef): Promise<Market>;
  getBooks(tokens: TokenRef[], opts: { deadlineMs: number }): Promise<Array<Result<Book, AdapterError>>>;
  getFeeSpec(m: Market): Promise<FeeSpec>;
  health(): Promise<{ ok: boolean; notes: string[] }>;
}
