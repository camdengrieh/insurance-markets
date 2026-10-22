import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { BUNDLE_FILE, PIN_FILE, STATE_FILE } from "../../linker/constants.js";
import { runCli, type CliIo } from "../../linker/main.js";
import { readFixture, startWorld, synth, syntheticHex, tempDir, totalSeen, type World } from "./helpers.js";

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
    io: { out: (l) => out.push(l), err: (l) => err.push(l), ...(world === undefined ? {} : { clock: world.clock }), fetchImpl: () => Promise.reject(new Error("no network in this test")), rng: () => 0.5, ...extra },
  };
}

const Q = "Alpha Rovers to beat Beta United on December 31, 2026";
const R = "Resolves Yes if Alpha Rovers win the match against Beta United on December 31, 2026.";
const SPECS = [
  synth("xo", "alpha-xo", { title: `SYNTHETIC ${Q}`, rules: `SYNTHETIC ${R}`, tags: ["SPORTS"] }),
  synth("polymarket", "alpha-poly", { title: `SYNTHETIC ${Q}?`, rules: `SYNTHETIC ${R}`, closeIso: "2026-12-31T05:00:00.000Z" }),
];

test("help, unknown command, bad flags, and restricted venues are refused before any request", async () => {
  const a = io();
  assert.equal(await runCli([], a.io), 0);
  assert.match(a.out.join("\n"), /never contacted and never written/);
  assert.equal(await runCli(["frobnicate"], io().io), 2);
  assert.equal(await runCli(["once", "--no-such-flag"], io().io), 2);
  for (const v of ["kalshi", "quotient", "polymarket_us", "xo,kalshi"]) {
    const b = io();
    assert.equal(await runCli(["dry-run", "--venues", v], b.io), 2);
    assert.match(b.err.join("\n"), /refused/);
  }
  const c = io();
  assert.equal(await runCli(["run", "--interval", "5m"], c.io), 2);
  assert.match(c.err.join("\n"), /between 15m and 7d/);
});

test("dry-run prints the request plan, sends nothing and writes nothing", async () => {
  const dir = tempDir();
  try {
    const a = io();
    assert.equal(await runCli(["dry-run", "--out", join(dir.path, "out"), "--registry", join(dir.path, "r.json")], a.io), 0);
    const text = a.out.join("\n");
    assert.match(text, /GET https:\/\/api-mainnet\.xo\.market\/api\/markets\?/);
    assert.match(text, /GET https:\/\/gamma-api\.polymarket\.com\/markets\/keyset\?/);
    assert.match(text, /GET https:\/\/api\.limitless\.exchange\/markets\/active\?/);
    assert.match(text, /insurance-markets-research\/0\.1; GET only/);
    assert.equal(/kalshi\.com|quotient/i.test(text.replace(/Kalshi, Quotient and every venue/g, "")), false);
    assert.deepEqual(readdirSync(dir.path), []);
  } finally {
    dir.remove();
  }
});

test("once against the loopback world: files, report, then report and export-app over them", async () => {
  const world = await startWorld(SPECS);
  worlds.push(world);
  const dir = tempDir();
  try {
    const cfg = world.configFile(dir.path);
    const out = join(dir.path, "out");
    const reg = join(dir.path, "registry.json");
    const a = io(world, { fetchImpl: undefined });
    assert.equal(await runCli(["once", "--registry", reg, "--out", out, "--config", cfg], a.io), 0, a.err.join("\n"));
    const text = a.out.join("\n");
    assert.match(text, /pm-linker once at 2026-10-20T12:00:00Z/);
    assert.match(text, /proposed: 1 \(near_identity=1\)/);
    assert.match(text, /only a person can approve a link/);
    assert.match(text, /quotient: off/);
    for (const f of [BUNDLE_FILE, PIN_FILE, STATE_FILE]) assert.ok(existsSync(join(out, f)), f);
    assert.ok(existsSync(reg));
    assert.equal(existsSync(join(out, "linker.lock")), false, "the lock is released");
    // report reads the files back.
    const b = io(world);
    assert.equal(await runCli(["report", "--registry", reg, "--out", out], b.io), 0, b.err.join("\n"));
    const report = b.out.join("\n");
    assert.match(report, /venue xo: 1/);
    assert.match(report, /venue polymarket: 1/);
    assert.match(report, /category sports: 1/);
    assert.match(report, /category other: 1/);
    assert.match(report, /candidates \(state candidate\): 1/);
    assert.match(report, /lnk_[0-9a-f]{32} near_identity score=\d+ \((strong|good|weak)\)/);
    assert.equal(/SYNTHETIC|Alpha|Rovers/.test(report), false);
    // export-app writes the dApp dataset with the proposed link, a category per leg and a band.
    const appOut = join(dir.path, "app", "links.json");
    const c = io(world);
    assert.equal(await runCli(["export-app", "--out", out, "--app-out", appOut, "--release", "2026-10-20"], c.io), 0, c.err.join("\n"));
    const ds = JSON.parse(readFileSync(appOut, "utf8")) as { links: { state: string; band?: string; legs: { category?: string; nativeId: string }[] }[]; rulesRecipe: string; contentSha256: string };
    assert.equal(ds.links.length, 1);
    assert.equal(ds.links[0]?.state, "proposed");
    assert.ok(["strong", "good", "weak"].includes(ds.links[0]?.band ?? ""));
    assert.deepEqual(ds.links[0]?.legs.map((l) => l.category), ["sports", "other"]);
    assert.equal(ds.rulesRecipe, "rules-v2");
    assert.match(ds.contentSha256, /^[0-9a-f]{64}$/);
    assert.equal(/SYNTHETIC|Alpha/.test(readFileSync(appOut, "utf8")), false);
  } finally {
    dir.remove();
  }
});

test("a second linker on the same --out is refused by the lock", async () => {
  const world = await startWorld(SPECS);
  worlds.push(world);
  const dir = tempDir();
  try {
    const out = join(dir.path, "out");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "linker.lock"), "1\n");
    const a = io(world, { fetchImpl: undefined });
    assert.equal(await runCli(["once", "--registry", join(dir.path, "r.json"), "--out", out, "--config", world.configFile(dir.path)], a.io), 3);
    assert.match(a.err.join("\n"), /another linker holds/);
    assert.equal(totalSeen(world), 0);
  } finally {
    dir.remove();
  }
});

test("replaying the REAL captured shapes: XO list and detail (rules removed from the capture), Gamma keyset, Limitless active", async () => {
  const world = await startWorld([], Date.parse("2026-10-19T12:00:00Z"));
  worlds.push(world);
  const xoList = readFixture("sdk/venues/xo/fixtures/data-markets-list-clob-active-trimmed-2026-10-20.json") as { data: Record<string, unknown>[]; meta: Record<string, unknown> };
  const xoLookups = readFixture("sdk/venues/xo/fixtures/data-market-lookups-slug-and-contract-trimmed-2026-10-20.json") as { path: string; status: number; body: unknown }[];
  const gamma = readFixture("sdk/venues/polymarket/fixtures/gamma_markets_keyset_captured_2026-10-20.json") as { markets: unknown[] };
  const limitless = readFixture("sdk/venues/limitless/fixtures/markets_active_list_captured_2026-10-20.json") as { data: unknown[] };
  world.hosts["api-mainnet.xo.market"]!.handler = (_r, u) => {
    if (u.pathname === "/api/markets") {
      return u.searchParams.get("page") === "1"
        ? { body: { data: xoList.data, meta: { ...xoList.meta, page: 1, take: 50, itemCount: xoList.data.length, pageCount: 1, hasNextPage: false } } }
        : { body: { data: [], meta: { ...xoList.meta, hasNextPage: false } } };
    }
    const hit = xoLookups.find((l) => l.path === u.pathname);
    return hit === undefined ? { status: 404, body: xoLookups.find((l) => l.status === 404)!.body } : { status: hit.status, body: hit.body };
  };
  world.hosts["gamma-api.polymarket.com"]!.handler = (_r, u) => (u.pathname === "/markets/keyset" && u.searchParams.get("cursor") === null ? { body: { markets: gamma.markets } } : { body: { markets: [] } });
  world.hosts["api.limitless.exchange"]!.handler = (_r, u) => (u.pathname === "/markets/active" && u.searchParams.get("page") === "1" ? { body: { data: limitless.data, totalMarketsCount: limitless.data.length } } : { body: { data: [], totalMarketsCount: 0 } });
  const dir = tempDir();
  try {
    const out = join(dir.path, "out");
    const a = io(world, { fetchImpl: undefined });
    assert.equal(await runCli(["once", "--registry", join(dir.path, "r.json"), "--out", out, "--config", world.configFile(dir.path)], a.io), 0, a.err.join("\n"));
    const text = a.out.join("\n");
    // The XO capture had its rules removed, so every XO detail is skipped as unhashable, by name.
    assert.match(text, /xo: listed 9, open \d+, featured 0, from cache 0, skipped .*rules_missing_field=\d+/);
    // Both Gamma rows and the three Limitless rows hash and get features (two of the Limitless rows close within hours).
    assert.match(text, /polymarket: listed 2, open 2, featured 2/);
    assert.match(text, /limitless: listed 3/);
    assert.match(text, /category politics: [1-9]/);
    const everything = readdirSync(out).map((f) => readFileSync(join(out, f), "utf8")).join("\n");
    for (const word of ["Xi Jinping", "Chainlink", "Stuttgart", "Liverpool", "will resolve", "Communist"]) assert.equal(everything.includes(word), false, word);
  } finally {
    dir.remove();
  }
});

test("PM_QUOTIENT=1 with a body file prints agreement on stdout only; the body never reaches disk", async () => {
  const sentinel = ["QUOTIENT", "SENTINEL", "3f91ab"].join("-");
  const polyId = syntheticHex("polymarket:alpha-poly");
  const world = await startWorld(SPECS);
  worlds.push(world);
  const dir = tempDir();
  try {
    const body = join(dir.path, "paid-body.json");
    writeFileSync(
      body,
      JSON.stringify({
        markets: [
          { venue: "polymarket", marketKey: `polymarket:${polyId}`, nativeMarketId: polyId, condition_id: polyId, question: sentinel, quotient_odds: 0.61, market_odds: 0.55, spread: 0.06, spread_direction: "q_higher", q_coverage: "forecasting", forecast: { created_at: "2026-10-20T11:00:00Z", probability: 0.61 }, venue_quote: { quote_method: "midpoint", freshness: "fresh", observed_at: "2026-10-20T11:55:00Z" } },
        ],
      }),
    );
    const out = join(dir.path, "out");
    const reg = join(dir.path, "registry.json");
    const off = io(world, { fetchImpl: undefined, env: {} });
    assert.equal(await runCli(["once", "--registry", reg, "--out", out, "--config", world.configFile(dir.path), "--quotient-body", body], off.io), 0, off.err.join("\n"));
    assert.match(off.out.join("\n"), /quotient: off \(PM_QUOTIENT is not set\)/);
    const on = io(world, { fetchImpl: undefined, env: { PM_QUOTIENT: "1" } });
    assert.equal(await runCli(["once", "--registry", reg, "--out", out, "--config", world.configFile(dir.path), "--quotient-body", body], on.io), 0, on.err.join("\n"));
    const text = on.out.join("\n");
    assert.match(text, /quotient: on; 1 rows parsed in memory/);
    assert.match(text, /lnk_[0-9a-f]{32}: one leg has a Quotient row \(q=0\.61\)/);
    const files = [...readdirSync(out).map((f) => readFileSync(join(out, f), "utf8")), readFileSync(reg, "utf8")].join("\n");
    assert.equal(files.includes(sentinel), false);
    assert.equal(/quotient|0\.61/i.test(files), false);
    for (const h of Object.values(world.hosts)) for (const q of h.seen) assert.equal(q.method, "GET");
    assert.equal(totalSeen(world, "orderbooks.xo.market") + totalSeen(world, "clob.polymarket.com"), 0);
  } finally {
    dir.remove();
  }
});
