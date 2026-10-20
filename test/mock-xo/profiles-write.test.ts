import assert from "node:assert/strict";
import { describe } from "node:test";

import { encodeFunctionData } from "viem";

import { BASE_WARP_ROUTER, CREATION_FEE_ATOMIC, ENTRY_POINT_V07, GAS_DEFAULTS, MARKET_MANAGER, USDC_E_ADDRESS } from "../../src/xo/chain/constants.js";
import { MARKET_MANAGER_ABI } from "../../src/xo/chain/abi.js";
import { padRecipient } from "../../src/xo/funding/calldata.js";
import { toRpcUserOperation } from "../../src/xo/userop/bundler.js";
import { approveCall, buildOp, enableTradingCalls } from "../anvil/scenarios.js";
import { USDCE_STUB_ABI } from "../anvil/stubs.js";
import { writeSwitches } from "./profile.js";
import { MOCK_SWITCHES, OPTIMISTIC_PROFILE, PESSIMISTIC_PROFILE } from "./switches.js";
import { getJson, postRpc, useMock } from "./testing.js";
import { createCredentials, l1Headers, l2Call, marketTokens, placeOrder, traderFor } from "./traders.js";

// The profile matrix, in the write mock's own terms (spec 5.6): in the OPTIMISTIC profile every unknown on the real
// service is answered the way the plugin hopes, so one whole journey works; in the PESSIMISTIC profile (the default,
// D9) the same journey meets a wall at each step. The relay suite runs against both.

const harness = useMock({ chains: { xo: true, base: true } });

describe("the optimistic profile flips every write switch at once", () => {
  harness.it("all 27 write switches hold their optimistic value, and every switch's optimistic value differs from its pessimistic one (except faults)", async (mock) => {
    mock.setProfile("optimistic");
    assert.deepEqual(mock.switches.snapshot(), OPTIMISTIC_PROFILE);
    for (const name of writeSwitches()) {
      const definition = MOCK_SWITCHES.find((entry) => entry.name === name);
      assert.ok(definition !== undefined);
      assert.notEqual(definition.optimistic, definition.pessimistic, name);
      assert.equal(mock.switches.get(name), definition.optimistic, name);
    }
  });

  harness.it("one journey works end to end: deploy through the bundler, key, deposit, order, taker fill, cancel, withdraw, create a market", async (mock) => {
    mock.setProfile("optimistic");
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const trader = traderFor(mock, 2);

    // 1. The bundler admits a first UserOp from an account XO never provisioned, sponsored; the registry follows the deployment.
    const deploy = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: enableTradingCalls() });
    assert.equal((await postRpc(mock, "bundler", "eth_sendUserOperation", [toRpcUserOperation(deploy.op), ENTRY_POINT_V07])).body["result"], deploy.hash);
    const registered = ((await getJson(mock, "orderbook", `/balance-allowance?address=${trader.account}`)).body as { smart_account: unknown }).smart_account;
    assert.equal(registered, trader.key);

    // 2. L1: derive finds nothing, create mints a key, derive then returns the whole triplet.
    assert.equal((await getJson(mock, "orderbook", "/auth/derive-api-key", { headers: await l1Headers(mock, trader) })).status, 404);
    const creds = await createCredentials(mock, trader);
    const derived = await getJson(mock, "orderbook", "/auth/derive-api-key", { headers: await l1Headers(mock, trader, { prefix: "0x00", form: "raw" }) });
    assert.deepEqual(derived.body, creds);

    // 3. L2 with the form the plugin would try first: path only, padded base64url, no XO_ADDRESS.
    const listed = await l2Call(mock, trader, creds, "GET", "/orders?limit=1", undefined, { variant: { target: "path-only", decode: "b64url-decoded-padded", address: false } });
    assert.equal(listed.status, 200);

    // 4. A deposit from Base is minted and credited at once.
    mock.hyperlane.setBaseBalance(trader.owner.address, 20_000_000n);
    await mock.hyperlane.baseApprove(trader.owner.address, BASE_WARP_ROUTER, 10_000_000n);
    const sent = await mock.hyperlane.baseTransferRemote({ from: trader.owner.address, recipient: padRecipient(trader.account), amount: 10_000_000n });
    assert.equal(sent.status, "success");
    await mock.advance(30);
    const balance = (await getJson(mock, "orderbook", `/balance-allowance?address=${trader.account}`)).body as { balance: string };
    assert.equal(balance.balance, "10000000");

    // 5. Orders in every signature shape, tiny ones included (no size or notional floor, no minimum lifetime).
    const { yes } = marketTokens(mock, "clob-active-a");
    const shapes = [
      { sign: { form: "eip191", prefix: "0x01" }, tick: 300 },
      { sign: { form: "raw", prefix: "0x01" }, tick: 301 },
      { sign: { form: "eip191", prefix: "0x00" }, tick: 302 },
      { sign: { form: "raw", prefix: "0x00" }, tick: 303 },
    ] as const;
    for (const shape of shapes) {
      const { reply } = await placeOrder(mock, trader, creds, { tokenId: yes, side: "BUY", tick: shape.tick, sharesMicro: 1_000n, ttlSeconds: 5, sign: shape.sign }, { variant: { target: "path-only", decode: "b64url-decoded-padded", address: false } });
      assert.equal(reply.status, 200, `${JSON.stringify(shape)}: ${reply.text}`);
    }

    // 6. A taker order is held 500 ms on the mock clock and fills.
    const taker = placeOrder(mock, trader, creds, { tokenId: yes, side: "BUY", tick: 510, sharesMicro: 1_000_000n }, { variant: { target: "path-only", decode: "b64url-decoded-padded", address: false } });
    for (let i = 0; i < 600 && mock.clock.waiterCount() === 0; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 5));
    await mock.advance(0.5);
    assert.equal(((await taker).reply.body as { status: string }).status, "matched");

    // 7. Cancel by hash, then everything left with an HMAC-only cancel-all.
    const rest = await placeOrder(mock, trader, creds, { tokenId: yes, side: "BUY", tick: 310, sharesMicro: 1_000_000n }, { variant: { target: "path-only", decode: "b64url-decoded-padded", address: false } });
    const cancelled = await l2Call(mock, trader, creds, "DELETE", "/order", { orderID: rest.built.hash }, { variant: { target: "path-only", decode: "b64url-decoded-padded", address: false } });
    assert.equal((cancelled.body as { canceled: string[] }).canceled.length, 1);
    const all = await l2Call(mock, trader, creds, "DELETE", "/cancel-all", undefined, { variant: { target: "path-only", decode: "b64url-decoded-padded", address: false } });
    assert.equal(all.status, 200);
    assert.equal(mock.engine.liveOrders(trader.key).length, 0);

    // 8. A creation with a URI nobody at XO hosts is reviewed all the same, and the seed is accepted while it is PENDING.
    await chain.sendFrom(chain.bundler.address, USDC_E_ADDRESS, encodeFunctionData({ abi: USDCE_STUB_ABI, functionName: "mint", args: [trader.account, 5_000_000n] }));
    mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
    const now = await chain.blockTimestamp();
    const create = { target: MARKET_MANAGER, data: encodeFunctionData({ abi: MARKET_MANAGER_ABI, functionName: "createConvictionMarket", args: [now, now + 864_000, USDC_E_ADDRESS, "https://metadata.example.invalid/m.json"] }) };
    const made = await buildOp({ chain, owner: chain.owner(2), sequence: 1n, sponsored: true, gas: GAS_DEFAULTS.createMarket, calls: [approveCall(MARKET_MANAGER, CREATION_FEE_ATOMIC), create] });
    assert.ok(typeof (await postRpc(mock, "bundler", "eth_sendUserOperation", [toRpcUserOperation(made.op), ENTRY_POINT_V07])).body["result"] === "string");
    await mock.creation.sync();
    const market = [...mock.creation.markets.values()][0];
    assert.ok(market !== undefined);
    const created = mock.state.marketByCondition(market.conditionId);
    assert.ok(created !== undefined);
    const seed = await placeOrder(mock, trader, creds, { tokenId: created.yesTokenId, side: "BUY", tick: 500, sharesMicro: 9_000_000n }, { variant: { target: "path-only", decode: "b64url-decoded-padded", address: false } });
    assert.equal(seed.reply.status, 200, seed.reply.text);
    await mock.advance(601);
    assert.equal(mock.creation.markets.get(market.conditionId)?.status, "ACTIVE");
    assert.deepEqual(mock.internalErrors(), []);
  });
});

describe("the pessimistic profile is a wall", () => {
  harness.it("the default profile is the pessimistic column, and each step of the journey is refused for its own reason", async (mock) => {
    assert.deepEqual(mock.switches.snapshot(), PESSIMISTIC_PROFILE);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    // The XO node and the bundler are down: no connection at all.
    await assert.rejects(postRpc(mock, "bundler", "eth_chainId"));
    await assert.rejects(postRpc(mock, "xoRpc", "eth_chainId"));
    // Opened, the bundler still wants the packed shape, and a first op from an unprovisioned account is not on its allowlist.
    mock.setSwitch("rpc.access", "open");
    const built = await buildOp({ chain, owner: chain.owner(2), init: true, sponsored: true, calls: enableTradingCalls() });
    assert.equal(((await postRpc(mock, "bundler", "eth_sendUserOperation", [toRpcUserOperation(built.op), ENTRY_POINT_V07])).body["error"] as { code: number }).code, -32602, "reject-unpacked");
    assert.equal(((await postRpc(mock, "bundler", "eth_estimateUserOperationGas", [toRpcUserOperation(built.op), ENTRY_POINT_V07])).body["error"] as { code: number }).code, -32601, "no estimate");
    mock.setSwitch("bundler.shape", "v0.7-unpacked");
    assert.match(((await postRpc(mock, "bundler", "eth_sendUserOperation", [toRpcUserOperation(built.op), ENTRY_POINT_V07])).body["error"] as { message: string }).message, /allowlist/);
    mock.setSwitch("bundler.foreign_account", "accept");
    assert.match(((await postRpc(mock, "bundler", "eth_sendUserOperation", [toRpcUserOperation(built.op), ENTRY_POINT_V07])).body["error"] as { message: string }).message, /^AA34/, "the paymaster is paused");
    assert.equal(await mock.chains.isDeployed(built.account), false);

    // Deployed some other way, the account is still not registered, so it cannot trade.
    const { setupTrader } = await import("./traders.js");
    const live = await setupTrader(mock, 3, { register: false });
    assert.equal(((await getJson(mock, "orderbook", `/balance-allowance?address=${live.account}`)).body as { smart_account: unknown }).smart_account, null);
    // L1 works for a deployed account, but one key only, and derive does not return the secret.
    const creds = await createCredentials(mock, live);
    assert.equal((await getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: await l1Headers(mock, live) })).status, 400);
    assert.deepEqual((await getJson(mock, "orderbook", "/auth/derive-api-key", { headers: await l1Headers(mock, live) })).body, { apiKey: creds.apiKey });
    // The first L2 form a client would try (path only, padded, no address) is refused; the one the pessimistic server wants works.
    const plugin = { target: "path-only", decode: "b64url-decoded-padded", address: false } as const;
    assert.equal((await l2Call(mock, live, creds, "GET", "/auth/api-keys", undefined, { variant: plugin })).status, 401);
    assert.equal((await l2Call(mock, live, creds, "GET", "/auth/api-keys")).status, 200);
    // Orders: the 0x01 prefix is refused (only 0x00 is accepted), forms are EIP-191 only, 5 shares and $1 are the floors, 180 s the shortest life.
    const { yes } = marketTokens(mock, "clob-active-a");
    mock.state.forceRegistered(live.account);
    const attempt = async (spec: Parameters<typeof placeOrder>[3]) => (await placeOrder(mock, live, creds, spec)).reply;
    const refusedPrefix = await attempt({ tokenId: yes, side: "BUY", tick: 300, sharesMicro: 10_000_000n });
    assert.match((refusedPrefix.body as { error: string }).error, /0x01 signature prefix is not accepted/);
    assert.match(((await attempt({ tokenId: yes, side: "BUY", tick: 300, sharesMicro: 10_000_000n, sign: { form: "raw", prefix: "0x00" } })).body as { error: string }).error, /only the EIP-191 form/);
    assert.match(((await attempt({ tokenId: yes, side: "BUY", tick: 300, sharesMicro: 2_000_000n, sign: { prefix: "0x00" }, ttlSeconds: 600 })).body as { error: string }).error, /size below minimum/);
    assert.match(((await attempt({ tokenId: yes, side: "BUY", tick: 100, sharesMicro: 5_000_000n, sign: { prefix: "0x00" }, ttlSeconds: 600 })).body as { error: string }).error, /notional below minimum/);
    assert.match(((await attempt({ tokenId: yes, side: "BUY", tick: 300, sharesMicro: 5_000_000n, sign: { prefix: "0x00" }, ttlSeconds: 60 })).body as { error: string }).error, /at least 180 seconds/);
    assert.equal((await attempt({ tokenId: yes, side: "BUY", tick: 300, sharesMicro: 5_000_000n, sign: { prefix: "0x00" }, ttlSeconds: 600 })).status, 200, "and one that satisfies every pessimistic rule is accepted");
    // The cancel forms the relay would try first are not the ones the server takes (numeric id only), and batch needs a signature.
    const order = [...mock.write.orders.values()][0];
    assert.ok(order !== undefined);
    assert.deepEqual((await l2Call(mock, live, creds, "DELETE", "/order", { orderID: order.hash })).body, { canceled: [], notCanceled: { [order.hash]: "not found" } });
    assert.equal((await l2Call(mock, live, creds, "DELETE", "/cancel-all")).status, 400);
    assert.equal((await l2Call(mock, live, creds, "DELETE", "/order", { orderID: String(order.id) })).status, 200);
  });

  harness.it("a deposit is minted on XO but never credited by the orderbook (FU6)", async (mock) => {
    mock.setSwitch("rpc.access", "open");
    const { setupTrader } = await import("./traders.js");
    const live = await setupTrader(mock, 2, { fundMicro: 0n });
    mock.hyperlane.setBaseBalance(live.owner.address, 10_000_000n);
    await mock.hyperlane.baseApprove(live.owner.address, BASE_WARP_ROUTER, 3_000_000n);
    await mock.hyperlane.baseTransferRemote({ from: live.owner.address, recipient: padRecipient(live.account), amount: 3_000_000n });
    await mock.advance(3600);
    const minted = BigInt((await postRpc(mock, "xoRpc", "eth_call", [{ to: USDC_E_ADDRESS, data: encodeFunctionData({ abi: USDCE_STUB_ABI, functionName: "balanceOf", args: [live.account] }) }, "latest"])).body["result"] as string);
    assert.equal(minted, 3_000_000n);
    assert.equal(((await getJson(mock, "orderbook", `/balance-allowance?address=${live.account}`)).body as { balance: string }).balance, "0", "FU6: not credited");
  });
});
