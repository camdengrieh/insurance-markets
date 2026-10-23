// A Polymarket order on the direct path, built exactly as the relay builds it (relay/clob.ts prepareOrder and
// buildPost) from the same SDK code: the ticket's exact amounts (sdk/trade/clob/amounts.ts via clob-ticket.ts), the
// venue's clock for the timestamp (milliseconds) and a GTD order's expiration (seconds), a fresh non-zero 48-bit salt,
// zero metadata and builder, and the exchange of the market's book. Which book: Exchange V3 for a Protocol V2 market
// (Gamma `version: "v2"`, from the market record the page already holds), else the neg-risk CTF exchange when the live
// book or the market record says neg_risk, else the CTF exchange (the relay's rule, readPolymarketMarket).
//
// The wire body is the relay's: {order: polymarketOrderToWire + signature, owner: the API key id, orderType, postOnly
// when set}. A Deposit Wallet order's signature is the owner's 65 bytes wrapped for the wallet's ERC-1271 check.

import { formatMicro, parseTickMicro } from "@sdk/trade/clob/amounts";
import { hashPolymarketOrder, polymarketOrderDomain, polymarketOrderToWire, polymarketOrderWalletTypedData, polymarketSigningDigest, wrapPolymarketDepositWalletSignature, type PolymarketOrder } from "@sdk/trade/clob/polymarket/order";
import { POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET, polymarketTickRule, type ClobTif, type PolymarketBook } from "@sdk/trade/clob/venues";
import { SigningError } from "@sdk/trade/xo/errors";
import { decToAtomic } from "../../../../core/money";
import type { Hex } from "viem";

import type { ClobMarketFacts, ClobTicket } from "../../clob-ticket";
import { ok, refuse, type DirectAccount, type DirectResult } from "../types";
import type { PolymarketBookRead } from "./api";

const ZERO32: Hex = `0x${"00".repeat(32)}`;
// The relay's default life of a GTD order without one (relay/clob.ts DEFAULT_GTD_TTL_S).
export const DEFAULT_GTD_TTL_S = 300;

// A fresh salt: 48 random bits, never zero (relay/clob.ts nonZeroSalt; well inside Number.MAX_SAFE_INTEGER).
export function saltFrom(randomBytes: (length: number) => Uint8Array): bigint {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bytes = randomBytes(6);
    let value = 0n;
    for (const byte of bytes) value = (value << 8n) | BigInt(byte);
    if (value > 0n) return value;
  }
  throw new Error("the random source returned zeros");
}

// Which exchange the order is signed for, after the live book agrees with the ticket. A tick or a market that moved
// since the ticket was built is a refusal: the visitor re-enters the order.
export function decideBook(facts: ClobMarketFacts, ticket: ClobTicket, live: PolymarketBookRead): DirectResult<PolymarketBook> {
  if (live.market.toLowerCase() !== facts.marketId.toLowerCase()) return refuse("invalid_order", "The outcome token's book belongs to another market than this one, so nothing was signed.");
  if (polymarketTickRule(live.tick) === undefined) return refuse("invalid_order", "The market's tick is not one this page knows, so nothing was signed.");
  if (parseTickMicro(live.tick) !== parseTickMicro(ticket.tick)) return refuse("invalid_order", `The market's tick is now ${live.tick}, not the ${ticket.tick} this ticket was built on. Enter the price again.`);
  const minimum = decToAtomic(live.minSize, 6);
  if (minimum.ok && ticket.amounts.sharesMicro < minimum.value) return refuse("invalid_order", `The market's minimum order is now ${live.minSize} shares.`);
  return ok(facts.polymarketBook === "v2" ? "v2" : live.negRisk || facts.polymarketBook === "neg_risk" ? "neg_risk" : "ctf");
}

export interface PolymarketOrderPlan {
  readonly order: PolymarketOrder;
  readonly book: PolymarketBook;
  readonly tif: ClobTif;
  readonly postOnly: boolean;
  // Unix seconds; 0 for every type but GTD.
  readonly expiration: bigint;
  // The venue's id for the order (its EIP-712 hash), and what the wallet signs (the same, or the TypedDataSign digest).
  readonly orderHash: Hex;
  readonly digest: Hex;
  readonly typedData: ReturnType<typeof polymarketOrderWalletTypedData>;
  readonly domain: ReturnType<typeof polymarketOrderDomain>;
}

export function planPolymarketOrder(input: { readonly ticket: ClobTicket; readonly account: DirectAccount; readonly book: PolymarketBook; readonly nowS: number; readonly salt: bigint }): DirectResult<PolymarketOrderPlan> {
  const { ticket, account, book } = input;
  if (ticket.venue !== "polymarket") return refuse("invalid_order", "This ticket is not a Polymarket order.");
  const ttl = ticket.tif === "GTD" ? (ticket.ttlS ?? DEFAULT_GTD_TTL_S) : null;
  const order: PolymarketOrder = {
    salt: input.salt,
    maker: account.maker,
    signer: account.signatureType === POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET ? account.maker : account.signer,
    tokenId: BigInt(ticket.tokenId),
    makerAmount: ticket.amounts.makerAmount,
    takerAmount: ticket.amounts.takerAmount,
    side: ticket.side === "BUY" ? 0 : 1,
    signatureType: account.signatureType,
    timestamp: BigInt(input.nowS) * 1000n,
    metadata: ZERO32,
    builder: ZERO32,
  };
  try {
    return ok({
      order,
      book,
      tif: ticket.tif,
      postOnly: ticket.postOnly,
      expiration: ttl === null ? 0n : BigInt(input.nowS + ttl),
      orderHash: hashPolymarketOrder(order, book),
      digest: polymarketSigningDigest(order, book),
      typedData: polymarketOrderWalletTypedData(order, book),
      domain: polymarketOrderDomain(book),
    });
  } catch (error) {
    if (error instanceof SigningError) return refuse("invalid_order", "The order could not be built from this ticket and account.", error.message);
    throw error;
  }
}

// The exact POST /order body, with the signature the venue checks.
export function polymarketOrderBody(plan: PolymarketOrderPlan, signature65: Hex, apiKey: string): string {
  const venueSignature = plan.order.signatureType === POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET ? wrapPolymarketDepositWalletSignature(signature65, plan.order, plan.book) : signature65;
  const wire = { ...polymarketOrderToWire(plan.order, plan.expiration), signature: venueSignature };
  return JSON.stringify({ order: wire, owner: apiKey, orderType: plan.tif, ...(plan.postOnly ? { postOnly: true } : {}) });
}

export function microText(micro: bigint | null): string | null {
  return micro === null ? null : formatMicro(micro);
}
