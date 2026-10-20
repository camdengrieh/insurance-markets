import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Address } from "viem";

import { digestTag, toPayboxIntent, type Prepared } from "../src/relay/contract.js";
import { buildInitCode, deriveAccount } from "../src/xo/account/derive.js";
import { CTF_EXCHANGE, CONDITIONAL_TOKENS, FIRST_OP_NONCE, POLICY_PAYMASTER, USDC_E_ADDRESS } from "../src/xo/chain/constants.js";
import { decodeAllowedCall } from "../src/xo/userop/calls.js";
import { decodeExecute } from "../src/xo/userop/encode.js";
import { unpackUserOp } from "../src/xo/userop/pack.js";
import { decideAllowance, loadUserOpOptions, USEROP_DEFAULTS, type AllowanceInput } from "../relay/userops.js";
import { approveData, executeBatchData, setApprovalForAllData, badChecksum } from "./fixtures/userop/hand.js";
import { seededRandom } from "./fixtures/userop/prng.js";
import { deployOwner } from "./mock-xo/testing.js";
import { useMock } from "./mock-xo/testing.js";
import type { MockXo } from "./mock-xo/server.js";
import { eventually, failed, mintUsdce, ok, startRig, storedOp, tappedFetch, type Rig } from "./relay-userops-helpers.js";

// POST /v1/userop/prepare for deploy_enable_trading and the allowance policy (D4), against the local mock XO with
// the real EntryPoint, factory, validator, Kernel and PolicyPaymaster bytecode on an anvil chain.

const USD = 1_000_000n;
const UNLIMITED = 2n ** 256n - 1n;

function owner(mock: MockXo, index: number) {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  return chain.owner(index);
}

// Only ASCII a human can read: no control, bidi or tag character can ride along in a summary line.
const PRINTABLE = /^[\x20-\x7e]+$/;

function assertSummaryIsSafe(prepared: Prepared): void {
  assert.ok(prepared.summary.lines.length >= 1 && prepared.summary.lines.length <= 24, "at most 24 lines");
  for (const line of prepared.summary.lines) {
    assert.ok(line.length <= 300, `line too long: ${line.length}`);
    assert.match(line, PRINTABLE);
  }
  for (const warning of prepared.warnings) assert.match(warning, PRINTABLE);
}

function approveAmountOf(rig: Rig, preparedId: string): bigint {
  const op = storedOp(rig, preparedId);
  const first = decodeExecute(op.callData).calls[0];
  assert.ok(first !== undefined);
  const decoded = decodeAllowedCall(first);
  assert.equal(decoded.kind, "usdce_approve");
  return decoded.kind === "usdce_approve" ? decoded.amount : -1n;
}

describe("deploy_enable_trading: the operation the owner is asked to sign", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("builds the deploying batch, hashes it like the real EntryPoint, and decodes every call in the summary", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const alice = owner(mock, 3);
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "deploy_enable_trading", params: {} }));
    const op = storedOp(rig, prepared.prepared_id);

    // The hash the owner signs is the one the real EntryPoint code computes for the stored operation.
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    assert.equal(prepared.user_op_hash, await chain.entryPointGetUserOpHash(op));
    assert.equal(prepared.sign.expected_digest, prepared.user_op_hash);
    assert.equal(prepared.sign.digest_form, "userOpHash");
    assert.equal(prepared.summary.digest_tag, digestTag(prepared.user_op_hash));
    assert.equal(prepared.summary.digest_tag.length, 16);
    assert.deepEqual(toPayboxIntent(prepared.sign), { op: "raw", rawSigningPayloadHex: prepared.user_op_hash });
    assert.throws(() => toPayboxIntent({ ...prepared.sign, expected_digest: `0x${"11".repeat(32)}` }), /refused/);

    // The account is derived here; the first operation carries initCode and the first-operation nonce, zero fees.
    const account = deriveAccount(alice.address);
    assert.equal(prepared.account, account);
    assert.equal(prepared.owner, alice.address);
    assert.equal(op.sender, account);
    assert.equal(op.initCode, buildInitCode(alice.address));
    assert.equal(op.nonce, BigInt(FIRST_OP_NONCE));
    const fields = unpackUserOp(op);
    assert.equal(fields.maxFeePerGas, 0n);
    assert.equal(fields.maxPriorityFeePerGas, 0n);
    assert.equal(fields.paymaster?.address, POLICY_PAYMASTER, "the PolicyPaymaster, after checkPolicy said sponsor");

    // The batch is exactly [USDC.e.approve(exchange, max), CTF.setApprovalForAll(exchange, true)], by an independent encoder.
    assert.equal(
      op.callData,
      executeBatchData([
        { to: USDC_E_ADDRESS, value: 0n, data: approveData(CTF_EXCHANGE, UNLIMITED) },
        { to: CONDITIONAL_TOKENS, value: 0n, data: setApprovalForAllData(CTF_EXCHANGE, true) },
      ]).toLowerCase(),
    );

    // The summary names every call with addresses, amounts and function names, and nothing else.
    const text = prepared.summary.lines.join("\n");
    assert.ok(prepared.summary.lines.some((line) => line.startsWith("Call 1 of 2:") && line.includes("amount unlimited (2^256-1)")), "the approve line itself says unlimited, not a 78-digit number");
    for (const needle of [account, alice.address, CTF_EXCHANGE, USDC_E_ADDRESS, CONDITIONAL_TOKENS, "approve(", "setApprovalForAll(", "unlimited", POLICY_PAYMASTER, "initCode 440 bytes"]) {
      assert.ok(text.includes(needle), `the summary shows ${needle}`);
    }
    assertSummaryIsSafe(prepared);
    assert.deepEqual(prepared.caps, { reserved_usd: "0", day_remaining_usd: "50" });
    assert.equal(prepared.kind, "userop");
    assert.ok(Date.parse(prepared.expires_at) - mock.clock.nowMs() <= 300_000 + 1000, "five minutes at most");
  });

  harness.it("the relay derives the account; a different account from the caller is an error and nothing is stored", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const alice = owner(mock, 3);
    const bob = owner(mock, 4);
    const wrong = await rig.post("/v1/userop/prepare", { owner: alice.address, account: deriveAccount(bob.address), action: "deploy_enable_trading", params: {} });
    assert.equal(failed(wrong).code, "account_mismatch");
    // The owner EOA itself is not the account either.
    assert.equal(failed(await rig.post("/v1/userop/prepare", { owner: alice.address, account: alice.address, action: "deploy_enable_trading", params: {} })).code, "account_mismatch");
    assert.deepEqual(rig.relay.services.prepared.list(), []);
    // The right account is accepted.
    const right = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, account: deriveAccount(alice.address), action: "deploy_enable_trading", params: {} }));
    assert.equal(right.account, deriveAccount(alice.address));
  });

  harness.it("refuses owners that are not a wallet: a bad checksum, the zero address, a protocol contract", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const good = owner(mock, 3).address;
    for (const bad of [badChecksum(good), `0x${"00".repeat(20)}`, CTF_EXCHANGE, USDC_E_ADDRESS, "0x1234", "not an address"]) {
      const result = await rig.post("/v1/userop/prepare", { owner: bad as Address, action: "deploy_enable_trading", params: {} });
      assert.equal(failed(result).code, "invalid_request", String(bad));
    }
    assert.deepEqual(rig.relay.services.prepared.list(), []);
  });

  harness.it("an account that is already deployed is refused with a reason that names enable_trading", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    await deployOwner(mock, 3, { enableTrading: false });
    const result = failed(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "deploy_enable_trading", params: {} }));
    assert.equal(result.code, "precondition_failed");
    assert.deepEqual((result.details as { reason: string }).reason, "already_deployed");
    assert.match(result.message, /enable_trading/);
  });

  harness.it("an unreadable deployment is never taken as 'undeployed': a complete negative is required", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    mock.injectFault("5xx", { listeners: ["explorer"] });
    const result = failed(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "deploy_enable_trading", params: {} }));
    assert.equal(result.code, "precondition_failed");
    assert.equal((result.details as { reason: string }).reason, "state_unknown");
    assert.deepEqual(rig.relay.services.prepared.list(), []);
  });

  harness.it("with ENABLE_USEROP_SUBMIT off prepare is a dry run: same answer, flagged, and the bundler is not contacted", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { fetch });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "deploy_enable_trading", params: {} }));
    assert.ok(prepared.warnings.some((line) => line.startsWith("DRY RUN")));
    assert.equal(tap.count({ host: "mainnet-bundler.xo.market" }), 0);
    assert.equal(prepared.user_op_hash, await mock.chains.xo?.entryPointGetUserOpHash(storedOp(rig, prepared.prepared_id)));
    // ...and submit refuses, before anything else.
    const submit = failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: `0x${"11".repeat(65)}` }));
    assert.equal(submit.code, "flag_off");
  });

  harness.it("with the flag on, a supported estimate is used (call gas +30%) and recorded as the fact UO5", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "deploy_enable_trading", params: {} }));
    assert.equal(tap.count({ host: "mainnet-bundler.xo.market", rpc: "eth_estimateUserOperationGas" }), 1);
    assert.equal(tap.count({ rpc: "eth_sendUserOperation" }), 0, "an estimate sends nothing");
    assert.equal(rig.relay.services.capabilities.state("UO5"), "yes");
    assert.equal(prepared.capabilities["UO5"], "yes");
    const fields = unpackUserOp(storedOp(rig, prepared.prepared_id));
    assert.equal(fields.callGasLimit, (74_916n * 130n + 99n) / 100n);
  });

  harness.it("an unsupported estimate is recorded as UO5 no and the observed defaults are used", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("bundler.estimate", "unsupported");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "deploy_enable_trading", params: {} }));
    assert.equal(rig.relay.services.capabilities.state("UO5"), "no");
    const fields = unpackUserOp(storedOp(rig, prepared.prepared_id));
    assert.equal(fields.callGasLimit, 74_916n);
    assert.equal(fields.verificationGasLimit, 297_342n);
  });
});

describe("the paymaster is used only after paused() and checkPolicy say sponsor (UO7)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  for (const [state, reason] of [
    ["paused", "paused"],
    ["policy-narrowed", "refused"],
  ] as const) {
    harness.it(`a deployment is never prepared without a paymaster: paymaster.state = ${state}`, async (mock) => {
      mock.setProfile("optimistic");
      mock.setSwitch("paymaster.state", state);
      const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
      const result = failed(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "deploy_enable_trading", params: {} }));
      assert.equal(result.code, "precondition_failed");
      assert.equal((result.details as { reason: string }).reason, `paymaster_${reason}`);
      assert.deepEqual(rig.relay.services.prepared.list(), []);
    });
  }

  for (const access of ["down", "requires-key"] as const) {
    harness.it(`an unreadable paymaster stops a deployment (fail closed): rpc.access = ${access}`, async (mock) => {
      mock.setProfile("optimistic");
      mock.setSwitch("rpc.access", access);
      const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
      const result = failed(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "deploy_enable_trading", params: {} }));
      assert.equal(result.code, "capability_unknown");
      assert.equal((result.details as { reason: string }).reason, "paymaster_unreadable");
    });
  }

  harness.it("a requires-key node latches the host: later prepares make no request to it", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("rpc.access", "requires-key");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "deploy_enable_trading", params: {} });
    const afterFirst = tap.count({ host: "rpc-mainnet-2.xo.market" });
    assert.ok(afterFirst >= 1 && afterFirst <= 2, `the first call latched it (${afterFirst} requests)`);
    await rig.post("/v1/userop/prepare", { owner: owner(mock, 4).address, action: "deploy_enable_trading", params: {} });
    assert.equal(tap.count({ host: "rpc-mainnet-2.xo.market" }), afterFirst, "nothing more is sent to a host that asked for a key");
    assert.equal(await eventually(() => rig.relay.services.capabilities.state("UO9") === "no"), true, "recorded as a fact by the upstream listener");
  });
});

describe("a node that asked for a key is asked again later, once", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("after thirty minutes the relay tries the node again; if it is open now, reads work and sponsorship is used", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("rpc.access", "requires-key");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    await deployOwner(mock, 3, { enableTrading: false });
    const blind = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "enable_trading", params: { allowance_usd: "5" } }));
    assert.equal(unpackUserOp(storedOp(rig, blind.prepared_id)).paymaster, null, "no node, no paymaster");
    // The operator removed the key requirement. Before the window nothing changes; after it the node is used again.
    mock.setSwitch("rpc.access", "open");
    mock.clock.advanceMs(10 * 60_000);
    const early = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "enable_trading", params: { allowance_usd: "5" } }));
    assert.equal(unpackUserOp(storedOp(rig, early.prepared_id)).paymaster, null);
    mock.clock.advanceMs(25 * 60_000);
    const later = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "enable_trading", params: { allowance_usd: "5" } }));
    assert.ok(unpackUserOp(storedOp(rig, later.prepared_id)).paymaster !== null, "the node answers again and the paymaster is used");
  });
});

describe("the allowance policy (D4), pure", () => {
  const base: AllowanceInput = { requestedAtomic: undefined, balanceAtomic: 0n, t8: "unknown", mode: "auto", unlimitedBalanceMaxAtomic: 10n * USD, floorAtomic: 50n * USD };

  it("unlimited only while the balance is a test amount and a capped allowance has not been proven", () => {
    assert.deepEqual(decideAllowance(base), { kind: "unlimited" });
    assert.deepEqual(decideAllowance({ ...base, balanceAtomic: 10n * USD }), { kind: "unlimited" }, "the limit itself is a test amount");
    assert.deepEqual(decideAllowance({ ...base, balanceAtomic: 10n * USD + 1n }), { kind: "capped", amountAtomic: 50n * USD, why: "balance_above_test_amount" });
    assert.deepEqual(decideAllowance({ ...base, balanceAtomic: 80n * USD }), { kind: "capped", amountAtomic: 80n * USD, why: "balance_above_test_amount" }, "the larger of the balance and the floor");
    assert.deepEqual(decideAllowance({ ...base, balanceAtomic: null }), { kind: "capped", amountAtomic: 50n * USD, why: "balance_unknown" }, "an unreadable balance never gets the unlimited shape");
    assert.deepEqual(decideAllowance({ ...base, t8: "yes" }), { kind: "capped", amountAtomic: 50n * USD, why: "t8_proven" }, "after T8 the default is capped");
    assert.deepEqual(decideAllowance({ ...base, t8: "no" }), { kind: "unlimited" });
    assert.deepEqual(decideAllowance({ ...base, mode: "capped" }), { kind: "capped", amountAtomic: 50n * USD, why: "policy_capped" });
  });

  it("an amount from the caller is finite and bounded by the same ceiling; it can never ask for unlimited", () => {
    assert.deepEqual(decideAllowance({ ...base, requestedAtomic: 20n * USD }), { kind: "capped", amountAtomic: 20n * USD, why: "requested" });
    assert.deepEqual(decideAllowance({ ...base, requestedAtomic: 50n * USD }), { kind: "capped", amountAtomic: 50n * USD, why: "requested" });
    assert.deepEqual(decideAllowance({ ...base, requestedAtomic: 50n * USD + 1n }), { kind: "refused", ceilingAtomic: 50n * USD });
    assert.deepEqual(decideAllowance({ ...base, requestedAtomic: 90n * USD, balanceAtomic: 100n * USD }), { kind: "capped", amountAtomic: 90n * USD, why: "requested" });
    assert.deepEqual(decideAllowance({ ...base, requestedAtomic: UNLIMITED }), { kind: "refused", ceilingAtomic: 50n * USD });
  });

  it("property: over seeded inputs the shape is unlimited only for a known small balance with T8 not proven, never above the ceiling", () => {
    const random = seededRandom(20261019);
    for (let index = 0; index < 400; index += 1) {
      const balance = random.below(5) === 0 ? null : BigInt(random.below(200)) * USD + BigInt(random.below(1_000_000));
      const t8 = (["unknown", "yes", "no"] as const)[random.below(3)] as AllowanceInput["t8"];
      const mode = random.below(4) === 0 ? "capped" : "auto";
      const requested = random.below(3) === 0 ? BigInt(random.below(150)) * USD + 1n : undefined;
      const input: AllowanceInput = { requestedAtomic: requested, balanceAtomic: balance, t8, mode, unlimitedBalanceMaxAtomic: 10n * USD, floorAtomic: 50n * USD };
      const decision = decideAllowance(input);
      const ceiling = (balance ?? 0n) > 50n * USD ? (balance as bigint) : 50n * USD;
      if (decision.kind === "unlimited") {
        assert.equal(requested, undefined);
        assert.equal(mode, "auto");
        assert.notEqual(t8, "yes");
        assert.ok(balance !== null && balance <= 10n * USD, `unlimited for ${String(balance)}`);
      } else if (decision.kind === "capped") {
        assert.ok(decision.amountAtomic > 0n && decision.amountAtomic <= ceiling);
        if (requested !== undefined) assert.equal(decision.amountAtomic, requested);
      } else {
        assert.ok(requested !== undefined && requested > ceiling);
      }
    }
  });

  it("the environment loader reads the switch and the limits, reports a bad value by name only, and falls back to the safe default", () => {
    const loaded = loadUserOpOptions({ RELAY_ALLOWANCE_POLICY: "capped", RELAY_UNLIMITED_BALANCE_MAX_USD: "5", RELAY_ALLOWANCE_FLOOR_USD: "25.5", XO_RPC_URL: "https://rpc.example.test/", XO_BUNDLER_URL: "https://bundler.example.test/" });
    assert.deepEqual(loaded.issues, []);
    assert.equal(loaded.options.allowance, "capped");
    assert.equal(loaded.options.unlimitedBalanceMaxAtomic, 5n * USD);
    assert.equal(loaded.options.allowanceFloorAtomic, 25_500_000n);
    assert.equal(loaded.options.xoRpcUrl, "https://rpc.example.test/");
    const bad = loadUserOpOptions({ RELAY_ALLOWANCE_POLICY: "unlimited", RELAY_UNLIMITED_BALANCE_MAX_USD: "-3", RELAY_ALLOWANCE_FLOOR_USD: "1e3", XO_RPC_URL: "http://rpc.example.test/", XO_BUNDLER_URL: `https://user:secret${String.fromCharCode(64)}bundler.example.test/?key=abc` });
    assert.deepEqual(
      bad.issues.map((issue) => issue.variable).sort(),
      ["RELAY_ALLOWANCE_FLOOR_USD", "RELAY_ALLOWANCE_POLICY", "RELAY_UNLIMITED_BALANCE_MAX_USD", "XO_BUNDLER_URL", "XO_RPC_URL"],
    );
    assert.deepEqual(bad.options, {}, "every bad value falls back to the default");
    for (const issue of bad.issues) assert.ok(!issue.message.includes("secret") && !issue.message.includes("abc"), "no value is echoed");
    assert.equal(USEROP_DEFAULTS.allowance, "auto");
  });
});

describe("the allowance in the prepared deployment", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("an empty account gets XO's own unlimited shape", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "deploy_enable_trading", params: {} }));
    assert.equal(approveAmountOf(rig, prepared.prepared_id), UNLIMITED);
    assert.ok(prepared.warnings.some((line) => line.includes("unlimited")));
  });

  harness.it("a balance above the test amount, seen on the node or on the orderbook, gets a finite allowance: the larger of the balance and $50", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const account = deriveAccount(owner(mock, 3).address);
    await mintUsdce(mock, account, 80n * USD);
    const onNode = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "deploy_enable_trading", params: {} }));
    assert.equal(approveAmountOf(rig, onNode.prepared_id), 80n * USD);
    // The orderbook's reading counts too: the larger of the two is used.
    const other = deriveAccount(owner(mock, 4).address);
    mock.state.setBalance(other, { balanceMicro: 120n * USD, allowanceMicro: 0n, cashBalanceMicro: 0n });
    const onBook = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 4).address, action: "deploy_enable_trading", params: {} }));
    assert.equal(approveAmountOf(rig, onBook.prepared_id), 120n * USD);
    assert.ok(onBook.warnings.some((line) => line.includes("balance_above_test_amount")));
  });

  harness.it("an unreadable balance never gets the unlimited shape", async (mock) => {
    mock.setProfile("optimistic");
    // No node configured and the orderbook failing: the balance cannot be read from anywhere.
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, userops: { xoRpcUrl: null } });
    await deployOwner(mock, 5, { enableTrading: false });
    mock.injectFault("5xx", { listeners: ["orderbook"] });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 5).address, action: "enable_trading", params: {} }));
    assert.equal(approveAmountOf(rig, prepared.prepared_id), 50n * USD);
    assert.ok(prepared.warnings.some((line) => line.includes("balance_unknown")));
  });

  harness.it("the operator's switch forces a capped allowance whatever the balance", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, userops: { allowance: "capped" } });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "deploy_enable_trading", params: {} }));
    assert.equal(approveAmountOf(rig, prepared.prepared_id), 50n * USD);
  });

  harness.it("a proven capped allowance (T8) makes capped the default", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    await rig.relay.services.capabilities.record({ id: "T8", state: "yes", source: "operator", note: "recorded by the operator after the live test" });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "deploy_enable_trading", params: {} }));
    assert.equal(approveAmountOf(rig, prepared.prepared_id), 50n * USD);
    assert.equal(prepared.capabilities["T8"], "yes");
  });

  harness.it("allowance_usd: an exact finite amount, bounded by the ceiling, never unlimited; zero is invalid", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const alice = owner(mock, 3).address;
    const exact = ok(await rig.post("/v1/userop/prepare", { owner: alice, action: "deploy_enable_trading", params: { allowance_usd: "12.345678" } }));
    assert.equal(approveAmountOf(rig, exact.prepared_id), 12_345_678n);
    const tooMuch = failed(await rig.post("/v1/userop/prepare", { owner: alice, action: "deploy_enable_trading", params: { allowance_usd: "50.000001" } }));
    assert.equal(tooMuch.code, "cap_exceeded");
    assert.equal((tooMuch.details as { ceiling_usd: string }).ceiling_usd, "50");
    assert.equal(failed(await rig.post("/v1/userop/prepare", { owner: alice, action: "deploy_enable_trading", params: { allowance_usd: "0" } })).code, "invalid_request");
    assert.equal(failed(await rig.post("/v1/userop/prepare", { owner: alice, action: "deploy_enable_trading", params: { allowance_usd: "1e9" } })).code, "invalid_request");
    assert.equal(rig.relay.services.prepared.list().length, 1, "only the accepted request left an item");
  });
});

describe("housekeeping", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("hints and inclusion markers older than a month are forgotten at the next prepare; recent ones stay", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const state = rig.relay.services.state;
    await state.set("userop_hints", "included:old", { atMs: mock.clock.nowMs() - 31 * 86_400_000, success: true, txHash: null });
    await state.set("userop_hints", "nosponsor:old", { atMs: mock.clock.nowMs() - 40 * 86_400_000 });
    await state.set("userop_hints", "included:recent", { atMs: mock.clock.nowMs() - 86_400_000, success: true, txHash: null });
    ok(await rig.post("/v1/userop/prepare", { owner: owner(mock, 3).address, action: "deploy_enable_trading", params: {} }));
    assert.deepEqual(state.keys("userop_hints").sort(), ["included:recent"]);
  });
});
