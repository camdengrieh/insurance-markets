import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareFixed,
  decToFixed,
  fixedToDec,
  isVenueId,
  rescaleFixed,
  untrusted,
  type Fixed,
} from "../index.js";

function fixed(text: string, scale: number): Fixed {
  const r = decToFixed(text, scale);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("unreachable");
  return r.value;
}

test("decToFixed parses exactly and round-trips", () => {
  const v = fixed("0.534", 6);
  assert.equal(v.units, 534000n);
  assert.equal(fixedToDec(v), "0.534");
});

test("decToFixed rejects floats, exponents, signs and excess precision", () => {
  for (const bad of ["1e3", "-1", "0x10", ".5", "5.", " 1", "0.1234567", "NaN"]) {
    assert.equal(decToFixed(bad, 6).ok, false, bad);
  }
  assert.equal(decToFixed(0.5, 6).ok, false);
  assert.equal(decToFixed(null, 6).ok, false);
  assert.equal(decToFixed("1", 19).ok, false);
});

test("rescaleFixed is lossless up and null when digits would be lost", () => {
  assert.deepEqual(rescaleFixed(fixed("0.5", 1), 6), { units: 500000n, scale: 6 });
  assert.deepEqual(rescaleFixed(fixed("0.500", 3), 1), { units: 5n, scale: 1 });
  assert.equal(rescaleFixed(fixed("0.534", 3), 1), null);
  assert.equal(rescaleFixed(fixed("1", 0), 19), null);
});

test("compareFixed compares across scales without rounding", () => {
  assert.equal(compareFixed(fixed("0.5", 1), fixed("0.500000", 6)), 0);
  assert.equal(compareFixed(fixed("0.0001", 4), fixed("0.000099", 6)), 1);
  assert.equal(compareFixed(fixed("0.001", 3), fixed("0.002", 3)), -1);
});

test("fixedToDec keeps the sign of a negative edge", () => {
  assert.equal(fixedToDec({ units: -930000n, scale: 6 }), "-0.93");
});

test("isVenueId accepts known venues only", () => {
  assert.equal(isVenueId("xo"), true);
  assert.equal(isVenueId("kalshi"), true);
  assert.equal(isVenueId("unknown_venue"), false);
  assert.equal(isVenueId(1), false);
});

test("untrusted wraps a value in the marked envelope", () => {
  assert.deepEqual(untrusted("x"), { untrusted: true, value: "x" });
});
