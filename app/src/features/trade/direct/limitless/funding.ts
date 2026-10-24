// What the trading account holds and has approved on Base for Limitless, read from the chain, and the approval calls the
// account sends once when Limitless trading is activated. Limitless's own table (OpenAPI description, "Required
// Approvals", read 2026-10-23; note 44 section 3.1 step 5): a BUY on any CLOB market needs USDC approved to
// `venue.exchange`; a SELL on a simple CLOB market needs the Conditional Tokens approved to `venue.exchange`
// (setApprovalForAll). The exchange is the one this build pins (sdk/trade/clob/venues.ts LIMITLESS_EXCHANGES, the
// Limitless CTF Exchange for simple markets); an order for any other exchange is refused before signing (venue.ts), so
// it is the only spender read or approved here. NegRisk markets (whose adapter also needs the operator approval) are
// not signed by this build, and a venue's fee module is not approved: no fee module address is pinned, and no address
// is ever taken from an API answer. USDC and Conditional Tokens are the pinned Base contracts
// (sdk/chain/limitless/constants.ts).
//
// The maker is the trading key itself (an EOA order), so the key sends its own approvals: each one is a call the
// account's signer sends (sendTransaction), which the trading account routes through its gas sponsor.

import { LIMITLESS_CONDITIONAL_TOKENS, LIMITLESS_USDC } from "@sdk/chain/limitless/constants";
import { CLOB_CHAIN_IDS, LIMITLESS_EXCHANGES } from "@sdk/trade/clob/venues";
import { decodeFunctionResult, encodeFunctionData, erc20Abi, maxUint256, parseAbi, type Address, type Hex } from "viem";

import { ok, refuse, type ChainSession, type DirectAccount, type DirectApproval, type DirectFunding, type DirectResult } from "../types";

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

export interface ApprovalCall {
  // Fixed app words for the progress list.
  readonly words: string;
  readonly chainId: number;
  readonly to: Address;
  readonly data: Hex;
}

// The calls activation sends for the approvals the chain does not show as granted: USDC to the exchange (no limit, the
// one-time approval the venue's own app gives) and the outcome tokens' operator approval. An approval that could not
// be read is sent too: granting it again changes nothing.
export function limitlessApprovalCalls(funding: DirectFunding): readonly ApprovalCall[] {
  const calls: ApprovalCall[] = [];
  for (const approval of funding.approvals) {
    if (approval.granted === true && (approval.id !== "collateral" || (approval.allowance ?? 0n) >= maxUint256 / 2n)) continue;
    if (approval.id === "collateral") {
      calls.push({ words: `USDC approval for ${EXCHANGE_WORDS}`, chainId: BASE, to: approval.token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [approval.spender, maxUint256] }) });
    } else {
      calls.push({ words: `Outcome token approval for ${EXCHANGE_WORDS}`, chainId: BASE, to: approval.token, data: encodeFunctionData({ abi: ERC1155_ABI, functionName: "setApprovalForAll", args: [approval.spender, true] }) });
    }
  }
  return calls;
}
