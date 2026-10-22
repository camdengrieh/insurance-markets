import assert from "node:assert/strict";
import { test } from "node:test";

import { lastTradeOf } from "../../api/chain-fields.js";
import type { ChainKey } from "../../api/config.js";
import { CHAIN_SPECS, topicsOf } from "../../api/indexer/chains.js";
import { ChainIndexer } from "../../api/indexer/indexer.js";
import { RpcPool } from "../../api/indexer/rpc-pool.js";
import { SqliteIndexStore } from "../../api/store.js";
import { replayPost } from "../../sdk/chain/fixtures/replay.js";
import { decToAtomic } from "../../sdk/money/decimal.js";
import { createRpcPort, quantityHex, type RpcHttpResponse, type RpcPost } from "../../sdk/chain/rpc.js";
import { captureConfig, captureSpec, INDEXER_METHODS } from "./fixtures/capture.js";
import { indexerRecording, replayExchanges } from "./fixtures/recorded.js";

// The indexer against one recorded pass per chain (test/api/fixtures, real public RPC answers of 2026-10-22), and against
// transports that fail in each way the pool and the range logic must handle.

const NOW = Date.parse("2026-10-22T14:00:00.000Z");
const nowMs = (): number => NOW;

interface Sent {
  readonly method: string;
  readonly params: unknown;
}

// A post that records every request item, then answers from `inner`.
function watched(inner: RpcPost, sent: Sent[]): RpcPost {
  return async (url, body, options) => {
    for (const item of (Array.isArray(body) ? body : [body]) as Array<{ method: string; params: unknown }>) sent.push({ method: item.method, params: item.params });
    return inner(url, body, options);
  };
}

function portFor(chain: ChainKey, post: RpcPost, url = indexerRecording(chain).rpc) {
  return createRpcPort({ url, post, methods: [...INDEXER_METHODS], maxLogBlockRange: 10_000n });
}

function replayIndexer(chain: ChainKey, extra: { readonly sent?: Sent[]; readonly before?: RpcPost[] } = {}) {
  const recording = indexerRecording(chain);
  const store = SqliteIndexStore.open(":memory:");
  const replay = replayPost(replayExchanges(chain));
  const sent = extra.sent ?? [];
  const ports = [...(extra.before ?? []).map((post, i) => portFor(chain, watched(post, sent), `https://failing-${i}.rpc.example.org/`)), portFor(chain, watched(replay, sent))];
  const indexer = new ChainIndexer({ spec: captureSpec(chain), config: captureConfig(chain, recording.rpc), store, pool: new RpcPool(CHAIN_SPECS[chain].chainId, ports, nowMs), nowMs, maxRangesPerPass: 1 });
  return { store, indexer, sent, recording };
}

function logRequests(sent: readonly Sent[]): Array<{ fromBlock: bigint; toBlock: bigint; address: unknown; topics: unknown }> {
  return sent
    .filter((s) => s.method === "eth_getLogs")
    .map((s) => {
      const filter = (s.params as Array<Record<string, unknown>>)[0] as Record<string, unknown>;
      return { fromBlock: BigInt(String(filter["fromBlock"])), toBlock: BigInt(String(filter["toBlock"])), address: filter["address"], topics: filter["topics"] };
    });
}

for (const chain of ["polygon", "base", "xo"] as const) {
  test(`${chain}: one recorded pass checks every pin, reads one bounded range and stores what it decodes`, async () => {
    const { store, indexer, sent, recording } = replayIndexer(chain);
    await indexer.pass();
    const status = indexer.status();
    // The recording was made far below the head, so the indexer is behind, never failed.
    assert.equal(status.state, "behind", status.reason ?? "");
    const start = BigInt(recording.inputs.startBlock);
    assert.equal(status.startBlock, start.toString());
    assert.equal(status.cursorBlock, (start + BigInt(recording.inputs.span) - 1n).toString());
    // Every pinned contract's code was asked for before any log.
    const firstLog = sent.findIndex((s) => s.method === "eth_getLogs");
    const codes = sent.slice(0, firstLog).filter((s) => s.method === "eth_getCode").map((s) => String((s.params as unknown[])[0]).toLowerCase());
    for (const contract of CHAIN_SPECS[chain].contracts) assert.ok(codes.includes(contract.pin.address.toLowerCase()), contract.pin.name);
    // Never an open or unbounded range: numeric bounds, within the span, the pinned contracts only, the indexed topics only.
    const logs = logRequests(sent);
    assert.equal(logs.length, 1);
    for (const range of logs) {
      assert.ok(range.toBlock >= range.fromBlock && range.toBlock - range.fromBlock + 1n <= BigInt(recording.inputs.span));
      assert.deepEqual([...(range.address as string[])].sort(), CHAIN_SPECS[chain].contracts.map((c) => c.pin.address.toLowerCase()).sort());
      assert.deepEqual(range.topics, [topicsOf(CHAIN_SPECS[chain])]);
    }
    const counts = store.counts();
    assert.equal(counts.incompleteRanges, 0, "every log the node returned decoded");
    const expected = { polygon: { fills: 80, resolutions: 0, preparations: 0 }, base: { fills: 5, resolutions: 5, preparations: 6 }, xo: { fills: 96, resolutions: 0, preparations: 0 } }[chain];
    assert.deepEqual({ fills: counts.fills, resolutions: counts.resolutions, preparations: counts.preparations }, expected);
    store.close();
  });
}

test("a fill becomes a last trade with an exact price, its side and the time window of its block", async () => {
  const { store, indexer } = replayIndexer("base");
  await indexer.pass();
  const spec = CHAIN_SPECS.base;
  const anyFill = (store as unknown as { db: { prepare(sql: string): { get(): Record<string, unknown> } } }).db.prepare("SELECT token_id FROM fills LIMIT 1").get();
  const tokenId = String(anyFill["token_id"]);
  const fill = store.lastFills(spec.chainId, [tokenId]).get(tokenId);
  assert.ok(fill);
  const trade = lastTradeOf(fill, spec);
  assert.match(trade.price ?? "", /^(0|1)(\.\d{1,6})?$/);
  assert.ok(Date.parse(trade.tradedBetweenUtc[0]) <= Date.parse(trade.tradedBetweenUtc[1]));
  // The price is collateral over shares, both 6-decimal amounts, rounded half to even at 6 places.
  const collateral = BigInt(fill.side === "buy" ? fill.makerAmount : fill.takerAmount);
  const shares = BigInt(fill.side === "buy" ? fill.takerAmount : fill.makerAmount);
  const scaled = (collateral * 1_000_000n * 2n + shares) / (2n * shares);
  assert.deepEqual(decToAtomic(trade.price, 6), { ok: true, value: scaled });
  store.close();
});

test("base: the recorded resolutions are stored with payouts that sum to their denominator", async () => {
  const { store, indexer } = replayIndexer("base");
  await indexer.pass();
  const rows = (store as unknown as { db: { prepare(sql: string): { all(): Array<Record<string, unknown>> } } }).db.prepare("SELECT condition_id, payouts, denominator FROM resolutions").all();
  assert.equal(rows.length, 5);
  for (const row of rows) {
    const payouts = (JSON.parse(String(row["payouts"])) as string[]).map(BigInt);
    assert.equal(payouts.reduce((a, b) => a + b, 0n), BigInt(String(row["denominator"])));
    const prepared = store.resolutions(CHAIN_SPECS.base.chainId, [String(row["condition_id"])]);
    assert.equal(prepared.size, 1);
  }
  store.close();
});

test("a failing endpoint is set aside and the next one answers; nothing is retried on the failed one", async () => {
  const sent: Sent[] = [];
  let failed = 0;
  const down: RpcPost = async () => {
    failed += 1;
    return { status: 503, body: "unavailable" } satisfies RpcHttpResponse;
  };
  const { store, indexer } = replayIndexer("xo", { sent, before: [down] });
  await indexer.pass();
  const status = indexer.status();
  assert.equal(status.state, "behind");
  assert.equal(failed, 1, "the failing endpoint was asked once and then set aside");
  assert.deepEqual(status.endpoints.map((e) => [e.up, e.lastError]), [
    [false, "http_status"],
    [true, null],
  ]);
  // The endpoint list names hosts, never a full URL.
  for (const endpoint of status.endpoints) assert.doesNotMatch(endpoint.host, /\//);
  assert.equal(store.counts().fills, 96);
  store.close();
});

test("an endpoint on the wrong chain is never used", async () => {
  const wrong: RpcPost = async (_url, body) => ({ status: 200, body: { jsonrpc: "2.0", id: (body as { id: number }).id, result: "0x1" } });
  const { store, indexer } = replayIndexer("xo", { before: [wrong] });
  await indexer.pass();
  assert.equal(indexer.status().endpoints[0]?.lastError, "wrong_chain");
  assert.equal(store.counts().fills, 96);
  store.close();
});

// A small fake chain for the range, reorg and pin cases: blocks with fixed hashes, no logs.
function fakeChain(options: { head: bigint; refuseAbove?: number; hashSalt?: () => string; codeOf?: (address: string) => string | null }) {
  const sent: Sent[] = [];
  const replay = replayPost(replayExchanges("xo"));
  const post: RpcPost = async (url, body, opts) => {
    const item = body as { id: number; method: string; params: unknown[] };
    sent.push({ method: item.method, params: item.params });
    const answer = (result: unknown): RpcHttpResponse => ({ status: 200, body: { jsonrpc: "2.0", id: item.id, result } });
    switch (item.method) {
      case "eth_chainId":
        return answer(quantityHex(3223n));
      case "eth_blockNumber":
        return answer(quantityHex(options.head));
      case "eth_getBlockByNumber": {
        const n = BigInt(String(item.params[0]));
        const hash = `0x${(options.hashSalt?.() ?? "aa").padEnd(2, "a")}${n.toString(16).padStart(62, "0")}`.slice(0, 66);
        return answer({ number: quantityHex(n), hash, timestamp: quantityHex(1_700_000_000n + n) });
      }
      case "eth_getLogs": {
        const filter = item.params[0] as { fromBlock: string; toBlock: string };
        const span = Number(BigInt(filter.toBlock) - BigInt(filter.fromBlock) + 1n);
        if (options.refuseAbove !== undefined && span > options.refuseAbove) return { status: 200, body: { jsonrpc: "2.0", id: item.id, error: { code: -32602, message: "block range too large" } } };
        return answer([]);
      }
      default: {
        const own = item.method === "eth_getCode" ? options.codeOf?.(String(item.params[0])) : null;
        if (own !== null && own !== undefined) return answer(own);
        return replay(url, body, opts);
      }
    }
  };
  return { post, sent };
}

test("a node that refuses a range size halves the span until it answers, never past one block", async () => {
  const chain = fakeChain({ head: 100_000n, refuseAbove: 60 });
  const store = SqliteIndexStore.open(":memory:");
  const spec = { ...CHAIN_SPECS.xo, initialSpan: 500, maxSpan: 500 };
  const indexer = new ChainIndexer({ spec, config: { chain: "xo", rpcUrls: ["https://rpc.example.org/"], startBlock: 10_000n, confirmations: 64 }, store, pool: new RpcPool(3223, [portFor("xo", chain.post, "https://rpc.example.org/")], nowMs), nowMs, maxRangesPerPass: 3 });
  await indexer.pass();
  const spans = logRequests(chain.sent).map((r) => Number(r.toBlock - r.fromBlock + 1n));
  assert.deepEqual(spans.slice(0, 5), [500, 250, 125, 62, 31]);
  assert.ok(spans.every((s) => s <= 10_000));
  assert.equal(indexer.status().state, "behind");
  // Each answered range of 31 grows the span to 62, which is refused again: three ranges of 31.
  assert.equal(store.cursor(3223)?.block, 10_000n - 1n + 93n);
  store.close();
});

test("a reorg that replaced the last indexed block rewinds by the confirmation depth and deletes what was above", async () => {
  let salt = "aa";
  const chain = fakeChain({ head: 20_000n, hashSalt: () => salt });
  const store = SqliteIndexStore.open(":memory:");
  const spec = { ...CHAIN_SPECS.xo, initialSpan: 100, maxSpan: 100 };
  const indexer = new ChainIndexer({ spec, config: { chain: "xo", rpcUrls: ["https://rpc.example.org/"], startBlock: 10_000n, confirmations: 64 }, store, pool: new RpcPool(3223, [portFor("xo", chain.post, "https://rpc.example.org/")], nowMs), nowMs, maxRangesPerPass: 2 });
  await indexer.pass();
  assert.equal(store.cursor(3223)?.block, 10_199n);
  salt = "bb";
  await indexer.pass();
  assert.equal(store.cursor(3223)?.block, 10_199n - 64n);
  store.close();
});

test("a contract whose code no longer matches its pin stops the chain's indexer and nothing is read", async () => {
  const exchange = CHAIN_SPECS.xo.contracts[0]?.pin.address.toLowerCase();
  const chain = fakeChain({ head: 20_000n, codeOf: (address) => (address.toLowerCase() === exchange ? "0x6080" : null) });
  const store = SqliteIndexStore.open(":memory:");
  const indexer = new ChainIndexer({ spec: CHAIN_SPECS.xo, config: { chain: "xo", rpcUrls: ["https://rpc.example.org/"], startBlock: 10_000n, confirmations: 64 }, store, pool: new RpcPool(3223, [portFor("xo", chain.post, "https://rpc.example.org/")], nowMs), nowMs });
  await indexer.pass();
  await indexer.pass();
  assert.equal(indexer.status().state, "pin_failed");
  assert.match(indexer.status().reason ?? "", /not the code pinned/);
  assert.equal(chain.sent.filter((s) => s.method === "eth_getLogs").length, 0);
  assert.equal(store.cursor(3223), null);
  store.close();
});
