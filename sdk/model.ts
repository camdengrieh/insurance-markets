// The market model shared by every client: the dApp, the Cockpit daemon, the PayBox plugin tools, the linker
// and the API (docs/sdk-and-api-design.md section 3). Types plus the smallest constructors. Pure: no I/O, no
// clock, no environment, no `node:` import.
//
// Rules the types encode:
//   - money, prices and share counts are decimal strings (`Dec`) at every boundary, never floating point;
//   - unknown is `null` (or an absent optional), never 0 and never 0.5;
//   - text a market creator or an upstream service can influence is `Untrusted<string>` and is rendered only
//     as a text node inside a fixed "untrusted" slot.

import type { CategoryVerdict } from "./category.js";

// Non-negative plain decimal string such as "0.534" (no exponent, hex or separators).
export type Dec = string;

// Market text, theses and rules written by third parties: data, never instructions.
export interface Untrusted<T> {
  readonly untrusted: true;
  readonly value: T;
}

export function untrusted<T>(value: T): Untrusted<T> {
  return { untrusted: true, value };
}

export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E; readonly detail?: string };

// Every venue any client knows about. A client may support a subset; it declares it with
// `satisfies readonly VenueId[]` so a new id here never silently widens a client's exhaustive tables.
export const VENUE_IDS = [
  "xo",
  "polymarket",
  "polymarket_us",
  "kalshi",
  "limitless",
  "trueo",
  "world",
  "hyperliquid",
  "pascal",
  "novig",
  "og",
  "gemini",
  "sx",
  "udx",
  "prophetx",
  "predictfun",
  "opinion",
  "manifold",
  "myriad",
] as const;

export type VenueId = (typeof VENUE_IDS)[number];

export function isVenueId(value: unknown): value is VenueId {
  return typeof value === "string" && (VENUE_IDS as readonly string[]).includes(value);
}

// ---- the read model (docs/aggregation-design.md 2.1 to 2.4, docs/dapp-design.md 4.4) ---------------------------
//
// Every venue reader (sdk/venues) returns these types. A capability a venue lacks is NOT_SUPPORTED, never an
// invented value; an unknown enum fails closed.

// ---- provenance -------------------------------------------------------------------------------------------------

// T0 browser-direct, T0-RPC public JSON-RPC, T1 needs the daemon (no credential), T2 needs the user's own key
// held by the daemon, T3 imported from the user's agent.
export type Transport = "T0" | "T0-RPC" | "T1" | "T2" | "T3";
export type Freshness = "live" | "recent" | "stale" | "unknown";
// Drives memory-only handling (restricted terms) and the no-export rule.
export type LicenseClass = "own_use_only" | "attribution" | "open" | "unknown";

export interface Prov {
  readonly venue: VenueId;
  readonly source: string;
  readonly fetchedAtMs: number;
  readonly venueTsMs?: number;
  readonly transport: Transport;
  readonly freshness: Freshness;
  readonly ttlMs: number;
  readonly license: LicenseClass;
}

// ---- markets (aggregation-design 2.1) ---------------------------------------------------------------------------------

export interface MarketRef {
  readonly venue: VenueId;
  // XO and Polymarket: conditionId; Kalshi: ticker; Limitless: slug; Trueo: `${chainId}:${marketAddress}`.
  readonly marketId: string;
  // eventId, slug, series, rootEventSlug, negRiskMarketID, marketKey and the like.
  readonly native: Readonly<Record<string, string>>;
}

export interface TokenRef {
  readonly venue: VenueId;
  readonly tokenId: string;
  readonly marketId?: string;
}

export interface Outcome {
  // ORDER MATTERS; never match on title text. XO index 0 is the "Yes" token even for team-named markets.
  readonly index: number;
  readonly role: "yes" | "no" | "label";
  readonly label: Untrusted<string>;
  // XO outcomeTokenId; Polymarket clobTokenIds[i] if version is "v1", else positionIds[i].
  readonly tokenId: string;
}

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
  // The rules-v2 fingerprint of the venue's rule fields (rules.ts rulesFingerprint); "" when they cannot be
  // fingerprinted, which never equals another market's value.
  readonly sha256: string;
  readonly sources: readonly string[];
  readonly mechanism: ResolutionMechanism;
  // XO resolverAddress is creator-specified, so it is data, not a guarantee.
  readonly resolver?: string;
  // XO cutoffs are UTC, Polymarket's are ET (about five hours apart).
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

// Kalshi publishes price_ranges[]; a flat tick covers every other venue.
export interface TickRange {
  readonly from: Dec;
  readonly to: Dec;
  readonly tick: Dec;
}
export type TickRanges = readonly TickRange[];
// XO 0.001 globally; Polymarket per market; Kalshi price_ranges[].
export type Tick = Dec | TickRanges;

export interface Collateral {
  readonly symbol: string;
  // CAIP-2 chain id, or "offchain" for a custodial USD venue.
  readonly chain: string;
  readonly decimals: number;
  readonly custody: "self" | "smart_account" | "venue" | "broker";
}

export interface MarketGroup {
  readonly key: string;
  readonly kind: "neg_risk" | "mutually_exclusive" | "event" | "series";
  readonly exhaustive: "proven" | "by_rule" | "no" | "unknown";
}

// Whether a group's outcomes cover every case: only "proven" and "by_rule" may back a long basket.
export type Exhaustive = MarketGroup["exhaustive"];

export type FeeModelId = "curve_pq" | "curve_min" | "ad_valorem_bps" | "profit_pct" | "amm_stack" | "unknown";

// Names a fee model for one venue, `${venue}:${modelId}` (for example "xo:curve_pq"). A spec does not store it:
// it is derived from the spec's own venue and model (engine/fee-specs.ts feeSpecId), so it can never disagree with
// them, and a spec built for one venue never passes as another's.
export type FeeSpecId = string;

export type FeePayer = "buyer_adds_seller_withholds" | "outcome_tokens" | "in_pool";
export type FeeGranularity = "market" | "series" | "event" | "token" | "category";

// Parameters of one fee side, as exact decimal strings. The reader fills what its model needs; the fee engine
// (engine/fees.ts) is the only place that says what each name means. A missing parameter makes the model
// unusable and the spec fails closed, and a missing side is unknown, never zero: a zero fee is { rate: "0" }.
export interface FeeParams {
  // The fee coefficient, as a fraction ("0.04") or in basis points ("400"). Exactly one of the two; a side that
  // gives both is ambiguous and fails closed.
  readonly rate?: Dec;
  readonly bps?: Dec;
  // A factor on the coefficient (Kalshi fee_multiplier); 1 when absent.
  readonly multiplier?: Dec;
  // curve_pq only. Anything but 1 fails closed (never observed otherwise).
  readonly exponent?: Dec;
  // ad_valorem_bps side overrides (Limitless charges buys and sells differently).
  readonly buyBps?: Dec;
  readonly sellBps?: Dec;
  // amm_stack fractions: the pool's LP fee and hook fee (both required) and any explicit extra fee.
  readonly lpFee?: Dec;
  readonly hookFee?: Dec;
  readonly extraFee?: Dec;
  // A fixed cost per order in collateral units (gas); zero when absent.
  readonly gas?: Dec;
}

export interface FeeSpec {
  // The venue whose fee this is.
  readonly venue: VenueId;
  readonly modelId: FeeModelId;
  readonly taker?: FeeParams;
  readonly maker?: FeeParams;
  // Order-level rounding as comma-separated steps in the engine's grammar ("ceil:6", "half_up:5,min:0.00001",
  // engine/fees.ts parseRounding). A reader that knows the rounding only as prose states the prose; the engine
  // refuses to price with it (fail closed).
  readonly rounding?: string;
  readonly payer: FeePayer;
  readonly paramsSource: {
    readonly url: string;
    readonly field: string;
    readonly granularity: FeeGranularity;
  };
  // ISO date the parameters were read.
  readonly verifiedAt: string;
  // Past ttl, or modelId "unknown", means fail closed: no executable label, no net-of-fee number.
  readonly ttlSec: number;
}

// Where a Market's fields came from. List rows carry the fuller `Prov` (transport, freshness, licence).
export interface Provenance {
  readonly fetchedAtMs: number;
  readonly source: string;
  readonly adapterVersion: string;
  // Drift signal: a hash of the payload's shape (the sorted top-level key names).
  readonly schemaHash: string;
}

export interface Market {
  readonly ref: MarketRef;
  readonly title: Untrusted<string>;
  readonly outcomes: readonly Outcome[];
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
  // The fixed-taxonomy verdict (category.ts). Absent when the adapter did not run it; read as "other", "none".
  readonly category?: CategoryVerdict;
  // The venue's own category words, untrusted; shown only through UntrustedText, never matched or echoed elsewhere.
  readonly categoryNative?: Untrusted<string>;
}

// What a list row carries: enough to render the Markets table without a detail fetch. aggregation-design
// leaves this type open; it is defined here. `displayPrice` is the venue's list price and is NEVER an
// executable quote (XO's list price and Polymarket outcomePrices are not books).
export interface OutcomeSummary {
  readonly index: number;
  readonly role: "yes" | "no" | "label";
  readonly label: Untrusted<string>;
  readonly tokenId: string;
  readonly displayPrice: Dec | null;
}

export type VolumeUnit = "usd" | "usdc_e" | "shares" | "contracts" | "unknown";

export interface MarketSummary {
  readonly ref: MarketRef;
  readonly title: Untrusted<string>;
  readonly status: Status;
  readonly closesAtUtc: string | null;
  readonly outcomes: readonly OutcomeSummary[];
  // Null when the venue reports none; the unit is always stated, never assumed.
  readonly volume: { readonly amount: Dec | null; readonly unit: VolumeUnit; readonly windowHours: number | null };
  readonly prov: Prov;
  // As on Market: the fixed-taxonomy verdict and the venue's own category words (untrusted, display only).
  readonly category?: CategoryVerdict;
  readonly categoryNative?: Untrusted<string>;
}

// ---- books (aggregation-design 2.1 and 2.2) --------------------------------------------------------------------------------

export interface Level {
  readonly price: Dec;
  // Size in SHARES (XO sizes have up to six decimals). Never raw venue units.
  readonly size: Dec;
}

// The order a venue's raw levels come in. The normaliser (engine/books.ts) re-sorts every book whatever it says
// and warns when the raw order contradicts it, which can mean the venue changed silently.
export type BookConvention =
  | "best_first" // XO, Polymarket US
  | "best_last" // Polymarket CLOB, Kalshi
  | "yes_side_only" // Limitless, Predict.fun (NO folded into the YES book)
  | "mirrored_per_token" // Opinion
  | "amm_pool"; // Trueo (price from pool state, no resting orders)

// "complement" books are synthetic (1 - the other side) and are never executable.
export type BookDerivation = "native" | "complement";

export interface Book {
  readonly token: TokenRef;
  // Always sorted explicitly: bids descending, asks ascending. Never trust the venue's order.
  readonly bids: readonly Level[];
  readonly asks: readonly Level[];
  // The convention of the raw payload, set by the engine's normaliser. Absent on a book a reader sorted itself;
  // the engine re-canonicalises every book it is handed either way.
  readonly convention?: BookConvention;
  readonly asOfMs: number;
  readonly venueTsMs?: number;
  readonly hash?: string;
  readonly derived: BookDerivation;
}

export type QuoteSide = "buy" | "sell";

// A depth-walked price for a stated size (engine/walk.ts). Prices that cannot be computed are null, not zero.
export interface Quote {
  readonly token: TokenRef;
  readonly side: QuoteSide;
  readonly requestedSize: Dec;
  readonly filledSize: Dec;
  readonly bestPrice: Dec | null;
  // Volume-weighted average price over the filled depth, rounded against the trader; null when nothing filled.
  readonly vwap: Dec | null;
  readonly feeSpecId: FeeSpecId;
  readonly derived: BookDerivation;
  readonly asOfMs: number;
}

// ---- the adapter (aggregation-design 2.4) ------------------------------------------------------------------------------------

export type AdapterError =
  | "RATE_LIMITED"
  | "STALE"
  | "NOT_SUPPORTED"
  | "SCHEMA_DRIFT"
  | "VENUE_PAUSED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "EMPTY_BOOK";

export interface Page<T> {
  readonly items: readonly T[];
  // Page on this cursor only (XO: meta.hasNextPage); null when there is no next page.
  readonly next: string | null;
}

export interface ListMarketsQuery {
  readonly statuses?: readonly Status[];
  readonly cursor?: string;
  readonly limit?: number;
  readonly text?: string;
}

// ccxt-style `has` map: false means NOT_SUPPORTED, never a guess. `stream` is always false (polling only).
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

export interface VenueHealth {
  readonly ok: boolean;
  readonly notes: readonly string[];
}

export interface VenueReadAdapter {
  readonly id: VenueId;
  readonly caps: AdapterCaps;
  listMarkets(q: ListMarketsQuery): Promise<Page<MarketSummary>>;
  // Full rules, sources, fee parameters, group keys.
  getMarket(ref: MarketRef): Promise<Market>;
  getBooks(tokens: readonly TokenRef[], opts: { readonly deadlineMs: number }): Promise<ReadonlyArray<Result<Book, AdapterError>>>;
  // Reads live parameters; unknown yields modelId "unknown" (fail closed).
  getFeeSpec(market: Market): Promise<FeeSpec>;
  // XO: GET /trading-state; Limitless: /maintenance/status.
  health(): Promise<VenueHealth>;
}

// ---- injected dependencies --------------------------------------------------------------------------------------------------------

// The same adapter runs in the standalone build (fetch goes straight to a CORS-open host) and in the Cockpit
// build (fetch maps the absolute upstream URL onto the daemon's read proxy). Adapters build absolute upstream
// URLs, call `deps.fetch`, and never touch a global. The host owns the implementations of this type.
export type FetchLike = (input: string, init?: { readonly method?: "GET" | "POST"; readonly headers?: Readonly<Record<string, string>>; readonly body?: string; readonly signal?: AbortSignal }) => Promise<FetchResponseLike>;

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface AdapterDeps {
  readonly fetch: FetchLike;
  // An injected clock, so tests are deterministic.
  readonly nowMs: () => number;
}
