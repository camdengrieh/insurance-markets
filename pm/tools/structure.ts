// pm_check_structure: within-venue complement, partition and ladder checks (pm/ops/structure.ts)
// on markets the caller names. The data layer is pure; this file reads the markets and books through
// the enabled adapter and builds the StructureGroup from what the VENUE says:
//   - group key, kind and exhaustiveness come from the adapter's market.group, never from the caller;
//     markets that do not share one group are treated as an ad hoc event (no partition claim);
//   - a venue port has no member listing, so the member list can never be proven complete here:
//     membersComplete is always false, and a caller cannot assert otherwise. A partition therefore
//     never reaches structural_violation from this tool; a human-approved partition link with
//     proven exhaustiveness is the only path to a stronger claim;
//   - ladder rungs are never guessed from titles, so the ladder check reports not_applicable.
// An alert, not an opportunity: no order is placed and no profit is promised.

import * as z from "zod/v4";
import type { Book, Exhaustive, GroupKind, Market, OutcomeRef, Status, TokenRef } from "../types.js";
import { VENUE_IDS } from "../types.js";
import { checkStructure } from "../ops/structure.js";
import { structureOptionsFromInput, structureToolInputSchema } from "../ops/structure-schema.js";
import { MAX_GROUP_MEMBERS, type StructureGroup, type StructureMember } from "../ops/structure-types.js";
import { dataTermsOf, guarded, marketIdText, normaliseMarketId } from "../ops/quote.js";
import {
  COMMON_DESCRIPTION_TAIL,
  PM_NOTICE,
  READ_NETWORK_ANNOTATIONS,
  failureError,
  isoOf,
  plural,
  runPmTool,
  type PmToolDeps,
  type PmToolServer,
} from "./common.js";
import { structureToolOutputSchema } from "./schemas.js";

export const STRUCTURE_TOOL = "pm_check_structure";
// Two requests per market plus the market read, inside a 9 s budget.
export const STRUCTURE_MAX_MARKETS = 8;

const { group_key: _groupKey, venue: _venue, ...optionShape } = structureToolInputSchema.shape;
void _groupKey;
void _venue;

export const structureToolInput = z.strictObject({
  venue: z.enum(VENUE_IDS),
  market_ids: z
    .array(marketIdText)
    .min(1)
    .max(STRUCTURE_MAX_MARKETS)
    .describe(`Venue market ids to check together (1 to ${STRUCTURE_MAX_MARKETS}), for example the outcomes of one event or one market for the YES+NO check.`),
  ...optionShape,
});
export type StructureToolInputText = z.infer<typeof structureToolInput>;

const DESCRIPTION = [
  "Check a set of markets on ONE venue for price relations that look off: YES+NO complement, mutually exclusive or exhaustive partition (buy every YES, buy every NO) and threshold ladders. Each finding says how far it was checked (mid only, top of book after fees, or a depth walk) and lists every reason a stronger label was withheld.",
  "Group key, kind and exhaustiveness come from the venue; markets that do not share one group are checked as an ad hoc event with no partition claim. The member list cannot be proven complete here (a venue port has no member listing and your own claim of completeness is not accepted), so a partition finding is at most indicative and is never presented as a lock. Ladder rungs are never inferred from titles, so the ladder check needs rung metadata and reports not_applicable here.",
  "Output is an alert with a net figure after fees, capital lock, reserve and a resolution haircut; a mid-price gap alone is not executable. It is not an arbitrage and places no order.",
  COMMON_DESCRIPTION_TAIL,
].join(" ");

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function ms(text: string | undefined): number | null {
  if (text === undefined) return null;
  const t = Date.parse(text);
  return Number.isFinite(t) ? t : null;
}

function only(market: Market, role: OutcomeRef["role"]): OutcomeRef | undefined {
  const matches = market.outcomes.filter((o) => o.role === role);
  return matches.length === 1 ? matches[0] : undefined;
}

// Statuses in which a resolution is proposed, contested or unreadable.
const CONTESTED: ReadonlySet<Status> = new Set<Status>(["disputed", "determined", "unknown"]);

// One shared group, or an ad hoc event. Never trusts the caller.
function groupOf(venue: string, markets: readonly Market[]): { key: string; kind: GroupKind; exhaustive: Exhaustive; shared: boolean } {
  const first = markets[0]?.group;
  const sameGroup =
    first !== undefined &&
    SAFE_KEY.test(first.key) &&
    markets.every((m) => m.group !== undefined && m.group.key === first.key && m.group.kind === first.kind);
  if (!sameGroup || first === undefined) {
    return { key: `adhoc-${venue.replace(/_/g, "-")}`, kind: "event", exhaustive: "unknown", shared: false };
  }
  // The weakest claim among members wins.
  const all = markets.map((m) => m.group?.exhaustive);
  const exhaustive: Exhaustive = all.every((e) => e === first.exhaustive) ? first.exhaustive : "unknown";
  return { key: first.key, kind: first.kind, exhaustive, shared: true };
}

export function registerStructureTool(server: PmToolServer, deps: PmToolDeps): void {
  server.registerTool(
    STRUCTURE_TOOL,
    {
      title: "Check market structure on one venue",
      description: DESCRIPTION,
      inputSchema: structureToolInput,
      outputSchema: structureToolOutputSchema,
      annotations: READ_NETWORK_ANNOTATIONS,
    },
    async (input) =>
      runPmTool(deps, { tool: STRUCTURE_TOOL, note: `venue=${input.venue}` }, async () => {
        const nowMs = deps.now();
        const timeoutMs = deps.callTimeoutMs;
        const adapter = deps.adapters().lookup(input.venue);
        if (adapter === undefined) throw failureError("VENUE_UNAVAILABLE");
        const ids = input.market_ids.map(normaliseMarketId);
        if (new Set(ids).size !== ids.length) throw failureError("BAD_INPUT", "market_ids repeats an id");
        if (ids.length > MAX_GROUP_MEMBERS) throw failureError("BAD_INPUT", "too many market ids");

        const notes: string[] = [];
        const got = await Promise.all(
          ids.map((marketId) => guarded(() => adapter.getMarket({ venue: input.venue, marketId, native: {} }), timeoutMs)),
        );
        const markets: Market[] = [];
        for (const [i, g] of got.entries()) {
          if (!g.ok) throw failureError("MARKET_UNAVAILABLE", `member ${i}: ${g.error}`);
          if (g.value.ref.venue !== input.venue) throw failureError("MARKET_UNAVAILABLE", `member ${i}: wrong venue`);
          markets.push(g.value);
        }

        // One batch for every YES and NO token.
        const tokens: TokenRef[] = [];
        const tokenOf = (m: Market, o: OutcomeRef | undefined): TokenRef | undefined =>
          o === undefined ? undefined : { venue: m.ref.venue, tokenId: o.tokenId };
        const wanted = markets.map((m) => ({ yes: tokenOf(m, only(m, "yes")), no: tokenOf(m, only(m, "no")) }));
        for (const w of wanted) for (const t of [w.yes, w.no]) if (t !== undefined) tokens.push(t);
        const byToken = new Map<string, Book>();
        if (tokens.length > 0 && adapter.caps.getBook) {
          const books = await guarded(() => adapter.getBooks(tokens, { deadlineMs: timeoutMs }), timeoutMs);
          if (!books.ok) throw failureError("BOOK_UNAVAILABLE", books.error);
          if (books.value.length !== tokens.length) throw failureError("BOOK_UNAVAILABLE", "wrong number of books");
          books.value.forEach((r, i) => {
            const t = tokens[i];
            if (t === undefined) return;
            if (r.ok && r.value.token.venue === t.venue && r.value.token.tokenId === t.tokenId) byToken.set(t.tokenId, r.value);
            else notes.push(`book_unavailable:token_${i}:${r.ok ? "token_mismatch" : r.error}`);
          });
        } else if (!adapter.caps.getBook) {
          notes.push("book_unavailable:adapter_has_no_book_read");
        }

        const group = groupOf(input.venue, markets);
        if (!group.shared && markets.length > 1) notes.push("markets_do_not_share_one_venue_group:checked_as_ad_hoc_event");
        const members: StructureMember[] = markets.map((m, i) => {
          const w = wanted[i];
          return {
            id: m.ref.marketId,
            label: m.title,
            status: m.status,
            tradable: m.tradable.ok,
            closesAtMs: ms(m.timesUtc.closesAt),
            disputeOrProposal: CONTESTED.has(m.status),
            yes: w?.yes === undefined ? null : (byToken.get(w.yes.tokenId) ?? null),
            no: w?.no === undefined ? null : (byToken.get(w.no.tokenId) ?? null),
            fee: m.fee,
          };
        });
        // Latest plausible resolution across members; any unknown member makes it unknown (fail closed).
        const resolutions = markets.map((m) => ms(m.timesUtc.latestResolutionAt) ?? ms(m.timesUtc.expectedResolutionAt) ?? ms(m.timesUtc.closesAt));
        const resolutionAtMs = resolutions.some((r) => r === null) ? null : Math.max(...(resolutions as number[]));

        notes.push("member_list_not_proven_complete");
        const structureGroup: StructureGroup = {
          venue: input.venue,
          key: group.key,
          kind: group.kind,
          exhaustive: group.exhaustive,
          membersComplete: false,
          members,
          resolutionAtMs,
        };

        const { market_ids: _ids, venue, ...rest } = input;
        void _ids;
        const options = structureOptionsFromInput({ venue, group_key: group.key, ...rest });
        const result = checkStructure(structureGroup, options, nowMs);
        if (!result.ok) throw failureError("BAD_INPUT", `${result.error}${result.detail === undefined ? "" : `: ${result.detail}`}`);
        const r = result.value;

        const structured = {
          ...r,
          toolNotes: notes,
          dataTerms: dataTermsOf({ nowMs, adapter: () => undefined }, input.venue),
          pmNotice: PM_NOTICE,
          fetchedAt: isoOf(nowMs),
        };
        const summary =
          `Structure check on ${input.venue} for ${plural(r.group.memberCount, "market")} (group ${r.group.kind}, exhaustive ${r.group.exhaustive}, member list not proven complete): ` +
          `${plural(r.summary.alerts, "alert")}, highest label ${r.summary.highestLabel ?? "none"}. ` +
          "Alerts are indicative checks of price relations, not arbitrage: no order is placed and no profit is promised.";
        return { summary, structured };
      }),
  );
}
