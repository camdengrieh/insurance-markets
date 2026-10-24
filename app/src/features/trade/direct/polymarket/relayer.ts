// The page's side of our markets API's Polymarket relayer mirror and bridge route (docs/unified-account-design.md
// section 3.2): Polymarket's relayer (relayer-v2.polymarket.com) with OUR Builder credentials added by the server, which
// never reach the browser, so the visitor pays no gas and pastes no key (note 45 sections 1 and 2):
//
//   POST submit                                  WALLET-CREATE (deploy the Deposit Wallet; no signature in the body, so
//                                                the request carries the x-im-proof header, features/account/proof.ts) and WALLET
//                                                (a batch the owner signed with the wallet's DepositWallet/1 domain);
//   GET  v1/account/transactions/params          the batch nonce for the owner (?address=<owner>&type=WALLET);
//   GET  v1/account/transactions/<id>            a submitted transaction's state (STATE_CONFIRMED, STATE_FAILED,
//                                                STATE_INVALID are final; WALLET-CREATE answers the wallet as
//                                                proxyAddress);
//   POST /v1/relay/polymarket-bridge/deposit     the deposit addresses that credit the Deposit Wallet with pUSD.
//
// Every call goes through the direct path's one network door (../http.ts). Answers are read field by field; nothing is
// retried here: a submit that got no answer is "unknown" to the caller.

import { getAddress, type Address, type Hex } from "viem";

import { isVenueHttpError, type VenueHttp } from "../http";
import { PROOF_HEADER } from "../../../account/proof";
import { venueText } from "../text";
import { ok, refuse, type DirectResult } from "../types";

export const POLYMARKET_RELAY_PATH = "/v1/relay/polymarket";
export const POLYMARKET_BRIDGE_PATH = "/v1/relay/polymarket-bridge";

export interface RelayerAnswer {
  readonly status: number;
  readonly text: string;
  readonly json: unknown;
}

export interface WalletCall {
  readonly target: Address;
  readonly value: string;
  readonly data: Hex;
}

export interface WalletCreateRequest {
  readonly type: "WALLET-CREATE";
  readonly from: Address;
  readonly to: Address;
  readonly metadata: string;
}

export interface WalletBatchRequest {
  readonly type: "WALLET";
  readonly from: Address;
  readonly to: Address;
  readonly nonce: string;
  readonly signature: Hex;
  readonly metadata: string;
  readonly depositWalletParams: { readonly depositWallet: Address; readonly deadline: string; readonly calls: readonly WalletCall[] };
}

export interface PolymarketRelayerClient {
  readonly origin: string;
  // Our API's path of the submit route, which the deploy's ownership proof names.
  readonly submitPath: string;
  submit(body: string, proof: string | null): Promise<RelayerAnswer>;
  params(owner: Address): Promise<RelayerAnswer>;
  transaction(id: string): Promise<RelayerAnswer>;
  deposit(wallet: Address): Promise<RelayerAnswer>;
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function createPolymarketRelayerClient(http: VenueHttp, origin: string): PolymarketRelayerClient {
  async function send(method: "GET" | "POST", path: string, body?: string, proof?: string | null): Promise<RelayerAnswer> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (proof !== undefined && proof !== null) headers[PROOF_HEADER] = proof;
    const answer = await http({ method, url: `${origin}${path}`, headers, ...(body === undefined ? {} : { body }) });
    return { status: answer.status, text: answer.text, json: parsed(answer.text) };
  }
  return {
    origin,
    submitPath: `${POLYMARKET_RELAY_PATH}/submit`,
    submit: (body, proof) => send("POST", `${POLYMARKET_RELAY_PATH}/submit`, body, proof),
    params: (owner) => send("GET", `${POLYMARKET_RELAY_PATH}/v1/account/transactions/params?${new URLSearchParams({ address: owner, type: "WALLET" }).toString()}`),
    transaction: (id) => send("GET", `${POLYMARKET_RELAY_PATH}/v1/account/transactions/${encodeURIComponent(id)}`),
    deposit: (wallet) => send("POST", `${POLYMARKET_BRIDGE_PATH}/deposit`, JSON.stringify({ address: wallet })),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// The relayer's own words in an answer ({error}, {message}, or the body), cleaned.
export function relayerWords(answer: RelayerAnswer): string | null {
  const body = record(answer.json);
  for (const key of ["error", "message", "errorMsg"]) {
    const value = body?.[key];
    if (typeof value === "string") return venueText(value);
    const nested = record(value)?.["message"];
    if (typeof nested === "string") return venueText(nested);
  }
  return venueText(answer.text);
}

export function relayerTransport<T>(error: unknown, what: string): DirectResult<T> {
  if (isVenueHttpError(error) && error.code === "timeout") return refuse("venue_unreachable", `Our markets API did not answer in time for ${what}.`);
  return refuse("venue_unreachable", `Our markets API could not be reached for ${what}.`);
}

const TRANSACTION_ID = /^[A-Za-z0-9-]{1,100}$/;

// POST submit: {transactionID, state} (the official client reads transactionId too).
export function readSubmitted(json: unknown): string | null {
  const body = record(json);
  const id = body?.["transactionID"] ?? body?.["transactionId"];
  return typeof id === "string" && TRANSACTION_ID.test(id) ? id : null;
}

export type RelayerState = "pending" | "confirmed" | "failed";

export interface RelayerTransaction {
  readonly state: RelayerState;
  // The venue's state word, cleaned to [A-Z_].
  readonly word: string;
  readonly proxyAddress: Address | null;
  readonly transactionHash: Hex | null;
}

// GET transactions/<id>: one record, or a one-element array (the older /transaction route's form).
export function readTransaction(json: unknown): RelayerTransaction | null {
  const row = record(Array.isArray(json) ? json[0] : json);
  const state = row?.["state"];
  if (row === null || typeof state !== "string" || !/^STATE_[A-Z_]{1,30}$/.test(state)) return null;
  const proxy = row["proxyAddress"];
  const hash = row["transactionHash"];
  return {
    state: state === "STATE_CONFIRMED" ? "confirmed" : state === "STATE_FAILED" || state === "STATE_INVALID" ? "failed" : "pending",
    word: state,
    proxyAddress: typeof proxy === "string" && /^0x[0-9a-fA-F]{40}$/.test(proxy) ? getAddress(proxy) : null,
    transactionHash: typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash) ? (hash as Hex) : null,
  };
}

// GET params: {address, nonce}, the nonce a decimal string.
export function readBatchNonce(json: unknown): bigint | null {
  const nonce = record(json)?.["nonce"];
  const text = typeof nonce === "number" && Number.isSafeInteger(nonce) && nonce >= 0 ? String(nonce) : nonce;
  return typeof text === "string" && /^[0-9]{1,30}$/.test(text) ? BigInt(text) : null;
}

// 400 "batch nonce N does not match on-chain nonce M": M, the nonce to sign again with (the official client does the same).
export function onChainNonceOf(answer: RelayerAnswer): bigint | null {
  if (answer.status !== 400) return null;
  const match = /batch nonce\s+\d+\s+does not match on-chain nonce\s+(\d+)/i.exec(answer.text);
  return match?.[1] === undefined ? null : BigInt(match[1]);
}

// POST bridge/deposit: {address: {evm, svm, btc, ...}, note}. Only the EVM address is used (Base USDC is sent there).
export function readEvmDepositAddress(json: unknown): Address | null {
  const body = record(json);
  const nested = record(body?.["address"]);
  const evm = nested?.["evm"] ?? body?.["evm"];
  return typeof evm === "string" && /^0x[0-9a-fA-F]{40}$/.test(evm) ? getAddress(evm) : null;
}

export async function submitted(client: PolymarketRelayerClient, body: string, proof: string | null, what: string): Promise<DirectResult<RelayerAnswer>> {
  try {
    return ok(await client.submit(body, proof));
  } catch (error) {
    if (isVenueHttpError(error) && error.code === "not_allowed") return relayerTransport(error, what);
    return refuse("venue_ambiguous", `The request for ${what} was sent but no answer came back from our markets API. Check your account again before trying once more.`);
  }
}
