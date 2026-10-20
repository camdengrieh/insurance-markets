import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspect } from "node:util";

import {
  constantTimeEqual,
  createKeyring,
  CryptoError,
  DEFAULT_KDF,
  deriveMasterKey,
  MIN_KDF_N,
  open,
  openFromText,
  parseKeyring,
  parseSealed,
  randomHex,
  seal,
  sealToText,
  unlockKeyring,
  type Sealed,
} from "../relay/crypto.js";
import { addr, prng, secret, TEST_KDF, TEST_MASTER_SECRET } from "./relay-core-helpers.js";

// AES-256-GCM with the key from scrypt, the account as associated data, and a schema version.

const WEAK = { allowWeakKdf: true } as const;
const ACCOUNT_A = addr(0xa1);
const ACCOUNT_B = addr(0xb2);

async function key(): Promise<Buffer> {
  const { key: master } = await createKeyring(secret(TEST_MASTER_SECRET), TEST_KDF, WEAK);
  return master.subkey("secrets");
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof CryptoError, "expected a CryptoError");
    return error.code;
  }
  return "no error";
}

describe("sealed records: round trip", () => {
  it("opens what it sealed, for plaintexts of many sizes and alphabets (fixed seed)", async () => {
    const k = await key();
    const random = prng(20261019);
    for (let index = 0; index < 60; index += 1) {
      const length = Math.floor(random() * 300);
      const text = Array.from({ length }, () => String.fromCodePoint(32 + Math.floor(random() * 5000))).join("");
      const plaintext = Buffer.from(text.replace(/[\ud800-\udfff]/g, "?"), "utf8");
      const sealed = seal(k, "secret:hmac_triplet", ACCOUNT_A, plaintext);
      assert.deepEqual(open(k, sealed, "secret:hmac_triplet", ACCOUNT_A), plaintext);
    }
  });

  it("uses a fresh IV every time (no two of 300 seals share one)", async () => {
    const k = await key();
    const ivs = new Set<string>();
    for (let index = 0; index < 300; index += 1) ivs.add(seal(k, "secret:x", ACCOUNT_A, "same plaintext").iv);
    assert.equal(ivs.size, 300);
  });

  it("round-trips through the file text, which ends with a newline and is one JSON object", async () => {
    const k = await key();
    const text = sealToText(k, "secret:x", ACCOUNT_A, "value");
    assert.ok(text.endsWith("\n"));
    assert.equal(openFromText(k, text, "secret:x", ACCOUNT_A).toString("utf8"), "value");
    assert.equal(JSON.parse(text).format, "xo-relay-sealed");
    assert.equal(JSON.parse(text).v, 1);
    assert.equal(JSON.parse(text).alg, "aes-256-gcm");
  });

  it("never writes the plaintext into the sealed text", async () => {
    const k = await key();
    const canary = "CANARY-plaintext-0123456789-abcdef";
    const text = sealToText(k, "secret:x", ACCOUNT_A, canary);
    assert.equal(text.includes(canary), false);
    assert.equal(text.includes(Buffer.from(canary).toString("base64")), false);
    assert.equal(text.includes(Buffer.from(canary).toString("base64url")), false);
    assert.equal(text.includes(Buffer.from(canary).toString("hex")), false);
  });
});

describe("sealed records: tamper detection", () => {
  async function sealedValue(): Promise<{ readonly k: Buffer; readonly sealed: Sealed }> {
    const k = await key();
    return { k, sealed: seal(k, "secret:hmac_triplet", ACCOUNT_A, "api-secret-value-123456") };
  }

  function flip(value: string, index: number): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const current = value[index] as string;
    const replacement = alphabet[(alphabet.indexOf(current) + 1) % alphabet.length] as string;
    return `${value.slice(0, index)}${replacement}${value.slice(index + 1)}`;
  }

  it("refuses a record whose ciphertext was changed at any position", async () => {
    const { k, sealed } = await sealedValue();
    for (let index = 0; index < sealed.ct.length; index += 1) {
      const bad = { ...sealed, ct: flip(sealed.ct, index) };
      assert.ok(["auth_failed", "format"].includes(codeOf(() => open(k, bad, "secret:hmac_triplet", ACCOUNT_A))), `ct[${index}]`);
    }
  });

  it("refuses a record whose tag or IV was changed at any position", async () => {
    const { k, sealed } = await sealedValue();
    for (const field of ["tag", "iv"] as const) {
      for (let index = 0; index < sealed[field].length - 1; index += 1) {
        const bad = { ...sealed, [field]: flip(sealed[field], index) } as Sealed;
        assert.equal(codeOf(() => open(k, bad, "secret:hmac_triplet", ACCOUNT_A)), "auth_failed", `${field}[${index}]`);
      }
    }
  });

  it("refuses a truncated or extended ciphertext", async () => {
    const { k, sealed } = await sealedValue();
    assert.notEqual(codeOf(() => open(k, { ...sealed, ct: sealed.ct.slice(0, -2) }, "secret:hmac_triplet", ACCOUNT_A)), "no error");
    assert.notEqual(codeOf(() => open(k, { ...sealed, ct: `${sealed.ct}AA` }, "secret:hmac_triplet", ACCOUNT_A)), "no error");
  });

  it("refuses the wrong key", async () => {
    const { sealed } = await sealedValue();
    const other = (await createKeyring(secret("a-different-master-secret-1234"), TEST_KDF, WEAK)).key.subkey("secrets");
    assert.equal(codeOf(() => open(other, sealed, "secret:hmac_triplet", ACCOUNT_A)), "auth_failed");
  });

  it("binds the record to its account: another account's file does not open", async () => {
    const { k, sealed } = await sealedValue();
    // Asking for the other account is caught by the stored binding.
    assert.equal(codeOf(() => open(k, sealed, "secret:hmac_triplet", ACCOUNT_B)), "format");
    // Editing the stored binding to match makes the associated data differ, so authentication fails.
    assert.equal(codeOf(() => open(k, { ...sealed, account: ACCOUNT_B }, "secret:hmac_triplet", ACCOUNT_B)), "auth_failed");
  });

  it("binds the record to its purpose: a backup does not open as a secret", async () => {
    const k = await key();
    const backup = seal(k, "backup:hmac_triplet", ACCOUNT_A, "v");
    assert.equal(codeOf(() => open(k, backup, "secret:hmac_triplet", ACCOUNT_A)), "format");
    assert.equal(codeOf(() => open(k, { ...backup, purpose: "secret:hmac_triplet" }, "secret:hmac_triplet", ACCOUNT_A)), "auth_failed");
  });

  it("refuses an unknown schema version, format or cipher instead of guessing", async () => {
    const { k, sealed } = await sealedValue();
    assert.equal(codeOf(() => open(k, { ...sealed, v: 2 as 1 }, "secret:hmac_triplet", ACCOUNT_A)), "version");
    assert.equal(codeOf(() => open(k, { ...sealed, format: "other" as "xo-relay-sealed" }, "secret:hmac_triplet", ACCOUNT_A)), "format");
    assert.equal(codeOf(() => open(k, { ...sealed, alg: "aes-128-gcm" as "aes-256-gcm" }, "secret:hmac_triplet", ACCOUNT_A)), "format");
    assert.equal(codeOf(() => parseSealed(JSON.stringify({ ...sealed, v: 2 }))), "version");
    assert.equal(codeOf(() => parseSealed("not json")), "format");
    assert.equal(codeOf(() => parseSealed("[]")), "format");
    assert.equal(codeOf(() => parseSealed(JSON.stringify({ ...sealed, iv: "AAAA" }))), "format");
    assert.equal(codeOf(() => parseSealed(JSON.stringify({ ...sealed, ct: "***" }))), "format");
  });

  it("refuses a bad account or purpose when sealing", async () => {
    const k = await key();
    assert.equal(codeOf(() => seal(k, "secret:x", "0xABCDEF0000000000000000000000000000000001", "v")), "invalid_input");
    assert.equal(codeOf(() => seal(k, "Bad Purpose", ACCOUNT_A, "v")), "invalid_input");
    assert.equal(codeOf(() => seal(Buffer.alloc(16), "secret:x", ACCOUNT_A, "v")), "invalid_input");
    assert.equal(codeOf(() => seal(k, "secret:x", ACCOUNT_A, Buffer.alloc(70_000))), "invalid_input");
  });
});

describe("keyring and key derivation", () => {
  it("unlocks with the same master secret and refuses a different one", async () => {
    const { file, key: first } = await createKeyring(secret(TEST_MASTER_SECRET), TEST_KDF, WEAK);
    const again = await unlockKeyring(parseKeyring(JSON.stringify(file)), secret(TEST_MASTER_SECRET), WEAK);
    assert.deepEqual(again.subkey("secrets"), first.subkey("secrets"));
    await assert.rejects(unlockKeyring(file, secret("not-the-master-secret-123"), WEAK), (error: unknown) => error instanceof CryptoError && error.code === "wrong_master_key");
  });

  it("keeps the keyring free of the secret and of the derived key", async () => {
    const { file, key: master } = await createKeyring(secret(TEST_MASTER_SECRET), TEST_KDF, WEAK);
    const text = JSON.stringify(file);
    assert.equal(text.includes(TEST_MASTER_SECRET), false);
    assert.equal(text.includes(master.subkey("secrets").toString("hex")), false);
    assert.equal(text.includes(master.subkey("secrets").toString("base64url")), false);
  });

  it("gives different keys for different purposes", async () => {
    const { key: master } = await createKeyring(secret(TEST_MASTER_SECRET), TEST_KDF, WEAK);
    assert.notDeepEqual(master.subkey("secrets"), master.subkey("check"));
    assert.equal(master.subkey("secrets").length, 32);
  });

  it("uses a new salt per installation, so the same secret gives different keys", async () => {
    const a = await createKeyring(secret(TEST_MASTER_SECRET), TEST_KDF, WEAK);
    const b = await createKeyring(secret(TEST_MASTER_SECRET), TEST_KDF, WEAK);
    assert.notEqual(a.file.salt, b.file.salt);
    assert.notDeepEqual(a.key.subkey("secrets"), b.key.subkey("secrets"));
  });

  it("a tampered salt or check value reads as a wrong master secret", async () => {
    const { file } = await createKeyring(secret(TEST_MASTER_SECRET), TEST_KDF, WEAK);
    const salt = file.salt.startsWith("A") ? `B${file.salt.slice(1)}` : `A${file.salt.slice(1)}`;
    await assert.rejects(unlockKeyring({ ...file, salt }, secret(TEST_MASTER_SECRET), WEAK), /does not match/);
    const check = file.check.startsWith("0") ? `1${file.check.slice(1)}` : `0${file.check.slice(1)}`;
    await assert.rejects(unlockKeyring({ ...file, check }, secret(TEST_MASTER_SECRET), WEAK), /does not match/);
  });

  it("refuses a weak cost unless a test asks for it, including from a tampered file", async () => {
    await assert.rejects(createKeyring(secret(TEST_MASTER_SECRET), TEST_KDF), (error: unknown) => error instanceof CryptoError && error.code === "weak_kdf");
    const { file } = await createKeyring(secret(TEST_MASTER_SECRET), TEST_KDF, WEAK);
    await assert.rejects(unlockKeyring(file, secret(TEST_MASTER_SECRET)), (error: unknown) => error instanceof CryptoError && error.code === "weak_kdf");
  });

  it("refuses nonsense parameters and an absurd cost", async () => {
    const { file } = await createKeyring(secret(TEST_MASTER_SECRET), TEST_KDF, WEAK);
    for (const kdf of [{ N: 1000, r: 8, p: 1 }, { N: 1024, r: 0, p: 1 }, { N: 1024, r: 8, p: 0 }, { N: 2 ** 30, r: 8, p: 1 }]) {
      await assert.rejects(unlockKeyring({ ...file, kdf: { alg: "scrypt", ...kdf } }, secret(TEST_MASTER_SECRET), WEAK), CryptoError);
    }
  });

  it("parses only a keyring file of the right format and version", async () => {
    const { file } = await createKeyring(secret(TEST_MASTER_SECRET), TEST_KDF, WEAK);
    assert.equal(parseKeyring(JSON.stringify(file)).salt, file.salt);
    assert.equal(codeOf(() => parseKeyring(JSON.stringify({ ...file, v: 2 }))), "version");
    assert.equal(codeOf(() => parseKeyring(JSON.stringify({ ...file, format: "x" }))), "format");
    assert.equal(codeOf(() => parseKeyring(JSON.stringify({ ...file, check: "zz" }))), "format");
    assert.equal(codeOf(() => parseKeyring(JSON.stringify({ ...file, salt: "AAAA" }))), "format");
    assert.equal(codeOf(() => parseKeyring("{")), "format");
  });

  it("refuses a short or oversize master secret", async () => {
    await assert.rejects(deriveMasterKey(secret("short"), Buffer.alloc(32), TEST_KDF, WEAK), CryptoError);
    await assert.rejects(deriveMasterKey(secret("x".repeat(2000)), Buffer.alloc(32), TEST_KDF, WEAK), CryptoError);
    await assert.rejects(deriveMasterKey(secret(TEST_MASTER_SECRET), Buffer.alloc(8), TEST_KDF, WEAK), CryptoError);
  });

  it("the production cost is at least the minimum and actually derives a key", async () => {
    assert.ok(DEFAULT_KDF.N >= MIN_KDF_N);
    const master = await deriveMasterKey(secret(TEST_MASTER_SECRET), Buffer.alloc(32, 7), DEFAULT_KDF);
    assert.equal(master.subkey("secrets").length, 32);
  });

  it("prints as [redacted] however it is formatted, and cannot be used after destroy", async () => {
    const { key: master } = await createKeyring(secret(TEST_MASTER_SECRET), TEST_KDF, WEAK);
    const hex = master.subkey("secrets").toString("hex");
    for (const text of [String(master), `${master}`, JSON.stringify({ master }), inspect(master), inspect({ nested: { master } }, { depth: 5 })]) {
      assert.equal(text.includes(hex), false);
      assert.ok(text.includes("[redacted]"));
    }
    master.destroy();
    assert.throws(() => master.subkey("secrets"), CryptoError);
  });
});

describe("small helpers", () => {
  it("constantTimeEqual compares by value, across lengths, including empty", () => {
    assert.equal(constantTimeEqual("abc", "abc"), true);
    assert.equal(constantTimeEqual("abc", "abd"), false);
    assert.equal(constantTimeEqual("abc", "abcd"), false);
    assert.equal(constantTimeEqual("", ""), true);
    assert.equal(constantTimeEqual("", "a"), false);
    assert.equal(constantTimeEqual("é", "é"), true);
  });

  it("randomHex returns the requested number of random bytes as lower-case hex", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const value = randomHex(16);
      assert.match(value, /^[0-9a-f]{32}$/);
      seen.add(value);
    }
    assert.equal(seen.size, 200);
  });
});
