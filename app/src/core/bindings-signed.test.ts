// @vitest-environment node
import { describe, expect, it } from "vitest";

import { privateKeyToAccount } from "viem/accounts";

import { proofMessage, proofNonce } from "../features/wallet/connect/proof";
import { ANVIL_KEY_0, ANVIL_KEY_1 } from "../features/wallet/connect/testkit";
import { BindingsStore, addressBindingSchema, createMemoryRecordStore, looksLikeSecret, proofRecovers, type BindingProof } from "./bindings";

// A wallet-signed address: the connected wallet signed the short proof text (features/wallet/connect/proof.ts) and the
// binding keeps it. Signatures are real, from Anvil's public development keys.

const owner = privateKeyToAccount(ANVIL_KEY_0);
const other = privateKeyToAccount(ANVIL_KEY_1);
const message = proofMessage({ host: "page.test", origin: "https://page.test", address: owner.address, chainId: 137, nonce: "abcdefgh12345678", issuedAt: "2026-10-23T00:00:00.000Z" });

function newStore(): BindingsStore {
  return new BindingsStore(createMemoryRecordStore());
}

async function proof(signer = owner, text = message): Promise<BindingProof> {
  const signature = await signer.signMessage({ message: text });
  return { method: "eip191_personal_sign", verified: await proofRecovers(owner.address, { message: text, signature }), signedAt: "2026-10-23T00:00:00.000Z", message: text, signature };
}

describe("a wallet-signed address", () => {
  it("writes the EIP-4361 layout with the fixed statement, and checks the signature offline", async () => {
    expect(message.split("\n")).toEqual([
      "page.test wants you to sign in with your Ethereum account:",
      owner.address,
      "",
      "Prove you control this address for this page. This signs nothing else.",
      "",
      "URI: https://page.test",
      "Version: 1",
      "Chain ID: 137",
      "Nonce: abcdefgh12345678",
      "Issued At: 2026-10-23T00:00:00.000Z",
    ]);
    expect((await proof()).verified).toBe(true);
    expect((await proof(other)).verified).toBe(false);
    expect(await proofRecovers(owner.address, { message, signature: "0xdead" })).toBe(false);
    expect(await proofRecovers("nope", { message, signature: (await proof()).signature })).toBe(false);
    expect(proofNonce((bytes) => bytes.fill(35))).toBe("z".repeat(16));
    expect(proofNonce()).toMatch(/^[0-9a-z]{16}$/);
  });

  it("saves a verified proof as source wallet_signed, kind eoa, with no venue selected", async () => {
    const store = newStore();
    const result = await store.addSigned({ address: owner.address, proof: await proof() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.binding).toMatchObject({ kind: "eoa", chain: "evm", address: owner.address, source: "wallet_signed", venues: [], label: "Connected wallet" });
    expect(result.binding.proof?.verified).toBe(true);
    expect(await store.list()).toHaveLength(1);
  });

  it("records a smart account's proof (it does not recover) as unverified rather than refusing it", async () => {
    const store = newStore();
    const result = await store.addSigned({ address: owner.address, proof: await proof(other) });
    expect(result.ok && result.binding.proof?.verified).toBe(false);
    expect(result.ok && result.binding.source).toBe("wallet_signed");
  });

  it("upgrades an address already pasted, keeping its label and venues", async () => {
    const store = newStore();
    const pasted = await store.add({ address: owner.address, kind: "eoa", label: "Mine", venues: ["limitless"] });
    if (!pasted.ok) throw new Error("fixture");
    const result = await store.addSigned({ address: owner.address, proof: await proof() });
    expect(result.ok && result.binding).toMatchObject({ id: pasted.binding.id, label: "Mine", venues: ["limitless"], source: "wallet_signed" });
    expect(await store.list()).toHaveLength(1);
  });

  it("refuses a proof whose text does not name the address, or that is malformed", async () => {
    const store = newStore();
    expect((await store.addSigned({ address: other.address, proof: await proof() })).ok).toBe(false);
    expect((await store.addSigned({ address: owner.address, proof: { ...(await proof()), signature: "not hex" } })).ok).toBe(false);
    expect((await store.addSigned({ address: owner.address, proof: { ...(await proof()), message: "x".repeat(2000) } })).ok).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it("holds a proof only on a wallet-signed EOA binding", () => {
    const base = { id: `eoa:evm:${owner.address.toLowerCase()}`, label: "x", kind: "eoa", chain: "evm", address: owner.address, status: "derived", venues: [] };
    const sample = { method: "eip191_personal_sign", verified: true, signedAt: "t", message: "m", signature: "0x00" };
    expect(addressBindingSchema.safeParse({ ...base, source: "wallet_signed", proof: sample }).success).toBe(true);
    expect(addressBindingSchema.safeParse({ ...base, source: "wallet_signed" }).success).toBe(false);
    expect(addressBindingSchema.safeParse({ ...base, source: "pasted", proof: sample }).success).toBe(false);
    expect(addressBindingSchema.safeParse({ ...base, kind: "venue_proxy", id: `venue_proxy:evm:${owner.address.toLowerCase()}`, source: "wallet_signed", proof: sample }).success).toBe(false);
    expect(addressBindingSchema.safeParse({ ...base, source: "wallet_signed", proof: { ...sample, extra: 1 } }).success).toBe(false);
  });

  it("keeps a verified proof through export and import, and downgrades a forged or unverified one to pasted", async () => {
    const store = newStore();
    await store.addSigned({ address: owner.address, proof: await proof() });
    const exported = await store.exportJson();
    expect(looksLikeSecret(exported)).toBe(false);
    const fresh = newStore();
    expect(await fresh.importJson(exported)).toEqual({ ok: true, imported: 1, skipped: 0 });
    const [kept] = await fresh.list();
    expect(kept?.source).toBe("wallet_signed");
    expect(kept?.proof?.verified).toBe(true);

    const file = JSON.parse(exported) as { bindings: Array<Record<string, unknown> & { proof: BindingProof }> };
    const forged = structuredClone(file);
    const first = forged.bindings[0];
    if (first === undefined) throw new Error("fixture");
    first.proof = { ...first.proof, signature: (await proof(other)).signature };
    const third = newStore();
    expect((await third.importJson(JSON.stringify(forged))).ok).toBe(true);
    const [downgraded] = await third.list();
    expect(downgraded?.source).toBe("pasted");
    expect(downgraded?.proof).toBeUndefined();

    const unverified = structuredClone(file);
    const entry = unverified.bindings[0];
    if (entry === undefined) throw new Error("fixture");
    entry.proof = { ...entry.proof, verified: false };
    const fourth = newStore();
    await fourth.importJson(JSON.stringify(unverified));
    expect((await fourth.list())[0]?.source).toBe("pasted");
  });
});
