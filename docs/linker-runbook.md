# Runbook: the link proposer (`pm/linker`)

For the person who runs the linker, reads its report and approves (or not) what it proposes. The linker is
deterministic code: every two hours it reads every open binary market on the venues whose terms allow
it, groups markets that ask the same question across venues (and within one), scores each pair, and
writes **candidates** into the working link registry. A candidate is "proposed, not approved". The only
power to approve stays with a person (`pm/README.md`: "LLMs and statistics may propose or veto a link,
never promote one"). An LLM scheduled routine may run the job and add vetoes; it cannot approve.

**No run against the real venues has happened.** Everything here was exercised against loopback servers
replaying the captured response shapes and a synthetic world (`pm/test/linker`). Counts, timings and the
usefulness of the proposals on real markets are unknown.

All commands run from the repository root with the project toolchain:

```sh
cd <repo-root>
source .tools/env.sh
LINKER="node_modules/.bin/tsx pm/linker/main.ts"
LINKS="node_modules/.bin/tsx pm/links/cli.ts"
```

Never run `pnpm add`, `install`, `update` or `remove` for any of this. pm/ has no dependencies of its own.

## 1. What it reads

| Venue | Host | Route | Persisted | Terms |
|---|---|---|---|---|
| XO Market | `api-mainnet.xo.market` | `GET /api/markets?marketType=2&statuses=ACTIVE` (list, 50 per page), then `GET /api/markets/contract/<conditionId>` per market (the list carries `rules: {}`) | ids, hashes, category, timestamps | public keyless read API; registry data policy `mayPersist` |
| Polymarket (international) | `gamma-api.polymarket.com` | `GET /markets/keyset?closed=false&active=true&limit=100` with `cursor` | same | public keyless; `mayPersist` |
| Limitless | `api.limitless.exchange` | `GET /markets/active?limit=25&page=N` | same | public keyless; `mayPersist` |
| Kalshi | never contacted | never | never | Developer Agreement bars caching or aggregating |
| Quotient | never fetched or paid for by the linker | memory only, stdout only | never | terms restrict redistribution |
| every other venue | never | never | never | terms restrictive or unread: memory-only in the registry |

The allowlist is code (`pm/linker/allowlist.ts`, the recorder's list): no flag or file widens it. Every
request goes through the recorder's `PoliteClient`: GET only, fixed User-Agent
`insurance-markets-research/0.1`, the recorder's per-host budgets, backoff and breaker, no redirects, no
cookies. XO detail reads are capped at 300 per pass (`--max-detail`) and cached for six hours, so a pass
stays far inside the `api-mainnet.xo.market` budget (3000 per hour).

Markets are skipped, by name in the report, when they are not binary, not open, close within two hours, or
their rule-bearing fields are missing (an XO detail without `rules` text, for example): a hash over partial
rules would pin something other than the rules.

## 2. What it writes

Under `--out` (default `pm/linker/out`):

| File | Contents |
|---|---|
| `linker-state.json` | per market: token hashes of the masked title and rules, number/date/entity hashes, the two rule hashes, close time, category, when it was seen and when its rules were read; the last 12 run summaries. **No text.** The writer refuses any venue outside the allowlist before writing a byte. |
| `candidates.bundle.json` + `candidates.bundle.pin` | a hash-pinned `pm-link-bundle` of the whole registry, candidates included (`buildBundle` with `includeCandidates`). Rewritten only when the set of links or their pins changed; otherwise the earlier bytes and pin stand. |
| `structure-groups.json` | within-venue native groups (XO root events, Polymarket neg-risk sets) as ids only: the inputs `pm_check_structure` needs once books are fetched. `exhaustive` is always `unknown`. |
| `linker.lock` | advisory lock while a pass runs (two linkers cannot write one `--out`). |

And the working registry named by `--registry` (default `pm/links/data/registry.json`): candidates are added
through `store.proposeLink` (state `candidate`, tier cap `indicative_discrepancy`, proposer
`stats-linker-v1`, whose handle the invariants recognise as automation so it can never be a reviewer).
The registry's event log records every proposal and veto.

What the bundle contains: ids, outcome maps, the rules-v2 and mask-v1 hashes, close times, void policies,
resolver ids, group keys, the relation, basis class and axes (our own close timestamps on a timing axis),
the proof level `P_unproven` with a `statistics_hint` evidence code (the score breakdown, for example
`s9505.t10000.r9428.n5000.d10000.c5h`), `proposedBy` and `validUntil`.

What it never contains: a title, a question, a rule text, a quote, a price, a Quotient number, a Kalshi or
Quotient id, a person's name or handle other than the fixed proposer id.

## 3. Scoring

Blocking first: a market's block is its category (from `pm/core/category.ts`: the venue's own category or
tags, else a keyword in the title, else `other`) plus the ISO week of its close. Pairs are scored inside a
block, between a block and the next week's block of the same category, and between any block and the
`other` block of the same and the next week (a market the classifier could not place may still be the same
question). Each unordered pair is scored exactly once. Blocks above 400 markets are truncated and the report
says so. Within-venue pairs are scored like cross-venue ones, except that two markets of one venue in the
same native group (an XO root event, a Polymarket neg-risk set) are never paired: they are different
outcomes of one event, proposed only as a `partition` or `ladder` below. Nor are two markets of one venue
whose titles differ: a venue does not list one question twice under different wording, and its sibling
outcomes ("A to win vs B" and "B to win vs A", "map 1" and "map 2", one up/down template per ticker)
share every masked token and entity the score compares. A relisting with the identical title is still
scored. The report counts both kinds of pair it leaves out.

The score of a pair, in integer basis points (`sdk/linker/score.ts`, weights in `sdk/linker/constants.ts`):

```
score = ( 35 * J(titleTokens) + 20 * J(ruleTokens) + 15 * A(numbers)
        + 10 * A(dates) + 10 * J(entities) + 10 * P(closeDelta) ) / 100

J(x) = Jaccard index of the two hash sets (0 when both empty)
A(x) = J(x) when both sides have values; 5000 when both are empty; 2500 when one side is empty
P(d) = 10000 when the closes are within 60 minutes; 0 at 7 days or more; linear in between
rulesSha256 and titleSha256 both equal (same rule text, same question) short-circuits to 10000
```

Equal rule hashes alone are not enough: a venue's rule fields can leave the question out (Polymarket's
are the event description, resolution source and end date), so "Will X win?" and "Will Y win?" in one
event can share a rules hash. `titleSha256` is the sha256 of the canonical title; like every feature it is
a hash, never text.

Tokens come from the title and the rules after the existing canonicalisation (`pm/links/hash.ts`:
`canonicalRuleText`, then `maskRuleText`, so dates, times, numbers, URLs and venue names are slot markers);
numbers are normalised (`80k`, `80,000` and `$80000` agree) and the digits of dates and close fields are not
numbers; entities are the capitalised words of the title. Everything is hashed before it is stored.

Thresholds: a pair at or above **6000** is proposed; bands for the reader are `strong` (8500 and above),
`good` (7000 to 8499), `weak` (6000 to 6999). Two hard vetoes stop a pair whatever its score: both sides name
numbers and share none (`number_disagreement`: 80000 versus 90000 is a ladder, not the same question), or
both name dates, share none, and close more than two days apart (`date_disagreement`).

Relation and basis of a proposal: identical rule hashes and titles, template, void policy and close give `identity`
(basis `identical`); different closes give `near_identity` with a `timing_cutoff` axis whose values are the
two pinned close instants (minor up to 24 hours, major beyond) and `cutoffDeltaMinutes`; the same close with
different rule text gives `near_identity` with basis `different` and no axes: the reviewer names the axes,
the statistics cannot. Native Polymarket neg-risk sets are proposed as `partition` with exhaustiveness
`E1_exclusive_only` (source `native_hook`, proof `P0_native`: provenance, not verification). Markets in one
native group with the same masked template and different numbers or dates are proposed as a `ladder`
(`monotonicity: unknown`).

The score is symmetric and monotone in shared tokens (tests: `pm/test/linker/score.test.ts`). It is a
similarity, not evidence: the design's gold-set gates (`pm/links/goldset`) apply to a class only after a
human-labelled evaluation, and none has been run.

Stale candidates: a candidate of the linker's whose leg was seen with a different rules hash or close time,
or whose leg has closed, is vetoed (`store.vetoLink`, state `revoked`), and the pair is re-proposed with the
new pins if it still scores. A same-question candidate of the linker's (`identity`, `near_identity`) is also
vetoed when two of its legs are siblings of one native group (`same_native_group`) or sit on one venue with
different titles (`same_venue_different_title`), or when an `identity`'s
legs have different titles (`question_differs`): earlier runs proposed those from equal rules hashes alone.
A **human-approved** link whose pinned leg changed is **suspended** for review
and the report prints it in capitals.

## 4. Run it once, locally

```sh
$LINKER dry-run                                            # the request plan; nothing is sent or written
$LINKER once --registry pm/links/data/registry.json --out pm/linker/out
$LINKER report --registry pm/links/data/registry.json --out pm/linker/out
```

`once` prints, per venue, listed / open / featured / from cache / skipped-by-reason counts; the number of
pairs scored, vetoed and below the line; what was proposed, already present, refused by the invariants or
capped; stale candidates vetoed; whether the registry and bundle were written; and the top candidates by
score with ids and hashes only. The last lines are the Quotient section (section 6).

Re-running with the same inputs is a no-op: the same bundle bytes and pin, the registry unchanged
(`pm/test/linker/run.test.ts`). The lock refuses a second concurrent pass (exit 3).

`--venues xo,polymarket` restricts the venues (a restricted venue is refused with its reason);
`--config <file>` takes the recorder's JSON (per-host budgets below the ceilings; `hostBases` only accepts
loopback origins, for tests); `--max-detail N` caps XO detail reads.

## 5. Approve a candidate (a person, on a terminal)

```sh
$LINKS list --state candidate
$LINKS review <link-id>          # prints the review sheet and the digest; changes nothing
$LINKS approve <link-id> --reviewer <your-handle> --date <YYYY-MM-DD> \
   --evidence "what you checked" --digest <digest from review> --ack "<the sentence review printed>"
```

Read both markets' current rules on their own venues yourself; the registry holds hashes, not text. The
checklist and refusals are in `docs/pm-runbook.md` section 2. To reject a proposal: `$LINKS veto <id> --by
<handle> --source manual --reason "..."` (or `revoke`). An LLM routine may veto with `--source llm`; it
cannot approve, and `approve` refuses handles that look like automation, the proposer, a non-interactive
terminal and a stale digest.

Then export: `$LINKS export --write-shipped --include-candidates` rewrites `pm/links/data/links.bundle.json`,
`links.bundle.pin` and `pm/links/shipped-data.ts` together (candidates included so the tools and the
explorer can show them as proposed); without `--include-candidates` only the human-approved set ships.
Review the `git diff` of those files as a person before committing: that review is the control.

## 6. Quotient

Off by default. The linker never fetches or pays for Quotient. When the operator sets `PM_QUOTIENT=1` and
passes `--quotient-body <file>` (a body the agent already paid for, `--quotient-kind mispriced|signals`), the
body is parsed in memory by `pm/signals/parse.ts` and, per candidate, the report prints whether the Quotient
probabilities of two legs agree within 0.05 (exact decimals), or that only one leg has a row, or none. These
lines go to stdout and nowhere else: not the bundle, not the state file, not the registry
(`pm/test/linker/cli.test.ts` plants a sentinel in the body and scans every file). When the flag is off the
report says `quotient: off` and prints the terms clause (`pm/signals/flag.ts`).

## 7. Schedule it every two hours

Two ways; use one, not both (two registries would diverge).

**A. A Claude Code scheduled routine (recommended: one registry, in git, reviewed as a pull request).**
Every two hours the routine, in a checkout of this repository on a branch:

```sh
source .tools/env.sh
node_modules/.bin/tsx pm/linker/main.ts once --registry pm/links/data/registry.json --out pm/linker/out
node_modules/.bin/tsx pm/links/cli.ts export --write-shipped --include-candidates
node_modules/.bin/tsx pm/linker/main.ts export-app --out pm/linker/out --app-out app/src/features/signals/data/links.json
node_modules/.bin/tsc --noEmit -p pm/tsconfig.json && node_modules/.bin/tsx --test "pm/test/**/*.test.ts"
```

then commits `pm/links/data/registry.json`, `pm/links/data/links.bundle.json`, `pm/links/data/links.bundle.pin`,
`pm/links/shipped-data.ts` and `app/src/features/signals/data/links.json` (ids, hashes, categories, bands)
and opens a pull request; merging it redeploys the Vercel explorer with the candidates as "proposed, not
approved". `pm/linker/out` is not committed. The routine may add vetoes (`cli.ts veto --source llm`) with a
reason; it never runs `approve`, and the CLI would refuse it if it tried. Do not set `PM_QUOTIENT` in the
routine: it has no paid body and the stdout report is not a place Quotient data should be redistributed from.
Keep the routine's prompt free of names, emails and home paths (the privacy rule).

**B. The scheduled container on AWS** (`deploy/linker`, `deploy/aws`): a systemd timer runs `once` every two hours against a
registry on its volume; a person copies the registry out to review it. Steps and limits in
`deploy/linker/README.md`. First real run due 2026-10-22 06:00 UTC.

## 8. The dApp

`export-app` writes the explorer's dataset (`app/src/features/signals/links/schema.ts`): every link of the
bundle with `state: proposed` for candidates, a `category` per leg from the state file, a `band` word, and
`rulesRecipe: rules-v2`. The market modal and the inspector show candidates in a "Proposed by the linker
(not approved)" tier below the approved legs, with the venue, the id, the category, the band in words and a
"re-checked now" badge; no spread is ever drawn between candidates, and the "why this is never arbitrage"
line stays. The explorer's own rules fingerprint is a different recipe from rules-v2, so the re-check
compares close time and status exactly and reports the rules comparison as unavailable rather than as a
false change (the words say so).

## 9. Gate

```sh
node_modules/.bin/tsc --noEmit -p pm/tsconfig.json
node_modules/.bin/tsx --test "pm/test/**/*.test.ts"
```

The linker's tests are under `pm/test/linker`: features, scoring (symmetry, monotonicity, threshold edges),
blocking, candidates and vetoes, the restricted-venue writer, bundle determinism, the CLI against a loopback
fake serving the real captured shapes, the Quotient section, the deploy bundle, privacy scans, and a
hash-only gold-set check.
