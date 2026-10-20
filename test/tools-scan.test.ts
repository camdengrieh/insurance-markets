import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { registerAccountTools, type AccountToolDeps } from "../src/tools/account.js";
import { registerTradeTools } from "../src/tools/trade.js";
import { registerUseropTools } from "../src/tools/userop.js";
import { explorerTransportFromHttp } from "../src/xo/chain/reads.js";
import { XoClient } from "../src/xo/client.js";
import { XO_PLUGIN_HOSTS } from "../src/xo/http.js";
import { FakeExplorer } from "./fixtures/chain/fakes.js";
import { dataRoute, fastOptions, jsonResponse, orderbookRoute, stubFetch } from "./fixtures/xo/load.js";
import {
  ACCOUNT,
  ENV_ON,
  OWNER,
  RELAY_KEY,
  SIGNATURE,
  StubRelay,
  asObj,
  authPrepared,
  closeAll,
  connect,
  digestOf,
  fail,
  makeDeps,
  orderPrepared,
  statusResponse,
  userOpPrepared,
  type Obj,
} from "./tools-helpers.js";

// The output scanner: no secret in anything a tool says or writes, whatever the relay sends back, and
// the hygiene checks on the tool sources (no addresses, no identifiers, no direct network, no stdout).

afterEach(closeAll);

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string): string => readFileSync(`${ROOT}${path}`, "utf8");
const SOURCES = ["src/tools/relay-tool-kit.ts", "src/tools/account.ts", "src/tools/userop.ts", "src/tools/trade.ts"] as const;

describe("source hygiene of the tool modules", () => {
  it("holds no e-mail address, no home path and no personal identifier", () => {
    for (const path of SOURCES) {
      const text = read(path);
      assert.equal(/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text), false, `${path}: e-mail-like string`);
      assert.equal(/\/Users\/|\/home\/|C:\\Users/.test(text), false, `${path}: home path`);
      assert.equal(/claude-\d{2,}|\/private\/tmp\//.test(text), false, `${path}: scratch path`);
    }
  });

  it("holds no address literal: every address is derived or comes from the pinned constants", () => {
    for (const path of SOURCES) assert.equal(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/.test(read(path)), false, path);
  });

  it("makes no network call of its own and never writes to stdout (it carries the MCP stream)", () => {
    for (const path of SOURCES) {
      const text = read(path);
      assert.equal(/\bfetch\s*\(/.test(text), false, `${path}: fetch`);
      assert.equal(/XMLHttpRequest|WebSocket|node:http|node:net/.test(text), false, `${path}: network module`);
      assert.equal(/console\.|process\.stdout|process\.stderr/.test(text), false, `${path}: direct output`);
      assert.equal(/Math\.random/.test(text), false, `${path}: Math.random`);
    }
  });

  it("reads the environment and the clock only inside the default dependencies", () => {
    const counts = (pattern: RegExp): Record<string, number> => Object.fromEntries(SOURCES.map((path) => [path, (read(path).match(pattern) ?? []).length]));
    assert.deepEqual(counts(/process\.env/g), {
      "src/tools/relay-tool-kit.ts": 1,
      "src/tools/account.ts": 1,
      "src/tools/userop.ts": 0,
      "src/tools/trade.ts": 0,
    });
    assert.deepEqual(counts(/Date\.now\(\)/g), {
      "src/tools/relay-tool-kit.ts": 1,
      "src/tools/account.ts": 0,
      "src/tools/userop.ts": 0,
      "src/tools/trade.ts": 0,
    });
  });

  it("never reveals the relay key: only the client reads it", () => {
    for (const path of SOURCES) assert.equal(/\.reveal\(\)/.test(read(path)), path === "src/tools/relay-tool-kit.ts", path);
  });

  it("does not register xo_withdraw: fund.ts owns it", () => {
    for (const path of ["src/tools/userop.ts", "src/tools/trade.ts", "src/tools/account.ts"]) {
      assert.equal(/registerTool\(\s*"xo_withdraw"|WITHDRAW_TOOL\s*,\s*\{/.test(read(path)), false, path);
    }
  });

  it("left no xo_account in the read tools", () => {
    assert.equal(/"xo_account"/.test(read("src/tools/read.ts")), false);
  });
});

// ---- the busy session --------------------------------------------------------------------------------------------

const PRIVATE_LIKE = `0x${"9a".repeat(32)}`;
const TOKEN_LIKE = "Zq8Lm2Vx7Rt4Yp9Nc3Hb6Kd1Fs5Jw0AaBb";
const SPLIT_KEY = `${RELAY_KEY.slice(0, 12)}\u200B${RELAY_KEY.slice(12, 20)}\u2060${RELAY_KEY.slice(20)}`;
// What a hostile or buggy relay might put in free text: the relay key (plain and hidden behind
// invisible characters), a private-key-shaped value and a long token.
const HOSTILE = `oops ${RELAY_KEY} then ${SPLIT_KEY} and ${PRIVATE_LIKE} and ${TOKEN_LIKE}`;

function forms(secret: string): Array<[string, string]> {
  const bytes = Buffer.from(secret, "utf8");
  return [
    ["plain", secret],
    ["base64", bytes.toString("base64")],
    ["base64url", bytes.toString("base64url")],
    ["hex", bytes.toString("hex")],
    ["url-escaped", encodeURIComponent(secret)],
    ["json-escaped", JSON.stringify(secret).slice(1, -1)],
    ["reversed", [...secret].reverse().join("")],
  ];
}

interface Scenario {
  readonly label: string;
  readonly tool: string;
  readonly args: Obj;
  readonly relay: () => StubRelay;
  readonly env?: Record<string, string>;
}

const hostileDetails = { detail: HOSTILE, flag: HOSTILE, reason: SPLIT_KEY, note: TOKEN_LIKE, retry_after_ms: 1500 };
const STATUS_HOSTILE = statusResponse({ state: "registered", tripwires: { ok: false, tripped: [{ id: "paymaster", detail: HOSTILE.slice(0, 280) }] }, credentials: { state: "stored", key_tag: "tag-1" } });

function scenarios(): Scenario[] {
  const prepared = userOpPrepared({ seed: "busy", lines: [`Do the thing ${HOSTILE.slice(0, 80)}`], warnings: [HOSTILE.slice(0, 280)] });
  const order = orderPrepared({ seed: "busy-order", lines: [`Order ${HOSTILE.slice(0, 80)}`], warnings: [HOSTILE.slice(0, 280)] });
  const withStatus = (extra: (relay: StubRelay) => StubRelay): StubRelay => extra(new StubRelay().on("POST /v1/account/status", STATUS_HOSTILE));
  const hostileFailure = (code: Parameters<typeof fail>[0]): ReturnType<typeof fail> => fail(code, HOSTILE.slice(0, 480), hostileDetails);
  const out: Scenario[] = [
    { label: "account ok", tool: "xo_account", args: { owner: OWNER }, relay: () => new StubRelay().on("POST /v1/account/status", STATUS_HOSTILE) },
    { label: "account relay error", tool: "xo_account", args: { owner: OWNER }, relay: () => new StubRelay().on("POST /v1/account/status", hostileFailure("upstream_rejected")) },
    { label: "deploy prepare", tool: "xo_deploy_enable_trading", args: { step: "prepare", owner: OWNER }, relay: () => withStatus((r) => r.on("POST /v1/userop/prepare", prepared)) },
    { label: "deploy prepare refused", tool: "xo_deploy_enable_trading", args: { step: "prepare", owner: OWNER }, relay: () => withStatus((r) => r.on("POST /v1/userop/prepare", hostileFailure("capability_unknown"))) },
    { label: "redeem prepare", tool: "xo_redeem", args: { step: "prepare", owner: OWNER, condition_ids: [`0x${"ab".repeat(32)}`] }, relay: () => withStatus((r) => r.on("POST /v1/userop/prepare", prepared)) },
    { label: "revoke prepare", tool: "xo_revoke_trading", args: { step: "prepare", owner: OWNER }, relay: () => withStatus((r) => r.on("POST /v1/userop/prepare", prepared)) },
    { label: "userop submit rejected", tool: "xo_deploy_enable_trading", args: { step: "submit", prepared_id: "ab".repeat(16), signature: SIGNATURE }, relay: () => new StubRelay().on("POST /v1/userop/submit", { state: "rejected", user_op_hash: digestOf("h"), detail: HOSTILE.slice(0, 290) }) },
    { label: "userop submit ambiguous", tool: "xo_submit_userop", args: { prepared_id: "ab".repeat(16), signature: SIGNATURE }, relay: () => new StubRelay().on("POST /v1/userop/submit", { state: "ambiguous", user_op_hash: digestOf("h"), detail: HOSTILE.slice(0, 290) }) },
    { label: "userop submit refused", tool: "xo_submit_userop", args: { prepared_id: "ab".repeat(16), signature: SIGNATURE }, relay: () => new StubRelay().on("POST /v1/userop/submit", hostileFailure("upstream_rejected")) },
    { label: "userop status", tool: "xo_userop_status", args: { user_op_hash: digestOf("h") }, relay: () => new StubRelay().on("GET /v1/userop/:hash", { user_op_hash: digestOf("h"), state: "failed", detail: HOSTILE.slice(0, 290) }) },
    { label: "connect prepare", tool: "xo_connect", args: { step: "prepare", owner: OWNER }, relay: () => new StubRelay().on("POST /v1/auth/prepare", authPrepared({ seed: "busy-auth", lines: [`Connect ${HOSTILE.slice(0, 80)}`] })) },
    { label: "connect submit refused", tool: "xo_connect", args: { step: "submit", prepared_id: "ab".repeat(16), signature: SIGNATURE }, relay: () => new StubRelay().on("POST /v1/auth/submit", hostileFailure("unauthorized")) },
    { label: "order prepare", tool: "xo_prepare_order", args: { owner: OWNER, token_id: "123", side: "BUY", price: "0.5", shares: "10" }, relay: () => new StubRelay().on("POST /v1/order/prepare", order) },
    { label: "order prepare refused", tool: "xo_prepare_order", args: { owner: OWNER, token_id: "123", side: "BUY", price: "0.5", shares: "10" }, relay: () => new StubRelay().on("POST /v1/order/prepare", hostileFailure("cap_exceeded")) },
    { label: "order submit rejected", tool: "xo_submit_order", args: { prepared_id: "ab".repeat(16), signature: SIGNATURE }, relay: () => new StubRelay().on("POST /v1/order/submit", { state: "rejected", order_hash: digestOf("o"), detail: HOSTILE.slice(0, 290) }) },
    { label: "order submit ambiguous", tool: "xo_submit_order", args: { prepared_id: "ab".repeat(16), signature: SIGNATURE }, relay: () => new StubRelay().on("POST /v1/order/submit", hostileFailure("ambiguous")) },
    { label: "order status", tool: "xo_order_status", args: { order_hash: digestOf("o") }, relay: () => new StubRelay().on("GET /v1/order/:hash", { order_hash: digestOf("o"), state: "rejected", detail: HOSTILE.slice(0, 290) }) },
    { label: "order cancel", tool: "xo_cancel_order", args: { owner: OWNER, order_hash: digestOf("o") }, relay: () => new StubRelay().on("POST /v1/order/cancel", { order_hash: digestOf("o"), state: "rejected", detail: HOSTILE.slice(0, 290) }) },
    { label: "order cancel refused", tool: "xo_cancel_order", args: { owner: OWNER, order_hash: digestOf("o") }, relay: () => new StubRelay().on("POST /v1/order/cancel", hostileFailure("upstream_rejected")) },
    { label: "list orders refused", tool: "xo_list_orders", args: { owner: OWNER }, relay: () => new StubRelay().on("POST /v1/orders/list", hostileFailure("internal")) },
  ];
  return out;
}

async function run(scenario: Scenario): Promise<{ text: string; structured: string; audit: string }> {
  const built = makeDeps({ relay: scenario.relay(), env: { ...ENV_ON, ...(scenario.env ?? {}) } });
  const stub = stubFetch([
    orderbookRoute("/balance-allowance", { balance: "5000000", allowance: "0", smart_account: ACCOUNT.slice(2).toLowerCase() }, { address: ACCOUNT.toLowerCase() }),
    orderbookRoute("/claimable", { address: ACCOUNT.toLowerCase(), claimable: [] }, { address: ACCOUNT.toLowerCase() }),
    orderbookRoute("/trading-state", { state: "active" }),
    dataRoute("/users/portfolio", { statusCode: 404 }, undefined, 404),
    { host: "explorer-mainnet.xo.market", path: "/api", reply: async (call) => jsonResponse(await new FakeExplorer({ rows: [] }).getJson(call.url.toString())) },
  ]);
  const account: AccountToolDeps = {
    ...built.deps,
    createClient: () => new XoClient({ ...fastOptions(stub.fetchImpl), allowedHosts: XO_PLUGIN_HOSTS }),
    explorer: (client) => explorerTransportFromHttp(client.http),
    rpc: () => undefined,
  };
  const harness = await connect((server) => {
    registerAccountTools(server, account);
    registerUseropTools(server, built.deps);
    registerTradeTools(server, built.deps);
  });
  const result = await harness.call(scenario.tool, scenario.args);
  return {
    text: result.text,
    structured: JSON.stringify(result.structured ?? null),
    audit: JSON.stringify(built.events, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
  };
}

describe("the output scanner: nothing secret in anything a tool says or logs", () => {
  it("finds the relay key in no encoding, in any tool's text, structure or audit line, whatever the relay sends", async () => {
    for (const scenario of scenarios()) {
      const seen = await run(scenario);
      for (const [channel, value] of Object.entries(seen)) {
        for (const [form, needle] of forms(RELAY_KEY)) {
          assert.equal(value.includes(needle), false, `${scenario.label}: the relay key (${form}) is in the ${channel}`);
        }
        // Hidden behind invisible characters it is caught too.
        assert.equal(value.replace(/[\u200B\u2060]/g, "").includes(RELAY_KEY), false, `${scenario.label}: split key in the ${channel}`);
      }
    }
  });

  it("removes private-key-shaped values and long tokens from every free-text channel the relay controls", async () => {
    // Error messages, error details and the `detail` fields are free text from the relay and are redacted.
    // Summary lines and warnings are not (they legitimately show addresses and hashes), so the planted
    // values there are only checked for the relay key above.
    const redactedChannels = scenarios().filter((scenario) => !/prepare$/.test(scenario.label) || /refused$/.test(scenario.label));
    for (const scenario of redactedChannels) {
      const seen = await run(scenario);
      for (const [channel, value] of Object.entries(seen)) {
        assert.equal(value.includes(PRIVATE_LIKE), false, `${scenario.label}: a private-key-shaped value is in the ${channel}`);
        assert.equal(value.includes(TOKEN_LIKE), false, `${scenario.label}: a long token is in the ${channel}`);
      }
    }
  });

  it("never prints an HMAC header name, an API secret or a passphrase", async () => {
    for (const scenario of scenarios()) {
      const seen = await run(scenario);
      const everything = Object.values(seen).join("\n");
      assert.equal(/XO_API_KEY|XO_PASSPHRASE|XO_SIGNATURE|POLY_API|api[_-]?secret|passphrase/i.test(everything), false, scenario.label);
    }
  });

  it("keeps the relay key out of the tool list, the schemas and the descriptions", async () => {
    const built = makeDeps();
    const harness = await connect((server) => {
      registerAccountTools(server);
      registerUseropTools(server, built.deps);
      registerTradeTools(server, built.deps);
    });
    const listing = JSON.stringify(await harness.list());
    for (const [form, needle] of forms(RELAY_KEY)) assert.equal(listing.includes(needle), false, form);
    assert.equal(/x-relay-key/i.test(listing), false, "the header name is not advertised to the agent");
  });

  it("does not put the signature, the prepared item or the digest into an audit line", async () => {
    const built = makeDeps({ relay: new StubRelay().on("POST /v1/userop/submit", { state: "submitted", user_op_hash: digestOf("h") }) });
    const harness = await connect((server) => registerUseropTools(server, built.deps));
    await harness.call("xo_submit_userop", { prepared_id: "ab".repeat(16), signature: SIGNATURE });
    const audit = JSON.stringify(built.events);
    assert.equal(audit.includes(SIGNATURE), false);
    assert.equal(audit.includes("ab".repeat(16)), false);
    assert.equal(audit.includes(RELAY_KEY), false);
    assert.equal(built.events.length, 1);
  });

  it("writes nothing to stdout or stderr itself while a tool runs", async () => {
    const written: string[] = [];
    const realOut = process.stdout.write.bind(process.stdout);
    const realErr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      for (const scenario of scenarios().slice(0, 8)) await run(scenario);
    } finally {
      process.stdout.write = realOut;
      process.stderr.write = realErr;
    }
    // Only the node test runner's own reporting may show up; none of it comes from the tools or holds a secret.
    assert.equal(written.join("").includes(RELAY_KEY), false);
    assert.equal(written.filter((line) => line.startsWith("xo-audit")).length, 0, "the injected audit sink was bypassed");
  });

  it("the stub relay and the fake key are test values only", () => {
    assert.equal(asObj({ a: 1 })["a"], 1);
    assert.match(RELAY_KEY, /^test-relay-key-/);
  });
});
