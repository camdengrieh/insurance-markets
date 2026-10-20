// Helpers for tests that use the mock. Not a test file.
//
//   const harness = useMock({ chains: { xo: true, base: false } });   // inside a describe()
//   harness.it("does a thing", async (mock) => { ... });
//
// useMock starts one mock for the suite, stops it afterwards (every listener and every anvil), puts the
// mock back to its pessimistic default between tests, and fails a test that made a handler throw. A mock
// that cannot start because anvil is missing skips the tests with the reason; any other startup failure
// throws and fails the suite.

import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, it, type TestContext } from "node:test";

import type { Address } from "viem";

import { deriveAccount } from "../../src/xo/account/derive.js";
import { CTF_EXCHANGE } from "../../src/xo/chain/constants.js";
import { GAS_DEFAULTS } from "../../src/xo/chain/constants.js";
import { approveCall, buildOp, enableTradingCalls } from "../anvil/scenarios.js";
import { startMockXo, type MockXo, type MockXoOptions } from "./server.js";

export interface MockHarness {
  readonly mock: MockXo;
  readonly skipReason: string | null;
  it(name: string, body: (mock: MockXo, t: TestContext) => Promise<void> | void): void;
}

export function useMock(options: MockXoOptions = {}): MockHarness {
  let started: MockXo | undefined;
  let skip: string | null = null;
  // One snapshot per chain, retaken after every revert (anvil consumes a snapshot id when it reverts to it).
  const snapshots = new Map<"xo" | "base", string>();
  before(async () => {
    const result = await startMockXo(options);
    if (result.ok) started = result.mock;
    else skip = result.reason;
    for (const name of ["xo", "base"] as const) {
      const chain = started?.chains.chain(name);
      if (chain !== undefined) snapshots.set(name, await chain.snapshot());
    }
  });
  after(async () => {
    await started?.stop();
  });
  beforeEach(async () => {
    if (started === undefined) return;
    // Every test starts from the chain as the suite found it, so tests can reuse the same test owners.
    for (const [name, id] of snapshots) {
      const chain = started.chains.chain(name);
      if (chain === undefined) continue;
      await chain.revert(id);
      snapshots.set(name, await chain.snapshot());
    }
    started.setProfile("pessimistic");
    started.faults.clear();
    started.state.reset();
    started.setRateLimit("orderbook", null);
    started.setRateLimit("dataApi", null);
    started.explorer.syntheticLogs.length = 0;
    started.explorer.pendingLogRows.length = 0;
    started.explorer.pendingTransactions.length = 0;
    started.explorer.blankLogAddresses = false;
    started.explorer.spanLimitBlocks = Number.POSITIVE_INFINITY;
    started.explorer.rowCap = 1_000;
    started.explorer.capMode = "earliest";
    started.explorer.fillDelaySeconds = 300;
    started.explorer.neverFill.clear();
    started.clearRequests();
  });
  afterEach(() => {
    if (started !== undefined) assert.deepEqual(started.internalErrors().map((error) => error.stack), [], "a mock handler threw");
  });
  return {
    get mock(): MockXo {
      if (started === undefined) throw new Error("the mock did not start");
      return started;
    },
    get skipReason(): string | null {
      return skip;
    },
    it(name, body) {
      it(name, async (t) => {
        if (skip !== null || started === undefined) return t.skip(skip ?? "the mock did not start");
        await body(started, t);
      });
    },
  };
}

export interface DeployedOwner {
  readonly owner: Address;
  readonly account: Address;
  readonly userOpHashes: readonly string[];
}

// Deploys the test owner's account on the mock's XO chain with a sponsored UserOp (the real EntryPoint, factory,
// validator and PolicyPaymaster run). With enableTrading the batch is XO's own Enable Trading; without it the
// first op only approves the exchange for zero, which deploys the account and leaves trading off. Owner indexes
// are the public Anvil test accounts 0 to 9.
export async function deployOwner(mock: MockXo, index: number, options: { readonly enableTrading?: boolean } = {}): Promise<DeployedOwner> {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined, "the mock has no XO chain");
  // This lands the operation straight on the chain, not through the bundler, so the paymaster must sponsor
  // whatever paymaster.state says (the default, pessimistic profile pauses it the first time anything reads it).
  await mock.paymaster.reconcile("sponsor");
  const owner = chain.owner(index);
  const first = await buildOp({
    chain,
    owner,
    init: true,
    sponsored: true,
    calls: options.enableTrading === true ? enableTradingCalls() : [approveCall(CTF_EXCHANGE, 0n)],
  });
  const landed = await chain.handleOps([first.op]);
  assert.equal(landed.ok, true, "the deploying UserOp must land");
  assert.equal(first.account, deriveAccount(owner.address));
  return { owner: owner.address, account: first.account, userOpHashes: [first.hash] };
}

// A second operation for an already deployed account: XO's Enable Trading batch (sequence 1).
export async function enableTradingFor(mock: MockXo, index: number): Promise<string> {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined, "the mock has no XO chain");
  await mock.paymaster.reconcile("sponsor");
  const owner = chain.owner(index);
  const op = await buildOp({ chain, owner, sponsored: true, sequence: 1n, gas: GAS_DEFAULTS.enableTrading, calls: enableTradingCalls() });
  const landed = await chain.handleOps([op.op]);
  assert.equal(landed.ok, true, "the Enable Trading UserOp must land");
  return op.hash;
}

// GET against a listener, returning the status, the headers and the parsed JSON (or the raw text).
export async function getJson(mock: MockXo, listener: keyof MockXo["urls"], path: string, init: RequestInit = {}): Promise<{ status: number; headers: Headers; body: unknown; text: string }> {
  const response = await globalThis.fetch(`${mock.urls[listener]}${path}`, init);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    // keep the text
  }
  return { status: response.status, headers: response.headers, body, text };
}

export async function postRpc(mock: MockXo, listener: "xoRpc" | "baseRpc" | "bundler", method: string, params: readonly unknown[] = [], id: number | string = 1): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await globalThis.fetch(mock.urls[listener], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}
