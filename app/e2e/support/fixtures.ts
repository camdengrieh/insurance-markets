import { test as base, expect } from "@playwright/test";

import { startE2eDaemon, type E2eDaemon } from "../../../bridge/test/e2e/harness";
import { DIST, INSTALL_HINT, BROWSER_PATH } from "./env";
import { startStatic, type RunningStatic } from "./servers";

// Fixtures shared by the specs. The servers and the daemon are worker-scoped (started once, on first use) because
// every one of them binds a free port and holds no state a test depends on; a test that needs a daemon of its own
// (pairing, kill) starts one with startE2eDaemon.

interface Workers {
  // The real Cockpit daemon with the real Cockpit build and the local mock XO.
  daemon: E2eDaemon;
  // The standalone build with its real headers, and the same build with no security headers at all.
  standalone: RunningStatic;
  standaloneNoHeaders: RunningStatic;
  // The cockpit build served by a plain static server with the cockpit headers (the daemon serves it too).
  cockpitStatic: RunningStatic;
}

interface Tests {
  _requireBrowser: void;
}

export const test = base.extend<Tests, Workers>({
  _requireBrowser: [
    async ({}, use, testInfo) => {
      testInfo.skip(BROWSER_PATH === null, INSTALL_HINT);
      await use();
    },
    { auto: true },
  ],
  daemon: [
    async ({}, use) => {
      const daemon = await startE2eDaemon({ appDir: DIST.cockpit });
      await use(daemon);
      await daemon.stop();
    },
    { scope: "worker" },
  ],
  standalone: [
    async ({}, use) => {
      const server = await startStatic({ dir: DIST.standalone, target: "standalone", withHeaders: true });
      await use(server);
      await server.close();
    },
    { scope: "worker" },
  ],
  standaloneNoHeaders: [
    async ({}, use) => {
      const server = await startStatic({ dir: DIST.standalone, target: "standalone", withHeaders: false });
      await use(server);
      await server.close();
    },
    { scope: "worker" },
  ],
  cockpitStatic: [
    async ({}, use) => {
      const server = await startStatic({ dir: DIST.cockpit, target: "cockpit", withHeaders: true });
      await use(server);
      await server.close();
    },
    { scope: "worker" },
  ],
});

export { expect };
