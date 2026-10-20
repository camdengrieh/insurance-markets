// Shared recorder types. Money-like values are decimal strings; nothing here is a float price.

import type { RecVenue } from "./allowlist.js";

// One GET request. The client has no method parameter: the recorder can only read.
export interface RequestSpec {
  readonly host: string;
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly purpose: "resolve" | "book";
}

export function urlOf(spec: RequestSpec, base?: string): string {
  const q = spec.query === undefined ? "" : Object.entries(spec.query).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const search = q === "" || q.length === 0 ? "" : `?${new URLSearchParams(q as [string, string][]).toString()}`;
  return `${base ?? `https://${spec.host}`}${spec.path}${search}`;
}

export const MARKET_STATUSES = ["active", "pending", "paused", "expired", "closed", "resolved", "unknown"] as const;
export type MarketStatusCode = (typeof MARKET_STATUSES)[number];

// Fee facts exactly as the venue states them, as strings. `model` is our own label.
export interface FeeRecord {
  readonly model: "xo_effective" | "polymarket_schedule" | "limitless_flag" | "unknown";
  readonly params: Readonly<Record<string, string>>;
}

export interface ResolvedMarket {
  // Token of the outcome at index 0 (the YES slot).
  readonly tokenId: string;
  readonly status: MarketStatusCode;
  readonly closeMs: number | null;
  readonly accepting: boolean | null;
  readonly tick: string | null;
  readonly fee: FeeRecord;
}

export type BookLevelPair = readonly [price: string, size: string];

export const BOOK_FLAGS = [
  "crossed",
  "empty_bids",
  "empty_asks",
  "unsorted_input",
  "bad_level",
  "duplicate_price",
  "truncated",
] as const;
export type BookFlag = (typeof BOOK_FLAGS)[number];

export interface SnapshotRow {
  readonly targetKey: string;
  readonly venue: RecVenue;
  readonly marketId: string;
  readonly tokenId: string;
  readonly observedMs: number;
  readonly reqStartMs: number;
  readonly venueTsMs: number | null;
  readonly bookHash: string | null;
  readonly bids: readonly BookLevelPair[];
  readonly asks: readonly BookLevelPair[];
  readonly nBids: number;
  readonly nAsks: number;
  readonly bestBid: string | null;
  readonly bestAsk: string | null;
  readonly flags: readonly BookFlag[];
  readonly tick: string | null;
}

export interface MarketStateRow {
  readonly targetKey: string;
  readonly venue: RecVenue;
  readonly marketId: string;
  readonly observedMs: number;
  readonly tokenId: string | null;
  readonly status: MarketStatusCode;
  readonly closeMs: number | null;
  readonly accepting: boolean | null;
  readonly tick: string | null;
  readonly fee: FeeRecord;
}

export type EventKind =
  | "start"
  | "stop"
  | "unclean_previous_run"
  | "error"
  | "backoff"
  | "breaker_open"
  | "skew"
  | "gap"
  | "budget"
  | "refused"
  | "prune"
  | "disk_cap"
  | "clock_regress"
  | "retired"
  | "parse_error"
  | "resolve_failed"
  | "book_failed"
  | "targets";

export interface Target {
  readonly key: string;
  readonly venue: RecVenue;
  readonly marketId: string;
  // Close time pinned in a link leg, used only when the venue reports none.
  readonly closeHintMs: number | null;
}

export interface TargetLink {
  readonly linkId: string;
  readonly relation: string;
  readonly state: string;
  readonly basisClass: string;
  readonly exhaustiveness: string | null;
  readonly legs: readonly { readonly targetKey: string; readonly flip: boolean; readonly closeMs: number | null }[];
}

export interface TargetGroup {
  readonly groupId: string;
  readonly venue: RecVenue;
  readonly exhaustive: "proven" | "by_rule" | "no" | "unknown";
  readonly members: readonly string[];
}

export interface TargetSet {
  readonly targets: readonly Target[];
  readonly links: readonly TargetLink[];
  readonly groups: readonly TargetGroup[];
  // Counts only; no ids of refused markets are kept.
  readonly skipped: { readonly linksWithRefusedLeg: number; readonly invalidIds: number; readonly inactiveLinks: number };
}

export const TOOL_VERSION = "0.1.0";
