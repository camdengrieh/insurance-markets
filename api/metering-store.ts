// The metering tables (docs/sdk-and-api-design.md section 4: subscription keys and x402 per call), in the API's SQLite file
// beside the chain index (api/store.ts), through their own connection.
//
// What is stored:
//   - api_keys: one row per subscription key: its public id, the sha256 of the whole key (never the key itself), a label
//     the operator chose, the tier, its own rate limit, and when it was issued, expires and was revoked;
//   - x402_payments: one row per EIP-3009 authorization this API has accepted for a call, keyed by payer and nonce, so the
//     same authorization can never pay twice (replay), with its state and the settlement's transaction hash.
// No venue data, no request body and no answer is written here.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY, key_sha256 TEXT NOT NULL, label TEXT NOT NULL, tier TEXT NOT NULL, per_minute INTEGER NOT NULL,
  burst INTEGER NOT NULL, created_ms INTEGER NOT NULL, expires_ms INTEGER, revoked_ms INTEGER);
CREATE TABLE IF NOT EXISTS x402_payments (
  payer TEXT NOT NULL, nonce TEXT NOT NULL, valid_before_s INTEGER NOT NULL, state TEXT NOT NULL, route TEXT NOT NULL,
  amount TEXT NOT NULL, tx TEXT, created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL, PRIMARY KEY (payer, nonce));
CREATE INDEX IF NOT EXISTS x402_payments_valid ON x402_payments (valid_before_s);
`;

export const KEY_TIERS = ["quote", "full"] as const;
export type KeyTier = (typeof KEY_TIERS)[number];

export interface KeyRow {
  readonly id: string;
  readonly keySha256: string;
  readonly label: string;
  readonly tier: KeyTier;
  readonly perMinute: number;
  readonly burst: number;
  readonly createdMs: number;
  readonly expiresMs: number | null;
  readonly revokedMs: number | null;
}

// claimed: verified or being verified, the handler not answered yet; settled: the facilitator settled it; settle_failed:
// the facilitator refused the settlement (nothing was charged by its account); settle_unknown: the settlement's outcome is
// not known (pending on chain, or the facilitator did not answer). Only "claimed" may be released, when nothing was charged.
export const PAYMENT_STATES = ["claimed", "settled", "settle_failed", "settle_unknown"] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

export interface PaymentRow {
  readonly payer: string;
  readonly nonce: string;
  readonly validBeforeS: number;
  readonly state: PaymentState;
  readonly route: string;
  readonly amount: string;
  readonly tx: string | null;
}

export interface MeteringStore {
  insertKey(row: KeyRow): void;
  key(id: string): KeyRow | null;
  keys(): KeyRow[];
  // Returns false when no such key exists or it was already revoked.
  revokeKey(id: string, nowMs: number): boolean;
  // Atomically records an authorization as claimed; false when the same payer and nonce were seen before (a replay).
  claimPayment(row: Omit<PaymentRow, "state" | "tx">, nowMs: number): boolean;
  // Forgets a claim that charged nothing (the facilitator refused it, or the handler failed before any settle).
  releasePayment(payer: string, nonce: string): void;
  markPayment(payer: string, nonce: string, state: Exclude<PaymentState, "claimed">, tx: string | null, nowMs: number): void;
  payment(payer: string, nonce: string): PaymentRow | null;
  // Deletes rows whose authorization expired before `beforeS`: the token contract refuses it after validBefore anyway.
  prunePayments(beforeS: number): number;
  close(): void;
}

type Row = Record<string, unknown>;

function keyOf(row: Row): KeyRow {
  return {
    id: String(row["id"]),
    keySha256: String(row["key_sha256"]),
    label: String(row["label"]),
    tier: String(row["tier"]) as KeyTier,
    perMinute: Number(row["per_minute"]),
    burst: Number(row["burst"]),
    createdMs: Number(row["created_ms"]),
    expiresMs: row["expires_ms"] === null ? null : Number(row["expires_ms"]),
    revokedMs: row["revoked_ms"] === null ? null : Number(row["revoked_ms"]),
  };
}

export class SqliteMeteringStore implements MeteringStore {
  private readonly db: DatabaseSync;

  private constructor(db: DatabaseSync) {
    this.db = db;
  }

  static open(path: string): SqliteMeteringStore {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
    try {
      db.exec(SCHEMA);
    } catch (error) {
      db.close();
      throw error;
    }
    return new SqliteMeteringStore(db);
  }

  insertKey(row: KeyRow): void {
    this.db
      .prepare("INSERT INTO api_keys (id, key_sha256, label, tier, per_minute, burst, created_ms, expires_ms, revoked_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(row.id, row.keySha256, row.label, row.tier, row.perMinute, row.burst, row.createdMs, row.expiresMs, row.revokedMs);
  }

  key(id: string): KeyRow | null {
    const row = this.db.prepare("SELECT * FROM api_keys WHERE id = ?").get(id) as Row | undefined;
    return row === undefined ? null : keyOf(row);
  }

  keys(): KeyRow[] {
    return (this.db.prepare("SELECT * FROM api_keys ORDER BY created_ms, id").all() as Row[]).map(keyOf);
  }

  revokeKey(id: string, nowMs: number): boolean {
    const result = this.db.prepare("UPDATE api_keys SET revoked_ms = ? WHERE id = ? AND revoked_ms IS NULL").run(nowMs, id);
    return Number(result.changes) === 1;
  }

  claimPayment(row: Omit<PaymentRow, "state" | "tx">, nowMs: number): boolean {
    const result = this.db
      .prepare("INSERT OR IGNORE INTO x402_payments (payer, nonce, valid_before_s, state, route, amount, tx, created_ms, updated_ms) VALUES (?, ?, ?, 'claimed', ?, ?, NULL, ?, ?)")
      .run(row.payer, row.nonce, row.validBeforeS, row.route, row.amount, nowMs, nowMs);
    return Number(result.changes) === 1;
  }

  releasePayment(payer: string, nonce: string): void {
    this.db.prepare("DELETE FROM x402_payments WHERE payer = ? AND nonce = ? AND state = 'claimed'").run(payer, nonce);
  }

  markPayment(payer: string, nonce: string, state: Exclude<PaymentState, "claimed">, tx: string | null, nowMs: number): void {
    this.db.prepare("UPDATE x402_payments SET state = ?, tx = ?, updated_ms = ? WHERE payer = ? AND nonce = ?").run(state, tx, nowMs, payer, nonce);
  }

  payment(payer: string, nonce: string): PaymentRow | null {
    const row = this.db.prepare("SELECT * FROM x402_payments WHERE payer = ? AND nonce = ?").get(payer, nonce) as Row | undefined;
    if (row === undefined) return null;
    return {
      payer: String(row["payer"]),
      nonce: String(row["nonce"]),
      validBeforeS: Number(row["valid_before_s"]),
      state: String(row["state"]) as PaymentState,
      route: String(row["route"]),
      amount: String(row["amount"]),
      tx: row["tx"] === null ? null : String(row["tx"]),
    };
  }

  prunePayments(beforeS: number): number {
    return Number(this.db.prepare("DELETE FROM x402_payments WHERE valid_before_s < ?").run(beforeS).changes);
  }

  close(): void {
    this.db.close();
  }
}
