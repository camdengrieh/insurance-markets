import { createHmac, randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";

import { getAddress, toEventSelector, type Address, type Hex } from "viem";

import { formatAtomic, parseDecimalAtomic } from "../src/guardrails/amount.js";
import { checkPriceBand } from "../src/guardrails/limits.js";
import {
  MAX_ORDER_TTL_S,
  PREPARED_TTL_S,
  RELAY_PENDING_AFTER_MS,
  SAFETY_NOTICES,
  digestTag,
  checkPreparedSign,
  type PreparedSign,
  type TypedData,
} from "../src/relay/contract.js";
import { RelayError, type ErrorDetails } from "../src/relay/errors.js";
import { AccountError, deriveAccount, parseOwner } from "../src/xo/account/derive.js";
import { CTF_EXCHANGE, ORDER_NONCE, SIGNATURE_TYPE_XO_SMART_ACCOUNT, USDC_E_DECIMALS } from "../src/xo/chain/constants.js";
import { ExplorerLogReader, readNonceIncrements, type ExplorerTransport } from "../src/xo/chain/reads.js";
import {
  DEFAULT_MIN_SHARES_MICRO,
  DEFAULT_ORDER_TTL_SECONDS,
  MIN_REMAINING_TTL_SECONDS,
  ORDER_CAP_FEE_BPS,
  ORDER_FEE_BOUND_BPS,
  SigningError,
  ZERO_ADDRESS,
  ZERO_BYTES16,
  ZERO_BYTES32,
  assembleWireSignature,
  assertRemainingTtl,
  computeOrderAmounts,
  decodeOrderAmounts,
  formatMicro,
  formatTick,
  gtdExpirationFromTtl,
  hashOrder,
  kernelWrapDigest,
  maxBuyOutlay,
  orderCapAmount,
  orderToWire,
  parsePriceToTick,
  prepareOrderSigning,
  verifyOrderEcdsa,
  type SigningRequest,
  type XoOrder,
} from "../src/xo/signing/index.js";
import { binaryPositionIds } from "../src/xo/signing/ctf.js";
import { buildDecodedOrder, rebuildDecoded } from "../src/xo/signing/rebuild.js";
import { normalizeSignature } from "../src/xo/userop/sign.js";
import { parseDecimalToMicro } from "../src/xo/units.js";
import { isoSecondOf } from "./audit.js";
import { guardSubmit, guardWrite } from "./capabilities.js";
import { needService } from "./config.js";
import type { AbsenceVerdict, ReleaseEvidence, ReservationView } from "./ledger.js";
import type { PreparedRecord } from "./prepared.js";
import type { DurableStore, Json } from "./store.js";
import type { RelayContext, RelayServices, RouteTable } from "./types.js";
import { sanitizeUpstreamText, toRelayError, UpstreamError, type Upstream, type UpstreamResponse } from "./upstream.js";

// Orders: prepare, submit, cancel, list and status (docs/phase1-gap-closing.md sections 3.3, 5.4 and 9,
// docs/research/22).
//
// What each route guarantees, each with a test (test/relay-orders-*.test.ts):
//
//   prepare   derives the account from the owner (a different account in the request is
//             `account_mismatch`), builds an order with nonce 0, signatureType 3 and signer == maker ==
//             account, checks the account state, the maker's exchange nonce and the order book, applies
//             the share floors and the cap rule (every BUY counts makerAmount plus the 1,000 bps hard fee
//             ceiling, SI-2; a SELL counts the larger of its expected proceeds and its shares at the 1.00 USD
//             face value, RT-3, with a minimum-proceeds guard; a seed has its own $10.80 cap, fixed with 800
//             bps), RESERVES that amount in the ledger, and returns what the owner signs plus a decoded block
//             (R1: the signed order fields and the derived terms, rebuilt once here as a self-check) and a
//             summary written from it. No market text is ever put in a summary line.
//   submit    takes ONLY prepared_id and signature. It recomputes the digest from the stored fields,
//             recovers the signer under both digest forms and requires it to be the owner, re-checks the
//             remaining lifetime (at least 90 s), the kill switch, the flags, the tripwires, the caps and
//             the maker's nonce, writes the `sending` marker, and POSTs ONCE (wire prefix 0x01 first, 0x00
//             only after an explicit signature rejection, never after a timeout or any ambiguous result).
//             It answers within 6 s: slower than that it says `pending` and finishes in the background.
//   status    reconciles an ambiguous send by looking: the open-orders list, then `GET /orders/{hash}`,
//             then the exchange's OrderFilled and OrdersMatched logs by order hash (A5). If none of them
//             can say, the order stays ambiguous (and later `unknown`) with its reservation held.
//   cancel    is one HMAC DELETE. No typed-data cancel forms, no batch, no cancel-all. A cancel does not
//             kill the signature on chain: the reservation is held until the order's expiry passes and the
//             order is confirmed gone (A2).
//   list      one signed GET /orders with no query string.
//
// Honest limits, stated where they matter: the gateway's rules (minimum size, minimum lifetime, duplicate
// key, signature prefix, digest form, cancel body) are NOT ESTABLISHABLE WITHOUT A LIVE ORDER, so the
// code learns them from rejections and records them as capability facts; the OrderFilled and OrdersMatched
// event layouts are the standard CTF-exchange ones and were not read from XO's ABI (M); the caps bind this
// relay only and are advisory against an agent that signs with PayBox directly.

// ---- constants ---------------------------------------------------------------------------------------------------------------

const ORDERBOOK = "https://orderbooks.xo.market";
// Durable index of the orders this relay prepared: order hash -> OrderRecord, and reservation id -> hash.
const ORDERS_NS = "orders";
const RESERVATIONS_NS = "order_resv";
// The credential stream stores the HMAC triplet in the vault under this name (relay/crypto.ts).
const TRIPLET_SECRET = "hmac_triplet";

// Lifetime rules (docs/phase1-gap-closing.md OR2, OR17; amendment A3).
export const MIN_TRADE_TTL_S = MIN_REMAINING_TTL_SECONDS + 60;
export const SEED_MIN_TTL_S = 7 * 86_400;
export const SEED_MAX_TTL_S = MAX_ORDER_TTL_S;
// The sweeper takes an expired GTD order down about 10 s after its deadline, and clocks differ by a few
// seconds, so "gone after expiry" is judged this long after the deadline.
export const EXPIRY_MARGIN_MS = 15_000;
// The relay answers the plugin before RELAY_PENDING_AFTER_MS (6 s), so its own `pending` has to come
// first, with the real order hash in it (the server's generic one carries none).
export const SUBMIT_PENDING_AFTER_MS = RELAY_PENDING_AFTER_MS - 500;
// A marketable order is held 500 ms by the gateway (3 s on live sports); OR12 budgets 5 s and 10 s.
export const ORDER_POST_TIMEOUT_MS = 10_000;
const BOOK_MAX_BYTES = 256 * 1024;
const LIST_MAX_BYTES = 1024 * 1024;
const CLOCK_CACHE_MS = 60_000;
// The widest gap between XO's clock and the relay's that prepare accepts (the L1 window is about as wide).
const MAX_PLAUSIBLE_CLOCK_SKEW_S = 120;
const SWEEP_THROTTLE_MS = 20_000;
// How many orders one sweep looks up at the order book (never-sent items cost nothing). prepare sweeps
// lightly so it stays well inside the 6 s budget; an explicit sweep() may do more.
const MAX_SWEEP_ITEMS = 8;
const PREPARE_SWEEP_ITEMS = 2;

// The exchange's fill events. Standard CTF-exchange layouts with the order hash as topic 1; XO's own ABI
// for them was not saved, so a mismatch reads as "no fills found", never as proof of absence on its own
// (see reconcile: absence needs the open-orders list too). M.
export const ORDER_FILLED_TOPIC = toEventSelector("OrderFilled(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)");
export const ORDERS_MATCHED_TOPIC = toEventSelector("OrdersMatched(bytes32,address,uint256,uint256,uint256,uint256)");

// A signature rejection the gateway words itself: a 4xx that talks about the signature, and is not an
// authentication (L2) failure.
const SIGNATURE_REJECTION = /signature|erc-?1271|isvalidsignature/i;
const AUTH_REJECTION = /hmac|l2\b|api[ _-]?key|passphrase|credential|unauthori[sz]ed|timestamp/i;
const DUPLICATE_REJECTION = /duplicate/i;

const FACT_PREFIX = "OR3";
const FACT_DIGEST_FORM = "OR4";
const FACT_CANCEL = "OR11";
const FACT_HMAC_DECODE = "OR10";
const FACT_XO_ADDRESS = "OR9";
const FACT_TYPED_DATA = "PB2";
const ORDER_FACT_IDS = ["AD4", "OR3", "OR4", "OR6", "OR9", "OR10", "OR11", "OR13", "OR17", "PB2"] as const;

type Tif = "GTD" | "FOK" | "FAK";
type Purpose = "trade" | "seed";
type Prefix = "0x01" | "0x00";
type HmacDecode = "b64url-decoded-padded" | "stripped" | "raw";
type CancelVariant = "hash" | "numeric" | "orderId";

// ---- the services this module adds ------------------------------------------------------------------------------------------

export interface L2Request {
  readonly account: string;
  readonly method: "GET" | "POST" | "DELETE";
  // The request path with NO query string: signed requests carry none (OR10).
  readonly path: string;
  // The exact bytes that go on the wire; "" for a body-less request.
  readonly body: string;
  readonly timestampSeconds: number;
}

// Signs one request with the account's stored HMAC triplet. The credential stream may provide its own
// (services.l2auth); the default reads the vault itself.
export interface L2Auth {
  has(account: string): Promise<boolean>;
  // Header names are lower-case. Throws `precondition_failed` when the account has no usable credentials.
  headers(request: L2Request): Promise<Record<string, string>>;
}

export type FillsReading =
  | { readonly state: "found"; readonly filledMicro: bigint | null; readonly feeAtomic: bigint | null; readonly cashAtomic: bigint | null; readonly logs: number }
  | { readonly state: "none" }
  | { readonly state: "unknown" };

export type NonceReading = { readonly state: "zero" | "moved" | "unknown" };

// Chain reads this module needs. The default is built from the relay's upstream (explorer logs); a
// test or the integration step can supply its own.
export interface OrderChain {
  makerNonce(maker: Address, signal?: AbortSignal): Promise<NonceReading>;
  // OrderFilled and OrdersMatched by order hash. `side` says which leg of the fill is this order's cash.
  fills(orderHash: Hex, side: 0 | 1, signal?: AbortSignal): Promise<FillsReading>;
}

// Whether a market's token belongs to a market this owner created (only then is a seed accepted). The
// creation stream provides it; without one a seed is refused (fail closed).
export interface CreatedMarkets {
  createdBy(account: string, tokenId: string): Promise<"yes" | "no" | "unknown">;
}

declare module "./types.js" {
  interface RelayServices {
    readonly l2auth?: L2Auth;
    readonly orderChain?: OrderChain;
    readonly createdMarkets?: CreatedMarkets;
  }
}

// ---- stored shapes ------------------------------------------------------------------------------------------------------------

// Everything that defines one order, as JSON. Decimal strings for every integer that can be large.
type OrderFields = {
  readonly hash: string;
  readonly owner: string;
  readonly account: string;
  readonly tokenId: string;
  readonly salt: string;
  readonly side: 0 | 1;
  readonly tick: number;
  readonly sharesMicro: string;
  readonly collateralMicro: string;
  readonly makerAmount: string;
  readonly takerAmount: string;
  readonly expiration: number;
  readonly tif: Tif;
  readonly postOnly: boolean;
  readonly purpose: Purpose;
  readonly feeBps: number;
  readonly capAtomic: string;
  readonly reservationId: string;
  // XO's clock minus the relay's, in whole seconds, as measured at prepare.
  readonly clockOffsetS: number;
  readonly conditionId: string | null;
  // The Kernel-wrapped digest the owner signs.
  readonly digest: string;
};

type FinalState = "filled" | "partially_filled" | "cancelled" | "expired" | "not_placed";

type OrderRecord = {
  readonly v: 1;
  readonly order: OrderFields;
  readonly preparedId: string | null;
  readonly createdAtMs: number;
  readonly sentAtMs: number | null;
  readonly ambiguousAtMs: number | null;
  readonly cancelRequestedAtMs: number | null;
  readonly final: { readonly state: FinalState; readonly filledMicro: string; readonly atMs: number } | null;
};

const HEX32 = /^0x[0-9a-f]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]{0,77})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFields(value: unknown): OrderFields {
  const bad = (): never => {
    throw new RelayError("internal", "A stored order is unreadable, so nothing was sent.");
  };
  if (!isRecord(value)) return bad();
  const text = (key: string, pattern: RegExp): string => {
    const found = value[key];
    return typeof found === "string" && pattern.test(found) ? found : bad();
  };
  const whole = (key: string): number => {
    const found = value[key];
    return typeof found === "number" && Number.isSafeInteger(found) && found >= 0 ? found : bad();
  };
  const side = value["side"];
  const tif = value["tif"];
  const purpose = value["purpose"];
  const postOnly = value["postOnly"];
  const conditionId = value["conditionId"];
  if ((side !== 0 && side !== 1) || (tif !== "GTD" && tif !== "FOK" && tif !== "FAK") || (purpose !== "trade" && purpose !== "seed") || typeof postOnly !== "boolean") return bad();
  if (conditionId !== null && !(typeof conditionId === "string" && HEX32.test(conditionId))) return bad();
  const offset = value["clockOffsetS"];
  if (typeof offset !== "number" || !Number.isSafeInteger(offset)) return bad();
  return {
    hash: text("hash", HEX32),
    owner: text("owner", /^0x[0-9a-fA-F]{40}$/),
    account: text("account", /^0x[0-9a-fA-F]{40}$/),
    tokenId: text("tokenId", DECIMAL),
    salt: text("salt", DECIMAL),
    side,
    tick: whole("tick"),
    sharesMicro: text("sharesMicro", DECIMAL),
    collateralMicro: text("collateralMicro", DECIMAL),
    makerAmount: text("makerAmount", DECIMAL),
    takerAmount: text("takerAmount", DECIMAL),
    expiration: whole("expiration"),
    tif,
    postOnly,
    purpose,
    feeBps: whole("feeBps"),
    capAtomic: text("capAtomic", DECIMAL),
    reservationId: text("reservationId", /^[A-Za-z0-9_-]{8,64}$/),
    clockOffsetS: offset,
    conditionId: conditionId as string | null,
    digest: text("digest", HEX32),
  };
}

function orderOf(fields: OrderFields): XoOrder {
  const maker = getAddress(fields.account);
  return {
    salt: BigInt(fields.salt),
    maker,
    signer: maker,
    beneficiary: ZERO_ADDRESS,
    tokenId: BigInt(fields.tokenId),
    makerAmount: BigInt(fields.makerAmount),
    takerAmount: BigInt(fields.takerAmount),
    expiration: BigInt(fields.expiration),
    nonce: ORDER_NONCE,
    identifier: ZERO_BYTES16,
    metadata: ZERO_BYTES32,
    side: fields.side,
    signatureType: SIGNATURE_TYPE_XO_SMART_ACCOUNT,
  };
}

const usd = (atomic: bigint): string => formatAtomic(atomic, USDC_E_DECIMALS);
const lower = (value: string): string => value.toLowerCase();

// True only when a balance was read and is exactly below what the order can cost.
function belowBalance(balanceUsd: string | null, costAtomic: bigint): boolean {
  if (balanceUsd === null) return false;
  const parsed = parseDecimalAtomic(balanceUsd, USDC_E_DECIMALS);
  return parsed.ok && parsed.value < costAtomic;
}

// ---- small helpers ------------------------------------------------------------------------------------------------------------

function signingFailure(error: unknown): RelayError {
  if (error instanceof SigningError) {
    return new RelayError("invalid_request", error.message, { reason: error.code });
  }
  return new RelayError("internal", "The relay failed while building the order. Nothing was sent.");
}

function refuse(code: "invalid_request" | "precondition_failed", message: string, details?: ErrorDetails): RelayError {
  return new RelayError(code, message, details);
}

// Maps a thrown upstream failure to the relay's wire error; anything else passes through.
function asRelayError(error: unknown): unknown {
  return error instanceof UpstreamError ? toRelayError(error) : error;
}

function derive(body: { readonly owner: string; readonly account?: string | undefined }): { readonly owner: Address; readonly account: Address; readonly key: string } {
  let owner: Address;
  let account: Address;
  try {
    owner = parseOwner(body.owner);
    account = deriveAccount(owner);
  } catch (error) {
    if (error instanceof AccountError) throw new RelayError("invalid_request", "That owner address cannot own an XO account.", { reason: error.code });
    throw error;
  }
  // Invariant 1: a caller-supplied account is compared and never used.
  if (body.account !== undefined && lower(body.account) !== lower(account)) {
    throw new RelayError("account_mismatch", "The account does not belong to this owner. The relay derives it from the owner.");
  }
  return { owner, account, key: lower(account) };
}

function sanitizeForDetail(text: string, max = 160): string {
  return sanitizeUpstreamText(text, max);
}

async function backgroundSafe(work: Promise<unknown>): Promise<void> {
  try {
    await work;
  } catch {
    // Background work reports through the audit log and the prepared state; it never rejects.
  }
}

// ---- the L2 signer ------------------------------------------------------------------------------------------------------------

const DECODES: readonly HmacDecode[] = ["b64url-decoded-padded", "stripped", "raw"];

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, ""), "base64");
}

function parseTriplet(text: string): { readonly apiKey: string; readonly secret: string; readonly passphrase: string } | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) return undefined;
    const apiKey = value["apiKey"] ?? value["api_key"];
    const secret = value["secret"];
    const passphrase = value["passphrase"];
    if (typeof apiKey !== "string" || typeof secret !== "string" || typeof passphrase !== "string") return undefined;
    const token = /^[\x21-\x7e]{1,512}$/;
    return token.test(apiKey) && token.test(passphrase) && /^[A-Za-z0-9+/_=-]+$/.test(secret) ? { apiKey, secret, passphrase } : undefined;
  } catch {
    return undefined;
  }
}

// timestamp + METHOD + path + body, HMAC-SHA256, output URL-safe base64. The key decoding and the
// padding are what probe A of the credential flow selects (capability OR10); the target never matters
// because nothing signed here carries a query string.
export function hmacHeaderValue(secret: string, decode: HmacDecode, message: string): string {
  const key = decode === "raw" ? Buffer.from(secret, "utf8") : decodeBase64Url(secret);
  const text = createHmac("sha256", key).update(message, "utf8").digest("base64").replace(/\+/g, "-").replace(/\//g, "_");
  return decode === "stripped" ? text.replace(/=+$/, "") : text;
}

function vaultL2(context: RelayContext): L2Auth {
  const noCredentials = (credentials: string): RelayError =>
    new RelayError("precondition_failed", "This account has no stored XO credentials yet. Connect it first (auth prepare and submit).", { credentials });
  return {
    async has(account) {
      const secrets = context.services.secrets;
      if (secrets === undefined) return false;
      try {
        return await secrets.has(lower(account), TRIPLET_SECRET);
      } catch {
        return false;
      }
    },
    async headers(request) {
      const secrets = context.services.secrets;
      if (secrets === undefined) throw noCredentials("no_store");
      const stored = await secrets.get(lower(request.account), TRIPLET_SECRET);
      if (stored === undefined) throw noCredentials("none");
      const triplet = parseTriplet(stored.reveal());
      if (triplet === undefined) throw noCredentials("unreadable");
      const decodeFact = context.services.capabilities?.value(FACT_HMAC_DECODE);
      const decode = (DECODES as readonly (string | undefined)[]).includes(decodeFact) ? (decodeFact as HmacDecode) : "b64url-decoded-padded";
      const timestamp = String(request.timestampSeconds);
      const signature = hmacHeaderValue(triplet.secret, decode, `${timestamp}${request.method}${request.path}${request.body}`);
      const headers: Record<string, string> = {
        xo_api_key: triplet.apiKey,
        xo_timestamp: timestamp,
        xo_passphrase: triplet.passphrase,
        xo_signature: signature,
      };
      if (context.services.capabilities?.value(FACT_XO_ADDRESS) === "xo_address") headers["xo_address"] = getAddress(request.account);
      return headers;
    },
  };
}

function l2Of(context: RelayContext): L2Auth {
  return context.services.l2auth ?? vaultL2(context);
}

// ---- the default chain reads (explorer logs through the relay's upstream) -----------------------------------------------------

function upstreamExplorerTransport(upstream: Upstream, signal: AbortSignal | undefined): ExplorerTransport {
  return {
    async getJson(url) {
      const response = await upstream.request({ method: "GET", url, purpose: "explorer_logs", ...(signal === undefined ? {} : { signal }) });
      if (!response.ok) throw Object.assign(new Error("explorer answered with an error status"), { kind: "http_status", status: response.status });
      return upstream.json(response);
    },
  };
}

// Decodes one OrderFilled row for `side`: [makerAssetId, takerAssetId, makerAmountFilled, takerAmountFilled, fee].
function decodeFill(data: string, side: 0 | 1): { readonly shares: bigint; readonly cash: bigint; readonly fee: bigint } | undefined {
  if (!/^0x[0-9a-fA-F]{320}$/.test(data)) return undefined;
  const word = (index: number): bigint => BigInt(`0x${data.slice(2 + index * 64, 2 + (index + 1) * 64)}`);
  const makerAmount = word(2);
  const takerAmount = word(3);
  // A BUY gave collateral (maker side) and got shares; a SELL gave shares and got collateral.
  return side === 0 ? { shares: takerAmount, cash: makerAmount, fee: word(4) } : { shares: makerAmount, cash: takerAmount, fee: word(4) };
}

function explorerChain(context: RelayContext): OrderChain {
  const upstream = needService(context, "upstream");
  const reader = (signal: AbortSignal | undefined): ExplorerLogReader => new ExplorerLogReader({ transport: upstreamExplorerTransport(upstream, signal), maxRequests: 12 });
  return {
    async makerNonce(maker, signal) {
      try {
        const read = await readNonceIncrements(reader(signal), maker);
        if (read.logs.length > 0) return { state: "moved" };
        return read.complete ? { state: "zero" } : { state: "unknown" };
      } catch {
        return { state: "unknown" };
      }
    },
    async fills(orderHash, side, signal) {
      try {
        const explorer = reader(signal);
        const [filled, matched] = await Promise.all([
          explorer.getLogs({ address: CTF_EXCHANGE, topic0: ORDER_FILLED_TOPIC, topic1: orderHash }),
          explorer.getLogs({ address: CTF_EXCHANGE, topic0: ORDERS_MATCHED_TOPIC, topic1: orderHash }),
        ]);
        const rows = filled.logs.length + matched.logs.length;
        if (rows > 0) {
          let shares = 0n;
          let cash = 0n;
          let fee = 0n;
          let decoded = 0;
          for (const log of filled.logs) {
            const fill = decodeFill(log.data, side);
            if (fill === undefined) continue;
            decoded += 1;
            shares += fill.shares;
            cash += fill.cash;
            fee += fill.fee;
          }
          const all = decoded === filled.logs.length && filled.logs.length > 0;
          return { state: "found", filledMicro: all ? shares : null, feeAtomic: all ? fee : null, cashAtomic: all ? cash : null, logs: rows };
        }
        return filled.complete && matched.complete ? { state: "none" } : { state: "unknown" };
      } catch {
        return { state: "unknown" };
      }
    },
  };
}

function chainOf(context: RelayContext): OrderChain {
  return context.services.orderChain ?? explorerChain(context);
}

// ---- reading XO's clock, the book and the account's orders -------------------------------------------------------------------------

const clockCache = new WeakMap<object, { readonly offsetS: number; readonly atMs: number }>();

async function readText(upstream: Upstream, url: string, purpose: string, maxBytes: number, signal: AbortSignal | undefined, headers?: Record<string, string>): Promise<UpstreamResponse> {
  try {
    return await upstream.request({
      method: "GET",
      url,
      purpose,
      maxBytes,
      ...(headers === undefined ? {} : { headers }),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error) {
    throw asRelayError(error);
  }
}

// GET /time answers a bare integer of seconds. The offset against the relay's clock is remembered for a
// minute, and the order's expiry, the L2 timestamps and the lifetime checks all use XO's clock.
async function xoClock(context: RelayContext, fresh: boolean): Promise<{ readonly nowS: number; readonly offsetS: number }> {
  const upstream = needService(context, "upstream");
  const localS = Math.floor(context.now() / 1000);
  const cached = clockCache.get(context.services);
  if (!fresh && cached !== undefined && context.now() - cached.atMs < CLOCK_CACHE_MS) return { nowS: localS + cached.offsetS, offsetS: cached.offsetS };
  const response = await readText(upstream, `${ORDERBOOK}/time`, "orderbook_time", 1024, context.signal);
  const match = response.ok ? /^\s*"?(\d{9,12})"?\s*$/.exec(response.body) : null;
  if (match === null) {
    throw new RelayError("upstream_rejected", "The order book did not give a usable time, so nothing was prepared.", { host: response.host, status: response.status });
  }
  const offsetS = Number(match[1]) - localS;
  // An order's expiry is XO's now plus its lifetime, so an XO clock far from the relay's would stretch the
  // lifetime protection (300 s default, 3600 s ceiling) without any check noticing. Prepare refuses that.
  if (fresh && Math.abs(offsetS) > MAX_PLAUSIBLE_CLOCK_SKEW_S) {
    throw new RelayError("upstream_rejected", "The order book's clock differs from this relay's by more than two minutes, so no order was prepared (an order's lifetime is counted on that clock).", { reason: "clock_implausible" });
  }
  clockCache.set(context.services, { offsetS, atMs: context.now() });
  return { nowS: Number(match[1]), offsetS };
}

type Book = {
  readonly conditionId: string | null;
  readonly bestBid: number | undefined;
  readonly bestAsk: number | undefined;
  readonly lastTrade: number | undefined;
  readonly minOrderSizeMicro: bigint;
  readonly tickSize: string | undefined;
};

function levelTicks(levels: unknown, pick: "min" | "max"): number | undefined {
  if (!Array.isArray(levels)) return undefined;
  let best: number | undefined;
  for (const level of levels) {
    if (!isRecord(level) || typeof level["price"] !== "string") continue;
    let tick: number;
    try {
      tick = parsePriceToTick(level["price"]);
    } catch {
      continue;
    }
    if (best === undefined || (pick === "min" ? tick < best : tick > best)) best = tick;
  }
  return best;
}

async function readBook(context: RelayContext, tokenId: string): Promise<Book> {
  const upstream = needService(context, "upstream");
  const response = await readText(upstream, `${ORDERBOOK}/book?token_id=${encodeURIComponent(tokenId)}`, "orderbook_book", BOOK_MAX_BYTES, context.signal);
  if (response.status === 404 || response.status === 400) {
    throw new RelayError("invalid_request", "The order book has no market for that token_id.", { reason: "unknown_token" });
  }
  let json: unknown;
  try {
    json = response.ok ? upstream.json(response) : undefined;
  } catch {
    json = undefined;
  }
  if (!isRecord(json)) {
    throw new RelayError("upstream_rejected", "The order book answered with something unreadable, so nothing was prepared.", { host: response.host, status: response.status });
  }
  const market = json["market"];
  const minOrder = parseDecimalToMicro(json["min_order_size"] ?? "0");
  let lastTrade: number | undefined;
  if (typeof json["last_trade_price"] === "string") {
    try {
      lastTrade = parsePriceToTick(json["last_trade_price"]);
    } catch {
      lastTrade = undefined;
    }
  }
  return {
    conditionId: typeof market === "string" && /^0x[0-9a-fA-F]{64}$/.test(market) ? market.toLowerCase() : null,
    bestBid: levelTicks(json["bids"], "max"),
    bestAsk: levelTicks(json["asks"], "min"),
    lastTrade,
    minOrderSizeMicro: minOrder ?? 0n,
    tickSize: typeof json["tick_size"] === "string" ? json["tick_size"] : undefined,
  };
}

type GatewayRow = {
  readonly hash: string;
  readonly id: string | null;
  readonly status: string;
  readonly originalMicro: bigint | null;
  readonly matchedMicro: bigint;
  readonly feeRateBps: number | null;
};

function parseRow(raw: unknown): GatewayRow | undefined {
  if (!isRecord(raw)) return undefined;
  const hashValue = raw["order_hash"] ?? raw["orderHash"] ?? raw["hash"];
  if (typeof hashValue !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hashValue)) return undefined;
  const idValue = raw["id"];
  const feeValue = raw["fee_rate_bps"] ?? raw["feeRateBps"];
  const fee = typeof feeValue === "number" ? feeValue : typeof feeValue === "string" && /^\d{1,6}$/.test(feeValue) ? Number(feeValue) : null;
  return {
    hash: hashValue.toLowerCase(),
    id: typeof idValue === "string" || typeof idValue === "number" ? String(idValue) : null,
    status: typeof raw["status"] === "string" ? raw["status"].toUpperCase() : "",
    originalMicro: parseDecimalToMicro(raw["original_size"] ?? raw["originalSize"]),
    matchedMicro: parseDecimalToMicro(raw["size_matched"] ?? raw["sizeMatched"] ?? "0") ?? 0n,
    feeRateBps: fee !== null && Number.isFinite(fee) ? fee : null,
  };
}

async function signedGet(context: RelayContext, account: string, path: string, purpose: string): Promise<UpstreamResponse> {
  const upstream = needService(context, "upstream");
  const clock = await xoClock(context, false);
  const headers = await l2Of(context).headers({ account, method: "GET", path, body: "", timestampSeconds: clock.nowS });
  return readText(upstream, `${ORDERBOOK}${path}`, purpose, LIST_MAX_BYTES, context.signal, headers);
}

type OpenOrders = { readonly rows: readonly GatewayRow[]; readonly complete: boolean };

// GET /orders with no query string (OR10): one page, and `complete` says whether it was the last.
async function readOpenOrders(context: RelayContext, account: string): Promise<OpenOrders> {
  const upstream = needService(context, "upstream");
  const response = await signedGet(context, account, "/orders", "orders_list");
  if (response.status === 401 || response.status === 403) {
    throw new RelayError("upstream_rejected", "The order book refused this account's stored credentials.", { status: response.status, reason: "credentials_refused" });
  }
  let json: unknown;
  try {
    json = response.ok ? upstream.json(response) : undefined;
  } catch {
    json = undefined;
  }
  const list = Array.isArray(json) ? json : isRecord(json) ? (json["data"] ?? json["orders"]) : undefined;
  if (!Array.isArray(list)) {
    throw new RelayError("upstream_rejected", "The order book's order list was unreadable.", { host: response.host, status: response.status });
  }
  const cursor = isRecord(json) ? json["next_cursor"] : undefined;
  const complete = cursor === undefined || cursor === null || cursor === "" || cursor === "LTE=";
  const rows = list.flatMap((entry) => {
    const row = parseRow(entry);
    return row === undefined ? [] : [row];
  });
  return { rows, complete: complete && rows.length === list.length };
}

async function readOrderRow(context: RelayContext, account: string, hash: string): Promise<GatewayRow | undefined> {
  const upstream = needService(context, "upstream");
  const response = await signedGet(context, account, `/orders/${hash}`, "order_get");
  if (response.status === 404) return undefined;
  if (response.status === 401 || response.status === 403) {
    throw new RelayError("upstream_rejected", "The order book refused this account's stored credentials.", { status: response.status, reason: "credentials_refused" });
  }
  if (!response.ok) throw new RelayError("upstream_rejected", "The order book could not give this order's status.", { status: response.status });
  let json: unknown;
  try {
    json = upstream.json(response);
  } catch {
    json = undefined;
  }
  const row = parseRow(json);
  // A row for some other order is never this order's status.
  return row !== undefined && row.hash === hash ? row : undefined;
}

// ---- state helpers --------------------------------------------------------------------------------------------------------------------

function loadRecord(state: DurableStore, hash: string): OrderRecord | undefined {
  const stored = state.get<Json>(ORDERS_NS, hash);
  if (!isRecord(stored) || stored["v"] !== 1) return undefined;
  try {
    const order = parseFields(stored["order"]);
    return {
      v: 1,
      order,
      preparedId: typeof stored["preparedId"] === "string" ? stored["preparedId"] : null,
      createdAtMs: Number(stored["createdAtMs"] ?? 0),
      sentAtMs: typeof stored["sentAtMs"] === "number" ? stored["sentAtMs"] : null,
      ambiguousAtMs: typeof stored["ambiguousAtMs"] === "number" ? stored["ambiguousAtMs"] : null,
      cancelRequestedAtMs: typeof stored["cancelRequestedAtMs"] === "number" ? stored["cancelRequestedAtMs"] : null,
      final: ((): OrderRecord["final"] => {
        const final = stored["final"];
        if (!isRecord(final) || typeof final["state"] !== "string" || typeof final["filledMicro"] !== "string" || typeof final["atMs"] !== "number") return null;
        return { state: final["state"] as FinalState, filledMicro: final["filledMicro"], atMs: final["atMs"] };
      })(),
    };
  } catch {
    return undefined;
  }
}

function loadByReservation(state: DurableStore, reservationId: string): OrderRecord | undefined {
  const hash = state.get<Json>(RESERVATIONS_NS, reservationId);
  return typeof hash === "string" ? loadRecord(state, hash) : undefined;
}

async function patchRecord(state: DurableStore, hash: string, change: (record: OrderRecord) => OrderRecord): Promise<OrderRecord | undefined> {
  return state.transact<OrderRecord | undefined>((reader) => {
    const current = reader.get<Json>(ORDERS_NS, hash);
    if (!isRecord(current) || current["v"] !== 1) return { ops: [], result: undefined };
    const loaded = loadRecord(state, hash);
    if (loaded === undefined) return { ops: [], result: undefined };
    const next = change(loaded);
    return { ops: [{ ns: ORDERS_NS, key: hash, value: next as unknown as Json }], result: next };
  });
}

function spentFor(order: OrderFields, filledMicro: bigint): bigint {
  const cap = BigInt(order.capAtomic);
  if (filledMicro <= 0n) return 0n;
  // Collateral of the filled part, rounded up so the settled amount is never understated.
  const cash = (filledMicro * BigInt(order.tick) + 999n) / 1000n;
  // RT-3: a SELL counts the larger of the cash it brought and the face value (1.00 USD a share) of the shares that
  // filled, the same rule that sized its reservation; so a part-filled SELL settles at the face value of what filled.
  const counted = order.side === 0 ? maxBuyOutlay(cash > 0n ? cash : 1n, order.feeBps) : cash > filledMicro ? cash : filledMicro;
  return counted > cap ? cap : counted;
}

// ---- the lookup that every reconcile uses ----------------------------------------------------------------------------------------------

type Lookup =
  | { readonly kind: "row"; readonly source: "orders_list" | "order_get"; readonly row: GatewayRow }
  | { readonly kind: "fills"; readonly fills: Extract<FillsReading, { state: "found" }> }
  | { readonly kind: "none"; readonly complete: boolean }
  | { readonly kind: "unreadable" };

type LookupCache = Map<string, Promise<OpenOrders>>;

async function lookupOrder(context: RelayContext, order: OrderFields, cache?: LookupCache): Promise<Lookup> {
  let listed: OpenOrders | undefined;
  try {
    const key = lower(order.account);
    const pending = cache?.get(key) ?? readOpenOrders(context, order.account);
    cache?.set(key, pending);
    listed = await pending;
  } catch {
    listed = undefined;
  }
  const inList = listed?.rows.find((row) => row.hash === order.hash);
  if (inList !== undefined) return { kind: "row", source: "orders_list", row: inList };
  let single: GatewayRow | undefined;
  try {
    single = await readOrderRow(context, order.account, order.hash);
  } catch {
    single = undefined;
  }
  if (single !== undefined) return { kind: "row", source: "order_get", row: single };
  const fills = await chainOf(context).fills(order.hash as Hex, order.side, context.signal);
  if (fills.state === "found") return { kind: "fills", fills };
  if (fills.state === "none" && listed?.complete === true) return { kind: "none", complete: true };
  if (listed === undefined && fills.state === "unknown") return { kind: "unreadable" };
  return { kind: "none", complete: false };
}

type ShownState = "unknown" | "pending" | "open" | "partially_filled" | "filled" | "cancelled" | "expired" | "rejected" | "ambiguous";

type Shown = {
  readonly state: ShownState;
  readonly filledMicro: bigint | null;
  readonly remainingMicro: bigint | null;
  readonly detail: string;
  // Set when the order has reached an end that the ledger should hear about.
  readonly ended: { readonly state: "filled" | "partially_filled" | "cancelled" | "expired"; readonly filledMicro: bigint } | null;
};

function shownFromRow(order: OrderFields, row: GatewayRow): Shown {
  const original = row.originalMicro ?? BigInt(order.sharesMicro);
  const matched = row.matchedMicro;
  const remaining = original > matched ? original - matched : 0n;
  const base = { filledMicro: matched, remainingMicro: remaining };
  switch (row.status) {
    case "LIVE":
    case "OPEN":
    case "ACTIVE":
      if (matched === 0n) return { ...base, state: "open", detail: "resting", ended: null };
      return matched >= original ? { ...base, state: "filled", detail: "fully_matched", ended: { state: "filled", filledMicro: matched } } : { ...base, state: "partially_filled", detail: "resting", ended: null };
    case "DELAYED":
      return { ...base, state: "pending", detail: "held_by_the_taker_delay", ended: null };
    case "MATCHED":
    case "FILLED":
      return { filledMicro: original > 0n ? original : matched, remainingMicro: 0n, state: "filled", detail: "fully_matched", ended: { state: "filled", filledMicro: original > 0n ? original : matched } };
    case "CANCELED":
    case "CANCELLED":
      return { ...base, state: "cancelled", detail: "cancelled", ended: { state: "cancelled", filledMicro: matched } };
    case "EXPIRED":
      return { ...base, state: "expired", detail: "expired", ended: { state: "expired", filledMicro: matched } };
    default:
      return { ...base, state: "unknown", detail: "unrecognised_status", ended: null };
  }
}

function shownFromFills(order: OrderFields, fills: Extract<FillsReading, { state: "found" }>): Shown {
  const total = BigInt(order.sharesMicro);
  if (fills.filledMicro === null) {
    // The logs exist, the amounts could not be decoded: the order did trade, so it is not "not placed".
    return { state: "filled", filledMicro: null, remainingMicro: null, detail: "fill_logs_found", ended: { state: "filled", filledMicro: total } };
  }
  const filled = fills.filledMicro > total ? total : fills.filledMicro;
  const remaining = total - filled;
  return filled >= total
    ? { state: "filled", filledMicro: filled, remainingMicro: 0n, detail: "fill_logs_found", ended: { state: "filled", filledMicro: filled } }
    : { state: "partially_filled", filledMicro: filled, remainingMicro: remaining, detail: "no_longer_resting", ended: { state: "partially_filled", filledMicro: filled } };
}

// The realised fee on a fill must stay within the bound (OR7, OR8). Re-checked on every fill read.
function feeExceedsBound(order: OrderFields, row: GatewayRow | undefined, fills: FillsReading | undefined): boolean {
  if (row?.feeRateBps !== null && row?.feeRateBps !== undefined && row.feeRateBps > ORDER_FEE_BOUND_BPS) return true;
  if (fills?.state === "found" && fills.feeAtomic !== null && fills.cashAtomic !== null && fills.cashAtomic > 0n) {
    // The contract bounds each leg's fee by floor(cash x bound / 10000); sum the legs against the sum of cash.
    return fills.feeAtomic * 10_000n > fills.cashAtomic * BigInt(ORDER_FEE_BOUND_BPS) + 10_000n * BigInt(fills.logs);
  }
  void order;
  return false;
}

// ---- the routes -------------------------------------------------------------------------------------------------------------------------

export interface OrderRouteDeps {
  // Random bytes for the salt and the reservation id. Tests inject a deterministic source.
  readonly random?: (bytes: number) => Buffer;
  // The relay answers `pending` this long after submit started (default 5.5 s, under the 6 s budget).
  readonly pendingAfterMs?: number;
  // How long the POST /order request itself may take (default 10 s).
  readonly postTimeoutMs?: number;
}

export interface OrderRoutes {
  readonly routes: RouteTable;
  // Resolves when every background send/finish started so far has finished.
  idle(): Promise<void>;
  // Releases or settles reservations whose orders are gone (A2). Runs on its own at prepare and list.
  sweep(context: RelayContext): Promise<{ readonly released: number; readonly present: number; readonly unknown: number }>;
}

function nonZeroSalt(random: (bytes: number) => Buffer): bigint {
  for (;;) {
    const value = BigInt(`0x${random(6).toString("hex")}`);
    if (value > 0n) return value;
  }
}

export function createOrderRoutes(deps: OrderRouteDeps = {}): OrderRoutes {
  const random = deps.random ?? ((bytes: number): Buffer => randomBytes(bytes));
  const pendingAfterMs = deps.pendingAfterMs ?? SUBMIT_PENDING_AFTER_MS;
  const postTimeoutMs = deps.postTimeoutMs ?? ORDER_POST_TIMEOUT_MS;
  const background = new Set<Promise<void>>();
  const lastSweep = new WeakMap<object, number>();

  function track(work: Promise<unknown>): void {
    const tracked = backgroundSafe(work).finally(() => background.delete(tracked));
    background.add(tracked);
  }

  async function audit(context: RelayContext, event: Parameters<NonNullable<RelayServices["audit"]>["write"]>[0]): Promise<void> {
    try {
      await context.services.audit?.write(event);
    } catch {
      // The audit log reports its own health; a failure here never changes an order's outcome.
    }
  }

  // ---- ledger bookkeeping ------------------------------------------------------------------------------------------------------

  async function finishLedger(context: RelayContext, record: OrderRecord, ended: NonNullable<Shown["ended"]>, source: ReleaseEvidence["source"]): Promise<void> {
    const ledger = context.services.ledger;
    const state = needService(context, "state");
    if (ledger === undefined || record.final !== null) return;
    const order = record.order;
    const nowMs = context.now();
    const due = nowMs >= order.expiration * 1000 + EXPIRY_MARGIN_MS;
    const evidence: ReleaseEvidence = { kind: "absent_after_expiry", source, checkedAtMs: nowMs };
    let finalState: FinalState | undefined;
    try {
      if (ended.state === "filled") {
        await ledger.commit(order.reservationId);
        finalState = "filled";
      } else if (due && ended.filledMicro === 0n) {
        await ledger.release(order.reservationId, evidence);
        finalState = ended.state === "expired" ? "expired" : "cancelled";
      } else if (due) {
        await ledger.settle(order.reservationId, spentFor(order, ended.filledMicro), evidence);
        finalState = "partially_filled";
      }
    } catch (error) {
      await audit(context, { ev: "error", code: "order_ledger_finish", outcome: "error", hash: order.hash, note: error instanceof RelayError ? error.code : "failed" });
      return;
    }
    if (finalState !== undefined) {
      const final = { state: finalState, filledMicro: ended.filledMicro.toString(), atMs: nowMs };
      await patchRecord(state, order.hash, (current) => ({ ...current, final }));
    }
  }

  async function checkFee(context: RelayContext, order: OrderFields, row: GatewayRow | undefined, fills: FillsReading | undefined): Promise<void> {
    if (!feeExceedsBound(order, row, fills)) return;
    // Past the bound the contract itself should have refused: the fee ceiling changed or the contract is
    // not what was pinned. Latch it (the relay goes read-only) and say so.
    await context.services.tripwires
      ?.trip({ id: "order_fee_over_bound", detail: "A fill carried a fee above the pinned 800 bps bound. The relay is read-only until the operator looks." })
      .catch(() => undefined);
    await context.services.alerts?.raise({ id: "order_fee_over_bound", severity: "critical", message: "A fill on an order carried a fee above the 800 bps bound the relay pins." });
  }

  // ---- reconcile ---------------------------------------------------------------------------------------------------------------

  // Looks for an order and brings the stored state, the prepared item and the ledger in line with what it
  // found. Serialised per order. Returns what the status route shows.
  async function reconcile(context: RelayContext, hash: string): Promise<Shown & { readonly record: OrderRecord }> {
    const state = needService(context, "state");
    const locks = needService(context, "locks");
    return locks.run(`order:${hash}`, async () => {
      const record = loadRecord(state, hash);
      if (record === undefined) throw new RelayError("not_found", "This relay has no record of that order.");
      const order = record.order;
      const prepared = context.services.prepared;
      const item = record.preparedId === null ? undefined : prepared?.get(record.preparedId);
      const shownFinal = (final: NonNullable<OrderRecord["final"]>): Shown & { readonly record: OrderRecord } => {
        const filled = BigInt(final.filledMicro);
        const total = BigInt(order.sharesMicro);
        const stateName: ShownState = final.state === "partially_filled" ? "partially_filled" : final.state === "not_placed" ? "rejected" : final.state;
        return { state: stateName, filledMicro: filled, remainingMicro: total > filled ? total - filled : 0n, detail: final.state === "not_placed" ? "not_placed_after_expiry" : final.state, ended: null, record };
      };
      if (record.final !== null) return shownFinal(record.final);

      // Before the order was sent (or while it is being sent) there is nothing to look up yet.
      if (item === undefined || item.state === "prepared" || item.state === "expired") {
        return { state: "unknown", filledMicro: null, remainingMicro: null, detail: item?.state === "expired" ? "prepared_expired_unsent" : "not_submitted", ended: null, record };
      }
      if (item.state === "sending") return { state: "pending", filledMicro: null, remainingMicro: null, detail: "in_flight", ended: null, record };
      if (item.state === "rejected") {
        return { state: "rejected", filledMicro: null, remainingMicro: null, detail: item.detail ?? "rejected", ended: null, record };
      }

      // accepted or ambiguous: look.
      const lookup = await lookupOrder(context, order);
      const afterExpiry = context.now() >= order.expiration * 1000 + EXPIRY_MARGIN_MS;
      if (lookup.kind === "row" || lookup.kind === "fills") {
        const shown = lookup.kind === "row" ? shownFromRow(order, lookup.row) : shownFromFills(order, lookup.fills);
        await checkFee(context, order, lookup.kind === "row" ? lookup.row : undefined, lookup.kind === "fills" ? lookup.fills : undefined);
        if (item.state === "ambiguous" && prepared !== undefined) {
          await prepared.reconcile(item.id, "accepted", "reconciled");
        }
        if (shown.ended !== null) {
          await finishLedger(context, record, shown.ended, lookup.kind === "row" ? "orders_list" : "fill_logs");
        }
        const current = loadRecord(state, hash) ?? record;
        return { ...shown, record: current };
      }
      if (item.state === "ambiguous") {
        if (lookup.kind === "none" && lookup.complete && afterExpiry && prepared !== undefined) {
          // Past its expiry, absent from the open orders and from the fill logs, all readable: it never
          // took. The reservation is released by the sweep (or here, with that evidence).
          await prepared.reconcile(item.id, "rejected", "not_placed");
          await finishNotPlaced(context, record);
          return { state: "rejected", filledMicro: 0n, remainingMicro: BigInt(order.sharesMicro), detail: "not_placed_after_expiry", ended: null, record: loadRecord(state, hash) ?? record };
        }
        if (afterExpiry) {
          // Time is up and the evidence is incomplete: say so, keep the reservation.
          return { state: "unknown", filledMicro: null, remainingMicro: null, detail: "could_not_confirm_after_expiry", ended: null, record };
        }
        return { state: "ambiguous", filledMicro: null, remainingMicro: null, detail: lookup.kind === "none" ? "not_visible_yet" : "sources_unreadable", ended: null, record };
      }
      // accepted, but the sources do not show it now. The gateway acknowledged this order, and a filled one is not
      // in the open list either, so absence is never taken as "expired unfilled": only an explicit terminal row
      // (CANCELED or EXPIRED with nothing matched, handled above) releases the reservation.
      if (lookup.kind === "none" && lookup.complete) {
        return { state: "unknown", filledMicro: null, remainingMicro: null, detail: afterExpiry ? "accepted_then_absent_could_not_confirm" : "accepted_but_not_listed", ended: null, record };
      }
      return { state: "unknown", filledMicro: null, remainingMicro: null, detail: "sources_unreadable", ended: null, record };
    });
  }

  async function finishNotPlaced(context: RelayContext, record: OrderRecord): Promise<void> {
    const ledger = context.services.ledger;
    const state = needService(context, "state");
    if (ledger === undefined || record.final !== null) return;
    const nowMs = context.now();
    try {
      await ledger.release(record.order.reservationId, { kind: "absent_after_expiry", source: "orders_list_and_fill_logs", checkedAtMs: nowMs });
    } catch (error) {
      await audit(context, { ev: "error", code: "order_ledger_release", outcome: "error", hash: record.order.hash, note: error instanceof RelayError ? error.code : "failed" });
      return;
    }
    await patchRecord(state, record.order.hash, (current) => ({ ...current, final: { state: "not_placed", filledMicro: "0", atMs: nowMs } }));
  }

  // ---- the sweep (A2) -------------------------------------------------------------------------------------------------------------

  async function sweepUpTo(context: RelayContext, limit: number): Promise<{ readonly released: number; readonly present: number; readonly unknown: number }> {
    const ledger = context.services.ledger;
    const state = context.services.state;
    const prepared = context.services.prepared;
    if (ledger === undefined || state === undefined || prepared === undefined) return { released: 0, present: 0, unknown: 0 };
    const cache: LookupCache = new Map();
    let budget = limit;
    const report = await ledger.sweep(async (reservation: ReservationView): Promise<AbsenceVerdict> => {
      const record = loadByReservation(state, reservation.id);
      if (record === undefined || budget <= 0) return { verdict: "unknown" };
      const order = record.order;
      // Not before the order's own deadline plus the sweeper's slack: a cancel does not kill the signature.
      if (context.now() < order.expiration * 1000 + EXPIRY_MARGIN_MS) return { verdict: "unknown" };
      const item = prepared.list().find((entry) => entry.reservationIds.includes(reservation.id));
      if (item === undefined || item.state === "prepared" || item.state === "expired") {
        // Never sent from here, and past its expiry: nothing can rest on the book.
        return { verdict: "absent", source: "no_report" };
      }
      if (item.state === "sending") return { verdict: "unknown" };
      budget -= 1;
      const lookup = await lookupOrder(context, order, cache);
      if (lookup.kind === "row" || lookup.kind === "fills") {
        const shown = lookup.kind === "row" ? shownFromRow(order, lookup.row) : shownFromFills(order, lookup.fills);
        if (shown.ended !== null) await finishLedger(context, record, shown.ended, lookup.kind === "row" ? "orders_list" : "fill_logs");
        return { verdict: "present" };
      }
      if (lookup.kind === "none" && lookup.complete) {
        // The gateway acknowledged this order: absence alone (no row, no fill log) is not evidence that it never
        // traded, since a filled order is not in the open list and the fill-log layout is unverified. Held.
        if (item.state === "accepted") return { verdict: "unknown" };
        if (item.state === "ambiguous") await prepared.reconcile(item.id, "rejected", "not_placed").catch(() => undefined);
        await patchRecord(state, order.hash, (current) => (current.final === null ? { ...current, final: { state: "not_placed", filledMicro: "0", atMs: context.now() } } : current));
        return { verdict: "absent", source: "orders_list_and_fill_logs" };
      }
      return { verdict: "unknown" };
    });
    return { released: report.released.length, present: report.present.length, unknown: report.unknown.length };
  }

  const sweep = (context: RelayContext): Promise<{ readonly released: number; readonly present: number; readonly unknown: number }> => sweepUpTo(context, MAX_SWEEP_ITEMS);

  // At most one sweep per SWEEP_THROTTLE_MS per relay, and only when something has expired.
  async function maybeSweep(context: RelayContext, account: string): Promise<void> {
    const ledger = context.services.ledger;
    if (ledger === undefined || context.services.prepared === undefined || context.services.state === undefined) return;
    const nowMs = context.now();
    const last = lastSweep.get(context.services);
    if (last !== undefined && nowMs - last < SWEEP_THROTTLE_MS) return;
    if (ledger.list({ account: lower(account), state: "reserved", expiredBeforeMs: nowMs - EXPIRY_MARGIN_MS }).length === 0) return;
    lastSweep.set(context.services, nowMs);
    try {
      await sweepUpTo(context, PREPARE_SWEEP_ITEMS);
    } catch {
      // Housekeeping only; the next call tries again.
    }
  }

  // ---- POST /v1/order/prepare ---------------------------------------------------------------------------------------------------------

  const prepare: NonNullable<RouteTable["POST /v1/order/prepare"]> = async (body, context) => {
    guardWrite(context, "ENABLE_TRADING");
    if (body.purpose === "seed") guardWrite(context, "XO_ENABLE_CREATE");
    const { owner, account, key } = derive(body);
    const config = needService(context, "config");
    const ledger = needService(context, "ledger");
    const prepared = needService(context, "prepared");
    const state = needService(context, "state");
    const purpose: Purpose = body.purpose;
    const tif: Tif = body.tif;
    const postOnly = body.post_only === true;

    // Shape rules that need no network.
    if (postOnly && tif !== "GTD") throw refuse("invalid_request", "post_only is only valid for a GTD order.", { reason: "post_only_needs_gtd" });
    if (purpose === "seed") {
      if (body.side !== "BUY" || tif !== "GTD" || !postOnly) {
        throw refuse("invalid_request", "A creation seed is a post-only GTD BUY.", { reason: "seed_shape" });
      }
    }
    const ttlMin = purpose === "seed" ? SEED_MIN_TTL_S : MIN_TRADE_TTL_S;
    const ttlMax = purpose === "seed" ? SEED_MAX_TTL_S : Math.min(config.guardrails.orderExpirySeconds, 3600);
    const ttl = body.ttl_s ?? (purpose === "seed" ? SEED_MIN_TTL_S : DEFAULT_ORDER_TTL_SECONDS);
    if (ttl < ttlMin || ttl > ttlMax) {
      throw refuse("invalid_request", `ttl_s must be between ${ttlMin} and ${ttlMax} seconds for this order.`, { reason: "ttl_out_of_range", min_s: ttlMin, max_s: ttlMax });
    }

    // Give back anything that has expired and is provably gone, so the day's budget is current.
    await maybeSweep(context, account);

    // The account must be ready to trade (AD6): deployed and registered.
    const accounts = needService(context, "accounts");
    let reading: Awaited<ReturnType<typeof accounts.read>>;
    try {
      reading = await accounts.read(owner, account, { signal: context.signal });
    } catch (error) {
      if (error instanceof RelayError) throw error;
      // Unreadable is not "fine": nothing is prepared on a guess about the account.
      throw new RelayError("precondition_failed", "The account's state could not be read just now, so nothing was prepared.", { reason: "account_unreadable" });
    }
    if (reading.state !== "registered" || !reading.registered) {
      throw new RelayError("precondition_failed", "This account cannot trade yet. It has to be deployed and registered first.", { state: reading.state, registered: reading.registered, next: reading.state === "undeployed" ? "deploy_enable_trading" : "wait_for_registration" });
    }
    if (reading.trading_enabled === "no") {
      throw new RelayError("precondition_failed", "Trading is not enabled for this account. Enable Trading first.", { trading_enabled: "no", next: "enable_trading" });
    }

    // XO's clock, the market, and the maker's exchange nonce.
    const [clock, book, nonce] = await Promise.all([xoClock(context, true), readBook(context, body.token_id), chainOf(context).makerNonce(account, context.signal)]);
    if (nonce.state === "moved") {
      await context.services.tripwires?.trip({ id: "maker_nonce_moved", detail: "The exchange's nonce counter for this account moved off 0, so its signed orders may be dead. The relay is read-only until the operator looks." }).catch(() => undefined);
      await context.services.alerts?.raise({ id: "maker_nonce_moved", severity: "critical", message: "The exchange nonce counter of a maker account moved. Orders are refused for it." });
      throw new RelayError("tripwire", "The exchange's nonce counter for this account moved, so nothing was prepared.", { tripped: ["maker_nonce_moved"] });
    }
    if (nonce.state === "unknown") {
      throw new RelayError("tripwire", "The maker's exchange nonce could not be verified just now, so nothing was prepared.", { unverified: ["maker_nonce"] });
    }
    if (book.tickSize !== undefined && book.tickSize !== "0.001") {
      throw new RelayError("precondition_failed", "This market does not use the 0.001 tick the relay is built for.", { reason: "tick_size" });
    }

    // Amounts and the cap rule (decision D2 as amended by A3).
    const side = body.side === "BUY" ? 0 : 1;
    let amounts: ReturnType<typeof computeOrderAmounts>;
    let cap: ReturnType<typeof orderCapAmount>;
    try {
      const bookMin = book.minOrderSizeMicro > DEFAULT_MIN_SHARES_MICRO ? book.minOrderSizeMicro : DEFAULT_MIN_SHARES_MICRO;
      amounts = computeOrderAmounts({ side, price: body.price, shares: body.shares, constraints: { minSharesMicro: bookMin } });
      // SI-2: a trade is capped with the contract's hard 1,000 bps fee ceiling, not today's 800; the creation seed
      // keeps the 800 its own $10.80 cap (A3) was fixed with. The live fee read (the tripwire) is untouched.
      cap = orderCapAmount({ side, makerAmount: amounts.makerAmount, takerAmount: amounts.takerAmount, feeBps: purpose === "seed" ? ORDER_FEE_BOUND_BPS : ORDER_CAP_FEE_BPS });
    } catch (error) {
      throw signingFailure(error);
    }
    if (purpose === "seed") {
      const creator = context.services.createdMarkets;
      if (creator === undefined) throw new RelayError("capability_unknown", "A seed needs the creation watcher to confirm the market is this owner's, and it is not wired.", { reason: "no_created_markets" });
      if ((await creator.createdBy(account, body.token_id)) !== "yes") {
        throw new RelayError("precondition_failed", "A seed is only accepted for a market this owner created.", { reason: "not_created_by_owner" });
      }
    }

    // A price band against the book, for orders that take (paying up is the risk; resting far away is not).
    const reference = side === 0 ? (book.bestAsk ?? book.lastTrade) : (book.bestBid ?? book.lastTrade);
    if (reference === undefined) {
      if (!postOnly) {
        throw new RelayError("precondition_failed", "The book has no price to check this order against, so a taker order is refused.", { reason: "no_reference_price" });
      }
    } else {
      const band = checkPriceBand(body.side, amounts.priceTick, reference, config.guardrails);
      if (!band.allowed) throw new RelayError("invalid_request", band.message, { reason: band.code });
    }

    // The order.
    const expiration = (() => {
      try {
        return gtdExpirationFromTtl(clock.nowS, ttl, { minTtlSeconds: ttlMin, maxTtlSeconds: ttlMax });
      } catch (error) {
        throw signingFailure(error);
      }
    })();
    const salt = nonZeroSalt(random);
    const makerChecksummed = getAddress(account);
    const order: XoOrder = {
      salt,
      maker: makerChecksummed,
      signer: makerChecksummed,
      beneficiary: ZERO_ADDRESS,
      tokenId: BigInt(body.token_id),
      makerAmount: amounts.makerAmount,
      takerAmount: amounts.takerAmount,
      expiration,
      nonce: ORDER_NONCE,
      identifier: ZERO_BYTES16,
      metadata: ZERO_BYTES32,
      side,
      signatureType: SIGNATURE_TYPE_XO_SMART_ACCOUNT,
    };
    let signing: SigningRequest;
    try {
      signing = prepareOrderSigning(order, { expiry: { nowSeconds: clock.nowS, minTtlSeconds: ttlMin, maxTtlSeconds: ttlMax } });
    } catch (error) {
      throw signingFailure(error);
    }
    const hash = signing.innerHash.toLowerCase();

    // R1: the decoded block, and a rebuild of the digest and the summary from it. A prepare whose own block does
    // not rebuild to the digest it is about to hand out is a bug here, and nothing is reserved or stored for it.
    // The condition line is shown only when the signed token really is one of that condition's two outcomes (SC-7:
    // the checker refuses a condition that does not derive the token). A book that names a condition which does not
    // derive the token is XO's data being inconsistent, so no condition is shown, and the item says so.
    const tokenBinds = book.conditionId !== null && binaryPositionIds(book.conditionId as Hex).includes(BigInt(body.token_id).toString(10));
    const shownCondition = tokenBinds ? book.conditionId : null;
    const decodedBlock = buildDecodedOrder({ owner, order, feeBps: cap.feeBps, tif, postOnly, purpose, ttlS: ttl, conditionId: shownCondition });
    const rebuilt = rebuildDecoded(decodedBlock);
    if (!rebuilt.ok || lower(rebuilt.digest) !== lower(signing.wrappedDigest) || lower(rebuilt.inner_hash) !== hash) {
      throw new RelayError("internal", `The relay could not rebuild its own order digest from the decoded terms (${rebuilt.ok ? "digest" : rebuilt.field}). Nothing was prepared.`, { field: rebuilt.ok ? "digest" : rebuilt.field });
    }

    const nowMs = context.now();
    const reservationId = `ord_${random(16).toString("hex")}`;
    const fields: OrderFields = {
      hash,
      owner,
      account: makerChecksummed,
      tokenId: body.token_id,
      salt: salt.toString(),
      side,
      tick: amounts.priceTick,
      sharesMicro: amounts.sharesMicro.toString(),
      collateralMicro: amounts.collateralMicro.toString(),
      makerAmount: amounts.makerAmount.toString(),
      takerAmount: amounts.takerAmount.toString(),
      expiration: Number(expiration),
      tif,
      postOnly,
      purpose,
      feeBps: cap.feeBps,
      capAtomic: cap.capAtomic.toString(),
      reservationId,
      clockOffsetS: clock.offsetS,
      conditionId: book.conditionId,
      digest: signing.wrappedDigest.toLowerCase(),
    };
    const record: OrderRecord = { v: 1, order: fields, preparedId: null, createdAtMs: nowMs, sentAtMs: null, ambiguousAtMs: null, cancelRequestedAtMs: null, final: null };

    // The index goes first, so no reservation can exist without a way back to its order.
    await state.commit([
      { ns: ORDERS_NS, key: hash, value: record as unknown as Json },
      { ns: RESERVATIONS_NS, key: reservationId, value: hash },
    ]);
    const reserved = await ledger.reserveFor({
      kind: "spend",
      account: key,
      day: ledger.currentDay(),
      amountAtomic: cap.capAtomic,
      limitAtomic: config.guardrails.maxDailyAtomic,
      category: purpose === "seed" ? "seed" : "order",
      expiresAtMs: Number(expiration) * 1000,
      reservationId,
    });
    if (!reserved.reserved) {
      await state.commit([
        { ns: ORDERS_NS, key: hash, value: null },
        { ns: RESERVATIONS_NS, key: reservationId, value: null },
      ]);
      const limit = reserved.limitAtomic;
      throw new RelayError("cap_exceeded", `This order counts ${usd(cap.capAtomic)} USD against a limit with ${usd(reserved.remainingAtomic)} USD left.`, {
        reason: reserved.reason,
        counted_usd: usd(cap.capAtomic),
        limit_usd: usd(limit),
        remaining_usd: usd(reserved.remainingAtomic),
      });
    }

    // What the owner signs. Typed data (domain-separated) unless PayBox is recorded as refusing it (PB2).
    const useTyped = context.services.capabilities?.state(FACT_TYPED_DATA) !== "no";
    const typedData = JSON.parse(JSON.stringify(signing.typedData)) as TypedData;
    const sign: PreparedSign = {
      intent: useTyped ? { op: "typedData", typedData } : { op: "raw", rawSigningPayloadHex: signing.wrappedDigest },
      expected_digest: signing.wrappedDigest,
      digest_form: "kernelWrappedOrderHash",
    };
    const check = checkPreparedSign(sign);
    if (!check.ok) throw new RelayError("internal", "The relay built a signing request that does not match its digest. Nothing was prepared.");

    const preparedTtlS = Math.max(1, Math.min(PREPARED_TTL_S, ttl - MIN_REMAINING_TTL_SECONDS));
    const item = await prepared.create({
      kind: "order",
      owner,
      account,
      digest: signing.wrappedDigest,
      digestForm: "kernelWrappedOrderHash",
      payload: { order: fields as unknown as Json },
      reservationIds: [reservationId],
      ttlS: preparedTtlS,
    });
    await patchRecord(state, hash, (current) => ({ ...current, preparedId: item.id }));

    const price = formatTick(amounts.priceTick);
    const shares = formatMicro(amounts.sharesMicro);
    const spentToday = reserved.usage.spentAtomic;
    const dayRemaining = config.guardrails.maxDailyAtomic > spentToday ? config.guardrails.maxDailyAtomic - spentToday : 0n;
    const expiresIso = isoSecondOf(Number(expiration) * 1000);
    // The summary is a pure function of the decoded block (src/xo/signing/lines.ts), so the Signature Card can
    // regenerate it and compare.
    const lines = [...rebuilt.lines];
    const capabilities = context.services.capabilities?.snapshot(ORDER_FACT_IDS) ?? {};
    const warnings = [
      SAFETY_NOTICES.advisoryCaps,
      SAFETY_NOTICES.approvalMode,
      SAFETY_NOTICES.dedicatedCredential,
      SAFETY_NOTICES.digestTag,
      "The gateway's minimum size, minimum lifetime and signature rules are not proven yet. A refusal says what it wants; the relay never retries a refused order on its own.",
      ...(reading.trading_enabled === "unknown" ? ["Whether trading is enabled for this account could not be read. The order book will refuse the order if it is not."] : []),
      ...(belowBalance(reading.balance_usd, cap.capAtomic) ? ["The account's readable balance is below the amount this order can cost."] : []),
      ...(Math.abs(clock.offsetS) > 30 ? [`The relay's clock differs from XO's by ${Math.abs(clock.offsetS)} s. The order uses XO's clock.`] : []),
      ...(book.conditionId !== null && !tokenBinds ? ["The order book names a market condition that does not derive this token id, so no condition is shown for it. The token id is what is signed."] : []),
    ];

    return {
      prepared_id: item.id,
      kind: "order",
      owner,
      account: makerChecksummed,
      expires_at: isoSecondOf(item.expiresAtMs),
      sign,
      summary: { lines, digest_tag: digestTag(signing.wrappedDigest), inner_hash_tag: digestTag(rebuilt.inner_hash), inner_hash_kind: "typed_data_hash" },
      caps: { reserved_usd: usd(cap.capAtomic), day_remaining_usd: usd(dayRemaining) },
      capabilities,
      warnings,
      decoded: decodedBlock,
      quote: {
        price,
        shares,
        max_outlay_usd: cap.maxOutlayAtomic === null ? "0" : usd(cap.maxOutlayAtomic),
        fee_bound_bps: cap.feeBps,
        expires_at: expiresIso,
      },
    };
  };

  // ---- POST /v1/order/submit ----------------------------------------------------------------------------------------------------------

  type SendOutcome =
    | { readonly kind: "accepted"; readonly prefix: Prefix; readonly status: string }
    | { readonly kind: "rejected"; readonly detail: string; readonly error?: RelayError }
    | { readonly kind: "ambiguous"; readonly detail: string };

  function classify(response: UpstreamResponse, order: OrderFields): SendOutcome | { readonly kind: "signature_rejected"; readonly detail: string } {
    const text = sanitizeForDetail(response.body.length > 0 ? response.body : "", 160);
    let json: unknown;
    try {
      json = JSON.parse(response.body);
    } catch {
      json = undefined;
    }
    const message = isRecord(json) ? (typeof json["error"] === "string" ? json["error"] : typeof json["errorMsg"] === "string" ? json["errorMsg"] : "") : "";
    const reason = sanitizeForDetail(message.length > 0 ? message : text, 160);
    if (response.status >= 200 && response.status < 300) {
      if (!isRecord(json)) return { kind: "ambiguous", detail: "unreadable_success_response" };
      const orderId = json["orderID"] ?? json["orderId"] ?? json["order_hash"];
      const success = json["success"];
      const errorMsg = typeof json["errorMsg"] === "string" ? json["errorMsg"] : "";
      if (success === false || (success !== true && errorMsg.length > 0)) {
        return { kind: "rejected", detail: `upstream_rejected: ${reason.length > 0 ? reason : "the order was not accepted"}` };
      }
      if (typeof orderId === "string" && orderId.length > 0) {
        // The gateway computes the same hash. If it disagrees, something is off: do not call it accepted.
        if (lower(orderId) !== order.hash) return { kind: "ambiguous", detail: "order_id_mismatch" };
        const status = typeof json["status"] === "string" ? json["status"].toLowerCase().replace(/[^a-z_]/g, "").slice(0, 24) : "live";
        return { kind: "accepted", prefix: "0x01", status: status.length > 0 ? status : "live" };
      }
      return { kind: "ambiguous", detail: "success_without_order_id" };
    }
    // 401 is the order book refusing the relay's L2 credentials. A 403 is only that when it says so: it may
    // just as well be "this maker is not registered", which is a different thing to tell the owner.
    if (response.status === 401 || (response.status === 403 && AUTH_REJECTION.test(reason))) {
      return { kind: "rejected", detail: `upstream_rejected: the order book refused the relay's credentials${reason.length > 0 ? ` (${reason})` : ""}` };
    }
    if (response.status >= 500) return { kind: "ambiguous", detail: `upstream_error_${response.status}` };
    if (DUPLICATE_REJECTION.test(reason)) return { kind: "ambiguous", detail: "duplicate_reported" };
    if ((response.status === 400 || response.status === 422) && SIGNATURE_REJECTION.test(reason) && !AUTH_REJECTION.test(reason)) {
      return { kind: "signature_rejected", detail: `upstream_rejected: ${reason}` };
    }
    return { kind: "rejected", detail: `upstream_rejected: HTTP ${response.status}${reason.length > 0 ? `: ${reason}` : ""}` };
  }

  // The body and the L2 headers of one POST. Everything here is local (the vault, the credential probes, the
  // /time read): a failure means nothing was sent, so submit builds the first request BEFORE the marker and a
  // failure leaves the prepared item usable.
  interface BuiltPost {
    readonly body: string;
    readonly headers: Readonly<Record<string, string>>;
  }

  async function buildPost(context: RelayContext, order: OrderFields, ecdsa: Hex, prefix: Prefix): Promise<BuiltPost> {
    const wire = orderToWire(orderOf(order));
    const signature = assembleWireSignature(ecdsa, { form: prefix === "0x01" ? "kernel-validator-0x01" : "kernel-root-0x00" });
    const body = JSON.stringify({ order: { ...wire, signature }, orderType: order.tif, ...(order.postOnly ? { postOnly: true } : {}) });
    const timestampSeconds = Math.floor(context.now() / 1000) + order.clockOffsetS;
    const headers = await l2Of(context).headers({ account: order.account, method: "POST", path: "/order", body, timestampSeconds });
    return { body, headers };
  }

  // One POST. Never throws.
  async function postOnce(context: RelayContext, order: OrderFields, ecdsa: Hex, prefix: Prefix, ready?: BuiltPost): Promise<SendOutcome | { readonly kind: "signature_rejected"; readonly detail: string }> {
    try {
      const upstream = needService(context, "upstream");
      const { body, headers } = ready ?? (await buildPost(context, order, ecdsa, prefix));
      // No signal on purpose: an aborted POST would turn a send into an ambiguous one.
      const response = await upstream.request({ method: "POST", url: `${ORDERBOOK}/order`, headers, body, purpose: "post_order", timeoutMs: postTimeoutMs, maxBytes: 64 * 1024 });
      const outcome = classify(response, order);
      return outcome.kind === "accepted" ? { ...outcome, prefix } : outcome;
    } catch (error) {
      if (error instanceof UpstreamError) {
        // Before the request left, or an answer that proves the order was not processed.
        if (error.kind === "requires_key" || error.kind === "cloudflare" || error.kind === "rate_limited" || error.kind === "circuit_open") {
          return { kind: "rejected", detail: `upstream_unavailable: ${error.kind}`, error: toRelayError(error) };
        }
        if (error.kind === "host_not_allowed" || error.kind === "scheme" || error.kind === "method_not_allowed" || error.kind === "invalid_request") {
          return { kind: "rejected", detail: "relay_refused_the_request", error: toRelayError(error) };
        }
        return { kind: "ambiguous", detail: `no_answer_${error.kind}` };
      }
      if (error instanceof RelayError) return { kind: "rejected", detail: error.code, error };
      return { kind: "ambiguous", detail: "send_failed_unexpectedly" };
    }
  }

  const firstPrefix = (context: RelayContext): Prefix => (context.services.capabilities?.value(FACT_PREFIX) === "prefix_00" ? "0x00" : "0x01");

  // The send: prefix 0x01 first (or the one the gateway is known to take); the other only after an explicit
  // signature rejection, with the same 65 bytes. Anything ambiguous ends the attempt: never resend.
  async function sendOrder(context: RelayContext, order: OrderFields, ecdsa: Hex, ready: BuiltPost): Promise<SendOutcome> {
    const first = firstPrefix(context);
    const second: Prefix = first === "0x01" ? "0x00" : "0x01";
    const one = await postOnce(context, order, ecdsa, first, ready);
    if (one.kind !== "signature_rejected") return one;
    await audit(context, { ev: "send_result", outcome: "refused", state: "prefix_swap", hash: order.hash, route: "POST /v1/order/submit" });
    const two = await postOnce(context, order, ecdsa, second);
    if (two.kind === "signature_rejected") return { kind: "rejected", detail: two.detail };
    return two;
  }

  async function learnFacts(context: RelayContext, prefix: Prefix, form: "raw" | "eip191"): Promise<void> {
    const capabilities = context.services.capabilities;
    if (capabilities === undefined) return;
    const record = async (id: string, value: string): Promise<void> => {
      const known = capabilities.fact(id);
      if (known?.state === "yes" && known.value === value) return;
      try {
        await capabilities.record({ id, state: "yes", source: "probe", value, note: "learned from an accepted order" });
      } catch {
        // An operator's recorded answer wins; a failed write is not worth failing an order for.
      }
    };
    await record(FACT_PREFIX, prefix === "0x01" ? "prefix_01" : "prefix_00");
    await record(FACT_DIGEST_FORM, form);
  }

  // Writes what happened to the prepared item, the ledger hold and the index. Used for the answer and for
  // the background completion alike.
  async function finishSend(context: RelayContext, order: OrderFields, preparedId: string, outcome: SendOutcome, form: "raw" | "eip191"): Promise<{ readonly state: "accepted" | "rejected" | "ambiguous"; readonly detail: string; readonly error?: RelayError }> {
    const prepared = needService(context, "prepared");
    const state = needService(context, "state");
    if (outcome.kind === "accepted") {
      await prepared.resolve(preparedId, "accepted", "posted");
      await learnFacts(context, outcome.prefix, form);
      await patchRecord(state, order.hash, (current) => ({ ...current, sentAtMs: current.sentAtMs ?? context.now() }));
      return { state: "accepted", detail: `accepted (${outcome.status})` };
    }
    if (outcome.kind === "rejected") {
      await prepared.resolve(preparedId, "rejected", "upstream_rejected");
      return { state: "rejected", detail: outcome.detail, ...(outcome.error === undefined ? {} : { error: outcome.error }) };
    }
    await prepared.resolve(preparedId, "ambiguous", "no_answer");
    await context.services.ledger?.markAmbiguous(order.reservationId, `send outcome unknown: ${outcome.detail}`).catch(() => undefined);
    await patchRecord(state, order.hash, (current) => ({ ...current, ambiguousAtMs: current.ambiguousAtMs ?? context.now() }));
    await context.services.alerts?.raise({ id: "order_send_ambiguous", severity: "warn", message: "An order was sent and the outcome is unknown. It is held, will be looked for by hash, and is never sent again." });
    return { state: "ambiguous", detail: `the outcome of the send is unknown (${outcome.detail}); look it up by order hash, do not resend` };
  }

  const submit: NonNullable<RouteTable["POST /v1/order/submit"]> = async (body, context) => {
    // Real elapsed time, so the answer-by budget counts the checks below as well as the send.
    const handlerStart = performance.now();
    const prepared = needService(context, "prepared");
    const state = needService(context, "state");
    const ledger = needService(context, "ledger");
    const item = prepared.require(body.prepared_id);
    if (item.kind !== "order") throw new RelayError("invalid_request", "That prepared item is not an order.");
    const stored = isRecord(item.payload) ? item.payload["order"] : undefined;
    const order = parseFields(stored);
    const replay = (current: PreparedRecord): RelayError =>
      new RelayError("prepared_used", "This prepared item was already used. Its order is not sent again; look it up by order hash.", { state: current.state, order_hash: order.hash });
    if (item.state === "expired") throw new RelayError("expired", "This prepared item expired. Prepare it again.");
    if (item.state !== "prepared") throw replay(item);

    const nowMs = context.now();
    if (nowMs >= item.expiresAtMs) throw new RelayError("expired", "This prepared item expired. Prepare it again.");

    // 1. The signature: parse, normalise, and check it is the owner's over THIS order.
    const bad = async (error: RelayError): Promise<never> => {
      const outcome = await prepared.noteFailedAttempt(item.id);
      await audit(context, { ev: "refused", outcome: "refused", code: error.code, preparedId: item.id, owner: item.owner, route: "POST /v1/order/submit" });
      throw outcome.locked ? new RelayError(error.code, `${error.message} Too many bad signatures: this prepared item is now spent.`, { ...(error.details ?? {}), locked: true }) : error;
    };
    let ecdsa: Hex;
    try {
      ecdsa = normalizeSignature(body.signature).signature;
    } catch {
      return bad(new RelayError("signature_invalid", "The signature is not a 65-byte signature or an r, s and recovery id."));
    }
    // 2. The stored fields must still say what was shown, and hash to the stored digest.
    let xoOrder: XoOrder;
    try {
      xoOrder = orderOf(order);
      const decoded = decodeOrderAmounts({ side: order.side, makerAmount: xoOrder.makerAmount, takerAmount: xoOrder.takerAmount });
      const cap = orderCapAmount({ side: order.side, makerAmount: xoOrder.makerAmount, takerAmount: xoOrder.takerAmount, feeBps: order.feeBps });
      const digest = kernelWrapDigest(hashOrder(xoOrder), xoOrder.maker).toLowerCase();
      if (
        digest !== item.digest.toLowerCase() ||
        digest !== order.digest ||
        hashOrder(xoOrder).toLowerCase() !== order.hash ||
        decoded.priceTick !== order.tick ||
        decoded.sharesMicro.toString() !== order.sharesMicro ||
        cap.capAtomic.toString() !== order.capAtomic ||
        lower(order.account) !== lower(item.account) ||
        lower(order.owner) !== lower(item.owner) ||
        lower(deriveAccount(order.owner)) !== lower(order.account) ||
        xoOrder.nonce !== ORDER_NONCE
      ) {
        throw new RelayError("internal", "A stored order no longer matches its digest, so nothing was sent.");
      }
    } catch (error) {
      if (error instanceof RelayError) throw error;
      throw new RelayError("internal", "A stored order is unreadable, so nothing was sent.");
    }
    const verified = await verifyOrderEcdsa({ order: xoOrder, ecdsa, expectedOwner: getAddress(order.owner) });
    if (!verified.ok) {
      const code = verified.code === "owner_mismatch" ? "owner_mismatch" : "signature_invalid";
      return bad(new RelayError(code, code === "owner_mismatch" ? "The signature is not the owner's over this order." : "The signature could not be used.", { reason: verified.code }));
    }

    // 3. Time, day and caps.
    const xoNowS = Math.floor(nowMs / 1000) + order.clockOffsetS;
    try {
      assertRemainingTtl(BigInt(order.expiration), xoNowS, MIN_REMAINING_TTL_SECONDS);
    } catch {
      throw new RelayError("expired", `Less than ${MIN_REMAINING_TTL_SECONDS} seconds of this order's life remain. Prepare it again.`, { min_remaining_s: MIN_REMAINING_TTL_SECONDS });
    }
    const reservation = ledger.reservation(order.reservationId);
    if (
      reservation === undefined ||
      reservation.state !== "reserved" ||
      reservation.amountAtomic.toString() !== order.capAtomic ||
      reservation.day !== ledger.currentDay()
    ) {
      throw new RelayError(reservation?.day !== undefined && reservation.day !== ledger.currentDay() ? "expired" : "cap_exceeded", "The reservation for this order is gone or belongs to another day. Prepare it again.", { reason: "reservation_unusable" });
    }

    // 4. Kill switch, flags, tripwires (re-run now), the maker's nonce, and credentials. None of these
    //    spends the prepared item: fix the cause and submit again while it lives.
    await guardSubmit(context, "ENABLE_TRADING", 2_000);
    if (order.purpose === "seed") guardWrite(context, "XO_ENABLE_CREATE");
    const checkSignal = AbortSignal.any([context.signal, AbortSignal.timeout(2_500)]);
    const nonce = await chainOf(context).makerNonce(getAddress(order.account), checkSignal);
    if (nonce.state === "moved") {
      await context.services.tripwires?.trip({ id: "maker_nonce_moved", detail: "The exchange's nonce counter for this account moved off 0 since the order was prepared. The relay is read-only until the operator looks." }).catch(() => undefined);
      throw new RelayError("stale_nonce", "The exchange's nonce counter for this account moved, so this signed order is dead. Nothing was sent.", { tripped: ["maker_nonce_moved"] });
    }
    if (nonce.state === "unknown") throw new RelayError("tripwire", "The maker's exchange nonce could not be verified just now, so nothing was sent.", { unverified: ["maker_nonce"] });
    if (!(await l2Of(context).has(order.account))) {
      throw new RelayError("precondition_failed", "This account has no stored XO credentials, so the order cannot be placed.", { credentials: "none" });
    }

    // The first request, with its L2 headers, built before the marker: a local failure here (the vault, the
    // credential probes, the /time read) sends nothing and must not spend the owner's approval.
    let ready: BuiltPost;
    try {
      ready = await buildPost(context, order, ecdsa, firstPrefix(context));
    } catch (error) {
      if (error instanceof RelayError) throw error;
      if (error instanceof UpstreamError) throw toRelayError(error);
      throw new RelayError("internal", "The request to the order book could not be prepared, so nothing was sent. The prepared order is still usable.", { reason: "request_not_built" });
    }

    // 5. The marker, then exactly one send. The kill switch is read once more right before the marker: the
    //    checks above take time.
    guardWrite(context, "ENABLE_TRADING");
    try {
      await prepared.beginSend(item.id);
    } catch (error) {
      if (error instanceof RelayError && error.code === "prepared_used") throw replay((prepared.get(item.id) ?? item));
      throw error;
    }
    // Bookkeeping only: the marker is already on disk, so a failure here must not stop the send.
    await patchRecord(state, order.hash, (current) => ({ ...current, sentAtMs: context.now() })).catch(() => undefined);

    const sending = (async (): Promise<SendOutcome> => {
      try {
        return await sendOrder(context, order, ecdsa, ready);
      } catch {
        return { kind: "ambiguous", detail: "send_failed_unexpectedly" };
      }
    })();

    // 6. Answer within the budget; slower than that is `pending` and the rest happens in the background.
    let timer: unknown;
    const waitMs = Math.max(0, pendingAfterMs - (performance.now() - handlerStart));
    const late = new Promise<"late">((resolve) => {
      timer = setTimeout(() => resolve("late"), waitMs);
    });
    const first = await Promise.race([sending, late]);
    clearTimeout(timer as Parameters<typeof clearTimeout>[0]);
    if (first === "late") {
      track(sending.then((outcome) => finishSend(context, order, item.id, outcome, verified.digestForm)));
      return { state: "pending", order_hash: order.hash, detail: "the order is in flight; poll the order status by hash" };
    }
    let done: Awaited<ReturnType<typeof finishSend>>;
    try {
      done = await finishSend(context, order, item.id, first, verified.digestForm);
    } catch {
      // The send happened; only the bookkeeping failed. The prepared item stays `sending`, a restart makes
      // it ambiguous, and the order is found by its hash.
      return { state: "ambiguous", order_hash: order.hash, detail: "the outcome could not be recorded; look the order up by hash and do not resend" };
    }
    if (done.state === "rejected" && done.error !== undefined) {
      throw done.error;
    }
    return { state: done.state, order_hash: order.hash, detail: done.detail.slice(0, 300) };
  };

  // ---- GET /v1/order/:hash ---------------------------------------------------------------------------------------------------------

  const status: NonNullable<RouteTable["GET /v1/order/:hash"]> = async (params, context) => {
    const hash = lower(params.hash);
    const state = needService(context, "state");
    if (loadRecord(state, hash) === undefined) return { order_hash: hash, state: "unknown", detail: "no_record" };
    const shown = await reconcile(context, hash);
    return {
      order_hash: hash,
      state: shown.state,
      ...(shown.filledMicro === null ? {} : { filled_shares: formatMicro(shown.filledMicro) }),
      ...(shown.remainingMicro === null ? {} : { remaining_shares: formatMicro(shown.remainingMicro) }),
      detail: shown.detail.slice(0, 300),
    };
  };

  // ---- POST /v1/order/cancel ----------------------------------------------------------------------------------------------------------

  const CANCEL_ORDER: readonly CancelVariant[] = ["hash", "numeric", "orderId"];

  const cancel: NonNullable<RouteTable["POST /v1/order/cancel"]> = async (body, context) => {
    guardWrite(context, "ENABLE_TRADING");
    const { account } = derive(body);
    const hash = lower(body.order_hash);
    const upstream = needService(context, "upstream");
    const state = needService(context, "state");
    const locks = needService(context, "locks");
    const known = loadRecord(state, hash);
    if (known !== undefined && lower(known.order.account) !== lower(account)) {
      throw new RelayError("account_mismatch", "That order belongs to a different account.");
    }
    if (!(await l2Of(context).has(account))) {
      throw new RelayError("precondition_failed", "This account has no stored XO credentials, so nothing can be cancelled through the relay.", { credentials: "none" });
    }

    return locks.run(`cancel:${hash}`, async () => {
      const remembered = context.services.capabilities?.value(FACT_CANCEL);
      const startAt = remembered === "numeric" || remembered === "orderId" ? remembered : "hash";
      const order: CancelVariant[] = [startAt, ...CANCEL_ORDER.filter((variant) => variant !== startAt)];
      let numericId: string | undefined;
      let last: { readonly state: "cancelled" | "not_found" | "rejected" | "ambiguous"; readonly detail: string } = { state: "rejected", detail: "nothing was tried" };
      // "not found" under one id form is the order book saying it understood the request. A later form it
      // does not understand (a 400) must not turn that into a rejection.
      let sawNotFound = false;

      for (const variant of order) {
        let idValue: string | number;
        let key: "orderID" | "orderId";
        if (variant === "numeric") {
          if (numericId === undefined) {
            // The numeric id comes from the account's own order list, read without a query string.
            try {
              numericId = (await readOpenOrders(context, account)).rows.find((row) => row.hash === hash)?.id ?? undefined;
            } catch {
              numericId = undefined;
            }
          }
          if (numericId === undefined) continue;
          idValue = numericId;
          key = "orderID";
        } else {
          idValue = hash;
          key = variant === "hash" ? "orderID" : "orderId";
        }
        const requestBody = JSON.stringify({ [key]: idValue });
        let response: UpstreamResponse;
        try {
          const clock = await xoClock(context, false);
          const headers = await l2Of(context).headers({ account, method: "DELETE", path: "/order", body: requestBody, timestampSeconds: clock.nowS });
          // A cancel that gets no answer is not repeated: whether it landed is read from the order's status.
          response = await upstream.request({ method: "DELETE", url: `${ORDERBOOK}/order`, headers, body: requestBody, purpose: "cancel_order", timeoutMs: 8_000, maxBytes: 64 * 1024 });
        } catch (error) {
          if (error instanceof RelayError) throw error;
          if (error instanceof UpstreamError && ["requires_key", "cloudflare", "rate_limited", "circuit_open"].includes(error.kind)) throw toRelayError(error);
          return { order_hash: hash, state: "ambiguous" as const, detail: "the cancel got no answer; check the order status by hash" };
        }
        if (response.status >= 500) return { order_hash: hash, state: "ambiguous" as const, detail: `the order book errored (${response.status}); check the order status by hash` };
        if (response.status === 401 || response.status === 403) {
          return { order_hash: hash, state: "rejected" as const, detail: "the order book refused the relay's credentials" };
        }
        let json: unknown;
        try {
          json = JSON.parse(response.body);
        } catch {
          json = undefined;
        }
        if (response.ok && isRecord(json)) {
          const canceled = Array.isArray(json["canceled"]) ? json["canceled"] : [];
          const not = isRecord(json["notCanceled"]) ? json["notCanceled"] : {};
          if (canceled.length > 0) {
            await patchRecord(state, hash, (current) => ({ ...current, cancelRequestedAtMs: context.now() }));
            if (remembered !== variant) {
              await context.services.capabilities?.record({ id: FACT_CANCEL, state: "yes", source: "probe", value: variant }).catch(() => undefined);
            }
            return { order_hash: hash, state: "cancelled" as const, detail: "cancelled; the signature stays valid on chain until the order expires" };
          }
          const reasons = Object.values(not).filter((entry): entry is string => typeof entry === "string").join(" ").toLowerCase();
          if (reasons.includes("already filled")) return { order_hash: hash, state: "rejected" as const, detail: "already_filled" };
          if (reasons.includes("not owner")) return { order_hash: hash, state: "rejected" as const, detail: "not_owner" };
          // "not found" in one id form is harmless: the next form may find it.
          last = { state: "not_found", detail: reasons.includes("not found") ? "not_found" : "not_canceled" };
          sawNotFound = sawNotFound || reasons.includes("not found");
          continue;
        }
        const message = isRecord(json) ? (typeof json["error"] === "string" ? json["error"] : "") : "";
        last = { state: response.status === 404 ? "not_found" : "rejected", detail: `upstream_rejected: HTTP ${response.status}${message.length > 0 ? `: ${sanitizeForDetail(message, 120)}` : ""}` };
      }
      if (sawNotFound && last.state === "rejected") return { order_hash: hash, state: "not_found" as const, detail: "not_found" };
      return { order_hash: hash, state: last.state, detail: last.detail.slice(0, 300) };
    });
  };

  // ---- POST /v1/orders/list ----------------------------------------------------------------------------------------------------------------

  const list: NonNullable<RouteTable["POST /v1/orders/list"]> = async (body, context) => {
    const { account } = derive(body);
    if (!(await l2Of(context).has(account))) {
      throw new RelayError("precondition_failed", "This account has no stored XO credentials, so its orders cannot be listed.", { credentials: "none" });
    }
    const state = needService(context, "state");
    const upstream = needService(context, "upstream");
    const response = await signedGet(context, account, "/orders", "orders_list");
    if (response.status === 401 || response.status === 403) {
      throw new RelayError("upstream_rejected", "The order book refused this account's stored credentials.", { status: response.status, reason: "credentials_refused" });
    }
    let json: unknown;
    try {
      json = response.ok ? upstream.json(response) : undefined;
    } catch {
      json = undefined;
    }
    const rows = Array.isArray(json) ? json : isRecord(json) ? (json["data"] ?? json["orders"]) : undefined;
    if (!Array.isArray(rows)) throw new RelayError("upstream_rejected", "The order book's order list was unreadable.", { host: response.host, status: response.status });

    const orders: Array<{
      order_hash: string;
      token_id: string;
      side: "BUY" | "SELL";
      price: string;
      original_shares: string;
      remaining_shares: string;
      expires_at: string | null;
    }> = [];
    for (const raw of rows) {
      const row = parseRow(raw);
      if (row === undefined || !isRecord(raw)) continue;
      const tokenId = raw["asset_id"] ?? raw["token_id"] ?? raw["assetId"];
      const sideText = typeof raw["side"] === "string" ? raw["side"].toUpperCase() : "";
      const side = sideText === "BUY" ? "BUY" : sideText === "SELL" ? "SELL" : undefined;
      const priceText = raw["price"];
      if (typeof tokenId !== "string" || !DECIMAL.test(tokenId) || side === undefined || typeof priceText !== "string") continue;
      let price: string;
      try {
        price = formatTick(parsePriceToTick(priceText));
      } catch {
        continue;
      }
      if (row.originalMicro === null || row.originalMicro <= 0n) continue;
      const remaining = row.originalMicro > row.matchedMicro ? row.originalMicro - row.matchedMicro : 0n;
      const expiry = typeof raw["expiration"] === "string" || typeof raw["expiration"] === "number" ? Number(raw["expiration"]) : 0;
      orders.push({
        order_hash: row.hash,
        token_id: tokenId,
        side,
        price,
        original_shares: formatMicro(row.originalMicro),
        remaining_shares: formatMicro(remaining),
        expires_at: Number.isSafeInteger(expiry) && expiry > 0 ? isoSecondOf(expiry * 1000) : null,
      });
      // Every fill read is a chance to catch a fee over the bound.
      const record = loadRecord(state, row.hash);
      if (record !== undefined) await checkFee(context, record.order, row, undefined);
    }
    track(maybeSweep(context, account));
    return { orders: orders.slice(0, 500) };
  };

  const routes: RouteTable = {
    "POST /v1/order/prepare": prepare,
    "POST /v1/order/submit": submit,
    "GET /v1/order/:hash": status,
    "POST /v1/order/cancel": cancel,
    "POST /v1/orders/list": list,
  };

  return {
    routes,
    async idle() {
      while (background.size > 0) await Promise.allSettled([...background]);
    },
    sweep,
  };
}

// The instance relay/routes.ts serves. A maintenance timer can call defaultOrders.sweep(context) to give
// back reservations whose orders are gone; prepare and list do it on their own, at most every 20 s.
export const defaultOrders: OrderRoutes = createOrderRoutes();
export const routes: RouteTable = defaultOrders.routes;
