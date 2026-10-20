import assert from "node:assert/strict";
import { test } from "node:test";
import {
  add,
  cmp,
  dec,
  div,
  eq,
  mul,
  rat,
  ratFromDec,
  ratFromFixed,
  ratToDec,
  ratToDecExact,
  ratToFixed,
  roundDiv,
  roundRat,
  sub,
  sum,
} from "../../core/rational.js";

test("rat reduces to lowest terms and keeps the denominator positive", () => {
  assert.deepEqual(rat(6n, -4n), { n: -3n, d: 2n });
  assert.deepEqual(rat(0n, 7n), { n: 0n, d: 1n });
  assert.throws(() => rat(1n, 0n), RangeError);
});

test("decimal parse is strict and exact", () => {
  assert.deepEqual(dec("0.534"), rat(534n, 1000n));
  for (const bad of ["1e3", "-1", "0x10", ".5", "5.", " 1", "NaN", "0.1234567890123456789"]) {
    assert.equal(ratFromDec(bad).ok, false, bad);
  }
  assert.equal(ratFromDec(0.5).ok, false);
});

test("arithmetic is exact: no float drift", () => {
  assert.ok(eq(add(dec("0.1"), dec("0.2")), dec("0.3")));
  assert.ok(eq(mul(dec("0.07"), mul(dec("0.62"), dec("0.38"))), dec("0.016492")));
  assert.ok(eq(div(dec("1"), dec("3")), rat(1n, 3n)));
  assert.ok(eq(sub(dec("1"), dec("0.9999")), dec("0.0001")));
  assert.ok(eq(sum([dec("0.3"), dec("0.34"), dec("0.33")]), dec("0.97")));
  assert.throws(() => div(dec("1"), dec("0")), RangeError);
});

test("compare orders across denominators", () => {
  assert.equal(cmp(rat(1n, 3n), dec("0.33")), 1);
  assert.equal(cmp(rat(1n, 3n), rat(2n, 6n)), 0);
  assert.equal(cmp(dec("0.1"), dec("0.2")), -1);
});

test("directed rounding of positive and negative values", () => {
  // 5/2 = 2.5 and -5/2 = -2.5
  assert.equal(roundDiv(5n, 2n, "floor"), 2n);
  assert.equal(roundDiv(5n, 2n, "ceil"), 3n);
  assert.equal(roundDiv(5n, 2n, "trunc"), 2n);
  assert.equal(roundDiv(5n, 2n, "half_up"), 3n);
  assert.equal(roundDiv(5n, 2n, "half_even"), 2n);
  assert.equal(roundDiv(-5n, 2n, "floor"), -3n);
  assert.equal(roundDiv(-5n, 2n, "ceil"), -2n);
  assert.equal(roundDiv(-5n, 2n, "trunc"), -2n);
  assert.equal(roundDiv(-5n, 2n, "half_up"), -3n);
  assert.equal(roundDiv(-5n, 2n, "half_even"), -2n);
  assert.equal(roundDiv(7n, 2n, "half_even"), 4n);
  assert.equal(roundDiv(-7n, 2n, "half_even"), -4n);
  assert.equal(roundDiv(6n, 3n, "ceil"), 2n);
  assert.throws(() => roundDiv(1n, 0n, "floor"), RangeError);
});

test("ratToDec rounds in the stated direction and keeps the sign", () => {
  const third = rat(1n, 3n);
  assert.equal(ratToDec(third, 4, "floor"), "0.3333");
  assert.equal(ratToDec(third, 4, "ceil"), "0.3334");
  assert.equal(ratToDec(rat(-1n, 3n), 4, "ceil"), "-0.3333");
  assert.equal(ratToDec(dec("2.5"), 0, "half_up"), "3");
  assert.equal(roundRat(dec("0.0155"), 2, "half_up"), 2n);
});

test("ratToDecExact returns text for terminating values only", () => {
  assert.equal(ratToDecExact(dec("0.016492")), "0.016492");
  assert.equal(ratToDecExact(rat(1n, 8n)), "0.125");
  assert.equal(ratToDecExact(rat(1n, 3n)), null);
  assert.equal(ratToDecExact(rat(-3n, 4n)), "-0.75");
});

test("fixed bridge round-trips and refuses lossy conversion", () => {
  const fixed = ratToFixed(dec("0.534"), 6);
  assert.deepEqual(fixed, { units: 534000n, scale: 6 });
  assert.ok(eq(ratFromFixed({ units: 534000n, scale: 6 }), dec("0.534")));
  assert.equal(ratToFixed(rat(1n, 3n), 6), null);
  assert.equal(ratToFixed(dec("0.5"), 19), null);
});
