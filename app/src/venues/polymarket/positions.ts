import type { Collateral, Market, MarketRef, Prov, Transport, Untrusted } from "../../core/ports";
import { COLLATERAL, TTL_MS, VENUE } from "./constants";
import { cmpDec, numericToDec, type Dec } from "./decimal";
import { untrustedField } from "../../core/untrusted";
import { positionRowSchema, type PositionRowWire } from "./schemas";

// Data API v2 /v2/positions rows -> the position shape of dapp-design 4.4 (type sketch; the port file holds only
// the market types, so this module defines the position type and a portfolio screen can adopt it unchanged).
//
// The ROW SHAPE IS SYNTHETIC: the route and field names come from the Data API v2 OpenAPI as quoted in note 26
// section 4.3, and no populated response was ever captured (dapp-design DT8). Everything that is not in the row is
// null (never 0, never a guess): `free` and `reserved` (the route reports neither), any cost or PnL figure the venue
// omitted. Cost and PnL are the venue's own figures and are labelled "venue_reported"; the portfolio re-marks from
// the book bid and shows both.

export const POSITION_QUERY_STATUSES = ["OPEN", "REDEEMABLE", "REDEEMABLE_LOST", "MERGEABLE", "CLOSED"] as const;
export type PositionQueryStatus = (typeof POSITION_QUERY_STATUSES)[number];

export type PositionStatus = "open" | "claimable" | "lost" | "closed";

export interface PolymarketPosition {
  readonly id: string;
  readonly holder: { readonly bindingId: string; readonly address: string };
  readonly market: MarketRef;
  readonly outcome: {
    // The row's own outcome_index is NOT a stable key (the tokens route reports 1 for the first CLOB outcome), so
    // the index is null until the position is resolved against its market by token id.
    readonly index: number | null;
    readonly role: "yes" | "no" | "label";
    readonly label: Untrusted<string> | null;
    readonly tokenId: string;
    readonly oppositeTokenId: string | null;
  };
  readonly shape: "token_holding";
  readonly qty: Dec;
  readonly qtyUnit: "shares";
  readonly free: null;
  readonly reserved: null;
  readonly cost: { readonly total: Dec | null; readonly avg: Dec | null; readonly fees: Dec | null; readonly source: "venue_reported" };
  readonly mark: { readonly price: Dec | null; readonly basis: "venue_reported" | "none"; readonly asOfMs: number };
  readonly value: Dec | null;
  readonly pnl: { readonly realized: Dec | null; readonly unrealized: Dec | null; readonly total: Dec | null; readonly source: "venue_reported" | "unavailable" };
  readonly status: PositionStatus;
  readonly flags: { readonly redeemable: boolean | null; readonly mergeable: boolean | null; readonly negRisk: boolean | null };
  readonly title: Untrusted<string> | null;
  readonly endDateUtc: string | null;
  readonly collateral: Collateral;
  readonly prov: Prov;
}

export function statusOfRow(value: string | null | undefined): PositionStatus | null {
  switch (value?.toUpperCase()) {
    case "OPEN":
    case "MERGEABLE":
      return "open";
    case "REDEEMABLE":
      return "claimable";
    case "REDEEMABLE_LOST":
      return "lost";
    case "CLOSED":
      return "closed";
    default:
      return null;
  }
}

export interface RowContext {
  readonly address: string;
  readonly bindingId: string;
  readonly requestedStatus: PositionQueryStatus;
  readonly nowMs: number;
  readonly transport: Transport;
  readonly source: string;
}

export type RowOutcome =
  | { readonly ok: true; readonly position: PolymarketPosition }
  | { readonly ok: false; readonly reason: string };

function decOrNull(value: unknown): Dec | null {
  return value === null || value === undefined ? null : numericToDec(value);
}

export function parsePositionRow(row: unknown, ctx: RowContext): RowOutcome {
  const parsed = positionRowSchema.safeParse(row);
  if (!parsed.success) return { ok: false, reason: "row does not match the position shape" };
  const wire: PositionRowWire = parsed.data;
  // The row's own status wins; the requested status is the fallback because the route filters by it. An
  // unknown status is not guessed.
  const status = statusOfRow(wire.status ?? ctx.requestedStatus);
  if (status === null) return { ok: false, reason: "unknown position status" };
  const qty = numericToDec(wire.current_size);
  if (qty === null || cmpDec(qty, "0") === -1) return { ok: false, reason: "size is not a non-negative decimal" };
  // A present figure that does not parse is drift in the row, not a null.
  for (const figure of [wire.avg_price, wire.entry_fees_usdc, wire.total_cost_usdc, wire.current_price, wire.current_value, wire.realized_pnl, wire.unrealized_pnl, wire.total_pnl]) {
    if (figure !== null && figure !== undefined && numericToDec(figure) === null) return { ok: false, reason: "a figure is not a decimal" };
  }
  const markPrice = decOrNull(wire.current_price);
  const pnlSeen = [wire.realized_pnl, wire.unrealized_pnl, wire.total_pnl].some((value) => value !== null && value !== undefined);
  const native: Record<string, string> = {};
  if (wire.slug) native["slug"] = wire.slug;
  if (wire.event_slug) native["eventSlug"] = wire.event_slug;
  const tokenId = wire.token_id;
  const address = ctx.address;
  return {
    ok: true,
    position: {
      id: `polymarket:eip155:137:${address}:${tokenId}`,
      holder: { bindingId: ctx.bindingId, address },
      market: { venue: VENUE, marketId: wire.condition_id.toLowerCase(), native },
      outcome: {
        index: null,
        role: "label",
        label: wire.outcome ? untrustedField("outcome", wire.outcome, "polymarket") : null,
        tokenId,
        oppositeTokenId: wire.opposite_token_id ?? null,
      },
      shape: "token_holding",
      qty,
      qtyUnit: "shares",
      free: null,
      reserved: null,
      cost: {
        total: decOrNull(wire.total_cost_usdc),
        avg: decOrNull(wire.avg_price),
        fees: decOrNull(wire.entry_fees_usdc),
        source: "venue_reported",
      },
      mark: { price: markPrice, basis: markPrice === null ? "none" : "venue_reported", asOfMs: ctx.nowMs },
      value: decOrNull(wire.current_value),
      pnl: {
        realized: decOrNull(wire.realized_pnl),
        unrealized: decOrNull(wire.unrealized_pnl),
        total: decOrNull(wire.total_pnl),
        source: pnlSeen ? "venue_reported" : "unavailable",
      },
      status,
      flags: {
        redeemable: wire.redeemable ?? null,
        mergeable: wire.mergeable ?? null,
        negRisk: wire.negative_risk ?? null,
      },
      title: wire.title ? untrustedField("title", wire.title, "polymarket") : null,
      endDateUtc: wire.end_date && !Number.isNaN(Date.parse(wire.end_date)) ? new Date(Date.parse(wire.end_date)).toISOString() : null,
      collateral: COLLATERAL,
      prov: {
        venue: VENUE,
        source: ctx.source,
        fetchedAtMs: ctx.nowMs,
        transport: ctx.transport,
        freshness: "live",
        ttlMs: TTL_MS.positions,
        license: "unknown",
      },
    },
  };
}

// Maps a position to its market by token id (never by label or by the row's outcome_index). Returns null when the
// token is not one of the market's outcomes: the caller then keeps the position unresolved and says so.
export function resolveOutcome(position: PolymarketPosition, market: Market): PolymarketPosition | null {
  if (market.ref.marketId !== position.market.marketId) return null;
  const outcome = market.outcomes.find((candidate) => candidate.tokenId === position.outcome.tokenId);
  if (outcome === undefined) return null;
  return {
    ...position,
    market: market.ref,
    outcome: { ...position.outcome, index: outcome.index, role: outcome.role, label: outcome.label },
  };
}
