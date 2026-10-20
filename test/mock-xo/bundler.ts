// The bundler (mainnet-bundler.xo.market).
//
//   eth_chainId                  0xc97
//   eth_supportedEntryPoints     [v0.6, v0.7], as the real bundler advertised (docs/research/21 sec 6)
//   eth_getUserOperationReceipt  looked up on the anvil chain by the UserOperationEvent for the hash;
//                                null when the chain has no such operation (or it is still pending)
//   eth_estimateUserOperationGas  userops.ts: gas by shape, after the same admission as a send
//   eth_sendUserOperation         userops.ts: admission, then the operation really lands through the EntryPoint
//
// and the rules shared with every JSON-RPC door: batch arrays are refused, and the rpc.access switch applies
// (the bundler's reads were keyless, UO9). The write side is switched by bundler.foreign_account,
// bundler.paymasterless, bundler.estimate, bundler.shape and paymaster.state (userops.ts, paymaster.ts).

import { decodeEventLog, getAddress, type Hex } from "viem";

import { parseBundlerRequest } from "../../src/xo/userop/bundler.js";
import { ENTRY_POINT_ABI } from "../../src/xo/chain/abi.js";
import { ENTRY_POINT_V07, USER_OPERATION_EVENT_TOPIC, XO_CHAIN_ID } from "../../src/xo/chain/constants.js";
import type { JsonRpcResponse } from "./chains.js";
import type { MockEnv } from "./env.js";
import { JSON_RPC, rpcError, rpcResult, type RpcId } from "./errors.js";
import type { MockListener, MockReply } from "./listener.js";
import { ENTRY_POINT_V06_ADVERTISED } from "./observed.js";
import { accessGate, parseBody } from "./rpc.js";

const HASH = /^0x[0-9a-fA-F]{64}$/;

class HttpReply extends Error {
  constructor(readonly reply: MockReply) {
    super("http reply");
  }
}

interface ReceiptLog {
  readonly logIndex: string;
  readonly address: string;
  readonly topics: string[];
}

interface ChainReceipt {
  readonly logs: ReceiptLog[];
  readonly [key: string]: unknown;
}

export function registerBundler(listener: MockListener, env: MockEnv): void {
  const { chains } = env;

  async function receiptFor(id: RpcId, params: unknown): Promise<JsonRpcResponse> {
    const hash = Array.isArray(params) ? params[0] : undefined;
    if (typeof hash !== "string" || !HASH.test(hash)) return rpcError(id, JSON_RPC.invalidParams, "invalid user operation hash") as JsonRpcResponse;
    if (chains.xo === undefined) return rpcResult(id, null) as JsonRpcResponse;
    const logs = await chains.call<{ topics: Hex[]; data: Hex; transactionHash: Hex; logIndex: string }[]>("xo", "eth_getLogs", [
      { fromBlock: "0x0", toBlock: "latest", address: ENTRY_POINT_V07, topics: [USER_OPERATION_EVENT_TOPIC, hash.toLowerCase()] },
    ]);
    const log = logs[0];
    if (log === undefined) return rpcResult(id, null) as JsonRpcResponse;
    const event = decodeEventLog({ abi: ENTRY_POINT_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
    if (event.eventName !== "UserOperationEvent") return rpcResult(id, null) as JsonRpcResponse;
    const args = event.args;
    const receipt = await chains.call<ChainReceipt | null>("xo", "eth_getTransactionReceipt", [log.transactionHash]);
    if (receipt === null) return rpcResult(id, null) as JsonRpcResponse;
    // The logs of THIS operation: after the previous UserOperationEvent in the bundle, up to this one.
    const end = Number(BigInt(log.logIndex));
    const previous = receipt.logs
      .filter((entry) => entry.address.toLowerCase() === ENTRY_POINT_V07.toLowerCase() && entry.topics[0]?.toLowerCase() === USER_OPERATION_EVENT_TOPIC.toLowerCase() && Number(BigInt(entry.logIndex)) < end)
      .map((entry) => Number(BigInt(entry.logIndex)));
    const start = previous.length === 0 ? -1 : Math.max(...previous);
    return rpcResult(id, {
      userOpHash: args.userOpHash,
      entryPoint: ENTRY_POINT_V07,
      sender: getAddress(args.sender),
      nonce: `0x${args.nonce.toString(16)}`,
      paymaster: getAddress(args.paymaster),
      actualGasCost: `0x${args.actualGasCost.toString(16)}`,
      actualGasUsed: `0x${args.actualGasUsed.toString(16)}`,
      success: args.success,
      reason: "",
      logs: receipt.logs.filter((entry) => {
        const index = Number(BigInt(entry.logIndex));
        return index > start && index <= end;
      }),
      receipt,
    }) as JsonRpcResponse;
  }

  // The request is validated by the same parser the production client's tests use for a mock bundler
  // (src/xo/userop/bundler.ts): one JSON-RPC 2.0 object, one of its five methods, params an array.
  async function dispatch(value: unknown): Promise<JsonRpcResponse> {
    const parsed = parseBundlerRequest(value);
    if (!parsed.ok) return rpcError(parsed.id, parsed.rpcCode, parsed.message) as JsonRpcResponse;
    const { id, method, params } = parsed;
    switch (method) {
      case "eth_chainId":
        return rpcResult(id, `0x${XO_CHAIN_ID.toString(16)}`) as JsonRpcResponse;
      case "eth_supportedEntryPoints":
        return rpcResult(id, [ENTRY_POINT_V06_ADVERTISED, ENTRY_POINT_V07]) as JsonRpcResponse;
      case "eth_getUserOperationReceipt":
        return receiptFor(id, params);
      default: {
        // eth_estimateUserOperationGas and eth_sendUserOperation.
        const reply = method === "eth_sendUserOperation" ? await env.userops.send(params) : await env.userops.estimate(params);
        if (reply.kind === "result") return rpcResult(id, reply.result) as JsonRpcResponse;
        if (reply.kind === "rpcError") return rpcError(id, reply.code, reply.message) as JsonRpcResponse;
        throw new HttpReply(reply.reply);
      }
    }
  }

  listener.route("POST", "/", async (httpRequest) => {
    const gate = accessGate(env);
    if (gate !== undefined) return gate;
    const body = parseBody(httpRequest);
    if (!body.ok) return body.reply;
    // The bundler does not take JSON-RPC batches.
    if (Array.isArray(body.value)) return { status: 200, json: rpcError(null, JSON_RPC.invalidRequest, "batch requests are not supported") };
    try {
      return { status: 200, json: await dispatch(body.value) };
    } catch (error) {
      // An HTTP-level answer (401 when the bundler wants a key).
      if (error instanceof HttpReply) return error.reply;
      throw error;
    }
  });
}
