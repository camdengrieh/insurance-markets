import { POST_ROUTES, digestTag, type UserOpAction } from "../src/relay/contract.js";
import { ORDER_CAP_FEE_BPS, computeOrderAmounts } from "../src/xo/signing/amounts.js";
import { ZERO_ADDRESS, ZERO_BYTES16, ZERO_BYTES32 } from "../src/xo/signing/constants.js";
import type { XoOrder } from "../src/xo/signing/order.js";
import { prepareOrderSigning } from "../src/xo/signing/prepare.js";
import { buildDecodedOrder, buildDecodedUserOp, innerHashSummaryFields, rebuildDecoded } from "../src/xo/signing/rebuild.js";
import { enableTradingCalls, firstOpNonce, prepareUserOp, type Call } from "./fixtures/userop/api.js";
import { ACCOUNT, NOW, OWNER, isoSecond, type Obj } from "./tools-helpers.js";

// A Prepared user-operation item whose decoded block really rebuilds to its digest, tags and summary lines
// (the tool tests' other builders sign a made-up digest and carry no decoded block). Built with the repo's own
// user-operation code for the public Anvil account 0; nothing here is signed.

export interface VerifiedItemOptions {
  readonly ttlS?: number;
  // Applied to the plain object before it is parsed by the relay contract: lets a test break exactly one thing.
  readonly tamper?: (item: Obj) => void;
  // Leave the decoded block out (an older relay).
  readonly withoutDecoded?: boolean;
  readonly preparedId?: string;
}

export function verifiedDeployItem(options: VerifiedItemOptions = {}): Obj {
  const built = prepareUserOp({
    action: "deploy_enable_trading",
    owner: OWNER,
    calls: enableTradingCalls(),
    nonce: firstOpNonce(),
    deployed: false,
    sponsor: true,
  });
  const validUntil = isoSecond(NOW + (options.ttlS ?? 300) * 1000);
  const decoded = buildDecodedUserOp({ built, kind: "userop", action: "deploy_enable_trading", validUntil, titleSlot: null });
  const rebuilt = rebuildDecoded(decoded);
  if (!rebuilt.ok) throw new Error(`test setup: the decoded block did not rebuild (${rebuilt.field})`);
  const item: Obj = {
    prepared_id: options.preparedId ?? "00112233445566778899aabbccddeeff",
    kind: "userop",
    owner: built.owner,
    account: built.account,
    expires_at: validUntil,
    sign: built.sign,
    summary: { lines: [...rebuilt.lines], digest_tag: built.digestTag, ...innerHashSummaryFields(decoded, rebuilt.inner_hash) },
    caps: { reserved_usd: "0", day_remaining_usd: "50" },
    capabilities: { AD5: "unknown", UO7: "unknown" },
    warnings: [],
    ...(options.withoutDecoded === true ? {} : { decoded }),
    user_op_hash: built.userOpHash,
  };
  if (options.withoutDecoded === true) {
    // Without a decoded block the inner tag cannot be checked either; an older relay sent neither.
    const summary = item["summary"] as Obj;
    delete summary["inner_hash_tag"];
    delete summary["inner_hash_kind"];
  }
  options.tamper?.(item);
  return POST_ROUTES["/v1/userop/prepare"].response.parse(item) as Obj;
}

// ---- a verified user operation of any action ---------------------------------------------------------------------

export interface VerifiedUseropOptions {
  readonly action: UserOpAction;
  readonly calls: readonly Call[];
  readonly deployed: boolean;
  readonly sponsor?: boolean;
  readonly ttlS?: number;
  readonly preparedId?: string;
  // The clock the item's expiry is counted from (default NOW).
  readonly nowMs?: number;
}

// A Prepared user-operation item for an arbitrary (action, calls), built with the repo's own code, so that it
// verifies. Used to show that an item can be internally consistent and still not be what was asked for (SC-1).
export function verifiedUseropItem(options: VerifiedUseropOptions): Obj {
  const built = prepareUserOp({
    action: options.action,
    owner: OWNER,
    calls: [...options.calls],
    nonce: firstOpNonce(),
    deployed: options.deployed,
    sponsor: options.sponsor ?? true,
  });
  const validUntil = isoSecond((options.nowMs ?? NOW) + (options.ttlS ?? 300) * 1000);
  const decoded = buildDecodedUserOp({ built, kind: "userop", action: options.action, validUntil, titleSlot: null });
  const rebuilt = rebuildDecoded(decoded);
  if (!rebuilt.ok) throw new Error(`test setup: the decoded block did not rebuild (${rebuilt.field})`);
  return POST_ROUTES["/v1/userop/prepare"].response.parse({
    prepared_id: options.preparedId ?? "00112233445566778899aabbccddeeff",
    kind: "userop",
    owner: built.owner,
    account: built.account,
    expires_at: validUntil,
    sign: built.sign,
    summary: { lines: [...rebuilt.lines], digest_tag: built.digestTag, ...innerHashSummaryFields(decoded, rebuilt.inner_hash) },
    caps: { reserved_usd: "0", day_remaining_usd: "50" },
    capabilities: { AD5: "unknown", UO7: "unknown" },
    warnings: [],
    decoded,
    user_op_hash: built.userOpHash,
  }) as Obj;
}

// ---- a verified order ---------------------------------------------------------------------------------------------

// A real XO market (test/fixtures/xo): its condition id and its two outcome token ids, which are the CTF position
// ids of that condition, so an order for one of them can carry the condition and still pass the binding check.
export const REAL_CONDITION_ID = "0xb63d8f77fc1437a804d5fdeedb4c00dc49e1d7c7738f6410c36f1f44e6cfd654";
export const REAL_YES_TOKEN = "68215442288791572296498952759094916177229244750752613990844701608971303593663";
export const REAL_NO_TOKEN = "6530318981470987186894988035298961845748217855361759807272408942024241321361";

export interface VerifiedOrderOptions {
  readonly tokenId?: string;
  readonly side?: "BUY" | "SELL";
  readonly price?: string;
  readonly shares?: string;
  readonly tif?: "GTD" | "FOK" | "FAK";
  readonly postOnly?: boolean;
  readonly ttlS?: number;
  // Seconds from NOW to the signed expiry (default: the lifetime).
  readonly expiresInS?: number;
  readonly conditionId?: string | null;
  readonly feeBps?: number;
  readonly preparedId?: string;
}

export function verifiedOrderItem(options: VerifiedOrderOptions = {}): Obj {
  const side = options.side ?? "BUY";
  const price = options.price ?? "0.5";
  const shares = options.shares ?? "10";
  const feeBps = options.feeBps ?? ORDER_CAP_FEE_BPS;
  const ttlS = options.ttlS ?? 300;
  const sideCode = side === "BUY" ? 0 : 1;
  const amounts = computeOrderAmounts({ side: sideCode, price, shares });
  const nowSeconds = BigInt(Math.floor(NOW / 1000));
  const order: XoOrder = {
    salt: 987_654_321_012_345n,
    maker: ACCOUNT,
    signer: ACCOUNT,
    beneficiary: ZERO_ADDRESS,
    tokenId: BigInt(options.tokenId ?? REAL_YES_TOKEN),
    makerAmount: amounts.makerAmount,
    takerAmount: amounts.takerAmount,
    expiration: nowSeconds + BigInt(options.expiresInS ?? ttlS),
    nonce: 0n,
    identifier: ZERO_BYTES16,
    metadata: ZERO_BYTES32,
    side: sideCode,
    signatureType: 3,
  };
  const signing = prepareOrderSigning(order, { expiry: { nowSeconds, maxTtlSeconds: 86_400 * 400 } });
  const decoded = buildDecodedOrder({
    owner: OWNER,
    order,
    feeBps,
    tif: options.tif ?? "GTD",
    postOnly: options.postOnly ?? false,
    purpose: "trade",
    ttlS,
    conditionId: options.conditionId === undefined ? REAL_CONDITION_ID : options.conditionId,
  });
  const rebuilt = rebuildDecoded(decoded);
  if (!rebuilt.ok) throw new Error(`test setup: the decoded order did not rebuild (${rebuilt.field})`);
  if (decoded.kind !== "order") throw new Error("test setup: not an order");
  return POST_ROUTES["/v1/order/prepare"].response.parse({
    prepared_id: options.preparedId ?? "cd".repeat(16),
    kind: "order",
    owner: OWNER,
    account: ACCOUNT,
    expires_at: decoded.terms.expires_at,
    sign: { intent: { op: "typedData", typedData: JSON.parse(JSON.stringify(signing.typedData)) }, expected_digest: signing.wrappedDigest, digest_form: "kernelWrappedOrderHash" },
    summary: { lines: [...rebuilt.lines], digest_tag: digestTag(signing.wrappedDigest), ...innerHashSummaryFields(decoded, rebuilt.inner_hash) },
    caps: { reserved_usd: decoded.terms.cap_usd, day_remaining_usd: "40" },
    capabilities: {},
    warnings: [],
    decoded,
    quote: { price, shares, max_outlay_usd: decoded.terms.max_outlay_usd ?? "0", fee_bound_bps: feeBps, expires_at: decoded.terms.expires_at },
  }) as Obj;
}
