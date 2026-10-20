import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { concat, encodeAbiParameters, encodeFunctionData, type Hex } from "viem";

import { ERC20_ABI, POLICY_PAYMASTER_ABI } from "../../src/xo/chain/abi.js";
import { APPROVE_SELECTOR, BASE_WARP_ROUTER, CREATION_FEE_ATOMIC, ENTRY_POINT_V07, GAS_DEFAULTS, MARKET_MANAGER, POLICY_PAYMASTER, USDC_E_ADDRESS, XO_WARP_ROUTE } from "../../src/xo/chain/constants.js";
import { padRecipient } from "../../src/xo/funding/calldata.js";
import { toRpcUserOperation } from "../../src/xo/userop/bundler.js";
import { approveCall, buildOp, enableTradingCalls } from "../anvil/scenarios.js";
import { USDCE_STUB_ABI } from "../anvil/stubs.js";
import { MARKET_MANAGER_ABI } from "../../src/xo/chain/abi.js";
import { switchValues, writeSwitches } from "./profile.js";
import type { MockXo } from "./server.js";
import { MOCK_SWITCH_NAMES, PESSIMISTIC_PROFILE, type MockProfile, type MockSwitchName } from "./switches.js";
import { getJson, postRpc, useMock } from "./testing.js";
import {
  createCredentials,
  l1Headers,
  l2Call,
  l2Headers,
  marketTokens,
  placeOrder,
  setupTrader,
  signWrapped,
  traderFor,
  wrapErc6492,
  type Credentials,
  type Trader,
} from "./traders.js";
import { clobAuthDigest } from "./verify.js";

// One probe per write switch. Each flips its switch ALONE from the pessimistic profile, through every value it
// has, and records what the mock then does. A probe may name `needs`: the OTHER switches that would otherwise
// mask its effect (a bundler probe needs the node open, a sponsored op needs the paymaster not paused). All
// the rest stay pessimistic. The expected observation of every value is written out, so a switch that does
// nothing, or the same thing for two values, fails here.

type Needs = Partial<MockProfile>;
interface Probe {
  readonly needs?: Needs;
  // Observes the mock with the switch at `value`. `n` is the index of the value: chain-changing probes use
  // other test accounts for each value, so a value never sees what the previous one left behind.
  readonly observe: (mock: MockXo, value: string, n: number) => Promise<string>;
  readonly expected: Readonly<Record<string, string>>;
}

const ORDER_OPEN: Needs = { "order.sig_forms": "both", "order.prefix": "both", "order.min_size": "0", "order.min_notional": "0", "order.gtd_min": "0" };
const BUNDLER_OPEN: Needs = { "rpc.access": "open", "bundler.shape": "v0.7-unpacked", "paymaster.state": "sponsor", "bundler.foreign_account": "accept" };

const code = (answer: { status: number; body: Record<string, unknown> }): string => {
  if (answer.status === 401) return "http401";
  const error = answer.body["error"] as { code: number } | undefined;
  return error === undefined ? "ok" : `rpc${String(error.code)}`;
};

const sendRpc = (mock: MockXo, op: Parameters<typeof toRpcUserOperation>[0], method = "eth_sendUserOperation") => postRpc(mock, "bundler", method, [toRpcUserOperation(op), ENTRY_POINT_V07]);

async function deployingOp(mock: MockXo, index: number, signWith: "raw" | "eip191" | "none" = "raw") {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  return buildOp({ chain, owner: chain.owner(index), init: true, sponsored: true, calls: enableTradingCalls(), signWith });
}

async function ready(mock: MockXo, index: number): Promise<{ trader: Trader; creds: Credentials; yes: string }> {
  mock.setSwitch("auth.max_keys", "5");
  const trader = await setupTrader(mock, index);
  const creds = await createCredentials(mock, trader);
  mock.setSwitch("auth.max_keys", PESSIMISTIC_PROFILE["auth.max_keys"]);
  return { trader, creds, yes: marketTokens(mock, "clob-active-a").yes };
}

async function usdceOnXo(mock: MockXo, address: string): Promise<bigint> {
  const data = encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [address as `0x${string}`] });
  return BigInt((await postRpc(mock, "xoRpc", "eth_call", [{ to: USDC_E_ADDRESS, data }, "latest"])).body["result"] as Hex);
}

const orderStatuses = async (mock: MockXo, trader: Trader, creds: Credentials, yes: string, specs: readonly { sharesMicro: bigint; tick: number; ttlSeconds?: number }[]): Promise<string> => {
  const out: string[] = [];
  for (const spec of specs) out.push(String((await placeOrder(mock, trader, creds, { tokenId: yes, side: "BUY", ...spec })).reply.status));
  return out.join(",");
};

const PROBES: Readonly<Record<string, Probe>> = {
  "bundler.foreign_account": {
    needs: BUNDLER_OPEN,
    observe: async (mock, _value, n) => code(await sendRpc(mock, (await deployingOp(mock, 2 + n)).op)),
    expected: { reject: "rpc-32500", accept: "ok", "requires-key": "http401" },
  },
  "bundler.paymasterless": {
    needs: BUNDLER_OPEN,
    observe: async (mock, _value, n) => {
      const chain = mock.chains.xo;
      assert.ok(chain !== undefined);
      await setupTrader(mock, 2 + n, { enableTrading: false });
      const free = await buildOp({ chain, owner: chain.owner(2 + n), sequence: 1n, gas: GAS_DEFAULTS.enableTrading, calls: enableTradingCalls() });
      return code(await sendRpc(mock, free.op));
    },
    expected: { reject: "rpc-32500", accept: "ok" },
  },
  "bundler.estimate": {
    needs: BUNDLER_OPEN,
    observe: async (mock, _value, n) => code(await sendRpc(mock, (await deployingOp(mock, 2 + n, "none")).op, "eth_estimateUserOperationGas")),
    expected: { unsupported: "rpc-32601", supported: "ok" },
  },
  "bundler.shape": {
    needs: BUNDLER_OPEN,
    observe: async (mock, _value, n) => {
      const unpacked = code(await sendRpc(mock, (await deployingOp(mock, 2 + 2 * n)).op));
      const built = await deployingOp(mock, 3 + 2 * n);
      const packed = code(await postRpc(mock, "bundler", "eth_sendUserOperation", [
        {
          sender: built.op.sender,
          nonce: `0x${built.op.nonce.toString(16)}`,
          initCode: built.op.initCode,
          callData: built.op.callData,
          accountGasLimits: built.op.accountGasLimits,
          preVerificationGas: `0x${built.op.preVerificationGas.toString(16)}`,
          gasFees: built.op.gasFees,
          paymasterAndData: built.op.paymasterAndData,
          signature: built.op.signature,
        },
        ENTRY_POINT_V07,
      ]));
      return `unpacked=${unpacked} packed=${packed}`;
    },
    expected: { "reject-unpacked": "unpacked=rpc-32602 packed=ok", "v0.7-unpacked": "unpacked=ok packed=rpc-32602" },
  },
  "paymaster.state": {
    needs: { "rpc.access": "open", "bundler.shape": "v0.7-unpacked", "bundler.foreign_account": "accept" },
    observe: async (mock, _value, n) => {
      const chain = mock.chains.xo;
      assert.ok(chain !== undefined);
      const read = async (functionName: "paused" | "checkPolicy"): Promise<string> => {
        const data =
          functionName === "paused"
            ? encodeFunctionData({ abi: POLICY_PAYMASTER_ABI, functionName })
            : encodeFunctionData({ abi: POLICY_PAYMASTER_ABI, functionName, args: [chain.owner(2).address, USDC_E_ADDRESS, APPROVE_SELECTOR] });
        const raw = (await postRpc(mock, "xoRpc", "eth_call", [{ to: POLICY_PAYMASTER, data }, "latest"])).body["result"] as Hex;
        return String(BigInt(raw.slice(0, 66)) === 1n);
      };
      const paused = await read("paused");
      const approveAllowed = await read("checkPolicy");
      const send = code(await sendRpc(mock, (await deployingOp(mock, 2 + n)).op));
      return `paused=${paused} approveAllowed=${approveAllowed} send=${send}`;
    },
    expected: {
      paused: "paused=true approveAllowed=true send=rpc-32501",
      "policy-narrowed": "paused=false approveAllowed=false send=rpc-32501",
      sponsor: "paused=false approveAllowed=true send=ok",
    },
  },
  "l1.undeployed": {
    observe: async (mock, _value, n) => {
      const trader = traderFor(mock, 2 + n);
      const timestamp = String(mock.clock.nowSeconds());
      const inner = await signWrapped(trader, clobAuthDigest(trader.account, timestamp, 0n), {});
      const attempt = async (signature: Hex): Promise<string> => {
        const reply = await getJson(mock, "orderbook", "/auth/derive-api-key", { headers: { ...(await l1Headers(mock, trader, { timestamp })), xo_signature: signature } });
        return reply.status === 401 ? (reply.body as { error: string }).error.replace(/^L1 signature invalid \(/, "").replace(/\)$/, "") : String(reply.status);
      };
      return `wrapped=${await attempt(wrapErc6492(trader, inner))} plain=${await attempt(inner)}`;
    },
    expected: {
      reject: "wrapped=ECDSA failed; EIP-1271: no contract code plain=ECDSA failed; EIP-1271: no contract code",
      erc6492: "wrapped=404 plain=ECDSA failed; EIP-1271: no contract code",
    },
  },
  "auth.derive_returns_secret": {
    observe: async (mock, value, n) => {
      const trader = await setupTrader(mock, 2 + n);
      await createCredentials(mock, trader);
      const reply = await getJson(mock, "orderbook", "/auth/derive-api-key", { headers: await l1Headers(mock, trader) });
      return `${value}:${Object.keys(reply.body as object).sort().join("+")}`;
    },
    expected: { no: "no:apiKey", yes: "yes:apiKey+passphrase+secret" },
  },
  "auth.max_keys": {
    observe: async (mock, _value, n) => {
      const trader = await setupTrader(mock, 2 + n);
      let created = 0;
      for (let i = 0; i < 8; i += 1) {
        const reply = await getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: await l1Headers(mock, trader) });
        if (reply.status !== 200) return `created=${String(created)} then=${String(reply.status)}`;
        created += 1;
      }
      return `created=${String(created)}`;
    },
    expected: { "1": "created=1 then=400", "5": "created=5 then=400" },
  },
  "auth.delete_level": {
    observe: async (mock, _value, n) => {
      mock.setSwitch("auth.max_keys", "5");
      const trader = await setupTrader(mock, 2 + n);
      const creds = await createCredentials(mock, trader);
      const spare = [await createCredentials(mock, trader), await createCredentials(mock, trader)];
      mock.setSwitch("auth.max_keys", "1");
      const del = (headers: Record<string, string>, apiKey: string) => getJson(mock, "orderbook", "/auth/api-key", { method: "DELETE", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ api_key: apiKey }) });
      const viaL1 = (await del(await l1Headers(mock, trader), (spare[0] as Credentials).apiKey)).status;
      const viaL2 = (await del(l2Headers(mock, trader, creds, "DELETE", "/auth/api-key", { body: JSON.stringify({ api_key: (spare[1] as Credentials).apiKey }) }), (spare[1] as Credentials).apiKey)).status;
      return `l1=${String(viaL1)} l2=${String(viaL2)}`;
    },
    expected: { L1: "l1=200 l2=401", L2: "l1=401 l2=200" },
  },
  "hmac.target": {
    needs: { "hmac.decode": "b64url-decoded-padded", "l2.xo_address": "ignored" },
    observe: async (mock, _value, n) => {
      const { trader, creds } = await ready(mock, 2 + n);
      const withQuery = (await l2Call(mock, trader, creds, "GET", "/orders?limit=1", undefined, { variant: { target: "path-with-query" } })).status;
      const pathOnly = (await l2Call(mock, trader, creds, "GET", "/orders?limit=1", undefined, { variant: { target: "path-only" } })).status;
      return `withQuery=${String(withQuery)} pathOnly=${String(pathOnly)}`;
    },
    expected: { "path-with-query": "withQuery=200 pathOnly=401", "path-only": "withQuery=401 pathOnly=200" },
  },
  "hmac.decode": {
    needs: { "hmac.target": "path-only", "l2.xo_address": "ignored" },
    observe: async (mock, _value, n) => {
      const { trader, creds } = await ready(mock, 2 + n);
      const out: string[] = [];
      for (const decode of ["stripped", "raw", "b64url-decoded-padded"] as const) {
        out.push(`${decode}=${String((await l2Call(mock, trader, creds, "GET", "/auth/api-keys", undefined, { variant: { decode } })).status)}`);
      }
      return out.join(" ");
    },
    expected: {
      stripped: "stripped=200 raw=401 b64url-decoded-padded=401",
      raw: "stripped=401 raw=200 b64url-decoded-padded=401",
      "b64url-decoded-padded": "stripped=401 raw=401 b64url-decoded-padded=200",
    },
  },
  "l2.required_on_post": {
    needs: ORDER_OPEN,
    observe: async (mock, _value, n) => {
      const { trader, yes } = await ready(mock, 2 + n);
      return String((await placeOrder(mock, trader, undefined, { tokenId: yes, side: "BUY", tick: 300, sharesMicro: 10_000_000n })).reply.status);
    },
    expected: { no: "200", yes: "401" },
  },
  "l2.xo_address": {
    needs: { "hmac.target": "path-only", "hmac.decode": "b64url-decoded-padded" },
    observe: async (mock, _value, n) => {
      const { trader, creds } = await ready(mock, 2 + n);
      return String((await l2Call(mock, trader, creds, "GET", "/auth/api-keys", undefined, { variant: { address: false } })).status);
    },
    expected: { required: "401", ignored: "200" },
  },
  "order.min_size": {
    needs: { ...ORDER_OPEN, "order.min_size": PESSIMISTIC_PROFILE["order.min_size"] },
    observe: async (mock, _value, n) => {
      const { trader, creds, yes } = await ready(mock, 2 + n);
      return orderStatuses(mock, trader, creds, yes, [{ sharesMicro: 500_000n, tick: 400 }, { sharesMicro: 1_000_000n, tick: 400 }, { sharesMicro: 5_000_000n, tick: 400 }]);
    },
    expected: { "5": "422,422,200", "1": "422,200,200", "0": "200,200,200" },
  },
  "order.min_notional": {
    needs: ORDER_OPEN,
    observe: async (mock, _value, n) => {
      const { trader, creds, yes } = await ready(mock, 2 + n);
      // $0.10, $0.30, $1.00 of collateral
      return orderStatuses(mock, trader, creds, yes, [{ sharesMicro: 10_000_000n, tick: 10 }, { sharesMicro: 10_000_000n, tick: 30 }, { sharesMicro: 10_000_000n, tick: 100 }]);
    },
    expected: { "1": "422,422,200", "0.30": "422,200,200", "0": "200,200,200" },
  },
  "order.gtd_min": {
    needs: ORDER_OPEN,
    observe: async (mock, _value, n) => {
      const { trader, creds, yes } = await ready(mock, 2 + n);
      return orderStatuses(mock, trader, creds, yes, [{ sharesMicro: 10_000_000n, tick: 300, ttlSeconds: 30 }, { sharesMicro: 10_000_000n, tick: 301, ttlSeconds: 120 }, { sharesMicro: 10_000_000n, tick: 302, ttlSeconds: 300 }]);
    },
    expected: { "180": "400,400,200", "60": "400,200,200", "0": "200,200,200" },
  },
  "order.sig_forms": {
    needs: { ...ORDER_OPEN, "order.sig_forms": PESSIMISTIC_PROFILE["order.sig_forms"] },
    observe: async (mock, _value, n) => {
      const { trader, creds, yes } = await ready(mock, 2 + n);
      const status = async (form: "raw" | "eip191", tick: number): Promise<string> => String((await placeOrder(mock, trader, creds, { tokenId: yes, side: "BUY", tick, sharesMicro: 10_000_000n, sign: { form, prefix: "0x01" } })).reply.status);
      return `raw=${await status("raw", 300)} eip191=${await status("eip191", 301)}`;
    },
    expected: { "eip191-only": "raw=400 eip191=200", "raw-only": "raw=200 eip191=400", both: "raw=200 eip191=200" },
  },
  "order.prefix": {
    needs: { ...ORDER_OPEN, "order.prefix": PESSIMISTIC_PROFILE["order.prefix"] },
    observe: async (mock, _value, n) => {
      const { trader, creds, yes } = await ready(mock, 2 + n);
      const status = async (prefix: "0x01" | "0x00", tick: number): Promise<string> => String((await placeOrder(mock, trader, creds, { tokenId: yes, side: "BUY", tick, sharesMicro: 10_000_000n, sign: { form: "eip191", prefix } })).reply.status);
      return `0x01=${await status("0x01", 300)} 0x00=${await status("0x00", 301)}`;
    },
    expected: { "0x00": "0x01=400 0x00=200", "0x01": "0x01=200 0x00=400", both: "0x01=200 0x00=200" },
  },
  "order.dup_key_includes_sig": {
    needs: ORDER_OPEN,
    observe: async (mock, _value, n) => {
      const { trader, creds, yes } = await ready(mock, 2 + n);
      // The same order, signed twice in forms that differ in bytes (raw and EIP-191): same order hash, different signature.
      const first = await placeOrder(mock, trader, creds, { tokenId: yes, side: "BUY", tick: 300, sharesMicro: 10_000_000n, salt: 31n, sign: { form: "eip191" } });
      const second = await placeOrder(mock, trader, creds, { tokenId: yes, side: "BUY", tick: 300, sharesMicro: 10_000_000n, salt: 31n, sign: { form: "raw" } });
      return `${String(first.reply.status)},${String(second.reply.status)}`;
    },
    expected: { yes: "200,200", no: "200,400" },
  },
  "cancel.body": {
    needs: ORDER_OPEN,
    observe: async (mock, _value, n) => {
      const { trader, creds, yes } = await ready(mock, 2 + n);
      const forms = [
        ["orderID+hash", "orderID", (order: { hash: string }) => order.hash],
        ["orderId+hash", "orderId", (order: { hash: string }) => order.hash],
        ["orderID+numeric", "orderID", (order: { id: number }) => String(order.id)],
      ] as const;
      const out: string[] = [];
      let tick = 300;
      for (const [label, key, id] of forms) {
        const placed = await placeOrder(mock, trader, creds, { tokenId: yes, side: "BUY", tick, sharesMicro: 10_000_000n });
        tick += 1;
        const order = [...mock.write.orders.values()].find((entry) => entry.hash === placed.built.hash) as { hash: string; id: number };
        const reply = await l2Call(mock, trader, creds, "DELETE", "/order", { [key]: id(order as never) });
        out.push(`${label}=${String(reply.status)}${reply.status === 200 && (reply.body as { canceled: string[] }).canceled.length === 1 ? "!" : ""}`);
      }
      return out.join(" ");
    },
    expected: {
      "numeric-id": "orderID+hash=200 orderId+hash=400 orderID+numeric=200!",
      orderId: "orderID+hash=400 orderId+hash=200! orderID+numeric=400",
      "orderID-hash": "orderID+hash=200! orderId+hash=400 orderID+numeric=200",
    },
  },
  "cancel.batch_hmac_only": {
    needs: ORDER_OPEN,
    observe: async (mock, _value, n) => {
      const { trader, creds, yes } = await ready(mock, 2 + n);
      await placeOrder(mock, trader, creds, { tokenId: yes, side: "BUY", tick: 300, sharesMicro: 10_000_000n });
      const reply = await l2Call(mock, trader, creds, "DELETE", "/cancel-all");
      return `${String(reply.status)} live=${String(mock.engine.liveOrders(trader.key).length)}`;
    },
    expected: { no: "400 live=1", yes: "200 live=0" },
  },
  "engine.taker_delay": {
    needs: ORDER_OPEN,
    observe: async (mock, _value, n) => {
      const { trader, creds, yes } = await ready(mock, 2 + n);
      const pending = placeOrder(mock, trader, creds, { tokenId: yes, side: "BUY", tick: 520, sharesMicro: 1_000_000n, orderType: "FAK" });
      for (let i = 0; i < 600 && mock.clock.waiterCount() === 0; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 5));
      await mock.advance(0.6);
      const released = await Promise.race([pending.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 80))]);
      if (!released) {
        await mock.advance(3);
        await pending;
      }
      return `after 0.6 s: ${released ? "released" : "held"}`;
    },
    expected: { "3000": "after 0.6 s: held", "500": "after 0.6 s: released" },
  },
  "engine.balance_drop": {
    needs: ORDER_OPEN,
    observe: async (mock, _value, n) => {
      const { trader, creds, yes } = await ready(mock, 2 + n);
      await placeOrder(mock, trader, creds, { tokenId: yes, side: "BUY", tick: 300, sharesMicro: 100_000_000n });
      mock.state.setBalance(trader.account, { balanceMicro: 20_000_000n });
      return `live=${String(mock.engine.liveOrders(trader.key).length)}`;
    },
    expected: { "lifo-off": "live=1", "lifo-on": "live=0" },
  },
  "funding.credit": {
    observe: async (mock, _value, n) => {
      const trader = await setupTrader(mock, 2 + n, { fundMicro: 0n });
      mock.hyperlane.setBaseBalance(trader.owner.address, 10_000_000n);
      await mock.hyperlane.baseApprove(trader.owner.address, BASE_WARP_ROUTER, 3_000_000n);
      await mock.hyperlane.baseTransferRemote({ from: trader.owner.address, recipient: padRecipient(trader.account), amount: 3_000_000n });
      const balance = async (): Promise<string> => ((await getJson(mock, "orderbook", `/balance-allowance?address=${trader.account}`)).body as { balance: string }).balance;
      await mock.advance(30);
      const atDelivery = await balance();
      await mock.advance(300);
      const later = await balance();
      await mock.hyperlane.sweep();
      return `delivery=${atDelivery} +5min=${later} sweep=${await balance()}`;
    },
    expected: {
      "not-credited": "delivery=0 +5min=0 sweep=0",
      "delayed-5min": "delivery=0 +5min=3000000 sweep=3000000",
      "credited-after-sweep-only": "delivery=0 +5min=0 sweep=3000000",
      credited: "delivery=3000000 +5min=3000000 sweep=3000000",
    },
  },
  "withdraw.paymasterless": {
    needs: { ...BUNDLER_OPEN, "bundler.paymasterless": "accept", "rpc.access": "open" },
    observe: async (mock, _value, n) => {
      const chain = mock.chains.xo;
      assert.ok(chain !== undefined);
      const trader = await setupTrader(mock, 2 + n, { fundMicro: 0n });
      await chain.sendFrom(chain.bundler.address, USDC_E_ADDRESS, encodeFunctionData({ abi: USDCE_STUB_ABI, functionName: "mint", args: [trader.account, 10_000_000n] }));
      const transfer = concat(["0x81b4e8b4", encodeAbiParameters([{ type: "uint32" }, { type: "bytes32" }, { type: "uint256" }], [8453, padRecipient(trader.owner.address), 4_000_000n])]);
      const built = await buildOp({ chain, owner: chain.owner(2 + n), sequence: 1n, gas: { ...GAS_DEFAULTS.redeemOne, callGasLimit: 600_000n }, calls: [approveCall(XO_WARP_ROUTE, 4_000_000n), { target: XO_WARP_ROUTE, data: transfer }] });
      const sent = code(await sendRpc(mock, built.op));
      await mock.advance(30);
      return `send=${sent} xo=${String(await usdceOnXo(mock, trader.account))} base=${String(mock.hyperlane.baseBalanceOf(trader.owner.address))}`;
    },
    expected: {
      "accept-no-deliver": "send=ok xo=6000000 base=0",
      reject: "send=rpc-32500 xo=10000000 base=0",
      "accept-and-deliver": "send=ok xo=6000000 base=4000000",
    },
  },
  "meta.foreign_uri": {
    needs: BUNDLER_OPEN,
    observe: async (mock, _value, n) => {
      const trader = await setupTrader(mock, 2 + n);
      const chain = mock.chains.xo;
      assert.ok(chain !== undefined);
      await chain.sendFrom(chain.bundler.address, USDC_E_ADDRESS, encodeFunctionData({ abi: USDCE_STUB_ABI, functionName: "mint", args: [trader.account, 5_000_000n] }));
      mock.creation.policy = { decision: "approve", reviewDelayS: 120, metadataUpdate: false };
      const now = await chain.blockTimestamp();
      const create = { target: MARKET_MANAGER, data: encodeFunctionData({ abi: MARKET_MANAGER_ABI, functionName: "createConvictionMarket", args: [now, now + 864_000, USDC_E_ADDRESS, "https://metadata.example.invalid/m.json"] }) };
      const built = await buildOp({ chain, owner: chain.owner(2 + n), sequence: 1n, sponsored: true, gas: GAS_DEFAULTS.createMarket, calls: [approveCall(MARKET_MANAGER, CREATION_FEE_ATOMIC), create] });
      assert.equal(code(await sendRpc(mock, built.op)), "ok");
      await mock.advance(600);
      return [...mock.creation.markets.values()].slice(-1).map((market) => market.status).join(",");
    },
    expected: { rejected: "CANCELLED", ignored: "PENDING", reviewed: "ACTIVE" },
  },
  "seed.on_pending": {
    needs: ORDER_OPEN,
    observe: async (mock, _value, n) => {
      const { trader, creds } = await ready(mock, 2 + n);
      const pending = mock.state.addMarket({ seed: `pending-${String(n)}`, title: "Pending", kind: "conviction", status: "PENDING", orderbookActive: false });
      return String((await placeOrder(mock, trader, creds, { tokenId: pending.yesTokenId, side: "BUY", tick: 400, sharesMicro: 10_000_000n })).reply.status);
    },
    expected: { "422": "422", accept: "200" },
  },
};

describe("every write switch has a probe, and a different visible effect for every value", () => {
  it("the probes cover exactly the 27 write switches, with an expectation for every value", () => {
    assert.deepEqual(Object.keys(PROBES).sort(), [...writeSwitches()].sort());
    assert.equal(writeSwitches().length, 27);
    for (const [name, probe] of Object.entries(PROBES)) {
      assert.deepEqual(Object.keys(probe.expected).sort(), [...switchValues(name as MockSwitchName)].sort(), name);
      const texts = Object.values(probe.expected);
      assert.equal(new Set(texts).size, texts.length, `${name}: two values must not look the same`);
    }
  });

  const harness = useMock({ chains: { xo: true, base: true } });

  for (const [name, probe] of Object.entries(PROBES)) {
    harness.it(`${name}: flipped alone from the pessimistic profile, each of its values does what the table says`, async (mock) => {
      // The pessimistic profile, plus only the switches this probe needs out of the way.
      mock.setProfile("pessimistic");
      for (const [other, value] of Object.entries(probe.needs ?? {})) mock.setSwitch(other as MockSwitchName, value as never);
      const seen: Record<string, string> = {};
      const values = switchValues(name as MockSwitchName);
      for (const [n, value] of values.entries()) {
        mock.setSwitch(name as MockSwitchName, value as never);
        seen[value] = await probe.observe(mock, value, n);
      }
      assert.deepEqual(seen, probe.expected, name);
      // Nothing else moved: every other switch is where the profile or the probe's needs put it.
      const wanted: Record<string, string> = { ...PESSIMISTIC_PROFILE, ...(probe.needs ?? {}) };
      for (const other of MOCK_SWITCH_NAMES) {
        if (other === name || other === "faults") continue;
        const touched = ["auth.max_keys"].includes(other);
        if (!touched) assert.equal(mock.switches.get(other), wanted[other], `${other} changed while probing ${name}`);
      }
      assert.deepEqual(mock.internalErrors(), [], "a handler threw");
    });
  }
});

