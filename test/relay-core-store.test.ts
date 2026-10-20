import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFile, readdir, readFile, rm, truncate, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { CryptoError } from "../relay/crypto.js";
import type { FsLike } from "../relay/store.js";
import {
  acquireDirLock,
  atomicWriteFile,
  DurableStore,
  KeyedMutex,
  openRelayStorage,
  realFs,
  StoreError,
  type StoreOp,
} from "../relay/store.js";
import { addr, faultyFs, modeOf, secret, tempDir, TEST_KDF, TEST_MASTER_SECRET, type TempDir } from "./relay-core-helpers.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const dirs: TempDir[] = [];
async function fresh(): Promise<string> {
  const made = await tempDir();
  dirs.push(made);
  return made.dir;
}
after(async () => {
  for (const made of dirs) await made.cleanup();
});

function storeError(code: string): (error: unknown) => boolean {
  return (error) => error instanceof StoreError && error.code === code;
}

describe("atomic file writes survive a crash at any step", () => {
  it("writes the file with mode 0600 and replaces an older one", async () => {
    const dir = await fresh();
    const path = join(dir, "a.json");
    await atomicWriteFile(realFs, path, "one");
    await atomicWriteFile(realFs, path, "two");
    assert.equal(await readFile(path, "utf8"), "two");
    assert.equal(await modeOf(path), 0o600);
    assert.deepEqual(await readdir(dir), ["a.json"]);
  });

  const steps: Array<{ readonly name: string; readonly rule: Parameters<ReturnType<typeof faultyFs>["add"]>[0] }> = [
    { name: "the temp file cannot be created", rule: { op: "open", path: /\.tmp-/ } },
    { name: "the write is torn after 3 bytes", rule: { op: "write", path: /\.tmp-/, partialBytes: 3 } },
    { name: "the write fails outright", rule: { op: "write", path: /\.tmp-/ } },
    { name: "the sync fails (data written, not durable)", rule: { op: "sync", path: /\.tmp-/ } },
    { name: "the rename fails (temp complete, not yet in place)", rule: { op: "rename" } },
  ];
  for (const step of steps) {
    it(`keeps the old content and leaves no temp file when ${step.name}`, async () => {
      const dir = await fresh();
      const path = join(dir, "state.json");
      await atomicWriteFile(realFs, path, "old content");
      const faulty = faultyFs();
      faulty.add(step.rule);
      await assert.rejects(atomicWriteFile(faulty.fs, path, "new content that must not half-appear"));
      assert.equal(faulty.triggered, 1);
      assert.equal(await readFile(path, "utf8"), "old content");
      assert.deepEqual(await readdir(dir), ["state.json"]);
    });
  }

  it("a crash that leaves a temp file behind is cleaned up at the next open, and the data is intact", async () => {
    const dir = await fresh();
    const store = await DurableStore.open({ dir });
    await store.set("meta", "k", "v");
    await store.close();
    // What a kill between "write temp" and "rename" leaves behind.
    await writeFile(join(dir, "snapshot.json.tmp-99999-1"), "{\"half\":", { mode: 0o600 });
    const reopened = await DurableStore.open({ dir });
    assert.equal(reopened.get("meta", "k"), "v");
    assert.equal((await readdir(dir)).some((name) => name.includes(".tmp-")), false);
    await reopened.close();
  });
});

describe("the durable store", () => {
  it("returns what was committed, across a reopen", async () => {
    const dir = await fresh();
    const store = await DurableStore.open({ dir });
    await store.set("meta", "a", { n: 1, list: [1, 2, { deep: true }] });
    await store.commit([
      { ns: "meta", key: "b", value: "two" },
      { ns: "other", key: "c", value: null },
    ]);
    await store.delete("meta", "a");
    await store.close();
    const reopened = await DurableStore.open({ dir });
    assert.equal(reopened.get("meta", "a"), undefined);
    assert.equal(reopened.get("meta", "b"), "two");
    assert.deepEqual(reopened.keys("meta"), ["b"]);
    assert.equal(reopened.recovery.tornTailBytes, 0);
    assert.ok(reopened.recovery.replayedRecords >= 3);
    await reopened.close();
  });

  it("applies the operations of one commit together or not at all", async () => {
    const dir = await fresh();
    const faulty = faultyFs();
    const store = await DurableStore.open({ dir, fs: faulty.fs });
    await store.set("meta", "base", 1);
    faulty.add({ op: "sync", path: /journal\.log$/ });
    await assert.rejects(
      store.commit([
        { ns: "meta", key: "x", value: 1 },
        { ns: "meta", key: "y", value: 2 },
      ]),
      storeError("write_failed"),
    );
    // Neither operation is visible, in memory or after a reopen, and the store still works.
    assert.equal(store.get("meta", "x"), undefined);
    assert.equal(store.get("meta", "y"), undefined);
    await store.set("meta", "after", 3);
    await store.close();
    const reopened = await DurableStore.open({ dir });
    assert.deepEqual(reopened.keys("meta").sort(), ["after", "base"]);
    await reopened.close();
  });

  it("does nothing when the transaction function throws", async () => {
    const dir = await fresh();
    const store = await DurableStore.open({ dir });
    await assert.rejects(
      store.transact(() => {
        throw new Error("refused");
      }),
      /refused/,
    );
    assert.equal(store.sequence, 0);
    await store.close();
  });

  it("refuses bad namespaces, keys and values, and never writes them", async () => {
    const dir = await fresh();
    const store = await DurableStore.open({ dir });
    for (const op of [
      { ns: "Bad", key: "k", value: 1 },
      { ns: "has space", key: "k", value: 1 },
      { ns: "ok", key: "", value: 1 },
      { ns: "ok", key: "line\nbreak", value: 1 },
      { ns: "ok", key: "k".repeat(300), value: 1 },
      { ns: "ok", key: "k", value: undefined as unknown as null },
      { ns: "ok", key: "k", value: (() => 1) as unknown as null },
      { ns: "ok", key: "k", value: 10n as unknown as null },
    ] satisfies StoreOp[]) {
      await assert.rejects(store.commit([op]), storeError("invalid_op"));
    }
    await assert.rejects(store.set("ok", "big", "x".repeat(1_100_000)), storeError("invalid_op"));
    assert.equal(store.sequence, 0);
    await store.close();
  });

  it("hands out copies, so a caller cannot change stored state by editing a result", async () => {
    const dir = await fresh();
    const store = await DurableStore.open({ dir });
    await store.set("meta", "k", { a: [1, 2, 3] });
    const first = store.get<{ a: number[] }>("meta", "k") as { a: number[] };
    first.a.push(99);
    assert.deepEqual(store.get("meta", "k"), { a: [1, 2, 3] });
    const value = { a: [1] };
    await store.set("meta", "j", value);
    value.a.push(2);
    assert.deepEqual(store.get("meta", "j"), { a: [1] });
    await store.close();
  });

  it("keeps a key called __proto__ as data", async () => {
    const dir = await fresh();
    const store = await DurableStore.open({ dir });
    await store.compact();
    await store.set("meta", "__proto__", { polluted: true });
    await store.compact();
    await store.close();
    const reopened = await DurableStore.open({ dir });
    assert.deepEqual(reopened.get("meta", "__proto__"), { polluted: true });
    assert.equal(({} as { polluted?: boolean }).polluted, undefined);
    await reopened.close();
  });

  it("serialises concurrent read-modify-write transactions", async () => {
    const dir = await fresh();
    const store = await DurableStore.open({ dir });
    await store.set("meta", "counter", 0);
    await Promise.all(
      Array.from({ length: 100 }, () =>
        store.transact((reader) => ({ ops: [{ ns: "meta", key: "counter", value: (reader.get<number>("meta", "counter") ?? 0) + 1 }], result: undefined })),
      ),
    );
    assert.equal(store.get("meta", "counter"), 100);
    await store.close();
    const reopened = await DurableStore.open({ dir });
    assert.equal(reopened.get("meta", "counter"), 100);
    await reopened.close();
  });

  it("creates files with mode 0600 and the directory with 0700", async () => {
    const dir = join(await fresh(), "state");
    const store = await DurableStore.open({ dir });
    await store.set("meta", "k", 1);
    await store.compact();
    assert.equal(await modeOf(join(dir, "journal.log")), 0o600);
    assert.equal(await modeOf(join(dir, "snapshot.json")), 0o600);
    assert.equal(await modeOf(dir), 0o700);
    await store.close();
  });

  it("refuses calls after close", async () => {
    const dir = await fresh();
    const store = await DurableStore.open({ dir });
    await store.close();
    await assert.rejects(store.set("meta", "k", 1), storeError("closed"));
  });
});

describe("recovery from a damaged journal", () => {
  async function seeded(count: number): Promise<string> {
    const dir = await fresh();
    const store = await DurableStore.open({ dir });
    for (let index = 0; index < count; index += 1) await store.set("meta", `k${index}`, index);
    await store.close();
    return dir;
  }

  it("drops a torn last line (a crash in the middle of an append) and carries on", async () => {
    const dir = await seeded(5);
    const journal = join(dir, "journal.log");
    const whole = await readFile(journal);
    // Half of a sixth record, no newline.
    await appendFile(journal, "deadbeef {\"s\":6,\"t\":1,\"o\":[[\"meta\",\"k5\"");
    const store = await DurableStore.open({ dir });
    assert.ok(store.recovery.tornTailBytes > 0);
    assert.equal(store.get("meta", "k5"), undefined);
    assert.equal(store.get("meta", "k4"), 4);
    assert.equal((await readFile(journal)).length, whole.length, "the torn bytes are gone from the file");
    await store.set("meta", "k5", 5);
    await store.close();
    const again = await DurableStore.open({ dir });
    assert.equal(again.get("meta", "k5"), 5);
    assert.equal(again.recovery.tornTailBytes, 0);
    await again.close();
  });

  it("drops a tail of zero bytes, which some file systems leave after a power cut", async () => {
    const dir = await seeded(3);
    await appendFile(join(dir, "journal.log"), Buffer.alloc(64));
    const store = await DurableStore.open({ dir });
    assert.equal(store.recovery.tornTailBytes, 64);
    assert.deepEqual(store.keys("meta").sort(), ["k0", "k1", "k2"]);
    await store.close();
  });

  it("refuses to start when a complete line in the middle is damaged", async () => {
    const dir = await seeded(5);
    const journal = join(dir, "journal.log");
    const lines = (await readFile(journal, "utf8")).split("\n");
    lines[2] = lines[2]?.replace("k2", "kX") as string;
    await writeFile(journal, lines.join("\n"));
    await assert.rejects(DurableStore.open({ dir }), storeError("journal_corrupt"));
  });

  it("refuses to start on a bad framing or a bad checksum on the last complete line", async () => {
    const dir = await seeded(2);
    const journal = join(dir, "journal.log");
    await appendFile(journal, "not a record at all\n");
    await assert.rejects(DurableStore.open({ dir }), storeError("journal_corrupt"));
    const dir2 = await seeded(2);
    const lines = (await readFile(join(dir2, "journal.log"), "utf8")).split("\n");
    lines[1] = `00000000 ${(lines[1] as string).slice(9)}`;
    await writeFile(join(dir2, "journal.log"), lines.join("\n"));
    await assert.rejects(DurableStore.open({ dir: dir2 }), storeError("journal_corrupt"));
  });

  it("refuses to start on a snapshot that is not a snapshot", async () => {
    const dir = await seeded(1);
    await writeFile(join(dir, "snapshot.json"), "{\"format\":\"something else\"}");
    await assert.rejects(DurableStore.open({ dir }), storeError("snapshot_corrupt"));
    await writeFile(join(dir, "snapshot.json"), "nope");
    await assert.rejects(DurableStore.open({ dir }), storeError("snapshot_corrupt"));
  });

  it("refuses a record whose sequence number goes backwards", async () => {
    const dir = await seeded(3);
    const journal = join(dir, "journal.log");
    const lines = (await readFile(journal, "utf8")).split("\n").filter((line) => line !== "");
    await writeFile(journal, `${[lines[0], lines[2], lines[1]].join("\n")}\n`);
    await assert.rejects(DurableStore.open({ dir }), storeError("journal_corrupt"));
  });
});

describe("compaction", () => {
  it("moves the state into a snapshot and empties the journal; a reopen sees the same state", async () => {
    const dir = await fresh();
    const store = await DurableStore.open({ dir });
    for (let index = 0; index < 20; index += 1) await store.set("meta", `k${index}`, index);
    await store.delete("meta", "k3");
    await store.compact();
    assert.equal(store.journalSize, 0);
    await store.set("meta", "after", true);
    await store.close();
    const reopened = await DurableStore.open({ dir });
    assert.equal(reopened.get("meta", "k3"), undefined);
    assert.equal(reopened.get("meta", "k19"), 19);
    assert.equal(reopened.get("meta", "after"), true);
    assert.equal(reopened.recovery.replayedRecords, 1);
    await reopened.close();
  });

  it("compacts by itself once the journal passes the threshold", async () => {
    const dir = await fresh();
    const store = await DurableStore.open({ dir, compactAfterBytes: 2000 });
    for (let index = 0; index < 60; index += 1) await store.set("meta", `k${index}`, "x".repeat(40));
    assert.ok(store.journalSize < 2000 + 200, `journal is ${store.journalSize} bytes`);
    assert.ok((await readFile(join(dir, "snapshot.json"))).length > 0);
    await store.close();
    const reopened = await DurableStore.open({ dir });
    assert.equal(reopened.keys("meta").length, 60);
    await reopened.close();
  });

  it("a crash between the snapshot rename and the journal truncation loses nothing and applies nothing twice", async () => {
    const dir = await fresh();
    const faulty = faultyFs();
    const store = await DurableStore.open({ dir, fs: faulty.fs });
    await store.set("meta", "counter", 1);
    await store.set("meta", "counter", 2);
    await store.set("meta", "counter", 3);
    faulty.add({ op: "truncate", path: /journal\.log$/ });
    await assert.rejects(store.compact());
    store.abandon();
    const reopened = await DurableStore.open({ dir });
    assert.equal(reopened.get("meta", "counter"), 3);
    assert.equal(reopened.recovery.skippedRecords, 3, "the journal records the snapshot already covers are skipped");
    assert.equal(reopened.recovery.replayedRecords, 0);
    // New commits after that point carry on from the right sequence number.
    await reopened.set("meta", "counter", 4);
    await reopened.close();
    const third = await DurableStore.open({ dir });
    assert.equal(third.get("meta", "counter"), 4);
    await third.close();
  });

  it("a crash while writing the snapshot leaves the old snapshot and the journal in charge", async () => {
    const dir = await fresh();
    const faulty = faultyFs();
    const store = await DurableStore.open({ dir, fs: faulty.fs });
    await store.set("meta", "k", "before");
    await store.compact();
    await store.set("meta", "k", "after");
    faulty.add({ op: "rename", path: /snapshot\.json/ });
    await assert.rejects(store.compact());
    store.abandon();
    const reopened = await DurableStore.open({ dir });
    assert.equal(reopened.get("meta", "k"), "after");
    await reopened.close();
  });

  it("a failed automatic compaction does not fail the commit that triggered it", async () => {
    const dir = await fresh();
    const faulty = faultyFs();
    const store = await DurableStore.open({ dir, fs: faulty.fs, compactAfterBytes: 500 });
    faulty.add({ op: "rename", path: /snapshot\.json/, always: true });
    for (let index = 0; index < 20; index += 1) await store.set("meta", `k${index}`, "x".repeat(40));
    assert.equal(store.compactionFailed, true);
    assert.equal(store.get("meta", "k19"), "x".repeat(40));
    await store.close();
    const reopened = await DurableStore.open({ dir });
    assert.equal(reopened.keys("meta").length, 20);
    await reopened.close();
  });
});

describe("a failed append", () => {
  it("rolls the journal back so the next commit is clean", async () => {
    const dir = await fresh();
    const faulty = faultyFs();
    const store = await DurableStore.open({ dir, fs: faulty.fs });
    await store.set("meta", "a", 1);
    faulty.add({ op: "write", path: /journal\.log$/, partialBytes: 10 });
    await assert.rejects(store.set("meta", "b", 2), storeError("write_failed"));
    await store.set("meta", "c", 3);
    await store.close();
    const reopened = await DurableStore.open({ dir });
    assert.deepEqual(reopened.keys("meta").sort(), ["a", "c"]);
    assert.equal(reopened.recovery.tornTailBytes, 0);
    await reopened.close();
  });

  it("poisons the store when even the rollback fails, and every later call is refused", async () => {
    const dir = await fresh();
    const faulty = faultyFs();
    const store = await DurableStore.open({ dir, fs: faulty.fs });
    await store.set("meta", "a", 1);
    faulty.add({ op: "write", path: /journal\.log$/, partialBytes: 10 });
    faulty.add({ op: "truncate", path: /journal\.log$/, always: true });
    await assert.rejects(store.set("meta", "b", 2), storeError("write_failed"));
    await assert.rejects(store.set("meta", "c", 3), storeError("poisoned"));
    await assert.rejects(store.compact(), storeError("poisoned"));
    store.abandon();
    // After a restart the torn tail is dropped and the store works again.
    const reopened = await DurableStore.open({ dir });
    assert.deepEqual(reopened.keys("meta"), ["a"]);
    await reopened.close();
  });

  it("never lets memory get ahead of the disk (a sync failure leaves the old state visible)", async () => {
    const dir = await fresh();
    const faulty = faultyFs();
    const store = await DurableStore.open({ dir, fs: faulty.fs });
    await store.set("meta", "k", "old");
    faulty.add({ op: "sync", path: /journal\.log$/ });
    await assert.rejects(store.set("meta", "k", "new"));
    assert.equal(store.get("meta", "k"), "old");
    await store.close();
  });
});

describe("the directory lock", () => {
  it("keeps a second relay out of a directory that is in use, and lets one in after close", async () => {
    const dir = await fresh();
    const first = await openRelayStorage({ dir });
    await assert.rejects(openRelayStorage({ dir }), storeError("locked"));
    await first.close();
    const second = await openRelayStorage({ dir });
    await second.close();
  });

  it("takes over a lock left by a process that is gone", async () => {
    const dir = await fresh();
    await writeFile(join(dir, "store.lock"), "4000000\nstaletoken\n");
    const storage = await openRelayStorage({ dir, isProcessAlive: () => false });
    await storage.close();
  });

  it("does not take over a lock whose process is alive", async () => {
    const dir = await fresh();
    await writeFile(join(dir, "store.lock"), "4000000\nlivetoken\n");
    await assert.rejects(openRelayStorage({ dir, isProcessAlive: () => true }), storeError("locked"));
    assert.equal(await readFile(join(dir, "store.lock"), "utf8"), "4000000\nlivetoken\n");
  });

  it("treats an unreadable lock file as stale, and releases only its own lock", async () => {
    const dir = await fresh();
    await writeFile(join(dir, "store.lock"), "garbage");
    const lock = await acquireDirLock(realFs, dir);
    // Someone else replaced the file: releasing must not delete their lock.
    await writeFile(join(dir, "store.lock"), "1\nothertoken\n");
    await lock.release();
    assert.equal(await readFile(join(dir, "store.lock"), "utf8"), "1\nothertoken\n");
  });

  it("two starters that both judged the same stale lock cannot both take the directory", async () => {
    const dir = await fresh();
    await writeFile(join(dir, "store.lock"), "999999\nstaletoken\n");
    const dead = (pid: number): boolean => pid !== 999999;
    let aDone!: () => void;
    const aFinished = new Promise<void>((resolve) => {
      aDone = resolve;
    });
    // B is slow: it has read the stale lock, and its next move waits until A has finished taking over.
    const slowFs: FsLike = {
      ...realFs,
      open: async (path, flags, mode) => {
        if (path.endsWith("store.lock.claim")) await aFinished;
        return realFs.open(path, flags, mode);
      },
      unlink: async (path) => {
        if (path.endsWith("store.lock")) await aFinished;
        return realFs.unlink(path);
      },
    };
    const a = acquireDirLock(realFs, dir, dead);
    const b = acquireDirLock(slowFs, dir, dead);
    const first = await a;
    aDone();
    const second = await Promise.allSettled([b]);
    assert.equal(second[0]?.status, "rejected", "B must not take a lock that A took after B judged it stale");
    assert.ok(second[0]?.status === "rejected" && /locked/.test(String((second[0].reason as { code?: string }).code ?? "")));
    assert.match(await readFile(join(dir, "store.lock"), "utf8"), /^\d+\n[0-9a-f]{16}\n$/, "A's lock is intact");
    await first.release();
  });

  it("a claim left behind by a process that died does not block the next takeover", async () => {
    const dir = await fresh();
    await writeFile(join(dir, "store.lock"), "999999\nstaletoken\n");
    await writeFile(join(dir, "store.lock.claim"), `999998\n${String(Date.now())}\n`);
    const lock = await acquireDirLock(realFs, dir, (pid) => pid !== 999999 && pid !== 999998);
    await lock.release();
  });

  it("an abandoned instance (a crash inside one process) can be reopened", async () => {
    const dir = await fresh();
    const first = await openRelayStorage({ dir });
    await first.state.set("meta", "k", "survives");
    first.abandon();
    const second = await openRelayStorage({ dir });
    assert.equal(second.state.get("meta", "k"), "survives");
    await second.close();
  });

  it("releases the lock when start-up fails after it was taken", async () => {
    const dir = await fresh();
    await writeFile(join(dir, "snapshot.json"), "nope");
    await assert.rejects(openRelayStorage({ dir }), storeError("snapshot_corrupt"));
    await unlink(join(dir, "snapshot.json"));
    const storage = await openRelayStorage({ dir });
    await storage.close();
  });
});

describe("a real process killed in the middle of writing", () => {
  it("keeps every commit it acknowledged and opens cleanly afterwards", async () => {
    const dir = await fresh();
    const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "test", "relay-core-crash-child.ts"), dir], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "inherit"],
    });
    let acknowledged = -1;
    let buffer = "";
    let killed = false;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("the child never acknowledged 150 commits"));
      }, 60_000);
      child.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const match = /^ack (\d+)$/.exec(line);
          if (match !== null) acknowledged = Number(match[1]);
        }
        if (acknowledged >= 150 && !killed) {
          killed = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          resolve();
        }
      });
    });
    await exited;
    assert.ok(acknowledged >= 150);

    // The lock file is still there (the process never released it) and names a dead pid.
    const storage = await openRelayStorage({ dir });
    const last = storage.state.get<number>("crash", "last") as number;
    // Everything acknowledged is present; at most the one commit that was in flight when the kill
    // arrived may also be.
    assert.ok(last >= acknowledged && last <= acknowledged + 20, `last ${last}, acknowledged ${acknowledged}`);
    for (let n = 0; n <= acknowledged; n += 1) {
      assert.deepEqual(storage.state.get("crash", `k${n}`), { n, pad: "x".repeat(300) }, `commit ${n}`);
    }
    // And the store keeps working.
    await storage.state.set("crash", "after", true);
    await storage.close();
  });
});

describe("KeyedMutex", () => {
  it("runs work for one key strictly in order, and different keys side by side", async () => {
    const mutex = new KeyedMutex();
    const events: string[] = [];
    const slow = (name: string, ms: number) => async (): Promise<string> => {
      events.push(`start ${name}`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      events.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([mutex.run("a", slow("a1", 30)), mutex.run("a", slow("a2", 1)), mutex.run("b", slow("b1", 5))]);
    assert.deepEqual(results, ["a1", "a2", "b1"]);
    assert.ok(events.indexOf("end a1") < events.indexOf("start a2"), "same key: no overlap");
    assert.ok(events.indexOf("start b1") < events.indexOf("end a1"), "other key: runs at once");
    assert.equal(mutex.pending, 0);
  });

  it("keeps going after a failure", async () => {
    const mutex = new KeyedMutex();
    const failing = mutex.run("a", async () => {
      throw new Error("boom");
    });
    const next = mutex.run("a", async () => "ok");
    await assert.rejects(failing, /boom/);
    assert.equal(await next, "ok");
  });
});

describe("the credential vault", () => {
  const ACCOUNT = addr(0xa1);
  const OTHER = addr(0xb2);
  const TRIPLET = JSON.stringify({ key: "api-key-CANARY-123", secret: "c2VjcmV0LUNBTkFSWS00NTY3ODkwMTIzNDU2Nzg5MA", passphrase: "pass-CANARY-xyz" });

  async function vault(dir: string, fs = realFs) {
    return openRelayStorage({ dir, fs, masterSecret: secret(TEST_MASTER_SECRET), kdf: TEST_KDF, allowWeakKdf: true });
  }

  it("stores a secret encrypted, returns it as a Secret, and keeps the plaintext off the disk", async () => {
    const dir = await fresh();
    const storage = await vault(dir);
    const secrets = storage.secrets;
    assert.ok(secrets !== undefined);
    await secrets.put(ACCOUNT, "hmac_triplet", TRIPLET);
    const read = await secrets.get(ACCOUNT, "hmac_triplet");
    assert.equal(read?.reveal(), TRIPLET);
    assert.equal(String(read), "[redacted]");
    assert.equal(JSON.stringify({ read }), '{"read":"[redacted]"}');
    assert.equal(await secrets.has(ACCOUNT, "hmac_triplet"), true);
    assert.equal(await secrets.has(OTHER, "hmac_triplet"), false);
    assert.deepEqual(await secrets.names(ACCOUNT), ["hmac_triplet"]);
    await storage.close();
    for (const canary of ["api-key-CANARY-123", "pass-CANARY-xyz", "c2VjcmV0LUNBTkFSWS00NTY3ODkwMTIzNDU2Nzg5MA", TEST_MASTER_SECRET]) {
      for await (const path of (await import("./relay-core-helpers.js")).walkFiles(dir)) {
        const bytes = await readFile(path);
        assert.equal(bytes.includes(canary), false, `${path} holds ${canary}`);
      }
    }
  });

  it("uses mode 0600 for every secret and backup, and 0700 for their directories", async () => {
    const dir = await fresh();
    const storage = await vault(dir);
    await storage.secrets?.put(ACCOUNT, "hmac_triplet", TRIPLET);
    await storage.close();
    for (const name of ["secrets/keyring.json", `secrets/${ACCOUNT}.hmac_triplet.enc`, `secrets/backups/${ACCOUNT}.hmac_triplet.000001.bak`]) {
      assert.equal(await modeOf(join(dir, name)), 0o600, name);
    }
    assert.equal(await modeOf(join(dir, "secrets")), 0o700);
    assert.equal(await modeOf(join(dir, "secrets", "backups")), 0o700);
  });

  it("writes the encrypted backup BEFORE the primary file", async () => {
    const dir = await fresh();
    const faulty = faultyFs();
    const storage = await vault(dir, faulty.fs);
    faulty.log.length = 0;
    await storage.secrets?.put(ACCOUNT, "hmac_triplet", TRIPLET);
    const renames = faulty.log.filter((entry) => entry.startsWith("rename "));
    const backup = renames.findIndex((entry) => entry.includes(".bak"));
    const primary = renames.findIndex((entry) => entry.includes(".enc"));
    assert.ok(backup >= 0 && primary >= 0 && backup < primary, renames.join("\n"));
    await storage.close();
  });

  it("does not leave a primary behind when the backup cannot be written", async () => {
    const dir = await fresh();
    const faulty = faultyFs();
    const storage = await vault(dir, faulty.fs);
    faulty.add({ op: "rename", path: /\.bak/ });
    await assert.rejects(async () => storage.secrets?.put(ACCOUNT, "hmac_triplet", TRIPLET));
    assert.equal(await storage.secrets?.has(ACCOUNT, "hmac_triplet"), false);
    await storage.close();
  });

  it("refuses to overwrite an existing secret unless told to, and keeps the old backup when it does", async () => {
    const dir = await fresh();
    const storage = await vault(dir);
    const secrets = storage.secrets;
    assert.ok(secrets !== undefined);
    await secrets.put(ACCOUNT, "hmac_triplet", "first-value");
    await assert.rejects(secrets.put(ACCOUNT, "hmac_triplet", "second-value"), storeError("exists"));
    assert.equal((await secrets.get(ACCOUNT, "hmac_triplet"))?.reveal(), "first-value");
    await secrets.put(ACCOUNT, "hmac_triplet", "second-value", { replace: true });
    assert.equal((await secrets.get(ACCOUNT, "hmac_triplet"))?.reveal(), "second-value");
    assert.equal((await secrets.backups(ACCOUNT, "hmac_triplet")).length, 2);
    await storage.close();
  });

  it("verifies the backup against the primary without revealing anything", async () => {
    const dir = await fresh();
    const storage = await vault(dir);
    const secrets = storage.secrets;
    assert.ok(secrets !== undefined);
    assert.equal(await secrets.verifyBackup(ACCOUNT, "hmac_triplet"), false, "nothing stored yet");
    await secrets.put(ACCOUNT, "hmac_triplet", TRIPLET);
    assert.equal(await secrets.verifyBackup(ACCOUNT, "hmac_triplet"), true);
    // Damage the backup: the check says so.
    const backup = join(dir, "secrets", "backups", `${ACCOUNT}.hmac_triplet.000001.bak`);
    // Change the first ciphertext character to a different one: the ciphertext is random, so a fixed replacement
    // character equals the original one in 1 of 64 runs and would damage nothing.
    await writeFile(backup, (await readFile(backup, "utf8")).replace(/"ct":"(.)/, (_match, first: string) => `"ct":"${first === "A" ? "B" : "A"}`));
    assert.equal(await secrets.verifyBackup(ACCOUNT, "hmac_triplet"), false);
    await storage.close();
  });

  it("restores a deleted primary from the backup", async () => {
    const dir = await fresh();
    const storage = await vault(dir);
    const secrets = storage.secrets;
    assert.ok(secrets !== undefined);
    await secrets.put(ACCOUNT, "hmac_triplet", TRIPLET);
    await rm(join(dir, "secrets", `${ACCOUNT}.hmac_triplet.enc`));
    assert.equal(await secrets.get(ACCOUNT, "hmac_triplet"), undefined);
    const result = await secrets.restore(ACCOUNT, "hmac_triplet");
    assert.match(result.restoredFrom, /\.000001\.bak$/);
    assert.equal((await secrets.get(ACCOUNT, "hmac_triplet"))?.reveal(), TRIPLET);
    assert.equal(await secrets.verifyBackup(ACCOUNT, "hmac_triplet"), true);
    await storage.close();
  });

  it("restores over a corrupted primary, using the newest backup that still opens", async () => {
    const dir = await fresh();
    const storage = await vault(dir);
    const secrets = storage.secrets;
    assert.ok(secrets !== undefined);
    await secrets.put(ACCOUNT, "hmac_triplet", "version-one");
    await secrets.put(ACCOUNT, "hmac_triplet", "version-two", { replace: true });
    await writeFile(join(dir, "secrets", `${ACCOUNT}.hmac_triplet.enc`), "this is not a sealed record");
    await assert.rejects(secrets.get(ACCOUNT, "hmac_triplet"), CryptoError);
    // The newest backup is damaged too: restore falls back to the one before it.
    const newest = join(dir, "secrets", "backups", `${ACCOUNT}.hmac_triplet.000002.bak`);
    await writeFile(newest, "damaged");
    const result = await secrets.restore(ACCOUNT, "hmac_triplet");
    assert.match(result.restoredFrom, /\.000001\.bak$/);
    assert.equal((await secrets.get(ACCOUNT, "hmac_triplet"))?.reveal(), "version-one");
    await storage.close();
  });

  it("says so when no backup can be opened", async () => {
    const dir = await fresh();
    const storage = await vault(dir);
    const secrets = storage.secrets;
    assert.ok(secrets !== undefined);
    await assert.rejects(secrets.restore(ACCOUNT, "hmac_triplet"), storeError("no_valid_backup"));
    await secrets.put(ACCOUNT, "hmac_triplet", TRIPLET);
    await writeFile(join(dir, "secrets", "backups", `${ACCOUNT}.hmac_triplet.000001.bak`), "damaged");
    await assert.rejects(secrets.restore(ACCOUNT, "hmac_triplet"), storeError("no_valid_backup"));
    await storage.close();
  });

  it("opens again after a restart with the same master secret, and not with another", async () => {
    const dir = await fresh();
    const first = await vault(dir);
    await first.secrets?.put(ACCOUNT, "hmac_triplet", TRIPLET);
    await first.close();
    const second = await vault(dir);
    assert.equal((await second.secrets?.get(ACCOUNT, "hmac_triplet"))?.reveal(), TRIPLET);
    await second.close();
    await assert.rejects(
      openRelayStorage({ dir, masterSecret: secret("some-other-master-secret-1"), kdf: TEST_KDF, allowWeakKdf: true }),
      (error: unknown) => error instanceof CryptoError && error.code === "wrong_master_key",
    );
    // The failed attempt released the lock.
    const third = await vault(dir);
    await third.close();
  });

  it("will not invent a new keyring when sealed files exist but the keyring is gone", async () => {
    const dir = await fresh();
    const first = await vault(dir);
    await first.secrets?.put(ACCOUNT, "hmac_triplet", TRIPLET);
    await first.close();
    await rm(join(dir, "secrets", "keyring.json"));
    await assert.rejects(vault(dir), storeError("keyring_missing"));
  });

  it("does not open a file copied into another account's name", async () => {
    const dir = await fresh();
    const storage = await vault(dir);
    const secrets = storage.secrets;
    assert.ok(secrets !== undefined);
    await secrets.put(ACCOUNT, "hmac_triplet", TRIPLET);
    await writeFile(join(dir, "secrets", `${OTHER}.hmac_triplet.enc`), await readFile(join(dir, "secrets", `${ACCOUNT}.hmac_triplet.enc`)));
    await assert.rejects(secrets.get(OTHER, "hmac_triplet"), (error: unknown) => error instanceof CryptoError);
    await storage.close();
  });

  it("refuses bad accounts and names", async () => {
    const dir = await fresh();
    const storage = await vault(dir);
    const secrets = storage.secrets;
    assert.ok(secrets !== undefined);
    await assert.rejects(secrets.put("0xABCDEF0000000000000000000000000000000001", "x", "v"), storeError("invalid_op"));
    await assert.rejects(secrets.put(ACCOUNT, "../escape", "v"), storeError("invalid_op"));
    await assert.rejects(secrets.put(ACCOUNT, "Upper", "v"), storeError("invalid_op"));
    await assert.rejects(secrets.put(ACCOUNT, "ok_name", ""), storeError("invalid_op"));
    await assert.rejects(secrets.get("nope", "ok_name"), storeError("invalid_op"));
    await storage.close();
  });

  it("is absent when the credential store is off", async () => {
    const dir = await fresh();
    const storage = await openRelayStorage({ dir });
    assert.equal(storage.secrets, undefined);
    await storage.close();
  });

  it("truncating a sealed file is detected", async () => {
    const dir = await fresh();
    const storage = await vault(dir);
    await storage.secrets?.put(ACCOUNT, "hmac_triplet", TRIPLET);
    const path = join(dir, "secrets", `${ACCOUNT}.hmac_triplet.enc`);
    await truncate(path, 40);
    await assert.rejects(async () => storage.secrets?.get(ACCOUNT, "hmac_triplet"), CryptoError);
    await storage.close();
  });
});
