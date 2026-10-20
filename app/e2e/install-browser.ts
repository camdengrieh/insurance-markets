import { spawn } from "node:child_process";
import { join } from "node:path";

import { APP_DIR, BROWSERS_DIR } from "./support/env";

// Installs the Chromium headless shell the e2e suites use into app/.playwright-browsers (gitignored), and nowhere else:
//
//   node e2e/install-browser.ts          (from app/, with the project-local Node on PATH)
//
// This is the one step of the e2e setup that touches the network: it downloads the browser from Playwright's CDN. Nothing about the
// project, the repository or the user is sent beyond what a plain HTTPS download sends. Re-running it is harmless.

const cli = join(APP_DIR, "node_modules", "@playwright", "test", "cli.js");
const env: Record<string, string> = { PLAYWRIGHT_BROWSERS_PATH: BROWSERS_DIR };
const path = process.env["PATH"];
if (path !== undefined) env["PATH"] = path;
const child = spawn(process.execPath, [cli, "install", "chromium"], { cwd: APP_DIR, env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
