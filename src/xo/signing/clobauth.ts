import { hashStruct, hashTypedData, type Address, type Hex } from "viem";

import {
  CLOB_AUTH_DOMAIN_NAME,
  CLOB_AUTH_DOMAIN_VERSION,
  CLOB_AUTH_MESSAGE,
  XO_CHAIN_ID,
} from "./constants.js";
import { SigningError } from "./errors.js";
import { buildKernelTypedData, kernelWrapDigest, type KernelSignTypedData } from "./kernel.js";
import { parseWireSignature, type ParseOptions } from "./signature.js";
import { assertUint, normalizeAddress } from "./validate.js";

// L1 auth: the field is literally named `address`; the domain has no verifyingContract.
export const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
} as const;

export const CLOB_AUTH_DOMAIN = {
  name: CLOB_AUTH_DOMAIN_NAME,
  version: CLOB_AUTH_DOMAIN_VERSION,
  chainId: XO_CHAIN_ID,
} as const;

export type ClobAuthFields = {
  // The smart account (same value as the XO_ADDRESS header), not the owner EOA.
  address: Address;
  // Unix seconds as a decimal string; must be the exact XO_TIMESTAMP header value.
  timestamp: string;
  // XO_NONCE, 0 when absent.
  nonce: bigint;
};

export function assertClobAuthFields(fields: ClobAuthFields): ClobAuthFields {
  if (typeof fields.timestamp !== "string" || !/^[1-9][0-9]{0,11}$/.test(fields.timestamp)) {
    throw new SigningError("invalid_timestamp", "timestamp must be unix seconds as a decimal string");
  }
  return {
    address: normalizeAddress(fields.address, "clobAuth.address"),
    timestamp: fields.timestamp,
    nonce: assertUint(fields.nonce, 256, "clobAuth.nonce"),
  };
}

export function buildClobAuthTypedData(fields: ClobAuthFields) {
  const f = assertClobAuthFields(fields);
  return {
    domain: CLOB_AUTH_DOMAIN,
    types: CLOB_AUTH_TYPES,
    primaryType: "ClobAuth" as const,
    message: { address: f.address, timestamp: f.timestamp, nonce: f.nonce, message: CLOB_AUTH_MESSAGE },
  };
}

export function hashClobAuthStruct(fields: ClobAuthFields): Hex {
  const typed = buildClobAuthTypedData(fields);
  return hashStruct({ data: typed.message, primaryType: "ClobAuth", types: typed.types });
}

// The ClobAuth digest, before the Kernel wrap.
export function hashClobAuth(fields: ClobAuthFields): Hex {
  return hashTypedData(buildClobAuthTypedData(fields));
}

// What the owner key signs for L1 (digest wrapped under the smart account's Kernel domain).
export function clobAuthKernelDigest(fields: ClobAuthFields): Hex {
  const f = assertClobAuthFields(fields);
  return kernelWrapDigest(hashClobAuth(f), f.address);
}

// The typedData a PayBox request_wallet_sign intent would carry for an L1 signature.
export function buildClobAuthKernelTypedData(fields: ClobAuthFields): KernelSignTypedData {
  const f = assertClobAuthFields(fields);
  return buildKernelTypedData(hashClobAuth(f), f.address);
}

export type L1Headers = {
  XO_ADDRESS: Address;
  XO_SIGNATURE: Hex;
  XO_TIMESTAMP: string;
  XO_NONCE: string;
};

// The wire signature is validated (length, prefix, validator, low-s) and the header carries its
// canonical form: a signer that returns parity v (0/1) or upper-case hex is accepted, but the
// exchange's validator needs v of 27 or 28, so the caller's spelling is never sent as is.
export function buildL1Headers(fields: ClobAuthFields, wireSignature: Hex, parseOptions: ParseOptions = {}): L1Headers {
  const f = assertClobAuthFields(fields);
  const parsed = parseWireSignature(wireSignature, parseOptions);
  return {
    XO_ADDRESS: f.address,
    XO_SIGNATURE: parsed.canonicalWire,
    XO_TIMESTAMP: f.timestamp,
    XO_NONCE: f.nonce.toString(),
  };
}
