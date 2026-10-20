import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "./scripts/vite-base.ts";

// `vite build --mode standalone` and `--mode cockpit` produce the two builds (headers.config.ts). Any
// other mode (dev, test) uses the cockpit settings.
export default defineConfig(({ mode }) =>
  mergeConfig(baseConfig({ mode }), {
    test: {
      include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
      exclude: ["node_modules/**", "dist/**", "e2e/**", "scripts/fixtures/**"],
      // Pure code runs in node; a test that needs a DOM says so with `// @vitest-environment jsdom`.
      environment: "node",
      restoreMocks: true,
      // Several check tests run a real Vite build.
      testTimeout: 60_000,
      hookTimeout: 60_000,
    },
  }),
);
