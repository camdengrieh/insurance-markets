import type { Qty } from "../../core/money";
import { parseQty } from "../../core/money";
import type { Prov, Untrusted, VenueId } from "../../core/ports";
import { shapeEvidenceOf } from "./shape";
import type { CollateralUnit, PortfolioRow, RowStatus } from "./types";

export interface RowInit {
  readonly id: string;
  readonly venue: VenueId;
  readonly bindingId: string;
  readonly holder: string;
  readonly market: Untrusted<string>;
  readonly outcome: Untrusted<string> | null;
  readonly tokenId: string | null;
  readonly qty: Qty | null;
  readonly status: RowStatus;
  readonly collateral: CollateralUnit;
  readonly collateralSymbol: string;
  readonly prov: Prov;
  readonly free?: Qty | null;
  readonly reserved?: Qty | null;
  readonly value?: Qty | null;
  readonly valueBasis?: PortfolioRow["valueBasis"];
  readonly valueNote?: string | null;
  readonly claimable?: Qty | null;
  readonly claimSource?: PortfolioRow["claimSource"];
  readonly claimNote?: string | null;
  readonly cost?: Qty | null;
  readonly pnl?: Qty | null;
  readonly pnlSource?: PortfolioRow["pnlSource"];
  readonly reference?: Qty | null;
  readonly flags?: readonly string[];
}

// Every optional field defaults to "not known". The shape label always comes from shape.ts, never from the caller.
export function makeRow(init: RowInit): PortfolioRow {
  return {
    id: init.id,
    venue: init.venue,
    bindingId: init.bindingId,
    holder: init.holder,
    market: init.market,
    outcome: init.outcome,
    tokenId: init.tokenId,
    qty: init.qty,
    free: init.free ?? null,
    reserved: init.reserved ?? null,
    status: init.status,
    collateral: init.collateral,
    collateralSymbol: init.collateralSymbol,
    value: init.value ?? null,
    valueBasis: init.valueBasis ?? "none",
    valueNote: init.valueNote ?? null,
    claimable: init.claimable ?? null,
    claimSource: init.claimSource ?? "none",
    claimNote: init.claimNote ?? null,
    cost: init.cost ?? null,
    pnl: init.pnl ?? null,
    pnlSource: init.pnlSource ?? "unavailable",
    reference: init.reference ?? null,
    shape: shapeEvidenceOf(init.venue),
    flags: init.flags ?? [],
    prov: init.prov,
  };
}

// An adapter's decimal text as an exact quantity, or null. Negative is allowed (PnL).
export function qtyOf(unit: Qty["unit"], dec: string | null | undefined): Qty | null {
  return dec === null || dec === undefined ? null : parseQty(unit, dec, { allowNegative: true, maxScale: 36 });
}
