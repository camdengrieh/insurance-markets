import assert from "node:assert/strict";
import { describe } from "node:test";

import { CANCEL_MARKET_TOOL, PREPARE_CREATE_TOOL, RESPOND_TOOL, SEED_TOOL, SUBMIT_CREATE_TOOL, TRACK_TOOL } from "../../src/tools/create.js";
import { useMock } from "../mock-xo/testing.js";
import type { WriteFlagName } from "../../src/relay/flags.js";
import { applyProfile, intentOf, type MatrixProfile, type Step, type StackOptions } from "./helpers.js";
import {
  CREATE_FLAGS,
  CREATE_TRANSPORTS,
  assertCreateHeld,
  benignSuggestion,
  checkCreateInvariants,
  draftArgs,
  flowCreate,
  flowReview,
  gateMark,
  readyCreator,
  signStep,
  startCreateStack,
  type CreateStack,
} from "./create-rig.js";
import type { Transport } from "./helpers.js";

// Every creation write refuses when its flag is off at EITHER end or the kill switch is on at either end, says which switch
// and why, and leaves nothing behind: no prepared item, no reservation, no upstream write. Reads keep working. The default
// state of every flag is OFF (the relay and the plugin read OFF when the variable is absent).

const OPTIMISTIC: MatrixProfile = { name: "optimistic", base: "optimistic" };
type Mock = Parameters<typeof applyProfile>[0];

const without = (flag: WriteFlagName): WriteFlagName[] => CREATE_FLAGS.filter((name) => name !== flag);

// The two ends: "plugin" (the flag is off in the plugin's environment) and "relay" (off at the relay).
function overrides(end: "plugin" | "relay", flag: WriteFlagName): Partial<StackOptions> {
  return end === "plugin" ? { pluginOn: without(flag) } : { relayOn: without(flag) };
}

function noWritesLeft(cs: CreateStack, label: string): void {
  const { history, relay } = cs.stack;
  assert.equal(history.wire.count((call) => call.kind !== "other"), 0, `${label}: nothing went upstream`);
  assert.deepEqual(relay.services.ledger.list().filter((entry) => entry.state !== "released"), [], `${label}: nothing is reserved`);
  assert.equal(relay.services.prepared.list().length, 0, `${label}: no prepared item exists`);
  assert.equal(cs.stack.mock.creation.markets.size, 0, `${label}: no market`);
  assert.equal(cs.stack.mock.write.orders.size, 0, `${label}: no order`);
}

function refusedBecause(step: Step, words: RegExp, label: string): void {
  assert.equal(step.isError, true, `${label}: refused (${step.text.slice(0, 200)})`);
  assert.ok(["flag_off", "kill_switch"].includes(String(step.code)), `${label}: coded as flag_off or kill_switch, got ${String(step.code)}`);
  assert.match(step.text, words, `${label}: names the switch`);
  assert.ok(String(step.structured?.["next_action"] ?? "").length >= 10, `${label}: says what to do`);
  assert.equal(intentOf(step), undefined, `${label}: no signing intent`);
}

// A creator with three markets in three states, made with everything on: A approved and active, B waiting for an answer to
// XO's update request (the diff guard passed), C pending its first review.
async function withMarkets(mock: Mock, transport: Transport) {
  applyProfile(mock, OPTIMISTIC);
  const cs = await startCreateStack({ mock, transport });
  const who = await readyCreator(cs);
  mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
  const a = await flowCreate(cs, who, 0);
  await flowReview(cs, a, 700);
  mock.creation.policy = { decision: "update", reviewDelayS: 300, windowS: 48 * 3600, changeExpiry: false, metadataUpdate: false };
  const b = await flowCreate(cs, who, 1);
  await mock.advance(305);
  const suggestion = mock.creation.markets.get(b.conditionId!)?.suggestion;
  assert.ok(suggestion != null && b.fileText !== undefined, "the oracle asked for an update");
  cs.extras.files.set(suggestion.uri, benignSuggestion(b.fileText));
  await cs.tick();
  mock.creation.policy = { decision: "approve", reviewDelayS: 3600, metadataUpdate: false };
  const c = await flowCreate(cs, who, 2);
  assert.ok(a.conditionId !== undefined && b.conditionId !== undefined && c.conditionId !== undefined);
  return { cs, who, a: a.conditionId, b: b.conditionId, c: c.conditionId };
}

for (const transport of CREATE_TRANSPORTS) {
  describe(`creation switches over ${transport.name}`, () => {
    const harness = useMock({ chains: { xo: true, base: false } });

    for (const flag of ["XO_ENABLE_CREATE", "ENABLE_SELF_HOSTED_METADATA"] as const) {
      for (const end of ["plugin", "relay"] as const) {
        harness.it(`${flag} off at the ${end}: xo_prepare_create_market refuses, names the flag, creates nothing`, async (mock) => {
          applyProfile(mock, OPTIMISTIC);
          const cs = await startCreateStack({ mock, transport, ...overrides(end, flag) });
          const who = await readyCreator(cs);
          const args = draftArgs(who.owner, 0);
          const first = await cs.call(PREPARE_CREATE_TOOL, args);
          cs.extras.files.set(String(args["metadata_url"]), (first.structured?.["metadata_file"] as { text?: string } | undefined)?.text ?? "{}");
          const second = await cs.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
          if (end === "plugin") refusedBecause(first, new RegExp(flag), `${flag} ${end} first call`);
          refusedBecause(second, new RegExp(flag), `${flag} ${end} second call`);
          // A relay that is called directly (a client that skips the plugin's own check) refuses too.
          if (end === "relay") {
            const hosted = String(args["metadata_url"]);
            const direct = await cs.stack.client().post("/v1/userop/prepare", {
              owner: who.owner,
              action: "create_market",
              params: { metadata_uri: hosted, expires_at: "2027-01-01T00:00:00Z", title: String(args["title"]) },
            });
            assert.equal(direct.ok, false, "the relay refuses a creation with the flag off");
            if (!direct.ok) assert.equal(direct.error.code, "flag_off");
          }
          // The only things in the ledger are the connect and funding setup's: no fee, no seed.
          assert.equal(cs.stack.relay.services.ledger.list().filter((entry) => entry.state !== "released" && entry.category !== "funding").length, 0);
          assert.equal(cs.stack.relay.services.prepared.list().filter((item) => item.kind === "create").length, 0);
          assert.equal(cs.stack.history.wire.count((call) => call.kind === "bundler_send"), 0);
          assert.equal(mock.creation.markets.size, 0);
          assertCreateHeld(await checkCreateInvariants(cs), `${flag} off at the ${end}`);
        });
      }
    }

    for (const end of ["plugin", "relay"] as const) {
      harness.it(`kill switch on at the ${end}: every creation write refuses with kill_switch; the reads still work`, async (mock) => {
        const { cs, who, a, b, c } = await withMarkets(mock, transport);
        const mark = gateMark(cs);
        const sendsBefore = cs.stack.history.wire.count((call) => call.kind === "bundler_send" || call.kind === "order_post");
        const reservedBefore = cs.stack.relay.services.ledger.list().filter((entry) => entry.state !== "released").length;
        const killed = await cs.restart("close", end === "plugin" ? { pluginKill: true } : { relayKill: true });
        const args = draftArgs(who.owner, 5);
        const steps = [
          await killed.call(PREPARE_CREATE_TOOL, args),
          await killed.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true }),
          await killed.call(CANCEL_MARKET_TOOL, { step: "prepare", owner: who.owner, condition_id: c }),
          await killed.call(RESPOND_TOOL, { step: "prepare", owner: who.owner, condition_id: b, accept: true }),
          await killed.call(SEED_TOOL, { step: "prepare", owner: who.owner, condition_id: a, outcome: "yes", price: "0.5" }),
        ];
        for (const step of steps) {
          // At the relay the plugin cannot know: a creation file is still handed over without any write.
          if (end === "relay" && step.outcome === "metadata_ready") continue;
          assert.equal(step.isError, true, `${step.tool}: ${step.text.slice(0, 160)}`);
          assert.equal(step.code, "kill_switch", `${step.tool}: ${step.text.slice(0, 200)}`);
          assert.match(step.text, /kill/i);
          assert.equal(intentOf(step), undefined, `${step.tool}: no signing intent under the kill switch`);
        }
        // Reads are not writes.
        const read = await killed.call(TRACK_TOOL, { condition_id: a });
        assert.equal(read.isError, false, read.text.slice(0, 200));
        const list = await killed.call(TRACK_TOOL, { owner: who.owner });
        assert.equal(list.isError, false, list.text.slice(0, 200));
        assert.equal(killed.stack.history.wire.count((call) => call.kind === "bundler_send" || call.kind === "order_post"), sendsBefore, "nothing was sent under the kill switch");
        assert.equal(killed.stack.relay.services.ledger.list().filter((entry) => entry.state !== "released").length, reservedBefore, "the refusals reserved nothing");
        assertCreateHeld(await checkCreateInvariants(killed, mark), `kill switch at the ${end}`);
      });
    }

    for (const end of ["plugin", "relay"] as const) {
      harness.it(`ENABLE_USEROP_SUBMIT off at the ${end}: a creation can be looked at but not signed or sent, and a signed item waits until the flag is on`, async (mock) => {
        applyProfile(mock, OPTIMISTIC);
        const cs = await startCreateStack({ mock, transport });
        const who = await readyCreator(cs);
        mock.creation.policy = { decision: "approve", reviewDelayS: 900, metadataUpdate: false };
        const args = draftArgs(who.owner, 0);
        const first = await cs.call(PREPARE_CREATE_TOOL, args);
        const hosted = first.structured?.["metadata_file"] as { url: string; text: string };
        cs.extras.files.set(hosted.url, hosted.text);
        const prepared = await cs.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
        const item = await signStep(cs, who, prepared);
        assert.ok(item !== undefined, prepared.text.slice(0, 300));

        const mark = gateMark(cs);
        const off = await cs.restart("close", overrides(end, "ENABLE_USEROP_SUBMIT"));
        const refused = await off.call(SUBMIT_CREATE_TOOL, { prepared_id: item.id, signature: item.signature });
        refusedBecause(refused, /ENABLE_USEROP_SUBMIT|XO_ENABLE_CREATE/, `submit with ENABLE_USEROP_SUBMIT off at the ${end}`);
        assert.equal(off.stack.history.wire.count((call) => call.kind === "bundler_send"), 0, "nothing was sent with the flag off");
        // A creation prepared while the flag is off is a dry run: shown, never signable.
        const dry = await off.call(PREPARE_CREATE_TOOL, { ...draftArgs(who.owner, 1), file_is_hosted: true });
        const dryFile = await off.call(PREPARE_CREATE_TOOL, draftArgs(who.owner, 1));
        assert.ok(dryFile.structured !== undefined);
        assert.ok(dry.outcome === "dry_run" || dry.isError, `a prepare with sending off is a dry run or a refusal: ${dry.text.slice(0, 200)}`);

        assertCreateHeld(await checkCreateInvariants(off, mark), `ENABLE_USEROP_SUBMIT off at the ${end}`);
        // Switched on again, the same signed item is still good, and it is sent exactly once.
        const on = await off.restart("close", { relayOn: CREATE_FLAGS, pluginOn: CREATE_FLAGS });
        const sent = await on.call(SUBMIT_CREATE_TOOL, { prepared_id: item.id, signature: item.signature });
        assert.equal(sent.outcome, "submitted", sent.text.slice(0, 300));
        await on.stack.mock.advance(15);
        assert.equal(on.stack.history.wire.count((call) => call.kind === "bundler_send"), 1);
        assertCreateHeld(await checkCreateInvariants(on), `ENABLE_USEROP_SUBMIT switched on again after the ${end}`);
      });
    }

    for (const flag of ["XO_ENABLE_CREATE", "ENABLE_TRADING"] as const) {
      for (const end of ["plugin", "relay"] as const) {
        harness.it(`${flag} off at the ${end}: xo_place_seed refuses and no order is prepared or posted`, async (mock) => {
          const { cs, who, a } = await withMarkets(mock, transport);
          const mark = gateMark(cs);
          const reservedBefore = cs.stack.relay.services.ledger.list().filter((entry) => entry.state !== "released").length;
          const off = await cs.restart("close", overrides(end, flag));
          const seed = await off.call(SEED_TOOL, { step: "prepare", owner: who.owner, condition_id: a, outcome: "yes", price: "0.5", ttl_days: 7 });
          refusedBecause(seed, new RegExp(flag), `seed with ${flag} off at the ${end}`);
          assert.equal(off.stack.history.wire.count((call) => call.kind === "order_post"), 0);
          assert.equal(mock.write.orders.size, 0);
          assert.equal(off.stack.relay.services.ledger.list().filter((entry) => entry.state !== "released").length, reservedBefore, "the refusal reserved nothing");
          // The relay itself, asked directly for a seed order with its own flag off, refuses too.
          if (end === "relay") {
            const direct = await off.stack.client().post("/v1/order/prepare", { owner: who.owner, token_id: "1", side: "BUY", price: "0.5", shares: "20", tif: "GTD", ttl_s: 7 * 86_400, post_only: true, purpose: "seed" });
            assert.equal(direct.ok, false);
            if (!direct.ok) assert.ok(["flag_off", "kill_switch"].includes(direct.error.code), direct.error.code);
          }
          assertCreateHeld(await checkCreateInvariants(off, mark), `seed with ${flag} off at the ${end}`);
        });
      }
    }

    for (const end of ["plugin", "relay"] as const) {
      harness.it(`XO_ENABLE_CREATE off at the ${end}: cancel and respond refuse at prepare and at submit`, async (mock) => {
        const { cs, who, b, c } = await withMarkets(mock, transport);
        // An accept prepared and signed while everything is on...
        const accept = await cs.call(RESPOND_TOOL, { step: "prepare", owner: who.owner, condition_id: b, accept: true });
        const item = await signStep(cs, who, accept);
        assert.ok(item !== undefined, accept.text.slice(0, 300));
        const mark = gateMark(cs);
        const sendsBefore = cs.stack.history.wire.count((call) => call.kind === "bundler_send");
        const off = await cs.restart("close", overrides(end, "XO_ENABLE_CREATE"));
        // ...is not sent once the flag is off, and neither can anything new be prepared.
        const submit = await off.call(RESPOND_TOOL, { step: "submit", prepared_id: item.id, signature: item.signature });
        refusedBecause(submit, /XO_ENABLE_CREATE/, `respond submit at the ${end}`);
        const prepare = await off.call(RESPOND_TOOL, { step: "prepare", owner: who.owner, condition_id: b, accept: false });
        refusedBecause(prepare, /XO_ENABLE_CREATE/, `respond prepare at the ${end}`);
        const cancel = await off.call(CANCEL_MARKET_TOOL, { step: "prepare", owner: who.owner, condition_id: c });
        refusedBecause(cancel, /XO_ENABLE_CREATE/, `cancel prepare at the ${end}`);
        assert.equal(off.stack.history.wire.count((call) => call.kind === "bundler_send"), sendsBefore, "nothing more was sent");
        assertCreateHeld(await checkCreateInvariants(off, mark), `respond and cancel with XO_ENABLE_CREATE off at the ${end}`);
      });
    }

    harness.it("everything off (the default): the six tools write nothing, track still reads", async (mock) => {
      applyProfile(mock, OPTIMISTIC);
      const cs = await startCreateStack({ mock, transport, relayOn: [], pluginOn: [] });
      const who = (await import("./helpers.js")).identityOf(mock, 0);
      const args = draftArgs(who.owner, 0);
      const steps = [
        await cs.call(PREPARE_CREATE_TOOL, args),
        await cs.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true }),
        await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: "ab".repeat(16), signature: `0x${"11".repeat(32)}${"22".repeat(32)}1b` }),
        await cs.call(RESPOND_TOOL, { step: "prepare", owner: who.owner, condition_id: `0x${"c0".repeat(32)}`, accept: false }),
        await cs.call(CANCEL_MARKET_TOOL, { step: "prepare", owner: who.owner, condition_id: `0x${"c0".repeat(32)}` }),
        await cs.call(SEED_TOOL, { step: "prepare", owner: who.owner, condition_id: `0x${"c0".repeat(32)}`, outcome: "yes", price: "0.5" }),
      ];
      for (const step of steps) refusedBecause(step, /XO_ENABLE_CREATE|ENABLE_SELF_HOSTED_METADATA|ENABLE_TRADING|ENABLE_USEROP_SUBMIT/, step.tool);
      const read = await cs.call(TRACK_TOOL, { owner: who.owner });
      assert.equal(read.isError, false, read.text.slice(0, 200));
      assert.equal(cs.stack.history.wire.count((call) => call.kind !== "other"), 0);
      assertCreateHeld(await checkCreateInvariants(cs), "everything off");
    });
  });
}
