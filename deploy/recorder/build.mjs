// Bundles the recorder into ONE file: deploy/recorder/dist/recorder.mjs.
//
//   node deploy/recorder/build.mjs
//
// Uses the esbuild already pinned in the repository (node_modules), adds no dependency, and is
// deterministic: same sources and lockfile give the same bytes (no timestamps, no sourcemap, no
// absolute paths: every path in the bundle's comments is relative to the repository root). node:sqlite
// and the other node: modules stay external, so the bundle needs only Node 24 to run.
// Prints the sha256 of the output so a deploy can be tied to a build.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(root, "package.json"));
const esbuild = require("esbuild");

const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["pm/recorder/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  minify: false,
  sourcemap: false,
  legalComments: "none",
  charset: "utf8",
  logLevel: "warning",
  write: false,
  outfile: "deploy/recorder/dist/recorder.mjs",
});

if (result.outputFiles.length !== 1) throw new Error(`expected one output file, got ${result.outputFiles.length}`);
const out = result.outputFiles[0];
const dest = join(root, "deploy", "recorder", "dist", "recorder.mjs");
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, out.contents);
const sha = createHash("sha256").update(out.contents).digest("hex");
console.log(`deploy/recorder/dist/recorder.mjs  ${out.contents.byteLength} bytes`);
console.log(`sha256 ${sha}`);
