// Types for the XO public read APIs (Orderbook https://orderbooks.xo.market and Data API
// https://api-mainnet.xo.market/api). Conventions that hold for every type in this file:
//   - Amounts, prices and share sizes are bigint "micro" units (1e6 = 1.0). Never floats.
//   - Free text that a market creator can write is branded UntrustedString.
//   - Unknown enum values from upstream map to "unknown" and keep the raw value alongside.

// Text authored by market creators (titles, rules, outcome names, category and creator names,
// source URLs). A string subtype, so string methods work, but a plain string is NOT assignable
// to it: only this module's decoders mint it. Tools must run these fields through the
// guardrails sanitizer (src/guardrails/untrusted.ts) before putting them in any output.
export type UntrustedString = string & { readonly __untrusted: true };

// The single place raw upstream text becomes UntrustedString.
export function untrusted(text: string): UntrustedString {
  return text as UntrustedString;
}

export type XoErrorKind =
  | "timeout"
  | "rate_limited"
  | "not_found"
  | "upstream_error"
  | "invalid_response"
  | "blocked"
  | "invalid_input";

// ---- Data API: markets ----

export const KNOWN_MARKET_STATUSES = [
  "PENDING",
  "ACTIVE",
  "PAUSED",
  "CLOSED",
  "RESOLVED",
  "VOIDED",
  "VOIDED_CLOSED",
  "UPDATE_REQUIRED",
  "CANCELLED",
] as const;
export type KnownMarketStatus = (typeof KNOWN_MARKET_STATUSES)[number];
export type MarketStatus = KnownMarketStatus | "unknown";

// Data API `type`: 0 legacy AMM, 1 legacy AMM pulse, 2 CLOB, 3 CLOB pulse (BTC 5 minute),
// 4 Conviction (user-created CLOB, undocumented in the API enum).
export type MarketKind = "standard" | "pulse_amm" | "clob" | "clob_pulse" | "conviction" | "unknown";

export const KNOWN_REVIEW_STATUSES = ["APPROVE", "UPDATE_REQUIRED", "REJECT"] as const;
export type ReviewStatus = (typeof KNOWN_REVIEW_STATUSES)[number] | "unknown";

// Slot, not label: index 0 is the "Yes" token and index 1 the "No" token even when the titles
// are team names (AURORA / FALCONS).
export interface MarketOutcome {
  // Outcome ROW id. `winningOutcomeId` refers to this, not to `index`.
  readonly id: number;
  readonly index: 0 | 1;
  readonly slot: "yes" | "no";
  readonly title: UntrustedString;
  // Orderbook token id (decimal U256 string). Feed this to /book and /price.
  readonly tokenId: string;
}

// List rows carry a display price. It is NOT a quote: it is the book midpoint when the spread
// is at most 0.10 and the last trade otherwise. Detail routes return a constant 500000, so
// MarketDetail outcomes deliberately have no price at all. Quote from the orderbook only.
export interface ListedOutcome extends MarketOutcome {
  readonly displayPriceMicro: bigint | null;
}

export interface MarketCategory {
  readonly id: number | null;
  readonly name: UntrustedString;
  readonly slug: UntrustedString | null;
}

export interface MarketCreator {
  readonly id: number | null;
  // Lowercase 0x address when the upstream value is a valid address, else null.
  readonly walletAddress: string | null;
  readonly username: UntrustedString | null;
  readonly bio: UntrustedString | null;
  readonly verified: boolean | null;
}

export interface Settlement {
  // Raw upstream outcome row id; null when absent (open, VOIDED, VOIDED_CLOSED).
  readonly winningOutcomeId: number | null;
  // winningOutcomeId mapped through outcomes[].id. Null whenever there is no winner.
  readonly winningOutcomeIndex: 0 | 1 | null;
  readonly resolvedAt: string | null;
}

export interface MarketCore {
  readonly id: number;
  // 0x plus 64 lowercase hex digits. The primary key for orderbook routes.
  readonly conditionId: string;
  readonly title: UntrustedString;
  readonly slug: UntrustedString;
  readonly typeCode: number;
  readonly kind: MarketKind;
  readonly status: MarketStatus;
  // The upstream value verbatim, always present, so unknown statuses stay visible.
  readonly statusRaw: UntrustedString;
  readonly createdAt: string | null;
  readonly startsAt: string | null;
  readonly expiresAt: string | null;
  readonly settlement: Settlement;
  readonly categoryPath: readonly MarketCategory[];
  readonly resolutionSources: readonly UntrustedString[];
  // How many sources XO sent, counted before any cap or unreadable entry removed one.
  readonly resolutionSourcesTotal: number;
  readonly resolutionType: UntrustedString | null;
  readonly resolverAddress: string | null;
  readonly reviewStatus: ReviewStatus | null;
  readonly reviewStatusRaw: UntrustedString | null;
  readonly resolutionFlagCount: number | null;
  readonly creator: MarketCreator | null;
  // Display-only; the unit is USD with 6 decimals. Null when absent or malformed.
  readonly totalVolumeUsdMicro: bigint | null;
}

export interface MarketSummary extends MarketCore {
  readonly outcomes: readonly [ListedOutcome, ListedOutcome];
}

export interface MarketRules {
  readonly description: UntrustedString | null;
  readonly outcomeRules: readonly { readonly outcomeIndex: 0 | 1; readonly rule: UntrustedString }[];
  // How many outcome rules XO sent, counted before any cap or unreadable entry removed one.
  readonly outcomeRulesTotal: number;
}

// Data API effectiveFeeConfig. The only fee figure to trust alongside /fee-rate, which is
// unreliable (returns 0 even for nonexistent tokens).
export interface FeeConfig {
  readonly takerFeeBps: number;
  readonly makerFeeBps: number;
  readonly eligible: boolean | null;
  readonly curveModel: UntrustedString | null;
  readonly configName: UntrustedString | null;
}

export interface MarketDetail extends MarketCore {
  readonly outcomes: readonly [MarketOutcome, MarketOutcome];
  readonly description: UntrustedString | null;
  readonly rules: MarketRules;
  readonly resolutionEvidence: UntrustedString | null;
  readonly notes: UntrustedString | null;
  // Plain sentences (built from field names and numbers, no upstream text) saying what was cut,
  // capped or ignored while decoding. Reported to the caller, never dropped silently.
  readonly omissions: readonly string[];
  readonly effectiveFeeConfig: FeeConfig | null;
  // Set when effectiveFeeConfig was present but unusable. Fee consumers must treat the fee as
  // unknown, not as zero.
  readonly feeConfigProblem: string | null;
}

export interface PageMeta {
  readonly page: number;
  readonly take: number | null;
  // Hints only. Rows can be hidden after itemCount is computed, so paging uses hasNextPage.
  readonly itemCount: number | null;
  readonly pageCount: number | null;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean | null;
}

// A row that failed validation. Reported, never silently dropped. `reason` is built from field
// paths and fixed phrases only, so it carries no upstream text.
export interface SkippedRow {
  readonly index: number;
  readonly reason: string;
}

export interface MarketPage {
  readonly markets: readonly MarketSummary[];
  readonly skipped: readonly SkippedRow[];
  readonly meta: PageMeta;
}

export interface MarketCollection {
  readonly markets: readonly MarketSummary[];
  readonly skipped: readonly SkippedRow[];
  readonly pagesFetched: number;
  // True when the last page fetched said hasNextPage=false. False means we stopped at maxPages.
  readonly exhausted: boolean;
}

export type Lifecycle =
  | "pending"
  | "open"
  | "paused"
  | "expired_unresolved"
  | "review_required"
  // RESOLVED: a winner is recorded but the payout may not be final until CLOSED (provisional).
  | "resolved_provisional"
  | "settled"
  | "closed_no_winner"
  | "voided"
  | "cancelled"
  | "unknown";

export type PortfolioResult =
  | { readonly status: "no_profile" }
  | {
      readonly status: "ok";
      readonly entries: readonly PortfolioEntry[];
      readonly meta: PageMeta;
      readonly skipped: readonly SkippedRow[];
    };

// Minimal subset of PortfolioMarketEntry. The populated shape has never been observed live
// (only OpenAPI), so only fields with a stated unit are decoded.
export interface PortfolioEntry {
  readonly conditionId: string;
  readonly title: UntrustedString;
  readonly status: MarketStatus;
  readonly statusRaw: UntrustedString;
  readonly winningOutcomeId: number | null;
  readonly positions: readonly {
    readonly tokenId: string | null;
    readonly outcomeTitle: UntrustedString | null;
    readonly shareAmountMicro: bigint;
    readonly hasClaimed: boolean | null;
  }[];
}

// ---- Orderbook ----

export interface BookLevel {
  readonly priceMicro: bigint;
  // Micro-shares (the API sends human shares with up to 6 decimals).
  readonly sizeMicro: bigint;
}

export interface OrderBook {
  readonly tokenId: string;
  readonly conditionId: string;
  readonly timestampMs: number;
  readonly hash: string | null;
  // Sorted by us: bids best (highest) first, asks best (lowest) first.
  readonly bids: readonly BookLevel[];
  readonly asks: readonly BookLevel[];
  readonly tickSizeMicro: bigint;
  // Raw upstream string. Live value is always "0" and the unit is unconfirmed, so it is not
  // interpreted.
  readonly minOrderSizeRaw: string;
  readonly negRisk: boolean;
  // Null when the book reports the "0.000" no-trade sentinel.
  readonly lastTradePriceMicro: bigint | null;
  readonly lastUpdateId: number | null;
}

export type ThinReason = "no_bids" | "no_asks" | "wide_spread" | "crossed";

export interface Quote {
  readonly tokenId: string;
  readonly conditionId: string;
  readonly timestampMs: number;
  readonly bestBid: BookLevel | null;
  readonly bestAsk: BookLevel | null;
  readonly spreadMicro: bigint | null;
  // Only when both sides exist. Meaningless on a thin book: check `thin`.
  readonly midMicro: bigint | null;
  readonly bidDepthMicro: bigint;
  readonly askDepthMicro: bigint;
  readonly thin: readonly ThinReason[];
  readonly lastTradePriceMicro: bigint | null;
}

export interface OrderbookMarket {
  readonly conditionId: string;
  readonly yesTokenId: string;
  readonly noTokenId: string;
  // True only for markets live in the matching engine. Use with status and expiry, not alone.
  readonly active: boolean;
}

export interface LastTrade {
  readonly priceMicro: bigint;
  readonly side: "BUY" | "SELL";
}

export interface MarketWithTokens {
  readonly market: MarketDetail;
  readonly orderbook: OrderbookMarket;
}

export type FeeAssessmentStatus = "agree" | "disagree" | "effective_only" | "fee_rate_only" | "unknown";

export interface FeeAssessment {
  // The figure to use: the larger of the known figures. Null means unknown; refuse to quote.
  readonly takerFeeBps: number | null;
  readonly effectiveConfigBps: number | null;
  readonly feeRateBps: readonly number[];
  readonly status: FeeAssessmentStatus;
  readonly note: string;
}

export type TradingState = { readonly state: "active" | "paused" } | { readonly state: "unknown"; readonly raw: UntrustedString };

// `allowanceMicro` is the raw `allowance` field exactly as received. Its meaning is UNVERIFIED:
// the docs' field schema calls it "available cash after open-order reservations" while the
// endpoint description says "exchange allowance", and live it reads 0 on every funded wallet
// checked (15 of 15). It is not proven to be available cash and is not the ERC-20 approval.
export interface BalanceAllowance {
  readonly balanceMicro: bigint;
  readonly allowanceMicro: bigint;
  readonly smartAccount: string | null;
}

export interface Position {
  readonly tokenId: string;
  readonly balanceMicro: bigint;
  readonly reservedMicro: bigint;
  readonly freeMicro: bigint;
}

export interface Positions {
  readonly cashBalanceMicro: bigint;
  readonly positions: readonly Position[];
  // True when upstream signalled more rows than it returned. The endpoint cannot be paged.
  readonly truncated: boolean;
}

export type RefundReason = "resolved_winner" | "voided_refund" | "unknown";

export interface ClaimableEntry {
  readonly conditionId: string;
  readonly outcome: "Yes" | "No";
  readonly tokenId: string;
  readonly balanceMicro: bigint;
  readonly refundReason: RefundReason;
  readonly refundReasonRaw: UntrustedString;
}

// A discovery hint, not the on-chain gate: redeemPositions reverts until payoutDenominator > 0.
export interface Claimable {
  readonly address: string;
  readonly claimable: readonly ClaimableEntry[];
}
