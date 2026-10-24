// What the maker holds and has approved, read from Polygon. Every Polymarket book settles in pUSD
// (sdk/chain/polymarket/constants.ts POLYMARKET_PUSD, read from the three exchanges): a BUY moves the maker's pUSD
// through the exchange the order is signed for, so it needs a pUSD allowance to that exchange; a SELL moves the maker's
// outcome tokens, so the token ledger must approve the exchange as an operator (setApprovalForAll). The ledger is
// Conditional Tokens for the CTF books and the PositionManager for the Protocol V2 book (getCtf() of both CTF exchanges
// and POSITION_MANAGER() of Exchange V3, read 2026-10-23).
//
// The approvals themselves are the Deposit Wallet's own calls, one batch its owner signs and Polymarket's relayer sends
// (batch.ts, activation.ts); nothing here builds a transaction.

import { POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_POSITION_MANAGER, POLYMARKET_PUSD, POLYMARKET_PUSD_DECIMALS } from "@sdk/chain/polymarket/constants";
import { POLYMARKET_EXCHANGES, type PolymarketBook } from "@sdk/trade/clob/venues";
import { decodeFunctionResult, encodeFunctionData, erc20Abi, parseAbi, type Address, type Hex } from "viem";

import { atomicText } from "./card";
import { ok, refuse, type ChainSession, type DirectAccount, type DirectApproval, type DirectFunding, type DirectResult } from "../types";

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
    if (funding.collateralBalance < makerAmount) return `Your account holds ${atomicText(funding.collateralBalance, funding.collateralDecimals)} ${symbol}; this order needs ${atomicText(makerAmount, funding.collateralDecimals)}.`;
    if (approval?.allowance === null || approval?.allowance === undefined) return `Your ${symbol} allowance could not be read, so the order is not signed. Read again.`;
    if (approval.allowance < makerAmount) return `The exchange may spend ${atomicText(approval.allowance, funding.collateralDecimals)} ${symbol} of your account's; this order needs ${atomicText(makerAmount, funding.collateralDecimals)}. Activate trading on this venue first.`;
    return null;
  }
  const approval = funding.approvals.find((entry) => entry.id === "positions");
  if (funding.shareBalance === null) return "Your balance of this outcome could not be read, so the order is not signed. Read again.";
  if (funding.shareBalance < makerAmount) return `Your account holds ${atomicText(funding.shareBalance, 6)} shares of this outcome; this order sells ${atomicText(makerAmount, 6)}.`;
  if (approval?.granted === null || approval?.granted === undefined) return "Whether the exchange may move your outcome tokens could not be read, so the order is not signed. Read again.";
  if (!approval.granted) return "The exchange is not approved to move your account's outcome tokens. Activate trading on this venue first.";
  return null;
}
