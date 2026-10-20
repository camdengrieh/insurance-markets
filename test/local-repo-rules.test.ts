import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Repository rules that keep the root project and the Cockpit's app/ and bridge/ apart (asks A2, A6 and the
// ignore and glob rules around them): the 14-day package rule, what the unit globs can reach, what git
// ignores, what the typecheck covers. Offline; reads files and asks git (read-only) which paths it ignores.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (name: string): string => readFileSync(join(ROOT, name), "utf8");
const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string>; dependencies: Record<string, string>; devDependencies: Record<string, string> };

describe("the 14-day package rule (A6)", () => {
  it("pnpm-workspace.yaml sets minimumReleaseAge to at least 14 days, in minutes, as a plain number", () => {
    const match = /^minimumReleaseAge:\s*(\d+)\s*(?:#.*)?$/m.exec(read("pnpm-workspace.yaml"));
    assert.ok(match, "minimumReleaseAge is missing or not a plain integer");
    assert.ok(Number(match[1]) >= 14 * 24 * 60, `minimumReleaseAge is ${match[1]} minutes`);
  });

  it("does not turn the rule off for any package, and keeps the esbuild-only build allowlist", () => {
    const text = read("pnpm-workspace.yaml");
    assert.ok(!/minimumReleaseAgeExclude/.test(text));
    assert.match(text, /^packages:\s*\n\s*-\s*"\."\s*$/m, "the root workspace is still only the root");
    const builds = text.slice(text.indexOf("allowBuilds:")).split("\n").slice(1).filter((line) => /^\s+\S/.test(line));
    assert.deepEqual(builds.map((line) => line.trim()), ["esbuild: true"]);
  });
});

describe("the root project stays the root project", () => {
  it("lists no dependency that belongs to app/ (they are installed inside app/ only)", () => {
    const names = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies });
    const appOnly = names.filter((name) => /^(?:react|react-dom|vite|playwright|@playwright\/.*|@vitejs\/.*|vitest|jsdom|@axe-core\/.*|axe-core|tailwindcss)$/.test(name));
    assert.deepEqual(appOnly, []);
  });

  it("builds the local bundle with scripts/build-local.mjs and the hosted plugin with a plain esbuild line that cannot reach bridge/ or relay/", () => {
    assert.equal(packageJson.scripts["build:local"], "node scripts/build-local.mjs");
    const build = packageJson.scripts["build"] as string;
    assert.match(build, /esbuild src\/plugin\.ts /);
    assert.ok(!/bridge|relay|local/.test(build.replace("dist/plugin.mjs", "")), build);
    assert.ok(existsSync(join(ROOT, "scripts", "build-local.mjs")));
  });

  it("typechecks bridge/ together with src, relay and the tests", () => {
    const config = JSON.parse(read("tsconfig.relay.json")) as { include: string[] };
    for (const entry of ["src/**/*.ts", "relay/**/*.ts", "bridge/**/*.ts", "test/**/*.ts"]) assert.ok(config.include.includes(entry), entry);
    assert.ok(!config.include.some((entry) => entry.startsWith("app/")), "app/ has its own tsconfig and its own dependencies");
  });
});

describe("the unit globs cannot run into app/ or any node_modules", () => {
  const patterns = Object.entries(packageJson.scripts)
    .filter(([name]) => name === "unit" || name.startsWith("unit:"))
    .flatMap(([name, command]) => [...command.matchAll(/"([^"]+)"/g)].map((match) => ({ name, pattern: match[1] as string })));

  it("every unit script names its patterns, each rooted in test/ or bridge/test/", () => {
    assert.ok(patterns.some((entry) => entry.name === "unit"));
    assert.ok(patterns.some((entry) => entry.name === "unit:bridge"));
    for (const { name, pattern } of patterns) {
      assert.match(pattern, /^(?:test|bridge\/test)\/\*\*\/\*\.test\.ts$/, `${name}: ${pattern}`);
    }
  });

  it("their expansion holds no path under app/ or node_modules, and finds the tests", async () => {
    for (const { name, pattern } of patterns) {
      const matched: string[] = [];
      for await (const entry of glob(pattern, { cwd: ROOT })) matched.push(entry.split("\\").join("/"));
      assert.deepEqual(matched.filter((path) => path.startsWith("app/") || path.includes("node_modules")), [], name);
      if (name === "unit") assert.ok(matched.length > 100, `${name} found ${matched.length} files`);
    }
  });

  it("test/ and bridge/ contain no node_modules and no symbolic link into another tree, so the glob cannot walk out", () => {
    const walk = (directory: string): string[] => {
      const found: string[] = [];
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.name === "node_modules" || lstatSync(path).isSymbolicLink()) found.push(path.slice(ROOT.length));
        else if (entry.isDirectory()) found.push(...walk(path));
      }
      return found;
    };
    const bridgeDirs = existsSync(join(ROOT, "bridge")) ? [join(ROOT, "bridge", "test")].filter((path) => existsSync(path)) : [];
    assert.deepEqual([join(ROOT, "test"), ...bridgeDirs].flatMap(walk), []);
  });
});

describe("what git ignores (the app/ and bridge/ rules in the root .gitignore)", () => {
  const rules = read(".gitignore").split("\n").map((line) => line.trim());

  it("lists dependencies, build output, caches, the project-local browser download and test artefacts for both trees", () => {
    for (const rule of [
      "app/node_modules/",
      "app/dist/",
      "app/.cache/",
      "bridge/node_modules/",
      "bridge/dist/",
      "bridge/.cache/",
      ".playwright-browsers/",
      "app/test-results/",
      "app/playwright-report/",
    ]) {
      assert.ok(rules.includes(rule), rule);
    }
  });

  const git = (args: string[]) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  const haveGit = git(["rev-parse", "--git-dir"]).status === 0;

  it("git agrees: those paths are ignored and the sources next to them are not", { skip: haveGit ? false : "git is not available" }, () => {
    const ignored = ["app/node_modules/pkg/index.js", "app/dist/index.html", "app/.cache/vite/deps.json", "bridge/node_modules/pkg/index.js", "bridge/dist/main.js", "bridge/.cache/x", "app/.playwright-browsers/chromium/chrome", "app/test-results/a/trace.zip", "app/playwright-report/index.html"];
    const tracked = ["app/package.json", "app/src/main.tsx", "app/pnpm-lock.yaml", "app/pnpm-workspace.yaml", "bridge/main.ts", "bridge/contract.ts", "bridge/test/server/a.test.ts"];
    for (const path of ignored) assert.equal(git(["check-ignore", "--no-index", "-q", path]).status, 0, `${path} should be ignored`);
    for (const path of tracked) assert.equal(git(["check-ignore", "--no-index", "-q", path]).status, 1, `${path} should not be ignored`);
  });
});
