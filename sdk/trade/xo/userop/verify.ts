// The check that runs after PayBox signs and before anything is sent (invariant 3, assumption UO1):
// recompute the userOpHash from the stored fields, recover the signer under BOTH digest forms the deployed
// validator accepts, and require it to be the owner.
//
//   raw     ecrecover(userOpHash, sig)                              PayBox `raw` intent; the operator accounts
//   eip191  ecrecover(hashMessage(raw: userOpHash), sig)            XO's own app (personal_sign over 32 bytes)
//
// The signature is normalised first (v 0 or 1 to 27 or 28, high s to low s; sign.ts), so what is returned,
// and what a caller should send, is the canonical 65 bytes. Which form matched is reported, never assumed.
// Nothing here throws on bad input: every failure is a result with a code the relay maps to an error.

import { recoverAddress } from "viem";

import { AccountError, deriveAccount, parseOwner } from "../account/derive.js";
import type { Address, Hex } from "../../../chain/xo/constants.js";
import { UserOpError } from "./encode.js";
import { signingDigests, userOpHash } from "./hash.js";
import { assertXoShape, withSignature, type PackedUserOp } from "./pack.js";
import { normalizeSignature } from "./sign.js";

export type SignatureForm = "raw" | "eip191";

export type VerifyFailureCode = "signature_invalid" | "owner_mismatch" | "sender_mismatch" | "invalid_userop" | "invalid_address";

export interface VerifyFailure {
  readonly ok: false;
  readonly code: VerifyFailureCode;
  readonly message: string;
  // Present when the signature was well-formed but recovered to somebody else (public addresses).
  readonly recovered?: { readonly raw: Address | null; readonly eip191: Address | null };
}

export interface VerifySuccess {
  readonly ok: true;
  readonly owner: Address;
  readonly form: SignatureForm;
  readonly userOpHash: Hex;
  // The digest the signature is valid over.
  readonly digest: Hex;
  // Canonical 65 bytes (v 27 or 28, low s).
  readonly signature: Hex;
  readonly rewroteV: boolean;
  readonly flippedHighS: boolean;
}

export type VerifyResult = VerifySuccess | VerifyFailure;

function failure(code: VerifyFailureCode, message: string, recovered?: VerifyFailure["recovered"]): VerifyFailure {
  return recovered === undefined ? { ok: false, code, message } : { ok: false, code, message, recovered };
}

async function recoverOrNull(hash: Hex, signature: Hex): Promise<Address | null> {
  try {
    return await recoverAddress({ hash, signature });
  } catch {
    return null;
  }
}

export interface VerifyDigestInput {
  readonly userOpHash: Hex;
  // 65-byte hex, or r and s with a recovery id or v (what PayBox may return).
  readonly signature: unknown;
  readonly expectedOwner: string;
}

// Low level: a signature against a hash the CALLER computed. Prefer verifyUserOpSignature, which
// recomputes the hash from the stored operation.
export async function verifyDigestSignature(input: VerifyDigestInput): Promise<VerifyResult> {
  let owner: Address;
  try {
    owner = parseOwner(input.expectedOwner);
  } catch (error) {
    if (error instanceof AccountError) return failure("invalid_address", error.message);
    throw error;
  }
  let normalized: ReturnType<typeof normalizeSignature>;
  try {
    normalized = normalizeSignature(input.signature);
  } catch (error) {
    if (error instanceof UserOpError) return failure("signature_invalid", error.message);
    throw error;
  }
  const digests = signingDigests(input.userOpHash);
  const raw = await recoverOrNull(digests.raw, normalized.signature);
  const eip191 = await recoverOrNull(digests.eip191, normalized.signature);
  const match = (candidate: Address | null): boolean => candidate !== null && candidate.toLowerCase() === owner.toLowerCase();
  const form: SignatureForm | null = match(raw) ? "raw" : match(eip191) ? "eip191" : null;
  if (form === null) {
    return failure("owner_mismatch", "the signature does not recover to the owner under the raw or the EIP-191 digest", { raw, eip191 });
  }
  return {
    ok: true,
    owner,
    form,
    userOpHash: input.userOpHash,
    digest: form === "raw" ? digests.raw : digests.eip191,
    signature: normalized.signature,
    rewroteV: normalized.rewroteV,
    flippedHighS: normalized.flippedHighS,
  };
}

export interface VerifyUserOpInput {
  // The stored, unsigned operation (or a signed one; its signature field is ignored).
  readonly op: PackedUserOp;
  readonly signature: unknown;
  readonly expectedOwner: string;
  // Require op.sender to be the account derived from the owner (default true). Only the golden test of
  // XO-run operator accounts, which are not derived from their signer, turns this off.
  readonly requireDerivedSender?: boolean;
}

export type VerifyUserOpResult = (VerifySuccess & { readonly signedOp: PackedUserOp }) | VerifyFailure;

export async function verifyUserOpSignature(input: VerifyUserOpInput): Promise<VerifyUserOpResult> {
  let op: PackedUserOp;
  try {
    op = assertXoShape(input.op);
  } catch (error) {
    if (error instanceof UserOpError) return failure("invalid_userop", error.message);
    throw error;
  }
  if (input.requireDerivedSender !== false) {
    try {
      if (deriveAccount(input.expectedOwner) !== op.sender) {
        return failure("sender_mismatch", "the operation's sender is not the account derived from the owner");
      }
    } catch (error) {
      if (error instanceof AccountError) return failure("invalid_address", error.message);
      throw error;
    }
  }
  const hash = userOpHash(op);
  const result = await verifyDigestSignature({ userOpHash: hash, signature: input.signature, expectedOwner: input.expectedOwner });
  if (!result.ok) return result;
  return { ...result, signedOp: withSignature(op, result.signature) };
}
