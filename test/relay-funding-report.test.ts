import assert from "node:assert/strict";
import { describe } from "node:test";

import type { Hex } from "viem";

import { deriveAccount } from "../src/xo/account/derive.js";
import { BASE_WARP_ROUTER } from "../src/xo/chain/constants.js";
import { padRecipient } from "../src/xo/funding/calldata.js";
import { followOpenFundings } from "../relay/funding.js";
import type { RelayContext } from "../relay/types.js";
import type { MockXo } from "./mock-xo/server.js";
import { deployOwner, useMock } from "./mock-xo/testing.js";
import { sendFunding, USD } from "./relay-funding-helpers.js";
import { failed, ok, startRig, tappedFetch, turn, type Rig, type Tap } from "./relay-userops-helpers.js";

// POST /v1/funding/report: the Base transaction hash comes from the agent; the relay reads the receipt, finds the
// one transfer and the one DispatchId, and follows the message. It reports; it never sends, and it never advises
// a resend.

function owner(mock: MockXo, index: number) {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  return chain.owner(index);
}

interface Setup {
  readonly rig: Rig;
  readonly tap: Tap;
  readonly alice: ReturnType<typeof owner>;
  readonly account: Hex;
}

async function setup(mock: MockXo, options: { readonly credit?: "credited" | "not-credited" | "delayed-5min" | "credited-after-sweep-only"; readonly env?: Record<string, string> } = {}): Promise<Setup> {
  mock.setProfile("optimistic");
  mock.setSwitch("funding.credit", options.credit ?? "credited");
  const { fetch, tap } = tappedFetch(mock);
  const rig = await startRig(mock, { env: { ENABLE_FUNDING: "1", ...options.env }, fetch });
  await deployOwner(mock, 3, { enableTrading: true });
  const alice = owner(mock, 3);
  return { rig, tap, alice, account: deriveAccount(alice.address) };
}

async function report(s: Setup, fundingId: string, hash: Hex) {
  return s.rig.post("/v1/funding/report", { owner: s.alice.address, funding_id: fundingId, tx_hash: hash });
}

function reservationState(s: Setup, fundingId: string): string | undefined {
  return s.rig.relay.services.ledger.reservation(fundingId)?.state;
}

function neverSentAnything(tap: Tap): void {
  // The relay only ever reads Base and XO for a funding: no transaction, no signing, no POST to the orderbook.
  const writes = tap.calls.filter((call) => call.rpc !== undefined && /^eth_(send|sign)|^personal_/.test(call.rpc));
  assert.deepEqual(writes, []);
  assert.equal(tap.calls.filter((call) => call.host === "orderbooks.xo.market" && call.method !== "GET").length, 0);
  assert.equal(tap.calls.filter((call) => call.host === "mainnet-bundler.xo.market").length, 0, "funding never touches the bundler");
}

describe("following a funding from the Base hash to the credit", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("dispatched, then credited: the message id is the receipt's, the reservation is spent, delivery and credit become facts", async (mock) => {
    const s = await setup(mock);
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const fundingId = check.funding_id as string;
    assert.equal(reservationState(s, fundingId), "reserved");
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    assert.equal(sent.status, "success");

    const first = ok(await report(s, fundingId, sent.hash));
    assert.equal(first.state, "dispatched");
    assert.equal(first.message_id, sent.messageId);
    assert.equal(reservationState(s, fundingId), "committed", "the money left the owner's Base wallet");
    assert.equal(s.rig.relay.services.capabilities.state("FU7"), "unknown", "not delivered yet");

    await mock.advance(40);
    const second = ok(await report(s, fundingId, sent.hash));
    assert.equal(second.state, "credited");
    assert.equal(second.message_id, sent.messageId);
    assert.equal(s.rig.relay.services.capabilities.state("FU7"), "yes");
    assert.equal(s.rig.relay.services.capabilities.state("FU6"), "yes");
    assert.equal(s.rig.relay.services.capabilities.fact("FU6")?.source, "probe");
    neverSentAnything(s.tap);

    // Reporting again changes nothing. Credited never goes backwards.
    assert.equal(ok(await report(s, fundingId, sent.hash)).state, "credited");
    // FS-3: what the relay saw by itself (source "probe") does not lift the per-funding test amount; the operator's
    // record of the deposit test (the live-test kit writes T3a) does. The lifetime total of $10 stays until the exit is proven.
    const probeOnly = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "5" }));
    assert.equal(probeOnly.permitted, false);
    assert.deepEqual(probeOnly.reasons.map((reason) => reason.code), ["above_test_amount", "lift_needs_operator_fact"]);
    await s.rig.relay.services.capabilities.record({ id: "T3a", state: "yes", source: "operator", note: "live-test kit" });
    assert.equal(ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "5" })).permitted, true);
    assert.equal(ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "5" })).funding_id !== null, true);
    assert.equal(ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "5.5" })).permitted, false, "2 + 5 + 5.5 is above the $10 total");
  });

  harness.it("a credited funding never goes backwards, even when the Base node or the orderbook cannot be read afterwards", async (mock) => {
    const s = await setup(mock);
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const fundingId = check.funding_id as string;
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    ok(await report(s, fundingId, sent.hash));
    await mock.advance(40);
    assert.equal(ok(await report(s, fundingId, sent.hash)).state, "credited");
    // The Base node fails: no receipt can be read, and the answer is still 'credited'.
    mock.injectFault("5xx", { listeners: ["baseRpc"] });
    assert.equal(ok(await report(s, fundingId, sent.hash)).state, "credited");
    mock.faults.clear();
    mock.clock.advanceMs(31_000);
    // The orderbook fails: the credit cannot be re-measured, and the answer is still 'credited'.
    mock.injectFault("5xx", { listeners: ["orderbook"] });
    assert.equal(ok(await report(s, fundingId, sent.hash)).state, "credited");
  });

  harness.it("a funding must be reported with the owner it belongs to; the funding_id of another owner is not usable", async (mock) => {
    const s = await setup(mock);
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    const other = owner(mock, 4);
    const wrong = failed(await s.rig.post("/v1/funding/report", { owner: other.address, funding_id: check.funding_id as string, tx_hash: sent.hash }));
    assert.equal(wrong.code, "owner_mismatch");
    assert.equal(failed(await s.rig.post("/v1/funding/report", { owner: s.alice.address, funding_id: "0".repeat(32), tx_hash: sent.hash })).code, "not_found");
    assert.equal(failed(await s.rig.post("/v1/funding/report", { owner: s.alice.address, account: deriveAccount(other.address), funding_id: check.funding_id as string, tx_hash: sent.hash })).code, "account_mismatch");
    assert.equal(reservationState(s, check.funding_id as string), "reserved", "nothing happened to the reservation");
  });

  harness.it("a funding follows one transaction: a second, different hash is refused once the first is recognised", async (mock) => {
    const s = await setup(mock);
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const fundingId = check.funding_id as string;
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    assert.equal(ok(await report(s, fundingId, sent.hash)).state, "dispatched");
    const again = await sendFunding(mock, s.alice.address, 2n * USD);
    const refused = failed(await report(s, fundingId, again.hash));
    assert.equal(refused.code, "precondition_failed");
    assert.equal((refused.details as { reason: string }).reason, "different_transaction");
    // The one it follows is unaffected.
    assert.equal(ok(await report(s, fundingId, sent.hash)).message_id, sent.messageId);
  });

  harness.it("while a funding is followed, a new check for the account is refused: one funding at a time", async (mock) => {
    const s = await setup(mock);
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    ok(await report(s, check.funding_id as string, sent.hash));
    const blocked = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "1" }));
    assert.equal(blocked.permitted, false);
    assert.deepEqual(blocked.reasons.map((reason) => reason.code), ["funding_in_flight"]);
    // Even the same amount does not return the old id once the old one is spoken for.
    assert.equal(ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" })).permitted, false);
    await mock.advance(40);
    assert.equal(ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "1" })).permitted, true, "after the credit the account can be funded again");
  });
});

describe("funding.credit: what the orderbook does with USDC.e minted straight to the account (FU6)", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("not-credited: delivered, then 'delivered_not_credited' after ten minutes, FU6 recorded as no, the account blocked, nothing resent", async (mock) => {
    const s = await setup(mock, { credit: "not-credited" });
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const fundingId = check.funding_id as string;
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    assert.equal(ok(await report(s, fundingId, sent.hash)).state, "dispatched");
    await mock.advance(40);
    const delivered = ok(await report(s, fundingId, sent.hash));
    assert.equal(delivered.state, "delivered");
    assert.match(delivered.detail ?? "", /has not risen yet/);
    assert.equal(s.rig.relay.services.capabilities.state("FU7"), "yes", "delivery was seen");
    assert.equal(s.rig.relay.services.capabilities.state("FU6"), "unknown", "credit cannot be judged inside ten minutes");
    // A block while it is still within the window.
    assert.deepEqual(ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "1" })).reasons.map((reason) => reason.code), ["funding_in_flight"]);

    await mock.advance(600);
    const stuck = ok(await report(s, fundingId, sent.hash));
    assert.equal(stuck.state, "delivered_not_credited");
    assert.match(stuck.detail ?? "", /Do not send again/);
    assert.equal(s.rig.relay.services.capabilities.state("FU6"), "no");
    const blocked = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "1" }));
    assert.deepEqual(blocked.reasons.map((reason) => reason.code), ["funding_stuck"]);
    assert.equal(reservationState(s, fundingId), "committed", "stuck money stays counted");
    neverSentAnything(s.tap);
  });

  harness.it("delayed-5min: delivered first, credited five minutes later, and the block lifts", async (mock) => {
    const s = await setup(mock, { credit: "delayed-5min" });
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    ok(await report(s, check.funding_id as string, sent.hash));
    await mock.advance(100);
    assert.equal(ok(await report(s, check.funding_id as string, sent.hash)).state, "delivered");
    await mock.advance(280);
    assert.equal(ok(await report(s, check.funding_id as string, sent.hash)).state, "credited");
    assert.equal(s.rig.relay.services.capabilities.state("FU6"), "yes");
  });

  harness.it("credited-after-sweep-only: stuck at ten minutes, then credited when XO's sweeper runs - the same funding recovers, still no resend", async (mock) => {
    const s = await setup(mock, { credit: "credited-after-sweep-only" });
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const fundingId = check.funding_id as string;
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    ok(await report(s, fundingId, sent.hash));
    await mock.advance(700);
    assert.equal(ok(await report(s, fundingId, sent.hash)).state, "delivered_not_credited");
    assert.equal(s.rig.relay.services.capabilities.state("FU6"), "no");
    await mock.hyperlane.sweep(s.account);
    assert.equal(ok(await report(s, fundingId, sent.hash)).state, "credited", "a late credit is still seen");
    assert.equal(s.rig.relay.services.capabilities.state("FU6"), "yes", "the later observation replaces the earlier one");
    assert.equal(ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "1" })).permitted, true);
    neverSentAnything(s.tap);
  });

  harness.it("an account the orderbook does not know is minted to but never credited: the same stuck state, not a guess", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("registry.trigger", "never");
    const { fetch, tap } = tappedFetch(mock);
    const rig = await startRig(mock, { env: { ENABLE_FUNDING: "1" }, fetch });
    await deployOwner(mock, 3, { enableTrading: true });
    const s: Setup = { rig, tap, alice: owner(mock, 3), account: deriveAccount(owner(mock, 3).address) };
    const check = ok(await rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    assert.equal(check.state, "deployed_unregistered");
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    ok(await report(s, check.funding_id as string, sent.hash));
    await mock.advance(700);
    assert.equal(ok(await report(s, check.funding_id as string, sent.hash)).state, "delivered_not_credited");
  });
});

describe("a message that does not arrive", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("dispatched_not_delivered after ten minutes: pending, the account is blocked, nothing is resent, the money stays counted", async (mock) => {
    const s = await setup(mock);
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const fundingId = check.funding_id as string;
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    mock.scheduler.clear();
    assert.equal(ok(await report(s, fundingId, sent.hash)).state, "dispatched");
    await mock.advance(300);
    const waiting = ok(await report(s, fundingId, sent.hash));
    assert.equal(waiting.state, "dispatched");
    assert.equal(ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "1" })).reasons[0]?.code, "funding_in_flight");
    await mock.advance(400);
    const stuck = ok(await report(s, fundingId, sent.hash));
    assert.equal(stuck.state, "dispatched_not_delivered");
    assert.match(stuck.detail ?? "", /do not send again/);
    assert.equal(stuck.message_id, sent.messageId);
    assert.equal(ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "1" })).reasons[0]?.code, "funding_stuck");
    assert.equal(reservationState(s, fundingId), "committed");
    assert.equal(s.rig.relay.services.capabilities.state("FU7"), "unknown", "no delivery was ever seen");
    neverSentAnything(s.tap);
    // The relay's own maintenance loop keeps looking and does not change its mind without evidence.
    assert.equal(await followOpenFundings(contextOf(s.rig)), 1);
    assert.equal(ok(await report(s, fundingId, sent.hash)).state, "dispatched_not_delivered");
  });
});

describe("a hash that is not the funding", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("a transaction that reverted on Base: 'failed', nothing was sent, the reservation is NOT spent, and the right hash can still be reported", async (mock) => {
    const s = await setup(mock);
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const fundingId = check.funding_id as string;
    // A non-zero msg.value makes the router revert.
    const reverted = await sendFunding(mock, s.alice.address, 2n * USD, { value: 1n });
    assert.equal(reverted.status, "reverted");
    const result = ok(await report(s, fundingId, reverted.hash));
    assert.equal(result.state, "failed");
    assert.match(result.detail ?? "", /reverted/);
    assert.equal(reservationState(s, fundingId), "reserved");
    assert.equal(s.rig.relay.services.capabilities.state("FU7"), "unknown");
    const good = await sendFunding(mock, s.alice.address, 2n * USD);
    const followed = ok(await report(s, fundingId, good.hash));
    assert.equal(followed.state, "dispatched");
    assert.equal(followed.message_id, good.messageId);
    assert.equal(reservationState(s, fundingId), "committed");
  });

  harness.it("a reverted transaction frees its reservation once the funding has expired (the receipt is the evidence)", async (mock) => {
    const s = await setup(mock);
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "3" }));
    const fundingId = check.funding_id as string;
    const reverted = await sendFunding(mock, s.alice.address, 3n * USD, { value: 1n });
    assert.equal(ok(await report(s, fundingId, reverted.hash)).state, "failed");
    const ledger = s.rig.relay.services.ledger;
    assert.equal((await ledger.usageDetail(s.account.toLowerCase(), ledger.currentDay())).fundedLifetimeAtomic, 3n * USD, "held until it expires");
    mock.clock.advanceMs(31 * 60_000);
    // The next check sweeps first.
    ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "1" }));
    assert.equal(reservationState(s, fundingId), "released");
    assert.equal((await ledger.usageDetail(s.account.toLowerCase(), ledger.currentDay())).fundedLifetimeAtomic, 1n * USD);
  });

  harness.it("a transfer of another amount, to another account, or no transfer at all, is 'failed' (unrecognised) and spends nothing", async (mock) => {
    const s = await setup(mock);
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const fundingId = check.funding_id as string;
    const wrongAmount = await sendFunding(mock, s.alice.address, 1n * USD);
    const wrongRecipient = await sendFunding(mock, s.alice.address, 2n * USD, { recipient: padRecipient(deriveAccount(owner(mock, 5).address)) });
    // An approval is a transaction too, but not a transfer.
    mock.hyperlane.setBaseBalance(s.alice.address, 10n * USD);
    const approval = await mock.hyperlane.baseApprove(s.alice.address, BASE_WARP_ROUTER, 2n * USD);
    for (const hash of [wrongAmount.hash, wrongRecipient.hash, approval.transactionHash]) {
      const result = ok(await report(s, fundingId, hash));
      assert.equal(result.state, "failed", hash);
      assert.match(result.detail ?? "", /not exactly one transferRemote/);
      assert.equal(result.message_id, undefined);
    }
    assert.equal(reservationState(s, fundingId), "reserved");
    assert.equal(s.rig.relay.services.capabilities.state("FU7"), "unknown");
  });

  harness.it("a transfer to this account that someone else sent is not the funding: it binds nothing and records no fact", async (mock) => {
    const s = await setup(mock);
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const fundingId = check.funding_id as string;
    // Another wallet sends exactly the right transfer to Alice's account.
    const stranger = owner(mock, 6);
    const gift = await sendFunding(mock, stranger.address, 2n * USD, { recipient: padRecipient(s.account) });
    assert.equal(gift.status, "success");
    const result = ok(await report(s, fundingId, gift.hash));
    assert.equal(result.state, "failed");
    assert.match(result.detail ?? "", /owner's own wallet/);
    assert.equal(reservationState(s, fundingId), "reserved");
    await mock.advance(40);
    assert.equal(s.rig.relay.services.capabilities.state("FU7"), "unknown");
    assert.equal(s.rig.relay.services.capabilities.state("FU6"), "unknown");
    // Her own transfer is followed as usual afterwards.
    const mine = await sendFunding(mock, s.alice.address, 2n * USD);
    assert.equal(ok(await report(s, fundingId, mine.hash)).state, "dispatched");
  });

  harness.it("a hash already bound to another funding cannot be bound again: no second commit, no fact changed, no stuck account", async (mock) => {
    const s = await setup(mock);
    const first = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    ok(await report(s, first.funding_id as string, sent.hash));
    await mock.advance(40);
    assert.equal(ok(await report(s, first.funding_id as string, sent.hash)).state, "credited");
    const second = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    assert.equal(second.permitted, true);
    const replay = failed(await report(s, second.funding_id as string, sent.hash));
    assert.equal(replay.code, "precondition_failed");
    assert.equal((replay.details as { reason: string }).reason, "hash_already_bound");
    assert.equal(reservationState(s, second.funding_id as string), "reserved", "nothing was spent by the replay");
    await mock.advance(700);
    assert.equal(s.rig.relay.services.capabilities.state("FU6"), "yes", "a replay cannot downgrade a proven fact");
    assert.equal(ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "1" })).permitted, true, "the account is not stuck");
  });

  harness.it("a transfer sent before the funding was checked is not that funding", async (mock) => {
    const s = await setup(mock);
    const old = await sendFunding(mock, s.alice.address, 2n * USD);
    assert.equal(old.status, "success");
    await mock.advance(300);
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const result = ok(await report(s, check.funding_id as string, old.hash));
    assert.equal(result.state, "failed");
    assert.match(result.detail ?? "", /before this funding was checked/);
    assert.equal(reservationState(s, check.funding_id as string), "reserved");
    await mock.advance(40);
    assert.equal(s.rig.relay.services.capabilities.state("FU7"), "unknown", "no fact is learned from a transfer that is not this funding");
    assert.equal(s.rig.relay.services.capabilities.state("FU6"), "unknown");
    const fresh = await sendFunding(mock, s.alice.address, 2n * USD);
    assert.equal(ok(await report(s, check.funding_id as string, fresh.hash)).state, "dispatched");
  });

  harness.it("a receipt that does not say who sent it cannot be a funding either", async (mock) => {
    mock.setProfile("optimistic");
    const { fetch, tap } = tappedFetch(
      mock,
      undefined,
      (call, text) => {
        if (call.rpc !== "eth_getTransactionReceipt") return undefined;
        const body = JSON.parse(text) as { result?: Record<string, unknown> | null };
        if (body.result !== null && body.result !== undefined) delete body.result["from"];
        return JSON.stringify(body);
      },
    );
    const rig = await startRig(mock, { env: { ENABLE_FUNDING: "1" }, fetch });
    await deployOwner(mock, 3, { enableTrading: true });
    const s: Setup = { rig, tap, alice: owner(mock, 3), account: deriveAccount(owner(mock, 3).address) };
    const check = ok(await rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    const result = ok(await report(s, check.funding_id as string, sent.hash));
    assert.equal(result.state, "failed");
    assert.equal(reservationState(s, check.funding_id as string), "reserved");
  });

  harness.it("a hash the Base node does not know yet is 'reported': the funding stays in flight and a later report finds it", async (mock) => {
    const s = await setup(mock);
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const fundingId = check.funding_id as string;
    const unknown = `0x${"7a".repeat(32)}` as Hex;
    const early = ok(await report(s, fundingId, unknown));
    assert.equal(early.state, "reported");
    assert.match(early.detail ?? "", /no receipt yet/);
    assert.deepEqual(ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "1" })).reasons.map((reason) => reason.code), ["funding_in_flight"]);
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    assert.equal(ok(await report(s, fundingId, sent.hash)).state, "dispatched");
  });

  harness.it("a Base node that fails is not a verdict: the state stays 'reported' and says the node could not be read", async (mock) => {
    const s = await setup(mock);
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    mock.injectFault("5xx", { listeners: ["baseRpc"] });
    const result = ok(await report(s, check.funding_id as string, sent.hash));
    assert.equal(result.state, "reported");
    assert.equal(reservationState(s, check.funding_id as string), "reserved");
    mock.faults.clear();
    mock.clock.advanceMs(31_000);
    let after = await report(s, check.funding_id as string, sent.hash);
    // A request abandoned mid-flight may still hold the breaker's single probe slot for a moment.
    for (let attempt = 0; attempt < 4 && (!after.ok || after.data.state === "reported"); attempt += 1) {
      await turn();
      after = await report(s, check.funding_id as string, sent.hash);
    }
    assert.equal(ok(after).state, "dispatched");
  });
});

describe("delivery is read from the node when it answers and from the explorer when it does not", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  for (const access of ["down", "requires-key"] as const) {
    harness.it(`rpc.access = ${access}: ProcessId logs (positive proof only) and the orderbook balance still get it to credited`, async (mock) => {
      const s = await setup(mock);
      mock.setSwitch("rpc.access", access);
      const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
      const sent = await sendFunding(mock, s.alice.address, 2n * USD);
      assert.equal(ok(await report(s, check.funding_id as string, sent.hash)).state, "dispatched");
      await mock.advance(40);
      assert.equal(ok(await report(s, check.funding_id as string, sent.hash)).state, "credited");
    });
  }

  harness.it("the follow-up survives a restart: the record, the binding and the state are read back", async (mock) => {
    const s = await setup(mock);
    const check = ok(await s.rig.post("/v1/funding/check", { owner: s.alice.address, amount: "2" }));
    const sent = await sendFunding(mock, s.alice.address, 2n * USD);
    assert.equal(ok(await report(s, check.funding_id as string, sent.hash)).state, "dispatched");
    await s.rig.relay.abandon();
    const second = await startRig(mock, { env: { ENABLE_FUNDING: "1" }, dir: { dir: s.rig.dir, cleanup: async () => undefined } });
    await mock.advance(40);
    const again = ok(await second.post("/v1/funding/report", { owner: s.alice.address, funding_id: check.funding_id as string, tx_hash: sent.hash }));
    assert.equal(again.state, "credited");
    assert.equal(second.relay.services.ledger.reservation(check.funding_id as string)?.state, "committed");
    // The other hash is still refused: the binding survived.
    const other = await sendFunding(mock, s.alice.address, 2n * USD);
    assert.equal(failed(await second.post("/v1/funding/report", { owner: s.alice.address, funding_id: check.funding_id as string, tx_hash: other.hash })).code, "precondition_failed");
  });
});

function contextOf(rig: Rig): RelayContext {
  return { flags: rig.relay.flags, now: () => rig.mock.clock.nowMs(), requestId: "test", signal: new AbortController().signal, services: rig.relay.services };
}
