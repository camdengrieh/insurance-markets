// A Limitless order on the direct path, built from the same SDK code as the server-side flow (relay/clob.ts
// prepareOrder and buildPost): an EOA order (signatureType 0, maker = signer = the wallet, taker zero, expiration 0,
// nonce 0) on Base 8453 for the market's pinned exchange, the ticket's exact amounts (sdk/trade/clob/amounts.ts via
// clob-ticket.ts), a fresh non-zero 48-bit salt, and the fee rate the market's record and the visitor's profile give
// (venue.ts). The wallet signs sdk/trade/clob/limitless/order.ts buildLimitlessOrderTypedData; the digest on the card is
// hashLimitlessOrder over the same order.
//
// The body of POST /orders follows the venue's OpenAPI as read 2026-10-23 (CreateOrderDto and Order, both
// additionalProperties false): top-level `order`, `ownerId` (required: the profile id), `orderType`, `marketSlug` and
// `postOnly` when set; inside `order`, limitlessOrderToWire's fields with the integer fields the schema types as numbers
// (makerAmount, takerAmount, nonce, feeRateBps) sent as JSON numbers, `expiration` as the string "0", the decimal
// `price` GTC and FAK orders require, and the signature. Nothing about this body has been accepted by Limitless from
// this page yet; a refusal comes back in the venue's own words.
//
// Only GTC and FAK are built: a FOK order is signed with a different amount form (takerAmount 1, no price) that the SDK
// builder does not make.

import { buildLimitlessOrderTypedData, hashLimitlessOrder, limitlessOrderDomain, limitlessOrderToWire, type LimitlessOrder } from "@sdk/trade/clob/limitless/order";
import { SigningError } from "@sdk/trade/xo/errors";
import { zeroAddress, type Hex } from "viem";

import type { ClobTicket } from "../../clob-ticket";
import { ok, refuse, type DirectAccount, type DirectResult } from "../types";
import type { LimitlessMarketFacts, LimitlessProfile } from "./venue";

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
  readonly ownerId: number;
  readonly feeRateBps: number;
  // Where the fee rate came from, for the card.
  readonly feeSource: LimitlessMarketFacts["fee"];
  // The order's EIP-712 hash: what the wallet signs and the card shows.
  readonly digest: Hex;
  readonly typedData: ReturnType<typeof buildLimitlessOrderTypedData>;
  readonly domain: ReturnType<typeof limitlessOrderDomain>;
}

// The fee rate to sign, or why there is none.
export function signedFeeRate(market: LimitlessMarketFacts, profile: LimitlessProfile): DirectResult<number> {
  if (market.fee !== "on") return ok(0);
  if (profile.feeRateBps === null) return refuse("invalid_order", "This market charges a fee and your Limitless profile has no fee rate (no rank yet), so the rate to sign is unknown. Nothing was built.");
  return ok(profile.feeRateBps);
}

export function planLimitlessOrder(input: { readonly ticket: ClobTicket; readonly account: DirectAccount; readonly market: LimitlessMarketFacts; readonly profile: LimitlessProfile; readonly salt: bigint }): DirectResult<LimitlessOrderPlan> {
  const { ticket, account, market, profile } = input;
  if (ticket.venue !== "limitless" || ticket.marketId !== market.slug) return refuse("invalid_order", "This ticket is not for this Limitless market.");
  if (!(LIMITLESS_DIRECT_TIFS as readonly string[]).includes(ticket.tif)) return refuse("invalid_order", "This page builds GTC and FAK orders for Limitless only: a FOK order is signed with a different amount form.");
  if (ticket.postOnly && ticket.tif !== "GTC") return refuse("invalid_order", "Limitless takes post-only on a GTC order only.");
  if (ticket.ttlS !== null) return refuse("invalid_order", "Limitless orders carry no expiry.");
  if (account.signatureType !== 0 || account.maker.toLowerCase() !== account.signer.toLowerCase()) return refuse("account_refused", "Limitless takes orders your own wallet makes and signs (an EOA order) only.");
  const fee = signedFeeRate(market, profile);
  if (!fee.ok) return fee;
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
    feeRateBps: BigInt(fee.value),
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
      postOnly: ticket.postOnly,
      price: ticket.price,
      ownerId: profile.id,
      feeRateBps: fee.value,
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

// The exact POST /orders body, with the wallet's signature.
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
  return JSON.stringify({ order, ownerId: plan.ownerId, orderType: plan.tif, marketSlug: plan.slug, ...(plan.postOnly ? { postOnly: true } : {}) });
}
