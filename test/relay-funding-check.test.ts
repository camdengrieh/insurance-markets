import assert from "node:assert/strict";
import { describe } from "node:test";

import { pad, toEventSelector, getAbiItem, type Hex } from "viem";

import { WARP_ROUTER_ABI } from "../src/xo/chain/abi.js";
import { XO_WARP_ROUTE } from "../src/xo/chain/constants.js";
import { deriveAccount } from "../src/xo/account/derive.js";
import { padRecipient } from "../src/xo/funding/calldata.js";
import { FUNDING_RESERVATION_TTL_S, MAX_OPEN_FUNDINGS, SWEEP_BUDGET, sweepFundings } from "../relay/funding.js";
import type { RelayContext } from "../relay/types.js";
import { seededRandom } from "./fixtures/userop/prng.js";
import type { MockXo } from "./mock-xo/server.js";
import { deployOwner, useMock } from "./mock-xo/testing.js";
import { USD, usd } from "./relay-funding-helpers.js";
import { failed, ok, startRig, turn, type Rig } from "./relay-userops-helpers.js";

// POST /v1/funding/check: the money brake in front of the two Base proposals. Positive proof of deployment,
// the test-amount cap until the deposit leg has been seen to work, the lifetime total until the exit is proven,
// a separate counter, idempotence, and nothing lost across a restart.

const RECEIVED_TRANSFER_REMOTE_TOPIC = toEventSelector(getAbiItem({ abi: WARP_ROUTER_ABI, name: "ReceivedTransferRemote" }));

function owner(mock: MockXo, index: number) {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  return chain.owner(index);
}

async function funded(mock: MockXo, env: Record<string, string> = {}): Promise<{ rig: Rig; alice: ReturnType<typeof owner>; account: Hex }> {
  mock.setProfile("optimistic");
  const rig = await startRig(mock, { env: { ENABLE_FUNDING: "1", ...env } });
  await deployOwner(mock, 3, { enableTrading: true });
  const alice = owner(mock, 3);
  return { rig, alice, account: deriveAccount(alice.address) };
}

function contextOf(rig: Rig): RelayContext {
  return { flags: rig.relay.flags, now: () => rig.mock.clock.nowMs(), requestId: "test", signal: new AbortController().signal, services: rig.relay.services };
}

async function fundedLifetime(rig: Rig, account: Hex): Promise<bigint> {
  return (await rig.relay.services.ledger.usageDetail(account.toLowerCase(), rig.relay.services.ledger.currentDay())).fundedLifetimeAtomic;
}

describe("a funding is allowed only for an account that is provably deployed", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("ENABLE_FUNDING is off by default, and the kill switch refuses it", async (mock) => {
    mock.setProfile("optimistic");
    const off = await startRig(mock);
    await deployOwner(mock, 3, { enableTrading: true });
    const result = failed(await off.post("/v1/funding/check", { owner: owner(mock, 3).address, amount: "1" }));
    assert.equal(result.code, "flag_off");
    const killed = await startRig(mock, { env: { ENABLE_FUNDING: "1", KILL: "1" } });
    assert.equal(failed(await killed.post("/v1/funding/check", { owner: owner(mock, 3).address, amount: "1" })).code, "kill_switch");
    assert.equal(await fundedLifetime(off, deriveAccount(owner(mock, 3).address)), 0n);
  });

  harness.it("an undeployed account is refused with the reason, nothing is reserved and no record is kept", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_FUNDING: "1" } });
    const alice = owner(mock, 3);
    const result = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2" }));
    assert.equal(result.permitted, false);
    assert.equal(result.state, "undeployed");
    assert.equal(result.funding_id, null);
    assert.equal(result.reserved_usd, "0");
    assert.equal(result.expires_at, null);
    assert.deepEqual(result.reasons.map((reason) => reason.code), ["undeployed"]);
    assert.match(result.reasons[0]?.message ?? "", /deploy_enable_trading/);
    assert.equal(result.account, deriveAccount(alice.address));
    assert.equal(await fundedLifetime(rig, deriveAccount(alice.address)), 0n);
    assert.deepEqual(rig.relay.services.state.keys("funding"), []);
  });

  harness.it("an unreadable deployment is refused as an error, every time; failing reads never add up to a yes", async (mock) => {
    const { rig, alice } = await funded(mock);
    // Neither the explorer's logs nor the node's code can be read.
    mock.injectFault("5xx", { listeners: ["explorer"] });
    mock.setSwitch("rpc.access", "down");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = failed(await rig.post("/v1/funding/check", { owner: alice.address, amount: "1" }));
      assert.equal(result.code, "precondition_failed");
      assert.equal((result.details as { reason: string }).reason, "deployment_unproven");
    }
    assert.equal(await fundedLifetime(rig, deriveAccount(alice.address)), 0n);
  });

  harness.it("either kind of positive proof is enough: the node's eth_getCode when the explorer is down, the logs when the node is", async (mock) => {
    const { rig, alice } = await funded(mock);
    mock.injectFault("5xx", { listeners: ["explorer"] });
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "1" })).permitted, true, "the exact Kernel proxy code on the account");
    mock.faults.clear();
    // The explorer's circuit breaker opened after five failures in a row; it lets a probe through after 30 seconds.
    mock.clock.advanceMs(31_000);
    mock.setSwitch("rpc.access", "down");
    // The breaker lets ONE probe through, and the two log reads run side by side: the first look after the outage can
    // still say "unproven" (as an error, never as a yes) while the probe is in flight; once it has finished the breaker
    // is closed and the next look succeeds.
    let result = await rig.post("/v1/funding/check", { owner: alice.address, amount: "1.5" });
    for (let attempt = 0; attempt < 4 && !result.ok; attempt += 1) {
      assert.equal(result.error.code, "precondition_failed");
      await turn();
      result = await rig.post("/v1/funding/check", { owner: alice.address, amount: "1.5" });
    }
    assert.equal(ok(result).permitted, true, "AccountDeployed and OwnerRegistered logs");
  });

  harness.it("a negative is never enough for a yes: an undeployed account stays undeployed however often it is read", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { env: { ENABLE_FUNDING: "1" } });
    const alice = owner(mock, 3);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "1" }));
      assert.equal(result.permitted, false);
      assert.equal(result.state, "undeployed");
    }
  });

  harness.it("a deployed account is permitted: the amount is reserved, with an id, an expiry and what is left", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    const result = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2" }));
    assert.equal(result.permitted, true);
    assert.equal(result.account, account);
    assert.equal(result.state, "registered");
    assert.equal(result.reserved_usd, "2");
    assert.match(result.funding_id ?? "", /^[0-9a-f]{32}$/);
    assert.equal(Date.parse(result.expires_at ?? "") - mock.clock.nowMs() <= FUNDING_RESERVATION_TTL_S * 1000, true);
    assert.equal(result.funding_remaining_usd, "8");
    assert.deepEqual(result.reasons, []);
    assert.equal(await fundedLifetime(rig, account), 2n * USD);
    // The funding counter is not the spending counter.
    const usage = await rig.relay.services.ledger.usageDetail(account.toLowerCase(), rig.relay.services.ledger.currentDay());
    assert.equal(usage.spentAtomic, 0n);
    assert.equal(usage.fundedAtomic, 2n * USD);
  });

  harness.it("a deployed account the orderbook does not know can be funded, and the answer says trading stays blocked", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("registry.trigger", "never");
    const rig = await startRig(mock, { env: { ENABLE_FUNDING: "1" } });
    await deployOwner(mock, 3, { enableTrading: true });
    const result = ok(await rig.post("/v1/funding/check", { owner: owner(mock, 3).address, amount: "1" }));
    assert.equal(result.permitted, true);
    assert.equal(result.state, "deployed_unregistered");
    assert.deepEqual(result.reasons.map((reason) => reason.code), ["not_registered"]);
  });

  harness.it("the relay derives the account: a caller's different account, or the owner EOA, is account_mismatch", async (mock) => {
    const { rig, alice } = await funded(mock);
    const bob = owner(mock, 4);
    assert.equal(failed(await rig.post("/v1/funding/check", { owner: alice.address, account: deriveAccount(bob.address), amount: "1" })).code, "account_mismatch");
    assert.equal(failed(await rig.post("/v1/funding/check", { owner: alice.address, account: alice.address, amount: "1" })).code, "account_mismatch");
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, account: deriveAccount(alice.address), amount: "1" })).permitted, true);
    assert.equal(failed(await rig.post("/v1/funding/check", { owner: `0x${"00".repeat(20)}` as Hex, amount: "1" })).code, "invalid_request");
  });
});

describe("the amount policy and the caps", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("above the test amount is refused until delivery (FU7) and credit (FU6) were both seen", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    const refused = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "3.000001" }));
    assert.equal(refused.permitted, false);
    assert.deepEqual(refused.reasons.map((reason) => reason.code), ["above_test_amount"]);
    assert.equal(refused.funding_id, null);
    assert.equal(await fundedLifetime(rig, account), 0n);
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "3" })).permitted, true, "the test amount itself is allowed");
    // One of the two facts is not enough.
    await rig.relay.services.capabilities.record({ id: "FU7", state: "yes", source: "operator" });
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "4" })).permitted, false);
    await rig.relay.services.capabilities.record({ id: "FU6", state: "yes", source: "operator" });
    const lifted = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "4" }));
    assert.equal(lifted.permitted, true);
    assert.equal(lifted.reserved_usd, "4");
  });

  harness.it("zero and above the $50 ceiling are refused with their own reasons", async (mock) => {
    const { rig, alice } = await funded(mock);
    assert.deepEqual(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "0" })).reasons.map((reason) => reason.code), ["invalid_amount"]);
    assert.deepEqual(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "50.000001" })).reasons.map((reason) => reason.code), ["above_ceiling"]);
  });

  harness.it("the total is capped at $10 until the exit is proven (D3), the cap says what is left, and then it stops", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    await rig.relay.services.capabilities.record({ id: "FU7", state: "yes", source: "operator" });
    await rig.relay.services.capabilities.record({ id: "FU6", state: "yes", source: "operator" });
    const amounts = ["5", "4.5"];
    for (const amount of amounts) assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount })).permitted, true, amount);
    assert.equal(await fundedLifetime(rig, account), 9_500_000n);
    const over = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "1" }));
    assert.equal(over.permitted, false);
    assert.deepEqual(over.reasons.map((reason) => reason.code), ["total_funding_cap"]);
    assert.match(over.reasons[0]?.message ?? "", /0\.5 USDC is left/);
    assert.equal(over.funding_remaining_usd, "0.5");
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "0.5" })).permitted, true);
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "0.01" })).permitted, false);
    assert.equal(await fundedLifetime(rig, account), 10n * USD);
  });

  harness.it("with delivery, credit AND the exit proven, the total cap lifts and a separate $50 per day applies", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    for (const id of ["FU7", "FU6", "FU9"]) await rig.relay.services.capabilities.record({ id, state: "yes", source: "operator" });
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "30" })).permitted, true);
    const second = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "30.5" }));
    assert.equal(second.permitted, false);
    assert.deepEqual(second.reasons.map((reason) => reason.code), ["daily_funding_cap"]);
    assert.equal(second.funding_remaining_usd, "20");
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "20" })).permitted, true);
    // The spending counter was never touched.
    assert.equal((await rig.relay.services.ledger.usageDetail(account.toLowerCase(), rig.relay.services.ledger.currentDay())).spentAtomic, 0n);
    // Tomorrow is a new day for the daily cap.
    mock.clock.advanceMs(24 * 3_600_000);
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "30" })).permitted, true);
  });

  harness.it("property: parallel checks with seeded amounts never reserve more than the cap, and every answer matches the ledger", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    await rig.relay.services.capabilities.record({ id: "FU7", state: "yes", source: "operator" });
    await rig.relay.services.capabilities.record({ id: "FU6", state: "yes", source: "operator" });
    const random = seededRandom(20261019);
    const amounts = Array.from({ length: 14 }, () => BigInt(500_000 + random.below(2_500_000)));
    const unique = [...new Set(amounts.map(String))].map(BigInt);
    const results = await Promise.all(unique.map((amount) => rig.post("/v1/funding/check", { owner: alice.address, amount: usd(amount) })));
    let granted = 0n;
    for (const [index, result] of results.entries()) {
      const data = ok(result);
      if (data.permitted) granted += unique[index] as bigint;
      assert.equal(data.permitted, data.funding_id !== null);
    }
    assert.ok(granted <= 10n * USD, `granted ${granted}`);
    assert.equal(await fundedLifetime(rig, account), granted);
    assert.ok(granted > 0n);
  });
});

describe("idempotence: the plugin asks once per proposal", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("the same account and amount while the reservation is open return the same funding_id and reserve nothing more", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    const first = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2" }));
    const second = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2" }));
    const third = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2" }));
    assert.equal(second.funding_id, first.funding_id);
    assert.equal(third.funding_id, first.funding_id);
    assert.equal(second.expires_at, first.expires_at);
    assert.equal(await fundedLifetime(rig, account), 2n * USD);
    const other = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "1" }));
    assert.notEqual(other.funding_id, first.funding_id);
    assert.equal(await fundedLifetime(rig, account), 3n * USD);
  });

  harness.it("a funding_id is a fresh 128-bit id every time", async (mock) => {
    const { rig, alice } = await funded(mock);
    const ids = new Set<string>();
    for (const amount of ["0.1", "0.2", "0.3", "0.4", "0.5", "0.6"]) ids.add(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount })).funding_id as string);
    assert.equal(ids.size, 6);
  });

  harness.it("an expired open reservation is not reused: a new check reserves anew", async (mock) => {
    const { rig, alice } = await funded(mock);
    const first = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2" }));
    mock.clock.advanceMs(FUNDING_RESERVATION_TTL_S * 1000 + 1000);
    const second = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2" }));
    assert.notEqual(second.funding_id, first.funding_id);
  });

  harness.it("caps and open reservations survive a restart of the relay, a clean one and a crash", async (mock) => {
    mock.setProfile("optimistic");
    const first = await startRig(mock, { env: { ENABLE_FUNDING: "1" } });
    await deployOwner(mock, 3, { enableTrading: true });
    const alice = owner(mock, 3);
    const account = deriveAccount(alice.address);
    const a = ok(await first.post("/v1/funding/check", { owner: alice.address, amount: "3" }));
    await first.relay.abandon();
    const second = await startRig(mock, { env: { ENABLE_FUNDING: "1" }, dir: { dir: first.dir, cleanup: async () => undefined } });
    assert.equal(await fundedLifetime(second, account), 3n * USD);
    assert.equal(ok(await second.post("/v1/funding/check", { owner: alice.address, amount: "3" })).funding_id, a.funding_id, "the open reservation is still the same one");
    assert.equal(ok(await second.post("/v1/funding/check", { owner: alice.address, amount: "2.5" })).permitted, true);
    await second.stop();
    const third = await startRig(mock, { env: { ENABLE_FUNDING: "1" }, dir: { dir: first.dir, cleanup: async () => undefined } });
    assert.equal(await fundedLifetime(third, account), 5_500_000n);
    // The remaining $4.50 still cannot be exceeded by a fresh start.
    await third.relay.services.capabilities.record({ id: "FU7", state: "yes", source: "operator" });
    await third.relay.services.capabilities.record({ id: "FU6", state: "yes", source: "operator" });
    assert.equal(ok(await third.post("/v1/funding/check", { owner: alice.address, amount: "4.6" })).permitted, false);
    assert.equal(ok(await third.post("/v1/funding/check", { owner: alice.address, amount: "4.5" })).permitted, true);
  });
});

describe("a reservation that was never reported is given back only on evidence", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("not before its expiry plus ten minutes, and only when a complete read of the XO route shows no such transfer", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    const check = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "3" }));
    const ledger = rig.relay.services.ledger;
    const reservation = (): string | undefined => ledger.reservation(check.funding_id as string)?.state;
    const context = contextOf(rig);

    // Expired but inside the grace: the transfer could still be in flight. Nothing is released.
    mock.clock.advanceMs(FUNDING_RESERVATION_TTL_S * 1000 + 1000);
    assert.deepEqual((await sweepFundings(context)).released, []);
    assert.equal(reservation(), "reserved");
    assert.equal(await fundedLifetime(rig, account), 3n * USD);

    // A matching delivery is on the XO route: the money DID move, so it stays counted.
    mock.clock.advanceMs(11 * 60_000);
    mock.explorer.syntheticLogs.push({
      address: XO_WARP_ROUTE,
      topics: [RECEIVED_TRANSFER_REMOTE_TOPIC, pad("0x2105", { size: 32 }), padRecipient(account)],
      data: pad(`0x${(3n * USD).toString(16)}`, { size: 32 }),
      blockNumber: 1,
      logIndex: 0,
      transactionHash: `0x${"ee".repeat(32)}`,
      timestamp: Math.floor(mock.clock.nowMs() / 1000) - 600,
    });
    const present = await sweepFundings(context);
    assert.deepEqual(present.released, []);
    assert.deepEqual(present.present, [check.funding_id]);
    assert.equal(await fundedLifetime(rig, account), 3n * USD);

    // Remove the delivery: now nothing shows, and the reservation goes back.
    mock.explorer.syntheticLogs.length = 0;
    const gone = await sweepFundings(context);
    assert.deepEqual(gone.released, [check.funding_id]);
    assert.equal(reservation(), "released");
    assert.equal(await fundedLifetime(rig, account), 0n);
    // A fresh check can use the room again.
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "3" })).permitted, true);
  });

  harness.it("an unreadable explorer gives nothing back (unknown stays reserved)", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "3" }));
    mock.clock.advanceMs((FUNDING_RESERVATION_TTL_S + 11 * 60) * 1000);
    mock.injectFault("5xx", { listeners: ["explorer"] });
    assert.deepEqual((await sweepFundings(contextOf(rig))).released, []);
    assert.equal(await fundedLifetime(rig, account), 3n * USD);
  });

  harness.it("a truncated read of the XO route is not a verdict: when the explorer's page is full and cannot be completed, nothing is released", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "3" }));
    mock.clock.advanceMs((FUNDING_RESERVATION_TTL_S + 11 * 60) * 1000);
    // An explorer that always answers with a full page of other deliveries to this recipient, in one block.
    const rows = Array.from({ length: 1000 }, (_, index) => ({
      address: XO_WARP_ROUTE,
      topics: [RECEIVED_TRANSFER_REMOTE_TOPIC, pad("0x2105", { size: 32 }), padRecipient(account)],
      data: pad("0x01", { size: 32 }),
      blockNumber: "0x5",
      logIndex: `0x${index.toString(16)}`,
      transactionHash: `0x${(index + 1).toString(16).padStart(64, "0")}`,
      timeStamp: String(Math.floor(mock.clock.nowMs() / 1000) - 600),
    }));
    const full = {
      async request() {
        return { status: 200, ok: true, headers: {}, body: JSON.stringify({ status: "1", message: "OK", result: rows }), host: "explorer-mainnet.xo.market", durationMs: 0 };
      },
      json: (response: { readonly body: string }) => JSON.parse(response.body) as unknown,
      health: () => ({}),
      hostState: () => "ok" as const,
      hosts: () => [],
      clearLatch: () => undefined,
    };
    const context = { ...contextOf(rig), services: { ...rig.relay.services, upstream: full } } as unknown as RelayContext;
    assert.deepEqual((await sweepFundings(context)).released, []);
    assert.equal(await fundedLifetime(rig, account), 3n * USD);
  });

  harness.it("a funding that is bound to a transaction is never released, even if its reservation was left uncommitted", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    const check = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "3" }));
    const state = rig.relay.services.state;
    const stored = state.get("funding", check.funding_id as string) as unknown as Record<string, unknown>;
    // The transfer was followed, but recording the commit failed: the money did leave the owner's wallet.
    await state.set("funding", check.funding_id as string, { ...stored, state: "dispatched_not_delivered", txHash: `0x${"ab".repeat(32)}`, committed: false } as never);
    mock.clock.advanceMs((FUNDING_RESERVATION_TTL_S + 11 * 60) * 1000);
    assert.deepEqual((await sweepFundings(contextOf(rig))).released, []);
    assert.equal(await fundedLifetime(rig, account), 3n * USD);
  });

  harness.it("a plain release never works, and a funding the relay did not make is not its to release", async (mock) => {
    const { rig, alice } = await funded(mock);
    const check = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "3" }));
    await assert.rejects(rig.relay.services.ledger.release(check.funding_id as string), /evidence/);
    const orders = await rig.relay.services.ledger.reserveFor({ kind: "spend", account: deriveAccount(alice.address).toLowerCase(), day: rig.relay.services.ledger.currentDay(), amountAtomic: 5n * USD, limitAtomic: 50n * USD, category: "order", expiresAtMs: mock.clock.nowMs() + 1000 });
    assert.equal(orders.reserved, true);
    mock.clock.advanceMs(20_000);
    const swept = await sweepFundings(contextOf(rig));
    assert.ok(!swept.released.includes(orders.reserved ? orders.reservationId : ""), "an order reservation is left to the order module");
  });
});

describe("a loop of checks cannot pin the cap or make every call slow", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("at most five open unreported fundings per account; the sixth is refused with its own reason", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    for (let index = 1; index <= MAX_OPEN_FUNDINGS; index += 1) assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: `0.${index}` })).permitted, true);
    const sixth = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "0.6" }));
    assert.equal(sixth.permitted, false);
    assert.deepEqual(sixth.reasons.map((reason) => reason.code), ["funding_open_limit"]);
    assert.equal(await fundedLifetime(rig, account), 1_500_000n, "nothing more was reserved");
    // The same amount as an open one is still the same funding, and is not counted against the limit.
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "0.3" })).permitted, true);
    // Once they lapse and are given back, the account can ask again.
    mock.clock.advanceMs((FUNDING_RESERVATION_TTL_S + 11 * 60) * 1000);
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "0.6" })).permitted, true);
  });

  harness.it("a sweep reads the XO route for at most five abandoned reservations per call; the rest wait for the next", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    const ids: string[] = [];
    for (let round = 0; round < 2; round += 1) {
      for (let index = 1; index <= MAX_OPEN_FUNDINGS; index += 1) {
        ids.push(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: `0.${round}${index}` })).funding_id as string);
      }
      mock.clock.advanceMs((FUNDING_RESERVATION_TTL_S + 1) * 1000);
    }
    mock.clock.advanceMs(11 * 60_000);
    const context = contextOf(rig);
    const first = await sweepFundings(context);
    assert.equal(first.released.length, SWEEP_BUDGET);
    assert.equal(first.unknown.length, ids.length - SWEEP_BUDGET);
    const second = await sweepFundings(context);
    assert.equal(second.released.length, ids.length - SWEEP_BUDGET);
    assert.equal(await fundedLifetime(rig, account), 0n);
  });

  harness.it("finished fundings older than ninety days are forgotten; unfinished ones never are", async (mock) => {
    const { rig, alice } = await funded(mock);
    const done = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "1" }));
    const state = rig.relay.services.state;
    const stored = state.get("funding", done.funding_id as string) as unknown as Record<string, unknown>;
    // One old credited funding, one old unfinished (stuck) funding.
    await state.set("funding", "a".repeat(32), { ...stored, id: "a".repeat(32), state: "credited", createdAtMs: mock.clock.nowMs() - 100 * 86_400_000, expiresAtMs: mock.clock.nowMs() - 100 * 86_400_000 } as never);
    await state.set("funding", "b".repeat(32), { ...stored, id: "b".repeat(32), state: "delivered_not_credited", txHash: `0x${"cd".repeat(32)}`, committed: true, createdAtMs: mock.clock.nowMs() - 100 * 86_400_000, expiresAtMs: mock.clock.nowMs() - 100 * 86_400_000 } as never);
    mock.clock.advanceMs(1000);
    ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "1.5" }));
    assert.deepEqual(state.keys("funding").includes("a".repeat(32)), false);
    assert.deepEqual(state.keys("funding").includes("b".repeat(32)), true);
  });
});

describe("one transfer proposal per reservation (a funding is not repeated by calling again)", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("once the transfer step is marked, no further check for the account is permitted, whatever the amount", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    const first = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2" }));
    const second = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2" }));
    assert.equal(second.funding_id, first.funding_id);
    const marked = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2", step: "transfer" }));
    assert.equal(marked.permitted, true);
    assert.equal(marked.funding_id, first.funding_id);
    // A caller who forgot the tx_hash and asks again gets nothing, for the same amount or another.
    for (const amount of ["2", "1"]) {
      const again = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount }));
      assert.equal(again.permitted, false, amount);
      assert.equal(again.funding_id, null);
      assert.ok(again.reasons.some((reason) => reason.code === "funding_transfer_issued"), amount);
    }
    // A second transfer proposal on the same reservation is refused too.
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2", step: "transfer" })).permitted, false);
    assert.equal(await fundedLifetime(rig, account), 2n * USD, "nothing more was reserved");
  });

  harness.it("a transfer step with no open reservation for that amount reserves nothing and is refused", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    const refused = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2", step: "transfer" }));
    assert.equal(refused.permitted, false);
    assert.ok(refused.reasons.some((reason) => reason.code === "funding_not_open"));
    assert.equal(await fundedLifetime(rig, account), 0n);
    ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2" }));
    const wrongAmount = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "1", step: "transfer" }));
    assert.equal(wrongAmount.permitted, false);
    assert.equal(await fundedLifetime(rig, account), 2n * USD);
  });

  harness.it("the block lifts when the reservation lapses", async (mock) => {
    const { rig, alice } = await funded(mock);
    ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2" }));
    ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2", step: "transfer" }));
    mock.clock.advanceMs(FUNDING_RESERVATION_TTL_S * 1000 + 1000);
    assert.equal(ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2" })).permitted, true);
  });
});
