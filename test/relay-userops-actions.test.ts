import assert from "node:assert/strict";
import { describe } from "node:test";

import { encodeAbiParameters, encodeFunctionData, getAbiItem, pad, toEventSelector, type Hex } from "viem";

import { deriveAccount } from "../src/xo/account/derive.js";
import { CONDITIONAL_TOKENS_ABI } from "../src/xo/chain/abi.js";
import { CONDITIONAL_TOKENS, CTF_EXCHANGE, FIRST_OP_NONCE, POLICY_PAYMASTER, TRANSFER_REMOTE_SELECTOR, USDC_E_ADDRESS, XO_WARP_ROUTE } from "../src/xo/chain/constants.js";
import { decodeExecute } from "../src/xo/userop/encode.js";
import { laneKeyFor } from "../src/xo/userop/nonce.js";
import { unpackUserOp } from "../src/xo/userop/pack.js";
import { paymasterVerificationFor } from "../relay/userops.js";
import { approveData, executeBatchData, redeemData, setApprovalForAllData, transferRemoteData } from "./fixtures/userop/hand.js";
import { asPaymasterOwner, buildOp, seeded, approveCall } from "./anvil/scenarios.js";
import { CTF_STUB_ABI } from "./anvil/stubs.js";
import { deployOwner, enableTradingFor, useMock } from "./mock-xo/testing.js";
import type { MockXo } from "./mock-xo/server.js";
import { failed, mintUsdce, ok, signPrepared, startRig, storedOp, tappedFetch, usdceBalanceOf } from "./relay-userops-helpers.js";

// enable_trading, revoke_trading, redeem and withdraw: what each one builds, which gate each needs, and that
// nothing is built without positive proof of what it depends on.

const USD = 1_000_000n;
const PRINTABLE = /^[\x20-\x7e]+$/;
const ZERO32 = `0x${"00".repeat(32)}`;
const CONDITION_RESOLUTION_TOPIC = toEventSelector(getAbiItem({ abi: CONDITIONAL_TOKENS_ABI, name: "ConditionResolution" }));

function owner(mock: MockXo, index: number) {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  return chain.owner(index);
}

async function resolveCondition(mock: MockXo, conditionId: Hex): Promise<void> {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  await chain.sendFrom(chain.bundler.address, CONDITIONAL_TOKENS, encodeFunctionData({ abi: CTF_STUB_ABI, functionName: "stubSetPayoutDenominator", args: [conditionId, 1n] }));
}

function conditionIds(count: number, seed: string): Hex[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => random.bytes(32));
}

// ConditionResolution rows in the explorer's index, as the CTF contract emits them.
function seedResolutionLogs(mock: MockXo, ids: readonly Hex[]): void {
  ids.forEach((id, index) => {
    mock.explorer.syntheticLogs.push({
      address: CONDITIONAL_TOKENS,
      topics: [CONDITION_RESOLUTION_TOPIC, id, pad("0x01", { size: 32 }), pad("0x02", { size: 32 })],
      data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256[]" }], [2n, [1n, 0n]]),
      blockNumber: 1,
      logIndex: index,
      transactionHash: `0x${(index + 1).toString(16).padStart(64, "0")}`,
    });
  });
}

function assertPrintable(lines: readonly string[]): void {
  for (const line of lines) {
    assert.ok(line.length <= 300);
    assert.match(line, PRINTABLE);
  }
}

describe("enable_trading on a deployed account", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("carries no initCode, the nonce the EntryPoint reports, the paymaster, and the capped or unlimited batch", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const alice = owner(mock, 3);
    await deployOwner(mock, 3, { enableTrading: false });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "enable_trading", params: {} }));
    const op = storedOp(rig, prepared.prepared_id);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    assert.equal(op.initCode, "0x");
    assert.equal(op.nonce, await chain.getNonce(deriveAccount(alice.address), laneKeyFor()));
    assert.equal(op.nonce, BigInt(FIRST_OP_NONCE) + 1n, "sequence 1 after the deploying operation");
    assert.equal(unpackUserOp(op).paymaster?.address, POLICY_PAYMASTER);
    assert.equal(prepared.user_op_hash, await chain.entryPointGetUserOpHash(op));
    assert.equal(
      op.callData,
      executeBatchData([
        { to: USDC_E_ADDRESS, value: 0n, data: approveData(CTF_EXCHANGE, 2n ** 256n - 1n) },
        { to: CONDITIONAL_TOKENS, value: 0n, data: setApprovalForAllData(CTF_EXCHANGE, true) },
      ]).toLowerCase(),
    );
    assertPrintable(prepared.summary.lines);
    // The account is already registered on the optimistic profile, so no unregistered warning.
    assert.ok(!prepared.warnings.some((line) => line.includes("deployed_unregistered")));
  });

  harness.it("an account that is not deployed is refused: this needs positive proof of deployment", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const result = failed(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "enable_trading", params: {} }));
    assert.equal(result.code, "precondition_failed");
    assert.equal((result.details as { reason: string }).reason, "undeployed");
    assert.match(result.message, /deploy_enable_trading/);
  });

  harness.it("the explorer's logs alone give the same nonce when no node is configured", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, userops: { xoRpcUrl: null } });
    await deployOwner(mock, 3, { enableTrading: true });
    await enableTradingFor(mock, 3);
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "enable_trading", params: {} }));
    const op = storedOp(rig, prepared.prepared_id);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    assert.equal(op.nonce, await chain.getNonce(deriveAccount(owner(mock, 3).address), laneKeyFor()));
    assert.equal(op.nonce, BigInt(FIRST_OP_NONCE) + 2n);
    // No node means the paymaster cannot be read, so an existing account goes without one, and says so.
    assert.equal(unpackUserOp(op).paymaster, null);
    assert.ok(prepared.warnings.some((line) => line.startsWith("No paymaster is used")));
  });

  harness.it("operations in another nonce lane do not move the lane this relay signs in, from the node or from the logs", async (mock) => {
    mock.setProfile("optimistic");
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const alice = owner(mock, 3);
    await deployOwner(mock, 3, { enableTrading: false });
    // Two operations in lane 50 (a live non-zero key exists on the real chain): lane 0 still waits at sequence 1.
    for (const sequence of [0n, 1n]) {
      const op = await buildOp({ chain, owner: alice, key: 50, sequence, sponsored: true, calls: [approveCall(CTF_EXCHANGE, 0n)] });
      assert.equal((await chain.handleOps([op.op])).ok, true);
    }
    for (const userops of [{}, { xoRpcUrl: null }] as const) {
      const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, userops });
      const prepared = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "enable_trading", params: {} }));
      assert.equal(storedOp(rig, prepared.prepared_id).nonce, BigInt(FIRST_OP_NONCE) + 1n, JSON.stringify(userops));
      await rig.stop();
    }
  });

  harness.it("an existing account goes without a paymaster when it is paused or the policy no longer covers the calls (UO7)", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    await deployOwner(mock, 3, { enableTrading: false });
    for (const [state, text] of [
      ["paused", "it is paused"],
      ["policy-narrowed", "does not cover"],
    ] as const) {
      mock.setSwitch("paymaster.state", state);
      const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "enable_trading", params: {} }));
      assert.equal(unpackUserOp(storedOp(rig, prepared.prepared_id)).paymaster, null, state);
      assert.ok(prepared.warnings.some((line) => line.includes(text)), state);
    }
  });

  harness.it("a registry that does not know the account is said out loud: trading stays blocked (N2)", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("registry.trigger", "never");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    await deployOwner(mock, 3, { enableTrading: false });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "enable_trading", params: {} }));
    assert.ok(prepared.warnings.some((line) => line.includes("deployed_unregistered") && line.includes("blocked")));
  });
});

describe("revoke_trading: the on-chain revoke, named apart from the relay's kill switch", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("sets both approvals back to nothing, never with a paymaster, at zero fee", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    await deployOwner(mock, 3, { enableTrading: true });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "revoke_trading", params: {} }));
    const op = storedOp(rig, prepared.prepared_id);
    assert.equal(op.paymasterAndData, "0x", "the paymaster is healthy and still not used");
    const fields = unpackUserOp(op);
    assert.equal(fields.maxFeePerGas, 0n);
    assert.equal(fields.maxPriorityFeePerGas, 0n);
    assert.equal(op.initCode, "0x");
    assert.equal(
      op.callData,
      executeBatchData([
        { to: USDC_E_ADDRESS, value: 0n, data: approveData(CTF_EXCHANGE, 0n) },
        { to: CONDITIONAL_TOKENS, value: 0n, data: setApprovalForAllData(CTF_EXCHANGE, false) },
      ]).toLowerCase(),
    );
    const text = prepared.summary.lines.join("\n");
    assert.ok(text.includes("0 (revoke)") && text.includes("approved false") && text.includes("Paymaster: none"));
    assert.ok(prepared.warnings.some((line) => line.includes("separate from the relay's software kill switch")));
    assertPrintable(prepared.summary.lines);
  });

  harness.it("uses the bundler's gas estimate when it has one, like every other action (call gas +30%)", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    await deployOwner(mock, 3, { enableTrading: true });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "revoke_trading", params: {} }));
    assert.equal(unpackUserOp(storedOp(rig, prepared.prepared_id)).callGasLimit, (74_916n * 130n + 99n) / 100n);
    assert.equal(rig.relay.services.capabilities.state("UO5"), "yes");
  });

  harness.it("works whatever the paymaster does, and when the node is down it still builds (nonce from the logs)", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("paymaster.state", "paused");
    mock.setSwitch("rpc.access", "down");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    await deployOwner(mock, 3, { enableTrading: true });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "revoke_trading", params: {} }));
    const op = storedOp(rig, prepared.prepared_id);
    assert.equal(op.paymasterAndData, "0x");
    assert.equal(op.nonce, BigInt(FIRST_OP_NONCE) + 1n);
  });

  harness.it("needs a deployed account", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const result = failed(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "revoke_trading", params: {} }));
    assert.equal(result.code, "precondition_failed");
  });
});

describe("redeem: only resolved conditions, de-duplicated, at most 50", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("builds one redeemPositions per resolved condition (payoutDenominator from the node), duplicates removed", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    await deployOwner(mock, 3, { enableTrading: true });
    const ids = conditionIds(3, "redeem-basic");
    for (const id of ids) await resolveCondition(mock, id);
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "redeem", params: { condition_ids: [ids[0] as Hex, ids[1] as Hex, ids[0] as Hex, (ids[2] as Hex).toUpperCase().replace("0X", "0x") as Hex] } }));
    const op = storedOp(rig, prepared.prepared_id);
    assert.equal(
      op.callData,
      executeBatchData(ids.map((id) => ({ to: CONDITIONAL_TOKENS, value: 0n, data: redeemData(USDC_E_ADDRESS, ZERO32, id, [1n, 2n]) }))).toLowerCase(),
    );
    const text = prepared.summary.lines.join("\n");
    for (const id of ids) assert.ok(text.includes(id));
    assert.ok(text.includes("redeemPositions("));
    assertPrintable(prepared.summary.lines);
  });

  harness.it("one call is a single-mode execute, as XO's own redeems", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    await deployOwner(mock, 3, { enableTrading: true });
    const [id] = conditionIds(1, "redeem-one") as [Hex];
    await resolveCondition(mock, id);
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "redeem", params: { condition_ids: [id] } }));
    const decoded = decodeExecute(storedOp(rig, prepared.prepared_id).callData);
    assert.equal(decoded.mode, "single");
    assert.equal(decoded.calls.length, 1);
  });

  harness.it("an unresolved condition is refused and named; nothing is built", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    await deployOwner(mock, 3, { enableTrading: true });
    const [done, open] = conditionIds(2, "redeem-open") as [Hex, Hex];
    await resolveCondition(mock, done);
    const result = failed(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "redeem", params: { condition_ids: [done, open] } }));
    assert.equal(result.code, "precondition_failed");
    assert.deepEqual((result.details as { conditions: string[] }).conditions, [open]);
    assert.equal((result.details as { reason: string }).reason, "condition_unresolved");
    assert.deepEqual(rig.relay.services.prepared.list(), []);
  });

  harness.it("without a node, a ConditionResolution log is the proof; no log means not proven, never 'resolved'", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("rpc.access", "down");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    await deployOwner(mock, 3, { enableTrading: true });
    const [logged, silent] = conditionIds(2, "redeem-logs") as [Hex, Hex];
    mock.explorer.syntheticLogs.push({
      address: CONDITIONAL_TOKENS,
      topics: [CONDITION_RESOLUTION_TOPIC, logged, pad("0x01", { size: 32 }), pad("0x02", { size: 32 })],
      data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256[]" }], [2n, [1n, 0n]]),
      blockNumber: 1,
      logIndex: 0,
      transactionHash: `0x${"ab".repeat(32)}`,
    });
    const good = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "redeem", params: { condition_ids: [logged] } }));
    assert.equal(decodeExecute(storedOp(rig, good.prepared_id).callData).calls.length, 1);
    const bad = failed(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "redeem", params: { condition_ids: [logged, silent] } }));
    assert.equal(bad.code, "precondition_failed");
    assert.equal((bad.details as { reason: string }).reason, "resolution_unproven");
    assert.deepEqual((bad.details as { conditions: string[] }).conditions, [silent]);
  });

  harness.it("a large batch reads the resolution logs once instead of asking the node about every condition", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    await deployOwner(mock, 3, { enableTrading: true });
    const ids = conditionIds(30, "redeem-large");
    seedResolutionLogs(mock, ids);
    const before = tap.count({ host: "rpc-mainnet-2.xo.market", rpc: "eth_call" });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "redeem", params: { condition_ids: ids } }));
    assert.equal(decodeExecute(storedOp(rig, prepared.prepared_id).callData).calls.length, 30);
    // The node is asked about the paymaster and the nonce, not about 30 conditions.
    assert.ok(tap.count({ host: "rpc-mainnet-2.xo.market", rpc: "eth_call" }) - before <= 8, "no per-condition node reads for a large batch");
    assertPrintable(prepared.summary.lines);
    assert.ok(prepared.summary.lines.length <= 24);
  });

  harness.it("fifty fit in the summary, fifty-one are refused by the contract, and a sponsored batch gets the paymaster verification gas it needs", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    await deployOwner(mock, 3, { enableTrading: true });
    const ids = conditionIds(51, "redeem-fifty");
    seedResolutionLogs(mock, ids);
    const fifty = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "redeem", params: { condition_ids: ids.slice(0, 50) } }));
    assertPrintable(fifty.summary.lines);
    assert.ok(fifty.summary.lines.length <= 24);
    const fields = unpackUserOp(storedOp(rig, fifty.prepared_id));
    assert.ok((fields.paymaster?.verificationGasLimit ?? 0n) >= paymasterVerificationFor(50));
    assert.equal(failed(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "redeem", params: { condition_ids: ids } })).code, "invalid_request");
  });

  harness.it("a sponsored batch of ten lands on the real paymaster code (the one-call default fails batches of eight or more)", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    await deployOwner(mock, 3, { enableTrading: true });
    const ids = conditionIds(10, "redeem-land");
    for (const id of ids) await resolveCondition(mock, id);
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "redeem", params: { condition_ids: ids } }));
    assert.ok(unpackUserOp(storedOp(rig, prepared.prepared_id)).paymaster !== null);
    const signature = await signPrepared(owner(mock, 3), prepared.sign, "eip191");
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature })).state, "submitted");
    const status = ok(await rig.client.get(`/v1/userop/${prepared.user_op_hash}` as `/v1/userop/0x${string}`));
    assert.equal(status.state, "included", JSON.stringify(status));
  });
});

describe("withdraw (H1) is behind ENABLE_WITHDRAW and always goes to the owner", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("is off by default: flag_off, before anything is read", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    await deployOwner(mock, 3, { enableTrading: true });
    const result = failed(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "withdraw", params: { amount_usd: "1" } }));
    assert.equal(result.code, "flag_off");
    assert.equal(tap.calls.length, 0, "no request was made to anyone");
  });

  harness.it("builds [approve(route, a), transferRemote(8453, owner, a)] with no paymaster, after the balance and the XO quote were read", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1", ENABLE_WITHDRAW: "1" } });
    const alice = owner(mock, 3);
    await deployOwner(mock, 3, { enableTrading: true });
    await mintUsdce(mock, deriveAccount(alice.address), 7n * USD);
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "withdraw", params: { amount_usd: "5" } }));
    const op = storedOp(rig, prepared.prepared_id);
    assert.equal(op.paymasterAndData, "0x", "the paymaster refuses transferRemote, so there is none");
    assert.equal(
      op.callData,
      executeBatchData([
        { to: USDC_E_ADDRESS, value: 0n, data: approveData(XO_WARP_ROUTE, 5n * USD) },
        { to: XO_WARP_ROUTE, value: 0n, data: transferRemoteData(8453, alice.address, 5n * USD) },
      ]).toLowerCase(),
    );
    const text = prepared.summary.lines.join("\n");
    assert.ok(text.includes("your owner address") && text.includes("domain 8453 = Base") && !text.includes("NOT YOUR OWNER"));
    assert.ok(prepared.warnings.some((line) => line.includes("no verified withdrawal path")));
    assertPrintable(prepared.summary.lines);
    assert.equal(prepared.capabilities["FU9"], "unknown");
  });

  harness.it("even if the paymaster's policy were widened to cover transferRemote, a withdrawal is still prepared without one", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1", ENABLE_WITHDRAW: "1" } });
    const alice = owner(mock, 3);
    await deployOwner(mock, 3, { enableTrading: true });
    await mintUsdce(mock, deriveAccount(alice.address), 2n * USD);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    await asPaymasterOwner(chain, async (send) => {
      await send("setAllowedSelectors", [XO_WARP_ROUTE, [TRANSFER_REMOTE_SELECTOR], true]);
    });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "withdraw", params: { amount_usd: "1" } }));
    assert.equal(storedOp(rig, prepared.prepared_id).paymasterAndData, "0x");
  });

  harness.it("more than the balance, or nothing, or an unreadable balance, builds nothing", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1", ENABLE_WITHDRAW: "1" } });
    const alice = owner(mock, 3);
    await deployOwner(mock, 3, { enableTrading: true });
    await mintUsdce(mock, deriveAccount(alice.address), 2n * USD);
    const over = failed(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "withdraw", params: { amount_usd: "2.000001" } }));
    assert.equal(over.code, "precondition_failed");
    assert.equal((over.details as { reason: string }).reason, "insufficient_balance");
    assert.equal(failed(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "withdraw", params: { amount_usd: "0" } })).code, "invalid_request");
    mock.setSwitch("rpc.access", "down");
    const blind = failed(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "withdraw", params: { amount_usd: "1" } }));
    assert.equal(blind.code, "capability_unknown");
    assert.deepEqual(rig.relay.services.prepared.list(), []);
  });

  harness.it("the contract has no destination field: an extra one is refused, so an agent cannot redirect the money", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1", ENABLE_WITHDRAW: "1" } });
    const alice = owner(mock, 3);
    await deployOwner(mock, 3, { enableTrading: true });
    const redirected = await rig.client.post("/v1/userop/prepare", { owner: alice.address, action: "withdraw", params: { amount_usd: "1", to: owner(mock, 4).address } } as never);
    assert.equal(failed(redirected).code, "invalid_request");
  });

  harness.it("a submit of a withdrawal checks ENABLE_WITHDRAW again (the flag can be switched off after prepare)", async (mock) => {
    mock.setProfile("optimistic");
    const alice = owner(mock, 3);
    const first = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1", ENABLE_WITHDRAW: "1" } });
    await deployOwner(mock, 3, { enableTrading: true });
    await mintUsdce(mock, deriveAccount(alice.address), 3n * USD);
    const prepared = ok(await first.post("/v1/userop/prepare", { owner: alice.address, action: "withdraw", params: { amount_usd: "1" } }));
    await first.stop();
    // The same data directory, restarted without ENABLE_WITHDRAW.
    const second = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, dir: { dir: first.dir, cleanup: async () => undefined } });
    const signature = await signPrepared(alice, prepared.sign, "raw");
    const result = failed(await second.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature }));
    assert.equal(result.code, "flag_off");
    assert.equal(await usdceBalanceOf(mock, deriveAccount(alice.address)), 3n * USD, "nothing moved");
  });
});

describe("the kill switch and the tripwires gate prepare and submit", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("with the kill switch on, prepare and submit are refused (reads still work)", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1", KILL: "1" } });
    const prepare = failed(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "deploy_enable_trading", params: {} }));
    assert.equal(prepare.code, "kill_switch");
    const submit = failed(await rig.post("/v1/userop/submit", { prepared_id: "a".repeat(32), signature: `0x${"11".repeat(65)}` }));
    assert.equal(submit.code, "kill_switch");
    const status = ok(await rig.client.get(`/v1/userop/0x${"ab".repeat(32)}` as `/v1/userop/0x${string}`));
    assert.equal(status.state, "unknown");
  });

  harness.it("a tripped tripwire refuses prepare; one that trips between prepare and submit refuses submit and leaves the item unused", async (mock) => {
    mock.setProfile("optimistic");
    let tripped = false;
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, {
      env: { ENABLE_USEROP_SUBMIT: "1" },
      fetch,
      createOptions: { tripwireCheckers: [{ id: "paymaster", check: async () => (tripped ? { id: "paymaster", detail: "the paymaster policy changed" } : undefined) }] },
    });
    const alice = owner(mock, 3);
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "deploy_enable_trading", params: {} }));
    tripped = true;
    const signature = await signPrepared(alice, prepared.sign, "raw");
    const submit = failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature }));
    assert.equal(submit.code, "tripwire");
    assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).state, "prepared", "the item was not consumed");
    const prepare = failed(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "deploy_enable_trading", params: {} }));
    assert.equal(prepare.code, "tripwire");
    // Nothing reached the bundler for a send.
    assert.equal(tap.count({ rpc: "eth_sendUserOperation" }), 0);
  });
});
