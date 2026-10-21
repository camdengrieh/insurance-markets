import { createHmac } from "node:crypto";

// Limitless request signing (docs.limitless.exchange/developers/authentication, read 2026-10-21): three headers,
// `lmts-api-key` (the token id), `lmts-timestamp` (ISO-8601, within 30 s of server time) and `lmts-signature`; the
// message is "{timestamp}\n{METHOD}\n{path + query}\n{body}" (the full path WITH its query string; an empty body for
// a GET); the key is the base64-decoded secret; the digest is base64-encoded. Tokens are created in the venue's UI or
// through a Privy identity token (POST /auth/api-tokens/derive) and carry scopes; `trading` places and cancels orders.
//
// Node-only (node:crypto): the relay signs; the page never holds a token. app/scripts/check-boundaries.ts lists this
// file as never reachable from the bundle.

export interface LimitlessToken {
  readonly tokenId: string;
  readonly secret: string;
}

export interface LimitlessSignInput {
  readonly token: LimitlessToken;
  // Whole-second ISO-8601 UTC, as the lmts-timestamp header value.
  readonly timestampIso: string;
  readonly method: "GET" | "POST" | "PUT" | "DELETE";
  // The path WITH its query string, exactly as requested.
  readonly pathWithQuery: string;
  readonly body: string;
}

const ISO_SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const HEADER_TOKEN = /^[\x21-\x7e]{1,512}$/;

export function decodeLimitlessSecret(secret: string): Buffer {
  if (!/^[A-Za-z0-9+/_=-]{1,1024}$/.test(secret)) throw new Error("the token secret is not base64 text");
  return Buffer.from(secret.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function limitlessSignMessage(input: Pick<LimitlessSignInput, "timestampIso" | "method" | "pathWithQuery" | "body">): string {
  if (!ISO_SECOND.test(input.timestampIso)) throw new Error("the Limitless timestamp is whole-second ISO-8601 UTC");
  if (!input.pathWithQuery.startsWith("/")) throw new Error("the signed path is absolute");
  return `${input.timestampIso}\n${input.method}\n${input.pathWithQuery}\n${input.body}`;
}

export function limitlessSignature(secret: string, message: string): string {
  return createHmac("sha256", decodeLimitlessSecret(secret)).update(message, "utf8").digest("base64");
}

export function buildLimitlessHeaders(input: LimitlessSignInput): Record<string, string> {
  if (!HEADER_TOKEN.test(input.token.tokenId)) throw new Error("the token id is a header token");
  const message = limitlessSignMessage(input);
  return { "lmts-api-key": input.token.tokenId, "lmts-timestamp": input.timestampIso, "lmts-signature": limitlessSignature(input.token.secret, message) };
}
