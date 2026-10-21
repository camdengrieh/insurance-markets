// The hero band of the Markets surface: the live dither field and three computed facts (held rows, link
// candidates, the Quotient switch). Every value is derived from loaded data or is an empty state in words; the band
// never shows a sample count. The h1 inside it is the page's one heading (routes/home.tsx and routes/markets.tsx
// declare `hero: true`).

import { HeroBand as Band, Missing, type HeroFact } from "../../ui";
import type { HoldingsState } from "../portfolio";
import type { LinkLoad } from "../signals/links/dataset";

export interface HeroCounts {
  readonly held: number;
  readonly linked: number;
  readonly signals: number;
}

export interface ExplorerHeroProps {
  readonly title: string;
  readonly counts: HeroCounts | null;
  readonly holdings: HoldingsState["kind"];
  readonly links: LinkLoad | null;
  readonly quotient: "loading" | "off" | "on";
  readonly still?: boolean;
}

export const HERO_LEDE = "Every market this build can read, across the venues that are on. Prices come from order books or are labelled as display prices. A venue this build cannot reach says so in words. Nothing here signs or sends on its own.";

// The rules' inks follow the boards: Held in the ink, Linked rows in the Yes blue, Quotient in the No rust. The
// linked figure counts linked ROWS among the loaded ones (not groups), and before the link dataset has been read it
// is "not read yet", never a zero that would claim there are none.
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
  const linked: HeroFact =
    links === null
      ? { label: "Linked rows", value: <Missing label="not read yet" />, note: "reading the link dataset", tone: "yes" }
      : links.state === "absent"
        ? { label: "Linked rows", value: "0", note: "none approved", tone: "yes" }
        : links.state === "rejected"
          ? { label: "Linked rows", value: "0", note: "dataset refused", tone: "yes" }
          : { label: "Linked rows", value: counts === null ? <Missing label="none loaded" /> : String(counts.linked), note: counts === null ? "no rows loaded" : "candidates, not proof", tone: "yes" };
  const q: HeroFact =
    quotient === "on"
      ? { label: "Quotient", value: "on", note: counts === null ? "no rows loaded" : `${counts.signals} rows on covered venues`, tone: "no" }
      : quotient === "loading"
        ? { label: "Quotient", value: "off", note: "reading your setting", tone: "no" }
        : { label: "Quotient", value: "off", note: "licence first", tone: "no" };
  return [held, linked, q];
}

export function ExplorerHero({ title, counts, holdings, links, quotient, still = false }: ExplorerHeroProps) {
  return <Band title={title} lede={HERO_LEDE} facts={heroFacts({ counts, holdings, links, quotient })} still={still} />;
}
