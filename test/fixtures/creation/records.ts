// The recorded history of the 585 Conviction markets of research note 23, one row per market
// (conviction_outcomes.csv, anonymised: creators are c001 and so on, markets are the first 12 hex digits of
// their condition id). Used to replay the review loop on real timelines.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FIXTURE_DIR } from "./corpus.js";

// A small CSV reader for the one file we read (no quoted commas appear in it).
export function parseCsv(text: string): Record<string, string>[] {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const keys = (head ?? "").split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(keys.map((key, index) => [key, cells[index] ?? ""]));
  });
}

export interface OutcomeRow {
  readonly cond12: string;
  readonly createdAtS: number;
  readonly creator: string;
  readonly horizonDays: number;
  readonly firstReview: "APPROVE" | "UPDATE_REQUIRED" | "REJECT" | "NONE";
  readonly reviewLatencyS: number | null;
  readonly notesRegime: string;
  readonly ownerResponse: "accepted" | "declined" | null;
  readonly responseLatencyS: number | null;
  readonly suggestionWindowH: number | null;
  readonly ownerCancelledAfterS: number | null;
  readonly creationToActiveS: number | null;
  readonly final: "ACTIVE" | "CANCELLED";
}

const number = (text: string | undefined): number | null => (text === undefined || text === "" ? null : Number(text));

export function loadOutcomeRows(): OutcomeRow[] {
  return parseCsv(readFileSync(join(FIXTURE_DIR, "conviction_outcomes.csv"), "utf8")).map((row) => ({
    cond12: row["cond12"] as string,
    createdAtS: Date.parse(row["created_utc"] as string) / 1000,
    creator: row["creator"] as string,
    horizonDays: Number(row["horizon_days"]),
    firstReview: row["first_review"] as OutcomeRow["firstReview"],
    reviewLatencyS: number(row["review_latency_s"]),
    notesRegime: row["notes_regime"] as string,
    ownerResponse: row["owner_response"] === "" ? null : (row["owner_response"] as "accepted" | "declined"),
    responseLatencyS: number(row["response_latency_s"]),
    suggestionWindowH: number(row["suggestion_window_h"]),
    ownerCancelledAfterS: number(row["owner_cancelled_after_s"]),
    creationToActiveS: number(row["creation_to_active_s"]),
    final: row["final"] as OutcomeRow["final"],
  }));
}
