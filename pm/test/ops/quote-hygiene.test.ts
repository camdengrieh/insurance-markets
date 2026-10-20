// Source scan for the ops modules: they are pure over injected ports, so none of them may read
// the wall clock, touch the network or the disk, spawn anything, evaluate code, use floating
// point for money, or import a signing or trading module.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const dir = new URL("../../ops/", import.meta.url);
// Only the four modules of this stream; other pm/ops files belong to other streams.
const OWN = ["quote.ts", "verify.ts", "compare.ts", "lookup.ts"];
const files = readdirSync(dir).filter((f) => OWN.includes(f));

function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("the four ops modules exist", () => {
  for (const name of OWN) assert.ok(files.includes(name), name);
});

const FORBIDDEN: readonly [string, RegExp][] = [
  ["wall clock", /\bDate\.now\s*\(|\bnew Date\(\s*\)|performance\.now/],
  ["randomness", /Math\.random|randomUUID|randomBytes/],
  ["network", /\bfetch\s*\(|node:http|node:https|node:net|node:dgram|XMLHttpRequest|WebSocket/],
  ["disk", /node:fs|writeFile|appendFile|createWriteStream|node:sqlite/],
  ["process", /child_process|process\.env|process\.exit|execSync|spawn\s*\(/],
  ["eval", /\beval\s*\(|new Function\s*\(/],
  ["floats", /parseFloat|Number\.parseFloat|\.toFixed\s*\(/],
  ["signing or trading", /from\s+"[^"]*\/(?:xo\/(?:sign|order)|tools\/(?:trade|userop|fund)|relay|bridge)[^"]*"/],
  ["executable tier", /["'`]executable_arbitrage["'`]/],
];

for (const file of files) {
  test(`${file} has no clock, network, disk, process, eval, float or signing use`, () => {
    const source = strip(readFileSync(new URL(file, dir), "utf8"));
    for (const [what, pattern] of FORBIDDEN) {
      assert.equal(pattern.test(source), false, `${file} uses ${what}`);
    }
  });
}

test("the Number() constructor is not used on money in the ops modules", () => {
  for (const file of files) {
    const source = strip(readFileSync(new URL(file, dir), "utf8"));
    assert.equal(/\bNumber\s*\(/.test(source), false, `${file} calls Number()`);
  }
});
