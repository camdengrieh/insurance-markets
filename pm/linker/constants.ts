// The linker job's own limits: its proposer handle, discovery budgets, schedule and file names. The
// scoring weights, thresholds and blocking limits are the SDK's (sdk/linker/constants.ts).

export const LINKER_VERSION = "linker-v1";
// The proposer handle recorded on every candidate. Looks like automation on purpose: the
// invariants refuse it as a reviewer, so the linker can never approve its own proposals.
export const LINKER_HANDLE = "stats-linker-v1";

export const MAX_PROPOSALS_PER_RUN = 500;

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
