import assert from "node:assert/strict";
import type { Hex } from "viem";

import { SecretStore } from "../relay/store.js";
import { signL2 } from "../relay/credentials.js";
import { useMock } from "./mock-xo/testing.js";
import {
  connect,
  createWorld,
  deployed,
  expectRelayError,
  prepareLogin,
  requestsTo,
  signDigest,
  submitLogin,
  type World,
} from "./relay-credentials-helpers.js";
import type { Json } from "../relay/store.js";

// Failing-case tests for the credential refusals that the lifecycle tests reach only by their neighbours: each
// one pins a guard that, if it went missing, would let the relay overwrite, re-create or misuse a credential.

const harness = useMock({ chains: { xo: true, base: true } });

async function seedFlow(world: World, account: string, patch: Record<string, Json>): Promise<void> {
  await world.storage.state.transact((reader) => {
    const flow = (reader.get("credential_flow", account.toLowerCase()) as { [key: string]: Json } | undefined) ?? { v: 1, state: "none", keyTag: null };
    return { ops: [{ ns: "credential_flow", key: account.toLowerCase(), value: { ...flow, ...patch } }], result: undefined };
  });
}

harness.it("one create per account, ever: a flow that already made its create, with no secret stored, is refused before any POST (create_already_done)", async (mock, t) => {
  const world = await createWorld(mock, t);
  const owner = await deployed(mock, 0);
  const prepared = await prepareLogin(world, owner);
  const signature = await signDigest(owner, prepared.sign.expected_digest as Hex, "raw");
  await seedFlow(world, owner.smart, { createAttempts: 1, createOutcome: "stored", createStartedAtMs: 1 });
  await expectRelayError(submitLogin(world, prepared.prepared_id, signature), "precondition_failed", { reason: "create_already_done" });
  assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 0);
});

harness.it("the connect step itself refuses when XO said the key limit is reached, or refused the L1 login too often", async (mock, t) => {
  for (const [index, [patch, reason]] of (
    [
      [{ limitReached: true }, "key_limit_reached"],
      [{ l1Rejections: 6 }, "l1_rejections_exhausted"],
    ] as const
  ).entries()) {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, index);
    const prepared = await prepareLogin(world, owner);
    const signature = await signDigest(owner, prepared.sign.expected_digest as Hex, "raw");
    await seedFlow(world, owner.smart, patch);
    await expectRelayError(submitLogin(world, prepared.prepared_id, signature), "precondition_failed", { reason });
    assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 0, reason);
  }
});

harness.it("a stored credential that cannot be read is never treated as absent: no derive, no create, the secret is left alone", async (mock, t) => {
  const world = await createWorld(mock, t);
  const owner = await deployed(mock, 0);
  const prepared = await prepareLogin(world, owner);
  const signature = await signDigest(owner, prepared.sign.expected_digest as Hex, "raw");
  const secrets = world.storage.secrets as SecretStore;
  await secrets.put(owner.smart.toLowerCase(), "xo_triplet", "this is not a credential");
  await expectRelayError(submitLogin(world, prepared.prepared_id, signature), "internal", { reason: "stored_credential_unreadable" });
  assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 0);
  assert.equal((await secrets.get(owner.smart.toLowerCase(), "xo_triplet"))?.reveal(), "this is not a credential");
});

harness.it("a stored secret that cannot be decoded is not used to sign with the recorded decoding", async (mock, t) => {
  const world = await createWorld(mock, t);
  const owner = await deployed(mock, 0);
  await world.capabilities.record({ id: "OR10", state: "yes", source: "operator", value: "b64url-padded:path-with-query:addr-yes" });
  await connect(world, owner);
  const secrets = world.storage.secrets as SecretStore;
  const stored = JSON.parse((await secrets.get(owner.smart.toLowerCase(), "xo_triplet"))!.reveal()) as Record<string, string>;
  await secrets.put(owner.smart.toLowerCase(), "xo_triplet", JSON.stringify({ ...stored, secret: "!!!notbase64!!!" }), { replace: true });
  await expectRelayError(signL2(world.context(), { account: owner.smart, method: "GET", path: "/orders" }), "precondition_failed", { reason: "secret_not_decodable" });
});
