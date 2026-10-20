import assert from "node:assert/strict";
import { describe } from "node:test";

import { SEED_TOOL, TRACK_TOOL, SUBMIT_CREATE_TOOL, PREPARE_CREATE_TOOL } from "../../src/tools/create.js";
import { runUpkeep } from "../../relay/wiring.js";
import { useMock } from "../mock-xo/testing.js";
import { applyProfile, intentOf, type MatrixProfile } from "./helpers.js";
import { CREATE_TRANSPORTS, draftArgs, flowCreate, flowReview, flowSeed, readyCreator, signStep, startCreateStack } from "./create-rig.js";

// Invariant violations this suite found in code it does not own. Each test states the behaviour that SHOULD hold and is
// marked `todo`: it runs, its failure is reported as a todo and does not fail the run, and it starts passing (reported as a
// passing todo) when the owner fixes the code. The task result lists the same findings with their reproductions. A finding is
// deleted from here when it is fixed. (core-findings.test.ts holds the core ones F1 to F6; G-numbers are the creation ones.)

const OPTIMISTIC: MatrixProfile = { name: "optimistic", base: "optimistic" };

describe("open creation findings (todo until fixed)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("G1 an unreadable explorer is answered with a code that says so, not with `internal` (the code for a bug)", async (mock, t) => {
    t.todo("xo_track_market (owner) and xo_place_seed answer code `internal` when XO's explorer is down; an agent cannot tell an outage from a bug");
    applyProfile(mock, OPTIMISTIC);
    const cs = await startCreateStack({ mock, transport: CREATE_TRANSPORTS[0]! });
    const who = await readyCreator(cs);
    mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
    const run = await flowCreate(cs, who, 0);
    await flowReview(cs, run, 700);
    mock.injectFault("5xx", {});
    const list = await cs.call(TRACK_TOOL, { owner: who.owner });
    assert.notEqual(list.code, "internal", list.text.slice(0, 200));
    const seed = await cs.call(SEED_TOOL, { step: "prepare", owner: who.owner, condition_id: run.conditionId!, outcome: "yes", price: "0.5" });
    assert.notEqual(seed.code, "internal", seed.text.slice(0, 200));
  });

  harness.it("G2 a creation refused because an earlier operation is unsettled says to wait for that operation, not that 'the relay did not answer in time'", async (mock, t) => {
    t.todo("the refusal for an unsettled earlier operation carries the next_action of a timeout: 'The relay did not answer in time. Nothing was signed. A prepared item may exist...'");
    applyProfile(mock, OPTIMISTIC);
    const cs = await startCreateStack({ mock, transport: CREATE_TRANSPORTS[0]! });
    const who = await readyCreator(cs);
    const args = draftArgs(who.owner, 0);
    const file = await cs.call(PREPARE_CREATE_TOOL, args);
    const hosted = file.structured?.["metadata_file"] as { url: string; text: string };
    cs.extras.files.set(hosted.url, hosted.text);
    const prepare = await cs.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
    const item = await signStep(cs, who, prepare);
    cs.stack.history.wire.fault({ name: "connection never opens", match: (call) => call.kind === "bundler_send", times: 1, action: { action: "fail" } });
    const lost = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: item!.id, signature: item!.signature });
    assert.equal(lost.code, "ambiguous");
    const again = await cs.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
    assert.equal(again.code, "ambiguous");
    assert.match(String(again.structured?.["next_action"]), /xo_userop_status|settle|unsettled|earlier operation/i, `next_action: ${String(again.structured?.["next_action"])}`);
    assert.doesNotMatch(String(again.structured?.["next_action"]), /did not answer in time/i);
  });

  harness.it("G5 xo_place_seed refuses at prepare when the account has no stored XO credentials (it reserves $10.80 and hands out an intent today)", async (mock, t) => {
    t.todo("the refusal comes only at submit, after the owner has approved a signature, and the $10.80 stays reserved");
    applyProfile(mock, OPTIMISTIC);
    const cs = await startCreateStack({ mock, transport: CREATE_TRANSPORTS[0]! });
    const who = await readyCreator(cs, 0, { connect: false });
    mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
    const run = await flowCreate(cs, who, 0);
    await flowReview(cs, run, 700);
    const seed = await flowSeed(cs, who, run);
    assert.equal(intentOf(seed["prepare"]!), undefined, "no signing intent for an account the relay cannot sign for");
    assert.equal(cs.stack.relay.services.ledger.list().filter((entry) => entry.category === "seed" && entry.state !== "released").length, 0);
  });

  harness.it("G4 once XO has refused the seed's signature form, the next seed prepare is refused instead of reserving another $10.80 (seed variant of F6)", async (mock, t) => {
    t.todo("with order.sig_forms=eip191-only the relay offers the raw form every time; four doomed seeds hold $43.20 and the $50 day is gone");
    applyProfile(mock, { name: "optimistic/order.sig_forms=eip191-only", base: "optimistic", flip: { name: "order.sig_forms", value: "eip191-only" } });
    const cs = await startCreateStack({ mock, transport: CREATE_TRANSPORTS[0]! });
    const who = await readyCreator(cs);
    mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
    const run = await flowCreate(cs, who, 0);
    await flowReview(cs, run, 700);
    const first = await flowSeed(cs, who, run);
    assert.equal(first["submit"]?.code, "rejected");
    const second = await cs.call(SEED_TOOL, { step: "prepare", owner: who.owner, condition_id: run.conditionId!, outcome: "yes", price: "0.5", ttl_days: 7 });
    assert.equal(second.isError, true, "the same doomed form is not offered again");
    assert.equal(cs.stack.relay.services.ledger.list().filter((entry) => entry.category === "seed" && entry.state !== "released").length, 1);
  });
});

for (const transport of CREATE_TRANSPORTS) {
  describe(`creation fee reservations of expired items over ${transport.name}`, () => {
    const harness = useMock({ chains: { xo: true, base: false } });

    harness.it(`G7 the upkeep the ${transport.name} relay runs releases the $1 held for a creation that expired unsent`, async (mock) => {
      applyProfile(mock, OPTIMISTIC);
      const cs = await startCreateStack({ mock, transport });
      const who = await readyCreator(cs);
      const args = draftArgs(who.owner, 0);
      const file = await cs.call(PREPARE_CREATE_TOOL, args);
      const hosted = file.structured?.["metadata_file"] as { url: string; text: string };
      cs.extras.files.set(hosted.url, hosted.text);
      const prepared = await cs.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
      assert.equal(prepared.outcome, "prepared", prepared.text.slice(0, 200));
      const fees = () => cs.stack.relay.services.ledger.list().filter((entry) => entry.category === "creation_fee" && entry.state !== "released").length;
      assert.equal(fees(), 1);
      await mock.advance(400);
      // What the relay's own maintenance does: the same upkeep round (relay/wiring.ts runUpkeep) in both, on a timer in production.
      if (cs.extras.maintain !== undefined) await cs.extras.maintain();
      else {
        const { services, flags } = cs.stack.relay;
        await runUpkeep({ flags, now: () => mock.clock.nowMs(), requestId: "req_test_upkeep", signal: new AbortController().signal, services }, []);
      }
      assert.equal(fees(), 0, "an item that expired unsent gives its fee back to the day");
    });
  });
}
