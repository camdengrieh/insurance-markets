// A Polymarket Deposit Wallet batch: the calls the wallet makes for its owner, signed by the owner as EIP-712 typed data
// with the wallet's own domain and relayed by Polymarket (note 45 section 1.2). The typed data follows the official
// client's source exactly (npm @polymarket/client 0.14.0, src/actions/gasless.ts createDepositWalletBatchTypedDataPayload
// and buildDepositWalletExecuteRequest, read from its published source map 2026-10-24):
//
//   domain   { name: "DepositWallet", version: "1", chainId: 137, verifyingContract: <the Deposit Wallet> }
//   types    Batch(address wallet,uint256 nonce,uint256 deadline,Call[] calls)   Call(address target,uint256 value,bytes data)
//   message  { wallet, nonce, deadline, calls: [{ target, value, data }] }
//   deadline now + 600 seconds; nonce from the relayer's transactions/params route for the owner;
//   the owner's 65-byte signature goes to the relayer unwrapped (a session signer's would be wrapped; there is none).
//
// The approvals the account needs to trade on all three books, from wallets-auth.md as note 45 section 9 step 7 lists
// them: pUSD approve to Exchange V3 (the Protocol V2 book), the CTF Exchange, the Neg Risk CTF Exchange and the Neg Risk
// Adapter; PositionManager setApprovalForAll to Exchange V3; Conditional Tokens setApprovalForAll to the CTF Exchange,
// the Neg Risk CTF Exchange and the Neg Risk Adapter. Each target and spender is a pinned constant
// (sdk/chain/polymarket/constants.ts); the chain is read first and an approval already in place is left out.

import { POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_CTF_EXCHANGE, POLYMARKET_EXCHANGE_V3, POLYMARKET_NEG_RISK_ADAPTER, POLYMARKET_NEG_RISK_EXCHANGE, POLYMARKET_POSITION_MANAGER, POLYMARKET_PUSD } from "@sdk/chain/polymarket/constants";
import { DEPOSIT_WALLET_DOMAIN_NAME, DEPOSIT_WALLET_DOMAIN_VERSION } from "@sdk/trade/clob/polymarket/deposit-wallet";
import { POLYMARKET_DEPOSIT_WALLET_FACTORY } from "@sdk/chain/xo/constants";
import { decodeFunctionResult, encodeFunctionData, erc20Abi, getAddress, hashTypedData, maxUint256, parseAbi, type Address, type Hex, type TypedDataDefinition } from "viem";

import { ok, refuse, type ChainSession, type DirectResult } from "../types";
import type { WalletBatchRequest, WalletCall } from "./relayer";

export const POLYGON_CHAIN_ID = 137;
export const BATCH_DEADLINE_S = 600;

export const DEPOSIT_WALLET_BATCH_TYPES = {
  Batch: [
    { name: "wallet", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "calls", type: "Call[]" },
  ],
  Call: [
    { name: "target", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
  ],
} as const;

export interface BatchInput {
  readonly wallet: Address;
  readonly nonce: bigint;
  readonly deadline: bigint;
  readonly calls: readonly WalletCall[];
}

export function depositWalletBatchTypedData(input: BatchInput): TypedDataDefinition<typeof DEPOSIT_WALLET_BATCH_TYPES, "Batch"> {
  const wallet = getAddress(input.wallet);
  return {
    domain: { name: DEPOSIT_WALLET_DOMAIN_NAME, version: DEPOSIT_WALLET_DOMAIN_VERSION, chainId: POLYGON_CHAIN_ID, verifyingContract: wallet },
    types: DEPOSIT_WALLET_BATCH_TYPES,
    primaryType: "Batch",
    message: { wallet, nonce: input.nonce, deadline: input.deadline, calls: input.calls.map((call) => ({ target: getAddress(call.target), value: BigInt(call.value), data: call.data })) },
  };
}

export function depositWalletBatchDigest(input: BatchInput): Hex {
  return hashTypedData(depositWalletBatchTypedData(input));
}

// The relayer's WALLET request for a signed batch: from = the owner, to = the Deposit Wallet factory.
export function walletBatchRequest(owner: Address, input: BatchInput, signature: Hex, metadata: string): WalletBatchRequest {
  return {
    type: "WALLET",
    from: getAddress(owner),
    to: POLYMARKET_DEPOSIT_WALLET_FACTORY,
    nonce: input.nonce.toString(),
    signature,
    metadata,
    depositWalletParams: { depositWallet: getAddress(input.wallet), deadline: input.deadline.toString(), calls: input.calls.map((call) => ({ target: getAddress(call.target), value: call.value, data: call.data })) },
  };
}

// ---- the approvals --------------------------------------------------------------------------------------------------------

const ERC1155_ABI = parseAbi(["function isApprovedForAll(address account, address operator) view returns (bool)", "function setApprovalForAll(address operator, bool approved)"]);

export interface PolymarketApproval {
  readonly id: string;
  // Fixed app words.
  readonly label: string;
  readonly kind: "erc20" | "operator";
  readonly token: Address;
  readonly spender: Address;
}

export const POLYMARKET_APPROVALS: readonly PolymarketApproval[] = Object.freeze([
  { id: "pusd-v3", label: "pUSD for Exchange V3", kind: "erc20", token: POLYMARKET_PUSD, spender: POLYMARKET_EXCHANGE_V3 },
  { id: "pusd-ctf", label: "pUSD for the CTF Exchange", kind: "erc20", token: POLYMARKET_PUSD, spender: POLYMARKET_CTF_EXCHANGE },
  { id: "pusd-neg-risk", label: "pUSD for the Neg Risk CTF Exchange", kind: "erc20", token: POLYMARKET_PUSD, spender: POLYMARKET_NEG_RISK_EXCHANGE },
  { id: "pusd-adapter", label: "pUSD for the Neg Risk Adapter", kind: "erc20", token: POLYMARKET_PUSD, spender: POLYMARKET_NEG_RISK_ADAPTER },
  { id: "positions-v3", label: "PositionManager operator approval for Exchange V3", kind: "operator", token: POLYMARKET_POSITION_MANAGER, spender: POLYMARKET_EXCHANGE_V3 },
  { id: "ctf-ctf", label: "Conditional Tokens operator approval for the CTF Exchange", kind: "operator", token: POLYMARKET_CONDITIONAL_TOKENS, spender: POLYMARKET_CTF_EXCHANGE },
  { id: "ctf-neg-risk", label: "Conditional Tokens operator approval for the Neg Risk CTF Exchange", kind: "operator", token: POLYMARKET_CONDITIONAL_TOKENS, spender: POLYMARKET_NEG_RISK_EXCHANGE },
  { id: "ctf-adapter", label: "Conditional Tokens operator approval for the Neg Risk Adapter", kind: "operator", token: POLYMARKET_CONDITIONAL_TOKENS, spender: POLYMARKET_NEG_RISK_ADAPTER },
] as const);

// An allowance at least this large counts as the one-time approval (pUSD may count an unlimited allowance down).
const HALF_MAX = maxUint256 / 2n;

// The approvals the chain does not show as given by `wallet`; an approval that could not be read counts as missing
// (granting it again changes nothing).
export async function missingApprovals(chain: ChainSession | null, wallet: Address): Promise<DirectResult<readonly PolymarketApproval[]>> {
  if (chain === null) return refuse("chain_unreadable", "This build names no Polygon RPC, so your Polymarket approvals cannot be read.");
  const calls = POLYMARKET_APPROVALS.map((approval) =>
    approval.kind === "erc20"
      ? { to: approval.token, data: encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [wallet, approval.spender] }) }
      : { to: approval.token, data: encodeFunctionData({ abi: ERC1155_ABI, functionName: "isApprovedForAll", args: [wallet, approval.spender] }) },
  );
  let answers: Awaited<ReturnType<typeof chain.port.callMany>>;
  try {
    answers = await chain.port.callMany(calls);
  } catch {
    return refuse("chain_unreadable", "This page could not read your Polymarket approvals on Polygon. Read again in a moment.");
  }
  const missing = POLYMARKET_APPROVALS.filter((approval, index) => {
    const answer = answers[index];
    if (answer === undefined || !answer.ok) return true;
    try {
      return approval.kind === "erc20" ? decodeFunctionResult({ abi: erc20Abi, functionName: "allowance", data: answer.data }) < HALF_MAX : !decodeFunctionResult({ abi: ERC1155_ABI, functionName: "isApprovedForAll", data: answer.data });
    } catch {
      return true;
    }
  });
  return ok(missing);
}

export function approvalCall(approval: PolymarketApproval): WalletCall {
  const data = approval.kind === "erc20" ? encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [approval.spender, maxUint256] }) : encodeFunctionData({ abi: ERC1155_ABI, functionName: "setApprovalForAll", args: [approval.spender, true] });
  return { target: approval.token, value: "0", data };
}
