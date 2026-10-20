import assert from "node:assert/strict";
import { describe } from "node:test";

import { PREPARE_CREATE_TOOL, SEED_TOOL, SUBMIT_CREATE_TOOL } from "../../src/tools/create.js";
import { useMock } from "../mock-xo/testing.js";
import { applyProfile, identityOf, intentOf, type MatrixProfile, type Step } from "./helpers.js";
import {
  CREATE_TRANSPORTS,
  assertCreateHeld,
  checkCreateInvariants,
  draftArgs,
  flowCreate,
  flowReview,
  flowSeed,
  readyCreator,
  signStep,
  startCreateStack,
  type CreateStack,
} from "./create-rig.js";
import type { Identity } from "./helpers.js";

// Things that happen at the same time. One draft prepared twice at once, one item submitted twice at once, three seeds asked
// for when only one fits the day, two operations prepared against the same account nonce, and two owners working side by side
// on one relay: the invariants hold in each, and the caps are never passed by a race.

const OPTIMISTIC: MatrixProfile = { name: "optimistic", base: "optimistic" };
const USD = 1_000_000n;
// Callers that run at the same time share the mock's clock, and the relay's pacing waits move it: a call can run out of its own
// time budget (budget_exceeded) for reasons that depend on the interleaving. That answer is stable, holds nothing and is
// allowed for any caller; what must hold in EVERY interleaving is asserted exactly, and at least one caller must have got a
// real answer from the relay.
const BUDGET = "budget_exceeded";
const sends = (cs: CreateStack): number => cs.stack.history.wire.count((call) => call.kind === "bundler_send");
const held = (cs: CreateStack, category: string) => cs.stack.relay.services.ledger.list().filter((entry) => entry.category === category && entry.state !== "released");

async function host(cs: CreateStack, who: Identity, variant: number): Promise<Record<string, unknown>> {
  const args = draftArgs(who.owner, variant);
  const file = await cs.call(PREPARE_CREATE_TOOL, args);
  const hosted = file.structured?.["metadata_file"] as { url: string; text: string };
  cs.extras.files.set(hosted.url, hosted.text);
  return { ...args, file_is_hosted: true };
}

for (const transport of CREATE_TRANSPORTS) {
  describe(`concurrency on the creation path over ${transport.name}`, () => {
    const harness = useMock({ chains: { xo: true, base: false } });

    harness.it("one draft prepared twice at once: one item, one fee; the loser is refused and says why", async (mock) => {
      applyProfile(mock, OPTIMISTIC);
      const cs = await startCreateStack({ mock, transport });
      const who = await readyCreator(cs);
      const args = await host(cs, who, 0);
      const both = await Promise.all([cs.call(PREPARE_CREATE_TOOL, args), cs.call(PREPARE_CREATE_TOOL, args), cs.call(PREPARE_CREATE_TOOL, args)]);
      const won = both.filter((step) => step.outcome === "prepared");
      assert.ok(won.length <= 1, `at most one item for one draft: ${both.map((step) => step.code).join(",")}`);
      assert.ok(both.some((step) => step.outcome === "prepared" || step.code === "precondition_failed"), "someone got the relay's answer");
      for (const step of both.filter((entry) => entry.isError)) {
        assert.ok(["precondition_failed", BUDGET].includes(String(step.code)), step.text.slice(0, 200));
        assert.equal(intentOf(step), undefined);
      }
      assert.ok(held(cs, "creation_fee").length <= 1, "never more than one fee for one draft");
      assert.equal(held(cs, "creation_fee").length, won.length, "the fee is held exactly when an item was handed out");
      assertCreateHeld(await checkCreateInvariants(cs), "three prepares of one draft at once");
    });

    harness.it("one signed item submitted three times at once: one send, one market; the others are refused", async (mock) => {
      applyProfile(mock, OPTIMISTIC);
      const cs = await startCreateStack({ mock, transport });
      const who = await readyCreator(cs);
      mock.creation.policy = { decision: "approve", reviewDelayS: 900, metadataUpdate: false };
      const prepare = await cs.call(PREPARE_CREATE_TOOL, await host(cs, who, 0));
      const item = await signStep(cs, who, prepare);
      assert.ok(item !== undefined);
      const args = { prepared_id: item.id, signature: item.signature };
      const replies = await Promise.all([cs.call(SUBMIT_CREATE_TOOL, args), cs.call(SUBMIT_CREATE_TOOL, args), cs.call(SUBMIT_CREATE_TOOL, args)]);
      assert.ok(replies.filter((step) => step.outcome === "submitted").length <= 1, replies.map((step) => `${String(step.code)}`).join(","));
      for (const step of replies.filter((entry) => entry.isError)) assert.match(String(step.code), /prepared_used|ambiguous|pending|not_found|budget_exceeded/, step.text.slice(0, 200));
      await mock.advance(15);
      assert.equal(sends(cs), 1, "one send for one prepared item, however many callers");
      assert.equal(mock.creation.markets.size, 1);
      assertCreateHeld(await checkCreateInvariants(cs), "three submits of one item at once");
    });

    harness.it("three seeds asked for at once when only one fits the day: one is prepared, the cap is never passed by the race", async (mock) => {
      applyProfile(mock, OPTIMISTIC);
      const env = { XO_MAX_DAILY_USD: "13" };
      const cs = await startCreateStack({ mock, transport, relayEnv: env, pluginEnv: env });
      const who = await readyCreator(cs);
      mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
      const run = await flowCreate(cs, who, 0);
      await flowReview(cs, run, 700);
      const ask = (): Promise<Step> => cs.call(SEED_TOOL, { step: "prepare", owner: who.owner, condition_id: run.conditionId!, outcome: "yes", price: "0.5", ttl_days: 7 });
      const replies = await Promise.all([ask(), ask(), ask()]);
      const prepared = replies.filter((step) => step.outcome === "prepared");
      assert.ok(prepared.length <= 1, `only one seed fits the day: ${replies.map((step) => String(step.code)).join(",")}`);
      assert.ok(replies.some((step) => step.outcome === "prepared" || step.code === "cap_exceeded"), "someone got the relay's answer");
      for (const step of replies.filter((entry) => entry.isError)) {
        assert.ok(["cap_exceeded", BUDGET].includes(String(step.code)), step.text.slice(0, 200));
        assert.equal(intentOf(step), undefined);
      }
      assert.equal(held(cs, "seed").length, prepared.length, "a seed is reserved exactly when an item was handed out");
      assertCreateHeld(await checkCreateInvariants(cs, { caps: { order: 10n * USD, day: 13n * USD } }), "three seeds at the cap");
    });

    harness.it("two creations prepared before either is sent share the account's nonce: the first lands, the second is refused with nothing sent and can be prepared again", async (mock) => {
      applyProfile(mock, OPTIMISTIC);
      const cs = await startCreateStack({ mock, transport });
      const who = await readyCreator(cs);
      mock.creation.policy = { decision: "approve", reviewDelayS: 900, metadataUpdate: false };
      const first = await cs.call(PREPARE_CREATE_TOOL, await host(cs, who, 0));
      const second = await cs.call(PREPARE_CREATE_TOOL, await host(cs, who, 1));
      assert.equal(first.outcome, "prepared", first.text.slice(0, 200));
      assert.equal(second.outcome, "prepared", second.text.slice(0, 200));
      const a = await signStep(cs, who, first);
      const b = await signStep(cs, who, second);
      const sentA = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: a!.id, signature: a!.signature });
      assert.equal(sentA.outcome, "submitted", sentA.text.slice(0, 300));
      await mock.advance(15);
      const sentB = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: b!.id, signature: b!.signature });
      assert.equal(sentB.isError, true, "the second item was built on a nonce that has been used");
      assert.match(String(sentB.code), /stale_nonce|rejected|expired/, sentB.text.slice(0, 300));
      assert.equal(sends(cs), 1, "the stale item was not sent");
      assert.equal(mock.creation.markets.size, 1);
      // The refused item is still a valid prepared copy of its draft, so that draft waits for it to run out (five minutes).
      const waiting = await cs.call(PREPARE_CREATE_TOOL, await host(cs, who, 1));
      assert.equal(waiting.isError, true, "the same draft is not prepared a second time while the stale item is valid");
      assert.equal(intentOf(waiting), undefined);
      await mock.advance(400);
      const again = await cs.call(PREPARE_CREATE_TOOL, await host(cs, who, 1));
      assert.equal(again.outcome, "prepared", again.text.slice(0, 300));
      const c = await signStep(cs, who, again);
      const sentC = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: c!.id, signature: c!.signature });
      assert.equal(sentC.outcome, "submitted", sentC.text.slice(0, 300));
      await mock.advance(15);
      assert.equal(mock.creation.markets.size, 2);
      assertCreateHeld(await checkCreateInvariants(cs), "two creations on one nonce");
    });

    harness.it("two owners side by side: each creates and seeds its own market, neither sees the other's cap or seed rights", async (mock) => {
      applyProfile(mock, OPTIMISTIC);
      // $12 a day each: one fee and one seed fit, a second fee does not.
      const env = { XO_MAX_DAILY_USD: "12" };
      const cs = await startCreateStack({ mock, transport, relayEnv: env, pluginEnv: env });
      const one = await readyCreator(cs, 0);
      const two = await readyCreator(cs, 1);
      mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
      const [runOne, runTwo] = await Promise.all([flowCreate(cs, one, 0), flowCreate(cs, two, 1)]);
      assert.equal(runOne.flow["submit"]?.code, "submitted", runOne.flow["prepare"]?.text.slice(0, 300));
      assert.equal(runTwo.flow["submit"]?.code, "submitted", runTwo.flow["prepare"]?.text.slice(0, 300));
      assert.notEqual(runOne.conditionId, runTwo.conditionId);
      await flowReview(cs, runOne, 700);
      const seeds = await Promise.all([flowSeed(cs, one, runOne), flowSeed(cs, two, runTwo)]);
      assert.equal(seeds[0]?.["submit"]?.code, "accepted", seeds[0]?.["prepare"]?.text.slice(0, 300));
      assert.equal(seeds[1]?.["submit"]?.code, "accepted", seeds[1]?.["prepare"]?.text.slice(0, 300));
      // Each owner's day is its own: owner one is at the cap, owner two is at the cap, and neither affected the other.
      for (const who of [one, two]) {
        const probe = await cs.call(PREPARE_CREATE_TOOL, await host(cs, who, who.index + 10));
        assert.equal(probe.code, "cap_exceeded", `${who.owner}: ${probe.text.slice(0, 200)}`);
      }
      // A seed for the other owner's market is refused.
      const crossed = await cs.call(SEED_TOOL, { step: "prepare", owner: two.owner, condition_id: runOne.conditionId!, outcome: "yes", price: "0.5" });
      assert.equal(crossed.code, "market_not_created_by_owner", crossed.text.slice(0, 200));
      // Two accounts, two keys, two creations, two seeds.
      assert.equal(cs.stack.mock.write.credentials.length, 2);
      assert.equal(mock.creation.markets.size, 2);
      assert.equal(held(cs, "creation_fee").length, 2);
      assert.equal(held(cs, "seed").length, 2);
      assertCreateHeld(await checkCreateInvariants(cs, { caps: { order: 10n * USD, day: 12n * USD } }), "two owners");
    });
  });
}

void identityOf;
