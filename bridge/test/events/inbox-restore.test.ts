import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import type { EmbeddedRelay } from "../../../relay/embedded.js";
import { createEmbeddedRelayClient } from "../../../src/relay/client.js";
import type { RelayCallOptions, RelayResult } from "../../../src/relay/contract.js";
import { ANVIL_ACCOUNT_0_OWNER } from "../../../src/xo/chain/constants.js";
import { startEmbedded, type StartedEmbedded } from "../../../test/local-helpers.js";
import { addr, FakeClock, tempDir, type TempDir } from "../../../test/relay-core-helpers.js";
import { verifiedDeployItem } from "../../../test/tools-decoded-helpers.js";
import type { Obj } from "../../../test/tools-helpers.js";
import { attachRelayRuntime } from "../../inbox.js";
import { INBOX_JOURNAL_FILE, readBack, restoreInbox, type PreparedReader, type RestoreReport } from "../../inbox-restore.js";
import { startRig, type Rig } from "./helpers.js";

// The inbox across a daemon restart (bridge/inbox-restore.ts): the ids of in-flight items are kept on disk, and a new
// daemon reads each item back from the in-process relay (GET /v1/prepared/{id}) and checks it like a fresh one, or drops
// it with a stated reason. Every "restart" below is a new daemon (and, where it matters, a new relay) on the same data
// directory. Items are built by the repo's own user-operation code for the public Anvil account 0; nothing is signed.

const OWNER = ANVIL_ACCOUNT_0_OWNER;
const OTHER = addr(0x1234);
const AGENT = "agent:0a1b2c3d";

const rigs: Rig[] = [];
const dirs: TempDir[] = [];
afterEach(async () => {
  for (const rig of rigs.splice(0)) await rig.stop();
  for (const dir of dirs.splice(0)) await dir.cleanup();
});

interface World {
  started: StartedEmbedded;
  readonly cockpit: string;
  readonly dataDir: TempDir;
  readonly clock: FakeClock;
}

async function world(): Promise<World> {
  const dataDir = await tempDir("inbox-restore-");
  dirs.push(dataDir);
  const clock = new FakeClock("2026-10-19T12:00:00Z");
  const started = await startEmbedded({ dir: dataDir, clock, env: { XO_OWNER: OWNER } });
  return { started, dataDir, clock, cockpit: join(dataDir.dir, "cockpit") };
}

// A new daemon joined to the world's relay, its inbox restored from the cockpit directory.
async function daemon(w: World, relay: PreparedReader = createEmbeddedRelayClient(w.started.relay.handler), nowMs = w.clock.now()): Promise<{ readonly rig: Rig; readonly report: RestoreReport }> {
  const rig = await startRig();
  rigs.push(rig);
  rig.t.clock.now = nowMs;
  const relayNow: EmbeddedRelay = w.started.relay;
  attachRelayRuntime(rig.t.daemon.host, { status: () => ({ state: "ready" as const, dataDir: w.dataDir.dir, dataDirCreated: false, masterKey: null, relay: relayNow }) });
  const report = await restoreInbox(rig.t.daemon.host, { dir: w.cockpit, relay });
  return { rig, report };
}

async function stopRig(rig: Rig): Promise<void> {
  rigs.splice(rigs.indexOf(rig), 1);
  await rig.stop();
}

// A prepared item held by the relay the way the prepare pipeline holds it: the record, and (unless told otherwise) the
// answer it sent, kept for GET /v1/prepared/{id}.
async function relayItem(w: World, options: { readonly ttlS?: number; readonly keep?: boolean; readonly tamper?: (item: Obj) => void } = {}): Promise<Obj> {
  const template = verifiedDeployItem();
  const record = await w.started.relay.services.prepared.create({
    kind: "userop",
    owner: template["owner"] as string,
    account: template["account"] as string,
    digest: (template["sign"] as { expected_digest: `0x${string}` }).expected_digest,
    digestForm: "userOpHash",
    payload: { note: "opaque to the inbox" },
    ...(options.ttlS === undefined ? {} : { ttlS: options.ttlS }),
  });
  const item = verifiedDeployItem({ preparedId: record.id, ...(options.ttlS === undefined ? {} : { ttlS: options.ttlS }), ...(options.tamper === undefined ? {} : { tamper: options.tamper }) });
  if (options.keep !== false) assert.deepEqual(await w.started.relay.services.prepared.keepAnswer(item), { kept: true });
  return item;
}

const idOf = (item: Obj): string => item["prepared_id"] as string;

async function journalOf(w: World): Promise<{ v: number; items: Record<string, unknown>[] }> {
  return JSON.parse(await readFile(join(w.cockpit, INBOX_JOURNAL_FILE), "utf8")) as { v: number; items: Record<string, unknown>[] };
}

const dropOf = (report: RestoreReport, id: string): RestoreReport["dropped"][number] | undefined => report.dropped.find((drop) => drop.prepared_id === id);

describe("what the daemon keeps on disk for a restart", () => {
  it("keeps only the id, owner, kind, requester and entry time of each in-flight item, 0600, and nothing when the inbox is empty", async () => {
    const w = await world();
    const first = await daemon(w);
    assert.deepEqual(first.report, { journal: "absent", restored: [], dropped: [] });
    await stopRig(first.rig);
    await assert.rejects(stat(join(w.cockpit, INBOX_JOURNAL_FILE)), /ENOENT/, "an empty inbox writes no file");

    const second = await daemon(w);
    const a = await relayItem(w);
    const b = await relayItem(w);
    assert.equal(second.rig.inbox.ingest(a, AGENT).ok, true);
    second.rig.t.clock.now += 5_000;
    assert.equal(second.rig.inbox.ingest(b, "ui").ok, true);
    await stopRig(second.rig);

    const journal = await journalOf(w);
    assert.deepEqual(journal, {
      v: 1,
      items: [
        { prepared_id: idOf(a), owner: OWNER.toLowerCase(), kind: "userop", requested_by: AGENT, created_at: "2026-10-19T12:00:00Z" },
        { prepared_id: idOf(b), owner: OWNER.toLowerCase(), kind: "userop", requested_by: "ui", created_at: "2026-10-19T12:00:05Z" },
      ],
    });
    const text = await readFile(join(w.cockpit, INBOX_JOURNAL_FILE), "utf8");
    for (const secretish of ["sign", "summary", "digest", "signature", "decoded", "intent", (a["sign"] as { expected_digest: string }).expected_digest.slice(2)]) {
      assert.equal(text.includes(secretish), false, `the list holds no ${secretish}`);
    }
    assert.equal((await stat(join(w.cockpit, INBOX_JOURNAL_FILE))).mode & 0o777, 0o600);
  });

  it("drops an item from the list when it leaves flight: rejected by the user, expired, or settled by the relay", async () => {
    const w = await world();
    const { rig } = await daemon(w);
    const rejected = await relayItem(w);
    const settled = await relayItem(w);
    const short = await relayItem(w, { ttlS: 60 });
    const open = await relayItem(w);
    for (const item of [rejected, settled, short, open]) assert.equal(rig.inbox.ingest(item, "ui").ok, true);
    assert.equal(rig.inbox.reject(idOf(rejected)).ok, true);
    await w.started.relay.services.prepared.beginSend(idOf(settled));
    await w.started.relay.services.prepared.resolve(idOf(settled), "accepted", "included");
    rig.t.clock.now += 61_000;
    assert.equal(rig.inbox.get(idOf(settled))?.state, "accepted");
    assert.equal(rig.inbox.get(idOf(short))?.state, "expired");
    await stopRig(rig);
    assert.deepEqual(
      (await journalOf(w)).items.map((entry) => entry["prepared_id"]),
      [idOf(open)],
    );
  });
});

describe("restoring after a restart, against the in-process relay", () => {
  it("brings back a signable item at prepared with its requester and entry time, checked like a fresh one", async () => {
    const w = await world();
    const before = await daemon(w);
    const item = await relayItem(w);
    assert.equal(before.rig.inbox.ingest(item, AGENT).ok, true);
    before.rig.t.clock.now += 1_000;
    assert.equal(before.rig.inbox.recordShown(idOf(item), { digest_tag: (item["summary"] as { digest_tag: string }).digest_tag, inner_hash_tag: (item["summary"] as { inner_hash_tag: string }).inner_hash_tag, verification: "verified", failed_checks: [] }).ok, true);
    assert.equal(before.rig.inbox.get(idOf(item))?.state, "shown");
    await stopRig(before.rig);

    // The relay restarts too: same data directory, same clock, 30 seconds later.
    await w.started.relay.close();
    w.clock.advance(30_000);
    w.started = await startEmbedded({ dir: w.dataDir, clock: w.clock, env: { XO_OWNER: OWNER } });
    const after = await daemon(w);
    assert.deepEqual(after.report, { journal: "read", restored: [idOf(item)], dropped: [] });
    const restored = after.rig.inbox.get(idOf(item));
    assert.equal(restored?.state, "prepared", "a card shown before the restart must be shown again");
    assert.equal(restored?.requested_by, AGENT);
    assert.equal(restored?.created_at, "2026-10-19T12:00:00Z");
    assert.deepEqual(restored?.prepared, item, "the relay's stored item, unchanged");
    assert.equal(after.rig.inbox.verificationOf(idOf(item))?.status, "verified", "rebuilt from the decoded block");
    assert.match(after.rig.t.stderr.text(), /inbox: 1 of 1 items from before the restart restored from the relay\./);
    // Still in the list for the next restart; and it follows the relay from here as before.
    await w.started.relay.services.prepared.beginSend(idOf(item));
    assert.equal(after.rig.inbox.get(idOf(item))?.state, "submitted");
  });

  it("drops each item the relay will not hand out, with its reason on stderr and in the audit, and never offers an ambiguous one", async () => {
    const w = await world();
    const before = await daemon(w);
    const keep = await relayItem(w);
    const expired = await relayItem(w, { ttlS: 60 });
    const used = await relayItem(w);
    const ambiguous = await relayItem(w);
    const notKept = await relayItem(w, { keep: false });
    for (const item of [keep, expired, used, ambiguous, notKept]) assert.equal(before.rig.inbox.ingest(item, "ui").ok, true);
    // The agent sent two of them; the process died while the send of `ambiguous` was under way.
    await w.started.relay.services.prepared.beginSend(idOf(used));
    await w.started.relay.services.prepared.resolve(idOf(used), "accepted", "included");
    await w.started.relay.services.prepared.beginSend(idOf(ambiguous));
    await stopRig(before.rig);
    const listed = (await journalOf(w)).items.map((entry) => entry["prepared_id"]);
    assert.deepEqual(new Set(listed), new Set([keep, expired, used, ambiguous, notKept].map(idOf)), "the crash came before the inbox saw the relay move");
    // An id the relay never held, as a list from another data directory would name.
    const stranger = "0123456789abcdef0123456789abcdef";
    const journal = await journalOf(w);
    journal.items.push({ prepared_id: stranger, owner: OWNER.toLowerCase(), kind: "userop", requested_by: "terminal", created_at: "2026-10-19T12:00:00Z" });
    await writeFile(join(w.cockpit, INBOX_JOURNAL_FILE), JSON.stringify(journal));

    await w.started.relay.close();
    w.clock.advance(90_000);
    w.started = await startEmbedded({ dir: w.dataDir, clock: w.clock, env: { XO_OWNER: OWNER } });
    assert.equal(w.started.relay.services.prepared.get(idOf(ambiguous))?.state, "ambiguous", "the relay's own restart rule");
    const after = await daemon(w);

    assert.deepEqual(after.report.restored, [idOf(keep)]);
    assert.deepEqual(dropOf(after.report, idOf(expired)), { prepared_id: idOf(expired), reason: "expired", detail: null });
    assert.deepEqual(dropOf(after.report, idOf(used)), { prepared_id: idOf(used), reason: "used", detail: "accepted" });
    assert.deepEqual(dropOf(after.report, idOf(ambiguous)), { prepared_id: idOf(ambiguous), reason: "ambiguous", detail: "ambiguous" });
    assert.deepEqual(dropOf(after.report, idOf(notKept)), { prepared_id: idOf(notKept), reason: "answer_not_kept", detail: null });
    assert.deepEqual(dropOf(after.report, stranger), { prepared_id: stranger, reason: "not_found", detail: null });

    for (const dropped of [expired, used, ambiguous, notKept]) assert.equal(after.rig.inbox.get(idOf(dropped)), undefined, "not listed, so nothing can show or sign it");
    const stderr = after.rig.t.stderr.text();
    assert.match(stderr, new RegExp(`inbox item ${idOf(ambiguous)} from before the restart was not restored: a send for it was started and its outcome is unknown\\. It is not shown for signing and must not be signed or sent again`));
    assert.match(stderr, new RegExp(`inbox item ${idOf(expired)} from before the restart was not restored: the relay says it ran out of time\\.`));
    assert.match(stderr, new RegExp(`inbox item ${idOf(used)} from before the restart was not restored: the relay says it was already used \\(accepted\\)\\.`));
    assert.match(stderr, new RegExp(`inbox item ${idOf(notKept)} from before the restart was not restored: the relay that prepared it did not keep its prepare answer`));
    assert.match(stderr, new RegExp(`inbox item ${stranger} from before the restart was not restored: the relay holds no such item`));
    assert.match(stderr, /inbox: 1 of 6 items from before the restart restored from the relay; 5 not restored \(reasons above\)\./);
    const audited = after.rig.t.audit.filter((record) => record.ev === "feed.mismatch" && typeof record.field === "string" && record.field.startsWith("restore."));
    assert.deepEqual(audited.map((record) => [record.preparedId, record.field, record.code]).sort(), [
      [idOf(expired), "restore.expired", "restore_expired"],
      [idOf(used), "restore.used", "restore_used"],
      [idOf(ambiguous), "restore.ambiguous", "restore_ambiguous"],
      [idOf(notKept), "restore.answer_not_kept", "restore_answer_not_kept"],
      [stranger, "restore.not_found", "restore_not_found"],
    ].sort());

    await stopRig(after.rig);
    assert.deepEqual((await journalOf(w)).items.map((entry) => entry["prepared_id"]), [idOf(keep)], "the dropped ids leave the list");
  });

  it("an item of an owner the relay no longer serves is the same not_found as an unknown id", async () => {
    const w = await world();
    const before = await daemon(w);
    const item = await relayItem(w);
    assert.equal(before.rig.inbox.ingest(item, "ui").ok, true);
    await stopRig(before.rig);
    await w.started.relay.close();
    w.started = await startEmbedded({ dir: w.dataDir, clock: w.clock, env: { XO_OWNER: OTHER } });
    const after = await daemon(w);
    assert.deepEqual(after.report.dropped, [{ prepared_id: idOf(item), reason: "not_found", detail: null }]);
  });

  it("re-verifies the item it reads back: a tampered summary line comes back red (the signer refuses it), as a fresh one would", async () => {
    const w = await world();
    const before = await daemon(w);
    const item = await relayItem(w, {
      tamper: (target) => {
        const summary = target["summary"] as { lines: string[] };
        summary.lines[0] = `${summary.lines[0] ?? ""} (changed)`;
      },
    });
    assert.equal(before.rig.inbox.ingest(item, "ui").ok, true);
    assert.equal(before.rig.inbox.verificationOf(idOf(item))?.status, "mismatch");
    await stopRig(before.rig);
    const after = await daemon(w);
    assert.deepEqual(after.report.restored, [idOf(item)]);
    assert.equal(after.rig.inbox.verificationOf(idOf(item))?.status, "mismatch");
    assert.ok(after.rig.t.audit.some((record) => record.ev === "feed.mismatch" && record.preparedId === idOf(item) && record.field?.startsWith("summary")));
    const summary = item["summary"] as { digest_tag: string; inner_hash_tag: string };
    assert.equal(after.rig.inbox.recordShown(idOf(item), { digest_tag: summary.digest_tag, inner_hash_tag: summary.inner_hash_tag, verification: "failed", failed_checks: ["summary"] }).ok, true);
    assert.deepEqual(after.rig.inbox.markSigned(idOf(item)), { ok: false, reason: "bad_state", state: "shown" }, "shown, but never signable");
  });

  it("refuses an item that is not the one the list names (owner or kind), and says so", async () => {
    const w = await world();
    const before = await daemon(w);
    const wrongOwner = await relayItem(w);
    const wrongKind = await relayItem(w);
    for (const item of [wrongOwner, wrongKind]) assert.equal(before.rig.inbox.ingest(item, "ui").ok, true);
    await stopRig(before.rig);
    const journal = await journalOf(w);
    for (const entry of journal.items) {
      if (entry["prepared_id"] === idOf(wrongOwner)) entry["owner"] = OTHER.toLowerCase();
      if (entry["prepared_id"] === idOf(wrongKind)) entry["kind"] = "order";
    }
    await writeFile(join(w.cockpit, INBOX_JOURNAL_FILE), JSON.stringify(journal));
    const after = await daemon(w);
    assert.deepEqual(after.report.restored, []);
    assert.deepEqual(dropOf(after.report, idOf(wrongOwner)), { prepared_id: idOf(wrongOwner), reason: "refused", detail: "journal_mismatch" });
    assert.deepEqual(dropOf(after.report, idOf(wrongKind)), { prepared_id: idOf(wrongKind), reason: "refused", detail: "journal_mismatch" });
    assert.ok(after.rig.t.audit.some((record) => record.ev === "feed.mismatch" && record.preparedId === idOf(wrongOwner) && record.field === "journal.owner"));
    assert.ok(after.rig.t.audit.some((record) => record.ev === "feed.mismatch" && record.preparedId === idOf(wrongKind) && record.field === "journal.kind"));
    assert.match(after.rig.t.stderr.text(), /failed the daemon's checks \(journal_mismatch\), so it is not shown\./);
  });

  it("refuses an item whose account is not the one derived from its owner, on restore and on a fresh ingest alike", async () => {
    const w = await world();
    const { rig } = await daemon(w);
    const item = verifiedDeployItem({ preparedId: "00112233445566778899aabbccddeeff", tamper: (target) => (target["account"] = OTHER) });
    const fresh = rig.inbox.ingest(item, "ui");
    assert.deepEqual(fresh, { ok: false, reason: "record_mismatch", field: "account" });
    const restored = rig.inbox.restore(item, { prepared_id: "00112233445566778899aabbccddeeff", owner: OWNER.toLowerCase(), kind: "userop", requested_by: "ui", created_at: "2026-10-19T12:00:00Z" });
    assert.deepEqual(restored, { ok: false, reason: "record_mismatch", field: "account" });
  });

  it("keeps the ids still being read back in every save, so a crash during the restore loses none of them", async () => {
    const w = await world();
    const before = await daemon(w);
    const a = await relayItem(w);
    const b = await relayItem(w);
    for (const item of [a, b]) assert.equal(before.rig.inbox.ingest(item, "ui").ok, true);
    await stopRig(before.rig);
    const inner = createEmbeddedRelayClient(w.started.relay.handler);
    const snapshots: string[] = [];
    // A relay that answers slowly: while `a` is being read back, a new item arrives and the list is saved.
    const fresh = await relayItem(w);
    let rigRef: Rig | undefined;
    const slow: PreparedReader = {
      get: (async (path: string, options?: RelayCallOptions) => {
        if (rigRef !== undefined && path.endsWith(idOf(a))) {
          assert.equal(rigRef.inbox.ingest(fresh, "ui").ok, true);
          snapshots.push(JSON.stringify(rigRef.inbox.journalEntries().map((entry) => entry.prepared_id).sort()));
        }
        return inner.get(path as never, options);
      }) as PreparedReader["get"],
    };
    const rig = await startRig();
    rigs.push(rig);
    rigRef = rig;
    attachRelayRuntime(rig.t.daemon.host, { status: () => ({ state: "ready" as const, dataDir: w.dataDir.dir, dataDirCreated: false, masterKey: null, relay: w.started.relay }) });
    const report = await restoreInbox(rig.t.daemon.host, { dir: w.cockpit, relay: slow });
    assert.deepEqual(new Set(report.restored), new Set([idOf(a), idOf(b)]));
    assert.deepEqual(snapshots, [JSON.stringify([idOf(a), idOf(b), idOf(fresh)].sort())]);
  });
});

describe("restoring against a relay that cannot answer", () => {
  function fakeRelay(answers: { readonly prepared: RelayResult<unknown> | "throw"; readonly health?: RelayResult<unknown> }): PreparedReader {
    return {
      get: (async (path: string) => {
        if (path === "/v1/health") return answers.health ?? { ok: false, status: 500, error: { code: "internal", message: "down" } };
        if (answers.prepared === "throw") throw new Error("socket closed");
        return answers.prepared;
      }) as PreparedReader["get"],
    };
  }
  const healthOf = (version: string): RelayResult<unknown> => ({ ok: true, status: 200, data: { status: "ok", version, time: "2026-10-19T12:00:00Z", kill: false, flags: {}, tripwires: {}, upstream: {} } });
  const noRoute: RelayResult<unknown> = { ok: false, status: 404, error: { code: "not_found", message: "No such route" } };

  async function listed(w: World): Promise<string> {
    const before = await daemon(w);
    const item = await relayItem(w);
    assert.equal(before.rig.inbox.ingest(item, "ui").ok, true);
    await stopRig(before.rig);
    return idOf(item);
  }

  it("an older relay (before GET /v1/prepared/{id}) is named with its version, and nothing is restored", async () => {
    const w = await world();
    const id = await listed(w);
    const after = await daemon(w, fakeRelay({ prepared: noRoute, health: healthOf("0.2.4") }));
    assert.deepEqual(after.report.dropped, [{ prepared_id: id, reason: "relay_too_old", detail: "0.2.4" }]);
    assert.match(after.rig.t.stderr.text(), /the relay reports version 0\.2\.4, which predates GET \/v1\/prepared\/\{id\} \(relay 0\.3\.0 or later\)\. Prepare it again\./);
    assert.equal(after.rig.inbox.get(id), undefined);
  });

  it("a current relay's not_found stays not_found; not_implemented, a failure and a throw are relay_error", async () => {
    for (const [answers, expected] of [
      [{ prepared: noRoute, health: healthOf("0.3.0") }, { reason: "not_found", detail: null }],
      [{ prepared: { ok: false, status: 501, error: { code: "not_implemented", message: "no handler" } } as RelayResult<unknown>, health: healthOf("0.3.1") }, { reason: "relay_error", detail: "not_implemented" }],
      [{ prepared: { ok: false, status: 422, error: { code: "precondition_failed", message: "not running", details: { reason: "local_relay_not_started" } } } as RelayResult<unknown> }, { reason: "relay_error", detail: "local_relay_not_started" }],
      [{ prepared: { ok: false, status: 0, error: { code: "internal", message: "timeout" } } as RelayResult<unknown> }, { reason: "relay_error", detail: "internal" }],
      [{ prepared: "throw" as const }, { reason: "relay_error", detail: "client_error" }],
      [{ prepared: { ok: false, status: 409, error: { code: "prepared_used", message: "sending", details: { state: "sending" } } } as RelayResult<unknown> }, { reason: "ambiguous", detail: "sending" }],
    ] as const) {
      const back = await readBack(fakeRelay(answers), "00112233445566778899aabbccddeeff");
      assert.deepEqual(back, { ok: false, ...expected }, JSON.stringify(answers));
    }
  });

  it("an unusable list is reported, restores nothing, and is replaced at the next save", async () => {
    const w = await world();
    await mkdir(w.cockpit, { recursive: true, mode: 0o700 });
    await writeFile(join(w.cockpit, INBOX_JOURNAL_FILE), "{not json", { mode: 0o600 });
    const after = await daemon(w);
    assert.deepEqual(after.report, { journal: "unusable", restored: [], dropped: [] });
    assert.ok(after.rig.t.audit.some((record) => record.ev === "schema.violation" && record.code === "inbox_journal_invalid"));
    assert.match(after.rig.t.stderr.text(), /inbox-ids\.json could not be used \(invalid\); no inbox item is restored, and the file is replaced\./);
    await stopRig(after.rig);
    assert.deepEqual(await journalOf(w), { v: 1, items: [] });
  });
});
