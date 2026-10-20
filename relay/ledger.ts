import { randomBytes } from "node:crypto";

import { utcDayKey, type DailyLedger, type DailyUsage, type ReserveRequest, type ReserveResult } from "../src/guardrails/limits.js";
import { RelayError } from "../src/relay/errors.js";
import type { RelayAudit } from "./audit.js";
import type { CapabilityRegistry } from "./capabilities.js";
import type { RelayConfig } from "./config.js";
import { NAMESPACES, type DurableStore, type KeyedMutex, type StoreOp, type StoreReader } from "./store.js";

// The relay's DailyLedger (the interface lives in src/guardrails/limits.ts; the plugin cannot keep a
// counter, so the relay does). docs/phase1-gap-closing.md sections 5.4 invariant 3, 8 D2 and D3, and
// 9 A2 and A3.
//
// What it keeps, durably (a restart never resets a cap):
//   - per account and UTC day: what was spent (orders, the creation fee and seeds, reserved or
//     committed), what was funded (Base to XO), and how much of the spend was seed;
//   - per account, for all time: what was funded, for the total cap that holds until the exit test
//     passes (D3);
//   - every reservation, by id (a prepared_id or funding_id), with its state.
//
// Rules, each with a test:
//   - a reservation is checked and added in one step, under a per-account lock and the store's own
//     serial commit, so parallel calls cannot race past a cap;
//   - reserving the same id twice returns the same reservation and adds nothing the second time;
//   - the caps come from the relay's own configuration (never from the caller): $10 per order, $50
//     per day, a seed cap of $10.80, a funding total, a funding day cap. A caller can pass a lower
//     limit, never a higher one;
//   - RELEASE needs evidence (A2): the item's expiry has passed AND something confirmed the item is
//     gone (an open-orders listing, a fill-log query, a bundler receipt). Without evidence nothing is
//     given back. An ambiguous item stays reserved until evidence arrives;
//   - the day is the ledger's own UTC day (from the injected clock). A request that names another
//     day is refused as stale, so a caller cannot spend today's money against yesterday's counter.

export type ReservationCategory = "order" | "seed" | "creation_fee" | "funding" | "other";
export type ReservationState = "reserved" | "committed" | "released";

export const ABSENCE_SOURCES = ["orders_list", "fill_logs", "orders_list_and_fill_logs", "bundler_receipt", "base_logs", "no_report"] as const;
export type AbsenceSource = (typeof ABSENCE_SOURCES)[number];

export interface ReleaseEvidence {
  readonly kind: "absent_after_expiry";
  readonly source: AbsenceSource;
  // When the absence was confirmed. Must be at or after the item's expiry.
  readonly checkedAtMs: number;
}

export interface LedgerLimits {
  readonly maxOrderAtomic: bigint;
  readonly maxDailyAtomic: bigint;
  readonly seedCapAtomic: bigint;
  readonly fundingDailyCapAtomic: bigint;
  // Total funded for all time while the exit is unproven; undefined means no total cap.
  readonly fundingLifetimeCapAtomic: bigint | undefined;
}

export type DenyReason =
  | "stale_day"
  | "invalid"
  | "order_cap"
  | "seed_cap"
  | "daily_cap"
  | "funding_daily_cap"
  | "funding_total_cap"
  | "released_id";

export interface LedgerUsage extends DailyUsage {
  readonly seedAtomic: bigint;
  // Funded for all time (reserved and committed).
  readonly fundedLifetimeAtomic: bigint;
}

export interface TypedReserveRequest extends ReserveRequest {
  readonly category: ReservationCategory;
  // When the item stops being valid (an order's expiration, a proposal's expiry). Release is
  // impossible before it.
  readonly expiresAtMs: number;
}

export type TypedReserveResult =
  | { readonly reserved: true; readonly reservationId: string; readonly replayed: boolean; readonly usage: LedgerUsage }
  | {
      readonly reserved: false;
      readonly reason: DenyReason;
      readonly usage: LedgerUsage;
      // The limit that applied and what was left under it, in atomic units.
      readonly limitAtomic: bigint;
      readonly remainingAtomic: bigint;
    };

export interface ReservationView {
  readonly id: string;
  readonly kind: "spend" | "fund";
  readonly category: ReservationCategory;
  readonly account: string;
  readonly day: string;
  readonly amountAtomic: bigint;
  readonly state: ReservationState;
  readonly hold: boolean;
  readonly holdReason: string | null;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly spentAtomic: bigint | null;
}

export type AbsenceVerdict =
  | { readonly verdict: "absent"; readonly source: AbsenceSource }
  | { readonly verdict: "present" }
  | { readonly verdict: "unknown" };

export interface SweepReport {
  readonly released: readonly string[];
  readonly present: readonly string[];
  readonly unknown: readonly string[];
}

// Stored shapes. Numbers and strings only, so they are valid JSON values as they stand.
type ReservationRecord = {
  id: string;
  kind: "spend" | "fund";
  category: ReservationCategory;
  account: string;
  day: string;
  amount: string;
  state: ReservationState;
  createdAtMs: number;
  expiresAtMs: number;
  hold: boolean;
  holdReason: string | null;
  resolvedAtMs: number | null;
  spent: string | null;
  evidenceSource: string | null;
};
type DayRecord = { spent: string; funded: string; seed: string };
type LifetimeRecord = { funded: string };

const ACCOUNT = /^0x[0-9a-f]{40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const RESERVATION_ID = /^[A-Za-z0-9_-]{8,64}$/;
const DAY_RETENTION_MS = 400 * 86_400_000;
const RESERVATION_RETENTION_MS = 90 * 86_400_000;
// A plain DailyLedger.reserve() has no expiry to pass in; it gets the longest order lifetime.
const DEFAULT_PLAIN_EXPIRY_MS = 3_600_000;
// How far a piece of evidence may be dated ahead of the ledger clock.
const EVIDENCE_SKEW_MS = 5_000;

const ZERO_DAY: DayRecord = { spent: "0", funded: "0", seed: "0" };

const big = (value: string | undefined): bigint => (value === undefined ? 0n : BigInt(value));
const dayKey = (account: string, day: string): string => `${account}|${day}`;

function view(record: ReservationRecord): ReservationView {
  return {
    id: record.id,
    kind: record.kind,
    category: record.category,
    account: record.account,
    day: record.day,
    amountAtomic: BigInt(record.amount),
    state: record.state,
    hold: record.hold,
    holdReason: record.holdReason,
    createdAtMs: record.createdAtMs,
    expiresAtMs: record.expiresAtMs,
    spentAtomic: record.spent === null ? null : BigInt(record.spent),
  };
}

function usageOf(reader: StoreReader, account: string, day: string): LedgerUsage {
  const record = reader.get<DayRecord>(NAMESPACES.ledgerDay, dayKey(account, day)) ?? ZERO_DAY;
  const lifetime = reader.get<LifetimeRecord>(NAMESPACES.ledgerLifetime, account);
  return {
    spentAtomic: big(record.spent),
    fundedAtomic: big(record.funded),
    seedAtomic: big(record.seed),
    fundedLifetimeAtomic: big(lifetime?.funded),
  };
}

export interface DurableLedgerOptions {
  readonly store: DurableStore;
  readonly locks: KeyedMutex;
  readonly now?: () => number;
  // Read on every reserve, so a recorded capability fact takes effect at once.
  readonly limits: () => LedgerLimits;
  readonly audit?: RelayAudit;
}

export class DurableLedger implements DailyLedger {
  readonly #store: DurableStore;
  readonly #locks: KeyedMutex;
  readonly #now: () => number;
  readonly #limits: () => LedgerLimits;
  readonly #audit: RelayAudit | undefined;

  constructor(options: DurableLedgerOptions) {
    this.#store = options.store;
    this.#locks = options.locks;
    this.#now = options.now ?? Date.now;
    this.#limits = options.limits;
    this.#audit = options.audit;
  }

  currentDay(): string {
    return utcDayKey(this.#now()) ?? "1970-01-01";
  }

  // ---- reads -------------------------------------------------------------------------------------------------------

  async usage(account: string, day: string): Promise<DailyUsage> {
    const detail = await this.usageDetail(account, day);
    return { spentAtomic: detail.spentAtomic, fundedAtomic: detail.fundedAtomic };
  }

  async usageDetail(account: string, day: string = this.currentDay()): Promise<LedgerUsage> {
    if (!ACCOUNT.test(account) || !DAY.test(day)) throw new RelayError("invalid_request", "The ledger needs a lower-case account and a UTC day.");
    return usageOf({ get: (ns, key) => this.#store.get(ns, key), keys: (ns) => this.#store.keys(ns), list: (ns) => this.#store.list(ns) }, account, day);
  }

  reservation(id: string): ReservationView | undefined {
    const record = this.#store.get<ReservationRecord>(NAMESPACES.ledgerReservation, id);
    return record === undefined ? undefined : view(record);
  }

  list(filter: { readonly account?: string; readonly state?: ReservationState; readonly expiredBeforeMs?: number } = {}): ReservationView[] {
    return this.#store
      .list<ReservationRecord>(NAMESPACES.ledgerReservation)
      .map(([, record]) => record)
      .filter((record) => (filter.account === undefined || record.account === filter.account) && (filter.state === undefined || record.state === filter.state) && (filter.expiredBeforeMs === undefined || record.expiresAtMs <= filter.expiredBeforeMs))
      .map(view)
      .sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
  }

  // ---- reserve -----------------------------------------------------------------------------------------------------

  // The DailyLedger interface: an order-like spend or a funding amount, with no expiry of its own.
  async reserve(request: ReserveRequest): Promise<ReserveResult> {
    const result = await this.reserveFor({
      ...request,
      category: request.kind === "fund" ? "funding" : "order",
      expiresAtMs: this.#now() + DEFAULT_PLAIN_EXPIRY_MS,
    });
    return result.reserved
      ? { reserved: true, reservationId: result.reservationId }
      : { reserved: false, usage: { spentAtomic: result.usage.spentAtomic, fundedAtomic: result.usage.fundedAtomic } };
  }

  async reserveFor(request: TypedReserveRequest): Promise<TypedReserveResult> {
    const { account } = request;
    if (!ACCOUNT.test(account)) throw new RelayError("invalid_request", "The ledger needs a lower-case account address.");
    if (request.kind !== "spend" && request.kind !== "fund") throw new RelayError("invalid_request", "A reservation is a spend or a fund.");
    const reservationId = request.reservationId ?? `res_${randomBytes(16).toString("hex")}`;
    if (!RESERVATION_ID.test(reservationId)) throw new RelayError("invalid_request", "That is not a valid reservation id.");
    const nowMs = this.#now();

    return this.#locks.run(`ledger:${account}`, () =>
      this.#store.transact<TypedReserveResult>((reader) => {
        const today = utcDayKey(nowMs) ?? "1970-01-01";
        const usage = usageOf(reader, account, today);
        const limits = this.#limits();
        const deny = (reason: DenyReason, limitAtomic: bigint, remainingAtomic: bigint): { readonly ops: StoreOp[]; readonly result: TypedReserveResult } => ({
          ops: [],
          result: { reserved: false, reason, usage, limitAtomic, remainingAtomic: remainingAtomic < 0n ? 0n : remainingAtomic },
        });

        const existing = reader.get<ReservationRecord>(NAMESPACES.ledgerReservation, reservationId);
        if (existing !== undefined) {
          if (existing.account !== account || existing.kind !== request.kind || existing.category !== request.category || existing.amount !== String(request.amountAtomic) || existing.day !== request.day) {
            throw new RelayError("internal", "A reservation id was reused with different terms.");
          }
          if (existing.state === "released") return deny("released_id", 0n, 0n);
          return { ops: [], result: { reserved: true, reservationId, replayed: true, usage: usageOf(reader, account, existing.day) } };
        }

        if (typeof request.amountAtomic !== "bigint" || request.amountAtomic <= 0n || typeof request.limitAtomic !== "bigint" || request.limitAtomic < 0n || !Number.isSafeInteger(request.expiresAtMs)) {
          return deny("invalid", 0n, 0n);
        }
        if (!DAY.test(request.day) || request.day !== today) return deny("stale_day", 0n, 0n);

        const amount = request.amountAtomic;
        // Per-item caps first: they do not depend on what was spent already.
        if (request.category === "seed" && amount > limits.seedCapAtomic) return deny("seed_cap", limits.seedCapAtomic, limits.seedCapAtomic);
        if ((request.category === "order" || request.category === "creation_fee" || request.category === "other") && amount > limits.maxOrderAtomic) {
          return deny("order_cap", limits.maxOrderAtomic, limits.maxOrderAtomic);
        }

        const ops: StoreOp[] = [];
        const day: DayRecord = { spent: usage.spentAtomic.toString(), funded: usage.fundedAtomic.toString(), seed: usage.seedAtomic.toString() };
        if (request.kind === "spend") {
          const limit = request.limitAtomic < limits.maxDailyAtomic ? request.limitAtomic : limits.maxDailyAtomic;
          if (usage.spentAtomic + amount > limit) return deny("daily_cap", limit, limit - usage.spentAtomic);
          day.spent = (usage.spentAtomic + amount).toString();
          if (request.category === "seed") day.seed = (usage.seedAtomic + amount).toString();
        } else {
          const limit = request.limitAtomic < limits.fundingDailyCapAtomic ? request.limitAtomic : limits.fundingDailyCapAtomic;
          if (usage.fundedAtomic + amount > limit) return deny("funding_daily_cap", limit, limit - usage.fundedAtomic);
          const total = limits.fundingLifetimeCapAtomic;
          if (total !== undefined && usage.fundedLifetimeAtomic + amount > total) {
            return deny("funding_total_cap", total, total - usage.fundedLifetimeAtomic);
          }
          day.funded = (usage.fundedAtomic + amount).toString();
          ops.push({ ns: NAMESPACES.ledgerLifetime, key: account, value: { funded: (usage.fundedLifetimeAtomic + amount).toString() } });
        }
        const record: ReservationRecord = {
          id: reservationId,
          kind: request.kind,
          category: request.category,
          account,
          day: today,
          amount: amount.toString(),
          state: "reserved",
          createdAtMs: nowMs,
          expiresAtMs: request.expiresAtMs,
          hold: false,
          holdReason: null,
          resolvedAtMs: null,
          spent: null,
          evidenceSource: null,
        };
        ops.push({ ns: NAMESPACES.ledgerDay, key: dayKey(account, today), value: day });
        ops.push({ ns: NAMESPACES.ledgerReservation, key: reservationId, value: record });
        const after: LedgerUsage = {
          spentAtomic: BigInt(day.spent),
          fundedAtomic: BigInt(day.funded),
          seedAtomic: BigInt(day.seed),
          fundedLifetimeAtomic: request.kind === "fund" ? usage.fundedLifetimeAtomic + amount : usage.fundedLifetimeAtomic,
        };
        return { ops, result: { reserved: true, reservationId, replayed: false, usage: after } };
      }),
    ).then(async (result) => {
      await this.#audit?.write({
        ev: "ledger",
        outcome: result.reserved ? "ok" : "refused",
        state: result.reserved ? (result.replayed ? "replayed" : "reserved") : "denied",
        ...(result.reserved ? {} : { code: result.reason }),
        account,
        amountAtomic: request.amountAtomic > 0n ? request.amountAtomic : 0n,
        sync: true,
      });
      return result;
    });
  }

  // ---- commit, settle, hold --------------------------------------------------------------------------------------------

  // The item was spent (an order filled or rests until it fills, an operation was included, a
  // funding message was delivered). The amount stays counted for the day.
  commit(reservationId: string): Promise<void> {
    return this.#mutate(reservationId, (record) => {
      if (record.state === "committed") return { ops: [] };
      if (record.state === "released") throw new RelayError("precondition_failed", "A released reservation cannot be committed.");
      return { ops: [], next: { ...record, state: "committed", resolvedAtMs: this.#now() } };
    });
  }

  // Closes a reservation that ended up smaller than reserved (a partial fill that then expired, a
  // fee below its bound). Giving the difference back is a release, so it needs the same evidence.
  settle(reservationId: string, spentAtomic: bigint, evidence?: ReleaseEvidence): Promise<void> {
    return this.#mutate(reservationId, (record, reader) => {
      const reserved = BigInt(record.amount);
      if (typeof spentAtomic !== "bigint" || spentAtomic < 0n || spentAtomic > reserved) {
        throw new RelayError("invalid_request", "The settled amount must be between zero and the reserved amount.");
      }
      if (record.state === "released") throw new RelayError("precondition_failed", "A released reservation cannot be settled.");
      if (record.state === "committed") {
        const current = record.spent === null ? reserved : BigInt(record.spent);
        if (current === spentAtomic) return { ops: [] };
        throw new RelayError("precondition_failed", "A committed reservation cannot be settled for a different amount.");
      }
      const give = reserved - spentAtomic;
      if (give > 0n) this.#checkEvidence(record, evidence);
      const ops = give > 0n ? this.#giveBack(reader, record, give) : [];
      return {
        ops,
        next: { ...record, state: "committed", resolvedAtMs: this.#now(), spent: spentAtomic.toString(), evidenceSource: give > 0n ? (evidence as ReleaseEvidence).source : null },
      };
    });
  }

  // Marks an item whose outcome is unknown. It stays reserved; only evidence of absence after
  // expiry (or a commit/settle once its fate is known) moves it.
  markAmbiguous(reservationId: string, reason: string): Promise<void> {
    const text = reason.replace(/[^A-Za-z0-9 _.,:;()-]/g, "").slice(0, 120);
    return this.#mutate(reservationId, (record) => {
      if (record.state !== "reserved") return { ops: [] };
      if (record.hold && record.holdReason === text) return { ops: [] };
      return { ops: [], next: { ...record, hold: true, holdReason: text } };
    });
  }

  // ---- release -------------------------------------------------------------------------------------------------------------

  // Gives a reservation back. The DailyLedger interface has no evidence argument; this one takes an
  // optional second parameter and REFUSES without it (A2: after expiry and confirmed absence, ambiguous
  // stays reserved). Unknown ids and already released reservations are a no-op.
  async release(reservationId: string, evidence?: ReleaseEvidence): Promise<void> {
    if (!RESERVATION_ID.test(reservationId)) return;
    await this.#mutate(
      reservationId,
      (record, reader) => {
        if (record.state === "released") return { ops: [] };
        if (record.state === "committed") throw new RelayError("precondition_failed", "A committed reservation cannot be released.");
        this.#checkEvidence(record, evidence);
        const ops = this.#giveBack(reader, record, BigInt(record.amount));
        return { ops, next: { ...record, state: "released", resolvedAtMs: this.#now(), evidenceSource: (evidence as ReleaseEvidence).source } };
      },
      true,
    );
  }

  #checkEvidence(record: ReservationRecord, evidence: ReleaseEvidence | undefined): void {
    const nowMs = this.#now();
    const refuse = (message: string): never => {
      throw new RelayError("precondition_failed", message, { reservation: record.id.slice(0, 8), hold: record.hold });
    };
    if (evidence === undefined || evidence.kind !== "absent_after_expiry" || !(ABSENCE_SOURCES as readonly string[]).includes(evidence.source)) {
      return refuse("A reservation is released only with evidence that the item is gone after its expiry; an ambiguous item stays reserved.");
    }
    if (!Number.isFinite(evidence.checkedAtMs)) return refuse("The evidence has no valid time.");
    if (nowMs < record.expiresAtMs) return refuse("The item has not expired yet, so its reservation stays.");
    if (evidence.checkedAtMs < record.expiresAtMs) return refuse("The evidence was gathered before the item expired.");
    if (evidence.checkedAtMs > nowMs + EVIDENCE_SKEW_MS) return refuse("The evidence is dated in the future.");
  }

  // Operations that subtract `amount` from the day and lifetime counters of a reservation.
  #giveBack(reader: StoreReader, record: ReservationRecord, amount: bigint): StoreOp[] {
    const key = dayKey(record.account, record.day);
    const day = reader.get<DayRecord>(NAMESPACES.ledgerDay, key) ?? ZERO_DAY;
    const next: DayRecord = { ...day };
    const floor = (value: bigint): string => (value < 0n ? "0" : value.toString());
    const ops: StoreOp[] = [];
    if (record.kind === "spend") {
      next.spent = floor(big(day.spent) - amount);
      if (record.category === "seed") next.seed = floor(big(day.seed) - amount);
    } else {
      next.funded = floor(big(day.funded) - amount);
      const lifetime = reader.get<LifetimeRecord>(NAMESPACES.ledgerLifetime, record.account);
      ops.push({ ns: NAMESPACES.ledgerLifetime, key: record.account, value: { funded: floor(big(lifetime?.funded) - amount) } });
    }
    ops.push({ ns: NAMESPACES.ledgerDay, key, value: next });
    return ops;
  }

  async #mutate(
    reservationId: string,
    change: (record: ReservationRecord, reader: StoreReader) => { readonly ops: StoreOp[]; readonly next?: ReservationRecord },
    quietIfMissing = false,
  ): Promise<void> {
    const found = this.#store.get<ReservationRecord>(NAMESPACES.ledgerReservation, reservationId);
    if (found === undefined) {
      if (quietIfMissing) return;
      throw new RelayError("not_found", "No such reservation.");
    }
    let outcome = "";
    await this.#locks.run(`ledger:${found.account}`, () =>
      this.#store.transact((reader) => {
        const record = reader.get<ReservationRecord>(NAMESPACES.ledgerReservation, reservationId);
        if (record === undefined) throw new RelayError("not_found", "No such reservation.");
        const { ops, next } = change(record, reader);
        const all = [...ops];
        if (next !== undefined) {
          all.push({ ns: NAMESPACES.ledgerReservation, key: reservationId, value: next });
          outcome = next.state === record.state ? (next.hold ? "held" : "updated") : next.state;
        }
        return { ops: all, result: undefined };
      }),
    );
    if (outcome !== "") await this.#audit?.write({ ev: "ledger", state: outcome, outcome: "ok", account: found.account, amountAtomic: found.amount, sync: true });
  }

  // ---- housekeeping ------------------------------------------------------------------------------------------------------------

  // Walks expired, still-reserved items and releases the ones the checker proves are gone. "present"
  // and "unknown" stay reserved; the caller commits or settles a present one once it knows how it ended.
  async sweep(confirmAbsent: (reservation: ReservationView) => Promise<AbsenceVerdict>): Promise<SweepReport> {
    const nowMs = this.#now();
    const released: string[] = [];
    const present: string[] = [];
    const unknown: string[] = [];
    for (const reservation of this.list({ state: "reserved", expiredBeforeMs: nowMs })) {
      let verdict: AbsenceVerdict;
      try {
        verdict = await confirmAbsent(reservation);
      } catch {
        verdict = { verdict: "unknown" };
      }
      if (verdict.verdict === "absent") {
        try {
          await this.release(reservation.id, { kind: "absent_after_expiry", source: verdict.source, checkedAtMs: this.#now() });
          released.push(reservation.id);
        } catch {
          unknown.push(reservation.id);
        }
      } else if (verdict.verdict === "present") present.push(reservation.id);
      else unknown.push(reservation.id);
    }
    return { released, present, unknown };
  }

  // Drops day records and finished reservations that are old enough not to matter. Reserved items
  // are never pruned.
  async prune(): Promise<{ readonly days: number; readonly reservations: number }> {
    const nowMs = this.#now();
    const ops: StoreOp[] = [];
    let days = 0;
    let reservations = 0;
    for (const [key] of this.#store.list<DayRecord>(NAMESPACES.ledgerDay)) {
      const day = key.split("|")[1] ?? "";
      const at = Date.parse(`${day}T00:00:00Z`);
      if (Number.isFinite(at) && nowMs - at > DAY_RETENTION_MS) {
        ops.push({ ns: NAMESPACES.ledgerDay, key, value: null });
        days += 1;
      }
    }
    for (const [key, record] of this.#store.list<ReservationRecord>(NAMESPACES.ledgerReservation)) {
      if (record.state !== "reserved" && record.resolvedAtMs !== null && nowMs - record.resolvedAtMs > RESERVATION_RETENTION_MS) {
        ops.push({ ns: NAMESPACES.ledgerReservation, key, value: null });
        reservations += 1;
      }
    }
    if (ops.length > 0) await this.#store.commit(ops);
    return { days, reservations };
  }
}

// The limits the running relay applies. The funding total cap (D3) holds until the deposit leg has
// been seen to deliver and credit (FU6, FU7) and the exit has been seen to work (FU9); each of those
// is a recorded capability fact, so the cap lifts only on evidence.
export function ledgerLimitsFrom(config: RelayConfig, capabilities?: CapabilityRegistry): () => LedgerLimits {
  return () => {
    const exitProven = capabilities !== undefined && ["FU6", "FU7", "FU9"].every((id) => capabilities.state(id) === "yes");
    return {
      maxOrderAtomic: config.limits.maxOrderAtomic,
      maxDailyAtomic: config.limits.maxDailyAtomic,
      seedCapAtomic: config.limits.seedCapAtomic,
      fundingDailyCapAtomic: config.limits.fundingDailyCapAtomic,
      fundingLifetimeCapAtomic: exitProven ? undefined : config.limits.fundingTestCapAtomic,
    };
  };
}

declare module "./types.js" {
  interface RelayServices {
    readonly ledger?: DurableLedger;
  }
}
