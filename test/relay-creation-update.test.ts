import assert from "node:assert/strict";
import { describe } from "node:test";

import { encodeAbiParameters, type Hex } from "viem";

import { MARKET_MANAGER, MARKET_REVIEWED_TOPIC } from "../src/xo/chain/constants.js";
import type { MetadataJson } from "../src/xo/creation/metadata.js";
import { CREATION_NOTICES } from "../src/tools/create.js";
import { deployOwner, useMock } from "./mock-xo/testing.js";
import type { MockXo } from "./mock-xo/server.js";
import type { CreationPolicy } from "./mock-xo/creation.js";
import { failed, ok } from "./relay-userops-helpers.js";
import { buildFile, createBody, createMarket, hostedText, land, ownerOf, readyOwner, startCreationRig, trackOf, SECOND_URI, type CreationRig } from "./relay-creation-helpers.js";

// XO asks for changes (UPDATE_REQUIRED): the diff guard, the accept rule, the decline that is always possible, the windows
// (as short as 20 minutes), a file that cannot be read, and XO's later rewrites. Basis: docs/research/23 sections 4 and 8
// (O06, O07), V2.3 (the guard must compare numbers, dates, entities and the end date); the oracle's texts are synthetic.

const MINUTE = 60;

function cloneWith(base: MetadataJson, change: (copy: Record<string, unknown>) => void): MetadataJson {
  const copy = structuredClone(base) as unknown as Record<string, unknown>;
  change(copy);
  return copy as unknown as MetadataJson;
}

// A benign rewrite: one more tag.
const benign = (base: MetadataJson): MetadataJson => cloneWith(base, (copy) => void (copy["tags"] = [...(copy["tags"] as string[]), "Markets"]));
// A rewrite that changes what the market means: the threshold moves from 150,000 to 250,000 everywhere.
const shifted = (base: MetadataJson): MetadataJson =>
  cloneWith(base, (copy) => {
    const swap = (text: string): string => text.replaceAll("150,000", "250,000").replaceAll("$150,000", "$250,000");
    copy["title"] = swap(copy["title"] as string);
    copy["description"] = swap(copy["description"] as string);
    const rules = copy["rules"] as { description: string; outcomeRules: Array<{ rule: string }> };
    rules.description = swap(rules.description);
    for (const entry of rules.outcomeRules) entry.rule = swap(entry.rule);
  });

interface Scenario {
  readonly rig: CreationRig;
  readonly conditionId: Hex;
  readonly alice: ReturnType<typeof ownerOf>;
  readonly base: MetadataJson;
  readonly suggestionUri: string;
}

// Creates a market whose first review is "update required", then lets the review happen. The suggestion is hosted at the
// URI the mock's oracle chose (or not at all) BEFORE the watcher looks, as a real oracle's file exists when it announces it.
async function scenario(mock: MockXo, policy: CreationPolicy, suggestion: ((base: MetadataJson) => MetadataJson) | null, options: { readonly tickAfterReview?: boolean } = {}): Promise<Scenario> {
  mock.setProfile("optimistic");
  mock.creation.policy = { decision: "update", reviewDelayS: 300, changeExpiry: false, metadataUpdate: false, ...policy };
  await readyOwner(mock, 3);
  const rig = await startCreationRig(mock);
  const made = await createMarket(rig, 3);
  await mock.advance(305);
  const market = mock.creation.markets.get(made.conditionId);
  assert.ok(market?.suggestion != null, "the oracle asked for an update");
  if (suggestion !== null) rig.files.set(market.suggestion.uri, hostedText(suggestion(made.file.metadata)));
  if (options.tickAfterReview !== false) await rig.tick();
  return { rig, conditionId: made.conditionId as Hex, alice: made.alice, base: made.file.metadata, suggestionUri: market.suggestion.uri };
}

const respond = (s: Scenario, accept: boolean) => s.rig.post("/v1/userop/prepare", { owner: s.alice.address, action: "respond_update", params: { condition_id: s.conditionId, accept } });

describe("XO asks for changes", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("a benign rewrite passes the guard; accepting is offered, approval-gated, and the market goes active", async (mock) => {
    const s = await scenario(mock, { windowS: 48 * 3600 }, benign);
    const view = await trackOf(s.rig, s.conditionId);
    assert.equal(view.status, "update_required");
    assert.equal(view.review.decision, "update_required");
    assert.equal(view.pending_update?.guard_verdict, "pass");
    assert.equal(view.pending_update?.expiry_changed, false);
    assert.ok(view.pending_update?.changes.every((change) => change.risk === "benign"));
    assert.ok(view.pending_update?.changes.some((change) => change.kind === "tags"));
    assert.ok(view.timeline.some((entry) => entry.event === "update_requested"));
    assert.ok(s.rig.relay.services.alerts.recent().some((alert) => alert.id.startsWith("creation_update_requested_")), "the update request raised an alert");

    const accept = ok(await respond(s, true));
    assert.equal(accept.kind, "create");
    assert.ok(accept.summary.lines.some((line) => line.includes("respondToUpdateRequest") && line.includes("accept true")));
    assert.ok(accept.warnings.includes(CREATION_NOTICES.fee));
    assert.ok(accept.warnings.some((line) => line.includes("it cannot read meaning")), "the guard's limits are stated at the approval");
    assert.equal((await land(s.rig, s.alice, accept)).state, "included");
    const after = await trackOf(s.rig, s.conditionId);
    assert.equal(after.status, "active");
    assert.ok(after.timeline.some((entry) => entry.event === "update_accepted"));
    assert.equal(after.pending_update, null, "an answered request has no pending update");

    // The accepted file is now the creator's own: a later rewrite to exactly that file is no change at all.
    const same = "https://storage.googleapis.com/market-metadata-mainnet/updated-same.json";
    s.rig.files.set(same, hostedText(benign(s.base)));
    await mock.creation.updateMetadata(s.conditionId, same);
    await mock.advance(1);
    const rewritten = await trackOf(s.rig, s.conditionId);
    assert.equal(rewritten.pending_update?.guard_verdict, "pass");
    assert.deepEqual(rewritten.pending_update?.changes, [], "compared with the file the creator accepted, not with the first one");
  });

  harness.it("a rewrite that moves the threshold is flagged; accepting is refused, declining is prepared and cancels the market", async (mock) => {
    const s = await scenario(mock, { windowS: 48 * 3600 }, shifted);
    const view = await trackOf(s.rig, s.conditionId);
    assert.equal(view.pending_update?.guard_verdict, "flagged");
    const meaning = view.pending_update?.changes.filter((change) => change.risk === "meaning_change") ?? [];
    assert.ok(meaning.length > 0 && meaning.some((change) => change.kind === "numbers"));
    // Before and after are untrusted objects, not instructions.
    for (const change of meaning) assert.equal(change.before.trust, "untrusted-user-content");
    const refused = failed(await respond(s, true));
    assert.equal(refused.code, "precondition_failed");
    assert.equal((refused.details as { reason: string }).reason, "guard_flagged");
    assert.equal(s.rig.relay.services.ledger.list({ state: "reserved" }).length, 0, "a refused answer reserves nothing");

    const decline = ok(await respond(s, false));
    assert.ok(decline.warnings.some((line) => line.includes("Declining cancels the market") && line.includes("$1 fee is not refunded")));
    assert.ok(decline.warnings.some((line) => line.includes("Flagged:")), "the flagged verdict is repeated at the approval, in fixed wording");
    assert.equal((await land(s.rig, s.alice, decline)).state, "included");
    const after = await trackOf(s.rig, s.conditionId);
    assert.equal(after.status, "cancelled");
    assert.ok(after.timeline.some((entry) => entry.event === "update_declined"));
  });

  harness.it("a suggestion that also moves the end date is flagged even when the words are the same", async (mock) => {
    const s = await scenario(mock, { windowS: 48 * 3600, changeExpiry: true }, benign);
    const view = await trackOf(s.rig, s.conditionId);
    assert.equal(view.pending_update?.expiry_changed, true);
    assert.notEqual(view.pending_update?.suggested_expires_at, null);
    assert.equal(view.pending_update?.guard_verdict, "flagged");
    assert.equal(failed(await respond(s, true)).code, "precondition_failed");
    assert.equal(ok(await respond(s, false)).kind, "create");
  });

  harness.it("a 20-minute window: accept now is fine, accept late is refused, and when it closes only declining is left", async (mock) => {
    const s = await scenario(mock, { windowS: 20 * MINUTE }, benign);
    const view = await trackOf(s.rig, s.conditionId);
    assert.equal(view.pending_update?.guard_verdict, "pass");
    assert.ok(view.warnings.some((line) => line.includes("The window to answer is short")), JSON.stringify(view.warnings));
    // Fresh: the cut-off for an accept is ten minutes before the window closes, and the review was just now.
    const early = ok(await respond(s, true));
    assert.equal(early.kind, "create");

    // Eleven minutes later less than the ten-minute margin is left: accepting is refused, declining is not.
    await mock.advance(11 * MINUTE);
    await s.rig.tick();
    const late = failed(await respond(s, true));
    assert.equal((late.details as { reason: string }).reason, "past_accept_by");

    // After the window the market stays UPDATE_REQUIRED at no cost; accepting is impossible, declining still works.
    await mock.advance(15 * MINUTE);
    await s.rig.tick();
    const lapsed = await trackOf(s.rig, s.conditionId);
    assert.equal(lapsed.status, "update_required");
    assert.ok(lapsed.timeline.some((entry) => entry.event === "update_window_lapsed"));
    assert.ok(lapsed.warnings.some((line) => line.includes("window to accept has closed")));
    assert.equal((failed(await respond(s, true)).details as { reason: string }).reason, "window_lapsed");
    const decline = ok(await respond(s, false));
    assert.equal((await land(s.rig, s.alice, decline)).state, "included");
    assert.equal((await trackOf(s.rig, s.conditionId)).status, "cancelled");
  });

  harness.it("a suggestion that cannot be read leaves the guard unchecked: no accept until it can be read, then the guard runs", async (mock) => {
    const s = await scenario(mock, { windowS: 48 * 3600 }, null);
    const view = await trackOf(s.rig, s.conditionId);
    assert.equal(view.status, "update_required");
    assert.ok(view.warnings.some((line) => line.includes("has not been checked by the diff guard")), JSON.stringify(view.warnings));
    assert.equal((failed(await respond(s, true)).details as { reason: string }).reason, "guard_unchecked");
    assert.equal(ok(await respond(s, false)).kind, "create", "declining does not need the guard");

    // The file appears; the next look (after the retry delay) runs the guard.
    s.rig.files.set(s.suggestionUri, hostedText(benign(s.base)));
    await mock.advance(2 * MINUTE);
    await s.rig.tick();
    const checked = await trackOf(s.rig, s.conditionId);
    assert.equal(checked.pending_update?.guard_verdict, "pass");
    assert.equal(ok(await respond(s, true)).kind, "create");
  });

  harness.it("a suggestion that is not the nine-key file is flagged", async (mock) => {
    const broken = await scenario(mock, { windowS: 48 * 3600 }, null);
    broken.rig.files.set(broken.suggestionUri, JSON.stringify({ title: "not a market file" }));
    await mock.advance(2 * MINUTE);
    await broken.rig.tick();
    const view = await trackOf(broken.rig, broken.conditionId);
    assert.equal(view.pending_update?.guard_verdict, "flagged");
    assert.equal(failed(await respond(broken, true)).code, "precondition_failed");
  });

  harness.it("only the creator can answer, and a market the relay does not know is not found", async (mock) => {
    const s = await scenario(mock, { windowS: 48 * 3600 }, benign);
    await deployOwner(mock, 4, { enableTrading: true });
    const mallory = ownerOf(mock, 4);
    // Mallory has never used this relay: the market is not hers and she is unknown to it.
    const unknown = failed(await s.rig.post("/v1/userop/prepare", { owner: mallory.address, action: "respond_update", params: { condition_id: `0x${"cd".repeat(32)}`, accept: false } }));
    assert.equal(unknown.code, "not_found");
    // Once she has prepared something of her own she is known, and the market is still not hers.
    const file = buildFile(mock, { title: "Will Bitcoin's daily closing price on Coinbase be above $160,000 on December 31, 2026?", rules: s.base.rules.description.replaceAll("150,000", "160,000"), description: "Binary market on whether BTC-USD closes above $160,000 on Coinbase on the last day of 2026." });
    s.rig.files.set(SECOND_URI, hostedText(file.metadata));
    ok(await s.rig.post("/v1/userop/prepare", createBody(mallory.address, file, SECOND_URI)));
    const stranger = failed(await s.rig.post("/v1/userop/prepare", { owner: mallory.address, action: "respond_update", params: { condition_id: s.conditionId, accept: false } }));
    assert.equal(stranger.code, "precondition_failed");
    assert.equal((stranger.details as { reason: string }).reason, "not_creator");
  });

  harness.it("a suggestion outside XO's buckets is never fetched: the guard stays unchecked, accepting is refused, and an anomaly is alerted", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 10 * 86_400, metadataUpdate: false };
    await readyOwner(mock, 3);
    const rig = await startCreationRig(mock);
    const made = await createMarket(rig, 3);
    const elsewhere = "https://evil.example-host.net/metadata/suggested.json";
    rig.files.set(elsewhere, "{}");
    const nowS = Math.floor(mock.clock.nowMs() / 1000);
    // The oracle's review as the manager would log it, with a suggestion that lives somewhere XO's buckets are not.
    mock.explorer.syntheticLogs.push({
      address: MARKET_MANAGER,
      topics: [MARKET_REVIEWED_TOPIC, made.conditionId],
      data: encodeAbiParameters([{ type: "uint8" }, { type: "string" }, { type: "string" }, { type: "uint40" }, { type: "uint40" }], [2, elsewhere, "Update required.", 0, nowS + 48 * 3600]),
      blockNumber: 950_000,
      logIndex: 0,
      transactionHash: `0x${"0".repeat(63)}9`,
      timestamp: nowS,
    });
    await mock.advance(120);
    await rig.tick();
    const view = await trackOf(rig, made.conditionId);
    assert.equal(view.status, "update_required");
    assert.equal(view.pending_update, null);
    assert.ok(!rig.fetched.includes(elsewhere), "the relay did not fetch a file from a host it was not told about");
    assert.equal((failed(await rig.post("/v1/userop/prepare", { owner: made.alice.address, action: "respond_update", params: { condition_id: made.conditionId as Hex, accept: true } })).details as { reason: string }).reason, "guard_unchecked");
    assert.ok(rig.relay.services.alerts.recent().some((alert) => alert.id.startsWith("creation_anomaly_")), "the unexpected suggestion raised an alert");
    assert.equal(ok(await rig.post("/v1/userop/prepare", { owner: made.alice.address, action: "respond_update", params: { condition_id: made.conditionId as Hex, accept: false } })).kind, "create");
  });

  harness.it("a market that is not waiting for an answer is not answered", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 300, metadataUpdate: false };
    await readyOwner(mock, 3);
    const rig = await startCreationRig(mock);
    const made = await createMarket(rig, 3);
    await mock.advance(305);
    await rig.tick();
    const refused = failed(await rig.post("/v1/userop/prepare", { owner: made.alice.address, action: "respond_update", params: { condition_id: made.conditionId as Hex, accept: false } }));
    assert.equal(refused.code, "precondition_failed");
    assert.equal((refused.details as { reason: string }).reason, "not_waiting_for_update");
  });

  harness.it("XO rewriting an active market's file is compared with the creator's own file and flagged when it changes the meaning", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 300, metadataUpdate: false };
    await readyOwner(mock, 3);
    const rig = await startCreationRig(mock);
    const made = await createMarket(rig, 3);
    await mock.advance(305);
    await rig.tick();
    assert.equal((await trackOf(rig, made.conditionId)).status, "active");

    const rewrite = "https://storage.googleapis.com/market-metadata-mainnet/updated-0001.json";
    rig.files.set(rewrite, hostedText(shifted(made.file.metadata)));
    await mock.creation.updateMetadata(made.conditionId as Hex, rewrite);
    await mock.advance(1);
    const view = await trackOf(rig, made.conditionId);
    assert.ok(view.timeline.some((entry) => entry.event === "metadata_updated"));
    assert.equal(view.pending_update?.guard_verdict, "flagged");
    assert.ok(view.warnings.some((line) => line.includes("XO changed the market's metadata after creation and the new file has not passed the diff guard")), JSON.stringify(view.warnings));
    assert.ok(rig.relay.services.alerts.recent().some((alert) => alert.id.startsWith("creation_metadata_updated_")));

    // A benign rewrite after it passes.
    const second = "https://storage.googleapis.com/market-metadata-mainnet/updated-0002.json";
    rig.files.set(second, hostedText(benign(made.file.metadata)));
    await mock.creation.updateMetadata(made.conditionId as Hex, second);
    await mock.advance(1);
    const passed = await trackOf(rig, made.conditionId);
    assert.equal(passed.pending_update?.guard_verdict, "pass");
  });
});
