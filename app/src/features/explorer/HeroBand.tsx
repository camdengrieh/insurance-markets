// The hero band of the Markets surface (docs/design/cockpit-v2 Main.dc.html): the live dither field, the page's one
// h1 as a sentence with the computed number of venues this build reads, and three computed facts (held rows, link
// groups approved and proposed, the Quotient switch). Every value is derived from loaded data or is an empty state in
// words; the band never shows a sample count. The h1 inside it is the page's one heading (routes/home.tsx and
// routes/markets.tsx declare `hero: true`).

import type { ReactNode } from "react";

import { HeroBand as Band, Missing, Num, type HeroFact } from "../../ui";
import type { HoldingsState } from "../portfolio";
import { isProposed, showsInDefaultView, type LinkLoad } from "../signals/links/dataset";

export interface HeroCounts {
  readonly held: number;
  readonly linked: number;
  readonly signals: number;
}

export interface ExplorerHeroProps {
  // Venues whose reader runs in this build with the current settings; null until the settings are read.
  readonly venues: number | null;
  // Rows loaded right now, for the phone's label; null until a venue answered.
  readonly rows: number | null;
  readonly counts: HeroCounts | null;
  readonly holdings: HoldingsState["kind"];
  readonly links: LinkLoad | null;
  readonly quotient: "loading" | "off" | "on";
  readonly still?: boolean;
}

export const HERO_LEDE = "Prices come only from order books, or are labelled as display prices. A venue this build cannot reach says so in words. Nothing here signs or sends on its own.";

const NUMBER_WORDS: readonly string[] = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty"];

// "Every open market this build can read. Six venues, one book at a time." The count is the venues whose reader
// runs with the current settings, spelled out (a word, so the sentence needs no mono figure); before the settings
// are read the sentence names no number at all.
export function heroTitle(venues: number | null): string {
  const lead = "Every open market this build can read.";
  if (venues === null) return `${lead} One book at a time.`;
  const word = NUMBER_WORDS[venues] ?? String(venues);
  return `${lead} ${word} ${venues === 1 ? "venue" : "venues"}, one book at a time.`;
}

// Link groups in the loaded dataset: approved (the ones the default view shows) and proposed by the linker (a tier
// of their own, never proof). Counted over the dataset, never over titles.
export function linkGroupCounts(links: LinkLoad | null): { readonly approved: number; readonly proposed: number } | null {
  if (links === null || links.state !== "loaded") return null;
  let approved = 0;
  let proposed = 0;
  for (const link of links.dataset.links) {
    if (showsInDefaultView(link)) approved += 1;
    else if (isProposed(link)) proposed += 1;
  }
  return { approved, proposed };
}

// The rules' inks follow the boards: Held in the ink, Linked groups in the Yes blue, Quotient in the No rust. Before
// the link dataset has been read the linked figure is "not read yet", never a zero that would claim there are none.
export function heroFacts({ counts, holdings, links, quotient }: Pick<ExplorerHeroProps, "counts" | "holdings" | "links" | "quotient">): HeroFact[] {
  const held: HeroFact =
    holdings === "no_address"
      ? { label: "Held", value: <Missing label="none" />, note: "no address watched", tone: "ink" }
      : holdings === "no_venue"
        ? { label: "Held", value: <Missing label="none" />, note: "no venue selected", tone: "ink" }
        : holdings === "loading" || holdings === "reading"
          ? { label: "Held", value: <Missing label="not read yet" />, note: "reading positions", tone: "ink" }
          : holdings === "error"
            ? { label: "Held", value: <Missing label="not read" />, note: "positions could not be read", tone: "ink" }
            : { label: "Held", value: counts === null ? <Missing label="none loaded" /> : String(counts.held), note: counts === null ? "no rows loaded" : "rows held", tone: "ink" };
  const groups = linkGroupCounts(links);
  const linked: HeroFact =
    links === null
      ? { label: "Linked groups", value: <Missing label="not read yet" />, note: "reading the link dataset", tone: "yes" }
      : links.state === "absent"
        ? { label: "Linked groups", value: "0", note: "no link dataset in this build", tone: "yes" }
        : links.state === "rejected"
          ? { label: "Linked groups", value: "0", note: "dataset refused", tone: "yes" }
          : {
              label: "Linked groups",
              value: (
                <>
                  {String(groups?.approved ?? 0)} <span className="ui-hero-note">approved</span> · {String(groups?.proposed ?? 0)} <span className="ui-hero-note">proposed, not approved</span>
                </>
              ),
              tone: "yes",
            };
  const q: HeroFact =
    quotient === "on"
      ? { label: "Quotient", value: "on", note: counts === null ? "no rows loaded" : `${counts.signals} rows on covered venues`, tone: "no" }
      : quotient === "loading"
        ? { label: "Quotient", value: "off", note: "reading your setting", tone: "no" }
        : { label: "Quotient", value: "off", note: "licence first", tone: "no" };
  return [held, linked, q];
}

// The phone's label: "6 venues · 9 rows · 3 held", each part only when it is known.
function compactLabel({ venues, rows, counts, holdings }: Pick<ExplorerHeroProps, "venues" | "rows" | "counts" | "holdings">) {
  const parts: ReactNode[] = [];
  if (venues !== null) parts.push(<span key="venues"><Num>{String(venues)}</Num> {venues === 1 ? "venue" : "venues"}</span>);
  if (rows !== null) parts.push(<span key="rows"><Num>{String(rows)}</Num> {rows === 1 ? "row" : "rows"}</span>);
  if (holdings === "ready" && counts !== null) parts.push(<span key="held"><Num>{String(counts.held)}</Num> held</span>);
  if (parts.length === 0) return "Markets";
  return parts.flatMap((part, index) => (index === 0 ? [part] : [" · ", part]));
}

export function ExplorerHero({ venues, rows, counts, holdings, links, quotient, still = false }: ExplorerHeroProps) {
  return <Band title={heroTitle(venues)} lede={HERO_LEDE} facts={heroFacts({ counts, holdings, links, quotient })} still={still} compact={compactLabel({ venues, rows, counts, holdings })} />;
}
