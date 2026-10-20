// Strict zod output schemas for the pm_* tools (inputs live next to the data functions in pm/ops,
// pm/registry and pm/signals). Roots are strict objects. The headline fields of every tool are typed
// exactly; large nested records whose shape is owned by the data layer (link items, comparison
// books, signal rows) are open records, because those types are the contract and the tests
// validate real outputs against these schemas. Market text can only appear in the fixed
// untrusted slot (untrustedContentSchema); a test scans every output for that.

import * as z from "zod/v4";
import { untrustedContentSchema } from "../../src/guardrails/untrusted.js";
import { structureOutputSchema } from "../ops/structure-schema.js";

const decimal = z.string();
// A nested record whose fields the data layer owns. Values are plain JSON.
export const openRecord = z.record(z.string(), z.unknown());

const common = {
  pmNotice: z.string().describe("Fixed reminder: read-only alert layer, no guaranteed profit, restricted data is memory-only."),
  fetchedAt: z.string().describe("ISO 8601 time of this call (the injected clock)."),
};

const dataTerms = z
  .strictObject({
    memoryOnly: z.boolean().describe("True for restricted or unknown terms: keep in memory only."),
    clause: z.string(),
    reason: z.enum(["restricted", "unknown_terms", "stale_terms", "none_found", "venue_not_in_registry"]),
  });

const tick = z.union([
  decimal,
  z.array(z.strictObject({ from: decimal, to: decimal, step: decimal })),
]);

// ---- pm_get_quote ----

export const quoteOutputSchema = z.strictObject({
  ...common,
  quoteId: z.string(),
  venue: z.string(),
  marketId: z.string(),
  market: z.strictObject({
    title: untrustedContentSchema,
    status: z.string(),
    tradable: z.strictObject({ ok: z.boolean(), reasons: z.array(z.string()) }),
    closesAt: z.string().nullable(),
    tick,
    minSize: z.string().nullable(),
    tickProblem: z.string().nullable(),
  }),
  outcome: z.strictObject({
    index: z.number().int(),
    role: z.string(),
    label: untrustedContentSchema,
    tokenId: z.string(),
  }),
  side: z.enum(["buy", "sell"]),
  requestedSize: decimal,
  filledSize: decimal,
  complete: z.boolean(),
  topOfBook: z.strictObject({ bid: decimal.nullable(), ask: decimal.nullable() }),
  bestPrice: decimal.nullable(),
  vwap: decimal.nullable(),
  notional: decimal,
  fee: z.strictObject({
    specId: z.string(),
    modelId: z.string(),
    role: z.literal("taker"),
    amount: decimal.nullable().describe("Order-level fee in dollars; null = unknown, never zero."),
    usable: z.boolean(),
    error: z.strictObject({ code: z.string(), detail: z.string() }).nullable(),
    verifiedAt: z.string(),
    ttlSec: z.number(),
    registry: z.strictObject({
      status: z.string().nullable(),
      modelMatches: z.boolean().nullable(),
      gateOk: z.boolean(),
    }),
  }),
  netCost: decimal.nullable(),
  effectivePrice: decimal.nullable(),
  derived: z.string().describe("native = real resting orders; complement = derived from the other side, never executable."),
  executable: z.boolean().describe("Describes the data (real orders, usable fee, fresh book). It is not an instruction and nothing here can place an order."),
  fills: z.array(z.strictObject({ price: decimal, size: decimal })),
  staleness: z.strictObject({
    bookAgeMs: z.number().nullable(),
    venueAgeMs: z.number().nullable(),
    maxAgeMs: z.number(),
    stale: z.boolean(),
  }),
  flags: z.array(z.string()),
  asOfMs: z.number(),
  validForMs: z.number(),
  validUntilMs: z.number(),
  bookSha256: z.string(),
  dataTerms,
  untrustedNotice: z.string(),
  notes: z.array(z.string()),
});

// ---- pm_list_venues ----

const adapterRow = z.strictObject({
  venue: z.string(),
  defaultEnabled: z.boolean(),
  enabledNow: z.boolean(),
  restrictedTerms: z.boolean(),
  memoryOnly: z.boolean(),
  mayPersist: z.boolean(),
  mayExport: z.boolean(),
  state: z.enum(["on", "off", "ack_required"]),
  clauseSha256: z.string().nullable(),
  disclosure: z.string().nullable(),
});

export const listVenuesOutputSchema = z.strictObject({
  ...common,
  registryVersion: z.string(),
  schemaVersion: z.string(),
  contentSha256: z.string(),
  compiledFromNotesAsOf: z.string(),
  asOfMs: z.number(),
  count: z.number().int(),
  venues: z.array(openRecord),
  notices: z.array(z.string()),
  adapters: z.array(adapterRow),
  enableHint: z.string(),
});

// ---- pm_lookup_links ----

export const lookupOutputSchema = z.strictObject({
  ...common,
  query: z.strictObject({ venue: z.string(), marketId: z.string() }),
  bundle: openRecord,
  approved: z.array(openRecord),
  candidates: z.array(openRecord),
  withdrawn: z.array(openRecord),
  truncated: z.boolean(),
  notes: z.array(z.string()),
  readOnly: z.literal(true),
  guaranteedProfitClaimed: z.literal(false),
  untrustedNotice: z.string(),
});

// ---- pm_verify_link ----

const legVerification = z.strictObject({
  index: z.number().int(),
  venue: z.string(),
  marketId: z.string(),
  fetched: z.boolean(),
  status: z.string().nullable(),
  tradable: z.boolean().nullable(),
  closeUtc: openRecord,
  rulesSha256: openRecord,
  maskedSha256: openRecord,
  resolverId: openRecord,
  voidPolicy: openRecord,
  outcomeCount: openRecord,
  tick: openRecord,
  fee: openRecord,
});

export const verifyOutputSchema = z.strictObject({
  ...common,
  linkId: z.string(),
  verdict: z.enum(["ok", "suspended"]),
  linkState: z.string(),
  reasons: z.array(
    z.strictObject({
      kind: z.string(),
      code: z.string(),
      legIndex: z.number().int().nullable(),
      transient: z.boolean(),
    }),
  ),
  warnings: z.array(z.string()),
  legs: z.array(legVerification),
  checkedAtMs: z.number(),
  scope: z.string(),
});

// ---- pm_compare_market ----

const comparisonItem = z.strictObject({
  linkId: z.string(),
  relation: z.string(),
  linkState: z.string(),
  tierCap: z.string(),
  tierCapReasons: z.array(z.string()),
  basis: openRecord,
  verification: openRecord,
  status: z.enum(["priced", "withheld", "not_priced"]),
  withheldReasons: z.array(z.string()),
  twin: z.strictObject({ venue: z.string(), marketId: z.string() }).nullable(),
  books: openRecord.nullable(),
  discrepancy: openRecord.nullable(),
  fairValue: openRecord.nullable(),
  label: z.enum(["indicative_discrepancy", "hedged_discrepancy"]),
  whyNotArbitrage: z.strictObject({
    guaranteedProfitClaimed: z.literal(false),
    executableTierEnabled: z.literal(false),
    reasonCodes: z.array(z.string()),
    explanation: z.array(z.string()),
  }),
});

export const compareOutputSchema = z.strictObject({
  ...common,
  queried: z.strictObject({
    venue: z.string(),
    marketId: z.string(),
    title: untrustedContentSchema,
    status: z.string(),
    closesAt: z.string().nullable(),
  }),
  links: z.strictObject({
    considered: z.number().int(),
    compared: z.number().int(),
    truncated: z.boolean(),
    withdrawn: z.array(z.strictObject({ linkId: z.string(), label: z.string() })),
  }),
  comparisons: z.array(comparisonItem),
  notes: z.array(z.string()),
  readOnly: z.literal(true),
  guaranteedProfitClaimed: z.literal(false),
  executableTierEnabled: z.literal(false),
  untrustedNotice: z.string(),
});

// ---- pm_check_structure ----

export const structureToolOutputSchema = structureOutputSchema.extend({
  ...common,
  toolNotes: z.array(z.string()),
  dataTerms,
});

// ---- pm_signal_request ----

export const signalRequestOutputSchema = z.strictObject({
  ...common,
  status: z.enum(["ok", "flag_off"]),
  flag: z.string(),
  clause: z.string(),
  detail: z.string().nullable(),
  request: openRecord.nullable(),
});

// ---- pm_signal_parse ----

export const signalParseOutputSchema = z.strictObject({
  ...common,
  status: z.enum(["ok", "flag_off"]),
  flag: z.string(),
  clause: z.string(),
  detail: z.string().nullable(),
  kind: z.enum(["mispriced", "signals"]).nullable(),
  counts: z.strictObject({ received: z.number().int(), parsed: z.number().int(), usable: z.number().int(), rejected: z.number().int() }).nullable(),
  schemaDrift: z.boolean().nullable(),
  rows: z.array(openRecord),
  rejected: z.array(openRecord),
  joins: z.array(openRecord).describe("Identity-only join of each row to the approved link registry. Quotient's own match data is never used."),
  restricted: z
    .strictObject({
      source: z.literal("quotient"),
      memoryOnly: z.literal(true),
      persisted: z.literal(false),
      exported: z.literal(false),
    })
    .nullable(),
  disclosure: z.array(z.string()),
  untrustedNotice: z.string().nullable(),
  notes: z.array(z.string()),
});
