# B. Semantic-first market linking and relationship arbitrage: design

> **Status (2026-10-19): design only, no product code.** Independent design B of three for the market-linking and relationship-arbitrage subsystem of the XO PayBox plugin plus its venue-agnostic aggregation layer. Philosophy assigned to this design: **semantic-first**. Embed titles and rules to generate candidates with blocking, then use an LLM judge (abstention, calibrated confidence, structured relation schema, rule-text diffing) to classify relation types, backed by a human-review queue and a published links dataset that the plugin consumes; an LP validates logical consistency. This is not legal advice. Nothing here was executed against PayBox money tools, no account, key or signature was used, and no third-party code was run.

**How to read citations.** `[NN §x]` is section x of `docs/research/NN-*.md`; `[NN V-x]` is an item in that note's appended *Verification (2026-10-19)* section, which overrides the researcher's body text (for example `[16 V-K2]`, `[17 V2.6]`). `[AD §x]` is `docs/aggregation-design.md`. Confidence tags: **H** read or measured first-hand in a primary source or by me this session (script or file cited); **M** secondary or inferred; **L** weak or stale; **D** a design default chosen here, not a finding, to be calibrated. "NOT FOUND (searched: ...)" marks a documented absence.

**Evidence status used.** Notes 14 to 18 all carry verification sections (the earlier `aggregation-design.md` said note 15 and note 18 had none and that note 17 did not exist; that is now out of date). I treat the verified numbers as hard evidence and do not design against anything the verifiers refuted: the "23/23 gated precision" is in-sample and replicated as 5 of 8 out of sample [16 V-K2]; "stale books explain ~0" is vacuous because staleness is unobservable [17 V2.1]; "fuzzy title linking is not a detector" is true of one tf-idf linker only [17 V2.5]; "edges last seconds" holds only for the measurable short episodes [15 V1.1]. `docs/research/01-13*.md` were used through `[AD]` and `[phase0]` (`docs/phase0-gate-results.md`); `docs/research/venues/*.md` and `docs/venue-census.md` do not exist yet.

---

## 0. Summary

### 0.1 The design in ten lines

1. **The product is a verified link graph with explicit rule differences, not an arbitrage engine.** Measured 2026-10-18: within-venue structure gives 0 net-positive proven arbitrages after fees (706 sell-side sets, 0 net; ladders 3 net-positive worth USD 13.4 total) [17 §0]; cross-venue "edge" is 485 of 868 apparent net-positive pairs, yet the six pairs surviving a generic funnel were all false links, and the 17 verified-true links carry 5 to 246 bps on long-dated, thin capital with none surviving a 5% APR hurdle plus a 300 bps haircut [17 §2.6]; no taker lead-lag edge survives frictions in 41 relationships [18 §0]. The value of links is reference prices for XO markets, structural checks inside XO sets and ladders, hedged discrepancies with a quantified resolution reserve, and joins to Quotient. **A false link is a fake arbitrage, so precision outranks recall everywhere.**
2. **Semantic-first means: one semantic representation, two keys.** Every market (templated or not) is parsed into a typed **ClaimFrame** (subject, outcome kind, operator, threshold, window, orientation, universe, source, void/tie/postponement slots, exception clauses), each slot carrying a verified quote span. **The LLM extracts and judges; code compares and vetoes.** A link exists only when the judge's relation and the code-derived relation from the two frames agree. Deterministic templates (XO football triples, decision sets, crypto ladders) are simply cheap, near-perfect ClaimFrame extractors inside the same framework (18 of 18 on the UCL fixture [16 §7.9a]), not a rival design.
3. **Candidates by blocking plus retrieval, never by price.** Native keys always first (Limitless `externalSlug` and `rulesHash`, Predict.fun refs, Kalshi milestones), then structural soft-blocks, then BM25 union embedding (title plus rules, plus an entity-masked variant), k = 20 (the one published pipeline reports 99.9% recall at k = 20 [16 §6.2]; our own tf-idf linker recovered 393 of 475 declared mirrors at any similarity [17 §2.5]; recall of the proposed BM25-plus-embedding union on our corpus is not yet measured, see section 12).
4. **A three-stage judge cascade** (Haiku 5.5 screen, Sonnet 5.5 structured diff, Opus 5.5 independent second vote) emits a fixed JSON schema (relation, direction, outcome map, basis class, typed divergence axes with quoted evidence, unresolved slots, mandatory counterexample attempt, verdict `link`, `no_link` or `abstain`). Unanimity on relation and axes is required; anything else abstains. **Metamorphic probes** (entity swap, direction flip, threshold step, date shift, A/B order swap) must all return `no_link`, a ladder type or the inverse mapping; a failed probe rejects the link and repeated failures suspend the whole template.
5. **Human review is the only gate to any tier above `indicative`.** Reviewed links are hash-pinned (rules text, close time, outcomes, resolver, native version) and auto-suspend on any change. `executable` additionally needs a second reviewer, an empty axis list, a venue pair with objective settlement, and the earlier D2 criteria (200 or more gold links, Wilson lower bound at least 0.97, two reconciled real fills) [AD §0.4].
6. **An LP over the typed state space validates logical consistency twice:** offline it checks that the proposed relation graph is satisfiable and non-degenerate (no market forced false, no empty state space); at runtime it computes the guaranteed profit with per-level fees, lock-up and explicit void rows, and its dual is a coherent reference price vector (a no-arbitrage certificate) [15 §4.2]. Verified on the 17 XO-vs-Kalshi Champions League triples in the repo fixture: 0 gross, 0 fee-adjusted, 0 with void rows (section 8.4).
7. **Resolution risk is a per-link quantity, not a constant:** typed axes (timing, source, void policy, tie rule, other-fallback, early close, exception clause, reference index), each with a prior adverse-divergence probability from the evidence (from 0.12% for fixture-matched sports to a 98-cent payout gap in the Khamenei case), updated by settlement outcomes (Beta posteriors), applied as explicit LP rows and as a haircut.
8. **What runs where.** The plugin (stateless, 10 s, 10 MiB, 16 hosts) never calls an LLM: it fetches a signed links dataset (or bundled snapshot), re-reads both legs, recomputes rule hashes and status, runs constraint checks, a small LP and the fee-adjusted depth walk. Embeddings, judging, review queue, probes, calibration and dataset signing are offline.
9. **Cost is dominated by humans, not models.** XO-anchored backfill (421 anchors, k = 20): about USD 7 to 19 of model spend including probes with the batch discount (USD 16 to 46 per 1,000 anchors), embeddings USD 0.003; the full 145k-market corpus embeds for USD 0.87 to 5.66 one-off. Reviewer time per link is NOT MEASURED (section 10).
10. **MVP cut (section 13):** an offline, Claude-Code-run, XO-anchored pipeline; Sonnet screen plus Opus second vote; deterministic gates; PR-based review; bundled `links.json`; plugin verifier with closed-form pair, partition and ladder checks. Cut: hosted indexer, vector store, signed dataset and revocation feed, set-level judge, general simplex in the plugin, Kalshi-wide corpus indexing, learned calibration, factor and joint relation types.

### 0.2 Why this beats the alternatives (and where it does not)

| Alternative | Evidence against it as the primary design | What semantic-first adds |
|---|---|---|
| Title similarity plus gates (token Jaccard, tf-idf) | 18% strict and 34% lenient precision at sim at least 0.45; 72% and 90% at least 0.65; recall 13% to 56% against declared mirrors [17 §2.5]; gated 23/23 in-sample but 5 of 8 out of sample with an entity-swap false link [16 V-K2] | Reads rules, not titles; extracts the rule differences that 33% of audited true links carry (14 of 43; 7 to 8 of the 17 profitable true links once labelled consistently) [17 §2.5, 17 V2.6] |
| Native keys only | Only Limitless mirrors (46 of 100 sampled), Predict.fun and Probable refs; XO, Trueo, Polymarket, Kalshi expose none [16 §0.1] | Keys become *candidates with provenance*; the judge still checks rules (mirrors differ: 20 vs 14 ladder rungs, cancel clauses) |
| Deterministic templates only | 18/18 on UCL, but 32 of 98 XO non-sports markets have counterparts that only language understanding can pair; templates have zero coverage elsewhere [16 §7.9] | Templates become one extractor family; the long tail is covered |
| Buy a hosted matcher (Predictefy, pmxt, Kairos, Prediction Hunt, Oddpool) | None covers XO except Predictefy (closed beta, nothing ever submitted to XO, commercial use Enterprise only); pmxt is personal-use on all plans; none publishes precision at a threshold; nine aggregator-type services died or went dark in 2026 [14 §8.3, 16 V-K5, V-K6] | We own the registry and the evidence; hosted services are benchmark spends only |
| Price or statistics first (lead-lag, correlation, spread mean-reversion) | 0 of 273 follow-the-leader variants net positive; pairs back-test net negative for 13 of 13; roughly 90% of the apparent gap disappears before capital lock [18 §0, §2.6, §2.9] | Statistics are a *signal layer on top of verified clusters*; they cannot create links |

**Where semantic-first is the wrong tool.** For templated families it is slower and costlier than a regex; for the unattended precision gate it is not trustworthy (verbalised LLM confidence is uncalibrated in three of eight OSS matchers read [16 §6.1]). The design therefore never lets a model verdict alone move a link above `indicative`.

---

## 1. What already exists (the user's platform-level question)

Question asked: does anything already aggregate not only the markets but also the prediction-market *platforms*, and does anything tie interrelated markets together?

**Platforms.** Nothing aggregates platforms in the full sense (registry plus fees plus geo plus oracle plus reachability plus links plus freshness) [14 §0, §12]. By dimension: DefiLlama is the de facto registry and join key (133 "Prediction Market" rows, 39 flagged dead; includes XO and Trueo; no fees, geo or oracle detail) [14 §2.1]; Prediction Almanac has the best schema (geo, data caps, `routes_to`, `as_of`; CC0; 21 platforms; no XO or Trueo) [14 §2.4]; Prediction Index lists 314 projects (HTML-embedded JSON only; lists a dead service as live) [14 §2.2]; ccxt now ships nine prediction exchanges, none XO or Trueo [14 §4.1]; AGG (agg.market, 11 venues, cross-venue matching, arbitrage WebSocket, per-venue geo policy and fee fields, white-label custody; no XO or Trueo) was missed by the first pass and added by verification [14 V-A4]; Predictefy alone lists XO (vendor claim, never exercised) [14 §10]. Metaforecast is discontinued (2026-07-09). **Gap that remains for us:** a thin, hand-verified registry with XO and Trueo records, fee-parameter sources, void/resolution policy, PayBox reachability, depth tier, mirror links and TTLs. Design B consumes that registry (schema and five validated seeds exist in `fixtures/linking/pop_platform_registry.*`) and adds two fields it needs: `void_policy_default` and `tz_convention`.

**Interrelated markets.** Native batching exists at three granularities: venue event (Polymarket event and `negRisk`, Kalshi event and `mutually_exclusive`, XO `rootEventSlug` on detail only), venue cluster (Kalshi milestones: 778 of 4,000 sampled span several series) and nobody provides cross-venue *sets* [16 §12]. Cross-venue linking exists in River Markets (`generic_asset_id` groups equivalent listings and an aggregated cross-venue orderbook endpoint; construction rules undocumented) [14 V-A1], AGG, Kairos, pmxt Router, Oddpool, Prediction Hunt, Synpath [16 §5.1]. None covers XO or Trueo, none publishes precision. **Correlation:** measured, it exists but is not harvestable by a taker; it appears with horizon (Fed pair rho 0.75, 0.85, 0.97 at 5 min, 1 h, 1 day) and only daily structure is strong; Polymarket leads Kalshi on crypto reach pairs by 5 to 60 minutes, but the gross size of that lead (0.03 to about 1.9 cents) is below the 3.4 to 5.1 cent round-trip cost [18 §0, 18 V-C5, V-C6]. Design B therefore treats correlated and cross-asset relations as a *signal layer* attached to verified clusters, with zero guaranteed profit by construction [15 §3.7, §3.8, V1.3].

**Borrowed vocabulary** (so datasets interoperate): pmxt relation enum `identity, complement, subset, superset, overlap, disjoint`; Oddpool `basis_class` in `identical, settlement_window, settlement_source` and axes `timing, source, condition_scope`; ccxt-style capability `has` map; Almanac `as_of` per field.

---

## 2. Design rules (precision engineering)

| # | Rule | Evidence that motivates it |
|---|---|---|
| R1 | A model verdict is a *proposal*. Nothing above `indicative` without a human and an agreeing deterministic comparator | gated matcher 23/23 in-sample, 5/8 out of sample [16 V-K2]; OSS matchers use verbalised confidence as if calibrated [16 §6.1] |
| R2 | Every extracted slot carries a quote span that must be found verbatim in the normalised source text; unsupported slots are dropped, not guessed | embeddings and LLMs miss exception clauses (Khamenei: USD 1.00 vs 0.02) [15 §8.1 incident R1] |
| R3 | Price never creates a link. Price may only *veto or escalate* (tripwire, section 6) | a link that shows a profitable edge is a false link more often than not: 13 of 30 identical at sim at least 0.65; all 72 pairs above 5,000 bps were false or low-similarity links [17 §2.5, §2.4] |
| R4 | Abstain is first-class and cheap; unknown fails closed (unknown fee model, unknown void policy, unknown orientation, expired TTL) | [14 §9 rule 1], [AD §1.2 principle 4] |
| R5 | Identity is injective: one market has at most one identity partner per other venue unless a declared duplicate set | one Limitless market sat in 30 net-positive pairs [17 V2.3] |
| R6 | Market text is untrusted data: delimiters, no tools attached to the judge, schema-constrained output, quotes verified, reviewer UI escapes HTML | creator-written titles and rules on XO and Polymarket; agent-directed text found in vendor docs [16 §13] |
| R7 | Silence is not equality. A slot absent from the market text resolves through event text, then the platform registry default, else `unknown` (which blocks tiers above `indicative`) | 60 of 100 sampled Kalshi market texts carry no void, postpone, tie, refund or fallback clause at all (measured, section 4.3), while XO texts almost always do (39 of 40), as do about 80% of sampled Polymarket and 75% of Limitless texts |
| R8 | Separate three questions: *same thing* (relation), *same payoff* (basis and axes), *tradeable together* (reachability, eligibility, depth). A link answers only the first two | [AD §6] |
| R9 | Every artefact expires (links, dataset, registry fields) | [14 §9], [AD §8.3] |

---

## 3. Data model

All records are JSON with JSON Schemas checked in CI; ids are content-addressed so a revision cannot silently replace a reviewed object. `Untrusted<T>` marks creator-written text.

### 3.1 Entities

| Entity | Purpose | Key | Lives |
|---|---|---|---|
| `Venue` | platform registry record [14 §9] + `void_policy_default`, `tz_convention` | `platform_id` | repo JSON |
| `Market` | one snapshot of one venue market: ids, title, outcomes in venue order, status, times, resolver, native grouping keys, fee-spec ref | `venue:native_id` (XO and Polymarket `conditionId`, Kalshi ticker, Limitless slug, Trueo `chainId:address`) | offline store; not shipped |
| `RuleDoc` | normalised rule text and per-field hashes for a Market at a fetch time | `market_key@fetched_at` | offline; hashes shipped |
| `ClaimFrame` | semantic parse of one Market (slots with spans) | `market_key + extractor + rules_sha256` | offline |
| `Template` | recurring-series signature (numbers, dates, entities masked) with approved slot mapping per venue | `template_sha256` | offline; template hashes shipped |
| `Candidate` | unordered pair (or set) proposed by one or more generators | `a,b` sorted | offline |
| `Judgement` | one model run's structured verdict for a Candidate, with probe results | `candidate + model_id + prompt_sha + schema_ver + seed_variant` | offline |
| `Link` | typed, pinned, reviewed relation between two Markets (or a Market and a Cluster) | content hash of relation, sorted legs, outcome map | shipped (stripped) |
| `Cluster` | set-level object: members, relation graph, exhaustiveness state, LP certificate | content hash of member keys and relation spec | shipped (stripped) |
| `Review` | one human decision with timing, blindness, canary flag | `link_id + reviewer + at` | offline |
| `GoldLabel` | adjudicated label for evaluation with split (`dev`, `test_sealed`, `silver`) | `candidate` | offline |
| `Release` | signed dataset version, manifest, revocations | `release_id` | static host |

### 3.2 ClaimFrame (the semantic core)

```ts
type Span = { field: string; start: number; end: number };            // offsets into the normalised text of that field
type SlotValue<T> = { value: T; basis: "market_text"|"event_text"|"platform_default"|"absent"; span?: Span };

interface ClaimFrame {
  market: string;                                                       // "kalshi:KXUCLGAME-26OCT21RMARBL-TIE"
  extractor: { kind: "template"|"llm"|"venue_field"; id: string; model?: string; prompt_sha?: string };
  subject: { kind: "person"|"org"|"team"|"asset"|"index"|"event"; canonical: string; qid?: string; alias_hit?: string };
  outcome_kind: "will_happen_by_date"|"state_on_date"|"threshold_above"|"threshold_below"|"between"|"touch_up"
              | "touch_down"|"winner"|"rank_at_most"|"exact_count"|"range_bin"|"head_to_head_win"|"draw"|"decision_option";
  operator?: ">"|">="|"<"|"<="|"=="; inclusive?: boolean;
  threshold?: { value: string; unit: string };                         // decimal string, explicit unit, no float
  window: { start_utc?: string; end_utc: string; end_inclusive: boolean; tz_declared: string; end_local_text: string };
  yes_means: { label: string; outcome_index: number };                  // orientation; XO index 0 is the Yes token [AD §2.1]
  universe: { labels: string[]; exhaustive: "proven"|"by_rule"|"no"|"unknown"; other_fallback: boolean; placeholders: boolean };
  source: { names: string[]; urls: string[]; kind: "official_body"|"price_feed"|"media_consensus"|"venue_staff"|"oracle_vote"|"unspecified" };
  void_on_cancel:  SlotValue<"refund"|"fifty_fifty"|"fair_price"|"last_traded"|"other_outcome"|"unknown">;
  postponement:    SlotValue<"stays_open"|"void_after_days"|"fair_price_after_days"|"n_a"|"unknown"> & { days?: number };
  tie:             SlotValue<"resolves_no"|"fifty_fifty"|"split"|"tie_outcome"|"n_a"|"unknown">;
  early_close:     SlotValue<"possible"|"no"|"unknown">;
  exceptions: Array<{ clause: string; effect: "void"|"fair_price"|"resolves_no"|"resolves_yes"|"other"; span: Span }>;   // death, merger, rename...
  params: Record<string,string>;                                         // instance parameters excluded from template hash
}
```

Invariants: every non-`absent` slot has a `span` that the verifier re-finds; `window.end_utc` is derived by code from `end_local_text` and `tz_declared` (the model never does time-zone arithmetic); `universe.exhaustive` is `proven` only when a venue flag *and* a rule default agree (Polymarket non-augmented `negRisk` plus a quoted default clause), `by_rule` when a rule default is quoted without a venue flag, never inferred from `mutually_exclusive` (false does not mean non-exclusive, and true does not mean exhaustive) [16 V, 17 V4].

### 3.3 Link and Cluster

```ts
type Relation = "identity"|"complement"|"partition_member"|"exclusive_member"|"ladder_threshold"|"ladder_date"
              | "touch_vs_terminal"|"implication"|"joint"|"duplicate_same_venue"|"factor"|"cross_asset";   // factor, cross_asset: signal only

interface Pins {
  rules_sha256: string;            // section 3.4
  template_sha256?: string;        // numbers/dates/entities masked; instance params compared separately
  close_utc: string; outcomes_sha: string;        // labels in venue order
  resolver_id?: string;            // XO resolverAddress; Polymarket resolvedBy + oracle; Kalshi settlement_sources hash
  native_version?: string;         // XO versionId, Limitless externalRulesWatch.rulesHash, Kalshi last_updated_ts
  status_class: "active"|"other";
}
interface AxisInstance {           // catalog in section 7.2
  axis: "timing"|"source"|"void_policy"|"tie_rule"|"other_fallback"|"early_close"|"condition_scope"|"reference_index";
  a: string; b: string; severity: "minor"|"major"|"fatal"; delta_h?: number;
}
interface Link {
  link_id: string; rev: number;
  relation: Relation;
  legs: Array<{ market: string; pins: Pins; role: "a"|"b"|"easy"|"hard"|"parent"|"child"; yes_map: "same"|"inverse" }>;
  cluster_id?: string;
  basis: { class: "identical"|"settlement_window"|"settlement_source"|"different"; axes: AxisInstance[]; cutoff_delta_h?: number };
  provenance: { generators: string[]; judge_runs: string[]; comparator_agrees: boolean; probes_passed: boolean; native_keys?: string[]; method: "template"|"judge"|"native" };
  tier_cap: "indicative"|"hedged"|"executable";
  state: "proposed"|"screened"|"reviewed_1"|"verified"|"executable_eligible"|"suspended"|"rejected"|"expired";
  reviewers: Array<{ id: string; at: string; blind: boolean; decision: string }>;
  valid_until: string;             // earlier of the two closes, capped at release valid_until
}
interface Cluster {
  cluster_id: string; kind: "partition"|"ladder_threshold"|"ladder_date"|"lattice"|"cross_venue_set"|"event_group";
  members: Array<{ market: string; pins: Pins; atom: string }>;           // atom: which state the YES covers
  relation_spec: object;                                                  // compact: type + parameters, not a matrix (the plugin builds the matrix)
  exhaustive: "proven"|"by_rule"|"no"|"unknown"; identity_links: string[];
  lp_certificate?: { gross: string; dual_state_prices: string[]; checked_at: string };   // offline consistency proof
}
```

`tier_cap` rules: `executable` only if `basis.class == "identical"`, `axes == []` after review, both legs settle on objective sources (not XO MANUAL or Trueo council), and the global D2 criteria hold. XO pairs are `settlement_source` by default [10 §4.2], hence `hedged` at best. `duplicate_same_venue` exists because XO has intra-venue duplicates across types and creators (Zcash USD 2,000 and Arsenal Premier League each exist as type 2 and type 4) [16 V-K3].

### 3.4 Rule hash (measured recipe)

`rules_sha256 = SHA-256( NFKC( strip_html( join(fields, U+241F) ) ) with whitespace collapsed )` over the *rule-bearing* fields only:

| Venue | Fields hashed | Notes |
|---|---|---|
| Polymarket | `description`, `resolutionSource`, `endDate` | description is plain text |
| Kalshi | `rules_primary`, `rules_secondary`, `close_time` (plus event `settlement_sources` when linked) | the first market returned by the default `/markets` listing was a multivariate combo with empty `rules_primary`; with `mve_filter=exclude`, 100 of 100 markets had rules (measured) |
| Limitless | `description` (HTML stripped), `expirationTimestamp` (ms epoch; `expirationDate` is a display string) | description embeds instance values in some recurring markets ("Price to Beat ... was USD 80935.81" in a 5-minute BTC market); those go to `params`, and the *template hash* is pinned instead |
| XO | `rules` (description and `outcomeRules`), `resolutionSources`, `resolverAddress`, `expiresAt` from the **detail** route (list rows have `rules: {}`) | `versionId` changes are a cheap pre-check |

**Measured determinism (H, this session):** 292 market pairs fetched twice about 235 s apart (Polymarket 80, Kalshi 100, Limitless 72, XO 40): raw hash unchanged in 292 of 292 and normalised hash unchanged in 292 of 292. This shows the chosen field lists contain no volatile fields. It says **nothing about drift rate over days**, which is NOT MEASURED; the drift hooks that exist natively are Limitless `externalRulesWatch.rulesHash`, XO `versionId`, Kalshi `last_updated_ts` and Polymarket `umaResolutionStatus` [16 §7.8].

### 3.5 Judge output schema (structured output; one object per Judgement)

```json
{
  "verdict": "link | no_link | abstain",
  "relation": "identity | complement | partition_member | exclusive_member | ladder_threshold | ladder_date | touch_vs_terminal | implication | joint | duplicate_same_venue | factor | cross_asset | none",
  "direction": "a_implies_b | b_implies_a | both | none",
  "frames": { "a": "<ClaimFrame>", "b": "<ClaimFrame>" },
  "outcome_map": [ { "a_index": 0, "b_index": 0, "map": "same | inverse | not_comparable" } ],
  "basis_class": "identical | settlement_window | settlement_source | different",
  "axes": [ { "axis": "timing | source | void_policy | tie_rule | other_fallback | early_close | condition_scope | reference_index",
              "a_value": "string", "b_value": "string", "a_quote": "string", "b_quote": "string", "severity": "minor | major | fatal" } ],
  "cutoff_delta_hours": 5.0,
  "exceptions": [ { "side": "a | b | both", "clause": "string", "quote": "string" } ],
  "unresolved_slots": [ "void_on_cancel@b" ],
  "counterexample_attempt": "at most 300 characters: a concrete state in which the legs pay differently, or why none exists",
  "reason": "at most 200 characters"
}
```

Rules enforced by code after parsing: every `*_quote` must be a substring of the normalised source field; `cutoff_delta_hours` is recomputed from the frames and a mismatch is an abstain; `verdict = link` with a non-empty `unresolved_slots` is downgraded to `abstain` for any tier above `indicative`; any `fatal` axis forces `no_link`. The **calibrated confidence** attached to a link is never the model's own: it is the empirical precision (with a Wilson bound) of the link's vote-pattern bin on the gold set (section 12). Request mechanics on current models: `output_config.format` structured output (no forced tool use), instruction prefix identical across calls so it can be cached where it reaches the minimum cacheable length, Batch API for backfills.

---

## 4. Pipeline

### 4.1 Stage table

| Stage | Input | Output | Method | Runs |
|---|---|---|---|---|
| S0 Ingest and normalise | venue adapters | `Market`, `RuleDoc` | public GETs; Kalshi `mve_filter=exclude`; XO types 2 and 4 plus detail fetch for rules; Polymarket Data API v2; drop multivariate combos and markets living under about 24 h from the semantic path | offline |
| S1 Template compression | `RuleDoc` | `Template` ids, instance params | mask numbers, dates, entities; one signature per series; link *templates* once, instantiate per market with hash checks | offline |
| S2 Claim extraction | `RuleDoc` | `ClaimFrame` | template extractor where a template exists; else LLM extraction (structured output) with quote verification; venue fields (`strike_type`, `floor_strike`, `settlement_sources`, `outcomeRules`) override model guesses | offline |
| S3 Candidate generation | `ClaimFrame`s | `Candidate`s | union of: native keys; cross-search through the other venue's search (Polymarket `public-search`); BM25 over title plus rules; embeddings of (title plus rules) and an entity-masked variant; soft structural scoring (category, date compatibility, entity overlap); set candidates by native group | offline |
| S4 Judge cascade | `Candidate` | `Judgement`s | J1 Haiku 5.5 screen; J2 Sonnet 5.5 full-rules structured diff; J3 Opus 5.5 independent second vote; probes (section 6.2) | offline |
| S5 Deterministic comparator and vetoes | two `ClaimFrame`s plus `Judgement` | agree, abstain or veto | code derives relation and axes from frames; entity, operator, threshold, window, orientation, quote checks | offline (and a subset in plugin) |
| S6 Set assembly | verified pairs plus native groups | `Cluster` | union-find over verified links; one set-level judge call per cluster for partition, ladder and lattice typing | offline |
| S7 Consistency validation | `Cluster`, `Link`s | LP certificate or rejection | satisfiability of the relation graph, forced-true/false detection, price-consistency scoring, dual certificate | offline; reduced form in plugin |
| S8 Human review | surviving proposals | `Review`, state change | PR or issue per link or cluster (section 6.4) | offline |
| S9 Publish | verified objects | signed `Release` plus revocation feed | stripped records (ids, pins, relation, axes), Ed25519 signature | static host |
| S10 Runtime verify | `Release` plus live legs | `ok` or `suspended` with reasons | re-read legs, recompute pins, check status and flags | plugin |
| S11 Runtime edge | verified link plus live books | tiered label, net edge, size | fee-adjusted depth walk, closed forms, small LP (section 8) | plugin |
| S12 Monitor | settlements, reviews, canaries | calibration, demotions | settled-agreement checks, Beta updates, reviewer audit | offline |

### 4.2 Why S1 exists (new-market volume)

Measured 2026-10-18 about 19:38 UTC (H): XO had 407 ACTIVE rows of types 2 and 4, **61 created in the last 24 h and 114 in the last 7 days** (currently-active rows only, so an undercount); Kalshi had **at least 6,000** non-multivariate open markets created in the last 24 h (pagination capped at six pages of 1,000, incomplete); the 100 newest open Polymarket markets by `createdAt` span 0.14 hours (an indicator of recurring short-dated crypto series, not a steady rate). Judging every new market individually is neither affordable nor useful at Kalshi or Polymarket volume (see section 10.2); it only makes sense for XO anchors. Crude template signatures (numbers, dates and capitalised entities masked) compress the samples by about 1.6 to 3.0 times (Kalshi 100 markets to 33 signatures, Polymarket 60 to 38, Limitless 60 to 34 including 8 empty, XO 40 to 17), and far more at corpus scale given that two Kalshi series made up 1,108 of 2,400 sampled events [16 §1]. **Decision:** anchors are XO markets plus a *demand-driven, liquidity-gated* set elsewhere (top markets by 24 h volume, any market that is a member of a watched cluster); everything else is compressed to templates.

### 4.3 Rule-clause prevalence (why the diff must compare slot values)

Measured on live rule text by a crude regex lexicon (H for the counts; the lexicon is imperfect, for example "draw" is a football outcome label): share of sampled markets whose rules contain each clause family.

| Clause family | Polymarket (n = 80) | Kalshi (n = 100) | Limitless (n = 65 with text) | XO (n = 40) |
|---|---|---|---|---|
| cancel or void | 70% | 32% | 49% | 98% |
| postponed or rescheduled | 70% | 40% | 26% | 98% |
| 50-50, refund, fair price, last traded | 64% | 8% | 79% | 0% |
| tie rule | 19% | 8% | 45% | 93% |
| "Other" fallback | 14% | 0% | 0% | 0% |
| consensus of credible reporting | 60% | 0% | 0% | 5% |
| named source | 73% | 0% | 48% | 100% |
| time-zone token present | 80% (ET only) | 52% (ET, EDT) | 86% (ET and UTC) | 98% (UTC only) |
| two or more substantive families (excluding source and time zone) | 84% | 40% | 51% | 98% |
| none of the void-type families (void, postpone, refund, tie, fallback, early close, death) | 20% (n = 60, first 1,500 chars) | 60% (n = 100, full text) | 25% (n = 52, first 1,500 chars) | 2.5% (n = 40) |

Consequences: (a) a "flag if a clause is present" tripwire would fire on almost everything; the comparator must compare *values* of each slot across the two sides (Polymarket NFL: postponed stays open, canceled resolves 50-50; Kalshi fair price after 48 h; XO void if abandoned or postponed beyond 14 days [17 §2.5, 16 §7.9a]); (b) Kalshi's silence is common, but silence in the market text does not mean no rule (the rulebook governs), hence R7: slot resolution order is market text, event or series text, platform registry default, else `unknown`; (c) the cutoff-offset axis is structural: XO writes UTC, Polymarket and Kalshi write ET, about 5 hours apart, in all six rule-level pairs read [16 §7.9c].

### 4.4 S3 candidate-generation details

- **Native keys first** (silver positives and strong candidates): Limitless `metadata.externalSlug` (23 of 25 in a fresh page; 8 of 8 probed slugs resolved on Gamma) [16 V], Predict.fun `polymarketConditionIds` and `kalshiMarketTicker`, Probable's Polymarket route, XO `eventId` and `eventSlug` from the public liquidity-rewards earning-pools (14 of 15 rows) [16 V-K4]; Limitless sports markets expose `homeTeam`, `awayTeam` and `outcomeLabels` for orientation (91 and 13 markets) [17 V2.2].
- **Cross-search** because Kalshi has no search endpoint: build a local index from `/events` (and milestones) once; query Polymarket via `public-search` (0.3 to 0.5 s per call) [16 §7.2].
- **Embedding inputs:** (i) title plus first 600 characters of rules; (ii) the same with entities and numbers masked, so "same template, different entity" neighbours surface *as negatives to be judged* instead of hiding; (iii) outcome label list. Use the union of top-k from BM25 and from embeddings (k = 20 per anchor, k = 5 for intra-cluster completion). Model choice is replaceable and pinned in the dataset (a local 90 MB MiniLM was used by two OSS matchers; 3-large was used in the one published pipeline [16 §7.3]).
- **No hard date blocking.** A 1.5-day expiry gate cost 7 of 32 true counterparts in the XO sample, including a pair whose expiries differ by six months [16 §7.9b]; date compatibility is a soft score, and date differences become `ladder_date` candidates.
- **Set candidates:** native groups (Polymarket event, Kalshi event, XO `rootEventSlug`) are expanded as sets (XO five-way FOMC vs Polymarket five-market event; UCL triples vs Kalshi three-outcome event) so one set-level judge call replaces n(n-1)/2 pair calls [16 §7.5].

---

## 5. Relationship types: detection and constraints

Notation. For a contract j: YES ask `a`, bid `b`, per-share fee `phi_j(p)` at price p (venue curve, read per market), lock rate `lam = rho T / 365`, per-share legging reserve `eps`, per-share axis haircut `delta`. Atoms `Omega` are the joint states; `A[w][j]` is contract j's payout in atom w. A market is *one* contract with a bid and an ask: selling YES at b equals buying NO at 1 - b on mirrored-book venues, and the NO book must not be counted as extra liquidity [15 §2, 17 §2.2].

**Taxonomy mapping** (this design's names to [15 §3] types, [16 §2] codes and the pmxt enum):

| Design name | [15] | [16] | pmxt |
|---|---|---|---|
| `identity`, `duplicate_same_venue` | (a) | R1 | identity |
| `complement` | (b1) across markets | R2 | complement |
| `partition_member` | (b2) | R4 | none |
| `exclusive_member` | (b3), (f) | R3 | disjoint |
| `ladder_threshold`, `ladder_date`, `touch_vs_terminal` | (c) | R5, R6 | none |
| `implication` | (d) | R7 | subset, superset |
| `joint` | (e) | R10 | overlap |
| `factor`, `cross_asset` | (g), (h) | R8, R9 | none |

Types (a) to (f) reduce to the convex-hull test; (g) and (h) are signals with zero guaranteed profit [15 V1.3].

### 5.1 Generic LP (all types)

```
variables  x_jl in [0, qa_jl]  shares bought at ask level l          y_jl in [0, qb_jl]  shares sold at bid level l      t
buy cost   cb_jl = a_jl + phi_j(a_jl) + lam * a_jl + eps
sell proc  cs_jl = b_jl - phi_j(b_jl) - lam * (1 - b_jl) - eps          (short collateral is 1 - b)
maximize   t
s.t.       t <= sum_j A[w][j] * ( sum_l x_jl - sum_l y_jl ) - sum_jl cb_jl x_jl + sum_jl cs_jl y_jl      for every w in Omega_base U Omega_axes
           optional budget:  sum_jl (a_jl + phi_j(a_jl)) x_jl + sum_jl (1 - b_jl) y_jl <= K
```

`t* > 0` iff a guaranteed profit exists; the dual variables of the state rows form a probability vector pi over atoms (the **coherent price vector**: `b_j <= E_pi[A_j] <= a_j` at the optimum), logged as a no-arbitrage certificate when `t* = 0` [15 §4.2]. Fees depend on price level, not quantity, so the program stays linear; lots, ticks and Kalshi order-level rounding are re-checked on the rounded lot after the LP [15 §4.4]. `Omega_axes` are the void and divergence rows generated from the link's typed axes (section 7.2). The reference solver (exact rational simplex, about 60 lines) is in [15 App. A]; I extracted and ran it unmodified for section 8.4.

### 5.2 Per-type detection, veto checks, atoms and constraints

**T1 `identity` (same payoff in all non-axis states).**
- *Semantic detection:* frames equal on subject, outcome kind, operator and inclusivity, threshold (value and unit), window end up to a declared tz offset, universe labels, orientation; judge classifies `identity` with `basis_class` and axes.
- *Code vetoes:* subject alias-fold mismatch; operator or threshold differs; direction word conflict (cut vs hike, maintain vs cut); end-date differs by more than the tz offset (becomes `ladder_date`); orientation unresolved or disagreeing with the venue-field resolver; touch vs close-above (pmxt's own `identity` example is this false identity [16 §5.3]).
- *Atoms:* `{E: A=B=1}`, `{not E: A=B=0}` plus axis rows: for each axis one row where the two legs disagree (A=1, B=0 and A=0, B=1 as the axis permits) and void rows with the declared void payoff (fair price = current mid; 0.5; refund).
- *Constraint:* `b_A - a_B - phi_A(b_A) - phi_B(a_B) <= 0` in both directions (equivalently the complement form buy YES on A and NO on B costs at least 1 net of fees). *Actionable edge* must exceed `lam + eps + delta`; otherwise it is `indicative`.

**T2 `complement` (A is the negation of B, for example "X wins" vs "X loses", or opposite head-to-head orientation).**
- *Detect:* same frame with `yes_means` inverse; *veto:* a draw or third outcome exists (Draw vs team-win is `different_outcome`, not complement) [17 §2.5 pattern 4].
- *Atoms:* `{A=1,B=0}`, `{A=0,B=1}` plus void rows. *Constraint:* `a_A + a_B + phi >= 1 >= b_A + b_B - phi`.

**T3 `partition_member` (exactly one of n resolves YES).**
- *Detect:* set-level judge on the native group; `exhaustive` must be `proven` or `by_rule` for the long basket (Polymarket non-augmented `negRisk` plus a quoted default clause such as "No IPO by December 31, 2027" or "lowest bracket"); placeholders and augmented "Other" mean named outcomes only, short basket only [AD §5.2]. XO `neg_risk` is always false, so XO decision sets are partitions *by rule text*, not by flag.
- *Atoms:* `w_1..w_n` (plus `w_other` if not exhaustive, plus void rows); `A[w_i][j] = 1 if i = j`.
- *Constraint:* `sum_i (a_i + phi_i) >= 1 >= sum_i (b_i - phi_i)`; long edge `1 - sum a_i - sum phi_i - lam sum(a_i + phi_i) - n eps`; short edge `sum b_i - 1 - sum phi_i - ...`.

**T4 `exclusive_member` (at most one; not exhaustive, including exclusivity across different events).**
- *Detect:* Kalshi `mutually_exclusive` or text; *never* infer exhaustiveness. *Atoms:* as T3 plus `w_none`. *Constraint:* `sum_i (b_i - phi_i) <= 1` is the only guaranteed row; the long basket is **not** riskless (the 10 net-positive Kalshi buy-side sets were all two-leg state or House races whose exhaustiveness could not be proven, and one State Senate rule says a tie resolves every leg to No) [17 §0.2].

**T5 `ladder_threshold` (G_k = "X above k").**
- *Detect:* equal subject, window, source; numeric strike differs; operator direction determined *before* applying constraints (the first Kalshi scan produced two false flags by sorting on strike alone) [16 §4]. Venue fields (`strike_type`, `floor_strike`) override model guesses.
- *Atoms:* intervals `I_0..I_K`, plus tie atoms when the operator is `>` vs `>=` and the underlying is discrete. *Constraint:* for k1 < k2, `p(G_k1) >= p(G_k2)`; edge `b(G_k2) - a(G_k1) - phi - phi`. Buckets are differences: `p(B[k1,k2)) = p(G_k1) - p(G_k2)`; a cumulative ladder together with a bucket partition on the same date is one LP (23 atoms for 22 contracts in the measured Polymarket BTC example) [15 §6.3].

**T6 `ladder_date` and the two-axis lattice (touch markets).**
- *Detect:* equal strike and operator; windows nested; *cumulative* ("by D", increasing) vs *survival* ("continues through D", decreasing) from the question text and Kalshi `early_close_condition`; point-in-time ("above X on D") is **not** monotone in D [17 §1.4].
- *Atoms:* first-passage intervals `tau <= T_1`, `T_1 < tau <= T_2`, ..., `tau > T_n`. *Constraints:* cumulative `p(T1) <= p(T2)`, survival reversed. For an up-touch lattice `(k, T)` ("reach k by T"): `p(k2, T2) <= p(k1, T1)` whenever `k1 <= k2` and `T1 >= T2` (the second rung is at least as hard on both axes); any other pair is **incomparable** ("ETH 2,900 by Oct 31" vs "ETH 3,000 by Dec 31" has a higher strike but a later deadline, so it gets no constraint) [16 §2, §7.9b]. Touch dominates terminal: `H(k,T) >= G(k,T)` [15 §3.3].
- *Tier:* inside one source and clock these are the only relations that are payoff-space risk-free besides T3; the announcement-vs-occurrence trap (incident R3 in [15 §8.1]) must be an explicit slot.

**T7 `implication` (A subset of B, one direction).**
- *Detect:* judge must quote the necessary-condition clause, enumerate exception states (withdrawn candidate, replacement nominee, void) and attempt a counterexample (the polyclaw contract [16 §6.1]); LLM-proposed dependencies confirm rarely: 13 hand-confirmed of 374 that passed a formal subset checker (3.5%), out of 1,576 LLM-labelled dependent among 46,360 pairs [15 §3.4, 16 §6.2].
- *Atoms:* `{A and B}`, `{not A and B}`, `{not A and not B}`. *Constraint:* `p_A <= p_B`; edge `b_A - a_B - phi_A - phi_B`. Cross-venue subset (media call vs inauguration) is usable in one direction only [15 §3.4]. Tier: `hedged` unless the implication holds in both contract texts including edge states.

**T8 `joint` (C = A and B).** Fréchet: `max(0, p_A + p_B - 1) <= p_C <= min(p_A, p_B)`. Deferred: combos are RFQ quotes with last look, three legs mean three fees, and Kalshi cross-game parlays are systematically overpriced relative to leg products [15 §3.5, V3.5]. Out of MVP.

**T9 `duplicate_same_venue`.** Identity inside one venue (XO type 2 vs type 4, same question): detects creation-lint duplicates [AD §11 AGG-3]; not an arbitrage source (same custody), but a cross-venue link to one copy is not a link to the other [16 V-K3].

**T10 `factor` and `cross_asset`.** No rows; LP value is zero by construction. Stored as cluster membership with correlation features (hourly polling; gate on quote-change counts: median leg has 408 changes in 57 days; show change share next to every correlation) [18 §0, §4]. Cross-asset examples (digital vs listed options, Fed decision vs futures, sports vs vig-free odds) are basis trades with model-dependent conversion, never arbitrage [15 §3.8].

### 5.3 Reduced forms the plugin runs without a simplex

Identity pair `e_net = b_B - a_A - phi_A(a_A) - phi_B(b_B) - lam(a_A + 1 - b_B) - eps - delta - g/q`; partition long and short edges above; ladder and implication `e_net = b_hard - a_easy - phi_hard - phi_easy - lam(...) - eps`. A general simplex (at most 30 variables, exact rationals via `BigInt`) is phase 2.

### 5.4 Batching interrelated markets and the correlation layer (the user's second ask)

Clusters are built bottom-up in four tiers, each with a different guarantee: (1) **native groups** (Polymarket event and `negRisk`, Kalshi event and milestone, XO `rootEventSlug`, Limitless group) give membership only; (2) **verified constraint clusters** (partition, ladder, lattice, cross-venue set) built from reviewed links and carrying an LP certificate; (3) **identity bundles** across venues for the same claim (injective per venue, R5), used to form a coherent reference price from the dual vector and from executable bid/ask intervals; (4) **factor clusters** (shared underlying or driver: BTC rungs and ETH rungs, rates and politics) that carry no constraint. Only tiers 2 and 3 can produce a non-`indicative` discrepancy. Tier 4 produces features: hourly correlation and basis tags for a cluster, each shown with its quote-change share and its spread, fee and lock-adjusted return, because the measured structure is real only at horizons of one day or longer (daily rho 0.5 to 0.97; out-of-sample hedge variance reduction 34% to 97%), is thin below one hour, and never beat round-trip costs [18 §4]. Polling cadence: hourly for factor tags; 1 to 5 minutes only for spot-linked legs and the nearer ladder rung; keep own history (Polymarket serves 1-minute data for about 7 days; XO has no usable history) [18 §4, §2.10]. The one intra-venue source of net-positive episodes was a Kalshi identity (rate above a level vs hike 25 plus hike more than 25: 42 of 8,640 five-minute bins, up to 5.5 cents, depth unknown); `pm_get_cluster` watches such identities live rather than inferring them from correlation [18 §2.7].

---

## 6. Preventing false links

### 6.1 Failure patterns observed and the specific defence

| Observed false-link pattern (evidence) | Share in audits | Defence |
|---|---|---|
| Same template, different entity (Golden Boot Diaz vs Haaland; Rubio vs Wiles; Mamdani vs Hansen; The Odyssey vs Digger) | 26 of 35 false in the random audit; 1 of 13 in the positive-edge census [17 §2.5] | frame-level subject comparison with alias folding; entity-masked retrieval variant so look-alikes are *seen and judged*; entity-swap probe |
| Near-identical wording, different scope (OpenAI vs Anthropic IPO bank; EPL/La Liga vs UCL golden boot; ballot vs win) | 6 and 8 | scope slots in frame (competition, institution, office); `condition_scope` axis defaults to *fatal* unless equal |
| Same question, different deadline (Comey Jan vs Jul) | 2 and 1 | window comparator makes it `ladder_date`, never `identity`; section 8.4 shows a mis-typed identity fabricates a sure profit |
| Opposite direction or different bracket (ECB hike vs decrease; Bank of Korea Maintain vs 25 bps cut, the largest apparent edge: 158,984 bps on USD 5.90) | 1 and 3 | operator and direction slots; direction-flip probe |
| Orientation inversion (A vs B - B) | not in final audit; produced edges of 2,000 to 489,503 bps while building [17 §2.5] | orientation resolver from structured fields (Limitless `homeTeam`, Kalshi suffix, XO outcome index) must equal the judge's `outcome_map` |
| Minor rule differences among true links (cancel/postpone/tie/source/cut-off) | 14 of 43 true links; 7 to 8 of the 17 profitable true links when labelled consistently [17 V2.6] | typed axes, never ignored; slot-value comparison (section 4.3) |
| Many-to-many reuse | one market in 30 pairs [17 V2.3] | R5 injectivity |
| State vs event, announcement vs occurrence, death clause (incidents R1 to R3 in [15 §8.1]) | selected incidents | `outcome_kind` equality, `exceptions[]` slot, `condition_scope` fatal by default |

### 6.2 Layered defences

1. **Quote-verified extraction.** Every slot span must be found in the normalised text; failing slots are removed; a frame with fewer than the required slots for its `outcome_kind` abstains.
2. **Code comparator as the second key.** `compare(frameA, frameB)` returns per slot `same`, `alias`, `ordered`, `different`, `unknown` and derives a relation code. The judge's relation must equal the derived relation; a disagreement is an abstain, not a majority vote.
3. **Vote diversity.** Sonnet 5.5 and Opus 5.5 are called with different prompt variants and A/B orderings; Haiku 5.5 votes at the screen. Sampling parameters cannot be tuned on current models (non-default `temperature` and `top_p` return 400 on Sonnet 5.5 and Haiku 5.5, are removed on Opus 5.5), thinking cannot be disabled on Opus 5.5, and forced `tool_choice` is a 400 on Sonnet 5.5 and Opus 5.5, so diversity comes from model, prompt variant and ordering, and structure comes from `output_config.format` (structured outputs) rather than tool forcing [claude-api skill, cached 2026-10-06]. Unanimity is required on relation, direction, outcome map and the *set* of axes.
4. **Metamorphic probes** run on every link that survives J3, against the same J2 model and prompt that produced the verdict (a weaker model would test the wrong judge; about USD 3 to 9 extra for the XO backfill, section 10.2), five per link: (i) replace the entity in B with a sibling entity from the same series: must be `no_link`; (ii) step the threshold one rung: must become `ladder_threshold` or `no_link`; (iii) shift the deadline: `ladder_date` or `no_link`; (iv) swap A and B: same verdict, inverse maps; (v) flip the operator or direction word: `no_link`. A failed probe rejects the link; two failures within one template suspend the template and its approved links pending re-calibration.
5. **Deterministic gates on numbers, dates and direction** (the 16/17 gates), now applied to frames: equal threshold and unit, no direction conflict, window equal after tz arithmetic.
6. **Orientation resolver** (section above).
7. **Price tripwire (veto only).** Verified-true cross-venue edges in the census were 5 to 246 bps net (median 46, p90 164); the low- and mid-similarity bins, which are dominated by false links, had median net edges of 637 and 2,059 bps, and the 72 pairs above 5,000 bps were all false or low-similarity links [17 §2.4, §2.6]. Rule (D): for any link claiming `identity` where net edge exceeds **300 bps**, mark `tripwire`, force a fresh hash and status verify, an orientation re-check and a second-reviewer flag before any label above `indicative`; above **1,000 bps** quarantine the link as presumed false (or a stale quote). Thresholds are D and recalibrated from data.
8. **Human review** (6.4).
9. **Hash pins and auto-suspend** (recipe in 3.4, runtime check by `pm_verify_link` in 9.3).
10. **Settlement-based demotion.** A verified link whose legs settle differently is suspended, added as a negative to the gold set, and its axis posterior updated. Agreement is weak evidence on rarely-true markets, so it is used for monitoring, not for approval [16 §8].

### 6.3 State machine

```
proposed -> screened (J1 pass) -> judged (J2 + J3 unanimous, comparator agrees, probes pass)
         -> reviewed_1 (one human) -> verified (pins stored; tier_cap = hedged or indicative)
         -> executable_eligible (second reviewer + axes empty + objective settlement + D2 global criteria)
any state -> suspended (pin mismatch, tripwire, probe failure, settlement mismatch, revocation) -> reviewed again or rejected
any state -> expired (valid_until)
```

Transitions into `verified` and above are the only ones that reach the shipped dataset.

### 6.4 Review process

- **Queue item** = one link or one cluster as a PR or issue containing: both rule texts side by side with extracted slots highlighted and their quotes, the code comparator table, the judge's axes, probe results, prior decisions on the same template, price statistics and the tripwire state.
- **Blind and canary controls:** 20% of items are shown *without* the judge verdict (blind); 5% are seeded known-false canaries drawn from the regression suite; reviewer miss rate on canaries is tracked per reviewer and reported with a Wilson bound. This addresses anchoring and rubber-stamping.
- **Two-key for `executable_eligible`** and for any cluster whose long basket depends on `exhaustive = by_rule`.
- **Why a human remains necessary:** if pre-review precision is 0.90 and a reviewer catches 90% of false links, post-review precision is 0.989; at 0.80 and 80% it is only 0.952 (arithmetic, not a finding), and reviewer catch rate is exactly what is not measured yet.

### 6.5 Adversarial look-alikes

XO is permissionless: a creator can write a market whose title and rules induce an identity verdict against a Polymarket market while naming the creator as resolver (`resolverAddress` is creator-specified and resolution is MANUAL for all sampled rows) [AD §3.4, 10 V12]. Bounds: XO pairs are `settlement_source` by default and capped at `hedged`; type-4 (user-created Conviction) markets are never auto-linked and need an explicit reviewer note on creator and resolver; pins include `resolver_id`, so a resolver swap suspends the link.

---

## 7. Quantifying resolution risk

### 7.1 Model

For a link with axes `a_1..a_m`, each axis has a trigger probability `pi_a` (the adverse-divergence event: the two legs pay differently), a loss `L_a` per share in that event (up to 1), and an LP row that materialises the event. Two outputs: **(i) robust** guaranteed profit `t*` with all axis rows present (for any unhedged cross-venue pair the worst row is negative, so a robust LP prints no riskless pair, matching the worked example where the "arbitrage" vanished once a void row was added [15 §4.7 case D]); **(ii) expected** haircut `delta = sum_a pi_a L_a` (first-order; `1 - prod (1 - pi_a)` for the probability) used for the tier decision and for sizing the loss budget (maximum loss is notional, capped by the per-order cap). A pair breaks even when the adverse probability equals its net edge `e = 1 - C` [AD §5.6].

### 7.2 Axis catalog, void-row templates and priors

Priors are **D** unless a source is given; they are starting Beta means with pseudo-count n0 = 20 and are overwritten by data (7.3).

| Axis | Void/adverse rows added to Omega | Prior pi (source) | Notes |
|---|---|---|---|
| none (identical, no axes) | (A=1,B=0), (A=0,B=1) | 0.12% (18 of 14,885 settled differently in 7 days, fixture-matched, mostly sports) [16 §5.2] | easy case; sports dominate |
| `void_policy` | void_A: A pays declared void payoff `v_A` (fair price = mid, 0.5, refund) while B resolves normally; void_B symmetric | cancellation or long postponement rate: Polymarket 0.41% of protocol-resolved conditions paid 50-50 [15 §7]; D 0.5% for sports | Kalshi fair price after 48 h vs XO void after 14 days vs Polymarket stays open |
| `timing` (cutoff offset `delta_h`) | the qualifying event falls inside the offset window: (A=1,B=0) or reverse | read from the market's own date ladder where available: `F(T + delta_h) - F(T)`; else D 1% to 2% [AD §5.6] | UTC vs ET is about 5 h in all six rule-level pairs [16 §7.9c] |
| `source` | sources disagree: (A=1,B=0), (A=0,B=1) | station-sensitive: NYC Central Park vs LaGuardia agreement 32.4% (M); Binance vs Chainlink same side about 85% for 5-minute BTC [15 §3.8, §8.1]; XO MANUAL vs UMA or exchange D 5% | re-read `settlement_sources` every refresh |
| `tie_rule` / `other_fallback` | tie row, "Other" row | D 0.5% to 2% by sport and market | Nigerian Senate tie-break, Polymarket "Other" fallbacks [17 §2.5] |
| `early_close` | resolves before the other leg's window | D 1% | `can_close_early` on Kalshi |
| `condition_scope` (exception clause) | exception row: A pays 1, B pays last-traded or 0 (Khamenei: 1.00 vs 0.02) | base rate of the exception over the horizon (for example death) times `L = 0.98`; *fatal* if only one side has the clause | embeddings miss these |
| `reference_index` | index disagreement row | D 15% for 5-minute crypto contracts | [15 §3.8] |

**Lock-up and dispute tail are timing, not payoff, risk** and enter `lam`: `T = T0 + P(dispute) Delta`. Polymarket UMA dispute incidence is roughly 1.0% of proposals over the whole adapter history, 7.6% of the top 1,000 closed 2026 markets by volume (16.2% of volume), about 20% in the top 100, 27% in geopolitics-keyword markets and 1.2% in sports-style markets; disputed markets close a median 100 h after the end date versus 3.6 h undisputed [15 §7, V1.13]. The 8% annual hurdle used in earlier examples is an assumption; a measured settlement wedge exists (arXiv 2605.31431) and should replace it [15 V1.9].

### 7.3 Calibration loop

Each axis signature (sorted axis names and severities) keeps a Beta(`alpha`, `beta`) with mean `pi` and pseudo-count 20. After each settled link: `alpha += 1` if the legs paid differently, else `beta += 1`. Until at least 30 settlements exist for a signature, use the 80th percentile of the posterior as `pi` (conservative). Axis-free links on mid-priced markets inform most; near-certain markets settle the same by default and carry little signal, so updates are weighted by `4 p (1 - p)` of the pre-event mid.

### 7.4 Tier consequences

`indicative`: any axis with severity `fatal`, any `unknown` slot, any fee or void policy unresolved. `hedged`: all axes priced and the robust LP or expected edge positive with a loss budget. `executable`: axes empty after review, objective settlement on both legs, D2 criteria.

---

## 8. Executable edge from depth and fees

### 8.1 Procedure (plugin, per verified link)

1. Verify pins (section 9.3). On failure return `suspended` with reasons and stop.
2. Read both legs' books in parallel; sort explicitly (4 conventions); derive the complement book only by mirroring and mark `derived: complement`; reject synthetic books for execution labels.
3. Read fee parameters at quote time (never defaults): Polymarket `feeSchedule` per market; Kalshi series `fee_type` and `fee_multiplier` plus event overrides; XO `effectiveFeeConfig.takerFeeBps` (use `max` of the two disagreeing XO sources until a real fill reconciles them) [AD §3.3]; Limitless table; unknown model fails closed.
4. Build `cb`/`cs` columns (section 5.1) with per-level fees, `lam`, `eps`; add axis rows; solve (closed form for pairs, ladders and partitions; LP otherwise).
5. Walk both ladders together and stop at the marginal level where `e_net <= tau` (D: 0.5 cent per share); size to the least of the cap, displayed depth at `tau` and the smaller leg.
6. Emit tier, net edge per share, size, capital, lock-adjusted APR, coherent price vector, reasons for any downgrade.

Break-even gross spread at mid prices is `(theta_A + theta_B)/4`: 2.75 cents for XO at 400 bps plus Kalshi at 0.07; 2.0 to 3.5 cents within one Polymarket venue [AD §5.0]. Fee exposure measured: on Kalshi mutually-exclusive sets fees were 4.9 times the gross edge (USD 1,413.5 vs 289.0) [17 §0.1]. Taker delays (XO 0.5 to 3 s, Limitless 1.25 s), ghost fills on Polymarket and non-atomic legs enter `eps` and the legging scenarios, not the pair maths [17 V3, 15 V3.2].

### 8.2 Sizing at the author's caps

At USD 10 per order a leg is about 31 shares; in [AD §5.1] Example 1 (6-cent gross gap) the net is about USD 0.72 per capped pair, and any fixed friction above a few tens of cents (gas, bridge, rebalancing) removes it. Link quality therefore matters for *information value*, not P&L.

### 8.3 Mirrored-book and fee-curve discipline

Never add the NO book as extra liquidity; fetch YES and NO books in the same instant or derive NO, because independent fetches skewed by minutes produced a fake "bid sum 1.06" and only 15 of 25 identical mirrors versus 24 of 25 back-to-back [17 §2.2]. Use listing quotes only as a pre-screen (the best ask disagreed with the book by more than 1 cent for 7.1% of Kalshi and 5.5% of Polymarket markets after about 15 minutes; 3.8% and 3.3% after 6 to 8 minutes) [17 §0, V1].

### 8.4 What I verified (H, this session)

Using the exact rational reference solver from [15 App. A] on the repo fixture `xo_kalshi_ucl_top_of_book_2026-10-18.json` (real top of book and sizes, 2026-10-18 18:15Z; 17 complete XO-vs-Kalshi matches, 6 contracts each, 3 outcome atoms):

| Check | Result |
|---|---|
| Gross LP over the 17 matches | 0 positive; largest single-outcome cross-venue (bid minus opposite ask) = 0.0 |
| With fees (XO 400 bps, Kalshi 0.07, both sides) | 0 positive |
| With 6 void rows (Kalshi voids at mid while XO resolves; XO voids at mid while Kalshi resolves) | 0 positive; guaranteed profit exactly 0 |
| Dual (coherent probabilities) for Real Madrid vs RB Leipzig (outcomes RBL, RMA, draw) | 0.10, 0.77, 0.13, summing to 1; each inside both venues' spreads |
| Mis-typed link (synthetic prices, NOT live): Limitless "before Jan 1" YES ask 0.20 vs Kalshi "before Jul 1" YES bid 0.30 | typed as `identity`: guaranteed profit USD 10.00 on 100 shares (phantom); typed as `ladder_date`: USD 0.00 |

The last row is the whole argument for typing links before any price is looked at. Relation-compiler checks (brute-force state enumeration, n at most 20): partition of 3 gives 3 states; 3-rung ladder gives 4; touch-dominates-terminal gives 3; "A implies B plus A,B exclusive" forces A false (reject); "partition plus A equals B" has zero states (reject); the XO five-way FOMC set linked by five identity links to Polymarket's five-way event gives exactly 5 states.

---

## 9. What runs inside the plugin versus offline or hosted

### 9.1 Plugin constraints that bind this design (H, [06 §2], [04 §8.2], [AD §1.1])

Single-file ESM `plugin.mjs` at most 10 MiB; 10 s per operation including startup; 256 KiB stdout; 64 KiB sample args; fresh sandbox per call, no storage, no user identity; at most 16 exact HTTPS hosts; GET and POST only; byte-reproducible build; env vars plain and owner-level; every published version needs MoonPay approval. Precedent for in-plugin signature verification: `paybox-tribunal` verifies an Ed25519 certificate with `node:crypto` (read by a researcher; not exercised in the hosted sandbox) [05 §2.8]. If `node:crypto` is unavailable the bundle ships a small pure-JS SHA-256 and Ed25519 verifier; the conformance sample call must be offline.

### 9.2 Split

| Capability | Plugin | Offline indexer | Hosted static |
|---|---|---|---|
| Venue reads, book normalisation, fee-adjusted depth walk | yes | | |
| Pin recomputation and status/flag checks (S10) | yes | | |
| Closed-form pair, partition, ladder, implication checks; small LP | yes | | |
| Coherent reference prices (dual) for a cluster | yes (small clusters) | yes (large) | |
| Template extraction (regex families) | optional | yes | |
| LLM extraction, judging, probes, embeddings, BM25 | no | yes | |
| Review queue, gold set, calibration, canaries | no | yes | |
| Dataset signing | verify only | sign | serve |
| Revocation feed | fetch | publish | serve |
| Quotient calls | no (agent pays) [AD §7] | calibration logging | |

Why no LLM in the plugin: 10 s, a fresh sandbox, the owner's key would pay for every user call, nondeterminism, and attacker-written market text would reach a model that can influence a financial label [16 §10.2].

### 9.3 Plugin tools for this subsystem (reuse [AD §9], add one)

| Tool | Reads | Output (all read-only, text wrapped as `Untrusted`) |
|---|---|---|
| `pm_lookup_links` | dataset only | links and candidates for a market with state, tier cap, axes, pins; candidates labelled `indicative` |
| `pm_verify_link` | the link's legs | recompute pins; compare status, close time, `versionId`/`rulesHash`, resolver, flags; return `ok` or `suspended` with reasons |
| `pm_get_cluster` (new) | dataset plus legs | the batch of interrelated markets: members, relation graph, exhaustiveness, consistency status, coherent reference prices, signal-only correlation tags |
| `pm_check_structure` | within-venue legs | partition, complement and ladder checks, labelled mid vs executable |
| `pm_compare_market` | XO plus twins | relation, basis, axes, both books, indicative discrepancy, reference price |
| `pm_find_edge` | up to 8 hosts | page of verified links evaluated through section 8 |

**Per-call capacity (H, measured from this machine, not from a PayBox sandbox):** single-market GET latency p50 sequential: Polymarket 0.06 s, XO 0.24 s, Limitless 0.40 s, Kalshi 0.79 s; median payload 2.3 to 5.3 KB. Verifying one link costs about 0.3 to 1.1 s of detail reads plus one book read per leg (book latency not measured here; assumed comparable to the detail GETs), so roughly four links per call sequentially inside an 8 s budget and about twice that with parallel legs, subject to per-host limits (XO orderbook 5 requests per second public) [AD §8.2]. Parallel-fetch speed-up could not be measured because my client throttled to 0.3 s between request starts.

### 9.4 Dataset delivery (options A then B)

- **Option A (MVP): bundled `links.json`** in the plugin, regenerated per release. Zero new hosts, zero runtime trust; links go stale between releases but the runtime pin check bounds the damage.
- **Option B: signed static dataset plus revocation feed** on one extra allowlisted host. Record format as in 3.3 with evidence stripped. **Measured size (synthetic but realistic records with random 32-byte hashes, H):** about 490 bytes raw and 125 bytes gzipped per link, so 300 KB gzip holds about 2,400 links and 1 MiB gzip about 8,000. The XO-anchored verified set is estimated at 100 to 250 links (D; from 32 findable non-sports counterparts of 98, 5 of 8 on the type-4 sample, and 54 football outcomes), so size is not a constraint; shard by venue pair if breadth grows. Ed25519 signature over canonical JSON, public key baked into the plugin with a key id for rotation by release. `valid_until` default 24 h; if the host is down the plugin falls back to the bundled snapshot until its TTL (D: 7 days) and then to `indicative` only. The revocation feed is a few KB listing `link_id`s and reasons; it covers what the plugin cannot see (a link found wrong by review or settlement).
- **Kalshi terms:** the Developer Agreement v1.1 bars caching, aggregating or storing API data and facilitating other members' trading; whether a dataset of tickers and hashes is covered is open. Ship **ids and hashes, never Kalshi rule text**; keep evidence quotes in the private review repo; gate the Kalshi adapter behind a build flag [AD §10, 16 §13].
- **Quotient join:** links carry `quotient_key` for covered legs; join only on `identity` links with axes limited to `timing` below 24 h; otherwise label "related, not equivalent" [AD §7, 12 §5.4].

---

## 10. Cost

### 10.1 Unit assumptions

Prices (USD per 1M tokens, claude-api skill table cached 2026-10-06 and [16 §10.3]): Haiku 5.5 input 0.10 output 0.50 (prompts up to 100K); Sonnet 5.5 2 and 10; Opus 5.5 4 and 20; batch API 50% off; cache reads about 0.1 times input (a shared prefix must reach the model's minimum cacheable length, so I do not rely on caching below). Embeddings (OpenAI page, [16 §7.3]): 3-small 0.02, 3-large 0.13. Rule tokens by chars/4 on live rule text (this session): Polymarket 288 (n = 80), Kalshi 190 (n = 100), Limitless 299 (n = 65), XO 494 (n = 40); consistent with the 278, 236 and 486 in [16 §10.3]. Instruction plus schema 700 tokens; J1 prompt 700 + 360 input and 80 output; J2 prompt 700 + both rule texts + 120 input; **output tokens bill thinking**: 150 (the earlier note), 450 or 1,050 (Sonnet) and 1,350 (Opus) are reported as low, mid, high [16 V-K9].

### 10.2 Results (arithmetic, my script `cost.py`; the probe rows were computed with the same assumptions in a short inline calculation)

| Item | Cost |
|---|---|
| Embeddings, XO 421 active (300 tokens each) | USD 0.003 (3-small), USD 0.016 (3-large) |
| Embeddings, full corpus 145k markets (Polymarket 13.2k, Kalshi 130k, XO, Limitless) | USD 0.87 (3-small), USD 5.66 (3-large), one-off |
| XO-anchored backfill, screen and judges only: 421 anchors x k = 20 = 8,420 pairs; 10% survive J1 (D); 30% of those survive J2 (D), batch, no caching | low USD 3.78, mid USD 5.80, high USD 10.60 |
| Probes: 5 Sonnet calls on each J3 survivor (about 253 links) | USD 2.97 / 4.87 / 8.65 |
| Backfill total including probes | USD 6.75 / 10.67 / 19.26, that is USD 16 / 25 / 46 per 1,000 anchors; without batch USD 13.51 / 21.34 / 38.52 |
| Same, steady state at 16 to 61 new XO anchors per day | about USD 0.26 to 2.79 per day |
| Flat single-model alternative (every market against k = 5 candidates, full rules, no cascade, no cache, no batch) per 1,000 markets | Haiku USD 1.02 / 1.77 / 3.27; Sonnet USD 20.48 / 35.48 / 65.48 (low / mid / high) |
| Set-level judge (one call per cluster, about 3,000 input tokens) | about USD 0.02 per cluster at Sonnet rates |
| If every new Kalshi market (at least 6,000 per day) were an anchor | USD 96 to 274 per day at the same per-anchor cost, which is why anchors are demand-driven and templated |

The survival fractions are assumptions: in the XO 98-market experiment 54 of about 1,960 hypothetical top-20 candidates (2.8%) were even related, so 10% at J1 is generous [16 §7.9b]. Plugin-side runtime cost is zero (no model calls).

### 10.3 Reviewer time (NOT MEASURED)

Model: items = J3 survivors grouped into links and clusters; time per item 3 to 5 minutes for a clean identical pair, 10 to 15 for a pair with axes or a set (D). Scenario A yields roughly 253 J3 survivors before grouping; at 150 to 250 items that is about 8 to 20 reviewer-hours for the first XO backfill and a few minutes per day thereafter. These are hypotheses to be replaced by timings recorded in shadow mode (section 12).

---

## 11. Failure modes

| # | Failure mode | Consequence | Detection and handling |
|---|---|---|---|
| F1 | Judge confuses same-template entities or directions | fake arbitrage | comparator veto, probes, entity-masked retrieval; regression suite is a CI gate |
| F2 | Judge and extractor correlated errors (same model family) | unanimity illusory | different models and prompt variants; canaries; periodic cross-lab sample check with another vendor model offline |
| F3 | Model or prompt change shifts behaviour | silent precision drop | pin `model_id`, `prompt_sha`, schema version in every Judgement; frozen regression plus sealed test on every change; verified links never auto-flip, they suspend |
| F4 | Prompt injection in market text | forced `link` verdicts | delimiters, no tools, structured output only, quote verification, human review, HTML escaped |
| F5 | Verbalised confidence mistaken for probability | miscalibrated queue | confidence is never used; vote pattern binned against gold with Wilson bounds |
| F6 | Rule text edited after approval | stale link | pin mismatch suspends; `versionId`, `rulesHash`, `last_updated_ts` pre-checks |
| F7 | Silent slots treated as equal | missed void divergence | R7 resolution order; `unknown` blocks tiers |
| F8 | Template-level approval leaks to a new instance with a different rule | bulk false links | instance params compared; template hash plus per-instance rule hash; first N instances of every template fully reviewed |
| F9 | Many-to-many reuse | duplicate counting, fake multi-link edge | R5 injectivity; cluster-level dedupe |
| F10 | Exhaustiveness assumed | long basket loses | `exhaustive` is proven or by_rule only; Kalshi never proven |
| F11 | Stale or crossed quotes mistaken for edge | fake edge | verify books at quote time; staleness is unobservable from public GETs (timestamps behave like snapshot times) [17 V2.1], so require fresh reads and treat tripwire as escalation |
| F12 | Fee model drift | wrong sign | read per market; unknown fails closed; fee sensitivity: 5 to 164 bps true-link edges sit inside the Polymarket sports 0.03 vs 0.05 and Limitless token-fee uncertainty [17 V2.7] |
| F13 | Legging and ghost fills | one-sided fill | `eps`, leg order, unwind plan [AD §6.3]; revert state in scenarios [15 V3.2] |
| F14 | Dataset host down or tampered | no links or forged links | bundled snapshot, signature, TTL, fail closed to indicative |
| F15 | Reviewer fatigue, anchoring | rubber-stamping | blind subset, canaries, two-key on top tier |
| F16 | Adversarial XO look-alike markets | bait for hedged tier | section 6.5 |
| F17 | Kalshi or Quotient terms | legal exposure | ids and hashes only; flags; written permission before shared caching |
| F18 | Prediction-market time-zone arithmetic | wrong windows | code, not model, converts `end_local_text` to UTC |
| F19 | New market flood (Kalshi at least 6,000 per day) | unaffordable or irrelevant judging | demand-driven anchors, templates, liquidity gate |
| F20 | Survivorship in gold set (only surfaced pairs labelled) | inflated recall | random negatives and periodic random-pair audit; sealed test |
| F21 | LP with a wrong relation gives phantom profit | fake arbitrage | typed-first (section 8.4), satisfiability checks, tripwire |
| F22 | Third-party service death | none (not depended on) | optional adapters only [14 §8.3] |

---

## 12. Evaluation plan

### 12.1 Stage targets and expectations

Expected values are hypotheses (D) except where an anchor is given. Nothing above `indicative` ships without the gate in the last column.

| Stage | Metric | Anchor evidence | Expectation | Gate |
|---|---|---|---|---|
| Template extractors (UCL triples, decision sets, crypto ladders) | link precision | 18 of 18 top-1 (Wilson 0.82 to 1.00) [16 §7.9a] | at least 0.98 on templated families | 100% of regression positives; reviewer audit |
| Retrieval | recall at k = 20 of true counterparts | 99.9% in the published pipeline (not replicated) [16 §6.2]; our tf-idf linker found 393 of 475 declared mirrors at any similarity and 56% at sim at least 0.45 [17 §2.5] | 0.90 to 0.99 for BM25 union embedding | at least 0.95 on the silver set before J1 is tuned |
| J1 screen | recall of gold positives | | at least 0.98 (liberal by design) | measured on gold |
| J2 plus J3 plus comparator plus probes | precision of `link` verdicts, pre-review | gated token matcher 0.625 strict and 0.875 lenient out of sample (n = 8) [16 V-K2]; "below 2% false positives" in a candidate stream with undefined final precision [16 §6.2] | 0.85 to 0.95 (hypothesis); **not accepted as a standalone gate** | reported with Wilson lower bounds per vote pattern |
| Human review | post-review precision of `verified` links | arithmetic in 6.4 | at least 0.98 | Wilson lower bound at least 0.95 for `hedged` (n = 73 with 0 errors or 110 with 1) and at least 0.97 for `executable_eligible` (n = 125 or 185) on a second-labeller audit |
| End-to-end | recall of verified set against gold positives in the retrieval pool | 32 of 98 XO non-sports markets have a title-level counterpart | 0.50 to 0.85, limited by abstains and review throughput | none (precision is the constraint) |

Required labelled counts (my arithmetic, 95% Wilson lower bound on precision, observed errors e): LB at least 0.90 needs n = 35, 53, 69, 84 for e = 0, 1, 2, 3; at least 0.95 needs 73, 110, 142, 173; at least 0.97 needs 125, 185, 239, 290; at least 0.98 with zero errors needs 189; at least 0.99 needs 381. Current evidence supports only: 23 of 23 gives LB 0.857; 18 of 18 gives 0.824; 5 of 8 gives 0.306. The earlier promotion rule (200 or more gold links per class, LB at least 0.97) corresponds to at most one error in about 185.

### 12.2 Gold-set procedure

1. **Sampling frame = pairs the system would surface**, not random pairs (random pairs are almost all true negatives) [16 §8]. Strata: venue pair x claimed relation x vote pattern (3 of 3, 2 of 3, template-deterministic) x similarity band x category. Plus an independent random negative sample (e.g., 200 random same-category pairs) to estimate false-negative leakage, and 100% of native-key pairs.
2. **Phase G1 (target about 480 labelled pairs):** about 240 `link` verdicts across relation types (at least 30 per major cell; per-cell n of 30 gives a CI width of about 0.19 at 95% observed precision, n of 60 about 0.12), about 240 rejected or abstained.
3. **Labelling protocol:** two independent labellers per positive-stratum pair (and 20% of negatives), blind to the judge, labelling relation, `basis_class`, axes with severity, outcome map and the three void slots from raw rule texts side by side. Adjudication by a third. Target Cohen's kappa at least 0.8 on relation and outcome map, at least 0.7 on axes (an observed agreement of 0.90 with chance 0.55 gives kappa 0.78).
4. **Silver labels (free):** Limitless declared mirrors (475 to 483 usable depending on the snapshot), Predict.fun and Probable refs, the 17 UCL triples, settled-differently pairs as negatives. Silver sets measure recall only.
5. **Seeds from the repo:** the 108 XO-vs-Polymarket pairs, 78 audited links and 30 census links are single-rater and title- or snippet-level, and the gates were designed after seeing them, so they are **dev and regression only**, never the test set [16 V-K2, 17 V2.6].
6. **Sealed test:** at least 100 fresh pairs labelled after freezing `model_id`, `prompt_sha` and gate code; reusable once per freeze; any change draws a new sample.
7. **Shadow mode before enabling any tier:** four weeks of pipeline output to the queue only, recording reviewer acceptance rate, time per item (the missing number) and canary miss rate.
8. **Ongoing:** weekly re-label of 20 random verified links, canary injection at 5%, settled-agreement scan, drift scan on pins.

### 12.3 Adversarial regression suite (CI gate; expected verdicts)

Negatives (must be `no_link`, `ladder_*` or `abstain`, never `identity`): ECB hike 25 bps vs "decrease 25 bps"; Bank of Korea Maintain vs 25 bps cut; Mamdani vs Hansen (Person of the Year); The Odyssey vs Digger (Best Picture); OpenAI vs Anthropic IPO lead bank; EPL/La Liga vs Champions League golden boot; ballot vs win; Comey case dismissed before Jan vs Jul; ETH USD 2,900 by Oct 31 vs USD 3,000 by Dec 31 (incomparable); "win the election" vs "advance"; first-to-leave vs leaves-by; touch vs close above (the pmxt example); Draw vs team-win; orientation inversion (A vs B - B); survival vs cumulative date wording; Khamenei out (death clause: must carry a `condition_scope` axis, severity fatal); shutdown state vs new-event semantics; NYC Central Park vs LaGuardia (source axis). Positives (must be `identity` with expected axes): the 18 UCL matches (expected axes: `void_policy`, Kalshi fair price after 48 h vs XO void after 14 days, and `source`, UEFA/clubs vs ESPN/Fox; Kalshi `close_time` is two days after XO `expiresAt` while `expected_expiration_time` equals it), Limitless mirrors with known rule differences, the Rubio, Yamal and Beshear census links (rule differences recorded). Required pass rate: 100% on negatives, at least 90% on positives, any miss blocks a prompt or model change.

### 12.4 Metrics reported

Precision with Wilson lower bound per vote pattern, per relation, per venue pair; recall against silver and gold; abstain rate; kappa; reviewer time; canary miss rate; probe failure rate; cost-weighted miss (false-link rate x notional x residual loss, bounded by the per-order cap); settlement agreement by axis signature.

---

## 13. MVP and what to cut

### 13.1 MVP (aligned with AGG-0 and AGG-1 [AD §11])

| Component | MVP scope |
|---|---|
| Indexer | offline CLI run from Claude Code by the developer; XO-anchored (407 active type-2 and type-4 rows, 421 across types 0 to 4; 61 created in the last 24 h); sources: Polymarket `public-search`, a local Kalshi `/events` index, Limitless native keys |
| Retrieval | BM25 plus embeddings in memory (brute-force cosine; 421 queries); no vector store |
| Extraction | template extractors for UCL triples, central-bank decision sets, "Hit USD K by date" ladders; LLM extraction elsewhere |
| Judge | Sonnet 5.5 (structured output) plus Opus 5.5 second vote; Haiku screen optional; probes; comparator and vetoes |
| Review | PR or issue per link; blind subset and canaries from day one (cheap) |
| Dataset | bundled `links.json` (Option A) |
| Plugin | `pm_lookup_links`, `pm_verify_link`, `pm_compare_market`, `pm_check_structure`; closed-form pair, partition and ladder checks; tiers `indicative` and `hedged` only |
| Evaluation | regression suite, shadow mode, gold set G1 started |

### 13.2 Cut for the MVP (and why)

| Cut | Reason |
|---|---|
| Hosted indexer, vector DB | XO-anchored volume is hundreds of markets; cost about USD 7 to 19 per backfill |
| Signed dataset, revocation feed, extra host | not needed until the registry outgrows releases; saves a host slot and a key-custody task |
| Set-level judge and cluster LP certificates | UCL triples and decision sets come from templates; one-off reviewer check |
| General simplex in the plugin | closed forms cover pair, partition and ladder; add when cross-venue cluster LPs matter |
| Kalshi-wide corpus indexing | at least 6,000 new markets per day, mostly templated ladders; legal flag |
| `executable` tier | D2 not satisfiable until the gold set exists and two real XO fills reconcile fees |
| Learned calibration (Beta updates, vote-pattern bins) | needs settled data; use fixed unanimity plus tripwire |
| `joint`, `factor`, `cross_asset` types | no guaranteed profit; combos are RFQ quotes |
| Automatic re-judging on drift | manual: pin mismatch suspends, a human re-reviews |
| Quotient join automation | optional signal; legal gate [AD D4] |

### 13.3 Phases

P0 (before any code): regression suite, claim-frame schema, hash recipe, alias tables (UCL clubs, central banks, tickers). P1: MVP above; shadow mode. P2: set-level judge, LP in plugin, signed dataset, gold set G1 complete, Kalshi and Limitless breadth with template compression. P3: `executable` tier after D2, factor/correlation signal layer, settlement-based calibration.

---

## 14. Risks, open questions and decisions for the author

**Biggest risks.** (1) A false link that survives review prints a fake arbitrage; mitigated by two keys, probes, tripwire, tier caps, but the reviewer catch rate is unmeasured. (2) Evidence of precision is thin: the only out-of-sample number is 5 of 8. (3) Reviewer capacity is the binding resource and its cost is unknown. (4) The value ceiling is low: at USD 10 per order the edge is cents, and the measured taker edge is near zero; the project must be judged by reference-price and structure value. (5) Legal surface of storing venue data and of automated reading (Kalshi agreement, XO scraping clause, Quotient terms). (6) PayBox constraints outside this design (portal access, signature acceptance, host budget).

**Open questions.** Does XO plan an events or series endpoint (today `rootEventSlug` needs one detail request per market)? Should UTC-vs-ET pairs be excluded from arbitrage or priced? Is the Kalshi dataset of ids and hashes permitted? What is real reviewer time per link? What is the actual drift rate of venue rule text over days (only a 4-minute determinism check exists)? Does retrieval recall at k = 20 hold on our corpus?

**Decisions only the author can make.** Who reviews and with what authority; whether a hosted static dataset host is acceptable (one extra allowlisted host and a signing key); whether sending public market text to a model API is acceptable (it is public text; contractual terms for the judge vendor are a separate check); whether the product is positioned as reference-price and structure tooling rather than arbitrage; whether to publish the links dataset publicly (ids and hashes only) or keep it private.

---

## 15. Sources, measurements and limits

**Repo notes relied on:** `docs/plan.md`; `docs/aggregation-design.md`; `docs/phase0-gate-results.md` (headline sections); `docs/research/14` to `18` with Verification sections; `docs/research/10` (§4 pipeline, §5 gates), `05` (§2.8 in-plugin Ed25519 verification precedent), `04`/`06` (plugin limits via [AD]); fixtures in `docs/research/fixtures/linking/` (`audit_sample_labeled.json`, `audit_results.json`, `false_link_patterns.json`, `xo_kalshi_ucl_top_of_book_2026-10-18.json`, `pop_platform_registry.*`). Model prices and API constraints from the `claude-api` skill table cached 2026-10-06.

**My measurements (this session, 2026-10-18 about 19:30 to 19:40 UTC; public unauthenticated GETs only; neutral User-Agent `research-readonly/1.0`; at least 0.3 s between request starts per host; requests per host about: Gamma 26, Kalshi 30, Limitless 28, XO 112; no 429 or errors). Scripts (stdlib only, run with `python3 -I`) are in the session scratchpad, not the repo, and are ephemeral:**
`<scratch>/b-semantic-first/` : `probe.py` (hash determinism, rule length, clause prevalence, verifier latency; output `probe_result.json`), `newrate.py` (new-market rate; `newrate_result.json`), `relcheck.py` (relation compiler and LP checks; uses `lp.py` extracted from [15 App. A]), `stats.py` (Wilson sizes), `cost.py` (cost model).

| Measurement | Sample | Limitation |
|---|---|---|
| Rule-hash determinism | 292 pairs (PM 80, Kalshi 100, Limitless 72, XO 40) twice about 235 s apart: 0 changes | minutes, not days; samples are top-volume and first-page, not random; sports-heavy |
| Rule length and tokens | PM mean 1,154 chars (n = 80), Kalshi 760 (100), Limitless 1,196 (65 with text; 10 empty), XO 1,979 (40) | chars/4, no tokenizer run |
| Clause prevalence | same samples | crude regex lexicon; presence not meaning |
| Verifier latency | 10 sequential single-market GETs per venue | this machine, not the sandbox; parallel speed-up unmeasured |
| New-market rate | XO 61 per 24 h and 114 per 7 d (active only); Kalshi at least 6,000 per 24 h (capped at 6 pages); Polymarket newest 100 span 0.14 h | undercounts and indicators only |
| Template compression | Kalshi 100 to 33, PM 60 to 38, Limitless 60 to 34, XO 40 to 17 | crude masking; small samples |
| LP checks | 17 real XO/Kalshi trios (fixture), synthetic mis-typing example | top of book; one snapshot; void payoff set to mid by assumption |
| Dataset size | synthetic realistic records, random hashes | evidence quotes excluded |
| Cost | arithmetic with stated assumptions | survival fractions and output tokens are assumptions |

**Not found (searched).** A public rule-level labelled equivalence corpus (searched GitHub x10, Hugging Face x3, papers, re-searched by the verifier) [16 §8]; published precision at a threshold for any hosted matcher; a measured reviewer time per link; a measured drift rate of rule text; retrieval recall of embeddings on our corpus; Kalshi anonymous rate limits; XO events endpoint (partial: earning-pools); Trueo grouping.

**Suspicious or agent-directed content seen and not followed:** none new in my own fetches (market descriptions were read as data); prior notes record agent-directed banners in vendor docs and READMEs [16 §13, 14 §14].
