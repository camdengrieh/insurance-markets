// JSON-RPC client for XO's ERC-4337 bundler (mainnet-bundler host; the URL is configuration, never pinned
// here), with an injected transport. Nothing runs at import: no timer, no request, no read of the
// environment. The relay builds a BundlerClient with its own transport (host allowlist, pinned User-Agent,
// rate limit, circuit breaker, size and time caps live there).
//
// Methods, and only these (the bundler's error text lists many more, including debug_bundler_* and
// pimlico_*; none of those is ever called, docs/research/21 section 6):
//   eth_chainId, eth_supportedEntryPoints                           reads
//   eth_estimateUserOperationGas, eth_getUserOperationReceipt        reads
//   eth_sendUserOperation                                            THE write
//
// The write sits behind the ENABLE_USEROP_SUBMIT flag: the caller passes `writeGuard`, which is called at
// the start of every send and may throw (for example `() => requireFlag(ctx.flags(), "ENABLE_USEROP_SUBMIT")`
// from src/relay/flags.ts, which also enforces the kill switch). If it throws, nothing is sent.
//
// Wire shape: the ERC-4337 v0.7 "unpacked" user operation (factory + factoryData, paymaster + the two
// paymaster gas limits + paymasterData), the shape viem's bundler client produces and XO's redeem guide
// uses [21 V4.1]. It was NOT tested against XO's bundler (UO6, M). A JSON-RPC batch array is never sent
// and never accepted (the bundler rejects them; the mock does too, section 5.5).

import { concat, getAddress, isAddress, numberToHex } from "viem";
import * as z from "zod/v4";

import { sanitizeUntrusted } from "../../guardrails/untrusted.js";
import { ENTRY_POINT_V07, XO_CHAIN_ID, type Address, type Hex } from "../chain/constants.js";
import { UserOpError, requireHex } from "./encode.js";
import type { GasEstimate } from "./gas.js";
import { userOpHash } from "./hash.js";
import { assertXoShape, packUserOp, unpackUserOp, type PackedUserOp } from "./pack.js";
import { normalizeSignature } from "./sign.js";

export const BUNDLER_METHODS = Object.freeze([
  "eth_chainId",
  "eth_supportedEntryPoints",
  "eth_estimateUserOperationGas",
  "eth_sendUserOperation",
  "eth_getUserOperationReceipt",
] as const);
export type BundlerMethod = (typeof BUNDLER_METHODS)[number];

// A well-formed 65-byte ECDSA signature that recovers to a non-zero address under any digest, for gas
// estimation (Solady's recover reverts on a signature that recovers to nothing, so an all-zero dummy
// would make the estimate fail). Made once by signing a fixed string with a public Anvil test key; the
// key is not in the repository and the signature authorises nothing.
export const DUMMY_USEROP_SIGNATURE: Hex =
  "0x69a60fb13a1a39b3f21a81f7e5f8b79c66dc9b7fc7bd696e4fe6ec4f66e876145b8f2dbd679712bcf7745b4d212f90677a0d6b1118bddaffbc6dc2875363cd1c1b";

const MAX_UPSTREAM_TEXT_CHARS = 200;

// ---- errors ------------------------------------------------------------------------------------------------

export type BundlerErrorCode =
  | "invalid_input" // refused before anything was sent
  | "transport_error" // the transport threw (timeout, DNS, TLS, blocked host)
  | "requires_key" // 401 or 403, or an "api key" complaint: record it and stop, never look for a key
  | "rate_limited" // 429
  | "http_error" // another non-2xx status without a JSON-RPC error
  | "invalid_response" // not a JSON-RPC envelope, wrong id, wrong result shape
  | "batch_response" // an array came back
  | "rpc_error" // the bundler refused the request (code, text and AA code attached)
  | "hash_mismatch" // the bundler's userOpHash differs from the one computed locally
  | "wrong_chain" // eth_chainId is not 3223
  | "unsupported_entry_point"; // the bundler does not advertise EntryPoint v0.7

export interface BundlerErrorInit {
  readonly httpStatus?: number;
  readonly rpcCode?: number;
  readonly aaCode?: string;
  // The operation may have reached the bundler (a timeout or 5xx on a send, a mismatched hash): the caller
  // must treat the outcome as ambiguous and reconcile, never resend.
  readonly maybeSubmitted?: boolean;
  readonly upstreamText?: string;
}

export class BundlerError extends Error {
  readonly code: BundlerErrorCode;
  readonly httpStatus: number | undefined;
  readonly rpcCode: number | undefined;
  readonly aaCode: string | undefined;
  readonly maybeSubmitted: boolean;
  // Sanitised, at most 200 characters, untrusted: a capability fact or a log line, never an instruction.
  readonly upstreamText: string | undefined;

  constructor(code: BundlerErrorCode, message: string, init: BundlerErrorInit = {}) {
    super(message);
    this.name = "BundlerError";
    this.code = code;
    this.httpStatus = init.httpStatus;
    this.rpcCode = init.rpcCode;
    this.aaCode = init.aaCode;
    this.maybeSubmitted = init.maybeSubmitted ?? false;
    this.upstreamText = init.upstreamText;
  }
}

function cleanText(text: unknown): string | undefined {
  if (typeof text !== "string" || text.length === 0) return undefined;
  return sanitizeUntrusted(text, { maxChars: MAX_UPSTREAM_TEXT_CHARS, source: "bundler" }).text;
}

// ---- wire shape ----------------------------------------------------------------------------------------------

export interface RpcUserOperation {
  readonly sender: string;
  readonly nonce: string;
  readonly callData: string;
  readonly callGasLimit: string;
  readonly verificationGasLimit: string;
  readonly preVerificationGas: string;
  readonly maxFeePerGas: string;
  readonly maxPriorityFeePerGas: string;
  readonly signature: string;
  readonly factory?: string;
  readonly factoryData?: string;
  readonly paymaster?: string;
  readonly paymasterVerificationGasLimit?: string;
  readonly paymasterPostOpGasLimit?: string;
  readonly paymasterData?: string;
}

const quantity = z.string().regex(/^0x(0|[1-9a-fA-F][0-9a-fA-F]*)$/, "hex quantity without leading zeros");
const hexData = z.string().regex(/^0x([0-9a-fA-F]{2})*$/, "even-length 0x hex");
const strictAddress = z.string().refine((value) => /^0x[0-9a-fA-F]{40}$/.test(value) && isAddress(value, { strict: true }), "address checksum is wrong");
const hash32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "32-byte 0x hex");

const rpcUserOperationSchema = z
  .object({
    sender: strictAddress,
    nonce: quantity,
    callData: hexData,
    callGasLimit: quantity,
    verificationGasLimit: quantity,
    preVerificationGas: quantity,
    maxFeePerGas: quantity,
    maxPriorityFeePerGas: quantity,
    signature: hexData,
    factory: strictAddress.optional(),
    factoryData: hexData.optional(),
    paymaster: strictAddress.optional(),
    paymasterVerificationGasLimit: quantity.optional(),
    paymasterPostOpGasLimit: quantity.optional(),
    paymasterData: hexData.optional(),
  })
  .strict();

export interface RpcOptions {
  // Estimation needs a signature of the right shape; use the dummy when the operation is unsigned.
  readonly dummySignature?: boolean;
}

export function toRpcUserOperation(op: PackedUserOp, options: RpcOptions = {}): RpcUserOperation {
  const fields = unpackUserOp(assertXoShape(op));
  const signature = options.dummySignature === true && fields.signature === "0x" ? DUMMY_USEROP_SIGNATURE : (fields.signature ?? "0x");
  const base = {
    sender: fields.sender,
    nonce: numberToHex(fields.nonce),
    callData: fields.callData,
    callGasLimit: numberToHex(fields.callGasLimit),
    verificationGasLimit: numberToHex(fields.verificationGasLimit),
    preVerificationGas: numberToHex(fields.preVerificationGas),
    maxFeePerGas: numberToHex(fields.maxFeePerGas),
    maxPriorityFeePerGas: numberToHex(fields.maxPriorityFeePerGas),
    signature,
  };
  const factory = fields.initCode === "0x" ? {} : { factory: getAddress(fields.initCode.slice(0, 42)), factoryData: `0x${fields.initCode.slice(42)}` };
  const paymaster =
    fields.paymaster === null
      ? {}
      : {
          paymaster: fields.paymaster.address,
          paymasterVerificationGasLimit: numberToHex(fields.paymaster.verificationGasLimit),
          paymasterPostOpGasLimit: numberToHex(fields.paymaster.postOpGasLimit),
          paymasterData: "0x",
        };
  return { ...base, ...factory, ...paymaster };
}

// Strict inverse (also what a mock bundler uses to read an incoming send): unknown keys are refused, so
// the packed shape (initCode, accountGasLimits, ...) is rejected as "reject-unpacked" requires.
export function fromRpcUserOperation(value: unknown): PackedUserOp {
  const parsed = rpcUserOperationSchema.safeParse(value);
  if (!parsed.success) throw new BundlerError("invalid_input", "not a v0.7 unpacked user operation");
  const v = parsed.data;
  if ((v.factory === undefined) !== (v.factoryData === undefined)) throw new BundlerError("invalid_input", "factory and factoryData go together");
  const havePaymaster = [v.paymaster, v.paymasterVerificationGasLimit, v.paymasterPostOpGasLimit, v.paymasterData].filter((x) => x !== undefined).length;
  if (havePaymaster !== 0 && havePaymaster !== 4) throw new BundlerError("invalid_input", "paymaster fields go together");
  if (v.paymasterData !== undefined && v.paymasterData !== "0x") throw new BundlerError("invalid_input", "paymasterData must be empty");
  try {
    return packUserOp({
      sender: getAddress(v.sender),
      nonce: BigInt(v.nonce),
      initCode: v.factory === undefined ? "0x" : (concat([v.factory as Hex, (v.factoryData ?? "0x") as Hex]).toLowerCase() as Hex),
      callData: v.callData as Hex,
      verificationGasLimit: BigInt(v.verificationGasLimit),
      callGasLimit: BigInt(v.callGasLimit),
      preVerificationGas: BigInt(v.preVerificationGas),
      maxPriorityFeePerGas: BigInt(v.maxPriorityFeePerGas),
      maxFeePerGas: BigInt(v.maxFeePerGas),
      paymaster:
        v.paymaster === undefined
          ? null
          : {
              address: getAddress(v.paymaster),
              verificationGasLimit: BigInt(v.paymasterVerificationGasLimit as string),
              postOpGasLimit: BigInt(v.paymasterPostOpGasLimit as string),
            },
      signature: v.signature as Hex,
    });
  } catch (error) {
    if (error instanceof UserOpError) throw new BundlerError("invalid_input", error.message);
    throw error;
  }
}

// ---- server-side helpers (the mock bundler and tests use these) ---------------------------------------------

export type ParsedBundlerRequest =
  | { readonly ok: true; readonly id: number | string | null; readonly method: BundlerMethod; readonly params: readonly unknown[] }
  | { readonly ok: false; readonly rpcCode: -32600 | -32601 | -32602; readonly message: string; readonly id: number | string | null };

// A single JSON-RPC 2.0 request for one of the five methods. An array (a batch) is refused.
export function parseBundlerRequest(body: unknown): ParsedBundlerRequest {
  if (Array.isArray(body)) return { ok: false, rpcCode: -32600, message: "batch requests are not supported", id: null };
  if (typeof body !== "object" || body === null) return { ok: false, rpcCode: -32600, message: "invalid request", id: null };
  const record = body as Record<string, unknown>;
  const id = typeof record.id === "number" || typeof record.id === "string" ? record.id : null;
  if (record.jsonrpc !== "2.0" || typeof record.method !== "string") return { ok: false, rpcCode: -32600, message: "invalid request", id };
  if (!(BUNDLER_METHODS as readonly string[]).includes(record.method)) return { ok: false, rpcCode: -32601, message: "method not found", id };
  if (!Array.isArray(record.params)) return { ok: false, rpcCode: -32602, message: "params must be an array", id };
  return { ok: true, id, method: record.method as BundlerMethod, params: record.params };
}

export type SendParams = { readonly ok: true; readonly op: PackedUserOp; readonly entryPoint: Address } | { readonly ok: false; readonly message: string };

// params of eth_sendUserOperation / eth_estimateUserOperationGas: [unpackedOp, entryPoint].
export function parseSendParams(params: readonly unknown[]): SendParams {
  if (params.length < 2 || typeof params[1] !== "string") return { ok: false, message: "expected [userOperation, entryPoint]" };
  if (!isAddress(params[1], { strict: true }) || getAddress(params[1]) !== ENTRY_POINT_V07) return { ok: false, message: "unsupported entry point" };
  try {
    return { ok: true, op: fromRpcUserOperation(params[0]), entryPoint: ENTRY_POINT_V07 };
  } catch (error) {
    if (error instanceof BundlerError) return { ok: false, message: error.message };
    throw error;
  }
}

// ---- client ------------------------------------------------------------------------------------------------------

export interface BundlerHttpResponse {
  readonly status: number;
  // The parsed JSON body, or the raw text when it was not JSON.
  readonly body: unknown;
}

// Structurally the same as RpcTransport in src/xo/chain/reads.ts, so one transport can serve both.
export interface BundlerTransport {
  postJson(url: string, body: unknown): Promise<BundlerHttpResponse>;
}

export interface BundlerClientOptions {
  readonly transport: BundlerTransport;
  // https, or http to a loopback host (the local mock). No credentials, query or fragment: a key in a URL
  // is exactly what this client never carries.
  readonly url: string;
  // Called at the start of every send. Throw to forbid it (flag off, kill switch).
  readonly writeGuard?: () => void;
}

export interface UserOperationReceipt {
  readonly userOpHash: Hex;
  readonly sender: Address;
  readonly nonce: bigint;
  readonly success: boolean;
  readonly actualGasCost: bigint;
  readonly actualGasUsed: bigint;
  readonly transactionHash: Hex;
  readonly blockNumber: bigint;
  // Sanitised revert reason, at most 200 characters, untrusted.
  readonly reason: string | undefined;
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function validateBundlerUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BundlerError("invalid_input", "the bundler URL is not a URL");
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new BundlerError("invalid_input", "the bundler URL must be https (http only to a loopback host)");
  }
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new BundlerError("invalid_input", "the bundler URL must not carry credentials, a query or a fragment");
  }
  return url.toString();
}

const estimateSchema = z.object({
  preVerificationGas: quantity,
  verificationGasLimit: quantity,
  callGasLimit: quantity,
  paymasterVerificationGasLimit: quantity.optional(),
  paymasterPostOpGasLimit: quantity.optional(),
});

const receiptSchema = z.object({
  userOpHash: hash32,
  sender: strictAddress,
  nonce: quantity,
  success: z.boolean(),
  actualGasCost: quantity,
  actualGasUsed: quantity,
  reason: z.string().optional(),
  receipt: z.object({ transactionHash: hash32, blockNumber: quantity }),
});

const AA_CODE = /\bAA\d{2}\b/;
const KEY_COMPLAINT = /api[_\s-]?key/i;

export class BundlerClient {
  private readonly transport: BundlerTransport;
  private readonly url: string;
  private readonly writeGuard: (() => void) | undefined;
  private nextId = 1;

  constructor(options: BundlerClientOptions) {
    this.transport = options.transport;
    this.url = validateBundlerUrl(options.url);
    this.writeGuard = options.writeGuard;
  }

  async chainId(): Promise<number> {
    const result = await this.call("eth_chainId", [], false);
    if (typeof result !== "string" || !quantity.safeParse(result).success) throw new BundlerError("invalid_response", "eth_chainId returned a non-quantity");
    if (BigInt(result) !== BigInt(XO_CHAIN_ID)) throw new BundlerError("wrong_chain", "the bundler is not on chain 3223");
    return XO_CHAIN_ID;
  }

  async supportedEntryPoints(): Promise<readonly Address[]> {
    const result = await this.call("eth_supportedEntryPoints", [], false);
    if (!Array.isArray(result) || result.some((x) => typeof x !== "string" || !isAddress(x, { strict: false }))) {
      throw new BundlerError("invalid_response", "eth_supportedEntryPoints returned something else than addresses");
    }
    const list = result.map((x) => getAddress(x as string));
    if (!list.includes(ENTRY_POINT_V07)) throw new BundlerError("unsupported_entry_point", "the bundler does not advertise EntryPoint v0.7");
    return list;
  }

  // Simulation only; sends nothing. An unsigned operation gets the dummy signature.
  async estimateUserOperationGas(op: PackedUserOp): Promise<GasEstimate> {
    const rpcOp = toRpcUserOperation(op, { dummySignature: true });
    const result = await this.call("eth_estimateUserOperationGas", [rpcOp, ENTRY_POINT_V07], false);
    const parsed = estimateSchema.safeParse(result);
    if (!parsed.success) throw new BundlerError("invalid_response", "eth_estimateUserOperationGas returned an unexpected shape");
    const e = parsed.data;
    return {
      preVerificationGas: BigInt(e.preVerificationGas),
      verificationGasLimit: BigInt(e.verificationGasLimit),
      callGasLimit: BigInt(e.callGasLimit),
      ...(e.paymasterVerificationGasLimit === undefined ? {} : { paymasterVerificationGasLimit: BigInt(e.paymasterVerificationGasLimit) }),
      ...(e.paymasterPostOpGasLimit === undefined ? {} : { paymasterPostOpGasLimit: BigInt(e.paymasterPostOpGasLimit) }),
    };
  }

  // THE write. One request, never retried here. The operation must be fully signed in the canonical form
  // (65 bytes, v 27 or 28, low s). The bundler's answer must equal the hash computed locally.
  async sendUserOperation(op: PackedUserOp): Promise<{ readonly userOpHash: Hex }> {
    this.writeGuard?.();
    let checked: PackedUserOp;
    try {
      checked = assertXoShape(op);
      if (checked.signature === "0x") throw new UserOpError("invalid_input", "the operation is not signed");
      if (normalizeSignature(checked.signature).signature !== checked.signature) {
        throw new UserOpError("signature_invalid", "the signature is not in the canonical form (v 27 or 28, low s)");
      }
    } catch (error) {
      if (error instanceof UserOpError) throw new BundlerError("invalid_input", error.message);
      throw error;
    }
    const local = userOpHash(checked);
    const result = await this.call("eth_sendUserOperation", [toRpcUserOperation(checked), ENTRY_POINT_V07], true);
    if (typeof result !== "string" || !hash32.safeParse(result).success) {
      throw new BundlerError("invalid_response", "eth_sendUserOperation did not return a hash", { maybeSubmitted: true });
    }
    if (result.toLowerCase() !== local) {
      throw new BundlerError("hash_mismatch", "the bundler's userOpHash differs from the locally computed one", { maybeSubmitted: true });
    }
    return { userOpHash: local };
  }

  async getUserOperationReceipt(hash: Hex): Promise<UserOperationReceipt | null> {
    const wanted = requireHexHash(hash);
    const result = await this.call("eth_getUserOperationReceipt", [wanted], false);
    if (result === null) return null;
    const parsed = receiptSchema.safeParse(result);
    if (!parsed.success) throw new BundlerError("invalid_response", "eth_getUserOperationReceipt returned an unexpected shape");
    const r = parsed.data;
    if (r.userOpHash.toLowerCase() !== wanted) throw new BundlerError("invalid_response", "the receipt is for another user operation");
    return {
      userOpHash: wanted,
      sender: getAddress(r.sender),
      nonce: BigInt(r.nonce),
      success: r.success,
      actualGasCost: BigInt(r.actualGasCost),
      actualGasUsed: BigInt(r.actualGasUsed),
      transactionHash: r.receipt.transactionHash.toLowerCase() as Hex,
      blockNumber: BigInt(r.receipt.blockNumber),
      reason: cleanText(r.reason),
    };
  }

  // One JSON-RPC call. `write` marks the call whose failure may mean the operation arrived.
  private async call(method: BundlerMethod, params: readonly unknown[], write: boolean): Promise<unknown> {
    if (!(BUNDLER_METHODS as readonly string[]).includes(method)) throw new BundlerError("invalid_input", "unknown bundler method");
    const id = this.nextId++;
    const request = { jsonrpc: "2.0" as const, id, method, params };
    let response: BundlerHttpResponse;
    try {
      response = await this.transport.postJson(this.url, request);
    } catch {
      throw new BundlerError("transport_error", "the request to the bundler failed", { maybeSubmitted: write });
    }
    return this.read(response, id, write);
  }

  private read(response: BundlerHttpResponse, id: number, write: boolean): unknown {
    const status = response.status;
    if (status === 401 || status === 403) {
      throw new BundlerError("requires_key", "the bundler answered 401 or 403: it wants a key, and none is looked for", { httpStatus: status });
    }
    if (status === 429) throw new BundlerError("rate_limited", "the bundler is rate limiting", { httpStatus: status });
    const body = response.body;
    if (Array.isArray(body)) throw new BundlerError("batch_response", "the bundler answered with a batch array", { httpStatus: status, maybeSubmitted: write });
    const envelope = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
    const error = envelope?.error;
    if (typeof error === "object" && error !== null) {
      const e = error as Record<string, unknown>;
      const text = cleanText(e.message);
      const code = typeof e.code === "number" && Number.isSafeInteger(e.code) ? e.code : undefined;
      if (text !== undefined && KEY_COMPLAINT.test(text)) {
        throw new BundlerError("requires_key", "the bundler complains about an API key, and none is looked for", { httpStatus: status, ...(code === undefined ? {} : { rpcCode: code }) });
      }
      const aa = text === undefined ? undefined : AA_CODE.exec(text)?.[0];
      throw new BundlerError("rpc_error", "the bundler refused the request", {
        httpStatus: status,
        ...(code === undefined ? {} : { rpcCode: code }),
        ...(aa === undefined ? {} : { aaCode: aa }),
        ...(text === undefined ? {} : { upstreamText: text }),
      });
    }
    if (status >= 400) {
      throw new BundlerError("http_error", `the bundler answered HTTP ${status}`, { httpStatus: status, maybeSubmitted: write && status >= 500 });
    }
    if (envelope === null || envelope.jsonrpc !== "2.0" || envelope.id !== id || !("result" in envelope)) {
      throw new BundlerError("invalid_response", "the bundler's answer is not a JSON-RPC response to this request", { httpStatus: status, maybeSubmitted: write });
    }
    return envelope.result;
  }
}

function requireHexHash(value: unknown): Hex {
  try {
    return requireHex(value, "userOpHash", { bytes: 32 });
  } catch (error) {
    if (error instanceof UserOpError) throw new BundlerError("invalid_input", error.message);
    throw error;
  }
}
