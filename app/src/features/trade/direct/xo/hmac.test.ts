import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

// The Node signer the relay uses, imported here ONLY to prove the page's WebCrypto signer makes the same bytes
// (app/scripts/check-boundaries.ts allows this one file to a test, never to the bundle).
import * as node from "@sdk/node/trade/xo/hmac";

import * as web from "./hmac";

// Parity: for the same credential, clock, method, target and body, the page's headers are byte-identical to
// sdk/node/trade/xo/hmac.ts, and the two refuse the same malformed inputs.

const METHODS = ["GET", "POST", "DELETE", "put", "Patch"];
const PATHS = ["/order", "/orders", "/orders/0xabc", "/orders?limit=1&next_cursor=MA==", "/auth/api-keys"];
const BODIES = ["", "{}", '{"orderID":"0x01"}', JSON.stringify({ order: { salt: "1", side: 0 }, orderType: "GTD", note: "ünïcødé ✓" })];

function secretsOf(bytes: Buffer): string[] {
  const standard = bytes.toString("base64");
  const urlSafe = standard.replace(/\+/g, "-").replace(/\//g, "_");
  return [standard, standard.replace(/=+$/, ""), urlSafe, urlSafe.replace(/=+$/, "")];
}

describe("L2 HMAC: WebCrypto and the Node signer agree byte for byte", () => {
  it("on every method, target, body and secret spelling", async () => {
    let compared = 0;
    for (const length of [1, 2, 3, 16, 31, 32, 33, 64]) {
      for (const secret of secretsOf(randomBytes(length))) {
        for (const method of METHODS) {
          for (const requestPath of PATHS) {
            for (const body of BODIES) {
              for (const canonicalMode of ["path-only", "path-with-query"] as const) {
                const input = { credentials: { apiKey: "key-1234", secret, passphrase: "pass-5678" }, timestamp: "1792756800", method, requestPath, body, canonicalMode };
                expect(await web.buildL2Headers(input)).toEqual(node.buildL2Headers(input));
                compared += 1;
              }
            }
          }
        }
      }
    }
    expect(compared).toBe(8 * 4 * METHODS.length * PATHS.length * BODIES.length * 2);
  });

  it("matches a fixed vector computed by the Node signer", async () => {
    const input = { credentials: { apiKey: "k", secret: "c2VjcmV0LWZvci10ZXN0cy1vbmx5LTEyMzQ1Ng==", passphrase: "p" }, timestamp: "1792756800", method: "POST", requestPath: "/order", body: '{"a":1}', canonicalMode: "path-with-query" as const };
    const expected = node.signL2(input);
    expect(expected).toMatch(/^[A-Za-z0-9_-]{43}=$/);
    expect(await web.signL2(input)).toBe(expected);
  });

  it("refuses what the Node signer refuses, with the same code", async () => {
    const base = { credentials: { apiKey: "k", secret: "c2VjcmV0", passphrase: "p" }, timestamp: "1792756800", method: "GET", requestPath: "/orders", body: "", canonicalMode: "path-only" as const };
    const cases = [
      { ...base, credentials: { ...base.credentials, secret: "not base64!" } },
      { ...base, credentials: { ...base.credentials, secret: "abcde" } },
      { ...base, credentials: { ...base.credentials, secret: "abcdef=" } },
      { ...base, credentials: { ...base.credentials, secret: "====" } },
      { ...base, credentials: { ...base.credentials, apiKey: "has space" } },
      { ...base, credentials: { ...base.credentials, passphrase: "" } },
      { ...base, timestamp: "0123" },
      { ...base, timestamp: "1.5" },
      { ...base, method: "HEAD" },
      { ...base, requestPath: "orders" },
      { ...base, requestPath: "//evil" },
      { ...base, requestPath: "/a#b" },
      { ...base, canonicalMode: "both" as unknown as "path-only" },
    ];
    for (const input of cases) {
      let nodeCode: unknown = null;
      try {
        node.buildL2Headers(input);
      } catch (error) {
        nodeCode = (error as { code?: unknown }).code;
      }
      expect(nodeCode, JSON.stringify(input)).not.toBeNull();
      await expect(web.buildL2Headers(input)).rejects.toMatchObject({ code: nodeCode });
    }
  });
});
