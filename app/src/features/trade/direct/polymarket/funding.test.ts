import { describe, expect, it } from "vitest";

import { decodeFunctionData, encodeAbiParameters, erc20Abi, maxUint256, parseAbi, type Hex } from "viem";

import { POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_POSITION_MANAGER, POLYMARKET_PUSD } from "@sdk/chain/polymarket/constants";
import { safeAddress } from "@sdk/chain/polymarket/wallets";
import { POLYMARKET_EXCHANGES } from "@sdk/trade/clob/venues";

import { ANVIL_TEST_ACCOUNTS } from "../../../../../../test/fixtures/userop/anvil-test-keys";
import { fakeChain, fakeSigner, fakeVenue, testDeps } from "../testkit";
import type { DirectAccount } from "../types";
import { createPolymarketExecutor } from "./executor";
import { approvalBlocker, buildApprovalTransaction, fundingStop, readPolymarketFunding } from "./funding";
import { MAKER_LABEL } from "./maker";

// Balances and approvals the maker needs, read from an in-memory Polygon node, and the approval transactions the page
// may ask a wallet to send (only a wallet that is its own maker and sends transactions).

const OWNER = ANVIL_TEST_ACCOUNTS[0]!;
const TOKEN = "71321045679252212594626385532706912750332728571942532289631379312455583992563";
const READS = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function isApprovedForAll(address, address) view returns (bool)",
  "function balanceOf(address, uint256) view returns (uint256)",
]);
const TX = `0x${"77".repeat(32)}` as const;

const EOA: DirectAccount = { venue: "polymarket", chainId: 137, signer: OWNER.address, maker: OWNER.address, label: MAKER_LABEL.eoa, signatureType: 0, makerIsSigner: true };
const SAFE: DirectAccount = { ...EOA, maker: safeAddress(OWNER.address), label: MAKER_LABEL.safe, signatureType: 2, makerIsSigner: false };

interface Holdings {
  readonly pusd?: bigint;
  readonly allowance?: bigint;
  readonly operator?: boolean;
  readonly shares?: bigint;
}

function node(holdings: Holdings, seen: string[] = []) {
  return fakeChain({
    call: (to, data) => {
      const decoded = decodeFunctionData({ abi: READS, data });
      seen.push(`${to} ${decoded.functionName} ${(decoded.args ?? []).map(String).join(",")}`);
      if (to === POLYMARKET_PUSD.toLowerCase() && decoded.functionName === "balanceOf" && holdings.pusd !== undefined) return encodeAbiParameters([{ type: "uint256" }], [holdings.pusd]);
      if (to === POLYMARKET_PUSD.toLowerCase() && decoded.functionName === "allowance" && holdings.allowance !== undefined) return encodeAbiParameters([{ type: "uint256" }], [holdings.allowance]);
      if (decoded.functionName === "isApprovedForAll" && holdings.operator !== undefined) return encodeAbiParameters([{ type: "bool" }], [holdings.operator]);
      if (decoded.functionName === "balanceOf" && (decoded.args?.length ?? 0) === 2 && holdings.shares !== undefined) return encodeAbiParameters([{ type: "uint256" }], [holdings.shares]);
      return null;
    },
  });
}

describe("the maker's pUSD and approvals", () => {
  it("reads pUSD, its allowance to the book's exchange, the ledger's operator approval and the outcome balance of the maker", async () => {
    const seen: string[] = [];
    const read = await readPolymarketFunding(node({ pusd: 25_000_000n, allowance: 0n, operator: true, shares: 3_000_000n }, seen), SAFE, "ctf", TOKEN);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value).toMatchObject({ maker: SAFE.maker, collateralSymbol: "pUSD", collateralBalance: 25_000_000n, shareBalance: 3_000_000n });
    expect(read.value.approvals.map((entry) => [entry.id, entry.spender, entry.token, entry.granted, entry.allowance])).toEqual([
      ["collateral", POLYMARKET_EXCHANGES.ctf.verifyingContract, POLYMARKET_PUSD, false, 0n],
      ["positions", POLYMARKET_EXCHANGES.ctf.verifyingContract, POLYMARKET_CONDITIONAL_TOKENS, true, null],
    ]);
    // Every read names the maker (the Safe), never the signing wallet.
    expect(seen.every((line) => line.includes(SAFE.maker))).toBe(true);
    const v2 = await readPolymarketFunding(node({ pusd: 0n, allowance: 0n, operator: false }), EOA, "v2", null);
    expect(v2.ok ? v2.value.approvals.map((entry) => [entry.spender, entry.token]) : null).toEqual([
      [POLYMARKET_EXCHANGES.v2.verifyingContract, POLYMARKET_PUSD],
      [POLYMARKET_EXCHANGES.v2.verifyingContract, POLYMARKET_POSITION_MANAGER],
    ]);
  });

  it("says what stops an order, and treats a value it could not read as a stop, never as enough", async () => {
    const funded = await readPolymarketFunding(node({ pusd: 10_000_000n, allowance: 6_000_000n, operator: false, shares: 0n }), EOA, "ctf", TOKEN);
    if (!funded.ok) throw new Error("read");
    expect(fundingStop(funded.value, "BUY", 5_200_000n)).toBeNull();
    expect(fundingStop(funded.value, "BUY", 7_000_000n)).toMatch(/Approve first/);
    expect(fundingStop(funded.value, "BUY", 11_000_000n)).toMatch(/holds 10 pUSD/);
    expect(fundingStop(funded.value, "SELL", 1_000_000n)).toMatch(/holds 0 shares/);
    const unknown = await readPolymarketFunding(node({}), EOA, "ctf", TOKEN);
    if (!unknown.ok) throw new Error("read");
    expect(unknown.value.collateralBalance).toBeNull();
    expect(unknown.value.approvals.map((entry) => entry.granted)).toEqual([null, null]);
    expect(fundingStop(unknown.value, "BUY", 1n)).toMatch(/could not be read/);
    expect(fundingStop(unknown.value, "SELL", 1n)).toMatch(/could not be read/);
    const down = await readPolymarketFunding(fakeChain({ down: true }), EOA, "ctf", TOKEN);
    expect(down.ok ? null : down.refusal.code).toBe("chain_unreadable");
  });
});

describe("approvals", () => {
  it("are offered only for a wallet that is its own maker and sends transactions; otherwise the reason is said plainly", () => {
    expect(approvalBlocker(EOA, true)).toBeNull();
    expect(approvalBlocker(EOA, false)).toMatch(/signs but does not send transactions .*from a wallet that can send transactions/);
    expect(approvalBlocker(SAFE, true)).toMatch(/contract wallet: its approvals are its own transactions/);
  });

  it("build approve and setApprovalForAll for the book's exchange, with every argument on the card", async () => {
    const read = await readPolymarketFunding(node({ pusd: 1n, allowance: 0n, operator: false }), EOA, "neg_risk", null);
    if (!read.ok) throw new Error("read");
    const [collateral, positions] = read.value.approvals;
    const exact = buildApprovalTransaction(EOA, collateral!, { kind: "exact", atomic: 5_720_000n });
    expect(exact.request.to).toBe(POLYMARKET_PUSD);
    expect(exact.request.chainId).toBe(137);
    expect(decodeFunctionData({ abi: erc20Abi, data: exact.request.data })).toEqual({ functionName: "approve", args: [POLYMARKET_EXCHANGES.neg_risk.verifyingContract, 5_720_000n] });
    expect(exact.card.fields.find((field) => field.name === "amount")).toMatchObject({ value: "5720000", meaning: "5.72 pUSD, this order's worst case" });
    expect(exact.card.digest).toBeNull();
    const unlimited = buildApprovalTransaction(EOA, collateral!, { kind: "unlimited" });
    expect(decodeFunctionData({ abi: erc20Abi, data: unlimited.request.data }).args?.[1]).toBe(maxUint256);
    const operator = buildApprovalTransaction(EOA, positions!, { kind: "unlimited" });
    expect(operator.request.to).toBe(POLYMARKET_CONDITIONAL_TOKENS);
    expect(decodeFunctionData({ abi: parseAbi(["function setApprovalForAll(address operator, bool approved)"]), data: operator.request.data as Hex })).toEqual({ functionName: "setApprovalForAll", args: [POLYMARKET_EXCHANGES.neg_risk.verifyingContract, true] });
  });

  it("are sent through the wallet on Polygon after the card, and refused for a Safe or a wallet that cannot send", async () => {
    const executor = createPolymarketExecutor(testDeps(fakeVenue(), node({})));
    const read = await readPolymarketFunding(node({ pusd: 1n, allowance: 0n, operator: false }), EOA, "ctf", null);
    if (!read.ok) throw new Error("read");
    const tx = executor.approval(EOA, read.value.approvals[0]!, { kind: "unlimited" });
    const sender = fakeSigner(OWNER, { txHash: TX });
    expect(await executor.sendApproval(sender, EOA, tx)).toEqual({ ok: true, value: TX });
    expect(sender.switches).toEqual([137]);
    expect(sender.transactions).toEqual([tx.request]);

    const payboxLike = fakeSigner(OWNER, { capabilities: { sendTransaction: false } });
    const refused = await executor.sendApproval(payboxLike, EOA, tx);
    expect(refused.ok ? null : refused.refusal.message).toMatch(/signs but does not send transactions/);
    expect(payboxLike.transactions).toEqual([]);
    const safe = await executor.sendApproval(sender, SAFE, tx);
    expect(safe.ok ? null : safe.refusal.code).toBe("account_refused");
    expect(sender.transactions).toHaveLength(1);
  });
});
