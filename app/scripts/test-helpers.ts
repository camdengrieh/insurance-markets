import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { APP_DIR, REPO_DIR } from "./lib.ts";

// Temporary repositories for the check tests. Nothing here touches the real tree.

export interface TempRepo {
  readonly root: string;
  readonly app: string;
  write(relativePath: string, content: string): Promise<void>;
  dispose(): Promise<void>;
}

export async function tempRepo(files: Readonly<Record<string, string>> = {}): Promise<TempRepo> {
  const root = await mkdtemp(join(tmpdir(), "xo-app-check-"));
  const write = async (relativePath: string, content: string): Promise<void> => {
    const full = join(root, relativePath);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  };
  await mkdir(join(root, "app", "src"), { recursive: true });
  for (const [path, content] of Object.entries(files)) await write(path, content);
  return { root, app: join(root, "app"), write, dispose: () => rm(root, { recursive: true, force: true }) };
}

// A copy of the real dependency-related files, so a test can break one of them.
export async function tempDepsRepo(): Promise<TempRepo> {
  const repo = await tempRepo();
  await mkdir(join(repo.app, "scripts"), { recursive: true });
  for (const file of ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml"]) await cp(join(APP_DIR, file), join(repo.app, file));
  await cp(join(APP_DIR, "scripts", "dependencies.json"), join(repo.app, "scripts", "dependencies.json"));
  await cp(join(REPO_DIR, "package.json"), join(repo.root, "package.json"));
  return repo;
}
