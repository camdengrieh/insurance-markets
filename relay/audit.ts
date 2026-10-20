import { createHash } from "node:crypto";
import { join } from "node:path";

import { redactSecrets } from "../src/guardrails/audit.js";
import { sanitizeUntrusted } from "../src/guardrails/untrusted.js";
import { realFs, type FileHandleLike, type FsLike } from "./store.js";

// The relay's own audit log (docs/phase1-gap-closing.md section 9 A5). It is separate from the
// plugin's stderr writer in src/guardrails/audit.ts, which stays the plugin's.
//
//   - append-only JSON lines, mode 0600, rotated by size (audit.log, audit.log.1, ...);
//   - built from an allowlist of typed fields: nothing is spread from the caller's object, so a stray
//     property never reaches the file;
//   - no secrets, no HMAC triplets, no signatures, no relay keys: values are shaped (hashes and
//     identifiers only), free text is sanitised and run through the shared redactor, and an optional
//     `scrub` list of known secret strings is blanked out of the finished line as a last defence;
//   - the file is never read back by the relay.
//
// A write that fails does not throw into the request, but `healthy()` turns false and the write
// guards refuse further writes (an unaudited send is worse than a refused one).

// Events the relay writes about itself.
const CORE_AUDIT_EVENTS = [
  "startup",
  "shutdown",
  "request",
  "auth_failure",
  "refused",
  "prepared",
  "send_begin",
  "send_result",
  "ledger",
  "capability",
  "flag",
  "tripwire",
  "upstream",
  "alert",
  "error",
] as const;

// Events the Cockpit daemon (bridge/, docs/dapp-design.md 5.4) writes into this log through `write`, so there is
// one authoritative log and one chain (ask A7). The browser page is never the writer: the daemon's server side
// is, because the page may be compromised. Every one is built from the same typed allowlist as the rest; the
// parsed command and the tool's name are logged, never the raw line, a token, a signature or a key.
export const EXTERNAL_AUDIT_EVENTS = [
  "ui.pair",
  "ui.arm",
  "ui.disarm",
  "ui.kill",
  "ui.command",
  "ui.card.shown",
  "ui.card.decision",
  "signer.request",
  "signer.result",
  "agent.call",
  "feed.mismatch",
  "schema.violation",
] as const;
export type ExternalAuditEventName = (typeof EXTERNAL_AUDIT_EVENTS)[number];

export const AUDIT_EVENTS = [...CORE_AUDIT_EVENTS, ...EXTERNAL_AUDIT_EVENTS] as const;
export type AuditEventName = (typeof AUDIT_EVENTS)[number];

export function isExternalAuditEvent(name: string): name is ExternalAuditEventName {
  return (EXTERNAL_AUDIT_EVENTS as readonly string[]).includes(name);
}

export const AUDIT_TOOL_CLASSES = ["read", "prepare", "submit", "admin"] as const;

export const AUDIT_OUTCOMES = ["ok", "refused", "error", "ambiguous", "pending"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export interface RelayAuditEvent {
  readonly ev: AuditEventName;
  // Request correlation id.
  readonly rid?: string;
  readonly route?: string;
  readonly status?: number;
  readonly code?: string;
  readonly outcome?: AuditOutcome;
  readonly owner?: string;
  readonly account?: string;
  // Only the first 8 characters are logged.
  readonly preparedId?: string;
  readonly digestTag?: string;
  // An order hash, user operation hash or transaction hash (public data).
  readonly hash?: string;
  readonly amountAtomic?: bigint | string;
  readonly state?: string;
  readonly host?: string;
  readonly flag?: string;
  readonly ms?: number;
  readonly note?: string;
  // ---- fields of the external (Cockpit) events; each is shaped, and anything that does not fit is dropped ----
  // The second tag of a Signature Card (the inner hash tag), 16 hex digits.
  readonly innerTag?: string;
  // "match", "mismatch" or "not_derivable": the result of verifyPrepared.
  readonly verdict?: string;
  // The first differing field of a verification, such as summary.lines[3].
  readonly field?: string;
  // What the human decided about a card: approve, reject, expired.
  readonly decision?: string;
  // A parsed terminal command word (buy, sell, arm...), never the typed line.
  readonly command?: string;
  // A tool name and its class.
  readonly tool?: string;
  readonly toolClass?: (typeof AUDIT_TOOL_CLASSES)[number];
  // The first 16 hex digits of the SHA-256 of a tool call's arguments.
  readonly argsHash?: string;
  // Only the first 8 characters are logged.
  readonly tokenId?: string;
  // A PayBox request reference. Only the first 12 characters are logged.
  readonly requestRef?: string;
  // Ask for an fsync after this line. Used around sends.
  readonly sync?: boolean;
}

export interface AuditStats {
  readonly written: number;
  readonly failed: number;
  readonly rotations: number;
  readonly dropped: number;
}

export interface RelayAudit {
  write(event: RelayAuditEvent): Promise<void>;
  // The newest link of the hash chain (64 hex digits), when the audit was opened with `chain`. Absent otherwise.
  head?(): string | undefined;
  // False after a failed write, until a write succeeds again.
  healthy(): boolean;
  stats(): AuditStats;
  close(): Promise<void>;
}

const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;
const ROUTE = /^(?:GET|POST) \/v1\/[a-z0-9/:_-]{1,48}$/;
const CODE = /^[a-z0-9_]{1,48}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX8 = /^[0-9a-f]{8,}$/;
const HEX16 = /^[0-9a-f]{16}$/;
const WORD = /^[a-z][a-z0-9_.:-]{0,47}$/;
const HOST = /^[a-z0-9.-]{1,253}$/;
const DIGITS = /^[0-9]{1,40}$/;
const FIELD_PATH = /^[A-Za-z][A-Za-z0-9_.[\]]{0,79}$/;
const REQUEST_REF = /^[A-Za-z0-9_-]{4,64}$/;
const TOOL_NAME = /^[a-z][a-z0-9_]{0,47}$/;
// Anything that starts like a PayBox, Quotient, relay or model key, or is long enough to be a token. Applied to the
// external events' fields on top of their shapes, so a secret cannot ride in as a "word".
const KEY_PREFIX = /^(?:pbxk1|pbx_|sk-|qt_|bearer|x-relay|ghp_|xox)/i;
const looksSecret = (value: string): boolean => KEY_PREFIX.test(value) || redactSecrets(value) !== value;
const NOTE_MAX_CHARS = 240;
const LINE_MAX_BYTES = 2048;

const shortAddress = (address: string): string => `${address.slice(0, 6).toLowerCase()}...${address.slice(-4).toLowerCase()}`;

export function isoSecondOf(nowMs: number): string {
  const date = new Date(Number.isFinite(nowMs) ? nowMs : 0);
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Builds one log line. Pure, so tests can feed it hostile events.
export function formatRelayAuditLine(event: RelayAuditEvent, nowMs: number, scrub: readonly string[] = []): string {
  const dropped: string[] = [];
  const record: Record<string, unknown> = {
    v: 1,
    ts: new Date(Number.isFinite(nowMs) ? nowMs : 0).toISOString(),
    ev: (AUDIT_EVENTS as readonly string[]).includes(event.ev) ? event.ev : "error",
  };
  const take = (key: string, value: unknown, ok: (v: unknown) => boolean, map: (v: never) => unknown = (v) => v): void => {
    if (value === undefined) return;
    if (ok(value)) record[key] = map(value as never);
    else dropped.push(key);
  };
  take("rid", event.rid, (v) => typeof v === "string" && REQUEST_ID.test(v));
  take("route", event.route, (v) => typeof v === "string" && (v === "unmatched" || ROUTE.test(v)));
  take("status", event.status, (v) => typeof v === "number" && Number.isInteger(v) && v >= 100 && v <= 599);
  take("code", event.code, (v) => typeof v === "string" && CODE.test(v));
  take("outcome", event.outcome, (v) => typeof v === "string" && (AUDIT_OUTCOMES as readonly string[]).includes(v));
  take("owner", event.owner, (v) => typeof v === "string" && ADDRESS.test(v), (v: string) => shortAddress(v));
  take("account", event.account, (v) => typeof v === "string" && ADDRESS.test(v), (v: string) => shortAddress(v));
  take("pid", event.preparedId, (v) => typeof v === "string" && HEX8.test(v), (v: string) => v.slice(0, 8));
  take("digest_tag", event.digestTag, (v) => typeof v === "string" && HEX16.test(v));
  take("hash", event.hash, (v) => typeof v === "string" && HASH.test(v), (v: string) => v.toLowerCase());
  take(
    "amount_atomic",
    event.amountAtomic,
    (v) => (typeof v === "bigint" && v >= 0n) || (typeof v === "string" && DIGITS.test(v)),
    (v: bigint | string) => v.toString(),
  );
  take("state", event.state, (v) => typeof v === "string" && WORD.test(v));
  take("host", event.host, (v) => typeof v === "string" && HOST.test(v));
  take("flag", event.flag, (v) => typeof v === "string" && /^[A-Z][A-Z_]{1,40}$/.test(v));
  take("inner_tag", event.innerTag, (v) => typeof v === "string" && HEX16.test(v));
  take("verdict", event.verdict, (v) => typeof v === "string" && WORD.test(v) && !looksSecret(v));
  take("field", event.field, (v) => typeof v === "string" && FIELD_PATH.test(v) && !looksSecret(v));
  take("decision", event.decision, (v) => typeof v === "string" && WORD.test(v) && !looksSecret(v));
  take("command", event.command, (v) => typeof v === "string" && WORD.test(v) && !looksSecret(v));
  take("tool", event.tool, (v) => typeof v === "string" && TOOL_NAME.test(v) && !looksSecret(v));
  take("tool_class", event.toolClass, (v) => typeof v === "string" && (AUDIT_TOOL_CLASSES as readonly string[]).includes(v));
  take("args_hash", event.argsHash, (v) => typeof v === "string" && HEX16.test(v));
  take("token", event.tokenId, (v) => typeof v === "string" && HEX8.test(v), (v: string) => v.slice(0, 8));
  take("request_ref", event.requestRef, (v) => typeof v === "string" && REQUEST_REF.test(v) && !looksSecret(v.slice(0, 12)) && !KEY_PREFIX.test(v), (v: string) => v.slice(0, 12));
  take("ms", event.ms, (v) => typeof v === "number" && Number.isFinite(v) && v >= 0, (v: number) => Math.round(v));
  if (typeof event.note === "string") {
    // Sanitise first so invisible characters cannot split a secret past the patterns, then redact.
    const clean = sanitizeUntrusted(event.note, { maxChars: 2000 }).text;
    record["note"] = sanitizeUntrusted(redactSecrets(clean), { maxChars: NOTE_MAX_CHARS }).text;
  }
  if (dropped.length > 0) record["dropped"] = dropped;

  let line = JSON.stringify(record);
  for (const key of ["note", "dropped"]) {
    if (Buffer.byteLength(line) <= LINE_MAX_BYTES) break;
    delete record[key];
    line = JSON.stringify(record);
  }
  for (const secret of scrub) {
    if (secret.length >= 8) line = line.split(secret).join("[redacted]");
  }
  return line;
}

// ---- a size-rotated append-only file ----------------------------------------------------------------------------

export interface RotatingLogOptions {
  readonly dir: string;
  readonly name: string;
  readonly fs?: FsLike;
  readonly maxBytes?: number;
  // How many rotated files to keep besides the live one.
  readonly keep?: number;
}

function errnoCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;
}

export class RotatingLog {
  readonly #fs: FsLike;
  readonly #dir: string;
  readonly #name: string;
  readonly #maxBytes: number;
  readonly #keep: number;
  #handle: FileHandleLike | undefined;
  #size = 0;
  #queue: Promise<unknown> = Promise.resolve();
  #rotations = 0;
  #closed = false;

  constructor(options: RotatingLogOptions) {
    this.#fs = options.fs ?? realFs;
    this.#dir = options.dir;
    this.#name = options.name;
    this.#maxBytes = Math.max(1024, options.maxBytes ?? 5 * 1024 * 1024);
    this.#keep = Math.max(1, options.keep ?? 5);
  }

  get rotations(): number {
    return this.#rotations;
  }

  get path(): string {
    return join(this.#dir, this.#name);
  }

  async #ensureOpen(): Promise<FileHandleLike> {
    if (this.#handle !== undefined) return this.#handle;
    await this.#fs.mkdir(this.#dir, { recursive: true, mode: 0o700 });
    this.#size = await this.#fs.stat(this.path).then((stat) => stat.size, () => 0);
    this.#handle = await this.#fs.open(this.path, "a", 0o600);
    return this.#handle;
  }

  async #rotate(): Promise<void> {
    await this.#handle?.close().catch(() => undefined);
    this.#handle = undefined;
    const rename = async (from: string, to: string): Promise<void> => {
      try {
        await this.#fs.rename(from, to);
      } catch (error) {
        if (errnoCode(error) !== "ENOENT") throw error;
      }
    };
    await this.#fs.unlink(`${this.path}.${this.#keep}`).catch(() => undefined);
    for (let index = this.#keep - 1; index >= 1; index -= 1) await rename(`${this.path}.${index}`, `${this.path}.${index + 1}`);
    await rename(this.path, `${this.path}.1`);
    this.#rotations += 1;
  }

  append(line: string, options: { readonly sync?: boolean } = {}): Promise<void> {
    const work = async (): Promise<void> => {
      if (this.#closed) throw new Error("The log is closed.");
      const bytes = Buffer.from(`${line}\n`, "utf8");
      try {
        let handle = await this.#ensureOpen();
        if (this.#size > 0 && this.#size + bytes.length > this.#maxBytes) {
          await this.#rotate();
          handle = await this.#ensureOpen();
        }
        let offset = 0;
        while (offset < bytes.length) {
          const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset);
          if (bytesWritten <= 0) throw new Error("A write made no progress.");
          offset += bytesWritten;
        }
        this.#size += bytes.length;
        if (options.sync === true) await handle.sync();
      } catch (error) {
        // Reopen next time rather than keep a handle that may be broken.
        await this.#handle?.close().catch(() => undefined);
        this.#handle = undefined;
        throw error;
      }
    };
    const result = this.#queue.then(work, work);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async close(): Promise<void> {
    await this.#queue.catch(() => undefined);
    this.#closed = true;
    await this.#handle?.sync().catch(() => undefined);
    await this.#handle?.close().catch(() => undefined);
    this.#handle = undefined;
  }
}

// ---- the hash chain ----------------------------------------------------------------------------------------------------
//
// Each line gets `seq` (1, 2, ...) and `h` = sha256(previous h + "\n" + the line without its own h), the first previous h
// being 64 zeros. A changed, removed or reordered line breaks every link after it. It is tamper-EVIDENT against an
// accident or a careless edit, not against a malicious local process, which can recompute the rest of the chain; and it
// restarts at the zero link when the process does (the log is never read back), so a restart shows as seq 1.
const GENESIS_LINK = "0".repeat(64);

class HashChain {
  #head = GENESIS_LINK;
  #seq = 0;
  #started = false;

  head(): string | undefined {
    return this.#started ? this.#head : undefined;
  }

  // The chained form of a line, and a commit to call once the line is safely written.
  link(line: string): { readonly line: string; commit(): void } {
    const record = JSON.parse(line) as Record<string, unknown>;
    const seq = this.#seq + 1;
    const body = JSON.stringify({ ...record, seq });
    const h = createHash("sha256").update(`${this.#head}\n${body}`).digest("hex");
    return {
      line: JSON.stringify({ ...record, seq, h }),
      commit: () => {
        this.#seq = seq;
        this.#head = h;
        this.#started = true;
      },
    };
  }
}

// ---- the audit writer -----------------------------------------------------------------------------------------------

export interface RelayAuditOptions {
  readonly dir: string;
  readonly fs?: FsLike;
  readonly now?: () => number;
  readonly maxBytes?: number;
  readonly keep?: number;
  // Known secret strings (relay keys, the master secret), blanked out of every line.
  readonly scrub?: () => readonly string[];
  // Add `seq` and a SHA-256 link `h` to every line (see HashChain above) and expose the head.
  readonly chain?: boolean;
}

export interface MemoryAuditOptions {
  readonly chain?: boolean;
}

export async function createRelayAudit(options: RelayAuditOptions): Promise<RelayAudit> {
  const now = options.now ?? Date.now;
  const log = new RotatingLog({
    dir: options.dir,
    name: "audit.log",
    ...(options.fs === undefined ? {} : { fs: options.fs }),
    ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
    ...(options.keep === undefined ? {} : { keep: options.keep }),
  });
  let written = 0;
  let failed = 0;
  let healthy = true;
  const chain = options.chain === true ? new HashChain() : undefined;
  // Links are computed from the previous one, so chained writes go one at a time.
  let turn: Promise<unknown> = Promise.resolve();
  const writeOne = async (event: RelayAuditEvent): Promise<void> => {
    const plain = formatRelayAuditLine(event, now(), options.scrub?.() ?? []);
    const linked = chain?.link(plain);
    try {
      await log.append(linked?.line ?? plain, { sync: event.sync === true });
      linked?.commit();
      written += 1;
      healthy = true;
    } catch {
      failed += 1;
      healthy = false;
    }
  };
  return {
    write(event) {
      if (chain === undefined) return writeOne(event);
      const result = turn.then(() => writeOne(event));
      turn = result;
      return result;
    },
    ...(chain === undefined ? {} : { head: (): string | undefined => chain.head() }),
    healthy: () => healthy,
    stats: () => ({ written, failed, rotations: log.rotations, dropped: 0 }),
    close: () => log.close(),
  };
}

// For tests and for streams that want to see what would be audited. Keeps the formatted lines.
export function createMemoryAudit(now: () => number = Date.now, scrub: () => readonly string[] = () => [], options: MemoryAuditOptions = {}): RelayAudit & {
  readonly lines: string[];
  failNext(): void;
} {
  const lines: string[] = [];
  const chain = options.chain === true ? new HashChain() : undefined;
  let healthy = true;
  let failing = false;
  let written = 0;
  let failed = 0;
  return {
    lines,
    failNext() {
      failing = true;
    },
    async write(event) {
      if (failing) {
        failing = false;
        failed += 1;
        healthy = false;
        return;
      }
      const plain = formatRelayAuditLine(event, now(), scrub());
      const linked = chain?.link(plain);
      lines.push(linked?.line ?? plain);
      linked?.commit();
      written += 1;
      healthy = true;
    },
    ...(chain === undefined ? {} : { head: (): string | undefined => chain.head() }),
    healthy: () => healthy,
    stats: () => ({ written, failed, rotations: 0, dropped: 0 }),
    close: async () => undefined,
  };
}

declare module "./types.js" {
  interface RelayServices {
    readonly audit?: RelayAudit;
  }
}
