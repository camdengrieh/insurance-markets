import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { approvedByAPerson, buildGroups, loadBundle } from "../../api/groups.js";
import type { Link } from "../../sdk/links/schema.js";
import { emptyRegistry, findLink } from "../../sdk/links/store.js";
import { approve, Clock, forbiddenFetch, identity, leg, propose, SLOT_EQUAL, startHarness, STATISTICS, testConfig, writeBundle } from "./helpers.js";

// GET /v1/groups: approved links only when a person approved them, every candidate as "proposed" with its band, on every
// venue (one the API has no reader for included). The links are TEST inputs (ids start with TEST-, hashes are of invented
// labels), proposed and approved through the SDK's own registry functions and bundled with their pin.

const NOW = Date.parse("2026-10-22T12:00:00Z");

function registry() {
  let reg = emptyRegistry();
  const approvedTrueo = propose(reg, identity(leg("trueo", "a1"), leg("trueo", "a2", "a1"), SLOT_EQUAL), "structural");
  reg = approvedTrueo.registry;
  const proposedTrueo = propose(reg, identity(leg("trueo", "p1"), leg("trueo", "p2"), STATISTICS), "statistics");
  reg = proposedTrueo.registry;
  const proposedPolymarket = propose(reg, identity(leg("trueo", "u1"), leg("polymarket", "u2"), STATISTICS), "statistics");
  reg = proposedPolymarket.registry;
  const approvedKalshi = propose(reg, identity(leg("trueo", "k1"), leg("kalshi", "k2", "k1"), SLOT_EQUAL), "structural");
  reg = approvedKalshi.registry;
  // Opinion has no reader in the API: its link is served all the same, and a quote states the leg it cannot read.
  const approvedOpinion = propose(reg, identity(leg("trueo", "o1"), leg("opinion", "o2", "o1"), SLOT_EQUAL), "structural");
  reg = approvedOpinion.registry;
  reg = approve(reg, approvedTrueo.link.linkId);
  reg = approve(reg, approvedKalshi.link.linkId);
  reg = approve(reg, approvedOpinion.link.linkId);
  return {
    reg,
    ids: { approvedTrueo: approvedTrueo.link.linkId, proposedTrueo: proposedTrueo.link.linkId, proposedPolymarket: proposedPolymarket.link.linkId, approvedKalshi: approvedKalshi.link.linkId, approvedOpinion: approvedOpinion.link.linkId },
  };
}

const sorted = (ids: string[]): string[] => [...ids].sort();

test("approved only when a person approved it, candidates proposed with their band, on every venue", () => {
  const dir = mkdtempSync(join(tmpdir(), "api-groups-"));
  const { reg, ids } = registry();
  const approved = loadBundle(writeBundle(dir, "links", reg, false));
  const candidates = loadBundle(writeBundle(dir, "candidates", reg, true));
  assert.equal(approved.state, "loaded");
  assert.equal(candidates.state, "loaded");
  const answer = buildGroups(approved, candidates, NOW);
  assert.deepEqual(answer.approved.map((l) => l.linkId), sorted([ids.approvedTrueo, ids.approvedKalshi, ids.approvedOpinion]));
  assert.ok(answer.approved.every((l) => l.state === "human_approved"));
  assert.deepEqual(answer.proposed.map((l) => l.linkId), sorted([ids.proposedTrueo, ids.proposedPolymarket]));
  assert.ok(answer.proposed.every((l) => l.state === "proposed" && l.band === "strong"));
  assert.equal(answer.withheld.count, 0);
  // Ids, hashes, close times and outcome maps only: no text field rides along.
  for (const link of [...answer.approved, ...answer.proposed]) for (const l of link.legs) assert.deepEqual(Object.keys(l).sort(), ["closeUtc", "maskedSha256", "nativeId", "outcomeMap", "rulesSha256", "venue"]);
});

test("a record that says approved without a recorded approval is served as proposed at most", () => {
  const { reg, ids } = registry();
  const link = findLink(reg, ids.approvedTrueo) as Link;
  assert.equal(approvedByAPerson(link), true);
  assert.equal(approvedByAPerson({ ...link, approvals: [] }), false);
  assert.equal(approvedByAPerson({ ...link, state: "candidate" }), false);
});

test("a bundle that does not match its pin, or is not a bundle, is refused whole and the answer says so", async () => {
  const dir = mkdtempSync(join(tmpdir(), "api-groups-"));
  const { reg } = registry();
  const files = writeBundle(dir, "candidates", reg, true);
  writeFileSync(files.pin, `${"0".repeat(64)}\n`);
  assert.deepEqual(loadBundle(files), { state: "rejected", reason: "the bundle did not validate against its pin and the link schema" });
  writeFileSync(files.bundle, "not json");
  assert.equal(loadBundle(files).state, "rejected");
  assert.deepEqual(loadBundle(null), { state: "absent" });

  // Through HTTP: the source states are reported.
  const good = writeBundle(dir, "links", reg, false);
  const config = testConfig({ API_LINKS_BUNDLE: good.bundle, API_LINKS_PIN: good.pin, API_CANDIDATES_BUNDLE: files.bundle, API_CANDIDATES_PIN: files.pin, API_INDEXER: "off" });
  const h = await startHarness({ config, fetchFor: (venue) => forbiddenFetch(venue, []), clock: new Clock(NOW) });
  try {
    const answer = await h.get("/v1/groups");
    assert.equal(answer.status, 200);
    const sources = answer.json["sources"] as Record<string, Record<string, unknown>>;
    assert.equal(sources["approved"]?.["state"], "loaded");
    assert.equal(sources["candidates"]?.["state"], "rejected");
    assert.equal((answer.json["approved"] as unknown[]).length, 3);
    assert.deepEqual(answer.json["proposed"], []);
  } finally {
    await h.close();
  }
});
