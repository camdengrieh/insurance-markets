import assert from "node:assert/strict";
import { test } from "node:test";

import { DATA_TERMS, termsAllowPersistence as sdkTermsAllowPersistence } from "../../../sdk/venues/licence.js";
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
