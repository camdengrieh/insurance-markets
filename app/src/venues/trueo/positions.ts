import type { Collateral, MarketRef, Prov } from "../../core/ports";

// A position row, structurally identical to `Position` of docs/dapp-design.md section 4.4 (that type is not in
// ports.ts yet; when core defines it, this interface stays assignable to it). Money and share amounts are
// decimal strings, null is not zero, and a mark is the best bid of the venue's own book.

export type PositionShape = "token_holding" | "signed_net" | "long_short";
export type PositionStatus = "open" | "resolved_unclaimed" | "claimable" | "claimed" | "voided_refund" | "lost" | "closed";

export interface VenuePosition {
  readonly id: string;
  readonly holder: { readonly bindingId: string };
  readonly market: MarketRef;
  readonly outcome: { readonly index: number; readonly role: "yes" | "no" | "label"; readonly tokenId?: string };
  readonly shape: PositionShape;
  readonly qty: string;
  readonly qtyUnit: "shares" | "contracts_1usd" | "contracts_1c";
  readonly free: string | null;
  readonly reserved: string | null;
  readonly cost: {
    readonly total: string | null;
    readonly avg: string | null;
    readonly fees: string | null;
    readonly source: "venue_reported" | "derived" | "unknown";
  };
  readonly mark: {
    readonly price: string | null;
    readonly basis: "bid" | "mid" | "settlement" | "venue_reported" | "none";
    readonly asOfMs: number;
  };
  readonly value: string | null;
  readonly pnl: {
    readonly realized: string | null;
    readonly unrealized: string | null;
    readonly total: string | null;
    readonly source: "venue_reported" | "derived" | "unavailable";
  };
  readonly status: PositionStatus;
  readonly collateral: Collateral;
  readonly prov: Prov;
}
