import assert from "node:assert/strict";
import { describe } from "node:test";

import { useMock } from "./mock-xo/testing.js";
import { failed, ok } from "./relay-userops-helpers.js";
import { HOSTED_URI, SECOND_URI, buildFile, createBody, createMarket, hostedText, ownerOf, readyOwner, startCreationRig, trackOf } from "./relay-creation-helpers.js";

// The creation lifecycle in both mock profiles (spec 5.5, D9): the pessimistic one is a wall that must fail with a coded,
// actionable error and hold nothing; the optimistic one is the whole journey. The reads that need no key (the explorer) work
// in both, so the review loop does too. The foreign-URI switch is the one the whole feature rests on (CR4, N8, T6).

const HOUR = 3600;

describe("both mock profiles", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("pessimistic: nothing is prepared on a guess, the error says what is unknown, and nothing stays reserved", async (mock) => {
    mock.setProfile("optimistic");
    await readyOwner(mock, 3);
    mock.setProfile("pessimistic");
    const rig = await startCreationRig(mock);
    const alice = ownerOf(mock, 3);
    const file = buildFile(mock);
    rig.files.set(HOSTED_URI, hostedText(file.metadata));
    // The XO node is down: neither canCall nor the fee can be read, and no earlier fee event exists.
    const refused = failed(await rig.post("/v1/userop/prepare", createBody(alice.address, file)));
    assert.equal(refused.code, "precondition_failed");
    assert.deepEqual((refused.details as { blockers: string[] }).blockers, ["fee_unknown"]);
    assert.equal(rig.relay.services.ledger.list({ state: "reserved" }).length, 0);
    assert.equal(rig.relay.services.prepared.list().length, 0);
    assert.equal(mock.creation.markets.size, 0, "nothing reached the chain");
  });

  harness.it("pessimistic after one market exists: the fee comes from the last fee event, the door is unread, and the item says what is unproven", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 3600 };
    await readyOwner(mock, 3);
    const rig = await startCreationRig(mock);
    const made = await createMarket(rig, 3);
    mock.setProfile("pessimistic");
    const other = buildFile(mock, { title: "Will Bitcoin's daily closing price on Coinbase be above $160,000 on December 31, 2026?", rules: made.file.metadata.rules.description.replaceAll("150,000", "160,000"), description: "Binary market on whether BTC-USD closes above $160,000 on Coinbase on the last day of 2026." });
    rig.files.set(SECOND_URI, hostedText(other.metadata));
    const prepared = ok(await rig.post("/v1/userop/prepare", createBody(made.alice.address, other, SECOND_URI)));
    assert.ok(prepared.warnings.some((line) => line.includes("fee comes from the latest fee event")));
    assert.ok(prepared.warnings.some((line) => line.includes("No paymaster is used")), "the unreadable paymaster is said, not assumed");
    assert.equal(prepared.capabilities["CR4"], "unknown");
    assert.equal(prepared.capabilities["T6"], "unknown");
    // Submitting is a different matter: the pessimistic bundler is down, so the relay refuses with nothing sent.
    const sent = await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: `0x${"11".repeat(32)}${"22".repeat(32)}1b` });
    assert.equal(sent.ok, false);
    // The explorer needs no key, so the review loop still works in this profile.
    const view = await trackOf(rig, made.conditionId);
    assert.equal(view.status, "pending");
    assert.ok(view.timeline.some((entry) => entry.event === "market_created"));
  });

  harness.it("optimistic: the whole journey, create to active, with every step behind its switches", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 600 };
    await readyOwner(mock, 3);
    const rig = await startCreationRig(mock);
    const made = await createMarket(rig, 3);
    await mock.advance(HOUR);
    await rig.tick();
    const view = await trackOf(rig, made.conditionId);
    assert.equal(view.status, "active");
    // What the creation taught the relay is recorded from observation only.
    assert.equal(rig.relay.services.capabilities.state("UO6"), "yes");
    assert.equal(rig.relay.services.capabilities.state("T6"), "unknown", "a market created and reviewed does not by itself record the live test");
  });
});

describe("a metadata URI outside XO's buckets (switch meta.foreign_uri)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("ignored: the market stays pending, the watcher gives up after twelve hours and says so", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("meta.foreign_uri", "ignored");
    await readyOwner(mock, 3);
    const rig = await startCreationRig(mock);
    const made = await createMarket(rig, 3);
    await mock.advance(2 * HOUR);
    await rig.tick();
    const early = await trackOf(rig, made.conditionId);
    assert.equal(early.status, "pending");
    assert.ok(!early.warnings.some((line) => line.includes("over 12 hours")));
    await mock.advance(12 * HOUR);
    await rig.tick();
    const late = await trackOf(rig, made.conditionId);
    assert.equal(late.status, "pending");
    assert.ok(late.warnings.some((line) => line.includes("No review has been seen for over 12 hours")), JSON.stringify(late.warnings));
    const doc = rig.relay.services.state.get("watchers", `market:${made.conditionId}`) as unknown as { done: boolean };
    assert.equal(doc.done, true, "polling stopped; only an explicit track looks again");
  });

  harness.it("rejected: the oracle turns it down within minutes and the status is final", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("meta.foreign_uri", "rejected");
    await readyOwner(mock, 3);
    const rig = await startCreationRig(mock);
    const made = await createMarket(rig, 3);
    await mock.advance(600);
    await rig.tick();
    const view = await trackOf(rig, made.conditionId);
    assert.equal(view.status, "rejected");
    assert.ok(view.warnings.some((line) => line.includes("The fee is not refunded")));
  });

  harness.it("reviewed: it is treated like any market, which is the optimistic case the live test T6 would show", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("meta.foreign_uri", "reviewed");
    mock.creation.policy = { decision: "approve", reviewDelayS: 300 };
    await readyOwner(mock, 3);
    const rig = await startCreationRig(mock);
    const made = await createMarket(rig, 3);
    await mock.advance(400);
    await rig.tick();
    assert.equal((await trackOf(rig, made.conditionId)).status, "active");
  });
});
