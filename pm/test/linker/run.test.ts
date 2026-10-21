// End-to-end passes against the loopback world: determinism of the bundle bytes and pin,
// idempotent re-runs, resumable XO detail reads, and no market text in any file written.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { validateBundle } from "../../links/bundle.js";
import { nodeFileEnv, readRegistry } from "../../links/registry-file.js";
import { PoliteClient } from "../../recorder/http.js";
import { BUNDLE_FILE, GROUPS_FILE, PIN_FILE, STATE_FILE } from "../../linker/constants.js";
import { runOnce, type RunDeps } from "../../linker/run.js";
import { readState } from "../../linker/state.js";
import { startWorld, synth, syntheticHex, tempDir, totalSeen, type World } from "./helpers.js";

const worlds: World[] = [];
after(async () => {
  for (const w of worlds) await w.close();
});

const SAME_Q = "Alpha Rovers to beat Beta United on December 31, 2026";
const SAME_RULES = "Resolves Yes if Alpha Rovers win the match against Beta United scheduled for December 31, 2026 (regular time only).";

function specs() {
  return [
    synth("xo", "alpha-xo", { title: `SYNTHETIC ${SAME_Q}`, rules: `SYNTHETIC ${SAME_RULES}`, tags: ["SPORTS", "Football"], groupKey: "synthetic-alpha-beta-match" }),
    synth("xo", "alpha-xo-draw", { title: "SYNTHETIC Draw: Alpha Rovers vs Beta United on December 31, 2026", rules: "SYNTHETIC Resolves Yes if the match between Alpha Rovers and Beta United on December 31, 2026 ends in a draw after regular time.", tags: ["SPORTS", "Football"], groupKey: "synthetic-alpha-beta-match" }),
    synth("polymarket", "alpha-poly", { title: `SYNTHETIC ${SAME_Q}?`, rules: `SYNTHETIC ${SAME_RULES} Timing in ET.`, closeIso: "2026-12-31T05:00:00.000Z" }),
    synth("limitless", "alpha-lim", { title: `SYNTHETIC ${SAME_Q}`, rules: `SYNTHETIC ${SAME_RULES}`, tags: ["Sports"] }),
    synth("polymarket", "btc-80k", { title: "SYNTHETIC Bitcoin above $80,000 on December 31, 2026?", rules: "SYNTHETIC Resolves Yes if the BTC price is above 80000 at the close of December 31, 2026.", tags: ["Crypto"] }),
    synth("limitless", "btc-90k", { title: "SYNTHETIC Bitcoin above $90,000 on December 31, 2026", rules: "SYNTHETIC Resolves Yes if the BTC price is above 90000 at the close of December 31, 2026.", tags: ["Crypto"] }),
    synth("polymarket", "nr-1", { title: "SYNTHETIC Candidate One wins the synthetic race", rules: "SYNTHETIC resolves yes if candidate one wins", groupKey: syntheticHex("negrisk:race") }),
    synth("polymarket", "nr-2", { title: "SYNTHETIC Candidate Two wins the synthetic race", rules: "SYNTHETIC resolves yes if candidate two wins", groupKey: syntheticHex("negrisk:race") }),
  ];
}

function deps(world: World, dir: string, over: Partial<RunDeps> = {}): RunDeps {
  const config = world.config();
  return {
    command: "once",
    registryPath: join(dir, "registry.json"),
    outDir: join(dir, "out"),
    clock: world.clock,
    client: new PoliteClient({ config, clock: world.clock, rng: () => 0.5 }),
    venues: ["xo", "polymarket", "limitless"],
    env: {},
    quotientBody: null,
    ...over,
  };
}

function filesOf(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, prefix: string): void => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      if (name.isDirectory()) walk(join(d, name.name), `${prefix}${name.name}/`);
      else out[`${prefix}${name.name}`] = readFileSync(join(d, name.name), "utf8");
    }
  };
  walk(dir, "");
  return out;
}

test("one pass proposes cross-venue candidates, native partitions and ladders, and writes files without text", async () => {
  const world = await startWorld(specs());
  worlds.push(world);
  const dir = tempDir();
  try {
    const r = await runOnce(deps(world, dir.path));
    assert.equal(r.ok, true, r.lines.join("\n"));
    const text = r.lines.join("\n");
    assert.match(text, /proposed: \d+/);
    assert.ok(r.proposed >= 3, text);
    const reg = readRegistry(nodeFileEnv, join(dir.path, "registry.json"));
    assert.ok(reg.ok);
    const links = reg.value.links;
    assert.ok(links.every((l) => l.state === "candidate"));
    // The same question on three venues: three near_identity pairs (xo-poly has a 5 h timing axis).
    const near = links.filter((l) => l.relation === "near_identity");
    assert.ok(near.length >= 3, `near_identity: ${near.length}`);
    const xoPoly = near.find((l) => l.legs.some((g) => g.venue === "xo") && l.legs.some((g) => g.venue === "polymarket"));
    assert.ok(xoPoly);
    assert.equal(xoPoly.basis.class, "settlement_window");
    assert.equal(xoPoly.basis.cutoffDeltaMinutes, 300);
    // 80k versus 90k is vetoed, never proposed.
    const btc = links.filter((l) => l.legs.some((g) => g.marketId === syntheticHex("polymarket:btc-80k")));
    assert.deepEqual(btc, []);
    assert.match(text, /vetoed: [1-9]/);
    // The neg-risk group is a partition with native provenance; the XO root event holds no ladder (different templates).
    const partition = links.find((l) => l.relation === "partition");
    assert.ok(partition);
    assert.equal(partition.proposedBy.source, "native_hook");
    assert.equal(partition.proof.level, "P0_native");
    // Files: bundle + pin validate, state and groups exist, and no title or rules words anywhere.
    const out = join(dir.path, "out");
    const files = filesOf(out);
    assert.deepEqual(Object.keys(files).sort(), [BUNDLE_FILE, PIN_FILE, GROUPS_FILE, STATE_FILE].sort());
    const v = validateBundle(files[BUNDLE_FILE] as string, { expectedManifestSha256: (files[PIN_FILE] as string).trim() });
    assert.ok(v.ok, v.ok ? "" : v.errors.join("; "));
    assert.equal(v.value.manifest.counts.candidate, links.length);
    const everything = `${Object.values(files).join("\n")}\n${readFileSync(join(dir.path, "registry.json"), "utf8")}`;
    for (const word of ["SYNTHETIC", "Alpha", "Rovers", "Beta", "Bitcoin", "Resolves", "synthetic-alpha-beta-match", "Candidate One"]) {
      assert.equal(everything.includes(word), false, `${word} leaked into a file`);
    }
    // Quotient off: the report says so and nothing about Quotient is in any file.
    assert.match(text, /quotient: off/);
    assert.equal(/quotient/i.test(everything), false);
    // Structure groups: the XO root event and the neg-risk set, ids only.
    const groups = JSON.parse(files[GROUPS_FILE] as string) as { groups: { venue: string; kind: string; memberIds: string[] }[] };
    assert.deepEqual(groups.groups.map((g) => [g.venue, g.kind, g.memberIds.length]).sort(), [["polymarket", "neg_risk", 2], ["xo", "event", 2]]);
    // Only GETs with the fixed User-Agent, to the data hosts only.
    for (const h of Object.values(world.hosts)) for (const q of h.seen) {
      assert.equal(q.method, "GET");
      assert.equal(q.headers["user-agent"], "insurance-markets-research/0.1");
    }
    assert.equal(totalSeen(world, "orderbooks.xo.market") + totalSeen(world, "clob.polymarket.com"), 0);
  } finally {
    dir.remove();
  }
});

test("determinism: the same inputs give the same bundle bytes and pin; a later re-run leaves them untouched", async () => {
  const a = await startWorld(specs());
  const b = await startWorld(specs());
  worlds.push(a, b);
  const da = tempDir();
  const db = tempDir();
  try {
    const ra = await runOnce(deps(a, da.path));
    const rb = await runOnce(deps(b, db.path));
    assert.ok(ra.ok && rb.ok);
    const fa = filesOf(join(da.path, "out"));
    const fb = filesOf(join(db.path, "out"));
    assert.equal(fa[BUNDLE_FILE], fb[BUNDLE_FILE]);
    assert.equal(fa[PIN_FILE], fb[PIN_FILE]);
    assert.equal(readFileSync(join(da.path, "registry.json"), "utf8"), readFileSync(join(db.path, "registry.json"), "utf8"));
    // Two hours later with nothing changed: the pass is a no-op on disk.
    a.clock.advance(2 * 3600_000);
    const again = await runOnce(deps(a, da.path));
    assert.ok(again.ok);
    assert.equal(again.proposed, 0);
    assert.equal(again.bundleChanged, false);
    assert.match(again.lines.join("\n"), /registry unchanged; bundle unchanged/);
    const fa2 = filesOf(join(da.path, "out"));
    assert.equal(fa2[BUNDLE_FILE], fa[BUNDLE_FILE]);
    assert.equal(fa2[PIN_FILE], fa[PIN_FILE]);
    assert.equal(readState(join(da.path, "out", STATE_FILE)).runs.length, 2);
  } finally {
    da.remove();
    db.remove();
  }
});

test("XO detail reads are capped per pass and resume on the next one; cached features are reused", async () => {
  const world = await startWorld(specs());
  worlds.push(world);
  const dir = tempDir();
  try {
    const first = await runOnce(deps(world, dir.path, { discover: { maxDetailRequests: 1 } }));
    assert.ok(first.ok);
    assert.match(first.lines.join("\n"), /1 markets still need a detail read/);
    const detailReads = () => world.hosts["api-mainnet.xo.market"]!.seen.filter((q) => q.path.startsWith("/api/markets/contract/")).length;
    assert.equal(detailReads(), 1);
    const second = await runOnce(deps(world, dir.path, { discover: { maxDetailRequests: 1 } }));
    assert.ok(second.ok);
    assert.equal(detailReads(), 2);
    assert.match(second.lines.join("\n"), /from cache 1/);
    const state = readState(join(dir.path, "out", STATE_FILE));
    assert.equal(Object.keys(state.markets).filter((k) => k.startsWith("xo:")).length, 2);
  } finally {
    dir.remove();
  }
});

test("a changed rules text on a venue vetoes the stale candidate and proposes the new pins", async () => {
  const world = await startWorld(specs());
  worlds.push(world);
  const dir = tempDir();
  try {
    const first = await runOnce(deps(world, dir.path));
    assert.ok(first.ok);
    const before = readRegistry(nodeFileEnv, join(dir.path, "registry.json"));
    assert.ok(before.ok);
    const lim = world.markets.findIndex((m) => m.id === "synthetic-alpha-lim");
    world.markets[lim] = { ...(world.markets[lim] as (typeof world.markets)[number]), rules: "SYNTHETIC Resolves Yes if Alpha Rovers win, now including extra time." };
    world.clock.advance(7 * 3600_000);
    const second = await runOnce(deps(world, dir.path));
    assert.ok(second.ok, second.lines.join("\n"));
    const after = readRegistry(nodeFileEnv, join(dir.path, "registry.json"));
    assert.ok(after.ok);
    const revoked = after.value.links.filter((l) => l.state === "revoked");
    assert.ok(revoked.length >= 2, "both candidates with the limitless leg were vetoed");
    assert.ok(revoked.every((l) => l.stateReason?.includes("rules_hash_changed")));
    assert.ok(after.value.links.filter((l) => l.state === "candidate").length >= before.value.links.length);
    assert.equal(second.bundleChanged, true);
    assert.equal(existsSync(join(dir.path, "out", BUNDLE_FILE)), true);
  } finally {
    dir.remove();
  }
});
