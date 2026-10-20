import assert from "node:assert/strict";
import { describe } from "node:test";

import { SUBMIT_CREATE_TOOL, PREPARE_CREATE_TOOL, SEED_TOOL, TRACK_TOOL } from "../../src/tools/create.js";
import { useMock } from "../mock-xo/testing.js";
import { applyProfile, identityOf, intentOf, type Identity, type MatrixProfile, type Step } from "./helpers.js";
import {
  CREATE_TRANSPORTS,
  assertCreateHeld,
  checkCreateInvariants,
  checkCreateKept,
  crashAt,
  draftArgs,
  flowCreate,
  flowRespond,
  flowReview,
  flowSeed,
  readyCreator,
  signStep,
  startCreateStack,
  type CreateStack,
  type MarketRun,
} from "./create-rig.js";
import type { Transport } from "./helpers.js";

// Restart in the middle of every stage of a creation and of its watch. "Crash" abandons the relay without flushing or
// releasing anything (what a killed process leaves behind); "close" is an orderly stop. After each restart, on the same data
// directory and the same chain: the credentials are there, the watcher resumes from the store, the market exists once, the
// fee is held once, nothing is sent a second time, and every answer is stable and actionable.

const OPTIMISTIC: MatrixProfile = { name: "optimistic", base: "optimistic" };

async function start(mock: Parameters<typeof applyProfile>[0], transport: Transport): Promise<{ cs: CreateStack; who: Identity }> {
  applyProfile(mock, OPTIMISTIC);
  const cs = await startCreateStack({ mock, transport });
  const who = await readyCreator(cs);
  return { cs, who };
}

const sends = (cs: CreateStack): number => cs.stack.history.wire.count((call) => call.kind === "bundler_send");
const posts = (cs: CreateStack): number => cs.stack.history.wire.count((call) => call.kind === "order_post");
const feesHeld = (cs: CreateStack): number => cs.stack.relay.services.ledger.list().filter((entry) => entry.category === "creation_fee" && entry.state !== "released").length;
const count = (step: Step | undefined, event: string): number => ((step?.structured?.["timeline"] as Array<{ event: string }> | undefined) ?? []).filter((entry) => entry.event === event).length;

async function held(cs: CreateStack, context: string): Promise<void> {
  assertCreateHeld([...(await checkCreateInvariants(cs)), ...(await checkCreateKept(cs))], context);
}

// A creation prepared and signed, not yet sent.
async function preparedCreation(cs: CreateStack, who: Identity, variant = 0) {
  const args = draftArgs(who.owner, variant);
  const file = await cs.call(PREPARE_CREATE_TOOL, args);
  const hosted = file.structured?.["metadata_file"] as { url: string; text: string };
  cs.extras.files.set(hosted.url, hosted.text);
  const prepare = await cs.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
  const item = await signStep(cs, who, prepare);
  assert.ok(item !== undefined, `a creation was prepared: ${prepare.text.slice(0, 300)}`);
  return { args, prepare, item };
}

for (const transport of CREATE_TRANSPORTS) {
  for (const how of ["crash", "close"] as const) {
    describe(`restart in the middle of a creation over ${transport.name} (${how})`, () => {
      const harness = useMock({ chains: { xo: true, base: false } });

      harness.it("prepared and signed, not sent: the item survives once, the same draft cannot be prepared a second time, the market is made once", async (mock) => {
        const { cs, who } = await start(mock, transport);
        const { args, item } = await preparedCreation(cs, who);
        assert.equal(feesHeld(cs), 1);
        const again = await cs.restart(how);
        assert.equal(feesHeld(again), 1, "the fee reservation came back from the store, once");
        // The same draft again, while the first item is still valid: refused with a coded precondition, nothing reserved.
        const twin = await again.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
        assert.equal(twin.isError, true, twin.text.slice(0, 300));
        assert.equal(twin.code, "precondition_failed", twin.text.slice(0, 300));
        assert.equal(intentOf(twin), undefined, "no second signing intent for one draft");
        assert.equal(feesHeld(again), 1);
        // The signed item is still good: it is sent exactly once, and a second submit does not send.
        const sent = await again.call(SUBMIT_CREATE_TOOL, { prepared_id: item.id, signature: item.signature });
        assert.ok(["submitted"].includes(String(sent.outcome)) || sent.isError, sent.text.slice(0, 300));
        const resubmit = await again.call(SUBMIT_CREATE_TOOL, { prepared_id: item.id, signature: item.signature });
        assert.equal(resubmit.isError, true, "single use");
        await again.tick();
        assert.equal(sends(again), 1, "one send for one prepared item");
        assert.equal(mock.creation.markets.size, sent.outcome === "submitted" ? 1 : 0);
        await held(again, `prepared item across a ${how}`);
      });

      harness.it("sent and accepted by the bundler, restarted before anyone looked: the watcher finds the market once and tracks it", async (mock) => {
        const { cs, who } = await start(mock, transport);
        mock.creation.policy = { decision: "approve", reviewDelayS: 1800, metadataUpdate: false };
        const { args, item } = await preparedCreation(cs, who);
        const sent = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: item.id, signature: item.signature });
        assert.equal(sent.outcome, "submitted", sent.text.slice(0, 300));
        const again = await cs.restart(how);
        await mock.advance(15);
        await again.tick();
        await again.tick();
        const list = await again.call(TRACK_TOOL, { owner: who.owner });
        const markets = (list.structured?.["created_markets"] as Array<{ condition_id: string }> | undefined) ?? [];
        assert.equal(markets.length, 1, list.text.slice(0, 300));
        const tracked = await again.call(TRACK_TOOL, { condition_id: markets[0]!.condition_id });
        assert.equal(tracked.code, "pending", tracked.text.slice(0, 300));
        assert.equal(count(tracked, "market_created"), 1);
        // The creation is not repeatable: the same draft is refused after the restart, with or without the old item.
        const twin = await again.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
        assert.equal(twin.isError, true, twin.text.slice(0, 300));
        assert.equal(intentOf(twin), undefined);
        assert.equal(sends(again), 1);
        assert.equal(mock.creation.markets.size, 1);
        await held(again, `inclusion across a ${how}`);
      });

      harness.it("the bundler took the operation and the relay died before it could say so: never resent, found on chain, tracked once", async (mock) => {
        const { cs, who } = await start(mock, transport);
        mock.creation.policy = { decision: "approve", reviewDelayS: 900, metadataUpdate: false };
        const { args, item } = await preparedCreation(cs, who);
        crashAt(cs, "bundler_send", "after");
        const lost = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: item.id, signature: item.signature });
        // The caller gets an answer, not a hang; the work is done on the XO side, so the answer is not "nothing was sent".
        assert.ok(lost.structured !== undefined, lost.text.slice(0, 300));
        const again = await cs.restart("crash");
        const resend = await again.call(SUBMIT_CREATE_TOOL, { prepared_id: item.id, signature: item.signature });
        assert.equal(resend.isError, true, "the item that may have been sent is never sent again");
        const twin = await again.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
        assert.equal(twin.isError, true, "a draft whose creation may have happened is not prepared again");
        assert.equal(intentOf(twin), undefined);
        await mock.advance(30);
        await again.tick();
        assert.equal(sends(again), 1, "one send in total");
        assert.equal(mock.creation.markets.size, 1, "the creation did land and is one market");
        const list = await again.call(TRACK_TOOL, { owner: who.owner });
        assert.equal(((list.structured?.["created_markets"] as unknown[] | undefined) ?? []).length, 1);
        await held(again, `answer lost then ${how}`);
      });

      harness.it("the relay dies before the operation leaves: nothing was created, the same draft can be prepared again, and it is made once", async (mock) => {
        const { cs, who } = await start(mock, transport);
        const { args, item } = await preparedCreation(cs, who);
        crashAt(cs, "bundler_send", "before");
        const lost = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: item.id, signature: item.signature });
        assert.ok(lost.structured !== undefined, lost.text.slice(0, 300));
        assert.equal(mock.creation.markets.size, 0, "nothing reached XO");
        const again = await cs.restart("crash");
        await again.tick();
        // Whether this draft may be prepared again is the relay's call (the item may count as sent); what must hold is that
        // however many times it is tried, one draft makes at most one market and nothing is sent without a fresh signature.
        const retry = await again.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
        if (retry.outcome === "prepared") {
          const fresh = await signStep(again, who, retry);
          assert.ok(fresh !== undefined);
          await again.call(SUBMIT_CREATE_TOOL, { prepared_id: fresh.id, signature: fresh.signature });
        } else {
          assert.equal(retry.isError, true, retry.text.slice(0, 300));
        }
        await mock.advance(30);
        await again.tick();
        assert.ok(mock.creation.markets.size <= 1, "one draft, at most one market");
        assert.ok(sends(again) <= 2);
        await held(again, `crash before the send then ${how}`);
      });

      harness.it("waiting for the first review: the tracker resumes from the store, and the approval is seen once", async (mock) => {
        const { cs, who } = await start(mock, transport);
        mock.creation.policy = { decision: "approve", reviewDelayS: 1800, metadataUpdate: false };
        const run = await flowCreate(cs, who, 0);
        assert.ok(run.conditionId !== undefined);
        await mock.advance(120);
        await cs.tick();
        const again = await cs.restart(how);
        // Nothing is in memory: the tracker comes back from the store, with its history.
        const resumed = await again.call(TRACK_TOOL, { condition_id: run.conditionId });
        assert.equal(resumed.code, "pending", resumed.text.slice(0, 300));
        assert.equal(count(resumed, "market_created"), 1);
        await mock.advance(2000);
        const report = await again.tick();
        assert.ok((report?.polled.length ?? 0) >= 1, "the resumed watcher polled the market");
        const view = await again.call(TRACK_TOOL, { condition_id: run.conditionId });
        assert.equal(view.code, "active", view.text.slice(0, 300));
        assert.equal(count(view, "market_created"), 1);
        assert.equal(count(view, "approved"), 1);
        // And once more after the end: still once, and a seed can follow with the credentials the first process stored.
        const third = await again.restart(how);
        const final = await third.call(TRACK_TOOL, { condition_id: run.conditionId });
        assert.equal(count(final, "approved"), 1);
        const seed = await flowSeed(third, who, run);
        assert.equal(seed["submit"]?.code, "accepted", seed["prepare"]?.text.slice(0, 300));
        assert.equal(mock.creation.markets.size, 1);
        await held(third, `review wait across two ${how}s`);
      });

      harness.it("inside an update window: the guard's verdict is kept, XO's file is not fetched again, and the answer is still possible", async (mock) => {
        const { cs, who } = await start(mock, transport);
        mock.creation.policy = { decision: "update", reviewDelayS: 300, windowS: 48 * 3600, changeExpiry: false, metadataUpdate: false };
        const run: MarketRun = await flowCreate(cs, who, 1);
        assert.ok(run.conditionId !== undefined);
        await mock.advance(305);
        const market = mock.creation.markets.get(run.conditionId);
        assert.ok(market?.suggestion != null);
        // Host XO's suggestion, let the watcher read it once, then restart.
        const { benignSuggestion } = await import("./create-rig.js");
        cs.extras.files.set(market.suggestion.uri, benignSuggestion(run.fileText!));
        await cs.tick();
        const before = await cs.call(TRACK_TOOL, { condition_id: run.conditionId });
        assert.equal(before.code, "update_required", before.text.slice(0, 300));
        const again = await cs.restart(how);
        const resumed = await again.call(TRACK_TOOL, { condition_id: run.conditionId });
        assert.equal(resumed.code, "update_required", resumed.text.slice(0, 300));
        assert.equal((resumed.structured?.["pending_update"] as { guard_verdict?: string } | undefined)?.guard_verdict, "pass", "the verdict survived the restart");
        await again.tick();
        assert.ok(!again.extras.fetched.includes(market.suggestion.uri), "XO's file was not fetched again after the restart");
        // The creator can still answer: accept, sign, send once; the market goes active.
        const respond = await flowRespond(again, who, { ...run, fileText: run.fileText }, true);
        assert.equal(respond["submit"]?.code, "submitted", respond["prepare"]?.text.slice(0, 300));
        assert.equal(respond["track"]?.code, "active", respond["track"]?.text.slice(0, 300));
        assert.equal(sends(again), 2, "the creation and the answer, nothing else");
        await held(again, `update window across a ${how}`);
      });

      harness.it("a seed prepared and signed, not sent: it survives the restart and rests once", async (mock) => {
        const { cs, who } = await start(mock, transport);
        mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
        const run = await flowCreate(cs, who, 0);
        await flowReview(cs, run, 700);
        const prepare = await cs.call(SEED_TOOL, { step: "prepare", owner: who.owner, condition_id: run.conditionId!, outcome: "yes", price: "0.5", ttl_days: 7 });
        const item = await signStep(cs, who, prepare, "seed");
        assert.ok(item !== undefined, prepare.text.slice(0, 300));
        const again = await cs.restart(how);
        const sent = await again.call(SEED_TOOL, { step: "submit", prepared_id: item.id, signature: item.signature });
        assert.equal(sent.code, "accepted", sent.text.slice(0, 300));
        const twice = await again.call(SEED_TOOL, { step: "submit", prepared_id: item.id, signature: item.signature });
        assert.equal(twice.isError, true, "single use");
        assert.equal(posts(again), 1);
        assert.equal(mock.write.orders.size, 1);
        await held(again, `seed across a ${how}`);
      });

      harness.it("the relay dies after XO took the seed: the order is on the book once, never posted again", async (mock) => {
        const { cs, who } = await start(mock, transport);
        mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
        const run = await flowCreate(cs, who, 0);
        await flowReview(cs, run, 700);
        const prepare = await cs.call(SEED_TOOL, { step: "prepare", owner: who.owner, condition_id: run.conditionId!, outcome: "yes", price: "0.5", ttl_days: 7 });
        const item = await signStep(cs, who, prepare, "seed");
        assert.ok(item !== undefined, prepare.text.slice(0, 300));
        crashAt(cs, "order_post", "after");
        const lost = await cs.call(SEED_TOOL, { step: "submit", prepared_id: item.id, signature: item.signature });
        assert.ok(lost.structured !== undefined, lost.text.slice(0, 300));
        const again = await cs.restart("crash");
        const resend = await again.call(SEED_TOOL, { step: "submit", prepared_id: item.id, signature: item.signature });
        assert.equal(resend.isError, true, "an item that may have been posted is never posted again");
        assert.equal(posts(again), 1);
        assert.equal(mock.write.orders.size, 1, "XO holds the seed once");
        await held(again, `seed answer lost then ${how}`);
      });

      harness.it("credentials survive a restart before any creation: the stored key still signs the seed", async (mock) => {
        const { cs, who } = await start(mock, transport);
        const again = await cs.restart(how);
        assert.deepEqual(await checkCreateKept(again), []);
        mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
        const run = await flowCreate(again, who, 0);
        await flowReview(again, run, 700);
        const seed = await flowSeed(again, who, run);
        assert.equal(seed["submit"]?.code, "accepted", seed["prepare"]?.text.slice(0, 300));
        assert.equal(mock.write.credentials.length, 1, "no second key was minted");
        await held(again, `credentials across a ${how}`);
      });
    });
  }
}

void identityOf;
