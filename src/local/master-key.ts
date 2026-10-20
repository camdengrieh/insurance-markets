import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open, readdir, rename, rm, unlink } from "node:fs/promises";
import { join } from "node:path";

import { Secret } from "../config.js";
import { checkMasterSecret, createKeyring, CryptoError, DEFAULT_KDF, unlockKeyring, parseKeyring, type KdfParams } from "../../relay/crypto.js";
import { atomicWriteFile, openRelayStorage, realFs, SecretStore, type RelayStorage } from "../../relay/store.js";
import type { FlagEnv } from "../relay/flags.js";

// The master key of the local credential store (the vault that holds the user's XO API credentials,
// AES-256-GCM per record, see relay/crypto.ts).
//
// Where it comes from, strongest first:
//   1. XO_MASTER_KEY in the environment (16 to 1024 characters). Nothing is written to disk. Put it in
//      the OS keychain or a secrets manager and inject it when the client starts the plugin.
//   2. Otherwise a key file, <data dir>/master.key: 32 random bytes as 64 hex digits, created once with
//      mode 0600, never printed and never logged.
//
// What the key file does and does not do. It keeps the vault unreadable to someone who only gets a copy
// of the credential files (a backup, a synced folder, a shared disk image). It does NOT protect against
// malware or another process running as the same user: that code can read the key file as easily as
// this process can. If that matters to you, use XO_MASTER_KEY from a keychain, and do not fund an
// account whose credentials sit on a machine you do not trust.
//
// A new key is never generated while sealed credentials exist, because a fresh key could not open them.

export const MASTER_KEY_ENV = "XO_MASTER_KEY";
export const MASTER_KEY_NEXT_ENV = "XO_MASTER_KEY_NEXT";
export const MASTER_KEY_FILE = "master.key";
const KEY_FILE_NEXT = "master.key.next";
const KEY_FILE_PATTERN = /^[0-9a-f]{64}$/;
const MAX_KEY_FILE_BYTES = 1024;
const NO_FOLLOW = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;

export type MasterKeyErrorCode =
  | "env_invalid"
  | "file_unreadable"
  | "file_invalid"
  | "file_not_regular"
  | "file_foreign"
  | "key_missing_with_data"
  | "nothing_to_rotate"
  | "next_missing"
  | "next_invalid"
  | "next_same"
  | "next_with_key_file"
  | "rotation_failed";

// Fixed text, never a key and never a path.
export class MasterKeyError extends Error {
  readonly code: MasterKeyErrorCode;

  constructor(code: MasterKeyErrorCode, message: string) {
    super(message);
    this.name = "MasterKeyError";
    this.code = code;
  }
}

export type MasterKeySource = "env" | "file";

export interface ResolvedMasterKey {
  readonly secret: Secret;
  readonly source: MasterKeySource;
  // The key file was created by this call.
  readonly created: boolean;
  // The key file had loose permissions and was tightened to 0600.
  readonly tightened: boolean;
  // XO_MASTER_KEY is set and a key file is also present: the file is ignored.
  readonly staleFile: boolean;
}

export interface ResolveOptions {
  readonly env: FlagEnv;
  readonly dataDir: string;
  // False: never create a key file (used by rotation, which needs the existing key).
  readonly create?: boolean;
}

function envKey(env: FlagEnv, name: string): string | undefined {
  const raw = env[name];
  if (typeof raw !== "string") return undefined;
  const value = raw.replace(/[\r\n]+$/, "");
  return value === "" ? undefined : value;
}

function checkEnvKey(value: string, name: string, code: MasterKeyErrorCode): Secret {
  try {
    checkMasterSecret(value);
  } catch {
    throw new MasterKeyError(code, `${name} must be 16 to 1024 characters.`);
  }
  return new Secret(value);
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return false;
    throw error;
  }
}

// Reads the key file without following a symlink, checks that it is a plain file of ours, and tightens
// loose permissions. Returns undefined when there is no such file.
async function readKeyFile(path: string): Promise<{ readonly key: string; readonly tightened: boolean } | undefined> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | NO_FOLLOW);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === "ENOENT") return undefined;
    if (code === "ELOOP") throw new MasterKeyError("file_not_regular", "master.key is a symbolic link, which is refused.");
    throw new MasterKeyError("file_unreadable", "master.key could not be opened.");
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new MasterKeyError("file_not_regular", "master.key is not a regular file.");
    let tightened = false;
    if (process.platform !== "win32") {
      const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
      if (uid !== undefined && info.uid !== uid) throw new MasterKeyError("file_foreign", "master.key belongs to another user, so it will not be used.");
      if ((info.mode & 0o077) !== 0) {
        await handle.chmod(0o600);
        tightened = true;
      }
    }
    if (info.size > MAX_KEY_FILE_BYTES) throw new MasterKeyError("file_invalid", "master.key is not a master key file.");
    const text = (await handle.readFile({ encoding: "utf8" })).trim();
    if (!KEY_FILE_PATTERN.test(text)) {
      throw new MasterKeyError("file_invalid", "master.key does not hold a 64-digit hex key. It is not replaced, because a new key could not open existing credentials.");
    }
    return { key: text, tightened };
  } finally {
    await handle.close();
  }
}

// Writes a new key file exclusively (temp file, fsync, hard link, which fails if the file exists), so
// two processes starting together end up reading one and the same key.
async function createKeyFile(dataDir: string, path: string): Promise<string | undefined> {
  const key = randomBytes(32).toString("hex");
  const temp = join(dataDir, `${MASTER_KEY_FILE}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`);
  const handle = await open(temp, "wx", 0o600);
  try {
    await handle.writeFile(`${key}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temp, path);
    return key;
  } catch (error) {
    if ((error as { code?: unknown }).code === "EEXIST") return undefined;
    throw error;
  } finally {
    await unlink(temp).catch(() => undefined);
  }
}

export async function resolveMasterKey(options: ResolveOptions): Promise<ResolvedMasterKey> {
  const keyPath = join(options.dataDir, MASTER_KEY_FILE);
  const fromEnv = envKey(options.env, MASTER_KEY_ENV);
  if (fromEnv !== undefined) {
    const secret = checkEnvKey(fromEnv, MASTER_KEY_ENV, "env_invalid");
    return { secret, source: "env", created: false, tightened: false, staleFile: await exists(keyPath) };
  }
  const existing = await readKeyFile(keyPath);
  if (existing !== undefined) return { secret: new Secret(existing.key), source: "file", created: false, tightened: existing.tightened, staleFile: false };
  if (options.create === false) throw new MasterKeyError("nothing_to_rotate", "There is no master key to use: XO_MASTER_KEY is not set and the data directory has no master.key.");
  // No key anywhere. If sealed credentials are already here, a new key would lock them forever.
  if (await exists(join(options.dataDir, "secrets", "keyring.json"))) {
    throw new MasterKeyError(
      "key_missing_with_data",
      "This data directory already holds sealed credentials, but XO_MASTER_KEY is not set and master.key is missing. Set XO_MASTER_KEY to the key you used, or restore master.key from your backup. A new key could not open them.",
    );
  }
  const created = await createKeyFile(options.dataDir, keyPath);
  if (created !== undefined) {
    await fsyncDir(options.dataDir);
    return { secret: new Secret(created), source: "file", created: true, tightened: false, staleFile: false };
  }
  // Lost the race to another starting process: read what it wrote.
  const winner = await readKeyFile(keyPath);
  if (winner === undefined) throw new MasterKeyError("file_unreadable", "master.key could not be read after it was created.");
  return { secret: new Secret(winner.key), source: "file", created: false, tightened: winner.tightened, staleFile: false };
}

async function fsyncDir(dir: string): Promise<void> {
  try {
    const handle = await open(dir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Some file systems cannot sync a directory.
  }
}

// ---- rotation ----------------------------------------------------------------------------------------------------------------

export interface RotateOptions {
  readonly env: FlagEnv;
  readonly dataDir: string;
  readonly kdf?: KdfParams;
  readonly allowWeakKdf?: boolean;
}

export interface RotateResult {
  readonly source: MasterKeySource;
  readonly accounts: number;
  readonly secrets: number;
  // True when the data directory was already under the new key (a rotation that was finished earlier).
  readonly alreadyRotated: boolean;
}

const names = (dataDir: string) => ({
  cur: join(dataDir, "secrets"),
  next: join(dataDir, "secrets.next"),
  prev: join(dataDir, "secrets.prev"),
  key: join(dataDir, MASTER_KEY_FILE),
  keyNext: join(dataDir, KEY_FILE_NEXT),
});

export type RotationRecovery = "none" | "rolled_back" | "completed";

// Puts a data directory back into a consistent state after a rotation that was cut short. Safe to call
// at every start. The rotation swaps directories in this order: secrets -> secrets.prev, secrets.next
// -> secrets, master.key.next -> master.key, delete secrets.prev. So:
//   secrets.prev alone (no secrets)  -> the swap was half done: put the old vault back;
//   secrets.prev and secrets         -> the swap is done: finish (promote the new key file, drop prev);
//   no secrets.prev, leftovers       -> the swap never started: drop the staged copy.
export async function recoverRotation(dataDir: string): Promise<RotationRecovery> {
  const p = names(dataDir);
  const [hasPrev, hasCur, hasNext, hasKeyNext] = await Promise.all([exists(p.prev), exists(p.cur), exists(p.next), exists(p.keyNext)]);
  if (hasPrev && !hasCur) {
    await rename(p.prev, p.cur);
    await rm(p.next, { recursive: true, force: true });
    await rm(p.keyNext, { force: true });
    return "rolled_back";
  }
  if (hasPrev && hasCur) {
    if (hasKeyNext) await rename(p.keyNext, p.key);
    await rm(p.prev, { recursive: true, force: true });
    return "completed";
  }
  if (hasNext || hasKeyNext) {
    await rm(p.next, { recursive: true, force: true });
    await rm(p.keyNext, { force: true });
    return "rolled_back";
  }
  return "none";
}

async function listSecrets(secrets: SecretStore, dir: string): Promise<Array<{ readonly account: string; readonly name: string; readonly value: string }>> {
  const accounts = new Set<string>();
  for (const entry of await readdir(dir)) {
    const match = /^(0x[0-9a-f]{40})\.[a-z][a-z0-9_]{0,31}\.enc$/.exec(entry);
    if (match?.[1] !== undefined) accounts.add(match[1]);
  }
  const out: Array<{ account: string; name: string; value: string }> = [];
  for (const account of [...accounts].sort()) {
    for (const name of await secrets.names(account)) {
      const secret = await secrets.get(account, name);
      if (secret !== undefined) out.push({ account, name, value: secret.reveal() });
    }
  }
  return out;
}

// Re-seals every stored secret under a new master key. The process must not be running (the data
// directory lock is taken). With a key file the new key is generated here; with XO_MASTER_KEY the new
// one is XO_MASTER_KEY_NEXT, and the user then switches XO_MASTER_KEY to it.
export async function rotateMasterKey(options: RotateOptions): Promise<RotateResult> {
  const kdfOptions = options.allowWeakKdf === true ? { allowWeakKdf: true } : {};
  const kdf = options.kdf ?? DEFAULT_KDF;
  const p = names(options.dataDir);
  await recoverRotation(options.dataDir);

  const old = await resolveMasterKey({ env: options.env, dataDir: options.dataDir, create: false });
  const nextEnv = envKey(options.env, MASTER_KEY_NEXT_ENV);
  let newSecret: Secret;
  if (old.source === "env") {
    if (nextEnv === undefined) throw new MasterKeyError("next_missing", "Set XO_MASTER_KEY_NEXT to the new key, keep XO_MASTER_KEY as the current one, and run the rotation again.");
    newSecret = checkEnvKey(nextEnv, MASTER_KEY_NEXT_ENV, "next_invalid");
  } else {
    // A key file holds a generated 64-digit hex key and nothing else, so a chosen passphrase cannot go into it
    // (it would be written in plain text and the next start would refuse the file). To move the key into a
    // keychain: set XO_MASTER_KEY to the current key file's contents, XO_MASTER_KEY_NEXT to the new key, and rotate.
    if (nextEnv !== undefined) {
      throw new MasterKeyError(
        "next_with_key_file",
        "XO_MASTER_KEY_NEXT cannot be used while the key is kept in master.key. To move the key into a keychain, set XO_MASTER_KEY to the contents of master.key and XO_MASTER_KEY_NEXT to the new key, then rotate again; afterwards delete master.key. To rotate the file's key, unset XO_MASTER_KEY_NEXT.",
      );
    }
    newSecret = new Secret(randomBytes(32).toString("hex"));
  }
  if (newSecret.reveal() === old.secret.reveal()) throw new MasterKeyError("next_same", "The new key is the same as the current one.");

  // Already rotated? XO_MASTER_KEY no longer opens the vault, but XO_MASTER_KEY_NEXT does.
  let storage: RelayStorage | undefined;
  try {
    storage = await openRelayStorage({ dir: options.dataDir, masterSecret: old.secret, kdf, ...kdfOptions });
  } catch (error) {
    if (error instanceof CryptoError && error.code === "wrong_master_key" && nextEnv !== undefined) {
      const keyring = parseKeyring((await realFs.readFile(join(p.cur, "keyring.json"))).toString("utf8"));
      try {
        (await unlockKeyring(keyring, newSecret, kdfOptions)).destroy();
        return { source: old.source, accounts: 0, secrets: 0, alreadyRotated: true };
      } catch {
        // Neither key opens it: report the original failure.
      }
    }
    throw error;
  }
  let staged = false;
  try {
    if (storage.secrets === undefined) throw new MasterKeyError("rotation_failed", "The credential store is not open.");
    const all = await listSecrets(storage.secrets, p.cur);

    // Stage the new vault next to the old one.
    await rm(p.next, { recursive: true, force: true });
    await rm(p.keyNext, { force: true });
    const created = await createKeyring(newSecret, kdf, kdfOptions);
    staged = true;
    try {
      const fresh = await SecretStore.open({ dir: p.next, master: created.key });
      for (const entry of all) await fresh.put(entry.account, entry.name, entry.value);
      for (const entry of all) {
        const back = await fresh.get(entry.account, entry.name);
        if (back?.reveal() !== entry.value) throw new MasterKeyError("rotation_failed", "A secret did not read back from the staged vault. Nothing was changed.");
      }
      await atomicWriteFile(realFs, join(p.next, "keyring.json"), `${JSON.stringify(created.file)}\n`);
    } finally {
      created.key.destroy();
    }
    if (old.source === "file") await atomicWriteFile(realFs, p.keyNext, `${newSecret.reveal()}\n`);

    // The swap. A crash anywhere in here is repaired by recoverRotation at the next start.
    await rename(p.cur, p.prev);
    await rename(p.next, p.cur);
    if (old.source === "file") await rename(p.keyNext, p.key);
    staged = false;
    await storage.close();
    storage = undefined;

    // Open the result with the new key and compare, then drop the old vault.
    const check = await openRelayStorage({ dir: options.dataDir, masterSecret: newSecret, kdf, ...kdfOptions });
    try {
      if (check.secrets === undefined) throw new MasterKeyError("rotation_failed", "The rotated vault could not be opened. The previous vault is kept as secrets.prev.");
      for (const entry of all) {
        const back = await check.secrets.get(entry.account, entry.name);
        if (back?.reveal() !== entry.value) throw new MasterKeyError("rotation_failed", "A rotated secret does not match. The previous vault is kept as secrets.prev.");
      }
    } finally {
      await check.close();
    }
    await rm(p.prev, { recursive: true, force: true });
    return { source: old.source, accounts: new Set(all.map((entry) => entry.account)).size, secrets: all.length, alreadyRotated: false };
  } catch (error) {
    if (staged) {
      await rm(p.next, { recursive: true, force: true }).catch(() => undefined);
      await rm(p.keyNext, { force: true }).catch(() => undefined);
    }
    throw error;
  } finally {
    await storage?.close().catch(() => undefined);
  }
}
