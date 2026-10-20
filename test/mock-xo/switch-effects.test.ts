import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveAccount } from "../../src/xo/account/derive.js";
import { ACCOUNT_DEPLOYED_TOPIC, KERNEL_FACTORY } from "../../src/xo/chain/constants.js";
import { readSwitches, switchValues } from "./profile.js";
import type { MockXo } from "./server.js";
import { OPTIMISTIC_PROFILE, PESSIMISTIC_PROFILE, type MockSwitchName } from "./switches.js";
import { deployOwner, enableTradingFor, getJson, postRpc, useMock } from "./testing.js";

// Every switch the read mock implements gets a probe: a function that observes the mock and returns a short
// text. Flipping the switch through each of its values must change what the probe sees (a visible effect),
// and the probes must cover exactly the implemented switches, so a switch cannot gain behaviour without a test.

type Probe = (mock: MockXo, value: string) => Promise<string>;

async function observe(run: () => Promise<string>): Promise<string> {
  try {
    return await run();
  } catch (error) {
    return `closed:${error instanceof Error ? error.constructor.name : "error"}`;
  }
}

async function smartAccountOf(mock: MockXo, address: string): Promise<string> {
  const { body } = await getJson(mock, "orderbook", `/balance-allowance?address=${address}`);
  return String((body as { smart_account: unknown }).smart_account);
}

const PROBES: Readonly<Partial<Record<MockSwitchName, Probe>>> = {
  "rpc.access": async (mock) => {
    const xo = await observe(async () => String((await postRpc(mock, "xoRpc", "eth_chainId")).status));
    const bundler = await observe(async () => String((await postRpc(mock, "bundler", "eth_chainId")).status));
    const base = await observe(async () => String((await postRpc(mock, "baseRpc", "eth_chainId")).status));
    return `xo=${xo} bundler=${bundler} base=${base}`;
  },
  faults: async (mock) => {
    return observe(async () => {
      const response = await fetch(`${mock.urls.orderbook}/time`, { signal: AbortSignal.timeout(600) });
      const text = await response.text();
      try {
        JSON.parse(text);
        return `${String(response.status)}:json`;
      } catch {
        return `${String(response.status)}:not-json`;
      }
    });
  },
};

describe("every switch the read mock implements has a visible effect (the 27 write switches are in switch-effects-write.test.ts)", () => {
  it("has a probe for exactly the implemented switches", () => {
    assert.deepEqual(Object.keys(PROBES).sort(), readSwitches().filter((name) => name !== "registry.trigger").sort(), "registry.trigger is probed through the chain below");
  });

  const harness = useMock({ chains: { xo: true, base: true } });

  for (const [name, probe] of Object.entries(PROBES) as [MockSwitchName, Probe][]) {
    harness.it(`${name}: each of its values changes what the mock does`, async (mock) => {
      const seen = new Map<string, string>();
      for (const value of switchValues(name)) {
        mock.switches.setByName(name, value);
        seen.set(value, await probe(mock, value));
        mock.switches.setByName(name, PESSIMISTIC_PROFILE[name]);
        mock.faults.clear();
      }
      const observations = [...seen.values()];
      assert.equal(new Set(observations).size, observations.length, `${name}: ${JSON.stringify([...seen])}`);
    });
  }

  harness.it("faults: the five values look different on the wire, each as documented", async (mock) => {
    const at = async (value: string): Promise<string> => {
      mock.switches.setByName("faults", value);
      const out = await PROBES["faults"]?.(mock, value);
      mock.faults.clear();
      return out ?? "";
    };
    assert.equal(await at("none"), "200:json");
    assert.equal(await at("429-retry-after"), "429:json");
    assert.equal(await at("5xx"), "503:json");
    assert.match(await at("timeout"), /^closed:/);
    assert.equal(await at("truncated-json"), "200:not-json");
  });

  harness.it("a counted fault fails exactly that many requests and then puts the switch back", async (mock) => {
    mock.injectFault("5xx", { count: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await getJson(mock, "orderbook", "/time")).status);
    assert.deepEqual(statuses, [503, 503, 503, 200, 200]);
    assert.equal(mock.switches.get("faults"), "none");
    assert.equal(mock.faults.injected >= 3, true);
  });

  harness.it("a fault scoped to one listener leaves the others alone", async (mock) => {
    mock.injectFault("5xx", { listeners: ["dataApi"] });
    assert.equal((await getJson(mock, "dataApi", "/api/markets?take=1")).status, 503);
    assert.equal((await getJson(mock, "orderbook", "/time")).status, 200);
    assert.equal((await getJson(mock, "explorer", "/api?module=logs&action=getLogs")).status, 200);
    mock.faults.clear();
    assert.equal((await getJson(mock, "dataApi", "/api/markets?take=1")).status, 200);
  });

  harness.it("changing the faults switch directly discards the limits of an earlier injection", async (mock) => {
    mock.injectFault("timeout", { count: 1, listeners: ["dataApi"] });
    mock.switches.set("faults", "5xx");
    assert.equal((await getJson(mock, "orderbook", "/time")).status, 503, "the listener scope is gone");
    assert.equal((await getJson(mock, "orderbook", "/time")).status, 503, "the count is gone");
    mock.faults.clear();
  });
});

describe("registry.trigger: when an account becomes registered", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  // What GET /balance-allowance reports for the account after each step, per trigger.
  const EXPECTED: Readonly<Record<string, readonly [string, string, string, string]>> = {
    // [undeployed, deployed with trading off, trading enabled, L1 credentials created for an undeployed account]
    never: ["null", "null", "null", "null"],
    "on-deploy": ["null", "yes", "yes", "null"],
    "on-enable-trading": ["null", "null", "yes", "null"],
    "on-l1-create": ["null", "null", "null", "yes"],
  };

  for (const trigger of switchValues("registry.trigger")) {
    harness.it(`${trigger}`, async (mock) => {
      mock.switches.setByName("registry.trigger", trigger);
      const chain = mock.chains.xo;
      assert.ok(chain !== undefined);
      const label = async (address: string, account: string): Promise<string> => ((await smartAccountOf(mock, address)) === account.slice(2).toLowerCase() ? "yes" : "null");
      const accountA = deriveAccount(chain.owner(2).address);
      const accountB = deriveAccount(chain.owner(3).address);

      const undeployed = await label(accountA, accountA);
      await deployOwner(mock, 2);
      const deployed = await label(accountA, accountA);
      await enableTradingFor(mock, 2);
      const trading = await label(accountA, accountA);
      mock.state.markL1Created(accountB);
      const l1 = await label(accountB, accountB);
      const got = [undeployed, deployed, trading, l1] as const;
      assert.deepEqual(got, EXPECTED[trigger], trigger);

      // The owner EOA is never an answer, whatever the trigger says about its account.
      assert.equal(await smartAccountOf(mock, chain.owner(2).address), "null");
      // Registered by hand, under every trigger.
      const accountC = deriveAccount(chain.owner(4).address);
      assert.equal(await label(accountC, accountC), "null");
      mock.state.forceRegistered(accountC);
      assert.equal(await label(accountC, accountC), "yes");
      // The answer follows the switch at once; nothing is remembered.
      if (trigger !== "never") {
        mock.switches.set("registry.trigger", "never");
        assert.equal(await label(accountA, accountA), "null");
      }
    });
  }

  it("the table covers exactly the four values, and gives each a different answer", () => {
    assert.deepEqual(Object.keys(EXPECTED).sort(), [...switchValues("registry.trigger")].sort());
    const rows = Object.values(EXPECTED).map((row) => row.join(","));
    assert.equal(new Set(rows).size, rows.length);
  });

  harness.it("an account that deployed but never enabled trading stays unregistered under on-enable-trading even after more operations", async (mock) => {
    mock.switches.set("registry.trigger", "on-enable-trading");
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const { account } = await deployOwner(mock, 2);
    assert.equal(await smartAccountOf(mock, account), "null");
    assert.equal(mock.state.forcedRegistered.has(account.slice(2).toLowerCase()), false);
  });

  harness.it("the AccountDeployed log, not a code check, is the deployment test (an address with code that was never deployed by the EntryPoint is not registered)", async (mock) => {
    mock.switches.set("registry.trigger", "on-deploy");
    // The Kernel factory has code and no AccountDeployed log.
    const response = await getJson(mock, "orderbook", `/balance-allowance?address=${KERNEL_FACTORY}`);
    assert.equal((response.body as { smart_account: unknown }).smart_account, null);
    const logs = await getJson(mock, "explorer", `/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&topic0=${ACCOUNT_DEPLOYED_TOPIC}`);
    assert.equal((logs.body as { status: string }).status, "0");
  });

  it("without any chain, on-deploy and on-enable-trading register nothing and on-l1-create still works", async () => {
    const { startMockXo } = await import("./server.js");
    const started = await startMockXo({ chains: false, profile: { "registry.trigger": "on-deploy" } });
    assert.ok(started.ok);
    if (!started.ok) return;
    try {
      const { mock } = started;
      const address = "0xCAFE000000000000000000000000000000000A11";
      assert.equal(await smartAccountOf(mock, address), "null");
      mock.switches.set("registry.trigger", "on-enable-trading");
      assert.equal(await smartAccountOf(mock, address), "null");
      mock.switches.set("registry.trigger", "on-l1-create");
      mock.state.markL1Created(address);
      assert.equal(await smartAccountOf(mock, address), address.slice(2).toLowerCase());
    } finally {
      await started.mock.stop();
    }
  });
});

describe("the two profiles as the read mock sees them", () => {
  it("pessimistic: the XO node is down and nothing registers by itself; optimistic: the node is open and a deployed account registers", async (t) => {
    const { startMockXo } = await import("./server.js");
    const pessimistic = await startMockXo({ chains: { xo: true, base: false } });
    const optimistic = await startMockXo({ chains: { xo: true, base: false }, profile: "optimistic" });
    try {
      if (!pessimistic.ok || !optimistic.ok) return t.skip(pessimistic.ok ? (optimistic.ok ? "unavailable" : optimistic.reason) : pessimistic.reason);
      assert.deepEqual(pessimistic.mock.switches.snapshot(), PESSIMISTIC_PROFILE);
      assert.deepEqual(optimistic.mock.switches.snapshot(), OPTIMISTIC_PROFILE);
      await assert.rejects(postRpc(pessimistic.mock, "xoRpc", "eth_chainId"));
      assert.equal((await postRpc(optimistic.mock, "xoRpc", "eth_chainId")).status, 200);
      const owner = optimistic.mock.chains.xo?.owner(2);
      assert.ok(owner !== undefined);
      const { account } = await deployOwner(optimistic.mock, 2);
      assert.equal(await smartAccountOf(optimistic.mock, account), account.slice(2).toLowerCase());
      const pessimisticOwner = await deployOwner(pessimistic.mock, 2);
      assert.equal(await smartAccountOf(pessimistic.mock, pessimisticOwner.account), "null");
    } finally {
      if (pessimistic.ok) await pessimistic.mock.stop();
      if (optimistic.ok) await optimistic.mock.stop();
    }
  });
});
