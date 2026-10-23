// What the owner wallet signs on XO, and the Signature Card shown before each signature.
//
// XO trades through the visitor's Kernel v3.1 smart account (an address derived from the owner EOA, sdk/trade/xo/
// account/derive.ts). The exchange checks signatures with ERC-1271 on that account, and Kernel v3.1 hashes the digest
// once more under the account's own EIP-712 domain before its ECDSA validator checks the owner's key. So for BOTH the
// login and an order the wallet is asked to sign the same small typed-data object (sdk/trade/xo/kernel.ts):
//
//   domain  { name "Kernel", version "0.3.1", chainId 3223, verifyingContract <the XO account> }
//   type    Kernel(bytes32 hash)
//   message { hash: <inner digest> }
//
// where the inner digest is
//   (a) login:  the ClobAuth struct under { name "ClobAuthDomain", version "1", chainId 3223 } (no verifyingContract):
//               address = the XO account, timestamp = XO's clock as a decimal string, nonce 0, the fixed message;
//   (b) order:  the 13-field Order under { name "XO Market CLOB", version "1", chainId 3223, verifyingContract the CTF
//               exchange }, maker = signer = the XO account, signature type 3, nonce 0, beneficiary zero.
//   (c) cancel: nothing. A cancel is an L2 request (HMAC with the visitor's API credential); the wallet is not asked.
//
// Every domain is chain 3223, so the wallet must be on chain 3223 when it signs (wallets refuse a typed-data domain
// whose chainId differs from the active chain). The card rebuilds both digests from the fields it shows, with the same
// SDK code the relay uses, and the Sign button stays off when any check fails. After the wallet answers, the signature
// is recovered against the Kernel digest and must name the connected owner before anything is sent.

import { getAddress, hashTypedData, recoverAddress, type Address, type Hex, type TypedDataDefinition } from "viem";

import { deriveAccount } from "@sdk/trade/xo/account/derive";
import { decodeOrderAmounts, formatMicro, formatTick, maxBuyOutlay, ORDER_CAP_FEE_BPS } from "@sdk/trade/xo/amounts";
import { CLOB_AUTH_DOMAIN, CLOB_AUTH_TYPES, type ClobAuthFields } from "@sdk/trade/xo/clobauth";
import { CLOB_AUTH_MESSAGE, CTF_EXCHANGE_ADDRESS, KERNEL_DOMAIN_NAME, KERNEL_DOMAIN_VERSION, SIDE_BUY, XO_CHAIN_ID, ZERO_ADDRESS } from "@sdk/trade/xo/constants";
import type { KernelSignTypedData } from "@sdk/trade/xo/kernel";
import { ORDER_DOMAIN, ORDER_TYPES, type XoOrder } from "@sdk/trade/xo/order";
import { prepareClobAuthSigning, prepareOrderSigning, type SigningRequest } from "@sdk/trade/xo/prepare";

export { XO_CHAIN_ID };

export interface CardRow {
  readonly label: string;
  readonly value: string;
}

export interface CardCheck {
  readonly label: string;
  readonly pass: boolean;
}

export interface XoSigningCard {
  readonly kind: "login" | "order";
  readonly title: string;
  readonly owner: Address;
  readonly account: Address;
  // The decoded fields of the inner struct, in fixed app words with plain values.
  readonly rows: readonly CardRow[];
  // What the wallet will show: the Kernel domain and the one hash.
  readonly wallet: { readonly domainName: string; readonly domainVersion: string; readonly chainId: number; readonly verifyingContract: Address; readonly hash: Hex };
  readonly innerHash: Hex;
  readonly wrappedDigest: Hex;
  readonly checks: readonly CardCheck[];
  // Unix seconds (XO's clock) after which the signature is useless; null for the login.
  readonly expiresAtS: number | null;
  readonly typedData: TypedDataDefinition;
}

export function cardPasses(card: XoSigningCard): boolean {
  return card.checks.every((check) => check.pass);
}

// The JSON-safe Kernel object as viem typed data (EIP712Domain is derived from the domain by the wallet and viem).
export function walletTypedData(kernel: KernelSignTypedData): TypedDataDefinition {
  return {
    domain: { name: kernel.domain.name, version: kernel.domain.version, chainId: kernel.domain.chainId, verifyingContract: kernel.domain.verifyingContract },
    types: { Kernel: [{ name: "hash", type: "bytes32" }] },
    primaryType: "Kernel",
    message: { hash: kernel.message.hash },
  };
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function kernelChecks(owner: Address, account: Address, request: SigningRequest, inner: Hex): CardCheck[] {
  const typed = walletTypedData(request.typedData);
  const domain = request.typedData.domain;
  let derived: string | null = null;
  try {
    derived = deriveAccount(owner);
  } catch {
    derived = null;
  }
  return [
    { label: "The XO account is the one derived from the connected wallet", pass: derived !== null && same(derived, account) },
    { label: "The wallet is asked to sign for that account, on XO's chain 3223", pass: domain.name === KERNEL_DOMAIN_NAME && domain.version === KERNEL_DOMAIN_VERSION && domain.chainId === XO_CHAIN_ID && same(domain.verifyingContract, account) },
    { label: "The inner digest was rebuilt here from the fields shown", pass: same(inner, request.innerHash) && same(request.typedData.message.hash, inner) },
    { label: "The hash the wallet signs was rebuilt here from that digest", pass: same(hashTypedData(typed), request.wrappedDigest) },
  ];
}

function walletOf(request: SigningRequest): XoSigningCard["wallet"] {
  const domain = request.typedData.domain;
  return { domainName: domain.name, domainVersion: domain.version, chainId: domain.chainId, verifyingContract: getAddress(domain.verifyingContract), hash: request.typedData.message.hash };
}

// (a) The login: XO's clock as read through the relay, nonce 0.
export function loginCard(owner: Address, account: Address, serverSeconds: number): { readonly card: XoSigningCard; readonly fields: ClobAuthFields } {
  const fields: ClobAuthFields = { address: account, timestamp: String(serverSeconds), nonce: 0n };
  const request = prepareClobAuthSigning(fields);
  // An independent rebuild from the shown values (not through prepare): the domain and types are the SDK's pinned ones.
  const inner = hashTypedData({ domain: CLOB_AUTH_DOMAIN, types: CLOB_AUTH_TYPES, primaryType: "ClobAuth", message: { address: account, timestamp: fields.timestamp, nonce: 0n, message: CLOB_AUTH_MESSAGE } });
  const card: XoSigningCard = {
    kind: "login",
    title: "Log in to XO's order book",
    owner,
    account,
    rows: [
      { label: "Signs in as the XO account", value: account },
      { label: "Owner (this wallet)", value: owner },
      { label: "XO's clock, unix seconds", value: fields.timestamp },
      { label: "Nonce", value: "0" },
      { label: "Fixed message", value: CLOB_AUTH_MESSAGE },
      { label: "What it allows", value: "XO issues (or shows again) this account's API credential. It moves no funds; every order still needs its own signature." },
    ],
    wallet: walletOf(request),
    innerHash: request.innerHash,
    wrappedDigest: request.wrappedDigest,
    checks: kernelChecks(owner, account, request, inner),
    expiresAtS: null,
    typedData: walletTypedData(request.typedData),
  };
  return { card, fields };
}

export interface OrderCardContext {
  readonly nowSeconds: number;
  // The book's best opposite price and when it was read, for the card; null when the book had none.
  readonly reference: { readonly price: string; readonly label: string } | null;
}

// (b) An order. `order` was built by order.ts; prepareOrderSigning refuses a nonce other than 0, a beneficiary, a
// lifetime outside 1 s to 1 h, maker != signer and a signature type other than 3.
export function orderCard(owner: Address, order: XoOrder, context: OrderCardContext): XoSigningCard {
  const account = getAddress(order.maker);
  const request = prepareOrderSigning(order, { expiry: { nowSeconds: context.nowSeconds } });
  const inner = hashTypedData({ domain: ORDER_DOMAIN, types: ORDER_TYPES, primaryType: "Order", message: order });
  const decoded = decodeOrderAmounts({ side: order.side, makerAmount: order.makerAmount, takerAmount: order.takerAmount });
  const buy = order.side === SIDE_BUY;
  const worst = buy ? maxBuyOutlay(order.makerAmount, ORDER_CAP_FEE_BPS) : null;
  const rows: CardRow[] = [
    { label: "Side", value: buy ? "BUY" : "SELL" },
    { label: "Outcome token id", value: order.tokenId.toString() },
    { label: "Price per share, USDC", value: formatTick(decoded.priceTick) },
    { label: "Shares", value: formatMicro(decoded.sharesMicro) },
    { label: buy ? "Pays, USDC (before fee)" : "Receives, USDC (before fee)", value: formatMicro(decoded.collateralMicro) },
    ...(worst === null ? [] : [{ label: `Most it can cost with the exchange's fee ceiling (${ORDER_CAP_FEE_BPS} bps), USDC`, value: formatMicro(worst) }]),
    ...(context.reference === null ? [] : [{ label: context.reference.label, value: context.reference.price }]),
    { label: "Order type", value: "GTD (good until the expiry below)" },
    { label: "Expires, unix seconds on XO's clock", value: order.expiration.toString() },
    { label: "Maker and signer (your XO account)", value: account },
    { label: "Exchange (verifying contract)", value: CTF_EXCHANGE_ADDRESS },
    { label: "Beneficiary", value: getAddress(order.beneficiary) === ZERO_ADDRESS ? "none (proceeds stay with the maker)" : getAddress(order.beneficiary) },
    { label: "Nonce, signature type", value: `${order.nonce.toString()}, ${order.signatureType}` },
    { label: "Salt", value: order.salt.toString() },
  ];
  const orderChecks: CardCheck[] = [
    { label: "Maker and signer are the same XO account", pass: same(order.maker, order.signer) },
    { label: "The amounts are an exact price on XO's 0.001 tick", pass: decoded.priceTick >= 1 && decoded.priceTick <= 999 },
    { label: "The order expires within the hour", pass: order.expiration > BigInt(context.nowSeconds) && order.expiration <= BigInt(context.nowSeconds + 3600) },
  ];
  return {
    kind: "order",
    title: `${buy ? "Buy" : "Sell"} ${formatMicro(decoded.sharesMicro)} shares at ${formatTick(decoded.priceTick)} on XO`,
    owner,
    account,
    rows,
    wallet: walletOf(request),
    innerHash: request.innerHash,
    wrappedDigest: request.wrappedDigest,
    checks: [...kernelChecks(owner, account, request, inner), ...orderChecks],
    expiresAtS: Number(order.expiration),
    typedData: walletTypedData(request.typedData),
  };
}

// The address that made `signature` over the card's Kernel digest; it must be the connected owner.
export async function signerOf(card: XoSigningCard, signature: Hex): Promise<Address | null> {
  try {
    return await recoverAddress({ hash: card.wrappedDigest, signature });
  } catch {
    return null;
  }
}
