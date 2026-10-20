import assert from "node:assert/strict";
import { describe } from "node:test";

import { encodeFunctionData, getAddress, isAddress, pad, toHex, type Hex } from "viem";

import { deriveAccount } from "../../src/xo/account/derive.js";
import { ENTRY_POINT_ABI } from "../../src/xo/chain/abi.js";
import {
  BASE_CHAIN_ID,
  ENTRY_POINT_V07,
  KERNEL_FACTORY,
  KERNEL_IMPLEMENTATION,
  XO_CHAIN_ID,
  ACCOUNT_DEPLOYED_TOPIC,
} from "../../src/xo/chain/constants.js";
import { ChainReadError, RpcReader, readAccountCode, readImplementationSlot, readPaymasterPolicy, readTradingEnabled } from "../../src/xo/chain/reads.js";
import { BundlerClient, BundlerError } from "../../src/xo/userop/bundler.js";
import { buildOp, enableTradingCalls, approveCall } from "../anvil/scenarios.js";
import { loadBytecode } from "../anvil/bytecode.js";
import { entryPointNonceKey, kernelNonce } from "../anvil/userop.js";
import { CTF_EXCHANGE } from "../../src/xo/chain/constants.js";
import { ENTRY_POINT_V06_ADVERTISED, RPC_READ_METHODS, XO_RPC_CLIENT_VERSION } from "./observed.js";
import type { MockXo } from "./server.js";
import { deployOwner, enableTradingFor, postRpc, useMock } from "./testing.js";

const STATE_CHANGING_AND_OTHER_METHODS = [
  "eth_sendRawTransaction",
  "eth_sendTransaction",
  "eth_sign",
  "eth_signTransaction",
  "eth_accounts",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_getTransactionCount",
  "eth_newFilter",
  "eth_supportedEntryPoints",
  "personal_sign",
  "anvil_setBalance",
  "anvil_setCode",
  "anvil_setStorageAt",
  "anvil_mine",
  "anvil_impersonateAccount",
  "evm_mine",
  "evm_increaseTime",
  "evm_snapshot",
  "evm_revert",
  "evm_setNextBlockTimestamp",
  "debug_traceTransaction",
  "admin_nodeInfo",
  "txpool_status",
  "",
] as const;

function reader(mock: MockXo, url: string): RpcReader {
  return new RpcReader({ transport: mock.rpcTransport, url });
}

describe("JSON-RPC for chain 3223 and Base (rpc.access open)", () => {
  const harness = useMock({ chains: { xo: true, base: true }, profile: { "rpc.access": "open" } });
  // The harness puts the profile back to pessimistic between tests: every test opens the door itself.
  const open = (mock: MockXo): void => mock.setSwitch("rpc.access", "open");

  harness.it("answers eth_chainId from the configuration: 0xc97 for XO, 0x2105 for Base", async (mock) => {
    open(mock);
    assert.deepEqual((await postRpc(mock, "xoRpc", "eth_chainId", [], "a")).body, { jsonrpc: "2.0", id: "a", result: "0xc97" });
    assert.equal((await postRpc(mock, "baseRpc", "eth_chainId")).body["result"], "0x2105");
    assert.equal(BigInt("0xc97"), BigInt(XO_CHAIN_ID));
    assert.equal(BigInt("0x2105"), BigInt(BASE_CHAIN_ID));
    assert.equal((await postRpc(mock, "xoRpc", "web3_clientVersion")).body["result"], XO_RPC_CLIENT_VERSION);
  });

  harness.it("serves the spec's seven read methods from the anvil chain", async (mock) => {
    open(mock);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const { account } = await deployOwner(mock, 2);
    const laneKey = entryPointNonceKey(kernelNonce({ sequence: 0n }));
    const head = await chain.rpc<string>("eth_blockNumber");
    assert.equal((await postRpc(mock, "xoRpc", "eth_blockNumber")).body["result"], head);
    const code = (await postRpc(mock, "xoRpc", "eth_getCode", [KERNEL_FACTORY, "latest"])).body["result"];
    assert.equal(code, loadBytecode("kernel-factory").code);
    const nonce = (await postRpc(mock, "xoRpc", "eth_call", [{ to: ENTRY_POINT_V07, data: encodeFunctionData({ abi: ENTRY_POINT_ABI, functionName: "getNonce", args: [account, laneKey] }) }, "latest"])).body["result"];
    assert.equal(BigInt(nonce as string), (laneKey << 64n) + 1n, "one operation has landed in the account's validator lane");
    const slot = (await postRpc(mock, "xoRpc", "eth_getStorageAt", [account, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", "latest"])).body["result"];
    assert.equal(getAddress(`0x${(slot as string).slice(-40)}`), KERNEL_IMPLEMENTATION);
    const logs = (await postRpc(mock, "xoRpc", "eth_getLogs", [{ fromBlock: "0x0", toBlock: "latest", address: ENTRY_POINT_V07, topics: [ACCOUNT_DEPLOYED_TOPIC] }])).body["result"] as unknown[];
    assert.equal(logs.length, 1);
    const block = await chain.rpc<{ transactions: string[] }>("eth_getBlockByNumber", [head, false]);
    const hash = block.transactions[0] ?? "";
    const receipt = (await postRpc(mock, "xoRpc", "eth_getTransactionReceipt", [hash])).body["result"] as { status: string; transactionHash: string };
    assert.equal(receipt.status, "0x1");
    assert.equal(receipt.transactionHash, hash);
    assert.deepEqual(receipt, await chain.rpc("eth_getTransactionReceipt", [hash]));
    assert.equal((await postRpc(mock, "xoRpc", "eth_getTransactionByHash", [hash])).body["error"], undefined);
    assert.equal(BigInt((await postRpc(mock, "xoRpc", "eth_getBalance", [account, "latest"])).body["result"] as string), 0n);
    assert.equal(((await postRpc(mock, "xoRpc", "eth_getBlockByNumber", ["latest", false])).body["result"] as { number: string }).number, head);
    assert.equal(RPC_READ_METHODS.length, 11);
  });

  harness.it("passes a revert through as error code 3 with the revert data", async (mock) => {
    open(mock);
    const answer = await postRpc(mock, "xoRpc", "eth_call", [{ to: KERNEL_FACTORY, data: "0xdeadbeef" }, "latest"]);
    const error = answer.body["error"] as { code: number; message: string } | undefined;
    assert.ok(error !== undefined);
    assert.equal(error.code, 3);
    assert.match(error.message, /revert/i);
  });

  harness.it("serves Base from its own chain: the Kernel implementation there differs from XO's by the two chain-dependent immutables", async (mock) => {
    open(mock);
    const xo = (await postRpc(mock, "xoRpc", "eth_getCode", [KERNEL_IMPLEMENTATION, "latest"])).body["result"] as string;
    const base = (await postRpc(mock, "baseRpc", "eth_getCode", [KERNEL_IMPLEMENTATION, "latest"])).body["result"] as string;
    assert.equal(xo.length, base.length);
    let differing = 0;
    for (let i = 2; i < xo.length; i += 2) if (xo.slice(i, i + 2) !== base.slice(i, i + 2)) differing += 1;
    assert.ok(differing > 0 && differing <= 34, `${String(differing)} bytes differ`);
    // The paymaster and the stubs exist on XO only.
    assert.notEqual((await postRpc(mock, "xoRpc", "eth_getCode", [ENTRY_POINT_V07, "latest"])).body["result"], "0x");
  });

  harness.it("refuses XO eth_getLogs over more than 100,000 blocks, and allows exactly 100,000", async (mock) => {
    open(mock);
    const over = (await postRpc(mock, "xoRpc", "eth_getLogs", [{ fromBlock: "0x0", toBlock: toHex(100_001) }])).body["error"] as { code: number; message: string };
    assert.equal(over.code, -32602);
    assert.equal(over.message, "query exceeds max block range 100000");
    const exact = await postRpc(mock, "xoRpc", "eth_getLogs", [{ fromBlock: "0x0", toBlock: toHex(100_000) }]);
    assert.equal(exact.body["error"], undefined);
    assert.ok(Array.isArray(exact.body["result"]));
    const tags = await postRpc(mock, "xoRpc", "eth_getLogs", [{ fromBlock: "earliest", toBlock: "latest" }]);
    assert.equal(tags.body["error"], undefined, "a small chain is inside the limit");
    const bad = (await postRpc(mock, "xoRpc", "eth_getLogs", [{ fromBlock: "soon", toBlock: "latest" }])).body["error"] as { code: number };
    assert.equal(bad.code, -32602);
    assert.equal(((await postRpc(mock, "xoRpc", "eth_getLogs", [])).body["error"] as { code: number }).code, -32602);
    const byHash = await postRpc(mock, "xoRpc", "eth_getLogs", [{ blockHash: `0x${"11".repeat(32)}` }]);
    assert.doesNotMatch(String((byHash.body["error"] as { message?: string } | undefined)?.message ?? ""), /max block range/, "a blockHash filter has no range to limit");
  });

  harness.it("refuses Base eth_getLogs outright, however small the range", async (mock) => {
    open(mock);
    const answer = (await postRpc(mock, "baseRpc", "eth_getLogs", [{ fromBlock: "0x0", toBlock: "0x0" }])).body["error"] as { code: number; message: string };
    assert.equal(answer.code, -32601);
    assert.match(answer.message, /not available/);
  });

  for (const method of STATE_CHANGING_AND_OTHER_METHODS) {
    harness.it(`never forwards ${method === "" ? "an empty method name" : method}: Method not found, and the chain is untouched`, async (mock) => {
      open(mock);
      const chain = mock.chains.xo;
      assert.ok(chain !== undefined);
      const probe = pad("0xf1", { size: 20 });
      const headBefore = await chain.rpc<string>("eth_blockNumber");
      for (const door of ["xoRpc", "baseRpc"] as const) {
        const answer = await postRpc(mock, door, method, method.startsWith("anvil_setBalance") ? [probe, "0xde0b6b3a7640000"] : [], 9);
        assert.equal(answer.status, 200);
        assert.deepEqual(answer.body, { jsonrpc: "2.0", id: 9, error: { code: -32601, message: "Method not found" } }, `${door} ${method}`);
      }
      assert.equal(await chain.rpc<string>("eth_blockNumber"), headBefore, "no block was mined");
      assert.equal(BigInt(await chain.rpc<string>("eth_getBalance", [probe, "latest"])), 0n, "no balance was set");
    });
  }

  harness.it("answers a batch element by element, and refuses an empty batch", async (mock) => {
    open(mock);
    const response = await fetch(mock.urls.xoRpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
        { jsonrpc: "2.0", id: 2, method: "eth_sendRawTransaction", params: ["0x00"] },
        { jsonrpc: "2.0", id: 3, method: "eth_blockNumber", params: [] },
      ]),
    });
    const body = (await response.json()) as { id: number; result?: unknown; error?: { code: number } }[];
    assert.deepEqual(body.map((entry) => entry.id), [1, 2, 3]);
    assert.equal(body[0]?.result, "0xc97");
    assert.equal(body[1]?.error?.code, -32601);
    assert.ok(typeof body[2]?.result === "string");
    const empty = await fetch(mock.urls.xoRpc, { method: "POST", body: "[]" });
    assert.equal(((await empty.json()) as { error: { code: number } }).error.code, -32600);
  });

  harness.it("answers malformed input with the JSON-RPC error codes, keeps a string id, and only POST is routed", async (mock) => {
    open(mock);
    const send = async (body: string) => (await (await fetch(mock.urls.xoRpc, { method: "POST", body })).json()) as { id: unknown; error: { code: number } };
    assert.equal((await send("{not json")).error.code, -32700);
    assert.equal((await send("{}")).error.code, -32600);
    assert.equal((await send('{"jsonrpc":"2.0","id":5,"method":5}')).error.code, -32600);
    assert.equal((await send('{"jsonrpc":"2.0","id":"abc","method":"nope"}')).id, "abc");
    assert.equal((await fetch(mock.urls.xoRpc)).status, 405);
  });

  harness.it("the production RpcReader reads through it: code kind, implementation slot, trading flag, paymaster policy", async (mock) => {
    open(mock);
    // The default profile pauses the paymaster the first time anything reads it (paymaster.state); this test is about the policy table.
    mock.setSwitch("paymaster.state", "sponsor");
    const rpc = reader(mock, mock.urls.xoRpc);
    const { account } = await deployOwner(mock, 2);
    assert.equal(await readAccountCode(rpc, account), "kernel_proxy");
    assert.equal(await readAccountCode(rpc, deriveAccount(mock.chains.xo?.owner(6).address ?? account)), "none");
    assert.equal(await readImplementationSlot(rpc, account), KERNEL_IMPLEMENTATION);
    assert.equal((await readTradingEnabled({ rpc }, account)).state, "disabled");
    await enableTradingFor(mock, 2);
    const enabled = await readTradingEnabled({ rpc }, account);
    assert.equal(enabled.state, "enabled");
    assert.equal(enabled.source, "rpc");
    const policy = await readPaymasterPolicy(rpc);
    assert.equal(policy.paused, false);
    assert.ok(policy.probes.length >= 10);
    assert.deepEqual(
      policy.probes.filter((probe) => probe.allowed !== probe.expectedAllowed).map((probe) => probe.label),
      [],
      "the real PolicyPaymaster answers every probe of the 2026-10-18 table the way the table says",
    );
    await assert.rejects(rpc.request("eth_sendRawTransaction", ["0x00"]), (error: unknown) => error instanceof ChainReadError && error.code === "unsupported_method");
    assert.equal(mock.requestsTo("xoRpc").filter((entry) => entry.status === 200).length >= 1, true);
  });

  harness.it("the production RpcReader on the Base endpoint: reads work, getLogs fails as an upstream error", async (mock) => {
    open(mock);
    const base = reader(mock, mock.urls.baseRpc);
    assert.equal((await base.getCode(KERNEL_FACTORY)).length > 2, true);
    await assert.rejects(base.getLogs({ topic0: ACCOUNT_DEPLOYED_TOPIC }), (error: unknown) => error instanceof ChainReadError && error.code === "upstream_error");
  });

  harness.it("faults reach the JSON-RPC doors: a 5xx and a 429 are HTTP statuses, truncated JSON does not parse", async (mock) => {
    open(mock);
    mock.injectFault("5xx", { count: 1, listeners: ["xoRpc"] });
    assert.equal((await postRpc(mock, "xoRpc", "eth_chainId")).status, 503);
    mock.injectFault("429-retry-after", { count: 1, listeners: ["xoRpc"], retryAfterMs: 3000 });
    const limited = await fetch(mock.urls.xoRpc, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "3");
    mock.injectFault("truncated-json", { count: 1, listeners: ["baseRpc"] });
    const cut = await fetch(mock.urls.baseRpc, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
    await assert.rejects(cut.json());
  });
});

describe("rpc.access: the XO node only", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("pessimistic default is down: the connection closes with no answer; Base is a different host and still answers", async (mock) => {
    assert.equal(mock.switches.get("rpc.access"), "down");
    await assert.rejects(postRpc(mock, "xoRpc", "eth_chainId"));
    assert.equal((await postRpc(mock, "baseRpc", "eth_chainId")).body["result"], "0x2105");
    await assert.rejects(reader(mock, mock.urls.xoRpc).getCode(KERNEL_FACTORY), (error: unknown) => error instanceof ChainReadError && error.code === "upstream_error");
  });

  harness.it("requires-key: 401 to everything, and the reader latches and stops asking", async (mock) => {
    mock.setSwitch("rpc.access", "requires-key");
    const answer = await postRpc(mock, "xoRpc", "eth_chainId");
    assert.equal(answer.status, 401);
    assert.match(String((answer.body["error"] as { message: string }).message), /api_key/);
    const rpc = reader(mock, mock.urls.xoRpc);
    mock.clearRequests();
    await assert.rejects(rpc.getCode(KERNEL_FACTORY), (error: unknown) => error instanceof ChainReadError && error.code === "requires_key");
    assert.equal(rpc.requiresKey, true);
    await assert.rejects(rpc.getCode(KERNEL_FACTORY), (error: unknown) => error instanceof ChainReadError && error.code === "requires_key");
    assert.equal(mock.requestsTo("xoRpc").length, 1, "after the first 401 the reader sends nothing more");
    assert.equal((await postRpc(mock, "baseRpc", "eth_chainId")).status, 200);
  });

  harness.it("a key in the query string does not help: nothing here accepts a key", async (mock) => {
    mock.setSwitch("rpc.access", "requires-key");
    const response = await fetch(`${mock.urls.xoRpc}/?api_key=abcd1234`, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
    assert.equal(response.status, 401);
  });

  harness.it("open: reads work, and the reader never latches", async (mock) => {
    mock.setSwitch("rpc.access", "open");
    const rpc = reader(mock, mock.urls.xoRpc);
    assert.ok((await rpc.getCode(KERNEL_FACTORY)).length > 2);
    assert.equal(rpc.requiresKey, false);
  });
});

describe("the bundler's read surface", () => {
  const harness = useMock({ chains: { xo: true, base: false } });
  const open = (mock: MockXo): void => mock.setSwitch("rpc.access", "open");
  const bundler = (mock: MockXo) => new BundlerClient({ transport: mock.rpcTransport, url: mock.urls.bundler });

  harness.it("answers eth_chainId and advertises v0.6 and v0.7, which the production client reads", async (mock) => {
    open(mock);
    assert.equal((await postRpc(mock, "bundler", "eth_chainId")).body["result"], "0xc97");
    assert.deepEqual((await postRpc(mock, "bundler", "eth_supportedEntryPoints")).body["result"], [ENTRY_POINT_V06_ADVERTISED, ENTRY_POINT_V07]);
    assert.equal(isAddress(ENTRY_POINT_V06_ADVERTISED, { strict: true }), true, "the advertised v0.6 address passes a strict EIP-55 check");
    assert.equal(await bundler(mock).chainId(), XO_CHAIN_ID);
    assert.deepEqual(await bundler(mock).supportedEntryPoints(), [ENTRY_POINT_V06_ADVERTISED, ENTRY_POINT_V07]);
  });

  harness.it("refuses a batch array and anything outside the five methods", async (mock) => {
    open(mock);
    const batch = await fetch(mock.urls.bundler, { method: "POST", body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }]) });
    assert.deepEqual(await batch.json(), { jsonrpc: "2.0", id: null, error: { code: -32600, message: "batch requests are not supported" } });
    for (const method of ["web3_clientVersion", "debug_bundler_clearState", "pimlico_getUserOperationGasPrice", "eth_getUserOperationByHash", "eth_call"]) {
      assert.equal(((await postRpc(mock, "bundler", method)).body["error"] as { code: number }).code, -32601, method);
    }
  });

  harness.it("the write methods are served now (userops.ts): a malformed operation is -32602, never the old TODO answer", async (mock) => {
    open(mock);
    mock.setSwitch("bundler.estimate", "supported");
    for (const method of ["eth_estimateUserOperationGas", "eth_sendUserOperation"]) {
      const error = (await postRpc(mock, "bundler", method, [{}, ENTRY_POINT_V07])).body["error"] as { code: number; message: string };
      assert.equal(error.code, -32602, method);
      assert.doesNotMatch(error.message, /TODO-for-mock-write/);
    }
  });

  harness.it("returns the receipt of a landed operation, with only that operation's logs, and null for an unknown hash", async (mock) => {
    open(mock);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    // Two operations in one bundle: the second one's receipt must not carry the first one's logs.
    const first = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: [approveCall(CTF_EXCHANGE, 0n)] });
    const second = await buildOp({ chain, owner: chain.owner(3), init: true, sponsored: true, calls: enableTradingCalls() });
    const landed = await chain.handleOps([first.op, second.op]);
    assert.equal(landed.ok, true);
    const one = bundler(mock);
    const receiptOne = await one.getUserOperationReceipt(first.hash);
    const receiptTwo = await one.getUserOperationReceipt(second.hash);
    assert.ok(receiptOne !== null && receiptTwo !== null);
    assert.equal(receiptOne.sender, first.account);
    assert.equal(receiptTwo.sender, second.account);
    assert.equal(receiptOne.success, true);
    assert.equal(receiptOne.nonce, first.op.nonce);
    assert.equal(receiptTwo.nonce, second.op.nonce);
    assert.equal(receiptOne.transactionHash, receiptTwo.transactionHash, "one bundle, one transaction");
    assert.equal(receiptOne.actualGasCost, 0n, "zero fees");
    const raw = (await postRpc(mock, "bundler", "eth_getUserOperationReceipt", [first.hash])).body["result"] as { logs: { logIndex: string }[]; receipt: { status: string; logs: unknown[] }; paymaster: string; entryPoint: string; nonce: string };
    const rawTwo = (await postRpc(mock, "bundler", "eth_getUserOperationReceipt", [second.hash])).body["result"] as { logs: { logIndex: string }[] };
    assert.equal(raw.receipt.status, "0x1");
    assert.equal(raw.entryPoint, ENTRY_POINT_V07);
    assert.ok(raw.logs.length > 0 && rawTwo.logs.length > 0);
    assert.ok(raw.logs.length + rawTwo.logs.length <= raw.receipt.logs.length, "the two operations' logs do not overlap");
    const lastOfOne = Math.max(...raw.logs.map((log) => Number(BigInt(log.logIndex))));
    const firstOfTwo = Math.min(...rawTwo.logs.map((log) => Number(BigInt(log.logIndex))));
    assert.ok(lastOfOne < firstOfTwo);
    assert.equal(await one.getUserOperationReceipt(`0x${"ab".repeat(32)}` as Hex), null);
    const bad = (await postRpc(mock, "bundler", "eth_getUserOperationReceipt", ["0x12"])).body["error"] as { code: number };
    assert.equal(bad.code, -32602);
    assert.equal(((await postRpc(mock, "bundler", "eth_getUserOperationReceipt", [])).body["error"] as { code: number }).code, -32602);
    assert.equal(pad("0x1", { size: 32 }).length, 66);
  });

  harness.it("applies rpc.access: requires-key is 401 and the client records it, down closes the connection", async (mock) => {
    mock.setSwitch("rpc.access", "requires-key");
    assert.equal((await postRpc(mock, "bundler", "eth_chainId")).status, 401);
    await assert.rejects(bundler(mock).chainId(), (error: unknown) => error instanceof BundlerError && error.code === "requires_key");
    mock.setSwitch("rpc.access", "down");
    await assert.rejects(postRpc(mock, "bundler", "eth_chainId"));
    await assert.rejects(bundler(mock).chainId(), (error: unknown) => error instanceof BundlerError && error.code === "transport_error");
  });
});
