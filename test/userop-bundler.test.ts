// Bundler client: v0.7 unpacked wire shape, single requests only, error mapping, the write guard.
// No network: a scripted transport stands in for the bundler.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAddress, recoverAddress, zeroAddress, type Hex } from "viem";
import { formatUserOperationRequest } from "viem/account-abstraction";

import { ENTRY_POINT_V07, KERNEL_FACTORY, POLICY_PAYMASTER, XO_CHAIN_ID } from "../src/xo/chain/constants.js";
import { isRelayError } from "../src/relay/errors.js";
import { SECP256K1_N } from "../src/xo/signing/constants.js";
import { parseFlags, requireFlag } from "../src/relay/flags.js";
import {
  BUNDLER_METHODS,
  BundlerClient,
  BundlerError,
  DUMMY_USEROP_SIGNATURE,
  enableTradingCalls,
  firstOpNonce,
  fromRpcUserOperation,
  kernelNonce,
  normalizeSignature,
  parseBundlerRequest,
  parseSendParams,
  prepareUserOp,
  redeemCalls,
  signingDigests,
  toRpcUserOperation,
  unpackUserOp,
  userOpHash,
  validateBundlerUrl,
  withSignature,
  type BundlerErrorCode,
  type BundlerHttpResponse,
  type BundlerTransport,
  type PackedUserOp,
} from "./fixtures/userop/api.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";
import { loadGolden, toPacked } from "./fixtures/userop/golden.js";
import { seededRandom } from "./fixtures/userop/prng.js";

const URL_OK = "https://bundler.example.invalid/";
// The at-sign is spelled out so no source line in this repository carries one next to a user name.
const AT = String.fromCharCode(64);
const OWNER = ANVIL_TEST_ACCOUNTS[0] as (typeof ANVIL_TEST_ACCOUNTS)[number];

class FakeBundler implements BundlerTransport {
  readonly requests: Record<string, unknown>[] = [];
  readonly urls: string[] = [];
  constructor(private readonly handler: (request: Record<string, unknown>, index: number) => BundlerHttpResponse | Promise<BundlerHttpResponse> | never) {}
  async postJson(url: string, body: unknown): Promise<BundlerHttpResponse> {
    this.urls.push(url);
    this.requests.push(body as Record<string, unknown>);
    return this.handler(body as Record<string, unknown>, this.requests.length - 1);
  }
}

const reply = (request: Record<string, unknown>, result: unknown): BundlerHttpResponse => ({ status: 200, body: { jsonrpc: "2.0", id: request.id, result } });
const replyError = (request: Record<string, unknown>, code: number, message: string, status = 200): BundlerHttpResponse => ({
  status,
  body: { jsonrpc: "2.0", id: request.id, error: { code, message } },
});

async function signedDeploy(): Promise<{ op: PackedUserOp; hash: Hex; unsigned: PackedUserOp }> {
  const p = prepareUserOp({ action: "deploy_enable_trading", owner: OWNER.address, calls: enableTradingCalls(), nonce: firstOpNonce(), deployed: false, sponsor: true });
  const signature = await OWNER.signMessage({ message: { raw: p.userOpHash } });
  return { op: withSignature(p.op, signature), hash: p.userOpHash, unsigned: p.op };
}

async function failure(run: () => Promise<unknown>): Promise<BundlerError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof BundlerError, `expected a BundlerError, got ${String(error)}`);
    return error;
  }
  throw new assert.AssertionError({ message: "expected a failure" });
}

async function expectCode(run: () => Promise<unknown>, code: BundlerErrorCode): Promise<BundlerError> {
  const error = await failure(run);
  assert.equal(error.code, code, error.message);
  return error;
}

describe("the v0.7 unpacked wire shape", () => {
  it("equals what viem's own request formatter produces, for a deployment with a paymaster", async () => {
    const { op } = await signedDeploy();
    const f = unpackUserOp(op);
    const viemShape = formatUserOperationRequest({
      sender: f.sender,
      nonce: f.nonce,
      callData: f.callData,
      callGasLimit: f.callGasLimit,
      verificationGasLimit: f.verificationGasLimit,
      preVerificationGas: f.preVerificationGas,
      maxFeePerGas: f.maxFeePerGas,
      maxPriorityFeePerGas: f.maxPriorityFeePerGas,
      signature: f.signature as Hex,
      factory: getAddress(f.initCode.slice(0, 42)),
      factoryData: `0x${f.initCode.slice(42)}` as Hex,
      paymaster: POLICY_PAYMASTER,
      paymasterData: "0x",
      paymasterVerificationGasLimit: f.paymaster?.verificationGasLimit,
      paymasterPostOpGasLimit: f.paymaster?.postOpGasLimit,
    });
    assert.deepEqual(toRpcUserOperation(op), viemShape);
  });

  it("fields: factory and factoryData split the initCode, a paymaster carries its two limits and empty data", async () => {
    const { op } = await signedDeploy();
    const rpc = toRpcUserOperation(op);
    assert.deepEqual(Object.keys(rpc).sort(), [
      "callData", "callGasLimit", "factory", "factoryData", "maxFeePerGas", "maxPriorityFeePerGas", "nonce", "paymaster",
      "paymasterData", "paymasterPostOpGasLimit", "paymasterVerificationGasLimit", "preVerificationGas", "sender", "signature", "verificationGasLimit",
    ]);
    assert.equal(rpc.factory, KERNEL_FACTORY);
    assert.equal(rpc.factoryData, `0x${op.initCode.slice(42)}`);
    assert.equal(rpc.paymaster, POLICY_PAYMASTER);
    assert.equal(rpc.paymasterData, "0x");
    assert.equal(rpc.maxFeePerGas, "0x0");
    assert.equal(rpc.maxPriorityFeePerGas, "0x0");
    assert.equal(rpc.verificationGasLimit, "0x4897e", "297,342 as a hex quantity without leading zeros");
    assert.equal(rpc.nonce, `0x${firstOpNonce().toString(16)}`);
    assert.equal(rpc.signature, op.signature);
  });

  it("leaves out factory fields for a deployed account and paymaster fields for an unsponsored operation", () => {
    const p = prepareUserOp({ action: "enable_trading", owner: OWNER.address, calls: enableTradingCalls(), nonce: kernelNonce({ sequence: 1n }), deployed: true, sponsor: false });
    const rpc = toRpcUserOperation(p.op, { dummySignature: true });
    for (const key of ["factory", "factoryData", "paymaster", "paymasterData", "paymasterVerificationGasLimit", "paymasterPostOpGasLimit"]) assert.ok(!(key in rpc), key);
    assert.equal(rpc.signature, DUMMY_USEROP_SIGNATURE);
    assert.equal(toRpcUserOperation(p.op).signature, "0x", "the dummy is only for estimation");
  });

  it("round-trips the 22 real operations losslessly", () => {
    for (const g of loadGolden().ops) {
      const packed = toPacked(g);
      const rpc = toRpcUserOperation(packed);
      const back = fromRpcUserOperation(JSON.parse(JSON.stringify(rpc)));
      assert.deepEqual({ ...back, sender: back.sender.toLowerCase() }, { ...packed, sender: packed.sender.toLowerCase() }, g.txHash);
      assert.equal(userOpHash(back), g.userOpHash);
    }
  });

  it("fromRpcUserOperation is strict: the packed shape, leading zeros, odd fields and half-set groups are refused", async () => {
    const { op } = await signedDeploy();
    const good = JSON.parse(JSON.stringify(toRpcUserOperation(op))) as Record<string, unknown>;
    fromRpcUserOperation(good);
    const refusedShapes: Record<string, unknown>[] = [
      { ...good, initCode: op.initCode },
      { ...good, accountGasLimits: op.accountGasLimits },
      { ...good, paymasterAndData: op.paymasterAndData },
      { ...good, extra: 1 },
      { ...good, nonce: "0x00" },
      { ...good, callGasLimit: "0x" },
      { ...good, callGasLimit: 5 },
      { ...good, sender: "0x1234" },
      { ...good, sender: (good.sender as string).toUpperCase().replace("0X", "0x") },
      { ...good, factoryData: undefined },
      { ...good, factory: undefined },
      { ...good, paymasterPostOpGasLimit: undefined },
      { ...good, paymasterData: "0x1234" },
      { ...good, paymaster: getAddress(zeroAddress) },
      { ...good, factory: zeroAddress },
      { ...good, callData: "0x12345678" },
      { ...good, signature: `0x${"11".repeat(64)}` },
    ];
    for (const shape of refusedShapes) {
      assert.throws(() => fromRpcUserOperation(JSON.parse(JSON.stringify(shape))), (e: unknown) => e instanceof BundlerError && e.code === "invalid_input", JSON.stringify(shape).slice(0, 120));
    }
    assert.throws(() => fromRpcUserOperation(null), BundlerError);
    assert.throws(() => fromRpcUserOperation("op"), BundlerError);
    // hex quantities are case-insensitive, as JSON-RPC clients differ
    assert.deepEqual(fromRpcUserOperation({ ...good, callGasLimit: (good.callGasLimit as string).toUpperCase().replace("0X", "0x") }), op);
  });
});

describe("server-side helpers (the mock bundler uses these)", () => {
  it("accepts a single request for the five methods and refuses everything else", () => {
    for (const method of BUNDLER_METHODS) {
      const parsed = parseBundlerRequest({ jsonrpc: "2.0", id: 4, method, params: [] });
      assert.ok(parsed.ok && parsed.method === method && parsed.id === 4);
    }
    const batch = parseBundlerRequest([{ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }]);
    assert.ok(!batch.ok && batch.rpcCode === -32600 && /batch/.test(batch.message));
    for (const method of ["debug_bundler_clearState", "pimlico_sendUserOperationNow", "boost_sendUserOperation", "eth_sendRawTransaction", "eth_call", "web3_clientVersion", ""]) {
      const parsed = parseBundlerRequest({ jsonrpc: "2.0", id: "x", method, params: [] });
      assert.ok(!parsed.ok && parsed.rpcCode === -32601, method);
    }
    assert.ok(!parseBundlerRequest({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: {} }).ok);
    assert.ok(!parseBundlerRequest({ jsonrpc: "1.0", id: 1, method: "eth_chainId", params: [] }).ok);
    assert.ok(!parseBundlerRequest(null).ok);
    assert.ok(!parseBundlerRequest("eth_chainId").ok);
  });

  it("parses [userOperation, entryPoint] and refuses another EntryPoint, the packed shape and short params", async () => {
    const { op } = await signedDeploy();
    const rpc = toRpcUserOperation(op);
    const parsed = parseSendParams([rpc, ENTRY_POINT_V07]);
    assert.ok(parsed.ok && userOpHash(parsed.op) === userOpHash(op));
    assert.ok(parsed.ok && parseSendParams([rpc, ENTRY_POINT_V07.toLowerCase()]).ok);
    assert.ok(!parseSendParams([rpc, getAddress(zeroAddress)]).ok);
    assert.ok(!parseSendParams([rpc]).ok);
    assert.ok(!parseSendParams([op, ENTRY_POINT_V07]).ok);
    assert.ok(!parseSendParams([rpc, 5]).ok);
  });
});

describe("the client sends single, plain JSON-RPC requests and only the five methods", () => {
  it("never calls anything at construction", () => {
    const transport = new FakeBundler(() => {
      throw new Error("must not be called");
    });
    new BundlerClient({ transport, url: URL_OK });
    assert.equal(transport.requests.length, 0);
  });

  it("chainId, supportedEntryPoints, estimate, send and receipt: one request each, ids increase, methods are in the list", async () => {
    const { op, hash } = await signedDeploy();
    const transport = new FakeBundler((request) => {
      switch (request.method) {
        case "eth_chainId":
          return reply(request, "0xc97");
        case "eth_supportedEntryPoints":
          return reply(request, [OWNER.address.toLowerCase(), ENTRY_POINT_V07]);
        case "eth_estimateUserOperationGas":
          return reply(request, { preVerificationGas: "0xdb96", verificationGasLimit: "0x4897e", callGasLimit: "0x124a4", paymasterVerificationGasLimit: "0x9d46", paymasterPostOpGasLimit: "0x676e" });
        case "eth_sendUserOperation":
          return reply(request, hash);
        default:
          return reply(request, null);
      }
    });
    const client = new BundlerClient({ transport, url: URL_OK });
    assert.equal(await client.chainId(), XO_CHAIN_ID);
    assert.ok((await client.supportedEntryPoints()).includes(ENTRY_POINT_V07));
    const estimate = await client.estimateUserOperationGas({ ...op, signature: "0x" });
    assert.deepEqual(estimate, { preVerificationGas: 56_214n, verificationGasLimit: 297_342n, callGasLimit: 74_916n, paymasterVerificationGasLimit: 40_262n, paymasterPostOpGasLimit: 26_478n });
    assert.deepEqual(await client.sendUserOperation(op), { userOpHash: hash });
    assert.equal(await client.getUserOperationReceipt(hash), null);

    assert.equal(transport.requests.length, 5);
    transport.requests.forEach((request, index) => {
      assert.ok(!Array.isArray(request), "never a batch");
      assert.deepEqual(Object.keys(request).sort(), ["id", "jsonrpc", "method", "params"]);
      assert.equal(request.jsonrpc, "2.0");
      assert.equal(request.id, index + 1);
      assert.ok((BUNDLER_METHODS as readonly string[]).includes(request.method as string));
    });
    assert.deepEqual(transport.urls, Array(5).fill(URL_OK));
    // estimate and send both pass [op, entryPoint]; the estimate of an unsigned op carries the dummy signature
    const [, , estimateRequest, sendRequest, receiptRequest] = transport.requests;
    assert.deepEqual((estimateRequest?.params as unknown[])[1], ENTRY_POINT_V07);
    assert.equal(((estimateRequest?.params as Record<string, unknown>[])[0] as Record<string, unknown>).signature, DUMMY_USEROP_SIGNATURE);
    assert.deepEqual(sendRequest?.params, [toRpcUserOperation(op), ENTRY_POINT_V07]);
    assert.deepEqual(receiptRequest?.params, [hash]);
  });

  it("a dummy signature estimate is not a send: an unsigned operation can never reach eth_sendUserOperation", async () => {
    const { unsigned } = await signedDeploy();
    const transport = new FakeBundler((request) => reply(request, null));
    const client = new BundlerClient({ transport, url: URL_OK });
    await expectCode(() => client.sendUserOperation(unsigned), "invalid_input");
    assert.equal(transport.requests.length, 0);
  });
});

describe("sendUserOperation is guarded", () => {
  it("refuses a malleable (high-s), parity-v or wrong-length signature without sending", async () => {
    const { op, unsigned } = await signedDeploy();
    const transport = new FakeBundler((request) => reply(request, "0x"));
    const client = new BundlerClient({ transport, url: URL_OK });
    const n = normalizeSignature(op.signature);
    const high = `0x${op.signature.slice(2, 66)}${(SECP256K1_N - BigInt(`0x${op.signature.slice(66, 130)}`)).toString(16).padStart(64, "0")}${n.recoveryId === 0 ? "1c" : "1b"}` as Hex;
    const parity = `${op.signature.slice(0, 130)}${(n.recoveryId).toString(16).padStart(2, "0")}` as Hex;
    for (const signature of [high, parity, "0x" as Hex, `0x${"11".repeat(64)}` as Hex]) {
      await failure(() => client.sendUserOperation({ ...unsigned, signature }));
    }
    assert.equal(transport.requests.length, 0);
  });

  it("calls the write guard first; a throwing guard (flag off, kill switch) means nothing is sent", async () => {
    const { op, hash } = await signedDeploy();
    const transport = new FakeBundler((request) => reply(request, hash));
    const off = parseFlags({}).flags;
    const client = new BundlerClient({ transport, url: URL_OK, writeGuard: () => requireFlag(off, "ENABLE_USEROP_SUBMIT") });
    await assert.rejects(client.sendUserOperation(op), (e: unknown) => isRelayError(e) && e.code === "flag_off");
    const killed = parseFlags({ ENABLE_USEROP_SUBMIT: "1", KILL: "1" }).flags;
    const killedClient = new BundlerClient({ transport, url: URL_OK, writeGuard: () => requireFlag(killed, "ENABLE_USEROP_SUBMIT") });
    await assert.rejects(killedClient.sendUserOperation(op), (e: unknown) => isRelayError(e) && e.code === "kill_switch");
    assert.equal(transport.requests.length, 0);
    const on = parseFlags({ ENABLE_USEROP_SUBMIT: "1" }).flags;
    const allowed = new BundlerClient({ transport, url: URL_OK, writeGuard: () => requireFlag(on, "ENABLE_USEROP_SUBMIT") });
    assert.deepEqual(await allowed.sendUserOperation(op), { userOpHash: hash });
    assert.equal(transport.requests.length, 1);
    // the guard does not stop reads or estimates
    assert.equal(await new BundlerClient({ transport: new FakeBundler((r) => reply(r, "0xc97")), url: URL_OK, writeGuard: () => requireFlag(off, "ENABLE_USEROP_SUBMIT") }).chainId(), XO_CHAIN_ID);
  });

  it("asks the guard on every send, so a flag switched off later takes effect at once", async () => {
    const { op, hash } = await signedDeploy();
    let on = true;
    const transport = new FakeBundler((request) => reply(request, hash));
    const client = new BundlerClient({ transport, url: URL_OK, writeGuard: () => requireFlag(parseFlags(on ? { ENABLE_USEROP_SUBMIT: "1" } : {}).flags, "ENABLE_USEROP_SUBMIT") });
    await client.sendUserOperation(op);
    on = false;
    await assert.rejects(client.sendUserOperation(op), (e: unknown) => isRelayError(e) && e.code === "flag_off");
    assert.equal(transport.requests.length, 1);
  });

  it("requires the bundler's hash to equal the one computed here, and says the outcome may be ambiguous", async () => {
    const { op, hash } = await signedDeploy();
    const other = `0x${"ab".repeat(32)}`;
    for (const result of [other, 5, null, "0x1234", { userOpHash: hash }]) {
      const client = new BundlerClient({ transport: new FakeBundler((request) => reply(request, result)), url: URL_OK });
      const error = await failure(() => client.sendUserOperation(op));
      assert.ok(error.code === "hash_mismatch" || error.code === "invalid_response", error.code);
      assert.equal(error.maybeSubmitted, true, "a send that got an unusable answer may have landed");
    }
    const upper = new BundlerClient({ transport: new FakeBundler((request) => reply(request, hash.toUpperCase().replace("0X", "0x"))), url: URL_OK });
    assert.deepEqual(await upper.sendUserOperation(op), { userOpHash: hash });
  });
});

describe("error mapping", () => {
  const scripts: { name: string; response: (request: Record<string, unknown>) => BundlerHttpResponse | never; code: BundlerErrorCode; httpStatus?: number }[] = [
    { name: "401", response: () => ({ status: 401, body: "Unauthorized" }), code: "requires_key", httpStatus: 401 },
    { name: "403", response: () => ({ status: 403, body: { error: "blocked" } }), code: "requires_key", httpStatus: 403 },
    { name: "429", response: () => ({ status: 429, body: "slow down" }), code: "rate_limited", httpStatus: 429 },
    { name: "502 with no JSON-RPC error", response: () => ({ status: 502, body: "bad gateway" }), code: "http_error", httpStatus: 502 },
    { name: "non-JSON 200", response: () => ({ status: 200, body: "<html>" }), code: "invalid_response" },
    { name: "empty object", response: () => ({ status: 200, body: {} }), code: "invalid_response" },
    { name: "no result", response: (r) => ({ status: 200, body: { jsonrpc: "2.0", id: r.id } }), code: "invalid_response" },
    { name: "wrong id", response: () => ({ status: 200, body: { jsonrpc: "2.0", id: 999, result: "0xc97" } }), code: "invalid_response" },
    { name: "wrong jsonrpc", response: (r) => ({ status: 200, body: { jsonrpc: "1.0", id: r.id, result: "0xc97" } }), code: "invalid_response" },
    { name: "a batch array back", response: (r) => ({ status: 200, body: [{ jsonrpc: "2.0", id: r.id, result: "0xc97" }] }), code: "batch_response" },
    { name: "an api key complaint", response: (r) => replyError(r, -32000, "invalid api_key supplied"), code: "requires_key" },
    { name: "a JSON-RPC error", response: (r) => replyError(r, -32602, "Invalid params"), code: "rpc_error" },
  ];

  for (const script of scripts) {
    it(`${script.name} -> ${script.code}, exactly one request, no retry`, async () => {
      const transport = new FakeBundler((request) => script.response(request));
      const client = new BundlerClient({ transport, url: URL_OK });
      const error = await expectCode(() => client.chainId(), script.code);
      assert.equal(error.httpStatus, script.httpStatus ?? 200);
      assert.equal(error.maybeSubmitted, false, "a read cannot have submitted anything");
      assert.equal(transport.requests.length, 1);
    });
  }

  it("a transport failure is transport_error, ambiguous only for a send", async () => {
    const { op } = await signedDeploy();
    const boom = new FakeBundler(() => {
      throw new Error("socket hang up");
    });
    const client = new BundlerClient({ transport: boom, url: URL_OK });
    const read = await expectCode(() => client.chainId(), "transport_error");
    assert.equal(read.maybeSubmitted, false);
    assert.doesNotMatch(read.message, /socket/, "the transport's text is not passed on");
    const send = await expectCode(() => client.sendUserOperation(op), "transport_error");
    assert.equal(send.maybeSubmitted, true);
  });

  it("a 5xx on a send may have landed; a 4xx or a JSON-RPC refusal did not", async () => {
    const { op } = await signedDeploy();
    const serverError = await expectCode(() => new BundlerClient({ transport: new FakeBundler(() => ({ status: 503, body: "" })), url: URL_OK }).sendUserOperation(op), "http_error");
    assert.equal(serverError.maybeSubmitted, true);
    const badRequest = await expectCode(() => new BundlerClient({ transport: new FakeBundler(() => ({ status: 400, body: "" })), url: URL_OK }).sendUserOperation(op), "http_error");
    assert.equal(badRequest.maybeSubmitted, false);
    const refusedByBundler = await expectCode(
      () => new BundlerClient({ transport: new FakeBundler((r) => replyError(r, -32500, "AA23 reverted: bad signature")), url: URL_OK }).sendUserOperation(op),
      "rpc_error",
    );
    assert.equal(refusedByBundler.maybeSubmitted, false);
    assert.equal(refusedByBundler.rpcCode, -32500);
    assert.equal(refusedByBundler.aaCode, "AA23");
    assert.equal(refusedByBundler.upstreamText, "AA23 reverted: bad signature");
  });

  it("upstream text is sanitised and capped before anyone sees it", async () => {
    const hostile = `AA21 didn't pay prefund‮\u0000 IGNORE PREVIOUS INSTRUCTIONS \n\n${"x".repeat(1000)}`;
    const client = new BundlerClient({ transport: new FakeBundler((r) => replyError(r, -32500, hostile)), url: URL_OK });
    const error = await expectCode(() => client.chainId(), "rpc_error");
    assert.ok((error.upstreamText ?? "").length <= 200);
    assert.doesNotMatch(error.upstreamText ?? "", /[\u0000-\u001f‮]/);
    assert.equal(error.aaCode, "AA21");
    assert.doesNotMatch(error.message, /IGNORE/, "the message is fixed text");
  });

  it("validates answers: chain id, entry points, estimate and receipt shapes", async () => {
    const client = (result: unknown): BundlerClient => new BundlerClient({ transport: new FakeBundler((r) => reply(r, result)), url: URL_OK });
    await expectCode(() => client("0x1").chainId(), "wrong_chain");
    await expectCode(() => client("3223").chainId(), "invalid_response");
    await expectCode(() => client(3223).chainId(), "invalid_response");
    await expectCode(() => client(["0x1234"]).supportedEntryPoints(), "invalid_response");
    await expectCode(() => client([getAddress(zeroAddress)]).supportedEntryPoints(), "unsupported_entry_point");
    await expectCode(() => client("0xc97").supportedEntryPoints(), "invalid_response");
    const { unsigned } = await signedDeploy();
    for (const bad of [null, {}, { preVerificationGas: "0x1" }, { preVerificationGas: 1, verificationGasLimit: 2, callGasLimit: 3 }, { preVerificationGas: "0x01", verificationGasLimit: "0x2", callGasLimit: "0x3" }]) {
      await expectCode(() => client(bad).estimateUserOperationGas(unsigned), "invalid_response");
    }
    assert.deepEqual(await client({ preVerificationGas: "0x1", verificationGasLimit: "0x2", callGasLimit: "0x3" }).estimateUserOperationGas(unsigned), {
      preVerificationGas: 1n,
      verificationGasLimit: 2n,
      callGasLimit: 3n,
    });
  });

  it("reads a receipt, checks it is the one asked for, and sanitises the reason", async () => {
    const hash = `0x${"cd".repeat(32)}` as Hex;
    const base = {
      userOpHash: hash,
      sender: OWNER.address.toLowerCase(),
      nonce: "0x5",
      success: false,
      actualGasCost: "0x0",
      actualGasUsed: "0x62b4b",
      reason: "execution reverted\u0007 ‮evil",
      receipt: { transactionHash: `0x${"ee".repeat(32)}`, blockNumber: "0xc0ffee" },
    };
    const receipt = await new BundlerClient({ transport: new FakeBundler((r) => reply(r, base)), url: URL_OK }).getUserOperationReceipt(hash);
    assert.ok(receipt);
    assert.equal(receipt.success, false);
    assert.equal(receipt.nonce, 5n);
    assert.equal(receipt.actualGasUsed, 0x62b4bn);
    assert.equal(receipt.blockNumber, 0xc0ffeen);
    assert.equal(receipt.sender, OWNER.address);
    assert.equal(receipt.transactionHash, `0x${"ee".repeat(32)}`);
    assert.doesNotMatch(receipt.reason ?? "", /[\u0007‮]/);
    await expectCode(
      () => new BundlerClient({ transport: new FakeBundler((r) => reply(r, { ...base, userOpHash: `0x${"11".repeat(32)}` })), url: URL_OK }).getUserOperationReceipt(hash),
      "invalid_response",
    );
    await expectCode(() => new BundlerClient({ transport: new FakeBundler((r) => reply(r, { ...base, receipt: {} })), url: URL_OK }).getUserOperationReceipt(hash), "invalid_response");
    await expectCode(() => new BundlerClient({ transport: new FakeBundler((r) => reply(r, null)), url: URL_OK }).getUserOperationReceipt("0x1234" as Hex), "invalid_input");
  });
});

describe("the bundler URL", () => {
  it("is https, or http to a loopback host, with no credentials, query or fragment", () => {
    assert.equal(validateBundlerUrl("https://bundler.example.invalid/"), "https://bundler.example.invalid/");
    assert.equal(validateBundlerUrl("http://127.0.0.1:8545/"), "http://127.0.0.1:8545/");
    assert.equal(validateBundlerUrl("http://localhost:3000/rpc"), "http://localhost:3000/rpc");
    for (const bad of [
      "http://bundler.example.invalid/",
      "ftp://127.0.0.1/",
      "https://bundler.example.invalid/?api_key=secret",
      `https://user:pass${AT}bundler.example.invalid/`,
      `https://user${AT}bundler.example.invalid/`,
      "https://bundler.example.invalid/#frag",
      "bundler.example.invalid",
      "",
      "http://10.0.0.1/",
    ]) {
      assert.throws(() => validateBundlerUrl(bad), (e: unknown) => e instanceof BundlerError && e.code === "invalid_input", bad);
    }
  });
});

describe("the estimation dummy signature", () => {
  it("is a canonical 65-byte signature that recovers to a non-zero address under any digest, so the validator cannot revert on it", async () => {
    assert.equal((DUMMY_USEROP_SIGNATURE.length - 2) / 2, 65);
    assert.equal(normalizeSignature(DUMMY_USEROP_SIGNATURE).signature, DUMMY_USEROP_SIGNATURE);
    const rng = seededRandom(61);
    for (let i = 0; i < 40; i += 1) {
      const hash = `0x${rng.hex(32)}` as Hex;
      const digests = signingDigests(hash);
      for (const digest of [digests.raw, digests.eip191]) {
        const signer = await recoverAddress({ hash: digest, signature: DUMMY_USEROP_SIGNATURE });
        assert.notEqual(signer, getAddress(zeroAddress));
        // it is a placeholder, not anyone's real approval
        assert.notEqual(signer, OWNER.address);
      }
    }
  });
});

describe("a redeem operation over the wire", () => {
  it("prepares, signs and serialises without surprises (smoke)", async () => {
    const p = prepareUserOp({ action: "redeem", owner: OWNER.address, calls: redeemCalls([`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`]), nonce: kernelNonce({ sequence: 2n }), deployed: true, sponsor: true });
    const signed = withSignature(p.op, await OWNER.sign({ hash: p.userOpHash }));
    const rpc = toRpcUserOperation(signed);
    assert.ok(!("factory" in rpc));
    assert.equal(fromRpcUserOperation(JSON.parse(JSON.stringify(rpc))).signature, signed.signature);
  });
});
