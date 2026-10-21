// The dApp dataset the linker exports: built here from the synthetic world's features (hashed ids,
// synthetic text that never reaches the file) and compared byte for byte with the committed sample
// that the app's own test loads (app/src/features/signals/links/candidates.test.ts).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildBundle } from "../../links/bundle.js";
import { emptyRegistry } from "../../links/store.js";
import { appCanonicalJson, serializeAppDataset, toAppDataset } from "../../linker/app-dataset.js";
import { groupCandidates, proposeAll, scoreCandidates } from "../../linker/candidates.js";
import { buildFeatures, featureKey, type FeatureInput, type MarketFeatures } from "../../linker/features.js";
import { identityCandidate, leg, propose } from "../links/fixtures.js";
import { REPO, syntheticHex } from "./helpers.js";

function feat(venue: MarketFeatures["venue"], id: string, title: string, rules: string, over: Partial<FeatureInput> = {}): MarketFeatures {
  const base: FeatureInput = {
    venue,
    marketId: id,
    title,
    rulesCanonical: rules,
    rulesSha256: createHash("sha256").update(`SYNTHETIC-rules:${venue}:${id}:${rules}`).digest("hex"),
    maskedSha256: createHash("sha256").update(`SYNTHETIC-mask:${venue}:${id}`).digest("hex"),
    closeUtc: "2026-12-31T00:00:00Z",
    category: "sports",
    categoryConfidence: "native",
    voidPolicy: "unknown",
    resolverId: null,
    groupKey: null,
    groupKind: null,
    outcomes: 2,
  };
  return buildFeatures({ ...base, ...over });
}

export function sampleFeatures(): MarketFeatures[] {
  const q = "SYNTHETIC Alpha Rovers to beat Beta United on December 31, 2026";
  const r = "SYNTHETIC Resolves Yes if Alpha Rovers win the match against Beta United on December 31, 2026.";
  const nr = syntheticHex("negrisk:sample");
  return [
    feat("xo", syntheticHex("xo:sample-a"), q, r),
    feat("polymarket", syntheticHex("polymarket:sample-a"), `${q}?`, `${r} Timing in ET.`, { closeUtc: "2026-12-31T05:00:00Z", voidPolicy: "fifty_fifty", category: "other", categoryConfidence: "none" }),
    feat("limitless", "synthetic-sample-a", q, r),
    feat("polymarket", syntheticHex("polymarket:nr-1"), "SYNTHETIC Candidate One wins the synthetic race", "SYNTHETIC resolves yes if one wins", { groupKey: nr, groupKind: "neg_risk", category: "politics" }),
    feat("polymarket", syntheticHex("polymarket:nr-2"), "SYNTHETIC Candidate Two wins the synthetic race", "SYNTHETIC resolves yes if two wins", { groupKey: nr, groupKind: "neg_risk", category: "politics" }),
  ];
}

export function sampleDataset(): ReturnType<typeof toAppDataset> {
  const features = sampleFeatures();
  const pairs: { a: MarketFeatures; b: MarketFeatures; blockKey: string }[] = [];
  for (let i = 0; i < features.length; i += 1) for (let j = i + 1; j < features.length; j += 1) pairs.push({ a: features[i] as MarketFeatures, b: features[j] as MarketFeatures, blockKey: "sample" });
  const scored = scoreCandidates(pairs);
  const groups = groupCandidates(features);
  const r = proposeAll(emptyRegistry(), [...scored.candidates.map((c) => ({ input: c.input, linkId: c.linkId, kind: "pair", source: "statistics" as const })), ...groups.map((g) => ({ input: g.input, linkId: g.linkId, kind: g.kind, source: g.source }))], "2026-10-20");
  const bundle = buildBundle(r.registry, { createdAt: "2026-10-20T12:00:00Z", includeCandidates: true });
  assert.ok(bundle.ok);
  if (!bundle.ok) throw new Error("bundle");
  return toAppDataset(bundle.value, { release: "2026-10-20", categories: new Map(features.map((f) => [featureKey(f), f.category])) });
}

test("the export maps relation, proof, state, basis, band and category into the dApp's shape and pins it the app's way", () => {
  const { dataset, skipped } = sampleDataset();
  assert.deepEqual(skipped, []);
  assert.ok(dataset.links.length >= 4, String(dataset.links.length));
  const near = dataset.links.filter((l) => l.relation === "near_identity");
  assert.ok(near.length >= 3);
  for (const l of near) {
    assert.equal(l.proof, "P_unproven");
    assert.equal(l.state, "proposed");
    assert.ok(["strong", "good", "weak"].includes(l.band ?? ""));
    assert.ok(l.legs.every((g) => g.category !== undefined && /^[a-z_]+$/.test(g.category)));
  }
  const partition = dataset.links.find((l) => l.relation === "partition");
  assert.ok(partition);
  assert.equal(partition.proof, "P0_native");
  assert.equal(partition.state, "proposed");
  assert.equal(partition.band, undefined);
  const timing = near.find((l) => l.basis.class === "settlement_window");
  assert.ok(timing);
  assert.deepEqual(timing.basis.axes, ["timing"]);
  assert.equal(dataset.rulesRecipe, "rules-v2");
  // The pin is sha256 over the app's canonical JSON of {schemaVersion, release, links}.
  const expected = createHash("sha256").update(appCanonicalJson({ schemaVersion: 1, release: dataset.release, links: dataset.links }), "utf8").digest("hex");
  assert.equal(dataset.contentSha256, expected);
  assert.equal(appCanonicalJson({ b: 1, a: [{ d: 1, c: 2 }] }), '{"a":[{"c":2,"d":1}],"b":1}');
});

test("synthetic, restricted, wide and long links are left out by name", () => {
  let reg = emptyRegistry();
  reg = propose(reg, identityCandidate("0001")).registry;
  const x = leg("xo", "x");
  const k = leg("kalshi", "k", { rulesSha256: x.rulesSha256, maskedSha256: x.maskedSha256 });
  reg = propose(reg, identityCandidate("0002", { legs: [x, k] })).registry;
  const bundle = buildBundle(reg, { createdAt: "2026-10-20T12:00:00Z", includeCandidates: true });
  assert.ok(bundle.ok);
  if (!bundle.ok) return;
  const { dataset, skipped } = toAppDataset(bundle.value, { release: "2026-10-20" });
  assert.deepEqual(dataset.links, []);
  assert.deepEqual(skipped.map((s) => s.reason).sort(), ["synthetic", "synthetic"]);
});

test("the committed sample is exactly what the converter writes", () => {
  const text = serializeAppDataset(sampleDataset().dataset);
  const committed = readFileSync(join(REPO, "pm", "test", "linker", "fixtures", "app-dataset.sample.json"), "utf8");
  assert.equal(text, committed, "regenerate with: node_modules/.bin/tsx pm/test/linker/fixtures/write-sample.ts");
  assert.equal(/SYNTHETIC|Alpha|Rovers|Candidate/.test(text), false);
});
