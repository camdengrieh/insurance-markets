import assert from "node:assert/strict";
import { test } from "node:test";
import { structureOptionsFromInput, structureOutputSchema, structureToolInputSchema } from "../../ops/structure-schema.js";

test("tool input is strict: unknown keys, bad decimals and hostile keys are rejected", () => {
  const good = { venue: "polymarket", group_key: "event-1", checks: ["partition"], tau: "0.005" };
  assert.equal(structureToolInputSchema.safeParse(good).success, true);
  for (const bad of [
    { ...good, extra: 1 },
    { ...good, venue: "nowhere" },
    { ...good, group_key: "a b" },
    { ...good, group_key: "" },
    { ...good, tau: "1e-3" },
    { ...good, tau: "-1" },
    { ...good, checks: [] },
    { ...good, checks: ["partition", "partition", "ladder", "complement"] },
    { ...good, walk_depth: "yes" },
    { venue: "xo" },
  ]) {
    assert.equal(structureToolInputSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

test("tool arguments map to options without inventing defaults", () => {
  assert.deepEqual(structureOptionsFromInput({ venue: "xo", group_key: "g" }), {});
  assert.deepEqual(
    structureOptionsFromInput({ venue: "xo", group_key: "g", tau: "0.01", hurdle_apy: "0.05", reserve_per_share: "0", haircut_per_share: "0.002", max_qty: "50", walk_depth: false, checks: ["ladder"] }),
    { checks: ["ladder"], tau: "0.01", hurdleApy: "0.05", reservePerShare: "0", haircutPerShare: "0.002", maxQty: "50", walkDepth: false },
  );
});

test("the output schema is strict and rejects an unlisted label", () => {
  assert.equal(structureOutputSchema.safeParse({}).success, false);
  assert.equal(structureOutputSchema.safeParse({ schema: "pm_check_structure/v1", extra: true }).success, false);
});
