// XO for the trading account: its activation (docs/unified-account-design.md section 3.1 VenueActivation), its balance
// and the order calls the one ticket makes, all through the markets API's relay, as before. The account is K(E), the
// Kernel v3.1 account derived from the trading key E (sdk/trade/xo/account/derive.ts):
//
//   activation   the existing account setup (setup.ts: deploy and enable trading in ONE user operation, E signing the
//                raw userOpHash, sent to XO's bundler through the relay), then the order book sign-in (trader.ts login:
//                E's ClobAuth signature, XO's credential kept for this tab). E is a key the page holds, so nothing
//                prompts; every card is still built and must pass its own checks before E signs;
//   balance      K(E)'s USDC.e on XO's chain;
//   orders       trader.ts placeOrder, openOrders and cancel, their answers turned into the direct path's results.
// XO registers an account in its order book on its own side; no call here can do it, so it is not a step.

import type { Address } from "viem";

import type { AdapterDeps } from "../../../../core/ports";
import type { WalletSigner } from "../../../../core/signer";
import type { ActivationStatus, VenueActivation } from "../../../account/activation";
import type { BalanceSource } from "../../../account/balances";
import type { TradingAccount } from "../../../account/types";
import { venueText } from "../text";
import { ok, refuse, type DirectCancelAnswer, type DirectOpenOrder, type DirectOrderAnswer, type DirectRefusalCode, type DirectResult } from "../types";
import type { XoCredentialStore } from "./credentials";
import type { OrderInput } from "./order";
import { readXoReadiness, xoChainCalls, type XoReadiness } from "./readiness";
import type { XoRelayClient } from "./relay";
import { RAW_SIGNING_WORDS, setupActionFor, XoAccountSetup, type XoSetupOptions } from "./setup";
import { chainSupport, XoTrader, type ActionResult } from "./trader";

export const XO_NOT_AVAILABLE = "XO trading is not available in this build.";
export const XO_STEP_SETUP = "Create your XO account and enable trading";
export const XO_STEP_ENABLE = "Enable trading on your XO account";
export const XO_STEP_SIGN_IN = "Sign in to XO's order book";

export interface XoVenueOptions {
  // null when this build names no markets API.
  readonly relay: XoRelayClient | null;
  readonly store: XoCredentialStore;
  // Reads XO's chain (account code, approvals, USDC.e) through the page's guarded fetch.
  readonly adapter: AdapterDeps;
  readonly random: (bytes: number) => Uint8Array;
  // Seams for tests.
  readonly readReadiness?: (relay: XoRelayClient, owner: Address, account: Address) => Promise<XoReadiness>;
  readonly chainCall?: XoSetupOptions["call"];
  readonly sleep?: (ms: number) => Promise<void>;
  readonly pollIntervalMs?: number;
  readonly maxPolls?: number;
}

export interface XoVenue {
  readonly activation: VenueActivation;
  readonly balance: BalanceSource;
  placeOrder(signer: WalletSigner, input: OrderInput): Promise<DirectResult<DirectOrderAnswer>>;
  // The account's resting orders, narrowed to the given outcome tokens when any are named.
  openOrders(signer: WalletSigner, tokenIds: readonly string[]): Promise<DirectResult<readonly DirectOpenOrder[]>>;
  cancel(signer: WalletSigner, orderHash: string): Promise<DirectResult<DirectCancelAnswer>>;
}

// An XO flow's result as the direct path's: done is a value; anything else a refusal in the flow's own fixed words, with
// XO's answer, when there is one, as a stranger's text.
export function fromAction<T>(result: ActionResult<T>, refusedCode: DirectRefusalCode = "venue_refused"): DirectResult<T> {
  if (result.state === "done") return result.value === undefined ? refuse("venue_ambiguous", result.words) : ok(result.value);
  const words = result.answer === null || result.answer.text === null ? null : venueText(result.answer.text);
  if (result.state === "declined") return refuse("wallet_rejected", result.words, words);
  if (result.state === "ambiguous") return refuse("venue_ambiguous", result.words, words);
  return refuse(refusedCode, result.words, words);
}

function doneOrRefused(result: ActionResult<unknown>): DirectResult<void> {
  if (result.state === "done") return ok(undefined);
  const outcome = fromAction(result);
  return outcome.ok ? ok(undefined) : outcome;
}

const STATUS_WORD = /^[A-Za-z_]{1,24}$/;

// XO's own status word in an accepted order's answer ({status: "LIVE"}), cleaned; "unknown" when it gave none.
function statusOf(text: string | null): string {
  if (text === null) return "unknown";
  try {
    const body = JSON.parse(text) as unknown;
    const status = typeof body === "object" && body !== null ? (body as Record<string, unknown>)["status"] : undefined;
    return typeof status === "string" && STATUS_WORD.test(status) ? status.toLowerCase() : "unknown";
  } catch {
    return "unknown";
  }
}

export function createXoVenue(options: XoVenueOptions): XoVenue {
  const { relay, store } = options;

  function trader(client: XoRelayClient, signer: WalletSigner): XoTrader {
    // Every card is checked by the trader itself before E signs; the visitor decided on the ticket's summary.
    return new XoTrader({ signer, relay: client, store, random: options.random, confirm: async () => true });
  }

  function readiness(client: XoRelayClient, account: XoTrader): Promise<XoReadiness> {
    return options.readReadiness === undefined ? readXoReadiness(options.adapter, client, account.owner, account.account) : options.readReadiness(client, account.owner, account.account);
  }

  // Why the account cannot trade on XO at all, in words; null when it can.
  function blocker(signer: WalletSigner): string | null {
    if (relay === null) return XO_NOT_AVAILABLE;
    const support = chainSupport(signer);
    if (!support.ok) return support.words;
    if (!signer.capabilities.rawMessage) return RAW_SIGNING_WORDS;
    return null;
  }

  const activation: VenueActivation = {
    venue: "xo",
    async status(acct): Promise<ActivationStatus> {
      const blocked = blocker(acct.signer);
      if (blocked !== null || relay === null) return { state: "unavailable", reason: blocked ?? XO_NOT_AVAILABLE };
      const account = trader(relay, acct.signer);
      const read = await readiness(relay, account);
      if (read.deployed === "unknown" || (read.deployed === "yes" && (read.allowanceMicro === null || read.sellApproved === null))) {
        return { state: "unavailable", reason: "XO's chain did not answer, so your XO account could not be read. Read again in a moment." };
      }
      const action = setupActionFor(read);
      const steps = [...(action === "deploy_enable_trading" ? [XO_STEP_SETUP] : action === "enable_trading" ? [XO_STEP_ENABLE] : []), ...(account.hasCredential() ? [] : [XO_STEP_SIGN_IN])];
      return steps.length === 0 ? { state: "ready" } : { state: "needs_activation", steps };
    },

    async activate(acct: TradingAccount, progress): Promise<DirectResult<void>> {
      const blocked = blocker(acct.signer);
      if (blocked !== null || relay === null) return refuse("venue_unreachable", blocked ?? XO_NOT_AVAILABLE);
      const account = trader(relay, acct.signer);
      const read = await readiness(relay, account);
      const action = setupActionFor(read);
      if (action !== null) {
        progress(action === "deploy_enable_trading" ? XO_STEP_SETUP : XO_STEP_ENABLE);
        const setup = new XoAccountSetup({
          signer: acct.signer,
          relay,
          call: options.chainCall ?? xoChainCalls(options.adapter),
          confirm: async () => true,
          ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
          ...(options.pollIntervalMs === undefined ? {} : { pollIntervalMs: options.pollIntervalMs }),
          ...(options.maxPolls === undefined ? {} : { maxPolls: options.maxPolls }),
        });
        const done = doneOrRefused(await setup.run(read, { kind: "unlimited" }));
        if (!done.ok) return done;
      } else if (read.deployed !== "yes") {
        return refuse("chain_unreadable", "XO's chain did not answer, so your XO account could not be read. Read again in a moment.");
      }
      if (!account.hasCredential()) {
        progress(XO_STEP_SIGN_IN);
        const signedIn = doneOrRefused(await account.login());
        if (!signedIn.ok) return signedIn;
      }
      return ok(undefined);
    },
  };

  // K(E)'s USDC.e (6 decimals, a dollar each: its base units are the line's dollar millionths); null when unread, never
  // zero. A build with no relay trades nothing on XO and reports no line.
  const balance: BalanceSource = {
    id: "xo-account",
    async read(acct) {
      if (relay === null) return [];
      const read = await readiness(relay, trader(relay, acct.signer));
      return [{ id: "xo-usdce", label: "XO account (USDC.e)", micros: read.usdcMicro }];
    },
  };

  return {
    activation,
    balance,

    async placeOrder(signer, input) {
      const blocked = blocker(signer);
      if (blocked !== null || relay === null) return refuse("venue_unreachable", blocked ?? XO_NOT_AVAILABLE);
      const account = trader(relay, signer);
      if (!account.hasCredential()) return refuse("not_logged_in", "XO trading is not activated for this account yet.");
      const result = await account.placeOrder(input);
      const placed = fromAction(result, "venue_refused");
      if (!placed.ok) return placed;
      return ok({ orderId: placed.value.orderHash, status: statusOf(result.answer?.text ?? null), venueText: null });
    },

    async openOrders(signer, tokenIds) {
      const blocked = blocker(signer);
      if (blocked !== null || relay === null) return refuse("venue_unreachable", blocked ?? XO_NOT_AVAILABLE);
      const account = trader(relay, signer);
      if (!account.hasCredential()) return refuse("not_logged_in", "XO trading is not activated for this account yet.");
      const listed = fromAction(await account.openOrders());
      if (!listed.ok) return listed;
      const wanted = new Set(tokenIds);
      return ok(
        listed.value
          .filter((row) => wanted.size === 0 || (row.tokenId !== null && wanted.has(row.tokenId)))
          .map((row) => ({ id: row.hash, side: row.side, price: row.price, originalSize: row.originalShares, sizeMatched: row.matchedShares, tokenId: row.tokenId, maker: account.account, status: row.status === null ? null : row.status.toLowerCase(), outcome: null })),
      );
    },

    async cancel(signer, orderHash) {
      const blocked = blocker(signer);
      if (blocked !== null || relay === null) return refuse("venue_unreachable", blocked ?? XO_NOT_AVAILABLE);
      const account = trader(relay, signer);
      const result = await account.cancel(orderHash);
      if (result.state === "done") return ok({ canceled: [orderHash.toLowerCase()], notCanceled: [] });
      if (result.state === "refused" && result.answer?.from === "xo") return ok({ canceled: [], notCanceled: [{ id: orderHash.toLowerCase(), reason: result.words }] });
      const refused = fromAction(result);
      return refused.ok ? ok({ canceled: [orderHash.toLowerCase()], notCanceled: [] }) : refused;
    },
  };
}
