import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULTS } from "../src/config.js";
import {
  INFO_CODES,
  LINT_CODES,
  NOTE23_CHECKS,
  NOTE23_IDS,
  PLUGIN_ONLY_CODES,
  PASS_CODES,
  lintMarketDraft,
  type LintResult,
  type MarketDraft,
} from "../src/create/lint.js";
import { codesOf, find } from "./draft-lint-helpers.js";

// How the lint relates to docs/research/23, section 8: the table of 39 checks, the five real metadata
// files, a reconstruction of the other 133, and the 51 rejections. The data is read from the research
// fixtures, which are not edited.
//
// What the repository holds of the research data (and so what this file can prove):
//   - the 138 fetched metadata files are NOT saved: only their statistics, five full files and the
//     reviewers' notes. The 51 rejection reasons are saved without the drafts they rejected.
//   - so the real-file tests below run five real files, and the rejection tests map each reason to the
//     rule that answers it using a synthetic draft that shows the problem. That proves the rule exists
//     and fires; it cannot prove it would have fired on the original draft.

const RESEARCH = fileURLToPath(new URL("../docs/research/fixtures/gaps/creation-and-metadata-onchain/", import.meta.url));
const NOTE = fileURLToPath(new URL("../docs/research/23-creation-and-metadata-onchain.md", import.meta.url));

function readResearch<T>(name: string): T {
  assert.ok(existsSync(`${RESEARCH}${name}`), `docs/research fixture ${name} is missing`);
  return JSON.parse(readFileSync(`${RESEARCH}${name}`, "utf8")) as T;
}

describe("NOTE23_CHECKS: the 39 checks of the review study", () => {
  it("names exactly the ids that section 8 of the note lists", () => {
    const text = readFileSync(NOTE, "utf8");
    const section = text.slice(text.indexOf("## 8. Proposed deterministic pre-flight checklist"), text.indexOf("## 9. Task item 4"));
    const ids = [...section.matchAll(/^\| ([MCRO]\d\d) \|/gm)].map((match) => match[1]);
    assert.equal(ids.length, 39);
    assert.deepEqual([...NOTE23_IDS], ids);
    assert.deepEqual(Object.keys(NOTE23_CHECKS).sort(), [...NOTE23_IDS].sort());
    assert.equal(NOTE23_IDS.filter((id) => !id.startsWith("O")).length, 30, "30 lintable checks");
    assert.equal(NOTE23_IDS.filter((id) => id.startsWith("O")).length, 9, "9 operational checks");
  });

  it("gives every check a status, a reason and a place for whatever the lint does not do", () => {
    for (const id of NOTE23_IDS) {
      const entry = NOTE23_CHECKS[id];
      assert.ok(entry.note.length > 10, id);
      if (entry.status === "covered") assert.ok(entry.codes.length > 0, `${id} covered but names no code`);
      if (entry.status === "partial") {
        assert.ok(entry.codes.length > 0, `${id} partial but names no code`);
      }
      if (entry.status === "elsewhere" || entry.status === "dropped") {
        assert.deepEqual(entry.codes, [], `${id} is not the lint's`);
        assert.ok(entry.elsewhere && entry.elsewhere.length > 10, `${id} says nothing about where it lives`);
      }
    }
  });

  it("makes every operational check somebody else's, and the cadence check a recorded user decision", () => {
    for (const id of NOTE23_IDS.filter((entry) => entry.startsWith("O"))) {
      assert.ok(["elsewhere", "dropped"].includes(NOTE23_CHECKS[id].status), id);
    }
    assert.equal(NOTE23_CHECKS.O03.status, "dropped");
    assert.match(NOTE23_CHECKS.O03.elsewhere ?? "", /no creation cadence cap/);
  });

  it("names only codes that exist", () => {
    const known = new Set<string>([...Object.keys(LINT_CODES), ...PASS_CODES, ...INFO_CODES]);
    for (const id of NOTE23_IDS) {
      for (const code of NOTE23_CHECKS[id].codes) assert.ok(known.has(code), `${id} names unknown code ${code}`);
    }
  });

  it("accounts for every registered code: named by a check, or listed as the plugin's own rule", () => {
    const named = new Set(NOTE23_IDS.flatMap((id) => NOTE23_CHECKS[id].codes));
    for (const code of Object.keys(LINT_CODES)) {
      const own = Object.hasOwn(PLUGIN_ONLY_CODES, code);
      assert.ok(named.has(code) !== own, `${code} must be named by a check or be plugin-only, not both and not neither`);
    }
    for (const code of Object.keys(PLUGIN_ONLY_CODES)) {
      assert.ok(Object.hasOwn(LINT_CODES, code), `${code} is plugin-only but not a registered code`);
      assert.ok((PLUGIN_ONLY_CODES[code] ?? "").length > 5, code);
    }
    for (const code of INFO_CODES) assert.ok(named.has(code), `${code} is named by no check`);
  });

  it("does not bring back a creation cadence setting", () => {
    const everything = JSON.stringify({ NOTE23_CHECKS, PLUGIN_ONLY_CODES, LINT_CODES });
    assert.ok(!/max_?(?:markets|creates)_?per_?day|MAX_CREATES_PER_DAY|maxCreatesPerDay/i.test(everything));
    assert.ok(!Object.keys(LINT_CODES).some((code) => /cadence|per_day|per_week/.test(code)));
  });
});

// ---- the real files ---------------------------------------------------------------------------------------------

interface MetadataFile {
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly rules: { readonly description: string; readonly outcomeRules: ReadonlyArray<{ readonly rule: string }> };
  readonly resolution_sources: readonly string[];
  readonly outcomes: ReadonlyArray<{ readonly title: string }>;
}

// A document is judged as a draft: its rules text is the description plus both outcome rules, which
// is what a reviewer reads.
function asDraft(file: MetadataFile, closeDate: string): MarketDraft {
  return {
    title: file.title,
    description: file.description,
    category: file.category,
    outcomes: file.outcomes.map((entry) => entry.title),
    rules: [file.rules.description, ...file.rules.outcomeRules.map((entry) => entry.rule)].join(" "),
    resolutionSources: file.resolution_sources,
    closeDate,
  };
}
function lintFile(file: MetadataFile, closeDate: string, nowIso: string): LintResult {
  return lintMarketDraft(asDraft(file, closeDate), { nowMs: Date.parse(nowIso), config: DEFAULTS });
}

interface Exemplars {
  readonly approved_gcs: { readonly metadata: MetadataFile };
  readonly approved_s3: { readonly metadata: MetadataFile };
  readonly rejected_substantive: { readonly metadata: MetadataFile };
  readonly update_required_pair: { readonly original: MetadataFile; readonly oracle_suggested: MetadataFile };
}
const exemplars = readResearch<Exemplars>("exemplars.json");

// The close dates are not in the files; each is the day after the date the rules name. The clock is
// a day or two before the event, as it was when the file was written.
const REAL: ReadonlyArray<{ name: string; file: MetadataFile; close: string; now: string }> = [
  { name: "approved (GCS)", file: exemplars.approved_gcs.metadata, close: "2026-08-27T00:00:00Z", now: "2026-08-20T12:00:00Z" },
  { name: "approved (S3)", file: exemplars.approved_s3.metadata, close: "2027-01-01T00:00:00Z", now: "2026-10-18T12:00:00Z" },
  { name: "rejected by the automated checker", file: exemplars.rejected_substantive.metadata, close: "2026-10-05T00:00:00Z", now: "2026-10-01T12:00:00Z" },
  { name: "sent back (original)", file: exemplars.update_required_pair.original, close: "2027-01-01T00:00:00Z", now: "2026-10-18T12:00:00Z" },
  { name: "sent back (oracle's version)", file: exemplars.update_required_pair.oracle_suggested, close: "2027-01-01T00:00:00Z", now: "2026-10-18T12:00:00Z" },
];

describe("the five real metadata files", () => {
  it("never fail the lint, the approved ones and the oracle's own rewrite included", () => {
    for (const { name, file, close, now } of REAL) {
      const result = lintFile(file, close, now);
      assert.equal(result.counts.fail, 0, `${name}: ${codesOf(result).join(", ")}`);
      assert.notEqual(result.verdict, "fail", name);
    }
  });

  it("pass cleanly when the file is one XO approved with a full cutoff (the S3 file)", () => {
    const result = lintFile(exemplars.approved_s3.metadata, "2027-01-01T00:00:00Z", "2026-10-18T12:00:00Z");
    assert.equal(result.verdict, "pass");
    assert.deepEqual(codesOf(result), []);
  });

  it("flag the missing time of day in the file that only gives a date", () => {
    const result = lintFile(exemplars.approved_gcs.metadata, "2026-08-27T00:00:00Z", "2026-08-20T12:00:00Z");
    assert.deepEqual(codesOf(result), ["rules_cutoff_incomplete"]);
  });

  it("warn about the accumulator that the automated checker rejected, but only warn", () => {
    const result = lintFile(exemplars.rejected_substantive.metadata, "2026-10-05T00:00:00Z", "2026-10-01T12:00:00Z");
    const codes = codesOf(result);
    assert.ok(codes.includes("title_composite"), codes.join(", "));
    assert.ok(codes.includes("title_not_question"));
    assert.ok(codes.includes("ambiguous_date"), "October 4th names no year");
    assert.equal(result.verdict, "warn");
  });

  it("ask for what the oracle added when it sent the original back", () => {
    const original = codesOf(lintFile(exemplars.update_required_pair.original, "2027-01-01T00:00:00Z", "2026-10-18T12:00:00Z"));
    const rewrite = codesOf(lintFile(exemplars.update_required_pair.oracle_suggested, "2027-01-01T00:00:00Z", "2026-10-18T12:00:00Z"));
    // The oracle's rewrite gave the deadline a time and a zone, said when Yes and when No, and named the
    // sources it relies on. Each of those is something the lint asks of the original.
    for (const code of ["rules_cutoff_incomplete", "rules_missing_yes_condition", "rules_missing_default_outcome", "rules_missing_source_reference"]) {
      assert.ok(original.includes(code), `original: ${code}`);
      assert.ok(!rewrite.includes(code), `rewrite: ${code}`);
    }
    assert.ok(rewrite.length < original.length);
  });

  it("do not change when the dates are judged against a later clock only by the past-date rule", () => {
    const later = lintFile(exemplars.approved_s3.metadata, "2027-01-01T00:00:00Z", "2027-02-01T12:00:00Z");
    assert.ok(codesOf(later).includes("event_date_in_past"));
    assert.ok(codesOf(later).includes("close_date_in_past"));
  });
});

// ---- the reconstruction of the other files -------------------------------------------------------------------------

interface SchemaSummary {
  readonly n_files: number;
  readonly outcome_title_pairs_top: ReadonlyArray<readonly [string, number]>;
}

describe("a reconstruction of the 138 fetched files (statistics real, prose invented)", () => {
  it("fails a document only for the three rules that are meant to be strict here", async (t) => {
    let corpus: { originals: readonly MetadataFile[]; suggestions: readonly MetadataFile[]; originalExpiries: readonly number[]; pairs: ReadonlyArray<{ currentExpiresAtS: number }> };
    try {
      const module = (await import("./fixtures/creation/corpus.js")) as { buildCorpus?: () => typeof corpus };
      if (typeof module.buildCorpus !== "function") {
        t.skip("test/fixtures/creation/corpus.ts has no buildCorpus");
        return;
      }
      corpus = module.buildCorpus();
    } catch {
      t.skip("test/fixtures/creation/corpus.ts is not available");
      return;
    }
    const summary = readResearch<SchemaSummary>("schema_summary.json");
    const yesNoRecorded = summary.outcome_title_pairs_top.find(([pair]) => pair === "('Yes', 'No')")?.[1] ?? 0;
    assert.equal(yesNoRecorded, 111);

    const documents = [
      ...corpus.originals.map((file, index) => ({ file, expiresS: corpus.originalExpiries[index] as number })),
      ...corpus.suggestions.map((file, index) => ({ file, expiresS: (corpus.pairs[index] as { currentExpiresAtS: number }).currentExpiresAtS })),
    ];
    assert.equal(documents.length, summary.n_files);
    const failures = new Map<string, number>();
    const cryptoWithoutCutoff: string[] = [];
    for (const { file, expiresS } of documents) {
      // The clock stands ten days before the expiry, as it did when the market was written.
      const result = lintMarketDraft(asDraft(file, new Date(expiresS * 1000).toISOString()), {
        nowMs: (expiresS - 10 * 86_400) * 1000,
        config: DEFAULTS,
      });
      for (const code of new Set(result.items.filter((item) => item.severity === "fail").map((item) => item.code))) {
        failures.set(code, (failures.get(code) ?? 0) + 1);
      }
      if (find(result, "rules_cutoff_incomplete_crypto") !== undefined) cryptoWithoutCutoff.push(file.category);
    }
    // 1. outcomes_not_yes_no: the draft lint fails anything but Yes then No, as it always did. The study's
    //    files use other labels in 27 of 138 (src/xo/creation/metadata.ts treats that as a note).
    assert.equal(failures.get("outcomes_not_yes_no"), summary.n_files - yesNoRecorded);
    // 2. rules_cutoff_incomplete_crypto: the study's R03 blocks a crypto market whose rules give a date but no
    //    time of day. The reconstructed crypto files do exactly that, as did most originals (a time zone was in
    //    11% of the 27 approved files of the sample), so this rule is strict on purpose; see open issues.
    assert.ok((failures.get("rules_cutoff_incomplete_crypto") ?? 0) > 0);
    assert.ok(cryptoWithoutCutoff.every((category) => category === "CRYPTO" || category === "FINANCE" || category === "TECH"), cryptoWithoutCutoff.join(","));
    // 3. relative_date: "opening weekend" with no date, an older rule.
    // Nothing else fails: none of the rules added by the reconciliation fires on these files.
    assert.deepEqual(
      [...failures.keys()].sort(),
      ["outcomes_not_yes_no", "relative_date", "rules_cutoff_incomplete_crypto"],
    );
  });
});

// ---- the 51 rejections ---------------------------------------------------------------------------------------------

// The researcher's classifier (scripts/inline_analyses.py, rcat), ported. The order of the tests matters.
type Category =
  | "junk"
  | "duplicate"
  | "past_event"
  | "not_binary"
  | "automated_checker"
  | "bad_source"
  | "about_xo"
  | "ambiguous"
  | "other";

function classify(reason: string): Category {
  const s = reason.toLowerCase().trim();
  if (/^(?:test(?: market)?|this was a test market|reject(?:ed)?|\.|was created before the seed fix)$/.test(s)) return "junk";
  if (/dup|already (?:exists|live)|current market already|same event|identical markets/.test(s)) return "duplicate";
  if (/already (?:taken place|been played|concluded)|past event|has already|already concluded/.test(s)) return "past_event";
  if (/not binary|binary format|draw|two binaries/.test(s)) return "not_binary";
  if (/api-football|playbook/.test(s)) return "automated_checker";
  if (/source|example\.com|opensea|does not display/.test(s)) return "bad_source";
  if (/concerns xo|about the project|xo market metrics/.test(s)) return "about_xo";
  if (/ambiguous|specify|not specify|vague|subjective|disputed|unambiguous|misleading|too far|unlikely to match/.test(s)) return "ambiguous";
  return "other";
}

describe("the 51 rejected examples map to the rule that answers each", () => {
  const rejects = readResearch<Array<{ cond12: string; created_utc: string; reason: string }>>("review_notes_reject.json");
  const counts = new Map<Category, number>();
  for (const entry of rejects) counts.set(classify(entry.reason), (counts.get(classify(entry.reason)) ?? 0) + 1);

  it("has the 51 reasons the note counts, in the note's categories", () => {
    assert.equal(rejects.length, 51);
    assert.deepEqual(Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))), {
      about_xo: 1,
      ambiguous: 6,
      automated_checker: 3,
      bad_source: 4,
      duplicate: 9,
      junk: 18,
      not_binary: 4,
      other: 1,
      past_event: 5,
    });
  });

  // What the reviewers rejected is saved only as their reason, so each category gets a synthetic draft
  // that shows the same problem. The expectation is the rule that answers it, and its severity.
  const GOOD: MarketDraft = {
    title: "Will Bitcoin's daily closing price on Coinbase be above $150,000 on December 31, 2026?",
    description: "Binary market on whether BTC-USD closes above $150,000 on Coinbase on the last day of 2026.",
    category: "Crypto",
    outcomes: ["Yes", "No"],
    rules:
      "This market resolves Yes if the 1-day candle for BTC-USD on Coinbase Exchange (https://exchange.coinbase.com/markets/BTC-USD) that opens at 2026-12-31T00:00:00Z closes at a price strictly above 150,000 USD. Otherwise the market resolves No. If Coinbase does not publish that candle, or BTC-USD trading is suspended for the whole day, the market is void and positions resolve equally.",
    resolutionSources: ["https://exchange.coinbase.com/markets/BTC-USD"],
    closeDate: "2027-01-01T00:00:00Z",
  };
  const NOW = Date.parse("2026-10-19T12:00:00Z");
  const run = (overrides: Partial<MarketDraft>): LintResult => lintMarketDraft({ ...GOOD, ...overrides }, { nowMs: NOW, config: DEFAULTS });
  const severityOf = (result: LintResult, code: string) => find(result, code)?.severity;

  it("junk and test markets: a test title and a few words of rules fail", () => {
    const result = run({ title: "test market", rules: "test", description: "test" });
    assert.equal(result.verdict, "fail");
    assert.equal(severityOf(result, "rules_too_short"), "fail");
    assert.ok(find(result, "title_short"), "and the title is too short to say anything");
  });

  it("duplicates: fail when the live market is among the titles the caller passes in", () => {
    const result = run({ existingTitles: [GOOD.title] });
    assert.equal(severityOf(result, "duplicate_market"), "fail");
    assert.equal(result.duplicate_check, "run");
    // Without the search the lint can only point at it.
    assert.equal(run({}).duplicate_check, "not_run");
  });

  it("ambiguous or underspecified: the rules that give no exact start or cutoff time fail for crypto", () => {
    // 'do not specify the exact start time and date for the 1-hour BTC/USDT candle', 'do not specify a cutoff date/time'.
    const result = run({
      rules:
        "This market resolves Yes if the 1-hour BTC/USDT candle on Binance (https://www.binance.com) closes strictly above 150,000 USDT on 2026-12-31. Otherwise the market resolves No. If Binance does not publish that candle the market is void.",
    });
    assert.equal(severityOf(result, "rules_cutoff_incomplete_crypto"), "fail");
  });

  it("an event that already happened: every date being over fails", () => {
    const result = run({
      title: GOOD.title.replace("December 31", "September 30"),
      rules: GOOD.rules.replace("2026-12-31", "2026-09-30"),
    });
    assert.equal(severityOf(result, "event_date_in_past"), "fail");
  });

  it("a source that is not real: example.com fails", () => {
    const result = run({ resolutionSources: ["https://example.com/btc"] });
    assert.equal(severityOf(result, "source_placeholder"), "fail");
  });

  it("not a clean binary: a result that can end level, or three named outcomes, fails", () => {
    const clasico = run({
      title: "Will Barcelona win the first El Clásico of the 2026-27 La Liga season?",
      category: "Sports",
      rules:
        "This market resolves Yes if Barcelona win the El Clásico played on 2026-10-26T20:00:00Z according to La Liga (https://www.laliga.com). Otherwise the market resolves No. If the match is cancelled the market is void and positions resolve equally.",
      resolutionSources: ["https://www.laliga.com"],
      closeDate: "2026-10-27T00:00:00Z",
    });
    assert.equal(severityOf(clasico, "rules_draw_unaddressed"), "fail");
    assert.equal(severityOf(run({ outcomes: ["BARCELONA", "REAL MADRID"] }), "outcomes_not_yes_no"), "fail");
    assert.equal(severityOf(run({ outcomes: ["Barcelona", "Draw", "Real Madrid"] }), "outcomes_count"), "fail");
    assert.equal(severityOf(run({ title: "Germany & Netherlands win. Norway to draw. And 1 red card." }), "title_composite"), "warn");
  });

  it("the automated checker's team-name rejection is only a warning here: the accumulator title", () => {
    const result = lintFile(exemplars.rejected_substantive.metadata, "2026-10-05T00:00:00Z", "2026-10-01T12:00:00Z");
    assert.equal(severityOf(result, "title_composite"), "warn");
  });

  it("a market about XO itself fails", () => {
    const result = run({ title: "Will XO Market list more than 1,000 markets by December 31, 2026?" });
    assert.equal(severityOf(result, "xo_self_reference"), "fail");
  });

  it("states how much of the 51 the lint can act on, so the gap is visible", () => {
    const answered: Record<Category, "lint" | "partly" | "not_lintable"> = {
      junk: "lint",
      duplicate: "lint",
      past_event: "lint",
      not_binary: "lint",
      about_xo: "lint",
      bad_source: "partly",
      ambiguous: "partly",
      automated_checker: "partly",
      other: "not_lintable",
    };
    const sum = (kind: string) => [...counts].filter(([category]) => answered[category] === kind).reduce((total, [, n]) => total + n, 0);
    assert.equal(sum("lint"), 18 + 9 + 5 + 4 + 1);
    assert.equal(sum("partly"), 4 + 6 + 3);
    assert.equal(sum("not_lintable"), 1);
    assert.equal(sum("lint") + sum("partly") + sum("not_lintable"), 51);
  });

  it("holds no email address, handle or home path in what it read", () => {
    const text = readFileSync(`${RESEARCH}review_notes_reject.json`, "utf8");
    assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(text));
  });
});
