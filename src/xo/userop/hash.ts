// userOpHash for EntryPoint v0.7 on XO chain 3223.
//
//   inner      = keccak256(abi.encode(sender, nonce, keccak256(initCode), keccak256(callData),
//                                     accountGasLimits, preVerificationGas, gasFees, keccak256(paymasterAndData)))
//   userOpHash = keccak256(abi.encode(inner, entryPoint, chainId))
//
// The signature is not part of the hash; paymasterAndData is hashed in full. H: equal to the hash in the
// UserOperationEvent log for 9 of 9 and 22 of 22 real operations, to the on-chain getUserOpHash for 7 of 7
// and 3 of 3, and to viem's own getUserOperationHash (docs/research/21-userop-templates.md section 5 and
// V1.1; test/userop-pack-hash.test.ts repeats the viem comparison).

import { encodeAbiParameters, hashMessage, keccak256 } from "viem";

import { ENTRY_POINT_V07, XO_CHAIN_ID, type Address, type Hex } from "../chain/constants.js";
import { assertPackedStructure, type PackedUserOp } from "./pack.js";

const PACKED_TYPES = [
  { type: "address" },
  { type: "uint256" },
  { type: "bytes32" },
  { type: "bytes32" },
  { type: "bytes32" },
  { type: "uint256" },
  { type: "bytes32" },
  { type: "bytes32" },
] as const;

// Test and cross-check seam: the hash under another EntryPoint or chain id (a mutation test, a local
// anvil with a different id). Production code calls `userOpHash`, which has both pinned.
export function userOpHashUnder(op: PackedUserOp, entryPoint: Address, chainId: bigint): Hex {
  const c = assertPackedStructure(op);
  const inner = keccak256(
    encodeAbiParameters(PACKED_TYPES, [
      c.sender,
      c.nonce,
      keccak256(c.initCode),
      keccak256(c.callData),
      c.accountGasLimits,
      c.preVerificationGas,
      c.gasFees,
      keccak256(c.paymasterAndData),
    ]),
  );
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "address" }, { type: "uint256" }], [inner, entryPoint, chainId]));
}

// The 32 bytes the owner signs: EntryPoint v0.7, chain 3223.
export function userOpHash(op: PackedUserOp): Hex {
  return userOpHashUnder(op, ENTRY_POINT_V07, BigInt(XO_CHAIN_ID));
}

export interface SigningDigests {
  // What PayBox's `raw` intent signs as is.
  readonly raw: Hex;
  // What XO's own app signs: personal_sign over the 32 raw bytes.
  readonly eip191: Hex;
}

// The deployed validator accepts a signature over either (it tries the raw hash first, then the
// EIP-191 form), so the verifier checks both [21 section 5, V1.3].
export function signingDigests(hash: Hex): SigningDigests {
  return { raw: hash, eip191: hashMessage({ raw: hash }) };
}
