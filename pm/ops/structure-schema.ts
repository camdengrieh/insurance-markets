// Zod schemas for the pm_check_structure tool surface: strict input, strict output. The tool
// layer fetches the group's books through an adapter, builds a StructureGroup, calls
// checkStructure and returns the result as structuredContent validated by the output schema.

import * as z from "zod/v4";
import { untrustedContentSchema } from "../../src/guardrails/untrusted.js";
import { VENUE_IDS } from "../types.js";
import {
  STRUCTURE_CHECK_KINDS,
  STRUCTURE_SCHEMA_VERSION,
  type StructureCheckKind,
  type StructureOptions,
} from "./structure-types.js";

const decimal = z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/, "plain unsigned decimal");
const signedDecimal = z.string().regex(/^-?(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/);
const safeKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);

export const structureToolInputSchema = z
  .object({
    venue: z.enum(VENUE_IDS),
    group_key: safeKey,
    checks: z.array(z.enum(STRUCTURE_CHECK_KINDS as [string, ...string[]])).min(1).max(3).optional(),
    tau: decimal.optional(),
    hurdle_apy: decimal.optional(),
    reserve_per_share: decimal.optional(),
    haircut_per_share: decimal.optional(),
    max_qty: decimal.optional(),
    walk_depth: z.boolean().optional(),
  })
  .strict();
export type StructureToolInput = z.infer<typeof structureToolInputSchema>;

const label = z.enum(["structural_violation", "hedged_discrepancy", "indicative_discrepancy", "model_edge", "relative_value_signal"]);
const kind = z.enum(STRUCTURE_CHECK_KINDS as [string, ...string[]]);

const topEdge = z
  .object({ gross: signedDecimal, fees: signedDecimal, lock: signedDecimal, reserve: signedDecimal, haircut: signedDecimal, net: signedDecimal })
  .strict();

const depthEdge = z
  .object({
    qty: signedDecimal,
    capital: signedDecimal,
    gross: signedDecimal,
    fees: signedDecimal,
    lock: signedDecimal,
    reserve: signedDecimal,
    haircut: signedDecimal,
    fixedCost: signedDecimal,
    net: signedDecimal,
    returnOnCapital: signedDecimal.nullable(),
    netAfterOrderRounding: signedDecimal,
    stopReason: z.string(),
  })
  .strict();

const finding = z
  .object({
    id: z.string(),
    check: kind,
    direction: z.enum(["buy_all_yes", "buy_all_no", "buy_yes_and_no", "sell_yes_and_no", "sell_stronger_buy_weaker"]),
    members: z.array(z.string()),
    verdict: z.enum(["candidate", "mid_gap_only", "no_edge", "unavailable"]),
    label: label.nullable(),
    basis: z.enum(["none", "mid", "top_of_book_after_fees", "depth_walk_after_fees"]),
    midGap: signedDecimal.nullable(),
    top: topEdge.nullable(),
    depth: depthEdge.nullable(),
    booksNative: z.boolean(),
    reasons: z.array(z.string()),
    caveats: z.array(z.string()),
  })
  .strict();

const member = z
  .object({
    ref: z.string(),
    id: z.string(),
    label: untrustedContentSchema,
    status: z.string(),
    tradable: z.boolean(),
    yesBook: z.enum(["ok", "bid_only", "ask_only", "empty", "no_book", "stale", "time_invalid", "crossed", "malformed"]),
    noBook: z.enum(["native", "derived", "missing"]),
    ageMs: z.number().int().nullable(),
    bid: decimal.nullable(),
    ask: decimal.nullable(),
    mid: decimal.nullable(),
  })
  .strict();

const check = z
  .object({
    kind,
    status: z.enum(["evaluated", "not_applicable", "refused"]),
    itemsEvaluated: z.number().int(),
    candidates: z.number().int(),
    midGapOnly: z.number().int(),
    noEdge: z.number().int(),
    unavailable: z.number().int(),
    reasons: z.array(z.string()),
  })
  .strict();

export const structureOutputSchema = z
  .object({
    schema: z.literal(STRUCTURE_SCHEMA_VERSION),
    group: z
      .object({
        venue: z.enum(VENUE_IDS),
        key: safeKey,
        kind: z.enum(["neg_risk", "mutually_exclusive", "event", "series"]),
        exhaustive: z.enum(["proven", "by_rule", "no", "unknown"]),
        membersComplete: z.boolean(),
        memberCount: z.number().int(),
      })
      .strict(),
    asOfMs: z.number().int(),
    params: z
      .object({
        tau: decimal,
        hurdleApy: decimal,
        reservePerShare: decimal,
        haircutPerShare: decimal,
        maxBookAgeMs: z.number().int(),
        nearCloseMs: z.number().int(),
      })
      .strict(),
    members: z.array(member),
    partition: z
      .object({
        n: z.number().int(),
        expectedSum: z.enum(["1", "at_most_1", "unknown"]),
        sumAsk: decimal.nullable(),
        sumBid: decimal.nullable(),
        sumMid: decimal.nullable(),
      })
      .strict()
      .nullable(),
    checks: z.array(check),
    findings: z.array(finding),
    summary: z
      .object({ alerts: z.number().int(), highestLabel: label.nullable(), ladderFindingsOmitted: z.number().int() })
      .strict(),
    notice: z.string(),
  })
  .strict();

// Maps validated tool arguments to checkStructure options.
export function structureOptionsFromInput(input: StructureToolInput): StructureOptions {
  return {
    ...(input.checks === undefined ? {} : { checks: input.checks as StructureCheckKind[] }),
    ...(input.tau === undefined ? {} : { tau: input.tau }),
    ...(input.hurdle_apy === undefined ? {} : { hurdleApy: input.hurdle_apy }),
    ...(input.reserve_per_share === undefined ? {} : { reservePerShare: input.reserve_per_share }),
    ...(input.haircut_per_share === undefined ? {} : { haircutPerShare: input.haircut_per_share }),
    ...(input.max_qty === undefined ? {} : { maxQty: input.max_qty }),
    ...(input.walk_depth === undefined ? {} : { walkDepth: input.walk_depth }),
  };
}
