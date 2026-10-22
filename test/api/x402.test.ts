import assert from "node:assert/strict";
import { test } from "node:test";

import { getAddress, keccak256, toHex, type Address, type Hex } from "viem";

import { loadApiConfig } from "../../api/config.js";
import { createRpcPort, rpcPostFromFetch } from "../../sdk/chain/rpc.js";
import { LIMITLESS_PINS } from "../../sdk/chain/limitless/constants.js";
import { BASE_USDC, BASE_USDC_IMPLEMENTATION, checkPaymentAsset, domainSeparatorOf, ERC6492_MAGIC, transferDigest, type PaymentRequired, type PaymentRequirements, type SettlementResponse } from "../../api/x402.js";
import { Clock, forbiddenFetch, groupEnv, realLeg, startHarness, testConfig, trueoWorld, type Harness } from "./helpers.js";
import { decodeRequired, fakeBaseRpc, fakeFacilitator, paymentEnv, PAY_TO, testPayer, type FakeFacilitator, type FakeWallet } from "./payments.js";

// x402 per call (docs/sdk-and-api-design.md section 4), against a fake facilitator and EIP-3009 payloads signed by keys
// generated in this test, with the real serving policy and the SDK's recorded Trueo world as the one served venue.
// Every paid path: no payment -> 402 with the exact requirements; bad signature, wrong amount, asset or network, expired,
// not yet valid, replayed -> refused before the handler; valid -> the handler runs, then settle; a failed handler -> no settle.

function port(fetch: Parameters<typeof rpcPostFromFetch>[0]) {
  return createRpcPort({ url: "https://base.test/", post: rpcPostFromFetch(fetch), methods: ["eth_chainId", "eth_getCode", "eth_getStorageAt", "eth_call"] });
}

test("the pinned USDC: its domain separator is the hash of its EIP-712 domain on Base, and the chain check accepts only the pinned code", async () => {
  assert.equal(BASE_USDC.address.toLowerCase(), LIMITLESS_PINS.usdc.address.toLowerCase());
  assert.equal(domainSeparatorOf(BASE_USDC), BASE_USDC.domainSeparator);
  assert.deepEqual(await checkPaymentAsset(port(fakeBaseRpc().fetch)), { ok: true });
  assert.equal((await checkPaymentAsset(port(fakeBaseRpc({ chainId: 84532 }).fetch))).ok, false);
  assert.equal((await checkPaymentAsset(port(fakeBaseRpc({ code: "0x6080" }).fetch))).ok, false);
  assert.equal((await checkPaymentAsset(port(fakeBaseRpc({ domainSeparator: `0x${"11".repeat(32)}` }).fetch))).ok, false);
  const otherImpl = await checkPaymentAsset(port(fakeBaseRpc({ implementation: "0x000000000000000000000000000000000000dEaD" }).fetch));
  assert.deepEqual(otherImpl, { ok: false, reason: "the token's proxy names an implementation that was not pinned" });
  assert.equal(BASE_USDC_IMPLEMENTATION.codeSize, 23_464);
});

test("payment configuration has no defaults for money and is checked", () => {
  const none = loadApiConfig({ API_DATA_DIR: "/data" });
  assert.equal(none.config.payments, null);
  assert.equal(none.config.routePrepare, "off");
  const full = loadApiConfig({ API_DATA_DIR: "/data", ...paymentEnv() });
  assert.deepEqual(full.fatal, []);
  assert.equal(full.config.payments?.prices.quote, 10_000n);
  assert.equal(full.config.payments?.prices.routePrepare, null, "a price is never defaulted");
  assert.equal(full.config.payments?.payTo, PAY_TO);
  const fatal = (env: Record<string, string>): string[] => loadApiConfig({ API_DATA_DIR: "/data", ...env }).fatal.map((i) => i.variable);
  // Any payment variable needs the rest: no default payTo, network, facilitator or public URL.
  assert.deepEqual(fatal({ API_X402_PRICE_QUOTE: "0.01" }).sort(), ["API_PUBLIC_URL", "API_X402_FACILITATOR_URL", "API_X402_NETWORK", "API_X402_PAY_TO"]);
  assert.deepEqual(fatal(paymentEnv({ API_X402_PAY_TO: "0x0000000000000000000000000000000000000000" })), ["API_X402_PAY_TO"]);
  // PAY_TO is checksummed (...Fee01); flipping one letter's case breaks the checksum.
  assert.deepEqual(fatal(paymentEnv({ API_X402_PAY_TO: PAY_TO.replace("Fee01", "fEe01") })), ["API_X402_PAY_TO"], "a wrong checksum");
  assert.deepEqual(fatal(paymentEnv({ API_X402_NETWORK: "eip155:84532" })), ["API_X402_NETWORK"]);
  for (const price of ["0", "-1", "0.0000001", "11", "1e3", "abc"]) assert.deepEqual(fatal(paymentEnv({ API_X402_PRICE_QUOTE: price })), ["API_X402_PRICE_QUOTE"], price);
  assert.deepEqual(fatal(paymentEnv({ API_X402_FACILITATOR_URL: "http://facilitator.example.org" })), ["API_X402_FACILITATOR_URL"]);
  assert.deepEqual(fatal(paymentEnv({ API_PUBLIC_URL: "https://api.test/path" })), ["API_PUBLIC_URL"]);
  assert.deepEqual(fatal({ API_ROUTE_PREPARE: "on" }), ["API_ROUTE_PREPARE"]);
});

interface Paid {
  readonly h: Harness;
  readonly clock: Clock;
  readonly facilitator: FakeFacilitator;
  readonly groupId: string;
  readonly path: string;
  readonly venueCalls: () => number;
  readonly rpc: ReturnType<typeof fakeBaseRpc>;
  required(): Promise<{ status: number; required: PaymentRequired; requirements: PaymentRequirements; body: Record<string, unknown> }>;
}

async function paidHarness(options: { readonly env?: Record<string, string>; readonly rpc?: Parameters<typeof fakeBaseRpc>[0]; readonly wallets?: readonly FakeWallet[] } = {}): Promise<Paid> {
  const world = await trueoWorld();
  const clock = new Clock(world.nowMs);
  const groups = groupEnv([{ a: realLeg("trueo", `8453:${world.liveAddress}`), b: realLeg("trueo", `8453:${world.flippedAddress}`), approved: true }]);
  const facilitator = fakeFacilitator(() => Math.floor(clock.now / 1000), options.wallets ?? []);
  let venueCalls = 0;
  const trueo: typeof world.fetch = (input, init) => {
    venueCalls += 1;
    return world.fetch(input, init);
  };
  const rpc = fakeBaseRpc({ ...options.rpc, wallets: options.wallets ?? [] });
  const h = await startHarness({
    clock,
    config: testConfig({ ...groups.env, ...paymentEnv(), ...options.env }),
    fetchFor: (venue) => (venue === "trueo" ? trueo : forbiddenFetch(venue, [])),
    facilitatorFetch: facilitator.fetch,
    assetRpcFetch: rpc.fetch,
  });
  const groupId = groups.linkIds[0] as string;
  const path = `/v1/quote?group=${groupId}&side=buy&size=10`;
  return {
    h,
    clock,
    facilitator,
    groupId,
    path,
    venueCalls: () => venueCalls,
    rpc,
    async required() {
      const answer = await h.get(path);
      const required = decodeRequired(answer.headers.get("payment-required"));
      return { status: answer.status, required, requirements: required.accepts[0] as PaymentRequirements, body: answer.json };
    },
  };
}

function settlement(header: string | null): SettlementResponse {
  assert.ok(header !== null, "a PAYMENT-RESPONSE header");
  return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as SettlementResponse;
}

test("no payment: 402 with the exact requirements in PAYMENT-REQUIRED and the body, and the handler does not run", async () => {
  const p = await paidHarness();
  try {
    const { status, required, body } = await p.required();
    assert.equal(status, 402);
    assert.deepEqual(body, JSON.parse(JSON.stringify(required)), "the body is the same PaymentRequired object");
    assert.equal(required.x402Version, 2);
    assert.equal(required.resource.url, `https://api.test${p.path}`);
    assert.equal(required.resource.mimeType, "application/json");
    assert.deepEqual(required.accepts, [
      { scheme: "exact", network: "eip155:8453", amount: "10000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: PAY_TO, maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } },
    ]);
    const bazaar = (required.extensions as Record<string, { info: { input: Record<string, unknown> } }>)["bazaar"];
    assert.equal(bazaar?.info.input["method"], "GET");
    assert.equal(p.venueCalls(), 0, "no venue read before payment");
    assert.equal(p.facilitator.calls.length, 0);
    // A route with nothing to quote is refused before any money is asked for.
    assert.equal((await p.h.get("/v1/quote")).status, 400);
  } finally {
    await p.h.close();
  }
});

test("a valid payment: verify, the handler, then settle; PAYMENT-RESPONSE carries the transaction; the authorization cannot pay twice", async () => {
  const p = await paidHarness();
  try {
    const { requirements } = await p.required();
    const payer = testPayer();
    const header = await payer.pay(requirements, { nowS: Math.floor(p.clock.now / 1000), resource: `https://api.test${p.path}` });
    const answer = await p.h.get(p.path, { "payment-signature": header });
    assert.equal(answer.status, 200, JSON.stringify(answer.json));
    assert.ok(Array.isArray(answer.json["legs"]));
    assert.deepEqual(p.facilitator.calls.map((c) => c.path), ["/facilitator/verify", "/facilitator/settle"]);
    // The facilitator was asked with exactly the requirements this endpoint states.
    assert.deepEqual(p.facilitator.calls[0]?.body["paymentRequirements"], JSON.parse(JSON.stringify(requirements)));
    assert.equal(p.facilitator.calls[0]?.body["x402Version"], 2);
    const response = settlement(answer.headers.get("payment-response"));
    assert.equal(response.success, true);
    assert.match(response.transaction, /^0x[0-9a-f]{64}$/);
    assert.equal(response.network, "eip155:8453");
    assert.ok(p.venueCalls() > 0, "the handler ran");
    const nonce = JSON.parse(Buffer.from(header, "base64").toString("utf8")).payload.authorization.nonce as string;
    assert.equal(p.h.metering.payment(payer.address.toLowerCase(), nonce.toLowerCase())?.state, "settled");
    // Replayed: refused before the facilitator, never charged twice.
    const replay = await p.h.get(p.path, { "payment-signature": header });
    assert.equal(replay.status, 402);
    assert.match(String(replay.json["error"]), /already used/);
    assert.equal(p.facilitator.calls.length, 2);
  } finally {
    await p.h.close();
  }
});

test("refused before the handler: bad signature, wrong amount, asset, network or recipient, expired, not yet valid, another resource, a malformed header", async () => {
  const p = await paidHarness();
  try {
    const { requirements } = await p.required();
    const nowS = Math.floor(p.clock.now / 1000);
    const payer = testPayer();
    const cases: Array<[string, Promise<string>, number, RegExp]> = [
      ["bad signature", payer.pay(requirements, { nowS, signWith: "other" }), 402, /invalid_exact_evm_payload_signature/],
      ["wrong amount", payer.pay(requirements, { nowS, value: "9999", accepted: { amount: "9999" } }), 402, /value_mismatch/],
      ["amount in the authorization only", payer.pay(requirements, { nowS, value: "1" }), 402, /value_mismatch/],
      ["wrong asset", payer.pay(requirements, { nowS, accepted: { asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" } }), 402, /invalid_payment_requirements/],
      ["wrong network", payer.pay(requirements, { nowS, accepted: { network: "eip155:84532" as never } }), 402, /invalid_network/],
      ["wrong recipient", payer.pay(requirements, { nowS, to: "0x000000000000000000000000000000000000bEEF" }), 402, /recipient_mismatch/],
      ["expired", payer.pay(requirements, { nowS, validAfter: nowS - 120, validBefore: nowS - 1 }), 402, /valid_before/],
      ["expiring before it could settle", payer.pay(requirements, { nowS, validBefore: nowS + 3 }), 402, /valid_before/],
      ["not yet valid", payer.pay(requirements, { nowS, validAfter: nowS + 60, validBefore: nowS + 120 }), 402, /valid_after/],
      ["a window too long", payer.pay(requirements, { nowS, validBefore: nowS + 7_200 }), 402, /invalid_payload/],
      ["another resource", payer.pay(requirements, { nowS, resource: "https://api.test/v1/route/prepare" }), 402, /another resource/],
      ["an ERC-6492 signature", payer.pay(requirements, { nowS, signature: `0x${"ab".repeat(70)}${ERC6492_MAGIC}` as Hex }), 402, /ERC-6492/],
      ["not base64 JSON", Promise.resolve("not-a-payment!"), 400, /invalid_payload/],
      ["a version 1 payload", Promise.resolve(Buffer.from(JSON.stringify({ x402Version: 1, scheme: "exact", network: "base", payload: {} })).toString("base64")), 400, /invalid_payload/],
    ];
    for (const [name, header, status, reason] of cases) {
      const answer = await p.h.get(p.path, { "payment-signature": await header });
      assert.equal(answer.status, status, name);
      assert.match(String(answer.json["error"]), reason, name);
      assert.ok(answer.headers.get("payment-required") !== null, `${name}: the requirements are restated`);
    }
    assert.equal(p.facilitator.calls.length, 0, "nothing reached the facilitator");
    assert.equal(p.venueCalls(), 0, "no handler ran");
  } finally {
    await p.h.close();
  }
});

test("a smart-contract wallet pays: its signature is judged by its own ERC-1271 isValidSignature, on the digest USDC checks", async () => {
  const wallet: FakeWallet = {
    address: getAddress("0x00000000000000000000000000000000000a11ce"),
    calls: [],
    answer: (_digest, signature) => (signature === `0x${"5a".repeat(300)}` ? "magic" : signature === `0x${"5b".repeat(40)}` ? "revert" : "wrong"),
  };
  const p = await paidHarness({ wallets: [wallet] });
  try {
    const { requirements } = await p.required();
    const nowS = Math.floor(p.clock.now / 1000);
    const payer = testPayer();
    const good = await payer.pay(requirements, { nowS, from: wallet.address, signature: `0x${"5a".repeat(300)}` });
    const answer = await p.h.get(p.path, { "payment-signature": good });
    assert.equal(answer.status, 200, JSON.stringify(answer.json));
    assert.equal(settlement(answer.headers.get("payment-response")).success, true);
    // The wallet was asked about exactly the EIP-712 digest of the authorization under USDC's domain.
    const auth = JSON.parse(Buffer.from(good, "base64").toString("utf8")).payload.authorization as Record<string, string>;
    const digest = transferDigest(BASE_USDC, { from: auth["from"] as Address, to: auth["to"] as Address, value: BigInt(auth["value"] as string), validAfter: BigInt(auth["validAfter"] as string), validBefore: BigInt(auth["validBefore"] as string), nonce: auth["nonce"] as Hex });
    assert.equal(wallet.calls[0]?.digest, digest);
    for (const [name, signature] of [["the wallet answers another value", `0x${"5c".repeat(65)}`], ["the wallet reverts", `0x${"5b".repeat(40)}`]] as const) {
      const refused = await p.h.get(p.path, { "payment-signature": await payer.pay(requirements, { nowS, from: wallet.address, signature: signature as Hex }) });
      assert.equal(refused.status, 402, name);
      assert.match(String(refused.json["error"]), /invalid_exact_evm_payload_signature/, name);
    }
    // A 65-byte signature from a wallet is still the wallet's to judge (USDC asks a contract, never ECDSA).
    const ecdsa = await p.h.get(p.path, { "payment-signature": await payer.pay(requirements, { nowS, from: wallet.address }) });
    assert.equal(ecdsa.status, 402);
    assert.equal(p.facilitator.calls.filter((c) => c.path.endsWith("/settle")).length, 1);
  } finally {
    await p.h.close();
  }
});

test("an EOA's long signature is refused, and an RPC that cannot be asked about the signature is 503 with nothing charged", async () => {
  const p = await paidHarness();
  try {
    const { requirements } = await p.required();
    const nowS = Math.floor(p.clock.now / 1000);
    const long = await p.h.get(p.path, { "payment-signature": await testPayer().pay(requirements, { nowS, signature: `0x${"aa".repeat(100)}` }) });
    assert.equal(long.status, 402);
    assert.match(String(long.json["error"]), /65-byte/);
  } finally {
    await p.h.close();
  }
  const down = await paidHarness();
  try {
    const { requirements } = await down.required();
    // The asset was checked when the 402 was made; now the RPC goes away before the payer's signature can be read.
    down.rpc.state.down = true;
    const answer = await down.h.get(down.path, { "payment-signature": await testPayer().pay(requirements, { nowS: Math.floor(down.clock.now / 1000) }) });
    assert.equal(answer.status, 503);
    assert.equal((answer.json["error"] as Record<string, unknown>)["code"], "payments_unavailable");
    assert.equal(down.facilitator.calls.length, 0);
    assert.equal(down.venueCalls(), 0);
  } finally {
    await down.h.close();
  }
});

test("a handler that fails is never settled: the claim is released and the same payment then pays for a good answer", async () => {
  const p = await paidHarness();
  try {
    const { requirements } = await p.required();
    const nowS = Math.floor(p.clock.now / 1000);
    const payer = testPayer();
    const missing = `/v1/quote?group=lnk_${"0".repeat(32)}&side=buy&size=10`;
    const header = await payer.pay(requirements, { nowS });
    const failed = await p.h.get(missing, { "payment-signature": header });
    assert.equal(failed.status, 404);
    assert.equal((failed.json["error"] as Record<string, unknown>)["code"], "group_not_found");
    assert.equal(failed.headers.get("payment-response"), null);
    assert.deepEqual(p.facilitator.calls.map((c) => c.path), ["/facilitator/verify"], "verified, never settled");
    const nonce = JSON.parse(Buffer.from(header, "base64").toString("utf8")).payload.authorization.nonce as string;
    assert.equal(p.h.metering.payment(payer.address.toLowerCase(), nonce.toLowerCase()), null, "the claim was released");
    const good = await p.h.get(p.path, { "payment-signature": header });
    assert.equal(good.status, 200);
    assert.deepEqual(p.facilitator.calls.map((c) => c.path), ["/facilitator/verify", "/facilitator/verify", "/facilitator/settle"]);
  } finally {
    await p.h.close();
  }
});

test("settlement outcomes: refused withholds the answer (402); pending or unknown delivers it and keeps the claim", async () => {
  const p = await paidHarness();
  try {
    const { requirements } = await p.required();
    const nowS = Math.floor(p.clock.now / 1000);
    const payer = testPayer();
    p.facilitator.settleMode = "fail";
    const failed = await p.h.get(p.path, { "payment-signature": await payer.pay(requirements, { nowS }) });
    assert.equal(failed.status, 402);
    assert.equal((failed.json["error"] as Record<string, unknown>)["code"], "payment_failed");
    assert.equal(failed.json["legs"], undefined, "the answer is withheld");
    assert.equal(settlement(failed.headers.get("payment-response")).success, false);

    p.facilitator.settleMode = "pending";
    const pending = await p.h.get(p.path, { "payment-signature": await payer.pay(requirements, { nowS }) });
    assert.equal(pending.status, 200);
    assert.equal(settlement(pending.headers.get("payment-response")).errorReason, "settlement_pending");

    p.facilitator.settleMode = "down";
    const unknownHeader = await payer.pay(requirements, { nowS });
    const unknown = await p.h.get(p.path, { "payment-signature": unknownHeader });
    assert.equal(unknown.status, 200);
    assert.equal(settlement(unknown.headers.get("payment-response")).errorReason, "unexpected_settle_error");
    const nonce = JSON.parse(Buffer.from(unknownHeader, "base64").toString("utf8")).payload.authorization.nonce as string;
    assert.equal(p.h.metering.payment(payer.address.toLowerCase(), nonce.toLowerCase())?.state, "settle_unknown");
    assert.equal((await p.h.get(p.path, { "payment-signature": unknownHeader })).status, 402, "an unknown settlement still cannot pay twice");
  } finally {
    await p.h.close();
  }
});

test("the facilitator refusing or unreachable at verify: 402 or 503, nothing charged, the claim released", async () => {
  const p = await paidHarness();
  try {
    const { requirements } = await p.required();
    const nowS = Math.floor(p.clock.now / 1000);
    const payer = testPayer();
    p.facilitator.verifyMode = "invalid";
    const header = await payer.pay(requirements, { nowS });
    const refused = await p.h.get(p.path, { "payment-signature": header });
    assert.equal(refused.status, 402);
    assert.match(String(refused.json["error"]), /insufficient_funds/);
    p.facilitator.verifyMode = "down";
    const down = await p.h.get(p.path, { "payment-signature": header });
    assert.equal(down.status, 503);
    assert.equal((down.json["error"] as Record<string, unknown>)["code"], "payments_unavailable");
    p.facilitator.verifyMode = "check";
    assert.equal((await p.h.get(p.path, { "payment-signature": header })).status, 200, "the released authorization still pays once");
    assert.equal(p.venueCalls() > 0, true);
  } finally {
    await p.h.close();
  }
});

test("payments off: not configured is 503, a USDC that does not match its pin is 503, and the facilitator is never asked", async () => {
  const world = await trueoWorld();
  const clock = new Clock(world.nowMs);
  const groups = groupEnv([{ a: realLeg("trueo", `8453:${world.liveAddress}`), b: realLeg("trueo", `8453:${world.flippedAddress}`), approved: true }]);
  const plain = await startHarness({ clock, config: testConfig(groups.env), fetchFor: (venue) => (venue === "trueo" ? world.fetch : forbiddenFetch(venue, [])) });
  try {
    const answer = await plain.get(`/v1/quote?group=${groups.linkIds[0]}&side=buy&size=1`);
    assert.equal(answer.status, 503);
    assert.equal((answer.json["error"] as Record<string, unknown>)["code"], "payments_not_configured");
  } finally {
    await plain.close();
  }
  const noPrice = await paidHarness({ env: { API_X402_PRICE_QUOTE: "" } });
  try {
    const answer = await noPrice.h.get(noPrice.path);
    assert.equal(answer.status, 503);
    assert.equal((answer.json["error"] as Record<string, unknown>)["code"], "payments_not_configured");
  } finally {
    await noPrice.h.close();
  }
  const changed = await paidHarness({ rpc: { code: "0x6080" } });
  try {
    const answer = await changed.h.get(changed.path);
    assert.equal(answer.status, 503);
    assert.equal((answer.json["error"] as Record<string, unknown>)["code"], "payments_unavailable");
    assert.equal(changed.facilitator.calls.length, 0);
    const health = await changed.h.get("/v1/health");
    assert.match(String(((health.json["metering"] as Record<string, unknown>)["x402"] as Record<string, unknown>)["asset"]), /^refused/);
  } finally {
    await changed.h.close();
  }
});

test("the replay key is the payer and the nonce: another payer's equal nonce is not a replay", async () => {
  const p = await paidHarness();
  try {
    const { requirements } = await p.required();
    const nowS = Math.floor(p.clock.now / 1000);
    const nonce = keccak256(toHex("shared-nonce"));
    const a = await testPayer().pay(requirements, { nowS, nonce });
    const b = await testPayer().pay(requirements, { nowS, nonce });
    assert.equal((await p.h.get(p.path, { "payment-signature": a })).status, 200);
    assert.equal((await p.h.get(p.path, { "payment-signature": b })).status, 200, "another payer's equal nonce is not a replay");
  } finally {
    await p.h.close();
  }
});
