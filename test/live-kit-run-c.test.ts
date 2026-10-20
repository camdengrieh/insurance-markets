import assert from "node:assert/strict";
import { describe } from "node:test";

import { spec as t5 } from "../scripts/live/t5-redeem.js";
import { spec as t6 } from "../scripts/live/t6-creation.js";
import { spec as t6b } from "../scripts/live/t6b-seed.js";
import { spec as t8 } from "../scripts/live/t8-capped-allowance.js";

import { MOCK_ARGS, assertTranscript, runCalls, runOnMock, writesOf } from "./live-kit-helpers.js";
import { useMock } from "./mock-xo/testing.js";

// T5 (redeem), T8 (capped allowance, revoke, kill switch), T6 (creation) and T6b (seed) on the mock, each with
// the call sequence a live run would make and with its stop rule exercised.

describe("T5 redeem", () => {
  const harness = useMock({ chains: { xo: true, base: false } });
  const ARGS = [...MOCK_ARGS, "--budget-usd", "0"] as const;

  harness.it("runs end to end: one redeemPositions operation on a resolved condition, one signature, one submit", async (mock) => {
    const outcome = await runOnMock(t5, ARGS, mock, {}, ["RECORD T5=yes"]);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.deepEqual(outcome.report.steps, ["status", "prepare", "sign", "submit", "wait"]);
    assertTranscript(t5, ARGS, outcome);
    assert.deepEqual(writesOf(outcome.report), ["relay POST /v1/userop/submit", "bundler eth_sendUserOperation"]);
    assert.equal(outcome.report.result?.facts.find((fact) => fact.id === "UO11")?.state, "yes");
    assert.ok(outcome.report.recorded.includes("T5=yes"));
  });

  harness.it("a paused paymaster is not worked around by the kit: the relay's own fallback sends without a paymaster, once", async (mock) => {
    const outcome = await runOnMock(t5, [...ARGS, "--mock-set", "paymaster.state=paused", "--no-record"], mock);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.equal(writesOf(outcome.report).filter((label) => label === "bundler eth_sendUserOperation").length, 1);
  });

  harness.it("a condition the relay cannot prove resolved is refused before anything is signed", async (mock) => {
    const unresolved = `0x${"ab".repeat(32)}`;
    const outcome = await runOnMock(t5, [...ARGS, "--condition-id", unresolved, "--no-record"], mock);
    assert.notEqual(outcome.report.status, "pass", outcome.text);
    assert.notEqual(outcome.report.status, "error", outcome.text);
    assert.deepEqual(writesOf(outcome.report), [], "nothing was signed or sent");
  });

  harness.it("a rejection with no paymaster to blame is reported once and never retried", async (mock) => {
    const outcome = await runOnMock(t5, [...ARGS, "--mock-set", "paymaster.state=paused", "--mock-set", "bundler.paymasterless=reject", "--no-record"], mock);
    assert.ok(["fail", "inconclusive"].includes(outcome.report.status), outcome.text);
    assert.ok(writesOf(outcome.report).filter((label) => label === "bundler eth_sendUserOperation").length <= 1);
  });

  harness.it("the live target needs its condition id", async () => {
    const outcome = await runOnMock(t5, ["--target=live", "--confirm", "--budget-usd", "0", "--owner", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "--data-dir", "data", "--credential-id", "c"], undefined, { env: { XO_LIVE_ACK: "T5" } });
    assert.equal(outcome.report.status, "refused");
    assert.match(outcome.report.refusal ?? "", /--condition-id is required/);
  });
});

describe("T8 capped allowance, on-chain revoke, kill switch", () => {
  const harness = useMock({ chains: { xo: true, base: false } });
  const ARGS = [...MOCK_ARGS, "--budget-usd", "1.43"] as const;

  harness.it("runs end to end: revoke, capped enable, order within the cap, order beyond it, final revoke, kill switch", async (mock) => {
    let killed = false;
    const outcome = await runOnMock(t8, ARGS, mock, { onContext: (ctx) => { killed = ctx.services !== undefined; } }, ["RECORD T8=yes"]);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.ok(killed);
    assert.deepEqual(outcome.report.steps, ["status", "revoke", "capped", "within", "beyond", "revoke-final", "kill"]);
    assertTranscript(t8, ARGS, outcome);
    const labels = writesOf(outcome.report);
    assert.equal(labels.filter((label) => label === "bundler eth_sendUserOperation").length, 3, "revoke, capped enable, final revoke");
    assert.match(outcome.text, /trading_enabled after the first revoke = no/);
    assert.match(outcome.text, /trading_enabled after the final revoke = no/);
    assert.match(outcome.text, /order after the revoke = refused/);
    assert.match(outcome.text, /order\/prepare with the kill switch on = kill_switch/);
    assert.match(outcome.text, /userop\/prepare with the kill switch on = kill_switch/);
    assert.match(outcome.text, /sent without a paymaster/, "the on-chain revoke is paymaster-less");
    assert.equal(outcome.report.result?.facts.find((fact) => fact.id === "T8")?.state, "yes");
    assert.ok(outcome.report.recorded.includes("T8=yes"));
  });

  harness.it("STOP: if the on-chain revoke is rejected the run ends there, after one write, and nothing else is tried", async (mock) => {
    const outcome = await runOnMock(t8, [...ARGS, "--mock-set", "bundler.paymasterless=reject", "--no-record"], mock);
    assert.equal(outcome.report.status, "fail", outcome.text);
    assert.equal(writesOf(outcome.report).filter((label) => label === "bundler eth_sendUserOperation").length, 1);
    assert.equal(writesOf(outcome.report).filter((label) => label.includes("order")).length, 0, "no order was placed");
    assert.equal(outcome.report.result?.facts.find((fact) => fact.id === "T8")?.state, "no");
  });

  harness.it("not ready is not a failure: without credentials or a known account nothing is signed", async (mock) => {
    const outcome = await runOnMock(t8, [...ARGS, "--mock-profile", "pessimistic", "--no-record"], mock);
    assert.equal(outcome.report.status, "inconclusive", outcome.text);
    assert.deepEqual(writesOf(outcome.report), []);
  });

  harness.it("refuses a cap that does not sit between the two orders", async (mock) => {
    const tooHigh = await runOnMock(t8, [...ARGS, "--allowance-usd", "5"], mock);
    assert.equal(tooHigh.report.status, "refused");
    assert.match(tooHigh.report.refusal ?? "", /beyond the cap must cost more/);
    const tooLow = await runOnMock(t8, [...ARGS, "--allowance-usd", "0.2"], mock);
    assert.equal(tooLow.report.status, "refused");
    assert.deepEqual(tooLow.report.calls, []);
  });

  harness.it("states in its own words the two things A11 keeps apart: the on-chain revoke and the software kill switch", async (mock) => {
    const outcome = await runOnMock(t8, [...ARGS, "--dry-run"], mock);
    const text = outcome.scripted.out.join("\n");
    assert.match(text, /On-chain revoke_trading/);
    assert.match(text, /kill/i);
    assert.deepEqual(outcome.report.calls, []);
  });
});

describe("T6 creation experiment", () => {
  const harness = useMock({ chains: { xo: true, base: false } });
  const ARGS = [...MOCK_ARGS, "--budget-usd", "1", "--no-record"] as const;

  harness.it("runs end to end: validate, ONE create submit, follow the review to approval, the $1 fee is the only cost", async (mock) => {
    const outcome = await runOnMock(t6, [...MOCK_ARGS, "--budget-usd", "1"], mock, {}, ["RECORD T6=yes"]);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assertTranscript(t6, [...MOCK_ARGS, "--budget-usd", "1"], outcome);
    assert.equal(writesOf(outcome.report).filter((label) => label === "bundler eth_sendUserOperation").length, 1, "creation is never retried");
    assert.match(outcome.text, /Hosting is accepted/);
    assert.ok(outcome.report.recorded.includes("T6=yes"));
    // Market text is untrusted data: in anything the relay or the kit SAYS (summaries, warnings, observations) it only
    // ever appears inside the fixed slot. The one echo that is not text for a reader is the request body the operator
    // is shown before it is sent, which carries the title of the file the operator wrote.
    for (const line of outcome.report.lines) {
      if (/^\s+body: /.test(line)) continue;
      if (line.includes("Will the Sample Rovers beat the Example United")) assert.match(line, /\[market title \(untrusted\): "/, line);
    }
  });

  harness.it("prints the terms and jurisdiction warning and the non-refundable fee with the plan", async (mock) => {
    const outcome = await runOnMock(t6, [...ARGS, "--dry-run"], mock);
    const text = outcome.scripted.out.join("\n");
    assert.match(text, /not refundable|non-refundable/i);
    assert.match(text, /DEDICATED PayBox credential/);
    assert.deepEqual(outcome.report.calls, []);
  });

  harness.it("STOP RULE: an oracle that rejects means hosting is not accepted: creation stays blocked, no retry, no substitute", async (mock) => {
    const outcome = await runOnMock(t6, [...ARGS, "--mock-decision", "reject"], mock);
    assert.equal(outcome.report.status, "fail", outcome.text);
    assert.match(outcome.report.result?.summary ?? "", /Creation stays blocked; no substitute is built/);
    assert.equal(writesOf(outcome.report).filter((label) => label === "bundler eth_sendUserOperation").length, 1);
    assert.equal(outcome.report.result?.facts.find((fact) => fact.id === "T6")?.state, "no");
  });

  harness.it("an oracle that asks for an update the guard flags is left unanswered: no second signature", async (mock) => {
    const outcome = await runOnMock(t6, [...ARGS, "--mock-decision", "update"], mock);
    assert.ok(["inconclusive", "pass"].includes(outcome.report.status), outcome.text);
    assert.ok(writesOf(outcome.report).filter((label) => label === "bundler eth_sendUserOperation").length <= 2);
    assert.doesNotMatch(outcome.text, /UNSAFE/);
  });

  harness.it("a pessimistic oracle (foreign URIs rejected) is a finding, not a crash", async (mock) => {
    const outcome = await runOnMock(t6, [...ARGS, "--mock-set", "meta.foreign_uri=rejected"], mock);
    assert.equal(outcome.report.status, "fail", outcome.text);
    assert.equal(outcome.report.result?.facts.find((fact) => fact.id === "T6")?.state, "no");
  });

  harness.it("an oracle that never answers inside the window is inconclusive: the relay keeps watching, nothing is created again", async (mock) => {
    const outcome = await runOnMock(t6, [...ARGS, "--mock-set", "meta.foreign_uri=ignored"], mock);
    assert.equal(outcome.report.status, "inconclusive", outcome.text);
    assert.match(outcome.report.result?.summary ?? "", /nothing is created again/);
    assert.match(outcome.report.result?.summary ?? "", /resumes when a relay next starts/);
    assert.equal(writesOf(outcome.report).filter((label) => label === "bundler eth_sendUserOperation").length, 1);
  });

  harness.it("refuses an end date outside 1 to 7 days and a missing hosting URL on the live target", async (mock) => {
    const far = await runOnMock(t6, [...ARGS, "--expires-in-days", "9"], mock);
    assert.equal(far.report.status, "refused");
    const live = await runOnMock(t6, ["--target=live", "--confirm", "--budget-usd", "1", "--owner", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "--data-dir", "data", "--credential-id", "c"], undefined, { env: { XO_LIVE_ACK: "T6" } });
    assert.equal(live.report.status, "refused");
    assert.match(live.report.refusal ?? "", /--metadata-file is required/);
  });

  harness.it("the budget must cover the $1 fee", async (mock) => {
    const outcome = await runOnMock(t6, [...MOCK_ARGS, "--budget-usd", "0.5"], mock);
    assert.equal(outcome.report.status, "refused");
    assert.deepEqual(outcome.report.calls, []);
  });
});

describe("T6b seed", () => {
  const harness = useMock({ chains: { xo: true, base: false } });
  const ARGS = [...MOCK_ARGS, "--budget-usd", "10.8"] as const;

  harness.it("runs end to end on the market T6 left: a post-only GTD seed of $10, ONE submit, found, cancelled", async (mock) => {
    const outcome = await runOnMock(t6b, ARGS, mock, {}, ["RECORD T6b=yes"]);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assertTranscript(t6b, ARGS, outcome);
    const writes = writesOf(outcome.report);
    assert.equal(writes.filter((label) => label === "orderbook POST /order").length, 1, "one seed on the wire");
    assert.ok(writes.includes("relay POST /v1/order/cancel"), "released again unless --keep-seed");
    assert.match(outcome.text, /post-only/i);
    assert.match(outcome.text, /GTD/);
    assert.ok(outcome.report.recorded.includes("T6b=yes"));
  });

  harness.it("--keep-seed leaves the seed resting: no cancel is made", async (mock) => {
    const outcome = await runOnMock(t6b, [...ARGS, "--keep-seed", "--no-record"], mock);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.ok(!writesOf(outcome.report).includes("relay POST /v1/order/cancel"));
  });

  harness.it("the budget must cover the seed cap of $10.80 (A3): $10 is refused", async (mock) => {
    const outcome = await runOnMock(t6b, [...MOCK_ARGS, "--budget-usd", "10"], mock);
    assert.equal(outcome.report.status, "refused");
    assert.match(outcome.report.refusal ?? "", /at risk/);
  });

  harness.it("prints the open item O2: T6 plus T6b is above the funding cap until T4 passes", async (mock) => {
    const outcome = await runOnMock(t6b, [...ARGS, "--dry-run"], mock);
    const text = outcome.scripted.out.join("\n");
    assert.match(text, /O2/);
    assert.deepEqual(outcome.report.calls, []);
  });

  harness.it("a seed price off the grid, a stake that does not land on it, or a ttl outside 7 to 30 days is refused before anything runs", async (mock) => {
    for (const extra of [["--price", "0.97"], ["--price", "0.03"], ["--ttl-days", "3"], ["--ttl-days", "45"], ["--outcome", "maybe"]]) {
      const outcome = await runOnMock(t6b, [...ARGS, ...extra], mock);
      assert.equal(outcome.report.status, "refused", extra.join(" "));
      assert.deepEqual(runCalls(outcome.report), []);
    }
  });
});
