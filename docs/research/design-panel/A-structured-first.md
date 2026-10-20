# Design A: structured-first market linking and relationship arbitrage

> **Status (2026-10-19): design plus measurements, no production code.** One of three independent designs for the market-linking and relationship-arbitrage subsystem. Philosophy assigned to this design: **deterministic first**. Link markets with venue-native structure, parsed typed slots and explicit rule-text comparison; infer relations with rules; test consistency with an LP; use LLMs only to fill slots under verification, to flag rule mismatch, and to rank the residual ambiguity for a human. This is not legal advice and not a trading recommendation.

Citation style: `[NN §x]` is section x of `docs/research/NN-*.md`; `[NN V...]` is an item in that note's appended Verification section, which overrides the body. `[AD §x]` is `docs/aggregation-design.md`. `[P0 §x]` is `docs/phase0-gate-results.md`. Tags: **H** measured first-hand in this session (script and snapshot named) or read in a primary source; **M** secondary or inferred; **L** weak or stale; **D** a design default chosen here, to be calibrated and not a finding. Machine clock during my measurements: 2026-10-18 about 19:30 to 20:10 UTC (the harness date is 2026-10-19). Snapshots are single-point; sample sizes are stated every time.

---

## 0. Summary

1. **Thesis.** A false link is a fake arbitrage, so the link layer must be a *proof system*, not a scorer. Every link carries a proof object (native-declared id, slot equality over typed fields, or a human-approved rule template) and a typed rule-difference record; no link is stored with a "confidence". Similarity scores, embeddings and LLM opinions can only *propose*; they can never promote a link on their own. Both the deterministic code and the LLM may **veto**; only deterministic proof plus a human (once per rule template, not once per market) may **promote**.
2. **Evidence forces the shape.** Within-venue structure is almost never violated net of fees (0 of 706 sell-side exclusive sets; 3 net-positive ladder rows worth $13.4 in total; 0 crossed books in 6,937) [17 §0]. Cross-venue apparent edge is dominated by false links (485 of 868 pairs look net-positive; at sim >= 0.65 only 13 of 30 profitable-looking links are identical contracts) [17 §2.5]. Verified-true cross-venue edges are 5 to 164 bps, long-dated, and none survives tail-leg, persistence, 5% APR and haircut filters [17 §2.6]. After spread, fees and a 5% hurdle about 3% of the apparent same-event gap survives (mean over 13 pairs) [18 §0.8]. The product is therefore a **verified link graph with typed rule differences, consistency checks, and fair-value references**, with near-zero tolerance for false alerts; it is not a P&L engine.
3. **What I measured for this design** (section 3, all H, single snapshot, small n):
   - A deterministic slot gate (numbers, comparator, direction, window end, entity swap, scope groups, qualifiers, outcome universe) run on 101 unique pre-labelled candidate pairs from docs 16/17 (semi-held-out): **0 false links among 41 LINK verdicts** (frozen v4, same-question precision 41/41, Wilson 95% lower bound 0.914; recall 41/56 = 73%), versus 52/67 = 78% precision for the fuzzy linker at sim >= 0.65. After two post-hoc lexicon fixes (v5, now in-sample): 49/49, recall 49/56 = 88%.
   - The gate establishes *the same underlying question*, not rule identity: 10 of the 41 to 49 LINK verdicts are labelled "identical title, different resolution rule" (24% to 20%). Strict rule-level precision of the gate alone is 0.76 to 0.80. The rule-difference stage (section 6.6) is therefore load-bearing, not optional.
   - XO's catalogue is templated at the rule-text level for its liquid part: all **81** ACTIVE football-match markets (27 `rootEventSlug` groups, each exactly three siblings) collapse to **4** masked rule templates (57/18/3/3); **6 of 81 (7.4%)** carry a different postponement clause ("remains open until completed" instead of "void after 14 days"), which a masked-hash pin catches with no LLM.
   - XO type-2 titles: 84 distinct title skeletons over 242 rows, 71% of rows in skeletons with at least 3 members. XO type-4 (user-created) titles: 150 skeletons over 165 rows, 8% templated. Deterministic templates cover the liquid core and little of the long tail.
4. **Cost.** Deterministic stages cost nothing per market. LLM spend only fires on the residual: $0.11 to $9.70 per 1,000 markets depending on judge model and residual rate (section 12), versus $0.85 to $17 for the LLM-first, all-pairs pipeline in [16 §10.3] (both lower bounds because thinking tokens bill as output). The real cost is reviewer time, which is NOT MEASURED; template-class approval is the lever that makes it tractable (81 XO football markets need 4 template reviews instead of 81 link reviews).
5. **Plugin vs offline.** Inside the stateless 10-second, 10-MiB PayBox Open Plugin: the deterministic parser, rule-difference regex extractors, hash-pin verifier, closed-form set/ladder checks, an exact LP of at most 30 contracts, fee-adjusted depth walk, and tier assignment. Offline: crawling, alias curation, embeddings for recall, LLM slot-fill and mismatch flagging, the review queue, gold-set tooling, shadow-settlement checks, price-history snapshots, correlation features, and dataset signing (section 11).
6. **MVP cut** (section 15): ship the XO-centred core only. XO football triples against Kalshi and Polymarket fixtures, central-bank decision sets, asset-touch ladders, within-XO partition/ladder checks, Polymarket negRisk sets, Limitless mirror hooks, hash-pinned links, closed-form checks and a small LP. Cut: embeddings, in-plugin LLM, cross-venue implication/exclusive/joint, correlation and lead-lag features, cross-asset links, Trueo and other P2 venues, any hosted API.

---

## 1. What already exists (the user's "aggregate the platforms themselves" question)

Short answer from [14 §0, 14 V]: **nothing aggregates the platforms themselves in a way that carries rule-level payoff semantics, and nothing links XO or Trueo markets except one unproven vendor claim.**

| Layer | What exists (2026-10) | Carries market links? | XO / Trueo | Use in this design |
|---|---|---|---|---|
| Platform registries | DefiLlama (133 "Prediction Market" rows plus at least 63 prediction "Interface" rows), Prediction Index (314 projects), PM Wisdom (606), Prediction Almanac (21 platforms, CC0, best schema) [14 §2, 14 V-A2] | No | DefiLlama and Prediction Index list both; Almanac neither | Join key and liveness only; thin hand-verified registry per [AD §2.5] |
| Library layer | ccxt (9 prediction exchanges), pmxt (15 venues), Synpath, AGG (11 venues, cross-venue matching, arbitrage websocket, per-venue geo/fee/void tables) [14 §4, 14 V-A4] | pmxt Router, AGG, Synpath: yes (hosted or keyed) | None lists XO or Trueo | Do not depend (licences: pmxt personal use on all plans; Predictefy commercial use Enterprise-only [16 V-K5, K6]) |
| Hosted matchers | Kairos (13k pairs, 99.5% aligned, 99.88% settle the same, sports-heavy, `similarity` constant 1.0), Oddpool, Prediction Hunt, Predictefy, Adjacent, PredictMarketCap, PreDex [16 §5, 16 V-K10, K11] | Yes | Only Predictefy claims XO (never exercised) | Benchmarks and cross-checks only |
| Cross-venue identifiers | River Markets `generic_asset_id` (platform-curated groups), CoinRithm Event ID v1, Limitless `externalSlug`/`rulesHash`, Predict.fun `polymarketConditionIds` [14 V-A1, V-A4, 16 §3] | Partly | none for XO/Trueo | Layer-0 native hooks only where the venue itself declares them |
| Metaforecast | discontinued 2026-07-09 [14] | n/a | n/a | avoid |

Implication: the unclaimed ground is the *intersection* of (a) rule-level typed differences, (b) XO/Trueo coverage, (c) a gold set with precision bounds. This design builds that thinly and keeps every vendor behind an optional adapter.

---

## 2. Evidence used, and evidence I refuse to design against

### 2.1 Hard numbers the design is built on

| Quantity | Value | Source | Design consequence |
|---|---|---|---|
| Plain-similarity link precision, strict / lenient, population-weighted | 18% / 34% at sim >= 0.45; 36 / 57% at >= 0.55; 72 / 90% at >= 0.65; 78 / 92% at >= 0.85; 90 / 100% at >= 0.95 (n 10 to 12 per stratum, one rater) | [17 §2.5] | Similarity never gates; candidate generator only |
| Linker recall against Limitless-declared mirrors | 56 / 47 / 41 / 22 / 13% at sim >= 0.45 / 0.55 / 0.65 / 0.75 / 0.85 (this tf-idf linker only; misses are structurally easy) | [17 §2.5, 17 V2.5] | Parse-to-(event, outcome) keys instead of title similarity |
| Share of profitable-looking links that are real | 13 identical + 4 minor-diff + 13 different of 30 net-positive links at sim >= 0.65; in the random positive-edge stratum 1 of 12 identical | [17 §2.5] | "Edge too good" is evidence *against* the link (circuit breaker, section 8) |
| Verified-true cross-venue edge | 17 links, median 46 bps, p90 164 bps, capital median $991, lock 10 to 751 days; 0 of 13 identical survive tail-leg + persistence + $10 + 5% APR | [17 §2.6] | Expect almost no `executable` labels; design for correctness over volume |
| True links with a documented rule difference | 14 of 43 true links (33%); roughly 9 to 10 (not 13) of the 17 true links strictly identical after re-labelling | [17 §2.5, 17 V2.6] | Rule-diff extraction is mandatory; reserve is per link |
| Gated-token precision | 23/23 in-sample, but 5/8 strict (7/8 lenient) out-of-sample with one clear entity-swap false link ("The Odyssey" vs "Digger", Best Picture) | [16 §7.9, 16 V-K2] | Do not run gated links unattended; entity resolution must be real, not token overlap |
| Within-venue consistency | ME sell sets 706 / 50 gross-positive / 0 net-positive; Kalshi fees 4.9x gross; ladders 1,849 / 10 / 3 net-positive worth $13.4; complement 0 crossed in 6,937 books; Polymarket negRisk long-set 8 of 492 gross, 4 net (Gamma top of book) | [17 §0, 15 §6.3] | Structure checks are cheap monitors, rare alerts |
| Resolution divergence | Khamenei: Polymarket $1.00 vs Kalshi $0.02; shutdown "Feb 14": state vs new-event semantics; NYC temperature station mismatch; UMA dispute 7.6% of top-1,000 closed 2026 markets (16.2% of volume; about 1.0% of proposals population-wide); median close +3.6 h undisputed vs +100 h disputed; void 0.41% (410 of 99,283) | [15 §8, 15 §7, 15 V1.13] | Rule-diff axes with priors; lock cost includes dispute tail |
| Apparent edge surviving frictions | 50.6% after spread, 9.3% after fees, 3.0% after a 5% annualised hurdle (mean, 13 same-event pairs; Polymarket half-spread fixed at T0) | [18 §2.6] | Always compute net APR on locked capital |
| Lead-lag | no taker-side edge in 273 rule variants; Polymarket leads Kalshi on BTC basis by up to 1 h; Fed pair simultaneous within about 15 to 30 s | [18 §0, 18 V] | Correlation is a signal/risk feature only |
| Edges persist | a majority (366 of 624) of observed negRisk CLOB episodes outlasted the observation window; short episodes last seconds | [15 V1.1] | Do not assume every gap closes in seconds; persistence also does not prove validity |

### 2.2 Numbers I do not design against (refuted or corrected by verifiers)

- "Gated deterministic matching gives 23/23 precision" as a transferable estimate [16 V-K2]. I report it as in-sample and re-test (section 3.3).
- "XO has 257 ACTIVE rows, 95% one creator" and "XO has about 9 active markets" [16 V-K1, 10 V1]. Measured now: 420 ACTIVE across types 0 to 4 (type 2: 242 from one creator, type 4: 165 from 63 creators, type 0: 9, type 3: 4) (section 3.1).
- "0 stale-flagged books, so staleness explains nothing" [17 V2.1]. The flag could never fire; only "0 crossed" is measured.
- "485 net-positive cross-venue opportunities" [17 V2.3]. It is a count of link pairs (476 pairs in the fresh run involve only 293 distinct markets).
- "Fuzzy title linking is not a detector" as a general statement [17 V2.5]. It is true of that tf-idf linker only.
- "Edges last seconds" [15 V1.1]; "Gamma `bestAsk` equals CLOB" (Resident Evil 0.993 Gamma vs 1.007 CLOB) [15 V1.2].
- "Limitless sports markets have no subject field" [17 V2.2]: `metadata.homeTeam/awayTeam/outcomeLabels` exist and are used here for orientation.
- "River Markets does not link equivalent markets" [14 V-A1] and "no hosted aggregator beyond Predictefy, Synpath, River" (AGG, Predikt and CoinRithm were missed) [14 V-A4].

---

## 3. Measurements made for this design (H unless stated)

All scripts are my own stdlib Python 3, run with `python3 -I`, in `<scratch>/A-structured-first/` (not in the repo; the gate's rules are reproduced in Appendix A so the repo carries the method). Requests: `api-mainnet.xo.market` 120, `gamma-api.polymarket.com` 3, `external-api.kalshi.com` 2 (cap 600 per host), public GET only, 300 ms spacing, User-Agent `research-readonly/1.0`, no 429/5xx seen. Raw pulls sit in `raw/` (about 63 MB, not committed).

### 3.1 Title-skeleton concentration (how templated is each venue's catalogue?)

Method: replace dates, numbers and capitalised spans in each title with slots (`<D> <N> <E>`) and count distinct skeletons (`skel.py`). Snapshot 2026-10-18 about 19:33 UTC.

| Population | n | Distinct skeletons | Top-10 coverage | Rows in skeletons with >= 3 members |
|---|---|---|---|---|
| XO type 2 (CLOB, one creator account 47724) | 242 | 84 | 59.9% | 71.1% |
| XO type 4 (user-created "Conviction", 63 creators) | 165 | 150 | 15.2% | 7.9% |
| XO types 2+4 | 407 | 232 | 36.4% | 46.4% (60.3% of lifetime USD volume; type 2 holds $79.66M of $79.72M) |
| Polymarket active questions in 300 top-24h-volume events | 7,445 | 386 | 48.0% | 96.7% |
| Kalshi market titles in first 200 open events | 1,825 | 161 | 54.8% | 95.5% |

Limits: skeleton equality is lexical, not semantic; the Polymarket and Kalshi samples are volume- or order-biased (sports props, economic-data series), so their concentration is an upper bound; XO row counts are a single snapshot (420 ACTIVE rows: 242 + 165 + 9 + 4). Reading: **template parsing covers XO's liquid, creator-templated core (about 60% of lifetime volume) and a small share of the long tail**; the long tail goes through the generic parser, slot-fill and human review.

### 3.2 XO rule-text templates (masked-hash viability) and native grouping

Method (`xo_fb.py`, `xo_fb_mask.py`): fetch `GET /api/markets/slug/{slug}` for all 81 ACTIVE type-2 football rows (`Draw: X vs Y` and `X to win vs Y`), parse the first rules sentence with one regex, replace home, away, competition, date, time and venue with slot markers, hash the rest.

| Finding | Value |
|---|---|
| Rows parsed by one first-sentence regex | 81 of 81 |
| `rootEventSlug` groups | 27, each of size exactly 3 (home / away / draw siblings) |
| Distinct masked rule hashes | **4** (57, 18, 3, 3 rows); the two big ones differ only in an optional "at <stadium>" clause |
| Rows whose postponement clause differs from the dominant template | **6 of 81 (7.4%)**: dominant "abandoned, cancelled, or postponed and is not completed within 14 days ... voided and all outcomes settle at equal probability"; minority "If the game is postponed, this market will remain open until the game has been completed" |
| Creators / resolvers / `resolutionType` | 1 / 1 / MANUAL on 81 of 81 |
| `effectiveFeeConfig` | `curveModel: FLAT_BPS`, `takerFeeBps: 400` on 81 of 81 (30 random type-2 rows: 21 at 400, 8 at 0, 1 at 800) |
| Competitions | Champions League 54, La Liga 12, Serie A 9, Ligue 1 3, Premier League 3 |

Reading: (a) masked-template hashing collapses review work by about 20x on this family; (b) it surfaces a rule variant that matters (void vs remain-open on postponement) deterministically; (c) `rootEventSlug` gives complete sibling triples where it is available (detail route only); (d) **open item**: docs give the XO fee as `C x bps/10000 x p x (1-p)` [AD §3.3] but the field is named `FLAT_BPS`; the adapter must branch on `curveModel`, take the maximum of plausible models until one real fill reconciles it, and fail closed on an unknown model. Limits: one creator, one resolver, one snapshot; the Kalshi side of the template pair was not hashed here.

### 3.3 Deterministic slot gate versus the fuzzy linker (precision, recall, and honesty about leakage)

Gate rules are in Appendix A. Development set: the 108 labelled XO-vs-Polymarket candidate pairs from [16 §7.9b] (`xo_vs_polymarket_labelled_pairs_2026-10-18.json`, labels ID 32, NEAR 22, NO 54). Evaluation set ("semi-held-out"): the 78 audited pairs plus the 30-pair positive-edge census from [17 §2.5] (`audit_sample_labeled.json`, `link_labels_keyed.json`), deduplicated by title pair to **101 unique pairs** (I 39, Dm 17, X 45), mostly Kalshi / Limitless / Polymarket rather than XO. Labels are the original researcher's (one rater). "Same-question" true = I or Dm; "strict" true = I only.

Process: gate v1 to v4 were developed on the dev set only (v1 25 LINKs, 23 correct, 2 false; v4 30 LINKs, 29 correct). v4 was checksummed (`3dce0c5c...`) and then run on the evaluation set before any change (first on the 108 raw pairs, then re-run unchanged on the 101 deduplicated pairs reported below). v5 adds two post-hoc lexicon fixes made after reading the evaluation failures (nominee/nomination synonym; weak shared tokens), so v5 numbers on the evaluation set are in-sample. Leakage warning: the scope lexicon (competition and office groups) was written from the failure patterns described in [16]/[17], which came from the same underlying data, so the evaluation is semi-held-out, not clean.

| Method on the 101 evaluation pairs | Selected | Same-question correct | Same-question precision (Wilson 95%) | Recall of 56 same-question true | Strict-identical correct | Strict precision |
|---|---|---|---|---|---|---|
| Linker sim >= 0.45 (all candidates) | 101 | 56 | 0.554 | 56/56 | 39 | 0.386 |
| Linker sim >= 0.65 | 67 | 52 | 0.776 | 52/56 | 39 | 0.582 |
| Linker sim >= 0.85 | 25 | 23 | 0.920 | 23/56 | 19 | 0.760 |
| **Slot gate v4 (frozen)** LINK | **41** | **41** | **1.000 (0.914 to 1.000)** | **41/56 = 73%** | 31 | 0.756 |
| Slot gate v5 (post-hoc) LINK | 49 | 49 | 1.000 (0.927 to 1.000) | 49/56 = 88% | 39 | 0.796 |

Verdict split for v5 on the 101: LINK 49, ABSTAIN 22 (5 Dm true, 17 X), REJECT 30 (2 Dm true, 28 X). **No X-labelled pair passed.** The 22 ABSTAIN pairs (22%) are what an LLM adjudicator or reviewer would see; the 30 REJECTs never reach an LLM. On the dev set (in-sample): v5 29/30 LINK correct (Wilson 0.83 to 0.99), recall 29/32; the remaining false LINK is a Polymarket placeholder ("Party A").

What this does and does not show: (1) a typed-slot gate beats plain similarity at the same candidate pool, with the false-link class "same template, different entity" (26 of 35 X in [17]) handled by entity-set difference; (2) it measures same-question identity only: 10 of 49 LINKs are "Dm" (identical title, different void/tie-break/cutoff rule), which the gate cannot see from titles and 160-character rule heads, so rule-level strict precision is 0.80 until the rule-diff stage reclassifies them; (3) **recall is measured only against candidates the old linker surfaced**, not against all true links; (4) n is small (101) and the lower bound 0.91 to 0.93 does not meet the 0.97 target for enabling executable labels (section 14). Speed: 0.04 ms per pair in CPython.

### 3.4 LP reproductions (solver from [15 App. A], my driver)

- **Kalshi AGI date ladder** (hard "before 2030" bid 0.81 x 1,950 vs easy "before 2031" ask 0.78 x 4,939, Kalshi fee 0.07 p(1-p)): LP gross $58.50, net of fees **$14.07** on 1,950 shares, capital $1,892, **74.4 bps**; a 5% APR hurdle over 4.2 years is 21.0% of capital. This reproduces the verifier's fresh-run numbers in [17 V1] to the cent. The LP is the same object for any cluster, so ladders, buckets and cross-venue covers need no special code.
- **Fed Oct +25 bps, XO 0.125/0.145, Polymarket 0.13/0.14, Kalshi 0.12/0.13** (same-instant snapshot, [18 §2.10], XO size a placeholder): gross LP value **0.0000** and the dual returns state price **pi(YES) = 0.1300**, i.e. the cross-venue quote set is coherent and the certificate pins the coherent price at the Polymarket bid / Kalshi ask. The dual is logged as the no-arbitrage certificate [15 §4.2].

---

## 4. Design principles

1. **Proof levels, not scores.** P0 native-declared (the venue itself names the counterpart or group). P1 slot-equal (typed slots equal on a deterministic parse, orientation proven). P2 template-approved (instance matches a human-approved masked rule template pair). P3 LLM-assisted (slots or flags came from a verified LLM extraction; never sufficient alone). P4 human-approved instance. Tier caps follow the proof level (section 10.6).
2. **Asymmetric authority.** Deterministic code and the LLM may each demote or veto; only deterministic proof (P0 to P2) or a human may promote. LLM output is accepted only if each quoted fragment is a substring of the source text and re-derives the claimed value through a deterministic normaliser.
3. **Closed world.** Unknown is a value. An unresolved entity, an unparsed date, an unknown orientation, or an unknown fee model yields `ABSTAIN` or `unknown`, never a default. Missing never means 0.5 or 0 [AD §1.2].
4. **Determinism contract.** Same inputs plus `parser_version`, `lexicon_version`, `template_set_version` produce byte-identical signatures, verdicts and hashes. Outputs are content-addressed. This is what makes plugin-side re-verification possible.
5. **Fail closed at runtime.** Every plugin call re-reads both legs and re-derives hashes; any mismatch suspends the link with a machine-readable reason, no LLM involved [16 §7.8].
6. **Precision first, then recall by cheap structure.** Recall comes from structured keys (native ids, entity registry, templates), not from lowering a similarity threshold.
7. **Market text is attacker-controlled.** Titles and rules are wrapped as `Untrusted<string>`; creators can copy another venue's text while keeping a different resolver (section 8, G7).

---

## 5. Data model

Offline store: SQLite or Postgres for the indexer; the plugin gets compiled JSON artifacts (`links.json`, `templates.json`, `lexicon.json`, `entities.json`). IDs are content-addressed where possible. Prices and sizes are decimal strings; arithmetic is `bigint` fixed point or exact rationals [AD §1.2].

### 5.1 Entities

```ts
type Proof = "P0_native" | "P1_slot_equal" | "P2_template" | "P3_llm_assisted" | "P4_human";
type Verdict = "LINK" | "ABSTAIN" | "REJECT";

interface Market {                       // normalised snapshot, one per (venue, native id, fetch)
  mid: string;                           // `${venue}:${nativeId}`  (XO/Poly: conditionId; Kalshi: ticker; Limitless: slug)
  venue: VenueId; title: Untrusted<string>;
  rules: { text: Untrusted<string>; sha256: string; maskedSha256?: string };   // sha256 over NFKC, whitespace-collapsed text
  outcomes: { index: number; role: "yes"|"no"|"label"; label: Untrusted<string>; tokenId: string }[];
  status: Status; times: { openUtc?: string; closeUtc: string; expectedResolutionUtc?: string; latestUtc?: string };
  native: NativeStructure;               // venue fields that encode grouping/resolution (5.2)
  feeRef: FeeSpecRef; creator?: { id: string; allowlisted: boolean };
  prov: { fetchedAtMs: number; source: string; adapterVersion: string };
}

interface NativeStructure {              // the facts a venue states about itself; never parsed from prose
  groupKind?: "neg_risk"|"mutually_exclusive"|"root_event"|"series"|"milestone"|"ladder_type"|"group_market";
  groupKey?: string;                     // negRiskMarketID / event_ticker / rootEventSlug / eventId / group slug
  flags: { negRiskAugmented?: boolean; negRiskOther?: boolean; canCloseEarly?: boolean; collateralReturn?: "MECNET"|"DIRECNET"|"" };
  strike?: { type: string; floor?: string; cap?: string; custom?: Record<string,string> };   // Kalshi
  externalRef?: { provider: string; slug?: string; rulesHash?: string };                      // Limitless / Predict.fun
  fixture?: { provider: string; id: string };                                                // Sportradar / OpticOdds
  resolver: { mechanism: "uma"|"chainlink"|"exchange"|"xo_manual"|"pyth"|"parity"|"unknown"; address?: string };
  voidPolicy: VoidPolicy;                // from native states where possible (e.g. XO VOIDED, PM 50-50)
}

interface Signature {                    // deterministic parse; every slot has provenance
  sigId: string; mid: string; parserVersion: string; lexiconVersion: string;
  family: "winner"|"h2h_triple"|"threshold_touch"|"threshold_close"|"date_by"|"decision_bucket"|"range_bucket"|"count"|"binary_event"|"other";
  subject: Slot<EntityId[]>;             // canonical entity ids from the alias registry
  predicate: Slot<string>;               // controlled vocabulary: TOUCH, CLOSE_ABOVE, WIN, OUT, LAUNCH, RATE_CHANGE...
  comparator: Slot<"gt"|"ge"|"lt"|"le"|"eq"|"between"|"none">;
  threshold: Slot<{ value: string; unit: string }|null>;
  window: Slot<{ startUtc?: string; endUtc: string; endInclusive: boolean; tzDeclared?: string; semantics: "by"|"on"|"during"|"through" }>;
  measure: Slot<{ sourceClass: string; touchVsClose: "touch"|"close"|"unknown" }>;
  universe: { n: number; labelsCanonical: EntityId[]; yesMap: number };      // outcome universe and YES orientation
  keys: { k0: string; k1: string; k2: string };   // topic-family / event / contract hashes (section 6.4)
  unknownSlots: string[];
}
type Slot<T> = { value: T|null; source: "native"|"regex"|"template"|"llm_quoted"; span?: [number, number]; quote?: string; validated: boolean };

interface Group {                        // intra-venue (or cross-venue set) structure
  gid: string; kind: "partition"|"exclusive"|"ladder_threshold"|"ladder_date"|"bucket_set"|"touch_lattice";
  members: string[];                     // mids
  exhaustive: "E0_unknown"|"E1_exclusive_only"|"E2_by_rule_clause"|"E3_support_cover"|"E4_template";
  proof: { method: string; evidence: string[] }; order?: { axis: "strike"|"date"; direction: "asc"|"desc"; ties: "strict"|"inclusive"|"unknown" };
}

interface Link {                         // superset of AD §2.5 Link
  linkId: string; relation: RelationType; members: { mid: string; role: string; rulesSha256: string; closeUtc: string; outcomeMap: number[] }[];
  proof: Proof; proofEvidence: string[];             // e.g. ["native:limitless.externalSlug", "slotEqual:k2", "template:T-FB3"]
  basis: { class: "identical"|"settlement_window"|"settlement_source"|"subset"|"none"; axes: Axis[]; cutoffDeltaH: number };
  ruleDiff: { items: RuleDiffItem[]; extractorVersion: string };    // typed, with quoted spans from both sides
  templateId?: string; instancePins: { slotsHash: string; maskedHashA?: string; maskedHashB?: string };
  state: "proposed"|"template_approved"|"human_approved"|"quarantined"|"suspended"|"rejected";
  reviewer?: string; reviewedAt?: string; validUntil: string; schemaVersion: number;
}

interface Template {                     // human-approved rule-template pair (the unit of review)
  templateId: string; family: string; a: { venue: VenueId; matcher: string; maskedSha256: string[] }; b: { venue: VenueId; matcher: string; maskedSha256: string[] };
  slotMap: Record<string,string>; knownAxes: Axis[]; approvedBy: string; approvedAt: string;
  instancesSeen: number; instancesSampled: number; shadow: { settled: number; diverged: number }; enabledTiers: Tier[];
}

interface Cluster { cid: string; kind: "constraint"|"factor"; members: string[]; relations: string[]; atomsSpec: AtomSpec; lpHash: string; maxContracts: number }
interface EdgeObservation { ts: number; cid: string; legs: LegFill[]; gross: string; fees: string; lock: string; reserve: string; net: string; capital: string; apr: string; tier: Tier; reasons: string[]; booksHash: string; skewMs: number }
interface GoldLabel { pairId: string; labeler: string; qLevel: boolean; rLevel: boolean; axes: Axis[]; relation: RelationType; outcomeMap: number[]; rulesSha: [string,string]; split: "dev"|"test"; ts: string }
interface SettlementObs { linkId: string; payoffs: [string[], string[]]; agree: boolean; voidSides: string[]; settleDeltaH: number }
```

### 5.2 Native structure extracted per venue (never parsed from prose)

| Venue | Fields consumed | What they prove | What they do not prove |
|---|---|---|---|
| Polymarket (Gamma) | event `negRisk`, `negRiskAugmented`, `negRiskOther`, `negRiskMarketID`; market `groupItemTitle` (label only), `sportsMarketType`+`line`, `series`, `eventMetadata.opticOddsFixtureId`, `gameId`, `feeSchedule`, `umaResolutionStatus`, `description` [16 §3.1] | Exclusivity of the set; fixture identity; fee parameters; oracle state | Exhaustiveness (augmented sets have unnamed outcomes); `groupItemThreshold` is an ordinal display index, never a strike |
| Kalshi | `mutually_exclusive`/`collateral_return_type`, `strike_type`, `floor_strike`, `cap_strike`, `custom_strike`, `early_close_condition`, `settlement_sources`, `rules_primary/secondary`, milestones, series `fee_type`/multiplier [16 §3.2] | Numeric strikes and operators; ladders; named sources; fixture ids | Exhaustiveness (`mutually_exclusive: false` also does not mean non-exclusive [16 V]) |
| XO | list rows: `type`, `categoryPath`, `expiresAt`, `creatorId`, `outcomes`; detail: `rules`, `resolutionSources`, `resolverAddress`, `resolutionType`, `effectiveFeeConfig`, `rootEventSlug`; public earning-pools: `eventId/eventSlug` (14 of 15 rows) [16 §3.3, 16 V-K4] | Sibling groups (when fetched); resolver identity; creator | Exclusivity or exhaustiveness (`neg_risk` always false; only rules prose says "mutually exclusive") |
| Limitless | `metadata.externalSlug/externalProvider/isPolyArbitrage/externalRulesWatch.rulesHash`, `homeTeam/awayTeam/player1Name/outcomeLabels`, `type: ladder`, group nesting [16 §3.4, 17 V2.2] | Declared mirror of a Polymarket market; YES orientation for moneylines; drift hook | Rule identity (mirrors can differ in structure: 20 vs 14 markets) |
| Trueo | three immutable strings plus `endOfTrading` [16 §3.5] | nothing structural | everything: parse-only, P2 venue |

---

## 6. Pipeline

### 6.0 Stage table

| # | Stage | Input | Output | Deterministic? | Runs |
|---|---|---|---|---|---|
| S0 | Ingest and normalise | venue listings, details, books | `Market` rows with `native`, rule hashes | yes | indexer; plugin for the markets in a call |
| S1 | Native structure and group building | `Market.native` | `Group` with exhaustiveness proof level | yes | both |
| S2 | Signature parse | title, rules, native fields, entity registry, lexicon | `Signature` with provenance and `unknownSlots` | yes | both |
| S3 | Candidate generation | signatures, native refs | candidate pairs/sets tagged with the key that matched | yes (+ optional retrieval for the residual) | indexer |
| S4 | Slot gate | two signatures | `LINK` / `ABSTAIN` / `REJECT` with reasons | yes | both |
| S5 | Relation inference | slot differences, group orderings | typed relation (identical, ladder, partition, implication...) | yes (rule table) | both |
| S6 | Rule-difference extraction | two rule texts + native flags | `RuleDiffItem[]`, `Axis[]`, `cutoffDeltaH` | yes (regex families) | both |
| S7 | LLM residual | `ABSTAIN` pairs, unknown slots, unparsed clauses | verified slot fills; mismatch flags; review priority | no (verified) | offline |
| S8 | Template approval and pinning | LINK pairs + diff | `Template` (once per family), `Link` instances with pins | human | offline |
| S9 | Clustering | approved links and groups | constraint clusters (LP-able), factor clusters (signals) | yes | both |
| S10 | Consistency LP and edge | cluster + live books + fee specs | tier, net edge, size, certificate | yes | plugin (<= 30 contracts) |
| S11 | Runtime verifier | link + fresh legs | `ok` / `suspended(reason)` | yes | plugin |
| S12 | Monitoring | settlements, hash changes, drift | shadow-settlement stats, alarms, regression fixtures | yes | indexer |

### 6.1 S2: the signature parser and its lexicon

Order of precedence for each slot: native field, then venue template, then generic regex, then (offline only) verified LLM fill, else unknown.

- **Entities.** Alias registry (`entities.json`): canonical id, kind (team, person, asset, central_bank, org, index), aliases, source (Wikidata Q-id where available). Accent folding and possessive stripping happen before lookup. Needed from the evidence: Munich/Munchen, Praha/Prague, PSG/Paris Saint Germain [16 §7.9a]; Chancellor of Germany / German Chancellor; "White House" as one entity (it falsely tripped an "House" office scope token in my first gate run). Unresolved proper noun means `subject.value = null`.
- **Numbers.** Value, unit and comparator: `$92,500`, `5.5%`, `50+ bps`, `50 bps or more`, `k/m/b` suffixes. Years and dates are removed before number extraction (an unguarded `b` unit pattern turned "by" into billions in my first run: `$104 by October` became 104e9).
- **Windows.** Explicit month-day-year, "in October", "before 2027" (= Dec 31 2026), "end of 2026", "mid-2027" (= Jun 30 2027), quarters, "Person of the Year 2026" (single-year fallback = Dec 31). Native close times are used only as a fallback or cross-check: XO `expiresAt` is a resolution deadline, not the event window (Time Person of the Year 2026: XO 2027-06-30 vs Polymarket 2026-12-31).
- **Cutoff time and zone.** Extract the stated clock time and zone to a UTC instant; XO cutoffs are "11:59 PM UTC", Polymarket "11:59 PM ET", Kalshi often 10:00 or 11:00 AM ET snapshots [16 §7.9c, 15 R3/R4]. The difference becomes `cutoffDeltaH` (about 5 h for UTC vs ET).
- **Predicate vocabulary.** Controlled synonyms (hit/reach/touch/cross = TOUCH; launch/release = LAUNCH; out/leave/resign = OUT; announce = ANN, which is a weak token whose one-sided presence raises an `announcement_vs_occurrence` axis rather than a rejection). Direction classes UP/DOWN/HOLD from verbs and arrows.
- **Templates.** A template is `{matcher, slot mapping, structure}`: e.g. `T-FB3` (football triples: `X to win vs Y`, `Draw: X vs Y`, rule sentence `This market refers to the professional football (soccer) match between A and B in COMP, scheduled to begin on D at T UTC[ at VENUE]`), `T-CBD` (central-bank decision buckets: "Bank Rate is cut by 25 bps in November 2026", "ECB hikes the deposit rate by 50 bps or more in October 2026", Polymarket "50+ bps decrease"), `T-TOUCH` ("Will Solana Hit $130 by October 31, 2026"), `T-WINNER` (election / award / league lists).

### 6.2 S1: building native groups and proving exhaustiveness

Proof levels for a set to be treated as a partition (needed before any long-all-YES basket):

| Level | Meaning | How established (deterministic) |
|---|---|---|
| E4_template | the rule template states exclusivity and a void-all fallback | `T-FB3`: "These outcomes are mutually exclusive - only one of them can resolve to Yes" plus "all three markets will be voided"; sibling count equals 3 (measured 27 of 27 groups, section 3.2) |
| E3_support_cover | declared outcome intervals cover the declared support lattice | central-bank buckets over a registry entry `support = multiples of 25 bps` (50+ cut, 25 cut, 0, 25 hike, 50+ hike); interval-cover check by arithmetic |
| E2_by_rule_clause | the rules contain a default clause | Polymarket negRisk, `negRiskAugmented = false`, all legs tradable, and the `description` matches a default-rule pattern ("if no ... resolves to 'No'/'Other'", "lowest bracket", alphabetical tie-break) [15 §6.4] |
| E1_exclusive_only | at most one can resolve yes | Kalshi `MECNET`, Polymarket augmented negRisk, XO prose without a template |
| E0_unknown | nothing | default |

Only E2 to E4 may be used for the long basket. E1 sets allow the short basket only (`sum b - 1`). This closes the failure measured in [17 §2.1]: 10 Kalshi "buy every outcome" rows looked net-positive (median 31.6 bps) and every one was a two-leg race with no exhaustiveness proof; on the 8 Polymarket sets verifiable as exhaustive, 0 were net-positive.

### 6.3 S3: candidate generation (hash join first, retrieval last)

Keys, computed from signature slots (not text): `k0 = H(family, predicate_class, subject_ids)` (topic family), `k1 = k0 + window_end_day + measure_class` (event), `k2 = k1 + comparator + threshold` (contract). Because windows differ by timezone, windows are compared with a +/- 36 hour adjacency join rather than exact day buckets (the 1.5-day tolerance used in the gate).

| Layer | Source | Produces |
|---|---|---|
| L0 native | Limitless `externalSlug`/`rulesHash`; Predict.fun ids; Kalshi milestones and Sportradar ids; Polymarket `opticOddsFixtureId`; XO earning-pools `eventId` [16 §3] | P0 candidates with provenance (still gated by S4/S6) |
| L1 key join | equal `k2` (identical), equal `k1` with different `k2` (ladder/bucket/partition siblings), equal `k0` with different windows (date ladders) | candidates for S4/S5 |
| L2 residual retrieval | Polymarket `public-search` as the blocker (0.3 to 0.5 s per query), local index of Kalshi `/events`, optional embeddings top-20 | candidates tagged `retrieval-only`: always routed to S7/human, never auto-LINK |

### 6.4 S4: the slot gate (verdict rules)

Inputs: two signatures. Output: verdict and reasons. The order below is the order implemented and tested in section 3.3 (first match wins; Appendix A has the full rule list):

1. `ABSTAIN` if a placeholder outcome appears (`Party A`, `Candidate S`) or the outcome universes differ in size.
2. `REJECT` if both sides have number sets and they differ; `ABSTAIN` if numbers appear on one side only.
3. `REJECT` if direction classes (UP, DOWN, HOLD) are disjoint or comparators differ; `REJECT` if both window ends are known and differ by more than the tolerance (an unknown window does not reject, it is recorded).
4. `REJECT` if the two sides carry different members of a mutually exclusive scope group (Champions League vs La Liga; Senate vs House vs Governor); `ABSTAIN` if a scope token appears on one side only.
5. `REJECT` for entity or qualifier swap (strong unmatched tokens on both sides with little or no overlap; in production: resolved entity-id sets differ); `ABSTAIN` if a potent qualifier appears on one side only (again, first, only, exactly, another, other, still, fully, officially, any, all...), if strong unmatched tokens remain on both sides ("qualifier mismatch"), if three or more unmatched tokens remain on one side, or if no content is shared.
6. Otherwise `LINK` (proof P1); orientation must be proven separately (S4b, below). An unknown entity or window slot in production means `ABSTAIN`.

**Orientation (S4b).** `yesMap` must be proven from native fields: XO outcome index 0 is the Yes token even for team-named markets; Polymarket `outcomes[0]` is not always "Yes" (48 of 100 sampled); Limitless `homeTeam/outcomeLabels`; Kalshi `yes_sub_title`. `Draw` markets are `different_outcome` unless the other side also has a draw. Unknown orientation yields `ABSTAIN`. This addresses the largest class of fake edges in [17 §5.1] (cross-venue "edges" of 2,000 to 47,000 bps from the YES side of "A vs B - B" differing by venue; a USD 923,876-capital NFL "edge" of 23,642 bps).

### 6.5 S5: relation inference (rule table)

Given two or more signatures with equal `k0`:

| Slot pattern | Inferred relation | Required proof |
|---|---|---|
| equal `k2`, different venues | identical (a) | S4 LINK + S6 axes |
| equal `k1`, comparator `gt/ge` or `lt/le` of the same class, different thresholds | threshold ladder (c) | ordering from numeric thresholds and operator; direction from the comparator |
| equal subject, predicate, threshold; different window ends | date ladder (c): cumulative if `semantics = by` and predicate is TOUCH/LAUNCH/OUT; survival if text says "continues through" or "remains" | direction cue words ("through", "remain", "continues"); unknown direction means no constraint applied |
| equal subject, one threshold axis and one date axis | touch lattice: constraints only between comparable points | product order |
| same event, disjoint intervals covering a declared support | bucket set / partition (b2) | E3 proof |
| equal `k1`, outcome entity differs, template winner | partition or exclusive (b2/b3) | E2/E4 else E1 |
| winner-of-final vs reach-final (registry of implication templates) | implication (d) | template with a proof of text-level necessity |
| `A`, `B`, and a conjunction contract naming both | joint (e) | explicit conjunction legs |
| anything else with shared entities or tags | factor (g) | none; signal only |

Implications are only produced from a small registry of **implication templates** (nested rankings top-2 within top-4; "wins final" within "reaches final"; "by June 30" within "by Dec 31" is a date ladder; BTC "hit $K in October" within "hit $K in 2026") whose necessity was verified by a human against the rule texts; unlisted implications are candidates only [15 §3.4].

### 6.6 S6: rule-difference extraction (the axes)

Pure regex and table logic over both rule texts plus native flags. Output is a list of `{axis, sideA, sideB, quoteA, quoteB, severity}`. Axes and what each does to the tier:

| Axis | Deterministic extractor | Example from the evidence | Effect |
|---|---|---|---|
| `timing_cutoff` | clock time + zone to UTC; compare | XO 23:59 UTC vs Polymarket 23:59 ET (about 5 h) [16 §7.9c] | priced reserve (9.2) |
| `window_start` | "from market creation/launch" vs fixed date | STRC / 10-year yield pairs [16 §7.9c] | priced reserve |
| `measure_source` | named source classes: "price as displayed on Binance", "1 minute candle High", Chainlink, NOAA station | Polymarket BTC uses Binance 1-minute close; Chainlink-based 5-minute contracts agree with Binance about 85% of the time [15 §3.8] | blocks `executable` unless an agreement table exists |
| `void_policy` | "abandoned/cancelled/postponed ... N days ... void / remains open / fair price / Other" | XO 14 days void vs Kalshi fair price after 48 h vs Limitless "postponed after date -> Other"; XO minority variant "remain open" (6 of 81) [section 3.2, 17 §2.5] | explicit void atoms in the LP; tier cap `hedged` |
| `tie_break` | "tied", "alphabetical", "official tie-breaking procedure" | Nigerian Senate: Kalshi government entry vs Limitless alphabetical [17 §2.5] | priced reserve |
| `early_close` | native `can_close_early`, `early_close_condition` | Kalshi by-date markets | timing reserve |
| `exception_clause` | death / incapacity / resign / carve-out keyword families | Kalshi Khamenei: scalar at last traded price on death; Polymarket "removed from power" paid $1.00 [15 R1] | blocks all executable and hedged-without-attestation |
| `other_fallback` | "resolves to Other", "No winner by" | Polymarket Ballon d'Or "no winner by Dec 31 -> Other" [17 V2.6] | LP state |
| `event_vs_state` | cue words: "new", "continuation ... will not qualify", "at <time>", "announce", "officially" | shutdown Feb 14: Kalshi state at 10:00 AM ET paid YES; Polymarket new-shutdown paid NO [15 R2] | blocks executable; may require judge |
| `announcement_vs_occurrence` | OPM / "announced" / "official" cues | shutdown "ends Nov 12" rung [15 R3] | blocks executable |
| `oracle` | native: UMA / exchange / XO MANUAL + creator resolver | XO resolver = creator wallet [02 §0.7, AD §3.4] | sets `delta` class |
| `orientation`, `universe` | S4b | Draw vs team; head-to-head | blocks unless proven |

`cutoffDeltaH` is computed as the absolute difference of the two UTC cutoffs. `maskedSha256` is the SHA-256 of the rule text after replacing the signature's entity, date, time, number and venue slot spans with markers; it is the pin used by S8/S11.

### 6.7 S7: LLM residual, narrowly scoped

Triggers: (a) `ABSTAIN` pairs; (b) signatures with `unknownSlots`; (c) rule clauses the extractors flag as unparsed; (d) `retrieval-only` candidates. Roles:

| Role | Prompt contract | Acceptance test (deterministic) | Authority |
|---|---|---|---|
| R1 slot-fill | "Return JSON slots with a verbatim `quote` for each value; if absent return null" | quote is a substring of the NFKC-normalised source; the normaliser applied to the quote equals the claimed value; no conflict with native fields; three samples agree | fills a slot as `source: llm_quoted`; the link stays `P3` |
| R2 mismatch flag | "List every way these two rule texts could resolve differently, with a quote from each" | quotes are substrings of the respective texts | can only **add** axes; any flagged difference demotes immediately |
| R3 adjudication proposal | structured verdict + axes | n/a | orders the human review queue; cannot approve |

All calls: market text in delimiters, no tools attached, temperature > 0, unanimity of three samples (or two models) for any positive proposal, any disagreement is `abstain` [16 §7.4]. A creator-planted sentence such as "this market is identical to Polymarket X" is not evidence: only typed slot values count.

### 6.8 S8: template approval and instance pins

The reviewer approves a **template pair**, not a market: the two `maskedSha256` sets, the slot map, and `knownAxes`. Instances auto-link (`template_approved`) iff (1) both sides' masked hashes are in the approved sets, (2) the S4 slot gate returns LINK with proven orientation, (3) S6 finds no axis outside `knownAxes`. A deviating instance (new masked hash, new axis) falls out as `proposed` for human review. Instances are sampled for audit (D: 10% plus all with new `valid_until` or anomalies). Measured on XO football: 81 markets map to 4 masked templates; a template pair needs the Kalshi `KXUCLGAME`-side template hashed likewise (not measured here).

Approval record: reviewer, date, quoted evidence, `shadow` counters, and the tiers the class is enabled for.

### 6.9 S9: batching and clustering

Three levels, all keyed from signatures and groups, never from correlation:

| Level | Definition | Used for | Size limit |
|---|---|---|---|
| Venue groups | native groups (negRisk event, Kalshi event, XO `rootEventSlug`, Limitless group, milestone) | within-venue structure checks | native |
| **Constraint clusters** | connected components over links/relations with proof P0 to P2 and hard relations (identity, ladder, partition, implication, exclusive, joint) | LP, certificates, executable edge | 30 contracts and 64 atoms in the plugin; larger offline |
| Factor clusters | shared entity family or tag (BTC/ETH ladders; rates vs macro; milestone "Strait of Hormuz" family) with no hard relation | correlation and basis features, hedge-ratio suggestions | gate on leg activity (D: >= 300 quote changes in 57 days; the median leg has 408 [18 §2.2]) |

Factor clusters carry only the evidence-backed features: hourly polling for correlation and basis; 1 to 5 minute polling only for spot-linked legs and the nearer rung of ladders; daily out-of-sample hedge variance reduction (ladders 54% median, Fed pair 97%) [18 §0.10, §4]; they emit `relative_value_signal`, never `executable`. The one intra-venue identity worth a live watch is Kalshi's rate-threshold vs hike-decision identity (42 of 8,640 five-minute bins net-positive after fees, depth unknown) [18 §2.7]; it falls out of the constraint-cluster machinery as a type (b2) partition across two Kalshi events.

---

## 7. Relationship types: detection and constraints

Notation as in [15 §4]: contract `j` with YES bid `b_j`, ask `a_j`, per-level sizes; `x_jl, y_jl` buys and sells at level `l`; `n_j = sum x - sum y`; fee `phi_v(p)`; lock `lambda`; state set `Omega` (atoms). The LP for any cluster:

```
maximize t
s.t.  for every atom w in Omega:   sum_j A[w][j] * n_j  -  K(x, y)  >=  t
      0 <= x_jl <= qa_jl,  0 <= y_jl <= qb_jl
K(x,y) = sum_jl (a_jl + phi + lambda_buy) x_jl  -  sum_jl (b_jl - phi - lambda_sell) y_jl
```

`t* > 0` iff an arbitrage exists in the modelled state space. The dual is a probability vector over atoms and is stored as the certificate. The nominal LP contains only the atoms the relation allows; the **robust** LP adds divergence and void atoms for each venue and each flagged axis. Never double count a mirrored NO book as liquidity [15 §2].

### 7.1 Master table

| Type [15 §3.0] | Detection (deterministic) | Proof needed | Constraint on YES prices | Executable edge expression | Risk class |
|---|---|---|---|---|---|
| (b1) complement in one market | any binary market | none | `a_yes + a_no >= 1`, `b_yes + b_no <= 1` (mirror: cannot cross) | none (crossed book only; 0 of 6,937) | riskless; monitor only |
| (b2) partition | `Group` with E2 to E4 | exhaustiveness proof | `sum a_i >= 1 >= sum b_i` | long `1 - sum a_i - sum phi(a_i) - lambda`; short `sum b_i - 1 - sum phi(b_i) - lambda` | riskless in payoff space if one resolver and void rows empty |
| (b3) exclusive, not exhaustive | E1 | exclusivity only | `sum b_i <= 1` | short basket only | short riskless; long never |
| (c) threshold ladder | S5 rule: equal `k1`, ordered thresholds, comparator class | same source and clock; tie convention known | `p(G_{k1}) >= p(G_{k2})` for `k1 < k2` | `b(G_{k2}) - a(G_{k1}) - phi_1 - phi_2 - lambda` | riskless inside one source; tie atoms |
| (c) date ladder | equal threshold, ordered windows, direction cue | direction proven (cumulative vs survival) | cumulative: `p(D_{T1}) <= p(D_{T2})`, `T1 < T2`; survival reversed | `b(D_{T1}) - a(D_{T2}) - ...` for cumulative | announcement vs occurrence axis |
| (c) bucket vs cumulative | interval parse + E3 | interval cover, tie rules | `p(B[k1,k2)) = p(G_{k1}) - p(G_{k2})` | LP over interval atoms (23-atom BTC example) | tie atoms |
| (c) touch lattice | threshold axis + date axis | both axes ordered | `p(k1,T1) >= p(k2,T2)` when `k1 <= k2` and `T1 >= T2`; incomparable pairs unconstrained | pairwise on comparable pairs | e.g. "ETH 2,900 by Oct 31" vs "3,000 by Dec 31" is incomparable [16 §2] |
| (c) barrier vs terminal | touch vs close predicates on the same threshold | measure classes | `p(H_k) >= p(G_k)` | `b(G_k) - a(H_k) - ...` | measure axis |
| (a) identical, cross-venue | S4 LINK + proof + S6 | P0 to P2 | `p_X = p_Y` up to frictions | `b_X - a_Y - phi_X - phi_Y - lambda - R`; complement form `1 - a_X - (1 - b_Y) - ...` | **hedge with reserve** unless axes = [] and class enabled |
| (d) implication | implication template | text-level necessity verified | `p_A <= p_B` | `b_A - a_B - phi - phi - lambda` | one-directional; candidates unless template-verified |
| (e) joint | explicit conjunction contract | all legs same facts, same time | `max(0, p_A + p_B - 1) <= p_C <= min(p_A, p_B)` | `p_C <= p_B`: buy `B`, sell `C`; lower bound: sell `A`, sell `B`, buy `C` | RFQ last look, 3 fees; deferred |
| (f) exclusive across events | exclusivity template | text proof of disjointness | `p_A + p_B <= 1` (and `>= 1` if exhaustive) | `b_A + b_B - 1 - fees` | candidates only |
| (g) correlated factor | shared entities/tags only | none | none | none (LP value 0 by construction) | signal |
| (h) cross-asset | reference-series registry (underlying, strike, expiry, index) | none | `p approx -dC/dK` for a present-value digital [15 V1.8] | none (basis) | signal; excluded from MVP |

### 7.2 Atoms and payoff rows

**Partition (b2) with void rows.** `Omega = {w_1..w_n} U {v_V : venue V may void}`. `A[w_i][j] = 1[i = j]` for contracts of the partition; for a contract on venue `V`, `A[v_V][j] = void payoff` (Polymarket Unknown/50-50 pays 0.50 per token; Kalshi scalar or last traded price; XO VOIDED refunds both sides 50% [AD §3.4]). Cross-venue partitions (XO FOMC five outcomes vs Polymarket five-market negRisk event) share the same atoms `w_1..w_5`, with contracts from both venues as columns; the LP then buys the cheapest outcome contract per atom across venues, which a pairwise scanner cannot see [15 §4.7].

**Exclusive, non-exhaustive (b3).** Add atom `w_0` ("none") with all payoffs 0. Rows: `sum_j A[w_i][j] n_j - K >= t` for `i = 0..n`. Long baskets lose in `w_0`; short baskets pay `sum b_i - 1` in every `w_i` and `sum b_i` in `w_0`, so the short edge is unchanged.

**Threshold ladder (c).** Thresholds `k_1 < ... < k_m`; atoms `I_s = (k_s, k_{s+1}]` for `s = 0..m` plus tie atoms `E_i = {X = k_i}` whenever the operator class is mixed (">" vs ">=") or the rule text has no tie convention. Contract `G_i = 1{X > k_i}`: `A[I_s][G_i] = 1[s >= i]`; `A[E_s][G_i] = 1[s > i]` for ">" contracts and `1[s >= i]` for ">=" contracts. Adjacent-pair violation: `b(G_{i+1}) - a(G_i) - fees > 0`. The Kalshi AGI example in section 3.4 is exactly this LP with two date-ordered contracts.

**Date ladder (c).** Atoms `J_s = (T_s, T_{s+1}]`, `s = 0..m`, with `J_m` meaning "after the last date". Cumulative contract `D_i` pays 1 on `J_s` with `s < i`. Survival contracts pay on `s >= i` (monotone the other way). Where the two venues' cutoffs differ by `delta` hours, add atoms for event times falling in `[T_i^A, T_i^B]` with payoffs that differ by venue: this is the `timing_cutoff` axis expressed as LP rows.

**Implication (d).** Atoms `{AB, notA B, notA notB}`; `A = [1,0,0]`, `B = [1,1,0]`; add void atoms when legs sit on different venues.

**Exclusive across events (f).** Atoms `{A notB, notA B, notA notB}`; `A = [1,0,0]`, `B = [0,1,0]`; delete `notA notB` if also exhaustive.

**Joint (e).** Atoms `{AB, A notB, notA B, notA notB}`; `A = [1,1,0,0]`, `B = [1,0,1,0]`, `C = [1,0,0,0]`. Frechet bounds fall out of the rows.

**Identical, cross-venue (a).** Nominal atoms `{Y, N}` with `X = [1,0]` and `Y = [1,0]`. Robust atoms (added per axis): `{X yes, Y no}`, `{X no, Y yes}`, `{void_X}`, `{void_Y}` with the venue's void payoff. The robust value is never positive for an unhedged pair (worst row loses the cost), which is why cross-venue labels use the **priced reserve** of section 9.4 instead of a pure worst-case rule; the robust LP is reported alongside as the stress number [15 §4.7 case D].

**State-space builder.** Start with the atoms of the largest independent family in the cluster (intervals for a ladder, outcomes for a partition), add atoms for each relation by refinement (tie atoms, void atoms, divergence atoms), and delete atoms removed by implication or exclusivity. If atoms exceed 64 or contracts exceed 30, split the cluster by family and solve offline; otherwise constraint generation is unnecessary at these sizes [15 §4.6].

### 7.3 Closed forms first

For partitions, ladders and implications the closed form above is evaluated before the LP (microseconds); the LP is run only to size the trade over depth, to combine families (ladder + bucket + cross-venue cover), and to emit the dual certificate. This ordering keeps the in-plugin cost to a few milliseconds and makes every alert explainable by one inequality.

---

## 8. How false links are prevented

A false link creates a fake edge; the evidence says the fake edges are huge (median 826 bps, up to 158,984 bps for a "Maintain" vs "25 bps cut" pair) while true edges are tiny [17 §2.4]. Defence in depth, each layer deterministic unless stated:

| ID | Guard | Mechanism | Evidence it addresses |
|---|---|---|---|
| G0 | No scores | links store a proof object and reasons; similarity is a retrieval detail | similarity precision 18 to 72% [17] |
| G1 | Hard-veto slots | numbers, comparator, direction, window end, scope-group conflict: both-sided mismatch = REJECT, one-sided = ABSTAIN | numeric/direction/date failures in [16 §7.9b] (ECB hike vs decrease; ETH 2,900 vs 3,000) |
| G2 | Entity registry and swap veto | resolved entity sets must match; unresolved = unknown | 26 of 35 false links are "same template, different entity" [17 §2.5]; "The Odyssey" vs "Digger" [16 V-K2] |
| G3 | Orientation and universe | `yesMap` proven from native fields; Draw is `different_outcome`; `n` outcomes equal; placeholders abstain | 2,000 to 47,000 bps orientation artefacts [17 §5.1] |
| G4 | Augmented negRisk and "Other" | trade named outcomes only; E1 sets short-only | [15 §3.2 b3, 17 §2.1] |
| G5 | Cardinality | at most one `identical` partner per venue per market; ties go to a duplicate set (set-level link) or to review; intra-XO duplicates are linked to each other first | one Limitless market sat in 30 net-positive pairs [17 V2.3]; XO Zcash $2000 exists as type 2 and type 4 [16 V-K3] |
| G6 | Rule-diff gate and masked pins | any new axis or new masked hash drops an instance out of `template_approved` | 33% of true links carry a rule difference [17 §2.5]; 6 of 81 XO rows deviate in the postponement clause (section 3.2) |
| G7 | Adversarial-creator guard | a creator-written XO market (type 4, non-allowlisted creator or resolver) is capped at `indicative`; allowlist = creators/resolvers a human reviewed (the dominant type-2 creator) | XO resolution is MANUAL with a creator-specified resolver (81 of 81 sampled); anyone can copy another venue's rules text while controlling the resolution |
| G8 | Edge-size circuit breaker | a link not yet in an `executable`-eligible class whose net edge exceeds `max(5 x (fees + spread), 300 bps)` (D) goes to `quarantined` and the review queue; it is never shown as an opportunity | all 72 pairs above 5,000 bps were false; positive-edge stratum precision 1 of 12 identical [17 §2.4, §2.5] |
| G9 | Lifecycle | `validUntil` = earlier of the two closes; pins re-derived every call; state machine below | Polymarket clarifications, Kalshi `rules_secondary` edits and `can_close_early` [15 §10.8] |
| G10 | Market-state filters | exclude tail legs (<= 2c or >= 98c), proposed/disputed/ended-but-open markets, empty-side encodings (`0.0000`), books older than the skew limit | funnel in [17 §2.6]; Polymarket `closed:false` but resolved markets |
| G11 | Shadow settlement | after both legs settle, compare payoff vectors; any divergence suspends the template and files a regression case; counters update the reserve posterior (section 9.3) | Kairos-style monitor: 14,480 of 14,498 sports pairs settled the same [16 §5.2] |
| G12 | Class gating | a template class may print `hedged` or `executable` only after its gold-set bound is met (section 14) | 5/8 out-of-sample for gated tokens [16 V-K2] |
| G13 | LLM asymmetry | LLM can demote and flag, never promote; quotes must verify | prompt injection through creator text [16 §13] |

**State machine.** `proposed -> template_approved | human_approved -> suspended -> (re-verified) -> template_approved/human_approved`; any state `-> rejected`; edge-anomaly `-> quarantined`. Transitions out of `suspended` require either an automatic hash match to the *pinned* values or a human decision.

---

## 9. Resolution risk, quantified

### 9.1 Where the risk enters

1. **Priced reserve** per axis (this section).
2. **Explicit atoms** in the robust LP (void and divergence rows, section 7.2).
3. **Lock cost** with the dispute tail (section 10.4).
4. **Class gating** that refuses to print an executable label for axes with no measured agreement rate.

### 9.2 Axis priors (D, with the evidence that anchors each)

`delta` is the probability of an *adverse* divergence (the direction in which the hedge pays nothing). For a complement cover `YES_A + NO_B` costing `C`, expected profit is `1 - C - delta` [AD §5.6]; the windfall direction is ignored (conservative).

| Axis class | Trigger | Evidence anchor | Prior `delta` (D) | Ceiling |
|---|---|---|---|---|
| Identical template, fixture-matched sports, no axes | S6 returns `[]` | 18 of 14,498 sports pairs settled differently (0.124%; Clopper-Pearson 95% upper 0.196%); sports are the easy case [16 §5.2] | 0.25% | `executable` if the class gate passes and net edge exceeds `delta_upper` |
| `timing_cutoff` only | cutoff delta computed | hazard approximation `h * Delta`, with `h = -ln(1-p)/T` from the market's own price and horizon; e.g. `p = 0.35`, `T = 70 d`, `Delta = 5 h` gives about 0.13%; floor at 1% because events cluster near deadlines (D) | `max(h*Delta, 1%)` | `hedged` |
| `window_start`, `tie_break`, `early_close` | extractor hit | no measured rate | 2% to 5% | `hedged` |
| `void_policy` differs | extractor hit | Polymarket 50-50 on 0.41% of protocol payouts (410 of 99,283); XO minority "remain open" clause 6 of 81 | priced through void atoms (explicit payoff), plus 0.5% | `hedged` |
| `measure_source` differs, objective sources | extractor hit | Chainlink vs Binance same side about 85% at 5-minute boundaries [15 §3.8]; NYC temperature agreement 32.4% vs Miami 61.8% over 102 city-days (blog, M) [15 R5] | from an agreement table per source pair; if none exists the label is blocked | blocked without table |
| `oracle`: XO MANUAL with creator resolver vs UMA or exchange | native fields | no XO-vs-X settlement history yet | 5% | `hedged` at best, `indicative` for non-allowlisted creators |
| `exception_clause`, `event_vs_state`, `announcement_vs_occurrence`, `orientation` unknown | extractor hit | R1 $1.00 vs $0.02; R2; R3 [15 §8] | not priced | blocked |

### 9.3 Learning `delta` from shadow settlements

For each axis-signature class keep `Beta(alpha, beta)` with prior mean `delta_0` and pseudo-count `n_0 = 20` (D). Each settled link updates `(alpha, beta)` with agree/diverge. The reserve uses the **90th percentile** of the posterior, not the mean. For `Beta(1, 19)` (mean 5%): 11.4% at the 90th percentile; after 40 clean settlements `Beta(1, 59)`: 3.8%; after 200: 1.0%. So a MANUAL-resolver XO class needs on the order of 200 clean settled instances before its reserve drops near 1%; the class stays `hedged` for a long time, which matches the evidence that XO pairs are `settlement_source` divergent by default [10 §4.2]. Sports fixture classes can start from the Kairos-audit prior.

### 9.4 Reserve in the edge

`net_hedged = t_nom(q) - delta_total * C_cover(q)`, where `t_nom` is the nominal LP value after fees and lock, `C_cover` the capital of the cover, and `delta_total = sum_axes delta_axis` (capped at 1). The robust LP value `t_rob` is reported as the stress number. Break-even rule: a pair breaks even when the adverse-divergence probability equals its net edge `e` [AD §5.6]. Example: a pair with 46 bps net edge (the median verified-true link) is wiped out by any class with `delta_upper` above 0.46%, so only clean fixture-matched sports templates can ever carry a positive reserve-adjusted edge at those sizes.

---

## 10. Executable edge from depth and fees

### 10.1 Prices

Only executable prices: ask ladders for buys, bid ladders for sells, from books fetched in the same call. Never `outcomePrices`, Gamma `bestAsk`, last trade, Kalshi `last_price` or XO Data API `currentPrice` (Gamma `bestAsk` lagged the CLOB: 0.993 vs 1.007) [15 V1.2, 17 §1.2]. Kalshi YES ask = 1 - best NO bid with sizes carried; Polymarket books sorted explicitly (best-last); XO best-first; Limitless 1e6 size units and YES-only books [AD §2.2]. Round every leg to its tick before computing edge (buys up, sells down).

### 10.2 Fees (read per market at quote time; unknown fails closed)

| Venue | Model | Parameter source | Caveats |
|---|---|---|---|
| Polymarket | `C x rate x p(1-p)`, taker only, 5-dp rounding | Gamma `feeSchedule` per market (live 0.03, 0.04, 0.05, 0.07; Sports 0.03 live vs 0.05 in docs) | `exponent != 1` or `feesEnabled` with missing rate = fail closed |
| Kalshi | `ceil_6dp(0.07 x mult x C x p(1-p))` plus rounding to the member's cent grid | series `fee_type`/`fee_multiplier` plus event overrides and scheduled changes; coefficient derived from the docs' worked example (0.07 x 0.055 x 0.945 = 0.00363825) | maker fees exist on `quadratic_with_maker_fees` series (KXFED, KXFEDDECISION) |
| XO | curve `C x bps/10000 x p(1-p)` per docs; field says `FLAT_BPS` | `effectiveFeeConfig.takerFeeBps` (400 on 81 of 81 football rows; `/fee-rate` returns 0) | **unreconciled**: use the maximum of plausible models (curve and flat-of-notional) until a real fill reconciles; flat 4% of notional is 2x the curve at p = 0.5 and 10x at p = 0.9 |
| Limitless | buy 0.40% to 3.00% paid in outcome tokens, sell 0.42% to 1.50% | docs table, no closed form | if the 3% applies to contracts rather than notional, the 5 to 164 bps true edges can flip negative [17 V2.7] |

Fee depends on price level, not quantity, so the LP stays linear [15 §4.3]. Integer lots are re-priced with the exact rounding rule after the LP.

### 10.3 Depth walk

Level columns (one per ask/bid level); the LP chooses the cover. Marginal stopping rule: stop when the marginal net edge per share at the next level is at most `tau` (D: 0.5 cent). The best-priced level is not the size to trade [AD §5.0]. Capital is the sum of leg costs (shorts cost `1 - b` per share on collateral venues). Kalshi `MECNET`/`DIRECNET` collateral netting means reported capital is an upper bound.

### 10.4 Lock-up, legging and execution friction

- **Lock cost** `lambda = rho x T/365 x capital`, `T = T0 + P(dispute) x Delta` with `T0` the later scheduled resolution among legs. Dispute tail from [15 §7, 15 V1.13]: about 1.0% of proposals population-wide, 7.6% of top-1,000 markets by volume, 27% in geopolitics-keyword markets, 1.2% in sports-style; `Delta` about 4 days at the median and 18 days at p90 for disputed markets. XO and Trueo have their own tails (Trueo's council has no timeout). `rho` default 5% APR (D); the 8% used in [15] is an assumption; replace with the measured annualised settlement wedge from [15 V3.1] when available.
- **Legging.** Non-atomic: sequence the least liquid or most revert-prone leg first; add a "leg reverts" state for Polymarket (off-chain-matched, on-chain-reverted fills reached 24.3% of transactions in peak hours [15 V3.2]); XO taker delay 0.5 to 3 s and Limitless 1.25 s are skew inputs. Skew limits (D): 5 s for `executable`, 60 s for `hedged`.
- **Fixed costs** (gas, bridge, rebalancing) are `friction_unknown` unless known, and downgrade the tier.
- **Caps** from the plan ($10 per order) make the P&L negligible by construction (about $0.72 on a capped pair in the worked example [AD §5.1]); the label, not the P&L, is the product.

### 10.5 Worked example (real book, section 3.4)

Kalshi AGI date ladder: gross $58.50, fees $44.43, net **$14.07** on 1,950 shares and $1,892 of capital (74.4 bps); lock at 5% APR over 4.2 years is 21.0% of capital. Tier: `structural_violation` would require net-of-lock > 0; here it is not (74 bps vs 2,100 bps), so the output is `indicative_discrepancy` with reasons `[lock_exceeds_edge, long_dated]` even though the book violates monotonicity. That is the intended behaviour: report the inconsistency, refuse the opportunity label.

### 10.6 Tiers

| Tier | Requires |
|---|---|
| `structural_violation` | within one venue and clock; E2 to E4 where the long basket is involved; nominal and robust LP > 0 after fees and lock; no tail legs |
| `executable_arbitrage` | cross-venue link at P2 or P4, `axes = []`, class gate passed, `net_hedged > 0` using `delta_upper`, skew within limit, fee models verified (XO reconciled by a real fill) |
| `hedged_discrepancy` | positive `net_hedged` with allowed axes priced; proof >= P2 or P4 |
| `indicative_discrepancy` | anything else, including all P0/P1/P3 links not yet approved, with machine-readable reasons |
| `model_edge` | external fair value (e.g. a forecast signal) vs ask, shrunk; never constraint-based |
| `relative_value_signal` | factor clusters, cross-asset |

The tier is `min(proof cap, class cap, axis cap, gate result)`. Expect `executable_arbitrage` to print rarely or never: 0 of 13 identical verified links survived the filters in [17].

---

## 11. What runs where

### 11.1 Inside the PayBox Open Plugin (stateless, 10 s, 10 MiB, 16 exact hosts, no per-user state [06 §2, AD §1.1])

| Component | Size estimate (D) | Notes |
|---|---|---|
| Venue adapters (read only) with book normalisers | tens of KB each | host budget per [AD §1.5]; XO list rows lack rules and `rootEventSlug`, so a market comparison needs one XO detail request |
| Signature parser, lexicon, alias registry | about 100 to 200 KB gz | hot path is regex and table lookups; 0.04 ms per pair in CPython |
| Rule-difference extractors and masked-hash function | about 20 KB | runs on any two legs the user asks about, even for candidate links, to show typed differences |
| Link verifier | small | SHA-256 via built-in crypto (M); recompute `rules.sha256`, `maskedSha256`, status, close time, tick, fee ref; compare to pins |
| Closed-form set/ladder/identity checks | small | |
| Exact LP (rationals) for <= 30 contracts, <= 64 atoms; dual certificate | about 10 KB | milliseconds in JS |
| Fee models, depth walk, tiering | small | fail closed on unknown model |
| `links.json` (ids and hashes only), `templates.json` | about 0.4 KB per link (D): 5,000 links = about 2 MB | store ids and hashes, not Kalshi rule text, until the Developer Agreement question is resolved [16 §13 Q3] |

Tools (read-only, from [AD §9.1]): `pm_lookup_links`, `pm_verify_link`, `pm_compare_market`, `pm_check_structure`, `pm_get_quote`, later `pm_find_edge`. An XO market comparison budget: 1 XO detail + 3 XO books + counterpart detail + books, at most 8 requests, about 3 s each in the reference-plugin budget.

### 11.2 Offline indexer (never bundled)

Crawl and snapshot; entity-alias curation; template discovery by skeleton clustering (section 3.1); L2 retrieval and embeddings (recall only); LLM R1/R2/R3 (section 6.7); reviewer queue (PR or issue per template and per anomalous instance, showing both rule texts with extracted slots and quoted fragments highlighted); gold-set tooling; shadow-settlement monitor; price-history snapshotter (Polymarket keeps 1-minute history about 7 days; Kalshi caps 1-minute pulls at 3.4 days per call [18 §4]); factor-cluster correlation features; Option-B dataset build and Ed25519 signing.

### 11.3 Hosted

Nothing is required for the MVP. Option B (signed static `links.json` on one extra allowlisted host) once the registry outgrows the bundle [16 §10.3]. A hosted matching API only if user feedback loops justify it. No third-party matcher at runtime (nine dead or dark aggregator items in 2026 [14 §8.3]).

---

## 12. Cost per 1,000 markets

Assumptions (D): 300 tokens per market for title plus rules; slot-fill call 650 input and 250 output tokens (Haiku 5.5 at $0.10/$0.50 per 1M); adjudication pair 950 input and 150 output tokens (Sonnet 5.5 at $2/$10; "thinking" variant 450 output tokens). Prices from the cached model table used in [16 §10.3] (2026-10-06). Residual rates are scenario assumptions anchored on section 3.1 (XO types 2+4: 53.6% of rows not in a >= 3-member skeleton) and section 3.3 (22% of candidate pairs ABSTAIN; 30% in the frozen v4 run).

| Scenario (per 1,000 new markets) | Pairs sent to LLM | Slot-fill calls | Haiku judge | Sonnet judge | Sonnet + thinking |
|---|---|---|---|---|---|
| Lean: k = 3 candidates, 15% abstain, 15% slot-fill | 450 | 150 | $0.11 | $1.56 | $2.91 |
| Base: k = 5, 25% abstain, 30% slot-fill | 1,250 | 300 | $0.27 | $4.31 | $8.06 |
| Heavy (XO type-4-like tail): k = 5, 30% abstain, 55% slot-fill | 1,500 | 550 | $0.36 | $5.20 | $9.70 |

Reference: the LLM-first, all-pairs pipeline at k = 5 costs $0.85 (Haiku) to $17.00 (Sonnet) per 1,000 markets before thinking tokens [16 §10.3]. With the same Sonnet assumptions and no thinking, my design is 3.3x to 11x cheaper ($5.20 to $1.56 vs $17.00) because REJECT pairs (30% of candidates) and LINK pairs (49%) never reach a model. Embeddings are only for the residual: $0.002 to $0.012 per 1,000 markets. Infrastructure: $0 on a free static host (unverified, L).

**The dominant cost is human review, NOT MEASURED.** Formula: `reviewer_minutes = templates x m_t + sampled_instances x m_i + anomalies x m_a`. Without template approval, 330 links (the XO non-sports hit rate of 33% on 1,000 markets) at 2 to 5 minutes each is 11 to 27.5 hours; with template pins the first review of 81 football markets is 4 templates. Measure `m_t`, `m_i`, `m_a` in the first week; they decide whether the registry can grow past a few hundred links.

---

## 13. Failure modes

| Failure | Cause | Detection | Handling |
|---|---|---|---|
| Entity alias gap | unknown spelling of a team or person | `subject.value = null` | ABSTAIN; add alias; regression fixture |
| Lexicon false synonym | e.g. "nominee" treated as "winner" | gold-set regression, shadow settlement | version the lexicon; fail the CI check |
| Template drift | XO creator changes wording; Kalshi series rule text edited | new `maskedSha256` | instance leaves `template_approved`; review |
| Dominant-creator dependency | 242 of 242 XO type-2 rows come from one account and one resolver | creator/resolver registry | allowlist expiry; alert on a new resolver |
| Adversarial listing | a creator copies another venue's title and rules | G7 | `indicative` cap |
| Orientation error | YES side differs by venue | S4b | ABSTAIN unless proven |
| Non-exhaustive set treated as partition | "Other" or tie outcomes | exhaustiveness proof level | long basket requires E2 to E4 |
| Ladder polarity | survival vs cumulative; negative numbers; "exactly N" bins; empty-side quotes encoded as 0.0000; year rollover | adversarial unit tests (the ten bugs in [17 §5.1]) | kept as permanent fixtures |
| Many-to-many linking | one market matches many | G5 | duplicate set or review |
| Stale or edited rules | clarifications after approval | pin mismatch | auto-suspend |
| Venue schema drift | Kalshi ships weekly changes; Polymarket v1 retires 2026-10-24 | contract tests against fixtures | fail closed on unknown enums [AD §8.3] |
| Fee model drift or conflict | XO `FLAT_BPS` vs curve; Polymarket Sports 0.03 vs 0.05; Limitless token-denominated fees | reconcile with a real fill | max of models; unknown = fail closed |
| Non-atomic legs | sequential book fetches 0.3 s apart; ghost fills | skew bound, revert state | tier cap; sequencing |
| Overfitting of the gate | lexicon written from the same failure patterns | fresh gold set | do not claim precision beyond the fresh bound |
| Reviewer fatigue | too many instances | template pins, sampling | cap queue; pause new templates |
| Data-licence breach | Kalshi Developer Agreement bars caching/aggregating [AD §10] | counsel | ids and hashes only in shipped datasets; per-user reads |
| Gamma/CLOB mismatch | listing quotes lag books (5.5% to 7.1% disagree by more than 1 cent after 15 min) | book fetch before any claim | listings are pre-screen only |
| LLM spend blowup | adversarial text volume | per-run budget caps | hard stop; Haiku-only fallback |

---

## 14. Evaluation plan

### 14.1 Gold set

1. **Population.** Pairs and sets the system would actually surface, stratified by gate verdict (LINK, ABSTAIN, a random 10% of REJECT to measure false rejects), proof level, venue pair, template family, and the relation claimed. Not random pairs (almost all true negatives) [16 §8].
2. **Size.** At least 400 items across at least 6 strata, with at least 189 labelled LINKs per class that will print `hedged` or `executable` (zero-failure rule: Wilson lower bound >= 0.98 needs n = 189; >= 0.97 needs 125; >= 0.99 needs 381; with 1 failure the required n rises).
3. **Label schema.** Two levels recorded separately: `qLevel` (same underlying question) and `rLevel` (rule-identical with no axes), plus `axes`, `relation`, `outcomeMap`, quoted fragments, and the rule hashes at labelling time (a hash change invalidates a label).
4. **Procedure.** Two independent labelers on the full set (not 20%) for the first 100 items, then 20% double-labelling; Cohen's kappa >= 0.8 per level or the instructions are revised; a third reviewer adjudicates disagreements; label policy (identical / minor difference / major / different) is written down and applied by checklist, because the single-rater policy drifted in [17 V2.6] (roughly 9 to 10 of 17, not 13, strictly identical).
5. **Seeds.** The 101 deduplicated pairs used in section 3.3 and the 108 XO-vs-Polymarket dev pairs are **development data only**: they shaped the lexicon, so they cannot be test data. Silver labels: Limitless-declared mirrors (475 usable) for recall, UCL fixtures (18 of 18), post-settlement agreement for negatives. A fresh, untouched test split (>= 150 items) is sampled after the lexicon freezes and is looked at once per release.
6. **Dev/test hygiene.** Freeze (hash) `parserVersion`, `lexiconVersion`, `templateSetVersion` before each test run; log every run; no tuning after a test split is read.

### 14.2 Targets (D; to be revised by the first fresh test split)

| Metric | Target | Why |
|---|---|---|
| `qLevel` precision of LINK, per template family | Wilson lower bound >= 0.97 (n >= 125, zero failures) | measured today: 41/41, lower bound 0.914 on semi-held-out data |
| `rLevel` precision among LINKs with `axes = []` after S6 | Wilson lower bound >= 0.98 (n >= 189) before any class prints `executable`; >= 0.95 for `hedged` | holdout shows 0.76 to 0.80 strict before S6 |
| Axis-extraction recall | >= 95% of gold-labelled axes found (void, cutoff, source, tie-break, exception) | a missed axis is a fake arbitrage; a spurious axis only costs an opportunity |
| `qLevel` recall (candidate pool = all true links) | >= 85% on templated XO families; >= 70% on non-templated pairs at the same precision | today: 73% to 88% relative to the old linker's pool only |
| Native-hook recall (Limitless-declared mirrors) | >= 80% at LINK precision >= 0.97 | fuzzy linker 13% to 56% [17 §2.5] |
| Ladder/partition direction and exhaustiveness | 0 errors on the adversarial regression set; >= 99% on 300 random families; 0 false "exhaustive" in 200 sampled sets | polarity bugs created thousands of fake violations [17 §5.1] |
| False-edge rate | <= 2% of displayed `hedged` or `executable` edges later judged false at review | the product promise |
| Shadow settlement | divergence <= 0.5% for `identical` classes; any divergence suspends the class | [16 §5.2] 0.12% sports |

### 14.3 Ongoing

Weekly: re-hash every approved link; sample 60 links per month for re-labelling; track `maskedSha256` churn per template. Daily: contract tests against recorded fixtures for every venue trap in [AD §2.4]. Per release: the full adversarial regression suite (survival-vs-cumulative dates, negative spreads, empty-side quotes, orientation inversion, "exactly N" bins, the "at least" head-to-head regex bug, entity swaps, hike vs decrease, wrong central bank, win vs advance).

### 14.4 Release gates

`indicative` and `structural_violation` can ship with the MVP. `hedged` ships per class when its `qLevel` and `rLevel` bounds and the shadow counters pass. `executable_arbitrage` additionally requires two reconciled real XO fills (fee model) and a signed-off reserve posterior [AD D2].

---

## 15. MVP cut

**Keep (in order of build):**

1. Native-structure readers and groups: XO (`rootEventSlug` triples, earning-pool `eventId`), Polymarket negRisk and ladders, Kalshi events and strikes, Limitless mirror hooks.
2. Signature parser and registry for four families only: football triples (`T-FB3`), central-bank decision sets (`T-CBD`), asset touch ladders (`T-TOUCH`), election/award winner lists (`T-WINNER`).
3. Slot gate, orientation, rule-diff extractors, masked hashes, template pins, `links.json` with `proposed`/`template_approved`/`suspended`.
4. Closed-form partition / ladder / identity checks and the small LP with dual certificate; fee-adjusted depth walk; tiering; circuit breaker.
5. Offline: crawler, alias curation, review queue, gold-set tooling, shadow-settlement monitor.

**Cut from the MVP:** embeddings and any L2 retrieval beyond Polymarket `public-search`; in-plugin LLM of any kind; LLM R3 adjudication (keep R1/R2 offline in week one); cross-venue implication, exclusive and joint relations (candidates only); touch lattices (pairwise ladders only); cross-asset (Deribit, futures, sportsbooks); correlation, lead-lag and hedge-ratio features (log history instead); Trueo, Predict.fun, Opinion, Hyperliquid, Polymarket US adapters; hosted API; any third-party matcher; Option B signed dataset until the bundle outgrows releases.

**First links to approve** (best evidence, lowest cost): XO Champions League triples vs Kalshi `KXUCLGAME` (18 of 18 top-1 by team + date [16 §7.9a]); XO central-bank decision sets vs Polymarket decision events (FOMC five-way coherent within the spread on 2026-10-18 [16 §4]); XO asset-touch ladders vs Polymarket/Limitless mirrors; within-XO partition and ladder checks (needs only XO books).

**Success criteria for the MVP:** zero false `template_approved` links in the first fresh test split (n >= 150), 100% of approved links suspend on a forced hash change, and the review time per template measured.

---

## 16. Biggest risks and open questions

1. **Reviewer time is unmeasured** and decides whether the registry scales.
2. **Lexicon and alias maintenance** is a real, ongoing cost; the gate's apparent 100% precision on 41 to 49 LINKs is a lower bound of 0.91 to 0.93 and was partly shaped by the same failure patterns.
3. **Recall outside the old linker's candidate pool is unmeasured**; the 13% to 56% recall of the tf-idf linker against Limitless mirrors suggests many true links are never surfaced.
4. **XO concentration.** 242 of 242 type-2 rows, one creator, one resolver, MANUAL. If that account's templates change, the liquid core of the catalogue re-enters review.
5. **XO fee model** (`FLAT_BPS` vs curve) can move true-edge sign; no label above `indicative` until reconciled with a real fill.
6. **Kalshi data terms.** The Developer Agreement (v1.1, 2023, possibly superseded) restricts caching and aggregating; ship ids and hashes only and read per user until counsel clears it [AD §10].
7. **Economic value is small by design.** The evidence says few free-lunch arbitrages exist; the case for this subsystem is correctness (no fake alerts), reference prices for XO markets, and structural checks inside XO sets.
8. **Open XO items** (events/series endpoint or group id on list rows; FLAT_BPS semantics; funding and execution gates) are tracked in [P0] and [AD §13]; none is needed for the read-only link layer.

---

## 17. Differences from `docs/aggregation-design.md` (so the panel can compare)

- Adds **proof levels** and a **template-pair review unit** (masked rule hashes) to cut reviewer load; [AD §4.3] has per-link human approval.
- Makes the LLM **asymmetric** (demote/flag only; slots must verify by quote) rather than a judge that proposes `link`.
- Adds explicit **exhaustiveness proof levels** (E1 to E4) to separate the long and short baskets.
- Adds the **edge-size circuit breaker** and the **adversarial-creator guard**.
- Uses note 17, which `docs/aggregation-design.md` could not (it reports "there is no note 17").
- Flags the XO `FLAT_BPS` field as an open fee-model item beyond the two-source conflict already recorded in [AD §3.3].
- The `Link` record here is a superset of [AD §2.5]: adds `proof`, `proofEvidence`, `templateId`, `instancePins`, `ruleDiff`.

---

## Appendix A. The slot gate (rules as implemented for the section 3.3 test)

Python 3 stdlib, about 200 lines; reproduced here as rules so the repo carries the method. Reference implementation: `<scratch>/A-structured-first/gate.py` (v5) and `gate_v4.py` (frozen v4, md5 `3dce0c5cd5eb76ad1a8e44987d59a55c`).

```
normalise(title):  NFKD accent fold; possessives stripped; "white house" -> one token; lowercase
extract(title, native_end, extra_rules_head):
  dates        : "Month D[, YYYY]", "D Month YYYY", ISO, "Month YYYY", "Q3 2026", "before YYYY" (=Dec 31 of YYYY-1),
                 "end of/in/by YYYY" (=Dec 31), "mid-YYYY" (=Jun 30), single bare year (=Dec 31), "in Month" (=month end)
  window_end   : text-derived if any, else native close/end date
  numbers      : value+unit after removing dates/years; k/m/b suffix scaled; units % bps; "50+" or "or more" -> comparator ge
  direction    : UP {hike, increase, rise, above, exceed, up...}, DOWN {cut, decrease, below, drop, dip...}, HOLD {unchanged, maintain...}
  residual     : remaining content tokens after stopwords and synonym folding (hit/reach/touch -> TOUCH, launch/release -> LAUNCH,
                 announce* -> ANN, nominee/nomination -> NOMINEE, bankrupt/bankruptcy -> BANKRUPT, bps/basis -> BPS ...)
gate(A, B):
  if placeholder outcome ("Party A", "Candidate S")           -> ABSTAIN placeholder
  if outcome-universe sizes differ                              -> ABSTAIN universe
  if both have numbers and sets differ                          -> REJECT numeric
  if one side only has numbers                                  -> ABSTAIN numeric-one-sided
  if direction classes both present and disjoint                -> REJECT direction
  if both comparators present and differ                        -> REJECT comparator
  if both window ends known and |diff| > 1.5 days               -> REJECT date
  strong = residual minus WEAK {TOUCH, LAUNCH, ANN, WIN, OUT, RATE, BPS, MTG, FED, BANK, TOKEN, PERF}
  if tokens from one mutually exclusive scope group differ      -> REJECT scope-group   (competitions; offices)
  if a scope token appears on one side only                     -> ABSTAIN scope-one-sided
  if strong-unmatched tokens on both sides AND (no shared strong tokens OR unmatched > 2x shared OR >= 2 on both) -> REJECT entity/qualifier swap
  if a potent qualifier appears on one side only (again, first, only, exactly, another, other, still, remain, fully, officially, any, all...) -> ABSTAIN
  if strong-unmatched tokens remain on both sides               -> ABSTAIN qualifier-mismatch
  if >= 3 unmatched on one side                                 -> ABSTAIN extra-qualifiers
  if no shared strong token and no shared weak token            -> ABSTAIN no-shared-content
  else LINK
```

What the production version adds: canonical entity ids (not token overlap) for the entity-swap veto, native-field window ends, outcome orientation from native fields, per-family templates, and the rule-difference stage.

## Appendix B. Evidence index for this design

Repo notes read in full or in the cited sections: `docs/plan.md`, `docs/research-notes.md`, `docs/research/14` to `18` with Verification sections, `docs/aggregation-design.md` (sections 0 to 5, 8 to 13), `docs/phase0-gate-results.md` (headers and section 6), `docs/research/10` (sections 4, 5), `docs/research/02` (grep for XO resolution and grouping fields). `docs/research/venues/*.md` and `docs/venue-census.md` did not exist when I worked.

Fixtures used: `docs/research/fixtures/linking/xo_vs_polymarket_labelled_pairs_2026-10-18.json`, `audit_sample_labeled.json`, `link_labels_keyed.json`.

Fresh pulls (public GET): `https://api-mainnet.xo.market/api/markets?marketType=0,1,2,3,4&statuses=ACTIVE&take=50&page=N` (10 requests), `https://api-mainnet.xo.market/api/markets/slug/{slug}` (110 requests: 30 random type-2 rows, 81 football rows, one overlap), `https://gamma-api.polymarket.com/events/keyset?closed=false&limit=100&order=volume24hr&ascending=false` (3 pages), `https://external-api.kalshi.com/trade-api/v2/events?status=open&with_nested_markets=true&limit=100` (2 pages).

Scratchpad (not in repo): `fetch.py`, `skel.py`, `gate.py`, `gate_v4.py`, `run_dev.py`, `run_hold.py`, `stats.py`, `xo_detail.py`, `xo_fb.py`, `xo_fb_mask.py`, `lp.py` (copied from [15 App. A]). Suspicious or agent-directed content: none encountered in the XO, Polymarket or Kalshi responses I parsed; market titles and rules were treated as data and only quoted or hashed.
