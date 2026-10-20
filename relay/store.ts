import * as fsp from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { crc32 } from "node:zlib";

import { Secret } from "../src/config.js";
import {
  constantTimeEqual,
  createKeyring,
  CryptoError,
  DEFAULT_KDF,
  openFromText,
  parseKeyring,
  sealToText,
  unlockKeyring,
  type KdfParams,
  type MasterKey,
} from "./crypto.js";

// The relay's durable storage (docs/phase1-gap-closing.md section 9 A2, A5).
//
// Two stores sit under one data directory, behind one lock file:
//
//   DurableStore  non-secret state as JSON: the daily ledger, prepared items and their `sending`
//                 markers, capability facts, tripwires, watchers, intent hashes. An append-only
//                 journal (one checksummed line per commit, fsynced before the call returns) plus a
//                 snapshot that compaction rewrites with write-temp, fsync, rename. No node:sqlite
//                 and no dependency: JSON and fsync are enough for a single-tenant relay.
//   SecretStore   the credential vault: AES-256-GCM records, one file per secret, the account as
//                 associated data, mode 0600, atomic writes, and an encrypted backup that is written
//                 and read back BEFORE the caller may use a new secret.
//
// Neither store ever holds a signature or a plaintext secret outside the vault.
//
// Failure model, each case with a test:
//   - a crash mid-append leaves a torn last line, which is dropped at the next start;
//   - a crash between the snapshot rename and the journal truncation leaves records the snapshot
//     already covers, which replay skips by sequence number;
//   - a crash after the temp file and before the rename leaves the old file untouched;
//   - a failed append is rolled back; if even that fails the store refuses every later call;
//   - a corrupt line anywhere but the tail stops the start (a half-applied history is worse than none).
// Memory is updated only AFTER the journal write was synced, so memory is never ahead of the disk.

// ---- the file system seam (tests inject failures here) ---------------------------------------------------

export interface FileHandleLike {
  write(buffer: Uint8Array, offset: number, length: number): Promise<{ readonly bytesWritten: number }>;
  sync(): Promise<void>;
  truncate(length: number): Promise<void>;
  close(): Promise<void>;
}

export interface FsLike {
  mkdir(path: string, options: { readonly recursive: boolean; readonly mode: number }): Promise<unknown>;
  open(path: string, flags: string, mode?: number): Promise<FileHandleLike>;
  readFile(path: string): Promise<Buffer>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<{ readonly size: number; readonly mode: number }>;
}

export const realFs: FsLike = {
  mkdir: (path, options) => fsp.mkdir(path, options),
  open: async (path, flags, mode) => {
    const handle = await fsp.open(path, flags, mode);
    return {
      write: (buffer, offset, length) => handle.write(buffer, offset, length),
      sync: () => handle.sync(),
      truncate: (length) => handle.truncate(length),
      close: () => handle.close(),
    };
  },
  readFile: (path) => fsp.readFile(path),
  rename: (from, to) => fsp.rename(from, to),
  unlink: (path) => fsp.unlink(path),
  readdir: (path) => fsp.readdir(path),
  stat: (path) => fsp.stat(path),
};

export type StoreErrorCode =
  | "locked"
  | "journal_corrupt"
  | "snapshot_corrupt"
  | "write_failed"
  | "poisoned"
  | "closed"
  | "invalid_op"
  | "exists"
  | "verify_failed"
  | "no_valid_backup"
  | "keyring_missing";

// Fixed text only. Never a path from the operator's machine beyond the file's own name, never a value.
export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, message: string) {
    super(message);
    this.name = "StoreError";
    this.code = code;
  }
}

function errnoCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;
}

async function writeAll(handle: FileHandleLike, data: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < data.length) {
    const { bytesWritten } = await handle.write(data, offset, data.length - offset);
    if (bytesWritten <= 0) throw new StoreError("write_failed", "A write made no progress.");
    offset += bytesWritten;
  }
}

async function fsyncDirectory(fs: FsLike, dir: string): Promise<void> {
  let handle: FileHandleLike | undefined;
  try {
    handle = await fs.open(dir, "r");
    await handle.sync();
  } catch (error) {
    // Some file systems cannot sync a directory; a real I/O failure still propagates.
    const code = errnoCode(error);
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EPERM" && code !== "EISDIR" && code !== "EBADF") throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

let tempCounter = 0;

// Write-temp, fsync, rename, fsync the directory. Either the old content or the new content is on
// disk after a crash, never a mixture. The temp file is created exclusively with the final mode.
export async function atomicWriteFile(fs: FsLike, path: string, data: Uint8Array | string, mode = 0o600): Promise<void> {
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  tempCounter += 1;
  const temp = `${path}.tmp-${process.pid}-${tempCounter}`;
  let handle: FileHandleLike | undefined;
  try {
    handle = await fs.open(temp, "wx", mode);
    await writeAll(handle, bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temp, path);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.unlink(temp).catch(() => undefined);
    throw error;
  }
  await fsyncDirectory(fs, dirname(path));
}

async function readIfExists(fs: FsLike, path: string): Promise<Buffer | undefined> {
  try {
    return await fs.readFile(path);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return undefined;
    throw error;
  }
}

async function removeStaleTemps(fs: FsLike, dir: string): Promise<void> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (/\.tmp-\d+-\d+$/.test(name)) await fs.unlink(join(dir, name)).catch(() => undefined);
  }
}

// ---- per-key mutual exclusion -----------------------------------------------------------------------------

// Runs async functions one at a time per key, in arrival order. The relay takes it per account for
// anything that reads a nonce or a balance and then writes (UO3), and the ledger uses it per account.
export class KeyedMutex {
  readonly #tails = new Map<string, Promise<void>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    const result = previous.then(
      () => fn(),
      () => fn(),
    );
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.#tails.set(key, tail);
    try {
      return await result;
    } finally {
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    }
  }

  get pending(): number {
    return this.#tails.size;
  }
}

// ---- the directory lock --------------------------------------------------------------------------------------

// Two relay processes on one data directory would break "one upstream send per prepared item", so
// the second one refuses to start. A lock left by a crashed process (dead pid) is taken over.
const heldLocks = new Set<string>();

export interface DirLock {
  release(): Promise<void>;
  // Test hook: forget the lock without removing the file, as a crash would.
  abandon(): void;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errnoCode(error) === "EPERM";
  }
}

// Taking over a stale lock is check-then-act, so it is serialised by an exclusive claim file: whoever holds the
// claim re-reads the lock and removes it only if it is still exactly the stale content it judged. Without that,
// two processes started together after a crash can each remove the other's fresh lock and both hold the directory.
// A claim left by a crash is cleared when its pid is dead or it is old (the window it guards is microseconds).
const CLAIM_STALE_MS = 10_000;

async function claimTakeover(fs: FsLike, claimPath: string, isAlive: (pid: number) => boolean): Promise<(() => Promise<void>) | undefined> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fs.open(claimPath, "wx", 0o600);
      try {
        await writeAll(handle, Buffer.from(`${process.pid}\n${Date.now()}\n`, "utf8"));
      } finally {
        await handle.close();
      }
      return async () => {
        await fs.unlink(claimPath).catch(() => undefined);
      };
    } catch (error) {
      if (errnoCode(error) !== "EEXIST") throw error;
      const [pidText, stampText] = ((await readIfExists(fs, claimPath))?.toString("utf8") ?? "").split("\n");
      const pid = Number.parseInt(pidText ?? "", 10);
      const stamp = Number(stampText);
      const dead = Number.isInteger(pid) && pid !== process.pid && !isAlive(pid);
      const old = !Number.isFinite(stamp) || Date.now() - stamp > CLAIM_STALE_MS;
      if (!dead && !old) return undefined;
      await fs.unlink(claimPath).catch(() => undefined);
    }
  }
  return undefined;
}

export async function acquireDirLock(fs: FsLike, dir: string, isAlive: (pid: number) => boolean = processAlive): Promise<DirLock> {
  const path = join(dir, "store.lock");
  if (heldLocks.has(path)) throw new StoreError("locked", "This data directory is already open in this process.");
  const token = randomBytes(8).toString("hex");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fs.open(path, "wx", 0o600);
      try {
        await writeAll(handle, Buffer.from(`${process.pid}\n${token}\n`, "utf8"));
        await handle.sync();
      } finally {
        await handle.close();
      }
      heldLocks.add(path);
      return {
        async release() {
          heldLocks.delete(path);
          const current = await readIfExists(fs, path);
          if (current !== undefined && current.toString("utf8").includes(`\n${token}\n`)) await fs.unlink(path).catch(() => undefined);
        },
        abandon() {
          heldLocks.delete(path);
        },
      };
    } catch (error) {
      if (errnoCode(error) !== "EEXIST") throw error;
      const judged = (await readIfExists(fs, path))?.toString("utf8") ?? "";
      const pid = Number.parseInt(judged.split("\n")[0] ?? "", 10);
      // Our own pid with no in-process holder is a leftover of an earlier instance that never
      // released (a simulated crash in tests, a restart inside one process).
      const stale = !Number.isInteger(pid) || pid === process.pid || !isAlive(pid);
      if (!stale) throw new StoreError("locked", "Another relay process is using this data directory.");
      const done = await claimTakeover(fs, `${path}.claim`, isAlive);
      if (done === undefined) throw new StoreError("locked", "Another relay process is taking over this data directory.");
      try {
        const now = (await readIfExists(fs, path))?.toString("utf8");
        // Changed since it was judged: someone else took the directory in between.
        if (now !== undefined && now !== judged) throw new StoreError("locked", "Another relay process is using this data directory.");
        if (now !== undefined) await fs.unlink(path).catch(() => undefined);
      } finally {
        await done();
      }
    }
  }
  throw new StoreError("locked", "The data directory lock could not be taken.");
}

// ---- JSON state --------------------------------------------------------------------------------------------------

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export interface StoreOp {
  readonly ns: string;
  readonly key: string;
  // null deletes the key.
  readonly value: Json | null;
}

export interface StoreReader {
  get<T extends Json = Json>(ns: string, key: string): T | undefined;
  keys(ns: string): string[];
  list<T extends Json = Json>(ns: string): Array<readonly [string, T]>;
}

const NS = /^[a-z][a-z0-9_]{0,31}$/;
const MAX_KEY_CHARS = 256;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_RECORD_BYTES = 1024 * 1024;
const SNAPSHOT_FORMAT = "xo-relay-state";

// The namespaces the relay itself uses. Other modules add their own with the same rules.
export const NAMESPACES = Object.freeze({
  ledgerDay: "ledger_day",
  ledgerReservation: "ledger_res",
  ledgerLifetime: "ledger_life",
  prepared: "prepared",
  capabilities: "capabilities",
  tripwires: "tripwires",
  credentialStatus: "credential_status",
  watchers: "watchers",
  intents: "intents",
  meta: "meta",
});

interface JournalRecord {
  readonly s: number;
  readonly t: number;
  readonly o: ReadonlyArray<readonly [string, string, Json | null]>;
}

function checkOp(op: StoreOp): void {
  if (typeof op.ns !== "string" || !NS.test(op.ns)) throw new StoreError("invalid_op", "Bad namespace.");
  if (typeof op.key !== "string" || op.key.length === 0 || op.key.length > MAX_KEY_CHARS || CONTROL.test(op.key)) {
    throw new StoreError("invalid_op", "Bad key.");
  }
}

function normalise(value: Json | null): Json | null {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    throw new StoreError("invalid_op", "The value cannot be stored as JSON.");
  }
  if (text === undefined) throw new StoreError("invalid_op", "The value cannot be stored as JSON.");
  return JSON.parse(text) as Json | null;
}

export interface DurableStoreOptions {
  readonly dir: string;
  readonly fs?: FsLike;
  readonly now?: () => number;
  // Compaction runs after a commit once the journal passes this size.
  readonly compactAfterBytes?: number;
}

export interface StoreRecovery {
  // Bytes of a torn last line that were dropped at open.
  readonly tornTailBytes: number;
  // Journal records the snapshot already covered.
  readonly skippedRecords: number;
  readonly replayedRecords: number;
}

export class DurableStore {
  readonly #fs: FsLike;
  readonly #dir: string;
  readonly #now: () => number;
  readonly #compactAfterBytes: number;
  readonly #data = new Map<string, Map<string, Json>>();
  #seq = 0;
  #snapshotSeq = 0;
  #journal: FileHandleLike | undefined;
  #journalBytes = 0;
  #queue: Promise<unknown> = Promise.resolve();
  #poisoned = false;
  #closed = false;
  #lastCompactionFailed = false;
  readonly recovery: StoreRecovery;

  private constructor(options: DurableStoreOptions, recovery: StoreRecovery) {
    this.#fs = options.fs ?? realFs;
    this.#dir = options.dir;
    this.#now = options.now ?? Date.now;
    this.#compactAfterBytes = options.compactAfterBytes ?? 4 * 1024 * 1024;
    this.recovery = recovery;
  }

  // The caller holds the directory lock (openRelayStorage does).
  static async open(options: DurableStoreOptions): Promise<DurableStore> {
    const fs = options.fs ?? realFs;
    await fs.mkdir(options.dir, { recursive: true, mode: 0o700 });
    await removeStaleTemps(fs, options.dir);

    const snapshotPath = join(options.dir, "snapshot.json");
    const journalPath = join(options.dir, "journal.log");
    const state = new Map<string, Map<string, Json>>();
    let snapshotSeq = 0;

    const snapshotBytes = await readIfExists(fs, snapshotPath);
    if (snapshotBytes !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(snapshotBytes.toString("utf8"));
      } catch {
        throw new StoreError("snapshot_corrupt", "snapshot.json is not valid JSON.");
      }
      const record = parsed as { format?: unknown; v?: unknown; seq?: unknown; data?: unknown };
      if (typeof record !== "object" || record === null || record.format !== SNAPSHOT_FORMAT || record.v !== 1 || !Number.isSafeInteger(record.seq) || typeof record.data !== "object" || record.data === null) {
        throw new StoreError("snapshot_corrupt", "snapshot.json is not a relay state snapshot.");
      }
      snapshotSeq = record.seq as number;
      for (const [ns, entries] of Object.entries(record.data as Record<string, unknown>)) {
        if (!NS.test(ns) || typeof entries !== "object" || entries === null) throw new StoreError("snapshot_corrupt", "snapshot.json has a bad namespace.");
        const map = new Map<string, Json>();
        for (const [key, value] of Object.entries(entries as Record<string, Json>)) map.set(key, value);
        state.set(ns, map);
      }
    }

    // Replay the journal.
    let seq = snapshotSeq;
    let skipped = 0;
    let replayed = 0;
    let goodBytes = 0;
    let tornTail = 0;
    const journalBytes = await readIfExists(fs, journalPath);
    if (journalBytes !== undefined && journalBytes.length > 0) {
      const text = journalBytes.toString("utf8");
      const lastNewline = text.lastIndexOf("\n");
      const complete = lastNewline === -1 ? "" : text.slice(0, lastNewline + 1);
      goodBytes = Buffer.byteLength(complete, "utf8");
      tornTail = journalBytes.length - goodBytes;
      const lines = complete.length === 0 ? [] : complete.slice(0, -1).split("\n");
      lines.forEach((line, index) => {
        const match = /^([0-9a-f]{8}) (.*)$/s.exec(line);
        const corrupt = (why: string): never => {
          throw new StoreError("journal_corrupt", `journal.log line ${index + 1}: ${why}. The relay will not start on a damaged history.`);
        };
        if (match === null) return corrupt("bad framing");
        const body = match[2] as string;
        if (crc32(body).toString(16).padStart(8, "0") !== match[1]) return corrupt("checksum mismatch");
        let record: JournalRecord;
        try {
          record = JSON.parse(body) as JournalRecord;
        } catch {
          return corrupt("not valid JSON");
        }
        if (!Number.isSafeInteger(record.s) || !Array.isArray(record.o)) return corrupt("bad record");
        if (record.s <= snapshotSeq) {
          skipped += 1;
          return;
        }
        if (record.s <= seq) return corrupt("sequence went backwards");
        for (const [ns, key, value] of record.o) {
          if (typeof ns !== "string" || !NS.test(ns) || typeof key !== "string") return corrupt("bad operation");
          DurableStore.#applyTo(state, ns, key, value);
        }
        seq = record.s;
        replayed += 1;
      });
    }

    const store = new DurableStore(options, { tornTailBytes: tornTail, skippedRecords: skipped, replayedRecords: replayed });
    for (const [ns, map] of state) store.#data.set(ns, map);
    store.#seq = seq;
    store.#snapshotSeq = snapshotSeq;

    const handle = await fs.open(journalPath, "a", 0o600);
    if (tornTail > 0) {
      // Drop the torn tail so the next append starts on a clean line.
      await handle.truncate(goodBytes);
      await handle.sync();
    }
    store.#journal = handle;
    store.#journalBytes = goodBytes;
    return store;
  }

  static #applyTo(state: Map<string, Map<string, Json>>, ns: string, key: string, value: Json | null): void {
    let map = state.get(ns);
    if (value === null) {
      map?.delete(key);
      return;
    }
    if (map === undefined) {
      map = new Map();
      state.set(ns, map);
    }
    map.set(key, value);
  }

  // ---- reads (from memory; never touch the disk) -------------------------------------------------------------

  readonly #reader: StoreReader = {
    get: <T extends Json = Json>(ns: string, key: string): T | undefined => {
      const value = this.#data.get(ns)?.get(key);
      return value === undefined ? undefined : (structuredClone(value) as T);
    },
    keys: (ns: string): string[] => [...(this.#data.get(ns)?.keys() ?? [])],
    list: <T extends Json = Json>(ns: string): Array<readonly [string, T]> =>
      [...(this.#data.get(ns)?.entries() ?? [])].map(([key, value]) => [key, structuredClone(value) as T] as const),
  };

  get<T extends Json = Json>(ns: string, key: string): T | undefined {
    return this.#reader.get<T>(ns, key);
  }

  keys(ns: string): string[] {
    return this.#reader.keys(ns);
  }

  list<T extends Json = Json>(ns: string): Array<readonly [string, T]> {
    return this.#reader.list<T>(ns);
  }

  get sequence(): number {
    return this.#seq;
  }

  get journalSize(): number {
    return this.#journalBytes;
  }

  get compactionFailed(): boolean {
    return this.#lastCompactionFailed;
  }

  // ---- writes ------------------------------------------------------------------------------------------------------

  #enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(work, work);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  // Reads and writes under one lock: `fn` sees the state as of the last durable commit, returns the
  // operations to apply and a result, and nothing else can commit in between. If `fn` throws, nothing
  // is written. The call resolves only after the journal line was fsynced.
  transact<T>(fn: (reader: StoreReader) => { readonly ops: readonly StoreOp[]; readonly result: T }): Promise<T> {
    return this.#enqueue(async () => {
      if (this.#closed) throw new StoreError("closed", "The store is closed.");
      if (this.#poisoned) throw new StoreError("poisoned", "The store failed a write and refuses further use until restarted.");
      const { ops, result } = fn(this.#reader);
      if (ops.length === 0) return result;
      const checked: Array<[string, string, Json | null]> = [];
      for (const op of ops) {
        checkOp(op);
        checked.push([op.ns, op.key, op.value === null ? null : normalise(op.value)]);
      }
      const seq = this.#seq + 1;
      const body = JSON.stringify({ s: seq, t: this.#now(), o: checked });
      if (Buffer.byteLength(body) > MAX_RECORD_BYTES) throw new StoreError("invalid_op", "The commit is too large.");
      const line = Buffer.from(`${crc32(body).toString(16).padStart(8, "0")} ${body}\n`, "utf8");
      const journal = this.#journal as FileHandleLike;
      try {
        await writeAll(journal, line);
        await journal.sync();
      } catch {
        // Roll the file back to the last good length so a partial line cannot swallow later records.
        try {
          await journal.truncate(this.#journalBytes);
          await journal.sync();
        } catch {
          this.#poisoned = true;
        }
        throw new StoreError("write_failed", "The state could not be written; nothing was changed.");
      }
      this.#journalBytes += line.length;
      this.#seq = seq;
      for (const [ns, key, value] of checked) DurableStore.#applyTo(this.#data, ns, key, value);
      if (this.#journalBytes >= this.#compactAfterBytes) {
        try {
          await this.#compactNow();
          this.#lastCompactionFailed = false;
        } catch {
          // The commit itself is durable; compaction is retried after the next commit.
          this.#lastCompactionFailed = true;
        }
      }
      return result;
    });
  }

  commit(ops: readonly StoreOp[]): Promise<void> {
    return this.transact(() => ({ ops, result: undefined }));
  }

  set(ns: string, key: string, value: Json): Promise<void> {
    return this.commit([{ ns, key, value }]);
  }

  delete(ns: string, key: string): Promise<void> {
    return this.commit([{ ns, key, value: null }]);
  }

  async #compactNow(): Promise<void> {
    const data = Object.fromEntries(
      [...this.#data.entries()].filter(([, map]) => map.size > 0).map(([ns, map]) => [ns, Object.fromEntries(map)]),
    );
    const snapshot = `${JSON.stringify({ format: SNAPSHOT_FORMAT, v: 1, seq: this.#seq, data })}\n`;
    await atomicWriteFile(this.#fs, join(this.#dir, "snapshot.json"), snapshot);
    this.#snapshotSeq = this.#seq;
    const journal = this.#journal as FileHandleLike;
    await journal.truncate(0);
    await journal.sync();
    this.#journalBytes = 0;
  }

  // Writes a fresh snapshot and empties the journal. Safe at any time; a crash in the middle leaves
  // either the old pair or the new pair of files, and replay skips what the snapshot covers.
  compact(): Promise<void> {
    return this.#enqueue(async () => {
      if (this.#closed) throw new StoreError("closed", "The store is closed.");
      if (this.#poisoned) throw new StoreError("poisoned", "The store failed a write and refuses further use until restarted.");
      await this.#compactNow();
    });
  }

  async flush(): Promise<void> {
    await this.#queue;
  }

  async close(): Promise<void> {
    await this.#queue.catch(() => undefined);
    if (this.#closed) return;
    this.#closed = true;
    await this.#journal?.close().catch(() => undefined);
    this.#journal = undefined;
  }

  // Test hook: stop using the files without any orderly shutdown, as a crash would. Commits that
  // already resolved are on disk; queued ones are lost.
  abandon(): void {
    this.#closed = true;
    void this.#journal?.close().catch(() => undefined);
    this.#journal = undefined;
  }
}

// ---- the credential vault -------------------------------------------------------------------------------------------

const ACCOUNT = /^0x[0-9a-f]{40}$/;
const SECRET_NAME = /^[a-z][a-z0-9_]{0,31}$/;

function checkIds(account: string, name: string): void {
  if (!ACCOUNT.test(account)) throw new StoreError("invalid_op", "The account must be a lower-case 0x address.");
  if (!SECRET_NAME.test(name)) throw new StoreError("invalid_op", "Bad secret name.");
}

export interface SecretStoreOptions {
  readonly dir: string;
  readonly fs?: FsLike;
  readonly master: MasterKey;
  readonly mutex?: KeyedMutex;
}

export class SecretStore {
  readonly #fs: FsLike;
  readonly #dir: string;
  readonly #backupDir: string;
  readonly #key: Buffer;
  readonly #mutex: KeyedMutex;

  private constructor(options: SecretStoreOptions) {
    this.#fs = options.fs ?? realFs;
    this.#dir = options.dir;
    this.#backupDir = join(options.dir, "backups");
    this.#key = options.master.subkey("secrets");
    this.#mutex = options.mutex ?? new KeyedMutex();
  }

  static async open(options: SecretStoreOptions): Promise<SecretStore> {
    const fs = options.fs ?? realFs;
    await fs.mkdir(options.dir, { recursive: true, mode: 0o700 });
    await fs.mkdir(join(options.dir, "backups"), { recursive: true, mode: 0o700 });
    await removeStaleTemps(fs, options.dir);
    await removeStaleTemps(fs, join(options.dir, "backups"));
    return new SecretStore(options);
  }

  #primaryPath(account: string, name: string): string {
    return join(this.#dir, `${account}.${name}.enc`);
  }

  async #backupNames(account: string, name: string): Promise<string[]> {
    const prefix = `${account}.${name}.`;
    const names = await this.#fs.readdir(this.#backupDir);
    return names.filter((entry) => entry.startsWith(prefix) && /\.\d{6}\.bak$/.test(entry)).sort();
  }

  // Newest first.
  async backups(account: string, name: string): Promise<string[]> {
    checkIds(account, name);
    return (await this.#backupNames(account, name)).reverse();
  }

  async has(account: string, name: string): Promise<boolean> {
    checkIds(account, name);
    return (await readIfExists(this.#fs, this.#primaryPath(account, name))) !== undefined;
  }

  async names(account: string): Promise<string[]> {
    if (!ACCOUNT.test(account)) throw new StoreError("invalid_op", "The account must be a lower-case 0x address.");
    const prefix = `${account}.`;
    return (await this.#fs.readdir(this.#dir))
      .filter((entry) => entry.startsWith(prefix) && entry.endsWith(".enc"))
      .map((entry) => entry.slice(prefix.length, -".enc".length))
      .sort();
  }

  // Stores a secret. Order matters: the encrypted backup is written and fsynced FIRST, then the
  // primary, then both are read back and compared. Only when this resolves may the caller use the
  // secret (a lost HMAC triplet is unrecoverable, AU3). Refuses to overwrite unless `replace`.
  async put(account: string, name: string, value: string, options: { readonly replace?: boolean } = {}): Promise<void> {
    checkIds(account, name);
    if (value.length === 0) throw new StoreError("invalid_op", "A secret cannot be empty.");
    return this.#mutex.run(`secret:${account}`, async () => {
      const primary = this.#primaryPath(account, name);
      if (options.replace !== true && (await readIfExists(this.#fs, primary)) !== undefined) {
        throw new StoreError("exists", "A secret with this name already exists for the account.");
      }
      const existing = await this.#backupNames(account, name);
      const last = existing.at(-1);
      const next = last === undefined ? 1 : Number.parseInt(last.slice(-10, -4), 10) + 1;
      const backupName = `${account}.${name}.${String(next).padStart(6, "0")}.bak`;
      const backupPath = join(this.#backupDir, backupName);
      await atomicWriteFile(this.#fs, backupPath, sealToText(this.#key, `backup:${name}`, account, value));
      await atomicWriteFile(this.#fs, primary, sealToText(this.#key, `secret:${name}`, account, value));
      // Read both back from disk and compare: a write that "succeeded" into a bad sector is caught here.
      const a = openFromText(this.#key, (await this.#fs.readFile(primary)).toString("utf8"), `secret:${name}`, account);
      const b = openFromText(this.#key, (await this.#fs.readFile(backupPath)).toString("utf8"), `backup:${name}`, account);
      const same = constantTimeEqual(a.toString("utf8"), value) && constantTimeEqual(b.toString("utf8"), value);
      a.fill(0);
      b.fill(0);
      if (!same) throw new StoreError("verify_failed", "The secret read back from disk does not match; do not use it.");
    });
  }

  async get(account: string, name: string): Promise<Secret | undefined> {
    checkIds(account, name);
    const bytes = await readIfExists(this.#fs, this.#primaryPath(account, name));
    if (bytes === undefined) return undefined;
    const plaintext = openFromText(this.#key, bytes.toString("utf8"), `secret:${name}`, account);
    try {
      return new Secret(plaintext.toString("utf8"));
    } finally {
      plaintext.fill(0);
    }
  }

  // True when the newest backup opens and equals the primary. Never reveals the value. T2 is gated
  // on this being true.
  async verifyBackup(account: string, name: string): Promise<boolean> {
    checkIds(account, name);
    try {
      const primary = await readIfExists(this.#fs, this.#primaryPath(account, name));
      const newest = (await this.#backupNames(account, name)).at(-1);
      if (primary === undefined || newest === undefined) return false;
      const a = openFromText(this.#key, primary.toString("utf8"), `secret:${name}`, account);
      const b = openFromText(this.#key, (await this.#fs.readFile(join(this.#backupDir, newest))).toString("utf8"), `backup:${name}`, account);
      const same = constantTimeEqual(a.toString("utf8"), b.toString("utf8"));
      a.fill(0);
      b.fill(0);
      return same;
    } catch (error) {
      if (error instanceof CryptoError) return false;
      throw error;
    }
  }

  // Rebuilds the primary file from the newest backup that opens. The restore test in the suite
  // deletes and corrupts the primary and calls this.
  async restore(account: string, name: string): Promise<{ readonly restoredFrom: string }> {
    checkIds(account, name);
    return this.#mutex.run(`secret:${account}`, async () => {
      for (const backupName of (await this.#backupNames(account, name)).reverse()) {
        let plaintext: Buffer;
        try {
          plaintext = openFromText(this.#key, (await this.#fs.readFile(join(this.#backupDir, backupName))).toString("utf8"), `backup:${name}`, account);
        } catch (error) {
          if (error instanceof CryptoError) continue;
          throw error;
        }
        const value = plaintext.toString("utf8");
        plaintext.fill(0);
        await atomicWriteFile(this.#fs, this.#primaryPath(account, name), sealToText(this.#key, `secret:${name}`, account, value));
        const back = openFromText(this.#key, (await this.#fs.readFile(this.#primaryPath(account, name))).toString("utf8"), `secret:${name}`, account);
        const same = constantTimeEqual(back.toString("utf8"), value);
        back.fill(0);
        if (!same) throw new StoreError("verify_failed", "The restored secret does not match its backup.");
        return { restoredFrom: backupName };
      }
      throw new StoreError("no_valid_backup", "No backup of this secret could be opened.");
    });
  }
}

// ---- everything under one data directory -------------------------------------------------------------------------------

export interface RelayStorage {
  readonly dir: string;
  readonly state: DurableStore;
  // Absent when the credential store is switched off.
  readonly secrets: SecretStore | undefined;
  readonly locks: KeyedMutex;
  close(): Promise<void>;
  abandon(): void;
}

export interface OpenStorageOptions {
  readonly dir: string;
  readonly fs?: FsLike;
  readonly now?: () => number;
  // Present when the credential store is on. Never read from a file by this code.
  readonly masterSecret?: Secret;
  readonly kdf?: KdfParams;
  // Tests only.
  readonly allowWeakKdf?: boolean;
  readonly compactAfterBytes?: number;
  // Test hook for the lock's liveness check.
  readonly isProcessAlive?: (pid: number) => boolean;
}

export async function openRelayStorage(options: OpenStorageOptions): Promise<RelayStorage> {
  const fs = options.fs ?? realFs;
  await fs.mkdir(options.dir, { recursive: true, mode: 0o700 });
  const lock = await acquireDirLock(fs, options.dir, options.isProcessAlive);
  let state: DurableStore | undefined;
  let master: MasterKey | undefined;
  try {
    state = await DurableStore.open({
      dir: options.dir,
      fs,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.compactAfterBytes === undefined ? {} : { compactAfterBytes: options.compactAfterBytes }),
    });
    const locks = new KeyedMutex();
    let secrets: SecretStore | undefined;
    if (options.masterSecret !== undefined) {
      const secretsDir = join(options.dir, "secrets");
      await fs.mkdir(secretsDir, { recursive: true, mode: 0o700 });
      const kdfOptions = options.allowWeakKdf === true ? { allowWeakKdf: true } : {};
      const keyringPath = join(secretsDir, "keyring.json");
      const existing = await readIfExists(fs, keyringPath);
      if (existing !== undefined) {
        master = await unlockKeyring(parseKeyring(existing.toString("utf8")), options.masterSecret, kdfOptions);
      } else {
        // A missing keyring next to existing sealed files means the keyring was lost. Writing a new
        // one would orphan every secret silently, so stop.
        const leftovers = [...(await fs.readdir(secretsDir)), ...(await fs.readdir(join(secretsDir, "backups")).catch(() => [] as string[]))];
        if (leftovers.some((entry) => entry.endsWith(".enc") || entry.endsWith(".bak"))) {
          throw new StoreError("keyring_missing", "Sealed secrets exist but keyring.json is missing; restore it from your backup.");
        }
        const created = await createKeyring(options.masterSecret, options.kdf ?? DEFAULT_KDF, kdfOptions);
        await atomicWriteFile(fs, keyringPath, `${JSON.stringify(created.file)}\n`);
        master = created.key;
      }
      secrets = await SecretStore.open({ dir: secretsDir, fs, master, mutex: locks });
    }
    const opened = state;
    return {
      dir: options.dir,
      state: opened,
      secrets,
      locks,
      async close() {
        await opened.close();
        master?.destroy();
        await lock.release();
      },
      abandon() {
        opened.abandon();
        lock.abandon();
      },
    };
  } catch (error) {
    await state?.close().catch(() => undefined);
    master?.destroy();
    await lock.release();
    throw error;
  }
}

// Interface-merge point for services the storage layer contributes to RelayContext.services.
declare module "./types.js" {
  interface RelayServices {
    readonly state?: DurableStore;
    readonly secrets?: SecretStore;
    readonly locks?: KeyedMutex;
  }
}
