import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkDeps, parseWorkspaceSettings } from "./check-deps.ts";
import { tempDepsRepo, type TempRepo } from "./test-helpers.ts";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.dispose()));
});

// Applies `edit` to one file of a temporary copy and returns the rules that fire.
async function broken(file: string, edit: (text: string) => string, root = false): Promise<string[]> {
  const repo = await tempDepsRepo();
  repos.push(repo);
  const path = root ? join(repo.root, file) : join(repo.app, file);
  await writeFile(path, edit(await readFile(path, "utf8")));
  return (await checkDeps({ repoRoot: repo.root })).map((violation) => violation.rule);
}

describe("check-deps", () => {
  it("passes on the real app", async () => {
    expect(await checkDeps()).toEqual([]);
  });

  it("passes on an untouched copy (control for the tests below)", async () => {
    const repo = await tempDepsRepo();
    repos.push(repo);
    expect(await checkDeps({ repoRoot: repo.root })).toEqual([]);
  });

  it("fails a range, a tag and a url instead of an exact version", async () => {
    expect(await broken("package.json", (t) => t.replace('"react": "19.3.0"', '"react": "^19.3.0"'))).toContain("not-exact");
    expect(await broken("package.json", (t) => t.replace('"wouter": "3.13.0"', '"wouter": "latest"'))).toContain("not-exact");
    expect(await broken("package.json", (t) => t.replace('"idb": "8.0.3"', '"idb": "github:jakearchibald/idb"'))).toContain("not-exact");
  });

  it("fails an undocumented dependency and a stale documentation entry", async () => {
    expect(await broken("package.json", (t) => t.replace('"wouter": "3.13.0"', '"wouter": "3.13.0",\n    "left-pad": "1.3.0"'))).toContain("undocumented");
    expect(await broken("package.json", (t) => t.replace('    "idb": "8.0.3",\n', ""))).toContain("stale-entry");
  });

  it("fails a documented version that differs from package.json", async () => {
    expect(await broken("scripts/dependencies.json", (t) => t.replace('"version": "19.3.0", "license": "MIT", "installHooks": false, "provenance": true, "published": "2026-09-09T17:21:30Z"', '"version": "19.2.0", "license": "MIT", "installHooks": false, "provenance": true, "published": "2026-09-09T17:21:30Z"'))).toContain("version-mismatch");
  });

  it("fails an install hook, a missing provenance exception and a dependency younger than 14 days", async () => {
    expect(await broken("scripts/dependencies.json", (t) => t.replace('"version": "3.13.0", "license": "Unlicense", "installHooks": false', '"version": "3.13.0", "license": "Unlicense", "installHooks": true'))).toContain("install-hook");
    expect(await broken("scripts/dependencies.json", (t) => t.replace('"idb": "No attestation', '"idb_x": "No attestation'))).toContain("no-provenance");
    expect(await broken("scripts/dependencies.json", (t) => t.replace('"published": "2026-10-04T09:15:00Z"', '"published": "2026-10-15T09:15:00Z"'))).toContain("too-new");
  });

  it("fails when the app and the plugin pin different versions of a shared package", async () => {
    expect(await broken("package.json", (t) => t.replace(/"viem": "[^"]+"/, '"viem": "2.57.3"'), true)).toContain("parity");
  });

  it("fails weakened supply-chain settings", async () => {
    expect(await broken("pnpm-workspace.yaml", (t) => t.replace("minimumReleaseAge: 20160", "minimumReleaseAge: 1440"))).toContain("release-age");
    expect(await broken("pnpm-workspace.yaml", (t) => t.replace("blockExoticSubdeps: true", "blockExoticSubdeps: false"))).toContain("exotic-subdeps");
    expect(await broken("pnpm-workspace.yaml", (t) => t.replace("trustPolicy: no-downgrade", "trustPolicy: off"))).toContain("trust-policy");
    expect(await broken("pnpm-workspace.yaml", (t) => t.replace("allowBuilds: {}", "allowBuilds:\n  esbuild: true"))).toContain("allow-builds");
  });

  it("fails a lockfile that has drifted from package.json or lost an integrity hash", async () => {
    expect(await broken("pnpm-lock.yaml", (t) => t.replace("specifier: 19.3.0", "specifier: ^19.3.0"))).toContain("lock-specifier");
    expect(await broken("pnpm-lock.yaml", (t) => t.replace(/integrity: sha512-[^,}]+/, "integrity: none"))).toContain("no-integrity");
    expect(await broken("pnpm-lock.yaml", (t) => t.replace(/resolution: \{integrity: (sha512-[^}]+)\}/, "resolution: {integrity: $1, tarball: https://example.invalid/x.tgz}"))).toContain("exotic-source");
  });

  it("parses the workspace settings it relies on", () => {
    const settings = parseWorkspaceSettings("packages:\n  - \".\"\nminimumReleaseAge: 20160 # minutes\nallowBuilds: {}\n");
    expect(settings.get("minimumReleaseAge")).toBe("20160");
    expect(settings.get("allowBuilds")).toBe("{}");
  });
});
