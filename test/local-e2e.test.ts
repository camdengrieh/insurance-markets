import assert from "node:assert/strict";
import { after, afterEach, describe } from "node:test";

import type { Hex } from "viem";
import type { HDAccount } from "viem/accounts";

import { loadConfig } from "../src/config.js";
import { useEmbeddedRelay } from "../src/relay/client.js";
import { createAccountXoClient, defaultAccountToolDeps, registerAccountTools } from "../src/tools/account.js";
import { registerDraftTools } from "../src/tools/draft.js";
import { defaultFundToolDeps, registerFundTools } from "../src/tools/fund.js";
import { defaultRelayToolDeps, type RelayToolDeps } from "../src/tools/relay-tool-kit.js";
import { registerTradeTools } from "../src/tools/trade.js";
import { registerUseropTools } from "../src/tools/userop.js";
import { deriveAccount } from "../src/xo/account/derive.js";
import { explorerTransportFromHttp } from "../src/xo/chain/reads.js";
import type { EmbeddedRelay } from "../relay/embedded.js";
import { useMock } from "./mock-xo/testing.js";
import type { MockXo } from "./mock-xo/server.js";
import { marketTokens, setupTrader, traderFor } from "./mock-xo/traders.js";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { startEmbedded, OPEN_RATES, type StartedEmbedded } from "./local-helpers.js";
import { tappedFetch } from "./relay-userops-helpers.js";
import { asObj, closeAll, connect, type CallResult, type Harness, type Obj } from "./tools-helpers.js";
import { TEST_MASTER_SECRET } from "./relay-core-helpers.js";

// The whole tool set through the in-process relay, against the local mock XO (real EntryPoint, factory,
// validator and Kernel bytecode on a local anvil). The agent's side is played by the test: it takes the
// `sign_with_paybox` intent a tool returns, signs it with a public Anvil TEST key the way PayBox's
// request_wallet_sign would, and hands the signature to the next tool. Nothing leaves the machine.

const harnessMock = useMock({ chains: { xo: true, base: false } });

afterEach(async () => {
  useEmbeddedRelay(undefined);
  await closeAll();
});
after(() => useEmbeddedRelay(undefined));

const FLAGS = { ENABLE_USEROP_SUBMIT: "1", ENABLE_TRADING: "1", RELAY_ENFORCE_FLAG_FACTS: "0" } as const;

interface World {
  readonly mock: MockXo;
  readonly relay: EmbeddedRelay;
  readonly tools: Harness;
  readonly dir: StartedEmbedded["dir"];
  readonly env: Record<string, string>;
  // Every tool answer the agent got, as text.
  readonly seen: string[];
  readonly started: StartedEmbedded;
}

function mockClock(mock: MockXo) {
  return { now: () => mock.clock.nowMs(), sleep: async (ms: number): Promise<void> => void mock.clock.advanceMs(ms) };
}

interface WorldOptions {
  readonly env?: Record<string, string>;
  readonly fetch?: typeof fetch;
  readonly dir?: StartedEmbedded["dir"];
}

async function world(mock: MockXo, options: WorldOptions = {}): Promise<World> {
  mock.setProfile("optimistic");
  const env = { ...FLAGS, ...options.env };
  const clock = mockClock(mock);
  const started = await startEmbedded({
    env,
    fetch: options.fetch ?? mock.asFetch,
    clock,
    // The owner-confirmation handshake (RT-2) has its own tests (test/relay-owner-confirm.test.ts); this file is about the tool flow.
    ownerConfirmation: false,
    ...(options.dir === undefined ? {} : { dir: options.dir }),
    http: { ...OPEN_RATES, requestBudgetMs: 120_000, hardDeadlineMs: 180_000 },
    extraUpstreamHosts: [{ host: "mainnet.base.org", methods: ["GET", "POST"] }],
  });
  // The plugin side: the same env, the mock's clock, the mock's explorer. The relay client is the default one
  // (built from the configuration), which in local mode is the embedded relay.
  useEmbeddedRelay(started.relay.handler);
  const base: RelayToolDeps = { ...defaultRelayToolDeps(), nowMs: () => mock.clock.nowMs(), env: () => env, config: () => loadConfig(env).config, audit: { write: () => undefined } };
  const connected = await connect((server) => {
    registerDraftTools(server);
    registerAccountTools(server, { ...defaultAccountToolDeps(), ...base, createClient: () => createAccountXoClient(mock.asFetch), explorer: (client) => explorerTransportFromHttp(client.http), rpc: () => undefined });
    registerUseropTools(server, base);
    registerTradeTools(server, base);
    registerFundTools(server, { ...defaultFundToolDeps(), ...base });
  });
  // Everything the agent is shown, kept so a test can search it for secrets.
  const seen: string[] = [];
  const tools: Harness = {
    ...connected,
    async call(name, args) {
      const result = await connected.call(name, args);
      seen.push(result.text, JSON.stringify(result.structured ?? null));
      return result;
    },
  };
  return { mock, relay: started.relay, tools, dir: started.dir, env, seen, started };
}

// What PayBox's request_wallet_sign does with the intent a tool hands over.
async function payboxSign(owner: HDAccount, intent: Obj): Promise<Hex> {
  if (intent["op"] === "raw") return owner.sign({ hash: intent["rawSigningPayloadHex"] as Hex });
  assert.equal(intent["op"], "typedData");
  const data = asObj(intent["typedData"]);
  return owner.signTypedData({ domain: data["domain"], types: data["types"], primaryType: data["primaryType"], message: data["message"] } as never);
}

const out = (result: CallResult): Obj => {
  assert.ok(result.structured !== undefined, `no structured content: ${result.text.slice(0, 600)}`);
  return result.structured;
};

describe("the whole tool set through the embedded relay", () => {
  harnessMock.it("deploy, connect, trade, cancel and revoke: every step goes through the in-process relay and lands on the local chain", async (mock) => {
    const w = await world(mock);
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const alice = chain.owner(3);

    // 0. The tool set is there, and the draft validator works with no relay at all.
    const names = (await w.tools.list()).map((tool) => String(tool["name"]));
    for (const name of ["xo_validate_market_draft", "xo_account", "xo_connect", "xo_deploy_enable_trading", "xo_revoke_trading", "xo_redeem", "xo_submit_userop", "xo_userop_status", "xo_prepare_order", "xo_submit_order", "xo_order_status", "xo_cancel_order", "xo_list_orders", "xo_fund_account", "xo_withdraw"]) {
      assert.ok(names.includes(name), `${name} is registered`);
    }

    // 1. xo_account before anything exists: undeployed, and the relay answers (no relay_not_configured).
    const before = out(await w.tools.call("xo_account", { owner: alice.address }));
    assert.equal(before["state"], "undeployed");
    assert.equal(asObj(before["relay"])["status"], "ok", JSON.stringify(before["relay"]));

    // 2. Deploy and enable trading: prepare, "PayBox" signs, submit, status.
    const prepared = await w.tools.call("xo_deploy_enable_trading", { step: "prepare", owner: alice.address });
    assert.equal(prepared.isError, false, prepared.text);
    assert.equal(out(prepared)["outcome"], "prepared", prepared.text);
    // R1: the real relay's decoded block rebuilds, here in the plugin, to its digest, tags and summary lines.
    assert.equal(asObj(out(prepared)["verification"])["status"], "verified", prepared.text);
    assert.match(String(out(prepared)["inner_hash_tag"]), /^[0-9a-f]{16}$/);
    const intent = asObj(out(prepared)["sign_with_paybox"]);
    const submitted = out(await w.tools.call("xo_submit_userop", { prepared_id: asObj(out(prepared)["prepared"])["prepared_id"], signature: await payboxSign(alice, intent) }));
    assert.equal(submitted["outcome"], "submitted", JSON.stringify(submitted));
    const hash = String(submitted["user_op_hash"]);
    const status = out(await w.tools.call("xo_userop_status", { user_op_hash: hash }));
    assert.equal(asObj(status["status"])["state"], "included");
    assert.equal(w.relay.owners().owners[0], alice.address.toLowerCase(), "the first wallet that signed is the one served");

    // 3. The account is registered and funded (the mock's registry and orderbook), then connect it.
    const trader = traderFor(mock, 3);
    mock.state.forceRegistered(trader.account);
    mock.state.setBalance(trader.account, { balanceMicro: 100_000_000n, allowanceMicro: 100_000_000n, cashBalanceMicro: 100_000_000n });
    const account = out(await w.tools.call("xo_account", { owner: alice.address }));
    assert.equal(account["state"], "registered");
    const connectPrepared = out(await w.tools.call("xo_connect", { step: "prepare", owner: alice.address }));
    assert.equal(connectPrepared["outcome"], "prepared", JSON.stringify(connectPrepared));
    assert.equal(asObj(connectPrepared["verification"])["status"], "verified", JSON.stringify(connectPrepared["verification"]));
    const connected = out(await w.tools.call("xo_connect", { step: "submit", prepared_id: asObj(connectPrepared["prepared"])["prepared_id"], signature: await payboxSign(alice, asObj(connectPrepared["sign_with_paybox"])) }));
    assert.equal(connected["outcome"], "connected", JSON.stringify(connected));
    assert.equal(asObj(connected["credentials"])["state"], "stored");

    // 4. An order: prepare, sign, submit, status, list, cancel.
    const tokens = marketTokens(mock, "clob-active-a");
    const order = await w.tools.call("xo_prepare_order", { owner: alice.address, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "10" });
    assert.equal(out(order)["outcome"], "prepared", order.text);
    assert.equal(asObj(out(order)["verification"])["status"], "verified", order.text);
    assert.equal(asObj(out(order)["prepared"])["decoded"] !== undefined, true, "the order's 13 signed fields come back with it");
    const placed = out(await w.tools.call("xo_submit_order", { prepared_id: asObj(out(order)["prepared"])["prepared_id"], signature: await payboxSign(alice, asObj(out(order)["sign_with_paybox"])) }));
    assert.ok(["accepted", "pending"].includes(String(placed["outcome"])), JSON.stringify(placed));
    const orderHash = String(placed["order_hash"]);
    assert.equal(mock.write.orders.size, 1, "exactly one order is on the mock's book");
    const shown = out(await w.tools.call("xo_order_status", { order_hash: orderHash }));
    assert.equal(asObj(shown["status"])["state"], "open");
    const listed = out(await w.tools.call("xo_list_orders", { owner: alice.address }));
    assert.equal((listed["orders"] as unknown[]).length, 1);
    const usage = await w.relay.services.ledger.usageDetail(deriveAccount(alice.address).toLowerCase());
    assert.ok(usage.spentAtomic > 0n && usage.spentAtomic <= 10_800_000n, "the order is reserved against the day cap");
    const cancelled = out(await w.tools.call("xo_cancel_order", { owner: alice.address, order_hash: orderHash }));
    assert.equal(cancelled["outcome"], "cancelled", JSON.stringify(cancelled));
    assert.equal(asObj(out(await w.tools.call("xo_order_status", { order_hash: orderHash }))["status"])["state"], "cancelled");

    // 5. Revoke trading: the on-chain emergency stop goes through the same relay.
    const revoke = out(await w.tools.call("xo_revoke_trading", { step: "prepare", owner: alice.address }));
    assert.equal(revoke["outcome"], "prepared", JSON.stringify(revoke));
    const revoked = out(await w.tools.call("xo_revoke_trading", { step: "submit", prepared_id: asObj(revoke["prepared"])["prepared_id"], signature: await payboxSign(alice, asObj(revoke["sign_with_paybox"])) }));
    assert.equal(revoked["outcome"], "submitted", JSON.stringify(revoked));

    // 5b. Redeem is refused for a market that has not resolved, with a coded reason, not an error.
    const redeem = await w.tools.call("xo_redeem", { step: "prepare", owner: alice.address, condition_ids: [tokens.conditionId] });
    assert.equal(out(redeem)["outcome"], "refused", redeem.text);
    assert.match(String(out(redeem)["code"]), /precondition_failed|capability_unknown|invalid_request/);

    // 6. Write paths that are off stay off, whatever the tool: funding and withdrawal refuse with flag_off.
    const fund = await w.tools.call("xo_fund_account", { owner: alice.address, amount_usd: "2" });
    assert.equal(out(fund)["outcome"], "refused", fund.text);
    const withdraw = await w.tools.call("xo_withdraw", { owner: alice.address, amount_usd: "1" });
    assert.equal(out(withdraw)["outcome"], "refused", withdraw.text);

    // 7. Nothing in anything the agent saw, or on disk in the logs, holds the master secret or the API credentials.
    assert.deepEqual(mock.internalErrors().map((error) => error.message), []);
  });

  harnessMock.it("nothing the agent saw and nothing on disk holds the master secret or the XO credentials in the clear", async (mock) => {
    const w = await world(mock);
    const trader = await setupTrader(mock, 5);
    const prepared = out(await w.tools.call("xo_connect", { step: "prepare", owner: trader.owner.address }));
    out(await w.tools.call("xo_connect", { step: "submit", prepared_id: asObj(prepared["prepared"])["prepared_id"], signature: await payboxSign(trader.owner, asObj(prepared["sign_with_paybox"])) }));
    const tokens = marketTokens(mock, "clob-active-a");
    const order = out(await w.tools.call("xo_prepare_order", { owner: trader.owner.address, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "5" }));
    out(await w.tools.call("xo_submit_order", { prepared_id: asObj(order["prepared"])["prepared_id"], signature: await payboxSign(trader.owner, asObj(order["sign_with_paybox"])) }));

    const stored = await w.relay.services.secrets?.get(trader.account.toLowerCase(), "xo_triplet");
    assert.ok(stored !== undefined, "the credential is in the vault");
    const triplet = JSON.parse(stored.reveal()) as Record<string, string>;
    const needles = [TEST_MASTER_SECRET, ...Object.values(triplet).filter((value) => typeof value === "string" && value.length >= 8)];
    assert.ok(needles.length >= 4, "the triplet has its three parts");

    for (const text of w.seen) for (const needle of needles) assert.ok(!text.includes(needle), "a tool answer contains a secret");
    const files: string[] = [];
    const walk = async (rel: string): Promise<void> => {
      for (const entry of await readdir(join(w.dir.dir, rel), { withFileTypes: true })) {
        const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
        if (entry.isDirectory()) await walk(path);
        else files.push(path);
      }
    };
    await walk("");
    assert.ok(files.length > 3);
    // The vault is sealed; every other file (journal, snapshot, logs, keyring) is plain text and must hold no secret.
    for (const file of files) {
      if (process.platform !== "win32") assert.equal((await stat(join(w.dir.dir, file))).mode & 0o777, 0o600, `${file} is not 0600`);
      const bytes = await readFile(join(w.dir.dir, file));
      for (const needle of needles) assert.ok(!bytes.includes(Buffer.from(needle)), `${file} holds a secret in the clear`);
    }
    // The mock saw the credentials (it is the server); the relay's own audit log did not log request headers.
    const audit = files.filter((file) => file.startsWith("logs/"));
    assert.ok(audit.length > 0);
  });

  harnessMock.it("two wallets in one data directory share nothing: credentials, ledger, caps, orders and prepared items stay apart", async (mock) => {
    const w = await world(mock, { env: { XO_ALLOW_ANY_OWNER: "1", XO_MAX_DAILY_USD: "5", XO_MAX_ORDER_USD: "5" } });
    const alice = await setupTrader(mock, 3);
    const bob = await setupTrader(mock, 4);
    const tokens = marketTokens(mock, "clob-active-a");
    const connectOwner = async (trader: typeof alice) => {
      const prepared = out(await w.tools.call("xo_connect", { step: "prepare", owner: trader.owner.address }));
      const done = out(await w.tools.call("xo_connect", { step: "submit", prepared_id: asObj(prepared["prepared"])["prepared_id"], signature: await payboxSign(trader.owner, asObj(prepared["sign_with_paybox"])) }));
      assert.equal(done["outcome"], "connected", JSON.stringify(done));
      return asObj(done["credentials"])["key_tag"];
    };
    const aliceTag = await connectOwner(alice);
    const bobTag = await connectOwner(bob);
    assert.notEqual(aliceTag, bobTag, "each wallet has its own XO credential");

    // Credentials: one sealed triplet per account, different contents, each opens only under its own account.
    const secrets = w.relay.services.secrets;
    assert.ok(secrets !== undefined);
    const a = (await secrets.get(alice.account.toLowerCase(), "xo_triplet"))?.reveal();
    const b = (await secrets.get(bob.account.toLowerCase(), "xo_triplet"))?.reveal();
    assert.ok(a !== undefined && b !== undefined && a !== b);
    assert.deepEqual(await secrets.names(alice.account.toLowerCase()), ["xo_triplet"]);
    assert.deepEqual(await secrets.names(bob.account.toLowerCase()), ["xo_triplet"]);

    // Orders: each places one; the day cap is $5 each, so a second order of $4.32 is over the cap for that wallet only.
    const place = async (trader: typeof alice, shares: string) => {
      const order = out(await w.tools.call("xo_prepare_order", { owner: trader.owner.address, token_id: tokens.yes, side: "BUY", price: "0.4", shares }));
      return order;
    };
    const aliceOrder = await place(alice, "10");
    assert.equal(aliceOrder["outcome"], "prepared", JSON.stringify(aliceOrder));
    const aliceSubmit = out(await w.tools.call("xo_submit_order", { prepared_id: asObj(aliceOrder["prepared"])["prepared_id"], signature: await payboxSign(alice.owner, asObj(aliceOrder["sign_with_paybox"])) }));
    assert.ok(["accepted", "pending"].includes(String(aliceSubmit["outcome"])), JSON.stringify(aliceSubmit));
    const aliceSecond = await place(alice, "10");
    assert.equal(aliceSecond["outcome"], "refused", "Alice is at her day cap");
    assert.equal(aliceSecond["code"], "cap_exceeded");
    const bobOrder = await place(bob, "10");
    assert.equal(bobOrder["outcome"], "prepared", `Bob has his own cap: ${JSON.stringify(bobOrder)}`);

    const ledger = w.relay.services.ledger;
    const aliceUsage = await ledger.usageDetail(alice.account.toLowerCase());
    const bobUsage = await ledger.usageDetail(bob.account.toLowerCase());
    assert.ok(aliceUsage.spentAtomic > 0n);
    assert.ok(bobUsage.spentAtomic > 0n, "Bob's prepared order is reserved against Bob");
    assert.equal(ledger.list({ account: alice.account.toLowerCase() }).length, 1, "Alice's reservations are hers alone");
    assert.equal(ledger.list({ account: bob.account.toLowerCase() }).length, 1);

    // Prepared items are bound to their owner: Alice's signature does not pass Bob's item, and nothing is sent.
    const posts = (): number => mock.requestsTo("orderbook").filter((entry) => entry.method === "POST" && entry.path === "/order").length;
    const postsBefore = posts();
    const crossed = out(await w.tools.call("xo_submit_order", { prepared_id: asObj(bobOrder["prepared"])["prepared_id"], signature: await payboxSign(alice.owner, asObj(bobOrder["sign_with_paybox"])) }));
    assert.notEqual(crossed["outcome"], "accepted");
    assert.equal(posts(), postsBefore, "a signature from the wrong wallet sent nothing");

    // Listing and cancelling are per wallet too.
    const bobList = out(await w.tools.call("xo_list_orders", { owner: bob.owner.address }));
    assert.equal((bobList["orders"] as unknown[]).length, 0, "Bob has no open order of his own");
    const aliceList = out(await w.tools.call("xo_list_orders", { owner: alice.owner.address }));
    assert.equal((aliceList["orders"] as unknown[]).length, 1);
    const aliceHash = String(aliceSubmit["order_hash"]);
    const stolen = out(await w.tools.call("xo_cancel_order", { owner: bob.owner.address, order_hash: aliceHash }));
    assert.notEqual(stolen["outcome"], "cancelled", "Bob cannot cancel Alice's order");
    assert.equal((out(await w.tools.call("xo_list_orders", { owner: alice.owner.address }))["orders"] as unknown[]).length, 1, "Alice's order is still open");
  });

  harnessMock.it("a restart in the middle of an order never sends it twice and never resets a cap", async (mock) => {
    // XO takes the order and the answer is lost on the way back: the outcome is unknown.
    let lost = false;
    const { fetch } = tappedFetch(mock, (call) => {
      if (!lost && call.host === "orderbooks.xo.market" && call.method === "POST" && call.path === "/order") {
        lost = true;
        return { action: "forward_then_fail" };
      }
      return { action: "forward" };
    });
    const first = await world(mock, { env: { XO_MAX_DAILY_USD: "5", XO_MAX_ORDER_USD: "5" }, fetch });
    const trader = await setupTrader(mock, 6);
    const tokens = marketTokens(mock, "clob-active-a");
    const connectPrepared = out(await first.tools.call("xo_connect", { step: "prepare", owner: trader.owner.address }));
    out(await first.tools.call("xo_connect", { step: "submit", prepared_id: asObj(connectPrepared["prepared"])["prepared_id"], signature: await payboxSign(trader.owner, asObj(connectPrepared["sign_with_paybox"])) }));

    const order = out(await first.tools.call("xo_prepare_order", { owner: trader.owner.address, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "10" }));
    const preparedId = String(asObj(order["prepared"])["prepared_id"]);
    const signature = await payboxSign(trader.owner, asObj(order["sign_with_paybox"]));
    const sent = out(await first.tools.call("xo_submit_order", { prepared_id: preparedId, signature }));
    assert.equal(sent["outcome"], "ambiguous", JSON.stringify(sent));
    const posts = (): number => mock.requestsTo("orderbook").filter((entry) => entry.method === "POST" && entry.path === "/order").length;
    assert.equal(posts(), 1);
    assert.equal(mock.write.orders.size, 1, "XO did take the order");
    const spent = (await first.relay.services.ledger.usageDetail(trader.account.toLowerCase())).spentAtomic;
    assert.ok(spent > 0n);

    // The process dies here. A new one opens the same data directory with the same key.
    useEmbeddedRelay(undefined);
    await first.tools.close();
    await first.relay.abandon();
    const second = await world(mock, { env: { XO_MAX_DAILY_USD: "5", XO_MAX_ORDER_USD: "5" }, dir: first.dir });
    const after = (await second.relay.services.ledger.usageDetail(trader.account.toLowerCase())).spentAtomic;
    assert.equal(after, spent, "the day's spend survived the restart");

    // Signing again and submitting the same item is refused and sends nothing.
    const again = out(await second.tools.call("xo_submit_order", { prepared_id: preparedId, signature }));
    assert.notEqual(again["outcome"], "accepted");
    assert.equal(posts(), 1, "no second POST after the restart");
    assert.equal(mock.write.orders.size, 1);
    // The held reservation still counts: another order of the same size is over the $5 day.
    const next = out(await second.tools.call("xo_prepare_order", { owner: trader.owner.address, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "10" }));
    assert.equal(next["outcome"], "refused", JSON.stringify(next));
    assert.equal(next["code"], "cap_exceeded");
    // The credential survived too: the order is found by its hash, and it is the one XO took.
    const line = ((asObj(asObj(order["prepared"])["summary"])["lines"] as string[]).find((entry) => entry.startsWith("Order id (hash) ")) ?? "").slice("Order id (hash) ".length).replace(/\.$/, "");
    assert.match(line, /^0x[0-9a-f]{64}$/);
    const status = out(await second.tools.call("xo_order_status", { order_hash: line }));
    assert.equal(status["outcome"], "status", JSON.stringify(status));
    assert.equal(asObj(status["status"])["state"], "open");
  });
});
