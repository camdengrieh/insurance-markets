import { getAddress, isAddress, type Address, type Hex } from "viem";

import { SigningError } from "./errors.js";

// Checksummed output. Mixed-case input must carry a valid checksum, so a mistyped pasted
// address fails here instead of becoming a different account.
export function normalizeAddress(value: unknown, label: string): Address {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value) || !isAddress(value, { strict: true })) {
    throw new SigningError("invalid_address", `${label} must be a 20-byte hex address with a valid checksum`);
  }
  return getAddress(value);
}

// Lower-case hex with an exact byte length; rejects odd length, missing 0x and non-hex.
export function normalizeBytes(value: unknown, byteLength: number, label: string): Hex {
  const pattern = new RegExp(`^0x[0-9a-fA-F]{${byteLength * 2}}$`);
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new SigningError("invalid_hex", `${label} must be 0x-prefixed hex of exactly ${byteLength} bytes`);
  }
  return value.toLowerCase() as Hex;
}

export function assertUint(value: unknown, bits: number, label: string): bigint {
  if (typeof value !== "bigint" || value < 0n || value >= 1n << BigInt(bits)) {
    throw new SigningError("invalid_integer", `${label} must be a bigint in [0, 2^${bits})`);
  }
  return value;
}
