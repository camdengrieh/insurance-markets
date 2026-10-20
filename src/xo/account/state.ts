// The account state machine: undeployed | deployed_unregistered | registered | unknown.
//
// Inputs are already-read observations, so this file is pure:
//   logs      AccountDeployed (topic2 = account) and OwnerRegistered (topic1 = account), from
//             src/xo/chain/reads.ts readDeploymentLogs. Positive proof of deployment, and the only
//             source of "no": a complete read with no matching log.
//   code      optional eth_getCode result (an open RPC): the exact Kernel proxy runtime is positive proof.
//   registry  GET /balance-allowance?address=<ACCOUNT>: smart_account equals the account when XO's
//             orderbook knows it. Never query it with the owner (it answers null for every owner,
//             docs/research/19 sec 6).
//
// Rules that hold in every branch (docs/phase1-gap-closing.md AD2, AD4, AD6, AD7, A11):
//   - The explorer's smart-contracts endpoint, is_contract and any 404 are NOT evidence of anything
//     negative (10 of 12 deployed accounts returned 404). A lookup can only add positive proof.
//   - Funding and signing helpers need POSITIVE proof of deployment. A single negative, two negatives
//     or an unreadable answer never relaxes them; "two consecutive negatives" only ever applied to
//     blocking a signature, never to allowing one.
//   - Anything inconsistent (a different owner registered for the account, a registry entry for an
//     account with no deployment proof, foreign code at the address) is `unknown`, not a guess.

import type { Address } from "../chain/constants.js";
import type { CodeObservation, DeploymentLogs } from "../chain/reads.js";
import { isKernelProxyRuntime, parseOwner, requireDerivedAccount } from "./derive.js";

export type AccountState = "undeployed" | "deployed_unregistered" | "registered" | "unknown";
export type Tri = "yes" | "no" | "unknown";

export type DeploymentEvidence = "account_deployed_log" | "owner_registered_log" | "rpc_code" | "explorer_code";

export type AccountAnomaly =
  | "owner_mismatch" // OwnerRegistered names a different owner for this account
  | "registry_account_mismatch" // /balance-allowance names a different address as the smart account
  | "registry_without_deployment" // registered, but no proof of deployment (explorer lag or a wrong account)
  | "foreign_code" // code at the account that is not the Kernel proxy runtime
  | "logs_unreadable" // the deployment logs could not be read at all
  | "logs_incomplete"; // the deployment logs were read but may be missing rows

export type RegistryObservation =
  // smartAccount is the value of smart_account from GET /balance-allowance for the ACCOUNT address:
  // a hex address (with or without 0x, any case) or null.
  | { readonly kind: "read"; readonly smartAccount: string | null }
  | { readonly kind: "unavailable" };

// A result of an explorer `smart-contracts/<account>` lookup. Only a 200 whose deployed bytecode is the
// Kernel proxy runtime counts, as positive proof; every other outcome is ignored.
export interface ExplorerContractLookup {
  readonly status: number;
  readonly deployedBytecode?: string | null;
}

export interface AccountStateInput {
  readonly owner: string;
  // Optional: an account supplied from outside is compared with the derived one and refused on a mismatch.
  readonly suppliedAccount?: string | null;
  // null when the log read failed.
  readonly logs: DeploymentLogs | null;
  readonly code?: CodeObservation | null;
  readonly explorerLookup?: ExplorerContractLookup | null;
  readonly registry: RegistryObservation;
}

export interface AccountStateResult {
  readonly owner: Address;
  readonly account: Address;
  readonly state: AccountState;
  readonly deployed: Tri;
  readonly registered: Tri;
  readonly evidence: readonly DeploymentEvidence[];
  readonly anomalies: readonly AccountAnomaly[];
  // True when an explorer lookup said "no code" or 404 and was ignored on purpose.
  readonly ignoredNegativeLookup: boolean;
  // Fixed text, safe to show.
  readonly reason: string;
}

function bareLower(value: string): string {
  return (value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value).toLowerCase();
}

export function deriveAccountState(input: AccountStateInput): AccountStateResult {
  const owner = parseOwner(input.owner);
  // A supplied account is compared with the derivation and refused on any difference (AD1).
  const account = requireDerivedAccount(owner, input.suppliedAccount);

  const evidence: DeploymentEvidence[] = [];
  const anomalies: AccountAnomaly[] = [];

  // Logs: a row whose account is not ours is not evidence for us.
  const logs = input.logs;
  if (logs === null) anomalies.push("logs_unreadable");
  else {
    if (logs.accountDeployed.some((log) => log.account === account)) evidence.push("account_deployed_log");
    const registered = logs.ownerRegistered.filter((log) => log.account === account);
    if (registered.length > 0) evidence.push("owner_registered_log");
    if (registered.some((log) => log.owner !== owner)) anomalies.push("owner_mismatch");
    if (!logs.complete) anomalies.push("logs_incomplete");
  }

  let ignoredNegativeLookup = false;
  const code = input.code ?? null;
  if (code === "kernel_proxy") evidence.push("rpc_code");
  else if (code === "other_code") anomalies.push("foreign_code");
  const lookup = input.explorerLookup ?? null;
  if (lookup !== null) {
    if (lookup.status === 200 && typeof lookup.deployedBytecode === "string" && isKernelProxyRuntime(lookup.deployedBytecode)) {
      evidence.push("explorer_code");
    } else {
      ignoredNegativeLookup = true;
    }
  }

  // Deployment verdict. "no" needs a complete, empty log read and no contrary code reading; any
  // anomaly or any unreadable input leaves it "unknown".
  const positive = evidence.length > 0;
  const completeLogs = logs !== null && logs.complete;
  const codeAllowsNo = code === null || code === "none";
  let deployed: Tri;
  if (anomalies.includes("owner_mismatch") || anomalies.includes("foreign_code")) deployed = "unknown";
  else if (positive) deployed = "yes";
  else if (completeLogs && codeAllowsNo) deployed = "no";
  else deployed = "unknown";

  // Registry verdict.
  let registered: Tri = "unknown";
  if (input.registry.kind === "read") {
    const value = input.registry.smartAccount;
    if (value === null) registered = "no";
    else if (bareLower(value) === bareLower(account)) registered = "yes";
    else {
      anomalies.push("registry_account_mismatch");
      registered = "unknown";
    }
  }
  if (registered === "yes" && deployed === "no") {
    anomalies.push("registry_without_deployment");
    deployed = "unknown";
  }

  const fatal = anomalies.some((a) => a === "owner_mismatch" || a === "registry_account_mismatch" || a === "registry_without_deployment" || a === "foreign_code");
  let state: AccountState;
  let reason: string;
  if (fatal) {
    state = "unknown";
    reason = "The observations contradict each other; treating the account as unknown.";
  } else if (deployed === "yes" && registered === "yes") {
    state = "registered";
    reason = "The account is deployed and known to the XO orderbook.";
  } else if (deployed === "yes" && registered === "no") {
    state = "deployed_unregistered";
    reason = "The account is deployed but the XO orderbook does not know it.";
  } else if (deployed === "no") {
    state = "undeployed";
    reason = "No deployment log exists for this account.";
  } else {
    state = "unknown";
    reason = deployed === "yes" ? "The account is deployed but the orderbook registry could not be read." : "Deployment could not be confirmed.";
  }
  return { owner, account, state, deployed, registered, evidence, anomalies, ignoredNegativeLookup, reason };
}

// ---- gates -------------------------------------------------------------------------------------

export type GateCode =
  | "ok"
  | "undeployed" // positive proof is missing: the account is not deployed
  | "not_registered" // deployed but the orderbook does not know it
  | "state_unknown" // could not tell; fail closed
  | "already_deployed"; // a deploying operation for an account that already exists

export interface GateDecision {
  readonly allowed: boolean;
  readonly code: GateCode;
  readonly message: string;
}

const ALLOWED: GateDecision = { allowed: true, code: "ok", message: "allowed" };

function refuse(code: GateCode, message: string): GateDecision {
  return { allowed: false, code, message };
}

// What positive deployment proof means for every action that needs a live account.
function needsDeployed(result: AccountStateResult, what: string): GateDecision | null {
  if (result.deployed === "yes") return null;
  if (result.deployed === "no") return refuse("undeployed", `${what} needs a deployed account; deploy it first (Enable Trading).`);
  return refuse("state_unknown", `${what} needs positive proof that the account is deployed; it could not be confirmed.`);
}

// Funding mints USDC.e to the account. If the account has no code the funds can only move through a
// UserOp that needs the bundler to accept it (AD7), so funding waits for positive proof.
export function gateFunding(result: AccountStateResult): GateDecision {
  return needsDeployed(result, "Funding") ?? ALLOWED;
}

// Connecting (the L1 ClobAuth signature) checks ERC-1271 on the account, which needs code (AU6).
export function gateConnect(result: AccountStateResult): GateDecision {
  return needsDeployed(result, "Connecting") ?? ALLOWED;
}

// A UserOp for an existing account carries no initCode and needs the account to exist.
export function gateExistingAccountUserOp(result: AccountStateResult): GateDecision {
  return needsDeployed(result, "This operation") ?? ALLOWED;
}

// Orders: the exchange needs code, and trading stays blocked until the orderbook registers the
// account (AD4, AD6).
export function gateTrading(result: AccountStateResult): GateDecision {
  const deployed = needsDeployed(result, "Trading");
  if (deployed !== null) return deployed;
  if (result.registered === "yes") return ALLOWED;
  if (result.registered === "no") return refuse("not_registered", "Trading is blocked until the XO orderbook knows this account.");
  return refuse("state_unknown", "Trading needs the orderbook registry to confirm this account; it could not be read.");
}

// The deploying UserOp carries initCode, which only works while the account has no code. It needs a
// complete negative; an unknown state refuses (a failed deploy would be harmless, but a wrong initCode
// pairing is not worth guessing at).
export function gateDeploy(result: AccountStateResult): GateDecision {
  if (result.deployed === "no") return ALLOWED;
  if (result.deployed === "yes") return refuse("already_deployed", "The account is already deployed; send the operation without initCode.");
  return refuse("state_unknown", "Whether the account is deployed could not be confirmed.");
}

export class AccountStateError extends Error {
  readonly code: GateCode;
  constructor(decision: GateDecision) {
    super(decision.message);
    this.name = "AccountStateError";
    this.code = decision.code;
  }
}

export function requireGate(decision: GateDecision): void {
  if (!decision.allowed) throw new AccountStateError(decision);
}
