// pm_get_quote, pm_lookup_links, pm_verify_link and pm_compare_market: thin MCP wrappers over the
// pure data functions in pm/ops. All the maths and every refusal live there; this file adds the
// schemas, the annotations, the fixed summary text and the error mapping. Summaries are built from
// enums, numbers and fixed codes only, never from market text.

import type { AdapterMarket } from "../adapters/types.js";
import { compareInputSchema, compareMarket } from "../ops/compare.js";
import { lookupInputSchema, lookupLinksOp } from "../ops/lookup.js";
import { getQuote, quoteInputSchema, type OpsContext } from "../ops/quote.js";
import { legFetcherFromAdapters, verifyInputSchema, verifyLinkById } from "../ops/verify.js";
import type { Market } from "../types.js";
import {
  COMMON_DESCRIPTION_TAIL,
  PM_NOTICE,
  READ_NETWORK_ANNOTATIONS,
  READ_OFFLINE_ANNOTATIONS,
  failureError,
  isoOf,
  plural,
  runPmTool,
  type PmToolDeps,
  type PmToolServer,
} from "./common.js";
import { compareOutputSchema, lookupOutputSchema, quoteOutputSchema, verifyOutputSchema } from "./schemas.js";

export const QUOTE_TOOL = "pm_get_quote";
export const LOOKUP_TOOL = "pm_lookup_links";
export const VERIFY_TOOL = "pm_verify_link";
export const COMPARE_TOOL = "pm_compare_market";

function opsContext(deps: PmToolDeps): { ctx: OpsContext; nowMs: number } {
  const nowMs = deps.now();
  const adapters = deps.adapters();
  return { nowMs, ctx: { nowMs, adapter: adapters.lookup, timeoutMs: deps.callTimeoutMs } };
}

// The raw rule-bearing fields an adapter kept for the market (input of the link hash recipes).
// A market that does not carry them gives null, which makes every pin unknown: the link suspends.
function ruleRecordOf(market: Market): Readonly<Record<string, unknown>> | null {
  const extras = (market as Partial<AdapterMarket>).extras;
  return extras?.ruleFields ?? null;
}

const QUOTE_DESCRIPTION = [
  "Depth-walk quote for one outcome of one market: volume-weighted average price for a stated size, the order-level taker fee with the venue's rounding, net cost, whether the book is native (real resting orders) or derived from the other side, how stale it is, and a quote_id hash.",
  "venue is one of the supported ids (xo and polymarket are on; kalshi needs its adapter switched on). outcome is an index or yes/no. A missing book, unknown fee model or stale book gives executable=false with flags, never a number that looks tradable. executable describes the data only: this tool cannot place an order.",
  COMMON_DESCRIPTION_TAIL,
].join(" ");

const LOOKUP_DESCRIPTION = [
  "Look up the human-approved, hash-pinned links for one market: relation (identity, near_identity, ladder, partition, complement, related), state, basis class, divergence axes, pinned rule hashes, reviewer and expiry. Offline: it reads the bundled link registry, which is the ONLY source of 'links'.",
  "An empty result means nothing has been reviewed for that market, not that markets are unrelated. Candidates (include_candidates) are guesses and are always labelled indicative. Pins are not re-checked live here: use pm_verify_link. Tier caps are advisory and stay at indicative until a gold-set class gate passes.",
  COMMON_DESCRIPTION_TAIL,
].join(" ");

const VERIFY_DESCRIPTION = [
  "Re-verify one link against the live markets: recompute each leg's rules hash and masked hash, close time, resolver, status, void policy, outcome count, tick and fee model, and compare them with the pins. The verdict is ok only when every pin holds and nothing is unknown; anything else is suspended with machine-readable reasons.",
  "A verdict applies to this call only and never edits the registry. Reads each leg live (about four requests per XO leg). Restricted-terms rule text is hashed in memory and never returned.",
  COMMON_DESCRIPTION_TAIL,
].join(" ");

const COMPARE_DESCRIPTION = [
  "Compare a market with its linked twin on another venue: find the bundled links, re-verify each, then for a verified two-leg identity, near_identity or complement link read both books and report relation, basis and divergence axes, both books, an INDICATIVE discrepancy with its full friction stack (fees, capital lock, reserve, resolution-risk haircut), a twin-price reference and the reasons it is not an arbitrage.",
  "It never reports a guaranteed profit and cannot label anything executable arbitrage. Labels never exceed the link's tier cap (indicative until a gold-set class gate passes); a failed verification withholds the numbers; candidate links are priced for information only. Ladders, partitions and related links are described, not priced (use pm_check_structure for within-venue sets).",
  COMMON_DESCRIPTION_TAIL,
].join(" ");

export function registerMarketTools(server: PmToolServer, deps: PmToolDeps): void {
  server.registerTool(
    QUOTE_TOOL,
    {
      title: "Get a depth-walk quote",
      description: QUOTE_DESCRIPTION,
      inputSchema: quoteInputSchema,
      outputSchema: quoteOutputSchema,
      annotations: READ_NETWORK_ANNOTATIONS,
    },
    async (input) =>
      runPmTool(deps, { tool: QUOTE_TOOL, note: `venue=${input.venue}` }, async () => {
        const { ctx, nowMs } = opsContext(deps);
        const result = await getQuote(input, ctx);
        if (!result.ok) throw failureError(result.error, result.detail);
        const q = result.value;
        const structured = { ...q, pmNotice: PM_NOTICE, fetchedAt: isoOf(nowMs) };
        const summary =
          `Quote ${q.quoteId} on ${q.venue}: ${q.side} ${q.filledSize} of ${q.requestedSize} shares${q.complete ? "" : " (partial)"}, ` +
          `vwap ${q.vwap ?? "n/a"}, fee ${q.fee.amount ?? "unknown"}, net cost ${q.netCost ?? "unknown"}, ${q.derived} book, ` +
          `executable=${q.executable}${q.flags.length === 0 ? "" : `, flags: ${q.flags.join(", ")}`}. ` +
          `Reference only, valid ${q.validForMs / 1000}s from the book time; this tool cannot place an order and promises no profit.`;
        return { summary, structured, auditWarnings: q.flags.slice(0, 4) };
      }),
  );

  server.registerTool(
    LOOKUP_TOOL,
    {
      title: "Look up approved market links",
      description: LOOKUP_DESCRIPTION,
      inputSchema: lookupInputSchema,
      outputSchema: lookupOutputSchema,
      annotations: READ_OFFLINE_ANNOTATIONS,
    },
    async (input) =>
      runPmTool(deps, { tool: LOOKUP_TOOL, note: `venue=${input.venue}` }, async () => {
        const nowMs = deps.now();
        const gates = deps.gates();
        const result = lookupLinksOp(input, deps.dataset(), { nowMs, ...(gates === undefined ? {} : { gates }) });
        if (!result.ok) throw failureError(result.error, result.detail);
        const r = result.value;
        const structured = { ...r, pmNotice: PM_NOTICE, fetchedAt: isoOf(nowMs) };
        const summary =
          `${plural(r.approved.length, "approved link")}, ${plural(r.candidates.length, "candidate")} (indicative only) and ${plural(r.withdrawn.length, "withdrawn record")} for this market` +
          `${r.truncated ? " (list truncated)" : ""}. Pins were not re-checked live: use pm_verify_link. A link is a statement about rules, not a trade recommendation.`;
        return { summary, structured };
      }),
  );

  server.registerTool(
    VERIFY_TOOL,
    {
      title: "Verify a link against live markets",
      description: VERIFY_DESCRIPTION,
      inputSchema: verifyInputSchema,
      outputSchema: verifyOutputSchema,
      annotations: READ_NETWORK_ANNOTATIONS,
    },
    async (input) =>
      runPmTool(deps, { tool: VERIFY_TOOL }, async () => {
        const { ctx, nowMs } = opsContext(deps);
        const result = await verifyLinkById(input, deps.dataset(), ctx, legFetcherFromAdapters(ctx, ruleRecordOf));
        if (!result.ok) throw failureError(result.error, result.detail);
        const v = result.value;
        const structured = { ...v, pmNotice: PM_NOTICE, fetchedAt: isoOf(nowMs) };
        const codes = [...new Set(v.reasons.map((r) => r.code))].slice(0, 12);
        const summary =
          `Link ${v.linkId}: ${v.verdict.toUpperCase()}` +
          `${codes.length === 0 ? "" : ` (${v.reasons.length} reasons: ${codes.join(", ")})`}. ` +
          `${v.verdict === "ok" ? "Every pin held for this call only." : "Treat the link as unusable until a human re-reviews it."} The registry was not changed.`;
        return { summary, structured, auditWarnings: codes.slice(0, 4) };
      }),
  );

  server.registerTool(
    COMPARE_TOOL,
    {
      title: "Compare a market with its linked twin",
      description: COMPARE_DESCRIPTION,
      inputSchema: compareInputSchema,
      outputSchema: compareOutputSchema,
      annotations: READ_NETWORK_ANNOTATIONS,
    },
    async (input) =>
      runPmTool(deps, { tool: COMPARE_TOOL, note: `venue=${input.venue ?? "xo"}` }, async () => {
        const { ctx, nowMs } = opsContext(deps);
        const gates = deps.gates();
        const result = await compareMarket(input, {
          ...ctx,
          fetchLeg: legFetcherFromAdapters(ctx, ruleRecordOf),
          dataset: deps.dataset(),
          ...(gates === undefined ? {} : { gates }),
        });
        if (!result.ok) throw failureError(result.error, result.detail);
        const c = result.value;
        const structured = { ...c, pmNotice: PM_NOTICE, fetchedAt: isoOf(nowMs) };
        const lines = c.comparisons.map((x) => `${x.relation} ${x.status}, label ${x.label}`);
        const summary =
          `${plural(c.links.considered, "link")} considered, ${c.links.compared} compared${c.links.truncated ? " (truncated)" : ""}` +
          `${lines.length === 0 ? ". No approved link for this market, so there is nothing to compare" : `: ${lines.join("; ")}`}. ` +
          "Discrepancies are indicative and are not arbitrage; no profit is promised and nothing here places an order.";
        return { summary, structured };
      }),
  );
}
