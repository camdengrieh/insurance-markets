import assert from "node:assert/strict";
import { after, describe } from "node:test";

import { preparedItemPath } from "../src/relay/contract.js";
import { createAccountDirectory, createCredentialRoutes } from "../relay/credentials.js";
import { routes as creationRoutes } from "../relay/creation.js";
import { routes as healthRoutes } from "../relay/health.js";
import { createRelay, type Relay } from "../relay/main.js";
import { routes as preparedRoutes } from "../relay/prepared.js";
import { mergeRoutes } from "../relay/routes.js";
import { routes as useropRoutes } from "../relay/userops.js";
import { useMock } from "./mock-xo/testing.js";
import { deployed } from "./relay-credentials-helpers.js";
import { buildFile, createBody, hostedText, HOSTED_URI, ownerOf, readyOwner, startCreationRig } from "./relay-creation-helpers.js";
import { jsonHeaders, rawRequest, secret, tempDir, TEST_KDF, TEST_MASTER_SECRET, TEST_RELAY_KEY, type RawResponse, type TempDir } from "./relay-core-helpers.js";

// GET /v1/prepared/{prepared_id} for the XO kinds that need the local mock XO (the anvil chain): a user operation
// (kind userop), a market creation (kind create) and the XO login (kind auth, whose decoded block the server pipeline
// adds after the handler). Each comes back byte for byte as its prepare route sent it.

const dirs: TempDir[] = [];
const running: Relay[] = [];
after(async () => {
  for (const relay of running) await relay.close().catch(() => undefined);
  for (const made of dirs) await made.cleanup();
});

function post(port: number, path: string, body: unknown): Promise<RawResponse> {
  return rawRequest({ port, method: "POST", path, headers: jsonHeaders(TEST_RELAY_KEY), body: JSON.stringify(body) });
}

function read(port: number, preparedId: string): Promise<RawResponse> {
  return rawRequest({ port, method: "GET", path: preparedItemPath(preparedId), headers: { "x-relay-key": TEST_RELAY_KEY } });
}

function item(response: RawResponse): { readonly prepared_id: string; readonly kind: string; readonly decoded?: unknown } {
  assert.equal(response.status, 200, response.text);
  return response.json as { prepared_id: string; kind: string; decoded?: unknown };
}

const CREATION_ROUTES = { routes: { ...healthRoutes, ...useropRoutes, ...creationRoutes, ...preparedRoutes } };

describe("GET /v1/prepared/:id: the XO kinds round-trip byte for byte", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("a user operation (userop): deploy and enable trading", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startCreationRig(mock, { createOptions: CREATION_ROUTES });
    const alice = ownerOf(mock, 5);
    const prepared = await post(rig.relay.port, "/v1/userop/prepare", { owner: alice.address, action: "deploy_enable_trading", params: {} });
    const stored = item(prepared);
    assert.equal(stored.kind, "userop");
    const answer = await read(rig.relay.port, stored.prepared_id);
    assert.equal(answer.status, 200, answer.text);
    assert.equal(answer.text, prepared.text);
  });

  harness.it("a market creation (create)", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 900 };
    const { alice } = await readyOwner(mock, 6);
    const rig = await startCreationRig(mock, { createOptions: CREATION_ROUTES });
    const file = buildFile(mock);
    rig.files.set(HOSTED_URI, hostedText(file.metadata));
    const prepared = await post(rig.relay.port, "/v1/userop/prepare", createBody(alice.address, file));
    const stored = item(prepared);
    assert.equal(stored.kind, "create");
    const answer = await read(rig.relay.port, stored.prepared_id);
    assert.equal(answer.status, 200, answer.text);
    assert.equal(answer.text, prepared.text);
  });

  harness.it("the XO login (auth), with the decoded block the pipeline adds", async (mock) => {
    const dir = await tempDir("relay-prepared-get-auth-");
    dirs.push(dir);
    const advance = async (ms: number): Promise<void> => {
      mock.clock.advanceMs(Math.max(0, Math.ceil(ms)));
    };
    let relayRef: Relay | undefined;
    const relay = await createRelay({
      env: { RELAY_DATA_DIR: dir.dir, XO_RELAY_KEY: TEST_RELAY_KEY, RELAY_PORT: "0", ENABLE_TRADING: "1", RELAY_ENFORCE_FLAG_FACTS: "0" },
      masterSecret: secret(TEST_MASTER_SECRET),
      kdf: TEST_KDF,
      allowWeakKdf: true,
      maintenance: false,
      fetch: mock.asFetch,
      now: () => mock.clock.nowMs(),
      sleep: advance,
      isProcessAlive: () => false,
      accounts: createAccountDirectory({
        upstream: () => {
          if (relayRef === undefined) throw new Error("the relay is not up yet");
          return relayRef.services.upstream;
        },
      }),
      routes: mergeRoutes(healthRoutes, createCredentialRoutes({ sleep: advance }), preparedRoutes),
      http: { readRate: { capacity: 10_000, refillPerSecond: 10_000 }, writeRate: { capacity: 10_000, refillPerSecond: 10_000 } },
    });
    relayRef = relay;
    running.push(relay);
    const owner = await deployed(mock, 7);
    const prepared = await post(relay.port, "/v1/auth/prepare", { owner: owner.address });
    const stored = item(prepared);
    assert.equal(stored.kind, "auth");
    assert.ok(stored.decoded !== undefined, "the login carries the decoded block the pipeline added");
    const answer = await read(relay.port, stored.prepared_id);
    assert.equal(answer.status, 200, answer.text);
    assert.equal(answer.text, prepared.text);
    // The login lives 90 s.
    mock.clock.advanceMs(91_000);
    const late = await read(relay.port, stored.prepared_id);
    assert.equal(late.status, 410);
    assert.equal((late.json as { error: { code: string } }).error.code, "expired");
  });
});
