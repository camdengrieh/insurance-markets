// The Polymarket executor: the relay's flow (relay/clob.ts), moved into the visitor's browser and signed by the
// visitor's own wallet.
//
//   ready         reads Polygon for the account the wallet trades from (maker.ts: Deposit Wallet, Safe or the wallet);
//   login         L1: the ClobAuth EIP-712 message (sdk/trade/clob/polymarket/clobauth.ts) on the venue's clock, signed
//                 by the wallet, checked to recover to it, then GET /auth/derive-api-key and, only if that gives nothing,
//                 POST /auth/api-key. The visitor's own credential is kept for this tab (credentials.ts);
//   prepareOrder  reads the venue's clock and the live book, builds the order and its card; signs nothing;
//   placeOrder    asks the wallet to sign exactly the typed data on the card, checks the signature recovers to the wallet
//                 over the card's digest, and POSTs /order once with the L2 headers (l2.ts). A prepared order is sent at
//                 most once and only within PREPARED_TTL_MS of being built;
//   openOrders, cancel   GET /data/orders and DELETE /order with the same credential.
// Balances and approvals (funding.ts) are read for the account picked. A Deposit Wallet's approvals are one batch the
// owner signs and Polymarket's relayer sends (activation.ts), never a transaction from here.

import { buildPolymarketClobAuthTypedData, buildPolymarketL1Headers, hashPolymarketClobAuth } from "@sdk/trade/clob/polymarket/clobauth";
import { CLOB_CHAIN_IDS, type PolymarketBook } from "@sdk/trade/clob/venues";
import type { Hex } from "viem";

import type { WalletSigner } from "../../../../core/signer";
import type { ClobMarketFacts, ClobTicket } from "../../clob-ticket";
import { ok, refuse, type DirectAccount, type DirectDeps, type DirectExecutor, type DirectFunding, type DirectPreparedOrder, type DirectResult, type DirectSession } from "../types";
import { checkedSignature, walletCovers, walletRefusal } from "../wallet";
import { cancelPolymarketOrder, createVenueClock, deriveOrCreateCredentials, getPolymarketOpenOrders, postPolymarketOrder, readPolymarketBook, refreshPolymarketAllowances, type L2Context } from "./api";
import { polymarketOrderCard } from "./card";
import { readPolymarketFunding } from "./funding";
import { parsePolymarketCredentials, polymarketKeyTag, type PolymarketCredentials } from "./l2";
import { POLYMARKET_VENUE, readPolymarketAccounts } from "./maker";
import { decideBook, microText, planPolymarketOrder, polymarketOrderBody, saltFrom, type PolymarketOrderPlan } from "./order";

export const POLYGON = CLOB_CHAIN_IDS.polymarket;
// A prepared order older than this is not sent: its timestamp and a GTD expiry were taken from the venue's clock then.
export const PREPARED_TTL_MS = 120_000;

export interface PolymarketOrderInput {
  readonly ticket: ClobTicket;
  readonly facts: ClobMarketFacts;
  // Fixed app words for the outcome ("Yes", "No", "Outcome 3"), or null.
  readonly outcome: string | null;
}

export interface PolymarketExecutor extends DirectExecutor<PolymarketOrderInput> {
  // The book the market's record names, before any live read (funding is read against its exchange).
  bookOf(facts: ClobMarketFacts): PolymarketBook;
  funding(account: DirectAccount, book: PolymarketBook, tokenId: string | null): Promise<DirectResult<DirectFunding>>;
  // Asks the CLOB to read the account's balance and allowances again (after its approvals land).
  refreshAllowances(signer: WalletSigner, account: DirectAccount): Promise<DirectResult<void>>;
}

interface Held {
  readonly plan: PolymarketOrderPlan;
  readonly preparedAtMs: number;
}

export function createPolymarketExecutor(deps: DirectDeps): PolymarketExecutor {
  const clock = createVenueClock(deps.http, deps.nowMs);
  // Prepared orders this page built and has not sent: the handle the UI holds is only a key into this map.
  const held = new WeakMap<DirectPreparedOrder, Held>();

  function credentialsOf(signer: WalletSigner): PolymarketCredentials | null {
    return parsePolymarketCredentials(deps.store.get(POLYMARKET_VENUE, signer.address));
  }

  function l2(signer: WalletSigner, credentials: PolymarketCredentials): L2Context {
    return { http: deps.http, clock, address: signer.address, credentials };
  }

  function needsPolygon<T>(signer: WalletSigner): DirectResult<T> | null {
    return walletCovers(signer, POLYGON) ? null : refuse("wallet_wrong_chain", "Your wallet's session does not include Polygon (chain 137), where Polymarket settles. Connect a session that does.");
  }

  const executor: PolymarketExecutor = {
    venue: POLYMARKET_VENUE,
    chainId: POLYGON,

    async ready(signer) {
      const wrong = needsPolygon<never>(signer);
      if (wrong !== null) return wrong;
      return readPolymarketAccounts(deps.chain(POLYGON), signer.address);
    },

    session(signer) {
      const credentials = credentialsOf(signer);
      return credentials === null ? null : { venue: POLYMARKET_VENUE, address: signer.address, keyTag: polymarketKeyTag(credentials.apiKey) };
    },

    async login(signer): Promise<DirectResult<DirectSession>> {
      const wrong = needsPolygon<never>(signer);
      if (wrong !== null) return wrong;
      const now = await clock.nowS(true);
      if (!now.ok) return now;
      const fields = { address: signer.address, timestamp: String(now.value), nonce: 0n };
      let raw: Hex;
      try {
        raw = await signer.signTypedData(buildPolymarketClobAuthTypedData(fields));
      } catch (error) {
        return walletRefusal(error, "the Polymarket login");
      }
      const signature = await checkedSignature(signer, hashPolymarketClobAuth(fields), raw);
      if (!signature.ok) return signature;
      const headers = buildPolymarketL1Headers(fields, signature.value);
      const usable = (credentials: PolymarketCredentials): boolean => parsePolymarketCredentials(JSON.stringify(credentials)) !== null;
      const got = await deriveOrCreateCredentials(deps.http, headers, usable);
      if (!got.ok) return got;
      deps.store.set(POLYMARKET_VENUE, signer.address, JSON.stringify(got.value.credentials));
      return ok({ venue: POLYMARKET_VENUE, address: signer.address, keyTag: polymarketKeyTag(got.value.credentials.apiKey) });
    },

    logout(signer) {
      deps.store.remove(POLYMARKET_VENUE, signer.address);
    },

    bookOf(facts) {
      return facts.polymarketBook ?? "ctf";
    },

    async prepareOrder(signer, account, input) {
      const wrong = needsPolygon<never>(signer);
      if (wrong !== null) return wrong;
      if (account.venue !== POLYMARKET_VENUE || account.signer.toLowerCase() !== signer.address.toLowerCase()) return refuse("account_refused", "The account was read for another wallet. Read your account again.");
      const [now, live] = await Promise.all([clock.nowS(true), readPolymarketBook(deps.http, input.ticket.tokenId)]);
      if (!now.ok) return now;
      if (!live.ok) return live;
      const book = decideBook(input.facts, input.ticket, live.value);
      if (!book.ok) return book;
      const plan = planPolymarketOrder({ ticket: input.ticket, account, book: book.value, nowS: now.value, salt: saltFrom(deps.randomBytes) });
      if (!plan.ok) return plan;
      const p = plan.value;
      const card = polymarketOrderCard({
        order: p.order,
        book: p.book,
        domain: { name: p.domain.name, version: p.domain.version, chainId: p.domain.chainId, verifyingContract: p.domain.verifyingContract },
        account,
        digest: p.digest,
        orderHash: p.orderHash,
        price: input.ticket.price,
        shares: input.ticket.shares,
        principalAtomic: input.ticket.principalAtomic,
        maxOutlayAtomic: input.ticket.maxOutlayAtomic,
        minProceedsAtomic: input.ticket.minProceedsAtomic,
        tif: p.tif,
        postOnly: p.postOnly,
        expiration: p.expiration,
        outcome: input.outcome,
        bestBid: microText(live.value.bestBidMicro),
        bestAsk: microText(live.value.bestAskMicro),
      });
      const prepared: DirectPreparedOrder = { venue: POLYMARKET_VENUE, account, card, typedData: p.typedData, orderId: p.orderHash };
      held.set(prepared, { plan: p, preparedAtMs: deps.nowMs() });
      return ok(prepared);
    },

    async placeOrder(signer, prepared) {
      const entry = held.get(prepared);
      if (entry === undefined) return refuse("invalid_order", "This order was already sent or was never prepared here. Review it again.");
      if (prepared.account.signer.toLowerCase() !== signer.address.toLowerCase()) return refuse("account_refused", "The connected wallet changed since this order was prepared. Review it again.");
      if (deps.nowMs() - entry.preparedAtMs > PREPARED_TTL_MS) {
        held.delete(prepared);
        return refuse("invalid_order", "This order was prepared more than two minutes ago. Review it again so its time and the book are fresh.");
      }
      const credentials = credentialsOf(signer);
      if (credentials === null) return refuse("not_logged_in", "Log in to Polymarket in this tab first.");
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
      const body = polymarketOrderBody(entry.plan, signature.value, credentials.apiKey);
      const posted = await postPolymarketOrder(l2(signer, credentials), body, entry.plan.orderHash);
      if (!posted.ok) return posted;
      return ok({ orderId: posted.value.orderId, status: posted.value.status, venueText: posted.value.venueText });
    },

    async openOrders(signer, filter) {
      const credentials = credentialsOf(signer);
      if (credentials === null) return refuse("not_logged_in", "Log in to Polymarket in this tab to list your orders.");
      return getPolymarketOpenOrders(l2(signer, credentials), filter.market);
    },

    async cancel(signer, orderId) {
      const credentials = credentialsOf(signer);
      if (credentials === null) return refuse("not_logged_in", "Log in to Polymarket in this tab to cancel an order.");
      return cancelPolymarketOrder(l2(signer, credentials), orderId);
    },

    funding(account, book, tokenId) {
      return readPolymarketFunding(deps.chain(POLYGON), account, book, tokenId);
    },

    async refreshAllowances(signer, account) {
      const credentials = credentialsOf(signer);
      if (credentials === null) return refuse("not_logged_in", "Polymarket trading is not activated for this account yet.");
      return refreshPolymarketAllowances(l2(signer, credentials), account.signatureType);
    },
  };
  return executor;
}
