import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import "./net-guard.mjs";
import { Secret } from "../src/config.js";
import { createRelayClient } from "../src/relay/client.js";
import { createProductionRelay, type Relay } from "../relay/main.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";
import { TEST_KDF, TEST_MASTER_SECRET, TEST_RELAY_KEY, secret, tempDir, FakeClock } from "./relay-core-helpers.js";

// The HTTP relay (`pnpm relay`) serves the owner(s) the operator named (XO_OWNER), or the first one whose
// signature it accepts: a holder of the relay key cannot start work for another wallet, and funding needs an
// owner that is already established. The wallets here are the public Anvil test keys.

const ALLOWED = ANVIL_TEST_ACCOUNTS[0]!.address;
const OTHER = ANVIL_TEST_ACCOUNTS[1]!.address;

const dirs: Array<Awaited<ReturnType<typeof tempDir>>> = [];
const relays: Relay[] = [];
// Every request the relay would send to a third party lands here instead of the network (TM-01). The test never
// needs XO's answer: it only needs the relay past the owner gate.
const upstreamAttempts: string[] = [];
const blockedByGuard = (): string[] => ((globalThis as { __netGuardBlocked?: string[] }).__netGuardBlocked ?? []);
const offlineFetch: typeof fetch = (input) => {
  upstreamAttempts.push(typeof input === "string" || input instanceof URL ? String(input) : input.url);
  return Promise.reject(new TypeError("offline test: no network"));
};
after(async () => {
  for (const relay of relays) await relay.close().catch(() => undefined);
  for (const dir of dirs) await dir.cleanup();
  assert.deepEqual(blockedByGuard(), [], "no test traffic left the machine");
  assert.ok(upstreamAttempts.every((url) => new URL(url).hostname.endsWith(".xo.market")), `only XO hosts were ever addressed: ${upstreamAttempts.join(", ")}`);
});

async function start(extraEnv: Record<string, string>) {
  const dir = await tempDir("relay-owner-http-");
  dirs.push(dir);
  const relay = await createProductionRelay({
    env: { XO_RELAY_KEY: TEST_RELAY_KEY, RELAY_PORT: "0", RELAY_DATA_DIR: dir.dir, ENABLE_FUNDING: "1", ENABLE_TRADING: "1", ...extraEnv },
    masterSecret: secret(TEST_MASTER_SECRET),
    kdf: TEST_KDF,
    allowWeakKdf: true,
    fetch: offlineFetch,
    isProcessAlive: () => false,
    maintenance: false,
    now: new FakeClock().now,
  });
  relays.push(relay);
  const client = createRelayClient({ baseUrl: relay.url, key: new Secret(TEST_RELAY_KEY) });
  return { relay, client };
}

const reasonOf = (result: { ok: boolean; error?: { details?: unknown } }): unknown => (result.error?.details as { reason?: string } | undefined)?.reason;

describe("the HTTP relay and XO_OWNER", () => {
  it("refuses a write for a wallet that is not named, on every owner write route, and lets the named one through the gate", async () => {
    const { client } = await start({ XO_OWNER: ALLOWED });
    const calls = [
      () => client.post("/v1/auth/prepare", { owner: OTHER }),
      () => client.post("/v1/userop/prepare", { owner: OTHER, action: "revoke_trading", params: {} }),
      () => client.post("/v1/funding/check", { owner: OTHER, amount: "1" }),
      () => client.post("/v1/order/cancel", { owner: OTHER, order_hash: `0x${"ab".repeat(32)}` }),
    ];
    for (const call of calls) {
      const refused = await call();
      assert.equal(refused.ok, false);
      assert.equal(refused.ok ? "" : refused.error.code, "precondition_failed");
      assert.equal(reasonOf(refused as never), "owner_not_allowed");
    }
    const named = await client.post("/v1/funding/check", { owner: ALLOWED, amount: "1" });
    assert.notEqual(reasonOf(named as never), "owner_not_allowed", "the named owner is past the gate (it fails later, for other reasons)");
  });

  it("with no XO_OWNER and no signed action yet, funding is refused for everyone; XO_ALLOW_ANY_OWNER=1 opens the gate", async () => {
    const strict = await start({});
    const refused = await strict.client.post("/v1/funding/check", { owner: OTHER, amount: "1" });
    assert.equal(reasonOf(refused as never), "owner_not_established");
    const open = await start({ XO_ALLOW_ANY_OWNER: "1" });
    const through = await open.client.post("/v1/funding/check", { owner: OTHER, amount: "1" });
    assert.notEqual(reasonOf(through as never), "owner_not_established");
    assert.notEqual(reasonOf(through as never), "owner_not_allowed");
  });

  it("reads are open to any owner", async () => {
    const { client } = await start({ XO_OWNER: ALLOWED });
    const status = await client.post("/v1/account/status", { owner: OTHER });
    assert.notEqual(reasonOf(status as never), "owner_not_allowed");
  });
});
