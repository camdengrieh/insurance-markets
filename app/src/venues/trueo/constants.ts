import { AdapterFailure } from "./errors";

// Trueo: pinned addresses, one deployment per chain. Source: docs/research/11-trueo.md sections 4.1 and 11.4
// (network_config.json of the project's contracts repo, the Uniswap v4 deployments page, Sourcify-verified
// sources), with the independent verification pass applied. Every address below is the strict EIP-55 form
// (check-addresses and constants.test.ts enforce it). NO address ever comes from a market's text, a model or
// the page: a market is accepted only if the Manager says it is active and its pool keys name a hook from the
// allowlist below.
//
// Base (8453) is the only deployment today. An Ethereum move was announced on 2026-09-21 with no addresses and
// no date, so nothing is guessed for it: `deploymentFor` fails closed for any other chain.

export const TRUEO_ADAPTER_VERSION = "trueo-0.1";

export interface TrueoHook {
  readonly address: string;
  // "v2.0.0" is the active hook generation (LP fee 1 pip); "v1.1.0" is inactive for new markets but still hosts
  // most listed markets (LP fee 0.80 per cent).
  readonly generation: "v1.1.0" | "v2.0.0";
}

export interface TrueoDeployment {
  readonly chainId: number;
  readonly caip2: string;
  readonly manager: string;
  // The payment token of every market this adapter accepts: TYD, an ERC-4626 share over USDC. Not USD.
  readonly tyd: string;
  readonly usdc: string;
  readonly stateView: string;
  readonly quoter: string;
  readonly hooks: readonly TrueoHook[];
  // The market contract versions accepted. A revert on VERSION() marks a V1 (Uniswap v3) market, which is skipped.
  readonly marketVersions: readonly string[];
  readonly tydDecimals: number;
  readonly outcomeDecimals: number;
  // The public RPC the standalone build may call (a listed origin in headers.config.ts); a caller may pass its own.
  readonly defaultRpcUrl: string;
}

const BASE: TrueoDeployment = Object.freeze({
  chainId: 8453,
  caip2: "eip155:8453",
  manager: "0x61A98Bef11867c69489B91f340fE545eEfc695d7",
  tyd: "0xb13CF163d916917d9cD6E836905cA5f12a1dEF4B",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  stateView: "0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71",
  quoter: "0x0d5e0F971ED27FBfF6c2837bf31316121532048D",
  hooks: Object.freeze([
    Object.freeze({ address: "0x3E83479B2276EcFb7C7181F67b5d092d3511e0C4", generation: "v2.0.0" as const }),
    Object.freeze({ address: "0x1cFeAD8E66cebC5E51093Dfd247Ad34f841740c4", generation: "v1.1.0" as const }),
  ]),
  marketVersions: Object.freeze(["2.0.0"]),
  tydDecimals: 6,
  outcomeDecimals: 18,
  defaultRpcUrl: "https://base-rpc.publicnode.com",
});

export const TRUEO_DEPLOYMENTS: Readonly<Record<number, TrueoDeployment>> = Object.freeze({ 8453: BASE });

export function deploymentFor(chainId: number): TrueoDeployment {
  const deployment = Object.hasOwn(TRUEO_DEPLOYMENTS, chainId) ? TRUEO_DEPLOYMENTS[chainId] : undefined;
  if (deployment === undefined) throw new AdapterFailure("trueo", "NOT_SUPPORTED", "chain_not_pinned");
  return deployment;
}

// Every market status of the contract (research 11 section 5.3). getCurrentStatus() is derived from time; the
// stored slot and any indexer lag.
export const MARKET_STATUS = Object.freeze({
  Created: 0,
  OpenForResolution: 1,
  ResolutionProposed: 2,
  DisputeRaised: 3,
  SetByCouncil: 4,
  ResetByCouncil: 5,
  EscalatedDisputeRaised: 6,
  Finalized: 7,
} as const);

// winningPosition: 0 unresolved, 1 YES, 2 NO, 3 CANCELED (pays 0.5 TYD per YES or NO token).
export const WINNING = Object.freeze({ None: 0n, Yes: 1n, No: 2n, Canceled: 3n } as const);

// Page and ladder sizes.
export const TRUEO_LIST_PAGE_DEFAULT = 20;
export const TRUEO_LIST_PAGE_MAX = 50;
// Shares quoted for the executable book (exact amounts). A size past the pool's liquidity reverts and simply
// ends the ladder on that side.
export const TRUEO_QUOTE_LADDER: readonly bigint[] = Object.freeze([1n, 5n, 25n, 100n, 500n]);
export const TRUEO_MAX_BATCH = 40;
export const TRUEO_SINGLE_CONCURRENCY = 4;
export const TRUEO_MAX_BODY_CHARS = 2_000_000;
export const TRUEO_MAX_ACTIVE_MARKETS = 5_000;

export const TRUEO_LIST_TTL_MS = 30_000;
export const TRUEO_BOOK_TTL_MS = 15_000;
export const TRUEO_FEE_TTL_SEC = 60;

// Terms as read (research 11 sections 13 and 15 verification row 15, C8). The undocumented first-party API
// host is off limits: the terms bar data scraping and the host is listed in NEVER_IN_APP_HOSTS.
export const TRUEO_TERMS_NOTE =
  "Trueo terms (as read): not offered to US persons or a long list of territories; VPN circumvention prohibited; data scraping prohibited, so only on-chain reads are used; no bot policy found.";

export const TRUEO_VERIFICATION = Object.freeze({
  contracts: "pinned from the project's config and Uniswap's deployments page; none read live by this build (no eth_call was permitted)",
  abis: "function signatures cross-checked against the selectors in the research notes (constants.test.ts)",
  position_reads: "getUserPosition semantics are unverified; balances come from the ERC-20 tokens",
  prices: "decoded from fixtures and golden vectors; never compared with a live pool",
});
