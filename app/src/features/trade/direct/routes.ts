// The one ticket's routes: what an order from the ticket means on each venue, and the venue's executor that places it,
// lists the open orders and cancels one, all for the trading account. The ticket asks every venue the same questions;
// only the route knows the venue.
//
//   summarize   the ticket's numbers worked out exactly (the venue's own amount rules: sdk/trade/clob/amounts.ts through
//               clob-ticket.ts for Polymarket and Limitless, sdk/trade/xo/amounts.ts for XO), or what is wrong, in words;
//   place       reads what the order needs (the account the venue trades from, its balance and approvals), builds the
//               order, has the trading key sign it and sends it once. A shortfall is said before anything is signed;
//   openOrders, cancel   the account's resting orders on this market, and one cancel.
// Every failure is a value (DirectResult), never a throw.

import { CLOB_CAP_FEE_BPS } from "@sdk/trade/clob/venues";
import { computeOrderAmounts, maxBuyOutlay, minSellProceeds, ORDER_CAP_FEE_BPS } from "@sdk/trade/xo/amounts";
import { SIDE_BUY, SIDE_SELL } from "@sdk/trade/xo/constants";

import type { VenueId } from "../../../core/ports";
import { buildClobTicket, type ClobMarketFacts, type ClobTicket } from "../clob-ticket";
import type { TradingAccount } from "../../account/types";
import type { LimitlessExecutor } from "./limitless/executor";
import { depositWalletAccount } from "./polymarket/activation";
import type { PolymarketExecutor } from "./polymarket/executor";
import { fundingStop } from "./polymarket/funding";
import { ok, refuse, type DirectAccount, type DirectCancelAnswer, type DirectDeps, type DirectExecutor, type DirectFunding, type DirectOpenOrders, type DirectOrderAnswer, type DirectResult } from "./types";
import type { XoVenue } from "./xo/venue";

export const TRADE_VENUES = ["xo", "polymarket", "limitless"] as const satisfies readonly VenueId[];
export type TradeVenue = (typeof TRADE_VENUES)[number];

export function isTradeVenue(venue: string): venue is TradeVenue {
  return (TRADE_VENUES as readonly string[]).includes(venue);
}

export const VENUE_NAME: Readonly<Record<TradeVenue, string>> = Object.freeze({ xo: "XO", polymarket: "Polymarket", limitless: "Limitless" });

export interface TicketOutcome {
  readonly tokenId: string;
  // Fixed app words: "Yes", "No", "Outcome 3".
  readonly label: string;
}

export interface TicketMarket {
  readonly venue: TradeVenue;
  readonly marketId: string;
  // Polymarket and Limitless: the facts the order is built against (null when the record carries no usable tick).
  readonly facts: ClobMarketFacts | null;
  readonly outcomes: readonly TicketOutcome[];
}

export interface TicketForm {
  readonly tokenId: string;
  readonly side: "BUY" | "SELL";
  readonly price: string;
  readonly shares: string;
  readonly tif: string;
}

export interface OrderType {
  readonly tif: string;
  // Fixed app words.
  readonly label: string;
}

export interface TicketSummary {
  readonly side: "BUY" | "SELL";
  readonly outcomeWords: string;
  // Canonical forms.
  readonly shares: string;
  readonly price: string;
  readonly collateral: "pUSD" | "USDC" | "USDC.e";
  // BUY: the principal and the most that can leave with the fee ceiling. SELL: the proceeds and the least that comes back.
  readonly amountAtomic: bigint;
  readonly boundAtomic: bigint;
  readonly feeCeilingBps: number;
  readonly orderType: string;
}

export type SummaryResult = { readonly ok: true; readonly summary: TicketSummary } | { readonly ok: false; readonly issues: readonly string[] };

export interface TicketRoute {
  readonly venue: TradeVenue;
  readonly orderTypes: readonly OrderType[];
  summarize(market: TicketMarket, form: TicketForm): SummaryResult;
  place(acct: TradingAccount, market: TicketMarket, form: TicketForm): Promise<DirectResult<DirectOrderAnswer>>;
  openOrders(acct: TradingAccount, market: TicketMarket): Promise<DirectResult<DirectOpenOrders>>;
  cancel(acct: TradingAccount, market: TicketMarket, orderId: string): Promise<DirectResult<DirectCancelAnswer>>;
}

const CLOB_ORDER_TYPES: readonly OrderType[] = Object.freeze([
  { tif: "GTC", label: "Limit: rests until filled or cancelled" },
  { tif: "FAK", label: "Fill now: fills what it can, cancels the rest" },
]);

const XO_ORDER_TYPES: readonly OrderType[] = Object.freeze([{ tif: "GTD", label: "Limit: rests for five minutes, then expires" }]);

function outcomeOf(market: TicketMarket, tokenId: string): string {
  return market.outcomes.find((outcome) => outcome.tokenId === tokenId)?.label ?? "this outcome";
}

function orderTypeOf(types: readonly OrderType[], tif: string): string {
  return types.find((type) => type.tif === tif)?.label ?? tif;
}

function clobTicketOf(market: TicketMarket, form: TicketForm): { readonly ok: true; readonly ticket: ClobTicket } | { readonly ok: false; readonly issues: readonly string[] } {
  if (market.facts === null) return { ok: false, issues: ["This market's record does not carry a price step this page can build on, so no order is built."] };
  if (!CLOB_ORDER_TYPES.some((type) => type.tif === form.tif)) return { ok: false, issues: ["Choose an order type."] };
  const built = buildClobTicket({ tokenId: form.tokenId, side: form.side, price: form.price, shares: form.shares, tif: form.tif, ttlS: "", postOnly: false }, market.facts);
  return built.ok ? built : { ok: false, issues: built.issues.map((issue) => issue.message) };
}

function clobSummary(market: TicketMarket, form: TicketForm, collateral: "pUSD" | "USDC"): SummaryResult {
  const built = clobTicketOf(market, form);
  if (!built.ok) return built;
  const t = built.ticket;
  return {
    ok: true,
    summary: {
      side: t.side,
      outcomeWords: outcomeOf(market, t.tokenId),
      shares: t.shares,
      price: t.price,
      collateral,
      amountAtomic: t.principalAtomic,
      boundAtomic: t.side === "BUY" ? (t.maxOutlayAtomic ?? t.principalAtomic) : (t.minProceedsAtomic ?? t.principalAtomic),
      feeCeilingBps: CLOB_CAP_FEE_BPS,
      orderType: orderTypeOf(CLOB_ORDER_TYPES, t.tif),
    },
  };
}

// The account a CLOB venue trades from, read fresh: the Polymarket wallet, or the key itself on Limitless.
type AccountRead = (acct: TradingAccount) => Promise<DirectResult<DirectAccount>>;
type FundingRead = (account: DirectAccount, ticket: ClobTicket, facts: ClobMarketFacts) => Promise<DirectResult<DirectFunding>>;

async function placeClob<I extends { readonly ticket: ClobTicket; readonly facts: ClobMarketFacts; readonly outcome: string | null }>(
  executor: DirectExecutor<I>,
  readAccount: AccountRead,
  readFunding: FundingRead,
  acct: TradingAccount,
  market: TicketMarket,
  form: TicketForm,
  input: (ticket: ClobTicket, facts: ClobMarketFacts, outcome: string) => I,
): Promise<DirectResult<DirectOrderAnswer>> {
  const built = clobTicketOf(market, form);
  if (!built.ok) return refuse("invalid_order", built.issues[0] ?? "The ticket is not complete.");
  if (market.facts === null) return refuse("invalid_order", "This market's record does not carry a price step this page can build on.");
  const account = await readAccount(acct);
  if (!account.ok) return account;
  const funding = await readFunding(account.value, built.ticket, market.facts);
  if (!funding.ok) return funding;
  const stop = fundingStop(funding.value, built.ticket.side, built.ticket.amounts.makerAmount);
  if (stop !== null) return refuse("invalid_order", stop);
  const prepared = await executor.prepareOrder(acct.signer, account.value, input(built.ticket, market.facts, outcomeOf(market, built.ticket.tokenId)));
  if (!prepared.ok) return prepared;
  return executor.placeOrder(acct.signer, prepared.value);
}

export function polymarketRoute(deps: DirectDeps, executor: PolymarketExecutor): TicketRoute {
  const readAccount: AccountRead = async (acct) => {
    const account = await depositWalletAccount(deps, acct.address);
    if (!account.ok) return account;
    if (account.value === null) return refuse("not_logged_in", "Polymarket trading is not activated for this account yet.");
    if (executor.session(acct.signer) === null) return refuse("not_logged_in", "Polymarket trading is not activated for this account yet.");
    return ok(account.value);
  };
  return {
    venue: "polymarket",
    orderTypes: CLOB_ORDER_TYPES,
    summarize: (market, form) => clobSummary(market, form, "pUSD"),
    place: (acct, market, form) =>
      placeClob(executor, readAccount, (account, ticket, facts) => executor.funding(account, executor.bookOf(facts), ticket.tokenId), acct, market, form, (ticket, facts, outcome) => ({ ticket, facts, outcome })),
    openOrders: (acct, market) => executor.openOrders(acct.signer, { market: market.marketId }),
    cancel: (acct, _market, orderId) => executor.cancel(acct.signer, orderId),
  };
}

export function limitlessRoute(executor: LimitlessExecutor): TicketRoute {
  const readAccount: AccountRead = async (acct) => {
    if (executor.session(acct.signer) === null) return refuse("not_logged_in", "Limitless trading is not activated for this account yet.");
    const ready = await executor.ready(acct.signer);
    if (!ready.ok) return ready;
    const account = ready.value.accounts[0];
    return account === undefined ? refuse("account_refused", "This page found no Limitless account to trade from.") : ok(account);
  };
  return {
    venue: "limitless",
    orderTypes: CLOB_ORDER_TYPES,
    summarize: (market, form) => clobSummary(market, form, "USDC"),
    place: (acct, market, form) => placeClob(executor, readAccount, (account, ticket) => executor.funding(account, ticket.tokenId), acct, market, form, (ticket, facts, outcome) => ({ ticket, facts, outcome })),
    openOrders: (acct, market) => executor.openOrders(acct.signer, { market: market.marketId }),
    cancel: (acct, _market, orderId) => executor.cancel(acct.signer, orderId),
  };
}

export function xoSummary(market: TicketMarket, form: TicketForm): SummaryResult {
  if (!/^[0-9]{1,78}$/.test(form.tokenId)) return { ok: false, issues: ["Choose an outcome."] };
  let amounts: ReturnType<typeof computeOrderAmounts>;
  try {
    amounts = computeOrderAmounts({ side: form.side === "BUY" ? SIDE_BUY : SIDE_SELL, price: form.price.trim(), shares: form.shares.trim() });
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === "below_minimum") return { ok: false, issues: ["The order is below XO's minimum: at least 1 share and 0.30 USDC.e."] };
    if (code === "inexact_amount" || code === "invalid_size") return { ok: false, issues: ["At this price the share count does not give a whole number of micro-USDC.e; adjust the shares."] };
    return { ok: false, issues: ["The price is 0.001 to 0.999 in steps of 0.001, and the shares a positive decimal with at most 6 places."] };
  }
  const buy = form.side === "BUY";
  const collateral = amounts.collateralMicro;
  return {
    ok: true,
    summary: {
      side: form.side,
      outcomeWords: outcomeOf(market, form.tokenId),
      shares: form.shares.trim(),
      price: form.price.trim(),
      collateral: "USDC.e",
      amountAtomic: collateral,
      boundAtomic: buy ? maxBuyOutlay(collateral, ORDER_CAP_FEE_BPS) : minSellProceeds(collateral, ORDER_CAP_FEE_BPS),
      feeCeilingBps: Number(ORDER_CAP_FEE_BPS),
      orderType: XO_ORDER_TYPES[0]?.label ?? "Limit",
    },
  };
}

export function xoRoute(venue: XoVenue): TicketRoute {
  return {
    venue: "xo",
    orderTypes: XO_ORDER_TYPES,
    summarize: xoSummary,
    async place(acct, market, form) {
      const summary = xoSummary(market, form);
      if (!summary.ok) return refuse("invalid_order", summary.issues[0] ?? "The ticket is not complete.");
      return venue.placeOrder(acct.signer, { tokenId: form.tokenId, side: form.side, price: form.price.trim(), shares: form.shares.trim() });
    },
    async openOrders(acct, market) {
      const listed = await venue.openOrders(acct.signer, market.outcomes.map((outcome) => outcome.tokenId));
      return listed.ok ? ok({ orders: listed.value, more: false }) : listed;
    },
    cancel: (acct, _market, orderId) => venue.cancel(acct.signer, orderId),
  };
}
