import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { build, mergeConfig, type InlineConfig, type Plugin } from "vite";

import type { BuildTarget } from "../headers.config.ts";
import { APP_DIR, baseConfig } from "./vite-base.ts";

// Programmatic builds for the check scripts and their tests. The smoke fixture is a tiny page that pulls in
// one shared source of every kind, so a check looks at a real bundle (viem, zod, react, the bridge contract)
// without needing the feature code other streams are still writing.

// Vitest runs with NODE_ENV=test, which would make Vite bundle React's development build (full of
// documentation links and warnings). A check must look at the production bundle that ships.
async function buildForProduction(config: InlineConfig): Promise<void> {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await build(config);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

export const SMOKE_DIR = resolve(APP_DIR, "scripts/fixtures/smoke");

export interface BuildResult {
  readonly outDir: string;
  // Absolute module ids that went into the bundle (the real files, symlinks resolved).
  readonly moduleIds: readonly string[];
  // Files in outDir, relative to it, with forward slashes.
  readonly files: readonly string[];
  readonly dispose: () => Promise<void>;
}

export interface SmokeOptions {
  readonly target?: BuildTarget;
  // false reproduces the unfixed state (a second viem and zod in the bundle) for the seeded-failure test.
  readonly dedupe?: boolean;
}

function recorderPlugin(moduleIds: Set<string>): Plugin {
  return {
    name: "record-module-ids",
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk") continue;
        for (const id of Object.keys(item.modules)) moduleIds.add(id);
      }
    },
  };
}

export async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(relative(base, full).split("\\").join("/"));
  }
  return out.sort();
}

export async function buildSmoke(options: SmokeOptions = {}): Promise<BuildResult> {
  const target = options.target ?? "standalone";
  const outDir = await mkdtemp(join(tmpdir(), "xo-app-smoke-"));
  const moduleIds = new Set<string>();
  await buildForProduction(
    mergeConfig(baseConfig({ mode: target, dedupe: options.dedupe, zodChunk: false }), {
      configFile: false,
      root: SMOKE_DIR,
      logLevel: "silent",
      plugins: [recorderPlugin(moduleIds)],
      build: { outDir, emptyOutDir: true },
    }),
  );
  return {
    outDir,
    moduleIds: [...moduleIds].sort(),
    files: await listFiles(outDir),
    dispose: () => rm(outDir, { recursive: true, force: true }),
  };
}

// The real app (index.html and src/main.tsx), built to a temporary directory so dist/ is never touched.
export async function buildApp(target: BuildTarget): Promise<BuildResult> {
  const outDir = await mkdtemp(join(tmpdir(), "xo-app-build-"));
  const moduleIds = new Set<string>();
  await buildForProduction(
    mergeConfig(baseConfig({ mode: target }), {
      configFile: false,
      logLevel: "silent",
      plugins: [recorderPlugin(moduleIds)],
      build: { outDir, emptyOutDir: true },
    }),
  );
  return {
    outDir,
    moduleIds: [...moduleIds].sort(),
    files: await listFiles(outDir),
    dispose: () => rm(outDir, { recursive: true, force: true }),
  };
}

export async function readText(dir: string, file: string): Promise<string> {
  return readFile(join(dir, file), "utf8");
}
