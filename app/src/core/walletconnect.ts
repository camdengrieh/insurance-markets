// WalletConnect v2 facts for the dApp side (docs/dapp-paybox-web.md route F). Pure: no network, no DOM, no
// library import. The connection itself is features/wallet/connect/walletconnect*.ts; this file holds what that code
// and the Connect modal agree on: the project id, the relay, what the page asks a wallet for, and how an approved
// session becomes the capabilities a screen may rely on.
//
// The relay is the only host @walletconnect/sign-client reaches from this page. Its other hosts are switched off or
// never reached by a dApp: telemetry (pulse) is off at init, Verify registration (an iframe the CSP blocks anyway) is
// replaced with a no-op, push registration (echo) is wallet-side, and the Blockchain API RPC is used only to check a
// smart-account sign-in reply, which this page never requests.

import { getAddress, isAddress, type Address } from "viem";

// The Reown (WalletConnect Cloud) project id for this page. A public identifier, not a secret: every page that pairs
// sends it to the relay in the clear. null in a build that has none, and the WalletConnect tab then says so.
export const WALLETCONNECT_PROJECT_ID: string | null = "eb06e71bf30fe71fe266fea90bf50730";

// A project id is 32 lower-case hex characters; anything else is treated as "not configured".
export function isProjectId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}

// @walletconnect/core's own default, named explicitly so the CSP entry (headers.config.ts WALLET_RELAY_ORIGINS) and
// the client cannot drift apart.
export const WALLETCONNECT_RELAY_URL = "wss://relay.walletconnect.org";

// What the page asks for. Every chain and method is optional, so a wallet can approve the subset it supports: PayBox
// signs text and typed data on ten chains, not XO 3223, and refuses eth_sendTransaction (dapp-paybox-web.md 1.1 F).
export const WALLETCONNECT_METHODS = ["eth_signTypedData_v4", "personal_sign", "eth_sendTransaction", "wallet_switchEthereumChain"] as const;
export const WALLETCONNECT_EVENTS = ["accountsChanged", "chainChanged"] as const;
// Polygon (Polymarket), Base, XO, Ethereum, in the order a wallet shows them.
export const WALLETCONNECT_CHAINS: readonly number[] = Object.freeze([137, 8453, 3223, 1]);

export type RequestedNamespaces = {
  readonly eip155: { readonly chains: readonly string[]; readonly methods: readonly string[]; readonly events: readonly string[] };
};

export function requestedNamespaces(): RequestedNamespaces {
  return {
    eip155: {
      chains: WALLETCONNECT_CHAINS.map((chainId) => `eip155:${chainId}`),
      methods: [...WALLETCONNECT_METHODS],
      events: [...WALLETCONNECT_EVENTS],
    },
  };
}

// PayBox's WalletConnect page, which takes a pairing link in its uri parameter (dapp-paybox-web.md 0, route F). The
// page only ever links to it; the visitor opens it in their own PayBox tab.
export function payboxPairingUrl(uri: string): string {
  return `https://app.paybox.sh/wc?uri=${encodeURIComponent(uri)}`;
}

// ---- an approved session -------------------------------------------------------------------------------------------------

// The slice of a WalletConnect session this page reads. Everything in it came from the wallet: untrusted.
export interface SessionNamespace {
  readonly accounts: readonly string[];
  readonly methods: readonly string[];
  readonly events: readonly string[];
  readonly chains?: readonly string[];
}

export interface SessionLike {
  readonly topic: string;
  readonly expiry: number;
  readonly namespaces: Readonly<Record<string, SessionNamespace>>;
  readonly peer: { readonly metadata: { readonly name?: unknown } };
}

export interface SessionFacts {
  // The first approved account, checksummed.
  readonly address: Address;
  // Every approved account address on any chain, checksummed and deduplicated.
  readonly addresses: readonly Address[];
  // The approved eip155 chains, in the order the wallet listed them.
  readonly chains: readonly number[];
  readonly methods: readonly string[];
  readonly sendTransaction: boolean;
  readonly switchChain: boolean;
}

const MAX_CHAIN_ID = 2 ** 53 - 1;

function chainOf(caip: string): number | null {
  const match = /^eip155:([0-9]{1,16})$/.exec(caip);
  if (match?.[1] === undefined) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 && id <= MAX_CHAIN_ID ? id : null;
}

// What an approved session lets the page do. null when it holds no usable eip155 account (a session that approved
// only another namespace, or accounts that are not addresses). Chains come from both the accounts ("eip155:137:0x...")
// and the namespace's chain list; a wallet may send either.
export function sessionFacts(session: SessionLike): SessionFacts | null {
  const namespace = session.namespaces["eip155"];
  if (namespace === undefined) return null;
  const chains: number[] = [];
  const addresses: Address[] = [];
  const addChain = (id: number | null): void => {
    if (id !== null && !chains.includes(id)) chains.push(id);
  };
  for (const account of Array.isArray(namespace.accounts) ? namespace.accounts : []) {
    if (typeof account !== "string") continue;
    const match = /^(eip155:[0-9]{1,16}):(0x[0-9a-fA-F]{40})$/.exec(account);
    if (match?.[1] === undefined || match[2] === undefined || !isAddress(match[2], { strict: false })) continue;
    const chain = chainOf(match[1]);
    if (chain === null) continue;
    addChain(chain);
    const address = getAddress(match[2]);
    if (!addresses.includes(address)) addresses.push(address);
  }
  for (const caip of Array.isArray(namespace.chains) ? namespace.chains : []) if (typeof caip === "string") addChain(chainOf(caip));
  const first = addresses[0];
  if (first === undefined || chains.length === 0) return null;
  const methods = (Array.isArray(namespace.methods) ? namespace.methods : []).filter((method): method is string => typeof method === "string");
  return {
    address: first,
    addresses,
    chains,
    methods,
    sendTransaction: methods.includes("eth_sendTransaction"),
    switchChain: methods.includes("wallet_switchEthereumChain"),
  };
}
