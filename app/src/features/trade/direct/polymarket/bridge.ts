// Funding the Polymarket wallet from the trading account's USDC on Base (docs/unified-account-design.md section 1,
// "Money"; note 45 section 6): Polymarket's bridge gives a deposit address for the Deposit Wallet (through our markets
// API's bridge route), and whatever arrives there is bridged and credited to the wallet as pUSD on Polygon. The page
// sends Base USDC from E to that address with one call through the account's signer, which routes it through the gas
// sponsor. The amount is the visitor's; nothing is chosen for them.

import { LIMITLESS_USDC } from "@sdk/chain/limitless/constants";
import { CLOB_CHAIN_IDS } from "@sdk/trade/clob/venues";
import { decodeFunctionResult, encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";

import type { TradingAccount } from "../../../account/types";
import { ok, refuse, type DirectDeps, type DirectResult } from "../types";
import { walletRefusal } from "../wallet";
import { atomicText } from "./card";
import { depositWalletAccount, POLYMARKET_NOT_AVAILABLE } from "./activation";
import { readEvmDepositAddress, relayerTransport, relayerWords, type PolymarketRelayerClient } from "./relayer";

export const BASE_CHAIN_ID = CLOB_CHAIN_IDS.limitless;
// Native USDC on Base (the same pinned contract Limitless settles in).
export const BASE_USDC: Address = LIMITLESS_USDC;
export const USDC_DECIMALS = 6;
// The bridge's smallest deposit from Base (bridge supported-assets, read 2026-10-24: most minimums are $2).
export const BRIDGE_MIN_ATOMIC = 2_000_000n;

export interface PolymarketFunding {
  readonly depositAddress: Address;
  readonly transactionHash: Hex;
}

// E's USDC on Base, read now.
export async function baseUsdcBalance(deps: DirectDeps, owner: Address): Promise<DirectResult<bigint>> {
  const chain = deps.chain(BASE_CHAIN_ID);
  if (chain === null) return refuse("chain_unreadable", "This build names no Base RPC, so your USDC on Base cannot be read.");
  try {
    const [answer] = await chain.port.callMany([{ to: BASE_USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [owner] }) }]);
    if (answer === undefined || !answer.ok) return refuse("chain_unreadable", "Your USDC balance on Base could not be read. Read again in a moment.");
    return ok(decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: answer.data }));
  } catch {
    return refuse("chain_unreadable", "Your USDC balance on Base could not be read. Read again in a moment.");
  }
}

export async function fundPolymarketFromBase(deps: DirectDeps, relayer: PolymarketRelayerClient | null, acct: TradingAccount, amountAtomic: bigint): Promise<DirectResult<PolymarketFunding>> {
  if (relayer === null) return refuse("venue_unreachable", POLYMARKET_NOT_AVAILABLE);
  if (amountAtomic < BRIDGE_MIN_ATOMIC) return refuse("invalid_order", `Polymarket's bridge takes at least ${atomicText(BRIDGE_MIN_ATOMIC, USDC_DECIMALS)} USDC from Base.`);
  const account = await depositWalletAccount(deps, acct.address);
  if (!account.ok) return account;
  if (account.value === null) return refuse("not_logged_in", "Activate Polymarket trading first: your Polymarket wallet does not exist yet.");
  const balance = await baseUsdcBalance(deps, acct.address);
  if (!balance.ok) return balance;
  if (balance.value < amountAtomic) return refuse("invalid_order", `Your trading account holds ${atomicText(balance.value, USDC_DECIMALS)} USDC on Base; moving ${atomicText(amountAtomic, USDC_DECIMALS)} needs more.`);
  let answer;
  try {
    answer = await relayer.deposit(account.value.maker);
  } catch (error) {
    return relayerTransport(error, "Polymarket's deposit address");
  }
  const depositAddress = answer.status >= 200 && answer.status < 300 ? readEvmDepositAddress(answer.json) : null;
  if (depositAddress === null) return refuse("venue_refused", `Polymarket's bridge did not give a deposit address (HTTP ${answer.status}), so nothing was sent.`, relayerWords(answer));
  let transactionHash: Hex;
  try {
    transactionHash = await acct.signer.sendTransaction({ chainId: BASE_CHAIN_ID, to: BASE_USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [depositAddress, amountAtomic] }) });
  } catch (error) {
    return walletRefusal(error, "the transfer to Polymarket");
  }
  return ok({ depositAddress, transactionHash });
}
