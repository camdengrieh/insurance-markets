// The Limitless executor: the server-side flow (relay/clob.ts), moved into the visitor's browser and signed by the
// visitor's own wallet and the visitor's own Limitless API token. Limitless sends no CORS headers for this page, so
// every call to it goes through our markets API's relay (api/limitless-relay.ts), which forwards what this tab signed
// and adds nothing.
//
//   ready         the wallet must cover Base (8453) and be an EOA there (an order is EOA-signed: signatureType 0, maker
//                 = signer = the wallet); read with eth_getCode on Base;
//   connect       the visitor pastes the token id and secret they created in Limitless's own app (scope `trading`);
//                 this page signs GET /profiles/me with it and keeps it for this tab only when Limitless answers with a
//                 profile for this very wallet in EOA trading mode (token.ts, venue.ts). `login` itself has nothing to
//                 sign: Limitless issues tokens only in its own UI;
//   prepareOrder  reads the market record (its exchange, tokens and fee flags) and the profile (ownerId, fee rate)
//                 through the relay, and the book from our markets API for the card; builds the order with the SDK and
//                 its card; signs nothing;
//   placeOrder    asks the wallet to sign exactly the typed data on the card, checks the signature recovers to the wallet
//                 over the card's digest, and POSTs /orders once through the relay. A prepared order is sent at most once
//                 and only within PREPARED_TTL_MS of being built;
//   openOrders, cancel   GET /markets/{slug}/user-orders and DELETE /orders/{id} with the same token.
// Balances and approvals (funding.ts) are read on Base for the wallet; an approval transaction is offered only when the
// wallet can send transactions.

import { CLOB_CHAIN_IDS } from "@sdk/trade/clob/venues";
import type { Hex } from "viem";

import { MARKETS_API_ORIGIN } from "../../../../core/markets-api";
import { booksOfApiAnswer } from "../../../../core/markets-api-limitless";
import type { WalletSigner } from "../../../../core/signer";
import type { ClobMarketFacts, ClobTicket } from "../../clob-ticket";
import { isVenueHttpError } from "../http";
import type { ApprovalAmount } from "../polymarket/funding";
import { saltFrom } from "../polymarket/order";
import { venueText } from "../text";
import { ok, refuse, type DirectAccount, type DirectApproval, type DirectDeps, type DirectExecutor, type DirectFunding, type DirectPreparedOrder, type DirectResult, type DirectSession, type DirectTransaction } from "../types";
import { checkedSignature, walletCovers, walletRefusal } from "../wallet";
import { limitlessOrderCard, type LimitlessCardInput } from "./card";
import { buildLimitlessApproval, limitlessApprovalBlocker, readLimitlessFunding } from "./funding";
import type { LimitlessToken } from "./hmac";
import { limitlessOrderBody, planLimitlessOrder, type LimitlessOrderPlan } from "./order";
import { createLimitlessRelayClient, OPEN_ORDERS_LIMIT, type LimitlessAnswer, type LimitlessRelayClient } from "./relay";
import { LIMITLESS_VENUE, limitlessKeyTag, parseLimitlessToken, serializeLimitlessToken, tokenFromInput } from "./token";
import { LIMITLESS_ORDER_ID, LIMITLESS_SLUG, limitlessMessage, readLimitlessMarket, readLimitlessOrders, readLimitlessProfile, type LimitlessProfile } from "./venue";

export const BASE = CLOB_CHAIN_IDS.limitless;
// A prepared order older than this is not sent: the market, the profile and the book were read then.
export const PREPARED_TTL_MS = 120_000;
export const NOT_AVAILABLE = "Limitless trading is not available in this build: it names no markets API to relay through.";
const BOOK_UNREAD = "The book was not read: our markets API did not answer for it.";

// An EIP-7702 delegated account (0xef0100 + the delegate) still signs with its own key: an EOA for this purpose.
const DELEGATED_CODE = /^0xef0100[0-9a-fA-F]{40}$/;

export interface LimitlessOrderInput {
  readonly ticket: ClobTicket;
  readonly facts: ClobMarketFacts;
  // Fixed app words for the outcome ("Yes", "No"), or null.
  readonly outcome: string | null;
}

export interface LimitlessExecutor extends DirectExecutor<LimitlessOrderInput> {
  // Whether this build names a markets API to relay through; without one nothing is ever requested.
  readonly available: boolean;
  // Checks a pasted token with Limitless (GET /profiles/me through the relay) and keeps it for this tab when it is this
  // wallet's. The pasted values are never returned, shown or logged.
  connect(signer: WalletSigner, tokenId: string, secret: string): Promise<DirectResult<DirectSession>>;
  funding(account: DirectAccount, tokenId: string | null): Promise<DirectResult<DirectFunding>>;
  // Why the page cannot send an approval from this wallet, in words; null when it can.
  approvalBlocker(signer: WalletSigner): string | null;
  approval(account: DirectAccount, approval: DirectApproval, amount: ApprovalAmount): DirectTransaction;
  sendApproval(signer: WalletSigner, account: DirectAccount, transaction: DirectTransaction): Promise<DirectResult<Hex>>;
}

interface Held {
  readonly plan: LimitlessOrderPlan;
  readonly preparedAtMs: number;
}

// What a failed exchange with the relay means, in fixed words: the relay refused (nothing reached Limitless), or
// Limitless said no in its own words.
function answerRefusal<T>(answer: LimitlessAnswer, what: string): DirectResult<T> {
  if (answer.from === "relay") {
    if (answer.status === 504 || answer.status === 502) return refuse("venue_unreachable", `Our markets API's relay could not get an answer from Limitless (HTTP ${answer.status}) for ${what}.`, limitlessMessage(answer.json, ""));
    return refuse("venue_refused", `Our markets API's relay refused ${what} (HTTP ${answer.status}). Nothing reached Limitless.`, limitlessMessage(answer.json, ""));
  }
  if (answer.status === 401 || answer.status === 403) return refuse("not_logged_in", `Limitless refused this token for ${what} (HTTP ${answer.status}). Check it has the trading scope and that this computer's clock is right, or paste a new one.`, limitlessMessage(answer.json, answer.text));
  return refuse("venue_refused", `Limitless did not accept ${what} (HTTP ${answer.status}).`, limitlessMessage(answer.json, answer.text));
}

function transportRefusal<T>(error: unknown, what: string): DirectResult<T> {
  if (isVenueHttpError(error) && error.code === "timeout") return refuse("venue_unreachable", `Our markets API did not answer in time for ${what}.`);
  return refuse("venue_unreachable", `Our markets API could not be reached for ${what}.`);
}

export function createLimitlessExecutor(deps: DirectDeps, relayOrigin: string | null = MARKETS_API_ORIGIN): LimitlessExecutor {
  const relay: LimitlessRelayClient | null = relayOrigin === null ? null : createLimitlessRelayClient(deps.http, relayOrigin, deps.nowMs);
  // Prepared orders this page built and has not sent: the handle the UI holds is only a key into this map.
  const held = new WeakMap<DirectPreparedOrder, Held>();

  function tokenOf(signer: WalletSigner): LimitlessToken | null {
    return parseLimitlessToken(deps.store.get(LIMITLESS_VENUE, signer.address));
  }

  function needsBase<T>(signer: WalletSigner): DirectResult<T> | null {
    return walletCovers(signer, BASE) ? null : refuse("wallet_wrong_chain", "Your wallet's session does not include Base (chain 8453), where Limitless settles. Connect a session that does.");
  }

  async function profileOf(client: LimitlessRelayClient, signer: WalletSigner, token: LimitlessToken): Promise<DirectResult<LimitlessProfile>> {
    let answer: LimitlessAnswer;
    try {
      answer = await client.profile(token);
    } catch (error) {
      return transportRefusal(error, "your token's profile");
    }
    if (answer.from !== "limitless" || answer.status !== 200) return answerRefusal(answer, "your token's profile");
    return readLimitlessProfile(answer.json, signer.address);
  }

  // The book our markets API last read for the outcome, for the card: never blocks the order, and never shown as live.
  async function bookFor(slug: string, tokenId: string): Promise<LimitlessCardInput["book"]> {
    if (relayOrigin === null) return { unread: BOOK_UNREAD };
    try {
      const answer = await deps.http({ method: "GET", url: `${new URL(relayOrigin).origin}/v1/markets/limitless/${slug}` });
      const books = answer.status === 200 ? booksOfApiAnswer(JSON.parse(answer.text) as unknown) : null;
      const found = books?.find((entry) => entry.tokenId === tokenId);
      if (found === undefined) return { unread: BOOK_UNREAD };
      if (found.book === null) return { unread: `The book was not read: ${found.reason ?? "our markets API holds none"}` };
      const best = (levels: readonly { readonly price: string }[], pick: "max" | "min"): string | null =>
        levels.length === 0 ? null : levels.map((level) => level.price).reduce((a, b) => ((pick === "max" ? Number(b) > Number(a) : Number(b) < Number(a)) ? b : a));
      const ageS = Math.max(0, Math.round((deps.nowMs() - found.book.asOfMs) / 1000));
      return { bestBid: best(found.book.bids, "max"), bestAsk: best(found.book.asks, "min"), asOf: `${ageS} s before this card was built${found.book.derived === "complement" ? ", the complement of the Yes book" : ""}` };
    } catch {
      return { unread: BOOK_UNREAD };
    }
  }

  const executor: LimitlessExecutor = {
    venue: LIMITLESS_VENUE,
    chainId: BASE,
    available: relay !== null,

    async ready(signer) {
      if (relay === null) return refuse("venue_unreachable", NOT_AVAILABLE);
      const wrong = needsBase<never>(signer);
      if (wrong !== null) return wrong;
      const chain = deps.chain(BASE);
      if (chain === null) return refuse("chain_unreadable", "This build names no Base RPC, so your wallet cannot be read there.");
      let code: Hex;
      try {
        code = await chain.port.getCode(signer.address);
      } catch {
        return refuse("chain_unreadable", "This page could not read your wallet on Base. Read again in a moment.");
      }
      if (code !== "0x" && !DELEGATED_CODE.test(code)) {
        return refuse("account_refused", "The connected address is a contract on Base. Limitless takes orders an ordinary wallet (an EOA) signs with its own key, so this page builds none for it.");
      }
      const account: DirectAccount = { venue: LIMITLESS_VENUE, chainId: BASE, signer: signer.address, maker: signer.address, label: "your wallet itself", signatureType: 0, makerIsSigner: true };
      return ok({ accounts: [account], notes: ["Limitless takes orders your own wallet signs (an EOA order, signature type 0) from a profile in EOA trading mode; your token is checked for both before anything is signed."] });
    },

    session(signer) {
      const token = tokenOf(signer);
      return token === null ? null : { venue: LIMITLESS_VENUE, address: signer.address, keyTag: limitlessKeyTag(token.tokenId) };
    },

    async login() {
      return refuse("not_logged_in", "Limitless issues API tokens in its own app only: paste one created there with the trading scope.");
    },

    async connect(signer, tokenId, secret) {
      if (relay === null) return refuse("venue_unreachable", NOT_AVAILABLE);
      const token = tokenFromInput(tokenId, secret);
      if (token === null) return refuse("not_logged_in", "That is not a Limitless API token: the id is printable text without spaces and the secret is base64 text, both as Limitless showed them.");
      const profile = await profileOf(relay, signer, token);
      if (!profile.ok) return profile;
      deps.store.set(LIMITLESS_VENUE, signer.address, serializeLimitlessToken(token));
      return ok({ venue: LIMITLESS_VENUE, address: signer.address, keyTag: limitlessKeyTag(token.tokenId) });
    },

    logout(signer) {
      deps.store.remove(LIMITLESS_VENUE, signer.address);
    },

    async prepareOrder(signer, account, input) {
      if (relay === null) return refuse("venue_unreachable", NOT_AVAILABLE);
      const wrong = needsBase<never>(signer);
      if (wrong !== null) return wrong;
      if (account.venue !== LIMITLESS_VENUE || account.signer.toLowerCase() !== signer.address.toLowerCase()) return refuse("account_refused", "The account was read for another wallet. Read your account again.");
      const token = tokenOf(signer);
      if (token === null) return refuse("not_logged_in", "Paste your Limitless API token in this tab first.");
      const slug = input.ticket.marketId;
      if (!LIMITLESS_SLUG.test(slug) || input.facts.marketId !== slug) return refuse("invalid_order", "This ticket does not name a Limitless market.");
      let marketAnswer: LimitlessAnswer;
      let profile: DirectResult<LimitlessProfile>;
      let book: LimitlessCardInput["book"];
      try {
        [marketAnswer, profile, book] = await Promise.all([relay.market(slug), profileOf(relay, signer, token), bookFor(slug, input.ticket.tokenId)]);
      } catch (error) {
        return transportRefusal(error, "the market's record");
      }
      if (marketAnswer.from !== "limitless" || marketAnswer.status !== 200) return answerRefusal(marketAnswer, "the market's record");
      const market = readLimitlessMarket(marketAnswer.json, slug, input.ticket.tokenId);
      if (!market.ok) return market;
      if (!profile.ok) return profile;
      const plan = planLimitlessOrder({ ticket: input.ticket, account, market: market.value, profile: profile.value, salt: saltFrom(deps.randomBytes) });
      if (!plan.ok) return plan;
      const card = limitlessOrderCard({
        plan: plan.value,
        account,
        shares: input.ticket.shares,
        principalAtomic: input.ticket.principalAtomic,
        maxOutlayAtomic: input.ticket.maxOutlayAtomic,
        minProceedsAtomic: input.ticket.minProceedsAtomic,
        outcome: input.outcome,
        book,
      });
      const prepared: DirectPreparedOrder = { venue: LIMITLESS_VENUE, account, card, typedData: plan.value.typedData, orderId: plan.value.digest };
      held.set(prepared, { plan: plan.value, preparedAtMs: deps.nowMs() });
      return ok(prepared);
    },

    async placeOrder(signer, prepared) {
      const entry = held.get(prepared);
      if (entry === undefined || relay === null) return refuse("invalid_order", "This order was already sent or was never prepared here. Review it again.");
      if (prepared.account.signer.toLowerCase() !== signer.address.toLowerCase()) return refuse("account_refused", "The connected wallet changed since this order was prepared. Review it again.");
      if (deps.nowMs() - entry.preparedAtMs > PREPARED_TTL_MS) {
        held.delete(prepared);
        return refuse("invalid_order", "This order was prepared more than two minutes ago. Review it again so the market, your profile and the book are fresh.");
      }
      const token = tokenOf(signer);
      if (token === null) return refuse("not_logged_in", "Paste your Limitless API token in this tab first.");
      let raw: Hex;
      try {
        raw = await signer.signTypedData(prepared.typedData);
      } catch (error) {
        return walletRefusal(error, "the order");
      }
      const signature = await checkedSignature(signer, entry.plan.digest, raw);
      if (!signature.ok) return signature;
      // From here on the order may reach the venue: the handle is spent whatever the answer.
      held.delete(prepared);
      const body = limitlessOrderBody(entry.plan, signature.value);
      let answer: LimitlessAnswer;
      try {
        answer = await relay.postOrder(token, body);
      } catch {
        return refuse("venue_ambiguous", "The order was sent but no answer came back from our markets API. It may or may not be on Limitless's book: list your open orders before signing another.");
      }
      if (answer.from === "relay" && answer.status >= 500) {
        return refuse("venue_ambiguous", `Our markets API's relay got no usable answer from Limitless (HTTP ${answer.status}). The order may or may not have been placed: list your open orders before signing another.`, limitlessMessage(answer.json, ""));
      }
      if (answer.from === "limitless" && answer.status >= 500) return refuse("venue_ambiguous", `Limitless answered with an error of its own (HTTP ${answer.status}). The order may or may not have been placed: list your open orders before signing another.`, limitlessMessage(answer.json, answer.text));
      if (answer.from !== "limitless" || answer.status < 200 || answer.status >= 300) return answerRefusal(answer, "the order");
      // OrderResponseDto: { order: CreatedOrderDto, makerMatches?, execution }. The order's id names it for a cancel.
      const accepted = typeof answer.json === "object" && answer.json !== null ? (answer.json as Record<string, unknown>)["order"] : undefined;
      const created = typeof accepted === "object" && accepted !== null ? (accepted as Record<string, unknown>) : null;
      const id = created?.["id"];
      if (typeof id !== "string" || !LIMITLESS_ORDER_ID.test(id)) {
        return refuse("venue_ambiguous", "Limitless answered that it took the request, but this page could not read the order's id from the answer. List your open orders to see it.", venueText(answer.text));
      }
      const status = typeof created?.["status"] === "string" ? created["status"].toLowerCase().replace(/[^a-z_]/g, "").slice(0, 24) : "";
      return ok({ orderId: id, status: status === "" ? "unknown" : status, venueText: null });
    },

    async openOrders(signer, filter) {
      if (relay === null) return refuse("venue_unreachable", NOT_AVAILABLE);
      const token = tokenOf(signer);
      if (token === null) return refuse("not_logged_in", "Paste your Limitless API token in this tab to list your orders.");
      if (filter.market === null || !LIMITLESS_SLUG.test(filter.market)) return refuse("invalid_order", "Limitless lists your orders one market at a time.");
      let answer: LimitlessAnswer;
      try {
        answer = await relay.userOrders(token, filter.market);
      } catch (error) {
        return transportRefusal(error, "your open orders");
      }
      if (answer.from !== "limitless" || answer.status !== 200) return answerRefusal(answer, "your open orders");
      return readLimitlessOrders(answer.json, OPEN_ORDERS_LIMIT);
    },

    async cancel(signer, orderId) {
      if (relay === null) return refuse("venue_unreachable", NOT_AVAILABLE);
      const token = tokenOf(signer);
      if (token === null) return refuse("not_logged_in", "Paste your Limitless API token in this tab to cancel an order.");
      if (!LIMITLESS_ORDER_ID.test(orderId)) return refuse("invalid_order", "That is not a Limitless order id.");
      let answer: LimitlessAnswer;
      try {
        answer = await relay.cancelOrder(token, orderId);
      } catch {
        return refuse("venue_ambiguous", "The cancel was sent but no answer came back from our markets API. List your open orders to see whether it took effect.");
      }
      if (answer.from === "limitless" && answer.status >= 200 && answer.status < 300) return ok({ canceled: [orderId], notCanceled: [] });
      if (answer.from === "limitless" && answer.status >= 400 && answer.status < 500 && answer.status !== 401 && answer.status !== 403) {
        return ok({ canceled: [], notCanceled: [{ id: orderId, reason: limitlessMessage(answer.json, answer.text) ?? `HTTP ${answer.status}` }] });
      }
      if (answer.status >= 500) return refuse("venue_ambiguous", `No usable answer came back for the cancel (HTTP ${answer.status}). List your open orders to see whether it took effect.`, limitlessMessage(answer.json, ""));
      return answerRefusal(answer, "the cancel");
    },

    funding(account, tokenId) {
      return readLimitlessFunding(deps.chain(BASE), account, tokenId !== null && /^[1-9][0-9]{0,77}$/.test(tokenId) ? tokenId : null);
    },

    approvalBlocker(signer) {
      return limitlessApprovalBlocker(signer.capabilities.sendTransaction);
    },

    approval(account, approval, amount) {
      return buildLimitlessApproval(account, approval, amount);
    },

    async sendApproval(signer, account, transaction) {
      const blocked = limitlessApprovalBlocker(signer.capabilities.sendTransaction);
      if (blocked !== null) return refuse("account_refused", blocked);
      if (account.signer.toLowerCase() !== signer.address.toLowerCase()) return refuse("account_refused", "The connected wallet changed. Read your account again.");
      try {
        if ((await signer.chainId()) !== BASE) await signer.switchChain(BASE);
        return ok(await signer.sendTransaction(transaction.request));
      } catch (error) {
        return walletRefusal(error, "the approval");
      }
    },
  };
  return executor;
}
