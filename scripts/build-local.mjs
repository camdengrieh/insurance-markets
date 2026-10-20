// Builds dist/local.mjs (the local-mode entry, src/local.ts) with esbuild. Not part of the PayBox starter.
//
//   node scripts/build-local.mjs [--out <file>]       default: dist/local.mjs
//
// Why a script and not one esbuild command line: the Cockpit daemon (bridge/main.ts) is loaded by a
// dynamic import in src/local/cli.ts so that it joins this bundle's graph (ask A2) without being
// evaluated unless `serve` runs. While bridge/main.ts does not exist yet, the plugin below resolves
// that one import to an empty stub, so the bundle still builds and `serve` says plainly that the
// build has no daemon. The hosted plugin (dist/plugin.mjs, `pnpm build`) is built separately and must
// never reach bridge/ or relay/; test/local-bundle.test.ts checks both bundles' inputs.
//
// The options are the ones the old `pnpm build:local` command line used, so the output is unchanged
// apart from the daemon. The build is deterministic (test/local-bundle.test.ts builds twice).
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..");
const ABSENT = "xo-cockpit-absent";

// The daemon's entry; the one specifier src/local/cli.ts imports.
const COCKPIT_ENTRY = /(?:^|[\\/])bridge[\\/]main(?:\.js|\.ts)?$/;

function cockpitStub(root) {
  return {
    name: "cockpit-stub-when-absent",
    setup(b) {
      b.onResolve({ filter: COCKPIT_ENTRY }, (args) => {
        const base = resolve(args.resolveDir, args.path);
        const present = [base, base.replace(/\.js$/, ".ts"), `${base}.ts`].some((candidate) => existsSync(candidate));
        // Only the entry under this root is stubbed; anything else resolves normally (and fails normally).
        return present || resolve(base) !== resolve(root, "bridge", "main.js") ? undefined : { path: ABSENT, namespace: ABSENT };
      });
      b.onLoad({ filter: /.*/, namespace: ABSENT }, () => ({ contents: "export const startCockpit = undefined;\n", loader: "js" }));
    },
  };
}

// Returns esbuild's result. `metafile: true` adds result.metafile (tests read the input list from it).
export async function buildLocal({ root = DEFAULT_ROOT, outfile = resolve(root, "dist/local.mjs"), metafile = false, logLevel = "warning" } = {}) {
  return build({
    absWorkingDir: root,
    entryPoints: [resolve(root, "src/local.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    minify: true,
    outfile,
    metafile,
    logLevel,
    plugins: [cockpitStub(root)],
  });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf("--out");
  const out = flag >= 0 ? process.argv[flag + 1] : undefined;
  if (flag >= 0 && (out === undefined || out.startsWith("--"))) {
    console.error("usage: node scripts/build-local.mjs [--out <file>]");
    process.exitCode = 2;
  } else {
    await buildLocal(out === undefined ? {} : { outfile: resolve(out) });
    console.error(`built ${out ?? "dist/local.mjs"}${existsSync(resolve(DEFAULT_ROOT, "bridge/main.ts")) ? " (with the Cockpit daemon)" : " (no Cockpit daemon yet: bridge/main.ts is absent)"}`);
  }
}
