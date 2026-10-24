import { describe, expect, it } from "vitest";

import { concat, decodeFunctionData, encodeAbiParameters, erc20Abi, keccak256, maxUint256, parseAbi, recoverTypedDataAddress, stringToBytes, type Address, type Hex } from "viem";

import { POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_CTF_EXCHANGE, POLYMARKET_EXCHANGE_V3, POLYMARKET_NEG_RISK_ADAPTER, POLYMARKET_NEG_RISK_EXCHANGE, POLYMARKET_POSITION_MANAGER, POLYMARKET_PUSD } from "@sdk/chain/polymarket/constants";
import { POLYMARKET_DEPOSIT_WALLET_FACTORY } from "@sdk/chain/xo/constants";
import { depositWalletAddress } from "@sdk/trade/clob/polymarket/deposit-wallet";

import { ANVIL_TEST_ACCOUNTS } from "../../../../../../test/fixtures/userop/anvil-test-keys";
import { fakeChain, fakeSigner } from "../testkit";
import { approvalCall, depositWalletBatchDigest, depositWalletBatchTypedData, missingApprovals, POLYMARKET_APPROVALS, walletBatchRequest, type BatchInput } from "./batch";

// The Deposit Wallet batch the trading key signs for Polymarket's relayer. The official client (npm
// @polymarket/client 0.14.0, src/actions/gasless.ts) publishes no fixed test vectors, so the digest is checked against an
// independent hand encoding of the EIP-712 rules over the client's own type definitions: Batch(address wallet,uint256
// nonce,uint256 deadline,Call[] calls) and Call(address target,uint256 value,bytes data), domain DepositWallet / 1 /
// 137 / the wallet. The keys are the public Anvil test keys.

const OWNER = ANVIL_TEST_ACCOUNTS[0]!;
const WALLET = depositWalletAddress(OWNER.address, "beacon");

const BATCH: BatchInput = {
  wallet: WALLET,
  nonce: 7n,
  deadline: 1_792_756_163n,
  calls: [approvalCall(POLYMARKET_APPROVALS[0]!), approvalCall(POLYMARKET_APPROVALS[5]!)],
};

const word = (types: readonly string[], values: readonly unknown[]): Hex => encodeAbiParameters(types.map((type) => ({ type })), values as never);

// EIP-712 by hand: typeHash = keccak(encodeType), hashStruct = keccak(typeHash || encodeData), arrays as keccak of the
// concatenated element hashes, bytes as keccak of the bytes.
function handDigest(batch: BatchInput): Hex {
  const callType = keccak256(stringToBytes("Call(address target,uint256 value,bytes data)"));
  const batchType = keccak256(stringToBytes("Batch(address wallet,uint256 nonce,uint256 deadline,Call[] calls)Call(address target,uint256 value,bytes data)"));
  const domainType = keccak256(stringToBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
  const calls = keccak256(concat(batch.calls.map((call) => keccak256(word(["bytes32", "address", "uint256", "bytes32"], [callType, call.target, BigInt(call.value), keccak256(call.data)])))));
  const struct = keccak256(word(["bytes32", "address", "uint256", "uint256", "bytes32"], [batchType, batch.wallet, batch.nonce, batch.deadline, calls]));
  const domain = keccak256(word(["bytes32", "bytes32", "bytes32", "uint256", "address"], [domainType, keccak256(stringToBytes("DepositWallet")), keccak256(stringToBytes("1")), 137n, batch.wallet]));
  return keccak256(concat(["0x1901", domain, struct]));
}

describe("the Deposit Wallet batch", () => {
  it("is the official client's typed data: DepositWallet / 1 / 137 / the wallet, Batch then Call, the message in its field order", () => {
    const typed = depositWalletBatchTypedData(BATCH);
    expect(typed.domain).toEqual({ name: "DepositWallet", version: "1", chainId: 137, verifyingContract: WALLET });
    expect(typed.primaryType).toBe("Batch");
    expect(typed.types).toEqual({
      Batch: [
        { name: "wallet", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "calls", type: "Call[]" },
      ],
      Call: [
        { name: "target", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
    });
    expect(Object.keys(typed.message)).toEqual(["wallet", "nonce", "deadline", "calls"]);
  });

  it("hashes to the digest a hand encoding of the EIP-712 rules gives, for one call, two calls and none", () => {
    expect(depositWalletBatchDigest(BATCH)).toBe(handDigest(BATCH));
    expect(depositWalletBatchDigest({ ...BATCH, calls: BATCH.calls.slice(0, 1) })).toBe(handDigest({ ...BATCH, calls: BATCH.calls.slice(0, 1) }));
    expect(depositWalletBatchDigest({ ...BATCH, calls: [] })).toBe(handDigest({ ...BATCH, calls: [] }));
    // A different nonce or wallet is a different digest.
    expect(depositWalletBatchDigest({ ...BATCH, nonce: 8n })).not.toBe(depositWalletBatchDigest(BATCH));
  });

  it("is signed by the owner as typed data and sent as the relayer's WALLET request: from the owner, to the factory, numbers as strings", async () => {
    const signer = fakeSigner(OWNER);
    const signature = await signer.signTypedData(depositWalletBatchTypedData(BATCH));
    expect(await recoverTypedDataAddress({ ...depositWalletBatchTypedData(BATCH), signature })).toBe(OWNER.address);
    const request = walletBatchRequest(OWNER.address, BATCH, signature, "Approve Polymarket exchanges");
    expect(request).toEqual({
      type: "WALLET",
      from: OWNER.address,
      to: POLYMARKET_DEPOSIT_WALLET_FACTORY,
      nonce: "7",
      signature,
      metadata: "Approve Polymarket exchanges",
      depositWalletParams: { depositWallet: WALLET, deadline: "1792756163", calls: BATCH.calls.map((call) => ({ target: call.target, value: "0", data: call.data })) },
    });
  });
});

const READS = parseAbi(["function allowance(address, address) view returns (uint256)", "function isApprovedForAll(address, address) view returns (bool)"]);

describe("the approvals the wallet gives once", () => {
  it("are the eight of wallets-auth.md, each a pinned token and spender, unlimited", () => {
    expect(POLYMARKET_APPROVALS.map((approval) => [approval.kind, approval.token, approval.spender])).toEqual([
      ["erc20", POLYMARKET_PUSD, POLYMARKET_EXCHANGE_V3],
      ["erc20", POLYMARKET_PUSD, POLYMARKET_CTF_EXCHANGE],
      ["erc20", POLYMARKET_PUSD, POLYMARKET_NEG_RISK_EXCHANGE],
      ["erc20", POLYMARKET_PUSD, POLYMARKET_NEG_RISK_ADAPTER],
      ["operator", POLYMARKET_POSITION_MANAGER, POLYMARKET_EXCHANGE_V3],
      ["operator", POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_CTF_EXCHANGE],
      ["operator", POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_NEG_RISK_EXCHANGE],
      ["operator", POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_NEG_RISK_ADAPTER],
    ]);
    expect(decodeFunctionData({ abi: erc20Abi, data: approvalCall(POLYMARKET_APPROVALS[0]!).data }).args).toEqual([POLYMARKET_EXCHANGE_V3, maxUint256]);
    expect(decodeFunctionData({ abi: parseAbi(["function setApprovalForAll(address operator, bool approved)"]), data: approvalCall(POLYMARKET_APPROVALS[7]!).data }).args).toEqual([POLYMARKET_NEG_RISK_ADAPTER, true]);
  });

  it("leaves out what the chain shows given, for this wallet, and counts an unreadable one as missing", async () => {
    const given = new Set([`${POLYMARKET_PUSD}:${POLYMARKET_CTF_EXCHANGE}`.toLowerCase(), `${POLYMARKET_CONDITIONAL_TOKENS}:${POLYMARKET_CTF_EXCHANGE}`.toLowerCase()]);
    const seen: Address[] = [];
    const chain = fakeChain({
      call: (to, data) => {
        const decoded = decodeFunctionData({ abi: READS, data });
        const [holder, spender] = decoded.args as readonly [Address, Address];
        seen.push(holder);
        if (spender.toLowerCase() === POLYMARKET_NEG_RISK_ADAPTER.toLowerCase()) return null;
        const ok = given.has(`${to}:${spender}`.toLowerCase());
        return decoded.functionName === "allowance" ? word(["uint256"], [ok ? maxUint256 - 1n : 0n]) : word(["bool"], [ok]);
      },
    });
    const missing = await missingApprovals(chain, WALLET);
    if (!missing.ok) throw new Error(missing.refusal.message);
    expect(missing.value.map((approval) => approval.id)).toEqual(["pusd-v3", "pusd-neg-risk", "pusd-adapter", "positions-v3", "ctf-neg-risk", "ctf-adapter"]);
    expect(seen.every((holder) => holder === WALLET)).toBe(true);
    const down = await missingApprovals(fakeChain({ down: true }), WALLET);
    expect(!down.ok && down.refusal.code).toBe("chain_unreadable");
    expect((await missingApprovals(null, WALLET)).ok).toBe(false);
  });
});
