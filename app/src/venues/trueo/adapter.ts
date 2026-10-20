import { getAddress } from "viem";

import { fromBaseUnits, toDec } from "../../core/money";
import type {
  AdapterCaps,
  AdapterDeps,
  AdapterError,
  Book,
  FeeSpec,
  Level,
  ListMarketsQuery,
  Market,
  MarketRef,
  MarketSummary,
  Page,
  Result,
  Status,
  TokenRef,
  VenueHealth,
  VenueReadAdapter,
} from "../../core/ports";
import {
  deploymentFor,
  MARKET_STATUS,
  TRUEO_BOOK_TTL_MS,
  TRUEO_LIST_PAGE_DEFAULT,
  TRUEO_LIST_PAGE_MAX,
  TRUEO_QUOTE_LADDER,
  TRUEO_TERMS_NOTE,
  WINNING,
  type TrueoDeployment,
} from "./constants";
import { AdapterFailure } from "./errors";
import { resolveDeadline } from "./http";
import { scanTransfers, type TransferEvent } from "./logs";
import { ratioQty } from "./math";
import { bookOf, collateralOf, feeSpecOf, levelsFromLadder, marketOf, outcomeIsCurrency0, provOf, refOf, spotPrice, statusOf, summaryOf, type LadderPoint } from "./map";
import type { VenuePosition } from "./positions";
import { createReader, isStrictAddress, parseMarketId, type MarketData, type Reader, type Skip, type SkipReason } from "./reads";
import { createRpc, type Address, type Rpc } from "./rpc";

// Trueo (Base): outcome markets on Uniswap v4 pools behind a hook. Read-only, keyless. There is no API and no
// order book: every read is an eth_call (or, for the opt-in history scan, an eth_getLogs) to a public RPC,
// against addresses pinned in constants.ts. The undocumented first-party API host is never used (the terms
// bar scraping). Collateral is TYD, an ERC-4626 share over USDC, so every amount here is TYD, never dollars.
// Sources: docs/research/11-trueo.md, docs/dapp-design.md 4.2, 4.6, 7.2 (M0).

const CAPS: AdapterCaps = {
  listMarkets: true,
  // Titles live in contract storage; there is no index to search without reading every market.
  search: false,
  getMarket: true,
  getBook: true,
  getBooksBatch: true,
  getFeeSpec: true,
  getResolution: false,
  getPositionsByAddress: true,
  stream: false,
};

// Positions scan every active market unless the caller names markets; past this many it refuses to guess.
const POSITION_SCAN_MAX = 300;

export interface TrueoOptions {
  // Default 8453 (Base). Any other chain fails closed until a deployment is pinned for it.
  readonly chainId?: number;
  // The user's own RPC URL, or the default public one. https only.
  readonly rpcUrl?: string;
  readonly batch?: "auto" | "never";
  // Whole shares quoted for the book ladder.
  readonly quoteLadder?: readonly bigint[];
}

export interface TrueoReadReport {
  readonly listed: number;
  readonly skipped: readonly Skip[];
  readonly rpcMode: "batch" | "single";
}

export interface TrueoPositions {
  readonly positions: readonly VenuePosition[];
  // Holdings with no executable mark: their value is null, not zero.
  readonly unmarked: number;
  // Per market with a holding: the venue's own claimable amount and the cross-check against token balances.
  readonly claims: ReadonlyArray<{
    readonly marketId: string;
    readonly claimableTyd: string | null;
    // getUserPosition(owner) differs from the token balances, or could not be read. Its meaning is unverified.
    readonly venuePositionAgrees: boolean | null;
  }>;
  readonly scanned: number;
  readonly skipped: readonly Skip[];
}

export interface TrueoAdapter extends VenueReadAdapter {
  readonly id: "trueo";
  readonly deployment: TrueoDeployment;
  lastReadReport(): TrueoReadReport;
  // listMarkets plus every market the page left out and why (a conditional market, an unknown hook, ...).
  listMarketsDetailed(query: ListMarketsQuery): Promise<{ readonly page: Page<MarketSummary>; readonly skipped: readonly Skip[]; readonly total: number }>;
  // USD per one TYD from the vault, or null when unreadable. TYD is not a dollar.
  collateralRate(): Promise<{ readonly usdPerTyd: string | null; readonly asOfMs: number }>;
  positionsByAddress(owner: string, options: { readonly bindingId: string; readonly marketIds?: readonly string[]; readonly deadlineMs?: number }): Promise<TrueoPositions>;
  // Opt-in: outcome-token transfers of one owner in a block range. Nothing about price or cost.
  transferHistory(owner: string, marketId: string, range: { readonly fromBlock: bigint; readonly toBlock: bigint | "latest" }): Promise<readonly TransferEvent[]>;
}

function failureForSkip(reason: SkipReason): AdapterFailure {
  switch (reason) {
    case "not_active":
      return new AdapterFailure("trueo", "NOT_FOUND", reason);
    case "payment_token_not_tyd":
    case "unsupported_version":
      return new AdapterFailure("trueo", "NOT_SUPPORTED", reason);
    default:
      return new AdapterFailure("trueo", "SCHEMA_DRIFT", reason);
  }
}

function parseCursor(cursor: string | undefined): bigint {
  if (cursor === undefined || cursor === "") return 0n;
  if (!/^\d{1,6}$/.test(cursor)) throw new AdapterFailure("trueo", "NOT_SUPPORTED", "bad_cursor");
  return BigInt(cursor);
}

export function createTrueoAdapter(deps: AdapterDeps, options: TrueoOptions = {}): TrueoAdapter {
  const deployment = deploymentFor(options.chainId ?? 8453);
  const rpcUrl = options.rpcUrl ?? deployment.defaultRpcUrl;
  if (!/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?$/.test(rpcUrl)) throw new AdapterFailure("trueo", "NOT_SUPPORTED", "rpc_url_must_be_https");
  const rpc: Rpc = createRpc(deps, { url: rpcUrl, ...(options.batch === undefined ? {} : { batch: options.batch }) });
  const reader: Reader = createReader(rpc, deployment);
  const ladder = options.quoteLadder ?? TRUEO_QUOTE_LADDER;
  let report: TrueoReadReport = { listed: 0, skipped: [], rpcMode: rpc.mode() };
  // token (lowercase) -> the market it belongs to and which side, so a TokenRef without a marketId still resolves
  // after the market has been read once.
  const tokenIndex = new Map<string, { readonly marketId: string; readonly side: "yes" | "no" }>();

  function remember(data: MarketData): void {
    const marketId = refOf(data).marketId;
    tokenIndex.set(data.yesToken.toLowerCase(), { marketId, side: "yes" });
    tokenIndex.set(data.noToken.toLowerCase(), { marketId, side: "no" });
  }

  const deadline = (ms?: number): number => resolveDeadline(ms, deps.nowMs());

  async function listMarketsDetailed(query: ListMarketsQuery) {
    if (query.text !== undefined && query.text.trim() !== "") throw new AdapterFailure("trueo", "NOT_SUPPORTED", "no_text_search");
    const statuses: ReadonlySet<Status> = new Set<Status>(query.statuses === undefined || query.statuses.length === 0 ? ["active"] : query.statuses);
    const limit = BigInt(Math.min(Math.max(Math.trunc(query.limit ?? TRUEO_LIST_PAGE_DEFAULT), 1), TRUEO_LIST_PAGE_MAX));
    const offset = parseCursor(query.cursor);
    const until = deadline();
    const total = await reader.activeCount(until);
    const end = offset + limit < total ? offset + limit : total;
    const addresses = offset >= total ? [] : await reader.activeAddresses(offset, end, until);
    const outcome = await reader.readMarkets(addresses, "summary", until);
    const now = deps.nowMs();
    for (const data of outcome.markets) remember(data);
    const items = outcome.markets.map((data) => summaryOf(data, now)).filter((summary) => statuses.has(summary.status));
    report = { listed: items.length, skipped: outcome.skipped, rpcMode: rpc.mode() };
    return { page: { items, next: end < total ? end.toString() : null }, skipped: outcome.skipped, total: Number(total) };
  }

  async function listMarkets(query: ListMarketsQuery): Promise<Page<MarketSummary>> {
    return (await listMarketsDetailed(query)).page;
  }

  function resolveRef(ref: MarketRef): Address {
    const parsed = ref.venue === "trueo" ? parseMarketId(ref.marketId) : null;
    if (parsed === null || parsed.chainId !== deployment.chainId) throw new AdapterFailure("trueo", "NOT_FOUND", "bad_ref");
    return parsed.address;
  }

  async function readOne(address: Address, profile: "summary" | "full", until: number): Promise<MarketData> {
    const outcome = await reader.readMarkets([address], profile, until);
    const data = outcome.markets[0];
    if (data === undefined) throw failureForSkip(outcome.skipped[0]?.reason ?? "read_failed");
    remember(data);
    return data;
  }

  async function getMarket(ref: MarketRef): Promise<Market> {
    const address = resolveRef(ref);
    const until = deadline();
    const data = await readOne(address, "full", until);
    const hookFee = await reader.hookFee(data.hook.address as Address, until);
    return marketOf(data, hookFee, deployment, deps.nowMs());
  }

  async function getFeeSpec(market: Market): Promise<FeeSpec> {
    const address = resolveRef(market.ref);
    const until = deadline();
    const data = await readOne(address, "summary", until);
    return feeSpecOf(data, await reader.hookFee(data.hook.address as Address, until), deployment, deps.nowMs());
  }

  async function ladderBook(data: MarketData, side: "yes" | "no", until: number): Promise<Result<Book, AdapterError>> {
    const pool = side === "yes" ? data.yes : data.no;
    const token = side === "yes" ? data.yesToken : data.noToken;
    // A paused market or pool does not trade; an unreadable pause state is not "unpaused".
    if (data.paused || pool.paused !== false) return { ok: false, error: "VENUE_PAUSED" };
    const isCurrency0 = outcomeIsCurrency0(pool, token);
    const unit = 10n ** BigInt(deployment.outcomeDecimals);
    const raw = ladder.map((shares) => shares * unit);
    const [buy, sell] = await Promise.all([reader.quotes(pool.key, "buy", isCurrency0, raw, until), reader.quotes(pool.key, "sell", isCurrency0, raw, until)]);
    const points = (amounts: ReadonlyArray<bigint | null>): Array<LadderPoint | null> => ladder.map((shares, index) => (amounts[index] === null || amounts[index] === undefined ? null : { shares, amountRaw: amounts[index] as bigint }));
    const asks: readonly Level[] = levelsFromLadder(points(buy), "asks", deployment.tydDecimals);
    const bids: readonly Level[] = levelsFromLadder(points(sell), "bids", deployment.tydDecimals);
    if (asks.length === 0 && bids.length === 0) return { ok: false, error: "EMPTY_BOOK" };
    return { ok: true, value: bookOf(token, bids, asks, deps.nowMs()) };
  }

  async function getBooks(tokens: readonly TokenRef[], opts: { readonly deadlineMs: number }): Promise<ReadonlyArray<Result<Book, AdapterError>>> {
    const until = deadline(opts.deadlineMs);
    const results: Array<Result<Book, AdapterError> | undefined> = tokens.map(() => undefined);
    const wanted = new Map<Address, number[]>();
    const sides: Array<"yes" | "no" | undefined> = tokens.map(() => undefined);
    tokens.forEach((token, index) => {
      if (token.venue !== "trueo" || !isStrictAddress(token.tokenId)) {
        results[index] = { ok: false, error: "NOT_FOUND" };
        return;
      }
      const marketId = token.marketId ?? tokenIndex.get(token.tokenId.toLowerCase())?.marketId;
      const parsed = marketId === undefined ? null : parseMarketId(marketId);
      if (parsed === null || parsed.chainId !== deployment.chainId) {
        // No market known for this token: read the market first (listMarkets or getMarket).
        results[index] = { ok: false, error: "NOT_FOUND" };
        return;
      }
      const list = wanted.get(parsed.address) ?? [];
      list.push(index);
      wanted.set(parsed.address, list);
    });

    const addresses = [...wanted.keys()];
    let outcome;
    try {
      outcome = await reader.readMarkets(addresses, "summary", until);
    } catch (error) {
      const code = error instanceof AdapterFailure ? error.code : "TIMEOUT";
      for (const index of addresses.flatMap((address) => wanted.get(address) ?? [])) results[index] = { ok: false, error: code };
      return results.map((entry) => entry ?? { ok: false as const, error: "NOT_FOUND" as const });
    }
    for (const data of outcome.markets) remember(data);
    const byAddress = new Map(outcome.markets.map((data) => [data.address.toLowerCase(), data] as const));
    for (const address of addresses) {
      const data = byAddress.get(address.toLowerCase());
      for (const index of wanted.get(address) ?? []) {
        const token = tokens[index]?.tokenId ?? "";
        const side = data === undefined ? undefined : token.toLowerCase() === data.yesToken.toLowerCase() ? "yes" : token.toLowerCase() === data.noToken.toLowerCase() ? "no" : undefined;
        sides[index] = side;
        if (data === undefined || side === undefined) results[index] = { ok: false, error: "NOT_FOUND" };
      }
      if (data === undefined) continue;
      for (const index of wanted.get(address) ?? []) {
        const side = sides[index];
        if (side === undefined) continue;
        try {
          results[index] = await ladderBook(data, side, until);
        } catch (error) {
          results[index] = { ok: false, error: error instanceof AdapterFailure ? error.code : "TIMEOUT" };
        }
      }
    }
    return results.map((entry) => entry ?? { ok: false as const, error: "NOT_FOUND" as const });
  }

  async function health(): Promise<VenueHealth> {
    const notes = [
      `chain ${deployment.caip2}; every read is an eth_call or eth_getLogs to a public RPC against pinned contracts`,
      "collateral is TYD (an ERC-4626 share over USDC), not USD",
      "market and pool state are read live; the project's contracts are upgradeable and owner-administered",
      TRUEO_TERMS_NOTE,
    ];
    try {
      const until = deadline();
      const [count, paused] = await Promise.all([reader.activeCount(until), reader.managerPaused(until)]);
      if (paused === true) return { ok: false, notes: [...notes, "the Manager is paused", `${count} active markets`] };
      return { ok: true, notes: [...notes, `${count} active markets`] };
    } catch (error) {
      const code = error instanceof AdapterFailure ? error.code : "TIMEOUT";
      return { ok: false, notes: [...notes, `unreachable: ${code}`] };
    }
  }

  async function collateralRate(): Promise<{ readonly usdPerTyd: string | null; readonly asOfMs: number }> {
    const rate = await reader.tydUsd(deadline());
    const asOfMs = deps.nowMs();
    if (rate === null) return { usdPerTyd: null, asOfMs };
    // convertToAssets(1 TYD) in USDC raw units (6 decimals): exact.
    const usd = fromBaseUnits("usd", rate.assetsPerShareRaw, 6);
    return { usdPerTyd: usd === null ? null : toDec(usd), asOfMs };
  }

  async function positionsByAddress(owner: string, opts: { readonly bindingId: string; readonly marketIds?: readonly string[]; readonly deadlineMs?: number }): Promise<TrueoPositions> {
    if (!isStrictAddress(owner)) throw new AdapterFailure("trueo", "NOT_FOUND", "bad_owner");
    const holder = getAddress(owner);
    const until = deadline(opts.deadlineMs);

    let addresses: Address[];
    if (opts.marketIds !== undefined) {
      addresses = opts.marketIds.map((id) => {
        const parsed = parseMarketId(id);
        if (parsed === null || parsed.chainId !== deployment.chainId) throw new AdapterFailure("trueo", "NOT_FOUND", "bad_ref");
        return parsed.address;
      });
    } else {
      const total = await reader.activeCount(until);
      if (total > BigInt(POSITION_SCAN_MAX)) throw new AdapterFailure("trueo", "NOT_SUPPORTED", "too_many_markets_to_scan");
      addresses = [...(await reader.activeAddresses(0n, total, until))];
    }
    const outcome = await reader.readMarkets(addresses, "summary", until);
    for (const data of outcome.markets) remember(data);

    const tokens = outcome.markets.flatMap((data) => [data.yesToken, data.noToken]);
    const balances = await reader.balances(holder, tokens, until);
    const held: Array<{ data: MarketData; side: "yes" | "no"; raw: bigint }> = [];
    outcome.markets.forEach((data, index) => {
      const yes = balances[index * 2];
      const no = balances[index * 2 + 1];
      if (yes === null || no === null || yes === undefined || no === undefined) throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "balance_unreadable");
      if (yes > 0n) held.push({ data, side: "yes", raw: yes });
      if (no > 0n) held.push({ data, side: "no", raw: no });
    });

    const heldMarkets = [...new Map(held.map((entry) => [entry.data.address.toLowerCase(), entry.data] as const)).values()];
    const venue = await reader.claimable(heldMarkets.map((data) => data.address), holder, until);
    const claims = heldMarkets.map((data, index) => {
      const yes = balances[outcome.markets.indexOf(data) * 2];
      const no = balances[outcome.markets.indexOf(data) * 2 + 1];
      const position = venue[index]?.position ?? null;
      const claimable = venue[index]?.claimable ?? null;
      const claimableQty = claimable === null ? null : fromBaseUnits("tyd", claimable, deployment.tydDecimals);
      return {
        marketId: refOf(data).marketId,
        claimableTyd: claimableQty === null ? null : toDec(claimableQty),
        venuePositionAgrees: position === null || yes === undefined || no === undefined || yes === null || no === null ? null : position[0] === yes && position[1] === no,
      };
    });

    const now = deps.nowMs();
    const prov = provOf(now, `eth_call:${deployment.chainId}`, TRUEO_BOOK_TTL_MS);
    const positions: VenuePosition[] = [];
    let unmarked = 0;
    for (const entry of held) {
      const { data, side, raw } = entry;
      const qty = fromBaseUnits("shares", raw, deployment.outcomeDecimals);
      if (qty === null) throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "balance_shape");
      const status = statusOf(data);
      const token = side === "yes" ? data.yesToken : data.noToken;
      const pool = side === "yes" ? data.yes : data.no;
      let markPrice: string | null = null;
      let basis: "bid" | "settlement" | "none" = "none";
      let value: string | null = null;
      let positionStatus: VenuePosition["status"] = "open";

      if (data.status === MARKET_STATUS.Finalized && (data.winning === WINNING.Yes || data.winning === WINNING.No)) {
        // Finalized: a winning token redeems for exactly 1 TYD, a losing one for nothing.
        const wins = (data.winning === WINNING.Yes) === (side === "yes");
        markPrice = wins ? "1" : "0";
        basis = "settlement";
        positionStatus = wins ? "claimable" : "lost";
        value = tydText(wins ? scaleToTyd(raw, deployment) : 0n, deployment);
      } else if (data.status === MARKET_STATUS.Finalized && data.winning === WINNING.Canceled) {
        // CANCELED pays 0.5 TYD per YES or NO token.
        markPrice = "0.5";
        basis = "settlement";
        positionStatus = "voided_refund";
        value = tydText(scaleToTyd(raw, deployment) / 2n, deployment);
      } else if (data.paused || pool.paused !== false) {
        // A paused market cannot be sold into: no mark.
        basis = "none";
      } else {
        // Mark at what selling the WHOLE holding would return now (an exact-in quote), so depth is counted.
        const [proceeds] = await reader.quotes(pool.key, "sell", outcomeIsCurrency0(pool, token), [raw], until);
        if (proceeds !== null && proceeds !== undefined && proceeds > 0n) {
          value = tydText(proceeds, deployment);
          // TYD per share = proceeds (6 dp) / shares (18 dp), floor.
          markPrice = toDec(ratioQty("price", proceeds * 10n ** BigInt(deployment.outcomeDecimals - deployment.tydDecimals), raw, 9, "floor"));
          basis = "bid";
        }
      }
      if (value === null) unmarked += 1;
      positions.push({
        id: `trueo:${deployment.chainId}:${getAddress(data.address)}:${side}:${holder.toLowerCase()}`,
        holder: { bindingId: opts.bindingId },
        market: refOf(data),
        outcome: { index: side === "yes" ? 0 : 1, role: side, tokenId: getAddress(token) },
        shape: "token_holding",
        qty: toDec(qty),
        qtyUnit: "shares",
        free: toDec(qty),
        reserved: null,
        // A swap's price is not in a Transfer log; cost basis would need the swap amounts of each transaction.
        cost: { total: null, avg: null, fees: null, source: "unknown" },
        mark: { price: markPrice, basis, asOfMs: now },
        value,
        pnl: { realized: null, unrealized: null, total: null, source: "unavailable" },
        status: positionStatus,
        collateral: collateralOf(deployment),
        prov,
      });
    }
    report = { listed: report.listed, skipped: outcome.skipped, rpcMode: rpc.mode() };
    return { positions, unmarked, claims, scanned: outcome.markets.length, skipped: outcome.skipped };
  }

  async function transferHistory(owner: string, marketId: string, range: { readonly fromBlock: bigint; readonly toBlock: bigint | "latest" }): Promise<readonly TransferEvent[]> {
    if (!isStrictAddress(owner)) throw new AdapterFailure("trueo", "NOT_FOUND", "bad_owner");
    const parsed = parseMarketId(marketId);
    if (parsed === null || parsed.chainId !== deployment.chainId) throw new AdapterFailure("trueo", "NOT_FOUND", "bad_ref");
    const until = deadline();
    // The token addresses come from the chain (Manager-validated market), never from the caller.
    const data = await readOne(parsed.address, "summary", until);
    return scanTransfers(rpc, { owner: getAddress(owner), yesToken: data.yesToken, noToken: data.noToken, ...range }, until);
  }

  return {
    id: "trueo",
    caps: CAPS,
    deployment,
    listMarkets,
    listMarketsDetailed,
    getMarket,
    getBooks,
    getFeeSpec,
    health,
    collateralRate,
    positionsByAddress,
    transferHistory,
    lastReadReport: () => report,
  };
}

// 18-decimal outcome-token units -> 6-decimal TYD units, rounded down (redeem is "decimal-adjusted").
function scaleToTyd(raw: bigint, deployment: TrueoDeployment): bigint {
  return raw / 10n ** BigInt(deployment.outcomeDecimals - deployment.tydDecimals);
}

function tydText(units: bigint, deployment: TrueoDeployment): string {
  const qty = fromBaseUnits("tyd", units, deployment.tydDecimals);
  if (qty === null) throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "amount_shape");
  return toDec(qty);
}
