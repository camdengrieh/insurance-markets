import assert from "node:assert/strict";
import { describe } from "node:test";

import type { Hex } from "viem";

import { deriveAccount } from "../src/xo/account/derive.js";
import { createdMarketsFor } from "../relay/watchers.js";
import { CREATION_FEE_ATOMIC, MARKET_MANAGER } from "../src/xo/chain/constants.js";
import { CREATION_NOTICES, CONTENT_HASH_PREFIX } from "../src/tools/create.js";
import { metadataContentHash } from "../src/xo/creation/metadata.js";
import { deployOwner, useMock } from "./mock-xo/testing.js";
import { failed, ok, signPrepared, statusOf } from "./relay-userops-helpers.js";
import { HOSTED_URI, SECOND_URI, buildFile, createBody, createMarket, hostedText, ownerOf, readyOwner, startCreationRig, trackOf } from "./relay-creation-helpers.js";

// The creation lifecycle through the relay, against the local mock XO: prepare, sign, submit, the watcher finding the
// market, the review loop and its outcomes. Basis: docs/research/23 sections 1 and 4 (the oracle's timeline in mock time).

const owner = ownerOf;

describe("a market through the relay, optimistic profile", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("prepare carries the fixed approval wording, the file's own title and the fee; the watcher follows approval", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 900 };
    const { alice, account } = await readyOwner(mock, 3);
    const rig = await startCreationRig(mock);
    const file = buildFile(mock);
    rig.files.set(HOSTED_URI, hostedText(file.metadata));

    const prepared = ok(await rig.post("/v1/userop/prepare", createBody(alice.address, file)));
    assert.equal(prepared.kind, "create");
    assert.deepEqual(prepared.caps, { reserved_usd: "1", day_remaining_usd: "49" });
    for (const line of Object.values(CREATION_NOTICES)) assert.ok(prepared.warnings.includes(line), line);
    assert.ok(prepared.warnings.includes(`${CONTENT_HASH_PREFIX}${metadataContentHash(file.metadata)}`));
    const slot = prepared.summary.lines.find((line) => line.includes("[market title (untrusted):"));
    assert.ok(slot?.includes("Bitcoin"), "the title in the approval is the title in the hosted file");
    assert.ok(prepared.summary.lines.some((line) => line.includes(MARKET_MANAGER) && line.includes("createConvictionMarket")));
    assert.equal(prepared.capabilities["CR4"], "unknown");
    assert.equal(rig.relay.services.ledger.reservation(rig.relay.services.prepared.require(prepared.prepared_id).reservationIds[0] as string)?.amountAtomic, CREATION_FEE_ATOMIC);

    const submitted = ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign, "raw") }));
    assert.equal(submitted.state, "submitted");
    assert.equal((await statusOf(rig, prepared.user_op_hash)).state, "included");

    // The status poll's inclusion hook found the market by its creator and URI (CR8) and started the tracker.
    await rig.creation.tick();
    // Looked at just now: not due again until its schedule says so (every 60 seconds for the first half hour).
    assert.deepEqual((await rig.creation.tick())?.polled, []);
    await mock.advance(61);
    assert.equal((await rig.creation.tick())?.polled.length, 1);
    const created = [...mock.creation.markets.values()][0];
    assert.ok(created !== undefined);
    assert.equal(created.creator.toLowerCase(), account.toLowerCase());
    const pending = await trackOf(rig, created.conditionId);
    assert.equal(pending.status, "pending");
    assert.equal(pending.review.decision, "none");
    assert.ok(pending.timeline.some((entry) => entry.event === "market_created"));

    await mock.advance(1000);
    await rig.tick();
    const active = await trackOf(rig, created.conditionId);
    assert.equal(active.status, "active");
    assert.equal(active.review.decision, "approve");
    assert.ok(active.timeline.some((entry) => entry.event === "approved"));
    assert.ok(active.timeline.some((entry) => entry.event === "orderbook_active"));
    assert.ok(rig.relay.services.alerts.recent().some((alert) => alert.id.startsWith("creation_approved_")), "the approval raised an alert");
    // A seed is allowed for this account's market and token, and for nothing else.
    const doc = rig.relay.services.state.get("watchers", `market:${created.conditionId}`) as unknown as { state: { yesTokenId: string; noTokenId: string } };
    assert.equal(await rig.relay.services.createdMarkets?.createdBy(account, doc.state.yesTokenId), "yes");
    assert.equal(await rig.relay.services.createdMarkets?.createdBy(account, "12345"), "no");
    assert.equal(await rig.relay.services.createdMarkets?.createdBy(deriveAccount(owner(mock, 4).address), doc.state.yesTokenId), "unknown");
    void failed;
  });

  harness.it("a tick alone finds the market when nobody polls the status route, and marks the draft as made", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 900 };
    const { alice } = await readyOwner(mock, 3);
    const rig = await startCreationRig(mock);
    const file = buildFile(mock);
    rig.files.set(HOSTED_URI, hostedText(file.metadata));
    const prepared = ok(await rig.post("/v1/userop/prepare", createBody(alice.address, file)));
    ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign, "raw") }));
    assert.equal(rig.relay.services.state.keys("watchers").filter((key) => key.startsWith("market:")).length, 0, "nothing watched before the first tick");
    const report = await rig.creation.tick();
    assert.equal(report?.started.length, 1);
    assert.equal(rig.relay.services.state.keys("watchers").filter((key) => key.startsWith("market:")).length, 1);
    const intent = rig.relay.services.state.list("intents")[0]?.[1] as unknown as { status: string; conditionId: string };
    assert.equal(intent.status, "included");
    assert.match(intent.conditionId, /^0x[0-9a-f]{64}$/);
    // The fee stayed reserved until the operation was seen, then it was committed by the same tick.
    const reservation = rig.relay.services.ledger.reservation(rig.relay.services.prepared.require(prepared.prepared_id).reservationIds[0] as string);
    assert.equal(reservation?.state, "committed");
  });

  harness.it("a rejected review is a final status with the fee note; no seed is allowed for it", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "reject", reviewDelayS: 600, notes: "Rejected: the market duplicates an existing market." };
    const { account } = await readyOwner(mock, 3);
    const rig = await startCreationRig(mock);
    const made = await createMarket(rig, 3);
    await mock.advance(700);
    await rig.tick();
    const view = await trackOf(rig, made.conditionId);
    assert.equal(view.status, "rejected");
    assert.equal(view.review.decision, "reject");
    assert.ok(view.warnings.some((line) => line.includes("The fee is not refunded")), JSON.stringify(view.warnings));
    assert.ok(view.timeline.some((entry) => entry.event === "rejected"));
    assert.ok(view.warnings.every((line) => !line.includes("duplicates an existing market")), "the oracle's own note is not repeated in a warning");
    assert.equal(view.pending_update, null);
    const doc = rig.relay.services.state.get("watchers", `market:${made.conditionId}`) as unknown as { done: boolean; state: { yesTokenId: string } };
    assert.equal(doc.done, true, "a terminal market is no longer polled");
    assert.equal(await rig.relay.services.createdMarkets?.createdBy(account, doc.state.yesTokenId), "unknown", "no seed for a rejected market");
    assert.ok(rig.relay.services.alerts.recent().some((alert) => alert.id.startsWith("creation_rejected_")));
  });

  harness.it("the creator cancels a pending market: prepare, sign, submit, and the tracker follows; a cancel of anything else is refused", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 3600 };
    const { alice } = await readyOwner(mock, 3);
    await deployOwner(mock, 4, { enableTrading: true });
    const rig = await startCreationRig(mock);
    const made = await createMarket(rig, 3);

    // Someone else's owner cannot cancel it, and an unknown market is unknown.
    const mallory = owner(mock, 4);
    assert.equal(failed(await rig.post("/v1/userop/prepare", { owner: mallory.address, action: "cancel_market", params: { condition_id: made.conditionId as Hex } })).code, "precondition_failed");
    assert.equal(failed(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "cancel_market", params: { condition_id: `0x${"ab".repeat(32)}` } })).code, "not_found");

    const cancel = ok(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "cancel_market", params: { condition_id: made.conditionId as Hex } }));
    assert.equal(cancel.kind, "create");
    assert.deepEqual(cancel.caps, { reserved_usd: "0", day_remaining_usd: "49" }, "a cancel costs nothing more; the creation fee was the only spend");
    assert.ok(cancel.warnings.some((line) => line.includes("not refunded")));
    assert.ok(cancel.summary.lines.some((line) => line.includes("cancelMarket")));
    assert.equal(ok(await rig.post("/v1/userop/submit", { prepared_id: cancel.prepared_id, signature: await signPrepared(alice, cancel.sign, "raw") })).state, "submitted");
    assert.equal((await statusOf(rig, cancel.user_op_hash)).state, "included");
    const view = await trackOf(rig, made.conditionId);
    assert.equal(view.status, "cancelled");
    assert.ok(view.timeline.some((entry) => entry.event === "owner_cancelled"));
    // Once it is not pending, a second cancel is refused before anything is built.
    assert.equal(failed(await rig.post("/v1/userop/prepare", { owner: alice.address, action: "cancel_market", params: { condition_id: made.conditionId as Hex } })).code, "precondition_failed");
  });

  harness.it("one draft makes one market: a second prepare, a send in flight, an included market and a fresh relay all refuse", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 3600 };
    const { alice } = await readyOwner(mock, 3);
    const rig = await startCreationRig(mock);
    const file = buildFile(mock);
    rig.files.set(HOSTED_URI, hostedText(file.metadata));

    const first = ok(await rig.post("/v1/userop/prepare", createBody(alice.address, file)));
    // While the first item is valid, the same draft is not prepared again; the error names the item.
    const again = failed(await rig.post("/v1/userop/prepare", createBody(alice.address, file)));
    assert.equal(again.code, "precondition_failed");
    assert.deepEqual((again.details as { reason: string; prepared_id: string }).reason, "already_prepared");
    assert.equal((again.details as { prepared_id: string }).prepared_id, first.prepared_id);
    // Only one fee is held.
    assert.equal(rig.relay.services.ledger.list({ state: "reserved" }).length, 1);

    ok(await rig.post("/v1/userop/submit", { prepared_id: first.prepared_id, signature: await signPrepared(alice, first.sign, "raw") }));
    const included = failed(await rig.post("/v1/userop/prepare", createBody(alice.address, file)));
    assert.equal(included.code, "precondition_failed");
    assert.match(String((included.details as { reason: string }).reason), /already_on_chain|already_included/);

    // A relay with an empty store still refuses: the creator's own creation log is the proof (CR8).
    await rig.stop();
    const fresh = await startCreationRig(mock);
    fresh.files.set(HOSTED_URI, hostedText(file.metadata));
    const fromLogs = failed(await fresh.post("/v1/userop/prepare", createBody(alice.address, file)));
    assert.equal((fromLogs.details as { reason: string }).reason, "already_on_chain");
    assert.ok(typeof (fromLogs.details as { condition_id: string }).condition_id === "string");
    assert.equal(fresh.relay.services.ledger.list({ state: "reserved" }).length, 0, "a refused draft holds no fee");

    // A different draft is a different intent and is allowed: there is no cadence cap of ours.
    const other = buildFile(mock, { title: "Will Bitcoin's daily closing price on Coinbase be above $160,000 on December 31, 2026?", rules: file.metadata.rules.description.replaceAll("150,000", "160,000"), description: "Binary market on whether BTC-USD closes above $160,000 on Coinbase on the last day of 2026." });
    fresh.files.set(SECOND_URI, hostedText(other.metadata));
    const second = ok(await fresh.post("/v1/userop/prepare", createBody(alice.address, other, SECOND_URI)));
    assert.equal(second.kind, "create");
  });

  harness.it("a seed waits for the orderbook: approved is not enough, the orderbook's own active flag has to be true", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 300, metadataUpdate: false };
    const { account } = await readyOwner(mock, 3);
    const book = { active: false };
    const wrap = (inner: typeof fetch): typeof fetch =>
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("https://orderbooks.xo.market/markets/")) {
          return new Response(JSON.stringify({ condition_id: url.split("/").pop(), active: book.active }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return inner(input, init);
      }) as typeof fetch;
    const rig = await startCreationRig(mock, { wrapFetch: wrap });
    const made = await createMarket(rig, 3);
    await mock.advance(400);
    await rig.tick();
    const approved = await trackOf(rig, made.conditionId);
    assert.equal(approved.status, "active");
    assert.ok(!approved.timeline.some((entry) => entry.event === "orderbook_active"));
    assert.ok(approved.warnings.some((line) => line.includes("orderbook does not show this market as active yet")));
    const doc = rig.relay.services.state.get("watchers", `market:${made.conditionId}`) as unknown as { state: { yesTokenId: string; noTokenId: string } };
    assert.equal(await rig.relay.services.createdMarkets?.createdBy(account, doc.state.yesTokenId), "unknown", "XO answers a seed on a market that is not active with a 422: the relay does not ask");
    // The orderbook catches up.
    book.active = true;
    const live = await trackOf(rig, made.conditionId);
    assert.ok(live.timeline.some((entry) => entry.event === "orderbook_active"));
    assert.equal(await rig.relay.services.createdMarkets?.createdBy(account, doc.state.noTokenId), "yes");
  });

  harness.it("an expired prepared item does not block the same draft: it is prepared again", async (mock) => {
    mock.setProfile("optimistic");
    const { alice } = await readyOwner(mock, 3);
    const rig = await startCreationRig(mock);
    const file = buildFile(mock);
    rig.files.set(HOSTED_URI, hostedText(file.metadata));
    const first = ok(await rig.post("/v1/userop/prepare", createBody(alice.address, file)));
    await mock.advance(301);
    const second = ok(await rig.post("/v1/userop/prepare", createBody(alice.address, file)));
    assert.notEqual(second.prepared_id, first.prepared_id);
  });
});

describe("the seed gate before the watcher is wired", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("an unbound watcher answers unknown for everything: no seed is ever accepted on a guess", async (mock) => {
    mock.setProfile("optimistic");
    await readyOwner(mock, 3);
    const unbound = createdMarketsFor(() => undefined);
    assert.equal(await unbound.createdBy(deriveAccount(owner(mock, 3).address), "1"), "unknown");
  });
});
