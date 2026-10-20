// The order engine behind POST /order: what happens to an order that already passed the gateway's checks
// (signature, grid, nonce, expiry; see orders.ts). This is category C of the spec (5.5): "the matching engine
// beyond resting orders" is NOT emulated. What is:
//
//   - market state, size and notional floors, balance and position checks, duplicate detection (422/400)
//   - resting orders: they feed /book, /positions (reserved) and /balance-allowance (allowance after
//     reservations), and can be cancelled, swept after their expiration, or cancelled newest-first when the
//     balance drops (engine.balance_drop)
//   - a taker order is held for engine.taker_delay on the MOCK clock (the request stays open until a test
//     moves the clock), then fills against the visible book and other accounts' resting orders at the
//     resting price; no other matching: no complementary-token minting, no order priority beyond price then
//     age, no partial-fill rounding beyond ceil for BUY legs and floor for SELL legs
//   - fees: the market's takerFeeBps (at most the 800 bps on-chain bound) on the taker's collateral leg
//
// Basis: docs (guides/order-types, taker-delay, auto-cancellation, fees; docs/research/01 (c), 22 (h)) for the
// rules, switches for what the docs leave open. All of it is M: the matching logic of the real gateway is not
// public and the real fee curve is p x (1 - p) shaped, which this flat model does not reproduce.

import { MAX_FEE_RATE_BPS, OPERATING_LIMITS } from "../../src/xo/chain/constants.js";
import { formatMicro, parseDecimalToMicro } from "../../src/xo/units.js";
import { decimalFromTicks, type BookLevel, type MockMarket } from "./catalog.js";
import type { MockEnv } from "./env.js";
import { orderbookErrors } from "./errors.js";
import type { MockReply } from "./listener.js";
import type { AccountKey } from "./state.js";
import type { MockOrder, OrderFill, OrderType } from "./write-state.js";

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

export interface PlaceInput {
  readonly account: AccountKey;
  readonly market: MockMarket;
  readonly tokenId: string;
  readonly side: 0 | 1;
  readonly tick: number;
  readonly sharesMicro: bigint;
  readonly collateralMicro: bigint;
  readonly orderType: OrderType;
  readonly postOnly: boolean;
  readonly expiration: number;
  readonly hash: string;
  readonly payloadKey: string;
  readonly signature: string;
}

export type PlaceOutcome =
  | { readonly kind: "rejected"; readonly reply: MockReply }
  // The request was still held when the clock was reset (test teardown): nothing happened.
  | { readonly kind: "aborted" }
  | {
      readonly kind: "done";
      // HTTP 200 with success false: a FOK that could not fill, a FAK that matched nothing.
      readonly success: boolean;
      readonly errorMsg: string;
      readonly status: "live" | "matched" | "delayed";
      readonly order: MockOrder | null;
      readonly makingMicro: bigint;
      readonly takingMicro: bigint;
    };

export interface MinimumFloors {
  // Shares and collateral in micro units; 0 = no floor.
  readonly sizeMicro: bigint;
  readonly notionalMicro: bigint;
}

export function worstCaseOutlay(collateralMicro: bigint): bigint {
  return collateralMicro + ceilDiv(collateralMicro * BigInt(MAX_FEE_RATE_BPS), 10_000n);
}

type Liquidity =
  | { readonly kind: "book"; readonly tick: number; sizeMicro: bigint; readonly level: BookLevel }
  | { readonly kind: "order"; readonly tick: number; sizeMicro: bigint; readonly order: MockOrder };

function titleCase(text: string): string {
  return text.length === 0 ? text : `${text[0]?.toUpperCase() ?? ""}${text.slice(1).toLowerCase()}`;
}

export class Engine {
  // Balance moves the engine itself makes (fills) must not trigger the balance-drop rule.
  private quiet = 0;

  constructor(private readonly env: () => MockEnv) {}

  private get e(): MockEnv {
    return this.env();
  }

  /** Wires the engine into the state's hooks. Called once after the env is complete. */
  install(): void {
    const { state } = this.e;
    state.onBalanceChange((account, before, after) => {
      if (after < before && this.quiet === 0) this.rebalance(account);
    });
  }

  // ---- views -----------------------------------------------------------------------------------------------------

  liveOrders(account?: AccountKey): MockOrder[] {
    const out: MockOrder[] = [];
    for (const order of this.e.write.orders.values()) if (order.status === "live" && (account === undefined || order.account === account)) out.push(order);
    return out.sort((a, b) => a.id - b.id);
  }

  reservedCash(account: AccountKey): bigint {
    let total = 0n;
    for (const order of this.liveOrders(account)) {
      if (order.side === 0) total += worstCaseOutlay(ceilDiv(order.remainingMicro * BigInt(order.tick), 1000n));
    }
    return total;
  }

  reservedShares(account: AccountKey, tokenId: string): bigint {
    let total = 0n;
    for (const order of this.liveOrders(account)) if (order.side === 1 && order.tokenId === tokenId) total += order.remainingMicro;
    return total;
  }

  availableCash(account: AccountKey): bigint {
    const record = this.e.state.peekAccount(account);
    const spendable = record === undefined ? 0n : record.balanceMicro < record.allowanceMicro ? record.balanceMicro : record.allowanceMicro;
    const free = spendable - this.reservedCash(account);
    return free < 0n ? 0n : free;
  }

  availableShares(account: AccountKey, tokenId: string): bigint {
    const row = this.e.state.peekAccount(account)?.positions.find((entry) => entry.tokenId === tokenId);
    if (row === undefined) return 0n;
    const free = row.balanceMicro - row.reservedMicro - this.reservedShares(account, tokenId);
    return free < 0n ? 0n : free;
  }

  // Resting orders as book levels, aggregated by price (human-share decimal sizes like the book's).
  levels(tokenId: string): { readonly bids: BookLevel[]; readonly asks: BookLevel[] } {
    const sums = new Map<string, { side: 0 | 1; tick: number; size: bigint }>();
    for (const order of this.liveOrders()) {
      if (order.tokenId !== tokenId || this.isExpired(order)) continue;
      const key = `${String(order.side)}:${String(order.tick)}`;
      const sum = sums.get(key) ?? { side: order.side, tick: order.tick, size: 0n };
      sum.size += order.remainingMicro;
      sums.set(key, sum);
    }
    const bids: BookLevel[] = [];
    const asks: BookLevel[] = [];
    for (const sum of sums.values()) (sum.side === 0 ? bids : asks).push({ price: decimalFromTicks(sum.tick), size: formatMicro(sum.size) });
    return { bids, asks };
  }

  private isExpired(order: MockOrder): boolean {
    // The exchange accepts expiration == block.timestamp and rejects anything before it.
    return order.expiration !== 0 && order.expiration < this.e.clock.nowSeconds();
  }

  // ---- intake ------------------------------------------------------------------------------------------------------

  async place(input: PlaceInput, floors: MinimumFloors): Promise<PlaceOutcome> {
    const { state, write, clock, switches, scheduler } = this.e;

    // Market state (422). seed.on_pending = accept lets an order through on a market that is not active yet
    // (the creation seed is placed while the market is still PENDING).
    const market = input.market;
    const active = market.orderbookActive && market.status === "ACTIVE";
    const pendingLike = market.status === "PENDING" || market.status === "UPDATE_REQUIRED";
    if (!active && !(pendingLike && switches.get("seed.on_pending") === "accept")) {
      return { kind: "rejected", reply: orderbookErrors.marketNotActive(titleCase(market.status)) };
    }
    if (state.tradingState !== "active") return { kind: "rejected", reply: orderbookErrors.tradingPaused() };

    // Floors (422); shape of the texts follows the OpenAPI examples ("size below minimum: min 5000000, got 1000").
    if (input.sharesMicro < floors.sizeMicro) {
      return { kind: "rejected", reply: orderbookErrors.sizeBelowMinimum(String(floors.sizeMicro), String(input.sharesMicro)) };
    }
    if (input.collateralMicro < floors.notionalMicro) {
      return { kind: "rejected", reply: orderbookErrors.notionalBelowMinimum(String(floors.notionalMicro), String(input.collateralMicro)) };
    }

    // Duplicate: the same signed payload already resting (400). What the payload key covers is a switch.
    for (const order of this.liveOrders()) {
      if (order.payloadKey === input.payloadKey) return { kind: "rejected", reply: orderbookErrors.duplicateOrder() };
    }

    // Funds (422). A BUY needs its collateral plus the fee bound (800 bps), because the exchange pulls principal
    // plus fee; a SELL needs the shares.
    if (input.side === 0) {
      if (this.availableCash(input.account) < worstCaseOutlay(input.collateralMicro)) return { kind: "rejected", reply: orderbookErrors.insufficientBalance() };
    } else if (this.availableShares(input.account, input.tokenId) < input.sharesMicro) {
      return { kind: "rejected", reply: orderbookErrors.insufficientPosition() };
    }

    // Post-only (400 if it would cross) and FOK/FAK with postOnly.
    const crossing = this.wouldCross(input);
    if (input.postOnly) {
      if (input.orderType === "FOK" || input.orderType === "FAK") return { kind: "rejected", reply: { status: 400, json: { error: "postOnly is only valid with GTC or GTD" } } };
      if (crossing) return { kind: "rejected", reply: { status: 400, json: { error: "post-only order would cross the book" } } };
    }

    // Taker delay: FAK and FOK always, GTC and GTD when they cross. The request is held on the mock clock.
    if (input.orderType === "FOK" || input.orderType === "FAK" || crossing) {
      const delay = Number(switches.get("engine.taker_delay"));
      if (!(await clock.sleepMs(delay))) return { kind: "aborted" };
    }

    // After the hold: the book may have changed, and so may the balance.
    this.quiet += 1;
    let fills: OrderFill[];
    try {
      fills = this.fill(input);
    } finally {
      this.quiet -= 1;
    }
    const filled = fills.reduce((sum, fill) => sum + fill.sharesMicro, 0n);
    const collateralMoved = fills.reduce((sum, fill) => sum + fill.collateralMicro, 0n);
    const feeMoved = fills.reduce((sum, fill) => sum + fill.feeMicro, 0n);
    const making = input.side === 0 ? collateralMoved + feeMoved : filled;
    const taking = input.side === 0 ? filled : collateralMoved - feeMoved;

    if (input.orderType === "FOK" && filled < input.sharesMicro) {
      // fill() is all-or-nothing for FOK, so nothing moved.
      return { kind: "done", success: false, errorMsg: "order couldn't be fully filled, FOK orders are fully filled or killed", status: "delayed", order: null, makingMicro: 0n, takingMicro: 0n };
    }
    if (input.orderType === "FAK" && filled === 0n) {
      return { kind: "done", success: false, errorMsg: "no orders found to match with FAK order", status: "delayed", order: null, makingMicro: 0n, takingMicro: 0n };
    }

    const remaining = input.sharesMicro - filled;
    const resting = (input.orderType === "GTC" || input.orderType === "GTD") && remaining > 0n;
    const order: MockOrder = {
      id: write.nextOrderId,
      hash: input.hash,
      account: input.account,
      tokenId: input.tokenId,
      conditionId: market.conditionId,
      side: input.side,
      tick: input.tick,
      sharesMicro: input.sharesMicro,
      collateralMicro: input.collateralMicro,
      orderType: input.orderType,
      postOnly: input.postOnly,
      expiration: input.expiration,
      createdMs: clock.nowMs(),
      payloadKey: input.payloadKey,
      signature: input.signature,
      status: resting ? "live" : filled > 0n ? "matched" : "canceled",
      remainingMicro: resting ? remaining : 0n,
      cancelReason: null,
      fills: [...fills],
    };
    write.nextOrderId += 1;
    write.orders.set(order.hash, order);
    if (resting && input.expiration !== 0) {
      // The gateway sweeps an expired GTD order about 10 s after the deadline; the exchange enforces expiry at
      // block.timestamp regardless, which isRestingAt() models by hiding the order from matching at once.
      scheduler.at((input.expiration + OPERATING_LIMITS.gtdSweepS) * 1000, `sweep order ${String(order.id)}`, () => this.expire(order));
    }
    if (filled > 0n || resting) state.bumpUpdateId();
    return { kind: "done", success: true, errorMsg: "", status: resting ? "live" : "matched", order, makingMicro: making, takingMicro: taking };
  }

  private wouldCross(input: PlaceInput): boolean {
    const best = this.liquidity(input).find((entry) => (input.side === 0 ? entry.tick <= input.tick : entry.tick >= input.tick));
    return best !== undefined;
  }

  // Opposite-side liquidity in matching order: best price first; at the same price resting orders (oldest
  // first) before the displayed book. An account never trades against its own resting order.
  private liquidity(input: Pick<PlaceInput, "account" | "tokenId" | "side">): Liquidity[] {
    const out: Liquidity[] = [];
    const book = this.e.state.books.get(input.tokenId);
    const levels = book === undefined ? [] : input.side === 0 ? book.asks : book.bids;
    for (const level of levels) {
      const price = parseDecimalToMicro(level.price);
      const size = parseDecimalToMicro(level.size);
      if (price === null || size === null || size === 0n) continue;
      out.push({ kind: "book", tick: Number(price / 1000n), sizeMicro: size, level });
    }
    for (const order of this.liveOrders()) {
      if (order.tokenId !== input.tokenId || order.side === input.side || order.account === input.account || this.isExpired(order)) continue;
      out.push({ kind: "order", tick: order.tick, sizeMicro: order.remainingMicro, order });
    }
    const sign = input.side === 0 ? 1 : -1;
    return out.sort((a, b) => sign * (a.tick - b.tick) || (a.kind === b.kind ? 0 : a.kind === "order" ? -1 : 1) || (a.kind === "order" && b.kind === "order" ? a.order.id - b.order.id : 0));
  }

  // Walks the liquidity and moves balances. FOK is all-or-nothing: it checks the total first.
  private fill(input: PlaceInput): OrderFill[] {
    const { state, clock } = this.e;
    const eligible = this.liquidity(input).filter((entry) => (input.side === 0 ? entry.tick <= input.tick : entry.tick >= input.tick));
    if (input.orderType === "FOK") {
      const total = eligible.reduce((sum, entry) => sum + entry.sizeMicro, 0n);
      if (total < input.sharesMicro) return [];
    }
    const feeBps = BigInt(Math.min(input.market.takerFeeBps, MAX_FEE_RATE_BPS));
    const fills: OrderFill[] = [];
    let remaining = input.sharesMicro;
    for (const entry of eligible) {
      if (remaining === 0n) break;
      const shares = remaining < entry.sizeMicro ? remaining : entry.sizeMicro;
      const notional = input.side === 0 ? ceilDiv(shares * BigInt(entry.tick), 1000n) : (shares * BigInt(entry.tick)) / 1000n;
      const fee = ceilDiv(notional * feeBps, 10_000n);
      // The taker must be able to pay; a balance that dropped during the hold ends the fill.
      try {
        if (input.side === 0) {
          state.creditCollateral(input.account, -(notional + fee));
          state.creditShares(input.account, input.tokenId, shares);
        } else {
          state.creditShares(input.account, input.tokenId, -shares);
          state.creditCollateral(input.account, notional - fee);
        }
      } catch (error) {
        if (error instanceof RangeError) break;
        throw error;
      }
      if (entry.kind === "order") {
        const maker = entry.order;
        if (maker.side === 0) {
          state.creditCollateral(maker.account, -notional);
          state.creditShares(maker.account, maker.tokenId, shares);
        } else {
          state.creditShares(maker.account, maker.tokenId, -shares);
          state.creditCollateral(maker.account, notional);
        }
        maker.remainingMicro -= shares;
        maker.fills.push({ atMs: clock.nowMs(), sharesMicro: shares, priceTick: entry.tick, collateralMicro: notional, feeMicro: 0n, role: "maker" });
        if (maker.remainingMicro === 0n) maker.status = "matched";
      } else {
        const book = state.books.get(input.tokenId);
        if (book !== undefined) {
          const next = (levels: BookLevel[]): BookLevel[] =>
            levels.flatMap((level) => (level !== entry.level ? [level] : entry.sizeMicro - shares > 0n ? [{ price: level.price, size: formatMicro(entry.sizeMicro - shares) }] : []));
          state.setBook(input.tokenId, input.side === 0 ? { asks: next(book.asks) } : { bids: next(book.bids) });
        }
      }
      entry.sizeMicro -= shares;
      remaining -= shares;
      fills.push({ atMs: clock.nowMs(), sharesMicro: shares, priceTick: entry.tick, collateralMicro: notional, feeMicro: fee, role: "taker" });
    }
    const last = fills[fills.length - 1];
    if (last !== undefined) state.setBook(input.tokenId, { lastTrade: { price: decimalFromTicks(last.priceTick), side: input.side === 0 ? "BUY" : "SELL" } });
    return fills;
  }

  // ---- cancel, expiry, balance drop --------------------------------------------------------------------------------------

  cancel(order: MockOrder, reason: string): void {
    if (order.status !== "live") return;
    order.status = "canceled";
    order.cancelReason = reason;
    order.remainingMicro = 0n;
    this.e.state.bumpUpdateId();
  }

  private expire(order: MockOrder): void {
    if (order.status !== "live") return;
    order.status = "expired";
    order.cancelReason = "expired";
    order.remainingMicro = 0n;
    this.e.state.bumpUpdateId();
  }

  // engine.balance_drop = lifo-on: when an account's balance falls below what its resting BUYs reserve, the
  // newest orders are cancelled first until the rest fit (docs/guides/auto-cancellation). lifo-off leaves them.
  private rebalance(account: AccountKey): void {
    if (this.e.switches.get("engine.balance_drop") !== "lifo-on") return;
    const record = this.e.state.peekAccount(account);
    const balance = record?.balanceMicro ?? 0n;
    const buys = this.liveOrders(account).filter((order) => order.side === 0).sort((a, b) => b.id - a.id);
    for (const order of buys) {
      if (this.reservedCash(account) <= balance) break;
      this.cancel(order, "balance_drop");
    }
  }

  /** Cancels every live order of a market (a terminal market state cancels everything atomically). */
  cancelMarket(conditionId: string, reason: string): number {
    let count = 0;
    for (const order of this.liveOrders()) {
      if (order.conditionId === conditionId) {
        this.cancel(order, reason);
        count += 1;
      }
    }
    return count;
  }
}
