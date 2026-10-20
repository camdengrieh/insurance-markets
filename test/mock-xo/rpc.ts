// JSON-RPC for chain 3223 (rpc-mainnet-2.xo.market) and for Base, served from the anvil chains.
//
//   - reads only: the allowlist is the ONLY thing forwarded to anvil. Every other method (sends, signs,
//     anvil_*, evm_*, debug_*, eth_supportedEntryPoints) answers -32601 and never reaches the chain, so a
//     client cannot move the mock's state through this door
//   - XO eth_getLogs over more than 100,000 blocks is refused; Base eth_getLogs is refused outright
//     (the public Base node does not serve it, docs/research/20)
//   - the rpc.access switch applies to the XO node: requires-key answers 401 to everything (nothing here ever
//     accepts a key), down closes the connection without an answer
//   - eth_chainId comes from the configuration, so the Base endpoint answers it even without a Base chain
//   - batches are answered element by element

import { JSON_RPC, rpcError, rpcResult, type RpcId } from "./errors.js";
import { POLICY_PAYMASTER } from "../../src/xo/chain/constants.js";
import { ChainUnavailableError, type ChainName, type JsonRpcRequest, type JsonRpcResponse } from "./chains.js";
import { CHAIN_IDS } from "./chains.js";
import type { MockEnv } from "./env.js";
import type { MockListener, MockReply, MockRequest } from "./listener.js";
import { BASE_RPC_CLIENT_VERSION, RPC_READ_METHODS, XO_RPC_CLIENT_VERSION, XO_RPC_MAX_LOG_RANGE_BLOCKS } from "./observed.js";

const hexQuantity = (value: number): string => `0x${value.toString(16)}`;

function isRequest(value: unknown): value is JsonRpcRequest {
  return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { method?: unknown }).method === "string";
}

function callTarget(params: unknown): string | undefined {
  const first = Array.isArray(params) ? (params[0] as { to?: unknown } | undefined) : undefined;
  return typeof first?.to === "string" ? first.to.toLowerCase() : undefined;
}

function idOf(value: unknown): RpcId {
  const id = typeof value === "object" && value !== null ? (value as { id?: unknown }).id : undefined;
  return typeof id === "string" || typeof id === "number" ? id : null;
}

// The access rule shared by the XO RPC and the bundler reads (UO9: "keyless reads stay open" is an assumption).
export function accessGate(env: MockEnv): MockReply | undefined {
  const access = env.switches.get("rpc.access");
  if (access === "requires-key") return { status: 401, json: rpcError(null, JSON_RPC.keyRequired, "api_key required") };
  if (access === "down") return { status: 200, drop: true };
  return undefined;
}

export function parseBody(request: MockRequest): { ok: true; value: unknown } | { ok: false; reply: MockReply } {
  try {
    return { ok: true, value: JSON.parse(request.body) as unknown };
  } catch {
    return { ok: false, reply: { status: 200, json: rpcError(null, JSON_RPC.parseError, "Parse error") } };
  }
}

export function registerRpc(listener: MockListener, env: MockEnv, which: ChainName): void {
  const { chains } = env;
  const chainId = CHAIN_IDS[which];

  async function resolveBlock(tag: unknown, head: number): Promise<number | null> {
    if (tag === undefined || tag === null || tag === "latest" || tag === "pending" || tag === "safe" || tag === "finalized") return head;
    if (tag === "earliest") return 0;
    if (typeof tag === "string" && /^0x[0-9a-fA-F]{1,16}$/.test(tag)) return Number(BigInt(tag));
    return null;
  }

  async function checkLogRange(params: unknown): Promise<JsonRpcResponse["error"] | undefined> {
    const filter = Array.isArray(params) ? (params[0] as Record<string, unknown> | undefined) : undefined;
    if (filter === undefined || typeof filter !== "object" || filter === null) return { code: JSON_RPC.invalidParams, message: "invalid log filter" };
    if (filter["blockHash"] !== undefined) return undefined;
    const head = Number(BigInt(await chains.call<string>(which, "eth_blockNumber")));
    const from = await resolveBlock(filter["fromBlock"], head);
    const to = await resolveBlock(filter["toBlock"], head);
    if (from === null || to === null) return { code: JSON_RPC.invalidParams, message: "invalid block tag" };
    if (to >= from && to - from > XO_RPC_MAX_LOG_RANGE_BLOCKS) {
      return { code: JSON_RPC.invalidParams, message: `query exceeds max block range ${String(XO_RPC_MAX_LOG_RANGE_BLOCKS)}` };
    }
    return undefined;
  }

  async function dispatch(value: unknown): Promise<JsonRpcResponse> {
    if (!isRequest(value)) return rpcError(idOf(value), JSON_RPC.invalidRequest, "Invalid Request") as JsonRpcResponse;
    const id = idOf(value);
    const { method } = value;
    if (!(RPC_READ_METHODS as readonly string[]).includes(method)) return rpcError(id, JSON_RPC.methodNotFound, "Method not found") as JsonRpcResponse;
    if (method === "eth_chainId") return rpcResult(id, hexQuantity(chainId)) as JsonRpcResponse;
    if (method === "web3_clientVersion") return rpcResult(id, which === "xo" ? XO_RPC_CLIENT_VERSION : BASE_RPC_CLIENT_VERSION) as JsonRpcResponse;
    // Views of contracts that exist only in JavaScript (the Hyperlane router and Mailbox, the AccessManager, the
    // Base USDC, the Base transactions the Hyperlane emulation made): virtual.ts answers before anvil does.
    const virtual = await env.virtual.handle(which, method, value.params);
    if (virtual.handled) {
      return ("error" in virtual ? { jsonrpc: "2.0", id, error: virtual.error } : rpcResult(id, virtual.result)) as JsonRpcResponse;
    }
    // A read of the PolicyPaymaster sees the state paymaster.state asks for (paused(), checkPolicy).
    if (which === "xo" && method === "eth_call" && callTarget(value.params) === POLICY_PAYMASTER.toLowerCase()) await env.paymaster.reconcile();
    if (method === "eth_getLogs") {
      if (which === "base") return rpcError(id, JSON_RPC.methodNotFound, "eth_getLogs is not available on this endpoint") as JsonRpcResponse;
      if (chains.chain(which) !== undefined) {
        const refused = await checkLogRange(value.params);
        if (refused !== undefined) return { jsonrpc: "2.0", id, error: refused };
      }
    }
    try {
      return await chains.forward(which, { id, method, params: value.params ?? [] });
    } catch (error) {
      if (error instanceof ChainUnavailableError) return rpcError(id, JSON_RPC.internalError, `mock: ${error.message}`) as JsonRpcResponse;
      throw error;
    }
  }

  listener.route("POST", "/", async (request) => {
    if (which === "xo") {
      const gate = accessGate(env);
      if (gate !== undefined) return gate;
    }
    const body = parseBody(request);
    if (!body.ok) return body.reply;
    if (Array.isArray(body.value)) {
      if (body.value.length === 0) return { status: 200, json: rpcError(null, JSON_RPC.invalidRequest, "Invalid Request") };
      const answers: JsonRpcResponse[] = [];
      for (const element of body.value as unknown[]) answers.push(await dispatch(element));
      return { status: 200, json: answers };
    }
    return { status: 200, json: await dispatch(body.value) };
  });
}
