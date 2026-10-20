import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { APP_DIR, DIST, REPO_DIR } from "./support/env";

// Builds the two production builds the specs load (app/dist/standalone and app/dist/cockpit) when they are missing or older
// than the sources. E2E_SKIP_BUILD=1 trusts what is there; E2E_REBUILD=1 always builds. The build runs Vite from
// app/node_modules with a minimal environment and touches no network.

const SOURCES = [
  join(APP_DIR, "src"),
  join(APP_DIR, "index.html"),
  join(APP_DIR, "vite.config.ts"),
  join(APP_DIR, "headers.config.ts"),
  join(APP_DIR, "scripts", "vite-base.ts"),
  join(REPO_DIR, "bridge", "contract.ts"),
  join(REPO_DIR, "src", "guardrails"),
  join(REPO_DIR, "src", "xo"),
  join(REPO_DIR, "src", "relay", "contract.ts"),
];

function newest(path: string): number {
  let info;
  try {
    info = statSync(path);
  } catch {
    return 0;
  }
  if (!info.isDirectory()) return info.mtimeMs;
  let latest = info.mtimeMs;
  for (const name of readdirSync(path)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    latest = Math.max(latest, newest(join(path, name)));
  }
  return latest;
}

function builtAt(target: "standalone" | "cockpit"): number {
  try {
    return statSync(join(DIST[target], "index.html")).mtimeMs;
  } catch {
    return 0;
  }
}

function build(target: "standalone" | "cockpit"): Promise<void> {
  return new Promise((resolve, reject) => {
    const vite = join(APP_DIR, "node_modules", "vite", "bin", "vite.js");
    const env: Record<string, string> = {};
    const path = process.env["PATH"];
    if (path !== undefined) env["PATH"] = path;
    const child = spawn(process.execPath, [vite, "build", "--mode", target], { cwd: APP_DIR, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`vite build --mode ${target} failed (${String(code)}):\n${output.slice(-2000)}`))));
  });
}

export default async function globalSetup(): Promise<void> {
  if (process.env["E2E_SKIP_BUILD"] === "1") return;
  const latest = Math.max(...SOURCES.map(newest));
  for (const target of ["standalone", "cockpit"] as const) {
    if (process.env["E2E_REBUILD"] === "1" || builtAt(target) < latest) {
      console.log(`e2e: building the ${target} app (missing or older than its sources)`);
      await build(target);
    }
  }
}
