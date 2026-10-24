// Generated mode's key wrapping (docs/unified-account-design.md section 1, "Create one"; note 46 section 3.1): a random
// secp256k1 key, encrypted with AES-256-GCM under a key that HKDF-SHA-256 draws from the WebAuthn PRF output of the
// visitor's passkey. The PRF output never leaves this tab and is never stored; the passkey's authenticator gives the same
// output for the same credential and salt every time, on every device the passkey syncs to, so the ciphertext alone
// (in IndexedDB, and as a backup on our API, which cannot decrypt it) is enough to unlock again.
//
// Everything here is WebCrypto (crypto.subtle) and viem's key generation, which reads WebCrypto's random source. The
// additional authenticated data binds a ciphertext to its credential id and to E's address, so a blob moved to another
// credential or edited to name another address fails to open instead of opening as something else.

import { bytesToHex, hexToBytes, isAddressEqual, sha256, stringToBytes, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import * as z from "zod/v4";

export const VAULT_VERSION = 1;

// The fixed PRF input (32 bytes). One value for every passkey: the authenticator mixes it with its own per-credential
// secret, so equal salts never give equal outputs across credentials.
export const PRF_SALT: Uint8Array = hexToBytes(sha256(stringToBytes("insurance-markets trading key prf v1")));
const HKDF_SALT: Uint8Array = stringToBytes("insurance-markets trading key wrap v1");

const HEX = /^[0-9a-f]+$/;

// What is stored and backed up: no key, no PRF output, nothing that opens without the passkey.
export const sealedKeySchema = z
  .object({
    version: z.literal(VAULT_VERSION),
    credentialId: z.string().regex(HEX).min(2).max(2048),
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    iv: z.string().regex(HEX).length(24),
    // 32 key bytes plus the 16-byte tag.
    ciphertext: z.string().regex(HEX).length(96),
  })
  .strict();

export type SealedKey = z.infer<typeof sealedKeySchema> & { readonly address: Address };

export function parseSealedKey(value: unknown): SealedKey | null {
  const parsed = sealedKeySchema.safeParse(value);
  return parsed.success ? (parsed.data as SealedKey) : null;
}

function plainHex(bytes: Uint8Array): string {
  return bytesToHex(bytes).slice(2);
}

// The credential id as the store and the backup route name it: lowercase hex, no 0x.
export function credentialIdHex(rawId: ArrayBuffer | Uint8Array): string {
  return plainHex(rawId instanceof Uint8Array ? rawId : new Uint8Array(rawId));
}

function additionalData(credentialId: string, address: Address): Uint8Array<ArrayBuffer> {
  return new Uint8Array(stringToBytes(`insurance-markets trading key v${VAULT_VERSION} ${credentialId} ${address.toLowerCase()}`));
}

function buffer(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

// The AES-GCM key the PRF output wraps E with. Not extractable.
export async function wrappingKeyFromPrf(subtle: SubtleCrypto, prfOutput: Uint8Array, credentialId: string): Promise<CryptoKey> {
  if (prfOutput.length < 32) throw new RangeError("the PRF output is shorter than 32 bytes");
  const material = await subtle.importKey("raw", buffer(prfOutput), "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: buffer(HKDF_SALT), info: buffer(stringToBytes(`credential ${credentialId}`)) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface SealInput {
  readonly subtle: SubtleCrypto;
  readonly wrappingKey: CryptoKey;
  readonly credentialId: string;
  readonly privateKey: Hex;
  // 12 random bytes for the nonce.
  readonly randomBytes: (length: number) => Uint8Array;
}

export async function sealTradingKey(input: SealInput): Promise<SealedKey> {
  const address = privateKeyToAccount(input.privateKey).address;
  const iv = input.randomBytes(12);
  if (iv.length !== 12) throw new RangeError("the nonce must be 12 bytes");
  const sealed = await input.subtle.encrypt({ name: "AES-GCM", iv: buffer(iv), additionalData: additionalData(input.credentialId, address) }, input.wrappingKey, buffer(hexToBytes(input.privateKey)));
  return { version: VAULT_VERSION, credentialId: input.credentialId, address, iv: plainHex(iv), ciphertext: plainHex(new Uint8Array(sealed)) };
}

export type OpenResult = { readonly ok: true; readonly privateKey: Hex; readonly address: Address } | { readonly ok: false; readonly reason: "wrong_passkey" | "damaged" };

// Opens a sealed key. "wrong_passkey": the tag does not verify (another passkey, or an edited blob). "damaged": it opens
// to something that is not the key of the address it names.
export async function openTradingKey(subtle: SubtleCrypto, wrappingKey: CryptoKey, sealed: SealedKey): Promise<OpenResult> {
  let plain: ArrayBuffer;
  try {
    plain = await subtle.decrypt({ name: "AES-GCM", iv: buffer(hexToBytes(`0x${sealed.iv}`)), additionalData: additionalData(sealed.credentialId, sealed.address) }, wrappingKey, buffer(hexToBytes(`0x${sealed.ciphertext}`)));
  } catch {
    return { ok: false, reason: "wrong_passkey" };
  }
  const bytes = new Uint8Array(plain);
  if (bytes.length !== 32) return { ok: false, reason: "damaged" };
  const privateKey = bytesToHex(bytes);
  let address: Address;
  try {
    address = privateKeyToAccount(privateKey).address;
  } catch {
    return { ok: false, reason: "damaged" };
  }
  if (!isAddressEqual(address, sealed.address)) return { ok: false, reason: "damaged" };
  return { ok: true, privateKey, address };
}

// A new random trading key (viem draws it from crypto.getRandomValues).
export function newTradingKey(): Hex {
  return generatePrivateKey();
}
