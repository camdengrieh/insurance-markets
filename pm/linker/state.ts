// The small resumable state in --out: per-market features (hashes, timestamps, category; never
// text) and the last run summaries. Every writer asserts the venue allowlist first, so a Kalshi
// or Quotient key can never reach this file (pm/test/linker/state.test.ts proves it).

import { existsSync, readFileSync } from "node:fs";
import type { MarketFeatures } from "../../sdk/linker/features.js";
import { canonicalPretty } from "../../sdk/hash.js";
import { writeAtomic } from "../recorder/discover.js";
import { isRecord } from "../recorder/venues/common.js";
import { assertPersistable, isLinkerVenue } from "./allowlist.js";
import { MAX_RUNS_KEPT } from "./constants.js";

export const STATE_FORMAT = "pm-linker-state";

export interface StoredMarket extends MarketFeatures {
  // When the market was last seen open (UTC stamp) and when its rule text was last read.
  readonly seenAt: string;
  readonly detailAt: string;
}

export interface RunSummary {
  readonly at: string;
  readonly command: string;
  readonly requests: number;
  readonly markets: number;
  readonly pairs: number;
  readonly proposed: number;
  readonly existing: number;
  readonly refused: number;
  readonly vetoed: number;
  readonly suspended: number;
  readonly bundleChanged: boolean;
  readonly manifestSha256: string | null;
}

export interface LinkerState {
  readonly format: typeof STATE_FORMAT;
  readonly version: 1;
  readonly restrictedData: "ids-and-hashes-only";
  readonly markets: Readonly<Record<string, StoredMarket>>;
  readonly runs: readonly RunSummary[];
}

export function emptyState(): LinkerState {
  return { format: STATE_FORMAT, version: 1, restrictedData: "ids-and-hashes-only", markets: {}, runs: [] };
}

const HEX64 = /^[0-9a-f]{64}$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function strings(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
}

// Lenient reader: an unreadable or foreign file is an empty state (the next run rebuilds it),
// never a crash. Rows for venues outside the allowlist are dropped on read as well.
export function parseState(raw: unknown): LinkerState {
  if (!isRecord(raw) || raw["format"] !== STATE_FORMAT || raw["version"] !== 1 || !isRecord(raw["markets"])) return emptyState();
  const markets: Record<string, StoredMarket> = {};
  for (const [key, v] of Object.entries(raw["markets"])) {
    if (!isRecord(v) || typeof v["venue"] !== "string" || !isLinkerVenue(v["venue"]) || typeof v["marketId"] !== "string") continue;
    if (key !== `${v["venue"]}:${v["marketId"]}`) continue;
    const titleTokens = strings(v["titleTokens"]);
    const ruleTokens = strings(v["ruleTokens"]);
    const numbers = strings(v["numbers"]);
    const dates = strings(v["dates"]);
    const entities = strings(v["entities"]);
    if (titleTokens === null || ruleTokens === null || numbers === null || dates === null || entities === null) continue;
    if (typeof v["rulesSha256"] !== "string" || !HEX64.test(v["rulesSha256"]) || typeof v["maskedSha256"] !== "string" || !HEX64.test(v["maskedSha256"])) continue;
    if (typeof v["closeUtc"] !== "string" || !STAMP.test(v["closeUtc"]) || typeof v["seenAt"] !== "string" || !STAMP.test(v["seenAt"]) || typeof v["detailAt"] !== "string" || !STAMP.test(v["detailAt"])) continue;
    const conf = v["categoryConfidence"];
    if (conf !== "native" && conf !== "keyword" && conf !== "none") continue;
    const voidPolicy = v["voidPolicy"];
    if (typeof voidPolicy !== "string") continue;
    const groupKind = v["groupKind"];
    markets[key] = {
      venue: v["venue"],
      marketId: v["marketId"],
      titleTokens,
      ruleTokens,
      numbers,
      dates,
      entities,
      rulesSha256: v["rulesSha256"],
      maskedSha256: v["maskedSha256"],
      closeUtc: v["closeUtc"],
      category: typeof v["category"] === "string" ? v["category"] : "other",
      categoryConfidence: conf,
      voidPolicy: voidPolicy as StoredMarket["voidPolicy"],
      resolverId: typeof v["resolverId"] === "string" ? v["resolverId"] : null,
      groupKey: typeof v["groupKey"] === "string" ? v["groupKey"] : null,
      groupKind: groupKind === "neg_risk" || groupKind === "event" ? groupKind : null,
      outcomes: typeof v["outcomes"] === "number" && Number.isSafeInteger(v["outcomes"]) ? v["outcomes"] : 0,
      seenAt: v["seenAt"],
      detailAt: v["detailAt"],
    };
  }
  const runs = Array.isArray(raw["runs"]) ? (raw["runs"].filter(isRecord) as unknown as RunSummary[]).slice(-MAX_RUNS_KEPT) : [];
  return { format: STATE_FORMAT, version: 1, restrictedData: "ids-and-hashes-only", markets, runs };
}

export function readState(path: string): LinkerState {
  if (!existsSync(path)) return emptyState();
  try {
    return parseState(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch {
    return emptyState();
  }
}

// The single gate between the linker and the state file. Throws before writing anything when a
// market of a venue outside the allowlist is present.
export function serializeState(state: LinkerState): string {
  for (const [key, m] of Object.entries(state.markets)) {
    assertPersistable(m.venue);
    if (key !== `${m.venue}:${m.marketId}`) throw new Error("state key does not match its market");
  }
  const sorted: Record<string, StoredMarket> = {};
  for (const key of Object.keys(state.markets).sort()) sorted[key] = state.markets[key] as StoredMarket;
  return `${canonicalPretty({ ...state, markets: sorted, runs: state.runs.slice(-MAX_RUNS_KEPT) })}\n`;
}

export function writeState(path: string, state: LinkerState): void {
  writeAtomic(path, serializeState(state));
}
