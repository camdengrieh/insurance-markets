import type { IncomingMessage } from "node:http";

import { getAddress, isAddress, type Address, type Hex } from "viem";
import { recoverAuthorizationAddress } from "viem/utils";

import type { AccountStore } from "./account-store.js";
import type { RateLimitSpec } from "./config.js";
import { forward, isAnswer, isRecord, jsonHeaders, originRefusal, rateLimited, readJsonBody, refusal, requestTarget, routeOwner, type RelayAnswer, type RouteOwner } from "./relay-http.js";
import {
  CHAIN_POLICIES,
  checkSponsoredCalls,
  decodeAccountCalls,
  ENTRY_POINT_V08,
  isSponsoredChain,
  SIMPLE_7702_DELEGATION_CODE,
  SIMPLE_7702_IMPLEMENTATION,
  SPONSORED_CHAINS,
  type SponsoredChain,
} from "./sponsor-policy.js";
import { XO_RELAY_LIMITS, type RelayContext } from "./xo-relay.js";

// POST /v1/paymaster/:chainId (137, 8453, 56): the gas sponsor of docs/unified-account-design.md section 3.2. The page's
// viem bundler and paymaster clients point here (design 3.1 Sponsor.sendCalls); this route passes one JSON-RPC request
// at a time through to Pimlico's bundler and paymaster (https://api.pimlico.io/v2/<chainId>/rpc, research note 46
// section 2.1) with the operator's API key added to the upstream URL and the operator's sponsorship policy id put into
// every pm_* call's context. Off unless API_PAYMASTER=on; with it on and PIMLICO_API_KEY or
// PIMLICO_SPONSORSHIP_POLICY_ID absent, every call answers 503 not_configured and nothing is sent.
//
// What is checked before anything is sent:
//   - one JSON-RPC 2.0 request (never a batch), a method from PAYMASTER_METHODS with the params it takes; EntryPoint 0.8
//     wherever an entry point is named; the chain id of a pm_* call equal to the route's;
//   - every user operation (estimate, send, both pm_* calls): its sender an address; no v0.6 field (initCode,
//     paymasterAndData); no factory but EIP-7702's "0x7702" marker; its callData Simple7702Account execute or
//     executeBatch; every inner call allowed by the chain's policy (sponsor-policy.ts: approvals and setApprovalForAll to
//     listed venue contracts, EIP-3009 deposits into the sender, token transfers); and the sender delegated to viem's
//     Simple7702Account: either the operation carries an EIP-7702 authorization for that implementation which the sender
//     itself signed, or the sender's code on the chain is already 0xef0100 || that implementation (read with eth_getCode
//     from the chain's public RPC, or the operator's API_RPC_<CHAIN>, and remembered for ten minutes);
//   - a token transfer to an address the bridge gave this server for the sender's own Deposit Wallet
//     (polymarket-bridge.ts) is a funding move; any other transfer is a withdrawal, and a sender gets at most
//     API_LIMITS.withdrawalsPerDay sponsored operations with withdrawals per UTC day (counted once per chain and nonce when
//     pm_getPaymasterData is asked, refused early by the stub and estimate calls once the day is spent);
//   - per client address over every call, and per sender over pm_getPaymasterData and eth_sendUserOperation.
// Pimlico's own policy (chains, global, per-user and per-operation USD caps) applies on top.
//
// The answer is Pimlico's status and JSON body (x-im-relay: upstream); this route's own refusals are the API's JSON
// errors (x-im-relay: refused). Logs: method, route, status, time; never the upstream URL (it carries the key), a body
// or a header value. Nothing is retried: an eth_sendUserOperation that gets no answer may have reached the bundler.

export const PAYMASTER_PREFIX = "/v1/paymaster";
export const PIMLICO_ORIGIN = "https://api.pimlico.io";

export const PAYMASTER_METHODS = Object.freeze([
  "eth_chainId",
  "eth_supportedEntryPoints",
  "eth_estimateUserOperationGas",
  "eth_sendUserOperation",
  "eth_getUserOperationReceipt",
  "eth_getUserOperationByHash",
  "pimlico_getUserOperationGasPrice",
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
] as const);
export type PaymasterMethod = (typeof PAYMASTER_METHODS)[number];
const SPENDING_METHODS: ReadonlySet<string> = new Set(["eth_sendUserOperation", "pm_getPaymasterData"]);

export const PAYMASTER_LIMITS = Object.freeze({
  maxBodyBytes: 64 * 1024,
  maxResponseBytes: 256 * 1024,
  upstreamTimeoutMs: 15_000,
  rpcTimeoutMs: 8_000,
  delegationCacheMs: 10 * 60_000,
  // How long a bridge deposit address the server fetched counts as the sender's funding route.
  bridgeDepositTtlMs: 30 * 24 * 3_600_000,
});

export function pimlicoUrl(chainId: SponsoredChain, apiKey: string): string {
  return `${PIMLICO_ORIGIN}/v2/${chainId}/rpc?apikey=${encodeURIComponent(apiKey)}`;
}

// The keys a v0.7 / v0.8 user operation carries over JSON-RPC (viem formatUserOperationRequest), and nothing else.
const USER_OPERATION_KEYS: ReadonlySet<string> = new Set([
  "sender",
  "nonce",
  "factory",
  "factoryData",
  "callData",
  "callGasLimit",
  "verificationGasLimit",
  "preVerificationGas",
  "maxFeePerGas",
  "maxPriorityFeePerGas",
  "paymaster",
  "paymasterVerificationGasLimit",
  "paymasterPostOpGasLimit",
  "paymasterData",
  "signature",
  "eip7702Auth",
]);
const QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;
const HASH32 = /^0x[0-9a-fA-F]{64}$/;
const RPC_ID_TEXT = /^[A-Za-z0-9_-]{1,64}$/;
// EIP-7702's factory marker as viem sends it ("0x7702"), or its 20-byte right-padded form.
const FACTORY_7702 = /^0x7702(?:0{36})?$/i;

export interface UserOperationFacts {
  readonly sender: Address;
  readonly nonce: string;
  readonly withdrawals: number;
  readonly authorization: "included" | "on_chain";
}

export interface PaymasterOptions {
  readonly enabled: boolean;
  readonly pimlico: { readonly apiKey: string; readonly policyId: string } | null;
  readonly store: AccountStore;
  readonly fetchImpl: typeof fetch;
  // The JSON-RPC URL eth_getCode is read from, per chain.
  readonly rpcUrls: Readonly<Record<SponsoredChain, string>>;
  readonly clientLimit: RateLimitSpec;
  readonly senderLimit: RateLimitSpec;
  readonly withdrawalsPerDay: number;
  readonly maxUrlChars: number;
  // Tests only.
  readonly upstreamTimeoutMs?: number;
}

type Verdict<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly answer: RelayAnswer };
const fail = (answer: RelayAnswer): { readonly ok: false; readonly answer: RelayAnswer } => ({ ok: false, answer });

// The envelope: one JSON-RPC 2.0 request for a listed method.
export function checkEnvelope(value: unknown): Verdict<{ readonly method: PaymasterMethod; readonly params: unknown[]; readonly record: Record<string, unknown> }> {
  if (Array.isArray(value)) return fail(refusal("invalid_request", "The paymaster takes one JSON-RPC request, not a batch."));
  if (!isRecord(value)) return fail(refusal("invalid_request", "The body is not a JSON-RPC request."));
  if (Object.keys(value).some((key) => key !== "jsonrpc" && key !== "id" && key !== "method" && key !== "params")) return fail(refusal("invalid_request", "A JSON-RPC request has jsonrpc, id, method and params only."));
  if (value["jsonrpc"] !== "2.0") return fail(refusal("invalid_request", 'jsonrpc must be "2.0".'));
  const id = value["id"];
  if (!((typeof id === "number" && Number.isSafeInteger(id) && id >= 0) || (typeof id === "string" && RPC_ID_TEXT.test(id)))) return fail(refusal("invalid_request", "id must be a whole number or a short word."));
  const method = value["method"];
  if (typeof method !== "string" || !(PAYMASTER_METHODS as readonly string[]).includes(method)) return fail(refusal("invalid_request", `The paymaster forwards ${PAYMASTER_METHODS.join(", ")} only.`));
  const params = value["params"] ?? [];
  if (!Array.isArray(params)) return fail(refusal("invalid_request", "params must be an array."));
  return { ok: true, value: { method: method as PaymasterMethod, params, record: value } };
}

// The static checks of one user operation (no chain read): its shape, its factory, its authorization (if any) and its
// calls against the chain's policy.
export async function checkUserOperation(op: unknown, chainId: SponsoredChain, bridgeDeposits: ReadonlySet<string>): Promise<Verdict<UserOperationFacts>> {
  if (!isRecord(op)) return fail(refusal("invalid_request", "The user operation is not an object."));
  for (const key of Object.keys(op)) {
    if (key === "initCode" || key === "paymasterAndData") return fail(refusal("invalid_request", "The user operation has an EntryPoint v0.6 field; this paymaster serves EntryPoint 0.8."));
    if (!USER_OPERATION_KEYS.has(key)) return fail(refusal("invalid_request", `The user operation has an unknown field (${key.slice(0, 40)}).`));
  }
  const sender = op["sender"];
  if (typeof sender !== "string" || !isAddress(sender, { strict: false })) return fail(refusal("invalid_request", "The user operation's sender is not an address."));
  const nonce = op["nonce"];
  if (typeof nonce !== "string" || !QUANTITY.test(nonce)) return fail(refusal("invalid_request", "The user operation's nonce is not a hex quantity."));
  const factory = op["factory"];
  if (factory !== undefined && factory !== null && (typeof factory !== "string" || !FACTORY_7702.test(factory))) return fail(refusal("not_sponsored", "The sponsor pays for an EIP-7702 account only: the user operation names a factory."));
  const factoryData = op["factoryData"];
  if (factoryData !== undefined && factoryData !== null && factoryData !== "0x") return fail(refusal("not_sponsored", "The sponsor pays for an EIP-7702 account only: the user operation carries factory data."));
  const callData = op["callData"];
  if (typeof callData !== "string" || !HEX_BYTES.test(callData)) return fail(refusal("invalid_request", "The user operation's callData is not hex."));
  const decoded = decodeAccountCalls(callData);
  if (!decoded.ok) return fail(refusal("not_sponsored", decoded.reason));
  const account = getAddress(sender);
  const verdict = checkSponsoredCalls(decoded.calls, { policy: CHAIN_POLICIES[chainId], sender: account, bridgeDeposits });
  if (!verdict.ok) return fail(refusal("not_sponsored", `Call ${verdict.index + 1}: ${verdict.reason}`));

  const auth = op["eip7702Auth"];
  let authorization: UserOperationFacts["authorization"] = "on_chain";
  if (auth !== undefined && auth !== null) {
    if (!isRecord(auth)) return fail(refusal("invalid_request", "eip7702Auth is not an object."));
    const { address, chainId: authChain, nonce: authNonce, r, s, yParity } = auth;
    if (typeof address !== "string" || !isAddress(address, { strict: false })) return fail(refusal("invalid_request", "eip7702Auth.address is not an address."));
    if (address.toLowerCase() !== SIMPLE_7702_IMPLEMENTATION.toLowerCase()) return fail(refusal("not_sponsored", `The sponsor pays for accounts delegated to Simple7702Account (${SIMPLE_7702_IMPLEMENTATION}) only.`));
    if (typeof authChain !== "string" || !QUANTITY.test(authChain) || typeof authNonce !== "string" || !QUANTITY.test(authNonce)) return fail(refusal("invalid_request", "eip7702Auth chainId and nonce are hex quantities."));
    if (BigInt(authChain) !== 0n && BigInt(authChain) !== BigInt(chainId)) return fail(refusal("not_sponsored", "The EIP-7702 authorization is for another chain."));
    if (typeof r !== "string" || !HASH32.test(r) || typeof s !== "string" || !HASH32.test(s) || typeof yParity !== "string" || !/^0x0?[01]$/.test(yParity)) return fail(refusal("invalid_request", "eip7702Auth r, s and yParity are not a signature."));
    let signer: Address;
    try {
      signer = await recoverAuthorizationAddress({
        authorization: { address: getAddress(address), chainId: Number(BigInt(authChain)), nonce: Number(BigInt(authNonce)), r: r as Hex, s: s as Hex, yParity: Number(BigInt(yParity)) },
      });
    } catch {
      return fail(refusal("not_sponsored", "The EIP-7702 authorization's signature does not recover."));
    }
    if (signer.toLowerCase() !== account.toLowerCase()) return fail(refusal("not_sponsored", "The EIP-7702 authorization was not signed by the user operation's sender."));
    authorization = "included";
  }
  return { ok: true, value: { sender: account, nonce: nonce.toLowerCase(), withdrawals: verdict.withdrawals, authorization } };
}

export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function createPaymaster(options: PaymasterOptions): RouteOwner {
  // sender|chain -> when the delegation to Simple7702Account was last seen on chain.
  const delegated = new Map<string, number>();

  async function delegationOnChain(chainId: SponsoredChain, sender: Address, nowMs: number): Promise<boolean | null> {
    const key = `${chainId}|${sender.toLowerCase()}`;
    const seen = delegated.get(key);
    if (seen !== undefined && nowMs - seen < PAYMASTER_LIMITS.delegationCacheMs) return true;
    const answer = await forward(options.rpcUrls[chainId], "POST", { "content-type": "application/json", accept: "application/json" }, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [sender, "latest"] }), {
      fetchImpl: options.fetchImpl,
      timeoutMs: PAYMASTER_LIMITS.rpcTimeoutMs,
      maxResponseBytes: 64 * 1024,
      who: "The chain's RPC",
      timeoutWords: "The chain's RPC did not answer in time.",
    });
    if (answer.source !== "upstream" || answer.status !== 200) return null;
    let code: unknown;
    try {
      code = (JSON.parse(answer.body.toString("utf8")) as { result?: unknown }).result;
    } catch {
      return null;
    }
    if (typeof code !== "string") return null;
    const ok = code.toLowerCase() === SIMPLE_7702_DELEGATION_CODE;
    if (ok) {
      delegated.set(key, nowMs);
      while (delegated.size > 20_000) {
        const oldest = delegated.keys().next().value;
        if (oldest === undefined) break;
        delegated.delete(oldest);
      }
    }
    return ok;
  }

  async function answer(req: IncomingMessage, path: string, context: RelayContext, setLabel: (label: string) => void): Promise<RelayAnswer> {
    if (!options.enabled) return refusal("relay_not_enabled", "The paymaster is not enabled on this server.");
    const match = /^\/v1\/paymaster\/([0-9]{1,6})$/.exec(path);
    const chainId = match === null ? null : Number(match[1]);
    if (chainId === null || !isSponsoredChain(chainId)) return refusal("not_found", `The paymaster serves chains ${SPONSORED_CHAINS.join(", ")} at ${PAYMASTER_PREFIX}/<chainId>.`);
    setLabel(`${PAYMASTER_PREFIX}/${chainId}`);
    const pimlico = options.pimlico;
    if (pimlico === null) return refusal("not_configured", "Gas sponsorship is not available on this server yet: the operator has not configured the paymaster.");
    const origin = originRefusal(req, "The paymaster");
    if (origin !== null) return origin;
    const target = requestTarget(req, path, options.maxUrlChars);
    if (isAnswer(target)) return target;
    if (req.method !== "POST") return refusal("method_not_allowed", "The paymaster answers POST only.", { allow: "POST, OPTIONS" });
    if (target.search !== "") return refusal("invalid_request", "The paymaster takes no query.");
    const headers = jsonHeaders(req, PAYMASTER_LIMITS.maxBodyBytes);
    if (headers !== null) return headers;
    const taken = context.takeToken(`paymaster|${context.client}`, options.clientLimit);
    if (!taken.allowed) return rateLimited(options.clientLimit, taken.retryAfterMs, "to the paymaster from this client");
    const body = await readJsonBody(req, PAYMASTER_LIMITS.maxBodyBytes);
    if (isAnswer(body)) return body;
    const envelope = checkEnvelope(body.value);
    if (!envelope.ok) return envelope.answer;
    const { method, params, record } = envelope.value;
    let upstreamBody: string | Buffer = body.raw;

    switch (method) {
      case "eth_chainId":
      case "eth_supportedEntryPoints":
      case "pimlico_getUserOperationGasPrice":
        if (params.length !== 0) return refusal("invalid_request", `${method} takes no params.`);
        break;
      case "eth_getUserOperationReceipt":
      case "eth_getUserOperationByHash":
        if (params.length !== 1 || typeof params[0] !== "string" || !HASH32.test(params[0])) return refusal("invalid_request", `${method} takes [userOpHash].`);
        break;
      default: {
        const isPm = method === "pm_getPaymasterStubData" || method === "pm_getPaymasterData";
        if (isPm ? params.length < 3 || params.length > 4 : params.length !== 2) return refusal("invalid_request", isPm ? `${method} takes [userOperation, entryPoint, chainId, context?].` : `${method} takes [userOperation, entryPoint].`);
        const entryPoint = params[1];
        if (typeof entryPoint !== "string" || entryPoint.toLowerCase() !== ENTRY_POINT_V08.toLowerCase()) return refusal("invalid_request", `The entry point must be EntryPoint 0.8 (${ENTRY_POINT_V08}).`);
        if (isPm) {
          const chainParam = params[2];
          if (typeof chainParam !== "string" || !QUANTITY.test(chainParam) || BigInt(chainParam) !== BigInt(chainId)) return refusal("invalid_request", `The chain id param must be ${chainId}, the route's chain.`);
        }
        const nowMs = context.nowMs();
        const deposits = new Set(options.store.bridgeDeposits(isRecord(params[0]) && typeof params[0]["sender"] === "string" ? params[0]["sender"] : "", nowMs - PAYMASTER_LIMITS.bridgeDepositTtlMs));
        const checked = await checkUserOperation(params[0], chainId, deposits);
        if (!checked.ok) return checked.answer;
        const facts = checked.value;
        if (facts.authorization === "on_chain") {
          const onChain = await delegationOnChain(chainId, facts.sender, nowMs);
          if (onChain === null) return refusal("upstream_unreachable", "The chain could not be read to check the account's EIP-7702 delegation; try again.");
          if (!onChain) return refusal("not_sponsored", `The sender is not delegated to Simple7702Account (${SIMPLE_7702_IMPLEMENTATION}) on chain ${chainId}, and the user operation carries no authorization for it.`);
        }
        if (SPENDING_METHODS.has(method)) {
          const sender = context.takeToken(`paymaster-sender|${chainId}|${facts.sender.toLowerCase()}`, options.senderLimit);
          if (!sender.allowed) return rateLimited(options.senderLimit, sender.retryAfterMs, "for this account to the paymaster");
        }
        if (facts.withdrawals > 0) {
          const day = utcDay(nowMs);
          const counted = options.store.hasWithdrawal(facts.sender, day, chainId, facts.nonce);
          if (!counted && options.store.withdrawalCount(facts.sender, day) >= options.withdrawalsPerDay) {
            return refusal("not_sponsored", `This account has had ${options.withdrawalsPerDay} sponsored withdrawals today (UTC); further transfers need native gas until tomorrow.`);
          }
          if (method === "pm_getPaymasterData" && !counted) options.store.recordWithdrawal(facts.sender, day, chainId, facts.nonce, nowMs);
        }
        if (isPm) {
          // The operator's policy, whatever context the page sent.
          upstreamBody = JSON.stringify({ ...record, params: [params[0], params[1], params[2], { sponsorshipPolicyId: pimlico.policyId }] });
        }
        break;
      }
    }
    return forward(pimlicoUrl(chainId, pimlico.apiKey), "POST", { "content-type": "application/json", accept: "application/json" }, upstreamBody, {
      fetchImpl: options.fetchImpl,
      timeoutMs: options.upstreamTimeoutMs ?? PAYMASTER_LIMITS.upstreamTimeoutMs,
      maxResponseBytes: PAYMASTER_LIMITS.maxResponseBytes,
      who: "Pimlico",
      timeoutWords:
        method === "eth_sendUserOperation"
          ? "Pimlico did not answer in time. The user operation may or may not have been accepted: look it up by its hash before sending another."
          : "Pimlico did not answer in time. Nothing is known about this request's outcome.",
    });
  }

  return routeOwner(PAYMASTER_PREFIX, {
    preflight: (path) => (options.enabled && /^\/v1\/paymaster\/(?:137|8453|56)$/.test(path) ? { label: path, methods: ["POST"], headers: ["content-type"] } : null),
    answer,
    internalWords: "The paymaster failed to answer. Whether Pimlico received the request is not known.",
    maxAgeS: XO_RELAY_LIMITS.preflightMaxAgeS,
  });
}
