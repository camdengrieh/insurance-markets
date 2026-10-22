import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Collector } from "../../recorder/collector.js";
import { PoliteClient } from "../../recorder/http.js";
import { RecorderStore } from "../../recorder/store.js";
import type { Target } from "../../recorder/types.js";
import { seededRandom } from "../../recorder/clock.js";
import { HOSTILE, cond, market, startWorld, tempDir, totalSeen, T0, type MarketSpec, type World } from "./helpers.js";
import { ALL_RECORDABLE_HOSTS } from "../../recorder/allowlist.js";

const H = 3_600_000;
const DAY = 24 * H;
const worlds: World[] = [];
after(async () => {
  for (const w of worlds) await w.close();
});

interface Rig {
  readonly world: World;
  readonly store: RecorderStore;
  readonly collector: Collector;
  readonly client: PoliteClient;
}

async function rig(specs: MarketSpec[], overrides: Record<string, unknown> = {}, dbPath = ":memory:"): Promise<Rig> {
  const world = await startWorld(specs);
  worlds.push(world);
  const config = world.config({ dbPath, ...overrides });
  const store = RecorderStore.open(dbPath);
  store.startRun(world.clock.nowMs(), "test", "cfg");
  const targets: Target[] = specs.map((m) => ({ key: `${m.venue}:${m.id}`, venue: m.venue, marketId: m.id, closeHintMs: null }));
  store.syncTargets(targets, [], []);
  const client = new PoliteClient({
    config,
    clock: world.clock,
    rng: seededRandom(7),
    onEvent: (k, h, d) => store.event(world.clock.nowMs(), k, h, null, d),
  });
  return { world, store, client, collector: new Collector({ store, client, clock: world.clock, config }) };
}

// Condition ids derived from a label (the shared XO and Polymarket parsers accept only 32-byte hex ids).
const A1 = cond("a1");
const A2 = cond("a2");
const B1 = cond("b1");
const B2 = cond("b2");
const B3 = cond("b3");
const FAR = cond("far");
const NEAR = cond("near");
const xo = (id: string, extra: Partial<MarketSpec> = {}): MarketSpec => market("xo", id, { fee: "600", ...extra });
const poly = (id: string, extra: Partial<MarketSpec> = {}): MarketSpec => market("polymarket", id, { fee: "0.04", ...extra });

test("first tick resolves each market and records one book; a second tick right after does nothing", async () => {
  const r = await rig([xo(A1), poly(B1), market("limitless", "slug-1")]);
  try {
    const s1 = await r.collector.tick();
    assert.equal(s1.due, 3);
    assert.equal(s1.resolvesOk, 3);
    assert.equal(s1.booksOk, 3);
    assert.equal(r.store.counts()["snapshots"], 3);
    assert.equal(r.store.counts()["market_state"], 3);
    const before = totalSeen(r.world);
    const s2 = await r.collector.tick();
    assert.equal(s2.due, 0);
    assert.equal(totalSeen(r.world), before, "no request when nothing is due");
    const snap = r.store.snapshots(`xo:${A1}`)[0];
    assert.equal(snap?.bestBid, "0.4");
    assert.equal(snap?.bestAsk, "0.42");
    assert.equal(snap?.venueTsMs, T0);
    assert.equal(r.store.snapshots("limitless:slug-1")[0]?.bestBid, "0.4");
    assert.equal(r.store.marketStates(`polymarket:${B1}`)[0]?.fee.params["rate"], "0.04");
    // host stats were flushed
    assert.ok(r.store.hostTotals().length >= 4);
  } finally {
    r.store.close();
  }
});

test("cadence: hourly for far markets, every five minutes for short-dated ones", async () => {
  const soon = new Date(T0 + 2 * DAY).toISOString();
  const r = await rig([xo(FAR), xo(NEAR, { closeIso: soon })]);
  try {
    await r.collector.tick();
    for (let i = 0; i < 12; i += 1) {
      r.world.clock.advance(300_000);
      await r.collector.tick();
    }
    assert.equal(r.store.snapshots(`xo:${NEAR}`).length, 13);
    assert.equal(r.store.snapshots(`xo:${FAR}`).length, 2, "one at the start and one after the hour");
    assert.equal(r.store.events("gap").length, 0);
  } finally {
    r.store.close();
  }
});

test("resumable: a restart on the same database continues on schedule without a burst", async () => {
  const dir = tempDir();
  try {
    const path = join(dir.path, "r.sqlite");
    const a = await rig([xo(A1)], {}, path);
    await a.collector.tick();
    a.store.endRun(a.world.clock.nowMs(), "signal");
    a.store.close();
    // New process: same database, clock moved on by ten minutes.
    const world = a.world;
    world.clock.advance(10 * 60_000);
    const config = world.config({ dbPath: path });
    const store = RecorderStore.open(path);
    store.startRun(world.clock.nowMs(), "test", "cfg");
    const client = new PoliteClient({ config, clock: world.clock, rng: seededRandom(1) });
    const c2 = new Collector({ store, client, clock: world.clock, config });
    const seen = totalSeen(world);
    const s = await c2.tick();
    assert.equal(s.due, 0, "the hourly book is not due yet");
    assert.equal(totalSeen(world), seen);
    world.clock.advance(51 * 60_000);
    const s2 = await c2.tick();
    assert.equal(s2.booksOk, 1);
    assert.equal(store.snapshots(`xo:${A1}`).length, 2);
    assert.equal(store.events("gap").length, 0);
    store.close();
  } finally {
    dir.remove();
  }
});

test("a long outage is logged as a gap with both ends, and collection resumes", async () => {
  const r = await rig([xo(A1)]);
  try {
    await r.collector.tick();
    r.world.clock.advance(5 * H);
    await r.collector.tick();
    const gaps = r.store.events("gap");
    assert.equal(gaps.length, 1);
    assert.match(gaps[0]?.detail ?? "", /^from=\d+ to=\d+ missed_ms=18000000$/);
    assert.equal(r.store.snapshots(`xo:${A1}`).length, 2);
  } finally {
    r.store.close();
  }
});

test("one host failing backs off and does not stop the others", async () => {
  const r = await rig([xo(A1), poly(B1)], { backoff: { baseMs: 1000, maxMs: 4000, factor: 2, jitter: 0, maxAttempts: 2 }, breaker: { failures: 50, cooldownMs: 1000 } });
  try {
    const clob = r.world.hosts["clob.polymarket.com"];
    assert.ok(clob);
    clob.handler = () => ({ status: 429, headers: { "Retry-After": "3" }, body: {} });
    const s = await r.collector.tick();
    assert.equal(s.booksOk, 1, "XO still recorded");
    assert.equal(s.booksFailed, 1);
    assert.ok(r.store.events("backoff").some((e) => e.host === "clob.polymarket.com"));
    assert.ok(r.store.events("book_failed").length === 1);
    assert.equal(r.store.snapshots(`polymarket:${B1}`).length, 0);
    assert.ok(r.store.hostTotals().find((h) => h.host === "clob.polymarket.com")?.throttled ?? 0 >= 1);
  } finally {
    r.store.close();
  }
});

test("a repeatedly failing host trips the breaker and later calls are skipped, not sent", async () => {
  const specs = [poly(B1), poly(B2), poly(B3)];
  const r = await rig(specs, { backoff: { baseMs: 1000, maxMs: 4000, factor: 2, jitter: 0, maxAttempts: 1 }, breaker: { failures: 2, cooldownMs: 3_600_000 } });
  try {
    const gamma = r.world.hosts["gamma-api.polymarket.com"];
    assert.ok(gamma);
    gamma.handler = () => ({ status: 500, body: {} });
    const s = await r.collector.tick();
    assert.equal(s.resolvesFailed, 3);
    assert.equal(gamma.seen.length, 2, "the third market was not even tried");
    assert.equal(r.store.events("breaker_open").length, 1);
    assert.ok(s.deferred >= 1);
  } finally {
    r.store.close();
  }
});

test("a missing book (404) is logged and retried on the next interval, not hammered", async () => {
  const r = await rig([xo(A1, { bookStatus: 404 })]);
  try {
    await r.collector.tick();
    assert.equal(r.store.events("book_failed")[0]?.detail, "reason=http_error status=404");
    const seen = totalSeen(r.world);
    r.world.clock.advance(60_000);
    await r.collector.tick();
    assert.equal(totalSeen(r.world), seen, "not retried before the interval");
    r.world.markets.get(`xo:${A1}`)!.bookStatus = undefined;
    r.world.clock.advance(H);
    await r.collector.tick();
    assert.equal(r.store.snapshots(`xo:${A1}`).length, 1);
  } finally {
    r.store.close();
  }
});

test("a closed market is retired: no further requests for it", async () => {
  const r = await rig([xo(A1, { status: "resolved" }), xo(A2)]);
  try {
    await r.collector.tick();
    assert.equal(r.store.events("retired").length, 1);
    assert.equal(r.store.snapshots(`xo:${A1}`).length, 0, "no book for a resolved market");
    const seen = r.world.hosts["api-mainnet.xo.market"]!.seen.filter((q) => q.path.endsWith(A1)).length;
    r.world.clock.advance(3 * DAY);
    await r.collector.tick();
    assert.equal(r.world.hosts["api-mainnet.xo.market"]!.seen.filter((q) => q.path.endsWith(A1)).length, seen);
  } finally {
    r.store.close();
  }
});

test("polling stops after close plus the grace period", async () => {
  const close = new Date(T0 + 2 * H).toISOString();
  const r = await rig([xo(A1, { closeIso: close })]);
  try {
    await r.collector.tick();
    r.world.clock.advance(2 * H + 7 * H);
    const seen = totalSeen(r.world);
    const s = await r.collector.tick();
    assert.equal(s.due, 0);
    assert.equal(totalSeen(r.world), seen);
  } finally {
    r.store.close();
  }
});

test("clock skew is logged from the Date header and warned about when large", async () => {
  const r = await rig([xo(A1)]);
  try {
    r.world.hosts["orderbooks.xo.market"]!.handler = (_q, _u) => ({
      body: { bids: [{ price: "0.4", size: "1" }], asks: [{ price: "0.42", size: "1" }], timestamp: String(T0) },
      headers: { Date: new Date(T0 - 20_000).toUTCString() },
    });
    await r.collector.tick();
    const skews = r.store.skews();
    assert.ok(skews.length >= 1);
    const book = skews.find((k) => k.host === "orderbooks.xo.market");
    assert.ok(book && book.skewEstMs >= 19_000 && book.skewEstMs <= 21_500, `skew ${book?.skewEstMs}`);
    assert.equal(r.store.events("skew").length, 1);
    assert.match(r.store.events("skew")[0]?.detail ?? "", /beyond 1500 ms/);
  } finally {
    r.store.close();
  }
});

test("a clock that runs backwards never writes an out-of-order row", async () => {
  const r = await rig([xo(A1)]);
  try {
    await r.collector.tick();
    r.world.clock.advance(2 * H);
    await r.collector.tick();
    r.world.clock.set(T0 + 30 * 60_000);
    // Force the target due again by pretending its last book is old.
    const st = r.store.targetStates().get(`xo:${A1}`);
    assert.ok(st);
    r.store.saveTargetState({ ...st, lastBookMs: T0 - 5 * H });
    await r.collector.tick();
    assert.equal(r.store.events("clock_regress").length, 1);
    assert.deepEqual(r.store.snapshots(`xo:${A1}`).map((s) => s.observedMs), [T0, T0 + 2 * H]);
  } finally {
    r.store.close();
  }
});

test("the per-host hourly budget defers work; nothing exceeds it", async () => {
  const specs = Array.from({ length: 6 }, (_, i) => xo(cond(`m${i}`)));
  const r = await rig(specs, { hostBudgets: { "orderbooks.xo.market": { rps: 2, burst: 2, maxPerHour: 3 } } });
  try {
    const s = await r.collector.tick();
    assert.equal(r.world.hosts["orderbooks.xo.market"]!.seen.length, 3);
    assert.equal(s.booksOk, 3);
    assert.ok(s.deferred >= 3);
    assert.ok(r.store.events("budget").length >= 1);
    r.world.clock.advance(H + 1);
    await r.collector.tick();
    assert.ok(r.world.hosts["orderbooks.xo.market"]!.seen.length > 3, "the rest follows once the window rolls");
  } finally {
    r.store.close();
  }
});

test("third-party text never reaches the database: hostile titles are not stored", async () => {
  const dir = tempDir();
  try {
    const path = join(dir.path, "r.sqlite");
    const r = await rig([xo(A1, { title: HOSTILE }), poly(B1, { title: HOSTILE }), market("limitless", "slug-1", { title: HOSTILE })], {}, path);
    await r.collector.tick();
    r.store.close();
    let bytes = "";
    for (const f of readdirSync(dir.path)) bytes += readFileSync(join(dir.path, f)).toString("latin1");
    assert.equal(bytes.includes("IGNORE PREVIOUS"), false);
    assert.equal(bytes.includes("SEND FUNDS"), false);
    // and no personal identifiers either
    assert.equal(bytes.includes(homedir()), false);
    const name = userInfo().username;
    if (name.length >= 4) assert.equal(bytes.toLowerCase().includes(name.toLowerCase()), false);
  } finally {
    dir.remove();
  }
});

test("only allowlisted hosts are ever contacted", async () => {
  const r = await rig([xo(A1), poly(B1), market("limitless", "s")]);
  try {
    await r.collector.tick();
    const hosts = [...r.client.counters().keys()];
    for (const h of hosts) assert.ok(ALL_RECORDABLE_HOSTS.includes(h), h);
    for (const f of Object.values(r.world.hosts)) for (const q of f.seen) assert.equal(q.method, "GET");
  } finally {
    r.store.close();
  }
});

test("a full disk budget pauses collection instead of writing", async () => {
  const r = await rig([xo(A1)], { maxDbBytes: 1_000_000 });
  try {
    const cfg = r.world.config({ maxDbBytes: 1_000_000 });
    const tiny = new Collector({ store: r.store, client: r.client, clock: r.world.clock, config: { ...cfg, maxDbBytes: 1 } });
    const s = await tiny.tick();
    assert.equal(s.stoppedEarly, true);
    assert.equal(r.store.events("disk_cap").length, 1);
    assert.equal(r.store.counts()["snapshots"], 0);
  } finally {
    r.store.close();
  }
});

test("retention runs once a day inside the loop and keeps recent data", async () => {
  const r = await rig([xo(A1)], { retentionDays: 7, intervalSec: 3600 });
  try {
    await r.collector.tick();
    for (let d = 0; d < 9; d += 1) {
      r.world.clock.advance(DAY);
      await r.collector.tick();
    }
    const times = r.store.snapshots(`xo:${A1}`).map((s) => s.observedMs);
    assert.ok(Math.min(...times) >= r.world.clock.nowMs() - 7 * DAY - DAY, "old rows are gone");
    assert.ok(r.store.events("prune").length >= 1);
    assert.equal(r.store.verify().ok, true);
  } finally {
    r.store.close();
  }
});

test("run() exits at once when aborted and 'once' does a single tick", async () => {
  const r = await rig([xo(A1)]);
  try {
    const ac = new AbortController();
    await r.collector.run(ac.signal, true);
    assert.equal(r.store.snapshots(`xo:${A1}`).length, 1);
    ac.abort();
    await r.collector.run(ac.signal);
    assert.equal(r.store.snapshots(`xo:${A1}`).length, 1);
  } finally {
    r.store.close();
  }
});

test("TC-2: when the registry terms go stale the recorder stops collecting, and says so once", async () => {
  // A long retention window, so the 400-day jump does not prune the first snapshot away.
  const r = await rig([xo(A1)], { retentionDays: 1000 });
  try {
    const s1 = await r.collector.tick();
    assert.equal(s1.due, 1);
    assert.equal(r.store.counts()["snapshots"], 1);
    // 400 days later the bundled terms are past their TTL: restricted, memory-only.
    r.world.clock.set(T0 + 400 * DAY);
    const seen = totalSeen(r.world);
    const s2 = await r.collector.tick();
    assert.equal(s2.due, 0);
    assert.equal(totalSeen(r.world), seen, "no request is made for a venue whose terms are not fresh");
    assert.equal(r.store.counts()["snapshots"], 1);
    assert.equal(r.store.events("refused").length, 3, "one event per configured venue");
    r.world.clock.advance(3 * H);
    await r.collector.tick();
    assert.equal(r.store.events("refused").length, 3, "logged once per venue, not on every tick");
    assert.equal(r.store.counts()["snapshots"], 1);
  } finally {
    r.store.close();
  }
});
