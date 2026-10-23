// The visitor's own Limitless API token: a scoped token (id and secret) the visitor creates in Limitless's own app while
// signed in with this wallet, with the `trading` scope, and pastes into this page. Limitless issues these only to a
// session in its own UI (docs.limitless.exchange/developers/authentication: there is no wallet-signature login to
// derive one from), so pasting is the only way in.
//
// It is kept like the other venues' credentials on the direct path (credentials.ts): this tab's memory and its
// sessionStorage, keyed by the venue and the wallet address that pasted it; never localStorage, never logged, never in
// the DOM. Only a short tag that names it without being any part of it is shown. It goes nowhere but into the HMAC of the
// visitor's own requests (hmac.ts); the relay and Limitless see the token id and that signature, never the secret.

import { isLimitlessSecretText, type LimitlessToken } from "./hmac";

export const LIMITLESS_VENUE = "limitless";

const TOKEN_ID = /^[\x21-\x7e]{1,512}$/;

// What the visitor pasted, trimmed, or null when it cannot be a token (nothing is guessed or repaired).
export function tokenFromInput(tokenId: string, secret: string): LimitlessToken | null {
  const id = tokenId.trim();
  const key = secret.trim();
  if (!TOKEN_ID.test(id) || !isLimitlessSecretText(key)) return null;
  return { tokenId: id, secret: key };
}

export function parseLimitlessToken(stored: string | null): LimitlessToken | null {
  if (stored === null) return null;
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const tokenId = record["tokenId"];
    const secret = record["secret"];
    return typeof tokenId === "string" && typeof secret === "string" ? tokenFromInput(tokenId, secret) : null;
  } catch {
    return null;
  }
}

export function serializeLimitlessToken(token: LimitlessToken): string {
  return JSON.stringify({ tokenId: token.tokenId, secret: token.secret });
}

// A hash prefix of the token id: names the token on screen without being any part of it (relay/clob.ts clobKeyTagOf).
export function limitlessKeyTag(tokenId: string): string {
  let hash = 0;
  for (const char of `limitless:${tokenId}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `li${hash.toString(16).padStart(8, "0")}`;
}
