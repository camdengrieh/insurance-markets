import type { IncomingMessage } from "node:http";

import { getAddress, isAddress } from "viem";

import { depositWalletCandidates } from "../sdk/trade/clob/polymarket/deposit-wallet.js";
import type { AccountStore } from "./account-store.js";
import type { RateLimitSpec } from "./config.js";
import { forward, isAnswer, isRecord, jsonHeaders, originRefusal, parseUpstream, rateLimited, readJsonBody, refusal, requestTarget, routeOwner, type RelayAnswer, type RouteOwner } from "./relay-http.js";
import { XO_RELAY_LIMITS, type RelayContext } from "./xo-relay.js";

// POST /v1/relay/polymarket-bridge/deposit: the Polymarket bridge's deposit-address call (POST
// https://bridge.polymarket.com/deposit {"address": <Deposit Wallet>}, research note 45 section 6, from
// docs.polymarket.com trading/bridge/deposit.md and bridge-openapi.yaml), made by this server so that it knows which
// deposit addresses the bridge gave for a sender. The paymaster (paymaster.ts) then sponsors a token transfer from that
// sender to one of them as a funding move, without counting it against the sender's daily withdrawals. Off unless
// API_PAYMASTER=on (it serves the paymaster); it needs no credential (the builder code, if set, is public and sent as
// X-Builder-Code, note 45 section 1.3).
//
// Request:  { "sender": "<trading account E>", "address": "<E's Polymarket Deposit Wallet>" }
// Answer:   the bridge's own status and JSON body (its per-family deposit addresses), unchanged.
//
// `address` must be one of the two Deposit Wallet addresses derived from `sender` (sdk/trade/clob/polymarket/
// deposit-wallet.ts: the beacon and the UUPS form), so the uncapped funding route only ever pays into the sender's own
// Polymarket wallet. No proof is asked: what the server remembers only relaxes the cap for user operations the sender
// itself must sign. The EVM deposit address in a 2xx answer (`address.evm`, or a top-level `evm`) is stored for the sender
// (account-store.ts bridge_deposits) for PAYMASTER_LIMITS.bridgeDepositTtlMs.

export const BRIDGE_PREFIX = "/v1/relay/polymarket-bridge";
export const BRIDGE_DEPOSIT_PATH = `${BRIDGE_PREFIX}/deposit`;
export const POLYMARKET_BRIDGE_ORIGIN = "https://bridge.polymarket.com";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export interface BridgeOptions {
  readonly enabled: boolean;
  readonly builderCode: string | null;
  readonly store: AccountStore;
  readonly fetchImpl: typeof fetch;
  readonly limit: RateLimitSpec;
  readonly maxUrlChars: number;
  readonly upstreamTimeoutMs?: number;
}

// The EVM deposit address in the bridge's answer, or null.
export function evmDepositAddress(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const nested = value["address"];
  const evm = isRecord(nested) ? nested["evm"] : value["evm"];
  return typeof evm === "string" && EVM_ADDRESS.test(evm) ? evm : null;
}

export function createPolymarketBridge(options: BridgeOptions): RouteOwner {
  async function answer(req: IncomingMessage, path: string, context: RelayContext, setLabel: (label: string) => void): Promise<RelayAnswer> {
    if (!options.enabled) return refusal("relay_not_enabled", "The Polymarket bridge route is not enabled on this server.");
    if (path !== BRIDGE_DEPOSIT_PATH) return refusal("not_found", `The bridge route is ${BRIDGE_DEPOSIT_PATH} only.`);
    setLabel(BRIDGE_DEPOSIT_PATH);
    const origin = originRefusal(req, "The bridge route");
    if (origin !== null) return origin;
    const target = requestTarget(req, path, options.maxUrlChars);
    if (isAnswer(target)) return target;
    if (req.method !== "POST") return refusal("method_not_allowed", "This route answers POST only.", { allow: "POST, OPTIONS" });
    if (target.search !== "") return refusal("invalid_request", "This route takes no query.");
    const headers = jsonHeaders(req, 4096);
    if (headers !== null) return headers;
    const taken = context.takeToken(`bridge|${context.client}`, options.limit);
    if (!taken.allowed) return rateLimited(options.limit, taken.retryAfterMs, "to the bridge route from this client");
    const body = await readJsonBody(req, 4096);
    if (isAnswer(body)) return body;
    const value = body.value;
    if (!isRecord(value) || Object.keys(value).some((key) => key !== "sender" && key !== "address")) return refusal("invalid_request", 'The body is { "sender": "<account>", "address": "<its Deposit Wallet>" }.');
    const { sender, address } = value;
    if (typeof sender !== "string" || !isAddress(sender, { strict: false }) || typeof address !== "string" || !isAddress(address, { strict: false })) return refusal("invalid_request", "sender and address are addresses.");
    const owner = getAddress(sender);
    const wallet = getAddress(address);
    if (!depositWalletCandidates(owner).some((candidate) => candidate.address.toLowerCase() === wallet.toLowerCase())) return refusal("invalid_request", "address is not the sender's own Polymarket Deposit Wallet (neither derived form).");
    const answered = await forward(`${POLYMARKET_BRIDGE_ORIGIN}/deposit`, "POST", { "content-type": "application/json", accept: "application/json", ...(options.builderCode === null ? {} : { "x-builder-code": options.builderCode }) }, JSON.stringify({ address: wallet }), {
      fetchImpl: options.fetchImpl,
      timeoutMs: options.upstreamTimeoutMs ?? XO_RELAY_LIMITS.upstreamTimeoutMs,
      maxResponseBytes: 64 * 1024,
      who: "Polymarket's bridge",
      timeoutWords: "Polymarket's bridge did not answer in time. Ask again for the deposit address.",
    });
    if (answered.source === "upstream" && answered.status >= 200 && answered.status < 300) {
      const evm = evmDepositAddress(parseUpstream(answered));
      if (evm !== null) options.store.addBridgeDeposit(owner, evm, wallet, context.nowMs());
    }
    return answered;
  }

  return routeOwner(BRIDGE_PREFIX, {
    preflight: (path) => (options.enabled && path === BRIDGE_DEPOSIT_PATH ? { label: BRIDGE_DEPOSIT_PATH, methods: ["POST"], headers: ["content-type"] } : null),
    answer,
    internalWords: "The bridge route failed to answer.",
    maxAgeS: XO_RELAY_LIMITS.preflightMaxAgeS,
  });
}
