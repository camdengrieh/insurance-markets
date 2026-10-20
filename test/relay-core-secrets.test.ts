import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { needService } from "../relay/config.js";
import { routes as healthRoutes } from "../relay/health.js";
import { createRelay, main, type Relay } from "../relay/main.js";
import type { RouteTable } from "../relay/types.js";
import { RelayError } from "../src/relay/errors.js";
import { addr, hex32, rawRequest, readAll, secret, tempDir, TEST_KDF, TEST_MASTER_SECRET, TEST_RELAY_KEY, TEST_RELAY_KEY_NEXT, type TempDir } from "./relay-core-helpers.js";

// The secrets scanner: run the relay through a busy session carrying distinctive TEST secrets, then
// search everything it left behind (the data directory, its logs, what it printed) for any of them,
// in every encoding a careless logger might use.

// Labelled TEST values: nobody's real credentials.
const CANARIES = {
  master: TEST_MASTER_SECRET,
  relayKey: TEST_RELAY_KEY,
  relayKeyNext: TEST_RELAY_KEY_NEXT,
  apiKey: "CANARY-API-KEY-0b6f2d41c8",
  apiSecret: "CANARY_SECRET_base64url_QWxsd29ya0FuZE5vUGxheQ",
  passphrase: "CANARY-PASSPHRASE-9d3e7a",
  signatureHex: `0x${"5a".repeat(64)}1b`,
  l2Signature: "CANARY-L2-HMAC-SIGNATURE-xyz987",
  baseRpcKey: "CANARY-BASE-RPC-KEY-4455",
  upstreamText: "CANARY-UPSTREAM-BODY-TEXT-8899",
  errorText: "CANARY-ERROR-MESSAGE-7766",
} as const;

const OWNER = addr(0x11);
const ACCOUNT = addr(0x22);
const BASE_RPC = `https://base-rpc.example.org/v2/${CANARIES.baseRpcKey}`;

function variants(value: string): string[] {
  const out = new Set<string>();
  const add = (text: string): void => {
    out.add(text);
    out.add(text.toLowerCase());
  };
  add(value);
  add(JSON.stringify(value).slice(1, -1));
  add(Buffer.from(value).toString("base64"));
  add(Buffer.from(value).toString("base64").replace(/=+$/, ""));
  add(Buffer.from(value).toString("base64url"));
  add(Buffer.from(value).toString("hex"));
  add(encodeURIComponent(value));
  if (value.startsWith("0x")) add(value.slice(2));
  return [...out].filter((entry) => entry.length >= 8);
}

const ALL_VARIANTS: Array<{ readonly name: string; readonly text: string }> = Object.entries(CANARIES).flatMap(([name, value]) => variants(value).map((text) => ({ name, text })));

function findLeaks(label: string, haystack: Buffer | string): string[] {
  const bytes = typeof haystack === "string" ? Buffer.from(haystack) : haystack;
  const text = bytes.toString("latin1");
  const lower = text.toLowerCase();
  return ALL_VARIANTS.filter((variant) => text.includes(variant.text) || lower.includes(variant.text.toLowerCase())).map((variant) => `${label} holds ${variant.name} (${variant.text.slice(0, 12)}...)`);
}

const dirs: TempDir[] = [];
const running: Relay[] = [];
after(async () => {
  for (const relay of running) await relay.close().catch(() => undefined);
  for (const made of dirs) await made.cleanup();
});

const submitRoute: NonNullable<RouteTable["POST /v1/order/submit"]> = async (body, context) => {
  const prepared = needService(context, "prepared");
  const upstream = needService(context, "upstream");
  const record = await prepared.beginSend(body.prepared_id);
  // A careless handler would put the signature, the HMAC headers and the upstream text into logs,
  // errors or stored state. This one only uses them, as real code must.
  const response = await upstream.request({
    method: "POST",
    url: "https://orderbooks.xo.market/order",
    headers: { XO_API_KEY: CANARIES.apiKey, XO_SIGNATURE: CANARIES.l2Signature, XO_PASSPHRASE: CANARIES.passphrase },
    body: JSON.stringify({ signature: typeof body.signature === "string" ? body.signature : "object", note: CANARIES.upstreamText }),
    purpose: "post_order",
  });
  await prepared.resolve(record.id, "rejected", "http_400");
  if (!response.ok) throw new RelayError("upstream_rejected", "The order book refused the order.", { status: response.status });
  return { state: "accepted", order_hash: hex32(1) };
};

const throwingRoute: NonNullable<RouteTable["POST /v1/orders/list"]> = async () => {
  throw new Error(`failed with ${CANARIES.errorText} and ${CANARIES.apiSecret} at ${BASE_RPC}`);
};

async function walkModes(dir: string): Promise<string[]> {
  const problems: string[] = [];
  const mode = (await stat(dir)).mode & 0o777;
  if ((mode & 0o077) !== 0) problems.push(`${dir} is mode ${mode.toString(8)}`);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) problems.push(...(await walkModes(path)));
    else if (((await stat(path)).mode & 0o077) !== 0) problems.push(`${path} is mode ${((await stat(path)).mode & 0o777).toString(8)}`);
  }
  return problems;
}

describe("the scanner itself", () => {
  it("finds a secret in plain text, base64, hex and escaped forms (so a clean result means something)", () => {
    for (const encode of [(v: string) => v, (v: string) => Buffer.from(v).toString("base64"), (v: string) => Buffer.from(v).toString("hex"), (v: string) => Buffer.from(v).toString("base64url"), (v: string) => JSON.stringify(v).slice(1, -1), encodeURIComponent]) {
      assert.ok(findLeaks("probe", `prefix ${encode(CANARIES.apiSecret)} suffix`).length > 0);
      assert.ok(findLeaks("probe", Buffer.from(`xx ${encode(CANARIES.passphrase)} yy`)).length > 0);
    }
    assert.ok(findLeaks("probe", CANARIES.signatureHex.slice(2)).length > 0, "a signature without its 0x");
    assert.ok(findLeaks("probe", CANARIES.signatureHex.toUpperCase().replace("0X", "0x")).length > 0, "upper case");
    assert.deepEqual(findLeaks("probe", "nothing to see here"), []);
  });
});

describe("after a session that handled secrets", () => {
  it("leaves none of them anywhere on disk or in anything it printed", async () => {
    const made = await tempDir();
    dirs.push(made);
    const captured: string[] = [];
    const realStdout = process.stdout.write.bind(process.stdout);
    const realStderr = process.stderr.write.bind(process.stderr);
    const spy = (real: typeof process.stdout.write) =>
      ((chunk: unknown, ...rest: unknown[]) => {
        if (typeof chunk === "string" || chunk instanceof Uint8Array) captured.push(Buffer.from(chunk).toString("latin1"));
        return (real as (...args: unknown[]) => boolean)(chunk, ...rest);
      }) as typeof process.stdout.write;

    const env = {
      RELAY_DATA_DIR: made.dir,
      XO_RELAY_KEY: CANARIES.relayKey,
      XO_RELAY_KEY_NEXT: CANARIES.relayKeyNext,
      RELAY_PORT: "0",
      RELAY_BASE_RPC_URL: BASE_RPC,
      RELAY_ENFORCE_FLAG_FACTS: "0",
      ENABLE_TRADING: "1",
    };
    const upstreamCalls: string[] = [];
    const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
      upstreamCalls.push(`${init?.method ?? "GET"} ${String(input).split("?")[0]}`);
      if (String(input).includes("base-rpc")) throw new TypeError(`connect failed to ${String(input)} ${CANARIES.errorText}`);
      return new Response(JSON.stringify({ error: `rejected ${CANARIES.upstreamText}` }), { status: 400, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    process.stdout.write = spy(realStdout);
    process.stderr.write = spy(realStderr);
    try {
      let relay = await createRelay({
        env,
        masterSecret: secret(CANARIES.master),
        kdf: TEST_KDF,
        allowWeakKdf: true,
        maintenance: false,
        fetch: fetchStub,
        routes: { ...healthRoutes, "POST /v1/order/submit": submitRoute, "POST /v1/orders/list": throwingRoute },
        http: { readRate: { capacity: 10_000, refillPerSecond: 10_000 }, writeRate: { capacity: 10_000, refillPerSecond: 10_000 }, authFailureRate: { capacity: 10_000, refillPerSecond: 10_000 } },
      });
      running.push(relay);
      const call = (path: string, init: { method?: string; key?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
        rawRequest({
          port: relay.port,
          method: init.method ?? (init.body === undefined ? "GET" : "POST"),
          path,
          headers: { ...(init.body === undefined ? {} : { "content-type": "application/json" }), "x-relay-key": init.key ?? CANARIES.relayKey, ...init.headers },
          ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        });

      // 1. The vault.
      const triplet = JSON.stringify({ key: CANARIES.apiKey, secret: CANARIES.apiSecret, passphrase: CANARIES.passphrase });
      await relay.services.secrets?.put(ACCOUNT, "hmac_triplet", triplet);
      assert.equal((await relay.services.secrets?.get(ACCOUNT, "hmac_triplet"))?.reveal(), triplet, "the vault works (the scan is not vacuous)");

      // 2. A send that carries a signature and HMAC headers upstream and gets text back.
      const record = await relay.services.prepared.create({ kind: "order", owner: OWNER, account: ACCOUNT, digest: hex32(0xd1) as `0x${string}`, digestForm: "kernelWrappedOrderHash", payload: { note: "terms only" } });
      const sent = await call("/v1/order/submit", { body: { prepared_id: record.id, signature: CANARIES.signatureHex } });
      assert.equal(sent.status, 502, sent.text);
      assert.equal(upstreamCalls.length, 1);
      const sentObject = await relay.services.prepared.create({ kind: "order", owner: OWNER, account: ACCOUNT, digest: hex32(0xd2) as `0x${string}`, digestForm: "kernelWrappedOrderHash", payload: null });
      await call("/v1/order/submit", { body: { prepared_id: sentObject.id, signature: { r: hex32(0x5a5a), s: hex32(0x5a5b), v: 27 } } });

      // 3. Failures: a wrong key (with a secret-looking value), a bad body, a handler that throws a
      //    message full of secrets, and the other key during a rotation.
      assert.equal((await call("/v1/health", { key: `${CANARIES.apiKey}-wrong-key` })).status, 401);
      assert.equal((await call("/v1/order/submit", { body: { prepared_id: "nope", signature: CANARIES.signatureHex, extra: CANARIES.passphrase } })).status, 400);
      const thrown = await call("/v1/orders/list", { body: { owner: OWNER } });
      assert.equal(thrown.status, 500);
      assert.equal((await call("/v1/health", { key: CANARIES.relayKeyNext })).status, 200);

      // 4. Upstream failure on the Base RPC host, whose URL carries a key.
      await assert.rejects(relay.services.upstream.request({ method: "POST", url: BASE_RPC, body: "{}", purpose: "base_call", headers: { accept: "application/json" } }));

      // 5. Things written by the relay's own services, as a caller might get careless.
      await relay.services.capabilities.record({ id: "OR10", state: "yes", source: "probe", note: `decoded with ${CANARIES.apiSecret} and ${CANARIES.relayKey}` });
      await relay.services.tripwires.trip({ id: "exchange_upgraded", detail: `saw ${CANARIES.apiSecret}` });
      await relay.services.alerts.raise({ id: "careless_alert", severity: "warn", message: `the relay key is ${CANARIES.relayKey} and the master is ${CANARIES.master}` });
      await relay.services.audit.write({ ev: "error", note: `the key ${CANARIES.relayKeyNext} and the signature ${CANARIES.signatureHex} and ${CANARIES.master}`, sync: true });

      // 6. A restart (so the journal is replayed and a startup line is written again).
      await relay.close();
      relay = await createRelay({ env, masterSecret: secret(CANARIES.master), kdf: TEST_KDF, allowWeakKdf: true, maintenance: false, fetch: fetchStub });
      running.push(relay);
      await relay.services.state.compact();
      await relay.close();

      // 7. The command line: --check and a full run, with their own output.
      const out: string[] = [];
      const err: string[] = [];
      const sink = (lines: string[]) => ({ write: (text: string) => void lines.push(text) });
      assert.equal(await main(["--check"], { ...env, RELAY_MASTER_KEY: CANARIES.master }, { stdout: sink(out), stderr: sink(err) }), 0);
      let stop!: () => void;
      const started = main([], { ...env, RELAY_MASTER_KEY: CANARIES.master }, {
        stdout: sink(out),
        stderr: sink(err),
        stopSignal: new Promise<void>((resolve) => (stop = resolve)),
        createOptions: { kdf: TEST_KDF, allowWeakKdf: true, maintenance: false, fetch: fetchStub },
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      stop();
      assert.equal(await started, 0);
      assert.equal(await main([], { ...env, XO_RELAY_KEY: "tiny", RELAY_MASTER_KEY: CANARIES.master }, { stdout: sink(out), stderr: sink(err) }), 2);
      captured.push(...out, ...err);
    } finally {
      process.stdout.write = realStdout;
      process.stderr.write = realStderr;
    }

    // Everything it left in the data directory.
    const files = await readAll(made.dir);
    const names = files.map((file) => file.path.slice(made.dir.length + 1)).sort();
    for (const expected of ["journal.log", "logs/audit.log", "logs/alerts.log", "snapshot.json", "secrets/keyring.json"]) assert.ok(names.includes(expected), `${expected} is among ${names.join(", ")}`);
    assert.ok(names.some((name) => /^secrets\/0x[0-9a-f]{40}\.hmac_triplet\.enc$/.test(name)));
    assert.ok(names.some((name) => /^secrets\/backups\/.*\.bak$/.test(name)));
    const leaks = files.flatMap((file) => findLeaks(file.path.slice(made.dir.length + 1), file.bytes));
    assert.deepEqual(leaks, []);

    // Everything it printed.
    assert.ok(captured.length > 0, "the run printed something to scan");
    assert.deepEqual(findLeaks("output", captured.join("")), []);

    // And the permissions of what it wrote.
    assert.deepEqual(await walkModes(made.dir), []);
  });

  it("holds the audit log to its promise: JSON lines, a bounded line length, no stray fields", async () => {
    const made = await tempDir();
    dirs.push(made);
    const relay = await createRelay({
      env: { RELAY_DATA_DIR: made.dir, XO_RELAY_KEY: CANARIES.relayKey, RELAY_PORT: "0", RELAY_CREDENTIAL_STORE: "off", RELAY_ENFORCE_FLAG_FACTS: "0" },
      maintenance: false,
      routes: { ...healthRoutes },
    });
    running.push(relay);
    await rawRequest({ port: relay.port, headers: { "x-relay-key": CANARIES.relayKey } });
    await rawRequest({ port: relay.port, headers: { "x-relay-key": "wrong-wrong-wrong-wrong-1" } });
    await relay.close();
    const log = (await readAll(join(made.dir, "logs"))).find((file) => file.path.endsWith("audit.log"));
    assert.ok(log !== undefined);
    const allowed = new Set(["v", "ts", "ev", "rid", "route", "status", "code", "outcome", "owner", "account", "pid", "digest_tag", "hash", "amount_atomic", "state", "host", "flag", "ms", "note", "dropped"]);
    const lines = log.bytes.toString("utf8").trim().split("\n");
    assert.ok(lines.length >= 4);
    for (const line of lines) {
      assert.ok(Buffer.byteLength(line) <= 2048);
      const record = JSON.parse(line) as Record<string, unknown>;
      for (const key of Object.keys(record)) assert.ok(allowed.has(key), `unexpected field ${key}`);
    }
  });
});
