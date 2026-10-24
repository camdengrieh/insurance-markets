// The passkey that unlocks a generated trading key (vault.ts): created and asserted by this page through WebAuthn with
// the PRF extension. The page uses the passkey only for its PRF output; no server checks the assertion, so the challenge
// is random bytes that nothing verifies, and the credential's public key is not kept.
//
// PRF support differs by browser and by authenticator (note 46 section 3.1: Chrome and Edge 116+, Firefox desktop 139+,
// Safari 18+ for platform passkeys, not Firefox Android's get). The page asks the browser first where it can
// (PublicKeyCredential.getClientCapabilities, "extension:prf") and otherwise learns it from the answer: a passkey made
// without PRF cannot wrap a key, and the page says this browser cannot create a trading account and offers Connect.

import { credentialIdHex, PRF_SALT } from "./vault";

export type PrfSupport = "yes" | "no" | "unknown";

export type PasskeyFailure =
  // No WebAuthn here at all, or the browser or authenticator answered without a PRF output.
  | "no_prf"
  // The person cancelled, or the browser refused (NotAllowedError covers both).
  | "cancelled"
  | "failed";

export type PasskeyResult =
  | { readonly ok: true; readonly credentialId: string; readonly prf: Uint8Array }
  | { readonly ok: false; readonly reason: PasskeyFailure; readonly message: string };

export interface PasskeyPort {
  support(): Promise<PrfSupport>;
  // A new discoverable passkey for this site, with its PRF output (one or two prompts, by authenticator).
  create(): Promise<PasskeyResult>;
  // The PRF output of an existing passkey: the one named, or (null) whichever the person picks.
  assert(credentialId: string | null): Promise<PasskeyResult>;
}

// The slice of the browser the port uses, injectable for tests.
export interface WebAuthnHost {
  readonly credentials: Pick<CredentialsContainer, "create" | "get"> | null;
  readonly getClientCapabilities: (() => Promise<Record<string, boolean | undefined>>) | null;
  readonly randomBytes: (length: number) => Uint8Array;
}

export const NO_PRF_MESSAGE = "This browser cannot create a trading account with a passkey: it, or the passkey provider, does not offer the passkey feature this needs (WebAuthn PRF). Connect a wallet instead.";

function buffer(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.length; index += 1) out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return out;
}

function prfFirst(credential: PublicKeyCredential): Uint8Array | null {
  const results = credential.getClientExtensionResults().prf?.results?.first;
  if (results === undefined) return null;
  const bytes = results instanceof ArrayBuffer ? new Uint8Array(results) : new Uint8Array(results.buffer, results.byteOffset, results.byteLength);
  return bytes.length >= 32 ? new Uint8Array(bytes) : null;
}

function failureOf(error: unknown): PasskeyResult {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return { ok: false, reason: "cancelled", message: "The passkey prompt was cancelled or timed out. Nothing was made." };
  if (name === "NotSupportedError") return { ok: false, reason: "no_prf", message: NO_PRF_MESSAGE };
  return { ok: false, reason: "failed", message: "The browser could not complete the passkey request. Nothing was made." };
}

function isPublicKeyCredential(value: unknown): value is PublicKeyCredential {
  return typeof value === "object" && value !== null && "rawId" in value && typeof (value as { getClientExtensionResults?: unknown }).getClientExtensionResults === "function";
}

export function createPasskeyPort(host: WebAuthnHost): PasskeyPort {
  const credentials = host.credentials;

  async function support(): Promise<PrfSupport> {
    if (credentials === null) return "no";
    if (host.getClientCapabilities === null) return "unknown";
    try {
      const capabilities = await host.getClientCapabilities();
      const prf = capabilities["extension:prf"];
      return prf === true ? "yes" : prf === false ? "no" : "unknown";
    } catch {
      return "unknown";
    }
  }

  async function assert(credentialId: string | null): Promise<PasskeyResult> {
    if (credentials === null) return { ok: false, reason: "no_prf", message: NO_PRF_MESSAGE };
    let answer: Credential | null;
    try {
      answer = await credentials.get({
        publicKey: {
          challenge: buffer(host.randomBytes(32)),
          userVerification: "required",
          timeout: 120_000,
          allowCredentials: credentialId === null ? [] : [{ type: "public-key", id: hexBytes(credentialId) }],
          extensions: { prf: { eval: { first: buffer(PRF_SALT) } } },
        },
      });
    } catch (error) {
      return failureOf(error);
    }
    if (!isPublicKeyCredential(answer)) return { ok: false, reason: "failed", message: "The browser returned no passkey. Nothing was opened." };
    const prf = prfFirst(answer);
    if (prf === null) return { ok: false, reason: "no_prf", message: NO_PRF_MESSAGE };
    return { ok: true, credentialId: credentialIdHex(answer.rawId), prf };
  }

  async function create(): Promise<PasskeyResult> {
    if (credentials === null || (await support()) === "no") return { ok: false, reason: "no_prf", message: NO_PRF_MESSAGE };
    let answer: Credential | null;
    try {
      answer = await credentials.create({
        publicKey: {
          rp: { name: "insurance-markets" },
          // A random handle: the passkey names no person. The label is what the password manager lists.
          user: { id: buffer(host.randomBytes(16)), name: "Trading account", displayName: "Trading account" },
          challenge: buffer(host.randomBytes(32)),
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
          timeout: 120_000,
          attestation: "none",
          extensions: { prf: { eval: { first: buffer(PRF_SALT) } } },
        },
      });
    } catch (error) {
      return failureOf(error);
    }
    if (!isPublicKeyCredential(answer)) return { ok: false, reason: "failed", message: "The browser returned no passkey. Nothing was made." };
    const id = credentialIdHex(answer.rawId);
    // Some authenticators give the PRF output at creation; the others only say PRF is enabled and need one assertion.
    const atCreate = prfFirst(answer);
    if (atCreate !== null) return { ok: true, credentialId: id, prf: atCreate };
    if (answer.getClientExtensionResults().prf?.enabled !== true) return { ok: false, reason: "no_prf", message: NO_PRF_MESSAGE };
    const asserted = await assert(id);
    if (asserted.ok && asserted.credentialId !== id) return { ok: false, reason: "failed", message: "The browser answered with a different passkey from the one just made. Nothing was made." };
    return asserted;
  }

  return { support, create, assert };
}

// The page's own browser, read lazily.
export function browserWebAuthnHost(): WebAuthnHost {
  const credentials = typeof navigator !== "undefined" && navigator.credentials !== undefined && typeof PublicKeyCredential !== "undefined" ? navigator.credentials : null;
  const capabilities = typeof PublicKeyCredential !== "undefined" && typeof PublicKeyCredential.getClientCapabilities === "function" ? () => PublicKeyCredential.getClientCapabilities() as Promise<Record<string, boolean | undefined>> : null;
  return { credentials, getClientCapabilities: capabilities, randomBytes: (length) => globalThis.crypto.getRandomValues(new Uint8Array(length)) };
}
