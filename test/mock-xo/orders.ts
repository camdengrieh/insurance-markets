// The orderbook's order surface: POST /order, GET /orders, GET /orders/:id and the DELETE routes.
//
// Order intake checks, in this order (each failure is a stable text, the first one wins):
//   L2 (when l2.required_on_post = yes, or whenever L2 headers are sent)      401
//   envelope and field parsing                                                400
//   signatureType 3 only, signer == maker                                     400
//   amounts above zero, the price on the tick grid [1, 999], size a multiple of 1,000 micro-shares   400
//   nonce equal to the maker's on-chain nonce (the exchange stub says 0)      400
//   expiry against the MOCK clock; GTD needs one and order.gtd_min seconds of life   400
//   the token has a book                                                      400
//   signature: prefix (order.prefix), the account has code, the owner recovered from the Kernel-wrapped digest
//   in a form order.sig_forms accepts, and the REAL deployed Kernel answering ERC-1271 for the exact bytes   400
//   the maker is a registered account (the registry, registry.trigger)        403
//   then the engine: market active (422), size and notional floors (422), duplicate (400), balance and position
//   (422), post-only (400), taker delay on the mock clock, matching.
//
// Basis: docs/research/01 (c), 22 (a) to (c) and (h) for the rules; the exchange's own checks are the ones the
// stub replays (signer == maker, code, ERC-1271). The gateway's error texts are M, except the ones errors.ts
// marks as docs or recorded. Request and response shapes come from the docs and the OpenAPI examples (M): no
// order was ever posted to the live service.

import { encodeFunctionData, getAddress, isAddress, keccak256, parseAbi, toHex, type Address, type Hex } from "viem";

import { CTF_EXCHANGE, SIGNATURE_TYPE_XO_SMART_ACCOUNT } from "../../src/xo/chain/constants.js";
import { formatMicro, parseDecimalToMicro } from "../../src/xo/units.js";
import { decimalFromTicks } from "./catalog.js";
import { verifyL2 } from "./auth.js";
import type { MockEnv } from "./env.js";
import { orderbookErrors } from "./errors.js";
import type { PlaceInput } from "./engine.js";
import type { MockListener, MockReply, MockRequest } from "./listener.js";
import { isRegistered } from "./registry.js";
import { accountKey, type AccountKey } from "./state.js";
import { accountCode, accountOwner, isValidSignature1271, kernelWrappedDigest, orderDigest, parseWireSignature, signatureForm, type ParsedOrder } from "./verify.js";
import type { MockOrder, OrderType } from "./write-state.js";
import { failure, okJson, parseJson, xoHeader } from "./wire.js";

const EXCHANGE_NONCES_ABI = parseAbi(["function nonces(address user) view returns (uint128)"]);
const ORDER_TYPES: readonly OrderType[] = ["GTC", "GTD", "FOK", "FAK"];
const DECIMAL = /^(0|[1-9][0-9]{0,77})$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;

const bad = (text: string): MockReply => failure(400, `invalid order: ${text}`);

function decimalField(value: unknown): bigint | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  return typeof value === "string" && DECIMAL.test(value) ? BigInt(value) : undefined;
}

function hexField(value: unknown, bytes: number): Hex | undefined {
  return typeof value === "string" && new RegExp(`^0x[0-9a-fA-F]{${String(bytes * 2)}}$`).test(value) ? (value.toLowerCase() as Hex) : undefined;
}

function addressField(value: unknown): Address | undefined {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && isAddress(value, { strict: false }) ? getAddress(value) : undefined;
}

interface ParsedEnvelope {
  readonly order: ParsedOrder;
  readonly signature: string;
  readonly orderType: OrderType;
  readonly postOnly: boolean;
}

function parseEnvelope(body: string): ParsedEnvelope | MockReply {
  const parsed = parseJson(body);
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value)) return failure(400, "invalid request body: expected a JSON object");
  const envelope = parsed.value as Record<string, unknown>;
  const raw = envelope["order"];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return bad("order is required");
  const w = raw as Record<string, unknown>;
  const orderType = envelope["orderType"];
  if (typeof orderType !== "string" || !(ORDER_TYPES as readonly string[]).includes(orderType)) return failure(400, "invalid request body: orderType must be GTC, GTD, FOK or FAK");
  const postOnlyRaw = envelope["postOnly"];
  if (postOnlyRaw !== undefined && typeof postOnlyRaw !== "boolean") return failure(400, "invalid request body: postOnly must be a boolean");
  const salt = decimalField(w["salt"]);
  const tokenId = decimalField(w["tokenId"]);
  const makerAmount = decimalField(w["makerAmount"]);
  const takerAmount = decimalField(w["takerAmount"]);
  const expiration = decimalField(w["expiration"]);
  const nonce = decimalField(w["nonce"]);
  const maker = addressField(w["maker"]);
  const signer = addressField(w["signer"]);
  const beneficiary = addressField(w["beneficiary"]);
  const identifier = hexField(w["identifier"], 16);
  const metadata = hexField(w["metadata"], 32);
  const side = w["side"];
  const signatureType = w["signatureType"];
  const signature = w["signature"];
  if (salt === undefined) return bad("salt must be a decimal string");
  if (maker === undefined) return bad("maker must be an address");
  if (signer === undefined) return bad("signer must be an address");
  if (beneficiary === undefined) return bad("beneficiary must be an address");
  if (tokenId === undefined) return bad("tokenId must be a decimal string");
  if (makerAmount === undefined) return bad("makerAmount must be a decimal string");
  if (takerAmount === undefined) return bad("takerAmount must be a decimal string");
  if (expiration === undefined) return bad("expiration must be a decimal string");
  if (nonce === undefined || nonce >= 2n ** 128n) return bad("nonce must be a uint128");
  if (identifier === undefined) return bad("identifier must be 16 bytes of hex");
  if (metadata === undefined) return bad("metadata must be 32 bytes of hex");
  if (side !== 0 && side !== 1) return bad("side must be 0 (BUY) or 1 (SELL)");
  if (typeof signatureType !== "number" || !Number.isInteger(signatureType)) return bad("signatureType must be a number");
  if (typeof signature !== "string") return bad("signature is required");
  return {
    order: { salt, maker, signer, beneficiary, tokenId, makerAmount, takerAmount, expiration, nonce, identifier, metadata, side, signatureType },
    signature,
    orderType: orderType as OrderType,
    postOnly: postOnlyRaw === true,
  };
}

// The id form and key the cancel route accepts (cancel.body). All three are documented or implied somewhere
// and which one the live server takes is NOT ESTABLISHABLE WITHOUT XO (OR11).
const CANCEL_KEY = { "orderID-hash": "orderID", orderId: "orderId", "numeric-id": "orderID" } as const;

export function orderRow(order: MockOrder, market: { readonly yesTokenId: string } | undefined): Record<string, unknown> {
  return {
    id: order.id,
    order_hash: order.hash,
    status: order.status === "live" ? "LIVE" : order.status === "matched" ? "MATCHED" : order.status === "expired" ? "EXPIRED" : "CANCELED",
    maker_address: `0x${order.account}`,
    market: order.conditionId,
    asset_id: order.tokenId,
    outcome: market === undefined ? "" : market.yesTokenId === order.tokenId ? "Yes" : "No",
    side: order.side === 0 ? "BUY" : "SELL",
    price: decimalFromTicks(order.tick),
    original_size: formatMicro(order.sharesMicro),
    size_matched: formatMicro(order.fills.reduce((sum, fill) => sum + fill.sharesMicro, 0n)),
    order_type: order.orderType,
    expiration: String(order.expiration),
    created_at: Math.floor(order.createdMs / 1000),
    associate_trades: [],
  };
}

export function registerOrders(listener: MockListener, env: MockEnv): void {
  const { switches, clock, state, chains, engine, write } = env;

  async function exchangeNonce(maker: Address): Promise<bigint> {
    const answer = await chains.tryCall("xo", CTF_EXCHANGE, encodeFunctionData({ abi: EXCHANGE_NONCES_ABI, functionName: "nonces", args: [maker] }));
    return answer === null || answer.length < 66 ? 0n : BigInt(answer);
  }

  // The signature checks of the intake, as a reply on failure.
  async function checkSignature(parsed: ParsedEnvelope, hash: Hex): Promise<MockReply | undefined> {
    const wire = parseWireSignature(parsed.signature);
    if ("error" in wire) return failure(400, `invalid signature: ${wire.error}`);
    const prefixRule = switches.get("order.prefix");
    if (prefixRule !== "both" && wire.prefix !== prefixRule) return failure(400, `invalid signature: the ${wire.prefix} signature prefix is not accepted`);
    const maker = parsed.order.maker;
    if ((await accountCode(chains, maker)) === "0x") return failure(400, "invalid signature: EIP-1271: no contract code at the maker");
    const owner = await accountOwner(chains, maker);
    if (owner === null) return failure(400, "invalid signature: the maker has no registered owner");
    const form = await signatureForm(kernelWrappedDigest(hash, maker), wire.sig65, owner);
    if (form === null) return failure(400, "invalid signature: the signature does not recover to the owner of the maker account");
    const forms = switches.get("order.sig_forms");
    if (forms === "raw-only" && form !== "raw") return failure(400, "invalid signature: only the raw ECDSA form over the wrapped digest is accepted");
    if (forms === "eip191-only" && form !== "eip191") return failure(400, "invalid signature: only the EIP-191 form over the wrapped digest is accepted");
    // The exchange's own last step: the deployed Kernel must answer ERC-1271 for these exact bytes.
    if (!(await isValidSignature1271(chains, maker, hash, parsed.signature as Hex))) return failure(400, "invalid signature: the maker account rejected the signature (ERC-1271)");
    return undefined;
  }

  listener.override("POST", "/order", async (request) => {
    // L2 on POST is a switch: required, or optional but checked whenever it is sent.
    let l2Account: AccountKey | undefined;
    if (switches.get("l2.required_on_post") === "yes" || xoHeader(request, "api_key") !== undefined) {
      const l2 = verifyL2(env, request);
      if (!l2.ok) return l2.reply;
      l2Account = l2.value.account;
    }
    const parsed = parseEnvelope(request.body);
    if ("status" in parsed) return parsed;
    const { order, orderType } = parsed;
    if (order.signatureType !== SIGNATURE_TYPE_XO_SMART_ACCOUNT) return bad("signatureType 3 (XO smart account) is the only accepted value");
    if (order.signer !== order.maker) return bad("signer must equal maker for signatureType 3");
    if (order.makerAmount === 0n || order.takerAmount === 0n) return bad("amounts must be above zero");
    if (orderType === "GTD" && order.expiration === 0n) return bad("GTD orders need a non-zero expiration");

    // Grid. BUY: makerAmount is collateral, takerAmount is shares. SELL: the other way round.
    const shares = order.side === 0 ? order.takerAmount : order.makerAmount;
    const collateral = order.side === 0 ? order.makerAmount : order.takerAmount;
    if ((collateral * 1000n) % shares !== 0n) return orderbookErrors.invalidTick();
    const tick = collateral * 1000n / shares;
    if (tick < 1n || tick > 999n) return orderbookErrors.invalidTick();
    if (shares % 1000n !== 0n) return failure(400, "invalid size: shares must be a multiple of 0.001");

    if ((await exchangeNonce(order.maker)) !== order.nonce) return bad("nonce must equal the maker's on-chain nonce");

    const now = BigInt(clock.nowSeconds());
    if (order.expiration !== 0n && order.expiration < now) return bad("the order has already expired");
    if (orderType === "GTD" && order.expiration - now < BigInt(switches.get("order.gtd_min"))) {
      return bad(`GTD orders must expire at least ${switches.get("order.gtd_min")} seconds from now`);
    }

    const tokenId = order.tokenId.toString(10);
    const market = state.marketForToken(tokenId);
    if (market === undefined) return orderbookErrors.noBook();

    const hash = orderDigest(order);
    const rejected = await checkSignature(parsed, hash);
    if (rejected !== undefined) return rejected;

    const account = accountKey(order.maker);
    if (l2Account !== undefined && l2Account !== account) return failure(403, "the order's maker is not the account of this API key");
    if (!(await isRegistered(env, order.maker))) return failure(403, "maker is not a registered XO smart account");

    const payloadKey = switches.get("order.dup_key_includes_sig") === "yes" ? keccak256(toHex(`${hash}:${parsed.signature.toLowerCase()}`)) : hash;
    const input: PlaceInput = {
      account,
      market,
      tokenId,
      side: order.side as 0 | 1,
      tick: Number(tick),
      sharesMicro: shares,
      collateralMicro: collateral,
      orderType,
      postOnly: parsed.postOnly,
      expiration: Number(order.expiration),
      hash,
      payloadKey,
      signature: parsed.signature.toLowerCase(),
    };
    const minShares = parseDecimalToMicro(switches.get("order.min_size")) ?? 0n;
    const minNotional = parseDecimalToMicro(switches.get("order.min_notional")) ?? 0n;
    const outcome = await engine.place(input, { sizeMicro: minShares, notionalMicro: minNotional });
    if (outcome.kind === "rejected") return outcome.reply;
    if (outcome.kind === "aborted") return { status: 200, drop: true };
    return okJson({
      success: outcome.success,
      errorMsg: outcome.errorMsg,
      orderID: outcome.success ? hash : "",
      status: outcome.status,
      makingAmount: String(outcome.makingMicro),
      takingAmount: String(outcome.takingMicro),
    });
  });

  // ---- reads -------------------------------------------------------------------------------------------------------

  listener.override("GET", "/orders", (request) => {
    const l2 = verifyL2(env, request);
    if (!l2.ok) return l2.reply;
    const market = request.query.get("market");
    const asset = request.query.get("asset_id");
    const rows = engine
      .liveOrders(l2.value.account)
      .filter((order) => (market === null || order.conditionId === market.toLowerCase()) && (asset === null || order.tokenId === asset))
      .map((order) => orderRow(order, state.marketByCondition(order.conditionId)));
    const limit = Math.min(Math.max(Number(request.query.get("limit") ?? "100") || 100, 1), 500);
    const cursor = request.query.get("next_cursor");
    let offset = 0;
    if (cursor !== null && cursor !== "" && cursor !== "MA==") {
      // The cursor is the base64 of the next offset; "LTE=" (base64 of "-1") means the end.
      const decoded = Number(Buffer.from(cursor, "base64").toString("utf8"));
      if (!Number.isInteger(decoded) || decoded < 0) return rows.length === 0 ? okJson({ limit, count: 0, next_cursor: "LTE=", data: [] }) : failure(400, "invalid next_cursor");
      offset = decoded;
    }
    const page = rows.slice(offset, offset + limit);
    const next = offset + limit < rows.length ? Buffer.from(String(offset + limit)).toString("base64") : "LTE=";
    return okJson({ limit, count: page.length, next_cursor: next, data: page });
  });

  listener.override("GET", "/orders/:id", (request) => {
    const l2 = verifyL2(env, request);
    if (!l2.ok) return l2.reply;
    const id = request.params["id"] ?? "";
    const found = HASH.test(id) ? write.orders.get(id.toLowerCase()) : write.orderById(id);
    if (found === undefined || found.account !== l2.value.account) return failure(404, "order not found");
    return okJson(orderRow(found, state.marketByCondition(found.conditionId)));
  });

  // ---- cancels ---------------------------------------------------------------------------------------------------------

  type CancelResult = { readonly canceled: string[]; readonly notCanceled: Record<string, string> };

  // One id in the form cancel.body accepts. A value in the other form is "not found", which is harmless.
  function cancelOne(account: AccountKey, value: string, result: { canceled: string[]; notCanceled: Record<string, string> }): void {
    const mode = switches.get("cancel.body");
    const wantsHash = mode !== "numeric-id";
    const order = wantsHash ? (HASH.test(value) ? write.orders.get(value.toLowerCase()) : undefined) : DECIMAL.test(value) ? write.orderById(value) : undefined;
    if (order === undefined) {
      result.notCanceled[value] = "not found";
      return;
    }
    if (order.account !== account) result.notCanceled[value] = "not owner";
    else if (order.status === "matched") result.notCanceled[value] = "already filled";
    else if (order.status !== "live") result.notCanceled[value] = "not found";
    else {
      engine.cancel(order, "canceled");
      result.canceled.push(String(order.id));
    }
  }

  const empty = (): CancelResult => ({ canceled: [], notCanceled: {} });

  listener.override("DELETE", "/order", (request) => {
    const l2 = verifyL2(env, request);
    if (!l2.ok) return l2.reply;
    const parsed = parseJson(request.body);
    const key = CANCEL_KEY[switches.get("cancel.body")];
    const value = parsed.ok && typeof parsed.value === "object" && parsed.value !== null ? (parsed.value as Record<string, unknown>)[key] : undefined;
    if (typeof value !== "string" && typeof value !== "number") return failure(400, `invalid cancel request: expected {"${key}": <id>}`);
    const result = empty();
    cancelOne(l2.value.account, String(value), result);
    return okJson(result);
  });

  // The batch, market and global cancels: whether HMAC alone is enough is a switch (OR11, undocumented).
  const hmacOnly = (request: MockRequest): MockReply | { readonly account: AccountKey } => {
    const l2 = verifyL2(env, request);
    if (!l2.ok) return l2.reply;
    if (switches.get("cancel.batch_hmac_only") !== "yes") return failure(400, "signature and signatureType are required");
    return { account: l2.value.account };
  };

  listener.override("DELETE", "/orders", (request) => {
    const auth = hmacOnly(request);
    if ("status" in auth) return auth;
    const parsed = parseJson(request.body);
    const list = parsed.ok && Array.isArray(parsed.value) ? parsed.value : parsed.ok && typeof parsed.value === "object" && parsed.value !== null ? ((parsed.value as Record<string, unknown>)["orderIds"] ?? (parsed.value as Record<string, unknown>)["orderIDs"]) : undefined;
    if (!Array.isArray(list) || list.some((entry) => typeof entry !== "string" && typeof entry !== "number")) return failure(400, "invalid cancel request: expected a JSON array of order ids");
    const result = empty();
    for (const entry of list as (string | number)[]) cancelOne(auth.account, String(entry), result);
    return okJson(result);
  });

  listener.override("DELETE", "/cancel-all", (request) => {
    const auth = hmacOnly(request);
    if ("status" in auth) return auth;
    const result = empty();
    for (const order of engine.liveOrders(auth.account)) {
      engine.cancel(order, "canceled");
      result.canceled.push(String(order.id));
    }
    return okJson(result);
  });

  listener.override("DELETE", "/cancel-market-orders", (request) => {
    const auth = hmacOnly(request);
    if ("status" in auth) return auth;
    const parsed = parseJson(request.body);
    const body = parsed.ok && typeof parsed.value === "object" && parsed.value !== null ? (parsed.value as Record<string, unknown>) : {};
    const market = body["market"] ?? body["marketId"];
    const asset = body["asset_id"];
    if (market !== undefined && typeof market !== "string") return failure(400, "invalid cancel request: market must be a condition id");
    if (asset !== undefined && typeof asset !== "string") return failure(400, "invalid cancel request: asset_id must be a token id");
    if (market === undefined && asset === undefined) return failure(400, "invalid cancel request: market or asset_id is required");
    const result = empty();
    for (const order of engine.liveOrders(auth.account)) {
      if ((market !== undefined && order.conditionId !== (market as string).toLowerCase()) || (asset !== undefined && order.tokenId !== asset)) continue;
      engine.cancel(order, "canceled");
      result.canceled.push(String(order.id));
    }
    return okJson(result);
  });
}
