import type { IncomingMessage } from "node:http";

import { getAddress, isAddress, type Address, type Hex } from "viem";

import { POLYMARKET_DEPOSIT_WALLET_FACTORY } from "../sdk/chain/xo/constants.js";
import { depositWalletCandidates } from "../sdk/trade/clob/polymarket/deposit-wallet.js";
import { builderHeaders, type BuilderCredentials } from "./builder-signing.js";
import type { RateLimitSpec } from "./config.js";
import { PROOF_HEADER, verifyProof } from "./proof.js";
import { forward, isAnswer, isRecord, jsonHeaders, noBody, originRefusal, rateLimited, readJsonBody, refusal, requestTarget, routeOwner, type RelayAnswer, type RouteOwner } from "./relay-http.js";
import { checkWalletCall } from "./sponsor-policy.js";
import { XO_RELAY_LIMITS, type RelayContext } from "./xo-relay.js";

// /v1/relay/polymarket/<relayer path>: a mirror of Polymarket's relayer (https://relayer-v2.polymarket.com) for the few
// calls a visitor's Polymarket Deposit Wallet needs, with the operator's Builder API credentials added as the four
// POLY_BUILDER_* headers (builder-signing.ts). Research note 45 sections 1 and 2 ("option (b): the relay forwards the
// Relayer request itself", so the validated body and the signed body are the same bytes); docs/unified-account-design.md
// section 3.2. Off unless API_POLYMARKET_RELAY=on; with it on and POLY_BUILDER_API_KEY, POLY_BUILDER_SECRET or
// POLY_BUILDER_PASSPHRASE absent, every call answers 503 not_configured and nothing is sent.
//
// It is NOT the reference builder-signing-server, which signs anything (note 45 section 2): only these calls go out.
//
//   POST /submit                              type WALLET-CREATE {type, from, to = the Deposit Wallet factory, metadata?}:
//                                             needs an ownership proof (x-im-proof, proof.ts) for `from`, because a deploy
//                                             carries no signature of its own and spends the operator's relayer quota.
//                                             type WALLET {type, from, to = factory, nonce, signature, metadata?,
//                                             depositWalletParams: {depositWallet, deadline, calls}}: depositWallet one of
//                                             the two addresses derived from `from`, every call to a listed target
//                                             (sponsor-policy.ts checkWalletCall). The owner's batch signature is checked
//                                             on chain; no proof is asked.
//   GET  /v1/account/transactions/params      ?address=<0x>&type=WALLET (the batch nonce)
//   GET  /v1/account/transactions/<id>        a transaction's state
//   GET  /deployed                            ?address=<0x>&type=WALLET
//   GET  /transaction                         ?id=<id> (the older status read)
//   POST /v1/session-signers/authorizations   {walletAddress, sessionSignerAddress, scopes, validUntil, nonce, deadline,
//                                             signature} with an Idempotency-Key header (the owner signed the Batch)
//   POST /v1/session-signers/revocations      {walletAddress, sessionSignerAddress, nonce, deadline, signature}, likewise
//
// The query is forwarded exactly as sent (the builder HMAC covers the path without it, note 45 section 2); a body is
// forwarded byte for byte and is what the HMAC covers. Writes are limited per signer (WALLET-CREATE and WALLET per
// `from`, session-signer calls per wallet) as well as per client, because the relayer's daily quota is shared by every
// visitor (note 45 section 1.3: 100 a day unverified). The answer is the relayer's status and body
// (x-im-relay: upstream). Logs: method, route, status, time; never a header value, a query or a body.

export const POLYMARKET_RELAY_PREFIX = "/v1/relay/polymarket";
export const POLYMARKET_RELAYER_ORIGIN = "https://relayer-v2.polymarket.com";

type Method = "GET" | "POST";

interface RouteSpec {
  readonly label: string;
  readonly path: RegExp;
  readonly method: Method;
  // Query keys and the shape of each; empty: no query.
  readonly query: Readonly<Record<string, RegExp>>;
  readonly body: "none" | "submit" | "session";
  readonly idempotencyKey: boolean;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX_ID = /^[A-Za-z0-9_-]{1,128}$/;

export const POLYMARKET_RELAY_ROUTES: readonly RouteSpec[] = Object.freeze<RouteSpec[]>([
  { label: "/submit", path: /^\/submit$/, method: "POST", query: {}, body: "submit", idempotencyKey: false },
  { label: "/v1/account/transactions/params", path: /^\/v1\/account\/transactions\/params$/, method: "GET", query: { address: ADDRESS, type: /^WALLET$/ }, body: "none", idempotencyKey: false },
  { label: "/v1/account/transactions/:id", path: /^\/v1\/account\/transactions\/(?!params$)[A-Za-z0-9_-]{1,128}$/, method: "GET", query: {}, body: "none", idempotencyKey: false },
  { label: "/deployed", path: /^\/deployed$/, method: "GET", query: { address: ADDRESS, type: /^WALLET$/ }, body: "none", idempotencyKey: false },
  { label: "/transaction", path: /^\/transaction$/, method: "GET", query: { id: TX_ID }, body: "none", idempotencyKey: false },
  { label: "/v1/session-signers/authorizations", path: /^\/v1\/session-signers\/authorizations$/, method: "POST", query: {}, body: "session", idempotencyKey: true },
  { label: "/v1/session-signers/revocations", path: /^\/v1\/session-signers\/revocations$/, method: "POST", query: {}, body: "session", idempotencyKey: true },
]);

export function matchPolymarketRoute(upstreamPath: string): RouteSpec | null {
  return POLYMARKET_RELAY_ROUTES.find((spec) => spec.path.test(upstreamPath)) ?? null;
}

export const POLYMARKET_RELAY_LIMITS = Object.freeze({ maxBodyBytes: 64 * 1024, maxResponseBytes: 256 * 1024, maxCalls: 20 });

const HEX = /^0x(?:[0-9a-fA-F]{2})*$/;
const SIGNATURE = /^0x(?:[0-9a-fA-F]{2}){65,}$/;
const DECIMAL = /^(?:0|[1-9][0-9]{0,77})$/;
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,128}$/;

export interface PolymarketRelayOptions {
  readonly enabled: boolean;
  readonly credentials: BuilderCredentials | null;
  readonly fetchImpl: typeof fetch;
  readonly limit: RateLimitSpec;
  readonly accountLimit: RateLimitSpec;
  readonly maxUrlChars: number;
  readonly upstreamTimeoutMs?: number;
}

type Checked = { readonly ok: true; readonly signer: Address; readonly proofFor: Address | null } | { readonly ok: false; readonly answer: RelayAnswer };

const decimalText = (value: unknown): boolean => (typeof value === "string" && DECIMAL.test(value)) || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);

// A /submit body: WALLET-CREATE or WALLET, as note 45 section 1.1 shows them.
export function checkSubmit(value: unknown): Checked {
  const bad = (message: string): Checked => ({ ok: false, answer: refusal("invalid_request", message) });
  if (!isRecord(value)) return bad("The body is not a JSON object.");
  const type = value["type"];
  const from = value["from"];
  if (typeof from !== "string" || !isAddress(from, { strict: false })) return bad("from is not an address.");
  if (typeof value["to"] !== "string" || value["to"].toLowerCase() !== POLYMARKET_DEPOSIT_WALLET_FACTORY.toLowerCase()) return bad(`to must be the Deposit Wallet factory (${POLYMARKET_DEPOSIT_WALLET_FACTORY}).`);
  const metadata = value["metadata"];
  if (metadata !== undefined && (typeof metadata !== "string" || metadata.length > 200)) return bad("metadata is a short text.");
  const signer = getAddress(from);
  if (type === "WALLET-CREATE") {
    if (Object.keys(value).some((key) => !["type", "from", "to", "metadata"].includes(key))) return bad("A WALLET-CREATE body has type, from, to and metadata only.");
    return { ok: true, signer, proofFor: signer };
  }
  if (type !== "WALLET") return { ok: false, answer: refusal("not_found", "The relay forwards WALLET-CREATE and WALLET transactions only.") };
  if (Object.keys(value).some((key) => !["type", "from", "to", "nonce", "signature", "metadata", "depositWalletParams"].includes(key))) return bad("A WALLET body has type, from, to, nonce, signature, metadata and depositWalletParams only.");
  if (!decimalText(value["nonce"])) return bad("nonce is a whole number.");
  if (typeof value["signature"] !== "string" || !SIGNATURE.test(value["signature"])) return bad("signature is the owner's hex signature.");
  const params = value["depositWalletParams"];
  if (!isRecord(params) || Object.keys(params).some((key) => !["depositWallet", "deadline", "calls"].includes(key))) return bad("depositWalletParams has depositWallet, deadline and calls only.");
  const wallet = params["depositWallet"];
  if (typeof wallet !== "string" || !isAddress(wallet, { strict: false })) return bad("depositWallet is not an address.");
  if (!depositWalletCandidates(signer).some((candidate) => candidate.address.toLowerCase() === wallet.toLowerCase())) return bad("depositWallet is not the Deposit Wallet of from (neither derived form).");
  if (!decimalText(params["deadline"])) return bad("deadline is unix seconds.");
  const calls = params["calls"];
  if (!Array.isArray(calls) || calls.length === 0 || calls.length > POLYMARKET_RELAY_LIMITS.maxCalls) return bad(`calls is a list of 1 to ${POLYMARKET_RELAY_LIMITS.maxCalls} calls.`);
  for (const [index, call] of calls.entries()) {
    if (!isRecord(call) || Object.keys(call).some((key) => !["target", "value", "data"].includes(key))) return bad(`Call ${index + 1} has target, value and data only.`);
    const { target, value: amount, data } = call;
    if (typeof target !== "string" || !isAddress(target, { strict: false })) return bad(`Call ${index + 1}: target is not an address.`);
    if (!decimalText(amount)) return bad(`Call ${index + 1}: value is a whole number.`);
    if (typeof data !== "string" || !HEX.test(data)) return bad(`Call ${index + 1}: data is not hex.`);
    const verdict = checkWalletCall({ to: getAddress(target), value: BigInt(amount as string | number), data: data as Hex }, signer);
    if (!verdict.ok) return { ok: false, answer: refusal("not_sponsored", `Call ${index + 1}: ${verdict.reason}`) };
  }
  return { ok: true, signer, proofFor: null };
}

// A session-signer body (note 45 section 1.1): the wallet and the session key are addresses and the owner's signature is
// there; the relayer and the wallet check the rest.
export function checkSession(value: unknown, revocation: boolean): Checked {
  const bad = (message: string): Checked => ({ ok: false, answer: refusal("invalid_request", message) });
  const keys = revocation ? ["walletAddress", "sessionSignerAddress", "nonce", "deadline", "signature"] : ["walletAddress", "sessionSignerAddress", "scopes", "validUntil", "nonce", "deadline", "signature"];
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key))) return bad(`The body has ${keys.join(", ")} only.`);
  const wallet = value["walletAddress"];
  if (typeof wallet !== "string" || !isAddress(wallet, { strict: false })) return bad("walletAddress is not an address.");
  if (typeof value["sessionSignerAddress"] !== "string" || !isAddress(value["sessionSignerAddress"], { strict: false })) return bad("sessionSignerAddress is not an address.");
  if (typeof value["signature"] !== "string" || !SIGNATURE.test(value["signature"])) return bad("signature is the owner's hex signature.");
  return { ok: true, signer: getAddress(wallet), proofFor: null };
}

function querySearch(url: URL, spec: RouteSpec): boolean {
  const keys = [...url.searchParams.keys()];
  const wanted = Object.keys(spec.query);
  if (keys.length !== wanted.length || new Set(keys).size !== keys.length) return false;
  return wanted.every((key) => {
    const value = url.searchParams.get(key);
    const shape = spec.query[key];
    return value !== null && shape !== undefined && shape.test(value);
  });
}

export function createPolymarketRelay(options: PolymarketRelayOptions): RouteOwner {
  async function answer(req: IncomingMessage, path: string, context: RelayContext, setLabel: (label: string) => void): Promise<RelayAnswer> {
    if (!options.enabled) return refusal("relay_not_enabled", "The Polymarket relay is not enabled on this server.");
    const upstreamPath = path.slice(POLYMARKET_RELAY_PREFIX.length);
    const spec = path.startsWith(`${POLYMARKET_RELAY_PREFIX}/`) ? matchPolymarketRoute(upstreamPath) : null;
    if (spec === null) return refusal("not_found", "The Polymarket relay forwards a fixed list of relayer calls; this is not one of them.");
    setLabel(`${POLYMARKET_RELAY_PREFIX}${spec.label}`);
    const credentials = options.credentials;
    if (credentials === null) return refusal("not_configured", "Polymarket's gasless wallet is not available on this server yet: the operator has not configured its Builder credentials.");
    const origin = originRefusal(req, "The Polymarket relay");
    if (origin !== null) return origin;
    const target = requestTarget(req, path, options.maxUrlChars);
    if (isAnswer(target)) return target;
    if (req.method !== spec.method) return refusal("method_not_allowed", `This relay route answers ${spec.method} only.`, { allow: `${spec.method}, OPTIONS` });
    if (!querySearch(target.url, spec)) return refusal("invalid_request", Object.keys(spec.query).length === 0 ? "This relay route takes no query." : `This relay route takes exactly: ${Object.keys(spec.query).join(", ")}.`);
    let idempotencyKey: string | null = null;
    if (spec.idempotencyKey) {
      const raw = req.headers["idempotency-key"];
      if (typeof raw !== "string" || !IDEMPOTENCY_KEY.test(raw)) return refusal("invalid_request", "This relay route needs one Idempotency-Key header (printable, at most 128 characters).");
      idempotencyKey = raw;
    }
    if (spec.body === "none") {
      const none = noBody(req);
      if (none !== null) return none;
    } else {
      const headers = jsonHeaders(req, POLYMARKET_RELAY_LIMITS.maxBodyBytes);
      if (headers !== null) return headers;
    }
    const taken = context.takeToken(`polymarket-relay|${context.client}`, options.limit);
    if (!taken.allowed) return rateLimited(options.limit, taken.retryAfterMs, "to the Polymarket relay from this client");

    let raw: Buffer | undefined;
    if (spec.body !== "none") {
      const body = await readJsonBody(req, POLYMARKET_RELAY_LIMITS.maxBodyBytes);
      if (isAnswer(body)) return body;
      raw = body.raw;
      const checked = spec.body === "submit" ? checkSubmit(body.value) : checkSession(body.value, spec.label.endsWith("revocations"));
      if (!checked.ok) return checked.answer;
      if (checked.proofFor !== null) {
        const proof = await verifyProof({ header: req.headers[PROOF_HEADER], method: spec.method, path: target.rawPath, search: target.search, body: raw, nowMs: context.nowMs(), account: checked.proofFor });
        if (!proof.ok) return refusal(proof.code, proof.message);
      }
      const account = context.takeToken(`polymarket-signer|${checked.signer.toLowerCase()}`, options.accountLimit);
      if (!account.allowed) return rateLimited(options.accountLimit, account.retryAfterMs, "for this wallet to the Polymarket relay");
    }

    const bodyText = raw === undefined ? undefined : raw.toString("utf8");
    const seconds = Math.floor(context.nowMs() / 1000);
    const headers: Record<string, string> = {
      accept: "application/json",
      ...builderHeaders(credentials, seconds, spec.method, upstreamPath, bodyText),
      ...(raw === undefined ? {} : { "content-type": "application/json" }),
      ...(idempotencyKey === null ? {} : { "Idempotency-Key": idempotencyKey }),
    };
    return forward(`${POLYMARKET_RELAYER_ORIGIN}${upstreamPath}${target.search}`, spec.method, headers, raw, {
      fetchImpl: options.fetchImpl,
      timeoutMs: options.upstreamTimeoutMs ?? XO_RELAY_LIMITS.upstreamTimeoutMs,
      maxResponseBytes: POLYMARKET_RELAY_LIMITS.maxResponseBytes,
      who: "Polymarket's relayer",
      timeoutWords:
        spec.method === "POST"
          ? "Polymarket's relayer did not answer in time. The transaction may or may not have been submitted: check its state before sending it again."
          : "Polymarket's relayer did not answer in time. Nothing is known about this request's outcome.",
    });
  }

  return routeOwner(POLYMARKET_RELAY_PREFIX, {
    preflight: (path) => {
      const spec = options.enabled && path.startsWith(`${POLYMARKET_RELAY_PREFIX}/`) ? matchPolymarketRoute(path.slice(POLYMARKET_RELAY_PREFIX.length)) : null;
      if (spec === null) return null;
      const headers = spec.body === "none" ? [] : spec.body === "submit" ? ["content-type", PROOF_HEADER] : ["content-type", "idempotency-key"];
      return { label: `${POLYMARKET_RELAY_PREFIX}${spec.label}`, methods: [spec.method], headers };
    },
    answer,
    internalWords: "The Polymarket relay failed to answer. Whether the relayer received the request is not known.",
    maxAgeS: XO_RELAY_LIMITS.preflightMaxAgeS,
  });
}
