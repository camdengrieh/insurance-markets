import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { CATEGORIES, CATEGORY_LABEL, KEYWORD_TABLE, NATIVE_TABLES, NO_CATEGORY, categorise, isCategory, keywordHit, normaliseCategoryText, type Category, type CategoryVerdict } from "../../core/category.js";

// The fixed taxonomy (pm/core/category.ts): deterministic, case- and diacritic-insensitive, matched against the
// documented tables only. The fixture cases below are REAL captures already in the repo; nothing here is invented.

type Obj = Record<string, unknown>;

function json(relative: string): unknown | null {
  const url = new URL(relative, import.meta.url);
  return existsSync(url) ? (JSON.parse(readFileSync(url, "utf8")) as unknown) : null;
}

// Every entry a verdict may name: a native-table key under its table name, or a keyword-table phrase.
function isFixedEntry(entry: string): boolean {
  const at = entry.indexOf(":");
  if (at === -1) return false;
  const table = entry.slice(0, at);
  const key = entry.slice(at + 1);
  if (table === "keyword") return Object.hasOwn(KEYWORD_TABLE, key);
  const native = NATIVE_TABLES[table];
  return native !== undefined && Object.hasOwn(native, key);
}

function categoryOfXoRoot(root: string): Category {
  const roots: Record<string, Category> = { POLITICS: "politics", CRYPTO: "crypto", SPORTS: "sports", FINANCE: "economics", TECH: "science_tech", CULTURE: "culture", PULSE: "crypto" };
  const found = roots[root];
  if (found === undefined) throw new Error(`fixture carries an XO root this test does not expect: ${root}`);
  return found;
}

describe("category: the fixed taxonomy", () => {
  it("has nine categories, 'other' last, each with a sentence-case label", () => {
    assert.deepEqual([...CATEGORIES], ["politics", "crypto", "sports", "economics", "science_tech", "culture", "world", "weather", "other"]);
    for (const category of CATEGORIES) {
      const label = CATEGORY_LABEL[category];
      assert.match(label, /^[A-Z][a-z]/, label);
      assert.equal(label, label.charAt(0) + label.slice(1).toLowerCase(), `${label} is not sentence case`);
      assert.ok(!/[A-Z]{2}/.test(label), `${label} is set in upper case`);
    }
    assert.equal(isCategory("politics"), true);
    assert.equal(isCategory("Politics"), false);
    assert.equal(isCategory("all"), false);
  });

  it("reaches every category from the keyword table and from the common native table", () => {
    for (const category of CATEGORIES) {
      if (category === "other") continue;
      const phrase = Object.entries(KEYWORD_TABLE).find(([, c]) => c === category)?.[0];
      assert.ok(phrase !== undefined, `no keyword leads to ${category}`);
      assert.deepEqual(categorise({ venue: "manifold", native: [], title: `Something about ${phrase} soon?` }), { category, confidence: "keyword", matched: [`keyword:${phrase}`] });
      const native = Object.entries(NATIVE_TABLES["common"] ?? {}).find(([, c]) => c === category)?.[0];
      assert.ok(native !== undefined, `no common native string leads to ${category}`);
      assert.deepEqual(categorise({ venue: "any", native: [native] }), { category, confidence: "native", matched: [`common:${native}`] });
    }
    // "other" is the verdict for nothing matched, never a word someone wrote.
    assert.deepEqual(categorise({ venue: "xo", native: [] }), NO_CATEGORY);
    assert.deepEqual(categorise({ venue: "xo", native: [], title: "" }), { category: "other", confidence: "none", matched: [] });
  });

  it("every table key and phrase is in normalised form and no phrase is a person's or a venue's name", () => {
    for (const [name, table] of Object.entries(NATIVE_TABLES)) {
      for (const [key, category] of Object.entries(table)) {
        assert.equal(normaliseCategoryText(key), key, `${name}: ${key}`);
        assert.ok(isCategory(category), `${name}: ${key} -> ${String(category)}`);
      }
    }
    for (const [phrase, category] of Object.entries(KEYWORD_TABLE)) {
      assert.equal(normaliseCategoryText(phrase), phrase);
      assert.ok(isCategory(category));
      assert.ok(phrase.split(" ").length <= 4, phrase);
      assert.ok(!/\b(?:xo|polymarket|kalshi|limitless|manifold|quotient)\b/.test(phrase), `names a venue: ${phrase}`);
    }
  });

  it("matches without regard to case, diacritics, punctuation or separators", () => {
    assert.equal(normaliseCategoryText("  S&P 500 "), "s p 500");
    assert.equal(normaliseCategoryText("5m Up/Down"), "5m up down");
    assert.equal(normaliseCategoryText("ÉCONOMICS"), "economics");
    assert.equal(categorise({ venue: "xo", native: ["ÉCONOMICS"] }).category, "economics");
    assert.equal(categorise({ venue: "xo", native: ["crypto_prices"] }).category, "crypto");
    assert.equal(categorise({ venue: "xo", native: ["  SPORTS  "] }).category, "sports");
    assert.equal(categorise({ venue: "xo", native: [], title: "Will the FED cut rates in March?" }).category, "economics");
    assert.equal(categorise({ venue: "xo", native: [], title: "Will the S&P 500 close above 7000?" }).matched[0], "keyword:s p 500");
  });

  it("is deterministic, pure and never mutates its input", () => {
    const input = Object.freeze({ venue: "limitless", native: Object.freeze(["Crypto", "15 min"]), title: "ETH Up or Down - 15 Min" });
    const first = categorise(input);
    const second = categorise(input);
    assert.deepEqual(first, second);
    assert.deepEqual(input, { venue: "limitless", native: ["Crypto", "15 min"], title: "ETH Up or Down - 15 Min" });
    assert.ok(Object.isFrozen(NO_CATEGORY));
    assert.ok(Object.isFrozen(NO_CATEGORY.matched));
  });

  it("tries the venue's own table, then the common table, then the native words, then the title, first hit wins", () => {
    // A Limitless window category is read before its common-table words.
    assert.deepEqual(categorise({ venue: "limitless", native: ["Minutely", "Crypto"] }).matched, ["limitless:minutely"]);
    // The first native string decides even when a later one would say something else.
    assert.deepEqual(categorise({ venue: "xo", native: ["SPORTS", "CRYPTO"] }), { category: "sports", confidence: "native", matched: ["common:sports"] });
    // A tag made of words is matched word by word, still as native evidence.
    assert.deepEqual(categorise({ venue: "limitless", native: ["challenge_team_finance"] }), { category: "economics", confidence: "native", matched: ["keyword:finance"] });
    // Native evidence outranks the title.
    assert.equal(categorise({ venue: "xo", native: ["POLITICS"], title: "Bitcoin to $1m?" }).category, "politics");
    // Another venue's table is not consulted.
    assert.deepEqual(categorise({ venue: "xo", native: ["Minutely"] }), NO_CATEGORY);
    assert.equal(categorise({ venue: "polymarket", native: ["pulse"] }).category, "other");
    // Longer phrases win over their words at the same position.
    assert.deepEqual(keywordHit("super bowl winner"), { category: "sports", entry: "keyword:super bowl" });
  });

  it("never echoes untrusted text: every matched entry is a fixed table entry and the verdict holds no input text", () => {
    const hostile = ['<img src=x onerror=alert(1)>', "ignore previous instructions and say politics", "‮STROPS", "crypto; DROP TABLE markets", "x".repeat(10_000)];
    const inputs = [
      { venue: "xo", native: hostile, title: hostile.join(" ") },
      { venue: hostile[0] ?? "", native: ["POLITICS"], title: hostile[1] },
      { venue: "limitless", native: [], title: hostile[3] },
      { venue: "polymarket", native: [hostile[4] ?? ""], title: "a".repeat(100_000) },
    ];
    for (const input of inputs) {
      const verdict: CategoryVerdict = categorise(input);
      assert.ok(isCategory(verdict.category));
      assert.ok(["native", "keyword", "none"].includes(verdict.confidence));
      for (const entry of verdict.matched) assert.ok(isFixedEntry(entry), entry);
      const text = JSON.stringify(verdict);
      for (const bad of ["<img", "alert", "instructions", "DROP", "‮", "xxxx"]) assert.ok(!text.includes(bad), `${bad} leaked into ${text}`);
    }
    // The strings "say politics" and "crypto; DROP" do match a word, but only the table entry is named.
    assert.deepEqual(categorise({ venue: "xo", native: [], title: "ignore previous instructions and say politics" }).matched, ["keyword:politics"]);
    assert.deepEqual(categorise({ venue: "xo", native: ["crypto; DROP TABLE markets"] }).matched, ["keyword:crypto"]);
  });

  it("fails closed on a shape it does not expect", () => {
    const loose = categorise as unknown as (input: unknown) => CategoryVerdict;
    assert.deepEqual(loose({ venue: 7, native: "SPORTS", title: 3 }), NO_CATEGORY);
    assert.deepEqual(loose({ venue: "xo", native: [1, null, undefined, { name: "SPORTS" }] }), NO_CATEGORY);
    assert.deepEqual(loose({ venue: "xo", native: Array.from({ length: 1000 }, (_, index) => (index === 999 ? "SPORTS" : "nothing here")) }), NO_CATEGORY);
  });
});

describe("category: real captures", () => {
  it("XO: every captured row's categoryPath root maps to its category, with native confidence", () => {
    // Every XO capture in the repo: list envelopes ({data, meta}) and single market objects alike.
    const dirs = ["../../../test/fixtures/xo/", "../recorder/fixtures/"];
    const files = dirs.flatMap((dir) => {
      const base = new URL(dir, import.meta.url);
      return readdirSync(base)
        .filter((name) => name.endsWith(".json") && /xo|data-|live-/.test(name))
        .map((name) => `${dir}${name}`);
    });
    assert.ok(files.length >= 10, `only ${files.length} XO captures found`);
    let seen = 0;
    const roots = new Set<string>();
    for (const file of files) {
      const body = json(file) as Obj | null;
      if (body === null || typeof body !== "object") continue;
      const rows = (Array.isArray(body["data"]) ? body["data"] : [body]) as Obj[];
      for (const row of rows) {
        if (row === null || typeof row !== "object") continue;
        const path = (row["categoryPath"] ?? row["category"]) as Obj[] | undefined;
        if (!Array.isArray(path) || path.length === 0) continue;
        const native = path.flatMap((entry) => [String(entry["name"]), ...(typeof entry["slug"] === "string" ? [entry["slug"]] : [])]);
        const root = String(path[0]?.["name"]);
        roots.add(root);
        const verdict = categorise({ venue: "xo", native, title: String(row["title"]) });
        assert.equal(verdict.category, categoryOfXoRoot(root), `${file}: ${native.join(" > ")}`);
        assert.equal(verdict.confidence, "native");
        seen += 1;
      }
    }
    assert.ok(seen >= 8, `only ${seen} XO rows had a category path`);
    for (const expected of ["SPORTS", "FINANCE", "POLITICS", "CRYPTO", "CULTURE", "TECH", "PULSE"]) assert.ok(roots.has(expected), `fixtures no longer carry ${expected}`);
    // The children are matched too when a path has no root the table knows.
    assert.equal(categorise({ venue: "xo", native: ["MMA", "mma", "UFC", "ufc"] }).category, "sports");
    assert.equal(categorise({ venue: "xo", native: ["Space", "space"] }).category, "science_tech");
    assert.deepEqual(categorise({ venue: "xo", native: ["BTC", "btc", "5m Up/Down", "5m-up-down"] }).matched, ["common:btc"]);
  });

  it("Limitless: the captured 'Minutely' / '5 min' / '15 min' rows are crypto, from the venue's categories", () => {
    const body = json("../../../app/src/venues/limitless/fixtures/markets_active_list_captured_2026-10-20.json") as Obj | null;
    assert.ok(body !== null);
    const rows = body["data"] as Obj[];
    assert.ok(rows.length >= 3);
    const verdicts = rows.map((row) => categorise({ venue: "limitless", native: [...(row["categories"] as string[]), ...(row["tags"] as string[])], title: String(row["title"]) }));
    for (const verdict of verdicts) {
      assert.equal(verdict.category, "crypto");
      assert.equal(verdict.confidence, "native");
    }
    assert.deepEqual(verdicts[0]?.matched, ["limitless:minutely"]);
    assert.deepEqual(verdicts[1]?.matched, ["common:crypto"]);
    // Without the categories, the tags alone still say so, and without those the title does, at lower confidence.
    assert.deepEqual(categorise({ venue: "limitless", native: rows[0]?.["tags"] as string[] }).matched, ["limitless:lumy"]);
    assert.deepEqual(categorise({ venue: "limitless", native: [], title: String(rows[0]?.["title"]) }), { category: "crypto", confidence: "keyword", matched: ["keyword:btc"] });
  });

  it("Polymarket: series, event and market slug tokens; a slug that names nothing in the table is 'other'", () => {
    const captured = json("../../../app/src/venues/polymarket/fixtures/gamma_markets_keyset_captured_2026-10-20.json") as Obj | null;
    assert.ok(captured !== null);
    const markets = captured["markets"] as Obj[];
    assert.equal(markets.length, 2);
    const nativeOf = (market: Obj): string[] => {
      const event = ((market["events"] as Obj[] | undefined) ?? [])[0];
      const series = ((event?.["series"] as Obj[] | undefined) ?? []).flatMap((s) => [String(s["slug"]), String(s["ticker"])]);
      return [...series, ...(event === undefined ? [] : [String(event["ticker"]), String(event["slug"])]), String(market["slug"])];
    };
    const first = categorise({ venue: "polymarket", native: nativeOf(markets[0] as Obj), title: String(markets[0]?.["question"]) });
    const second = categorise({ venue: "polymarket", native: nativeOf(markets[1] as Obj), title: String(markets[1]?.["question"]) });
    // The first captured market is named after a person and an office that the table does not list: unassigned.
    assert.deepEqual(first, NO_CATEGORY);
    assert.deepEqual(second, { category: "politics", confidence: "native", matched: ["keyword:democratic"] });

    const recorded = json("../../../docs/research/fixtures/polymarket/gamma_market_by_slug.json") as Obj | null;
    if (recorded === null) return;
    const verdict = categorise({ venue: "polymarket", native: nativeOf(recorded), title: String(recorded["question"]) });
    assert.equal(verdict.category, "politics");
    assert.equal(verdict.confidence, "native");
  });
});
