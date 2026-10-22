import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import * as z from "zod/v4";

import { PREPARED_GET_SINCE_RELAY_VERSION, PREPARED_KINDS, isoSecondSchema, preparedIdSchema, preparedItemPath, type RelayClient, type RelayFailure } from "../src/relay/contract.js";
import { relayVersionPredatesPreparedGet } from "../src/tools/prepared.js";
import { INBOX_MAX_ITEMS, requestedBySchema } from "./contract.js";
import { inboxOf, type InboxJournalEntry, type InboxJournalSink } from "./inbox.js";
import type { DaemonHost } from "./server.js";

// The inbox after a daemon restart (docs/dapp-runbook.md section 3.3, "The inbox after a restart").
//
// WHAT WAS LOST. The inbox (bridge/inbox.ts) holds its items in memory. The relay keeps every prepared item durably in
// the data directory, with the answer its prepare route gave, but nothing told a restarted daemon WHICH of them were in
// its inbox, so the page found an empty list and an agent's item could not be shown or signed through the Cockpit.
//
// WHAT IS KEPT NOW. <data dir>/cockpit/inbox-ids.json (mode 0600, written by the writer instance only, replaced
// atomically) lists the in-flight items (prepared, shown, signed, submitted), at most INBOX_MAX_ITEMS, each with:
//   prepared_id   the relay's id for the item;
//   owner         the wallet it is for, lower case, compared with the item the relay returns;
//   kind          userop, order, auth, create, clob_order or clob_auth, compared the same way;
//   requested_by  "ui", "terminal" or "agent:<first 8 hex of the agent token's id>" (the inbox item must name its
//                 requester, and a guessed one would be wrong);
//   created_at    when it entered the inbox (whole seconds), so the list keeps its order and age.
// Nothing else: no item, summary line, digest, signing intent, signature, token or key. The ids are what the relay's
// own store and audit log already hold in the same directory. An item leaves the list when it is accepted, rejected,
// expired or ambiguous, or when it is not restored.
//
// WHAT HAPPENS AT START (restoreInbox, called by bridge/main.ts on the writer instance after the relay is joined). For
// each listed id the daemon asks its relay for the item, GET /v1/prepared/{id}, which answers the stored item only
// while it can still be signed. An item that comes back goes through Inbox.restore: the same id, owner and kind as the
// list says, then every check of a freshly prepared item (strict schema, size, hostile text, owner and derived account,
// time left, the relay's own record, and the digest, tags and summary lines rebuilt from the decoded block). It is
// listed again at "prepared": a card shown before the restart must be shown again, and a signature made before it was
// never kept. Every other answer drops the id, audited (feed.mismatch, field restore.<reason>) and said on stderr:
//   expired          the relay says the item ran out of time;
//   used             the relay says it was already submitted (accepted or refused): single use;
//   ambiguous        a send was started and its outcome is unknown (or still running): never offered, never resent;
//   not_found        the relay holds no such item for an owner it serves;
//   answer_not_kept  the relay that prepared it did not keep its prepare answer, so it cannot be read back;
//   relay_too_old    the relay's version predates GET /v1/prepared/{id} (PREPARED_GET_SINCE_RELAY_VERSION);
//   relay_error      no usable answer (timeout, relay not running, a malformed answer);
//   refused          the item came back but failed one of the checks above (Inbox.restore audits which).

export const INBOX_JOURNAL_FILE = "inbox-ids.json";
// Per relay call. The relay is in this process, so an answer takes milliseconds; this only bounds a stuck one.
export const RESTORE_CALL_MS = 3_500;
const MAX_JOURNAL_BYTES = 128 * 1024;

const journalEntrySchema = z
  .object({
    prepared_id: preparedIdSchema,
    owner: z.string().regex(/^0x[0-9a-f]{40}$/),
    kind: z.enum(PREPARED_KINDS),
    requested_by: requestedBySchema,
    created_at: isoSecondSchema,
  })
  .strict();
const journalSchema = z
  .object({
    v: z.literal(1),
    items: z.array(journalEntrySchema).max(INBOX_MAX_ITEMS),
  })
  .strict();

// ---- the file ------------------------------------------------------------------------------------------------------------------

export type JournalRead =
  | { readonly status: "absent"; readonly entries: readonly InboxJournalEntry[] }
  | { readonly status: "read"; readonly entries: readonly InboxJournalEntry[] }
  // The file is there but cannot be used (unreadable, too big, not JSON, not the schema). Nothing is restored from it,
  // and the next save replaces it.
  | { readonly status: "unusable"; readonly entries: readonly InboxJournalEntry[]; readonly problem: "unreadable" | "too_large" | "invalid" };

export async function readInboxJournal(dir: string): Promise<JournalRead> {
  let text: string;
  try {
    const buffer = await readFile(join(dir, INBOX_JOURNAL_FILE));
    if (buffer.byteLength > MAX_JOURNAL_BYTES) return { status: "unusable", entries: [], problem: "too_large" };
    text = buffer.toString("utf8");
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "ENOENT") return { status: "absent", entries: [] };
    return { status: "unusable", entries: [], problem: "unreadable" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { status: "unusable", entries: [], problem: "invalid" };
  }
  const parsed = journalSchema.safeParse(raw);
  if (!parsed.success) return { status: "unusable", entries: [], problem: "invalid" };
  const seen = new Set<string>();
  const entries: InboxJournalEntry[] = [];
  for (const entry of parsed.data.items) {
    if (seen.has(entry.prepared_id)) continue;
    seen.add(entry.prepared_id);
    entries.push(entry);
  }
  return { status: "read", entries };
}

// Writes the list whenever the inbox's in-flight set changes. Writes are serialised and coalesced (only the newest list
// is written), each to a temporary file that is synced and then renamed over the old one, so a crash leaves either the
// old list or the new one. A failed write is said once on stderr; the inbox keeps working without it.
export class InboxJournalFile implements InboxJournalSink {
  readonly #dir: string;
  readonly #stderr: { write(text: string): unknown };
  #latest: string | undefined;
  #writing: Promise<void> | undefined;
  #warned = false;
  #failures = 0;

  constructor(dir: string, stderr: { write(text: string): unknown }) {
    this.#dir = dir;
    this.#stderr = stderr;
  }

  save(entries: readonly InboxJournalEntry[]): void {
    const items = entries.slice(0, INBOX_MAX_ITEMS).map((entry) => ({
      prepared_id: entry.prepared_id,
      owner: entry.owner,
      kind: entry.kind,
      requested_by: entry.requested_by,
      created_at: entry.created_at,
    }));
    this.#latest = `${JSON.stringify({ v: 1, items })}\n`;
    this.#kick();
  }

  // Resolves once every save made so far is on disk (or has failed).
  async flush(): Promise<void> {
    while (this.#writing !== undefined) await this.#writing;
  }

  failures(): number {
    return this.#failures;
  }

  #kick(): void {
    if (this.#writing !== undefined) return;
    this.#writing = this.#drain().finally(() => {
      this.#writing = undefined;
      if (this.#latest !== undefined) this.#kick();
    });
  }

  async #drain(): Promise<void> {
    while (this.#latest !== undefined) {
      const text = this.#latest;
      this.#latest = undefined;
      try {
        await writeAtomically(this.#dir, text);
      } catch {
        this.#failures += 1;
        if (!this.#warned) {
          this.#warned = true;
          this.#stderr.write(`xo-market cockpit: ${INBOX_JOURNAL_FILE} could not be written; the inbox works, but its items will not be restored after a restart.\n`);
        }
      }
    }
  }
}

async function writeAtomically(dir: string, text: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, INBOX_JOURNAL_FILE);
  const temp = `${file}.tmp-${String(process.pid)}`;
  const handle = await open(temp, "w", 0o600);
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

// ---- reading an item back from the relay ----------------------------------------------------------------------------------------

export const RESTORE_DROP_REASONS = ["expired", "used", "ambiguous", "not_found", "answer_not_kept", "relay_too_old", "relay_error", "refused"] as const;
export type RestoreDropReason = (typeof RESTORE_DROP_REASONS)[number];

export type RelayReadBack = { readonly ok: true; readonly item: unknown } | { readonly ok: false; readonly reason: Exclude<RestoreDropReason, "refused">; readonly detail: string | null };

export type PreparedReader = Pick<RelayClient, "get">;

const DETAIL = /^[a-z][a-z0-9_]{0,47}$/;
const VERSION = /^[0-9A-Za-z.+-]{1,32}$/;
const detailOf = (value: unknown): string | null => (typeof value === "string" && DETAIL.test(value) ? value : null);

// One GET /v1/prepared/{id}, its failure sorted into a reason. Never throws.
export async function readBack(relay: PreparedReader, id: string, callMs: number = RESTORE_CALL_MS): Promise<RelayReadBack> {
  let failure: RelayFailure;
  try {
    const result = await relay.get(preparedItemPath(id), { timeoutMs: callMs });
    if (result.ok) return { ok: true, item: result.data };
    failure = result.error;
  } catch {
    return { ok: false, reason: "relay_error", detail: "client_error" };
  }
  const state = failure.details?.["state"];
  switch (failure.code) {
    case "expired":
      return { ok: false, reason: "expired", detail: null };
    case "prepared_used":
      // "sending" is a send whose outcome is not known yet: as unsafe to offer as an ambiguous one.
      return state === "ambiguous" || state === "sending" ? { ok: false, reason: "ambiguous", detail: state } : { ok: false, reason: "used", detail: detailOf(state) };
    case "precondition_failed":
      return failure.details?.["reason"] === "answer_not_kept" ? { ok: false, reason: "answer_not_kept", detail: null } : { ok: false, reason: "relay_error", detail: detailOf(failure.details?.["reason"]) ?? failure.code };
    case "not_found":
    case "not_implemented": {
      // A relay without the route answers not_found ("No such route") or not_implemented. Its version tells that
      // apart from an id it does not hold.
      try {
        const health = await relay.get("/v1/health", { timeoutMs: callMs });
        if (health.ok && relayVersionPredatesPreparedGet(health.data.version) === true) {
          return { ok: false, reason: "relay_too_old", detail: VERSION.test(health.data.version) ? health.data.version : "unknown" };
        }
      } catch {
        // No version to compare: the relay's own answer stands.
      }
      return failure.code === "not_found" ? { ok: false, reason: "not_found", detail: null } : { ok: false, reason: "relay_error", detail: "not_implemented" };
    }
    default:
      return { ok: false, reason: "relay_error", detail: failure.code };
  }
}

// ---- restore -------------------------------------------------------------------------------------------------------------------

export interface RestoreDrop {
  readonly prepared_id: string;
  readonly reason: RestoreDropReason;
  // A short machine word: the relay's state or code, the relay version, or the check that failed.
  readonly detail: string | null;
}

export interface RestoreReport {
  readonly journal: JournalRead["status"];
  readonly restored: readonly string[];
  readonly dropped: readonly RestoreDrop[];
}

export interface InboxRestoreOptions {
  // <data dir>/cockpit
  readonly dir: string;
  // The daemon's own relay (bridge/main.ts: the in-process relay's client).
  readonly relay: PreparedReader;
  readonly callMs?: number;
}

function sentence(drop: RestoreDrop): string {
  switch (drop.reason) {
    case "expired":
      return "the relay says it ran out of time. Prepare it again if it is still wanted.";
    case "used":
      return `the relay says it was already used${drop.detail === null ? "" : ` (${drop.detail})`}. It is single use and nothing for it can be signed now; check the status of what it held.`;
    case "ambiguous":
      return "a send for it was started and its outcome is unknown. It is not shown for signing and must not be signed or sent again; check the status of the operation or order it holds first.";
    case "not_found":
      return "the relay holds no such item for an owner it serves (it may have been removed).";
    case "answer_not_kept":
      return "the relay that prepared it did not keep its prepare answer, so it cannot be read back by id. Prepare it again.";
    case "relay_too_old":
      return `the relay reports version ${drop.detail ?? "unknown"}, which predates GET /v1/prepared/{id} (relay ${PREPARED_GET_SINCE_RELAY_VERSION} or later). Prepare it again.`;
    case "relay_error":
      return `the relay gave no usable answer${drop.detail === null ? "" : ` (${drop.detail})`}. Ask for it with xo_get_prepared once the relay answers.`;
    case "refused":
      return `the item the relay returned failed the daemon's checks${drop.detail === null ? "" : ` (${drop.detail})`}, so it is not shown.`;
  }
}

// Reads the list, attaches the journal to the host's inbox, and brings back what can be brought back. Never throws.
export async function restoreInbox(host: DaemonHost, options: InboxRestoreOptions): Promise<RestoreReport> {
  const inbox = inboxOf(host);
  const read = await readInboxJournal(options.dir);
  if (read.status === "unusable") {
    host.emitAudit({ ev: "schema.violation", outcome: "refused", code: `inbox_journal_${read.problem}`, field: "inbox_journal" });
    host.stderr.write(`xo-market cockpit: ${INBOX_JOURNAL_FILE} could not be used (${read.problem}); no inbox item is restored, and the file is replaced.\n`);
  }
  const journal = new InboxJournalFile(options.dir, host.stderr);
  host.onClose(() => journal.flush());
  // From here on every change of the inbox is written, and the ids still being read back stay in the list.
  inbox.attachJournal(journal, read.entries, { absent: read.status === "absent" });

  const restored: string[] = [];
  const dropped: RestoreDrop[] = [];
  for (const entry of read.entries) {
    const id = entry.prepared_id;
    const back = await readBack(options.relay, id, options.callMs);
    let drop: RestoreDrop | undefined;
    if (back.ok) {
      const result = inbox.restore(back.item, entry);
      // Inbox.restore audits its own refusal (schema.violation or feed.mismatch with the field).
      if (result.ok) restored.push(id);
      else drop = { prepared_id: id, reason: "refused", detail: result.reason };
    } else {
      drop = { prepared_id: id, reason: back.reason, detail: back.detail };
      host.emitAudit({ ev: "feed.mismatch", outcome: "refused", preparedId: id, field: `restore.${back.reason}`, code: `restore_${back.reason}`, ...((back.reason === "used" || back.reason === "ambiguous") && back.detail !== null ? { state: back.detail } : {}) });
    }
    if (drop !== undefined) {
      dropped.push(drop);
      host.stderr.write(`xo-market cockpit: inbox item ${id} from before the restart was not restored: ${sentence(drop)}\n`);
    }
    inbox.settlePending(id);
  }
  if (read.entries.length > 0) {
    host.stderr.write(`xo-market cockpit: inbox: ${String(restored.length)} of ${String(read.entries.length)} items from before the restart restored from the relay${dropped.length > 0 ? `; ${String(dropped.length)} not restored (reasons above)` : ""}.\n`);
  }
  return { journal: read.status, restored, dropped };
}
