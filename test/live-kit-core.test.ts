import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RELAY_KEY_HEADER, RELAY_USER_AGENT } from "../src/relay/contract.js";
import { COMMON_FLAGS, parseArgs } from "../scripts/live/lib/args.js";
import { homedir } from "node:os";

import { validateMetadata } from "../src/xo/creation/metadata.js";
import { checkRefusals, scrubPaths } from "../scripts/live/lib/harness.js";
import { sampleMetadataFor } from "../scripts/live/lib/sample-metadata.js";
import { Net, NetBlocked } from "../scripts/live/lib/net.js";
import { ALL_SPECS } from "../scripts/live/lib/registry.js";
import { Printer, SecretRegistry, describeBody, describeHeaders, describeUrl, redactValue } from "../scripts/live/lib/redact.js";
import { parsePayboxSignature } from "../scripts/live/lib/signer.js";
import type { Options, TestSpec } from "../scripts/live/lib/types.js";
import { scriptedIo } from "./live-kit-helpers.js";

// The pieces every live-kit script shares, tested without any network: the command line, the refusals, what
// may be printed, and the transport that stands between a run and the world.

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const spec = (id: string): TestSpec => {
  const found = ALL_SPECS.find((entry) => entry.id === id);
  assert.ok(found !== undefined, `no spec ${id}`);
  return found;
};

function parsed(argv: string[], extra = spec("T1").flags): Options {
  const result = parseArgs(argv, extra);
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result.opts;
}

describe("the command line", () => {
  it("defaults to the mock target, no confirm, no budget", () => {
    const opts = parsed([]);
    assert.equal(opts.target, "mock");
    assert.equal(opts.confirm, false);
    assert.equal(opts.budgetUsd, undefined);
    assert.equal(opts.dryRun, false);
    assert.equal(opts.mockProfile, "optimistic");
  });

  it("reads --name value and --name=value", () => {
    const opts = parsed(["--target=live", "--budget-usd", "0.54", "--owner", OWNER.toLowerCase(), "--confirm"]);
    assert.equal(opts.target, "live");
    assert.equal(opts.budgetUsd, "0.54");
    assert.equal(opts.owner, OWNER, "an all lower-case address is accepted and checksummed");
    assert.equal(opts.confirm, true);
  });

  const bad: Array<readonly [string, string[]]> = [
    ["an unknown option", ["--bogus"]],
    ["a bare word", ["confirm"]],
    ["a repeated option", ["--budget-usd", "1", "--budget-usd", "2"]],
    ["a missing value", ["--budget-usd"]],
    ["a value that looks like an option", ["--budget-usd", "--confirm"]],
    ["a malformed amount", ["--budget-usd", "1e3"]],
    ["a negative amount", ["--budget-usd", "-1"]],
    ["too many decimals", ["--budget-usd", "1.1234567"]],
    ["a wrongly checksummed owner", ["--owner", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92267"]],
    ["a short owner", ["--owner", "0x1234"]],
    ["a value on a switch", ["--confirm=yes"]],
    ["a target that does not exist", ["--target", "staging"]],
    ["a mock option on the live target", ["--target=live", "--mock-profile", "pessimistic"]],
    ["a malformed switch value", ["--mock-set", "bundler.foreign_account"]],
    ["an owner index out of range", ["--mock-owner-index", "10"]],
  ];
  for (const [name, argv] of bad) {
    it(`refuses ${name}`, () => {
      const result = parseArgs(argv, spec("T1").flags);
      assert.equal(result.ok, false);
    });
  }

  it("keeps a test's own flags apart from the common ones and refuses a clash", () => {
    const result = parseArgs(["--amount-usd", "2"], spec("T3a").flags);
    assert.ok(result.ok);
    assert.equal(result.opts.extra["amount-usd"], "2");
    assert.throws(() => parseArgs([], [{ name: "confirm", kind: "bool", help: "x" }]), /defined twice/);
    assert.ok(COMMON_FLAGS.length > 5);
  });

  it("accepts a repeated list option", () => {
    const opts = parsed(["--mock-set", "rpc.access=open", "--mock-set", "bundler.foreign_account=accept"]);
    assert.deepEqual(opts.mockSet, ["rpc.access=open", "bundler.foreign_account=accept"]);
  });
});

describe("the refusals: nothing runs unless every gate is open", () => {
  const full = (id: string, extra: string[] = []): { s: TestSpec; opts: Options } => {
    const s = spec(id);
    return { s, opts: parsed(["--confirm", "--budget-usd", s.worstCaseUsd, ...extra], s.flags) };
  };

  it("a fully specified mock run has no problem", () => {
    const { s, opts } = full("T1");
    assert.deepEqual(checkRefusals(s, opts, {}), []);
  });

  it("refuses without --confirm", () => {
    const s = spec("T1");
    const problems = checkRefusals(s, parsed(["--budget-usd", "0"], s.flags), {});
    assert.ok(problems.some((problem) => problem.includes("--confirm")));
  });

  it("refuses without an explicit budget, even for a $0 test", () => {
    const s = spec("T1");
    const problems = checkRefusals(s, parsed(["--confirm"], s.flags), {});
    assert.ok(problems.some((problem) => problem.includes("--budget-usd is required")));
  });

  for (const s of ALL_SPECS) {
    it(`${s.id}: a budget above the table's worst case ($${s.worstCaseUsd}) is refused`, () => {
      const above = (Number(s.worstCaseUsd) + 0.01).toFixed(2);
      const opts = parsed(["--confirm", "--budget-usd", above, ...(s.id === "T3a" || s.id === "T4" ? ["--amount-usd", "1"] : [])], s.flags);
      assert.ok(checkRefusals(s, opts, {}).some((problem) => problem.includes("above the worst case")), s.id);
    });
  }

  it("refuses a budget below what the plan puts at risk", () => {
    const s = spec("T3a");
    const problems = checkRefusals(s, parsed(["--confirm", "--budget-usd", "1", "--amount-usd", "2"], s.flags), {});
    assert.ok(problems.some((problem) => problem.includes("would put $2 at risk")), problems.join(" | "));
  });

  it("refuses an amount above the test's ceiling", () => {
    const s = spec("T3a");
    assert.ok(checkRefusals(s, parsed(["--confirm", "--budget-usd", "3", "--amount-usd", "3.5"], s.flags), {}).some((problem) => problem.includes("ceiling")));
    assert.ok(checkRefusals(s, parsed(["--confirm", "--budget-usd", "3"], s.flags), {}).some((problem) => problem.includes("--amount-usd is required")));
  });

  it("refuses everything while the kill switch is on, whichever variable says so", () => {
    const { s, opts } = full("T5");
    for (const env of [{ KILL: "1" }, { XO_KILL_SWITCH: "on" }, { KILL: "banana" }]) {
      assert.ok(checkRefusals(s, opts, env).some((problem) => problem.includes("kill switch")), JSON.stringify(env));
    }
    assert.deepEqual(checkRefusals(s, opts, { KILL: "0" }), []);
  });

  describe("the live target needs more", () => {
    const live = (s: TestSpec, extra: string[] = []): Options => parsed(["--target=live", "--confirm", "--budget-usd", s.worstCaseUsd, ...extra], s.flags);
    const FULL_LIVE = ["--owner", OWNER, "--data-dir", "data", "--credential-id", "cred-1"];

    it("an acknowledgement for THIS test, in the environment", () => {
      const s = spec("T1");
      assert.ok(checkRefusals(s, live(s, FULL_LIVE), {}).some((problem) => problem.includes("XO_LIVE_ACK=T1")));
      assert.ok(checkRefusals(s, live(s, FULL_LIVE), { XO_LIVE_ACK: "T2" }).some((problem) => problem.includes("XO_LIVE_ACK=T1")), "another test's acknowledgement does not count");
      assert.ok(checkRefusals(s, live(s, FULL_LIVE), { XO_LIVE_ACK: "true" }).some((problem) => problem.includes("XO_LIVE_ACK=T1")));
      assert.deepEqual(checkRefusals(s, live(s, FULL_LIVE), { XO_LIVE_ACK: "t0, T1 ,T2" }), []);
    });

    it("the owner, the data directory and the credential id", () => {
      const s = spec("T1");
      const problems = checkRefusals(s, live(s), { XO_LIVE_ACK: "T1" });
      assert.equal(problems.length, 3, problems.join(" | "));
    });

    it("the ack does not open a mock-only gap: the kill switch still wins", () => {
      const s = spec("T1");
      assert.ok(checkRefusals(s, live(s, FULL_LIVE), { XO_LIVE_ACK: "T1", KILL: "1" }).length > 0);
    });
  });
});

describe("what may be printed", () => {
  it("masks every key that names a secret and leaves hashes alone", () => {
    const body = JSON.stringify({
      apiKey: "key-123",
      secret: "s3cr3t-value",
      passphrase: "pp",
      signature: `0x${"ab".repeat(65)}`,
      order: { signature: `0x01${"cd".repeat(85)}`, signatureType: 3, tokenId: "123" },
      digest: `0x${"11".repeat(32)}`,
      token_id: "999",
      nested: { "x-relay-key": "k", ok: "fine" },
    });
    const shown = describeBody(body);
    for (const secret of ["key-123", "s3cr3t-value", "ab".repeat(65), "cd".repeat(85)]) assert.ok(!shown.includes(secret), `leaked ${secret.slice(0, 8)}`);
    assert.ok(shown.includes("11".repeat(32)), "a 32-byte hash is printed");
    assert.ok(shown.includes('"signatureType":3'), "signatureType is public");
    assert.ok(shown.includes('"token_id":"999"'), "token_id is not a secret");
  });

  it("masks a signature-shaped hex string wherever it sits", () => {
    for (const bytes of [65, 66, 86]) {
      const value = `0x${"ef".repeat(bytes)}`;
      assert.ok(!JSON.stringify(redactValue({ anything: value, list: [value] })).includes("efef"), `${bytes} bytes`);
    }
    assert.ok(JSON.stringify(redactValue({ calldata: `0x${"ef".repeat(100)}` })).includes("efef"), "calldata is not a signature");
  });

  it("shows header names but only a few values", () => {
    const shown = describeHeaders({ "user-agent": RELAY_USER_AGENT, "content-type": "application/json", "x-relay-key": "KEY", xo_signature: "SIG", xo_passphrase: "PP" });
    assert.ok(shown.includes(RELAY_USER_AGENT));
    for (const hidden of ["KEY", "SIG", "PP"]) assert.ok(!shown.includes(hidden));
    for (const name of ["x-relay-key", "xo_signature", "xo_passphrase"]) assert.ok(shown.includes(name));
  });

  it("shows a query in full only for XO hosts and the loopback relay", () => {
    assert.ok(describeUrl(new URL("https://explorer-mainnet.xo.market/api?module=logs&topic0=0xabc")).includes("topic0=0xabc"));
    assert.ok(describeUrl(new URL("http://127.0.0.1:1234/v1/health")).includes("/v1/health"));
    const base = describeUrl(new URL("https://mainnet.base.org/some/path?apikey=SECRETKEY"));
    assert.ok(!base.includes("SECRETKEY") && !base.includes("some/path"), base);
    assert.ok(base.includes("apikey=..."));
  });

  it("scrubs a registered secret in its plain, URL-encoded, JSON-escaped and zero-width forms", () => {
    const registry = new SecretRegistry();
    const secret = 'abc/def+ghi"jkl=mno';
    registry.add(secret);
    const forms = [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1), `abc/def+​ghi"jkl=mno`];
    for (const form of forms) assert.ok(!registry.scrub(`before ${form} after`).includes("def"), form);
    assert.equal(registry.scrub("nothing here"), "nothing here");
    registry.add("short");
    assert.equal(registry.scrub("short"), "short", "a string under 8 characters is not a secret worth masking");
  });

  it("the printer scrubs every line before it reaches the output, and quiet prints nothing", async () => {
    const scripted = scriptedIo();
    const registry = new SecretRegistry();
    const printer = new Printer(scripted.io, registry);
    registry.add("super-secret-value");
    printer.line("x super-secret-value y\nsecond super-secret-value");
    await printer.quietly(async () => {
      printer.line("hidden");
    });
    assert.deepEqual(scripted.out, ["x [redacted] y", "second [redacted]"]);
  });
});

describe("reading what PayBox returned", () => {
  const sig = `0x${"11".repeat(32)}${"22".repeat(32)}1c`;
  const r = `0x${"11".repeat(32)}`;
  const s = `0x${"22".repeat(32)}`;

  it("recognises each shape and names it", () => {
    assert.equal(parsePayboxSignature(sig).shape, "sig65");
    assert.equal(parsePayboxSignature({ signature: sig }).shape, "object_signature");
    assert.equal(parsePayboxSignature({ r, s, recovery_id: 1 }).shape, "rs_recovery_id");
    assert.equal(parsePayboxSignature({ r, s, recoveryId: 0 }).shape, "rs_recovery_id");
    assert.equal(parsePayboxSignature({ r, s, v: 28 }).shape, "rs_v");
    assert.equal(parsePayboxSignature({ output: { r, s, recovery_id: 0 } }).shape, "wrapped_rs_recovery_id");
    assert.equal(parsePayboxSignature(JSON.stringify({ signature: sig })).shape, "object_signature");
    assert.equal(parsePayboxSignature({ r: r.slice(2), s: s.slice(2), v: 27 }).shape, "rs_v", "bare hex r and s are accepted");
  });

  it("never guesses: anything else is unrecognised", () => {
    for (const value of ["", "hello", 5, null, [], { error: "denied" }, { r, s }, { r, s, v: 5 }, `0x${"11".repeat(64)}`, { signature: "0x12" }]) {
      const result = parsePayboxSignature(value);
      assert.equal(result.shape, "unrecognised", JSON.stringify(value));
      assert.equal(result.input, undefined);
    }
  });

  it("reports the recovery byte as it was given", () => {
    assert.equal(parsePayboxSignature(sig).recoveryByte, 0x1c);
    assert.equal(parsePayboxSignature({ r, s, recovery_id: 1 }).recoveryByte, 1);
  });
});

describe("the transport", () => {
  interface Rig {
    readonly net: Net;
    readonly sent: Array<{ url: string; method: string }>;
    readonly lines: string[];
    readonly beforeSend: number[];
  }

  function rig(options: { writes?: Array<{ label: string; max: number; allowDuplicate?: boolean }>; readLimits?: Array<{ name: string; labels: string[]; max: number }>; answer?: (url: string) => Response } = {}): Rig {
    const sent: Rig["sent"] = [];
    const scripted = scriptedIo();
    const printer = new Printer(scripted.io, new SecretRegistry());
    const beforeSend: number[] = [];
    const baseFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      sent.push({ url, method: init?.method ?? "GET" });
      beforeSend.push(scripted.out.length);
      return options.answer?.(url) ?? new Response("{}", { status: 200 });
    }) as typeof fetch;
    const net = new Net({
      baseFetch,
      relayFetch: baseFetch,
      printer,
      nowMs: () => 1,
      allowedHosts: ["orderbooks.xo.market", "mainnet-bundler.xo.market", "rpc-mainnet-2.xo.market", "explorer-mainnet.xo.market", "mainnet.base.org"],
      keylessHosts: ["mainnet-bundler.xo.market", "rpc-mainnet-2.xo.market", "explorer-mainnet.xo.market"],
      writes: options.writes ?? [],
      ...(options.readLimits === undefined ? {} : { readLimits: options.readLimits }),
    });
    net.setRelayOrigin("http://127.0.0.1:9999");
    return { net, sent, lines: scripted.out, beforeSend };
  }

  const headers = { "user-agent": RELAY_USER_AGENT, accept: "application/json" };
  const rpc = (method: string): string => JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] });
  const post = (net: Net, url: string, body: string, extra: Record<string, string> = {}): Promise<Response> => net.fetch(url, { method: "POST", headers: { ...headers, "content-type": "application/json", ...extra }, body });
  const get = (net: Net, url: string, extra: Record<string, string> = {}): Promise<Response> => net.fetch(url, { headers: { ...headers, ...extra } });

  async function blocked(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
    } catch (error) {
      assert.ok(error instanceof NetBlocked, String(error));
      return error.rule;
    }
    assert.fail("the call was not blocked");
  }

  it("prints each call BEFORE it is made, and the answer after", async () => {
    const { net, lines, beforeSend } = rig();
    await get(net, "https://orderbooks.xo.market/time");
    assert.equal(beforeSend.length, 1);
    assert.ok((beforeSend[0] ?? 0) >= 2, "the request lines were printed before the fetch ran");
    assert.ok(lines.some((line) => line.startsWith("-> [1] GET https://orderbooks.xo.market/time")));
    assert.ok(lines.some((line) => line.startsWith("<- [1] 200")));
  });

  it("a blocked call is printed too, and nothing is sent", async () => {
    const { net, sent, lines } = rig();
    assert.equal(await blocked(get(net, "https://example.com/")), "host_not_allowed");
    assert.equal(sent.length, 0);
    assert.ok(lines.some((line) => line.includes("BLOCKED before sending")));
  });

  // A blocked call is itself a stop rule (the run ends), so every refusal below is shown on a fresh rig.
  it("refuses a host that is not on the list, http, and credentials in the URL", async () => {
    const cases: Array<readonly [string, string]> = [
      ["https://evil.example/", "host_not_allowed"],
      ["http://orderbooks.xo.market/time", "scheme"],
      [["https://user:pw", "orderbooks.xo.market/time"].join("@"), "credentials_in_url"],
    ];
    for (const [url, rule] of cases) {
      const { net, sent } = rig();
      assert.equal(await blocked(get(net, url)), rule, url);
      assert.equal(sent.length, 0);
      assert.equal(net.tripped?.rule, rule, "a blocked call ends the run");
    }
  });

  it("refuses a user agent other than the pinned one, and every header that could identify a person", async () => {
    const attempts: Array<readonly [string, (net: Net) => Promise<Response>, string]> = [
      ["wrong agent", (net) => net.fetch("https://orderbooks.xo.market/time", { headers: { "user-agent": "node" } }), "user_agent"],
      ["no agent", (net) => net.fetch("https://orderbooks.xo.market/time", {}), "user_agent"],
      ...["from", "referer", "origin", "cookie", "authorization", "x-forwarded-for"].map((name): readonly [string, (net: Net) => Promise<Response>, string] => [name, (net) => get(net, "https://orderbooks.xo.market/time", { [name]: "x" }), "identifying_header"]),
    ];
    for (const [name, attempt, rule] of attempts) {
      const { net, sent } = rig();
      assert.equal(await blocked(attempt(net)), rule, name);
      assert.equal(sent.length, 0, name);
    }
  });

  it("never lets the relay key leave the machine", async () => {
    const { net, sent } = rig();
    assert.equal(await blocked(get(net, "https://orderbooks.xo.market/time", { [RELAY_KEY_HEADER]: "k" })), "relay_key_leak");
    assert.equal(sent.length, 0);
    // To the relay itself the key is expected.
    await get(net, "http://127.0.0.1:9999/v1/health", { [RELAY_KEY_HEADER]: "k" });
    assert.equal(sent.length, 1);
  });

  it("only the loopback relay is reachable as 'the relay'", async () => {
    const { net } = rig();
    assert.equal(await blocked(get(net, "http://localhost:9999/v1/health")), "scheme");
  });

  it("refuses a write the test did not list, and every signing or sending JSON-RPC method", async () => {
    const attempts: Array<readonly [string, (net: Net) => Promise<Response>, string]> = [
      ["POST /order", (net) => post(net, "https://orderbooks.xo.market/order", "{}"), "write_not_listed"],
      ["DELETE /order", (net) => net.fetch("https://orderbooks.xo.market/order", { method: "DELETE", headers, body: "{}" }), "write_not_listed"],
      ["a JSON-RPC batch", (net) => post(net, "https://mainnet-bundler.xo.market/", "[]"), "forbidden_call"],
      ["eth_sendUserOperation to the node", (net) => post(net, "https://rpc-mainnet-2.xo.market/", rpc("eth_sendUserOperation")), "forbidden_call"],
      ...["eth_sendRawTransaction", "eth_sendTransaction", "eth_sign", "eth_signTypedData_v4", "personal_sign", "debug_traceCall", "anvil_setBalance", "evm_mine"].map((method): readonly [string, (net: Net) => Promise<Response>, string] => [method, (net) => post(net, "https://rpc-mainnet-2.xo.market/", rpc(method)), "forbidden_call"]),
    ];
    for (const [name, attempt, rule] of attempts) {
      const { net, sent } = rig({ writes: [{ label: "bundler eth_sendUserOperation", max: 1 }] });
      assert.equal(await blocked(attempt(net)), rule, name);
      assert.equal(sent.length, 0, name);
    }
  });

  it("allows the listed write up to its limit and then no more", async () => {
    const { net, sent } = rig({ writes: [{ label: "bundler eth_sendUserOperation", max: 2 }] });
    const body = (id: number): string => JSON.stringify({ jsonrpc: "2.0", id, method: "eth_sendUserOperation", params: [{ n: id }] });
    await post(net, "https://mainnet-bundler.xo.market/", body(1));
    await post(net, "https://mainnet-bundler.xo.market/", body(2));
    assert.equal(await blocked(post(net, "https://mainnet-bundler.xo.market/", body(3))), "write_limit");
    assert.equal(sent.length, 2);
    assert.equal(net.writeCount("bundler eth_sendUserOperation"), 2);
  });

  it("never sends the same write body twice: that would be a retry", async () => {
    const { net, sent } = rig({ writes: [{ label: "bundler eth_sendUserOperation", max: 2 }] });
    await post(net, "https://mainnet-bundler.xo.market/", rpc("eth_sendUserOperation"));
    assert.equal(await blocked(post(net, "https://mainnet-bundler.xo.market/", rpc("eth_sendUserOperation"))), "write_repeated");
    assert.equal(sent.length, 1);
    assert.equal(net.tripped?.rule, "write_repeated", "the run is over");
    assert.equal(await blocked(post(net, "https://mainnet-bundler.xo.market/", JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_sendUserOperation", params: [{ other: true }] }))), "stopped", "nothing more goes upstream");
    assert.equal(sent.length, 1);
  });

  it("a deliberate duplicate probe may repeat a body, nothing else may", async () => {
    const { net, sent } = rig({ writes: [{ label: "orderbook POST /order", max: 3, allowDuplicate: true }] });
    for (let i = 0; i < 3; i += 1) await post(net, "https://orderbooks.xo.market/order", "{}");
    assert.equal(await blocked(post(net, "https://orderbooks.xo.market/order", "{}")), "write_limit");
    assert.equal(sent.length, 3);
  });

  it("a JSON-RPC read through POST is a read, not a write", async () => {
    const { net } = rig();
    await post(net, "https://rpc-mainnet-2.xo.market/", rpc("eth_call"));
    await post(net, "https://mainnet.base.org/", rpc("eth_getTransactionReceipt"));
    assert.deepEqual(net.writesMade(), []);
  });

  it("a 401 or 403 from a host XO documents as needing a key latches the run: stop, no more traffic to it", async () => {
    const { net, sent } = rig({ answer: (url) => (url.includes("bundler") ? new Response("key", { status: 401 }) : new Response("{}", { status: 200 })) });
    const trip = (): Net["tripped"] => net.tripped;
    assert.equal(trip(), undefined);
    await get(net, "https://mainnet-bundler.xo.market/");
    assert.equal(trip()?.rule, "requires_key");
    assert.ok(trip()?.message.includes("does not look for one"));
    assert.equal(await blocked(get(net, "https://mainnet-bundler.xo.market/")), "stopped", "nothing more goes upstream after a stop rule");
    assert.equal(await blocked(get(net, "https://orderbooks.xo.market/time")), "stopped");
    assert.equal(sent.length, 1);
    // The loopback relay is still reachable so the run can end cleanly.
    await get(net, "http://127.0.0.1:9999/v1/health");
    assert.equal(sent.length, 2);
  });

  it("a 401 from the orderbook is an ordinary answer, not a latch", async () => {
    const { net } = rig({ answer: () => new Response("no", { status: 401 }) });
    await get(net, "https://orderbooks.xo.market/orders");
    assert.equal(net.tripped, undefined);
  });

  it("a Cloudflare challenge is a stop, not something to work around", async () => {
    const { net } = rig({ answer: () => new Response("<html>", { status: 403, headers: { "cf-mitigated": "challenge" } }) });
    await get(net, "https://orderbooks.xo.market/time");
    assert.equal(net.tripped?.rule, "cloudflare");
  });

  it("a read limit ends the run at the stop rule's count", async () => {
    const { net, sent } = rig({ readLimits: [{ name: "signed probes", labels: ["orderbook GET /auth/api-keys", "orderbook GET /orders"], max: 3 }] });
    await get(net, "https://orderbooks.xo.market/auth/api-keys");
    await get(net, "https://orderbooks.xo.market/orders?limit=1");
    await get(net, "https://orderbooks.xo.market/orders?limit=1");
    assert.equal(await blocked(get(net, "https://orderbooks.xo.market/auth/api-keys")), "read_limit");
    assert.equal(net.tripped?.rule, "read_limit");
    assert.equal(sent.length, 3);
  });

  it("the mock's own set-up is quiet, unlisted writes are allowed there and counted nowhere", async () => {
    const { net, lines } = rig({ writes: [] });
    await net.arranging(async () => {
      await post(net, "https://orderbooks.xo.market/auth/api-key", "{}");
    });
    assert.equal(net.calls.length, 1);
    assert.equal(net.calls[0]?.phase, "arrange");
    assert.equal(lines.length, 0, "nothing was printed");
    assert.equal(net.writesMade().length, 0, "the run's own writes are counted separately");
    assert.equal(await blocked(post(net, "https://orderbooks.xo.market/auth/api-key", "{}")), "write_not_listed", "after the set-up the list applies again");
  });

  it("the arrange phase still may not use a host off the list or a forbidden method", async () => {
    const { net } = rig();
    await net.arranging(async () => {
      assert.equal(await blocked(get(net, "https://example.com/")), "host_not_allowed");
    });
  });
});

describe("the rehearsal's own pieces", () => {
  it("scrubPaths removes the working directory and the home directory from a stack trace", () => {
    const text = `Error: x\n    at ${process.cwd()}/scripts/live/a.ts:1:1\n    at ${homedir()}/.cache/b.js:2:2`;
    const clean = scrubPaths(text);
    assert.ok(!clean.includes(process.cwd()) && !clean.includes(homedir()), clean);
    assert.ok(clean.includes("<repo>/scripts/live/a.ts"));
  });

  it("the sample market file is clean for every end date the test accepts (1 to 7 days out), judged the way the relay judges it", () => {
    const now = Date.UTC(2026, 9, 19, 1, 0, 0);
    for (let days = 1; days <= 7; days += 1) {
      const expires = new Date(now + days * 86_400_000);
      const result = validateMetadata(sampleMetadataFor(expires), { expiresAtS: Math.floor(expires.getTime() / 1000) });
      assert.equal(result.ok, true, `${String(days)} days: ${result.checks.filter((check) => check.severity === "block").map((check) => check.code).join(",")}`);
    }
  });
});
