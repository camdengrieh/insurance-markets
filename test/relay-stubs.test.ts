import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { isRouteKey } from "../relay/routes.js";
import { registerAccountTools } from "../src/tools/account.js";
import { registerCreateTools } from "../src/tools/create.js";
import { registerFundTools } from "../src/tools/fund.js";
import { registerTradeTools } from "../src/tools/trade.js";
import { registerUseropTools } from "../src/tools/userop.js";
import { loadConfig } from "../src/config.js";
import { createRelayClient } from "../src/relay/client.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Wave 0 left a stub for every module another stream will fill in. These checks are about the
// seams, not the stubs' contents: they stay true after a stub is replaced.

const RELAY_MODULES = [
  "server", "config", "auth", "store", "crypto", "ledger", "prepared", "audit", "capabilities",
  "upstream", "alerts", "health", "main", "credentials", "orders", "userops", "funding", "creation",
  "watchers", "routes", "types",
] as const;
const HANDLER_MODULES = ["health", "credentials", "orders", "userops", "funding", "creation"] as const;

describe("relay modules: importing has no side effects", () => {
  it("imports every module with no network call and no output", async () => {
    const realFetch = globalThis.fetch;
    const realStderr = process.stderr.write.bind(process.stderr);
    const realStdout = process.stdout.write.bind(process.stdout);
    let fetches = 0;
    let written = 0;
    globalThis.fetch = (() => {
      fetches += 1;
      return Promise.reject(new Error("network is not allowed in an import test"));
    }) as typeof fetch;
    process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
      written += 1;
      return (realStderr as (...args: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof process.stderr.write;
    try {
      for (const name of RELAY_MODULES) {
        const loaded = await import(`../relay/${name}.js`);
        assert.equal(typeof loaded, "object", name);
      }
    } finally {
      globalThis.fetch = realFetch;
      process.stderr.write = realStderr as typeof process.stderr.write;
      process.stdout.write = realStdout as typeof process.stdout.write;
    }
    assert.equal(fetches, 0);
    assert.equal(written, 0);
  });

  it("gives every handler module a `routes` table that holds only contract routes", async () => {
    for (const name of HANDLER_MODULES) {
      const loaded = (await import(`../relay/${name}.js`)) as { routes?: Record<string, unknown> };
      assert.ok(loaded.routes !== undefined && typeof loaded.routes === "object", `${name} has no routes export`);
      for (const [key, handler] of Object.entries(loaded.routes)) {
        assert.equal(isRouteKey(key), true, `${name}: ${key}`);
        assert.equal(typeof handler, "function", `${name}: ${key}`);
      }
    }
  });

  it("does not run the relay when main is imported", async () => {
    const loaded = (await import("../relay/main.js")) as { main?: unknown };
    assert.equal(typeof loaded.main, "function");
  });
});

describe("plugin tool modules", () => {
  const registrars = { registerAccountTools, registerUseropTools, registerTradeTools, registerCreateTools, registerFundTools };

  it("export their registration functions", () => {
    for (const [name, register] of Object.entries(registrars)) assert.equal(typeof register, "function", name);
  });

  it("can be called with a server and make no network call while registering", () => {
    const realFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (() => {
      fetches += 1;
      return Promise.reject(new Error("network is not allowed while registering"));
    }) as typeof fetch;
    const server = new Proxy({}, { get: () => () => undefined }) as never;
    try {
      for (const register of Object.values(registrars)) assert.doesNotThrow(() => register(server));
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.equal(fetches, 0);
  });

  it("are all wired into src/plugin.ts next to the read and draft tools", () => {
    const plugin = readFileSync(join(ROOT, "src", "plugin.ts"), "utf8");
    for (const name of [
      "registerReadTools", "registerDraftTools", "registerAccountTools", "registerUseropTools",
      "registerTradeTools", "registerFundTools", "registerCreateTools",
    ]) {
      assert.match(plugin, new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from "\\./tools/`), `${name} import`);
      assert.match(plugin, new RegExp(`\\b${name}\\(server\\)`), `${name} call`);
    }
  });
});

describe("relay client seam", () => {
  it("builds from the configuration's relay endpoint without a network call", async () => {
    const { config } = loadConfig({ XO_RELAY_URL: "http://127.0.0.1:1", XO_RELAY_KEY: "k".repeat(32) });
    assert.ok(config.relayKey !== undefined && config.relayUrl !== undefined);
    const realFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (() => {
      fetches += 1;
      return Promise.reject(new Error("no network"));
    }) as typeof fetch;
    try {
      const client = createRelayClient({ baseUrl: config.relayUrl, key: config.relayKey });
      assert.equal(typeof client.post, "function");
      assert.equal(typeof client.get, "function");
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.equal(fetches, 0);
  });
});
