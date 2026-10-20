import assert from "node:assert/strict";
import { describe } from "node:test";

import { getAddress, type Hex } from "viem";

import { CTF_EXCHANGE, CONDITIONAL_TOKENS, USDC_E_ADDRESS } from "../src/xo/chain/constants.js";
import { deriveAccount, isKernelProxyRuntime } from "../src/xo/account/derive.js";
import { USDCE_STUB_ABI, CTF_STUB_ABI } from "./anvil/stubs.js";
import { joinSignature, malleate, splitSignature, withV } from "./anvil/userop.js";
import { buildOp } from "./anvil/scenarios.js";
import { packedToJson } from "../src/xo/userop/pack.js";
import { SUPERSEDE_AFTER_MS } from "../relay/userops.js";
import { deployOwner, useMock } from "./mock-xo/testing.js";
import type { MockXo } from "./mock-xo/server.js";
import { failed, ok, signPrepared, startRig, statusOf, storedOp, tappedFetch, type Rig, type TapAction, type TappedCall } from "./relay-userops-helpers.js";
import { ACCOUNT_DEPLOYED_TOPIC } from "../src/xo/chain/constants.js";

// POST /v1/userop/submit: what must be true before anything is sent, and what the relay does with every result.

const SEND = "eth_sendUserOperation";

function owner(mock: MockXo, index: number) {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  return chain.owner(index);
}

async function codeAt(mock: MockXo, account: Hex): Promise<string> {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  return (await chain.publicClient.getCode({ address: account })) ?? "0x";
}

async function prepareDeploy(rig: Rig, index: number) {
  return ok(await rig.post("/v1/userop/prepare", { owner: owner(rig.mock, index).address, action: "deploy_enable_trading", params: {} }));
}

describe("a whole life of an account through the relay (optimistic profile)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("T1 is recorded only when the deployment's logs are really there: a lagging index is retried on later polls", async (mock) => {
    mock.setProfile("optimistic");
    let hide = true;
    const { fetch } = tappedFetch(mock, (call): TapAction =>
      hide && call.host === "explorer-mainnet.xo.market" && call.search.includes(ACCOUNT_DEPLOYED_TOPIC.slice(2))
        ? { action: "json", body: { status: "0", message: "No logs found", result: [] } }
        : { action: "forward" },
    );
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) })).state, "submitted");
    // The operation is found by its hash; the deployment logs have not been indexed yet.
    assert.equal((await statusOf(rig, prepared.user_op_hash)).state, "included");
    assert.equal(rig.relay.services.capabilities.state("T1"), "unknown", "four logs were not seen, so no test result is recorded");
    hide = false;
    assert.equal((await statusOf(rig, prepared.user_op_hash)).state, "included");
    assert.equal(rig.relay.services.capabilities.state("T1"), "yes", "recorded as soon as they are");
  });

  for (const form of ["raw", "eip191"] as const) {
    harness.it(`deploy and enable trading, then enable again, then revoke: signed ${form}, every step lands and is seen`, async (mock) => {
      mock.setProfile("optimistic");
      const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
      const index = form === "raw" ? 3 : 4;
      const alice = owner(mock, index);
      const account = deriveAccount(alice.address);
      const chain = mock.chains.xo;
      assert.ok(chain !== undefined);

      // 1. Deploy and enable trading.
      const prepared = await prepareDeploy(rig, index);
      assert.equal(await codeAt(mock, account), "0x");
      const signature = await signPrepared(alice, prepared.sign, form);
      const submitted = ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature }));
      assert.equal(submitted.state, "submitted");
      assert.equal(submitted.user_op_hash, prepared.user_op_hash);
      assert.ok(isKernelProxyRuntime(await codeAt(mock, account)), "the real Kernel proxy is on the chain");
      const status = await statusOf(rig, prepared.user_op_hash);
      assert.equal(status.state, "included");
      assert.match(status.tx_hash ?? "", /^0x[0-9a-f]{64}$/);
      assert.match(status.detail ?? "", /orderbook knows the account/);
      assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).state, "accepted");

      // What was learnt is recorded as facts, from observation only.
      const facts = rig.relay.services.capabilities;
      for (const id of ["T1", "AD5", "UO6", "UO7", "AD4"]) assert.equal(facts.state(id), "yes", id);
      assert.equal(facts.fact("T1")?.source, "probe");

      // The exchange can now move the owner's USDC.e and CTF tokens.
      assert.equal(await chain.publicClient.readContract({ address: USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "allowance", args: [account, CTF_EXCHANGE] }), 2n ** 256n - 1n);
      assert.equal(await chain.publicClient.readContract({ address: CONDITIONAL_TOKENS, abi: CTF_STUB_ABI, functionName: "isApprovedForAll", args: [account, CTF_EXCHANGE] }), true);

      // 2. A deployed account cannot deploy again; it can enable trading (sequence 1) and revoke it (sequence 2).
      assert.equal(failed(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "deploy_enable_trading", params: {} })).code, "precondition_failed");
      const again = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "enable_trading", params: { allowance_usd: "20" } }));
      assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: again.prepared_id, signature: await signPrepared(alice, again.sign, form) })).state, "submitted");
      assert.equal((await statusOf(rig, again.user_op_hash)).state, "included");
      assert.equal(await chain.publicClient.readContract({ address: USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "allowance", args: [account, CTF_EXCHANGE] }), 20_000_000n);

      const revoke = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "revoke_trading", params: {} }));
      assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: revoke.prepared_id, signature: await signPrepared(alice, revoke.sign, form) })).state, "submitted");
      assert.equal((await statusOf(rig, revoke.user_op_hash)).state, "included");
      assert.equal(await chain.publicClient.readContract({ address: USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "allowance", args: [account, CTF_EXCHANGE] }), 0n);
      assert.equal(await chain.publicClient.readContract({ address: CONDITIONAL_TOKENS, abi: CTF_STUB_ABI, functionName: "isApprovedForAll", args: [account, CTF_EXCHANGE] }), false);
      assert.equal(rig.relay.services.capabilities.state("UO8"), "yes", "the paymaster-less revoke was accepted by the bundler");
    });
  }

  harness.it("every spelling of the signature PayBox may return lands: 65 bytes, {r,s,recovery_id}, {r,s,v}, v as 0/1, and the high-s twin", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const alice = owner(mock, 3);
    await deployOwner(mock, 3, { enableTrading: false });
    const spellings: Array<(sig: Hex) => unknown> = [
      (sig) => sig,
      (sig) => ({ r: `0x${sig.slice(2, 66)}`, s: `0x${sig.slice(66, 130)}`, recovery_id: splitSignature(sig).v - 27 }),
      (sig) => ({ r: `0x${sig.slice(2, 66)}`, s: `0x${sig.slice(66, 130)}`, v: splitSignature(sig).v }),
      (sig) => withV(sig, splitSignature(sig).v - 27),
      (sig) => malleate(sig),
    ];
    let expectedNonce = 1n;
    for (const [index, spell] of spellings.entries()) {
      const prepared = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "enable_trading", params: { allowance_usd: String(index + 1) } }));
      assert.equal(storedOp(rig, prepared.prepared_id).nonce & 0xffff_ffff_ffff_ffffn, expectedNonce);
      const raw = await signPrepared(alice, prepared.sign, "raw");
      const result = await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: spell(raw) as never });
      assert.equal(ok(result).state, "submitted", `spelling ${index}`);
      assert.equal((await statusOf(rig, prepared.user_op_hash)).state, "included", `spelling ${index}`);
      expectedNonce += 1n;
    }
  });
});

describe("the signature check", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("a signature by anyone but the owner is refused, the item is not consumed, and five of them spend it", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const alice = owner(mock, 3);
    const mallory = owner(mock, 7);
    const prepared = await prepareDeploy(rig, 3);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const result = failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(mallory, prepared.sign, attempt % 2 === 0 ? "raw" : "eip191") }));
      assert.equal(result.code, "owner_mismatch");
      assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).state, "prepared");
      assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).failedAttempts, attempt);
    }
    // The owner can still sign it.
    const fifth = failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(mallory, prepared.sign) }));
    assert.equal(fifth.code, "owner_mismatch");
    const spent = rig.relay.services.prepared.require(prepared.prepared_id);
    assert.equal(spent.state, "rejected");
    assert.equal(spent.detail, "too_many_bad_signatures");
    assert.equal(failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) })).code, "prepared_used");
    assert.equal(tap.count({ rpc: SEND }), 0, "nothing was ever sent");
    assert.equal(await codeAt(mock, deriveAccount(alice.address)), "0x");
  });

  harness.it("a good signature after bad ones still lands", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    assert.equal(failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(owner(mock, 7), prepared.sign) })).code, "owner_mismatch");
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) })).state, "submitted");
  });

  harness.it("the owner's signature over ANOTHER prepared item's digest does not authorise this one", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const alice = owner(mock, 3);
    const first = await prepareDeploy(rig, 3);
    const second = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "deploy_enable_trading", params: { allowance_usd: "5" } }));
    assert.notEqual(first.user_op_hash, second.user_op_hash);
    const result = failed(await rig.post("/v1/userop/submit", { prepared_id: first.prepared_id, signature: await signPrepared(alice, second.sign) }));
    assert.equal(result.code, "owner_mismatch");
  });

  harness.it("a malformed signature is refused: a recovery byte of 5, r of zero, s above the curve order, or not hex at all", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    const good = await signPrepared(alice, prepared.sign, "raw");
    const parts = splitSignature(good);
    const bad: Array<[string, unknown, string]> = [
      ["v of 5", joinSignature({ ...parts, v: 5 }), "signature_invalid"],
      ["r of zero", joinSignature({ ...parts, r: 0n }), "signature_invalid"],
      ["s of zero", joinSignature({ ...parts, s: 0n }), "signature_invalid"],
      ["s above n", joinSignature({ ...parts, s: 2n ** 256n - 1n }), "signature_invalid"],
      ["64 bytes", good.slice(0, 130), "invalid_request"],
      ["not hex", `0x${"zz".repeat(65)}`, "invalid_request"],
      ["an object with extra keys", { r: `0x${good.slice(2, 66)}`, s: `0x${good.slice(66, 130)}`, v: 27, extra: 1 }, "invalid_request"],
      ["a number", 12345, "invalid_request"],
    ];
    for (const [name, signature, code] of bad) {
      const result = failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: signature as never }));
      assert.equal(result.code, code, name);
    }
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: good })).state, "submitted");
  });

  harness.it("submit takes only prepared_id and signature: any other field, however plausible, is refused", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    const signature = await signPrepared(alice, prepared.sign);
    for (const extra of [{ owner: owner(mock, 7).address }, { account: prepared.account }, { user_op: {} }, { callData: "0x" }, { nonce: "1" }, { to: owner(mock, 7).address }]) {
      const result = await rig.client.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature, ...extra } as never);
      assert.equal(failed(result).code, "invalid_request", JSON.stringify(extra));
    }
    assert.equal(failed(await rig.client.post("/v1/userop/submit", { prepared_id: prepared.prepared_id } as never)).code, "invalid_request");
    assert.equal(failed(await rig.post("/v1/userop/submit", { prepared_id: "0".repeat(32), signature })).code, "not_found");
    assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).state, "prepared");
  });
});

describe("single use, expiry, nonce and the sending marker", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("one upstream send per prepared item, however often it is submitted", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    const signature = await signPrepared(alice, prepared.sign);
    const results = await Promise.all([1, 2, 3].map(() => rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature })));
    const states = results.map((result) => (result.ok ? result.data.state : result.error.code));
    assert.equal(states.filter((state) => state === "submitted").length, 1, JSON.stringify(states));
    assert.equal(states.filter((state) => state === "prepared_used").length, 2, JSON.stringify(states));
    assert.equal(failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature })).code, "prepared_used");
    assert.equal(tap.count({ rpc: SEND }), 1);
  });

  harness.it("an item older than five minutes is expired and nothing is sent", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    const signature = await signPrepared(alice, prepared.sign);
    mock.clock.advanceMs(299_000);
    const late = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "deploy_enable_trading", params: { allowance_usd: "3" } }));
    mock.clock.advanceMs(2_000);
    assert.equal(failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature })).code, "expired");
    assert.equal(tap.count({ rpc: SEND }), 0);
    // The newer item is still good.
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: late.prepared_id, signature: await signPrepared(alice, late.sign) })).state, "submitted");
  });

  harness.it("the nonce is re-read at submit: the second of two prepared items is stale once the first has landed", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const alice = owner(mock, 3);
    await deployOwner(mock, 3, { enableTrading: false });
    const first = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "enable_trading", params: { allowance_usd: "10" } }));
    const second = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "revoke_trading", params: {} }));
    assert.equal(storedOp(rig, first.prepared_id).nonce, storedOp(rig, second.prepared_id).nonce);
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: first.prepared_id, signature: await signPrepared(alice, first.sign) })).state, "submitted");
    const stale = failed(await rig.post("/v1/userop/submit", { prepared_id: second.prepared_id, signature: await signPrepared(alice, second.sign) }));
    assert.equal(stale.code, "stale_nonce");
    assert.equal(rig.relay.services.prepared.require(second.prepared_id).state, "prepared", "a stale item is not consumed; prepare again");
  });

  harness.it("a deployment prepared before the account was deployed by another route is stale, not sent", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    await deployOwner(mock, 3, { enableTrading: false });
    const result = failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) }));
    assert.equal(result.code, "stale_nonce");
    assert.equal(tap.count({ rpc: SEND }), 0);
  });

  harness.it("the sending marker is on disk before the request leaves the relay", async (mock) => {
    mock.setProfile("optimistic");
    let rigRef: Rig | undefined;
    const seen: string[] = [];
    const { fetch } = tappedFetch(mock, (call: TappedCall): TapAction => {
      if (call.rpc === SEND && rigRef !== undefined) {
        for (const record of rigRef.relay.services.prepared.list()) seen.push(record.state);
      }
      return { action: "forward" };
    });
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    rigRef = rig;
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) })).state, "submitted");
    assert.deepEqual(seen, ["sending"]);
  });
});

describe("the stored operation is what is sent, and it is judged again", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("a stored operation that no longer hashes to its digest is never sent", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    const record = rig.relay.services.prepared.require(prepared.prepared_id);
    const payload = record.payload as unknown as { op: Record<string, string> };
    // Another nonce in the stored operation, the digest left as it was.
    await rig.relay.services.state.set("prepared", record.id, { ...(rig.relay.services.state.get("prepared", record.id) as object), payload: { ...payload, op: { ...payload.op, nonce: "7" } } } as never);
    const result = failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) }));
    assert.equal(result.code, "internal");
    assert.equal(tap.count({ rpc: SEND }), 0);
  });

  harness.it("an operation outside the policy is refused even if its digest is consistent and the owner signs it", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch });
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const alice = owner(mock, 3);
    await deployOwner(mock, 3, { enableTrading: false });
    // A well-formed operation that approves the exchange's USDC.e allowance for an attacker.
    const attacker = getAddress(`0x${"ba".repeat(20)}`);
    const forged = await buildOp({
      chain,
      owner: alice,
      sponsored: false,
      sequence: 1n,
      calls: [{ target: USDC_E_ADDRESS, data: `0x095ea7b3${attacker.slice(2).toLowerCase().padStart(64, "0")}${"f".repeat(64)}` }],
    });
    const record = await rig.relay.services.prepared.create({
      kind: "userop",
      owner: alice.address,
      account: deriveAccount(alice.address),
      digest: forged.hash,
      digestForm: "userOpHash",
      payload: { v: 1, action: "enable_trading", op: { ...packedToJson(forged.unsigned as never) }, userOpHash: forged.hash, sponsored: false, deploys: false, nonce: forged.op.nonce.toString(), extension: null },
    });
    const result = failed(await rig.post("/v1/userop/submit", { prepared_id: record.id, signature: await alice.sign({ hash: forged.hash }) }));
    assert.equal(result.code, "internal");
    assert.equal(tap.count({ rpc: SEND }), 0);
    assert.equal(await chain.publicClient.readContract({ address: USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "allowance", args: [deriveAccount(alice.address), attacker] }), 0n);
  });
});

const proofLost = { on: false };

describe("the deployment proof is read again at submit", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("a userop for a deployed account is refused (precondition_failed, nothing sent, item still usable) when the proof of deployment cannot be read at submit", async (mock) => {
    mock.setProfile("optimistic");
    proofLost.on = false;
    const tapped = tappedFetch(mock, (call) => {
      if (!proofLost.on) return { action: "forward" };
      // The explorer and the node both fail once the proof is gone.
      return call.host === "explorer-mainnet.xo.market" || (call.rpc !== undefined && call.rpc.startsWith("eth_") && !call.rpc.includes("UserOperation")) ? { action: "status", status: 503 } : { action: "forward" };
    });
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch: tapped.fetch });
    await deployOwner(mock, 3, { enableTrading: true });
    const alice = owner(mock, 3);
    const revoke = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "revoke_trading", params: {} }));
    proofLost.on = true;
    const refused = failed(await rig.post("/v1/userop/submit", { prepared_id: revoke.prepared_id, signature: await signPrepared(alice, revoke.sign) }));
    proofLost.on = false;
    assert.equal(refused.code, "precondition_failed");
    assert.equal(tapped.tap.count({ rpc: SEND }), 0);
    assert.equal(rig.relay.services.prepared.require(revoke.prepared_id).state, "prepared");
  });
});

const noExplorerFlag = { on: false };

describe("an unclear send is never sent again, and is settled by the hash and then by the nonce", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  async function rigWith(mock: MockXo, decide: (call: TappedCall) => TapAction) {
    mock.setProfile("optimistic");
    const tapped = tappedFetch(mock, decide);
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch: tapped.fetch });
    return { rig, tap: tapped.tap };
  }

  harness.it("the answer is lost but the operation landed: the hash on the explorer settles it, as 'submitted', with no second send", async (mock) => {
    const { rig, tap } = await rigWith(mock, (call) => (call.rpc === SEND ? { action: "forward_then_fail" } : { action: "forward" }));
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    const result = ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) }));
    assert.equal(result.state, "submitted");
    assert.match(result.detail ?? "", /found on chain/);
    assert.ok(isKernelProxyRuntime(await codeAt(mock, deriveAccount(alice.address))));
    assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).state, "accepted");
    assert.equal((await statusOf(rig, prepared.user_op_hash)).state, "included");
    assert.equal(tap.count({ rpc: SEND }), 1);
  });

  harness.it("an unclear send is settled by the explorer alone when the bundler cannot give a receipt, and by the bundler alone when the explorer is down", async (mock) => {
    // Receipts unavailable: the explorer's log by hash is enough.
    const noReceipts = await rigWith(mock, (call) => (call.rpc === SEND ? { action: "forward_then_fail" } : call.rpc === "eth_getUserOperationReceipt" ? { action: "fail" } : { action: "forward" }));
    const alice = owner(mock, 3);
    const first = await prepareDeploy(noReceipts.rig, 3);
    assert.equal(ok(await noReceipts.rig.post("/v1/userop/submit", { prepared_id: first.prepared_id, signature: await signPrepared(alice, first.sign) })).state, "submitted");
    assert.ok(noReceipts.tap.count({ rpc: "eth_getUserOperationReceipt" }) <= 1, "the receipt was tried at most once and the explorer's log was enough");
    // Explorer down: the bundler's receipt is enough (the nonce check needs a complete explorer read and is not reached).
    const bob = owner(mock, 4);
    const noExplorer = await startRig(mock, {
      env: { ENABLE_USEROP_SUBMIT: "1" },
      fetch: tappedFetch(mock, (call) => {
        // The explorer goes away at the moment of the send.
        if (call.rpc === SEND) {
          noExplorerFlag.on = true;
          return { action: "forward_then_fail" };
        }
        return call.host === "explorer-mainnet.xo.market" && noExplorerFlag.on ? { action: "status", status: 503 } : { action: "forward" };
      }).fetch,
    });
    const second = ok(await noExplorer.post("/v1/userop/prepare", { owner: bob.address, action: "deploy_enable_trading", params: {} }));
    const result = ok(await noExplorer.post("/v1/userop/submit", { prepared_id: second.prepared_id, signature: await signPrepared(bob, second.sign) }));
    noExplorerFlag.on = false;
    assert.equal(result.state, "submitted");
    assert.match(result.detail ?? "", /found on chain/);
  });

  harness.it("a gateway error after the send is ambiguous too, and resolves the same way", async (mock) => {
    const { rig, tap } = await rigWith(mock, (call) => (call.rpc === SEND ? { action: "forward_then_status", status: 502 } : { action: "forward" }));
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    const result = ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) }));
    assert.equal(result.state, "submitted");
    assert.equal(tap.count({ rpc: SEND }), 1);
  });

  harness.it("a bundler 503 that carries Cloudflare headers after the send is ambiguous, not 'rejected', and resolves from the chain", async (mock) => {
    const { rig, tap } = await rigWith(mock, (call) => (call.rpc === SEND ? { action: "forward_then_status", status: 503, headers: { server: "cloudflare", "content-type": "text/html" } } : { action: "forward" }));
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    const result = ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) }));
    assert.equal(result.state, "submitted");
    assert.equal(tap.count({ rpc: SEND }), 1);
  });

  harness.it("a send that left no trace is 'ambiguous': the item is spent, the account is blocked, and nothing is ever resent", async (mock) => {
    const { rig, tap } = await rigWith(mock, (call) => (call.rpc === SEND ? { action: "fail" } : { action: "forward" }));
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    const signature = await signPrepared(alice, prepared.sign);
    const result = ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature }));
    assert.equal(result.state, "ambiguous");
    assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).state, "ambiguous");
    // The same item cannot be sent again, by submit or by anything else.
    assert.equal(failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature })).code, "prepared_used");
    for (let poll = 0; poll < 4; poll += 1) assert.equal((await statusOf(rig, prepared.user_op_hash)).state, "ambiguous");
    assert.equal(tap.count({ rpc: SEND }), 1, "exactly one send, however often it is asked about");
    // A new operation for the account waits for this one to be settled.
    const blocked = failed(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "deploy_enable_trading", params: {} }));
    assert.equal(blocked.code, "ambiguous");
    assert.equal((blocked.details as { user_op_hash: string }).user_op_hash, prepared.user_op_hash);
  });

  harness.it("if the lost operation lands later on its own, the status finds it by its hash and the account is free again", async (mock) => {
    const { rig, tap } = await rigWith(mock, (call) => (call.rpc === SEND ? { action: "fail" } : { action: "forward" }));
    const alice = owner(mock, 3);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const prepared = await prepareDeploy(rig, 3);
    const signature = await signPrepared(alice, prepared.sign);
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature })).state, "ambiguous");
    // The bundler had it after all: it is included by someone else's handleOps call.
    const signed = { ...storedOp(rig, prepared.prepared_id), signature };
    assert.equal((await chain.handleOps([signed as never])).ok, true);
    assert.equal((await statusOf(rig, prepared.user_op_hash)).state, "included");
    assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).state, "accepted");
    assert.equal(tap.count({ rpc: SEND }), 1);
    // And the account can be used again.
    assert.equal(ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "enable_trading", params: {} })).kind, "userop");
  });

  harness.it("if another operation used the nonce, it is 'rejected' - but only after the explorer has had time to index ours", async (mock) => {
    const { rig, tap } = await rigWith(mock, (call) => (call.rpc === SEND ? { action: "fail" } : { action: "forward" }));
    const alice = owner(mock, 3);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const prepared = await prepareDeploy(rig, 3);
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) })).state, "ambiguous");
    // A different operation takes the account's first nonce (the app deployed it, say).
    await deployOwner(mock, 3, { enableTrading: true });
    assert.equal((await statusOf(rig, prepared.user_op_hash)).state, "ambiguous", "too early to say the nonce was used by someone else");
    mock.clock.advanceMs(SUPERSEDE_AFTER_MS + 1_000);
    const settled = await statusOf(rig, prepared.user_op_hash);
    assert.equal(settled.state, "rejected");
    assert.match(settled.detail ?? "", /nonce/);
    assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).state, "rejected");
    assert.equal(tap.count({ rpc: SEND }), 1);
    // The account is free again.
    assert.equal(ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "enable_trading", params: {} })).kind, "userop");
  });

  harness.it("while an operation is unsettled the on-chain revoke can still be prepared, with a warning that both share one nonce", async (mock) => {
    const { rig } = await rigWith(mock, (call) => (call.rpc === SEND ? { action: "fail" } : { action: "forward" }));
    const alice = owner(mock, 3);
    await deployOwner(mock, 3, { enableTrading: true });
    const prepared = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "enable_trading", params: {} }));
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) })).state, "ambiguous");
    assert.equal(failed(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "enable_trading", params: {} })).code, "ambiguous");
    const revoke = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "revoke_trading", params: {} }));
    assert.ok(revoke.warnings.some((line) => line.includes("unknown outcome") && line.includes("same nonce slot")));
    assert.equal(storedOp(rig, revoke.prepared_id).nonce, storedOp(rig, prepared.prepared_id).nonce);
  });

  harness.it("an unsettled operation stops blocking the account after an hour", async (mock) => {
    const { rig } = await rigWith(mock, (call) => (call.rpc === SEND ? { action: "fail" } : { action: "forward" }));
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) })).state, "ambiguous");
    assert.equal(failed(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "deploy_enable_trading", params: {} })).code, "ambiguous");
    mock.clock.advanceMs(3_600_000 + 1_000);
    // Nothing on chain, nonce unchanged: the new item uses the same nonce, so at most one of the two can ever land.
    assert.equal(ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "deploy_enable_trading", params: {} })).kind, "userop");
  });

  harness.it("after a restart an item that was mid-send is ambiguous, not resent, and still settled by the chain", async (mock) => {
    mock.setProfile("optimistic");
    const tapped = tappedFetch(mock);
    const alice = owner(mock, 3);
    const first = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch: tapped.fetch });
    const prepared = await prepareDeploy(first, 3);
    // Simulate a crash after the marker and before the result: the item is 'sending' on disk.
    await first.relay.services.prepared.beginSend(prepared.prepared_id);
    await first.relay.abandon();
    const second = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" }, fetch: tapped.fetch, dir: { dir: first.dir, cleanup: async () => undefined } });
    assert.equal(second.relay.recovered.interruptedSends, 1);
    assert.equal(second.relay.services.prepared.require(prepared.prepared_id).state, "ambiguous");
    assert.equal(failed(await second.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) })).code, "prepared_used");
    assert.equal(tapped.tap.count({ rpc: SEND }), 0, "the relay never sends an item it found in 'sending'");
    // The operation reached the bundler before the crash: it lands.
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const signature = await signPrepared(alice, prepared.sign);
    assert.equal((await chain.handleOps([{ ...storedOp(second, prepared.prepared_id), signature } as never])).ok, true);
    assert.equal((await statusOf(second, prepared.user_op_hash)).state, "included");
  });

  harness.it("an unreachable bundler is detected before the item is spent; the same item works once it is back", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_USEROP_SUBMIT: "1" } });
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    mock.setSwitch("rpc.access", "down");
    const down = failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) }));
    assert.ok(["upstream_rejected", "capability_unknown"].includes(down.code), down.code);
    assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).state, "prepared", "not spent");
    mock.setSwitch("rpc.access", "open");
    mock.clock.advanceMs(40_000);
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) })).state, "submitted");
  });
});

describe("a flag flips only through the environment AND a recorded fact or the operator's arming (A11)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("the flag in the environment alone is not enough: prepare is a dry run and submit says flag_off, until the operator arms it", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(mock);
    const env = { ENABLE_USEROP_SUBMIT: "1", RELAY_ENFORCE_FLAG_FACTS: "1" };
    const first = await startRig(mock, { env, fetch });
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(first, 3);
    assert.ok(prepared.warnings.some((line) => line.startsWith("DRY RUN")));
    assert.equal(failed(await first.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) })).code, "flag_off");
    assert.equal(tap.count({ rpc: SEND }), 0);
    await first.stop();

    // Armed for this run (the live test T1 itself): it works, and the relay records what it saw.
    const armed = await startRig(mock, { env: { ...env, RELAY_ARM: "ENABLE_USEROP_SUBMIT" }, fetch, dir: { dir: first.dir, cleanup: async () => undefined } });
    const again = await prepareDeploy(armed, 3);
    assert.ok(!again.warnings.some((line) => line.startsWith("DRY RUN")));
    assert.equal(ok(await armed.post("/v1/userop/submit", { prepared_id: again.prepared_id, signature: await signPrepared(alice, again.sign) })).state, "submitted");
    assert.equal((await statusOf(armed, again.user_op_hash)).state, "included");
    assert.equal(armed.relay.services.capabilities.state("T1"), "yes");
    await armed.stop();

    // Restarted WITHOUT the arming: the recorded result (T1) is what keeps the flag effective.
    const plain = await startRig(mock, { env, fetch, dir: { dir: first.dir, cleanup: async () => undefined } });
    const next = ok(await plain.post("/v1/userop/prepare", { owner: alice.address, action: "enable_trading", params: { allowance_usd: "5" } }));
    assert.ok(!next.warnings.some((line) => line.startsWith("DRY RUN")));
    assert.equal(ok(await plain.post("/v1/userop/submit", { prepared_id: next.prepared_id, signature: await signPrepared(alice, next.sign) })).state, "submitted");
  });

  harness.it("a T1 that failed (recorded as no) does not lift the gate: an operator's no stays until the operator says otherwise", async (mock) => {
    mock.setProfile("optimistic");
    const env = { ENABLE_USEROP_SUBMIT: "1", RELAY_ENFORCE_FLAG_FACTS: "1" };
    const rig = await startRig(mock, { env });
    await rig.relay.services.capabilities.record({ id: "T1", state: "no", source: "operator", note: "the live test was rejected" });
    const alice = owner(mock, 3);
    const prepared = await prepareDeploy(rig, 3);
    assert.equal(failed(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign) })).code, "flag_off");
  });

  harness.it("ENABLE_FUNDING follows the same rule: off in the gate until T1 is recorded", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_FUNDING: "1", RELAY_ENFORCE_FLAG_FACTS: "1" } });
    await deployOwner(mock, 3, { enableTrading: true });
    const alice = owner(mock, 3);
    assert.equal(failed(await rig.post("/v1/funding/check", { owner: alice.address, amount: "1" })).code, "flag_off");
    await rig.relay.services.capabilities.record({ id: "T1", state: "yes", source: "operator", note: "recorded by the operator" });
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "1" })).permitted, true);
  });
});
