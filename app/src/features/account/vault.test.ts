import { recoverMessageAddress, sha256, stringToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { createBackupClient } from "./backup";
import { proofText } from "./proof";
import { createMemoryAccountStore, generatedRecordId, parseAccountRecord } from "./store";
import { TRADING_KEY } from "./testkit";
import { credentialIdHex, openTradingKey, parseSealedKey, PRF_SALT, sealTradingKey, wrappingKeyFromPrf } from "./vault";

// Generated mode: the key sealed with AES-256-GCM under an HKDF key from the passkey's PRF output, with WebCrypto (Node's
// crypto.subtle here, the browser's in the page). The PRF outputs below are fixed test bytes standing in for an
// authenticator's answer.

const subtle = globalThis.crypto.subtle;
const PRF = new Uint8Array(32).fill(7);
const OTHER_PRF = new Uint8Array(32).fill(8);
const CREDENTIAL = credentialIdHex(new Uint8Array([1, 2, 3, 4, 250]));
// E as the backup client takes it (address and personal_sign of text), as the local signer provides it.
function proofSigner() {
  const account = privateKeyToAccount(TRADING_KEY);
  return { address: account.address, signMessage: (message: string) => account.signMessage({ message }) };
}

const random = (length: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(length));

async function sealed() {
  const wrappingKey = await wrappingKeyFromPrf(subtle, PRF, CREDENTIAL);
  return sealTradingKey({ subtle, wrappingKey, credentialId: CREDENTIAL, privateKey: TRADING_KEY, randomBytes: random });
}

describe("sealing the trading key", () => {
  it("round-trips: the same passkey output opens the same key", async () => {
    const blob = await sealed();
    expect(blob.address).toBe(privateKeyToAccount(TRADING_KEY).address);
    expect(blob.ciphertext).toHaveLength(96);
    expect(blob.ciphertext).not.toContain(TRADING_KEY.slice(2));
    const opened = await openTradingKey(subtle, await wrappingKeyFromPrf(subtle, PRF, CREDENTIAL), blob);
    expect(opened).toEqual({ ok: true, privateKey: TRADING_KEY, address: blob.address });
  });

  it("uses a fresh nonce each time", async () => {
    const [a, b] = [await sealed(), await sealed()];
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("does not open with another passkey's output", async () => {
    const opened = await openTradingKey(subtle, await wrappingKeyFromPrf(subtle, OTHER_PRF, CREDENTIAL), await sealed());
    expect(opened).toEqual({ ok: false, reason: "wrong_passkey" });
  });

  it("does not open when the blob is moved to another credential or names another address", async () => {
    const blob = await sealed();
    const moved = { ...blob, credentialId: "ab" };
    expect(await openTradingKey(subtle, await wrappingKeyFromPrf(subtle, PRF, "ab"), moved)).toEqual({ ok: false, reason: "wrong_passkey" });
    const renamed = { ...blob, address: privateKeyToAccount(`0x${"12".repeat(32)}`).address };
    expect(await openTradingKey(subtle, await wrappingKeyFromPrf(subtle, PRF, CREDENTIAL), renamed)).toEqual({ ok: false, reason: "wrong_passkey" });
  });

  it("uses a fixed 32-byte PRF salt", () => {
    expect(PRF_SALT).toHaveLength(32);
    expect(sha256(stringToBytes("insurance-markets trading key prf v1"), "bytes")).toEqual(PRF_SALT);
  });

  it("parses only well-formed sealed keys", async () => {
    const blob = await sealed();
    expect(parseSealedKey(JSON.parse(JSON.stringify(blob)))).toEqual(blob);
    expect(parseSealedKey({ ...blob, extra: 1 })).toBeNull();
    expect(parseSealedKey({ ...blob, iv: "zz" })).toBeNull();
  });
});

describe("the account store", () => {
  it("keeps records under their own id and refuses mismatched ones", async () => {
    const blob = await sealed();
    const record = { id: generatedRecordId(CREDENTIAL), kind: "generated" as const, sealed: blob, backup: "saved" as const, createdAt: "2026-10-24T00:00:00.000Z" };
    expect(parseAccountRecord(record)).toEqual(record);
    expect(parseAccountRecord({ ...record, id: "generated:ff" })).toBeNull();
    const store = createMemoryAccountStore();
    await store.put(record);
    expect(await store.list()).toEqual([record]);
  });
});

describe("the backup client", () => {
  it("PUTs the sealed key with E's ownership proof and GETs it back", async () => {
    const blob = await sealed();
    const owner = proofSigner();
    const requests: Array<{ url: string; init: RequestInit }> = [];
    let stored: string | null = null;
    const client = createBackupClient({
      origin: "https://api.test.invalid",
      nowMs: () => 1_792_756_800_000,
      fetch: async (url, init) => {
        requests.push({ url, init });
        if (init.method === "PUT") {
          stored = init.body as string;
          return { status: 204, text: async () => "" };
        }
        return stored === null ? { status: 404, text: async () => "" } : { status: 200, text: async () => stored as string };
      },
    });
    expect(await client.get(CREDENTIAL)).toEqual({ kind: "none" });
    expect(await client.put(blob, owner)).toEqual({ ok: true });
    const put = requests.find((request) => request.init.method === "PUT");
    expect(put?.url).toBe(`https://api.test.invalid/v1/account-backup/${CREDENTIAL}`);
    expect(put?.init.credentials).toBe("omit");
    const proof = (put?.init.headers as Record<string, string>)["x-im-proof"] ?? "";
    const [account, seconds, signature] = proof.split(".");
    expect(account).toBe(owner.address);
    expect(seconds).toBe("1792756800");
    const text = proofText("PUT", `/v1/account-backup/${CREDENTIAL}`, 1_792_756_800, put?.init.body as string);
    expect(await recoverMessageAddress({ message: text, signature: signature as `0x${string}` })).toBe(owner.address);
    expect(await client.get(CREDENTIAL)).toEqual({ kind: "found", sealed: blob });
  });

  it("reports an unbuilt route or an unreachable server honestly, never as success", async () => {
    const blob = await sealed();
    const owner = proofSigner();
    const missing = createBackupClient({ origin: "https://api.test.invalid", nowMs: () => 0, fetch: async () => ({ status: 404, text: async () => "" }) });
    expect(await missing.put(blob, owner)).toMatchObject({ ok: false, message: expect.stringMatching(/does not offer backups yet/) });
    const down = createBackupClient({
      origin: "https://api.test.invalid",
      nowMs: () => 0,
      fetch: async () => {
        throw new TypeError("network down");
      },
    });
    expect(await down.put(blob, owner)).toMatchObject({ ok: false });
    expect(await down.get(CREDENTIAL)).toMatchObject({ kind: "unreachable" });
  });

  it("hashes an empty body as the empty string in the proof text", () => {
    expect(proofText("get", "/v1/x", 5, "")).toBe("insurance-markets GET /v1/x 5 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
