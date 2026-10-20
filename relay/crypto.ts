import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import type { Secret } from "../src/config.js";

// Encryption at rest for the relay's secrets (docs/phase1-gap-closing.md section 9 A5, credential
// store spec). Nothing here touches the disk or the network.
//
//   - The master secret never reaches a file: it is stretched by scrypt into a key that lives in
//     memory only. A random per-installation salt and the cost parameters are stored in the keyring
//     file, next to a check value so that a wrong master secret is reported as such at start-up.
//   - Every sealed record is AES-256-GCM with a fresh random 96-bit IV. The account address is the
//     associated data (together with the format, the schema version and the record's purpose), so a
//     record copied into another account's file, or into a backup slot, fails to open.
//   - A schema version is part of the envelope and of the associated data. An unknown version is
//     refused, never guessed at.
//
// Errors carry a stable `code` and fixed text. They never contain key material or plaintext.

export const ENVELOPE_FORMAT = "xo-relay-sealed" as const;
export const KEYRING_FORMAT = "xo-relay-keyring" as const;
export const SCHEMA_VERSION = 1 as const;

export interface KdfParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

// 2^17 with r = 8 uses 128 MiB and takes a fraction of a second, once per start.
export const DEFAULT_KDF: KdfParams = Object.freeze({ N: 131_072, r: 8, p: 1 });
// A keyring file that asks for less than this is refused (unless a test says otherwise), so a
// tampered file cannot weaken the key derivation.
export const MIN_KDF_N = 32_768;
export const MAX_KDF_N = 1_048_576;
const KEY_BYTES = 32;
const SALT_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const MAX_PLAINTEXT_BYTES = 64 * 1024;
export const MIN_MASTER_SECRET_CHARS = 16;
export const MAX_MASTER_SECRET_CHARS = 1024;

export type CryptoErrorCode =
  | "invalid_input"
  | "format"
  | "version"
  | "auth_failed"
  | "wrong_master_key"
  | "weak_kdf";

export class CryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = "CryptoError";
    this.code = code;
  }
}

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");

function fromB64(value: unknown, expectedBytes: number | undefined, what: string): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new CryptoError("format", `The ${what} field is not base64url.`);
  }
  const bytes = Buffer.from(value, "base64url");
  // Only the canonical spelling is accepted, so any edit to the text of a sealed record is noticed
  // (the decoder alone would let the unused trailing bits of the last character change freely).
  if (b64(bytes) !== value) throw new CryptoError("format", `The ${what} field is not canonical base64url.`);
  if (expectedBytes !== undefined && bytes.length !== expectedBytes) {
    throw new CryptoError("format", `The ${what} field has the wrong length.`);
  }
  return bytes;
}

// ---- small helpers -------------------------------------------------------------------------------

export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

// Compares two strings without leaking where they differ or how long the secret is: both sides are
// hashed to a fixed length first.
export function constantTimeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}

// ---- the master key --------------------------------------------------------------------------------

const REDACTED = "[redacted]";

export class MasterKey {
  readonly #bytes: Buffer;
  #destroyed = false;

  private constructor(bytes: Buffer) {
    this.#bytes = bytes;
  }

  static fromDerivedBytes(bytes: Buffer): MasterKey {
    if (bytes.length !== KEY_BYTES) throw new CryptoError("invalid_input", "A master key is 32 bytes.");
    return new MasterKey(Buffer.from(bytes));
  }

  // Independent 32-byte keys for different jobs, so the key that seals secrets is never the key that
  // proves the master secret was right.
  subkey(purpose: string): Buffer {
    if (this.#destroyed) throw new CryptoError("invalid_input", "The master key was destroyed.");
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(purpose)) throw new CryptoError("invalid_input", "Bad key purpose.");
    return Buffer.from(hkdfSync("sha256", this.#bytes, Buffer.alloc(0), `xo-relay/v${SCHEMA_VERSION}/${purpose}`, KEY_BYTES));
  }

  destroy(): void {
    this.#bytes.fill(0);
    this.#destroyed = true;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}

function scryptAsync(password: Buffer, salt: Uint8Array, kdf: KdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * kdf.N * kdf.r }, (error, key) => {
      if (error !== null) reject(new CryptoError("invalid_input", "The key derivation failed."));
      else resolve(key);
    });
  });
}

export interface KdfOptions {
  // Tests only: lets a cheap cost through. Production code never sets it.
  readonly allowWeakKdf?: boolean;
}

function checkKdf(kdf: KdfParams, options: KdfOptions): void {
  const power = Number.isInteger(kdf.N) && kdf.N >= 2 && (kdf.N & (kdf.N - 1)) === 0;
  if (!power || !Number.isInteger(kdf.r) || kdf.r < 1 || kdf.r > 32 || !Number.isInteger(kdf.p) || kdf.p < 1 || kdf.p > 16) {
    throw new CryptoError("format", "The key derivation parameters are not valid.");
  }
  if (kdf.N > MAX_KDF_N) throw new CryptoError("weak_kdf", "The key derivation cost is above the supported maximum.");
  if (kdf.N < MIN_KDF_N && options.allowWeakKdf !== true) {
    throw new CryptoError("weak_kdf", "The key derivation cost is below the minimum.");
  }
}

export function checkMasterSecret(secret: string): void {
  if (secret.length < MIN_MASTER_SECRET_CHARS || secret.length > MAX_MASTER_SECRET_CHARS) {
    throw new CryptoError("invalid_input", `The master secret must be ${MIN_MASTER_SECRET_CHARS} to ${MAX_MASTER_SECRET_CHARS} characters.`);
  }
}

export async function deriveMasterKey(
  secret: Secret,
  salt: Uint8Array,
  kdf: KdfParams,
  options: KdfOptions = {},
): Promise<MasterKey> {
  checkKdf(kdf, options);
  const text = secret.reveal();
  checkMasterSecret(text);
  if (salt.length !== SALT_BYTES) throw new CryptoError("format", "The salt has the wrong length.");
  const password = Buffer.from(text.normalize("NFKC"), "utf8");
  try {
    return MasterKey.fromDerivedBytes(await scryptAsync(password, salt, kdf));
  } finally {
    password.fill(0);
  }
}

// ---- the keyring file ----------------------------------------------------------------------------------

export interface KeyringFile {
  readonly format: typeof KEYRING_FORMAT;
  readonly v: typeof SCHEMA_VERSION;
  readonly kdf: { readonly alg: "scrypt" } & KdfParams;
  readonly salt: string;
  // HMAC of a constant under a subkey: proves the master secret without revealing anything usable.
  readonly check: string;
}

function checkValue(key: MasterKey): string {
  return createHmac("sha256", key.subkey("check")).update("xo-relay key check").digest("hex");
}

export async function createKeyring(
  secret: Secret,
  kdf: KdfParams = DEFAULT_KDF,
  options: KdfOptions = {},
): Promise<{ readonly file: KeyringFile; readonly key: MasterKey }> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveMasterKey(secret, salt, kdf, options);
  return {
    file: { format: KEYRING_FORMAT, v: SCHEMA_VERSION, kdf: { alg: "scrypt", N: kdf.N, r: kdf.r, p: kdf.p }, salt: b64(salt), check: checkValue(key) },
    key,
  };
}

export function parseKeyring(text: string): KeyringFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new CryptoError("format", "The keyring file is not valid JSON.");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new CryptoError("format", "The keyring file is malformed.");
  const record = raw as Record<string, unknown>;
  if (record["format"] !== KEYRING_FORMAT) throw new CryptoError("format", "This is not a relay keyring file.");
  if (record["v"] !== SCHEMA_VERSION) throw new CryptoError("version", "The keyring file has an unknown schema version.");
  const kdf = record["kdf"] as Record<string, unknown> | null;
  if (typeof kdf !== "object" || kdf === null || kdf["alg"] !== "scrypt") throw new CryptoError("format", "The keyring file names an unknown key derivation.");
  const params: KdfParams = { N: Number(kdf["N"]), r: Number(kdf["r"]), p: Number(kdf["p"]) };
  fromB64(record["salt"], SALT_BYTES, "salt");
  if (typeof record["check"] !== "string" || !/^[0-9a-f]{64}$/.test(record["check"])) {
    throw new CryptoError("format", "The keyring check value is malformed.");
  }
  return {
    format: KEYRING_FORMAT,
    v: SCHEMA_VERSION,
    kdf: { alg: "scrypt", ...params },
    salt: record["salt"] as string,
    check: record["check"],
  };
}

export async function unlockKeyring(file: KeyringFile, secret: Secret, options: KdfOptions = {}): Promise<MasterKey> {
  const key = await deriveMasterKey(secret, fromB64(file.salt, SALT_BYTES, "salt"), file.kdf, options);
  if (!constantTimeEqual(checkValue(key), file.check)) {
    key.destroy();
    throw new CryptoError("wrong_master_key", "The master secret does not match this data directory.");
  }
  return key;
}

// ---- sealed records ----------------------------------------------------------------------------------------

export interface Sealed {
  readonly format: typeof ENVELOPE_FORMAT;
  readonly v: typeof SCHEMA_VERSION;
  readonly alg: "aes-256-gcm";
  // What kind of record this is ("secret:hmac_triplet", "backup:hmac_triplet"). Part of the AAD.
  readonly purpose: string;
  // Lower-case account address. Part of the AAD.
  readonly account: string;
  readonly iv: string;
  readonly ct: string;
  readonly tag: string;
}

const PURPOSE = /^[a-z][a-z0-9_:.-]{0,63}$/;
const ACCOUNT = /^0x[0-9a-f]{40}$/;

function aad(purpose: string, account: string): Buffer {
  return Buffer.from(`${ENVELOPE_FORMAT}|v${SCHEMA_VERSION}|${purpose}|${account}`, "utf8");
}

function checkBinding(purpose: string, account: string): void {
  if (!PURPOSE.test(purpose)) throw new CryptoError("invalid_input", "Bad record purpose.");
  if (!ACCOUNT.test(account)) throw new CryptoError("invalid_input", "The account must be a lower-case 0x address.");
}

export function seal(key: Buffer, purpose: string, account: string, plaintext: string | Uint8Array): Sealed {
  checkBinding(purpose, account);
  if (key.length !== KEY_BYTES) throw new CryptoError("invalid_input", "The sealing key must be 32 bytes.");
  const data = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : Buffer.from(plaintext);
  if (data.length > MAX_PLAINTEXT_BYTES) throw new CryptoError("invalid_input", "The record is too large to seal.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(purpose, account));
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  data.fill(0);
  return { format: ENVELOPE_FORMAT, v: SCHEMA_VERSION, alg: "aes-256-gcm", purpose, account, iv: b64(iv), ct: b64(ct), tag: b64(tag) };
}

export function parseSealed(text: string): Sealed {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new CryptoError("format", "The sealed record is not valid JSON.");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new CryptoError("format", "The sealed record is malformed.");
  const record = raw as Record<string, unknown>;
  if (record["format"] !== ENVELOPE_FORMAT) throw new CryptoError("format", "This is not a sealed relay record.");
  if (record["v"] !== SCHEMA_VERSION) throw new CryptoError("version", "The sealed record has an unknown schema version.");
  if (record["alg"] !== "aes-256-gcm") throw new CryptoError("format", "The sealed record names an unknown cipher.");
  if (typeof record["purpose"] !== "string" || typeof record["account"] !== "string") throw new CryptoError("format", "The sealed record is missing its binding.");
  fromB64(record["iv"], IV_BYTES, "iv");
  fromB64(record["ct"], undefined, "ct");
  fromB64(record["tag"], TAG_BYTES, "tag");
  return {
    format: ENVELOPE_FORMAT,
    v: SCHEMA_VERSION,
    alg: "aes-256-gcm",
    purpose: record["purpose"],
    account: record["account"],
    iv: record["iv"] as string,
    ct: record["ct"] as string,
    tag: record["tag"] as string,
  };
}

// Opens a record for the purpose and account the CALLER expects. The binding stored in the file is
// compared first (so a misfiled record gets a clear error), and the expected binding, not the
// stored one, is what the authentication tag is checked against.
export function open(key: Buffer, sealed: Sealed, purpose: string, account: string): Buffer {
  checkBinding(purpose, account);
  if (key.length !== KEY_BYTES) throw new CryptoError("invalid_input", "The sealing key must be 32 bytes.");
  if (sealed.format !== ENVELOPE_FORMAT || sealed.alg !== "aes-256-gcm") throw new CryptoError("format", "This is not a sealed relay record.");
  if (sealed.v !== SCHEMA_VERSION) throw new CryptoError("version", "The sealed record has an unknown schema version.");
  if (sealed.purpose !== purpose || sealed.account !== account) {
    throw new CryptoError("format", "The sealed record belongs to a different account or purpose.");
  }
  const iv = fromB64(sealed.iv, IV_BYTES, "iv");
  const ct = fromB64(sealed.ct, undefined, "ct");
  const tag = fromB64(sealed.tag, TAG_BYTES, "tag");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad(purpose, account));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    // Wrong key, edited ciphertext, edited tag, edited IV and a swapped binding all land here.
    throw new CryptoError("auth_failed", "The sealed record failed authentication: it was modified or the key is wrong.");
  }
}

export function sealToText(key: Buffer, purpose: string, account: string, plaintext: string | Uint8Array): string {
  return `${JSON.stringify(seal(key, purpose, account, plaintext))}\n`;
}

export function openFromText(key: Buffer, text: string, purpose: string, account: string): Buffer {
  return open(key, parseSealed(text), purpose, account);
}
