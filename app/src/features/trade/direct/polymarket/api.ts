// Polymarket's CLOB, called from the visitor's browser (clob.polymarket.com answers CORS for any origin on the routes
// below, measured 2026-10-23 from the deployed page's origin: GET /time, /book, /auth/derive-api-key and /data/orders;
// POST /auth/api-key and /order; DELETE /order). Each answer is parsed with zod; anything else is "unreadable", never
// a default. What the venue writes in words (an error, a status) is a stranger's text: it is cleaned and capped here
// and rendered only through the untrusted slot.
//
// The request shapes are the relay's (relay/clob.ts): the same routes, headers, bodies and classification, so the
// browser and the relay send a venue byte-identical requests for the same order.

import * as z from "zod/v4";

import { MICRO } from "@sdk/trade/clob/amounts";
import type { Hex } from "viem";

import { decToAtomic } from "../../../../core/money";
import { originOfService } from "../../../../core/fetch";
import { isVenueHttpError, type VenueHttp, type VenueResponse } from "../http";
import { venueText } from "../text";
import { ok, refuse, type DirectOpenOrder, type DirectOpenOrders, type DirectCancelAnswer, type DirectResult } from "../types";
import { buildPolymarketL2Headers, type PolymarketCredentials } from "./l2";

// The CLOB's origin, from the one registry the CSP is built from (sdk/venues/origins.ts), never typed here.
export const POLYMARKET_CLOB_ORIGIN: string = originOfService("polymarket_clob") ?? "";

// The venue's clock is remembered for a minute (relay/clob.ts polymarketClock does the same).
export const CLOCK_TTL_MS = 60_000;

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

// The venue's own words in an answer: its `error`, `errorMsg` or `message`, else the body itself.
export function venueWordsOf(response: VenueResponse): string | null {
  const json = jsonOf(response.text);
  if (typeof json === "object" && json !== null) {
    const record = json as Record<string, unknown>;
    for (const key of ["error", "errorMsg", "message"]) {
      if (typeof record[key] === "string" && record[key] !== "") return venueText(record[key]);
    }
  }
  return venueText(response.text);
}

function unreachable<T>(error: unknown): DirectResult<T> {
  if (isVenueHttpError(error) && error.code === "timeout") return refuse("venue_unreachable", "Polymarket did not answer in time.");
  if (isVenueHttpError(error) && error.code === "too_large") return refuse("venue_unreachable", "Polymarket's answer was larger than this page reads.");
  return refuse("venue_unreachable", "Polymarket could not be reached from this page (the network or the browser refused the request).");
}

// ---- the venue's clock ---------------------------------------------------------------------------------------------------------

const TIME = /^\s*"?(\d{9,12})"?\s*$/;

export interface VenueClock {
  // Unix seconds on the venue's clock. `fresh` asks the venue again even when an offset is remembered.
  nowS(fresh?: boolean): Promise<DirectResult<number>>;
}

export function createVenueClock(http: VenueHttp, nowMs: () => number): VenueClock {
  let remembered: { readonly offsetS: number; readonly atMs: number } | null = null;
  return {
    async nowS(fresh = false) {
      const localS = Math.floor(nowMs() / 1000);
      if (!fresh && remembered !== null && nowMs() - remembered.atMs < CLOCK_TTL_MS) return ok(localS + remembered.offsetS);
      let response: VenueResponse;
      try {
        response = await http({ method: "GET", url: `${POLYMARKET_CLOB_ORIGIN}/time` });
      } catch (error) {
        return unreachable(error);
      }
      const match = response.status === 200 ? TIME.exec(response.text) : null;
      if (match?.[1] === undefined) return refuse("venue_unreachable", "Polymarket did not give a usable time, so nothing was signed.");
      const venueS = Number(match[1]);
      remembered = { offsetS: venueS - localS, atMs: nowMs() };
      return ok(venueS);
    },
  };
}

// ---- the book: the market's live tick, minimum size and kind -------------------------------------------------------------

const numberOrText = z.union([z.string(), z.number()]);
const level = z.object({ price: numberOrText });
const bookSchema = z.object({
  market: z.string(),
  tick_size: numberOrText,
  min_order_size: numberOrText.optional(),
  neg_risk: z.boolean().optional(),
  bids: z.array(z.unknown()).optional(),
  asks: z.array(z.unknown()).optional(),
});

export interface PolymarketBookRead {
  readonly market: string;
  readonly tick: string;
  readonly minSize: string;
  readonly negRisk: boolean;
  readonly bestBidMicro: bigint | null;
  readonly bestAskMicro: bigint | null;
}

function priceMicro(value: unknown): bigint | null {
  const parsed = level.safeParse(value);
  if (!parsed.success) return null;
  const decimal = decToAtomic(typeof parsed.data.price === "number" ? String(parsed.data.price) : parsed.data.price, 6);
  return decimal.ok && decimal.value > 0n && decimal.value < MICRO ? decimal.value : null;
}

function best(levels: readonly unknown[] | undefined, pick: "max" | "min"): bigint | null {
  let found: bigint | null = null;
  for (const entry of levels ?? []) {
    const micro = priceMicro(entry);
    if (micro === null) continue;
    if (found === null || (pick === "max" ? micro > found : micro < found)) found = micro;
  }
  return found;
}

const MIN_SIZE = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/;

export async function readPolymarketBook(http: VenueHttp, tokenId: string): Promise<DirectResult<PolymarketBookRead>> {
  let response: VenueResponse;
  try {
    response = await http({ method: "GET", url: `${POLYMARKET_CLOB_ORIGIN}/book?token_id=${encodeURIComponent(tokenId)}` });
  } catch (error) {
    return unreachable(error);
  }
  if (response.status === 404 || response.status === 400) return refuse("invalid_order", "Polymarket has no order book for this outcome token.", venueWordsOf(response));
  const parsed = response.status === 200 ? bookSchema.safeParse(jsonOf(response.text)) : null;
  if (parsed === null || !parsed.success) return refuse("venue_unreachable", "Polymarket's order book was unreadable, so nothing was signed.");
  const book = parsed.data;
  const minRaw = book.min_order_size === undefined ? "0" : String(book.min_order_size);
  return ok({
    market: book.market,
    tick: String(book.tick_size),
    minSize: MIN_SIZE.test(minRaw) ? minRaw : "0",
    negRisk: book.neg_risk === true,
    bestBidMicro: best(book.bids, "max"),
    bestAskMicro: best(book.asks, "min"),
  });
}

// ---- the L1 login: derive the visitor's existing key, or create one ---------------------------------------------------------

const credentialSchema = z.object({
  apiKey: z.string().optional(),
  api_key: z.string().optional(),
  secret: z.string(),
  passphrase: z.string(),
});

function credentialOf(response: VenueResponse): PolymarketCredentials | null {
  if (response.status < 200 || response.status >= 300) return null;
  const parsed = credentialSchema.safeParse(jsonOf(response.text));
  if (!parsed.success) return null;
  const apiKey = parsed.data.apiKey ?? parsed.data.api_key;
  return apiKey === undefined ? null : { apiKey, secret: parsed.data.secret, passphrase: parsed.data.passphrase };
}

export type L1Headers = Readonly<Record<"POLY_ADDRESS" | "POLY_SIGNATURE" | "POLY_TIMESTAMP" | "POLY_NONCE", string>>;

// Derive first (an existing key); create once only when derive gives nothing usable and did not refuse the signature.
// The same order and the same two requests as the relay's /v1/clob/auth/submit.
export async function deriveOrCreateCredentials(http: VenueHttp, headers: L1Headers, isUsable: (credentials: PolymarketCredentials) => boolean): Promise<DirectResult<{ readonly credentials: PolymarketCredentials; readonly how: "derived" | "created" }>> {
  let derived: VenueResponse;
  try {
    derived = await http({ method: "GET", url: `${POLYMARKET_CLOB_ORIGIN}/auth/derive-api-key`, headers: { ...headers } });
  } catch (error) {
    return unreachable(error);
  }
  const found = credentialOf(derived);
  if (found !== null && isUsable(found)) return ok({ credentials: found, how: "derived" });
  if (derived.status === 401 || derived.status === 403) return refuse("venue_refused", "Polymarket refused the login signature.", venueWordsOf(derived));
  let created: VenueResponse;
  try {
    created = await http({ method: "POST", url: `${POLYMARKET_CLOB_ORIGIN}/auth/api-key`, headers: { ...headers }, body: "" });
  } catch (error) {
    if (isVenueHttpError(error) && error.code === "timeout") return refuse("venue_ambiguous", "Polymarket did not answer the request to create a key; a key may or may not exist now. Logging in again derives it if it does.");
    return unreachable(error);
  }
  const made = credentialOf(created);
  if (made !== null && isUsable(made)) return ok({ credentials: made, how: "created" });
  if (created.status >= 500) return refuse("venue_ambiguous", "Polymarket did not answer the request to create a key; a key may or may not exist now. Logging in again derives it if it does.", venueWordsOf(created));
  return refuse("venue_refused", "Polymarket did not return a usable credential.", venueWordsOf(created));
}

// ---- requests signed with the visitor's own L2 credential ----------------------------------------------------------------------

export interface L2Context {
  readonly http: VenueHttp;
  readonly clock: VenueClock;
  // The wallet the credential belongs to.
  readonly address: string;
  readonly credentials: PolymarketCredentials;
}

// `sent: false` means nothing left the page (the clock or the credential failed first); `sent: true` with a refusal means
// the request went out and no answer came back, so its effect at the venue is unknown.
type L2Outcome = { readonly sent: false; readonly result: DirectResult<never> } | { readonly sent: true; readonly result: DirectResult<VenueResponse> };

async function l2Request(context: L2Context, method: "GET" | "POST" | "DELETE", path: string, query: string, body: string): Promise<L2Outcome> {
  const now = await context.clock.nowS();
  if (!now.ok) return { sent: false, result: now };
  let headers: Record<string, string>;
  try {
    headers = await buildPolymarketL2Headers({ address: context.address, credentials: context.credentials, timestampSeconds: now.value, method, path, body });
  } catch {
    return { sent: false, result: refuse("not_logged_in", "The Polymarket credential held in this tab cannot sign a request. Log in again.") };
  }
  try {
    const response = await context.http({ method, url: `${POLYMARKET_CLOB_ORIGIN}${path}${query}`, headers: body === "" ? headers : { ...headers, "Content-Type": "application/json" }, ...(body === "" ? {} : { body }) });
    return { sent: true, result: ok(response) };
  } catch (error) {
    // A page-side refusal (a host off the list) stops before the request; anything else may have reached the venue.
    if (isVenueHttpError(error) && error.code === "not_allowed") return { sent: false, result: unreachable(error) };
    return { sent: true, result: unreachable(error) };
  }
}

// POST /order (place-orders.md). The body is built by the caller (order.ts) and sent exactly as signed.
const postAnswerSchema = z.object({
  success: z.boolean().optional(),
  errorMsg: z.string().optional(),
  orderID: z.string().optional(),
  orderId: z.string().optional(),
  status: z.string().optional(),
});

export interface PostedOrder {
  readonly orderId: string;
  readonly status: string;
  readonly venueText: string | null;
}

// The relay's classification (relay/clob.ts classify): accepted only when the venue names this order's own id.
export function classifyOrderAnswer(response: VenueResponse, orderHash: Hex): DirectResult<PostedOrder> {
  const words = venueWordsOf(response);
  if (response.status >= 200 && response.status < 300) {
    const parsed = postAnswerSchema.safeParse(jsonOf(response.text));
    if (!parsed.success) return refuse("venue_ambiguous", "Polymarket answered, but not in a form this page reads: the order may or may not be resting. Check your open orders.");
    if (parsed.data.success === false) return refuse("venue_refused", "Polymarket did not accept the order.", venueText(parsed.data.errorMsg) ?? words);
    const orderId = parsed.data.orderID ?? parsed.data.orderId;
    if (orderId !== undefined && orderId.toLowerCase() === orderHash.toLowerCase()) {
      const status = (parsed.data.status ?? "unknown").toLowerCase().replace(/[^a-z_]/g, "").slice(0, 24) || "unknown";
      return ok({ orderId: orderHash.toLowerCase(), status, venueText: venueText(parsed.data.errorMsg) });
    }
    return refuse("venue_ambiguous", orderId === undefined ? "Polymarket answered without an order id: the order may or may not be resting. Check your open orders." : "Polymarket answered with another order id than this order's: check your open orders.");
  }
  if (response.status === 401 || response.status === 403) return refuse("venue_refused", "Polymarket refused the request (its credential check, or a regional restriction).", words);
  if (response.status >= 500) return refuse("venue_ambiguous", "Polymarket failed while handling the order: it may or may not be resting. Check your open orders before trying again.", words);
  return refuse("venue_refused", `Polymarket refused the order (HTTP ${response.status}).`, words);
}

export async function postPolymarketOrder(context: L2Context, body: string, orderHash: Hex): Promise<DirectResult<PostedOrder>> {
  const outcome = await l2Request(context, "POST", "/order", "", body);
  if (!outcome.result.ok) {
    // A request that may have left the browser and got no answer is not a refusal: the outcome is unknown.
    return outcome.sent ? refuse("venue_ambiguous", `${outcome.result.refusal.message} The order may or may not have reached it: check your open orders before trying again.`) : outcome.result;
  }
  return classifyOrderAnswer(outcome.result.value, orderHash);
}

// GET /data/orders (the wallet's resting orders), narrowed to one market when given.
const openOrderSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  market: z.string().optional(),
  asset_id: z.string().optional(),
  side: z.string().optional(),
  original_size: numberOrText.optional(),
  size_matched: numberOrText.optional(),
  price: numberOrText.optional(),
  outcome: z.string().optional(),
  maker_address: z.string().optional(),
});
const openOrdersSchema = z.union([z.array(z.unknown()), z.object({ data: z.array(z.unknown()), next_cursor: z.string().optional() })]);
// The CLOB's cursor that means "no more pages" (the official clients' END_CURSOR).
const END_CURSOR = "LTE=";

const HEX_ID = /^0x[0-9a-fA-F]{1,64}$/;
const DECIMAL = /^[0-9]{1,18}(\.[0-9]{1,8})?$/;
const TOKEN = /^[0-9]{1,78}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function decimalText(value: string | number | undefined): string | null {
  if (value === undefined) return null;
  const text = String(value);
  return DECIMAL.test(text) ? text : null;
}

function openOrderOf(value: unknown): DirectOpenOrder | null {
  const parsed = openOrderSchema.safeParse(value);
  if (!parsed.success || !HEX_ID.test(parsed.data.id)) return null;
  const o = parsed.data;
  const side = o.side?.toUpperCase();
  return {
    id: o.id.toLowerCase(),
    side: side === "BUY" || side === "SELL" ? side : null,
    price: decimalText(o.price),
    originalSize: decimalText(o.original_size),
    sizeMatched: decimalText(o.size_matched),
    tokenId: o.asset_id !== undefined && TOKEN.test(o.asset_id) ? o.asset_id : null,
    maker: o.maker_address !== undefined && ADDRESS.test(o.maker_address) ? o.maker_address : null,
    status: venueText(o.status),
    outcome: venueText(o.outcome),
  };
}

export async function getPolymarketOpenOrders(context: L2Context, market: string | null): Promise<DirectResult<DirectOpenOrders>> {
  const query = market === null ? "" : `?market=${encodeURIComponent(market)}`;
  const outcome = await l2Request(context, "GET", "/data/orders", query, "");
  if (!outcome.result.ok) return outcome.result;
  const response = outcome.result.value;
  if (response.status === 401 || response.status === 403) return refuse("not_logged_in", "Polymarket refused the credential held in this tab. Log in again.", venueWordsOf(response));
  if (response.status !== 200) return refuse("venue_refused", `Polymarket did not list the orders (HTTP ${response.status}).`, venueWordsOf(response));
  const parsed = openOrdersSchema.safeParse(jsonOf(response.text));
  if (!parsed.success) return refuse("venue_unreachable", "Polymarket's list of orders was unreadable.");
  const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.data;
  const cursor = Array.isArray(parsed.data) ? undefined : parsed.data.next_cursor;
  const orders = rows.map(openOrderOf).filter((order): order is DirectOpenOrder => order !== null);
  return ok({ orders, more: cursor !== undefined && cursor !== "" && cursor !== END_CURSOR });
}

// DELETE /order with {"orderID": id}, signed over that exact body.
const cancelSchema = z.object({ canceled: z.array(z.string()).optional(), not_canceled: z.record(z.string(), z.unknown()).optional() });

export async function cancelPolymarketOrder(context: L2Context, orderId: string): Promise<DirectResult<DirectCancelAnswer>> {
  if (!HEX_ID.test(orderId)) return refuse("invalid_order", "That is not a Polymarket order id.");
  const body = JSON.stringify({ orderID: orderId });
  const outcome = await l2Request(context, "DELETE", "/order", "", body);
  if (!outcome.result.ok) return outcome.sent ? refuse("venue_ambiguous", `${outcome.result.refusal.message} The cancel may or may not have reached it: list your open orders again.`) : outcome.result;
  const response = outcome.result.value;
  if (response.status === 401 || response.status === 403) return refuse("not_logged_in", "Polymarket refused the credential held in this tab. Log in again.", venueWordsOf(response));
  if (response.status >= 500) return refuse("venue_ambiguous", "Polymarket failed while handling the cancel: list your open orders again to see whether it is still resting.", venueWordsOf(response));
  if (response.status !== 200) return refuse("venue_refused", `Polymarket refused the cancel (HTTP ${response.status}).`, venueWordsOf(response));
  const parsed = cancelSchema.safeParse(jsonOf(response.text));
  if (!parsed.success) return refuse("venue_ambiguous", "Polymarket's answer to the cancel was unreadable: list your open orders again.");
  const canceled = (parsed.data.canceled ?? []).filter((id) => HEX_ID.test(id)).map((id) => id.toLowerCase());
  const notCanceled = Object.entries(parsed.data.not_canceled ?? {})
    .filter(([id]) => HEX_ID.test(id))
    .map(([id, reason]) => ({ id: id.toLowerCase(), reason: venueText(typeof reason === "string" ? reason : JSON.stringify(reason)) ?? "no reason given" }));
  return ok({ canceled, notCanceled });
}

// GET /balance-allowance/update: asks the CLOB to read the account's collateral balance and allowances again, after the
// Deposit Wallet's approvals land (note 45 section 9 step 7). Its answer changes nothing here; a refusal is reported.
export async function refreshPolymarketAllowances(context: L2Context, signatureType: number): Promise<DirectResult<void>> {
  const outcome = await l2Request(context, "GET", "/balance-allowance/update", `?asset_type=COLLATERAL&signature_type=${signatureType}`, "");
  if (!outcome.result.ok) return outcome.result;
  const response = outcome.result.value;
  if (response.status === 401 || response.status === 403) return refuse("not_logged_in", "Polymarket refused the credential held in this tab.", venueWordsOf(response));
  if (response.status < 200 || response.status >= 300) return refuse("venue_refused", `Polymarket did not read the allowances again (HTTP ${response.status}).`, venueWordsOf(response));
  return ok(undefined);
}
