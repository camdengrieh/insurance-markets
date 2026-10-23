import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

// The relay's Node signer, imported by this test only (app/scripts/check-boundaries.ts lets a test, never the bundle,
// reach this one sdk/node file) so the browser's WebCrypto signer is proven byte-identical to it.
import * as nodeL2 from "@sdk/node/trade/clob/polymarket/l2";

import * as webL2 from "./l2";

// Test values only: generated or written here, never a real credential.
const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const FIXED_SECRETS = [
  // URL-safe alphabet with padding, as Polymarket returns secrets.
  "dGVzdC1vbmx5LXNlY3JldC0_Pz8-Pj4tYnl0ZXMtMDE=",
  // Standard alphabet (+ and /), padded.
  "dGVzdC1vbmx5LXNlY3JldC0/Pz8+Pj4tYnl0ZXMtMDE=",
  // No padding.
  "dGVzdC1vbmx5LXNlY3JldC0_Pz8-Pj4tYnl0ZXMtMDE",
  // One padding character.
  "dGVzdC1vbmx5LXNlY3JldA==".slice(0, 23),
];

function randomSecrets(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const raw = randomBytes(16 + index).toString("base64");
    return index % 2 === 0 ? raw.replace(/\+/g, "-").replace(/\//g, "_") : raw;
  });
}

const REQUESTS: ReadonlyArray<Pick<webL2.PolymarketL2Input, "method" | "path" | "body">> = [
  { method: "GET", path: "/data/orders", body: "" },
  { method: "POST", path: "/order", body: JSON.stringify({ order: { salt: 1, maker: ADDRESS, side: "BUY", tokenId: "123" }, owner: "test-only-key-id", orderType: "GTC" }) },
  { method: "DELETE", path: "/order", body: JSON.stringify({ orderID: `0x${"ab".repeat(32)}` }) },
  // Text outside ASCII in the body is hashed as UTF-8 by both.
  { method: "POST", path: "/order", body: '{"note":"prix à 0,52 — 50¢"}' },
];

describe("the browser's Polymarket L2 signer", () => {
  it("produces headers byte-identical to the relay's Node signer for every request shape and secret form", async () => {
    for (const secret of [...FIXED_SECRETS, ...randomSecrets(12)]) {
      for (const [index, request] of REQUESTS.entries()) {
        const input = { address: ADDRESS, credentials: { apiKey: "00000000-test-only-0000-000000000000", secret, passphrase: "test-only-passphrase" }, timestampSeconds: 1_792_755_563 + index, ...request };
        expect(await webL2.buildPolymarketL2Headers(input), `${secret} ${request.method} ${request.path}`).toEqual(nodeL2.buildPolymarketL2Headers(input));
      }
    }
  });

  it("decodes a secret to the same bytes as Node's base64 decoder", () => {
    for (const secret of [...FIXED_SECRETS, ...randomSecrets(8)]) {
      expect(Buffer.from(webL2.decodePolymarketSecret(secret)).toString("hex"), secret).toBe(nodeL2.decodePolymarketSecret(secret).toString("hex"));
    }
  });

  it("builds the same message and refuses the same malformed inputs", async () => {
    const base = { timestampSeconds: 1_792_755_563, method: "GET" as const, path: "/data/orders", body: "" };
    expect(webL2.polymarketL2Message(base)).toBe(nodeL2.polymarketL2Message(base));
    for (const bad of [{ ...base, path: "/data/orders?market=0x1" }, { ...base, path: "data/orders" }, { ...base, timestampSeconds: 0 }, { ...base, timestampSeconds: 1.5 }]) {
      expect(() => webL2.polymarketL2Message(bad)).toThrow();
      expect(() => nodeL2.polymarketL2Message(bad)).toThrow();
    }
    const credentials = { apiKey: "has space", secret: FIXED_SECRETS[0] ?? "", passphrase: "p" };
    await expect(webL2.buildPolymarketL2Headers({ ...base, address: ADDRESS, credentials })).rejects.toThrow();
    expect(() => nodeL2.buildPolymarketL2Headers({ ...base, address: ADDRESS, credentials })).toThrow();
    await expect(webL2.buildPolymarketL2Headers({ ...base, address: "0x1234", credentials: { ...credentials, apiKey: "k" } })).rejects.toThrow();
    expect(() => webL2.decodePolymarketSecret("not base64!")).toThrow();
  });

  it("keeps a stored credential only in the relay's shape and names it by a tag that is no part of it", () => {
    const stored = JSON.stringify({ apiKey: "00000000-test-only-0000-000000000000", secret: FIXED_SECRETS[0], passphrase: "test-only-passphrase" });
    expect(webL2.parsePolymarketCredentials(stored)).toEqual(JSON.parse(stored));
    for (const bad of [null, "", "{}", "[1]", JSON.stringify({ apiKey: "a b", secret: "c2VjcmV0", passphrase: "p" }), JSON.stringify({ apiKey: "a", secret: "not base64!", passphrase: "p" })]) {
      expect(webL2.parsePolymarketCredentials(bad)).toBeNull();
    }
    const tag = webL2.polymarketKeyTag("00000000-test-only-0000-000000000000");
    expect(tag).toMatch(/^po[0-9a-f]{8}$/);
    expect("00000000-test-only-0000-000000000000").not.toContain(tag.slice(2));
  });
});
