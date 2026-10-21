// Every threshold, weight and limit of the linker in one place (docs/linker-runbook.md "Scoring").
// Scores are integer basis points (0..10000); nothing here is a float applied to money.

export const LINKER_VERSION = "linker-v1";
// The proposer handle recorded on every candidate. Looks like automation on purpose: the
// invariants refuse it as a reviewer, so the linker can never approve its own proposals.
export const LINKER_HANDLE = "stats-linker-v1";

// ---- scoring weights (sum to 100) ----
export const WEIGHTS = Object.freeze({
  title: 35,
  rules: 20,
  numbers: 15,
  dates: 10,
  entities: 10,
  close: 10,
});
export const WEIGHT_SUM = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

// Agreement score for a feature set that is empty on both sides (neutral) or on one side only.
export const AGREEMENT_BOTH_EMPTY_BPS = 5000;
export const AGREEMENT_ONE_EMPTY_BPS = 2500;

// Close-time proximity: full marks within NEAR_CLOSE_MINUTES, zero at CLOSE_WINDOW_MINUTES.
export const NEAR_CLOSE_MINUTES = 60;
export const CLOSE_WINDOW_MINUTES = 7 * 24 * 60;

// ---- thresholds ----
// A pair below CANDIDATE_MIN_BPS is never proposed. Bands are words for the reader, not labels.
export const CANDIDATE_MIN_BPS = 6000;
export const BAND_GOOD_BPS = 7000;
export const BAND_STRONG_BPS = 8500;
export const BANDS = ["strong", "good", "weak"] as const;
export type Band = (typeof BANDS)[number];

// Hard vetoes (a pair that trips one is reported and never proposed):
//   number_disagreement: both sides name numbers and share none of them.
//   date_disagreement:   both sides name dates, share none, and close more than this far apart.
export const DATE_VETO_CLOSE_DELTA_MINUTES = 2 * 24 * 60;

// A minor timing axis up to this gap; major beyond it (pm/signals/join.ts uses the same 24 h line).
export const MINOR_TIMING_MINUTES = 24 * 60;

// ---- blocking ----
// Block = category + close-time bucket. Pairs are drawn inside a bucket and with the next bucket,
// so two markets closing on either side of a bucket edge are still compared.
export const BLOCK_BUCKET_MINUTES = 7 * 24 * 60;
// A block larger than this is truncated to its first MAX_BLOCK_SIZE markets by id, and the report says so.
export const MAX_BLOCK_SIZE = 400;
export const MAX_PAIRS_PER_RUN = 250_000;
export const MAX_PROPOSALS_PER_RUN = 500;

// ---- text features ----
export const MIN_TOKEN_CHARS = 2;
export const TOKEN_HASH_CHARS = 12;
export const STOPWORDS: ReadonlySet<string> = new Set([
  "a", "an", "and", "as", "at", "be", "by", "for", "from", "has", "have", "if", "in", "is", "it", "its", "of", "on", "or",
  "that", "the", "this", "to", "will", "with", "yes", "no", "market", "resolve", "resolves", "resolved", "resolution",
  "otherwise", "than", "then", "are", "was", "were", "any", "all", "not", "but", "can", "into", "per", "via", "which",
  "who", "whom", "when", "where", "after", "before", "between", "during", "until", "upon", "within",
]);

// ---- discovery ----
export const XO_LIST_PAGES = 10; // take 50 each
export const XO_LIST_TAKE = 50;
export const POLY_PAGES = 10; // keyset pages of 100
export const POLY_PAGE_SIZE = 100;
export const LIMITLESS_PAGES = 10; // 25 per page is the route's maximum
export const LIMITLESS_PAGE_SIZE = 25;
// XO list rows carry no rules; each market needs one detail read. Capped per run and refreshed
// after DETAIL_REFRESH_MS so a 2-hour cadence stays far inside the host budget.
export const MAX_DETAIL_REQUESTS_PER_RUN = 300;
export const DETAIL_REFRESH_MS = 6 * 3600_000;
// Markets closing within this are skipped: a link needs time to be reviewed before it expires.
export const MIN_TIME_TO_CLOSE_MS = 2 * 3600_000;

// ---- scheduling ----
export const DEFAULT_INTERVAL_MS = 2 * 3600_000;
export const MIN_INTERVAL_MS = 15 * 60_000;
export const MAX_INTERVAL_MS = 7 * 24 * 3600_000;

// ---- files in --out ----
export const STATE_FILE = "linker-state.json";
export const BUNDLE_FILE = "candidates.bundle.json";
export const PIN_FILE = "candidates.bundle.pin";
export const GROUPS_FILE = "structure-groups.json";
export const LOCK_NAME = "linker";
export const MAX_RUNS_KEPT = 12;
