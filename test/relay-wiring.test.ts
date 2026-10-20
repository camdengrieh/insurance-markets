import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { createProductionRelay, createRelay, type CoreServices } from "../relay/main.js";
import { createEmbeddedRelay } from "../relay/embedded.js";
import { prepareWiring } from "../relay/wiring.js";
import { TEST_KDF, TEST_MASTER_SECRET, TEST_RELAY_KEY, secret, tempDir, FakeClock } from "./relay-core-helpers.js";

// The shipped wiring (relay/wiring.ts): `pnpm relay` and the in-process relay assemble the same pieces, and a
// caller that brings its own pieces keeps them. Offline: no request is made, the relay only listens on 127.0.0.1.

const dirs: Array<Awaited<ReturnType<typeof tempDir>>> = [];
after(async () => {
  for (const dir of dirs) await dir.cleanup();
});

async function dataDir(): Promise<string> {
  const made = await tempDir("relay-wiring-");
  dirs.push(made);
  return made.dir;
}

const CREATION_ACTIONS = ["create_market", "respond_update", "cancel_market"] as const;

function envFor(dir: string): Record<string, string> {
  return { XO_RELAY_KEY: TEST_RELAY_KEY, RELAY_PORT: "0", RELAY_DATA_DIR: dir };
}

const seams = { masterSecret: secret(TEST_MASTER_SECRET), kdf: TEST_KDF, allowWeakKdf: true, isProcessAlive: () => false, maintenance: false } as const;

function listed(services: CoreServices): readonly string[] {
  return Object.keys(services.useropExtensions ?? {}).sort();
}

describe("the shipped HTTP relay (createProductionRelay)", () => {
  it("serves the whole contract: account directory, XO request signer, userop options, creation actions and the createdMarkets service", async () => {
    const relay = await createProductionRelay({ env: envFor(await dataDir()), ...seams, now: new FakeClock().now });
    try {
      const services = relay.services;
      assert.ok(services.accounts !== undefined, "account directory");
      assert.ok(services.l2auth !== undefined, "XO request signer");
      assert.ok(services.userops !== undefined, "userop options");
      assert.ok(services.createdMarkets !== undefined, "createdMarkets service");
      assert.deepEqual(listed(services), [...CREATION_ACTIONS].sort());
    } finally {
      await relay.close();
    }
  });

  it("a bare createRelay still wires nothing of this (the library stays test friendly)", async () => {
    const relay = await createRelay({ env: envFor(await dataDir()), ...seams, now: new FakeClock().now });
    try {
      assert.equal(relay.services.accounts, undefined);
      assert.equal(relay.services.l2auth, undefined);
      assert.equal(relay.services.useropExtensions, undefined);
    } finally {
      await relay.close();
    }
  });

  it("keeps what the caller brings: its own creation extensions replace the default runtime", async () => {
    const own = {};
    const relay = await createProductionRelay({ env: envFor(await dataDir()), ...seams, now: new FakeClock().now, extraServices: { useropExtensions: own } });
    try {
      assert.equal(relay.services.useropExtensions, own);
      assert.equal(relay.services.createdMarkets, undefined, "no second watcher runs beside the caller's");
    } finally {
      await relay.close();
    }
  });

  it("closing twice does not throw", async () => {
    const relay = await createProductionRelay({ env: envFor(await dataDir()), ...seams, now: new FakeClock().now });
    await relay.close();
    await assert.doesNotReject(relay.close());
  });
});

describe("the in-process relay (createEmbeddedRelay)", () => {
  it("carries the same wiring as the HTTP relay", async () => {
    const relay = await createEmbeddedRelay({ dataDir: await dataDir(), env: {}, clock: new FakeClock().now, ...seams });
    try {
      assert.deepEqual(listed(relay.services), [...CREATION_ACTIONS].sort());
      assert.ok(relay.services.l2auth !== undefined);
      assert.ok(relay.services.createdMarkets !== undefined);
    } finally {
      await relay.close();
    }
  });
});

describe("prepareWiring", () => {
  it("starts no creation runtime when asked not to", () => {
    const wiring = prepareWiring({ env: {}, now: () => 0, creation: false });
    assert.equal(wiring.creation, undefined);
    assert.equal(wiring.extraServices.useropExtensions, undefined);
    assert.equal(wiring.extraServices.createdMarkets, undefined);
  });

  it("reports a bad userop setting by name and never by value", () => {
    const wiring = prepareWiring({ env: { XO_BUNDLER_URL: "http://not-https.invalid/secret-token-value" }, now: () => 0, creation: false });
    for (const issue of wiring.issues) assert.ok(!issue.includes("secret-token-value"));
  });
});
