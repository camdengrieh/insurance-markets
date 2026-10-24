import { createPublicClient, decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, type Address } from "viem";
import { toSimple7702SmartAccount } from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { codeState, createSponsor, delegationCode, SponsorError } from "./sponsor";
import { FAKE_PAYMASTER, FAKE_TX_HASH, fakeNetwork, TRADING_KEY, type FakeNetwork } from "./testkit";

// The sponsor against a fake chain and a fake bundler-and-paymaster that check what the real ones check: the user
// operation is from E, signed by E over its EIP-712 hash (EntryPoint 0.8), carries the paymaster's data, and on first use
// carries E's EIP-7702 authorization to Simple7702Account (signed by E, for this chain, at E's nonce).

const owner = privateKeyToAccount(TRADING_KEY);
const USDC: Address = getAddress(`0x${"0c".repeat(20)}`);
const TO: Address = getAddress(`0x${"0d".repeat(20)}`);
const transfer = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [TO, 1_000_000n] });

async function implementation(network: FakeNetwork): Promise<Address> {
  const account = await toSimple7702SmartAccount({ client: createPublicClient({ chain: network.chain, transport: network.rpc }), owner });
  const address = account.authorization?.address;
  if (address === undefined) throw new Error("no implementation");
  return address;
}

function sponsorOn(network: FakeNetwork) {
  return createSponsor({
    owner,
    chain: (chainId) => (chainId === network.chain.id ? network.chain : null),
    rpcTransport: (chainId) => (chainId === network.chain.id ? network.rpc : null),
    paymasterTransport: (chainId) => (chainId === network.chain.id ? network.paymaster : null),
    pollingIntervalMs: 1,
    receiptTimeoutMs: 2_000,
  });
}

describe("the sponsor", () => {
  it("delegates E by EIP-7702 in the first user operation and returns the transaction hash", async () => {
    const network = fakeNetwork(owner.address, { code: "0x", txCount: 3 });
    const hash = await sponsorOn(network).sendCalls(8453, [{ to: USDC, data: transfer }]);
    expect(hash).toBe(FAKE_TX_HASH);
    expect(network.accepted).toHaveLength(1);
    const [accepted] = network.accepted;
    const op = accepted?.userOp ?? {};
    expect(getAddress(op.sender as string)).toBe(owner.address);
    expect(accepted?.signer).toBe(owner.address);
    // The authorization: to Simple7702Account, for Base, at E's pending nonce, signed by E.
    const auth = op.eip7702Auth as { address: string; chainId: string; nonce: string };
    expect(getAddress(auth.address)).toBe(await implementation(network));
    expect(BigInt(auth.chainId)).toBe(8453n);
    expect(BigInt(auth.nonce)).toBe(3n);
    expect(accepted?.authorizationSigner).toBe(owner.address);
    expect(op.factory).toBe("0x7702");
    // The paymaster's data is in the operation, and the call is exactly the one asked for.
    expect(getAddress(op.paymaster as string)).toBe(FAKE_PAYMASTER);
    expect(op.paymasterData).toBe(`0x${"11".repeat(65)}`);
    const { abi } = await toSimple7702SmartAccount({ client: createPublicClient({ chain: network.chain, transport: network.rpc }), owner });
    const decoded = decodeFunctionData({ abi, data: op.callData as `0x${string}` });
    expect(decoded.functionName).toBe("execute");
    expect(decoded.args).toEqual([USDC, 0n, transfer]);
    // Gas prices came from the bundler's own quote; the paymaster route saw only bundler and paymaster methods.
    expect(BigInt(op.maxFeePerGas as string)).toBe(2_000_000n);
    expect(new Set(network.bundlerLog.map((entry) => entry.method))).toEqual(
      new Set(["pimlico_getUserOperationGasPrice", "pm_getPaymasterStubData", "eth_estimateUserOperationGas", "pm_getPaymasterData", "eth_sendUserOperation", "eth_getUserOperationReceipt"]),
    );
    expect(network.rpcLog.some((entry) => entry.method === "eth_getTransactionCount" && entry.params[1] === "pending")).toBe(true);
  });

  it("sends no authorization once E is delegated, and batches several calls", async () => {
    const probe = fakeNetwork(owner.address, { code: "0x" });
    const network = fakeNetwork(owner.address, { code: delegationCode(await implementation(probe)) });
    await sponsorOn(network).sendCalls(8453, [
      { to: USDC, data: transfer },
      { to: USDC, data: transfer },
    ]);
    const op = network.accepted[0]?.userOp ?? {};
    expect(op.eip7702Auth).toBeUndefined();
    expect(op.factory).toBeUndefined();
    expect(network.rpcLog.some((entry) => entry.method === "eth_getTransactionCount")).toBe(false);
    const { abi } = await toSimple7702SmartAccount({ client: createPublicClient({ chain: network.chain, transport: network.rpc }), owner });
    expect(decodeFunctionData({ abi, data: op.callData as `0x${string}` }).functionName).toBe("executeBatch");
  });

  it("refuses an E that runs other code, an unsponsored chain, and an empty call list, sending nothing", async () => {
    const network = fakeNetwork(owner.address, { code: "0x6080604052" });
    await expect(sponsorOn(network).sendCalls(8453, [{ to: USDC, data: transfer }])).rejects.toMatchObject({ code: "delegated_elsewhere" });
    await expect(sponsorOn(network).sendCalls(3223, [{ to: USDC, data: transfer }])).rejects.toMatchObject({ code: "chain_not_sponsored" });
    await expect(sponsorOn(network).sendCalls(8453, [])).rejects.toBeInstanceOf(SponsorError);
    expect(network.accepted).toHaveLength(0);
  });

  it("says the sponsor is not switched on when the paymaster route is missing", async () => {
    const network = fakeNetwork(owner.address, { code: "0x", paymasterStatus: 404 });
    await expect(sponsorOn(network).sendCalls(8453, [{ to: USDC, data: transfer }])).rejects.toMatchObject({ code: "not_available" });
  });

  it("reports a mined operation that reverted, with its transaction hash", async () => {
    const network = fakeNetwork(owner.address, { code: "0x", success: false });
    const error = await sponsorOn(network)
      .sendCalls(8453, [{ to: USDC, data: transfer }])
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "reverted", transactionHash: FAKE_TX_HASH });
  });

  it("is not available for a chain the page has no route for", async () => {
    const network = fakeNetwork(owner.address, { code: "0x" });
    await expect(sponsorOn(network).sendCalls(137, [{ to: USDC, data: transfer }])).rejects.toMatchObject({ code: "not_available" });
  });
});

describe("codeState", () => {
  it("tells no code, the Simple7702 delegation and anything else apart", () => {
    const implementationAddress: Address = getAddress(`0x${"0e".repeat(20)}`);
    expect(codeState(undefined, implementationAddress).kind).toBe("none");
    expect(codeState("0x", implementationAddress).kind).toBe("none");
    expect(codeState(delegationCode(implementationAddress), implementationAddress).kind).toBe("delegated");
    expect(codeState(delegationCode(TO), implementationAddress).kind).toBe("other");
  });
});
