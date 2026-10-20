import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SigningError,
  buildL2Headers,
  canonicalRequestTarget,
  canonicalString,
  decodeHmacSecret,
  signL2,
  type HmacCanonicalMode,
  type L2SignInput,
  type SigningErrorCode,
} from "../src/xo/signing/index.js";

// Fake credentials for tests only (the secret is base64 of ASCII text, not a real XO secret).
const CREDENTIALS = {
  apiKey: "11111111-2222-4333-8444-555555555555",
  secret: "c2VjcmV0LWtleS0xMjM0NTY3ODkwYWJjZGVm",
  passphrase: "test-passphrase",
};

function base(overrides: Partial<L2SignInput> = {}): L2SignInput {
  return {
    credentials: CREDENTIALS,
    timestamp: "1791389400",
    method: "GET",
    requestPath: "/orders?next_cursor=&market=0xabc",
    canonicalMode: "path-with-query",
    ...overrides,
  };
}

function rejects(fn: () => unknown, code: SigningErrorCode): void {
  assert.throws(fn, (error: unknown) => error instanceof SigningError && error.code === code, `expected ${code}`);
}

describe("canonical string", () => {
  it("is timestamp + METHOD + path + body with nothing in between", () => {
    assert.equal(
      canonicalString({ timestamp: "1791389400", method: "POST", requestPath: "/order", body: '{"a":1}', canonicalMode: "path-only" }),
      '1791389400POST/order{"a":1}',
    );
  });

  it("uses an empty body when none is given and upper-cases the method", () => {
    assert.equal(
      canonicalString({ timestamp: "1791389400", method: "get", requestPath: "/orders", canonicalMode: "path-only" }),
      "1791389400GET/orders",
    );
  });

  it("path-with-query keeps the query string verbatim", () => {
    assert.equal(
      canonicalString(base({ canonicalMode: "path-with-query" })),
      "1791389400GET/orders?next_cursor=&market=0xabc",
    );
  });

  it("path-only drops everything from the first '?'", () => {
    assert.equal(canonicalString(base({ canonicalMode: "path-only" })), "1791389400GET/orders");
    assert.equal(canonicalRequestTarget("/a?b=1?c=2", "path-only"), "/a");
    assert.equal(canonicalRequestTarget("/a?b=1?c=2", "path-with-query"), "/a?b=1?c=2");
    assert.equal(canonicalRequestTarget("/orders", "path-only"), "/orders");
  });

  it("the two modes sign different strings exactly when a query is present", () => {
    const withQuery = base();
    assert.notEqual(
      signL2({ ...withQuery, canonicalMode: "path-only" }),
      signL2({ ...withQuery, canonicalMode: "path-with-query" }),
    );
    const noQuery = base({ requestPath: "/orders" });
    assert.equal(
      signL2({ ...noQuery, canonicalMode: "path-only" }),
      signL2({ ...noQuery, canonicalMode: "path-with-query" }),
    );
  });
});

describe("explicit canonical mode (no default)", () => {
  it("refuses a missing or unknown mode", () => {
    rejects(() => signL2(base({ canonicalMode: undefined as unknown as HmacCanonicalMode })), "invalid_canonical_mode");
    rejects(() => signL2(base({ canonicalMode: "path" as HmacCanonicalMode })), "invalid_canonical_mode");
    rejects(() => canonicalRequestTarget("/orders", "" as HmacCanonicalMode), "invalid_canonical_mode");
  });
});

describe("input validation", () => {
  it("refuses a timestamp that is not plain unix seconds", () => {
    for (const bad of ["", "0", "01791389400", "1791389400.5", "-1", "1791389400 ", "abc", "1791389400000000000"]) {
      rejects(() => canonicalString(base({ timestamp: bad })), "invalid_timestamp");
    }
  });

  it("refuses methods outside GET, POST, PUT, PATCH, DELETE", () => {
    for (const bad of ["TRACE", "CONNECT", "", "GE T", " GET", "OPTIONS"]) {
      rejects(() => canonicalString(base({ method: bad })), "invalid_http_method");
    }
    assert.doesNotThrow(() => canonicalString(base({ method: "delete" })));
  });

  it("refuses request paths that are not plain absolute paths", () => {
    for (const bad of ["orders", "", "https://orderbooks.xo.market/orders", "//evil.example/orders", "/or ders", "/orders#frag", "/orders\r\nX: 1", "/orders\n", "/ordërs"]) {
      rejects(() => canonicalString(base({ requestPath: bad })), "invalid_request_path");
    }
  });

  it("refuses a non-string body", () => {
    rejects(() => canonicalString(base({ body: { a: 1 } as unknown as string })), "invalid_body");
  });
});

describe("secret decoding", () => {
  it("decodes standard and URL-safe alphabets to the same bytes, with or without padding", () => {
    const expected = Buffer.from([0xfb, 0xff, 0xfe, 0xfd, 0xfc, 0xfb]);
    assert.deepEqual(decodeHmacSecret("+//+/fz7"), expected);
    assert.deepEqual(decodeHmacSecret("-__-_fz7"), expected);
    assert.deepEqual(decodeHmacSecret("YQ=="), Buffer.from("a"));
    assert.deepEqual(decodeHmacSecret("YQ"), Buffer.from("a"));
    assert.deepEqual(decodeHmacSecret("YWI="), Buffer.from("ab"));
    assert.deepEqual(decodeHmacSecret("YWI"), Buffer.from("ab"));
  });

  it("refuses empty, malformed or impossible secrets instead of guessing", () => {
    for (const bad of ["", "=", "====", "Y", "YWJjZ", "ab cd", "ab\ncd", "a$b=", "YQ=a", "YQ===", "secret with spaces", "YWJjZ=", "YQ=", "YWI==", "YWJj="]) {
      rejects(() => decodeHmacSecret(bad), "invalid_secret");
    }
    rejects(() => decodeHmacSecret(undefined as unknown as string), "invalid_secret");
    rejects(() => signL2(base({ credentials: { ...CREDENTIALS, secret: "not base64!" } })), "invalid_secret");
  });
});

describe("headers", () => {
  it("emits XO_* names only and never the secret", () => {
    const headers = buildL2Headers(base({ method: "POST", requestPath: "/order", body: "{}", canonicalMode: "path-only" }));
    assert.deepEqual(Object.keys(headers).sort(), ["XO_API_KEY", "XO_PASSPHRASE", "XO_SIGNATURE", "XO_TIMESTAMP"]);
    assert.equal(headers.XO_API_KEY, CREDENTIALS.apiKey);
    assert.equal(headers.XO_PASSPHRASE, CREDENTIALS.passphrase);
    for (const value of Object.values(headers)) assert.ok(!value.includes(CREDENTIALS.secret));
    assert.ok(!Object.keys(headers).some((k) => k.startsWith("POLY_")));
  });

  it("keeps '=' padding and the URL-safe alphabet", () => {
    const { XO_SIGNATURE } = buildL2Headers(base());
    assert.match(XO_SIGNATURE, /^[A-Za-z0-9_-]{43}=$/);
  });

  it("refuses header values that could inject a line or contain a space", () => {
    for (const bad of ["key\r\nX-Evil: 1", "has space", "", "tab\there", "naïve"]) {
      rejects(() => buildL2Headers(base({ credentials: { ...CREDENTIALS, apiKey: bad } })), "invalid_credential");
      rejects(() => buildL2Headers(base({ credentials: { ...CREDENTIALS, passphrase: bad } })), "invalid_credential");
    }
  });

  it("changing any signed component changes the signature", () => {
    const reference = signL2(base({ method: "POST", requestPath: "/order", body: '{"a":1}' }));
    const variants: Array<Partial<L2SignInput>> = [
      { timestamp: "1791389401" },
      { method: "DELETE" },
      { requestPath: "/orders" },
      { body: '{"a":2}' },
      { body: '{"a":1} ' },
      { credentials: { ...CREDENTIALS, secret: "c2VjcmV0LWtleS0xMjM0NTY3ODkwYWJjZGVn" } },
    ];
    for (const variant of variants) {
      const input = base({ method: "POST", requestPath: "/order", body: '{"a":1}', ...variant });
      assert.notEqual(signL2(input), reference, JSON.stringify(variant));
    }
  });

  it("is deterministic", () => {
    assert.equal(signL2(base()), signL2(base()));
  });
});
