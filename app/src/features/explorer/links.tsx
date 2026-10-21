// Cross-venue links on the Markets surface (docs/dapp-design.md 4.5 "Linked groups", M3).
//
// No human-approved link dataset is bundled today (`[ML]` and `[AD]` are design only), so APPROVED_LINK_DATASET is
// null, every market has "no links", and the words say so. When a build bundles `features/signals/data/links.json`
// (hash-pinned, ids and hashes only: no titles, no prices), the lookups below name the OTHER legs of every approved
// link that names a market as CANDIDATES: a candidate is never proof, and no spread is drawn between candidates.
// Nothing here guesses a link from similar titles.

import type { MarketRef, VenueId } from "../../core/ports";
import { Badge, Tile } from "../../ui";
import { linksForLeg, type LinkLoad } from "../signals/links/dataset";
import type { Link, LinkLeg } from "../signals/links/schema";

// null: no human-approved dataset is bundled. The signals feature's loader (loadBundledLinks) answers "absent" for
// the same reason; both say "no links" until a person approves a set.
export const APPROVED_LINK_DATASET: null = null;

export interface LinkLookup {
  readonly state: "no_dataset" | "none_for_market" | "linked";
  readonly count: number;
}

export function linksFor(_ref: MarketRef): LinkLookup {
  return APPROVED_LINK_DATASET === null ? { state: "no_dataset", count: 0 } : { state: "none_for_market", count: 0 };
}

export function LinkBadge({ market }: { readonly market: MarketRef }) {
  const lookup = linksFor(market);
  return lookup.count === 0 ? <Badge tone="neutral">no links</Badge> : <Badge tone="info">{`${lookup.count} linked`}</Badge>;
}

export function LinkGroupPlaceholder({ market, heading = "h3" }: { readonly market: MarketRef; readonly heading?: "h3" | "h4" }) {
  const lookup = linksFor(market);
  return (
    <Tile tone="neutral" title="Linked groups: no links" heading={heading} dataKind="links-none" dataCode={lookup.state}>
      <p>
        No link dataset has been approved by a person yet, so this market is not shown next to any market on another venue. The app does not guess
        links from similar titles.
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
  | { readonly state: "candidates"; readonly candidates: readonly LinkCandidate[]; readonly hidden: number };

const MAX_CANDIDATES = 20;

export function candidatesFor(load: LinkLoad | null, ref: Pick<MarketRef, "venue" | "marketId">): CandidateLookup {
  if (load === null || load.state === "absent") return { state: "no_dataset" };
  if (load.state === "rejected") return { state: "rejected" };
  const { shown, hidden } = linksForLeg(load.dataset, { venue: ref.venue, nativeId: ref.marketId });
  const candidates: LinkCandidate[] = [];
  for (const link of shown) {
    for (const leg of link.legs) {
      if (leg.venue === ref.venue && leg.nativeId === ref.marketId) continue;
      if (candidates.length < MAX_CANDIDATES) candidates.push({ link, leg });
    }
  }
  if (candidates.length === 0 && hidden === 0) return { state: "none_for_market" };
  return { state: "candidates", candidates, hidden };
}

// The row keys (venue:marketId) of every loaded row that at least one shown link names, for the Linked view.
export function linkedRowKeys(load: LinkLoad | null, rows: ReadonlyArray<{ readonly venue: VenueId; readonly marketId: string }>): ReadonlySet<string> {
  const out = new Set<string>();
  if (load === null || load.state !== "loaded") return out;
  for (const row of rows) {
    if (linksForLeg(load.dataset, { venue: row.venue, nativeId: row.marketId }).shown.length > 0) out.add(`${row.venue}:${row.marketId}`);
  }
  return out;
}
