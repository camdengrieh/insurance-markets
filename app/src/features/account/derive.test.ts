import { hashTypedData, hexToBigInt, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { WalletError } from "../../core/signer";
import { canonicalSignature, deriveTradingKey, keyFromSignature, SECP256K1_ORDER, UNLOCK_TYPED_DATA, unlockTypedData } from "./derive";
import { fakeWallet, highS, WALLET_KEY } from "./testkit";

// Derived mode: the trading key is keccak256 of the wallet's one fixed signature, reduced mod n. These tests pin the
// message (any change would move every derived account), the determinism across answers that differ only in encoding,
// and every refusal.

describe("the unlock message", () => {
  it("has no chainId in its domain and is frozen", () => {
    expect(Object.keys(UNLOCK_TYPED_DATA.domain).sort()).toEqual(["name", "version"]);
    expect(Object.isFrozen(UNLOCK_TYPED_DATA.message)).toBe(true);
    expect(unlockTypedData().message.action).toBe("Unlock your trading account");
  });

  it("hashes to the same digest every time (a changed byte would change every account)", () => {
    const digest = hashTypedData(unlockTypedData());
    expect(hashTypedData(unlockTypedData())).toBe(digest);
    expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("keyFromSignature", () => {
  it("is keccak256 of the signature reduced mod n", async () => {
    const signature = await privateKeyToAccount(WALLET_KEY).signTypedData(unlockTypedData());
    const key = keyFromSignature(signature);
    expect(hexToBigInt(key)).toBe(hexToBigInt(keccak256(signature)) % SECP256K1_ORDER);
    expect(key).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("canonicalSignature", () => {
  it("maps v 0/1 and a high s to the same canonical bytes", async () => {
    const signature = await privateKeyToAccount(WALLET_KEY).signTypedData(unlockTypedData());
    const lowV: Hex = `0x${signature.slice(2, 130)}${signature.endsWith("1b") ? "00" : "01"}`;
    expect(canonicalSignature(signature)).toBe(signature.toLowerCase());
    expect(canonicalSignature(lowV)).toBe(signature.toLowerCase());
    expect(canonicalSignature(highS(signature))).toBe(signature.toLowerCase());
  });

  it("refuses what is not a 65-byte signature", () => {
    expect(canonicalSignature("0x1234")).toBeNull();
    expect(canonicalSignature(`0x${"00".repeat(65)}`)).toBeNull();
  });
});

describe("deriveTradingKey", () => {
  it("makes the same account from the same wallet every time (determinism)", async () => {
    const first = await deriveTradingKey(fakeWallet(), { confirm: true });
    const second = await deriveTradingKey(fakeWallet(), { confirm: false });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.key).toBe(first.key);
    expect(second.address).toBe(first.address);
    expect(privateKeyToAccount(first.key).address).toBe(first.address);
    // The account is not the wallet.
    expect(first.address).not.toBe(fakeWallet().address);
  });

  it("asks twice on first creation and once when re-making a known account", async () => {
    const creating = fakeWallet();
    await deriveTradingKey(creating, { confirm: true });
    expect(creating.typedRequests).toHaveLength(2);
    const unlocking = fakeWallet();
    await deriveTradingKey(unlocking, { confirm: false });
    expect(unlocking.typedRequests).toHaveLength(1);
    expect(unlocking.typedRequests[0]?.domain).toEqual({ name: "insurance-markets trading account", version: "1" });
  });

  it("is the same account whether the wallet answers with v 0/1 or 27/28", async () => {
    const usual = await deriveTradingKey(fakeWallet(), { confirm: false });
    const lowV = await deriveTradingKey(fakeWallet({ lowV: true }), { confirm: false });
    expect(usual.ok && lowV.ok && usual.address === lowV.address).toBe(true);
  });

  it("refuses a signature that does not recover to the wallet (a smart-contract wallet)", async () => {
    const result = await deriveTradingKey(fakeWallet({ mode: "other_key" }), { confirm: true });
    expect(result).toMatchObject({ ok: false, reason: "not_plain_key" });
  });

  it("reports a declined signature in plain words", async () => {
    const result = await deriveTradingKey(fakeWallet({ error: new WalletError("rejected", "User rejected") }), { confirm: true });
    expect(result).toMatchObject({ ok: false, reason: "rejected" });
  });

  it("refuses a re-made account that differs from the one remembered for this wallet", async () => {
    const result = await deriveTradingKey(fakeWallet(), { confirm: false, expected: privateKeyToAccount(WALLET_KEY).address });
    expect(result).toMatchObject({ ok: false, reason: "address_changed" });
  });
});
