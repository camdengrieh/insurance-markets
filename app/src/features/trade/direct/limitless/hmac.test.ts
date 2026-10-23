import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

// The Node signer the server-side flow uses, imported here ONLY to prove the page's WebCrypto signer makes the same
// bytes (app/scripts/check-boundaries.ts allows this one file to a test, never to the bundle).
import * as node from "@sdk/node/trade/clob/limitless/hmac";

import * as web from "./hmac";

// Parity: for the same token, clock, method, path and body, the page's lmts-* headers are byte-identical to
// sdk/node/trade/clob/limitless/hmac.ts, and the page refuses what the Node signer refuses.

const METHODS = ["GET", "POST", "DELETE", "PUT"] as const;
const PATHS = ["/orders", "/profiles/me", "/orders/6f52b6d2-6c9e-4a5c-8a4f-28ab4b7ff203", "/markets/a-slug-1792756800000/user-orders?limit=100", "/markets/x?statuses=LIVE&statuses=MATCHED"];
const BODIES = ["", "{}", '{"orderType":"GTC"}', JSON.stringify({ order: { salt: "1", side: 0, price: 0.5 }, ownerId: 42, marketSlug: "s", note: "ünïcødé ✓" })];

function secretsOf(bytes: Buffer): string[] {
  const standard = bytes.toString("base64");
  const urlSafe = standard.replace(/\+/g, "-").replace(/\//g, "_");
  return [standard, standard.replace(/=+$/, ""), urlSafe, urlSafe.replace(/=+$/, "")];
}

describe("Limitless HMAC: WebCrypto and the Node signer agree byte for byte", () => {
  it("on every method, path, body and secret spelling", async () => {
    let compared = 0;
    for (const length of [1, 2, 3, 16, 31, 32, 33, 64]) {
      for (const secret of secretsOf(randomBytes(length))) {
        for (const method of METHODS) {
          for (const pathWithQuery of PATHS) {
            for (const body of BODIES) {
              const input = { token: { tokenId: "token-id-1234", secret }, timestampIso: "2026-10-23T12:00:00Z", method, pathWithQuery, body };
              expect(await web.buildLimitlessHeaders(input)).toEqual(node.buildLimitlessHeaders(input));
              compared += 1;
            }
          }
        }
      }
    }
    expect(compared).toBe(8 * 4 * METHODS.length * PATHS.length * BODIES.length);
  });

  it("decodes a secret exactly as Node's Buffer does, odd spellings included", () => {
    for (const secret of ["abcde", "abcdefg", "ab=cd", "YW=Jj", "abcd=efgh", "abc==", "YWJjZA", "YWJjZA==", "-_-_", "AAAA"]) {
      expect(Buffer.from(web.decodeLimitlessSecret(secret)).toString("hex"), secret).toBe(node.decodeLimitlessSecret(secret).toString("hex"));
    }
  });

  it("matches a fixed vector computed by the Node signer", async () => {
    const input = { token: { tokenId: "t", secret: "c2VjcmV0LWZvci10ZXN0cy1vbmx5LTEyMzQ1Ng==" }, timestampIso: "2026-10-23T12:00:00Z", method: "POST" as const, pathWithQuery: "/orders", body: '{"a":1}' };
    const expected = node.limitlessSignature(input.token.secret, node.limitlessSignMessage(input));
    expect(expected).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect((await web.buildLimitlessHeaders(input))["lmts-signature"]).toBe(expected);
  });

  it("refuses what the Node signer refuses", async () => {
    const base = { token: { tokenId: "t", secret: "c2VjcmV0" }, timestampIso: "2026-10-23T12:00:00Z", method: "GET" as const, pathWithQuery: "/profiles/me", body: "" };
    const cases = [
      { ...base, token: { ...base.token, secret: "not base64!" } },
      { ...base, token: { ...base.token, secret: "" } },
      { ...base, token: { ...base.token, tokenId: "has space" } },
      { ...base, token: { ...base.token, tokenId: "" } },
      { ...base, timestampIso: "2026-10-23T12:00:00.000Z" },
      { ...base, timestampIso: "1792756800" },
      { ...base, pathWithQuery: "profiles/me" },
    ];
    for (const input of cases) {
      expect(() => node.buildLimitlessHeaders(input), JSON.stringify(input)).toThrow();
      await expect(web.buildLimitlessHeaders(input)).rejects.toThrow();
    }
  });

  it("refuses a secret that decodes to no bytes, which Node would take as an empty key", async () => {
    for (const secret of ["a", "=abc", "a="]) {
      expect(node.decodeLimitlessSecret(secret).length).toBe(0);
      expect(() => web.decodeLimitlessSecret(secret)).toThrow(web.LimitlessHmacError);
    }
  });

  it("stamps the page clock as a whole-second ISO time", () => {
    expect(web.isoSecondOf(Date.parse("2026-10-23T12:00:00.987Z"))).toBe("2026-10-23T12:00:00Z");
  });
});
