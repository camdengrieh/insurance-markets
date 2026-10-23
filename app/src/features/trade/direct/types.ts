// The direct path: the visitor's own wallet signs, and the page sends the signed item to the venue itself, from the
// visitor's browser, with the visitor's own venue credential. No daemon, no relay and no server of the author's is in
// the way: the author holds no key, no credential and sees no request. It exists only in the standalone build (the
// Cockpit build keeps every write behind the local daemon, and its CSP lets the page reach nothing but 'self').
//
// One executor per venue, behind the small interface below, so the trade desk asks every venue the same questions:
//   ready        can this wallet trade here, and as which account (read from the chain, never assumed);
//   session      the venue session this tab holds for the wallet, if any (memory and sessionStorage, never more);
//   login        make one (a wallet signature the venue turns into the visitor's own credential);
//   prepareOrder build exactly what the wallet will be asked to sign, with every field decoded for the card; signs nothing;
//   placeOrder   ask the wallet to sign that and send it once; the venue's answer comes back as it is, cleaned;
//   openOrders   the wallet's resting orders, and cancel one.
// The registry (index.ts) maps a venue id to its executor's factory.
//
// Every failure the visitor can meet is a value (DirectResult), never a throw: fixed app words in `message`, and the
// venue's or the wallet's own words, when there are any, as untrusted text in `venueText`.

import type { TransactionRequest, WalletSigner } from "../../../core/signer";
import type { PinGuard } from "@sdk/chain/pins";
import type { RpcPort } from "@sdk/chain/rpc";
import type { Address, Hex, TypedDataDefinition } from "viem";

import type { CredentialStore } from "./credentials";
import type { VenueHttp } from "./http";

export type DirectRefusalCode =
  // The wallet: declined, cannot do this, will not use the chain, went away, or answered something else.
  | "wallet_rejected"
  | "wallet_unsupported"
  | "wallet_wrong_chain"
  | "wallet_disconnected"
  | "wallet_failed"
  // The signature the wallet returned does not recover to the wallet over the digest shown on the card.
  | "signature_mismatch"
  // A chain read failed or answered something this page does not trust: nothing is assumed in its place.
  | "chain_unreadable"
  // The chain says this wallet cannot trade here as built (an account kind this page does not build, a wallet owned by
  // someone else, an approval a contract wallet must give itself).
  | "account_refused"
  // No venue session for this wallet in this tab.
  | "not_logged_in"
  // The ticket or the market facts cannot make an order (the venue's tick moved, a size off the grid).
  | "invalid_order"
  // The venue said no, did not answer, or answered so that the outcome is unknown.
  | "venue_refused"
  | "venue_unreachable"
  | "venue_ambiguous";

export interface DirectRefusal {
  readonly code: DirectRefusalCode;
  // Fixed app words.
  readonly message: string;
  // What the venue or the wallet said, as a stranger's text (cleaned, capped). Rendered only through UntrustedText.
  readonly venueText: string | null;
}

export type DirectResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: DirectRefusal };

export function ok<T>(value: T): DirectResult<T> {
  return { ok: true, value };
}

export function refuse<T>(code: DirectRefusalCode, message: string, venueText: string | null = null): DirectResult<T> {
  return { ok: false, refusal: { code, message, venueText } };
}

// The chain a venue settles on, read through the page's own JSON-RPC port (eth_call, eth_getCode, eth_getStorageAt).
export interface ChainSession {
  readonly port: RpcPort;
  readonly guard: PinGuard;
}

// What an executor is built from. Tests pass fakes for every one of them.
export interface DirectDeps {
  // The one way an executor reaches a venue (direct/http.ts): https, the venue's own origin only, no cookies.
  readonly http: VenueHttp;
  readonly chain: (chainId: number) => ChainSession | null;
  // The visitor's venue credentials, per venue and wallet address, for this tab only (direct/credentials.ts).
  readonly store: CredentialStore;
  readonly nowMs: () => number;
  // Cryptographic randomness (an order's salt).
  readonly randomBytes: (length: number) => Uint8Array;
}

// The account that makes orders for a wallet on a venue: the wallet itself or a contract wallet it owns.
export interface DirectAccount {
  readonly venue: string;
  readonly chainId: number;
  // The wallet that signs (the connected address).
  readonly signer: Address;
  // The address the venue debits and credits.
  readonly maker: Address;
  // Fixed app words: "your wallet itself", "your Polymarket Safe", ...
  readonly label: string;
  readonly signatureType: number;
  // Whether the page can send this account's own transactions (approvals) through the wallet: only when the maker is
  // the wallet itself. A contract wallet's approvals are that contract's own transactions.
  readonly makerIsSigner: boolean;
}

export interface DirectReadiness {
  // Every account the chain shows this wallet can trade from here, preferred first. Never empty on success.
  readonly accounts: readonly DirectAccount[];
  // Fixed app words about what was read (another wallet kind found and not used, the EOA allowlist caution).
  readonly notes: readonly string[];
}

export interface DirectSession {
  readonly venue: string;
  readonly address: Address;
  // A short tag that names the credential without being any part of it.
  readonly keyTag: string;
}

// One row of the Signature Card: a field that will be signed (or, marked, one that travels beside the signature).
export interface CardField {
  readonly group: "domain" | "message" | "contents" | "wire";
  readonly name: string;
  // The exact value, as text (decimal for integers, hex for bytes and addresses).
  readonly value: string;
  // Fixed app words that decode it ("BUY", "52.00 pUSD", "your Polymarket Safe").
  readonly meaning: string | null;
}

export interface SignatureCardModel {
  // Fixed app words.
  readonly title: string;
  readonly lines: readonly string[];
  readonly fields: readonly CardField[];
  // What the wallet signs: the EIP-712 digest, and its first 16 hex digits as the tag to compare with the wallet's screen.
  // null for a transaction, whose call data is listed among the fields instead.
  readonly digest: Hex | null;
  readonly digestTag: string | null;
  // The most collateral that can leave the account for this item, in words; null when nothing can leave it.
  readonly worstCase: string | null;
}

// What prepareOrder returns: an opaque handle the executor recognises in placeOrder, with the card to show first.
export interface DirectPreparedOrder {
  readonly venue: string;
  readonly account: DirectAccount;
  readonly card: SignatureCardModel;
  readonly typedData: TypedDataDefinition;
  // The venue's id for the order once it is accepted (Polymarket: the order's EIP-712 hash).
  readonly orderId: Hex;
}

export interface DirectOrderAnswer {
  readonly orderId: string;
  // The venue's status word, cleaned to [a-z_]; "unknown" when it gave none.
  readonly status: string;
  // Any other words the venue added, as a stranger's text.
  readonly venueText: string | null;
}

export interface DirectOpenOrder {
  readonly id: string;
  readonly side: "BUY" | "SELL" | null;
  readonly price: string | null;
  readonly originalSize: string | null;
  readonly sizeMatched: string | null;
  readonly tokenId: string | null;
  readonly maker: string | null;
  // The venue's words, as a stranger's text.
  readonly status: string | null;
  readonly outcome: string | null;
}

export interface DirectOpenOrders {
  readonly orders: readonly DirectOpenOrder[];
  // True when the venue said more pages exist than the one shown.
  readonly more: boolean;
}

export interface DirectCancelAnswer {
  readonly canceled: readonly string[];
  // id -> the venue's reason, as a stranger's text.
  readonly notCanceled: ReadonlyArray<{ readonly id: string; readonly reason: string }>;
}

// A token approval the account needs before the venue can move its funds for an order.
export interface DirectApproval {
  readonly id: string;
  // Fixed app words: "pUSD allowance for the CTF Exchange".
  readonly label: string;
  readonly token: Address;
  readonly spender: Address;
  // Which side of an order needs it.
  readonly neededFor: "BUY" | "SELL";
  // true / false as read; null when the read failed (shown as unknown, never as granted).
  readonly granted: boolean | null;
  // The current allowance in base units, where the approval is an amount.
  readonly allowance: bigint | null;
}

export interface DirectFunding {
  readonly maker: Address;
  readonly collateralSymbol: string;
  readonly collateralDecimals: number;
  // The maker's collateral balance in base units; null when the read failed.
  readonly collateralBalance: bigint | null;
  // The maker's balance of the order's outcome token in base units; null when unknown or not asked.
  readonly shareBalance: bigint | null;
  readonly approvals: readonly DirectApproval[];
}

// A transaction the wallet is asked to send, with its card.
export interface DirectTransaction {
  readonly request: TransactionRequest;
  readonly card: SignatureCardModel;
}

export interface DirectExecutor<Input> {
  readonly venue: string;
  readonly chainId: number;
  ready(signer: WalletSigner): Promise<DirectResult<DirectReadiness>>;
  session(signer: WalletSigner): DirectSession | null;
  login(signer: WalletSigner): Promise<DirectResult<DirectSession>>;
  logout(signer: WalletSigner): void;
  prepareOrder(signer: WalletSigner, account: DirectAccount, input: Input): Promise<DirectResult<DirectPreparedOrder>>;
  placeOrder(signer: WalletSigner, prepared: DirectPreparedOrder): Promise<DirectResult<DirectOrderAnswer>>;
  openOrders(signer: WalletSigner, filter: { readonly market: string | null }): Promise<DirectResult<DirectOpenOrders>>;
  cancel(signer: WalletSigner, orderId: string): Promise<DirectResult<DirectCancelAnswer>>;
}
