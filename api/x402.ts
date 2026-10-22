import { encodeFunctionData, getAddress, hashDomain, hashTypedData, recoverAddress, type Address, type Hex } from "viem";
import * as z from "zod/v4";

import { LIMITLESS_PINS } from "../sdk/chain/limitless/constants.js";
import { checkPin, pinFailureText, type ContractPin } from "../sdk/chain/pins.js";
import type { RpcPort } from "../sdk/chain/rpc.js";
import type { FetchLike } from "../sdk/model.js";
import type { PaymentsConfig, X402Network } from "./config.js";

// The server side of x402 (docs/sdk-and-api-design.md section 4: "x402 per call, USDC on Base"), written from the
// specification, with no x402 package (none can be added without a dependency). Sources, all read 2026-10-22 at commit
// 0e6e8c55d86b4f14234fb6e49a4052074fb93e57 of github.com/coinbase/x402 (the specification names its home as
// github.com/x402-foundation/x402):
//   - specs/x402-specification-v2.md: PaymentRequired (5.1), PaymentPayload (5.2), SettlementResponse (5.3),
//     VerifyResponse (5.4), the "authorization" payment flow verify -> resource -> settle (6.1), the facilitator's
//     POST /verify and POST /settle with { x402Version, paymentPayload, paymentRequirements } (7.1, 7.2), the error codes (9);
//   - specs/transports-v2/http.md: 402 with the base64 PAYMENT-REQUIRED header, the client's base64 PAYMENT-SIGNATURE header,
//     the base64 PAYMENT-RESPONSE header on the answer; a malformed payment is 400, a failed one 402;
//   - specs/schemes/exact/scheme_exact.md and scheme_exact_evm.md: "exact" on EVM through EIP-3009
//     transferWithAuthorization (assetTransferMethod "eip3009", the default), extra.name and extra.version being the token's
//     EIP-712 domain name and version; "authorization SHOULD be preferred ... a failed handler leaves the client uncharged";
//   - specs/extensions/bazaar.md: the discovery extension a 402 carries (listing.ts builds it);
//   - EIP-3009 (eips.ethereum.org/EIPS/eip-3009): TransferWithAuthorization(address from,address to,uint256 value,
//     uint256 validAfter,uint256 validBefore,bytes32 nonce).
//
// Only protocol version 2, scheme "exact", method eip3009, network Base mainnet and the pinned USDC are accepted; a payload
// for anything else is refused before the facilitator is asked.
//
// Signatures, EOA and smart-contract wallets alike: the payment is settled by USDC's own transferWithAuthorization, so this
// server checks the signature exactly as that contract will. USDC on Base is FiatTokenV2_2 (the proxy's implementation,
// pinned below, is Sourcify's exact match of FiatTokenV2_2 and carries the overload
// transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes), selector 0xcf092995). Its
// EIP3009._requireValidSignature calls SignatureChecker.isValidSignatureNow(from, digest, signature)
// (github.com/circlefin/stablecoin-evm contracts/util/SignatureChecker.sol and contracts/v2/EIP3009.sol, read 2026-10-22 at
// commit fc85788bc7c23cefe3df1a757133048bfddadeaa): when `from` has no code, ECRecover of the digest must give `from`; when it
// has code (a deployed smart account, or an EIP-7702 delegated account), `from.isValidSignature(digest, signature)` must
// return the ERC-1271 magic value 0x1626ba7e. createChainSignatureVerifier makes the same two reads on Base through the SDK's
// RPC port. ERC-6492 (a signature for a wallet not deployed yet) is refused: neither the x402 exact-EVM scheme nor USDC's
// SignatureChecker handles it, so such a payment could not settle. The x402 specification itself names no smart-wallet rule
// for eip3009 (its smart-account path is the separate erc7710 method, which this server does not offer).

export const X402_VERSION = 2;
export const HEADER_PAYMENT_REQUIRED = "payment-required";
export const HEADER_PAYMENT_SIGNATURE = "payment-signature";
export const HEADER_PAYMENT_RESPONSE = "payment-response";

// How long a client has to complete a payment after the 402 (PaymentRequirements.maxTimeoutSeconds).
export const MAX_TIMEOUT_SECONDS = 60;
// An authorization must stay valid at least this long after it reaches us, so the settlement can still land.
export const SETTLE_MARGIN_S = 10;
// An authorization valid for longer than this is refused: its nonce row is kept until it expires.
export const MAX_AUTHORIZATION_WINDOW_S = 3_600;
// A smart account's signature can be long (WebAuthn, multisig); the header is capped all the same.
export const MAX_PAYMENT_HEADER_CHARS = 12_000;
export const MAX_SIGNATURE_BYTES = 2_048;

// USDC on Base mainnet. The address and its runtime code hash are the SDK's pin (sdk/chain/limitless/constants.ts
// LIMITLESS_PINS.usdc: the address from Limitless's contract list, code read with eth_getCode on 2026-10-22 and equal to
// Sourcify's exact match of FiatTokenProxy). The EIP-712 domain was read from the contract on 2026-10-22 with eth_call over
// base-rpc.publicnode.com: name() "USD Coin", version() "2", decimals() 6, DOMAIN_SEPARATOR() below, which equals the hash
// of that domain on chain 8453 (test/api/x402.test.ts recomputes it). Before the first payment is taken, the code, the chain
// and the domain separator are checked again on chain (checkPaymentAsset); a change disables payments.
export interface PaymentAsset {
  readonly network: X402Network;
  readonly chainId: number;
  readonly address: Address;
  readonly pin: ContractPin;
  readonly decimals: number;
  readonly eip712: { readonly name: string; readonly version: string };
  readonly domainSeparator: Hex;
}

export const BASE_USDC: PaymentAsset = Object.freeze({
  network: "eip155:8453",
  chainId: 8453,
  address: getAddress(LIMITLESS_PINS.usdc.address),
  pin: LIMITLESS_PINS.usdc,
  decimals: 6,
  eip712: Object.freeze({ name: "USD Coin", version: "2" }),
  domainSeparator: "0x02fa7265e7c5d81118673727957699e4d68f74cd74b7db77da710fe8a2c7834f",
});

// The FiatTokenProxy's implementation, as its implementation() getter named it on 2026-10-22, with the keccak256 and size of
// the runtime code eth_getCode returned for it over base-rpc.publicnode.com that day; Sourcify's exact match of
// FiatTokenV2_2 for chain 8453 holds the same on-chain code. Which code checks a payer's signature depends on it, so the
// asset check refuses payments when the proxy names another implementation or the code changed.
export const BASE_USDC_IMPLEMENTATION: ContractPin = Object.freeze({
  chainId: 8453,
  name: "USDC (Base) implementation FiatTokenV2_2",
  address: getAddress("0x2ce6311ddae708829bc0784c967b7d77d19fd779"),
  codeHash: "0x11b75a237997ab8328f65b2d5a55c10f0346d0a175741ed42ddf4f2c66b9e873",
  codeSize: 23_464,
  implementation: null,
  source: "implementation() of the pinned USDC FiatTokenProxy on Base, read 2026-10-22",
  verified: "Sourcify exact_match (FiatTokenV2_2); its on-chain code equals eth_getCode",
  readOn: "2026-10-22",
});

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export function assetDomain(asset: PaymentAsset) {
  return { name: asset.eip712.name, version: asset.eip712.version, chainId: asset.chainId, verifyingContract: asset.address } as const;
}

export function domainSeparatorOf(asset: PaymentAsset): Hex {
  return hashDomain({
    domain: { ...assetDomain(asset), chainId: BigInt(asset.chainId) },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
    },
  });
}

// ---- wire types ----------------------------------------------------------------------------------------------------------

export interface PaymentRequirements {
  readonly scheme: "exact";
  readonly network: X402Network;
  // Atomic units of the asset, as a decimal string.
  readonly amount: string;
  readonly asset: Address;
  readonly payTo: Address;
  readonly maxTimeoutSeconds: number;
  readonly extra: { readonly name: string; readonly version: string };
}

export interface ResourceInfo {
  readonly url: string;
  readonly description: string;
  readonly mimeType: "application/json";
  readonly serviceName?: string;
  readonly tags?: readonly string[];
}

export interface PaymentRequired {
  readonly x402Version: 2;
  readonly error: string;
  readonly resource: ResourceInfo;
  readonly accepts: readonly PaymentRequirements[];
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export function requirementsFor(payments: PaymentsConfig, amount: bigint, asset: PaymentAsset = BASE_USDC): PaymentRequirements {
  if (payments.network !== asset.network) throw new Error("the configured network has no pinned asset");
  return Object.freeze({
    scheme: "exact",
    network: payments.network,
    amount: amount.toString(),
    asset: asset.address,
    payTo: payments.payTo,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: Object.freeze({ name: asset.eip712.name, version: asset.eip712.version }),
  });
}

export function encodeHeader(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

const uintString = z.string().regex(/^(0|[1-9][0-9]{0,77})$/);
const hexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const requirementsSchema = z
  .object({
    scheme: z.string().max(40),
    network: z.string().max(80),
    amount: uintString,
    asset: z.string().max(80),
    payTo: z.string().max(80),
    maxTimeoutSeconds: z.int().min(1).max(86_400),
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const paymentPayloadSchema = z
  .object({
    x402Version: z.literal(X402_VERSION),
    resource: z.object({ url: z.string().max(2_048) }).loose().optional(),
    accepted: requirementsSchema,
    payload: z
      .object({
        // 65 bytes (r || s || v) from a plain key, or a smart account's ERC-1271 signature of any length up to the cap.
        signature: z.string().regex(new RegExp(`^0x(?:[0-9a-fA-F]{2}){1,${MAX_SIGNATURE_BYTES}}$`)),
        authorization: z
          .object({
            from: hexAddress,
            to: hexAddress,
            value: uintString,
            validAfter: uintString,
            validBefore: uintString,
            nonce: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
          })
          .strict(),
      })
      .strict(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type PaymentPayload = z.infer<typeof paymentPayloadSchema>;

// The PAYMENT-SIGNATURE header to a payload, or null when it is not base64 JSON of the v2 exact-EVM shape.
export function decodePaymentHeader(raw: string | string[] | undefined): PaymentPayload | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PAYMENT_HEADER_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = paymentPayloadSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

// ---- the local checks ------------------------------------------------------------------------------------------------------

// The specification's error codes (section 9) this server answers with, plus invalid_payment_requirements for a payload whose
// `accepted` is not exactly what this server asked for (another asset, timeout or domain).
export type X402Reason =
  | "invalid_payload"
  | "invalid_payment_requirements"
  | "invalid_scheme"
  | "invalid_network"
  | "invalid_x402_version"
  | "invalid_exact_evm_payload_recipient_mismatch"
  | "invalid_exact_evm_payload_authorization_value_mismatch"
  | "invalid_exact_evm_payload_authorization_valid_after"
  | "invalid_exact_evm_payload_authorization_valid_before"
  | "invalid_exact_evm_payload_signature";

export type LocalCheck =
  | { readonly ok: true; readonly payer: Address; readonly nonce: Hex; readonly validBeforeS: number }
  | { readonly ok: false; readonly reason: X402Reason; readonly message: string };

const fail = (reason: X402Reason, message: string): LocalCheck => ({ ok: false, reason, message });
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

// Everything this server can check without the facilitator: the requirements the client accepted are exactly the ones
// asked for (scheme, network, asset, payTo, amount, timeout, token domain); the authorization pays exactly that amount to
// that address, is valid now and for long enough, and is signed by its `from` under the pinned token's EIP-712 domain as USDC
// will check it (`verifySignature`: createChainSignatureVerifier, an EOA's ECDSA or a contract wallet's ERC-1271).
export async function checkPaymentLocally(payload: PaymentPayload, expected: PaymentRequirements, resourcePath: string, nowS: number, verifySignature: SignatureVerifier, asset: PaymentAsset = BASE_USDC): Promise<LocalCheck> {
  const accepted = payload.accepted;
  if (accepted.scheme !== expected.scheme) return fail("invalid_scheme", "Only the exact scheme is accepted.");
  if (accepted.network !== expected.network) return fail("invalid_network", `Only ${expected.network} is accepted.`);
  if (!same(accepted.asset, expected.asset)) return fail("invalid_payment_requirements", "The payment is in another asset than the pinned USDC.");
  if (!same(accepted.payTo, expected.payTo)) return fail("invalid_exact_evm_payload_recipient_mismatch", "The payment names another recipient.");
  if (accepted.amount !== expected.amount) return fail("invalid_exact_evm_payload_authorization_value_mismatch", "The payment is for another amount than this endpoint's price.");
  const extra = accepted.extra ?? {};
  const method = extra["assetTransferMethod"];
  if (accepted.maxTimeoutSeconds !== expected.maxTimeoutSeconds || extra["name"] !== expected.extra.name || extra["version"] !== expected.extra.version || (method !== undefined && method !== "eip3009")) {
    return fail("invalid_payment_requirements", "The accepted requirements differ from the ones this endpoint states.");
  }
  if (payload.resource !== undefined) {
    let path: string;
    try {
      path = new URL(payload.resource.url).pathname;
    } catch {
      return fail("invalid_payload", "The payment's resource URL is not a URL.");
    }
    if (path !== resourcePath) return fail("invalid_payload", "The payment was made for another resource.");
  }
  const auth = payload.payload.authorization;
  if (!same(auth.to, expected.payTo)) return fail("invalid_exact_evm_payload_recipient_mismatch", "The authorization pays another address.");
  if (auth.value !== expected.amount) return fail("invalid_exact_evm_payload_authorization_value_mismatch", "The authorization is for another amount.");
  const validAfter = BigInt(auth.validAfter);
  const validBefore = BigInt(auth.validBefore);
  const now = BigInt(nowS);
  if (validAfter > now) return fail("invalid_exact_evm_payload_authorization_valid_after", "The authorization is not valid yet.");
  if (validBefore <= now + BigInt(SETTLE_MARGIN_S)) return fail("invalid_exact_evm_payload_authorization_valid_before", "The authorization has expired, or expires too soon to settle.");
  if (validBefore > now + BigInt(MAX_AUTHORIZATION_WINDOW_S)) return fail("invalid_payload", `The authorization is valid for more than ${MAX_AUTHORIZATION_WINDOW_S} s.`);
  const signature = payload.payload.signature.toLowerCase() as Hex;
  if (signature.endsWith(ERC6492_MAGIC)) return fail("invalid_exact_evm_payload_signature", "An ERC-6492 signature (a wallet not deployed yet) cannot settle through USDC's transferWithAuthorization; deploy the wallet first.");
  // Addresses are hashed as bytes: their letter case (an EIP-55 checksum or none) does not change the digest.
  const from = getAddress(auth.from.toLowerCase());
  const digest = transferDigest(asset, { from, to: getAddress(auth.to.toLowerCase()), value: BigInt(auth.value), validAfter, validBefore, nonce: auth.nonce.toLowerCase() as Hex });
  // Thrown when the chain cannot be asked; the caller answers 503 and charges nothing.
  const verdict = await verifySignature(from, digest, signature);
  if (!verdict.ok) return fail("invalid_exact_evm_payload_signature", verdict.reason);
  return { ok: true, payer: from, nonce: auth.nonce.toLowerCase() as Hex, validBeforeS: Number(validBefore) };
}

// ---- the signature, as USDC checks it ------------------------------------------------------------------------------------

// ERC-6492's magic suffix (eips.ethereum.org/EIPS/eip-6492): 32 bytes of 0x6492 repeated.
export const ERC6492_MAGIC = "6492".repeat(16);
export const ERC1271_MAGIC = "0x1626ba7e";

export interface TransferAuthorization {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly validAfter: bigint;
  readonly validBefore: bigint;
  readonly nonce: Hex;
}

// The EIP-712 digest of TransferWithAuthorization under the token's domain: what USDC hands to SignatureChecker.
export function transferDigest(asset: PaymentAsset, authorization: TransferAuthorization): Hex {
  return hashTypedData({ domain: assetDomain(asset), types: TRANSFER_WITH_AUTHORIZATION_TYPES, primaryType: "TransferWithAuthorization", message: authorization });
}

export type SignatureVerdict = { readonly ok: true; readonly kind: "eoa" | "erc1271" } | { readonly ok: false; readonly reason: string };
// Throws when the chain cannot be asked (no verdict).
export type SignatureVerifier = (from: Address, digest: Hex, signature: Hex) => Promise<SignatureVerdict>;

const IS_VALID_SIGNATURE_ABI = [
  { type: "function", name: "isValidSignature", stateMutability: "view", inputs: [{ name: "hash", type: "bytes32" }, { name: "signature", type: "bytes" }], outputs: [{ name: "magicValue", type: "bytes4" }] },
] as const;

// SignatureChecker.isValidSignatureNow, read on chain: no code at `from` -> ECDSA recovery must give `from`; code -> the
// account's isValidSignature(digest, signature) must return the ERC-1271 magic value in the first word of its answer.
export function createChainSignatureVerifier(port: RpcPort): SignatureVerifier {
  return async (from, digest, signature) => {
    const code = await port.getCode(from);
    if (code === "0x") {
      if (signature.length !== 2 + 130) return { ok: false, reason: "The payer has no contract code, so its signature must be a 65-byte ECDSA signature." };
      let signer: Address;
      try {
        signer = await recoverAddress({ hash: digest, signature });
      } catch {
        return { ok: false, reason: "The signature does not recover." };
      }
      return signer.toLowerCase() === from.toLowerCase() ? { ok: true, kind: "eoa" } : { ok: false, reason: "The signature is not the payer's." };
    }
    const data = encodeFunctionData({ abi: IS_VALID_SIGNATURE_ABI, functionName: "isValidSignature", args: [digest, signature] });
    const [result] = await port.callMany([{ to: from, data }]);
    if (result === undefined || (!result.ok && result.kind === "error")) throw new Error("the payer's isValidSignature could not be asked");
    if (!result.ok) return { ok: false, reason: "The payer's wallet refused the signature (isValidSignature reverted)." };
    const word = result.data.toLowerCase();
    if (word.length < 66 || word.slice(0, 66) !== `${ERC1271_MAGIC}${"0".repeat(56)}`) return { ok: false, reason: "The payer's wallet did not return the ERC-1271 magic value for this signature." };
    return { ok: true, kind: "erc1271" };
  };
}

// ---- the facilitator -------------------------------------------------------------------------------------------------------

export type VerifyOutcome =
  | { readonly kind: "valid"; readonly payer: string | null }
  | { readonly kind: "invalid"; readonly reason: string }
  | { readonly kind: "error"; readonly detail: string };

export interface SettlementResponse {
  readonly success: boolean;
  readonly errorReason?: string;
  readonly payer?: string;
  readonly transaction: string;
  readonly network: string;
  readonly amount?: string;
}

export type SettleOutcome =
  | { readonly kind: "settled"; readonly response: SettlementResponse }
  // settlement_pending (section 9): broadcast, confirmation not established; the transaction may still land.
  | { readonly kind: "pending"; readonly response: SettlementResponse }
  | { readonly kind: "failed"; readonly response: SettlementResponse }
  | { readonly kind: "error"; readonly detail: string };

export interface Facilitator {
  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyOutcome>;
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleOutcome>;
}

const verifyResponseSchema = z.object({ isValid: z.boolean(), invalidReason: z.string().max(200).optional(), payer: z.string().max(80).optional() }).loose();
const settleResponseSchema = z
  .object({
    success: z.boolean(),
    errorReason: z.string().max(200).optional(),
    payer: z.string().max(80).optional(),
    transaction: z.string().max(200),
    network: z.string().max(80),
    amount: z.string().max(80).optional(),
  })
  .loose();
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

// The facilitator over the API's honest fetch (no credential is sent: a facilitator that needs one is not supported here).
export function createFacilitator(baseUrl: string, fetch: FetchLike): Facilitator {
  async function post(path: "/verify" | "/settle", payload: PaymentPayload, requirements: PaymentRequirements): Promise<{ status: number; body: unknown } | { error: string }> {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ x402Version: X402_VERSION, paymentPayload: payload, paymentRequirements: requirements }),
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      return { status: response.status, body };
    } catch (error) {
      return { error: error instanceof Error ? error.name : "error" };
    }
  }
  return {
    async verify(payload, requirements) {
      const answer = await post("/verify", payload, requirements);
      if ("error" in answer) return { kind: "error", detail: `the facilitator could not be reached (${answer.error})` };
      const parsed = verifyResponseSchema.safeParse(answer.body);
      if (!parsed.success) return { kind: "error", detail: `the facilitator's /verify answer (${answer.status}) did not have the specified shape` };
      if (parsed.data.isValid && answer.status === 200) return { kind: "valid", payer: parsed.data.payer ?? null };
      if (!parsed.data.isValid) return { kind: "invalid", reason: parsed.data.invalidReason ?? "invalid" };
      return { kind: "error", detail: `the facilitator's /verify answered ${answer.status}` };
    },
    async settle(payload, requirements) {
      const answer = await post("/settle", payload, requirements);
      if ("error" in answer) return { kind: "error", detail: `the facilitator could not be reached (${answer.error})` };
      const parsed = settleResponseSchema.safeParse(answer.body);
      if (!parsed.success) return { kind: "error", detail: `the facilitator's /settle answer (${answer.status}) did not have the specified shape` };
      const response: SettlementResponse = {
        success: parsed.data.success,
        transaction: parsed.data.transaction,
        network: parsed.data.network,
        ...(parsed.data.errorReason === undefined ? {} : { errorReason: parsed.data.errorReason }),
        ...(parsed.data.payer === undefined ? {} : { payer: parsed.data.payer }),
        ...(parsed.data.amount === undefined ? {} : { amount: parsed.data.amount }),
      };
      if (response.network !== requirements.network) return { kind: "error", detail: "the facilitator settled on another network" };
      if (response.success) {
        if (answer.status !== 200 || !TX_HASH.test(response.transaction)) return { kind: "error", detail: "the facilitator reported success without a transaction hash" };
        if (response.amount !== undefined && response.amount !== requirements.amount) return { kind: "error", detail: "the facilitator settled another amount" };
        return { kind: "settled", response };
      }
      if (response.errorReason === "settlement_pending" && TX_HASH.test(response.transaction)) return { kind: "pending", response };
      return { kind: "failed", response };
    },
  };
}

// ---- the asset, on chain ---------------------------------------------------------------------------------------------------

export type AssetCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

const DOMAIN_SEPARATOR_SELECTOR = "0x3644e515";
const IMPLEMENTATION_SELECTOR = "0x5c60da1b";
const DECIMALS_SELECTOR = "0x313ce567";

// The pinned USDC is what the chain holds: the chain id, the proxy's code hash, the EIP-712 domain separator, the decimals and
// the implementation the proxy names (address and code hash: it is the code that checks signatures). A
// mismatch is a verdict (payments stay off); an unreachable RPC is thrown, so it is asked again later.
export async function checkPaymentAsset(port: RpcPort, asset: PaymentAsset = BASE_USDC, implementation: ContractPin | null = BASE_USDC_IMPLEMENTATION): Promise<AssetCheck> {
  if ((await port.chainId()) !== asset.chainId) return { ok: false, reason: "the RPC endpoint is not on the asset's chain" };
  const pin = await checkPin(port, asset.pin);
  if (!pin.ok) return { ok: false, reason: pinFailureText(pin) };
  const separator = (await port.call({ to: asset.address, data: DOMAIN_SEPARATOR_SELECTOR })).toLowerCase();
  if (separator !== asset.domainSeparator || domainSeparatorOf(asset) !== asset.domainSeparator) return { ok: false, reason: "the token's EIP-712 domain separator is not the pinned one" };
  const decimals = await port.call({ to: asset.address, data: DECIMALS_SELECTOR });
  if (BigInt(decimals) !== BigInt(asset.decimals)) return { ok: false, reason: "the token's decimals are not the pinned ones" };
  if (implementation !== null) {
    const named = (await port.call({ to: asset.address, data: IMPLEMENTATION_SELECTOR })).toLowerCase();
    if (named !== `0x${"0".repeat(24)}${implementation.address.slice(2).toLowerCase()}`) return { ok: false, reason: "the token's proxy names an implementation that was not pinned" };
    const code = await checkPin(port, implementation);
    if (!code.ok) return { ok: false, reason: pinFailureText(code) };
  }
  return { ok: true };
}
