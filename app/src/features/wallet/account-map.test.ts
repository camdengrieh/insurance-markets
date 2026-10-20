import { describe, expect, it } from "vitest";

import { ANVIL_ACCOUNT_0_ACCOUNT, ANVIL_ACCOUNT_0_OWNER, KERNEL_PROXY_RUNTIME_CODE } from "@shared/xo/chain/constants";

import { ACCOUNT_CHAINS, chainById } from "../../core/account";
import { NO_FACTS, readFacts } from "../../core/capabilities";
import { loadAccountMap } from "./account-map";
import { fakeNetwork, manualClock, type FakeChain } from "./testkit";

// Acceptance M2-2 (the Anvil-0 owner derives 0xB372...), M2-3 (a derived address is never a deposit target before
// code is present, and an unreachable RPC is never "undeployed"), M2-8 (the same account listed per chain with
// its own state).

const OWNER = ANVIL_ACCOUNT_0_OWNER;
const ACCOUNT = ANVIL_ACCOUNT_0_ACCOUNT.toLowerCase();
const HOSTS = { 3223: "rpc-mainnet-2.xo.market", 8453: "base-rpc.publicnode.com", 137: "polygon-bor-rpc.publicnode.com", 56: "bsc-rpc.publicnode.com", 999: "rpc.hyperliquid.xyz" } as const;

const deployed = (): FakeChain => ({ codes: { [ACCOUNT]: KERNEL_PROXY_RUNTIME_CODE }, multicall: true, batch: true });
const empty = (): FakeChain => ({ multicall: true, batch: true });

function run(rpc: Record<string, FakeChain>, options: { cockpit?: boolean; registry?: unknown; facts?: ReturnType<typeof readFacts> } = {}) {
  const net = fakeNetwork({
    rpc,
    get: { "orderbooks.xo.market/balance-allowance": () => (options.registry === undefined ? { status: 404 } : { body: options.registry }) },
  });
  const clock = manualClock(1_760_000_000_000);
  return {
    net,
    result: loadAccountMap({ deps: { fetch: net.fetch, nowMs: clock.nowMs }, owner: OWNER, facts: options.facts ?? NO_FACTS, cockpit: options.cockpit ?? false }),
  };
}

describe("account map", () => {
  it("M2-2: the Anvil account 0 owner derives 0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d", async () => {
    const { result } = run({ [HOSTS[8453]]: empty() });
    const map = await result;
    expect(map.ok).toBe(true);
    if (!map.ok) return;
    expect(map.map.account).toBe("0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d");
    expect(map.map.owner).toBe(OWNER);
    for (const row of map.map.rows) expect(row.address).toBe("0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d");
  });

  it("refuses an owner that is not a usable address", async () => {
    const net = fakeNetwork({});
    for (const bad of ["", "0x123", "vitalik.eth", "0x0000000000000000000000000000000000000000"]) {
      const result = await loadAccountMap({ deps: { fetch: net.fetch, nowMs: () => 0 }, owner: bad, facts: NO_FACTS, cockpit: false });
      expect(result.ok).toBe(false);
    }
    expect(net.calls).toHaveLength(0);
  });

  it("M2-8: lists the account on every enabled chain, each row with its own state", async () => {
    const { result } = run({
      [HOSTS[8453]]: deployed(),
      [HOSTS[137]]: empty(),
      [HOSTS[56]]: { down: true },
      [HOSTS[3223]]: deployed(),
      [HOSTS[999]]: empty(),
    });
    const map = await result;
    if (!map.ok) throw new Error("expected a map");
    const byChain = new Map(map.map.rows.map((row) => [row.chain.chainId, row] as const));
    expect(map.map.rows).toHaveLength(ACCOUNT_CHAINS.length);
    expect(byChain.get(8453)?.status).toBe("code-present");
    expect(byChain.get(137)?.status).toBe("derived");
    expect(byChain.get(56)?.status).toBe("rpc-unreachable");
    // Chains with no public RPC in this build are listed and not checked.
    expect(byChain.get(42161)?.status).toBe("derived");
    expect(map.map.chains.find((state) => state.chain.chainId === 42161)?.rpc).toBe("none");
    expect(map.map.chains.find((state) => state.chain.chainId === 56)?.rpc).toBe("unreachable");
    // One chain being down changed nothing about another chain's row.
    expect(byChain.get(8453)?.deposit.allowed).toBe(true);
  });

  it("M2-3: a derived (counterfactual) address is never a deposit target", async () => {
    const { result } = run({ [HOSTS[8453]]: empty(), [HOSTS[137]]: empty() });
    const map = await result;
    if (!map.ok) throw new Error("expected a map");
    for (const row of map.map.rows) {
      if (row.status === "derived") {
        expect(row.deposit.allowed).toBe(false);
        expect(row.deposit.reasons.join(" ")).toMatch(/counterfactual|not deployed/i);
      }
    }
    // A chain whose RPC said "0x" is counterfactual in words; one never read is "deployment not checked".
    const base = map.map.rows.find((row) => row.chain.chainId === 8453);
    expect(base?.statusText).toMatch(/counterfactual/);
    const arbitrum = map.map.rows.find((row) => row.chain.chainId === 42161);
    expect(arbitrum?.statusText).toMatch(/not checked/);
  });

  it("M2-3: an unreachable RPC is never rendered as 'undeployed'", async () => {
    const { result } = run({ [HOSTS[8453]]: { down: true }, [HOSTS[137]]: { status: 503 } });
    const map = await result;
    if (!map.ok) throw new Error("expected a map");
    for (const id of [8453, 137]) {
      const row = map.map.rows.find((candidate) => candidate.chain.chainId === id);
      expect(row?.status).toBe("rpc-unreachable");
      expect(row?.statusText).toMatch(/unreachable/i);
      expect(row?.statusText).not.toMatch(/undeployed|not deployed|counterfactual/i);
      expect(row?.deposit.allowed).toBe(false);
    }
  });

  it("M2-3: on XO even a deployed account is not a deposit target until door (a) is proven", async () => {
    const without = await run({ [HOSTS[3223]]: deployed() }).result;
    if (!without.ok) throw new Error("expected a map");
    const xo = without.map.rows.find((row) => row.chain.isXo);
    expect(xo?.status).toBe("code-present");
    expect(xo?.deposit.allowed).toBe(false);
    expect(xo?.deposit.reasons.join(" ")).toMatch(/door a/);

    const proven = readFacts({ door_a_bundler_admits_first_userop: "yes" });
    const withDoor = await run({ [HOSTS[3223]]: deployed() }, { facts: proven }).result;
    if (!withDoor.ok) throw new Error("expected a map");
    expect(withDoor.map.rows.find((row) => row.chain.isXo)?.deposit.allowed).toBe(true);
  });

  it("only the exact Kernel runtime counts as code-present: other code is foreign, never a target", async () => {
    const { result } = run({ [HOSTS[8453]]: { codes: { [ACCOUNT]: "0x6001600055" }, multicall: true, batch: true } });
    const map = await result;
    if (!map.ok) throw new Error("expected a map");
    const base = map.map.rows.find((row) => row.chain.chainId === 8453);
    expect(base?.status).toBe("foreign-code");
    expect(base?.deposit.allowed).toBe(false);
  });

  it("XO registration is read in the Cockpit build only, and only for THIS account", async () => {
    const registered = { balance: "0", allowance: "0", smart_account: ACCOUNT.slice(2) };
    const cockpit = await run({ [HOSTS[3223]]: deployed() }, { cockpit: true, registry: registered }).result;
    if (!cockpit.ok) throw new Error("expected a map");
    expect(cockpit.map.rows.find((row) => row.chain.isXo)?.status).toBe("venue-registered");

    // A registry naming a different account is not registration of this one.
    const other = { balance: "0", allowance: "0", smart_account: "4444444444444444444444444444444444444444" };
    const mismatch = await run({ [HOSTS[3223]]: deployed() }, { cockpit: true, registry: other }).result;
    if (!mismatch.ok) throw new Error("expected a map");
    expect(mismatch.map.rows.find((row) => row.chain.isXo)?.status).toBe("code-present");

    // Standalone never claims registration, and says so.
    const standalone = await run({ [HOSTS[3223]]: deployed() }, { cockpit: false, registry: registered }).result;
    if (!standalone.ok) throw new Error("expected a map");
    expect(standalone.map.rows.find((row) => row.chain.isXo)?.status).toBe("code-present");
    expect(standalone.map.notes.join(" ")).toMatch(/does not claim/);
  });

  it("a registry entry on a chain with no code is an anomaly, not an upgrade", async () => {
    const registered = { balance: "0", allowance: "0", smart_account: ACCOUNT };
    const { result } = run({ [HOSTS[3223]]: empty() }, { cockpit: true, registry: registered });
    const map = await result;
    if (!map.ok) throw new Error("expected a map");
    const xo = map.map.rows.find((row) => row.chain.isXo);
    expect(xo?.status).toBe("derived");
    expect(xo?.anomalies).toContain("registry_without_deployment");
  });

  it("an unreadable registry is 'not read', not 'unregistered'", async () => {
    const { result } = run({ [HOSTS[3223]]: deployed() }, { cockpit: true });
    const map = await result;
    if (!map.ok) throw new Error("expected a map");
    expect(map.map.notes.join(" ")).toMatch(/could not be read/);
    expect(map.map.rows.find((row) => row.chain.isXo)?.status).toBe("code-present");
  });

  it("DT2 wording: delegated owner code is said so; a plain owner stays 'unproven' until the fact is recorded", async () => {
    const delegate = "0x" + "ef0100" + "ab".repeat(20);
    const delegated = await run({ [HOSTS[8453]]: { codes: { [OWNER.toLowerCase()]: delegate }, multicall: true, batch: true } }).result;
    if (!delegated.ok) throw new Error("expected a map");
    expect(delegated.map.eoa.wording).toMatch(/delegated to 0x/i);

    const plain = await run({ [HOSTS[8453]]: empty() }).result;
    if (!plain.ok) throw new Error("expected a map");
    expect(plain.map.eoa.code.kind).toBe("plain");
    expect(plain.map.eoa.wording).toMatch(/unproven/);

    const proven = await run({ [HOSTS[8453]]: empty() }, { facts: readFacts({ paybox_address_is_plain_eoa: "yes" }) }).result;
    if (!proven.ok) throw new Error("expected a map");
    expect(proven.map.eoa.wording).toMatch(/no delegation seen/);
  });

  it("only listed chains are asked", async () => {
    const net = fakeNetwork({ rpc: { [HOSTS[8453]]: empty() } });
    const base = chainById(8453) as NonNullable<ReturnType<typeof chainById>>;
    const result = await loadAccountMap({ deps: { fetch: net.fetch, nowMs: () => 0 }, owner: OWNER, chains: [base], facts: NO_FACTS, cockpit: false });
    expect(result.ok && result.map.rows).toHaveLength(1);
    expect(new Set(net.calls.map((call) => call.url.hostname))).toEqual(new Set([HOSTS[8453]]));
  });
});
