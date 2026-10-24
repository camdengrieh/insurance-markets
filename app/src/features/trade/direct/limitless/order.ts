// A Limitless order on the direct path, built from the same SDK code as the server-side flow (relay/clob.ts
// prepareOrder and buildPost): an EOA order (signatureType 0, maker = signer = the trading key, taker zero, expiration 0,
// nonce 0) on Base 8453 for the market's pinned exchange, the ticket's exact amounts (sdk/trade/clob/amounts.ts via
// clob-ticket.ts), a fresh non-zero 48-bit salt, and the fee rate the market's record gives (venue.ts). The key signs
// sdk/trade/clob/limitless/order.ts buildLimitlessOrderTypedData; the digest is hashLimitlessOrder over the same order.
//
// The body our partner relay takes (docs/unified-account-design.md section 3.2) is {account, order, orderType,
// marketSlug}; the relay adds ownerId and onBehalfOf from its own record of the account (note 44 section 3.1 step 3).
// Inside `order`, limitlessOrderToWire's fields with the integer fields Limitless's schema types as numbers
// (makerAmount, takerAmount, nonce, feeRateBps) sent as JSON numbers, `expiration` as the string "0", the decimal
// `price` GTC and FAK orders require, and the signature. Nothing about this body has been accepted by Limitless yet; a
// refusal comes back in the venue's own words.
//
// Only GTC and FAK are built: a FOK order is signed with a different amount form (takerAmount 1, no price) that the SDK
// builder does not make.

import { buildLimitlessOrderTypedData, hashLimitlessOrder, limitlessOrderDomain, limitlessOrderToWire, type LimitlessOrder } from "@sdk/trade/clob/limitless/order";
import { SigningError } from "@sdk/trade/xo/errors";
import { zeroAddress, type Hex } from "viem";

import type { ClobTicket } from "../../clob-ticket";
import { ok, refuse, type DirectAccount, type DirectResult } from "../types";
import type { LimitlessMarketFacts } from "./venue";

export const LIMITLESS_DIRECT_TIFS = ["GTC", "FAK"] as const;
export type LimitlessDirectTif = (typeof LIMITLESS_DIRECT_TIFS)[number];

export interface LimitlessOrderPlan {
  readonly order: LimitlessOrder;
  readonly exchange: LimitlessMarketFacts["exchange"];
  readonly slug: string;
  readonly tif: LimitlessDirectTif;
  readonly postOnly: boolean;
  // The ticket's canonical price ("0.5"), sent beside the signed order.
  readonly price: string;
  readonly feeRateBps: number;
  // Where the fee rate came from, for the card.
  readonly feeSource: LimitlessMarketFacts["fee"];
  // The order's EIP-712 hash: what the key signs and the card shows.
  readonly digest: Hex;
  readonly typedData: ReturnType<typeof buildLimitlessOrderTypedData>;
  readonly domain: ReturnType<typeof limitlessOrderDomain>;
}

// The fee rate to sign: 0 unless the market charges its owner's own rate, then the rate the executor knows for the
// account (0 until the venue names another).
export function signedFeeRate(market: LimitlessMarketFacts, knownRateBps: number): number {
  return market.fee === "on" ? knownRateBps : 0;
}

export function planLimitlessOrder(input: { readonly ticket: ClobTicket; readonly account: DirectAccount; readonly market: LimitlessMarketFacts; readonly feeRateBps: number; readonly salt: bigint }): DirectResult<LimitlessOrderPlan> {
  const { ticket, account, market } = input;
  if (ticket.venue !== "limitless" || ticket.marketId !== market.slug) return refuse("invalid_order", "This ticket is not for this Limitless market.");
  if (!(LIMITLESS_DIRECT_TIFS as readonly string[]).includes(ticket.tif)) return refuse("invalid_order", "Limitless orders here are good-until-cancelled or fill-and-kill: a fill-or-kill order is signed with a different amount form.");
  if (ticket.postOnly) return refuse("invalid_order", "Post-only orders are not sent to Limitless from this page.");
  if (ticket.ttlS !== null) return refuse("invalid_order", "Limitless orders carry no expiry.");
  if (account.signatureType !== 0 || account.maker.toLowerCase() !== account.signer.toLowerCase()) return refuse("account_refused", "Limitless takes orders your trading key makes and signs itself (an EOA order) only.");
  if (!Number.isSafeInteger(input.feeRateBps) || input.feeRateBps < 0 || input.feeRateBps > 10_000) return refuse("invalid_order", "The fee rate to sign is not a rate.");
  const feeRateBps = signedFeeRate(market, input.feeRateBps);
  const order: LimitlessOrder = {
    salt: input.salt,
    maker: account.maker,
    signer: account.signer,
    taker: zeroAddress,
    tokenId: BigInt(ticket.tokenId),
    makerAmount: ticket.amounts.makerAmount,
    takerAmount: ticket.amounts.takerAmount,
    expiration: 0n,
    nonce: 0n,
    feeRateBps: BigInt(feeRateBps),
    side: ticket.side === "BUY" ? 0 : 1,
    signatureType: 0,
  };
  // The JSON body carries the amounts as numbers: refuse rather than lose a digit.
  if (order.makerAmount > BigInt(Number.MAX_SAFE_INTEGER) || order.takerAmount > BigInt(Number.MAX_SAFE_INTEGER)) return refuse("invalid_order", "The order is too large to send to Limitless exactly.");
  try {
    return ok({
      order,
      exchange: market.exchange,
      slug: market.slug,
      tif: ticket.tif as LimitlessDirectTif,
      postOnly: false,
      price: ticket.price,
      feeRateBps,
      feeSource: market.fee,
      digest: hashLimitlessOrder(order, market.exchange),
      typedData: buildLimitlessOrderTypedData(order, market.exchange),
      domain: limitlessOrderDomain(market.exchange),
    });
  } catch (error) {
    if (error instanceof SigningError) return refuse("invalid_order", "The order could not be built from this ticket and account.", error.message);
    throw error;
  }
}

// The same order signed at another fee rate (a FEE_RATE_MISMATCH answer), with a fresh hash; everything else unchanged.
export function withFeeRate(plan: LimitlessOrderPlan, feeRateBps: number): LimitlessOrderPlan {
  const order: LimitlessOrder = { ...plan.order, feeRateBps: BigInt(feeRateBps) };
  return { ...plan, order, feeRateBps, digest: hashLimitlessOrder(order, plan.exchange), typedData: buildLimitlessOrderTypedData(order, plan.exchange) };
}

// The exact body of POST /v1/relay/limitless/orders, with the key's signature.
export function limitlessOrderBody(plan: LimitlessOrderPlan, signature65: Hex): string {
  const wire = limitlessOrderToWire(plan.order);
  const order = {
    salt: wire.salt,
    maker: wire.maker,
    signer: wire.signer,
    taker: wire.taker,
    tokenId: wire.tokenId,
    makerAmount: Number(wire.makerAmount),
    takerAmount: Number(wire.takerAmount),
    expiration: wire.expiration,
    nonce: Number(wire.nonce),
    price: Number(plan.price),
    feeRateBps: Number(wire.feeRateBps),
    side: wire.side,
    signature: signature65,
    signatureType: wire.signatureType,
  };
  return JSON.stringify({ account: plan.order.signer, order, orderType: plan.tif, marketSlug: plan.slug });
}
