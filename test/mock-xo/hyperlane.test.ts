import assert from "node:assert/strict";
import { describe } from "node:test";

import { encodeFunctionData, getAddress, pad, type Address, type Hex } from "viem";

import { ERC20_ABI } from "../../src/xo/chain/abi.js";
import {
  BASE_USDC,
  BASE_WARP_ROUTER,
  ENTRY_POINT_V07,
  GAS_DEFAULTS,
  HYPERLANE_MAILBOX,
  PROCESS_ID_TOPIC,
  USDC_E_ADDRESS,
  XO_WARP_ROUTE,
} from "../../src/xo/chain/constants.js";
import { RpcReader, readImplementationSlot, readRoutePairing, type RpcTransport } from "../../src/xo/chain/reads.js";
import { routePairingTripwire } from "../../src/xo/chain/tripwires.js";
import { padRecipient } from "../../src/xo/funding/calldata.js";
import { checkDelivery, extractFundingDispatch, type DeliveryReader } from "../../src/xo/funding/delivery.js";
import { BaseRpc, checkFundingAmount } from "../../src/xo/funding/preflight.js";
import { approveCall, buildOp, transferRemoteCall } from "../anvil/scenarios.js";
import { USDCE_STUB_ABI } from "../anvil/stubs.js";
import { toRpcUserOperation } from "../../src/xo/userop/bundler.js";
import type { MockXo } from "./server.js";
import { getJson, postRpc, useMock } from "./testing.js";
import { setupTrader, traderFor, type Trader } from "./traders.js";
import { encodeAbiParameters } from "viem";

// The Hyperlane emulation, read the way the production funding code reads it (BaseRpc, RpcReader, checkDelivery).
// Basis: docs/research/20. The 10 to 30 s delivery window is mock time; the credit rules are the open question FU6 (M).

const USDC = 1_000_000n;

function readers(mock: MockXo): { base: BaseRpc; xo: RpcReader } {
  const transport: RpcTransport = mock.rpcTransport;
  return { base: new BaseRpc({ transport, url: "https://mainnet.base.org" }), xo: new RpcReader({ transport, url: "https://rpc-mainnet-2.xo.market/" }) };
}

async function usdceOnXo(mock: MockXo, address: Address): Promise<bigint> {
  const data = encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [address] });
  return BigInt((await postRpc(mock, "xoRpc", "eth_call", [{ to: USDC_E_ADDRESS, data }, "latest"])).body["result"] as Hex);
}

async function orderbookBalance(mock: MockXo, account: Address): Promise<bigint> {
  return BigInt(((await getJson(mock, "orderbook", `/balance-allowance?address=${account}`)).body as { balance: string }).balance);
}

// The user's wallet on Base: approve the exact amount, then transferRemote. Returns the second transaction.
async function fund(mock: MockXo, trader: Trader, amount: bigint, recipient: Hex = padRecipient(trader.account)) {
  mock.hyperlane.setBaseBalance(trader.owner.address, 50n * USDC);
  await mock.hyperlane.baseApprove(trader.owner.address, BASE_WARP_ROUTER, amount);
  return mock.hyperlane.baseTransferRemote({ from: trader.owner.address, recipient, amount });
}

describe("the route is readable the way the funding preflight reads it", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("Base and XO pair up: token, routers, Mailbox, ISM, hooks, domains, implementation slots and the quote all read as pinned", async (mock) => {
    mock.setSwitch("rpc.access", "open");
    const { base, xo } = readers(mock);
    const trader = traderFor(mock, 2);
    const reading = await readRoutePairing({ baseRpc: base.reader, xoRpc: xo }, trader.account, 5n * USDC);
    const result = routePairingTripwire(reading, { requireXoSide: true });
    assert.equal(result.tripped, false, JSON.stringify(result));
    assert.equal(await base.chainId(), 8453);
    assert.equal((await readImplementationSlot(base.reader, BASE_WARP_ROUTER)) !== null, true);
    assert.equal(await base.balanceOf(trader.owner.address), 0n);
  });

  harness.it("an upgraded router is visible: overriding the implementation slot trips the pairing tripwire", async (mock) => {
    mock.setSwitch("rpc.access", "open");
    const { base, xo } = readers(mock);
    const trader = traderFor(mock, 2);
    mock.virtual.implementations.set(`base:${BASE_WARP_ROUTER.toLowerCase()}`, getAddress(`0x${"22".repeat(20)}`));
    const result = routePairingTripwire(await readRoutePairing({ baseRpc: base.reader, xoRpc: xo }, trader.account, 5n * USDC), { requireXoSide: true });
    assert.equal(result.tripped, true);
    mock.virtual.revertAll = true;
    const dead = routePairingTripwire(await readRoutePairing({ baseRpc: base.reader, xoRpc: xo }, trader.account, 5n * USDC), { requireXoSide: true });
    assert.equal(dead.tripped, true, "an unreadable pairing counts as tripped");
  });
});

describe("a deposit: Base escrow, then XO mint 10 to 30 s later", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("approve, transferRemote, then the message is delivered inside the window: Mailbox.delivered flips, USDC.e is minted, ProcessId is in the explorer", async (mock) => {
    mock.setSwitch("rpc.access", "open");
    mock.setSwitch("funding.credit", "credited");
    mock.paymaster.reconcile("sponsor").catch(() => undefined);
    const trader = await setupTrader(mock, 2, { fundMicro: 0n });
    const { base, xo } = readers(mock);
    const sent = await fund(mock, trader, 3n * USDC);
    assert.equal(sent.status, "success");
    assert.ok(sent.messageId !== null);
    // Escrowed on Base, nothing on XO yet.
    assert.equal(await base.balanceOf(trader.owner.address), 47n * USDC);
    assert.equal(await base.allowance(trader.owner.address), 0n);
    assert.equal(await usdceOnXo(mock, trader.account), 0n);

    // The production monitor reads the Base receipt through the Base RPC.
    const receipt = await base.getTransactionReceipt(sent.transactionHash);
    assert.ok(receipt !== null);
    const extracted = extractFundingDispatch(receipt, { account: trader.account, amount: 3n * USDC });
    assert.ok(extracted.ok);
    assert.equal(extracted.ok && extracted.messageId, sent.messageId);
    const stamp = await base.getBlockTimestamp(receipt.blockNumber);
    assert.equal(stamp !== null && Number(stamp) >= mock.clock.nowSeconds(), true);

    const delivered = async (): Promise<boolean> => {
      const data = encodeFunctionData({ abi: [{ type: "function", name: "delivered", stateMutability: "view", inputs: [{ name: "_id", type: "bytes32" }], outputs: [{ type: "bool" }] }], functionName: "delivered", args: [sent.messageId as Hex] });
      return BigInt((await postRpc(mock, "xoRpc", "eth_call", [{ to: HYPERLANE_MAILBOX, data }, "latest"])).body["result"] as Hex) === 1n;
    };
    assert.equal(await delivered(), false);
    await mock.advance(9);
    assert.equal(await delivered(), false, "nothing is delivered in under 10 s");
    const message = mock.hyperlane.messages[0];
    assert.ok(message !== undefined);
    const dueIn = (message.dueMs - message.dispatchedAtMs) / 1000;
    assert.ok(dueIn >= 10 && dueIn <= 30, `${String(dueIn)} s`);
    await mock.advance(21);
    assert.equal(await delivered(), true);
    assert.equal(await usdceOnXo(mock, trader.account), 3n * USDC, "minted on XO");
    assert.equal(await orderbookBalance(mock, trader.account), 3n * USDC, "and credited by the orderbook (funding.credit = credited)");
    // The explorer index carries the delivery for a reader without an RPC.
    const logs = await getJson(mock, "explorer", `/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=${HYPERLANE_MAILBOX}&topic0=${PROCESS_ID_TOPIC}&topic0_1_opr=and&topic1=${sent.messageId}`);
    assert.equal(((logs.body as { result: unknown[] }).result).length, 1);

    // The whole chain of states, through the production classifier.
    const reader: DeliveryReader = {
      getReceipt: (hash) => base.getTransactionReceipt(hash),
      getBlockTimestamp: (block) => base.getBlockTimestamp(block),
      isDelivered: async () => delivered(),
      getXoBalance: (account) => Promise.resolve(BigInt(0) + 0n).then(() => orderbookBalance(mock, account)),
    };
    const report = await checkDelivery({ reader, nowMs: () => mock.clock.nowMs() }, { txHash: sent.transactionHash, account: trader.account, amount: 3n * USDC, xoBalanceBefore: 0n });
    assert.equal(report.state, "credited");
    assert.equal(xo.requiresKey, false);
  });

  harness.it("a delivery time is 10 to 30 s for every message and is not the same for all (seeded from the message id)", async (mock) => {
    const trader = await setupTrader(mock, 2, { fundMicro: 0n });
    mock.hyperlane.setBaseBalance(trader.owner.address, 100n * USDC);
    const windows = new Set<number>();
    for (let i = 0; i < 12; i += 1) {
      await mock.hyperlane.baseApprove(trader.owner.address, BASE_WARP_ROUTER, 1n * USDC);
      const sent = await mock.hyperlane.baseTransferRemote({ from: trader.owner.address, recipient: padRecipient(trader.account), amount: 1n * USDC });
      assert.equal(sent.status, "success");
      const message = mock.hyperlane.messages[i];
      const seconds = ((message?.dueMs ?? 0) - (message?.dispatchedAtMs ?? 0)) / 1000;
      assert.ok(seconds >= 10 && seconds <= 30, `${String(seconds)}`);
      windows.add(seconds);
      await mock.advance(1);
    }
    assert.ok(windows.size > 3, "the delays differ");
  });

  harness.it("the Base transaction fails like the contract: value above zero, no allowance, no balance, a destination that is not enrolled", async (mock) => {
    mock.setSwitch("rpc.access", "open");
    const trader = await setupTrader(mock, 2, { fundMicro: 0n });
    const { base } = readers(mock);
    const owner = trader.owner.address;
    const word = padRecipient(trader.account);
    mock.hyperlane.setBaseBalance(owner, 5n * USDC);
    const attempts: [string, Promise<Awaited<ReturnType<typeof mock.hyperlane.baseTransferRemote>>>][] = [
      ["no allowance", mock.hyperlane.baseTransferRemote({ from: owner, recipient: word, amount: 1n * USDC })],
    ];
    await mock.hyperlane.baseApprove(owner, BASE_WARP_ROUTER, 10n * USDC);
    attempts.push(["value", mock.hyperlane.baseTransferRemote({ from: owner, recipient: word, amount: 1n * USDC, value: 1n })]);
    attempts.push(["balance", mock.hyperlane.baseTransferRemote({ from: owner, recipient: word, amount: 6n * USDC })]);
    attempts.push(["destination", mock.hyperlane.baseTransferRemote({ from: owner, recipient: word, amount: 1n * USDC, destination: 10 })]);
    const results = await Promise.all(attempts.map(async ([name, promise]) => [name, await promise] as const));
    const revertTexts: Record<string, RegExp> = { "no allowance": /allowance/, value: /MerkleTreeHook: no value expected/, balance: /exceeds balance/, destination: /No router enrolled/ };
    for (const [name, result] of results) {
      assert.equal(result.status, "reverted", name);
      assert.match(result.revert ?? "", revertTexts[name] as RegExp, name);
      const receipt = await base.getTransactionReceipt(result.transactionHash);
      assert.equal(receipt?.status, "reverted", name);
    }
    assert.equal(await base.balanceOf(owner), 5n * USDC, "nothing moved");
    assert.equal(mock.hyperlane.messages.length, 0, "no message exists");
    await mock.advance(3600);
    assert.equal(await usdceOnXo(mock, trader.account), 0n);
  });

  harness.it("a bad recipient is escrowed on Base and NEVER delivered: right-padded word, zero address, amount 0 (nothing is refunded)", async (mock) => {
    mock.setSwitch("rpc.access", "open");
    const trader = await setupTrader(mock, 2, { fundMicro: 0n });
    const owner = trader.owner.address;
    mock.hyperlane.setBaseBalance(owner, 20n * USDC);
    const rightPadded = `0x${trader.account.slice(2).toLowerCase()}${"00".repeat(12)}` as Hex;
    const zero = pad("0x", { size: 32 });
    const cases: [string, Hex, bigint, RegExp][] = [
      ["right-padded", rightPadded, 2n * USDC, /bytes32ToAddress overflow/],
      ["zero address", zero, 2n * USDC, /mint to the zero address/],
      ["amount 0", padRecipient(trader.account), 0n, /mint amount not greater than 0/],
    ];
    for (const [name, recipient, amount, failure] of cases) {
      await mock.hyperlane.baseApprove(owner, BASE_WARP_ROUTER, 5n * USDC);
      const sent = await mock.hyperlane.baseTransferRemote({ from: owner, recipient, amount });
      assert.equal(sent.status, "success", `${name}: Base accepts and escrows`);
      await mock.advance(3600);
      const message = mock.hyperlane.messages.find((entry) => entry.id === sent.messageId);
      assert.equal(message?.state, "undeliverable", name);
      assert.match(message?.failure ?? "", failure, name);
      assert.equal(mock.hyperlane.isDelivered("xo", sent.messageId as Hex), false, name);
    }
    assert.equal(await usdceOnXo(mock, trader.account), 0n);
    assert.equal(mock.hyperlane.baseBalanceOf(owner), 20n * USDC - 4n * USDC, "the escrowed USDC is not returned");
  });

  // [at delivery, 5 minutes later, after XO's sweeper ran]
  const expected: Record<string, [bigint, bigint, bigint]> = {
    credited: [3n * USDC, 3n * USDC, 3n * USDC],
    "not-credited": [0n, 0n, 0n],
    "delayed-5min": [0n, 3n * USDC, 3n * USDC],
    "credited-after-sweep-only": [0n, 0n, 3n * USDC],
  };
  for (const [rule, [atDelivery, later, afterSweep]] of Object.entries(expected)) {
    harness.it(`funding.credit = ${rule}: the mint always happens; the orderbook credit follows the rule`, async (mock) => {
      mock.setSwitch("rpc.access", "open");
      mock.setSwitch("funding.credit", rule as "credited");
      const trader = await setupTrader(mock, 2, { fundMicro: 0n });
      const sent = await fund(mock, trader, 3n * USDC);
      assert.equal(sent.status, "success");
      await mock.advance(30);
      assert.equal(await usdceOnXo(mock, trader.account), 3n * USDC, "minted");
      assert.equal(await orderbookBalance(mock, trader.account), atDelivery, "at delivery");
      await mock.advance(300);
      assert.equal(await orderbookBalance(mock, trader.account), later, "5 minutes later");
      await mock.hyperlane.sweep();
      assert.equal(await orderbookBalance(mock, trader.account), afterSweep, "after the sweep");
    });
  }

  harness.it("an unregistered recipient is minted to but never credited by the orderbook", async (mock) => {
    mock.setSwitch("rpc.access", "open");
    mock.setSwitch("funding.credit", "credited");
    const trader = await setupTrader(mock, 2, { fundMicro: 0n, register: false });
    mock.setSwitch("registry.trigger", "never");
    await fund(mock, trader, 3n * USDC);
    await mock.advance(30);
    assert.equal(await usdceOnXo(mock, trader.account), 3n * USDC);
    assert.equal(await orderbookBalance(mock, trader.account), 0n);
  });
});

describe("a withdrawal sketch (H1): a paymaster-less transferRemote on XO", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  async function withdrawal(mock: MockXo, amount: bigint): Promise<{ trader: Trader; send: () => Promise<Record<string, unknown>> }> {
    mock.setProfile("optimistic");
    const trader = await setupTrader(mock, 2, { fundMicro: 0n });
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    await chain.sendFrom(chain.bundler.address, USDC_E_ADDRESS, encodeFunctionData({ abi: USDCE_STUB_ABI, functionName: "mint", args: [trader.account, 10n * USDC] }));
    const calls = [
      approveCall(XO_WARP_ROUTE, amount),
      { ...transferRemoteCall(), data: `${transferRemoteCall().data.slice(0, 10)}${encodeAbiParameters([{ type: "uint32" }, { type: "bytes32" }, { type: "uint256" }], [8453, padRecipient(trader.owner.address), amount]).slice(2)}` as Hex },
    ];
    const built = await buildOp({ chain, owner: chain.owner(2), sequence: 1n, gas: { ...GAS_DEFAULTS.redeemOne, callGasLimit: 600_000n }, calls });
    return { trader, send: async () => (await postRpc(mock, "bundler", "eth_sendUserOperation", [toRpcUserOperation(built.op), ENTRY_POINT_V07])).body };
  }

  harness.it("accept-and-deliver: the funds leave XO at once and arrive on Base 12 to 18 s later", async (mock) => {
    mock.setProfile("optimistic");
    const { trader, send } = await withdrawal(mock, 4n * USDC);
    mock.setSwitch("withdraw.paymasterless", "accept-and-deliver");
    const answer = await send();
    assert.ok(typeof answer["result"] === "string", JSON.stringify(answer));
    assert.equal(await usdceOnXo(mock, trader.account), 6n * USDC);
    assert.equal(mock.hyperlane.baseBalanceOf(trader.owner.address), 0n);
    const message = mock.hyperlane.messages[0];
    assert.equal(message?.direction, "xo_to_base");
    const dueIn = ((message?.dueMs ?? 0) - (message?.dispatchedAtMs ?? 0)) / 1000;
    assert.ok(dueIn >= 12 && dueIn <= 18, String(dueIn));
    await mock.advance(18);
    assert.equal(mock.hyperlane.baseBalanceOf(trader.owner.address), 4n * USDC);
    assert.equal(mock.hyperlane.isDelivered("base", message?.id ?? "0x"), true);
  });

  harness.it("accept-no-deliver: the funds are burned on XO and never arrive; reject: the bundler refuses and nothing moves", async (mock) => {
    mock.setProfile("optimistic");
    const { trader, send } = await withdrawal(mock, 4n * USDC);
    mock.setSwitch("withdraw.paymasterless", "reject");
    const refused = await send();
    assert.match((refused["error"] as { message: string }).message, /withdrawals without a paymaster are not accepted/);
    assert.equal(await usdceOnXo(mock, trader.account), 10n * USDC, "reject: nothing moved");
    mock.setSwitch("withdraw.paymasterless", "accept-no-deliver");
    assert.ok(typeof (await send())["result"] === "string");
    assert.equal(await usdceOnXo(mock, trader.account), 6n * USDC);
    await mock.advance(3600);
    assert.equal(mock.hyperlane.baseBalanceOf(trader.owner.address), 0n, "never relayed");
    assert.equal(mock.hyperlane.messages[0]?.state, "dispatched");
  });

  harness.it("the funding amount policy still applies on top: above the test amount is refused until delivery and credit were both seen", () => {
    assert.equal(checkFundingAmount({ amount: 4_000_000n, delivery: "unknown", credit: "unknown" }).code, "above_test_amount");
    assert.equal(checkFundingAmount({ amount: 4_000_000n, delivery: "yes", credit: "yes" }).code, "ok");
    assert.equal(BASE_USDC.length, 42);
  });
});
