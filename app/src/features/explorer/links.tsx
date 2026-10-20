// Cross-venue links: a placeholder until a human-approved dataset exists (docs/dapp-design.md 4.5 "Linked groups",
// M3). `[ML]` and `[AD]` are design only and no link dataset has been reviewed, so every market has "no links".
// Nothing here guesses a link from similar titles: a link needs proof (P0 to P4) and a reviewer.

import type { MarketRef } from "../../core/ports";
import { Badge, Tile } from "../../ui";

// null: no human-approved dataset is bundled. A loader for `links.json` replaces this later; until then the lookup
// below answers "none" for every market and the UI says so.
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
