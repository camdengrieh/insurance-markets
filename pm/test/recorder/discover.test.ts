// Discovery tests. Inputs are REAL public responses captured from the XO Data API and the
// Polymarket Gamma API on 2026-10-20 and trimmed (see fixtures/PROVENANCE.txt); they are replayed
// by loopback servers, so nothing here can reach a real host.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { PoliteClient } from "../../recorder/http.js";
import { buildDryRun } from "../../recorder/plan.js";
import { DEFAULT_DISCOVER, MAX_GROUP_SIZE, cachePathFor, discover, dryDiscoverLines, estimateBytesPerDay, projectLoad } from "../../recorder/discover.js";
import { ensureWritableDir, runCli, type CliIo } from "../../recorder/main.js";
import { RecorderStore } from "../../recorder/store.js";
import { targetsFromFile } from "../../recorder/targets.js";
import { startWorld, tempDir, T0, type Handler, type World } from "./helpers.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const readFix = (name: string): unknown => JSON.parse(readFileSync(join(FIX, name), "utf8")) as unknown;

interface Lookup {
  path: string;
  status: number;
  body: unknown;
}
const XO_LIST = readFix("xo-markets-list.json") as { data: Record<string, unknown>[]; meta: Record<string, unknown> };
const XO_LOOKUPS = readFix("xo-market-lookups.json") as Lookup[];
const POLY_EVENTS = readFix("polymarket-events.json") as Record<string, unknown>[];

const worlds: World[] = [];
after(async () => {
  for (const w of worlds) await w.close();
});

interface Replay {
  xoList: () => unknown;
  poly: () => unknown;
  xoFail: boolean;
  polyFail: boolean;
}

// The replay: the captured list page (the capture holds nine of the 235 rows, so the page says it is the last), the
// captured by-slug and by-contract answers (any other path gets XO's own 404 shape), and the captured events page.
async function replayWorld(over: Partial<Replay> = {}): Promise<{ world: World; replay: Replay }> {
  const world = await startWorld([]);
  worlds.push(world);
  const replay: Replay = {
    xoList: () => ({ data: XO_LIST.data, meta: { ...XO_LIST.meta, page: 1, take: 50, itemCount: XO_LIST.data.length, pageCount: 1, hasNextPage: false } }),
    poly: () => POLY_EVENTS,
    xoFail: false,
    polyFail: false,
    ...over,
  };
  const notFound = XO_LOOKUPS.find((l) => l.status === 404)!.body;
  const xo: Handler = (_r, u) => {
    if (replay.xoFail) return { status: 500, body: {} };
    if (u.pathname === "/api/markets") {
      assert.equal(u.searchParams.get("marketType"), "2");
      assert.equal(u.searchParams.get("statuses"), "ACTIVE");
      return u.searchParams.get("page") === "1" ? { body: replay.xoList() } : { body: { data: [], meta: { ...XO_LIST.meta, hasNextPage: false } } };
    }
    const hit = XO_LOOKUPS.find((l) => l.path === u.pathname);
    return hit === undefined ? { status: 404, body: notFound } : { status: hit.status, body: hit.body };
  };
  const poly: Handler = (_r, u) => {
    if (replay.polyFail) return { status: 500, body: {} };
    // Collection also asks Gamma for market state; the capture holds none, and Gamma answers an unknown id with [].
    if (u.pathname !== "/events") return { body: [] };
    assert.equal(u.searchParams.get("active"), "true");
    return u.searchParams.get("offset") === "0" ? { body: replay.poly() } : { body: [] };
  };
  world.hosts["api-mainnet.xo.market"]!.handler = xo;
  world.hosts["gamma-api.polymarket.com"]!.handler = poly;
  return { world, replay };
}

function client(world: World, signal?: AbortSignal): { client: PoliteClient; config: ReturnType<World["config"]> } {
  const config = world.config();
  return { client: new PoliteClient({ config, clock: world.clock, rng: () => 0.5, ...(signal === undefined ? {} : { signal }) }), config };
}

const seenOn = (w: World, host: string): number => w.hosts[host]!.seen.length;

test("XO: active CLOB markets are grouped by rootEventSlug, stale list slugs fall back to the contract route, exhaustive is always unknown", async () => {
  const { world } = await replayWorld();
  const dir = tempDir();
  try {
    const out = join(dir.path, "targets.json");
    const { client: c, config } = client(world);
    const r = await discover({ config, client: c, clock: world.clock, outPath: out });
    assert.equal(r.ok, true, r.lines.join("\n"));
    const file = JSON.parse(readFileSync(out, "utf8")) as { groups: { groupId: string; venue: string; exhaustive: string; marketIds: string[] }[]; markets: { venue: string; marketId: string }[] };
    const xo = file.groups.filter((g) => g.venue === "xo");
    // Two football matches (three markets each; one market per match needs the contract fallback) and one two-market event.
    assert.deepEqual(xo.map((g) => g.marketIds.length).sort(), [2, 3, 3]);
    assert.ok(file.groups.every((g) => g.exhaustive === "unknown"), "never inferred");
    assert.ok(xo.every((g) => /^xo-evt-[0-9a-f]{16}$/.test(g.groupId)));
    // A one-market event is not a group: it is recorded as a single market.
    assert.equal(file.markets.filter((m) => m.venue === "xo").length, 1);
    // 9 listing rows: 1 list + (1+1+3) + (1+3+1) + (1+3) + 1 lookups.
    assert.equal(seenOn(world, "api-mainnet.xo.market"), 16);
    // The group ids and the file hold ids only: no slug text and no title.
    const text = readFileSync(out, "utf8");
    assert.equal(/stuttgart|liverpool|villarreal|taiko|zksync|premier|shutdown/i.test(text), false);
    assert.equal(/stuttgart|liverpool|villarreal|taiko|zksync|premier|shutdown/i.test(readFileSync(cachePathFor(out), "utf8")), false);
    // The loader accepts what discovery wrote.
    assert.ok(targetsFromFile(text).ok);
    // Atomic write: no temp file is left behind.
    assert.deepEqual(readdirSync(dir.path).filter((f) => f.endsWith(".tmp")), []);
    // Only the XO data host and Gamma were touched; no book host.
    assert.equal(seenOn(world, "orderbooks.xo.market") + seenOn(world, "clob.polymarket.com") + seenOn(world, "api.limitless.exchange"), 0);
  } finally {
    dir.remove();
  }
});

test("every request is a plain GET with the fixed User-Agent and nothing else", async () => {
  const { world } = await replayWorld();
  const dir = tempDir();
  try {
    const { client: c, config } = client(world);
    await discover({ config, client: c, clock: world.clock, outPath: join(dir.path, "t.json") });
    const all = Object.values(world.hosts).flatMap((h) => h.seen);
    assert.ok(all.length > 10);
    for (const q of all) {
      assert.equal(q.method, "GET");
      assert.equal(q.headers["user-agent"], "insurance-markets-research/0.1");
      assert.equal(q.headers["authorization"], undefined);
      assert.equal(q.headers["cookie"], undefined);
      assert.equal(q.headers["content-length"], undefined);
    }
  } finally {
    dir.remove();
  }
});

test("the lookup cache means a second run costs only the listing requests", async () => {
  const { world } = await replayWorld();
  const dir = tempDir();
  try {
    const out = join(dir.path, "t.json");
    const { client: c, config } = client(world);
    const a = await discover({ config, client: c, clock: world.clock, outPath: out });
    const first = readFileSync(out, "utf8");
    const xoBefore = seenOn(world, "api-mainnet.xo.market");
    const b = await discover({ config, client: c, clock: world.clock, outPath: out });
    assert.equal(seenOn(world, "api-mainnet.xo.market") - xoBefore, 1, "one list page, no lookups");
    assert.equal(readFileSync(out, "utf8"), first, "the same input gives the same file");
    assert.ok(a.requests > b.requests);
  } finally {
    dir.remove();
  }
});

test("Polymarket: neg-risk events become groups of their tradable markets, other events give a few single markets", async () => {
  const { world } = await replayWorld();
  const dir = tempDir();
  try {
    const out = join(dir.path, "t.json");
    const { client: c, config } = client(world);
    await discover({ config, client: c, clock: world.clock, outPath: out });
    const file = JSON.parse(readFileSync(out, "utf8")) as { groups: { groupId: string; venue: string; exhaustive: string; marketIds: string[] }[]; markets: { venue: string; marketId: string }[] };
    const pm = file.groups.filter((g) => g.venue === "polymarket");
    // Two small neg-risk events and the large one: its 45 tradable markets of 70 captured.
    assert.deepEqual(pm.map((g) => g.marketIds.length).sort((a, b) => a - b), [5, 5, 45]);
    assert.ok(pm.every((g) => /^pm-nr-[0-9a-f]{16}$/.test(g.groupId) && g.exhaustive === "unknown"));
    assert.ok(pm.flatMap((g) => g.marketIds).every((id) => /^0x[0-9a-f]{64}$/.test(id)));
    // The non-neg-risk event contributes its four captured markets.
    assert.equal(file.markets.filter((m) => m.venue === "polymarket").length, 4);
    assert.equal(seenOn(world, "gamma-api.polymarket.com"), 1, "the first page held fewer events than the page size");
  } finally {
    dir.remove();
  }
});

test("a neg-risk event with more tradable markets than a group may hold is skipped, not truncated", async () => {
  const big = structuredClone(POLY_EVENTS) as { markets: Record<string, unknown>[]; negRisk?: boolean }[];
  const french = big.find((e) => e.markets.length === 70)!;
  for (const m of french.markets) {
    m["active"] = true;
    m["closed"] = false;
    m["acceptingOrders"] = true;
  }
  assert.ok(french.markets.length > MAX_GROUP_SIZE);
  const { world } = await replayWorld({ poly: () => big });
  const dir = tempDir();
  try {
    const out = join(dir.path, "t.json");
    const { client: c, config } = client(world);
    const r = await discover({ config, client: c, clock: world.clock, outPath: out });
    assert.match(r.lines.join("\n"), /exceeds the group limit/);
    const file = JSON.parse(readFileSync(out, "utf8")) as { groups: { venue: string; marketIds: string[] }[] };
    assert.ok(file.groups.every((g) => g.marketIds.length <= MAX_GROUP_SIZE));
    assert.equal(file.groups.filter((g) => g.venue === "polymarket").length, 2);
  } finally {
    dir.remove();
  }
});

test("a market that lists No first, or is not accepting orders, is not offered", async () => {
  const events = structuredClone(POLY_EVENTS) as { markets: Record<string, unknown>[] }[];
  const small = events.find((e) => e.markets.length === 4)!;
  small.markets[0]!["outcomes"] = JSON.stringify(["No", "Yes"]);
  small.markets[1]!["acceptingOrders"] = false;
  const { world } = await replayWorld({ poly: () => events });
  const dir = tempDir();
  try {
    const out = join(dir.path, "t.json");
    const { client: c, config } = client(world);
    await discover({ config, client: c, clock: world.clock, outPath: out });
    const file = JSON.parse(readFileSync(out, "utf8")) as { markets: { venue: string; marketId: string }[] };
    assert.equal(file.markets.filter((m) => m.venue === "polymarket").length, 2);
  } finally {
    dir.remove();
  }
});

test("the generated set fits every host budget with headroom, the all-short worst case, and the disk estimate", async () => {
  const { world } = await replayWorld();
  const dir = tempDir();
  try {
    const out = join(dir.path, "t.json");
    const { client: c, config } = client(world);
    const r = await discover({ config, client: c, clock: world.clock, outPath: out });
    const loaded = targetsFromFile(readFileSync(out, "utf8"));
    assert.ok(loaded.ok);
    if (!loaded.ok) return;
    // The shipped dry-run sees no OVER BUDGET, also not in the worst case.
    const dry = buildDryRun(config, loaded.value.targets, T0);
    assert.equal(dry.lines.join("\n").includes("OVER BUDGET"), false);
    assert.ok(dry.load.every((l) => l.withinBudget && l.worstCaseWithinBudget));
    // projectLoad is the same arithmetic as the dry run (compared with the same close hints).
    const same = projectLoad(config, loaded.value.targets, T0);
    assert.deepEqual(
      same,
      dry.load.map((l) => ({ host: l.host, perHour: l.requestsPerHour, worstCasePerHour: l.worstCasePerHour })),
    );
    for (const p of r.load) {
      const b = config.hostBudgets[p.host]!;
      assert.ok(p.perHour <= b.maxPerHour * DEFAULT_DISCOVER.headroom, `${p.host} ${p.perHour}`);
      assert.ok(p.worstCasePerHour <= b.maxPerHour);
    }
    assert.ok(estimateBytesPerDay(config, loaded.value.targets, T0) * config.retentionDays <= config.maxDbBytes * DEFAULT_DISCOVER.diskFraction);
    // 9 XO + 56 Polymarket markets, 30 + 30 short slots: the short ones are the ones closing within 72 h.
    assert.equal(r.counts.targets, 9 + 5 + 5 + 45 + 4);
  } finally {
    dir.remove();
  }
});

test("a set that would not fit is cut down to fit, lowest priority first", async () => {
  const { world } = await replayWorld();
  const dir = tempDir();
  try {
    const out = join(dir.path, "t.json");
    // A tight Polymarket budget: 20 markets/h of Gamma at 60% headroom leaves room for 12 regular markets.
    const config = world.config({ hostBudgets: { "gamma-api.polymarket.com": { rps: 2, burst: 4, maxPerHour: 40 }, "clob.polymarket.com": { rps: 5, burst: 5, maxPerHour: 15000 } } });
    const c = new PoliteClient({ config, clock: world.clock });
    const r = await discover({ config, client: c, clock: world.clock, outPath: out });
    assert.equal(r.ok, true);
    assert.ok(r.counts.polymarket < 59, `cut to ${r.counts.polymarket}`);
    const loaded = targetsFromFile(readFileSync(out, "utf8"));
    assert.ok(loaded.ok);
    if (loaded.ok) assert.equal(buildDryRun(config, loaded.value.targets, T0).lines.join("\n").includes("OVER BUDGET"), false);
  } finally {
    dir.remove();
  }
});

test("per venue caps apply, and a group is never split", async () => {
  const { world } = await replayWorld();
  const dir = tempDir();
  try {
    const out = join(dir.path, "t.json");
    const { client: c, config } = client(world);
    const r = await discover({ config, client: c, clock: world.clock, outPath: out, options: { maxShortPerVenue: 0, maxRegularPerVenue: 6 } });
    assert.equal(r.ok, true);
    const file = JSON.parse(readFileSync(out, "utf8")) as { groups: { venue: string; marketIds: string[] }[] };
    // The football matches close within 72 h, so a zero short cap removes them whole.
    assert.ok(r.counts.xo <= 6 && r.counts.polymarket <= 6);
    for (const g of file.groups) assert.ok(g.marketIds.length >= 2);
  } finally {
    dir.remove();
  }
});

test("when a venue cannot be read, its part of the previous file is kept; when nothing can, the file is untouched", async () => {
  const { world, replay } = await replayWorld();
  const dir = tempDir();
  try {
    const out = join(dir.path, "t.json");
    const { client: c, config } = client(world);
    await discover({ config, client: c, clock: world.clock, outPath: out });
    const good = JSON.parse(readFileSync(out, "utf8")) as { groups: { venue: string }[] };
    replay.xoFail = true;
    const r = await discover({ config, client: c, clock: world.clock, outPath: out });
    assert.equal(r.ok, true);
    const after1 = JSON.parse(readFileSync(out, "utf8")) as { groups: { venue: string }[] };
    assert.deepEqual(after1.groups.filter((g) => g.venue === "xo").length, good.groups.filter((g) => g.venue === "xo").length);
    replay.polyFail = true;
    const before = readFileSync(out, "utf8");
    // A fresh client so the breaker state of the earlier failures does not matter.
    const c2 = new PoliteClient({ config, clock: world.clock });
    const r2 = await discover({ config, client: c2, clock: world.clock, outPath: out });
    assert.equal(r2.ok, false, "nothing readable: reported, and the previous file is kept");
    assert.equal(readFileSync(out, "utf8"), before);
    // No previous file and nothing readable: nothing is written.
    const empty = join(dir.path, "none.json");
    const r3 = await discover({ config, client: new PoliteClient({ config, clock: world.clock }), clock: world.clock, outPath: empty });
    assert.equal(r3.ok, false);
    assert.equal(existsSync(empty), false);
  } finally {
    dir.remove();
  }
});

test("only allowlisted venues are ever discovered: restricted venues cannot be requested", async () => {
  const { world } = await replayWorld();
  const dir = tempDir();
  try {
    const config = world.config({ venues: ["xo"] });
    const out = join(dir.path, "t.json");
    await discover({ config, client: new PoliteClient({ config, clock: world.clock }), clock: world.clock, outPath: out });
    assert.equal(seenOn(world, "gamma-api.polymarket.com"), 0, "a venue not selected is not contacted");
    const text = readFileSync(out, "utf8");
    assert.equal(/kalshi|quotient/i.test(text), false);
    const lines = dryDiscoverLines(world.config(), DEFAULT_DISCOVER).join("\n");
    assert.equal(/kalshi|quotient|limitless/i.test(lines), false);
  } finally {
    dir.remove();
  }
});

// ---- the command line ----

function io(world: World, extra: Partial<CliIo> = {}): { io: CliIo; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (l) => out.push(l), err: (l) => err.push(l), clock: world.clock, ...extra } };
}

function cfgFile(dir: string, world: World): string {
  const f = join(dir, "cfg.json");
  writeFileSync(f, JSON.stringify({ hostBases: Object.fromEntries(Object.entries(world.hosts).map(([h, x]) => [h, x.base])), backoff: { baseMs: 1000, maxMs: 5000, factor: 2, jitter: 0, maxAttempts: 2 } }));
  return f;
}

test("discover --dry prints the URLs and their count and sends nothing", async () => {
  const { world } = await replayWorld();
  const dir = tempDir();
  try {
    const r = io(world, { fetchImpl: () => Promise.reject(new Error("no network in a dry run")) });
    assert.equal(await runCli(["discover", "--dry", "--targets", join(dir.path, "t.json")], r.io), 0);
    const text = r.out.join("\n");
    assert.match(text, /GET https:\/\/api-mainnet\.xo\.market\/api\/markets\?marketType=2&page=1&sortBy=expiresAt&sortOrder=ASC&statuses=ACTIVE&take=50/);
    assert.match(text, /GET https:\/\/gamma-api\.polymarket\.com\/events\?active=true&ascending=false&closed=false&limit=5&offset=0&order=volume24hr/);
    assert.match(text, /listing requests: 22; lookup requests: at most 300 per run \(cached afterwards\); total at most 322/);
    assert.equal(existsSync(join(dir.path, "t.json")), false);
    assert.equal(Object.values(world.hosts).reduce((a, h) => a + h.seen.length, 0), 0);
  } finally {
    dir.remove();
  }
});

test("discover writes the targets file; dry-run on it shows no OVER BUDGET", async () => {
  const { world } = await replayWorld();
  const dir = tempDir();
  try {
    const out = join(dir.path, "data", "targets.json");
    const r = io(world);
    assert.equal(await runCli(["discover", "--targets", out, "--config", cfgFile(dir.path, world)], r.io), 0, r.err.join("\n"));
    assert.ok(existsSync(out));
    const d = io(world);
    assert.equal(await runCli(["dry-run", "--targets", out, "--config", cfgFile(dir.path, world)], d.io), 0);
    const text = d.out.join("\n");
    assert.equal(text.includes("OVER BUDGET"), false);
    assert.match(text, /projected load per host/);
  } finally {
    dir.remove();
  }
});

test("--discover-every is validated", async () => {
  const { world } = await replayWorld();
  const a = io(world);
  assert.equal(await runCli(["once", "--discover", "--discover-every", "10"], a.io), 2);
  const b = io(world);
  assert.equal(await runCli(["once", "--discover", "--discover-every", "soon"], b.io), 2);
});

test("once --discover builds the targets file on an empty data dir, records, and releases the lock", async () => {
  const { world } = await replayWorld();
  const dir = tempDir();
  try {
    const data = join(dir.path, "new", "data");
    const db = join(data, "recorder.sqlite");
    const targets = join(data, "targets.json");
    const r = io(world);
    assert.equal(await runCli(["once", "--discover", "--db", db, "--targets", targets, "--config", cfgFile(dir.path, world)], r.io), 0, r.err.join("\n"));
    assert.ok(existsSync(targets), "discovery wrote the targets file");
    assert.equal(existsSync(`${db}.lock`), false);
    const store = RecorderStore.open(db);
    try {
      assert.equal(store.targets().length, 9 + 5 + 5 + 45 + 4);
      assert.ok((store.counts()["events"] ?? 0) > 0);
    } finally {
      store.close();
    }
    // A second start finds a fresh file and does not discover again.
    const xoBefore = seenOn(world, "api-mainnet.xo.market");
    const listBefore = world.hosts["gamma-api.polymarket.com"]!.seen.filter((q) => q.path === "/events").length;
    const r2 = io(world);
    assert.equal(await runCli(["once", "--discover", "--db", db, "--targets", targets, "--config", cfgFile(dir.path, world)], r2.io), 0, r2.err.join("\n"));
    assert.equal(world.hosts["gamma-api.polymarket.com"]!.seen.filter((q) => q.path === "/events").length, listBefore);
    assert.ok(seenOn(world, "api-mainnet.xo.market") >= xoBefore, "collection still reads state");
    assert.equal(world.hosts["api-mainnet.xo.market"]!.seen.filter((q) => q.path === "/api/markets").length, 1, "no second listing");
  } finally {
    dir.remove();
  }
});

test("RECORDER_DB and RECORDER_TARGETS are defaults for --db and --targets", async () => {
  const { world } = await replayWorld();
  const dir = tempDir();
  try {
    const out = join(dir.path, "t.json");
    const r = io(world, { env: { RECORDER_TARGETS: out } });
    assert.equal(await runCli(["discover", "--config", cfgFile(dir.path, world)], r.io), 0, r.err.join("\n"));
    assert.ok(existsSync(out));
    const db = join(dir.path, "x.sqlite");
    const s = io(world, { env: { RECORDER_DB: db } });
    assert.equal(await runCli(["status"], s.io), 2, "the database named by the environment does not exist");
    assert.match(s.err.join("\n"), /database not found/);
  } finally {
    dir.remove();
  }
});

test("the data directory is created, and a directory that cannot be written is refused", async () => {
  const dir = tempDir();
  try {
    const made = join(dir.path, "a", "b");
    assert.equal(ensureWritableDir(made), null);
    assert.ok(statSync(made).isDirectory());
    assert.deepEqual(readdirSync(made), [], "the probe file is removed");
    // A regular file where the directory should be.
    const blocker = join(dir.path, "file");
    writeFileSync(blocker, "x");
    assert.match(ensureWritableDir(join(blocker, "sub")) ?? "", /cannot be created or written/);
    const { world } = await replayWorld();
    const r = io(world);
    assert.equal(await runCli(["once", "--discover", "--db", join(blocker, "sub", "r.sqlite"), "--targets", join(dir.path, "t.json")], r.io), 2);
    assert.match(r.err.join("\n"), /refusing to start/);
    mkdirSync(join(dir.path, "ok"));
  } finally {
    dir.remove();
  }
});

test("SIGTERM stops a running recorder cleanly: exit 0, run closed, lock released, database verifies", async () => {
  const { world } = await replayWorld();
  const dir = tempDir();
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const data = join(dir.path, "data");
    const db = join(data, "recorder.sqlite");
    const targets = join(data, "targets.json");
    const cfg = join(dir.path, "cfg.json");
    writeFileSync(
      cfg,
      JSON.stringify({
        hostBases: Object.fromEntries(Object.entries(world.hosts).map(([h, x]) => [h, x.base])),
        loopTickSec: 1,
        hostBudgets: { "api-mainnet.xo.market": { rps: 2, burst: 4, maxPerHour: 6000 }, "gamma-api.polymarket.com": { rps: 10, burst: 20, maxPerHour: 30000 } },
      }),
    );
    const child = spawn(process.execPath, ["--import", "tsx", join(root, "pm/recorder/main.ts"), "run", "--discover", "--db", db, "--targets", targets, "--config", cfg], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (d: Buffer) => (log += d.toString()));
    child.stderr.on("data", (d: Buffer) => (log += d.toString()));
    const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
    const deadline = Date.now() + 60_000;
    while (!/tick: due=/.test(log) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    assert.match(log, /tick: due=/, log.slice(-500));
    child.kill("SIGTERM");
    const code = await Promise.race([exited, new Promise<string>((r) => setTimeout(() => r("timeout"), 20_000))]);
    assert.equal(code, 0, log.slice(-800));
    assert.equal(existsSync(`${db}.lock`), false);
    const store = RecorderStore.open(db);
    try {
      assert.equal(store.runs().at(-1)?.endReason, "signal");
      assert.equal(store.verify().ok, true);
    } finally {
      store.close();
    }
  } finally {
    dir.remove();
  }
});
