import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { McpServer } from "@modelcontextprotocol/server";
import { PM_TOOL_NAMES, registerPmTools, registerPmToolsWith } from "../../tools/index.js";
import { closeAll, connect, connectDeps, makeDeps, strictAjv, type Obj } from "./harness.js";

afterEach(closeAll);

const OPEN_WORLD: Record<string, boolean> = {
  pm_list_venues: false,
  pm_get_quote: true,
  pm_lookup_links: false,
  pm_verify_link: true,
  pm_compare_market: true,
  pm_check_structure: true,
  pm_signal_request: false,
  pm_signal_parse: false,
};

async function listed(): Promise<Obj[]> {
  return (await connectDeps(makeDeps())).list();
}

describe("tools/list for a fake server", () => {
  it("lists exactly the eight pm tools, once each, none in the xo_ namespace", async () => {
    const tools = await listed();
    const names = tools.map((t) => String(t["name"]));
    assert.deepEqual([...names].sort(), [...PM_TOOL_NAMES].sort());
    assert.equal(new Set(names).size, names.length);
    for (const name of names) assert.match(name, /^pm_[a-z_]+$/);
    // The tools/list payload stays far below the 256 KiB stdout limit.
    assert.ok(JSON.stringify(tools).length < 96 * 1024, "tools/list payload size");
  });

  it("marks every tool read-only, non-destructive, idempotent, with the right openWorldHint", async () => {
    for (const tool of await listed()) {
      const name = String(tool["name"]);
      const a = tool["annotations"] as Obj;
      assert.equal(a["readOnlyHint"], true, name);
      assert.equal(a["destructiveHint"], false, name);
      assert.equal(a["idempotentHint"], true, name);
      assert.equal(a["openWorldHint"], OPEN_WORLD[name], name);
      assert.equal(typeof tool["title"], "string", name);
    }
  });

  it("states the safety rules in every description", async () => {
    for (const tool of await listed()) {
      const name = String(tool["name"]);
      const d = String(tool["description"]);
      assert.match(d, /Read-only/, `${name}: read-only`);
      assert.match(d, /no guaranteed profit/i, `${name}: no guaranteed profit`);
      assert.match(d, /memory-only/i, `${name}: memory-only`);
      assert.match(d, /advisory/i, `${name}: advisory`);
      assert.match(d, /untrusted/i, `${name}: untrusted`);
      assert.equal(/executable arbitrage|risk-free|guaranteed return/i.test(d.replace(/no guaranteed profit|cannot label anything executable arbitrage|not an arbitrage/gi, "")), false, `${name}: no profit claim`);
    }
  });

  it("has strict objects for input and output that compile as JSON Schema 2020-12 in strict mode", async () => {
    for (const tool of await listed()) {
      const name = String(tool["name"]);
      const input = tool["inputSchema"] as Obj;
      const output = tool["outputSchema"] as Obj;
      assert.equal(input["type"], "object", `${name} input root`);
      assert.equal(input["additionalProperties"], false, `${name} input must be strict`);
      assert.equal(output["type"], "object", `${name} output root`);
      assert.equal(output["additionalProperties"], false, `${name} output must be strict`);
      assert.ok(JSON.stringify(input).length < 64 * 1024, `${name} input size`);
      assert.ok(JSON.stringify(output).length < 64 * 1024, `${name} output size`);
      assert.doesNotThrow(() => strictAjv().compile(input), `${name} input compiles strict`);
      assert.doesNotThrow(() => strictAjv().compile(output), `${name} output compiles strict`);
    }
  });

  it("registers with an empty environment and the production wiring, touching no network", async () => {
    const original = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = (() => {
      fetched += 1;
      throw new Error("network is off in this test");
    }) as typeof fetch;
    try {
      const harness = await connect((server) => registerPmTools(server));
      const names = (await harness.list()).map((t) => String(t["name"]));
      assert.deepEqual([...names].sort(), [...PM_TOOL_NAMES].sort());
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(fetched, 0);
  });

  it("registering the set twice on one server throws (a duplicate name must not pass silently)", () => {
    const server = new McpServer({ name: "dup", version: "0" }, { supportedProtocolVersions: ["2026-07-28"] });
    registerPmToolsWith(server, makeDeps());
    assert.throws(() => registerPmToolsWith(server, makeDeps()));
  });

  it("rejects input outside the strict schema before any handler runs", async () => {
    const audit = makeDeps().audit;
    const harness = await connectDeps(makeDeps({ audit }));
    const bad = await harness.call("pm_get_quote", { venue: "xo", market_id: "m", outcome: "yes", side: "buy", size: "1", extra: true });
    assert.equal(bad.isError, true);
    const wrongVenue = await harness.call("pm_get_quote", { venue: "nowhere", market_id: "m", outcome: "yes", side: "buy", size: "1" });
    assert.equal(wrongVenue.isError, true);
    assert.equal(audit.events.length, 0, "the handler never ran");
  });
});
