// The unified-account tables (docs/unified-account-design.md section 3.2), in the API's SQLite file beside the chain index
// (api/store.ts) and the metering tables (api/metering-store.ts), through their own connection.
//
// What is stored, and nothing else:
//   - limitless_profiles: one row per trading account this server registered as its Limitless partner sub-account: the
//     account (lower case) and the profile id Limitless gave it (limitless-relay.ts fills ownerId and onBehalfOf from it,
//     never from a browser);
//   - bridge_deposits: the EVM deposit addresses bridge.polymarket.com returned to THIS server for a sender's own Deposit
//     Wallet (polymarket-bridge.ts); the paymaster sponsors a transfer to one without counting it as a withdrawal;
//   - sponsored_withdrawals: per sender and UTC day, the user operations (by chain and nonce) the paymaster sponsored that
//     move a token anywhere else, for the daily cap;
//   - account_backups: one record per passkey credential id (account-backup.ts: version, credential id, address, iv,
//     ciphertext, as JSON), written once; the server cannot read the key inside (the browser encrypts it with a key
//     derived from the passkey).
// No key, credential, request body or venue answer is written here.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS limitless_profiles (account TEXT PRIMARY KEY, profile_id INTEGER NOT NULL, created_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bridge_deposits (
  sender TEXT NOT NULL, deposit TEXT NOT NULL, wallet TEXT NOT NULL, fetched_ms INTEGER NOT NULL, PRIMARY KEY (sender, deposit));
CREATE TABLE IF NOT EXISTS sponsored_withdrawals (
  sender TEXT NOT NULL, day TEXT NOT NULL, chain_id INTEGER NOT NULL, nonce TEXT NOT NULL, created_ms INTEGER NOT NULL,
  PRIMARY KEY (sender, day, chain_id, nonce));
CREATE TABLE IF NOT EXISTS account_backups (credential_id TEXT PRIMARY KEY, blob TEXT NOT NULL, created_ms INTEGER NOT NULL);
`;

export interface BackupRow {
  readonly credentialId: string;
  readonly blob: string;
  readonly createdMs: number;
}

export interface AccountStore {
  limitlessProfile(account: string): number | null;
  setLimitlessProfile(account: string, profileId: number, nowMs: number): void;
  // The deposit addresses this server fetched for a sender, newer than `sinceMs`.
  bridgeDeposits(sender: string, sinceMs: number): string[];
  addBridgeDeposit(sender: string, deposit: string, wallet: string, nowMs: number): void;
  withdrawalCount(sender: string, day: string): number;
  // False when this operation was counted already (a retry of the same user operation).
  recordWithdrawal(sender: string, day: string, chainId: number, nonce: string, nowMs: number): boolean;
  hasWithdrawal(sender: string, day: string, chainId: number, nonce: string): boolean;
  backup(credentialId: string): BackupRow | null;
  // False when the slot is already written.
  putBackup(credentialId: string, blob: string, nowMs: number): boolean;
  close(): void;
}

type Row = Record<string, unknown>;

export class SqliteAccountStore implements AccountStore {
  private readonly db: DatabaseSync;

  private constructor(db: DatabaseSync) {
    this.db = db;
  }

  static open(path: string): SqliteAccountStore {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
    try {
      db.exec(SCHEMA);
    } catch (error) {
      db.close();
      throw error;
    }
    return new SqliteAccountStore(db);
  }

  limitlessProfile(account: string): number | null {
    const row = this.db.prepare("SELECT profile_id FROM limitless_profiles WHERE account = ?").get(account.toLowerCase()) as Row | undefined;
    return row === undefined ? null : Number(row["profile_id"]);
  }

  setLimitlessProfile(account: string, profileId: number, nowMs: number): void {
    this.db.prepare("INSERT INTO limitless_profiles (account, profile_id, created_ms) VALUES (?, ?, ?) ON CONFLICT(account) DO UPDATE SET profile_id = excluded.profile_id").run(account.toLowerCase(), profileId, nowMs);
  }

  bridgeDeposits(sender: string, sinceMs: number): string[] {
    return (this.db.prepare("SELECT deposit FROM bridge_deposits WHERE sender = ? AND fetched_ms >= ? ORDER BY deposit").all(sender.toLowerCase(), sinceMs) as Row[]).map((row) => String(row["deposit"]));
  }

  addBridgeDeposit(sender: string, deposit: string, wallet: string, nowMs: number): void {
    this.db
      .prepare("INSERT INTO bridge_deposits (sender, deposit, wallet, fetched_ms) VALUES (?, ?, ?, ?) ON CONFLICT(sender, deposit) DO UPDATE SET fetched_ms = excluded.fetched_ms, wallet = excluded.wallet")
      .run(sender.toLowerCase(), deposit.toLowerCase(), wallet.toLowerCase(), nowMs);
  }

  withdrawalCount(sender: string, day: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM sponsored_withdrawals WHERE sender = ? AND day = ?").get(sender.toLowerCase(), day) as Row;
    return Number(row["n"]);
  }

  recordWithdrawal(sender: string, day: string, chainId: number, nonce: string, nowMs: number): boolean {
    const result = this.db.prepare("INSERT OR IGNORE INTO sponsored_withdrawals (sender, day, chain_id, nonce, created_ms) VALUES (?, ?, ?, ?, ?)").run(sender.toLowerCase(), day, chainId, nonce, nowMs);
    return Number(result.changes) === 1;
  }

  hasWithdrawal(sender: string, day: string, chainId: number, nonce: string): boolean {
    return this.db.prepare("SELECT 1 FROM sponsored_withdrawals WHERE sender = ? AND day = ? AND chain_id = ? AND nonce = ?").get(sender.toLowerCase(), day, chainId, nonce) !== undefined;
  }

  backup(credentialId: string): BackupRow | null {
    const row = this.db.prepare("SELECT * FROM account_backups WHERE credential_id = ?").get(credentialId) as Row | undefined;
    return row === undefined ? null : { credentialId: String(row["credential_id"]), blob: String(row["blob"]), createdMs: Number(row["created_ms"]) };
  }

  putBackup(credentialId: string, blob: string, nowMs: number): boolean {
    const result = this.db.prepare("INSERT OR IGNORE INTO account_backups (credential_id, blob, created_ms) VALUES (?, ?, ?)").run(credentialId, blob, nowMs);
    return Number(result.changes) === 1;
  }

  close(): void {
    this.db.close();
  }
}
