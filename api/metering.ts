import { createRpcPort, rpcPostFromFetch } from "../sdk/chain/rpc.js";
import type { FetchLike } from "../sdk/model.js";
import { DEFAULT_RPC, type ApiConfig, type RateLimitSpec } from "./config.js";
import { bearerOf, checkKey, tierAllows, type PaidRoute } from "./keys.js";
import { bazaarExtension, PAID_ENDPOINTS, SERVICE_NAME, SERVICE_TAGS } from "./listing.js";
import type { KeyRow, MeteringStore } from "./metering-store.js";
import {
  checkPaymentAsset,
  checkPaymentLocally,
  createChainSignatureVerifier,
  createFacilitator,
  decodePaymentHeader,
  encodeHeader,
  HEADER_PAYMENT_REQUIRED,
  HEADER_PAYMENT_RESPONSE,
  requirementsFor,
  X402_VERSION,
  type AssetCheck,
  type Facilitator,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
  type SettlementResponse,
  type SignatureVerifier,
} from "./x402.js";

// Metering (docs/sdk-and-api-design.md section 4: "Payment sits in api/ middleware only; sdk/ never knows about money").
// The server asks this module, before any paid handler runs, whether the call may run, and after it answered, whether the
// answer is delivered:
//
//   1. a key in `Authorization: Bearer` is checked first (keys.ts, constant time); a bad, revoked or expired key is refused
//      with 401 whatever the route; a good one brings its own rate limit, and on a paid route its tier must open it;
//   2. a paid route with no key takes an x402 payment (x402.ts), in the specification's "authorization" flow:
//        no payment header                  -> 402 with PAYMENT-REQUIRED (and the same object as the body);
//        malformed header                   -> 400;
//        any local check fails              -> 402 with the reason (amount, asset, network, payTo, window, signature: an
//                                              EOA's ECDSA or a contract wallet's ERC-1271, read on Base as USDC reads it);
//        the authorization was seen before  -> 402 (replay: the payer and nonce are claimed atomically in the store);
//        the facilitator's /verify refuses  -> 402; it cannot be reached -> 503;
//      then the handler runs. A handler that fails (an error answer, or an internal failure) is NOT settled:
//      the claim is released and nothing is charged. A good answer is settled with /settle and sent with PAYMENT-RESPONSE.
//      A settlement the facilitator says failed withholds the answer (402); a settlement whose outcome is unknown (pending
//      on chain, or no answer from the facilitator) still delivers the answer, so a payer is never charged with nothing
//      delivered, and the authorization stays claimed so it cannot pay twice;
//   3. with no payment configured (no payTo, no price for the route) a paid route answers 503 payments_not_configured;
//      with the pinned USDC not matching the chain, 503 payments_unavailable. A key still works in both cases.

export type Auth =
  | { readonly kind: "none" }
  | { readonly kind: "key"; readonly row: KeyRow; readonly limit: RateLimitSpec }
  | { readonly kind: "refused"; readonly message: string };

export interface Reply {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface Ticket {
  readonly route: PaidRoute;
  readonly payload: PaymentPayload;
  readonly requirements: PaymentRequirements;
  readonly payer: string;
  readonly nonce: string;
}

export type Gate = { readonly kind: "run" } | { readonly kind: "reply"; readonly reply: Reply } | { readonly kind: "paid"; readonly ticket: Ticket };

export type Settled = { readonly deliver: true; readonly headers: Readonly<Record<string, string>> } | { readonly deliver: false; readonly reply: Reply };

export interface MeterDeps {
  readonly config: ApiConfig;
  readonly store: MeteringStore | null;
  readonly facilitator: Facilitator | null;
  // Checks the pinned USDC on chain (x402.ts checkPaymentAsset over the Base RPC). Called before the first payment; a
  // verdict is kept, a thrown error is asked again next time.
  readonly checkAsset: (() => Promise<AssetCheck>) | null;
  // How a payer's signature is checked: as USDC checks it, on Base (x402.ts createChainSignatureVerifier).
  readonly verifySignature: SignatureVerifier | null;
  readonly nowMs: () => number;
  readonly log?: (line: string) => void;
}

export interface PaidRequest {
  readonly route: PaidRoute;
  readonly path: string;
  // The path and query the client asked for (the 402's resource URL is the public origin plus this).
  readonly target: string;
  readonly paymentHeader: string | string[] | undefined;
}

export interface Meter {
  authenticate(header: string | string[] | undefined): Auth;
  // Whether a paid route may run for this caller.
  gate(request: PaidRequest, auth: Auth): Promise<Gate>;
  // After a 2xx answer: settle, and whether to deliver.
  settle(ticket: Ticket): Promise<Settled>;
  // After a failed answer: forget the claim; nothing is charged.
  release(ticket: Ticket): void;
  // For /v1/health.
  describe(): Record<string, unknown>;
}

function errorBody(code: string, message: string): Record<string, unknown> {
  return { error: { code, message } };
}

function usdc(atomic: bigint): string {
  const whole = atomic / 1_000_000n;
  const fraction = (atomic % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction === "" ? whole.toString() : `${whole.toString()}.${fraction}`;
}

export function createMeter(deps: MeterDeps): Meter {
  const { config, store, facilitator, nowMs } = deps;
  const log = deps.log ?? (() => undefined);
  let asset: AssetCheck | null = null;

  function priceOf(route: PaidRoute): bigint | null {
    const payments = config.payments;
    if (payments === null) return null;
    return route === "quote" ? payments.prices.quote : payments.prices.routePrepare;
  }

  function paymentRequired(request: PaidRequest, requirements: PaymentRequirements, error: string): Reply {
    const payments = config.payments;
    const endpoint = PAID_ENDPOINTS.find((e) => e.route === request.route);
    const body: PaymentRequired = {
      x402Version: X402_VERSION,
      error,
      resource: {
        url: `${payments?.publicUrl ?? ""}${request.target}`,
        description: endpoint?.description ?? "",
        mimeType: "application/json",
        serviceName: SERVICE_NAME,
        tags: [...SERVICE_TAGS],
      },
      accepts: [requirements],
      extensions: { bazaar: bazaarExtension(request.route) },
    };
    return { status: 402, body, headers: { [HEADER_PAYMENT_REQUIRED]: encodeHeader(body) } };
  }

  async function assetReady(): Promise<AssetCheck> {
    if (asset !== null) return asset;
    if (deps.checkAsset === null) return { ok: false, reason: "no RPC to check the payment token on" };
    const verdict = await deps.checkAsset();
    asset = verdict;
    if (!verdict.ok) log(`payments disabled: ${verdict.reason}`);
    return verdict;
  }

  return {
    authenticate(header) {
      const bearer = bearerOf(header);
      if (bearer === null) return { kind: "none" };
      if (bearer === "malformed") return { kind: "refused", message: "The Authorization header must be exactly: Bearer <key>." };
      if (store === null) return { kind: "refused", message: "This server checks no keys." };
      const check = checkKey(store, bearer, nowMs());
      if (check.ok) return { kind: "key", row: check.row, limit: check.limit };
      const message = check.reason === "revoked" ? "The key was revoked." : check.reason === "expired" ? "The key has expired." : "The key is not valid.";
      return { kind: "refused", message };
    },

    async gate(request, auth) {
      if (auth.kind === "refused") return { kind: "reply", reply: { status: 401, body: errorBody("unauthorized", auth.message), headers: { "www-authenticate": "Bearer" } } };
      if (request.route === "route_prepare" && config.routePrepare === "off") {
        return { kind: "reply", reply: { status: 403, body: errorBody("route_prepare_not_enabled", "Route prepare is not enabled on this server (API_ROUTE_PREPARE is off).") } };
      }
      const hasPayment = request.paymentHeader !== undefined;
      if (auth.kind === "key") {
        if (hasPayment) return { kind: "reply", reply: { status: 400, body: errorBody("invalid_request", "Send a key or a payment, not both.") } };
        if (!tierAllows(auth.row.tier, request.route)) return { kind: "reply", reply: { status: 403, body: errorBody("key_tier_refused", `This key's tier (${auth.row.tier}) does not include this endpoint.`) } };
        return { kind: "run" };
      }
      if (request.route === "route_prepare" && config.routePrepare === "free") {
        if (hasPayment) return { kind: "reply", reply: { status: 400, body: errorBody("invalid_request", "Route prepare is free on this server; send no payment.") } };
        return { kind: "run" };
      }
      const payments = config.payments;
      const price = priceOf(request.route);
      const verifySignature = deps.verifySignature;
      if (payments === null || price === null || store === null || facilitator === null || verifySignature === null) {
        return { kind: "reply", reply: { status: 503, body: errorBody("payments_not_configured", "Payments are not configured on this server for this endpoint (no payTo or no price); a subscription key still works.") } };
      }
      let verdict: AssetCheck;
      try {
        verdict = await assetReady();
      } catch {
        return { kind: "reply", reply: { status: 503, body: errorBody("payments_unavailable", "The payment token could not be checked on chain just now; nothing was charged. Try again.") } };
      }
      if (!verdict.ok) return { kind: "reply", reply: { status: 503, body: errorBody("payments_unavailable", `Payments are off: ${verdict.reason}.`) } };
      const requirements = requirementsFor(payments, price);
      if (!hasPayment) return { kind: "reply", reply: paymentRequired(request, requirements, "PAYMENT-SIGNATURE header is required") };
      const payload = decodePaymentHeader(request.paymentHeader);
      if (payload === null) {
        const required = paymentRequired(request, requirements, "invalid_payload: the PAYMENT-SIGNATURE header is not a base64 x402 v2 exact-EVM payment payload");
        return { kind: "reply", reply: { ...required, status: 400 } };
      }
      let local;
      try {
        local = await checkPaymentLocally(payload, requirements, request.path, Math.floor(nowMs() / 1000), verifySignature);
      } catch {
        return { kind: "reply", reply: { status: 503, body: errorBody("payments_unavailable", "The payer's signature could not be checked on chain just now; nothing was charged. Try again.") } };
      }
      if (!local.ok) return { kind: "reply", reply: paymentRequired(request, requirements, `${local.reason}: ${local.message}`) };
      if (!store.claimPayment({ payer: local.payer.toLowerCase(), nonce: local.nonce, validBeforeS: local.validBeforeS, route: request.route, amount: requirements.amount }, nowMs())) {
        return { kind: "reply", reply: paymentRequired(request, requirements, "invalid_payload: this authorization was already used (payer and nonce seen before)") };
      }
      const ticket: Ticket = { route: request.route, payload, requirements, payer: local.payer.toLowerCase(), nonce: local.nonce };
      const verified = await facilitator.verify(payload, requirements);
      if (verified.kind === "valid" && (verified.payer === null || verified.payer.toLowerCase() === ticket.payer)) return { kind: "paid", ticket };
      store.releasePayment(ticket.payer, ticket.nonce);
      if (verified.kind === "error") {
        log(`facilitator verify failed: ${verified.detail}`);
        return { kind: "reply", reply: { status: 503, body: errorBody("payments_unavailable", "The payment facilitator could not verify the payment just now; nothing was charged.") } };
      }
      const reason = verified.kind === "invalid" ? verified.reason : "the facilitator named another payer";
      return { kind: "reply", reply: paymentRequired(request, requirements, `the facilitator refused the payment: ${reason}`) };
    },

    async settle(ticket) {
      const payments = config.payments;
      if (store === null || facilitator === null || payments === null) throw new Error("settle without payments");
      const settled = await facilitator.settle(ticket.payload, ticket.requirements);
      const now = nowMs();
      const header = (response: SettlementResponse): Record<string, string> => ({ [HEADER_PAYMENT_RESPONSE]: encodeHeader(response) });
      switch (settled.kind) {
        case "settled":
          store.markPayment(ticket.payer, ticket.nonce, "settled", settled.response.transaction, now);
          return { deliver: true, headers: header(settled.response) };
        case "pending":
          store.markPayment(ticket.payer, ticket.nonce, "settle_unknown", settled.response.transaction, now);
          log(`settlement pending on ${ticket.route}; transaction recorded`);
          return { deliver: true, headers: header(settled.response) };
        case "error": {
          store.markPayment(ticket.payer, ticket.nonce, "settle_unknown", null, now);
          log(`settlement outcome unknown on ${ticket.route}: ${settled.detail}`);
          return { deliver: true, headers: header({ success: false, errorReason: "unexpected_settle_error", transaction: "", network: ticket.requirements.network, payer: ticket.payer }) };
        }
        case "failed": {
          store.markPayment(ticket.payer, ticket.nonce, "settle_failed", null, now);
          const body = { error: { code: "payment_failed", message: `The payment did not settle (${settled.response.errorReason ?? "no reason given"}); the answer is withheld.` } };
          return { deliver: false, reply: { status: 402, body, headers: header(settled.response) } };
        }
      }
    },

    release(ticket) {
      store?.releasePayment(ticket.payer, ticket.nonce);
    },

    describe() {
      const payments = config.payments;
      return {
        keys: store === null ? "not checked" : "Authorization: Bearer <key> (issued by the operator)",
        routePrepare: config.routePrepare,
        x402:
          payments === null
            ? { configured: false }
            : {
                configured: true,
                x402Version: X402_VERSION,
                network: payments.network,
                scheme: "exact",
                prices: Object.fromEntries(PAID_ENDPOINTS.map((e) => [e.path, priceOf(e.route) === null ? null : `${usdc(priceOf(e.route) as bigint)} USDC`])),
                asset: asset === null ? "not checked yet" : asset.ok ? "pinned USDC checked on chain" : `refused: ${asset.reason}`,
              },
      };
    },
  };
}

// The facilitator and the asset check for a configuration, over the fetches the host gives (main.ts: the honest fetch;
// tests: a fake facilitator and a fake Base RPC). Null parts when payments are not configured.
export function paymentParts(
  config: ApiConfig,
  facilitatorFetch: FetchLike,
  rpcFetch: FetchLike,
  nowMs: () => number,
): { readonly facilitator: Facilitator | null; readonly checkAsset: (() => Promise<AssetCheck>) | null; readonly verifySignature: SignatureVerifier | null } {
  const payments = config.payments;
  if (payments === null) return { facilitator: null, checkAsset: null, verifySignature: null };
  const baseRpc = config.chains.find((chain) => chain.chain === "base")?.rpcUrls[0] ?? (DEFAULT_RPC.base[0] as string);
  const port = createRpcPort({ url: baseRpc, post: rpcPostFromFetch(rpcFetch, { nowMs }), methods: ["eth_chainId", "eth_getCode", "eth_getStorageAt", "eth_call"] });
  return { facilitator: createFacilitator(payments.facilitatorUrl, facilitatorFetch), checkAsset: () => checkPaymentAsset(port), verifySignature: createChainSignatureVerifier(port) };
}
