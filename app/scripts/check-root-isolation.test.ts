import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ROOT_FILES, checkRootIsolation, hashRootFiles } from "./check-root-isolation.ts";
import { tempRepo, type TempRepo } from "./test-helpers.ts";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.dispose()));
});

async function rootRepo(): Promise<TempRepo> {
  const repo = await tempRepo({ "package.json": "{}\n", "pnpm-workspace.yaml": 'packages:\n  - "."\n', "pnpm-lock.yaml": "lockfileVersion: '9.0'\n" });
  repos.push(repo);
  return repo;
}

describe("check-root-isolation", () => {
  it("passes when the installer leaves the root files alone (W0-1)", async () => {
    const repo = await rootRepo();
    const result = await checkRootIsolation({ repoRoot: repo.root, install: async () => {} });
    expect(result.violations).toEqual([]);
    expect(Object.keys(result.before)).toEqual([...ROOT_FILES]);
    expect(result.before).toEqual(result.after);
  });

  it("fails for each root file the installer rewrites, and for one it deletes", async () => {
    for (const name of ROOT_FILES) {
      const repo = await rootRepo();
      const result = await checkRootIsolation({ repoRoot: repo.root, install: async (root) => writeFile(join(root, name), "changed\n") });
      expect(result.violations.map((violation) => violation.file)).toEqual([name]);
    }
    const repo = await rootRepo();
    const gone = await checkRootIsolation({ repoRoot: repo.root, install: async (root) => writeFile(join(root, "pnpm-lock.yaml"), "") });
    expect(gone.violations.length).toBe(1);
  });

  it("hashes a missing file as missing rather than throwing", async () => {
    const repo = await tempRepo();
    repos.push(repo);
    expect(await hashRootFiles(repo.root)).toEqual({ "package.json": "missing", "pnpm-workspace.yaml": "missing", "pnpm-lock.yaml": "missing" });
  });
});
