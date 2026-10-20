import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Secret } from "../src/config.js";
import { realFs, type FileHandleLike, type FsLike } from "../relay/store.js";

// Shared helpers for the relay-core tests. Not a test file (the unit glob only runs *.test.ts).
//
// Everything here is deterministic: a seeded PRNG, an injected clock, synthetic addresses built from
// numbers (so no 40-hex literal sits in a test), and well-known TEST secrets that are labelled as
// such. Nothing touches the network except loopback sockets the tests open themselves.

// A cheap scrypt cost for tests only. Production code refuses it unless allowWeakKdf is passed.
export const TEST_KDF = Object.freeze({ N: 1024, r: 8, p: 1 });

// Labelled TEST values. Not secrets of anyone.
export const TEST_RELAY_KEY = "test-relay-key-0001-aaaaaaaaaaaa";
export const TEST_RELAY_KEY_NEXT = "test-relay-key-0002-bbbbbbbbbbbb";
export const TEST_MASTER_SECRET = "test-master-secret-ZZZZ-0123456789";

export function secret(value: string): Secret {
  return new Secret(value);
}

// A well-formed lower-case address from a number.
export function addr(n: number): string {
  return `0x${n.toString(16).padStart(40, "0")}`;
}

// A 32-byte hex value from a number.
export function hex32(n: number): string {
  return `0x${n.toString(16).padStart(64, "0")}`;
}

// Mulberry32: small, fast, seedable.
export function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TempDir {
  readonly dir: string;
  cleanup(): Promise<void>;
}

const created: string[] = [];

export async function tempDir(prefix = "relay-core-"): Promise<TempDir> {
  // RELAY_TEST_TMPDIR lets a run keep its scratch files somewhere chosen. (TMPDIR itself cannot be
  // pointed at a long path: tsx puts a unix socket there and socket paths are short.)
  const dir = await mkdtemp(join(process.env["RELAY_TEST_TMPDIR"] ?? tmpdir(), prefix));
  created.push(dir);
  return {
    dir,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export class FakeClock {
  #now: number;

  constructor(startIso = "2026-10-19T12:00:00Z") {
    this.#now = Date.parse(startIso);
  }

  now = (): number => this.#now;

  set(iso: string): void {
    this.#now = Date.parse(iso);
  }

  advance(ms: number): void {
    this.#now += ms;
  }

  // For code that sleeps: advancing the clock is the sleep.
  sleep = async (ms: number): Promise<void> => {
    this.#now += ms;
  };
}

// ---- fault injection for the file system seam ------------------------------------------------------------------

export type FaultOp = "open" | "write" | "sync" | "truncate" | "close" | "rename" | "unlink" | "readFile" | "mkdir";

export interface FaultRule {
  readonly op: FaultOp;
  readonly path?: RegExp;
  // Fail the nth matching call (1-based), then stop failing. Default: the first.
  readonly nth?: number;
  // A write that puts this many bytes on disk and then fails: a torn write.
  readonly partialBytes?: number;
  // Keep failing every matching call from the nth on.
  readonly always?: boolean;
}

export interface FaultyFs {
  readonly fs: FsLike;
  // "op path" for every call, in order.
  readonly log: string[];
  add(rule: FaultRule): void;
  clear(): void;
  readonly triggered: number;
}

export function faultyFs(base: FsLike = realFs): FaultyFs {
  const rules: Array<FaultRule & { seen: number }> = [];
  const log: string[] = [];
  let triggered = 0;

  function fail(op: FaultOp, path: string): FaultRule | undefined {
    log.push(`${op} ${path}`);
    for (const rule of rules) {
      if (rule.op !== op) continue;
      if (rule.path !== undefined && !rule.path.test(path)) continue;
      rule.seen += 1;
      const nth = rule.nth ?? 1;
      if (rule.always === true ? rule.seen >= nth : rule.seen === nth) {
        triggered += 1;
        return rule;
      }
    }
    return undefined;
  }

  const eio = (): Error => Object.assign(new Error("injected I/O failure"), { code: "EIO" });

  const fs: FsLike = {
    mkdir: async (path, options) => {
      if (fail("mkdir", path) !== undefined) throw eio();
      return base.mkdir(path, options);
    },
    open: async (path, flags, mode) => {
      if (fail("open", path) !== undefined) throw eio();
      const handle = await base.open(path, flags, mode);
      const wrapped: FileHandleLike = {
        write: async (buffer, offset, length) => {
          const rule = fail("write", path);
          if (rule !== undefined) {
            if (rule.partialBytes !== undefined) await handle.write(buffer, offset, Math.min(rule.partialBytes, length));
            throw eio();
          }
          return handle.write(buffer, offset, length);
        },
        sync: async () => {
          if (fail("sync", path) !== undefined) throw eio();
          return handle.sync();
        },
        truncate: async (length) => {
          if (fail("truncate", path) !== undefined) throw eio();
          return handle.truncate(length);
        },
        close: async () => {
          if (fail("close", path) !== undefined) {
            await handle.close();
            throw eio();
          }
          return handle.close();
        },
      };
      return wrapped;
    },
    readFile: async (path) => {
      if (fail("readFile", path) !== undefined) throw eio();
      return base.readFile(path);
    },
    rename: async (from, to) => {
      if (fail("rename", `${from} -> ${to}`) !== undefined) throw eio();
      return base.rename(from, to);
    },
    unlink: async (path) => {
      if (fail("unlink", path) !== undefined) throw eio();
      return base.unlink(path);
    },
    readdir: (path) => base.readdir(path),
    stat: (path) => base.stat(path),
  };

  return {
    fs,
    log,
    add: (rule) => {
      rules.push({ ...rule, seen: 0 });
    },
    clear: () => {
      rules.length = 0;
    },
    get triggered() {
      return triggered;
    },
  };
}

// ---- reading a directory back ---------------------------------------------------------------------------------------

export async function* walkFiles(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(path);
    else if (entry.isFile()) yield path;
  }
}

export async function readAll(dir: string): Promise<Array<{ readonly path: string; readonly bytes: Buffer }>> {
  const out: Array<{ path: string; bytes: Buffer }> = [];
  for await (const path of walkFiles(dir)) out.push({ path, bytes: await readFile(path) });
  return out;
}

export async function modeOf(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777;
}

// ---- a raw HTTP client that can set any header (fetch cannot set Host) -----------------------------------------------------

export interface RawResponse {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly text: string;
  readonly json: unknown;
}

export function rawRequest(options: {
  readonly port: number;
  readonly method?: string;
  readonly path?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string | Buffer;
  readonly host?: string;
}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: options.host ?? "127.0.0.1",
        port: options.port,
        method: options.method ?? "GET",
        path: options.path ?? "/v1/health",
        headers: options.headers ?? {},
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            json = undefined;
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json });
        });
      },
    );
    req.on("error", reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

export function jsonHeaders(key: string | undefined, extra: Record<string, string> = {}): Record<string, string> {
  return { "content-type": "application/json", ...(key === undefined ? {} : { "x-relay-key": key }), ...extra };
}

// Resolves after `ms` of real time. Only for letting an event loop turn; never for correctness.
export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function deferred<T = void>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
