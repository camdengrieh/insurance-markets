import { hashStruct, hashTypedData, type Address, type Hex } from "viem";

import { ZERO_ADDRESS } from "../../xo/constants.js";
import { SigningError } from "../../xo/errors.js";
import { assertUint, normalizeAddress } from "../../xo/validate.js";
import { CLOB_CHAIN_IDS, LIMITLESS_ORDER_DOMAIN_NAME, LIMITLESS_ORDER_DOMAIN_VERSION, LIMITLESS_SIGNATURE_TYPE_EOA, isPinnedLimitlessExchange } from "../venues.js";

// The Limitless CLOB order, as docs.limitless.exchange/developers/eip712-signing defines it (read 2026-10-21): twelve
// signed fields "salt uint256, maker address, signer address, taker address, tokenId uint256, makerAmount uint256,
// takerAmount uint256, expiration uint256, nonce uint256, feeRateBps uint256, side uint8, signatureType uint8"; domain
// name "Limitless CTF Exchange", version "1", chainId 8453, verifyingContract from the market's venue data
// (`venue.exchange`). Conventions on the same page: taker is the zero address for open orders; nonce "must be 0.
// Non-zero values are rejected"; expiration "must be 0. Non-zero values are rejected"; signatureType 0 is an EOA
// signature; in EOA trading mode maker and signer are both the wallet address; feeRateBps is 0 on COLLATERAL
// fee-module venues and otherwise the owner's effectiveFeeRateBps (a mismatch answers 400 FEE_RATE_MISMATCH).
//
// No vector in this repository was signed by the venue. test/clob-limitless-order.test.ts derives the typehash and the
// digest by hand and says so in its test names.

export const LIMITLESS_ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
} as const;

export const LIMITLESS_ORDER_TYPE_STRING =
  "Order(uint256 salt,address maker,address signer,address taker,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint256 nonce,uint256 feeRateBps,uint8 side,uint8 signatureType)";

export type LimitlessOrder = {
  salt: bigint;
  maker: Address;
  signer: Address;
  taker: Address;
  tokenId: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
  expiration: bigint;
  nonce: bigint;
  feeRateBps: bigint;
  side: 0 | 1;
  signatureType: number;
};

export function limitlessOrderDomain(exchange: Address) {
  const verifyingContract = normalizeAddress(exchange, "exchange");
  if (!isPinnedLimitlessExchange(verifyingContract)) throw new SigningError("invalid_order", "the exchange address is not one this build is pinned to");
  return { name: LIMITLESS_ORDER_DOMAIN_NAME, version: LIMITLESS_ORDER_DOMAIN_VERSION, chainId: CLOB_CHAIN_IDS.limitless, verifyingContract } as const;
}

export function assertLimitlessOrder(order: LimitlessOrder): LimitlessOrder {
  if (order.signatureType !== LIMITLESS_SIGNATURE_TYPE_EOA) throw new SigningError("invalid_order", "only EOA orders (signatureType 0) are built here");
  const maker = normalizeAddress(order.maker, "order.maker");
  const signer = normalizeAddress(order.signer, "order.signer");
  const taker = normalizeAddress(order.taker, "order.taker");
  if (maker !== signer) throw new SigningError("invalid_order", "order.maker must equal order.signer in EOA trading mode");
  if (taker !== ZERO_ADDRESS) throw new SigningError("invalid_order", "order.taker must be the zero address (an open order)");
  if (order.side !== 0 && order.side !== 1) throw new SigningError("invalid_order", "order.side must be 0 (BUY) or 1 (SELL)");
  const makerAmount = assertUint(order.makerAmount, 256, "order.makerAmount");
  const takerAmount = assertUint(order.takerAmount, 256, "order.takerAmount");
  if (makerAmount === 0n || takerAmount === 0n) throw new SigningError("invalid_order", "order amounts must be non-zero");
  const salt = assertUint(order.salt, 256, "order.salt");
  if (salt === 0n) throw new SigningError("invalid_order", "order.salt must be non-zero");
  const expiration = assertUint(order.expiration, 256, "order.expiration");
  if (expiration !== 0n) throw new SigningError("invalid_order", "order.expiration must be 0 on Limitless");
  const nonce = assertUint(order.nonce, 256, "order.nonce");
  if (nonce !== 0n) throw new SigningError("invalid_order", "order.nonce must be 0 on Limitless");
  const feeRateBps = assertUint(order.feeRateBps, 256, "order.feeRateBps");
  if (feeRateBps > 10_000n) throw new SigningError("invalid_order", "order.feeRateBps is a basis-point rate");
  return { salt, maker, signer, taker, tokenId: assertUint(order.tokenId, 256, "order.tokenId"), makerAmount, takerAmount, expiration, nonce, feeRateBps, side: order.side, signatureType: LIMITLESS_SIGNATURE_TYPE_EOA };
}

export function buildLimitlessOrderTypedData(order: LimitlessOrder, exchange: Address) {
  const message = assertLimitlessOrder(order);
  return { domain: limitlessOrderDomain(exchange), types: LIMITLESS_ORDER_TYPES, primaryType: "Order" as const, message };
}

export function hashLimitlessOrderStruct(order: LimitlessOrder): Hex {
  return hashStruct({ data: assertLimitlessOrder(order), primaryType: "Order", types: LIMITLESS_ORDER_TYPES });
}

export function hashLimitlessOrder(order: LimitlessOrder, exchange: Address): Hex {
  return hashTypedData(buildLimitlessOrderTypedData(order, exchange));
}

export function limitlessOrderSignTypedData(order: LimitlessOrder, exchange: Address) {
  const typed = buildLimitlessOrderTypedData(order, exchange);
  const m = typed.message;
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Order: [...LIMITLESS_ORDER_TYPES.Order],
    },
    primaryType: "Order" as const,
    domain: { ...typed.domain },
    message: {
      salt: m.salt.toString(),
      maker: m.maker,
      signer: m.signer,
      taker: m.taker,
      tokenId: m.tokenId.toString(),
      makerAmount: m.makerAmount.toString(),
      takerAmount: m.takerAmount.toString(),
      expiration: m.expiration.toString(),
      nonce: m.nonce.toString(),
      feeRateBps: m.feeRateBps.toString(),
      side: m.side,
      signatureType: m.signatureType,
    },
  };
}

// The `order` object of POST /orders. The docs show the SDK's arguments, not the raw body of a self-signed order
// (programmatic-api: "The page doesn't show the full order schema"), so this wire form is the CTF-exchange JSON
// convention (camelCase, decimal strings for the uint256 fields, numbers for the uint8 ones) and is marked unverified
// in the tool contract until a live test records the gateway's own spelling.
export type LimitlessOrderWire = {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: number;
  signatureType: number;
};

export function limitlessOrderToWire(order: LimitlessOrder): LimitlessOrderWire {
  const o = assertLimitlessOrder(order);
  return {
    salt: o.salt.toString(),
    maker: o.maker,
    signer: o.signer,
    taker: o.taker,
    tokenId: o.tokenId.toString(),
    makerAmount: o.makerAmount.toString(),
    takerAmount: o.takerAmount.toString(),
    expiration: o.expiration.toString(),
    nonce: o.nonce.toString(),
    feeRateBps: o.feeRateBps.toString(),
    side: o.side,
    signatureType: o.signatureType,
  };
}
