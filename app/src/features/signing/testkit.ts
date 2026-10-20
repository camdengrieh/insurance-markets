// Builders for the signing screen's tests: REAL prepared items, made with the repo's own user-operation, order and
// login code for the public Anvil account 0, each with a decoded block that really rebuilds to its digest. Nothing
// here signs or sends anything. Pure code with no Node import (the boundary check treats every non-test file under
// app/src as bundled code); only test files import it.

import { inboxItemSchema, type InboxItem, type InboxState } from "@bridge/contract";
import { POST_ROUTES, digestTag, marketTitleSlot, type PreparedDecoded } from "@shared/relay/contract";
import { deriveAccount } from "@shared/xo/account/derive";
import { ANVIL_ACCOUNT_0_OWNER } from "@shared/xo/chain/constants";
import { computeOrderAmounts } from "@shared/xo/signing/amounts";
import { clobAuthKernelDigest, hashClobAuth } from "@shared/xo/signing/clobauth";
import { binaryPositionIds } from "@shared/xo/signing/ctf";
import { ZERO_ADDRESS, ZERO_BYTES16, ZERO_BYTES32 } from "@shared/xo/signing/constants";
import type { XoOrder } from "@shared/xo/signing/order";
import { prepareOrderSigning } from "@shared/xo/signing/prepare";
import { buildDecodedAuth, buildDecodedOrder, buildDecodedUserOp, innerHashSummaryFields, rebuildDecoded } from "@shared/xo/signing/rebuild";
import { createMarketCalls, enableTradingCalls, redeemCalls } from "@shared/xo/userop/calls";
import { firstOpNonce } from "@shared/xo/userop/nonce";
import { prepareUserOp } from "@shared/xo/userop/sign";

export type Obj = Record<string, unknown>;

export const NOW_MS = Date.parse("2026-10-19T12:00:00Z");
export const OWNER = ANVIL_ACCOUNT_0_OWNER;
export const ACCOUNT = deriveAccount(OWNER);
export const PREPARED_ID = "0123456789abcdef0123456789abcdef";

export function isoSecond(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export interface ItemOptions {
  // Seconds from NOW_MS until the item lapses.
  readonly ttlS?: number;
  readonly preparedId?: string;
  readonly withoutDecoded?: boolean;
}

function finish(item: Obj, withoutDecoded: boolean | undefined): Obj {
  if (withoutDecoded === true) {
    delete item["decoded"];
    const summary = item["summary"] as Obj;
    delete summary["inner_hash_tag"];
    delete summary["inner_hash_kind"];
  }
  return item;
}

// A deploy-and-enable-trading user operation (the first thing an XO user signs).
export function deployItem(options: ItemOptions = {}): Obj {
  const built = prepareUserOp({ action: "deploy_enable_trading", owner: OWNER, calls: enableTradingCalls(), nonce: firstOpNonce(), deployed: false, sponsor: true });
  const validUntil = isoSecond(NOW_MS + (options.ttlS ?? 300) * 1000);
  const decoded = buildDecodedUserOp({ built, kind: "userop", action: "deploy_enable_trading", validUntil, titleSlot: null });
  const rebuilt = rebuildDecoded(decoded);
  if (!rebuilt.ok) throw new Error(`test setup: the decoded block did not rebuild (${rebuilt.field})`);
  const item: Obj = {
    prepared_id: options.preparedId ?? PREPARED_ID,
    kind: "userop",
    owner: built.owner,
    account: built.account,
    expires_at: validUntil,
    sign: built.sign,
    summary: { lines: [...rebuilt.lines], digest_tag: built.digestTag, ...innerHashSummaryFields(decoded, rebuilt.inner_hash) },
    caps: { reserved_usd: "0", day_remaining_usd: "50" },
    capabilities: { T1: "unknown", T3a: "no", T0: "yes" },
    warnings: ["Fees are sponsored; nothing here moves funds."],
    decoded,
    user_op_hash: built.userOpHash,
  };
  return finish(item, options.withoutDecoded);
}

// A redeem of two conditions.
export function redeemItem(options: ItemOptions = {}): Obj {
  const ids = [`0x${"ab".repeat(32)}`, `0x${"cd".repeat(32)}`] as const;
  const built = prepareUserOp({ action: "redeem", owner: OWNER, calls: redeemCalls([...ids]), nonce: firstOpNonce() + 1n, deployed: true, sponsor: true });
  const validUntil = isoSecond(NOW_MS + (options.ttlS ?? 300) * 1000);
  const decoded = buildDecodedUserOp({ built, kind: "userop", action: "redeem", validUntil, titleSlot: null });
  const rebuilt = rebuildDecoded(decoded);
  if (!rebuilt.ok) throw new Error(`test setup: the decoded block did not rebuild (${rebuilt.field})`);
  return finish(
    {
      prepared_id: options.preparedId ?? PREPARED_ID,
      kind: "userop",
      owner: built.owner,
      account: built.account,
      expires_at: validUntil,
      sign: built.sign,
      summary: { lines: [...rebuilt.lines], digest_tag: built.digestTag, ...innerHashSummaryFields(decoded, rebuilt.inner_hash) },
      caps: { reserved_usd: "0", day_remaining_usd: "50" },
      capabilities: {},
      warnings: [],
      decoded,
      user_op_hash: built.userOpHash,
    },
    options.withoutDecoded,
  );
}

// A market creation whose title (hostile text) sits in its fixed slot.
// The default address is assembled so no host name appears in source (a metadata URI is creator text, never fetched).
const DEFAULT_URI = ["https:/", "market.invalid", "market.json"].join("/");

export function createItem(title: string, metadataUri = DEFAULT_URI, options: ItemOptions = {}): Obj {
  const slot = marketTitleSlot(title);
  const startsAt = BigInt(Math.floor(NOW_MS / 1000));
  const built = prepareUserOp({
    action: "create_market",
    owner: OWNER,
    calls: createMarketCalls({ startsAt, expiresAt: startsAt + 86_400n, metadataUri }),
    nonce: firstOpNonce() + 2n,
    deployed: true,
    sponsor: false,
  });
  const validUntil = isoSecond(NOW_MS + (options.ttlS ?? 300) * 1000);
  const decoded = buildDecodedUserOp({ built, kind: "create", action: "create_market", validUntil, titleSlot: slot });
  const rebuilt = rebuildDecoded(decoded);
  if (!rebuilt.ok) throw new Error(`test setup: the decoded block did not rebuild (${rebuilt.field})`);
  return finish(
    {
      prepared_id: options.preparedId ?? PREPARED_ID,
      kind: "create",
      owner: built.owner,
      account: built.account,
      expires_at: validUntil,
      sign: built.sign,
      summary: { lines: [...rebuilt.lines], digest_tag: built.digestTag, ...innerHashSummaryFields(decoded, rebuilt.inner_hash) },
      caps: { reserved_usd: "0", day_remaining_usd: "50" },
      capabilities: {},
      warnings: [],
      decoded,
      user_op_hash: built.userOpHash,
    },
    options.withoutDecoded,
  );
}

const CONDITION_ID = `0x${"ab".repeat(32)}` as const;
// The signed token has to be one of the two position ids of the market condition the card names (SC-7).
const TOKEN_ID = BigInt(binaryPositionIds(CONDITION_ID)[0]);

export interface OrderOptions extends ItemOptions {
  readonly side?: "BUY" | "SELL";
  readonly price?: string;
  readonly shares?: string;
  // The lifetime the item STATES (decoded.params.ttl_s), when a test needs it to differ from the signed expiration
  // (the digest does not cover it). A signed expiration longer than the default window is built with ttlS.
  readonly statedTtlS?: number;
}

// A limit order, typed-data intent, with its quote.
export function orderItem(options: OrderOptions = {}): Obj {
  const side = options.side ?? "BUY";
  const price = options.price ?? "0.55";
  const shares = options.shares ?? "10";
  const feeBps = 1000;
  const sideCode = side === "BUY" ? 0 : 1;
  const amounts = computeOrderAmounts({ side: sideCode, price, shares });
  const nowSeconds = BigInt(Math.floor(NOW_MS / 1000));
  const expiration = nowSeconds + BigInt(options.ttlS ?? 300);
  const order: XoOrder = {
    salt: 987_654_321_012_345n,
    maker: ACCOUNT,
    signer: ACCOUNT,
    beneficiary: ZERO_ADDRESS,
    tokenId: TOKEN_ID,
    makerAmount: amounts.makerAmount,
    takerAmount: amounts.takerAmount,
    expiration,
    nonce: 0n,
    identifier: ZERO_BYTES16,
    metadata: ZERO_BYTES32,
    side: sideCode,
    signatureType: 3,
  };
  // The signing window check is relative to the item's own clock, so a short ttl is built with a window that allows it.
  const signing = prepareOrderSigning(order, { expiry: { nowSeconds, minTtlSeconds: 1, maxTtlSeconds: Math.max(3600, options.ttlS ?? 0) } });
  const decoded = buildDecodedOrder({ owner: OWNER, order, feeBps, tif: "GTD", postOnly: false, purpose: "trade", ttlS: options.statedTtlS ?? options.ttlS ?? 300, conditionId: CONDITION_ID });
  const rebuilt = rebuildDecoded(decoded);
  if (!rebuilt.ok || decoded.kind !== "order") throw new Error(`test setup: the order did not rebuild ${rebuilt.ok ? "" : rebuilt.field + ": " + rebuilt.reason}`);
  const item: Obj = {
    prepared_id: options.preparedId ?? PREPARED_ID,
    kind: "order",
    owner: OWNER,
    account: ACCOUNT,
    expires_at: decoded.terms.expires_at,
    sign: { intent: { op: "typedData", typedData: clone(signing.typedData) }, expected_digest: signing.wrappedDigest, digest_form: "kernelWrappedOrderHash" },
    summary: { lines: [...rebuilt.lines], digest_tag: digestTag(signing.wrappedDigest), ...innerHashSummaryFields(decoded, rebuilt.inner_hash) },
    caps: { reserved_usd: decoded.terms.cap_usd, day_remaining_usd: "40" },
    capabilities: { T3b: "unknown" },
    warnings: [],
    decoded,
    quote: { price, shares, max_outlay_usd: decoded.terms.max_outlay_usd ?? "0", fee_bound_bps: feeBps, expires_at: decoded.terms.expires_at },
  };
  return finish(item, options.withoutDecoded);
}

// The XO login (ClobAuth), wrapped for the Kernel account or plain.
export function authItem(options: ItemOptions & { readonly wrapped?: boolean; readonly timestamp?: string } = {}): Obj {
  const wrapped = options.wrapped ?? true;
  const timestamp = options.timestamp ?? String(Math.floor(NOW_MS / 1000));
  const decoded: PreparedDecoded = buildDecodedAuth({ owner: OWNER, account: ACCOUNT, timestamp, wrapped, ttlS: options.ttlS ?? 90 });
  const rebuilt = rebuildDecoded(decoded);
  if (!rebuilt.ok) throw new Error("test setup: the login did not rebuild");
  const signed = wrapped ? clobAuthKernelDigest({ address: ACCOUNT, timestamp, nonce: 0n }) : hashClobAuth({ address: ACCOUNT, timestamp, nonce: 0n });
  return finish(
    {
      prepared_id: options.preparedId ?? PREPARED_ID,
      kind: "auth",
      owner: OWNER,
      account: ACCOUNT,
      expires_at: isoSecond(NOW_MS + (options.ttlS ?? 90) * 1000),
      sign: { intent: { op: "raw", rawSigningPayloadHex: signed }, expected_digest: signed, digest_form: "kernelWrappedClobAuth" },
      summary: { lines: [...rebuilt.lines], digest_tag: digestTag(signed), ...innerHashSummaryFields(decoded, rebuilt.inner_hash) },
      caps: { reserved_usd: "0", day_remaining_usd: "50" },
      capabilities: {},
      warnings: [],
      decoded,
    },
    options.withoutDecoded,
  );
}

// ---- inbox records and the daemon's wire shapes -------------------------------------------------------------------------

export interface RecordOptions {
  readonly state?: InboxState;
  readonly requestedBy?: string;
  readonly result?: Obj | null;
  readonly createdAtMs?: number;
}

// The daemon's record around a prepared item, validated against the frozen contract.
export function recordOf(prepared: Obj, options: RecordOptions = {}): InboxItem {
  const created = isoSecond(options.createdAtMs ?? NOW_MS - 5000);
  const raw = {
    prepared_id: prepared["prepared_id"],
    state: options.state ?? "prepared",
    requested_by: options.requestedBy ?? "agent:0a1b2c3d",
    created_at: created,
    updated_at: created,
    expires_at: prepared["expires_at"],
    prepared,
    result: options.result ?? null,
  };
  return inboxItemSchema.parse(raw);
}

// The route schemas the kit relies on, for tests that need to prove an item is contract-valid.
export const userOpResponseSchema = POST_ROUTES["/v1/userop/prepare"].response;
export const orderResponseSchema = POST_ROUTES["/v1/order/prepare"].response;
