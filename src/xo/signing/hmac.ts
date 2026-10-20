import { createHmac } from "node:crypto";

import { SigningError } from "./errors.js";

// Which request target goes into the canonical string. The docs say "path including the query
// string"; one community client sends path only and labels that "Live XO compatibility". Nobody
// has verified which the live server checks, so there is no default: the caller must choose.
export type HmacCanonicalMode = "path-only" | "path-with-query";

export type L2Credentials = {
  apiKey: string;
  // Base64 HMAC secret as returned by create/derive. Never log it or put it in tool output.
  secret: string;
  passphrase: string;
};

export type L2SignInput = {
  credentials: L2Credentials;
  // Unix seconds as a decimal string; the same string goes in XO_TIMESTAMP.
  timestamp: string;
  method: string;
  // Path as it will be requested, query string included when there is one, e.g. "/orders?limit=10".
  requestPath: string;
  // The exact bytes sent as the body; "" for body-less requests.
  body?: string;
  canonicalMode: HmacCanonicalMode;
};

export type L2Headers = {
  XO_API_KEY: string;
  XO_PASSPHRASE: string;
  XO_TIMESTAMP: string;
  XO_SIGNATURE: string;
};

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
// Printable ASCII without spaces: keeps CR/LF and other control bytes out of header values.
const HEADER_TOKEN = /^[\x21-\x7e]{1,512}$/;

// Accepts the standard or URL-safe alphabet, with or without '=' padding. Anything else is an
// error: guessing at a malformed secret would produce a signature the server rejects with an
// unhelpful 401, or worse, silently sign with the wrong key.
export function decodeHmacSecret(secret: string): Buffer {
  if (typeof secret !== "string" || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(secret)) {
    throw new SigningError("invalid_secret", "HMAC secret must be base64 (standard or URL-safe alphabet)");
  }
  const unpadded = secret.replace(/=+$/, "");
  if (unpadded.length % 4 === 1) {
    throw new SigningError("invalid_secret", "HMAC secret has an impossible base64 length");
  }
  // Padding, when present, must be complete (Python's urlsafe_b64decode, which the upstream
  // client uses, rejects a partial pad too). Missing padding altogether is tolerated.
  if (unpadded.length !== secret.length && secret.length % 4 !== 0) {
    throw new SigningError("invalid_secret", "HMAC secret has incorrect base64 padding");
  }
  const bytes = Buffer.from(unpadded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (bytes.length === 0) {
    throw new SigningError("invalid_secret", "HMAC secret decodes to zero bytes");
  }
  return bytes;
}

export function canonicalRequestTarget(requestPath: string, mode: HmacCanonicalMode): string {
  if (mode !== "path-only" && mode !== "path-with-query") {
    throw new SigningError("invalid_canonical_mode", "canonicalMode must be 'path-only' or 'path-with-query'");
  }
  if (typeof requestPath !== "string" || !/^\/[\x21-\x7e]*$/.test(requestPath) || requestPath.includes("#")) {
    throw new SigningError("invalid_request_path", "requestPath must start with '/' and contain no spaces, controls or '#'");
  }
  if (requestPath.startsWith("//")) {
    throw new SigningError("invalid_request_path", "requestPath must not start with '//'");
  }
  if (mode === "path-with-query") return requestPath;
  const queryAt = requestPath.indexOf("?");
  return queryAt === -1 ? requestPath : requestPath.slice(0, queryAt);
}

// timestamp + METHOD + path + body, exactly as the docs spell the string.
export function canonicalString(input: Omit<L2SignInput, "credentials">): string {
  if (typeof input.timestamp !== "string" || !/^[1-9][0-9]{0,11}$/.test(input.timestamp)) {
    throw new SigningError("invalid_timestamp", "timestamp must be unix seconds as a decimal string");
  }
  const method = typeof input.method === "string" ? input.method.toUpperCase() : "";
  if (!METHODS.has(method)) {
    throw new SigningError("invalid_http_method", "method must be GET, POST, PUT, PATCH or DELETE");
  }
  const body = input.body ?? "";
  if (typeof body !== "string") {
    throw new SigningError("invalid_body", "body must be the exact string that is sent");
  }
  return `${input.timestamp}${method}${canonicalRequestTarget(input.requestPath, input.canonicalMode)}${body}`;
}

// URL-safe base64 of HMAC-SHA256 with '=' padding kept, as the upstream Polymarket client does.
// Whether XO also keeps the padding is not documented (open question).
export function signL2(input: L2SignInput): string {
  const key = decodeHmacSecret(input.credentials.secret);
  const digest = createHmac("sha256", key).update(canonicalString(input), "utf8").digest("base64");
  return digest.replace(/\+/g, "-").replace(/\//g, "_");
}

export function buildL2Headers(input: L2SignInput): L2Headers {
  const { apiKey, passphrase } = input.credentials;
  if (typeof apiKey !== "string" || !HEADER_TOKEN.test(apiKey)) {
    throw new SigningError("invalid_credential", "apiKey must be printable ASCII without spaces");
  }
  if (typeof passphrase !== "string" || !HEADER_TOKEN.test(passphrase)) {
    throw new SigningError("invalid_credential", "passphrase must be printable ASCII without spaces");
  }
  return {
    XO_API_KEY: apiKey,
    XO_PASSPHRASE: passphrase,
    XO_TIMESTAMP: input.timestamp,
    XO_SIGNATURE: signL2(input),
  };
}
