import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { RecorderStore, safeDetail } from "../../recorder/store.js";
import type { SnapshotRow } from "../../recorder/types.js";
import { tempDir } from "./helpers.js";

const DAY = 86_400_000;
function snap(tMs: number, key = "xo:m1"): SnapshotRow {
  return {
    targetKey: key,
    venue: "xo",
    marketId: "m1",
    tokenId: "tok",
    observedMs: tMs,
    reqStartMs: tMs - 5,
    venueTsMs: tMs - 100,
    bookHash: "abcdef0123456789",
    bids: [["0.4", "10"]],
    asks: [["0.42", "5"]],
    nBids: 1,
    nAsks: 1,
    bestBid: "0.4",
    bestAsk: "0.42",
    flags: [],
    tick: "0.001",
  };
}

test("round trip, checksums and the integrity check", () => {
  const store = RecorderStore.open(":memory:");
  try {
    store.startRun(1000, "once", "cfg");
    store.insertSnapshot(snap(2000));
    store.insertSnapshot({ ...snap(3000), flags: ["crossed"] });
    store.insertMarketState({ targetKey: "xo:m1", venue: "xo", marketId: "m1", observedMs: 2000, tokenId: "tok", status: "active", closeMs: 9000, accepting: true, tick: "0.001", fee: { model: "xo_effective", params: { takerBps: "600" } } });
    store.insertSkew(2000, "orderbooks.xo.market", 1990, 2010, 2000, -3);
    store.insertHostStats(2000, "orderbooks.xo.market", { requests: 3, ok: 2, errors: 1, throttled: 0, backoffMs: 500 });
    const rows = store.snapshots("xo:m1");
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1]?.flags, ["crossed"]);
    assert.deepEqual(rows[0]?.bids, [["0.4", "10"]]);
    assert.equal(store.marketStates("xo:m1")[0]?.fee.params["takerBps"], "600");
    const v = store.verify();
    assert.equal(v.ok, true);
    assert.equal(v.integrity, "ok");
    assert.equal(v.checked["snapshots"], 2);
  } finally {
    store.close();
  }
});

test("append-only: updates and out-of-window deletes are refused", () => {
  const store = RecorderStore.open(":memory:");
  try {
    store.startRun(1000, "once", "cfg");
    store.insertSnapshot(snap(2000));
    assert.throws(() => store.rawExec("UPDATE snapshots SET best_bid = '0.99'"), /update refused/);
    assert.throws(() => store.rawExec("DELETE FROM snapshots"), /delete refused/);
    assert.throws(() => store.rawExec("UPDATE events SET detail = 'x'"), /update refused/);
    store.insertMarketState({ targetKey: "xo:m1", venue: "xo", marketId: "m1", observedMs: 2000, tokenId: "tok", status: "active", closeMs: null, accepting: null, tick: null, fee: { model: "unknown", params: {} } });
    assert.throws(() => store.rawExec("DELETE FROM market_state"), /delete refused/);
    assert.equal(store.snapshots("xo:m1").length, 1);
  } finally {
    store.close();
  }
});

test("verify detects a row altered behind the tool's back", () => {
  const store = RecorderStore.open(":memory:");
  try {
    store.startRun(1000, "once", "cfg");
    store.insertSnapshot(snap(2000));
    store.insertSnapshot(snap(3000));
    store.rawExec("DROP TRIGGER snapshots_no_update");
    store.rawExec("UPDATE snapshots SET best_ask = '0.01' WHERE observed_ms = 3000");
    const v = store.verify();
    assert.equal(v.ok, false);
    assert.deepEqual(v.mismatches.map((m) => m.table), ["snapshots"]);
  } finally {
    store.close();
  }
});

test("retention deletes only data older than the cutoff and logs it", () => {
  const store = RecorderStore.open(":memory:");
  try {
    store.startRun(1000, "once", "cfg");
    for (const d of [1, 10, 20, 50]) store.insertSnapshot(snap(d * DAY));
    const removed = store.prune(60 * DAY, 15 * DAY);
    assert.equal(removed["snapshots"], 2);
    assert.deepEqual(store.snapshots("xo:m1").map((s) => s.observedMs / DAY), [20, 50]);
    assert.ok(store.events("prune").length === 1);
    assert.throws(() => store.rawExec("DELETE FROM snapshots"), /delete refused/, "the retention window closes again");
    assert.equal(store.verify().ok, true);
  } finally {
    store.close();
  }
});

test("a run that never ended is reported on the next start", () => {
  const dir = tempDir();
  try {
    const path = join(dir.path, "r.sqlite");
    const a = RecorderStore.open(path);
    a.startRun(1000, "run", "cfg");
    a.close();
    const b = RecorderStore.open(path);
    b.startRun(5000, "run", "cfg");
    assert.equal(b.events("unclean_previous_run").length, 1);
    b.endRun(6000, "completed");
    assert.equal(b.runs().length, 2);
    b.close();
    assert.ok(existsSync(path));
  } finally {
    dir.remove();
  }
});

test("event text is reduced to a safe vocabulary and length", () => {
  const d = safeDetail(`line1\nline2 <script>${"x".repeat(500)}`);
  assert.equal(d.includes("\n"), false);
  assert.ok(d.length <= 200);
  const store = RecorderStore.open(":memory:");
  try {
    store.event(1, "error", null, null, "\u0000\u001b[31m hostile ‮ text");
    assert.match(store.events()[0]?.detail ?? "", /^[\x20-\x7e]*$/);
  } finally {
    store.close();
  }
});

test("an unknown schema version is refused", () => {
  const dir = tempDir();
  try {
    const path = join(dir.path, "r.sqlite");
    const a = RecorderStore.open(path);
    a.setMeta("schema_version", "99");
    a.close();
    assert.throws(() => RecorderStore.open(path), /unsupported recorder schema version/);
    writeFileSync(join(dir.path, "junk"), "x");
  } finally {
    dir.remove();
  }
});

test("a store without a run refuses to write data rows", () => {
  const store = RecorderStore.open(":memory:");
  try {
    assert.throws(() => store.insertSnapshot(snap(1)), /no run is open/);
  } finally {
    store.close();
  }
});
