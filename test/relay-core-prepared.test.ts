import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { AUTH_PREPARED_TTL_S, PREPARED_TTL_S } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import { createMemoryAudit } from "../relay/audit.js";
import { defaultTtlS, PreparedStore, type CreatePreparedInput, type PreparedRecord } from "../relay/prepared.js";
import { openRelayStorage, type RelayStorage } from "../relay/store.js";
import { addr, FakeClock, faultyFs, hex32, tempDir, type TempDir } from "./relay-core-helpers.js";

// Prepared items: 128-bit ids, single use, a TTL, and the `sending` marker on disk before anything
// is sent. One upstream send per prepared id, across restarts.

const dirs: TempDir[] = [];
after(async () => {
  for (const made of dirs) await made.cleanup();
});

const OWNER = addr(0x11);
const ACCOUNT = addr(0x22);

interface Rig {
  readonly dir: string;
  readonly clock: FakeClock;
  readonly storage: RelayStorage;
  readonly prepared: PreparedStore;
  readonly audit: ReturnType<typeof createMemoryAudit>;
}

async function rig(options: { readonly dir?: string; readonly clock?: FakeClock; readonly fs?: ReturnType<typeof faultyFs>["fs"] } = {}): Promise<Rig> {
  let dir = options.dir;
  if (dir === undefined) {
    const made = await tempDir();
    dirs.push(made);
    dir = made.dir;
  }
  const clock = options.clock ?? new FakeClock();
  const storage = await openRelayStorage({ dir, now: clock.now, ...(options.fs === undefined ? {} : { fs: options.fs }) });
  const audit = createMemoryAudit(clock.now);
  return { dir, clock, storage, prepared: new PreparedStore({ store: storage.state, now: clock.now, audit }), audit };
}

function input(over: Partial<CreatePreparedInput> = {}): CreatePreparedInput {
  return {
    kind: "order",
    owner: OWNER,
    account: ACCOUNT,
    digest: hex32(0xabc) as `0x${string}`,
    digestForm: "kernelWrappedOrderHash",
    payload: { side: "BUY", note: "decoded terms live here" },
    reservationIds: ["res00000001"],
    ...over,
  };
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof RelayError, `expected a RelayError, got ${String(error)}`);
    return error.code;
  }
  return "no error";
}

describe("creating a prepared item", () => {
  it("gives it a 128-bit random id in lower-case hex, and no two ids repeat", async () => {
    const r = await rig();
    const ids = new Set<string>();
    for (let index = 0; index < 500; index += 1) {
      const record = await r.prepared.create(input());
      assert.match(record.id, /^[0-9a-f]{32}$/);
      ids.add(record.id);
    }
    assert.equal(ids.size, 500);
    await r.storage.close();
  });

  it("expires an item after 5 minutes, and an auth item after 90 seconds", async () => {
    const r = await rig();
    const order = await r.prepared.create(input());
    const auth = await r.prepared.create(input({ kind: "auth", digestForm: "kernelWrappedClobAuth" }));
    assert.equal(order.expiresAtMs - order.createdAtMs, PREPARED_TTL_S * 1000);
    assert.equal(auth.expiresAtMs - auth.createdAtMs, AUTH_PREPARED_TTL_S * 1000);
    assert.equal(defaultTtlS("userop"), 300);
    assert.equal(defaultTtlS("create"), 300);
    assert.equal(defaultTtlS("auth"), 90);
    await r.storage.close();
  });

  it("lets a caller shorten the TTL and never lengthen it", async () => {
    const r = await rig();
    assert.equal((await r.prepared.create(input({ ttlS: 30 }))).expiresAtMs - r.clock.now(), 30_000);
    assert.equal((await r.prepared.create(input({ ttlS: 99_999 }))).expiresAtMs - r.clock.now(), 300_000);
    assert.equal((await r.prepared.create(input({ kind: "auth", digestForm: "kernelWrappedClobAuth", ttlS: 300 }))).expiresAtMs - r.clock.now(), 90_000);
    assert.equal((await r.prepared.create(input({ ttlS: 0 }))).expiresAtMs - r.clock.now(), 1000);
    await r.storage.close();
  });

  it("stores the digest in lower case, starts in `prepared`, and keeps the reservations it holds", async () => {
    const r = await rig();
    const record = await r.prepared.create(input({ digest: `0x${"AB".repeat(32)}` as `0x${string}` }));
    assert.equal(record.digest, `0x${"ab".repeat(32)}`);
    assert.equal(record.state, "prepared");
    assert.deepEqual(record.reservationIds, ["res00000001"]);
    assert.equal(record.failedAttempts, 0);
    assert.deepEqual(r.prepared.get(record.id), record);
    await r.storage.close();
  });

  it("refuses a bad owner, account, digest or an oversize payload", async () => {
    const r = await rig();
    assert.equal(await code(r.prepared.create(input({ owner: "0x123" }))), "internal");
    assert.equal(await code(r.prepared.create(input({ account: "nope" }))), "internal");
    assert.equal(await code(r.prepared.create(input({ digest: "0x1234" as `0x${string}` }))), "internal");
    assert.equal(await code(r.prepared.create(input({ payload: { big: "x".repeat(70_000) } }))), "internal");
    assert.equal(r.prepared.list().length, 0);
    await r.storage.close();
  });

  it("has no place to put a signature: the stored record holds the digest, the payload and the prepare answer only", async () => {
    const r = await rig();
    const record = await r.prepared.create(input());
    assert.deepEqual(Object.keys(record).sort(), [
      "account", "answer", "createdAtMs", "detail", "digest", "digestForm", "expiresAtMs", "failedAttempts", "id", "kind", "owner",
      "payload", "reservationIds", "resolvedAtMs", "sendStartedAtMs", "state",
    ]);
    assert.equal(record.answer, null, "nothing is kept until the prepare route's checked answer is");
    // The answer slot takes only a strict Prepared item of the contract, which has no field for a signature.
    assert.deepEqual(await r.prepared.keepAnswer({ prepared_id: record.id, kind: record.kind, owner: record.owner, sign: { expected_digest: record.digest }, signature: `0x${"11".repeat(65)}` }), { kept: false, reason: "shape" });
    assert.equal(r.prepared.get(record.id)?.answer, null);
    await r.storage.close();
  });
});

describe("single use", () => {
  it("lets the first beginSend through and says `prepared_used` to every later one", async () => {
    const r = await rig();
    const record = await r.prepared.create(input());
    const sending = await r.prepared.beginSend(record.id);
    assert.equal(sending.state, "sending");
    assert.equal(sending.sendStartedAtMs, r.clock.now());
    assert.equal(await code(r.prepared.beginSend(record.id)), "prepared_used");
    await r.prepared.resolve(record.id, "accepted");
    assert.equal(await code(r.prepared.beginSend(record.id)), "prepared_used");
    await r.storage.close();
  });

  it("lets exactly one of 30 racing beginSend calls win", async () => {
    const r = await rig();
    const record = await r.prepared.create(input());
    const outcomes = await Promise.all(Array.from({ length: 30 }, () => r.prepared.beginSend(record.id).then(() => "won", (error: RelayError) => error.code)));
    assert.equal(outcomes.filter((outcome) => outcome === "won").length, 1);
    assert.equal(outcomes.filter((outcome) => outcome === "prepared_used").length, 29);
    await r.storage.close();
  });

  it("refuses an unknown or malformed id with not_found", async () => {
    const r = await rig();
    assert.equal(await code(r.prepared.beginSend("0".repeat(32))), "not_found");
    for (const bad of ["", "zz", "ABCDEF".repeat(6), "0x" + "0".repeat(30), "0".repeat(31)]) {
      assert.equal(await code(r.prepared.beginSend(bad)), "not_found", bad);
      assert.equal(r.prepared.get(bad), undefined);
    }
    assert.equal(await code(Promise.resolve().then(() => r.prepared.require("0".repeat(32)))), "not_found");
    await r.storage.close();
  });

  it("refuses an item whose time is up, marks it expired, and keeps saying so", async () => {
    const r = await rig();
    const record = await r.prepared.create(input());
    r.clock.advance(299_999);
    assert.equal((await r.prepared.beginSend(record.id)).state, "sending", "one millisecond before the end still works");
    const late = await r.prepared.create(input());
    r.clock.advance(300_000);
    assert.equal(await code(r.prepared.beginSend(late.id)), "expired");
    assert.equal(r.prepared.get(late.id)?.state, "expired");
    assert.equal(await code(r.prepared.beginSend(late.id)), "expired");
    await r.storage.close();
  });

  it("counts five bad signatures as spending the item", async () => {
    const r = await rig();
    const record = await r.prepared.create(input());
    for (let index = 1; index < 5; index += 1) assert.deepEqual(await r.prepared.noteFailedAttempt(record.id), { locked: false });
    assert.deepEqual(await r.prepared.noteFailedAttempt(record.id), { locked: true });
    assert.equal(r.prepared.get(record.id)?.state, "rejected");
    assert.equal(r.prepared.get(record.id)?.detail, "too_many_bad_signatures");
    assert.equal(await code(r.prepared.beginSend(record.id)), "prepared_used");
    // Once the item has moved on, a stray failure changes nothing.
    const sent = await r.prepared.create(input());
    await r.prepared.beginSend(sent.id);
    assert.deepEqual(await r.prepared.noteFailedAttempt(sent.id), { locked: false });
    assert.equal(r.prepared.get(sent.id)?.state, "sending");
    await r.storage.close();
  });
});

describe("the state machine", () => {
  it("moves sending to accepted, rejected or ambiguous, and ambiguous to accepted or rejected, and nothing else", async () => {
    const r = await rig();
    const make = async (): Promise<PreparedRecord> => {
      const record = await r.prepared.create(input());
      return r.prepared.beginSend(record.id);
    };
    const a = await make();
    assert.equal((await r.prepared.resolve(a.id, "accepted", "posted")).detail, "posted");
    const b = await make();
    assert.equal((await r.prepared.resolve(b.id, "rejected", "http_400")).state, "rejected");
    const c = await make();
    assert.equal((await r.prepared.resolve(c.id, "ambiguous", "timeout")).state, "ambiguous");
    assert.equal((await r.prepared.reconcile(c.id, "accepted", "found_by_hash")).state, "accepted");
    const d = await make();
    await r.prepared.resolve(d.id, "ambiguous");
    assert.equal((await r.prepared.reconcile(d.id, "rejected")).state, "rejected");

    // The illegal moves.
    assert.equal(await code(r.prepared.resolve(a.id, "rejected")), "precondition_failed");
    assert.equal(await code(r.prepared.resolve(c.id, "ambiguous")), "precondition_failed");
    assert.equal(await code(r.prepared.reconcile(a.id, "rejected")), "precondition_failed");
    const unsent = await r.prepared.create(input());
    assert.equal(await code(r.prepared.resolve(unsent.id, "accepted")), "precondition_failed", "an unsent item cannot be accepted");
    assert.equal(await code(r.prepared.reconcile(unsent.id, "accepted")), "precondition_failed");
    assert.equal(await code(r.prepared.resolve("1".repeat(32), "accepted")), "not_found");
    assert.equal(await code(r.prepared.resolve(unsent.id, "accepted", "Bad Detail Text")), "internal");
    await r.storage.close();
  });
});

describe("the sending marker is on disk before anything is sent", () => {
  it("is readable from the journal file at the moment the first upstream request is made", async () => {
    const r = await rig();
    const record = await r.prepared.create(input());
    const journal = join(r.dir, "journal.log");
    let markerSeenAtSend = false;
    const fakeUpstreamPost = async (): Promise<void> => {
      // What a crash at this exact moment would leave behind.
      const text = await readFile(journal, "utf8");
      markerSeenAtSend = text.split("\n").some((line) => line.includes(`"${record.id}"`) && line.includes('"state":"sending"'));
    };
    await r.prepared.beginSend(record.id);
    await fakeUpstreamPost();
    assert.equal(markerSeenAtSend, true);
    await r.storage.close();
  });

  it("is fsynced before beginSend returns (the journal is synced after the write, before the call resolves)", async () => {
    const faulty = faultyFs();
    const r = await rig({ fs: faulty.fs });
    const record = await r.prepared.create(input());
    faulty.log.length = 0;
    await r.prepared.beginSend(record.id);
    const journalCalls = faulty.log.filter((entry) => entry.includes("journal.log"));
    const lastWrite = journalCalls.map((entry) => entry.startsWith("write")).lastIndexOf(true);
    const syncAfter = journalCalls.findIndex((entry, index) => entry.startsWith("sync") && index > lastWrite);
    assert.ok(lastWrite >= 0 && syncAfter > lastWrite, journalCalls.join("\n"));
    await r.storage.close();
  });

  it("refuses to proceed, and leaves the item unsent, when the marker cannot be made durable", async () => {
    const faulty = faultyFs();
    const r = await rig({ fs: faulty.fs });
    const record = await r.prepared.create(input());
    faulty.add({ op: "sync", path: /journal\.log$/ });
    let posts = 0;
    await assert.rejects(async () => {
      await r.prepared.beginSend(record.id);
      posts += 1;
    });
    assert.equal(posts, 0, "no request was made");
    assert.equal(r.prepared.get(record.id)?.state, "prepared");
    // The failure was transient; the item can still be sent once.
    assert.equal((await r.prepared.beginSend(record.id)).state, "sending");
    await r.storage.close();
  });
});

describe("a restart in the middle of a send", () => {
  async function sendOnce(r: Rig, id: string, post: () => void): Promise<void> {
    await r.prepared.beginSend(id);
    post();
  }

  it("turns the interrupted item into `ambiguous`, never sends it again, and reports it", async () => {
    let r = await rig();
    const record = await r.prepared.create(input());
    let posts = 0;
    await sendOnce(r, record.id, () => {
      posts += 1;
    });
    // The process dies before it can record the outcome.
    r.storage.abandon();
    r = await rig({ dir: r.dir, clock: r.clock });
    const recovered = await r.prepared.recoverInterrupted();
    assert.deepEqual(recovered.map((entry) => entry.id), [record.id]);
    assert.equal(recovered[0]?.state, "ambiguous");
    assert.equal(recovered[0]?.detail, "interrupted_by_restart");
    assert.deepEqual(recovered[0]?.reservationIds, ["res00000001"]);
    assert.equal(await code(sendOnce(r, record.id, () => (posts += 1))), "prepared_used");
    assert.equal(posts, 1, "one upstream send for the whole life of the id");
    assert.ok(r.audit.lines.some((line) => line.includes('"code":"interrupted_by_restart"')));
    await r.storage.close();
  });

  it("leaves an item that was never sent usable after a restart, until its time is up", async () => {
    let r = await rig();
    const record = await r.prepared.create(input());
    r.storage.abandon();
    r = await rig({ dir: r.dir, clock: r.clock });
    assert.deepEqual(await r.prepared.recoverInterrupted(), []);
    r.clock.advance(60_000);
    assert.equal((await r.prepared.beginSend(record.id)).state, "sending");
    await r.storage.close();
  });

  it("does not touch finished items, and recovery is idempotent", async () => {
    let r = await rig();
    const done = await r.prepared.create(input());
    await r.prepared.beginSend(done.id);
    await r.prepared.resolve(done.id, "accepted");
    const interrupted = await r.prepared.create(input());
    await r.prepared.beginSend(interrupted.id);
    await r.storage.close();
    r = await rig({ dir: r.dir, clock: r.clock });
    assert.equal((await r.prepared.recoverInterrupted()).length, 1);
    assert.equal((await r.prepared.recoverInterrupted()).length, 0);
    assert.equal(r.prepared.get(done.id)?.state, "accepted");
    assert.equal(r.prepared.get(interrupted.id)?.state, "ambiguous");
    await r.storage.close();
  });

  it("can be settled afterwards by reconciling, which still does not allow a second send", async () => {
    let r = await rig();
    const record = await r.prepared.create(input());
    await r.prepared.beginSend(record.id);
    r.storage.abandon();
    r = await rig({ dir: r.dir, clock: r.clock });
    await r.prepared.recoverInterrupted();
    assert.equal((await r.prepared.reconcile(record.id, "rejected", "not_found_after_expiry")).state, "rejected");
    assert.equal(await code(r.prepared.beginSend(record.id)), "prepared_used");
    await r.storage.close();
  });
});

describe("housekeeping", () => {
  it("marks unsent items past their time as expired and forgets finished items after a week, never an ambiguous one", async () => {
    const r = await rig();
    const unsent = await r.prepared.create(input());
    const accepted = await r.prepared.create(input());
    await r.prepared.beginSend(accepted.id);
    await r.prepared.resolve(accepted.id, "accepted");
    const ambiguous = await r.prepared.create(input());
    await r.prepared.beginSend(ambiguous.id);
    await r.prepared.resolve(ambiguous.id, "ambiguous");
    r.clock.advance(301_000);
    assert.deepEqual(await r.prepared.sweep(), { expired: 1, pruned: 0 });
    assert.equal(r.prepared.get(unsent.id)?.state, "expired");
    r.clock.advance(8 * 86_400_000);
    const report = await r.prepared.sweep();
    assert.equal(report.pruned, 2);
    assert.equal(r.prepared.get(accepted.id), undefined);
    assert.equal(r.prepared.get(unsent.id), undefined);
    assert.equal(r.prepared.get(ambiguous.id)?.state, "ambiguous", "an unresolved send is never forgotten");
    await r.storage.close();
  });

  it("lists items by state and account", async () => {
    const r = await rig();
    await r.prepared.create(input());
    const other = await r.prepared.create(input({ account: addr(0x33) }));
    await r.prepared.beginSend(other.id);
    assert.equal(r.prepared.list().length, 2);
    assert.equal(r.prepared.list({ state: "sending" }).length, 1);
    assert.equal(r.prepared.list({ account: ACCOUNT.toUpperCase().replace("0X", "0x") }).length, 1);
    await r.storage.close();
  });

  it("writes no signature and no payload into the audit trail", async () => {
    const r = await rig();
    const record = await r.prepared.create(input({ payload: { secretish: "PAYLOAD-CANARY" } }));
    await r.prepared.beginSend(record.id);
    await r.prepared.resolve(record.id, "accepted");
    const text = r.audit.lines.join("\n");
    assert.equal(text.includes("PAYLOAD-CANARY"), false);
    assert.equal(text.includes(record.id), false, "only the first 8 characters of the id are logged");
    assert.ok(text.includes(record.id.slice(0, 8)));
    await r.storage.close();
  });
});
