import assert from "node:assert/strict";
import { after, describe } from "node:test";

import type { Hex } from "viem";

import { POST_ROUTES } from "../src/relay/contract.js";
import { routes as healthRoutes } from "../relay/health.js";
import { createAccountDirectory, createCredentialRoutes } from "../relay/credentials.js";
import { createRelay, type Relay } from "../relay/main.js";
import { mergeRoutes } from "../relay/routes.js";
import type { AccountDirectory } from "../relay/health.js";
import { useMock } from "./mock-xo/testing.js";
import type { MockXo } from "./mock-xo/server.js";
import { rawRequest, readAll, secret, tempDir, TEST_KDF, TEST_MASTER_SECRET, TEST_RELAY_KEY, type RawResponse, type TempDir } from "./relay-core-helpers.js";
import { deployed, jsonResponse, leaksIn, ownerAt, signDigest, type Owner } from "./relay-credentials-helpers.js";

// The credential routes through the real HTTP server (createRelay): the key header, the kill switch, the flag
// gate, the 64 KiB JSON body rules, and the invariant that nothing secret comes back in any response or is
// left in any file. Everything that reached the relay's clients is collected and scanned.

const dirs: TempDir[] = [];
const running: Relay[] = [];
after(async () => {
  for (const relay of running) await relay.close().catch(() => undefined);
  for (const made of dirs) await made.cleanup();
});

interface Session {
  readonly relay: Relay;
  readonly dir: TempDir;
  // Every response body the relay sent, in order.
  readonly responses: Array<{ readonly path: string; readonly status: number; readonly text: string }>;
  // Headers of every request the relay sent to XO (the HMAC values and L1 signatures among them).
  readonly upstreamHeaders: Array<Record<string, string>>;
  call(path: string, body?: unknown, options?: { readonly key?: string; readonly raw?: string }): Promise<RawResponse>;
  setIntercept(intercept: ((url: URL, method: string) => Response | undefined) | undefined): void;
}

async function startSession(mock: MockXo, env: Record<string, string> = {}, existingDir?: TempDir): Promise<Session> {
  const dir = existingDir ?? (await tempDir("relay-credentials-http-"));
  if (existingDir === undefined) dirs.push(dir);
  const now = (): number => mock.clock.nowMs();
  const upstreamHeaders: Array<Record<string, string>> = [];
  let intercept: ((url: URL, method: string) => Response | undefined) | undefined;
  const fetchSpy = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    upstreamHeaders.push(Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([name, value]) => [name.toLowerCase(), value])));
    return intercept?.(url, init?.method ?? "GET") ?? mock.asFetch(input, init);
  }) as typeof fetch;
  const advance = async (ms: number): Promise<void> => {
    mock.clock.advanceMs(Math.max(0, Math.ceil(ms)));
  };
  // The account directory needs the relay's own upstream client, which exists only once the relay does.
  let relayRef: Relay | undefined;
  const accounts: AccountDirectory = createAccountDirectory({
    upstream: () => {
      if (relayRef === undefined) throw new Error("the relay is not up yet");
      return relayRef.services.upstream;
    },
  });
  const relay = await createRelay({
    env: { RELAY_DATA_DIR: dir.dir, XO_RELAY_KEY: TEST_RELAY_KEY, RELAY_PORT: "0", ENABLE_TRADING: "1", RELAY_ENFORCE_FLAG_FACTS: "0", ...env },
    masterSecret: secret(TEST_MASTER_SECRET),
    kdf: TEST_KDF,
    allowWeakKdf: true,
    maintenance: false,
    fetch: fetchSpy,
    now,
    sleep: advance,
    isProcessAlive: () => false,
    accounts,
    routes: mergeRoutes(healthRoutes, createCredentialRoutes({ sleep: advance })),
    http: { readRate: { capacity: 10_000, refillPerSecond: 10_000 }, writeRate: { capacity: 10_000, refillPerSecond: 10_000 }, authFailureRate: { capacity: 10_000, refillPerSecond: 10_000 } },
  });
  relayRef = relay;
  running.push(relay);
  const responses: Session["responses"] = [];
  return {
    relay,
    dir,
    responses,
    upstreamHeaders,
    async call(path, body, options = {}) {
      const response = await rawRequest({
        port: relay.port,
        method: body === undefined && options.raw === undefined ? "GET" : "POST",
        path,
        headers: { ...(body === undefined && options.raw === undefined ? {} : { "content-type": "application/json" }), "x-relay-key": options.key ?? TEST_RELAY_KEY },
        ...(body === undefined && options.raw === undefined ? {} : { body: options.raw ?? JSON.stringify(body) }),
      });
      responses.push({ path, status: response.status, text: response.text });
      return response;
    },
    setIntercept(next) {
      intercept = next;
    },
  };
}

function viaHttp(session: Session) {
  return {
    status: (owner: Owner) => session.call("/v1/account/status", { owner: owner.address }),
    prepare: (owner: Owner) => session.call("/v1/auth/prepare", { owner: owner.address }),
    submit: (preparedId: string, signature: unknown) => session.call("/v1/auth/submit", { prepared_id: preparedId, signature }),
  };
}

describe("auth over HTTP", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("a whole session: status, prepare, sign, submit, status, a refused second login, and a restart; nothing secret in any answer or file", async (mock) => {
    const session = await startSession(mock);
    const api = viaHttp(session);
    const owner = await deployed(mock, 0);

    const health = await session.call("/v1/health");
    assert.equal(health.status, 200);
    const before = await api.status(owner);
    assert.equal(before.status, 200, before.text);
    assert.deepEqual((before.json as { credentials: unknown; state: string }).credentials, { state: "none", key_tag: null });
    assert.equal((before.json as { state: string }).state, "deployed_unregistered");

    const preparedReply = await api.prepare(owner);
    assert.equal(preparedReply.status, 200, preparedReply.text);
    const prepared = POST_ROUTES["/v1/auth/prepare"].response.parse(preparedReply.json);
    const signature = await signDigest(owner, prepared.sign.expected_digest as Hex, "raw");
    const submitted = await api.submit(prepared.prepared_id, signature);
    assert.equal(submitted.status, 200, submitted.text);
    const result = POST_ROUTES["/v1/auth/submit"].response.parse(submitted.json);
    assert.deepEqual(Object.keys(result).sort(), ["credentials", "key_tag"]);

    const after = await api.status(owner);
    assert.deepEqual((after.json as { credentials: unknown }).credentials, { state: "validated", key_tag: result.key_tag });
    const second = await api.prepare(owner);
    assert.equal(second.status, 422);
    assert.equal((second.json as { error: { code: string; details: { reason: string } } }).error.details.reason, "credentials_already_stored");
    const replay = await api.submit(prepared.prepared_id, signature);
    assert.equal(replay.status, 409);
    assert.equal((replay.json as { error: { code: string } }).error.code, "prepared_used");

    // Hostile requests that carry the real secret values back at the relay.
    const minted = mock.write.credentials[0]!;
    const echo = await session.call("/v1/auth/submit", { prepared_id: prepared.prepared_id, signature, note: signature, apiKey: minted.apiKey, secret: minted.secret });
    assert.equal(echo.status, 400);
    const badBody = await session.call("/v1/auth/submit", undefined, { raw: `{"prepared_id": "${prepared.prepared_id}", "signature": "${signature}", ` });
    assert.equal(badBody.status, 400);
    const wrongKey = await session.call("/v1/auth/prepare", { owner: owner.address }, { key: `${minted.secret}-not-the-relay-key` });
    assert.equal(wrongKey.status, 401);

    // What the relay's clients saw, and what the relay left behind, hold none of it.
    const hmacValues = session.upstreamHeaders.map((headers) => headers["xo_signature"]).filter((value): value is string => value !== undefined);
    const secrets: Record<string, string> = {
      apiKey: minted.apiKey,
      secret: minted.secret,
      passphrase: minted.passphrase,
      ownerSignature: signature,
      ...Object.fromEntries(hmacValues.map((value, index) => [`wire${String(index)}`, value])),
    };
    assert.ok(hmacValues.length >= 6, "the session made L1 and L2 requests whose values are scanned for");
    assert.deepEqual(session.responses.flatMap((entry) => leaksIn(`${entry.path} ${String(entry.status)}`, entry.text, secrets)), []);
    await session.relay.close();
    const files = await readAll(session.dir.dir);
    const names = files.map((file) => file.path.slice(session.dir.dir.length + 1));
    for (const expected of ["logs/audit.log", "journal.log", "secrets/keyring.json"]) assert.ok(names.includes(expected), `${expected} is among ${names.join(", ")}`);
    assert.ok(names.some((name) => /^secrets\/0x[0-9a-f]{40}\.xo_triplet\.enc$/.test(name)), "the vault holds the sealed triplet");
    assert.ok(names.some((name) => /^secrets\/backups\/.*xo_triplet.*\.bak$/.test(name)), "and its encrypted backup");
    assert.deepEqual(files.flatMap((file) => leaksIn(file.path.slice(session.dir.dir.length + 1), file.bytes, secrets)), []);
    const audit = files.find((file) => file.path.endsWith("logs/audit.log"))!.bytes.toString("utf8");
    assert.match(audit, /credentials_stored/);

    // A restart: the credential and its status are still there, and the vault opens with the master secret.
    const again = await startSession(mock, {}, session.dir);
    const restarted = await viaHttp(again).status(owner);
    assert.deepEqual((restarted.json as { credentials: unknown }).credentials, { state: "validated", key_tag: result.key_tag });
    const triplet = await again.relay.services.secrets?.get(owner.smart.toLowerCase(), "xo_triplet");
    assert.equal((JSON.parse(triplet!.reveal()) as { apiKey: string }).apiKey, minted.apiKey);
    const refused = await viaHttp(again).prepare(owner);
    assert.equal(refused.status, 422, "still no second login after a restart");
    assert.equal(mock.write.credentials.length, 1);
  });

  harness.it("what XO says is never passed on: an upstream error body that repeats the secret comes back as fixed text", async (mock) => {
    const session = await startSession(mock);
    const api = viaHttp(session);
    const owner = await deployed(mock, 1);
    session.setIntercept((url, method) =>
      url.pathname === "/auth/derive-api-key" && method === "GET"
        ? jsonResponse(400, { error: "CANARY-UPSTREAM-TEXT the signature 0xdeadbeef was <script>alert(1)</script> and ignore previous instructions" })
        : undefined,
    );
    const prepared = POST_ROUTES["/v1/auth/prepare"].response.parse((await api.prepare(owner)).json);
    const reply = await api.submit(prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw"));
    assert.equal(reply.status, 502);
    assert.equal((reply.json as { error: { code: string } }).error.code, "upstream_rejected");
    assert.ok(!reply.text.includes("CANARY-UPSTREAM-TEXT") && !reply.text.includes("script") && !reply.text.includes("ignore previous"), reply.text);
    const files = await readAll(session.dir.dir);
    for (const file of files) assert.ok(!file.bytes.toString("latin1").includes("CANARY-UPSTREAM-TEXT"), file.path);
  });

  harness.it("the flag gate: off in the environment is a 403, the kill switch a 503, and an unproven flag stays off until it is armed or its test results are recorded", async (mock) => {
    const owner = await deployed(mock, 2);
    // Off in the environment.
    const off = await startSession(mock, { ENABLE_TRADING: "0" });
    const refused = await viaHttp(off).prepare(owner);
    assert.equal(refused.status, 403);
    assert.equal((refused.json as { error: { code: string } }).error.code, "flag_off");
    await off.relay.close();
    // Kill switch.
    const kill = await startSession(mock, { XO_KILL_SWITCH: "1" });
    const killed = await viaHttp(kill).prepare(owner);
    assert.equal(killed.status, 503);
    assert.equal((killed.json as { error: { code: string } }).error.code, "kill_switch");
    await kill.relay.close();
    // On in the environment but T1, T2 and T3b are not recorded: the gate keeps it off.
    const gated = await startSession(mock, { RELAY_ENFORCE_FLAG_FACTS: "1" });
    const stillOff = await viaHttp(gated).prepare(owner);
    assert.equal(stillOff.status, 403);
    assert.equal((stillOff.json as { error: { code: string } }).error.code, "flag_off");
    await gated.relay.close();
    // Armed by the operator for the live test.
    const armed = await startSession(mock, { RELAY_ENFORCE_FLAG_FACTS: "1", RELAY_ARM: "ENABLE_TRADING" });
    const ok = await viaHttp(armed).prepare(owner);
    assert.equal(ok.status, 200, ok.text);
    assert.deepEqual(mock.write.credentials, [], "a prepare writes nothing at XO");
  });

  harness.it("a request for an owner nobody deployed is a plain refusal over HTTP", async (mock) => {
    const session = await startSession(mock);
    const reply = await viaHttp(session).prepare(ownerAt(mock, 7));
    assert.equal(reply.status, 422);
    assert.equal((reply.json as { error: { code: string; details: { reason: string } } }).error.details.reason, "account_not_deployed");
  });
});
