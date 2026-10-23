import { defineChain, type Chain } from "viem";

import { BROWSER_DIRECT_ORIGINS } from "../../../../headers.config";
import { chainById } from "../../../core/account";

// What the page offers a browser wallet that does not know a chain yet (wallet_addEthereumChain, EIP-3085). Only the
// chains with a public RPC the page already lists (headers.config.ts) are offered; for any other chain the wallet has
// to know it already, and the page says so instead of inventing an endpoint.
//
// Native currencies: XO's is "XO" with 18 decimals, as XO's own explorer configures it (NETWORK_CURRENCY_* of
// explorer-mainnet, read 2026-10-23; research-notes.md also names the native token XO). The others are the chains'
// well-known coins.

interface ChainExtra {
  readonly currency: { readonly name: string; readonly symbol: string; readonly decimals: 18 };
  // The explorer's origin when it is one the page already lists, so the wallet can link transactions.
  readonly explorerService?: string;
}

const EXTRAS: Readonly<Record<number, ChainExtra>> = Object.freeze({
  3223: { currency: { name: "XO", symbol: "XO", decimals: 18 }, explorerService: "xo_explorer" },
  8453: { currency: { name: "Ether", symbol: "ETH", decimals: 18 } },
  137: { currency: { name: "POL", symbol: "POL", decimals: 18 } },
  56: { currency: { name: "BNB", symbol: "BNB", decimals: 18 } },
  // HyperEVM (999) is left out on purpose: its JSON-RPC lives under a path of rpc.hyperliquid.xyz the page does not
  // name, and a wallet given the bare origin would be handed an endpoint that does not answer.
});

function originOf(service: string, transport?: string): string | null {
  const row = BROWSER_DIRECT_ORIGINS.find((entry) => entry.service === service && (transport === undefined || entry.transport === transport));
  return row === undefined ? null : row.origin;
}

// The viem chain the page would add, or null when it has nothing to offer for that id.
export function addableChain(chainId: number): Chain | null {
  const account = chainById(chainId);
  const extra = EXTRAS[chainId];
  if (account === undefined || extra === undefined || account.rpcService === null) return null;
  const rpc = originOf(account.rpcService, "T0-RPC");
  if (rpc === null) return null;
  const explorer = extra.explorerService === undefined ? null : originOf(extra.explorerService);
  return defineChain({
    id: chainId,
    name: account.isXo ? "XO Network" : account.name,
    nativeCurrency: extra.currency,
    rpcUrls: { default: { http: [rpc] } },
    ...(explorer === null ? {} : { blockExplorers: { default: { name: `${account.name} explorer`, url: explorer } } }),
  });
}

// "Polygon", "XO", or the number when the page has no name for it. Fixed app text, never the wallet's.
export function chainName(chainId: number): string {
  return chainById(chainId)?.name ?? `chain ${chainId}`;
}
