import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { buildBundle, serializeBundle } from "../../links/bundle.js";
import { emptyRegistry } from "../../links/store.js";
import { LOCK_STALE_MS, acquireLock, runCli, type CliIo } from "../../recorder/main.js";
import { identityCandidate, leg, propose } from "../links/fixtures.js";
import { cond, market, startWorld, tempDir, totalSeen, type World } from "./helpers.js";

const worlds: World[] = [];
after(async () => {
  for (const w of worlds) await w.close();
});

function io(world?: World, extra: Partial<CliIo> = {}): { io: CliIo; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { out: (l) => out.push(l), err: (l) => err.push(l), ...(world === undefined ? {} : { clock: world.clock }), fetchImpl: () => Promise.reject(new Error("no network in this test")), ...extra },
  };
}

// The legs of a bundle: SYNTHETIC- ids (a synthetic bundle), or, with `hashed`, ids derived from a label by hashing
// (cond(), never a real market) in a bundle that is not marked synthetic: the shared XO and Polymarket parsers the
// collectors use accept only 32-byte condition ids, which a SYNTHETIC- id cannot be, so a bundle whose markets are
// actually collected from the loopback world uses hashed ids.
const XO_ID = cond("xo-aaa");
const POLY_ID = cond("poly-bbb");
const KALSHI_PARTNER = cond("x2");
const KALSHI_LEG = cond("kalshi-k").slice(2, 34);

function bundleFiles(dir: string, xoId: string, polyId: string, withKalshi = false, hashed = false): { bundle: string; pin: string } {
  let reg = emptyRegistry();
  const a = leg("xo", "x");
  const b = leg("polymarket", "p", { rulesSha256: a.rulesSha256, maskedSha256: a.maskedSha256 });
  const synthetic = { synthetic: !hashed };
  reg = propose(reg, identityCandidate("0001", { legs: [{ ...a, marketId: xoId }, { ...b, marketId: polyId }], ...synthetic })).registry;
  if (withKalshi) {
    const x2 = leg("xo", "x2", hashed ? { marketId: KALSHI_PARTNER } : {});
    const k = leg("kalshi", "k", { rulesSha256: x2.rulesSha256, maskedSha256: x2.maskedSha256, ...(hashed ? { marketId: KALSHI_LEG } : {}) });
    reg = propose(reg, identityCandidate("0002", { legs: [x2, k], ...synthetic })).registry;
  }
  const built = buildBundle(reg, { createdAt: "2026-10-20T00:00:00Z", includeCandidates: true });
  assert.ok(built.ok);
  if (!built.ok) throw new Error("bundle");
  const bundle = join(dir, "links.bundle.json");
  writeFileSync(bundle, serializeBundle(built.value));
  return { bundle, pin: built.value.manifestSha256 };
}

test("help and argument errors", async () => {
  const a = io();
  assert.equal(await runCli([], a.io), 0);
  assert.match(a.out.join("\n"), /Kalshi, Quotient and every venue not on the allowlist are refused/);
  const b = io();
  assert.equal(await runCli(["frobnicate"], b.io), 2);
  const c = io();
  assert.equal(await runCli(["run", "--no-such-flag"], c.io), 2);
  const d = io();
  assert.equal(await runCli(["run", "--interval-sec", "abc"], d.io), 2);
});

test("restricted venues cannot be configured from the command line", async () => {
  const a = io();
  assert.equal(await runCli(["dry-run", "--venues", "kalshi"], a.io), 2);
  assert.match(a.err.join("\n"), /Developer Agreement/);
  const dir = tempDir();
  try {
    const f = join(dir.path, "t.json");
    writeFileSync(f, JSON.stringify({ format: "pm-recorder-targets", version: 1, markets: [{ venue: "kalshi", marketId: "KXFED" }] }));
    const b = io();
    assert.equal(await runCli(["dry-run", "--targets", f], b.io), 2);
    assert.match(b.err.join("\n"), /refused/);
    const cfg = join(dir.path, "c.json");
    writeFileSync(cfg, JSON.stringify({ hostBudgets: { "api.elections.kalshi.com": { rps: 1, burst: 1, maxPerHour: 1 } } }));
    const c = io();
    assert.equal(await runCli(["dry-run", "--config", cfg, "--targets", f], c.io), 2);
  } finally {
    dir.remove();
  }
});

test("dry run prints the plan, makes no request and creates no database", async () => {
  const dir = tempDir();
  try {
    const { bundle, pin } = bundleFiles(dir.path, "SYNTHETIC-xo-aaa", "SYNTHETIC-poly-bbb", true);
    const db = join(dir.path, "never.sqlite");
    const r = io(undefined, { allowSynthetic: true });
    assert.equal(await runCli(["dry-run", "--bundle", bundle, "--pin", pin, "--db", db], r.io), 0);
    const text = r.out.join("\n");
    assert.match(text, /GET https:\/\/api-mainnet\.xo\.market\/api\/markets\/contract\/SYNTHETIC-xo-aaa/);
    assert.match(text, /GET https:\/\/gamma-api\.polymarket\.com\/markets\?condition_ids=SYNTHETIC-poly-bbb/);
    assert.match(text, /1 links with a refused leg/);
    assert.equal(/kalshi\.com|KXSYNTH/i.test(text), false);
    assert.equal(existsSync(db), false);
    // --dry-run on run and once is the same thing
    const r2 = io(undefined, { allowSynthetic: true });
    assert.equal(await runCli(["run", "--dry-run", "--bundle", bundle, "--pin", pin, "--db", db], r2.io), 0);
    assert.equal(existsSync(db), false);
  } finally {
    dir.remove();
  }
});

test("an unpinned or wrongly pinned bundle is refused", async () => {
  const dir = tempDir();
  try {
    const { bundle } = bundleFiles(dir.path, "SYNTHETIC-xo-aaa", "SYNTHETIC-poly-bbb");
    const a = io(undefined, { allowSynthetic: true });
    assert.equal(await runCli(["dry-run", "--bundle", bundle], a.io), 2);
    assert.match(a.err.join("\n"), /pinned/);
    const b = io(undefined, { allowSynthetic: true });
    assert.equal(await runCli(["dry-run", "--bundle", bundle, "--pin", "0".repeat(64)], b.io), 2);
    const c = io(undefined, { allowSynthetic: true });
    assert.equal(await runCli(["dry-run", "--bundle", bundle, "--pin", "XYZ"], c.io), 2);
    const d = io();
    assert.equal(await runCli(["dry-run", "--bundle", bundle, "--unpinned"], d.io), 2, "synthetic bundles are refused outside tests");
  } finally {
    dir.remove();
  }
});

test("run needs targets; once records, then report, verify, gaps, status and prune work on the result", async () => {
  const world = await startWorld([market("xo", XO_ID, { fee: "600" }), market("polymarket", POLY_ID, { fee: "0.04", bids: [["0.45", "50"]], asks: [["0.47", "50"]] })]);
  worlds.push(world);
  const dir = tempDir();
  try {
    const none = io(world);
    assert.equal(await runCli(["once", "--db", join(dir.path, "n.sqlite")], none.io), 2);
    assert.match(none.err.join("\n"), /no targets/);

    const { bundle, pin } = bundleFiles(dir.path, XO_ID, POLY_ID, true, true);
    const cfgFile = join(dir.path, "cfg.json");
    writeFileSync(cfgFile, JSON.stringify({ hostBases: Object.fromEntries(Object.entries(world.hosts).map(([h, f]) => [h, f.base])), backoff: { baseMs: 1000, maxMs: 5000, factor: 2, jitter: 0, maxAttempts: 2 } }));
    const db = join(dir.path, "rec.sqlite");
    const base = ["--db", db, "--bundle", bundle, "--pin", pin, "--config", cfgFile];

    const o = io(world, { allowSynthetic: true, fetchImpl: undefined });
    assert.equal(await runCli(["once", ...base], o.io), 0, o.err.join("\n"));
    assert.match(o.out.join("\n"), /tick: due=2 books_ok=2/);
    assert.equal(world.hosts["orderbooks.xo.market"]!.seen.length, 1);
    assert.equal(world.hosts["clob.polymarket.com"]!.seen.length, 1);
    assert.equal(existsSync(`${db}.lock`), false, "the lock is released");
    // The bundle also holds a link with a Kalshi leg. Nothing of it, nor of its XO partner, may be on disk.
    let bytes = "";
    for (const suffix of ["", "-wal", "-shm"]) if (existsSync(db + suffix)) bytes += readFileSync(db + suffix).toString("latin1").toLowerCase();
    assert.ok(bytes.length > 1000, "the database was written");
    assert.equal(bytes.includes("kalshi"), false);
    assert.equal(bytes.includes(KALSHI_LEG), false);
    assert.equal(bytes.includes(KALSHI_PARTNER), false);
    assert.equal(world.hosts["orderbooks.xo.market"]!.seen.length, 1, "the XO partner of the Kalshi link was never fetched");

    // A second pass an hour later adds a second observation.
    world.clock.advance(3_600_000);
    const o2 = io(world, { allowSynthetic: true, fetchImpl: undefined });
    assert.equal(await runCli(["once", ...base], o2.io), 0);

    const rep = io(world);
    assert.equal(await runCli(["report", "--db", db, "--config", cfgFile], rep.io), 0);
    const text = rep.out.join("\n");
    assert.match(text, /PM RECORDER REPORT/);
    assert.match(text, /polymarketxxo/);
    assert.match(text, /observations=2/);

    const json = io(world);
    assert.equal(await runCli(["report", "--db", db, "--format", "json"], json.io), 0);
    const parsed = JSON.parse(json.out.join("\n")) as { cells: unknown[]; coverage: { snapshots: number } };
    assert.equal(parsed.coverage.snapshots, 4);
    assert.equal(parsed.cells.length, 1);

    const outFile = join(dir.path, "report.txt");
    const toFile = io(world);
    assert.equal(await runCli(["report", "--db", db, "--out", outFile], toFile.io), 0);
    assert.match(readFileSync(outFile, "utf8"), /OBSERVATIONS BY VENUE PAIR/);

    const v = io(world);
    assert.equal(await runCli(["verify", "--db", db], v.io), 0);
    assert.match(v.out.join("\n"), /"ok": true/);
    const g = io(world);
    assert.equal(await runCli(["gaps", "--db", db], g.io), 0);
    assert.match(g.out.join("\n"), /gaps: 0/);
    const st = io(world);
    assert.equal(await runCli(["status", "--db", db], st.io), 0);
    assert.match(st.out.join("\n"), /"snapshots": 4/);
    const pr = io(world);
    assert.equal(await runCli(["prune", "--db", db, "--days", "7"], pr.io), 0);
    const bad = io(world);
    assert.equal(await runCli(["prune", "--db", db, "--days", "1"], bad.io), 2);
    const missing = io(world);
    assert.equal(await runCli(["report", "--db", join(dir.path, "absent.sqlite")], missing.io), 2);
    assert.equal(existsSync(join(dir.path, "absent.sqlite")), false, "read commands never create a database");
    assert.equal(totalSeen(world, "api-mainnet.xo.market") >= 2, true);
  } finally {
    dir.remove();
  }
});

test("a held lock stops a second recorder from writing the same database", async () => {
  const dir = tempDir();
  try {
    const { bundle, pin } = bundleFiles(dir.path, "SYNTHETIC-xo-aaa", "SYNTHETIC-poly-bbb");
    const db = join(dir.path, "rec.sqlite");
    writeFileSync(`${db}.lock`, "1\n");
    const r = io(undefined, { allowSynthetic: true });
    assert.equal(await runCli(["once", "--db", db, "--bundle", bundle, "--pin", pin], r.io), 3);
    assert.match(r.err.join("\n"), /another recorder holds/);
  } finally {
    dir.remove();
  }
});

test("lock file: a fresh lock is refused, a stale one is replaced, touch keeps a live one fresh", () => {
  const dir = tempDir();
  try {
    const db = join(dir.path, "rec.sqlite");
    const first = acquireLock(db);
    assert.equal(typeof first, "object");
    if (typeof first === "string") return;
    assert.equal(typeof acquireLock(db), "string", "second holder refused");
    const old = new Date(Date.now() - LOCK_STALE_MS - 60_000);
    utimesSync(`${db}.lock`, old, old);
    first.touch();
    assert.ok(Date.now() - statSync(`${db}.lock`).mtimeMs < 5000, "touch refreshed the lock");
    assert.equal(typeof acquireLock(db), "string", "a touched lock is not stale");
    utimesSync(`${db}.lock`, old, old);
    const second = acquireLock(db);
    assert.equal(typeof second, "object", "a lock untouched for two hours is taken over");
    if (typeof second !== "string") second.release();
    first.release();
  } finally {
    dir.remove();
  }
});
