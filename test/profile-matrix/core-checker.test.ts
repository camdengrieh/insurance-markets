import assert from "node:assert/strict";
import { describe } from "node:test";

import { useMock } from "../mock-xo/testing.js";
import {
  applyProfile,
  checkCredentialsKept,
  checkInvariants,
  ensureDeployedLikeXoApp,
  flowConnect,
  flowDeploy,
  flowOrder,
  httpTransport,
  identityOf,
  creditBalance,
  startStack,
  splitKnown,
  type Stack,
  type Step,
  type WireCall,
} from "./helpers.js";
import { TEST_MASTER_SECRET, TEST_RELAY_KEY } from "../relay-core-helpers.js";

// The checks themselves are tested: each invariant is shown to FIRE on a run that breaks it. A checker that never
// fires proves nothing about the relay. The breakage is injected into the recorded history (the wire log, the
// steps) or into the ledger the check reads; nothing here changes the relay.

function synthetic(stack: Stack, over: Partial<WireCall> & Pick<WireCall, "kind">): WireCall {
  return { seq: 10_000 + stack.history.wire.calls.length, host: "x.test", method: "POST", path: "/x", search: "", rpc: undefined, status: 200, accepted: true, ...over };
}

function withLedger(stack: Stack, list: () => unknown[]): Stack {
  const ledger = new Proxy(stack.relay.services.ledger, {
    get(target, property, receiver) {
      if (property === "list") return list;
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
  return { ...stack, relay: { ...stack.relay, services: { ...stack.relay.services, ledger } } } as Stack;
}

describe("the invariant checks fire on a run that breaks them", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  async function journey(mock: Parameters<Parameters<typeof harness.it>[1]>[0]) {
    applyProfile(mock, { name: "optimistic", base: "optimistic" });
    const stack = await startStack({ mock, transport: httpTransport });
    const who = identityOf(mock, 0);
    await flowDeploy(stack, who);
    await ensureDeployedLikeXoApp(stack, who);
    await flowConnect(stack, who);
    creditBalance(mock, who.account, 100_000_000n);
    await flowOrder(stack, who);
    assert.deepEqual(await checkInvariants(stack), [], "the unbroken run is clean");
    return { stack, who };
  }

  harness.it("I1: a user operation or an order nobody prepared; a send whose item was never signed", async (mock) => {
    const { stack } = await journey(mock);
    stack.history.wire.calls.push(synthetic(stack, { kind: "bundler_send", userOpHash: `0x${"ab".repeat(32)}`, rpc: "eth_sendUserOperation" }));
    stack.history.wire.calls.push(synthetic(stack, { kind: "order_post", orderHash: `0x${"cd".repeat(32)}` }));
    stack.history.wire.calls.push(synthetic(stack, { kind: "order_delete", orderHash: `0x${"ef".repeat(32)}` }));
    const violations = await checkInvariants(stack, { skipScan: true });
    assert.ok(violations.some((v) => v.startsWith("I1 a user operation")), violations.join("\n"));
    assert.ok(violations.some((v) => v.startsWith("I1 an order")), violations.join("\n"));
    assert.ok(violations.some((v) => v.startsWith("I1 a cancel")), violations.join("\n"));
    // The owner signed a digest that is not the hash of the operation that went out.
    const signedOp = stack.history.signed.find((entry) => /^0x[0-9a-f]{64}$/.test(entry.digest));
    if (signedOp !== undefined) {
      const original = signedOp.digest;
      (signedOp as { digest: string }).digest = `0x${"12".repeat(32)}`;
      assert.ok((await checkInvariants(stack, { skipScan: true })).some((v) => v.startsWith("I1 the owner signed")));
      (signedOp as { digest: string }).digest = original;
    }
    // A prepared item that was never signed.
    const unsigned = stack.history.prepared.find((item) => item.orderHash !== undefined)!;
    stack.history.signed.length = 0;
    assert.ok((await checkInvariants(stack, { skipScan: true })).some((v) => v.includes("never signed") && v.includes(unsigned.orderHash!)));
  });

  harness.it("I1: an order on the book that no prepared item names; a key minted with no connect", async (mock) => {
    const { stack, who } = await journey(mock);
    const other = [...mock.write.orders.values()][0]!;
    stack.history.prepared.length = 0;
    const violations = await checkInvariants(stack, { skipScan: true });
    assert.ok(violations.some((v) => v.startsWith("I1 the order book holds an order") && v.includes(other.hash)), violations.join("\n"));
    assert.ok(violations.some((v) => v.startsWith("I1 an XO API key was created")), violations.join("\n"));
    assert.ok(who.owner.length > 0);
  });

  harness.it("I3: the same user operation sent twice; an order accepted twice; two keys for one account", async (mock) => {
    const { stack } = await journey(mock);
    const send = stack.history.wire.calls.find((call) => call.kind === "bundler_send")!;
    stack.history.wire.calls.push({ ...send, seq: 20_001 });
    const post = stack.history.wire.calls.find((call) => call.kind === "order_post")!;
    stack.history.wire.calls.push({ ...post, seq: 20_002 });
    const key = mock.write.credentials[0]!;
    mock.write.credentials.push({ ...key, apiKey: "second-key-ZZZZZZZZ" });
    const violations = await checkInvariants(stack, { skipScan: true });
    assert.ok(violations.some((v) => v.startsWith("I3 user operation") && v.includes("sent again")), violations.join("\n"));
    assert.ok(violations.some((v) => v.startsWith("I3 order") && v.includes("accepted 2 times")), violations.join("\n"));
    assert.ok(violations.some((v) => v.includes("XO API keys exist")), violations.join("\n"));
    mock.write.credentials.pop();
  });

  harness.it("I3 allows the same operation to be sent again only after the bundler refused it for sure", async (mock) => {
    const { stack } = await journey(mock);
    const send = stack.history.wire.calls.find((call) => call.kind === "bundler_send")!;
    const item = stack.history.prepared.find((entry) => entry.userOpHash === send.userOpHash)!;
    // The first send was refused (HTTP 200 carrying a JSON-RPC error), and a second prepared item with the same hash was signed.
    (send as { accepted: boolean }).accepted = false;
    stack.history.prepared.push({ ...item, preparedId: "second-prepared-item" });
    stack.history.signed.push({ preparedId: "second-prepared-item", digest: "userop", by: item.owner });
    stack.history.wire.calls.push({ ...send, seq: 30_001, accepted: true });
    assert.deepEqual((await checkInvariants(stack, { skipScan: true })).filter((v) => v.startsWith("I3")), [], "a refused op prepared again and sent once more is not a double send");
    // But a third send, or one after a send that was accepted, is.
    stack.history.wire.calls.push({ ...send, seq: 30_002, accepted: true });
    assert.ok((await checkInvariants(stack, { skipScan: true })).some((v) => v.startsWith("I3")));
  });

  harness.it("I2: an order reservation above $10, a day above $50, funding above the test cap", async (mock) => {
    const { stack, who } = await journey(mock);
    const account = who.account.toLowerCase();
    const reservation = (over: Record<string, unknown>) => ({ id: "r", kind: "spend", category: "order", account, day: "2026-10-19", amountAtomic: 1n, state: "reserved", hold: false, holdReason: null, createdAtMs: 0, expiresAtMs: 0, spentAtomic: null, ...over });
    const over = withLedger(stack, () => [reservation({ id: "big", amountAtomic: 10_000_001n }), reservation({ id: "a", amountAtomic: 9_000_000n }), ...Array.from({ length: 6 }, (_, n) => reservation({ id: `d${String(n)}`, amountAtomic: 9_000_000n })), reservation({ id: "f", kind: "fund", category: "funding", amountAtomic: 10_000_001n })]);
    const violations = await checkInvariants(over, { skipScan: true });
    assert.ok(violations.some((v) => v.startsWith("I2 order reservation big")), violations.join("\n"));
    assert.ok(violations.some((v) => v.includes("above the daily cap")), violations.join("\n"));
    assert.ok(violations.some((v) => v.includes("above the test cap")), violations.join("\n"));
    // A released reservation counts for nothing.
    const released = withLedger(stack, () => [reservation({ id: "x", amountAtomic: 60_000_000n, state: "released" })]);
    assert.deepEqual((await checkInvariants(released, { skipScan: true })).filter((v) => v.startsWith("I2")), []);
  });

  harness.it("I5: a funding proposal or reservation for an undeployed account", async (mock) => {
    const { stack } = await journey(mock);
    const stranger = identityOf(mock, 7);
    const step: Step = { tool: "xo_fund_account", args: { owner: stranger.owner }, isError: false, text: "FUNDING STEP 1 OF 2", structured: { "io.paybox/transactionProposal": {} }, code: undefined, outcome: undefined, startedMs: 0, endedMs: 0, deployedBefore: false };
    stack.history.steps.push(step);
    const ledger = withLedger(stack, () => [{ id: "f", kind: "fund", category: "funding", account: stranger.account.toLowerCase(), day: "d", amountAtomic: 1n, state: "reserved", hold: false, holdReason: null, createdAtMs: 0, expiresAtMs: 0, spentAtomic: null }]);
    const violations = await checkInvariants(ledger, { skipScan: true });
    assert.ok(violations.some((v) => v.startsWith("I5 xo_fund_account handed out a Base proposal")), violations.join("\n"));
    assert.ok(violations.some((v) => v.startsWith("I5 funding reservation")), violations.join("\n"));
  });

  harness.it("I6: a write upstream with its flag off or the kill switch on; a submit reported under a closed gate", async (mock) => {
    const { stack } = await journey(mock);
    const closed = { userop: false, trading: false, funding: false, withdraw: false };
    const violations = await checkInvariants(stack, { skipScan: true, writable: closed });
    assert.ok(violations.some((v) => v.startsWith("I6 ENABLE_USEROP_SUBMIT")), violations.join("\n"));
    assert.ok(violations.some((v) => v.startsWith("I6 ENABLE_TRADING")), violations.join("\n"));
    assert.ok(violations.some((v) => v.includes("reported a submit")), violations.join("\n"));
    assert.ok(violations.some((v) => v.includes("reported accepted")), violations.join("\n"));
    // Gates that apply only from a point on ignore what happened before it.
    const later = await checkInvariants(stack, { skipScan: true, writable: closed, gatesFrom: { wireSeq: 1_000_000, step: stack.history.steps.length } });
    assert.deepEqual(later.filter((v) => v.startsWith("I6")), []);
  });

  harness.it("I7 and I9: an answer without a code, a message or a next step; a refusal with a vague code", async (mock) => {
    const { stack } = await journey(mock);
    const bare = (over: Partial<Step>): Step => ({ tool: "xo_prepare_order", args: {}, isError: true, text: "x", structured: { outcome: "refused", code: "internal", message: "x", next_action: "" }, code: "internal", outcome: "refused", startedMs: 0, endedMs: 0, ...over });
    stack.history.steps.push(bare({}), bare({ structured: undefined, code: undefined }), bare({ structured: { outcome: "weird", code: "cap_exceeded", message: "A cap stopped this order.", next_action: "Lower the size." }, code: "cap_exceeded", outcome: "weird" }));
    const violations = await checkInvariants(stack, { skipScan: true });
    assert.ok(violations.some((v) => v.includes("without a message")), violations.join("\n"));
    assert.ok(violations.some((v) => v.includes("without saying what to do next")), violations.join("\n"));
    assert.ok(violations.some((v) => v.includes("vague code internal")), violations.join("\n"));
    assert.ok(violations.some((v) => v.includes("returned no structured result")), violations.join("\n"));
    assert.ok(violations.some((v) => v.includes("unknown outcome weird")), violations.join("\n"));
  });

  harness.it("I8: a triplet, an HMAC signature, the relay key or the master secret in a tool answer, a relay answer, an audit event or a file", async (mock) => {
    const { stack } = await journey(mock);
    const triplet = mock.write.credentials[0]!;
    const hmac = [...stack.history.wire.sentSecrets][0]!;
    const leaks: Array<[string, () => void]> = [
      ["triplet secret in a tool answer", () => stack.history.steps.push({ tool: "xo_account", args: {}, isError: false, text: `credentials: ${triplet.secret}`, structured: {}, code: undefined, outcome: undefined, startedMs: 0, endedMs: 0 })],
      ["api key (base64) in structured output", () => stack.history.steps.push({ tool: "xo_account", args: {}, isError: false, text: "ok", structured: { blob: Buffer.from(`k=${triplet.apiKey}`).toString("base64") }, code: undefined, outcome: undefined, startedMs: 0, endedMs: 0 })],
      ["hmac signature in a relay answer", () => stack.history.relayWire.push({ method: "POST", url: "/v1/x", status: 200, requestBody: "", responseBody: JSON.stringify({ detail: hmac }), responseHeaders: "[]" })],
      ["relay key in a relay response header", () => stack.history.relayWire.push({ method: "POST", url: "/v1/x", status: 200, requestBody: "", responseBody: "{}", responseHeaders: JSON.stringify([["x-echo", TEST_RELAY_KEY]]) })],
      ["master secret in a plugin audit event", () => stack.history.audit.push({ tool: "xo_account", action: "read", outcome: "allowed", note: TEST_MASTER_SECRET })],
    ];
    for (const [label, inject] of leaks) {
      inject();
      const found = (await checkInvariants(stack, {})).filter((v) => v.startsWith("I8"));
      assert.ok(found.length > 0, `the scan misses: ${label}`);
    }
  });

  harness.it("I10: a prepared item whose decoded block does not rebuild to what the owner is asked to sign", async (mock) => {
    const { stack } = await journey(mock);
    const prepares = stack.history.relayWire.filter((entry) => entry.status === 200 && /\/v1\/(?:order|userop|auth)\/prepare$/.test(entry.url));
    for (const kind of ["order", "userop", "auth"]) assert.ok(prepares.some((entry) => entry.url.includes(`/${kind}/prepare`)), `the journey prepared a ${kind} item`);
    const tamper = (url: string, change: (item: Record<string, unknown>) => void): void => {
      const original = prepares.find((entry) => entry.url.includes(url))!;
      const item = JSON.parse(original.responseBody) as Record<string, unknown>;
      change(item);
      stack.history.relayWire.push({ ...original, responseBody: JSON.stringify(item) });
    };
    // One digit of a summary line.
    tamper("/order/prepare", (item) => {
      const summary = item["summary"] as { lines: string[] };
      summary.lines[0] = (summary.lines[0] as string).replace(/\d/, (digit) => String((Number(digit) + 1) % 10));
    });
    let violations = (await checkInvariants(stack, { skipScan: true })).filter((v) => v.startsWith("I10"));
    assert.equal(violations.length, 1, violations.join("\n"));
    assert.match(violations[0] as string, /summary\.lines\[0\]/);
    // The decoded owner of a user operation.
    tamper("/userop/prepare", (item) => {
      (item["decoded"] as { owner: string }).owner = `0x${"11".repeat(20)}`;
    });
    // A login without its decoded block can only say "not derivable", which is also a violation for a relay that should send one.
    tamper("/auth/prepare", (item) => {
      delete item["decoded"];
    });
    violations = (await checkInvariants(stack, { skipScan: true })).filter((v) => v.startsWith("I10"));
    assert.equal(violations.length, 3, violations.join("\n"));
    assert.ok(violations.some((v) => v.includes("decoded.owner")));
    assert.ok(violations.some((v) => v.includes("not_derivable at decoded")));
  });

  harness.it("I4: a minted key that is not in the vault, or not the one XO minted", async (mock) => {
    const { stack } = await journey(mock);
    assert.deepEqual(await checkCredentialsKept(stack), []);
    const key = mock.write.credentials[0]!;
    // Pretend XO minted another key for the account than the one stored.
    mock.write.credentials[0] = { ...key, apiKey: "another-key-not-stored-0001" };
    assert.ok((await checkCredentialsKept(stack)).some((v) => v.includes("is not the one XO minted")));
    mock.write.credentials[0] = { ...key, account: "00".repeat(20) };
    assert.ok((await checkCredentialsKept(stack)).some((v) => v.includes("is not in the relay's vault")));
    mock.write.credentials[0] = key;
  });

  harness.it("known findings are matched by their exact text and nothing else", () => {
    const { unknown, known } = splitKnown(["I7 xo_withdraw refused (capability_unknown) without saying what to do next", "I1 an order went out", "I7 xo_order_status refused (internal) without saying what to do next"]);
    assert.equal(known.length, 1);
    assert.deepEqual(unknown, ["I1 an order went out", "I7 xo_order_status refused (internal) without saying what to do next"]);
  });
});
