import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";

import { registerPmTools } from "../pm/tools/index.js";
import { registerAccountTools } from "../src/tools/account.js";
import { registerCreateTools } from "../src/tools/create.js";
import { registerDraftTools } from "../src/tools/draft.js";
import { registerFundTools } from "../src/tools/fund.js";
import { registerReadTools } from "../src/tools/read.js";
import { registerTradeTools } from "../src/tools/trade.js";
import { registerUseropTools } from "../src/tools/userop.js";

// No invented data may reach a user or an agent. Tool schemas are the one place sample values travel
// to an agent as if real, so no schema may carry an `examples` list or a `default` that looks like an
// address, a market id or a transaction hash, and no description may quote one. (Pinned contract
// addresses live in constants and appear in output only when read from a source; they are not here.)

type Obj = Record<string, unknown>;
const root = fileURLToPath(new URL("../", import.meta.url));

const HEX_LITERAL = /0x[0-9a-fA-F]{40,}/;

// Returns a path for every `examples`/`default`/`const`-style sample or description that holds a hex literal.
export function findInventedLiterals(node: unknown, path = "$"): string[] {
  const found: string[] = [];
  if (Array.isArray(node)) {
    node.forEach((item, index) => found.push(...findInventedLiterals(item, `${path}[${index}]`)));
    return found;
  }
  if (node === null || typeof node !== "object") return found;
  for (const [key, value] of Object.entries(node as Obj)) {
    const here = `${path}.${key}`;
    if (key === "examples" && Array.isArray(value) && value.length > 0) found.push(`${here}: schema carries examples`);
    if ((key === "default" || key === "description" || key === "title") && JSON.stringify(value).match(HEX_LITERAL)) found.push(`${here}: hex literal`);
    found.push(...findInventedLiterals(value, here));
  }
  return found;
}

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()?.();
});

async function listAllTools(): Promise<Obj[]> {
  const server = new McpServer({ name: "xo-market", version: "0.1.0" }, { supportedProtocolVersions: ["2026-07-28"] });
  registerReadTools(server);
  registerDraftTools(server);
  registerAccountTools(server);
  registerPmTools(server);
  registerUseropTools(server);
  registerTradeTools(server);
  registerFundTools(server);
  registerCreateTools(server);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const pending = new Map<number, (message: Obj) => void>();
  clientSide.onmessage = (message) => {
    const id = (message as { id?: number }).id;
    if (id !== undefined) pending.get(id)?.(message as unknown as Obj);
  };
  await clientSide.start();
  closers.push(async () => {
    await clientSide.close();
    await server.close();
  });
  const reply = await new Promise<Obj>((resolve) => {
    pending.set(1, resolve);
    void clientSide.send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "no-invented-data-test", version: "0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    } as never);
  });
  return (reply["result"] as Obj)["tools"] as Obj[];
}

describe("tool schemas carry no invented sample values", () => {
  it("no tool, in any registered set, has schema examples or a hex-literal default or description", async () => {
    const tools = await listAllTools();
    assert.ok(tools.length > 30, `expected the full tool set, got ${tools.length}`);
    const problems = tools.flatMap((tool) => findInventedLiterals(tool, String(tool["name"])));
    assert.deepEqual(problems, []);
  });

  it("the detector has teeth: examples, a default address and a described address are all found", () => {
    const owner = `0x${"ab".repeat(20)}`;
    assert.equal(findInventedLiterals({ properties: { a: { type: "string", examples: [owner] } } }).length, 1);
    assert.equal(findInventedLiterals({ properties: { a: { type: "string", default: owner } } }).length, 1);
    assert.equal(findInventedLiterals({ properties: { a: { type: "string", description: `for example ${owner}` } } }).length, 1);
    assert.deepEqual(findInventedLiterals({ properties: { a: { type: "string", description: "0x plus 40 hex digits" } } }), []);
  });
});

describe("the conformance sample call", () => {
  it("is an offline call with no input, so it cannot carry an invented market", () => {
    const sample = JSON.parse(readFileSync(`${root}paybox-plugin.json`, "utf8")) as { tool: string; arguments: Obj };
    assert.equal(sample.tool, "pm_list_venues");
    assert.deepEqual(sample.arguments, {});
  });
});
