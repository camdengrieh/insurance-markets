// The fixed facts of the trading account (docs/unified-account-design.md section 1 and 3.1): which chains its gas is
// sponsored on, which USDC it holds there, and the chains its signer will sign for.
//
// Polygon's native USDC is pinned here because nothing else in the page names it (Polymarket's collateral is USDC.e and
// pUSD, sdk/chain/polymarket/constants.ts). Base USDC is the SDK's pin (sdk/chain/xo/constants.ts). Both are Circle's
// FiatToken v2.2 proxies, which implement EIP-3009 transferWithAuthorization; the deposit reads each token's own EIP-712
// name and version from the chain (deposit.ts) instead of trusting a constant for them.

import { BASE_CHAIN_ID, BASE_USDC } from "@sdk/chain/xo/constants";
import { POLYGON_CHAIN_ID } from "@sdk/chain/polymarket/constants";
import type { Address } from "viem";

export const BNB_CHAIN_ID = 56;
export const XO_CHAIN_ID = 3223;

// The chains our paymaster route sponsors (POST /v1/paymaster/:chainId). XO 3223 is not one of them: XO's own bundler
// and paymaster keep serving the XO account (features/trade/direct/xo), and no sponsor provider serves 3223.
export const SPONSORED_CHAIN_IDS: readonly number[] = Object.freeze([POLYGON_CHAIN_ID, BASE_CHAIN_ID, BNB_CHAIN_ID]);

// Every chain the local signer signs for (design 3.1 capabilities.chains). It signs typed data and messages on all of
// them; it sends transactions only on the sponsored ones.
export const LOCAL_SIGNER_CHAIN_IDS: readonly number[] = Object.freeze([POLYGON_CHAIN_ID, BASE_CHAIN_ID, BNB_CHAIN_ID, XO_CHAIN_ID]);

// Circle native USDC on Polygon PoS (FiatTokenProxy), 6 decimals.
export const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;

export const USDC_DECIMALS = 6;

export type MoneyChainId = typeof BASE_CHAIN_ID | typeof POLYGON_CHAIN_ID;

// The chains a deposit or a withdrawal moves USDC on, Base first (the hub every venue's funding route starts from).
export const MONEY_CHAINS: ReadonlyArray<{ readonly chainId: MoneyChainId; readonly name: string; readonly usdc: Address }> = Object.freeze([
  Object.freeze({ chainId: BASE_CHAIN_ID, name: "Base", usdc: BASE_USDC }),
  Object.freeze({ chainId: POLYGON_CHAIN_ID, name: "Polygon", usdc: POLYGON_USDC }),
]);

export function moneyChain(chainId: number): (typeof MONEY_CHAINS)[number] | undefined {
  return MONEY_CHAINS.find((entry) => entry.chainId === chainId);
}

export { BASE_CHAIN_ID, POLYGON_CHAIN_ID };
