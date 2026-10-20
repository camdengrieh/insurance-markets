// The write mock's independent verifiers: the digests the gateway recomputes (order, ClobAuth, Kernel wrap),
// the owner of an account read from the deployed validator, and the ERC-1271 check against the deployed
// Kernel. Written with viem and the pinned constants only; src/xo/signing is NOT imported, so a test that
// signs with the production signing code and gets accepted here is a real cross-check of both.
//
// Basis: docs/research/01 (a) and (c), 19 sec 7, 22 (b). The gateway's own checks are not public; what is
// checked here is what the exchange contract and the Kernel do on chain, which the mock runs for real.

import { decodeAbiParameters, encodeFunctionData, getAddress, hashMessage, hashTypedData, parseAbi, recoverAddress, size, slice, type Address, type Hex } from "viem";

import { ECDSA_VALIDATOR_ABI } from "../../src/xo/chain/abi.js";
import {
  CLOB_AUTH_DOMAIN,
  CLOB_AUTH_MESSAGE,
  ECDSA_VALIDATOR,
  KERNEL_DOMAIN_BASE,
  ORDER_DOMAIN,
  WIRE_SIGNATURE_BYTES,
  WIRE_SIGNATURE_FALLBACK_BYTES,
} from "../../src/xo/chain/constants.js";
import type { MockChains } from "./chains.js";

export const ERC1271_MAGIC = "0x1626ba7e";
// ERC-6492: a wrapped signature ends with this 32-byte suffix.
export const ERC6492_SUFFIX = "0x6492649264926492649264926492649264926492649264926492649264926492";

const ERC1271_ABI = parseAbi(["function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)"]);

const ORDER_TYPES = {
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

const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
} as const;

export interface ParsedOrder {
  readonly salt: bigint;
  readonly maker: Address;
  readonly signer: Address;
  readonly beneficiary: Address;
  readonly tokenId: bigint;
  readonly makerAmount: bigint;
  readonly takerAmount: bigint;
  readonly expiration: bigint;
  readonly nonce: bigint;
  readonly identifier: Hex;
  readonly metadata: Hex;
  readonly side: number;
  readonly signatureType: number;
}

export function orderDigest(order: ParsedOrder): Hex {
  return hashTypedData({
    domain: { ...ORDER_DOMAIN, chainId: BigInt(ORDER_DOMAIN.chainId) },
    types: ORDER_TYPES,
    primaryType: "Order",
    message: { ...order },
  });
}

export function clobAuthDigest(address: Address, timestamp: string, nonce: bigint): Hex {
  return hashTypedData({
    domain: { ...CLOB_AUTH_DOMAIN, chainId: BigInt(CLOB_AUTH_DOMAIN.chainId) },
    types: CLOB_AUTH_TYPES,
    primaryType: "ClobAuth",
    message: { address, timestamp, nonce, message: CLOB_AUTH_MESSAGE },
  });
}

// What the owner key signs: the digest wrapped as Kernel(bytes32 hash) under the account's own domain.
export function kernelWrappedDigest(inner: Hex, account: Address): Hex {
  return hashTypedData({
    domain: { ...KERNEL_DOMAIN_BASE, chainId: BigInt(KERNEL_DOMAIN_BASE.chainId), verifyingContract: account },
    types: { Kernel: [{ name: "hash", type: "bytes32" }] },
    primaryType: "Kernel",
    message: { hash: inner },
  });
}

// ---- wire signatures ---------------------------------------------------------------------------------------------

export interface WireSignature {
  // 0x01: 0x01 + validator + sig65 (86 bytes). 0x00: 0x00 + sig65 (66 bytes).
  readonly prefix: "0x00" | "0x01";
  readonly sig65: Hex;
}

export function parseWireSignature(signature: string): WireSignature | { readonly error: string } {
  if (!/^0x([0-9a-fA-F]{2})+$/.test(signature)) return { error: "the signature is not hex" };
  const bytes = size(signature as Hex);
  if (bytes === WIRE_SIGNATURE_BYTES) {
    if (signature.slice(2, 4) !== "01") return { error: "an 86-byte signature must start with 0x01" };
    const validator = getAddress(slice(signature as Hex, 1, 21));
    if (validator !== ECDSA_VALIDATOR) return { error: "unknown validator in the signature" };
    return { prefix: "0x01", sig65: slice(signature as Hex, 21) };
  }
  if (bytes === WIRE_SIGNATURE_FALLBACK_BYTES) {
    if (signature.slice(2, 4) !== "00") return { error: "a 66-byte signature must start with 0x00" };
    return { prefix: "0x00", sig65: slice(signature as Hex, 1) };
  }
  return { error: `unsupported signature length ${String(bytes)} (expected 86 or 66 bytes)` };
}

// Which digest form the owner signed: raw ECDSA over the wrapped digest, or EIP-191 over its 32 bytes.
export async function signatureForm(wrapped: Hex, sig65: Hex, owner: Address): Promise<"raw" | "eip191" | null> {
  const recovers = async (hash: Hex): Promise<boolean> => {
    try {
      return getAddress(await recoverAddress({ hash, signature: sig65 })) === getAddress(owner);
    } catch {
      return false;
    }
  };
  if (await recovers(wrapped)) return "raw";
  if (await recovers(hashMessage({ raw: wrapped }))) return "eip191";
  return null;
}

// ---- chain reads (the real contracts run on the local chain) ---------------------------------------------------------------

export async function accountCode(chains: MockChains, account: Address): Promise<Hex> {
  if (chains.xo === undefined) return "0x";
  return chains.call<Hex>("xo", "eth_getCode", [account, "latest"]);
}

// The owner the deployed ECDSA validator holds for this account, or null (not deployed, or no owner).
export async function accountOwner(chains: MockChains, account: Address): Promise<Address | null> {
  const data = encodeFunctionData({ abi: ECDSA_VALIDATOR_ABI, functionName: "ecdsaValidatorStorage", args: [account] });
  const answer = await chains.tryCall("xo", ECDSA_VALIDATOR, data);
  if (answer === null || answer.length < 66) return null;
  const owner = getAddress(slice(answer, 12, 32));
  return owner === "0x0000000000000000000000000000000000000000" ? null : owner;
}

// Kernel.isValidSignature(hash, signature) on the deployed account: the exact call the exchange (and the
// gateway's ERC-1271 fallback) makes.
export async function isValidSignature1271(chains: MockChains, account: Address, hash: Hex, signature: Hex): Promise<boolean> {
  const data = encodeFunctionData({ abi: ERC1271_ABI, functionName: "isValidSignature", args: [hash, signature] });
  const answer = await chains.tryCall("xo", account, data);
  return answer !== null && answer.toLowerCase().startsWith(ERC1271_MAGIC);
}

// An ERC-6492 wrapper: abi.encode(factory, factoryCalldata, originalSignature) ++ suffix.
export function unwrapErc6492(signature: Hex): { readonly factory: Address; readonly factoryCalldata: Hex; readonly inner: Hex } | null {
  if (size(signature) <= 32 || signature.slice(-64).toLowerCase() !== ERC6492_SUFFIX.slice(2)) return null;
  try {
    const [factory, factoryCalldata, inner] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }, { type: "bytes" }],
      slice(signature, 0, size(signature) - 32),
    );
    return { factory: getAddress(factory), factoryCalldata, inner };
  } catch {
    return null;
  }
}
