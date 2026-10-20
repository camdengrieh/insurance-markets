import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  CREDENTIAL_LIST_ARGV,
  MAX_CLI_STDOUT_BYTES,
  childEnvFor,
  createPayboxCliClient,
  defaultCliRunner,
  parseCredentials,
  parseSignOutput,
  type CliCommand,
  type CliRun,
  type CliRunner,
} from "../../paybox-signer.js";
import type { PayboxSignIntent } from "../../../src/relay/contract.js";
import { CONFIG_DIR, CREDENTIAL, OWNER, OWNER_KEY_ACCOUNT, signWith } from "./fixtures.js";

// The CLI client: how the `paybox` command is started (argument array, no shell, allowlisted environment), and how
// its answers are read. The binary used here is a stand-in script that is not PayBox and talks to nothing; the output
// shapes are GUESSES until DT3 records the real ones, so every unknown shape must fail closed.

const FAKE = fileURLToPath(new URL("./fake-paybox.mjs", import.meta.url));
const NODE = process.execPath;
const signal = new AbortController().signal;
const DIGEST = `0x${"66".repeat(32)}`;
const INTENT: PayboxSignIntent = { op: "raw", rawSigningPayloadHex: DIGEST };
const BASE_ENV = Object.freeze({ PATH: process.env["PATH"] ?? "", LANG: "C", HOME: "/home/should-not-pass", NODE_OPTIONS: "--require /nonexistent.js", XO_MASTER_KEY: "sk-test-master-key-should-not-pass", RELAY_KEY: "relay-key-should-not-pass", ANYTHING_ELSE: "no" });

function scripted(handle: (command: CliCommand) => CliRun): { run: CliRunner; commands: CliCommand[] } {
  const commands: CliCommand[] = [];
  return {
    commands,
    run: async (command) => {
      commands.push(command);
      return handle(command);
    },
  };
}
const exit = (stdout: string, code: number | null = 0, truncated = false): CliRun => ({ kind: "exit", code, stdout, truncated });

describe("how the command is started", () => {
  it("passes the intent as one argument of an argument array", async () => {
    const hostile: PayboxSignIntent = {
      op: "typedData",
      typedData: { types: { T: [{ name: "a", type: "string" }] }, primaryType: "T", domain: { name: `x"; rm -rf / #$(id)\`y '` }, message: { a: "line1\nline2 ; && | > < $HOME" } },
    };
    const { run, commands } = scripted(() => exit("{}"));
    const client = createPayboxCliClient({ configDir: CONFIG_DIR, baseEnv: BASE_ENV, run });
    await client.sign({ credentialId: CREDENTIAL, intent: hostile, timeoutMs: 1000 }, signal);
    assert.equal(commands.length, 1);
    assert.equal(commands[0]?.bin, "paybox");
    assert.deepEqual(commands[0]?.args, ["sign", "--credential", CREDENTIAL, "--intent", JSON.stringify(hostile), "--wait"]);
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

  it("childEnvFor drops values with a NUL and never copies a name outside its list", () => {
    const env = childEnvFor({ PATH: "/a\0b", LANG: "C", SECRET_THING: "x", PAYBOX_CONFIG_DIR: "/somewhere/else" }, CONFIG_DIR);
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
    const client = createPayboxCliClient({ configDir: CONFIG_DIR, baseEnv: BASE_ENV, bin: "cockpit-test-no-such-binary-anywhere" });
    assert.deepEqual(await client.sign({ credentialId: CREDENTIAL, intent: INTENT, timeoutMs: 1000 }, signal), { ok: false, code: "paybox_missing" });
    assert.deepEqual(await client.credential(CREDENTIAL, signal), { ok: false, code: "paybox_missing" });
  });
});

describe("how the answer is read (shapes are guesses until DT3; anything else fails closed)", () => {
  async function signedBy(stdout: string, code: number | null = 0, truncated = false) {
    const { run } = scripted(() => exit(stdout, code, truncated));
    return createPayboxCliClient({ configDir: CONFIG_DIR, baseEnv: BASE_ENV, run }).sign({ credentialId: CREDENTIAL, intent: INTENT, timeoutMs: 1000 }, signal);
  }

  it("takes a bare 0x signature, or JSON with it at the top level or under result, or r, s and v", async () => {
    const sig = await signWith(OWNER_KEY_ACCOUNT, DIGEST as `0x${string}`);
    const r = `0x${sig.slice(2, 66)}`;
    const s = `0x${sig.slice(66, 130)}`;
    for (const text of [sig, `${sig}\n`, JSON.stringify(sig), JSON.stringify({ signature: sig }), JSON.stringify({ result: { signature: sig } }), JSON.stringify({ r, s, v: 27 })]) {
      const answer = await signedBy(text);
      assert.equal(answer.ok, true, text.slice(0, 40));
    }
    const withRef = await signedBy(JSON.stringify({ request_id: "req_abcdef12", signature: sig }));
    assert.ok(withRef.ok && withRef.requestRef === "req_abcdef12");
  });

  it("anything it does not recognise is paybox_output_invalid", async () => {
    for (const text of ["", "   ", "not json", "[]", "{}", '{"signature":"0x12"}', '{"signature":42}', '{"status":"pending_signature"}', "0xdeadbeef", "null", '"hello"']) {
      assert.deepEqual(await signedBy(text), { ok: false, code: "paybox_output_invalid" }, JSON.stringify(text));
    }
  });

  it("a decline is recognised only when the output says so; a non-zero exit is otherwise just a failure", async () => {
    for (const word of ["rejected", "declined", "denied", "cancelled", "expired", "Rejected"]) {
      assert.deepEqual(await signedBy(JSON.stringify({ status: word }), 1), { ok: false, code: "paybox_declined" }, word);
      assert.deepEqual(await signedBy(JSON.stringify({ status: word }), 0), { ok: false, code: "paybox_declined" }, word);
    }
    assert.deepEqual(await signedBy("something went wrong", 1), { ok: false, code: "paybox_failed" });
    assert.deepEqual(await signedBy("", 2), { ok: false, code: "paybox_failed" });
    assert.deepEqual(await signedBy("", null), { ok: false, code: "paybox_failed" });
  });

  it("a non-zero exit never yields a signature, even if the output holds one", async () => {
    const sig = await signWith(OWNER_KEY_ACCOUNT, DIGEST as `0x${string}`);
    assert.deepEqual(await signedBy(sig, 1), { ok: false, code: "paybox_failed" });
  });

  it("truncated output is paybox_output_invalid; a timeout and an abort keep their codes", async () => {
    assert.deepEqual(await signedBy("x", 0, true), { ok: false, code: "paybox_output_invalid" });
    for (const [run, code] of [[{ kind: "timeout" }, "paybox_timeout"], [{ kind: "aborted" }, "aborted"], [{ kind: "spawn_failed", missing: false }, "paybox_failed"]] as const) {
      const client = createPayboxCliClient({ configDir: CONFIG_DIR, baseEnv: BASE_ENV, run: async () => run });
      assert.deepEqual(await client.sign({ credentialId: CREDENTIAL, intent: INTENT, timeoutMs: 1000 }, signal), { ok: false, code });
    }
  });

  it("the child's stderr and stdout text never reach the result", async () => {
    const client = createPayboxCliClient({ configDir: CONFIG_DIR, baseEnv: BASE_ENV, bin: NODE, binArgs: [FAKE, "fail", "pbxk1.SECRET-IN-STDOUT"] });
    const result = await client.sign({ credentialId: CREDENTIAL, intent: INTENT, timeoutMs: 10_000 }, signal);
    assert.deepEqual(result, { ok: false, code: "paybox_failed" });
    assert.ok(!JSON.stringify(result).includes("SECRET"));
  });

  it("end to end through a real process: a printed signature is read", async () => {
    const sig = await signWith(OWNER_KEY_ACCOUNT, DIGEST as `0x${string}`);
    const client = createPayboxCliClient({ configDir: CONFIG_DIR, baseEnv: BASE_ENV, bin: NODE, binArgs: [FAKE, "print", JSON.stringify({ signature: sig })] });
    const result = await client.sign({ credentialId: CREDENTIAL, intent: INTENT, timeoutMs: 10_000 }, signal);
    assert.ok(result.ok && result.signature === sig);
  });

  it("parseSignOutput on its own", () => {
    assert.equal(parseSignOutput(""), undefined);
    assert.deepEqual(parseSignOutput(`0x${"ab".repeat(65)}`), { signature: `0x${"ab".repeat(65)}` });
  });
});

describe("how the credential listing is read (the command and fields are guesses until DT3)", () => {
  const listing = (mode: string | null, address: string | null = OWNER) => ({ credential_id: CREDENTIAL, kind: "evm", approval_mode: mode, address });

  async function read(stdout: string, code: number | null = 0) {
    const { run, commands } = scripted(() => exit(stdout, code));
    const answer = await createPayboxCliClient({ configDir: CONFIG_DIR, baseEnv: BASE_ENV, run }).credential(CREDENTIAL, signal);
    return { answer, commands };
  }

  it("asks with the default argv and finds the entry by id in a list or in an object holding one", async () => {
    const { answer, commands } = await read(JSON.stringify([listing("autonomous", "0xabc"), { credential_id: "other", approval_mode: "iframe", address: null }]));
    assert.deepEqual(commands[0]?.args, [...CREDENTIAL_LIST_ARGV]);
    assert.deepEqual(answer, { ok: true, approvalMode: "autonomous", address: "0xabc" });
    for (const key of ["credentials", "items", "data"]) {
      const nested = await read(JSON.stringify({ [key]: [{ id: CREDENTIAL, approval_mode: "always_approve", address: OWNER }] }));
      assert.deepEqual(nested.answer, { ok: true, approvalMode: "always_approve", address: OWNER }, key);
    }
  });

  it("an entry with no readable mode or address reports null, which the path refuses", async () => {
    const { answer } = await read(JSON.stringify([{ credential_id: CREDENTIAL }]));
    assert.deepEqual(answer, { ok: true, approvalMode: null, address: null });
  });

  it("no matching entry, bad JSON and a non-zero exit all fail closed", async () => {
    assert.deepEqual((await read(JSON.stringify([{ credential_id: "someone-else", approval_mode: "always_approve", address: OWNER }]))).answer, { ok: false, code: "credential_unreadable" });
    for (const text of ["", "oops", "{}", "[1,2]", "null"]) assert.deepEqual((await read(text)).answer, { ok: false, code: "credential_unreadable" }, text);
    assert.deepEqual((await read(JSON.stringify([listing("always_approve")]), 1)).answer, { ok: false, code: "paybox_failed" });
  });

  it("parseCredentials on its own", () => {
    assert.equal(parseCredentials("[]", CREDENTIAL), undefined);
  });

  it("the guessed argv is a fixed array, not something built from input", () => {
    assert.deepEqual([...CREDENTIAL_LIST_ARGV], ["credentials", "list", "--json"]);
    assert.ok(Object.isFrozen(CREDENTIAL_LIST_ARGV));
  });
});
