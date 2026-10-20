import assert from "node:assert/strict";
import { describe } from "node:test";

import { SEED_TOOL } from "../../src/tools/create.js";
import { useMock } from "../mock-xo/testing.js";
import { applyProfile, identityOf, type Step } from "./helpers.js";
import { CREATE_TRANSPORTS, checkCreateInvariants, createJourney, startCreateStack, type CreateInvariantOptions, type CreateStack } from "./create-rig.js";

// The creation invariants are only worth something if each one fires on a run that breaks it. One clean journey is run;
// then, one at a time, the evidence is doctored in the way a real violation would look and the checker must name it. The
// doctoring is undone before the next one, and the clean run must come back clean at the end.

describe("the creation invariant checks fire on a run that breaks them", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  for (const transport of CREATE_TRANSPORTS) {
    harness.it(`over ${transport.name}`, async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const cs = await startCreateStack({ mock, transport });
      const who = identityOf(mock, 0);
      const journey = await createJourney(cs, who);
      assert.equal(journey.flows["seedA"]?.["submit"]?.code, "accepted", "the clean run is a full run");
      const base: CreateInvariantOptions = { skipScan: true };
      assert.deepEqual((await checkCreateInvariants(cs, base)).filter((line) => !/^I7 xo_fund_account/.test(line)), [], "the clean run holds");

      const { history } = cs.stack;
      const seedPrepared = history.prepared.find((item) => item.tool === SEED_TOOL)!;
      const createPrepared = history.prepared.filter((item) => item.tool === "xo_prepare_create_market");
      const firstCreate = createPrepared[0]!;
      const secondCreate = createPrepared[1]!;

      // Runs a doctoring, expects the checker to name it, and puts everything back.
      async function fires(label: string, pattern: RegExp, doctor: () => () => void, options: CreateInvariantOptions = base, on: CreateStack = cs): Promise<void> {
        const undo = doctor();
        try {
          const found = await checkCreateInvariants(on, options);
          assert.ok(found.some((line) => pattern.test(line)), `${label}: expected a violation matching ${String(pattern)}, got\n  ${found.join("\n  ") || "(none)"}`);
        } finally {
          undo();
        }
      }

      // I1 (core): a send nobody prepared.
      await fires("a bundler send no prepared item names", /^I1 a user operation/, () => {
        const fake = { ...history.wire.calls.find((call) => call.kind === "bundler_send")!, seq: 9_999, userOpHash: `0x${"ab".repeat(32)}` };
        history.wire.calls.push(fake);
        return () => void history.wire.calls.pop();
      });

      // C1: one hosted file, two markets (the second creation's evidence says it used the first one's file).
      await fires("two creations from one file", /^C1 the creation of .* was accepted by the bundler 2 times/, () => {
        const original = cs.meta.get(secondCreate.preparedId)!;
        cs.meta.set(secondCreate.preparedId, { ...original, uri: cs.meta.get(firstCreate.preparedId)!.uri! });
        return () => void cs.meta.set(secondCreate.preparedId, original);
      });
      // C1: a market with no accepted creation behind it.
      await fires("a market nobody created", /^C1 \d+ markets exist but only \d+ creation operations/, () => {
        const saved = [...history.prepared];
        history.prepared.length = 0;
        return () => void history.prepared.push(...saved);
      });

      // C2: a fee reservation that belongs to no prepared item the relay holds.
      await fires("a fee with no item", /^C2 creation fee reservation .* belongs to no prepared item/, () => {
        const prepared = cs.stack.relay.services.prepared as unknown as { list: () => unknown[] };
        const original = prepared.list;
        prepared.list = () => [];
        return () => void (prepared.list = original);
      });

      // C3: a seed on a market that is not on the chain, and on a market that is not active.
      await fires("a seed for a market that does not exist", /^C3 a seed was accepted for .* which is not a market on the chain/, () => {
        const original = cs.meta.get(seedPrepared.preparedId)!;
        cs.meta.set(seedPrepared.preparedId, { ...original, conditionId: `0x${"ee".repeat(32)}` });
        return () => void cs.meta.set(seedPrepared.preparedId, original);
      });
      await fires("a seed on a market that is not active", /^C3 a seed was accepted for .* while the market was CANCELLED/, () => {
        const id = cs.meta.get(seedPrepared.preparedId)!.conditionId!;
        const market = mock.creation.markets.get(id as `0x${string}`)!;
        const was = market.status;
        market.status = "CANCELLED";
        return () => void (market.status = was);
      });
      await fires("a seed from an account that is not the creator", /^C3 a seed was accepted for .* from 0x.*, but 0x.* created the market/, () => {
        const original = cs.meta.get(seedPrepared.preparedId)!;
        cs.meta.set(seedPrepared.preparedId, { ...original, account: `0x${"12".repeat(20)}` });
        return () => void cs.meta.set(seedPrepared.preparedId, original);
      });

      // C4 and the core cap check: a fee above the per-order cap, a day above the daily cap, a seed above the seed cap.
      await fires("a fee above the order cap", /^C4 fee reservation/, () => () => undefined, { ...base, caps: { order: 500_000n, day: 50_000_000n } });
      await fires("a day above the daily cap", /^I2 .* spend of .* is above the daily cap/, () => () => undefined, { ...base, caps: { order: 10_000_000n, day: 5_000_000n } });
      await fires("a seed above the seed cap", /^C3 seed reservation .* \(seed cap 5000000\)/, () => () => undefined, { ...base, seedCap: 5_000_000n });

      // C5: the same history judged as if the creation flag, or the hosting flag, or trading, had been off the whole time.
      const judged = (relayOn: readonly string[], extra: Partial<CreateStack["stack"]["options"]> = {}): CreateStack => ({ ...cs, stack: { ...cs.stack, options: { ...cs.stack.options, relayOn: relayOn as never, ...extra } } });
      const all = cs.stack.options.relayOn!;
      await fires("creation sent with XO_ENABLE_CREATE off", /^C5 a xo_prepare_create_market operation reached the bundler/, () => () => undefined, base, judged(all.filter((flag) => flag !== "XO_ENABLE_CREATE")));
      await fires("creation sent with the hosting flag off", /^C5 a xo_prepare_create_market operation reached the bundler/, () => () => undefined, base, judged(all.filter((flag) => flag !== "ENABLE_SELF_HOSTED_METADATA")));
      await fires("a seed posted with ENABLE_TRADING off", /^C5 a seed was posted/, () => () => undefined, base, judged(all.filter((flag) => flag !== "ENABLE_TRADING")));
      await fires("anything sent under the kill switch", /^C5 a xo_prepare_create_market operation reached the bundler/, () => () => undefined, base, judged(all, { relayKill: true }));

      // C6: an answer without a code, a vague code, a refusal with no next step, a call that took too long, an unknown outcome.
      const fake = (over: Partial<Step> & { structured?: Record<string, unknown> }): Step => ({ tool: "xo_track_market", args: {}, isError: false, text: "ok", structured: { code: "tracked_ok", message: "a message that says what happened", next_action: "Check again in a minute.", outcome: "tracked" }, code: undefined, outcome: "tracked", startedMs: 0, endedMs: 1, ...over });
      const withStep = (step: Step) => () => {
        cs.steps.push(step);
        return () => void cs.steps.pop();
      };
      await fires("an answer with no structured result", /^C6 .* returned no structured result/, withStep(fake({ structured: undefined as never })));
      await fires("an answer with no code", /^C6 .* without a stable snake_case code/, withStep(fake({ structured: { message: "a message that says what happened", next_action: "Check again in a minute.", outcome: "tracked" } })));
      await fires("a refusal that says nothing about what to do", /^C6 .* refused \(\w+\) without saying what to do next/, withStep(fake({ isError: true, outcome: "refused", text: "REFUSED", structured: { code: "precondition_failed", message: "something went wrong here", outcome: "refused" } })));
      await fires("a refusal with the vague code internal", /^C9 .* refused with the vague code internal/, withStep(fake({ isError: true, outcome: "refused", text: "Next: x", structured: { code: "internal", message: "something broke somewhere", next_action: "Try again in a moment.", outcome: "refused" } })));
      await fires("a call that took too long", /^C6 .* took \d+ ms on the mock's clock/, withStep(fake({ endedMs: 10 * 60 * 1000 })));
      await fires("an outcome nobody defined", /^C6 .* unknown outcome/, withStep(fake({ outcome: "great_success", structured: { code: "tracked_ok", message: "a message that says what happened", next_action: "Check again in a minute.", outcome: "great_success" } })));
      await fires("a creation reported as submitted with the flag off", /^C5 xo_submit_create_market reported a submit/, withStep(fake({ tool: "xo_submit_create_market", outcome: "submitted", structured: { code: "submitted", message: "a message that says what happened", next_action: "Check again in a minute.", outcome: "submitted" } })), base, judged(all.filter((flag) => flag !== "XO_ENABLE_CREATE")));

      // C7: a secret in what a creation tool said.
      const triplet = mock.write.credentials[0]!;
      await fires("the XO API secret in a tool's text", /^C7 creation tool result \d+ \(xo_track_market\) text holds triplet_1_secret/, withStep(fake({ text: `Market is pending. ${triplet.secret}` })), { ...base, skipScan: false });

      // C8: a signature made for something the relay never prepared.
      await fires("a signature for an unknown item", /^C8 a signature was made for deadbeef/, () => {
        history.signed.push({ preparedId: "deadbeef", digest: "x", by: who.owner });
        return () => void history.signed.pop();
      });

      assert.deepEqual((await checkCreateInvariants(cs, base)).filter((line) => !/^I7 xo_fund_account/.test(line)), [], "after all the doctoring is undone the run is clean again");
    });
  }
});
