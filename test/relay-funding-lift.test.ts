import assert from "node:assert/strict";
import { describe } from "node:test";

import { type Hex } from "viem";

import { deriveAccount } from "../src/xo/account/derive.js";
import { deployOwner, useMock } from "./mock-xo/testing.js";
import type { MockXo } from "./mock-xo/server.js";
import { ok, startRig, type Rig } from "./relay-userops-helpers.js";

// Review finding FS-3 (remainder): the funding test amount ($3) and the lifetime total ($10) are lifted only by a
// result the OPERATOR recorded (the live-test kit records T3a, or FU6 and FU7 by hand). FU6 and FU7 that the
// relay learned by itself from a transfer an agent reported (source "probe") never lift them alone.

function owner(mock: MockXo, index: number) {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  return chain.owner(index);
}

async function funded(mock: MockXo): Promise<{ rig: Rig; alice: ReturnType<typeof owner>; account: Hex }> {
  mock.setProfile("optimistic");
  const rig = await startRig(mock, { env: { ENABLE_FUNDING: "1" } });
  await deployOwner(mock, 3, { enableTrading: true });
  const alice = owner(mock, 3);
  return { rig, alice, account: deriveAccount(alice.address) };
}

const check = (rig: Rig, ownerAddress: Hex, amount: string) => rig.post("/v1/funding/check", { owner: ownerAddress, amount });

describe("lifting the funding test amount needs an operator-recorded fact (FS-3)", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("FU6 and FU7 learned by the relay's own probe do not lift the $3 test amount, and the refusal says what would", async (mock) => {
    const { rig, alice } = await funded(mock);
    const capabilities = rig.relay.services.capabilities;
    await capabilities.record({ id: "FU7", state: "yes", source: "probe", note: "seen delivered" });
    await capabilities.record({ id: "FU6", state: "yes", source: "probe", note: "seen credited" });
    assert.equal(capabilities.state("FU7"), "yes");
    const refused = ok(await check(rig, alice.address, "4"));
    assert.equal(refused.permitted, false);
    assert.deepEqual(refused.reasons.map((reason) => reason.code), ["above_test_amount", "lift_needs_operator_fact"]);
    assert.match(refused.reasons[1]?.message ?? "", /T3a|operator/);
    assert.equal(refused.funding_id, null);
    assert.equal(ok(await check(rig, alice.address, "3")).permitted, true, "the test amount itself is still fine");
  });

  harness.it("an operator-recorded T3a=yes with FU6 and FU7 seen lifts it, whoever saw FU6 and FU7", async (mock) => {
    const { rig, alice } = await funded(mock);
    const capabilities = rig.relay.services.capabilities;
    await capabilities.record({ id: "FU7", state: "yes", source: "probe" });
    await capabilities.record({ id: "FU6", state: "yes", source: "probe" });
    await capabilities.record({ id: "T3a", state: "yes", source: "operator", note: "live-test kit" });
    const lifted = ok(await check(rig, alice.address, "4"));
    assert.equal(lifted.permitted, true);
    assert.equal(lifted.reserved_usd, "4");
  });

  harness.it("operator-recorded FU6 and FU7 lift it without T3a", async (mock) => {
    const { rig, alice } = await funded(mock);
    const capabilities = rig.relay.services.capabilities;
    await capabilities.record({ id: "FU7", state: "yes", source: "operator" });
    await capabilities.record({ id: "FU6", state: "yes", source: "operator" });
    assert.equal(ok(await check(rig, alice.address, "4")).permitted, true);
  });

  harness.it("an operator T3a alone, without the delivery and credit being yes, lifts nothing; one operator fact and one probe fact do not either", async (mock) => {
    const { rig, alice } = await funded(mock);
    const capabilities = rig.relay.services.capabilities;
    await capabilities.record({ id: "T3a", state: "yes", source: "operator" });
    assert.equal(ok(await check(rig, alice.address, "4")).permitted, false);
    await capabilities.record({ id: "FU7", state: "yes", source: "operator" });
    await capabilities.record({ id: "FU6", state: "yes", source: "probe" });
    // T3a is operator-recorded, so FU6 learned by the probe counts under it
    assert.equal(ok(await check(rig, alice.address, "4")).permitted, true);
  });

  harness.it("a probe-learned FU6=no still blocks, whatever the operator recorded about T3a", async (mock) => {
    const { rig, alice } = await funded(mock);
    const capabilities = rig.relay.services.capabilities;
    await capabilities.record({ id: "FU7", state: "yes", source: "operator" });
    await capabilities.record({ id: "FU6", state: "no", source: "probe" });
    await capabilities.record({ id: "T3a", state: "yes", source: "operator" });
    assert.equal(ok(await check(rig, alice.address, "4")).permitted, false);
  });

  harness.it("the $10 lifetime total stays when delivery and credit are only probe-learned, even with the exit (FU9) recorded", async (mock) => {
    const { rig, alice, account } = await funded(mock);
    const capabilities = rig.relay.services.capabilities;
    // The ledger alone would lift the total here (FU6, FU7 and FU9 are all yes); this gate does not.
    await capabilities.record({ id: "FU7", state: "yes", source: "probe" });
    await capabilities.record({ id: "FU6", state: "yes", source: "probe" });
    await capabilities.record({ id: "FU9", state: "yes", source: "operator" });
    const verdicts: boolean[] = [];
    let last = ok(await check(rig, alice.address, "3"));
    for (const amount of ["3", "2.9", "2.8", "2.7"]) {
      last = ok(await check(rig, alice.address, amount));
      verdicts.push(last.permitted);
    }
    // 3 + 2.9 + 2.8 = 8.7 fits under $10; 2.7 more would make 11.4
    assert.deepEqual(verdicts, [true, true, true, false]);
    assert.deepEqual(last.reasons.map((reason) => reason.code), ["total_funding_cap"]);
    assert.equal(last.funding_remaining_usd, "1.3");
    assert.equal((await rig.relay.services.ledger.usageDetail(account.toLowerCase(), rig.relay.services.ledger.currentDay())).fundedLifetimeAtomic, 8_700_000n);
  });

  harness.it("the $10 lifetime total lifts when delivery, credit and the exit are all operator-recorded", async (mock) => {
    const { rig, alice } = await funded(mock);
    for (const id of ["FU7", "FU6", "FU9"]) await rig.relay.services.capabilities.record({ id, state: "yes", source: "operator" });
    const lifted = ok(await check(rig, alice.address, "30"));
    assert.equal(lifted.permitted, true);
    assert.equal(lifted.funding_remaining_usd, "20");
  });
});
