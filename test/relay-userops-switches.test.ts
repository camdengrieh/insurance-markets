import assert from "node:assert/strict";
import { describe } from "node:test";

import type { Hex } from "viem";

import { deriveAccount, isKernelProxyRuntime } from "../src/xo/account/derive.js";
import { isErrorCode } from "../src/relay/errors.js";
import { CTF_EXCHANGE, USDC_E_ADDRESS } from "../src/xo/chain/constants.js";
import { unpackUserOp } from "../src/xo/userop/pack.js";
import { USDCE_STUB_ABI } from "./anvil/stubs.js";
import { OPTIMISTIC_PROFILE, PESSIMISTIC_PROFILE, type MockSwitchName } from "./mock-xo/switches.js";
import type { MockXo } from "./mock-xo/server.js";
import { deployOwner, useMock } from "./mock-xo/testing.js";
import { eventually, failed, mintUsdce, ok, signPrepared, startRig, statusOf, storedOp, tappedFetch, usdceBalanceOf, type Rig, type TapAction, type TappedCall } from "./relay-userops-helpers.js";

// The mock's switches for everything that is unknown on the real XO stack, against the user-operation flow:
// the two profiles, each relevant switch flipped alone, and the specific behaviour behind each one. Whatever the
// switches say, the same things must hold: nothing is sent that was not prepared, nothing is sent twice, every
// failure is an actionable error, and the chain agrees with what the relay reports.

const SEND = "eth_sendUserOperation";
const BUNDLER_HOST = "mainnet-bundler.xo.market";

function owner(mock: MockXo, index: number) {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  return chain.owner(index);
}

async function allowanceOf(mock: MockXo, account: Hex): Promise<bigint> {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  return (await chain.publicClient.readContract({ address: USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "allowance", args: [account, CTF_EXCHANGE] })) as bigint;
}

async function hasCode(mock: MockXo, account: Hex): Promise<boolean> {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  return isKernelProxyRuntime((await chain.publicClient.getCode({ address: account })) ?? "0x");
}

// ---- the standard run and its invariants ------------------------------------------------------------------------------------------

interface Outcome {
  readonly r1: string;
  readonly r2: string;
  readonly r3: string;
  readonly r4: string;
  readonly r5: string;
  readonly r6: string;
}

const code = <T,>(result: { readonly ok: boolean; readonly data?: T; readonly error?: { readonly code: string } }, pick: (data: T) => string): string => (result.ok ? pick(result.data as T) : (result.error?.code ?? "?"));

// Owner A deploys; owner B was deployed beforehand and enables trading with an exact allowance. Returns what each step said.
async function standardRun(mock: MockXo): Promise<Outcome & { readonly sends: number; readonly rig: Rig }> {
  const { fetch, tap } = tappedFetch(mock);
  const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
  const a = owner(mock, 3);
  const b = owner(mock, 4);
  await deployOwner(mock, 4, { enableTrading: false });
  const accountA = deriveAccount(a.address);
  const accountB = deriveAccount(b.address);

  let r1 = "";
  let r2 = "-";
  let r3 = "-";
  const first = await rig.post("/v1/userop/prepare", { owner: a.address, action: "deploy_enable_trading", params: {} });
  r1 = code(first, () => "prepared");
  if (first.ok) {
    const submit = await rig.post("/v1/userop/submit", { prepared_id: first.data.prepared_id, signature: await signPrepared(a, first.data.sign, "eip191") });
    r2 = code(submit, (data) => data.state);
    r3 = (await statusOf(rig, first.data.user_op_hash)).state;
  }
  let r4 = "";
  let r5 = "-";
  let r6 = "-";
  const second = await rig.post("/v1/userop/prepare", { owner: b.address, action: "enable_trading", params: { allowance_usd: "5" } });
  r4 = code(second, () => "prepared");
  if (second.ok) {
    const submit = await rig.post("/v1/userop/submit", { prepared_id: second.data.prepared_id, signature: await signPrepared(b, second.data.sign, "raw") });
    r5 = code(submit, (data) => data.state);
    r6 = (await statusOf(rig, second.data.user_op_hash)).state;
  }

  // Invariants, whatever the switches say.
  for (const result of [r1, r2, r4, r5]) {
    assert.ok(["prepared", "-", "submitted", "rejected", "ambiguous"].includes(result) || isErrorCode(result), `an unknown outcome: ${result}`);
  }
  const sends = tap.count({ rpc: SEND });
  const submitted = [r2, r5].filter((state) => state !== "-" && state !== "flag_off" && state !== "kill_switch" && !isErrorCode(state)).length;
  assert.ok(sends <= submitted, `${sends} sends for ${submitted} spent items`);
  // The chain agrees with what the relay says.
  assert.equal(await hasCode(mock, accountA), r3 === "included", `A is deployed iff the status says included (${r2}/${r3})`);
  assert.equal((await allowanceOf(mock, accountB)) === 5_000_000n, r6 === "included", `B's allowance moved iff the status says included (${r5}/${r6})`);
  if (r3 !== "included" && r3 !== "-") assert.ok(["rejected", "ambiguous", "submitted", "unknown"].includes(r3));
  assert.equal(mock.userops.landed, [r3, r6].filter((state) => state === "included").length, "every landed operation was a prepared, submitted one");
  for (const record of rig.relay.services.prepared.list()) assert.ok(record.state !== "sending", "no item is left mid-send");
  return { r1, r2, r3, r4, r5, r6, sends, rig };
}

describe("both profiles, end to end", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("pessimistic: the node and the bundler are down, so a deployment is refused with a reason and an existing account is not sent anything", async (mock) => {
    mock.setProfile("pessimistic");
    const run = await standardRun(mock);
    assert.deepEqual({ r1: run.r1, r2: run.r2, r4: run.r4, r5: run.r5 }, { r1: "capability_unknown", r2: "-", r4: "prepared", r5: "upstream_rejected" });
    assert.equal(run.sends, 0);
    // The unspent item is still there to be sent when the bundler is back.
    const unspent = run.rig.relay.services.prepared.list().filter((record) => record.state === "prepared");
    assert.equal(unspent.length, 1);
    // The relay is healthy and says what is wrong: no key was looked for, nothing was guessed.
    const health = ok(await run.rig.client.get("/v1/health"));
    assert.equal(health.kill, false);
  });

  harness.it("optimistic: both land and are seen", async (mock) => {
    mock.setProfile("optimistic");
    const run = await standardRun(mock);
    assert.deepEqual({ r1: run.r1, r2: run.r2, r3: run.r3, r4: run.r4, r5: run.r5, r6: run.r6 }, { r1: "prepared", r2: "submitted", r3: "included", r4: "prepared", r5: "submitted", r6: "included" });
    assert.equal(run.sends, 2);
  });
});

describe("each switch flipped alone, from the pessimistic profile and from the optimistic one", () => {
  const harness = useMock({ chains: { xo: true, base: false } });
  const flips: Array<[MockSwitchName, string]> = [
    ["bundler.foreign_account", "reject"],
    ["bundler.foreign_account", "accept"],
    ["bundler.foreign_account", "requires-key"],
    ["bundler.paymasterless", "reject"],
    ["bundler.paymasterless", "accept"],
    ["bundler.estimate", "unsupported"],
    ["bundler.estimate", "supported"],
    ["bundler.shape", "reject-unpacked"],
    ["bundler.shape", "v0.7-unpacked"],
    ["paymaster.state", "paused"],
    ["paymaster.state", "policy-narrowed"],
    ["paymaster.state", "sponsor"],
    ["rpc.access", "down"],
    ["rpc.access", "requires-key"],
    ["rpc.access", "open"],
    ["registry.trigger", "never"],
    ["registry.trigger", "on-deploy"],
    ["registry.trigger", "on-enable-trading"],
    ["registry.trigger", "on-l1-create"],
    ["withdraw.paymasterless", "reject"],
    ["withdraw.paymasterless", "accept-and-deliver"],
    ["withdraw.paymasterless", "accept-no-deliver"],
    ["funding.credit", "credited"],
    ["funding.credit", "delayed-5min"],
  ];
  for (const base of ["pessimistic", "optimistic"] as const) {
    for (const [name, value] of flips) {
      if ((base === "pessimistic" ? PESSIMISTIC_PROFILE : OPTIMISTIC_PROFILE)[name] === value) continue;
      harness.it(`${base} with ${name} = ${value}`, async (mock) => {
        mock.setProfile(base);
        mock.setSwitch(name, value as never);
        const run = await standardRun(mock);
        // The invariants are asserted inside standardRun. Here: no hang, no unknown state left behind.
        assert.ok(run.r1 !== "" && run.r4 !== "");
      });
    }
  }
});

describe("bundler.foreign_account: reject, accept, requires-key (AD5, door a)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("reject: the deployment is 'rejected', the plain rejection text is stored as a fact, the account is untouched and not blocked", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("bundler.foreign_account", "reject");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const a = owner(mock, 3);
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: a.address, action: "deploy_enable_trading", params: {} }));
    const result = ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(a, prepared.sign) }));
    assert.equal(result.state, "rejected");
    assert.match(result.detail ?? "", /refused the operation/);
    assert.equal((await statusOf(rig, prepared.user_op_hash)).state, "rejected");
    assert.equal(rig.relay.services.capabilities.state("AD5"), "no");
    assert.match(rig.relay.services.capabilities.fact("AD5")?.note ?? "", /allowlist/, "the bundler's own words are kept as a fact, sanitised");
    assert.equal(await hasCode(mock, deriveAccount(a.address)), false);
    // Rejection is final for that item and not a block: the account can be prepared again.
    assert.equal(failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(a, prepared.sign) })).code, "prepared_used");
    assert.equal(ok(await rig.post("/v1/userop/prepare", { owner: a.address, action: "deploy_enable_trading", params: {} })).kind, "userop");
  });

  harness.it("accept: lands; the same switch for an account XO provisioned itself makes no difference", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const a = owner(mock, 3);
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: a.address, action: "deploy_enable_trading", params: {} }));
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(a, prepared.sign) })).state, "submitted");
    assert.equal(rig.relay.services.capabilities.state("AD5"), "yes");
  });

  harness.it("requires-key: 'upstream_requires_key', the item is not spent, the host is latched and no key is looked for", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("bundler.foreign_account", "requires-key");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const a = owner(mock, 3);
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: a.address, action: "deploy_enable_trading", params: {} }));
    const signature = await signPrepared(a, prepared.sign);
    const first = failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature }));
    assert.equal(first.code, "upstream_requires_key");
    assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).state, "prepared");
    const requests = tap.count({ host: BUNDLER_HOST });
    const second = failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature }));
    assert.equal(second.code, "upstream_requires_key");
    assert.equal(tap.count({ host: BUNDLER_HOST }), requests, "a host that asked for a key gets nothing more");
    assert.equal(await eventually(() => rig.relay.services.capabilities.state("UO9") === "no"), true);
    // The relay says so in its health data, and reads of the chain keep working.
    const health = ok(await rig.client.get("/v1/health"));
    assert.equal(health.upstream[BUNDLER_HOST]?.state, "requires_key");
    assert.equal(health.status, "degraded");
    assert.equal((await statusOf(rig, prepared.user_op_hash)).state, "unknown");
    // After the retry window (30 minutes) one probe is allowed again; the host still asks for a key.
    mock.clock.advanceMs(31 * 60_000);
    assert.equal(failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature })).code, "expired", "the old item has run out of time");
    const fresh = ok(await rig.post("/v1/userop/prepare", { owner: a.address, action: "deploy_enable_trading", params: {} }));
    assert.equal(failed(await rig.post("/v1/userop/submit", { prepared_id: fresh.prepared_id, signature: await signPrepared(a, fresh.sign) })).code, "upstream_requires_key");
  });
});

describe("bundler.paymasterless and paymaster.state (UO7, UO8)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("an existing account goes without a paymaster when it is paused, and a bundler that rejects that is 'rejected' with UO8 recorded as no", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("paymaster.state", "paused");
    mock.setSwitch("bundler.paymasterless", "reject");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const b = owner(mock, 4);
    await deployOwner(mock, 4, { enableTrading: false });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: b.address, action: "enable_trading", params: { allowance_usd: "5" } }));
    assert.equal(unpackUserOp(storedOp(rig, prepared.prepared_id)).paymaster, null);
    const result = ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(b, prepared.sign) }));
    assert.equal(result.state, "rejected");
    assert.equal(rig.relay.services.capabilities.state("UO8"), "no");
    assert.equal(await allowanceOf(mock, deriveAccount(b.address)), 0n);
  });

  harness.it("the same account lands without a paymaster when the bundler accepts it, and UO8 is recorded as yes", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("paymaster.state", "policy-narrowed");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const b = owner(mock, 4);
    await deployOwner(mock, 4, { enableTrading: false });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: b.address, action: "enable_trading", params: { allowance_usd: "5" } }));
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(b, prepared.sign) })).state, "submitted");
    assert.equal(await allowanceOf(mock, deriveAccount(b.address)), 5_000_000n);
    assert.equal(rig.relay.services.capabilities.state("UO8"), "yes");
  });

  harness.it("the paymaster pauses between prepare and submit: the sponsored item is refused (not spent) and the next prepare goes without one", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const b = owner(mock, 4);
    await deployOwner(mock, 4, { enableTrading: false });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: b.address, action: "enable_trading", params: { allowance_usd: "5" } }));
    assert.ok(unpackUserOp(storedOp(rig, prepared.prepared_id)).paymaster !== null);
    mock.setSwitch("paymaster.state", "paused");
    const refused = failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(b, prepared.sign) }));
    assert.equal(refused.code, "precondition_failed");
    assert.equal((refused.details as { reason: string }).reason, "paymaster_paused");
    assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).state, "prepared");
    assert.equal(tap.count({ rpc: SEND }), 0);
    const again = ok(await rig.post("/v1/userop/prepare", { owner: b.address, action: "enable_trading", params: { allowance_usd: "5" } }));
    assert.equal(unpackUserOp(storedOp(rig, again.prepared_id)).paymaster, null);
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: again.prepared_id, signature: await signPrepared(b, again.sign) })).state, "submitted");
    assert.equal(await allowanceOf(mock, deriveAccount(b.address)), 5_000_000n);
  });

  harness.it("the bundler refuses a sponsored operation at the paymaster (AA34): UO7 is no, and an existing account is told to prepare again, once, without one", async (mock) => {
    mock.setProfile("optimistic");
    let refuseOnce = true;
    const { fetch } = tappedFetch(mock, (call: TappedCall): TapAction => {
      if (call.rpc === SEND && refuseOnce) {
        refuseOnce = false;
        return { action: "rpc_error", code: -32501, message: "AA34 signature error: the paymaster policy refuses 0x095ea7b3" };
      }
      return { action: "forward" };
    });
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const b = owner(mock, 4);
    await deployOwner(mock, 4, { enableTrading: false });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: b.address, action: "enable_trading", params: { allowance_usd: "5" } }));
    const result = ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(b, prepared.sign) }));
    assert.equal(result.state, "rejected");
    assert.match(result.detail ?? "", /AA34/);
    assert.match(result.detail ?? "", /without a paymaster/);
    assert.equal(rig.relay.services.capabilities.state("UO7"), "no");
    const retry = ok(await rig.post("/v1/userop/prepare", { owner: b.address, action: "enable_trading", params: { allowance_usd: "5" } }));
    assert.equal(unpackUserOp(storedOp(rig, retry.prepared_id)).paymaster, null);
    assert.ok(retry.warnings.some((line) => line.includes("refused a recent operation")));
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: retry.prepared_id, signature: await signPrepared(b, retry.sign) })).state, "submitted");
  });

  harness.it("a deployment refused at the paymaster is never retried without one: the detail says so", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch } = tappedFetch(mock, (call: TappedCall): TapAction => (call.rpc === SEND ? { action: "rpc_error", code: -32501, message: "AA33 reverted" } : { action: "forward" }));
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const a = owner(mock, 3);
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: a.address, action: "deploy_enable_trading", params: {} }));
    const result = ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(a, prepared.sign) }));
    assert.equal(result.state, "rejected");
    assert.match(result.detail ?? "", /never sent without a paymaster/);
    assert.equal(rig.relay.services.capabilities.state("UO7"), "no");
  });
});

describe("bundler.shape and bundler.estimate (UO5, UO6)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("a bundler that wants the packed form refuses the unpacked one: 'rejected' and UO6 recorded as no", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("bundler.shape", "reject-unpacked");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const a = owner(mock, 3);
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: a.address, action: "deploy_enable_trading", params: {} }));
    const result = ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(a, prepared.sign) }));
    assert.equal(result.state, "rejected");
    assert.equal(rig.relay.services.capabilities.state("UO6"), "no");
    assert.equal(await hasCode(mock, deriveAccount(a.address)), false);
  });
});

describe("rpc.access (UO9)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("the node goes down between prepare and submit: the sponsored item is not sent on a guess", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const a = owner(mock, 3);
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: a.address, action: "deploy_enable_trading", params: {} }));
    mock.setSwitch("rpc.access", "down");
    const refused = failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(a, prepared.sign) }));
    assert.equal(refused.code, "capability_unknown");
    assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).state, "prepared");
    assert.equal(tap.count({ rpc: SEND }), 0);
  });

  harness.it("the explorer's logs carry the nonce and the deployment when the node is closed to the relay", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("rpc.access", "requires-key");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const b = owner(mock, 4);
    await deployOwner(mock, 4, { enableTrading: true });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: b.address, action: "revoke_trading", params: {} }));
    assert.equal(storedOp(rig, prepared.prepared_id).nonce & 0xffff_ffff_ffff_ffffn, 1n);
    // The bundler asks for a key too (UO9): nothing is sent, and the error says so.
    assert.equal(failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(b, prepared.sign) })).code, "upstream_requires_key");
  });
});

describe("registry.trigger: a deployed account the orderbook does not know blocks trading, and the response says why (N2)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  for (const [trigger, expected] of [
    ["never", "deployed_unregistered"],
    ["on-l1-create", "deployed_unregistered"],
    ["on-deploy", "knows the account"],
    ["on-enable-trading", "knows the account"],
  ] as const) {
    harness.it(`registry.trigger = ${trigger}: the status after the deployment says ${expected}`, async (mock) => {
      mock.setProfile("optimistic");
      mock.setSwitch("registry.trigger", trigger);
      const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
      const a = owner(mock, 3);
      const prepared = ok(await rig.post("/v1/userop/prepare", { owner: a.address, action: "deploy_enable_trading", params: {} }));
      assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(a, prepared.sign) })).state, "submitted");
      const status = await statusOf(rig, prepared.user_op_hash);
      assert.equal(status.state, "included");
      assert.ok((status.detail ?? "").includes(expected), status.detail);
      if (expected === "deployed_unregistered") {
        assert.match(status.detail ?? "", /trading stays blocked/);
        assert.equal(rig.relay.services.capabilities.state("AD4"), "unknown");
        // A later enable_trading warns that the registry still does not know the account.
        const next = ok(await rig.post("/v1/userop/prepare", { owner: a.address, action: "enable_trading", params: {} }));
        assert.ok(next.warnings.some((line) => line.includes("deployed_unregistered")));
      } else {
        assert.equal(rig.relay.services.capabilities.state("AD4"), "yes");
      }
    });
  }
});

describe("withdraw.paymasterless (FU9, H1)", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  async function withdrawRun(mock: MockXo, mode: "accept-and-deliver" | "accept-no-deliver" | "reject") {
    mock.setProfile("optimistic");
    mock.setSwitch("withdraw.paymasterless", mode);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1", ENABLE_WITHDRAW: "1" } });
    const a = owner(mock, 3);
    const account = deriveAccount(a.address);
    await deployOwner(mock, 3, { enableTrading: true });
    await mintUsdce(mock, account, 5_000_000n);
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: a.address, action: "withdraw", params: { amount_usd: "4" } }));
    assert.equal(storedOp(rig, prepared.prepared_id).paymasterAndData, "0x");
    const result = ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(a, prepared.sign) }));
    return { rig, a, account, prepared, result };
  }

  harness.it("accept-and-deliver: the funds leave XO and arrive on Base; the relay reports inclusion only, FU9 stays for the operator", async (mock) => {
    const { rig, a, account, prepared, result } = await withdrawRun(mock, "accept-and-deliver");
    assert.equal(result.state, "submitted");
    assert.equal((await statusOf(rig, prepared.user_op_hash)).state, "included");
    assert.equal(await usdceBalanceOf(mock, account), 1_000_000n);
    await mock.advance(40);
    assert.equal(mock.hyperlane.baseBalanceOf(a.address), 4_000_000n, "delivered to the owner address on Base");
    assert.equal(rig.relay.services.capabilities.state("FU9"), "unknown", "one delivery observed on a local mock is not the live test");
  });

  harness.it("accept-no-deliver: the funds are burned on XO and never arrive; the relay still only says what it saw", async (mock) => {
    const { rig, a, account, prepared, result } = await withdrawRun(mock, "accept-no-deliver");
    assert.equal(result.state, "submitted");
    assert.equal((await statusOf(rig, prepared.user_op_hash)).state, "included");
    await mock.advance(120);
    assert.equal(await usdceBalanceOf(mock, account), 1_000_000n);
    assert.equal(mock.hyperlane.baseBalanceOf(a.address), 0n);
    assert.equal(rig.relay.services.capabilities.state("FU9"), "unknown");
    assert.ok(prepared.warnings.some((line) => line.includes("no verified withdrawal path")), "the warning was in front of the approver");
  });

  harness.it("reject: the bundler refuses, nothing moves, and FU9 is recorded as no", async (mock) => {
    const { rig, account, result } = await withdrawRun(mock, "reject");
    assert.equal(result.state, "rejected");
    assert.equal(await usdceBalanceOf(mock, account), 5_000_000n);
    assert.equal(rig.relay.services.capabilities.state("FU9"), "no");
  });
});
