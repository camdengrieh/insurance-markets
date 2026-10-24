// The connected wallet's answers, turned into the direct path's refusals, and the one check every wallet signature
// passes before anything is sent: it must recover to the connected address over the exact digest the card showed, as a
// signature over that digest itself (the venue recovers it that way; a personal_sign wrapping would recover to a
// stranger there). The same rule the relay applies (sdk/trade/xo/userop/verify.ts verifyDigestSignature, form "raw").

import { verifyDigestSignature } from "@sdk/trade/xo/userop/verify";
import type { Hex } from "viem";

import { WalletError, type WalletSigner } from "../../../core/signer";
import { ownershipProof } from "../../account/proof";
import { venueText } from "./text";
import { ok, refuse, type DirectResult } from "./types";

export function walletRefusal<T>(error: unknown, what: string): DirectResult<T> {
  if (error instanceof WalletError) {
    switch (error.code) {
      case "rejected":
        return refuse("wallet_rejected", `You declined ${what} in your wallet. Nothing was sent.`);
      case "unsupported":
        return refuse("wallet_unsupported", `Your wallet cannot do ${what}. Nothing was sent.`, venueText(error.message));
      case "unsupported_chain":
        return refuse("wallet_wrong_chain", `Your wallet would not use the chain ${what} needs. Nothing was sent.`, venueText(error.message));
      case "disconnected":
        return refuse("wallet_disconnected", "Your wallet disconnected. Nothing was sent; connect it again.");
      default:
        return refuse("wallet_failed", `Your wallet did not complete ${what}. Nothing was sent.`, venueText(error.message));
    }
  }
  return refuse("wallet_failed", `Your wallet did not complete ${what}. Nothing was sent.`, error instanceof Error ? venueText(error.message) : null);
}

// Whether the wallet's session covers a chain at all, before it is asked anything.
export function walletCovers(signer: WalletSigner, chainId: number): boolean {
  return signer.capabilities.chains === "any" || signer.capabilities.chains.includes(chainId);
}

// The canonical 65 bytes (v 27 or 28, low s) of a signature that recovers to the signer over `digest`, or a refusal.
export async function checkedSignature(signer: WalletSigner, digest: Hex, signature: unknown): Promise<DirectResult<Hex>> {
  const verified = await verifyDigestSignature({ userOpHash: digest, signature, expectedOwner: signer.address });
  if (!verified.ok) {
    return refuse("signature_mismatch", verified.code === "owner_mismatch" ? "The signature your wallet returned is not from the connected address over the digest on the card. Nothing was sent." : "Your wallet returned something that is not a 65-byte signature. Nothing was sent.");
  }
  if (verified.form !== "raw") return refuse("signature_mismatch", "Your wallet signed the digest as a personal message (EIP-191), which the venue would not accept. Nothing was sent.");
  return ok(verified.signature);
}

// The account's ownership proof for one request to our markets API (features/account/proof.ts, design section 3.3), as a
// result: a key that will not sign is a refusal, never a throw. `path` is the request path with its query, as sent.
export async function proofFor(signer: WalletSigner, request: { readonly method: "GET" | "POST"; readonly path: string; readonly body?: string }, nowMs: number): Promise<DirectResult<string>> {
  try {
    return ok(await ownershipProof(signer, { ...request, nowMs }));
  } catch (error) {
    return walletRefusal(error, "the proof that this account is yours");
  }
}
