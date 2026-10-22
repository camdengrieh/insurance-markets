// Venue-agnostic types shared by every pm/ module (docs/aggregation-design.md section 2.1 to 2.5). The parts of
// the read model that are the same everywhere (refs, outcomes, rules, status, collateral, groups, the adapter error
// set and capability map) are the SDK's (sdk/model.ts) and re-exported here. Books, fees, ticks, pages and list rows
// keep their pm shape until the books and fee engine move into the SDK (docs/sdk-and-api-design.md step 4).
// Types only, plus a very small exact-decimal bridge. Real math lives in pm/core.
//
// Decimal rule: at the edges (adapter input, tool output) a number is a plain decimal string
// (`Dec`); inside the engine it is a `Fixed` (bigint units plus an explicit scale). Floating
// point is never used for money, prices or share counts. `null` means unknown and is never zero.

import type {
  AdapterCaps,
  AdapterError,
  Collateral,
  Dec,
  FeeModelId,
  MarketGroup,
  MarketRef as SdkMarketRef,
  Outcome,
  Result,
  Rules,
  Status,
  Untrusted,
  VenueId as SdkVenueId,
  VoidPolicy,
} from "../sdk/model.js";
import type { Fixed } from "../sdk/money/fixed.js";
import type { CategoryVerdict } from "../sdk/category.js";

// ---------------------------------------------------------------------------------------------
// Decimals

// Non-negative plain decimal string such as "0.534" (no sign, exponent, hex or separators). Defined in sdk/model.ts.
export type { Dec } from "../sdk/model.js";

// Fixed-point values and the decimal bridge live in the SDK (sdk/money/fixed.ts).
export { compareFixed, decToFixed, fixedToDec, rescaleFixed, type Fixed, type FixedResult } from "../sdk/money/fixed.js";

// ---------------------------------------------------------------------------------------------
// Untrusted text

// Market text, theses and rules are data written by third parties. Wrapping them in the type
// forces tools to pass them through src/guardrails/untrusted.ts before returning them.
export { untrusted, type Untrusted } from "../sdk/model.js";

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
] as const satisfies readonly SdkVenueId[];
export type VenueId = (typeof VENUE_IDS)[number];

export type {
  AdapterCaps,
  AdapterError,
  Collateral,
  FeeModelId,
  MarketGroup,
  Outcome,
  ResolutionMechanism,
  Rules,
  Status,
  VoidPolicy,
} from "../sdk/model.js";

// A market reference whose venue is one this layer reads.
export interface MarketRef extends SdkMarketRef {
  readonly venue: VenueId;
}

export function isVenueId(value: unknown): value is VenueId {
  return typeof value === "string" && (VENUE_IDS as readonly string[]).includes(value);
}


export type OutcomeRole = "yes" | "no" | "label";

// Outcome order matters: never match on title text (XO index 0 is the "Yes" token even for team-named markets).
export type OutcomeRef = Outcome;


export interface TokenRef {
  readonly venue: VenueId;
  readonly tokenId: string;
}

// ---------------------------------------------------------------------------------------------
// Rules, status, market





// Tick is either one global step or per-price-range steps (Kalshi price_ranges[]).
export interface TickRange {
  readonly from: Dec;
  readonly to: Dec;
  readonly step: Dec;
}
export type Tick = Dec | readonly TickRange[];

export type Custody = Collateral["custody"];


export type GroupKind = MarketGroup["kind"];
export type Exhaustive = MarketGroup["exhaustive"];


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
  // The fixed-taxonomy verdict (pm/core/category.ts). Optional: an adapter without a native source leaves it out,
  // and a consumer reads an absent verdict as "other" with confidence "none".
  readonly category?: CategoryVerdict;
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


export type { Result } from "../sdk/model.js";

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
  // XO pages on meta.hasNextPage only; false means the venue said there is no more.
  readonly hasNext: boolean;
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
