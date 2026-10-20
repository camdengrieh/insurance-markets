import { ORDER_CAP_FEE_BPS } from "../../../src/xo/signing/amounts.js";
import { type ORDER_STATUS_STATES, type PostRequest, type PostResponse, type RelayFailure } from "../../../src/relay/contract.js";
import { cleanLine } from "./redact.js";
import { expectOk, rawPrefixFromFacts, signItem, type SignedItem } from "./flows.js";
import { Refusal, type RunContext } from "./types.js";

// The order procedures T3b, T3c, T8 and T6b share: prepare, sign, submit once, follow by hash, list,
// cancel. Each takes exactly the steps the plugin's tools take, through the relay's HTTP routes.

export type OrderPrepareBody = PostRequest<"/v1/order/prepare">;
export type PreparedOrderItem = PostResponse<"/v1/order/prepare">;

export interface OrderParams {
  readonly tokenId: string;
  readonly side: "BUY" | "SELL";
  readonly price: string;
  readonly shares: string;
  readonly tif: "GTD" | "FOK" | "FAK";
  readonly ttlS?: number;
  readonly postOnly?: boolean;
  readonly purpose?: "trade" | "seed";
}

export type Prepared = { readonly ok: true; readonly item: PreparedOrderItem } | { readonly ok: false; readonly error: RelayFailure; readonly httpStatus: number };

export async function prepareOrder(ctx: RunContext, params: OrderParams): Promise<Prepared> {
  const body: OrderPrepareBody = {
    owner: ctx.owner,
    token_id: params.tokenId,
    side: params.side,
    price: params.price,
    shares: params.shares,
    tif: params.tif,
    ...(params.ttlS === undefined ? {} : { ttl_s: params.ttlS }),
    ...(params.postOnly === true ? { post_only: true } : {}),
    ...(params.purpose === undefined ? {} : { purpose: params.purpose }),
  };
  const result = await ctx.client.post("/v1/order/prepare", body);
  if (!result.ok) return { ok: false, error: result.error, httpStatus: result.status };
  const item = result.data;
  ctx.observe("order digest_tag", item.summary.digest_tag);
  ctx.observe("max outlay (with the 1000 bps cap multiplier)", `${item.quote.max_outlay_usd} USD`);
  for (const line of item.summary.lines) ctx.say(`   ${cleanLine(line, 300)}`);
  for (const warning of item.warnings) ctx.say(`   warning: ${cleanLine(warning, 300)}`);
  return { ok: true, item };
}

export interface Placed {
  readonly state: "accepted" | "pending" | "rejected" | "ambiguous";
  readonly orderHash: string;
  readonly detail: string | undefined;
  readonly signed: SignedItem;
}

// Signs the prepared item and submits it ONCE. Never resubmits: an ambiguous answer is followed by hash.
export async function signAndSubmitOrder(
  ctx: RunContext,
  item: PreparedOrderItem,
  label: string,
  steps: { readonly sign?: () => void; readonly submit?: () => void } = {},
): Promise<Placed | { readonly refused: RelayFailure }> {
  const prefix = rawPrefixFromFacts(ctx);
  steps.sign?.();
  const signed = await signItem(ctx, item, label, { validForS: 120, ...(prefix === undefined ? {} : { rawHexPrefix: prefix }) });
  steps.submit?.();
  const result = await ctx.client.post("/v1/order/submit", { prepared_id: item.prepared_id, signature: signed.input });
  if (!result.ok) return { refused: result.error };
  return { state: result.data.state, orderHash: result.data.order_hash, detail: result.data.detail, signed };
}

export type OrderState = (typeof ORDER_STATUS_STATES)[number];

export interface Followed {
  readonly state: OrderState;
  readonly filled: string | undefined;
  readonly remaining: string | undefined;
  readonly detail: string | undefined;
  readonly timedOut: boolean;
}

// Polls GET /v1/order/:hash until `done(state)` or the time is up.
export async function followOrder(ctx: RunContext, hash: string, done: (state: OrderState) => boolean, timeoutMs: number, everyMs = 5_000): Promise<Followed> {
  const outcome = await ctx.poll<Followed>(
    `order ${hash.slice(0, 12)}...`,
    async () => {
      const status = expectOk("order status", await ctx.client.get(`/v1/order/${hash.toLowerCase()}` as `/v1/order/0x${string}`));
      const value: Followed = { state: status.state, filled: status.filled_shares, remaining: status.remaining_shares, detail: status.detail, timedOut: false };
      return { done: done(status.state), value };
    },
    { timeoutMs, everyMs },
  );
  return { ...outcome.value, timedOut: outcome.timedOut };
}

export async function listHas(ctx: RunContext, hash: string): Promise<{ readonly has: boolean; readonly count: number }> {
  const list = expectOk("orders list", await ctx.client.post("/v1/orders/list", { owner: ctx.owner }));
  return { has: list.orders.some((order) => order.order_hash.toLowerCase() === hash.toLowerCase()), count: list.orders.length };
}

export async function cancelOrder(ctx: RunContext, hash: string): Promise<{ readonly state: string; readonly detail: string | undefined }> {
  const result = await ctx.client.post("/v1/order/cancel", { owner: ctx.owner, order_hash: hash as `0x${string}` });
  if (!result.ok) throw new Refusal(result.error.code, `cancel was refused: ${cleanLine(result.error.message, 240)}`);
  return { state: result.data.state, detail: result.data.detail };
}

// The token id of the market to trade: the flag on the live target, the rehearsal's market on the mock.
export function tokenIdFor(ctx: RunContext, flag: string | undefined): string {
  const id = flag ?? ctx.world.state.tokenId;
  if (id === undefined) throw new Refusal("no_token_id", "Give --token-id: the decimal token id of an active market with a book.");
  return id;
}

// A BUY's most expensive case in USD: principal times (1 + the relay's cap multiplier, ORDER_CAP_FEE_BPS), rounded up to a micro-dollar.
export function maxBuyOutlayUsd(price: string, shares: string): string {
  const micro = (text: string, decimals: number): bigint => {
    const [whole = "0", fraction = ""] = text.split(".");
    return BigInt(`${whole}${fraction.padEnd(decimals, "0").slice(0, decimals)}`);
  };
  // price has up to 3 decimals, shares up to 6: the principal in micro-dollars is price x shares.
  const principalMicro = (micro(price, 3) * micro(shares, 6)) / 1000n;
  const withFee = (principalMicro * (10_000n + BigInt(ORDER_CAP_FEE_BPS)) + 9_999n) / 10_000n;
  const whole = withFee / 1_000_000n;
  const fraction = (withFee % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction === "" ? whole.toString() : `${whole.toString()}.${fraction}`;
}
