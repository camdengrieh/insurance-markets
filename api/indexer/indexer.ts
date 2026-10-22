import { decodeConditionResolution } from "../../sdk/chain/ctf.js";
import { decodeFill } from "../../sdk/chain/fills.js";
import { pinFailureText } from "../../sdk/chain/pins.js";
import { quantityHex, RpcError, type Address, type LogRead, type RpcPort } from "../../sdk/chain/rpc.js";
import type { ChainConfig } from "../config.js";
import type { FillRow, IndexStore, PreparationRow, ResolutionRow } from "../store.js";
import { topicsOf, type ChainSpec, type IndexedContract } from "./chains.js";
import { decodeModuleResolution, decodePreparation } from "./events.js";
import type { EndpointStatus, RpcPool } from "./rpc-pool.js";

// One chain's log indexer (docs/sdk-and-api-design.md section 7, "api/indexer"). Each pass:
//   1. checks every contract's pin once (code hash, and an EIP-1967 proxy's implementation); a contract that changed stops
//      this chain's indexer for good, with the reason, and nothing is read from it;
//   2. reads the head and indexes only up to head - confirmations (reorg safety);
//   3. confirms the last indexed block's hash is unchanged; if a reorg deeper than the depth replaced it, rewinds by the
//      depth and deletes what was written above;
//   4. reads bounded ranges with ONE eth_getLogs each (every pinned contract, the indexed topics): never an open range,
//      never more blocks than the span, which halves when a node refuses the size and grows back while answers are small,
//      within the RPC port's 10,000-block cap;
//   5. writes each range in one transaction with the cursor (sdk store contract in ../store.ts).
// A failing endpoint is set aside by the pool and the next is asked; when none answers, the pass ends and the state says so.

export const MAX_RANGES_PER_PASS = 10;
// A range whose answer is smaller than this grows the span for the next one.
const GROW_BELOW_LOGS = 2_000;

export type IndexerState = "starting" | "waiting" | "ok" | "behind" | "rpc_failed" | "pin_failed";

export interface IndexerStatus {
  readonly chain: string;
  readonly chainId: number;
  readonly via: string;
  readonly state: IndexerState;
  // Fixed words, or null when the state needs none.
  readonly reason: string | null;
  readonly startBlock: string | null;
  readonly cursorBlock: string | null;
  readonly cursorTimeUtc: string | null;
  readonly headBlock: string | null;
  readonly safeBlock: string | null;
  readonly lagBlocks: string | null;
  readonly confirmations: number;
  readonly span: number;
  readonly incompleteRanges: number;
  readonly lastPassMs: number | null;
  readonly endpoints: readonly EndpointStatus[];
}

export interface ChainIndexerOptions {
  readonly spec: ChainSpec;
  readonly config: ChainConfig;
  readonly store: IndexStore;
  readonly pool: RpcPool;
  readonly nowMs: () => number;
  readonly log?: (line: string) => void;
  readonly maxRangesPerPass?: number;
}

interface Header {
  readonly number: bigint;
  readonly hash: string;
  readonly timeS: number;
}

const HASH = /^0x[0-9a-f]{64}$/;
const QUANTITY = /^0x[0-9a-f]{1,16}$/;

function headerOf(raw: unknown, expected: bigint): Header {
  if (typeof raw !== "object" || raw === null) throw new RpcError("invalid_response", "block_missing");
  const record = raw as Record<string, unknown>;
  const hash = typeof record["hash"] === "string" ? record["hash"].toLowerCase() : "";
  const number = typeof record["number"] === "string" ? record["number"].toLowerCase() : "";
  const time = typeof record["timestamp"] === "string" ? record["timestamp"].toLowerCase() : "";
  if (!HASH.test(hash) || !QUANTITY.test(number) || !QUANTITY.test(time) || BigInt(number) !== expected) throw new RpcError("invalid_response", "block_shape");
  return { number: expected, hash, timeS: Number(BigInt(time)) };
}

async function readHeader(port: RpcPort, block: bigint): Promise<Header> {
  return headerOf(await port.request("eth_getBlockByNumber", [quantityHex(block), false]), block);
}

export class ChainIndexer {
  readonly spec: ChainSpec;
  readonly #config: ChainConfig;
  readonly #store: IndexStore;
  readonly #pool: RpcPool;
  readonly #nowMs: () => number;
  readonly #log: (line: string) => void;
  readonly #maxRanges: number;
  readonly #addresses: Address[];
  readonly #byAddress: Map<string, IndexedContract>;
  #pinsChecked = false;
  #state: IndexerState = "starting";
  #reason: string | null = null;
  #head: bigint | null = null;
  #span: number;
  #lastPassMs: number | null = null;
  #running = false;

  constructor(options: ChainIndexerOptions) {
    this.spec = options.spec;
    this.#config = options.config;
    this.#store = options.store;
    this.#pool = options.pool;
    this.#nowMs = options.nowMs;
    this.#log = options.log ?? (() => undefined);
    this.#maxRanges = options.maxRangesPerPass ?? MAX_RANGES_PER_PASS;
    this.#span = options.spec.initialSpan;
    this.#addresses = options.spec.contracts.map((c) => c.pin.address.toLowerCase() as Address);
    this.#byAddress = new Map(options.spec.contracts.map((c) => [c.pin.address.toLowerCase(), c]));
    if (this.#addresses.length > 20) throw new Error("one log filter names at most 20 contracts");
  }

  status(): IndexerStatus {
    const cursor = this.#store.cursor(this.spec.chainId);
    const safe = this.#head === null ? null : this.#head - BigInt(this.#config.confirmations);
    return {
      chain: this.spec.key,
      chainId: this.spec.chainId,
      via: this.spec.via,
      state: this.#state,
      reason: this.#reason,
      startBlock: cursor === null ? null : cursor.startBlock.toString(),
      cursorBlock: cursor === null ? null : cursor.block.toString(),
      cursorTimeUtc: cursor === null ? null : new Date(cursor.blockTimeS * 1000).toISOString(),
      headBlock: this.#head === null ? null : this.#head.toString(),
      safeBlock: safe === null ? null : safe.toString(),
      lagBlocks: safe === null || cursor === null ? null : (safe > cursor.block ? safe - cursor.block : 0n).toString(),
      confirmations: this.#config.confirmations,
      span: this.#span,
      incompleteRanges: this.#store.incompleteRanges(this.spec.chainId),
      lastPassMs: this.#lastPassMs,
      endpoints: this.#pool.status(),
    };
  }

  #set(state: IndexerState, reason: string | null): void {
    if (state !== this.#state || reason !== this.#reason) this.#log(`indexer ${this.spec.key}: ${state}${reason === null ? "" : ` (${reason})`}`);
    this.#state = state;
    this.#reason = reason;
  }

  // One pass. Never throws: a failure is the state.
  async pass(): Promise<void> {
    if (this.#running || this.#state === "pin_failed") return;
    this.#running = true;
    try {
      await this.#pass();
    } catch (error) {
      if (error instanceof RpcError) this.#set("rpc_failed", `no endpoint answered (${error.code})`);
      else this.#set("rpc_failed", "the pass failed unexpectedly");
    } finally {
      this.#lastPassMs = this.#nowMs();
      this.#running = false;
    }
  }

  async #checkPins(): Promise<boolean> {
    for (const contract of this.spec.contracts) {
      const check = await this.#pool.run((_port, guard) => guard.check(contract.pin));
      if (!check.ok) {
        if (check.reason === "unreadable") {
          this.#set("rpc_failed", pinFailureText(check));
          return false;
        }
        this.#set("pin_failed", pinFailureText(check));
        return false;
      }
    }
    this.#pinsChecked = true;
    return true;
  }

  async #pass(): Promise<void> {
    if (!this.#pinsChecked && !(await this.#checkPins())) return;
    const chainId = this.spec.chainId;
    const head = await this.#pool.run((port) => port.blockNumber());
    this.#head = head;
    const safe = head - BigInt(this.#config.confirmations);
    let cursor = this.#store.cursor(chainId);
    if (cursor === null) {
      const start = this.#config.startBlock ?? safe;
      if (start < 1n || start > safe) {
        this.#set("waiting", "the configured start block is not yet below the confirmation depth");
        return;
      }
      const before = await this.#pool.run((port) => readHeader(port, start - 1n));
      this.#store.initCursor(chainId, before.number, before.hash, before.timeS, this.#nowMs());
      cursor = this.#store.cursor(chainId);
      if (cursor === null) return;
    }
    const current = cursor;

    // Reorg check: the last indexed block must still be the one written.
    const now = await this.#pool.run((port) => readHeader(port, current.block));
    if (now.hash !== current.blockHash) {
      const depth = BigInt(this.#config.confirmations);
      const keep = current.block - depth >= current.startBlock - 1n ? current.block - depth : current.startBlock - 1n;
      const header = await this.#pool.run((port) => readHeader(port, keep));
      const deleted = this.#store.rewind(chainId, keep, header.hash, header.timeS, this.#nowMs());
      this.#log(`indexer ${this.spec.key}: block ${current.block} was replaced; rewound to ${keep}, ${deleted} rows removed`);
      return;
    }

    let block = current.block;
    let timeS = current.blockTimeS;
    let ranges = 0;
    while (block < safe && ranges < this.#maxRanges) {
      const from = block + 1n;
      const want = from + BigInt(this.#span) - 1n;
      const to = want < safe ? want : safe;
      let read: LogRead;
      try {
        read = await this.#pool.run(
          (port) => port.getLogs({ address: this.#addresses, topics: [topicsOf(this.spec)], fromBlock: from, toBlock: to }),
          { rangeSensitive: true },
        );
      } catch (error) {
        if (error instanceof RpcError && (error.code === "too_large" || error.code === "upstream_error") && this.#span > 1) {
          this.#span = Math.max(1, Math.floor(this.#span / 2));
          continue;
        }
        throw error;
      }
      const header = await this.#pool.run((port) => readHeader(port, to));
      const indexedMs = this.#nowMs();
      const rows = this.#decode(read, timeS, header.timeS, indexedMs);
      this.#store.applyRange({
        chainId,
        fromBlock: from,
        toBlock: to,
        toHash: header.hash,
        toTimeS: header.timeS,
        ...rows,
        dropped: read.droppedMalformed + read.droppedUnmatched + read.droppedPending,
        indexedMs,
      });
      block = to;
      timeS = header.timeS;
      ranges += 1;
      if (read.logs.length < GROW_BELOW_LOGS && this.#span < this.spec.maxSpan) this.#span = Math.min(this.spec.maxSpan, this.#span * 2);
    }
    if (block < safe) this.#set("behind", `${(safe - block).toString()} blocks behind the confirmation depth`);
    else this.#set("ok", null);
  }

  #decode(read: LogRead, timeLoS: number, timeHiS: number, indexedMs: number): { fills: FillRow[]; resolutions: ResolutionRow[]; preparations: PreparationRow[]; undecoded: number } {
    const chainId = this.spec.chainId;
    const fills: FillRow[] = [];
    const resolutions: ResolutionRow[] = [];
    const preparations: PreparationRow[] = [];
    let undecoded = 0;
    for (const log of read.logs) {
      const contract = this.#byAddress.get(log.address.toLowerCase());
      const address = log.address.toLowerCase() as Address;
      let handled = false;
      if (contract?.role === "exchange" && contract.shape !== undefined) {
        const fill = decodeFill(log, address, contract.shape);
        if (fill !== null) {
          handled = true;
          fills.push({
            chainId,
            exchange: fill.exchange,
            txHash: fill.transactionHash,
            logIndex: fill.logIndex,
            block: fill.blockNumber,
            tokenId: fill.tokenId.toString(),
            side: fill.side,
            maker: fill.maker,
            taker: fill.taker,
            makerAmount: fill.makerAmountFilled.toString(),
            takerAmount: fill.takerAmountFilled.toString(),
            fee: fill.fee.toString(),
            timeLoS,
            timeHiS,
            indexedMs,
          });
        }
      } else if (contract?.role === "ledger") {
        const resolution = decodeConditionResolution(log, address);
        if (resolution !== null) {
          handled = true;
          const denominator = resolution.payoutNumerators.reduce((sum, n) => sum + n, 0n);
          resolutions.push({
            chainId,
            ledger: address,
            conditionId: resolution.conditionId,
            kind: "ctf",
            payouts: resolution.payoutNumerators.map(String),
            denominator: denominator.toString(),
            oracle: resolution.oracle,
            questionId: resolution.questionId,
            block: resolution.blockNumber,
            txHash: resolution.transactionHash,
            logIndex: log.logIndex,
            timeLoS,
            timeHiS,
            indexedMs,
          });
        } else {
          const preparation = decodePreparation(log, address);
          if (preparation !== null) {
            handled = true;
            preparations.push({
              chainId,
              ledger: address,
              conditionId: preparation.conditionId,
              oracle: preparation.oracle,
              questionId: preparation.questionId,
              outcomeSlots: preparation.outcomeSlotCount,
              block: log.blockNumber,
              txHash: log.transactionHash,
              logIndex: log.logIndex,
              indexedMs,
            });
          }
        }
      } else if (contract?.role === "module") {
        const result = decodeModuleResolution(log, address);
        if (result !== null) {
          handled = true;
          resolutions.push({
            chainId,
            ledger: address,
            conditionId: result.conditionId,
            kind: "module",
            payouts: result.result.map(String),
            denominator: result.denominator.toString(),
            oracle: null,
            questionId: null,
            block: log.blockNumber,
            txHash: log.transactionHash,
            logIndex: log.logIndex,
            timeLoS,
            timeHiS,
            indexedMs,
          });
        }
      }
      if (!handled) undecoded += 1;
    }
    return { fills, resolutions, preparations, undecoded };
  }
}
