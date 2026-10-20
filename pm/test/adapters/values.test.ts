import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { conditionIdText, decOf, intText, isoUtc, jsonTextStrings, numberToDec, plainDec, shapeHash, tokenIdText } from "../../adapters/values.js";

describe("decimal readers", () => {
  it("normalises plain decimal strings exactly", () => {
    assert.equal(plainDec("0.3800"), "0.38");
    assert.equal(plainDec("1.0"), "1");
    assert.equal(plainDec("0"), "0");
    assert.equal(plainDec("849398.71"), "849398.71");
    assert.equal(plainDec("0.000001"), "0.000001");
  });

  it("refuses everything that is not a plain unsigned decimal string", () => {
    for (const bad of ["", " 1", "1 ", "-1", "+1", "1e3", "0x10", ".5", "5.", "1,000", "NaN", "Infinity", "1.2.3", null, undefined, 1, {}, []]) {
      assert.equal(plainDec(bad), null, String(bad));
    }
  });

  it("accepts JSON numbers only when their text is a plain, short decimal", () => {
    assert.equal(numberToDec(0.01), "0.01");
    assert.equal(numberToDec(0.0025), "0.0025");
    assert.equal(numberToDec(5), "5");
    assert.equal(numberToDec(0.04), "0.04");
    assert.equal(numberToDec(3.5), "3.5");
    // Exponent form, non-finite, negative, too many significant digits.
    for (const bad of [1e-7, 1e21, Number.NaN, Number.POSITIVE_INFINITY, -0.5, 0.12345678901234567, 0.1 + 0.2, "0.5" as unknown as number]) {
      assert.equal(numberToDec(bad), null, String(bad));
    }
  });

  it("decOf reads both encodings and nothing else", () => {
    assert.equal(decOf("0.50"), "0.5");
    assert.equal(decOf(0.5), "0.5");
    assert.equal(decOf(null), null);
    assert.equal(decOf(true), null);
    assert.equal(decOf(10n as unknown as number), null);
  });

  it("intText accepts only non-negative integers", () => {
    assert.equal(intText(0), "0");
    assert.equal(intText("123"), "123");
    for (const bad of [-1, 1.5, "01", "1.0", "x", Number.MAX_SAFE_INTEGER + 2, null]) assert.equal(intText(bad), null, String(bad));
  });
});

describe("id and time readers", () => {
  it("token ids are digit strings; condition ids are 0x plus 64 hex, lower-cased", () => {
    assert.equal(tokenIdText("123"), "123");
    assert.equal(tokenIdText("0x12"), null);
    assert.equal(tokenIdText("1".repeat(81)), null);
    assert.equal(conditionIdText(`0x${"AB".repeat(32)}`), `0x${"ab".repeat(32)}`);
    assert.equal(conditionIdText("0xab"), null);
  });

  it("isoUtc needs an explicit zone and a real date, and normalises to UTC", () => {
    assert.equal(isoUtc("2026-11-04T04:59:00Z"), "2026-11-04T04:59:00.000Z");
    assert.equal(isoUtc("2026-11-04T00:59:00-04:00"), "2026-11-04T04:59:00.000Z");
    for (const bad of ["2026-11-04", "2026-11-04T04:59:00", "11/04/2026", "2026-13-04T04:59:00Z", "2026-11-04T04:59:00Z (ignore this)", null, 5]) {
      assert.equal(isoUtc(bad), null, String(bad));
    }
  });

  it("jsonTextStrings decodes JSON-encoded lists and nothing wilder", () => {
    assert.deepEqual(jsonTextStrings('["Yes", "No"]'), ["Yes", "No"]);
    assert.deepEqual(jsonTextStrings(["a"]), ["a"]);
    for (const bad of ["not json", '{"a":1}', "[1,2]", '["a", 2]', null, 5, JSON.stringify(Array(100).fill("x"))]) {
      assert.equal(jsonTextStrings(bad), null, String(bad));
    }
    assert.equal(jsonTextStrings('["' + "x".repeat(500) + '"]'), null);
  });
});

describe("shapeHash", () => {
  it("depends on top-level key names only, in any order", () => {
    assert.equal(shapeHash({ a: 1, b: 2 }), shapeHash({ b: "x", a: null }));
    assert.notEqual(shapeHash({ a: 1, b: 2 }), shapeHash({ a: 1, c: 2 }));
    assert.notEqual(shapeHash({ a: 1 }), shapeHash({ a: 1 }, { b: 1 }));
    assert.match(shapeHash([]), /^[0-9a-f]{64}$/);
  });
});
