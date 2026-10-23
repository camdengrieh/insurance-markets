import type { Address } from "viem";

import { proofRecovers, type BindingProof, type BindingResult, type BindingsStore } from "../../../core/bindings";
import type { WalletSigner } from "../../../core/signer";
import { walletErrorOf } from "./errors";

// "Save this address": the connected wallet signs a short plain text that proves it controls the address, in the
// EIP-4361 layout so a wallet shows it as a sign-in rather than an unknown blob. The text names this page's host, the
// address, a fixed statement that it signs nothing else, the chain, a fresh nonce and the time. The page checks the
// signature itself, offline: when it recovers to the address it is a plain key signature and the binding is saved as
// verified; when it does not, the address may be a smart account that signs through its contract (ERC-1271), which
// the page cannot check without a chain read, so the binding is saved with the proof marked unverified.

export const PROOF_STATEMENT = "Prove you control this address for this page. This signs nothing else.";

export interface ProofText {
  readonly host: string;
  readonly origin: string;
  readonly address: Address;
  readonly chainId: number;
  readonly nonce: string;
  readonly issuedAt: string;
}

export function proofMessage(text: ProofText): string {
  return [
    `${text.host} wants you to sign in with your Ethereum account:`,
    text.address,
    "",
    PROOF_STATEMENT,
    "",
    `URI: ${text.origin}`,
    "Version: 1",
    `Chain ID: ${text.chainId}`,
    `Nonce: ${text.nonce}`,
    `Issued At: ${text.issuedAt}`,
  ].join("\n");
}

// 16 base-36 characters from the platform's random source (EIP-4361 wants at least 8 alphanumerics).
export function proofNonce(random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes)): string {
  return [...random(new Uint8Array(16))].map((byte) => (byte % 36).toString(36)).join("");
}

export type ProofOutcome =
  | { readonly ok: true; readonly verified: boolean; readonly result: BindingResult }
  | { readonly ok: false; readonly message: string; readonly declined: boolean };

export interface ProofContext {
  readonly host: string;
  readonly origin: string;
  readonly nowIso: string;
  readonly nonce?: string;
}

// Asks the wallet to sign, checks the signature and saves the binding. Never throws: a refusal or failure comes back
// as words.
export async function saveSignedAddress(signer: WalletSigner, store: BindingsStore, context: ProofContext): Promise<ProofOutcome> {
  let message: string;
  let signature: string;
  try {
    const chainId = await signer.chainId();
    message = proofMessage({ host: context.host, origin: context.origin, address: signer.address, chainId, nonce: context.nonce ?? proofNonce(), issuedAt: context.nowIso });
    signature = await signer.signMessage(message);
  } catch (error) {
    const mapped = walletErrorOf(error);
    return { ok: false, message: mapped.message, declined: mapped.code === "rejected" };
  }
  const verified = await proofRecovers(signer.address, { message, signature });
  const proof: BindingProof = { method: "eip191_personal_sign", verified, signedAt: context.nowIso, message, signature };
  const result = await store.addSigned({ address: signer.address, proof });
  if (!result.ok) return { ok: false, message: result.message, declined: false };
  return { ok: true, verified, result };
}
