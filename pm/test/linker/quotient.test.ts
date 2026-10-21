import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { quotientLines } from "../../linker/quotient.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const A = "0x" + "a".repeat(64);
const B = "0x" + "b".repeat(64);
const candidate = { linkId: "lnk_" + "1".repeat(32), legs: [{ venue: "polymarket" as const, marketId: A }, { venue: "polymarket" as const, marketId: B }] };
const row = (id: string, q: number) => ({ venue: "polymarket", marketKey: `polymarket:${id}`, condition_id: id, question: "synthetic", quotient_odds: q, market_odds: 0.5, q_coverage: "forecasting", forecast: { created_at: "2026-10-20T11:00:00Z" }, venue_quote: { quote_method: "midpoint", freshness: "fresh", observed_at: "2026-10-20T11:55:00Z" } });
const NOW = Date.parse("2026-10-20T12:00:00Z");

test("off by default, with the clause; on without a body reads nothing", () => {
  const off = quotientLines({ env: {}, bodyText: '{"markets":[]}', kind: "mispriced", candidates: [candidate], nowMs: NOW });
  assert.match(off[0] ?? "", /^quotient: off/);
  assert.match(off[1] ?? "", /clause: Quotient/);
  assert.equal(off.length, 2);
  for (const value of ["0", "", "yes", "TRUE "]) {
    const l = quotientLines({ env: { PM_QUOTIENT: value }, bodyText: "{}", kind: "mispriced", candidates: [], nowMs: NOW });
    assert.equal(l[0]?.startsWith(value.trim().toLowerCase() === "true" ? "quotient: on" : "quotient: off"), true, value);
  }
  const none = quotientLines({ env: { PM_QUOTIENT: "1" }, bodyText: null, kind: "mispriced", candidates: [candidate], nowMs: NOW });
  assert.match(none[0] ?? "", /never fetches or pays/);
});

test("agreement per candidate is computed in exact decimals and never leaves the lines", () => {
  const body = JSON.stringify({ markets: [row(A, 0.61), row(B, 0.64)] });
  const lines = quotientLines({ env: { PM_QUOTIENT: "1" }, bodyText: body, kind: "mispriced", candidates: [candidate], nowMs: NOW });
  assert.match(lines[0] ?? "", /2 rows parsed in memory/);
  assert.match(lines[1] ?? "", /agree \(\|q-q'\|=0\.03 against 0\.05\)/);
  const far = JSON.stringify({ markets: [row(A, 0.61), row(B, 0.70)] });
  assert.match(quotientLines({ env: { PM_QUOTIENT: "1" }, bodyText: far, kind: "mispriced", candidates: [candidate], nowMs: NOW })[1] ?? "", /disagree/);
  const one = JSON.stringify({ markets: [row(A, 0.61)] });
  assert.match(quotientLines({ env: { PM_QUOTIENT: "1" }, bodyText: one, kind: "mispriced", candidates: [candidate], nowMs: NOW })[1] ?? "", /one leg has a Quotient row/);
  assert.match(quotientLines({ env: { PM_QUOTIENT: "1" }, bodyText: "not json", kind: "mispriced", candidates: [candidate], nowMs: NOW })[0] ?? "", /could not be parsed/);
});

test("the quotient module has no file, network, process or storage surface of its own", () => {
  const source = readFileSync(join(HERE, "..", "..", "linker", "quotient.ts"), "utf8").replace(/\/\/.*$/gm, "");
  assert.equal(/node:fs|node:http|node:net|node:child_process|\bfetch\s*\(|process\.env|node:sqlite|writeFile/.test(source), false);
});
