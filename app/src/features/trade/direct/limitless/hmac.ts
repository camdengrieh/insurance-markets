// Limitless's request signature (HMAC-SHA256) with WebCrypto, for the visitor's OWN scoped API token in the visitor's
// own browser.
//
// The same rules, byte for byte, as sdk/node/trade/clob/limitless/hmac.ts (which the page may not import: it is the Node
// signer the server-side flow uses, app/scripts/check-boundaries.ts). hmac.test.ts checks the two produce identical
// headers. From docs.limitless.exchange/developers/authentication (read 2026-10-21, cited there):
//   - three headers: lmts-api-key (the token id), lmts-timestamp (whole-second ISO-8601 UTC) and lmts-signature;
//   - the signed message is "{timestamp}\n{METHOD}\n{path with its query}\n{body}", the body "" for a GET or DELETE;
//   - the key is the base64-decoded token secret, decoded as Node's Buffer decodes it (either alphabet, stopping at the
//     first "="), so a secret means the same key on both sides; the signature is standard base64 with padding.
// The key is imported as non-extractable and used once. Nothing here logs, stores or returns the secret.

export interface LimitlessToken {
  readonly tokenId: string;
  // The token's base64 secret as Limitless showed it once. Never shown, logged or put in an error.
  readonly secret: string;
}

export interface LimitlessSignInput {
  readonly token: LimitlessToken;
  readonly timestampIso: string;
  readonly method: "GET" | "POST" | "PUT" | "DELETE";
  // The path WITH its query string, exactly as requested of Limitless (not the relay's path).
  readonly pathWithQuery: string;
  readonly body: string;
}

export interface LimitlessHeaders {
  readonly "lmts-api-key": string;
  readonly "lmts-timestamp": string;
  readonly "lmts-signature": string;
}

export class LimitlessHmacError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitlessHmacError";
  }
}

const ISO_SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const HEADER_TOKEN = /^[\x21-\x7e]{1,512}$/;
const SECRET_TEXT = /^[A-Za-z0-9+/_=-]{1,1024}$/;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function isLimitlessSecretText(secret: string): boolean {
  return SECRET_TEXT.test(secret);
}

// Node's Buffer.from(text, "base64") for the alphabet above: the characters before the first "=", six bits each, every
// whole byte they make; leftover bits are dropped.
export function decodeLimitlessSecret(secret: string): Uint8Array<ArrayBuffer> {
  if (!SECRET_TEXT.test(secret)) throw new LimitlessHmacError("the token secret is not base64 text");
  const text = secret.replace(/-/g, "+").replace(/_/g, "/");
  const stop = text.indexOf("=");
  const body = stop === -1 ? text : text.slice(0, stop);
  const bytes = new Uint8Array(new ArrayBuffer(Math.floor((body.length * 6) / 8)));
  let bits = 0;
  let held = 0;
  let at = 0;
  for (const char of body) {
    held = (held << 6) | ALPHABET.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[at] = (held >> bits) & 0xff;
      at += 1;
    }
  }
  // WebCrypto will not key an HMAC with nothing; a real Limitless secret is never this short.
  if (bytes.length === 0) throw new LimitlessHmacError("the token secret decodes to no bytes");
  return bytes;
}

export function limitlessSignMessage(input: Pick<LimitlessSignInput, "timestampIso" | "method" | "pathWithQuery" | "body">): string {
  if (!ISO_SECOND.test(input.timestampIso)) throw new LimitlessHmacError("the Limitless timestamp is whole-second ISO-8601 UTC");
  if (!input.pathWithQuery.startsWith("/")) throw new LimitlessHmacError("the signed path is absolute");
  return `${input.timestampIso}\n${input.method}\n${input.pathWithQuery}\n${input.body}`;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function limitlessSignature(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", decodeLimitlessSecret(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))));
}

export async function buildLimitlessHeaders(input: LimitlessSignInput): Promise<LimitlessHeaders> {
  if (!HEADER_TOKEN.test(input.token.tokenId)) throw new LimitlessHmacError("the token id is a header token");
  const message = limitlessSignMessage(input);
  return { "lmts-api-key": input.token.tokenId, "lmts-timestamp": input.timestampIso, "lmts-signature": await limitlessSignature(input.token.secret, message) };
}

// "2026-10-23T12:00:00Z": the page clock as the whole-second ISO form lmts-timestamp takes.
export function isoSecondOf(nowMs: number): string {
  return new Date(Math.floor(nowMs / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}
