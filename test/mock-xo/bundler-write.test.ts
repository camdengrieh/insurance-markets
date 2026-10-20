import assert from "node:assert/strict";
import { describe } from "node:test";

import { encodeFunctionData, type Hex } from "viem";

import { deriveAccount } from "../../src/xo/account/derive.js";
import { POLICY_PAYMASTER_ABI } from "../../src/xo/chain/abi.js";
import { CONDITIONAL_TOKENS, CTF_EXCHANGE, ENTRY_POINT_V07, GAS_DEFAULTS, POLICY_PAYMASTER, USDC_E_ADDRESS } from "../../src/xo/chain/constants.js";
import { BundlerClient, BundlerError, toRpcUserOperation } from "../../src/xo/userop/bundler.js";
import { approveCall, buildOp, enableTradingCalls, transferRemoteCall } from "../anvil/scenarios.js";
import { entryPointNonceKey, kernelNonce } from "../anvil/userop.js";
import type { MockXo } from "./server.js";
import { postRpc, useMock } from "./testing.js";

// The bundler's write side: admission, estimate and landing. The operation really goes through the EntryPoint on
// the local chain, so the AA codes below are the real EntryPoint's.

const harness = useMock({ chains: { xo: true, base: false } });

function setup(mock: MockXo): void {
  mock.setProfile("optimistic");
}

const sendOp = (mock: MockXo, op: Parameters<typeof toRpcUserOperation>[0]) => postRpc(mock, "bundler", "eth_sendUserOperation", [toRpcUserOperation(op), ENTRY_POINT_V07]);
const estimateOp = (mock: MockXo, op: Parameters<typeof toRpcUserOperation>[0]) => postRpc(mock, "bundler", "eth_estimateUserOperationGas", [toRpcUserOperation(op), ENTRY_POINT_V07]);
const errorOf = (answer: { body: Record<string, unknown> }): { code: number; message: string } => answer.body["error"] as { code: number; message: string };

async function isDeployed(mock: MockXo, account: string): Promise<boolean> {
  return (await mock.chains.call<Hex>("xo", "eth_getCode", [account, "latest"])) !== "0x";
}

describe("the bundler lands operations for real", () => {
  harness.it("a deploying, sponsored Enable Trading lands: the account is deployed, trading is on, the hash and the receipt are the chain's", async (mock) => {
    setup(mock);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const built = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: enableTradingCalls() });
    assert.equal(await isDeployed(mock, built.account), false);
    const sent = await sendOp(mock, built.op);
    assert.equal(sent.body["result"], built.hash, "the bundler's hash is the EntryPoint's getUserOpHash");
    assert.equal(await isDeployed(mock, built.account), true);
    assert.equal(await mock.chains.isTradingEnabled(built.account), true);
    const receipt = (await postRpc(mock, "bundler", "eth_getUserOperationReceipt", [built.hash])).body["result"] as { success: boolean; sender: string; paymaster: string };
    assert.equal(receipt.success, true);
    assert.equal(receipt.sender, built.account);
    assert.equal(receipt.paymaster, POLICY_PAYMASTER);
    // The registry sees the deployment (registry.trigger on-deploy in the optimistic profile).
    const registered = ((await (await fetch(`${mock.urls.orderbook}/balance-allowance?address=${built.account}`)).json()) as { smart_account: unknown }).smart_account;
    assert.equal(registered, built.account.slice(2).toLowerCase());
    assert.equal(mock.userops.landed, 1);
  });

  harness.it("the production BundlerClient sends through the mock and gets the same hash back", async (mock) => {
    setup(mock);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const client = new BundlerClient({ transport: mock.rpcTransport, url: mock.urls.bundler });
    const built = await buildOp({ chain, owner: chain.owner(3), init: true, sponsored: true, calls: enableTradingCalls(), signWith: "eip191" });
    const result = await client.sendUserOperation(built.op);
    assert.equal(result.userOpHash, built.hash);
    const receipt = await client.getUserOperationReceipt(built.hash);
    assert.equal(receipt?.success, true);
    assert.equal(receipt?.sender, built.account);
  });

  harness.it("an operation for a deployed account lands too, and the nonce moves on", async (mock) => {
    setup(mock);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const first = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: [approveCall(CTF_EXCHANGE, 0n)] });
    assert.ok(typeof (await sendOp(mock, first.op)).body["result"] === "string");
    const second = await buildOp({ chain, owner: chain.owner(2), sequence: 1n, sponsored: true, gas: GAS_DEFAULTS.enableTrading, calls: enableTradingCalls() });
    assert.equal((await sendOp(mock, second.op)).body["result"], second.hash);
    assert.equal(await mock.chains.isTradingEnabled(first.account), true);
    const next = await chain.getNonce(first.account, entryPointNonceKey(kernelNonce()));
    assert.equal(next & 0xffff_ffff_ffff_ffffn, 2n, "two operations used: the next sequence is 2");
  });

  harness.it("with an inclusion delay the send is accepted but no receipt exists until the clock reaches it; then it lands", async (mock) => {
    setup(mock);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    mock.userops.inclusionDelaySeconds = 6;
    const built = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: enableTradingCalls() });
    assert.equal((await sendOp(mock, built.op)).body["result"], built.hash);
    assert.equal(mock.userops.pending.length, 1);
    assert.equal((await postRpc(mock, "bundler", "eth_getUserOperationReceipt", [built.hash])).body["result"], null);
    assert.equal(await isDeployed(mock, built.account), false);
    // The same operation again while it waits.
    assert.match(errorOf(await sendOp(mock, built.op)).message, /already known/);
    await mock.advance(5);
    assert.equal((await postRpc(mock, "bundler", "eth_getUserOperationReceipt", [built.hash])).body["result"], null);
    await mock.advance(1);
    assert.equal(((await postRpc(mock, "bundler", "eth_getUserOperationReceipt", [built.hash])).body["result"] as { success: boolean }).success, true);
    assert.equal(mock.userops.pending.length, 0);
    assert.equal(await isDeployed(mock, built.account), true);
  });

  harness.it("the EntryPoint's own errors come back as JSON-RPC errors with their AA code: a wrong signer is AA24, a wrong nonce AA25, a replayed deploy AA10", async (mock) => {
    setup(mock);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const wrongSigner = await buildOp({ chain, owner: chain.owner(2), signer: chain.owner(4), init: true, sponsored: true, calls: enableTradingCalls() });
    const bad = errorOf(await sendOp(mock, wrongSigner.op));
    assert.equal(bad.code, -32500);
    assert.match(bad.message, /^AA24/);
    assert.equal(await isDeployed(mock, wrongSigner.account), false, "nothing was deployed");

    const ok = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: enableTradingCalls() });
    assert.equal((await sendOp(mock, ok.op)).body["result"], ok.hash);
    const replay = errorOf(await sendOp(mock, ok.op));
    assert.equal(replay.code, -32500);
    assert.match(replay.message, /^AA10/);
    const skipped = await buildOp({ chain, owner: chain.owner(2), sequence: 5n, sponsored: true, gas: GAS_DEFAULTS.enableTrading, calls: enableTradingCalls() });
    assert.match(errorOf(await sendOp(mock, skipped.op)).message, /^AA25/);
    // The production client reads the AA code out of the text.
    const client = new BundlerClient({ transport: mock.rpcTransport, url: mock.urls.bundler });
    await assert.rejects(client.sendUserOperation(skipped.op), (error: unknown) => error instanceof BundlerError && error.code === "rpc_error" && error.aaCode === "AA25");
  });

  harness.it("a send for another entry point, a malformed operation or a missing parameter is -32602; a batch array is refused", async (mock) => {
    setup(mock);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const built = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: enableTradingCalls() });
    const rpcOp = toRpcUserOperation(built.op);
    const other = `0x${"11".repeat(20)}`;
    assert.equal(errorOf(await postRpc(mock, "bundler", "eth_sendUserOperation", [rpcOp, other])).code, -32602);
    assert.equal(errorOf(await postRpc(mock, "bundler", "eth_sendUserOperation", [{ ...rpcOp, extra: 1 }, ENTRY_POINT_V07])).code, -32602);
    assert.equal(errorOf(await postRpc(mock, "bundler", "eth_sendUserOperation", [{ ...rpcOp, nonce: "5" }, ENTRY_POINT_V07])).code, -32602);
    assert.equal(errorOf(await postRpc(mock, "bundler", "eth_sendUserOperation", [])).code, -32602);
    assert.equal(mock.userops.landed, 0);
  });
});

describe("sponsorship is the real PolicyPaymaster's answer", () => {
  harness.it("a call the policy refuses (transferRemote) fails paymaster validation and lands nothing: the real contract answers AA34, not a revert", async (mock) => {
    setup(mock);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const built = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: [transferRemoteCall()] });
    const refused = errorOf(await sendOp(mock, built.op));
    assert.equal(refused.code, -32501, "a paymaster-range code");
    assert.match(refused.message, /^AA34/);
    assert.equal(await isDeployed(mock, built.account), false);
  });

  harness.it("paymaster.state = paused: paused() reads true, sends fail in the paymaster range, the estimate says the paymaster is paused; sponsor undoes it", async (mock) => {
    setup(mock);
    mock.setSwitch("rpc.access", "open");
    mock.setSwitch("bundler.estimate", "supported");
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const readPaused = async (): Promise<boolean> => {
      const data = encodeFunctionData({ abi: POLICY_PAYMASTER_ABI, functionName: "paused" });
      return BigInt((await postRpc(mock, "xoRpc", "eth_call", [{ to: POLICY_PAYMASTER, data }, "latest"])).body["result"] as Hex) === 1n;
    };
    mock.setSwitch("paymaster.state", "paused");
    assert.equal(await readPaused(), true);
    const built = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: enableTradingCalls() });
    const paused = errorOf(await sendOp(mock, built.op));
    assert.equal(paused.code, -32501);
    assert.match(paused.message, /^AA34/);
    assert.match(errorOf(await estimateOp(mock, built.op)).message, /paymaster is paused/);
    assert.equal(await isDeployed(mock, built.account), false);
    mock.setSwitch("paymaster.state", "sponsor");
    assert.equal(await readPaused(), false);
    assert.equal((await sendOp(mock, built.op)).body["result"], built.hash);
  });

  harness.it("paymaster.state = policy-narrowed: approve and setApprovalForAll are refused (checkPolicy false), a redeem still passes", async (mock) => {
    setup(mock);
    mock.setSwitch("rpc.access", "open");
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const policy = async (target: string, selector: Hex): Promise<boolean> => {
      const data = encodeFunctionData({ abi: POLICY_PAYMASTER_ABI, functionName: "checkPolicy", args: [chain.owner(2).address, target as `0x${string}`, selector] });
      return BigInt(((await postRpc(mock, "xoRpc", "eth_call", [{ to: POLICY_PAYMASTER, data }, "latest"])).body["result"] as Hex).slice(0, 66)) === 1n;
    };
    assert.equal(await policy(USDC_E_ADDRESS, "0x095ea7b3"), true);
    mock.setSwitch("paymaster.state", "policy-narrowed");
    assert.equal(await policy(USDC_E_ADDRESS, "0x095ea7b3"), false, "approve is refused");
    assert.equal(await policy(CONDITIONAL_TOKENS, "0xa22cb465"), false, "setApprovalForAll is refused");
    assert.equal(await policy(CONDITIONAL_TOKENS, "0x01b7037c"), true, "redeemPositions still passes");
    const built = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: enableTradingCalls() });
    assert.match(errorOf(await sendOp(mock, built.op)).message, /^AA34/);
  });

  harness.it("a paymaster-less zero-fee operation lands for a deployed account (UO8) and is refused when bundler.paymasterless = reject", async (mock) => {
    setup(mock);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const deploy = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: [approveCall(CTF_EXCHANGE, 0n)] });
    assert.ok(typeof (await sendOp(mock, deploy.op)).body["result"] === "string");
    const free = await buildOp({ chain, owner: chain.owner(2), sequence: 1n, gas: GAS_DEFAULTS.enableTrading, calls: enableTradingCalls() });
    mock.setSwitch("bundler.paymasterless", "reject");
    assert.match(errorOf(await sendOp(mock, free.op)).message, /without a paymaster are not accepted/);
    assert.equal(await mock.chains.isTradingEnabled(deploy.account), false);
    mock.setSwitch("bundler.paymasterless", "accept");
    assert.equal((await sendOp(mock, free.op)).body["result"], free.hash);
    assert.equal(await mock.chains.isTradingEnabled(deploy.account), true);
  });
});

describe("eth_estimateUserOperationGas", () => {
  harness.it("answers the observed defaults by shape: a deploying op needs the larger verification gas, a sponsored one carries the paymaster limits", async (mock) => {
    setup(mock);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const deploying = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: enableTradingCalls(), signWith: "none" });
    const result = (await estimateOp(mock, deploying.op)).body["result"] as Record<string, string>;
    assert.equal(BigInt(result["verificationGasLimit"] as string), GAS_DEFAULTS.deployAndEnableTrading.verificationGasLimit);
    assert.equal(BigInt(result["callGasLimit"] as string), GAS_DEFAULTS.deployAndEnableTrading.callGasLimit);
    assert.equal(BigInt(result["paymasterVerificationGasLimit"] as string), GAS_DEFAULTS.deployAndEnableTrading.paymasterVerificationGasLimit);
    const plain = await buildOp({ chain, owner: chain.owner(2), sequence: 1n, calls: enableTradingCalls(), signWith: "none" });
    const free = (await estimateOp(mock, plain.op)).body["result"] as Record<string, string>;
    assert.equal(BigInt(free["verificationGasLimit"] as string), GAS_DEFAULTS.enableTrading.verificationGasLimit);
    assert.equal("paymasterVerificationGasLimit" in free, false);
    assert.equal(deriveAccount(chain.owner(2).address), deploying.account);
  });

  harness.it("the estimate applies the same admission as a send: a refused call is a paymaster error, the foreign-account rule applies", async (mock) => {
    setup(mock);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const refused = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: [transferRemoteCall()], signWith: "none" });
    assert.equal(errorOf(await estimateOp(mock, refused.op)).code, -32501);
    mock.setSwitch("bundler.foreign_account", "reject");
    const ok = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: enableTradingCalls(), signWith: "none" });
    assert.match(errorOf(await estimateOp(mock, ok.op)).message, /not on the allowlist/);
  });
});
