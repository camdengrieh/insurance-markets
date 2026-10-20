import assert from "node:assert/strict";
import { describe } from "node:test";

import { deriveAccount } from "../src/xo/account/derive.js";
import { isErrorCode } from "../src/relay/errors.js";
import { OPTIMISTIC_PROFILE, PESSIMISTIC_PROFILE, type MockSwitchName } from "./mock-xo/switches.js";
import type { MockXo } from "./mock-xo/server.js";
import { deployOwner, useMock } from "./mock-xo/testing.js";
import { sendFunding, USD } from "./relay-funding-helpers.js";
import { ok, startRig, tappedFetch } from "./relay-userops-helpers.js";

// The funding flow under both mock profiles and under every switch that can touch it, one at a time. Whatever the
// switches say: the cap is never exceeded, nothing is written to Base or the bundler by the relay, the reservation
// is spent exactly when a recognised transfer exists, a delivery or a credit is only claimed when the mock really
// did it, and every state is one the contract names.

const STATES = new Set(["reported", "dispatched", "delivered", "credited", "dispatched_not_delivered", "delivered_not_credited", "failed", "unknown"]);

interface FundingRun {
  readonly check: string;
  readonly first: string;
  readonly later: string;
  readonly final: string;
}

async function standardFunding(mock: MockXo): Promise<FundingRun> {
  const { fetch, tap } = tappedFetch(mock);
  const rig = await startRig(mock, { env: { ENABLE_FUNDING: "1" }, fetch });
  await deployOwner(mock, 3, { enableTrading: true });
  const alice = mock.chains.xo?.owner(3);
  assert.ok(alice !== undefined);
  const account = deriveAccount(alice.address);
  const ledger = rig.relay.services.ledger;

  const check = await rig.post("/v1/funding/check", { owner: alice.address, amount: "2" });
  if (!check.ok) return { check: check.error.code, first: "-", later: "-", final: "-" };
  if (!check.data.permitted || check.data.funding_id === null) return { check: `denied:${check.data.reasons.map((reason) => reason.code).join(",")}`, first: "-", later: "-", final: "-" };
  const fundingId = check.data.funding_id;
  const sent = await sendFunding(mock, alice.address, 2n * USD);
  const first = await rig.post("/v1/funding/report", { owner: alice.address, funding_id: fundingId, tx_hash: sent.hash });
  await mock.advance(40);
  const later = await rig.post("/v1/funding/report", { owner: alice.address, funding_id: fundingId, tx_hash: sent.hash });
  await mock.advance(700);
  const final = await rig.post("/v1/funding/report", { owner: alice.address, funding_id: fundingId, tx_hash: sent.hash });
  const run: FundingRun = {
    check: "permitted",
    first: first.ok ? first.data.state : first.error.code,
    later: later.ok ? later.data.state : later.error.code,
    final: final.ok ? final.data.state : final.error.code,
  };

  // Invariants.
  for (const state of [run.first, run.later, run.final]) assert.ok(STATES.has(state) || isErrorCode(state), `an unnamed state: ${state}`);
  const usage = await ledger.usageDetail(account.toLowerCase(), ledger.currentDay());
  assert.ok(usage.fundedLifetimeAtomic <= 10n * USD, "the lifetime cap holds");
  assert.equal(usage.spentAtomic, 0n, "funding never touches the spending counter");
  const writes = tap.calls.filter((call) => call.rpc !== undefined && /^eth_(send|sign)|^personal_/.test(call.rpc));
  assert.deepEqual(writes, [], "the relay never writes to any chain");
  assert.equal(tap.calls.filter((call) => call.host === "mainnet-bundler.xo.market").length, 0);
  const message = mock.hyperlane.messages[0];
  assert.ok(message !== undefined);
  const recognised = run.final !== "failed" && run.final !== "reported";
  assert.equal(ledger.reservation(fundingId)?.state, recognised ? "committed" : "reserved", "spent exactly when a recognised transfer exists");
  if (rig.relay.services.capabilities.state("FU7") === "yes") assert.equal(message.state, "delivered", "delivery is only claimed when the message was delivered");
  if (rig.relay.services.capabilities.state("FU6") === "yes") {
    assert.equal(run.final, "credited");
    assert.equal((mock.state.peekAccount(account)?.balanceMicro ?? 0n) >= 2n * USD, true, "credit is only claimed when the orderbook credited it");
  }
  if (run.final === "credited") assert.equal(message.state, "delivered");
  if (run.final === "dispatched_not_delivered") assert.notEqual(message.state, "delivered");
  return run;
}

describe("both profiles, end to end", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("optimistic: dispatched, delivered and credited, and the facts are recorded", async (mock) => {
    mock.setProfile("optimistic");
    const run = await standardFunding(mock);
    assert.deepEqual(run, { check: "permitted", first: "dispatched", later: "credited", final: "credited" });
  });

  harness.it("pessimistic: the node is down and the registry never registers: funding is permitted on the logs alone, then delivered and never credited", async (mock) => {
    mock.setProfile("pessimistic");
    const run = await standardFunding(mock);
    assert.deepEqual(run, { check: "permitted", first: "dispatched", later: "delivered", final: "delivered_not_credited" });
  });
});

describe("each switch flipped alone, from the pessimistic profile and from the optimistic one", () => {
  const harness = useMock({ chains: { xo: true, base: true } });
  const flips: Array<[MockSwitchName, string]> = [
    ["funding.credit", "not-credited"],
    ["funding.credit", "delayed-5min"],
    ["funding.credit", "credited-after-sweep-only"],
    ["funding.credit", "credited"],
    ["rpc.access", "down"],
    ["rpc.access", "requires-key"],
    ["rpc.access", "open"],
    ["registry.trigger", "never"],
    ["registry.trigger", "on-deploy"],
    ["registry.trigger", "on-enable-trading"],
    ["registry.trigger", "on-l1-create"],
    ["bundler.foreign_account", "reject"],
    ["bundler.foreign_account", "accept"],
    ["paymaster.state", "paused"],
    ["paymaster.state", "sponsor"],
    ["withdraw.paymasterless", "accept-and-deliver"],
    ["withdraw.paymasterless", "reject"],
  ];
  for (const base of ["pessimistic", "optimistic"] as const) {
    for (const [name, value] of flips) {
      if ((base === "pessimistic" ? PESSIMISTIC_PROFILE : OPTIMISTIC_PROFILE)[name] === value) continue;
      harness.it(`${base} with ${name} = ${value}`, async (mock) => {
        mock.setProfile(base);
        mock.setSwitch(name, value as never);
        const run = await standardFunding(mock);
        // Funding is never refused because of switches that do not touch it.
        if (name === "bundler.foreign_account" || name === "paymaster.state" || name === "withdraw.paymasterless") assert.equal(run.check, "permitted");
        // The credit rule decides the end state, and nothing else does.
        if (name === "funding.credit" && base === "optimistic") {
          const expected = { "not-credited": "delivered_not_credited", "delayed-5min": "credited", "credited-after-sweep-only": "delivered_not_credited", credited: "credited" } as Record<string, string>;
          assert.equal(run.final, expected[value], `final state for ${value}`);
        }
      });
    }
  }

  harness.it("the credit comes late: in every mode the same funding recovers when the orderbook finally credits it", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("funding.credit", "credited-after-sweep-only");
    const rig = await startRig(mock, { env: { ENABLE_FUNDING: "1" } });
    await deployOwner(mock, 3, { enableTrading: true });
    const alice = mock.chains.xo?.owner(3);
    assert.ok(alice !== undefined);
    const check = ok(await rig.post("/v1/funding/check", { owner: alice.address, amount: "2" }));
    const sent = await sendFunding(mock, alice.address, 2n * USD);
    ok(await rig.post("/v1/funding/report", { owner: alice.address, funding_id: check.funding_id as string, tx_hash: sent.hash }));
    await mock.advance(700);
    assert.equal(ok(await rig.post("/v1/funding/report", { owner: alice.address, funding_id: check.funding_id as string, tx_hash: sent.hash })).state, "delivered_not_credited");
    await mock.hyperlane.sweep(deriveAccount(alice.address));
    assert.equal(ok(await rig.post("/v1/funding/report", { owner: alice.address, funding_id: check.funding_id as string, tx_hash: sent.hash })).state, "credited");
  });
});
