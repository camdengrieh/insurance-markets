import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { McpServer } from "@modelcontextprotocol/server";

import { registerAccountTools } from "../../../src/tools/account.js";
import { registerClobTools } from "../../../src/tools/clob.js";
import { registerCreateTools } from "../../../src/tools/create.js";
import { registerDraftTools } from "../../../src/tools/draft.js";
import { registerFundTools } from "../../../src/tools/fund.js";
import { registerReadTools } from "../../../src/tools/read.js";
import { registerTradeTools } from "../../../src/tools/trade.js";
import { registerUseropTools } from "../../../src/tools/userop.js";
import { asObj, closeAll, connect, type Obj } from "../../../test/tools-helpers.js";
import { MCP_PATH, UI_ROUTE_KEYS } from "../../contract.js";
import {
  ROUTE_RULES,
  TOOL_CLASS_TABLE,
  TOOL_NAMES,
  allRouteKeys,
  argsHashOf,
  assertToolRegistryClassified,
  checkToolRegistry,
  classifyTool,
  createInProcessToolRunner,
  outcomeOf,
  scopeCeilingOfKind,
  scopeOfClass,
  submitKeyOf,
} from "../../tool-classes.js";

afterEach(closeAll);

// The plugin registers its tools the same way src/plugin.ts and src/local/server.ts do.
function register(server: McpServer): void {
  registerReadTools(server);
  registerDraftTools(server);
  registerAccountTools(server);
  registerUseropTools(server);
  registerTradeTools(server);
  registerFundTools(server);
  registerCreateTools(server);
  registerClobTools(server);
}

describe("the tool-class table against the plugin's tool registry (M1-7)", () => {
  it("classifies every tool the local MCP server registers, and lists no tool it does not have", async () => {
    const runner = createInProcessToolRunner();
    try {
      const names = [...((await runner.listTools?.()) ?? [])];
      assert.ok(names.length >= 28, `expected the plugin's tools, got ${names.length}`);
      assert.deepEqual(checkToolRegistry(names), { unclassified: [], stale: [] });
      assert.doesNotThrow(() => assertToolRegistryClassified(names));
    } finally {
      await runner.close?.();
    }
  });

  it("fails the build when the plugin registers a tool the table does not know", () => {
    const names = [...TOOL_NAMES, "xo_brand_new_tool"];
    assert.deepEqual(checkToolRegistry(names).unclassified, ["xo_brand_new_tool"]);
    assert.throws(() => assertToolRegistryClassified(names), /Unclassified: xo_brand_new_tool/);
  });

  it("fails the build when the table lists a tool the plugin no longer registers", () => {
    const names = TOOL_NAMES.filter((name) => name !== "xo_redeem");
    assert.deepEqual(checkToolRegistry(names).stale, ["xo_redeem"]);
    assert.throws(() => assertToolRegistryClassified(names), /Stale: xo_redeem/);
  });

  it("agrees with each tool's own annotations: read-only means class read, and nothing else is read", async () => {
    const harness = await connect(register);
    const tools = await harness.list();
    for (const tool of tools) {
      const name = String(tool["name"]);
      const readOnly = asObj(tool["annotations"])["readOnlyHint"] === true;
      const rule = TOOL_CLASS_TABLE[name];
      assert.ok(rule, `${name} is classified`);
      const classes = rule.kind === "fixed" ? [rule.toolClass] : [rule.prepare, rule.submit];
      if (readOnly) assert.deepEqual(classes, ["read"], `${name} is read-only and must be class read`);
      else assert.ok(!classes.includes("read"), `${name} changes state and must not be class read`);
    }
  });

  it("puts every tool that asks the host for user interaction (R3) in a class above read", async () => {
    const harness = await connect(register);
    for (const tool of await harness.list()) {
      const meta = (tool["_meta"] ?? {}) as Obj;
      if (meta["anthropic/requiresUserInteraction"] !== true) continue;
      const rule = TOOL_CLASS_TABLE[String(tool["name"])];
      assert.ok(rule);
      const classes = rule.kind === "fixed" ? [rule.toolClass] : [rule.prepare, rule.submit];
      assert.ok(!classes.includes("read"), `${String(tool["name"])} is marked requiresUserInteraction`);
    }
  });

  it("gives every tool with a step argument a stepped rule (prepare builds, submit sends)", async () => {
    const harness = await connect(register);
    for (const tool of await harness.list()) {
      const properties = asObj(asObj(tool["inputSchema"])["properties"]);
      const hasStep = "step" in properties;
      const rule = TOOL_CLASS_TABLE[String(tool["name"])];
      assert.equal(rule?.kind === "stepped", hasStep, `${String(tool["name"])}: stepped iff it has a step argument`);
    }
  });
});

describe("classifying one call", () => {
  it("reads the class of a two-step tool from its step", () => {
    assert.equal(classifyTool("xo_redeem", { step: "prepare" }), "prepare");
    assert.equal(classifyTool("xo_redeem", { step: "submit" }), "submit");
    assert.equal(classifyTool("xo_connect", { step: "prepare" }), "prepare");
    assert.equal(classifyTool("xo_place_seed", { step: "submit" }), "submit");
  });

  it("treats a missing, odd or smuggled step as submit, the strictest", () => {
    for (const step of [undefined, null, "", "Prepare", "prepare ", ["prepare"], { x: 1 }, 1, "PREPARE", "submit "]) {
      assert.equal(classifyTool("xo_redeem", { step }), "submit", JSON.stringify(step));
    }
    assert.equal(classifyTool("xo_redeem", {}), "submit");
  });

  it("denies a tool that is not in the table, including names that exist on every object", () => {
    for (const name of ["xo_new_tool", "", "constructor", "__proto__", "toString", "hasOwnProperty", "XO_SEARCH", "xo_search "]) {
      assert.equal(classifyTool(name, {}), undefined, name);
    }
  });

  it("puts the sends in submit and the signing-intent builders in prepare", () => {
    for (const name of ["xo_submit_userop", "xo_submit_order", "xo_submit_create_market", "xo_cancel_order"]) assert.equal(classifyTool(name, {}), "submit", name);
    for (const name of ["xo_prepare_order", "xo_prepare_create_market", "xo_fund_account", "xo_withdraw"]) assert.equal(classifyTool(name, {}), "prepare", name);
    for (const name of ["xo_search", "xo_orderbook", "xo_account", "xo_get_prepared", "xo_list_orders", "xo_track_market"]) assert.equal(classifyTool(name, {}), "read", name);
  });

  it("maps classes to scopes, and admin to none", () => {
    assert.equal(scopeOfClass("read"), "read");
    assert.equal(scopeOfClass("prepare"), "prepare");
    assert.equal(scopeOfClass("submit"), "submit");
    assert.equal(scopeOfClass("admin"), undefined);
  });

  it("never lets a ui token hold submit, whatever it was given", () => {
    assert.deepEqual(scopeCeilingOfKind("ui"), ["read", "prepare"]);
    assert.ok(scopeCeilingOfKind("agent").includes("submit"));
  });
});

describe("the once-only key and the argument hash", () => {
  const id = "ab".repeat(16);
  it("keys a submit by its prepared id, case-insensitively, and a cancel by its order hash", () => {
    assert.equal(submitKeyOf("xo_submit_order", { prepared_id: id }), `p:${id}`);
    assert.equal(submitKeyOf("xo_submit_order", { prepared_id: id.toUpperCase() }), `p:${id}`);
    assert.equal(submitKeyOf("xo_cancel_order", { order_hash: `0x${"cd".repeat(32)}` }), `o:0x${"cd".repeat(32)}`);
  });
  it("gives no key for a missing or malformed id", () => {
    assert.equal(submitKeyOf("xo_submit_order", {}), undefined);
    assert.equal(submitKeyOf("xo_submit_order", { prepared_id: "short" }), undefined);
    assert.equal(submitKeyOf("xo_submit_order", { prepared_id: 5 }), undefined);
    // an order hash only counts for the cancel tool
    assert.equal(submitKeyOf("xo_submit_order", { order_hash: `0x${"cd".repeat(32)}` }), undefined);
  });
  it("hashes arguments the same whatever the key order, to 16 hex digits, and differently for different arguments", () => {
    const a = argsHashOf({ a: 1, b: { c: [1, 2], d: "x" } });
    assert.match(a, /^[0-9a-f]{16}$/);
    assert.equal(a, argsHashOf({ b: { d: "x", c: [1, 2] }, a: 1 }));
    assert.notEqual(a, argsHashOf({ a: 2, b: { c: [1, 2], d: "x" } }));
  });
});

describe("reading a tool's answer", () => {
  it("separates ok, refused, ambiguous, pending and error", () => {
    assert.equal(outcomeOf({ isError: false, text: null, structured: { outcome: "submitted" } }), "ok");
    assert.equal(outcomeOf({ isError: true, text: null, structured: { outcome: "refused", code: "flag_off" } }), "refused");
    assert.equal(outcomeOf({ isError: true, text: null, structured: { outcome: "ambiguous" } }), "ambiguous");
    assert.equal(outcomeOf({ isError: true, text: null, structured: { code: "ambiguous" } }), "ambiguous");
    assert.equal(outcomeOf({ isError: false, text: null, structured: { outcome: "pending" } }), "pending");
    assert.equal(outcomeOf({ isError: true, text: null, structured: { outcome: "rejected" } }), "error");
    assert.equal(outcomeOf({ isError: true, text: null, structured: null }), "error");
    assert.equal(outcomeOf({ isError: false, text: null, structured: null, thrown: true }), "error");
  });
});

describe("the route table", () => {
  it("has a rule for every route the daemon can serve, and no rule for any other (M1-7 for routes)", () => {
    assert.deepEqual([...allRouteKeys()].sort(), Object.keys(ROUTE_RULES).sort());
    for (const key of UI_ROUTE_KEYS) assert.ok(ROUTE_RULES[key], key);
    for (const method of ["GET", "POST", "DELETE"]) assert.ok(ROUTE_RULES[`${method} ${MCP_PATH}`]);
  });

  it("never lets a page token call a submit route, and never classes a route admin", () => {
    for (const [key, rule] of Object.entries(ROUTE_RULES)) {
      if (rule.routeClass === "submit") {
        assert.deepEqual(rule.kinds, ["agent"], key);
        assert.equal(rule.scope, "submit", key);
      }
      assert.notEqual(rule.routeClass, "admin", key);
    }
  });

  it("asks for the scope of its class", () => {
    for (const [key, rule] of Object.entries(ROUTE_RULES)) {
      if (rule.routeClass === "read" || rule.routeClass === "prepare" || rule.routeClass === "submit") assert.equal(rule.scope, rule.routeClass, key);
    }
  });

  it("makes pairing the only public route and the arm routes page-only", () => {
    const publics = Object.entries(ROUTE_RULES).filter(([, rule]) => rule.routeClass === "public").map(([key]) => key);
    assert.deepEqual(publics, ["POST /ui/pair"]);
    assert.deepEqual(ROUTE_RULES["POST /ui/arm"]?.kinds, ["ui"]);
    assert.deepEqual(ROUTE_RULES["POST /ui/arm/confirm"]?.kinds, ["ui"]);
  });
});
