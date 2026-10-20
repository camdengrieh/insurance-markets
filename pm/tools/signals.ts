// pm_signal_request and pm_signal_parse: the Quotient helpers (pm/signals) behind the PM_QUOTIENT
// flag, OFF by default. Both are offline. The plugin never contacts Quotient, never pays and never
// holds a key: pm_signal_request describes the exact request and checks a free 402 challenge the
// agent fetched, pm_signal_parse validates a response body the agent paid for and passes the rows
// through. Quotient data is restricted-terms: memory-only, never stored or exported. Quotient's own
// match data is never used; the only link source is the approved registry (identity-only join).

import * as z from "zod/v4";
import {
  DISCLOSURE,
  MAX_BODY_BYTES,
  PURPOSES,
  QUOTIENT_CLAUSE,
  QUOTIENT_FLAG,
  describeRequest,
  joinRows,
  parseSignalBody,
  quotientEnabled,
} from "../signals/index.js";
import {
  COMMON_DESCRIPTION_TAIL,
  PM_NOTICE,
  READ_OFFLINE_ANNOTATIONS,
  failureError,
  isoOf,
  plural,
  runPmTool,
  type PmToolDeps,
  type PmToolServer,
} from "./common.js";
import { signalParseOutputSchema, signalRequestOutputSchema } from "./schemas.js";

export const SIGNAL_REQUEST_TOOL = "pm_signal_request";
export const SIGNAL_PARSE_TOOL = "pm_signal_parse";
// The decoded 402 challenge is small; anything bigger is not a challenge.
export const MAX_CHALLENGE_CHARS = 16 * 1024;

export const signalRequestToolInput = z.strictObject({
  purpose: z.enum(PURPOSES).describe("candidates, published_signals, enrichment, forecast_history or track_record."),
  params: z
    .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean()]))
    .optional()
    .describe("Route parameters (for example min_spread, market_key). Unknown or invalid parameters are refused."),
  challenge: z
    .record(z.string().max(80), z.unknown())
    .optional()
    .describe("The decoded free 402 challenge you got from an unpaid GET of the returned URL. It is compared with the pinned payment terms; any mismatch is a hard stop."),
});

export const signalParseToolInput = z.strictObject({
  kind: z.enum(["mispriced", "signals"]).describe("Which route the body came from: markets/mispriced or the published signals feed."),
  body: z.string().min(2).max(MAX_BODY_BYTES).describe(`The JSON response text (at most ${MAX_BODY_BYTES} bytes; pass only the rows you selected).`),
  allow_experimental: z.boolean().optional().describe("Show sports rows (all experimental, no established edge). Default false."),
  min_capacity_usd: z
    .string()
    .regex(/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/)
    .optional()
    .describe("Smallest dollar capacity a signal must show, as a decimal string."),
  include_text: z.boolean().optional().describe("Include Quotient's thesis text (untrusted data). Default false."),
  max_forecast_age_ms: z.int().min(0).max(30 * 86_400_000).optional(),
  max_quote_age_ms: z.int().min(0).max(86_400_000).optional(),
  join_links: z.boolean().optional().describe("Join each row to the approved link registry by identity (default true). Related links are shown as related, not identical."),
});

const REQUEST_DESCRIPTION = [
  `Describe one Quotient data request without making it: the exact URL, price, pinned x402 payment terms (payee, asset, network, ceiling of twice the table price) and the steps the AGENT takes. Behind the ${QUOTIENT_FLAG} flag, OFF by default; when off it returns the terms clause instead.`,
  "The plugin never calls Quotient, never pays and holds no key. Pass a free unpaid 402 challenge as `challenge` to check it field by field against the pins before the agent pays; any mismatch or an amount above the ceiling is a hard stop. A Quotient spread is a model-versus-quote watchlist, not an executable edge and not advice.",
  COMMON_DESCRIPTION_TAIL,
].join(" ");

const PARSE_DESCRIPTION = [
  `Validate and normalise a Quotient response body the agent already paid for. Behind the ${QUOTIENT_FLAG} flag, OFF by default. Exact decimals, fail-closed enums (an unknown venue or enum rejects that row and flags schema drift), explicit demotions (stale quote, unmapped orientation, dispute, unknown drawdown risk) and an identity-only join to the approved link registry.`,
  "Quotient data is restricted-terms: it stays in memory for this call and is never stored or exported. Quotient's own match data is ignored. A row with usable=true is not a trade instruction; a spread is a watchlist item.",
  COMMON_DESCRIPTION_TAIL,
].join(" ");

export function registerSignalTools(server: PmToolServer, deps: PmToolDeps): void {
  server.registerTool(
    SIGNAL_REQUEST_TOOL,
    {
      title: "Describe a Quotient data request",
      description: REQUEST_DESCRIPTION,
      inputSchema: signalRequestToolInput,
      outputSchema: signalRequestOutputSchema,
      annotations: READ_OFFLINE_ANNOTATIONS,
    },
    async (input) =>
      runPmTool(deps, { tool: SIGNAL_REQUEST_TOOL, note: `purpose=${input.purpose}` }, async () => {
        const nowMs = deps.now();
        if (input.challenge !== undefined && JSON.stringify(input.challenge).length > MAX_CHALLENGE_CHARS) {
          throw failureError("BAD_INPUT", "challenge is too large to be a payment challenge");
        }
        const enabled = quotientEnabled(deps.env());
        const result = describeRequest({ enabled }, input);
        if (!result.ok) {
          if (result.error === "FLAG_OFF") {
            const structured = {
              status: "flag_off" as const,
              flag: QUOTIENT_FLAG,
              clause: result.clause,
              detail: result.detail,
              request: null,
              pmNotice: PM_NOTICE,
              fetchedAt: isoOf(nowMs),
            };
            return {
              summary: `Quotient helpers are OFF (${QUOTIENT_FLAG} is not set). Nothing was described and nothing was requested. Read the clause in the structured result before switching them on.`,
              structured,
            };
          }
          throw failureError("BAD_INPUT", result.detail);
        }
        const { ok: _ok, ...request } = result;
        void _ok;
        const check = request.challengeCheck;
        const structured = {
          status: "ok" as const,
          flag: QUOTIENT_FLAG,
          clause: request.clause,
          detail: null,
          request: request as unknown as Record<string, unknown>,
          pmNotice: PM_NOTICE,
          fetchedAt: isoOf(nowMs),
        };
        const summary =
          `Quotient request described, not made: ${request.routeId}, ${request.free ? "free" : `price $${request.price.usd} (hard ceiling $${request.ceiling.usd})`}. ` +
          `The agent pays, never the plugin${check === undefined ? "" : `; challenge check: ${check.ok ? "matches the pins" : "MISMATCH, do not pay"}`}. ` +
          "A spread is a watchlist item, not an executable edge.";
        return { summary, structured };
      }),
  );

  server.registerTool(
    SIGNAL_PARSE_TOOL,
    {
      title: "Parse a Quotient response",
      description: PARSE_DESCRIPTION,
      inputSchema: signalParseToolInput,
      outputSchema: signalParseOutputSchema,
      annotations: READ_OFFLINE_ANNOTATIONS,
    },
    async (input) =>
      runPmTool(deps, { tool: SIGNAL_PARSE_TOOL, note: `kind=${input.kind}` }, async () => {
        const nowMs = deps.now();
        const enabled = quotientEnabled(deps.env());
        const result = parseSignalBody({ enabled }, input.kind, input.body, {
          nowMs,
          ...(input.allow_experimental === undefined ? {} : { allowExperimental: input.allow_experimental }),
          ...(input.min_capacity_usd === undefined ? {} : { minCapacityUsd: input.min_capacity_usd }),
          ...(input.include_text === undefined ? {} : { includeText: input.include_text }),
          ...(input.max_forecast_age_ms === undefined ? {} : { maxForecastAgeMs: input.max_forecast_age_ms }),
          ...(input.max_quote_age_ms === undefined ? {} : { maxQuoteAgeMs: input.max_quote_age_ms }),
        });
        if (!result.ok) {
          if (result.error === "FLAG_OFF") {
            const structured = {
              status: "flag_off" as const,
              flag: QUOTIENT_FLAG,
              clause: result.clause,
              detail: result.detail,
              kind: null,
              counts: null,
              schemaDrift: null,
              rows: [],
              rejected: [],
              joins: [],
              restricted: null,
              disclosure: [...DISCLOSURE],
              untrustedNotice: null,
              notes: [],
              pmNotice: PM_NOTICE,
              fetchedAt: isoOf(nowMs),
            };
            return { summary: `Quotient helpers are OFF (${QUOTIENT_FLAG} is not set). The body was not read.`, structured };
          }
          throw failureError("BAD_INPUT", `${result.error}: ${result.detail}`);
        }

        const notes: string[] = [];
        let joins: readonly object[] = [];
        if (input.join_links !== false) {
          const dataset = deps.dataset();
          if (dataset.ok) {
            // Orientation of the other venue's outcomes needs an adapter-supplied YES index; this
            // tool supplies none, so a joined target probability is withheld rather than guessed.
            joins = joinRows(result.rows, dataset.value.links, { nowMs });
          } else {
            notes.push("link_dataset_unavailable:no_join_performed");
          }
        }
        if (result.schemaDrift) notes.push("schema_drift:an_unknown_venue_or_enum_rejected_rows;the_api_may_have_changed");
        const structured = {
          status: "ok" as const,
          flag: QUOTIENT_FLAG,
          clause: result.clause,
          detail: null,
          kind: result.kind,
          counts: result.counts,
          schemaDrift: result.schemaDrift,
          rows: result.rows as unknown as Record<string, unknown>[],
          rejected: result.rejected as unknown as Record<string, unknown>[],
          joins: joins as unknown as Record<string, unknown>[],
          restricted: result.restricted,
          disclosure: [...result.disclosure],
          untrustedNotice: result.untrustedNotice,
          notes,
          pmNotice: PM_NOTICE,
          fetchedAt: isoOf(nowMs),
        };
        const c = result.counts;
        const summary =
          `Parsed ${plural(c.received, "row")}: ${c.parsed} read, ${c.usable} usable, ${c.rejected} rejected${result.schemaDrift ? " (schema drift suspected)" : ""}. ` +
          "Quotient data is memory-only: do not store or export it. A spread is a watchlist item, not an executable edge.";
        return { summary, structured };
      }),
  );
}

export { QUOTIENT_CLAUSE };
