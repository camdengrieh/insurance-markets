// The orderbook's READ surface (orderbooks.xo.market). Bodies are shaped like the recordings in
// sdk/venues/xo/fixtures (orderbook-*.json, live-orderbook-*.json). Basis: recorded unless a comment says
// otherwise. The write surface (orders, cancels, L1 and L2 credentials) lives in orders.ts and auth.ts; a
// route that is still not built answers 501 "TODO-for-mock-write" so a test can never pass by accident through it.
//
// Resting orders of the write mock are part of what these reads show: they appear as book levels, they
// reduce the allowance /balance-allowance reports (the docs: allowance is available cash after reservations)
// and they raise `reserved` in /positions.

import { createHash } from "node:crypto";

import { fixture } from "../fixtures/xo/load.js";
import { formatMicro, parseDecimalToMicro } from "../../src/xo/units.js";
import { orderbookMarket, type BookLevel, type BookState } from "./catalog.js";
import type { MockEnv } from "./env.js";
import { orderbookErrors } from "./errors.js";
import type { MockListener, MockReply, MockRequest } from "./listener.js";
import { isRegistered } from "./registry.js";
import { accountKey } from "./state.js";

const UINT256_LIMIT = 2n ** 256n;
const ADDRESS_QUERY = /^0x[0-9a-fA-F]{40}$/;
const CONDITION_ID = /^0x[0-9a-fA-F]{64}$/;

const ok = (json: unknown): MockReply => ({ status: 200, json });

// A token id that is present and a decimal number below 2^256; otherwise the 400 the orderbook answers.
function tokenIdOf(request: MockRequest): string | MockReply {
  const raw = request.query.get("token_id");
  if (raw === null) return orderbookErrors.missingParameter("token_id");
  if (!/^[0-9]+$/.test(raw)) return orderbookErrors.badTokenId(raw);
  if (BigInt(raw) >= UINT256_LIMIT) return orderbookErrors.tokenIdTooLarge();
  return raw;
}

function addressOf(request: MockRequest): string | MockReply {
  const raw = request.query.get("address");
  if (raw === null) return orderbookErrors.missingParameter("address");
  if (!ADDRESS_QUERY.test(raw)) return orderbookErrors.badAddress();
  return raw;
}

function ticksOf(level: BookLevel): bigint {
  return parseDecimalToMicro(level.price) ?? 0n;
}

function sortedBook(book: BookState): { bids: BookLevel[]; asks: BookLevel[] } {
  const bids = [...book.bids].sort((a, b) => (ticksOf(a) > ticksOf(b) ? -1 : ticksOf(a) < ticksOf(b) ? 1 : 0));
  const asks = [...book.asks].sort((a, b) => (ticksOf(a) < ticksOf(b) ? -1 : ticksOf(a) > ticksOf(b) ? 1 : 0));
  return { bids, asks };
}

// The displayed levels plus the resting orders of the write mock, summed per price.
function withResting(levels: readonly BookLevel[], resting: readonly BookLevel[]): BookLevel[] {
  const sums = new Map<string, bigint>();
  for (const level of [...levels, ...resting]) sums.set(level.price, (sums.get(level.price) ?? 0n) + (parseDecimalToMicro(level.size) ?? 0n));
  return [...sums.entries()].map(([price, size]) => ({ price, size: size === 0n ? "0" : formatMicro(size) }));
}

// Deterministic: the hash moves exactly when the levels, the last trade or the update id do.
function bookHash(tokenId: string, book: BookState): string {
  return createHash("sha256").update(JSON.stringify([tokenId, book.bids, book.asks, book.lastTrade, book.lastUpdateId])).digest("hex");
}

export function registerOrderbookReads(listener: MockListener, env: MockEnv): void {
  const { state, clock } = env;

  listener.route("GET", "/time", () => ok(clock.nowSeconds()));
  listener.route("GET", "/health", () => ok(fixture("orderbook-health.json")));
  listener.route("GET", "/version", () => ok(fixture("orderbook-version.json")));
  listener.route("GET", "/trading-state", () => ok({ state: state.tradingState }));

  // The tick is global (0.001); a syntactically valid token gets it, known or not (basis: docs "tick 0.001
  // globally"; the recording is for one token).
  listener.route("GET", "/tick-size", (request) => {
    const token = tokenIdOf(request);
    return typeof token === "string" ? ok({ minimum_tick_size: 0.001 }) : token;
  });

  listener.route("GET", "/neg-risk", (request) => {
    const token = tokenIdOf(request);
    if (typeof token !== "string") return token;
    return state.marketForToken(token) === undefined ? orderbookErrors.noBook() : ok({ neg_risk: false });
  });

  listener.route("GET", "/book", (request) => {
    const token = tokenIdOf(request);
    if (typeof token !== "string") return token;
    const market = state.marketForToken(token);
    const book = state.books.get(token);
    if (market === undefined || book === undefined) return orderbookErrors.noBook();
    const resting = env.engine.levels(token);
    const { bids, asks } = sortedBook({ ...book, bids: withResting(book.bids, resting.bids), asks: withResting(book.asks, resting.asks) });
    return ok({
      market: market.conditionId,
      asset_id: token,
      // Milliseconds as a string, like the recording.
      timestamp: String(clock.nowMs()),
      hash: bookHash(token, book),
      bids,
      asks,
      min_order_size: book.minOrderSize,
      tick_size: "0.001",
      neg_risk: false,
      last_trade_price: book.lastTrade === null ? "0.000" : book.lastTrade.price,
      last_update_id: book.lastUpdateId,
    });
  });

  // GET /price?side=BUY is the best BID and SELL the best ASK; an empty side answers "0.000".
  listener.route("GET", "/price", (request) => {
    const token = tokenIdOf(request);
    if (typeof token !== "string") return token;
    const side = request.query.get("side");
    if (side === null) return orderbookErrors.missingParameter("side");
    if (side !== "BUY" && side !== "SELL") return orderbookErrors.badSide();
    const book = state.books.get(token);
    if (book === undefined) return orderbookErrors.noBook();
    const resting = env.engine.levels(token);
    const { bids, asks } = sortedBook({ ...book, bids: withResting(book.bids, resting.bids), asks: withResting(book.asks, resting.asks) });
    const best = side === "BUY" ? bids[0] : asks[0];
    return ok({ price: best === undefined ? "0.000" : best.price });
  });

  // No trade yet: the recorded API answers price "0.5" with an empty side.
  listener.route("GET", "/last-trade-price", (request) => {
    const token = tokenIdOf(request);
    if (typeof token !== "string") return token;
    const book = state.books.get(token);
    if (book === undefined) return orderbookErrors.noBook();
    return ok(book.lastTrade === null ? { price: "0.5", side: "" } : { price: book.lastTrade.price, side: book.lastTrade.side });
  });

  // Live: 0 for every token, whatever the market's effectiveFeeConfig says.
  listener.route("GET", "/fee-rate", (request) => {
    const token = tokenIdOf(request);
    return typeof token === "string" ? ok({ base_fee: 0 }) : token;
  });

  listener.route("GET", "/markets/:cid", (request) => {
    const cid = request.params["cid"] ?? "";
    const market = CONDITION_ID.test(cid) ? state.marketByCondition(cid) : undefined;
    return market === undefined ? orderbookErrors.unknownMarket(cid) : ok(orderbookMarket(market));
  });

  // smart_account is the QUERIED address, lower-case without 0x, when that address is a registered
  // account; null for everything else, an owner EOA included.
  listener.route("GET", "/balance-allowance", async (request) => {
    const address = addressOf(request);
    if (typeof address !== "string") return address;
    const record = state.peekAccount(address);
    const registered = await isRegistered(env, address);
    // The allowance is what is left for new orders after the resting BUYs' reservations (docs: guides/auto-cancellation).
    const reserved = env.engine.reservedCash(accountKey(address));
    const allowance = (record?.allowanceMicro ?? 0n) - reserved;
    return ok({
      balance: String(record?.balanceMicro ?? 0n),
      allowance: String(allowance < 0n ? 0n : allowance),
      smart_account: registered ? accountKey(address) : null,
    });
  });

  // Micro-shares. The response has no cursor: it cannot be paged (docs/research/02).
  listener.route("GET", "/positions", (request) => {
    const address = addressOf(request);
    if (typeof address !== "string") return address;
    const record = state.peekAccount(address);
    return ok({
      cash_balance: String(record?.cashBalanceMicro ?? 0n),
      positions: (record?.positions ?? []).map((row) => ({
        token_id: row.tokenId,
        balance: String(row.balanceMicro),
        reserved: String(row.reservedMicro + env.engine.reservedShares(accountKey(address), row.tokenId)),
      })),
    });
  });

  listener.route("GET", "/claimable", (request) => {
    const address = addressOf(request);
    if (typeof address !== "string") return address;
    const record = state.peekAccount(address);
    return ok({
      address: `0x${accountKey(address)}`,
      claimable: (record?.claimable ?? []).map((row) => ({
        market_id: row.conditionId,
        outcome: row.outcome,
        token_id: row.tokenId,
        balance: String(row.balanceMicro),
        refund_reason: row.refundReason,
      })),
    });
  });

  // ---- the private surface -------------------------------------------------------------------------------------------

  // The order and credential routes are registered by orders.ts and auth.ts. What is left here answers 501.
  for (const [method, path] of UNBUILT_ROUTES) {
    listener.route(method, path, () => orderbookErrors.notBuilt(`${method} ${path}`));
  }

  listener.fallback(() => orderbookErrors.routeNotFound());
}

export const L2_HEADERS = ["xo_api_key", "xo_timestamp", "xo_passphrase", "xo_signature"] as const;

// Routes of the documented write surface that the mock still does not serve. They exist so that a client sees
// "not built yet" and not a plausible 404. Everything else (POST /order, the DELETE routes, GET /orders and
// /orders/:id, the four /auth routes) is in orders.ts and auth.ts.
export const UNBUILT_ROUTES: readonly (readonly [string, string])[] = [["POST", "/orders"]];
