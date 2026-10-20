import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { Secret } from "../src/config.js";
import { CryptoError } from "../relay/crypto.js";
import { openRelayStorage } from "../relay/store.js";
import { MASTER_KEY_ENV, MASTER_KEY_FILE, MASTER_KEY_NEXT_ENV, MasterKeyError, recoverRotation, resolveMasterKey, rotateMasterKey } from "../src/local/master-key.js";
import { addr, TEST_KDF, TEST_MASTER_SECRET } from "./relay-core-helpers.js";

// The master key of the local vault: where it comes from, how it is kept, and that a wrong or lost one
// is refused rather than papered over. The key derivation is cheap here (tests only).

const made: string[] = [];
after(async () => {
  for (const dir of made.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "xo-local-key-"));
  await chmod(dir, 0o700);
  made.push(dir);
  return dir;
}

const WEAK = { kdf: TEST_KDF, allowWeakKdf: true } as const;
const ACCOUNT_A = addr(0xa1);
const ACCOUNT_B = addr(0xb2);
const TRIPLET_A = JSON.stringify({ apiKey: "key-a-test", secret: "secret-a-test", passphrase: "pass-a-test" });
const TRIPLET_B = JSON.stringify({ apiKey: "key-b-test", secret: "secret-b-test", passphrase: "pass-b-test" });

async function seedVault(dir: string, secret: Secret): Promise<void> {
  const storage = await openRelayStorage({ dir, masterSecret: secret, ...WEAK });
  try {
    await storage.secrets?.put(ACCOUNT_A, "xo_triplet", TRIPLET_A);
    await storage.secrets?.put(ACCOUNT_B, "xo_triplet", TRIPLET_B);
  } finally {
    await storage.close();
  }
}

async function readVault(dir: string, secret: Secret): Promise<{ readonly a: string | undefined; readonly b: string | undefined }> {
  const storage = await openRelayStorage({ dir, masterSecret: secret, ...WEAK });
  try {
    return { a: (await storage.secrets?.get(ACCOUNT_A, "xo_triplet"))?.reveal(), b: (await storage.secrets?.get(ACCOUNT_B, "xo_triplet"))?.reveal() };
  } finally {
    await storage.close();
  }
}

describe("resolveMasterKey", () => {
  it("takes XO_MASTER_KEY from the environment and writes nothing", async () => {
    const dir = await scratch();
    const resolved = await resolveMasterKey({ env: { [MASTER_KEY_ENV]: TEST_MASTER_SECRET }, dataDir: dir });
    assert.equal(resolved.source, "env");
    assert.equal(resolved.secret.reveal(), TEST_MASTER_SECRET);
    assert.deepEqual(await readdir(dir), []);
  });

  it("refuses an environment key of the wrong length without echoing it", async () => {
    const dir = await scratch();
    for (const bad of ["short", "x".repeat(1025)]) {
      await assert.rejects(resolveMasterKey({ env: { [MASTER_KEY_ENV]: bad }, dataDir: dir }), (error: unknown) => {
        assert.ok(error instanceof MasterKeyError);
        assert.equal(error.code, "env_invalid");
        assert.ok(!error.message.includes(bad));
        return true;
      });
    }
  });

  it("generates 32 random bytes once, keeps them in a 0600 file, and returns the same key afterwards", async () => {
    const dir = await scratch();
    const first = await resolveMasterKey({ env: {}, dataDir: dir });
    assert.equal(first.source, "file");
    assert.equal(first.created, true);
    assert.match(first.secret.reveal(), /^[0-9a-f]{64}$/);
    const file = join(dir, MASTER_KEY_FILE);
    if (process.platform !== "win32") assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.deepEqual((await readdir(dir)).sort(), [MASTER_KEY_FILE]);
    const second = await resolveMasterKey({ env: {}, dataDir: dir });
    assert.equal(second.created, false);
    assert.equal(second.secret.reveal(), first.secret.reveal());
  });

  it("gives two keys to two directories (the key is random, not derived from anything)", async () => {
    const a = await resolveMasterKey({ env: {}, dataDir: await scratch() });
    const b = await resolveMasterKey({ env: {}, dataDir: await scratch() });
    assert.notEqual(a.secret.reveal(), b.secret.reveal());
  });

  it("lets processes that start together end up with one and the same key", async () => {
    const dir = await scratch();
    const all = await Promise.all(Array.from({ length: 8 }, () => resolveMasterKey({ env: {}, dataDir: dir })));
    assert.equal(new Set(all.map((entry) => entry.secret.reveal())).size, 1);
    assert.equal(all.filter((entry) => entry.created).length, 1, "exactly one of them created it");
    assert.deepEqual((await readdir(dir)).sort(), [MASTER_KEY_FILE], "no temp file is left behind");
  });

  it("prints nothing that contains the key: a Secret shows as [redacted] in every rendering", async () => {
    const resolved = await resolveMasterKey({ env: {}, dataDir: await scratch() });
    const key = resolved.secret.reveal();
    assert.ok(!String(resolved.secret).includes(key));
    assert.ok(!JSON.stringify(resolved).includes(key));
    assert.ok(!JSON.stringify({ ...resolved, secret: resolved.secret }).includes(key));
  });

  it("environment wins over a key file, and says the file is stale", async () => {
    const dir = await scratch();
    await resolveMasterKey({ env: {}, dataDir: dir });
    const resolved = await resolveMasterKey({ env: { [MASTER_KEY_ENV]: TEST_MASTER_SECRET }, dataDir: dir });
    assert.equal(resolved.source, "env");
    assert.equal(resolved.staleFile, true);
  });

  it("tightens a key file that others could read, and says so", { skip: process.platform === "win32" }, async () => {
    const dir = await scratch();
    const first = await resolveMasterKey({ env: {}, dataDir: dir });
    await chmod(join(dir, MASTER_KEY_FILE), 0o644);
    const again = await resolveMasterKey({ env: {}, dataDir: dir });
    assert.equal(again.tightened, true);
    assert.equal(again.secret.reveal(), first.secret.reveal());
    assert.equal((await stat(join(dir, MASTER_KEY_FILE))).mode & 0o777, 0o600);
  });

  it("refuses a key file that is a symlink, is not a key, or is oversize, and never replaces it", async () => {
    const dir = await scratch();
    const target = join(dir, "elsewhere");
    await writeFile(target, `${"ab".repeat(32)}\n`, { mode: 0o600 });
    await symlink(target, join(dir, MASTER_KEY_FILE));
    await assert.rejects(resolveMasterKey({ env: {}, dataDir: dir }), (error: unknown) => error instanceof MasterKeyError && error.code === "file_not_regular");
    await rm(join(dir, MASTER_KEY_FILE));
    for (const content of ["not a key\n", "ab".repeat(31), `${"ab".repeat(32)}${"cd".repeat(600)}`, ""]) {
      await writeFile(join(dir, MASTER_KEY_FILE), content, { mode: 0o600 });
      await assert.rejects(resolveMasterKey({ env: {}, dataDir: dir }), (error: unknown) => error instanceof MasterKeyError && error.code === "file_invalid");
      assert.equal(await readFile(join(dir, MASTER_KEY_FILE), "utf8"), content, "the file is left exactly as it was");
    }
  });

  it("will not make a new key when sealed credentials already exist, because a new key could never open them", async () => {
    const dir = await scratch();
    await seedVault(dir, new Secret(TEST_MASTER_SECRET));
    await assert.rejects(resolveMasterKey({ env: {}, dataDir: dir }), (error: unknown) => error instanceof MasterKeyError && error.code === "key_missing_with_data");
    assert.ok(!(await readdir(dir)).includes(MASTER_KEY_FILE));
  });
});

describe("the vault and its key", () => {
  it("round-trips: what is sealed under the generated key opens after a restart with the same key", async () => {
    const dir = await scratch();
    const key = (await resolveMasterKey({ env: {}, dataDir: dir })).secret;
    await seedVault(dir, key);
    const again = (await resolveMasterKey({ env: {}, dataDir: dir })).secret;
    assert.deepEqual(await readVault(dir, again), { a: TRIPLET_A, b: TRIPLET_B });
  });

  it("refuses a wrong key with wrong_master_key, opens nothing and changes nothing", async () => {
    const dir = await scratch();
    await seedVault(dir, new Secret(TEST_MASTER_SECRET));
    const before = (await readdir(join(dir, "secrets"))).sort();
    await assert.rejects(
      openRelayStorage({ dir, masterSecret: new Secret("a-completely-different-master-key"), ...WEAK }),
      (error: unknown) => error instanceof CryptoError && error.code === "wrong_master_key",
    );
    assert.deepEqual((await readdir(join(dir, "secrets"))).sort(), before);
    assert.deepEqual(await readVault(dir, new Secret(TEST_MASTER_SECRET)), { a: TRIPLET_A, b: TRIPLET_B });
  });

  it("keeps every file under the vault at 0600 and every directory at 0700", { skip: process.platform === "win32" }, async () => {
    const dir = await scratch();
    await resolveMasterKey({ env: {}, dataDir: dir });
    await seedVault(dir, new Secret(TEST_MASTER_SECRET));
    const bad: string[] = [];
    const walk = async (rel: string): Promise<void> => {
      for (const entry of await readdir(join(dir, rel), { withFileTypes: true })) {
        const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
        const mode = (await stat(join(dir, path))).mode & 0o777;
        if (entry.isDirectory()) {
          if (mode !== 0o700) bad.push(`${path} ${mode.toString(8)}`);
          await walk(path);
        } else if (mode !== 0o600) bad.push(`${path} ${mode.toString(8)}`);
      }
    };
    await walk("");
    assert.deepEqual(bad, []);
  });
});

describe("rotation", () => {
  it("with a key file: re-seals everything under a new random key, the old key opens nothing, the new one opens all", async () => {
    const dir = await scratch();
    const oldKey = (await resolveMasterKey({ env: {}, dataDir: dir })).secret;
    await seedVault(dir, oldKey);
    const result = await rotateMasterKey({ env: {}, dataDir: dir, ...WEAK });
    assert.deepEqual({ source: result.source, accounts: result.accounts, secrets: result.secrets, alreadyRotated: result.alreadyRotated }, { source: "file", accounts: 2, secrets: 2, alreadyRotated: false });
    const newKey = (await resolveMasterKey({ env: {}, dataDir: dir })).secret;
    assert.notEqual(newKey.reveal(), oldKey.reveal());
    assert.deepEqual(await readVault(dir, newKey), { a: TRIPLET_A, b: TRIPLET_B });
    await assert.rejects(openRelayStorage({ dir, masterSecret: oldKey, ...WEAK }), (error: unknown) => error instanceof CryptoError && error.code === "wrong_master_key");
    const names = (await readdir(dir)).sort();
    assert.ok(!names.includes("secrets.prev") && !names.includes("secrets.next") && !names.includes("master.key.next"), `leftovers: ${names.join(",")}`);
    if (process.platform !== "win32") assert.equal((await stat(join(dir, MASTER_KEY_FILE))).mode & 0o777, 0o600);
  });

  it("with a key file and XO_MASTER_KEY_NEXT: refused, the passphrase is never written into master.key and the directory still starts", async () => {
    const dir = await scratch();
    const oldKey = (await resolveMasterKey({ env: {}, dataDir: dir })).secret;
    await seedVault(dir, oldKey);
    const before = await readFile(join(dir, MASTER_KEY_FILE), "utf8");
    const passphrase = "correct horse battery staple";
    await assert.rejects(rotateMasterKey({ env: { [MASTER_KEY_NEXT_ENV]: passphrase }, dataDir: dir, ...WEAK }), (error: unknown) => error instanceof MasterKeyError && error.code === "next_with_key_file" && !error.message.includes(passphrase));
    assert.equal(await readFile(join(dir, MASTER_KEY_FILE), "utf8"), before, "master.key is untouched");
    assert.ok(!before.includes(passphrase));
    assert.equal((await resolveMasterKey({ env: {}, dataDir: dir })).secret.reveal(), oldKey.reveal(), "the next start still works");
    assert.deepEqual(await readVault(dir, oldKey), { a: TRIPLET_A, b: TRIPLET_B });
  });

  it("with XO_MASTER_KEY: needs XO_MASTER_KEY_NEXT, re-seals under it, and the old value then fails", async () => {
    const dir = await scratch();
    const oldKey = new Secret(TEST_MASTER_SECRET);
    const nextValue = "the-next-master-key-0123456789";
    await seedVault(dir, oldKey);
    await assert.rejects(rotateMasterKey({ env: { [MASTER_KEY_ENV]: TEST_MASTER_SECRET }, dataDir: dir, ...WEAK }), (error: unknown) => error instanceof MasterKeyError && error.code === "next_missing");
    await assert.rejects(rotateMasterKey({ env: { [MASTER_KEY_ENV]: TEST_MASTER_SECRET, [MASTER_KEY_NEXT_ENV]: TEST_MASTER_SECRET }, dataDir: dir, ...WEAK }), (error: unknown) => error instanceof MasterKeyError && error.code === "next_same");
    await assert.rejects(rotateMasterKey({ env: { [MASTER_KEY_ENV]: TEST_MASTER_SECRET, [MASTER_KEY_NEXT_ENV]: "short" }, dataDir: dir, ...WEAK }), (error: unknown) => error instanceof MasterKeyError && error.code === "next_invalid");
    assert.deepEqual(await readVault(dir, oldKey), { a: TRIPLET_A, b: TRIPLET_B }, "the refusals changed nothing");
    const result = await rotateMasterKey({ env: { [MASTER_KEY_ENV]: TEST_MASTER_SECRET, [MASTER_KEY_NEXT_ENV]: nextValue }, dataDir: dir, ...WEAK });
    assert.equal(result.secrets, 2);
    assert.deepEqual(await readVault(dir, new Secret(nextValue)), { a: TRIPLET_A, b: TRIPLET_B });
    await assert.rejects(openRelayStorage({ dir, masterSecret: oldKey, ...WEAK }), CryptoError);
    assert.ok(!(await readdir(dir)).includes(MASTER_KEY_FILE), "environment mode writes no key file");
  });

  it("run again after it finished, it says the directory is already under the new key instead of failing", async () => {
    const dir = await scratch();
    const nextValue = "the-next-master-key-0123456789";
    await seedVault(dir, new Secret(TEST_MASTER_SECRET));
    const env = { [MASTER_KEY_ENV]: TEST_MASTER_SECRET, [MASTER_KEY_NEXT_ENV]: nextValue };
    await rotateMasterKey({ env, dataDir: dir, ...WEAK });
    const again = await rotateMasterKey({ env, dataDir: dir, ...WEAK });
    assert.equal(again.alreadyRotated, true);
    assert.deepEqual(await readVault(dir, new Secret(nextValue)), { a: TRIPLET_A, b: TRIPLET_B });
  });

  it("refuses to rotate when there is no key to start from, and when the old key is wrong", async () => {
    const empty = await scratch();
    await assert.rejects(rotateMasterKey({ env: {}, dataDir: empty, ...WEAK }), (error: unknown) => error instanceof MasterKeyError && error.code === "nothing_to_rotate");
    const dir = await scratch();
    await seedVault(dir, new Secret(TEST_MASTER_SECRET));
    await assert.rejects(rotateMasterKey({ env: { [MASTER_KEY_ENV]: "a-completely-different-master-key", [MASTER_KEY_NEXT_ENV]: "another-different-master-key" }, dataDir: dir, ...WEAK }), CryptoError);
    assert.deepEqual(await readVault(dir, new Secret(TEST_MASTER_SECRET)), { a: TRIPLET_A, b: TRIPLET_B });
  });

  it("does not run while the data directory is in use", async () => {
    const dir = await scratch();
    await seedVault(dir, new Secret(TEST_MASTER_SECRET));
    const open = await openRelayStorage({ dir, masterSecret: new Secret(TEST_MASTER_SECRET), ...WEAK });
    try {
      await assert.rejects(rotateMasterKey({ env: { [MASTER_KEY_ENV]: TEST_MASTER_SECRET, [MASTER_KEY_NEXT_ENV]: "the-next-master-key-0123456789" }, dataDir: dir, ...WEAK }));
    } finally {
      await open.close();
    }
    assert.deepEqual(await readVault(dir, new Secret(TEST_MASTER_SECRET)), { a: TRIPLET_A, b: TRIPLET_B });
  });
});

describe("recovery from a rotation that was cut short", () => {
  it("swap half done (secrets.prev but no secrets): the old vault is put back", async () => {
    const dir = await scratch();
    await seedVault(dir, new Secret(TEST_MASTER_SECRET));
    await rename(join(dir, "secrets"), join(dir, "secrets.prev"));
    await mkdir(join(dir, "secrets.next"));
    await writeFile(join(dir, "master.key.next"), "ab".repeat(32));
    assert.equal(await recoverRotation(dir), "rolled_back");
    assert.deepEqual(await readVault(dir, new Secret(TEST_MASTER_SECRET)), { a: TRIPLET_A, b: TRIPLET_B });
    assert.deepEqual((await readdir(dir)).filter((name) => name.startsWith("secrets.") || name.startsWith("master.key")), []);
  });

  it("swap done, clean-up pending (secrets.prev and secrets): the new key file is promoted and the old vault dropped", async () => {
    const dir = await scratch();
    const oldKey = (await resolveMasterKey({ env: {}, dataDir: dir })).secret;
    await seedVault(dir, oldKey);
    // Do a real rotation, then put back the state it would be in just after the swap.
    await rotateMasterKey({ env: {}, dataDir: dir, ...WEAK });
    const newKey = (await resolveMasterKey({ env: {}, dataDir: dir })).secret;
    await rename(join(dir, MASTER_KEY_FILE), join(dir, "master.key.next"));
    await writeFile(join(dir, MASTER_KEY_FILE), `${oldKey.reveal()}\n`, { mode: 0o600 });
    await mkdir(join(dir, "secrets.prev"));
    assert.equal(await recoverRotation(dir), "completed");
    assert.equal((await resolveMasterKey({ env: {}, dataDir: dir })).secret.reveal(), newKey.reveal());
    assert.deepEqual(await readVault(dir, newKey), { a: TRIPLET_A, b: TRIPLET_B });
  });

  it("staged but never swapped: the leftovers go and nothing else changes", async () => {
    const dir = await scratch();
    await seedVault(dir, new Secret(TEST_MASTER_SECRET));
    await mkdir(join(dir, "secrets.next"));
    await writeFile(join(dir, "master.key.next"), "cd".repeat(32));
    assert.equal(await recoverRotation(dir), "rolled_back");
    assert.deepEqual(await readVault(dir, new Secret(TEST_MASTER_SECRET)), { a: TRIPLET_A, b: TRIPLET_B });
    assert.equal(await recoverRotation(dir), "none");
  });
});
