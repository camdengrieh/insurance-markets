import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const PM = join(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = join(PM, "..");

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === "dist" || name === "out") continue;
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|md|json|mjs|sh)$/.test(name) || name === "Dockerfile") out.push(p);
  }
  return out;
}

const mine = [...files(join(PM, "linker")), ...files(join(REPO, "sdk/linker")), ...files(join(PM, "test/linker")), ...files(join(REPO, "deploy/linker")), join(REPO, "docs/linker-runbook.md"), join(PM, "core/category.ts")];

test("linker sources, docs, deploy files and tests contain no personal identifiers or machine paths", () => {
  assert.ok(mine.length > 15);
  const bad: string[] = [];
  const home = homedir();
  const user = userInfo().username;
  for (const f of mine) {
    const text = readFileSync(f, "utf8");
    const rel = relative(REPO, f);
    if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(text)) bad.push(`${rel}: email-like text`);
    if (/\/Users\/|\/private\/tmp|\/home\/[a-z]/.test(text)) bad.push(`${rel}: absolute machine path`);
    if (home.length > 4 && text.includes(home)) bad.push(`${rel}: home directory`);
    if (user.length >= 4 && text.toLowerCase().includes(user.toLowerCase()) && !rel.endsWith("privacy.test.ts")) bad.push(`${rel}: local account name`);
    if (!rel.endsWith("privacy.test.ts") && /\b(ghp_|github_pat_|sk-[A-Za-z0-9]{10})/.test(text)) bad.push(`${rel}: token-like text`);
  }
  assert.deepEqual(bad, []);
});

test("the only User-Agent literal is the fixed generic research string", () => {
  const hits: string[] = [];
  for (const f of mine.filter((x) => x.endsWith(".ts") && !x.includes("test/linker"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/user-agent["']?\s*[:=]\s*["'`]([^"'`]+)/gi)) hits.push(m[1] ?? "");
  }
  assert.deepEqual(hits.filter((h) => h !== "insurance-markets-research/0.1"), []);
});

test("the linker never imports a signing, trading, browser or approval module, and issues no write method", () => {
  for (const f of mine.filter((x) => x.endsWith(".ts") && !x.includes("test/linker"))) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/from\s+["']([^"']+)["']/g)) {
      const spec = m[1] ?? "";
      assert.equal(/signing|userop|paybox|puppeteer|playwright|selenium|viem|ethers|approve\.js|src\/tools|src\/plugin/.test(spec), false, `${relative(REPO, f)} imports ${spec}`);
    }
    assert.equal(/method:\s*["'](POST|PUT|DELETE|PATCH)["']/i.test(text), false, `${relative(REPO, f)} issues a write method`);
    assert.equal(/state\s*[:=]\s*"approved"/.test(text), false, `${relative(REPO, f)} constructs an approved state`);
    assert.equal(/\beval\s*\(|new Function\s*\(/.test(text), false);
  }
});

test("no file the linker writes is named for text: the state, bundle and groups hold ids, hashes, categories and timestamps", () => {
  const state = readFileSync(join(PM, "linker", "state.ts"), "utf8");
  assert.match(state, /ids-and-hashes-only/);
  assert.equal(/title|question|description/.test(state.replace(/\/\/.*$/gm, "").replace(/titleTokens/g, "")), false);
});
