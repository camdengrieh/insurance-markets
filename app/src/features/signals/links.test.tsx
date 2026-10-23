// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { Status } from "../../core/ports";
import { cleanup } from "../../ui/testing/dom";
import { capSpreadLabel } from "./quotient";
import { fakeEntry, market as fakeMarket } from "../explorer/test-support";
import { DATASET_STALE_AFTER_DAYS, canonicalJson, datasetAge, linksForLeg, loadBundledLinks, parseLinkDataset, pinDataset, showsInDefaultView } from "./links/dataset";
import { linkDatasetSchema, type Link } from "./links/schema";
import { linkLabel, verifyLink, type LegObservation } from "./links/verify";
import { legReaderOver } from "./services";
import { NOW } from "./test-support";

afterEach(cleanup);

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const CLOSE = "2026-12-31T00:00:00Z";

function link(overrides: Partial<Link> = {}): Link {
  return {
    linkId: "lk_1",
    relation: "identity",
    legs: [
      { venue: "polymarket", nativeId: "4329882", quotientKey: "polymarket:4329882", rulesSha256: HASH_A, closeUtc: CLOSE, outcomeMap: [0, 1] },
      { venue: "xo", nativeId: `0x${"1".repeat(64)}`, rulesSha256: HASH_B, closeUtc: CLOSE, outcomeMap: [0, 1] },
    ],
    proof: "P2_template",
    state: "template_approved",
    basis: { class: "identical", axes: [] },
    validUntil: "2027-01-01T00:00:00Z",
    ...overrides,
  };
}

const dataset = (links: Link[], release = "2026-10-01") => pinDataset({ schemaVersion: 1, release, links });
const seen = (rulesSha256: string | null = HASH_A, closesAtUtc: string | null = CLOSE, status: Status | null = "active"): LegObservation => ({ state: "read", rulesSha256, closesAtUtc, status });

describe("the link dataset format (R2: ids and hashes, no text)", () => {
  it("accepts a pinned dataset and refuses one whose content hash is wrong", () => {
    const good = dataset([link()]);
    expect(parseLinkDataset(good).state).toBe("loaded");
    const tampered = { ...good, links: [link({ linkId: "lk_2" })] };
    expect(parseLinkDataset(tampered)).toEqual({ state: "rejected", reason: "hash_mismatch" });
  });

  it("refuses a dataset with no content hash", () => {
    const { contentSha256: _dropped, ...unpinned } = dataset([link()]);
    expect(parseLinkDataset(unpinned)).toEqual({ state: "rejected", reason: "schema" });
  });

  it("refuses any title, price or rules text smuggled into a link or a leg", () => {
    const withTitle = { ...link(), title: "Will it rain?" };
    expect(linkDatasetSchema.safeParse({ ...dataset([link()]), links: [withTitle] }).success).toBe(false);
    const leg = { ...link().legs[0], price: "0.55" };
    expect(linkDatasetSchema.safeParse({ ...dataset([link()]), links: [{ ...link(), legs: [leg, link().legs[1]] }] }).success).toBe(false);
    expect(parseLinkDataset("not an object")).toEqual({ state: "rejected", reason: "not_an_object" });
    expect(parseLinkDataset([])).toEqual({ state: "rejected", reason: "not_an_object" });
  });

  it("canonical JSON ignores key order, so the pin does not depend on how the file was written", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(canonicalJson({ a: [{ c: 2, d: 1 }], b: 1 }));
  });

  it("shows only approved links with a proof level fit for the default view", () => {
    expect(showsInDefaultView(link())).toBe(true);
    expect(showsInDefaultView(link({ proof: "P0_native", state: "human_approved" }))).toBe(true);
    expect(showsInDefaultView(link({ proof: "P4_human", state: "executable_eligible" }))).toBe(true);
    expect(showsInDefaultView(link({ proof: "P1_slot_equal" }))).toBe(false);
    expect(showsInDefaultView(link({ proof: "P3_llm_assisted" }))).toBe(false);
    expect(showsInDefaultView(link({ state: "proposed" }))).toBe(false);
    expect(showsInDefaultView(link({ state: "suspended" }))).toBe(false);
  });

  it("finds links by Quotient key or by venue and id, and counts the hidden candidates", () => {
    const set = dataset([link(), link({ linkId: "lk_2", proof: "P3_llm_assisted" }), link({ linkId: "lk_3", legs: [{ ...link().legs[0]!, quotientKey: "polymarket:1", nativeId: "1" }, link().legs[1]!] })]);
    const byKey = linksForLeg(set, { quotientKey: "polymarket:4329882" });
    expect(byKey.shown.map((l) => l.linkId)).toEqual(["lk_1"]);
    expect(byKey.hidden).toBe(1);
    expect(linksForLeg(set, { venue: "polymarket", nativeId: "1" }).shown.map((l) => l.linkId)).toEqual(["lk_3"]);
    expect(linksForLeg(set, { quotientKey: "kalshi:NOPE" })).toEqual({ shown: [], hidden: 0 });
  });

  it("ages a dataset", () => {
    expect(datasetAge(dataset([]), Date.parse("2026-10-11T00:00:00Z"))).toEqual({ days: 10, stale: false });
    expect(datasetAge(dataset([]), Date.parse("2026-10-01T00:00:00Z") + (DATASET_STALE_AFTER_DAYS + 1) * 86_400_000).stale).toBe(true);
  });
});

describe("loading the bundled file", () => {
  it("answers 'absent' when no links.json is bundled, and the file the linker commits always loads", async () => {
    expect(await loadBundledLinks({})).toEqual({ state: "absent" });
    // The scheduled linker's pull request adds src/features/signals/data/links.json; before it lands there is none.
    expect(["absent", "loaded"]).toContain((await loadBundledLinks()).state);
  });

  it("loads a valid file, rejects an invalid one whole, and never throws", async () => {
    expect((await loadBundledLinks({ "./data/links.json": async () => dataset([link()]) })).state).toBe("loaded");
    expect(await loadBundledLinks({ "./data/links.json": async () => ({ schemaVersion: 1 }) })).toEqual({ state: "rejected", reason: "schema" });
    expect(await loadBundledLinks({ "./data/links.json": async () => Promise.reject(new Error("boom")) })).toEqual({ state: "rejected", reason: "schema" });
  });
});

// ---- M3-9: a changed hash suspends -------------------------------------------------------------------------------------------------------

describe("M3-9: verification suspends a link on any change", () => {
  const NOW_MS = NOW;

  it("verifies when every leg matches, ignoring the case of the hash and the form of the time", () => {
    const verdict = verifyLink(link(), [seen(HASH_A.toUpperCase(), "2026-12-31T00:00:00.000Z"), seen(HASH_B)], NOW_MS);
    expect(verdict).toMatchObject({ state: "verified", reasons: [] });
  });

  it("suspends on a changed rules hash, naming the leg", () => {
    const verdict = verifyLink(link(), [seen(HASH_A), seen("c".repeat(64))], NOW_MS);
    expect(verdict.state).toBe("suspended");
    expect(verdict.reasons).toContain("rules_hash_changed");
    expect(verdict.legs.map((leg) => leg.rules)).toEqual(["match", "changed"]);
  });

  it("suspends on a changed close time", () => {
    const verdict = verifyLink(link(), [seen(HASH_A, "2026-12-30T00:00:00Z"), seen(HASH_B)], NOW_MS);
    expect(verdict.state).toBe("suspended");
    expect(verdict.reasons).toContain("close_time_changed");
  });

  it("a change wins over something unreadable", () => {
    const verdict = verifyLink(link(), [{ state: "unavailable" }, seen("d".repeat(64))], NOW_MS);
    expect(verdict.state).toBe("suspended");
    expect(verdict.reasons).toEqual(expect.arrayContaining(["leg_unreadable", "rules_hash_changed"]));
  });

  it("unknown is never a match: an unreadable leg, a missing hash, a missing close time and a missing observation", () => {
    expect(verifyLink(link(), [{ state: "unavailable" }, seen(HASH_B)], NOW_MS).state).toBe("unverified");
    expect(verifyLink(link(), [seen(null), seen(HASH_B)], NOW_MS)).toMatchObject({ state: "unverified", reasons: ["rules_hash_unavailable"] });
    expect(verifyLink(link(), [seen(HASH_A, null), seen(HASH_B)], NOW_MS)).toMatchObject({ state: "unverified", reasons: ["close_time_unknown"] });
    expect(verifyLink(link(), [seen(HASH_A, "garbage"), seen(HASH_B)], NOW_MS).state).toBe("unverified");
    expect(verifyLink(link(), [], NOW_MS).state).toBe("unverified");
    expect(verifyLink(link(), [seen("not hex"), seen(HASH_B)], NOW_MS).reasons).toContain("rules_hash_unavailable");
  });

  // A3: a leg that is no longer open is not "verified now", whatever its rules hash and close time say.
  it("suspends when a leg is closed, determined, disputed, resolved, voided, paused or not yet open", () => {
    for (const status of ["closed", "determined", "disputed", "resolved", "voided", "paused", "pending"] as const) {
      const verdict = verifyLink(link(), [seen(HASH_A), seen(HASH_B, CLOSE, status)], NOW_MS);
      expect(verdict.state, status).toBe("suspended");
      expect(verdict.reasons, status).toContain("leg_not_active");
      expect(verdict.legs.map((leg) => leg.status)).toEqual(["match", "changed"]);
    }
  });

  it("a status the reader could not give is never a match", () => {
    for (const status of [null, "unknown"] as const) {
      expect(verifyLink(link(), [seen(HASH_A, CLOSE, status), seen(HASH_B)], NOW_MS)).toMatchObject({ state: "unverified", reasons: ["leg_status_unknown"] });
    }
  });

  it("an expired link is never verified, even when every leg matches", () => {
    const verdict = verifyLink(link({ validUntil: "2026-10-18T17:35:00Z" }), [seen(HASH_A), seen(HASH_B)], NOW_MS);
    expect(verdict.state).toBe("expired");
    expect(verifyLink(link({ validUntil: "2026-10-18T17:34:59Z" }), [seen(HASH_A), seen(HASH_B)], NOW_MS).state).toBe("expired");
  });
});

describe("the leg reader reports the leg's live status (A3)", () => {
  it("passes the market's status through, so a closed leg can suspend the link", async () => {
    const entry = fakeEntry("xo", { detail: { market: { ...fakeMarket("xo", "m1"), status: "closed" }, notes: [], settlement: null } });
    const read = await legReaderOver({ xo: entry })({ venue: "xo", nativeId: "m1", rulesSha256: HASH_A, closeUtc: CLOSE, outcomeMap: [0, 1] });
    expect(read).toMatchObject({ state: "read", status: "closed" });
  });
});

// ---- M3-10 for links ------------------------------------------------------------------------------------------------------------------------

describe("M3-10: no label above hedged_discrepancy", () => {
  const verified = verifyLink(link(), [seen(HASH_A), seen(HASH_B)], NOW);
  const suspended = verifyLink(link(), [seen("c".repeat(64)), seen(HASH_B)], NOW);

  it("is indicative unless the link is verified, both books are available and the class passed its bound", () => {
    expect(linkLabel(link(), verified, { bothAvailable: false })).toEqual({ label: "indicative", reason: "leg_book_unavailable" });
    expect(linkLabel(link(), verified, { bothAvailable: true })).toEqual({ label: "indicative", reason: "class_bound_unproven" });
    expect(linkLabel(link({ bound: "unproven" }), verified, { bothAvailable: true }).label).toBe("indicative");
    expect(linkLabel(link({ bound: "passed" }), suspended, { bothAvailable: true })).toEqual({ label: "indicative", reason: "link_not_verified" });
    expect(linkLabel(link({ bound: "passed" }), verified, { bothAvailable: true })).toEqual({ label: "hedged_discrepancy", reason: "bound_passed" });
  });

  it("the cap turns every label above the ceiling, and every unknown one, into indicative", () => {
    for (const above of ["executable_arbitrage", "arbitrage", "risk_free", "", "HEDGED_DISCREPANCY", null, undefined, 3]) expect(capSpreadLabel(above)).toBe("indicative");
    expect(capSpreadLabel("hedged_discrepancy")).toBe("hedged_discrepancy");
  });
});
