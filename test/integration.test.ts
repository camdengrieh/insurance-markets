import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { Ajv2020 } from "ajv/dist/2020.js";

import { parseDecimalAtomic } from "../src/guardrails/amount.js";
import * as guard from "../src/guardrails/constants.js";
import { VALIDATE_DRAFT_TOOL, registerDraftTools } from "../src/tools/draft.js";
import { registerPmTools } from "../pm/tools/index.js";
import { LIST_VENUES_TOOL } from "../pm/tools/venues.js";
import { READ_TOOL_NAMES, registerReadTools } from "../src/tools/read.js";
import * as signing from "../src/xo/signing/constants.js";
import { MICRO, parseDecimalToMicro } from "../src/xo/units.js";

// Cross-stream checks: what only breaks when the streams are put together. Each stream has its
// own tests; these cover the seams (the tool set plugin.ts exposes, the conformance sample, and
// values that two modules each define for themselves).

type Obj = Record<string, unknown>;
const root = fileURLToPath(new URL("../", import.meta.url));
const readText = (path: string): string => readFileSync(`${root}${path}`, "utf8");

// ---- a server built the way plugin.ts builds it, driven over an in-memory transport ----

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()?.();
});

async function connect(options: { readonly withPm?: boolean } = {}): Promise<(method: string, params: Obj) => Promise<Obj>> {
  const server = new McpServer({ name: "xo-market", version: "0.1.0" }, { supportedProtocolVersions: ["2026-07-28"] });
  registerReadTools(server);
  registerDraftTools(server);
  if (options.withPm === true) registerPmTools(server);
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
  let nextId = 1;
  return (method, params) => {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      void clientSide.send({
        jsonrpc: "2.0",
        id,
        method,
        params: {
          ...params,
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientInfo": { name: "integration-test", version: "0" },
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      } as never);
    });
  };
}

async function listTools(rpc: (method: string, params: Obj) => Promise<Obj>): Promise<Obj[]> {
  const result = (await rpc("tools/list", {}))["result"] as Obj;
  assert.equal(result["nextCursor"], undefined, "tools/list should fit one page");
  return result["tools"] as Obj[];
}

describe("the tool set plugin.ts exposes", () => {
  it("is the seven read tools plus the draft validator, each registered once", async () => {
    const names = (await listTools(await connect())).map((tool) => String(tool["name"]));
    assert.deepEqual([...names].sort(), [...READ_TOOL_NAMES, VALIDATE_DRAFT_TOOL].sort());
    assert.equal(new Set(names).size, names.length);
    assert.ok(!names.includes("echo"), "the starter's example tool must be gone");
  });

  it("is wired in plugin.ts by the two register calls and nothing else", () => {
    const source = readText("src/plugin.ts");
    assert.match(source, /registerReadTools\(server\)/);
    assert.match(source, /registerDraftTools\(server\)/);
    assert.ok(!/registerTool\(/.test(source), "plugin.ts registers a tool of its own");
    assert.ok(!/echo/i.test(source));
  });

  it("keeps every tool schema compilable as JSON Schema 2020-12 and inside the runner's limits", async () => {
    const rpc = await connect();
    const tools = await listTools(rpc);
    const ajv = new Ajv2020({ strict: false, validateFormats: false });
    for (const tool of tools) {
      const input = tool["inputSchema"] as Obj;
      const output = tool["outputSchema"] as Obj;
      assert.equal(input["type"], "object", `${String(tool["name"])} input`);
      assert.ok(output, `${String(tool["name"])} has no output schema`);
      assert.doesNotThrow(() => ajv.compile(input), `${String(tool["name"])} input schema`);
      assert.doesNotThrow(() => ajv.compile(output), `${String(tool["name"])} output schema`);
      // Conformance limits: 64 KiB of schema per tool; stdout 256 KiB for the whole listing.
      assert.ok(JSON.stringify(input).length + JSON.stringify(output).length < 64 * 1024, String(tool["name"]));
    }
    assert.ok(JSON.stringify(tools).length < 128 * 1024, "tools/list payload is close to the 256 KiB stdout limit");
  });
});

describe("the conformance sample in paybox-plugin.json", () => {
  const sample = JSON.parse(readText("paybox-plugin.json")) as { tool: string; arguments: Obj };

  it("is the offline registry listing, which is not one of the network read tools and carries no invented input", async () => {
    assert.equal(sample.tool, LIST_VENUES_TOOL);
    assert.deepEqual(sample.arguments, {});
    assert.ok(!(READ_TOOL_NAMES as readonly string[]).includes(sample.tool));
    const tool = (await listTools(await connect({ withPm: true }))).find((entry) => entry["name"] === sample.tool);
    assert.ok(tool);
    assert.deepEqual(tool["annotations"], { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  });

  it("validates against the listed input schema and succeeds with no network at all", async () => {
    const rpc = await connect({ withPm: true });
    const tool = (await listTools(rpc)).find((entry) => entry["name"] === sample.tool) as Obj;
    const ajv = new Ajv2020({ strict: false, validateFormats: false });
    assert.equal(ajv.compile(tool["inputSchema"] as Obj)(sample.arguments), true);

    const realFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (() => {
      fetchCalls += 1;
      return Promise.reject(new Error("network use is not allowed by the conformance sample"));
    }) as typeof fetch;
    let result: Obj;
    try {
      result = (await rpc("tools/call", { name: sample.tool, arguments: sample.arguments }))["result"] as Obj;
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.equal(fetchCalls, 0);
    assert.notEqual(result["isError"], true, JSON.stringify(result));
    const validateOutput = ajv.compile(tool["outputSchema"] as Obj);
    assert.equal(validateOutput(result["structuredContent"]), true, JSON.stringify(validateOutput.errors));
  });

  it("is rejected by the same schema once an argument is wrong (the check has teeth)", async () => {
    const tool = (await listTools(await connect({ withPm: true }))).find((entry) => entry["name"] === sample.tool) as Obj;
    const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(tool["inputSchema"] as Obj);
    assert.equal(validate(sample.arguments), true);
    assert.equal(validate({ ...sample.arguments, unexpected: true }), false);
  });
});

// ---- values that two modules define independently ----

// Compares as strings, case-insensitively, so an address is equal however it is checksummed.
function disagreements(pairs: ReadonlyArray<readonly [string, unknown, unknown]>): string[] {
  return pairs.filter(([, a, b]) => String(a).toLowerCase() !== String(b).toLowerCase()).map(([label]) => label);
}

describe("guardrail constants and signing constants agree", () => {
  it("pins the same chain, contracts, domains and tick grid", () => {
    assert.deepEqual(
      disagreements([
        ["chain id", guard.XO_CHAIN_ID, signing.XO_CHAIN_ID],
        ["CTF Exchange", guard.CTF_EXCHANGE, signing.CTF_EXCHANGE_ADDRESS],
        ["order domain name", guard.ORDER_DOMAIN_NAME, signing.ORDER_DOMAIN_NAME],
        ["order domain version", guard.ORDER_DOMAIN_VERSION, signing.ORDER_DOMAIN_VERSION],
        ["order domain contract", guard.ORDER_DOMAIN.verifyingContract, signing.CTF_EXCHANGE_ADDRESS],
        ["order domain chain", guard.ORDER_DOMAIN.chainId, signing.XO_CHAIN_ID],
        ["kernel domain name", guard.KERNEL_DOMAIN_NAME, signing.KERNEL_DOMAIN_NAME],
        ["kernel domain version", guard.KERNEL_DOMAIN_VERSION, signing.KERNEL_DOMAIN_VERSION],
        ["kernel domain chain", guard.KERNEL_DOMAIN_BASE.chainId, signing.XO_CHAIN_ID],
        ["clob auth domain name", guard.CLOB_AUTH_DOMAIN_NAME, signing.CLOB_AUTH_DOMAIN_NAME],
        ["clob auth domain version", guard.CLOB_AUTH_DOMAIN_VERSION, signing.CLOB_AUTH_DOMAIN_VERSION],
        ["clob auth domain chain", guard.CLOB_AUTH_DOMAIN.chainId, signing.XO_CHAIN_ID],
        ["signature type", guard.SIGNATURE_TYPE_XO_SMART_ACCOUNT, signing.SIGNATURE_TYPE_XO_SMART_ACCOUNT],
        ["min tick", guard.MIN_PRICE_TICK, signing.MIN_TICK],
        ["max tick", guard.MAX_PRICE_TICK, signing.MAX_TICK],
        ["tick denominator", guard.PRICE_TICK_DENOMINATOR, signing.TICK_DENOMINATOR],
        ["micro per share", guard.SHARE_MICRO_PER_SHARE, signing.MICRO],
        ["atomic per USDC.e", guard.USDC_E_ATOMIC_PER_UNIT, signing.MICRO],
        ["read client micro unit", MICRO, signing.MICRO],
      ]),
      [],
    );
  });

  it("describes the wire signature as 1 prefix byte, a 20 byte validator and a 65 byte ECDSA signature", () => {
    assert.equal(guard.WIRE_SIGNATURE_BYTES, 1 + 20 + 65);
  });

  it("the comparison reports a mismatch, so drift in either module would fail", () => {
    assert.deepEqual(disagreements([["a", "0xAB", "0xab"]]), []);
    assert.deepEqual(disagreements([["chain", 3223, 3224], ["same", 1n, 1]]), ["chain"]);
    assert.deepEqual(disagreements([["contract", guard.CTF_EXCHANGE, guard.USDC_E_ADDRESS]]), ["contract"]);
  });
});

describe("the two decimal parsers agree on money", () => {
  // src/xo/units.ts (read client) tolerates extra fractional digits that are all zero;
  // src/guardrails/amount.ts (limit checks) rejects any extra digit. That is the only intended
  // difference, so a read-client amount never turns into a different number inside a guard.
  const wholes = ["0", "1", "7", "10", "123456789", "01", ""];
  const fractions = ["", "0", "5", "50", "123456", "1234567", "5000000", "0000000", "0000001"];
  const corpus: string[] = [
    "1e3", "-1", "+1", " 1", "1 ", "1\n", "0x10", "1,5", "1.", ".5", "1..5", "NaN", "Infinity", "1_000",
    // Fullwidth and Arabic-Indic digits, and a NUL: `\d`-style matching would let these through.
    String.fromCodePoint(0xff11), String.fromCodePoint(0x663), `0.5${String.fromCodePoint(0)}`,
  ];
  for (const whole of wholes) for (const fraction of fractions) corpus.push(fraction === "" ? whole : `${whole}.${fraction}`);

  it("accepts the same strings with the same value, except extra all-zero digits", () => {
    let both = 0;
    let onlyUnits = 0;
    for (const text of corpus) {
      const guarded = parseDecimalAtomic(text, 6);
      const read = parseDecimalToMicro(text);
      if (guarded.ok) {
        assert.equal(read, guarded.value, `value differs for ${JSON.stringify(text)}`);
        both += 1;
      } else if (read !== null) {
        const extra = (text.split(".")[1] ?? "").slice(6);
        assert.ok(extra.length > 0 && !/[1-9]/.test(extra), `read client accepts ${JSON.stringify(text)} but the guard rejects it`);
        onlyUnits += 1;
      }
    }
    assert.ok(both >= 20, `corpus too small (${both})`);
    assert.ok(onlyUnits >= 2, "the documented difference was not exercised");
  });

  it("neither parser rounds: an extra non-zero digit is rejected by both", () => {
    assert.equal(parseDecimalToMicro("0.1234567"), null);
    assert.equal(parseDecimalAtomic("0.1234567", 6).ok, false);
  });
});
