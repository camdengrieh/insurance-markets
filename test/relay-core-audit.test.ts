import assert from "node:assert/strict";
import { chmod, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { flagsSnapshotSchema, tripwiresSchema } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import { ALL_FLAGS_OFF, type Flags } from "../src/relay/flags.js";
import {
  createAlertSink,
  runAlertHook,
  TripwireRegistry,
  type HookRunner,
  type TripwireChecker,
} from "../relay/alerts.js";
import { createMemoryAudit, createRelayAudit, formatRelayAuditLine, isoSecondOf, RotatingLog } from "../relay/audit.js";
import { CAPABILITY_ID, CapabilityRegistry, FLAG_PREREQUISITES, FlagGate, guardSubmit, guardWrite } from "../relay/capabilities.js";
import { openRelayStorage, realFs, type RelayStorage } from "../relay/store.js";
import type { RelayContext, RelayServices } from "../relay/types.js";
import { addr, FakeClock, faultyFs, hex32, modeOf, tempDir, type TempDir } from "./relay-core-helpers.js";

// The relay's own audit log, the alert sink, tripwires, capability facts, the flag gate and the
// guards the write handlers call.

const dirs: TempDir[] = [];
async function fresh(): Promise<string> {
  const made = await tempDir();
  dirs.push(made);
  return made.dir;
}
const closers: Array<() => Promise<void>> = [];
after(async () => {
  for (const close of closers) await close().catch(() => undefined);
  for (const made of dirs) await made.cleanup();
});

describe("audit lines", () => {
  const NOW = Date.parse("2026-10-19T12:00:00.123Z");

  it("builds a line from an allowlist of typed fields and shortens identifiers", () => {
    const line = formatRelayAuditLine(
      {
        ev: "send_result",
        rid: "req_0123456789ab",
        route: "POST /v1/order/submit",
        status: 200,
        code: "ambiguous",
        outcome: "ambiguous",
        owner: addr(0xabcdef),
        account: `0x${"AB".repeat(20)}`,
        preparedId: "0123456789abcdef0123456789abcdef",
        digestTag: "0123456789abcdef",
        hash: `0x${"AB".repeat(32)}`,
        amountAtomic: 10_000_000n,
        state: "sending",
        host: "orderbooks.xo.market",
        flag: "ENABLE_TRADING",
        ms: 12.7,
      },
      NOW,
    );
    const record = JSON.parse(line) as Record<string, unknown>;
    assert.deepEqual(record, {
      v: 1,
      ts: "2026-10-19T12:00:00.123Z",
      ev: "send_result",
      rid: "req_0123456789ab",
      route: "POST /v1/order/submit",
      status: 200,
      code: "ambiguous",
      outcome: "ambiguous",
      owner: "0x0000...cdef",
      account: "0xabab...abab",
      pid: "01234567",
      digest_tag: "0123456789abcdef",
      hash: `0x${"ab".repeat(32)}`,
      amount_atomic: "10000000",
      state: "sending",
      host: "orderbooks.xo.market",
      flag: "ENABLE_TRADING",
      ms: 13,
    });
  });

  it("ignores properties that are not on the list, so a stray secret cannot ride along", () => {
    const line = formatRelayAuditLine({ ev: "request", signature: "0x" + "ab".repeat(65), triplet: { key: "K", secret: "S" }, apiSecret: "TOPSECRET" } as never, NOW);
    assert.equal(line.includes("TOPSECRET"), false);
    assert.equal(line.includes("signature"), false);
    assert.equal(line.includes("ab".repeat(65)), false);
    assert.deepEqual(Object.keys(JSON.parse(line)).sort(), ["ev", "ts", "v"]);
  });

  it("drops malformed values and says which, instead of writing them", () => {
    const line = formatRelayAuditLine(
      { ev: "request", rid: "bad rid", route: "GET /etc/passwd", status: 99, code: "Bad Code", owner: "0x12", hash: "0x12", amountAtomic: -1n, host: "UPPER.example", flag: "lower", digestTag: "xyz", preparedId: "nothex!!", ms: -4 },
      NOW,
    );
    const record = JSON.parse(line) as { dropped?: string[] };
    assert.deepEqual(record.dropped?.sort(), ["amount_atomic", "code", "digest_tag", "flag", "hash", "host", "ms", "owner", "pid", "rid", "route", "status"].sort());
    assert.equal(line.includes("passwd"), false);
  });

  it("turns an unknown event name into `error` and keeps the line on one row", () => {
    const line = formatRelayAuditLine({ ev: "hack" as never, note: "line one\nline two\r\n line three" }, NOW);
    assert.equal(line.includes("\n"), false);
    assert.equal(line.includes(" "), false);
    assert.equal((JSON.parse(line) as { ev: string }).ev, "error");
  });

  it("redacts signature-like hex, tokens, e-mail addresses and known secrets from free text", () => {
    const line = formatRelayAuditLine(
      {
        ev: "error",
        note: `sig ${"0x" + "cd".repeat(65)} token ${"A1b2".repeat(12)} mail someone@example.org key=TEST-KEY-IN-A-NOTE pk ${addr(0xabc)}`,
      },
      NOW,
      ["TEST-KEY-IN-A-NOTE"],
    );
    for (const leak of ["cd".repeat(65), "A1b2".repeat(12), "someone@example.org", "TEST-KEY-IN-A-NOTE"]) assert.equal(line.includes(leak), false, leak);
    assert.equal(line.includes(addr(0xabc)), false, "addresses are shortened");
  });

  it("scrubs a known secret wherever it appears, even inside another field", () => {
    const secret = "scrub-me-0123456789";
    const line = formatRelayAuditLine({ ev: "request", state: "x", note: `a${secret}b` }, NOW, [secret, "short"]);
    assert.equal(line.includes(secret), false);
    assert.ok(line.includes("[redacted]"));
  });

  it("keeps a line under 2 KiB however large the note", () => {
    const line = formatRelayAuditLine({ ev: "request", note: "n".repeat(100_000) }, NOW);
    assert.ok(Buffer.byteLength(line) <= 2048);
  });

  it("formats whole-second UTC times for the contract", () => {
    assert.equal(isoSecondOf(NOW), "2026-10-19T12:00:00Z");
    assert.equal(isoSecondOf(Number.NaN), "1970-01-01T00:00:00Z");
  });
});

describe("the audit log file", () => {
  it("appends JSON lines with mode 0600, creating the directory with 0700", async () => {
    const dir = join(await fresh(), "logs");
    const clock = new FakeClock();
    const audit = await createRelayAudit({ dir, now: clock.now });
    await audit.write({ ev: "startup", outcome: "ok" });
    await audit.write({ ev: "request", route: "GET /v1/health", status: 200 });
    await audit.close();
    const lines = (await readFile(join(dir, "audit.log"), "utf8")).trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal((JSON.parse(lines[0] as string) as { ev: string }).ev, "startup");
    assert.equal(await modeOf(join(dir, "audit.log")), 0o600);
    assert.equal(await modeOf(dir), 0o700);
  });

  it("only ever appends: a second writer on the same file keeps the first writer's lines", async () => {
    const dir = await fresh();
    const first = await createRelayAudit({ dir });
    await first.write({ ev: "startup" });
    await first.close();
    const second = await createRelayAudit({ dir });
    await second.write({ ev: "shutdown" });
    await second.close();
    const text = await readFile(join(dir, "audit.log"), "utf8");
    assert.deepEqual(text.trim().split("\n").map((line) => (JSON.parse(line) as { ev: string }).ev), ["startup", "shutdown"]);
  });

  it("rotates by size, keeps a bounded number of files and loses no line inside the kept window", async () => {
    const dir = await fresh();
    const audit = await createRelayAudit({ dir, maxBytes: 1024, keep: 3 });
    for (let index = 0; index < 60; index += 1) await audit.write({ ev: "request", route: "GET /v1/health", status: 200, ms: index });
    await audit.close();
    const names = (await readdir(dir)).sort();
    assert.deepEqual(names, ["audit.log", "audit.log.1", "audit.log.2", "audit.log.3"]);
    const seen: number[] = [];
    for (const name of ["audit.log.3", "audit.log.2", "audit.log.1", "audit.log"]) {
      const text = await readFile(join(dir, name), "utf8");
      assert.ok(Buffer.byteLength(text) <= 1024 + 200, `${name} is ${Buffer.byteLength(text)} bytes`);
      for (const line of text.trim().split("\n")) seen.push((JSON.parse(line) as { ms: number }).ms);
      assert.equal(await modeOf(join(dir, name)), 0o600);
    }
    assert.deepEqual(seen, [...seen].sort((a, b) => a - b), "oldest first across the files");
    assert.equal(seen.at(-1), 59);
    assert.equal(new Set(seen).size, seen.length);
    assert.ok(audit.stats().rotations >= 3);
  });

  it("reports unhealthy after a failed write and healthy again after a good one, never throwing into the caller", async () => {
    const dir = await fresh();
    const faulty = faultyFs();
    const audit = await createRelayAudit({ dir, fs: faulty.fs });
    await audit.write({ ev: "startup" });
    assert.equal(audit.healthy(), true);
    faulty.add({ op: "write", path: /audit\.log$/ });
    await audit.write({ ev: "request" });
    assert.equal(audit.healthy(), false);
    assert.equal(audit.stats().failed, 1);
    await audit.write({ ev: "request" });
    assert.equal(audit.healthy(), true);
    await audit.close();
  });

  it("uses fsync only when asked", async () => {
    const dir = await fresh();
    const faulty = faultyFs();
    const audit = await createRelayAudit({ dir, fs: faulty.fs });
    faulty.log.length = 0;
    await audit.write({ ev: "request" });
    assert.equal(faulty.log.some((entry) => entry.startsWith("sync ")), false);
    await audit.write({ ev: "send_begin", sync: true });
    assert.equal(faulty.log.some((entry) => entry.startsWith("sync ")), true);
    await audit.close();
  });

  it("the in-memory audit keeps formatted lines and can be told to fail once", async () => {
    const memory = createMemoryAudit();
    await memory.write({ ev: "startup" });
    memory.failNext();
    await memory.write({ ev: "request" });
    assert.equal(memory.healthy(), false);
    await memory.write({ ev: "request" });
    assert.equal(memory.healthy(), true);
    assert.equal(memory.lines.length, 2);
  });
});

describe("alerts", () => {
  async function sink(options: { hook?: { command: string; run?: HookRunner }; clock?: FakeClock; dedupeWindowMs?: number } = {}) {
    const dir = await fresh();
    const clock = options.clock ?? new FakeClock();
    const log = new RotatingLog({ dir, name: "alerts.log" });
    const audit = createMemoryAudit(clock.now);
    const alerts = createAlertSink({ log, now: clock.now, audit, ...(options.hook === undefined ? {} : { hook: options.hook }), ...(options.dedupeWindowMs === undefined ? {} : { dedupeWindowMs: options.dedupeWindowMs }) });
    closers.push(() => alerts.close());
    return { alerts, dir, clock, audit };
  }

  it("writes an alert to its file as one JSON line with mode 0600", async () => {
    const { alerts, dir } = await sink();
    await alerts.raise({ id: "tripwire_exchange_upgraded", severity: "critical", message: "The exchange was upgraded.", details: { block: 123 } });
    await alerts.close();
    const text = await readFile(join(dir, "alerts.log"), "utf8");
    const record = JSON.parse(text.trim()) as { id: string; severity: string; message: string; details: Record<string, unknown>; ts: string };
    assert.equal(record.id, "tripwire_exchange_upgraded");
    assert.equal(record.severity, "critical");
    assert.deepEqual(record.details, { block: 123 });
    assert.match(record.ts, /Z$/);
    assert.equal(await modeOf(join(dir, "alerts.log")), 0o600);
  });

  it("counts repeats inside the dedupe window instead of writing them, and reports the count on the next one", async () => {
    const { alerts, dir, clock } = await sink({ dedupeWindowMs: 60_000 });
    for (let index = 0; index < 5; index += 1) await alerts.raise({ id: "upstream_blocked", severity: "warn", message: "blocked" });
    clock.advance(61_000);
    await alerts.raise({ id: "upstream_blocked", severity: "warn", message: "blocked" });
    await alerts.raise({ id: "other_alert", severity: "info", message: "x" });
    await alerts.close();
    const records = (await readFile(join(dir, "alerts.log"), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { id: string; repeats: number });
    assert.equal(records.length, 3);
    assert.equal(records[1]?.repeats, 4);
    assert.equal(alerts.recent(10).length, 3);
  });

  it("sanitises and redacts what it writes, and fixes up a bad id or severity", async () => {
    const { alerts, dir } = await sink();
    await alerts.raise({ id: "Bad Id!", severity: "loud" as never, message: `${"0x" + "ab".repeat(65)} someone@example.org ‮ line\nbreak ${"z".repeat(900)}`, details: { "Bad Key": "x", ok: "a\nb" } });
    await alerts.close();
    const text = await readFile(join(dir, "alerts.log"), "utf8");
    const record = JSON.parse(text.trim()) as { id: string; severity: string; message: string };
    assert.equal(record.id, "invalid_alert_id");
    assert.equal(record.severity, "warn");
    assert.ok(record.message.length <= 320);
    for (const leak of ["ab".repeat(65), "someone@example.org", "‮"]) assert.equal(text.includes(leak), false);
    assert.equal(text.trim().split("\n").length, 1);
  });

  it("does not break the caller when its file cannot be written, and says so in the audit log", async () => {
    const dir = await fresh();
    const faulty = faultyFs();
    const log = new RotatingLog({ dir, name: "alerts.log", fs: faulty.fs });
    const audit = createMemoryAudit();
    const alerts = createAlertSink({ log, audit });
    closers.push(() => alerts.close());
    faulty.add({ op: "open", path: /alerts\.log$/ });
    await alerts.raise({ id: "a_b", severity: "warn", message: "x" });
    assert.ok(audit.lines.some((line) => line.includes("alert_write_failed")));
  });

  it("has the command hook OFF unless one is configured", async () => {
    const { alerts } = await sink();
    assert.equal(alerts.hookEnabled, false);
    await alerts.raise({ id: "critical_thing", severity: "critical", message: "x" });
    assert.equal(alerts.hookRuns(), 0);
  });

  it("runs the hook with the command and a JSON payload, at most once per alert id per cooldown, and counts failures", async () => {
    const calls: Array<{ command: string; payload: string }> = [];
    let ok = true;
    const run: HookRunner = async (command, payload) => {
      calls.push({ command, payload });
      return { ok };
    };
    const { alerts, clock } = await sink({ hook: { command: "/usr/local/bin/notify", run }, dedupeWindowMs: 1000 });
    await alerts.raise({ id: "tripwire_a", severity: "critical", message: "first" });
    await alerts.idle();
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.command, "/usr/local/bin/notify");
    assert.deepEqual(Object.keys(JSON.parse(calls[0]?.payload as string)).sort(), ["id", "message", "severity", "ts"]);
    clock.advance(2000);
    await alerts.raise({ id: "tripwire_a", severity: "critical", message: "again" });
    await alerts.idle();
    assert.equal(calls.length, 1, "still inside the 5 minute cooldown for this id");
    clock.advance(6 * 60_000);
    ok = false;
    await alerts.raise({ id: "tripwire_a", severity: "critical", message: "later" });
    await alerts.idle();
    assert.equal(calls.length, 2);
    assert.equal(alerts.hookFailures(), 1);
  });

  it("caps the hook at 20 runs an hour, whatever the ids", async () => {
    let runs = 0;
    const { alerts } = await sink({ hook: { command: "/bin/true", run: async () => ({ ok: (runs += 1) > 0 }) } });
    for (let index = 0; index < 40; index += 1) await alerts.raise({ id: `alert_${index}`, severity: "warn", message: "x" });
    await alerts.idle();
    assert.equal(runs, 20);
  });

  it("survives a hook that throws", async () => {
    const { alerts } = await sink({ hook: { command: "/bin/true", run: async () => { throw new Error("boom"); } } });
    await alerts.raise({ id: "alert_x", severity: "warn", message: "x" });
    await alerts.idle();
    assert.equal(alerts.hookFailures(), 1);
  });

  it("the real hook runner passes the payload on stdin and an empty environment, with no secret from the relay's own", async () => {
    const dir = await fresh();
    const script = join(dir, "hook.sh");
    await writeFile(script, `#!/bin/sh\nenv > '${join(dir, "env.txt")}'\ncat > '${join(dir, "payload.txt")}'\n`);
    await chmod(script, 0o755);
    const saved = process.env["RELAY_MASTER_KEY"];
    process.env["RELAY_MASTER_KEY"] = "ENV-CANARY-master-value";
    try {
      const result = await runAlertHook(script, '{"id":"x"}', { timeoutMs: 5000 });
      assert.equal(result.ok, true);
    } finally {
      if (saved === undefined) delete process.env["RELAY_MASTER_KEY"];
      else process.env["RELAY_MASTER_KEY"] = saved;
    }
    assert.equal(await readFile(join(dir, "payload.txt"), "utf8"), '{"id":"x"}');
    const env = await readFile(join(dir, "env.txt"), "utf8");
    assert.equal(env.includes("ENV-CANARY"), false);
    assert.equal(/RELAY_|XO_|ENABLE_/.test(env), false);
    assert.match(env, /^PATH=\/usr\/bin:\/bin$/m);
  });

  it("the real hook runner kills a hook that runs too long and reports failure for a missing command", async () => {
    const dir = await fresh();
    const script = join(dir, "slow.sh");
    await writeFile(script, "#!/bin/sh\nsleep 5\n");
    await chmod(script, 0o755);
    const began = performance.now();
    assert.equal((await runAlertHook(script, "{}", { timeoutMs: 100 })).ok, false);
    assert.ok(performance.now() - began < 3000);
    assert.equal((await runAlertHook(join(dir, "does-not-exist"), "{}", { timeoutMs: 1000 })).ok, false);
  });
});

describe("tripwires", () => {
  async function registry(options: { dir?: string; clock?: FakeClock; acknowledge?: string[] } = {}) {
    const dir = options.dir ?? (await fresh());
    const clock = options.clock ?? new FakeClock();
    const storage = await openRelayStorage({ dir, now: clock.now });
    const raised: string[] = [];
    const alerts = { raise: async (alert: { id: string }) => void raised.push(alert.id) } as unknown as Parameters<typeof TripwireRegistry.open>[0]["alerts"];
    const audit = createMemoryAudit(clock.now);
    const tripwires = await TripwireRegistry.open({ store: storage.state, now: clock.now, alerts, audit, ...(options.acknowledge === undefined ? {} : { acknowledge: options.acknowledge }) });
    return { tripwires, storage, raised, audit, clock, dir };
  }

  it("starts clear, and the snapshot matches the contract", async () => {
    const { tripwires, storage } = await registry();
    assert.deepEqual(tripwires.snapshot(), { ok: true, tripped: [] });
    assert.doesNotThrow(() => tripwires.assertWritable());
    await storage.close();
  });

  it("latches a tripwire, raises one alert, audits it, and refuses writes", async () => {
    const { tripwires, storage, raised, audit } = await registry();
    assert.equal(await tripwires.trip({ id: "exchange_upgraded", detail: "A second Upgraded event appeared on the exchange proxy." }), true);
    assert.equal(await tripwires.trip({ id: "exchange_upgraded", detail: "again" }), false);
    assert.deepEqual(raised, ["tripwire_exchange_upgraded"]);
    const snapshot = tripwires.snapshot();
    assert.equal(snapshot.ok, false);
    assert.doesNotThrow(() => tripwiresSchema.parse(snapshot));
    assert.deepEqual(snapshot.tripped.map((entry) => entry.id), ["exchange_upgraded"]);
    assert.throws(() => tripwires.assertWritable(), (error: unknown) => error instanceof RelayError && error.code === "tripwire" && Array.isArray(error.details?.["tripped"]));
    assert.ok(audit.lines.some((line) => line.includes('"ev":"tripwire"') && line.includes("exchange_upgraded")));
    await storage.close();
  });

  it("survives a restart, and never clears by itself", async () => {
    const first = await registry();
    await first.tripwires.trip({ id: "paymaster_owner_changed", detail: "The paymaster owner changed." });
    await first.storage.close();
    const second = await registry({ dir: first.dir, clock: first.clock });
    assert.equal(second.tripwires.isTripped(), true);
    assert.equal(second.tripwires.snapshot().tripped[0]?.id, "paymaster_owner_changed");
    // A later check that finds everything normal does not clear it.
    await second.tripwires.recheck([{ id: "paymaster_owner_changed", check: async () => undefined }]);
    assert.equal(second.tripwires.isTripped(), true);
    await second.storage.close();
  });

  it("clears only when the operator names the id at start-up", async () => {
    const first = await registry();
    await first.tripwires.trip({ id: "fee_ceiling_changed", detail: "x" });
    await first.tripwires.trip({ id: "router_upgraded", detail: "y" });
    await first.storage.close();
    const second = await registry({ dir: first.dir, clock: first.clock, acknowledge: ["fee_ceiling_changed", "no_such_id"] });
    assert.deepEqual(second.tripwires.acknowledged, ["fee_ceiling_changed"]);
    assert.deepEqual(second.tripwires.snapshot().tripped.map((entry) => entry.id), ["router_upgraded"]);
    await second.storage.close();
    const third = await registry({ dir: first.dir, clock: first.clock });
    assert.deepEqual(third.tripwires.snapshot().tripped.map((entry) => entry.id), ["router_upgraded"], "the acknowledgement is durable");
    await third.storage.close();
  });

  it("runs checkers, latches what they find, and treats a checker that cannot decide as unverified, not tripped", async () => {
    const { tripwires, storage } = await registry();
    const checkers: TripwireChecker[] = [
      { id: "fine", check: async () => undefined },
      { id: "found", check: async () => ({ id: "fee_ceiling_changed", detail: "The fee ceiling moved." }) },
      { id: "broken", check: async () => { throw new Error("rpc down"); } },
      { id: "hangs", check: (signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) },
    ];
    const result = await tripwires.recheck(checkers, { timeoutMs: 50 });
    assert.deepEqual([...result.unverified], ["broken", "hangs"]);
    assert.deepEqual(result.snapshot.tripped.map((entry) => entry.id), ["fee_ceiling_changed"]);
    await storage.close();
  });

  it("refuses a tripwire id that is not a slug, and sanitises the detail", async () => {
    const { tripwires, storage } = await registry();
    await assert.rejects(tripwires.trip({ id: "Bad Id", detail: "x" }), RelayError);
    await tripwires.trip({ id: "ok_id", detail: `bad ‮ text ${"0x" + "ab".repeat(70)}\nnewline` });
    const detail = tripwires.snapshot().tripped[0]?.detail ?? "";
    assert.equal(detail.includes("‮"), false);
    assert.equal(detail.includes("ab".repeat(70)), false);
    assert.equal(detail.includes("\n"), false);
    await storage.close();
  });
});

describe("capability facts", () => {
  async function facts(options: { dir?: string; clock?: FakeClock } = {}) {
    const dir = options.dir ?? (await fresh());
    const clock = options.clock ?? new FakeClock();
    const storage = await openRelayStorage({ dir, now: clock.now });
    const audit = createMemoryAudit(clock.now);
    return { registry: await CapabilityRegistry.open({ store: storage.state, now: clock.now, audit }), storage, audit, clock, dir };
  }

  it("is unknown until a fact is recorded, and a recorded fact carries its source and time", async () => {
    const { registry, storage, clock } = await facts();
    assert.equal(registry.state("AD5"), "unknown");
    assert.deepEqual(registry.snapshot(["AD5", "UO7"]), { AD5: "unknown", UO7: "unknown" });
    const fact = await registry.record({ id: "AD5", state: "yes", source: "probe", note: "T1 deployed a foreign account", value: "v07-unpacked" });
    assert.equal(fact.recordedAt, "2026-10-19T12:00:00Z");
    assert.equal(registry.state("AD5"), "yes");
    assert.equal(registry.value("AD5"), "v07-unpacked");
    assert.equal(registry.fact("AD5")?.source, "probe");
    assert.deepEqual(registry.all().map((entry) => entry.id), ["AD5"]);
    clock.advance(5000);
    await registry.record({ id: "AD5", state: "no", source: "operator" });
    assert.equal(registry.fact("AD5")?.source, "operator");
    assert.equal(registry.fact("AD5")?.recordedAt, "2026-10-19T12:00:05Z");
    await storage.close();
  });

  it("keeps facts across a restart", async () => {
    const first = await facts();
    await first.registry.record({ id: "UO9", state: "no", source: "probe", note: "bundler asked for a key" });
    await first.registry.record({ id: "T1", state: "yes", source: "operator" });
    await first.storage.close();
    const second = await facts({ dir: first.dir, clock: first.clock });
    assert.equal(second.registry.state("UO9"), "no");
    assert.equal(second.registry.state("T1"), "yes");
    assert.equal(second.registry.fact("UO9")?.note, "bundler asked for a key");
    await second.storage.close();
  });

  it("accepts only ids from the assumptions register and the live tests", async () => {
    const { registry, storage } = await facts();
    for (const id of ["AD1", "AD10", "UO13", "OR18", "AU6", "FU9", "CR10", "PB6", "XS6", "T0", "T1", "T3a", "T3b", "T3c", "T6b", "T8"]) assert.match(id, CAPABILITY_ID);
    for (const id of ["", "ad5", "AD100", "AD", "ZZ1", "T10", "T3d", "AD5 ", "../AD5", "__proto__"]) {
      await assert.rejects(registry.record({ id, state: "yes", source: "probe" }), (error: unknown) => error instanceof RelayError && error.code === "invalid_request", id);
    }
    await assert.rejects(registry.record({ id: "AD5", state: "maybe" as never, source: "probe" }), RelayError);
    await assert.rejects(registry.record({ id: "AD5", state: "yes", source: "rumour" as never }), RelayError);
    await assert.rejects(registry.record({ id: "AD5", state: "yes", source: "probe", value: "has space" }), RelayError);
    assert.equal(registry.all().length, 0);
    await storage.close();
  });

  it("lets a probe take a yes back but not overrule an operator's no", async () => {
    const { registry, storage } = await facts();
    await registry.record({ id: "FU9", state: "yes", source: "operator" });
    await registry.record({ id: "FU9", state: "no", source: "probe" });
    assert.equal(registry.state("FU9"), "no");
    await registry.record({ id: "FU9", state: "no", source: "operator" });
    await assert.rejects(registry.record({ id: "FU9", state: "yes", source: "probe" }), (error: unknown) => error instanceof RelayError && error.code === "precondition_failed");
    assert.equal(registry.state("FU9"), "no");
    await registry.record({ id: "FU9", state: "yes", source: "operator" });
    assert.equal(registry.state("FU9"), "yes");
    await storage.close();
  });

  it("redacts the note and audits each record", async () => {
    const { registry, storage, audit } = await facts();
    await registry.record({ id: "OR10", state: "yes", source: "probe", note: `decoding worked, secret ${"A".repeat(50)} sig ${"0x" + "ab".repeat(65)}` });
    const note = registry.fact("OR10")?.note ?? "";
    assert.equal(note.includes("A".repeat(50)), false);
    assert.equal(note.includes("ab".repeat(65)), false);
    assert.ok(audit.lines.some((line) => line.includes('"ev":"capability"') && line.includes('"code":"or10"')));
    await storage.close();
  });
});

describe("the flag gate", () => {
  async function gate(env: Partial<Flags>, options: { armed?: Array<keyof typeof FLAG_PREREQUISITES>; enforce?: boolean } = {}) {
    const dir = await fresh();
    const storage = await openRelayStorage({ dir });
    const registry = await CapabilityRegistry.open({ store: storage.state });
    const audit = createMemoryAudit();
    const flagGate = new FlagGate({ envFlags: { ...ALL_FLAGS_OFF, ...env }, armed: options.armed ?? [], registry, enforce: options.enforce ?? true, audit });
    return { flagGate, registry, storage, audit };
  }

  it("keeps a flag off when the environment has it off, whatever the facts say", async () => {
    const { flagGate, registry, storage } = await gate({});
    for (const id of ["T1", "T2", "T3b", "T3a", "T4", "T6"]) await registry.record({ id, state: "yes", source: "operator" });
    assert.deepEqual({ ...flagGate.effective() }, { ...ALL_FLAGS_OFF });
    await storage.close();
  });

  it("keeps a flag off when the environment has it on but its test results are not recorded and it is not armed", async () => {
    const { flagGate, storage } = await gate({ ENABLE_TRADING: true, ENABLE_USEROP_SUBMIT: true });
    assert.equal(flagGate.effective().ENABLE_TRADING, false);
    assert.equal(flagGate.effective().ENABLE_USEROP_SUBMIT, false);
    const explained = flagGate.explain().find((entry) => entry.flag === "ENABLE_TRADING");
    assert.equal(explained?.reason, "prerequisites_missing");
    assert.deepEqual(explained?.prerequisites.map((entry) => `${entry.id}:${entry.state}`), ["T1:unknown", "T2:unknown", "T3b:unknown"]);
    await storage.close();
  });

  it("turns a flag on when every prerequisite fact is yes, and off again when one turns to no", async () => {
    const { flagGate, registry, storage } = await gate({ ENABLE_TRADING: true });
    await registry.record({ id: "T1", state: "yes", source: "probe" });
    await registry.record({ id: "T2", state: "yes", source: "probe" });
    assert.equal(flagGate.effective().ENABLE_TRADING, false, "T3b is still missing");
    await registry.record({ id: "T3b", state: "yes", source: "operator" });
    assert.equal(flagGate.effective().ENABLE_TRADING, true);
    assert.equal(flagGate.explain().find((entry) => entry.flag === "ENABLE_TRADING")?.reason, "prerequisites_met");
    await registry.record({ id: "T2", state: "no", source: "probe" });
    assert.equal(flagGate.effective().ENABLE_TRADING, false);
    await storage.close();
  });

  it("lets the operator arm a flag for the live test that produces its prerequisite", async () => {
    const { flagGate, storage } = await gate({ ENABLE_USEROP_SUBMIT: true, ENABLE_FUNDING: true }, { armed: ["ENABLE_USEROP_SUBMIT"] });
    assert.equal(flagGate.effective().ENABLE_USEROP_SUBMIT, true);
    assert.equal(flagGate.explain().find((entry) => entry.flag === "ENABLE_USEROP_SUBMIT")?.reason, "armed");
    assert.equal(flagGate.effective().ENABLE_FUNDING, false, "arming one flag arms nothing else");
    await storage.close();
  });

  it("arming does nothing for a flag that is off in the environment", async () => {
    const { flagGate, storage } = await gate({}, { armed: ["ENABLE_TRADING"] });
    assert.equal(flagGate.effective().ENABLE_TRADING, false);
    await storage.close();
  });

  it("passes the environment through when the operator switched enforcement off", async () => {
    const { flagGate, storage } = await gate({ ENABLE_TRADING: true }, { enforce: false });
    assert.equal(flagGate.effective().ENABLE_TRADING, true);
    assert.equal(flagGate.explain().find((entry) => entry.flag === "ENABLE_TRADING")?.reason, "not_enforced");
    await storage.close();
  });

  it("switches everything off under the kill switch, from the environment or from a signal, and never switches anything on", async () => {
    const env = await gate({ ENABLE_TRADING: true, KILL: true }, { enforce: false });
    assert.equal(env.flagGate.effective().KILL, true);
    assert.equal(env.flagGate.effective().ENABLE_TRADING, false);
    await env.storage.close();
    const live = await gate({ ENABLE_TRADING: true }, { enforce: false });
    assert.equal(live.flagGate.effective().ENABLE_TRADING, true);
    await live.flagGate.engageKill("operator signal");
    await live.flagGate.engageKill("again");
    assert.equal(live.flagGate.effective().KILL, true);
    assert.equal(live.flagGate.effective().ENABLE_TRADING, false);
    assert.equal(live.flagGate.killEngaged, true);
    assert.equal(live.audit.lines.filter((line) => line.includes('"state":"engaged"')).length, 1);
    await live.storage.close();
  });

  it("always answers with every flag name, in the shape the contract expects", async () => {
    const { flagGate, storage } = await gate({ ENABLE_FUNDING: true });
    assert.doesNotThrow(() => flagsSnapshotSchema.parse(flagGate.effective()));
    assert.equal(Object.isFrozen(flagGate.effective()), true);
    await storage.close();
  });

  it("names a prerequisite for every write flag", () => {
    assert.deepEqual(Object.keys(FLAG_PREREQUISITES).sort(), Object.keys(ALL_FLAGS_OFF).filter((name) => name !== "KILL").sort());
    for (const ids of Object.values(FLAG_PREREQUISITES)) for (const id of ids) assert.match(id, CAPABILITY_ID);
  });
});

describe("the write guards", () => {
  function context(overrides: { flags?: Flags; services?: RelayServices } = {}): RelayContext {
    return { flags: () => overrides.flags ?? { ...ALL_FLAGS_OFF, ENABLE_TRADING: true }, now: () => 0, requestId: "r", signal: new AbortController().signal, services: overrides.services ?? {} };
  }
  const codeOf = (fn: () => unknown): string => {
    try {
      fn();
    } catch (error) {
      assert.ok(error instanceof RelayError);
      return error.code;
    }
    return "no error";
  };

  it("passes when the flag is on and nothing is wrong", () => {
    assert.equal(codeOf(() => guardWrite(context(), "ENABLE_TRADING")), "no error");
  });

  it("refuses with kill_switch under KILL, whatever else is on", () => {
    assert.equal(codeOf(() => guardWrite(context({ flags: { ...ALL_FLAGS_OFF, ENABLE_TRADING: true, KILL: true } }), "ENABLE_TRADING")), "kill_switch");
  });

  it("refuses with flag_off when the flag is off", () => {
    assert.equal(codeOf(() => guardWrite(context({ flags: ALL_FLAGS_OFF }), "ENABLE_TRADING")), "flag_off");
    assert.equal(codeOf(() => guardWrite(context(), "ENABLE_FUNDING")), "flag_off");
  });

  it("refuses with tripwire while any tripwire is tripped", async () => {
    const dir = await fresh();
    const storage = await openRelayStorage({ dir });
    const tripwires = await TripwireRegistry.open({ store: storage.state });
    assert.equal(codeOf(() => guardWrite(context({ services: { tripwires } }), "ENABLE_TRADING")), "no error");
    await tripwires.trip({ id: "exchange_upgraded", detail: "x" });
    assert.equal(codeOf(() => guardWrite(context({ services: { tripwires } }), "ENABLE_TRADING")), "tripwire");
    await storage.close();
  });

  it("refuses writes while the relay's own audit log cannot be written", () => {
    const audit = createMemoryAudit();
    audit.failNext();
    void audit.write({ ev: "request" });
    assert.equal(audit.healthy(), false);
    assert.equal(codeOf(() => guardWrite(context({ services: { audit } }), "ENABLE_TRADING")), "internal");
  });

  it("guardSubmit re-checks the tripwires, refuses when one cannot be verified, and reads the kill switch again afterwards", async () => {
    const dir = await fresh();
    const storage = await openRelayStorage({ dir });
    const tripwires = await TripwireRegistry.open({ store: storage.state });
    const state = { flags: { ...ALL_FLAGS_OFF, ENABLE_TRADING: true } as Flags };
    const make = (checkers: TripwireChecker[]): RelayContext => ({ flags: () => state.flags, now: () => 0, requestId: "r", signal: new AbortController().signal, services: { tripwires, tripwireCheckers: checkers } });

    await guardSubmit(make([{ id: "ok", check: async () => undefined }]), "ENABLE_TRADING");
    await assert.rejects(guardSubmit(make([{ id: "down", check: async () => { throw new Error("rpc down"); } }]), "ENABLE_TRADING", 100), (error: unknown) => error instanceof RelayError && error.code === "tripwire" && JSON.stringify(error.details).includes("down"));
    assert.equal(tripwires.isTripped(), false, "an unverifiable check is not a latched tripwire");
    // The kill switch flips while the checkers are running: the write is still refused.
    await assert.rejects(
      guardSubmit(make([{ id: "slow", check: async () => { state.flags = { ...state.flags, KILL: true }; return undefined; } }]), "ENABLE_TRADING"),
      (error: unknown) => error instanceof RelayError && error.code === "kill_switch",
    );
    state.flags = { ...ALL_FLAGS_OFF, ENABLE_TRADING: true };
    await assert.rejects(
      guardSubmit(make([{ id: "found", check: async () => ({ id: "router_upgraded", detail: "The router implementation changed." }) }]), "ENABLE_TRADING"),
      (error: unknown) => error instanceof RelayError && error.code === "tripwire",
    );
    assert.equal(tripwires.isTripped(), true);
    await storage.close();
  });
});

// Keeps the unused-import linter honest: these are part of the surface under test.
void realFs;
void hex32;
export type { RelayStorage };
