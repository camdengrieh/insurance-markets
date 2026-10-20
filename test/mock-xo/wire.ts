// Small helpers the write surfaces share: header lookup (XO_* and Xo-*), JSON bodies, reply builders for the
// orderbook's {"error": "..."} shape, and the HMAC the L2 check recomputes.
//
// Basis: header names and the L2 canonical string are from the XO docs (docs/research/01 (b), 22 (e)); that XO_*
// and Xo-* are recognised and POLY_* is not was observed live (note 01 sec (b)); every error text that is not
// quoted in a comment is synthetic (M).

import { createHmac, timingSafeEqual } from "node:crypto";

import type { MockReply, MockRequest } from "./listener.js";

export type XoHeaderName = "api_key" | "timestamp" | "passphrase" | "signature" | "address" | "nonce";

// "xo_api_key" and "xo-api-key" are both read; POLY_* never is.
export function xoHeader(request: MockRequest, name: XoHeaderName): string | undefined {
  for (const key of [`xo_${name}`, `xo-${name.replace(/_/g, "-")}`]) {
    const value = request.headers[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return undefined;
}

export type JsonObject = Record<string, unknown>;

export function parseJsonObject(body: string): JsonObject | undefined {
  try {
    const value = JSON.parse(body) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : undefined;
  } catch {
    return undefined;
  }
}

export function parseJson(body: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false };
  }
}

// {"error": text} with a status. The docs and the recordings use this shape on every orderbook error.
export const failure = (status: number, text: string, headers?: Record<string, string>): MockReply => ({
  status,
  json: { error: text },
  ...(headers === undefined ? {} : { headers }),
});

export const okJson = (json: unknown): MockReply => ({ status: 200, json });

// ---- the L2 HMAC ---------------------------------------------------------------------------------------------

// How the server derives the HMAC key from the stored secret and formats its output (switch hmac.decode):
//   b64url-decoded-padded  key = base64url-decoded secret, output URL-safe base64 WITH '=' padding (the expected form)
//   stripped               key = base64url-decoded secret, output URL-safe base64 with the padding stripped
//   raw                    key = the secret string itself (not decoded), output padded
export type HmacDecode = "stripped" | "raw" | "b64url-decoded-padded";

export function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, ""), "base64");
}

export function toBase64Url(bytes: Buffer, padded: boolean): string {
  const text = bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
  return padded ? text : text.replace(/=+$/, "");
}

export function hmacSignature(secret: string, decode: HmacDecode, message: string): string {
  const key = decode === "raw" ? Buffer.from(secret, "utf8") : decodeBase64Url(secret);
  const digest = createHmac("sha256", key).update(message, "utf8").digest();
  return toBase64Url(digest, decode !== "stripped");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
