// Test-side helpers for the write mock: a funded, registered trader with a deployed XO account, the signatures
// the gateway checks (L1 ClobAuth, order, L2 HMAC) and the HTTP calls. Used by this directory's tests and meant
// for the relay streams' tests too. Keys are the public Anvil/Hardhat TEST keys (chain.owner(i)); nothing here
// signs anything real.
//
// These helpers sign with viem and the mock's own digests (verify.ts). The production signer
// (src/xo/signing) is cross-checked against the mock in write-crosscheck.test.ts, not here.

import { concat, encodeAbiParameters, getAddress, keccak256, slice, toHex, type Address, type Hex } from "viem";
import type { HDAccount } from "viem/accounts";

import { deriveAccount } from "../../src/xo/account/derive.js";
import { ECDSA_VALIDATOR, KERNEL_FACTORY } from "../../src/xo/chain/constants.js";
import { buildInitCode } from "../../src/xo/account/derive.js";
import { hmacSignature, type HmacDecode } from "./wire.js";
import type { MockXo } from "./server.js";
import { accountKey, type AccountKey } from "./state.js";
import { clobAuthDigest, kernelWrappedDigest, orderDigest, type ParsedOrder } from "./verify.js";
import { deployOwner, getJson } from "./testing.js";

export const ZERO_ADDRESS = getAddress(`0x${"00".repeat(20)}`);
export const ZERO_BYTES16: Hex = `0x${"00".repeat(16)}`;
export const ZERO_BYTES32: Hex = `0x${"00".repeat(32)}`;

export interface Trader {
  readonly index: number;
  readonly owner: HDAccount;
  readonly account: Address;
  readonly key: AccountKey;
}

export interface TraderOptions {
  // Enable Trading in the deploying UserOp (default true).
  readonly enableTrading?: boolean;
  // Register the account with the orderbook by hand (state.forceRegistered; default true).
  readonly register?: boolean;
  // Orderbook collateral in micro USDC (balance, allowance and cash); default 100 USDC. 0 funds nothing.
  readonly fundMicro?: bigint;
}

export function traderFor(mock: MockXo, index: number): Trader {
  const chain = mock.chains.xo;
  if (chain === undefined) throw new Error("the mock has no XO chain");
  const owner = chain.owner(index);
  const account = deriveAccount(owner.address);
  return { index, owner, account, key: accountKey(account) };
}

// Deploys the account on the local chain (sponsored UserOp), registers it and funds its orderbook balance.
export async function setupTrader(mock: MockXo, index: number, options: TraderOptions = {}): Promise<Trader> {
  await deployOwner(mock, index, { enableTrading: options.enableTrading ?? true });
  const trader = traderFor(mock, index);
  if (options.register !== false) mock.state.forceRegistered(trader.account);
  const fund = options.fundMicro ?? 100_000_000n;
  if (fund > 0n) mock.state.setBalance(trader.account, { balanceMicro: fund, allowanceMicro: fund, cashBalanceMicro: fund });
  return trader;
}

// ---- signing --------------------------------------------------------------------------------------------------------------

export type DigestForm = "raw" | "eip191";
export type WirePrefix = "0x01" | "0x00";

export interface SignOptions {
  readonly form?: DigestForm;
  readonly prefix?: WirePrefix;
  // Sign with another key (a wrong-owner test).
  readonly signer?: HDAccount;
}

// The owner signs the Kernel-wrapped digest, raw or as an EIP-191 message over its 32 bytes, and the wire
// signature is 0x01 + validator + sig65 (86 bytes) or 0x00 + sig65 (66 bytes).
export async function signWrapped(trader: Trader, inner: Hex, options: SignOptions = {}): Promise<Hex> {
  const wrapped = kernelWrappedDigest(inner, trader.account);
  const signer = options.signer ?? trader.owner;
  const sig65 = (options.form ?? "eip191") === "raw" ? await signer.sign({ hash: wrapped }) : await signer.signMessage({ message: { raw: wrapped } });
  return (options.prefix ?? "0x01") === "0x01" ? (`0x01${ECDSA_VALIDATOR.slice(2).toLowerCase()}${sig65.slice(2)}` as Hex) : (`0x00${sig65.slice(2)}` as Hex);
}

// ERC-6492: abi.encode(factory, factoryCalldata, innerSignature) ++ the 32-byte suffix. The inner signature is the
// usual wire signature; the factory data is the account's real createAccount calldata.
export function wrapErc6492(trader: Trader, inner: Hex): Hex {
  const factoryCalldata = slice(buildInitCode(trader.owner.address), 20);
  return concat([encodeAbiParameters([{ type: "address" }, { type: "bytes" }, { type: "bytes" }], [KERNEL_FACTORY, factoryCalldata, inner]), `0x${"6492".repeat(16)}` as Hex]);
}

export interface L1Options extends SignOptions {
  // Unix seconds as a string; default the mock clock.
  readonly timestamp?: string;
  readonly nonce?: bigint;
  // Replaces the signature with these bytes.
  readonly signature?: Hex;
}

export async function l1Headers(mock: MockXo, trader: Trader, options: L1Options = {}): Promise<Record<string, string>> {
  const timestamp = options.timestamp ?? String(mock.clock.nowSeconds());
  const nonce = options.nonce ?? 0n;
  const signature = options.signature ?? (await signWrapped(trader, clobAuthDigest(trader.account, timestamp, nonce), options));
  return { xo_address: trader.account, xo_signature: signature, xo_timestamp: timestamp, xo_nonce: nonce.toString() };
}

export interface Credentials {
  readonly apiKey: string;
  readonly secret: string;
  readonly passphrase: string;
}

export interface L2Variant {
  // What the CLIENT signs: the request target and how the secret is decoded and the output formatted.
  readonly target: "path-with-query" | "path-only";
  readonly decode: HmacDecode;
  // Send XO_ADDRESS as well.
  readonly address: boolean;
}

// The variant that the mock's CURRENT switches expect, so a test that is not about the variants just works.
export function expectedVariant(mock: MockXo): L2Variant {
  return {
    target: mock.switches.get("hmac.target"),
    decode: mock.switches.get("hmac.decode"),
    address: mock.switches.get("l2.xo_address") === "required",
  };
}

export interface L2Options {
  readonly variant?: Partial<L2Variant>;
  readonly timestamp?: string;
  readonly passphrase?: string;
  // Replaces the signature.
  readonly signature?: string;
  readonly body?: string;
  readonly headers?: Record<string, string>;
}

export function l2Headers(mock: MockXo, trader: Trader, creds: Credentials, method: string, pathWithQuery: string, options: L2Options = {}): Record<string, string> {
  const variant: L2Variant = { ...expectedVariant(mock), ...options.variant };
  const timestamp = options.timestamp ?? String(mock.clock.nowSeconds());
  const target = variant.target === "path-only" ? (pathWithQuery.split("?")[0] as string) : pathWithQuery;
  const signature = options.signature ?? hmacSignature(creds.secret, variant.decode, `${timestamp}${method.toUpperCase()}${target}${options.body ?? ""}`);
  return {
    xo_api_key: creds.apiKey,
    xo_timestamp: timestamp,
    xo_passphrase: options.passphrase ?? creds.passphrase,
    xo_signature: signature,
    ...(variant.address ? { xo_address: trader.account } : {}),
    ...options.headers,
  };
}

// ---- HTTP -------------------------------------------------------------------------------------------------------------------------

export type Reply = Awaited<ReturnType<typeof getJson>>;

export async function postJson(mock: MockXo, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Reply> {
  return getJson(mock, "orderbook", path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
}

// An L2-authenticated call with the variant the mock expects (or a given one).
export async function l2Call(mock: MockXo, trader: Trader, creds: Credentials, method: string, path: string, body?: unknown, options: L2Options = {}): Promise<Reply> {
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const headers = l2Headers(mock, trader, creds, method, path, { ...options, body: text });
  return getJson(mock, "orderbook", path, { method, headers: { ...(text === "" ? {} : { "content-type": "application/json" }), ...headers }, ...(text === "" ? {} : { body: text }) });
}

// Mints the account's key over HTTP with a real L1 signature (the mock's switches decide whether that works).
export async function createCredentials(mock: MockXo, trader: Trader, options: L1Options = {}): Promise<Credentials> {
  const reply = await getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: await l1Headers(mock, trader, options) });
  if (reply.status !== 200) throw new Error(`POST /auth/api-key answered ${String(reply.status)}: ${reply.text}`);
  return reply.body as Credentials;
}

// ---- orders -------------------------------------------------------------------------------------------------------------------------

export interface OrderSpec {
  readonly tokenId: string;
  readonly side: "BUY" | "SELL";
  // Integer tick, 1 to 999.
  readonly tick: number;
  // Shares in micro units (a multiple of 1,000 for the grid).
  readonly sharesMicro: bigint;
  readonly orderType?: "GTC" | "GTD" | "FOK" | "FAK";
  readonly postOnly?: boolean;
  // Seconds from the mock clock; default 600. Ignored when `expiration` is given.
  readonly ttlSeconds?: number;
  readonly expiration?: bigint;
  readonly salt?: bigint;
  readonly nonce?: bigint;
  readonly signatureType?: number;
  // Override the wire amounts (a bad-grid test).
  readonly makerAmount?: bigint;
  readonly takerAmount?: bigint;
  readonly sign?: SignOptions;
  readonly signature?: Hex;
  readonly maker?: Address;
  readonly signer?: Address;
}

export interface BuiltOrder {
  readonly wire: Record<string, unknown>;
  readonly parsed: ParsedOrder;
  readonly hash: Hex;
  readonly signature: Hex;
  readonly body: string;
}

let saltCounter = 0n;

export async function buildOrder(mock: MockXo, trader: Trader, spec: OrderSpec): Promise<BuiltOrder> {
  const collateral = (spec.sharesMicro * BigInt(spec.tick)) / 1000n;
  const buy = spec.side === "BUY";
  saltCounter += 1n;
  const parsed: ParsedOrder = {
    salt: spec.salt ?? 1_000_000n + saltCounter,
    maker: spec.maker ?? trader.account,
    signer: spec.signer ?? trader.account,
    beneficiary: ZERO_ADDRESS,
    tokenId: BigInt(spec.tokenId),
    makerAmount: spec.makerAmount ?? (buy ? collateral : spec.sharesMicro),
    takerAmount: spec.takerAmount ?? (buy ? spec.sharesMicro : collateral),
    expiration: spec.expiration ?? BigInt(mock.clock.nowSeconds() + (spec.ttlSeconds ?? 600)),
    nonce: spec.nonce ?? 0n,
    identifier: ZERO_BYTES16,
    metadata: ZERO_BYTES32,
    side: buy ? 0 : 1,
    signatureType: spec.signatureType ?? 3,
  };
  const hash = orderDigest(parsed);
  const signature = spec.signature ?? (await signWrapped(trader, hash, spec.sign));
  const wire = {
    salt: parsed.salt.toString(),
    maker: parsed.maker,
    signer: parsed.signer,
    beneficiary: parsed.beneficiary,
    tokenId: parsed.tokenId.toString(),
    makerAmount: parsed.makerAmount.toString(),
    takerAmount: parsed.takerAmount.toString(),
    expiration: parsed.expiration.toString(),
    nonce: parsed.nonce.toString(),
    identifier: parsed.identifier,
    metadata: parsed.metadata,
    side: parsed.side,
    signatureType: parsed.signatureType,
    signature,
  };
  const orderType = spec.orderType ?? "GTD";
  const body = JSON.stringify({ order: wire, orderType, ...(spec.postOnly === true ? { postOnly: true } : {}) });
  return { wire, parsed, hash, signature, body };
}

// POST /order with the L2 headers when credentials are given. The signed order goes out as built.
export async function placeOrder(mock: MockXo, trader: Trader, creds: Credentials | undefined, spec: OrderSpec, options: L2Options = {}): Promise<{ built: BuiltOrder; reply: Reply }> {
  const built = await buildOrder(mock, trader, spec);
  const headers = creds === undefined ? {} : l2Headers(mock, trader, creds, "POST", "/order", { ...options, body: built.body });
  return { built, reply: await postJson(mock, "/order", built.body, headers) };
}

export function marketTokens(mock: MockXo, seed: string): { readonly yes: string; readonly no: string; readonly conditionId: string } {
  const market = mock.state.markets.find((entry) => entry.seed === seed);
  if (market === undefined) throw new Error(`no market with seed ${seed}`);
  return { yes: market.yesTokenId, no: market.noTokenId, conditionId: market.conditionId };
}

export const hashOf = (text: string): Hex => keccak256(toHex(text));
