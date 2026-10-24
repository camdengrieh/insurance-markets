// Polymarket trading for the trading account (docs/unified-account-design.md sections 1 and 3.1; note 45 section 9):
//
//   1. the owner check: E must be a plain key on Polygon, or an EIP-7702 delegation (code 0xef0100 + delegate). A
//      Deposit Wallet checks its owner's signatures with ECDSA only, so a wallet deployed for a contract owner could
//      never move its funds (note 45 section 7): nothing is deployed for one;
//   2. the Deposit Wallet: Polymarket's relayer deploys it through our markets API's mirror (WALLET-CREATE, no gas, no
//      signature in the body, so the request carries E's ownership proof), polled until Polymarket reports it final;
//      the wallet is then read from the chain at the address derived for E (maker.ts), never taken from the answer;
//   3. the approvals: ONE batch of the approvals the chain does not show yet (batch.ts), signed by E with the wallet's
//      DepositWallet/1 domain and relayed by Polymarket, polled until final. A stale batch nonce is signed once more
//      with the nonce the relayer names, as the official client does;
//   4. the order book sign-in: CLOB credentials derived from E's ClobAuth signature (executor.login), kept for this tab;
//      then the CLOB is asked to read the wallet's allowances again.
// Every step is read fresh in `status`; nothing is assumed from an earlier visit.

import { CLOB_CHAIN_IDS } from "@sdk/trade/clob/venues";
import { POLYMARKET_DEPOSIT_WALLET_FACTORY } from "@sdk/chain/xo/constants";
import { depositWalletProxyOf } from "@sdk/trade/clob/polymarket/deposit-wallet";
import { POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET } from "@sdk/trade/clob/venues";
import type { Address, Hex } from "viem";

import type { WalletSigner } from "../../../../core/signer";
import type { ActivationStatus, VenueActivation } from "../../../account/activation";
import type { BalanceLine, BalanceSource } from "../../../account/balances";
import type { TradingAccount } from "../../../account/types";
import { proofFor } from "../wallet";
import { ok, refuse, type DirectAccount, type DirectDeps, type DirectResult } from "../types";
import { checkedSignature, walletRefusal } from "../wallet";
import { approvalCall, BATCH_DEADLINE_S, depositWalletBatchDigest, depositWalletBatchTypedData, missingApprovals, walletBatchRequest, type BatchInput } from "./batch";
import type { PolymarketExecutor } from "./executor";
import { readPolymarketFunding } from "./funding";
import { readPolymarketAccounts } from "./maker";
import { onChainNonceOf, readBatchNonce, readSubmitted, readTransaction, relayerTransport, relayerWords, submitted, type PolymarketRelayerClient, type RelayerAnswer, type WalletCreateRequest } from "./relayer";

export const POLYGON = CLOB_CHAIN_IDS.polymarket;
export const POLYMARKET_NOT_AVAILABLE = "Polymarket trading is not available in this build: it names no markets API to relay through.";
export const STEP_CREATE = "Create your Polymarket wallet";
export const STEP_APPROVE = "Approve Polymarket's exchanges for your Polymarket wallet";
export const STEP_SIGN_IN = "Sign in to Polymarket's order book";
export const CONTRACT_OWNER =
  "Your trading address holds contract code on Polygon that is not an EIP-7702 delegation. A Polymarket wallet accepts only a plain key as its owner, so none is created for this address.";

const DELEGATED_CODE = /^0xef0100[0-9a-fA-F]{40}$/;

export interface PolymarketActivationOptions {
  readonly deps: DirectDeps;
  readonly executor: PolymarketExecutor;
  // null when this build names no markets API.
  readonly relayer: PolymarketRelayerClient | null;
  readonly sleep?: (ms: number) => Promise<void>;
  // Polling a relayer transaction: every pollIntervalMs, at most maxPolls times (default 3 s, 40 times: 2 minutes).
  readonly pollIntervalMs?: number;
  readonly maxPolls?: number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// The account the trading key trades from on Polymarket: its Deposit Wallet, when the chain shows one; null when none
// is deployed yet. A refusal when the chain cannot be read or shows something unusable.
export async function depositWalletAccount(deps: DirectDeps, owner: Address): Promise<DirectResult<DirectAccount | null>> {
  const read = await readPolymarketAccounts(deps.chain(POLYGON), owner);
  if (!read.ok) return read;
  return ok(read.value.accounts.find((account) => account.signatureType === POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET) ?? null);
}

// The Polymarket wallet's pUSD, read now, for the one balance. pUSD has 6 decimals and is worth one US dollar, so its
// base units are the line's dollar millionths. An unread balance is null, never zero; no wallet yet means nothing is
// held there.
export function polymarketBalanceSource(deps: DirectDeps): BalanceSource {
  return {
    id: "polymarket-wallet",
    async read(acct) {
      const line = (micros: bigint | null): BalanceLine[] => [{ id: "polymarket-pusd", label: "Polymarket wallet (pUSD)", micros }];
      const account = await depositWalletAccount(deps, acct.address);
      if (!account.ok) return line(null);
      if (account.value === null) return [];
      const funding = await readPolymarketFunding(deps.chain(POLYGON), account.value, "ctf", null);
      return line(funding.ok ? funding.value.collateralBalance : null);
    },
  };
}

// Whether E may own a Deposit Wallet: no code, or an EIP-7702 delegation.
async function ownerCheck(deps: DirectDeps, owner: Address): Promise<DirectResult<void>> {
  const chain = deps.chain(POLYGON);
  if (chain === null) return refuse("chain_unreadable", "This build names no Polygon RPC, so your Polymarket account cannot be read.");
  let code: Hex;
  try {
    code = await chain.port.getCode(owner);
  } catch {
    return refuse("chain_unreadable", "This page could not read your trading address on Polygon. Read again in a moment.");
  }
  return code === "0x" || DELEGATED_CODE.test(code) ? ok(undefined) : refuse("account_refused", CONTRACT_OWNER);
}

function submitRefusal<T>(answer: RelayerAnswer, what: string): DirectResult<T> {
  if (answer.status === 429) return refuse("venue_refused", `Polymarket's relayer is at its daily limit for this site, so ${what} was not done. Try again later.`, relayerWords(answer));
  if (answer.status === 401 || answer.status === 403) return refuse("venue_refused", `Our markets API did not accept this account's proof for ${what} (HTTP ${answer.status}). Check this computer's clock, then try again.`, relayerWords(answer));
  if (answer.status >= 500) return refuse("venue_ambiguous", `No usable answer came back for ${what} (HTTP ${answer.status}). Check your account again before trying once more.`, relayerWords(answer));
  return refuse("venue_refused", `Polymarket's relayer did not accept ${what} (HTTP ${answer.status}).`, relayerWords(answer));
}

export function polymarketActivation(options: PolymarketActivationOptions): VenueActivation {
  const { deps, executor, relayer } = options;
  const sleep = options.sleep ?? defaultSleep;
  const interval = options.pollIntervalMs ?? 3_000;
  const polls = options.maxPolls ?? 40;

  // Polls a submitted relayer transaction until Polymarket reports it final.
  async function settle(client: PolymarketRelayerClient, id: string, what: string): Promise<DirectResult<void>> {
    for (let attempt = 0; attempt < polls; attempt += 1) {
      await sleep(interval);
      let answer: RelayerAnswer;
      try {
        answer = await client.transaction(id);
      } catch {
        continue;
      }
      const transaction = answer.status === 200 ? readTransaction(answer.json) : null;
      if (transaction === null) continue;
      if (transaction.state === "confirmed") return ok(undefined);
      if (transaction.state === "failed") return refuse("venue_refused", `Polymarket's relayer reports ${what} as ${transaction.word.toLowerCase().replace(/^state_/, "")}. Nothing changed on chain.`);
    }
    return refuse("venue_ambiguous", `Polymarket's relayer took ${what} but did not report it final within ${Math.round((interval * polls) / 1000)} seconds. Check your account again before trying once more.`);
  }

  async function deploy(client: PolymarketRelayerClient, signer: WalletSigner): Promise<DirectResult<DirectAccount>> {
    const request: WalletCreateRequest = { type: "WALLET-CREATE", from: signer.address, to: POLYMARKET_DEPOSIT_WALLET_FACTORY, metadata: "Deploy Deposit Wallet" };
    const body = JSON.stringify(request);
    const proof = await proofFor(signer, { method: "POST", path: client.submitPath, body }, deps.nowMs());
    if (!proof.ok) return proof;
    const sent = await submitted(client, body, proof.value, "creating your Polymarket wallet");
    if (!sent.ok) return sent;
    if (sent.value.status < 200 || sent.value.status >= 300) return submitRefusal(sent.value, "creating your Polymarket wallet");
    const id = readSubmitted(sent.value.json);
    if (id === null) return refuse("venue_ambiguous", "Polymarket's relayer answered without a transaction id, so whether your wallet is being created is not known. Check your account again.", relayerWords(sent.value));
    const settled = await settle(client, id, "creating your Polymarket wallet");
    if (!settled.ok) return settled;
    const account = await depositWalletAccount(deps, signer.address);
    if (!account.ok) return account;
    if (account.value === null || depositWalletProxyOf(signer.address, account.value.maker) === null) {
      return refuse("venue_ambiguous", "Polymarket reports the wallet as created, but the chain does not show it at the address derived for your account yet. Check again in a moment.");
    }
    return ok(account.value);
  }

  async function approve(client: PolymarketRelayerClient, signer: WalletSigner, account: DirectAccount, starting: () => void): Promise<DirectResult<boolean>> {
    const missing = await missingApprovals(deps.chain(POLYGON), account.maker);
    if (!missing.ok) return missing;
    if (missing.value.length === 0) return ok(false);
    starting();
    let paramsAnswer: RelayerAnswer;
    try {
      paramsAnswer = await client.params(signer.address);
    } catch (error) {
      return relayerTransport(error, "your Polymarket wallet's next batch number");
    }
    const nonce = paramsAnswer.status === 200 ? readBatchNonce(paramsAnswer.json) : null;
    if (nonce === null) return refuse("venue_refused", "Polymarket's relayer did not give your wallet's next batch number, so no approval was signed.", relayerWords(paramsAnswer));
    const batch: BatchInput = { wallet: account.maker, nonce, deadline: BigInt(Math.floor(deps.nowMs() / 1000) + BATCH_DEADLINE_S), calls: missing.value.map(approvalCall) };
    let answer = await sendBatch(client, signer, batch);
    if (!answer.ok) return answer;
    const onChain = onChainNonceOf(answer.value);
    if (onChain !== null && onChain !== nonce) {
      // The relayer refused the batch for its number alone: nothing ran. Signed once more with the number it named.
      answer = await sendBatch(client, signer, { ...batch, nonce: onChain });
      if (!answer.ok) return answer;
    }
    if (answer.value.status < 200 || answer.value.status >= 300) return submitRefusal(answer.value, "the approvals");
    const id = readSubmitted(answer.value.json);
    if (id === null) return refuse("venue_ambiguous", "Polymarket's relayer answered without a transaction id, so whether the approvals are being made is not known. Check your account again.", relayerWords(answer.value));
    const settled = await settle(client, id, "the approvals");
    return settled.ok ? ok(true) : settled;
  }

  async function sendBatch(client: PolymarketRelayerClient, signer: WalletSigner, batch: BatchInput): Promise<DirectResult<RelayerAnswer>> {
    let raw: Hex;
    try {
      raw = await signer.signTypedData(depositWalletBatchTypedData(batch));
    } catch (error) {
      return walletRefusal(error, "the approvals");
    }
    const signature = await checkedSignature(signer, depositWalletBatchDigest(batch), raw);
    if (!signature.ok) return signature;
    const body = JSON.stringify(walletBatchRequest(signer.address, batch, signature.value, "Approve Polymarket exchanges"));
    return submitted(client, body, null, "the approvals");
  }

  return {
    venue: "polymarket",
    async status(acct): Promise<ActivationStatus> {
      if (relayer === null) return { state: "unavailable", reason: POLYMARKET_NOT_AVAILABLE };
      const owner = await ownerCheck(deps, acct.address);
      if (!owner.ok) return { state: "unavailable", reason: owner.refusal.message };
      const account = await depositWalletAccount(deps, acct.address);
      if (!account.ok) return { state: "unavailable", reason: account.refusal.message };
      const signIn = executor.session(acct.signer) === null ? [STEP_SIGN_IN] : [];
      if (account.value === null) return { state: "needs_activation", steps: [STEP_CREATE, STEP_APPROVE, ...signIn] };
      const missing = await missingApprovals(deps.chain(POLYGON), account.value.maker);
      if (!missing.ok) return { state: "unavailable", reason: missing.refusal.message };
      const steps = [...(missing.value.length > 0 ? [STEP_APPROVE] : []), ...signIn];
      return steps.length === 0 ? { state: "ready" } : { state: "needs_activation", steps };
    },

    async activate(acct: TradingAccount, progress): Promise<DirectResult<void>> {
      if (relayer === null) return refuse("venue_unreachable", POLYMARKET_NOT_AVAILABLE);
      const signer = acct.signer;
      const owner = await ownerCheck(deps, acct.address);
      if (!owner.ok) return owner;
      const found = await depositWalletAccount(deps, acct.address);
      if (!found.ok) return found;
      let account = found.value;
      if (account === null) {
        progress(STEP_CREATE);
        const deployed = await deploy(relayer, signer);
        if (!deployed.ok) return deployed;
        account = deployed.value;
      }
      const approved = await approve(relayer, signer, account, () => progress(STEP_APPROVE));
      if (!approved.ok) return approved;
      if (executor.session(signer) === null) {
        progress(STEP_SIGN_IN);
        const session = await executor.login(signer);
        if (!session.ok) return session;
      }
      // The CLOB keeps its own copy of a wallet's allowances; it is asked to read them again. Its answer changes nothing.
      if (approved.value) await executor.refreshAllowances(signer, account);
      return ok(undefined);
    },
  };
}
