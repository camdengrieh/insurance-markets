// Building and rebuilding the decoded block of a CLOB venue item (Polymarket, Limitless), the counterpart of
// src/xo/signing/rebuild.ts for the two CLOB venues. The maker is the owner EOA (signature type 0) or, on Polymarket,
// the owner's Deposit Wallet (signature type 3), which is re-derived from the owner here and never taken on trust. The relay builds the block from the order it just made; the
// checker (the plugin, the daemon's inbox, the Signature Card) rebuilds the digest, the typed data, the terms and
// every summary line from the block alone with this same code and compares. Nothing here reads a clock, the network
// or a key.
//
// PORTABLE: no node:* import. The page bundles this file through src/xo/signing/rebuild.ts.

import type { Address, Hex } from "viem";

import {
  AUTH_PREPARED_TTL_S,
  DECODED_VERSION,
  SAFETY_NOTICES,
  digestTag,
  type DecodedClobAuth,
  type DecodedClobOrder,
  type RebuildOutcome,
  type TypedData,
} from "../relay/contract.js";
import { decToAtomic } from "../../sdk/money/decimal.js";
import { formatAtomic } from "../guardrails/amount.js";
import { parseOwner, AccountError } from "../xo/account/derive.js";
import { SIDE_BUY, ZERO_ADDRESS } from "../xo/signing/constants.js";
import { SigningError } from "../xo/signing/errors.js";
import { isoSecond } from "../xo/signing/lines.js";
import type { OrderCapAmount } from "../xo/signing/amounts.js";
import { clobCapAmount, decodeClobAmounts, formatMicro, parseTickMicro, type ClobAmounts } from "./amounts.js";
import { hashLimitlessOrder, limitlessOrderSignTypedData, type LimitlessOrder } from "./limitless/order.js";
import { hashPolymarketClobAuth, polymarketClobAuthSignTypedData, POLYMARKET_CLOB_AUTH_MESSAGE } from "./polymarket/clobauth.js";
import { depositWalletProxyOf } from "./polymarket/deposit-wallet.js";
import { hashPolymarketOrder, polymarketOrderSignTypedData, polymarketSigningDigest, type PolymarketOrder } from "./polymarket/order.js";
import {
  CLOB_CHAIN_IDS,
  CLOB_COLLATERAL_DECIMALS,
  POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET,
  LIMITLESS_ORDER_DOMAIN_NAME,
  LIMITLESS_ORDER_DOMAIN_VERSION,
  POLYMARKET_ORDER_DOMAIN_NAME,
  isPinnedLimitlessExchange,
  polymarketBookOf,
  venueDisplayName,
  type ClobTif,
  type ClobVenue,
} from "./venues.js";

const usd = (atomic: bigint): string => formatAtomic(atomic, CLOB_COLLATERAL_DECIMALS);
const lower = (value: string): string => value.toLowerCase();
const fail = (field: string, reason: string): RebuildOutcome => ({ ok: false, field, reason });
const plainJson = (value: unknown): TypedData => JSON.parse(JSON.stringify(value)) as TypedData;

// ---- the terms -------------------------------------------------------------------------------------------------------------

function termsOf(amounts: ClobAmounts, cap: OrderCapAmount, expiresAt: string | null): DecodedClobOrder["terms"] {
  return {
    side: amounts.side === SIDE_BUY ? "BUY" : "SELL",
    price: formatMicro(amounts.priceMicro),
    shares: formatMicro(amounts.sharesMicro),
    principal_usd: usd(amounts.collateralMicro),
    fee_bound_bps: cap.feeBps,
    cap_usd: usd(cap.capAtomic),
    cap_basis: cap.basis,
    max_outlay_usd: cap.maxOutlayAtomic === null ? null : usd(cap.maxOutlayAtomic),
    min_proceeds_usd: cap.minProceedsAtomic === null ? null : usd(cap.minProceedsAtomic),
    expires_at: expiresAt,
  };
}

// ---- building (the relay's side) ---------------------------------------------------------------------------------------

export interface BuildDecodedClobOrderInput {
  readonly owner: Address;
  readonly amounts: ClobAmounts;
  readonly feeBps: number;
  readonly tif: ClobTif;
  readonly postOnly: boolean;
  readonly ttlS: number | null;
  readonly marketId: string;
  readonly tick: string;
  readonly minSize: string;
  readonly order:
    | { readonly venue: "polymarket"; readonly order: PolymarketOrder; readonly expiration: bigint; readonly domain: { readonly version: string; readonly verifyingContract: Address } }
    | { readonly venue: "limitless"; readonly order: LimitlessOrder; readonly exchange: Address };
}

export function buildDecodedClobOrder(input: BuildDecodedClobOrderInput): DecodedClobOrder {
  const cap = clobCapAmount(input.amounts, input.feeBps);
  const venue: ClobVenue = input.order.venue;
  const chainId = CLOB_CHAIN_IDS[venue];
  const base: Omit<DecodedClobOrder, "order" | "domain" | "terms"> = {
    v: DECODED_VERSION,
    kind: "clob_order",
    venue,
    chain_id: chainId,
    action: "place_order" as const,
    owner: input.owner,
    // The maker: the owner itself, or (Polymarket, type 3) the owner's Deposit Wallet the order names.
    account: input.order.venue === "polymarket" ? input.order.order.maker : input.owner,
    params: { tif: input.tif, post_only: input.postOnly, ttl_s: input.ttlS, market_id: input.marketId, tick: input.tick, min_size: input.minSize },
  };
  if (input.order.venue === "polymarket") {
    const o = input.order.order;
    const expiresAt = input.order.expiration === 0n ? null : isoSecond(Number(input.order.expiration) * 1000);
    return {
      ...base,
      order: {
        venue: "polymarket",
        salt: o.salt.toString(),
        maker: o.maker,
        signer: o.signer,
        token_id: o.tokenId.toString(),
        maker_amount: o.makerAmount.toString(),
        taker_amount: o.takerAmount.toString(),
        side: o.side,
        signature_type: o.signatureType === POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET ? 3 : 0,
        timestamp_ms: o.timestamp.toString(),
        metadata: o.metadata,
        builder: o.builder,
        expiration: input.order.expiration.toString(),
      },
      domain: { name: POLYMARKET_ORDER_DOMAIN_NAME, version: input.order.domain.version, chain_id: 137, verifying_contract: input.order.domain.verifyingContract },
      terms: termsOf(input.amounts, cap, expiresAt),
    };
  }
  const o = input.order.order;
  return {
    ...base,
    order: {
      venue: "limitless",
      salt: o.salt.toString(),
      maker: o.maker,
      signer: o.signer,
      taker: o.taker,
      token_id: o.tokenId.toString(),
      maker_amount: o.makerAmount.toString(),
      taker_amount: o.takerAmount.toString(),
      expiration: o.expiration.toString(),
      nonce: o.nonce.toString(),
      fee_rate_bps: o.feeRateBps.toString(),
      side: o.side,
      signature_type: 0,
    },
    domain: { name: LIMITLESS_ORDER_DOMAIN_NAME, version: LIMITLESS_ORDER_DOMAIN_VERSION, chain_id: 8453, verifying_contract: input.order.exchange },
    terms: termsOf(input.amounts, cap, null),
  };
}

// ---- the summary lines (a pure function of the block) -------------------------------------------------------------------

// `digest` is what the owner signs; `orderHash` the venue's order id (the same value for an EOA order, the order inside
// the TypedDataSign wrapper for a Deposit Wallet order).
export function clobOrderSummaryLines(d: DecodedClobOrder, digest: Hex, orderHash: Hex = digest): string[] {
  const name = venueDisplayName(d.venue);
  const t = d.terms;
  const depositWallet = d.order.venue === "polymarket" && d.order.signature_type === 3;
  const cash =
    t.max_outlay_usd === null
      ? [
          `No cash leaves the wallet. Worst-case net proceeds after the ${t.fee_bound_bps} bps fee ceiling (a policy ceiling, not the venue's quote): ${t.min_proceeds_usd ?? "0"} USD.`,
          `A SELL counts the larger of its expected proceeds (${t.principal_usd} USD) and its shares at the 1.00 USD face value (${t.shares} USD).`,
        ]
      : [`Worst-case cash out including the ${t.fee_bound_bps} bps fee ceiling (a policy ceiling, not the venue's quote): ${t.max_outlay_usd} USD (principal ${t.principal_usd} USD).`];
  const life =
    d.params.tif === "FOK" || d.params.tif === "FAK"
      ? `Type ${d.params.tif}: fills at once or not at all. No expiry is signed.`
      : t.expires_at === null
        ? "No expiry is signed: the order rests until it is cancelled through the venue's API. A cancel is not on chain."
        : `Expires ${t.expires_at} (${d.params.ttl_s ?? 0} s). The expiry is on the wire, not in the signed order: the venue enforces it, the chain does not.`;
  return [
    `${name} order: ${t.side} ${t.shares} shares of outcome token ${d.order.token_id} at ${t.price} per share, type ${d.params.tif}${d.params.post_only ? ", post-only" : ""}.`,
    ...cash,
    `Counts ${t.cap_usd} USD against the per-order and daily caps.`,
    life,
    ...(depositWallet
      ? [
          `Maker and signer: your Polymarket Deposit Wallet ${d.account} (signature type 3, checked through its ERC-1271), owned by your wallet ${d.owner}, which signs.`,
          `Chain ${d.chain_id}, exchange ${d.domain.verifying_contract} (${d.domain.name} version ${d.domain.version}).`,
          `Market ${d.params.market_id}, tick ${d.params.tick}, minimum size ${d.params.min_size}.`,
          `Order hash ${orderHash} (the venue's order id).`,
          `You sign the Deposit Wallet's TypedDataSign wrapper of that order (ERC-7739, wallet domain DepositWallet version 1): digest ${digest}.`,
        ]
      : [
          `Maker and signer: your wallet ${d.account} (EOA, signature type 0). Chain ${d.chain_id}, exchange ${d.domain.verifying_contract} (${d.domain.name} version ${d.domain.version}).`,
          `Market ${d.params.market_id}, tick ${d.params.tick}, minimum size ${d.params.min_size}.`,
          `Order hash ${digest}.`,
        ]),
    `Compare digest_tag ${digestTag(digest)} with what PayBox shows.`,
  ];
}

// ---- rebuilding (the checker's side) ---------------------------------------------------------------------------------------

function parseUint(value: string, field: string): bigint {
  if (!/^(0|[1-9][0-9]{0,77})$/.test(value)) throw new SigningError("invalid_integer", `${field} must be a canonical decimal string`);
  return BigInt(value);
}

export function rebuildClobOrder(d: DecodedClobOrder): RebuildOutcome {
  let owner: Address;
  try {
    owner = parseOwner(d.owner);
  } catch (error) {
    if (error instanceof AccountError) return fail("decoded.owner", error.message);
    throw error;
  }
  if (d.order.venue !== d.venue) return fail("decoded.order.venue", "the order fields are for another venue");
  if (d.order.venue === "polymarket" && d.order.signature_type === 3) {
    // A Deposit Wallet order: the account must be one of the two addresses derived from the owner, and the order's
    // maker and signer that account. Whether it is deployed and still owned by the owner is the relay's chain read.
    if (depositWalletProxyOf(owner, d.account) === null) return fail("decoded.account", "the account is not a Polymarket Deposit Wallet derived from the owner");
    if (lower(d.order.maker) !== lower(d.account) || lower(d.order.signer) !== lower(d.account)) return fail("decoded.order.maker", "a Deposit Wallet order's maker and signer must both be the wallet");
  } else {
    if (lower(d.account) !== lower(owner)) return fail("decoded.account", "the maker of an EOA venue order is the owner itself");
    if (lower(d.order.maker) !== lower(owner) || lower(d.order.signer) !== lower(owner)) return fail("decoded.order.maker", "the order's maker or signer is not the owner");
  }
  if (d.chain_id !== CLOB_CHAIN_IDS[d.venue]) return fail("decoded.chain_id", "the chain is not the venue's");

  // The amounts and the terms derived from them.
  let amounts: ClobAmounts;
  let cap: OrderCapAmount;
  try {
    const side = d.order.side;
    const makerAmount = parseUint(d.order.maker_amount, "maker_amount");
    const takerAmount = parseUint(d.order.taker_amount, "taker_amount");
    const decoded = decodeClobAmounts({ side, makerAmount, takerAmount });
    amounts = { side, ...decoded, makerAmount, takerAmount };
    const tick = parseTickMicro(d.params.tick);
    if (decoded.priceMicro % tick !== 0n) return fail("decoded.params.tick", "the implied price is not on the stated tick");
    cap = clobCapAmount(amounts, d.terms.fee_bound_bps);
  } catch (error) {
    if (error instanceof SigningError) return fail("decoded.order.maker_amount", error.message);
    throw error;
  }
  let minSharesMicro: bigint;
  try {
    minSharesMicro = sharesMicroOf(d.params.min_size);
  } catch (error) {
    if (error instanceof SigningError) return fail("decoded.params.min_size", error.message);
    throw error;
  }
  if (amounts.sharesMicro < minSharesMicro) return fail("decoded.params.min_size", "the order is below the minimum size it states");

  // The venue's order struct, hashed under its pinned domain.
  let digest: Hex;
  let orderHash: Hex;
  let typed: TypedData;
  let expiresAt: string | null;
  try {
    if (d.order.venue === "polymarket") {
      const book = polymarketBookOf(d.domain.version, d.domain.verifying_contract);
      if (book === undefined || d.domain.name !== POLYMARKET_ORDER_DOMAIN_NAME || d.domain.chain_id !== 137) return fail("decoded.domain", "the domain is not one of Polymarket's pinned exchanges");
      const order: PolymarketOrder = {
        salt: parseUint(d.order.salt, "salt"),
        maker: d.order.maker as Address,
        signer: d.order.signer as Address,
        tokenId: parseUint(d.order.token_id, "token_id"),
        makerAmount: amounts.makerAmount,
        takerAmount: amounts.takerAmount,
        side: d.order.side,
        signatureType: d.order.signature_type,
        timestamp: parseUint(d.order.timestamp_ms, "timestamp_ms"),
        metadata: d.order.metadata as Hex,
        builder: d.order.builder as Hex,
      };
      orderHash = hashPolymarketOrder(order, book);
      digest = polymarketSigningDigest(order, book);
      typed = plainJson(polymarketOrderSignTypedData(order, book));
      const expiration = parseUint(d.order.expiration, "expiration");
      expiresAt = expiration === 0n ? null : isoSecond(Number(expiration) * 1000);
      if (d.params.tif === "GTD" && expiration === 0n) return fail("decoded.order.expiration", "a GTD order carries an expiry");
      if (d.params.tif !== "GTD" && expiration !== 0n) return fail("decoded.order.expiration", "only a GTD order carries an expiry");
    } else {
      if (d.domain.name !== LIMITLESS_ORDER_DOMAIN_NAME || d.domain.version !== LIMITLESS_ORDER_DOMAIN_VERSION || d.domain.chain_id !== 8453) return fail("decoded.domain", "the domain is not Limitless's");
      if (!isPinnedLimitlessExchange(d.domain.verifying_contract)) return fail("decoded.domain.verifying_contract", "the exchange is not one this build is pinned to");
      if (lower(d.order.taker) !== ZERO_ADDRESS) return fail("decoded.order.taker", "an open order names no taker");
      if (d.params.tif === "GTD") return fail("decoded.params.tif", "Limitless orders carry no expiry, so GTD is not a type there");
      const order: LimitlessOrder = {
        salt: parseUint(d.order.salt, "salt"),
        maker: d.order.maker as Address,
        signer: d.order.signer as Address,
        taker: d.order.taker as Address,
        tokenId: parseUint(d.order.token_id, "token_id"),
        makerAmount: amounts.makerAmount,
        takerAmount: amounts.takerAmount,
        expiration: parseUint(d.order.expiration, "expiration"),
        nonce: parseUint(d.order.nonce, "nonce"),
        feeRateBps: parseUint(d.order.fee_rate_bps, "fee_rate_bps"),
        side: d.order.side,
        signatureType: 0,
      };
      digest = hashLimitlessOrder(order, d.domain.verifying_contract as Address);
      orderHash = digest;
      typed = plainJson(limitlessOrderSignTypedData(order, d.domain.verifying_contract as Address));
      expiresAt = null;
    }
  } catch (error) {
    if (error instanceof SigningError) return fail("decoded.order", error.message);
    throw error;
  }

  const expected = termsOf(amounts, cap, expiresAt);
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    if (expected[key] !== d.terms[key]) return fail(`decoded.terms.${key}`, "a derived term differs from what the signed fields produce");
  }
  if (d.params.post_only && d.params.tif !== "GTC" && d.params.tif !== "GTD") return fail("decoded.params.post_only", "post-only applies to a resting order only");
  if (d.params.ttl_s !== null && d.params.tif !== "GTD") return fail("decoded.params.ttl_s", "only a GTD order has a lifetime");

  return {
    ok: true,
    digest,
    // The digest the owner signs (for a Deposit Wallet order, the TypedDataSign digest); the venue's order id is in the
    // summary lines. The contract's inner-hash rule for non-Kernel typed data is the signed digest itself.
    inner_hash: digest,
    lines: clobOrderSummaryLines(d, digest, orderHash),
    covered: ["order", "domain", "terms.side", "terms.price", "terms.shares", "terms.principal_usd"],
    unbound: ["params", "terms.fee_bound_bps", "terms.cap_usd", ...(d.venue === "polymarket" ? ["terms.expires_at", "order.expiration"] : [])],
    typed_data: typed,
  };
}

// ---- the login (Polymarket only: Limitless mints its tokens in its own UI) ----------------------------------------------------

export interface BuildDecodedClobAuthInput {
  readonly owner: Address;
  readonly timestamp: string;
  readonly ttlS?: number;
}

export function buildDecodedClobAuth(input: BuildDecodedClobAuthInput): DecodedClobAuth {
  return {
    v: DECODED_VERSION,
    kind: "clob_auth",
    venue: "polymarket",
    chain_id: 137,
    action: "connect",
    owner: input.owner,
    account: input.owner,
    clob_auth: { address: input.owner, timestamp: input.timestamp, nonce: "0", message: POLYMARKET_CLOB_AUTH_MESSAGE },
    ttl_s: input.ttlS ?? AUTH_PREPARED_TTL_S,
  };
}

export function clobAuthSummaryLines(d: DecodedClobAuth): string[] {
  return [
    "Log in to Polymarket's order book: sign a ClobAuth attestation with your wallet. This is not a payment and moves no funds.",
    `Wallet ${d.account} (the maker of your Polymarket orders), chain 137.`,
    "The relay uses it once to derive or create your Polymarket API credentials and keeps them encrypted. It never shows them to anyone.",
    `Sign within ${d.ttl_s} seconds.`,
    SAFETY_NOTICES.digestTag,
  ];
}

export function rebuildClobAuth(d: DecodedClobAuth): RebuildOutcome {
  let owner: Address;
  try {
    owner = parseOwner(d.owner);
  } catch (error) {
    if (error instanceof AccountError) return fail("decoded.owner", error.message);
    throw error;
  }
  if (lower(d.account) !== lower(owner)) return fail("decoded.account", "the login is for the owner itself");
  if (lower(d.clob_auth.address) !== lower(owner)) return fail("decoded.clob_auth.address", "the login names an address other than the owner");
  if (d.clob_auth.message !== POLYMARKET_CLOB_AUTH_MESSAGE) return fail("decoded.clob_auth.message", "the attestation text is not the fixed one");
  if (d.clob_auth.nonce !== "0") return fail("decoded.clob_auth.nonce", "the login nonce is not 0");
  let digest: Hex;
  let typed: TypedData;
  try {
    digest = hashPolymarketClobAuth({ address: owner, timestamp: d.clob_auth.timestamp, nonce: 0n });
    typed = plainJson(polymarketClobAuthSignTypedData({ address: owner, timestamp: d.clob_auth.timestamp, nonce: 0n }));
  } catch (error) {
    if (error instanceof SigningError) return fail("decoded.clob_auth.timestamp", error.message);
    throw error;
  }
  return { ok: true, digest, inner_hash: digest, lines: clobAuthSummaryLines(d), covered: ["clob_auth"], unbound: ["ttl_s"], typed_data: typed };
}

// Shares in micro units from the canonical "min_size" text, for callers that need the number. Anything that is not
// a plain decimal with at most 6 places is refused (sdk/money/decimal.ts), never truncated.
export function sharesMicroOf(text: string): bigint {
  const parsed = decToAtomic(text, 6);
  if (!parsed.ok) throw new SigningError("invalid_size", "the minimum size must be a plain decimal with at most 6 places");
  return parsed.value;
}
