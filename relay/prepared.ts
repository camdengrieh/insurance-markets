import { AUTH_PREPARED_TTL_S, PREPARED_TTL_S, digestTag, preparedItemSchema, type DigestForm, type GetResponseInput, type Hex, type PreparedKind, type RouteKey } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import { buildDecodedAuth, rebuildDecoded } from "../src/xo/signing/rebuild.js";
import type { RelayAudit } from "./audit.js";
import { randomHex } from "./crypto.js";
import { NAMESPACES, type DurableStore, type Json } from "./store.js";
import type { RelayServices, RouteTable } from "./types.js";

// Prepared items and the send protocol (docs/phase1-gap-closing.md section 5.4 invariants 2 to 4 and
// section 9 A2).
//
// A prepared item is what the relay shows the owner to sign: the digest, the decoded terms, the
// reservations it holds. It is stored durably under a 128-bit random id and obeys one state machine:
//
//     prepared --beginSend--> sending --resolve--> accepted | rejected | ambiguous
//         |                                              ^
//         +--> expired (TTL passed, never sent)          +-- reconcile: ambiguous -> accepted | rejected
//
// Rules, each with a test:
//   - single use: beginSend succeeds once per id, even across a restart; every later call says
//     `prepared_used`;
//   - the `sending` marker is written and fsynced BEFORE the caller makes any upstream request, so a
//     crash at any point after it leaves a record that says "a send may have happened";
//   - after a restart, an item found in `sending` becomes `ambiguous` and is NEVER sent again
//     (recoverInterrupted); only reconcile, by order hash or nonce, can settle it;
//   - the TTL is 5 minutes (90 s for an auth item) and a caller can only shorten it;
//   - signatures are never stored: submit takes them in memory, the record keeps only the digest;
//   - the answer the prepare route gave (the strict Prepared object, after the contract check) is kept with the
//     record, so GET /v1/prepared/{id} (amendment R9) can return exactly that item. It is what the caller already
//     received: no signature, no credential, nothing the caller did not see.

export type PreparedState = "prepared" | "sending" | "accepted" | "rejected" | "ambiguous" | "expired";

export interface PreparedRecord {
  readonly id: string;
  readonly kind: PreparedKind;
  readonly owner: string;
  readonly account: string;
  // The digest the signature must verify against, and which form of digest it is.
  readonly digest: Hex;
  readonly digestForm: DigestForm;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly state: PreparedState;
  readonly sendStartedAtMs: number | null;
  readonly resolvedAtMs: number | null;
  // A short machine code, never upstream text.
  readonly detail: string | null;
  readonly failedAttempts: number;
  readonly reservationIds: readonly string[];
  // Everything the owning module needs to rebuild and re-check the item at submit. Opaque here.
  readonly payload: Json;
  // The prepare route's answer as it was sent (keepAnswer), or null: not recorded yet, or an item from a relay
  // version that did not keep it.
  readonly answer: Json | null;
}

type StoredPrepared = {
  id: string;
  kind: PreparedKind;
  owner: string;
  account: string;
  digest: string;
  digestForm: DigestForm;
  createdAtMs: number;
  expiresAtMs: number;
  state: PreparedState;
  sendStartedAtMs: number | null;
  resolvedAtMs: number | null;
  detail: string | null;
  failedAttempts: number;
  reservationIds: string[];
  payload: Json;
  // Absent in records written before the answer was kept.
  answer?: Json | null;
};

export interface CreatePreparedInput {
  readonly kind: PreparedKind;
  readonly owner: string;
  readonly account: string;
  readonly digest: Hex;
  readonly digestForm: DigestForm;
  readonly payload: Json;
  readonly reservationIds?: readonly string[];
  // Can only shorten the default for the kind.
  readonly ttlS?: number;
}

export interface PreparedStoreOptions {
  readonly store: DurableStore;
  readonly now?: () => number;
  readonly audit?: RelayAudit;
}

const ID = /^[0-9a-f]{32}$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DETAIL = /^[a-z][a-z0-9_]{0,47}$/;
const MAX_PAYLOAD_BYTES = 64 * 1024;
// A Prepared answer is bounded by its schema (24 summary lines, 24 warnings, the typed data, the decoded block);
// this is a guard against a bug, not a size anything legitimate reaches.
const MAX_ANSWER_BYTES = 256 * 1024;
const MAX_FAILED_ATTEMPTS = 5;
const TERMINAL_RETENTION_MS = 7 * 86_400_000;

export function defaultTtlS(kind: PreparedKind): number {
  return kind === "auth" ? AUTH_PREPARED_TTL_S : PREPARED_TTL_S;
}

function toRecord(stored: StoredPrepared): PreparedRecord {
  return { ...stored, digest: stored.digest as Hex, reservationIds: [...stored.reservationIds], answer: stored.answer ?? null };
}

function isObject(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class PreparedStore {
  readonly #store: DurableStore;
  readonly #now: () => number;
  readonly #audit: RelayAudit | undefined;

  constructor(options: PreparedStoreOptions) {
    this.#store = options.store;
    this.#now = options.now ?? Date.now;
    this.#audit = options.audit;
  }

  get(id: string): PreparedRecord | undefined {
    if (!ID.test(id)) return undefined;
    const stored = this.#store.get<StoredPrepared>(NAMESPACES.prepared, id);
    return stored === undefined ? undefined : toRecord(stored);
  }

  require(id: string): PreparedRecord {
    const record = this.get(id);
    if (record === undefined) throw new RelayError("not_found", "No such prepared item (it may have expired or never existed).");
    return record;
  }

  list(filter: { readonly state?: PreparedState; readonly account?: string } = {}): PreparedRecord[] {
    return this.#store
      .list<StoredPrepared>(NAMESPACES.prepared)
      .map(([, stored]) => stored)
      .filter((stored) => (filter.state === undefined || stored.state === filter.state) && (filter.account === undefined || stored.account.toLowerCase() === filter.account.toLowerCase()))
      .map(toRecord)
      .sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
  }

  async create(input: CreatePreparedInput): Promise<PreparedRecord> {
    if (!ADDRESS.test(input.owner) || !ADDRESS.test(input.account)) throw new RelayError("internal", "A prepared item needs an owner and an account address.");
    if (!HEX32.test(input.digest)) throw new RelayError("internal", "A prepared item needs a 32-byte digest.");
    if (JSON.stringify(input.payload ?? null).length > MAX_PAYLOAD_BYTES) throw new RelayError("internal", "The prepared payload is too large.");
    const ceiling = defaultTtlS(input.kind);
    const ttlS = input.ttlS === undefined ? ceiling : Math.max(1, Math.min(Math.floor(input.ttlS), ceiling));
    const nowMs = this.#now();
    const record = await this.#store.transact((reader) => {
      let id = randomHex(16);
      // 128 random bits do not collide; the loop makes that a fact instead of a hope.
      while (reader.get(NAMESPACES.prepared, id) !== undefined) id = randomHex(16);
      const stored: StoredPrepared = {
        id,
        kind: input.kind,
        owner: input.owner,
        account: input.account,
        digest: input.digest.toLowerCase(),
        digestForm: input.digestForm,
        createdAtMs: nowMs,
        expiresAtMs: nowMs + ttlS * 1000,
        state: "prepared",
        sendStartedAtMs: null,
        resolvedAtMs: null,
        detail: null,
        failedAttempts: 0,
        reservationIds: [...(input.reservationIds ?? [])],
        payload: input.payload ?? null,
        answer: null,
      };
      return { ops: [{ ns: NAMESPACES.prepared, key: id, value: stored }], result: stored };
    });
    await this.#audit?.write({ ev: "prepared", outcome: "ok", state: "prepared", owner: input.owner, account: input.account, preparedId: record.id, digestTag: record.digest.slice(2, 18) });
    return toRecord(record);
  }

  // Keeps the answer the prepare route sent for this item. The answer must be a strict Prepared item of the contract
  // (so it has no field a signature or a credential could ride in), must be about this very item (its id, kind, owner
  // and digest), is kept once (a second call changes nothing) and only while the item is still unsent. Returns
  // whether it is now kept; never throws for a mismatch, so a prepare answer is never lost over it.
  async keepAnswer(answer: unknown): Promise<{ readonly kept: boolean; readonly reason?: string }> {
    if (!isObject(answer) || !preparedItemSchema.safeParse(answer).success) return { kept: false, reason: "shape" };
    const id = answer["prepared_id"];
    const sign = answer["sign"];
    const owner = answer["owner"];
    if (typeof id !== "string" || !ID.test(id) || !isObject(sign) || typeof sign["expected_digest"] !== "string" || typeof owner !== "string") return { kept: false, reason: "shape" };
    let text: string;
    try {
      text = JSON.stringify(answer);
    } catch {
      return { kept: false, reason: "shape" };
    }
    if (text.length > MAX_ANSWER_BYTES) return { kept: false, reason: "too_large" };
    const digest = sign["expected_digest"].toLowerCase();
    const json = JSON.parse(text) as Json;
    return this.#store.transact<{ readonly kept: boolean; readonly reason?: string }>((reader) => {
      const current = reader.get<StoredPrepared>(NAMESPACES.prepared, id);
      if (current === undefined) return { ops: [], result: { kept: false, reason: "no_record" } };
      if (current.kind !== answer["kind"] || current.owner.toLowerCase() !== owner.toLowerCase() || current.digest !== digest) return { ops: [], result: { kept: false, reason: "mismatch" } };
      if (current.answer !== undefined && current.answer !== null) return { ops: [], result: { kept: true } };
      if (current.state !== "prepared") return { ops: [], result: { kept: false, reason: "not_prepared" } };
      return { ops: [{ ns: NAMESPACES.prepared, key: id, value: { ...current, answer: json } }], result: { kept: true } };
    });
  }

  // Claims the item for sending. The marker is on disk (fsynced) when this resolves, so the caller
  // may now make exactly one upstream request for this id.
  async beginSend(id: string): Promise<PreparedRecord> {
    if (!ID.test(id)) throw new RelayError("not_found", "No such prepared item (it may have expired or never existed).");
    const nowMs = this.#now();
    type Outcome = { readonly ok: true; readonly record: StoredPrepared } | { readonly ok: false; readonly error: RelayError };
    const outcome = await this.#store.transact<Outcome>((reader) => {
      const stored = reader.get<StoredPrepared>(NAMESPACES.prepared, id);
      if (stored === undefined) return { ops: [], result: { ok: false, error: new RelayError("not_found", "No such prepared item (it may have expired or never existed).") } };
      if (stored.state === "expired") return { ops: [], result: { ok: false, error: new RelayError("expired", "This prepared item expired. Prepare it again.") } };
      if (stored.state !== "prepared") {
        return { ops: [], result: { ok: false, error: new RelayError("prepared_used", "This prepared item was already used.", { state: stored.state }) } };
      }
      if (nowMs >= stored.expiresAtMs) {
        const expired: StoredPrepared = { ...stored, state: "expired", resolvedAtMs: nowMs, detail: "ttl_passed" };
        return { ops: [{ ns: NAMESPACES.prepared, key: id, value: expired }], result: { ok: false, error: new RelayError("expired", "This prepared item expired. Prepare it again.") } };
      }
      const sending: StoredPrepared = { ...stored, state: "sending", sendStartedAtMs: nowMs };
      return { ops: [{ ns: NAMESPACES.prepared, key: id, value: sending }], result: { ok: true, record: sending } };
    });
    if (!outcome.ok) throw outcome.error;
    await this.#audit?.write({ ev: "send_begin", outcome: "pending", state: "sending", owner: outcome.record.owner, account: outcome.record.account, preparedId: id, digestTag: outcome.record.digest.slice(2, 18), sync: true });
    return toRecord(outcome.record);
  }

  // sending -> accepted | rejected | ambiguous.
  async resolve(id: string, outcome: "accepted" | "rejected" | "ambiguous", detail?: string): Promise<PreparedRecord> {
    return this.#transition(id, ["sending"], outcome, detail);
  }

  // ambiguous -> accepted | rejected, once the outcome was established by looking (order hash, nonce).
  async reconcile(id: string, outcome: "accepted" | "rejected", detail?: string): Promise<PreparedRecord> {
    return this.#transition(id, ["ambiguous"], outcome, detail);
  }

  async #transition(id: string, from: readonly PreparedState[], to: PreparedState, detail: string | undefined): Promise<PreparedRecord> {
    if (detail !== undefined && !DETAIL.test(detail)) throw new RelayError("internal", "A prepared item's detail is a short machine code.");
    const nowMs = this.#now();
    const stored = await this.#store.transact<StoredPrepared>((reader) => {
      const current = reader.get<StoredPrepared>(NAMESPACES.prepared, id);
      if (current === undefined) throw new RelayError("not_found", "No such prepared item.");
      if (!from.includes(current.state)) {
        throw new RelayError("precondition_failed", `A prepared item in state ${current.state} cannot move to ${to}.`, { state: current.state });
      }
      const next: StoredPrepared = { ...current, state: to, resolvedAtMs: nowMs, detail: detail ?? current.detail };
      return { ops: [{ ns: NAMESPACES.prepared, key: id, value: next }], result: next };
    });
    await this.#audit?.write({ ev: "send_result", outcome: to === "accepted" ? "ok" : to === "ambiguous" ? "ambiguous" : "refused", state: to, preparedId: id, owner: stored.owner, account: stored.account, sync: true, ...(detail === undefined ? {} : { code: detail }) });
    return toRecord(stored);
  }

  // A signature that failed verification. Five of them spend the item. Does nothing once the item has
  // left the `prepared` state.
  async noteFailedAttempt(id: string): Promise<{ readonly locked: boolean }> {
    const nowMs = this.#now();
    return this.#store.transact((reader) => {
      const current = reader.get<StoredPrepared>(NAMESPACES.prepared, id);
      if (current === undefined || current.state !== "prepared") return { ops: [], result: { locked: current !== undefined && current.detail === "too_many_bad_signatures" } };
      const attempts = current.failedAttempts + 1;
      const locked = attempts >= MAX_FAILED_ATTEMPTS;
      const next: StoredPrepared = locked
        ? { ...current, failedAttempts: attempts, state: "rejected", resolvedAtMs: nowMs, detail: "too_many_bad_signatures" }
        : { ...current, failedAttempts: attempts };
      return { ops: [{ ns: NAMESPACES.prepared, key: id, value: next }], result: { locked } };
    });
  }

  // Run once at start-up. Anything still `sending` was interrupted: a request may or may not have
  // gone out. It becomes `ambiguous` and stays that way until reconciled. Returns what it changed so
  // the caller can hold the matching reservations.
  async recoverInterrupted(): Promise<PreparedRecord[]> {
    const nowMs = this.#now();
    const changed = await this.#store.transact((reader) => {
      const ops = [];
      const out: StoredPrepared[] = [];
      for (const [id, stored] of reader.list<StoredPrepared>(NAMESPACES.prepared)) {
        if (stored.state !== "sending") continue;
        const next: StoredPrepared = { ...stored, state: "ambiguous", resolvedAtMs: nowMs, detail: "interrupted_by_restart" };
        ops.push({ ns: NAMESPACES.prepared, key: id, value: next });
        out.push(next);
      }
      return { ops, result: out };
    });
    for (const stored of changed) {
      await this.#audit?.write({ ev: "send_result", outcome: "ambiguous", state: "ambiguous", code: "interrupted_by_restart", preparedId: stored.id, owner: stored.owner, account: stored.account, sync: true });
    }
    return changed.map(toRecord);
  }

  // Marks unsent items whose TTL passed as expired and forgets finished items after a week.
  // Ambiguous and sending items are never forgotten.
  async sweep(): Promise<{ readonly expired: number; readonly pruned: number }> {
    const nowMs = this.#now();
    return this.#store.transact((reader) => {
      const ops = [];
      let expired = 0;
      let pruned = 0;
      for (const [id, stored] of reader.list<StoredPrepared>(NAMESPACES.prepared)) {
        if (stored.state === "prepared" && nowMs >= stored.expiresAtMs) {
          ops.push({ ns: NAMESPACES.prepared, key: id, value: { ...stored, state: "expired" as const, resolvedAtMs: nowMs, detail: "ttl_passed" } });
          expired += 1;
        } else if ((stored.state === "accepted" || stored.state === "rejected" || stored.state === "expired") && stored.resolvedAtMs !== null && nowMs - stored.resolvedAtMs > TERMINAL_RETENTION_MS) {
          ops.push({ ns: NAMESPACES.prepared, key: id, value: null });
          pruned += 1;
        }
      }
      return { ops, result: { expired, pruned } };
    });
  }
}

// ---- the decoded block for items built by a module that predates it (R1) ------------------------------------------------------
//
// userop and order items carry their decoded block from the module that builds them. The XO login (kind auth,
// relay/credentials.ts) was written before the block existed, so the server pipelines run this on the handler's
// answer, before it is checked against the contract: it rebuilds the login's block from the STORED record (the
// timestamp and the L1 variant it was prepared with), requires it to rebuild to the digest the item carries, and
// only then adds `decoded` and the inner hash tag. An item it cannot vouch for is passed on as it was (the
// Signature Card then says "digest not independently derivable"), and the miss is audited. Pure apart from
// the audit line; it never changes a field the handler already set.
export async function withDecodedBlock(route: RouteKey, output: unknown, services: { readonly prepared?: PreparedStore; readonly audit?: RelayAudit }): Promise<unknown> {
  if (route !== "POST /v1/auth/prepare" || typeof output !== "object" || output === null) return output;
  const item = output as Record<string, unknown>;
  if (item["decoded"] !== undefined) return output;
  const miss = async (note: string): Promise<unknown> => {
    await services.audit?.write({ ev: "error", route, code: "decoded_unavailable", outcome: "error", note });
    return output;
  };
  const id = item["prepared_id"];
  const sign = item["sign"] as { readonly expected_digest?: unknown } | undefined;
  const summary = item["summary"] as Record<string, unknown> | undefined;
  if (typeof id !== "string" || services.prepared === undefined || summary === undefined || typeof sign?.expected_digest !== "string") return miss("shape");
  const record = services.prepared.get(id);
  if (record === undefined || record.kind !== "auth") return miss("no_record");
  const payload = record.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return miss("payload");
  const stored = payload as { readonly [key: string]: Json };
  const timestamp = stored["timestamp"];
  const variant = stored["variant"];
  if (typeof timestamp !== "string" || typeof variant !== "string") return miss("payload");
  const wrapped = variant.split(":")[0] === "kernel-on";
  const decoded = buildDecodedAuth({ owner: record.owner as `0x${string}`, account: record.account as `0x${string}`, timestamp, wrapped, ttlS: AUTH_PREPARED_TTL_S });
  const rebuilt = rebuildDecoded(decoded);
  if (!rebuilt.ok || rebuilt.digest.toLowerCase() !== sign.expected_digest.toLowerCase()) return miss("rebuild");
  return { ...item, summary: { ...summary, inner_hash_tag: digestTag(rebuilt.inner_hash), inner_hash_kind: "typed_data_hash" }, decoded };
}

// ---- keeping the prepare answer, and GET /v1/prepared/{id} (amendment R9) ------------------------------------------------------
//
// The routes whose answer is a prepared item. The pipelines (relay/server.ts, relay/embedded.ts) hand their checked answer
// to keepPreparedAnswer before replying, so the item can be read back by id exactly as it was sent: what the caller saw
// is what a later reader gets, byte for byte, including the decoded block added above.
export const PREPARE_ROUTE_KEYS: ReadonlySet<RouteKey> = new Set<RouteKey>([
  "POST /v1/userop/prepare",
  "POST /v1/auth/prepare",
  "POST /v1/order/prepare",
  "POST /v1/clob/order/prepare",
  "POST /v1/clob/auth/prepare",
]);

// Called with the answer AFTER it passed the contract check. A miss is audited and the answer still goes out: the
// item is valid and its caller has it; only the read-back by id will say that it was not kept.
export async function keepPreparedAnswer(route: RouteKey, answer: unknown, services: { readonly prepared?: PreparedStore; readonly audit?: RelayAudit }): Promise<void> {
  if (!PREPARE_ROUTE_KEYS.has(route)) return;
  let kept: { readonly kept: boolean; readonly reason?: string };
  try {
    kept = services.prepared === undefined ? { kept: false, reason: "no_store" } : await services.prepared.keepAnswer(answer);
  } catch {
    kept = { kept: false, reason: "store_failed" };
  }
  if (!kept.kept) await services.audit?.write({ ev: "error", route, code: "answer_not_kept", outcome: "error", note: kept.reason ?? "unknown" }).catch(() => undefined);
}

// One answer for an id that does not exist and for an item of an owner this relay does not serve, so a caller can
// tell neither apart: the pipeline's owner check (relay/owners.ts) throws this very error.
export function preparedNotFound(): RelayError {
  return new RelayError("not_found", "No such prepared item (it may have expired or never existed).");
}

// Whose item an id names, for the pipeline's owner check; undefined when there is no such item.
export function preparedOwnerOf(store: PreparedStore | undefined, id: unknown): string | undefined {
  return typeof id === "string" ? store?.get(id)?.owner : undefined;
}

const USED_MESSAGE: Readonly<Record<Exclude<PreparedState, "prepared" | "expired">, string>> = Object.freeze({
  sending: "A send for this prepared item is under way. It is single use and is not handed out again; check the status of what it holds.",
  accepted: "This prepared item was already submitted and accepted. It is single use and is not handed out again.",
  rejected: "This prepared item was already used: it was submitted and refused, or locked after too many bad signatures. Prepare it again.",
  ambiguous: "A send for this prepared item was started and its outcome is unknown. It is not handed out again and must not be sent again; check the status of the order or operation it holds.",
});

// The item as the prepare route answered it, while it can still be signed and submitted. Otherwise the state, never the
// item: an agent must not be handed something signable that the relay would refuse (or must never send twice).
const readPrepared: NonNullable<RouteTable["GET /v1/prepared/:id"]> = async (params, context) => {
  const store = (context.services as RelayServices).prepared;
  if (store === undefined) throw new RelayError("internal", "The prepared-item store is not wired into this relay.");
  const record = store.get(params.id);
  if (record === undefined) throw preparedNotFound();
  const { state } = record;
  if (state === "expired" || (state === "prepared" && context.now() >= record.expiresAtMs)) {
    throw new RelayError("expired", "This prepared item expired. Prepare it again.", { state: "expired" });
  }
  if (state !== "prepared") {
    throw new RelayError("prepared_used", USED_MESSAGE[state], { state, ...(record.detail === null ? {} : { reason: record.detail }) });
  }
  if (record.answer === null) {
    throw new RelayError("precondition_failed", "This item was prepared by a relay version that did not keep the prepared answer, so it cannot be returned by id. Prepare it again.", { reason: "answer_not_kept" });
  }
  // Checked against the contract by the pipeline before it is sent, like every answer.
  return record.answer as unknown as GetResponseInput<"/v1/prepared/:id">;
};

export const routes: RouteTable = {
  "GET /v1/prepared/:id": readPrepared,
};

declare module "./types.js" {
  interface RelayServices {
    readonly prepared?: PreparedStore;
  }
}
