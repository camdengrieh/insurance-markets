// The wallet screen's account map (docs/dapp-design.md 2.3 and 4.5; acceptance M2-2, M2-3, M2-8).
//
// A view over a registry, not a contract. The owner EOA is the only signer; the Kernel v3.1 account it owns is a
// pure function of the owner (core/account.ts) and is listed ONCE PER ENABLED CHAIN, each row with its own state
// read from that chain's own RPC. A chain this build has no public RPC for is "derived, not checked"; a chain
// whose RPC did not answer is "RPC unreachable". Neither is ever rendered as "undeployed" (M2-3).

import { z } from "zod/v4";

import { ACCOUNT_CHAINS, accountRows, classifyEoaCode, deriveKernelAccount, eoaWording, observeCode, type AccountChain, type AccountRow, type ChainObservation, type EoaCodeClass } from "../../core/account";
import type { EvmAddress } from "../../core/address";
import type { CapabilityFacts } from "../../core/capabilities";
import type { AdapterDeps } from "../../core/ports";
import { failureOf, type Failure } from "./failure";
import { createChainReader } from "./rpc";

export const ORDERBOOK_ORIGIN = "https://orderbooks.xo.market";

const registrySchema = z.looseObject({ smart_account: z.union([z.string().max(64), z.null()]).optional() });

// XO's registry: GET /balance-allowance?address=<ACCOUNT>. Only the ACCOUNT is ever asked (the owner always gets
// null, docs/research/19 section 6). true only when the answer names exactly this account. null = not read: this
// route is reachable only through the Cockpit, and an unanswered question is not "unregistered".
export async function readXoRegistration(deps: AdapterDeps, account: string): Promise<boolean | null> {
  try {
    const response = await deps.fetch(`${ORDERBOOK_ORIGIN}/balance-allowance?address=${account}`, { method: "GET", headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const parsed = registrySchema.safeParse(JSON.parse(await response.text()));
    if (!parsed.success) return null;
    const registered = parsed.data.smart_account;
    if (registered === null || registered === undefined) return false;
    const bare = registered.toLowerCase().replace(/^0x/, "");
    return bare === account.toLowerCase().replace(/^0x/, "");
  } catch {
    return null;
  }
}

export interface ChainState {
  readonly chain: AccountChain;
  readonly rpc: "none" | "answered" | "unreachable";
  readonly failure: Failure | null;
}

export interface AccountMap {
  // When the chains were read, on the injected clock.
  readonly fetchedAtMs: number;
  readonly owner: EvmAddress;
  readonly account: EvmAddress;
  readonly rows: readonly AccountRow[];
  readonly chains: readonly ChainState[];
  readonly eoa: { readonly code: EoaCodeClass; readonly wording: string; readonly checkedOn: string | null };
  readonly notes: readonly string[];
}

export type AccountMapResult = { readonly ok: true; readonly map: AccountMap } | { readonly ok: false; readonly code: string; readonly message: string };

export interface AccountMapInput {
  readonly deps: AdapterDeps;
  readonly owner: string;
  readonly chains?: readonly AccountChain[];
  readonly facts: CapabilityFacts;
  // The Cockpit build may also ask XO's orderbook whether the account is registered.
  readonly cockpit: boolean;
}

export async function loadAccountMap(input: AccountMapInput): Promise<AccountMapResult> {
  const derived = deriveKernelAccount(input.owner);
  if (!derived.ok) return { ok: false, code: derived.code, message: derived.message };
  const { owner, account } = derived;
  const chains = input.chains ?? ACCOUNT_CHAINS;
  const notes: string[] = [];

  // Every chain is read on its own, so one chain failing never changes another chain's row (M2-6 for chains).
  const perChain = await Promise.all(
    chains.map(async (chain): Promise<{ chain: AccountChain; state: ChainState; observation: ChainObservation; ownerRaw: string | null }> => {
      const reader = createChainReader(input.deps, chain);
      if (reader === null) {
        return { chain, state: { chain, rpc: "none", failure: null }, observation: { code: { kind: "unchecked" } }, ownerRaw: null };
      }
      try {
        const [accountRaw, ownerRaw] = await reader.readRawCodes([account, owner]);
        const accountCode = observeCode(accountRaw);
        const reached = accountCode.kind !== "unreachable";
        return {
          chain,
          state: { chain, rpc: reached ? "answered" : "unreachable", failure: null },
          observation: { code: accountCode },
          ownerRaw: ownerRaw ?? null,
        };
      } catch (error) {
        return { chain, state: { chain, rpc: "unreachable", failure: failureOf(error) }, observation: { code: { kind: "unreachable" } }, ownerRaw: null };
      }
    }),
  );

  // XO registration (Cockpit only). A registry entry without code on the chain is an anomaly the ladder reports.
  const observations: Record<number, ChainObservation | undefined> = {};
  for (const entry of perChain) observations[entry.chain.chainId] = entry.observation;
  const xo = perChain.find((entry) => entry.chain.isXo);
  if (xo !== undefined) {
    if (input.cockpit) {
      const registered = await readXoRegistration(input.deps, account);
      observations[xo.chain.chainId] = { ...xo.observation, venueRegistered: registered };
      if (registered === null) notes.push("XO's registry could not be read, so registration is not claimed.");
    } else {
      notes.push("XO registration is read through the Cockpit only; this build does not claim it.");
    }
  }

  const withRpc = perChain.filter((entry) => entry.state.rpc !== "none");
  if (input.cockpit && withRpc.length > 0 && withRpc.every((entry) => entry.state.rpc === "unreachable")) {
    notes.push("No chain answered. In the Cockpit build that usually means this page is not paired with your Cockpit; open the pairing link it printed when it started, then reload.");
  }

  // The owner's own code (EIP-7702 delegation shows as 0xef0100...): taken from the first chain that answered the
  // owner's code read. Until DT2 is recorded the wording stays "plain-EOA status unproven" either way.
  let eoa: AccountMap["eoa"] = { code: { kind: "unreachable" }, wording: eoaWording(input.facts, null), checkedOn: null };
  for (const entry of perChain) {
    if (entry.state.rpc !== "answered") continue;
    const code = classifyEoaCode(entry.ownerRaw);
    if (code.kind === "unreachable") continue;
    eoa = { code, wording: eoaWording(input.facts, code), checkedOn: entry.chain.name };
    break;
  }
  if (eoa.checkedOn === null) notes.push("The owner address was not checked for contract code on any chain.");

  return {
    ok: true,
    map: { fetchedAtMs: input.deps.nowMs(), owner, account, rows: accountRows({ owner, observations, facts: input.facts, chains }), chains: perChain.map((entry) => entry.state), eoa, notes },
  };
}
