import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { inspect } from "node:util";

import { getAddress, hashTypedData, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ECDSA_VALIDATOR } from "../src/xo/chain/constants.js";
import { signL2 as referenceSignL2 } from "../sdk/node/trade/xo/hmac.js";
import {
  DEFAULT_L1_VARIANT,
  HmacTriplet,
  SignedL2,
  assembleL1Headers,
  buildLoginDigests,
  formatL1Variant,
  formatL2Token,
  keyTagOf,
  l2Signature,
  parseL1Variant,
  parseL2Token,
  selectL1Variant,
  type L1Variant,
  type L2Key,
  type L2Pad,
} from "../relay/credentials.js";
import { hmacSignature } from "./mock-xo/wire.js";
import { clobAuthDigest, kernelWrappedDigest } from "./mock-xo/verify.js";
import { ANVIL_TEST_PRIVATE_KEYS } from "./fixtures/userop/anvil-test-keys.js";
import { prng } from "./relay-core-helpers.js";

// The pure parts of relay/credentials.ts: digests, L1 header assembly, the L1 and HMAC variant
// tokens, the HMAC itself and the in-memory triplet. No network, no clock. The golden values come from
// docs/signing-vectors.md (three independent methods) and the mock's own, separately written digests.

// XO's documentation placeholder account in the spelling the code requires (all lower case).
const SMART = "0xcafe000000000000000000000000000000000a11" as const;
// Anvil account 0: a PUBLIC TEST KEY, never fund it.
const TEST_KEY = ANVIL_TEST_PRIVATE_KEYS[0] as Hex;

const L1A = {
  timestamp: "1791389400",
  digest: "0x64a36fa69b02d5a273656445a2549ba8e1f2694743aad967273fa5943e198c1e",
  wrapped: "0x4ed2d357e8765ce1f3d3c1bde491b31871015d7c8e9bd17fd608f38f4fe3b3cc",
  ecdsa: "0x292df0d14e780293653e4d3227153e7f6b9369da499556988ee96098d72eea2b713d86a5776e464eaea637632d5548ae9544d32310130f9715cd519afccb80441b",
  wire: "0x01845adb2c711129d4f3966735ed98a9f09fc4ce57292df0d14e780293653e4d3227153e7f6b9369da499556988ee96098d72eea2b713d86a5776e464eaea637632d5548ae9544d32310130f9715cd519afccb80441b",
} as const;
const L1B = {
  timestamp: "1792344796",
  digest: "0x21acb038432cbba0686a58bd4985506d07bb935e13080b87f25b3d65557e7d11",
  wrapped: "0x6f0d66f4f6d133d4cdc7e04dd0e9841e5962322dc56bf6bb8078278ac51e3c6d",
} as const;

const S1 = "c2VjcmV0LWtleS0xMjM0NTY3ODkwYWJjZGVm";

describe("the login digests", () => {
  it("match the three-method vectors for the ClobAuth struct and its Kernel wrapper (L1a, L1b)", () => {
    const a = buildLoginDigests(SMART, L1A.timestamp, DEFAULT_L1_VARIANT);
    assert.equal(a.inner, L1A.digest);
    assert.equal(a.signed, L1A.wrapped);
    const b = buildLoginDigests(SMART, L1B.timestamp, DEFAULT_L1_VARIANT);
    assert.equal(b.inner, L1B.digest);
    assert.equal(b.signed, L1B.wrapped);
  });

  it("with the Kernel wrapper off the owner signs the plain ClobAuth digest", () => {
    const off = buildLoginDigests(SMART, L1A.timestamp, { ...DEFAULT_L1_VARIANT, wrap: "kernel-off" });
    assert.equal(off.signed, L1A.digest);
    assert.equal(off.inner, L1A.digest);
  });

  it("equal the mock's independently written digests for real account addresses (fixed seed)", () => {
    const random = prng(0xc10b);
    for (let index = 0; index < 40; index += 1) {
      const account = getAddress(`0x${Array.from({ length: 40 }, () => Math.floor(random() * 16).toString(16)).join("")}`);
      const timestamp = String(1_700_000_000 + Math.floor(random() * 200_000_000));
      const inner = clobAuthDigest(account, timestamp, 0n);
      assert.equal(buildLoginDigests(account, timestamp, DEFAULT_L1_VARIANT).signed, kernelWrappedDigest(inner, account), `${account} ${timestamp}`);
      assert.equal(buildLoginDigests(account, timestamp, { ...DEFAULT_L1_VARIANT, wrap: "kernel-off" }).signed, inner);
    }
  });

  it("change with the account, the timestamp and nothing else the caller could vary", () => {
    const base = buildLoginDigests(SMART, "1791389400", DEFAULT_L1_VARIANT).signed;
    assert.notEqual(buildLoginDigests(SMART, "1791389401", DEFAULT_L1_VARIANT).signed, base);
    assert.notEqual(buildLoginDigests("0xcafe000000000000000000000000000000000a12", "1791389400", DEFAULT_L1_VARIANT).signed, base);
    // The sig form and the address header do not change what is signed.
    assert.equal(buildLoginDigests(SMART, "1791389400", { ...DEFAULT_L1_VARIANT, sig: "sig-65", addr: "addr-no" }).signed, base);
  });
});

describe("L1 header assembly", () => {
  const sig65 = L1A.ecdsa as Hex;
  const account = getAddress(SMART);

  it("reproduces the pinned 86-byte wire signature of vector L1a with Anvil key 0", async () => {
    // The vector's own signature, recomputed from the public test key over the wrapped digest.
    const signed = await privateKeyToAccount(TEST_KEY).sign({ hash: L1A.wrapped });
    assert.equal(signed, L1A.ecdsa);
    const headers = assembleL1Headers({ account, timestamp: L1A.timestamp, sig65: signed, variant: DEFAULT_L1_VARIANT });
    assert.equal(headers["XO_SIGNATURE"], L1A.wire);
    assert.equal(headers["XO_TIMESTAMP"], L1A.timestamp);
    assert.equal(headers["XO_ADDRESS"], account);
  });

  it("builds each signature form from the same 65 bytes", () => {
    const body = sig65.slice(2);
    const form = (sig: "sig-86" | "sig-66" | "sig-65"): string => assembleL1Headers({ account, timestamp: L1A.timestamp, sig65, variant: { ...DEFAULT_L1_VARIANT, sig } })["XO_SIGNATURE"] as string;
    assert.equal(form("sig-86"), `0x01${ECDSA_VALIDATOR.slice(2).toLowerCase()}${body}`);
    assert.equal(form("sig-86").length, 2 + 86 * 2);
    assert.equal(form("sig-66"), `0x00${body}`);
    assert.equal(form("sig-66").length, 2 + 66 * 2);
    assert.equal(form("sig-65"), sig65);
    assert.equal(form("sig-65").length, 2 + 65 * 2);
  });

  it("an explicit `sig` (the ladder's step) overrides the variant's own form", () => {
    const headers = assembleL1Headers({ account, timestamp: L1A.timestamp, sig65, variant: DEFAULT_L1_VARIANT, sig: "sig-66" });
    assert.equal(headers["XO_SIGNATURE"], `0x00${sig65.slice(2)}`);
  });

  it("sends XO_ADDRESS unless the variant says addr-no, never sends XO_NONCE, and sends no other header", () => {
    const withAddress = assembleL1Headers({ account, timestamp: L1A.timestamp, sig65, variant: DEFAULT_L1_VARIANT });
    assert.deepEqual(Object.keys(withAddress).sort(), ["XO_ADDRESS", "XO_SIGNATURE", "XO_TIMESTAMP"]);
    const without = assembleL1Headers({ account, timestamp: L1A.timestamp, sig65, variant: { ...DEFAULT_L1_VARIANT, addr: "addr-no" } });
    assert.deepEqual(Object.keys(without).sort(), ["XO_SIGNATURE", "XO_TIMESTAMP"]);
  });

  it("refuses a signature that is not 65 canonical lower-case bytes, and a timestamp that is not unix seconds", () => {
    const refuse = (input: Partial<Parameters<typeof assembleL1Headers>[0]>): void =>
      assert.throws(() => assembleL1Headers({ account, timestamp: L1A.timestamp, sig65, variant: DEFAULT_L1_VARIANT, ...input }), (error: unknown) => (error as { code?: string }).code === "internal");
    refuse({ sig65: "0x1234" as Hex });
    refuse({ sig65: sig65.toUpperCase().replace("0X", "0x") as Hex });
    refuse({ sig65: `${sig65}00` as Hex });
    refuse({ timestamp: "0" });
    refuse({ timestamp: "12.5" });
    refuse({ timestamp: "" });
    refuse({ timestamp: "1791389400 " });
  });
});

describe("the L1 variant token", () => {
  it("round-trips every combination", () => {
    for (const wrap of ["kernel-on", "kernel-off"] as const) {
      for (const sig of ["sig-86", "sig-66", "sig-65"] as const) {
        for (const addr of ["addr-yes", "addr-no"] as const) {
          const variant: L1Variant = { wrap, sig, addr };
          assert.deepEqual(parseL1Variant(formatL1Variant(variant)), variant);
        }
      }
    }
    assert.equal(formatL1Variant(DEFAULT_L1_VARIANT), "kernel-on:sig-86:addr-yes");
  });

  it("fits a capability fact's value (at most 64 characters of a restricted alphabet)", () => {
    for (const token of ["kernel-on:sig-86:addr-yes", "kernel-off:sig-65:addr-no"]) assert.match(token, /^[A-Za-z0-9._:-]{1,64}$/);
  });

  it("refuses anything that is not one of the known tokens", () => {
    for (const bad of [undefined, "", "kernel-on", "kernel-on:sig-86", "kernel-on:sig-86:addr-yes:extra", "kernel-wrapped:sig-86:addr-yes", "kernel-on:sig-87:addr-yes", "kernel-on:sig-86:addr-maybe", "KERNEL-ON:SIG-86:ADDR-YES", " kernel-on:sig-86:addr-yes"]) {
      assert.equal(parseL1Variant(bad), undefined, String(bad));
    }
  });

  it("selects the documented form unless a usable, un-rejected fact says otherwise", () => {
    const registry = (state: string, value: string | undefined): Parameters<typeof selectL1Variant>[0] =>
      ({ fact: () => ({ id: "AU6", state, source: "operator", recordedAt: "x", note: undefined, value }) }) as unknown as Parameters<typeof selectL1Variant>[0];
    assert.deepEqual(selectL1Variant(undefined), DEFAULT_L1_VARIANT);
    assert.deepEqual(selectL1Variant({ fact: () => undefined } as unknown as Parameters<typeof selectL1Variant>[0]), DEFAULT_L1_VARIANT);
    assert.deepEqual(selectL1Variant(registry("yes", "kernel-off:sig-65:addr-yes")), { wrap: "kernel-off", sig: "sig-65", addr: "addr-yes" });
    assert.deepEqual(selectL1Variant(registry("unknown", "kernel-on:sig-66:addr-yes")), { wrap: "kernel-on", sig: "sig-66", addr: "addr-yes" });
    // A rejected form is not used again; garbage is ignored.
    assert.deepEqual(selectL1Variant(registry("no", "kernel-off:sig-65:addr-yes")), DEFAULT_L1_VARIANT);
    assert.deepEqual(selectL1Variant(registry("yes", "not a token")), DEFAULT_L1_VARIANT);
    assert.deepEqual(selectL1Variant(registry("yes", undefined)), DEFAULT_L1_VARIANT);
  });
});

describe("the HMAC variant token (OR10)", () => {
  it("round-trips, with the target unknown until probe B has run", () => {
    assert.equal(formatL2Token({ key: "b64url", pad: "padded", target: "path-with-query", addr: "addr-yes" }), "b64url-padded:path-with-query:addr-yes");
    assert.equal(formatL2Token({ key: "raw", pad: "stripped" }), "raw-stripped:unknown:addr-yes");
    assert.deepEqual(parseL2Token("b64url-stripped:path-only:addr-no"), { key: "b64url", pad: "stripped", target: "path-only", addr: "addr-no" });
    assert.deepEqual(parseL2Token("raw-padded:unknown:addr-yes"), { key: "raw", pad: "padded", addr: "addr-yes" });
    for (const key of ["b64url", "raw"] as const) {
      for (const pad of ["padded", "stripped"] as const) {
        for (const target of ["path-with-query", "path-only", undefined] as const) {
          const token = formatL2Token({ key, pad, ...(target === undefined ? {} : { target }), addr: "addr-yes" });
          assert.match(token, /^[A-Za-z0-9._:-]{1,64}$/);
          assert.deepEqual(parseL2Token(token), { key, pad, ...(target === undefined ? {} : { target }), addr: "addr-yes" });
        }
      }
    }
  });

  it("refuses unknown parts, extra parts and wrong case", () => {
    for (const bad of [undefined, "", "b64url-padded", "b64url-padded:path-only", "base64-padded:path-only:addr-yes", "b64url-padding:path-only:addr-yes", "b64url-padded:query:addr-yes", "b64url-padded:path-only:addr-maybe", "b64url-padded-extra:path-only:addr-yes", "b64url-padded:path-only:addr-yes:more", "B64URL-PADDED:path-only:addr-yes"]) {
      assert.equal(parseL2Token(bad), undefined, String(bad));
    }
  });
});

describe("the HMAC, against the three-method vectors of docs/signing-vectors.md", () => {
  const padded = { key: "b64url", pad: "padded" } as const;

  it("hmac1: S1, POST /order with a body", () => {
    assert.equal(l2Signature(S1, padded, '1791389400POST/order{"orderType":"GTC"}'), "1UIXoS3OTKqGeKfPthBHz3xsrh1tuF6f1oJl8hGmd2Q=");
  });

  it("hmac2: the same request signed over the path only and over the path with its query differ", () => {
    assert.equal(l2Signature(S1, padded, "1791389400GET/orders"), "JmJz5GTC0PCT50UblUg_HYRptQQgTbzWi7_NedprQw0=");
    assert.equal(l2Signature(S1, padded, "1791389400GET/orders?next_cursor=&market=0xabc"), "QD0vYcxOrBKpZW-C6J1Dbb4Vp1zEK5FX8c_ykzfg84A=");
  });

  it("hmac3: the standard and the URL-safe spelling of one secret are one key", () => {
    const message = '1791389401DELETE/order{"orderID":"42"}';
    const standard = l2Signature("+//+/fz7+//+/fz7+//+/fz7", padded, message);
    assert.equal(standard, "qOUvNF1hm3SJNxyZ9mu1V-R3W7AgyGgWnUxrxGu-XM0=");
    assert.equal(l2Signature("-__-_fz7-__-_fz7-__-_fz7", padded, message), standard);
  });

  it("hmac4: the OpenAPI example secret, with and without its trailing '='", () => {
    const secret = "dGhpcy1pcy1hbi1leGFtcGxlLWhtYWMtc2VjcmV0LWtleS1iYXNlNjQ=";
    const message = "1791389402GET/orders?limit=10";
    assert.equal(l2Signature(secret, padded, message), "GUZXPTS1RzA3YpoR74CzvsqToddkb4zWuZOlGlv-N-w=");
    assert.equal(l2Signature(secret.slice(0, -1), padded, message), "GUZXPTS1RzA3YpoR74CzvsqToddkb4zWuZOlGlv-N-w=");
  });

  it("hmac5: a signature that contains '-' and '_' keeps them (the URL-safe alphabet)", () => {
    const value = l2Signature(S1, padded, "1791389500GET/book");
    assert.equal(value, "IJ8RYppty9OUNy57PaQArGhs96Dm-OcLHbDEZx5C0nk=");
    assert.match(value, /[-_]/);
  });

  it("the stripped output is the padded output without its '=' and nothing else", () => {
    const message = '1791389400POST/order{"orderType":"GTC"}';
    assert.equal(l2Signature(S1, { key: "b64url", pad: "stripped" }, message), "1UIXoS3OTKqGeKfPthBHz3xsrh1tuF6f1oJl8hGmd2Q");
  });

  it("the raw key is the secret's own text, which is a different key from its decoding", () => {
    const message = "1791389400GET/auth/api-keys";
    const expected = createHmac("sha256", Buffer.from(S1, "utf8")).update(message, "utf8").digest("base64").replace(/\+/g, "-").replace(/\//g, "_");
    assert.equal(l2Signature(S1, { key: "raw", pad: "padded" }, message), expected);
    assert.notEqual(l2Signature(S1, { key: "raw", pad: "padded" }, message), l2Signature(S1, padded, message));
  });

  it("equals the reference signer (sdk/node/trade/xo/hmac.ts) for the default variant and the mock for all three of its decodings (fixed seed)", () => {
    const random = prng(0x1d5);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const mockForms: ReadonlyArray<readonly [string, { readonly key: L2Key; readonly pad: L2Pad }]> = [
      ["b64url-decoded-padded", { key: "b64url", pad: "padded" }],
      ["stripped", { key: "b64url", pad: "stripped" }],
      ["raw", { key: "raw", pad: "padded" }],
    ];
    for (let index = 0; index < 200; index += 1) {
      // A secret of 16 to 47 random bytes in base64url, padded to a multiple of 4 like XO's.
      const bytes = Buffer.from(Array.from({ length: 16 + Math.floor(random() * 32) }, () => Math.floor(random() * 256)));
      const secret = bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
      const timestamp = String(1_700_000_000 + Math.floor(random() * 100_000_000));
      const method = ["GET", "POST", "DELETE"][Math.floor(random() * 3)] as string;
      const path = `/${Array.from({ length: 1 + Math.floor(random() * 12) }, () => alphabet[Math.floor(random() * alphabet.length)]).join("")}`;
      const body = random() < 0.5 ? "" : JSON.stringify({ n: Math.floor(random() * 1e9) });
      const message = `${timestamp}${method}${path}${body}`;
      assert.equal(l2Signature(secret, padded, message), referenceSignL2({ credentials: { apiKey: "k", secret, passphrase: "p" }, timestamp, method, requestPath: path, body, canonicalMode: "path-only" }));
      for (const [mockName, variant] of mockForms) {
        assert.equal(l2Signature(secret, variant, message), hmacSignature(secret, mockName as "stripped" | "raw" | "b64url-decoded-padded", message), `${mockName} case ${String(index)}`);
      }
    }
  });
});

describe("HmacTriplet", () => {
  const triplet = HmacTriplet.from({ apiKey: "CANARY-KEY-0001", secret: S1, passphrase: "CANARY-PASS-0001" });

  it("prints as nothing in every form a careless logger could use", () => {
    assert.ok(triplet !== null);
    for (const text of [String(triplet), JSON.stringify(triplet), JSON.stringify({ nested: triplet }), inspect(triplet, { showHidden: true, depth: 5 }), `${triplet.toString()}`]) {
      assert.ok(!text.includes("CANARY"), text);
      assert.ok(!text.includes(S1), text);
    }
    assert.equal(String(triplet), "[redacted]");
    assert.equal(JSON.stringify(triplet), '"[redacted]"');
  });

  it("accepts only a printable, space-free, bounded triplet", () => {
    const base = { apiKey: "a-key", secret: S1, passphrase: "pass" };
    assert.ok(HmacTriplet.from(base) !== null);
    for (const bad of [
      null,
      "string",
      [],
      {},
      { ...base, apiKey: "" },
      { ...base, apiKey: "has space" },
      { ...base, apiKey: "tab\there" },
      { ...base, apiKey: "line\nbreak" },
      { ...base, apiKey: "x".repeat(513) },
      { ...base, secret: "" },
      { ...base, secret: "bad secret" },
      { ...base, secret: "x".repeat(1025) },
      { ...base, secret: 123 },
      { ...base, passphrase: "" },
      { ...base, passphrase: "pass word" },
      { ...base, passphrase: undefined },
      { apiKey: "a-key", secret: S1 },
    ]) {
      assert.equal(HmacTriplet.from(bad), null, JSON.stringify(bad));
    }
  });

  it("knows whether a secret can be decoded as base64 at all (so a hopeless variant costs no request)", () => {
    assert.equal(triplet?.canDecode(), true);
    assert.equal(HmacTriplet.from({ apiKey: "k", secret: "not base64!!", passphrase: "p" }), null, "a space or '!' is not even a printable token");
    assert.equal(HmacTriplet.from({ apiKey: "k", secret: "a", passphrase: "p" })?.canDecode(), false, "one base64 digit is an impossible length");
    assert.equal(HmacTriplet.from({ apiKey: "k", secret: "plain_text:with:colons", passphrase: "p" })?.canDecode(), false);
  });

  it("serialises to exactly the three fields for the vault, and compares without exposing them", () => {
    assert.ok(triplet !== null);
    assert.deepEqual(JSON.parse(triplet.serialize()), { apiKey: "CANARY-KEY-0001", secret: S1, passphrase: "CANARY-PASS-0001" });
    const same = HmacTriplet.from({ apiKey: "CANARY-KEY-0001", secret: S1, passphrase: "CANARY-PASS-0001" });
    const other = HmacTriplet.from({ apiKey: "CANARY-KEY-0001", secret: `${S1}x`, passphrase: "CANARY-PASS-0001" });
    assert.ok(same !== null && other !== null);
    assert.equal(triplet.sameSecret(same), true);
    assert.equal(triplet.sameSecret(other), false);
  });

  it("builds the four XO_* headers and never POLY_*", () => {
    assert.ok(triplet !== null);
    const headers = triplet.headers({ key: "b64url", pad: "padded" }, "1791389400", '1791389400POST/order{"orderType":"GTC"}');
    assert.deepEqual(Object.keys(headers).sort(), ["XO_API_KEY", "XO_PASSPHRASE", "XO_SIGNATURE", "XO_TIMESTAMP"]);
    assert.equal(headers["XO_API_KEY"], "CANARY-KEY-0001");
    assert.equal(headers["XO_SIGNATURE"], "1UIXoS3OTKqGeKfPthBHz3xsrh1tuF6f1oJl8hGmd2Q=");
  });
});

describe("keyTagOf", () => {
  it("is a 12-digit hash prefix that is deterministic, differs per key and contains nothing of the key", () => {
    const key = "0b6f2d41-c8aa-4d4d-9e11-aaaaaaaaaaaa";
    const tag = keyTagOf(key);
    assert.match(tag, /^[0-9a-f]{12}$/);
    assert.equal(keyTagOf(key), tag);
    assert.notEqual(keyTagOf(`${key}x`), tag);
    assert.ok(!key.replace(/-/g, "").includes(tag));
    assert.match(tag, /^[A-Za-z0-9_-]{1,32}$/, "fits the status route's key_tag pattern");
  });
});

describe("SignedL2", () => {
  it("keeps its headers out of JSON, inspect and string conversion, and hands out copies", () => {
    const signed = new SignedL2("https://orderbooks.xo.market/orders", "1791389400", { key: "b64url", pad: "padded", target: "path-only", addr: "addr-yes" }, { XO_SIGNATURE: "CANARY-HMAC-VALUE-1", XO_API_KEY: "CANARY-KEY-2" });
    for (const text of [JSON.stringify(signed), inspect(signed, { showHidden: true, depth: 5 }), JSON.stringify({ wrapped: signed })]) {
      assert.ok(!text.includes("CANARY"), text);
    }
    const copy = signed.headers;
    copy["XO_SIGNATURE"] = "changed";
    assert.equal(signed.headers["XO_SIGNATURE"], "CANARY-HMAC-VALUE-1", "mutating a copy does not change the request");
    assert.equal(Object.isFrozen(signed), true);
  });
});

describe("the typed data of the Kernel wrapper hashes to the digest the owner signs", () => {
  it("is the same hash the relay's checkPreparedSign recomputes", () => {
    const wrapped = buildLoginDigests(getAddress(SMART), L1A.timestamp, DEFAULT_L1_VARIANT).signed;
    const typed = {
      domain: { name: "Kernel", version: "0.3.1", chainId: 3223, verifyingContract: getAddress(SMART) },
      types: { Kernel: [{ name: "hash", type: "bytes32" }] },
      primaryType: "Kernel" as const,
      message: { hash: L1A.digest as Hex },
    };
    assert.equal(hashTypedData(typed), wrapped);
  });
});
