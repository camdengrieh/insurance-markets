// pm_list_venues: the offline registry view (pm/registry/list-venues.ts) plus the state of the
// three read adapters. No network, so it is also the conformance sample call for this tool set.

import * as z from "zod/v4";
import { UNTRUSTED_DATA_NOTICE } from "../../src/guardrails/untrusted.js";
import { adapterDescriptor } from "../adapters/policy.js";
import { REGISTRY_VENUE_IDS } from "../registry/ids.js";
import { listVenues, listVenuesInputSchema } from "../registry/list-venues.js";
import {
  COMMON_DESCRIPTION_TAIL,
  KALSHI_ACK_ENV,
  KALSHI_ENABLE_ENV,
  PM_NOTICE,
  READ_OFFLINE_ANNOTATIONS,
  failureError,
  isoOf,
  kalshiStatusOf,
  plural,
  runPmTool,
  type PmToolDeps,
  type PmToolServer,
} from "./common.js";
import { listVenuesOutputSchema } from "./schemas.js";

export const LIST_VENUES_TOOL = "pm_list_venues";

// Mirrors listVenuesInputSchema with snake_case names (the other pm tools use snake_case too).
export const listVenuesToolInput = z.strictObject({
  venues: listVenuesInputSchema.shape.venues.describe(`Restrict to these registry ids (${REGISTRY_VENUE_IDS.length} known). Omit for all.`),
  reachability: listVenuesInputSchema.shape.reachability.describe("Filter by execution reachability class E1 to E5 or unknown."),
  tiers: listVenuesInputSchema.shape.tiers.describe("Filter by liquidity tier A, B, C, D, X or unknown."),
  memory_only: z.boolean().optional().describe("true = only venues whose data is memory-only (restricted or unknown terms); false = only the others."),
});

const DESCRIPTION = [
  "List the prediction-market venues in the bundled platform registry: what each is, fee model, geography and bot-policy evidence, API capabilities, resolution mechanism, data terms and how fresh each fact is. Offline: no network call.",
  "A capability shows 'yes' only when it is recorded as yes; everything else shows 'unproven'. Facts are pointers compiled from research notes, not live data; expired sections read 'unknown'. Region lists are evidence only: check eligibility from your own client.",
  "Also shows which read adapters are on (XO and Polymarket by default; Kalshi stays OFF until you switch it on and acknowledge its terms clause).",
  COMMON_DESCRIPTION_TAIL,
].join(" ");

export function registerListVenues(server: PmToolServer, deps: PmToolDeps): void {
  server.registerTool(
    LIST_VENUES_TOOL,
    {
      title: "List prediction-market venues",
      description: DESCRIPTION,
      inputSchema: listVenuesToolInput,
      outputSchema: listVenuesOutputSchema,
      annotations: READ_OFFLINE_ANNOTATIONS,
    },
    async (input) =>
      runPmTool(deps, { tool: LIST_VENUES_TOOL }, async () => {
        const nowMs = deps.now();
        const { memory_only, ...rest } = input;
        const result = listVenues({ ...rest, ...(memory_only === undefined ? {} : { memoryOnly: memory_only }) }, nowMs);
        if (!result.ok) throw failureError("BAD_INPUT", result.detail);
        const env = deps.env();
        const kalshiState = kalshiStatusOf(env, nowMs);
        const adapters = (["xo", "polymarket", "kalshi"] as const).map((venue) => {
          const d = adapterDescriptor(venue, nowMs);
          const state = venue === "kalshi" ? (kalshiState === "enabled" ? "on" : kalshiState === "off" ? "off" : "ack_required") : "on";
          return {
            venue,
            defaultEnabled: d.defaultEnabled,
            enabledNow: state === "on",
            restrictedTerms: d.restrictedTerms,
            memoryOnly: d.memoryOnly,
            mayPersist: d.mayPersist,
            mayExport: d.mayExport,
            state: state as "on" | "off" | "ack_required",
            // The hash is only needed to switch a restricted adapter on, and only after reading the disclosure.
            clauseSha256: d.restrictedTerms ? d.clauseSha256 : null,
            disclosure: d.disclosure,
          };
        });
        const structured = {
          ...result.value,
          adapters,
          enableHint: `A restricted-terms adapter (Kalshi) is enabled only by setting ${KALSHI_ENABLE_ENV}=1 and ${KALSHI_ACK_ENV} to the clauseSha256 shown, after reading its disclosure. Its data then stays in memory for the call and is never stored or exported.`,
          pmNotice: PM_NOTICE,
          fetchedAt: isoOf(nowMs),
        };
        const summary =
          `${plural(result.value.count, "venue")} from registry ${result.value.registryVersion} (notes as of ${result.value.compiledFromNotesAsOf}). ` +
          `Adapters: ${adapters.map((a) => `${a.venue}=${a.state}`).join(", ")}. ` +
          `Facts are registry pointers, not live data; capabilities not recorded as yes show unproven. ${UNTRUSTED_DATA_NOTICE}`;
        return { summary, structured };
      }),
  );
}
