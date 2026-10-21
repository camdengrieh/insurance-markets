// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { allText, cleanup, must, render } from "../../ui/testing/dom";
import { pinDataset, type LinkLoad } from "../signals/links/dataset";
import type { Link } from "../signals/links/schema";
import { ExplorerHero, heroFacts, heroTitle, linkGroupCounts } from "./HeroBand";

afterEach(cleanup);

const HASH = "a".repeat(64);
const CLOSE = "2026-12-31T00:00:00Z";

function link(id: string, state: Link["state"], proof: Link["proof"]): Link {
  return {
    linkId: id,
    relation: "identity",
    legs: [
      { venue: "polymarket", nativeId: `${id}-a`, rulesSha256: HASH, closeUtc: CLOSE, outcomeMap: [0, 1] },
      { venue: "xo", nativeId: `${id}-b`, rulesSha256: HASH, closeUtc: CLOSE, outcomeMap: [0, 1] },
    ],
    proof,
    state,
    basis: { class: "identical", axes: [] },
    validUntil: "2027-01-01T00:00:00Z",
  };
}

const loaded = (links: Link[]): LinkLoad => ({ state: "loaded", dataset: pinDataset({ schemaVersion: 1, release: "2026-10-20", links }) });

describe("the hero h1", () => {
  it("names the venue count it is given, spelled out, and no number before the settings are read", () => {
    expect(heroTitle(6)).toBe("Every open market this build can read. Six venues, one book at a time.");
    expect(heroTitle(1)).toBe("Every open market this build can read. One venue, one book at a time.");
    expect(heroTitle(0)).toBe("Every open market this build can read. No venues, one book at a time.");
    expect(heroTitle(null)).toBe("Every open market this build can read. One book at a time.");
    expect(heroTitle(40)).toBe("Every open market this build can read. 40 venues, one book at a time.");
  });
});

describe("the Linked groups fact", () => {
  it("splits approved and proposed groups from the loaded dataset, and counts nothing else", () => {
    const load = loaded([link("l1", "human_approved", "P4_human"), link("l2", "proposed", "P_unproven"), link("l3", "proposed", "P_unproven"), link("l4", "rejected", "P1_slot_equal")]);
    expect(linkGroupCounts(load)).toEqual({ approved: 1, proposed: 2 });
    expect(linkGroupCounts({ state: "absent" })).toBeNull();
    expect(linkGroupCounts(null)).toBeNull();
    const { container } = render(<ExplorerHero venues={3} rows={5} counts={{ held: 0, linked: 0, signals: 2 }} holdings="no_address" links={load} quotient="off" still />);
    const facts = [...container.querySelectorAll(".ui-hero-fact")].map((fact) => allText(fact));
    expect(facts[1]).toBe("Linked groups1 approved · 2 proposed, not approved");
    // The figures are set in mono, the words in Archivo.
    expect([...must(container, ".ui-hero-fact[data-tone='yes'] dd").querySelectorAll(".ui-hero-note")].map((note) => note.textContent)).toEqual(["approved", "proposed, not approved"]);
  });

  it("says what it does not know in words, never a zero that claims there are none", () => {
    const linkedOf = (links: LinkLoad | null) => heroFacts({ counts: null, holdings: "no_address", links, quotient: "off" })[1];
    expect(linkedOf(null)?.note).toBe("reading the link dataset");
    expect(linkedOf({ state: "absent" })?.note).toBe("no link dataset in this build");
    expect(linkedOf({ state: "rejected", reason: "schema" })?.note).toBe("dataset refused");
  });

  it("gives the phone a computed label only, hidden from assistive technology", () => {
    const { container } = render(<ExplorerHero venues={6} rows={9} counts={{ held: 3, linked: 0, signals: 2 }} holdings="ready" links={{ state: "absent" }} quotient="off" still />);
    const label = must(container, ".ui-hero-compact");
    expect(label.getAttribute("aria-hidden")).toBe("true");
    expect(allText(label)).toBe("6 venues · 9 rows · 3 held");
    expect([...label.querySelectorAll(".ui-num")].map((num) => num.textContent)).toEqual(["6", "9", "3"]);
    expect(must(container, "h1").textContent).toBe(heroTitle(6));
  });
});
