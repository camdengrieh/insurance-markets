// The order ticket's arithmetic (docs/dapp-design.md 7.2 M4-8): what the page shows BEFORE it asks anyone to
// prepare anything, computed with the plugin's own integer code (src/xo/signing/amounts.ts), so the number on the
// ticket and the relay's `quote.max_outlay_usd` come from the same rule and can be compared digit for digit.
//
// Rules the numbers follow (SI-2, RT-3):
//   - a BUY counts its principal plus the fee bound at the contract's hard ceiling, 1,000 bps (principal x 1.10);
//   - a SELL moves no cash out, so its outlay is "0"; what it counts against the caps is the larger of its
//     expected proceeds and its shares at the 1.00 USD face value.
// The fee is a CEILING, not a quote: XO's real fee is unreconciled until a fill (T3c), and the page says so.
//
// Money is bigint micro-USDC.e and exact decimal strings; there is no floating point here. Every failure is a
// fixed sentence that never echoes the input.

import { formatAtomic } from "@shared/guardrails/amount";
import { USDC_E_DECIMALS } from "@shared/xo/chain/constants";
import { ORDER_CAP_FEE_BPS, computeOrderAmounts, exactShareStepMicro, formatMicro, formatTick, orderCapAmount, parsePriceToTick } from "@shared/xo/signing/amounts";
import { SIDE_BUY, SIDE_SELL } from "@shared/xo/signing/constants";
import { SigningError } from "@shared/xo/signing/errors";

export const TICKET_SIDES = ["BUY", "SELL"] as const;
export type TicketSide = (typeof TICKET_SIDES)[number];
export const TICKET_TIFS = ["GTD", "FOK", "FAK"] as const;
export type TicketTif = (typeof TICKET_TIFS)[number];

// The longest an order may live here. The operator's XO_ORDER_EXPIRY_SECONDS can lower it; the plugin's own
// ceiling is one hour (src/config.ts CEILINGS.orderExpirySeconds, which the page cannot import).
export const MAX_TTL_S = 3600;
export const MIN_TTL_S = 1;

export interface TicketInput {
  readonly tokenId: string;
  readonly side: string;
  readonly price: string;
  readonly shares: string;
  readonly tif: string;
  // "" = the relay's default life.
  readonly ttlS: string;
  readonly postOnly: boolean;
}

export type TicketField = "token" | "side" | "price" | "shares" | "tif" | "ttl" | "post_only";

export interface TicketIssue {
  readonly field: TicketField;
  readonly code: string;
  readonly message: string;
}

export interface Ticket {
  readonly tokenId: string;
  readonly side: TicketSide;
  // Canonical forms ("0.4" becomes "0.4", "0.40" becomes "0.4"), exactly as the relay writes them.
  readonly price: string;
  readonly shares: string;
  readonly priceTick: number;
  readonly sharesMicro: bigint;
  readonly principalAtomic: bigint;
  readonly capAtomic: bigint;
  // BUY: the most cash that can leave. SELL: null (no cash leaves).
  readonly maxOutlayAtomic: bigint | null;
  readonly minProceedsAtomic: bigint | null;
  readonly feeBps: number;
  readonly tif: TicketTif;
  readonly ttlS: number | null;
  readonly postOnly: boolean;
}

export type TicketResult = { readonly ok: true; readonly ticket: Ticket } | { readonly ok: false; readonly issues: readonly TicketIssue[] };

export const usdText = (atomic: bigint): string => formatAtomic(atomic, USDC_E_DECIMALS);

const TOKEN_ID = /^[1-9][0-9]{0,77}$/;

function issue(field: TicketField, code: string, message: string): TicketIssue {
  return { field, code, message };
}

function isSide(value: string): value is TicketSide {
  return (TICKET_SIDES as readonly string[]).includes(value);
}

function isTif(value: string): value is TicketTif {
  return (TICKET_TIFS as readonly string[]).includes(value);
}

// Validates the form's strings and computes the ticket. All issues are collected so the form can say them at once.
export function buildTicket(input: TicketInput): TicketResult {
  const issues: TicketIssue[] = [];
  if (!TOKEN_ID.test(input.tokenId)) issues.push(issue("token", "bad_token", "The outcome token is a whole number, such as the token id shown with a market's outcomes."));
  if (!isSide(input.side)) issues.push(issue("side", "bad_side", "Choose BUY or SELL."));
  const tif: TicketTif = isTif(input.tif) ? input.tif : "GTD";
  if (!isTif(input.tif)) issues.push(issue("tif", "bad_tif", "Choose GTD, FOK or FAK."));
  let ttlS: number | null = null;
  if (input.ttlS !== "") {
    if (!/^[1-9][0-9]{0,5}$/.test(input.ttlS) || Number(input.ttlS) < MIN_TTL_S || Number(input.ttlS) > MAX_TTL_S) {
      issues.push(issue("ttl", "bad_ttl", `The order's life is a whole number of seconds from ${MIN_TTL_S} to ${MAX_TTL_S}. A signed order cannot be cancelled on chain, so keep it short.`));
    } else {
      ttlS = Number(input.ttlS);
    }
  }
  if (input.postOnly && tif !== "GTD") issues.push(issue("post_only", "post_only_needs_gtd", "Post-only applies to GTD orders only."));

  let priceTick = 0;
  try {
    priceTick = parsePriceToTick(input.price);
  } catch (error) {
    if (!(error instanceof SigningError)) throw error;
    issues.push(issue("price", "bad_price", "The price is a plain decimal from 0.001 to 0.999 in steps of 0.001."));
  }

  let sharesMicro = 0n;
  let principal = 0n;
  let cap: ReturnType<typeof orderCapAmount> | null = null;
  if (issues.length === 0 && isSide(input.side)) {
    try {
      const amounts = computeOrderAmounts({ side: input.side === "BUY" ? SIDE_BUY : SIDE_SELL, price: input.price, shares: input.shares });
      sharesMicro = amounts.sharesMicro;
      principal = amounts.collateralMicro;
      priceTick = amounts.priceTick;
      cap = orderCapAmount({ side: amounts.side, makerAmount: amounts.makerAmount, takerAmount: amounts.takerAmount, feeBps: ORDER_CAP_FEE_BPS });
    } catch (error) {
      if (!(error instanceof SigningError)) throw error;
      switch (error.code) {
        case "inexact_amount":
          issues.push(issue("shares", "inexact_amount", `At this price, shares must be a multiple of ${formatMicro(exactShareStepMicro(priceTick))} so the cash amount is exact.`));
          break;
        case "below_minimum":
          issues.push(issue("shares", "below_minimum", "The order is below the minimum: at least 1 share, at least 0.30 USDC.e of notional, and for a SELL at least 0.30 after the fee bound."));
          break;
        default:
          issues.push(issue("shares", "bad_shares", "Shares are a plain decimal in steps of 0.001, such as 10 or 2.5."));
      }
    }
  } else if (issues.every((entry) => entry.field !== "shares")) {
    // Still check the shares text on its own so the form can flag it alongside other issues.
    if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(input.shares) || input.shares.length > 40) issues.push(issue("shares", "bad_shares", "Shares are a plain decimal in steps of 0.001, such as 10 or 2.5."));
  }
  if (issues.length > 0 || cap === null || !isSide(input.side)) return { ok: false, issues };

  return {
    ok: true,
    ticket: Object.freeze({
      tokenId: input.tokenId,
      side: input.side,
      price: formatTick(priceTick),
      shares: formatMicro(sharesMicro),
      priceTick,
      sharesMicro,
      principalAtomic: principal,
      capAtomic: cap.capAtomic,
      maxOutlayAtomic: cap.maxOutlayAtomic,
      minProceedsAtomic: cap.minProceedsAtomic,
      feeBps: cap.feeBps,
      tif,
      ttlS,
      postOnly: input.postOnly,
    }),
  };
}

// What the relay's quote must say about this ticket: the strings the page compares digit for digit.
export interface ExpectedQuote {
  readonly price: string;
  readonly shares: string;
  readonly maxOutlayUsd: string;
  readonly reservedUsd: string;
  readonly feeBoundBps: number;
}

export function expectedQuote(ticket: Ticket): ExpectedQuote {
  return {
    price: ticket.price,
    shares: ticket.shares,
    // A SELL quotes "0": no cash leaves the account.
    maxOutlayUsd: ticket.maxOutlayAtomic === null ? "0" : usdText(ticket.maxOutlayAtomic),
    reservedUsd: usdText(ticket.capAtomic),
    feeBoundBps: ticket.feeBps,
  };
}

// The per-order cap the account read reports (a decimal string), compared exactly. null = not read.
export function overOrderCap(ticket: Ticket, maxOrderUsd: string | null): boolean | null {
  if (maxOrderUsd === null) return null;
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/.exec(maxOrderUsd);
  if (match === null) return null;
  const limit = BigInt(`${match[1] ?? "0"}${(match[2] ?? "").padEnd(6, "0")}`);
  return ticket.capAtomic > limit;
}
