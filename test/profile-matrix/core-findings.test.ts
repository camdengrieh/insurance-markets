import assert from "node:assert/strict";
import { describe } from "node:test";

import type { CredentialStep } from "../../relay/credentials.js";
import { useMock } from "../mock-xo/testing.js";
import { marketTokens } from "../mock-xo/traders.js";
import {
  applyProfile,
  creditBalance,
  embeddedTransport,
  ensureDeployedLikeXoApp,
  flowConnect,
  flowOrder,
  httpShippedTransport,
  httpTransport,
  identityOf,
  intentOf,
  startStack,
} from "./helpers.js";

// Invariant violations this suite found in code it does not own. Each test states the behaviour that SHOULD hold
// and is marked `todo`: it runs, its failure is reported as a todo and does not fail the run, and it starts passing
// (reported as a passing todo) when the owner fixes the code. The task result lists the same findings with their
// reproductions. A finding is deleted from here when it is fixed.

describe("open findings (todo until fixed)", () => {
  const harness = useMock({ chains: { xo: true, base: true } });
  harness.it("F1 an xo_withdraw or xo_fund_account refusal tells the caller what to do next", async (mock, t) => {
    t.todo("xo_withdraw (capability_unknown) and xo_fund_account (precondition_failed) refusals carry no next_action and no 'Next:' line");
    applyProfile(mock, { name: "pessimistic", base: "pessimistic" });
    const stack = await startStack({ mock, transport: httpTransport });
    const who = identityOf(mock, 0);
    await ensureDeployedLikeXoApp(stack, who);
    const withdraw = await stack.call("xo_withdraw", { owner: who.owner, amount_usd: "1" });
    assert.equal(withdraw.isError, true);
    assert.ok(String(withdraw.structured?.["next_action"] ?? "").length >= 10 || /(^|\n)Next:/.test(withdraw.text), `xo_withdraw (${String(withdraw.code)}): ${withdraw.text.slice(0, 200)}`);
  });

  harness.it("F2 the HTTP relay as `pnpm relay` assembles it can serve the tools (account directory, L2 signer, user-operation options)", async (mock) => {
    applyProfile(mock, { name: "optimistic", base: "optimistic" });
    const stack = await startStack({ mock, transport: httpShippedTransport });
    const who = identityOf(mock, 0);
    const prepared = await stack.call("xo_deploy_enable_trading", { step: "prepare", owner: who.owner });
    assert.notEqual(prepared.code, "not_implemented", prepared.text.slice(0, 200));
    assert.ok(intentOf(prepared) !== undefined, prepared.text.slice(0, 200));
  });

  harness.it("F2b ...and after a successful connect the same relay can sign for the order module (one secret name, one signer)", async (mock) => {
    applyProfile(mock, { name: "optimistic", base: "optimistic" });
    // The shipped assembly: relay/wiring.ts credentialL2Auth bridges the order module's secret name to the credential module's.
    const stack = await startStack({ mock, transport: httpShippedTransport });
    const who = identityOf(mock, 0);
    await ensureDeployedLikeXoApp(stack, who);
    assert.equal((await flowConnect(stack, who))["submit"]?.code, "connected");
    creditBalance(mock, who.account, 100_000_000n);
    const order = await flowOrder(stack, who);
    assert.equal(order["submit"]?.code, "accepted", `${String(order["prepare"]?.code)} / ${String(order["submit"]?.code)}: ${(order["submit"] ?? order["prepare"])?.text.slice(0, 220)}`);
  });

  harness.it("F3 an unexpected failure after XO minted a key is not reported as 'Nothing was sent'", async (mock, t) => {
    t.todo("a handler that throws after an irreversible upstream step answers internal 'The relay failed unexpectedly. Nothing was sent.' and the tool adds 'Nothing was signed or sent by this call'");
    applyProfile(mock, { name: "optimistic", base: "optimistic" });
    const step: CredentialStep = "create_response_received";
    let armed = true;
    const stack = await startStack({
      mock,
      transport: embeddedTransport,
      credentialOptions: {
        onStep: (reached) => {
          if (armed && reached === step) {
            armed = false;
            throw new Error("boom");
          }
        },
      },
    });
    const who = identityOf(mock, 0);
    await ensureDeployedLikeXoApp(stack, who);
    const connected = await flowConnect(stack, who);
    const answer = connected["submit"]!;
    assert.equal(mock.write.credentials.length, 1, "an XO key was minted before the failure");
    assert.doesNotMatch(answer.text, /Nothing was (signed or )?sent/i, answer.text.slice(0, 300));
  });

  harness.it("F4 a kill switch an operator engaged while running is still engaged after the relay restarts", async (mock, t) => {
    t.todo("FlagGate.engageKill is an in-memory latch (SIGUSR2): a supervisor restart after a crash silently re-enables every write the operator stopped");
    applyProfile(mock, { name: "optimistic", base: "optimistic" });
    const stack = await startStack({ mock, transport: embeddedTransport });
    const who = identityOf(mock, 0);
    await ensureDeployedLikeXoApp(stack, who);
    await stack.relay.services.flagGate.engageKill("operator");
    const again = await stack.restart("crash");
    assert.equal(again.relay.flags().KILL, true, "the latch survives a restart");
  });

  harness.it("F5 xo_prepare_order refuses, before the owner is asked to sign, when the account has no stored XO credentials", async (mock, t) => {
    t.todo("prepare reserves the cap and hands out a signing intent for an account that has no credentials; the refusal comes only at submit, after the approval");
    applyProfile(mock, { name: "optimistic", base: "optimistic" });
    const stack = await startStack({ mock, transport: httpTransport });
    const who = identityOf(mock, 0);
    await ensureDeployedLikeXoApp(stack, who);
    creditBalance(mock, who.account, 100_000_000n);
    const prepared = await stack.call("xo_prepare_order", { owner: who.owner, token_id: marketTokens(mock, "clob-active-a").yes, side: "BUY", price: "0.4", shares: "10" });
    assert.equal(prepared.isError, true, "no credentials: nothing to sign");
    assert.equal(intentOf(prepared), undefined);
  });

  harness.it("F6 after the gateway refuses the raw signature form, prepare does not hand out the same unusable intent again", async (mock, t) => {
    t.todo("with order.sig_forms=eip191-only the relay can only offer raw/typedData intents, rejects every order at XO, and answers 'prepare again'; a retry loop reserves $10 per turn until the cap is gone");
    applyProfile(mock, { name: "pessimistic", base: "pessimistic" });
    const stack = await startStack({ mock, transport: httpTransport });
    const who = identityOf(mock, 0);
    await ensureDeployedLikeXoApp(stack, who);
    assert.equal((await flowConnect(stack, who))["submit"]?.code, "connected");
    creditBalance(mock, who.account, 100_000_000n);
    const first = await flowOrder(stack, who, { cancel: false });
    assert.equal(first["submit"]?.code, "rejected");
    const second = await flowOrder(stack, who, { cancel: false });
    assert.equal(second["prepare"]?.isError, true, "a second raw-form order is not prepared after the gateway has refused the form");
  });
});
