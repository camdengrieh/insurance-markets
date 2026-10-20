// Structural guard: approval is a human command. These tests read source files, so a future
// change that wires an automatic promotion path has to change a test on purpose.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as barrel from "../../links/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PM = join(HERE, "../..");
const LINKS = join(PM, "links");

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
const rel = (p: string): string => relative(PM, p);

test("only approve.ts constructs state approved", () => {
  const hits = linksSources.filter((f) => /state\s*[:=]\s*"approved"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(hits.map(rel), ["links/approve.ts"]);
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
  const goldset = linksSources.filter((f) => f.includes("/goldset/"));
  assert.ok(goldset.length >= 6);
  for (const f of goldset) {
    const text = readFileSync(f, "utf8");
    assert.equal(/approve\.js|store\.js|registry-file\.js|node:fs/.test(text), false, rel(f));
  }
});

test("the public barrel does not export the approval function", () => {
  assert.equal("approveLink" in barrel, false);
  assert.equal("APPROVAL_ACK" in barrel, false);
  assert.equal("proposeLink" in barrel, true); // proposing is allowed: it only creates candidates
});

test("LS-2: the public barrel does not export replaceLink, which would write any state without checks", () => {
  assert.equal("replaceLink" in barrel, false);
  assert.equal("findLink" in barrel, true);
  assert.equal("parseRegistry" in barrel, true);
});

test("only the pure modules and the CLI touch the file system or the network", () => {
  const touchers = linksSources.filter((f) => /from\s+"node:(fs|http|https|net|child_process|dgram|tls)"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(touchers.map(rel).sort(), ["links/registry-file.ts"]);
  for (const f of linksSources) {
    assert.equal(/\bfetch\(|XMLHttpRequest|WebSocket|eval\(|new Function\(/.test(readFileSync(f, "utf8")), false, rel(f));
  }
});

test("stored tier caps cannot name the disabled executable tier", () => {
  const schema = readFileSync(join(LINKS, "schema.ts"), "utf8");
  const tiers = /export const TIERS = \[([^\]]*)\]/.exec(schema)?.[1] ?? "";
  assert.equal(tiers.includes("executable"), false);
});
