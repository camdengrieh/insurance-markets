import { decodeFunctionResult, encodeFunctionData, getAddress, isAddress } from "viem";

import { ERC20_ABI, HOOK_ABI, MANAGER_ABI, MARKET_ABI, QUOTER_ABI, STATE_VIEW_ABI, VAULT_ABI } from "./abi";
import { TRUEO_MAX_ACTIVE_MARKETS, type TrueoDeployment, type TrueoHook } from "./constants";
import { AdapterFailure } from "./errors";
import { poolIdOf, type PoolKey } from "./math";
import type { Address, Hex, Rpc, RpcCall, RpcResult } from "./rpc";

// Everything the adapter reads from the chain, as typed functions over the injected RPC. Each read is a view
// (or a quote simulated with eth_call); decoding is defensive: a call that reverts, returns nothing or decodes
// to the wrong shape yields null, and the market it belongs to is skipped with a reason instead of guessed.

export type SkipReason =
  | "not_active"
  | "payment_token_not_tyd"
  | "unsupported_version"
  | "unknown_status"
  | "read_failed"
  | "hook_not_allowlisted"
  | "pool_key_mismatch"
  | "pool_id_mismatch"
  | "token_decimals_mismatch";

export interface Skip {
  readonly market: Address;
  readonly reason: SkipReason;
}

export interface PoolState {
  readonly id: Hex;
  readonly key: PoolKey;
  // null: the read failed (unknown), never "zero".
  readonly sqrtPriceX96: bigint | null;
  readonly lpFee: number | null;
  readonly paused: boolean | null;
  readonly liquidity: bigint | null;
  // True when the pool's fee carries the dynamic-fee flag, so `key.fee` is not a rate.
  readonly dynamicFee: boolean;
}

export interface MarketData {
  readonly address: Address;
  readonly chainId: number;
  readonly version: string;
  // getCurrentStatus() (derived from time), 0 to 7.
  readonly status: number;
  // winningPosition(): 0 none, 1 YES, 2 NO, 3 CANCELED.
  readonly winning: bigint;
  readonly question: string;
  // Present only in the "full" profile.
  readonly source: string | null;
  readonly additionalInfo: string | null;
  readonly endOfTrading: bigint;
  readonly paused: boolean;
  readonly yesToken: Address;
  readonly noToken: Address;
  readonly hook: TrueoHook;
  readonly yes: PoolState;
  readonly no: PoolState;
}

export type Profile = "summary" | "full";

export interface ReadOutcome {
  readonly markets: readonly MarketData[];
  readonly skipped: readonly Skip[];
}

const UINT24_DYNAMIC_FLAG = 0x800000;
const MAX_UINT128 = (1n << 128n) - 1n;

export function isStrictAddress(value: string): value is Address {
  return isAddress(value, { strict: true });
}

function decode<T>(result: RpcResult | undefined, read: (data: Hex) => T): T | null {
  if (result === undefined || !result.ok) return null;
  try {
    return read(result.data);
  } catch {
    return null;
  }
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export interface Reader {
  activeCount(deadlineAtMs: number): Promise<bigint>;
  activeAddresses(from: bigint, to: bigint, deadlineAtMs: number): Promise<readonly Address[]>;
  managerPaused(deadlineAtMs: number): Promise<boolean | null>;
  readMarkets(addresses: readonly Address[], profile: Profile, deadlineAtMs: number): Promise<ReadOutcome>;
  hookFee(hook: Address, deadlineAtMs: number): Promise<{ readonly numerator: bigint; readonly denominator: bigint } | null>;
  tydUsd(deadlineAtMs: number): Promise<{ readonly assetsPerShareRaw: bigint } | null>;
  quotes(
    key: PoolKey,
    side: "buy" | "sell",
    outcomeIsCurrency0: boolean,
    rawShares: readonly bigint[],
    deadlineAtMs: number,
  ): Promise<ReadonlyArray<bigint | null>>;
  balances(owner: Address, tokens: readonly Address[], deadlineAtMs: number): Promise<ReadonlyArray<bigint | null>>;
  claimable(markets: readonly Address[], owner: Address, deadlineAtMs: number): Promise<ReadonlyArray<{ readonly claimable: bigint | null; readonly position: readonly [bigint, bigint] | null }>>;
}

export function createReader(rpc: Rpc, deployment: TrueoDeployment): Reader {
  const manager = deployment.manager as Address;
  const stateView = deployment.stateView as Address;
  const quoter = deployment.quoter as Address;
  const tyd = deployment.tyd as Address;
  const decimalsCache = new Map<string, number>();
  let tydVerified = false;

  const hookOf = (address: string): TrueoHook | undefined => deployment.hooks.find((hook) => sameAddress(hook.address, address));

  async function activeCount(deadlineAtMs: number): Promise<bigint> {
    const [result] = await rpc.callMany([{ to: manager, data: encodeFunctionData({ abi: MANAGER_ABI, functionName: "numberOfActiveMarkets" }) }], deadlineAtMs);
    const count = decode(result, (data) => decodeFunctionResult({ abi: MANAGER_ABI, functionName: "numberOfActiveMarkets", data }));
    // A node that answers "0x" (a wrong chain, or no contract here) must not read as "no markets".
    if (count === null) throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "manager_unreadable");
    if (count > BigInt(TRUEO_MAX_ACTIVE_MARKETS)) throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "market_count_implausible");
    return count;
  }

  async function activeAddresses(from: bigint, to: bigint, deadlineAtMs: number): Promise<readonly Address[]> {
    const calls: RpcCall[] = [];
    for (let index = from; index < to; index += 1n) {
      calls.push({ to: manager, data: encodeFunctionData({ abi: MANAGER_ABI, functionName: "getActiveMarketAddress", args: [index] }) });
    }
    if (calls.length === 0) return [];
    const results = await rpc.callMany(calls, deadlineAtMs);
    const out: Address[] = [];
    for (const result of results) {
      const address = decode(result, (data) => decodeFunctionResult({ abi: MANAGER_ABI, functionName: "getActiveMarketAddress", data }));
      if (address === null) throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "market_address_unreadable");
      out.push(address);
    }
    return out;
  }

  async function managerPaused(deadlineAtMs: number): Promise<boolean | null> {
    const [result] = await rpc.callMany([{ to: manager, data: encodeFunctionData({ abi: MANAGER_ABI, functionName: "paused" }) }], deadlineAtMs);
    return decode(result, (data) => decodeFunctionResult({ abi: MANAGER_ABI, functionName: "paused", data }));
  }

  // The payment token is checked once per reader: 6 decimals and USDC as its asset. If either differs, every
  // price and amount would be off by a power of ten or priced in the wrong unit, so nothing is shown.
  async function verifyTyd(deadlineAtMs: number): Promise<void> {
    if (tydVerified) return;
    const results = await rpc.callMany(
      [
        { to: tyd, data: encodeFunctionData({ abi: VAULT_ABI, functionName: "decimals" }) },
        { to: tyd, data: encodeFunctionData({ abi: VAULT_ABI, functionName: "asset" }) },
      ],
      deadlineAtMs,
    );
    const decimals = decode(results[0], (data) => decodeFunctionResult({ abi: VAULT_ABI, functionName: "decimals", data }));
    const asset = decode(results[1], (data) => decodeFunctionResult({ abi: VAULT_ABI, functionName: "asset", data }));
    if (decimals !== deployment.tydDecimals) throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "tyd_decimals");
    if (asset === null || !sameAddress(asset, deployment.usdc)) throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "tyd_asset");
    decimalsCache.set(tyd.toLowerCase(), decimals);
    tydVerified = true;
  }

  function staticCalls(market: Address, profile: Profile): RpcCall[] {
    const to = market;
    const calls: RpcCall[] = [
      { to: manager, data: encodeFunctionData({ abi: MANAGER_ABI, functionName: "isActiveMarket", args: [market] }) },
      { to, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "paymentToken" }) },
      { to, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "VERSION" }) },
      { to, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "getCurrentStatus" }) },
      { to, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "winningPosition" }) },
      { to, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "marketQuestion" }) },
      { to, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "endOfTrading" }) },
      { to, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "yesToken" }) },
      { to, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "noToken" }) },
      { to, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "getPoolKeys" }) },
      { to, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "getPoolIds" }) },
      { to, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "paused" }) },
    ];
    if (profile === "full") {
      calls.push(
        { to, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "marketSource" }) },
        { to, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "additionalInfo" }) },
      );
    }
    return calls;
  }

  async function readMarkets(addresses: readonly Address[], profile: Profile, deadlineAtMs: number): Promise<ReadOutcome> {
    if (addresses.length === 0) return { markets: [], skipped: [] };
    await verifyTyd(deadlineAtMs);
    const width = profile === "full" ? 14 : 12;
    const results = await rpc.callMany(addresses.flatMap((address) => staticCalls(address, profile)), deadlineAtMs);

    interface Candidate {
      address: Address;
      version: string;
      status: number;
      winning: bigint;
      question: string;
      source: string | null;
      additionalInfo: string | null;
      endOfTrading: bigint;
      paused: boolean;
      yesToken: Address;
      noToken: Address;
      hook: TrueoHook;
      yesKey: PoolKey;
      noKey: PoolKey;
      yesId: Hex;
      noId: Hex;
    }
    const skipped: Skip[] = [];
    const candidates: Candidate[] = [];

    addresses.forEach((address, index) => {
      const at = (offset: number): RpcResult | undefined => results[index * width + offset];
      const isActive = decode(at(0), (data) => decodeFunctionResult({ abi: MANAGER_ABI, functionName: "isActiveMarket", data }));
      if (isActive === null) return void skipped.push({ market: address, reason: "read_failed" });
      if (!isActive) return void skipped.push({ market: address, reason: "not_active" });
      const paymentToken = decode(at(1), (data) => decodeFunctionResult({ abi: MARKET_ABI, functionName: "paymentToken", data }));
      // A conditional market's payment token is another market's outcome token, and a V1 market has no
      // VERSION(): both are outside this adapter.
      if (paymentToken === null) return void skipped.push({ market: address, reason: "read_failed" });
      if (!sameAddress(paymentToken, tyd)) return void skipped.push({ market: address, reason: "payment_token_not_tyd" });
      const version = decode(at(2), (data) => decodeFunctionResult({ abi: MARKET_ABI, functionName: "VERSION", data }));
      if (version === null || !deployment.marketVersions.includes(version)) return void skipped.push({ market: address, reason: "unsupported_version" });
      const status = decode(at(3), (data) => decodeFunctionResult({ abi: MARKET_ABI, functionName: "getCurrentStatus", data }));
      if (status === null) return void skipped.push({ market: address, reason: "read_failed" });
      if (status > 7) return void skipped.push({ market: address, reason: "unknown_status" });
      const winning = decode(at(4), (data) => decodeFunctionResult({ abi: MARKET_ABI, functionName: "winningPosition", data }));
      const question = decode(at(5), (data) => decodeFunctionResult({ abi: MARKET_ABI, functionName: "marketQuestion", data }));
      const endOfTrading = decode(at(6), (data) => decodeFunctionResult({ abi: MARKET_ABI, functionName: "endOfTrading", data }));
      const yesToken = decode(at(7), (data) => decodeFunctionResult({ abi: MARKET_ABI, functionName: "yesToken", data }));
      const noToken = decode(at(8), (data) => decodeFunctionResult({ abi: MARKET_ABI, functionName: "noToken", data }));
      const keys = decode(at(9), (data) => decodeFunctionResult({ abi: MARKET_ABI, functionName: "getPoolKeys", data }));
      const ids = decode(at(10), (data) => decodeFunctionResult({ abi: MARKET_ABI, functionName: "getPoolIds", data }));
      const paused = decode(at(11), (data) => decodeFunctionResult({ abi: MARKET_ABI, functionName: "paused", data }));
      const source = profile === "full" ? decode(at(12), (data) => decodeFunctionResult({ abi: MARKET_ABI, functionName: "marketSource", data })) : null;
      const additionalInfo = profile === "full" ? decode(at(13), (data) => decodeFunctionResult({ abi: MARKET_ABI, functionName: "additionalInfo", data })) : null;
      if (winning === null || question === null || endOfTrading === null || yesToken === null || noToken === null || keys === null || ids === null || paused === null) {
        return void skipped.push({ market: address, reason: "read_failed" });
      }
      if (profile === "full" && (source === null || additionalInfo === null)) return void skipped.push({ market: address, reason: "read_failed" });

      const [yesKey, noKey] = keys;
      const hook = hookOf(yesKey.hooks);
      // The hook decides a swap's fee and can block it. Only the two generations the project published count,
      // and both pools must use the same one.
      if (hook === undefined || !sameAddress(yesKey.hooks, noKey.hooks)) return void skipped.push({ market: address, reason: "hook_not_allowlisted" });
      const pairs = (key: PoolKey, token: Address): boolean => {
        const set = [key.currency0.toLowerCase(), key.currency1.toLowerCase()].sort();
        const want = [tyd.toLowerCase(), token.toLowerCase()].sort();
        // Uniswap orders the pair by address, and the outcome token is never TYD.
        return set[0] === want[0] && set[1] === want[1] && BigInt(key.currency0) < BigInt(key.currency1) && token.toLowerCase() !== tyd.toLowerCase();
      };
      if (!pairs(yesKey, yesToken) || !pairs(noKey, noToken) || yesToken.toLowerCase() === noToken.toLowerCase()) return void skipped.push({ market: address, reason: "pool_key_mismatch" });
      const yesId = poolIdOf(yesKey);
      const noId = poolIdOf(noKey);
      if (yesId.toLowerCase() !== ids[0].toLowerCase() || noId.toLowerCase() !== ids[1].toLowerCase()) return void skipped.push({ market: address, reason: "pool_id_mismatch" });
      candidates.push({
        address,
        version,
        status,
        winning,
        question,
        source,
        additionalInfo,
        endOfTrading,
        paused,
        yesToken,
        noToken,
        hook,
        yesKey,
        noKey,
        yesId,
        noId,
      });
    });
    if (candidates.length === 0) return { markets: [], skipped };

    // Second stage: outcome-token decimals (cached), pool prices, pause flags and liquidity.
    const calls: RpcCall[] = [];
    const slots = new Map<string, number>();
    const add = (label: string, call: RpcCall): void => {
      slots.set(label, calls.length);
      calls.push(call);
    };
    for (const c of candidates) {
      for (const token of [c.yesToken, c.noToken]) {
        if (!decimalsCache.has(token.toLowerCase()) && !slots.has(`dec:${token.toLowerCase()}`)) add(`dec:${token.toLowerCase()}`, { to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "decimals" }) });
      }
      for (const [side, id] of [
        ["yes", c.yesId],
        ["no", c.noId],
      ] as const) {
        const base = `${c.address.toLowerCase()}:${side}`;
        add(`${base}:slot0`, { to: stateView, data: encodeFunctionData({ abi: STATE_VIEW_ABI, functionName: "getSlot0", args: [id] }) });
        add(`${base}:liq`, { to: stateView, data: encodeFunctionData({ abi: STATE_VIEW_ABI, functionName: "getLiquidity", args: [id] }) });
        add(`${base}:paused`, { to: c.hook.address as Address, data: encodeFunctionData({ abi: HOOK_ABI, functionName: "poolPaused", args: [id] }) });
      }
    }
    const second = await rpc.callMany(calls, deadlineAtMs);
    const slotResult = (label: string): RpcResult | undefined => {
      const at = slots.get(label);
      return at === undefined ? undefined : second[at];
    };
    for (const [label] of slots) {
      if (!label.startsWith("dec:")) continue;
      const decimals = decode(slotResult(label), (data) => decodeFunctionResult({ abi: ERC20_ABI, functionName: "decimals", data }));
      if (decimals !== null) decimalsCache.set(label.slice(4), decimals);
    }

    const markets: MarketData[] = [];
    for (const c of candidates) {
      const yesDecimals = decimalsCache.get(c.yesToken.toLowerCase());
      const noDecimals = decimalsCache.get(c.noToken.toLowerCase());
      if (yesDecimals === undefined || noDecimals === undefined) {
        skipped.push({ market: c.address, reason: "read_failed" });
        continue;
      }
      if (yesDecimals !== deployment.outcomeDecimals || noDecimals !== deployment.outcomeDecimals) {
        skipped.push({ market: c.address, reason: "token_decimals_mismatch" });
        continue;
      }
      const pool = (side: "yes" | "no", id: Hex, key: PoolKey): PoolState => {
        const base = `${c.address.toLowerCase()}:${side}`;
        const slot0 = decode(slotResult(`${base}:slot0`), (data) => decodeFunctionResult({ abi: STATE_VIEW_ABI, functionName: "getSlot0", data }));
        return {
          id,
          key,
          sqrtPriceX96: slot0 === null ? null : slot0[0],
          lpFee: slot0 === null ? null : slot0[3],
          paused: decode(slotResult(`${base}:paused`), (data) => decodeFunctionResult({ abi: HOOK_ABI, functionName: "poolPaused", data })),
          liquidity: decode(slotResult(`${base}:liq`), (data) => decodeFunctionResult({ abi: STATE_VIEW_ABI, functionName: "getLiquidity", data })),
          dynamicFee: (key.fee & UINT24_DYNAMIC_FLAG) !== 0,
        };
      };
      markets.push({
        address: c.address,
        chainId: deployment.chainId,
        version: c.version,
        status: c.status,
        winning: c.winning,
        question: c.question,
        source: c.source,
        additionalInfo: c.additionalInfo,
        endOfTrading: c.endOfTrading,
        paused: c.paused,
        yesToken: c.yesToken,
        noToken: c.noToken,
        hook: c.hook,
        yes: pool("yes", c.yesId, c.yesKey),
        no: pool("no", c.noId, c.noKey),
      });
    }
    return { markets, skipped };
  }

  async function hookFee(hook: Address, deadlineAtMs: number): Promise<{ numerator: bigint; denominator: bigint } | null> {
    const results = await rpc.callMany(
      [
        { to: hook, data: encodeFunctionData({ abi: HOOK_ABI, functionName: "feeNumerator" }) },
        { to: hook, data: encodeFunctionData({ abi: HOOK_ABI, functionName: "FEE_DENOMINATOR" }) },
      ],
      deadlineAtMs,
    );
    const numerator = decode(results[0], (data) => decodeFunctionResult({ abi: HOOK_ABI, functionName: "feeNumerator", data }));
    const denominator = decode(results[1], (data) => decodeFunctionResult({ abi: HOOK_ABI, functionName: "FEE_DENOMINATOR", data }));
    if (numerator === null || denominator === null) return null;
    // Admin-settable (setFeeRate), so it is read on every call that needs it and never cached here.
    return { numerator, denominator };
  }

  async function tydUsd(deadlineAtMs: number): Promise<{ assetsPerShareRaw: bigint } | null> {
    const [result] = await rpc.callMany([{ to: tyd, data: encodeFunctionData({ abi: VAULT_ABI, functionName: "convertToAssets", args: [10n ** BigInt(deployment.tydDecimals)] }) }], deadlineAtMs);
    const assets = decode(result, (data) => decodeFunctionResult({ abi: VAULT_ABI, functionName: "convertToAssets", data }));
    return assets === null ? null : { assetsPerShareRaw: assets };
  }

  async function quotes(key: PoolKey, side: "buy" | "sell", outcomeIsCurrency0: boolean, rawShares: readonly bigint[], deadlineAtMs: number): Promise<ReadonlyArray<bigint | null>> {
    // Buy: an exact number of outcome tokens OUT, TYD in (the input currency is the other one). Sell: an exact
    // number of outcome tokens IN, TYD out. `rawShares` are 18-decimal token units, so a fractional position is
    // quoted exactly; an amount of zero or above uint128 cannot be quoted and answers null without a request.
    const valid = rawShares.map((amount) => amount > 0n && amount <= MAX_UINT128);
    const calls: RpcCall[] = [];
    rawShares.forEach((exactAmount, index) => {
      if (valid[index] !== true) return;
      const params = { poolKey: key, zeroForOne: side === "buy" ? !outcomeIsCurrency0 : outcomeIsCurrency0, exactAmount, hookData: "0x" as Hex };
      calls.push({
        to: quoter,
        data: side === "buy" ? encodeFunctionData({ abi: QUOTER_ABI, functionName: "quoteExactOutputSingle", args: [params] }) : encodeFunctionData({ abi: QUOTER_ABI, functionName: "quoteExactInputSingle", args: [params] }),
      });
    });
    const results = calls.length === 0 ? [] : await rpc.callMany(calls, deadlineAtMs);
    let next = 0;
    return rawShares.map((_, index) => {
      if (valid[index] !== true) return null;
      const result = results[next];
      next += 1;
      return decode(result, (data) => {
        const name = side === "buy" ? "quoteExactOutputSingle" : "quoteExactInputSingle";
        const [amount] = decodeFunctionResult({ abi: QUOTER_ABI, functionName: name, data });
        return amount;
      });
    });
  }

  async function balances(owner: Address, tokens: readonly Address[], deadlineAtMs: number): Promise<ReadonlyArray<bigint | null>> {
    if (tokens.length === 0) return [];
    const results = await rpc.callMany(tokens.map((token) => ({ to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [owner] }) })), deadlineAtMs);
    return results.map((result) => decode(result, (data) => decodeFunctionResult({ abi: ERC20_ABI, functionName: "balanceOf", data })));
  }

  async function claimable(markets: readonly Address[], owner: Address, deadlineAtMs: number) {
    if (markets.length === 0) return [];
    const calls = markets.flatMap((market): RpcCall[] => [
      { to: market, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "getUserClaimableAmount", args: [owner] }) },
      { to: market, data: encodeFunctionData({ abi: MARKET_ABI, functionName: "getUserPosition", args: [owner] }) },
    ]);
    const results = await rpc.callMany(calls, deadlineAtMs);
    return markets.map((_, index) => ({
      claimable: decode(results[index * 2], (data) => decodeFunctionResult({ abi: MARKET_ABI, functionName: "getUserClaimableAmount", data })),
      position: decode(results[index * 2 + 1], (data) => {
        const [yes, no] = decodeFunctionResult({ abi: MARKET_ABI, functionName: "getUserPosition", data });
        return [yes, no] as const;
      }),
    }));
  }

  return { activeCount, activeAddresses, managerPaused, readMarkets, hookFee, tydUsd, quotes, balances, claimable };
}

// Parse a market id `${chainId}:${address}` to a chain and a checksummed address, or null.
export function parseMarketId(marketId: string): { readonly chainId: number; readonly address: Address } | null {
  const match = /^([0-9]{1,10}):(0x[0-9a-fA-F]{40})$/.exec(marketId);
  if (match === null) return null;
  const address = match[2] ?? "";
  // All-lowercase passes; mixed case must carry the right checksum (a typo'd address is rejected, not repaired).
  if (!isStrictAddress(address)) return null;
  return { chainId: Number(match[1]), address: getAddress(address) };
}
