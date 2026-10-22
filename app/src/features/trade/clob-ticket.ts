// The venue order ticket's arithmetic for Polymarket and Limitless: what the page shows BEFORE it asks the daemon to
// prepare anything, computed with the plugin's own integer code (src/clob/amounts.ts), so the numbers on the ticket
// and the relay's `quote` come from the same rule and can be compared digit for digit. The XO ticket (ticket.ts) is
// untouched; this file is its venue counterpart.
//
// Rules the numbers follow (src/clob/venues.ts):
//   - the price is on the market's tick, with the decimals that tick allows; the size has at most two decimals;
//   - a BUY counts its principal plus the 1,000 bps POLICY fee ceiling (not the venue's quote); a SELL counts the
//     larger of its expected proceeds and its shares at the 1.00 face value;
//   - the two signed amounts are exact: shares x price is a whole number of 6-decimal units or the ticket refuses.
// Money is bigint micro units and exact decimal strings; there is no floating point here.

import { checkLimitlessAmounts, clobCapAmount, computeClobAmounts, formatMicro, parseTickMicro, type ClobAmounts } from "@shared/clob/amounts";
import { depositWalletAddress } from "@shared/clob/polymarket/deposit-wallet";
import {
  CLOB_CAP_FEE_BPS,
  LIMITLESS_PRICE_TICK,
  LIMITLESS_ORDER_DOMAIN_NAME,
  LIMITLESS_MIN_MAKER_AMOUNT,
  LIMITLESS_ORDER_DOMAIN_VERSION,
  LIMITLESS_TIFS,
  POLYMARKET_EXCHANGES,
  POLYMARKET_TIFS,
  polymarketTickRule,
  type ClobTif,
  type ClobVenue,
} from "@shared/clob/venues";
import { SIDE_BUY, SIDE_SELL } from "@shared/xo/signing/constants";
import { SigningError } from "@shared/xo/signing/errors";

import { decToAtomic } from "../../core/money";
import type { Market } from "../../core/ports";
import type { SignCell } from "./ticket";

export const CLOB_TICKET_SIDES = ["BUY", "SELL"] as const;
export type ClobTicketSide = (typeof CLOB_TICKET_SIDES)[number];
export const CLOB_SIZE_DECIMALS = 2;
// place-orders.md: a GTD expiration must lie at least three minutes ahead and expires a minute early.
export const POLYMARKET_GTD_MIN_TTL_S = 240;
export const CLOB_MAX_TTL_S = 3600;

// The venue facts the ticket is built against, taken from the market record the modal already holds.
export interface ClobMarketFacts {
  readonly venue: ClobVenue;
  readonly marketId: string;
  readonly tick: string;
  // Shares; "0" when the venue states none.
  readonly minSize: string;
  // Polymarket: which exchange the relay is expected to sign for, from the market's `version` and `negRisk`
  // (Gamma); shown on the preview, decided by the relay from its own read.
  readonly polymarketBook: "v2" | "ctf" | "neg_risk" | null;
  readonly fetchedAtMs: number;
}

const DECIMAL = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/;

// Reads the facts out of a Market. A tick that is a range table (Kalshi) or not a plain step is refused: null.
export function clobMarketFacts(market: Market): ClobMarketFacts | null {
  const venue = market.ref.venue;
  if (venue !== "polymarket" && venue !== "limitless") return null;
  const tick = typeof market.tick === "string" ? market.tick : null;
  if (tick === null || !/^0\.[0-9]{1,6}$/.test(tick)) return null;
  if (venue === "polymarket" && polymarketTickRule(tick) === undefined) return null;
  const minSize = market.minSize !== undefined && DECIMAL.test(market.minSize) ? market.minSize : "0";
  const version = market.ref.native["version"];
  const negRisk = market.ref.native["negRisk"] === "true";
  const polymarketBook = venue === "polymarket" ? (version === "v2" ? "v2" : negRisk ? "neg_risk" : "ctf") : null;
  return { venue, marketId: market.ref.marketId, tick: venue === "limitless" ? LIMITLESS_PRICE_TICK : tick, minSize, polymarketBook, fetchedAtMs: market.prov.fetchedAtMs };
}

export function tifsFor(venue: ClobVenue): readonly ClobTif[] {
  return venue === "polymarket" ? POLYMARKET_TIFS : LIMITLESS_TIFS;
}

export interface ClobTicketInput {
  readonly tokenId: string;
  readonly side: string;
  readonly price: string;
  readonly shares: string;
  readonly tif: string;
  // Polymarket GTD only; "" = the relay's default.
  readonly ttlS: string;
  readonly postOnly: boolean;
}

export type ClobTicketField = "token" | "side" | "price" | "shares" | "tif" | "ttl" | "post_only";

export interface ClobTicketIssue {
  readonly field: ClobTicketField;
  readonly code: string;
  readonly message: string;
}

export interface ClobTicket {
  readonly venue: ClobVenue;
  readonly marketId: string;
  readonly tokenId: string;
  readonly side: ClobTicketSide;
  // Canonical forms, exactly as the relay writes them back.
  readonly price: string;
  readonly shares: string;
  readonly amounts: ClobAmounts;
  readonly principalAtomic: bigint;
  readonly capAtomic: bigint;
  readonly maxOutlayAtomic: bigint | null;
  readonly minProceedsAtomic: bigint | null;
  readonly feeBps: number;
  readonly tif: ClobTif;
  readonly ttlS: number | null;
  readonly postOnly: boolean;
  readonly tick: string;
  readonly minSize: string;
}

export type ClobTicketResult = { readonly ok: true; readonly ticket: ClobTicket } | { readonly ok: false; readonly issues: readonly ClobTicketIssue[] };

const TOKEN_ID = /^[1-9][0-9]{0,77}$/;

function issue(field: ClobTicketField, code: string, message: string): ClobTicketIssue {
  return { field, code, message };
}

function isSide(value: string): value is ClobTicketSide {
  return (CLOB_TICKET_SIDES as readonly string[]).includes(value);
}

function priceDecimalsOf(facts: ClobMarketFacts): number {
  if (facts.venue === "polymarket") return polymarketTickRule(facts.tick)?.priceDecimals ?? 2;
  return parseTickMicro(facts.tick) >= 1_000n ? 3 : 4;
}

export function buildClobTicket(input: ClobTicketInput, facts: ClobMarketFacts): ClobTicketResult {
  const issues: ClobTicketIssue[] = [];
  const tifs = tifsFor(facts.venue);
  if (!TOKEN_ID.test(input.tokenId)) issues.push(issue("token", "bad_token", "The outcome token is a whole number, such as the token id shown with a market's outcomes."));
  if (!isSide(input.side)) issues.push(issue("side", "bad_side", "Choose Buy or Sell."));
  const tif: ClobTif = (tifs as readonly string[]).includes(input.tif) ? (input.tif as ClobTif) : "GTC";
  if (!(tifs as readonly string[]).includes(input.tif)) issues.push(issue("tif", "bad_tif", `Choose one of ${tifs.join(", ")}.`));
  let ttlS: number | null = null;
  if (input.ttlS !== "") {
    if (tif !== "GTD") issues.push(issue("ttl", "ttl_needs_gtd", "Only a GTD order has a lifetime; the other types carry no expiry."));
    else if (!/^[1-9][0-9]{0,5}$/.test(input.ttlS) || Number(input.ttlS) < POLYMARKET_GTD_MIN_TTL_S || Number(input.ttlS) > CLOB_MAX_TTL_S) {
      issues.push(issue("ttl", "bad_ttl", `A GTD order's life is a whole number of seconds from ${POLYMARKET_GTD_MIN_TTL_S} to ${CLOB_MAX_TTL_S}. The venue enforces it; it is not in the signed order.`));
    } else ttlS = Number(input.ttlS);
  }
  if (input.postOnly && tif !== "GTC" && tif !== "GTD") issues.push(issue("post_only", "post_only_needs_resting", "Post-only applies to a resting (GTC or GTD) order only."));

  let amounts: ClobAmounts | null = null;
  let cap: ReturnType<typeof clobCapAmount> | null = null;
  if (isSide(input.side)) {
    try {
      const minMicro = ((): bigint => {
        const parsed = decToAtomic(facts.minSize, 6);
        if (!parsed.ok) throw new SigningError("invalid_size", "the market's minimum size is not a plain decimal with at most 6 places");
        return parsed.value;
      })();
      amounts = computeClobAmounts({ side: input.side === "BUY" ? SIDE_BUY : SIDE_SELL, price: input.price, shares: input.shares, grid: { tick: facts.tick, priceDecimals: priceDecimalsOf(facts) }, sizeDecimals: CLOB_SIZE_DECIMALS, minSharesMicro: minMicro });
      cap = clobCapAmount(amounts, CLOB_CAP_FEE_BPS);
      if (facts.venue === "limitless") {
        // The venue's own floor and shares step (src/clob/venues.ts LIMITLESS_MIN_MAKER_AMOUNT, LIMITLESS_PRICE_TICK);
        // the relay applies the same check.
        try {
          checkLimitlessAmounts(amounts);
        } catch (error) {
          if (!(error instanceof SigningError)) throw error;
          issues.push(issue("shares", "below_venue_floor", `Limitless refuses an order whose maker amount is under ${LIMITLESS_MIN_MAKER_AMOUNT.toString()} raw units (${formatMicro(LIMITLESS_MIN_MAKER_AMOUNT)}); raise the size or the price.`));
        }
      }
    } catch (error) {
      if (!(error instanceof SigningError)) throw error;
      switch (error.code) {
        case "invalid_price":
          issues.push(issue("price", "bad_price", `The price is a plain decimal strictly between 0 and 1 on the market's ${facts.tick} tick.`));
          break;
        case "invalid_size":
          issues.push(issue("shares", "bad_shares", "Shares are a plain decimal with at most two places, such as 10 or 2.5."));
          break;
        case "below_minimum":
          issues.push(issue("shares", "below_minimum", `The order is below the market's minimum size of ${facts.minSize} shares.`));
          break;
        case "inexact_amount":
          issues.push(issue("shares", "inexact_amount", "Shares times price is not a whole number of 6-decimal units; the amount is never rounded."));
          break;
        default:
          issues.push(issue("shares", "bad_shares", "The order's amounts could not be computed."));
      }
    }
  }
  if (issues.length > 0 || amounts === null || cap === null || !isSide(input.side)) return { ok: false, issues };
  return {
    ok: true,
    ticket: Object.freeze({
      venue: facts.venue,
      marketId: facts.marketId,
      tokenId: input.tokenId,
      side: input.side,
      price: formatMicro(amounts.priceMicro),
      shares: formatMicro(amounts.sharesMicro),
      amounts,
      principalAtomic: amounts.collateralMicro,
      capAtomic: cap.capAtomic,
      maxOutlayAtomic: cap.maxOutlayAtomic,
      minProceedsAtomic: cap.minProceedsAtomic,
      feeBps: cap.feeBps,
      tif,
      ttlS,
      postOnly: input.postOnly,
      tick: facts.tick,
      minSize: facts.minSize,
    }),
  };
}

export interface ExpectedClobQuote {
  readonly venue: ClobVenue;
  readonly price: string;
  readonly shares: string;
  readonly maxOutlayUsd: string;
  readonly reservedUsd: string;
  readonly feeBoundBps: number;
}

export function expectedClobQuote(ticket: ClobTicket): ExpectedClobQuote {
  return {
    venue: ticket.venue,
    price: ticket.price,
    shares: ticket.shares,
    maxOutlayUsd: ticket.maxOutlayAtomic === null ? "0" : formatMicro(ticket.maxOutlayAtomic),
    reservedUsd: formatMicro(ticket.capAtomic),
    feeBoundBps: ticket.feeBps,
  };
}

// The per-order cap the account read reports, compared exactly. null = not read.
export function clobOverOrderCap(ticket: ClobTicket, maxOrderUsd: string | null): boolean | null {
  if (maxOrderUsd === null) return null;
  const limit = decToAtomic(maxOrderUsd, 6);
  return limit.ok ? ticket.capAtomic > limit.value : null;
}

// "What you sign": the signed fields the relay will put in the typed data, as far as the page can know them before
// the relay reads the market. Fixed app text; the values are the ticket's own numbers.
export interface SignedFieldLine {
  readonly label: string;
  readonly value: string;
  // Not known until the relay prepares (a salt, a timestamp, the exact exchange).
  readonly fromRelay?: boolean;
}

// Polymarket: which account makes the order is READ, not assumed. The relay reads Polygon at prepare: the owner's Deposit
// Wallet (one of the two addresses derived here from the owner) when one is deployed with Polymarket's proxy code and
// owned by the owner, signature type 3; the owner wallet itself, type 0, when neither address holds code; a refusal when
// the read fails. The page shows both possibilities and the derived addresses; the prepared item says which it was.
function depositWalletCandidatesText(owner: string | null): string | null {
  if (owner === null || !/^0x[0-9a-fA-F]{40}$/.test(owner)) return null;
  try {
    const address = owner as `0x${string}`;
    return `${depositWalletAddress(address, "beacon")} (beacon proxy) or ${depositWalletAddress(address, "uups")} (UUPS proxy), both derived from your wallet`;
  } catch {
    return null;
  }
}

export function signedFieldsPreview(ticket: ClobTicket, facts: ClobMarketFacts, owner: string | null): SignedFieldLine[] {
  const maker = owner ?? "your wallet address";
  const amounts: SignedFieldLine[] = [
    { label: "tokenId", value: ticket.tokenId },
    { label: "makerAmount", value: ticket.amounts.makerAmount.toString() },
    { label: "takerAmount", value: ticket.amounts.takerAmount.toString() },
    { label: "side", value: ticket.side === "BUY" ? "0 (BUY)" : "1 (SELL)" },
  ];
  if (ticket.venue === "polymarket") {
    const book = facts.polymarketBook ?? "ctf";
    const exchange = POLYMARKET_EXCHANGES[book];
    const candidates = depositWalletCandidatesText(owner);
    return [
      { label: "maker and signer", value: "your Polymarket Deposit Wallet when the relay finds one deployed and owned by your wallet on Polygon, otherwise your wallet itself", fromRelay: true },
      ...(candidates === null ? [] : [{ label: "your Deposit Wallet addresses", value: candidates }]),
      ...amounts,
      { label: "signatureType", value: "3 (Deposit Wallet) or 0 (EOA), from the same read", fromRelay: true },
      { label: "what your wallet signs", value: "type 3: a TypedDataSign wrapper (ERC-7739) with this order nested as its contents; type 0: the order itself" },
      { label: "salt", value: "a fresh random value", fromRelay: true },
      { label: "timestamp", value: "the venue's clock, in milliseconds", fromRelay: true },
      { label: "metadata, builder", value: "zero (no builder attribution)" },
      { label: "domain", value: `Polymarket CTF Exchange, version ${exchange.version}, chain 137, exchange ${exchange.verifyingContract} (${book === "v2" ? "Protocol V2 book" : book === "neg_risk" ? "neg-risk CTF book" : "CTF book"}; the relay decides from its own market read)` },
      { label: "expiration (wire only, not signed)", value: ticket.tif === "GTD" ? `${ticket.ttlS ?? 300} s from the venue's clock` : "none" },
    ];
  }
  return [
    { label: "maker and signer", value: maker },
    ...amounts,
    { label: "signatureType", value: "0 (EOA)" },
    { label: "salt", value: "a fresh random value", fromRelay: true },
    { label: "taker", value: "the zero address (open order)" },
    { label: "expiration, nonce", value: "0 and 0 (the venue's rule: no signed expiry)" },
    { label: "feeRateBps", value: "0 (COLLATERAL fee module; the relay refuses any other)" },
    { label: "domain", value: "Limitless CTF Exchange, version 1, chain 8453, the market's exchange (must be on the pinned list)" },
  ];
}

// The compact "What you sign" strip for a venue order: the domain the relay is expected to sign for (Polymarket's
// from the market's book, decided again by the relay from its own read), the side and the signature type, the two
// signed amounts worked out here, and the policy fee ceiling. Every value comes from the ticket or a pinned constant.
export function clobSignCells(ticket: ClobTicket | null, facts: ClobMarketFacts, side: string): SignCell[] {
  const wire = isSide(side) ? side : null;
  const domain =
    facts.venue === "polymarket"
      ? `Polymarket CTF Exchange v${POLYMARKET_EXCHANGES[facts.polymarketBook ?? "ctf"].version} · 137`
      : `${LIMITLESS_ORDER_DOMAIN_NAME} v${LIMITLESS_ORDER_DOMAIN_VERSION} · 8453`;
  const amounts =
    ticket === null
      ? null
      : ticket.side === "BUY"
        ? `${formatMicro(ticket.amounts.makerAmount)} USD → ${formatMicro(ticket.amounts.takerAmount)} shares`
        : `${formatMicro(ticket.amounts.makerAmount)} shares → ${formatMicro(ticket.amounts.takerAmount)} USD`;
  return [
    { label: "domain", value: domain, note: facts.venue === "polymarket" ? "the relay confirms the book from its own read" : "the market's exchange, on the pinned list" },
    // Limitless: an EOA order, type 0. Polymarket: type 3 (Deposit Wallet) or 0 (EOA), read from Polygon at prepare
    // (the same values the full preview below lists).
    { label: "side · type", value: wire === null ? null : facts.venue === "polymarket" ? `${wire} · type 3 or 0, read at prepare` : `${wire} · EOA, type 0`, missing: "choose a side" },
    { label: "maker → taker", value: amounts, missing: "complete the ticket first" },
    { label: "fee ceiling", value: `${CLOB_CAP_FEE_BPS.toLocaleString("en-US")} bps`, note: "policy ceiling, not the venue's quote", caution: true },
  ];
}

export const CLOB_FEE_CEILING_TEXT = `${CLOB_CAP_FEE_BPS.toLocaleString("en-US")} bps policy fee ceiling (above both venues' documented maxima; not a quote)`;

export function formatClobUsd(atomic: bigint): string {
  return formatMicro(atomic);
}
