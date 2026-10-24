import { polymarketL2Signature } from "../sdk/node/trade/clob/polymarket/l2.js";

// Polymarket Builder request signing, as the official builder-signing-sdk does it (Polymarket/builder-signing-sdk
// src/signing/hmac.ts and @polymarket/client builderApiKey, read in research note 45 section 2):
//
//   message   = String(unix seconds) + METHOD + path (no query string) + body (exact serialized bytes; nothing for none)
//   key       = base64-decode(secret), either alphabet ("-" read as "+", "_" as "/")
//   signature = base64(HMAC-SHA256(key, message)) with "+" -> "-" and "/" -> "_", the "=" padding KEPT
//   headers   = POLY_BUILDER_API_KEY, POLY_BUILDER_PASSPHRASE, POLY_BUILDER_SIGNATURE, POLY_BUILDER_TIMESTAMP
//
// It is byte for byte the CLOB L2 algorithm the SDK already implements (sdk/node/trade/clob/polymarket/l2.ts,
// polymarketL2Signature), which this reuses; test/api/polymarket-relay.test.ts checks it against a vector computed
// independently with openssl from those steps.

export interface BuilderCredentials {
  readonly apiKey: string;
  readonly secret: string;
  readonly passphrase: string;
}

export function builderMessage(timestampSeconds: number, method: string, path: string, body: string | undefined): string {
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds <= 0) throw new Error("the builder timestamp is unix seconds");
  if (!path.startsWith("/") || path.includes("?")) throw new Error("the signed path is absolute and carries no query string");
  return `${String(timestampSeconds)}${method}${path}${body ?? ""}`;
}

export function builderSignature(secret: string, timestampSeconds: number, method: string, path: string, body: string | undefined): string {
  return polymarketL2Signature(secret, builderMessage(timestampSeconds, method, path, body));
}

export function builderHeaders(credentials: BuilderCredentials, timestampSeconds: number, method: string, path: string, body: string | undefined): Record<string, string> {
  return {
    POLY_BUILDER_API_KEY: credentials.apiKey,
    POLY_BUILDER_PASSPHRASE: credentials.passphrase,
    POLY_BUILDER_SIGNATURE: builderSignature(credentials.secret, timestampSeconds, method, path, body),
    POLY_BUILDER_TIMESTAMP: String(timestampSeconds),
  };
}
