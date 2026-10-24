// The Limitless executor: the trading key E trades as our partner sub-account (note 44 section 3.1; design section 3.2).
// The visitor never sees a Limitless credential: every authenticated call is made by our markets API's partner relay
// with our own token, and the key signs only what proves its own intent.
//
//   ready         E must be an EOA on Base (no code, or an EIP-7702 delegation: an order is EOA-signed, signatureType 0,
//                 maker = signer = E); read with eth_getCode on Base;
//   login         registration, once per address: the relay reads Limitless's sign-in text, E personal_signs it, the
//                 relay registers E and answers its profile id. 409 means the address already has a Limitless account
//                 of its own, which no partner can reach (note 44 section 0 point 3). This tab remembers the profile id
//                 (credentials.ts), so the session survives a reload;
//   prepareOrder  reads the market record (its exchange, tokens and fee flags) through the relay and builds the order;
//                 signs nothing;
//   placeOrder    E signs exactly the typed data built, the signature is checked to recover to E over the digest, and
//                 the order is posted once through the relay. On a FEE_RATE_MISMATCH refusal (a legacy fee market,
//                 where a partner cannot read the account's rate) it is signed once more at the rate Limitless named and
//                 posted once more: the refused order was not placed. A prepared order is sent at most once and only
//                 within PREPARED_TTL_MS of being built;
//   openOrders, cancel   through the relay, each with an ownership proof (features/account/proof.ts), since neither carries a
//                 signature of its own and the relay's token could otherwise act for any of our accounts.
// Balances and approvals (funding.ts) are read on Base for E; the approvals are calls E sends once, at activation.

import { CLOB_CHAIN_IDS } from "@sdk/trade/clob/venues";
import { stringToHex, type Hex } from "viem";

import { MARKETS_API_ORIGIN } from "../../../../core/markets-api";
import type { WalletSigner } from "../../../../core/signer";
import type { ClobMarketFacts, ClobTicket } from "../../clob-ticket";
import { isVenueHttpError } from "../http";
import { saltFrom } from "../polymarket/order";
import { proofFor } from "../wallet";
import { venueText } from "../text";
import { ok, refuse, type DirectAccount, type DirectDeps, type DirectExecutor, type DirectFunding, type DirectPreparedOrder, type DirectResult, type DirectSession } from "../types";
import { checkedSignature, walletRefusal } from "../wallet";
import { limitlessOrderCard } from "./card";
import { limitlessApprovalCalls, readLimitlessFunding, type ApprovalCall } from "./funding";
import { limitlessOrderBody, planLimitlessOrder, withFeeRate, type LimitlessOrderPlan } from "./order";
import { createLimitlessRelayClient, type LimitlessAnswer, type LimitlessRelayClient } from "./relay";
import { feeRateMismatch, LIMITLESS_ORDER_ID, LIMITLESS_SLUG, limitlessMessage, readLimitlessMarket, readLimitlessOrders, readProfileId, readSigningMessage } from "./venue";

export const LIMITLESS_VENUE = "limitless";
export const BASE = CLOB_CHAIN_IDS.limitless;
// A prepared order older than this is not sent: the market record was read then.
export const PREPARED_TTL_MS = 120_000;
// The most orders one listing reads (the venue's user-orders route takes 1 to 200).
export const OPEN_ORDERS_LIMIT = 200;
export const NOT_AVAILABLE = "Limitless trading is not available in this build: it names no markets API to relay through.";
export const ALREADY_HAS_ACCOUNT = "This wallet already has its own Limitless account, and Limitless does not let a partner trade for an account it did not create. Trade on Limitless's own site with that account.";

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
  // Whether Limitless answered, in this tab, that the address already has a Limitless account of its own.
  foreign(signer: WalletSigner): boolean;
  funding(account: DirectAccount, tokenId: string | null): Promise<DirectResult<DirectFunding>>;
  // The approvals the chain does not show as granted, as calls; nothing is sent here.
  approvalCalls(account: DirectAccount): Promise<DirectResult<readonly ApprovalCall[]>>;
  // Sends one approval call from E (the trading account's signer routes it through its gas sponsor).
  sendApproval(signer: WalletSigner, call: ApprovalCall): Promise<DirectResult<Hex>>;
}

interface Held {
  readonly plan: LimitlessOrderPlan;
  readonly preparedAtMs: number;
}

interface Registration {
  readonly profileId: number;
}

// What a failed exchange with the relay means, in fixed words: the relay refused (nothing reached Limitless), or
// Limitless said no in its own words.
function answerRefusal<T>(answer: LimitlessAnswer, what: string): DirectResult<T> {
  if (answer.from === "relay") {
    if (answer.status === 504 || answer.status === 502) return refuse("venue_unreachable", `Our markets API's relay could not get an answer from Limitless (HTTP ${answer.status}) for ${what}.`, limitlessMessage(answer.json, ""));
    if (answer.status === 401 || answer.status === 403) return refuse("not_logged_in", `Our markets API did not accept this account's proof for ${what} (HTTP ${answer.status}). Check this computer's clock, then try again.`, limitlessMessage(answer.json, ""));
    return refuse("venue_refused", `Our markets API's relay refused ${what} (HTTP ${answer.status}). Nothing reached Limitless.`, limitlessMessage(answer.json, ""));
  }
  return refuse("venue_refused", `Limitless did not accept ${what} (HTTP ${answer.status}).`, limitlessMessage(answer.json, answer.text));
}

function transportRefusal<T>(error: unknown, what: string): DirectResult<T> {
  if (isVenueHttpError(error) && error.code === "timeout") return refuse("venue_unreachable", `Our markets API did not answer in time for ${what}.`);
  return refuse("venue_unreachable", `Our markets API could not be reached for ${what}.`);
}

function parseRegistration(stored: string | null): Registration | null {
  if (stored === null) return null;
  try {
    const value = JSON.parse(stored) as unknown;
    const id = typeof value === "object" && value !== null ? (value as Record<string, unknown>)["profileId"] : undefined;
    return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? { profileId: id } : null;
  } catch {
    return null;
  }
}

export function createLimitlessExecutor(deps: DirectDeps, relayOrigin: string | null = MARKETS_API_ORIGIN): LimitlessExecutor {
  const relay: LimitlessRelayClient | null = relayOrigin === null ? null : createLimitlessRelayClient(deps.http, relayOrigin);
  // Prepared orders this page built and has not sent: the handle the UI holds is only a key into this map.
  const held = new WeakMap<DirectPreparedOrder, Held>();
  // The fee rate Limitless last named for an account on a fee-enabled market (lower-case address -> bps).
  const feeRates = new Map<string, number>();

  function registrationOf(signer: WalletSigner): Registration | null {
    return parseRegistration(deps.store.get(LIMITLESS_VENUE, signer.address));
  }

  function accountOf(signer: WalletSigner): DirectAccount {
    return { venue: LIMITLESS_VENUE, chainId: BASE, signer: signer.address, maker: signer.address, label: "your trading account", signatureType: 0, makerIsSigner: true };
  }

  async function postOnce(client: LimitlessRelayClient, body: string): Promise<DirectResult<LimitlessAnswer>> {
    try {
      return ok(await client.postOrder(body));
    } catch {
      return refuse("venue_ambiguous", "The order was sent but no answer came back from our markets API. It may or may not be on Limitless's book: list your open orders before placing another.");
    }
  }

  async function signPlan(signer: WalletSigner, plan: LimitlessOrderPlan): Promise<DirectResult<Hex>> {
    let raw: Hex;
    try {
      raw = await signer.signTypedData(plan.typedData);
    } catch (error) {
      return walletRefusal(error, "the order");
    }
    return checkedSignature(signer, plan.digest, raw);
  }

  const executor: LimitlessExecutor = {
    venue: LIMITLESS_VENUE,
    chainId: BASE,
    available: relay !== null,

    async ready(signer) {
      if (relay === null) return refuse("venue_unreachable", NOT_AVAILABLE);
      const chain = deps.chain(BASE);
      if (chain === null) return refuse("chain_unreadable", "This build names no Base RPC, so your account cannot be read there.");
      let code: Hex;
      try {
        code = await chain.port.getCode(signer.address);
      } catch {
        return refuse("chain_unreadable", "This page could not read your account on Base. Read again in a moment.");
      }
      if (code !== "0x" && !DELEGATED_CODE.test(code)) {
        return refuse("account_refused", "Your trading address is a contract on Base. Limitless takes orders a key signs itself (an EOA order), so this page builds none for it.");
      }
      return ok({ accounts: [accountOf(signer)], notes: [] });
    },

    foreign(signer) {
      const stored = deps.store.get(LIMITLESS_VENUE, signer.address);
      return stored !== null && stored.includes('"foreign":true');
    },

    session(signer) {
      const registration = registrationOf(signer);
      return registration === null ? null : { venue: LIMITLESS_VENUE, address: signer.address, keyTag: `profile ${registration.profileId}` };
    },

    async login(signer): Promise<DirectResult<DirectSession>> {
      if (relay === null) return refuse("venue_unreachable", NOT_AVAILABLE);
      let textAnswer: LimitlessAnswer;
      try {
        textAnswer = await relay.signingMessage();
      } catch (error) {
        return transportRefusal(error, "Limitless's sign-in text");
      }
      if (textAnswer.status !== 200) return answerRefusal(textAnswer, "Limitless's sign-in text");
      const message = readSigningMessage(textAnswer.text, textAnswer.json);
      if (!message.ok) return message;
      let signature: Hex;
      try {
        signature = await signer.signMessage(message.value);
      } catch (error) {
        return walletRefusal(error, "the Limitless sign-in text");
      }
      let answer: LimitlessAnswer;
      try {
        answer = await relay.register({ account: signer.address, signingMessageHex: stringToHex(message.value), signature });
      } catch (error) {
        return transportRefusal(error, "your Limitless registration");
      }
      if (answer.status === 409) {
        // Remembered for this tab, so the account stops offering a registration that cannot succeed.
        deps.store.set(LIMITLESS_VENUE, signer.address, JSON.stringify({ foreign: true }));
        return refuse("account_refused", ALREADY_HAS_ACCOUNT, limitlessMessage(answer.json, ""));
      }
      if (answer.status < 200 || answer.status >= 300) return answerRefusal(answer, "your Limitless registration");
      const profileId = readProfileId(answer.json);
      if (!profileId.ok) return profileId;
      deps.store.set(LIMITLESS_VENUE, signer.address, JSON.stringify({ profileId: profileId.value }));
      return ok({ venue: LIMITLESS_VENUE, address: signer.address, keyTag: `profile ${profileId.value}` });
    },

    logout(signer) {
      deps.store.remove(LIMITLESS_VENUE, signer.address);
    },

    async prepareOrder(signer, account, input) {
      if (relay === null) return refuse("venue_unreachable", NOT_AVAILABLE);
      if (account.venue !== LIMITLESS_VENUE || account.signer.toLowerCase() !== signer.address.toLowerCase()) return refuse("account_refused", "The account was read for another key. Read your account again.");
      if (registrationOf(signer) === null) return refuse("not_logged_in", "Limitless trading is not activated for this account yet.");
      const slug = input.ticket.marketId;
      if (!LIMITLESS_SLUG.test(slug) || input.facts.marketId !== slug) return refuse("invalid_order", "This ticket does not name a Limitless market.");
      let marketAnswer: LimitlessAnswer;
      try {
        marketAnswer = await relay.market(slug);
      } catch (error) {
        return transportRefusal(error, "the market's record");
      }
      if (marketAnswer.from !== "limitless" || marketAnswer.status !== 200) return answerRefusal(marketAnswer, "the market's record");
      const market = readLimitlessMarket(marketAnswer.json, slug, input.ticket.tokenId);
      if (!market.ok) return market;
      const plan = planLimitlessOrder({ ticket: input.ticket, account, market: market.value, feeRateBps: feeRates.get(signer.address.toLowerCase()) ?? 0, salt: saltFrom(deps.randomBytes) });
      if (!plan.ok) return plan;
      const card = limitlessOrderCard({
        plan: plan.value,
        account,
        shares: input.ticket.shares,
        principalAtomic: input.ticket.principalAtomic,
        maxOutlayAtomic: input.ticket.maxOutlayAtomic,
        minProceedsAtomic: input.ticket.minProceedsAtomic,
        outcome: input.outcome,
        book: { unread: "The book is shown in the market's own view; this order does not depend on it." },
      });
      const prepared: DirectPreparedOrder = { venue: LIMITLESS_VENUE, account, card, typedData: plan.value.typedData, orderId: plan.value.digest };
      held.set(prepared, { plan: plan.value, preparedAtMs: deps.nowMs() });
      return ok(prepared);
    },

    async placeOrder(signer, prepared) {
      const entry = held.get(prepared);
      if (entry === undefined || relay === null) return refuse("invalid_order", "This order was already sent or was never prepared here. Review it again.");
      if (prepared.account.signer.toLowerCase() !== signer.address.toLowerCase()) return refuse("account_refused", "The trading account changed since this order was prepared. Review it again.");
      if (deps.nowMs() - entry.preparedAtMs > PREPARED_TTL_MS) {
        held.delete(prepared);
        return refuse("invalid_order", "This order was prepared more than two minutes ago. Review it again so the market's record is fresh.");
      }
      let plan = entry.plan;
      const signature = await signPlan(signer, plan);
      if (!signature.ok) return signature;
      // From here on the order may reach the venue: the handle is spent whatever the answer.
      held.delete(prepared);
      let posted = await postOnce(relay, limitlessOrderBody(plan, signature.value));
      if (!posted.ok) return posted;
      let answer = posted.value;
      const expected = answer.from === "limitless" && answer.status === 400 ? feeRateMismatch(answer.json) : null;
      if (expected !== null && expected !== plan.feeRateBps && plan.feeSource === "on") {
        // The venue refused the order for its fee rate alone, so it is not on the book: sign it once at the named rate.
        feeRates.set(signer.address.toLowerCase(), expected);
        plan = withFeeRate(plan, expected);
        const again = await signPlan(signer, plan);
        if (!again.ok) return again;
        posted = await postOnce(relay, limitlessOrderBody(plan, again.value));
        if (!posted.ok) return posted;
        answer = posted.value;
      }
      if (answer.status >= 500) {
        return refuse("venue_ambiguous", `No usable answer came back for the order (HTTP ${answer.status}). It may or may not have been placed: list your open orders before placing another.`, limitlessMessage(answer.json, answer.from === "limitless" ? answer.text : ""));
      }
      if (answer.status < 200 || answer.status >= 300) return answerRefusal(answer, "the order");
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
      if (registrationOf(signer) === null) return refuse("not_logged_in", "Limitless trading is not activated for this account yet.");
      if (filter.market === null || !LIMITLESS_SLUG.test(filter.market)) return refuse("invalid_order", "Limitless lists your orders one market at a time.");
      const proof = await proofFor(signer, { method: "GET", path: relay.paths.ordersOf(signer.address, filter.market) }, deps.nowMs());
      if (!proof.ok) return proof;
      let answer: LimitlessAnswer;
      try {
        answer = await relay.userOrders(signer.address, filter.market, proof.value);
      } catch (error) {
        return transportRefusal(error, "your open orders");
      }
      if (answer.status !== 200) return answerRefusal(answer, "your open orders");
      return readLimitlessOrders(answer.json, OPEN_ORDERS_LIMIT);
    },

    async cancel(signer, orderId) {
      if (relay === null) return refuse("venue_unreachable", NOT_AVAILABLE);
      if (registrationOf(signer) === null) return refuse("not_logged_in", "Limitless trading is not activated for this account yet.");
      if (!LIMITLESS_ORDER_ID.test(orderId)) return refuse("invalid_order", "That is not a Limitless order id.");
      const body = JSON.stringify({ account: signer.address, orderId });
      const proof = await proofFor(signer, { method: "POST", path: relay.paths.cancel, body }, deps.nowMs());
      if (!proof.ok) return proof;
      let answer: LimitlessAnswer;
      try {
        answer = await relay.cancelOrder(body, proof.value);
      } catch {
        return refuse("venue_ambiguous", "The cancel was sent but no answer came back from our markets API. List your open orders to see whether it took effect.");
      }
      if (answer.from === "limitless" && answer.status >= 200 && answer.status < 300) return ok({ canceled: [orderId], notCanceled: [] });
      if (answer.from === "limitless" && answer.status >= 400 && answer.status < 500) {
        return ok({ canceled: [], notCanceled: [{ id: orderId, reason: limitlessMessage(answer.json, answer.text) ?? `HTTP ${answer.status}` }] });
      }
      if (answer.status >= 500) return refuse("venue_ambiguous", `No usable answer came back for the cancel (HTTP ${answer.status}). List your open orders to see whether it took effect.`, limitlessMessage(answer.json, ""));
      return answerRefusal(answer, "the cancel");
    },

    funding(account, tokenId) {
      return readLimitlessFunding(deps.chain(BASE), account, tokenId !== null && /^[1-9][0-9]{0,77}$/.test(tokenId) ? tokenId : null);
    },

    async approvalCalls(account) {
      const funding = await readLimitlessFunding(deps.chain(BASE), account, null);
      return funding.ok ? ok(limitlessApprovalCalls(funding.value)) : funding;
    },

    async sendApproval(signer, call) {
      try {
        return ok(await signer.sendTransaction({ chainId: call.chainId, to: call.to, data: call.data }));
      } catch (error) {
        return walletRefusal(error, "the approval");
      }
    },
  };
  return executor;
}
