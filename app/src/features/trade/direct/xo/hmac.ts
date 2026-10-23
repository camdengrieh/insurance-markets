// XO's L2 request signature (HMAC-SHA256) with WebCrypto, for the visitor's OWN credential in the visitor's own browser.
//
// The same rules, byte for byte, as sdk/node/trade/xo/hmac.ts (which the page may not import: it is the Node signer the
// relay uses, app/scripts/check-boundaries.ts). hmac.test.ts checks the two produce identical headers:
//   - the secret is base64 in the standard or URL-safe alphabet, padded or not; anything else is refused;
//   - the signed string is timestamp + METHOD + request target + body, exactly as sent;
//   - the signature is URL-safe base64 of HMAC-SHA256 with its '=' padding kept;
//   - the API key and passphrase are printable ASCII without spaces.
// The key is imported as non-extractable and used once. Nothing here logs, stores or returns the secret.

export type HmacCanonicalMode = "path-only" | "path-with-query";

export interface L2Credentials {
  readonly apiKey: string;
  // Base64 HMAC secret as XO returned it. Never shown, logged or put in an error.
  readonly secret: string;
  readonly passphrase: string;
}

export interface L2SignInput {
  readonly credentials: L2Credentials;
  // Unix seconds on XO's clock, as a decimal string; the same string goes in XO_TIMESTAMP.
  readonly timestamp: string;
  readonly method: string;
  readonly requestPath: string;
  // The exact bytes sent as the body; "" for a body-less request.
  readonly body?: string;
  readonly canonicalMode: HmacCanonicalMode;
}

export interface L2Headers {
  readonly XO_API_KEY: string;
  readonly XO_PASSPHRASE: string;
  readonly XO_TIMESTAMP: string;
  readonly XO_SIGNATURE: string;
}

// The same codes as sdk/trade/xo/errors.ts SigningError, so a refusal reads the same in both places.
export type XoHmacErrorCode = "invalid_secret" | "invalid_canonical_mode" | "invalid_request_path" | "invalid_timestamp" | "invalid_http_method" | "invalid_body" | "invalid_credential";

export class XoHmacError extends Error {
  readonly code: XoHmacErrorCode;
  constructor(code: XoHmacErrorCode, message: string) {
    super(message);
    this.name = "XoHmacError";
    this.code = code;
  }
}

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const HEADER_TOKEN = /^[\x21-\x7e]{1,512}$/;

export function decodeHmacSecret(secret: string): Uint8Array<ArrayBuffer> {
  if (typeof secret !== "string" || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(secret)) {
    throw new XoHmacError("invalid_secret", "HMAC secret must be base64 (standard or URL-safe alphabet)");
  }
  const unpadded = secret.replace(/=+$/, "");
  if (unpadded.length % 4 === 1) throw new XoHmacError("invalid_secret", "HMAC secret has an impossible base64 length");
  if (unpadded.length !== secret.length && secret.length % 4 !== 0) throw new XoHmacError("invalid_secret", "HMAC secret has incorrect base64 padding");
  const standard = unpadded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(standard + "=".repeat((4 - (standard.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.length === 0) throw new XoHmacError("invalid_secret", "HMAC secret decodes to zero bytes");
  return bytes;
}

export function canonicalRequestTarget(requestPath: string, mode: HmacCanonicalMode): string {
  if (mode !== "path-only" && mode !== "path-with-query") throw new XoHmacError("invalid_canonical_mode", "canonicalMode must be 'path-only' or 'path-with-query'");
  if (typeof requestPath !== "string" || !/^\/[\x21-\x7e]*$/.test(requestPath) || requestPath.includes("#")) {
    throw new XoHmacError("invalid_request_path", "requestPath must start with '/' and contain no spaces, controls or '#'");
  }
  if (requestPath.startsWith("//")) throw new XoHmacError("invalid_request_path", "requestPath must not start with '//'");
  if (mode === "path-with-query") return requestPath;
  const queryAt = requestPath.indexOf("?");
  return queryAt === -1 ? requestPath : requestPath.slice(0, queryAt);
}

export function canonicalString(input: Omit<L2SignInput, "credentials">): string {
  if (typeof input.timestamp !== "string" || !/^[1-9][0-9]{0,11}$/.test(input.timestamp)) throw new XoHmacError("invalid_timestamp", "timestamp must be unix seconds as a decimal string");
  const method = typeof input.method === "string" ? input.method.toUpperCase() : "";
  if (!METHODS.has(method)) throw new XoHmacError("invalid_http_method", "method must be GET, POST, PUT, PATCH or DELETE");
  const body = input.body ?? "";
  if (typeof body !== "string") throw new XoHmacError("invalid_body", "body must be the exact string that is sent");
  return `${input.timestamp}${method}${canonicalRequestTarget(input.requestPath, input.canonicalMode)}${body}`;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function signL2(input: L2SignInput): Promise<string> {
  const keyBytes = decodeHmacSecret(input.credentials.secret);
  const message = new TextEncoder().encode(canonicalString(input));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  return base64(mac).replace(/\+/g, "-").replace(/\//g, "_");
}

export async function buildL2Headers(input: L2SignInput): Promise<L2Headers> {
  const { apiKey, passphrase } = input.credentials;
  if (typeof apiKey !== "string" || !HEADER_TOKEN.test(apiKey)) throw new XoHmacError("invalid_credential", "apiKey must be printable ASCII without spaces");
  if (typeof passphrase !== "string" || !HEADER_TOKEN.test(passphrase)) throw new XoHmacError("invalid_credential", "passphrase must be printable ASCII without spaces");
  return {
    XO_API_KEY: apiKey,
    XO_PASSPHRASE: passphrase,
    XO_TIMESTAMP: input.timestamp,
    XO_SIGNATURE: await signL2(input),
  };
}
