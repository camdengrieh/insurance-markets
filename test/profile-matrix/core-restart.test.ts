import assert from "node:assert/strict";
import { describe } from "node:test";

import type { CredentialStep } from "../../relay/credentials.js";
import { useMock } from "../mock-xo/testing.js";
import { marketTokens } from "../mock-xo/traders.js";
import {
  DAY_CAP_ATOMIC,
  applyProfile,
  assertNoViolations,
  checkCredentialsKept,
  checkInvariants,
  conditionId,
  creditBalance,
  embeddedTransport,
  ensureDeployedLikeXoApp,
  flowConnect,
  flowFund,
  flowOrder,
  httpTransport,
  identityOf,
  intentOf,
  preparedIdOf,
  resolveOnChain,
  signAndSubmitUserop,
  signIntent,
  startStack,
  type Identity,
  type MatrixProfile,
  type Stack,
  type Step,
  type Transport,
} from "./helpers.js";

// Restart in the middle of every flow. "Crash" abandons the relay without flushing or releasing anything (what a
// killed process leaves behind); "close" is an orderly stop. After each restart, on the same data directory:
// credentials are still there, no cap was reset, nothing is sent twice, and every answer is actionable.

const transports: readonly Transport[] = [httpTransport, embeddedTransport];
const OPTIMISTIC: MatrixProfile = { name: "optimistic", base: "optimistic" };
const PESSIMISTIC: MatrixProfile = { name: "pessimistic", base: "pessimistic" };

const CREDENTIAL_STEPS: readonly CredentialStep[] = ["l1_derive_done", "create_marker_written", "create_response_received", "triplet_persisted", "flow_stored", "probe_a_done", "validated"];

class Crash extends Error {}

async function readyOwner(stack: Stack, index = 0): Promise<Identity> {
  const who = identityOf(stack.mock, index);
  await ensureDeployedLikeXoApp(stack, who);
  return who;
}

const usageOf = (stack: Stack, who: Identity) => stack.relay.services.ledger.usageDetail(who.account.toLowerCase());

for (const transport of transports) {
  describe(`restart in the middle of each flow over ${transport.name}`, () => {
    const harness = useMock({ chains: { xo: true, base: true } });

    // ---- connect: kill and restart after every credential step ----------------------------------------------------

    for (const profile of [OPTIMISTIC, PESSIMISTIC]) {
      // In the pessimistic profile only the steps around the one irreversible request matter (the rest are the same code).
      const steps = profile === OPTIMISTIC ? CREDENTIAL_STEPS : CREDENTIAL_STEPS.filter((step) => step === "create_marker_written" || step === "create_response_received" || step === "triplet_persisted");
      for (const step of steps) {
        harness.it(`connect, ${profile.name}: the relay dies after ${step}`, async (mock) => {
          applyProfile(mock, profile);
          let armed = true;
          const crashed: { stack?: Stack } = {};
          const stack = await startStack({
            mock,
            transport,
            credentialOptions: {
              onStep: (reached) => {
                if (armed && reached === step) {
                  armed = false;
                  // The process dies here: the socket is cut, nothing more is written, and the handler never answers.
                  void crashed.stack?.handle.abandon().catch(() => undefined);
                  throw new Crash(`the relay was killed after ${reached}`);
                }
              },
            },
          });
          crashed.stack = stack;
          const who = await readyOwner(stack);
          const interrupted = await flowConnect(stack, who);
          const answer = interrupted["submit"] ?? interrupted["prepare"]!;
          // The caller gets an answer, not a hang; it is an error or, when the crash came after the work was done, a success.
          assert.ok(answer.structured !== undefined, `${answer.tool} answered: ${answer.text.slice(0, 200)}`);
          const minted = mock.write.credentials.length;
          assert.ok(minted <= 1, `at most one key was minted before the restart (${String(minted)})`);

          const again = await stack.restart("crash", { credentialOptions: undefined });
          const kept = await checkCredentialsKept(again);
          const persisted = CREDENTIAL_STEPS.indexOf(step) >= CREDENTIAL_STEPS.indexOf("triplet_persisted");
          if (persisted) assert.deepEqual(kept, [], `a triplet persisted before the crash is still in the vault`);
          // Whatever the state, trying again must not mint a second key and must end in an actionable answer.
          const retry = await flowConnect(again, who);
          const last = retry["submit"] ?? retry["prepare"]!;
          assert.ok(last.structured !== undefined);
          assert.ok(mock.write.credentials.length <= 1, `a retry minted a second key (${String(mock.write.credentials.length)})`);
          if (last.code === "connected") {
            assert.deepEqual(await checkCredentialsKept(again), [], "after a successful connect the vault holds the key XO minted");
            // The credentials work: an order goes through the relay's L2 signing.
            if (profile === OPTIMISTIC) {
              creditBalance(mock, who.account, 100_000_000n);
              const order = await flowOrder(again, who);
              assert.equal(order["submit"]?.code, "accepted", `credentials that survived a crash after ${step} are usable: ${order["submit"]?.text.slice(0, 200)}`);
            }
          } else {
            assert.equal(last.isError, true, `${last.tool}: ${last.code}`);
            assert.ok(String(last.structured?.["next_action"] ?? "").length >= 10, `an actionable next step after a failed connect: ${last.text.slice(0, 300)}`);
          }
          assertNoViolations(await checkInvariants(again), `connect killed after ${step} (${profile.name})`);
        });
      }
    }

    harness.it("connect: a close (not a crash) right after connecting keeps the credentials too, and a second connect mints nothing", async (mock) => {
      applyProfile(mock, OPTIMISTIC);
      const stack = await startStack({ mock, transport });
      const who = await readyOwner(stack);
      assert.equal((await flowConnect(stack, who))["submit"]?.code, "connected");
      const again = await stack.restart("close");
      assert.deepEqual(await checkCredentialsKept(again), []);
      const second = await flowConnect(again, who);
      assert.equal(mock.write.credentials.length, 1, "no second key");
      assert.ok(second["prepare"] !== undefined);
      assertNoViolations(await checkInvariants(again), "connect, close and reconnect");
    });

    // ---- deploy / redeem / withdraw: a user operation ---------------------------------------------------------------

    for (const how of ["crash", "close"] as const) {
      harness.it(`deploy: ${how} between prepare and submit; the old item is not sent twice and a fresh one lands`, async (mock) => {
        applyProfile(mock, OPTIMISTIC);
        const stack = await startStack({ mock, transport });
        const who = identityOf(mock, 0);
        const prepared = await stack.call("xo_deploy_enable_trading", { step: "prepare", owner: who.owner });
        assert.ok(intentOf(prepared) !== undefined, prepared.text.slice(0, 200));
        const signature = await signIntent(who.key, intentOf(prepared)!);
        stack.history.signed.push({ preparedId: preparedIdOf(prepared), digest: "userop", by: who.owner });

        const again = await stack.restart(how);
        // Submitting the item prepared before the restart: it lands once (a durable item) or is refused with a reason.
        const old = await again.call("xo_deploy_enable_trading", { step: "submit", prepared_id: preparedIdOf(prepared), signature });
        assert.ok(old.code === "submitted" || old.isError, old.text.slice(0, 200));
        if (old.isError) assert.match(String(old.code), /not_found|expired|prepared_used|ambiguous/, old.text.slice(0, 200));
        const sendsBefore = again.history.wire.count((call) => call.kind === "bundler_send");
        // And never twice.
        const replay = await again.call("xo_deploy_enable_trading", { step: "submit", prepared_id: preparedIdOf(prepared), signature });
        assert.equal(replay.isError, true);
        assert.equal(again.history.wire.count((call) => call.kind === "bundler_send"), sendsBefore, "the replay sent nothing");
        if (old.code !== "submitted") {
          const fresh = await again.call("xo_deploy_enable_trading", { step: "prepare", owner: who.owner });
          assert.ok(intentOf(fresh) !== undefined, fresh.text.slice(0, 200));
          const sent = await signAndSubmitUserop(again, "xo_deploy_enable_trading", who, fresh);
          assert.equal(sent.code, "submitted", sent.text.slice(0, 200));
        }
        await again.mock.advance(10);
        assert.equal(await again.mock.chains.isDeployed(who.account), true, "the account is deployed exactly once");
        assertNoViolations(await checkInvariants(again), `deploy, ${how} before submit`);
      });
    }

    for (const when of ["before", "after"] as const) {
      harness.it(`redeem: the relay dies ${when === "before" ? "before the bundler is reached" : "after the bundler took the operation"}; no second send, and the status settles`, async (mock) => {
        applyProfile(mock, OPTIMISTIC);
        const stack = await startStack({ mock, transport });
        const who = await readyOwner(stack);
        const id = conditionId(`restart-redeem-${when}`);
        await resolveOnChain(mock, id);
        const prepared = await stack.call("xo_redeem", { step: "prepare", owner: who.owner, condition_ids: [id] });
        assert.ok(intentOf(prepared) !== undefined, prepared.text.slice(0, 200));
        stack.history.wire.fault({ name: `crash ${when} the bundler send`, match: (call) => call.kind === "bundler_send", times: 1, action: { action: "crash", when, run: () => stack.handle.abandon() } });
        const lost = await signAndSubmitUserop(stack, "xo_redeem", who, prepared);
        assert.equal(lost.isError, true, `the caller is told it did not complete: ${lost.text.slice(0, 200)}`);
        assert.match(String(lost.code), /ambiguous|internal|upstream|rejected|relay_not_configured/, lost.text.slice(0, 200));

        const again = await stack.restart("crash");
        const hash = String((prepared.structured as { user_op_hash?: string }).user_op_hash);
        const sent = again.history.wire.count((call) => call.kind === "bundler_send");
        assert.equal(sent, 1);
        // The same item is not submitted again, whatever happened to the first send.
        const resubmit = await again.call("xo_redeem", { step: "submit", prepared_id: preparedIdOf(prepared), signature: await signIntent(who.key, intentOf(prepared)!) });
        assert.equal(resubmit.isError, true, resubmit.text.slice(0, 200));
        assert.equal(again.history.wire.count((call) => call.kind === "bundler_send"), 1, "no second send for the same prepared item");
        // Its status is answered (never a hang), and it is honest about what is known.
        await again.mock.advance(30);
        const status = await again.call("xo_userop_status", { user_op_hash: hash });
        assert.equal(status.isError, false, status.text.slice(0, 200));
        const state = (status.structured?.["status"] as { state?: string } | undefined)?.state;
        assert.ok(["included", "ambiguous", "unknown", "submitted", "rejected"].includes(String(state)), `status ${String(state)}`);
        if (when === "after") assert.equal(state, "included", "the operation did land, and the relay finds it on chain after the restart");
        assertNoViolations(await checkInvariants(again), `redeem, relay killed ${when} the send`);
      });
    }

    harness.it("revoke trading: the relay dies after the bundler took the operation; the revoke is not sent twice and shows as done", async (mock) => {
      applyProfile(mock, OPTIMISTIC);
      const stack = await startStack({ mock, transport });
      const who = await readyOwner(stack);
      const prepared = await stack.call("xo_revoke_trading", { step: "prepare", owner: who.owner });
      assert.ok(intentOf(prepared) !== undefined, prepared.text.slice(0, 200));
      stack.history.wire.fault({ name: "crash after the send", match: (call) => call.kind === "bundler_send", times: 1, action: { action: "crash", when: "after", run: () => stack.handle.abandon() } });
      const lost = await signAndSubmitUserop(stack, "xo_revoke_trading", who, prepared);
      assert.equal(lost.isError, true, lost.text.slice(0, 200));
      const again = await stack.restart("crash");
      const resubmit = await again.call("xo_revoke_trading", { step: "submit", prepared_id: preparedIdOf(prepared), signature: await signIntent(who.key, intentOf(prepared)!) });
      assert.equal(resubmit.isError, true, resubmit.text.slice(0, 200));
      assert.equal(again.history.wire.count((call) => call.kind === "bundler_send"), 1);
      await again.mock.advance(30);
      const hash = String((prepared.structured as { user_op_hash?: string }).user_op_hash);
      const status = await again.call("xo_userop_status", { user_op_hash: hash });
      assert.equal((status.structured?.["status"] as { state?: string } | undefined)?.state, "included", status.text.slice(0, 200));
      assert.equal(await again.mock.chains.isTradingEnabled(who.account), false, "trading is revoked on chain");
      assertNoViolations(await checkInvariants(again), "revoke killed after the send");
    });

    harness.it("withdraw: the relay dies after the bundler took the operation; the prepared item is not sent again", async (mock) => {
      applyProfile(mock, OPTIMISTIC);
      const stack = await startStack({ mock, transport });
      const who = await readyOwner(stack);
      const { mintUsdce } = await import("../relay-userops-helpers.js");
      await mintUsdce(mock, who.account, 5_000_000n);
      const prepared = await stack.call("xo_withdraw", { owner: who.owner, amount_usd: "1" });
      const intent = prepared.structured?.["request_wallet_sign_intent"] as never;
      assert.ok(intent !== undefined, prepared.text.slice(0, 200));
      const signature = await signIntent(who.key, intent);
      const id = String(prepared.structured?.["prepared_id"]);
      stack.history.signed.push({ preparedId: id, digest: "withdraw", by: who.owner });
      stack.history.wire.fault({ name: "crash after the send", match: (call) => call.kind === "bundler_send", times: 1, action: { action: "crash", when: "after", run: () => stack.handle.abandon() } });
      const lost = await stack.call("xo_submit_userop", { prepared_id: id, signature });
      assert.equal(lost.isError, true, lost.text.slice(0, 200));
      const again = await stack.restart("crash");
      const replay = await again.call("xo_submit_userop", { prepared_id: id, signature });
      assert.equal(replay.isError, true, replay.text.slice(0, 200));
      assert.equal(again.history.wire.count((call) => call.kind === "bundler_send"), 1);
      assertNoViolations(await checkInvariants(again), "withdraw killed after the send");
    });

    // ---- orders -------------------------------------------------------------------------------------------------------------

    harness.it("order: a restart between prepare and submit does not reset the cap, and the old item is not sent twice", async (mock) => {
      applyProfile(mock, OPTIMISTIC);
      const stack = await startStack({ mock, transport });
      const who = await readyOwner(stack);
      assert.equal((await flowConnect(stack, who))["submit"]?.code, "connected");
      creditBalance(mock, who.account, 200_000_000n);
      const tokens = marketTokens(mock, "clob-active-a");
      const prepared = await stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "22.7" });
      const signature = await signIntent(who.key, intentOf(prepared)!);
      stack.history.signed.push({ preparedId: preparedIdOf(prepared), digest: "order", by: who.owner });
      const before = await usageOf(stack, who);
      assert.ok(before.spentAtomic > 0n);

      const again = await stack.restart("crash");
      const after = await usageOf(again, who);
      assert.equal(after.spentAtomic, before.spentAtomic, "a restart never resets what the day has used");
      const old = await again.call("xo_submit_order", { prepared_id: preparedIdOf(prepared), signature });
      assert.ok(old.code === "accepted" || old.isError, old.text.slice(0, 200));
      if (old.isError) assert.match(String(old.code), /not_found|expired|prepared_used|ambiguous/, old.text.slice(0, 200));
      const replay = await again.call("xo_submit_order", { prepared_id: preparedIdOf(prepared), signature });
      assert.equal(replay.isError, true);
      assert.ok(again.history.wire.count((call) => call.kind === "order_post") <= 1);
      assertNoViolations(await checkInvariants(again), "order, restart before submit");
    });

    for (const when of ["before", "after"] as const) {
      harness.it(`order: the relay dies ${when === "before" ? "before XO is reached" : "after XO placed the order"}; one POST at most, the reservation is held, and the order can be found and cancelled`, async (mock) => {
        applyProfile(mock, OPTIMISTIC);
        const stack = await startStack({ mock, transport });
        const who = await readyOwner(stack);
        assert.equal((await flowConnect(stack, who))["submit"]?.code, "connected");
        creditBalance(mock, who.account, 200_000_000n);
        const tokens = marketTokens(mock, "clob-active-a");
        const prepared = await stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "22.7" });
        const signature = await signIntent(who.key, intentOf(prepared)!);
        stack.history.signed.push({ preparedId: preparedIdOf(prepared), digest: "order", by: who.owner });
        const spentBefore = (await usageOf(stack, who)).spentAtomic;
        stack.history.wire.fault({ name: `crash ${when} the order POST`, match: (call) => call.kind === "order_post", times: 1, action: { action: "crash", when, run: () => stack.handle.abandon() } });
        const lost = await stack.call("xo_submit_order", { prepared_id: preparedIdOf(prepared), signature });
        assert.equal(lost.isError, true, lost.text.slice(0, 200));

        const again = await stack.restart("crash");
        assert.equal((await usageOf(again, who)).spentAtomic, spentBefore, "the reservation of a send in doubt is still held after the restart");
        const replay = await again.call("xo_submit_order", { prepared_id: preparedIdOf(prepared), signature });
        assert.equal(replay.isError, true, replay.text.slice(0, 200));
        assert.equal(again.history.wire.count((call) => call.kind === "order_post"), 1, "XO was asked once");
        const listed = await again.call("xo_list_orders", { owner: who.owner });
        assert.equal(listed.isError, false, listed.text.slice(0, 200));
        const orderHash = [...again.history.prepared].reverse().find((item) => item.orderHash !== undefined)?.orderHash as string;
        if (when === "after") {
          assert.ok(listed.text.includes(orderHash), "the order that XO placed is listed after the restart");
          const cancelled = await again.call("xo_cancel_order", { owner: who.owner, order_hash: orderHash });
          assert.equal(cancelled.code, "cancelled", cancelled.text.slice(0, 200));
          assert.equal([...mock.write.orders.values()].filter((order) => order.status === "live").length, 0);
        } else {
          assert.equal(mock.write.orders.size, 0, "XO never saw the order");
        }
        const status = await again.call("xo_order_status", { order_hash: orderHash });
        assert.equal(status.isError, false, status.text.slice(0, 200));
        assertNoViolations(await checkInvariants(again), `order, relay killed ${when} the POST`);
      });
    }

    harness.it("cancel: the relay dies after XO cancelled the order; the order is shown as cancelled and nothing is cancelled twice", async (mock) => {
      applyProfile(mock, OPTIMISTIC);
      const stack = await startStack({ mock, transport });
      const who = await readyOwner(stack);
      assert.equal((await flowConnect(stack, who))["submit"]?.code, "connected");
      creditBalance(mock, who.account, 200_000_000n);
      const placed = await flowOrder(stack, who, { cancel: false });
      assert.equal(placed["submit"]?.code, "accepted");
      const orderHash = String(placed["submit"]?.structured?.["order_hash"]);
      stack.history.wire.fault({ name: "crash after the cancel", match: (call) => call.kind === "order_delete", times: 1, action: { action: "crash", when: "after", run: () => stack.handle.abandon() } });
      const lost = await stack.call("xo_cancel_order", { owner: who.owner, order_hash: orderHash });
      assert.equal(lost.isError, true, lost.text.slice(0, 200));
      assert.equal([...mock.write.orders.values()].filter((order) => order.status === "canceled").length, 1, "XO did cancel it");

      const again = await stack.restart("crash");
      const status = await again.call("xo_order_status", { order_hash: orderHash });
      assert.equal(status.isError, false, status.text.slice(0, 200));
      assert.equal((status.structured?.["status"] as { state?: string } | undefined)?.state, "cancelled", "the relay reports what XO did");
      const listed = await again.call("xo_list_orders", { owner: who.owner });
      assert.ok(!listed.text.includes(orderHash), "a cancelled order is not listed as open");
      const second = await again.call("xo_cancel_order", { owner: who.owner, order_hash: orderHash });
      assert.notEqual(second.code, "ambiguous", "cancelling again is answered, not left in doubt");
      assertNoViolations(await checkInvariants(again), "cancel killed after XO cancelled");
    });

    for (const how of ["crash", "close"] as const) {
      harness.it(`caps: five orders, ${how}, the sixth is still refused (the day is not reset)`, async (mock) => {
        applyProfile(mock, OPTIMISTIC);
        let stack = await startStack({ mock, transport });
        const who = await readyOwner(stack);
        assert.equal((await flowConnect(stack, who))["submit"]?.code, "connected");
        creditBalance(mock, who.account, 200_000_000n);
        for (let n = 0; n < 5; n += 1) {
          const flow = await flowOrder(stack, who, { shares: "22.7", price: "0.4", cancel: false });
          assert.equal(flow["submit"]?.code, "accepted", `order ${String(n + 1)}: ${flow["prepare"]?.text.slice(0, 160)}`);
          if (n === 2) stack = await stack.restart(how);
        }
        stack = await stack.restart(how);
        const sixth = await flowOrder(stack, who, { shares: "22.7", price: "0.4", cancel: false });
        assert.equal(sixth["prepare"]?.code, "cap_exceeded", "the cap survived two restarts");
        const usage = await usageOf(stack, who);
        assert.ok(usage.spentAtomic <= DAY_CAP_ATOMIC);
        assertNoViolations(await checkInvariants(stack), `caps across a ${how}`);
      });
    }

    // ---- funding ----------------------------------------------------------------------------------------------------------

    harness.it("fund: a restart after the check keeps the reservation, the same funding id comes back, and the delivery is followed", async (mock) => {
      applyProfile(mock, OPTIMISTIC);
      const stack = await startStack({ mock, transport });
      const who = await readyOwner(stack);
      mock.hyperlane.setBaseBalance(who.owner, 100_000_000n);
      const first = await stack.call("xo_fund_account", { owner: who.owner, amount_usd: "2" });
      const fundingId = /funding_id ([0-9a-f]{32})/.exec(first.text)?.[1];
      assert.ok(fundingId !== undefined, first.text.slice(0, 300));
      const held = (await usageOf(stack, who)).fundedLifetimeAtomic;
      assert.equal(held, 2_000_000n);

      const again = await stack.restart("crash");
      assert.equal((await usageOf(again, who)).fundedLifetimeAtomic, held, "the reserved funding survived the restart");
      const second = await again.call("xo_fund_account", { owner: who.owner, amount_usd: "2" });
      assert.equal(/funding_id ([0-9a-f]{32})/.exec(second.text)?.[1], fundingId, "the same funding comes back, not a second reservation");
      assert.equal((await usageOf(again, who)).fundedLifetimeAtomic, held);

      const { sendFunding } = await import("../relay-funding-helpers.js");
      const sent = await sendFunding(mock, who.owner, 2_000_000n);
      const follow = { owner: who.owner, amount_usd: "2", tx_hash: sent.hash, funding_id: fundingId, xo_balance_before_usd: "0" };
      const dispatched = await again.call("xo_fund_account", follow);
      assert.equal(dispatched.code, "dispatched", dispatched.text.slice(0, 200));
      const restarted = await again.restart("crash");
      await mock.advance(40);
      const settled = await restarted.call("xo_fund_account", follow);
      assert.equal(settled.code, "credited", settled.text.slice(0, 300));
      assert.equal(mock.hyperlane.messages.length, 1, "the transfer was sent once");
      assertNoViolations(await checkInvariants(restarted), "funding across restarts");
    });

    // ---- the kill switch ---------------------------------------------------------------------------------------------------

    harness.it("kill switch from the environment survives a restart; the latch an operator sets while running is reported as what it is", async (mock) => {
      applyProfile(mock, OPTIMISTIC);
      const stack = await startStack({ mock, transport, relayKill: true });
      const who = await readyOwner(stack);
      const tokens = marketTokens(mock, "clob-active-a");
      const refused = await stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "10" });
      assert.equal(refused.code, "kill_switch");
      const again = await stack.restart("crash");
      const refusedAgain = await again.call("xo_prepare_order", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "10" });
      assert.equal(refusedAgain.code, "kill_switch", "KILL=1 in the environment still holds after a restart");
      assertNoViolations(await checkInvariants(again, { writable: { userop: false, trading: false, funding: false, withdraw: false } }), "kill across restart");
    });
  });
}
