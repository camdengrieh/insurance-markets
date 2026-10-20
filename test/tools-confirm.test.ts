import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { SAFETY_NOTICES } from "../src/relay/contract.js";
import { registerAccountTools } from "../src/tools/account.js";
import { registerCreateTools } from "../src/tools/create.js";
import { registerDraftTools } from "../src/tools/draft.js";
import { registerFundTools } from "../src/tools/fund.js";
import { registerReadTools } from "../src/tools/read.js";
import {
  PreparedMemory,
  SUBMIT_CONFIRM_KEY,
  clientTakesFormElicitation,
  confirmationText,
  type RelayToolDeps,
} from "../src/tools/relay-tool-kit.js";
import { registerTradeTools } from "../src/tools/trade.js";
import { registerUseropTools } from "../src/tools/userop.js";
import { verifiedDeployItem } from "./tools-decoded-helpers.js";
import { ENV_ON, SIGNATURE, StubRelay, asObj, digestOf, makeDeps, must, orderPrepared, statusResponse, type Obj } from "./tools-helpers.js";

// R3 (requiresUserInteraction) and R4 (the user's yes before a submit), on the real SDK.
//
// R3 is a marker in each tool's _meta. R4 is an input_required result with a form elicitation, returned by the
// submit tools only when the client says it can take one, and only for an item this process showed earlier.

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()?.();
});

type Handler = (message: Obj) => Obj | undefined;

interface Session {
  request(method: string, params: Obj): Promise<Obj>;
  call(name: string, args: Obj, extra?: Obj): Promise<Obj>;
}

// A bare JSON-RPC peer over the in-memory transport. `modern` speaks the 2026-07-28 per-request envelope; otherwise it
// opens with initialize, like Claude Code does, and answers the server's own elicitation request through `onServerRequest`.
async function session(register: (server: McpServer) => void, options: { capabilities: Obj; modern: boolean; onServerRequest?: Handler }): Promise<Session & { serverRequests: Obj[] }> {
  // Served the way the real entry points serve: serveStdio decides the era from the opening message and pins one server
  // for the connection. The hosted plugin (src/plugin.ts) rejects the 2025 form; the local server (src/local) serves both.
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(
    () => {
      const server = new McpServer({ name: "xo-market", version: "0.1.0" }, options.modern ? { supportedProtocolVersions: ["2026-07-28"] } : {});
      register(server);
      return server;
    },
    { transport: serverSide, legacy: options.modern ? "reject" : "serve" },
  );
  const pending = new Map<number, (message: Obj) => void>();
  const serverRequests: Obj[] = [];
  clientSide.onmessage = (raw) => {
    const message = raw as unknown as Obj;
    const id = message["id"] as number | undefined;
    if (typeof message["method"] === "string") {
      serverRequests.push(message);
      const answer = options.onServerRequest?.(message);
      if (answer !== undefined && id !== undefined) void clientSide.send({ jsonrpc: "2.0", id, result: answer } as never);
      return;
    }
    if (id !== undefined) pending.get(id)?.(message);
  };
  await clientSide.start();
  closers.push(async () => {
    await clientSide.close();
    await handle.close();
  });
  let nextId = 1;
  const send = (method: string, params: Obj): Promise<Obj> => {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      void clientSide.send({ jsonrpc: "2.0", id, method, params } as never);
    });
  };
  const envelope: Obj = options.modern
    ? {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": { name: "tools-confirm-test", version: "0" },
        "io.modelcontextprotocol/clientCapabilities": options.capabilities,
      }
    : {};
  if (!options.modern) {
    const init = await send("initialize", { protocolVersion: "2025-06-18", capabilities: options.capabilities, clientInfo: { name: "tools-confirm-test", version: "0" } });
    assert.ok(init["result"], JSON.stringify(init));
    void clientSide.send({ jsonrpc: "2.0", method: "notifications/initialized" } as never);
  }
  return {
    serverRequests,
    request: (method, params) => send(method, { ...params, ...(options.modern ? { _meta: envelope } : {}) }),
    call: (name, args, extra = {}) => send("tools/call", { name, arguments: args, ...extra, ...(options.modern ? { _meta: envelope } : {}) }),
  };
}

const FORM = { elicitation: { form: {} } };
const ID = "00112233445566778899aabbccddeeff";
const submitBody = { step: "submit", prepared_id: ID, signature: SIGNATURE };
const HASH = digestOf("op-hash");

// A fresh memory per rig unless the test passes one: the process-wide default would carry an item from one test to the next.
function plugin(deps: RelayToolDeps) {
  const own: RelayToolDeps = deps.preparedMemory === undefined ? { ...deps, preparedMemory: new PreparedMemory() } : deps;
  return (server: McpServer): void => {
    registerUseropTools(server, own);
    registerTradeTools(server, own);
  };
}

function relayWith(item: Obj): StubRelay {
  return new StubRelay()
    .on("POST /v1/account/status", statusResponse({ state: "undeployed" }))
    .on("POST /v1/userop/prepare", item)
    .on("POST /v1/userop/submit", { state: "submitted", user_op_hash: HASH });
}

const resultOf = (response: Obj): Obj => must(response["result"] as Obj | undefined, `result of ${JSON.stringify(response).slice(0, 200)}`);

async function prepareDeploy(s: Session): Promise<void> {
  const prepared = resultOf(await s.call("xo_deploy_enable_trading", { step: "prepare", owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" }));
  assert.notEqual(prepared["isError"], true, JSON.stringify(prepared["content"]));
}

describe("R3: requiresUserInteraction", () => {
  const MARKED = [
    "xo_connect",
    "xo_deploy_enable_trading",
    "xo_revoke_trading",
    "xo_redeem",
    "xo_submit_userop",
    "xo_prepare_order",
    "xo_submit_order",
    "xo_fund_account",
    "xo_withdraw",
    "xo_prepare_create_market",
    "xo_submit_create_market",
    "xo_respond_update",
    "xo_cancel_market",
    "xo_place_seed",
  ];

  it("is set on exactly the prepare, submit, connect, fund, withdraw and create tools, and on nothing that only reads", async () => {
    const built = makeDeps();
    const s = await session(
      (server) => {
        registerReadTools(server);
        registerDraftTools(server);
        registerAccountTools(server, { ...built.deps, createClient: () => { throw new Error("unused"); }, explorer: () => { throw new Error("unused"); }, rpc: () => undefined });
        registerUseropTools(server, built.deps);
        registerTradeTools(server, built.deps);
        registerFundTools(server);
        registerCreateTools(server);
      },
      { capabilities: {}, modern: true },
    );
    const tools = (resultOf(await s.request("tools/list", {}))["tools"] as Obj[]) ?? [];
    const marked = tools.filter((tool) => asObj(tool["_meta"] ?? {})["anthropic/requiresUserInteraction"] === true).map((tool) => String(tool["name"])).sort();
    assert.deepEqual(marked, [...MARKED].sort());
    for (const tool of tools) {
      const name = String(tool["name"]);
      const annotations = asObj(tool["annotations"]);
      if (annotations["readOnlyHint"] === true) assert.equal(marked.includes(name), false, `${name} only reads`);
      else if (name !== "xo_cancel_order") assert.equal(marked.includes(name), true, `${name} can write`);
    }
    // The marker is exactly the documented key and value, nothing else rides along.
    const connect = must(tools.find((tool) => tool["name"] === "xo_connect"));
    assert.deepEqual(asObj(connect["_meta"]), { "anthropic/requiresUserInteraction": true });
  });
});

describe("R4: does the client take a form elicitation?", () => {
  const ctx = (envelope: Obj | undefined) => ({ mcpReq: { envelope } }) as never;
  const KEY = "io.modelcontextprotocol/clientCapabilities";
  it("reads the request envelope first and the initialize result as a fallback", () => {
    assert.equal(clientTakesFormElicitation(ctx({ [KEY]: { elicitation: { form: {} } } })), true);
    assert.equal(clientTakesFormElicitation(ctx({ [KEY]: { elicitation: {} } })), true, "a bare elicitation counts as form");
    assert.equal(clientTakesFormElicitation(ctx({ [KEY]: { elicitation: { url: {} } } })), false, "url-only is not a form");
    assert.equal(clientTakesFormElicitation(ctx({ [KEY]: {} })), false);
    assert.equal(clientTakesFormElicitation(ctx({ [KEY]: { elicitation: "yes" } })), false);
    assert.equal(clientTakesFormElicitation(ctx(undefined)), false);
    assert.equal(clientTakesFormElicitation(ctx(undefined), () => ({ elicitation: { form: {} } })), true);
    assert.equal(clientTakesFormElicitation(ctx(undefined), () => undefined), false);
    assert.equal(
      clientTakesFormElicitation(ctx(undefined), () => {
        throw new Error("boom");
      }),
      false,
    );
  });
});

describe("R4: a client that cannot elicit is never blocked", () => {
  for (const modern of [true, false]) {
    it(`${modern ? "2026-07-28" : "2025 initialize"} era: submit goes straight to the relay`, async () => {
      const built = makeDeps({ relay: relayWith(verifiedDeployItem()) });
      const s = await session(plugin(built.deps), { capabilities: {}, modern });
      await prepareDeploy(s);
      const result = resultOf(await s.call("xo_deploy_enable_trading", submitBody));
      assert.notEqual(result["resultType"], "input_required");
      assert.equal(asObj(result["structuredContent"])["outcome"], "submitted");
      assert.equal(built.relay.callsTo("POST /v1/userop/submit").length, 1);
      assert.equal(s.serverRequests.length, 0);
    });
  }
});

describe("R4: a client that can elicit is asked, in words the plugin wrote from what it vetted", () => {
  it("2026-07-28: the first submit returns input_required with the summary and both tags, and sends nothing", async () => {
    const item = verifiedDeployItem();
    const built = makeDeps({ relay: relayWith(item) });
    const s = await session(plugin(built.deps), { capabilities: FORM, modern: true });
    await prepareDeploy(s);
    const first = resultOf(await s.call("xo_deploy_enable_trading", submitBody));
    assert.equal(first["resultType"], "input_required");
    const requests = asObj(first["inputRequests"]);
    assert.deepEqual(Object.keys(requests), [SUBMIT_CONFIRM_KEY]);
    const request = asObj(requests[SUBMIT_CONFIRM_KEY]);
    assert.equal(request["method"], "elicitation/create");
    const params = asObj(request["params"]);
    const message = String(params["message"]);
    const summary = asObj(item["summary"]);
    for (const line of summary["lines"] as string[]) assert.ok(message.includes(line.slice(0, 80)), line.slice(0, 40));
    assert.ok(message.includes(String(summary["digest_tag"])));
    assert.ok(message.includes(String(summary["inner_hash_tag"])));
    assert.ok(message.includes(ID));
    assert.ok(message.includes("Rebuilt and checked here: yes"));
    assert.ok(message.includes(SAFETY_NOTICES.advisoryCaps));
    const schema = asObj(params["requestedSchema"]);
    assert.deepEqual(Object.keys(asObj(schema["properties"])), ["confirm"]);
    assert.deepEqual(schema["required"], ["confirm"]);
    assert.equal(built.relay.callsTo("POST /v1/userop/submit").length, 0, "nothing was sent while the user was being asked");
  });

  it("2026-07-28: an accepted answer sends it once; a decline, a cancel and confirm false send nothing", async () => {
    const answers: Array<[string, Obj, boolean]> = [
      ["accept with confirm true", { action: "accept", content: { confirm: true } }, true],
      ["accept with confirm false", { action: "accept", content: { confirm: false } }, false],
      ["accept with confirm as text", { action: "accept", content: { confirm: "true" } }, false],
      ["accept without content", { action: "accept" }, false],
      ["decline", { action: "decline" }, false],
      ["cancel", { action: "cancel" }, false],
    ];
    for (const [label, answer, goesOn] of answers) {
      const built = makeDeps({ relay: relayWith(verifiedDeployItem()) });
      const s = await session(plugin(built.deps), { capabilities: FORM, modern: true });
      await prepareDeploy(s);
      const retry = resultOf(await s.call("xo_deploy_enable_trading", submitBody, { inputResponses: { [SUBMIT_CONFIRM_KEY]: answer } }));
      const sent = built.relay.callsTo("POST /v1/userop/submit").length;
      if (goesOn) {
        assert.equal(asObj(retry["structuredContent"])["outcome"], "submitted", label);
        assert.equal(sent, 1, label);
      } else {
        assert.equal(retry["isError"], true, label);
        assert.equal(asObj(retry["structuredContent"])["code"], "user_declined", label);
        assert.match(String(asObj((retry["content"] as Obj[])[0])["text"]), /Nothing was signed or sent/, label);
        assert.equal(sent, 0, label);
      }
    }
  });

  it("a made-up answer under another key does not count as a yes", async () => {
    const built = makeDeps({ relay: relayWith(verifiedDeployItem()) });
    const s = await session(plugin(built.deps), { capabilities: FORM, modern: true });
    await prepareDeploy(s);
    const result = resultOf(await s.call("xo_deploy_enable_trading", submitBody, { inputResponses: { other: { action: "accept", content: { confirm: true } } } }));
    assert.equal(result["resultType"], "input_required", "asked again, as if nothing had been answered");
    assert.equal(built.relay.callsTo("POST /v1/userop/submit").length, 0);
  });

  it("2025 era (initialize): the SDK asks the client through elicitation/create, and the answer decides", async () => {
    for (const [answer, sends] of [
      [{ action: "accept", content: { confirm: true } }, 1],
      [{ action: "decline" }, 0],
    ] as const) {
      const built = makeDeps({ relay: relayWith(verifiedDeployItem()) });
      const s = await session(plugin(built.deps), {
        capabilities: FORM,
        modern: false,
        onServerRequest: (message) => (message["method"] === "elicitation/create" ? { ...answer } : undefined),
      });
      await prepareDeploy(s);
      const result = resultOf(await s.call("xo_deploy_enable_trading", submitBody));
      assert.equal(s.serverRequests.filter((message) => message["method"] === "elicitation/create").length, 1);
      const asked = asObj(asObj(s.serverRequests.find((message) => message["method"] === "elicitation/create"))["params"]);
      assert.ok(String(asked["message"]).includes(ID));
      assert.equal(built.relay.callsTo("POST /v1/userop/submit").length, sends);
      if (sends === 1) assert.equal(asObj(result["structuredContent"])["outcome"], "submitted");
      else assert.equal(asObj(result["structuredContent"])["code"], "user_declined");
    }
  });

  it("does not ask when this process never saw the item (a fresh start): the relay still checks everything", async () => {
    const built = makeDeps({ relay: relayWith(verifiedDeployItem()) });
    const s = await session(plugin(built.deps), { capabilities: FORM, modern: true });
    const result = resultOf(await s.call("xo_deploy_enable_trading", submitBody));
    assert.notEqual(result["resultType"], "input_required");
    assert.equal(asObj(result["structuredContent"])["outcome"], "submitted");
  });

  it("does not ask when a switch is off or the kill switch is on: the refusal comes first", async () => {
    for (const env of [{ ...ENV_ON, ENABLE_USEROP_SUBMIT: "0" }, { ...ENV_ON, XO_KILL_SWITCH: "1" }]) {
      const memory = new PreparedMemory();
      const on = makeDeps({ relay: relayWith(verifiedDeployItem()) });
      const prep = await session(plugin({ ...on.deps, preparedMemory: memory }), { capabilities: FORM, modern: true });
      await prepareDeploy(prep);
      const off = makeDeps({ env, relay: relayWith(verifiedDeployItem()) });
      const s = await session(plugin({ ...off.deps, preparedMemory: memory }), { capabilities: FORM, modern: true });
      const result = resultOf(await s.call("xo_deploy_enable_trading", submitBody));
      assert.notEqual(result["resultType"], "input_required");
      assert.equal(result["isError"], true);
      assert.match(String(asObj(result["structuredContent"])["code"]), /flag_off|kill_switch/);
      assert.equal(off.relay.calls.length, 0);
    }
  });

  it("forgets an item once it has expired", async () => {
    let now = 0;
    const built = makeDeps({ nowMs: () => now, relay: relayWith(verifiedDeployItem()) });
    now = Date.parse("2026-10-19T12:00:00Z");
    const s = await session(plugin({ ...built.deps, nowMs: () => now }), { capabilities: FORM, modern: true });
    await prepareDeploy(s);
    now += 301_000;
    const result = resultOf(await s.call("xo_deploy_enable_trading", submitBody));
    assert.notEqual(result["resultType"], "input_required", "an expired item is not asked about; the relay refuses it");
  });

  it("asks for xo_submit_userop and xo_submit_order too, and only on a submit", async () => {
    const order = { ...orderPrepared({ seed: "confirm-order" }), prepared_id: ID };
    const relay = new StubRelay().on("POST /v1/order/prepare", order).on("POST /v1/order/submit", { state: "accepted", order_hash: digestOf("order") });
    const built = makeDeps({ relay });
    const s = await session(plugin(built.deps), { capabilities: FORM, modern: true });
    const prepared = resultOf(await s.call("xo_prepare_order", { owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", token_id: "123", side: "BUY", price: "0.5", shares: "10" }));
    assert.notEqual(prepared["resultType"], "input_required", "a prepare never asks");
    assert.notEqual(prepared["isError"], true, JSON.stringify(prepared["content"]));
    const asked = resultOf(await s.call("xo_submit_order", { prepared_id: ID, signature: SIGNATURE }));
    assert.equal(asked["resultType"], "input_required");
    const message = String(asObj(asObj(asObj(asked["inputRequests"])[SUBMIT_CONFIRM_KEY])["params"])["message"]);
    assert.ok(message.includes("Rebuilt and checked here: NO"), "an item with no decoded block is said to be unchecked");
    assert.equal(relay.callsTo("POST /v1/order/submit").length, 0);
    const done = resultOf(await s.call("xo_submit_order", { prepared_id: ID, signature: SIGNATURE }, { inputResponses: { [SUBMIT_CONFIRM_KEY]: { action: "accept", content: { confirm: true } } } }));
    assert.equal(asObj(done["structuredContent"])["outcome"], "accepted");
    assert.equal(relay.callsTo("POST /v1/order/submit").length, 1);
  });
});

describe("R4: the confirmation text", () => {
  it("is bounded: long summaries are cut and counted", () => {
    const lines = Array.from({ length: 30 }, (_, index) => `Line ${index} ${"x".repeat(400)}`);
    const text = confirmationText("xo_submit_userop", {
      prepared_id: ID,
      kind: "userop",
      owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      account: "0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d",
      expiresAtMs: 1,
      lines,
      digestTag: "0123456789abcdef",
      innerTag: null,
      verification: "unverified",
      reservedUsd: "0",
    });
    assert.ok(text.includes("(18 more lines not shown)"));
    assert.ok(text.length < 5_000, `${text.length} characters`);
    assert.ok(text.includes("NO, nothing was independently checked"));
    assert.equal(text.includes("inner_hash_tag"), false);
  });
});

describe("the memory behind the confirmation", () => {
  it("is bounded and drops the oldest item first", () => {
    const memory = new PreparedMemory();
    const item = (n: number) => ({
      prepared_id: n.toString(16).padStart(32, "0"),
      kind: "userop" as const,
      owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      account: "0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d",
      expiresAtMs: 10_000,
      lines: ["x"],
      digestTag: "0123456789abcdef",
      innerTag: null,
      verification: "verified" as const,
      reservedUsd: "0",
    });
    for (let n = 0; n < 100; n += 1) memory.remember(item(n));
    assert.equal(memory.size, 32);
    assert.equal(memory.recall(item(0).prepared_id, 0), undefined);
    assert.ok(memory.recall(item(99).prepared_id, 0));
    assert.equal(memory.recall(item(99).prepared_id, 10_000), undefined, "expired");
    assert.equal(memory.size, 31);
  });
});
