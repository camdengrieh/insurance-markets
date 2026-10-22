import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// sdk/ is the bottom layer and must run unchanged in a browser and in Node (sdk/README.md).

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SDK = join(REPO, "sdk");
const ALLOWED_BARE = new Set(["viem", "zod"]);

function isTestSupport(file: string): boolean {
  return file.endsWith(".test.ts") || file.split("/").includes("fixtures");
}

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}

const SPECIFIER = /(?:^|\n)\s*(?:import|export)\b[^"'`]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

test("every sdk/ file outside sdk/node imports only sdk files, viem or zod, and nothing from node:", () => {
  // Tests and their recorded fixtures run under the app's vitest and may read files; they are checked below.
  const files = sources(SDK).filter((file) => !relative(SDK, file).startsWith("node/") && !isTestSupport(file));
  assert.ok(files.length >= 8, "the sdk sources were found");
  const problems: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(SPECIFIER)) {
      const spec = match[1] ?? match[2] ?? "";
      const where = relative(REPO, file);
      if (spec.startsWith(".")) {
        const target = resolve(dirname(file), spec);
        if (!target.startsWith(`${SDK}/`)) problems.push(`${where}: ${spec} leaves sdk/`);
        if (!spec.endsWith(".js")) problems.push(`${where}: ${spec} has no .js extension`);
      } else {
        const bare = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        if (!ALLOWED_BARE.has(bare ?? "")) problems.push(`${where}: imports ${spec}`);
      }
    }
    if (/\bprocess\.env\b/.test(text)) problems.push(`${relative(REPO, file)}: reads process.env`);
  }
  assert.deepEqual(problems, []);
});

test("sdk/ tests and fixtures import only sdk files, viem, zod, vitest and node: built-ins", () => {
  const files = sources(SDK).filter(isTestSupport);
  const problems: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(SPECIFIER)) {
      const spec = match[1] ?? match[2] ?? "";
      const where = relative(REPO, file);
      if (spec.startsWith(".")) {
        if (!resolve(dirname(file), spec).startsWith(`${SDK}/`)) problems.push(`${where}: ${spec} leaves sdk/`);
      } else if (!spec.startsWith("node:")) {
        const bare = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        if (!ALLOWED_BARE.has(bare ?? "") && bare !== "vitest") problems.push(`${where}: imports ${spec}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
