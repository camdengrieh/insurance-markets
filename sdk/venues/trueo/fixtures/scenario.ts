import { getAddress } from "viem";

import { deploymentFor } from "../constants.js";
import type { PoolKey } from "../math.js";
import type { Address, Hex } from "../rpc.js";
import captured from "./base_captured_2026-10-20.json";
import { emptyChain, mockRpc, type MockChain, type MockMarket, type MockPool, type MockRpc } from "./mock-chain.js";

// The world for the Trueo tests. Every value in it was READ FROM BASE MAINNET on 2026-10-20 (eth_call over a public
// RPC, see base_captured_2026-10-20.json and README.txt): 14 real markets, both hooks' fee numerators, the TYD vault
// rate and real V4Quoter results. The markets and tokens keep their real addresses.
//
// Eight of the markets are loaded into the default world. The first two are used exactly as captured (they have
// opposite token orders). Six are loaded with ONE state field overridden, so the cases the adapter must tell apart
// (closed, finalized, canceled, conditional, unlisted hook, paused pool) exist in the default world:
//   closed       status 1 and the v1.1.0 hook with its 8000-pip pool fee
//   finalizedYes status 7, winner 1          canceled   status 7, winner 3
//   conditional  the payment token replaced by USDC (not TYD)
//   foreignHook  the hook replaced by the StateView contract (a real address that is not an allowlisted hook)
//   pausedPool   the Yes pool marked paused
// The remaining six captured markets are spares for tests that need one more state; `variant(index, overrides)`
// loads a spare with the fields a test is about replaced. An override is a test input, not venue data.

export const DEPLOYMENT = deploymentFor(8453);
export const TYD = DEPLOYMENT.tyd as Address;
export const USDC = DEPLOYMENT.usdc as Address;
export const HOOK_V2 = DEPLOYMENT.hooks[0]?.address as Address;
export const HOOK_V1 = DEPLOYMENT.hooks[1]?.address as Address;
// A real contract that is not an allowlisted hook.
export const UNLISTED_HOOK = DEPLOYMENT.stateView as Address;
export const NOW_MS = Date.parse(captured.capturedAt);
export const NOW_S = BigInt(Math.floor(NOW_MS / 1000));
// The well-known public Anvil account 0, used as an owner address in tests that read nothing of it.
export const OWNER = getAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");

export const SPARE_FIRST = 8;
export const SPARE_COUNT = captured.markets.length - SPARE_FIRST;

interface CapturedPool {
  readonly sqrtPriceX96: string;
  readonly lpFee: number;
  readonly liquidity: string;
  readonly poolPaused: boolean;
  readonly tokenDecimals: number;
}

function poolOf(raw: CapturedPool, quotes: { buy: Record<string, string | null>; sell: Record<string, string | null> } | undefined): MockPool {
  const big = (table: Record<string, string | null>): Record<string, bigint | null> => Object.fromEntries(Object.entries(table).map(([size, value]) => [size, value === null ? null : BigInt(value)]));
  return {
    sqrtPriceX96: BigInt(raw.sqrtPriceX96),
    lpFee: raw.lpFee,
    liquidity: BigInt(raw.liquidity),
    paused: raw.poolPaused,
    ...(quotes === undefined ? {} : { quotes: { buy: big(quotes.buy), sell: big(quotes.sell) } }),
  };
}

function keyOf(raw: { currency0: string; currency1: string; fee: number; tickSpacing: number; hooks: string }): PoolKey {
  return { currency0: raw.currency0 as Address, currency1: raw.currency1 as Address, fee: raw.fee, tickSpacing: raw.tickSpacing, hooks: raw.hooks as Address };
}

// The captured market `index`, exactly as read.
export function capturedMarket(index: number): MockMarket {
  const raw = captured.markets[index];
  if (raw === undefined) throw new RangeError(`no captured market ${index}`);
  const quoteTable = captured.quotes as Record<string, { buy: Record<string, string | null>; sell: Record<string, string | null> }>;
  const [yesKey, noKey] = raw.getPoolKeys as unknown as [Parameters<typeof keyOf>[0], Parameters<typeof keyOf>[0]];
  return {
    address: raw.address as Address,
    question: raw.marketQuestion,
    source: raw.marketSource,
    additionalInfo: raw.additionalInfo,
    endOfTrading: BigInt(raw.endOfTrading),
    status: Number(raw.getCurrentStatus),
    winning: BigInt(raw.winningPosition),
    version: raw.VERSION,
    paymentToken: raw.paymentToken as Address,
    yesToken: raw.yesToken as Address,
    noToken: raw.noToken as Address,
    hook: yesKey.hooks as Address,
    yesKey: keyOf(yesKey),
    noKey: keyOf(noKey),
    paused: raw.paused,
    yes: poolOf(raw.pools.yes, quoteTable[raw.pools.yes.id]),
    no: poolOf(raw.pools.no, quoteTable[raw.pools.no.id]),
  };
}

export interface Overrides {
  readonly question?: string;
  readonly source?: string;
  readonly additionalInfo?: string;
  readonly status?: number;
  readonly winning?: bigint;
  readonly version?: string;
  readonly paymentToken?: Address;
  readonly paused?: boolean;
  // Replaces the hook in both pool keys.
  readonly hook?: Address;
  // Replaces the fee in both pool keys, and the pools' live LP fee with it.
  readonly fee?: number;
  readonly yesPool?: Partial<MockPool>;
  readonly noPool?: Partial<MockPool>;
  readonly yesKey?: Partial<PoolKey>;
  readonly noKey?: Partial<PoolKey>;
  readonly noToken?: Address;
  readonly reportedIds?: readonly [Hex, Hex];
  readonly outcomeDecimals?: number;
}

// The captured market `index` with the fields in `overrides` replaced. The address stays the real one.
export function variant(index: number, overrides: Overrides = {}): MockMarket {
  const base = capturedMarket(index);
  const hook = overrides.hook ?? base.hook;
  const fee = overrides.fee ?? base.yesKey.fee;
  const yesKey: PoolKey = { ...base.yesKey, hooks: hook, fee, ...overrides.yesKey };
  const noKey: PoolKey = { ...base.noKey, hooks: hook, fee: overrides.fee ?? base.noKey.fee, ...overrides.noKey };
  return {
    ...base,
    question: overrides.question ?? base.question,
    source: overrides.source ?? base.source,
    additionalInfo: overrides.additionalInfo ?? base.additionalInfo,
    status: overrides.status ?? base.status,
    winning: overrides.winning ?? base.winning,
    version: overrides.version ?? base.version,
    paymentToken: overrides.paymentToken ?? base.paymentToken,
    paused: overrides.paused ?? base.paused,
    noToken: overrides.noToken ?? base.noToken,
    hook,
    yesKey,
    noKey,
    yes: { ...base.yes, ...(overrides.fee === undefined ? {} : { lpFee: overrides.fee }), ...overrides.yesPool },
    no: { ...base.no, ...(overrides.fee === undefined ? {} : { lpFee: overrides.fee }), ...overrides.noPool },
    ...(overrides.reportedIds === undefined ? {} : { reportedIds: overrides.reportedIds }),
    ...(overrides.outcomeDecimals === undefined ? {} : { outcomeDecimals: overrides.outcomeDecimals }),
  };
}

export function addMarket(chain: MockChain, market: MockMarket, options: { readonly active?: boolean } = {}): MockMarket {
  chain.markets.set(market.address.toLowerCase(), market);
  if (options.active !== false) chain.activeMarkets.push(market.address);
  return market;
}

export interface World {
  readonly chain: MockChain;
  readonly rpc: MockRpc;
  readonly live: MockMarket;
  readonly closed: MockMarket;
  readonly finalizedYes: MockMarket;
  readonly canceled: MockMarket;
  readonly conditional: MockMarket;
  readonly foreignHook: MockMarket;
  readonly pausedPool: MockMarket;
  readonly flippedLive: MockMarket;
}

export function buildWorld(): World {
  const chain = emptyChain(USDC);
  for (const hook of captured.hooks) chain.hooks.set(hook.address.toLowerCase(), { feeNumerator: BigInt(hook.feeNumerator), denominator: BigInt(hook.denominator) });
  // The unlisted hook is a real contract that is not a hook: it answers no hook call.
  // Order matters: the pages the tests read follow this list.
  const live = addMarket(chain, capturedMarket(0));
  const flippedLive = addMarket(chain, capturedMarket(1));
  const closed = addMarket(chain, variant(2, { status: 1, hook: HOOK_V1, fee: 8000 }));
  const finalizedYes = addMarket(chain, variant(3, { status: 7, winning: 1n }));
  const canceled = addMarket(chain, variant(4, { status: 7, winning: 3n }));
  const conditional = addMarket(chain, variant(5, { paymentToken: USDC }));
  const foreignHook = addMarket(chain, variant(6, { hook: UNLISTED_HOOK }));
  const pausedPool = addMarket(chain, variant(7, { yesPool: { paused: true } }));
  return { chain, rpc: rpcFor(chain), live, closed, finalizedYes, canceled, conditional, foreignHook, pausedPool, flippedLive };
}

export function rpcFor(chain: MockChain): MockRpc {
  return mockRpc(chain, { manager: DEPLOYMENT.manager as Address, tyd: TYD, stateView: DEPLOYMENT.stateView as Address, quoter: DEPLOYMENT.quoter as Address });
}
