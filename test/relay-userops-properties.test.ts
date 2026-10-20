import assert from "node:assert/strict";
import { describe } from "node:test";

import { encodeFunctionData, type Hex } from "viem";

import { deriveAccount } from "../src/xo/account/derive.js";
import { CONDITIONAL_TOKENS, CTF_EXCHANGE, USDC_E_ADDRESS } from "../src/xo/chain/constants.js";
import { decodeAllowedCall, type DecodedCall } from "../src/xo/userop/calls.js";
import { decodeExecute } from "../src/xo/userop/encode.js";
import { assertOperationShape } from "../src/xo/userop/sign.js";
import { unpackUserOp } from "../src/xo/userop/pack.js";
import { decodeKernelNonce } from "../src/xo/userop/nonce.js";
import { flipByte } from "./anvil/userop.js";
import { CTF_STUB_ABI, USDCE_STUB_ABI } from "./anvil/stubs.js";
import { seeded } from "./anvil/scenarios.js";
import { seededRandom } from "./fixtures/userop/prng.js";
import { deployOwner, useMock } from "./mock-xo/testing.js";
import type { MockXo } from "./mock-xo/server.js";
import { failed, mintUsdce, ok, signPrepared, startRig, statusOf, storedOp, tappedFetch, type Rig, type SignForm } from "./relay-userops-helpers.js";

// Property-style tests with fixed seeds (no Math.random, no clock): over many generated requests, whatever the relay
// prepares is exactly what its rules say, hashes like the real EntryPoint, decodes to the action asked for, and a
// stored operation or a signature that was changed in any byte is never sent.

const USD = 1_000_000n;
const PRINTABLE = /^[\x20-\x7e]+$/;

function owner(mock: MockXo, index: number) {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  return chain.owner(index);
}

type Step = "enable_trading" | "revoke_trading" | "redeem" | "withdraw";
const STEPS: readonly Step[] = ["enable_trading", "revoke_trading", "redeem", "withdraw"];

async function resolveCondition(mock: MockXo, id: Hex): Promise<void> {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  await chain.sendFrom(chain.bundler.address, CONDITIONAL_TOKENS, encodeFunctionData({ abi: CTF_STUB_ABI, functionName: "stubSetPayoutDenominator", args: [id, 1n] }));
}

// What each action's calls must decode to, judged by the closed list and not by the builders that made them.
function expectedKinds(action: Step | "deploy_enable_trading"): readonly DecodedCall["kind"][] {
  switch (action) {
    case "deploy_enable_trading":
    case "enable_trading":
    case "revoke_trading":
      return ["usdce_approve", "ctf_set_approval_for_all"];
    case "redeem":
      return ["ctf_redeem"];
    case "withdraw":
      return ["usdce_approve", "withdraw_transfer_remote"];
  }
}

async function check(rig: Rig, mock: MockXo, prepared: Awaited<ReturnType<Rig["post"]>> extends infer R ? (R extends { ok: true; data: infer D } ? D : never) : never, action: Step | "deploy_enable_trading", ownerIndex: number): Promise<void> {
  const p = prepared as { prepared_id: string; user_op_hash: Hex; account: Hex; summary: { lines: string[]; digest_tag: string }; sign: { expected_digest: Hex; intent: { rawSigningPayloadHex?: Hex } }; owner: Hex };
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  const op = storedOp(rig, p.prepared_id);
  assert.equal(p.user_op_hash, await chain.entryPointGetUserOpHash(op), "the hash is the real EntryPoint's");
  assert.equal(p.sign.expected_digest, p.user_op_hash);
  assert.equal(p.sign.intent.rawSigningPayloadHex, p.user_op_hash);
  assert.equal(p.summary.digest_tag, p.user_op_hash.slice(2, 18));
  assert.equal(op.sender, deriveAccount(owner(mock, ownerIndex).address));
  assert.equal(p.account, op.sender);
  const fields = unpackUserOp(op);
  assert.equal(fields.maxFeePerGas, 0n);
  assert.equal(fields.maxPriorityFeePerGas, 0n);
  const nonce = decodeKernelNonce(op.nonce);
  assert.deepEqual({ mode: nonce.mode, type: nonce.type, key: nonce.key }, { mode: 0, type: 0, key: 0 });
  assert.equal(op.initCode === "0x", action !== "deploy_enable_trading");
  // The paymaster never carries a revoke or a withdrawal.
  if (action === "revoke_trading" || action === "withdraw") assert.equal(fields.paymaster, null);
  // The calls, judged by the closed list.
  const calls = decodeExecute(op.callData).calls;
  const decoded = calls.map((call) => decodeAllowedCall(call, { owner: owner(mock, ownerIndex).address }));
  const kinds = decoded.map((d) => d.kind);
  if (action === "redeem") assert.ok(kinds.every((kind) => kind === "ctf_redeem"));
  else assert.deepEqual(kinds, expectedKinds(action));
  assert.doesNotThrow(() => assertOperationShape(op, { action, owner: owner(mock, ownerIndex).address }));
  for (const line of p.summary.lines) {
    assert.match(line, PRINTABLE);
    assert.ok(line.length <= 300);
  }
  assert.ok(p.summary.lines.length <= 24);
}

const walked = new Map<string, number>();

describe("over seeded sequences of requests, everything prepared and landed is what the rules say", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  for (const seed of [1, 2, 3]) {
    harness.it(`seed ${seed}: deploy, then a random walk over enable, revoke, redeem and withdraw`, async (mock) => {
      mock.setProfile("optimistic");
      const random = seededRandom(seed * 7919);
      const ids = seeded(`property-${seed}`);
      const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1", ENABLE_WITHDRAW: "1" } });
      const ownerIndex = 3 + (seed % 5);
      const alice = owner(mock, ownerIndex);
      const account = deriveAccount(alice.address);
      const chain = mock.chains.xo;
      assert.ok(chain !== undefined);
      const forms: SignForm[] = ["raw", "eip191"];

      const deploy = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "deploy_enable_trading", params: {} }));
      await check(rig, mock, deploy as never, "deploy_enable_trading", ownerIndex);
      assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: deploy.prepared_id, signature: await signPrepared(alice, deploy.sign, forms[random.below(2)] as SignForm) })).state, "submitted");
      assert.equal((await statusOf(rig, deploy.user_op_hash)).state, "included");
      await mintUsdce(mock, account, 40n * USD);

      let balance = 40n * USD;
      let expectedSequence = 1n;
      for (let step = 0; step < 8; step += 1) {
        const action = STEPS[random.below(STEPS.length)] as Step;
        let request: Parameters<Rig["post"]>[1];
        if (action === "enable_trading") request = { owner: alice.address, action, params: random.below(2) === 0 ? {} : { allowance_usd: String(1 + random.below(40)) } };
        else if (action === "revoke_trading") request = { owner: alice.address, action, params: {} };
        else if (action === "redeem") {
          const count = 1 + random.below(14);
          const conditions = Array.from({ length: count }, () => ids.bytes(32));
          for (const id of conditions) await resolveCondition(mock, id);
          request = { owner: alice.address, action, params: { condition_ids: conditions } };
        } else {
          const amount = BigInt(1 + random.below(12)) * USD;
          request = { owner: alice.address, action, params: { amount_usd: (Number(amount / USD)).toString() } };
          if (amount > balance) {
            // More than the account holds is refused, whatever else is true.
            assert.equal(failed(await rig.post("/v1/userop/prepare", request as never)).code, "precondition_failed");
            continue;
          }
          balance -= amount;
        }
        const prepared = ok(await rig.post("/v1/userop/prepare", request as never));
        walked.set(action, (walked.get(action) ?? 0) + 1);
        await check(rig, mock, prepared as never, action, ownerIndex);
        assert.equal(storedOp(rig, prepared.prepared_id).nonce & 0xffff_ffff_ffff_ffffn, expectedSequence, `${action} uses the next nonce`);
        const form = forms[random.below(2)] as SignForm;
        assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign, form) })).state, "submitted", action);
        assert.equal((await statusOf(rig, prepared.user_op_hash)).state, "included", action);
        expectedSequence += 1n;
        // The chain agrees with the action.
        const allowance = (await chain.publicClient.readContract({ address: USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "allowance", args: [account, CTF_EXCHANGE] })) as bigint;
        if (action === "revoke_trading") assert.equal(allowance, 0n);
        if (action === "enable_trading") assert.ok(allowance > 0n);
        if (action === "withdraw") assert.equal((await chain.publicClient.readContract({ address: USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "balanceOf", args: [account] })) as bigint, balance);
      }
      // Every operation the bundler saw was one that was prepared, and each was sent once.
      const spent = rig.relay.services.prepared.list().filter((record) => record.state === "accepted");
      assert.equal(mock.userops.landed, spent.length);
    });
  }

  harness.it("the seeds together walked every action at least once (so the property above is not vacuous)", () => {
    for (const action of STEPS) assert.ok((walked.get(action) ?? 0) >= 1, `${action} was never walked: ${JSON.stringify([...walked])}`);
  });
});

describe("a change to the stored operation or to the signature is never sent", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("flipping any byte of the stored operation, in any field, stops submit before the bundler sees anything", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const random = seededRandom(424242);
    const alice = owner(mock, 3);
    await deployOwner(mock, 3, { enableTrading: false });
    const fields = ["sender", "initCode", "callData", "accountGasLimits", "gasFees", "paymasterAndData"] as const;
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "enable_trading", params: { allowance_usd: "7" } }));
    const signature = await signPrepared(alice, prepared.sign, "raw");
    const original = rig.relay.services.state.get("prepared", prepared.prepared_id) as unknown as { payload: { op: Record<string, string> } };
    let tried = 0;
    for (let round = 0; round < 60; round += 1) {
      const field = fields[random.below(fields.length)] as (typeof fields)[number];
      const value = original.payload.op[field] as string;
      if (value === "0x" || value.length <= 4) continue;
      const bytes = value.slice(2).match(/../g) ?? [];
      const index = random.below(bytes.length);
      bytes[index] = ((Number.parseInt(bytes[index] as string, 16) ^ (1 << random.below(8))) & 0xff).toString(16).padStart(2, "0");
      const mutated = { ...original, payload: { ...original.payload, op: { ...original.payload.op, [field]: `0x${bytes.join("")}` } } };
      await rig.relay.services.state.set("prepared", prepared.prepared_id, mutated as never);
      const result = failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature }));
      assert.ok(["internal", "invalid_request"].includes(result.code), `${field}[${index}]: ${result.code}`);
      tried += 1;
    }
    assert.ok(tried >= 40);
    assert.equal(tap.count({ rpc: "eth_sendUserOperation" }), 0);
    // The untouched record still works.
    await rig.relay.services.state.set("prepared", prepared.prepared_id, original as never);
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature })).state, "submitted");
  });

  harness.it("flipping any byte of a valid signature is refused with owner_mismatch or signature_invalid, never sent", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const alice = owner(mock, 3);
    await deployOwner(mock, 3, { enableTrading: false });
    const random = seededRandom(777);
    let prepared = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "enable_trading", params: { allowance_usd: "7" } }));
    let signature = await signPrepared(alice, prepared.sign, "raw");
    let strikes = 0;
    const positions = Array.from({ length: 65 }, (_, i) => i);
    for (let i = positions.length - 1; i > 0; i -= 1) {
      const j = random.below(i + 1);
      [positions[i], positions[j]] = [positions[j] as number, positions[i] as number];
    }
    for (const position of positions.slice(0, 24)) {
      if (strikes === 4) {
        // A fresh item: five bad signatures spend one.
        prepared = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "enable_trading", params: { allowance_usd: "7" } }));
        signature = await signPrepared(alice, prepared.sign, "raw");
        strikes = 0;
      }
      const result = failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: flipByte(signature, position) }));
      // A flip in s may make a high-s twin that normalises back to a valid, different recovery: still not the owner.
      assert.ok(["owner_mismatch", "signature_invalid"].includes(result.code), `byte ${position}: ${result.code}`);
      strikes += 1;
    }
    assert.equal(tap.count({ rpc: "eth_sendUserOperation" }), 0);
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature })).state, "submitted");
  });
});
