// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { LegObservation } from "../signals/links/verify";
import { pinDataset, type LinkLoad } from "../signals/links/dataset";
import type { Link, LinkLeg } from "../signals/links/schema";
import { allText, cleanup, must, render } from "../../ui/testing/dom";
import { NO_APPROVED_LINK, PROPOSED_HEADING, PROPOSED_NOTE, RULES_NOT_COMPARABLE, SameQuestion } from "./SameQuestion";
import { NOW, flush } from "./test-support";

afterEach(cleanup);

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const CLOSE = "2026-12-31T00:00:00Z";
const XO_ID = `0x${"1".repeat(64)}`;

function approved(): Link {
  return {
    linkId: "lk_approved",
    relation: "identity",
    legs: [
      { venue: "polymarket", nativeId: "4329882", rulesSha256: HASH_A, closeUtc: CLOSE, outcomeMap: [0, 1] },
      { venue: "xo", nativeId: XO_ID, rulesSha256: HASH_B, closeUtc: CLOSE, outcomeMap: [0, 1] },
    ],
    proof: "P4_human",
    state: "human_approved",
    basis: { class: "identical", axes: [] },
    validUntil: "2027-01-01T00:00:00Z",
  };
}

function proposed(): Link {
  return {
    linkId: "lnk_" + "2".repeat(32),
    relation: "near_identity",
    legs: [
      { venue: "limitless", nativeId: "alpha-rovers-win", rulesSha256: HASH_A, maskedSha256: HASH_B, closeUtc: CLOSE, outcomeMap: [0, 1], category: "sports" },
      { venue: "xo", nativeId: XO_ID, rulesSha256: HASH_B, maskedSha256: HASH_A, closeUtc: CLOSE, outcomeMap: [0, 1], category: "sports" },
    ],
    proof: "P_unproven",
    state: "proposed",
    basis: { class: "settlement_window", axes: ["timing"] },
    validUntil: CLOSE,
    band: "good",
  };
}

const loaded = (links: Link[], rulesRecipe?: string): LinkLoad => ({ state: "loaded", dataset: { ...pinDataset({ schemaVersion: 1, release: "2026-10-20", links }), ...(rulesRecipe === undefined ? {} : { rulesRecipe }) } });
// Every leg reads back exactly as pinned.
const readPinned = async (leg: LinkLeg): Promise<LegObservation> => ({ state: "read", rulesSha256: leg.rulesSha256, closesAtUtc: leg.closeUtc, status: "active" });
const nowMs = () => NOW;

describe("the proposed (not approved) tier", () => {
  it("shows the proposal below the approved legs with venue, id, category, band words and a re-check, and no spread", async () => {
    const { container } = render(<SameQuestion market={{ venue: "xo", marketId: XO_ID }} load={loaded([approved(), proposed()])} readLeg={readPinned} nowMs={nowMs} variant="full" />);
    await flush();
    const text = allText(container);
    expect(text).toContain("Candidates from approved links");
    const tier = must(container, "[data-links='proposed']");
    expect(tier.getAttribute("data-count")).toBe("1");
    const tierText = allText(tier);
    expect(tierText).toContain(PROPOSED_HEADING);
    expect(tierText).toContain("Limitless");
    expect(tierText).toContain("alpha-rovers-win");
    expect(tierText).toContain("sports");
    expect(tierText).toContain("good match");
    expect(tierText).toContain("proposed, not approved");
    expect(tierText).toContain("near identity");
    expect(tierText).toContain("re-checked now: verified now");
    expect(tierText).toContain(PROPOSED_NOTE);
    expect(allText(must(tier, "[data-why-not-arbitrage='proposed']"))).toContain("Why this is not arbitrage");
    // Words, never a bare float, and no spread anywhere.
    expect(/\b0\.\d+\b/.test(tierText)).toBe(false);
    expect(container.querySelector("[data-spread-label]")).toBeNull();
    expect(tierText.toLowerCase()).not.toContain("spread label");
    // The tier sits below the approved legs.
    const approvedBlock = must(container, "[data-links='candidates']");
    expect(approvedBlock.compareDocumentPosition(tier) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("with proposals only, the approved tier says there is no approved link and the proposal still shows (compact and full)", async () => {
    for (const variant of ["compact", "full"] as const) {
      const { container } = render(<SameQuestion market={{ venue: "limitless", marketId: "alpha-rovers-win" }} load={loaded([proposed()])} readLeg={readPinned} nowMs={nowMs} variant={variant} />);
      await flush();
      expect(allText(must(container, "[data-links='none']"))).toContain(NO_APPROVED_LINK);
      const tier = must(container, "[data-links='proposed']");
      expect(allText(tier)).toContain("XO");
      expect(allText(tier)).toContain(XO_ID);
      expect(allText(tier)).toContain("Why this is not arbitrage");
      cleanup();
    }
  });

  it("a dataset hashed with another recipe re-checks close time and status only and says so", async () => {
    const { container } = render(<SameQuestion market={{ venue: "xo", marketId: XO_ID }} load={loaded([proposed()], "rules-v2")} readLeg={readPinned} nowMs={nowMs} variant="compact" />);
    await flush();
    const tier = must(container, "[data-links='proposed']");
    expect(allText(tier)).toContain(RULES_NOT_COMPARABLE);
    // Unknown never counts as a match: the badge says not verified, not suspended.
    expect(allText(tier)).toContain("re-checked now: not verified");
    expect(allText(tier)).not.toContain("suspended");
  });

  it("a changed close time on a venue suspends the proposal's re-check", async () => {
    const moved = async (leg: LinkLeg): Promise<LegObservation> => ({ state: "read", rulesSha256: leg.rulesSha256, closesAtUtc: "2026-12-30T00:00:00Z", status: "active" });
    const { container } = render(<SameQuestion market={{ venue: "xo", marketId: XO_ID }} load={loaded([proposed()], "rules-v2")} readLeg={moved} nowMs={nowMs} variant="compact" />);
    await flush();
    expect(allText(must(container, "[data-links='proposed']"))).toContain("re-checked now: suspended");
  });

  it("the empty states stay honest: no dataset, a rejected one, and a dataset with nothing for this market", async () => {
    const none = render(<SameQuestion market={{ venue: "xo", marketId: XO_ID }} load={{ state: "absent" }} readLeg={readPinned} nowMs={nowMs} variant="compact" />);
    expect(allText(none.container)).toContain(NO_APPROVED_LINK);
    expect(none.container.querySelector("[data-links='proposed']")).toBeNull();
    cleanup();
    const rejected = render(<SameQuestion market={{ venue: "xo", marketId: XO_ID }} load={{ state: "rejected", reason: "hash_mismatch" }} readLeg={readPinned} nowMs={nowMs} variant="full" />);
    expect(allText(rejected.container)).toContain("refused whole");
    expect(rejected.container.querySelector("[data-links='proposed']")).toBeNull();
    cleanup();
    const empty = render(<SameQuestion market={{ venue: "xo", marketId: XO_ID }} load={loaded([])} readLeg={readPinned} nowMs={nowMs} variant="full" />);
    expect(allText(empty.container)).toContain("Linked groups: no links");
    expect(empty.container.querySelector("[data-links='proposed']")).toBeNull();
  });
});
