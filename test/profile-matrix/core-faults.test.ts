import assert from "node:assert/strict";
import { describe, mock as nodeMock } from "node:test";

import { Secret, loadConfig } from "../../src/config.js";
import { createRelayClient } from "../../src/relay/client.js";
import { RELAY_CLIENT_TIMEOUT_MS } from "../../src/relay/contract.js";
import { registerTradeTools } from "../../src/tools/trade.js";
import { registerUseropTools } from "../../src/tools/userop.js";
import { useMock } from "../mock-xo/testing.js";
import { marketTokens } from "../mock-xo/traders.js";
import { TEST_RELAY_KEY } from "../relay-core-helpers.js";
import { closeAll, connect, ENV_ON, OWNER } from "../tools-helpers.js";
import {
  applyProfile,
  assertNoViolations,
  checkInvariants,
  conditionId,
  creditBalance,
  embeddedTransport,
  ensureDeployedLikeXoApp,
  flowConnect,
  fullJourney,
  httpTransport,
  identityOf,
  intentOf,
  preparedIdOf,
  resolveOnChain,
  signAndSubmitUserop,
  signIntent,
  startStack,
  withDeadline,
  type Stack,
  type Step,
  type Transport,
} from "./helpers.js";

// Failures that are not a clean "no": answers lost, connections cut, upstreams that hang or complain. Each must end in
// a stable, actionable answer inside the plugin's time budget, never in a hang, never in a second send.

const transports: readonly Transport[] = [httpTransport, embeddedTransport];

async function trader(stack: Stack) {
  const who = identityOf(stack.mock, 0);
  await ensureDeployedLikeXoApp(stack, who);
  assert.equal((await flowConnect(stack, who))["submit"]?.code, "connected");
  creditBalance(stack.mock, who.account, 200_000_000n);
  return who;
}

async function preparedOrder(stack: Stack, who: ReturnType<typeof identityOf>) {
  const tokens = marketTokens(stack.mock, "clob-active-a");
  const prepared = await stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "10" });
  assert.ok(intentOf(prepared) !== undefined, prepared.text.slice(0, 200));
  const signature = await signIntent(who.key, intentOf(prepared)!);
  stack.history.signed.push({ preparedId: preparedIdOf(prepared), digest: "order", by: who.owner });
  return { prepared, signature, args: { prepared_id: preparedIdOf(prepared), signature } };
}

const actionable = (step: Step): void => {
  assert.equal(typeof step.structured?.["code"], "string", step.text.slice(0, 200));
  assert.ok(String(step.structured?.["message"] ?? "").length >= 10, "a message");
  assert.ok(String(step.structured?.["next_action"] ?? "").length >= 10, `a next step: ${step.text.slice(0, 300)}`);
};

for (const transport of transports) {
  describe(`failures over ${transport.name}`, () => {
    const harness = useMock({ chains: { xo: true, base: true } });

    harness.it("the answer to an order is lost: ambiguous, never resent, found on the book afterwards, cancellable", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await trader(stack);
      const { args } = await preparedOrder(stack, who);
      stack.history.wire.fault({ name: "answer lost", match: (call) => call.kind === "order_post", times: 1, action: { action: "forward_then_fail" } });
      const lost = await stack.call("xo_submit_order", args);
      assert.equal(lost.isError, true);
      assert.equal(lost.code, "ambiguous", lost.text.slice(0, 300));
      assert.match(String(lost.structured?.["next_action"]), /not|never|status/i);
      actionable(lost);
      const again = await stack.call("xo_submit_order", args);
      assert.equal(again.isError, true, "the same item is not sent again");
      assert.equal(stack.history.wire.count((call) => call.kind === "order_post"), 1);
      const orderHash = [...mock.write.orders.keys()][0]!;
      const status = await stack.call("xo_order_status", { order_hash: orderHash });
      assert.equal(status.isError, false, status.text.slice(0, 200));
      const cancelled = await stack.call("xo_cancel_order", { owner: who.owner, order_hash: orderHash });
      assert.equal(cancelled.code, "cancelled", cancelled.text.slice(0, 200));
      assertNoViolations(await checkInvariants(stack), "order answer lost");
    });

    harness.it("the connection to XO never opens for an order: nothing rests, the answer is actionable, the item is not reused", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await trader(stack);
      const { args } = await preparedOrder(stack, who);
      stack.history.wire.fault({ name: "connection refused", match: (call) => call.kind === "order_post", times: 1, action: { action: "fail" } });
      const failed = await stack.call("xo_submit_order", args);
      assert.equal(failed.isError, true);
      actionable(failed);
      assert.equal(mock.write.orders.size, 0);
      const again = await stack.call("xo_submit_order", args);
      assert.equal(again.isError, true, "single use: a failed send does not make the item reusable");
      assert.ok(stack.history.wire.count((call) => call.kind === "order_post") <= 1, "no second POST");
      assertNoViolations(await checkInvariants(stack), "order connection refused");
    });

    for (const status of [429, 502, 503]) {
      harness.it(`XO answers ${String(status)} to the order: a stable answer, one POST, the cap not freed early`, async (mock) => {
        applyProfile(mock, { name: "optimistic", base: "optimistic" });
        const stack = await startStack({ mock, transport });
        const who = await trader(stack);
        const { args } = await preparedOrder(stack, who);
        stack.history.wire.fault({ name: `gateway ${String(status)}`, match: (call) => call.kind === "order_post", times: 1, action: { action: "status", status } });
        const reply = await stack.call("xo_submit_order", args);
        assert.equal(reply.isError, true, reply.text.slice(0, 300));
        actionable(reply);
        assert.equal(stack.history.wire.count((call) => call.kind === "order_post"), 1, "the relay did not retry a write");
        assertNoViolations(await checkInvariants(stack), `order ${String(status)}`);
      });
    }

    harness.it("the answer to a user operation is lost: ambiguous, never resent, and the status settles from the chain", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = await trader(stack);
      const id = conditionId("fault-redeem");
      await resolveOnChain(mock, id);
      const prepared = await stack.call("xo_redeem", { step: "prepare", owner: who.owner, condition_ids: [id] });
      stack.history.wire.fault({ name: "answer lost", match: (call) => call.kind === "bundler_send", times: 1, action: { action: "forward_then_fail" } });
      const lost = await signAndSubmitUserop(stack, "xo_redeem", who, prepared);
      // The relay looks for the operation on chain at once: found means submitted (with its transaction), not found
      // means ambiguous with the instruction not to resend. Either way one send.
      assert.ok(["submitted", "ambiguous"].includes(String(lost.code)), lost.text.slice(0, 300));
      if (lost.code === "ambiguous") actionable(lost);
      const hash = String((prepared.structured as { user_op_hash?: string }).user_op_hash);
      await mock.advance(30);
      const status = await stack.call("xo_userop_status", { user_op_hash: hash });
      assert.equal(status.isError, false, status.text.slice(0, 200));
      assert.equal((status.structured?.["status"] as { state?: string }).state, "included", "the operation did land and the relay finds it");
      assert.equal(stack.history.wire.count((call) => call.kind === "bundler_send"), 1);
      assertNoViolations(await checkInvariants(stack), "userop answer lost");
    });

    harness.it("XO never answers the order: the relay answers pending or ambiguous in time, with the order's hash, and does not send again", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      // Real timers, shortened: the relay answers `pending` 150 ms after submit began and gives up on XO after 700 ms.
      const stack = await startStack({ mock, transport, orderTimings: { pendingAfterMs: 150, postTimeoutMs: 700 } });
      const who = await trader(stack);
      const { args } = await preparedOrder(stack, who);
      stack.history.wire.fault({ name: "XO hangs", match: (call) => call.kind === "order_post", times: 1, action: { action: "hang" } });
      // stack.call carries a 30 s real-time guard; this one is much tighter: the plugin's own budget is 9 s.
      const reply = await withDeadline(stack.call("xo_submit_order", args), 5_000, "xo_submit_order against a silent XO");
      assert.ok(["pending", "ambiguous"].includes(String(reply.code)), `${String(reply.code)}: ${reply.text.slice(0, 300)}`);
      actionable(reply);
      assert.equal(stack.history.wire.count((call) => call.kind === "order_post"), 1);
      // The in-flight POST ends by itself (the relay aborts it); the status is then honest and a second submit is refused.
      await new Promise((resolve) => setTimeout(resolve, 900));
      const again = await stack.call("xo_submit_order", args);
      assert.equal(again.isError, true);
      assert.equal(stack.history.wire.count((call) => call.kind === "order_post"), 1);
      assertNoViolations(await checkInvariants(stack), "order against a silent XO");
    });

    harness.it("XO is slow but answers: the relay says pending with the order's hash, finishes in the background, and the order is then open exactly once", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport, orderTimings: { pendingAfterMs: 100, postTimeoutMs: 5_000 } });
      const who = await trader(stack);
      const { args } = await preparedOrder(stack, who);
      stack.history.wire.fault({ name: "XO is slow", match: (call) => call.kind === "order_post", times: 1, action: { action: "delay", ms: 500 } });
      const reply = await stack.call("xo_submit_order", args);
      assert.equal(reply.code, "pending", reply.text.slice(0, 300));
      assert.match(reply.text, /0x[0-9a-f]{64}/, "the pending answer carries the order's hash");
      assert.equal(reply.isError, false, "pending is not a failure");
      const hash = /0x[0-9a-f]{64}/.exec(reply.text)![0];
      // Meanwhile a second submit of the same item is refused and does not send.
      const second = await stack.call("xo_submit_order", args);
      assert.equal(second.isError, true);
      // The background send finishes; the order is on the book once.
      for (let look = 0; look < 40 && mock.write.orders.size === 0; look += 1) await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(mock.write.orders.size, 1);
      // The relay records the result a moment after XO has the order; look until it has (bounded).
      let status = await stack.call("xo_order_status", { order_hash: hash });
      for (let look = 0; look < 40 && (status.structured?.["status"] as { state?: string } | undefined)?.state === "pending"; look += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        status = await stack.call("xo_order_status", { order_hash: hash });
      }
      assert.equal((status.structured?.["status"] as { state?: string } | undefined)?.state, "open", status.text.slice(0, 200));
      assert.equal(stack.history.wire.count((call) => call.kind === "order_post"), 1);
      assertNoViolations(await checkInvariants(stack), "slow XO");
    });

    harness.it("a faulty XO on every read: the flows end in stable refusals that say what to do, none hangs", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = identityOf(mock, 0);
      mock.injectFault("5xx", {});
      const steps = [
        await stack.call("xo_deploy_enable_trading", { step: "prepare", owner: who.owner }),
        await stack.call("xo_connect", { step: "prepare", owner: who.owner }),
        await stack.call("xo_fund_account", { owner: who.owner, amount_usd: "1" }),
        await stack.call("xo_prepare_order", { owner: who.owner, token_id: marketTokens(mock, "clob-active-a").yes, side: "BUY", price: "0.4", shares: "10" }),
        await stack.call("xo_list_orders", { owner: who.owner }),
        await stack.call("xo_withdraw", { owner: who.owner, amount_usd: "1" }),
      ];
      for (const step of steps) {
        assert.equal(step.isError, true, `${step.tool}: ${step.text.slice(0, 160)}`);
        assert.equal(typeof step.structured?.["code"], "string");
        assert.ok(String(step.structured?.["message"] ?? "").length >= 10, step.tool);
        assert.equal(intentOf(step), undefined, `${step.tool} hands out no signing intent while XO is failing`);
      }
      assert.equal(stack.history.wire.count((call) => call.kind !== "other"), 0, "no write went out");
    });
  });
}

// The mock's `faults` switch (429 with Retry-After, 5xx, truncated JSON) on every XO host at once, from the pessimistic
// profile and from the optimistic one, through the whole journey. The `timeout` value is left to the wire-level hang
// tests above: it makes every request wait for the relay's own (real-time) timeouts, about 17 s per journey.
for (const transport of transports) {
  describe(`the faults switch over ${transport.name}`, () => {
    const harness = useMock({ chains: { xo: true, base: true } });
    for (const base of ["pessimistic", "optimistic"] as const) {
      for (const value of ["429-retry-after", "5xx", "truncated-json"] as const) {
        harness.it(`${base} + faults=${value}: every flow ends in a stable answer, nothing is written, nothing hangs`, async (mock) => {
          applyProfile(mock, { name: base, base, flip: { name: "faults", value } });
          const stack = await startStack({ mock, transport });
          const who = identityOf(mock, 0);
          const flows = await fullJourney(stack, who);
          // XO is unreadable throughout, so no flow gets as far as something to sign, except the XO-app deploy
          // (which the test does directly) and the connect that the relay can still not prove.
          for (const flow of Object.values(flows)) for (const step of Object.values(flow)) if (step !== undefined && step.tool !== "xo_account") assert.equal(intentOf(step), undefined, `${step.tool} hands out a signing intent while XO is failing`);
          assert.equal(stack.history.wire.count((call) => call.kind !== "other"), 0, "no write went upstream");
          assertNoViolations(await checkInvariants(stack), `${base} + faults=${value}`);
        });
      }
    }
  });
}

describe("failures that are only about the HTTP hop", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("the relay is gone: every tool says it cannot reach the relay, fast, and nothing was sent", async (mock) => {
    applyProfile(mock, { name: "optimistic", base: "optimistic" });
    const stack = await startStack({ mock, transport: httpTransport });
    const who = await trader(stack);
    const { args } = await preparedOrder(stack, who);
    await stack.handle.close();
    const answers = [
      await withDeadline(stack.call("xo_submit_order", args), 5_000, "xo_submit_order with the relay gone"),
      await withDeadline(stack.call("xo_prepare_order", { owner: who.owner, token_id: marketTokens(mock, "clob-active-a").yes, side: "BUY", price: "0.4", shares: "10" }), 5_000, "xo_prepare_order with the relay gone"),
      await withDeadline(stack.call("xo_list_orders", { owner: who.owner }), 5_000, "xo_list_orders with the relay gone"),
      await withDeadline(stack.call("xo_userop_status", { user_op_hash: `0x${"ab".repeat(32)}` }), 5_000, "xo_userop_status with the relay gone"),
    ];
    for (const answer of answers) {
      assert.equal(answer.isError, true, answer.tool);
      assert.equal(typeof answer.structured?.["code"], "string", answer.text.slice(0, 200));
      assert.match(String(answer.structured?.["message"]), /relay/i, `${answer.tool} says it is the relay: ${answer.text.slice(0, 200)}`);
      actionable(answer);
    }
    assert.equal(stack.history.wire.calls.filter((call) => call.kind === "order_post").length, 0);
  });
});

describe("a relay that never answers, with fake timers", () => {
  const harness = useMock({ chains: false });

  // The real RelayClient against a fetch that never settles (but honours abort). The 8 s client timeout and the tool's
  // own budget run on mocked timers, so the test takes no real time and cannot depend on the scheduler.
  async function silentTools(): Promise<{ call: (name: string, args: Record<string, unknown>) => Promise<{ isError: boolean; structured: Record<string, unknown> | undefined; text: string }>; sent: () => number; clock: { ms: number } }> {
    let sent = 0;
    const clock = { ms: Date.parse("2026-10-19T12:00:00Z") };
    const silent = ((_input: unknown, init?: RequestInit): Promise<Response> => {
      sent += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
      });
    }) as typeof fetch;
    const env = { ...ENV_ON, XO_RELAY_URL: "http://127.0.0.1:9", XO_RELAY_KEY: TEST_RELAY_KEY };
    const config = loadConfig(env).config;
    const client = createRelayClient({ baseUrl: "http://127.0.0.1:9", key: new Secret(TEST_RELAY_KEY), fetch: silent });
    const deps = { nowMs: () => clock.ms, config: () => config, env: () => env, relay: () => client, audit: { write: () => undefined } };
    const harness = await connect((server) => {
      registerUseropTools(server, deps);
      registerTradeTools(server, deps);
    });
    return { call: (name, args) => harness.call(name, args), sent: () => sent, clock };
  }

  harness.it("every tool gives up at the client's time limit with a stable answer; a write is ambiguous and never resent", async () => {
    nodeMock.timers.enable({ apis: ["setTimeout"] });
    try {
      const { call, sent, clock } = await silentTools();
      const submitting = call("xo_submit_order", { prepared_id: "ab".repeat(16), signature: `0x${"11".repeat(32)}${"22".repeat(32)}1b` });
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      nodeMock.timers.tick(RELAY_CLIENT_TIMEOUT_MS + 1);
      clock.ms += RELAY_CLIENT_TIMEOUT_MS + 1;
      const submitted = await submitting;
      assert.equal(submitted.isError, true);
      assert.equal(submitted.structured?.["code"], "ambiguous", submitted.text.slice(0, 300));
      assert.match(String(submitted.structured?.["next_action"]), /Do NOT submit this again/);
      assert.equal(sent(), 1, "one request, no retry");

      const reading = call("xo_list_orders", { owner: OWNER });
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      nodeMock.timers.tick(RELAY_CLIENT_TIMEOUT_MS + 1);
      const read = await reading;
      assert.equal(read.isError, true);
      assert.equal(typeof read.structured?.["code"], "string");
      assert.ok(String(read.structured?.["next_action"] ?? "").length >= 10, read.text.slice(0, 300));
      assert.equal(sent(), 2);
    } finally {
      nodeMock.timers.reset();
      await closeAll();
    }
  });
});
