import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { API_READER_VENUES } from "../../api/markets.js";

// deploy/api follows deploy/recorder and deploy/linker (pm/test/linker/deploy.test.ts is the pattern): the folder keeps
// its promises, holds no personal identifier, machine path or secret, and the bundle builds deterministically as one
// file that starts, answers and stops on SIGTERM.

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DEPLOY = join(REPO, "deploy", "api");
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

test("the deploy folder mirrors the recorder's and the Dockerfile keeps its promises", () => {
  const files = sources(DEPLOY).map((f) => relative(DEPLOY, f));
  for (const f of ["Dockerfile", "build.mjs", ".dockerignore", "Dockerfile.dockerignore", "README.md", "entrypoint.sh"]) assert.ok(files.includes(f), f);
  assert.equal(files.includes("railway.json"), false);
  const d = read("Dockerfile");
  assert.match(d, /^FROM node:24-slim AS build$/m);
  assert.match(d, /^FROM node:24-slim AS runtime$/m);
  assert.doesNotMatch(d, /^VOLUME\b/m);
  assert.match(d, /API_DATA_DIR=\/data/);
  assert.match(d, /pnpm install --frozen-lockfile/);
  assert.match(d, /CMD \["serve"\]/);
  assert.equal(/\b(pnpm|npm) (add|update|install(?! --frozen-lockfile))/.test(d), false);
  // Built from sdk/ and api/ only.
  assert.deepEqual([...d.matchAll(/^COPY (?!--from)(\S+)/gm)].map((m) => m[1]), ["package.json", "tsconfig.json", "sdk", "api", "deploy/api/build.mjs", "deploy/api/entrypoint.sh"]);
  const runtime = d.slice(d.indexOf("AS runtime"));
  assert.equal(/COPY (?!--from=build|deploy\/api\/entrypoint\.sh)/.test(runtime), false);
  // No instruction carries a secret (comments may say there is none).
  const instructions = d.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");
  assert.doesNotMatch(instructions, /SECRET|KEY|TOKEN|PASSWORD/i);
  const e = read("entrypoint.sh");
  assert.match(e, /exec setpriv --reuid=node/);
  assert.match(e, /exec node \/app\/api\.mjs/);
  assert.match(read("README.md"), /deploy\/aws/);
});

test("deploy and api files contain no personal identifiers, machine paths, secrets or placeholder ids", () => {
  const bad: string[] = [];
  const home = homedir();
  const user = userInfo().username;
  for (const f of [...sources(DEPLOY), ...sources(join(REPO, "api"))]) {
    const text = readFileSync(f, "utf8");
    const rel = relative(REPO, f);
    if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(text)) bad.push(`${rel}: email-like text`);
    if (/\/Users\/|\/private\/tmp|\/home\/[a-z]/.test(text)) bad.push(`${rel}: machine path`);
    if (home.length > 4 && text.includes(home)) bad.push(`${rel}: home directory`);
    if (user.length >= 4 && text.toLowerCase().includes(user.toLowerCase())) bad.push(`${rel}: local account name`);
    if (/0x\.\.\.|example-group|TODO|FIXME/.test(text)) bad.push(`${rel}: placeholder`);
  }
  assert.deepEqual(bad, []);
});

test("the bundle builds deterministically as one file with no secrets, machine paths or approval path", () => {
  const run = (): string => {
    const r = spawnSync(process.execPath, [join(DEPLOY, "build.mjs")], { cwd: REPO, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const m = /sha256 ([0-9a-f]{64})/.exec(r.stdout);
    assert.ok(m);
    return m[1] as string;
  };
  const a = run();
  const bundle = readFileSync(join(DEPLOY, "dist", "api.mjs"));
  assert.equal(createHash("sha256").update(bundle).digest("hex"), a);
  assert.equal(run(), a, "same sources, same bytes");
  assert.deepEqual(readdirSync(join(DEPLOY, "dist")), ["api.mjs"]);
  const text = bundle.toString("utf8");
  const user = userInfo().username;
  assert.equal(/\/Users\/|\/home\/[a-z]|\/private\//.test(text), false);
  assert.equal(homedir().length > 4 && text.includes(homedir()), false);
  assert.equal(user.length >= 4 && text.toLowerCase().includes(user.toLowerCase()), false);
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(text), false);
  // The environment is read once, whole, at the entry point (main.ts hands it to loadApiConfig); no module reads a variable.
  const envReads = [...text.matchAll(/process\.env(?:\.([A-Z_]+)|\["([A-Z_]+)"\])/g)].map((m) => m[1] ?? m[2]);
  assert.deepEqual(envReads, []);
  assert.match(text, /insurance-markets-api\/0\.1/);
  assert.equal(/approveLink|APPROVAL_ACK/.test(text), false, "the approval path is not in the API bundle");
  assert.equal(/FAKE_BLOCK_PAGE|testkit/.test(text), false, "no test support in the bundle");
  // No credentialed signer: nothing from sdk/node. (viem's secp256k1, which the x402 check uses to recover a payer's
  // signature, carries its own RFC 6979 HMAC-DRBG; that is not a request signer.)
  assert.equal(/\bcreateHmac\(|l2Headers|hmacSignature/.test(text), false);
  assert.equal(/from "node:crypto"[^;]*createHmac\b/.test(text), false);
  // No private key and no signing call: the API recovers signatures, it never makes one.
  assert.equal(/privateKeyToAccount|signTypedData\(/.test(text), false);
});

test("the bundle starts with no secret, answers health and venues, and stops cleanly on SIGTERM", async () => {
  const dir = mkdtempSync(join(tmpdir(), "api-deploy-"));
  const child = spawn(process.execPath, [join(DEPLOY, "dist", "api.mjs")], {
    cwd: REPO,
    env: { PATH: process.env["PATH"] ?? "", API_DATA_DIR: dir, API_PORT: "0", API_INDEXER: "off" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => (out += chunk));
  const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
  try {
    const port = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no listening line: ${out}`)), 10_000);
      child.stdout.on("data", () => {
        const m = /listening on 127\.0\.0\.1:(\d+)/.exec(out);
        if (m !== null) {
          clearTimeout(timer);
          resolve(m[1] as string);
        }
      });
    });
    const health = await fetch(`http://127.0.0.1:${port}/v1/health`);
    assert.equal(health.status, 200);
    const body = (await health.json()) as Record<string, unknown>;
    assert.deepEqual(body["readers"], [...API_READER_VENUES]);
    assert.equal(body["indexer"], "off");
    const venues = await fetch(`http://127.0.0.1:${port}/v1/venues`);
    assert.equal(venues.status, 200);
  } finally {
    child.kill("SIGTERM");
  }
  assert.equal(await exited, 0);
  assert.match(out, /SIGTERM: stopping/);
  assert.match(out, /stopped/);
});

test("the bundle's operator commands: keys issue, list and revoke against the data directory, and the listing manifest", () => {
  const dir = mkdtempSync(join(tmpdir(), "api-keys-"));
  const env = { PATH: process.env["PATH"] ?? "", API_DATA_DIR: dir };
  const run = (args: string[], extra: Record<string, string> = {}) => spawnSync(process.execPath, [join(DEPLOY, "dist", "api.mjs"), ...args], { cwd: REPO, env: { ...env, ...extra }, encoding: "utf8" });
  const issued = run(["keys", "issue", "--label", "deploy test", "--tier", "full"]);
  assert.equal(issued.status, 0, issued.stderr);
  const key = /^key (imk_\S+)$/m.exec(issued.stdout)?.[1];
  assert.ok(key !== undefined);
  const listed = run(["keys", "list"]);
  assert.equal(listed.status, 0);
  assert.equal(listed.stdout.includes(key), false, "a key is printed once, at issue");
  const id = /^([0-9a-f]{12}) {2}full/m.exec(listed.stdout)?.[1];
  assert.ok(id !== undefined, listed.stdout);
  assert.equal(run(["keys", "revoke", id]).status, 0);
  assert.equal(run(["keys", "rotate"]).status, 2);
  // The listing has no price unless one is configured, and none is invented.
  const bare = run(["listing"]);
  assert.equal(bare.status, 0, bare.stderr);
  const manifest = JSON.parse(bare.stdout) as { payTo: unknown; endpoints: Array<{ path: string; sold: boolean; priceUsdc: unknown }> };
  assert.equal(manifest.payTo, null);
  assert.deepEqual(manifest.endpoints.map((e) => [e.path, e.sold, e.priceUsdc]), [["/v1/quote", false, null], ["/v1/route/prepare", false, null]]);
  const priced = run(["listing"], { API_PUBLIC_URL: "https://api.test", API_X402_FACILITATOR_URL: "https://facilitator.test", API_X402_PAY_TO: "0x00000000000000000000000000000000000fee01", API_X402_NETWORK: "eip155:8453", API_X402_PRICE_QUOTE: "0.01" });
  assert.equal(priced.status, 0, priced.stderr);
  const sold = JSON.parse(priced.stdout) as { endpoints: Array<{ path: string; sold: boolean; priceUsdc: unknown; accepts: unknown[] }> };
  assert.deepEqual(sold.endpoints.map((e) => [e.path, e.sold, e.priceUsdc, e.accepts.length]), [["/v1/quote", true, "0.01", 1], ["/v1/route/prepare", false, null, 0]]);
});
