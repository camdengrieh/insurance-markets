// XO trading from the visitor's own wallet, through the markets API's relay: log in (ClobAuth, L1), place an order,
// list the open orders, cancel one. Every wallet signature is preceded by a Signature Card (`confirm`), and every XO
// answer is handed back as it came (status, who answered, the body for orders and cancels; never the login's body,
// which carries the credential).
//
// The order of things inside one action, and why:
//   1. the wallet session must be able to sign on chain 3223 (PayBox over WalletConnect cannot: its session approves
//      other chains), then the wallet is switched to 3223 (it adds the chain if needed);
//   2. XO's clock is read through the relay: the login timestamp, an order's expiry and every L2 timestamp are XO's
//      seconds (its windows are about 120 s for L1 and 30 s for L2);
//   3. the card is built from the exact fields that will be signed and must pass its checks; the visitor decides;
//   4. the wallet signs; the signature is recovered against the Kernel digest and must name the connected owner;
//   5. ONE request. Nothing is retried: a post that got no answer is looked up by its hash, never sent again.

import { getAddress, type Address, type Hex } from "viem";

import { deriveAccount } from "@sdk/trade/xo/account/derive";
import { buildL1Headers } from "@sdk/trade/xo/clobauth";
import { assembleWireSignature, normalizeEcdsaSignature } from "@sdk/trade/xo/signature";

import { WalletError, type WalletSigner } from "../../../../core/signer";
import { XoCredential, type XoCredentialStore } from "./credentials";
import { buildL2Headers, type L2Headers } from "./hmac";
import { buildXoOrder, cancelBody, OrderInputError, orderPostBody, readBook, readCancel, readOpenOrders, type OpenOrderRow, type OrderInput } from "./order";
import { RelayError, type RelayAnswer, type XoRelayClient } from "./relay";
import { cardPasses, loginCard, orderCard, signerOf, XO_CHAIN_ID, type XoSigningCard } from "./signing";

// What the visitor sees after an action: XO's answer as it came, or the reason nothing was sent.
export interface VenueAnswer {
  readonly status: number;
  readonly from: "xo" | "relay";
  // The body text for orders, cancels and lists; null for the login (its body is the credential).
  readonly text: string | null;
}

export type ActionState = "done" | "refused" | "declined" | "ambiguous";

export interface ActionResult<T = undefined> {
  readonly state: ActionState;
  // Fixed app words.
  readonly words: string;
  readonly answer: VenueAnswer | null;
  readonly value?: T;
}

export type ChainSupport = { readonly ok: true } | { readonly ok: false; readonly words: string };

export const PAYBOX_CHAIN_WORDS =
  "This wallet session cannot sign on XO's chain (3223). A WalletConnect session signs only on the chains it approved, and XO's chain is not one of them; PayBox connects this way and cannot sign XO orders or the XO login. Connect a browser wallet that can add chain 3223 to trade on XO.";

// Before anything is built: can this session sign on 3223 at all?
export function chainSupport(signer: WalletSigner): ChainSupport {
  const chains = signer.capabilities.chains;
  if (chains === "any" || chains.includes(XO_CHAIN_ID)) return { ok: true };
  return { ok: false, words: PAYBOX_CHAIN_WORDS };
}

function walletWords(error: unknown, doing: string): { readonly state: ActionState; readonly words: string } {
  if (error instanceof WalletError) {
    if (error.code === "rejected") return { state: "declined", words: `You declined ${doing} in the wallet. Nothing was sent.` };
    if (error.code === "unsupported_chain") return { state: "refused", words: `The wallet would not switch to, or add, XO's chain (3223), so it cannot sign for XO. Nothing was sent.` };
    if (error.code === "disconnected") return { state: "refused", words: "The wallet disconnected. Nothing was sent." };
    if (error.code === "unsupported") return { state: "refused", words: `This wallet cannot do ${doing}. Nothing was sent.` };
  }
  return { state: "refused", words: `The wallet failed during ${doing}. Nothing was sent.` };
}

function answerOf(answer: RelayAnswer, withBody: boolean): VenueAnswer {
  return { status: answer.status, from: answer.from, text: withBody ? answer.text : null };
}

const refused = <T>(words: string, answer: VenueAnswer | null = null): ActionResult<T> => ({ state: "refused", words, answer });

export interface XoTraderOptions {
  readonly signer: WalletSigner;
  readonly relay: XoRelayClient;
  readonly store: XoCredentialStore;
  // The Signature Card: resolves true only when the visitor chose to sign.
  readonly confirm: (card: XoSigningCard) => Promise<boolean>;
  readonly random: (bytes: number) => Uint8Array;
}

export class XoTrader {
  readonly owner: Address;
  readonly account: Address;
  readonly #options: XoTraderOptions;

  constructor(options: XoTraderOptions) {
    this.#options = options;
    this.owner = getAddress(options.signer.address);
    this.account = getAddress(deriveAccount(this.owner));
  }

  hasCredential(): boolean {
    return this.#options.store.get(this.owner, this.account) !== null;
  }

  forgetCredential(): void {
    this.#options.store.forget(this.owner, this.account);
  }

  // XO's clock, as a whole number of seconds.
  async #serverSeconds(): Promise<number> {
    const answer = await this.#options.relay.time();
    const match = answer.status === 200 && answer.from === "xo" ? /^\s*"?(\d{9,12})"?\s*$/.exec(answer.text) : null;
    if (match === null) throw new RelayError("unreachable", "XO's clock could not be read through the relay.");
    return Number(match[1]);
  }

  async #onChain(doing: string): Promise<{ readonly state: ActionState; readonly words: string } | null> {
    const support = chainSupport(this.#options.signer);
    if (!support.ok) return { state: "refused", words: support.words };
    try {
      if ((await this.#options.signer.chainId()) !== XO_CHAIN_ID) await this.#options.signer.switchChain(XO_CHAIN_ID);
    } catch (error) {
      return walletWords(error, `the switch to XO's chain before ${doing}`);
    }
    return null;
  }

  // Card, decision, signature, recovery check. Returns the canonical 65 bytes, or why not.
  async #sign(card: XoSigningCard, doing: string): Promise<{ readonly ok: true; readonly ecdsa: Hex } | { readonly ok: false; readonly result: ActionResult<never> }> {
    if (!cardPasses(card)) return { ok: false, result: refused(`A check on the signature card failed, so the wallet was not asked to sign ${doing}.`) };
    if (!(await this.#options.confirm(card))) return { ok: false, result: { state: "declined", words: `You chose not to sign ${doing}. Nothing was sent.`, answer: null } };
    let signature: Hex;
    try {
      signature = await this.#options.signer.signTypedData(card.typedData);
    } catch (error) {
      const words = walletWords(error, `signing ${doing}`);
      return { ok: false, result: { ...words, answer: null } };
    }
    const recovered = await signerOf(card, signature);
    if (recovered === null || getAddress(recovered) !== this.owner) {
      return { ok: false, result: refused("The wallet's signature was not made by the connected address over the hash on the card, so nothing was sent.") };
    }
    try {
      // Canonical form: v 27 or 28, low s (assembleWireSignature refuses a malleable one).
      return { ok: true, ecdsa: normalizeEcdsaSignature(signature) };
    } catch {
      return { ok: false, result: refused("The wallet returned a signature in a form XO does not take, so nothing was sent.") };
    }
  }

  async #l2(method: "GET" | "POST" | "DELETE", path: string, body: string): Promise<L2Headers | null> {
    const credential = this.#options.store.get(this.owner, this.account);
    if (credential === null) return null;
    const timestamp = String(await this.#serverSeconds());
    return buildL2Headers({ credentials: credential.forSigning(), timestamp, method, requestPath: path, body, canonicalMode: "path-with-query" });
  }

  // ---- (a) the login ----------------------------------------------------------------------------------------------------

  async login(): Promise<ActionResult> {
    const blocked = await this.#onChain("the XO login");
    if (blocked !== null) return { ...blocked, answer: null };
    try {
      const { card, fields } = loginCard(this.owner, this.account, await this.#serverSeconds());
      const signed = await this.#sign(card, "the XO login");
      if (!signed.ok) return signed.result;
      const l1 = buildL1Headers(fields, assembleWireSignature(signed.ecdsa));
      const derived = await this.#options.relay.deriveApiKey(l1);
      if (derived.from === "xo" && derived.status === 200) return this.#adopt(derived, "XO sent this account's existing API credential again.");
      if (!(derived.from === "xo" && derived.status === 404)) return refused(loginRefusal(derived), answerOf(derived, false));
      // 404: XO authenticated the signature and holds no key for this account. One create, with the same headers.
      const created = await this.#options.relay.createApiKey(l1);
      if (created.from === "xo" && created.status >= 200 && created.status < 300) return this.#adopt(created, "XO created an API credential for this account.");
      return refused(loginRefusal(created), answerOf(created, false));
    } catch (error) {
      return refused(error instanceof RelayError ? `${error.message} The login did not complete.` : "The login could not be completed.");
    }
  }

  #adopt(answer: RelayAnswer, words: string): ActionResult {
    const credential = XoCredential.from(answer.json);
    if (credential === null) {
      const keyOnly = typeof answer.json === "object" && answer.json !== null && typeof (answer.json as Record<string, unknown>)["apiKey"] === "string";
      return refused(keyOnly ? "XO says this account has an API key but did not send its secret, so this tab cannot sign with it. The key was made elsewhere; this page cannot recover its secret." : "XO's answer did not hold a credential in a form this page knows.", answerOf(answer, false));
    }
    this.#options.store.put(this.owner, this.account, credential);
    return { state: "done", words: `${words} It is kept in this tab only (sessionStorage) and is gone when the tab closes.`, answer: answerOf(answer, false) };
  }

  // ---- (b) an order -----------------------------------------------------------------------------------------------------

  async placeOrder(input: OrderInput): Promise<ActionResult<{ readonly orderHash: Hex }>> {
    if (this.#options.store.get(this.owner, this.account) === null) return refused("Log in to XO first: orders are sent with this account's API credential.");
    const blocked = await this.#onChain("the order");
    if (blocked !== null) return { ...blocked, answer: null };
    let card: XoSigningCard;
    let built: ReturnType<typeof buildXoOrder>;
    try {
      const now = await this.#serverSeconds();
      const bookAnswer = await this.#options.relay.book(input.tokenId);
      if (bookAnswer.from !== "xo" || bookAnswer.status !== 200) return refused("XO's book for this outcome could not be read, so no order was built.", answerOf(bookAnswer, true));
      const book = readBook(bookAnswer.json);
      built = buildXoOrder(input, this.account, now, book, this.#options.random);
      const reference = input.side === "BUY" ? (book.bestAsk === null ? null : { price: book.bestAsk, label: "Best ask on XO's book when this card was built" }) : book.bestBid === null ? null : { price: book.bestBid, label: "Best bid on XO's book when this card was built" };
      card = orderCard(this.owner, built.order, { nowSeconds: now, reference });
    } catch (error) {
      if (error instanceof OrderInputError) return refused(error.message);
      if (error instanceof RelayError) return refused(`${error.message} No order was built.`);
      return refused("The order could not be built from these values.");
    }
    const signed = await this.#sign(card, "this order");
    if (!signed.ok) return signed.result;
    const orderHash = card.innerHash;
    let headers: L2Headers | null;
    const body = orderPostBody(built.order, signed.ecdsa);
    try {
      headers = await this.#l2("POST", "/order", body);
    } catch {
      return refused("XO's clock could not be read just before sending, so the signed order was not sent.");
    }
    if (headers === null) return refused("This tab no longer holds the XO credential. Log in again; the signed order was not sent.");
    let answer: RelayAnswer;
    try {
      answer = await this.#options.relay.postOrder(body, headers);
    } catch {
      return this.#lookUp(orderHash);
    }
    if (answer.from === "relay" && (answer.status === 504 || answer.status === 502 || answer.status >= 500)) return this.#lookUp(orderHash, answerOf(answer, true));
    if (answer.from === "xo" && answer.status >= 200 && answer.status < 300) return { state: "done", words: "XO accepted the order. Its answer is below.", answer: answerOf(answer, true), value: { orderHash } };
    if (answer.from === "xo" && answer.status === 401) return refused("XO refused this tab's credential (401). Log in again, then send a new order.", answerOf(answer, true));
    return refused(answer.from === "xo" ? `XO did not accept the order (HTTP ${answer.status}). Its answer is below.` : `The relay refused the request (HTTP ${answer.status}). Nothing reached XO.`, answerOf(answer, true));
  }

  // A post with no answer: look the order up by its hash once. Never send it again.
  async #lookUp(orderHash: Hex, first: VenueAnswer | null = null): Promise<ActionResult<{ readonly orderHash: Hex }>> {
    try {
      const headers = await this.#l2("GET", `/orders/${orderHash}`, "");
      if (headers !== null) {
        const found = await this.#options.relay.getOrder(orderHash, headers);
        if (found.from === "xo" && found.status === 200) return { state: "done", words: "The post got no answer, but XO lists the order by its hash. Its record is below.", answer: answerOf(found, true), value: { orderHash } };
      }
    } catch {
      // Falls through to "unknown".
    }
    return { state: "ambiguous", words: `The order was sent but no answer came back, and XO did not list it when asked. It may or may not be on the book: check the open orders before signing another. Its hash is ${orderHash}.`, answer: first, value: { orderHash } };
  }

  // ---- open orders ------------------------------------------------------------------------------------------------------

  async openOrders(): Promise<ActionResult<readonly OpenOrderRow[]>> {
    try {
      const headers = await this.#l2("GET", "/orders", "");
      if (headers === null) return refused("Log in to XO first: the order list is read with this account's API credential.");
      const answer = await this.#options.relay.listOrders(headers);
      if (answer.from !== "xo" || answer.status !== 200) return refused(answer.from === "xo" ? `XO did not list the orders (HTTP ${answer.status}).` : `The relay refused the request (HTTP ${answer.status}).`, answerOf(answer, true));
      const rows = readOpenOrders(answer.json);
      if (rows === null) return refused("XO's order list was not in a form this page knows.", answerOf(answer, true));
      return { state: "done", words: `${rows.length} open order${rows.length === 1 ? "" : "s"} on XO.`, answer: answerOf(answer, true), value: rows };
    } catch (error) {
      return refused(error instanceof RelayError ? error.message : "The order list could not be read.");
    }
  }

  // ---- (c) a cancel: an L2 request, no wallet signature ------------------------------------------------------------------

  async cancel(orderHash: string): Promise<ActionResult> {
    let body: string;
    try {
      body = cancelBody(orderHash);
    } catch (error) {
      return refused(error instanceof OrderInputError ? error.message : "That is not an order hash.");
    }
    let answer: RelayAnswer;
    try {
      const headers = await this.#l2("DELETE", "/order", body);
      if (headers === null) return refused("Log in to XO first: a cancel is sent with this account's API credential.");
      answer = await this.#options.relay.cancelOrder(body, headers);
    } catch (error) {
      return { state: "ambiguous", words: `${error instanceof RelayError ? error.message : "The cancel failed."} Whether XO received it is not known; read the open orders.`, answer: null };
    }
    if (answer.from !== "xo") return refused(`The relay refused the request (HTTP ${answer.status}). Nothing reached XO.`, answerOf(answer, true));
    const reading = readCancel(answer.json, orderHash);
    if (answer.status === 200 && reading.state === "cancelled") return { state: "done", words: "XO cancelled the order. Its signature stays valid on chain until the order's expiry; XO no longer matches it.", answer: answerOf(answer, true) };
    return refused(reading.reason === null ? `XO did not confirm the cancel (HTTP ${answer.status}). Its answer is below.` : `XO did not cancel the order: ${reading.reason}.`, answerOf(answer, true));
  }
}

function loginRefusal(answer: RelayAnswer): string {
  if (answer.from === "relay") return `The relay refused the login request (HTTP ${answer.status}). Nothing reached XO.`;
  if (answer.status === 401) return "XO refused the login signature (401). If the account was deployed moments ago, wait a minute and try again.";
  return `XO did not complete the login (HTTP ${answer.status}).`;
}
