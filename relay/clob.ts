import { randomBytes } from "node:crypto";

import { getAddress, type Address, type Hex } from "viem";

import { decFromNumber, decToAtomic } from "../sdk/money/decimal.js";
import { formatAtomic } from "../src/guardrails/amount.js";
import { checkLimitlessAmounts, clobCapAmount, computeClobAmounts, formatMicro, MICRO, parseTickMicro, type ClobAmounts } from "../src/clob/amounts.js";
import { buildDecodedClobAuth, buildDecodedClobOrder, sharesMicroOf } from "../src/clob/decoded.js";
import { buildLimitlessHeaders, type LimitlessToken } from "../sdk/node/trade/clob/limitless/hmac.js";
import { hashLimitlessOrder, limitlessOrderSignTypedData, limitlessOrderToWire, type LimitlessOrder } from "../src/clob/limitless/order.js";
import { buildPolymarketL1Headers, hashPolymarketClobAuth, polymarketClobAuthSignTypedData } from "../src/clob/polymarket/clobauth.js";
import { buildPolymarketL2Headers, type PolymarketCredentials } from "../sdk/node/trade/clob/polymarket/l2.js";
import {
  DEPOSIT_WALLET_DOMAIN_CALL,
  DEPOSIT_WALLET_OWNER_CALL,
  decodeDepositWalletOwner,
  depositWalletCandidates,
  depositWalletDomainMatches,
  depositWalletProxyOf,
  depositWalletRuntimeCode,
  type DepositWalletProxy,
} from "../src/clob/polymarket/deposit-wallet.js";
import { hashPolymarketOrder, polymarketOrderSignTypedData, polymarketOrderToWire, polymarketSigningDigest, wrapPolymarketDepositWalletSignature, type PolymarketOrder } from "../src/clob/polymarket/order.js";
import {
  CLOB_CAP_FEE_BPS,
  CLOB_CHAIN_IDS,
  CLOB_COLLATERAL_DECIMALS,
  LIMITLESS_PRICE_TICK,
  LIMITLESS_GEOBLOCK_NOTE,
  LIMITLESS_TIFS,
  POLYMARKET_EXCHANGES,
  POLYMARKET_GEOBLOCK_NOTE,
  POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET,
  POLYMARKET_SIGNATURE_TYPE_EOA,
  POLYMARKET_TIFS,
  isPinnedLimitlessExchange,
  polymarketTickRule,
  venueDisplayName,
  type ClobTif,
  type ClobVenue,
  type PolymarketBook,
} from "../src/clob/venues.js";
import { AUTH_PREPARED_TTL_S, MAX_ORDER_TTL_S, PREPARED_TTL_S, RELAY_PENDING_AFTER_MS, SAFETY_NOTICES, checkPreparedSign, digestTag, type PreparedSign, type TypedData } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import type { WriteFlagName } from "../src/relay/flags.js";
import { AccountError, parseOwner } from "../src/xo/account/derive.js";
import { ChainReadError, RpcReader } from "../src/xo/chain/reads.js";
import { ZERO_ADDRESS, ZERO_BYTES32 } from "../src/xo/signing/constants.js";
import { SigningError } from "../src/xo/signing/errors.js";
import { rebuildDecoded } from "../src/xo/signing/rebuild.js";
import { verifyDigestSignature } from "../src/xo/userop/verify.js";
import { isoSecondOf } from "./audit.js";
import { guardSubmit, guardWrite } from "./capabilities.js";
import { needService } from "./config.js";
import type { PreparedRecord } from "./prepared.js";
import type { DurableStore, Json } from "./store.js";
import type { RelayContext, RelayServices, RouteTable } from "./types.js";
import { sanitizeUpstreamText, toRelayError, UpstreamError, type AllowedHost, type Upstream, type UpstreamResponse } from "./upstream.js";
import { jsonRpcTransportFor } from "./userops.js";

// The two EIP-712 CLOB venues besides XO: Polymarket (Polygon, pUSD) and Limitless (Base, USDC). Four routes:
//
//   POST /v1/clob/order/prepare   builds the venue's own Order struct, after reading the market live (Polymarket: the
//                                 CLOB book for the tick, the minimum size and a reference price, and Gamma for the
//                                 book kind; Limitless: the market for its exchange, tokens and fee module, and its YES
//                                 book), applies the same cap rule as XO with the policy fee ceiling, RESERVES the cap
//                                 in the ledger, and returns the typed data to sign plus a decoded block the card
//                                 rebuilds from. The maker is the owner EOA (signature type 0) on Limitless. On
//                                 Polymarket the relay READS which account the owner trades from (readPolymarketMaker):
//                                 the owner's Deposit Wallet (signature type 3; maker = signer = the wallet) when one is
//                                 deployed at an address derived from the owner, with exactly Polymarket's proxy code,
//                                 owner() equal to the owner and the expected EIP-712 domain; the owner EOA (type 0)
//                                 when neither derived address holds code; a refusal when the read fails or anything
//                                 differs. For type 3 the owner signs the ERC-7739 TypedDataSign wrapper of the order.
//   POST /v1/clob/order/submit    takes prepared_id and signature only; recomputes the digest from the stored fields,
//                                 requires the signature to recover to the owner OVER THE DIGEST ITSELF (an EOA signs
//                                 the EIP-712 hash; a personal_sign wrapping would be refused by the venue, so it is
//                                 refused here), for a Deposit Wallet order reads the wallet again (code, owner,
//                                 domain) and wraps the 65-byte signature for the wallet's ERC-1271 check, writes the
//                                 `sending` marker, and POSTs once with the venue's stored credential. Nothing is
//                                 retried; an unknown outcome is `ambiguous`.
//   POST /v1/clob/auth/prepare    Polymarket only: the ClobAuth login the owner signs so the relay can derive or create
//                                 the L2 credential (apiKey, secret, passphrase) and keep it in the vault. Limitless mints
//                                 its scoped tokens in its own UI, so for it this route answers not_implemented.
//   POST /v1/clob/auth/submit     verifies the login signature, claims the item, then GET /auth/derive-api-key and, if
//                                 that answers nothing usable, POST /auth/api-key, once each. The triplet goes into
//                                 the vault and only a key tag ever leaves.
//
// Every write is behind its venue's flag (ENABLE_CLOB_POLYMARKET, ENABLE_CLOB_LIMITLESS, OFF by default). Nothing here
// has run against a real venue: every behaviour below was exercised against the scripted fakes in
// test/relay-clob-*.test.ts only. Reconciling an ambiguous send by looking the order up at the venue is NOT built;
// such an item stays ambiguous with its reservation held until the operator looks.
//
// Geoblocks: neither venue's eligibility check is made from here (the Polymarket check lives on the site host, which
// this relay may not reach; Limitless publishes a jurisdiction list). The relay never masks or routes around either;
// a 401, 403 or 451 from a venue is the upstream's business (it pauses the host) and is reported as upstream_rejected.

// ---- constants ---------------------------------------------------------------------------------------------------------------

export const POLYMARKET_CLOB = "https://clob.polymarket.com";
export const POLYMARKET_GAMMA = "https://gamma-api.polymarket.com";
export const LIMITLESS_API = "https://api.limitless.exchange";
// The Polygon public RPC the read adapters use (sdk/venues/origins.ts, service rpc_polygon). Read-only: the RpcReader
// sends eth_getCode and eth_call only, for the Deposit Wallet check.
export const POLYGON_RPC_URL = "https://polygon-bor-rpc.publicnode.com/";

export const CLOB_UPSTREAM_HOSTS: readonly AllowedHost[] = Object.freeze([
  { host: "clob.polymarket.com", methods: ["GET", "POST", "DELETE"] },
  { host: "gamma-api.polymarket.com", methods: ["GET"] },
  { host: "api.limitless.exchange", methods: ["GET", "POST"] },
  { host: "polygon-bor-rpc.publicnode.com", methods: ["POST"], keyless: true },
]);

// The vault names the credentials are stored under (account = the owner EOA, lower case), the same way XO's triplet is.
export const POLYMARKET_SECRET_NAME = "clob_polymarket_l2";
export const LIMITLESS_SECRET_NAME = "clob_limitless_token";

export const CLOB_FLAG: Readonly<Record<ClobVenue, WriteFlagName>> = Object.freeze({ polymarket: "ENABLE_CLOB_POLYMARKET", limitless: "ENABLE_CLOB_LIMITLESS" });

// Capability facts (ids in relay/capabilities.ts CAPABILITY_ID): PM1 a Polymarket login accepted; PM2 a first Polymarket
// order accepted and cancelled; LM1 a Limitless token accepted on a signed read; LM2 a first Limitless order accepted
// and cancelled; PB3 / PB4 PayBox signs typed data for chain 137 / 8453.
export const FACT_PM_LOGIN = "PM1";
export const FACT_PM_ORDER = "PM2";
export const FACT_LM_TOKEN = "LM1";
export const FACT_LM_ORDER = "LM2";
export const FACT_PAYBOX_TYPED_137 = "PB3";
export const FACT_PAYBOX_TYPED_8453 = "PB4";
const FACT_IDS: Readonly<Record<ClobVenue, readonly string[]>> = Object.freeze({ polymarket: [FACT_PM_LOGIN, FACT_PM_ORDER, FACT_PAYBOX_TYPED_137], limitless: [FACT_LM_TOKEN, FACT_LM_ORDER, FACT_PAYBOX_TYPED_8453] });

const ORDERS_NS = "clob_orders";
const RESERVATIONS_NS = "clob_order_resv";
// place-orders.md: a GTD "expires one minute early" and "the expiration must be at least three minutes ahead".
export const POLYMARKET_GTD_MIN_TTL_S = 240;
export const DEFAULT_GTD_TTL_S = 300;
export const SUBMIT_PENDING_AFTER_MS = RELAY_PENDING_AFTER_MS - 500;
export const ORDER_POST_TIMEOUT_MS = 10_000;
const READ_MAX_BYTES = 256 * 1024;
const MAX_PLAUSIBLE_CLOCK_SKEW_S = 120;
// The Polymarket size grid (place-orders.md: two size decimals on every tick) and the one applied to Limitless.
const SIZE_DECIMALS = 2;

const usd = (atomic: bigint): string => formatAtomic(atomic, CLOB_COLLATERAL_DECIMALS);
const lower = (value: string): string => value.toLowerCase();
const HEX32 = /^0x[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function signingFailure(error: unknown): RelayError {
  if (error instanceof SigningError) return new RelayError("invalid_request", error.message, { reason: error.code });
  return new RelayError("internal", "The relay failed while building the order. Nothing was sent.");
}

function asRelayError(error: unknown): unknown {
  return error instanceof UpstreamError ? toRelayError(error) : error;
}

function parsedOwnerOf(body: { readonly owner: string }): Address {
  try {
    return parseOwner(body.owner);
  } catch (error) {
    if (error instanceof AccountError) throw new RelayError("invalid_request", "That owner address cannot place venue orders.", { reason: error.code });
    throw error;
  }
}

// A supplied account must be the maker the relay resolved (invariant 1): it is compared, never used as input.
function checkSuppliedAccount(supplied: string | undefined, maker: Address): void {
  if (supplied !== undefined && lower(supplied) !== lower(maker)) {
    throw new RelayError("account_mismatch", "The supplied account is not the maker the relay resolved for this owner (the owner wallet itself, or on Polymarket its Deposit Wallet read from Polygon).");
  }
}

// The maker is the owner itself (the login, and every Limitless order).
function ownerOf(body: { readonly owner: string; readonly account?: string | undefined }): Address {
  const owner = parsedOwnerOf(body);
  checkSuppliedAccount(body.account, owner);
  return owner;
}

// ---- which Polymarket account the owner trades from (signature type 0 or 3) ---------------------------------------------

export type PolymarketMaker =
  | { readonly kind: "eoa"; readonly maker: Address; readonly signatureType: typeof POLYMARKET_SIGNATURE_TYPE_EOA }
  | { readonly kind: "deposit_wallet"; readonly maker: Address; readonly signatureType: typeof POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET; readonly proxy: DepositWalletProxy };

function polygonReader(context: RelayContext, rpcUrl: string): RpcReader {
  return new RpcReader({ transport: jsonRpcTransportFor(needService(context, "upstream"), "polygon_rpc"), url: rpcUrl });
}

function accountUnreadable(error: unknown): RelayError {
  if (error instanceof RelayError) return error;
  const read = error instanceof ChainReadError ? error.code : "unexpected";
  return new RelayError("precondition_failed", "The relay could not read the owner's Polymarket account on Polygon, so it cannot tell which wallet is the maker. Nothing was prepared or sent.", { reason: "account_unreadable", read });
}

// owner() and eip712Domain() on a wallet whose code was already matched. Throws a RelayError with a precise reason.
async function confirmDepositWalletState(rpc: RpcReader, owner: Address, wallet: Address): Promise<void> {
  let ownerData: Hex;
  let domainData: Hex;
  try {
    [ownerData, domainData] = await Promise.all([rpc.call(wallet, DEPOSIT_WALLET_OWNER_CALL), rpc.call(wallet, DEPOSIT_WALLET_DOMAIN_CALL)]);
  } catch (error) {
    if (error instanceof ChainReadError && error.code === "reverted") {
      throw new RelayError("precondition_failed", "The Polymarket Deposit Wallet derived from this owner did not answer owner() or eip712Domain(), so no order is signed for it.", { reason: "deposit_wallet_unreadable", wallet });
    }
    throw accountUnreadable(error);
  }
  const current = decodeDepositWalletOwner(ownerData);
  if (current === null || lower(current) !== lower(owner)) {
    throw new RelayError("precondition_failed", "The Polymarket Deposit Wallet derived from this owner is now owned by another address (its owner() differs), so this owner cannot sign for it.", { reason: "deposit_wallet_owner_mismatch", wallet });
  }
  if (!depositWalletDomainMatches(domainData, wallet, CLOB_CHAIN_IDS.polymarket)) {
    throw new RelayError("precondition_failed", "The Polymarket Deposit Wallet's EIP-712 domain is not DepositWallet version 1 on chain 137 at its own address, so the signature this relay builds would not verify. Nothing was prepared or sent.", { reason: "deposit_wallet_domain", wallet });
  }
}

// Reads both addresses the owner's Deposit Wallet can have. None holds code: the owner EOA is the maker (type 0). One
// holds exactly the proxy runtime derived for this owner and answers owner() == owner with the expected domain: that
// wallet is the maker (type 3). Anything else is refused with a reason; a failed read is never taken as "no wallet".
export async function readPolymarketMaker(context: RelayContext, owner: Address, rpcUrl: string = POLYGON_RPC_URL): Promise<PolymarketMaker> {
  const rpc = polygonReader(context, rpcUrl);
  const candidates = depositWalletCandidates(owner);
  let codes: Hex[];
  try {
    codes = await Promise.all(candidates.map((candidate) => rpc.getCode(candidate.address)));
  } catch (error) {
    throw accountUnreadable(error);
  }
  const deployed = candidates.filter((_, index) => codes[index] !== "0x");
  for (const candidate of deployed) {
    if (codes[candidates.indexOf(candidate)] !== candidate.runtimeCode.toLowerCase()) {
      throw new RelayError("precondition_failed", "An address derived as this owner's Polymarket Deposit Wallet holds code that is not Polymarket's Deposit Wallet proxy for this owner, so no order is signed for it.", { reason: "deposit_wallet_code_unexpected", wallet: candidate.address });
    }
  }
  if (deployed.length === 0) return { kind: "eoa", maker: owner, signatureType: POLYMARKET_SIGNATURE_TYPE_EOA };
  if (deployed.length > 1) {
    throw new RelayError("precondition_failed", "Both addresses derived as this owner's Polymarket Deposit Wallet (the beacon and the UUPS form) hold a wallet; which one the venue account uses is not decided here, so nothing was prepared.", { reason: "deposit_wallet_ambiguous" });
  }
  const wallet = deployed[0] as (typeof candidates)[number];
  await confirmDepositWalletState(rpc, owner, wallet.address);
  return { kind: "deposit_wallet", maker: wallet.address, signatureType: POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET, proxy: wallet.proxy };
}

// The submit-time check of a stored Deposit Wallet order: the wallet still has exactly its proxy code (the exchange
// requires maker.code.length > 0), is still owned by the owner and still has the expected domain.
async function reconfirmDepositWallet(context: RelayContext, owner: Address, wallet: Address, rpcUrl: string): Promise<void> {
  const proxy = depositWalletProxyOf(owner, wallet);
  if (proxy === null) throw new RelayError("internal", "A stored Deposit Wallet order names a wallet that is not derived from its owner.");
  const rpc = polygonReader(context, rpcUrl);
  let code: Hex;
  try {
    code = await rpc.getCode(wallet);
  } catch (error) {
    throw accountUnreadable(error);
  }
  if (code === "0x") throw new RelayError("precondition_failed", "The Polymarket Deposit Wallet has no code on Polygon now, so the exchange would refuse the order. Nothing was sent.", { reason: "deposit_wallet_not_deployed", wallet });
  if (code !== depositWalletRuntimeCode(owner, proxy).toLowerCase()) throw new RelayError("precondition_failed", "The Polymarket Deposit Wallet's code is not the proxy it had at prepare. Nothing was sent.", { reason: "deposit_wallet_code_unexpected", wallet });
  await confirmDepositWalletState(rpc, owner, wallet);
}

// ---- stored shapes ------------------------------------------------------------------------------------------------------------

type StoredOrder = {
  readonly v: 1;
  readonly venue: ClobVenue;
  // The venue's order id (the order's EIP-712 hash). `digest` below is what the owner signs: the same value for an EOA
  // order, the TypedDataSign digest for a Polymarket Deposit Wallet order.
  readonly hash: string;
  readonly owner: string;
  // The maker and signer: the owner itself (type 0) or the owner's Deposit Wallet (type 3). Records written before the
  // Deposit Wallet path existed carry neither field and read as type 0 with the owner as maker.
  readonly maker: string;
  readonly signatureType: 0 | 3;
  readonly tokenId: string;
  readonly marketId: string;
  readonly salt: string;
  readonly side: 0 | 1;
  readonly makerAmount: string;
  readonly takerAmount: string;
  readonly tif: ClobTif;
  readonly postOnly: boolean;
  readonly ttlS: number | null;
  // Polymarket: the wire expiration (seconds, "0" for none), the signed timestamp (ms) and the book; Limitless: the
  // exchange and the fee rate.
  readonly expiration: string;
  readonly timestampMs: string | null;
  readonly book: PolymarketBook | null;
  readonly exchange: string | null;
  readonly feeRateBps: string | null;
  readonly tick: string;
  readonly minSize: string;
  readonly feeBps: number;
  readonly capAtomic: string;
  readonly reservationId: string;
  readonly clockOffsetS: number;
  readonly digest: string;
  readonly preparedId: string | null;
  readonly createdAtMs: number;
  readonly final: { readonly state: "accepted" | "rejected" | "ambiguous"; readonly atMs: number; readonly detail: string } | null;
};

function parseStored(value: unknown): StoredOrder {
  const bad = (): never => {
    throw new RelayError("internal", "A stored venue order is unreadable, so nothing was sent.");
  };
  if (!isRecord(value) || value["v"] !== 1) return bad();
  const text = (key: string, pattern: RegExp): string => {
    const found = value[key];
    return typeof found === "string" && pattern.test(found) ? found : bad();
  };
  const optionalText = (key: string, pattern: RegExp): string | null => {
    const found = value[key];
    if (found === null || found === undefined) return null;
    return typeof found === "string" && pattern.test(found) ? found : bad();
  };
  const venue = value["venue"];
  const side = value["side"];
  const tif = value["tif"];
  if ((venue !== "polymarket" && venue !== "limitless") || (side !== 0 && side !== 1) || typeof tif !== "string" || !["GTC", "GTD", "FOK", "FAK"].includes(tif)) return bad();
  const book = value["book"];
  if (book !== null && book !== "v2" && book !== "ctf" && book !== "neg_risk") return bad();
  const signatureType = value["signatureType"] === undefined ? 0 : value["signatureType"];
  if (signatureType !== 0 && signatureType !== 3) return bad();
  if (signatureType === 3 && venue !== "polymarket") return bad();
  const ttl = value["ttlS"];
  const final = value["final"];
  return {
    v: 1,
    venue,
    hash: text("hash", HEX32),
    owner: text("owner", /^0x[0-9a-fA-F]{40}$/),
    maker: optionalText("maker", /^0x[0-9a-fA-F]{40}$/) ?? text("owner", /^0x[0-9a-fA-F]{40}$/),
    signatureType,
    tokenId: text("tokenId", /^(0|[1-9][0-9]{0,77})$/),
    marketId: text("marketId", /^(?:0x[0-9a-fA-F]{64}|[a-z0-9][a-z0-9_-]{0,127})$/),
    salt: text("salt", /^[1-9][0-9]{0,77}$/),
    side,
    makerAmount: text("makerAmount", /^[1-9][0-9]{0,77}$/),
    takerAmount: text("takerAmount", /^[1-9][0-9]{0,77}$/),
    tif: tif as ClobTif,
    postOnly: value["postOnly"] === true,
    ttlS: ttl === null ? null : typeof ttl === "number" && Number.isSafeInteger(ttl) && ttl > 0 ? ttl : bad(),
    expiration: text("expiration", /^(0|[1-9][0-9]{0,12})$/),
    timestampMs: optionalText("timestampMs", /^[1-9][0-9]{0,15}$/),
    book: book as PolymarketBook | null,
    exchange: optionalText("exchange", /^0x[0-9a-fA-F]{40}$/),
    feeRateBps: optionalText("feeRateBps", /^(0|[1-9][0-9]{0,4})$/),
    tick: text("tick", /^0\.[0-9]{1,6}$/),
    minSize: text("minSize", /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/),
    feeBps: typeof value["feeBps"] === "number" ? (value["feeBps"] as number) : bad(),
    capAtomic: text("capAtomic", /^(0|[1-9][0-9]{0,77})$/),
    reservationId: text("reservationId", /^[A-Za-z0-9_-]{8,64}$/),
    clockOffsetS: typeof value["clockOffsetS"] === "number" && Number.isSafeInteger(value["clockOffsetS"]) ? (value["clockOffsetS"] as number) : bad(),
    digest: text("digest", HEX32),
    preparedId: typeof value["preparedId"] === "string" ? (value["preparedId"] as string) : null,
    createdAtMs: typeof value["createdAtMs"] === "number" ? (value["createdAtMs"] as number) : 0,
    final: isRecord(final) && typeof final["state"] === "string" && typeof final["atMs"] === "number" && typeof final["detail"] === "string" ? { state: final["state"] as "accepted", atMs: final["atMs"], detail: final["detail"] } : null,
  };
}

function recordKey(venue: ClobVenue, hash: string): string {
  return `${venue}:${lower(hash)}`;
}

function loadStored(state: DurableStore, venue: ClobVenue, hash: string): StoredOrder | undefined {
  const stored = state.get<Json>(ORDERS_NS, recordKey(venue, hash));
  if (stored === undefined) return undefined;
  return parseStored(stored);
}

async function patchStored(state: DurableStore, venue: ClobVenue, hash: string, change: (record: StoredOrder) => StoredOrder): Promise<void> {
  await state.transact<void>((reader) => {
    const current = reader.get<Json>(ORDERS_NS, recordKey(venue, hash));
    if (!isRecord(current)) return { ops: [], result: undefined };
    const next = change(parseStored(current));
    return { ops: [{ ns: ORDERS_NS, key: recordKey(venue, hash), value: next as unknown as Json }], result: undefined };
  });
}

// The order structs, rebuilt from the stored fields (never from the caller).
function polymarketOrderOf(stored: StoredOrder): { readonly order: PolymarketOrder; readonly book: PolymarketBook } {
  if (stored.book === null || stored.timestampMs === null) throw new RelayError("internal", "A stored Polymarket order lacks its book or timestamp.");
  const owner = getAddress(stored.owner);
  const maker = getAddress(stored.maker);
  // The maker is the owner (type 0) or one of the owner's two derived Deposit Wallet addresses (type 3), nothing else.
  if (stored.signatureType === 0 ? maker !== owner : depositWalletProxyOf(owner, maker) === null) throw new RelayError("internal", "A stored Polymarket order's maker is not the owner or the owner's Deposit Wallet.");
  return {
    book: stored.book,
    order: {
      salt: BigInt(stored.salt),
      maker,
      signer: maker,
      tokenId: BigInt(stored.tokenId),
      makerAmount: BigInt(stored.makerAmount),
      takerAmount: BigInt(stored.takerAmount),
      side: stored.side,
      signatureType: stored.signatureType,
      timestamp: BigInt(stored.timestampMs),
      metadata: ZERO_BYTES32,
      builder: ZERO_BYTES32,
    },
  };
}

function limitlessOrderOf(stored: StoredOrder): { readonly order: LimitlessOrder; readonly exchange: Address } {
  if (stored.exchange === null || stored.feeRateBps === null) throw new RelayError("internal", "A stored Limitless order lacks its exchange or fee rate.");
  const maker = getAddress(stored.owner);
  return {
    exchange: getAddress(stored.exchange),
    order: {
      salt: BigInt(stored.salt),
      maker,
      signer: maker,
      taker: ZERO_ADDRESS,
      tokenId: BigInt(stored.tokenId),
      makerAmount: BigInt(stored.makerAmount),
      takerAmount: BigInt(stored.takerAmount),
      expiration: 0n,
      nonce: 0n,
      feeRateBps: BigInt(stored.feeRateBps),
      side: stored.side,
      signatureType: 0,
    },
  };
}

// What the owner signs: the order hash for an EOA order, the TypedDataSign digest for a Deposit Wallet order.
function digestOf(stored: StoredOrder): Hex {
  if (stored.venue === "polymarket") {
    const { order, book } = polymarketOrderOf(stored);
    return polymarketSigningDigest(order, book);
  }
  const { order, exchange } = limitlessOrderOf(stored);
  return hashLimitlessOrder(order, exchange);
}

// ---- credentials -----------------------------------------------------------------------------------------------------------

function parseTriplet(text: string): PolymarketCredentials | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) return undefined;
    const apiKey = value["apiKey"];
    const secret = value["secret"];
    const passphrase = value["passphrase"];
    const token = /^[\x21-\x7e]{1,512}$/;
    if (typeof apiKey !== "string" || typeof secret !== "string" || typeof passphrase !== "string") return undefined;
    return token.test(apiKey) && token.test(passphrase) && /^[A-Za-z0-9+/_=-]+$/.test(secret) ? { apiKey, secret, passphrase } : undefined;
  } catch {
    return undefined;
  }
}

function parseToken(text: string): LimitlessToken | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) return undefined;
    const tokenId = value["tokenId"];
    const secret = value["secret"];
    if (typeof tokenId !== "string" || typeof secret !== "string") return undefined;
    return /^[\x21-\x7e]{1,512}$/.test(tokenId) && /^[A-Za-z0-9+/_=-]+$/.test(secret) ? { tokenId, secret } : undefined;
  } catch {
    return undefined;
  }
}

// A hash prefix that identifies a stored credential without being any part of it.
export function clobKeyTagOf(venue: ClobVenue, id: string): string {
  // SHA-256 is not imported here on purpose: the vault's own tag convention (relay/credentials.ts keyTagOf) is a hash
  // prefix too; this one prefixes the venue so the two tag spaces never collide.
  let hash = 0;
  for (const char of `${venue}:${id}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `${venue.slice(0, 2)}${hash.toString(16).padStart(8, "0")}`;
}

async function hasCredentials(context: RelayContext, venue: ClobVenue, owner: string): Promise<boolean> {
  const secrets = context.services.secrets;
  if (secrets === undefined) return false;
  try {
    return await secrets.has(lower(owner), venue === "polymarket" ? POLYMARKET_SECRET_NAME : LIMITLESS_SECRET_NAME);
  } catch {
    return false;
  }
}

// ---- reading the venues --------------------------------------------------------------------------------------------------------

async function readUpstream(upstream: Upstream, request: { readonly method: "GET" | "POST"; readonly url: string; readonly purpose: string; readonly headers?: Record<string, string>; readonly body?: string; readonly signal?: AbortSignal; readonly timeoutMs?: number }): Promise<UpstreamResponse> {
  try {
    return await upstream.request({ ...request, maxBytes: READ_MAX_BYTES });
  } catch (error) {
    throw asRelayError(error);
  }
}

function jsonOf(upstream: Upstream, response: UpstreamResponse): unknown {
  try {
    return response.ok ? upstream.json(response) : undefined;
  } catch {
    return undefined;
  }
}

const clockCache = new WeakMap<object, { readonly offsetS: number; readonly atMs: number }>();

// GET /time on Polymarket answers seconds (the same shape as XO's). The offset is remembered a minute.
async function polymarketClock(context: RelayContext, fresh: boolean): Promise<{ readonly nowS: number; readonly offsetS: number }> {
  const upstream = needService(context, "upstream");
  const localS = Math.floor(context.now() / 1000);
  const cached = clockCache.get(context.services);
  if (!fresh && cached !== undefined && context.now() - cached.atMs < 60_000) return { nowS: localS + cached.offsetS, offsetS: cached.offsetS };
  const response = await readUpstream(upstream, { method: "GET", url: `${POLYMARKET_CLOB}/time`, purpose: "clob_time", signal: context.signal });
  const match = response.ok ? /^\s*"?(\d{9,12})"?\s*$/.exec(response.body) : null;
  if (match === null) throw new RelayError("upstream_rejected", "The venue did not give a usable time, so nothing was prepared.", { host: response.host, status: response.status });
  const offsetS = Number(match[1]) - localS;
  if (fresh && Math.abs(offsetS) > MAX_PLAUSIBLE_CLOCK_SKEW_S) {
    throw new RelayError("upstream_rejected", "The venue's clock differs from this relay's by more than two minutes, so no order was prepared.", { reason: "clock_implausible" });
  }
  clockCache.set(context.services, { offsetS, atMs: context.now() });
  return { nowS: Number(match[1]), offsetS };
}

type Levels = { readonly bestBidMicro: bigint | undefined; readonly bestAskMicro: bigint | undefined };

// A book price (decimal string, or JSON number taken at its exact text) in micro units, strictly inside (0, 1).
function priceMicroOf(value: unknown): bigint | undefined {
  const parsed = decToAtomic(typeof value === "number" ? decFromNumber(value) : value, 6);
  if (!parsed.ok) return undefined;
  return parsed.value > 0n && parsed.value < MICRO ? parsed.value : undefined;
}

function levelsOf(bids: unknown, asks: unknown): Levels {
  const pick = (levels: unknown, best: "max" | "min"): bigint | undefined => {
    if (!Array.isArray(levels)) return undefined;
    let found: bigint | undefined;
    for (const level of levels) {
      if (!isRecord(level)) continue;
      const micro = priceMicroOf(level["price"]);
      if (micro === undefined) continue;
      if (found === undefined || (best === "max" ? micro > found : micro < found)) found = micro;
    }
    return found;
  };
  return { bestBidMicro: pick(bids, "max"), bestAskMicro: pick(asks, "min") };
}

interface PolymarketMarketRead {
  readonly tick: string;
  readonly minSize: string;
  readonly book: PolymarketBook;
  readonly levels: Levels;
}

async function readPolymarketMarket(context: RelayContext, conditionId: string, tokenId: string): Promise<PolymarketMarketRead> {
  const upstream = needService(context, "upstream");
  const bookResponse = await readUpstream(upstream, { method: "GET", url: `${POLYMARKET_CLOB}/book?token_id=${encodeURIComponent(tokenId)}`, purpose: "clob_book", signal: context.signal });
  if (bookResponse.status === 404 || bookResponse.status === 400) throw new RelayError("invalid_request", "The venue has no order book for that token.", { reason: "unknown_token" });
  const book = jsonOf(upstream, bookResponse);
  if (!isRecord(book)) throw new RelayError("upstream_rejected", "The venue's book was unreadable, so nothing was prepared.", { host: bookResponse.host, status: bookResponse.status });
  const market = book["market"];
  if (typeof market !== "string" || lower(market) !== lower(conditionId)) throw new RelayError("invalid_request", "The token's book belongs to another market than the one named.", { reason: "market_token_mismatch" });
  const tick = typeof book["tick_size"] === "string" ? book["tick_size"] : typeof book["tick_size"] === "number" ? String(book["tick_size"]) : undefined;
  if (tick === undefined || polymarketTickRule(tick) === undefined) throw new RelayError("precondition_failed", "The market's tick is not one this relay knows, so nothing was prepared.", { reason: "tick_size" });
  const minRaw = book["min_order_size"];
  const minSize = typeof minRaw === "string" && /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/.test(minRaw) ? minRaw : typeof minRaw === "number" && Number.isFinite(minRaw) && minRaw >= 0 ? String(minRaw) : "0";
  const negRisk = book["neg_risk"] === true;

  // Which exchange the market trades on: Gamma's `version` ("v2" is the Protocol V2 book on ExchangeV3; anything else is
  // a CTF book, neg-risk or not). The keyset filter by condition id is the same fallback the read adapter uses.
  const gammaResponse = await readUpstream(upstream, { method: "GET", url: `${POLYMARKET_GAMMA}/markets/keyset?condition_ids=${encodeURIComponent(lower(conditionId))}&limit=1`, purpose: "gamma_market", signal: context.signal });
  const gamma = jsonOf(upstream, gammaResponse);
  const rows = isRecord(gamma) && Array.isArray(gamma["markets"]) ? (gamma["markets"] as unknown[]) : undefined;
  const row = rows?.find((candidate) => isRecord(candidate) && typeof candidate["conditionId"] === "string" && lower(candidate["conditionId"]) === lower(conditionId));
  if (!isRecord(row)) throw new RelayError("upstream_rejected", "The venue's market record could not be read, so the exchange to sign for is unknown and nothing was prepared.", { host: gammaResponse.host, status: gammaResponse.status, reason: "market_unreadable" });
  const version = row["version"];
  const bookKind: PolymarketBook = version === "v2" ? "v2" : negRisk || row["negRisk"] === true ? "neg_risk" : "ctf";
  return { tick, minSize, book: bookKind, levels: levelsOf(book["bids"], book["asks"]) };
}

interface LimitlessMarketRead {
  readonly exchange: Address;
  readonly feeRateBps: bigint;
  readonly minSize: string;
  readonly yesToken: string;
  readonly noToken: string;
  readonly levels: Levels;
}

async function readLimitlessMarket(context: RelayContext, slug: string, tokenId: string): Promise<LimitlessMarketRead> {
  const upstream = needService(context, "upstream");
  const response = await readUpstream(upstream, { method: "GET", url: `${LIMITLESS_API}/markets/${encodeURIComponent(slug)}`, purpose: "limitless_market", signal: context.signal });
  if (response.status === 404) throw new RelayError("invalid_request", "The venue has no market with that slug.", { reason: "unknown_market" });
  const market = jsonOf(upstream, response);
  if (!isRecord(market)) throw new RelayError("upstream_rejected", "The venue's market record was unreadable, so nothing was prepared.", { host: response.host, status: response.status });
  if (market["tradeType"] !== "clob") throw new RelayError("precondition_failed", "This market is not an order book (CLOB) market.", { reason: "not_clob" });
  const tokens = market["tokens"];
  const yes = isRecord(tokens) && typeof tokens["yes"] === "string" ? tokens["yes"] : undefined;
  const no = isRecord(tokens) && typeof tokens["no"] === "string" ? tokens["no"] : undefined;
  if (yes === undefined || no === undefined || (tokenId !== yes && tokenId !== no)) throw new RelayError("invalid_request", "The token is not one of this market's two outcome tokens.", { reason: "market_token_mismatch" });
  const venue = market["venue"];
  const exchange = isRecord(venue) && typeof venue["exchange"] === "string" ? venue["exchange"] : undefined;
  if (exchange === undefined || !/^0x[0-9a-fA-F]{40}$/.test(exchange)) throw new RelayError("upstream_rejected", "The market names no exchange contract, so nothing was prepared.", { reason: "no_exchange" });
  if (!isPinnedLimitlessExchange(exchange)) throw new RelayError("precondition_failed", "The market's exchange is not one this build is pinned to, so no order is signed for it.", { reason: "exchange_not_pinned" });
  // eip712-signing: feeRateBps is 0 on a COLLATERAL fee-module venue; elsewhere it is the owner's effectiveFeeRateBps,
  // which this relay does not read (it would need the profile route). Fail closed rather than guess.
  const feeModule = isRecord(venue) ? venue["feeModuleType"] : undefined;
  if (feeModule !== "COLLATERAL") throw new RelayError("precondition_failed", "The market's fee module is not the COLLATERAL one, so the signed fee rate is not known here. Nothing was prepared.", { reason: "fee_rate_unknown" });
  const minRaw = market["minSize"];
  const minSize = typeof minRaw === "string" && /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/.test(minRaw) ? minRaw : typeof minRaw === "number" && Number.isFinite(minRaw) && minRaw >= 0 ? String(minRaw) : "0";

  const bookResponse = await readUpstream(upstream, { method: "GET", url: `${LIMITLESS_API}/markets/${encodeURIComponent(slug)}/orderbook`, purpose: "limitless_book", signal: context.signal });
  const book = jsonOf(upstream, bookResponse);
  const levels = isRecord(book) ? levelsOf(book["bids"], book["asks"]) : { bestBidMicro: undefined, bestAskMicro: undefined };
  return { exchange: getAddress(exchange), feeRateBps: 0n, minSize, yesToken: yes, noToken: no, levels };
}

// The Limitless book is the YES side; the NO side is its complement with the sides swapped. Levels there carry sizes
// in raw 6-decimal units and prices as plain decimals (docs/research/09 section 2.3).
function complementLevels(levels: Levels): Levels {
  return {
    bestBidMicro: levels.bestAskMicro === undefined ? undefined : MICRO - levels.bestAskMicro,
    bestAskMicro: levels.bestBidMicro === undefined ? undefined : MICRO - levels.bestBidMicro,
  };
}

// The same band rule as src/guardrails/limits.ts checkPriceBand, in micro units: a BUY may not pay more than the band
// above the best ask, a SELL may not give more than the band below the best bid. One band tick is 0.001.
function checkBand(side: 0 | 1, priceMicro: bigint, levels: Levels, bandTicks: number, postOnly: boolean): void {
  const reference = side === 0 ? levels.bestAskMicro : levels.bestBidMicro;
  if (reference === undefined) {
    if (!postOnly) throw new RelayError("precondition_failed", "The book has no price to check this order against, so a taker order is refused.", { reason: "no_reference_price" });
    return;
  }
  const band = BigInt(bandTicks) * 1_000n;
  if (side === 0 && priceMicro > reference + band) throw new RelayError("invalid_request", "The BUY price is further above the best ask than the price band allows.", { reason: "price_band" });
  if (side === 1 && priceMicro + band < reference) throw new RelayError("invalid_request", "The SELL price is further below the best bid than the price band allows.", { reason: "price_band" });
}

// ---- the routes -----------------------------------------------------------------------------------------------------------------

export interface ClobRouteDeps {
  readonly random?: (bytes: number) => Buffer;
  readonly pendingAfterMs?: number;
  readonly postTimeoutMs?: number;
  // The Polygon JSON-RPC the Deposit Wallet check reads (default POLYGON_RPC_URL). Its host must be on the upstream
  // allowlist.
  readonly polygonRpcUrl?: string;
}

export interface ClobRoutes {
  readonly routes: RouteTable;
  idle(): Promise<void>;
  // Gives back the reservation of a venue order that is provably not resting: one the venue refused, or one whose
  // prepared item lapsed unsent. An accepted or ambiguous order keeps its reservation until the operator reconciles
  // it (no venue lookup is built). Runs on the relay's upkeep round.
  sweep(context: RelayContext): Promise<{ readonly released: number; readonly unknown: number }>;
}

function nonZeroSalt(random: (bytes: number) => Buffer): bigint {
  for (;;) {
    const value = BigInt(`0x${random(6).toString("hex")}`);
    if (value > 0n) return value;
  }
}

export function createClobRoutes(deps: ClobRouteDeps = {}): ClobRoutes {
  const random = deps.random ?? ((bytes: number): Buffer => randomBytes(bytes));
  const pendingAfterMs = deps.pendingAfterMs ?? SUBMIT_PENDING_AFTER_MS;
  const postTimeoutMs = deps.postTimeoutMs ?? ORDER_POST_TIMEOUT_MS;
  const polygonRpcUrl = deps.polygonRpcUrl ?? POLYGON_RPC_URL;
  const background = new Set<Promise<void>>();

  function track(work: Promise<unknown>): void {
    const tracked = work.then(
      () => undefined,
      () => undefined,
    );
    const done = tracked.finally(() => background.delete(done));
    background.add(done);
  }

  async function audit(context: RelayContext, event: Parameters<NonNullable<RelayServices["audit"]>["write"]>[0]): Promise<void> {
    try {
      await context.services.audit?.write(event);
    } catch {
      // The audit log reports its own health.
    }
  }

  // ---- POST /v1/clob/order/prepare ---------------------------------------------------------------------------------------------

  const prepareOrder: NonNullable<RouteTable["POST /v1/clob/order/prepare"]> = async (body, context) => {
    const venue = body.venue;
    guardWrite(context, CLOB_FLAG[venue]);
    // Limitless: the maker is the owner, checked now. Polymarket: the maker is read from Polygon below.
    const owner = venue === "limitless" ? ownerOf(body) : parsedOwnerOf(body);
    const config = needService(context, "config");
    const ledger = needService(context, "ledger");
    const prepared = needService(context, "prepared");
    const state = needService(context, "state");
    const side: 0 | 1 = body.side === "BUY" ? 0 : 1;
    const tif = body.tif;
    const postOnly = body.post_only === true;

    // Shape rules that need no network.
    const allowedTifs = venue === "polymarket" ? POLYMARKET_TIFS : LIMITLESS_TIFS;
    if (!allowedTifs.includes(tif)) throw new RelayError("invalid_request", `${venueDisplayName(venue)} does not take ${tif} orders.`, { reason: "tif_not_offered" });
    if (postOnly && tif !== "GTC" && tif !== "GTD") throw new RelayError("invalid_request", "post_only applies to a resting (GTC or GTD) order only.", { reason: "post_only_needs_resting" });
    if (venue === "limitless" && body.ttl_s !== undefined) throw new RelayError("invalid_request", "Limitless orders carry no expiry: leave ttl_s out.", { reason: "ttl_not_signed" });
    if (tif !== "GTD" && body.ttl_s !== undefined) throw new RelayError("invalid_request", "Only a GTD order has a lifetime.", { reason: "ttl_needs_gtd" });
    if (venue === "polymarket" && body.market_id.startsWith("0x") === false) throw new RelayError("invalid_request", "A Polymarket market is named by its condition id.", { reason: "market_id_form" });
    if (venue === "limitless" && body.market_id.startsWith("0x")) throw new RelayError("invalid_request", "A Limitless market is named by its slug.", { reason: "market_id_form" });
    const ttl = tif === "GTD" ? (body.ttl_s ?? DEFAULT_GTD_TTL_S) : null;
    if (ttl !== null) {
      const longest = Math.min(config.guardrails.orderExpirySeconds, MAX_ORDER_TTL_S);
      if (ttl < POLYMARKET_GTD_MIN_TTL_S || ttl > longest) throw new RelayError("invalid_request", `ttl_s must be between ${POLYMARKET_GTD_MIN_TTL_S} and ${longest} seconds for a GTD order.`, { reason: "ttl_out_of_range", min_s: POLYMARKET_GTD_MIN_TTL_S, max_s: longest });
    }

    // The market, live.
    let tick: string;
    let minSize: string;
    let levels: Levels;
    let polymarket: PolymarketMarketRead | undefined;
    let limitless: LimitlessMarketRead | undefined;
    let clock: { readonly nowS: number; readonly offsetS: number };
    // Who makes the order: the owner, or (Polymarket) the owner's Deposit Wallet as read from Polygon.
    let pmMaker: PolymarketMaker = { kind: "eoa", maker: getAddress(owner), signatureType: POLYMARKET_SIGNATURE_TYPE_EOA };
    if (venue === "polymarket") {
      [clock, polymarket, pmMaker] = await Promise.all([polymarketClock(context, true), readPolymarketMarket(context, body.market_id, body.token_id), readPolymarketMaker(context, getAddress(owner), polygonRpcUrl)]);
      checkSuppliedAccount(body.account, pmMaker.maker);
      tick = polymarket.tick;
      minSize = polymarket.minSize;
      levels = polymarket.levels;
    } else {
      limitless = await readLimitlessMarket(context, body.market_id, body.token_id);
      clock = { nowS: Math.floor(context.now() / 1000), offsetS: 0 };
      tick = LIMITLESS_PRICE_TICK;
      minSize = limitless.minSize;
      levels = body.token_id === limitless.yesToken ? limitless.levels : complementLevels(limitless.levels);
    }
    const rule = venue === "polymarket" ? polymarketTickRule(tick) : undefined;
    const priceDecimals = rule?.priceDecimals ?? 3;

    // Amounts and the cap.
    let amounts: ClobAmounts;
    let cap: ReturnType<typeof clobCapAmount>;
    try {
      amounts = computeClobAmounts({ side, price: body.price, shares: body.shares, grid: { tick, priceDecimals }, sizeDecimals: SIZE_DECIMALS, minSharesMicro: sharesMicroOf(minSize) });
      if (venue === "limitless") checkLimitlessAmounts(amounts);
      cap = clobCapAmount(amounts, CLOB_CAP_FEE_BPS);
    } catch (error) {
      throw signingFailure(error);
    }
    checkBand(side, amounts.priceMicro, levels, config.guardrails.priceBandTicks, postOnly);

    // The order.
    const salt = nonZeroSalt(random);
    const ownerAddress = getAddress(owner);
    const maker = venue === "polymarket" ? pmMaker.maker : ownerAddress;
    const expiration = ttl === null ? 0n : BigInt(clock.nowS + ttl);
    // `hash` is the venue's order id; `digest` what the owner signs (they differ only for a Deposit Wallet order).
    let hash: Hex;
    let digest: Hex;
    let typedData: TypedData;
    let decodedInput: Parameters<typeof buildDecodedClobOrder>[0]["order"];
    let stored: Omit<StoredOrder, "hash" | "digest" | "reservationId" | "preparedId" | "createdAtMs" | "final" | "capAtomic">;
    try {
      if (venue === "polymarket" && polymarket !== undefined) {
        const timestamp = BigInt(clock.nowS) * 1000n;
        const order: PolymarketOrder = { salt, maker, signer: maker, tokenId: BigInt(body.token_id), makerAmount: amounts.makerAmount, takerAmount: amounts.takerAmount, side, signatureType: pmMaker.signatureType, timestamp, metadata: ZERO_BYTES32, builder: ZERO_BYTES32 };
        hash = hashPolymarketOrder(order, polymarket.book);
        digest = polymarketSigningDigest(order, polymarket.book);
        typedData = JSON.parse(JSON.stringify(polymarketOrderSignTypedData(order, polymarket.book))) as TypedData;
        const exchange = POLYMARKET_EXCHANGES[polymarket.book];
        decodedInput = { venue: "polymarket", order, expiration, domain: { version: exchange.version, verifyingContract: exchange.verifyingContract } };
        stored = { v: 1, venue, owner: ownerAddress, maker, signatureType: pmMaker.signatureType, tokenId: body.token_id, marketId: lower(body.market_id), salt: salt.toString(), side, makerAmount: amounts.makerAmount.toString(), takerAmount: amounts.takerAmount.toString(), tif, postOnly, ttlS: ttl, expiration: expiration.toString(), timestampMs: timestamp.toString(), book: polymarket.book, exchange: null, feeRateBps: null, tick, minSize, feeBps: cap.feeBps, clockOffsetS: clock.offsetS };
      } else if (limitless !== undefined) {
        const order: LimitlessOrder = { salt, maker, signer: maker, taker: ZERO_ADDRESS, tokenId: BigInt(body.token_id), makerAmount: amounts.makerAmount, takerAmount: amounts.takerAmount, expiration: 0n, nonce: 0n, feeRateBps: limitless.feeRateBps, side, signatureType: 0 };
        digest = hashLimitlessOrder(order, limitless.exchange);
        hash = digest;
        typedData = JSON.parse(JSON.stringify(limitlessOrderSignTypedData(order, limitless.exchange))) as TypedData;
        decodedInput = { venue: "limitless", order, exchange: limitless.exchange };
        stored = { v: 1, venue, owner: ownerAddress, maker, signatureType: 0, tokenId: body.token_id, marketId: body.market_id, salt: salt.toString(), side, makerAmount: amounts.makerAmount.toString(), takerAmount: amounts.takerAmount.toString(), tif, postOnly, ttlS: null, expiration: "0", timestampMs: null, book: null, exchange: limitless.exchange, feeRateBps: limitless.feeRateBps.toString(), tick, minSize, feeBps: cap.feeBps, clockOffsetS: 0 };
      } else {
        throw new RelayError("internal", "The venue read is missing.");
      }
    } catch (error) {
      throw signingFailure(error);
    }

    // R1: the decoded block, rebuilt here as a self-check before anything is reserved or stored.
    const decoded = buildDecodedClobOrder({ owner: ownerAddress, amounts, feeBps: cap.feeBps, tif, postOnly, ttlS: ttl, marketId: stored.marketId, tick, minSize, order: decodedInput });
    const rebuilt = rebuildDecoded(decoded);
    if (!rebuilt.ok || lower(rebuilt.digest) !== lower(digest)) {
      throw new RelayError("internal", `The relay could not rebuild its own order digest from the decoded terms (${rebuilt.ok ? "digest" : rebuilt.field}). Nothing was prepared.`, { field: rebuilt.ok ? "digest" : rebuilt.field });
    }

    const nowMs = context.now();
    const reservationId = `clb_${random(16).toString("hex")}`;
    const record: StoredOrder = { ...stored, hash: lower(hash), digest: lower(digest), capAtomic: cap.capAtomic.toString(), reservationId, preparedId: null, createdAtMs: nowMs, final: null };
    await state.commit([
      { ns: ORDERS_NS, key: recordKey(venue, hash), value: record as unknown as Json },
      { ns: RESERVATIONS_NS, key: reservationId, value: recordKey(venue, hash) },
    ]);
    // A resting order with no signed expiry holds its reservation for the prepared item's life plus a day: the venue's
    // own cancel is the only way it ends, and the relay cannot see that yet (no reconcile).
    const reservationEndsMs = expiration === 0n ? nowMs + 86_400_000 : Number(expiration) * 1000;
    const reserved = await ledger.reserveFor({
      kind: "spend",
      // The caps count per owner, whichever wallet makes the order.
      account: lower(ownerAddress),
      day: ledger.currentDay(),
      amountAtomic: cap.capAtomic,
      limitAtomic: config.guardrails.maxDailyAtomic,
      category: "order",
      expiresAtMs: reservationEndsMs,
      reservationId,
    });
    if (!reserved.reserved) {
      await state.commit([
        { ns: ORDERS_NS, key: recordKey(venue, hash), value: null },
        { ns: RESERVATIONS_NS, key: reservationId, value: null },
      ]);
      throw new RelayError("cap_exceeded", `This order counts ${usd(cap.capAtomic)} USD against a limit with ${usd(reserved.remainingAtomic)} USD left.`, {
        reason: reserved.reason,
        counted_usd: usd(cap.capAtomic),
        limit_usd: usd(reserved.limitAtomic),
        remaining_usd: usd(reserved.remainingAtomic),
      });
    }

    const typedFact = venue === "polymarket" ? FACT_PAYBOX_TYPED_137 : FACT_PAYBOX_TYPED_8453;
    const useTyped = context.services.capabilities?.state(typedFact) !== "no";
    const sign: PreparedSign = { intent: useTyped ? { op: "typedData", typedData } : { op: "raw", rawSigningPayloadHex: digest }, expected_digest: digest, digest_form: "eip712OrderHash" };
    const check = checkPreparedSign(sign);
    if (!check.ok) throw new RelayError("internal", "The relay built a signing request that does not match its digest. Nothing was prepared.");

    const preparedTtlS = ttl === null ? PREPARED_TTL_S : Math.max(1, Math.min(PREPARED_TTL_S, ttl - 60));
    const item = await prepared.create({ kind: "clob_order", owner: ownerAddress, account: maker, digest, digestForm: "eip712OrderHash", payload: { venue, hash: lower(hash) }, reservationIds: [reservationId], ttlS: preparedTtlS });
    await patchStored(state, venue, hash, (current) => ({ ...current, preparedId: item.id }));

    const spentToday = reserved.usage.spentAtomic;
    const dayRemaining = config.guardrails.maxDailyAtomic > spentToday ? config.guardrails.maxDailyAtomic - spentToday : 0n;
    const capabilities = context.services.capabilities?.snapshot(FACT_IDS[venue]) ?? {};
    const credentials = await hasCredentials(context, venue, ownerAddress);
    const warnings = [
      SAFETY_NOTICES.advisoryCaps,
      SAFETY_NOTICES.approvalMode,
      SAFETY_NOTICES.dedicatedCredential,
      SAFETY_NOTICES.digestTag,
      venue === "polymarket" ? POLYMARKET_GEOBLOCK_NOTE : LIMITLESS_GEOBLOCK_NOTE,
      "Nothing about this venue's gateway (its minimum size, its wire spellings, its signature checks) has been proven by a live order from this relay. A refusal says what it wants; the relay never retries a refused order on its own.",
      ...(credentials ? [] : [`No ${venueDisplayName(venue)} credential is stored for this wallet yet; submitting will be refused until one is.`]),
      ...(expiration === 0n && (tif === "GTC") ? ["This order carries no signed expiry: it rests until cancelled through the venue, and the relay cannot cancel it yet."] : []),
      ...(Math.abs(clock.offsetS) > 30 ? [`The relay's clock differs from the venue's by ${Math.abs(clock.offsetS)} s. The order uses the venue's clock.`] : []),
      ...(venue !== "polymarket"
        ? []
        : pmMaker.kind === "deposit_wallet"
          ? [
              `The maker is this wallet's Polymarket Deposit Wallet ${pmMaker.maker} (read from Polygon: deployed with Polymarket's ${pmMaker.proxy === "beacon" ? "beacon" : "UUPS"} proxy, owned by this wallet). The wallet signs a TypedDataSign wrapper of the order and the relay wraps that signature for the Deposit Wallet's ERC-1271 check at submit. No Deposit Wallet order from this relay has been accepted by Polymarket yet.`,
            ]
          : [
              "No Polymarket Deposit Wallet is deployed at either address derived from this wallet (read from Polygon), so this is an EOA order (signature type 0). Polymarket's docs use an EOA as the account wallet only when it is allowlisted for trading; otherwise expect the venue to refuse it.",
            ]),
    ];
    return {
      prepared_id: item.id,
      kind: "clob_order",
      owner: ownerAddress,
      account: maker,
      expires_at: isoSecondOf(item.expiresAtMs),
      sign,
      summary: { lines: [...rebuilt.lines], digest_tag: digestTag(digest), inner_hash_tag: digestTag(rebuilt.inner_hash), inner_hash_kind: "typed_data_hash" },
      caps: { reserved_usd: usd(cap.capAtomic), day_remaining_usd: usd(dayRemaining) },
      capabilities,
      warnings,
      decoded,
      quote: {
        venue,
        price: formatMicro(amounts.priceMicro),
        shares: formatMicro(amounts.sharesMicro),
        max_outlay_usd: cap.maxOutlayAtomic === null ? "0" : usd(cap.maxOutlayAtomic),
        fee_bound_bps: cap.feeBps,
        expires_at: decoded.terms.expires_at,
      },
    };
  };

  // ---- POST /v1/clob/order/submit -----------------------------------------------------------------------------------------------

  type Outcome = { readonly kind: "accepted"; readonly detail: string } | { readonly kind: "rejected"; readonly detail: string } | { readonly kind: "ambiguous"; readonly detail: string };

  function classify(venue: ClobVenue, response: UpstreamResponse, hash: string): Outcome {
    let json: unknown;
    try {
      json = JSON.parse(response.body);
    } catch {
      json = undefined;
    }
    const message = isRecord(json) ? (typeof json["error"] === "string" ? json["error"] : typeof json["errorMsg"] === "string" ? json["errorMsg"] : typeof json["message"] === "string" ? json["message"] : "") : "";
    const reason = sanitizeUpstreamText(message.length > 0 ? message : response.body, 160);
    if (response.status >= 200 && response.status < 300) {
      if (!isRecord(json)) return { kind: "ambiguous", detail: "unreadable_success_response" };
      if (venue === "polymarket") {
        // place-orders.md response: {success, errorMsg, orderID, status, ...}.
        if (json["success"] === false) return { kind: "rejected", detail: `upstream_rejected: ${reason.length > 0 ? reason : "the order was not accepted"}` };
        const orderId = json["orderID"] ?? json["orderId"];
        if (typeof orderId === "string" && lower(orderId) === hash) return { kind: "accepted", detail: typeof json["status"] === "string" ? json["status"].toLowerCase().replace(/[^a-z_]/g, "").slice(0, 24) : "live" };
        return { kind: "ambiguous", detail: typeof orderId === "string" ? "order_id_mismatch" : "success_without_order_id" };
      }
      // Limitless: the acknowledgement's shape is not documented (programmatic-api only shows makerMatches). A 2xx JSON
      // answer without an error is taken as accepted and labelled so; the agent is told to check the venue.
      if (typeof json["error"] === "string" || typeof json["message"] === "string") return { kind: "rejected", detail: `upstream_rejected: ${reason}` };
      return { kind: "accepted", detail: "venue_ack_shape_unverified" };
    }
    if (response.status === 401 || response.status === 403) return { kind: "rejected", detail: `upstream_rejected: the venue refused the stored credential${reason.length > 0 ? ` (${reason})` : ""}` };
    if (response.status >= 500) return { kind: "ambiguous", detail: `upstream_error_${response.status}` };
    return { kind: "rejected", detail: `upstream_rejected: HTTP ${response.status}${reason.length > 0 ? `: ${reason}` : ""}` };
  }

  async function buildPost(context: RelayContext, stored: StoredOrder, signature: Hex): Promise<{ readonly url: string; readonly body: string; readonly headers: Record<string, string> }> {
    const secrets = context.services.secrets;
    if (secrets === undefined) throw new RelayError("precondition_failed", "The credential store is off, so the relay holds no venue credential.", { reason: "credential_store_off" });
    if (stored.venue === "polymarket") {
      const found = await secrets.get(lower(stored.owner), POLYMARKET_SECRET_NAME);
      const triplet = found === undefined ? undefined : parseTriplet(found.reveal());
      if (triplet === undefined) throw new RelayError("precondition_failed", "No Polymarket credential is stored for this wallet. Log in first (clob_auth prepare and submit).", { credentials: found === undefined ? "none" : "unreadable" });
      const { order, book } = polymarketOrderOf(stored);
      // Type 3: the owner's 65-byte signature over the TypedDataSign digest, wrapped for the wallet (ERC-7739).
      const venueSignature = stored.signatureType === POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET ? wrapPolymarketDepositWalletSignature(signature, order, book) : signature;
      const wire = { ...polymarketOrderToWire(order, BigInt(stored.expiration)), signature: venueSignature };
      const body = JSON.stringify({ order: wire, owner: triplet.apiKey, orderType: stored.tif, ...(stored.postOnly ? { postOnly: true } : {}) });
      const clock = await polymarketClock(context, false);
      const headers = buildPolymarketL2Headers({ address: stored.owner, credentials: triplet, timestampSeconds: clock.nowS, method: "POST", path: "/order", body });
      return { url: `${POLYMARKET_CLOB}/order`, body, headers };
    }
    const found = await secrets.get(lower(stored.owner), LIMITLESS_SECRET_NAME);
    const token = found === undefined ? undefined : parseToken(found.reveal());
    if (token === undefined) throw new RelayError("precondition_failed", "No Limitless token is stored for this wallet. The venue issues scoped tokens in its own UI; the operator places one in the vault.", { credentials: found === undefined ? "none" : "unreadable" });
    const { order } = limitlessOrderOf(stored);
    const wire = { ...limitlessOrderToWire(order), signature };
    const body = JSON.stringify({ order: wire, orderType: stored.tif, marketSlug: stored.marketId, ...(stored.postOnly ? { postOnly: true } : {}) });
    const headers = buildLimitlessHeaders({ token, timestampIso: isoSecondOf(context.now()), method: "POST", pathWithQuery: "/orders", body });
    return { url: `${LIMITLESS_API}/orders`, body, headers };
  }

  async function postOnce(context: RelayContext, stored: StoredOrder, ready: { readonly url: string; readonly body: string; readonly headers: Record<string, string> }): Promise<Outcome> {
    try {
      const upstream = needService(context, "upstream");
      // No signal on purpose: an aborted POST would turn a send into an ambiguous one.
      const response = await upstream.request({ method: "POST", url: ready.url, headers: ready.headers, body: ready.body, purpose: "clob_post_order", timeoutMs: postTimeoutMs, maxBytes: 64 * 1024 });
      return classify(stored.venue, response, stored.hash);
    } catch (error) {
      if (error instanceof UpstreamError) {
        if (error.kind === "requires_key" || error.kind === "cloudflare" || error.kind === "rate_limited" || error.kind === "circuit_open" || error.kind === "host_not_allowed") return { kind: "rejected", detail: `upstream_unavailable: ${error.kind}` };
        return { kind: "ambiguous", detail: `upstream_${error.kind}` };
      }
      return { kind: "ambiguous", detail: "unexpected_failure" };
    }
  }

  async function finish(context: RelayContext, record: PreparedRecord, stored: StoredOrder, outcome: Outcome): Promise<void> {
    const prepared = needService(context, "prepared");
    const state = needService(context, "state");
    const detail = outcome.detail.replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").slice(0, 47).replace(/^_+|_+$/g, "") || "unknown";
    const code = /^[a-z]/.test(detail) ? detail : `r_${detail}`.slice(0, 48);
    await prepared.resolve(record.id, outcome.kind, code).catch(() => undefined);
    // A rejected order's reservation is given back by `sweep` once the ledger considers it expired; the ledger refuses an
    // earlier release by design.
    await patchStored(state, stored.venue, stored.hash, (current) => ({ ...current, final: { state: outcome.kind, atMs: context.now(), detail: outcome.detail.slice(0, 160) } }));
    await audit(context, { ev: "send_result", outcome: outcome.kind === "accepted" ? "ok" : outcome.kind === "rejected" ? "refused" : "ambiguous", state: outcome.kind, preparedId: record.id, owner: stored.owner, account: stored.maker, hash: stored.hash, code, sync: true });
  }

  const submitOrder: NonNullable<RouteTable["POST /v1/clob/order/submit"]> = async (body, context) => {
    const prepared = needService(context, "prepared");
    const state = needService(context, "state");
    const record = prepared.require(body.prepared_id);
    if (record.kind !== "clob_order") throw new RelayError("not_found", "No such venue order to submit (it may have expired or never existed).");
    const payload = record.payload;
    const venue = isRecord(payload) ? payload["venue"] : undefined;
    const hash = isRecord(payload) ? payload["hash"] : undefined;
    if ((venue !== "polymarket" && venue !== "limitless") || typeof hash !== "string") throw new RelayError("internal", "The prepared item names no venue order.");
    await guardSubmit(context, CLOB_FLAG[venue]);
    const stored = loadStored(state, venue, hash);
    if (stored === undefined) throw new RelayError("internal", "The relay has no record of the prepared order.");
    const owner = getAddress(record.owner);
    if (lower(stored.owner) !== lower(owner)) throw new RelayError("internal", "The stored order and the prepared item disagree about the owner.");
    if (lower(stored.maker) !== lower(record.account)) throw new RelayError("internal", "The stored order and the prepared item disagree about the maker.");

    // Invariant 3: the digest is recomputed from the stored fields, never taken from the record or the caller.
    const digest = digestOf(stored);
    if (lower(digest) !== lower(record.digest) || lower(digest) !== stored.digest) throw new RelayError("internal", "The prepared order no longer matches its digest, so nothing was sent.");

    let signature: Hex | undefined;
    if (record.state === "prepared") {
      if (context.now() >= record.expiresAtMs) throw new RelayError("expired", "This prepared order expired. Prepare it again.");
      const verified = await verifyDigestSignature({ userOpHash: digest, signature: body.signature, expectedOwner: owner });
      if (!verified.ok) {
        await prepared.noteFailedAttempt(record.id);
        await audit(context, { ev: "refused", preparedId: record.id, owner, account: stored.maker, state: "signature_refused", code: verified.code, outcome: "refused" });
        if (verified.code === "owner_mismatch") throw new RelayError("owner_mismatch", "The signature is not from the owner wallet.");
        if (verified.code === "signature_invalid") throw new RelayError("signature_invalid", "The signature is not a valid 65-byte signature.");
        throw new RelayError("invalid_request", "The signature could not be checked.");
      }
      // The venue recovers the signer over the EIP-712 digest itself. A personal_sign wrapping recovers to the owner here
      // but would recover to a stranger at the venue, so it is refused instead of sent.
      if (verified.form !== "raw") {
        await prepared.noteFailedAttempt(record.id);
        throw new RelayError("signature_invalid", "The signature wraps the digest as a personal message (EIP-191); the venue needs a signature over the typed-data digest itself.", { reason: "eip191_not_accepted" });
      }
      signature = verified.signature;
      // A Deposit Wallet order: the exchange requires the maker to have code and accepts the signature only through the
      // wallet's ERC-1271 check against its current owner, so the wallet is read again now. A refusal here sends nothing
      // and leaves the item unclaimed.
      if (stored.signatureType === POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET) await reconfirmDepositWallet(context, owner, getAddress(stored.maker), polygonRpcUrl);
    }

    // One claim per prepared item: the marker is on disk before any request leaves.
    await prepared.beginSend(record.id);
    if (signature === undefined) throw new RelayError("internal", "A claimed order has no verified signature.");
    let ready: Awaited<ReturnType<typeof buildPost>>;
    try {
      ready = await buildPost(context, stored, signature);
    } catch (error) {
      // Nothing left the relay: the claim is returned by rejecting the item with a local code.
      await prepared.resolve(record.id, "rejected", "not_sent_no_credentials").catch(() => undefined);
      throw error;
    }
    await audit(context, { ev: "send_begin", outcome: "pending", state: "sending", preparedId: record.id, owner, account: stored.maker, hash: stored.hash, sync: true });

    const send = postOnce(context, stored, ready).then(async (outcome) => {
      await finish(context, record, stored, outcome);
      return outcome;
    });
    track(send);
    const timer = new Promise<"pending">((resolve) => {
      const handle = setTimeout(() => resolve("pending"), pendingAfterMs);
      handle.unref?.();
      void send.finally(() => clearTimeout(handle));
    });
    const settled = await Promise.race([send, timer]);
    if (settled === "pending") return { venue, state: "pending", order_hash: stored.hash as Hex, detail: "in_flight" };
    return { venue, state: settled.kind, order_hash: stored.hash as Hex, detail: settled.detail.slice(0, 300) };
  };

  // ---- POST /v1/clob/auth/prepare and submit (Polymarket) -------------------------------------------------------------------

  const prepareAuth: NonNullable<RouteTable["POST /v1/clob/auth/prepare"]> = async (body, context) => {
    if (body.venue === "limitless") {
      throw new RelayError("not_implemented", "Limitless issues its scoped API tokens in its own UI (a Privy session); there is no login message to sign. The operator places a token in the vault.", { venue: "limitless" });
    }
    guardWrite(context, CLOB_FLAG.polymarket);
    const owner = ownerOf(body);
    const prepared = needService(context, "prepared");
    if (context.services.secrets === undefined) throw new RelayError("precondition_failed", "The credential store is off, so the relay cannot keep venue credentials.", { reason: "credential_store_off" });
    if (await hasCredentials(context, "polymarket", owner)) throw new RelayError("precondition_failed", "A Polymarket credential is already stored for this wallet, so no new login signature is needed.", { reason: "credentials_already_stored" });

    const clock = await polymarketClock(context, true);
    const timestamp = String(clock.nowS);
    const digest = hashPolymarketClobAuth({ address: owner, timestamp, nonce: 0n });
    const decoded = buildDecodedClobAuth({ owner, timestamp });
    const rebuilt = rebuildDecoded(decoded);
    if (!rebuilt.ok || lower(rebuilt.digest) !== lower(digest)) throw new RelayError("internal", "The relay could not rebuild its own login digest. Nothing was prepared.");
    const useTyped = context.services.capabilities?.state(FACT_PAYBOX_TYPED_137) !== "no";
    const typedData = JSON.parse(JSON.stringify(polymarketClobAuthSignTypedData({ address: owner, timestamp, nonce: 0n }))) as TypedData;
    const sign: PreparedSign = { intent: useTyped ? { op: "typedData", typedData } : { op: "raw", rawSigningPayloadHex: digest }, expected_digest: digest, digest_form: "eip712ClobAuth" };
    const item = await prepared.create({ kind: "clob_auth", owner, account: owner, digest, digestForm: "eip712ClobAuth", payload: { venue: "polymarket", timestamp }, ttlS: AUTH_PREPARED_TTL_S });
    return {
      prepared_id: item.id,
      kind: "clob_auth",
      owner,
      account: owner,
      expires_at: isoSecondOf(item.expiresAtMs),
      sign,
      summary: { lines: [...rebuilt.lines], digest_tag: digestTag(digest), inner_hash_tag: digestTag(rebuilt.inner_hash), inner_hash_kind: "typed_data_hash" },
      caps: { reserved_usd: "0", day_remaining_usd: usd(needService(context, "config").guardrails.maxDailyAtomic) },
      capabilities: context.services.capabilities?.snapshot([FACT_PM_LOGIN, FACT_PAYBOX_TYPED_137]) ?? {},
      warnings: ["Whoever can sign this login can also create Polymarket API credentials for this wallet.", POLYMARKET_GEOBLOCK_NOTE, SAFETY_NOTICES.approvalMode, SAFETY_NOTICES.dedicatedCredential, SAFETY_NOTICES.advisoryCaps],
      decoded,
    };
  };

  const submitAuth: NonNullable<RouteTable["POST /v1/clob/auth/submit"]> = async (body, context) => {
    const prepared = needService(context, "prepared");
    const record = prepared.require(body.prepared_id);
    if (record.kind !== "clob_auth") throw new RelayError("not_found", "No such venue login to submit (it may have expired or never existed).");
    await guardSubmit(context, CLOB_FLAG.polymarket);
    const secrets = context.services.secrets;
    if (secrets === undefined) throw new RelayError("precondition_failed", "The credential store is off, so the relay cannot keep venue credentials.", { reason: "credential_store_off" });
    const payload = record.payload;
    const timestamp = isRecord(payload) ? payload["timestamp"] : undefined;
    if (typeof timestamp !== "string" || !/^[1-9][0-9]{0,11}$/.test(timestamp)) throw new RelayError("internal", "The prepared login is unreadable.");
    const owner = getAddress(record.owner);
    const digest = hashPolymarketClobAuth({ address: owner, timestamp, nonce: 0n });
    if (lower(digest) !== lower(record.digest)) throw new RelayError("internal", "The prepared login no longer matches its digest, so nothing was sent.");

    let signature: Hex | undefined;
    if (record.state === "prepared") {
      if (context.now() >= record.expiresAtMs) throw new RelayError("expired", "This login expired. Prepare it again and sign within the deadline.");
      const verified = await verifyDigestSignature({ userOpHash: digest, signature: body.signature, expectedOwner: owner });
      if (!verified.ok) {
        await prepared.noteFailedAttempt(record.id);
        if (verified.code === "owner_mismatch") throw new RelayError("owner_mismatch", "The signature is not from the owner wallet.");
        if (verified.code === "signature_invalid") throw new RelayError("signature_invalid", "The signature is not a valid 65-byte signature.");
        throw new RelayError("invalid_request", "The signature could not be checked.");
      }
      if (verified.form !== "raw") {
        await prepared.noteFailedAttempt(record.id);
        throw new RelayError("signature_invalid", "The signature wraps the digest as a personal message (EIP-191); the venue needs a signature over the typed-data digest itself.", { reason: "eip191_not_accepted" });
      }
      signature = verified.signature;
    }
    await prepared.beginSend(record.id);
    if (signature === undefined) throw new RelayError("internal", "A claimed login has no verified signature.");

    const upstream = needService(context, "upstream");
    const headers = buildPolymarketL1Headers({ address: owner, timestamp, nonce: 0n }, signature);
    const adopt = async (response: UpstreamResponse): Promise<PolymarketCredentials | undefined> => {
      const json = jsonOf(upstream, response);
      if (!isRecord(json)) return undefined;
      const parsed = parseTriplet(JSON.stringify({ apiKey: json["apiKey"] ?? json["api_key"], secret: json["secret"], passphrase: json["passphrase"] }));
      return parsed;
    };
    try {
      // Derive first (an existing key); create once only when derive gives nothing usable.
      const derived = await readUpstream(upstream, { method: "GET", url: `${POLYMARKET_CLOB}/auth/derive-api-key`, purpose: "clob_auth_derive", headers: { ...headers }, timeoutMs: 5_000 });
      let triplet = derived.ok ? await adopt(derived) : undefined;
      let how = "derived";
      if (triplet === undefined) {
        if (derived.status === 401 || derived.status === 403) throw new RelayError("upstream_rejected", "The venue refused the login signature.", { status: derived.status, reason: "login_refused" });
        const created = await readUpstream(upstream, { method: "POST", url: `${POLYMARKET_CLOB}/auth/api-key`, purpose: "clob_auth_create", headers: { ...headers }, body: "", timeoutMs: 5_000 });
        triplet = created.ok ? await adopt(created) : undefined;
        how = "created";
        if (triplet === undefined) {
          if (created.status >= 500) throw new RelayError("ambiguous", "The venue did not answer the credential request; a key may or may not exist now.", { status: created.status });
          throw new RelayError("upstream_rejected", "The venue did not return a usable credential.", { status: created.status, reason: "no_credential" });
        }
      }
      await secrets.put(lower(owner), POLYMARKET_SECRET_NAME, JSON.stringify(triplet));
      await context.services.capabilities?.record({ id: FACT_PM_LOGIN, state: "yes", source: "probe", note: `login accepted, credential ${how}` }).catch(() => undefined);
      await prepared.resolve(record.id, "accepted", "credentials_stored");
      return { venue: "polymarket", credentials: "stored", key_tag: clobKeyTagOf("polymarket", triplet.apiKey) };
    } catch (error) {
      const relayError = error instanceof UpstreamError ? toRelayError(error) : error;
      if (relayError instanceof RelayError) {
        const outcome = relayError.code === "ambiguous" ? "ambiguous" : "rejected";
        await prepared.resolve(record.id, outcome, outcome === "ambiguous" ? "create_outcome_unknown" : "login_refused").catch(() => undefined);
        throw relayError;
      }
      await prepared.resolve(record.id, "ambiguous", "unexpected_failure").catch(() => undefined);
      throw error;
    }
  };

  async function sweep(context: RelayContext): Promise<{ readonly released: number; readonly unknown: number }> {
    const ledger = context.services.ledger;
    const state = context.services.state;
    const prepared = context.services.prepared;
    if (ledger === undefined || state === undefined || prepared === undefined) return { released: 0, unknown: 0 };
    const report = await ledger.sweep(async (reservation) => {
      if (reservation.kind !== "spend" || reservation.category !== "order") return { verdict: "unknown" };
      const key = state.get<Json>(RESERVATIONS_NS, reservation.id);
      if (typeof key !== "string") return { verdict: "unknown" };
      const stored = state.get<Json>(ORDERS_NS, key);
      if (stored === undefined) return { verdict: "unknown" };
      let record: StoredOrder;
      try {
        record = parseStored(stored);
      } catch {
        return { verdict: "unknown" };
      }
      if (record.final?.state === "rejected") return { verdict: "absent", source: "no_report" };
      const item = record.preparedId === null ? undefined : prepared.get(record.preparedId);
      if (item === undefined || item.state === "prepared" || item.state === "expired" || item.state === "rejected") return { verdict: "absent", source: "no_report" };
      return { verdict: "unknown" };
    });
    return { released: report.released.length, unknown: report.unknown.length };
  }

  return {
    sweep,
    routes: {
      "POST /v1/clob/order/prepare": prepareOrder,
      "POST /v1/clob/order/submit": submitOrder,
      "POST /v1/clob/auth/prepare": prepareAuth,
      "POST /v1/clob/auth/submit": submitAuth,
    },
    async idle() {
      while (background.size > 0) await Promise.all([...background]);
    },
  };
}

export const defaultClob: ClobRoutes = createClobRoutes();
export const routes: RouteTable = defaultClob.routes;

// Re-exported for the tests and the tools: how the tick decides the price grid.
export function priceDecimalsFor(venue: ClobVenue, tick: string): number {
  if (venue === "polymarket") return polymarketTickRule(tick)?.priceDecimals ?? 2;
  return parseTickMicro(tick) >= 1_000n ? 3 : 4;
}
