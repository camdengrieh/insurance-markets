import { hashStruct, hashTypedData, type Address, type Hex } from "viem";

import {
  CTF_EXCHANGE_ADDRESS,
  ORDER_DOMAIN_NAME,
  ORDER_DOMAIN_VERSION,
  SIDE_BUY,
  SIDE_SELL,
  SIGNATURE_TYPE_XO_SMART_ACCOUNT,
  XO_CHAIN_ID,
  ZERO_ADDRESS,
} from "./constants.js";
import { SigningError } from "./errors.js";
import { assertUint, normalizeAddress, normalizeBytes } from "./validate.js";

// 13 signed fields, in typehash order. `signature` is on the wire but is not part of the hash,
// and the legacy `taker` and `feeRateBps` keys must never be signed.
export const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "beneficiary", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint128" },
    { name: "identifier", type: "bytes16" },
    { name: "metadata", type: "bytes32" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
} as const;

export type OrderSide = typeof SIDE_BUY | typeof SIDE_SELL;

export type XoOrder = {
  salt: bigint;
  maker: Address;
  signer: Address;
  beneficiary: Address;
  tokenId: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
  expiration: bigint;
  nonce: bigint;
  identifier: Hex;
  metadata: Hex;
  side: OrderSide;
  signatureType: typeof SIGNATURE_TYPE_XO_SMART_ACCOUNT;
};

export type AssertOrderOptions = {
  // A non-zero beneficiary redirects proceeds away from the maker, so it is refused unless the
  // caller opts in by name.
  allowNonZeroBeneficiary?: boolean;
};

// Returns a normalised copy (checksummed addresses, lower-case hex) or throws SigningError.
// Hashing always runs on this copy, so a spelling difference cannot change the digest.
export function assertOrder(order: XoOrder, options: AssertOrderOptions = {}): XoOrder {
  const maker = normalizeAddress(order.maker, "order.maker");
  const signer = normalizeAddress(order.signer, "order.signer");
  const beneficiary = normalizeAddress(order.beneficiary, "order.beneficiary");
  if (maker !== signer) {
    throw new SigningError("invalid_order", "order.maker must equal order.signer for signatureType 3");
  }
  if (order.signatureType !== SIGNATURE_TYPE_XO_SMART_ACCOUNT) {
    throw new SigningError("invalid_order", "order.signatureType must be 3 (XO smart account)");
  }
  if (order.side !== SIDE_BUY && order.side !== SIDE_SELL) {
    throw new SigningError("invalid_order", "order.side must be 0 (BUY) or 1 (SELL)");
  }
  if (beneficiary !== ZERO_ADDRESS && options.allowNonZeroBeneficiary !== true) {
    throw new SigningError("invalid_order", "order.beneficiary must be the zero address unless explicitly allowed");
  }
  const makerAmount = assertUint(order.makerAmount, 256, "order.makerAmount");
  const takerAmount = assertUint(order.takerAmount, 256, "order.takerAmount");
  if (makerAmount === 0n || takerAmount === 0n) {
    throw new SigningError("invalid_order", "order amounts must be non-zero");
  }
  return {
    salt: assertUint(order.salt, 256, "order.salt"),
    maker,
    signer,
    beneficiary,
    tokenId: assertUint(order.tokenId, 256, "order.tokenId"),
    makerAmount,
    takerAmount,
    expiration: assertUint(order.expiration, 256, "order.expiration"),
    nonce: assertUint(order.nonce, 128, "order.nonce"),
    identifier: normalizeBytes(order.identifier, 16, "order.identifier"),
    metadata: normalizeBytes(order.metadata, 32, "order.metadata"),
    side: order.side,
    signatureType: order.signatureType,
  };
}

export const ORDER_DOMAIN = {
  name: ORDER_DOMAIN_NAME,
  version: ORDER_DOMAIN_VERSION,
  chainId: XO_CHAIN_ID,
  verifyingContract: CTF_EXCHANGE_ADDRESS,
} as const;

// viem-shaped typed data (bigint values), for hashing and local checks. The JSON-safe object a
// wallet signs is the Kernel wrapper in kernel.ts, not this one.
export function buildOrderTypedData(order: XoOrder, options: AssertOrderOptions = {}) {
  const message = assertOrder(order, options);
  return {
    domain: ORDER_DOMAIN,
    types: ORDER_TYPES,
    primaryType: "Order" as const,
    message,
  };
}

// keccak256(abi.encode(ORDER_TYPEHASH, ...13 fields)).
export function hashOrderStruct(order: XoOrder, options: AssertOrderOptions = {}): Hex {
  const typed = buildOrderTypedData(order, options);
  return hashStruct({ data: typed.message, primaryType: "Order", types: typed.types });
}

// keccak256(0x1901 || domainSeparator || structHash). Equals the orderID returned by POST /order.
export function hashOrder(order: XoOrder, options: AssertOrderOptions = {}): Hex {
  return hashTypedData(buildOrderTypedData(order, options));
}

// POST /order wire object (without `signature`): camelCase decimal strings, numbers for the two
// uint8 fields.
export type XoOrderWire = {
  salt: string;
  maker: string;
  signer: string;
  beneficiary: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  identifier: string;
  metadata: string;
  side: number;
  signatureType: number;
};

export function orderToWire(order: XoOrder): XoOrderWire {
  const o = assertOrder(order, { allowNonZeroBeneficiary: true });
  return {
    salt: o.salt.toString(),
    maker: o.maker,
    signer: o.signer,
    beneficiary: o.beneficiary,
    tokenId: o.tokenId.toString(),
    makerAmount: o.makerAmount.toString(),
    takerAmount: o.takerAmount.toString(),
    expiration: o.expiration.toString(),
    nonce: o.nonce.toString(),
    identifier: o.identifier,
    metadata: o.metadata,
    side: o.side,
    signatureType: o.signatureType,
  };
}

function decimalToBigint(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(value)) {
    throw new SigningError("invalid_integer", `${label} must be a canonical decimal string`);
  }
  return BigInt(value);
}

// Strict inverse of orderToWire for untrusted input: decimal strings only (no hex, no floats).
export function orderFromWire(wire: unknown): XoOrder {
  if (typeof wire !== "object" || wire === null || Array.isArray(wire)) {
    throw new SigningError("invalid_order", "order must be an object");
  }
  const w = wire as Record<string, unknown>;
  const side = w["side"];
  const signatureType = w["signatureType"];
  if (side !== SIDE_BUY && side !== SIDE_SELL) {
    throw new SigningError("invalid_order", "order.side must be 0 or 1");
  }
  if (signatureType !== SIGNATURE_TYPE_XO_SMART_ACCOUNT) {
    throw new SigningError("invalid_order", "order.signatureType must be 3");
  }
  return assertOrder(
    {
      salt: decimalToBigint(w["salt"], "order.salt"),
      maker: w["maker"] as Address,
      signer: w["signer"] as Address,
      beneficiary: w["beneficiary"] as Address,
      tokenId: decimalToBigint(w["tokenId"], "order.tokenId"),
      makerAmount: decimalToBigint(w["makerAmount"], "order.makerAmount"),
      takerAmount: decimalToBigint(w["takerAmount"], "order.takerAmount"),
      expiration: decimalToBigint(w["expiration"], "order.expiration"),
      nonce: decimalToBigint(w["nonce"], "order.nonce"),
      identifier: w["identifier"] as Hex,
      metadata: w["metadata"] as Hex,
      side,
      signatureType,
    },
    { allowNonZeroBeneficiary: true },
  );
}
