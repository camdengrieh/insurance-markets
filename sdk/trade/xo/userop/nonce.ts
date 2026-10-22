// Kernel v3 nonce lanes and the EntryPoint nonce read.
//
// A 32-byte nonce is   mode (1) | type (1) | identifier (20) | key (2) | sequence (8).
//   mode 0x00 = default (0x01 would be enable mode, never used here)
//   type 0x00 = root validator (Kernel substitutes its stored root validator and ignores the identifier)
//   identifier = the ECDSA validator for XO-app accounts (zeros on the operator accounts we only decode)
//   key = a free 16-bit lane; sequence = the counter inside the lane
// EntryPoint.getNonce(sender, key192) takes the UPPER 192 bits (nonce >> 64) as `key` and returns the
// full next nonce. Source: docs/research/21-userop-templates.md section 3 (161 and 236 ops decoded;
// a live non-zero key 0x0032 exists, V2.3) and docs/phase1-gap-closing.md section 2.1 row `Nonce layout`.

import { decodeAbiParameters, encodeFunctionData, getAddress, pad, toHex } from "viem";

import { ENTRY_POINT_ABI } from "../../../chain/xo/abi.js";
import { ECDSA_VALIDATOR, FIRST_OP_NONCE, GET_NONCE_SELECTOR, NONCE_KEY_SHIFT, type Address, type Hex } from "../../../chain/xo/constants.js";
import { UserOpError, requireAddress, requireHex, requireUint } from "./encode.js";

const SEQUENCE_MASK = (1n << NONCE_KEY_SHIFT) - 1n;
const MAX_LANE_KEY = 0xffff;

export interface KernelNonceParts {
  readonly mode: number;
  readonly type: number;
  readonly identifier: Address;
  // The 16-bit lane inside the validator's space.
  readonly key: number;
  readonly sequence: bigint;
}

export interface KernelNonceInput {
  readonly sequence: bigint | number;
  readonly key?: number;
  readonly validator?: string;
  readonly mode?: number;
  readonly type?: number;
}

// Builds a nonce. Defaults are the only lane this plugin uses: mode 0, type 0 (root), the pinned ECDSA
// validator, lane 0.
export function kernelNonce(input: KernelNonceInput): bigint {
  const sequence = requireUint(input.sequence, "sequence", 64);
  const key = Number(requireUint(input.key ?? 0, "key", 16));
  const mode = Number(requireUint(input.mode ?? 0, "mode", 8));
  const type = Number(requireUint(input.type ?? 0, "type", 8));
  const identifier = BigInt(requireAddress(input.validator ?? ECDSA_VALIDATOR, "validator"));
  return (BigInt(mode) << 248n) | (BigInt(type) << 240n) | (identifier << 80n) | (BigInt(key) << NONCE_KEY_SHIFT) | sequence;
}

export function decodeKernelNonce(nonce: bigint): KernelNonceParts {
  const n = requireUint(nonce, "nonce", 256);
  return {
    mode: Number((n >> 248n) & 0xffn),
    type: Number((n >> 240n) & 0xffn),
    identifier: getAddress(pad(toHex((n >> 80n) & ((1n << 160n) - 1n)), { size: 20 })),
    key: Number((n >> NONCE_KEY_SHIFT) & 0xffffn),
    sequence: n & SEQUENCE_MASK,
  };
}

// The nonce of an account's first operation (sequence 0, lane 0, root, ECDSA validator), from the
// pinned constant. A deploying operation must use exactly this.
export function firstOpNonce(): bigint {
  return BigInt(FIRST_OP_NONCE);
}

// The `key` argument of EntryPoint.getNonce (and of nonce >> 64): the upper 192 bits.
export function nonceLaneKey(nonce: bigint): bigint {
  return requireUint(nonce, "nonce", 256) >> NONCE_KEY_SHIFT;
}

// The uint192 key of a lane: mode | type | validator | key, i.e. what to ask getNonce for.
export function laneKeyFor(input: Omit<KernelNonceInput, "sequence"> = {}): bigint {
  return nonceLaneKey(kernelNonce({ ...input, sequence: 0n }));
}

// eth_call data for EntryPoint.getNonce(sender, key). The result is the full next nonce.
export function getNonceCallData(sender: string, laneKey: bigint = laneKeyFor()): Hex {
  const data = encodeFunctionData({
    abi: ENTRY_POINT_ABI,
    functionName: "getNonce",
    args: [requireAddress(sender, "sender"), requireUint(laneKey, "laneKey", 192)],
  }).toLowerCase() as Hex;
  if (data.slice(0, 10) !== GET_NONCE_SELECTOR) throw new UserOpError("invalid_input", "getNonce selector drifted from the pinned value");
  return data;
}

// eth_call result of getNonce: one 32-byte word.
export function decodeGetNonceResult(returnData: unknown): bigint {
  const data = requireHex(returnData, "getNonce result", { bytes: 32 });
  const [nonce] = decodeAbiParameters([{ type: "uint256" }], data);
  return nonce;
}

// The explorer-log fallback (UO3): the next nonce is the last UserOperationEvent nonce of the sender in
// that lane plus one. A full lane (sequence 2^64 - 1) has no next nonce.
export function nextNonceAfter(lastUsed: bigint): bigint {
  const last = requireUint(lastUsed, "last nonce", 256);
  if ((last & SEQUENCE_MASK) === SEQUENCE_MASK) throw new UserOpError("invalid_nonce", "the nonce lane is full");
  return last + 1n;
}

// The lane this plugin signs in: mode 0, type 0 (root), identifier = the pinned ECDSA validator. Anything
// else (enable mode, a permission or another validator) is a different instruction. `key` pins the lane
// when given. Throws `invalid_nonce`.
export function assertDefaultRootLane(nonce: bigint, options: { key?: number } = {}): KernelNonceParts {
  let parts: KernelNonceParts;
  try {
    parts = decodeKernelNonce(nonce);
  } catch {
    throw new UserOpError("invalid_nonce", "the nonce is not a uint256");
  }
  if (parts.mode !== 0) throw new UserOpError("invalid_nonce", "nonce mode must be 0 (default)");
  if (parts.type !== 0) throw new UserOpError("invalid_nonce", "nonce type must be 0 (root validator)");
  if (parts.identifier !== getAddress(ECDSA_VALIDATOR)) throw new UserOpError("invalid_nonce", "nonce identifier must be the pinned ECDSA validator");
  if (options.key !== undefined) {
    if (!Number.isInteger(options.key) || options.key < 0 || options.key > MAX_LANE_KEY) throw new UserOpError("invalid_nonce", "lane key out of range");
    if (parts.key !== options.key) throw new UserOpError("invalid_nonce", "nonce is in a different lane than expected");
  }
  return parts;
}
