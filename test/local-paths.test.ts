import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { ensureDataDir, LocalPathError, resolveDataDir } from "../src/local/paths.js";

// Where the local mode keeps its state, and what it insists on before using a directory.

const HOME = join(tmpdir(), "xo-local-home-fixture");
const made: string[] = [];
after(async () => {
  for (const dir of made.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "xo-local-paths-"));
  made.push(dir);
  return dir;
}

describe("resolveDataDir", () => {
  it("uses XO_DATA_DIR when it is absolute, and expands ~/", () => {
    assert.equal(resolveDataDir({ XO_DATA_DIR: join(HOME, "chosen") }, { home: HOME }), join(HOME, "chosen"));
    assert.equal(resolveDataDir({ XO_DATA_DIR: "~/state/xo" }, { home: HOME }), join(HOME, "state", "xo"));
    assert.equal(resolveDataDir({ XO_DATA_DIR: "~" }, { home: HOME }), HOME);
  });

  it("refuses a relative path, an empty home and control characters instead of guessing a folder", () => {
    assert.throws(() => resolveDataDir({ XO_DATA_DIR: "state/xo" }, { home: HOME }), (error: unknown) => error instanceof LocalPathError && error.code === "data_dir_invalid");
    assert.throws(() => resolveDataDir({ XO_DATA_DIR: "./xo" }, { home: HOME }), LocalPathError);
    assert.throws(() => resolveDataDir({ XO_DATA_DIR: `${HOME}/a\nb` }, { home: HOME }), LocalPathError);
    assert.throws(() => resolveDataDir({}, { home: "" }), (error: unknown) => error instanceof LocalPathError && error.code === "data_dir_unavailable");
  });

  it("falls back to each operating system's per-user data location, resolved from the home it is given", () => {
    assert.equal(resolveDataDir({}, { platform: "darwin", home: HOME }), join(HOME, "Library", "Application Support", "xo-market-plugin"));
    assert.equal(resolveDataDir({}, { platform: "linux", home: HOME }), join(HOME, ".local", "share", "xo-market-plugin"));
    assert.equal(resolveDataDir({ XDG_DATA_HOME: join(HOME, "xdg") }, { platform: "linux", home: HOME }), join(HOME, "xdg", "xo-market-plugin"));
    assert.equal(resolveDataDir({ XDG_DATA_HOME: "relative" }, { platform: "linux", home: HOME }), join(HOME, ".local", "share", "xo-market-plugin"));
    assert.equal(resolveDataDir({ LOCALAPPDATA: join(HOME, "local") }, { platform: "win32", home: HOME }), join(HOME, "local", "xo-market-plugin"));
  });
});

describe("ensureDataDir", { skip: process.platform === "win32" }, () => {
  it("creates a missing directory, parents included, with mode 0700", async () => {
    const root = await scratch();
    const dir = join(root, "a", "b", "xo");
    const result = await ensureDataDir(dir);
    assert.equal(result.created, true);
    assert.equal((await stat(dir)).mode & 0o777, 0o700);
  });

  it("accepts an existing private directory and says it was not created", async () => {
    const root = await scratch();
    await chmod(root, 0o700);
    assert.deepEqual(await ensureDataDir(root), { created: false });
  });

  it("refuses an existing directory that others can read, and does not change its mode", async () => {
    const root = await scratch();
    await chmod(root, 0o755);
    await assert.rejects(ensureDataDir(root), (error: unknown) => error instanceof LocalPathError && error.code === "data_dir_insecure");
    assert.equal((await stat(root)).mode & 0o777, 0o755, "the user's directory is left as it was");
    await chmod(root, 0o770);
    await assert.rejects(ensureDataDir(root), LocalPathError);
  });

  it("refuses a path that is a file", async () => {
    const root = await scratch();
    const file = join(root, "plain");
    await writeFile(file, "x");
    await assert.rejects(ensureDataDir(file), (error: unknown) => error instanceof LocalPathError && error.code === "data_dir_not_directory");
  });

  it("follows a symlink to a private directory but refuses a symlink to a file", async () => {
    const root = await scratch();
    await chmod(root, 0o700);
    const target = join(root, "real");
    await mkdir(target, { mode: 0o700 });
    await chmod(target, 0o700);
    await symlink(target, join(root, "link"));
    assert.deepEqual(await ensureDataDir(join(root, "link")), { created: false });
    const file = join(root, "f");
    await writeFile(file, "x");
    await symlink(file, join(root, "flink"));
    await assert.rejects(ensureDataDir(join(root, "flink")), LocalPathError);
  });
});
