// Polymarket's L2 request signature, in the visitor's browser, with WebCrypto. The same rule as the relay's Node signer
// (sdk/node/trade/clob/polymarket/l2.ts, which cites docs.polymarket.com/trading/wallets-auth.md): the message is the
// Unix-seconds timestamp, the method, the path without its query and the exact body; HMAC-SHA256 keyed with the
// base64-decoded API secret; the output URL-safe base64 WITH padding; five headers POLY_ADDRESS, POLY_SIGNATURE,
// POLY_TIMESTAMP, POLY_API_KEY and POLY_PASSPHRASE. l2.test.ts checks the headers are byte-identical to the Node
// signer's for the same input.
//
// The secret is the visitor's own (derived from their own wallet signature, auth.ts) and is used here only: it is
// imported as a non-extractable key for one signature and never leaves this function.

export interface PolymarketCredentials {
  readonly apiKey: string;
  readonly secret: string;
  readonly passphrase: string;
}

export interface PolymarketL2Input {
  // The wallet that owns the credential (the connected address), whatever account makes the order.
  readonly address: string;
  readonly credentials: PolymarketCredentials;
  readonly timestampSeconds: number;
  readonly method: "GET" | "POST" | "DELETE";
  // The path WITHOUT its query string.
  readonly path: string;
  // The exact bytes that go on the wire; "" for a body-less request.
  readonly body: string;
}

const HEADER_TOKEN = /^[\x21-\x7e]{1,512}$/;
const SECRET_TEXT = /^[A-Za-z0-9+/_-]{1,1024}={0,2}$/;

// Either alphabet, with or without padding (the docs say "base64-decoded" without naming one). Padding is accepted only
// at the end; a secret this does not decode is refused, never guessed at.
export function decodePolymarketSecret(secret: string): Uint8Array<ArrayBuffer> {
  if (!SECRET_TEXT.test(secret)) throw new Error("the API secret is not base64 text");
  const standard = secret.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (standard.length % 4 === 1) throw new Error("the API secret is not base64 text");
  const binary = atob(standard + "=".repeat((4 - (standard.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function polymarketL2Message(input: Pick<PolymarketL2Input, "timestampSeconds" | "method" | "path" | "body">): string {
  if (!Number.isSafeInteger(input.timestampSeconds) || input.timestampSeconds <= 0) throw new Error("the L2 timestamp is unix seconds");
  if (!input.path.startsWith("/") || input.path.includes("?")) throw new Error("the signed path is absolute and carries no query string");
  return `${String(input.timestampSeconds)}${input.method}${input.path}${input.body}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
}

export async function polymarketL2Signature(secret: string, message: string): Promise<string> {
  const keyBytes = decodePolymarketSecret(secret);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(mac));
}

export async function buildPolymarketL2Headers(input: PolymarketL2Input): Promise<Record<string, string>> {
  const { credentials } = input;
  if (!HEADER_TOKEN.test(credentials.apiKey) || !HEADER_TOKEN.test(credentials.passphrase)) throw new Error("the API key and passphrase are header tokens");
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.address)) throw new Error("the L2 address is a 20-byte hex address");
  const message = polymarketL2Message(input);
  return {
    POLY_ADDRESS: input.address,
    POLY_SIGNATURE: await polymarketL2Signature(credentials.secret, message),
    POLY_TIMESTAMP: String(input.timestampSeconds),
    POLY_API_KEY: credentials.apiKey,
    POLY_PASSPHRASE: credentials.passphrase,
  };
}

// The credential as it is kept (credentials.ts), or null when a stored value is not one. The same shape rule as the
// relay's own parse (relay/clob.ts parseTriplet).
export function parsePolymarketCredentials(text: string | null): PolymarketCredentials | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const apiKey = record["apiKey"];
    const secret = record["secret"];
    const passphrase = record["passphrase"];
    if (typeof apiKey !== "string" || typeof secret !== "string" || typeof passphrase !== "string") return null;
    return HEADER_TOKEN.test(apiKey) && HEADER_TOKEN.test(passphrase) && SECRET_TEXT.test(secret) ? { apiKey, secret, passphrase } : null;
  } catch {
    return null;
  }
}

// A tag that names a credential without being any part of it (the relay's clobKeyTagOf rule, relay/clob.ts): a
// 32-bit string hash of the venue and the key id. Shown so the visitor can tell two logins apart; nothing else.
export function polymarketKeyTag(apiKey: string): string {
  let hash = 0;
  for (const char of `polymarket:${apiKey}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `po${hash.toString(16).padStart(8, "0")}`;
}
