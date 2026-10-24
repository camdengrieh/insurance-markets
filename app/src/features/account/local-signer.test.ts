import { hashMessage, hashTypedData, recoverAddress, recoverMessageAddress, recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { verifyDigestSignature } from "@sdk/trade/xo/userop/verify";

import { WalletError } from "../../core/signer";
import { createLocalSigner, LOCAL_CAPABILITIES } from "./local-signer";
import { SponsorError } from "./sponsor";
import { fakeSponsor, TRADING_KEY } from "./testkit";

// The trading key as a WalletSigner of kind "local": every signature it makes recovers to E, raw bytes are signed as
// personal_sign signs them (what XO's Kernel validator accepts), and sendTransaction goes through the sponsor.

const owner = privateKeyToAccount(TRADING_KEY);

describe("LocalSigner", () => {
  it("has the design's kind and capabilities", () => {
    const signer = createLocalSigner({ owner, sponsor: fakeSponsor() });
    expect(signer.kind).toBe("local");
    expect(signer.address).toBe(owner.address);
    expect(signer.capabilities).toEqual({ sendTransaction: true, rawMessage: true, chains: [137, 8453, 56, 3223] });
    expect(LOCAL_CAPABILITIES.chains).toEqual([137, 8453, 56, 3223]);
  });

  it("signs typed data that recovers to E, on any of its chains", async () => {
    const signer = createLocalSigner({ owner, sponsor: fakeSponsor() });
    const typed = {
      domain: { name: "Test", version: "1", chainId: 137, verifyingContract: `0x${"01".repeat(20)}` as const },
      types: { Order: [{ name: "amount", type: "uint256" }] },
      primaryType: "Order" as const,
      message: { amount: 5n },
    };
    const signature = await signer.signTypedData(typed);
    expect(await recoverTypedDataAddress({ ...typed, signature })).toBe(owner.address);
    expect(await recoverAddress({ hash: hashTypedData(typed), signature })).toBe(owner.address);
    expect(await signer.chainId()).toBe(137);
  });

  it("refuses typed data for a chain it does not sign on", async () => {
    const signer = createLocalSigner({ owner, sponsor: fakeSponsor() });
    await expect(signer.signTypedData({ domain: { chainId: 1 }, types: { A: [{ name: "a", type: "uint256" }] }, primaryType: "A", message: { a: 1n } })).rejects.toMatchObject({ code: "unsupported_chain" });
  });

  it("signs text and raw bytes as personal_sign does", async () => {
    const signer = createLocalSigner({ owner, sponsor: fakeSponsor() });
    const text = await signer.signMessage("hello");
    expect(await recoverMessageAddress({ message: "hello", signature: text })).toBe(owner.address);
    const digest: Hex = `0x${"ab".repeat(32)}`;
    const raw = await signer.signRawMessage(digest);
    expect(await recoverAddress({ hash: hashMessage({ raw: digest }), signature: raw })).toBe(owner.address);
    // The form XO's relay checks for a user-operation hash signed by the owner.
    const verified = await verifyDigestSignature({ userOpHash: digest, signature: raw, expectedOwner: owner.address });
    expect(verified).toMatchObject({ ok: true, form: "eip191" });
  });

  it("sends a transaction as one sponsored call and returns its hash", async () => {
    const sponsor = fakeSponsor();
    const signer = createLocalSigner({ owner, sponsor });
    const hash = await signer.sendTransaction({ chainId: 8453, to: `0x${"02".repeat(20)}`, data: "0x1234", value: 0n });
    expect(hash).toBe(`0x${"ab".repeat(32)}`);
    expect(sponsor.sent).toEqual([{ chainId: 8453, calls: [{ to: `0x${"02".repeat(20)}`, data: "0x1234", value: 0n }] }]);
  });

  it("never sends on XO or an unsponsored chain, and maps sponsor refusals to wallet errors", async () => {
    const sponsor = fakeSponsor(async () => {
      throw new SponsorError("refused", "The gas sponsor refused this action. Nothing was sent.", { detail: "policy" });
    });
    const signer = createLocalSigner({ owner, sponsor });
    await expect(signer.sendTransaction({ chainId: 3223, to: `0x${"02".repeat(20)}`, data: "0x" })).rejects.toMatchObject({ code: "unsupported" });
    await expect(signer.sendTransaction({ chainId: 1, to: `0x${"02".repeat(20)}`, data: "0x" })).rejects.toMatchObject({ code: "unsupported_chain" });
    expect(sponsor.sent).toHaveLength(0);
    const error = await signer.sendTransaction({ chainId: 137, to: `0x${"02".repeat(20)}`, data: "0x" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WalletError);
    expect((error as WalletError).code).toBe("failed");
    expect(((error as WalletError).cause as SponsorError).detail).toBe("policy");
  });

  it("does not carry the key on the signer object", () => {
    const signer = createLocalSigner({ owner, sponsor: fakeSponsor() });
    expect(JSON.stringify(signer)).not.toContain(TRADING_KEY.slice(2));
    expect(Object.values(signer).some((value) => typeof value === "string" && value.includes(TRADING_KEY.slice(2)))).toBe(false);
  });
});
