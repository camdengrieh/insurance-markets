import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  REJECTION_CATEGORIES,
  REJECTION_RULES,
  classifyRejection,
  noteRegime,
  type NoteRegime,
  type RejectionCategory,
} from "../src/xo/creation/review.js";
import {
  METADATA_ENFORCED_RULES,
  PREFLIGHT_RULE_IDS,
  canonicalMetadataText,
  metadataContentHash,
  validateMetadata,
  type MetadataJson,
} from "../src/xo/creation/metadata.js";
import {
  CORPUS_SEED,
  EXACT_SHORT_RULES,
  FIXTURE_DIR,
  buildCorpus,
  readJson,
  type SchemaSummary,
} from "./fixtures/creation/corpus.js";
import { parseCsv } from "./fixtures/creation/records.js";

// Note 23's data, as far as it is in the repository:
//   - the 138 fetched metadata files are NOT saved (only their statistics, schema_summary.json), so the corpus
//     here is a seeded reconstruction that matches those statistics (see test/fixtures/creation/corpus.ts);
//   - four real files and one real original/suggested pair are saved (exemplars.json);
//   - the 51 rejection notes and the 233 update-request notes are saved, truncated to 240 characters.

const summary = readJson<SchemaSummary>("schema_summary.json");
const corpus = buildCorpus();

interface Exemplars {
  readonly approved_gcs: { readonly metadata: MetadataJson };
  readonly approved_s3: { readonly metadata: MetadataJson };
  readonly rejected_substantive: { readonly first_review_note: string; readonly metadata: MetadataJson };
  readonly update_required_pair: { readonly original: MetadataJson; readonly oracle_suggested: MetadataJson };
}
const exemplars = readJson<Exemplars>("exemplars.json");

const count = (items: readonly (string | number)[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const item of items) out[String(item)] = (out[String(item)] ?? 0) + 1;
  return out;
};
const sorted = (record: Readonly<Record<string, number>>): [string, number][] => Object.entries(record).sort(([a], [b]) => a.localeCompare(b));

describe("the reconstructed corpus reproduces the recorded statistics", () => {
  it("has 100 originals, 38 oracle versions and 38 pairs", () => {
    assert.equal(corpus.originals.length, 100);
    assert.equal(corpus.suggestions.length, 38);
    assert.equal(corpus.all.length, summary.n_files);
    assert.equal(corpus.pairs.length, 38);
  });

  it("is deterministic and uses no randomness or clock of its own", () => {
    assert.deepEqual(buildCorpus(), corpus);
    const source = readFileSync(join(FIXTURE_DIR, "corpus.ts"), "utf8");
    assert.ok(!/Math\.random\s*\(/.test(source));
    assert.ok(!/Date\.now\s*\(/.test(source));
    assert.ok(!/new Date\(\)/.test(source));
    assert.equal(CORPUS_SEED, 20_261_019);
  });

  it("has the recorded tag counts, none in the oracle's versions", () => {
    assert.deepEqual(sorted(count(corpus.originals.map((file) => file.tags.length))), sorted(summary.tags_count_original));
    assert.deepEqual(count(corpus.suggestions.map((file) => file.tags.length)), { 0: 38 });
  });

  it("has the recorded subcategory, source and category counts", () => {
    assert.deepEqual(sorted(count(corpus.all.map((file) => file.subcategories.length))), sorted(summary.subcategories_count));
    assert.deepEqual(sorted(count(corpus.all.map((file) => file.resolution_sources.length))), sorted(summary.resolution_sources_count));
    assert.deepEqual(sorted(count(corpus.all.map((file) => file.category))), sorted(summary.category_values_in_sample));
  });

  it("has two outcomes with ids 0 and 1 and two outcome rules with indices 0 and 1 in every file", () => {
    for (const file of corpus.all) {
      assert.deepEqual(file.outcomes.map((entry) => entry.id), [0, 1]);
      assert.deepEqual(file.rules.outcomeRules.map((entry) => entry.outcomeIndex), [0, 1]);
    }
    assert.deepEqual(summary.outcome_count, { 2: 138 });
  });

  it("has Yes/No outcomes in 111 files, a title equal to the description in 82, and the recorded image hosts", () => {
    assert.equal(corpus.all.filter((file) => file.outcomes[0]?.title === "Yes" && file.outcomes[1]?.title === "No").length, 111);
    assert.equal(corpus.all.filter((file) => file.title === file.description).length, summary.title_equals_description);
    const hosts = count(corpus.all.map((file) => file.image_url.replace(/[0-9a-f-]{36}\.webp$/, "")));
    assert.deepEqual(sorted(hosts), sorted(summary.image_url_hosts));
  });

  it("has the recorded bounds of the originals' rules text (38 and 2,616 characters)", () => {
    const lengths = corpus.originals.map((file) => file.rules.description.length);
    assert.equal(Math.min(...lengths), summary.rules_description_chars_original.min);
    assert.equal(Math.max(...lengths), summary.rules_description_chars_original.max);
    assert.ok(corpus.originals.some((file) => file.rules.description === EXACT_SHORT_RULES));
  });

  it("gives each pair the changed fields, source counts and expiry shift that were recorded", () => {
    const records = readJson<{ fields: string[]; src_before: number; src_after: number; exp_changed: boolean; sugg_exp_minus_orig_days: number }[]>("pairs_detail.json");
    assert.equal(records.length, corpus.pairs.length);
    for (const [index, pair] of corpus.pairs.entries()) {
      const record = records[index];
      assert.ok(record);
      if (record === undefined) continue;
      assert.equal(pair.original.resolution_sources.length, record.src_before, `pair ${index} sources before`);
      assert.equal(pair.suggested.resolution_sources.length, record.src_after, `pair ${index} sources after`);
      assert.equal(pair.suggested.tags.length, 0);
      const changed = (field: string): boolean => {
        switch (field) {
          case "tags":
            return JSON.stringify(pair.original.tags) !== JSON.stringify(pair.suggested.tags);
          case "title":
            return pair.original.title !== pair.suggested.title;
          case "description":
            return pair.original.description !== pair.suggested.description;
          case "category":
            return pair.original.category !== pair.suggested.category;
          case "subcategories":
            return JSON.stringify(pair.original.subcategories) !== JSON.stringify(pair.suggested.subcategories);
          case "outcomes":
            return JSON.stringify(pair.original.outcomes) !== JSON.stringify(pair.suggested.outcomes);
          case "resolution_sources":
            return JSON.stringify(pair.original.resolution_sources) !== JSON.stringify(pair.suggested.resolution_sources);
          case "rules.description":
            return pair.original.rules.description !== pair.suggested.rules.description;
          case "rules.outcomeRules":
            return JSON.stringify(pair.original.rules.outcomeRules) !== JSON.stringify(pair.suggested.rules.outcomeRules);
          default:
            throw new Error(`unknown field ${field}`);
        }
      };
      const named = new Set(record.fields);
      for (const field of ["tags", "title", "description", "category", "subcategories", "outcomes", "resolution_sources", "rules.description", "rules.outcomeRules"]) {
        // The two meaning rewrites also reach the description and outcome rules of their own slot.
        if (named.has(field)) assert.ok(changed(field), `pair ${index} should change ${field}`);
      }
      assert.equal(pair.suggestedExpiresAtS - pair.currentExpiresAtS === 0, !record.exp_changed, `pair ${index} expiry`);
      if (record.exp_changed) assert.equal(pair.suggestedExpiresAtS - pair.currentExpiresAtS, Math.round(record.sugg_exp_minus_orig_days * 86_400));
    }
  });
});

describe("every file of the corpus maps to the expected outcome: valid", () => {
  it("passes the deterministic metadata rules with no block (138 of 138)", () => {
    const blocked = corpus.all.flatMap((file, index) => {
      const result = validateMetadata(file);
      return result.ok ? [] : [`file ${index}: ${result.checks.filter((entry) => entry.severity === "block").map((entry) => `${entry.rule}:${entry.code}`).join(",")}`];
    });
    assert.deepEqual(blocked, []);
  });

  it("passes with the originals' own expiry too (C04 sees a date within a day of the end)", () => {
    const blocked = corpus.originals.flatMap((file, index) => {
      const expiry = corpus.originalExpiries[index];
      const result = validateMetadata(file, expiry === undefined ? {} : { expiresAtS: expiry });
      return result.ok ? [] : [`file ${index}: ${result.checks.filter((entry) => entry.severity === "block").map((entry) => entry.code).join(",")}`];
    });
    assert.deepEqual(blocked, []);
  });

  it("passes the four real XO files and both halves of the real pair", () => {
    for (const file of [exemplars.approved_gcs.metadata, exemplars.approved_s3.metadata, exemplars.rejected_substantive.metadata, exemplars.update_required_pair.original, exemplars.update_required_pair.oracle_suggested]) {
      assert.equal(validateMetadata(file).ok, true);
    }
  });

  it("round-trips: parse, canonical text and hash are stable for all 138", () => {
    for (const file of corpus.all) {
      const result = validateMetadata(file);
      assert.ok(result.metadata);
      if (result.metadata === null) continue;
      const text = canonicalMetadataText(result.metadata);
      const again = validateMetadata(JSON.parse(text));
      assert.equal(again.metadata === null ? "" : canonicalMetadataText(again.metadata), text);
      assert.equal(metadataContentHash(result.metadata), metadataContentHash(again.metadata as MetadataJson));
      assert.deepEqual(Object.keys(JSON.parse(text)), ["title", "description", "category", "tags", "subcategories", "image_url", "rules", "resolution_sources", "outcomes"]);
    }
  });

  it("gives all 138 distinct content hashes", () => {
    assert.equal(new Set(corpus.all.map((file) => metadataContentHash(file))).size, 138);
  });
});

describe("the same files made wrong are all blocked (the validator is not vacuous)", () => {
  type Patch = (copy: Record<string, any>) => void;
  const breakers: [string, Patch, string][] = [
    ["a key removed", (copy) => delete copy["rules"], "M01"],
    ["an extra outcome", (copy) => copy["outcomes"].push({ id: 2, title: "Maybe" }), "M02"],
    ["outcome ids swapped", (copy) => ([copy["outcomes"][0].id, copy["outcomes"][1].id] = [1, 0]), "M02"],
    ["outcome rule index wrong", (copy) => (copy["rules"].outcomeRules[0].outcomeIndex = 1), "M03"],
    ["no sources", (copy) => (copy["resolution_sources"] = []), "M07"],
    ["a placeholder source", (copy) => (copy["resolution_sources"] = ["https://example.com/feed"]), "M07"],
    ["an http image", (copy) => (copy["image_url"] = "http://cdn.example-creator.dev/a.webp"), "M06"],
    ["a hidden character in the title", (copy) => (copy["title"] = `${copy["title"]}​`), "M01"],
    ["an e-mail address in the rules", (copy) => (copy["rules"].description += ` Write to desk${String.fromCharCode(64)}example-news.com.`), "M10"],
    ["a mention of XO in the description", (copy) => (copy["description"] += " This also affects XO Market volume."), "R10"],
    ["a title that is not a string", (copy) => (copy["title"] = 12), "M01"],
  ];

  for (const [name, patch, rule] of breakers) {
    it(`blocks all 138 with ${name}`, () => {
      const survivors = corpus.all.flatMap((file, index) => {
        const copy = structuredClone(file) as unknown as Record<string, any>;
        patch(copy);
        const result = validateMetadata(copy);
        const blockedByRule = result.checks.some((entry) => entry.severity === "block" && entry.rule === rule);
        return blockedByRule ? [] : [index];
      });
      assert.deepEqual(survivors, []);
    });
  }
});

describe("the 51 rejected examples map to the expected categories and rule ids", () => {
  interface RejectRow {
    readonly cond12: string;
    readonly created_utc: string;
    readonly reason: string;
  }
  const rejects = readJson<RejectRow[]>("review_notes_reject.json");
  const categories = rejects.map((row) => classifyRejection(row.reason));

  it("has the 51 recorded notes", () => {
    assert.equal(rejects.length, 51);
    assert.equal(new Set(rejects.map((row) => row.cond12)).size, 51);
  });

  it("classifies them into the researcher's categories, with the same counts", () => {
    const expected: Record<RejectionCategory, number> = {
      junk_or_test: 18,
      duplicate: 9,
      ambiguous: 6,
      event_already_happened: 5,
      invalid_source: 4,
      not_binary: 4,
      automated_checker: 3,
      about_xo: 1,
      other: 1,
    };
    assert.deepEqual(count(categories), Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, value])));
    assert.equal(Object.values(expected).reduce((a, b) => a + b, 0), 51);
  });

  it("classifies representative notes one by one", () => {
    const cases: [string, RejectionCategory][] = [
      ["test market", "junk_or_test"],
      ["REJECT", "junk_or_test"],
      ["Duplicate", "duplicate"],
      ["A market with the same event, outcomes, and resolution rules is already live", "duplicate"],
      ["The match has already taken place, so such a market cannot be created.", "event_already_happened"],
      ["Unfortunately, your market cannot be accepted as it is not binary and does not account for a draw.", "not_binary"],
      ["## MODRA Review **Decision:** REJECT [API-Football] Could not extract team names from market.", "automated_checker"],
      ["No accurate source of truth. Example.com doesn't belong to XO Market.", "invalid_source"],
      ["This market is ineligible for listing because it directly concerns XO Market.", "about_xo"],
      ["Verification of this market may be highly disputed, so we cannot accept it", "ambiguous"],
      ["The rewritten rules use an explicit Yes/No format", "other"],
    ];
    for (const [note, category] of cases) assert.equal(classifyRejection(note), category, note);
  });

  it("maps every category to rule ids that exist in the catalogue of 39", () => {
    assert.deepEqual([...Object.keys(REJECTION_RULES)].sort(), [...REJECTION_CATEGORIES].sort());
    for (const rules of Object.values(REJECTION_RULES)) for (const id of rules) assert.ok(PREFLIGHT_RULE_IDS.includes(id), id);
  });

  it("maps the examples to the expected rule ids", () => {
    const rulesFor = (category: RejectionCategory): string => REJECTION_RULES[category].join(",");
    assert.equal(rulesFor("duplicate"), "R09");
    assert.equal(rulesFor("event_already_happened"), "R02");
    assert.equal(rulesFor("not_binary"), "R01,R13");
    assert.equal(rulesFor("automated_checker"), "R08");
    assert.equal(rulesFor("invalid_source"), "M07,R04,R05,R12");
    assert.equal(rulesFor("about_xo"), "R10");
    assert.equal(rulesFor("ambiguous"), "R03,R06,R07,R14");
    assert.equal(rulesFor("junk_or_test"), "");
    // 32 of the 51 rejections name at least one rule: the other 19 are junk or an unexplained rewrite note.
    assert.equal(categories.filter((category) => REJECTION_RULES[category].length > 0).length, 32);
  });

  it("is enforced on the metadata for the two rejection kinds this file can see", () => {
    const sourceRule = REJECTION_RULES["invalid_source"].filter((id) => METADATA_ENFORCED_RULES.includes(id));
    const xoRule = REJECTION_RULES["about_xo"].filter((id) => METADATA_ENFORCED_RULES.includes(id));
    assert.deepEqual(sourceRule, ["M07"]);
    assert.deepEqual(xoRule, ["R10"]);
    const base = structuredClone(exemplars.approved_gcs.metadata) as unknown as Record<string, any>;
    // "No accurate source of truth. Example.com doesn't belong to XO Market."
    const placeholder = structuredClone(base);
    placeholder["resolution_sources"] = ["https://example.com"];
    assert.ok(validateMetadata(placeholder).checks.some((entry) => entry.rule === "M07" && entry.severity === "block"));
    // "markets about the project itself, or that reference XO Market metrics, are not permitted."
    const about = structuredClone(base);
    about["title"] = "Will XO Market reach 10,000 active traders by December 2026?";
    assert.ok(validateMetadata(about).checks.some((entry) => entry.rule === "R10" && entry.severity === "block"));
  });

  it("lets the one real rejected file through the shape rules (a reviewer's judgement cannot be linted)", () => {
    // The oracle rejected this file because its text names no team the API checker could extract. The metadata
    // rules cannot see that; they only warn about its title.
    const result = validateMetadata(exemplars.rejected_substantive.metadata);
    assert.equal(result.ok, true);
    assert.equal(classifyRejection(exemplars.rejected_substantive.first_review_note), "automated_checker");
    assert.ok(result.checks.some((entry) => entry.rule === "M08" && entry.severity === "warn"));
  });
});

describe("oracle note regimes", () => {
  interface UpdateRow {
    readonly cond12: string;
    readonly note: string;
    readonly accepted: boolean;
  }
  interface OutcomeRow {
    readonly cond12: string;
    readonly notes_regime: string;
  }
  const regimeNames: Readonly<Record<string, NoteRegime>> = { "admin-stamp": "admin_stamp", "MODRA-format": "modra", "auto-summary": "auto_summary", "free-text": "free_text" };
  const rows = parseCsv(readFileSync(join(FIXTURE_DIR, "conviction_outcomes.csv"), "utf8")) as unknown as OutcomeRow[];
  const byCond = new Map(rows.map((row) => [row.cond12, row]));

  it("recognises the four forms exactly, and an empty note", () => {
    assert.equal(noteRegime("Market approved by admin"), "admin_stamp");
    assert.equal(noteRegime("  Market approved by admin  "), "admin_stamp");
    assert.equal(noteRegime("Market approved by admin, thanks"), "free_text");
    assert.equal(noteRegime("This market is clear and ready to resolve."), "auto_summary");
    assert.equal(noteRegime("## MODRA Review\n\n**Decision:** APPROVE"), "modra");
    assert.equal(noteRegime("   "), "empty");
    assert.equal(noteRegime("The rules were tightened."), "free_text");
  });

  it("agrees with the researcher's regime column for all 233 update requests and 51 rejections", () => {
    const updates = readJson<UpdateRow[]>("review_notes_update_required.json");
    const rejects = readJson<{ cond12: string; reason: string }[]>("review_notes_reject.json");
    assert.equal(updates.length, 233);
    let compared = 0;
    for (const row of [...updates.map((entry) => ({ cond12: entry.cond12, note: entry.note })), ...rejects.map((entry) => ({ cond12: entry.cond12, note: entry.reason }))]) {
      const recorded = byCond.get(row.cond12);
      assert.ok(recorded, row.cond12);
      assert.equal(noteRegime(row.note), regimeNames[recorded?.notes_regime ?? ""], row.cond12);
      compared += 1;
    }
    assert.equal(compared, 284);
  });

  it("finds the 12 MODRA-format update notes the researcher counted", () => {
    const updates = readJson<UpdateRow[]>("review_notes_update_required.json");
    assert.equal(updates.filter((row) => noteRegime(row.note) === "modra").length, 12);
    assert.equal(updates.filter((row) => row.accepted).length, 218);
  });
});

describe("the fixtures are the research files", () => {
  it("are byte-identical to docs/research/fixtures/gaps/creation-and-metadata-onchain when those exist", (t) => {
    const research = join(fileURLToPath(new URL("..", import.meta.url)), "docs", "research", "fixtures", "gaps", "creation-and-metadata-onchain");
    if (!existsSync(research)) {
      t.skip("docs/research is not present");
      return;
    }
    for (const name of ["conviction_outcomes.csv", "review_notes_reject.json", "review_notes_update_required.json", "pairs_detail.json", "schema_summary.json", "exemplars.json"]) {
      const original = createHash("sha256").update(readFileSync(join(research, name))).digest("hex");
      const copy = createHash("sha256").update(readFileSync(join(FIXTURE_DIR, name))).digest("hex");
      assert.equal(copy, original, name);
    }
  });
});
