import assert from "node:assert/strict";
import { test } from "node:test";

import { getAddress, type Address } from "viem";

import { loadApiConfig } from "../../api/config.js";
import { PAYMASTER_METHODS } from "../../api/paymaster.js";
import { ENTRY_POINT_V08, SIMPLE_7702_DELEGATION_CODE } from "../../api/sponsor-policy.js";
import { LIMITLESS_CTF_EXCHANGE, LIMITLESS_USDC } from "../../sdk/chain/limitless/constants.js";
import { POLYMARKET_CTF_EXCHANGE, POLYMARKET_PUSD } from "../../sdk/chain/polymarket/constants.js";
import { depositWalletAddress } from "../../sdk/trade/clob/polymarket/deposit-wallet.js";
import {
  approveData,
  authorizationFor,
  closeHarness,
  codeOf,
  DAPP,
  executeData,
  fakeUpstream,
  postJson,
  raw,
  rpc,
  testKey,
  transferData,
  unifiedHarness,
  userOperation,
  type Seen,
} from "./unified-helpers.js";

// POST /v1/paymaster/:chainId (api/paymaster.ts) against a fake Pimlico, a fake chain RPC and a fake Polymarket bridge:
// off by default, 503 not_configured without the operator's credentials, the JSON-RPC envelope and method allowlist,
// the key added to the upstream URL only (never in an answer or a log), the operator's policy id in every pm_* call,
// the callData policy, the EIP-7702 delegation rule (an included authorization signed by the sender, or the code on
// chain), the bridge-deposit exemption, the daily withdrawal cap, the per-sender and per-client limits, and CORS.

const KEY = "pim_test_key_made_up_for_these_tests";
const POLICY = "sp_test_policy_made_up";
const ON = { API_PAYMASTER: "on", PIMLICO_API_KEY: KEY, PIMLICO_SPONSORSHIP_POLICY_ID: POLICY };
const E = testKey("paymaster-e");
const OTHER = testKey("paymaster-other");
const W = testKey("paymaster-w");
const BRIDGE_DEPOSIT: Address = testKey("paymaster-bridge-deposit").address;
const PATH = "/v1/paymaster/8453";
const APPROVE = executeData([{ to: LIMITLESS_USDC, data: approveData(LIMITLESS_CTF_EXCHANGE) }]);

interface World {
  // Code per address (lower case) the fake chain answers eth_getCode with.
  readonly code: Record<string, string>;
  rpcDown: boolean;
}

function world(state: World = { code: {}, rpcDown: false }) {
  return fakeUpstream((seen: Seen) => {
    const body = seen.body === null ? null : (JSON.parse(seen.body.toString("utf8")) as { id: unknown; method: string; params: unknown[] });
    if (seen.url.startsWith("https://api.pimlico.io/")) {
      return { body: JSON.stringify({ jsonrpc: "2.0", id: body?.id, result: body?.method === "eth_chainId" ? "0x2105" : { paymaster: "0x0000000000000000000000000000000000000001", paymasterData: "0x" } }) };
    }
    if (seen.url.startsWith("https://base-rpc.publicnode.com") || seen.url.startsWith("https://polygon-bor-rpc.publicnode.com") || seen.url.startsWith("https://bsc-rpc.publicnode.com")) {
      if (state.rpcDown) return { throws: true };
      const address = String(body?.params[0]).toLowerCase();
      return { body: JSON.stringify({ jsonrpc: "2.0", id: body?.id, result: state.code[address] ?? "0x" }) };
    }
    if (seen.url === "https://bridge.polymarket.com/deposit") {
      return { status: 201, body: JSON.stringify({ address: { evm: BRIDGE_DEPOSIT, svm: "BridgeSvmAddressForTests", btc: "bc1qtestsonly" }, note: "test" }) };
    }
    return { status: 599, body: "{}" };
  });
}

const pimlicoCalls = (seen: Seen[]): Seen[] => seen.filter((s) => s.url.startsWith("https://api.pimlico.io/"));
const rpcCalls = (seen: Seen[]): Seen[] => seen.filter((s) => s.url.includes("publicnode.com"));

test("the paymaster is off by default, and without the operator's credentials it answers 503 not_configured", async () => {
  assert.equal(loadApiConfig({ API_DATA_DIR: "/data" }).config.paymaster, false);
  assert.equal(loadApiConfig({ API_DATA_DIR: "/data", API_PAYMASTER: "on" }).config.operator.pimlico, null);
  const partial = loadApiConfig({ API_DATA_DIR: "/data", PIMLICO_API_KEY: KEY });
  assert.equal(partial.config.operator.pimlico, null);
  assert.match(partial.issues.map((i) => i.message).join(" "), /needed together/);
  assert.equal(JSON.stringify(partial.issues).includes(KEY), false, "an issue never prints a credential");
  const upstream = world();
  const off = await unifiedHarness({}, upstream);
  try {
    const answer = await postJson(off.h.server.origin, PATH, rpc("eth_chainId", []));
    assert.deepEqual([answer.status, codeOf(answer.text)], [403, "relay_not_enabled"]);
  } finally {
    await closeHarness(off);
  }
  const bare = await unifiedHarness({ API_PAYMASTER: "on" }, upstream);
  try {
    for (const chain of [137, 8453, 56]) {
      const answer = await postJson(bare.h.server.origin, `/v1/paymaster/${chain}`, rpc("eth_chainId", []));
      assert.deepEqual([answer.status, codeOf(answer.text)], [503, "not_configured"], String(chain));
    }
    const other = await postJson(bare.h.server.origin, "/v1/paymaster/1", rpc("eth_chainId", []));
    assert.deepEqual([other.status, codeOf(other.text)], [404, "not_found"]);
    assert.equal(upstream.seen.length, 0);
  } finally {
    await closeHarness(bare);
  }
});

test("only one JSON-RPC request for a listed method with its params, EntryPoint 0.8 and the route's chain", async () => {
  const upstream = world();
  const u = await unifiedHarness(ON, upstream);
  try {
    const op = userOperation(E.address, APPROVE, { eip7702Auth: await authorizationFor(E, 8453) });
    const refused: Array<[unknown, number, string]> = [
      [[rpc("eth_chainId", [])], 400, "invalid_request"],
      [rpc("eth_sendRawTransaction", ["0x00"]), 400, "invalid_request"],
      [rpc("debug_bundler_dumpMempool", []), 400, "invalid_request"],
      [rpc("pimlico_sendUserOperationNow", []), 400, "invalid_request"],
      [{ ...rpc("eth_chainId", []), extra: 1 }, 400, "invalid_request"],
      [{ ...rpc("eth_chainId", []), jsonrpc: "1.0" }, 400, "invalid_request"],
      [rpc("eth_chainId", [1]), 400, "invalid_request"],
      [rpc("eth_getUserOperationReceipt", ["0x12"]), 400, "invalid_request"],
      [rpc("eth_sendUserOperation", [op, "0x0000000071727De22E5E9d8BAf0edAc6f37da032"]), 400, "invalid_request"],
      [rpc("eth_sendUserOperation", [op]), 400, "invalid_request"],
      [rpc("eth_estimateUserOperationGas", [op, ENTRY_POINT_V08, {}]), 400, "invalid_request"],
      [rpc("pm_getPaymasterStubData", [op, ENTRY_POINT_V08, "0x89"]), 400, "invalid_request"],
      [rpc("pm_getPaymasterData", [op, ENTRY_POINT_V08]), 400, "invalid_request"],
      [rpc("eth_sendUserOperation", [{ ...op, initCode: "0x" }, ENTRY_POINT_V08]), 400, "invalid_request"],
      [rpc("eth_sendUserOperation", [{ ...op, sender: "0x12" }, ENTRY_POINT_V08]), 400, "invalid_request"],
      [rpc("eth_sendUserOperation", [{ ...op, surprise: 1 }, ENTRY_POINT_V08]), 400, "invalid_request"],
    ];
    for (const [body, status, code] of refused) {
      const answer = await postJson(u.h.server.origin, PATH, body);
      assert.deepEqual([answer.status, codeOf(answer.text)], [status, code], JSON.stringify(body).slice(0, 80));
      assert.equal(answer.headers["x-im-relay"], "refused");
    }
    // Method, query, media type.
    assert.equal((await raw(u.h.server.origin, "GET", PATH, DAPP)).status, 405);
    assert.equal((await postJson(u.h.server.origin, `${PATH}?x=1`, rpc("eth_chainId", []))).status, 400);
    assert.equal((await raw(u.h.server.origin, "POST", PATH, { ...DAPP, "content-type": "text/plain" }, "{}")).status, 415);
    assert.equal(pimlicoCalls(upstream.seen).length, 0, "nothing reached Pimlico");
    assert.deepEqual([...PAYMASTER_METHODS].sort(), ["eth_chainId", "eth_estimateUserOperationGas", "eth_getUserOperationByHash", "eth_getUserOperationReceipt", "eth_sendUserOperation", "eth_supportedEntryPoints", "pimlico_getUserOperationGasPrice", "pm_getPaymasterData", "pm_getPaymasterStubData"]);
  } finally {
    await closeHarness(u);
  }
});

test("reads pass through with the key in Pimlico's URL only; pm_* calls carry the operator's policy id, never the page's", async () => {
  const upstream = world();
  const u = await unifiedHarness(ON, upstream);
  try {
    const body = JSON.stringify(rpc("eth_chainId", [], 7));
    const answer = await raw(u.h.server.origin, "POST", PATH, { ...DAPP, "content-type": "application/json" }, body);
    assert.equal(answer.status, 200);
    assert.equal(JSON.parse(answer.text).result, "0x2105");
    assert.equal(answer.headers["access-control-allow-origin"], DAPP.origin);
    assert.equal(answer.headers["x-im-relay"], "upstream");
    const [sent] = pimlicoCalls(upstream.seen);
    assert.equal(sent?.url, `https://api.pimlico.io/v2/8453/rpc?apikey=${KEY}`);
    assert.equal(sent?.body?.toString("utf8"), body, "forwarded byte for byte");
    assert.equal(sent?.headers["user-agent"], "insurance-markets-api/0.1");
    assert.equal(sent?.headers["origin"], undefined);

    const op = userOperation(E.address, APPROVE, { eip7702Auth: await authorizationFor(E, 8453) });
    for (const method of ["pm_getPaymasterStubData", "pm_getPaymasterData"]) {
      const pm = await postJson(u.h.server.origin, PATH, rpc(method, [op, ENTRY_POINT_V08, "0x2105", { sponsorshipPolicyId: "sp_someone_elses" }]));
      assert.equal(pm.status, 200, pm.text);
      const last = pimlicoCalls(upstream.seen).at(-1);
      const forwarded = JSON.parse(last?.body?.toString("utf8") ?? "{}") as { params: unknown[] };
      assert.deepEqual(forwarded.params[3], { sponsorshipPolicyId: POLICY });
      assert.deepEqual(forwarded.params[0], op);
    }
    // Without a context the policy is added too.
    await postJson(u.h.server.origin, PATH, rpc("pm_getPaymasterStubData", [op, ENTRY_POINT_V08, "0x2105"]));
    assert.deepEqual((JSON.parse(pimlicoCalls(upstream.seen).at(-1)?.body?.toString("utf8") ?? "{}") as { params: unknown[] }).params[3], { sponsorshipPolicyId: POLICY });
    for (const line of u.logs) {
      assert.equal(line.includes(KEY), false, "the key is never logged");
      assert.equal(line.includes(POLICY), false);
      assert.equal(line.includes("pimlico.io"), false);
    }
    assert.ok(u.logs.some((line) => /^POST \/v1\/paymaster\/8453 200 \d+ms$/.test(line)));
  } finally {
    await closeHarness(u);
  }
});

test("the sender must be delegated to Simple7702Account: by an authorization it signed, or by its code on chain", async () => {
  const state: World = { code: {}, rpcDown: false };
  const upstream = world(state);
  const u = await unifiedHarness(ON, upstream);
  try {
    const send = (op: Record<string, unknown>, chain = 8453) => postJson(u.h.server.origin, `/v1/paymaster/${chain}`, rpc("eth_sendUserOperation", [op, ENTRY_POINT_V08]));
    // An authorization for another implementation, another chain, or signed by someone else.
    const wrongImpl = await send(userOperation(E.address, APPROVE, { eip7702Auth: await authorizationFor(E, 8453, getAddress("0x00000000000000000000000000000000000c0ffe")) }));
    assert.deepEqual([wrongImpl.status, codeOf(wrongImpl.text)], [403, "not_sponsored"]);
    const wrongChain = await send(userOperation(E.address, APPROVE, { eip7702Auth: await authorizationFor(E, 137) }));
    assert.match(wrongChain.text, /another chain/);
    const wrongSigner = await send(userOperation(E.address, APPROVE, { eip7702Auth: await authorizationFor(OTHER, 8453) }));
    assert.match(wrongSigner.text, /not signed by the user operation's sender/);
    // A real factory is never sponsored.
    const factory = await send(userOperation(E.address, APPROVE, { factory: "0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419", factoryData: "0x1234" }));
    assert.deepEqual([factory.status, codeOf(factory.text)], [403, "not_sponsored"]);
    // A chain-id-0 authorization (valid on every chain) signed by the sender is accepted.
    const any = await authorizationFor(E, 0);
    assert.equal((await send(userOperation(E.address, APPROVE, { eip7702Auth: any }))).status, 200);
    assert.equal(rpcCalls(upstream.seen).length, 0, "an included authorization needs no chain read");

    // No authorization: the code on chain decides.
    const plain = userOperation(E.address, APPROVE);
    const undelegated = await send(plain);
    assert.deepEqual([undelegated.status, codeOf(undelegated.text)], [403, "not_sponsored"]);
    state.code[E.address.toLowerCase()] = "0xef010000000000000000000000000000000000c0ffe0";
    assert.equal((await send(plain)).status, 403, "delegated elsewhere");
    state.code[E.address.toLowerCase()] = SIMPLE_7702_DELEGATION_CODE;
    assert.equal((await send(plain)).status, 200);
    const reads = rpcCalls(upstream.seen).length;
    assert.equal((await send(plain)).status, 200);
    assert.equal(rpcCalls(upstream.seen).length, reads, "a seen delegation is remembered");
    const [read] = rpcCalls(upstream.seen);
    assert.equal(read?.url, "https://base-rpc.publicnode.com/");
    assert.deepEqual(JSON.parse(read?.body?.toString("utf8") ?? "{}").params, [E.address, "latest"]);
    // The chain cannot be read: 502, nothing sent to Pimlico.
    state.rpcDown = true;
    const before = pimlicoCalls(upstream.seen).length;
    const down = await send(userOperation(OTHER.address, executeData([{ to: POLYMARKET_PUSD, data: approveData(POLYMARKET_CTF_EXCHANGE) }])), 137);
    assert.deepEqual([down.status, codeOf(down.text)], [502, "upstream_unreachable"]);
    assert.equal(pimlicoCalls(upstream.seen).length, before);
  } finally {
    await closeHarness(u);
  }
});

test("calls outside the chain's policy are refused before Pimlico is asked", async () => {
  const upstream = world();
  const u = await unifiedHarness(ON, upstream);
  try {
    const auth = await authorizationFor(E, 8453);
    const stranger = getAddress("0x00000000000000000000000000000000000c0ffe");
    for (const callData of [
      executeData([{ to: LIMITLESS_USDC, data: approveData(stranger) }]),
      executeData([{ to: stranger, data: approveData(LIMITLESS_CTF_EXCHANGE) }]),
      executeData([{ to: LIMITLESS_USDC, data: approveData(LIMITLESS_CTF_EXCHANGE) }, { to: LIMITLESS_USDC, data: "0x095ea7b3" }]),
      approveData(LIMITLESS_CTF_EXCHANGE),
    ]) {
      const answer = await postJson(u.h.server.origin, PATH, rpc("pm_getPaymasterStubData", [userOperation(E.address, callData, { eip7702Auth: auth }), ENTRY_POINT_V08, "0x2105"]));
      assert.deepEqual([answer.status, codeOf(answer.text)], [403, "not_sponsored"], callData.slice(0, 20));
    }
    // A Base contract is not sponsored on Polygon.
    const polygon = await postJson(u.h.server.origin, "/v1/paymaster/137", rpc("pm_getPaymasterStubData", [userOperation(E.address, APPROVE, { eip7702Auth: await authorizationFor(E, 137) }), ENTRY_POINT_V08, "0x89"]));
    assert.deepEqual([polygon.status, codeOf(polygon.text)], [403, "not_sponsored"]);
    assert.equal(pimlicoCalls(upstream.seen).length, 0);
  } finally {
    await closeHarness(u);
  }
});

test("transfers: one to the bridge address the server fetched for the sender is free; others count against the daily cap", async () => {
  const upstream = world();
  const u = await unifiedHarness(ON, upstream);
  try {
    const auth = await authorizationFor(E, 8453);
    // Ten seconds apart: the per-sender bucket refills one call every ten seconds.
    const sponsor = (callData: `0x${string}`, nonce: string, method = "pm_getPaymasterData") => {
      u.clock.advance(10_000);
      return postJson(u.h.server.origin, PATH, rpc(method, [userOperation(E.address, callData, { eip7702Auth: auth, nonce }), ENTRY_POINT_V08, "0x2105"]));
    };
    const withdraw = executeData([{ to: LIMITLESS_USDC, data: transferData(W.address) }]);
    for (let i = 0; i < 10; i += 1) assert.equal((await sponsor(withdraw, `0x${i.toString(16)}`)).status, 200, `withdrawal ${i}`);
    // A retry of an operation already counted is still sponsored; a new one is not.
    assert.equal((await sponsor(withdraw, "0x9")).status, 200);
    const over = await sponsor(withdraw, "0xa");
    assert.deepEqual([over.status, codeOf(over.text)], [403, "not_sponsored"]);
    assert.match(over.text, /10 sponsored withdrawals today/);
    // The stub call refuses early too.
    assert.equal((await sponsor(withdraw, "0xb", "pm_getPaymasterStubData")).status, 403);
    assert.equal(u.store.withdrawalCount(E.address, "2026-10-24"), 10);

    // The bridge address is unknown until the server asks the bridge for the sender's own Deposit Wallet.
    const toBridge = executeData([{ to: LIMITLESS_USDC, data: transferData(BRIDGE_DEPOSIT) }]);
    assert.equal((await sponsor(toBridge, "0xc")).status, 403);
    const wallet = depositWalletAddress(E.address, "beacon");
    const notOwn = await postJson(u.h.server.origin, "/v1/relay/polymarket-bridge/deposit", { sender: E.address, address: depositWalletAddress(OTHER.address, "beacon") });
    assert.deepEqual([notOwn.status, codeOf(notOwn.text)], [400, "invalid_request"]);
    const fetched = await postJson(u.h.server.origin, "/v1/relay/polymarket-bridge/deposit", { sender: E.address, address: wallet });
    assert.equal(fetched.status, 201);
    assert.equal(JSON.parse(fetched.text).address.evm, BRIDGE_DEPOSIT);
    const bridgeCall = upstream.seen.find((s) => s.url === "https://bridge.polymarket.com/deposit");
    assert.deepEqual(JSON.parse(bridgeCall?.body?.toString("utf8") ?? "{}"), { address: wallet });
    assert.equal(bridgeCall?.headers["x-builder-code"], undefined, "no builder code configured, none sent");
    assert.equal((await sponsor(toBridge, "0xd")).status, 200);
    assert.equal(u.store.withdrawalCount(E.address, "2026-10-24"), 10, "a bridge funding move is not a withdrawal");
    // The next UTC day opens the cap again.
    u.clock.advance(24 * 3_600_000);
    assert.equal((await sponsor(withdraw, "0xe")).status, 200);
  } finally {
    await closeHarness(u);
  }
});

test("per-sender and per-client limits, and CORS for the dApp only", async () => {
  const upstream = world();
  const u = await unifiedHarness(ON, upstream);
  try {
    const op = userOperation(E.address, APPROVE, { eip7702Auth: await authorizationFor(E, 8453) });
    let limited = 0;
    for (let i = 0; i < 12; i += 1) {
      const answer = await postJson(u.h.server.origin, PATH, rpc("eth_sendUserOperation", [op, ENTRY_POINT_V08]));
      if (answer.status === 429) {
        limited += 1;
        assert.ok(Number(answer.headers["retry-after"]) >= 1);
      }
    }
    assert.equal(limited, 2, "10 spending calls at once per sender");
    // The estimate does not spend, so the sender bucket does not apply.
    assert.equal((await postJson(u.h.server.origin, PATH, rpc("eth_estimateUserOperationGas", [op, ENTRY_POINT_V08]))).status, 200);
    let clientLimited = false;
    for (let i = 0; i < 60 && !clientLimited; i += 1) clientLimited = (await postJson(u.h.server.origin, PATH, rpc("eth_chainId", []))).status === 429;
    assert.ok(clientLimited, "60 calls at once per client");

    const foreign = await raw(u.h.server.origin, "POST", PATH, { origin: "https://evil.example", "content-type": "application/json" }, JSON.stringify(rpc("eth_chainId", [])));
    assert.deepEqual([foreign.status, codeOf(foreign.text)], [403, "origin_not_allowed"]);
    const preflight = await raw(u.h.server.origin, "OPTIONS", PATH, { ...DAPP, "access-control-request-method": "POST" });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers["access-control-allow-origin"], DAPP.origin);
    assert.equal(preflight.headers["access-control-allow-headers"], "content-type");
    const evil = await raw(u.h.server.origin, "OPTIONS", PATH, { origin: "https://evil.example", "access-control-request-method": "POST" });
    assert.equal(evil.headers["access-control-allow-origin"], undefined);
  } finally {
    await closeHarness(u);
  }
});
