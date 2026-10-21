import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { RestrictedVenueError } from "../../recorder/allowlist.js";
import { emptyState, parseState, serializeState, writeState, type StoredMarket } from "../../linker/state.js";
import { assertBundlePersistable } from "../../linker/run.js";
import { buildBundle } from "../../links/bundle.js";
import { emptyRegistry } from "../../links/store.js";
import { identityCandidate, leg, propose } from "../links/fixtures.js";
import { tempDir } from "./helpers.js";

function stored(venue: string, id: string): StoredMarket {
  return {
    venue: venue as StoredMarket["venue"],
    marketId: id,
    titleTokens: ["0123456789ab"],
    ruleTokens: [],
    numbers: [],
    dates: [],
    entities: [],
    rulesSha256: "a".repeat(64),
    maskedSha256: "b".repeat(64),
    closeUtc: "2026-12-31T00:00:00Z",
    category: "other",
    categoryConfidence: "none",
    voidPolicy: "unknown",
    resolverId: null,
    groupKey: null,
    groupKind: null,
    outcomes: 2,
    seenAt: "2026-10-20T12:00:00Z",
    detailAt: "2026-10-20T12:00:00Z",
  };
}

test("the state writer refuses a Kalshi or Quotient market before writing a byte", () => {
  const dir = tempDir();
  try {
    for (const venue of ["kalshi", "quotient", "polymarket_us", "gemini"]) {
      const state = { ...emptyState(), markets: { [`${venue}:SYNTHETIC-k`]: stored(venue, "SYNTHETIC-k") } };
      assert.throws(() => serializeState(state), RestrictedVenueError, venue);
      assert.throws(() => writeState(join(dir.path, "linker-state.json"), state), RestrictedVenueError);
    }
    assert.equal(existsSync(join(dir.path, "linker-state.json")), false);
    assert.deepEqual(readdirSync(dir.path), []);
    // A key that lies about its venue is refused too.
    assert.throws(() => serializeState({ ...emptyState(), markets: { "xo:SYNTHETIC-k": stored("kalshi", "SYNTHETIC-k") } }), RestrictedVenueError);
    assert.throws(() => serializeState({ ...emptyState(), markets: { "xo:other": stored("xo", "SYNTHETIC-k") } }), /does not match/);
  } finally {
    dir.remove();
  }
});

test("the bundle writer refuses a link with a restricted leg", () => {
  let reg = emptyRegistry();
  const x = leg("xo", "x");
  const k = leg("kalshi", "k", { rulesSha256: x.rulesSha256, maskedSha256: x.maskedSha256 });
  reg = propose(reg, identityCandidate("0002", { legs: [x, k] })).registry;
  const built = buildBundle(reg, { createdAt: "2026-10-20T00:00:00Z", includeCandidates: true });
  assert.ok(built.ok);
  if (built.ok) assert.throws(() => assertBundlePersistable(built.value), RestrictedVenueError);
});

test("state round-trips through the file with sorted keys, and foreign rows are dropped on read", () => {
  const dir = tempDir();
  try {
    const path = join(dir.path, "linker-state.json");
    const state = { ...emptyState(), markets: { "xo:SYNTHETIC-b": stored("xo", "SYNTHETIC-b"), "limitless:synthetic-a": stored("limitless", "synthetic-a") } };
    writeState(path, state);
    const text = readFileSync(path, "utf8");
    assert.ok(text.indexOf("limitless:synthetic-a") < text.indexOf("xo:SYNTHETIC-b"));
    assert.equal(text.includes("ids-and-hashes-only"), true);
    const back = parseState(JSON.parse(text));
    assert.deepEqual(back.markets, state.markets);
    const tampered = { ...JSON.parse(text), markets: { ...state.markets, "kalshi:SYNTHETIC-k": stored("kalshi", "SYNTHETIC-k"), "xo:bad": { venue: "xo" } } };
    assert.deepEqual(Object.keys(parseState(tampered).markets).sort(), ["limitless:synthetic-a", "xo:SYNTHETIC-b"]);
    assert.deepEqual(parseState({ format: "something-else" }), emptyState());
    assert.deepEqual(parseState("junk"), emptyState());
  } finally {
    dir.remove();
  }
});
