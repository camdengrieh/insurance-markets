import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, beforeEach, describe, it } from "node:test";

import { toPayboxSignArgs } from "../src/relay/contract.js";
import { runFactsCli } from "../scripts/live/facts.js";
import { flagStatus } from "../scripts/live/lib/facts.js";
import { runLiveTest } from "../scripts/live/lib/harness.js";
import { spec as t0 } from "../scripts/live/t0-paybox-signing.js";
import { spec as t1 } from "../scripts/live/t1-deploy-enable-trading.js";
import { testAccount } from "./anvil/chain.js";
import { FAST_RELAY, scriptedIo, type Scripted } from "./live-kit-helpers.js";
import { useMock } from "./mock-xo/testing.js";

// The live path of the kit, run without any network: T0 needs no service at all, so it can be driven end to end on
// the LIVE target with a stand-in for the person at the PayBox window (they paste what PayBox returned). The
// stand-in reads the request_wallet_sign arguments the script prints, signs them with a PUBLIC Anvil test key
// and pastes the answer. Every global fetch is replaced by a recorder, and the test fails if anything calls it.

const OWNER = testAccount(0);
const realFetch = globalThis.fetch;
let fetched: string[] = [];

// Inside the live-path suite every global fetch is a recorder that refuses; the mock suite below needs the real one
// for the relay's own loopback.
function noNetwork(): void {
  beforeEach(() => {
    fetched = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetched.push(String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url));
      throw new Error("the test has no network");
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
}

interface OperatorOptions {
  readonly runText?: string;
  readonly recordText?: string;
  // What the person says about PayBox itself.
  readonly mode?: string;
  readonly state?: string;
  readonly window?: string;
  readonly signRawWith?: "owner" | "nobody";
}

// A scripted person: answers every prompt of T0 from what the script printed.
function operator(options: OperatorOptions = {}): { scripted: Scripted; intents: Array<{ op: string; field: string | undefined; value: string | undefined }> } {
  const scripted = scriptedIo();
  const intents: Array<{ op: string; field: string | undefined; value: string | undefined }> = [];
  scripted.io.ask = async (prompt: string) => {
    scripted.asked.push(prompt);
    const lines = scripted.out;
    if (prompt.startsWith("> ")) {
      const last = [...lines].reverse().find((line) => /type exactly/i.test(line));
      const phrase = last === undefined ? "" : (/type exactly {3}(.+?) {3}/i.exec(last)?.[1] ?? "");
      if (last?.includes("to start") === true) return options.runText ?? phrase;
      return options.recordText ?? phrase;
    }
    if (prompt.startsWith("Paste what PayBox returned")) {
      const marker = lines.map((line, index) => (line.startsWith("Call PayBox request_wallet_sign with EXACTLY") ? index : -1)).filter((index) => index >= 0).pop() as number;
      let json = "";
      for (let index = marker + 1; index < lines.length; index += 1) {
        json += `${lines[index] as string}\n`;
        try {
          JSON.parse(json);
          break;
        } catch {
          // keep reading
        }
      }
      const args = JSON.parse(json) as { credential_id: string; intent: { op: string; rawSigningPayloadHex?: string; typedData?: never } };
      assert.equal(args.credential_id, "cred-test");
      if (args.intent.op === "raw") {
        const hex = args.intent.rawSigningPayloadHex as string;
        intents.push({ op: "raw", field: "rawSigningPayloadHex", value: hex.startsWith("0x") ? "0x-prefixed" : "bare" });
        if (options.signRawWith === "nobody") return JSON.stringify({ error: "denied" });
        return OWNER.sign({ hash: (hex.startsWith("0x") ? hex : `0x${hex}`) as `0x${string}` });
      }
      if (args.intent.op === "message") {
        intents.push({ op: "message", field: "message", value: undefined });
        return JSON.stringify({ error: "denied" });
      }
      intents.push({ op: args.intent.op, field: "typedData", value: undefined });
      return JSON.stringify({ signature: await OWNER.signTypedData(args.intent.typedData as never) });
    }
    if (prompt.includes("approval mode")) return options.mode ?? "autonomous";
    if (prompt.includes("state did PayBox show first")) return options.state ?? "pending_signature";
    if (prompt.includes("signing window show")) return options.window ?? "little";
    if (prompt.includes("What did it say?")) return "ready";
    return undefined;
  };
  return { scripted, intents };
}

function liveArgs(dir: string, extra: string[] = []): string[] {
  return ["--target=live", "--confirm", "--budget-usd", "0", "--owner", OWNER.address, "--data-dir", dir, "--credential-id", "cred-test", ...extra];
}

describe("the live path, driven by a scripted person", () => {
  noNetwork();
  const dirs: string[] = [];
  const fresh = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "live-kit-op-"));
    dirs.push(dir);
    return dir;
  };
  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it("T0 end to end: prints the exact request_wallet_sign arguments, needs 'RUN T0', records PB1 with the field name and the 0x handling", async () => {
    const dir = fresh();
    const { scripted, intents } = operator();
    const report = await runLiveTest(t0, liveArgs(dir), { env: { XO_LIVE_ACK: "T0" }, io: scripted.io, random: (n) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) % 256) });
    const text = [...scripted.out, ...scripted.err].join("\n");
    assert.equal(report.status, "pass", text);
    assert.deepEqual(fetched, [], "T0 contacts nothing, not even to look");
    assert.deepEqual(report.calls, []);
    // The arguments are exactly what the contract's adapter produces, and the 0x handling is the first thing tried.
    assert.deepEqual(intents[0], { op: "raw", field: "rawSigningPayloadHex", value: "0x-prefixed" });
    assert.ok(intents.some((entry) => entry.op === "typedData"));
    assert.match(text, /Type exactly   RUN T0   to start/);
    assert.deepEqual([...report.recorded].sort(), ["PB1=yes", "PB2=yes", "PB3=yes", "PB4=yes", "T0=yes", "UO2=yes"].sort());
    // The record outlives the run: the facts CLI reads them back from the data directory.
    const listing = scriptedIo();
    assert.equal(await runFactsCli(["list", "--data-dir", dir], { io: listing.io }), 0);
    const shown = listing.out.join("\n");
    assert.match(shown, /PB1\s+yes\s+operator.*rawSigningPayloadHex\.0x\.sig65/);
    assert.match(shown, /T0\s+yes/);
    // The credential id appears in the arguments; the signature itself never in the transcript.
    assert.doesNotMatch(text, /0x[0-9a-f]{130}/);
  });

  it("T0 tries the bare spelling after a refusal, in that order, and stops when raw cannot sign", async () => {
    const dir = fresh();
    const { scripted, intents } = operator({ signRawWith: "nobody" });
    const report = await runLiveTest(t0, liveArgs(dir, ["--no-record"]), { env: { XO_LIVE_ACK: "T0" }, io: scripted.io, random: (n) => Uint8Array.from({ length: n }, () => 5) });
    assert.equal(report.status, "stopped", [...scripted.out].join("\n"));
    assert.deepEqual(intents.filter((entry) => entry.op === "raw").map((entry) => entry.value), ["0x-prefixed", "bare"], "both spellings are tried, in that order");
    assert.deepEqual(report.recorded, []);
  });

  it("the live target is cancelled by anything but the exact phrase, and nothing is sent or recorded", async () => {
    const dir = fresh();
    const { scripted, intents } = operator({ runText: "run t0" });
    const report = await runLiveTest(t0, liveArgs(dir), { env: { XO_LIVE_ACK: "T0" }, io: scripted.io });
    assert.equal(report.status, "refused");
    assert.deepEqual(intents, [], "PayBox was never asked to sign anything");
    assert.match(scripted.err.join("\n"), /Cancelled/);
    assert.deepEqual(fetched, []);
  });

  it("the live target without the acknowledgement for THIS test is refused before the world is even built", async () => {
    const dir = fresh();
    const { scripted } = operator();
    const report = await runLiveTest(t0, liveArgs(dir), { env: { XO_LIVE_ACK: "T1" }, io: scripted.io });
    assert.equal(report.status, "refused");
    assert.deepEqual(scripted.asked, [], "nothing was even asked");
    assert.deepEqual(fetched, []);
  });

  it("a wrong record phrase records nothing; the right phrase typed later by the facts CLI records exactly that fact", async () => {
    const dir = fresh();
    const { scripted } = operator({ recordText: "RECORD T0=maybe" });
    const report = await runLiveTest(t0, liveArgs(dir), { env: { XO_LIVE_ACK: "T0" }, io: scripted.io });
    assert.equal(report.status, "pass");
    assert.deepEqual(report.recorded, []);
    const none = scriptedIo();
    await runFactsCli(["list", "--data-dir", dir], { io: none.io });
    assert.match(none.out.join("\n"), /No capability fact is recorded/);
    const record = scriptedIo(["RECORD T4=yes"]);
    assert.equal(await runFactsCli(["record", "--data-dir", dir, "--id", "T4", "--state", "yes", "--note", "the exit worked"], { io: record.io }), 0);
    const listed = scriptedIo();
    await runFactsCli(["list", "--data-dir", dir], { io: listed.io });
    assert.match(listed.out.join("\n"), /T4\s+yes\s+operator/);
  });
});

describe("the capability facts CLI", () => {
  const dirs: string[] = [];
  const fresh = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "live-kit-facts-"));
    dirs.push(dir);
    return dir;
  };
  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a bad command, a missing directory, a bad id and a bad state", async () => {
    const dir = fresh();
    for (const argv of [[], ["bogus", "--data-dir", dir], ["list"], ["record", "--data-dir", dir, "--id", "nope", "--state", "yes"], ["record", "--data-dir", dir, "--id", "T1", "--state", "perhaps"]]) {
      const io = scriptedIo();
      assert.equal(await runFactsCli(argv, { io: io.io }), 2, argv.join(" "));
    }
  });

  it("the record needs the exact phrase for that id and state", async () => {
    const dir = fresh();
    for (const answer of ["", "record T1=yes", "RECORD T1=no", "RECORD T1=yes please", undefined]) {
      const io = scriptedIo(answer === undefined ? [] : [answer]);
      assert.equal(await runFactsCli(["record", "--data-dir", dir, "--id", "T1", "--state", "yes"], { io: io.io }), 2, String(answer));
    }
    const listed = scriptedIo();
    await runFactsCli(["list", "--data-dir", dir], { io: listed.io });
    assert.match(listed.out.join("\n"), /No capability fact is recorded/);
    const ok = scriptedIo();
    assert.equal(await runFactsCli(["record", "--data-dir", dir, "--id", "T1", "--state", "yes", "--record-text", "RECORD T1=yes"], { io: ok.io }), 0);
  });

  it("a flag is unlocked only by the facts it needs, all of them yes", async () => {
    const dir = fresh();
    const record = async (id: string, state: string): Promise<void> => {
      const io = scriptedIo();
      assert.equal(await runFactsCli(["record", "--data-dir", dir, "--id", id, "--state", state, "--record-text", `RECORD ${id}=${state}`], { io: io.io }), 0);
    };
    const flagsOf = async (): Promise<string> => {
      const io = scriptedIo();
      await runFactsCli(["flags", "--data-dir", dir], { io: io.io });
      return io.out.join("\n");
    };
    assert.doesNotMatch(await flagsOf(), /UNLOCKED/);
    await record("T1", "yes");
    const afterT1 = await flagsOf();
    assert.match(afterT1, /ENABLE_USEROP_SUBMIT\s+UNLOCKED/);
    assert.match(afterT1, /ENABLE_FUNDING\s+UNLOCKED/);
    assert.match(afterT1, /ENABLE_TRADING\s+locked/, "trading also needs T2 and T3b");
    await record("T2", "yes");
    await record("T3b", "no");
    assert.match(await flagsOf(), /ENABLE_TRADING\s+locked/, "a no is not a yes");
    await record("T3b", "yes");
    assert.match(await flagsOf(), /ENABLE_TRADING\s+UNLOCKED/);
    assert.match(await flagsOf(), /kill switch/i, "the listing says the kill switch overrides everything");
    assert.deepEqual(
      flagStatus([]).map((status) => status.flag).sort(),
      ["ENABLE_CLOB_LIMITLESS", "ENABLE_CLOB_POLYMARKET", "ENABLE_FUNDING", "ENABLE_SELF_HOSTED_METADATA", "ENABLE_TRADING", "ENABLE_USEROP_SUBMIT", "ENABLE_WITHDRAW", "XO_ENABLE_CREATE"],
    );
  });
});

describe("a run on the mock is the only way a flag's fact appears", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("a run records nothing of its own until the phrase is typed; the relay's observed facts stay 'probe', and an operator 'no' locks the flag again", async (mock) => {
    const dir = mkdtempSync(join(tmpdir(), "live-kit-t1-"));
    try {
      const wrong = scriptedIo(["go ahead"]);
      const first = await runLiveTest(t1, ["--confirm", "--budget-usd", "0", "--data-dir", dir], { env: {}, io: wrong.io, world: { mock }, ...FAST_RELAY });
      assert.equal(first.status, "pass");
      assert.deepEqual(first.recorded, [], "a wrong phrase records nothing");
      const listed = scriptedIo();
      await runFactsCli(["list", "--data-dir", dir], { io: listed.io });
      const lines = listed.out.filter((line) => /^\s+[A-Z]{1,2}[0-9]/.test(line));
      assert.ok(lines.length > 0, "the relay's own observations are there");
      assert.ok(lines.every((line) => / probe /.test(line) && !/ operator /.test(line)), `no operator fact without the phrase:\n${lines.join("\n")}`);

      // The operator can lock what a probe opened: a recorded 'no' beats the probe's 'yes'.
      const lock = scriptedIo(["RECORD T1=no"]);
      assert.equal(await runFactsCli(["record", "--data-dir", dir, "--id", "T1", "--state", "no", "--note", "locked by hand"], { io: lock.io }), 0);
      const locked = scriptedIo();
      await runFactsCli(["flags", "--data-dir", dir], { io: locked.io });
      assert.doesNotMatch(locked.out.join("\n"), /UNLOCKED/);

      // And unlocks it again only on the operator's say-so.
      const open = scriptedIo(["RECORD T1=yes"]);
      assert.equal(await runFactsCli(["record", "--data-dir", dir, "--id", "T1", "--state", "yes"], { io: open.io }), 0);
      const unlocked = scriptedIo();
      await runFactsCli(["flags", "--data-dir", dir], { io: unlocked.io });
      assert.match(unlocked.out.join("\n"), /ENABLE_USEROP_SUBMIT\s+UNLOCKED/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
