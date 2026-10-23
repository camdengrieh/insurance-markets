import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { personalAccountName } from "../account.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEPLOY = join(REPO, "deploy", "recorder");
const read = (f: string): string => readFileSync(join(DEPLOY, f), "utf8");

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "dist" || name === "node_modules") continue;
    if (statSync(p).isDirectory()) sources(p, out);
    else out.push(p);
  }
  return out;
}

test("the deploy folder has the expected files and the Dockerfile keeps its promises", () => {
  const files = sources(DEPLOY).map((f) => relative(DEPLOY, f));
  for (const f of ["Dockerfile", "build.mjs", ".dockerignore", "README.md", "entrypoint.sh"]) assert.ok(files.includes(f), f);
  assert.equal(files.includes("railway.json"), false, "the Railway config was retired with the move to AWS");
  const d = read("Dockerfile");
  assert.match(d, /^FROM node:24-slim AS build$/m);
  assert.match(d, /^FROM node:24-slim AS runtime$/m);
  // Some platforms reject a VOLUME instruction, so the data dir is only declared, not a docker volume.
  assert.doesNotMatch(d, /^VOLUME\b/m);
  assert.match(d, /DATA_DIR=\/data/);
  assert.match(d, /RECORDER_DB=\/data\/recorder\.sqlite/);
  assert.match(d, /RECORDER_TARGETS=\/data\/targets\.json/);
  assert.match(d, /pnpm install --frozen-lockfile/, "installs from the lockfile only");
  assert.match(d, /CMD \["run", "--discover"\]/);
  assert.equal(/\b(pnpm|npm) (add|update|install(?! --frozen-lockfile))/.test(d), false);
  // The runtime stage holds exactly one bundled file, not the sources.
  const runtime = d.slice(d.indexOf("AS runtime"));
  assert.equal(/COPY (?!--from=build|deploy\/recorder\/entrypoint\.sh)/.test(runtime), false);
  const e = read("entrypoint.sh");
  assert.match(e, /exec setpriv --reuid=node/);
  assert.match(e, /exec node \/app\/recorder\.mjs/);
});

test("deploy files contain no personal identifiers, machine paths, secrets or placeholder ids", () => {
  const bad: string[] = [];
  const home = homedir();
  const user = personalAccountName() ?? "";
  for (const f of sources(DEPLOY)) {
    const text = readFileSync(f, "utf8");
    const rel = relative(REPO, f);
    if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(text)) bad.push(`${rel}: email-like text`);
    if (/\/Users\/|\/private\/tmp|\/home\/[a-z]/.test(text)) bad.push(`${rel}: machine path`);
    if (home.length > 4 && text.includes(home)) bad.push(`${rel}: home directory`);
    if (user.length >= 4 && text.toLowerCase().includes(user.toLowerCase())) bad.push(`${rel}: local account name`);
    if (/0x\.\.\.|example-group/.test(text)) bad.push(`${rel}: placeholder id`);
  }
  assert.deepEqual(bad, []);
});

test("the bundle builds deterministically as one file with no secrets or machine paths", () => {
  const run = (): string => {
    const r = spawnSync(process.execPath, [join(DEPLOY, "build.mjs")], { cwd: REPO, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const m = /sha256 ([0-9a-f]{64})/.exec(r.stdout);
    assert.ok(m);
    return m[1] as string;
  };
  const a = run();
  const bundle = readFileSync(join(DEPLOY, "dist", "recorder.mjs"));
  assert.equal(createHash("sha256").update(bundle).digest("hex"), a);
  assert.equal(run(), a, "same sources, same bytes");
  assert.deepEqual(readdirSync(join(DEPLOY, "dist")), ["recorder.mjs"]);
  const text = bundle.toString("utf8");
  const user = personalAccountName() ?? "";
  assert.equal(/\/Users\/|\/home\/[a-z]|\/private\//.test(text), false);
  assert.equal(homedir().length > 4 && text.includes(homedir()), false);
  assert.equal(user.length >= 4 && text.toLowerCase().includes(user.toLowerCase()), false);
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(text), false);
  // Token prefixes are spelled in pieces so this file does not trip the privacy scan itself.
  assert.equal(new RegExp(`\\b(${["gh", "p_"].join("")}|${["github", "_pat_"].join("")}|${["AK", "IA"].join("")}[0-9A-Z]{12})`).test(text), false);
  assert.equal(/process\.env\[?\.?["']?(PRIVATE|SECRET|API_KEY|TOKEN)/i.test(text), false);
  // The only environment variables it reads are its own.
  const envReads = [...text.matchAll(/process\.env(?:\.([A-Z_]+)|\["([A-Z_]+)"\])/g)].map((m) => m[1] ?? m[2]);
  assert.deepEqual(envReads, []);
  assert.match(text, /insurance-markets-research\/0\.1/);
});
