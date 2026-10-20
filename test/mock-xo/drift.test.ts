import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { fixture } from "../fixtures/xo/load.js";
import {
  checkMockAgainstFixtures,
  compareDirectoryToFixtures,
  compareToFixtures,
  diffShapes,
  fixtureNames,
  fixtureShape,
  formatDifferences,
  inferShape,
  SHAPE_CHECKS,
  UNSERVED_FIXTURES,
} from "./drift.js";
import { startMockXo, type MockXo } from "./server.js";

const FIXTURES = new URL("../fixtures/xo/", import.meta.url).pathname;

describe("shape inference and diff", () => {
  const sample = { id: 1, name: "x", tags: ["a", "b"], price: "0.5", at: "2026-10-19T00:00:00.000Z", hex: "0xab", inner: { ok: true, maybe: null }, rows: [{ a: 1 }, { a: 2, b: "z" }] };

  it("describes kinds, string flavours, nested keys and optional keys", () => {
    const shape = inferShape([sample]);
    assert.deepEqual(shape.kinds, ["object"]);
    const props = shape.props ?? {};
    assert.deepEqual(props["id"]?.node.kinds, ["number"]);
    assert.deepEqual(props["name"]?.node.kinds, ["string:text"]);
    assert.deepEqual(props["price"]?.node.kinds, ["string:numeric"]);
    assert.deepEqual(props["at"]?.node.kinds, ["string:iso"]);
    assert.deepEqual(props["hex"]?.node.kinds, ["string:hex"]);
    assert.deepEqual(props["inner"]?.node.props?.["maybe"]?.node.kinds, ["null"]);
    assert.equal(props["rows"]?.node.items?.props?.["b"]?.optional, true);
    assert.equal(props["rows"]?.node.items?.props?.["a"]?.optional, false);
  });

  it("accepts an identical shape and a different value of the same kind", () => {
    const expected = inferShape([sample]);
    assert.deepEqual(diffShapes(expected, inferShape([structuredClone(sample)]), { strictKinds: true }), []);
    assert.deepEqual(diffShapes(expected, inferShape([{ ...sample, id: 99, name: "other", price: "12.250" }]), { strictKinds: true }), []);
  });

  it("reports a missing key, an extra key and a changed kind, each with its path", () => {
    const expected = inferShape([sample]);
    const { name: _name, ...withoutName } = sample;
    assert.deepEqual(
      diffShapes(expected, inferShape([withoutName]), { strictKinds: true }).map((d) => `${d.problem} ${d.path}`),
      ["missing_key $.name"],
    );
    assert.deepEqual(
      diffShapes(expected, inferShape([{ ...sample, surprise: 1 }]), { strictKinds: true }).map((d) => `${d.problem} ${d.path}`),
      ["extra_key $.surprise"],
    );
    assert.deepEqual(
      diffShapes(expected, inferShape([{ ...sample, id: "1" }]), { strictKinds: true }).map((d) => `${d.problem} ${d.path}`),
      ["kind_changed $.id"],
    );
    assert.deepEqual(
      diffShapes(expected, inferShape([{ ...sample, inner: { ok: "yes", maybe: null } }]), { strictKinds: true }).map((d) => `${d.problem} ${d.path}`),
      ["kind_changed $.inner.ok"],
    );
    assert.deepEqual(
      diffShapes(expected, inferShape([{ ...sample, rows: [{ a: "1" }] }]), { strictKinds: true }).map((d) => `${d.problem} ${d.path}`),
      ["kind_changed $.rows[].a"],
    );
  });

  it("tells a numeric string from text, so a decimal size turning into prose is drift", () => {
    const expected = inferShape([{ size: "1271.980687" }]);
    assert.deepEqual(diffShapes(expected, inferShape([{ size: "1000" }]), { strictKinds: true }), []);
    assert.equal(diffShapes(expected, inferShape([{ size: "a lot" }]), { strictKinds: true }).length, 1);
    assert.equal(diffShapes(expected, inferShape([{ size: "" }]), { strictKinds: true }).length, 1);
  });

  it("treats null as nullability: a null field matches a text field, and an empty array matches any array", () => {
    assert.deepEqual(diffShapes(inferShape([{ bio: null }]), inferShape([{ bio: "text" }]), { strictKinds: true }), []);
    assert.deepEqual(diffShapes(inferShape([{ bio: "text" }]), inferShape([{ bio: null }]), { strictKinds: true }), []);
    assert.deepEqual(diffShapes(inferShape([{ rows: [{ a: 1 }] }]), inferShape([{ rows: [] }]), { strictKinds: true }), []);
    assert.deepEqual(diffShapes(inferShape([{ rows: [] }]), inferShape([{ rows: [{ a: 1 }] }]), { strictKinds: true }), []);
  });

  it("subset mode lets a recording show fewer kinds than the expected shape allows, but never more", () => {
    const expected = inferShape([{ v: 1 }, { v: "x" }]);
    assert.deepEqual(diffShapes(expected, inferShape([{ v: 1 }])), []);
    assert.equal(diffShapes(expected, inferShape([{ v: 1 }]), { strictKinds: true }).length, 1);
    assert.equal(diffShapes(expected, inferShape([{ v: true }])).length, 1);
  });

  it("lets a named path be absent, and nothing else", () => {
    const expected = inferShape([{ a: 1, b: 2 }]);
    assert.deepEqual(diffShapes(expected, inferShape([{ a: 1 }]), { optionalPaths: ["$.b"] }), []);
    assert.equal(diffShapes(expected, inferShape([{ b: 2 }]), { optionalPaths: ["$.b"] }).length, 1);
  });

  it("formats differences as one line each", () => {
    const text = formatDifferences(diffShapes(inferShape([{ a: 1 }]), inferShape([{ a: "1", z: 1 }]), { strictKinds: true }));
    assert.match(text, /\$\.a: kind_changed/);
    assert.match(text, /\$\.z: extra_key/);
  });
});

describe("against the recorded fixtures", () => {
  it("a fixture matches itself, and a tampered copy of it does not", () => {
    for (const name of fixtureNames()) {
      assert.deepEqual(compareToFixtures(fixture(name), [name], { strictKinds: true }), [], name);
    }
    const book = structuredClone(fixture("orderbook-book.json")) as Record<string, unknown>;
    delete book["tick_size"];
    assert.deepEqual(compareToFixtures(book, ["orderbook-book.json"]).map((d) => d.path), ["$.tick_size"]);
    const retyped = structuredClone(fixture("orderbook-book.json")) as Record<string, unknown>;
    retyped["last_update_id"] = "1866822";
    assert.deepEqual(compareToFixtures(retyped, ["orderbook-book.json"]).map((d) => d.path), ["$.last_update_id"]);
  });

  it("merges several recordings into one expected shape", () => {
    const names = ["orderbook-price-buy.json", "live-orderbook-price-empty-side.json"];
    const merged = fixtureShape(names);
    assert.ok(merged.props?.["price"] !== undefined);
    assert.deepEqual(compareToFixtures({ price: "0.5" }, names, { strictKinds: true }), []);
  });

  it("accounts for every fixture: each one is in a mock check or in the unserved table with a reason, never both", () => {
    const checked = new Set(SHAPE_CHECKS.flatMap((check) => check.fixtures));
    const names = fixtureNames();
    const unaccounted = names.filter((name) => !checked.has(name) && UNSERVED_FIXTURES[name] === undefined);
    assert.deepEqual(unaccounted, []);
    assert.deepEqual(names.filter((name) => checked.has(name) && UNSERVED_FIXTURES[name] !== undefined), []);
    assert.deepEqual(Object.keys(UNSERVED_FIXTURES).filter((name) => !names.includes(name)), []);
    for (const check of SHAPE_CHECKS) for (const name of check.fixtures) assert.ok(names.includes(name), `${check.id}: ${name} is not a fixture`);
    for (const reason of Object.values(UNSERVED_FIXTURES)) assert.ok(reason.length > 10);
    assert.equal(new Set(SHAPE_CHECKS.map((check) => check.id)).size, SHAPE_CHECKS.length, "check ids are unique");
  });
});

describe("recorded responses against the fixtures (a directory of local files)", () => {
  let directory: string;
  before(() => {
    directory = mkdtempSync(join(tmpdir(), "mock-drift-"));
  });
  after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("finds no drift when the recordings are the fixtures, and says which fixtures had no recording", () => {
    const clean = join(directory, "clean");
    mkdirSync(clean);
    copyFileSync(join(FIXTURES, "orderbook-book.json"), join(clean, "orderbook-book.json"));
    copyFileSync(join(FIXTURES, "orderbook-time.json"), join(clean, "orderbook-time.json"));
    const report = compareDirectoryToFixtures(clean);
    assert.deepEqual(report.checked, ["orderbook-book.json", "orderbook-time.json"]);
    assert.deepEqual(report.drift, []);
    assert.deepEqual(report.unknown, []);
    assert.equal(report.unrecorded.length, fixtureNames().length - 2);
  });

  it("reports a changed shape, an unparsable file and a file that matches no fixture", () => {
    const dirty = join(directory, "dirty");
    mkdirSync(dirty);
    const book = JSON.parse(readFileSync(join(FIXTURES, "orderbook-book.json"), "utf8")) as Record<string, unknown>;
    delete book["hash"];
    book["extra"] = 1;
    writeFileSync(join(dirty, "orderbook-book.json"), JSON.stringify(book));
    writeFileSync(join(dirty, "orderbook-time.json"), "{not json");
    writeFileSync(join(dirty, "something-else.json"), "{}");
    const report = compareDirectoryToFixtures(dirty);
    const byName = Object.fromEntries(report.drift.map((entry) => [entry.name, entry.differences.map((d) => `${d.problem} ${d.path}`)]));
    assert.deepEqual(byName["orderbook-book.json"], ["missing_key $.hash", "extra_key $.extra"]);
    assert.deepEqual(byName["orderbook-time.json"], ["kind_changed $"]);
    assert.deepEqual(report.unknown, ["something-else.json"]);
  });
});

describe("the mock against the fixtures", () => {
  let mock: MockXo;
  before(async () => {
    const started = await startMockXo({ chains: false });
    assert.equal(started.ok, true);
    if (started.ok) mock = started.mock;
  });
  after(async () => {
    await mock.stop();
  });

  it("every read shape it serves equals the recorded fixtures", async () => {
    const results = await checkMockAgainstFixtures(mock);
    assert.equal(results.length, SHAPE_CHECKS.length);
    assert.ok(results.length >= 36, `only ${String(results.length)} checks`);
    assert.deepEqual(
      results.filter((result) => result.differences.length > 0).map((result) => `${result.id}\n${formatDifferences(result.differences)}`),
      [],
    );
    assert.deepEqual(mock.internalErrors(), []);
  });

  it("notices when a surface drifts: a dropped key, a retyped value and a wrong status each fail their check", async () => {
    const book = mock.listeners.orderbook;
    book.override("GET", "/time", () => ({ status: 200, json: "1792368000" }));
    book.override("GET", "/health", () => ({ status: 200, json: {} }));
    book.override("GET", "/version", () => ({ status: 500, json: { build_timestamp: 1, git_sha: "x", version: "y" } }));
    const results = await checkMockAgainstFixtures(
      mock,
      SHAPE_CHECKS.filter((check) => ["orderbook /time", "orderbook /health", "orderbook /version"].includes(check.id)),
    );
    const bad = Object.fromEntries(results.map((result) => [result.id, result.differences.map((d) => `${d.problem} ${d.path}`)]));
    assert.deepEqual(bad["orderbook /time"], ["kind_changed $"]);
    assert.deepEqual(bad["orderbook /health"], ["missing_key $.status"]);
    assert.deepEqual(bad["orderbook /version"], ["kind_changed $status"]);
  });
});
