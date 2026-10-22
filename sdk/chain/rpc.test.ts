import { describe, expect, it } from "vitest";

import { createRpcPort, isRpcError, parseLog, rpcPostFromFetch, RPC_READ_METHODS, type RpcHttpResponse, type RpcPort } from "./rpc.js";
import type { FetchLike } from "../model.js";

// The one JSON-RPC port: what it may send, how it reads answers, and how it batches. Every test drives it through an
// in-memory transport; nothing here touches the network.

const URL_ = "https://rpc.example.test/";
const ADDRESS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045" as const;
const TOPIC = `0x${"ab".repeat(32)}` as const;

interface Sent {
  readonly body: unknown;
}

function fake(handler: (body: unknown) => RpcHttpResponse | Promise<RpcHttpResponse>): { post: (url: string, body: unknown) => Promise<RpcHttpResponse>; sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    post: async (_url, body) => {
      sent.push({ body });
      return handler(body);
    },
  };
}

// A node that answers eth_call with one word and eth_getCode with "0x60", in the request's own ids.
const node = (options: { readonly arrays?: boolean } = {}) =>
  fake((body) => {
    const answer = (item: { id: number; method: string }) => ({ jsonrpc: "2.0", id: item.id, result: item.method === "eth_getCode" ? "0x60" : `0x${"00".repeat(31)}01` });
    if (Array.isArray(body)) {
      if (options.arrays === false) return { status: 400, body: { jsonrpc: "2.0", id: null, error: { code: -32600, message: "batch requests are not supported" } } };
      return { status: 200, body: (body as Array<{ id: number; method: string }>).map(answer) };
    }
    return { status: 200, body: answer(body as { id: number; method: string }) };
  });

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (isRpcError(error)) return `${error.code}:${error.detail}`;
    throw error;
  }
  return "none";
}

const call = { to: ADDRESS, data: "0x70a08231" as const };

describe("the read allowlist", () => {
  it("holds only read methods, none that sends, signs or changes node state", () => {
    for (const method of RPC_READ_METHODS) expect(method).toMatch(/^eth_(?:blockNumber|call|chainId|getBalance|getBlockByNumber|getCode|getLogs|getStorageAt|getTransactionReceipt)$/);
  });

  it("refuses to build a port that names a method outside it", () => {
    expect(() => createRpcPort({ url: URL_, post: node().post, methods: ["eth_sendRawTransaction" as never] })).toThrow();
  });

  it("refuses a method the port did not name, before any request", async () => {
    const { post, sent } = node();
    const port = createRpcPort({ url: URL_, post, methods: ["eth_call"] });
    expect(await code(port.getCode(ADDRESS))).toBe("unsupported_method:method_not_allowed");
    expect(await code(port.requestMany([{ method: "eth_getCode", params: [ADDRESS, "latest"] }]))).toBe("unsupported_method:method_not_allowed");
    expect(sent).toHaveLength(0);
  });

  it("accepts only an https (or loopback http) URL with no credentials, query or fragment", () => {
    const post = node().post;
    for (const url of ["http://rpc.example.test/", "https://user:pw@rpc.example.test/", "https://rpc.example.test/?api_key=1", "https://rpc.example.test/#x", "nonsense"]) {
      expect(() => createRpcPort({ url, post, methods: ["eth_call"] }), url).toThrow();
    }
    expect(() => createRpcPort({ url: "http://127.0.0.1:8545/", post, methods: ["eth_call"] })).not.toThrow();
  });
});

describe("answers", () => {
  const answering = (response: RpcHttpResponse): RpcPort => createRpcPort({ url: URL_, post: fake(() => response).post, methods: ["eth_call", "eth_getCode", "eth_blockNumber"] });

  it("latches 'requires key' on a 401, a 403 or an api_key complaint, and sends nothing more", async () => {
    for (const response of [
      { status: 401, body: "no" },
      { status: 403, body: "no" },
      { status: 500, body: "invalid api_key" },
      { status: 200, body: { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "missing API key" } } },
    ]) {
      const { post, sent } = fake(() => response);
      const port = createRpcPort({ url: URL_, post, methods: ["eth_call"] });
      expect((await code(port.call(call))).startsWith("requires_key"), JSON.stringify(response)).toBe(true);
      expect(port.requiresKey).toBe(true);
      expect(await code(port.call(call))).toBe("requires_key:requires_key_latched");
      expect(sent).toHaveLength(1);
    }
  });

  it("never latches on a revert, whatever its text says", async () => {
    const port = answering({ status: 200, body: { jsonrpc: "2.0", id: 1, error: { code: 3, message: "execution reverted: api_key" } } });
    expect(await code(port.call(call))).toBe("reverted:reverted");
    expect(port.requiresKey).toBe(false);
  });

  it("maps limits, timeouts and other statuses to stable codes", async () => {
    expect(await code(answering({ status: 429, body: "slow", retryAfterMs: 3000 }).call(call))).toBe("rate_limited:http_429");
    expect(await code(answering({ status: 200, body: { jsonrpc: "2.0", id: 1, error: { code: -32005, message: "limit exceeded" } } }).call(call))).toBe("rate_limited:rpc_limited");
    expect(await code(answering({ status: 504, body: "" }).call(call))).toBe("timeout:http_504");
    expect(await code(answering({ status: 502, body: "" }).call(call))).toBe("http_status:http_502");
    expect(await code(answering({ status: 200, body: { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "x" } } }).call(call))).toBe("upstream_error:rpc_error");
  });

  it("refuses an answer to another id, a missing result, a result of the wrong shape, or text that is not JSON", async () => {
    expect(await code(answering({ status: 200, body: { jsonrpc: "2.0", id: 9, result: "0x" } }).call(call))).toBe("invalid_response:id_mismatch");
    expect(await code(answering({ status: 200, body: { jsonrpc: "2.0", id: 1 } }).call(call))).toBe("invalid_response:id_mismatch");
    expect(await code(answering({ status: 200, body: { jsonrpc: "2.0", id: 1, result: "0x123" } }).call(call))).toBe("invalid_response:result_shape");
    expect(await code(answering({ status: 200, body: { jsonrpc: "2.0", id: 1, result: "0x" } }).blockNumber())).toBe("invalid_response:result_shape");
    expect(await code(answering({ status: 200, body: "<html>" }).call(call))).toBe("invalid_response:invalid_json");
  });

  it("validates the shape of a log row and drops pending ones", () => {
    const row = { address: ADDRESS, topics: [TOPIC], data: "0x", blockNumber: "0x10", transactionHash: `0x${"11".repeat(32)}`, logIndex: "0x2" };
    expect(parseLog(row)).toMatchObject({ blockNumber: 16n, logIndex: 2 });
    expect(parseLog({ ...row, blockNumber: null })).toBe("pending");
    expect(parseLog({ ...row, topics: [null, TOPIC] })).toBeNull();
    expect(parseLog({ ...row, topics: [] })).toBeNull();
    expect(parseLog({ ...row, transactionHash: null })).toBeNull();
    expect(parseLog({ ...row, topics: [TOPIC, null, null, null] })).toMatchObject({ topics: [TOPIC] });
  });
});

describe("batching", () => {
  it("sends many requests as one array, matched by id", async () => {
    const { post, sent } = node();
    const port = createRpcPort({ url: URL_, post, methods: ["eth_call"] });
    const results = await port.callMany([call, call, call]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(port.mode()).toBe("batch");
  });

  it("falls back to single requests for good when the endpoint refuses arrays", async () => {
    const { post, sent } = node({ arrays: false });
    const port = createRpcPort({ url: URL_, post, methods: ["eth_call"] });
    await port.callMany([call, call]);
    expect(port.mode()).toBe("single");
    const before = sent.length;
    await port.callMany([call, call]);
    expect(sent.slice(before).every((entry) => !Array.isArray(entry.body))).toBe(true);
  });

  it("throws a limit or a server error on a batch instead of changing mode", async () => {
    for (const status of [429, 503]) {
      const port = createRpcPort({ url: URL_, post: fake(() => ({ status, body: "" })).post, methods: ["eth_call"] });
      expect(await code(port.callMany([call, call]))).not.toBe("none");
      expect(port.mode()).toBe("none");
    }
  });
});

describe("logs", () => {
  const rows = (logs: unknown[]) => fake((body) => ({ status: 200, body: { jsonrpc: "2.0", id: (body as { id: number }).id, result: logs } }));
  const row = (overrides: Record<string, unknown> = {}) => ({ address: ADDRESS, topics: [TOPIC], data: "0x", blockNumber: "0x10", transactionHash: `0x${"11".repeat(32)}`, logIndex: "0x0", ...overrides });

  it("refuses an open range, a range wider than the limit, and a filter without an emitter", async () => {
    const port = createRpcPort({ url: URL_, post: rows([]).post, methods: ["eth_getLogs"], maxLogBlockRange: 100n });
    expect(await code(port.getLogs({ address: ADDRESS, topics: [TOPIC], fromBlock: 1n, toBlock: "latest" }))).toBe("invalid_input:open_block_range");
    expect(await code(port.getLogs({ address: ADDRESS, topics: [TOPIC], fromBlock: 1n, toBlock: 101n }))).toBe("invalid_input:block_range_too_wide");
    expect(await code(port.getLogs({ address: null, topics: [TOPIC], fromBlock: 1n, toBlock: 2n }))).toBe("invalid_input:log_address_count");
    expect(await code(port.getLogs({ address: ADDRESS, topics: [TOPIC], fromBlock: 1n, toBlock: 100n }))).toBe("none");
  });

  it("drops and counts rows that do not match the filter, pending rows and malformed rows", async () => {
    const other = `0x${"cd".repeat(32)}`;
    const port = createRpcPort({ url: URL_, post: rows([row(), row({ topics: [other] }), row({ address: `0x${"22".repeat(20)}` }), row({ blockNumber: "0x999" }), row({ blockNumber: null }), { junk: true }]).post, methods: ["eth_getLogs"] });
    const read = await port.getLogs({ address: ADDRESS, topics: [TOPIC], fromBlock: 1n, toBlock: 100n });
    expect(read.logs).toHaveLength(1);
    expect([read.droppedUnmatched, read.droppedPending, read.droppedMalformed]).toEqual([3, 1, 1]);
  });

  it("names a node's range refusal so a caller can ask for less", async () => {
    const refusing = fake(() => ({ status: 200, body: { jsonrpc: "2.0", id: 1, error: { code: -32701, message: "exceed maximum block range: 10000" } } }));
    const port = createRpcPort({ url: URL_, post: refusing.post, methods: ["eth_getLogs"] });
    expect(await code(port.getLogs({ address: ADDRESS, topics: [TOPIC], fromBlock: 1n, toBlock: 2n }))).toBe("upstream_error:logs_range_refused");
  });
});

describe("the fetch transport", () => {
  const response = (status: number, text: string) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => JSON.parse(text) as unknown, text: async () => text });

  it("posts JSON with only a content type, caps the body, and keeps non-JSON as text", async () => {
    const seen: Array<{ input: string; init: unknown }> = [];
    const fetchLike: FetchLike = async (input, init) => {
      seen.push({ input, init });
      return response(200, "x".repeat(20));
    };
    const post = rpcPostFromFetch(fetchLike, { maxBodyChars: 10 });
    expect(await code(post(URL_, {}, {}))).toBe("too_large:body_too_large");
    expect(seen[0]?.init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
    const plain = rpcPostFromFetch(async () => response(200, "nope"));
    expect(await plain(URL_, {}, {})).toEqual({ status: 200, body: "nope", retryAfterMs: null });
  });

  it("gives up at the deadline on the injected clock, and passes a thrown fetch as the cause", async () => {
    const hung = rpcPostFromFetch(() => new Promise(() => undefined), { nowMs: () => 1_000 });
    expect(await code(hung(URL_, {}, { deadlineAtMs: 1_020 }))).toBe("timeout:deadline");
    expect(await code(hung(URL_, {}, { deadlineAtMs: 999 }))).toBe("timeout:deadline_passed");
    const failure = new TypeError("Failed to fetch");
    const down = rpcPostFromFetch(async () => Promise.reject(failure));
    try {
      await down(URL_, {}, {});
    } catch (error) {
      expect(isRpcError(error) && error.code === "unreachable" && error.cause === failure).toBe(true);
    }
  });
});
