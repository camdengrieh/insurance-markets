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

import { formatAtomic } from "@sdk/money/amount";
import { USDC_E_DECIMALS } from "@sdk/chain/xo/constants";
import { ORDER_CAP_FEE_BPS, computeOrderAmounts, exactShareStepMicro, formatMicro, formatTick, orderCapAmount, parsePriceToTick } from "@sdk/trade/xo/amounts";
import { KERNEL_DOMAIN_NAME, KERNEL_DOMAIN_VERSION, ORDER_DOMAIN_NAME, ORDER_DOMAIN_VERSION, SIDE_BUY, SIDE_SELL, XO_CHAIN_ID } from "@sdk/trade/xo/constants";
import { SigningError } from "@sdk/trade/xo/errors";

import { decToAtomic, isDec } from "../../core/money";

export const TICKET_SIDES = ["BUY", "SELL"] as const;
export type TicketSide = (typeof TICKET_SIDES)[number];
export const TICKET_TIFS = ["GTD", "FOK", "FAK"] as const;
export type TicketTif = (typeof TICKET_TIFS)[number];

// What a person reads for a wire value. The wire values above stay exactly as the builders and the relay expect them;
// only the words shown change ("Buy", not "BUY"; "Fill or kill (FOK)", not "FOK").
export const SIDE_LABEL: Readonly<Record<string, string>> = Object.freeze({ BUY: "Buy", SELL: "Sell" });
export const TIF_LABEL: Readonly<Record<string, string>> = Object.freeze({
  GTC: "Good till cancelled (GTC)",
  GTD: "Good till its expiry (GTD)",
  FOK: "Fill or kill (FOK)",
  FAK: "Fill and kill the rest (FAK)",
});

export function sideLabel(side: string): string {
  return Object.hasOwn(SIDE_LABEL, side) ? (SIDE_LABEL[side] ?? side) : "Buy";
}

export function tifLabel(tif: string): string {
  return Object.hasOwn(TIF_LABEL, tif) ? (TIF_LABEL[tif] ?? tif) : tif;
}

// One cell of the "What you sign" strip (Market.dc.html): a fixed label and a value worked out from the ticket, or
// null when the ticket is not complete yet. Nothing here is an example: a value the page cannot know is null and says
// why, or carries a note.
export interface SignCell {
  readonly label: string;
  readonly value: string | null;
  // Read aloud and shown in place of a null value.
  readonly missing?: string;
  readonly note?: string;
  readonly caution?: boolean;
}

// The XO strip: the order's EIP-712 domain, the side and signature type, the two signed amounts and the fee ceiling.
// XO wraps the order hash in the account's Kernel signature, and that wrapped hash only exists once the relay has
// prepared the order, so the strip says it cannot be shown here.
export function xoSignCells(ticket: Ticket | null, side: string, tif: string): SignCell[] {
  const wire = isSide(side) ? side : null;
  const kind = isTif(tif) ? tif : null;
  const amounts =
    ticket === null ? null : ticket.side === "BUY" ? `${usdText(ticket.principalAtomic)} USDC.e → ${formatMicro(ticket.sharesMicro)} shares` : `${formatMicro(ticket.sharesMicro)} shares → ${usdText(ticket.principalAtomic)} USDC.e`;
  return [
    { label: "domain", value: `${ORDER_DOMAIN_NAME} v${ORDER_DOMAIN_VERSION} · ${XO_CHAIN_ID}`, note: `wrapped by ${KERNEL_DOMAIN_NAME} ${KERNEL_DOMAIN_VERSION}: the wrapped hash cannot be shown here` },
    { label: "side · type", value: wire === null || kind === null ? null : `${wire} · ${kind}`, missing: "choose a side and a type" },
    { label: "maker → taker", value: amounts, missing: "complete the ticket first" },
    { label: "fee ceiling", value: `${ORDER_CAP_FEE_BPS.toLocaleString("en-US")} bps`, note: "unreconciled: a ceiling, not a quote", caution: true },
  ];
}

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
  if (!isSide(input.side)) issues.push(issue("side", "bad_side", "Choose Buy or Sell."));
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
    if (!isDec(input.shares, 6)) issues.push(issue("shares", "bad_shares", "Shares are a plain decimal in steps of 0.001, such as 10 or 2.5."));
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
  const limit = decToAtomic(maxOrderUsd, 6);
  return limit.ok ? ticket.capAtomic > limit.value : null;
}
