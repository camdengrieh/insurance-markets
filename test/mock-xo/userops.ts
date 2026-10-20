// The bundler's write side: admission, gas estimation and landing of UserOperations on the local chain.
//
// A send is real. The operation goes through EntryPoint.handleOps on the anvil chain, with the real EntryPoint,
// factory, ECDSA validator, Kernel and PolicyPaymaster running, so an account really deploys, Enable Trading
// really changes allowances, a bad signature fails with the EntryPoint's own AA code and a sponsorship the
// paymaster refuses fails validation. What is NOT the real bundler is everything in front of that, which is
// XO's off-chain stack and is switched:
//
//   bundler.foreign_account   an account XO did not provision (state.provisioned) is rejected (an allowlist),
//                             accepted, or answered 401 (a key is required)           AD5
//   bundler.paymasterless     an operation with no paymaster is rejected or accepted    UO8
//   bundler.estimate          eth_estimateUserOperationGas is unsupported (method not found) or answers   UO5
//   bundler.shape             the unpacked v0.7 JSON is accepted, or only the packed form is   UO6
//   paymaster.state           see paymaster.ts: the real contract is paused or narrowed   UO7
//   withdraw.paymasterless    a paymaster-less transferRemote on the XO route is rejected, or accepted and
//                             then delivered or not (hyperlane.ts)                      FU9
//
// Error shapes follow ERC-4337 (-32500 for an EntryPoint validation failure with its AAxx text, -32501 for a
// paymaster one, -32602 for a malformed operation); the texts after the AA code are the EntryPoint's. Basis:
// ERC-4337 and docs/research/21; XO's own refusal texts were never seen (M).

import { encodeFunctionData, getAddress, hexToBigInt, isAddress, type Hex } from "viem";

import { POLICY_PAYMASTER_ABI } from "../../src/xo/chain/abi.js";
import { parseSendParams } from "../../src/xo/userop/bundler.js";
import {
  ENTRY_POINT_V07,
  GAS_DEFAULTS,
  MARKET_MANAGER,
  POLICY_PAYMASTER,
  TRANSFER_REMOTE_SELECTOR,
  XO_WARP_ROUTE,
  type GasDefaults,
} from "../../src/xo/chain/constants.js";
import type { PackedUserOp } from "../anvil/userop.js";
import type { HandleOpsSuccess } from "../anvil/chain.js";
import { decodeKernelCalls, selectorOf, type DecodedCall } from "./calls.js";
import type { MockEnv } from "./env.js";
import { JSON_RPC } from "./errors.js";
import type { MockReply } from "./listener.js";
import { accountKey } from "./state.js";

export type PoolReply =
  | { readonly kind: "result"; readonly result: unknown }
  | { readonly kind: "rpcError"; readonly code: number; readonly message: string }
  // An HTTP-level answer (401 when the bundler wants a key).
  | { readonly kind: "http"; readonly reply: MockReply };

const hexQuantity = (value: bigint): string => `0x${value.toString(16)}`;

const rpcError = (code: number, message: string): PoolReply => ({ kind: "rpcError", code, message });

const PACKED_KEYS = ["sender", "nonce", "initCode", "callData", "accountGasLimits", "preVerificationGas", "gasFees", "paymasterAndData", "signature"] as const;
const UNPACKED_ONLY_KEYS = ["factory", "factoryData", "callGasLimit", "verificationGasLimit", "maxFeePerGas", "maxPriorityFeePerGas", "paymaster", "paymasterData"] as const;
const HEX_DATA = /^0x([0-9a-fA-F]{2})*$/;
const QUANTITY = /^0x(0|[1-9a-fA-F][0-9a-fA-F]*)$/;

export interface PendingOp {
  readonly hash: Hex;
  readonly op: PackedUserOp;
  readonly dueMs: number;
}

export class UserOpPool {
  // Seconds between eth_sendUserOperation and inclusion. 0 (the default) lands the operation inside the send.
  inclusionDelaySeconds = 0;
  private readonly pendingOps = new Map<string, PendingOp>();
  private tail: Promise<void> = Promise.resolve();
  private landedCount = 0;

  constructor(private readonly env: () => MockEnv) {}

  get pending(): readonly PendingOp[] {
    return [...this.pendingOps.values()];
  }

  get landed(): number {
    return this.landedCount;
  }

  reset(): void {
    this.pendingOps.clear();
    this.inclusionDelaySeconds = 0;
    this.landedCount = 0;
  }

  // One landing at a time: the chain's nonces and the paymaster's daily counters are shared.
  private exclusive<T>(body: () => Promise<T>): Promise<T> {
    const run = this.tail.then(body);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  // ---- parsing ------------------------------------------------------------------------------------------------------

  private parse(params: readonly unknown[]): { readonly ok: true; readonly op: PackedUserOp } | { readonly ok: false; readonly reply: PoolReply } {
    const shape = this.env().switches.get("bundler.shape");
    const first = params[0];
    if (shape === "v0.7-unpacked") {
      const parsed = parseSendParams(params);
      if (!parsed.ok) return { ok: false, reply: rpcError(JSON_RPC.invalidParams, `invalid user operation: ${parsed.message}`) };
      return { ok: true, op: parsed.op as PackedUserOp };
    }
    // reject-unpacked: this bundler wants the packed form (initCode, accountGasLimits, gasFees, paymasterAndData).
    if (typeof first !== "object" || first === null || Array.isArray(first)) return { ok: false, reply: rpcError(JSON_RPC.invalidParams, "invalid user operation: expected an object") };
    const record = first as Record<string, unknown>;
    const unpacked = UNPACKED_ONLY_KEYS.filter((key) => key in record);
    if (unpacked.length > 0) {
      return { ok: false, reply: rpcError(JSON_RPC.invalidParams, `invalid user operation: unknown field ${unpacked[0] as string} (this bundler takes the packed form)`) };
    }
    for (const key of PACKED_KEYS) if (!(key in record)) return { ok: false, reply: rpcError(JSON_RPC.invalidParams, `invalid user operation: missing field ${key}`) };
    const entry = params[1];
    if (typeof entry !== "string" || !isAddress(entry, { strict: false }) || getAddress(entry) !== ENTRY_POINT_V07) {
      return { ok: false, reply: rpcError(JSON_RPC.invalidParams, "invalid user operation: unsupported entry point") };
    }
    const text = (key: string): string | undefined => (typeof record[key] === "string" ? (record[key] as string) : undefined);
    const sender = text("sender");
    const nonce = text("nonce");
    const preVerificationGas = text("preVerificationGas");
    const hexes = ["initCode", "callData", "paymasterAndData", "signature"].map((key) => text(key));
    const words = ["accountGasLimits", "gasFees"].map((key) => text(key));
    if (
      sender === undefined || !isAddress(sender, { strict: false }) ||
      nonce === undefined || !QUANTITY.test(nonce) ||
      preVerificationGas === undefined || !QUANTITY.test(preVerificationGas) ||
      hexes.some((value) => value === undefined || !HEX_DATA.test(value)) ||
      words.some((value) => value === undefined || !/^0x[0-9a-fA-F]{64}$/.test(value))
    ) {
      return { ok: false, reply: rpcError(JSON_RPC.invalidParams, "invalid user operation: malformed packed field") };
    }
    return {
      ok: true,
      op: {
        sender: getAddress(sender),
        nonce: BigInt(nonce),
        initCode: hexes[0] as Hex,
        callData: hexes[1] as Hex,
        accountGasLimits: words[0] as Hex,
        preVerificationGas: BigInt(preVerificationGas),
        gasFees: words[1] as Hex,
        paymasterAndData: hexes[2] as Hex,
        signature: hexes[3] as Hex,
      },
    };
  }

  // ---- admission ------------------------------------------------------------------------------------------------------

  private async admit(op: PackedUserOp, calls: readonly DecodedCall[] | null): Promise<PoolReply | undefined> {
    const env = this.env();
    const { switches, state } = env;
    // Which accounts the bundler serves (AD5). The reads never come here; only operations do.
    if (!state.provisioned.has(accountKey(op.sender))) {
      const rule = switches.get("bundler.foreign_account");
      if (rule === "reject") return rpcError(-32500, "sender is not on the allowlist of this bundler: the account was not provisioned by XO");
      if (rule === "requires-key") {
        return { kind: "http", reply: { status: 401, json: { jsonrpc: "2.0", id: null, error: { code: JSON_RPC.keyRequired, message: "api_key required to send user operations" } } } };
      }
    }
    const sponsored = op.paymasterAndData !== "0x";
    if (!sponsored) {
      if (switches.get("bundler.paymasterless") === "reject") return rpcError(-32500, "user operations without a paymaster are not accepted by this bundler");
      // The XO route's transferRemote is the withdrawal H1 sketches; the paymaster refuses it, so it can only come without one.
      const withdraws = calls?.some((call) => call.target === XO_WARP_ROUTE && selectorOf(call.data) === TRANSFER_REMOTE_SELECTOR) ?? false;
      if (withdraws && switches.get("withdraw.paymasterless") === "reject") return rpcError(-32500, "withdrawals without a paymaster are not accepted by this bundler");
    }
    return undefined;
  }

  // Validation-time policy check, as a bundler's simulation would do it: each call must be allowed by the
  // paymaster for this sender. Used by the estimate, where the signature is a dummy and handleOps cannot run.
  private async paymasterRefusal(op: PackedUserOp, calls: readonly DecodedCall[] | null): Promise<PoolReply | undefined> {
    const env = this.env();
    if (op.paymasterAndData === "0x" || calls === null) return undefined;
    await env.paymaster.reconcile();
    const paused = await env.chains.tryCall("xo", POLICY_PAYMASTER, encodeFunctionData({ abi: POLICY_PAYMASTER_ABI, functionName: "paused" }));
    if (paused !== null && hexToBigInt(paused) === 1n) return rpcError(-32501, "AA33 reverted: the paymaster is paused");
    for (const call of calls) {
      const data = encodeFunctionData({ abi: POLICY_PAYMASTER_ABI, functionName: "checkPolicy", args: [op.sender, call.target, selectorOf(call.data)] });
      const answer = await env.chains.tryCall("xo", POLICY_PAYMASTER, data);
      if (answer !== null && hexToBigInt(`0x${answer.slice(2, 66)}`) === 0n) {
        // The real contract answers a refusal with a failed validation, which the EntryPoint reports as AA34.
        return rpcError(-32501, `AA34 signature error: the paymaster policy refuses ${selectorOf(call.data)} on ${call.target}`);
      }
    }
    return undefined;
  }

  // ---- eth_estimateUserOperationGas -----------------------------------------------------------------------------------

  async estimate(params: readonly unknown[]): Promise<PoolReply> {
    const env = this.env();
    if (env.switches.get("bundler.estimate") === "unsupported") return rpcError(JSON_RPC.methodNotFound, "Method not found");
    const parsed = this.parse(params);
    if (!parsed.ok) return parsed.reply;
    const op = parsed.op;
    const calls = decodeKernelCalls(op.callData);
    const refused = await this.admit(op, calls);
    if (refused !== undefined) return refused;
    const policy = await this.paymasterRefusal(op, calls);
    if (policy !== undefined) return policy;
    // Gas by shape: the observed defaults (docs/research/21 sec 8.1). A deploying operation needs the larger
    // verification gas; the call gas follows what is called.
    const deploying = op.initCode !== "0x";
    let defaults: GasDefaults = deploying ? GAS_DEFAULTS.deployAndEnableTrading : GAS_DEFAULTS.enableTrading;
    if (calls?.some((call) => call.target === MARKET_MANAGER)) defaults = { ...GAS_DEFAULTS.createMarket, verificationGasLimit: deploying ? GAS_DEFAULTS.deployAndEnableTrading.verificationGasLimit : GAS_DEFAULTS.createMarket.verificationGasLimit };
    const sponsored = op.paymasterAndData !== "0x";
    return {
      kind: "result",
      result: {
        preVerificationGas: hexQuantity(defaults.preVerificationGas),
        verificationGasLimit: hexQuantity(defaults.verificationGasLimit),
        callGasLimit: hexQuantity(defaults.callGasLimit),
        ...(sponsored
          ? {
              paymasterVerificationGasLimit: hexQuantity(defaults.paymasterVerificationGasLimit),
              paymasterPostOpGasLimit: hexQuantity(defaults.paymasterPostOpGasLimit),
            }
          : {}),
      },
    };
  }

  // ---- eth_sendUserOperation ------------------------------------------------------------------------------------------

  async send(params: readonly unknown[]): Promise<PoolReply> {
    const env = this.env();
    const parsed = this.parse(params);
    if (!parsed.ok) return parsed.reply;
    const op = parsed.op;
    const calls = decodeKernelCalls(op.callData);
    const refused = await this.admit(op, calls);
    if (refused !== undefined) return refused;
    const chain = env.chains.xo;
    if (chain === undefined) return rpcError(-32000, "mock: the XO chain is not part of this mock");

    return this.exclusive(async (): Promise<PoolReply> => {
      if (op.paymasterAndData !== "0x") await env.paymaster.reconcile();
      await env.chains.syncToClock(env.clock);
      const hash = await chain.entryPointGetUserOpHash(op);
      if (this.pendingOps.has(hash)) return rpcError(-32500, "already known: the operation is in the mempool");
      if (this.inclusionDelaySeconds > 0) {
        const simulated = await chain.simulateHandleOps([op]);
        if (!simulated.ok) return rejection(simulated.error);
        const dueMs = env.clock.nowMs() + this.inclusionDelaySeconds * 1000;
        this.pendingOps.set(hash, { hash, op, dueMs });
        env.scheduler.at(dueMs, `include user operation ${hash.slice(0, 10)}`, () => this.include(hash));
        return { kind: "result", result: hash };
      }
      const landed = await chain.handleOps([op]);
      if (!landed.ok) return rejection(landed.error);
      await this.afterLanding(op, calls, landed);
      return { kind: "result", result: hash };
    });
  }

  // Includes a delayed operation. A failure here drops the operation: its receipt never appears.
  private async include(hash: Hex): Promise<void> {
    const env = this.env();
    const entry = this.pendingOps.get(hash);
    const chain = env.chains.xo;
    if (entry === undefined || chain === undefined) return;
    this.pendingOps.delete(hash);
    await this.exclusive(async () => {
      if (entry.op.paymasterAndData !== "0x") await env.paymaster.reconcile();
      const landed = await chain.handleOps([entry.op]);
      if (landed.ok) await this.afterLanding(entry.op, decodeKernelCalls(entry.op.callData), landed);
    });
  }

  private async afterLanding(op: PackedUserOp, calls: readonly DecodedCall[] | null, landed: HandleOpsSuccess): Promise<void> {
    const env = this.env();
    this.landedCount += 1;
    const summary = landed.ops.find((entry) => entry.sender.toLowerCase() === op.sender.toLowerCase());
    // An operation can land with its execution reverted (success false): nothing it asked for happened.
    if (summary?.success === true && calls !== null) await env.hyperlane.onUserOpLanded(op.sender, calls);
    await env.creation.sync();
  }
}

// Maps an EntryPoint failure to the bundler's JSON-RPC error. The AA code stays in the text, where the
// production client looks for it.
function rejection(error: { readonly name: string; readonly code?: string | undefined; readonly reason?: string | undefined; readonly inner?: Hex | undefined }): PoolReply {
  const code = error.code;
  const text = error.reason ?? error.name;
  const inner = error.inner !== undefined && error.inner !== "0x" ? ` (inner ${error.inner.slice(0, 10)})` : "";
  if (code !== undefined && code.startsWith("AA3")) return rpcError(-32501, `${text}${inner}`);
  return rpcError(-32500, `${text}${inner}`);
}

