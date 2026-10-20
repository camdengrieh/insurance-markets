import { getAddress, type Hex } from "viem";

import {
  NO_AMOUNT_CONSTRAINTS,
  ZERO_ADDRESS,
  ZERO_BYTES16,
  ZERO_BYTES32,
  assembleWireSignature,
  computeOrderAmounts,
  orderToWire,
  prepareOrderSigning,
  type XoOrder,
} from "../../../src/xo/signing/index.js";
import { SIGNATURE_TYPE_XO_SMART_ACCOUNT } from "../../../src/xo/chain/constants.js";
import { normalizeSignature } from "../../../src/xo/userop/sign.js";
import { signItem } from "./flows.js";
import { cleanLine } from "./redact.js";
import { Refusal, type RunContext } from "./types.js";

// T3b's optional probes (--probes): orders the RELAY would refuse by design, sent to the gateway directly to
// read its real floors from the rejection text. The relay keeps conservative floors (one share, $0.30, a
// 150 second life) until a test lowers them, so these cannot go through it.
//
// What that means, stated plainly: these orders are built, signed (by you, each one) and sent by the kit, outside
// the relay's order records and daily ledger. Each is a post-only BUY of at most $0.33 outlay with the 1000 bps
// cap multiplier, sequential, cancelled straight away when the gateway takes it, and short-lived anyway (at most 300
// seconds). The kit refuses a probe that would put more than that at risk, never signs one without showing it,
// and the transport lists the writes (a second copy of a body is allowed only for the duplicate probe).

export interface FloorProbe {
  readonly id: string;
  readonly shares: string;
  readonly price: string;
  readonly ttlS: number;
  readonly about: string;
}

export const FLOOR_PROBES: readonly FloorProbe[] = Object.freeze([
  { id: "notional_030", shares: "10", price: "0.03", ttlS: 300, about: "10 shares at 0.03 = $0.30, the relay's own floor" },
  { id: "tiny_001", shares: "1", price: "0.01", ttlS: 300, about: "1 share at 0.01 = $0.01, far below any floor" },
  { id: "life_60", shares: "10", price: "0.03", ttlS: 60, about: "$0.30 living 60 seconds" },
  { id: "life_30", shares: "10", price: "0.03", ttlS: 30, about: "$0.30 living 30 seconds" },
  { id: "life_15", shares: "10", price: "0.03", ttlS: 15, about: "$0.30 living 15 seconds" },
]);

export const MAX_PROBE_OUTLAY_USD = "0.33";

// The relay paces its requests (4 per second per host), so a few hundred milliseconds pass between reading XO's
// clock and the gateway seeing the order. Without slack, a 60 second order would reach a gateway whose floor
// is exactly 60 seconds with 59.7 seconds left and be refused, and the floor would be misread as longer than
// 60. One second of slack makes "living 60 seconds" mean "at least 60 seconds left when it arrives".
export const PROBE_LIFETIME_SLACK_S = 1;

export interface ProbeSent {
  readonly status: number | undefined;
  readonly accepted: boolean;
  readonly orderHash: Hex | undefined;
  readonly text: string;
}

export interface ProbeResult extends ProbeSent {
  readonly probe: FloorProbe;
  // Whole seconds the order still had to live when it was handed to the gateway (the planned life plus the slack,
  // less the time the signature took). A lifetime finding is drawn from THIS, not from the planned figure.
  readonly remainingS: number;
  readonly cancelled: boolean | undefined;
  // The exact bytes sent, kept so the duplicate probe can send them again.
  readonly body: string | undefined;
}

const ORDERBOOK = "https://orderbooks.xo.market";

function services(ctx: RunContext) {
  const relay = ctx.services?.services;
  if (relay === undefined || relay.l2auth === undefined) throw new Refusal("no_credentials", "The probes sign XO requests with the relay's stored credentials: run T2 first.");
  return { upstream: relay.upstream, l2auth: relay.l2auth };
}

async function xoNowSeconds(ctx: RunContext): Promise<number> {
  const { upstream } = services(ctx);
  const response = await upstream.request({ method: "GET", url: `${ORDERBOOK}/time`, purpose: "kit_probe_time" });
  const match = /^\s*"?(\d{9,12})"?\s*$/.exec(response.body);
  if (!response.ok || match === null) throw new Refusal("no_time", "XO's clock could not be read, so no probe order was built.");
  return Number(match[1]);
}

function readReply(status: number | undefined, text: string): ProbeSent {
  let accepted = false;
  let orderHash: Hex | undefined;
  try {
    const json = JSON.parse(text) as { success?: unknown; orderID?: unknown };
    accepted = status !== undefined && status >= 200 && status < 300 && json.success !== false && typeof json.orderID === "string";
    if (typeof json.orderID === "string" && /^0x[0-9a-fA-F]{64}$/.test(json.orderID)) orderHash = json.orderID.toLowerCase() as Hex;
  } catch {
    accepted = false;
  }
  return { status, accepted, orderHash, text: cleanLine(text, 200) };
}

async function post(ctx: RunContext, body: string): Promise<ProbeSent> {
  const { upstream, l2auth } = services(ctx);
  const nowS = Math.floor(ctx.clock.nowMs() / 1000);
  const headers = await l2auth.headers({ account: ctx.account, method: "POST", path: "/order", body, timestampSeconds: nowS });
  try {
    const response = await upstream.request({ method: "POST", url: `${ORDERBOOK}/order`, headers, body, purpose: "probe_order", timeoutMs: 10_000, maxBytes: 64 * 1024 });
    return readReply(response.status, response.body);
  } catch (error) {
    return { status: undefined, accepted: false, orderHash: undefined, text: `no answer (${error instanceof Error ? error.name : "error"})` };
  }
}

export async function cancelDirect(ctx: RunContext, orderHash: Hex): Promise<boolean> {
  const { upstream, l2auth } = services(ctx);
  const body = JSON.stringify({ orderID: orderHash });
  const headers = await l2auth.headers({ account: ctx.account, method: "DELETE", path: "/order", body, timestampSeconds: Math.floor(ctx.clock.nowMs() / 1000) });
  try {
    const response = await upstream.request({ method: "DELETE", url: `${ORDERBOOK}/order`, headers, body, purpose: "probe_cancel", timeoutMs: 10_000, maxBytes: 64 * 1024 });
    return response.ok;
  } catch {
    return false;
  }
}

// Builds, shows, has signed and sends ONE probe order. Cancels it at once if the gateway took it.
export async function sendFloorProbe(ctx: RunContext, tokenId: string, probe: FloorProbe): Promise<ProbeResult> {
  const amounts = computeOrderAmounts({ side: 0, price: probe.price, shares: probe.shares, constraints: NO_AMOUNT_CONSTRAINTS });
  const xoNow = await xoNowSeconds(ctx);
  const builtAtMs = ctx.clock.nowMs();
  const salt = BigInt(`0x${Buffer.from(ctx.random(8)).toString("hex")}`) + 1n;
  const maker = getAddress(ctx.account);
  const order: XoOrder = {
    salt,
    maker,
    signer: maker,
    beneficiary: ZERO_ADDRESS,
    tokenId: BigInt(tokenId),
    makerAmount: amounts.makerAmount,
    takerAmount: amounts.takerAmount,
    expiration: BigInt(xoNow + probe.ttlS + PROBE_LIFETIME_SLACK_S),
    nonce: 0n,
    identifier: ZERO_BYTES16,
    metadata: ZERO_BYTES32,
    side: 0,
    signatureType: SIGNATURE_TYPE_XO_SMART_ACCOUNT,
  };
  // A short life is the point of the lifetime probes, so the lifetime floor is lowered to one second here
  // (it is the gateway's floor being measured, not the relay's).
  const signing = prepareOrderSigning(order, { expiry: { nowSeconds: xoNow, minTtlSeconds: 1, maxTtlSeconds: 3600 } });
  ctx.observe(`probe ${probe.id}`, probe.about);
  const signed = await signItem(
    ctx,
    {
      owner: ctx.owner,
      sign: { intent: { op: "typedData", typedData: JSON.parse(JSON.stringify(signing.typedData)) as never }, expected_digest: signing.wrappedDigest, digest_form: "kernelWrappedOrderHash" },
      summary: { digest_tag: signing.wrappedDigest.slice(2, 18), lines: [`PROBE ${probe.id}: a post-only BUY of ${probe.shares} at ${probe.price} living ${String(probe.ttlS)} seconds. Cancelled at once if the gateway takes it. About: ${probe.about}.`] },
    },
    `Probe ${probe.id}: ${probe.about}`,
    { validForS: Math.max(10, probe.ttlS) },
  );
  const remainingS = Math.max(0, Math.floor(probe.ttlS + PROBE_LIFETIME_SLACK_S - (ctx.clock.nowMs() - builtAtMs) / 1000));
  if (remainingS < probe.ttlS) ctx.observe(`probe ${probe.id} timing`, `the signature took too long: ${String(remainingS)} s of the planned ${String(probe.ttlS)} s are left; a lifetime finding is drawn from the time left, not from the plan`);
  const wire = orderToWire(order);
  const signature = assembleWireSignature(normalizeSignature(signed.input).signature, { form: "kernel-validator-0x01" });
  const body = JSON.stringify({ order: { ...wire, signature }, orderType: "GTD", postOnly: true });
  const sent = await post(ctx, body);
  let cancelled: boolean | undefined;
  if (sent.accepted && sent.orderHash !== undefined) cancelled = await cancelDirect(ctx, sent.orderHash);
  return { ...sent, probe, remainingS, cancelled, body };
}

// The same bytes again: whether the gateway calls the second one a duplicate (OR13).
export async function repostDuplicate(ctx: RunContext, first: ProbeResult): Promise<ProbeSent & { readonly cancelled: boolean | undefined }> {
  if (first.body === undefined) throw new Refusal("no_body", "There is no probe body to repeat.");
  const sent = await post(ctx, first.body);
  const cancelled = sent.accepted && sent.orderHash !== undefined ? await cancelDirect(ctx, sent.orderHash) : undefined;
  return { ...sent, cancelled };
}
