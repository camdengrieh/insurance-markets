import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import { getAddress } from "viem";

import { buildDecodedClobAuth, buildDecodedClobOrder, rebuildClobAuth, rebuildClobOrder } from "../src/clob/decoded.js";
import { clobCapAmount, computeClobAmounts } from "../src/clob/amounts.js";
import { LIMITLESS_EXCHANGES, POLYMARKET_EXCHANGES } from "../src/clob/venues.js";
import { SAFETY_NOTICES, digestTag } from "../src/relay/contract.js";
import { APPROVAL_RECOMMENDED, DECODED_NOTICE } from "../src/tools/relay-tool-kit.js";
import { CLOB_AUTH_TOOL, CLOB_ORDER_TOOL, handleClobAuth, handleClobOrder, registerClobTools } from "../src/tools/clob.js";
import { ZERO_ADDRESS, ZERO_BYTES32 } from "../src/xo/signing/constants.js";
import { NOW, OWNER, SIGNATURE, asObj, closeAll, connect, isoSecond, makeDeps, must, ok, validateAgainstTool, type Obj } from "./tools-helpers.js";

// The two CLOB venue tools against the stub relay: their schemas and wording (with a snapshot of their own, since the
// plugin's snapshot test keeps the hosted set), the flag gate, and the prepare and submit flows with items the real
// builders produced (so the plugin's rebuild check sees a true decoded block). To accept a deliberate schema change:
//   UPDATE_TOOL_SNAPSHOTS=1 tsx --test test/tools-clob.test.ts

afterEach(closeAll);

const SNAPSHOT_URL = new URL("./fixtures/tools/clob-schema-snapshot.json", import.meta.url);
const TOOLS = [CLOB_ORDER_TOOL, CLOB_AUTH_TOOL] as const;
const ENV_CLOB = Object.freeze({ XO_RELAY_URL: "http://127.0.0.1:8787", XO_RELAY_KEY: "test-relay-key-AbCdEf0123456789-XYZ", ENABLE_CLOB_POLYMARKET: "1", ENABLE_CLOB_LIMITLESS: "1" });
const CONDITION = "0x99b2ff7bfebd5e3dd1bd4d0d3d632e09e52b4451653d52eb3be5df917b936cc5";
const TOKEN = "74611051635435493013469257818411865069553882173471237703549469284847187679089";
const ID = "0123456789abcdef0123456789abcdef";

const sha256 = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value as Obj).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortKeys(item)]));
  return value;
}
function snapshotOf(tool: Obj): Obj {
  const output = asObj(tool["outputSchema"]);
  return {
    title: tool["title"],
    annotations: sortKeys(tool["annotations"]),
    meta: sortKeys(tool["_meta"] ?? null),
    description_sha256: createHash("sha256").update(String(tool["description"])).digest("hex"),
    input: sortKeys(tool["inputSchema"]),
    output: { sha256: sha256(sortKeys(output)), properties: Object.keys(asObj(output["properties"])).sort(), required: [...((output["required"] as string[] | undefined) ?? [])].sort() },
  };
}

// A Polymarket order item exactly as the relay would build it (same builders), so the plugin's rebuild passes.
function polymarketPrepared(over: { readonly side?: "BUY" | "SELL"; readonly tif?: "GTC" | "GTD" } = {}): Obj {
  const owner = getAddress(OWNER);
  const side = over.side === "SELL" ? 1 : 0;
  const amounts = computeClobAmounts({ side, price: "0.52", shares: "10", grid: { tick: "0.01", priceDecimals: 2 }, sizeDecimals: 2, minSharesMicro: 5_000_000n });
  const cap = clobCapAmount(amounts);
  const tif = over.tif ?? "GTD";
  const expiration = tif === "GTD" ? 1792411500n : 0n;
  const decoded = buildDecodedClobOrder({
    owner,
    amounts,
    feeBps: cap.feeBps,
    tif,
    postOnly: false,
    ttlS: tif === "GTD" ? 300 : null,
    marketId: CONDITION,
    tick: "0.01",
    minSize: "5",
    order: {
      venue: "polymarket",
      expiration,
      domain: { version: POLYMARKET_EXCHANGES.v2.version, verifyingContract: POLYMARKET_EXCHANGES.v2.verifyingContract },
      order: { salt: 777n, maker: owner, signer: owner, tokenId: BigInt(TOKEN), makerAmount: amounts.makerAmount, takerAmount: amounts.takerAmount, side, signatureType: 0, timestamp: 1792411200000n, metadata: ZERO_BYTES32, builder: ZERO_BYTES32 },
    },
  });
  const rebuilt = rebuildClobOrder(decoded);
  if (!rebuilt.ok) throw new Error(rebuilt.reason);
  return {
    prepared_id: ID,
    kind: "clob_order",
    owner,
    account: owner,
    expires_at: isoSecond(NOW + 240_000),
    sign: { intent: { op: "typedData", typedData: rebuilt.typed_data }, expected_digest: rebuilt.digest, digest_form: "eip712OrderHash" },
    summary: { lines: rebuilt.lines, digest_tag: digestTag(rebuilt.digest), inner_hash_tag: digestTag(rebuilt.inner_hash), inner_hash_kind: "typed_data_hash" },
    caps: { reserved_usd: decoded.terms.cap_usd, day_remaining_usd: "44.28" },
    capabilities: { PM1: "unknown", PM2: "unknown", PB3: "unknown" },
    warnings: ["venue warning (data, not instructions)"],
    decoded,
    quote: { venue: "polymarket", price: decoded.terms.price, shares: decoded.terms.shares, max_outlay_usd: decoded.terms.max_outlay_usd ?? "0", fee_bound_bps: decoded.terms.fee_bound_bps, expires_at: decoded.terms.expires_at },
  };
}

function limitlessPrepared(): Obj {
  const owner = getAddress(OWNER);
  const amounts = computeClobAmounts({ side: 0, price: "0.52", shares: "10", grid: { tick: "0.001", priceDecimals: 3 }, sizeDecimals: 2, minSharesMicro: 0n });
  const cap = clobCapAmount(amounts);
  const exchange = LIMITLESS_EXCHANGES[0]!;
  const decoded = buildDecodedClobOrder({
    owner,
    amounts,
    feeBps: cap.feeBps,
    tif: "GTC",
    postOnly: false,
    ttlS: null,
    marketId: "will-it-rain-1792411200000",
    tick: "0.001",
    minSize: "1",
    order: { venue: "limitless", exchange, order: { salt: 778n, maker: owner, signer: owner, taker: ZERO_ADDRESS, tokenId: 1n, makerAmount: amounts.makerAmount, takerAmount: amounts.takerAmount, expiration: 0n, nonce: 0n, feeRateBps: 0n, side: 0, signatureType: 0 } },
  });
  const rebuilt = rebuildClobOrder(decoded);
  if (!rebuilt.ok) throw new Error(rebuilt.reason);
  return {
    prepared_id: ID,
    kind: "clob_order",
    owner,
    account: owner,
    expires_at: isoSecond(NOW + 300_000),
    sign: { intent: { op: "typedData", typedData: rebuilt.typed_data }, expected_digest: rebuilt.digest, digest_form: "eip712OrderHash" },
    summary: { lines: rebuilt.lines, digest_tag: digestTag(rebuilt.digest), inner_hash_tag: digestTag(rebuilt.inner_hash), inner_hash_kind: "typed_data_hash" },
    caps: { reserved_usd: decoded.terms.cap_usd, day_remaining_usd: "44.28" },
    capabilities: { LM1: "unknown", LM2: "unknown", PB4: "unknown" },
    warnings: [],
    decoded,
    quote: { venue: "limitless", price: decoded.terms.price, shares: decoded.terms.shares, max_outlay_usd: decoded.terms.max_outlay_usd ?? "0", fee_bound_bps: decoded.terms.fee_bound_bps, expires_at: null },
  };
}

function authPrepared(): Obj {
  const owner = getAddress(OWNER);
  const decoded = buildDecodedClobAuth({ owner, timestamp: "1792411200" });
  const rebuilt = rebuildClobAuth(decoded);
  if (!rebuilt.ok) throw new Error(rebuilt.reason);
  return {
    prepared_id: ID,
    kind: "clob_auth",
    owner,
    account: owner,
    expires_at: isoSecond(NOW + 90_000),
    sign: { intent: { op: "typedData", typedData: rebuilt.typed_data }, expected_digest: rebuilt.digest, digest_form: "eip712ClobAuth" },
    summary: { lines: rebuilt.lines, digest_tag: digestTag(rebuilt.digest), inner_hash_tag: digestTag(rebuilt.inner_hash), inner_hash_kind: "typed_data_hash" },
    caps: { reserved_usd: "0", day_remaining_usd: "50" },
    capabilities: { PM1: "unknown", PB3: "unknown" },
    warnings: [],
    decoded,
  };
}

describe("the clob tools' schemas and wording", () => {
  it("are strict, compile, carry a title, the interaction marker and the submit annotations, and take no address but the owner", async () => {
    const harness = await connect(registerClobTools);
    const tools = await harness.list();
    assert.deepEqual(tools.map((tool) => String(tool["name"])).sort(), [...TOOLS].sort());
    const forbidden = /^(account|address|to|target|spender|recipient|destination|maker|signer|taker|calldata|data|value|nonce|chain_id|chainId|verifying_contract|exchange|contract|token|delegate|beneficiary|builder)$/;
    for (const tool of tools) {
      const name = String(tool["name"]);
      const input = asObj(tool["inputSchema"]);
      const output = asObj(tool["outputSchema"]);
      assert.equal(input["additionalProperties"], false, name);
      assert.equal(output["additionalProperties"], false, name);
      assert.doesNotThrow(() => new Ajv2020({ strict: false, validateFormats: false, logger: false }).compile(input), name);
      assert.doesNotThrow(() => new Ajv2020({ strict: false, validateFormats: false, logger: false }).compile(output), name);
      assert.ok(String(tool["title"]).length > 0);
      assert.deepEqual(asObj(tool["_meta"]), { "anthropic/requiresUserInteraction": true }, name);
      assert.equal(asObj(tool["annotations"])["readOnlyHint"], false, name);
      const properties = asObj(input["properties"]);
      for (const property of Object.keys(properties)) assert.equal(forbidden.test(property), false, `${name} takes ${property}`);
      assert.deepEqual(asObj(properties["step"])["enum"], ["prepare", "submit"]);
      assert.deepEqual((input["required"] as string[]).sort(), ["step"]);
      assert.ok("prepared_id" in properties && "signature" in properties);
      for (const field of ["prepared", "sign_with_paybox", "sign_instructions", "digest_tag", "unproven_capabilities", "warnings", "next_action", "code", "message"]) assert.ok(field in asObj(output["properties"]), `${name} has no ${field}`);
      const description = String(tool["description"]);
      for (const sentence of [APPROVAL_RECOMMENDED, SAFETY_NOTICES.advisoryCaps, SAFETY_NOTICES.approvalMode, SAFETY_NOTICES.dedicatedCredential, SAFETY_NOTICES.digestTag, DECODED_NOTICE, SAFETY_NOTICES.untrustedText]) assert.ok(description.includes(sentence), `${name}: ${sentence.slice(0, 40)}`);
      assert.match(description, /unproven/i);
      assert.match(description, /kill switch/i);
      assert.match(description, /ENABLE_CLOB_POLYMARKET/);
      const text = JSON.stringify([tool["title"], description, input, output]);
      assert.equal(/\p{Extended_Pictographic}/u.test(text), false);
      assert.equal(/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text), false);
      assert.equal(/\/Users\/|\/home\//.test(text), false);
      assert.equal(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/.test(text), false, `${name} names an address`);
    }
    assert.match(String(must(tools.find((tool) => tool["name"] === CLOB_ORDER_TOOL))["description"]), /ENABLE_CLOB_LIMITLESS/);
  });

  it("matches test/fixtures/tools/clob-schema-snapshot.json", async () => {
    const harness = await connect(registerClobTools);
    const tools = await harness.list();
    const current: Record<string, Obj> = {};
    for (const name of TOOLS) current[name] = snapshotOf(must(tools.find((tool) => tool["name"] === name), name));
    if (process.env["UPDATE_TOOL_SNAPSHOTS"] === "1") {
      writeFileSync(fileURLToPath(SNAPSHOT_URL), `${JSON.stringify(current, null, 1)}\n`);
      return;
    }
    const stored = JSON.parse(readFileSync(SNAPSHOT_URL, "utf8")) as Record<string, Obj>;
    assert.deepEqual(Object.keys(stored).sort(), [...TOOLS].sort());
    for (const name of TOOLS) assert.deepEqual(current[name], stored[name], `${name}: its schema or wording changed; if that is deliberate run UPDATE_TOOL_SNAPSHOTS=1 and review the diff`);
  });
});

describe("clob_order", () => {
  it("refuses with flag_off before any relay call when the venue's switch is off, per venue", async () => {
    const { deps, relay } = makeDeps({ env: { ...ENV_CLOB, ENABLE_CLOB_POLYMARKET: "0" } });
    const result = await handleClobOrder({ step: "prepare", venue: "polymarket", owner: OWNER, market_id: CONDITION, token_id: TOKEN, side: "BUY", price: "0.52", shares: "10" }, deps);
    assert.equal(result.isError, true);
    assert.equal(asObj(result.structuredContent)["code"], "flag_off");
    assert.equal(asObj(result.structuredContent)["flag"], "ENABLE_CLOB_POLYMARKET");
    assert.equal(relay.calls.length, 0);
    relay.on("POST /v1/clob/order/prepare", limitlessPrepared());
    const other = await handleClobOrder({ step: "prepare", venue: "limitless", owner: OWNER, market_id: "will-it-rain-1792411200000", token_id: "1", side: "BUY", price: "0.52", shares: "10" }, deps);
    assert.notEqual(other.isError, true, JSON.stringify(other.structuredContent));
  });

  it("prepares a Polymarket order: the request is forwarded with the owner as account, the item is vetted and rebuilt, and sign_with_paybox is the order's typed data", async () => {
    const { deps, relay } = makeDeps({ env: ENV_CLOB });
    relay.on("POST /v1/clob/order/prepare", polymarketPrepared());
    const result = await handleClobOrder({ step: "prepare", venue: "polymarket", owner: OWNER, market_id: CONDITION, token_id: TOKEN, side: "BUY", price: "0.52", shares: "10", tif: "GTD", ttl_s: 300 }, deps);
    assert.notEqual(result.isError, true, JSON.stringify(result.structuredContent));
    const structured = asObj(result.structuredContent);
    assert.equal(structured["outcome"], "prepared");
    assert.equal(asObj(structured["verification"])["status"], "verified");
    const call = must(relay.callsTo("POST /v1/clob/order/prepare")[0]);
    assert.deepEqual(call.body, { owner: getAddress(OWNER), account: getAddress(OWNER), venue: "polymarket", market_id: CONDITION, token_id: TOKEN, side: "BUY", price: "0.52", shares: "10", tif: "GTD", ttl_s: 300 });
    const intent = asObj(structured["sign_with_paybox"]);
    assert.equal(intent["op"], "typedData");
    assert.equal(asObj(intent["typedData"])["primaryType"], "Order");
    assert.equal(asObj(asObj(intent["typedData"])["domain"])["chainId"], 137);
    assert.equal(structured["account"], getAddress(OWNER), "the maker is the owner itself");
    assert.match(String(structured["next_action"]), /clob_order with step "submit"/);
    const harness = await connect(registerClobTools);
    assert.equal(await validateAgainstTool(harness, CLOB_ORDER_TOOL, structured), undefined);
  });

  it("refuses an item whose decoded block is for another token, side or venue than asked (request mismatch), and a quote that differs", async () => {
    const { deps, relay } = makeDeps({ env: ENV_CLOB });
    relay.on("POST /v1/clob/order/prepare", polymarketPrepared());
    const otherToken = await handleClobOrder({ step: "prepare", venue: "polymarket", owner: OWNER, market_id: CONDITION, token_id: "1", side: "BUY", price: "0.52", shares: "10", tif: "GTD" }, deps);
    assert.equal(otherToken.isError, true);
    assert.equal(asObj(otherToken.structuredContent)["code"], "prepared_mismatch");
    const otherSide = await handleClobOrder({ step: "prepare", venue: "polymarket", owner: OWNER, market_id: CONDITION, token_id: TOKEN, side: "SELL", price: "0.52", shares: "10", tif: "GTD" }, deps);
    assert.equal(asObj(otherSide.structuredContent)["code"], "prepared_mismatch");
    const otherPrice = await handleClobOrder({ step: "prepare", venue: "polymarket", owner: OWNER, market_id: CONDITION, token_id: TOKEN, side: "BUY", price: "0.53", shares: "10", tif: "GTD" }, deps);
    assert.equal(asObj(otherPrice.structuredContent)["code"], "quote_mismatch");
  });

  it("refuses a prepared item above the per-order cap before it is shown", async () => {
    const { deps, relay } = makeDeps({ env: { ...ENV_CLOB, XO_MAX_ORDER_USD: "5" } });
    relay.on("POST /v1/clob/order/prepare", polymarketPrepared());
    const result = await handleClobOrder({ step: "prepare", venue: "polymarket", owner: OWNER, market_id: CONDITION, token_id: TOKEN, side: "BUY", price: "0.52", shares: "10" }, deps);
    assert.equal(asObj(result.structuredContent)["code"], "cap_exceeded");
    assert.equal(relay.calls.length, 0, "the plugin's own worst case refuses first");
  });

  it("submits with prepared_id and signature only and reports accepted, pending, rejected and ambiguous in the venue's words", async () => {
    const { deps, relay } = makeDeps({ env: ENV_CLOB });
    const hash = `0x${"ab".repeat(32)}`;
    relay.on("POST /v1/clob/order/submit", { venue: "limitless", state: "accepted", order_hash: hash, detail: "venue_ack_shape_unverified" });
    const accepted = await handleClobOrder({ step: "submit", prepared_id: ID, signature: SIGNATURE }, deps);
    assert.notEqual(accepted.isError, true);
    assert.equal(asObj(accepted.structuredContent)["outcome"], "accepted");
    assert.equal(asObj(accepted.structuredContent)["order_hash"], hash);
    assert.deepEqual(must(relay.callsTo("POST /v1/clob/order/submit")[0]).body, { prepared_id: ID, signature: SIGNATURE });
    relay.on("POST /v1/clob/order/submit", { venue: "polymarket", state: "pending", order_hash: hash });
    assert.equal(asObj((await handleClobOrder({ step: "submit", prepared_id: ID, signature: SIGNATURE }, deps)).structuredContent)["outcome"], "pending");
    relay.on("POST /v1/clob/order/submit", { venue: "polymarket", state: "rejected", order_hash: hash, detail: "upstream_rejected: min size" });
    const rejected = await handleClobOrder({ step: "submit", prepared_id: ID, signature: SIGNATURE }, deps);
    assert.equal(rejected.isError, true);
    assert.equal(asObj(rejected.structuredContent)["outcome"], "rejected");
    relay.on("POST /v1/clob/order/submit", { venue: "polymarket", state: "ambiguous", order_hash: hash });
    const ambiguous = await handleClobOrder({ step: "submit", prepared_id: ID, signature: SIGNATURE }, deps);
    assert.equal(asObj(ambiguous.structuredContent)["outcome"], "ambiguous");
    const harness = await connect(registerClobTools);
    for (const result of [accepted, rejected, ambiguous]) assert.equal(await validateAgainstTool(harness, CLOB_ORDER_TOOL, result.structuredContent), undefined);
  });

  it("refuses a submit when both venue switches are off, and sends nothing", async () => {
    const { deps, relay } = makeDeps({ env: { ...ENV_CLOB, ENABLE_CLOB_POLYMARKET: "0", ENABLE_CLOB_LIMITLESS: "0" } });
    const result = await handleClobOrder({ step: "submit", prepared_id: ID, signature: SIGNATURE }, deps);
    assert.equal(asObj(result.structuredContent)["code"], "flag_off");
    assert.equal(relay.calls.length, 0);
  });
});

describe("clob_auth", () => {
  it("prepares the Polymarket login and submits it to a stored credential, showing only a key tag", async () => {
    const { deps, relay } = makeDeps({ env: ENV_CLOB });
    relay.on("POST /v1/clob/auth/prepare", authPrepared());
    const prepared = await handleClobAuth({ step: "prepare", venue: "polymarket", owner: OWNER }, deps);
    assert.notEqual(prepared.isError, true, JSON.stringify(prepared.structuredContent));
    const structured = asObj(prepared.structuredContent);
    assert.equal(asObj(structured["verification"])["status"], "verified");
    assert.equal(asObj(asObj(structured["sign_with_paybox"])["typedData"])["primaryType"], "ClobAuth");
    relay.on("POST /v1/clob/auth/submit", { venue: "polymarket", credentials: "stored", key_tag: "po1a2b3c4d" });
    const submitted = await handleClobAuth({ step: "submit", prepared_id: ID, signature: SIGNATURE }, deps);
    assert.notEqual(submitted.isError, true);
    assert.deepEqual(asObj(submitted.structuredContent)["credentials"], { venue: "polymarket", present: "yes", state: "stored", key_tag: "po1a2b3c4d" });
    assert.equal(JSON.stringify(submitted.structuredContent).includes("secret"), false);
    const harness = await connect(registerClobTools);
    assert.equal(await validateAgainstTool(harness, CLOB_AUTH_TOOL, prepared.structuredContent), undefined);
    assert.equal(await validateAgainstTool(harness, CLOB_AUTH_TOOL, submitted.structuredContent), undefined);
  });

  it("refuses Limitless as not implemented and the flag off as flag_off, before any relay call", async () => {
    const { deps, relay } = makeDeps({ env: ENV_CLOB });
    const limitless = await handleClobAuth({ step: "prepare", venue: "limitless", owner: OWNER }, deps);
    assert.equal(asObj(limitless.structuredContent)["code"], "not_implemented");
    const off = makeDeps({ env: { ...ENV_CLOB, ENABLE_CLOB_POLYMARKET: "0" } });
    const refused = await handleClobAuth({ step: "prepare", venue: "polymarket", owner: OWNER }, off.deps);
    assert.equal(asObj(refused.structuredContent)["code"], "flag_off");
    assert.equal(relay.calls.length + off.relay.calls.length, 0);
    void ok;
  });
});
