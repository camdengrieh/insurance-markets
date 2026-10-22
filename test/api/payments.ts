import { readFileSync } from "node:fs";
import { join } from "node:path";

import { decodeFunctionData, keccak256, recoverTypedDataAddress, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { FetchLike, FetchResponseLike } from "../../sdk/model.js";
import { assetDomain, BASE_USDC, BASE_USDC_IMPLEMENTATION, encodeHeader, TRANSFER_WITH_AUTHORIZATION_TYPES, type PaymentPayload, type PaymentRequired, type PaymentRequirements } from "../../api/x402.js";

// Test support for x402: a fake Base RPC that answers what the real USDC contract answered on 2026-10-22 (its recorded
// runtime code, test/fixtures/chain-bytecode/base/base-usdc.hex, and its domain separator and decimals), a fake facilitator
// that checks a payment as the specification asks and records every call, and EIP-3009 payloads signed by keys generated in
// the test. No real key, facilitator or chain is used.

const REPO = join(import.meta.dirname, "..", "..");
const USDC_CODE = readFileSync(join(REPO, "test/fixtures/chain-bytecode/base/base-usdc.hex"), "utf8").trim();
// The proxy's implementation, recorded 2026-10-22 (test/api/fixtures/base-usdc-implementation_2026-10-22.json says how).
const USDC_IMPLEMENTATION_CODE = readFileSync(join(REPO, "test/api/fixtures/base-usdc-implementation_2026-10-22.hex"), "utf8").trim();

const IS_VALID_SIGNATURE_ABI = [
  { type: "function", name: "isValidSignature", stateMutability: "view", inputs: [{ name: "hash", type: "bytes32" }, { name: "signature", type: "bytes" }], outputs: [{ name: "magicValue", type: "bytes4" }] },
] as const;

// A fake smart-contract wallet: some code at its address and an ERC-1271 answer the test decides. "magic" returns
// 0x1626ba7e, "wrong" another value, "revert" reverts.
export interface FakeWallet {
  readonly address: Address;
  readonly answer: (digest: Hex, signature: Hex) => "magic" | "wrong" | "revert";
  readonly calls: Array<{ readonly digest: Hex; readonly signature: Hex }>;
}

function jsonResponse(body: unknown, status = 200): FetchResponseLike {
  const text = JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, headers: { get: (name) => (name.toLowerCase() === "content-type" ? "application/json" : null) }, json: async () => JSON.parse(text) as unknown, text: async () => text };
}

export interface FakeChainOptions {
  readonly chainId?: number;
  readonly code?: string;
  readonly domainSeparator?: Hex;
  readonly implementation?: Address;
  readonly wallets?: readonly FakeWallet[];
  // Every request fails at the transport (an unreachable RPC).
  readonly down?: boolean;
}

// A Base JSON-RPC endpoint holding the pinned USDC as recorded (or a changed one, for the refusal tests).
export function fakeBaseRpc(options: FakeChainOptions = {}): { readonly fetch: FetchLike; readonly calls: string[]; readonly state: { down: boolean } } {
  const state = { down: options.down === true };
  const calls: string[] = [];
  const one = (request: { id: unknown; method: string; params: unknown[] }): unknown => {
    calls.push(request.method);
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id: request.id, result });
    switch (request.method) {
      case "eth_chainId":
        return ok(toHex(options.chainId ?? 8453));
      case "eth_getCode": {
        const address = String(request.params[0]).toLowerCase();
        if (address === BASE_USDC.address.toLowerCase()) return ok(options.code ?? USDC_CODE);
        if (address === BASE_USDC_IMPLEMENTATION.address.toLowerCase()) return ok(USDC_IMPLEMENTATION_CODE);
        // A wallet's code: any non-empty code makes USDC take the ERC-1271 path.
        if (wallets.some((w) => w.address.toLowerCase() === address)) return ok("0x6080604052");
        return ok("0x");
      }
      case "eth_call": {
        const call = request.params[0] as { to: string; data: string };
        const wallet = wallets.find((w) => w.address.toLowerCase() === call.to.toLowerCase());
        if (wallet !== undefined) {
          const decoded = decodeFunctionData({ abi: IS_VALID_SIGNATURE_ABI, data: call.data as Hex });
          const [digest, signature] = decoded.args;
          wallet.calls.push({ digest, signature });
          const answer = wallet.answer(digest, signature);
          if (answer === "revert") return { jsonrpc: "2.0", id: request.id, error: { code: 3, message: "execution reverted" } };
          return ok(`${answer === "magic" ? "0x1626ba7e" : "0xffffffff"}${"0".repeat(56)}`);
        }
        if (call.to.toLowerCase() !== BASE_USDC.address.toLowerCase()) return ok("0x");
        if (call.data === "0x5c60da1b") return ok(`0x${"0".repeat(24)}${(options.implementation ?? BASE_USDC_IMPLEMENTATION.address).slice(2).toLowerCase()}`);
        if (call.data === "0x3644e515") return ok(options.domainSeparator ?? BASE_USDC.domainSeparator);
        if (call.data === "0x313ce567") return ok(`0x${"6".padStart(64, "0")}`);
        return { jsonrpc: "2.0", id: request.id, error: { code: 3, message: "execution reverted" } };
      }
      default:
        return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "method not found" } };
    }
  };
  const wallets = options.wallets ?? [];
  const fetch: FetchLike = async (_input, init) => {
    if (state.down) throw new Error("connection refused");
    const body = JSON.parse(init?.body ?? "null") as unknown;
    return jsonResponse(Array.isArray(body) ? body.map((r) => one(r as never)) : one(body as never));
  };
  return { fetch, calls, state };
}

export type SettleMode = "ok" | "fail" | "pending" | "down";

export interface FakeFacilitator {
  readonly fetch: FetchLike;
  readonly calls: Array<{ readonly path: string; readonly body: Record<string, unknown> }>;
  settleMode: SettleMode;
  verifyMode: "check" | "invalid" | "down";
}

// A facilitator at https://facilitator.test that verifies as the exact-EVM scheme says (signature, amount, recipient,
// window, nonce unused) and "settles" by recording the nonce and answering a transaction hash derived from it.
export function fakeFacilitator(nowS: () => number, wallets: readonly FakeWallet[] = []): FakeFacilitator {
  const used = new Set<string>();
  const state: FakeFacilitator = {
    calls: [],
    settleMode: "ok",
    verifyMode: "check",
    fetch: async (input, init) => {
      const url = new URL(input);
      const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
      state.calls.push({ path: url.pathname, body });
      const payload = body["paymentPayload"] as PaymentPayload;
      const requirements = body["paymentRequirements"] as PaymentRequirements;
      const auth = payload.payload.authorization;
      const key = `${auth.from.toLowerCase()}|${auth.nonce.toLowerCase()}`;
      if (url.pathname === "/facilitator/verify") {
        if (state.verifyMode === "down") throw new Error("connection refused");
        if (state.verifyMode === "invalid") return jsonResponse({ isValid: false, invalidReason: "insufficient_funds", payer: auth.from });
        // A contract wallet's signature is the wallet's to judge (as USDC's SignatureChecker does); an EOA's is recovered.
        const wallet = wallets.find((w) => w.address.toLowerCase() === auth.from.toLowerCase());
        const signer = wallet !== undefined
          ? auth.from
          : await recoverTypedDataAddress({
              domain: assetDomain(BASE_USDC),
              types: TRANSFER_WITH_AUTHORIZATION_TYPES,
              primaryType: "TransferWithAuthorization",
              message: { from: auth.from as Address, to: auth.to as Address, value: BigInt(auth.value), validAfter: BigInt(auth.validAfter), validBefore: BigInt(auth.validBefore), nonce: auth.nonce as Hex },
              signature: payload.payload.signature as Hex,
            });
        const valid = signer.toLowerCase() === auth.from.toLowerCase() && auth.value === requirements.amount && auth.to.toLowerCase() === requirements.payTo.toLowerCase() && BigInt(auth.validBefore) > BigInt(nowS()) && !used.has(key);
        return jsonResponse(valid ? { isValid: true, payer: auth.from } : { isValid: false, invalidReason: "invalid_exact_evm_payload_signature", payer: auth.from });
      }
      if (url.pathname === "/facilitator/settle") {
        if (state.settleMode === "down") throw new Error("connection reset");
        const transaction = keccak256(toHex(key));
        if (state.settleMode === "fail") return jsonResponse({ success: false, errorReason: "insufficient_funds", payer: auth.from, transaction: "", network: requirements.network });
        used.add(key);
        if (state.settleMode === "pending") return jsonResponse({ success: false, errorReason: "settlement_pending", payer: auth.from, transaction, network: requirements.network });
        return jsonResponse({ success: true, payer: auth.from, transaction, network: requirements.network });
      }
      return jsonResponse({ error: "not found" }, 404);
    },
  };
  return state;
}

export const PAY_TO = "0x00000000000000000000000000000000000Fee01" as const;
export const FACILITATOR_URL = "https://facilitator.test/facilitator";

export function paymentEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    API_PUBLIC_URL: "https://api.test",
    API_X402_FACILITATOR_URL: FACILITATOR_URL,
    API_X402_PAY_TO: PAY_TO.toLowerCase(),
    API_X402_NETWORK: "eip155:8453",
    API_X402_PRICE_QUOTE: "0.01",
    ...extra,
  };
}

export function decodeRequired(header: string | null): PaymentRequired {
  if (header === null) throw new Error("no PAYMENT-REQUIRED header");
  return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as PaymentRequired;
}

export interface Payer {
  readonly address: Address;
  pay(
    requirements: PaymentRequirements,
    options: {
      readonly nowS: number;
      readonly resource?: string;
      readonly value?: string;
      readonly to?: Address;
      readonly validAfter?: number;
      readonly validBefore?: number;
      readonly nonce?: Hex;
      readonly accepted?: Partial<PaymentRequirements>;
      readonly signWith?: "self" | "other";
      // A smart wallet's payment: `from` is the wallet, and the signature is these bytes (what its isValidSignature judges).
      readonly from?: Address;
      readonly signature?: Hex;
    },
  ): Promise<string>;
}

// A payer whose key is generated here, for this test run only.
export function testPayer(): Payer {
  const account = privateKeyToAccount(generatePrivateKey());
  const other = privateKeyToAccount(generatePrivateKey());
  let counter = 0;
  return {
    address: account.address,
    async pay(requirements, options) {
      counter += 1;
      const authorization = {
        from: options.from ?? account.address,
        to: options.to ?? requirements.payTo,
        value: options.value ?? requirements.amount,
        validAfter: String(options.validAfter ?? options.nowS - 5),
        validBefore: String(options.validBefore ?? options.nowS + requirements.maxTimeoutSeconds),
        nonce: options.nonce ?? keccak256(toHex(`test-nonce-${account.address}-${counter}`)),
      };
      const signer = options.signWith === "other" ? other : account;
      const signature = options.signature ?? await signer.signTypedData({
        domain: assetDomain(BASE_USDC),
        types: TRANSFER_WITH_AUTHORIZATION_TYPES,
        primaryType: "TransferWithAuthorization",
        message: { from: authorization.from, to: authorization.to as Address, value: BigInt(authorization.value), validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore), nonce: authorization.nonce as Hex },
      });
      const payload = {
        x402Version: 2,
        ...(options.resource === undefined ? {} : { resource: { url: options.resource } }),
        accepted: { ...requirements, ...options.accepted },
        payload: { signature, authorization },
      };
      return encodeHeader(payload);
    },
  };
}
