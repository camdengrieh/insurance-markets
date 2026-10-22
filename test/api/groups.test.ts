import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { approvedByAPerson, buildGroups, loadBundle } from "../../api/groups.js";
import { API_SERVING_POLICY } from "../../api/serving.js";
import type { Link } from "../../sdk/links/schema.js";
import { emptyRegistry, findLink } from "../../sdk/links/store.js";
import { approve, Clock, forbiddenFetch, identity, leg, propose, SLOT_EQUAL, startHarness, STATISTICS, testConfig, writeBundle } from "./helpers.js";

// GET /v1/groups: approved links only when a person approved them, every candidate as "proposed" with its band, and no
// link with a leg on a venue the API does not serve. The links are TEST inputs (ids start with TEST-, hashes are of
// invented labels), proposed and approved through the SDK's own registry functions and bundled with their pin.

const NOW = Date.parse("2026-10-22T12:00:00Z");

function registry() {
  let reg = emptyRegistry();
  const approvedServed = propose(reg, identity(leg("trueo", "a1"), leg("trueo", "a2", "a1"), SLOT_EQUAL), "structural");
  reg = approvedServed.registry;
  const proposedServed = propose(reg, identity(leg("trueo", "p1"), leg("trueo", "p2"), STATISTICS), "statistics");
  reg = proposedServed.registry;
  const unknownLicence = propose(reg, identity(leg("trueo", "u1"), leg("polymarket", "u2", "u1"), SLOT_EQUAL), "structural");
  reg = unknownLicence.registry;
  const ownUse = propose(reg, identity(leg("trueo", "k1"), leg("kalshi", "k2", "k1"), SLOT_EQUAL), "structural");
  reg = ownUse.registry;
  reg = approve(reg, approvedServed.link.linkId);
  reg = approve(reg, ownUse.link.linkId);
  return { reg, ids: { approvedServed: approvedServed.link.linkId, proposedServed: proposedServed.link.linkId, unknownLicence: unknownLicence.link.linkId, ownUse: ownUse.link.linkId } };
}

test("approved only when a person approved it, candidates proposed with their band, unserved venues withheld", () => {
  const dir = mkdtempSync(join(tmpdir(), "api-groups-"));
  const { reg, ids } = registry();
  const approved = loadBundle(writeBundle(dir, "links", reg, false));
  const candidates = loadBundle(writeBundle(dir, "candidates", reg, true));
  assert.equal(approved.state, "loaded");
  assert.equal(candidates.state, "loaded");
  const answer = buildGroups(approved, candidates, API_SERVING_POLICY, NOW);
  assert.deepEqual(answer.approved.map((l) => [l.linkId, l.state]), [[ids.approvedServed, "human_approved"]]);
  assert.deepEqual(answer.proposed.map((l) => [l.linkId, l.state, l.band]), [[ids.proposedServed, "proposed", "strong"]]);
  // The Polymarket leg (licence unknown) and the Kalshi leg (own use only) take their links out, approved or not.
  assert.equal(answer.withheld.count, 2);
  const served = JSON.stringify(answer);
  for (const id of [ids.unknownLicence, ids.ownUse, "kalshi", "polymarket"]) assert.equal(served.includes(id), false, id);
  // Ids, hashes, close times and outcome maps only: no text field rides along.
  for (const link of [...answer.approved, ...answer.proposed]) for (const l of link.legs) assert.deepEqual(Object.keys(l).sort(), ["closeUtc", "maskedSha256", "nativeId", "outcomeMap", "rulesSha256", "venue"]);
});

test("a record that says approved without a recorded approval is served as proposed at most", () => {
  const { reg, ids } = registry();
  const link = findLink(reg, ids.approvedServed) as Link;
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
    assert.equal((answer.json["approved"] as unknown[]).length, 1);
    assert.deepEqual(answer.json["proposed"], []);
  } finally {
    await h.close();
  }
});
