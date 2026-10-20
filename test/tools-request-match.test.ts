import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { registerTradeTools } from "../src/tools/trade.js";
import { registerUseropTools } from "../src/tools/userop.js";
import { handleWithdraw } from "../src/tools/fund.js";
import { enableTradingCalls, redeemCalls, revokeTradingCalls, withdrawCalls, usdceApproveCall, ctfSetApprovalForAllCall } from "./fixtures/userop/api.js";
import { CTF_EXCHANGE } from "../src/xo/chain/constants.js";
import { makeWorld, T0 } from "./funding-helpers.js";
import {
  OWNER,
  StubRelay,
  closeAll,
  connect,
  makeDeps,
  must,
  statusResponse,
  validateAgainstTool,
  type Obj,
} from "./tools-helpers.js";
import { REAL_NO_TOKEN, REAL_YES_TOKEN, verifiedDeployItem, verifiedOrderItem, verifiedUseropItem } from "./tools-decoded-helpers.js";

// SC-1: a prepared item can be internally consistent (its digest, tags and summary lines all rebuild from its
// own decoded block) and still not be what was asked for. The tools compare the verified block with the request.

afterEach(closeAll);

const COND_A = `0x${"aa".repeat(32)}`;
const COND_B = `0x${"bb".repeat(32)}`;

// ---- orders ----------------------------------------------------------------------------------------------------

async function orderRig(item: Obj) {
  const built = makeDeps({ relay: new StubRelay().on("POST /v1/order/prepare", item) });
  const harness = await connect((server) => registerTradeTools(server, built.deps));
  return { harness, relay: built.relay };
}

const ask = (over: Obj = {}): Obj => ({ owner: OWNER, token_id: REAL_YES_TOKEN, side: "BUY", price: "0.5", shares: "10", ...over });

async function refusedAs(item: Obj, args: Obj, expectedCode = "prepared_mismatch"): Promise<string> {
  const { harness } = await orderRig(item);
  const result = await harness.call("xo_prepare_order", args);
  assert.equal(result.isError, true, result.text);
  const out = must(result.structured);
  assert.equal(out["code"], expectedCode, result.text);
  assert.equal(out["sign_with_paybox"], undefined, "no signing intent is handed out");
  assert.equal(out["outcome"], "refused");
  assert.equal(await validateAgainstTool(harness, "xo_prepare_order", result.structured), undefined);
  return result.text;
}

describe("xo_prepare_order compares the verified order with the request (SC-1)", () => {
  it("accepts a verified order that is exactly what was asked, and names the signed values in the headline", async () => {
    const { harness } = await orderRig(verifiedOrderItem());
    const result = await harness.call("xo_prepare_order", ask());
    assert.equal(result.isError, false, result.text);
    const out = must(result.structured);
    assert.equal(out["outcome"], "prepared");
    assert.equal(must(out["prepared"] as Obj)["kind"], "order");
    assert.match(String(out["headline"] ?? result.text), new RegExp(`Order to BUY 10 shares of token ${REAL_YES_TOKEN} at 0.5`));
  });

  it("refuses a verified BUY when a SELL was asked for", async () => {
    const text = await refusedAs(verifiedOrderItem({ side: "BUY", price: "0.5", shares: "10" }), ask({ side: "SELL" }));
    assert.match(text, /BUY, not the SELL asked for/);
  });

  it("refuses a verified SELL when a BUY was asked for", async () => {
    await refusedAs(verifiedOrderItem({ side: "SELL" }), ask({ side: "BUY" }));
  });

  it("refuses an order on another token, even one of the same market", async () => {
    const text = await refusedAs(verifiedOrderItem({ tokenId: REAL_NO_TOKEN }), ask({ token_id: REAL_YES_TOKEN }));
    assert.match(text, /not the token/);
  });

  it("refuses an order on a token that is not the one asked for when the request names a made-up token", async () => {
    await refusedAs(verifiedOrderItem({ tokenId: REAL_YES_TOKEN }), ask({ token_id: "12345678901234567890" }));
  });

  it("refuses a different time in force and a different post-only flag", async () => {
    await refusedAs(verifiedOrderItem({ tif: "GTD" }), ask({ tif: "FOK" }));
    await refusedAs(verifiedOrderItem({ tif: "FOK" }), ask({}));
    await refusedAs(verifiedOrderItem({ postOnly: true }), ask({}));
    await refusedAs(verifiedOrderItem({ postOnly: false }), ask({ post_only: true }));
  });

  it("refuses a lifetime other than the one asked for, and one over the limit when none was asked for", async () => {
    await refusedAs(verifiedOrderItem({ ttlS: 300 }), ask({ ttl_s: 120 }));
    await refusedAs(verifiedOrderItem({ ttlS: 900 }), ask({}));
    const { harness } = await orderRig(verifiedOrderItem({ ttlS: 120 }));
    assert.equal((await harness.call("xo_prepare_order", ask({ ttl_s: 120 }))).isError, false);
  });

  it("holds the signed expiry, not only the lifetime in the unsigned params, to the limit", async () => {
    // The params say 300 seconds; the order that would be signed lives a day.
    const text = await refusedAs(verifiedOrderItem({ ttlS: 300, expiresInS: 86_400 }), ask({}));
    assert.match(text, /signed expiry/);
    // Within the clock-skew slack it passes.
    const { harness } = await orderRig(verifiedOrderItem({ ttlS: 300, expiresInS: 300 + 120 }));
    assert.equal((await harness.call("xo_prepare_order", ask({}))).isError, false);
  });

  it("does not remember a refused item for the submit confirmation", async () => {
    // A prepared_id no other test uses: the memory is shared by every rig in the process.
    const id = "5e".repeat(16);
    const built = makeDeps({ relay: new StubRelay().on("POST /v1/order/prepare", verifiedOrderItem({ side: "SELL", preparedId: id })) });
    const harness = await connect((server) => registerTradeTools(server, built.deps));
    await harness.call("xo_prepare_order", ask({ side: "BUY" }));
    const { preparedMemoryOf } = await import("../src/tools/relay-tool-kit.js");
    assert.equal(preparedMemoryOf(built.deps).recall(id, Date.parse("2026-10-19T12:00:00Z")), undefined);
  });
});

// ---- user operations -------------------------------------------------------------------------------------------

async function useropRig(item: Obj, state: "undeployed" | "registered") {
  const relay = new StubRelay().on("POST /v1/account/status", statusResponse({ state })).on("POST /v1/userop/prepare", item);
  const built = makeDeps({ relay });
  const harness = await connect((server) => registerUseropTools(server, built.deps));
  return { harness, relay };
}

async function useropRefused(tool: string, args: Obj, item: Obj, state: "undeployed" | "registered"): Promise<string> {
  const { harness } = await useropRig(item, state);
  const result = await harness.call(tool, { step: "prepare", owner: OWNER, ...args });
  assert.equal(result.isError, true, result.text);
  const out = must(result.structured);
  assert.equal(out["code"], "prepared_mismatch", result.text);
  assert.equal(out["sign_with_paybox"], undefined);
  assert.equal(out["action"], undefined);
  assert.equal(await validateAgainstTool(harness, tool, result.structured), undefined);
  return result.text;
}

const withdrawItem = () => verifiedUseropItem({ action: "withdraw", deployed: true, sponsor: false, calls: withdrawCalls({ owner: OWNER, amountAtomic: 1_000_000n }) });
const redeemItem = (ids: string[]) => verifiedUseropItem({ action: "redeem", deployed: true, calls: redeemCalls(ids as `0x${string}`[]) });

describe("the user-operation tools compare the verified operation with the request (SC-1)", () => {
  it("refuses a verified withdrawal returned for xo_redeem, and never calls it a redeem", async () => {
    const text = await useropRefused("xo_redeem", { condition_ids: [COND_A] }, withdrawItem(), "registered");
    assert.match(text, /is withdraw, not the redeem asked for/);
    assert.doesNotMatch(text, /redeems resolved positions/);
  });

  it("accepts a redeem of exactly the asked-for markets, in any case and with duplicates", async () => {
    const { harness } = await useropRig(redeemItem([COND_A, COND_B]), "registered");
    const result = await harness.call("xo_redeem", { step: "prepare", owner: OWNER, condition_ids: [COND_B.toUpperCase().replace("0X", "0x"), COND_A, COND_A] });
    assert.equal(result.isError, false, result.text);
    assert.equal(must(result.structured)["action"], "redeem");
  });

  it("refuses a redeem of other markets, of a superset, and of a subset", async () => {
    await useropRefused("xo_redeem", { condition_ids: [COND_A] }, redeemItem([COND_B]), "registered");
    await useropRefused("xo_redeem", { condition_ids: [COND_A] }, redeemItem([COND_A, COND_B]), "registered");
    await useropRefused("xo_redeem", { condition_ids: [COND_A, COND_B] }, redeemItem([COND_A]), "registered");
  });

  it("refuses an unlimited enable-trading item when a capped allowance was asked for", async () => {
    const text = await useropRefused("xo_deploy_enable_trading", { allowance_usd: "5" }, verifiedDeployItem(), "undeployed");
    assert.match(text, /not the 5 USDC.e asked for/);
  });

  it("refuses a different capped allowance, and a cap when the unlimited one was asked for", async () => {
    const capped = (usd: bigint) => verifiedUseropItem({ action: "enable_trading", deployed: true, calls: [usdceApproveCall(CTF_EXCHANGE, usd), ctfSetApprovalForAllCall(true)] });
    await useropRefused("xo_deploy_enable_trading", { allowance_usd: "5" }, capped(50_000_000n), "registered");
    await useropRefused("xo_deploy_enable_trading", {}, capped(5_000_000n), "registered");
    // Exactly the allowance asked for is accepted.
    const { harness } = await useropRig(capped(5_000_000n), "registered");
    const ok = await harness.call("xo_deploy_enable_trading", { step: "prepare", owner: OWNER, allowance_usd: "5" });
    assert.equal(ok.isError, false, ok.text);
    assert.equal(must(ok.structured)["action"], "enable_trading");
  });

  it("accepts the unlimited approval when none was capped", async () => {
    const { harness } = await useropRig(verifiedDeployItem(), "undeployed");
    const result = await harness.call("xo_deploy_enable_trading", { step: "prepare", owner: OWNER });
    assert.equal(result.isError, false, result.text);
    assert.equal(must(result.structured)["action"], "deploy_enable_trading");
  });

  it("refuses another action than the one the plugin chose for the account state", async () => {
    const enable = verifiedUseropItem({ action: "enable_trading", deployed: true, calls: enableTradingCalls() });
    await useropRefused("xo_deploy_enable_trading", {}, enable, "undeployed");
    await useropRefused("xo_revoke_trading", {}, enable, "registered");
    const revoke = verifiedUseropItem({ action: "revoke_trading", deployed: true, calls: revokeTradingCalls() });
    await useropRefused("xo_deploy_enable_trading", {}, revoke, "registered");
  });

  it("accepts a revoke that is a revoke", async () => {
    const { harness } = await useropRig(verifiedUseropItem({ action: "revoke_trading", deployed: true, calls: revokeTradingCalls() }), "registered");
    const result = await harness.call("xo_revoke_trading", { step: "prepare", owner: OWNER });
    assert.equal(result.isError, false, result.text);
    assert.equal(must(result.structured)["action"], "revoke_trading");
  });
});

// ---- the withdrawal ----------------------------------------------------------------------------------------------

describe("xo_withdraw compares the verified withdrawal with the request (SC-1)", () => {
  async function withItem(item: Obj) {
    const world = await makeWorld({ env: { ENABLE_WITHDRAW: "1" } });
    world.relay.handlers.set("/v1/userop/prepare", () => ({ ok: true, status: 200, data: item as never }));
    return handleWithdraw({ owner: OWNER, amount_usd: "1" }, world.deps);
  }
  const item = (over: { amountAtomic?: bigint; action?: "withdraw" } = {}) =>
    verifiedUseropItem({ action: "withdraw", deployed: true, sponsor: false, nowMs: T0, calls: withdrawCalls({ owner: OWNER, amountAtomic: over.amountAtomic ?? 1_000_000n }) });

  it("accepts the withdrawal that was asked for", async () => {
    const result = await withItem(item());
    assert.equal(result.isError, undefined, JSON.stringify(result.content));
    assert.equal((result.structuredContent as Obj)["outcome"], "prepared");
  });

  it("refuses a verified withdrawal of another amount", async () => {
    const result = await withItem(item({ amountAtomic: 1_000_000_000n }));
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent as Obj)["code"], "prepared_mismatch");
  });

  it("refuses a verified operation of another action", async () => {
    const result = await withItem(verifiedUseropItem({ action: "revoke_trading", deployed: true, nowMs: T0, calls: revokeTradingCalls() }));
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent as Obj)["code"], "prepared_mismatch");
  });
});

