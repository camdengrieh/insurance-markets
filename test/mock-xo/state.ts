// The mock's data: the market catalogue, order books, per-account balances, positions and claimables, the
// registry, and the Data API portfolios. Everything is plain data with setters, so the write mock (a later
// stream) mutates the same state the read mock serves.
//
// Account keys are lower-case 40-hex strings WITHOUT 0x, the form /balance-allowance returns in
// `smart_account`.

import {
  buildMarket,
  defaultBook,
  hasBook,
  type BookState,
  type MarketSpec,
  type MockMarket,
} from "./catalog.js";
import type { MockClock } from "./clock.js";

export type AccountKey = string;

export function accountKey(address: string): AccountKey {
  const match = /^(?:0x)?([0-9a-fA-F]{40})$/.exec(address);
  if (match === null) throw new RangeError("not a 40-digit hex address");
  return (match[1] as string).toLowerCase();
}

export interface PositionRow {
  readonly tokenId: string;
  readonly balanceMicro: bigint;
  readonly reservedMicro: bigint;
}

export type RefundReason = "resolved_winner" | "voided_refund";

export interface ClaimableRow {
  readonly conditionId: string;
  readonly outcome: "Yes" | "No";
  readonly tokenId: string;
  readonly balanceMicro: bigint;
  readonly refundReason: RefundReason;
}

export interface AccountRecord {
  balanceMicro: bigint;
  allowanceMicro: bigint;
  cashBalanceMicro: bigint;
  positions: PositionRow[];
  claimable: ClaimableRow[];
}

function emptyAccount(): AccountRecord {
  return { balanceMicro: 0n, allowanceMicro: 0n, cashBalanceMicro: 0n, positions: [], claimable: [] };
}

export class MockState {
  readonly markets: MockMarket[] = [];
  readonly books = new Map<string, BookState>();
  private readonly accounts = new Map<AccountKey, AccountRecord>();
  private readonly portfolios = new Map<AccountKey, unknown[]>();
  // Accounts the registry reports regardless of the registry.trigger switch.
  readonly forcedRegistered = new Set<AccountKey>();
  // Accounts for which an L1 credential create happened (the write mock records them; registry.trigger
  // "on-l1-create" reads this set).
  readonly l1Created = new Set<AccountKey>();
  // Accounts XO itself provisioned (its app created them). The bundler's bundler.foreign_account switch treats
  // every other sender as a foreign account.
  readonly provisioned = new Set<AccountKey>();
  // Called after reset() and after a balance changes: the write mock keeps its own state (orders, keys,
  // messages) and resets with this one.
  private readonly resetHooks: (() => void)[] = [];
  private readonly balanceHooks: ((account: AccountKey, before: bigint, after: bigint) => void)[] = [];
  // "active" or "paused", what GET /trading-state answers.
  tradingState: string = "active";
  private nextMarketId = 50_000;
  private nextUpdateId = 1_000_000;

  constructor(private readonly clock: MockClock) {}

  // Back to the state a new mock starts in: no accounts, portfolios or registry entries, trading active, and
  // the default catalogue again (same ids, because they follow from the seeds). Tests call this between cases.
  reset(seedMarkets = true): void {
    this.markets.length = 0;
    this.books.clear();
    this.accounts.clear();
    this.portfolios.clear();
    this.forcedRegistered.clear();
    this.l1Created.clear();
    this.provisioned.clear();
    this.tradingState = "active";
    this.nextMarketId = 50_000;
    this.nextUpdateId = 1_000_000;
    if (seedMarkets) this.seedDefaultMarkets();
    for (const hook of this.resetHooks) hook();
  }

  onReset(hook: () => void): void {
    this.resetHooks.push(hook);
  }

  // A balance (collateral) moved: the engine uses this for engine.balance_drop.
  onBalanceChange(hook: (account: AccountKey, before: bigint, after: bigint) => void): void {
    this.balanceHooks.push(hook);
  }

  provisionAccount(address: string): void {
    this.provisioned.add(accountKey(address));
  }

  // ---- markets and books -------------------------------------------------------------------------------------------------

  addMarket(spec: MarketSpec): MockMarket {
    if (this.markets.some((market) => market.seed === spec.seed)) throw new Error(`market seed ${spec.seed} is already in the catalogue`);
    this.nextMarketId += 1;
    const market = buildMarket(spec, this.nextMarketId, this.clock.nowMs());
    this.markets.push(market);
    if (hasBook(market)) {
      this.books.set(market.yesTokenId, defaultBook(market.midTicks, this.bumpUpdateId()));
      this.books.set(market.noTokenId, defaultBook(1000 - market.midTicks, this.bumpUpdateId()));
    }
    return market;
  }

  marketByCondition(conditionId: string): MockMarket | undefined {
    const wanted = conditionId.toLowerCase();
    return this.markets.find((market) => market.conditionId === wanted);
  }

  marketBySlug(slug: string): MockMarket | undefined {
    return this.markets.find((market) => market.slug === slug);
  }

  marketById(id: number): MockMarket | undefined {
    return this.markets.find((market) => market.id === id);
  }

  marketForToken(tokenId: string): MockMarket | undefined {
    return this.markets.find((market) => market.yesTokenId === tokenId || market.noTokenId === tokenId);
  }

  // Changes a market's status. Closing a market removes its books (the orderbook has none after that).
  setStatus(conditionId: string, status: MockMarket["status"]): MockMarket {
    const market = this.marketByCondition(conditionId);
    if (market === undefined) throw new Error("unknown market");
    market.status = status;
    market.orderbookActive = status === "ACTIVE";
    if (!hasBook(market)) {
      this.books.delete(market.yesTokenId);
      this.books.delete(market.noTokenId);
    }
    return market;
  }

  bumpUpdateId(): number {
    this.nextUpdateId += 1;
    return this.nextUpdateId;
  }

  // Replaces a token's levels (and optionally its last trade). The update id moves, so the book's hash does.
  setBook(tokenId: string, change: Partial<Pick<BookState, "bids" | "asks" | "lastTrade" | "minOrderSize">>): BookState {
    const book = this.books.get(tokenId);
    if (book === undefined) throw new Error("no book for that token");
    if (change.bids !== undefined) book.bids = [...change.bids];
    if (change.asks !== undefined) book.asks = [...change.asks];
    if (change.lastTrade !== undefined) book.lastTrade = change.lastTrade;
    if (change.minOrderSize !== undefined) book.minOrderSize = change.minOrderSize;
    book.lastUpdateId = this.bumpUpdateId();
    return book;
  }

  // ---- accounts ------------------------------------------------------------------------------------------------------------------------

  account(address: string): AccountRecord {
    const key = accountKey(address);
    let record = this.accounts.get(key);
    if (record === undefined) {
      record = emptyAccount();
      this.accounts.set(key, record);
    }
    return record;
  }

  // Read without creating a record.
  peekAccount(address: string): AccountRecord | undefined {
    return this.accounts.get(accountKey(address));
  }

  setBalance(address: string, change: { balanceMicro?: bigint; allowanceMicro?: bigint; cashBalanceMicro?: bigint }): void {
    const record = this.account(address);
    const before = record.balanceMicro;
    if (change.balanceMicro !== undefined) record.balanceMicro = change.balanceMicro;
    if (change.allowanceMicro !== undefined) record.allowanceMicro = change.allowanceMicro;
    if (change.cashBalanceMicro !== undefined) record.cashBalanceMicro = change.cashBalanceMicro;
    if (record.balanceMicro !== before) for (const hook of this.balanceHooks) hook(accountKey(address), before, record.balanceMicro);
  }

  // The orderbook credited (or debited) collateral: balance, allowance and cash move together.
  creditCollateral(address: string, deltaMicro: bigint): void {
    const record = this.account(address);
    const next = record.balanceMicro + deltaMicro;
    if (next < 0n) throw new RangeError("a collateral balance cannot go below zero");
    this.setBalance(address, {
      balanceMicro: next,
      allowanceMicro: record.allowanceMicro + deltaMicro < 0n ? 0n : record.allowanceMicro + deltaMicro,
      cashBalanceMicro: record.cashBalanceMicro + deltaMicro < 0n ? 0n : record.cashBalanceMicro + deltaMicro,
    });
  }

  // Adds (or removes) outcome shares of one token. Creates the row when the account had none.
  creditShares(address: string, tokenId: string, deltaMicro: bigint): void {
    const record = this.account(address);
    const row = record.positions.find((entry) => entry.tokenId === tokenId);
    const balance = (row?.balanceMicro ?? 0n) + deltaMicro;
    if (balance < 0n) throw new RangeError("a share balance cannot go below zero");
    const next: PositionRow = { tokenId, balanceMicro: balance, reservedMicro: row?.reservedMicro ?? 0n };
    record.positions = row === undefined ? [...record.positions, next] : record.positions.map((entry) => (entry.tokenId === tokenId ? next : entry));
  }

  setPositions(address: string, positions: readonly PositionRow[]): void {
    for (const row of positions) {
      if (row.reservedMicro > row.balanceMicro) throw new RangeError("reserved exceeds balance");
    }
    this.account(address).positions = [...positions];
  }

  setClaimable(address: string, rows: readonly ClaimableRow[]): void {
    this.account(address).claimable = [...rows];
  }

  // ---- registry ------------------------------------------------------------------------------------------------------------------------

  forceRegistered(address: string): void {
    this.forcedRegistered.add(accountKey(address));
  }

  markL1Created(address: string): void {
    this.l1Created.add(accountKey(address));
  }

  // ---- Data API portfolios -------------------------------------------------------------------------------------------------

  setPortfolio(address: string, rows: readonly unknown[]): void {
    this.portfolios.set(accountKey(address), [...rows]);
  }

  portfolio(address: string): unknown[] | undefined {
    return this.portfolios.get(accountKey(address));
  }

  // One portfolio row for the mock's simulated traders, with the market identifiers filled in. The mock invents its
  // balances and positions (it is a simulator, not a recording), so the row is built here rather than copied from a
  // committed fixture: no populated Data API portfolio answer was ever captured.
  portfolioRowFor(market: MockMarket): Record<string, unknown> {
    const row: Record<string, unknown> = {
      id: market.id,
      contractMarketId: market.conditionId,
      slug: market.slug,
      title: market.title,
      status: market.status,
      winningOutcomeId: null,
      totalStake: 0,
      totalPnL: 0,
      transactionCounts: 0,
      positions: [] as unknown[],
    };
    return row;
  }

  // ---- the default catalogue ------------------------------------------------------------------------------------------------

  // A small, fixed world: enough rows for every list filter and every lifecycle state a client meets.
  seedDefaultMarkets(): void {
    this.addMarket({ seed: "clob-active-a", title: "Mock market A (CLOB, active)", kind: "clob", status: "ACTIVE", midTicks: 500 });
    this.addMarket({ seed: "clob-active-b", title: "Mock market B (CLOB, active, 4% taker fee)", kind: "clob", status: "ACTIVE", midTicks: 300, takerFeeBps: 400 });
    this.addMarket({ seed: "conviction-active", title: "Mock market C (Conviction, active)", kind: "conviction", status: "ACTIVE", midTicks: 500 });
    this.addMarket({ seed: "conviction-paused", title: "Mock market D (Conviction, paused)", kind: "conviction", status: "PAUSED", orderbookActive: false });
    this.addMarket({ seed: "clob-closed", title: "Mock market E (CLOB, closed, Yes won)", kind: "clob", status: "CLOSED", winner: 0 });
    this.addMarket({ seed: "conviction-voided", title: "Mock market F (Conviction, voided)", kind: "conviction", status: "VOIDED" });
    this.addMarket({ seed: "conviction-resolved", title: "Mock market G (Conviction, resolved, No won)", kind: "conviction", status: "RESOLVED", winner: 1 });
    this.addMarket({ seed: "clob-update-required", title: "Mock market H (CLOB, update required)", kind: "clob", status: "UPDATE_REQUIRED" });
    this.addMarket({ seed: "clob-voided-closed", title: "Mock market I (CLOB, voided and closed)", kind: "clob", status: "VOIDED_CLOSED" });
  }
}
