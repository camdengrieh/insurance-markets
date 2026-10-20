import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RelayResult } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import { deriveAccount } from "../src/xo/account/derive.js";
import { ANVIL_ACCOUNT_0_OWNER } from "../src/xo/chain/constants.js";
import { OWNER_CONFIRM_MIN_DELAY_MS, OWNER_CONFIRM_WINDOW_MS, type EmbeddedRelay } from "../relay/embedded.js";
import type { PostHandler, RouteTable } from "../relay/types.js";
import { FakeClock } from "./relay-core-helpers.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";
import { startEmbedded, type StartOptions } from "./local-helpers.js";

// Review finding RT-2: in local mode the first-connected owner binding could be chosen by the agent. Without
// XO_OWNER (or XO_ALLOW_ANY_OWNER) the relay now refuses the first write for an unbound owner with a tool result
// that names the wallet and asks for the user's confirmation; only a repeat of the same call, after a pause and
// inside a window, goes through, and the binding still happens only at the first accepted signature. The routes are
// stubs: what is tested is the policy, not XO.

const ALICE = ANVIL_ACCOUNT_0_OWNER;
const BOB = (ANVIL_TEST_ACCOUNTS[1] as { address: string }).address;
const CAROL = (ANVIL_TEST_ACCOUNTS[2] as { address: string }).address;
const DIGEST = `0x${"ab".repeat(32)}` as const;
const signature = `0x${"11".repeat(65)}` as const;

const code = (result: RelayResult<unknown>): string => (result.ok ? "ok" : result.error.code);
const reason = (result: RelayResult<unknown>): unknown => (result.ok ? undefined : (result.error.details as { reason?: unknown } | undefined)?.reason);

function routes(prepares: string[]): RouteTable {
  const prepare: PostHandler<"/v1/auth/prepare"> = async (body) => {
    prepares.push(body.owner.toLowerCase());
    throw new RelayError("cap_exceeded", "stub: the handler ran");
  };
  const submit: PostHandler<"/v1/userop/submit"> = async () => ({ state: "submitted", user_op_hash: DIGEST });
  const funding: PostHandler<"/v1/funding/check"> = async () => {
    throw new RelayError("cap_exceeded", "stub: the funding handler ran");
  };
  return { "POST /v1/auth/prepare": prepare, "POST /v1/userop/submit": submit, "POST /v1/funding/check": funding };
}

async function boundBy(relay: EmbeddedRelay, owner: string): Promise<void> {
  const record = await relay.services.prepared.create({ kind: "userop", owner, account: deriveAccount(owner as `0x${string}`), digest: DIGEST, digestForm: "userOpHash", payload: {} });
  await relay.services.prepared.beginSend(record.id);
  await relay.services.prepared.resolve(record.id, "accepted");
  assert.equal(code(await relay.client.post("/v1/userop/submit", { prepared_id: record.id, signature })), "ok");
}

describe("the first owner needs a confirmation the user can see (RT-2)", () => {
  it("the first write for an unbound owner is refused with the wallet named, and the handler never ran", async () => {
    const prepares: string[] = [];
    const { relay } = await startEmbedded({ routes: routes(prepares), ownerConfirmation: true });
    const first = await relay.client.post("/v1/auth/prepare", { owner: ALICE });
    assert.equal(code(first), "precondition_failed");
    assert.equal(reason(first), "owner_confirmation_required");
    const text = JSON.stringify(first);
    assert.ok(text.toLowerCase().includes(ALICE.toLowerCase()), "the wallet to confirm is named in the tool result");
    assert.match(first.ok ? "" : first.error.message, /XO_OWNER/);
    assert.match(first.ok ? "" : first.error.message, /user/i);
    assert.deepEqual(prepares, []);
    assert.deepEqual(relay.ownerConfirmation(), { owner: ALICE.toLowerCase(), confirmed: false });
    assert.deepEqual(relay.owners(), { mode: "first_connected", owners: [] }, "nothing is bound by asking");
  });

  it("an immediate repeat is not a confirmation: the user has had no time to answer", async () => {
    const prepares: string[] = [];
    const { relay } = await startEmbedded({ routes: routes(prepares), ownerConfirmation: true });
    await relay.client.post("/v1/auth/prepare", { owner: ALICE });
    const again = await relay.client.post("/v1/auth/prepare", { owner: ALICE });
    assert.equal(code(again), "precondition_failed");
    assert.equal(reason(again), "owner_confirmation_pending");
    assert.deepEqual(prepares, []);
  });

  it("the same call after the pause and inside the window goes through, and stays confirmed", async () => {
    const prepares: string[] = [];
    const clock = new FakeClock("2026-10-19T12:00:00Z");
    const { relay } = await startEmbedded({ routes: routes(prepares), ownerConfirmation: true, clock });
    await relay.client.post("/v1/auth/prepare", { owner: ALICE });
    clock.advance(OWNER_CONFIRM_MIN_DELAY_MS);
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: ALICE })), "cap_exceeded", "the handler ran");
    assert.deepEqual(relay.ownerConfirmation(), { owner: ALICE.toLowerCase(), confirmed: true });
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: ALICE })), "cap_exceeded", "later calls need no new confirmation");
    assert.deepEqual(prepares, [ALICE.toLowerCase(), ALICE.toLowerCase()]);
  });

  it("a confirmation that was left alone for longer than the window starts over", async () => {
    const prepares: string[] = [];
    const clock = new FakeClock("2026-10-19T12:00:00Z");
    const { relay } = await startEmbedded({ routes: routes(prepares), ownerConfirmation: true, clock });
    await relay.client.post("/v1/auth/prepare", { owner: ALICE });
    clock.advance(OWNER_CONFIRM_WINDOW_MS + 1_000);
    const late = await relay.client.post("/v1/auth/prepare", { owner: ALICE });
    assert.equal(reason(late), "owner_confirmation_required", "asked again, not confirmed");
    assert.deepEqual(prepares, []);
  });

  it("another wallet needs its own confirmation: confirming Alice does not confirm Bob, and asking about Bob withdraws Alice's", async () => {
    const prepares: string[] = [];
    const clock = new FakeClock("2026-10-19T12:00:00Z");
    const { relay } = await startEmbedded({ routes: routes(prepares), ownerConfirmation: true, clock });
    await relay.client.post("/v1/auth/prepare", { owner: ALICE });
    clock.advance(OWNER_CONFIRM_MIN_DELAY_MS);
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: ALICE })), "cap_exceeded");
    const bob = await relay.client.post("/v1/auth/prepare", { owner: BOB });
    assert.equal(reason(bob), "owner_confirmation_required");
    assert.deepEqual(relay.ownerConfirmation(), { owner: BOB.toLowerCase(), confirmed: false });
    const alice = await relay.client.post("/v1/auth/prepare", { owner: ALICE });
    assert.equal(reason(alice), "owner_confirmation_required", "a newer question replaces the older confirmation");
  });

  it("the binding is still made by the first accepted signature, and a bound relay asks nothing more", async () => {
    const prepares: string[] = [];
    const clock = new FakeClock("2026-10-19T12:00:00Z");
    const { relay } = await startEmbedded({ routes: routes(prepares), ownerConfirmation: true, clock });
    await relay.client.post("/v1/auth/prepare", { owner: ALICE });
    clock.advance(OWNER_CONFIRM_MIN_DELAY_MS);
    await relay.client.post("/v1/auth/prepare", { owner: ALICE });
    await boundBy(relay, ALICE);
    assert.deepEqual(relay.owners(), { mode: "first_connected", owners: [ALICE.toLowerCase()] });
    assert.equal(relay.ownerConfirmation(), null, "nothing left to confirm once bound");
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: ALICE })), "cap_exceeded");
    assert.equal(reason(await relay.client.post("/v1/auth/prepare", { owner: CAROL })), "owner_not_allowed");
  });

  it("funding for an unbound owner is still owner_not_established, before any confirmation is asked", async () => {
    const { relay } = await startEmbedded({ routes: routes([]), ownerConfirmation: true });
    const refused = await relay.client.post("/v1/funding/check", { owner: ALICE, amount: "1" });
    assert.equal(reason(refused), "owner_not_established");
    assert.equal(relay.ownerConfirmation(), null);
  });

  it("the question survives a restart, so a restart is not a way to skip the pause or the window", async () => {
    const prepares: string[] = [];
    const clock = new FakeClock("2026-10-19T12:00:00Z");
    const first = await startEmbedded({ routes: routes(prepares), ownerConfirmation: true, clock });
    await first.relay.client.post("/v1/auth/prepare", { owner: ALICE });
    await first.relay.close();
    const second = await startEmbedded({ dir: first.dir, routes: routes(prepares), ownerConfirmation: true, clock });
    assert.deepEqual(second.relay.ownerConfirmation(), { owner: ALICE.toLowerCase(), confirmed: false });
    clock.advance(OWNER_CONFIRM_MIN_DELAY_MS);
    assert.equal(code(await second.relay.client.post("/v1/auth/prepare", { owner: ALICE })), "cap_exceeded");
  });

  it("XO_OWNER and XO_ALLOW_ANY_OWNER skip the step, as does ownerConfirmation: false", async () => {
    const variants: StartOptions[] = [{ env: { XO_OWNER: ALICE } }, { env: { XO_ALLOW_ANY_OWNER: "1" } }, { ownerConfirmation: false }];
    for (const options of variants) {
      const prepares: string[] = [];
      const { relay } = await startEmbedded({ routes: routes(prepares), ...options });
      assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: ALICE })), "cap_exceeded", JSON.stringify(options));
      assert.equal(relay.ownerConfirmation(), null);
    }
  });

  it("is on by default: an embedded relay with no option asks", async () => {
    const { relay } = await startEmbedded({ routes: routes([]) });
    assert.equal(reason(await relay.client.post("/v1/auth/prepare", { owner: ALICE })), "owner_confirmation_required");
  });
});
