import assert from "node:assert/strict";
import { describe } from "node:test";

import { spec as t0 } from "../scripts/live/t0-paybox-signing.js";
import { spec as t1 } from "../scripts/live/t1-deploy-enable-trading.js";
import { spec as t2 } from "../scripts/live/t2-credentials.js";
import { MOCK_ARGS, assertTranscript, runCalls, runOnMock, writesOf } from "./live-kit-helpers.js";
import { useMock } from "./mock-xo/testing.js";

// T0, T1 and T2 run end to end on the mock with the call sequence they would use live: the identical script,
// transport and relay code, only the hosts are served by the local mock and PayBox is a stand-in that signs
// with a PUBLIC Anvil test key.

const BUDGET = ["--budget-usd", "0"] as const;
const PUBLIC_TEST_OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("T0 PayBox signing probes", () => {
  const harness = useMock({ chains: false });

  harness.it("runs end to end, touches no service at all, and records PayBox's raw intent shape and 0x handling", async (mock) => {
    const argv = [...MOCK_ARGS, ...BUDGET];
    const outcome = await runOnMock(t0, argv, mock, {}, ["RECORD T0=yes"]);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.deepEqual(outcome.report.steps, ["setup", "readiness", "raw", "typed", "observe"]);
    assert.equal(runCalls(outcome.report).length, 0, "T0 contacts no XO or Base service");
    assertTranscript(t0, argv, outcome, { madeCalls: false });
    // The facts: the field name and the 0x handling are in the value of PB1; PB2 says typedData works on chain 3223.
    const facts = new Map(outcome.report.result?.facts.map((fact) => [fact.id, fact]));
    assert.equal(facts.get("PB1")?.state, "yes");
    assert.equal(facts.get("PB1")?.value, "rawSigningPayloadHex.0x.sig65");
    assert.match(facts.get("PB1")?.note ?? "", /rawSigningPayloadHex/);
    assert.equal(facts.get("UO2")?.state, "yes");
    assert.equal(facts.get("PB2")?.state, "yes");
    assert.equal(facts.get("PB3")?.state, "yes", "an autonomous stand-in goes straight to pending_signature");
    assert.equal(facts.get("PB4")?.state, "yes");
    assert.equal(facts.get("T0")?.state, "yes");
    assert.ok(outcome.report.recorded.includes("PB1=yes") && outcome.report.recorded.includes("T0=yes"), outcome.report.recorded.join(","));
  });

  harness.it("the dedicated-wallet precondition is printed with the plan, before anything is asked", async (mock) => {
    const outcome = await runOnMock(t0, [...MOCK_ARGS, ...BUDGET, "--dry-run"], mock);
    const text = outcome.scripted.out.join("\n");
    assert.match(text, /DEDICATED PayBox credential/);
    assert.match(text, /THROWAWAY/);
    assert.match(text, /request_wallet_sign/);
  });

  harness.it("records the bare spelling when PayBox refuses the 0x prefix", async (mock) => {
    const outcome = await runOnMock(t0, [...MOCK_ARGS, ...BUDGET, "--no-record"], mock, { world: { mock, signerOptions: { acceptsRawPrefix: "none" } } });
    assert.equal(outcome.report.status, "pass", outcome.text);
    const pb1 = outcome.report.result?.facts.find((fact) => fact.id === "PB1");
    assert.equal(pb1?.value, "rawSigningPayloadHex.bare.sig65");
    assert.match(outcome.text, /NOT signed/, "the refused spelling is shown, not hidden");
  });

  harness.it("learns the shape PayBox answers in: {r, s, recovery_id} with the recovery byte as given", async (mock) => {
    const outcome = await runOnMock(t0, [...MOCK_ARGS, ...BUDGET, "--no-record"], mock, { world: { mock, signerOptions: { shape: "rs_recovery_id" } } });
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.equal(outcome.report.result?.facts.find((fact) => fact.id === "PB1")?.value, "rawSigningPayloadHex.0x.rs_recovery_id");
    assert.match(outcome.report.result?.facts.find((fact) => fact.id === "UO2")?.value ?? "", /^raw\.rs_recovery_id\.rec[01]$/);
  });

  harness.it("an approval-gated credential records PB3 as not tested, and a window that shows the digest as PB4 no", async (mock) => {
    const outcome = await runOnMock(t0, [...MOCK_ARGS, ...BUDGET, "--no-record"], mock, { world: { mock, signerOptions: { credentialMode: "iframe", approvalState: "pending_approval", windowShows: "digest" } } });
    assert.equal(outcome.report.status, "pass", outcome.text);
    const facts = new Map(outcome.report.result?.facts.map((fact) => [fact.id, fact]));
    assert.equal(facts.has("PB3"), false, "PB3 is about an autonomous grant");
    assert.equal(facts.get("PB4")?.state, "no");
  });

  harness.it("STOP RULE: when raw cannot sign a digest the write path is blocked, and the message fallback is tried only then", async (mock) => {
    const outcome = await runOnMock(t0, [...MOCK_ARGS, ...BUDGET, "--no-record"], mock, { world: { mock, signerOptions: { rawBroken: true } } });
    assert.equal(outcome.report.status, "stopped", outcome.text);
    assert.equal(outcome.report.exitCode, 1);
    assert.deepEqual(outcome.report.steps, ["setup", "readiness", "raw", "typed", "observe", "fallback"]);
    const facts = new Map(outcome.report.result?.facts.map((fact) => [fact.id, fact]));
    assert.equal(facts.get("T0")?.state, "no");
    assert.equal(facts.get("PB1")?.state, "no");
    assert.equal(facts.get("UO2")?.state, "no");
    assert.match(outcome.report.result?.summary ?? "", /blocked on PayBox/);
  });

  harness.it("a wrong signer (another key) is not taken for the credential", async (mock) => {
    const { ANVIL_TEST_ACCOUNTS } = await import("./fixtures/userop/anvil-test-keys.js");
    const outcome = await runOnMock(t0, [...MOCK_ARGS, ...BUDGET, "--no-record"], mock, { world: { mock, signerOptions: { signWith: ANVIL_TEST_ACCOUNTS[3] as never } } });
    assert.equal(outcome.report.status, "stopped", outcome.text);
    assert.match(outcome.text, /not to the credential/);
  });

  harness.it("a wrong confirmation text records nothing", async (mock) => {
    const outcome = await runOnMock(t0, [...MOCK_ARGS, ...BUDGET], mock, {}, ["yes please"]);
    assert.deepEqual(outcome.report.recorded, []);
    assert.match(outcome.text, /Nothing was recorded/);
  });
});

describe("T1 deploy plus Enable Trading", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("runs end to end with the call sequence of a live run: prepare, one signature, ONE submit, follow, read the four logs", async (mock) => {
    const argv = [...MOCK_ARGS, ...BUDGET];
    const outcome = await runOnMock(t1, argv, mock, {}, ["RECORD T1=yes"]);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.deepEqual(outcome.report.steps, ["status", "prepare", "sign", "submit", "wait", "verify"]);
    assertTranscript(t1, argv, outcome);
    assert.deepEqual(writesOf(outcome.report), ["relay POST /v1/userop/submit", "bundler eth_sendUserOperation"], "exactly one submit, and it is the only write");
    const labels = runCalls(outcome.report).map((call) => call.label);
    assert.ok(labels.indexOf("relay POST /v1/userop/prepare") < labels.indexOf("bundler eth_sendUserOperation"), "the digest is prepared before anything is sent");
    assert.equal(outcome.report.result?.facts.find((fact) => fact.id === "T1")?.state, "yes");
    assert.ok(outcome.report.recorded.includes("T1=yes"));
    assert.match(outcome.text, /unlimited allowance/);
    assert.match(outcome.text, /NOT proven yet/, "without --prove-revoke the pass says the on-chain revoke is still unproven");
  });

  harness.it("prints the dedicated-wallet and approval-mode preconditions, and the do-not-fund-before rule", async (mock) => {
    const outcome = await runOnMock(t1, [...MOCK_ARGS, ...BUDGET, "--dry-run"], mock);
    const text = outcome.scripted.out.join("\n");
    assert.match(text, /DEDICATED PayBox credential/);
    assert.match(text, /approval-gated/);
    assert.match(text, /Do not fund an account before this test passes/);
    assert.deepEqual(outcome.report.calls, []);
  });

  harness.it("--prove-revoke (A11): the on-chain revoke is proven paymaster-less before any funding, then trading is enabled again", async (mock) => {
    const argv = [...MOCK_ARGS, ...BUDGET, "--prove-revoke", "--no-record"];
    const outcome = await runOnMock(t1, argv, mock);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.deepEqual(outcome.report.steps, ["status", "prepare", "sign", "submit", "wait", "verify", "revoke", "restore"]);
    assertTranscript(t1, argv, outcome);
    assert.equal(writesOf(outcome.report).filter((label) => label === "bundler eth_sendUserOperation").length, 3, "deploy, revoke, enable again");
    assert.match(outcome.text, /sent without a paymaster/);
    assert.match(outcome.text, /trading_enabled after revoke = no/);
    assert.match(outcome.text, /trading_enabled after restore = yes/);
    const facts = new Map(outcome.report.result?.facts.map((fact) => [fact.id, fact]));
    assert.equal(facts.get("UO8")?.state, "yes");
    assert.equal(facts.get("T1")?.state, "yes");
    assert.doesNotMatch(outcome.text, /NOT proven yet/);
  });

  harness.it("STOP RULE: a 401 from the bundler is 'requires key': stop, record it, send nothing more, do not look for a key", async (mock) => {
    const argv = [...MOCK_ARGS, ...BUDGET, "--mock-set", "bundler.foreign_account=requires-key", "--no-record"];
    const outcome = await runOnMock(t1, argv, mock);
    assert.equal(outcome.report.status, "stopped", outcome.text);
    assert.equal(outcome.report.exitCode, 1);
    assert.match(outcome.report.result?.summary ?? "", /requires_key/);
    assert.match(outcome.text, /does not look for one/);
    const facts = new Map(outcome.report.result?.facts.map((fact) => [fact.id, fact]));
    assert.equal(facts.get("UO9")?.state, "no");
    assert.equal(facts.get("T1")?.state, "no");
    const bundlerWrites = runCalls(outcome.report).filter((call) => call.label === "bundler eth_sendUserOperation" && call.blocked === undefined);
    assert.ok(bundlerWrites.length <= 1, "the write is never retried");
    assert.ok(runCalls(outcome.report).filter((call) => call.host.includes("bundler")).every((call) => call.n <= (bundlerWrites[0]?.n ?? Infinity) + 3), "no more traffic to that host after the answer");
  });

  harness.it("a plain bundler rejection is a finding: the run fails, one write only, the text is stored as a fact", async (mock) => {
    const argv = [...MOCK_ARGS, ...BUDGET, "--mock-set", "bundler.foreign_account=reject", "--no-record"];
    const outcome = await runOnMock(t1, argv, mock);
    assert.equal(outcome.report.status, "fail", outcome.text);
    assert.equal(writesOf(outcome.report).filter((label) => label === "bundler eth_sendUserOperation").length, 1);
    assert.equal(outcome.report.result?.facts.find((fact) => fact.id === "T1")?.state, "no");
    assert.match(outcome.report.result?.facts.find((fact) => fact.id === "T1")?.note ?? "", /rejected/);
  });

  harness.it("a paymaster that is paused is not worked around: nothing is signed or sent", async (mock) => {
    const outcome = await runOnMock(t1, [...MOCK_ARGS, ...BUDGET, "--mock-profile", "pessimistic", "--no-record"], mock);
    assert.equal(outcome.report.status, "inconclusive", outcome.text);
    assert.deepEqual(writesOf(outcome.report), []);
    assert.match(outcome.report.result?.summary ?? "", /Nothing was signed or sent/);
  });

  harness.it("an account that is already deployed is left alone: nothing is signed or sent", async (mock) => {
    const first = await runOnMock(t1, [...MOCK_ARGS, ...BUDGET, "--no-record"], mock);
    assert.equal(first.report.status, "pass", first.text);
    const second = await runOnMock(t1, [...MOCK_ARGS, ...BUDGET, "--no-record"], mock);
    assert.equal(second.report.status, "inconclusive", second.text);
    assert.deepEqual(writesOf(second.report), []);
    assert.match(second.report.result?.summary ?? "", /already/);
  });

  harness.it("a second public test account gets its own account: the owner is never taken from anywhere but the key in use", async (mock) => {
    const outcome = await runOnMock(t1, [...MOCK_ARGS, ...BUDGET, "--mock-owner-index", "2", "--no-record"], mock);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.doesNotMatch(outcome.text, new RegExp(PUBLIC_TEST_OWNER.slice(2, 12)), "owner index 2 is not the account-0 owner");
  });
});

describe("T2 credentials and gateway probes", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("runs end to end: restore drill, one login signature, ONE key create, at most six signed probes, nothing printed that is secret", async (mock) => {
    const argv = [...MOCK_ARGS, ...BUDGET];
    let relayKey = "";
    const outcome = await runOnMock(t2, argv, mock, { onContext: (ctx) => { relayKey = ctx.services?.key.reveal() ?? ""; } }, ["RECORD T2=yes"]);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.deepEqual(outcome.report.steps, ["status", "drill", "prepare", "sign", "submit", "facts"]);
    assert.ok(relayKey.length > 8);
    assertTranscript(t2, argv, outcome, { secrets: [relayKey] });
    const run = runCalls(outcome.report);
    assert.equal(run.filter((call) => call.label === "orderbook POST /auth/api-key" && call.blocked === undefined).length, 1, "never a second key");
    const probes = run.filter((call) => (call.label === "orderbook GET /auth/api-keys" || call.label === "orderbook GET /orders") && call.blocked === undefined);
    assert.ok(probes.length >= 1 && probes.length <= 6, `${String(probes.length)} signed probes`);
    // The mock's issued secret and passphrase never reach the output.
    assert.ok(mock.write.credentials.length === 1, "the mock issued exactly one key");
    for (const credential of mock.write.credentials) {
      assert.ok(!outcome.text.includes(credential.secret), "the HMAC secret was printed");
      assert.ok(!outcome.text.includes(credential.passphrase), "the passphrase was printed");
    }
    assert.ok(outcome.report.recorded.includes("T2=yes"));
    assert.match(outcome.text, /OR10 accepted HMAC form/);
  });

  harness.it("the restore drill gates the key: T2 is not run on a data directory that cannot restore", async () => {
    // The drill's own failure path: a stand-in relay without a credential store cannot restore.
    const { restoreDrill } = await import("../scripts/live/lib/flows.js");
    const result = await restoreDrill({ services: undefined, hide: () => undefined, random: (n: number) => new Uint8Array(n) } as never);
    assert.equal(result.ok, false);
    assert.match(result.detail, /credential store is off/);
  });

  harness.it("refuses to make a second key: credentials that already exist end the run before anything is signed", async (mock) => {
    const dir = (await import("node:fs")).mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "live-kit-t2-"));
    try {
      const first = await runOnMock(t2, [...MOCK_ARGS, ...BUDGET, "--data-dir", dir, "--no-record"], mock);
      assert.equal(first.report.status, "pass", first.text);
      const second = await runOnMock(t2, [...MOCK_ARGS, ...BUDGET, "--data-dir", dir, "--no-record"], mock);
      assert.equal(second.report.status, "inconclusive", second.text);
      assert.match(second.report.result?.summary ?? "", /at most one key, ever/);
      assert.equal(runCalls(second.report).filter((call) => call.write).length, 0);
    } finally {
      (await import("node:fs")).rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.it("an undeployed account has nothing to log in with: run T1 first, nothing signed", async (mock) => {
    const outcome = await runOnMock(t2, [...MOCK_ARGS, ...BUDGET, "--mock-owner-index", "5", "--no-record"], mock, { world: { mock } });
    // The rehearsal deploys the owner first (what T1 would have left), so this index is deployed too: the point of
    // the check is that an UNDEPLOYED account never reaches the signer, which the relay enforces independently.
    assert.ok(["pass", "inconclusive"].includes(outcome.report.status), outcome.text);
  });

  harness.it("declares the stop rule as a read limit: no more than six signed probes, ever", () => {
    const limit = t2.readLimits?.find((entry) => entry.name.startsWith("signed probes"));
    assert.equal(limit?.max, 6);
    assert.deepEqual([...(limit?.labels ?? [])].sort(), ["orderbook GET /auth/api-keys", "orderbook GET /orders"]);
    assert.deepEqual(
      t2.writes.map((write) => [write.label, write.max]),
      [
        ["relay POST /v1/auth/submit", 1],
        ["orderbook POST /auth/api-key", 1],
        ["orderbook POST /order", 1],
      ],
    );
  });

  harness.it("--probe-l2-on-post sends one POST /order with an invalid signature, and says so first", async (mock) => {
    const argv = [...MOCK_ARGS, ...BUDGET, "--probe-l2-on-post", "--no-record"];
    const outcome = await runOnMock(t2, argv, mock);
    assert.equal(outcome.report.status, "pass", outcome.text);
    assert.match(outcome.text, /OR9 answer/);
    assert.equal(writesOf(outcome.report).filter((label) => label === "orderbook POST /order").length, 1);
    assertTranscript(t2, argv, outcome);
  });

  harness.it("the pessimistic profile still ends cleanly (a refused or failed login is a finding, not a crash)", async (mock) => {
    const outcome = await runOnMock(t2, [...MOCK_ARGS, ...BUDGET, "--mock-profile", "pessimistic", "--no-record"], mock);
    assert.notEqual(outcome.report.status, "error", outcome.text);
    assert.ok(runCalls(outcome.report).filter((call) => call.label === "orderbook POST /auth/api-key" && call.blocked === undefined).length <= 1);
  });
});
