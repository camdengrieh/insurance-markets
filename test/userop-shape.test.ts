// assertOperationShape: what the relay re-checks on a stored operation before it verifies or sends it.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { zeroAddress, type Hex } from "viem";

import { buildInitCode, deriveAccount } from "../src/xo/account/derive.js";
import { MARKET_MANAGER, POLICY_PAYMASTER } from "../src/xo/chain/constants.js";
import { USEROP_ACTIONS, type UserOpAction } from "../src/relay/contract.js";
import {
  UserOpError,
  assertOperationShape,
  cancelMarketCall,
  createMarketCalls,
  encodeExecute,
  enableTradingCalls,
  firstOpNonce,
  kernelNonce,
  packUserOp,
  prepareUserOp,
  redeemCalls,
  respondToUpdateCall,
  revokeTradingCalls,
  sponsorshipFallback,
  unpackUserOp,
  withdrawCalls,
  type Call,
  type PackedUserOp,
  type PrepareUserOpInput,
} from "./fixtures/userop/api.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";

function refused(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => error instanceof UserOpError && error.code === code, code);
}

const OWNER = (ANVIL_TEST_ACCOUNTS[0] as (typeof ANVIL_TEST_ACCOUNTS)[number]).address;
const OTHER = (ANVIL_TEST_ACCOUNTS[1] as (typeof ANVIL_TEST_ACCOUNTS)[number]).address;
const COND = `0x${"11".repeat(32)}` as Hex;
const LATER = kernelNonce({ sequence: 6n });

const INPUTS: Record<UserOpAction, PrepareUserOpInput> = {
  deploy_enable_trading: { action: "deploy_enable_trading", owner: OWNER, calls: enableTradingCalls(), nonce: firstOpNonce(), deployed: false, sponsor: true },
  enable_trading: { action: "enable_trading", owner: OWNER, calls: enableTradingCalls({ allowance: 5_000_000n }), nonce: LATER, deployed: true, sponsor: true },
  revoke_trading: { action: "revoke_trading", owner: OWNER, calls: revokeTradingCalls(), nonce: LATER, deployed: true, sponsor: true },
  redeem: { action: "redeem", owner: OWNER, calls: redeemCalls([COND, `0x${"22".repeat(32)}`]), nonce: LATER, deployed: true, sponsor: true },
  withdraw: { action: "withdraw", owner: OWNER, calls: withdrawCalls({ owner: OWNER, amountAtomic: 3_000_000n }), nonce: LATER, deployed: true, sponsor: false },
  create_market: { action: "create_market", owner: OWNER, calls: createMarketCalls({ startsAt: 1n, expiresAt: 2n, metadataUri: "https://example.invalid/m.json" }), nonce: LATER, deployed: true, sponsor: true },
  respond_update: { action: "respond_update", owner: OWNER, calls: [respondToUpdateCall(COND, true)], nonce: LATER, deployed: true, sponsor: true },
  cancel_market: { action: "cancel_market", owner: OWNER, calls: [cancelMarketCall(COND)], nonce: LATER, deployed: true, sponsor: true },
};

function rebuild(op: PackedUserOp, change: Partial<Parameters<typeof packUserOp>[0]>): PackedUserOp {
  return packUserOp({ ...unpackUserOp(op), ...change });
}

describe("assertOperationShape", () => {
  it("passes every action's own prepared operation", () => {
    for (const action of USEROP_ACTIONS) {
      const p = prepareUserOp(INPUTS[action]);
      const decoded = assertOperationShape(p.op, { action, owner: OWNER });
      assert.deepEqual(decoded, p.decoded, action);
    }
  });

  it("refuses an operation under another owner", () => {
    const p = prepareUserOp(INPUTS.redeem);
    refused(() => assertOperationShape(p.op, { action: "redeem", owner: OTHER }), "sender_mismatch");
    refused(() => assertOperationShape(p.op, { action: "redeem", owner: zeroAddress }), "invalid_address");
    refused(() => assertOperationShape(p.op, { action: "redeem", owner: MARKET_MANAGER }), "invalid_address");
  });

  it("refuses an operation whose calls do not form the declared action", () => {
    const redeem = prepareUserOp(INPUTS.redeem);
    for (const wrong of USEROP_ACTIONS.filter((a) => a !== "redeem")) {
      assert.throws(() => assertOperationShape(redeem.op, { action: wrong, owner: OWNER }), UserOpError, wrong);
    }
    const enable = prepareUserOp(INPUTS.enable_trading);
    refused(() => assertOperationShape(enable.op, { action: "revoke_trading", owner: OWNER }), "forbidden_call");
  });

  it("initCode goes with the deploying action, the first-operation nonce, and this owner only", () => {
    const deploy = prepareUserOp(INPUTS.deploy_enable_trading);
    refused(() => assertOperationShape(deploy.op, { action: "enable_trading", owner: OWNER }), "invalid_userop");
    const enable = prepareUserOp(INPUTS.enable_trading);
    refused(() => assertOperationShape(rebuild(enable.op, { initCode: buildInitCode(OWNER) }), { action: "enable_trading", owner: OWNER }), "invalid_userop");
    refused(() => assertOperationShape(rebuild(enable.op, { initCode: "0x" }), { action: "deploy_enable_trading", owner: OWNER }), "invalid_userop");
    refused(() => assertOperationShape(rebuild(deploy.op, { initCode: buildInitCode(OTHER) }), { action: "deploy_enable_trading", owner: OWNER }), "invalid_userop");
    refused(() => assertOperationShape(rebuild(deploy.op, { nonce: kernelNonce({ sequence: 1n }) }), { action: "deploy_enable_trading", owner: OWNER }), "invalid_nonce");
    refused(() => assertOperationShape(rebuild(deploy.op, { sender: deriveAccount(OTHER) }), { action: "deploy_enable_trading", owner: OWNER }), "sender_mismatch");
  });

  it("the nonce stays in the default root lane", () => {
    const p = prepareUserOp(INPUTS.redeem);
    for (const nonce of [kernelNonce({ mode: 1, sequence: 7n }), kernelNonce({ type: 1, sequence: 7n }), kernelNonce({ validator: zeroAddress, sequence: 7n })]) {
      refused(() => assertOperationShape(rebuild(p.op, { nonce }), { action: "redeem", owner: OWNER }), "invalid_nonce");
    }
    assertOperationShape(rebuild(p.op, { nonce: kernelNonce({ key: 0x32, sequence: 0n }) }), { action: "redeem", owner: OWNER });
  });

  it("callData must be the canonical encoding of calls on the closed list, with no value", () => {
    const p = prepareUserOp(INPUTS.cancel_market);
    const good = p.op.callData;
    refused(() => assertOperationShape(rebuild(p.op, { callData: `${good}00` as Hex }), { action: "cancel_market", owner: OWNER }), "invalid_calldata");
    const elsewhere: Call[] = [{ to: MARKET_MANAGER, value: 0n, data: "0x4cbe35ee" }];
    refused(() => assertOperationShape(rebuild(p.op, { callData: encodeExecute(elsewhere) }), { action: "cancel_market", owner: OWNER }), "forbidden_call");
    const withValue: Call[] = [{ ...(p.calls[0] as Call), value: 1n }];
    refused(() => assertOperationShape(rebuild(p.op, { callData: encodeExecute(withValue) }), { action: "cancel_market", owner: OWNER }), "forbidden_call");
    refused(() => assertOperationShape(rebuild(p.op, { callData: encodeExecute([...p.calls, ...p.calls]) }), { action: "cancel_market", owner: OWNER }), "forbidden_call");
  });

  it("a withdrawal never carries a paymaster, and a foreign paymaster never passes", () => {
    const withdraw = prepareUserOp(INPUTS.withdraw);
    const sponsored = rebuild(withdraw.op, { paymaster: { address: POLICY_PAYMASTER, verificationGasLimit: 40_262n, postOpGasLimit: 26_478n } });
    refused(() => assertOperationShape(sponsored, { action: "withdraw", owner: OWNER }), "sponsorship_refused");
    const redeem = prepareUserOp(INPUTS.redeem);
    const foreign: PackedUserOp = { ...redeem.op, paymasterAndData: `0x${"22".repeat(52)}` };
    refused(() => assertOperationShape(foreign, { action: "redeem", owner: OWNER }), "sponsorship_refused");
    assertOperationShape(rebuild(redeem.op, { paymaster: null }), { action: "redeem", owner: OWNER });
  });

  it("fees are zero unless allowed on purpose", () => {
    const p = prepareUserOp(INPUTS.redeem);
    for (const change of [{ maxFeePerGas: 1n }, { maxPriorityFeePerGas: 1n }]) {
      const priced = rebuild(p.op, change);
      refused(() => assertOperationShape(priced, { action: "redeem", owner: OWNER }), "invalid_userop");
      assertOperationShape(priced, { action: "redeem", owner: OWNER, allowFees: true });
    }
  });

  it("refuses a malformed operation outright", () => {
    refused(() => assertOperationShape(null as unknown as PackedUserOp, { action: "redeem", owner: OWNER }), "invalid_userop");
    const p = prepareUserOp(INPUTS.redeem);
    refused(() => assertOperationShape({ ...p.op, callData: "0x12345678" }, { action: "redeem", owner: OWNER }), "invalid_userop");
    refused(() => assertOperationShape({ ...p.op, signature: `0x${"11".repeat(64)}` }, { action: "redeem", owner: OWNER }), "invalid_userop");
  });
});

describe("sponsorshipFallback (UO7)", () => {
  it("an existing account may retry once without a paymaster; a deployment, or a second failure, stops", () => {
    assert.equal(sponsorshipFallback({ deploys: false, retried: false }), "retry_without_paymaster");
    assert.equal(sponsorshipFallback({ deploys: false, retried: true }), "stop");
    assert.equal(sponsorshipFallback({ deploys: true, retried: false }), "stop");
    assert.equal(sponsorshipFallback({ deploys: true, retried: true }), "stop");
  });

  it("the retry is a real, valid operation: the same calls, no paymaster, a different hash", () => {
    const sponsored = prepareUserOp(INPUTS.redeem);
    const retry = prepareUserOp({ ...INPUTS.redeem, sponsor: false });
    assert.equal(sponsored.deploys, false);
    assert.equal(retry.op.paymasterAndData, "0x");
    assert.equal(retry.op.callData, sponsored.op.callData);
    assert.notEqual(retry.userOpHash, sponsored.userOpHash);
    assertOperationShape(retry.op, { action: "redeem", owner: OWNER });
  });
});
