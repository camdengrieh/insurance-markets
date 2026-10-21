import { hashStruct, hashTypedData, type Address, type Hex } from "viem";

import { SigningError } from "../../xo/signing/errors.js";
import { assertUint, normalizeAddress, normalizeBytes } from "../../xo/signing/validate.js";
import { CLOB_CHAIN_IDS, POLYMARKET_EXCHANGES, POLYMARKET_ORDER_DOMAIN_NAME, POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET, POLYMARKET_SIGNATURE_TYPE_EOA, type PolymarketBook } from "../venues.js";

// The Polymarket CLOB order (Protocol V2 and the CTF books), as docs.polymarket.com/trading/place-orders.md defines it
// (read 2026-10-21): "Order struct (EIP-712 Order type, in order): salt uint256, maker address, signer address, tokenId
// uint256, makerAmount uint256, takerAmount uint256, side uint8, signatureType uint8, timestamp uint256, metadata
// bytes32, builder bytes32". Eleven signed fields; `expiration` and `orderType` travel on the wire and are not signed
// ("orderType is not part of the signed typed data"; the POST /order `order` object carries `expiration` as a string).
//
// Only an EOA maker (signatureType 0) is built. A Deposit Wallet (type 3) signs an ERC-7739 `TypedDataSign` wrapper
// over the Order ("primaryType TypedDataSign wrapping contents (the Order), plus name, version, chainId,
// verifyingContract and salt"; "the inner signature must be wrapped ... by appending the app domain separator, the
// contents hash, the Order type string, and its length as two bytes"). The page gives no vector and no exact contents
// description string, and this repository has no primary source for the ERC-7739 encoding it would have to match, so
// type 3 is a typed, failing-closed case: assertPolymarketOrder refuses it with `not_implemented`.
//
// No vector in this repository was signed by the venue. test/clob-polymarket-order.test.ts derives the typehash from
// the type string and the digest from the domain separator and struct hash by hand, and says so in its test names.

export const POLYMARKET_ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
    { name: "timestamp", type: "uint256" },
    { name: "metadata", type: "bytes32" },
    { name: "builder", type: "bytes32" },
  ],
} as const;

export const POLYMARKET_ORDER_TYPE_STRING =
  "Order(uint256 salt,address maker,address signer,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint8 side,uint8 signatureType,uint256 timestamp,bytes32 metadata,bytes32 builder)";

export type PolymarketSide = 0 | 1;

export type PolymarketOrder = {
  salt: bigint;
  maker: Address;
  signer: Address;
  tokenId: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
  side: PolymarketSide;
  signatureType: number;
  // Unix milliseconds ("Timestamp (in milliseconds, used for order uniqueness)", concepts/order-lifecycle).
  timestamp: bigint;
  metadata: Hex;
  // A builder attribution code. Zero: no builder. Never another builder's code (docs/research/venues: reusing one
  // misattributes volume and fees).
  builder: Hex;
};

// place-orders.md: salt "kept within Number.MAX_SAFE_INTEGER in JavaScript" (the wire carries it as a JSON number).
export const POLYMARKET_MAX_SALT = BigInt(Number.MAX_SAFE_INTEGER);

export function polymarketOrderDomain(book: PolymarketBook) {
  const exchange = POLYMARKET_EXCHANGES[book];
  return {
    name: POLYMARKET_ORDER_DOMAIN_NAME,
    version: exchange.version,
    chainId: CLOB_CHAIN_IDS.polymarket,
    verifyingContract: exchange.verifyingContract,
  } as const;
}

// Returns a normalised copy (checksummed addresses, lower-case hex) or throws SigningError. Hashing always runs on
// this copy.
export function assertPolymarketOrder(order: PolymarketOrder): PolymarketOrder {
  if (order.signatureType === POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET) {
    throw new SigningError("not_implemented", "Deposit Wallet orders (signatureType 3) need an ERC-7739 TypedDataSign wrapper this build does not implement");
  }
  if (order.signatureType !== POLYMARKET_SIGNATURE_TYPE_EOA) {
    throw new SigningError("invalid_order", "only EOA orders (signatureType 0) are built here");
  }
  const maker = normalizeAddress(order.maker, "order.maker");
  const signer = normalizeAddress(order.signer, "order.signer");
  if (maker !== signer) throw new SigningError("invalid_order", "order.maker must equal order.signer for an EOA order");
  if (order.side !== 0 && order.side !== 1) throw new SigningError("invalid_order", "order.side must be 0 (BUY) or 1 (SELL)");
  const makerAmount = assertUint(order.makerAmount, 256, "order.makerAmount");
  const takerAmount = assertUint(order.takerAmount, 256, "order.takerAmount");
  if (makerAmount === 0n || takerAmount === 0n) throw new SigningError("invalid_order", "order amounts must be non-zero");
  const salt = assertUint(order.salt, 256, "order.salt");
  if (salt === 0n || salt > POLYMARKET_MAX_SALT) throw new SigningError("invalid_order", "order.salt must be a positive integer within Number.MAX_SAFE_INTEGER");
  return {
    salt,
    maker,
    signer,
    tokenId: assertUint(order.tokenId, 256, "order.tokenId"),
    makerAmount,
    takerAmount,
    side: order.side,
    signatureType: POLYMARKET_SIGNATURE_TYPE_EOA,
    timestamp: assertUint(order.timestamp, 256, "order.timestamp"),
    metadata: normalizeBytes(order.metadata, 32, "order.metadata"),
    builder: normalizeBytes(order.builder, 32, "order.builder"),
  };
}

// viem-shaped typed data (bigint values), for hashing and local checks.
export function buildPolymarketOrderTypedData(order: PolymarketOrder, book: PolymarketBook) {
  const message = assertPolymarketOrder(order);
  return { domain: polymarketOrderDomain(book), types: POLYMARKET_ORDER_TYPES, primaryType: "Order" as const, message };
}

export function hashPolymarketOrderStruct(order: PolymarketOrder): Hex {
  const message = assertPolymarketOrder(order);
  return hashStruct({ data: message, primaryType: "Order", types: POLYMARKET_ORDER_TYPES });
}

// keccak256(0x1901 || domainSeparator(book) || structHash): what an EOA signs, and the order's id.
export function hashPolymarketOrder(order: PolymarketOrder, book: PolymarketBook): Hex {
  return hashTypedData(buildPolymarketOrderTypedData(order, book));
}

// The JSON-safe typed data a wallet signs (eth_signTypedData_v4 form, EIP712Domain spelled out).
export function polymarketOrderSignTypedData(order: PolymarketOrder, book: PolymarketBook) {
  const typed = buildPolymarketOrderTypedData(order, book);
  const m = typed.message;
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Order: [...POLYMARKET_ORDER_TYPES.Order],
    },
    primaryType: "Order" as const,
    domain: { ...typed.domain },
    message: {
      salt: m.salt.toString(),
      maker: m.maker,
      signer: m.signer,
      tokenId: m.tokenId.toString(),
      makerAmount: m.makerAmount.toString(),
      takerAmount: m.takerAmount.toString(),
      side: m.side,
      signatureType: m.signatureType,
      timestamp: m.timestamp.toString(),
      metadata: m.metadata,
      builder: m.builder,
    },
  };
}

// The `order` object of POST /order (place-orders.md "POST /order body"): builder, expiration (string), maker,
// makerAmount (string), metadata, salt (number), side ("BUY" or "SELL"), signature, signatureType (integer), signer,
// takerAmount (string), timestamp (string, Unix milliseconds), tokenId. `expiration` is "0" for GTC and market
// orders and a Unix timestamp in seconds for GTD.
export type PolymarketOrderWire = {
  salt: number;
  maker: string;
  signer: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  side: "BUY" | "SELL";
  signatureType: number;
  timestamp: string;
  metadata: string;
  builder: string;
  expiration: string;
};

export function polymarketOrderToWire(order: PolymarketOrder, expiration: bigint): PolymarketOrderWire {
  const o = assertPolymarketOrder(order);
  const exp = assertUint(expiration, 256, "expiration");
  return {
    salt: Number(o.salt),
    maker: o.maker,
    signer: o.signer,
    tokenId: o.tokenId.toString(),
    makerAmount: o.makerAmount.toString(),
    takerAmount: o.takerAmount.toString(),
    side: o.side === 0 ? "BUY" : "SELL",
    signatureType: o.signatureType,
    timestamp: o.timestamp.toString(),
    metadata: o.metadata,
    builder: o.builder,
    expiration: exp.toString(),
  };
}
