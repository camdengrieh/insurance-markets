// Bundles the markets API into ONE file: deploy/api/dist/api.mjs.
//
//   node deploy/api/build.mjs
//
// Same recipe as deploy/recorder/build.mjs and deploy/linker/build.mjs: the esbuild pinned in the repository, no
// dependency added, deterministic bytes (no timestamps, no sourcemap, paths relative to the repository root), node:
// modules (node:sqlite among them) external. The entry point is api/main.ts, built from api/ and sdk/ only.
// Prints the sha256 of the output.

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
  entryPoints: ["api/main.ts"],
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
  outfile: "deploy/api/dist/api.mjs",
});

if (result.outputFiles.length !== 1) throw new Error(`expected one output file, got ${result.outputFiles.length}`);
const out = result.outputFiles[0];
const dest = join(root, "deploy", "api", "dist", "api.mjs");
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, out.contents);
const sha = createHash("sha256").update(out.contents).digest("hex");
console.log(`deploy/api/dist/api.mjs  ${out.contents.byteLength} bytes`);
console.log(`sha256 ${sha}`);
