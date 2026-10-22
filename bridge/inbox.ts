import type { PreparedState } from "../relay/prepared.js";
import type { LocalRuntime } from "../src/local/runtime.js";
import { clobAccountOf } from "../src/clob/polymarket/deposit-wallet.js";
import { preparedIdSchema, type PreparedKind } from "../src/relay/contract.js";
import { deriveAccount, parseOwner } from "../src/xo/account/derive.js";
import { verifyPreparedLocal } from "../src/xo/signing/rebuild.js";
import { attachAuditSink, auditAdapterOf } from "./audit-adapter.js";
import {
  CARD_VERIFICATIONS,
  INBOX_MAX_ITEMS,
  canTransition,
  inboxDecisionRequestSchema,
  inboxItemSchema,
  inboxPreparedSchema,
  requestedBySchema,
  type InboxItem,
  type InboxState,
} from "./contract.js";
import { eventBusOf, isoSecond, realTimers, type Timers } from "./events.js";
import { defineRoute, fail, json, type BridgeModule, type BridgeModuleFactory, type DaemonHost } from "./server.js";

// The prepared inbox (docs/dapp-design.md 5.3, 5.4, 7.2 M4-1 to M4-9, work package D4).
//
// WHAT IT IS. A read-mostly view of the prepared items the relay holds, for the Signature Card. Every item in it
// is the relay's own record: it enters through `Inbox.ingest`, which only daemon-side code calls with what the
// relay (or the plugin tool that wraps it) returned. The page cannot add an item, change one, or put text into one.
// The page's two inputs, "this card was shown" and "reject", are recorded as decisions; the tags and the
// verification word they carry are compared with the daemon's own and then only audited, never stored on the item,
// never echoed. The inbox shows ONLY the relay record's text (M4-5).
//
// WHAT INGEST CHECKS (each refusal is audited and tested):
//   - the item is at most MAX_ITEM_CHARS of JSON and matches the relay contract's strict prepared schemas
//     (digest, tags and signing intent agree with each other and with the item's kind);
//   - its owner is a usable wallet and its account is the one derived here from that owner (the owner itself for a
//     CLOB venue item, whose maker is the owner): the same identity check the plugin's prepare tools make;
//   - none of its strings holds a control, bidi, zero-width or tag character (the relay sanitises; the inbox
//     refuses what a bad relay or a swapped tool result would let through);
//   - it is not already out of time;
//   - when a relay source is attached, the relay HAS that record and its digest, owner, account and kind agree
//     (no record, or a different one, is a refusal: a fail-closed rule);
//   - the daemon's own rebuild (verifyPreparedLocal) is run and kept as the item's verification. A mismatch is
//     audited as feed.mismatch and the item stays visible (the card goes red); the signer (S2) must ask
//     `verificationOf(id)` and refuse anything but "verified";
//   - an id seen before is idempotent only for byte-identical content; different content under a known id is a
//     conflict, audited, and the first record stands.
//
// STATE. Commanded moves obey the contract's INBOX_TRANSITIONS (prepared -> shown -> signed, any open state ->
// rejected). Observed moves follow the relay: its record says sending (shown here as submitted), accepted, rejected,
// ambiguous or expired, whatever the inbox thought. An item the user rejected here but the relay then sent is shown
// as what the relay says and audited as feed.mismatch. "Reject" in the inbox does NOT cancel anything at the relay
// (the relay has no such call): it stops the daemon's own signing path and marks the card; an agent that still holds
// the signature can submit, and the state will then follow the relay. The UI must not say "cancelled".
//
// THE ROUTES (all in the frozen contract):
//   GET  /ui/inbox                 read  the items, newest first, and the id of the newest event they reflect
//   GET  /ui/inbox/:prepared_id    read  one item
//   POST /ui/inbox/decision        prepare, page tokens only: {decision: "shown" | "reject", ...}
// POST /ui/inbox/sign (path S2) belongs to the signer module (bridge/paybox-signer.ts); it uses the service methods
// below (`markSigned`, `verificationOf`).
//
// AFTER A RESTART. The items live in memory; what survives a restart is a short list of the in-flight ones (prepared,
// shown, signed, submitted) that bridge/inbox-restore.ts keeps in <data dir>/cockpit/inbox-ids.json: per item its id,
// owner, kind, who asked for it and when it entered the inbox. Never the item, a summary line, a signature or a key.
// At start the daemon reads each one back from the relay (GET /v1/prepared/{id}) and passes it through `restore`,
// which is `ingest` plus a comparison with what the list says. A restored item starts again at "prepared": a card
// shown before the restart must be shown again, and a signature made before it was never kept.
//
// WIRING. `inboxOf(host)` is the host's one service. `attachPreparedSource(host, source)` connects it to the relay's
// prepared records; `attachRelayRuntime(host, runtime)` does that and attaches the relay's audit log in one call.
// bridge/main.ts (or Integrate) must make that call with `context.runtime`: this module cannot reach the runtime
// from the host alone, and without it states are only locally derived (open, shown, rejected, expired) and ingest
// cannot cross-check the relay.

export const MAX_ITEM_CHARS = 160_000;
export const RECONCILE_MS = 2_000;
// Finished items are forgotten after a day (the relay keeps its own record for a week).
export const TERMINAL_RETENTION_MS = 24 * 60 * 60 * 1000;
const OPEN_STATES: ReadonlySet<InboxState> = new Set(["prepared", "shown", "signed"]);
// The items whose ids survive a restart: still signable, or sent with no answer yet.
const IN_FLIGHT_STATES: ReadonlySet<InboxState> = new Set(["prepared", "shown", "signed", "submitted"]);
const FINAL_STATES: ReadonlySet<InboxState> = new Set(["accepted", "rejected", "expired"]);
const DETAIL = /^[a-z][a-z0-9_]{0,47}$/;
const HEX32 = /^[0-9a-f]{32}$/;

// ---- the relay port ------------------------------------------------------------------------------------------------------

// What the inbox needs to know about the relay's record of one prepared item.
export interface RelayRecordView {
  readonly id: string;
  readonly kind: string;
  readonly owner: string;
  readonly account: string;
  readonly digest: string;
  readonly state: PreparedState;
  // A short machine code from the relay, never upstream text.
  readonly detail: string | null;
}
export interface PreparedSource {
  lookup(id: string): RelayRecordView | undefined;
}

// The in-process relay's prepared records (relay/prepared.ts), read through the local runtime. Nothing is written.
export function runtimePreparedSource(runtime: Pick<LocalRuntime, "status">): PreparedSource {
  return {
    lookup(id) {
      // A relay that cannot answer is the same as one that has no such record: the item is not listed.
      try {
        const status = runtime.status();
        if (status.state !== "ready") return undefined;
        const record = status.relay.services.prepared.get(id);
        if (record === undefined) return undefined;
        return { id: record.id, kind: record.kind, owner: record.owner, account: record.account, digest: record.digest, state: record.state, detail: record.detail };
      } catch {
        return undefined;
      }
    },
  };
}

// ---- verification ---------------------------------------------------------------------------------------------------------

export type Verification =
  | { readonly status: "verified"; readonly covered: readonly string[]; readonly unbound: readonly string[] }
  // An older relay's item with no decoded block: nothing to rebuild from.
  | { readonly status: "unverified"; readonly field: string }
  | { readonly status: "mismatch"; readonly field: string };

function verificationOf(item: unknown): Verification {
  const result = verifyPreparedLocal(item);
  if (result.ok) return { status: "verified", covered: result.covered, unbound: result.unbound };
  return result.status === "not_derivable" ? { status: "unverified", field: result.field } : { status: "mismatch", field: result.field };
}

const VERDICT_WORD = { verified: "match", unverified: "not_derivable", mismatch: "mismatch" } as const;

// ---- hostile text -----------------------------------------------------------------------------------------------------------

// Controls (C0, DEL, C1), soft hyphen, Arabic letter mark, zero-width and bidi marks and overrides, word joiners and
// invisible operators, BOM, interlinear annotations, and the tag block. A line break inside a field is also refused:
// every string in a prepared item is one line.
const HOSTILE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]|[\u{e0000}-\u{e007f}]/u;
const MAX_NODES = 40_000;

// Path of the first string that holds a hostile character, or undefined. "too_big" when the tree is absurd.
export function hostileTextPath(value: unknown): string | undefined {
  let nodes = 0;
  const walk = (node: unknown, path: string, depth: number): string | undefined => {
    nodes += 1;
    if (nodes > MAX_NODES || depth > 14) return "too_big";
    if (typeof node === "string") return HOSTILE.test(node) ? path : undefined;
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index += 1) {
        const found = walk(node[index], `${path}[${String(index)}]`, depth + 1);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    if (typeof node === "object" && node !== null) {
      for (const [key, child] of Object.entries(node)) {
        if (HOSTILE.test(key)) return `${path}.key`;
        const found = walk(child, path === "" ? key : `${path}.${key}`, depth + 1);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  return walk(value, "", 0);
}

// ---- the service -------------------------------------------------------------------------------------------------------------------

export type RequestedBy = InboxItem["requested_by"];

// What the daemon keeps on disk about one in-flight item so that it can read it back from the relay after a restart.
// Ids and labels only: nothing in it can be signed, and nothing in it is secret.
export interface InboxJournalEntry {
  readonly prepared_id: string;
  // Lower case.
  readonly owner: string;
  readonly kind: PreparedKind;
  readonly requested_by: RequestedBy;
  readonly created_at: string;
}
export interface InboxJournalSink {
  save(entries: readonly InboxJournalEntry[]): void;
}
export type Actor = { readonly tokenId?: string };

export type IngestRefusal =
  | "invalid"
  | "too_large"
  | "hostile_text"
  | "expired"
  | "no_relay_record"
  | "record_mismatch"
  | "conflict"
  | "inbox_full"
  // `restore` only: the relay's item is not the one the daemon's list names (id, owner or kind).
  | "journal_mismatch";
export type IngestResult =
  | { readonly ok: true; readonly item: InboxItem; readonly created: boolean }
  | { readonly ok: false; readonly reason: IngestRefusal; readonly field?: string };

export type CardReport = {
  readonly digest_tag: string;
  readonly inner_hash_tag: string | null;
  readonly verification: (typeof CARD_VERIFICATIONS)[number];
  readonly failed_checks: readonly string[];
};

export type ChangeResult =
  | { readonly ok: true; readonly item: InboxItem; readonly changed: boolean }
  | { readonly ok: false; readonly reason: "not_found" | "bad_state"; readonly state?: InboxState };

interface Entry {
  item: InboxItem;
  readonly expiresAtMs: number;
  readonly verification: Verification;
  readonly canonical: string;
  detail: string | null;
}

export interface InboxOptions {
  readonly reconcileMs?: number;
  readonly timers?: Timers;
  readonly maxItems?: number;
}

export class Inbox {
  readonly #host: DaemonHost;
  readonly #bus: ReturnType<typeof eventBusOf>;
  #source: PreparedSource | undefined;
  #entries = new Map<string, Entry>();
  #timers: Timers = realTimers;
  #reconcileMs: number = RECONCILE_MS;
  #maxItems: number = INBOX_MAX_ITEMS;
  #ticker: unknown;
  #closed = false;
  #journal: InboxJournalSink | undefined;
  // Ids read from the journal at start whose relay answer is still awaited: kept in every save until settled.
  #pending = new Map<string, InboxJournalEntry>();
  #lastSaved: string | undefined;

  constructor(host: DaemonHost, options: InboxOptions = {}) {
    this.#host = host;
    this.#bus = eventBusOf(host);
    this.configure(options);
    host.onClose(() => this.close());
  }

  configure(options: InboxOptions): void {
    if (options.reconcileMs !== undefined) this.#reconcileMs = Math.max(10, Math.floor(options.reconcileMs));
    if (options.timers !== undefined) this.#timers = options.timers;
    if (options.maxItems !== undefined) this.#maxItems = Math.max(1, Math.min(INBOX_MAX_ITEMS, Math.floor(options.maxItems)));
  }

  attachSource(source: PreparedSource | undefined): void {
    this.#source = source;
  }

  hasSource(): boolean {
    return this.#source !== undefined;
  }

  // Connects the list of in-flight ids that survives a restart. `pending` are the entries read back at start that
  // are still being fetched from the relay; they stay in the list until `settlePending` is called for each.
  // `absent`: there is no list on disk yet, so an empty one need not be written.
  attachJournal(sink: InboxJournalSink | undefined, pending: readonly InboxJournalEntry[] = [], options: { readonly absent?: boolean } = {}): void {
    this.#journal = sink;
    this.#pending = new Map(pending.map((entry) => [entry.prepared_id, entry]));
    this.#lastSaved = options.absent === true ? "[]" : undefined;
    this.#persist();
  }

  settlePending(id: string): void {
    if (this.#pending.delete(id)) this.#persist();
  }

  // The entries the journal holds now, in a stable order.
  journalEntries(): InboxJournalEntry[] {
    const out = new Map<string, InboxJournalEntry>(this.#pending);
    for (const entry of this.#entries.values()) {
      const item = entry.item;
      if (!IN_FLIGHT_STATES.has(item.state)) continue;
      out.set(item.prepared_id, { prepared_id: item.prepared_id, owner: item.prepared.owner.toLowerCase(), kind: item.prepared.kind, requested_by: item.requested_by, created_at: item.created_at });
    }
    return [...out.values()].sort((a, b) => (a.created_at === b.created_at ? (a.prepared_id < b.prepared_id ? -1 : 1) : a.created_at < b.created_at ? -1 : 1));
  }

  #persist(): void {
    if (this.#journal === undefined) return;
    const entries = this.journalEntries();
    const text = JSON.stringify(entries);
    if (text === this.#lastSaved) return;
    this.#lastSaved = text;
    this.#journal.save(entries);
  }

  // ---- reads ----

  list(): InboxItem[] {
    this.reconcile();
    return [...this.#entries.values()].map((entry) => entry.item).sort((a, b) => (a.created_at === b.created_at ? (a.prepared_id < b.prepared_id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1));
  }

  get(id: string): InboxItem | undefined {
    this.reconcile();
    return this.#entries.get(id)?.item;
  }

  // The daemon's own check of the item. The signer must refuse anything but "verified".
  verificationOf(id: string): Verification | undefined {
    return this.#entries.get(id)?.verification;
  }

  size(): number {
    return this.#entries.size;
  }

  // ---- ingest ----

  ingest(input: unknown, requestedBy: RequestedBy | string): IngestResult {
    return this.#admit(input, requestedBy, undefined);
  }

  // An item read back from the relay after a restart, for an entry of the daemon's own list. It must be the item the
  // list names (same id, owner and kind); then it goes through every check of `ingest` and keeps the requester and
  // the time it first entered the inbox. A restored item starts at "prepared".
  restore(input: unknown, entry: InboxJournalEntry): IngestResult {
    const pid = idOf(input);
    const item = typeof input === "object" && input !== null ? (input as { readonly owner?: unknown; readonly kind?: unknown }) : {};
    let field: string | undefined;
    if (pid !== entry.prepared_id) field = "prepared_id";
    else if (typeof item.owner !== "string" || item.owner.toLowerCase() !== entry.owner) field = "owner";
    else if (item.kind !== entry.kind) field = "kind";
    if (field !== undefined) {
      this.#mismatch(entry.prepared_id, `journal.${field}`);
      return { ok: false, reason: "journal_mismatch", field };
    }
    return this.#admit(input, entry.requested_by, entry.created_at);
  }

  #admit(input: unknown, requestedBy: RequestedBy | string, createdAt: string | undefined): IngestResult {
    const by = requestedBySchema.safeParse(requestedBy);
    if (!by.success) return this.#refuse("invalid", undefined, "requested_by");
    const pid = idOf(input);

    let chars: number;
    try {
      chars = JSON.stringify(input)?.length ?? 0;
    } catch {
      return this.#refuse("invalid", pid, "item");
    }
    if (chars > MAX_ITEM_CHARS) return this.#refuse("too_large", pid, "item");

    const parsed = inboxPreparedSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return this.#refuse("invalid", pid, issue === undefined || issue.path.length === 0 ? "item" : fieldOf(issue.path));
    }
    const prepared = parsed.data;
    const hostile = hostileTextPath(prepared);
    if (hostile !== undefined) return this.#refuse("hostile_text", prepared.prepared_id, hostile === "too_big" ? "item" : fieldOf(hostile.split(".")));
    const identity = identityDisagreement(prepared);
    if (identity !== undefined) {
      this.#mismatch(prepared.prepared_id, identity);
      return { ok: false, reason: "record_mismatch", field: identity };
    }

    const nowMs = this.#host.clock();
    const expiresAtMs = Date.parse(prepared.expires_at);
    if (!(expiresAtMs > nowMs)) return this.#refuse("expired", prepared.prepared_id, "expires_at");

    const canonical = JSON.stringify(prepared);
    const existing = this.#entries.get(prepared.prepared_id);
    if (existing !== undefined) {
      if (existing.canonical === canonical) return { ok: true, item: existing.item, created: false };
      this.#mismatch(prepared.prepared_id, "prepared");
      return { ok: false, reason: "conflict", field: "prepared" };
    }

    const view = this.#source?.lookup(prepared.prepared_id);
    if (this.#source !== undefined) {
      if (view === undefined) {
        this.#host.emitAudit({ ev: "feed.mismatch", outcome: "refused", preparedId: prepared.prepared_id, field: "relay_record", code: "no_relay_record" });
        return { ok: false, reason: "no_relay_record", field: "relay_record" };
      }
      const disagree = recordDisagreement(prepared, view);
      if (disagree !== undefined) {
        this.#mismatch(prepared.prepared_id, disagree);
        return { ok: false, reason: "record_mismatch", field: disagree };
      }
    }

    if (this.#entries.size >= this.#maxItems && !this.#evictOne()) return this.#refuse("inbox_full", prepared.prepared_id, "inbox");

    const verification = verificationOf(prepared);
    if (verification.status === "mismatch") this.#mismatch(prepared.prepared_id, verification.field);

    const at = isoSecond(nowMs);
    const item: InboxItem = {
      prepared_id: prepared.prepared_id,
      state: "prepared",
      requested_by: by.data,
      created_at: createdAt ?? at,
      updated_at: at,
      expires_at: prepared.expires_at,
      prepared,
      result: null,
    };
    const checked = inboxItemSchema.safeParse(item);
    if (!checked.success) return this.#refuse("invalid", prepared.prepared_id, "item");
    const entry: Entry = { item: checked.data, expiresAtMs, verification, canonical, detail: null };
    this.#entries.set(item.prepared_id, entry);
    // The relay may already be past `prepared` for an item it handed out a moment ago.
    this.#bus.publish({ type: "prepared", item: entry.item });
    this.#settle(entry, view);
    this.#persist();
    this.#ensureTicker();
    return { ok: true, item: entry.item, created: true };
  }

  // The structured result of a prepare tool (`structuredContent.prepared`), for the MCP front. Anything else in the
  // result is ignored. The plugin cleans summary lines before returning them, so an item that was changed in the
  // cleaning shows up as a verification mismatch rather than being trusted.
  ingestToolResult(structured: unknown, requestedBy: RequestedBy | string): IngestResult | undefined {
    if (typeof structured !== "object" || structured === null) return undefined;
    const prepared = (structured as { readonly prepared?: unknown }).prepared;
    return prepared === undefined ? undefined : this.ingest(prepared, requestedBy);
  }

  // ---- commands ----

  // The page showed the card. Compares what it says with the daemon's own view, audits both, and moves
  // prepared -> shown. Nothing the page sent is stored on the item or echoed.
  recordShown(id: string, report: CardReport, actor: Actor = {}): ChangeResult {
    this.reconcile();
    const entry = this.#entries.get(id);
    if (entry === undefined) return { ok: false, reason: "not_found" };
    const own = entry.item.prepared.summary;
    const ownInner = own.inner_hash_tag ?? null;
    const verdict = VERDICT_WORD[entry.verification.status];
    this.#host.emitAudit({
      ev: "ui.card.shown",
      outcome: "ok",
      preparedId: id,
      digestTag: report.digest_tag,
      ...(report.inner_hash_tag === null ? {} : { innerTag: report.inner_hash_tag }),
      verdict,
      ...(actor.tokenId === undefined ? {} : { tokenId: actor.tokenId }),
      note: `page_verification=${report.verification} failed_checks=${String(report.failed_checks.length)}`,
    });
    if (report.digest_tag !== own.digest_tag) this.#mismatch(id, "digest_tag");
    if (report.inner_hash_tag !== ownInner) this.#mismatch(id, "inner_hash_tag");
    const daemonVerified = entry.verification.status === "verified";
    if ((report.verification === "verified" && !daemonVerified) || (report.verification === "failed" && daemonVerified)) this.#mismatch(id, "verification");
    if (entry.item.state !== "prepared") return { ok: true, item: entry.item, changed: false };
    this.#command(entry, "shown", null);
    return { ok: true, item: entry.item, changed: true };
  }

  reject(id: string, actor: Actor = {}): ChangeResult {
    this.reconcile();
    const entry = this.#entries.get(id);
    if (entry === undefined) return { ok: false, reason: "not_found" };
    // Only an item nobody has sent yet can be rejected here; after that the relay alone says how it ended.
    const ok = OPEN_STATES.has(entry.item.state) && canTransition(entry.item.state, "rejected");
    this.#host.emitAudit({
      ev: "ui.card.decision",
      decision: "reject",
      outcome: ok ? "ok" : "refused",
      preparedId: id,
      ...(ok ? {} : { code: "precondition_failed" }),
      ...(actor.tokenId === undefined ? {} : { tokenId: actor.tokenId }),
    });
    if (!ok) return { ok: false, reason: "bad_state", state: entry.item.state };
    this.#command(entry, "rejected", "rejected_by_user");
    return { ok: true, item: entry.item, changed: true };
  }

  // For the signer (S2): shown -> signed, only for an item whose own check came out "verified".
  markSigned(id: string): ChangeResult {
    this.reconcile();
    const entry = this.#entries.get(id);
    if (entry === undefined) return { ok: false, reason: "not_found" };
    if (entry.verification.status !== "verified" || !canTransition(entry.item.state, "signed")) return { ok: false, reason: "bad_state", state: entry.item.state };
    this.#command(entry, "signed", null);
    return { ok: true, item: entry.item, changed: true };
  }

  // ---- state ----

  // Brings every item in line with the relay's record and the clock. Cheap (a map read per open item); every read
  // and the ticker call it. Returns how many items changed.
  reconcile(): number {
    if (this.#closed) return 0;
    const nowMs = this.#host.clock();
    let changed = 0;
    for (const [id, entry] of [...this.#entries]) {
      const view = this.#source?.lookup(id);
      if (this.#settle(entry, view)) changed += 1;
      const state = entry.item.state;
      if (FINAL_STATES.has(state) && nowMs - Date.parse(entry.item.updated_at) > TERMINAL_RETENTION_MS) this.#entries.delete(id);
    }
    return changed;
  }

  #settle(entry: Entry, view: RelayRecordView | undefined): boolean {
    const nowMs = this.#host.clock();
    const current = entry.item.state;
    let target: InboxState = current;
    let detail = entry.detail;
    if (view !== undefined) {
      switch (view.state) {
        case "sending":
          target = "submitted";
          break;
        case "accepted":
          target = "accepted";
          detail = view.detail;
          break;
        case "rejected":
          target = "rejected";
          detail = view.detail;
          break;
        case "ambiguous":
          target = "ambiguous";
          detail = view.detail;
          break;
        case "expired":
          target = "expired";
          detail = view.detail ?? "ttl_passed";
          break;
        case "prepared":
          break;
      }
    }
    if (target === current && OPEN_STATES.has(current) && nowMs >= entry.expiresAtMs) {
      target = "expired";
      detail = "ttl_passed";
    }
    if (target === current) return false;
    // Nothing moves out of "accepted"; the relay never un-accepts.
    if (current === "accepted") return false;
    // Observed moves follow the relay, but a user rejection that the relay then overtakes is worth a record.
    if (current === "rejected" && (target === "submitted" || target === "accepted" || target === "ambiguous")) this.#mismatch(entry.item.prepared_id, "state");
    // A terminal local rejection or expiry only yields to a state that means money may have moved.
    if ((current === "rejected" || current === "expired") && !(target === "submitted" || target === "accepted" || target === "ambiguous")) return false;
    this.#apply(entry, target, detail);
    return true;
  }

  #command(entry: Entry, to: InboxState, detail: string | null): void {
    this.#apply(entry, to, detail);
  }

  #apply(entry: Entry, to: InboxState, detail: string | null): void {
    const safeDetail = detail !== null && DETAIL.test(detail) ? detail : null;
    entry.detail = safeDetail;
    const hash = "user_op_hash" in entry.item.prepared && (to === "submitted" || to === "accepted" || to === "ambiguous") ? entry.item.prepared.user_op_hash : undefined;
    const result = hash === undefined && safeDetail === null ? null : { ...(hash === undefined ? {} : { user_op_hash: hash }), ...(safeDetail === null ? {} : { detail: safeDetail }) };
    entry.item = { ...entry.item, state: to, updated_at: isoSecond(this.#host.clock()), result };
    this.#bus.publish({ type: "prepared_state", prepared_id: entry.item.prepared_id, state: to, result });
    this.#persist();
  }

  #evictOne(): boolean {
    let victim: [string, Entry] | undefined;
    for (const pair of this.#entries) {
      if (!FINAL_STATES.has(pair[1].item.state)) continue;
      if (victim === undefined || pair[1].item.updated_at < victim[1].item.updated_at) victim = pair;
    }
    if (victim === undefined) return false;
    this.#entries.delete(victim[0]);
    return true;
  }

  #refuse(reason: IngestRefusal, pid: string | undefined, field: string): IngestResult {
    this.#host.emitAudit({
      ev: "schema.violation",
      outcome: "refused",
      code: `inbox_${reason}`,
      field: field.slice(0, 80),
      ...(pid === undefined ? {} : { preparedId: pid }),
    });
    return { ok: false, reason, field };
  }

  #mismatch(pid: string, field: string): void {
    this.#host.emitAudit({ ev: "feed.mismatch", outcome: "refused", preparedId: pid, field: field.slice(0, 80) });
  }

  #ensureTicker(): void {
    if (this.#closed || this.#ticker !== undefined) return;
    this.#ticker = this.#timers.setInterval(() => {
      this.reconcile();
      const active = [...this.#entries.values()].some((entry) => !FINAL_STATES.has(entry.item.state));
      if (!active && this.#ticker !== undefined) {
        this.#timers.clearInterval(this.#ticker);
        this.#ticker = undefined;
      }
    }, this.#reconcileMs);
  }

  close(): void {
    this.#closed = true;
    if (this.#ticker !== undefined) this.#timers.clearInterval(this.#ticker);
    this.#ticker = undefined;
  }
}

function idOf(input: unknown): string | undefined {
  const id = typeof input === "object" && input !== null ? (input as { readonly prepared_id?: unknown }).prepared_id : undefined;
  return typeof id === "string" && HEX32.test(id) ? id : undefined;
}

function fieldOf(path: readonly (string | number | symbol)[]): string {
  const text = path.map(String).join(".");
  return /^[A-Za-z][A-Za-z0-9_.[\]]{0,79}$/.test(text) ? text : "item";
}

// The owner must be a usable wallet and the account the one derived from it (for a CLOB venue item, the owner itself:
// its maker is the wallet; or for a Polymarket order, the owner's Deposit Wallet, re-derived from the owner here, the
// rebuild then requiring signature type 3). The field that is wrong, or undefined.
function identityDisagreement(item: InboxItem["prepared"]): string | undefined {
  let expected: string;
  try {
    const owner = parseOwner(item.owner);
    expected = item.kind === "clob_order" ? (clobAccountOf(owner, item.account) ?? owner) : item.kind === "clob_auth" ? owner : deriveAccount(owner);
  } catch {
    return "owner";
  }
  return item.account.toLowerCase() === expected.toLowerCase() ? undefined : "account";
}

// The first way the item and the relay's record disagree, or undefined when they agree.
function recordDisagreement(item: InboxItem["prepared"], view: RelayRecordView): string | undefined {
  if (view.id !== item.prepared_id) return "prepared_id";
  if (view.digest.toLowerCase() !== item.sign.expected_digest.toLowerCase()) return "sign.expected_digest";
  if (view.owner.toLowerCase() !== item.owner.toLowerCase()) return "owner";
  if (view.account.toLowerCase() !== item.account.toLowerCase()) return "account";
  if (view.kind !== item.kind) return "kind";
  return undefined;
}

// ---- registry, wiring, module ---------------------------------------------------------------------------------------------------

const inboxes = new WeakMap<DaemonHost, Inbox>();

// The host's one inbox, created on first use.
export function inboxOf(host: DaemonHost, options?: InboxOptions): Inbox {
  let inbox = inboxes.get(host);
  if (inbox === undefined) {
    inbox = new Inbox(host, options);
    inboxes.set(host, inbox);
  } else if (options !== undefined) {
    inbox.configure(options);
  }
  return inbox;
}

export function attachPreparedSource(host: DaemonHost, source: PreparedSource | undefined): void {
  inboxOf(host).attachSource(source);
}

// Connects the inbox to the in-process relay's prepared records and the audit adapter to its audit log. A relay that
// is not ready (a read-only instance) gives the inbox no records and the audit adapter no sink, so nothing is written.
export function attachRelayRuntime(host: DaemonHost, runtime: Pick<LocalRuntime, "status">): void {
  attachPreparedSource(host, runtimePreparedSource(runtime));
  attachAuditSink(host, () => {
    try {
      const status = runtime.status();
      return status.state === "ready" ? status.relay.services.audit : undefined;
    } catch {
      return undefined;
    }
  });
}

export function createInboxModule(options: InboxOptions = {}): BridgeModuleFactory {
  return (host: DaemonHost): BridgeModule => {
    const inbox = inboxOf(host, options);
    const bus = eventBusOf(host);
    auditAdapterOf(host);
    return {
      name: "inbox",
      routes: [
        defineRoute({
          method: "GET",
          path: "/ui/inbox",
          access: { scope: "read" },
          handler: () => {
            const items = inbox.list();
            return json({ items, event_id: bus.head() });
          },
        }),
        defineRoute({
          method: "GET",
          path: "/ui/inbox/:prepared_id",
          access: { scope: "read" },
          handler: (ctx) => {
            const id = preparedIdSchema.safeParse(ctx.params["prepared_id"]);
            if (!id.success) return fail("invalid_request", "A prepared id is 32 lower-case hex digits.");
            const item = inbox.get(id.data);
            return item === undefined ? fail("not_found", "No such prepared item (it may have expired, been forgotten, or never reached this daemon).") : json(item);
          },
        }),
        defineRoute({
          method: "POST",
          path: "/ui/inbox/decision",
          access: { scope: "prepare" },
          // Page tokens only: the human decides on the card; an agent has no say in it.
          kinds: ["ui"],
          body: inboxDecisionRequestSchema,
          handler: (ctx) => {
            const actor: Actor = ctx.principal === null ? {} : { tokenId: ctx.principal.id };
            const decision = ctx.body;
            const outcome =
              decision.decision === "shown"
                ? inbox.recordShown(
                    decision.prepared_id,
                    { digest_tag: decision.digest_tag, inner_hash_tag: decision.inner_hash_tag, verification: decision.verification, failed_checks: decision.failed_checks },
                    actor,
                  )
                : inbox.reject(decision.prepared_id, actor);
            if (outcome.ok) return json(outcome.item);
            if (outcome.reason === "not_found") return fail("not_found", "No such prepared item (it may have expired, been forgotten, or never reached this daemon).");
            return fail("precondition_failed", "This item can no longer be rejected here.", { details: { state: outcome.state ?? "unknown" } });
          },
        }),
      ],
      close: () => inbox.close(),
    };
  };
}

export const bridgeModule: BridgeModuleFactory = createInboxModule();
