import { beforeEach, describe, expect, it } from "vitest";

import { isUntrusted } from "../../core/untrusted";
import { PROPOSAL_KEY } from "./funding";
import { prepareDeploy, prepareFunding, prepareOrder, prepareRedeem, prepareRevoke, type PrepareDeps } from "./prepare";
import { buildTicket } from "./ticket";
import { FUND_ANSWERS, FRESH_OWNER, OWNER, REDEEM_IDS, TOKENS, answer, copyOf, makeRig, prepareEnvelope, recordedAt, type TradeRig } from "./test-support";
import { readAccount, readOrders } from "./reads";

let rig: TradeRig;
let nowMs = 0;

async function deps(): Promise<PrepareDeps> {
  if (rig.services.session.token() === null) expect((await rig.services.session.pair()).ok).toBe(true);
  return { client: rig.services.client, nowMs: () => nowMs };
}

function serve(tool: string, structured: unknown): void {
  rig.daemon.tools.set(tool, () => prepareEnvelope(tool, structured));
}

beforeEach(() => {
  rig = makeRig();
});

const BUY = buildTicket({ tokenId: TOKENS.yes, side: "BUY", price: "0.4", shares: "10", tif: "GTD", ttlS: "", postOnly: false });
if (!BUY.ok) throw new Error("fixture ticket");

describe("one prepare call, from the button to a vetted result", () => {
  it("vets a recorded deploy and keeps the plugin's sentences as untrusted text", async () => {
    nowMs = recordedAt("prepare_deploy") + 2_000;
    serve("xo_deploy_enable_trading", answer("prepare_deploy"));
    const result = await prepareDeploy(await deps(), { owner: FRESH_OWNER, allowanceUsd: null, allowanceAtomic: null });
    if (result.kind !== "vetted") throw new Error(`expected vetted, got ${result.kind}`);
    expect(result.dryRun).toBe(false);
    expect(result.item.action).toBe("deploy_enable_trading");
    expect(isUntrusted(result.message)).toBe(true);
    expect(isUntrusted(result.nextAction)).toBe(true);
    expect(rig.daemon.toolCalls).toEqual(["xo_deploy_enable_trading"]);
  });

  it("asks the plugin for the prepare step, never any other", async () => {
    nowMs = recordedAt("prepare_revoke") + 2_000;
    const seen: Record<string, unknown>[] = [];
    rig.daemon.tools.set("xo_revoke_trading", (args) => {
      seen.push(args);
      return prepareEnvelope("xo_revoke_trading", answer("prepare_revoke"));
    });
    await prepareRevoke(await deps(), { owner: OWNER });
    expect(seen).toEqual([{ step: "prepare", owner: OWNER }]);
  });

  it("vets a recorded redeem against the conditions that were asked for", async () => {
    nowMs = recordedAt("prepare_redeem_three") + 2_000;
    serve("xo_redeem", answer("prepare_redeem_three"));
    const result = await prepareRedeem(await deps(), { owner: OWNER, conditionIds: REDEEM_IDS });
    expect(result.kind).toBe("vetted");
    const wrong = await prepareRedeem(await deps(), { owner: OWNER, conditionIds: REDEEM_IDS.slice(0, 1) });
    expect(wrong.kind).toBe("failed_vetting");
  });

  it("vets a recorded order against the ticket and shows a dry run as a dry run", async () => {
    nowMs = recordedAt("prepare_order_buy") + 2_000;
    serve("xo_prepare_order", answer("prepare_order_buy"));
    const order = await prepareOrder(await deps(), { owner: OWNER, ticket: BUY.ticket });
    if (order.kind !== "vetted") throw new Error(`expected vetted, got ${order.kind}`);
    expect(order.item.order?.side).toBe("BUY");
    nowMs = recordedAt("dry_run_revoke") + 2_000;
    serve("xo_revoke_trading", answer("dry_run_revoke"));
    const dry = await prepareRevoke(await deps(), { owner: OWNER });
    if (dry.kind !== "vetted") throw new Error(`expected vetted, got ${dry.kind}`);
    expect(dry.dryRun).toBe(true);
  });

  it("turns each recorded refusal into a refusal with the plugin's words in the untrusted slot", async () => {
    nowMs = recordedAt("refused_flag_off_order") + 2_000;
    for (const name of ["refused_flag_off_order", "refused_kill_switch_order", "refused_cap_exceeded"]) {
      serve("xo_prepare_order", answer(name));
      const result = await prepareOrder(await deps(), { owner: OWNER, ticket: BUY.ticket });
      if (result.kind !== "refused") throw new Error(`expected refused, got ${result.kind}`);
      expect(result.code).toBe(answer(name)["code"]);
    }
    serve("xo_prepare_order", answer("refused_flag_off_order"));
    const flag = await prepareOrder(await deps(), { owner: OWNER, ticket: BUY.ticket });
    expect(flag).toMatchObject({ kind: "refused", code: "flag_off", flag: "ENABLE_TRADING" });
  });

  it("refuses an item that was tampered with on the way, and shows nothing of it", async () => {
    nowMs = recordedAt("prepare_order_buy") + 2_000;
    const tampered = answer("prepare_order_buy");
    tampered["prepared"]["quote"]["max_outlay_usd"] = "4.3";
    serve("xo_prepare_order", tampered);
    const result = await prepareOrder(await deps(), { owner: OWNER, ticket: BUY.ticket });
    expect(result.kind).toBe("failed_vetting");
    expect(JSON.stringify(result)).not.toContain("4.3\"");
  });

  it("calls an answer it cannot read a schema violation", async () => {
    nowMs = recordedAt("prepare_revoke") + 2_000;
    for (const structured of [{ outcome: "prepared" }, { nonsense: true }, null, "text", { outcome: "prepared", code: "prepared", message: "m", next_action: "n", warnings: [], unproven_capabilities: [], prepared: 5 }]) {
      serve("xo_revoke_trading", structured);
      expect(await prepareRevoke(await deps(), { owner: OWNER }), JSON.stringify(structured)).toEqual({ kind: "schema_violation" });
    }
  });

  it("maps a daemon refusal to words and carries nothing the daemon said", async () => {
    rig.daemon.tools.delete("xo_revoke_trading");
    const result = await prepareRevoke(await deps(), { owner: OWNER });
    expect(result).toMatchObject({ kind: "daemon_error", code: "refused", bridgeCode: "scope_denied" });
  });
});

describe("funding", () => {
  it("vets a funding step", async () => {
    nowMs = FUND_ANSWERS["fund_approve"]!.recorded_at_ms + 1_000;
    serve("xo_fund_account", copyOf(FUND_ANSWERS["fund_approve"]!.structured));
    const result = await prepareFunding(await deps(), { owner: OWNER, amountText: "3" });
    expect(result.kind).toBe("funding");
  });

  it("rejects a funding step that moves the money anywhere but the derived account", async () => {
    nowMs = FUND_ANSWERS["fund_transfer"]!.recorded_at_ms + 1_000;
    const tampered = copyOf(FUND_ANSWERS["fund_transfer"]!.structured);
    const call = tampered[PROPOSAL_KEY].transaction;
    call.data = `${call.data.slice(0, 74)}${"0".repeat(24)}${"cd".repeat(20)}${call.data.slice(138)}`;
    serve("xo_fund_account", tampered);
    expect((await prepareFunding(await deps(), { owner: OWNER, amountText: "3" })).kind).toBe("funding_rejected");
  });

  it("reports the recorded refusals", async () => {
    for (const name of ["fund_refused_flag_off", "fund_refused_over_test_amount"]) {
      serve("xo_fund_account", copyOf(FUND_ANSWERS[name]!.structured));
      const result = await prepareFunding(await deps(), { owner: OWNER, amountText: "3" });
      expect(result).toMatchObject({ kind: "refused" });
    }
  });

  it("treats an answer with neither a proposal nor a refusal as a schema violation", async () => {
    serve("xo_fund_account", { outcome: "prepared" });
    expect(await prepareFunding(await deps(), { owner: OWNER, amountText: "3" })).toEqual({ kind: "schema_violation" });
  });
});

describe("the two reads", () => {
  it("reads the account and checks it is the account derived from the owner", async () => {
    rig.daemon.tools.set("xo_account", () => ({ ...prepareEnvelope("xo_account", answer("account_deployed")), tool_class: "read" }));
    nowMs = 5;
    const ok = await readAccount(await deps(), OWNER);
    if (!ok.ok) throw new Error(`expected ok, got ${ok.kind}`);
    expect(ok.data.state).toBe("registered");
    expect(ok.fetchedAtMs).toBe(5);

    const other = answer("account_deployed");
    other["account"] = "0x000000000000000000000000000000000000dEaD";
    rig.daemon.tools.set("xo_account", () => ({ ...prepareEnvelope("xo_account", other), tool_class: "read" }));
    expect(await readAccount(await deps(), OWNER)).toMatchObject({ ok: false, kind: "wrong_subject" });

    const stranger = answer("account_deployed");
    stranger["owner"] = FRESH_OWNER;
    rig.daemon.tools.set("xo_account", () => ({ ...prepareEnvelope("xo_account", stranger), tool_class: "read" }));
    expect(await readAccount(await deps(), OWNER)).toMatchObject({ ok: false, kind: "wrong_subject" });
  });

  it("reports a malformed account and a refusal without throwing", async () => {
    rig.daemon.tools.set("xo_account", () => ({ ...prepareEnvelope("xo_account", { state: "registered" }), tool_class: "read" }));
    expect(await readAccount(await deps(), OWNER)).toMatchObject({ ok: false, kind: "schema_violation" });
    rig.daemon.tools.set("xo_account", () => ({ ...prepareEnvelope("xo_account", answer("refused_flag_off_order")), tool_class: "read" }));
    expect(await readAccount(await deps(), OWNER)).toMatchObject({ ok: false, kind: "refused", code: "flag_off" });
  });

  it("reads open orders and never reports a failed read as an empty list", async () => {
    rig.daemon.tools.set("xo_list_orders", () => ({ ...prepareEnvelope("xo_list_orders", answer("list_orders_one")), tool_class: "read" }));
    const ok = await readOrders(await deps(), OWNER);
    if (!ok.ok) throw new Error("expected ok");
    expect(ok.data.orders).toHaveLength(1);
    rig.daemon.tools.set("xo_list_orders", () => ({ ...prepareEnvelope("xo_list_orders", { outcome: "listed" }), tool_class: "read" }));
    expect(await readOrders(await deps(), OWNER)).toMatchObject({ ok: false, kind: "schema_violation" });
  });
});
