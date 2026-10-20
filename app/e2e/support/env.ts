import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Paths and the browser lookup for the end-to-end suites. Nothing here touches the network.

export const E2E_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const APP_DIR = join(E2E_DIR, "..");
export const REPO_DIR = join(APP_DIR, "..");
export const DIST = {
  standalone: join(APP_DIR, "dist", "standalone"),
  cockpit: join(APP_DIR, "dist", "cockpit"),
} as const;

// Browsers live in a project-local, gitignored directory (app/.gitignore), never in the user's home directory.
export const BROWSERS_DIR = process.env["PLAYWRIGHT_BROWSERS_PATH"] ?? join(APP_DIR, ".playwright-browsers");

export const INSTALL_HINT = `No Chromium is installed for the e2e suites. Install it into the project-local directory with: node e2e/install-browser.ts (run from app/). Every browser spec is skipped until then.`;

function executableIn(dir: string): string | null {
  const candidates: string[] = [];
  const walk = (current: string, depth: number): void => {
    if (depth > 3) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile() && (entry.name === "chrome-headless-shell" || entry.name === "chrome-headless-shell.exe")) candidates.push(full);
    }
  };
  walk(dir, 0);
  return candidates.sort().at(-1) ?? null;
}

// The headless shell Playwright installs (chromium_headless_shell-<build>/...). Found by name so a build
// number change does not matter. null when nothing is installed.
export function findBrowser(): string | null {
  if (!existsSync(BROWSERS_DIR)) return null;
  let shells: string[];
  try {
    shells = readdirSync(BROWSERS_DIR).filter((name) => name.startsWith("chromium_headless_shell-"));
  } catch {
    return null;
  }
  for (const name of shells.sort().reverse()) {
    const found = executableIn(join(BROWSERS_DIR, name));
    if (found !== null) return found;
  }
  return null;
}

export const BROWSER_PATH = findBrowser();

// Resolve nothing but loopback and the single rebinding name (host-resolver-rules, first match wins). With this in place a
// request that escapes the interception in support/world.ts still cannot reach a real host: it fails to resolve.
export const HOST_RESOLVER_RULES = "MAP rebind.test 127.0.0.1, MAP *.rebind.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1";
