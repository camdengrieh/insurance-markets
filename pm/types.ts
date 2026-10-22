// Venue-agnostic types shared by every pm/ module (docs/aggregation-design.md section 2.1 to 2.5). The read model
// (refs, outcomes, rules, status, markets, list rows, books, quotes, fees, ticks, pages, the adapter error set,
// capability map and port) is the SDK's (sdk/model.ts), re-exported here; pm adds only the subset of venues it
// reads and the narrowed refs that go with it. The books and fee engine is sdk/engine (pm/core re-exports it).
//
// Decimal rule: at the edges (adapter input, tool output) a number is a plain decimal string
// (`Dec`); inside the engine it is a `Fixed` (bigint units plus an explicit scale) or a rational.
// Floating point is never used for money, prices or share counts. `null` means unknown and is never zero.

import type { MarketGroup, MarketRef as SdkMarketRef, Outcome, Collateral, Level, VenueId as SdkVenueId } from "../sdk/model.js";

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

export type Custody = Collateral["custody"];
export type GroupKind = MarketGroup["kind"];

// One level of a book, in shares (sdk/model.ts Level).
export type BookLevel = Level;

// ---------------------------------------------------------------------------------------------
// The read model, books, quotes and fees (sdk/model.ts)

export type {
  AdapterCaps,
  AdapterError,
  Book,
  BookConvention,
  BookDerivation,
  Collateral,
  Exhaustive,
  FeeGranularity,
  FeeModelId,
  FeeParams,
  FeePayer,
  FeeSpec,
  FeeSpecId,
  ListMarketsQuery,
  Market,
  MarketGroup,
  MarketSummary,
  Outcome,
  OutcomeSummary,
  Page,
  Provenance,
  Quote,
  QuoteSide,
  ResolutionMechanism,
  Result,
  Rules,
  Status,
  Tick,
  TickRange,
  TokenRef,
  VenueReadAdapter,
  VoidPolicy,
} from "../sdk/model.js";

// ---------------------------------------------------------------------------------------------
// Links (human-approved, hash-pinned registry records)

// The engine's view of a link lives in the SDK (sdk/links/types.ts); the registry record is sdk/links/schema.ts.
export type { BasisAxis, BasisClass, Link, LinkLeg, LinkRef, LinkRelation, LinkState } from "../sdk/links/types.js";
