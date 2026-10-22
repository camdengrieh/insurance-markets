// Cross-venue links on the Markets surface (docs/dapp-design.md 4.5 "Linked groups", M3).
//
// The links come from the dataset the build bundles (features/signals/data/links.json, written by the linker's
// export-app step: hash-pinned, ids and hashes only, no titles, no prices) and loaded by signals/links/dataset.ts.
// The lookups below name the OTHER legs of every approved link that names a market as CANDIDATES: a candidate is
// never proof, and no spread is drawn between candidates. Nothing here guesses a link from similar titles.

import type { MarketRef, VenueId } from "../../core/ports";
import { Tile } from "../../ui";
import { linksForLeg, proposedForLeg, type LinkLoad } from "../signals/links/dataset";
import type { Link, LinkLeg } from "../signals/links/schema";

// The tile for a market no approved link names, worded for why: this build bundles no link file, or the file it
// bundles names no link for this market.
export function LinkGroupEmpty({ state, heading = "h3" }: { readonly state: "no_dataset" | "none_for_market"; readonly heading?: "h3" | "h4" }) {
  return (
    <Tile tone="neutral" title="Linked groups: no links" heading={heading} dataKind="links-none" dataCode={state}>
      <p>
        {state === "no_dataset"
          ? "This build bundles no link file, so this market is not shown next to any market on another venue."
          : "No approved link in the bundled link file names this market, so it is not shown next to any market on another venue."}{" "}
        The app does not guess links from similar titles.
      </p>
      <p>A gap between two venues is not an arbitrage: the rules, the resolver, the close time and the fees can all differ.</p>
    </Tile>
  );
}

// ---- candidates from a loaded dataset ------------------------------------------------------------------------------------

// One other leg of a link that names this market: the venue and the id the other venue's reader takes, plus the
// link it came from (its proof level and state are shown beside it). Never a title, never a price.
export interface LinkCandidate {
  readonly link: Link;
  readonly leg: LinkLeg;
}

export type CandidateLookup =
  | { readonly state: "no_dataset" }
  | { readonly state: "rejected" }
  | { readonly state: "none_for_market" }
  // candidates: the other legs of APPROVED links. proposed: the other legs of links the linker (or a person)
  // proposed and no person approved: a tier of their own, never a leg, never a spread.
  | { readonly state: "candidates"; readonly candidates: readonly LinkCandidate[]; readonly proposed: readonly LinkCandidate[]; readonly hidden: number };

const MAX_CANDIDATES = 20;

function otherLegs(links: readonly Link[], ref: Pick<MarketRef, "venue" | "marketId">): LinkCandidate[] {
  const out: LinkCandidate[] = [];
  for (const link of links) {
    for (const leg of link.legs) {
      if (leg.venue === ref.venue && leg.nativeId === ref.marketId) continue;
      if (out.length < MAX_CANDIDATES) out.push({ link, leg });
    }
  }
  return out;
}

export function candidatesFor(load: LinkLoad | null, ref: Pick<MarketRef, "venue" | "marketId">): CandidateLookup {
  if (load === null || load.state === "absent") return { state: "no_dataset" };
  if (load.state === "rejected") return { state: "rejected" };
  const match = { venue: ref.venue, nativeId: ref.marketId };
  const { shown, hidden: hiddenAll } = linksForLeg(load.dataset, match);
  const proposedLinks = proposedForLeg(load.dataset, match);
  const candidates = otherLegs(shown, ref);
  const proposed = otherLegs(proposedLinks, ref);
  // Proposals have their own tier, so they are not "hidden" here.
  const hidden = hiddenAll - proposedLinks.length;
  if (candidates.length === 0 && proposed.length === 0 && hidden === 0) return { state: "none_for_market" };
  return { state: "candidates", candidates, proposed, hidden };
}

// The row keys (venue:marketId) of every loaded row that at least one shown link names, for the Linked view.
// With `candidates: true` a row named only by a proposed (not approved) link counts too, so the Linked chip
// can count candidate groups; the default keeps the approved-only behaviour.
export function linkedRowKeys(
  load: LinkLoad | null,
  rows: ReadonlyArray<{ readonly venue: VenueId; readonly marketId: string }>,
  options: { readonly candidates?: boolean } = {},
): ReadonlySet<string> {
  const out = new Set<string>();
  if (load === null || load.state !== "loaded") return out;
  for (const row of rows) {
    const match = { venue: row.venue, nativeId: row.marketId };
    if (linksForLeg(load.dataset, match).shown.length > 0 || (options.candidates === true && proposedForLeg(load.dataset, match).length > 0)) out.add(`${row.venue}:${row.marketId}`);
  }
  return out;
}

// The row keys named only by proposed links (a pure helper for counts and tests).
export function candidateRowKeys(load: LinkLoad | null, rows: ReadonlyArray<{ readonly venue: VenueId; readonly marketId: string }>): ReadonlySet<string> {
  const out = new Set<string>();
  if (load === null || load.state !== "loaded") return out;
  for (const row of rows) {
    if (proposedForLeg(load.dataset, { venue: row.venue, nativeId: row.marketId }).length > 0) out.add(`${row.venue}:${row.marketId}`);
  }
  return out;
}
