// The portfolio read model (docs/dapp-design.md 4.4 Position, 4.5 Portfolio; acceptance M2-4 to M2-7).
//
// One flat row per position, whatever venue it came from. The rules the type encodes:
//   - money is a Qty (exact bigint plus unit) or null; null is "not known", never 0;
//   - the unit is the venue's collateral ("usd", "usdc_e", "tyd"), and totals are kept per unit, so a TYD amount
//     is never added to dollars and a raw micro-unit integer never reaches this layer (adapters convert at once);
//   - `value` is the bid mark (or the settlement value) this app computed or the adapter marked from the venue's
//     own book; the venue's own `current value` is `reference` and is never summed;
//   - market text is Untrusted<string> and reaches the screen only through <UntrustedText>.

import type { Qty, QtyUnit } from "../../core/money";
import type { AdapterError, Prov, Untrusted, VenueId } from "../../core/ports";
import type { VenueState } from "../../core/venue-policy";

export type CollateralUnit = Extract<QtyUnit, "usd" | "usdc_e" | "tyd">;

// What a position is doing. "claimable" and "resolved_unclaimed" both mean a settled market with something to
// collect; "lost" and "closed" carry no value; "unknown" is an unrecognised venue status (fail closed).
export type RowStatus = "open" | "claimable" | "resolved_unclaimed" | "voided_refund" | "lost" | "closed" | "unknown";

// Which bucket of the totals a row counts in. Every row is in exactly one, so the excluded counts add up.
export type Bucket = "value" | "claimable" | "none";

export function bucketOf(status: RowStatus): Bucket {
  switch (status) {
    case "open":
      return "value";
    case "claimable":
    case "resolved_unclaimed":
    case "voided_refund":
      return "claimable";
    case "lost":
    case "closed":
    case "unknown":
      return "none";
  }
}

export type ValueBasis = "bid" | "settlement" | "none";
export type ClaimSource = "venue_reported" | "settlement" | "none";

// How well the row's SHAPE is established. The populated answers of XO, Polymarket and Pascal were never observed
// live (DT8), and the Trueo reads were tested against an in-memory chain: all are labelled, not trusted.
export type ShapeEvidence = "synthetic-shape tested" | "recorded";

export interface PortfolioRow {
  readonly id: string;
  readonly venue: VenueId;
  readonly bindingId: string;
  // The full address the venue was asked about.
  readonly holder: string;
  readonly market: Untrusted<string>;
  readonly outcome: Untrusted<string> | null;
  readonly tokenId: string | null;
  // Shares (or contracts). null: unreadable.
  readonly qty: Qty | null;
  readonly free: Qty | null;
  readonly reserved: Qty | null;
  readonly status: RowStatus;
  readonly collateral: CollateralUnit;
  // What the venue calls its collateral (pUSD, USDC.e, USDC, TYD): printed next to every amount, and totals are
  // kept per symbol, so a pUSD figure is never added to a USDC one.
  readonly collateralSymbol: string;
  readonly value: Qty | null;
  readonly valueBasis: ValueBasis;
  // Why `value` is null, in fixed app words. null when there is a value or the row has no value by nature.
  readonly valueNote: string | null;
  readonly claimable: Qty | null;
  readonly claimSource: ClaimSource;
  readonly claimNote: string | null;
  readonly cost: Qty | null;
  readonly pnl: Qty | null;
  readonly pnlSource: "venue_reported" | "derived" | "unavailable";
  // The venue's own current value: shown as a reference column, never added to a total.
  readonly reference: Qty | null;
  readonly shape: ShapeEvidence;
  // Fixed app text about this row (disagreement between two reads, a partial answer).
  readonly flags: readonly string[];
  readonly prov: Prov;
}

// ---- results of one venue read -------------------------------------------------------------------------------

export interface VenueReadOk {
  readonly kind: "ok";
  readonly venue: VenueId;
  readonly bindingId: string;
  readonly bindingLabel: string;
  readonly holder: string;
  readonly rows: readonly PortfolioRow[];
  // Rows the venue sent that were refused (wrong shape) or deliberately not listed, with fixed-text reasons.
  readonly rejected: number;
  readonly notListed: readonly string[];
  readonly notes: readonly string[];
  readonly prov: Prov | null;
  // The venue answered with more rows than were read.
  readonly partial: boolean;
  // Venue-level lines that are not positions (a cash balance, a registration answer): fixed text plus a quantity.
  readonly facts: readonly { readonly label: string; readonly value: Qty | null; readonly symbol: string }[];
  // Which address the venue was asked about and how this app came to it (Polymarket: acceptance M2-7).
  readonly resolution: AddressResolution | null;
}

// "profile_lookup": the venue's own profile lookup named the wallet. "pasted": the user gave this wallet.
// "derived": a pure function of the owner (the XO Kernel account, or a Polymarket wallet derived from its signer and
// confirmed on chain, which `wallet` names). A "candidate" is a derived guess that is displayed with that word and
// never used to query anything.
export interface AddressResolution {
  readonly source: "profile_lookup" | "pasted" | "derived";
  readonly address: string;
  readonly candidate: string | null;
  // A Polymarket wallet: its kind in fixed words and the signer it was derived from.
  readonly wallet?: { readonly kind: string; readonly signer: string };
}

export type VenueReadOutcome =
  | VenueReadOk
  // The venue (or the Cockpit) did not answer. Every other venue still renders (M2-6).
  | { readonly kind: "failed"; readonly venue: VenueId; readonly bindingId: string; readonly bindingLabel: string; readonly code: AdapterError | "UNKNOWN"; readonly retryAfterMs: number | null }
  // The venue is switched off or not available (venueState says why).
  | { readonly kind: "off"; readonly venue: VenueId; readonly bindingId: string; readonly bindingLabel: string; readonly reason: Exclude<Extract<VenueState, { enabled: false }>["reason"], "needs_cockpit"> }
  | { readonly kind: "needs_cockpit"; readonly venue: VenueId; readonly bindingId: string; readonly bindingLabel: string; readonly what: string }
  // The Cockpit build has no valid session: nothing was read, and the user has to pair this page with the daemon.
  | { readonly kind: "not_paired"; readonly venue: VenueId; readonly bindingId: string; readonly bindingLabel: string }
  // This build has no position reader for the venue, or the binding is the wrong kind of address for it. Said in
  // words; never an empty table.
  | { readonly kind: "unsupported"; readonly venue: VenueId; readonly bindingId: string; readonly bindingLabel: string; readonly why: string }
  // An address that could not be turned into the one the venue is asked about (Polymarket: no wallet of the signer's
  // was found on chain).
  | { readonly kind: "unresolved"; readonly venue: VenueId; readonly bindingId: string; readonly bindingLabel: string; readonly why: string };

