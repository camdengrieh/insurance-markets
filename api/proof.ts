import { createHash } from "node:crypto";

import { getAddress, isAddress, recoverMessageAddress, type Address, type Hex } from "viem";

// The ownership proof (docs/unified-account-design.md section 3.3): a request that acts for a trading account E, and that
// nothing else in it authenticates, carries
//
//   x-im-proof: <account>.<unix-seconds>.<signature>
//
// where <signature> is E's personal_sign (EIP-191) over the text
//
//   insurance-markets <METHOD> <path> <unix-seconds> <sha256hex>
//
// where <sha256hex> is the lower-case hex sha256 of the exact body bytes, and for a request without a body the sha256 of
// the empty string (e3b0c442...b855): the form the browser account sends.
//
// It is accepted within PROOF_WINDOW_S of the server's clock (either side), and the address recovered from it must equal
// <account>, which must equal the account the request acts for. The recovery is plain ECDSA: E is a key in the visitor's
// browser (an EIP-7702 delegation leaves its key unchanged), so no ERC-1271 call is made.
//
// What the design leaves open, and how this server reads it (api/README.md "Unified account routes"):
//   - <path> is the request path on this API as the browser sent it. A route that takes a query accepts the path with its
//     query exactly as sent, and also the path alone (the account a proof acts for is bound either way by the recovery).
//   - a request without a body may also sign the empty string after the last space, or no last space at all (the
//     design's first wording, "or empty string"): with the sha256 of the empty body, all three bind the same nothing.
//   - a proof may be presented again within its window (a retry); every route that takes one is safe to repeat (a
//     deploy, a cancel, a read).

export const PROOF_HEADER = "x-im-proof";
export const PROOF_WINDOW_S = 300;
export const PROOF_PREFIX = "insurance-markets";

const HEADER = /^(0x[0-9a-fA-F]{40})\.([1-9][0-9]{0,11})\.(0x[0-9a-fA-F]{130})$/;
const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");

export function sha256Hex(body: Buffer | string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function proofMessage(method: string, path: string, unixSeconds: number, bodyHash: string): string {
  return `${PROOF_PREFIX} ${method} ${path} ${unixSeconds} ${bodyHash}`;
}

export interface ProofRequest {
  readonly header: string | string[] | undefined;
  readonly method: string;
  // The path as sent, and the raw query ("" or "?...").
  readonly path: string;
  readonly search: string;
  readonly body: Buffer;
  readonly nowMs: number;
  // The account the request acts for, when the body or query names one: the proof must be for it.
  readonly account?: string;
}

export type ProofResult =
  | { readonly ok: true; readonly account: Address }
  | { readonly ok: false; readonly code: "proof_required" | "proof_invalid"; readonly message: string };

// The messages a proof for this request may have signed, in the order they are tried.
export function candidateMessages(request: Omit<ProofRequest, "header" | "nowMs" | "account">, unixSeconds: number): string[] {
  const paths = request.search === "" ? [request.path] : [`${request.path}${request.search}`, request.path];
  const out: string[] = [];
  for (const path of paths) {
    if (request.body.length > 0) out.push(proofMessage(request.method, path, unixSeconds, sha256Hex(request.body)));
    else {
      out.push(proofMessage(request.method, path, unixSeconds, ""));
      out.push(proofMessage(request.method, path, unixSeconds, "").trimEnd());
      out.push(proofMessage(request.method, path, unixSeconds, EMPTY_SHA256));
    }
  }
  return out;
}

export async function verifyProof(request: ProofRequest): Promise<ProofResult> {
  const header = request.header;
  if (header === undefined) return { ok: false, code: "proof_required", message: `This route acts for an account: send ${PROOF_HEADER}: <account>.<unix-seconds>.<signature> (docs/unified-account-design.md section 3.3).` };
  if (typeof header !== "string") return { ok: false, code: "proof_invalid", message: `Send one ${PROOF_HEADER} header.` };
  const match = HEADER.exec(header.trim());
  if (match === null) return { ok: false, code: "proof_invalid", message: `The ${PROOF_HEADER} header is not <0x account>.<unix seconds>.<0x 65-byte signature>.` };
  const [, rawAccount, rawSeconds, signature] = match as unknown as [string, string, string, Hex];
  if (!isAddress(rawAccount, { strict: false })) return { ok: false, code: "proof_invalid", message: "The proof's account is not an address." };
  const account = getAddress(rawAccount);
  if (request.account !== undefined && request.account.toLowerCase() !== account.toLowerCase()) return { ok: false, code: "proof_invalid", message: "The proof is for another account than the one this request acts for." };
  const seconds = Number(rawSeconds);
  if (Math.abs(request.nowMs / 1000 - seconds) > PROOF_WINDOW_S) return { ok: false, code: "proof_invalid", message: `The proof is older or newer than ${PROOF_WINDOW_S} seconds; sign a fresh one.` };
  for (const message of candidateMessages(request, seconds)) {
    let recovered: Address;
    try {
      recovered = await recoverMessageAddress({ message, signature });
    } catch {
      return { ok: false, code: "proof_invalid", message: "The proof's signature does not recover." };
    }
    if (recovered.toLowerCase() === account.toLowerCase()) return { ok: true, account };
  }
  return { ok: false, code: "proof_invalid", message: "The proof was not signed by its account over this method, path, time and body." };
}
