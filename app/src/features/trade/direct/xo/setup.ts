// Setting up the visitor's XO account from this page: deploy it (when it has no code yet) and enable trading, in ONE
// ERC-4337 user operation that the visitor's own wallet signs. It is the server-side flow (relay/userops.ts prepare and
// submit) run in the browser, with the same shared builders and checks:
//
//   1. the action follows from the account's code: no code -> deploy_enable_trading (initCode, first-operation nonce);
//      code -> enable_trading (EntryPoint.getNonce in the default root lane, read with eth_call on XO's chain);
//   2. the calls are Enable Trading's two approvals (sdk/trade/xo/userop/calls.ts enableTradingCalls): USDC.e approve to
//      the CTF exchange (unlimited, as XO's own app, or capped at an amount the visitor types) and the conditional
//      tokens' setApprovalForAll to the exchange;
//   3. the PolicyPaymaster sponsors only after paused() and checkPolicy() say so, read on chain; a deployment is never
//      sent without it, an existing account goes without one (UO7, as the relay does);
//   4. gas: the observed defaults with the paymaster's per-call headroom, then the bundler's estimate when it answers
//      (applyBundlerEstimate, +30% call gas); fees are zero on XO's chain, so no fee is read or paid;
//   5. prepareUserOp packs the operation and hashes it; the card decodes every call back from the call data with the
//      relay's own shape check (assertOperationShape) and recomputes the userOpHash before the visitor decides;
//   6. the wallet signs the 32-byte userOpHash with personal_sign (EIP-191 over the raw bytes, signer.signRawMessage),
//      which is what XO's own app does and what the account's ECDSA validator accepts; the signature must recover to
//      the connected owner over that EIP-191 digest (verifyUserOpSignature) before anything is sent;
//   7. ONE eth_sendUserOperation through the markets API's bundler relay (XO's bundler sends no CORS headers); the
//      bundler's hash must equal ours. Nothing is retried: a send that got no clear answer is "ambiguous" and is settled
//      by its hash, never sent again;
//   8. the receipt is polled a bounded number of times; then the caller reads the account again.
//
// Registration with XO's order book is not part of this: no call registers an account
// (docs/research/19-smart-account-derivation.md section 6). XO does it on its side, seen after an account enables
// trading and logs in; the panel says so and reads it again.

import { decodeFunctionResult, encodeFunctionData, getAddress, hashMessage, type Address, type Hex } from "viem";

import { POLICY_PAYMASTER_ABI } from "@sdk/chain/xo/abi";
import { CONDITIONAL_TOKENS, CTF_EXCHANGE, ENTRY_POINT_V07, KERNEL_FACTORY, POLICY_PAYMASTER, USDC_E_ADDRESS, USDC_E_DECIMALS, XO_CHAIN_ID } from "@sdk/chain/xo/constants";
import { parseDecimalAtomic } from "@sdk/money/amount";
import { buildInitCode, deriveAccount } from "@sdk/trade/xo/account/derive";
import { formatMicro } from "@sdk/trade/xo/amounts";
import { enableTradingCalls, type DecodedCall } from "@sdk/trade/xo/userop/calls";
import { decodeExecute, UserOpError, type Call } from "@sdk/trade/xo/userop/encode";
import { applyBundlerEstimate, defaultGasFor, withPaymasterHeadroom, type GasPlan } from "@sdk/trade/xo/userop/gas";
import { userOpHash } from "@sdk/trade/xo/userop/hash";
import { decodeGetNonceResult, firstOpNonce, getNonceCallData } from "@sdk/trade/xo/userop/nonce";
import { unpackUserOp, type PackedUserOp } from "@sdk/trade/xo/userop/pack";
import { assertOperationShape, prepareUserOp, type PreparedUserOp } from "@sdk/trade/xo/userop/sign";
import { verifyUserOpSignature } from "@sdk/trade/xo/userop/verify";
import { BundlerClient, BundlerError, type BundlerHttpResponse, type BundlerTransport, type UserOperationReceipt } from "@shared/xo/userop/bundler";

import { WalletError, type WalletSigner } from "../../../../core/signer";
import type { XoReadiness } from "./readiness";
import { RelayError, type XoRelayClient } from "./relay";
import type { CardCheck, CardRow } from "./signing";
import { walletWords, type ActionResult, type VenueAnswer } from "./trader";

export type SetupAction = "deploy_enable_trading" | "enable_trading";

// The USDC.e allowance the exchange gets. Unlimited is what XO's own Enable Trading sets; a cap is what the visitor
// typed, in micro USDC.e. Nothing is chosen for the visitor.
export type AllowanceChoice = { readonly kind: "unlimited" } | { readonly kind: "capped"; readonly amountMicro: bigint };

// A cap typed by the visitor, as micro USDC.e, or why it is not one.
export function parseAllowanceCap(text: string): { readonly ok: true; readonly amountMicro: bigint } | { readonly ok: false; readonly words: string } {
  const parsed = parseDecimalAtomic(text.trim(), USDC_E_DECIMALS);
  if (!parsed.ok) return { ok: false, words: `The allowance is not an amount: ${parsed.reason}.` };
  if (parsed.value === 0n) return { ok: false, words: "An allowance of zero would leave trading disabled." };
  return { ok: true, amountMicro: parsed.value };
}

// What the account needs, from a fresh read: null when nothing is needed or the read does not say (an unknown is never
// guessed into an operation).
export function setupActionFor(r: XoReadiness): SetupAction | null {
  if (r.deployed === "no") return "deploy_enable_trading";
  if (r.deployed !== "yes" || r.allowanceMicro === null || r.sellApproved === null) return null;
  return r.allowanceMicro > 0n && r.sellApproved ? null : "enable_trading";
}

export const RAW_SIGNING_WORDS =
  "This wallet connection cannot sign a 32-byte message (personal_sign of raw bytes), which is how an XO account is deployed and trading is enabled. PayBox over WalletConnect signs text only. Connect a browser wallet to set up the account here.";

// ---- the card ------------------------------------------------------------------------------------------------------------

export interface SetupCallView {
  // "USDC.e" or "Conditional Tokens", then the address.
  readonly target: string;
  readonly targetAddress: Address;
  readonly fn: string;
  readonly args: readonly CardRow[];
  // An approval of 2^256 - 1 (or anything at least half of it): marked on the card in words that say what it allows.
  readonly unlimited: boolean;
}

export interface XoSetupCard {
  readonly kind: "setup";
  readonly action: SetupAction;
  readonly title: string;
  readonly owner: Address;
  readonly account: Address;
  readonly rows: readonly CardRow[];
  readonly calls: readonly SetupCallView[];
  // The 32 bytes the wallet signs as a message, and the EIP-191 digest the signature is over.
  readonly userOpHash: Hex;
  readonly eip191Digest: Hex;
  readonly checks: readonly CardCheck[];
  // Fixed app words about what is not proven or not used (no paymaster, a capped allowance, the gas source).
  readonly notes: readonly string[];
}

const HALF_UINT256 = 1n << 255n;

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function named(address: string): string {
  if (same(address, CTF_EXCHANGE)) return `the CTF exchange ${getAddress(address)}`;
  return getAddress(address);
}

function callView(call: Call, decoded: DecodedCall): SetupCallView {
  if (decoded.kind === "usdce_approve") {
    const unlimited = decoded.amount >= HALF_UINT256;
    return {
      target: `USDC.e ${getAddress(USDC_E_ADDRESS)}`,
      targetAddress: getAddress(call.to),
      fn: "approve(address spender, uint256 amount)",
      args: [
        { label: "spender", value: named(decoded.spender) },
        {
          label: "amount",
          value: unlimited
            ? `UNLIMITED (${decoded.amount.toString()}): the exchange may move every USDC.e this account holds, now and later, until the approval is revoked`
            : `${formatMicro(decoded.amount)} USDC.e (${decoded.amount.toString()} micro)`,
        },
      ],
      unlimited,
    };
  }
  if (decoded.kind === "ctf_set_approval_for_all") {
    return {
      target: `Conditional Tokens ${getAddress(CONDITIONAL_TOKENS)}`,
      targetAddress: getAddress(call.to),
      fn: "setApprovalForAll(address operator, bool approved)",
      args: [
        { label: "operator", value: named(decoded.operator) },
        { label: "approved", value: decoded.approved ? "true: the exchange may move every outcome share this account holds, to settle its orders" : "false" },
      ],
      unlimited: decoded.approved,
    };
  }
  // assertActionShape admits only the two calls above for these actions; anything else stops before a card.
  throw new UserOpError("forbidden_call", "not an Enable Trading call");
}

export interface SetupCardContext {
  readonly sponsored: boolean;
  readonly notes: readonly string[];
}

// The card for a prepared operation. Everything shown is decoded again from the packed operation (not from what was
// asked for), and the checks run the relay's own code on it.
export function setupCard(owner: Address, built: PreparedUserOp, context: SetupCardContext): XoSetupCard {
  const op = built.op;
  const fields = unpackUserOp(op);
  let derived: Address | null = null;
  try {
    derived = deriveAccount(owner);
  } catch {
    derived = null;
  }
  let decoded: readonly DecodedCall[] | null = null;
  try {
    decoded = assertOperationShape(op, { action: built.action, owner });
  } catch {
    decoded = null;
  }
  const calls = decodeExecute(op.callData).calls;
  const views: SetupCallView[] = decoded === null ? [] : calls.map((call, index) => callView(call, decoded[index] as DecodedCall));
  const enableShape =
    decoded !== null &&
    decoded.length === 2 &&
    decoded[0]?.kind === "usdce_approve" &&
    same(decoded[0].spender, CTF_EXCHANGE) &&
    decoded[1]?.kind === "ctf_set_approval_for_all" &&
    same(decoded[1].operator, CTF_EXCHANGE) &&
    decoded[1].approved &&
    calls.length === 2 &&
    same(calls[0]?.to ?? "", USDC_E_ADDRESS) &&
    same(calls[1]?.to ?? "", CONDITIONAL_TOKENS);
  const deploys = op.initCode !== "0x";
  const recomputed = userOpHash(op);
  const checks: CardCheck[] = [
    { label: "The sender is the XO account derived from the connected wallet", pass: derived !== null && same(derived, op.sender) && same(derived, built.account) },
    { label: "It passes the relay's own check: the closed call list, the factory call for this owner, the default nonce lane, zero fees and the paymaster's policy", pass: decoded !== null },
    { label: "The calls decoded from the call data are exactly Enable Trading: USDC.e approve and the outcome shares' setApprovalForAll, both to the CTF exchange", pass: enableShape },
    {
      label: deploys ? "The initCode deploys exactly this account (the Kernel factory call for this owner), with the first-operation nonce" : "No initCode: the account already has code",
      pass: deploys ? built.action === "deploy_enable_trading" && op.initCode === buildInitCode(owner) && op.nonce === firstOpNonce() : built.action === "enable_trading",
    },
    { label: "Fees are zero: nothing is paid from your wallet or the account", pass: fields.maxFeePerGas === 0n && fields.maxPriorityFeePerGas === 0n },
    { label: "The userOpHash was recomputed here from the fields shown (EntryPoint v0.7, chain 3223)", pass: same(recomputed, built.userOpHash) },
  ];
  const gas = built.plan;
  const rows: CardRow[] = [
    { label: "Action", value: deploys ? "Deploy your XO account and enable trading, in one user operation" : "Enable trading on your XO account, in one user operation" },
    { label: "Owner (this wallet, signs)", value: owner },
    { label: "XO account (the sender)", value: getAddress(op.sender) },
    { label: "Deploys the account", value: deploys ? `yes: through the Kernel factory ${KERNEL_FACTORY} (initCode ${(op.initCode.length - 2) / 2} bytes)` : "no: it already has code" },
    { label: "Nonce", value: op.nonce.toString() },
    { label: "Paymaster", value: fields.paymaster === null ? "none" : `XO's PolicyPaymaster ${POLICY_PAYMASTER} sponsors the gas` },
    { label: "Fees", value: `maxFeePerGas ${fields.maxFeePerGas.toString()}, maxPriorityFeePerGas ${fields.maxPriorityFeePerGas.toString()}` },
    {
      label: "Gas limits",
      value: `verification ${fields.verificationGasLimit.toString()}, call ${fields.callGasLimit.toString()}, preVerification ${fields.preVerificationGas.toString()} (${gas.source === "estimate" ? "the bundler's estimate, +30% call gas" : "observed defaults"})`,
    },
    { label: "EntryPoint and chain", value: `${ENTRY_POINT_V07} (v0.7), XO chain ${XO_CHAIN_ID}` },
  ];
  return {
    kind: "setup",
    action: built.action as SetupAction,
    title: deploys ? "Set up your XO account (deploy and enable trading)" : "Enable trading on your XO account",
    owner,
    account: built.account,
    rows,
    calls: views,
    userOpHash: built.userOpHash,
    eip191Digest: hashMessage({ raw: built.userOpHash }),
    checks,
    notes: [...context.notes],
  };
}

export function setupCardPasses(card: XoSetupCard): boolean {
  return card.checks.every((check) => check.pass) && card.calls.length > 0;
}

// ---- the bundler, through the relay ---------------------------------------------------------------------------------------

// What the relay said about the last bundler request, so a failed send can be told apart: refused before anything left
// the relay (nothing was sent), or no clear answer (it may have reached the bundler).
type LastExchange = { readonly kind: "bundler" } | { readonly kind: "not_sent"; readonly status: number } | { readonly kind: "unknown"; readonly words: string };

// The relay's own refusals that are given before it sends anything upstream (api/xo-relay.ts).
const REFUSED_BEFORE_SENDING: ReadonlySet<string> = new Set(["relay_not_enabled", "origin_not_allowed", "uri_too_long", "invalid_request", "not_found", "method_not_allowed", "unsupported_media_type", "payload_too_large", "rate_limited"]);

function relayCodeOf(json: unknown): string | null {
  const error = typeof json === "object" && json !== null ? (json as { error?: { code?: unknown } }).error : undefined;
  return typeof error?.code === "string" ? error.code : null;
}

class RelayBundlerTransport implements BundlerTransport {
  last: LastExchange | null = null;
  readonly #relay: XoRelayClient;

  constructor(relay: XoRelayClient) {
    this.#relay = relay;
  }

  async postJson(url: string, body: unknown): Promise<BundlerHttpResponse> {
    this.last = null;
    if (new URL(url).toString() !== new URL(this.#relay.bundlerUrl()).toString()) {
      this.last = { kind: "not_sent", status: 0 };
      throw new RangeError("The bundler client named another address than the relay's bundler route.");
    }
    let answer;
    try {
      answer = await this.#relay.bundler(JSON.stringify(body));
    } catch (error) {
      this.last = { kind: "unknown", words: error instanceof RelayError ? error.message : "The relay could not be reached." };
      throw error;
    }
    if (answer.from === "relay") {
      const code = relayCodeOf(answer.json);
      this.last = code !== null && REFUSED_BEFORE_SENDING.has(code) ? { kind: "not_sent", status: answer.status } : { kind: "unknown", words: `The relay answered HTTP ${answer.status} without XO's answer.` };
      throw new Error("relay refusal");
    }
    this.last = { kind: "bundler" };
    return { status: answer.status, body: answer.json === undefined ? answer.text : answer.json };
  }
}

// ---- the flow --------------------------------------------------------------------------------------------------------------

export interface ChainCall {
  readonly to: Address;
  readonly data: Hex;
}

export interface XoSetupOptions {
  readonly signer: WalletSigner;
  readonly relay: XoRelayClient;
  // eth_call on XO's chain, one answer per call (null where that call failed or reverted); throws when the chain
  // cannot be reached at all.
  readonly call: (calls: readonly ChainCall[]) => Promise<ReadonlyArray<Hex | null>>;
  // The Signature Card: resolves true only when the visitor chose to sign.
  readonly confirm: (card: XoSetupCard) => Promise<boolean>;
  readonly sleep?: (ms: number) => Promise<void>;
  // Receipt polling: every pollIntervalMs, at most maxPolls times (default 3 s, 30 times: 90 seconds).
  readonly pollIntervalMs?: number;
  readonly maxPolls?: number;
}

export interface SetupValue {
  readonly userOpHash: Hex;
}

const refused = <T>(words: string, answer: VenueAnswer | null = null): ActionResult<T> => ({ state: "refused", words, answer });

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type Sponsorship = { readonly ok: true } | { readonly ok: false; readonly why: string };

export class XoAccountSetup {
  readonly owner: Address;
  readonly account: Address;
  readonly #options: XoSetupOptions;
  readonly #transport: RelayBundlerTransport;
  readonly #bundler: BundlerClient;

  constructor(options: XoSetupOptions) {
    this.#options = options;
    this.owner = getAddress(options.signer.address);
    this.account = getAddress(deriveAccount(this.owner));
    this.#transport = new RelayBundlerTransport(options.relay);
    this.#bundler = new BundlerClient({ transport: this.#transport, url: options.relay.bundlerUrl() });
  }

  // Steps 1 to 5: everything up to the card, with no signature asked for.
  async prepare(readiness: XoReadiness, allowance: AllowanceChoice): Promise<{ readonly ok: true; readonly built: PreparedUserOp; readonly card: XoSetupCard } | { readonly ok: false; readonly result: ActionResult<never> }> {
    if (!this.#options.signer.capabilities.rawMessage) return { ok: false, result: refused(RAW_SIGNING_WORDS) };
    if (!same(readiness.owner, this.owner) || !same(readiness.account, this.account)) return { ok: false, result: refused("The account read belongs to another wallet; read the account again.") };
    const action = setupActionFor(readiness);
    if (action === null) return { ok: false, result: refused("The last read does not show anything to set up, or could not say. Read the account again.") };
    const deployed = action === "enable_trading";
    const notes: string[] = [];

    // 1. The nonce.
    let nonce: bigint;
    if (!deployed) nonce = firstOpNonce();
    else {
      try {
        const [raw] = await this.#options.call([{ to: ENTRY_POINT_V07, data: getNonceCallData(this.account) }]);
        if (raw === null || raw === undefined) return { ok: false, result: refused("The account's next nonce could not be read from XO's chain, so no operation was built.") };
        nonce = decodeGetNonceResult(raw);
      } catch {
        return { ok: false, result: refused("XO's chain could not be reached to read the account's nonce, so no operation was built.") };
      }
    }

    // 2. The calls.
    const calls = enableTradingCalls(allowance.kind === "capped" ? { allowance: allowance.amountMicro } : {});
    if (allowance.kind === "capped") notes.push("The allowance is capped at the amount you typed. A capped allowance has not been proven with XO's exchange yet (T8): an order above the cap would be refused, and you would enable trading again with a larger one.");
    else notes.push("The USDC.e allowance is unlimited, as XO's own Enable Trading sets it: it exposes the account's whole USDC.e balance to the exchange, including after a future exchange upgrade.");

    // 3. Sponsorship.
    const sponsorship = await this.#sponsorship(calls);
    const sponsor = sponsorship.ok;
    if (!sponsorship.ok) {
      if (!deployed) return { ok: false, result: refused(`XO's paymaster will not sponsor the deployment (${sponsorship.why}), and a deployment is never sent without it. Nothing was built.`) };
      notes.push(`No paymaster is used (${sponsorship.why}). The operation goes out at zero fee without one; whether XO's bundler accepts that is not proven (UO8).`);
    }

    // 4 and 5. Gas, then the operation.
    let built: PreparedUserOp;
    try {
      let plan: GasPlan = withPaymasterHeadroom(defaultGasFor(action), calls.length, sponsor);
      built = prepareUserOp({ action, owner: this.owner, suppliedAccount: this.account, calls, nonce, deployed, sponsor, gas: plan });
      const estimate = await this.#bundler.estimateUserOperationGas(built.op).catch(() => null);
      if (estimate === null) notes.push("XO's bundler gave no gas estimate, so the observed limits of real operations are used (zero fees: a high limit costs nothing).");
      else {
        plan = withPaymasterHeadroom(applyBundlerEstimate(built.plan, estimate, { allow: true }), calls.length, sponsor);
        built = prepareUserOp({ action, owner: this.owner, suppliedAccount: this.account, calls, nonce, deployed, sponsor, gas: plan });
      }
    } catch (error) {
      return { ok: false, result: refused(error instanceof UserOpError ? `The operation could not be built: ${error.message}.` : "The operation could not be built.") };
    }
    return { ok: true, built, card: setupCard(this.owner, built, { sponsored: sponsor, notes }) };
  }

  // paused() and checkPolicy(account, target, selector) for each distinct call, read on XO's chain. Unreadable counts as
  // "not sponsored", as on the relay.
  async #sponsorship(calls: readonly Call[]): Promise<Sponsorship> {
    const distinct: Call[] = [];
    for (const call of calls) if (!distinct.some((seen) => same(seen.to, call.to) && seen.data.slice(0, 10) === call.data.slice(0, 10))) distinct.push(call);
    let answers: ReadonlyArray<Hex | null>;
    try {
      answers = await this.#options.call([
        { to: POLICY_PAYMASTER, data: encodeFunctionData({ abi: POLICY_PAYMASTER_ABI, functionName: "paused" }) },
        ...distinct.map((call) => ({ to: POLICY_PAYMASTER, data: encodeFunctionData({ abi: POLICY_PAYMASTER_ABI, functionName: "checkPolicy", args: [this.account, getAddress(call.to), call.data.slice(0, 10) as Hex] }) })),
      ]);
    } catch {
      return { ok: false, why: "its state could not be read" };
    }
    try {
      const pausedRaw = answers[0];
      if (pausedRaw === null || pausedRaw === undefined) return { ok: false, why: "its state could not be read" };
      if (decodeFunctionResult({ abi: POLICY_PAYMASTER_ABI, functionName: "paused", data: pausedRaw }) !== false) return { ok: false, why: "it is paused" };
      for (let index = 0; index < distinct.length; index += 1) {
        const raw = answers[index + 1];
        if (raw === null || raw === undefined) return { ok: false, why: "its state could not be read" };
        const [allowed] = decodeFunctionResult({ abi: POLICY_PAYMASTER_ABI, functionName: "checkPolicy", data: raw });
        if (allowed !== true) return { ok: false, why: "its policy does not cover these calls" };
      }
      return { ok: true };
    } catch {
      return { ok: false, why: "its state could not be read" };
    }
  }

  // Steps 1 to 8 for one decision: build, show the card, sign, check, send once, follow the receipt.
  async run(readiness: XoReadiness, allowance: AllowanceChoice): Promise<ActionResult<SetupValue>> {
    const prepared = await this.prepare(readiness, allowance);
    if (!prepared.ok) return prepared.result;
    const { built, card } = prepared;
    if (!setupCardPasses(card)) return refused("A check on the signature card failed, so the wallet was not asked to sign the account setup.");
    if (!(await this.#options.confirm(card))) return { state: "declined", words: "You chose not to sign the account setup. Nothing was sent.", answer: null };

    let signature: Hex;
    try {
      signature = await this.#options.signer.signRawMessage(built.userOpHash);
    } catch (error) {
      if (error instanceof WalletError && error.code === "unsupported") return refused(RAW_SIGNING_WORDS);
      return { ...walletWords(error, "signing the account setup"), answer: null };
    }
    const verified = await verifyUserOpSignature({ op: built.op, signature, expectedOwner: this.owner });
    if (!verified.ok || verified.form !== "eip191") {
      return refused("The wallet's signature does not recover to the connected address over the EIP-191 hash of the userOpHash on the card, so nothing was sent.");
    }

    let sentHash: Hex;
    try {
      sentHash = (await this.#bundler.sendUserOperation(verified.signedOp)).userOpHash;
    } catch (error) {
      return this.#sendFailure(error, built.userOpHash);
    }
    return this.follow(sentHash);
  }

  #sendFailure(error: unknown, hash: Hex): ActionResult<SetupValue> {
    const value = { userOpHash: hash };
    if (error instanceof BundlerError && error.code === "transport_error") {
      const last = this.#transport.last;
      if (last?.kind === "not_sent") return { ...refused<SetupValue>(`The relay refused the request (HTTP ${last.status}). Nothing reached XO's bundler; the signed operation was not sent.`), value };
      return { state: "ambiguous", words: `${last?.kind === "unknown" ? `${last.words} ` : ""}The operation was sent but no clear answer came back. It may or may not have been accepted: check again by its hash before signing another. Its hash is ${hash}.`, answer: null, value };
    }
    if (error instanceof BundlerError) {
      const answer: VenueAnswer | null = error.upstreamText === undefined ? null : { status: error.httpStatus ?? 0, from: "xo", text: error.upstreamText };
      if (error.maybeSubmitted) return { state: "ambiguous", words: `XO's bundler answered in a way that does not settle the operation (${error.code}). It may or may not have been accepted: check again by its hash before signing another. Its hash is ${hash}.`, answer, value };
      if (error.code === "rpc_error") return { ...refused<SetupValue>(`XO's bundler refused the operation${error.aaCode === undefined ? "" : ` (${error.aaCode})`}. Its words are below. Nothing was included.`, answer), value };
      if (error.code === "requires_key") return { ...refused<SetupValue>("XO's bundler asked for a key, which this page does not have. Nothing was included."), value };
      if (error.code === "rate_limited") return { ...refused<SetupValue>("XO's bundler is rate limiting. Nothing was included; try again in a while."), value };
      return { ...refused<SetupValue>(`The operation was not sent (${error.code}).`), value };
    }
    return { state: "ambiguous", words: `The send failed in a way this page does not know. Check again by the hash before signing another. Its hash is ${hash}.`, answer: null, value };
  }

  // Step 8: the receipt, polled a bounded number of times. Also how the panel checks an operation again later.
  async follow(hash: Hex): Promise<ActionResult<SetupValue>> {
    const value = { userOpHash: hash };
    const sleep = this.#options.sleep ?? defaultSleep;
    const interval = this.#options.pollIntervalMs ?? 3_000;
    const polls = this.#options.maxPolls ?? 30;
    let receipt: UserOperationReceipt | null = null;
    for (let attempt = 0; attempt < polls && receipt === null; attempt += 1) {
      await sleep(interval);
      try {
        receipt = await this.#bundler.getUserOperationReceipt(hash);
      } catch {
        receipt = null;
      }
    }
    if (receipt === null) {
      return { state: "ambiguous", words: `XO's bundler took the operation but it was not included in ${Math.round((interval * polls) / 1000)} seconds. Do not sign another: check again by its hash. Its hash is ${hash}.`, answer: null, value };
    }
    if (!same(receipt.sender, this.account)) return { state: "ambiguous", words: `The receipt for ${hash} names another account. Read the account again before doing anything else.`, answer: null, value };
    if (!receipt.success) {
      return { ...refused<SetupValue>(`The operation was included in transaction ${receipt.transactionHash} but reverted${receipt.reason === undefined ? "" : "; the bundler's words are below"}. Read the account again.`, receipt.reason === undefined ? null : { status: 200, from: "xo", text: receipt.reason }), value };
    }
    return { state: "done", words: `The operation was included in transaction ${receipt.transactionHash} (block ${receipt.blockNumber.toString()}). The account is read again below.`, answer: null, value };
  }
}
