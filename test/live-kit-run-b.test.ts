import assert from "node:assert/strict";
import { describe } from "node:test";

import { spec as t3a } from "../scripts/live/t3a-deposit.js";
import { spec as t3b } from "../scripts/live/t3b-first-order.js";
import { spec as t3c } from "../scripts/live/t3c-fee-reconciliation.js";
import { spec as t4 } from "../scripts/live/t4-exit.js";
import { simulatedBaseWallet } from "../scripts/live/lib/world.js";
import type { BaseCall, BaseWallet } from "../scripts/live/lib/types.js";
import { testAccount } from "./anvil/chain.js";
import { MOCK_ARGS, assertTranscript, runCalls, runOnMock, writesOf } from "./live-kit-helpers.js";
import { useMock } from "./mock-xo/testing.js";
import type { MockXo } from "./mock-xo/server.js";

// T3a (deposit), T4 (exit), T3b (first order) and T3c (fee reconciliation) on the mock, each with the call
// sequence a live run would make and with its stop rule exercised.

// A Base wallet that counts what it was asked to send, then does what the rehearsal's stand-in does.
function countingWallet(mock: MockXo): { wallet: BaseWallet; sent: BaseCall[] } {
  const inner = simulatedBaseWallet(mock, testAccount(0).address);
  const sent: BaseCall[] = [];
  return {
    sent,
    wallet: {
      kind: "simulated",
      async send(call) {
        sent.push(call);
        return inner.send(call);
      },
    },
  };
}

describe("T3a deposit", () => {
  const harness = useMock({ chains: { xo: true, base: true } });
  const ARGS = [...MOCK_ARGS, "--budget-usd", "3", "--amount-usd", "3"] as const;

  harness.it("runs end to end: relay check, the exact approve, ONE transferRemote to the derived account, follow, read the credit", async (mock) => {
    const { wallet, sent } = countingWallet(mock);
    let relayKey = "";
    const outcome = await runOnMock(t3a, ARGS, mock, { world: { mock, baseWallet: wallet }, onContext: (ctx) => { relayKey = ctx.services?.key.reveal() ?? ""; } }, ["RECORD T3a=yes"]);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.deepEqual(outcome.report.steps, ["status", "approve", "transfer", "follow", "verify"]);
    assertTranscript(t3a, ARGS, outcome, { secrets: [relayKey] });
    assert.deepEqual(sent.map((call) => call.label.split(":")[0]).length, 2, "exactly two Base transactions: approve and transferRemote");
    assert.ok(sent.every((call) => call.value === "0" && call.chain === "eip155:8453"));
    assert.equal(mock.hyperlane.messages.filter((message) => message.direction === "base_to_xo").length, 1, "exactly one message: a deposit is never sent twice");
    assert.deepEqual(writesOf(outcome.report), [], "T3a makes no XO write of its own: the two writes are Base transactions you send");
    assert.ok(outcome.report.recorded.includes("T3a=yes"));
    assert.match(outcome.text, /SEND ON BASE|approve/);
  });

  harness.it("prints the dedicated-wallet precondition, the one-way warning and the cap, with the plan", async (mock) => {
    const outcome = await runOnMock(t3a, [...ARGS, "--dry-run"], mock);
    const text = outcome.scripted.out.join("\n");
    assert.match(text, /DEDICATED PayBox credential/);
    assert.match(text, /one-way/);
    assert.deepEqual(outcome.report.calls, []);
  });

  harness.it("STOP RULE: delivered but not credited within 10 minutes: no second transfer, ever", async (mock) => {
    const { wallet, sent } = countingWallet(mock);
    const outcome = await runOnMock(t3a, [...ARGS, "--mock-set", "funding.credit=not-credited", "--no-record"], mock, { world: { mock, baseWallet: wallet } });
    assert.equal(outcome.report.status, "fail", outcome.text);
    assert.equal(outcome.report.exitCode, 1);
    assert.match(outcome.report.result?.summary ?? "", /Do NOT send another/);
    assert.equal(sent.length, 2, "one approve and one transfer, no more");
    assert.equal(mock.hyperlane.messages.filter((message) => message.direction === "base_to_xo").length, 1);
    assert.equal(outcome.report.result?.facts.find((fact) => fact.id === "T3a")?.state, "no");
  });

  harness.it("a credit that comes late (inside the ten minutes) still passes, with no second transfer", async (mock) => {
    const { wallet, sent } = countingWallet(mock);
    const outcome = await runOnMock(t3a, [...ARGS, "--mock-set", "funding.credit=delayed-5min", "--no-record"], mock, { world: { mock, baseWallet: wallet } });
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.equal(sent.length, 2);
  });

  harness.it("an amount above the ceiling or below the plan's exposure is refused before anything runs", async (mock) => {
    const above = await runOnMock(t3a, [...MOCK_ARGS, "--budget-usd", "3", "--amount-usd", "3.5"], mock);
    assert.equal(above.report.status, "refused");
    assert.deepEqual(above.report.calls, []);
    const under = await runOnMock(t3a, [...MOCK_ARGS, "--budget-usd", "1", "--amount-usd", "2"], mock);
    assert.equal(under.report.status, "refused");
    assert.match(under.report.refusal ?? "", /at risk/);
  });

  harness.it("an operator who never pastes a transaction hash ends the run: nothing more is sent", async (mock) => {
    const failing: BaseWallet = { kind: "simulated", send: async () => { throw new (await import("../scripts/live/lib/types.js")).Refusal("no_input", "No answer was given. Nothing more is sent."); } };
    const outcome = await runOnMock(t3a, [...ARGS, "--no-record"], mock, { world: { mock, baseWallet: failing } });
    assert.equal(outcome.report.status, "inconclusive", outcome.text);
    assert.equal(mock.hyperlane.messages.length, 0);
  });
});

describe("T4 exit", () => {
  const harness = useMock({ chains: { xo: true, base: true } });
  const ARGS = [...MOCK_ARGS, "--budget-usd", "3", "--amount-usd", "1"] as const;

  harness.it("runs end to end: paymaster-less zero-fee withdrawal to the OWNER only, one signature, one submit, arrival on Base", async (mock) => {
    const outcome = await runOnMock(t4, ARGS, mock, {}, ["RECORD T4=yes"]);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.deepEqual(outcome.report.steps, ["status", "prepare", "sign", "submit", "wait", "arrival"]);
    assertTranscript(t4, ARGS, outcome);
    assert.deepEqual(writesOf(outcome.report), ["relay POST /v1/userop/submit", "bundler eth_sendUserOperation"]);
    const facts = new Map(outcome.report.result?.facts.map((fact) => [fact.id, fact]));
    assert.equal(facts.get("FU9")?.state, "yes");
    assert.equal(facts.get("UO8")?.state, "yes");
    assert.ok(outcome.report.recorded.includes("T4=yes"));
    assert.match(outcome.text, /sent without a paymaster|no paymaster/i);
    assert.equal(mock.hyperlane.messages.filter((message) => message.direction === "xo_to_base").length, 1, "one withdrawal message");
  });

  harness.it("STOP RULE: rejected means nothing moved, and the rejection is not retried", async (mock) => {
    const outcome = await runOnMock(t4, [...ARGS, "--mock-set", "withdraw.paymasterless=reject", "--no-record"], mock);
    assert.equal(outcome.report.status, "fail", outcome.text);
    assert.match(outcome.report.result?.summary ?? "", /Nothing moved/);
    assert.equal(writesOf(outcome.report).filter((label) => label === "bundler eth_sendUserOperation").length, 1);
    assert.equal(outcome.report.result?.facts.find((fact) => fact.id === "FU9")?.state, "no");
    assert.equal(mock.hyperlane.messages.filter((message) => message.direction === "xo_to_base").length, 0);
  });

  harness.it("STOP RULE: accepted but not delivered after 10 minutes: no retry, the account is one-way", async (mock) => {
    const outcome = await runOnMock(t4, [...ARGS, "--mock-set", "withdraw.paymasterless=accept-no-deliver", "--no-record"], mock);
    assert.equal(outcome.report.status, "fail", outcome.text);
    assert.match(outcome.report.result?.summary ?? "", /No retry/);
    assert.equal(writesOf(outcome.report).filter((label) => label === "bundler eth_sendUserOperation").length, 1);
    assert.equal(outcome.report.result?.facts.find((fact) => fact.id === "T4")?.state, "no");
  });

  harness.it("refuses an amount above the $3 ceiling and a missing amount, before anything runs", async (mock) => {
    const above = await runOnMock(t4, [...MOCK_ARGS, "--budget-usd", "3", "--amount-usd", "4"], mock);
    assert.equal(above.report.status, "refused");
    const missing = await runOnMock(t4, [...MOCK_ARGS, "--budget-usd", "3"], mock);
    assert.equal(missing.report.status, "refused");
    assert.deepEqual(missing.report.calls, []);
  });
});

describe("T3b first order", () => {
  const harness = useMock({ chains: { xo: true, base: false } });
  const ARGS = [...MOCK_ARGS, "--budget-usd", "0.55"] as const;

  harness.it("runs end to end: one post-only GTD order, ONE submit, found in the list, cancelled by hash, confirmed gone", async (mock) => {
    let relayKey = "";
    const outcome = await runOnMock(t3b, ARGS, mock, { onContext: (ctx) => { relayKey = ctx.services?.key.reveal() ?? ""; } }, ["RECORD T3b=yes"]);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.deepEqual(outcome.report.steps, ["status", "market", "prepare", "sign", "submit", "check", "cancel"]);
    assertTranscript(t3b, ARGS, outcome, { secrets: [relayKey] });
    const writes = writesOf(outcome.report);
    assert.equal(writes.filter((label) => label === "orderbook POST /order").length, 1, "one order on the wire");
    assert.equal(writes.filter((label) => label === "relay POST /v1/order/submit").length, 1);
    assert.ok(writes.includes("relay POST /v1/order/cancel"));
    for (const call of runCalls(outcome.report).filter((entry) => entry.label === "orderbook GET /orders")) assert.equal(call.search, "", "no query string on a signed request");
    assert.match(outcome.text, /max outlay \(with the 1000 bps cap multiplier\): 0\.55 USD/);
    assert.match(outcome.text, /OR3 wire prefix = yes/);
    assert.match(outcome.text, /OR4 digest form = yes/);
    assert.match(outcome.text, /OR11 cancel body = yes/);
    assert.equal(outcome.report.result?.facts.find((fact) => fact.id === "T3b")?.state, "yes");
    assert.ok(outcome.report.recorded.includes("T3b=yes"));
  });

  harness.it("--probes sends the sub-floor probes and the deliberate duplicate, within its larger write list, and cancels what rests", async (mock) => {
    const argv = [...MOCK_ARGS, "--budget-usd", "0.66", "--probes", "--no-record", "--mock-set", "order.min_size=1", "--mock-set", "order.min_notional=0.30", "--mock-set", "order.gtd_min=60"];
    const outcome = await runOnMock(t3b, argv, mock);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.deepEqual(outcome.report.steps.slice(-1), ["probes"]);
    assertTranscript(t3b, argv, outcome);
    const posts = writesOf(outcome.report).filter((label) => label === "orderbook POST /order").length;
    assert.equal(posts, 7, "the order itself, five probes and the one deliberate duplicate");
    const facts = new Map(outcome.report.result?.facts.map((fact) => [fact.id, fact]));
    assert.equal(facts.get("OR6")?.state, "yes");
    assert.match(facts.get("OR6")?.note ?? "", /refused at \$0\.01/);
    assert.equal(facts.get("OR17")?.value, "gtd_min_le_60s");
    assert.equal(facts.get("OR13")?.state, "yes");
    assert.match(outcome.text, /probe life_30 answer = refused/);
  });

  harness.it("STOP: a budget under the plan's outflow is refused, and so is a price off the grid", async (mock) => {
    const tooLow = await runOnMock(t3b, [...MOCK_ARGS, "--budget-usd", "0.3"], mock);
    assert.equal(tooLow.report.status, "refused");
    const offGrid = await runOnMock(t3b, [...ARGS, "--price", "0.5005"], mock);
    assert.equal(offGrid.report.status, "refused");
    assert.deepEqual(offGrid.report.calls, []);
  });

  harness.it("not ready is not a failure: without credentials or a known account nothing is signed", async (mock) => {
    const outcome = await runOnMock(t3b, [...ARGS, "--mock-profile", "pessimistic", "--no-record"], mock);
    assert.equal(outcome.report.status, "inconclusive", outcome.text);
    assert.deepEqual(writesOf(outcome.report), []);
  });

  harness.it("the prefix is swapped only after an explicit signature rejection, never twice, and the second order carries the same signature", async (mock) => {
    const argv = [...ARGS, "--mock-set", "order.prefix=0x00", "--no-record"];
    const outcome = await runOnMock(t3b, argv, mock);
    assert.ok(["pass", "inconclusive", "fail"].includes(outcome.report.status), outcome.text);
    const posts = runCalls(outcome.report).filter((call) => call.label === "orderbook POST /order" && call.blocked === undefined);
    assert.ok(posts.length <= 2, `${String(posts.length)} posts: at most the one deliberate prefix swap`);
  });
});

describe("T3c fee reconciliation", () => {
  const harness = useMock({ chains: { xo: true, base: false } });
  const ARGS = [...MOCK_ARGS, "--budget-usd", "1.10"] as const;

  harness.it("runs end to end and reconciles the OUTFLOW: balance before minus after against principal plus fee, within the 800 bps bound", async (mock) => {
    const outcome = await runOnMock(t3c, ARGS, mock, {}, ["RECORD T3c=yes"]);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.deepEqual(outcome.report.steps, ["status", "market", "prepare", "sign", "submit", "reconcile"]);
    assertTranscript(t3c, ARGS, outcome);
    assert.match(outcome.text, /outflow \(balance before minus after\)/);
    assert.match(outcome.text, /outflow reconciles with the fill = yes/);
    assert.match(outcome.text, /400\.00 bps against a 800 bps bound/);
    assert.equal(writesOf(outcome.report).filter((label) => label === "orderbook POST /order").length, 1, "one taker order, never repeated");
    const facts = new Map(outcome.report.result?.facts.map((fact) => [fact.id, fact]));
    assert.equal(facts.get("T3c")?.state, "yes");
    assert.equal(facts.get("OR7")?.state, "yes");
  });

  harness.it("STOP RULE: an outflow beyond principal plus the bound stops the run and proposes T3c as no", async (mock) => {
    // The orderbook takes twice what it should: more than the declared maximum, so the fee is above the bound.
    const original = mock.state.creditCollateral.bind(mock.state);
    mock.state.creditCollateral = (address: string, amount: bigint) => original(address, amount < 0n ? amount * 2n : amount);
    try {
      const outcome = await runOnMock(t3c, [...ARGS, "--no-record"], mock);
      assert.equal(outcome.report.status, "stopped", outcome.text);
      assert.equal(outcome.report.exitCode, 1);
      assert.match(outcome.report.result?.summary ?? "", /STOP RULE/);
      const facts = new Map(outcome.report.result?.facts.map((fact) => [fact.id, fact]));
      assert.equal(facts.get("T3c")?.state, "no");
      assert.equal(facts.get("OR7")?.state, "no");
    } finally {
      mock.state.creditCollateral = original;
    }
  });

  harness.it("not ready: without credentials nothing is signed or sent", async (mock) => {
    const outcome = await runOnMock(t3c, [...ARGS, "--mock-profile", "pessimistic", "--no-record"], mock);
    assert.equal(outcome.report.status, "inconclusive", outcome.text);
    assert.deepEqual(writesOf(outcome.report), []);
  });

  harness.it("refuses a budget under $1.10, the most a $1 BUY can cost with the cap multiplier", async (mock) => {
    const outcome = await runOnMock(t3c, [...MOCK_ARGS, "--budget-usd", "1"], mock);
    assert.equal(outcome.report.status, "refused");
    assert.match(outcome.report.refusal ?? "", /at risk/);
  });
});
