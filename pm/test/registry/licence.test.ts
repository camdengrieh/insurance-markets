import assert from "node:assert/strict";
import { test } from "node:test";

import { DATA_TERMS, apiServability, dataTermsOf, termsAllowPersistence as sdkTermsAllowPersistence } from "../../../sdk/venues/licence.js";
import { VENUE_IDS, venuePolicy } from "../../../sdk/venues/policy.js";
import { REGISTRY_VENUE_IDS } from "../../registry/ids.js";
import { PLATFORM_RECORDS } from "../../registry/records.js";
import { termsAllowPersistence } from "../../registry/registry.js";

// The SDK's copy of the registry's data terms (sdk/venues/licence.ts) is the registry's, record for record: a changed
// record fails here until the SDK table is changed with it.

test("DATA_TERMS equals every registry record's dataTerms, and names nothing else", () => {
  const fromRecords = Object.fromEntries(PLATFORM_RECORDS.map((rec) => [rec.id, rec.dataTerms.value.restricted]));
  assert.deepEqual({ ...DATA_TERMS }, fromRecords);
  assert.deepEqual(Object.keys(DATA_TERMS).sort(), [...REGISTRY_VENUE_IDS].sort());
});

test("pm's termsAllowPersistence is the SDK's and keeps the registry's rule", () => {
  assert.equal(termsAllowPersistence, sdkTermsAllowPersistence);
  for (const rec of PLATFORM_RECORDS) assert.equal(termsAllowPersistence(rec.id), rec.dataTerms.value.restricted === "none_found", rec.id);
  for (const id of ["quotient", "sx", "polymarket_us", "", "__proto__", "constructor"]) assert.equal(termsAllowPersistence(id), false, id);
  assert.equal(termsAllowPersistence(undefined), false);
});

test("the API serves only a venue with a recorded licence, no restriction and no restrictive clause", () => {
  const served = VENUE_IDS.filter((id) => apiServability(id).served);
  // As recorded on 2026-10-22: Trueo (open, read on chain) alone. XO, Polymarket and Limitless have no licence class yet.
  assert.deepEqual(served, ["trueo"]);
  for (const id of VENUE_IDS) {
    const verdict = apiServability(id);
    const policy = venuePolicy(id);
    if (policy.license === "own_use_only") assert.equal(verdict.served ? "served" : verdict.code, "own_use_only", id);
    if (policy.license === "unknown") assert.equal(verdict.served, false, id);
    if (dataTermsOf(id) !== "none_found") assert.equal(verdict.served, false, id);
  }
  const quotient = apiServability("quotient");
  assert.equal(quotient.served, false);
  assert.match(quotient.served ? "" : quotient.reason, /Quotient/);
  assert.equal(dataTermsOf("sx"), "unknown");
});
