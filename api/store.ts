// The chain index's storage (docs/sdk-and-api-design.md section 7, "api/indexer").
//
// The plan names Postgres (or Ponder); neither can be added without a dependency, so the index sits in SQLite through
// node:sqlite (built into Node 24), behind `IndexStore`. Everything the indexer writes and the endpoints read goes
// through that interface, so a Postgres store can replace SqliteIndexStore later without touching either side.
//
// What is stored is public chain data only (the venues' own contracts' events): fills, condition resolutions and module
// results, condition preparations, and one cursor per chain. No venue API answer, title, price list or text is ever
// written here (sdk/venues/cache.ts canPersist: market data stays in memory).
//
// Each block range is written in one transaction together with the cursor that covers it, so a crash leaves either the
// whole range or none of it. A reorg below the confirmation depth is undone by `rewind`, which deletes every row above
// the block it rewinds to.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export const STORE_SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cursors (
  chain_id INTEGER PRIMARY KEY, start_block TEXT NOT NULL, block TEXT NOT NULL, block_hash TEXT NOT NULL,
  block_time_s INTEGER NOT NULL, updated_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS fills (
  chain_id INTEGER NOT NULL, exchange TEXT NOT NULL, tx_hash TEXT NOT NULL, log_index INTEGER NOT NULL, block INTEGER NOT NULL,
  token_id TEXT NOT NULL, side TEXT NOT NULL, maker TEXT NOT NULL, taker TEXT NOT NULL, maker_amount TEXT NOT NULL,
  taker_amount TEXT NOT NULL, fee TEXT NOT NULL, time_lo_s INTEGER NOT NULL, time_hi_s INTEGER NOT NULL, indexed_ms INTEGER NOT NULL,
  PRIMARY KEY (chain_id, tx_hash, log_index));
CREATE INDEX IF NOT EXISTS fills_token ON fills (chain_id, token_id, block, log_index);
CREATE INDEX IF NOT EXISTS fills_indexed ON fills (indexed_ms);
CREATE TABLE IF NOT EXISTS resolutions (
  chain_id INTEGER NOT NULL, ledger TEXT NOT NULL, condition_id TEXT NOT NULL, kind TEXT NOT NULL, payouts TEXT NOT NULL,
  denominator TEXT NOT NULL, oracle TEXT, question_id TEXT, block INTEGER NOT NULL, tx_hash TEXT NOT NULL, log_index INTEGER NOT NULL,
  time_lo_s INTEGER NOT NULL, time_hi_s INTEGER NOT NULL, indexed_ms INTEGER NOT NULL,
  PRIMARY KEY (chain_id, ledger, condition_id));
CREATE INDEX IF NOT EXISTS resolutions_condition ON resolutions (chain_id, condition_id);
CREATE TABLE IF NOT EXISTS preparations (
  chain_id INTEGER NOT NULL, ledger TEXT NOT NULL, condition_id TEXT NOT NULL, oracle TEXT NOT NULL, question_id TEXT NOT NULL,
  outcome_slots INTEGER NOT NULL, block INTEGER NOT NULL, tx_hash TEXT NOT NULL, log_index INTEGER NOT NULL, indexed_ms INTEGER NOT NULL,
  PRIMARY KEY (chain_id, ledger, condition_id));
CREATE INDEX IF NOT EXISTS preparations_condition ON preparations (chain_id, condition_id);
CREATE TABLE IF NOT EXISTS incomplete_ranges (
  chain_id INTEGER NOT NULL, from_block TEXT NOT NULL, to_block TEXT NOT NULL, undecoded INTEGER NOT NULL, dropped INTEGER NOT NULL,
  indexed_ms INTEGER NOT NULL);
`;

export interface Cursor {
  readonly chainId: number;
  // The first block this index covers, and the last one written (with its hash and timestamp).
  readonly startBlock: bigint;
  readonly block: bigint;
  readonly blockHash: string;
  readonly blockTimeS: number;
  readonly updatedMs: number;
}

export interface FillRow {
  readonly chainId: number;
  readonly exchange: string;
  readonly txHash: string;
  readonly logIndex: number;
  readonly block: bigint;
  readonly tokenId: string;
  readonly side: "buy" | "sell";
  readonly maker: string;
  readonly taker: string;
  // Integers in the exchange's base units, as decimal strings.
  readonly makerAmount: string;
  readonly takerAmount: string;
  readonly fee: string;
  // The block's time lies between these (the timestamps of the block before the range and of the range's last block).
  readonly timeLoS: number;
  readonly timeHiS: number;
  readonly indexedMs: number;
}

export interface ResolutionRow {
  readonly chainId: number;
  readonly ledger: string;
  // A 32-byte Conditional Tokens condition, or a 31-byte Polymarket Protocol V2 condition (kind "module").
  readonly conditionId: string;
  readonly kind: "ctf" | "module";
  readonly payouts: readonly string[];
  readonly denominator: string;
  readonly oracle: string | null;
  readonly questionId: string | null;
  readonly block: bigint;
  readonly txHash: string;
  readonly logIndex: number;
  readonly timeLoS: number;
  readonly timeHiS: number;
  readonly indexedMs: number;
}

export interface PreparationRow {
  readonly chainId: number;
  readonly ledger: string;
  readonly conditionId: string;
  readonly oracle: string;
  readonly questionId: string;
  readonly outcomeSlots: number;
  readonly block: bigint;
  readonly txHash: string;
  readonly logIndex: number;
  readonly indexedMs: number;
}

export interface RangeWrite {
  readonly chainId: number;
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  readonly toHash: string;
  readonly toTimeS: number;
  readonly fills: readonly FillRow[];
  readonly resolutions: readonly ResolutionRow[];
  readonly preparations: readonly PreparationRow[];
  // Logs the node returned that did not decode, and rows it dropped: the range is recorded as incomplete.
  readonly undecoded: number;
  readonly dropped: number;
  readonly indexedMs: number;
}

export interface StoreCounts {
  readonly fills: number;
  readonly resolutions: number;
  readonly preparations: number;
  readonly incompleteRanges: number;
}

// The storage seam. A Postgres implementation would keep these semantics: applyRange is atomic with its cursor and
// refuses a range that does not start right after the cursor; rewind deletes every row above the block it keeps.
export interface IndexStore {
  cursor(chainId: number): Cursor | null;
  // The first cursor of a chain: the block before the first one indexed.
  initCursor(chainId: number, block: bigint, blockHash: string, blockTimeS: number, nowMs: number): void;
  applyRange(write: RangeWrite): void;
  // Keeps blocks up to `block` (its hash and time become the cursor) and deletes every row above it. Returns rows deleted.
  rewind(chainId: number, block: bigint, blockHash: string, blockTimeS: number, nowMs: number): number;
  // The newest fill of each token, by block and log index.
  lastFills(chainId: number, tokenIds: readonly string[]): Map<string, FillRow>;
  resolutions(chainId: number, conditionIds: readonly string[]): Map<string, ResolutionRow>;
  preparations(chainId: number, conditionIds: readonly string[]): Map<string, PreparationRow>;
  incompleteRanges(chainId: number): number;
  // Deletes fills indexed before `beforeMs`; resolutions and preparations are kept. Returns rows deleted.
  pruneFills(beforeMs: number): number;
  counts(): StoreCounts;
  close(): void;
}

type Row = Record<string, SQLInputValue | undefined>;

const MAX_LOOKUP = 500;

function str(value: SQLInputValue | undefined): string {
  return typeof value === "string" ? value : String(value);
}

function num(value: SQLInputValue | undefined): number {
  return typeof value === "bigint" ? Number(value) : Number(value);
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(",");
}

export class SqliteIndexStore implements IndexStore {
  private readonly db: DatabaseSync;

  private constructor(db: DatabaseSync) {
    this.db = db;
  }

  static open(path: string): SqliteIndexStore {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
    db.exec(SCHEMA);
    const existing = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
    if (existing === undefined) db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(String(STORE_SCHEMA_VERSION));
    else if (existing.value !== String(STORE_SCHEMA_VERSION)) {
      db.close();
      throw new Error(`unsupported index schema version ${existing.value}`);
    }
    return new SqliteIndexStore(db);
  }

  close(): void {
    this.db.close();
  }

  private tx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  cursor(chainId: number): Cursor | null {
    const r = this.db.prepare("SELECT * FROM cursors WHERE chain_id = ?").get(chainId) as Row | undefined;
    if (r === undefined) return null;
    return {
      chainId,
      startBlock: BigInt(str(r["start_block"])),
      block: BigInt(str(r["block"])),
      blockHash: str(r["block_hash"]),
      blockTimeS: num(r["block_time_s"]),
      updatedMs: num(r["updated_ms"]),
    };
  }

  initCursor(chainId: number, block: bigint, blockHash: string, blockTimeS: number, nowMs: number): void {
    if (this.cursor(chainId) !== null) throw new Error("the chain already has a cursor");
    this.db
      .prepare("INSERT INTO cursors (chain_id, start_block, block, block_hash, block_time_s, updated_ms) VALUES (?, ?, ?, ?, ?, ?)")
      .run(chainId, (block + 1n).toString(), block.toString(), blockHash, blockTimeS, nowMs);
  }

  applyRange(write: RangeWrite): void {
    this.tx(() => {
      const cursor = this.cursor(write.chainId);
      if (cursor === null) throw new Error("the chain has no cursor");
      if (write.fromBlock !== cursor.block + 1n || write.toBlock < write.fromBlock) throw new Error("the range does not follow the cursor");
      const fill = this.db.prepare(
        "INSERT OR IGNORE INTO fills (chain_id, exchange, tx_hash, log_index, block, token_id, side, maker, taker, maker_amount, taker_amount, fee, time_lo_s, time_hi_s, indexed_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const f of write.fills) {
        fill.run(f.chainId, f.exchange, f.txHash, f.logIndex, Number(f.block), f.tokenId, f.side, f.maker, f.taker, f.makerAmount, f.takerAmount, f.fee, f.timeLoS, f.timeHiS, f.indexedMs);
      }
      const resolution = this.db.prepare(
        "INSERT OR IGNORE INTO resolutions (chain_id, ledger, condition_id, kind, payouts, denominator, oracle, question_id, block, tx_hash, log_index, time_lo_s, time_hi_s, indexed_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const r of write.resolutions) {
        resolution.run(r.chainId, r.ledger, r.conditionId, r.kind, JSON.stringify(r.payouts), r.denominator, r.oracle, r.questionId, Number(r.block), r.txHash, r.logIndex, r.timeLoS, r.timeHiS, r.indexedMs);
      }
      const preparation = this.db.prepare(
        "INSERT OR IGNORE INTO preparations (chain_id, ledger, condition_id, oracle, question_id, outcome_slots, block, tx_hash, log_index, indexed_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const p of write.preparations) {
        preparation.run(p.chainId, p.ledger, p.conditionId, p.oracle, p.questionId, p.outcomeSlots, Number(p.block), p.txHash, p.logIndex, p.indexedMs);
      }
      if (write.undecoded > 0 || write.dropped > 0) {
        this.db
          .prepare("INSERT INTO incomplete_ranges (chain_id, from_block, to_block, undecoded, dropped, indexed_ms) VALUES (?, ?, ?, ?, ?, ?)")
          .run(write.chainId, write.fromBlock.toString(), write.toBlock.toString(), write.undecoded, write.dropped, write.indexedMs);
      }
      this.db
        .prepare("UPDATE cursors SET block = ?, block_hash = ?, block_time_s = ?, updated_ms = ? WHERE chain_id = ?")
        .run(write.toBlock.toString(), write.toHash, write.toTimeS, write.indexedMs, write.chainId);
    });
  }

  rewind(chainId: number, block: bigint, blockHash: string, blockTimeS: number, nowMs: number): number {
    return this.tx(() => {
      const cursor = this.cursor(chainId);
      if (cursor === null) throw new Error("the chain has no cursor");
      if (block > cursor.block) throw new Error("a rewind cannot move forward");
      const above = Number(block);
      let deleted = 0;
      for (const table of ["fills", "resolutions", "preparations"] as const) {
        deleted += Number(this.db.prepare(`DELETE FROM ${table} WHERE chain_id = ? AND block > ?`).run(chainId, above).changes);
      }
      this.db.prepare("DELETE FROM incomplete_ranges WHERE chain_id = ? AND CAST(from_block AS INTEGER) > ?").run(chainId, above);
      const start = block + 1n < cursor.startBlock ? block + 1n : cursor.startBlock;
      this.db
        .prepare("UPDATE cursors SET start_block = ?, block = ?, block_hash = ?, block_time_s = ?, updated_ms = ? WHERE chain_id = ?")
        .run(start.toString(), block.toString(), blockHash, blockTimeS, nowMs, chainId);
      return deleted;
    });
  }

  lastFills(chainId: number, tokenIds: readonly string[]): Map<string, FillRow> {
    const out = new Map<string, FillRow>();
    const statement = this.db.prepare("SELECT * FROM fills WHERE chain_id = ? AND token_id = ? ORDER BY block DESC, log_index DESC LIMIT 1");
    for (const tokenId of [...new Set(tokenIds)].slice(0, MAX_LOOKUP)) {
      const r = statement.get(chainId, tokenId) as Row | undefined;
      if (r === undefined) continue;
      out.set(tokenId, {
        chainId,
        exchange: str(r["exchange"]),
        txHash: str(r["tx_hash"]),
        logIndex: num(r["log_index"]),
        block: BigInt(num(r["block"])),
        tokenId,
        side: str(r["side"]) === "sell" ? "sell" : "buy",
        maker: str(r["maker"]),
        taker: str(r["taker"]),
        makerAmount: str(r["maker_amount"]),
        takerAmount: str(r["taker_amount"]),
        fee: str(r["fee"]),
        timeLoS: num(r["time_lo_s"]),
        timeHiS: num(r["time_hi_s"]),
        indexedMs: num(r["indexed_ms"]),
      });
    }
    return out;
  }

  resolutions(chainId: number, conditionIds: readonly string[]): Map<string, ResolutionRow> {
    const ids = [...new Set(conditionIds.map((id) => id.toLowerCase()))].slice(0, MAX_LOOKUP);
    const out = new Map<string, ResolutionRow>();
    if (ids.length === 0) return out;
    const rows = this.db.prepare(`SELECT * FROM resolutions WHERE chain_id = ? AND condition_id IN (${placeholders(ids.length)})`).all(chainId, ...ids) as Row[];
    for (const r of rows) {
      const payouts = JSON.parse(str(r["payouts"])) as unknown;
      out.set(str(r["condition_id"]), {
        chainId,
        ledger: str(r["ledger"]),
        conditionId: str(r["condition_id"]),
        kind: str(r["kind"]) === "module" ? "module" : "ctf",
        payouts: Array.isArray(payouts) ? payouts.map(String) : [],
        denominator: str(r["denominator"]),
        oracle: r["oracle"] === null ? null : str(r["oracle"]),
        questionId: r["question_id"] === null ? null : str(r["question_id"]),
        block: BigInt(num(r["block"])),
        txHash: str(r["tx_hash"]),
        logIndex: num(r["log_index"]),
        timeLoS: num(r["time_lo_s"]),
        timeHiS: num(r["time_hi_s"]),
        indexedMs: num(r["indexed_ms"]),
      });
    }
    return out;
  }

  preparations(chainId: number, conditionIds: readonly string[]): Map<string, PreparationRow> {
    const ids = [...new Set(conditionIds.map((id) => id.toLowerCase()))].slice(0, MAX_LOOKUP);
    const out = new Map<string, PreparationRow>();
    if (ids.length === 0) return out;
    const rows = this.db.prepare(`SELECT * FROM preparations WHERE chain_id = ? AND condition_id IN (${placeholders(ids.length)})`).all(chainId, ...ids) as Row[];
    for (const r of rows) {
      out.set(str(r["condition_id"]), {
        chainId,
        ledger: str(r["ledger"]),
        conditionId: str(r["condition_id"]),
        oracle: str(r["oracle"]),
        questionId: str(r["question_id"]),
        outcomeSlots: num(r["outcome_slots"]),
        block: BigInt(num(r["block"])),
        txHash: str(r["tx_hash"]),
        logIndex: num(r["log_index"]),
        indexedMs: num(r["indexed_ms"]),
      });
    }
    return out;
  }

  incompleteRanges(chainId: number): number {
    const r = this.db.prepare("SELECT COUNT(*) AS n FROM incomplete_ranges WHERE chain_id = ?").get(chainId) as { n: number | bigint };
    return Number(r.n);
  }

  pruneFills(beforeMs: number): number {
    return Number(this.db.prepare("DELETE FROM fills WHERE indexed_ms < ?").run(beforeMs).changes);
  }

  counts(): StoreCounts {
    const count = (table: string): number => Number((this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number | bigint }).n);
    return { fills: count("fills"), resolutions: count("resolutions"), preparations: count("preparations"), incompleteRanges: count("incomplete_ranges") };
  }
}
