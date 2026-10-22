import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS, type ReadService } from "../origins.js";
import { LIST_STATUSES, MAX_TAKE, type ListStatus } from "./api/client.js";

// Absolute upstream URLs, built here and nowhere else in the XO adapter. The adapter never touches a global
// fetch: the host's injected fetch (the app's, app/src/core) sends a Data API URL straight to the host in the
// standalone build and maps both hosts onto the daemon's read proxy in the Cockpit build. The two origins come
// from the venue host registry (sdk/venues/origins.ts: xo_data and xo_orderbook); a test pins them.
function originOf(service: ReadService): string {
  const entry = [...BROWSER_DIRECT_ORIGINS, ...DAEMON_ONLY_ORIGINS].find((candidate) => candidate.service === service);
  if (entry === undefined) throw new Error(`no origin is registered for ${service}`);
  return entry.origin;
}

export const XO_DATA_ORIGIN = originOf("xo_data");
export const XO_ORDERBOOK_ORIGIN = originOf("xo_orderbook");
const DATA_BASE = `${XO_DATA_ORIGIN}/api`;

export const XO_CONDITION_ID = /^0x[0-9a-f]{64}$/;
// ERC-1155 position ids are U256 decimals.
export const XO_TOKEN_ID = /^[1-9][0-9]{0,77}$/;
const MAX_SEARCH_CHARS = 100;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export interface ListQuery {
  readonly statuses: readonly ListStatus[];
  readonly take: number;
  readonly page: number;
  readonly search?: string;
}

// Discovery is always marketType=2,4 (CLOB and Conviction): the default scope returns only the 9-row legacy AMM
// slice and the Pulse rounds flood the catalogue (docs/research/02). `take` is at most 50 and paging trusts
// meta.hasNextPage only.
export function listUrl(query: ListQuery): string {
  if (query.statuses.length === 0) throw new RangeError("statuses must not be empty");
  for (const status of query.statuses) {
    if (!(LIST_STATUSES as readonly string[]).includes(status)) throw new RangeError("unsupported status");
  }
  if (!Number.isInteger(query.take) || query.take < 1 || query.take > MAX_TAKE) throw new RangeError("take out of range");
  if (!Number.isInteger(query.page) || query.page < 1 || query.page > 10_000) throw new RangeError("page out of range");
  const params = new URLSearchParams();
  params.set("marketType", "2,4");
  params.set("statuses", [...new Set(query.statuses)].join(","));
  params.set("take", String(query.take));
  params.set("page", String(query.page));
  if (query.search !== undefined) {
    const search = query.search.trim();
    if (search.length === 0 || search.length > MAX_SEARCH_CHARS || CONTROL_CHARS.test(search)) throw new RangeError("search out of range");
    params.set("search", search);
  }
  return `${DATA_BASE}/markets?${params.toString()}`;
}

export function detailUrl(conditionId: string): string {
  if (!XO_CONDITION_ID.test(conditionId)) throw new RangeError("conditionId must be 0x and 64 lowercase hex digits");
  return `${DATA_BASE}/markets/contract/${conditionId}`;
}

// Orderbook routes: reachable only through the Cockpit's read proxy (no allow-origin for a browser origin).
export function bookUrl(tokenId: string): string {
  if (!XO_TOKEN_ID.test(tokenId)) throw new RangeError("tokenId must be a decimal string");
  return `${XO_ORDERBOOK_ORIGIN}/book?token_id=${tokenId}`;
}

export function feeRateUrl(tokenId: string): string {
  if (!XO_TOKEN_ID.test(tokenId)) throw new RangeError("tokenId must be a decimal string");
  return `${XO_ORDERBOOK_ORIGIN}/fee-rate?token_id=${tokenId}`;
}

export function tradingStateUrl(): string {
  return `${XO_ORDERBOOK_ORIGIN}/trading-state`;
}
