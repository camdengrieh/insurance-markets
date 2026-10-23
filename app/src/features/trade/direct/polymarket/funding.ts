// What the maker holds and has approved, read from Polygon, and the approval transactions the page can ask a wallet to
// send. Every Polymarket book settles in pUSD (sdk/chain/polymarket/constants.ts POLYMARKET_PUSD, read from the three
// exchanges): a BUY moves the maker's pUSD through the exchange the order is signed for, so it needs a pUSD allowance
// to that exchange; a SELL moves the maker's outcome tokens, so the token ledger must approve the exchange as an
// operator (setApprovalForAll). The ledger is Conditional Tokens for the CTF books and the PositionManager for the
// Protocol V2 book (getCtf() of both CTF exchanges and POSITION_MANAGER() of Exchange V3, read 2026-10-23).
//
// Only a wallet that is itself the maker can approve from here, and only a wallet that sends transactions (PayBox over
// WalletConnect signs and sends nothing). A Safe's or a Deposit Wallet's approvals are that contract's own
// transactions: the page says so and builds none.

import { POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_POSITION_MANAGER, POLYMARKET_PUSD, POLYMARKET_PUSD_DECIMALS } from "@sdk/chain/polymarket/constants";
import { CLOB_CHAIN_IDS, POLYMARKET_EXCHANGES, type PolymarketBook } from "@sdk/trade/clob/venues";
import { decodeFunctionResult, encodeFunctionData, erc20Abi, maxUint256, parseAbi, type Address, type Hex } from "viem";

import { atomicText } from "./card";
import { ok, refuse, type ChainSession, type DirectAccount, type DirectApproval, type DirectFunding, type DirectResult, type DirectTransaction } from "../types";

const ERC1155_ABI = parseAbi(["function isApprovedForAll(address account, address operator) view returns (bool)", "function balanceOf(address account, uint256 id) view returns (uint256)", "function setApprovalForAll(address operator, bool approved)"]);

export const BOOK_TEXT: Readonly<Record<PolymarketBook, string>> = Object.freeze({ v2: "Exchange V3 (Protocol V2 book)", ctf: "the CTF Exchange", neg_risk: "the Neg Risk CTF Exchange" });

export function ledgerOf(book: PolymarketBook): { readonly address: Address; readonly name: string } {
  return book === "v2" ? { address: POLYMARKET_POSITION_MANAGER, name: "PositionManager" } : { address: POLYMARKET_CONDITIONAL_TOKENS, name: "Conditional Tokens" };
}

function bigintOf(data: Hex, kind: "balance" | "allowance"): bigint | null {
  try {
    return kind === "balance" ? decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data }) : decodeFunctionResult({ abi: erc20Abi, functionName: "allowance", data });
  } catch {
    return null;
  }
}

export async function readPolymarketFunding(chain: ChainSession | null, account: DirectAccount, book: PolymarketBook, tokenId: string | null): Promise<DirectResult<DirectFunding>> {
  if (chain === null) return refuse("chain_unreadable", "This build names no Polygon RPC, so balances and approvals cannot be read.");
  const exchange = POLYMARKET_EXCHANGES[book].verifyingContract;
  const ledger = ledgerOf(book);
  const maker = account.maker;
  const calls = [
    { to: POLYMARKET_PUSD, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [maker] }) },
    { to: POLYMARKET_PUSD, data: encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [maker, exchange] }) },
    { to: ledger.address, data: encodeFunctionData({ abi: ERC1155_ABI, functionName: "isApprovedForAll", args: [maker, exchange] }) },
    ...(tokenId === null ? [] : [{ to: ledger.address, data: encodeFunctionData({ abi: ERC1155_ABI, functionName: "balanceOf", args: [maker, BigInt(tokenId)] }) }]),
  ];
  let answers: Awaited<ReturnType<typeof chain.port.callMany>>;
  try {
    answers = await chain.port.callMany(calls);
  } catch {
    return refuse("chain_unreadable", "This page could not read your balances and approvals on Polygon. Read again in a moment.");
  }
  const at = (index: number): Hex | null => {
    const answer = answers[index];
    return answer !== undefined && answer.ok ? answer.data : null;
  };
  const balanceData = at(0);
  const allowanceData = at(1);
  const operatorData = at(2);
  const sharesData = tokenId === null ? null : at(3);
  let operator: boolean | null = null;
  if (operatorData !== null) {
    try {
      operator = decodeFunctionResult({ abi: ERC1155_ABI, functionName: "isApprovedForAll", data: operatorData });
    } catch {
      operator = null;
    }
  }
  let shares: bigint | null = null;
  if (sharesData !== null) {
    try {
      shares = decodeFunctionResult({ abi: ERC1155_ABI, functionName: "balanceOf", data: sharesData });
    } catch {
      shares = null;
    }
  }
  const allowance = allowanceData === null ? null : bigintOf(allowanceData, "allowance");
  const approvals: DirectApproval[] = [
    { id: "collateral", label: `pUSD allowance for ${BOOK_TEXT[book]}`, token: POLYMARKET_PUSD, spender: exchange, neededFor: "BUY", granted: allowance === null ? null : allowance > 0n, allowance },
    { id: "positions", label: `${ledger.name} operator approval for ${BOOK_TEXT[book]}`, token: ledger.address, spender: exchange, neededFor: "SELL", granted: operator, allowance: null },
  ];
  return ok({
    maker,
    collateralSymbol: "pUSD",
    collateralDecimals: POLYMARKET_PUSD_DECIMALS,
    collateralBalance: balanceData === null ? null : bigintOf(balanceData, "balance"),
    shareBalance: shares,
    approvals,
  });
}

// What stops an order of this side and size, read from the funding: fixed words, or null when nothing does. A value
// the chain did not give is a stop too (never assumed to be enough). Shared with Limitless (limitless/funding.ts): the
// collateral is named by the funding's own symbol.
export function fundingStop(funding: DirectFunding, side: "BUY" | "SELL", makerAmount: bigint): string | null {
  if (side === "BUY") {
    const symbol = funding.collateralSymbol;
    const approval = funding.approvals.find((entry) => entry.id === "collateral");
    if (funding.collateralBalance === null) return `Your ${symbol} balance could not be read, so the order is not signed. Read again.`;
    if (funding.collateralBalance < makerAmount) return `The maker holds ${atomicText(funding.collateralBalance, funding.collateralDecimals)} ${symbol}; this order needs ${atomicText(makerAmount, funding.collateralDecimals)}.`;
    if (approval?.allowance === null || approval?.allowance === undefined) return `Your ${symbol} allowance could not be read, so the order is not signed. Read again.`;
    if (approval.allowance < makerAmount) return `The exchange may spend ${atomicText(approval.allowance, funding.collateralDecimals)} ${symbol} of the maker's; this order needs ${atomicText(makerAmount, funding.collateralDecimals)}. Approve first.`;
    return null;
  }
  const approval = funding.approvals.find((entry) => entry.id === "positions");
  if (funding.shareBalance === null) return "Your balance of this outcome could not be read, so the order is not signed. Read again.";
  if (funding.shareBalance < makerAmount) return `The maker holds ${atomicText(funding.shareBalance, 6)} shares of this outcome; this order sells ${atomicText(makerAmount, 6)}.`;
  if (approval?.granted === null || approval?.granted === undefined) return "Whether the exchange may move your outcome tokens could not be read, so the order is not signed. Read again.";
  if (!approval.granted) return "The exchange is not approved to move the maker's outcome tokens. Approve first.";
  return null;
}

// Why an approval cannot be sent from here, in words; null when the wallet can send it.
export function approvalBlocker(account: DirectAccount, canSend: boolean): string | null {
  if (!account.makerIsSigner) {
    return `The maker is ${account.label}, a contract wallet: its approvals are its own transactions (a Safe transaction, or the Deposit Wallet's own call), which this page does not build. Approve from Polymarket's site or your Safe, then read again.`;
  }
  if (!canSend) return "Your connected wallet signs but does not send transactions (PayBox over WalletConnect is one such wallet). Approve once from a wallet that can send transactions on Polygon, then read again here.";
  return null;
}

export type ApprovalAmount = { readonly kind: "exact"; readonly atomic: bigint } | { readonly kind: "unlimited" };

// The approval transaction for a wallet that is its own maker, with its card. Nothing is sent here.
export function buildApprovalTransaction(account: DirectAccount, approval: DirectApproval, amount: ApprovalAmount): DirectTransaction {
  const chainId = CLOB_CHAIN_IDS.polymarket;
  if (approval.id === "collateral") {
    const value = amount.kind === "unlimited" ? maxUint256 : amount.atomic;
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [approval.spender, value] });
    return {
      request: { chainId, to: approval.token, data },
      card: transactionCard(`Approve pUSD for ${approval.label.replace(/^pUSD allowance for /, "")}`, approval.token, data, [
        { name: "function", value: "approve(address spender, uint256 amount)", meaning: "lets the spender move this token from your wallet" },
        { name: "spender", value: approval.spender, meaning: "the exchange your orders on this book are signed for" },
        { name: "amount", value: value.toString(), meaning: amount.kind === "unlimited" ? "no limit: the exchange may move any amount of your pUSD until you lower it" : `${atomicText(value, POLYMARKET_PUSD_DECIMALS)} pUSD, this order's worst case` },
      ], account, amount.kind === "unlimited" ? "Any amount of your pUSD, by orders you sign later; the approval itself moves nothing." : `Up to ${atomicText(amount.kind === "exact" ? amount.atomic : 0n, POLYMARKET_PUSD_DECIMALS)} pUSD, by orders you sign later; the approval itself moves nothing.`),
    };
  }
  const data = encodeFunctionData({ abi: ERC1155_ABI, functionName: "setApprovalForAll", args: [approval.spender, true] });
  return {
    request: { chainId, to: approval.token, data },
    card: transactionCard("Approve the exchange to move your outcome tokens", approval.token, data, [
      { name: "function", value: "setApprovalForAll(address operator, bool approved)", meaning: "lets the operator move any of your outcome tokens on this ledger" },
      { name: "operator", value: approval.spender, meaning: "the exchange your orders on this book are signed for" },
      { name: "approved", value: "true", meaning: "granted until you revoke it" },
    ], account, "Any of your outcome tokens on this ledger, by orders you sign later; the approval itself moves nothing."),
  };
}

function transactionCard(title: string, to: Address, data: Hex, rows: ReadonlyArray<{ readonly name: string; readonly value: string; readonly meaning: string }>, account: DirectAccount, worstCase: string) {
  return {
    title,
    lines: [`A transaction on Polygon (chain 137) from ${account.label}, ${account.maker}, to ${to}. It costs POL for gas, paid by your wallet.`],
    fields: [
      { group: "message" as const, name: "chain", value: "137", meaning: "Polygon" },
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
