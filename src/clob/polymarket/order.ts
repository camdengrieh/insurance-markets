import { concat, hashDomain, hashStruct, hashTypedData, size, stringToHex, type Address, type Hex } from "viem";

import { SigningError } from "../../xo/signing/errors.js";
import { assertUint, normalizeAddress, normalizeBytes } from "../../xo/signing/validate.js";
import { CLOB_CHAIN_IDS, POLYMARKET_EXCHANGES, POLYMARKET_ORDER_DOMAIN_NAME, POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET, POLYMARKET_SIGNATURE_TYPE_EOA, type PolymarketBook } from "../venues.js";
import { DEPOSIT_WALLET_DOMAIN_NAME, DEPOSIT_WALLET_DOMAIN_VERSION } from "./deposit-wallet.js";

// The Polymarket CLOB order (Protocol V2 and the CTF books), as docs.polymarket.com/trading/place-orders.md defines it
// (read 2026-10-21): "Order struct (EIP-712 Order type, in order): salt uint256, maker address, signer address, tokenId
// uint256, makerAmount uint256, takerAmount uint256, side uint8, signatureType uint8, timestamp uint256, metadata
// bytes32, builder bytes32". Eleven signed fields; `expiration` and `orderType` travel on the wire and are not signed
// ("orderType is not part of the signed typed data"; the POST /order `order` object carries `expiration` as a string).
//
// Two makers are built:
//   - signatureType 0 (EOA): maker = signer = the owner EOA, which signs the order's EIP-712 hash itself;
//   - signatureType 3 (POLY_1271, the Deposit Wallet): maker = signer = the owner's Deposit Wallet
//     (place-orders.md signature-type table: "Deposit Wallet | 3 | Deposit Wallet address | Deposit Wallet address").
//     The owner EOA signs a Solady ERC-7739 nested EIP-712 `TypedDataSign` struct over the order, under the EXCHANGE's
//     domain, and the signature sent to the venue is that 65-byte signature wrapped for the wallet's ERC-1271 check:
//
//       innerSig (65) || exchangeDomainSeparator (32) || contentsHash (32) || utf8(ORDER_TYPE_STRING) || uint16_be(len)
//
//     contentsHash is the Order's struct hash; the TypedDataSign message is { contents: the order, name
//     "DepositWallet", version "1", chainId, verifyingContract: the wallet, salt: 0x00..00 }. Sources, all read
//     2026-10-21 and in agreement: Polymarket/clob-client-v2 src/order-utils/exchangeOrderBuilderV2.ts
//     buildOrderSignature (commit 27633b3c7d9876e03f4b602a7c79d97e7079c180); Polymarket/py-clob-client-v2
//     py_clob_client_v2/order_utils/exchange_order_builder_v2.py (commit f11b2c090c7751fafc3a62fc62c39f0ae9037d51);
//     Polymarket/rs-clob-client-v2 src/clob/client.rs sign_poly1271_order (commit
//     561830b9ee502c6e67cce314f0e53a80b8885b09), which shows the digest the owner key signs:
//     keccak256(0x1901 || exchangeDomainSeparator || keccak256(abi.encode(keccak256(SOLADY_TYPE_STRING), contentsHash,
//     keccak256("DepositWallet"), keccak256("1"), chainId, wallet, bytes32(0)))). The wallet side is Solady
//     ERC1271's nested EIP-712 path (lib/solady/src/accounts/ERC1271.sol in both verified DepositWallet sources; for a
//     caller other than the factory, "external callers go through the nested EIP-712 workflow").
//     test/clob-polymarket-order.test.ts reproduces rs-clob-client-v2's own expected POLY_1271 signature
//     (tests/order.rs v2_poly1271_signing_matches_deposit_wallet_signature) byte for byte.
//
// Session keys (the 0x6492 envelope a session signer's signature carries) are not built: the owner signs here.
//
// No order in this repository was accepted by the venue. Until a live order is recorded, the venue's acceptance of
// either form is unproven; the relay says so on every prepared item.

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
// this copy. Whose wallet the maker is (the owner itself for type 0, the owner's derived Deposit Wallet for type 3) is
// the caller's check: this function sees no owner.
export function assertPolymarketOrder(order: PolymarketOrder): PolymarketOrder {
  const signatureType = order.signatureType;
  if (signatureType !== POLYMARKET_SIGNATURE_TYPE_EOA && signatureType !== POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET) {
    throw new SigningError("invalid_order", "only EOA orders (signatureType 0) and Deposit Wallet orders (signatureType 3) are built here");
  }
  const maker = normalizeAddress(order.maker, "order.maker");
  const signer = normalizeAddress(order.signer, "order.signer");
  // Both kinds: the exchange checks `signer == maker` for an EOA and for a POLY_1271 order alike (Signatures.sol).
  if (maker !== signer) throw new SigningError("invalid_order", `order.maker must equal order.signer for ${signatureType === POLYMARKET_SIGNATURE_TYPE_EOA ? "an EOA" : "a Deposit Wallet"} order`);
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
    signatureType,
    timestamp: assertUint(order.timestamp, 256, "order.timestamp"),
    metadata: normalizeBytes(order.metadata, 32, "order.metadata"),
    builder: normalizeBytes(order.builder, 32, "order.builder"),
  };
}

// viem-shaped typed data of the Order itself (bigint values), for hashing and local checks.
export function buildPolymarketOrderTypedData(order: PolymarketOrder, book: PolymarketBook) {
  const message = assertPolymarketOrder(order);
  return { domain: polymarketOrderDomain(book), types: POLYMARKET_ORDER_TYPES, primaryType: "Order" as const, message };
}

export function hashPolymarketOrderStruct(order: PolymarketOrder): Hex {
  const message = assertPolymarketOrder(order);
  return hashStruct({ data: message, primaryType: "Order", types: POLYMARKET_ORDER_TYPES });
}

// keccak256(0x1901 || domainSeparator(book) || structHash): the order's id at the venue, for either signature type, and
// what an EOA (type 0) signs. A Deposit Wallet order's owner signs polymarketSigningDigest instead.
export function hashPolymarketOrder(order: PolymarketOrder, book: PolymarketBook): Hex {
  return hashTypedData(buildPolymarketOrderTypedData(order, book));
}

// ---- the Deposit Wallet (type 3) wrapper -------------------------------------------------------------------------------------

// rs-clob-client-v2 src/clob/client.rs SOLADY_TYPE_STRING: the TypedDataSign type followed by the Order type it
// references (EIP-712 encodeType). The order of the fields is the one all three official clients use.
export const POLYMARKET_TYPED_DATA_SIGN_TYPE_STRING = `TypedDataSign(Order contents,string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)${POLYMARKET_ORDER_TYPE_STRING}`;

export const POLYMARKET_TYPED_DATA_SIGN_TYPES = {
  TypedDataSign: [
    { name: "contents", type: "Order" },
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
    { name: "salt", type: "bytes32" },
  ],
  Order: POLYMARKET_ORDER_TYPES.Order,
} as const;

const ZERO_SALT: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";
// The 65-byte r || s || v the owner's key produces over the TypedDataSign digest.
const INNER_SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
// 2 + 130 + 64 + 64 + 2 x 186 + 4 hex characters: 317 bytes for the Order type string of 186 bytes.
export const POLYMARKET_DEPOSIT_WALLET_SIGNATURE_BYTES = 65 + 32 + 32 + POLYMARKET_ORDER_TYPE_STRING.length + 2;

// An exchange's EIP-712 domain, spelled out. The pinned books use polymarketOrderDomain(book); the explicit form exists so
// the official clients' published test vector (on another chain) can be reproduced with this same code.
export interface PolymarketExchangeDomain {
  readonly name: string;
  readonly version: string;
  readonly chainId: number;
  readonly verifyingContract: Address;
}

const EIP712_DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

export function polymarketExchangeDomainSeparator(domain: PolymarketExchangeDomain): Hex {
  return hashDomain({ domain: { name: domain.name, version: domain.version, chainId: BigInt(domain.chainId), verifyingContract: domain.verifyingContract }, types: { EIP712Domain: EIP712_DOMAIN_TYPE } });
}

function depositWalletOrder(order: PolymarketOrder): PolymarketOrder {
  const message = assertPolymarketOrder(order);
  if (message.signatureType !== POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET) throw new SigningError("invalid_order", "a TypedDataSign wrapper is built for a Deposit Wallet order (signatureType 3) only");
  return message;
}

function typedDataSignMessage(message: PolymarketOrder, chainId: number) {
  // verifyingContract is the wallet (the order's maker and signer), as in every official client (`msg.signer`).
  return { contents: message, name: DEPOSIT_WALLET_DOMAIN_NAME, version: DEPOSIT_WALLET_DOMAIN_VERSION, chainId: BigInt(chainId), verifyingContract: message.maker, salt: ZERO_SALT };
}

// The digest the owner's key signs for a Deposit Wallet order under an explicit exchange domain.
export function depositWalletTypedDataSignDigest(order: PolymarketOrder, domain: PolymarketExchangeDomain): Hex {
  const message = depositWalletOrder(order);
  return hashTypedData({ domain: { ...domain }, types: POLYMARKET_TYPED_DATA_SIGN_TYPES, primaryType: "TypedDataSign", message: typedDataSignMessage(message, domain.chainId) });
}

// innerSig (65) || domainSeparator (32) || contentsHash (32) || utf8(ORDER_TYPE_STRING) || uint16_be(len): the bytes
// the venue receives in `signature` for a type-3 order, under an explicit exchange domain.
export function wrapDepositWalletSignatureForDomain(innerSignature: string, order: PolymarketOrder, domain: PolymarketExchangeDomain): Hex {
  if (!INNER_SIGNATURE.test(innerSignature)) throw new SigningError("invalid_signature_length", "the owner's signature must be 65 bytes (r || s || v) before it is wrapped");
  const message = depositWalletOrder(order);
  const contentsHash = hashStruct({ data: message, primaryType: "Order", types: POLYMARKET_ORDER_TYPES });
  const typeString = stringToHex(POLYMARKET_ORDER_TYPE_STRING);
  const length = size(typeString);
  if (length > 0xffff) throw new SigningError("invalid_order", "the contents type string does not fit its two-byte length");
  const wrapped = concat([innerSignature.toLowerCase() as Hex, polymarketExchangeDomainSeparator(domain), contentsHash, typeString, `0x${length.toString(16).padStart(4, "0")}`]);
  return wrapped.toLowerCase() as Hex;
}

// The pinned-book forms.
export function hashPolymarketDepositWalletOrder(order: PolymarketOrder, book: PolymarketBook): Hex {
  return depositWalletTypedDataSignDigest(order, polymarketOrderDomain(book));
}

export function wrapPolymarketDepositWalletSignature(innerSignature: string, order: PolymarketOrder, book: PolymarketBook): Hex {
  return wrapDepositWalletSignatureForDomain(innerSignature, order, polymarketOrderDomain(book));
}

// What the owner's key signs for this order: the order hash itself (type 0) or its TypedDataSign wrapper (type 3).
export function polymarketSigningDigest(order: PolymarketOrder, book: PolymarketBook): Hex {
  return assertPolymarketOrder(order).signatureType === POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET ? hashPolymarketDepositWalletOrder(order, book) : hashPolymarketOrder(order, book);
}

const DOMAIN_JSON_TYPE = EIP712_DOMAIN_TYPE.map((field) => ({ ...field }));

function orderJson(m: PolymarketOrder) {
  return {
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
  };
}

// The JSON-safe typed data a wallet signs (eth_signTypedData_v4 form, EIP712Domain spelled out). For a Deposit Wallet
// order it is the TypedDataSign struct with the Order nested in `contents`, so the signing window shows every order
// field and the wallet the order is for; it hashes to polymarketSigningDigest.
export function polymarketOrderSignTypedData(order: PolymarketOrder, book: PolymarketBook) {
  const typed = buildPolymarketOrderTypedData(order, book);
  const m = typed.message;
  if (m.signatureType === POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET) {
    return {
      types: {
        EIP712Domain: DOMAIN_JSON_TYPE,
        TypedDataSign: POLYMARKET_TYPED_DATA_SIGN_TYPES.TypedDataSign.map((field) => ({ ...field })),
        Order: [...POLYMARKET_ORDER_TYPES.Order],
      },
      primaryType: "TypedDataSign" as const,
      domain: { ...typed.domain },
      message: {
        contents: orderJson(m),
        name: DEPOSIT_WALLET_DOMAIN_NAME,
        version: DEPOSIT_WALLET_DOMAIN_VERSION,
        chainId: String(typed.domain.chainId),
        verifyingContract: m.maker,
        salt: ZERO_SALT,
      },
    };
  }
  return {
    types: {
      EIP712Domain: DOMAIN_JSON_TYPE,
      Order: [...POLYMARKET_ORDER_TYPES.Order],
    },
    primaryType: "Order" as const,
    domain: { ...typed.domain },
    message: orderJson(m),
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
