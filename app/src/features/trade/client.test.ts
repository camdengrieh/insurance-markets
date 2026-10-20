import { describe, expect, it } from "vitest";

import { classifyTool } from "../../../../bridge/tool-classes";
import { DaemonError } from "./client";
import { TRADE_PREPARE_TOOLS, TRADE_READ_TOOLS, TRADE_TOOLS, accountArgs, deployArgs, fundArgs, isTradeTool, listOrdersArgs, orderArgs, redeemArgs, revokeArgs, toolClassOf, type ToolArgs } from "./tools";
import { OWNER, TOKENS, answer, errorReplyOf, jsonReply, makeRig, prepareEnvelope, toolEnvelope } from "./test-support";

async function paired() {
  const rig = makeRig();
  expect((await rig.services.session.pair()).ok).toBe(true);
  return rig;
}

async function failure(promise: Promise<unknown>): Promise<DaemonError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DaemonError) return error;
    throw error;
  }
  throw new Error("expected a DaemonError");
}

describe("the trade client's closed tool list agrees with the daemon's class table", () => {
  const SAMPLE: Readonly<Record<string, ToolArgs>> = {
    xo_account: accountArgs(OWNER),
    xo_list_orders: listOrdersArgs(OWNER),
    xo_prepare_order: orderArgs({ owner: OWNER, tokenId: TOKENS.yes, side: "BUY", price: "0.4", shares: "10", tif: "GTD", ttlS: null, postOnly: false }),
    xo_deploy_enable_trading: deployArgs(OWNER, null),
    xo_revoke_trading: revokeArgs(OWNER),
    xo_redeem: redeemArgs(OWNER, ["0x" + "11".repeat(32)]),
    xo_fund_account: fundArgs(OWNER, "3"),
  };

  it("has a sample for every tool on the list", () => {
    expect(Object.keys(SAMPLE).sort()).toEqual([...TRADE_TOOLS].sort());
  });

  it("classes every read tool read and every prepare tool prepare, exactly as the daemon does", () => {
    for (const tool of TRADE_READ_TOOLS) expect(classifyTool(tool, SAMPLE[tool] as ToolArgs), tool).toBe("read");
    for (const tool of TRADE_PREPARE_TOOLS) expect(classifyTool(tool, SAMPLE[tool] as ToolArgs), tool).toBe("prepare");
    for (const tool of TRADE_TOOLS) expect(toolClassOf(tool)).toBe(classifyTool(tool, SAMPLE[tool] as ToolArgs));
  });

  it("builds every step-taking call with the prepare step, so none can classify as submit", () => {
    for (const tool of ["xo_deploy_enable_trading", "xo_revoke_trading", "xo_redeem"]) {
      expect((SAMPLE[tool] as ToolArgs)["step"]).toBe("prepare");
    }
  });

  it("contains no tool that signs, submits, cancels or withdraws", () => {
    for (const tool of TRADE_TOOLS) expect(tool).not.toMatch(/submit|cancel|withdraw|sign|arm|kill|create|connect/);
    expect(isTradeTool("xo_submit_order")).toBe(false);
    expect(isTradeTool("xo_cancel_order")).toBe(false);
    expect(isTradeTool("xo_withdraw")).toBe(false);
  });
});

describe("the client", () => {
  it("refuses to call anything before the page is paired, and sends nothing", async () => {
    const rig = makeRig();
    const error = await failure(rig.services.client.callTool("xo_account", accountArgs(OWNER)));
    expect(error.code).toBe("not_paired");
    expect(rig.daemon.paths().filter((path) => path === "/ui/tool")).toEqual([]);
  });

  it("makes exactly one POST to /ui/tool with a bearer token, no cookie and no redirect", async () => {
    const rig = await paired();
    rig.daemon.tools.set("xo_account", () => toolEnvelope("xo_account", answer("account_deployed")));
    await rig.services.client.callTool("xo_account", accountArgs(OWNER));
    const calls = rig.daemon.raw.calls.filter((call) => call.url === "/ui/tool");
    expect(calls).toHaveLength(1);
    const init = calls[0]!.init;
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("manual");
    expect(init.headers["authorization"]).toMatch(/^Bearer cku_/);
    expect(JSON.parse(init.body ?? "null")).toEqual({ tool: "xo_account", args: { owner: OWNER } });
    expect(Object.keys(init.headers).sort()).toEqual(["accept", "authorization", "content-type"]);
  });

  it("refuses a tool that is not on the list before sending", async () => {
    const rig = await paired();
    const before = rig.daemon.raw.calls.length;
    const error = await failure(rig.services.client.callTool("xo_submit_order" as never, {}));
    expect(error.code).toBe("bad_response");
    expect(rig.daemon.raw.calls.length).toBe(before);
  });

  it("treats an answer that names another tool or another class as a bad response", async () => {
    const rig = await paired();
    rig.daemon.tools.set("xo_revoke_trading", () => prepareEnvelope("xo_redeem", {}));
    expect((await failure(rig.services.client.callTool("xo_revoke_trading", revokeArgs(OWNER)))).code).toBe("bad_response");
    rig.daemon.tools.set("xo_revoke_trading", () => ({ ...prepareEnvelope("xo_revoke_trading", {}), tool_class: "submit" }));
    expect((await failure(rig.services.client.callTool("xo_revoke_trading", revokeArgs(OWNER)))).code).toBe("bad_response");
    rig.daemon.tools.set("xo_revoke_trading", () => ({ ...prepareEnvelope("xo_revoke_trading", {}), tool_class: "read" }));
    expect((await failure(rig.services.client.callTool("xo_revoke_trading", revokeArgs(OWNER)))).code).toBe("bad_response");
  });

  it("maps the daemon's refusals to codes, never to the daemon's words", async () => {
    const rig = await paired();
    rig.daemon.tools.set("xo_account", () => errorReplyOf(401, "unauthorized"));
    expect((await failure(rig.services.client.callTool("xo_account", accountArgs(OWNER)))).code).toBe("unauthorized");
    rig.daemon.tools.set("xo_account", () => errorReplyOf(403, "not_armed"));
    const refused = await failure(rig.services.client.callTool("xo_account", accountArgs(OWNER)));
    expect(refused.code).toBe("refused");
    expect(refused.bridgeCode).toBe("not_armed");
    expect(refused.message).toBe("refused");
    rig.daemon.tools.set("xo_account", () => jsonReply(200, "not an envelope"));
    expect((await failure(rig.services.client.callTool("xo_account", accountArgs(OWNER)))).code).toBe("bad_response");
  });
});
