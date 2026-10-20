// Platform record types (docs/platform-registry-design.md section 3). Enumerations and short
// fixed strings only: no third-party descriptions, no market text. Unknown is `null` or
// "unknown", never a guess, and unknown fails closed in gates.

import type {
  Custody,
  FeeGranularity,
  FeeModelId,
  FeeSpecId,
  ResolutionMechanism,
  VenueId,
  VoidPolicy,
} from "../types.js";
import type { RegistryVenueId } from "./ids.js";
import type { Section } from "./staleness.js";

// Tri-state capability flag. Only "yes" is shown as such; every other value shows "unproven".
export type CapabilityFlag = "yes" | "no" | "unknown";

export type RecordDepth = "full" | "light";
export type AdapterPriority = "P0" | "P1" | "P2" | "skip";

// ---- identity, status, kind -------------------------------------------------------------

export interface Identity {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly jurisdiction: string | null;
  readonly urls: {
    readonly docs: string | null;
    // Exact https hosts or base URLs the venue's read API uses (empty = no HTTP API).
    readonly apiBase: readonly string[];
  };
  readonly externalIds: { readonly defillamaId: number | null };
}

export type StatusState =
  | "live"
  | "beta"
  | "waitlist"
  | "inactive"
  | "deprecated"
  | "dead"
  | "dark"
  | "unknown";

export interface StatusValue {
  readonly state: StatusState;
}

export type OperatorType =
  | "onchain_clob"
  | "onchain_amm"
  | "onchain_hybrid_clob"
  | "regulated_exchange"
  | "sportsbook_exchange"
  | "play_money"
  | "unknown";
export type Scope = "general" | "sports_only" | "crypto_only" | "unknown";
export type MoneyType = "real" | "play" | "unknown";

export interface KindValue {
  readonly operatorType: OperatorType;
  readonly scope: Scope;
  readonly moneyType: MoneyType;
  readonly negRisk: CapabilityFlag;
}

// ---- collateral --------------------------------------------------------------------------

export interface CollateralValue {
  // CAIP-2 chain id, or "offchain" for fiat venues, or "unknown".
  readonly chain: string;
  readonly asset: string;
  // Native token decimals; null when not recorded (never assumed).
  readonly decimals: number | null;
  readonly custody: Custody;
}

// ---- fees --------------------------------------------------------------------------------

// verified: parameters can be read live from paramsSource. conflicted: two live sources
// disagree. docs_only: the formula comes from venue docs and no live parameter source is
// recorded (not usable to label anything executable). unknown: fail closed.
export type FeeStatus = "verified" | "conflicted" | "docs_only" | "unknown";
export type FeeUseRule = "read_live" | "max_of_sources_until_fill_reconciled" | "fail_closed";

export interface FeeSourcePointer {
  readonly url: string;
  readonly field: string;
  readonly granularity: FeeGranularity;
}

export interface FeesValue {
  readonly modelId: FeeModelId;
  // Matches pm-core FeeSpec.id by string: `${venue}:${modelId}`.
  readonly feeSpecId: FeeSpecId;
  readonly formula: string | null;
  readonly paramsSource: FeeSourcePointer | null;
  readonly secondarySource: FeeSourcePointer | null;
  readonly status: FeeStatus;
  readonly useRule: FeeUseRule;
  // Documented headline rates as exact decimal strings. Indicative only, never a gate input.
  readonly indicative: Readonly<Record<string, string>>;
}

// ---- geography and policy ----------------------------------------------------------------

export type UsPersons = "allowed" | "close_only" | "blocked" | "unknown";
export type GeoModel =
  | "everyone"
  | "global_restrictions"
  | "allowlist"
  | "checked_at_point_of_use"
  | "unknown";
export type Enforcement = "ip" | "login" | "kyc" | "attestation" | "device_location" | "none" | "unknown";
export type BotsPolicy = "allowed" | "conditional" | "prohibited" | "unknown";

export interface GeoValue {
  readonly usPersons: UsPersons;
  readonly geoModel: GeoModel;
  // ISO 3166-1 alpha-2 or 3166-2 codes. null = list unknown (never an empty list by default).
  // Evidence for display only: an execution gate needs a live check at the user's own client.
  readonly restrictedRegions: readonly string[] | null;
  readonly enforcement: readonly Enforcement[];
  readonly kyc: CapabilityFlag;
  readonly botsPolicy: BotsPolicy;
  readonly washTradingProhibited: CapabilityFlag;
}

// ---- api ---------------------------------------------------------------------------------

export const READ_CAP_KEYS = [
  "listMarkets",
  "search",
  "getMarket",
  "getBook",
  "getBooksBatch",
  "getFeeSpec",
  "getResolution",
  "getPositionsByAddress",
] as const;
export type ReadCapKey = (typeof READ_CAP_KEYS)[number];

export type ReadAuth = "none" | "key_for_some" | "key_required" | "onchain_rpc" | "unknown";
export type OrderbookDepth = "full" | "yes_side_only" | "amm_pool" | "unknown";
export type SigningScheme =
  | "eip712"
  | "hmac"
  | "rsa_pss"
  | "ed25519"
  | "bearer_key"
  | "l1_action"
  | "evm_tx"
  | "unknown";

export interface ApiValue {
  readonly read: {
    readonly auth: ReadAuth;
    readonly publicKeyless: CapabilityFlag;
    readonly depth: OrderbookDepth;
    // ccxt-style: only "yes" counts; "unknown" and "no" both show as unproven.
    readonly has: Readonly<Record<ReadCapKey, CapabilityFlag>>;
  };
  readonly trade: {
    readonly exists: CapabilityFlag;
    readonly signing: SigningScheme;
  };
}

// ---- reachability (our judgement, kept apart from venue facts) ---------------------------

export type ExecClass = "E1" | "E2" | "E3" | "E4" | "E5" | "unknown";
export type ReachProof = "none" | "simulated" | "testnet" | "mainnet_tiny";

export interface ReachabilityValue {
  readonly class: ExecClass;
  readonly proof: ReachProof;
  // Short fixed steps a human must do; each at most 200 characters.
  readonly humanOnboardingSteps: readonly string[];
  readonly unattendedOk: CapabilityFlag;
}

// ---- liquidity ---------------------------------------------------------------------------

export type LiquidityTier = "A" | "B" | "C" | "D" | "X" | "unknown";

export interface LiquidityValue {
  readonly tier: LiquidityTier;
  readonly tierByVolume: LiquidityTier;
  // True when displayed depth contradicts the volume headline (the tier is already downgraded).
  readonly depthDowngraded: boolean;
  // Dollar metrics are deliberately not stored: see design 7.3.
}

// ---- resolution --------------------------------------------------------------------------

export interface ResolutionValue {
  readonly mechanisms: readonly ResolutionMechanism[];
  readonly oracleCluster: string | null;
  readonly void: VoidPolicy;
  readonly discretionarySettlement: CapabilityFlag;
  readonly earlyClosePossible: CapabilityFlag;
}

// ---- links and pools ---------------------------------------------------------------------

export type LiquidityRelation = "same_book" | "routes_to" | "mirror_of" | "settles_on";

export interface LiquidityLink {
  readonly relation: LiquidityRelation;
  readonly target: RegistryVenueId;
}

export interface LinksValue {
  readonly liquidityLinks: readonly LiquidityLink[];
  // Front ends known to route into this venue's book (ids outside this registry, display only).
  readonly inboundFrontEnds: readonly string[];
  // Venue-published fields that name another venue's market (L0 candidates only).
  readonly nativeCrossRefs: readonly string[];
}

export interface MarketIdentityValue {
  readonly idField: string | null;
  readonly groupFields: readonly string[];
  readonly exhaustiveFlag: CapabilityFlag;
}

// ---- data terms --------------------------------------------------------------------------

// restricted: terms bar caching, aggregating or redistribution (memory only). none_found: no
// such clause was recorded in the research notes (this is not a clean bill). unknown: not read.
export type DataTermsStatus = "restricted" | "none_found" | "unknown";

export interface DataTermsValue {
  readonly restricted: DataTermsStatus;
  // Fixed disclosure shown whenever the adapter is enabled. At most 200 characters.
  readonly clause: string;
}

// ---- record ------------------------------------------------------------------------------

export interface PlatformRecord {
  readonly id: RegistryVenueId;
  readonly depth: RecordDepth;
  // pm/types.ts VenueId used by adapters; null where VenueId has no such member yet.
  readonly adapterVenueId: VenueId | null;
  readonly adapterPriority: AdapterPriority;
  readonly identity: Section<Identity>;
  readonly status: Section<StatusValue>;
  readonly kind: Section<KindValue>;
  readonly collateral: Section<CollateralValue>;
  readonly fees: Section<FeesValue>;
  readonly geo: Section<GeoValue>;
  readonly api: Section<ApiValue>;
  readonly reachability: Section<ReachabilityValue>;
  readonly liquidity: Section<LiquidityValue>;
  readonly resolution: Section<ResolutionValue>;
  readonly links: Section<LinksValue>;
  readonly marketIdentity: Section<MarketIdentityValue>;
  readonly dataTerms: Section<DataTermsValue>;
}
