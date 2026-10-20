import { hashDomain, hashTypedData, type Address, type Hex } from "viem";

import { KERNEL_DOMAIN_NAME, KERNEL_DOMAIN_VERSION, XO_CHAIN_ID } from "./constants.js";
import { normalizeAddress, normalizeBytes } from "./validate.js";

// Kernel v3.1 isValidSignature hashes the digest again as Kernel(bytes32 hash) under the smart
// account's own domain before the validator checks the ECDSA signature. Source read at
// zerodevapp/kernel tag v3.1: Kernel.sol (_domainNameAndVersion, isValidSignature),
// ValidationManager.sol (_toWrappedHash), Constants.sol (KERNEL_WRAPPER_TYPE_HASH).
export const KERNEL_TYPES = {
  Kernel: [{ name: "hash", type: "bytes32" }],
} as const;

export function kernelDomain(smartAccount: Address) {
  return {
    name: KERNEL_DOMAIN_NAME,
    version: KERNEL_DOMAIN_VERSION,
    chainId: XO_CHAIN_ID,
    verifyingContract: normalizeAddress(smartAccount, "smartAccount"),
  } as const;
}

export function kernelDomainSeparator(smartAccount: Address): Hex {
  const domain = kernelDomain(smartAccount);
  return hashDomain({
    domain: { ...domain, chainId: BigInt(domain.chainId) },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
    },
  });
}

// The 32-byte digest the owner key signs: no EIP-191 prefix, plain secp256k1 over these bytes.
export function kernelWrapDigest(hash: Hex, smartAccount: Address): Hex {
  return hashTypedData({
    domain: kernelDomain(smartAccount),
    types: KERNEL_TYPES,
    primaryType: "Kernel",
    message: { hash: normalizeBytes(hash, 32, "hash") },
  });
}

// What a PayBox request_wallet_sign typedData intent would carry. Plain JSON (no bigint), with
// EIP712Domain spelled out as eth_signTypedData_v4 wallets expect. Signing it yields the same
// 65 bytes as signing kernelWrapDigest() directly (checked in the vector tests).
export type KernelSignTypedData = {
  types: {
    EIP712Domain: ReadonlyArray<{ name: string; type: string }>;
    Kernel: ReadonlyArray<{ name: string; type: string }>;
  };
  primaryType: "Kernel";
  domain: { name: string; version: string; chainId: number; verifyingContract: Address };
  message: { hash: Hex };
};

export function buildKernelTypedData(hash: Hex, smartAccount: Address): KernelSignTypedData {
  const domain = kernelDomain(smartAccount);
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Kernel: [{ name: "hash", type: "bytes32" }],
    },
    primaryType: "Kernel",
    domain: { ...domain },
    message: { hash: normalizeBytes(hash, 32, "hash") },
  };
}
