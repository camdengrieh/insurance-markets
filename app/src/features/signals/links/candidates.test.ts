import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { candidateRowKeys, candidatesFor, linkedRowKeys } from "../../explorer/links";
import { APP_RULES_RECIPE, isProposed, linksForLeg, parseLinkDataset, pinDataset, proposedForLeg, rulesComparable, type LinkLoad } from "./dataset";
import { linkDatasetSchema, type Link } from "./schema";

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

// The shape pm/linker/main.ts export-app writes: a near_identity proposal with P_unproven proof, a category per
// leg and a band word (docs/linker-runbook.md section 8).
function proposed(): Link {
  return {
    linkId: "lnk_" + "2".repeat(32),
    relation: "near_identity",
    legs: [
      { venue: "limitless", nativeId: "alpha-rovers-win", rulesSha256: HASH_A, maskedSha256: HASH_B, closeUtc: CLOSE, outcomeMap: [0, 1], category: "sports" },
      { venue: "xo", nativeId: XO_ID, rulesSha256: HASH_B, maskedSha256: HASH_A, closeUtc: "2026-12-31T05:00:00Z", outcomeMap: [0, 1], category: "sports" },
    ],
    proof: "P_unproven",
    state: "proposed",
    basis: { class: "settlement_window", axes: ["timing"] },
    validUntil: CLOSE,
    band: "good",
  };
}

const dataset = (links: Link[], extra: { rulesRecipe?: string } = {}) => ({ ...pinDataset({ schemaVersion: 1, release: "2026-10-20", links }), ...extra });

describe("proposed (not approved) links in the dataset", () => {
  it("the schema takes the linker's export fields and still refuses text", () => {
    expect(linkDatasetSchema.safeParse(dataset([approved(), proposed()], { rulesRecipe: "rules-v2" })).success).toBe(true);
    expect(linkDatasetSchema.safeParse({ ...dataset([proposed()]), links: [{ ...proposed(), title: "Will it?" }] }).success).toBe(false);
    expect(linkDatasetSchema.safeParse({ ...dataset([proposed()]), links: [{ ...proposed(), band: "0.83" }] }).success).toBe(false);
    expect(linkDatasetSchema.safeParse({ ...dataset([proposed()]), links: [{ ...proposed(), legs: [{ ...proposed().legs[0]!, category: "Sports News" }, proposed().legs[1]!] }] }).success).toBe(false);
  });

  it("a proposal is never in the default view and is indexed on its own", () => {
    expect(isProposed(proposed())).toBe(true);
    expect(isProposed(approved())).toBe(false);
    const set = dataset([approved(), proposed()]);
    const index = linksForLeg(set, { venue: "xo", nativeId: XO_ID });
    expect(index.shown.map((l) => l.linkId)).toEqual(["lk_approved"]);
    // The index counts a proposal among the not-shown links, as before; its own tier lists it.
    expect(index.hidden).toBe(1);
    expect(proposedForLeg(set, { venue: "xo", nativeId: XO_ID }).map((l) => l.linkId)).toEqual([proposed().linkId]);
    expect(proposedForLeg(set, { venue: "polymarket", nativeId: "4329882" })).toEqual([]);
  });

  it("candidatesFor returns approved legs and proposed legs apart, and the Linked rows count proposals only on request", () => {
    const load: LinkLoad = { state: "loaded", dataset: dataset([approved(), proposed()]) };
    const lookup = candidatesFor(load, { venue: "xo", marketId: XO_ID });
    expect(lookup.state).toBe("candidates");
    if (lookup.state !== "candidates") return;
    expect(lookup.candidates.map((c) => c.leg.venue)).toEqual(["polymarket"]);
    expect(lookup.proposed.map((c) => [c.leg.venue, c.leg.category, c.link.band])).toEqual([["limitless", "sports", "good"]]);
    expect(lookup.hidden).toBe(0);
    const onlyProposed = candidatesFor(load, { venue: "limitless", marketId: "alpha-rovers-win" });
    expect(onlyProposed.state).toBe("candidates");
    if (onlyProposed.state === "candidates") {
      expect(onlyProposed.candidates).toEqual([]);
      expect(onlyProposed.proposed).toHaveLength(1);
    }
    const rows = [
      { venue: "xo" as const, marketId: XO_ID },
      { venue: "limitless" as const, marketId: "alpha-rovers-win" },
      { venue: "polymarket" as const, marketId: "nope" },
    ];
    expect([...linkedRowKeys(load, rows)]).toEqual([`xo:${XO_ID}`]);
    expect([...linkedRowKeys(load, rows, { candidates: true })].sort()).toEqual([`limitless:alpha-rovers-win`, `xo:${XO_ID}`].sort());
    expect([...candidateRowKeys(load, rows)].sort()).toEqual([`limitless:alpha-rovers-win`, `xo:${XO_ID}`].sort());
    expect([...linkedRowKeys({ state: "absent" }, rows, { candidates: true })]).toEqual([]);
  });

  it("rules fingerprints are comparable only when the recipe is this page's own", () => {
    expect(APP_RULES_RECIPE).toBe("app-v1");
    expect(rulesComparable(dataset([]))).toBe(true);
    expect(rulesComparable(dataset([], { rulesRecipe: "app-v1" }))).toBe(true);
    expect(rulesComparable(dataset([], { rulesRecipe: "rules-v2" }))).toBe(false);
  });

  it("loads the sample the linker's export writes (pm/test/linker/fixtures/app-dataset.sample.json)", () => {
    const raw = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "..", "..", "pm", "test", "linker", "fixtures", "app-dataset.sample.json"), "utf8")) as unknown;
    const load = parseLinkDataset(raw);
    expect(load.state).toBe("loaded");
    if (load.state !== "loaded") return;
    expect(load.dataset.rulesRecipe).toBe("rules-v2");
    expect(rulesComparable(load.dataset)).toBe(false);
    const proposals = load.dataset.links.filter(isProposed);
    expect(proposals.length).toBeGreaterThan(0);
    // Statistical proposals carry a band; a native-group proposal (partition from a neg-risk id) carries provenance instead.
    const statistical = proposals.filter((l) => l.proof === "P_unproven");
    expect(statistical.length).toBeGreaterThan(0);
    expect(statistical.every((l) => l.band !== undefined)).toBe(true);
    expect(proposals.filter((l) => l.proof === "P0_native").every((l) => l.relation === "partition" && l.band === undefined)).toBe(true);
    expect(proposals.every((l) => l.legs.every((leg) => leg.category !== undefined))).toBe(true);
    // Every leg is an id and hashes; no text sneaks in (the schema is strict, and the words below never appear).
    expect(/"(title|question|rules|description)"|Resolves|Alpha/.test(JSON.stringify(load.dataset))).toBe(false);
  });
});
