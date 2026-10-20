# Market linking and relationship arbitrage: synthesized design

> **Status (2026-10-19): design only, no code.** Written by the judge of the three-design panel (A structured-first, B semantic-first, C statistical-first in `docs/research/design-panel/`). It scores the designs, picks a winner, grafts the best parts of the runners-up onto it, and specifies the subsystem that decides which prediction markets on which venues are related, how, how far to trust that, and what the executable edge is. Companion to `docs/plan.md` and `docs/aggregation-design.md` (AD). It uses notes 14 to 18 **with their Verification sections, which override the researchers**. This is not legal advice and not a trading recommendation.
>
> **Ground rules observed.** Read-only: I made no network requests, called no PayBox tool, created no account or key, signed nothing, ran no third-party code, read no credential file. Evidence comes from repo files and committed fixtures. The arithmetic I re-ran is listed in Sources (scripts live in the session scratchpad, not the repo, so the key LP numbers are also given with hand arithmetic in section 7). Citations to note sections I did not read in full (for example [15 §5 to §10], [18 §2.2], [14 §2 to §8]) rest on the task digest and on the notes' own Verification sections, which I did read.

**Citation style.** `[NN §x]` is section x of `docs/research/NN-*.md`; `[NN V...]` is an item in that note's Verification section (for example `[16 V-K2]`, `[17 V2.6]`). `[A §x]`, `[B §x]`, `[C §x]` are sections of the three panel designs. `[AD §x]` is `docs/aggregation-design.md`; `[P0 §x]` is `docs/phase0-gate-results.md`.

**Tags.** **H** first-hand: read in a primary source or measured in the cited note and confirmed by that note's verifier, or re-run by me (written "H, judge re-run"). **M** secondary, inferred, or "panel-measured" (measured by a panel author in their own design file and not independently verified). **L** weak or stale. **D** a design default chosen here, to be calibrated, not a finding. "NOT FOUND (searched: ...)" and "NOT MEASURED" mark documented gaps; nothing is filled with a plausible guess.

**Currency.** Today is 2026-10-19; all venue data is from 2026-10-18 snapshots. Flagged possibly stale (older than 2026-04-19): Kalshi Developer Agreement v1.1 (2023), Saguillo et al. (2024-25 data), Portnaya (2023 contract), Tsang and Yang (2024 data), Predict.fun ToS (2025-11-18), Opinion ToS (2025-10-19). `docs/research/venues/*.md` and `docs/venue-census.md` did not exist when I worked, so nothing here depends on them. AD section 0.2 and Appendix B still say notes 15 and 18 have no verification and that "there is no note 17"; that is now out of date (all of 14 to 18 carry verification sections) and should be refreshed by whoever next edits AD.

---

## 0. Decision summary

1. **Winner: Design A (structured-first), 49.5 of 60 weighted points, against 43 for B and 36 for C** (section 1). Precision is double-weighted; A wins on it and on plugin fit, cost and testability, and loses only on recall (to B). The ranking holds if any single criterion is double-weighted instead (section 1.3).
2. **What the product is.** A verified link graph with typed rule differences, structural consistency checks, and fair-value reference prices for XO markets; not a P&L engine. The live-data studies found essentially no net-of-fee within-venue arbitrage (0 of 706 sell-side exclusive sets; 3 ladder rows worth USD 13.4 in total) [17 §0], cross-venue "edge" dominated by false links (all 6 survivors of the generic funnel were false) [17 §2.6], verified-true cross-venue edges of 5 to 246 bps that are long-dated and thin [17 §2.6], and no taker-side lead-lag or statistical edge in 41 relationships [18 §0]. At the author's USD 10 per order cap a capped pair nets cents [AD §5.1].
3. **The one safety property all three designs share, made central.** A false link is a fake arbitrage. A link exists only with a deterministic proof object, a typed rule-difference record, pinned masked rule hashes, and a human approval (once per rule template, once per link outside templates). Similarity, embeddings, LLMs and price statistics may **propose, rank, flag, demote and veto; they may never promote**.
4. **Grafts onto A** (detail in section 16): from B, the rule-text slot semantics (void, postponement, tie, early-close, exception clauses; "silence is not equality"), offline embedding plus LLM retrieval for the long tail routed to review only, metamorphic probes as a regression gate, blind and canary review controls, the signed-dataset path and `pm_get_cluster`; from C, the gap-plausibility veto (as escalation, never approval), a day-0 recorder, the order-polytope shortcut for nested families, and a pre-registered day-90 kill test for any statistical discovery.
5. **Does anything aggregate the platforms themselves?** No single product does in the full sense; closest by dimension are DefiLlama (registry and join key, lists XO and Trueo), Prediction Almanac (schema), ccxt and Predictefy (capability design), AGG, River and Synpath (cross-venue listing links, none covering XO or Trueo). None publishes precision [14 §0, V-A1, V-A4; 16 §5, V-K11]. Section 2.
6. **Batching and correlation.** Interrelated markets are tied together at four levels (venue group, constraint cluster, identity bundle, factor cluster). Only constraint clusters and identity bundles can print an arbitrage-type label. Correlation is real at horizons of one day or longer (daily rho 0.5 to 0.97 on active markets) but no taker edge survives frictions at any horizon; it is a signal and risk layer [18 §0, §4]. Sections 5 and 6.
7. **Plugin.** Stateless, no LLM, no embeddings: it verifies pins, re-reads books, runs closed forms and a small exact LP (at most 30 contracts and 64 atoms), applies fees, depth, lock and reserve, and assigns a tier. Every link-layer tool is read-only and none emits an `io.paybox/transactionProposal`; legs on Kalshi, Polymarket US, MagicMarkets and PredictIt are rendered as manual instructions because PayBox cannot trade them [AD §6.2].
8. **MVP.** Four XO-centred template families, bundled hash-pinned links, closed-form checks plus a small LP, tiers `indicative`, `structural_violation` and (per certified class) `hedged_discrepancy`; no `executable_arbitrage` label until the global D2 criteria hold. Section 12.
9. **Gold-set targets.** A link class prints nothing above `indicative` until the Wilson 95% lower bound on same-question precision (`qLevel`) is at least 0.97 (125 post-freeze labelled links with zero failures, 185 with one). `hedged` additionally needs rule-level precision (`rLevel`) of at least 0.95 (73 with zero failures, 110 with one) and axis-extraction recall of at least 95%; `executable_eligible` needs `rLevel` of at least 0.98 (189 with zero failures) plus D2. Section 13.
10. **What cannot be known yet.** Reviewer time per link, rule-text drift rate over days, recall outside the old linker's candidate pool, the XO fee model, and any real-fill behaviour. Section 15.

---

## 1. Panel scorecard

### 1.1 Scores (1 to 10; weighted total = 2 x precision_safety + recall_coverage + plugin_fit + cost + testability, maximum 60)

| Design | precision_safety (x2) | recall_coverage | plugin_fit | cost | testability | Weighted total /60 | Normalised /10 |
|---|---|---|---|---|---|---|---|
| **A structured-first** | 8.5 | 6 | 8.5 | 9 | 9 | **49.5** | 8.25 |
| **B semantic-first** | 7 | 8 | 8 | 6 | 7 | **43** | 7.17 |
| **C statistical-first** | 7 | 5 | 6 | 5 | 6 | **36** | 6.00 |

Scores are judgements anchored on the evidence below; the evidence-backed facts are marked with citations, the rest is reasoning.

### 1.2 Why, criterion by criterion

**A structured-first.**
- *precision_safety 8.5.* Proof levels P0 to P4 instead of scores; the LLM can only fill slots with verifiable quotes or add flags; exhaustiveness proof levels E0 to E4 close the measured Kalshi "buy every outcome" false positives (10 sets, all two-leg races with no exhaustiveness proof) [17 §2.1]; an orientation proof closes the 2,000 to 47,000 bps artefacts [17 §5.1]; masked rule-hash pins caught the 6 of 81 XO football rows with a different postponement clause with no LLM (panel-measured, M) [A §3.2]. Measured: the frozen slot gate made 41 LINK verdicts with 0 false on 101 pre-labelled pairs (Wilson lower bound 0.914) against 52 of 67 for the old fuzzy linker at similarity at least 0.65 (M, panel-measured, semi-held-out) [A §3.3]. Not higher because: the gate's lexicon was written from the same failure patterns (leakage, acknowledged by A); strict rule-level precision is only 0.76 to 0.80 until the rule-difference stage reclassifies the identical-title/different-rule pairs; that stage is regex families with **unmeasured axis recall**, and "a missed axis is a fake arbitrage"; template-pair approval can propagate one reviewer error to a whole family.
- *recall_coverage 6.* Recall 73% (frozen v4) to 88% (post-hoc v5, in-sample) but **only relative to the pool the old linker surfaced**; outside the pool NOT MEASURED; the old linker itself found only 13% to 56% of Limitless-declared mirrors [17 §2.5]. XO type-4 (user-created) titles are about 8% templated [A §3.1, M]. The MVP covers four families.
- *plugin_fit 8.5.* Everything that must run in the plugin is deterministic and small: parser and lexicon (about 100 to 200 KB gzip, D), gate, rule-difference regexes, SHA-256 pin verifier, closed forms, exact LP, fee models; links at about 0.4 KB each (D). Costs: one XO detail request per market for rules and `rootEventSlug` [16 §3.3]; SHA-256 availability in the hosted sandbox is unverified (M).
- *cost 9.* USD 0 per market for deterministic stages; LLM only on the residual, USD 0.11 to 9.70 per 1,000 markets (lower bounds) versus USD 0.85 to 17.00 for all-pairs LLM-first at k = 5 (H, judge re-run of [16 §10.3]); review unit is the template pair (81 XO football markets collapse to 4 masked templates, panel-measured). Reviewer time is NOT MEASURED.
- *testability 9.* Same inputs plus `parserVersion`, `lexiconVersion`, `templateSetVersion` give byte-identical signatures, verdicts and hashes; every link is explained by slots, hashes and one inequality plus an LP dual certificate; a fresh frozen test split protocol with Wilson targets.

**B semantic-first.**
- *precision_safety 7.* Strong on paper: two keys (judge and code comparator must agree), metamorphic probes, price tripwire, a human on every link, blind and canary review, hash pins. But the cascade's own precision is a hypothesis (0.85 to 0.95 pre-review, "never accepted as a standalone gate"); the only out-of-sample number in the evidence is 5 of 8 for the gated token matcher [16 V-K2]; LLM errors are correlated within a model family; the human catch rate that the design leans on is unmeasured.
- *recall_coverage 8.* The only design that reads language: 32 of 98 XO non-sports markets have a title-level counterpart that deterministic templates cannot reach [16 §7.9b]; BM25 union embedding at k = 20 (the one published pipeline reports 99.9% recall at k = 20, not replicated [16 V]). Expected end-to-end recall of the verified set is 0.50 to 0.85, limited by review throughput (B's own estimate).
- *plugin_fit 8.* Plugin is a verifier only; bundled `links.json` first, signed dataset later; Ed25519 verification has a precedent (`paybox-tribunal`, not exercised in the hosted sandbox) [05 §2.8 via B].
- *cost 6.* Model spend is small (USD 6.75 to 19.26 for the XO-anchored backfill including probes, batch discount; USD 16 to 46 per 1,000 anchors) [B §10.2, M], but review is per link (8 to 20 reviewer-hours for the first XO backfill, a hypothesis) and scales with links, not templates.
- *testability 7.* Thorough (regression suite, probes, sealed test, shadow mode) but LLM outputs are non-deterministic and every model or prompt change forces re-validation; sampling parameters cannot be tuned on current models (B's claim from the Claude API table cached 2026-10-06; not re-checked by me).

**C statistical-first.**
- *precision_safety 7.* The gap-plausibility veto is the best cheap independent check in the panel. I reproduced from the committed fixtures that 17 verified-true positive-edge links have net edge 4.9 to 245.9 bps (median 45.7) and that 28 of 30 audited false positive-edge links exceed 300 bps (H, judge re-run, section 3.3). But it is in-sample (threshold chosen after seeing the data, true maximum 245.9 sits just under the line), and only 3 of the 30 false links have similarity at least 0.65, so part of the separation is a similarity-stratum effect (H, judge re-run). Statistics cannot promote (the asymmetry rule), so C's precision comes from the same structural, LLM and human pipeline as A and B, which C sketches rather than specifies. XO-only statistics are manipulable [C §12].
- *recall_coverage 5.* Structural recall is A-lite. Statistical discovery is high-specificity, low-sensitivity: abs(rho_1d) at least 0.5 in 1 of 510 cross-topic pairs but recovers 9 of 22 hard-linked pairs and 0 of 6 implication pairs (panel-measured, M) [C §1.3 M4]; cold start of 60 to 90 days; XO has no usable history [18 §2.10].
- *plugin_fit 6.* Veto and LP fit. But per-link `PairStats` with a 7-day TTL must ride in the dataset, which forces a signed dataset host early, and a bundled release cadence (every version needs MoonPay approval [AD §1.1]) cannot carry weekly statistics.
- *cost 5.* Hosting and compute are small (USD 5 to 10 per month hosting, L; about USD 15 to 150 per full pass) but the whole statistical stack is large machinery with unproven return, and recording Kalshi quotes collides with the Developer Agreement (stale, L) [AD §10].
- *testability 6.* Best experimental hygiene (pre-registered kill criteria; fit on batch N, score on batch N+1) but regime-dependent statistics (hourly Fed-pair rho 0.015 in the first 42 days versus 0.88 in the last 42 [18 V-C4]) and 60 to 90 days to first evidence.

### 1.3 Sensitivity of the ranking

Unweighted sums: A 41, B 36, C 29. Doubling precision (the brief): 49.5 / 43 / 36. Doubling recall instead: 47 / 44 / 34 (A still first by 3). Doubling cost or testability widens A's lead. **What would change the verdict:** (a) measured reviewer time per instance below about one minute with a canary catch rate of at least 95% would make B's per-link review cheap enough to beat A's template engineering for the long tail; (b) an XO events or group-id endpoint (NOT FOUND, section 15) would lift A's recall; (c) passing C's day-90 test would graduate statistics from veto to candidate generator.

### 1.4 Reconciliation decisions (where the designs disagree)

| Question | A | B | C | Decision here |
|---|---|---|---|---|
| Unit of human review | template pair | each link or cluster | each link | **Template pair for templated families, per link elsewhere; 100% of instances labelled until the class passes its bound, then 10% audit sampling plus every anomaly; the first 5 instances of any new template are fully reviewed (D)** |
| LLM authority | slot-fill with quotes, add-only flags | judge cascade proposes `link`, code must agree | cascade with unanimity | **LLM never promotes. It fills slots (quote must be a substring and re-derive the value), adds flags, and orders the queue. A judge verdict of `link` is a priority signal only** |
| Exhaustiveness | E0 to E4 | proven / by_rule / no / unknown | same as B | **A's five levels; long basket needs E2 or better, and two-key review when only E2 (no venue flag) supports a cross-venue set** |
| Price-based veto | circuit breaker at max(5x(fees+spread), 300 bps) | tripwire 300 bps, quarantine 1,000 bps | quarantine above 300, rule-diff record required at 100 to 300 | **Three bands: at most 100 bps no effect; 100 to 300 bps cap at `hedged` and require a rule-diff record; above 300 bps `quarantined`; above 1,000 bps presumed false. Veto and escalation only** |
| Reserve posterior | Beta, n0 = 20, 90th percentile | Beta, n0 = 20, 80th percentile below 30 settlements | Beta, n0 = 100, 95th percentile | **Beta, n0 = 20; reserve at the 90th percentile for `hedged`, 95th for `executable`; updates weighted by 4p(1-p)** |
| Statistical discovery | cut (log history) | cut | day-90 experiment | **Recorder from day 0; discovery off by default; run C's pre-registered test at day 90** |
| Embeddings and retrieval | cut from MVP | in MVP, offline | recall only | **Offline, XO-anchored, review-only candidates from week 3 of AGG-1; never in the plugin** |
| Dataset delivery | bundle then signed static | same | same, with `PairStats` inside | **Bundle first; signed dataset plus revocation feed in AGG-2; no `PairStats` until day 90 passes** |
| Kalshi data | ids and hashes only | ids and hashes only | `derived_only` recording | **Ids and hashes in any shipped dataset; no raw Kalshi quote storage until written permission; Kalshi read per user on demand** |

---

## 2. What already exists (the "platforms themselves" question)

**Short answer.** Nothing aggregates the platforms in the full sense (one public, machine-readable, regularly verified record of fees, geography, API capabilities, trading reachability, resolution oracle, liquidity and cross-venue links, kept fresh and federating the others) [14 §0, §12]. What exists:

| Layer | Examples (2026-10) | Links markets? | Covers XO / Trueo | Use here |
|---|---|---|---|---|
| Registries and rankings | DefiLlama (133 "Prediction Market" rows, 39 flagged dead; keyless), Prediction Index (314 projects, HTML-embedded JSON, lists dead Dome as live), PM Wisdom (606; API returns a 10-row sample), Prediction Almanac (21 platforms, CC0, best schema) [14 §2, V-B] | No | DefiLlama and Prediction Index list both; Almanac neither | Join key and liveness only; copy the Almanac schema conventions |
| Unified libraries | ccxt (9 prediction exchanges, MIT, 4.5.88 on 2026-10-14), pmxt (15 venues; "All plans are for personal use only"), Synpath (8 venues), AGG (11 venues, cross-venue matching, arbitrage WebSocket, per-venue geo, fee and void data behind an app id) [14 §4, V-A4; 16 V-K6] | pmxt, AGG, Synpath: yes | none | Do not depend; borrow vocabulary (`has` map, `basis_class`, relation enum) |
| Hosted matchers | Kairos, Oddpool, Prediction Hunt, Predictefy, PredictMarketCap, PreDex, SimpleFunctions, Struct [16 §5, V-K11] | Yes | Predictefy only (vendor claim; "Nothing has ever been submitted to XO"; commercial use Enterprise only) [14 V-B; 16 V-K5] | Benchmarks and silver labels, never runtime |
| Cross-venue identifiers | River `generic_asset_id` (platform-curated groups plus an aggregated orderbook), CoinRithm Event ID v1, Limitless `externalSlug`/`rulesHash`, Predict.fun `polymarketConditionIds`/`kalshiMarketTicker` [14 V-A1, V-A4; 16 §3] | Partly | none for XO or Trueo | L0 native hooks only where a venue itself declares them |
| Cross-venue gap feeds (x402) | x402tap, x402-factory, clinkagent, rjhsignaltech [14 V-A5] | Gap only | none | Cross-check at most |
| Mortality | Dome (EOL 2026-04-28), Metaforecast (discontinued 2026-07-09), Fireplace, Parsec, Verso, Converge [14 §8.3] | n/a | n/a | Prior on any third-party dependency: none at runtime |

**Closest by dimension.** Data and join key: DefiLlama. Registry shape: Prediction Almanac. Capability semantics: ccxt and Predictefy `requirements{credentials, funding, geo}`. Execution breadth: ccxt and Synpath. Institutional routing and cross-venue asset groups: River. **The gap that remains for us:** a thin, hand-verified registry (about 10 to 20 platforms) with XO and Trueo records, fee-parameter sources, void and resolution policy, bot policy, PayBox reachability, depth-based liquidity tier, mirror links and `last_verified`/`ttl_days`, where an expired field reads `unknown` and fails closed [14 §9]. XO and Trueo are almost invisible to the aggregator layer, and at least six aggregator-type services died or went dark in 2026 (Dome, Metaforecast, Fireplace, Parsec, Verso, Converge), plus a darked venue and several quiet or archived clients [14 §0 item 5, §8.3].

**Interrelated-market batching that already exists natively** [16 §3, §12; 14 V-A1]:
- *Venue event or group:* Polymarket event and `negRisk`, Kalshi event and `mutually_exclusive` (means "at most one market in this event can resolve to 'yes'", not exhaustive) [16 §3.2], XO `rootEventSlug` (detail route only; list rows lack it) plus `eventId`/`eventSlug` on 14 of 15 public earning-pool rows [16 V-K4], Limitless groups.
- *Venue cluster:* Kalshi milestones (778 of 4,000 sampled span multiple series) [16 §3.2].
- *Cross-venue sets:* provided by nobody for XO or Trueo; River, AGG and Synpath link listings for other venues but publish no precision.
- None of these encodes relation type (threshold versus date ladder), direction, or exhaustiveness. Polymarket `groupItemThreshold` is an ordinal display index, not a strike [16 §3.1, V].
- *Tools that label relations or compute baskets* [15 §10.1, M]: pmxt Router (relation enum identity, complement, subset, superset, overlap, disjoint; black-box matcher; its own "identity" example pairs a touch with a point-in-time close [16 §5.3]), Oddpool (best schema: `basis_class` and `divergence_axes`; two-leg complement only, no latency or partial-fill modelling), Predictefy (uncalibrated cluster similarity; the best published executable-label gate list), oracle3 (implication, exclusivity, complement and event-sum baskets with per-leg fees but no void rows, no lock cost, no depth LP), polyclaw (LLM contrapositive hedges), and the academic line (Saguillo et al., Gebele and Matthes, Zhai and Shi). **Nothing found both registers the platforms with rule-level payoff metadata and solves a joint-state LP with depth, fees, lock-up and void rows** [15 §10.1]. That intersection is what this document specifies.

**Companion document.** `docs/platform-registry-design.md` (written in parallel; I read its summary and section 4 only) specifies the platform registry that feeds stage S1 below. This document consumes it and adopts one of its rules: **independence is counted per liquidity pool, not per venue name** (front ends add no independent price; mirrors such as Limitless, Predict.fun and Probable versus Polymarket are separate books with linked prices), and a manual (X4) or unproven leg caps a label at `hedged_discrepancy`.

---

## 3. Empirical evidence: what was measured, and what it could not show

### 3.1 What the live-data studies measured

All snapshots are single-point on 2026-10-18 (a Sunday evening UTC) unless stated; samples are not random.

| Study | Result (sample size) | Caveats and verifier corrections | Tag |
|---|---|---|---|
| Mutually-exclusive sets, depth-walked with per-venue taker fees [17 §2.1, §2.6, V1] | 706 sell-side sets with full books (24 Polymarket negRisk + 682 Kalshi): 50 gross-positive, **0 net-positive**; fees about 4.9x gross on Kalshi (USD 1,413.5 vs 289.0). Fresh rerun 720 / 54 / 0. Buy-side: 10 Kalshi sets net-positive but none provably exhaustive; Polymarket verified-exhaustive 8: 2 gross, 0 net | Sets chosen by a listing pre-screen (random un-screened 379 sets: 2 gross, 0 net); only 24 Polymarket sets priced; Kalshi exhaustiveness unobservable [17 V4] | H |
| Complement inside one market [17 §2.2] | 0 crossed books in 6,937 fetched; NO book is the exact mirror of YES on Polymarket (24 of 25) and XO (20 of 20); a skewed fetch (about 1.5 to 2 minutes) fabricated "bid sum 1.06" (15 of 25 identical) | Limitless has no NO book; Kalshi one book | H |
| Threshold and date ladders [17 §2.3, V1] | 8,583 families, about 278,000 quoted pairs; 1,849 pairs with books; 10 inverted on books; **3 net-positive worth USD 13.4 total** (fresh rerun 2,164 / 9 / 2, USD 14.45); random 298 Kalshi pairs: 0 violations | Books fetched only for pairs within 2 cents of a violation; cross-venue ladders and partitions never evaluated [17 V6] | H |
| Cross-venue "edge" [17 §2.4, V2.3, V2.4] | 868 link pairs with books, 485 net-positive, median 826 bps, max 158,984 bps (a Bank of Korea "Maintain" vs "25 bps cut" false link) | Counts link pairs, not opportunities: about 293 distinct markets; only 5.2% of Polymarket-involved link records had books on both sides | H with corrections |
| False-link audit [17 §2.5, V2.6] | 78 stratified links plus a 30-link census: strict / lenient precision 18% / 34% at similarity at least 0.45, 72% / 90% at 0.65, 90% / 100% at 0.95; among profitable-looking links at similarity at least 0.65 only 13 of 30 identical (+4 minor-difference, 13 different); 14 of 43 true links (33%) carry a documented rule difference | One rater; 10 to 12 per stratum; label policy for cancel/postponement clauses applied inconsistently, so about 9 to 10 (not 13) of the 17 true positive-edge links are strictly identical | H, single rater |
| Verified-true cross-venue edge [17 §2.6, V2.7] | 17 links: median **46 bps**, p90 164, max 246; capital median USD 991; lock 10 to 751 days; 0 of 13 identical survive tail-leg + persistence + USD 10 + 5% APR filters; the generic funnel's 6 survivors are all false links | Fee uncertainty can flip the sign: Polymarket sports rate 0.03 live vs 0.05 in docs (Yamal pair nets USD 18.95 vs about USD 2.9), Limitless buy fees paid in outcome tokens | H |
| Persistence [17 §2.6] | 187 of 188 net-positive cross rows still positive 10 to 13 minutes later | Standing quotes in illiquid books persist whether or not the link is valid, so persistence is **not** evidence of validity | H |
| Linker recall vs Limitless-declared mirrors [17 §2.5, V2.5] | 56% / 47% / 41% / 22% / 13% at similarity at least 0.45 / 0.55 / 0.65 / 0.75 / 0.85 (475 mirrors) | Describes that tf-idf + SequenceMatcher linker only; the misses are structurally easy | H |
| XO vs Kalshi Champions League [16 §7.9a, V] | 18 of 18 matches linked top-1 (Wilson 0.82 to 1.00); 53 outcomes with two-sided books both venues: median mid gap 0.001 (0.0005 on my recomputation from the fixture), no gross edge either direction | One league, one matchday; XO likely quotes off external prices (inference) | H / M |
| XO non-sports vs Polymarket [16 §7.9b, V-K2] | 98 markets, 32 with a title-level counterpart; plain Jaccard at least 0.5: 25 of 32 (0.78); gated 23 of 23 **in-sample**; on a fresh 83 type-4 markets: 8 gated pairs, **5 of 8 strict (Wilson 0.31 to 0.86)** with one entity-swap false link ("The Odyssey" vs "Digger", Best Picture) | Single labeller, title level; the 98-market set excludes the 166 user-created type-4 markets | H, small n |
| Rule-level read of six title-identical XO/Polymarket pairs [16 §7.9c] | All six carry a cutoff offset (XO 23:59 UTC vs Polymarket 23:59 ET, about 5 hours); some differ in window start or measure | n = 6 | H |
| Independent audit of a matching service [16 §5.2, V-K10] | Kairos: 13,201 of 13,262 pairs aligned (99.5%); 18 of 14,885 settled differently over 7 days (0.12%, Clopper-Pearson upper 0.19%, H judge re-run); sports are 11,985 of 13,262 pairs | Sports are the easy fixture-matched case; audit code shares lineage with the matcher; public `similarity` is constant 1.0 | M |
| Resolution divergence [15 §8.1, §7, V1.13] | Khamenei "out": Polymarket USD 1.00 vs Kalshi USD 0.02; "shut down on Feb 14" vs "new shutdown by Feb 14" paid opposite ways; UMA disputes in 7.6% of the top 1,000 closed 2026 markets by volume (16.2% of volume; about 1.0% of proposals population-wide); disputed markets close a median 100 h after end date vs 3.6 h; 410 of 99,283 conditions paid 50-50 (0.41%) | Selected incidents, not rates; volume-ranked sample | H / M |
| Correlation and lead-lag [18 §0, §2.6, §2.7, V] | 41 relationships, 50 legs: mid unchanged in about 96% to 98% of 5-minute bins; Fed pair rho 0.75 / 0.85 / 0.97 at 5 min / 1 h / 1 day; 0 of 273 follow-the-leader variants net positive (2 cost-model artefacts); share of apparent same-event gap surviving spread 50.6%, fees 9.3%, 5% APR hurdle 3.0%; 17 of 19 strict constraints never violated by more than 1 cent in 84 days; one intra-Kalshi identity net-positive in 42 of 8,640 five-minute bins (depth unknown) | 1-minute Fed lead-lag not identified (alignment); "Polymarket leads only on BTC basis" wrong (also 110k and 120k rungs); "15 to 100x too small" really 2x to 3x for patient BTC variants, still net negative; hourly half-lives biased short 1.3x to 1.6x and regime-dependent; hourly Fed rho 0.015 in the first 42 days vs 0.88 in the last 42 | H |
| Platform landscape [14 §0, V] | See section 2 | Interface-row volume understated about 3x; River refutation; AGG missed | H |
| Panel-measured (not independently verified) | A: frozen gate 41/41 LINK on 101 semi-held-out pairs, recall 73% (88% in-sample v5); 81 XO football markets -> 4 masked templates, 6 deviating. B: rule-hash recipe unchanged on 292 of 292 market pairs fetched about 4 minutes apart; Kalshi rule text silent on void/postpone/tie/refund in 60 of 100 sampled markets vs XO 2.5%. C: abs(rho_1d) at least 0.5 in 1 of 510 cross-topic pairs, recovers 9 of 22 hard-linked and 0 of 6 implication pairs; October FOMC set across XO, Polymarket and Kalshi: best-of-venue sum of asks 1.010, -2.3 cents per set after fees | Single snapshots; same-data leakage acknowledged by A; B's determinism is minutes not days; C's null excludes macro links | M |

### 3.2 What the studies could not show

- **Time.** No time series of edges: how often, how long, around which events. One 40-minute snapshot (17); one 84-day mid series with no depth (18). Polymarket keeps 1-minute history about 7 days; XO has no usable history [18 §2.10]. NOT MEASURED.
- **Recall outside the pool.** All recall numbers are relative to candidates a tf-idf linker or a lexicon surfaced. True recall of any linker is unknown; no public human-labelled rule-level corpus exists (NOT FOUND, searched: GitHub x10, Hugging Face x3, papers, re-searched by the verifier [16 §8, V]).
- **Precision at scale.** Every precision figure is single-rater and small (10 to 12 per stratum; n = 23, 8, 41). No figure supports a lower bound above 0.914. The only out-of-sample number is 5 of 8.
- **Cross-venue structure.** Cross-venue ladders and exhaustive partitions were never priced in studies 16 to 18 [17 V6]; the one cross-venue complete set measured is a panel measurement (October FOMC, M).
- **Staleness.** The "0 stale books" result is vacuous (the flag could never fire; Polymarket book timestamps behave like snapshot times); only "0 crossed" is real [17 V2.1]. Resting-order age is unobservable from public GETs.
- **Execution.** No order was placed anywhere. XO fee truth is unreconciled (`/fee-rate` returns 0; `effectiveFeeConfig.takerFeeBps` is 400 on 92 of 111 linked XO markets and 0 on 19 [17 §1.2]; C saw 0 on the October Fed markets). Taker delays (XO 0.5 to 3 s, Limitless 1.25 s), Polymarket ghost fills (up to 24.3% of transactions in peak hours [15 V3.2]) and Kalshi collateral netting are unmodelled.
- **Rule drift.** Only a 4-minute determinism check of the rule-hash recipe exists (B, M); the drift rate over days is NOT MEASURED.
- **Resolution-divergence rates.** Only two selected incident pairs and a sports-dominated 0.12% settlement-disagreement rate; no XO-versus-other settlement history exists.
- **Reviewer behaviour.** Reviewer time per link, catch rate and agreement are NOT MEASURED (searched: notes 14 to 18, the three designs).
- **Fees and lock-up.** The 8% APY hurdle in note 15 is an assumption; a measured settlement wedge exists (Gebele and Matthes, arXiv 2605.31431) that no design and not I have read [15 V3.1].

### 3.3 What I re-ran (judge, H)

| Check | Result |
|---|---|
| Worked LP example of [15 §4.7], all four cases, with an independent exact weak-duality certificate and (for the 3-state cases) exhaustive enumeration of the dual's vertices | $2.5000 / $0.4406 / $0.0820 / $0.0000 confirmed; duality gap 0 in each case; independent minimum over dual vertices equals the primal in cases A, B, C (section 7) |
| C's gap veto from committed fixtures (`census_true_links.csv`, `audit_sample_labeled.json`) | 17 true links: min 4.9, median 45.7, p90 164.1, max 245.9 bps, none above 250; 30 audited false links with positive best edge: 154.6 to 103,881.6 bps, median 1,474.7; thresholds 250 and 300 flag 28 of 30 and keep 17 of 17; at 200 keeps only 15 of 17; **only 3 of the 30 false links have similarity at least 0.65**; the 7 labelled-X census rows present in the top-140 fixture are 2,509 to 11,313 bps (the other 6 census-X edges are not in committed fixtures) |
| UCL fixture (`xo_kalshi_ucl_top_of_book_2026-10-18.json`) | 53 outcomes two-sided on both venues: median absolute mid gap 0.0005, p90 0.0100, max 0.0100, 0 crossed; 17 complete triples: best-of-venue sum of asks below 1 in 0, sum of bids above 1 in 0 |
| Wilson bounds and sample sizes | 41/41 -> 0.914; 49/49 -> 0.927; 18/18 -> 0.824; 23/23 -> 0.857; 5/8 -> 0.306 to 0.863; zero-failure n for lower bound 0.90 / 0.95 / 0.97 / 0.98 / 0.99 = 35 / 73 / 125 / 189 / 381; one failure 53 / 110 / 185 / 280 / 563; 200 of 200 -> 0.981, 199 of 200 -> 0.972 |
| Cost arithmetic [16 §10.3] | k = 5, 950 in / 150 out tokens per pair: Haiku 5.5 USD 0.85, Sonnet 5.5 USD 17.00, Opus 5.5 USD 34.00 per 1,000 markets; embeddings USD 0.006 and 0.039 per 1,000 at 300 tokens; 330 reviews x 2 to 5 minutes = 11.0 to 27.5 hours. Thinking tokens bill as output, so all are lower bounds [16 V-K9] |
| Beta quantiles for the reserve | Beta(1,19): 90th percentile 11.4%; Beta(1,59): 3.8%; Beta(1,219): 1.05% (closed form 1 - (1-q)^(1/b)) |

---

## 4. Relationship taxonomy and constraint inequalities

**One formalism.** Define the joint state set Omega including void and alternative-resolution states; each contract j has a payoff vector A[., j] over Omega. A price vector is arbitrage-free iff it lies in the convex hull of the payoff vectors: "Arbitrage-free prices are exactly the convex combinations of valid payoff vectors." [15 §0, V0 (Kroer et al.)]. Types (a) to (f) below are state deletions and reduce to this test; types (g) and (h) have no hard constraint and carry zero guaranteed profit [15 V1.3]. Only within-market and within-event identities are riskless in payoff space; cross-venue and cross-event relations depend on rule text, source, clock and void payoff [15 §0 item 2].

**Notation.** For contract j: YES ask `a_j`, bid `b_j`, taker fee per share `phi_j(p)` (venue curve read per market, side-specific if the model is not symmetric), lock rate `lam = rho*T/365` with T the latest plausible resolution including the dispute tail, legging reserve `eps`, axis haircut `delta_l`. `F` denotes the friction bundle `lam*(capital per share) + eps + delta_l` for the leg set. Selling YES at `b` equals buying NO at `1-b` on a mirrored book, so each market is one contract with a bid and an ask and the NO book is never extra liquidity [15 §2].

| Name (code) | Maps to [15 §3] / [16 §2] / pmxt | Constraint on YES prices | Executable edge per share (fee-adjusted) | Atoms (state set) | Proof needed before the relation may carry a label | Risk class |
|---|---|---|---|---|---|---|
| **identity** (`ID`) | (a) / R1 / identity | `p_A = p_B` | sell A, buy B: `b_A - a_B - phi_A(b_A) - phi_B(a_B) - F` (and the mirror); complement form `1 - a_A - a_B^NO - fees` | `{E, notE}` plus divergence rows `(A=1,B=0)`, `(A=0,B=1)` per axis and void rows | P0 to P2 link, orientation proven, rule-diff record | Not riskless. Hedge with reserve unless `axes = []` and the class is gated (no class is yet) |
| **duplicate** (`DUP`) | (a), same venue | `p_A = p_B` | same | no divergence rows if same resolver and equal rule hash | parse equality; XO types 2 and 4 contain duplicates [16 V-K3] | Riskless after fees if rules identical; a cross-venue link to one copy is not a link to the other |
| **complement** (`CMP`) | (b1) / R2 / complement | one market: `a_Y + a_N >= 1 >= b_Y + b_N`; across markets with inverse orientation `p_A + p_B = 1` | a crossing is a data defect (0 of 6,937) | `{Y, N}` | orientation; Draw vs team-win is **not** a complement | Riskless; monitor only |
| **partition** (`PART`) | (b2) / R4 | `sum a_i + sum phi_i >= 1 >= sum b_i - sum phi_i` | long: `1 - sum a_i - sum phi_i(a_i) - F`; short: `sum b_i - 1 - sum phi_i(b_i) - F` | `{w_1..w_n}`, A = identity (plus void rows); cross-venue partitions share atoms and the LP takes the cheapest contract per atom across venues | exhaustiveness E2 to E4 for the long basket (section 6.2) | Riskless if one resolver and exhaustive by rule; cross-venue: hedged |
| **exclusive** (`EXC`) | (b3) / R3 / disjoint | `sum b_i - sum phi_i <= 1` is the only guaranteed row | short: `sum b_i - 1 - sum phi_i(b_i) - F` | `{w_0 (none), w_1..w_n}` | exclusivity only (E1) | Short basket only; long basket never riskless |
| **threshold ladder** (`LAD-T`) | (c) / R5 | k1 < k2: `p(G_k1) >= p(G_k2)`; bucket: `p(B[k1,k2)) = p(G_k1) - p(G_k2)` | `b(G_k2) - a(G_k1) - phi - phi - F` | intervals `(k_s, k_{s+1}]` plus tie atoms when ">" vs ">=" is mixed or the tie rule is unknown | operator and strike from native fields or typed slots; same source and clock | Riskless inside one source and clock |
| **date ladder** (`LAD-D`) | (c) / R6 | cumulative ("by T"): `p(D_T1) <= p(D_T2)` for T1 < T2; survival ("continues through T"): reversed; point-in-time ("on T"): no constraint | cumulative: `b(D_T1) - a(D_T2) - phi - phi - F` | first-passage atoms `tau <= T_1`, `T_1 < tau <= T_2`, ..., `tau > T_m` | polarity proven from text; announcement-vs-occurrence slot | Riskless only if the resolving fact has the same semantics |
| **touch lattice** (`LAT`) | (c) / R5+R6 | up-touch "reach k by T": `p(k2,T2) <= p(k1,T1)` iff `k1 <= k2` and `T1 >= T2`; otherwise **incomparable** ("ETH 2,900 by Oct 31" vs "3,000 by Dec 31") | pairwise on comparable pairs | order-polytope cover rows, O(m) not exponential (M, [C §5.3]) | both axes typed | Riskless on comparable pairs |
| **barrier vs terminal** (`BAR`) | (c) | `p(H_k,T) >= p(G_k,T)` | `b(G_k,T) - a(H_k,T) - phi - phi - F` | as ladder | same reference price and instant | Riskless if reference prices match |
| **implication** (`IMP`) | (d) / R7 / subset | `p_A <= p_B` | `b_A - a_B - phi_A - phi_B - F` | `{AB, notA B, notA notB}` | human-verified implication template quoting the necessary condition and exception states | One-directional; candidate only otherwise (13 of 374 formally consistent LLM-proposed pairs confirmed) [15 §3.4] |
| **exclusive across events** (`XEV`) | (f) / R3 | `p_A + p_B <= 1` (and `>= 1` if also exhaustive) | `b_A + b_B - 1 - phi - phi - F` | `{A notB, notA B, notA notB}` | exclusivity template | Candidate only |
| **joint** (`JNT`) | (e) / R10 / overlap | `max(0, p_A+p_B-1) <= p_C <= min(p_A, p_B)` | upper: buy B, sell C; lower: sell A, sell B, buy C | four atoms | same facts and time | **Deferred past MVP** (RFQ last look, three fees; Kalshi parlays overpriced [15 V3.5]) |
| **factor** (`FAC`), **cross-asset** (`XAS`) | (g), (h) / R8, R9 | none; a present-value digital satisfies `p ~ -dC/dK` (not `e^{rT}` [15 V1.8]) | none (LP value 0 by construction) | none | none | Signal only; never an arbitrage label |

**Basis class and axes (Oddpool vocabulary).** Every cross-venue link carries `basis.class` in `identical | settlement_window | settlement_source | different` and a list of typed axes (section 6.5).

**Ladder polarity and direction are typed before any constraint is applied.** A first Kalshi scan that sorted on strike alone produced two false flags, and survival-wording date ladders produced 63 of 130 first-parser "violations" on Polymarket [17 §2.3, §5.1]. Unknown polarity means no ladder rows.

---

## 5. Data model

Offline store: SQLite or Postgres for the indexer; the plugin receives compiled JSON (`links.json`, `templates.json`, `lexicon.json`, `entities.json`). Identifiers are content-addressed where possible so a revision cannot silently replace a reviewed object. Prices and sizes are decimal strings; arithmetic is `bigint` fixed point or exact rationals [AD §1.2]. `Untrusted<T>` marks creator-written text.

```ts
type Proof     = "P0_native" | "P1_slot_equal" | "P2_template" | "P3_llm_assisted" | "P4_human";
type Verdict   = "LINK" | "ABSTAIN" | "REJECT";
type Exhaust   = "E0_unknown" | "E1_exclusive_only" | "E2_by_rule_clause" | "E3_support_cover" | "E4_template";
type Tier      = "indicative_discrepancy" | "structural_violation" | "hedged_discrepancy"
               | "executable_arbitrage" | "model_edge" | "relative_value_signal";
type Reach     = "X1_proposal" | "X2_sign_and_submit" | "X3_other_paybox" | "X4_manual" | "X5_unsupported";   // AD §6.1 calls these E1 to E5; renamed X1 to X5 here so they cannot be confused with the exhaustiveness levels E0 to E4

interface Venue {                       // registry record, one per platform [14 §9]; every field expires
  platformId: string; externalIds: Record<string,string>;           // defillama_slug etc. (join keys only)
  fee: { model: "price_curve"|"flat_bps"|"tiered"|"none"|"unknown"; paramsSource: string; verifiedOn: string };
  voidPolicyDefault: string; tzConvention: string;                   // added by B: used when market text is silent
  reachability: Reach; recordPolicy: "full" | "derived_only" | "none";  // Polymarket, XO, Limitless: full; Kalshi: none until written permission (C proposed derived_only, only if counsel agrees); ids+hashes only in shipped data
  ttlDays: number; lastVerified: string;                             // past TTL => "unknown" => fail closed
}

interface Market {                      // normalised snapshot, one per (venue, native id, fetch)
  mid: string;                          // `${venue}:${nativeId}` (XO/Poly conditionId, Kalshi ticker, Limitless slug)
  venue: string; title: Untrusted<string>;
  rules: { text: Untrusted<string>; sha256: string; maskedSha256?: string; fields: string[] };
  outcomes: { index: number; role: "yes"|"no"|"label"; label: Untrusted<string>; tokenId: string }[];
  status: string; times: { closeUtc: string; expectedResolutionUtc?: string; latestUtc?: string };
  native: NativeStructure;              // facts the venue states about itself; never parsed from prose
  feeRef: string; creator?: { id: string; allowlisted: boolean }; resolver: { mechanism: string; id?: string };
  prov: { fetchedAtMs: number; source: string; adapterVersion: string };
}

interface NativeStructure {
  groupKind?: "neg_risk"|"mutually_exclusive"|"root_event"|"series"|"milestone"|"ladder"|"group_market";
  groupKey?: string;                    // negRiskMarketID / event_ticker / rootEventSlug / eventId / group slug
  flags: { negRiskAugmented?: boolean; negRiskOther?: boolean; canCloseEarly?: boolean; collateralReturn?: "MECNET"|"DIRECNET"|"" };
  strike?: { type: string; floor?: string; cap?: string };           // Kalshi
  externalRef?: { provider: string; slug?: string; rulesHash?: string };   // Limitless / Predict.fun
  fixture?: { provider: string; id: string };
  voidPolicy: VoidPolicy;               // from native states where possible
}

// Rule-hash recipe (B, measured stable 292/292 over ~4 minutes; drift over days NOT MEASURED):
// sha256( NFKC( strip_html( join(rule-bearing fields, U+241F) ) ) with whitespace collapsed )
// SUPERSEDED in the code by recipe "rules-v2" (pm/links/hash.ts): NO html stripping (a "<x" in the text
// swallowed every later field, so edits there did not change the pin), NFC instead of NFKC (NFKC folds a
// superscript 2 into 2, a different number under one pin), entities decoded once per field, and NFKC kept
// only for the masked template form (mask-v1). Pins made with rules-v1 must be regenerated.
//   Polymarket: description, resolutionSource, endDate | Kalshi: rules_primary, rules_secondary, close_time (+ event settlement_sources)
//   Limitless: description, expirationTimestamp | XO (detail route only): rules, resolutionSources, resolverAddress, expiresAt
// maskedSha256 = same after replacing entity, date, time, number and venue spans with slot markers.

type Slot<T> = { value: T | null; source: "native"|"regex"|"template"|"llm_quoted";
                 basis: "market_text"|"event_text"|"platform_default"|"absent";   // B: silence is not equality
                 span?: [number, number]; quote?: string; validated: boolean };

interface Signature {                   // one per Market; deterministic given parser/lexicon/template versions
  sigId: string; mid: string; parserVersion: string; lexiconVersion: string;
  family: "winner"|"h2h_triple"|"threshold_touch"|"threshold_close"|"date_by"|"decision_bucket"|"range_bucket"|"count"|"binary_event"|"other";
  subject: Slot<string[]>;              // canonical entity ids from the alias registry (not tokens)
  predicate: Slot<string>; comparator: Slot<"gt"|"ge"|"lt"|"le"|"eq"|"between"|"none">;
  threshold: Slot<{ value: string; unit: string } | null>;
  window: Slot<{ startUtc?: string; endUtc: string; endInclusive: boolean; tzDeclared?: string; endLocalText?: string;
                 semantics: "by"|"on"|"during"|"through" }>;                      // UTC derived by CODE, never by a model
  measure: Slot<{ sourceClass: string; touchVsClose: "touch"|"close"|"unknown" }>;
  universe: { n: number; labels: string[]; yesMap: number; exhaustive: Exhaust; placeholders: boolean };
  voidOnCancel: Slot<string>; postponement: Slot<string>; tie: Slot<string>; earlyClose: Slot<string>;
  exceptions: { clause: string; effect: string; span: [number, number] }[];       // death, merger, rename...
  keys: { k0: string; k1: string; k2: string };    // topic family / event / contract hashes of slots, never of text
  unknownSlots: string[];
}

interface Group { gid: string; kind: "partition"|"exclusive"|"ladder_threshold"|"ladder_date"|"bucket_set"|"touch_lattice";
                  members: string[]; exhaustive: Exhaust; proof: { method: string; evidence: string[] };
                  order?: { axis: "strike"|"date"; direction: "asc"|"desc"; ties: "strict"|"inclusive"|"unknown" } }

interface AxisInstance { axis: "timing_cutoff"|"window_start"|"measure_source"|"void_policy"|"tie_break"|"early_close"|"exception_clause"
                         |"other_fallback"|"event_vs_state"|"announcement_vs_occurrence"|"oracle"|"orientation"|"universe"|"reference_index";
                         a: string; b: string; quoteA?: string; quoteB?: string; severity: "minor"|"major"|"fatal"; deltaH?: number }

interface Link {                        // the unit that may be published; superset of [AD §2.5]
  linkId: string; relation: "identity"|"duplicate"|"complement"|"partition_member"|"exclusive_member"|"ladder_threshold"|"ladder_date"
                          |"touch_lattice"|"barrier_vs_terminal"|"implication"|"joint"|"exclusive_cross_event"|"factor"|"cross_asset";
  members: { mid: string; role: string; rulesSha256: string; maskedSha256: string; closeUtc: string; outcomeMap: number[];
             resolverId?: string; nativeVersion?: string }[];                    // pins; a change in any pin suspends the link
  proof: Proof; proofEvidence: string[];                                         // e.g. ["native:limitless.externalSlug","slotEqual:k2","template:T-FB3"]
  basis: { class: "identical"|"settlement_window"|"settlement_source"|"different"; axes: AxisInstance[]; cutoffDeltaH: number };
  templateId?: string; clusterId?: string;
  tierCap: Tier;                        // = min(proof cap, class cap, axis cap, gate result)
  state: "proposed"|"template_approved"|"human_approved"|"executable_eligible"|"quarantined"|"suspended"|"rejected"|"expired";
  reviewers: { id: string; at: string; blind: boolean; decision: string }[];
  validUntil: string;                   // earlier of the two closes, capped at the release's validUntil
  schemaVersion: number;
}

interface Template {                    // human-approved rule-template pair: the unit of review for templated families
  templateId: string; family: string;
  a: { venue: string; matcher: string; maskedSha256: string[] }; b: { venue: string; matcher: string; maskedSha256: string[] };
  slotMap: Record<string,string>; knownAxes: AxisInstance[]; approvedBy: string; approvedAt: string;
  instancesSeen: number; instancesLabelled: number; shadow: { settled: number; diverged: number }; enabledTiers: Tier[];
}

interface Cluster {                     // how interrelated markets are batched (four levels)
  cid: string; kind: "venue_group" | "constraint" | "identity_bundle" | "factor";
  members: string[]; relations: string[];
  atomsSpec?: object; lp?: { hash: string; maxContracts: number; certificate?: { gross: string; dualStatePrices: string[]; checkedAt: string } };
  referencePrice?: Record<string,string>;   // identity bundles: E_pi[A_j] from the dual, i.e. where the contract "should" trade
}

interface GoldLabel { pairId: string; labeler: string; qLevel: boolean; rLevel: boolean; axes: AxisInstance[]; relation: string;
                      outcomeMap: number[]; rulesSha: string[]; quotedFragments: string[]; split: "dev"|"silver"|"cert"|"test_sealed"; ts: string }
interface SettlementObs { linkId: string; payoffs: string[][]; agree: boolean; voidSides: string[]; settleDeltaH: number }
interface Release { releaseId: string; links: Link[]; templates: Template[]; revocations: string[]; validUntil: string; signature?: string }
```

**Four cluster levels (how markets are tied together).**

| Level | Definition | Built from | Can print an arbitrage-type label? | Size limit in plugin |
|---|---|---|---|---|
| `venue_group` | native membership (Polymarket event/negRisk, Kalshi event/milestone, XO `rootEventSlug` or `eventId`, Limitless group) | venue fields | No (membership only) | native |
| `constraint` | connected component over approved hard relations (identity, duplicate, partition, ladder, lattice, implication, exclusive) | verified links at P0 to P2 plus human approval | **Yes** | 30 contracts and 64 atoms |
| `identity_bundle` | the same claim across venues, injective per liquidity pool (one partner per pool per market unless a declared duplicate set; a front end is not a second pool) | verified identity links | **Yes** (hedged); provides the coherent reference price | 30 contracts |
| `factor` | shared driver without a hard relation (BTC and ETH ladders; rates and politics) | tags, entities, optional statistics | **No** (signals; LP value 0) | gated on at least 300 quote changes per leg in 57 days (D; median leg has 408 [18 §2.2]) |

**State machine.** `proposed -> template_approved | human_approved -> executable_eligible`; any state `-> suspended` on a pin mismatch, tripwire, probe failure, settlement mismatch or revocation (leaves `suspended` only by automatic match to the pinned values or a human decision); any state `-> quarantined` on the gap veto; any state `-> rejected | expired`. Only `template_approved` and above reach the shipped dataset.

---

## 6. Detection pipeline

### 6.1 Stage table

| # | Stage | Input -> output | Runs | Authority |
|---|---|---|---|---|
| S0 | Ingest and normalise | venue listings, details, books -> `Market`, rule hashes. Kalshi `mve_filter=exclude`; XO types 2 and 4 plus a detail fetch per market (list rows carry `rules: {}` and no `rootEventSlug`) [16 §3.3]; Polymarket Data API v2; combos and markets under about 24 h excluded from the semantic path | indexer; plugin for the markets in one call | deterministic |
| S1 | Platform facts | `Venue` registry record (fee `paramsSource`, void default, tz convention, reachability, TTL) | repo JSON, compiled into the bundle | hand-verified, fail closed past TTL |
| S2 | Native groups and exhaustiveness | `Market.native` -> `Group` with E-level | both | deterministic |
| S3 | Signature parse | title, rules, native fields, alias registry, lexicon, templates -> `Signature` with provenance and `unknownSlots`. Precedence per slot: native field, then venue template, then generic regex, then offline verified LLM fill, else unknown | both (LLM offline only) | deterministic |
| S4 | Candidate generation | **L0 native hooks** (Limitless `externalSlug`/`rulesHash`, Predict.fun ids, fixture ids, XO earning-pool `eventId`); **L1 hash join** on `k2` (identical), `k1` (ladder or partition siblings), `k0` with different windows (date ladders); **L2 residual retrieval** (Polymarket `public-search`; BM25 union embeddings of title plus rules and of an entity-masked variant, k = 20) -> tagged candidates | indexer | proposes only; L2 candidates go to review and are never auto-linked |
| S5 | Slot gate and orientation | two signatures -> `LINK`/`ABSTAIN`/`REJECT` with reasons (section 6.3) | both | may reach P1; still not a label |
| S6 | Relation inference and set assembly | rule table (section 6.4); union-find over verified links plus native groups -> typed relation, `Group`, `Cluster` | both | deterministic |
| S7 | Rule-difference extraction | rule texts plus native flags -> `AxisInstance[]`, `cutoffDeltaH`, `maskedSha256` | both | deterministic regex families; LLM may only add axes |
| S8 | LLM residual (offline) | `ABSTAIN` pairs, unknown slots, unparsed clauses, retrieval candidates -> verified slot fills, mismatch flags, review priority | indexer | proposes, flags, demotes; never promotes |
| S9 | Plausibility veto | net edge of a link versus its class scale -> pass / escalate / quarantine (section 9) | indexer and plugin (constants only) | veto and escalation only |
| S10 | Human review | template pair or link, blind subset, canaries, two-key rules (section 13) | human | the only promoter, and only on top of P0 to P2 proof |
| S11 | Publish | approved objects -> bundled `links.json`, later signed dataset plus revocation feed | CI | n/a |
| S12 | Runtime verify | live legs vs pins: rule hash, masked hash, status, close time, tick, fee reference, resolver id, native version -> `ok` or `suspended(reason)` | **plugin** | deterministic, no LLM |
| S13 | Edge engine | verified link or cluster, live books, fee specs -> closed form or LP, tier, reasons, dual certificate (sections 7 and 8) | **plugin** | deterministic |
| S14 | Monitor and settle | settlements, hash churn, drift, reviewer audit -> Beta posteriors, class suspension, negative gold labels | indexer | feeds reserves and suspension |
| S15 | Recorder and optional statistics | hourly top-of-book plus depth for the working set from day 0; statistical candidate generation off until the day-90 test (section 13.5) | indexer | proposes and ranks only |

Determinism contract: the same inputs plus `parserVersion`, `lexiconVersion`, `templateSetVersion` give byte-identical signatures, verdicts and hashes [A §4]. This is what makes plugin-side re-verification possible.

### 6.2 Exhaustiveness proof levels (what separates a long basket from a short one)

| Level | Meaning | How established (deterministic) | Long basket? |
|---|---|---|---|
| E4 template | the rule template states exclusivity and a void-all fallback; sibling count matches | XO football triples: "mutually exclusive - only one of them can resolve to Yes" plus "all three markets will be voided"; 27 of 27 groups of size 3 (panel-measured) | yes |
| E3 support cover | declared outcome intervals cover the declared support lattice | central-bank buckets over a registry support (multiples of 25 bps) by interval arithmetic | yes |
| E2 by rule clause | the rules contain a default clause | Polymarket non-augmented negRisk with all legs tradable and a description matching a default-rule pattern ("No IPO by December 31, 2027", "lowest bracket", alphabetical tie-break) [15 §3.2, V0]; two-key review if there is no venue flag | yes, with two-key for cross-venue |
| E1 exclusive only | at most one resolves yes | Kalshi `MECNET`, Polymarket augmented negRisk, XO prose without a template; `mutually_exclusive: false` also does **not** mean non-exclusive [16 V, Confirmed: Kalshi flags] | **no**; short basket only |
| E0 unknown | nothing | default | no |

Kalshi has no exhaustiveness field (NOT FOUND, searched: events and markets OpenAPI, live objects [17 V4]); so every Kalshi buy-every-outcome result is "unverified" by construction, which is why the 10 net-positive Kalshi sets are not arbitrage [17 §2.1].

### 6.3 Slot gate (S5) and orientation

Inputs are two signatures; first match wins. This is the implemented-and-tested order of [A App. A], with the production change that entity comparison uses canonical entity ids, not token overlap (token overlap passed "The Odyssey" vs "Digger" [16 V-K2]):

1. `ABSTAIN` if a placeholder outcome appears ("Party A", "Candidate S") or outcome-universe sizes differ.
2. `REJECT` if both sides have number sets and they differ; `ABSTAIN` if numbers appear on one side only.
3. `REJECT` if direction classes (UP, DOWN, HOLD) are disjoint or comparators differ (ECB hike vs "decrease", Bank of Korea "Maintain" vs "25 bps cut").
4. `REJECT` if both window ends are known and differ by more than 1.5 days (D; an unknown window does not reject, it is recorded). `XO expiresAt` is a resolution deadline, not the event window (Time Person of the Year: XO 2027-06-30 vs Polymarket 2026-12-31) [A §6.1], so text-derived windows win over native close times.
5. `REJECT` if the two sides carry different members of a mutually exclusive scope group (Champions League vs La Liga; Senate vs House vs Governor); `ABSTAIN` if a scope token appears on one side only.
6. `REJECT` on entity or qualifier swap (resolved entity-id sets differ); `ABSTAIN` if a potent qualifier appears on one side only (again, first, only, exactly, another, still, officially, any, all ...), if strong unmatched tokens remain on both sides, or if there is no shared content.
7. Otherwise `LINK` at proof P1. An unknown entity or window slot in production means `ABSTAIN`.

**Orientation (S5b).** `yesMap` must be proven from native fields, never from outcome order: XO outcome index 0 is the Yes token even for team-named markets; Polymarket `outcomes[0]` is not always "Yes" [17 §1.2]; Limitless `metadata.homeTeam/awayTeam/outcomeLabels` exist on 91 and 13 markets [17 V2.2]; Kalshi `yes_sub_title` [A §6.4]. `Draw` markets are `different_outcome` unless the other side also has a draw. Unknown orientation yields `ABSTAIN`. This addresses the largest class of fake edges seen while building (2,000 to 47,000 bps soccer artefacts and a USD 923,876-capital NFL "edge" of 23,642 bps) [17 §2.5 pattern 5, §5.1].

**Measured effect (panel, M).** Frozen v4: 41 LINK, 0 false (same-question precision 41/41, Wilson 0.914), recall 41/56 = 73% of true links in the old linker's pool; 22% to 30% of candidate pairs `ABSTAIN` (to LLM and human), about 30% `REJECT` and never reach an LLM; 10 of the 41 to 49 LINKs are "identical title, different rule" (Dm), which is why S7 is load-bearing [A §3.3].

### 6.4 Relation inference (S6)

| Slot pattern (equal `k0` unless stated) | Inferred relation | Required proof |
|---|---|---|
| equal `k2`, different venues | identity | S5 `LINK` plus S7 axes |
| equal `k1`, same-class comparators, different thresholds | threshold ladder | operator direction from comparator and native strike type |
| equal subject, predicate, threshold; different window ends | date ladder (cumulative if `semantics = by` and predicate is TOUCH, LAUNCH or OUT; survival if text says "continues through" or "remains") | polarity cue words; unknown polarity means no constraint |
| one threshold axis and one date axis | touch lattice | product order; incomparable pairs unconstrained |
| disjoint intervals covering a declared support | bucket set / partition | E3 proof |
| equal `k1`, outcome entity differs, winner template | partition or exclusive | E2 to E4, else E1 |
| winner-of-final vs reach-final (registry of implication templates) | implication | human-verified template with a quoted necessary condition and enumerated exception states |
| anything else with shared entities or tags | factor | none; signal only |

### 6.5 Rule-difference axes (S7)

Deterministic regex and table logic over both rule texts plus native flags; the output is `{axis, a, b, quoteA, quoteB, severity}` and `cutoffDeltaH` (absolute difference of the two UTC cutoffs; about 5 h for UTC vs ET [16 §7.9c]).

| Axis | Extractor | Evidence it matters | Effect |
|---|---|---|---|
| `timing_cutoff` | clock time and zone to UTC; compare | all six rule-level XO/Polymarket pairs [16 §7.9c] | priced reserve |
| `window_start` | "from market creation" vs fixed date | STRC and 10-year-yield pairs [16 §7.9c] | priced reserve |
| `measure_source` | named source classes ("price as displayed on Binance" vs "1 minute candle High", Chainlink, NOAA station) | Binance lands on the same side as the Chainlink 5-minute resolution about 85% of the time [15 §3.8] | blocks `executable` unless an agreement table exists |
| `void_policy`, `postponement` | "abandoned/cancelled/postponed ... N days ... void / remains open / fair price / Other" | XO 14 days void vs Kalshi fair price after 48 h vs Polymarket stays open; XO minority variant "remain open" on 6 of 81 football rows (M) [17 §2.5; A §3.2] | explicit void atoms in the LP; cap `hedged` |
| `tie_break` | "tied", "alphabetical", "official tie-breaking procedure" | Nigerian Senate: Kalshi government entry vs Limitless alphabetical [17 §2.5] | priced reserve |
| `early_close` | `can_close_early`, `early_close_condition` | Kalshi by-date markets | timing reserve |
| `exception_clause` | death / incapacity / resign / carve-out keyword families | Khamenei: USD 1.00 vs USD 0.02 [15 §8.1 R1] | fatal unless both sides carry the same clause |
| `event_vs_state` / `announcement_vs_occurrence` | cue words: "new", "at <time>", "announce", "officially" | shutdown Feb 14 state vs new-event [15 §8.1 R2, R3] | fatal unless slot values equal |
| `other_fallback` | "resolves to Other", "no winner by" | Polymarket Ballon d'Or [17 V2.6] | LP state |
| `oracle` | native: UMA, exchange, XO MANUAL with creator-specified resolver | XO resolution is MANUAL on every sampled row [AD §3.4] | sets the `delta` class |
| `orientation`, `universe` | S5b | fake edges above | blocks unless proven |

**Silence rule (graft from B).** A slot absent from the market text resolves in this order: event or series text, then the platform registry default, else `unknown` (which blocks every tier above `indicative`). Kalshi market text is silent on void/postpone/tie/refund in 60 of 100 sampled markets while XO is silent in 2.5% (panel-measured, M) [B §4.3]. The comparator therefore compares **slot values**, not clause presence (a "clause present" tripwire would fire on almost everything).

### 6.6 LLM roles (S8): narrow, verified, asymmetric

| Role | Contract | Deterministic acceptance test | Authority |
|---|---|---|---|
| R1 slot-fill | return JSON slots, each with a verbatim `quote`, null if absent | quote is a substring of the NFKC-normalised source and a deterministic normaliser re-derives the claimed value from it; no conflict with native fields; time-zone arithmetic done by code | fills a slot as `llm_quoted`; the link stays P3 |
| R2 mismatch flag | list every way the two texts could resolve differently, with a quote from each | quotes verify as substrings | can only **add** axes; any flag demotes immediately |
| R3 queue ordering | structured relation, axes, `abstain` allowed, mandatory counterexample attempt | n/a | orders the review queue; cannot approve |
| Retrieval-only candidates (S4 L2) | Haiku screen, Sonnet structured diff, independent second vote | the code comparator derives the relation from the two frames and must agree; disagreement is `abstain`, not a majority vote | candidates for review only |

All calls: market text inside delimiters, no tools attached, structured output only, unanimity of the samples or models used, any disagreement `abstain`. Diversity must come from model, prompt variant and A/B ordering, because B reports that sampling parameters cannot be tuned on current models (B's claim from the Claude API table cached 2026-10-06; not re-checked here) [B §6.2]. **Metamorphic probes** (entity swap, threshold step, date shift, A/B swap, direction flip) are a CI gate for the prompt and model, and a per-link check on any link whose slots came from R1 (P3); a failed probe rejects the link and two failures in one template suspend the template [B §6.2]. A creator-planted sentence such as "this market is identical to Polymarket X" is not evidence; only typed slot values count.

### 6.7 Templates and the review unit

The reviewer approves a **template pair**: the two `maskedSha256` sets, the slot map and `knownAxes`. An instance auto-links as `template_approved` iff (1) both masked hashes are in the approved sets, (2) S5 returns `LINK` with proven orientation, and (3) S7 finds no axis outside `knownAxes`. A deviating instance (new masked hash or new axis) falls out as `proposed`. Measured on XO football: 81 markets map to 4 masked templates (57/18/3/3), and 6 of 81 (7.4%) carry a different postponement clause that the hash catches with no LLM (panel-measured, one creator, one resolver, M) [A §3.2]. Templated families to build first: `T-FB3` (football triples), `T-CBD` (central-bank decision sets), `T-TOUCH` ("Hit $K by date"), `T-WINNER` (election, award and league lists). Skeleton concentration (panel-measured): XO type 2 has 84 skeletons over 242 rows (71% in skeletons with at least 3 members); type 4 has 150 over 165 (8%) [A §3.1]. Templates cover the liquid creator-templated core and little of the long tail.

---

## 7. LP formulation (fee-adjusted, depth-aware) and worked examples

### 7.1 Formulation

Sets: contracts j in J; states w in Omega (atoms, including tie, void and divergence atoms). Data: payoff `A[w][j]` per share of contract j in state w (0 or 1; a fraction for void rows); ask ladder `(a_jl, u_jl)` and bid ladder `(b_jl, v_jl)` per contract; fee `phi_j(p)` per share at price p (taker only; read per market; unknown model fails closed); lock rate `lam = rho*T/365`; legging reserve `eps`.

```
variables   x_jl in [0, u_jl]   shares bought at ask level l          y_jl in [0, v_jl]   shares sold at bid level l          t free
cost        cb_jl = a_jl + phi_j(a_jl) + lam*a_jl + eps               (effective cost per share bought)
proceeds    cs_jl = b_jl - phi_j(b_jl) - lam*(1 - b_jl) - eps          (short collateral is 1 - b)
maximize    t
subject to  t <= sum_j A[w][j]*( sum_l x_jl - sum_l y_jl ) - sum_jl cb_jl*x_jl + sum_jl cs_jl*y_jl      for every state w in Omega
optional    capital row:  sum_jl (a_jl + phi_j)*x_jl + sum_jl (1 - b_jl + phi_j)*y_jl <= K      (K = cap, depth or budget)
```

Properties.
- `x = y = 0` gives `t = 0`, so `t* >= 0`; **an arbitrage exists in the modelled state space iff `t* > 0`** [15 §4.1].
- The fee depends on the price level, not on quantity, so the program stays linear; lots, ticks and Kalshi order-level rounding are re-priced with the exact rule after the LP [15 §4.3, §4.4].
- The dual variables of the state rows form a probability vector `pi` over Omega. At `t* = 0` complementary slackness gives `E_pi[A_j] <= cb_jl` for every ask level and `E_pi[A_j] >= cs_jl` for every bid level: a **no-arbitrage certificate** in fee-adjusted prices, stored with the evaluation. At `t* > 0` the inequality is reversed on fully filled levels (`E_pi[A_j] >= cb_jl`, `<= cs_jl`) and holds with equality on partly filled levels (in example A below the dual price equals the cost of every partly filled level). `E_pi[A_j]` is where contract j "should" trade given all linked contracts, and is the reference price for an identity bundle [15 §4.2].
- Never add the NO token's book as extra columns: mirrored books are one liquidity pool. Fetch YES and NO in the same instant or derive NO [17 §2.2].
- **Void and divergence rows.** Add a row per void state with the venue's void payoff: Polymarket Unknown pays 0.50 per token; Kalshi scalar at last traded price; XO VOIDED refunds funds. A refund at fill price makes the row coefficient level-specific (a bought level pays back its own fill price) and keeps the LP linear [C §5.1]. If the void payoff is not stated by the market's rules or native state it is `unknown` and blocks tiers above `indicative`. In the **robust** LP, `t` is the worst case over all rows, so a cross-venue pair is never riskless [15 §4.5, §4.7 case D]; the **nominal** LP omits the divergence rows. Both numbers are reported (robust as the stress number).
- **Legging.** Non-atomic fills enter `eps`, a prefix-fill scenario and a "leg reverts" state for Polymarket (off-chain-matched, on-chain-reverted fills reached 24.3% of transactions in peak hours [15 V3.2]); sequence the least liquid leg first.
- **Stopping rule.** Walk both ladders together and stop where the marginal net edge per share at the next level is at most `tau` (D: 0.5 cent); size is the least of the cap, depth at `tau`, and the smaller leg [AD §5.0].

**Closed forms first, LP second.** Pair, partition, ladder and implication checks are single inequalities (section 4), evaluated in microseconds; the LP runs to size over depth, to combine families (ladder plus bucket plus cross-venue cover; 23 atoms for 22 contracts in the measured Polymarket BTC family [15 §6.3]) and to emit the dual certificate. Clusters above 30 contracts or 64 atoms are split by family and solved offline. A nested family needs only O(m) cover-relation rows (order polytope; Stanley 1986, cited from memory by C, M): a violated pairwise row is a genuine arbitrage; a clean set of pairwise rows does not by itself prove coherence when some monotone patterns are unrealisable [C §5.3].

**State-space builder (offline compile check).** Start with the atoms of the largest independent family in the cluster, refine by relation (tie atoms, void atoms, divergence atoms), delete atoms removed by implication or exclusivity, and check satisfiability by enumeration for n at most 20. Panel checks (B §8.4, M): a partition of 3 gives 3 states; a 3-rung ladder gives 4; "A implies B plus A, B exclusive" forces A false (reject); "partition plus A equals B" has zero states (reject); XO's five-way FOMC set linked by five identity links to Polymarket's five-way event gives exactly 5 states.

### 7.2 Worked example 1: three-candidate race, two venues (re-derived)

Synthetic prices from [15 §4.7]; **not live quotes**. States: winner is X, Y or Z. Venue P taker fee `0.04*p*(1-p)`, venue K `0.07*p*(1-p)`. Lock: 8% APY for 30 days, `lam = 0.08*30/365 = 0.0065753`.

| Contract | Pays in state | Asks (price x size) | Bids |
|---|---|---|---|
| X@P | X | 0.46 x 30; 0.48 x 100 | 0.44 x 50 |
| Y@P | Y | 0.21 x 40; 0.23 x 100 | 0.19 x 50 |
| Rep@P | Z | 0.31 x 50; 0.33 x 200 | 0.29 x 100 |
| Dem@K | X or Y | 0.66 x 60; 0.68 x 100 | 0.64 x 100 |
| Z@K | Z | 0.30 x 25; 0.32 x 100 | 0.28 x 100 |

Payoff matrix (rows X, Y, Z; columns X@P, Y@P, Rep@P, Dem@K, Z@K): `[1,0,0,1,0]`, `[0,1,0,1,0]`, `[0,0,1,0,1]`.

**Naive top-of-book covers** (what a pairwise scanner sees): Dem@K + Z@K = 0.96; X@P + Y@P + Z@K = 0.97; X@P + Y@P + Rep@P = 0.98, i.e. 4, 3 and 2 cents gross, sized at the smallest level (25 shares) [15 §4.7].

| Case | Guaranteed profit | Optimal trades | Hand check |
|---|---|---|---|
| (A) depth-aware, no fees | **$2.5000** | buy X@P 30 @0.46, Y@P 30 @0.21, Rep@P 50 @0.31, Dem@K 60 @0.66, Z@K 25 @0.30 and 15 @0.32 | Cost 13.80 + 6.30 + 15.50 + 39.60 + 7.50 + 4.80 = 87.50; payoff 90 in every state (X: 30 + 60; Y: 30 + 60; Z: 50 + 40); profit 2.50. Dual `pi = (0.47, 0.21, 0.32)`: weak-duality bound = 30x(0.47-0.46) + 50x(0.32-0.31) + 60x(0.68-0.66) + 25x(0.32-0.30) = 0.30 + 0.50 + 1.20 + 0.50 = 2.50, equal to the primal, so optimal |
| (B) with taker fees | **$0.4406** | buy Dem@K 60 @0.66, Rep@P 35 @0.31, Z@K 25 @0.30 (X@P and Y@P drop out) | Cost 39.60 + 10.85 + 7.50 = 57.95; payoff 60 in every state (Dem 60; Rep 35 + Z@K 25); fees 60x0.07x0.66x0.34 = 0.94248, 35x0.04x0.31x0.69 = 0.29946, 25x0.07x0.30x0.70 = 0.3675, total 1.60944; profit 60 - 57.95 - 1.60944 = 0.44056. Independent minimum of the dual over its vertices = 0.44056 at `pi = (0.4699, 0.2115, 0.3186)` |
| (C) fees + 30-day lock at 8% APY | **$0.0820** | 25 sets of Dem@K + Z@K | Cost 25 x 0.96 = 24.00; fees 25 x (0.015708 + 0.0147) = 0.7602; lock 0.0065753 x 24.00 = 0.15781; profit 25 - 24.00 - 0.7602 - 0.15781 = 0.08199 (before lock 0.2398) |
| (D) add three void rows: venue K voids and refunds at last price (Dem 0.65, Z 0.30) whichever candidate wins | **$0.0000** | none | Plan (C) in a void row pays 25 x 0.65 + 25 x 0.30 = 23.75 against 24.00 + 0.7602 of cost and fees: cash P&L -1.0102 (-1.168 with the lock charge). A certificate with weight 0.0536 and 0.0120 on void states has bound 0 |

What it shows. (1) The profitable cover is a six-leg combination of a composite contract with single-outcome contracts on another venue, which no pairwise scan finds. (2) Fees remove 82.4% of the $2.50 (to $0.4406) and the lock removes a further 81.4% (to $0.0820). (3) The remaining $0.082 is entirely a bet that venue K does not void: with void rows the guaranteed profit is exactly 0. (4) All four values were confirmed by an exact primal evaluation (minimum over states of re-computed P&L) matched to an exact dual bound with zero gap, and for A, B and C by enumerating the dual's vertices without any simplex code (section 3.3).

### 7.3 Worked example 2: a real book, a date ladder (closed form and LP agree)

Kalshi "any company achieves AGI": hard "before 2030" bid 0.81 x 1,950 versus easy "before 2031" ask 0.78 x 4,939, Kalshi fee `0.07*p*(1-p)`, `collateral_return_type` empty so capital is not netted [17 V1; A §3.4]. Closed form (sell the hard rung, buy the easy rung): per share `0.81 - 0.78 - 0.07x0.81x0.19 - 0.07x0.78x0.22 = 0.03 - 0.010773 - 0.012012 = 0.007215`; on 1,950 shares gross 58.50, fees 44.43075 (76% of gross), **net $14.069**. Capital `1,950 x (0.78 + 0.19) = 1,891.5`, so net 74.4 bps. The 3-atom LP (hard happens; between; neither) returns the same $14.069 with the same two fills. A 5% APR lock over about 4.2 years is 21.0% of capital (USD 397), so the LP with lock returns 0. Output: tier `indicative_discrepancy` with reasons `[lock_exceeds_edge, long_dated]` although the book violates monotonicity: report the inconsistency, refuse the opportunity label. This is the intended behaviour and is the same inversion the verifier reproduced on a fresh snapshot to the cent [17 V1].

### 7.4 Worked example 3: why links are typed before any price is read

Synthetic: A = "before Jan 1" YES ask 0.20 (100 shares); B = "before Jul 1" YES bid 0.30 (100 shares). Typed as `identity` (atoms E, not E) the LP prints a guaranteed profit of **$10.00** (sell B at 0.30, buy A at 0.20, payoff 0 in both states). Typed correctly as a cumulative date ladder (A implies B; atoms A and B, not A and B, neither) it prints **$0.00**: the quotes are consistent with `p_A <= p_B` (the subset is the cheaper contract), and the same trade (buy A at 0.20, sell B at 0.30) loses 0.90 per share in the state "not A, B" (payoff -1 plus the 0.10 collected), so it is not a guaranteed profit [B §8.4; judge re-run]. The first number is a fabricated arbitrage created entirely by a wrong relation type.

### 7.5 Tiers

The tier is `min(proof cap, class cap, axis cap, gate result)` with machine-readable reasons.

| Tier | Requires |
|---|---|
| `structural_violation` | within one venue and clock; E2 to E4 where a long basket is involved; nominal and robust LP value above 0 after fees and lock; no tail legs; creation burn-in passed (a new rung showed a 55-cent violation for 20 minutes at creation [18 §2.7]) |
| `hedged_discrepancy` | approved link (P2 or P4) whose axes are all priced; `net_hedged = t_nom - delta_l*C_cover > tau`; skew within 60 s |
| `executable_arbitrage` | cross-venue link at P2 or P4 with `axes = []`, class gate passed, `net_hedged > 0` at the 95th-percentile reserve, skew within 5 s, fee models verified (XO reconciled by a real fill). **Disabled until D2** [AD §4.5] |
| `model_edge` | external fair value (for example Quotient) versus ask, shrunk; never constraint-based |
| `relative_value_signal` | factor clusters and cross-asset; never executable-labelled |
| `indicative_discrepancy` | everything else, including all candidates, quarantined links and failed gates |

Expect `executable_arbitrage` to print rarely or never: 0 of 13 identical verified links survived the filters [17 §2.6]. Executable prices only: ask ladders for buys and bid ladders for sells from books fetched in the same call; never Gamma `bestAsk`, `outcomePrices`, last trade or listing quotes (Gamma read 0.993 where the CLOB read 1.007; listings differed from books by more than 1 cent for 7.1% of Kalshi and 5.5% of Polymarket markets after about 15 minutes) [15 V1.2; 17 §0 item 8]. Reject tail legs (at most 2 cents or at least 98 cents), empty-side encodings, proposed or disputed markets and ended-but-open markets from `executable` labels.

---

## 8. Resolution-risk haircut method

**Where risk enters.** Four places, never one: (1) explicit void and divergence atoms in the robust LP (section 7); (2) a priced reserve per axis (this section); (3) the lock charge, with the dispute tail as a timing risk, not a payoff risk; (4) class gating that refuses an `executable` label for axes with no measured agreement rate.

**Expected-value haircut.** For a complement cover (YES on A, NO on B) costing C per share all-in, paying 1 in the agreeing states and, in the adverse-divergence direction, 0: `EV = (1-delta)(1 - C) - delta*C = 1 - C - delta`. So the haircut per share is exactly `delta`, and **a pair breaks even when the adverse-divergence probability equals its net edge `e = 1 - C`** [AD §5.6]. For several axes use `delta_l = 1 - prod_a (1 - delta_a)`; hedged edge `net_hedged = t_nom - delta_l*C_cover`. The windfall direction is ignored (conservative). Maximum loss is the notional, capped by the per-order cap.

Re-derived on the AD Example 1 pair (cost 0.965196, so `e = 0.034804`): EV per share at `delta` = 0.12% / 0.5% / 2% / 5% is +0.0336 / +0.0298 / +0.0148 / -0.0152, matching [AD §5.6]; a three-state check (97% agree, 2% adverse paying 0, 1% Kalshi void refunding at last price 0.62) gives +0.0110 with worst case -0.9652. The median verified-true cross-venue edge is 46 bps [17 §2.6], so **any class whose 90th-percentile reserve exceeds 0.46% wipes it out**; only clean fixture-matched templates can ever carry a positive reserve-adjusted edge at those sizes, and with a flat 300 bps haircut 0 of the verified-true links survive [17 §2.6].

**Priors per axis (D, with anchors).** `delta` is the probability of an adverse divergence for that axis.

| Axis class | Trigger | Anchor | Prior `delta_0` (D) | Ceiling |
|---|---|---|---|---|
| Axis-free, fixture-matched sports | S7 returns `[]` | 18 of 14,885 settled differently over 7 days (0.12%; Clopper-Pearson upper 0.19%, or 0.20% for the sports subset of 18 of 14,498; judge re-run) [16 §5.2]; easy case | 0.25% | `executable` if the class passes its gate and net edge exceeds the 95th-percentile reserve |
| `timing_cutoff` only | cutoff delta computed | hazard `h*Delta` with `h = -ln(1-p)/T` from the market's own price and horizon; `p = 0.35`, `T = 70 d`, `Delta = 5 h` gives 0.128% (judge re-run) but events cluster near deadlines | `max(h*Delta, 1%)` | `hedged` |
| `window_start`, `tie_break`, `early_close` | extractor hit | no measured rate | 2% to 5% | `hedged` |
| `void_policy` differs | extractor hit | Polymarket 50-50 on 0.41% of protocol payouts [15 §3.2] | explicit void atoms plus 0.5% | `hedged` |
| `measure_source` differs, objective sources | extractor hit | Chainlink vs Binance same side about 85% at 5-minute boundaries [15 §3.8]; NYC temperature stations 32.4% vs 61.8% (blog, M) [15 V0] | from a per-source-pair agreement table; if none, label blocked | blocked without a table |
| `oracle`: XO MANUAL with creator resolver vs UMA or exchange | native fields | no XO-versus-other settlement history exists | 5% | `hedged` at best; `indicative` for non-allowlisted creators |
| `reference_index` (5-minute crypto) | extractor hit | [15 §3.8] | 15% | `hedged` |
| `exception_clause`, `event_vs_state`, `announcement_vs_occurrence`, unknown orientation | extractor hit | R1 USD 1.00 vs 0.02; R2; R3 [15 §8.1] | **not priced** | blocked; fatal unless both sides carry equal slot values |

**Learning `delta` from settlements.** For each class (venue pair, basis class, axis set, category) keep `Beta(alpha, beta)` with prior mean `delta_0` and pseudo-count `n0 = 20` (D). After both legs settle, `alpha += w` if the legs paid differently, else `beta += w`, with weight `w = 4p(1-p)` of the pre-event mid so near-certain markets (which settle the same by default) carry little weight [B §7.3]. The reserve uses the **90th percentile of the posterior for `hedged`** and the 95th for `executable`. For `Beta(1, b)` the q-quantile is `1 - (1-q)^(1/b)`: from a 5% prior mean (`Beta(1,19)`) the 90th percentile is 11.4%; after 40 clean settlements (`Beta(1,59)`) 3.8%; after 200 (`Beta(1,219)`) 1.05% (judge re-run). A MANUAL-resolver XO class therefore needs on the order of 200 clean settled instances before its reserve nears 1% and stays `hedged` for a long time, which matches the evidence that XO pairs are `settlement_source` divergent by default [10 §4.2 via AD]. Any settlement disagreement suspends the class and files a negative gold label with the divergence axis. Until a class has settlements the output states "reserve is a prior".

**Lock-up and dispute tail.** `T = T0 + P(dispute)*Delta` per leg, `T0` the latest scheduled resolution. Polymarket: about 1.0% of proposals population-wide, 7.6% of the top 1,000 closed 2026 markets by volume (16.2% of volume), 27% for geopolitics-keyword markets versus 1.2% sports-style; disputed markets close a median 100.1 h after end date (p90 439 h) versus 3.6 h undisputed [15 §7, V1.13]. XO MANUAL and Trueo (council with no timeout) have no measured tail; the engine uses the market's `expiresAt` plus a wide default and says so. The hurdle `rho` is a parameter (default 5% APR, D); the 8% in note 15 is an assumption and the measured settlement wedge (arXiv 2605.31431) should replace it [15 V3.1]. Note that note 15's lock charge uses the scheduled end date in every state, so its "$0 after lock" figures are conservative bounds, not expectations [15 V1.9].

---

## 9. False-link defences (consolidated)

A false link creates a fake edge, and fake edges are huge (median 826 bps, up to 158,984 bps) while true edges are tiny [17 §2.4]. "A link that shows a profitable edge is a false link more often than not." [17 §2.5]. Defence in depth; each layer is deterministic unless stated.

| ID | Guard | Mechanism | Evidence it addresses | Origin |
|---|---|---|---|---|
| G0 | No scores | links store a proof object and reasons; similarity is a retrieval detail | similarity precision 18% to 72% [17 §2.5] | A |
| G1 | Hard-veto slots | numbers, comparator, direction, window end, scope group: both-sided mismatch rejects, one-sided abstains | ECB hike vs decrease, ETH 2,900 vs 3,000 [16 §7.9b] | A |
| G2 | Entity registry and swap veto | resolved entity-id sets must match; unresolved is unknown | 26 of 35 false links are "same template, different entity" [17 §2.5]; Odyssey vs Digger [16 V-K2] | A |
| G3 | Orientation and universe | `yesMap` from native fields; Draw is `different_outcome`; outcome counts equal; placeholders abstain | 2,000 to 47,000 bps artefacts [17 §5.1] | A |
| G4 | Exhaustiveness ladder | long basket needs E2 to E4; E1 short only | 10 Kalshi false buy-side sets [17 §2.1] | A |
| G5 | Cardinality | at most one `identity` partner per liquidity pool per market; ties go to a duplicate set or review; intra-XO duplicates linked first | one Limitless market in 30 net-positive pairs [17 V2.3]; XO Zcash and Arsenal duplicates [16 V-K3] | A, B |
| G6 | Rule-difference gate and masked pins | any new axis or new masked hash drops an instance out of `template_approved` | 33% of true links carry a rule difference [17 §2.5]; 6 of 81 XO rows deviate (M) | A |
| G7 | Adversarial-creator guard | non-allowlisted creator or resolver (XO type 4) caps at `indicative`; pins include `resolverId`, so a resolver swap suspends | XO resolution MANUAL with creator-specified resolver; anyone can copy another venue's text [AD §3.4] | A, B |
| G8 | **Plausibility veto** (price as veto only) | net edge in bps of capital: at most 100 no effect; 100 to 300 cap at `hedged` and require a rule-diff record; above 300 `quarantined` with no LLM spend; above 1,000 presumed false. After at least 30 verified links in a class, scale `T_q = max(300 bps, 7 sigma_class)`; escalate, never discard silently; with unchanged hashes a z-score of 5 against a shipped baseline means "hold: re-verify rules" (day 90 onward) | 17 true links 4.9 to 245.9 bps vs 28 of 30 false above 300 (H, judge re-run); "a real inconsistency would not be 50x the fee-adjusted spread" [17 §2.4]; rule-of-three upper bound on true links lost 18% | C, A, B |
| G9 | Lifecycle | `validUntil` = earlier of the two closes; pins re-derived every call | Polymarket clarifications, Kalshi `rules_secondary` edits, `can_close_early` [15 §10.8] | A |
| G10 | Market-state filters | exclude tail legs, proposed or disputed or ended-but-open markets, empty-side encodings, books older than the skew limit, a creation burn-in of 6 h (D) | funnel in [17 §2.6]; creation artefact [18 §2.7] | A, C |
| G11 | Shadow settlement | after both legs settle compare payoff vectors; a divergence suspends the template | 18 of 14,885 sports pairs settled differently [16 §5.2] | A, B |
| G12 | Class gating | a class prints `hedged` or `executable` only after its gold-set bound is met | 5 of 8 out-of-sample [16 V-K2] | A |
| G13 | LLM asymmetry | LLM can demote and flag, never promote; quotes must verify; probes gate prompt and model changes | prompt injection through creator text [16 §13] | A, B |
| G14 | Blind and canary review | 20% of items shown without the judge verdict; 5% seeded known-false canaries; per-reviewer canary miss rate with a Wilson bound; two-key for `executable_eligible` and for any cluster whose long basket rests on E2 | anchoring and rubber-stamping; reviewer catch rate unmeasured | B |
| G15 | No XO-only statistical evidence | price statistics on thin XO markets never support a link whose XO leg was created by a creator who may trade it | self-trading is allowed by the author; wash-created co-movement is free [C §12] | C |

---

## 10. Plugin tool surface and the execution boundary

### 10.1 Tools

All `pm_*` tools are **read-only** (`readOnlyHint: true`), strict zod schemas, string amounts, market text returned in labelled `Untrusted` fields, never emit an `io.paybox/transactionProposal`, and keep output under 256 KiB [AD §9]. Hosts: XO (2), Polymarket (2 to 3), Kalshi (1, flagged), Limitless (1), optionally a dataset host (1); about 8 requests per call and about 3 requests per link [AD §8.2].

| Tool | Reads | Purpose | Phase |
|---|---|---|---|
| `pm_list_venues` | bundled registry only (offline; the conformance sample call) | capabilities, fee-model ids, geo and bot flags, reachability class, TTL status | AGG-0 |
| `pm_lookup_links` | bundled dataset only | approved links and candidates for a market with state, tier cap, basis, axes, pins, proof evidence, reviewer date; candidates labelled `indicative`; `detail: true` returns the proof object (slots, quotes, masked hashes, veto result) | AGG-1 |
| `pm_verify_link` | the link's legs | recompute rule hash, masked hash, status, close time, tick, fee reference, resolver id, native version; `ok` or `suspended` with reasons | AGG-1 |
| `pm_compare_market` | XO market plus twins | relation, basis, axes, both books, indicative discrepancy, reference price, veto result | AGG-1 |
| `pm_check_structure` | one venue's group (XO `rootEventSlug`, Polymarket negRisk event, Kalshi event) | partition, complement, ladder and lattice checks, fee-adjusted, exhaustiveness-aware, labelled mid vs executable | AGG-1 |
| `pm_get_quote` | per venue | normalised top of book and depth walk for `(venue, market, outcome, side, size)`; `derived` flag; `quote_id` hash | AGG-1 |
| `pm_signal_request`, `pm_signal_parse` (flagged) | none | Quotient request description and body validation; join to links by `marketKey` only on `identity` links whose axes are within `timing` below 24 h, else "related, not equivalent" | AGG-1 |
| **`pm_get_cluster`** (new, from B) | dataset plus legs | the batch of interrelated markets around a market: members, relation graph, exhaustiveness levels, consistency status, dual-vector reference prices, signal-only factor tags; one set-level call replaces n(n-1)/2 pair calls | AGG-2 |
| `pm_find_edge` | up to about 8 hosts | evaluate a bounded page of verified links (at most 5 `link_ids` per call): tier, net edge, depth-limited size, capital, lock-adjusted return, rejection reasons, cursor | AGG-2 |
| `pm_plan_legs` | the legs' venues | re-quote and emit the **Leg Plan** (read-only): ordered legs, executability class per leg, sizes within caps, limit and GTD expiry, preconditions, unwind cost, abort conditions, `valid_until` 60 s | AGG-2 |

Cut: any tool that writes a candidate link (proposals go through the offline review queue, not the plugin), any LLM-backed tool, any hosted-aggregator-backed tool.

### 10.2 What may propose a transaction, and what may not

- **Nothing in the link layer proposes or signs a transaction.** `pm_plan_legs` returns instructions with an executability class; the agent orchestrates, because a plugin cannot call tools or other plugins [AD §6.3].
- **Executability classes** (X1 to X5; [AD §6.1, §6.2] calls them E1 to E5): XO is X2 (typed-data orders signed through PayBox `request_wallet_sign`, then `xo_submit_order`; approvals and redeem are UserOps, not EOA proposals; funding is source-chain proposals); Trueo is X1 (plain EVM calls on Base, one proposal per request) and belongs to the P2 `trueo_*` tools; Polymarket global, Limitless, Predict.fun and Opinion are X2 and not planned (credentials, geo); World is X3 (Solana, a separate custody island, data passed in as inputs); **Kalshi, Polymarket US, MagicMarkets and PredictIt are X4: custodial or fiat or KYC accounts with API-key request signing, not tradable from PayBox, rendered as "place this on Kalshi manually" and never signed** [AD §6.2, §10]. Any other venue is X5 (unsupported).
- **Caps** ($10 per order, $50 per day, 2 markets created per day) bind plugin-prepared XO orders and Trueo proposals, read from owner environment, with no bypass parameter. Non-plugin legs are advisory. The plugin is stateless, so the $50 per day counter must be read-derived or held by an owner backend. **Plugin caps do not bind an agent that holds an `autonomous` grant and calls `request_wallet_sign` directly; the real boundary is the PayBox grant mode** [P0 §3.0 B2; AD §6.4].
- **`pm_plan_legs` refusal rules.** It refuses (with reasons) unless: the link is `template_approved` or better with unchanged pins; the tier is at least `hedged_discrepancy`; the class gate has passed; no XO fee model is `unknown`; leg skew is within limit; each leg's eligibility is attested by the user from their own client (not the plugin host); and every leg is X1, X2, X3 or X4 (an X5 leg refuses). Sizes are `min(per-order cap, depth at tau, smaller leg)`; at a USD 10 cap a leg is about 31 shares and a 6-cent gross cross-venue gap nets about USD 0.72 [AD §5.1], and any fixed friction above a few tens of cents (gas, bridge, rebalancing) removes it [AD §5.5]. A pair with an X4 leg is returned as `manual_leg_required` with the unwind cost and its label is capped at `hedged_discrepancy`; maximum unhedged exposure never exceeds the per-order cap.
- **Staleness.** Human approval and signing windows take seconds to minutes while documented mispricing episodes last a median 3.6 to 16 seconds for short ones, though a majority of observed negRisk CLOB episodes outlasted a 50-minute window [15 V1.1]; `pm_plan_legs` always re-quotes and the agent re-runs the remaining-edge check between legs [AD §6.3].

---

## 11. What runs where, and cost

### 11.1 Placement

| Component | Plugin (stateless, 10 s, at most 10 MiB, at most 16 hosts [AD §1.1]) | Offline indexer | Hosted static |
|---|---|---|---|
| Venue reads, book normalisers, fee models, fee-adjusted depth walk | yes | | |
| Signature parser, lexicon, alias registry (about 100 to 200 KB gzip, D), gate, rule-diff regexes, masked hash | yes (optional for unreviewed pairs) | yes | |
| Pin verifier (SHA-256 via built-in crypto, M; pure-JS fallback), closed forms, exact rational LP (at most 30 contracts and 64 atoms), tiering, veto constants | yes | | |
| Bundled `links.json` and `templates.json` (ids and hashes, about 0.4 to 0.5 KB per link raw; 5,000 links is about 2 to 2.5 MB) | yes | builds | |
| Crawler, snapshotter, recorder, alias curation, template discovery | no | yes | |
| Embeddings, BM25, LLM slot-fill, mismatch flags, retrieval judge, probes, review queue, gold-set tooling, shadow-settlement monitor, calibration | **no** (10 s; owner's key would pay per user; attacker-written text) [16 §10.2] | yes | |
| Dataset signing (Ed25519) | verify only | sign | serve (AGG-2) |
| Per-user state | none available | owner backend keyed by signed challenge | |

Every published plugin version needs MoonPay manual approval [AD §1.1], so link updates that ride in the bundle are slow: acceptable for the MVP, and the reason the signed dataset moves up in AGG-2.

### 11.2 Cost per 1,000 markets (lower bounds; thinking tokens bill as output [16 V-K9])

| Item | Cost | Source |
|---|---|---|
| Deterministic stages (hash join, gate, rule-diff, LP) | USD 0 | [A §12] |
| LLM on the residual only (k = 3 to 5, 15% to 30% abstain, 15% to 55% slot-fill) | USD 0.11 to 0.36 (Haiku), 1.56 to 5.20 (Sonnet), 2.91 to 9.70 (Sonnet with 3x output) | [A §12, M] |
| All-pairs LLM-first at k = 5, single pass | USD 0.85 (Haiku), 17.00 (Sonnet), 34.00 (Opus); Sonnet plausibly 25 to 50 with thinking | H, judge re-run; [16 V-K9] |
| XO-anchored backfill, 421 anchors x k = 20, screen and judges, batch, including probes | USD 6.75 to 19.26 total (USD 16 to 46 per 1,000 anchors) | [B §10.2, M] |
| Embeddings | USD 0.003 for the 421 XO markets; USD 0.87 to 5.66 one-off for the 145k-market corpus | [B §10.2, M] |
| Recorder | about 24,000 book GETs per day and 1.2 MB per day per 1,000 contracts hourly; hosting about USD 5 to 10 per month (L) | [C §11, M] |
| Kalshi if every new market (at least 6,000 per day) were an anchor | USD 96 to 274 per day, hence demand-driven anchors only | [B §10.2, M] |
| **Human review** | **NOT MEASURED.** Formula: `minutes = templates x m_t + sampled_instances x m_i + anomalies x m_a`; 330 per-link reviews at 2 to 5 minutes is 11 to 27.5 h per 1,000 markets; the first XO backfill is about 8 to 20 h (hypotheses); template-pair review cuts the XO football family about 20x | [A §12; B §10.3] |

Measure `m_t`, `m_i`, `m_a` and the canary miss rate in the first week of shadow mode; they decide whether the registry can grow past a few hundred links.

---

## 12. MVP scope and phased roadmap alongside XO v0.1 to v0.3

Aggregation is additive and must not delay the XO release; public release still requires XO v0.1 to v0.3 [plan.md]. The `pm_*` family is registered behind `PM_TOOLS` (default off) and Kalshi and Quotient behind build flags until the legal reads in AD D4 are done. Phase names follow [AD §11].

| Phase | Alongside | Link-layer deliverables | Exit criteria |
|---|---|---|---|
| **AGG-0** | XO scaffold, before the gate answers arrive | `pm-core`: Decimal and bigint math, four book conventions, fee models with golden tests reproducing section 7 and AD examples, closed forms, small exact LP (port of [15 App. A]), masked-hash function, `Untrusted`; schemas with JSON Schema CI; registry seeds for xo, polymarket, kalshi, limitless, trueo (exist in fixtures); the adversarial regression suite (the ten bugs of [17 §5.1] plus the named negatives in section 13.4); written label policy; alias tables (UCL clubs, central banks, tickers). **Recorder starts (offline, week 0 to 1) on Polymarket, XO and Limitless legs** | all golden tests pass; build twice byte-identical; no network at startup |
| **AGG-1 (MVP)** | **XO v0.1 read-only** | Adapters: XO (shared with `xo_*` reads), Polymarket, Kalshi (flagged). Tools: `pm_list_venues`, `pm_get_quote`, `pm_lookup_links`, `pm_verify_link`, `pm_compare_market`, `pm_check_structure`. Four template families. Slot gate, orientation, rule-diff, masked hashes, bundled `links.json` v1. Tiers `indicative`, `structural_violation`, `model_edge`, and `hedged_discrepancy` only for classes that have passed their bound. Offline: review queue, gold set G1 started, shadow mode, from week 3 the XO-anchored retrieval and LLM residual (review-only) | contract tests against recorded fixtures for every venue trap; 100% of approved links suspend on a forced hash change; **zero false `template_approved` in the first fresh test split of at least 150**; `m_t`, `m_i`, `m_a` and canary miss rate measured |
| **AGG-2** | **XO v0.2 funding and trading** | `pm_get_cluster`, `pm_find_edge`, `pm_plan_legs` (XO legs through the v0.2 tools; others X3 or X4); general LP in the plugin; cross-venue partition clusters (FOMC five-way first) and touch lattices; Limitless and Trueo readers; signed dataset (Option B) plus revocation feed; gold set at least 400 items; **first real XO fills to reconcile the modelled fee** | D2 criteria met before `executable_arbitrage` is enabled (section 13.6) |
| **AGG-3** | **XO v0.3 creation** | Reuse for creation lint: near-duplicate detection across XO (types 2 and 4), Polymarket, Kalshi, Manifold; reference seed price from identity bundles; **day-90 statistical test decision** (day counted from recorder start, independent of XO release); optional P2 venues | creation budget accounts for a non-refundable USD 1 per attempt [P0] |

**First links to approve** (best evidence, lowest cost): XO Champions League triples versus Kalshi `KXUCLGAME` (18 of 18 top-1; no edge, value is the reference price) [16 §7.9a]; XO central-bank decision sets versus Polymarket decision events, including the October FOMC cross-venue complete set as the first partition cluster (panel: best-of-venue sum of asks 1.010, M) [C §1.3 M9]; XO asset-touch ladders versus Polymarket and Limitless mirrors, and within-XO lattice and duplicate checks (types 2 vs 4); Polymarket negRisk sets and Limitless mirror hooks as reads.

**In the MVP:** native-structure readers; signature parser for four families; slot gate; orientation; rule-diff extractors; masked hashes and pins; bundled links; closed forms; small LP with dual certificate; fee, depth, lock and reserve; tiering; veto; offline crawler, alias curation, review queue, gold-set tooling, shadow settlement; the recorder.

**Cut from the MVP (and why):** any LLM or embedding in the plugin; cross-venue implication, exclusive and joint relations (candidates only); touch lattices beyond pairwise; cross-asset (Deribit, futures, sportsbooks); statistical candidate generation, factor groups, lead-lag and hedge-ratio sizing (log history instead; no taker edge [18 §0]); Trueo, Predict.fun, Opinion, Hyperliquid and Polymarket US adapters; hosted indexer or vector database; any third-party matcher at runtime (at least six aggregator-type services died or went dark in 2026 [14 §8.3]); `executable_arbitrage`.

---

## 13. Gold-set evaluation protocol and target precision

### 13.1 Frame and sample

1. **Sample what the system would surface, not random pairs** (random pairs are almost all true negatives) [16 §8]. Strata: gate verdict (LINK, ABSTAIN, a random 10% of REJECT to measure false rejects), proof level, venue pair, template family, claimed relation, vote pattern for LLM-assisted items, similarity band, category. Add 100% of native-key pairs and an independent random negative sample (about 200 same-category pairs) to estimate leakage.
2. **Size.** Phase G1 about 480 labelled items (about 240 LINK verdicts, about 240 rejected or abstained). Certification counts are per class: the zero-failure n for a Wilson lower bound of 0.95 / 0.97 / 0.98 / 0.99 is 73 / 125 / 189 / 381; with one failure 110 / 185 / 280 / 563 (judge re-run).
3. **Seeds are dev data only.** The 108 XO-vs-Polymarket pairs, the 78 audited and 30 census links, and the UCL triples shaped the gates and lexicon, are single-rater, and use an inconsistently applied I/Dm policy [16 V-K2; 17 V2.6]. They train and regress; they never certify.
4. **Silver labels (free; recall only).** Limitless-declared mirrors (475 to 483 usable), Predict.fun and Probable references, the UCL triples, post-settlement disagreements as negatives. Declared mirrors are not ground truth [17 §2.5].

### 13.2 Labels

Two levels recorded separately: `qLevel` (same underlying question) and `rLevel` (rule-identical with no axes), plus relation, `outcomeMap`, axes with severity, the three void slots, quoted fragments, and the rule hashes at labelling time (a hash change invalidates the label). A **written label policy applied by checklist** fixes the I versus Dm rule for cancel, postponement, tie-break, cutoff and source clauses first; the single-rater policy drifted in [17 V2.6]. Two independent blind labelers for the first 100 items, then 20% double-labelled; Cohen's kappa at least 0.8 on relation and outcome map and at least 0.7 on axes; a third adjudicator.

### 13.3 Hygiene

Freeze (hash) `parserVersion`, `lexiconVersion`, `templateSetVersion`, model ids, prompt hashes and gate code before each test run; the sealed test split is at least 150 fresh items, sampled after the freeze, read once per release; any change draws a new sample. Thresholds are fitted on batch N and scored on batch N+1 (C). **The labelled items that certify a class must be post-freeze items**, not dev data. Note that 150 items with 0 failures supports only a lower bound of 0.975, so the sealed split detects over-fitting and regressions; class certification uses per-class counts from section 13.1.

### 13.4 Targets (D; revised by the first fresh split)

| Metric | Target | Why |
|---|---|---|
| `qLevel` precision of LINK per template family | Wilson lower bound at least 0.97 (n at least 125, zero failures; 185 with one) before the class prints anything above `indicative` | measured today: 41/41 gives 0.914 on semi-held-out data |
| `rLevel` precision among LINKs with `axes = []` after S7 | lower bound at least **0.95 for `hedged`** (n at least 73 / 110) and at least **0.98 for `executable_eligible`** (n at least 189 zero failures; 200 of 200 gives 0.981, 199 of 200 gives 0.972) | holdout shows only 0.76 to 0.80 strict before S7 |
| Axis-extraction recall | at least 95% of gold axes (void, cutoff, source, tie-break, exception) | a missed axis is a fake arbitrage; a spurious axis only costs an opportunity |
| `qLevel` recall (all true links in the retrieval pool) | at least 85% on templated XO families; at least 70% on non-templated pairs at the same precision (B expects 0.50 to 0.85 end to end) | today 73% to 88%, only relative to the old pool |
| Native-hook recall (Limitless-declared mirrors) | at least 80% at LINK precision at least 0.97 | the fuzzy linker managed 13% to 56% [17 §2.5] |
| Ladder, partition and lattice direction and exhaustiveness | 0 errors on the adversarial regression set; at least 99% on 300 random families; 0 false "exhaustive" in 200 sampled sets | polarity bugs produced thousands of fake violations [17 §5.1] |
| Displayed `hedged`/`executable` false-edge rate | at most 2% judged false at review | the product promise |
| Shadow settlement | divergence at most 0.5% for `identical` classes; any divergence suspends the class | 0.12% sports baseline [16 §5.2] |
| Veto operating point | on at least 100 fresh labelled positive-edge candidates: flags at least 90% of false and keeps at least 95% of true; reverts to a hard 300 bps threshold if cross-validated AUC gain from the gap feature is below 0.05 | in-sample 93% and 100% (H, judge re-run) |
| Adversarial regression suite (CI gate) | 100% on negatives, at least 90% on positives; a miss blocks a prompt or model change | below |
| Reviewers | canary miss rate reported with a Wilson bound per reviewer | anchoring |

**Adversarial regression suite (negatives must never be `identity`):** ECB hike vs decrease; Bank of Korea Maintain vs 25 bps cut; Mamdani vs Hansen (Person of the Year); The Odyssey vs Digger (Best Picture); OpenAI vs Anthropic IPO lead bank; EPL or La Liga vs Champions League golden boot; ballot access vs win; Comey case dismissed Jan vs Jul; ETH 2,900 by Oct 31 vs 3,000 by Dec 31 (incomparable); "win the election" vs "advance"; first-to-leave vs leaves-by; touch vs close above; Draw vs team win; head-to-head orientation inversion; survival vs cumulative wording; Khamenei death clause; shutdown state vs new event; NYC Central Park vs LaGuardia; empty-side `0.0000` encodings; negative spread numbers; year roll-over; "exactly N" bins; the "at least" head-to-head regex bug [17 §5.1, V3]; plus the positives (the 18 UCL matches with expected `void_policy` and `source` axes, Limitless mirrors with known differences, the Rubio, Yamal and Beshear census links).

### 13.5 Statistical channel: pre-registered day-90 test (graft from C)

At day 90 (at least 60 days of recorded data for the working set), on blocks fixed beforehand, run statistical candidate generation inside metadata blocks of at most 50 contracts with Benjamini-Hochberg control at q = 0.05; label at least 150 surfaced candidates plus a matched structural-only sample. **Keep it as a candidate generator only if** (a) the recall gain among powered pairs has a 95% lower bound of at least +3 points, (b) its candidates' precision after S5 to S9 is not below the structural channel's, and (c) false candidates are at most 50 per 1,000 contracts. Otherwise demote it to monitoring and ranking and drop factor groups. Powered means both legs have at least 100 quote changes; a daily correlation of 0.5 needs about 30 independent days and 0.3 needs about 85 (panel arithmetic, M) [C §1.3 M6]. Co-movement is evidence for "related", never "identical", and its absence says nothing (0 of 6 implication pairs recovered, M).

### 13.6 Release gates

`indicative_discrepancy` and `structural_violation` may ship with the MVP. `hedged_discrepancy` ships per class when its `qLevel` and `rLevel` bounds and shadow counters pass. `executable_arbitrage` additionally requires D2 [AD §4.5]: at least 200 gold links per class used with Wilson lower bound at least 0.97 (200 with zero failures gives 0.981, so it satisfies both D2 and the 0.98 target), **two real XO fills that reconcile the modelled fee to the charged fee**, and a signed-off reserve posterior. Ongoing: weekly re-hash of every approved link; monthly re-label of 60 random links; daily contract tests against recorded fixtures; the full regression suite per release.

---

## 14. Risks

### 14.1 Legal and terms of service (not legal advice; confidence tags per [AD §10])

| Area | Flag | Design consequence |
|---|---|---|
| Kalshi Developer Agreement v1.1 (2023, possibly superseded, L) [AD §10; 08] | API use limited to the member's own trading; no collecting, caching, aggregating or storing data; no facilitating other members' trading; no sublicensing; prior written approval for public statements; whether anonymous public GETs count is unresolved | Ids and hashes only in shipped datasets, no Kalshi rule text; no raw Kalshi quote storage; per-user on-demand reads; Kalshi adapter behind a build flag; seek written authorisation before any public listing |
| XO terms [AD §10; 03 §5] | bots allowed if they do not overwhelm; scraping "for unauthorized purposes" barred; wash trading and trading with "direct or indirect influence over the outcome" prohibited (every sampled market is MANUAL with a creator-specified resolver); restricted jurisdictions enforced by IP | Polite rate limits for the indexer and recorder; the author's decision that self-trading is always allowed sits in tension with both clauses and is recorded, not resolved here |
| Quotient terms (updated 2026-08-07) [AD §10; 12 §8] | personal or internal use; no resale, shared access, redistribution of outputs, or competing signals product | Per-user, agent-paid pass-through only; written licence before any shared cache |
| Polymarket global and US [AD §10; 15 V0] | US close-only and not-a-US-person attestation; geoblock keyed on request IP; server-side relay for restricted users is circumvention; Polymarket US Rule 5.2(i): automated systems "must implement pre-trade risk controls including order throttles, price collars, and kill switches" | Read-only for the plugin; any order path runs from the user's own client; automated components carry throttles and kill switches |
| Data and service licences [14 §13; 16 V-K5, V-K6] | pmxt: "All plans are for personal use only"; Predictefy commercial use Enterprise only (from USD 2,500 per month); DefiLlama has no licence file; Almanac CC0; PolyKal CC-BY-4.0; Kairos terms returned 404 | Third-party catalogues are read-time lookups or benchmarks; redistribute only CC0 and CC-BY data |
| Regulators [15 §9, V1.11] | CFTC advisory 9185-26 (2026-02-25) is silent on automation and arbitrage; the 2026-06-10 proposed rule does not address market makers, automation, arbitrage or wash trading per secondary summaries (M) | A cross-venue pair is not a wash trade, but running both legs on one venue through several accounts, or a creator trading its own market, can be; pushing a settlement reference is manipulation |
| Eligibility intersection [AD §10] | Polymarket global, XO, Limitless and Trueo exclude the US; XO also excludes the UK, France, Singapore, Ontario; a user eligible on XO and Kalshi must live outside XO's list and inside Kalshi's | `pm_plan_legs` requires a per-leg user-attested eligibility check evaluated from the user's own client |
| PayBox [AD §10; P0 §3.0 B0] | one project per participant; manual approval of every version; portal window closed 2026-10-17 with no documented non-entrant path | Keep the bundle small and the `pm_*` flags off by default |

### 14.2 Manipulation and adversarial markets

| Threat | Evidence | Mitigation |
|---|---|---|
| Look-alike market on permissionless XO: copies another venue's title and rules, names itself resolver | resolution is MANUAL with creator-specified resolver on every sampled row [AD §3.4]; 166 user-created type-4 markets, 39 distinct creators among the 83 non-sports [16 V-K1] | G7: cap at `indicative` unless the creator and resolver are allowlisted; `resolverId` in the pins; type-4 never auto-linked |
| Wash-created co-movement or price on thin books | creators may self-trade [plan.md]; type-4 books thin (1 of 8 two-sided) | G15; statistics never support XO-created links; depth tier required |
| Fake edges from persistent standing quotes | 187 of 188 persisted yet most were false links [17 §2.6] | persistence is never evidence of validity; the veto and rule gates decide |
| Reference-price push to create a divergence | CFTC context [15 §9] | no automated trading without caps and kill switch; label cannot depend on a single thin venue's quote |
| Poisoning the links dataset (malicious PR, reviewer social engineering) | n/a | CODEOWNERS, two-key on top tiers, 5% canaries, signed releases, revocation feed |
| Fee-model manipulation or drift | XO `effectiveFeeConfig` varies per market (400 on 92 of 111, 0 on 19) [17 §1.2] | read per market at quote time; unknown fails closed; use the maximum of plausible models (flat-of-notional is 2x the curve at p = 0.5 and 10x at p = 0.9) until two real fills reconcile |
| Non-atomic legs, ghost fills, taker delay | [15 V3.2]; XO 0.5 to 3 s, Limitless 1.25 s [17 V3] | `eps`, leg sequencing, skew limits (5 s `executable`, 60 s `hedged`), unwind plan |

### 14.3 Prompt injection through market text and third-party pages

Vectors: creator-written titles and rules on XO and Polymarket; free-text fields in third-party directories; vendor docs and READMEs with agent-directed banners ("fetch llms.txt", "For AI agents", onboarding prompts) recorded in [14 §14] and [16 §13] and not followed there either.

| Defence | Where |
|---|---|
| `Untrusted<string>` wrapper: length cap, control-character stripping, returned only in labelled fields as data, never as instructions | plugin outputs, indexer |
| No LLM in the plugin; indexer judge calls have market text in delimiters, **no tools attached**, structured output only | S8 |
| Evidence is typed slot values only; a quote must be a substring of the normalised source and a deterministic normaliser must re-derive the claimed value; a creator-planted "identical to Polymarket X" is not evidence | S3, S8 |
| Unanimity across models and prompt variants; any disagreement is `abstain`; metamorphic probes gate prompt and model changes | S8 |
| HTML escaped in the reviewer UI; third-party directories contribute facts and URLs only, never free-text descriptions | S10, registry |
| Per-run LLM budget caps with a hard stop; a Haiku-only fallback | indexer |
| Research hygiene: scripts use a neutral User-Agent (note 14 V-D records one script that sent the operator's address to third parties) | all fetchers |

### 14.4 Other risks

- A false link that survives review prints a fake arbitrage; reviewer catch rate is unmeasured. Mitigation: G12, G14, circuit breaker, tier caps, hash pins.
- Value ceiling is low by evidence; judge the product by correctness and reference-price value, not P&L [17 §4; 18 §0].
- XO concentration: 242 of 242 type-2 rows from one creator account and one resolver [A §3.2, M]; a template change re-opens review.
- Gate and lexicon overfitting, lexicon maintenance burden, and entity-alias gaps.
- XO fee model unresolved: can flip the sign of true edges (verified-true edges of 5 to 164 bps sit inside the fee-schedule uncertainty [17 V2.7]).
- Rule drift over days is unmeasured; the silent-slot problem (Kalshi text silent in 60%) means unknown void policy must block, not default.
- Venue schema drift (Kalshi ships weekly; Polymarket v1 retires 2026-10-24): fixtures and contract tests, fail closed on unknown enums [AD §8.3].
- Aggregator and directory perishability (at least six aggregator-type services died or went dark in 2026 [14 §8.3]): no runtime dependency.

---

## 15. Open questions

1. **Reviewer time per template, instance and anomaly, and who reviews with what authority.** NOT MEASURED. Decides whether the registry scales.
2. **XO events or group-id endpoint.** NOT FOUND (searched: Data API OpenAPI tags, xo-docs filesystem [16 §3.3, V-K4]); only the public earning-pools route carries `eventId`/`eventSlug` for reward-enabled markets. Without it each XO rule check costs one detail request.
3. **XO fee truth.** `/fee-rate` returns 0, `effectiveFeeConfig.takerFeeBps` is 400 or 0 per market, and the field is named `FLAT_BPS` while docs describe a `p(1-p)` curve; blocks `executable` until two real fills reconcile.
4. **Recall outside the old linker's pool**, and whether BM25 plus embeddings at k = 20 reaches the published 99.9% on our corpus (NOT MEASURED).
5. **Drift rate of rule text over days** (only a 4-minute determinism check exists).
6. **Pricing the UTC-versus-ET cutoff offset** (about 5 hours) as a `timing` reserve versus excluding such pairs from "arbitrage" [16 §13 Q2].
7. **Kalshi data terms.** May a dataset of tickers and rule hashes ship? May the recorder keep derived features? Is the Developer Agreement superseded?
8. **Settlement wedge.** The measured annualised settlement wedge (arXiv 2605.31431) should replace the 5% to 8% hurdle; unread by every design and by me.
9. **Does maker-side execution** (Kalshi Fed series carry maker fees; Polymarket rebate 0.25, taker-only fees [18 V22]) change the picture for the 40 to 250 bps verified links? Untested.
10. **Cross-venue ladders and partitions** at depth with fees: only one-instant panel measurements exist (FOMC); the studies of 16 to 18 did not price them [17 V6].
11. **Reconciling the author's "self-trading always allowed" with XO's wash-trading and influence clauses** (recorded in AD §10, still unreconciled).
12. **Whether sending public market text to a model vendor is acceptable**, and whether the links dataset is published (ids and hashes only) or kept private.
13. **Time-series questions the snapshots cannot answer:** do edges appear around events (kickoffs, announcements), and how long do they persist at depth?

---

## 16. Graft provenance and rejected items

| Element | From | Why | Where |
|---|---|---|---|
| Proof levels P0 to P4, asymmetric authority, closed-world unknowns, determinism contract | A | makes precision structural and cheap to test | sections 0, 5, 6 |
| Exhaustiveness ladder E0 to E4 | A | closes the Kalshi two-leg false positives | 6.2 |
| Slot gate with orientation proof; rule-difference axes; masked-hash template pins; template-pair review | A | highest measured precision; review unit shrinks about 20x on XO football | 6.3 to 6.7 |
| Edge-size circuit breaker; adversarial-creator guard | A | false-link and XO-concentration evidence | G7, G8 |
| Slot semantics for void, postponement, tie, early close, exceptions with a `basis` field; "silence is not equality" | B | 60% of sampled Kalshi texts are silent | 5, 6.5 |
| Offline BM25 plus embedding retrieval (entity-masked variant), review-only | B | reaches the long tail that templates cannot (32 of 98 XO non-sports counterparts) | S4 L2 |
| Metamorphic probes; blind subset and canaries; two-key for `executable_eligible`; vote diversity from model, prompt and ordering | B | tests the LLM path; guards reviewer anchoring | 6.6, G14 |
| Signed dataset plus revocation feed; `pm_get_cluster`; reserve update weighting by 4p(1-p) | B | dataset path and cluster batching; stops near-certain markets deflating `delta` | 8, 10, 11 |
| Gap-plausibility veto bands and class scale; "hold: re-verify rules" on a large z | C | cheapest independent check; reproduced from fixtures (in-sample) | G8 |
| Recorder from day 0 (Polymarket, XO, Limitless; Kalshi none until written permission); `Block` metadata partition before any pairwise statistics | C | history cannot be bought back; unblocked screening yields about 1,000 spurious pairs per 1,000 contracts at abs(rho_1d) at least 0.5 (M) | S15 |
| Order-polytope cover rows; payoff ratio versus variance ratio kept separate; pre-registered day-90 kill test; fit-on-N, score-on-N+1 | C | O(m) ladder rows; avoids conflating hedges; honest test of statistics | 7.1, 13 |
| LP formulation, dual certificate, void rows, tiers | [15 §4], A, B, C (they agree) | one engine for every type | 7 |

**Rejected, with reasons.** Statistical hedge sizing, factor groups, lead-lag and reversion execution in the MVP (0 of 273 variants net positive; no taker edge [18 §0]); `PairStats` in link records before day 90; the LLM cascade as a promoter or as an unattended gate (5 of 8 out of sample; correlated errors); per-link review for templated families (A's template-pair unit is 20x cheaper); a hosted vector store or hosted matching API before user feedback loops justify it; any third-party matcher at runtime (personal-use, Enterprise-only, at least six aggregator-type services dead or dark in 2026); recording raw Kalshi quotes; treating persistence or co-movement as evidence of validity.

---

## Sources

**Repo files read in full or in the cited sections.** `docs/plan.md`; `docs/aggregation-design.md` (sections 0 to 13 and Appendix A); `docs/phase0-gate-results.md` (headings, sections 0, 3, 6); `docs/platform-registry-design.md` (summary and section 4 only; it appeared while I worked); the three designs `docs/research/design-panel/A-structured-first.md`, `B-semantic-first.md`, `C-statistical-first.md` (all); `docs/research/14-platform-of-platforms.md` (sections 0, 1, 9 to 15 and Verification), `15-relationship-taxonomy-literature.md` (sections 0 to 4, Appendices A and B, Verification), `16-linking-methods-services.md` (sections 0 to 3, 5.2 to 5.3, 7 to 14, Verification), `17-empirical-constraint-study.md` (all), `18-correlation-leadlag-study.md` (sections 0, 2.6, 2.7, 3, 4 and Verification). Not read for this task: notes 01 to 13 (reached only through AD, P0 and notes 14 to 18).

**Committed fixtures read as local files** (`docs/research/fixtures/linking/`): `census_true_links.csv`, `audit_sample_labeled.json`, `link_labels_keyed.json`, `cross_candidates_top.csv`, `final_summary.json`, `xo_kalshi_ucl_top_of_book_2026-10-18.json`.

**My scripts** (stdlib Python 3, run with `python3 -I`; in `<scratch>/judge-linking/`, not in the repo): `verify_example.py` (re-types the [15 §4.7] instance; primal re-evaluation, exact weak-duality bound, dual-vertex enumeration; uses `lp_note15.py`, the project's own exact solver extracted from [15 App. A], only as a candidate generator), `verify_more.py` (AGI ladder, typed vs mistyped link, haircut arithmetic, Wilson bounds, zero-failure n, Beta quantiles, cost arithmetic, hazard prior), `verify_fixtures.py`, `verify_census.py`, `verify_census2.py` (gap veto and UCL fixture checks), `cp.py` (Clopper-Pearson bound). **Network requests made: none.**

**Short quotes relied on (at most 25 words).** "Arbitrage-free prices are exactly the convex combinations of valid payoff vectors." (Kroer et al., as quoted in [15 §0, V0]). "a link that shows a profitable edge is a false link more often than not" [17 §2.5]. "a real inconsistency would not be 50x the fee-adjusted spread" [17 §2.4]. "at most one market in this event can resolve to 'yes'" (Kalshi OpenAPI, [16 §3.2, V]). "Nothing has ever been submitted to XO" (Predictefy docs, [14 V-B]). "must implement pre-trade risk controls including order throttles, price collars, and kill switches" (Polymarket US Rulebook 5.2(i), [15 V0]).

**Suspicious or agent-directed content.** None encountered in the files I read that was addressed to me. Agent-directed banners and README sections in third-party vendor docs are recorded in [14 §14, V-D] and [16 §13] and were not followed there; this document treats all third-party and market text as data.
