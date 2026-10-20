import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RelayResult } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import { deriveAccount } from "../src/xo/account/derive.js";
import { ANVIL_ACCOUNT_0_OWNER } from "../src/xo/chain/constants.js";
import { createEmbeddedRelay, type EmbeddedRelay } from "../relay/embedded.js";
import type { PostHandler, RouteTable } from "../relay/types.js";
import { FakeClock, TEST_KDF, TEST_MASTER_SECRET, tempDir } from "./relay-core-helpers.js";
import { Secret } from "../src/config.js";
import { startEmbedded } from "./local-helpers.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";

// Which wallets a local process serves: XO_OWNER (explicit), the first wallet whose signature was accepted
// (the default), or any (each kept apart). The routes are stubs, so what is tested is the policy and the
// moment it binds, not XO.

const ALICE = ANVIL_ACCOUNT_0_OWNER;
// Public Anvil test accounts 1 and 2 (the well-known test mnemonic), as lower-case addresses.
const BOB = (ANVIL_TEST_ACCOUNTS[1] as { address: string }).address.toLowerCase();
const CAROL = (ANVIL_TEST_ACCOUNTS[2] as { address: string }).address.toLowerCase();
const DIGEST = `0x${"ab".repeat(32)}` as const;

const code = (result: RelayResult<unknown>): string => (result.ok ? "ok" : result.error.code);

interface Calls {
  prepares: string[];
  submits: string[];
}

function stubRoutes(calls: Calls, submit: "ok" | "throw" = "ok"): RouteTable {
  const prepare: PostHandler<"/v1/auth/prepare"> = async (body) => {
    calls.prepares.push(body.owner.toLowerCase());
    throw new RelayError("cap_exceeded", "stub: the handler ran");
  };
  const submitHandler: PostHandler<"/v1/userop/submit"> = async (body) => {
    calls.submits.push(body.prepared_id);
    if (submit === "throw") throw new RelayError("signature_invalid", "stub");
    return { state: "submitted", user_op_hash: DIGEST };
  };
  return { "POST /v1/auth/prepare": prepare, "POST /v1/userop/submit": submitHandler };
}

async function preparedFor(relay: EmbeddedRelay, owner: string, state: "accepted" | "rejected" | "prepared" = "accepted"): Promise<string> {
  const record = await relay.services.prepared.create({ kind: "userop", owner, account: deriveAccount(owner as `0x${string}`), digest: DIGEST, digestForm: "userOpHash", payload: {} });
  if (state === "prepared") return record.id;
  await relay.services.prepared.beginSend(record.id);
  await relay.services.prepared.resolve(record.id, state);
  return record.id;
}

const signature = `0x${"11".repeat(65)}` as const;

describe("XO_OWNER names the wallets this process serves", () => {
  it("serves a named wallet (in any letter case) and refuses every other one before the handler runs", async () => {
    const calls: Calls = { prepares: [], submits: [] };
    const { relay } = await startEmbedded({ env: { XO_OWNER: ALICE.toLowerCase() }, routes: stubRoutes(calls) });
    assert.deepEqual(relay.owners(), { mode: "explicit", owners: [ALICE.toLowerCase()] });
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: ALICE })), "cap_exceeded");
    const refused = await relay.client.post("/v1/auth/prepare", { owner: BOB });
    assert.equal(code(refused), "precondition_failed");
    assert.equal(refused.ok ? "" : refused.error.details?.["reason"], "owner_not_allowed");
    assert.ok(!JSON.stringify(refused).toLowerCase().includes(BOB.slice(2)), "the refused address is not echoed");
    assert.deepEqual(calls.prepares, [ALICE.toLowerCase()], "the handler never saw the refused owner");
  });

  it("takes a list, separated by commas or spaces", async () => {
    const calls: Calls = { prepares: [], submits: [] };
    const { relay } = await startEmbedded({ env: { XO_OWNER: `${ALICE}, ${BOB}` }, routes: stubRoutes(calls) });
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: ALICE })), "cap_exceeded");
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: BOB })), "cap_exceeded");
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: CAROL })), "precondition_failed");
  });

  it("refuses to start when XO_OWNER holds something that is not a wallet, naming the variable and not the value", async () => {
    for (const bad of ["not-an-address", `0x${"00".repeat(20)}`, `${ALICE},oops`]) {
      const dir = await tempDir("local-owner-bad-");
      try {
        await assert.rejects(
          createEmbeddedRelay({ dataDir: dir.dir, env: { XO_OWNER: bad }, masterSecret: new Secret(TEST_MASTER_SECRET), kdf: TEST_KDF, allowWeakKdf: true, clock: new FakeClock().now, maintenance: false }),
          (error: unknown) => error instanceof Error && /XO_OWNER/.test(error.message) && !error.message.includes("oops") && !error.message.includes("not-an-address"),
        );
        // The failed start released the data directory.
        const again = await createEmbeddedRelay({ dataDir: dir.dir, env: {}, masterSecret: new Secret(TEST_MASTER_SECRET), kdf: TEST_KDF, allowWeakKdf: true, clock: new FakeClock().now, maintenance: false });
        await again.close();
      } finally {
        await dir.cleanup();
      }
    }
  });
});

describe("by default the first wallet whose signature is accepted is the one served", () => {
  it("with no XO_OWNER the first write for a wallet waits for the user's confirmation (RT-2); the binding policy itself is tested below with the handshake off", async () => {
    const calls: Calls = { prepares: [], submits: [] };
    const { relay } = await startEmbedded({ routes: stubRoutes(calls) });
    const first = await relay.client.post("/v1/auth/prepare", { owner: CAROL });
    assert.equal(code(first), "precondition_failed");
    assert.equal(first.ok ? "" : (first.error.details as { reason?: string } | undefined)?.reason, "owner_confirmation_required");
    assert.deepEqual(calls.prepares, [], "the handler did not run");
    assert.deepEqual(relay.owners().owners, [], "asking binds nothing");
  });

  it("serves anyone until a submit succeeds, then binds that wallet and refuses the others", async () => {
    const calls: Calls = { prepares: [], submits: [] };
    // The confirmation handshake is covered by test/relay-owner-confirm.test.ts; it is off here so that this test is about when the binding happens.
    const { relay } = await startEmbedded({ routes: stubRoutes(calls), ownerConfirmation: false });
    assert.deepEqual(relay.owners(), { mode: "first_connected", owners: [] });
    // Before any signature, a prepare for any wallet reaches the handler (a typo does not bind anything).
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: CAROL })), "cap_exceeded");
    assert.deepEqual(relay.owners().owners, []);
    const id = await preparedFor(relay, ALICE);
    assert.equal(code(await relay.client.post("/v1/userop/submit", { prepared_id: id, signature })), "ok");
    assert.deepEqual(relay.owners(), { mode: "first_connected", owners: [ALICE.toLowerCase()] });
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: ALICE })), "cap_exceeded");
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: CAROL })), "precondition_failed");
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: BOB })), "precondition_failed");
  });

  it("funding is refused for every wallet until an owner is established (XO_OWNER or a first signed action), then only the bound one passes", async () => {
    const calls: Calls = { prepares: [], submits: [] };
    const funding: PostHandler<"/v1/funding/check"> = async () => {
      throw new RelayError("cap_exceeded", "stub: the funding handler ran");
    };
    const routes: RouteTable = { ...stubRoutes(calls), "POST /v1/funding/check": funding };
    const { relay } = await startEmbedded({ routes });
    const refused = await relay.client.post("/v1/funding/check", { owner: CAROL, amount: "1" });
    assert.equal(code(refused), "precondition_failed");
    assert.equal(refused.ok ? "" : (refused.error.details as { reason?: string } | undefined)?.reason, "owner_not_established");
    const id = await preparedFor(relay, ALICE);
    assert.equal(code(await relay.client.post("/v1/userop/submit", { prepared_id: id, signature })), "ok");
    assert.equal(code(await relay.client.post("/v1/funding/check", { owner: ALICE, amount: "1" })), "cap_exceeded", "the bound owner reaches the handler");
    const other = await relay.client.post("/v1/funding/check", { owner: CAROL, amount: "1" });
    assert.equal(other.ok ? "" : (other.error.details as { reason?: string } | undefined)?.reason, "owner_not_allowed");
  });

  it("does not bind on a submit that failed, or whose item was rejected", async () => {
    const calls: Calls = { prepares: [], submits: [] };
    const failing = await startEmbedded({ routes: stubRoutes(calls, "throw") });
    const id = await preparedFor(failing.relay, ALICE);
    assert.equal(code(await failing.relay.client.post("/v1/userop/submit", { prepared_id: id, signature })), "signature_invalid");
    assert.deepEqual(failing.relay.owners().owners, []);

    const rejected = await startEmbedded({ routes: stubRoutes(calls) });
    const rejectedId = await preparedFor(rejected.relay, ALICE, "rejected");
    assert.equal(code(await rejected.relay.client.post("/v1/userop/submit", { prepared_id: rejectedId, signature })), "ok");
    assert.deepEqual(rejected.relay.owners().owners, [], "an item XO rejected proves nothing");
    const unsent = await startEmbedded({ routes: stubRoutes(calls) });
    const unsentId = await preparedFor(unsent.relay, ALICE, "prepared");
    assert.equal(code(await unsent.relay.client.post("/v1/userop/submit", { prepared_id: unsentId, signature })), "ok");
    assert.deepEqual(unsent.relay.owners().owners, []);
  });

  it("remembers the bound wallet across a restart; XO_OWNER, when set, overrides it", async () => {
    const calls: Calls = { prepares: [], submits: [] };
    const first = await startEmbedded({ routes: stubRoutes(calls) });
    await first.relay.client.post("/v1/userop/submit", { prepared_id: await preparedFor(first.relay, ALICE), signature });
    assert.deepEqual(first.relay.owners().owners, [ALICE.toLowerCase()]);
    await first.relay.close();

    const second = await startEmbedded({ dir: first.dir, routes: stubRoutes(calls) });
    assert.deepEqual(second.relay.owners(), { mode: "first_connected", owners: [ALICE.toLowerCase()] });
    assert.equal(code(await second.relay.client.post("/v1/auth/prepare", { owner: BOB })), "precondition_failed");
    await second.relay.close();

    const third = await startEmbedded({ dir: first.dir, env: { XO_OWNER: BOB }, routes: stubRoutes(calls) });
    assert.deepEqual(third.relay.owners(), { mode: "explicit", owners: [BOB] });
    assert.equal(code(await third.relay.client.post("/v1/auth/prepare", { owner: BOB })), "cap_exceeded");
    assert.equal(code(await third.relay.client.post("/v1/auth/prepare", { owner: ALICE })), "precondition_failed");
  });

  it("reads are open to any wallet: an unbound or other wallet can still ask for status and its own orders", async () => {
    const reads: RouteTable = {
      "POST /v1/orders/list": async () => ({ orders: [] }) as never,
    };
    const { relay } = await startEmbedded({ routes: { ...reads, ...stubRoutes({ prepares: [], submits: [] }) } });
    await relay.client.post("/v1/userop/submit", { prepared_id: await preparedFor(relay, ALICE), signature });
    assert.equal(code(await relay.client.post("/v1/orders/list", { owner: BOB })), "ok");
  });
});

describe("XO_ALLOW_ANY_OWNER serves every wallet, each kept apart", () => {
  it("never binds, and never refuses", async () => {
    const calls: Calls = { prepares: [], submits: [] };
    const { relay } = await startEmbedded({ env: { XO_ALLOW_ANY_OWNER: "1" }, routes: stubRoutes(calls) });
    await relay.client.post("/v1/userop/submit", { prepared_id: await preparedFor(relay, ALICE), signature });
    assert.deepEqual(relay.owners(), { mode: "any", owners: [] });
    for (const owner of [ALICE, BOB, CAROL]) assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner })), "cap_exceeded");
  });

  it("XO_OWNER wins when both are set", async () => {
    const { relay } = await startEmbedded({ env: { XO_ALLOW_ANY_OWNER: "1", XO_OWNER: ALICE }, routes: stubRoutes({ prepares: [], submits: [] }) });
    assert.equal(relay.owners().mode, "explicit");
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: BOB })), "precondition_failed");
  });
});
