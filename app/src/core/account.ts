// The account derivation view-model (acceptance M2-2, M2-3, M2-8; docs/dapp-design.md 2.3 and 2.5).
//
// The wallet screen is a VIEW over a registry, not a contract. The PayBox EOA is the only owner. The Kernel v3.1
// account it owns is a pure function of the owner (src/xo/account/derive.ts, no key, no network):
//
//   Anvil account 0  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266  ->  0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d
//
// The same address is derived for every chain, but it is only an ADDRESS MAP: on every chain except XO 3223 the
// account stays counterfactual until deployed, and on XO it can execute only after door (a) is proven.
//
// Status ladder per chain (this gates what the UI may say):
//   derived -> code-present (eth_getCode returned the exact Kernel proxy runtime, never an explorer's is_contract)
//   -> venue-registered (XO: smart_account non-null for THIS account) -> trading-enabled.
// An address is shown as a deposit target only at code-present or later (and on XO only after door (a)).
// "rpc-unreachable" is a state of its own and is never rendered as "undeployed".

import { deriveAccount, isKernelProxyRuntime } from "@shared/xo/account/derive";

import { checkEvmAddress, type AddressWarning, type EvmAddress, type SavedAddress } from "./address";
import { isProven, type CapabilityFacts } from "./capabilities";
import type { ReadService } from "../../headers.config";

export interface AccountChain {
  readonly chainId: number;
  readonly caip2: string;
  readonly name: string;
  // The public RPC the build may use (a service id with a CSP entry), or null when the user must supply one.
  readonly rpcService: ReadService | null;
  readonly isXo: boolean;
}

function chain(chainId: number, name: string, rpcService: ReadService | null = null): AccountChain {
  return Object.freeze({ chainId, caip2: `eip155:${chainId}`, name, rpcService, isXo: chainId === 3223 });
}

// The nine chains on which the real factory was measured to return the derived address (dapp-design 2.5), plus
// XO 3223, which is the one chain where the account is used.
export const ACCOUNT_CHAINS: readonly AccountChain[] = Object.freeze([
  chain(3223, "XO", "xo_rpc"),
  chain(8453, "Base", "rpc_base"),
  chain(137, "Polygon", "rpc_polygon"),
  chain(56, "BNB Chain", "rpc_bnb"),
  chain(999, "HyperEVM", "hyperliquid_rpc"),
  chain(42161, "Arbitrum"),
  chain(1, "Ethereum"),
  chain(10, "Optimism"),
  chain(43114, "Avalanche"),
  chain(100, "Gnosis"),
]);

export function chainById(chainId: number): AccountChain | undefined {
  return ACCOUNT_CHAINS.find((entry) => entry.chainId === chainId);
}

// ---- observations --------------------------------------------------------------------------------------------------------

export type CodeObservation =
  | { readonly kind: "kernel_proxy" } // the exact Kernel proxy runtime: positive proof of a deployed Kernel
  | { readonly kind: "other_code" } // some other contract at the address: never a deposit target
  | { readonly kind: "none" } // a reachable RPC returned "0x"
  | { readonly kind: "unreachable" } // no usable answer
  | { readonly kind: "unchecked" }; // not asked

// An eth_getCode result (hex string) or null for "the call failed". A malformed answer is "unreachable", never
// "none": a garbage reply is not evidence of anything.
export function observeCode(raw: string | null | undefined): CodeObservation {
  if (raw === null || raw === undefined) return { kind: "unreachable" };
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(raw)) return { kind: "unreachable" };
  if (raw === "0x") return { kind: "none" };
  return isKernelProxyRuntime(raw) ? { kind: "kernel_proxy" } : { kind: "other_code" };
}

export interface ChainObservation {
  readonly code: CodeObservation;
  // XO only: GET /balance-allowance for THIS ACCOUNT returned smart_account equal to it. null = not read.
  readonly venueRegistered?: boolean | null;
  // Trading enabled (allowances in place). null = not read.
  readonly tradingEnabled?: boolean | null;
}

// ---- the view-model -------------------------------------------------------------------------------------------------------

export const ACCOUNT_STATUSES = ["derived", "code-present", "venue-registered", "trading-enabled", "rpc-unreachable", "foreign-code"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface DepositDecision {
  readonly allowed: boolean;
  // Why not, in plain words. Empty when allowed.
  readonly reasons: readonly string[];
}

export interface AccountRow {
  readonly chain: AccountChain;
  readonly owner: EvmAddress;
  // The derived Kernel account. The same value on every row.
  readonly address: EvmAddress;
  readonly status: AccountStatus;
  readonly statusText: string;
  readonly deposit: DepositDecision;
  // Set when the observations contradict each other (registered without code, a registry entry for foreign code).
  readonly anomalies: readonly string[];
}

export type DeriveResult =
  | { readonly ok: true; readonly owner: EvmAddress; readonly account: EvmAddress; readonly warnings: readonly AddressWarning[] }
  | { readonly ok: false; readonly code: string; readonly message: string };

// Validates the pasted owner (EIP-55, not zero, not a protocol contract) and derives its Kernel account.
export function deriveKernelAccount(ownerInput: unknown, saved: readonly SavedAddress[] = []): DeriveResult {
  const checked = checkEvmAddress(ownerInput, saved, { role: "wallet" });
  if (!checked.ok) return { ok: false, code: checked.code, message: checked.message };
  return { ok: true, owner: checked.address, account: deriveAccount(checked.address) as EvmAddress, warnings: checked.warnings };
}

function ladder(observation: ChainObservation): { status: AccountStatus; anomalies: string[] } {
  const anomalies: string[] = [];
  const { code } = observation;
  if (code.kind === "unreachable") return { status: "rpc-unreachable", anomalies };
  if (code.kind === "other_code") {
    anomalies.push("foreign_code");
    return { status: "foreign-code", anomalies };
  }
  if (code.kind === "kernel_proxy") {
    if (observation.venueRegistered === true && observation.tradingEnabled === true) return { status: "trading-enabled", anomalies };
    if (observation.venueRegistered === true) return { status: "venue-registered", anomalies };
    if (observation.tradingEnabled === true) anomalies.push("trading_without_registration");
    return { status: "code-present", anomalies };
  }
  // none or unchecked: nothing proves a deployment. A registry entry without code is an anomaly, not an upgrade.
  if (observation.venueRegistered === true) anomalies.push("registry_without_deployment");
  return { status: "derived", anomalies };
}

function statusText(status: AccountStatus, code: CodeObservation): string {
  switch (status) {
    case "derived":
      return code.kind === "none"
        ? "derived: counterfactual, not deployed (no code seen on this chain by the RPC asked)"
        : "derived: counterfactual, deployment not checked";
    case "code-present":
      return "code present: the Kernel account is deployed on this chain";
    case "venue-registered":
      return "registered with the venue";
    case "trading-enabled":
      return "trading enabled";
    case "rpc-unreachable":
      return "RPC unreachable: the state of this account is unknown";
    case "foreign-code":
      return "other contract code at this address: do not use";
  }
}

function depositDecision(row: { chain: AccountChain; status: AccountStatus; anomalies: readonly string[] }, facts: CapabilityFacts): DepositDecision {
  const reasons: string[] = [];
  switch (row.status) {
    case "code-present":
    case "venue-registered":
    case "trading-enabled":
      break;
    case "derived":
      reasons.push("The account is counterfactual: not deployed on this chain, so it is not a deposit target.");
      break;
    case "rpc-unreachable":
      reasons.push("The chain could not be read, so the account state is unknown. Try again or use your own RPC.");
      break;
    case "foreign-code":
      reasons.push("Other contract code sits at this address.");
      break;
  }
  if (row.anomalies.length > 0) reasons.push(`Inconsistent evidence: ${row.anomalies.join(", ")}.`);
  // On XO the account can only be created through XO's own bundler: until door (a) is proven, even a deployed
  // account is not offered as a deposit target (an undeployed one can only be moved by a UserOp).
  if (row.chain.isXo && !isProven(facts.door_a_bundler_admits_first_userop)) {
    reasons.push("XO: the bundler's admission of a first UserOp from this account is unproven (door a).");
  }
  return Object.freeze({ allowed: reasons.length === 0, reasons: Object.freeze(reasons) });
}

export interface AccountMapInput {
  readonly owner: EvmAddress;
  // chainId -> what was observed. A chain with no entry is "unchecked".
  readonly observations: Readonly<Record<number, ChainObservation | undefined>>;
  readonly facts: CapabilityFacts;
  // Which chains to list. Default: all of ACCOUNT_CHAINS.
  readonly chains?: readonly AccountChain[];
}

// One row per enabled chain, each with its OWN state (M2-8). The owner must already be a checked address.
export function accountRows(input: AccountMapInput): readonly AccountRow[] {
  const account = deriveAccount(input.owner) as EvmAddress;
  return Object.freeze(
    (input.chains ?? ACCOUNT_CHAINS).map((entry) => {
      const observation = input.observations[entry.chainId] ?? { code: { kind: "unchecked" } as const };
      const { status, anomalies } = ladder(observation);
      const row = { chain: entry, status, anomalies };
      return Object.freeze({
        chain: entry,
        owner: input.owner,
        address: account,
        status,
        statusText: statusText(status, observation.code),
        deposit: depositDecision(row, input.facts),
        anomalies: Object.freeze(anomalies),
      });
    }),
  );
}

// ---- the owner EOA's own wording (DT2) -------------------------------------------------------------------------------------

export type EoaCodeClass =
  | { readonly kind: "plain" } // eth_getCode returned 0x
  | { readonly kind: "delegated"; readonly delegate: EvmAddress } // 0xef0100 + 20 bytes: an EIP-7702 delegation
  | { readonly kind: "contract" } // some other code
  | { readonly kind: "unreachable" };

export function classifyEoaCode(raw: string | null | undefined): EoaCodeClass {
  if (raw === null || raw === undefined || !/^0x(?:[0-9a-fA-F]{2})*$/.test(raw)) return { kind: "unreachable" };
  if (raw === "0x") return { kind: "plain" };
  const lower = raw.toLowerCase();
  if (lower.startsWith("0xef0100") && lower.length === 2 + 2 * 23) {
    return { kind: "delegated", delegate: `0x${lower.slice(8)}` as EvmAddress };
  }
  return { kind: "contract" };
}

// Any wording that calls the PayBox address a plain EOA is gated on DT2 (a recorded "yes"). Until then the
// screen says what is known.
export function eoaWording(facts: CapabilityFacts, observed: EoaCodeClass | null): string {
  if (observed !== null && observed.kind === "delegated") return `delegated to ${observed.delegate} (EIP-7702)`;
  if (observed !== null && observed.kind === "contract") return "has contract code: not a plain EOA";
  if (isProven(facts.paybox_address_is_plain_eoa) && observed !== null && observed.kind === "plain") return "EOA: no delegation seen";
  return "address (plain-EOA status unproven)";
}
