import { hashStruct, hashTypedData, type Address, type Hex } from "viem";

import { SigningError } from "../../xo/errors.js";
import { assertUint, normalizeAddress } from "../../xo/validate.js";
import { CLOB_CHAIN_IDS } from "../venues.js";

// Polymarket's L1 login (docs.polymarket.com/trading/wallets-auth.md, read 2026-10-21): domain name "ClobAuthDomain",
// version "1", chainId 137 (no verifyingContract); type ClobAuth(address address, string timestamp, uint256 nonce,
// string message); message "This message attests that I control the given wallet"; nonce 0 unless several credential
// sets are managed. The signed timestamp is Unix seconds. It is the same struct XO's login uses (sdk/trade/xo/
// clobauth.ts) with another chain id, so the two share no code on purpose: a change to one must not move the other.
//
// The signature goes to POST /auth/api-key (create) or GET /auth/derive-api-key (derive) in the headers POLY_ADDRESS,
// POLY_SIGNATURE, POLY_TIMESTAMP and POLY_NONCE; the answer carries apiKey, secret and passphrase.

export const POLYMARKET_CLOB_AUTH_DOMAIN = { name: "ClobAuthDomain", version: "1", chainId: CLOB_CHAIN_IDS.polymarket } as const;
export const POLYMARKET_CLOB_AUTH_MESSAGE = "This message attests that I control the given wallet";

export const POLYMARKET_CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
} as const;

export type PolymarketClobAuthFields = {
  // The EOA that signs (the maker of its orders).
  address: Address;
  // Unix seconds as a decimal string; the exact POLY_TIMESTAMP header value.
  timestamp: string;
  nonce: bigint;
};

export function assertPolymarketClobAuth(fields: PolymarketClobAuthFields): PolymarketClobAuthFields {
  if (typeof fields.timestamp !== "string" || !/^[1-9][0-9]{0,11}$/.test(fields.timestamp)) {
    throw new SigningError("invalid_timestamp", "timestamp must be unix seconds as a decimal string");
  }
  return { address: normalizeAddress(fields.address, "clobAuth.address"), timestamp: fields.timestamp, nonce: assertUint(fields.nonce, 256, "clobAuth.nonce") };
}

export function buildPolymarketClobAuthTypedData(fields: PolymarketClobAuthFields) {
  const f = assertPolymarketClobAuth(fields);
  return {
    domain: POLYMARKET_CLOB_AUTH_DOMAIN,
    types: POLYMARKET_CLOB_AUTH_TYPES,
    primaryType: "ClobAuth" as const,
    message: { address: f.address, timestamp: f.timestamp, nonce: f.nonce, message: POLYMARKET_CLOB_AUTH_MESSAGE },
  };
}

export function hashPolymarketClobAuthStruct(fields: PolymarketClobAuthFields): Hex {
  const typed = buildPolymarketClobAuthTypedData(fields);
  return hashStruct({ data: typed.message, primaryType: "ClobAuth", types: typed.types });
}

// The digest an EOA signs (no wrapper of any kind).
export function hashPolymarketClobAuth(fields: PolymarketClobAuthFields): Hex {
  return hashTypedData(buildPolymarketClobAuthTypedData(fields));
}

// The JSON-safe typed data for a wallet (eth_signTypedData_v4 form, EIP712Domain spelled out).
export function polymarketClobAuthSignTypedData(fields: PolymarketClobAuthFields) {
  const f = assertPolymarketClobAuth(fields);
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
      ],
      ClobAuth: [...POLYMARKET_CLOB_AUTH_TYPES.ClobAuth],
    },
    primaryType: "ClobAuth" as const,
    domain: { ...POLYMARKET_CLOB_AUTH_DOMAIN },
    message: { address: f.address, timestamp: f.timestamp, nonce: Number(f.nonce), message: POLYMARKET_CLOB_AUTH_MESSAGE },
  };
}

export type PolymarketL1Headers = {
  POLY_ADDRESS: Address;
  POLY_SIGNATURE: Hex;
  POLY_TIMESTAMP: string;
  POLY_NONCE: string;
};

// The 65 canonical signature bytes, as the relay verified them (v 27 or 28, low s).
export function buildPolymarketL1Headers(fields: PolymarketClobAuthFields, signature65: Hex): PolymarketL1Headers {
  const f = assertPolymarketClobAuth(fields);
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature65)) throw new SigningError("invalid_signature_length", "the L1 signature must be 65 bytes");
  return { POLY_ADDRESS: f.address, POLY_SIGNATURE: signature65.toLowerCase() as Hex, POLY_TIMESTAMP: f.timestamp, POLY_NONCE: f.nonce.toString() };
}
