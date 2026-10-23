// What the wallet holds and has approved on Base for Limitless, read from the chain, and the approval transactions the
// page can ask a wallet to send. Limitless's own table (OpenAPI description, "Required Approvals", read 2026-10-23):
// a BUY on any CLOB market needs USDC approved to `venue.exchange`; a SELL on a simple CLOB market needs the
// Conditional Tokens approved to `venue.exchange` (setApprovalForAll). The exchange is the one this build pins
// (sdk/trade/clob/venues.ts LIMITLESS_EXCHANGES, the Limitless CTF Exchange); an order for any other exchange is
// refused before signing (venue.ts), so it is the only spender read or approved here. USDC and Conditional Tokens are
// the pinned Base contracts (sdk/chain/limitless/constants.ts).
//
// The maker is the wallet itself (an EOA order), so the wallet sends its own approvals, when it can send transactions
// at all: PayBox over WalletConnect signs but sends nothing, and the page says so.

import { LIMITLESS_CONDITIONAL_TOKENS, LIMITLESS_USDC } from "@sdk/chain/limitless/constants";
import { CLOB_CHAIN_IDS, LIMITLESS_EXCHANGES } from "@sdk/trade/clob/venues";
import { decodeFunctionResult, encodeFunctionData, erc20Abi, maxUint256, parseAbi, type Address, type Hex } from "viem";

import { atomicText } from "../polymarket/card";
import type { ApprovalAmount } from "../polymarket/funding";
import { ok, refuse, type ChainSession, type DirectAccount, type DirectApproval, type DirectFunding, type DirectResult, type DirectTransaction } from "../types";

const ERC1155_ABI = parseAbi(["function isApprovedForAll(address account, address operator) view returns (bool)", "function balanceOf(address account, uint256 id) view returns (uint256)", "function setApprovalForAll(address operator, bool approved)"]);

export const BASE = CLOB_CHAIN_IDS.limitless;
export const USDC_DECIMALS = 6;
// The one exchange this build signs Limitless orders for.
export const LIMITLESS_EXCHANGE: Address = LIMITLESS_EXCHANGES[0] as Address;
const EXCHANGE_WORDS = "the Limitless CTF Exchange";

function decoded<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
}

export async function readLimitlessFunding(chain: ChainSession | null, account: DirectAccount, tokenId: string | null): Promise<DirectResult<DirectFunding>> {
  if (chain === null) return refuse("chain_unreadable", "This build names no Base RPC, so balances and approvals cannot be read.");
  const maker = account.maker;
  const calls = [
    { to: LIMITLESS_USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [maker] }) },
    { to: LIMITLESS_USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [maker, LIMITLESS_EXCHANGE] }) },
    { to: LIMITLESS_CONDITIONAL_TOKENS, data: encodeFunctionData({ abi: ERC1155_ABI, functionName: "isApprovedForAll", args: [maker, LIMITLESS_EXCHANGE] }) },
    ...(tokenId === null ? [] : [{ to: LIMITLESS_CONDITIONAL_TOKENS, data: encodeFunctionData({ abi: ERC1155_ABI, functionName: "balanceOf", args: [maker, BigInt(tokenId)] }) }]),
  ];
  let answers: Awaited<ReturnType<typeof chain.port.callMany>>;
  try {
    answers = await chain.port.callMany(calls);
  } catch {
    return refuse("chain_unreadable", "This page could not read your balances and approvals on Base. Read again in a moment.");
  }
  const at = (index: number): Hex | null => {
    const answer = answers[index];
    return answer !== undefined && answer.ok ? answer.data : null;
  };
  const balance = at(0);
  const allowanceData = at(1);
  const operatorData = at(2);
  const sharesData = tokenId === null ? null : at(3);
  const allowance = allowanceData === null ? null : decoded(() => decodeFunctionResult({ abi: erc20Abi, functionName: "allowance", data: allowanceData }));
  const operator = operatorData === null ? null : decoded(() => decodeFunctionResult({ abi: ERC1155_ABI, functionName: "isApprovedForAll", data: operatorData }));
  const approvals: DirectApproval[] = [
    { id: "collateral", label: `USDC allowance for ${EXCHANGE_WORDS}`, token: LIMITLESS_USDC, spender: LIMITLESS_EXCHANGE, neededFor: "BUY", granted: allowance === null ? null : allowance > 0n, allowance },
    { id: "positions", label: `Conditional Tokens operator approval for ${EXCHANGE_WORDS}`, token: LIMITLESS_CONDITIONAL_TOKENS, spender: LIMITLESS_EXCHANGE, neededFor: "SELL", granted: operator, allowance: null },
  ];
  return ok({
    maker,
    collateralSymbol: "USDC",
    collateralDecimals: USDC_DECIMALS,
    collateralBalance: balance === null ? null : decoded(() => decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: balance })),
    shareBalance: sharesData === null ? null : decoded(() => decodeFunctionResult({ abi: ERC1155_ABI, functionName: "balanceOf", data: sharesData })),
    approvals,
  });
}

// Why an approval cannot be sent from here, in words; null when the wallet can send it.
export function limitlessApprovalBlocker(canSend: boolean): string | null {
  return canSend ? null : "Your connected wallet signs but does not send transactions (PayBox over WalletConnect is one such wallet). Approve once from a wallet that can send transactions on Base, then read again here.";
}

// The approval transaction for the wallet, with its card. Nothing is sent here.
export function buildLimitlessApproval(account: DirectAccount, approval: DirectApproval, amount: ApprovalAmount): DirectTransaction {
  if (approval.id === "collateral") {
    const value = amount.kind === "unlimited" ? maxUint256 : amount.atomic;
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [approval.spender, value] });
    return {
      request: { chainId: BASE, to: approval.token, data },
      card: transactionCard(`Approve USDC for ${EXCHANGE_WORDS}`, approval.token, data, [
        { name: "function", value: "approve(address spender, uint256 amount)", meaning: "lets the spender move this token from your wallet" },
        { name: "spender", value: approval.spender, meaning: `${EXCHANGE_WORDS}, the contract your Limitless orders are signed for` },
        { name: "amount", value: value.toString(), meaning: amount.kind === "unlimited" ? "no limit: the exchange may move any amount of your USDC until you lower it" : `${atomicText(value, USDC_DECIMALS)} USDC, this order's worst case` },
      ], account, amount.kind === "unlimited" ? "Any amount of your USDC, by orders you sign later; the approval itself moves nothing." : `Up to ${atomicText(amount.kind === "exact" ? amount.atomic : 0n, USDC_DECIMALS)} USDC, by orders you sign later; the approval itself moves nothing.`),
    };
  }
  const data = encodeFunctionData({ abi: ERC1155_ABI, functionName: "setApprovalForAll", args: [approval.spender, true] });
  return {
    request: { chainId: BASE, to: approval.token, data },
    card: transactionCard("Approve the exchange to move your outcome tokens", approval.token, data, [
      { name: "function", value: "setApprovalForAll(address operator, bool approved)", meaning: "lets the operator move any of your Limitless outcome tokens" },
      { name: "operator", value: approval.spender, meaning: `${EXCHANGE_WORDS}, the contract your Limitless orders are signed for` },
      { name: "approved", value: "true", meaning: "granted until you revoke it" },
    ], account, "Any of your Limitless outcome tokens, by orders you sign later; the approval itself moves nothing."),
  };
}

function transactionCard(title: string, to: Address, data: Hex, rows: ReadonlyArray<{ readonly name: string; readonly value: string; readonly meaning: string }>, account: DirectAccount, worstCase: string) {
  return {
    title,
    lines: [`A transaction on Base (chain 8453) from your wallet, ${account.maker}, to ${to}. It costs ETH on Base for gas, paid by your wallet.`],
    fields: [
      { group: "message" as const, name: "chain", value: "8453", meaning: "Base" },
      { group: "message" as const, name: "to", value: to, meaning: "the token contract" },
      ...rows.map((row) => ({ group: "message" as const, name: row.name, value: row.value, meaning: row.meaning })),
      { group: "message" as const, name: "data", value: data, meaning: "the call data your wallet will show" },
    ],
    // A transaction has no EIP-712 digest: the wallet shows its call data, listed above in full.
    digest: null,
    digestTag: null,
    worstCase,
  };
}
