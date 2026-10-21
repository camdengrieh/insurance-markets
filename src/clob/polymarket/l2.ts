import { createHmac } from "node:crypto";

// Polymarket's L2 request signature (docs.polymarket.com/trading/wallets-auth.md and the Authentication section of
// llms-full.txt, read 2026-10-21): "message = clob_request_timestamp + method + request_path" with the exact serialized
// body appended when there is one; HMAC-SHA256 keyed with the base64-decoded API secret; the output is URL-safe
// base64 WITH padding; the five headers are POLY_ADDRESS, POLY_SIGNATURE, POLY_TIMESTAMP, POLY_API_KEY and
// POLY_PASSPHRASE; the timestamp is Unix seconds; "the query parameters are not part of the signed path".
//
// Node-only (node:crypto): the relay signs; the page never holds a secret. app/scripts/check-boundaries.ts lists this
// file as never reachable from the bundle.

export interface PolymarketCredentials {
  readonly apiKey: string;
  readonly secret: string;
  readonly passphrase: string;
}

export interface PolymarketL2Input {
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

// Either alphabet, with or without padding: the docs say "base64-decoded" without naming the alphabet.
export function decodePolymarketSecret(secret: string): Buffer {
  if (!/^[A-Za-z0-9+/_=-]{1,1024}$/.test(secret)) throw new Error("the API secret is not base64 text");
  return Buffer.from(secret.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function polymarketL2Message(input: Pick<PolymarketL2Input, "timestampSeconds" | "method" | "path" | "body">): string {
  if (!Number.isSafeInteger(input.timestampSeconds) || input.timestampSeconds <= 0) throw new Error("the L2 timestamp is unix seconds");
  if (!input.path.startsWith("/") || input.path.includes("?")) throw new Error("the signed path is absolute and carries no query string");
  return `${String(input.timestampSeconds)}${input.method}${input.path}${input.body}`;
}

export function polymarketL2Signature(secret: string, message: string): string {
  return createHmac("sha256", decodePolymarketSecret(secret)).update(message, "utf8").digest("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

export function buildPolymarketL2Headers(input: PolymarketL2Input): Record<string, string> {
  const { credentials } = input;
  if (!HEADER_TOKEN.test(credentials.apiKey) || !HEADER_TOKEN.test(credentials.passphrase)) throw new Error("the API key and passphrase are header tokens");
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.address)) throw new Error("the L2 address is a 20-byte hex address");
  const message = polymarketL2Message(input);
  return {
    POLY_ADDRESS: input.address,
    POLY_SIGNATURE: polymarketL2Signature(credentials.secret, message),
    POLY_TIMESTAMP: String(input.timestampSeconds),
    POLY_API_KEY: credentials.apiKey,
    POLY_PASSPHRASE: credentials.passphrase,
  };
}
