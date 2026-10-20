import assert from "node:assert/strict";
import { describe } from "node:test";

import { POST_ROUTES } from "../src/relay/contract.js";
import { ENTRY_POINT_V07 } from "../src/xo/chain/constants.js";
import { routes as healthRoutes, STATUS_CAPABILITY_IDS } from "../relay/health.js";
import { createAccountDirectory } from "../relay/credentials.js";
import { MOCK_SWITCHES } from "./mock-xo/switches.js";
import { useMock } from "./mock-xo/testing.js";
import { connect, createWorld, deployed, expectRelayError, ownerAt, requestsTo, type Owner, type World } from "./relay-credentials-helpers.js";

// The account reads behind POST /v1/account/status: the real route (relay/health.ts) with the account
// directory of relay/credentials.ts, against the mock. The state comes from the chain's logs and the
// orderbook registry; nothing is invented, and a state that cannot be established is a refusal.

type Status = ReturnType<(typeof POST_ROUTES)["/v1/account/status"]["response"]["parse"]>;

async function statusOf(world: World, owner: Owner, extra: { readonly account?: string } = {}): Promise<Status> {
  (world.services as { accounts?: unknown }).accounts = createAccountDirectory({ upstream: world.upstream });
  const handler = healthRoutes["POST /v1/account/status"];
  assert.ok(handler !== undefined);
  const body = POST_ROUTES["/v1/account/status"].request.parse({ owner: owner.address, ...extra });
  return POST_ROUTES["/v1/account/status"].response.parse(await handler(body, world.context()));
}

const TRIGGERS = MOCK_SWITCHES.find((entry) => entry.name === "registry.trigger")!.values;

describe("account status: state, registry and trading", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  for (const trigger of TRIGGERS) {
    harness.it(`registry.trigger = ${trigger}: undeployed, deployed without trading, deployed with trading`, async (mock, t) => {
      mock.setSwitch("registry.trigger", trigger);
      const world = await createWorld(mock, t);
      const none = ownerAt(mock, 0);
      const bare = await deployed(mock, 1, { enableTrading: false });
      const full = await deployed(mock, 2, { enableTrading: true });

      const undeployed = await statusOf(world, none);
      assert.deepEqual({ account: undeployed.account, state: undeployed.state, registered: undeployed.registered, trading: undeployed.trading_enabled, balance: undeployed.balance_usd }, { account: none.smart, state: "undeployed", registered: false, trading: "no", balance: null });

      const noTrading = await statusOf(world, bare);
      const withTrading = await statusOf(world, full);
      const registeredWhen = {
        never: [false, false],
        "on-deploy": [true, true],
        "on-enable-trading": [false, true],
        "on-l1-create": [false, false],
      }[trigger as "never"];
      assert.equal(noTrading.registered, registeredWhen[0], "deployed, trading off");
      assert.equal(withTrading.registered, registeredWhen[1], "deployed, trading on");
      assert.equal(noTrading.state, registeredWhen[0] ? "registered" : "deployed_unregistered");
      assert.equal(withTrading.state, registeredWhen[1] ? "registered" : "deployed_unregistered");
      assert.equal(noTrading.trading_enabled, "no");
      assert.equal(withTrading.trading_enabled, "yes");
    });
  }

  harness.it("on-l1-create: the account becomes registered when the relay creates its key, and the status shows it with the credential", async (mock, t) => {
    mock.setSwitch("registry.trigger", "on-l1-create");
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const before = await statusOf(world, owner);
    assert.deepEqual({ state: before.state, credentials: before.credentials }, { state: "deployed_unregistered", credentials: { state: "none", key_tag: null } });
    const { result } = await connect(world, owner);
    const after = await statusOf(world, owner);
    assert.equal(after.state, "registered");
    assert.deepEqual(after.credentials, { state: "validated", key_tag: result.key_tag });
    assert.equal(after.registered, true);
  });

  harness.it("shows the orderbook balance only for a registered account", async (mock, t) => {
    mock.setSwitch("registry.trigger", "never");
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    mock.state.setBalance(owner.smart, { balanceMicro: 12_500_000n, allowanceMicro: 12_500_000n, cashBalanceMicro: 12_500_000n });
    assert.equal((await statusOf(world, owner)).balance_usd, null, "unregistered: no balance is claimed");
    mock.state.forceRegistered(owner.smart);
    const registered = await statusOf(world, owner);
    assert.equal(registered.state, "registered");
    assert.equal(registered.balance_usd, "12.5");
    mock.state.setBalance(owner.smart, { balanceMicro: 0n, allowanceMicro: 0n, cashBalanceMicro: 0n });
    assert.equal((await statusOf(world, owner)).balance_usd, "0");
    mock.state.setBalance(owner.smart, { balanceMicro: 1n, allowanceMicro: 0n, cashBalanceMicro: 0n });
    assert.equal((await statusOf(world, owner)).balance_usd, "0.000001");
  });

  harness.it("queries the registry with the ACCOUNT, never with the owner address (AD3), and reads only", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await statusOf(world, owner);
    const registry = requestsTo(world, "GET", "/balance-allowance");
    assert.equal(registry.length, 1);
    assert.equal(new URL(registry[0]!.url).searchParams.get("address"), owner.smart.toLowerCase());
    assert.ok(!world.sent.some((entry) => entry.url.toLowerCase().includes(owner.address.slice(2).toLowerCase())), "the owner address is in no request");
    assert.deepEqual(world.sent.filter((entry) => entry.method !== "GET"), []);
    assert.ok(world.sent.length <= 7, `${String(world.sent.length)} requests for one status`);
  });

  harness.it("carries the effective flags, the tripwire state, the recorded facts and the per-host health", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await world.capabilities.record({ id: "AU2", state: "no", source: "probe", note: "derive hides the secret" });
    const status = await statusOf(world, owner);
    assert.equal(status.flags.ENABLE_TRADING, true);
    assert.equal(status.flags.KILL, false);
    assert.equal(status.flags.XO_ENABLE_CREATE, false);
    assert.deepEqual(status.tripwires, { ok: true, tripped: [] });
    assert.deepEqual(Object.keys(status.capabilities).sort(), [...STATUS_CAPABILITY_IDS].sort());
    assert.equal(status.capabilities["AU2"], "no");
    assert.equal(status.capabilities["AU6"], "unknown");
    assert.ok(status.upstream["orderbooks.xo.market"] !== undefined);
    assert.equal(status.upstream["orderbooks.xo.market"]?.state, "ok");
  });
});

describe("account status: what is refused", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("a state that cannot be established is a refusal, never a guess: the explorer failing, the registry failing", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    mock.injectFault("5xx", { listeners: ["explorer"] });
    await expectRelayError(statusOf(world, owner), "precondition_failed", { reason: "account_state_unknown" });
    mock.setSwitch("faults", "none");
    mock.injectFault("5xx", { listeners: ["orderbook"] });
    await expectRelayError(statusOf(world, owner), "precondition_failed", { reason: "account_state_unknown" });
    mock.setSwitch("faults", "none");
    // The upstream client's circuit breaker opened on the run of failures; it closes again after its pause.
    // Half open, the breaker admits one request at a time and refuses its concurrent twin, and a status
    // reads two logs at once (it fails closed meanwhile). One request on its own closes the circuit.
    mock.clock.advanceMs(31_000);
    const probe = await world.upstream.request({ method: "GET", url: "https://explorer-mainnet.xo.market/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest", purpose: "explorer_logs" });
    assert.equal(probe.status, 200);
    assert.equal((await statusOf(world, owner)).state, "deployed_unregistered", "and it recovers when the reads do");
  });

  harness.it("a registry that claims an account that was never deployed is a contradiction, not 'registered'", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = ownerAt(mock, 0);
    mock.state.forceRegistered(owner.smart);
    await expectRelayError(statusOf(world, owner), "precondition_failed", { reason: "account_state_unknown" });
  });

  harness.it("a caller-supplied account that is not the derived one, an owner that is not usable, a body the contract refuses", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await expectRelayError(statusOf(world, owner, { account: ownerAt(mock, 1).smart }), "account_mismatch");
    await expectRelayError(statusOf(world, owner, { account: owner.address }), "account_mismatch");
    assert.equal((await statusOf(world, owner, { account: owner.smart })).account, owner.smart);
    const directory = createAccountDirectory({ upstream: world.upstream });
    assert.throws(() => directory.derive(ENTRY_POINT_V07), (error: unknown) => (error as { code?: string }).code === "invalid_request");
    assert.throws(() => directory.derive("not an address"), (error: unknown) => (error as { code?: string }).code === "invalid_request");
    assert.throws(() => directory.derive("0x0000000000000000000000000000000000000000"), (error: unknown) => (error as { code?: string }).code === "invalid_request");
    assert.equal(directory.derive(owner.address), owner.smart);
    assert.throws(() => POST_ROUTES["/v1/account/status"].request.parse({ owner: owner.address, extra: 1 }));
  });

  harness.it("the credential record decides what 'credentials' says: stored, validated, failed", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const key = owner.smart.toLowerCase();
    for (const state of ["stored", "validated", "failed"] as const) {
      await world.storage.state.transact(() => ({ ops: [{ ns: "credential_status", key, value: { state, key_tag: "abc123def456" } }], result: undefined }));
      assert.deepEqual((await statusOf(world, owner)).credentials, { state, key_tag: "abc123def456" });
    }
    // A record in no known form reads as none.
    await world.storage.state.transact(() => ({ ops: [{ ns: "credential_status", key, value: { state: "great", key_tag: "x y" } }], result: undefined }));
    assert.deepEqual((await statusOf(world, owner)).credentials, { state: "none", key_tag: null });
  });
});

describe("account status with the XO node (UO9)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });
  const RPC = "https://rpc-mainnet-2.xo.market/";

  async function statusWithRpc(world: World, owner: Owner): Promise<Status> {
    (world.services as { accounts?: unknown }).accounts = createAccountDirectory({ upstream: world.upstream, rpcUrl: RPC });
    const handler = healthRoutes["POST /v1/account/status"]!;
    const body = POST_ROUTES["/v1/account/status"].request.parse({ owner: owner.address });
    return POST_ROUTES["/v1/account/status"].response.parse(await handler(body, world.context()));
  }

  harness.it("open: the answers are exact (the account's code and its allowance are read, not inferred)", async (mock, t) => {
    mock.setSwitch("rpc.access", "open");
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const status = await statusWithRpc(world, owner);
    assert.equal(status.state, "deployed_unregistered");
    assert.equal(status.trading_enabled, "yes");
    assert.ok(mock.requestsTo("xoRpc").length >= 3, "eth_getCode and the two trading reads went to the node");
  });

  harness.it("down: the logs answer the same question, and the failure is visible in the host health", async (mock, t) => {
    mock.setSwitch("rpc.access", "down");
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const status = await statusWithRpc(world, owner);
    assert.equal(status.state, "deployed_unregistered");
    assert.equal(status.trading_enabled, "yes");
    assert.ok((status.upstream["rpc-mainnet-2.xo.market"]?.errors ?? 0) >= 1);
  });

  harness.it("requires a key: the host is latched at the first refusal, no key is looked for, and the status still answers from the logs", async (mock, t) => {
    mock.setSwitch("rpc.access", "requires-key");
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const first = await statusWithRpc(world, owner);
    assert.equal(first.state, "deployed_unregistered");
    assert.equal(first.upstream["rpc-mainnet-2.xo.market"]?.state, "requires_key");
    const requests = mock.requestsTo("xoRpc").length;
    assert.equal(requests, 1, "one refused request, then the latch");
    const second = await statusWithRpc(world, owner);
    assert.equal(second.state, "deployed_unregistered");
    assert.equal(mock.requestsTo("xoRpc").length, requests, "no further request while latched");
    assert.deepEqual(world.sent.filter((entry) => entry.url.includes("rpc-mainnet-2") && /api[_-]?key/i.test(entry.url)), [], "no key is ever put in a URL");
  });
});
