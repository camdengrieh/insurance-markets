import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import type { InlineConfig, Plugin } from "vite";

import { OUT_DIRS, type BuildTarget } from "../headers.config.ts";

export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_DIR = resolve(APP_DIR, "..");
// The packages the shared plugin sources import and the app also uses.
export const SINGLE_COPY_PACKAGES = ["viem", "zod"] as const;

const JITLESS_ID = "virtual:xo-zod-jitless";
const JITLESS_RESOLVED = `\0${JITLESS_ID}`;
// Entry modules the plugin below prepends the import to: the app's main module and the build fixture's.
const ENTRY_PATTERN = /\/(?:app\/src\/main|fixtures\/smoke\/main)\.tsx?$/;

// zod probes `new Function("")` when a schema is constructed. Under a CSP without 'unsafe-eval' the probe is
// caught, but the browser still reports it as a securitypolicyviolation, which acceptance W0-3 counts. zod
// skips the probe when `jitless` is set, so every entry module starts with this one-line side effect. It
// runs before any shared source builds a schema, because ES modules evaluate imports in order. The page
// never needs zod's generated fast path: parsing is slower but correct.
export function zodJitlessPlugin(): Plugin {
  return {
    name: "xo-zod-jitless",
    enforce: "pre",
    resolveId(source) {
      return source === JITLESS_ID ? JITLESS_RESOLVED : null;
    },
    load(id) {
      return id === JITLESS_RESOLVED ? 'import * as z from "zod/v4";\nz.config({ jitless: true });\n' : null;
    },
    transform(code, id) {
      if (!ENTRY_PATTERN.test(id.split("?")[0] ?? id)) return null;
      return { code: `import "${JITLESS_ID}";\n${code}`, map: null };
    },
  };
}

export function targetForMode(mode: string): BuildTarget {
  return mode === "standalone" ? "standalone" : "cockpit";
}

export interface BaseConfigOptions {
  readonly mode: string;
  // false only in the seeded-failure test of check-bundle.ts: without dedupe the shared sources under
  // ../src resolve viem and zod from the ROOT workspace and the bundle holds two copies of each.
  readonly dedupe?: boolean;
  // false only for the one-file smoke fixture, which the tests evaluate as a single script (no imports between chunks).
  // There the entry's own import order already puts the jitless setting first.
  readonly zodChunk?: boolean;
}

// Everything the real build and the check scripts share, so the checks look at the real configuration.
export function baseConfig(options: BaseConfigOptions): InlineConfig {
  const target = targetForMode(options.mode);
  return {
    root: APP_DIR,
    // The mode decides import.meta.env.MODE, which tells the two builds apart at run time. `vite build --mode x`
    // sets it itself; a build started from code (the check scripts) gets it from here.
    mode: options.mode,
    // Relative asset URLs: the build works from any path a user serves it under. Hash routing needs no rewrites.
    base: "./",
    plugins: [zodJitlessPlugin(), react()],
    resolve: {
      alias: [
        { find: /^@shared\//, replacement: `${resolve(REPO_DIR, "src")}/` },
        { find: /^@bridge\//, replacement: `${resolve(REPO_DIR, "bridge")}/` },
        { find: /^@sdk\//, replacement: `${resolve(REPO_DIR, "sdk")}/` },
      ],
      // The shared sources live outside app/, so without this a bare `viem` or `zod` import in them would
      // resolve from the root workspace. Dedupe makes Vite resolve these names from the app only; the
      // versions are pinned equal in both workspaces (check-deps.ts).
      dedupe: options.dedupe === false ? [] : [...SINGLE_COPY_PACKAGES, "react", "react-dom"],
    },
    build: {
      outDir: resolve(APP_DIR, OUT_DIRS[target]),
      emptyOutDir: true,
      target: "es2022",
      // No source maps in a release: they would ship the original sources and local paths.
      sourcemap: false,
      // One external stylesheet (style-src 'self' allows no inline style) and no data: fonts or images
      // beyond what img-src allows: assets are always files.
      cssCodeSplit: false,
      assetsInlineLimit: 0,
      // The preload polyfill is inline-adjacent runtime code the CSP does not need.
      modulePreload: { polyfill: false },
      reportCompressedSize: false,
      rolldownOptions: options.zodChunk === false ? {} : {
        output: {
          // zod and the one-line jitless setting share a chunk, so that setting runs when zod loads and before any
          // module that builds a schema. Left to the default chunking, the setting stayed in the entry chunk and ran
          // after the chunk that already built the page's schemas (acceptance W0-3: no `new Function` probe).
          codeSplitting: { groups: [{ name: "zod", test: /node_modules\/zod\/|xo-zod-jitless/ }] },
        },
      },
    },
    server: { host: "127.0.0.1", strictPort: false, fs: { allow: [REPO_DIR] } },
    preview: { host: "127.0.0.1", strictPort: false },
  };
}
