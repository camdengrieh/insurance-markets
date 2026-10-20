import { afterEach, describe, expect, it } from "vitest";

import { NO_FACTS } from "../../../core/capabilities";
import { isUntrusted } from "../../../core/untrusted";
import { routeLine, type PrepareCommand } from "./grammar";
import { runPrepare, RUN_REFUSALS, RUN_REFUSAL_TEXT, type RunOutcome } from "./run";
import {
  ALLOWED_TOOLS,
  FRESH_OWNER,
  FUND_ANSWERS,
  OWNER,
  REDEEM_IDS,
  TOKENS,
  answer,
  copyOf,
  factsWith,
  installPrepareReads,
  makePrepareRig,
  marketFor,
  pairRig,
  serve,
  toolEnvelope,
  type PrepareRig,
} from "./test-support";
import type { LineOrigin, Retyped } from "./taint";

const MARKET = TOKENS.condition_id;
const ORDER = `order buy ${MARKET} yes 10 0.4`;

const seenTools: string[] = [];
let rig: PrepareRig;

afterEach(() => {
  // Whatever happened in a test, the daemon was only ever asked for tools on the closed list.
  for (const tool of rig.daemon.toolCalls) expect(ALLOWED_TOOLS, tool).toContain(tool);
  seenTools.push(...rig.daemon.toolCalls);
});

function command(line: string): PrepareCommand {
  const result = routeLine(line);
  if (!result.ok || result.route !== "prepare") throw new Error(`not a prepare command: ${line}`);
  return result.command;
}

async function run(line: string, origin: LineOrigin = "typed", retyped: Retyped = {}): Promise<RunOutcome> {
  await pairRig(rig);
  rig.daemon.toolCalls.length = 0;
  return runPrepare({ command: command(line), origin, retyped }, rig.deps);
}

function expectPrepared(outcome: RunOutcome): Extract<RunOutcome, { kind: "prepared" }> {
  if (outcome.kind !== "prepared") throw new Error(`expected prepared, got ${outcome.kind}${outcome.kind === "refused_here" ? ` (${outcome.code})` : ""}`);
  return outcome;
}

describe("an order", () => {
  it("reads the account and the market, then prepares, vets and offers the Signature Card", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig);
    serve(rig, "xo_prepare_order", answer("prepare_order_buy"));
    const outcome = expectPrepared(await run(ORDER));
    expect(rig.daemon.toolCalls).toEqual(["xo_account", "xo_get_market", "xo_prepare_order"]);
    expect(outcome.result.kind).toBe("vetted");
    expect(outcome.openCard).toEqual({ preparedId: expect.stringMatching(/^[0-9a-f]{32}$/) });
    // The page computed the quote before asking, with its own integer arithmetic.
    expect(outcome.quote).toMatchObject({ price: "0.4", shares: "10", feeBoundBps: 1000, maxOutlayUsd: "4.4" });
    expect(outcome.ticket?.tokenId).toBe(TOKENS.yes);
  });

  it("takes the token from the market the person named, never from the typed text", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig);
    const asked: Record<string, unknown>[] = [];
    rig.daemon.tools.set("xo_prepare_order", (args) => {
      asked.push(args);
      return { ...toolEnvelope("xo_prepare_order", answer("prepare_order_sell")), tool_class: "prepare" };
    });
    await run(`order sell ${MARKET} yes 5 0.62`);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ token_id: TOKENS.yes, side: "SELL", price: "0.62", shares: "5", owner: OWNER });
    asked.length = 0;
    await run(`order sell ${MARKET} no 5 0.62`);
    expect(asked[0]).toMatchObject({ token_id: TOKENS.no });
  });

  it("shows a relay refusal as a refusal with the plugin's words kept in the untrusted slot", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig);
    serve(rig, "xo_prepare_order", answer("refused_cap_exceeded"));
    const outcome = expectPrepared(await run(ORDER));
    expect(outcome.result).toMatchObject({ kind: "refused", code: "cap_exceeded" });
    if (outcome.result.kind === "refused") expect(isUntrusted(outcome.result.message)).toBe(true);
    expect(outcome.openCard).toBeNull();
  });

  it("refuses an item the relay tampered with and offers no card", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig);
    const tampered = answer("prepare_order_buy");
    tampered["prepared"]["quote"]["max_outlay_usd"] = "4.3";
    serve(rig, "xo_prepare_order", tampered);
    const outcome = expectPrepared(await run(ORDER));
    expect(outcome.result.kind).toBe("failed_vetting");
    expect(outcome.openCard).toBeNull();
  });

  it("refuses an order over the per-order cap before preparing anything", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig);
    const outcome = await run(`order buy ${MARKET} yes 100 0.4`);
    expect(outcome).toMatchObject({ kind: "refused_here", code: "over_cap" });
    expect(rig.daemon.toolCalls).toEqual(["xo_account", "xo_get_market"]);
  });

  it("refuses an invalid order with the ticket's own fixed words", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig);
    const outcome = await run(`order buy ${MARKET} yes 0.5 0.4`);
    expect(outcome).toMatchObject({ kind: "refused_here", code: "ticket_invalid" });
    if (outcome.kind === "refused_here") expect(outcome.issues?.length).toBeGreaterThan(0);
    expect(rig.daemon.toolCalls).not.toContain("xo_prepare_order");
  });

  it("refuses a market that does not read as open, or that the daemon answered for another market", async () => {
    rig = makePrepareRig();
    for (const verdict of ["not_open", "unknown"] as const) {
      installPrepareReads(rig, { verdict });
      expect(await run(ORDER)).toMatchObject({ kind: "refused_here", code: "market_not_open" });
    }
    installPrepareReads(rig);
    rig.daemon.tools.set("xo_get_market", () => toolEnvelope("xo_get_market", marketFor("open_with_book", `0x${"11".repeat(32)}`)));
    expect(await run(ORDER)).toMatchObject({ kind: "refused_here", code: "market_unreadable" });
    rig.daemon.tools.set("xo_get_market", () => toolEnvelope("xo_get_market", { nonsense: true }));
    expect(await run(ORDER)).toMatchObject({ kind: "refused_here", code: "market_unreadable" });
    expect(rig.daemon.toolCalls).not.toContain("xo_prepare_order");
  });
});

describe("the gate speaks before anything is prepared", () => {
  it("says the daemon is read-only when every switch is off, and prepares nothing", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig, { account: "account_flags_off", on: [] });
    for (const line of [ORDER, "fund 3", `redeem ${REDEEM_IDS[0]}`, "deploy unlimited", "revoke"]) {
      const outcome = await run(line);
      if (outcome.kind === "prepared") {
        // revoke and deploy are dry runs when only their switch is off; with every switch off they still must not offer a card.
        expect(outcome.openCard, line).toBeNull();
      } else {
        expect(outcome.kind, line).toBe("gated");
        if (outcome.kind === "gated") expect(outcome.readOnly, line).toBe(true);
      }
      expect(rig.daemon.toolCalls, line).not.toContain("xo_submit_order");
    }
    const order = await run(ORDER);
    expect(order).toMatchObject({ kind: "gated", action: "order", readOnly: true });
    if (order.kind === "gated") expect(order.reasons.map((reason) => reason.code)).toContain("flag_off");
    expect(rig.daemon.toolCalls).toEqual(["xo_account"]);
    const fund = await run("fund 3");
    expect(fund).toMatchObject({ kind: "gated", action: "fund", readOnly: true });
    expect(rig.daemon.toolCalls).toEqual(["xo_account"]);
  });

  it("names the kill switch and prepares nothing", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig, { extra: { kill_switch: true } });
    const outcome = await run(ORDER);
    expect(outcome).toMatchObject({ kind: "gated", action: "order", kill: true });
    if (outcome.kind === "gated") expect(outcome.reasons.map((reason) => reason.code)).toContain("kill_switch");
    expect(rig.daemon.toolCalls).toEqual(["xo_account"]);
  });

  it("shows an unproven capability as unproven and prepares nothing (every flag on, nothing recorded)", async () => {
    rig = makePrepareRig({ facts: NO_FACTS });
    installPrepareReads(rig);
    const outcome = await run(ORDER);
    expect(outcome).toMatchObject({ kind: "gated", action: "order" });
    if (outcome.kind === "gated") {
      expect(outcome.unprovenRequired.length).toBeGreaterThan(0);
      expect(outcome.reasons.map((reason) => reason.code)).toContain("unproven");
      for (const id of outcome.unprovenRequired) expect(outcome.facts[id]).toBe("unknown");
    }
    expect(rig.daemon.toolCalls).toEqual(["xo_account"]);
  });

  it("treats a recorded 'no' like unknown", async () => {
    rig = makePrepareRig({ facts: factsWith([], ["door_a_bundler_admits_first_userop", "paybox_signs_raw_digest"]) });
    installPrepareReads(rig);
    expect(await run("fund 3")).toMatchObject({ kind: "gated", action: "fund" });
  });

  it("needs both the plugin's and the relay's switch", async () => {
    rig = makePrepareRig();
    const account = answer("account_trading");
    account["flags"]["plugin"]["ENABLE_TRADING"] = true;
    account["flags"]["relay"]["ENABLE_TRADING"] = false;
    installPrepareReads(rig);
    rig.daemon.tools.set("xo_account", () => toolEnvelope("xo_account", account));
    expect(await run(ORDER)).toMatchObject({ kind: "gated", action: "order" });
  });

  it("reports an account it could not read, and prepares nothing", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig);
    rig.daemon.tools.set("xo_account", () => toolEnvelope("xo_account", { nonsense: 1 }));
    expect(await run(ORDER)).toMatchObject({ kind: "account_unread", failure: { kind: "schema_violation" } });
    rig.daemon.tools.set("xo_account", () => toolEnvelope("xo_account", answer("account_undeployed")));
    expect(await run(ORDER)).toMatchObject({ kind: "account_unread", failure: { kind: "wrong_subject" } });
    expect(rig.daemon.toolCalls).not.toContain("xo_prepare_order");
  });

  it("reaches nothing when the page is not paired", async () => {
    rig = makePrepareRig({ code: undefined });
    installPrepareReads(rig);
    const outcome = await runPrepare({ command: command(ORDER), origin: "typed", retyped: {} }, rig.deps);
    expect(outcome).toMatchObject({ kind: "refused_here", code: "not_paired" });
    expect(rig.daemon.raw.calls).toHaveLength(0);
  });
});

describe("M5-7: a pasted, filled or proposed line is not run until the market id and size are typed again", () => {
  for (const origin of ["pasted", "filled", "proposal"] as const) {
    it(`${origin}: refused with nothing re-typed, and not one request is made`, async () => {
      rig = makePrepareRig();
      installPrepareReads(rig);
      serve(rig, "xo_prepare_order", answer("prepare_order_buy"));
      const outcome = await run(ORDER, origin);
      expect(outcome).toMatchObject({ kind: "refused_here", code: "retype_required" });
      if (outcome.kind === "refused_here") {
        expect(outcome.retype?.fields.map((field) => field.key)).toEqual(["market", "size"]);
        expect(outcome.retype?.missing).toEqual(["market", "size"]);
      }
      expect(rig.daemon.toolCalls).toEqual([]);
    });

    it(`${origin}: refused when what was typed again differs, naming which one`, async () => {
      rig = makePrepareRig();
      installPrepareReads(rig);
      const wrongSize = await run(ORDER, origin, { market: MARKET, size: "100" });
      expect(wrongSize).toMatchObject({ kind: "refused_here", code: "retype_mismatch", retype: { mismatched: ["size"] } });
      const wrongMarket = await run(ORDER, origin, { market: `0x${"22".repeat(32)}`, size: "10" });
      expect(wrongMarket).toMatchObject({ kind: "refused_here", code: "retype_mismatch", retype: { mismatched: ["market"] } });
      expect(rig.daemon.toolCalls).toEqual([]);
    });

    it(`${origin}: runs once both are typed again`, async () => {
      rig = makePrepareRig();
      installPrepareReads(rig);
      serve(rig, "xo_prepare_order", answer("prepare_order_buy"));
      expectPrepared(await run(ORDER, origin, { market: MARKET.toUpperCase().replace("0X", "0x"), size: "10.0" }));
      expect(rig.daemon.toolCalls).toEqual(["xo_account", "xo_get_market", "xo_prepare_order"]);
    });
  }

  it("a line the person typed or recalled needs no re-typing", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig);
    serve(rig, "xo_prepare_order", answer("prepare_order_buy"));
    expectPrepared(await run(ORDER, "typed"));
    expectPrepared(await run(ORDER, "recalled"));
  });

  it("a proposal with text that tries to steer the size cannot get past a re-type of the true size", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig);
    // The line says 10; someone's text said "type 1". Typing 1 does not match the line, so nothing is prepared.
    expect(await run(ORDER, "proposal", { market: MARKET, size: "1" })).toMatchObject({ kind: "refused_here", code: "retype_mismatch" });
  });
});

describe("whose account", () => {
  it("needs an owner, and a choice when there are several", async () => {
    rig = makePrepareRig({ owners: [] });
    installPrepareReads(rig);
    expect(await run("revoke")).toMatchObject({ kind: "refused_here", code: "owner_needed" });
    rig = makePrepareRig({ owners: [OWNER, FRESH_OWNER] });
    installPrepareReads(rig);
    expect(await run("revoke")).toMatchObject({ kind: "refused_here", code: "owner_many" });
    expect(rig.daemon.toolCalls).toEqual([]);
  });

  it("accepts a typed owner that is one of the saved ones", async () => {
    rig = makePrepareRig({ owners: [OWNER, FRESH_OWNER] });
    installPrepareReads(rig);
    serve(rig, "xo_revoke_trading", answer("prepare_revoke"));
    expectPrepared(await run(`revoke from ${OWNER}`));
  });

  it("refuses a look-alike of a saved address until it is compared", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig);
    const lookalike = `${OWNER.slice(0, 8).toLowerCase()}${"0".repeat(30)}${OWNER.slice(-4).toLowerCase()}`;
    expect(await run(`revoke from ${lookalike}`)).toMatchObject({ kind: "refused_here", code: "owner_lookalike" });
    expect(rig.daemon.toolCalls).toEqual([]);
  });

  it("refuses an answer about another owner", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig);
    const stranger = `0x${"1".repeat(40)}`;
    expect(await run(`revoke from ${stranger}`)).toMatchObject({ kind: "account_unread" });
    expect(rig.daemon.toolCalls).not.toContain("xo_revoke_trading");
  });
});

describe("the other prepare commands", () => {
  it("redeems the markets named", async () => {
    rig = makePrepareRig({ startFrom: "prepare_redeem_three" });
    installPrepareReads(rig);
    serve(rig, "xo_redeem", answer("prepare_redeem_three"));
    const outcome = expectPrepared(await run(`redeem ${REDEEM_IDS.join(" ")}`));
    expect(outcome.result.kind).toBe("vetted");
    expect(rig.daemon.toolCalls).toEqual(["xo_account", "xo_redeem"]);
    // A redeem that returns something else than what was named is refused.
    const wrong = expectPrepared(await run(`redeem ${REDEEM_IDS[0]}`));
    expect(wrong.result.kind).toBe("failed_vetting");
    expect(wrong.openCard).toBeNull();
  });

  it("deploys with the allowance the person chose, unlimited or capped", async () => {
    rig = makePrepareRig({ owner: FRESH_OWNER, startFrom: "prepare_deploy" });
    installPrepareReads(rig, { account: "account_undeployed" });
    serve(rig, "xo_deploy_enable_trading", answer("prepare_deploy"));
    expect(expectPrepared(await run("deploy unlimited")).result.kind).toBe("vetted");
    serve(rig, "xo_deploy_enable_trading", answer("prepare_deploy_capped"));
    const asked: Record<string, unknown>[] = [];
    rig.daemon.tools.set("xo_deploy_enable_trading", (args) => {
      asked.push(args);
      return { ...toolEnvelope("xo_deploy_enable_trading", answer("prepare_deploy_capped")), tool_class: "prepare" };
    });
    expect(expectPrepared(await run("deploy capped 50.0")).result.kind).toBe("vetted");
    expect(asked[0]).toMatchObject({ step: "prepare", allowance_usd: "50" });
    // A capped request answered with the unlimited item is refused.
    serve(rig, "xo_deploy_enable_trading", answer("prepare_deploy"));
    expect(expectPrepared(await run("deploy capped 50")).result.kind).toBe("failed_vetting");
  });

  it("refuses a capped allowance the arithmetic cannot represent", async () => {
    rig = makePrepareRig({ owner: FRESH_OWNER });
    installPrepareReads(rig, { account: "account_undeployed" });
    expect(await run("deploy capped 1.0000001")).toMatchObject({ kind: "refused_here", code: "amount_invalid" });
    expect(await run("fund 1.0000001")).toMatchObject({ kind: "refused_here", code: "amount_invalid" });
    expect(rig.daemon.toolCalls).toEqual([]);
  });

  it("prepares revoke", async () => {
    rig = makePrepareRig({ startFrom: "prepare_revoke" });
    installPrepareReads(rig);
    serve(rig, "xo_revoke_trading", answer("prepare_revoke"));
    expect(expectPrepared(await run("revoke")).result.kind).toBe("vetted");
  });

  it("prepares a funding step whose destination is the derived account", async () => {
    const recorded = FUND_ANSWERS["fund_approve"];
    if (recorded === undefined) throw new Error("fixture");
    rig = makePrepareRig();
    installPrepareReads(rig, { on: ["ENABLE_FUNDING"] });
    serve(rig, "xo_fund_account", copyOf(recorded.structured));
    const outcome = expectPrepared(await run("fund 3"));
    expect(outcome.result.kind).toBe("funding");
    expect(outcome.openCard).toBeNull();
  });
});

describe("cancel is a hand-off text and sends nothing", () => {
  const HASH = "0x0adc5157ae9354b334829eba97a7e489519f79cf51ed3ddbb7c74a6984c65838";

  it("writes the exact call for an open order and calls no cancel tool", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig);
    const outcome = await run(`cancel ${HASH}`);
    expect(outcome).toMatchObject({ kind: "handoff", orderHash: HASH, owner: OWNER });
    if (outcome.kind === "handoff") {
      expect(JSON.parse(outcome.call)).toEqual({ tool: "xo_cancel_order", arguments: { owner: OWNER, order_hash: HASH } });
    }
    expect(rig.daemon.toolCalls).toEqual(["xo_account", "xo_list_orders"]);
  });

  it("refuses a hash that is not an open order, and one it cannot confirm", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig);
    expect(await run(`cancel 0x${"77".repeat(32)}`)).toMatchObject({ kind: "refused_here", code: "order_not_found" });
    rig.daemon.tools.set("xo_list_orders", () => toolEnvelope("xo_list_orders", { nonsense: true }));
    expect(await run(`cancel ${HASH}`)).toMatchObject({ kind: "refused_here", code: "orders_unreadable" });
    const truncated = answer("list_orders_one");
    truncated["truncated"] = true;
    truncated["orders"] = [];
    rig.daemon.tools.set("xo_list_orders", () => toolEnvelope("xo_list_orders", truncated));
    expect(await run(`cancel ${HASH}`)).toMatchObject({ kind: "refused_here", code: "orders_unreadable" });
  });

  it("is gated on the trading switch", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig, { account: "account_flags_off", on: [] });
    expect(await run(`cancel ${HASH}`)).toMatchObject({ kind: "gated", action: "cancel", readOnly: true });
    expect(rig.daemon.toolCalls).toEqual(["xo_account"]);
  });

  it("needs the order hash typed again when it was pasted", async () => {
    rig = makePrepareRig();
    installPrepareReads(rig);
    expect(await run(`cancel ${HASH}`, "pasted")).toMatchObject({ kind: "refused_here", code: "retype_required" });
    expect(await run(`cancel ${HASH}`, "pasted", { order: HASH })).toMatchObject({ kind: "handoff" });
  });
});

describe("what a run can reach", () => {
  it("never named a tool outside the closed list, in any test above", () => {
    const unique = new Set(seenTools);
    for (const tool of unique) expect(ALLOWED_TOOLS).toContain(tool);
    expect(unique.has("xo_prepare_order")).toBe(true);
    for (const tool of unique) expect(tool).not.toMatch(/submit|sign|cancel_order|withdraw|create|arm|kill/);
  });

  it("has fixed words for every refusal it can give, none of which quotes input", () => {
    for (const code of RUN_REFUSALS) {
      expect(RUN_REFUSAL_TEXT[code].length, code).toBeGreaterThan(10);
      expect(RUN_REFUSAL_TEXT[code], code).not.toMatch(/0x[0-9a-f]{4}/i);
    }
  });
});
