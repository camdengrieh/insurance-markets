import assert from "node:assert/strict";
import { describe } from "node:test";

import { PREPARE_CREATE_TOOL, SEED_TOOL } from "../../src/tools/create.js";
import { useMock } from "../mock-xo/testing.js";
import { marketTokens } from "../mock-xo/traders.js";
import { applyProfile, flowFund, intentOf, type MatrixProfile, type Step } from "./helpers.js";
import {
  CREATE_TRANSPORTS,
  assertCreateHeld,
  checkCreateInvariants,
  draftArgs,
  flowCreate,
  flowReview,
  flowSeed,
  readyCreator,
  startCreateStack,
  type CreateStack,
} from "./create-rig.js";
import type { Identity, Transport } from "./helpers.js";

// Caps across every flow of a day: the $1 creation fee, the $10.00 seed (its own $10.80 cap), $10 per ordinary order, the
// $50 daily cap and the funding test cap are all counted together, never exceeded, still counted after a restart, and
// reset by the UTC day. There is NO limit on how many markets one account may create: only the fee and the daily cap.

const OPTIMISTIC: MatrixProfile = { name: "optimistic", base: "optimistic" };
const USD = 1_000_000n;
type Mock = Parameters<typeof applyProfile>[0];

const spentToday = async (cs: CreateStack, who: Identity): Promise<bigint> => (await cs.stack.relay.services.ledger.usageDetail(who.account.toLowerCase())).spentAtomic;
const held = (cs: CreateStack) => cs.stack.relay.services.ledger.list().filter((entry) => entry.state !== "released");
const total = (cs: CreateStack, category: string): bigint => held(cs).filter((entry) => entry.category === category).reduce((sum, entry) => sum + entry.amountAtomic, 0n);

function refusalNamesCap(step: Step, label: string): void {
  assert.equal(step.isError, true, `${label}: refused (${step.text.slice(0, 200)})`);
  assert.equal(step.code, "cap_exceeded", `${label}: ${step.text.slice(0, 300)}`);
  assert.match(step.text, /limit|cap|left/i, `${label}: says which limit`);
  assert.equal(intentOf(step), undefined, `${label}: no signing intent`);
  assert.ok(String(step.structured?.["next_action"] ?? "").length >= 10, `${label}: says what to do`);
}

async function ready(mock: Mock, transport: Transport, env: Record<string, string> = {}, index = 0) {
  applyProfile(mock, OPTIMISTIC);
  const cs = await startCreateStack({ mock, transport, relayEnv: env, pluginEnv: env });
  const who = await readyCreator(cs, index);
  return { cs, who };
}

for (const transport of CREATE_TRANSPORTS) {
  describe(`caps across creation flows over ${transport.name}`, () => {
    const harness = useMock({ chains: { xo: true, base: true } });

    harness.it("no cadence cap: six creations in a row are all prepared and sent; each is one $1 fee against the day, nothing else limits it", async (mock) => {
      const { cs, who } = await ready(mock, transport);
      mock.creation.policy = { decision: "approve", reviewDelayS: 3600, metadataUpdate: false };
      for (let variant = 0; variant < 6; variant += 1) {
        const run = await flowCreate(cs, who, variant);
        assert.equal(run.flow["submit"]?.code, "submitted", `creation ${String(variant)}: ${run.flow["prepare"]?.text.slice(0, 300)}`);
        assert.equal(run.flow["prepare"]?.structured?.["prepared"] !== undefined, true);
        const caps = (run.flow["prepare"]?.structured?.["prepared"] as { caps: { reserved_usd: string; day_remaining_usd: string } }).caps;
        assert.equal(caps.reserved_usd, "1");
        assert.equal(caps.day_remaining_usd, String(49 - variant), `the day's remainder after ${String(variant)} fees already counted`);
      }
      assert.equal(mock.creation.markets.size, 6);
      assert.equal(total(cs, "creation_fee"), 6n * USD);
      assert.equal(cs.stack.relay.services.config.limits.maxDailyAtomic, 50n * USD);
      assertCreateHeld(await checkCreateInvariants(cs), "six creations in a day");
    });

    harness.it("the daily cap counts fees and the seed together: the seed fits, the next creation is refused naming the day's limit, and the refusal holds across a crash", async (mock) => {
      // $12 for the day: the first fee ($1) and the seed ($10.80 worst case) fit, a second fee ($1) does not.
      const env = { XO_MAX_DAILY_USD: "12" };
      const { cs, who } = await ready(mock, transport, env);
      mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
      const a = await flowCreate(cs, who, 0);
      assert.equal(a.flow["submit"]?.code, "submitted", a.flow["prepare"]?.text.slice(0, 300));
      await flowReview(cs, a, 700);
      const seed = await flowSeed(cs, who, a);
      assert.equal(seed["submit"]?.code, "accepted", seed["prepare"]?.text.slice(0, 300));
      assert.equal(total(cs, "seed"), 10_800_000n);
      assert.equal(total(cs, "creation_fee"), USD);
      assert.equal(await spentToday(cs, who), 11_800_000n, "the fee and the seed are counted together against the day");

      const second = await cs.call(PREPARE_CREATE_TOOL, draftArgs(who.owner, 1));
      const file = second.structured?.["metadata_file"] as { url: string; text: string };
      cs.extras.files.set(file.url, file.text);
      const refused = await cs.call(PREPARE_CREATE_TOOL, { ...draftArgs(who.owner, 1), file_is_hosted: true });
      refusalNamesCap(refused, "second creation at the day's limit");
      assert.equal(total(cs, "creation_fee"), USD, "the refused creation holds no fee");
      assert.ok(held(cs).reduce((sum, entry) => (entry.kind === "spend" ? sum + entry.amountAtomic : sum), 0n) <= 12n * USD);

      // The usage is in the store, not in memory.
      const again = await cs.restart("crash");
      const afterCrash = await again.call(PREPARE_CREATE_TOOL, { ...draftArgs(who.owner, 1), file_is_hosted: true });
      refusalNamesCap(afterCrash, "second creation after a crash");
      assert.equal(total(again, "seed"), 10_800_000n, "the seed is still counted");
      assertCreateHeld(await checkCreateInvariants(again, { caps: { order: 10n * USD, day: 12n * USD } }), "day cap across a crash");

      // A new UTC day starts at zero: the same creation now goes through.
      await mock.advance(24 * 3600);
      const nextDay = await again.call(PREPARE_CREATE_TOOL, { ...draftArgs(who.owner, 1), file_is_hosted: true });
      assert.equal(nextDay.outcome, "prepared", `the next UTC day: ${nextDay.text.slice(0, 300)}`);
      assertCreateHeld(await checkCreateInvariants(again, { caps: { order: 10n * USD, day: 12n * USD } }), "day cap after the day rolled over");
    });

    harness.it("a low daily cap at the relay refuses the second fee before anything is signed, and the first fee fits exactly", async (mock) => {
      // The relay owns the day's ledger. $1 of room fits the first fee exactly (no tolerance) and not the second.
      const { cs, who } = await ready(mock, transport, { XO_MAX_DAILY_USD: "1" });
      const first = await flowCreate(cs, who, 0);
      assert.equal(first.flow["submit"]?.code, "submitted", first.flow["prepare"]?.text.slice(0, 300));
      const probe = await cs.call(PREPARE_CREATE_TOOL, draftArgs(who.owner, 1));
      const hosted = probe.structured?.["metadata_file"] as { url: string; text: string };
      cs.extras.files.set(hosted.url, hosted.text);
      const refused = await cs.call(PREPARE_CREATE_TOOL, { ...draftArgs(who.owner, 1), file_is_hosted: true });
      refusalNamesCap(refused, "a second fee with the day's $1 spent");
      assert.equal(total(cs, "creation_fee"), USD);
      assert.equal(mock.creation.markets.size, 1);
      assertCreateHeld(await checkCreateInvariants(cs, { caps: { order: 10n * USD, day: USD } }), "a $1 day");
    });

    harness.it("the seed has its own $10.80 cap: it is not an ordinary $10 order, and an ordinary order of the same size is refused", async (mock) => {
      const { cs, who } = await ready(mock, transport);
      mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
      const a = await flowCreate(cs, who, 0);
      await flowReview(cs, a, 700);
      const seed = await flowSeed(cs, who, a);
      assert.equal(seed["submit"]?.code, "accepted", seed["prepare"]?.text.slice(0, 300));
      const reserved = held(cs).find((entry) => entry.category === "seed");
      assert.equal(reserved?.amountAtomic, 10_800_000n, "the seed reserves its stake plus the fee bound");
      assert.ok((reserved?.amountAtomic ?? 0n) > 10n * USD, "above the ordinary order cap, within the seed cap");
      // The same $10.80 as an ordinary order is over the $10 order cap.
      const tokens = marketTokens(mock, "clob-active-a");
      const ordinary = await cs.stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.5", shares: "20" });
      refusalNamesCap(ordinary, "an ordinary order that costs $10.80 with the fee bound");
      // A seed that does not make exactly $10.00 is refused before the relay is asked, and the refusal lists the prices that do.
      const odd = await cs.call(SEED_TOOL, { step: "prepare", owner: who.owner, condition_id: a.conditionId!, outcome: "yes", price: "0.37" });
      assert.equal(odd.isError, true);
      assert.equal(intentOf(odd), undefined);
      assert.match(odd.text, /0\.5/, "the refusal lists the valid prices");
      // The relay, asked directly (a client that skips the plugin's checks), refuses a bigger seed and a seed on someone else's token.
      const bigger = await cs.stack.client().post("/v1/order/prepare", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.5", shares: "25", tif: "GTD", ttl_s: 7 * 86_400, post_only: true, purpose: "seed" });
      assert.equal(bigger.ok, false, "a $12.50 seed is refused by the relay");
      if (!bigger.ok) assert.ok(["cap_exceeded", "precondition_failed"].includes(bigger.error.code), bigger.error.code);
      assertCreateHeld(await checkCreateInvariants(cs), "seed cap");
    });

    harness.it("funding, creation and a seed in one day: each cap holds and the total never passes the day's limit", async (mock) => {
      const { cs, who } = await ready(mock, transport);
      mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
      // Funding proposals count against the funding cap, $10 in all: five proposals of different sizes make exactly $10 and the
      // next one is refused (the same amount asked twice is the same proposal, not a second one).
      for (const amount of ["2", "2.5", "3", "1.5", "1"]) {
        const proposal = (await flowFund(cs.stack, who, { amountUsd: amount, execute: false }))["first"]!;
        assert.equal(proposal.isError, false, `${amount}: ${proposal.text.slice(0, 200)}`);
      }
      assert.equal(total(cs, "funding"), 10n * USD);
      const over = (await flowFund(cs.stack, who, { amountUsd: "0.5", execute: false }))["first"]!;
      assert.equal(over.isError, true, "the proposal past $10 is refused");
      assert.ok(String(over.structured?.["code"]).length > 0);
      assert.ok(/Next:/.test(over.text) || String(over.structured?.["next_action"] ?? "").length >= 10, over.text.slice(0, 300));
      assert.equal(total(cs, "funding"), 10n * USD, "the refusal reserved nothing");
      const a = await flowCreate(cs, who, 0);
      await flowReview(cs, a, 700);
      const seed = await flowSeed(cs, who, a);
      assert.equal(seed["submit"]?.code, "accepted", seed["prepare"]?.text.slice(0, 300));
      const spent = await spentToday(cs, who);
      assert.equal(spent, USD + 10_800_000n, "the day holds the $1 fee and the $10.80 seed, and the funding is counted on its own cap");
      assert.ok(spent <= 50n * USD, "the day total is within $50");
      assertCreateHeld(await checkCreateInvariants(cs), "funding, creation and seed in one day");
    });
  });
}
