// Structural guard: approval is a human command. These tests read source files, so a future
// change that wires an automatic promotion path has to change a test on purpose.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as sdkBarrel from "../../../sdk/links/index.js";
import * as barrel from "../../links/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PM = join(HERE, "../..");
const REPO = join(PM, "..");
const LINKS = join(PM, "links");
// The pure link logic, approve.ts included, lives in the SDK; pm/links binds it to the registry's terms.
const SDK_LINKS = join(REPO, "sdk", "links");
const SDK_LINKER = join(REPO, "sdk", "linker");

function walk(dir: string, skip: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (skip(path)) continue;
    if (statSync(path).isDirectory()) out.push(...walk(path, skip));
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}

const linksSources = walk(LINKS, () => false);
const sdkSources = [...walk(SDK_LINKS, () => false), ...walk(SDK_LINKER, () => false)];
const rel = (p: string): string => relative(PM, p);
const repoRel = (p: string): string => relative(REPO, p);

test("only approve.ts constructs state approved", () => {
  const hits = [...linksSources, ...sdkSources].filter((f) => /state\s*[:=]\s*"approved"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(hits.map(repoRel), ["sdk/links/approve.ts"]);
});

test("only pm/links/approve.ts imports the SDK's approval module, and nothing in the SDK does", () => {
  const roots = [join(REPO, "sdk"), PM, join(REPO, "src"), join(REPO, "bridge"), join(REPO, "relay"), join(REPO, "app", "src")];
  const all = roots.flatMap((root) => walk(root, (p) => p.includes("node_modules") || p.includes("/dist") || p.startsWith(join(PM, "test"))));
  const importers = all.filter((f) => /from\s+"[^"]*(?:sdk\/links\/|\.\/)approve(?:\.js)?"/.test(readFileSync(f, "utf8")) && !f.startsWith(LINKS + "/cli.ts"));
  assert.deepEqual(importers.map(repoRel).sort(), ["pm/links/approve.ts"]);
});

test("only the CLI imports approve.ts, and it calls approveLink exactly once", () => {
  const importers = linksSources.filter((f) => /from\s+"(\.\.?\/)+(links\/)?approve\.js"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(importers.map(rel), ["links/cli.ts"]);
  const cli = readFileSync(join(LINKS, "cli.ts"), "utf8");
  assert.equal((cli.match(/approveLink\(/g) ?? []).length, 1);
});

test("no other pm module (adapters, tools, signals, recorder, ...) imports approve.ts", () => {
  const others = walk(PM, (p) => p.includes("node_modules") || p.startsWith(LINKS) || p.startsWith(join(PM, "test")));
  const offenders = others.filter((f) => /links\/approve(\.js)?"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders.map(rel), []);
});

test("the gold-set tooling cannot approve or edit the registry", () => {
  const goldset = [...linksSources, ...sdkSources].filter((f) => f.includes("/goldset/"));
  assert.ok(goldset.length >= 6);
  for (const f of goldset) {
    const text = readFileSync(f, "utf8");
    assert.equal(/approve\.js|store\.js|registry-file\.js|node:fs/.test(text), false, rel(f));
  }
});

test("the public barrels do not export the approval function", () => {
  for (const b of [barrel, sdkBarrel] as Record<string, unknown>[]) {
    assert.equal("approveLink" in b, false);
    assert.equal("APPROVAL_ACK" in b, false);
    assert.equal("proposeLink" in b, true); // proposing is allowed: it only creates candidates
  }
});

test("LS-2: the public barrels do not export replaceLink, which would write any state without checks", () => {
  for (const b of [barrel, sdkBarrel] as Record<string, unknown>[]) {
    assert.equal("replaceLink" in b, false);
    assert.equal("findLink" in b, true);
    assert.equal("parseRegistry" in b, true);
  }
});

test("only the pure modules and the CLI touch the file system or the network", () => {
  const touchers = linksSources.filter((f) => /from\s+"node:(fs|http|https|net|child_process|dgram|tls)"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(touchers.map(rel).sort(), ["links/registry-file.ts"]);
  for (const f of [...linksSources, ...sdkSources]) {
    assert.equal(/\bfetch\(|XMLHttpRequest|WebSocket|eval\(|new Function\(/.test(readFileSync(f, "utf8")), false, repoRel(f));
  }
  // The SDK side is pure: no node: import at all.
  for (const f of sdkSources) assert.equal(/from\s+"node:/.test(readFileSync(f, "utf8")), false, repoRel(f));
});

test("stored tier caps cannot name the disabled executable tier", () => {
  const schema = readFileSync(join(SDK_LINKS, "schema.ts"), "utf8");
  const tiers = /export const TIERS = \[([^\]]*)\]/.exec(schema)?.[1] ?? "";
  assert.equal(tiers.includes("executable"), false);
});
