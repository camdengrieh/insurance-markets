import assert from "node:assert/strict";
import { chmod, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { SAFETY_NOTICES } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import { describeStartFailure, createLocalRuntime, type LocalRuntime, type LocalStatus } from "../src/local/runtime.js";
import { MASTER_KEY_FILE, MasterKeyError } from "../src/local/master-key.js";
import { LocalPathError } from "../src/local/paths.js";
import { CryptoError } from "../relay/crypto.js";
import { StoreError } from "../relay/store.js";
import { FakeClock, TEST_KDF, TEST_MASTER_SECRET } from "./relay-core-helpers.js";
import { offlineFetch, takeBlockedRequests } from "./local-helpers.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";

// A public Anvil test account (never funded anywhere).
const BOB = (ANVIL_TEST_ACCOUNTS[1] as { address: string }).address;

// The local runtime: data directory, master key, start-up block and what happens when it cannot start.
// The relay inside is the real one with a cheap key derivation and no network.

const made: string[] = [];
const runtimes: LocalRuntime[] = [];
after(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close().catch(() => undefined);
  for (const dir of made.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function freshDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "xo-local-runtime-"));
  await chmod(dir, 0o700);
  made.push(dir);
  return dir;
}

function runtimeFor(env: Record<string, string>): { readonly runtime: LocalRuntime; readonly stderr: string[] } {
  const stderr: string[] = [];
  const clock = new FakeClock();
  const runtime = createLocalRuntime({
    env,
    stderr: { write: (text) => stderr.push(text) },
    relay: { kdf: TEST_KDF, allowWeakKdf: true, clock: clock.now, sleep: clock.sleep, fetch: offlineFetch, maintenance: false, isProcessAlive: () => false },
  });
  runtimes.push(runtime);
  return { runtime, stderr };
}

function ready(status: LocalStatus): Extract<LocalStatus, { state: "ready" }> {
  assert.equal(status.state, "ready", status.state === "failed" ? `${status.code}: ${status.message}` : status.state);
  return status as Extract<LocalStatus, { state: "ready" }>;
}

describe("starting", () => {
  it("is lazy: nothing is created until the first start or the first relay call", async () => {
    const dir = join(await freshDir(), "state");
    const { runtime, stderr } = runtimeFor({ XO_DATA_DIR: dir });
    assert.equal(runtime.status().state, "idle");
    await assert.rejects(stat(dir));
    assert.deepEqual(stderr, []);
    ready(await runtime.start());
    assert.ok((await stat(dir)).isDirectory());
  });

  it("creates the directory 0700 and a 0600 key file, and prints one block that names the data directory and the three safety notices", async () => {
    const dir = join(await freshDir(), "state");
    const { runtime, stderr } = runtimeFor({ XO_DATA_DIR: dir });
    const status = ready(await runtime.start());
    assert.equal(status.dataDirCreated, true);
    assert.equal(status.masterKey?.source, "file");
    assert.equal(status.masterKey?.created, true);
    if (process.platform !== "win32") {
      assert.equal((await stat(dir)).mode & 0o777, 0o700);
      assert.equal((await stat(join(dir, MASTER_KEY_FILE))).mode & 0o777, 0o600);
    }
    const block = stderr.join("");
    assert.equal(stderr.length, 1, "one write, one block");
    assert.ok(block.split("\n").length <= 16, "short");
    assert.ok(block.includes(dir), "names the data directory");
    assert.match(block, /all write paths are OFF/);
    assert.ok(block.includes("$10 per order, $50 per day"));
    for (const notice of [SAFETY_NOTICES.advisoryCaps, SAFETY_NOTICES.dedicatedCredential, SAFETY_NOTICES.approvalMode]) assert.ok(block.includes(notice), notice.slice(0, 40));
    assert.match(block, /approval-gated signing/);
    const key = (await readFile(join(dir, MASTER_KEY_FILE), "utf8")).trim();
    assert.ok(!block.includes(key), "the key is never printed");
    assert.ok(!(await readdir(dir)).some((name) => name.startsWith(".tmp")));
  });

  it("starts again on the same directory with the same key and says so without 'created now'", async () => {
    const dir = join(await freshDir(), "state");
    const first = runtimeFor({ XO_DATA_DIR: dir });
    ready(await first.runtime.start());
    await first.runtime.close();
    const second = runtimeFor({ XO_DATA_DIR: dir });
    const status = ready(await second.runtime.start());
    assert.equal(status.dataDirCreated, false);
    assert.equal(status.masterKey?.created, false);
    assert.ok(!second.stderr.join("").includes("created now"));
  });

  it("uses XO_MASTER_KEY when set and never prints it, nor any other key variable", async () => {
    const dir = join(await freshDir(), "state");
    const { runtime, stderr } = runtimeFor({ XO_DATA_DIR: dir, XO_MASTER_KEY: TEST_MASTER_SECRET, XO_RELAY_KEY: "test-relay-key-should-not-matter-1" });
    const status = ready(await runtime.start());
    assert.equal(status.masterKey?.source, "env");
    assert.ok(!(await readdir(dir)).includes(MASTER_KEY_FILE), "environment mode writes no key file");
    const block = stderr.join("");
    assert.match(block, /XO_MASTER_KEY from the environment/);
    assert.ok(!block.includes(TEST_MASTER_SECRET));
    assert.ok(!block.includes("test-relay-key"));
  });

  it("shows which write paths are on, which are held for want of a recorded live-test result, and how to arm one for your own test", async () => {
    const held = runtimeFor({ XO_DATA_DIR: join(await freshDir(), "s"), ENABLE_TRADING: "1", RELAY_ENFORCE_FLAG_FACTS: "1" });
    ready(await held.runtime.start());
    assert.match(held.stderr.join(""), /ENABLE_TRADING requested but held .*RELAY_ARM=ENABLE_TRADING/);
    const armed = runtimeFor({ XO_DATA_DIR: join(await freshDir(), "s"), ENABLE_TRADING: "1", RELAY_ARM: "ENABLE_TRADING" });
    ready(await armed.runtime.start());
    assert.match(armed.stderr.join(""), /ENABLE_TRADING ON/);
    const killed = runtimeFor({ XO_DATA_DIR: join(await freshDir(), "s"), XO_KILL_SWITCH: "1", ENABLE_TRADING: "1" });
    ready(await killed.runtime.start());
    assert.match(killed.stderr.join(""), /kill switch ON: every write is refused/);
  });

  it("says who is served, and warns about a bad setting by name only", async () => {
    const owner = runtimeFor({ XO_DATA_DIR: join(await freshDir(), "s"), XO_OWNER: BOB, XO_BUNDLER_URL: "http://not-https.example" });
    ready(await owner.runtime.start());
    const block = owner.stderr.join("");
    assert.match(block, /XO_OWNER names 1 wallet/);
    assert.match(block, /bad value and use their default: XO_BUNDLER_URL/);
    assert.ok(!block.includes("not-https"), "the bad value is not echoed");
  });

  it("runs without a master key when the credential store is off, and says no credentials are kept", async () => {
    const dir = join(await freshDir(), "s");
    const { runtime, stderr } = runtimeFor({ XO_DATA_DIR: dir, RELAY_CREDENTIAL_STORE: "off" });
    const status = ready(await runtime.start());
    assert.equal(status.masterKey, null);
    assert.match(stderr.join(""), /credential store OFF/);
    assert.ok(!(await readdir(dir)).includes(MASTER_KEY_FILE));
  });

  it("start() is idempotent and a relay call waits for it", async () => {
    const { runtime } = runtimeFor({ XO_DATA_DIR: join(await freshDir(), "s") });
    const [a, b] = await Promise.all([runtime.start(), runtime.start()]);
    assert.strictEqual(a, b);
    const reply = await runtime.handler({ method: "GET", path: "/v1/health", bodyText: undefined, signal: new AbortController().signal });
    assert.equal(reply.status, 200);
  });
});

describe("when it cannot start, every relay call says so and nothing falls back to something weaker", () => {
  async function refused(env: Record<string, string>, code: string, prepare?: (dir: string) => Promise<void>): Promise<{ readonly stderr: string; readonly reply: { status: number; body: { error: { code: string; message: string; details?: Record<string, unknown> } } } }> {
    const root = await freshDir();
    const dir = join(root, "s");
    await prepare?.(dir);
    const { runtime, stderr } = runtimeFor({ XO_DATA_DIR: dir, ...env });
    const status = await runtime.start();
    assert.equal(status.state, "failed");
    assert.equal(status.state === "failed" ? status.code : "", code);
    const reply = await runtime.handler({ method: "POST", path: "/v1/auth/prepare", bodyText: JSON.stringify({ owner: BOB }), signal: new AbortController().signal });
    const body = JSON.parse(reply.bodyText) as { error: { code: string; message: string; details?: Record<string, unknown> } };
    assert.equal(reply.status, 422);
    assert.equal(body.error.code, "precondition_failed");
    assert.equal(body.error.details?.["reason"], "local_relay_not_started");
    assert.equal(body.error.details?.["cause"], code);
    return { stderr: stderr.join(""), reply: { status: reply.status, body } };
  }

  it("a wrong master key: wrong_master_key, nothing opened, the right key still works afterwards", async () => {
    const root = await freshDir();
    const dir = join(root, "s");
    const first = runtimeFor({ XO_DATA_DIR: dir, XO_MASTER_KEY: TEST_MASTER_SECRET });
    ready(await first.runtime.start());
    await first.runtime.close();
    const second = runtimeFor({ XO_DATA_DIR: dir, XO_MASTER_KEY: "a-completely-different-master-key" });
    const status = await second.runtime.start();
    assert.equal(status.state === "failed" ? status.code : "", "wrong_master_key");
    assert.ok(!second.stderr.join("").includes("a-completely-different-master-key"));
    assert.match(second.stderr.join(""), /could not start its relay/);
    const reply = JSON.parse((await second.runtime.handler({ method: "GET", path: "/v1/health", bodyText: undefined, signal: new AbortController().signal })).bodyText) as { error: { code: string; message: string } };
    assert.equal(reply.error.code, "precondition_failed");
    assert.ok(!reply.error.message.includes("a-completely-different-master-key"));
    const third = runtimeFor({ XO_DATA_DIR: dir, XO_MASTER_KEY: TEST_MASTER_SECRET });
    ready(await third.runtime.start());
  });

  it("a key file that is missing while sealed credentials exist: key_missing_with_data", async () => {
    const root = await freshDir();
    const dir = join(root, "s");
    const first = runtimeFor({ XO_DATA_DIR: dir });
    ready(await first.runtime.start());
    await first.runtime.close();
    await rm(join(dir, MASTER_KEY_FILE));
    const second = runtimeFor({ XO_DATA_DIR: dir });
    const status = await second.runtime.start();
    assert.equal(status.state === "failed" ? status.code : "", "key_missing_with_data");
    assert.ok(!(await readdir(dir)).includes(MASTER_KEY_FILE), "no replacement key was made");
  });

  it("a data directory in use by another instance: data_dir_locked, and the first instance is unharmed", async () => {
    const root = await freshDir();
    const dir = join(root, "s");
    const first = runtimeFor({ XO_DATA_DIR: dir });
    ready(await first.runtime.start());
    const second = runtimeFor({ XO_DATA_DIR: dir });
    const status = await second.runtime.start();
    assert.equal(status.state === "failed" ? status.code : "", "data_dir_locked");
    assert.match(second.stderr.join(""), /Another xo-market process/);
    const reply = await first.runtime.handler({ method: "GET", path: "/v1/health", bodyText: undefined, signal: new AbortController().signal });
    assert.equal(reply.status, 200);
  });

  it("a data directory others can read: data_dir_insecure, and its mode is left alone", { skip: process.platform === "win32" }, async () => {
    const root = await freshDir();
    await chmod(root, 0o755);
    const { stderr } = await refused({ XO_DATA_DIR: root }, "data_dir_insecure");
    assert.match(stderr, /chmod 700/);
    assert.equal((await stat(root)).mode & 0o777, 0o755);
    await chmod(root, 0o700);
  });

  it("a relative XO_DATA_DIR and a bad XO_OWNER: data_dir_invalid and config_invalid, naming the variable only", async () => {
    const { runtime, stderr } = runtimeFor({ XO_DATA_DIR: "relative/place" });
    const status = await runtime.start();
    assert.equal(status.state === "failed" ? status.code : "", "data_dir_invalid");
    assert.match(stderr.join(""), /absolute path/);
    const owner = runtimeFor({ XO_DATA_DIR: join(await freshDir(), "s"), XO_OWNER: "secret-looking-nonsense" });
    const ownerStatus = await owner.runtime.start();
    assert.equal(ownerStatus.state === "failed" ? ownerStatus.code : "", "config_invalid");
    assert.match(owner.stderr.join(""), /XO_OWNER/);
    assert.ok(!owner.stderr.join("").includes("secret-looking-nonsense"));
  });

  it("makes no request to anyone while failing", async () => {
    takeBlockedRequests();
    const { runtime } = runtimeFor({ XO_DATA_DIR: "relative/place" });
    await runtime.start();
    assert.deepEqual(takeBlockedRequests(), []);
  });
});

describe("describeStartFailure never repeats what an error said", () => {
  it("a locked data directory names store.lock as the leftover to delete, does not advise a second data directory, and fits the relay error message limit once prefixed", () => {
    const { message } = describeStartFailure(new StoreError("locked", "x"));
    assert.match(message, /delete the leftover store\.lock/);
    assert.match(message, /Do not use a new XO_DATA_DIR/);
    assert.doesNotMatch(message, /give this one its own XO_DATA_DIR/);
    // failureReply puts "The local relay is not running: " in front, and a message over 500 characters is not a valid relay error.
    assert.ok(`The local relay is not running: ${message}`.length <= 500, String(message.length));
  });

  it("maps the known failures to fixed sentences and everything else to a generic one", () => {
    assert.equal(describeStartFailure(new StoreError("locked", "x")).code, "data_dir_locked");
    assert.equal(describeStartFailure(new StoreError("keyring_missing", "x")).code, "keyring_missing");
    assert.equal(describeStartFailure(new CryptoError("wrong_master_key", "x")).code, "wrong_master_key");
    assert.equal(describeStartFailure(new CryptoError("weak_kdf", "x")).code, "crypto_weak_kdf");
    assert.equal(describeStartFailure(new LocalPathError("data_dir_insecure", "fixed text")).message, "fixed text");
    assert.equal(describeStartFailure(new MasterKeyError("file_invalid", "fixed text")).message, "fixed text");
    const leaky = describeStartFailure(new RelayError("internal", `token=abcdef0123456789 ${["", "hom" + "e", "someone", "secret"].join("/")}`));
    assert.equal(leaky.code, "start_failed");
    assert.ok(!leaky.message.includes("abcdef") && !leaky.message.includes("someone"));
    const odd = describeStartFailure(Object.assign(new Error("password=hunter2 in /private/place"), { code: "EACCES" }));
    assert.equal(odd.code, "start_failed");
    assert.ok(!odd.message.includes("hunter2") && !odd.message.includes("private"));
    assert.ok(describeStartFailure("not an error").message.length > 0);
  });
});
