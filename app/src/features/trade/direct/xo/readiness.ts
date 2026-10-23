// Whether the visitor's XO account can trade, read fresh each time and never guessed:
//   deployed    eth_getCode on XO's chain returns the exact Kernel proxy runtime (core/account.ts observeCode);
//   registered  XO's order book (GET /balance-allowance for the ACCOUNT, through the relay) names this account as its
//               smart_account (features/wallet/account-map.ts reads the same thing in the Cockpit build);
//   approvals   USDC.e allowance to the CTF exchange (needed to buy) and the conditional tokens' operator approval of the
//               exchange (needed to sell): XO's "Enable Trading" (sdk/trade/xo/userop/calls.ts enableTradingCalls);
//   funds       the account's USDC.e on XO's chain.
// A read that fails is "unknown"/null and is said in words, never shown as "no" or as zero.
//
// Deploying the account and enabling trading take ONE user operation (deploy + the two approvals), sent to XO's bundler
// and signed by the owner over the 32-byte userOpHash (sdk/trade/xo/userop/sign.ts: a raw ECDSA signature; Kernel's ECDSA
// validator also takes the EIP-191 signature of those 32 bytes). The page's WalletSigner (core/signer.ts) signs typed
// data and TEXT messages only: signMessage(message: string) would sign the 66 characters of the hex, not the 32 bytes,
// and the validator would refuse it. So this page cannot deploy the account or enable trading; it says what to do.

import { encodeFunctionData, getAddress, type Address } from "viem";

import { CONDITIONAL_TOKENS_ABI, ERC20_ABI } from "@sdk/chain/xo/abi";
import { CONDITIONAL_TOKENS, CTF_EXCHANGE, USDC_E_ADDRESS, XO_CHAIN_ID } from "@sdk/chain/xo/constants";
import { formatMicro } from "@sdk/trade/xo/amounts";

import { chainById } from "../../../../core/account";
import type { AdapterDeps } from "../../../../core/ports";
import { createChainReader, uintOf } from "../../../wallet/rpc";
import type { XoRelayClient } from "./relay";

export interface XoReadiness {
  readonly owner: Address;
  readonly account: Address;
  readonly deployed: "yes" | "no" | "unknown";
  // null: the order book could not be read.
  readonly registered: boolean | null;
  readonly usdcMicro: bigint | null;
  readonly allowanceMicro: bigint | null;
  readonly sellApproved: boolean | null;
}

export async function readXoReadiness(deps: AdapterDeps, relay: XoRelayClient, owner: Address, account: Address): Promise<XoReadiness> {
  const chain = chainById(XO_CHAIN_ID);
  const reader = chain === undefined ? null : createChainReader(deps, chain);
  const holder = getAddress(account);
  const [codes, reads, registered] = await Promise.all([
    reader === null ? null : reader.readCodes([holder]).catch(() => null),
    reader === null
      ? null
      : reader
          .read([
            { kind: "call", to: USDC_E_ADDRESS, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [holder] }) },
            { kind: "call", to: USDC_E_ADDRESS, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "allowance", args: [holder, CTF_EXCHANGE] }) },
            { kind: "call", to: CONDITIONAL_TOKENS, data: encodeFunctionData({ abi: CONDITIONAL_TOKENS_ABI, functionName: "isApprovedForAll", args: [holder, CTF_EXCHANGE] }) },
          ])
          .catch(() => null),
    readRegistration(relay, holder),
  ]);
  const code = codes?.[0]?.kind;
  const approvedWord = uintOf(reads?.[2]);
  return {
    owner,
    account: holder,
    deployed: code === "kernel_proxy" ? "yes" : code === "none" ? "no" : "unknown",
    registered,
    usdcMicro: uintOf(reads?.[0]),
    allowanceMicro: uintOf(reads?.[1]),
    sellApproved: approvedWord === null ? null : approvedWord === 1n ? true : approvedWord === 0n ? false : null,
  };
}

async function readRegistration(relay: XoRelayClient, account: Address): Promise<boolean | null> {
  try {
    const answer = await relay.balanceAllowance(account);
    if (answer.from !== "xo" || answer.status !== 200 || typeof answer.json !== "object" || answer.json === null) return null;
    const smart = (answer.json as Record<string, unknown>)["smart_account"];
    if (smart === null || smart === undefined) return false;
    if (typeof smart !== "string") return null;
    return smart.toLowerCase().replace(/^0x/, "") === account.toLowerCase().replace(/^0x/, "");
  } catch {
    return null;
  }
}

export interface ReadinessView {
  // The login needs code at the account: XO checks the ClobAuth signature with ERC-1271 on it.
  readonly canLogin: boolean;
  readonly canBuy: boolean;
  readonly canSell: boolean;
  readonly lines: readonly string[];
}

export const CANNOT_DEPLOY_HERE =
  "Deploying the account and enabling trading take one user operation signed over its 32-byte hash, and this page's wallet connection signs typed data and text only, so it cannot do that step. Open XO's own app with this same wallet (it derives the same account) and enable trading there once; then read again here.";

export function readinessView(r: XoReadiness): ReadinessView {
  const lines: string[] = [];
  if (r.deployed === "no") lines.push(`Your XO account ${r.account} is not deployed on XO's chain yet. ${CANNOT_DEPLOY_HERE}`);
  else if (r.deployed === "unknown") lines.push("XO's chain did not answer, so whether your XO account is deployed is not known. Nothing is signed until it is read.");
  else lines.push(`Your XO account ${r.account} is deployed on XO's chain.`);
  if (r.registered === true) lines.push("XO's order book knows this account.");
  else if (r.registered === false) lines.push("XO's order book does not list this account yet; it registers an account after it is deployed. Read again in a while.");
  else lines.push("XO's order book could not be read through the relay, so registration is not known.");
  const allowanceSet = r.allowanceMicro !== null && r.allowanceMicro > 0n;
  if (r.allowanceMicro === null || r.sellApproved === null) lines.push("The trading approvals could not be read.");
  else if (!allowanceSet || !r.sellApproved) {
    const missing = [allowanceSet ? null : "the exchange has no USDC.e allowance (needed to buy)", r.sellApproved ? null : "the exchange is not approved to move its outcome shares (needed to sell)"].filter((part): part is string => part !== null);
    lines.push(`Trading is not fully enabled on this account: ${missing.join("; ")}.${r.deployed === "yes" ? ` ${CANNOT_DEPLOY_HERE}` : ""}`);
  }
  else lines.push("Trading is enabled (USDC.e allowance and outcome-share approval to the exchange are in place).");
  if (r.usdcMicro === null) lines.push("The account's USDC.e balance could not be read.");
  else lines.push(`USDC.e in the account: ${formatMicro(r.usdcMicro)}.${r.usdcMicro === 0n ? " Fund it from the Wallet screen (USDC from Base to XO) before buying." : ""}`);
  const ready = r.deployed === "yes" && r.registered === true;
  return {
    canLogin: r.deployed === "yes",
    canBuy: ready && allowanceSet && r.usdcMicro !== null && r.usdcMicro > 0n,
    canSell: ready && r.sellApproved === true,
    lines,
  };
}
