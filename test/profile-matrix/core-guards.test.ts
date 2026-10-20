import assert from "node:assert/strict";
import { describe } from "node:test";

import { ORDER_CAP_ATOMIC } from "./helpers.js";
import {
  JOURNEY_FLAGS,
  applyProfile,
  assertNoViolations,
  checkInvariants,
  creditBalance,
  embeddedTransport,
  ensureDeployedLikeXoApp,
  flowAccount,
  flowConnect,
  flowDeploy,
  flowFund,
  flowOrder,
  flowRedeem,
  flowWithdraw,
  httpTransport,
  identityOf,
  intentOf,
  preparedIdOf,
  signAndSubmitUserop,
  signIntent,
  startStack,
  writableOf,
  type Flow,
  type Json,
  type Stack,
  type Step,
  type Transport,
} from "./helpers.js";
import type { WriteFlagName } from "../../src/relay/flags.js";
import { useMock } from "../mock-xo/testing.js";
import { marketTokens } from "../mock-xo/traders.js";

// The guardrails, across every flow and through both transports, in the optimistic world (so a refusal here is the
// guardrail's doing and not XO's): every write refuses with its flag off at either end or with the kill switch on, the
// caps hold, nothing is sent twice or without a signature from the owner, and every refusal says what stopped it.

const transports: readonly Transport[] = [httpTransport, embeddedTransport];
const usd = (atomic: bigint): string => (Number(atomic) / 1_000_000).toString();

// What a gate does to one step: killed -> kill_switch; flag off -> flag_off naming the flag (or, for a prepare that
// can only be a dry run, a dry run that hands out no signing intent); on -> neither.
function expectGate(step: Step | undefined, label: string, gate: { readonly killed: boolean; readonly off: boolean; readonly flag: WriteFlagName; readonly dryRunOk?: boolean }): void {
  assert.ok(step !== undefined, `${label}: the step did not run`);
  if (gate.killed) {
    assert.equal(step.isError, true, `${label}: refused under the kill switch`);
    assert.equal(step.code, "kill_switch", `${label}: ${step.text.slice(0, 200)}`);
    assert.equal(intentOf(step), undefined, `${label}: no signing intent under the kill switch`);
  } else if (gate.off) {
    const dryRun = step.code === "dry_run";
    if (gate.dryRunOk === true && dryRun) {
      assert.equal(intentOf(step), undefined, `${label}: a dry run hands out no signing intent`);
    } else {
      assert.equal(step.isError, true, `${label}: refused with ${gate.flag} off (${step.text.slice(0, 160)})`);
      assert.equal(step.code, "flag_off", `${label}: ${step.text.slice(0, 200)}`);
      assert.ok(step.text.includes(gate.flag) || step.structured?.["flag"] === gate.flag, `${label}: the refusal names ${gate.flag}`);
    }
  } else {
    assert.notEqual(step.code, "flag_off", `${label}: ${step.text.slice(0, 200)}`);
    assert.notEqual(step.code, "kill_switch", `${label}: ${step.text.slice(0, 200)}`);
  }
}

interface Cell {
  readonly name: string;
  readonly relayOn: readonly WriteFlagName[];
  readonly pluginOn: readonly WriteFlagName[];
  readonly relayKill: boolean;
  readonly pluginKill: boolean;
  // Environment applied after the flag variables (an alias, a garbage value).
  readonly relayEnv?: Record<string, string>;
  readonly pluginEnv?: Record<string, string>;
  // What the gates should look like when the environment, not the cell's lists, decides it.
  readonly effective?: { readonly relayKilled: boolean; readonly pluginKilled: boolean; readonly relayOff: readonly WriteFlagName[]; readonly pluginOff: readonly WriteFlagName[] };
}

function cells(): Cell[] {
  const all = JOURNEY_FLAGS;
  const base = { relayOn: all, pluginOn: all, relayKill: false, pluginKill: false };
  const out: Cell[] = [
    { ...base, name: "every flag off at the relay", relayOn: [] },
    { ...base, name: "every flag off at the plugin", pluginOn: [] },
    { ...base, name: "kill switch at the relay", relayKill: true },
    { ...base, name: "kill switch at the plugin", pluginKill: true },
  ];
  for (const flag of all) out.push({ ...base, name: `only ${flag} off at the relay`, relayOn: all.filter((entry) => entry !== flag) });
  for (const flag of all) out.push({ ...base, name: `only ${flag} off at the plugin`, pluginOn: all.filter((entry) => entry !== flag) });
  // The alias variable stops both ends, and a value nobody can read is OFF for a flag and ON for the kill switch.
  out.push({ ...base, name: "XO_KILL_SWITCH=1 at the relay", relayEnv: { XO_KILL_SWITCH: "1" }, effective: { relayKilled: true, pluginKilled: false, relayOff: [], pluginOff: [] } });
  out.push({ ...base, name: "XO_KILL_SWITCH=1 at the plugin", pluginEnv: { XO_KILL_SWITCH: "1" }, effective: { relayKilled: false, pluginKilled: true, relayOff: [], pluginOff: [] } });
  out.push({ ...base, name: "KILL=banana at the relay (unreadable means on)", relayEnv: { KILL: "banana" }, effective: { relayKilled: true, pluginKilled: false, relayOff: [], pluginOff: [] } });
  out.push({ ...base, name: "ENABLE_TRADING=banana at the relay (unreadable means off)", relayEnv: { ENABLE_TRADING: "banana" }, effective: { relayKilled: false, pluginKilled: false, relayOff: ["ENABLE_TRADING"], pluginOff: [] } });
  out.push({ ...base, name: "ENABLE_FUNDING=banana at the plugin (unreadable means off)", pluginEnv: { ENABLE_FUNDING: "banana" }, effective: { relayKilled: false, pluginKilled: false, relayOff: [], pluginOff: ["ENABLE_FUNDING"] } });
  return out;
}

for (const transport of transports) {
  describe(`guards over ${transport.name}`, () => {
    const harness = useMock({ chains: { xo: true, base: true } });

    for (const cell of cells()) {
      harness.it(`no write succeeds with its flag off: ${cell.name}`, async (mock) => {
        applyProfile(mock, { name: "optimistic", base: "optimistic" });
        const stack = await startStack({ mock, transport, relayOn: cell.relayOn, pluginOn: cell.pluginOn, relayKill: cell.relayKill, pluginKill: cell.pluginKill, ...(cell.relayEnv === undefined ? {} : { relayEnv: cell.relayEnv }), ...(cell.pluginEnv === undefined ? {} : { pluginEnv: cell.pluginEnv }) });
        const who = identityOf(mock, 0);
        const effective = cell.effective;
        const killed = effective === undefined ? cell.relayKill || cell.pluginKill : effective.relayKilled || effective.pluginKilled;
        const offAt = (flag: WriteFlagName): boolean =>
          effective === undefined ? !cell.relayOn.includes(flag) || !cell.pluginOn.includes(flag) : effective.relayOff.includes(flag) || effective.pluginOff.includes(flag);
        const writable = effective === undefined ? writableOf(stack) : { userop: !killed && !offAt("ENABLE_USEROP_SUBMIT"), trading: !killed && !offAt("ENABLE_TRADING"), funding: !killed && !offAt("ENABLE_FUNDING"), withdraw: !killed && !offAt("ENABLE_WITHDRAW") };

        const deploy = await flowDeploy(stack, who);
        await ensureDeployedLikeXoApp(stack, who);
        const connect = await flowConnect(stack, who);
        const fund = await flowFund(stack, who);
        creditBalance(mock, who.account, 100_000_000n);
        const order = await flowOrder(stack, who);
        const redeem = await flowRedeem(stack, who, `guard-${cell.name}`);
        const withdraw = await flowWithdraw(stack, who);

        expectGate(deploy["prepare"], "deploy prepare", { killed, off: offAt("ENABLE_USEROP_SUBMIT"), flag: "ENABLE_USEROP_SUBMIT", dryRunOk: true });
        expectGate(connect["prepare"], "connect prepare", { killed, off: offAt("ENABLE_TRADING"), flag: "ENABLE_TRADING" });
        expectGate(fund["first"], "fund", { killed, off: offAt("ENABLE_FUNDING"), flag: "ENABLE_FUNDING" });
        expectGate(order["prepare"], "order prepare", { killed, off: offAt("ENABLE_TRADING"), flag: "ENABLE_TRADING" });
        expectGate(redeem["prepare"], "redeem prepare", { killed, off: offAt("ENABLE_USEROP_SUBMIT"), flag: "ENABLE_USEROP_SUBMIT", dryRunOk: true });
        expectGate(withdraw["prepare"], "withdraw prepare", { killed, off: offAt("ENABLE_WITHDRAW"), flag: "ENABLE_WITHDRAW" });

        // Reads are never gated.
        const read = await stack.call("xo_account", { owner: who.owner });
        assert.equal(read.isError, false, "xo_account still answers");

        // The invariant I6 is the point: not one upstream write, no matter which step was refused for which reason.
        assertNoViolations(await checkInvariants(stack, { writable }), cell.name);
        if (!writable.userop) assert.equal(stack.history.wire.count((call) => call.kind === "bundler_send"), 0);
        if (!writable.trading) assert.equal(stack.history.wire.count((call) => call.kind === "order_post" || call.kind === "api_key_create"), 0);
        assert.equal(mock.write.orders.size === 0 || writable.trading, true, "an order rests on the book although trading is off");
      });
    }

    harness.it("the kill switch engaged while items are prepared stops every submit, and reads keep working", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const who = identityOf(mock, 0);
      await ensureDeployedLikeXoApp(stack, who);
      creditBalance(mock, who.account, 100_000_000n);
      const connected = await flowConnect(stack, who);
      assert.equal(connected["submit"]?.code, "connected");
      const redeemId = (await import("./helpers.js")).conditionId("kill-redeem");
      await (await import("./helpers.js")).resolveOnChain(mock, redeemId);
      const redeem = await stack.call("xo_redeem", { step: "prepare", owner: who.owner, condition_ids: [redeemId] });
      const tokens = marketTokens(mock, "clob-active-a");
      const order = await stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "10" });
      const { mintUsdce } = await import("../relay-userops-helpers.js");
      await mintUsdce(mock, who.account, 5_000_000n);
      const withdraw = await stack.call("xo_withdraw", { owner: who.owner, amount_usd: "1" });
      for (const step of [redeem, order, withdraw]) assert.ok(intentOf(step) !== undefined || step.structured?.["request_wallet_sign_intent"] !== undefined, `${step.tool} was prepared before the kill: ${JSON.stringify(Object.keys(step.structured ?? {}))}`);

      const wireBefore = stack.history.wire.calls.length;
      const stepsBefore = stack.history.steps.length;
      await stack.relay.services.flagGate.engageKill("operator pressed the kill switch (test)");

      const sends: Step[] = [
        await signAndSubmitUserop(stack, "xo_redeem", who, redeem),
        await stack.call("xo_submit_userop", { prepared_id: String(withdraw.structured?.["prepared_id"]), signature: await signIntent(who.key, withdraw.structured?.["request_wallet_sign_intent"] as never) }),
        await stack.call("xo_submit_order", { prepared_id: preparedIdOf(order), signature: await signIntent(who.key, intentOf(order)!) }),
      ];
      for (const step of sends) {
        assert.equal(step.isError, true, `${step.tool}: ${step.text.slice(0, 160)}`);
        assert.equal(step.code, "kill_switch", `${step.tool} must name the kill switch: ${step.text.slice(0, 200)}`);
      }
      assert.equal(stack.history.wire.calls.slice(wireBefore).filter((call) => call.kind !== "other").length, 0, "nothing was sent upstream after the kill");
      // New prepares are refused too, and reads still work.
      const again = await stack.call("xo_prepare_order", { owner: who.owner, token_id: tokens.yes, side: "BUY", price: "0.4", shares: "10" });
      assert.equal(again.code, "kill_switch");
      const readAccount = await stack.call("xo_account", { owner: who.owner });
      assert.equal(readAccount.isError, false, readAccount.text.slice(0, 300));
      const readOrders = await stack.call("xo_list_orders", { owner: who.owner });
      assert.equal(readOrders.isError, false, `${readOrders.code}: ${readOrders.text.slice(0, 300)}`);
      assertNoViolations(await checkInvariants(stack, { writable: { userop: false, trading: false, funding: false, withdraw: false }, gatesFrom: { wireSeq: wireBefore, step: stepsBefore } }), "after the kill switch");
    });
  });
}
