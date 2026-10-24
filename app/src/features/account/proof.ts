// The ownership proof the markets API accepts for a request made on behalf of a trading account (docs/unified-account-
// design.md section 3.3): header `x-im-proof: <account>.<unix-seconds>.<signature>`, where the signature is E's
// personal_sign over the text
//   insurance-markets <METHOD> <path> <unix-seconds> <sha256-hex of the body>
// The body hash is lowercase hex without 0x, taken over the exact body bytes sent; a request without a body hashes the
// empty string. The server accepts it within 300 seconds and only when the recovered address is the account the request
// acts for. Signing it needs no prompt: E is the page's own key.

import { sha256, stringToBytes, type Address, type Hex } from "viem";

export const PROOF_HEADER = "x-im-proof";

export interface ProofSigner {
  readonly address: Address;
  signMessage(message: string): Promise<Hex>;
}

export function proofText(method: string, path: string, unixSeconds: number, body: string): string {
  return `insurance-markets ${method.toUpperCase()} ${path} ${unixSeconds} ${sha256(stringToBytes(body)).slice(2)}`;
}

// The header value. `path` is the request path with its query, exactly as sent (for example /v1/account-backup/ab12).
export async function ownershipProof(signer: ProofSigner, request: { readonly method: string; readonly path: string; readonly body?: string; readonly nowMs: number }): Promise<string> {
  const seconds = Math.floor(request.nowMs / 1000);
  const signature = await signer.signMessage(proofText(request.method, request.path, seconds, request.body ?? ""));
  return `${signer.address}.${seconds}.${signature}`;
}
