// The block explorer (explorer-mainnet.xo.market, Blockscout): the keyless fallback reader for chain logs.
//
// Behaviours reproduced (docs/research/19 V2.1, 20 sec 1, 21 sec 6 and V1.16, V4.3-4, 22):
//   - GET /api?module=logs&action=getLogs with topic0..3 and topicI_J_opr; a topic filter at index 1 to 3 is
//     applied only when an opr parameter connects it to an earlier topic, otherwise the explorer IGNORES it
//     (so a client that omits the opr parameters gets unrelated rows and must re-check them)
//   - a hard cap of 1,000 rows per answer, and `page` / `offset` are ignored: asking for page 2 returns the
//     same rows. Which rows survive the cap is unknown (capMode picks earliest, latest or scattered)
//   - a range that is too wide never answers (the real explorer times out): spanLimitBlocks
//   - lists include mempool rows: null block_number, null status (/api/v2/addresses/<a>/transactions)
//   - is_contract and the smart-contracts endpoint are filled LAZILY: a deployed account can answer
//     is_contract false and 404 for minutes, so neither is a deployment test
//
// Basis: the getLogs envelope, row fields and the 1,000-row cap are recorded in the research scripts; the
// Blockscout v2 bodies are modelled on the fields the research and the capture script read (M). Logs come
// from the anvil chain; syntheticLogs are rows that exist only in the explorer's index.

import { getAddress } from "viem";

import { OPERATING_LIMITS } from "../../src/xo/chain/constants.js";
import { iso } from "./catalog.js";
import type { MockEnv } from "./env.js";
import type { MockListener, MockReply, MockRequest } from "./listener.js";

export type CapMode = "earliest" | "latest" | "scattered";

// A log that exists only in the explorer's index (not on the chain). blockNumber null is a pending row.
export interface LogSeed {
  readonly address: string;
  // 1 to 4 topics.
  readonly topics: readonly string[];
  readonly data: string;
  readonly blockNumber: number | null;
  readonly logIndex: number;
  readonly transactionHash: string;
  // Unix seconds. Defaults to the mock clock.
  readonly timestamp?: number;
}

export interface PendingTransaction {
  readonly hash: string;
  readonly from: string;
  readonly to: string;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TOPIC = /^0x[0-9a-fA-F]{64}$/;
const hex = (value: number | bigint): string => `0x${value.toString(16)}`;

export class ExplorerState {
  rowCap: number = OPERATING_LIMITS.explorerLogRowCap;
  capMode: CapMode = "earliest";
  // A getLogs range wider than this many blocks never answers. Infinity (the default) turns it off.
  spanLimitBlocks = Number.POSITIVE_INFINITY;
  // Rows carry address "" when the query names an address (the column fills lazily on the real explorer).
  blankLogAddresses = false;
  readonly syntheticLogs: LogSeed[] = [];
  // Pending rows (blockNumber null) that getLogs itself returns. The real getLogs is not known to do this;
  // the reader drops such rows defensively, and this knob lets a test prove it does.
  readonly pendingLogRows: LogSeed[] = [];
  readonly pendingTransactions: PendingTransaction[] = [];
  // Seconds after the first lookup of an address until is_contract and the smart-contracts endpoint report
  // its code. 0 fills at once.
  fillDelaySeconds = 300;
  // Lower-case addresses that never fill ("three recent accounts stayed 404 on repeated queries").
  readonly neverFill = new Set<string>();
  private readonly firstLook = new Map<string, number>();

  // Records a lookup and says whether the address's fields are filled by now.
  look(address: string, nowSeconds: number): boolean {
    const key = address.toLowerCase();
    if (this.neverFill.has(key)) {
      if (!this.firstLook.has(key)) this.firstLook.set(key, nowSeconds);
      return false;
    }
    const first = this.firstLook.get(key) ?? nowSeconds;
    if (!this.firstLook.has(key)) this.firstLook.set(key, first);
    return nowSeconds - first >= this.fillDelaySeconds;
  }
}

interface Row {
  address: string;
  blockNumber: string | null;
  data: string;
  gasPrice: string;
  gasUsed: string;
  logIndex: string;
  timeStamp: string | null;
  topics: (string | null)[];
  transactionHash: string;
  transactionIndex: string;
}

interface Candidate {
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
  readonly block: number | null;
  readonly logIndex: number;
  readonly transactionHash: string;
  readonly transactionIndex: number;
  readonly timestamp: number | null;
}

const envelope = (status: "0" | "1", message: string, result: unknown): MockReply => ({ status: 200, json: { status, message, result } });

// topic1..3 apply only when an opr parameter links them to an earlier topic; this explorer ignores the others.
// Only "and" is built (the project's reads use nothing else); any other opr value is refused before this runs.
function matchesTopics(topics: readonly string[], wanted: ReadonlyMap<number, string>, query: URLSearchParams): boolean {
  const first = wanted.get(0);
  if (first !== undefined && topics[0]?.toLowerCase() !== first) return false;
  const indexes = [...wanted.keys()].sort((a, b) => a - b);
  for (const index of indexes) {
    if (index === 0) continue;
    const linked = indexes.some((earlier) => earlier < index && query.get(`topic${String(earlier)}_${String(index)}_opr`) !== null);
    // No opr links this topic to an earlier one: the explorer ignores the filter.
    if (!linked) continue;
    if (topics[index]?.toLowerCase() !== wanted.get(index)) return false;
  }
  return true;
}

function capRows<T>(rows: readonly T[], cap: number, mode: CapMode): T[] {
  if (rows.length <= cap) return [...rows];
  if (mode === "earliest") return rows.slice(0, cap);
  if (mode === "latest") return rows.slice(rows.length - cap);
  const picked: T[] = [];
  for (let i = 0; i < cap; i += 1) picked.push(rows[Math.floor((i * rows.length) / cap)] as T);
  return picked;
}

export function registerExplorer(listener: MockListener, env: MockEnv, explorer: ExplorerState): void {
  const { clock, chains } = env;

  // ---- /api (etherscan-style) ------------------------------------------------------------------------------------------

  listener.route("GET", "/api", async (request) => {
    const moduleName = request.query.get("module");
    if (moduleName !== "logs") return envelope("0", "Unknown module", null);
    if (request.query.get("action") !== "getLogs") return envelope("0", "Unknown action", null);
    return getLogs(request);
  });

  // The chain head, or null when the mock has no chain.
  async function headNumber(): Promise<number | null> {
    if (chains.xo === undefined) return null;
    return Number(BigInt(await chains.call<string>("xo", "eth_blockNumber")));
  }

  // "latest" for the explorer's index: the chain head, or a later block that only synthetic rows reach.
  async function latestBlock(): Promise<number> {
    const head = (await headNumber()) ?? 0;
    return explorer.syntheticLogs.reduce((highest, seed) => Math.max(highest, seed.blockNumber ?? 0), head);
  }

  function blockParam(request: MockRequest, name: "fromBlock" | "toBlock", fallback: number | "latest"): number | "latest" | null {
    const raw = request.query.get(name);
    if (raw === null) return fallback;
    if (raw === "latest") return "latest";
    return /^[0-9]{1,12}$/.test(raw) ? Number(raw) : null;
  }

  async function getLogs(request: MockRequest): Promise<MockReply> {
    const fromParam = blockParam(request, "fromBlock", 0);
    const toParam = blockParam(request, "toBlock", "latest");
    if (fromParam === null || fromParam === "latest") return envelope("0", "Invalid fromBlock", null);
    if (toParam === null) return envelope("0", "Invalid toBlock", null);
    const addressParam = request.query.get("address");
    if (addressParam !== null && !ADDRESS.test(addressParam)) return envelope("0", "Invalid address format", null);
    for (const [key, value] of request.query) {
      if (/^topic[0-3]_[0-3]_opr$/.test(key) && value !== "and") return envelope("0", `Unsupported ${key} (the mock builds and)`, null);
    }
    const wanted = new Map<number, string>();
    for (let index = 0; index < 4; index += 1) {
      const raw = request.query.get(`topic${String(index)}`);
      if (raw === null) continue;
      if (!TOPIC.test(raw)) return envelope("0", `Invalid topic${String(index)} format`, null);
      wanted.set(index, raw.toLowerCase());
    }

    const head = await headNumber();
    const latest = await latestBlock();
    const to = toParam === "latest" ? latest : toParam;
    if (Number.isFinite(explorer.spanLimitBlocks) && to - fromParam > explorer.spanLimitBlocks) return { status: 200, hang: true };

    const candidates: Candidate[] = [];
    if (head !== null && fromParam <= Math.min(to, head)) {
      const filter: Record<string, unknown> = { fromBlock: hex(fromParam), toBlock: hex(Math.min(to, head)) };
      if (addressParam !== null) filter["address"] = addressParam.toLowerCase();
      const first = wanted.get(0);
      if (first !== undefined) filter["topics"] = [first];
      const logs = await chains.call<ChainLog[]>("xo", "eth_getLogs", [filter]);
      const stamps = new Map<number, number>();
      for (const log of logs) {
        const block = Number(BigInt(log.blockNumber));
        if (!stamps.has(block)) {
          const header = await chains.call<{ timestamp: string }>("xo", "eth_getBlockByNumber", [log.blockNumber, false]);
          stamps.set(block, Number(BigInt(header.timestamp)));
        }
        candidates.push({
          address: log.address,
          topics: log.topics,
          data: log.data,
          block,
          logIndex: Number(BigInt(log.logIndex)),
          transactionHash: log.transactionHash,
          transactionIndex: Number(BigInt(log.transactionIndex)),
          timestamp: stamps.get(block) ?? null,
        });
      }
    }
    for (const seed of explorer.syntheticLogs) {
      if (seed.blockNumber === null || seed.blockNumber < fromParam || seed.blockNumber > to) continue;
      candidates.push(fromSeed(seed));
    }

    const accept = (candidate: Candidate): boolean =>
      (addressParam === null || candidate.address.toLowerCase() === addressParam.toLowerCase()) && matchesTopics(candidate.topics, wanted, request.query);
    const confirmed = candidates.filter(accept).sort((a, b) => (a.block as number) - (b.block as number) || a.logIndex - b.logIndex);
    const pending = explorer.pendingLogRows.map(fromSeed).filter(accept);
    const rows = capRows([...confirmed, ...pending], explorer.rowCap, explorer.capMode);
    if (rows.length === 0) return envelope("0", "No logs found", []);
    const blank = explorer.blankLogAddresses && addressParam !== null;
    return envelope(
      "1",
      "OK",
      rows.map((candidate) => toRow(candidate, blank)),
    );
  }

  function fromSeed(seed: LogSeed): Candidate {
    return {
      address: seed.address,
      topics: seed.topics,
      data: seed.data,
      block: seed.blockNumber,
      logIndex: seed.logIndex,
      transactionHash: seed.transactionHash,
      transactionIndex: 0,
      timestamp: seed.blockNumber === null ? null : (seed.timestamp ?? clock.nowSeconds()),
    };
  }

  function toRow(candidate: Candidate, blank: boolean): Row {
    const topics: (string | null)[] = [...candidate.topics];
    while (topics.length < 4) topics.push(null);
    return {
      address: blank ? "" : candidate.address.toLowerCase(),
      blockNumber: candidate.block === null ? null : hex(candidate.block),
      data: candidate.data,
      gasPrice: "0x0",
      gasUsed: "0x0",
      logIndex: hex(candidate.logIndex),
      timeStamp: candidate.timestamp === null ? null : hex(candidate.timestamp),
      topics,
      transactionHash: candidate.transactionHash,
      transactionIndex: hex(candidate.transactionIndex),
    };
  }

  // ---- /api/v2 (Blockscout REST) -----------------------------------------------------------------------------------------

  const invalidAddress = (): MockReply => ({
    status: 422,
    json: { errors: [{ detail: "Invalid format. Expected ~r/^0x([A-Fa-f0-9]{40})$/", source: { pointer: "/address_hash_param" }, title: "Invalid value" }] },
  });
  const notFound = (): MockReply => ({ status: 404, json: { message: "Not found" } });

  async function codeOf(address: string): Promise<string> {
    if (chains.xo === undefined) return "0x";
    return chains.call<string>("xo", "eth_getCode", [address.toLowerCase(), "latest"]);
  }

  // is_contract is false until the address's fields fill; for an address that really has code that is the
  // lazy-fill window, and a false value proves nothing.
  listener.route("GET", "/api/v2/addresses/:addr", async (request) => {
    const address = request.params["addr"] ?? "";
    if (!ADDRESS.test(address)) return invalidAddress();
    const filled = explorer.look(address, clock.nowSeconds());
    const code = await codeOf(address);
    const balance = chains.xo === undefined ? "0" : BigInt(await chains.call<string>("xo", "eth_getBalance", [address.toLowerCase(), "latest"])).toString();
    return {
      status: 200,
      json: {
        hash: getAddress(address.toLowerCase()),
        is_contract: filled && code !== "0x",
        is_verified: null,
        name: null,
        creator_address_hash: null,
        creation_transaction_hash: null,
        coin_balance: balance,
        implementations: [],
      },
    };
  });

  // 404 until the code is filled. The capture script of test/fixtures/bytecode reads deployed_bytecode.
  listener.route("GET", "/api/v2/smart-contracts/:addr", async (request) => {
    const address = request.params["addr"] ?? "";
    if (!ADDRESS.test(address)) return invalidAddress();
    const filled = explorer.look(address, clock.nowSeconds());
    const code = await codeOf(address);
    if (!filled || code === "0x") return notFound();
    return {
      status: 200,
      json: { address: { hash: getAddress(address.toLowerCase()), is_contract: true }, deployed_bytecode: code, is_verified: false, name: null, proxy_type: null, implementations: [] },
    };
  });

  // Pending bundle transactions come first, with null block_number and null status, then confirmed ones,
  // newest first. A client that reads this feed must drop rows whose block_number is null.
  listener.route("GET", "/api/v2/addresses/:addr/transactions", async (request) => {
    const address = request.params["addr"] ?? "";
    if (!ADDRESS.test(address)) return invalidAddress();
    const filter = request.query.get("filter");
    if (filter !== null && filter !== "to" && filter !== "from") return { status: 422, json: { errors: [{ detail: "Invalid filter", title: "Invalid value" }] } };
    const lower = address.toLowerCase();
    const matches = (from: string, toAddress: string | null): boolean =>
      filter === "to" ? toAddress?.toLowerCase() === lower : filter === "from" ? from.toLowerCase() === lower : from.toLowerCase() === lower || toAddress?.toLowerCase() === lower;
    const items: unknown[] = [];
    for (const pending of explorer.pendingTransactions) {
      if (!matches(pending.from, pending.to)) continue;
      items.push({
        hash: pending.hash,
        block_number: null,
        status: null,
        result: "pending",
        timestamp: null,
        from: { hash: pending.from },
        to: { hash: pending.to },
      });
    }
    items.push(...(await confirmedTransactions(matches)));
    return { status: 200, json: { items: items.slice(0, 50), next_page_params: null } };
  });

  async function confirmedTransactions(matches: (from: string, to: string | null) => boolean): Promise<unknown[]> {
    const head = await headNumber();
    if (head === null) return [];
    const out: unknown[] = [];
    for (let number = head; number >= Math.max(0, head - 255) && out.length < 50; number -= 1) {
      const block = await chains.call<BlockWithTransactions | null>("xo", "eth_getBlockByNumber", [hex(number), true]);
      if (block === null) continue;
      for (const tx of [...block.transactions].reverse()) {
        if (!matches(tx.from, tx.to)) continue;
        const receipt = await chains.call<{ status: string } | null>("xo", "eth_getTransactionReceipt", [tx.hash]);
        out.push({
          hash: tx.hash,
          block_number: number,
          status: receipt?.status === "0x1" ? "ok" : "error",
          result: receipt?.status === "0x1" ? "success" : "error",
          timestamp: iso(Number(BigInt(block.timestamp)) * 1000),
          from: { hash: tx.from },
          to: tx.to === null ? null : { hash: tx.to },
        });
      }
    }
    return out;
  }

  listener.fallback(() => notFound());
}

interface ChainLog {
  readonly address: string;
  readonly topics: string[];
  readonly data: string;
  readonly blockNumber: string;
  readonly logIndex: string;
  readonly transactionHash: string;
  readonly transactionIndex: string;
}

interface BlockWithTransactions {
  readonly timestamp: string;
  readonly transactions: readonly { readonly hash: string; readonly from: string; readonly to: string | null }[];
}
