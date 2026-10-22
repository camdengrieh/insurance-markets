import { describe, expect, it } from "vitest";

import { ANVIL_ACCOUNT_0_ACCOUNT, ANVIL_ACCOUNT_0_OWNER } from "@shared/xo/chain/constants";

import { ACCOUNT_CHAINS, deriveKernelAccount } from "../../core/account";
import type { FetchLike } from "../../core/ports";
import { createChainReader, MULTICALL3_ADDRESS } from "../wallet/rpc";
import { readExplorerBalances } from "../wallet/balances";
import { loadAccountMap } from "../wallet/account-map";
import { NO_FACTS } from "../../core/capabilities";
import { createPolymarketAdapter } from "@sdk/venues/polymarket";
import { readXoAccount } from "./xo-reads";

// Opt-in live drift suite for the wallet and portfolio reads (docs/dapp-design.md 7.5 DT8). Skipped unless
// APP_LIVE=1, never part of a default or CI run, and WRITTEN BUT NOT RUN when this file was added.
//
// What it does when asked: GET requests and read-only JSON-RPC POSTs (eth_getCode, eth_call, eth_getBalance), one
// at a time, about three per second, with the scripted-research user-agent, to hosts that are already in
// app/headers.config.ts. It sends no credential, no cookie and no Origin header, and follows no redirect.
//
//   APP_LIVE=1 pnpm --dir app exec vitest run src/features/portfolio/live.test.ts
//
// For the first populated read (DT8) the operator may name THEIR OWN public address:
//   APP_LIVE=1 APP_LIVE_OWNER=0x... pnpm --dir app exec vitest run src/features/portfolio/live.test.ts
// The address is read from the environment for this run only. The test prints counts, never the address or any
// position, and stores nothing.

const LIVE = process.env.APP_LIVE === "1";
const suite = LIVE ? describe : describe.skip;

const USER_AGENT = "insurance-markets-research/0.1";
const PACE_MS = 330;
const TIMEOUT_MS = 15_000;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const liveFetch: FetchLike = async (input, init) => {
  await sleep(PACE_MS);
  return fetch(input, {
    method: init?.method ?? "GET",
    headers: { "user-agent": USER_AGENT, ...(init?.headers ?? {}) },
    ...(init?.body === undefined ? {} : { body: init.body }),
    redirect: "error",
    signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
  });
};
const deps = { fetch: liveFetch, nowMs: (): number => Date.now() };

suite("wallet and portfolio live drift (APP_LIVE=1, read-only)", () => {
  it("the public RPCs answer eth_getCode for the derived account, and each answer is a real observation", async () => {
    for (const chain of ACCOUNT_CHAINS) {
      const reader = createChainReader(deps, chain);
      if (reader === null) continue;
      const [observation] = await reader.readCodes([ANVIL_ACCOUNT_0_ACCOUNT]);
      expect(["kernel_proxy", "none", "other_code"], chain.name).toContain(observation?.kind);
    }
  });

  it("reports which chains have Multicall3 (the reads fall back to a batch where one is missing)", async () => {
    const seen: string[] = [];
    for (const chain of ACCOUNT_CHAINS) {
      const reader = createChainReader(deps, chain);
      if (reader === null) continue;
      const [observation] = await reader.readCodes([MULTICALL3_ADDRESS]);
      seen.push(`${chain.name}:${observation?.kind === "none" ? "absent" : "present"}`);
    }
    console.info(`Multicall3 ${seen.join(", ")}`);
    expect(seen.length).toBeGreaterThan(0);
  });

  it("the account map for the public test owner builds for every chain with its own state", async () => {
    const result = await loadAccountMap({ deps, owner: ANVIL_ACCOUNT_0_OWNER, facts: NO_FACTS, cockpit: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.map.rows).toHaveLength(ACCOUNT_CHAINS.length);
      expect(result.map.account).toBe(ANVIL_ACCOUNT_0_ACCOUNT);
    }
  });

  it("XO's Data API answers an unknown account with a 404 that we treat as 'no profile'", async () => {
    const dummy = deriveKernelAccount("0xcafe000000000000000000000000000000000a11");
    if (!dummy.ok) throw new Error("derive");
    const read = await readXoAccount(deps, { bindingId: "live", account: dummy.account, cockpit: false });
    expect(read.rows).toEqual([]);
    expect(read.profile).toBe("none");
  });

  it("the XO explorer answers the Blockscout-style address routes in the shape the parser reads (or 404)", async () => {
    const result = await readExplorerBalances(deps, ANVIL_ACCOUNT_0_ACCOUNT);
    expect(result.skipped).toBe(0);
  });

  it("DT8: the operator's own address reads without a refused row (counts only are printed)", async () => {
    const owner = process.env.APP_LIVE_OWNER;
    if (owner === undefined || owner === "") return;
    const derived = deriveKernelAccount(owner);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    const xo = await readXoAccount(deps, { bindingId: "live", account: derived.account, cockpit: false });
    const adapter = createPolymarketAdapter(deps);
    const profile = await adapter.lookupProxyWallet(owner);
    let polymarket = 0;
    let polymarketRejected = 0;
    if (profile.ok) {
      const page = await adapter.getPositionsByAddress(profile.value.proxyWallet, { status: "OPEN" });
      polymarket = page.items.length;
      polymarketRejected = page.rejected.length;
    }
    console.info(`DT8 counts: xo rows ${xo.rows.length} (rejected ${xo.rejected}), polymarket rows ${polymarket} (rejected ${polymarketRejected})`);
    // A refused row means the venue's populated shape differs from the one the parsers were written for.
    expect(xo.rejected).toBe(0);
    expect(polymarketRejected).toBe(0);
  });
});
