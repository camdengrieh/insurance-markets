import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { Ajv2020 } from "ajv/dist/2020.js";

import { SAFETY_NOTICES } from "../src/relay/contract.js";
import { APPROVAL_RECOMMENDED, DECODED_NOTICE } from "../src/tools/relay-tool-kit.js";
import { registerAccountTools } from "../src/tools/account.js";
import { registerCreateTools } from "../src/tools/create.js";
import { registerDraftTools } from "../src/tools/draft.js";
import { registerFundTools } from "../src/tools/fund.js";
import { registerReadTools } from "../src/tools/read.js";
import { registerTradeTools } from "../src/tools/trade.js";
import { registerUseropTools } from "../src/tools/userop.js";
import { asObj, closeAll, connect, must, type Harness, type Obj } from "./tools-helpers.js";

// A schema snapshot per tool, the registration of the whole plugin, and what every description must say.
// To accept a deliberate change to a tool's schema or wording, run:
//   UPDATE_TOOL_SNAPSHOTS=1 tsx --test test/tools-schema.test.ts
// and review the diff of test/fixtures/tools/schema-snapshot.json.

afterEach(closeAll);

const SNAPSHOT_URL = new URL("./fixtures/tools/schema-snapshot.json", import.meta.url);

const OUR_TOOLS = [
  "xo_account",
  "xo_connect",
  "xo_deploy_enable_trading",
  "xo_revoke_trading",
  "xo_redeem",
  "xo_submit_userop",
  "xo_userop_status",
  "xo_prepare_order",
  "xo_submit_order",
  "xo_order_status",
  "xo_cancel_order",
  "xo_list_orders",
  "xo_get_prepared",
] as const;
// The tools that put a signing intent in front of PayBox.
const SIGNING_TOOLS = ["xo_connect", "xo_deploy_enable_trading", "xo_revoke_trading", "xo_redeem", "xo_prepare_order"] as const;
const TWO_STEP_TOOLS = ["xo_connect", "xo_deploy_enable_trading", "xo_revoke_trading", "xo_redeem"] as const;
const READ_ONLY = ["xo_account", "xo_userop_status", "xo_order_status", "xo_list_orders", "xo_get_prepared"] as const;

function pluginRegistrars(server: McpServer): void {
  // The same calls, in the same order, as src/plugin.ts.
  registerReadTools(server);
  registerDraftTools(server);
  registerAccountTools(server);
  registerUseropTools(server);
  registerTradeTools(server);
  registerFundTools(server);
  registerCreateTools(server);
}

async function everything(): Promise<{ harness: Harness; tools: Obj[] }> {
  const harness = await connect(pluginRegistrars);
  return { harness, tools: await harness.list() };
}

const sha256 = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Obj).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortKeys(item)]));
  }
  return value;
}

function snapshotOf(tool: Obj): Obj {
  const output = asObj(tool["outputSchema"]);
  return {
    title: tool["title"],
    annotations: sortKeys(tool["annotations"]),
    // R3: the requiresUserInteraction marker is part of what the snapshot pins.
    meta: sortKeys(tool["_meta"] ?? null),
    description_sha256: createHash("sha256").update(String(tool["description"])).digest("hex"),
    input: sortKeys(tool["inputSchema"]),
    output: {
      sha256: sha256(sortKeys(output)),
      properties: Object.keys(asObj(output["properties"])).sort(),
      required: [...((output["required"] as string[] | undefined) ?? [])].sort(),
    },
  };
}

describe("the whole plugin registers cleanly", () => {
  it("registers every tool group once: no duplicate name (a duplicate stops the server at startup)", async () => {
    const { tools } = await everything();
    const names = tools.map((tool) => String(tool["name"]));
    assert.equal(new Set(names).size, names.length, `duplicates: ${names.filter((name, i) => names.indexOf(name) !== i).join(", ")}`);
    for (const name of OUR_TOOLS) assert.ok(names.includes(name), name);
    assert.equal(names.filter((name) => name === "xo_withdraw").length, 1);
    assert.equal(names.filter((name) => name === "xo_account").length, 1);
  });

  it("keeps the whole tools/list answer under the runner's 256 KiB stdout limit with room to spare", async () => {
    const { tools } = await everything();
    const bytes = Buffer.byteLength(JSON.stringify({ result: { tools } }));
    assert.ok(bytes < 230 * 1024, `tools/list is ${bytes} bytes`);
  });
});

describe("schemas of our tools", () => {
  it("are strict, compile as JSON Schema 2020-12, fit 64 KiB and carry a title", async () => {
    const { tools } = await everything();
    const ours = tools.filter((tool) => (OUR_TOOLS as readonly string[]).includes(String(tool["name"])));
    assert.equal(ours.length, OUR_TOOLS.length);
    for (const tool of ours) {
      const name = String(tool["name"]);
      const input = asObj(tool["inputSchema"]);
      const output = asObj(tool["outputSchema"]);
      assert.match(name, /^xo_[a-z_]+$/);
      assert.equal(input["type"], "object", name);
      assert.equal(input["additionalProperties"], false, `${name} input must refuse unknown properties`);
      assert.equal(output["additionalProperties"], false, `${name} output must be strict`);
      assert.ok(String(tool["title"]).length > 0, name);
      const bytes = Buffer.byteLength(JSON.stringify(input)) + Buffer.byteLength(JSON.stringify(output));
      assert.ok(bytes <= 64 * 1024, `${name}: ${bytes} bytes`);
      assert.doesNotThrow(() => new Ajv2020({ strict: false, validateFormats: false, logger: false }).compile(input), name);
      assert.doesNotThrow(() => new Ajv2020({ strict: false, validateFormats: false, logger: false }).compile(output), name);
      assert.equal(JSON.stringify(tool).includes("x-mcp-header"), false, name);
    }
  });

  it("flag the read-only tools as read-only and every tool that can send as not read-only and not idempotent", async () => {
    const { tools } = await everything();
    const byName = new Map(tools.map((tool) => [String(tool["name"]), asObj(tool["annotations"])]));
    for (const name of READ_ONLY) {
      assert.equal(byName.get(name)?.["readOnlyHint"], true, name);
      assert.equal(byName.get(name)?.["idempotentHint"], true, name);
    }
    for (const name of OUR_TOOLS.filter((tool) => !(READ_ONLY as readonly string[]).includes(tool))) {
      assert.equal(byName.get(name)?.["readOnlyHint"], false, name);
      assert.equal(byName.get(name)?.["idempotentHint"], false, name);
    }
  });

  it("never take an address, a call target, calldata or a signer from the agent: only an owner", async () => {
    const { tools } = await everything();
    const forbidden = /^(account|address|to|target|spender|recipient|destination|maker|signer|taker|calldata|data|value|nonce|chain_id|chainId|verifying_contract|exchange|contract|token|delegate|beneficiary)$/;
    for (const tool of tools.filter((entry) => (OUR_TOOLS as readonly string[]).includes(String(entry["name"])))) {
      for (const property of Object.keys(asObj(asObj(tool["inputSchema"])["properties"]))) {
        assert.equal(forbidden.test(property), false, `${String(tool["name"])} takes ${property}`);
      }
    }
  });

  it("give every two-step tool a step of prepare or submit, and submit takes prepared_id and signature only", async () => {
    const { tools } = await everything();
    for (const name of TWO_STEP_TOOLS) {
      const tool = must(tools.find((entry) => entry["name"] === name));
      const properties = asObj(asObj(tool["inputSchema"])["properties"]);
      assert.deepEqual(asObj(properties["step"])["enum"], ["prepare", "submit"], name);
      assert.deepEqual((asObj(tool["inputSchema"])["required"] as string[]).sort(), ["step"], name);
      assert.ok("prepared_id" in properties && "signature" in properties, name);
    }
    const submitOnly = [["xo_submit_userop"], ["xo_submit_order"]];
    for (const [name] of submitOnly) {
      const tool = must(tools.find((entry) => entry["name"] === name));
      assert.deepEqual(Object.keys(asObj(asObj(tool["inputSchema"])["properties"])).sort(), ["prepared_id", "signature"], name);
      assert.deepEqual((asObj(tool["inputSchema"])["required"] as string[]).sort(), ["prepared_id", "signature"], name);
    }
  });

  it("return the relay's Prepared object and sign_with_paybox from every tool that signs", async () => {
    const { tools } = await everything();
    for (const name of SIGNING_TOOLS) {
      const output = asObj(asObj(must(tools.find((entry) => entry["name"] === name))["outputSchema"])["properties"]);
      for (const field of ["prepared", "sign_with_paybox", "sign_instructions", "digest_tag", "unproven_capabilities", "warnings", "next_action", "code", "message"]) {
        assert.ok(field in output, `${name} has no ${field}`);
      }
    }
  });
});

describe("what every description must say", () => {
  it("states that caps are advisory, that approval-gated signing is the only mode in which a human sees a signature, and the dedicated credential, for every tool that signs or sends", async () => {
    const { tools } = await everything();
    for (const name of SIGNING_TOOLS) {
      const description = String(must(tools.find((entry) => entry["name"] === name))["description"]);
      for (const sentence of [APPROVAL_RECOMMENDED, SAFETY_NOTICES.advisoryCaps, SAFETY_NOTICES.approvalMode, SAFETY_NOTICES.dedicatedCredential, SAFETY_NOTICES.digestTag]) {
        assert.ok(description.includes(sentence), `${name}: ${sentence.slice(0, 40)}`);
      }
      assert.match(description, /recommended mode/, name);
      assert.match(description, /unproven/i, name);
    }
    // R1 / R2: every tool that prepares or submits something to sign says what the decoded block and the tags are.
    for (const name of [...SIGNING_TOOLS, "xo_submit_userop", "xo_submit_order", "xo_submit_create_market", "xo_prepare_create_market", "xo_respond_update", "xo_cancel_market", "xo_place_seed", "xo_withdraw", "xo_get_prepared"]) {
      const description = String(must(tools.find((entry) => entry["name"] === name))["description"]);
      assert.ok(description.includes(DECODED_NOTICE) || (/decoded block/.test(description) && /inner_hash_tag/.test(description)), `${name} does not describe the decoded block and inner_hash_tag`);
      assert.ok(description.includes(SAFETY_NOTICES.advisoryCaps), `${name} does not say the caps are advisory`);
    }
    for (const name of ["xo_submit_userop", "xo_submit_order", "xo_cancel_order"]) {
      const description = String(must(tools.find((entry) => entry["name"] === name))["description"]);
      assert.ok(description.includes(SAFETY_NOTICES.advisoryCaps), name);
    }
  });

  it("tells the agent which switch turns each write path on, and that it is off by default", async () => {
    const { tools } = await everything();
    const text = (name: string): string => String(must(tools.find((entry) => entry["name"] === name))["description"]);
    for (const name of ["xo_prepare_order", "xo_submit_order", "xo_cancel_order", "xo_connect"]) assert.match(text(name), /ENABLE_TRADING/, name);
    for (const name of ["xo_deploy_enable_trading", "xo_revoke_trading", "xo_redeem", "xo_submit_userop"]) assert.match(text(name), /ENABLE_USEROP_SUBMIT/, name);
    for (const name of OUR_TOOLS.filter((tool) => !(READ_ONLY as readonly string[]).includes(tool))) assert.match(text(name), /kill switch/i, name);
  });

  it("calls a signed order uncancellable on chain, and market text untrusted, where that matters", async () => {
    const { tools } = await everything();
    const text = (name: string): string => String(must(tools.find((entry) => entry["name"] === name))["description"]);
    assert.match(text("xo_prepare_order"), /cannot be cancelled on chain/);
    assert.match(text("xo_cancel_order"), /no on-chain cancel/);
    assert.ok(text("xo_prepare_order").includes(SAFETY_NOTICES.untrustedText));
    assert.ok(text("xo_redeem").includes(SAFETY_NOTICES.untrustedText));
  });

  it("holds no emoji, no e-mail address, no home path and no address literal", async () => {
    const { tools } = await everything();
    for (const tool of tools.filter((entry) => (OUR_TOOLS as readonly string[]).includes(String(entry["name"])))) {
      const text = JSON.stringify([tool["title"], tool["description"], tool["inputSchema"], tool["outputSchema"]]);
      assert.equal(/\p{Extended_Pictographic}/u.test(text), false, String(tool["name"]));
      assert.equal(/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text), false, String(tool["name"]));
      assert.equal(/\/Users\/|\/home\//.test(text), false, String(tool["name"]));
      assert.equal(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/.test(text), false, `${String(tool["name"])} names an address`);
    }
  });
});

describe("schema snapshot", () => {
  it("matches test/fixtures/tools/schema-snapshot.json for every tool of ours", async () => {
    const { tools } = await everything();
    const current: Record<string, Obj> = {};
    for (const name of OUR_TOOLS) current[name] = snapshotOf(must(tools.find((entry) => entry["name"] === name), name));
    if (process.env["UPDATE_TOOL_SNAPSHOTS"] === "1") {
      writeFileSync(fileURLToPath(SNAPSHOT_URL), `${JSON.stringify(current, null, 1)}\n`);
      return;
    }
    const stored = JSON.parse(readFileSync(SNAPSHOT_URL, "utf8")) as Record<string, Obj>;
    assert.deepEqual(Object.keys(stored).sort(), [...OUR_TOOLS].sort(), "the snapshot lists a different set of tools");
    for (const name of OUR_TOOLS) {
      assert.deepEqual(current[name], stored[name], `${name}: its schema or wording changed; if that is deliberate run UPDATE_TOOL_SNAPSHOTS=1 and review the diff`);
    }
  });
});
