import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

import { APP_DIR, BROWSERS_DIR, BROWSER_PATH, E2E_DIR, HOST_RESOLVER_RULES } from "./support/env";

// End-to-end tests of OUR OWN app and daemon only (docs/dapp-design.md 7.2). Everything is offline: the browser resolves
// no host except 127.0.0.1 (and the one name a rebinding test maps to it), every request to another host is intercepted
// and answered locally or refused (support/world.ts), the daemon is started with an empty environment and a stand-in
// upstream, and the only XO is the local mock.
//
// The browser is the Chromium headless shell in app/.playwright-browsers (gitignored). With none installed every spec
// skips with a message that says how to install it.

// Playwright reads this when it looks for browsers it manages; the explicit executablePath below does not depend on it.
process.env["PLAYWRIGHT_BROWSERS_PATH"] ??= BROWSERS_DIR;

export default defineConfig({
  testDir: E2E_DIR,
  testMatch: /.*\.spec\.ts$/,
  globalSetup: fileURLToPath(new URL("./global-setup.ts", import.meta.url)),
  outputDir: `${APP_DIR}/test-results`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
    locale: "en-GB",
    timezoneId: "UTC",
    acceptDownloads: false,
    serviceWorkers: "block",
    launchOptions: {
      ...(BROWSER_PATH === null ? {} : { executablePath: BROWSER_PATH }),
      args: [`--host-resolver-rules=${HOST_RESOLVER_RULES}`, "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"],
    },
  },
  projects: [{ name: "chromium" }],
});
