import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { hashMessage, hashTypedData, type Hex } from "viem";

import {
  CREDENTIAL_LIST_ARGV,
  MAX_CLI_STDOUT_BYTES,
  POLL_INTERVAL_MS,
  PayboxSigningPath,
  RAW_SCHEME,
  childEnvFor,
  completeArgv,
  createPayboxCliClient,
  defaultCliRunner,
  parseCredentials,
  parseSignOutput,
  pollArgv,
  signArgv,
  vetForSigning,
  type CliClientOptions,
  type CliCommand,
  type CliRun,
  type CliRunner,
  type ClientSignRequest,
} from "../../paybox-signer.js";
import type { PayboxSignIntent } from "../../../src/relay/contract.js";
import { CONFIG_DIR, CREDENTIAL, OTHER_KEY_ACCOUNT, OWNER, OWNER_KEY_ACCOUNT, authItem, digestOfIntent, orderItem, signWith } from "./fixtures.js";

// The CLI client: how the `paybox` command is started (argument array, no shell, allowlisted environment), which
// commands make up the approval flow, and how each answer is read.
//
// FIXTURES. Every PayBox answer below is built from the published @paybox-sh/sdk 2.2.0 type definitions
// (AgentResponse, CredentialOutput, ClientCredentialList in dist/index.d.ts), the `next_action` its CLI adds
// (nextActionFor), and the artifacts its signing code posts (dist chunk `signIntent`, @moon-x/evm-adapter 0.3.0
// `assembleSignature`). None was recorded from a live account; no test here talks to PayBox. The ids are made up and
// the signatures are made with the public Anvil test key.

const FAKE = fileURLToPath(new URL("./fake-paybox.mjs", import.meta.url));
const NODE = process.execPath;
const signal = new AbortController().signal;
const DIGEST = `0x${"66".repeat(32)}` as Hex;
const INTENT: PayboxSignIntent = { op: "raw", rawSigningPayloadHex: DIGEST };
const BASE_ENV = Object.freeze({ PATH: process.env["PATH"] ?? "", LANG: "C", HOME: "/home/should-not-pass", NODE_OPTIONS: "--require /nonexistent.js", XO_MASTER_KEY: "sk-test-master-key-should-not-pass", RELAY_KEY: "relay-key-should-not-pass", ANYTHING_ELSE: "no" });

// ---- 2.2.0-shaped answers ----------------------------------------------------------------------------------------------------

const REQUEST_ID = "3f2b8c1e-7a4d-4e5f-9b6a-1c2d3e4f5a6b";
const OTHER_REQUEST_ID = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";
const APPROVAL_ID = "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f";
const CLIENT_ID = "5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9";
const USER_ID = "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e";

type Status = "pending_approval" | "pending_funding" | "pending_signature" | "pending_settlement" | "pending_confirmation" | "success" | "denied" | "error";

// nextActionFor(response, { canSignInProcess: true, canRenderSigningUi: false, canOpenApprovalUi: false, canPoll: true,
// canReconcile: true }), which is what PayboxClient.nextAction passes when a pbxk1 key is configured.
function nextAction(status: Status, retryable: boolean): { kind: string; reason: string } {
  switch (status) {
    case "pending_signature":
      return { kind: "sign", reason: "signer_ready" };
    case "pending_approval":
      return { kind: "stop", reason: "approval_ui_unavailable" };
    case "pending_confirmation":
    case "pending_settlement":
    case "pending_funding":
      return { kind: "poll", reason: status };
    case "success":
      return { kind: "stop", reason: "completed" };
    case "denied":
    case "error":
      return retryable ? { kind: "reconcile", reason: "retryable_terminal" } : { kind: "stop", reason: status };
  }
}

// AgentResponse + next_action, as `paybox --json sign` and `paybox --json request <id>` print it (JSON.stringify(data,
// null, 2)).
function agentResponse(status: Status, extra: { output?: unknown; error?: string | null; requestId?: string; retryable?: boolean } = {}): string {
  const retryable = extra.retryable ?? false;
  return JSON.stringify(
    {
      request_id: extra.requestId ?? REQUEST_ID,
      status,
      output: extra.output ?? null,
      approval_id: status === "pending_approval" || status === "pending_signature" || status === "success" ? APPROVAL_ID : null,
      error: extra.error ?? null,
      retryable,
      retry_hint: null,
      next_action: nextAction(status, retryable),
    },
    null,
    2,
  );
}

// CredentialOutput for a wallet signature; `value` is the artifact the 2.2.0 client posted.
function signatureOutput(value: unknown): Record<string, unknown> {
  return {
    output_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f7a",
    output_type: "signature",
    credential_id: CREDENTIAL,
    client_id: CLIENT_ID,
    scope: null,
    expires_at: "2026-10-19T12:10:00Z",
    one_time: false,
    approval_id: APPROVAL_ID,
    audit_id: "e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b",
    value,
  };
}
// message and typedData: { signature: 0x r||s||v } with v = 27 + yParity.
const hexArtifact = (signature: string): { signature: string } => ({ signature });
// raw: { scheme, signature: { r, s, recovery_id } }, r and s without 0x, recovery_id 0 or 1.
function rawArtifact(signature: Hex): { scheme: string; signature: { r: string; s: string; recovery_id: number } } {
  return { scheme: RAW_SCHEME, signature: { r: signature.slice(2, 66), s: signature.slice(66, 130), recovery_id: Number.parseInt(signature.slice(130, 132), 16) - 27 } };
}
// What the CLI's own catch prints with --json (cli.js `run`).
const cliError = (message: string): string => JSON.stringify({ error: message }, null, 2);

// ---- a scripted runner ----------------------------------------------------------------------------------------------------------

const exit = (stdout: string, code: number | null = 0, truncated = false): CliRun => ({ kind: "exit", code, stdout, truncated });
type Which = "sign" | "request" | "complete" | "credentials" | "other";
function which(args: readonly string[]): Which {
  if (args[1] === "sign") return "sign";
  if (args[1] === "credentials") return "credentials";
  if (args[1] === "request") return args.includes("--complete-signature") ? "complete" : "request";
  return "other";
}

interface Script {
  readonly run: CliRunner;
  readonly commands: CliCommand[];
  readonly timeouts: number[];
  readonly kinds: () => Which[];
}
// Answers by command; `request` answers are taken in order (the last one repeats).
function script(answers: { sign?: CliRun; request?: CliRun[]; complete?: CliRun; credentials?: CliRun }): Script {
  const commands: CliCommand[] = [];
  const timeouts: number[] = [];
  let polls = 0;
  return {
    commands,
    timeouts,
    kinds: () => commands.map((command) => which(command.args)),
    run: async (command, options) => {
      commands.push(command);
      timeouts.push(options.timeoutMs);
      switch (which(command.args)) {
        case "sign":
          return answers.sign ?? exit("");
        case "request": {
          const list = answers.request ?? [];
          const answer = list[Math.min(polls, list.length - 1)] ?? exit("");
          polls += 1;
          return answer;
        }
        case "complete":
          return answers.complete ?? exit("");
        case "credentials":
          return answers.credentials ?? exit("");
        default:
          return exit("");
      }
    },
  };
}

// A clock that only moves when the client pauses between reads.
function fakeTime(start = 1_000_000): { clock: () => number; sleep: NonNullable<CliClientOptions["sleep"]>; sleeps: number[] } {
  let now = start;
  const sleeps: number[] = [];
  return {
    sleeps,
    clock: () => now,
    sleep: async (ms, sleepSignal) => {
      sleeps.push(ms);
      now += ms;
      return !sleepSignal.aborted;
    },
  };
}

function client(s: Script, extra: Partial<CliClientOptions> = {}) {
  const time = fakeTime();
  return { time, client: createPayboxCliClient({ configDir: CONFIG_DIR, baseEnv: BASE_ENV, run: s.run, clock: time.clock, sleep: time.sleep, ...extra }) };
}
const request = (extra: Partial<ClientSignRequest> = {}): ClientSignRequest => ({ credentialId: CREDENTIAL, intent: INTENT, timeoutMs: 60_000, ...extra });

// `paybox --json credentials` with the one granted wallet, always_approve, whose address is the owner.
const GRANTED_LISTING = JSON.stringify({
  credentials: [
    {
      credential: { id: CREDENTIAL, user_id: USER_ID, name: "xo wallet", credential_type: "wallet", provider: "moonx", metadata: { address: OWNER, provider_wallet_id: "b3f1c2d4", chains: ["evm"] }, created_at: "2026-10-01T09:00:00Z", disabled_at: null },
      grant: { credential_id: CREDENTIAL, approval_mode: "always_approve" },
    },
  ],
  ungranted: [],
  agent_signer_recorded: true,
});

// The full always_approve flow: the request waits for approval twice, then is approved, then this client signs it.
function approvalFlow(success: string): Parameters<typeof script>[0] {
  return {
    credentials: exit(GRANTED_LISTING),
    sign: exit(agentResponse("pending_approval")),
    request: [exit(agentResponse("pending_approval")), exit(agentResponse("pending_approval")), exit(agentResponse("pending_signature"))],
    complete: exit(success),
  };
}

// ---- how the command is started --------------------------------------------------------------------------------------------------

describe("how the command is started", () => {
  it("the three commands of the flow: --json first, sign without --wait, then request <id>, then request <id> --complete-signature", async () => {
    const sig = await signWith(OWNER_KEY_ACCOUNT, DIGEST);
    const s = script(approvalFlow(agentResponse("success", { output: signatureOutput(rawArtifact(sig)) })));
    const result = await client(s).client.sign(request(), signal);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(s.kinds(), ["sign", "request", "request", "request", "complete"]);
    assert.deepEqual(s.commands[0]?.args, ["--json", "sign", "--credential", CREDENTIAL, "--intent", JSON.stringify(INTENT)]);
    assert.deepEqual(s.commands[1]?.args, ["--json", "request", REQUEST_ID]);
    assert.deepEqual(s.commands[4]?.args, ["--json", "request", REQUEST_ID, "--complete-signature"]);
    for (const command of s.commands) {
      assert.equal(command.bin, "paybox");
      assert.ok(!command.args.includes("--wait"), "no command of the flow takes --wait");
    }
    assert.deepEqual([...signArgv(CREDENTIAL, INTENT)], s.commands[0]?.args);
    assert.deepEqual([...pollArgv(REQUEST_ID)], s.commands[1]?.args);
    assert.deepEqual([...completeArgv(REQUEST_ID)], s.commands[4]?.args);
  });

  it("passes the intent as one argument of an argument array, and JSON that cannot be read as an @file", async () => {
    const hostile: PayboxSignIntent = {
      op: "typedData",
      typedData: { types: { T: [{ name: "a", type: "string" }] }, primaryType: "T", domain: { name: `x"; rm -rf / #$(id)\`y '` }, message: { a: "line1\nline2 ; && | > < $HOME @file" } },
    };
    const s = script({ sign: exit("{}") });
    await client(s).client.sign(request({ intent: hostile }), signal);
    assert.equal(s.commands.length, 1);
    const args = s.commands[0]?.args ?? [];
    assert.deepEqual(args, ["--json", "sign", "--credential", CREDENTIAL, "--intent", JSON.stringify(hostile)]);
    assert.ok(args[5]?.startsWith("{"), "the CLI reads an --intent that starts with @ as a file path");
  });

  it("a credential id that is not a UUID is refused before any process starts (the CLI would refuse it too)", async () => {
    const s = script({});
    for (const id of ["cred-test-0001", "", "not a uuid", `${CREDENTIAL} `, `${CREDENTIAL}0`]) {
      assert.deepEqual(await client(s).client.sign(request({ credentialId: id }), signal), { ok: false, code: "paybox_failed" }, id);
    }
    assert.equal(s.commands.length, 0);
  });

  it("the real runner delivers every argument intact (there is no shell to reinterpret them)", async () => {
    const nasty = `{"a":"x'; echo pwned #"}\n$(touch /nonexistent)`;
    const result = await defaultCliRunner({ bin: NODE, args: [FAKE, "dump", nasty, "two words"] }, { env: childEnvFor(BASE_ENV, CONFIG_DIR), timeoutMs: 10_000, maxStdoutBytes: MAX_CLI_STDOUT_BYTES, signal });
    assert.equal(result.kind, "exit");
    if (result.kind !== "exit") return;
    const seen = JSON.parse(result.stdout) as { args: string[] };
    assert.deepEqual(seen.args, [nasty, "two words"]);
  });

  it("gives the child an allowlisted environment: PAYBOX_CONFIG_DIR yes, the master key, the relay key, HOME and NODE_OPTIONS no", async () => {
    const result = await defaultCliRunner({ bin: NODE, args: [FAKE, "dump"] }, { env: childEnvFor(BASE_ENV, CONFIG_DIR), timeoutMs: 10_000, maxStdoutBytes: MAX_CLI_STDOUT_BYTES, signal });
    assert.equal(result.kind, "exit");
    if (result.kind !== "exit") return;
    const env = (JSON.parse(result.stdout) as { env: Record<string, string> }).env;
    assert.equal(env["PAYBOX_CONFIG_DIR"], CONFIG_DIR);
    assert.equal(env["PATH"], BASE_ENV.PATH);
    for (const key of ["HOME", "NODE_OPTIONS", "XO_MASTER_KEY", "RELAY_KEY", "ANYTHING_ELSE"]) assert.equal(env[key], undefined, key);
    assert.ok(!result.stdout.includes("should-not-pass"));
  });

  it("childEnvFor drops values with a NUL and never copies a name outside its list (PAYBOX_SIGNING_KEY and PAYBOX_API_KEY included)", () => {
    const env = childEnvFor({ PATH: "/a\0b", LANG: "C", SECRET_THING: "x", PAYBOX_CONFIG_DIR: "/somewhere/else", PAYBOX_SIGNING_KEY: "k", PAYBOX_API_KEY: "k", PAYBOX_ACCESS_TOKEN: "t" }, CONFIG_DIR);
    assert.deepEqual(Object.keys(env).sort(), ["LANG", "NO_COLOR", "PAYBOX_CONFIG_DIR"]);
    assert.equal(env["PAYBOX_CONFIG_DIR"], CONFIG_DIR, "the configured directory wins over the inherited one");
  });

  it("kills a process that outlives its timeout", async () => {
    const started = Date.now();
    const result = await defaultCliRunner({ bin: NODE, args: [FAKE, "sleep"] }, { env: childEnvFor(BASE_ENV, CONFIG_DIR), timeoutMs: 150, maxStdoutBytes: MAX_CLI_STDOUT_BYTES, signal });
    assert.equal(result.kind, "timeout");
    assert.ok(Date.now() - started < 5_000);
  });

  it("kills a process when the request is aborted", async () => {
    const controller = new AbortController();
    const pending = defaultCliRunner({ bin: NODE, args: [FAKE, "sleep"] }, { env: childEnvFor(BASE_ENV, CONFIG_DIR), timeoutMs: 20_000, maxStdoutBytes: MAX_CLI_STDOUT_BYTES, signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    assert.equal((await pending).kind, "aborted");
    const already = new AbortController();
    already.abort();
    assert.equal((await defaultCliRunner({ bin: NODE, args: [FAKE, "sleep"] }, { env: {}, timeoutMs: 1000, maxStdoutBytes: 10, signal: already.signal })).kind, "aborted");
  });

  it("stops reading a flood of output", async () => {
    const result = await defaultCliRunner({ bin: NODE, args: [FAKE, "flood"] }, { env: childEnvFor(BASE_ENV, CONFIG_DIR), timeoutMs: 10_000, maxStdoutBytes: 1024, signal });
    assert.equal(result.kind, "exit");
    if (result.kind === "exit") assert.equal(result.truncated, true);
  });

  it("a missing binary is paybox_missing", async () => {
    const missing = createPayboxCliClient({ configDir: CONFIG_DIR, baseEnv: BASE_ENV, bin: "cockpit-test-no-such-binary-anywhere" });
    assert.deepEqual(await missing.sign(request({ timeoutMs: 1000 }), signal), { ok: false, code: "paybox_missing" });
    assert.deepEqual(await missing.credential(CREDENTIAL, signal), { ok: false, code: "paybox_missing" });
  });
});

// ---- the approval flow ------------------------------------------------------------------------------------------------------------

describe("the approval flow (always_approve): sign, read until approved, then complete the signature", () => {
  const NOW = Date.parse("2026-10-19T12:00:00Z");

  it("raw: pending_approval, pending_signature, then success with { scheme, signature: { r, s, recovery_id } }; the path recovers the owner", async () => {
    const vet = vetForSigning(authItem(), { nowMs: NOW });
    assert.ok(vet.ok);
    const sig = await signWith(OWNER_KEY_ACCOUNT, vet.vetted.expectedDigest);
    const s = script(approvalFlow(agentResponse("success", { output: signatureOutput(rawArtifact(sig)) })));
    const { client: cli, time } = client(s);
    const answer = await cli.sign(request({ intent: vet.vetted.intent }), signal);
    assert.deepEqual(answer, { ok: true, signature: { r: `0x${sig.slice(2, 66)}`, s: `0x${sig.slice(66, 130)}`, recovery_id: Number.parseInt(sig.slice(130), 16) - 27 }, requestRef: REQUEST_ID });
    assert.deepEqual(time.sleeps, [POLL_INTERVAL_MS, POLL_INTERVAL_MS, POLL_INTERVAL_MS], "one pause before each read");
    assert.equal(POLL_INTERVAL_MS, 2_000, "the 2.2.0 SDK's own waitForRequest interval");

    const s2 = script(approvalFlow(agentResponse("success", { output: signatureOutput(rawArtifact(sig)) })));
    const result = await new PayboxSigningPath(client(s2).client).sign(vet.vetted, { credentialId: CREDENTIAL, timeoutMs: 60_000, signal });
    assert.ok(result.ok, JSON.stringify(result));
    assert.equal(result.signature, sig, "the canonical 65 bytes, v 27 or 28");
    assert.equal(result.form, "raw");
    assert.equal(result.requestRef, REQUEST_ID);
  });

  it("typedData: the same flow, success with { signature: 0x r||s||v }; the path recovers the owner over hashTypedData", async () => {
    const vet = vetForSigning(orderItem(), { nowMs: NOW });
    assert.ok(vet.ok);
    const sig = await signWith(OWNER_KEY_ACCOUNT, digestOfIntent(vet.vetted.intent));
    const s = script(approvalFlow(agentResponse("success", { output: signatureOutput(hexArtifact(sig)) })));
    const answer = await client(s).client.sign(request({ intent: vet.vetted.intent }), signal);
    assert.deepEqual(answer, { ok: true, signature: sig, requestRef: REQUEST_ID });
    const s2 = script(approvalFlow(agentResponse("success", { output: signatureOutput(hexArtifact(sig)) })));
    const result = await new PayboxSigningPath(client(s2).client).sign(vet.vetted, { credentialId: CREDENTIAL, timeoutMs: 60_000, signal });
    assert.ok(result.ok, JSON.stringify(result));
    assert.equal(result.signature, sig);
  });

  it("message: its answer has the typedData form, and the parser reads it (S2 itself never asks for a message)", async () => {
    const sig = await OWNER_KEY_ACCOUNT.signMessage({ message: "gm" });
    for (const stdout of [agentResponse("pending_approval"), agentResponse("pending_signature")]) {
      assert.equal(parseSignOutput(stdout, "message")?.status, JSON.parse(stdout).status);
    }
    const done = parseSignOutput(agentResponse("success", { output: signatureOutput(hexArtifact(sig)) }), "message");
    assert.deepEqual(done, { status: "success", requestId: REQUEST_ID, signature: sig });
    assert.notEqual(hashMessage("gm"), DIGEST);
  });

  it("a signature over a different digest or by another key comes through the client and is dropped by the path", async () => {
    const vet = vetForSigning(orderItem(), { nowMs: NOW });
    assert.ok(vet.ok);
    for (const sig of [await signWith(OTHER_KEY_ACCOUNT, digestOfIntent(vet.vetted.intent)), await signWith(OWNER_KEY_ACCOUNT, DIGEST)]) {
      const s = script(approvalFlow(agentResponse("success", { output: signatureOutput(hexArtifact(sig)) })));
      const result = await new PayboxSigningPath(client(s).client).sign(vet.vetted, { credentialId: CREDENTIAL, timeoutMs: 60_000, signal });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "owner_mismatch");
    }
  });

  it("a high-s raw answer is accepted and flipped to low s by the path", async () => {
    const vet = vetForSigning(authItem(), { nowMs: NOW });
    assert.ok(vet.ok);
    const sig = await signWith(OWNER_KEY_ACCOUNT, vet.vetted.expectedDigest);
    const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const highS = (n - BigInt(`0x${sig.slice(66, 130)}`)).toString(16).padStart(64, "0");
    const flippedId = Number.parseInt(sig.slice(130), 16) === 27 ? 1 : 0;
    const value = { scheme: RAW_SCHEME, signature: { r: sig.slice(2, 66), s: highS, recovery_id: flippedId } };
    const s = script(approvalFlow(agentResponse("success", { output: signatureOutput(value) })));
    const result = await new PayboxSigningPath(client(s).client).sign(vet.vetted, { credentialId: CREDENTIAL, timeoutMs: 60_000, signal });
    assert.ok(result.ok, JSON.stringify(result));
    assert.equal(result.flippedHighS, true);
    assert.equal(result.signature, sig);
  });

  it("no approval needed (pending_signature at once) goes straight to --complete-signature; success at once needs nothing more", async () => {
    const sig = await signWith(OWNER_KEY_ACCOUNT, DIGEST);
    const success = agentResponse("success", { output: signatureOutput(rawArtifact(sig)) });
    const direct = script({ sign: exit(agentResponse("pending_signature")), complete: exit(success) });
    assert.equal((await client(direct).client.sign(request(), signal)).ok, true);
    assert.deepEqual(direct.kinds(), ["sign", "complete"]);
    const done = script({ sign: exit(success) });
    assert.equal((await client(done).client.sign(request(), signal)).ok, true);
    assert.deepEqual(done.kinds(), ["sign"]);
  });

  it("an approval that arrives as success while reading needs no --complete-signature", async () => {
    const sig = await signWith(OWNER_KEY_ACCOUNT, DIGEST);
    const s = script({ sign: exit(agentResponse("pending_approval")), request: [exit(agentResponse("success", { output: signatureOutput(rawArtifact(sig)) }))] });
    assert.equal((await client(s).client.sign(request(), signal)).ok, true);
    assert.deepEqual(s.kinds(), ["sign", "request"]);
  });

  it("each call gets at most what is left of the budget, and a status read at most the read timeout", async () => {
    const sig = await signWith(OWNER_KEY_ACCOUNT, DIGEST);
    const s = script(approvalFlow(agentResponse("success", { output: signatureOutput(rawArtifact(sig)) })));
    await client(s, { readTimeoutMs: 5_000 }).client.sign(request({ timeoutMs: 60_000 }), signal);
    assert.deepEqual(s.timeouts, [60_000, 5_000, 5_000, 5_000, 60_000 - 3 * POLL_INTERVAL_MS]);
  });
});

describe("the flow stops, and nothing is signed, when it should", () => {
  it("denied at the first answer (exit 1, JSON on stdout) is paybox_declined, with no further command", async () => {
    for (const retryable of [false, true]) {
      const s = script({ sign: exit(agentResponse("denied", { error: "denied by user", retryable }), 1) });
      assert.deepEqual(await client(s).client.sign(request(), signal), { ok: false, code: "paybox_declined" });
      assert.deepEqual(s.kinds(), ["sign"]);
    }
  });

  it("denied while waiting for approval is paybox_declined, and --complete-signature is never run", async () => {
    const s = script({ sign: exit(agentResponse("pending_approval")), request: [exit(agentResponse("pending_approval")), exit(agentResponse("denied", { error: "denied by user" }), 1)] });
    assert.deepEqual(await client(s).client.sign(request(), signal), { ok: false, code: "paybox_declined" });
    assert.ok(!s.kinds().includes("complete"));
  });

  it("status error (exit 1) is paybox_failed, at any step", async () => {
    const failing = exit(agentResponse("error", { error: "signing failed" }), 1);
    for (const answers of [{ sign: failing }, { sign: exit(agentResponse("pending_approval")), request: [failing] }, { sign: exit(agentResponse("pending_signature")), complete: failing }]) {
      assert.deepEqual(await client(script(answers)).client.sign(request(), signal), { ok: false, code: "paybox_failed" });
    }
  });

  it("the CLI's own error JSON ({\"error\": ...}, exit 1) is paybox_failed, and its text is not kept", async () => {
    const texts = [
      "paybox POST /agent/wallet-sign failed (401): unauthorized",
      "cannot complete wallet-sign request without a valid local signing key",
      "--credential expects a credential id, not a name: got \"x\". Run `paybox credentials` and use the `credential.id` of the one you want.",
    ];
    for (const text of texts) {
      for (const answers of [{ sign: exit(cliError(text), 1) }, { sign: exit(agentResponse("pending_signature")), complete: exit(cliError(text), 1) }]) {
        const result = await client(script(answers)).client.sign(request(), signal);
        assert.deepEqual(result, { ok: false, code: "paybox_failed" });
      }
    }
  });

  it("a usage error (plain text on stderr, nothing on stdout, exit 1) is paybox_failed, also from a real process", async () => {
    assert.deepEqual(await client(script({ sign: exit("", 1) })).client.sign(request(), signal), { ok: false, code: "paybox_failed" });
    const real = createPayboxCliClient({ configDir: CONFIG_DIR, baseEnv: BASE_ENV, bin: NODE, binArgs: [FAKE, "usage"] });
    assert.deepEqual(await real.sign(request({ timeoutMs: 10_000 }), signal), { ok: false, code: "paybox_failed" });
  });

  it("the budget running out while the user has not approved is paybox_timeout, and --complete-signature is never run", async () => {
    const s = script({ sign: exit(agentResponse("pending_approval")), request: [exit(agentResponse("pending_approval"))] });
    const { client: cli, time } = client(s);
    assert.deepEqual(await cli.sign(request({ timeoutMs: 7_000 }), signal), { ok: false, code: "paybox_timeout" });
    assert.ok(!s.kinds().includes("complete"));
    assert.deepEqual(time.sleeps, [2_000, 2_000, 2_000, 1_000], "the last pause is cut to what is left");
  });

  it("stillAllowed false (the kill switch, a disarm, a rejected item) stops before the next read and before the key signs", async () => {
    let allowed = true;
    const s = script({ sign: exit(agentResponse("pending_approval")), request: [exit(agentResponse("pending_approval")), exit(agentResponse("pending_signature"))], complete: exit("") });
    const { client: cli } = client(s);
    const pending = cli.sign(
      request({
        stillAllowed: () => {
          if (s.kinds().filter((kind) => kind === "request").length >= 2) allowed = false;
          return allowed;
        },
      }),
      signal,
    );
    assert.deepEqual(await pending, { ok: false, code: "aborted" });
    assert.deepEqual(s.kinds(), ["sign", "request", "request"]);
  });

  it("an abort during the pause between reads is aborted", async () => {
    const controller = new AbortController();
    const s = script({ sign: exit(agentResponse("pending_approval")), request: [exit(agentResponse("pending_approval"))] });
    const cli = createPayboxCliClient({
      configDir: CONFIG_DIR,
      baseEnv: BASE_ENV,
      run: s.run,
      sleep: async () => {
        controller.abort();
        return false;
      },
    });
    assert.deepEqual(await cli.sign(request(), controller.signal), { ok: false, code: "aborted" });
    assert.deepEqual(s.kinds(), ["sign"]);
  });

  it("the default pause really waits and stops at once on abort", async () => {
    const controller = new AbortController();
    const s = script({ sign: exit(agentResponse("pending_approval")), request: [exit(agentResponse("pending_approval"))] });
    const cli = createPayboxCliClient({ configDir: CONFIG_DIR, baseEnv: BASE_ENV, run: s.run, pollIntervalMs: 60_000 });
    const started = Date.now();
    setTimeout(() => controller.abort(), 50);
    assert.deepEqual(await cli.sign(request({ timeoutMs: 120_000 }), controller.signal), { ok: false, code: "aborted" });
    assert.ok(Date.now() - started < 5_000);
  });

  it("a request id that changes between steps is paybox_output_invalid", async () => {
    const other = exit(agentResponse("pending_signature", { requestId: OTHER_REQUEST_ID }));
    const whileWaiting = script({ sign: exit(agentResponse("pending_approval")), request: [other] });
    assert.deepEqual(await client(whileWaiting).client.sign(request(), signal), { ok: false, code: "paybox_output_invalid" });
    assert.deepEqual(whileWaiting.kinds(), ["sign", "request"], "the other request is never completed");
    const atCompletion = script({ sign: exit(agentResponse("pending_signature")), complete: other });
    assert.deepEqual(await client(atCompletion).client.sign(request(), signal), { ok: false, code: "paybox_output_invalid" });
  });

  it("a request still unsigned after --complete-signature is paybox_failed (it is not tried again)", async () => {
    for (const status of ["pending_signature", "pending_approval"] as const) {
      const s = script({ sign: exit(agentResponse("pending_signature")), complete: exit(agentResponse(status)) });
      assert.deepEqual(await client(s).client.sign(request(), signal), { ok: false, code: "paybox_failed" }, status);
      assert.deepEqual(s.kinds(), ["sign", "complete"]);
    }
  });

  it("a state a wallet sign does not use, or one 2.2.0 does not have, is paybox_output_invalid", async () => {
    for (const status of ["pending_funding", "pending_settlement", "pending_confirmation"] as const) {
      assert.deepEqual(await client(script({ sign: exit(agentResponse(status)) })).client.sign(request(), signal), { ok: false, code: "paybox_output_invalid" }, status);
    }
    for (const word of ["expired", "rejected", "cancelled", "SUCCESS", ""]) {
      const stdout = JSON.stringify({ request_id: REQUEST_ID, status: word, output: null, approval_id: null, error: null });
      assert.deepEqual(await client(script({ sign: exit(stdout) })).client.sign(request(), signal), { ok: false, code: "paybox_output_invalid" }, word);
    }
  });

  it("a non-zero exit never yields a signature or a next step, even with a well-formed answer", async () => {
    const sig = await signWith(OWNER_KEY_ACCOUNT, DIGEST);
    for (const stdout of [agentResponse("success", { output: signatureOutput(rawArtifact(sig)) }), agentResponse("pending_approval"), agentResponse("pending_signature")]) {
      const s = script({ sign: exit(stdout, 1) });
      assert.deepEqual(await client(s).client.sign(request(), signal), { ok: false, code: "paybox_failed" });
      assert.deepEqual(s.kinds(), ["sign"]);
    }
  });

  it("truncated output is paybox_output_invalid; a timeout, an abort and a failed spawn keep their codes", async () => {
    assert.deepEqual(await client(script({ sign: exit("x", 0, true) })).client.sign(request(), signal), { ok: false, code: "paybox_output_invalid" });
    for (const [run, code] of [[{ kind: "timeout" }, "paybox_timeout"], [{ kind: "aborted" }, "aborted"], [{ kind: "spawn_failed", missing: false }, "paybox_failed"]] as const) {
      const cli = createPayboxCliClient({ configDir: CONFIG_DIR, baseEnv: BASE_ENV, run: async () => run });
      assert.deepEqual(await cli.sign(request({ timeoutMs: 1000 }), signal), { ok: false, code });
    }
  });

  it("the child's stderr and stdout text never reach the result", async () => {
    const cli = createPayboxCliClient({ configDir: CONFIG_DIR, baseEnv: BASE_ENV, bin: NODE, binArgs: [FAKE, "fail", cliError("pbxk1.SECRET-IN-STDOUT")] });
    const result = await cli.sign(request({ timeoutMs: 10_000 }), signal);
    assert.deepEqual(result, { ok: false, code: "paybox_failed" });
    assert.ok(!JSON.stringify(result).includes("SECRET"));
  });
});

describe("what a finished request may carry (exactly the 2.2.0 artifact for the op; anything else is refused)", () => {
  async function finishedWith(value: unknown, intent: PayboxSignIntent = INTENT, output?: unknown) {
    const s = script({ sign: exit(agentResponse("success", { output: output ?? signatureOutput(value) })) });
    return client(s).client.sign(request({ intent }), signal);
  }
  const TYPED: PayboxSignIntent = { op: "typedData", typedData: { types: { T: [{ name: "a", type: "string" }] }, primaryType: "T", domain: { name: "d" }, message: { a: "b" } } };

  it("raw: only { scheme: ecdsa_secp256k1, signature: { r, s, recovery_id 0 or 1 } }, r and s as 64 hex digits without 0x", async () => {
    const sig = await signWith(OWNER_KEY_ACCOUNT, DIGEST);
    const good = rawArtifact(sig);
    assert.equal((await finishedWith(good)).ok, true);
    const bad: unknown[] = [
      hexArtifact(sig), // a raw result normalised to 65-byte hex is not what 2.2.0 posts (dt1_output_shape)
      { ...good, scheme: "ed25519" },
      { signature: good.signature },
      { ...good, signature: { ...good.signature, r: `0x${good.signature.r}` } },
      { ...good, signature: { ...good.signature, s: good.signature.s.slice(2) } },
      { ...good, signature: { ...good.signature, recovery_id: 27 } },
      { ...good, signature: { ...good.signature, recovery_id: "0" } },
      { ...good, signature: { r: good.signature.r, s: good.signature.s } },
      { ...good, signature: `${good.signature.r}${good.signature.s}` },
      null,
      "0x",
    ];
    for (const value of bad) assert.deepEqual(await finishedWith(value), { ok: false, code: "paybox_output_invalid" }, JSON.stringify(value));
  });

  it("typedData and message: only { signature: 0x + 130 hex digits } with v 27 or 28", async () => {
    const sig = await signWith(OWNER_KEY_ACCOUNT, hashTypedData({ types: { T: [{ name: "a", type: "string" }] }, primaryType: "T", domain: { name: "d" }, message: { a: "b" } }));
    assert.deepEqual(await finishedWith(hexArtifact(sig), TYPED), { ok: true, signature: sig, requestRef: REQUEST_ID });
    const parity = `${sig.slice(0, 130)}${(Number.parseInt(sig.slice(130), 16) - 27).toString(16).padStart(2, "0")}`;
    const bad: unknown[] = [rawArtifact(sig), hexArtifact(parity), hexArtifact(sig.slice(2)), hexArtifact(`${sig}00`), hexArtifact("0x1234"), { signature: 42 }, { serializedTransaction: sig }, {}];
    for (const value of bad) assert.deepEqual(await finishedWith(value, TYPED), { ok: false, code: "paybox_output_invalid" }, JSON.stringify(value));
  });

  it("the output must be a signature output", async () => {
    const sig = await signWith(OWNER_KEY_ACCOUNT, DIGEST);
    for (const output of [{ ...signatureOutput(rawArtifact(sig)), output_type: "tx_hash" }, { ...signatureOutput(rawArtifact(sig)), value: null }, null, "0x"]) {
      const stdout = JSON.stringify({ request_id: REQUEST_ID, status: "success", output, approval_id: null, error: null });
      assert.deepEqual(await client(script({ sign: exit(stdout) })).client.sign(request(), signal), { ok: false, code: "paybox_output_invalid" }, JSON.stringify(output));
    }
  });

  it("parseSignOutput refuses what is not an AgentResponse, and reads {\"error\"} as the CLI's own failure", () => {
    for (const text of ["", "   ", "not json", "[]", "{}", "null", '"hello"', `0x${"ab".repeat(65)}`, JSON.stringify({ signature: `0x${"ab".repeat(65)}` })]) {
      assert.equal(parseSignOutput(text, "raw"), undefined, JSON.stringify(text));
    }
    assert.equal(parseSignOutput(agentResponse("pending_approval", { requestId: "req_abcdef12" }), "raw"), undefined, "a request id is a UUID");
    assert.deepEqual(parseSignOutput(cliError("anything"), "raw"), { status: "cli_error" });
    assert.deepEqual(parseSignOutput(agentResponse("denied"), "raw"), { status: "denied", requestId: REQUEST_ID });
    assert.deepEqual(parseSignOutput(agentResponse("pending_approval"), "raw"), { status: "pending_approval", requestId: REQUEST_ID });
  });

  it("end to end through a real process: sign, read, complete, and the printed signature is read", async () => {
    const sig = await signWith(OWNER_KEY_ACCOUNT, DIGEST);
    const answers = { sign: agentResponse("pending_approval"), request: agentResponse("pending_signature"), complete: agentResponse("success", { output: signatureOutput(rawArtifact(sig)) }) };
    const cli = createPayboxCliClient({ configDir: CONFIG_DIR, baseEnv: BASE_ENV, bin: NODE, binArgs: [FAKE, "flow", JSON.stringify(answers)], pollIntervalMs: 5 });
    const result = await cli.sign(request({ timeoutMs: 20_000 }), signal);
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepEqual(result.signature, { r: `0x${sig.slice(2, 66)}`, s: `0x${sig.slice(66, 130)}`, recovery_id: Number.parseInt(sig.slice(130), 16) - 27 });
    assert.equal(result.requestRef, REQUEST_ID);
  });
});

// ---- the credential listing ---------------------------------------------------------------------------------------------------

describe("how the credential listing is read (`paybox --json credentials`, the 2.2.0 ClientCredentialList)", () => {
  const DISABLED = "1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5";
  const NO_ADDRESS = "2d3e4f5a-6b7c-4d8e-9fa0-b1c2d3e4f5a6";
  const CARD = "3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7";
  const UNGRANTED = "4f5a6b7c-8d9e-4fa0-b1c2-d3e4f5a6b7c8";
  const AUTONOMOUS = "5a6b7c8d-9eaf-4b01-c2d3-e4f5a6b7c8d9";

  const entry = (id: string, type: "card" | "wallet" | "secret", mode: string, metadata: Record<string, unknown>, disabledAt: string | null = null) => ({
    credential: { id, user_id: USER_ID, name: `test ${type}`, credential_type: type, provider: type === "wallet" ? "moonx" : "paybox", metadata, created_at: "2026-10-01T09:00:00Z", disabled_at: disabledAt },
    grant: { credential_id: id, approval_mode: mode },
  });
  const LISTING = {
    credentials: [
      entry(CREDENTIAL, "wallet", "always_approve", { address: OWNER, provider_wallet_id: "b3f1c2d4", chains: ["evm"] }),
      entry(DISABLED, "wallet", "always_approve", { address: OWNER, provider_wallet_id: "c4d5e6f7", chains: ["evm"] }, "2026-10-10T10:00:00Z"),
      entry(NO_ADDRESS, "wallet", "always_approve", { address: null, provider_wallet_id: "d5e6f7a8", chains: ["evm"] }),
      entry(CARD, "card", "always_approve", { brand: "VISA", last4: "4242" }),
      entry(AUTONOMOUS, "wallet", "autonomous", { address: OWNER, provider_wallet_id: "e6f7a8b9", chains: ["evm"] }),
    ],
    ungranted: [{ credential_id: UNGRANTED, name: "other wallet", kind: "wallet", metadata: { address: OWNER, chains: ["evm"] } }],
    agent_signer_recorded: true,
  };
  const listing = JSON.stringify(LISTING, null, 2);

  async function read(stdout: string, id = CREDENTIAL, code: number | null = 0) {
    const s = script({ credentials: exit(stdout, code) });
    const answer = await client(s).client.credential(id, signal);
    return { answer, commands: s.commands };
  }

  it("asks with --json first, `credentials` and nothing else (no `list`)", async () => {
    const { commands } = await read(listing);
    assert.deepEqual(commands[0]?.args, ["--json", "credentials"]);
    assert.deepEqual([...CREDENTIAL_LIST_ARGV], ["--json", "credentials"]);
    assert.ok(Object.isFrozen(CREDENTIAL_LIST_ARGV));
  });

  it("a granted wallet: its grant's approval_mode and its metadata.address (ids compared without case)", async () => {
    assert.deepEqual((await read(listing)).answer, { ok: true, approvalMode: "always_approve", address: OWNER });
    assert.deepEqual((await read(listing, CREDENTIAL.toUpperCase())).answer, { ok: true, approvalMode: "always_approve", address: OWNER });
    assert.deepEqual((await read(listing, AUTONOMOUS)).answer, { ok: true, approvalMode: "autonomous", address: OWNER }, "the mode is reported; the path refuses it");
  });

  it("a disabled credential is credential_disabled", async () => {
    assert.deepEqual((await read(listing, DISABLED)).answer, { ok: false, code: "credential_disabled" });
  });

  it("an ungranted credential, or one not listed at all, is credential_not_granted", async () => {
    assert.deepEqual((await read(listing, UNGRANTED)).answer, { ok: false, code: "credential_not_granted" });
    assert.deepEqual((await read(listing, OTHER_REQUEST_ID)).answer, { ok: false, code: "credential_not_granted" });
    assert.deepEqual((await read(JSON.stringify({ ...LISTING, credentials: [] }))).answer, { ok: false, code: "credential_not_granted" });
  });

  it("a wallet whose address is null reports null (the path refuses it)", async () => {
    assert.deepEqual((await read(listing, NO_ADDRESS)).answer, { ok: true, approvalMode: "always_approve", address: null });
  });

  it("a credential that is not a wallet is credential_not_wallet", async () => {
    assert.deepEqual((await read(listing, CARD)).answer, { ok: false, code: "credential_not_wallet" });
  });

  it("a malformed listing, a duplicated id or a grant for another id is credential_unreadable", async () => {
    const own = LISTING.credentials[0] as ReturnType<typeof entry>;
    const variants: unknown[] = [
      { ...LISTING, credentials: [own, own] },
      { ...LISTING, credentials: [{ ...own, grant: { ...own.grant, credential_id: DISABLED } }] },
      { ...LISTING, credentials: [{ ...own, credential: { ...own.credential, metadata: null } }] },
      { ...LISTING, credentials: [{ ...own, credential: { ...own.credential, disabled_at: false } }] },
      { ...LISTING, credentials: [{ credential_id: CREDENTIAL, approval_mode: "always_approve", address: OWNER }] },
      { ...LISTING, credentials: [own, 5] },
      { credentials: "none" },
      [own],
    ];
    for (const variant of variants) assert.deepEqual((await read(JSON.stringify(variant))).answer, { ok: false, code: "credential_unreadable" }, JSON.stringify(variant).slice(0, 80));
    for (const text of ["", "oops", "{}", "[1,2]", "null"]) assert.deepEqual((await read(text)).answer, { ok: false, code: "credential_unreadable" }, text);
  });

  it("a non-zero exit (the CLI's error JSON, or a usage error) is paybox_failed", async () => {
    assert.deepEqual((await read(cliError("paybox GET /agent/grants failed (401): unauthorized"), CREDENTIAL, 1)).answer, { ok: false, code: "paybox_failed" });
    assert.deepEqual((await read("", CREDENTIAL, 1)).answer, { ok: false, code: "paybox_failed" });
    assert.deepEqual((await read(listing, CREDENTIAL, 1)).answer, { ok: false, code: "paybox_failed" });
  });

  it("parseCredentials on its own", () => {
    assert.deepEqual(parseCredentials(listing, CREDENTIAL), { ok: true, approvalMode: "always_approve", address: OWNER });
    assert.deepEqual(parseCredentials("[]", CREDENTIAL), { ok: false, code: "credential_unreadable" });
  });
});
