import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decimalText, parseSignalBody, toRational, type ParseOptions, type ParseSuccess } from "../../signals/index.js";
import { FLAG_OFF, FLAG_ON, NOW_MS } from "./fixtures.js";

// Quotient has restricted terms and every data route is paid, so no Quotient row exists in this repository and the
// earlier tests that parsed hand-written rows were deleted. What stays needs no row: exact decimals, the flag, the
// size caps, and the refusal of anything that is not a row.

const OPTS: ParseOptions = { nowMs: NOW_MS };

function parseOk(kind: "mispriced" | "signals", body: unknown, options: ParseOptions = OPTS): ParseSuccess {
  const r = parseSignalBody(FLAG_ON, kind, body, options);
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok) throw new Error("unreachable");
  return r;
}

describe("exact numbers", () => {
  it("turns JSON numbers into exact decimals without float residue", () => {
    assert.equal(decimalText(0.07), "0.07");
    assert.equal(decimalText(0.535), "0.535");
    assert.equal(decimalText(1e-7), "0.0000001");
    assert.equal(decimalText(1.5e-7), "0.00000015");
    assert.equal(decimalText(62), "62");
    assert.equal(decimalText("0.25"), "0.25");
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1e13, "1e5", "-0.1", "0x10", " 1", "1.", ".5", "", null, {}, true]) {
      assert.equal(decimalText(bad), null, String(bad));
    }
    const r = toRational(0.1);
    assert.ok(r.ok && r.value.n === 1n && r.value.d === 10n);
  });
});

describe("input handling", () => {
  it("is off without the flag", () => {
    const r = parseSignalBody(FLAG_OFF, "mispriced", [{}], OPTS);
    assert.equal(r.ok, false);
    if (r.ok || !("error" in r) || r.error !== "FLAG_OFF") throw new Error("expected FLAG_OFF");
    assert.ok(r.clause.length > 0);
  });

  it("caps size and row count", () => {
    const big = parseSignalBody(FLAG_ON, "mispriced", "[" + '"x",'.repeat(20_000) + '"x"]', OPTS);
    assert.ok(!big.ok && "error" in big && big.error === "TOO_LARGE");
    const bigObj = parseSignalBody(FLAG_ON, "mispriced", [{ pad: "y".repeat(70_000) }], OPTS);
    assert.ok(!bigObj.ok && "error" in bigObj && bigObj.error === "TOO_LARGE");
    const many = parseSignalBody(FLAG_ON, "mispriced", Array.from({ length: 101 }, () => 1), OPTS);
    assert.ok(!many.ok && "error" in many && many.error === "TOO_MANY_ROWS");
  });

  it("refuses ambiguous shapes and text that is not JSON", () => {
    for (const body of [{ markets: [{}], signals: [{}] }, { foo: [{}] }, {}, 5, null, "[1,"]) {
      const r = parseSignalBody(FLAG_ON, "mispriced", body, OPTS);
      assert.equal(r.ok, false, JSON.stringify(body));
    }
    const bad = parseSignalBody(FLAG_ON, "mispriced", "{not json", OPTS);
    assert.ok(!bad.ok && "error" in bad && bad.error === "BAD_INPUT");
    const shape = parseSignalBody(FLAG_ON, "mispriced", { foo: [{}] }, OPTS);
    assert.ok(!shape.ok && "error" in shape && shape.error === "BAD_SHAPE");
  });

  it("rejects non-object rows and bad options", () => {
    const r = parseOk("mispriced", [1, "x", null, []]);
    assert.equal(r.counts.rejected, 4);
    assert.ok(r.rejected.every((x) => x.code === "BAD_ROW"));
    for (const options of [{ nowMs: Number.NaN }, { nowMs: NOW_MS, minCapacityUsd: "lots" }, { nowMs: NOW_MS, maxQuoteAgeMs: -1 }]) {
      const bad = parseSignalBody(FLAG_ON, "mispriced", [{}], options);
      assert.equal(bad.ok, false, JSON.stringify(options));
    }
    const kind = parseSignalBody(FLAG_ON, "forecast" as never, [], OPTS);
    assert.equal(kind.ok, false);
  });

  it("cannot be tricked by __proto__ or prototype keys", () => {
    const hostile = JSON.parse('{"__proto__":{"quotient_odds":0.5,"market_odds":0.4,"venue":"polymarket"},"constructor":{"x":1}}') as unknown;
    const r = parseOk("mispriced", [hostile]);
    assert.equal(r.rows.length, 0);
    assert.equal(r.rejected[0]?.code, "MISSING_FIELD");
    assert.equal(({} as Record<string, unknown>)["quotient_odds"], undefined);
  });
});
