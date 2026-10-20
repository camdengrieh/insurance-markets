import assert from "node:assert/strict";
import { describe } from "node:test";

import { getAddress } from "viem";

import { useMock } from "../mock-xo/testing.js";
import { marketTokens } from "../mock-xo/traders.js";
import {
  DAY_CAP_ATOMIC,
  FUNDING_TEST_CAP_ATOMIC,
  ORDER_CAP_ATOMIC,
  applyProfile,
  assertNoViolations,
  checkInvariants,
  creditBalance,
  embeddedTransport,
  ensureDeployedLikeXoApp,
  findSecrets,
  flowConnect,
  flowDeploy,
  flowFund,
  flowOrder,
  httpTransport,
  identityOf,
  intentOf,
  preparedIdOf,
  secretsOf,
  signAndSubmitUserop,
  signIntent,
  startStack,
  type Stack,
  type Transport,
} from "./helpers.js";

// Caps ($10 per order, $50 per day, the funding test cap) across every flow of a day, and the single-send rules, in
// the optimistic world so that a refusal is the guardrail's doing. Both transports.

const transports: readonly Transport[] = [httpTransport, embeddedTransport];

async function readyTrader(stack: Stack, index = 0) {
  const who = identityOf(stack.mock, index);
  await ensureDeployedLikeXoApp(stack, who);
  const connected = await flowConnect(stack, who);
  assert.equal(connected["submit"]?.code, "connected", connected["submit"]?.text.slice(0, 200));
  creditBalance(stack.mock, who.account, 200_000_000n);
  return who;
}

// 22.7 shares at 0.40 is $9.08 of principal and $9.988 worst case with the 1,000 bps fee ceiling (SI-2): under the $10 order cap.
const BIG_BUT_LEGAL = { shares: "22.7", price: "0.4", cancel: false } as const;

for (const transport of transports) {
  describe(`caps and single sends over ${transport.name}`, () => {
    const harness = useMock({ chains: { xo: true, base: true } });

    harness.it("an order above $10 is refused before anything is reserved or signed, and says which cap", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await readyTrader(stack);
      // 30 shares at 0.40 is $12 of principal.
      const over = await flowOrder(stack, who, { shares: "30", price: "0.4", cancel: false });
      assert.equal(over["prepare"]?.isError, true);
      assert.equal(over["prepare"]?.code, "cap_exceeded", over["prepare"]?.text.slice(0, 300));
      assert.match(over["prepare"]?.text ?? "", /order|per order|10/i);
      assert.equal(intentOf(over["prepare"]!), undefined, "no signing intent for an order over the cap");
      // The same order straight at the relay (a client that skips the plugin's own check): refused there too.
      const direct = await stack.client().post("/v1/order/prepare", { owner: who.owner, token_id: marketTokens(mock, "clob-active-a").yes, side: "BUY", price: "0.4", shares: "30", tif: "GTD" });
      assert.equal(direct.ok, false);
      if (!direct.ok) assert.equal(direct.error.code, "cap_exceeded");
      assert.deepEqual(stack.relay.services.ledger.list().filter((r) => r.state !== "released"), [], "nothing was reserved");
      assert.equal(stack.relay.services.config.limits.maxOrderAtomic, 10_000_000n, "the default order cap is $10");
      assert.equal(stack.relay.services.config.limits.maxDailyAtomic, 50_000_000n, "the default day cap is $50");
      assertNoViolations(await checkInvariants(stack), "over-cap order");
    });

    harness.it("five orders fit the $50 day, the sixth is refused, and nothing in the ledger ever exceeds the cap", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await readyTrader(stack);
      const results: string[] = [];
      for (let n = 0; n < 6; n += 1) {
        const flow = await flowOrder(stack, who, BIG_BUT_LEGAL);
        results.push(`${flow["prepare"]?.code}/${flow["submit"]?.code ?? "-"}`);
      }
      assert.deepEqual(results, ["prepared/accepted", "prepared/accepted", "prepared/accepted", "prepared/accepted", "prepared/accepted", "cap_exceeded/-"]);
      const usage = await stack.relay.services.ledger.usageDetail(who.account.toLowerCase());
      assert.ok(usage.spentAtomic <= DAY_CAP_ATOMIC, `spent ${usage.spentAtomic}`);
      for (const reservation of stack.relay.services.ledger.list()) assert.ok(reservation.amountAtomic <= ORDER_CAP_ATOMIC, `reservation ${reservation.id}`);
      assert.equal(mock.write.orders.size, 5);
      const refused = (await stack.call("xo_prepare_order", { owner: who.owner, token_id: marketTokens(mock, "clob-active-a").no, side: "BUY", price: "0.4", shares: "1" }));
      // A small order still fits the remaining $0.32? 1 share at 0.40 costs 0.432: no.
      assert.equal(refused.code, "cap_exceeded", refused.text.slice(0, 200));
      assertNoViolations(await checkInvariants(stack), "day cap");
    });

    harness.it("the day cap is shared by every flow: orders and the funding both count where they should, and funding has its own cap", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await readyTrader(stack);
      // Funding: the lifetime test cap ($10) while no exit is proven. Distinct amounts so each is a new funding.
      const amounts = ["3", "2.99", "2.98", "2.97"];
      const codes: Array<string | undefined> = [];
      for (const amount of amounts) {
        const flow = await flowFund(stack, who, { amountUsd: amount });
        codes.push(flow["first"]?.isError === true ? flow["first"]?.code : "proposal");
      }
      assert.deepEqual(codes, ["proposal", "proposal", "proposal", "not_permitted"], "the fourth funding would pass $10 in total");
      const refused = (await stack.call("xo_fund_account", { owner: who.owner, amount_usd: "2.96" })).text;
      assert.match(refused, /cap|total|limit|exceed/i, "the refusal names the cap that stopped it");
      const lifetime = (await stack.relay.services.ledger.usageDetail(who.account.toLowerCase())).fundedLifetimeAtomic;
      assert.ok(lifetime <= FUNDING_TEST_CAP_ATOMIC, `funded ${lifetime}`);
      // Funding does not eat the order allowance.
      const order = await flowOrder(stack, who, BIG_BUT_LEGAL);
      assert.equal(order["submit"]?.code, "accepted");
      assertNoViolations(await checkInvariants(stack), "funding and orders");
    });

    harness.it("the cap is exact at its edge: the largest legal size at a price is prepared, one step more is refused", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await readyTrader(stack);
      const tokens = marketTokens(mock, "clob-active-a");
      // At 0.400: 22.727 shares cost 9.0908 and, with the 1,000 bps fee ceiling, at most 9.99988. 22.728 would be 10.00032.
      const legal = await stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "22.727" });
      assert.equal(legal.code, "prepared", legal.text.slice(0, 300));
      const quote = (legal.structured?.["prepared"] as { quote: { max_outlay_usd: string } }).quote;
      assert.equal(quote.max_outlay_usd, "9.99988", "the quote is the exact worst case");
      const over = await stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.no, side: "BUY", price: "0.4", shares: "22.728" });
      assert.equal(over.code, "cap_exceeded", over.text.slice(0, 300));
      assertNoViolations(await checkInvariants(stack), "cap edge");
    });

    harness.it("concurrent prepares cannot slip past the day cap", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await readyTrader(stack);
      const tokens = marketTokens(mock, "clob-active-a");
      const attempts = await Promise.all(Array.from({ length: 9 }, (_, n) => stack.call("xo_prepare_order", { owner: who.owner, token_id: n % 2 === 0 ? tokens.yes : tokens.no, side: "BUY", price: "0.4", shares: "22.7" })));
      const codes = attempts.map((step) => step.code);
      assert.equal(codes.filter((code) => code === "prepared").length, 5, `five fit: ${codes.join(",")}`);
      assert.equal(codes.filter((code) => code === "cap_exceeded").length, 4, codes.join(","));
      const usage = await stack.relay.services.ledger.usageDetail(who.account.toLowerCase());
      assert.ok(usage.spentAtomic <= DAY_CAP_ATOMIC, `spent ${usage.spentAtomic}`);
      assertNoViolations(await checkInvariants(stack), "concurrent prepares");
    });

    harness.it("the day is a UTC day: the cap starts again at midnight, and an item prepared before it is spent on the day it was prepared", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await readyTrader(stack);
      for (let n = 0; n < 5; n += 1) assert.equal((await flowOrder(stack, who, BIG_BUT_LEGAL))["submit"]?.code, "accepted");
      assert.equal((await flowOrder(stack, who, BIG_BUT_LEGAL))["prepare"]?.code, "cap_exceeded");
      const ledger = stack.relay.services.ledger;
      const dayOne = ledger.currentDay();
      // Just before midnight: prepare and sign an order that is still within the cap of... nothing (the day is full).
      const toMidnight = Date.parse(`${dayOne}T23:59:30Z`) - mock.clock.nowMs();
      mock.clock.advanceMs(toMidnight);
      creditBalance(mock, who.account, 200_000_000n);
      assert.equal((await flowOrder(stack, who, BIG_BUT_LEGAL))["prepare"]?.code, "cap_exceeded", "still the same day");
      mock.clock.advanceMs(60_000);
      assert.notEqual(ledger.currentDay(), dayOne);
      const next = await flowOrder(stack, who, BIG_BUT_LEGAL);
      assert.equal(next["prepare"]?.code, "prepared", `a new day starts from zero: ${next["prepare"]?.text.slice(0, 200)}`);
      const usageOne = await ledger.usageDetail(who.account.toLowerCase(), dayOne);
      assert.ok(usageOne.spentAtomic <= DAY_CAP_ATOMIC && usageOne.spentAtomic > 49_000_000n, `day one keeps its spend ${usageOne.spentAtomic}`);
      assertNoViolations(await checkInvariants(stack, { skipScan: true }), "midnight");
    });

    harness.it("an item prepared just before midnight and submitted just after is charged once, to the day it was prepared", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await readyTrader(stack);
      const ledger = stack.relay.services.ledger;
      const dayOne = ledger.currentDay();
      mock.clock.advanceMs(Date.parse(`${dayOne}T23:59:30Z`) - mock.clock.nowMs());
      const tokens = marketTokens(mock, "clob-active-a");
      const prepared = await stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "22.7" });
      assert.equal(prepared.code, "prepared", prepared.text.slice(0, 200));
      const signature = await signIntent(who.key, intentOf(prepared)!);
      stack.history.signed.push({ preparedId: preparedIdOf(prepared), digest: "order", by: who.owner });
      mock.clock.advanceMs(60_000);
      assert.notEqual(ledger.currentDay(), dayOne);
      const sent = await stack.call("xo_submit_order", { prepared_id: preparedIdOf(prepared), signature });
      assert.ok(sent.code === "accepted" || sent.isError, sent.text.slice(0, 200));
      if (sent.isError) assert.ok(String(sent.structured?.["next_action"] ?? "").length >= 10, sent.text.slice(0, 300));
      const one = await ledger.usageDetail(who.account.toLowerCase(), dayOne);
      const two = await ledger.usageDetail(who.account.toLowerCase());
      assert.equal(one.spentAtomic, 9_988_000n, "charged to the day it was prepared");
      assert.equal(two.spentAtomic, 0n, "not charged again to the next day");
      assertNoViolations(await checkInvariants(stack, { skipScan: true }), "across midnight");
    });

    harness.it("caps are configurable downwards at either end and never above the compiled-in ceiling", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const tokens = marketTokens(mock, "clob-active-a");
      const order = (stack: Stack, who: Awaited<ReturnType<typeof readyTrader>>, shares: string) => stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.4", shares });
      // Lowered at the plugin only: the plugin refuses and the relay is never asked to prepare.
      const lowPlugin = await startStack({ mock, transport, pluginEnv: { XO_MAX_ORDER_USD: "5" } });
      const who = await readyTrader(lowPlugin);
      const before = lowPlugin.history.relayWire.filter((entry) => entry.url.endsWith("/v1/order/prepare")).length;
      const refusedLocally = await order(lowPlugin, who, "22.7");
      assert.equal(refusedLocally.code, "cap_exceeded");
      assert.equal(lowPlugin.history.relayWire.filter((entry) => entry.url.endsWith("/v1/order/prepare")).length, before, "refused before the relay");
      assert.equal((await order(lowPlugin, who, "10")).code, "prepared", "$4.40 fits a $5 cap");
      // Lowered at the relay only: the plugin lets it through and the relay refuses.
      const lowRelay = await lowPlugin.restart("close", { pluginEnv: {}, relayEnv: { XO_MAX_ORDER_USD: "5" } });
      const refusedByRelay = await order(lowRelay, who, "22.7");
      assert.equal(refusedByRelay.code, "cap_exceeded", refusedByRelay.text.slice(0, 200));
      assert.ok(lowRelay.history.relayWire.some((entry) => entry.url.endsWith("/v1/order/prepare") && entry.status >= 400), "the relay itself said no");
      // Raised past the ceiling at both ends: clamped to $100 per order and $500 per day.
      const high = await lowRelay.restart("close", { pluginEnv: { XO_MAX_ORDER_USD: "1000", XO_MAX_DAILY_USD: "10000" }, relayEnv: { XO_MAX_ORDER_USD: "1000", XO_MAX_DAILY_USD: "10000" } });
      assert.equal((await order(high, who, "200")).code, "prepared", "$88 is under the $100 ceiling");
      const tooBig = await order(high, who, "300");
      assert.equal(tooBig.code, "cap_exceeded", `$132 is above it: ${tooBig.text.slice(0, 200)}`);
      assertNoViolations(await checkInvariants(high, { skipScan: true, caps: { order: 100_000_000n, day: 500_000_000n } }), "configured caps");
      assert.equal(high.relay.services.config.limits.maxOrderAtomic, 100_000_000n, "clamped to the compiled-in ceiling, not to 1000");
      assert.equal(high.relay.services.config.limits.maxDailyAtomic, 500_000_000n);
    });

    harness.it("a prepared item is single use: the second submit is refused and sends nothing, sequentially and at the same time", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await readyTrader(stack);
      const tokens = marketTokens(mock, "clob-active-a");
      const prepared = await stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "10" });
      const signature = await signIntent(who.key, intentOf(prepared)!);
      stack.history.signed.push({ preparedId: preparedIdOf(prepared), digest: "order", by: who.owner });
      const args = { prepared_id: preparedIdOf(prepared), signature };
      const [a, b] = await Promise.all([stack.call("xo_submit_order", args), stack.call("xo_submit_order", args)]);
      const outcomes = [a, b].map((step) => step.code).sort();
      assert.ok(outcomes.includes("accepted"), `one of two concurrent submits wins: ${outcomes.join(",")}`);
      const loser = a.code === "accepted" ? b : a;
      assert.equal(loser.isError, true, "the other is refused");
      assert.match(String(loser.code), /prepared_used|not_found|ambiguous|pending/, loser.text.slice(0, 200));
      const third = await stack.call("xo_submit_order", args);
      assert.equal(third.isError, true);
      assert.equal(third.code, "prepared_used", third.text.slice(0, 200));
      assert.equal(stack.history.wire.count((call) => call.kind === "order_post"), 1, "exactly one POST /order reached XO");
      assert.equal(mock.write.orders.size, 1);

      // The same for a user operation.
      const deploy = await stack.call("xo_revoke_trading", { step: "prepare", owner: who.owner });
      assert.ok(intentOf(deploy) !== undefined, deploy.text.slice(0, 200));
      const first = await signAndSubmitUserop(stack, "xo_revoke_trading", who, deploy);
      assert.equal(first.code, "submitted");
      const second = await stack.call("xo_revoke_trading", { step: "submit", prepared_id: preparedIdOf(deploy), signature: await signIntent(who.key, intentOf(deploy)!) });
      assert.equal(second.isError, true);
      assert.equal(second.code, "prepared_used", second.text.slice(0, 200));
      assert.equal(stack.history.wire.count((call) => call.kind === "bundler_send"), 1);
      assertNoViolations(await checkInvariants(stack), "single use");
    });

    harness.it("a signature that is not the owner's over the prepared digest sends nothing, and says why", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await readyTrader(stack);
      const stranger = identityOf(mock, 5);
      const tokens = marketTokens(mock, "clob-active-a");
      const one = await stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "10" });
      const two = await stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.no, side: "BUY", price: "0.4", shares: "10" });
      const garbage = `0x${"11".repeat(32)}${"22".repeat(32)}1b`;
      const attempts = [
        { label: "another wallet signed it", step: await stack.call("xo_submit_order", { prepared_id: preparedIdOf(one), signature: await signIntent(stranger.key, intentOf(one)!) }), codes: ["owner_mismatch", "signature_invalid"] },
        { label: "the signature belongs to the other prepared item", step: await stack.call("xo_submit_order", { prepared_id: preparedIdOf(two), signature: await signIntent(who.key, intentOf(one)!) }), codes: ["owner_mismatch", "signature_invalid"] },
        { label: "a well-formed signature over nothing", step: await stack.call("xo_submit_order", { prepared_id: preparedIdOf(two), signature: garbage }), codes: ["owner_mismatch", "signature_invalid"] },
        { label: "an unknown prepared id", step: await stack.call("xo_submit_order", { prepared_id: "ab".repeat(16), signature: garbage }), codes: ["not_found"] },
      ];
      for (const attempt of attempts) {
        assert.equal(attempt.step.isError, true, attempt.label);
        assert.ok(attempt.codes.includes(String(attempt.step.code)), `${attempt.label}: ${String(attempt.step.code)}: ${attempt.step.text.slice(0, 200)}`);
      }
      assert.equal(stack.history.wire.count((call) => call.kind === "order_post"), 0, "nothing was posted for any of them");
      assert.equal(mock.write.orders.size, 0);
      assertNoViolations(await checkInvariants(stack), "bad signatures");
    });

    harness.it("an expired prepared item is refused, and a stale one is never sent", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await readyTrader(stack);
      const tokens = marketTokens(mock, "clob-active-a");
      const prepared = await stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "10" });
      const signature = await signIntent(who.key, intentOf(prepared)!);
      stack.history.signed.push({ preparedId: preparedIdOf(prepared), digest: "order", by: who.owner });
      mock.clock.advanceMs(10 * 60_000);
      const late = await stack.call("xo_submit_order", { prepared_id: preparedIdOf(prepared), signature });
      assert.equal(late.isError, true);
      assert.match(String(late.code), /expired|not_found/, late.text.slice(0, 200));
      assert.equal(stack.history.wire.count((call) => call.kind === "order_post"), 0);
      assertNoViolations(await checkInvariants(stack), "expired");
    });

    harness.it("an undeployed account is never funded: no proposal, no reservation, and the refusal says to deploy first", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = identityOf(mock, 0);
      mock.hyperlane.setBaseBalance(who.owner, 100_000_000n);
      const flow = await flowFund(stack, who, { execute: true });
      const first = flow["first"]!;
      assert.equal(first.isError, true, first.text.slice(0, 300));
      assert.equal(first.structured?.["io.paybox/transactionProposal"], undefined, "no proposal for an undeployed account");
      assert.match(first.text, /deploy/i, "the refusal says to deploy first");
      assert.deepEqual(stack.relay.services.ledger.list(), [], "nothing is reserved for an undeployed account");
      // After the account exists the same call works.
      await flowDeploy(stack, who);
      const after = await flowFund(stack, who);
      assert.equal(after["first"]?.isError, false, after["first"]?.text.slice(0, 300));
      assertNoViolations(await checkInvariants(stack), "undeployed funding");
    });

    harness.it("a caller-supplied account that is not the owner's is refused by the relay (the relay derives it)", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await readyTrader(stack);
      const other = identityOf(mock, 3);
      const tokens = marketTokens(mock, "clob-active-a");
      const attempts = [
        await stack.client().post("/v1/order/prepare", { owner: who.owner, account: other.account, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "10", tif: "GTD" }),
        await stack.client().post("/v1/userop/prepare", { owner: who.owner, account: other.account, action: "revoke_trading", params: {} }),
        await stack.client().post("/v1/account/status", { owner: who.owner, account: other.account }),
        await stack.client().post("/v1/funding/check", { owner: who.owner, account: other.account, amount: "1" }),
      ];
      for (const [index, result] of attempts.entries()) {
        assert.equal(result.ok, false, `attempt ${String(index)}`);
        if (!result.ok) assert.equal(result.error.code, "account_mismatch", `attempt ${String(index)}: ${result.error.message}`);
      }
      assert.deepEqual(stack.relay.services.ledger.list(), []);
      assertNoViolations(await checkInvariants(stack), "account mismatch");
    });

    harness.it("no secret is anywhere: the scanner sees the relay key, the master secret, the triplet and the HMAC signatures, and finds none", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await readyTrader(stack);
      await flowOrder(stack, who);
      const secrets = secretsOf(stack);
      assert.ok(Object.keys(secrets).filter((name) => name.startsWith("triplet_")).length >= 3, "the minted triplet is among the secrets scanned for");
      assert.ok(Object.keys(secrets).some((name) => name.startsWith("hmac_signature_")), "the HMAC signatures the relay sent are among them");
      // Positive control: the scanner does find a secret when one is there.
      const triplet = mock.write.credentials[0]!;
      assert.notDeepEqual(findSecrets("control", `leaked: ${triplet.secret}`, secrets), []);
      for (const pad of ["", "k=", "key="]) {
        assert.notDeepEqual(findSecrets("control", Buffer.from(`${pad}${triplet.apiKey}:tail`).toString("base64"), secrets), [], `a base64 blob holding the key after "${pad}"`);
        assert.notDeepEqual(findSecrets("control", Buffer.from(`${pad}${triplet.apiKey}:tail`).toString("base64url"), secrets), [], `a base64url blob after "${pad}"`);
      }
      assert.deepEqual(findSecrets("control", "nothing secret in here, just words and 0123456789", secrets), []);
      assertNoViolations(await checkInvariants(stack), "leak scan");
      // And the account reads say credentials exist without showing any of them.
      const account = await stack.call("xo_account", { owner: who.owner });
      assert.match(account.text, /credentials present/i);
      assert.ok(getAddress(who.owner) === who.owner);
    });
  });
}
