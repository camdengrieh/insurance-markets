// Every threshold, weight and limit of the linker's scoring in one place (docs/linker-runbook.md "Scoring").
// Discovery, scheduling and file names are the job's own (pm/linker/constants.ts).
// Scores are integer basis points (0..10000); nothing here is a float applied to money.

import { DATASET_BANDS, type DatasetBand } from "../links/dataset.js";

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
// The words of the published dataset (sdk/links/dataset.ts).
export const BANDS = DATASET_BANDS;
export type Band = DatasetBand;

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

// ---- text features ----
export const MIN_TOKEN_CHARS = 2;
export const TOKEN_HASH_CHARS = 12;
export const STOPWORDS: ReadonlySet<string> = new Set([
  "a", "an", "and", "as", "at", "be", "by", "for", "from", "has", "have", "if", "in", "is", "it", "its", "of", "on", "or",
  "that", "the", "this", "to", "will", "with", "yes", "no", "market", "resolve", "resolves", "resolved", "resolution",
  "otherwise", "than", "then", "are", "was", "were", "any", "all", "not", "but", "can", "into", "per", "via", "which",
  "who", "whom", "when", "where", "after", "before", "between", "during", "until", "upon", "within",
]);
