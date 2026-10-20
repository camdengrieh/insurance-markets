# C. Statistical-first design for market linking and relationship arbitrage

> **Status (2026-10-19): design only, no code.** Panel C of three independent designs for the market-linking and relationship-arbitrage subsystem. Assigned philosophy: **statistical first** (price co-movement, lead-lag and spread dynamics propose candidate links and factor groups; logical and rule checks decide whether a candidate may be trusted; hedge ratios size positions; hard-constraint arbitrage is the special case of a broader relative-value engine). Companion to `docs/plan.md` and `docs/aggregation-design.md`; it does not restate their venue, PayBox or legal material.
>
> **What I read.** In full: `docs/plan.md`; notes 14, 15, 16, 17, 18 including their appended "Verification (2026-10-19)" sections (which override the researcher text); `docs/aggregation-design.md` sections 0 to 13; note 10 sections 4 to 6 and its verification; the top of note 12. **Not read in full:** notes 01 to 09, 11, 13 and `docs/phase0-gate-results.md` (headings only). Facts from them reach this document only through `aggregation-design.md` and notes 14 to 18, and are tagged M. `docs/research/venues/*.md` and `docs/venue-census.md` did not exist when I worked.
>
> **Tags.** **H** first-hand: read in a primary source, or measured by me this session (script and sample size given). **M** secondary or inferred (including numbers I take from a verified research note; the note is cited). **L** weak or stale. **D** a design default chosen here, to be calibrated, not a finding. "NOT FOUND (searched: ...)" marks a documented absence. Citations: `[NN §x]` is section x of `docs/research/NN-*.md`; `[NN V-x]` an item of that note's verification section; `[AD §x]` is `docs/aggregation-design.md`. **My own measurements** are `M1` to `M12` in section 1.3 and use only (a) the researchers' committed fixtures under `docs/research/fixtures/linking/` read as local files and (b) 42 public GET requests (section 17).
>
> **Dates and staleness.** Today is 2026-10-19; the machine clock during my live reads was Sun 2026-10-18 19:42 UTC, as in the other notes. Flagged possibly stale (before 2026-04-19): Saguillo et al. (2024-25 data), Portnaya (2023 contract), Tsang and Yang (2024 election data), Kalshi Developer Agreement v1.1 (2023).

---

## 0. Summary

1. **Scope.** The linking subsystem decides which contracts on which venues are related, how (relation type and payoff matrix), how far to trust that link, what the executable edge is after depth, fees, lock-up and resolution risk, and how to hedge what is not payoff-identical. Venue adapters, PayBox execution and Quotient plumbing stay as in `[AD]`.
2. **What the evidence lets statistics do.** Statistics are a weak discoverer and a strong triager. Quotes are unchanged in 96.2% (Polymarket median) and 97.9% (Kalshi median) of 5-minute bins [18 §2.2 H]; 14 of 41 relationships in the 18 panel have a leg with fewer than 100 quote changes in the window (M3). A daily co-movement screen (abs(rho_1d) >= 0.5) recovers 9 of 22 testable hard-linked pairs (41%; 7 of 13, 54%, where both legs have >= 100 changes) and **0 of 6 implication pairs**, while only 1 of 510 cross-topic pairs passes it (0.2%, Wilson 95% 0.03% to 1.1%) (M4). So co-movement is **high-specificity, low-sensitivity evidence for "related"**: its presence supports a link, its absence says nothing. It never says "identical".
3. **The strongest statistical lever I found is the size of the apparent edge itself.** Among candidate cross-venue links that *show a positive net edge* (the only ones that would ever be surfaced as arbitrage), the 17 verified-true links have net edge 4.9 to 245.9 bps (median 45.7) and the 30 audited false links have 154.6 to 103,882 bps, with 28 of 30 above 300 bps (M1). A gate "net edge above 300 bps means probable false link" flags 28/30 false links (Wilson 0.79 to 0.98) and keeps 17/17 true ones (Wilson lower bound 0.82). In a leave-one-out logistic scorer on the 78 audited links, adding the gap lifts AUC from 0.902 to 0.952 (M2). It is in-sample, small-n and single-rater, so I use it only as a **veto and escalation trigger**, never as an approval.
4. **Asymmetry rule (the design's central safety property).** Statistics may *propose* candidates, *rank* the review queue, *demote or quarantine* links, *monitor* approved links, and *size* hedges. **Only rule evidence plus human approval plus pinned rule hashes may promote a link to any label stronger than `indicative`.** A false link is a fake arbitrage; statistical evidence is not rule evidence.
5. **One engine.** Every cluster is evaluated by a hard floor (the guaranteed-profit LP over a state set that includes void and divergence states [15 §4]) and a soft term (expected edge against a model fair value with a residual-risk budget). Hard-constraint arbitrage is the special case where residual variance is zero and the variance-minimising hedge ratio equals the payoff-matching ratio. Labels follow the hard floor; the soft term can only produce `relative_value_signal`.
6. **Data model.** `Contract` (outcome-level), `Relation` (n-ary, typed, with an evidence vector and a state machine), `HardCluster` (connected component of verified hard relations, owns a state space), `Block` (cheap metadata partition used before any pairwise statistics), `FactorGroup` (soft statistical grouping, never a trade basis), `PairStats` (baseline spread, beta, correlation with `as_of` and TTL), `Label` (gold set), `Resolution` (post-settlement agreement log). Section 3.
7. **Pipeline.** S0 recorder, S1 parse and rule hash, S2 blocking, S3 structural candidates, S4 statistical candidates and factor groups, S5 relation typing and constraint instantiation, S6 rule diff and divergence axes, S7 trust posterior, S8 human approval and hash pinning, S9 baseline fitting, S10 runtime verifier and edge engine (the only stage inside the plugin), S11 monitoring and settlement reconciliation. Section 4.
8. **Start the recorder first.** History cannot be bought back: XO publishes no usable series (trade ticks, about 60 minutes for the busiest market) [18 §2.10 H], Polymarket keeps 1-minute data about 7 days [18 §1.1 H], Kalshi serves 3.4 days of 1-minute candles per request. Detecting a daily correlation of 0.5 needs 30 independent days and of 0.3 needs 85 (Fisher z, power .80); with the observed share of active days, 31 to 127 and 87 to 372 calendar days (M6). Statistical candidate generation is therefore a day-90 experiment; the recorder is a day-0 task.
9. **Expected yield is low and the design says so.** One cross-venue complete-set test on the October 2026 FOMC decision (XO 5 markets, Polymarket 5, Kalshi 5) found best-of-three-venues sum of asks 1.010 against 1.020 for the best single venue, and -2.3 cents per set after fees at the touch (M9). Net edge of verified-true links is thin and long-dated [17 §2.6]; no taker-side statistical edge survived frictions in 41 relationships [18 §0]. The product is a verified, monitored link graph with calibrated trust, reference prices, and rare alerts, not a P&L engine.
10. **MVP cut (section 14).** Build: recorder, parse and rule hash, structural LP, gap-plausibility veto, trust posterior with human approval, runtime verifier. Cut or defer: statistical candidate generation (behind a pre-registered day-90 test), factor groups, lead-lag features, pairs or reversion trading, covariance-based sizing, cross-asset (Deribit) links.

### 0.1 Decisions this document proposes (for the author; D-numbers continue `[AD §0.4]`)

| # | Proposal | Why |
|---|---|---|
| S1 | Run an hourly recorder over the working set from week 0 (XO ACTIVE rows across types 0 to 4 plus linked counterparts) | History is the one input that cannot be bought later; cost is small (section 11) |
| S2 | Adopt the **asymmetry rule** (statistics veto, demote, rank, monitor, size; never promote) | A false link is a fake arbitrage; measured gated precision did not replicate out of sample [16 V-K2] |
| S3 | Ship the **gap-plausibility veto** in the MVP: net edge > 300 bps on a non-mirror link is quarantined; 100 to 300 bps requires a typed rule-diff record | Cheapest independent check found; 0 of 17 true links above 246 bps (M1) |
| S4 | Statistical candidate generation (S4) only after day 90, behind a pre-registered test with kill criteria (section 13.4) | Power is low; value unproven |
| S5 | No lead-lag or reversion execution; lead-lag only as annotation | 0 of 273 variants net positive except 2 cost-model artefacts [18 §2.9, V-C6] |
| S6 | Keep `executable_arbitrage` disabled until D2 of `[AD]` holds | Inherited |
| S7 | Ship baseline statistics inside each link record with `as_of` and `ttl_days`; stale or missing statistics are ignored, never trusted | Plugin is stateless (section 10) |
| S8 | Never use XO-only price statistics as evidence for links to markets whose creator can trade them | Self-trading is allowed by decision [plan.md] and wash-created co-movement is free |

---

## 1. Evidence I design against

### 1.1 Constraints from the research, and what each forces

| # | Evidence | Tag and source | Design consequence |
|---|---|---|---|
| E1 | Mid changes in 3.8% (Polymarket median) and 2.1% (Kalshi median) of 5-minute bins; median 408 changes per leg in 57 days (range 4 to 2,532) | H [18 §2.2] | Every statistic carries an activity tier; tests are gated on change counts |
| E2 | Epps effect: Fed hike pair rho 0.75 / 0.85 / 0.97 at 5 min / 1 h / 1 day; Senate pair 0.00 / 0.10 / 0.54; ladders median hourly 0.35, daily 0.72 | H [18 §2.3] | Daily (and hourly for active legs) grids only; nothing below 5 minutes |
| E3 | Fees and spreads remove about 90% of the apparent same-event gap before lock-up: after spread 50.6%, after fees 9.3%, after a 5% annualised hurdle 3.0%, after 20% 0.0% (13 pairs) | H [18 §2.6, V-B1] | Cost model is the first-class citizen; statistics never replace it |
| E4 | No taker-side latency or reversion edge: 0 of 273 follow-the-leader variants net positive except 2 artefacts; reversion back-test net negative for 13 of 13 pairs (gross +0.2 to +3.1c vs cost 3.9 to 8.5c). Verifier: best long-hold BTC variants are 2x to 3x too small, not 15x to 100x | H [18 §2.5, §2.9, V-C6] | No statistical execution engine |
| E5 | Within-venue structure almost never violated net of fees: 706 sell-side sets, 50 gross-positive, 0 net; ladders 10 inverted on books, 3 net worth USD 13.4 total | H [17 §0, §2.1, §2.3] | The LP mostly emits no-arbitrage certificates; scanning is cheap, expectations low |
| E6 | Cross-venue apparent edge is dominated by false links: title-similarity precision 18% strict / 34% lenient at sim >= 0.45, 72% / 90% at >= 0.65; among positive-edge links with sim >= 0.65 only 13 identical + 4 minor-difference of 30 | H [17 §2.5], single rater | Edge size must be treated as evidence about link validity |
| E7 | Verified-true cross-venue edges: median 46 bps, p90 164, max 246; capital median USD 991; lock 10 to 751 days; 0 of 13 identical survive tail-leg + persistence + USD 10 + 5% APR filters | H [17 §2.6, V1] | Calibrates the plausible-gap distribution (section 6.2) |
| E8 | 14 of 43 audited true links (33%) carry a documented rule difference; after the verifier's re-labelling only about 9 to 10 of the 17 positive true links are strictly identical | H [17 §2.5, V2.6] | Rule-diff record per link; link-specific haircut, not a global constant |
| E9 | Gated text matching: 23/23 in-sample, 5/8 strict (7/8 lenient) on a fresh XO subset with one clear entity-swap false link | H [16 §7.9b, V-K2] | Text gates are candidate generators; human approval stays |
| E10 | Resolution divergence is invisible to price statistics: Khamenei "out" markets paid $1.00 on Polymarket and $0.02 on Kalshi; "shut down on Feb 14" paid YES on Kalshi while "new shutdown by Feb 14" paid NO on Polymarket | H [15 §8.1 R1, R2] | Rule evidence is mandatory; a stable spread proves nothing about payoffs |
| E11 | Lead-lag exists only in spot-driven pairs and ladders (Polymarket first on the three cross-venue BTC reach rungs at hourly grid; nearer ladder rung first) but a faster quoter looks like a leader (test T7); 1-minute Fed lead is not identified | H [18 §2.4, V-C4, V-C5, §1.5] | Annotation only: "faster quoter", never "information" |
| E12 | Spread half-lives are hours to about half a day and regime dependent (Fed pairs 6 to 8.5 h OLS, 9.5 to 11.2 h with an instrument; sub-window range 3 to 17 h); hourly Fed rho was 0.015 / 0.113 in the first 42 days and 0.88 / 0.89 in the last 42 | H [18 V-C7, V-C4] | Baselines expire (TTL 7 days), carry a regime flag, use the instrumented estimator |
| E13 | One intra-Kalshi identity (rate above 4.00% vs hike 25 + hike more than 25) was the only net-positive episode source: 42 of 8,640 five-minute bins, 14 episodes, max 5.5c, depth unknown; Kalshi Fed series carry maker fees | H [18 §2.7, V missed 3] | Intra-venue identities are first-class relations and worth live monitoring |
| E14 | XO: 421 ACTIVE rows across market types 0 to 4 (166 user-created type 4, thin); list rows lack rules and `rootEventSlug`; intra-XO duplicates across types and creators exist; resolution MANUAL with creator-specified resolver; `neg_risk` false | H [16 V-K1, V-K3], M [AD §3.2] | Within-venue identity links are needed; rule text needs a detail request per market |
| E15 | Plugin: single-file ESM <= 10 MiB, 10 s per call, fresh sandbox, no state, <= 16 exact hosts, stdout <= 256 KiB | M [AD §1.1], [16 §10.1] | Section 10 split |
| E16 | Self-trading by a creator is allowed by author decision; XO ToS also bars influence over outcome and wash trading | M [AD §10], [10 V10] | XO-only price statistics are manipulable evidence (S8) |
| E17 | Kalshi Developer Agreement v1.1 (2023, possibly superseded): own trading only, no caching, aggregating or storing | M [AD §10], L (stale) | The recorder cannot assume the right to store and republish Kalshi data; `record_policy` per venue (section 3.4) |

### 1.2 Numbers I refuse to design against (refuted or corrected by the verifiers)

| Claim in a note body | Status | What I use instead |
|---|---|---|
| "Gated deterministic matching has precision 1.00 (23/23, Wilson 0.86 to 1.00)" [16] | In-sample; 5/8 strict on a fresh XO subset [16 V-K2] | 5/8 (Wilson 0.31 to 0.86); human approval required |
| "485 of 868 cross-venue link pairs are net-positive" [17] | Counts link pairs, about 293 distinct markets; Polymarket-involved pairs only 5% priced [17 V2.3, V2.4] | Per-market counts; census of labelled links |
| "0 stale books; stale or crossed books explain about 0" [17] | Vacuous: the staleness flag cannot fire; only "0 crossed" is real [17 V2.1] | Staleness is unobservable from public GETs; use fetch time and skew limits |
| "Fuzzy title linking is not a detector" [17] | Property of that tf-idf linker only [17 V2.5] | Parse-based matching expected to recover more; measured on the gold set |
| "Label time is observation time (alpha = 0), pinned" and "no lead down to 1 minute" [18] | Polymarket value can lead by up to 60 s; 1-minute lead-lag is not identified [18 V-C1, V-C4] | No sub-5-minute inference |
| "Polymarket leads Kalshi only on the BTC basis pair" [18] | Also BTC 110k and 120k reach rungs; BoP sweep weakly [18 V-C5] | Annotation per pair with BH and stability |
| "Lead-lag is 15 to 100 times too small" [18] | 2x to 3x for best long-hold BTC variants; more than 10x for one-bin holds [18 V-C6] | Still net negative; no execution |
| Half-lives 6.0 to 8.5 h [18] | Biased short by quote noise by 1.3x to 1.6x; unstable across sub-windows [18 V-C7] | Instrumented estimator, regime flag |
| Limitless "no lead-lag detectable", rho 0.968 after a +30 min shift [18] | The shift was chosen on the same data to maximise rho(0): tautological [18 V-C3] | Treat Limitless as a Polymarket mirror quoter; no inference |
| "Edges last seconds" [15] | A majority of observed negRisk CLOB episodes outlasted the window; long-dated sets stay open tens of minutes or longer [15 V1.1] | Persistence is per-class and measured by my shadow log |
| 4 of 8 Polymarket sets positive after fees (Gamma bestAsk) [15] | Gamma lagged the CLOB (Resident Evil 0.993 vs 1.007) [15 V1.2] | CLOB books only |
| "All eight relation types reduce to one hull test" [15] | Types (g) and (h) have no hard constraint [15 V1.3] | Two-term engine (section 2.2) |
| 8% APY hurdle [15] | An assumption; a measured settlement wedge exists (Gebele and Matthes 2605.31431, which I did not read) [15 V1.9, V3.1] | Hurdle is a parameter; replace after reading that paper |
| "XO has 257 ACTIVE rows, 95% one creator" [16] | Scope artefact of `marketScope=withClob`; 421 across types 0 to 4 [16 V-K1] | 421, with thin type-4 books |
| "River Markets does not link equivalent markets"; aggregator survey presented as complete [14] | River has `generic_asset_id` groups; AGG, Predikt, CoinRithm were missed [14 V-A1, V-A4] | Section 15 |

### 1.3 My own measurements this session (all H, with limits)

Scripts are in `<scratch>/design-C/` (stdlib Python, run with `python3 -I`). Inputs are the committed fixtures, so each M-item except M9 and M12 is reproducible from the repo.

| ID | What | Sample | Result | Limits |
|---|---|---|---|---|
| M1 | **Gap-plausibility gate** (`gap_gate.py`): net edge of verified-true links vs audited false links | True: `census_true_links.csv`, 17 links (13 identical + 4 minor-difference), sim >= 0.65. False: 30 audited X links with positive best net edge (`audit_sample_labeled.json`) | True 4.9 to 245.9 bps, median 45.7. False 154.6 to 103,882 bps, median about 1,500. Flag when > T: T=250 or 300 flags 28/30 false (0.93, Wilson 0.79 to 0.98) and keeps 17/17 true (Wilson LB 0.82); T=200 keeps 15/17; T=500 flags 22/30; T=1,000 flags 17/30. AUC of net bps (false higher) 0.990 | T chosen after seeing the data (in-sample). Populations differ in similarity strata (true side sim >= 0.65; only 3 of the 30 false links have sim >= 0.65). Single rater; label policy applied inconsistently [17 V2.6]. Dust and tail-leg rows included |
| M2 | **Link scorer, leave-one-out logistic** (`gap_gate.py`) | 78 audited links: 43 true (I + Dm), 35 X | AUC sim only 0.902 (bootstrap 0.816 to 0.970); sim + log-gap + positive-edge flag 0.952 (0.890 to 0.995). Inside the 35 positive-edge links: AUC of gap 0.993, of sim 0.780 | Stratified sample, one LOOCV pass bootstrapped (intervals optimistic), 3 features, L2 = 1, single rater |
| M3 | **Activity** (`panel_stats.py`) | 48 legs (31 Polymarket, 17 live Kalshi), 5-minute window; 41 relationships | Changes per leg: min 4, p25 151, median 414, p75 647, max 2,532; legs with >= 100 changes 38/48, >= 400 25/48. 14 of 41 relationships have a leg below 100 changes | Window is 57 days (Polymarket) or 30 (Kalshi grid); panel chosen on current liquidity, so real catalogue is sparser |
| M4 | **Co-movement null and recovery** (`null_comovement.py`): daily mid-change correlation rebuilt from the frozen compact snapshot, 84 midnights to T0 | 43 live legs, 6 topic groups. 510 cross-topic pairs and 118 within-topic pairs with >= 30 overlapping days and >= 10 active days; 22 two-leg hard-linked registered pairs | Cross-topic abs(rho_1d): median 0.088, p90 0.216, p99 0.355, max 0.598; >= 0.5 for 1/510 (0.2%), >= 0.3 for 11/510 (2.2%), >= 0.2 for 71/510. Registered hard-linked recovery: >= 0.5 for 9/22 (41%), >= 0.3 for 11/22 (50%); same-event 5/11, ladders 4/5, implication 0/6. With both legs >= 100 changes: 7/13 (54%); >= 200: 7/9 (78%). Powered misses: Texas Senate 0.29, Vance winner 0.30 (same-event), BTC Kalshi 110/120 ladder 0.45, three implication pairs 0.05 to 0.18. Doc 18's own table: 14 of 28 hard-linked pairs with a daily estimate >= 0.5 | Topic labels are mine; the cross-topic null excludes macro links (BTC vs Fed etc.); one window; the top cross-topic pair (Balance-of-Power vs Iran Oct 31 rung, 0.60) is spurious. Within-block null (after metadata blocking) is **not measured** |
| M5 | **Spread dynamics as a basis flag** (`panel_stats.py`) | 13 same-event pairs, hourly, doc 18 results | Flag "abs(mean)/sd >= 1 or OLS half-life > 24 h" marks 8 of 11 live pairs (all but the two Fed pairs and Texas Senate) | Ground truth for only 2 pairs (Senate rule text differs; BTC is a different contract, both flagged). Unvalidated triage feature |
| M6 | **Power and history length** (`power.py`) | Fisher z, alpha .05, power .80; active-day share per pair (0.23 to 0.98, median about 0.65) | Observations needed: rho 0.5 -> 30; 0.3 -> 85; 0.2 -> 194. Calendar days to reach that with the observed active-day share: rho 0.5: 31 to 127; rho 0.3: 87 to 372 | Ignores autocorrelation and heavy tails (doc 18 block-bootstrap intervals are wider) |
| M7 | **Structure-implied hedge ratio** (`structural_beta.py`): finite-difference slope of the current BTC reach ladder vs realised daily OLS beta | 4 Polymarket BTC rungs (90/100/110/120k), 84 days | OLS beta 0.525 / 0.509 / 0.507 (x->y = 90->100, 100->110, 110->120); implied (84-day mean) 0.745 / 0.482 / 0.644; MAE 0.13; last-day implied 0.676 / 0.355 / 0.535 | One asset class; assumes scale-invariance of touch probabilities. Prior only, not a substitute for regression |
| M8 | **Hedge-quality gate** (`panel_stats.py`): OOS variance reduction >= 0.30 at 1 day and abs(beta_train - beta_test) <= 25% | 30 relationships with a daily hedge estimate | Pass 8/30: ladders 4/5, same-event 4/11, implication 0/7, factor 0/5, identity 0/2 | Daily n = 83 (small); train/test split chronological 60/40 |
| M9 | **Cross-venue complete set, October 2026 FOMC** (`fomc_partition.py`), 2026-10-18 19:42:19 to 19:42:23 UTC, 21 GETs per run (reported numbers are from the second run; the first had a completeness bug that treated a venue with no bids on three legs as a complete set, and was discarded) | XO 5 CLOB markets (ids 40263 to 40267, `rootEventSlug` fed-rate-decision-october-2026 on 40266), Polymarket negRisk event "Fed Decision in October?" (5 markets, not augmented), Kalshi `KXFEDDECISION-26OCT` (5 markets, `MECNET`) | Sum of best asks: XO 1.045, Polymarket 1.020, Kalshi 1.030; **best-of-venue per outcome 1.010**. Sum of best bids: XO 1.002, Polymarket 0.997; best-of-venue 1.012 only because of XO bids of 0.3 to 0.8 shares on three long-shot legs. Long set at the touch after fees: XO -4.5c, Polymarket -3.2c, Kalshi -4.8c, best-of-3 **-2.3c** per set. Short set: best-of-3 +0.20c per set on 0.31 sets (USD 1.23 of cost, dust); Kalshi has no YES bids on three legs. XO `effectiveFeeConfig.takerFeeBps` read as 0 (verified present on 40266) | One event, one instant, top levels merged by fee-adjusted price, sequential reads, Polymarket rate 0.05 (Gamma `feeSchedule`), Kalshi 0.07 x p(1-p), "50+ bps" on Polymarket mapped to ">25 bps" on Kalshi (condition-scope assumption) |
| M10 | **True-link gap scale for a market-made pair** (`ucl_gap.py`) | `xo_kalshi_ucl_top_of_book` fixture, 53 outcomes with two-sided books on both venues | abs(mid gap) median 0.0005, p90 0.0100, max 0.0100; gross executable edge > 0 in neither direction (0/53); half-normal scale 0.44c | Single snapshot (18:15 UTC), top of book |
| M11 | **Rule-difference vs gap** (inspection of `census_true_links.csv`) | 13 identical vs 4 minor-difference true links | Minor-difference links have median 153.8 bps (40.5, 73.5, 234.0, 245.9) vs 41.9 for identical; P(minor > identical) 0.83 | n = 4 vs 13; not significant; label policy inconsistent [17 V2.6] |
| M12 | **Request log** | | Kalshi 4, Polymarket Gamma 2, Polymarket CLOB 10, XO Data API 16, XO orderbooks 10 = 42 requests (M9 ran twice), spacing >= 0.3 s, no 429 or 5xx | Far below the 600-per-host cap |

---

## 2. What "statistical first" means here

### 2.1 Roles of statistics, and the asymmetry rule

| Role | Allowed? | Mechanism | Evidence it can work |
|---|---|---|---|
| Propose candidates | Yes, **within metadata blocks only**, from day 90 | S4 pair screening with BH control | Cross-topic null 0.2% at abs(rho_1d) >= 0.5 (M4); unblocked at 1,000 contracts that is about 1,000 spurious pairs (section 11) |
| Rank the review queue | Yes | Trust posterior (S7) | M2: AUC 0.90 to 0.95 |
| Corroborate "related" | Yes, as a likelihood ratio | Co-movement present and powered | M4 |
| **Demote or quarantine** | Yes | Gap-plausibility veto, sign contradiction, regime break | M1 |
| Monitor approved links | Yes | Rolling beta, rho, spread z against `PairStats`; CUSUM | E12 |
| Size hedges | Yes (advisory) | Shrunk beta with OOS variance-reduction gate | M7, M8 |
| Estimate reserves | Yes | Beta-binomial over the settlement-agreement log (section 7) | E10 |
| **Promote to executable or hedged labels** | **No** | Only rules + human + pinned hashes | E9, E10 |
| Decide relation type | Partly | Signature proposes a type; the rule-diff record and parse confirm | M4 (implication has no signature) |
| Execute on lead-lag or reversion | **No** | Annotation only | E4 |

A **statistical channel** can therefore only change a link's *trust score* and *state* in one direction at a time: raise the review priority, or lower trust and suspend. The `verified` state is reachable only through S8.

### 2.2 The unifying object: a relative-value engine whose hard part is the arbitrage LP

For a cluster with contracts `J`, a state set `Omega` (verified hard relations plus reserve states) and an optional factor model:

```
maximize   U = t_hard  +  w_soft * m_soft  -  kappa * risk_res
t_hard  <= PnL_w(x, y)        for every w in Omega_hard U Omega_reserve        (epigraph of the worst case)
m_soft   = sum_j n_j * (mu_j - c_j)         over contracts allowed to carry a model view (mu_j = shrunk fair value)
risk_res = sqrt( n' Sigma_eps n )           residual sd over the holding horizon after the factor hedge
s.t.      factor exposure  sum_j n_j * beta_j = 0 ;  per-order and daily caps ;  depth bounds on every ladder level
```

- `PnL_w` is the payoff-matrix P&L of section 5.1 (fee-adjusted levels, lock charge, void rows).
- `w_soft = 0` and `kappa` irrelevant gives exactly the guaranteed-profit LP of `[15 §4]`. **Hard-constraint arbitrage is the case Sigma_eps = 0**: all members are payoff-identical in the non-reserve states, `beta_j = 1`, so the min-variance hedge and the payoff hedge coincide and `m_soft = t_hard`.
- Labels follow the hard part only (section 5.5). The soft part yields `relative_value_signal` with an explicit "not locked" flag. In the MVP `w_soft = 0` everywhere.
- Two hedge ratios exist for two purposes and must never be conflated: the **payoff ratio** (from the payoff matrix; governs terminal risk; 1:1 for a ladder violation) and the **variance ratio** beta (from history; governs interim mark-to-market risk; about 0.51 for adjacent BTC reach rungs). Example E4 in section 8.4.

### 2.3 Where statistics have power

Power is set by the number of independent informative observations, not by the number of timestamps (M6). A 5-minute correlation of two legs with 40 changes each is estimated from tens of moves. Table of what I expect to be testable, from M3 and M4:

| Population | Expected testable? | Basis |
|---|---|---|
| Scheduled macro events with active legs (Fed decision), crypto threshold ladders, near-term sports | Yes (rho_1d 0.7 to 0.97) | [18 §2.3] |
| Cross-venue same-event pairs on long-dated politics | Mostly no (rho_1d 0.06 to 0.30 although the events are identical) | [18 §2.3]; M4 misses |
| Implication and nested-event pairs | No (rho_1d 0.04 to 0.18 even when powered) | M4 |
| XO markets | Not at all until self-recorded: no usable history | [18 §2.10] |
| Newly created markets (first 6 hours) | No (creation placeholder: a 55-cent ladder violation for 20 minutes) | [18 §2.7] |

---

## 3. Data model

### 3.1 Entities and identifiers

```ts
type VenueId = "xo" | "polymarket" | "polymarket_us" | "kalshi" | "limitless" | "trueo" | "predictfun" | "opinion" | "hyperliquid" | ...;
type CID = string;   // `${venue}:${marketId}:${outcomeIndex}`; XO/Polymarket marketId = conditionId, Kalshi = ticker, Limitless = slug, Trueo = `${chainId}:${address}`
                     // the contract is the YES-side token of an outcome; the NO side is the mirrored book of the same contract [15 §2]

interface Contract {                       // extends pm-core Market/Outcome in [AD §2.1]
  cid: CID; venue: VenueId; native: { eventRef?: string; seriesRef?: string; groupKey?: string; rootEventSlug?: string };
  title: Untrusted<string>;
  parsed: {                                // S1 output; every field nullable, with a parser confidence and the source span
    entity?: string; entityIds?: string[]; metric?: string; operator?: "gt"|"gte"|"lt"|"lte"|"eq"|"between"|"touch_high"|"touch_low"|"close_above"|"close_below"|"win"|"advance"|"by_date"|"on_date";
    threshold?: { value: string; unit: string };            // decimal string
    window?: { startUtc?: string; deadlineUtc?: string; deadlineTzSource?: "utc"|"et"|"other"; inclusive?: boolean };
    polarity: "cumulative" | "survival" | "point_in_time" | "unknown";                              // date ladders: direction of monotonicity
    outcomeKind: "binary" | "multi_exhaustive" | "multi_exclusive" | "ladder_rung" | "range_bin" | "unknown";
    orientation?: { yesMeans: string };                      // head-to-head: which side is YES; never inferred from outcome order alone
  };
  rules: { sha256: string; sources: string[]; mechanism: "uma_oo"|"exchange"|"xo_manual"|"chainlink"|"external_parity"|"optimistic_council"|"unknown";
           voidPolicy: "fifty_fifty"|"refund"|"last_price"|"scalar"|"unknown"; exceptions: ExceptionClause[]; canCloseEarly?: boolean; cutoffUtc?: string };
  status: Status; times: { closesAtUtc?: string; expectedResolutionUtc?: string; latestResolutionUtc?: string };
  fee: FeeSpec; tick: string; activity: ActivityTier;       // activity from the recorder, see below
}
type ActivityTier = "A" | "B" | "C" | "U";   // A >= 400 quote changes in 57 d; B 100-399; C < 100; U unknown (no history). From M3 quantiles. [D]
interface ExceptionClause { kind: "death"|"cancel"|"postpone"|"tie_break"|"early_close"|"other_fallback"|"source_change"; quote: Untrusted<string>; payoffEffect: "void"|"scalar"|"other"|"no_effect" }
```

```ts
interface Observation {                    // append-only, columnar files by day; the recorder's only output
  cid: CID; tFetchUtc: number; tVenueMs?: number;
  bid?: [price: string, size: string]; ask?: [string, string]; depth5c?: string;      // top level + notional within 5c
  book: "native" | "complement" | "listing" | "candle";                               // listing and candle rows are never executable
  skewToPrevMs?: number; flags: string[];
}

interface Relation {                       // n-ary link, the unit of review and of constraint generation
  id: string;                              // sha256(type | sorted member cids | params)
  type: "identical"|"duplicate_in_venue"|"complement"|"partition"|"exclusive_set"|"ladder_threshold"|"ladder_date"|"touch_lattice"
      | "bucket_vs_cumulative"|"barrier_vs_terminal"|"implication"|"joint"|"exclusive_cross_event"|"factor"|"cross_asset";
  members: Array<{ cid: CID; role: "a"|"b"|"rung"|"child"|"parent"|"leg"|"component"|"total"; rank?: number; orient: 1 | -1 | 0 }>;   // orient -1 = YES means NOT-member
  params: Record<string, string>;          // strike list, date list, exhaustiveness claim, bucket edges, tie rule
  evidence: { native?: NativeHook[]; text?: TextEvidence; rules?: RuleDiff; stat?: PairStatsRef; human?: Approval; outcome?: ResolutionLog };
  trust: { prior: number; logOdds: number; posterior: number; calibrationId: string; features: Record<string, number> };
  state: "discovered" | "candidate" | "rule_checked" | "verified" | "suspended" | "quarantined" | "retired";
  basis: { class: "identical"|"settlement_window"|"settlement_source"; axes: Array<"timing"|"source"|"condition_scope">; cutoffDeltaH: number };
  ruleHashes: Record<CID, string>; validUntil: string; schemaVersion: number;
}
interface RuleDiff { relation: string; axes: string[]; outcomeMap: number[]; voidA: string; voidB: string; cutoffDeltaH: number; exceptions: ExceptionClause[]; quotedFragments: Untrusted<string>[]; verdict: "link"|"no_link"|"abstain"; judge: { models: string[]; samples: number; unanimous: boolean } }

interface PairStats {                      // per Relation with two powered legs; refreshed offline, shipped inside the link record
  window: { startUtc: string; endUtc: string; gridHours: number }; asOf: string; ttlDays: number;      // ttlDays = 7 [D]
  nObs: number; nActiveDays: number; activityMin: ActivityTier; regime: { breakUtc?: string; stable: boolean };
  rho1d?: { v: number; ci: [number, number]; n: number }; rho1h?: { v: number; ci: [number, number]; n: number };
  beta1d?: { ols: number; iv: number; shrunk: number; trainTestGap: number; vrOos: number };
  spread?: { mean: number; sd: number; p05: number; p95: number; phiIv: number; halfLifeHIv: number; dfT: number; basisFlag: boolean };
  lead?: { lam: number; ci: [number, number]; pBh: number; stableHalves: boolean; label: "faster_quoter_a"|"faster_quoter_b"|"none" };
}
interface HardCluster { id: string; /* sha256 of sorted member cids + relation ids */ relations: string[]; members: CID[]; stateSpace: StateSpaceSpec; exhaustive: Record<string, "proven"|"by_rule"|"no"|"unknown"> }
interface Block { id: string; key: string; /* canonical story key (subject, metric, deadline day) or venue-native group */ members: CID[]; source: "native"|"parse_key"|"cross_search"|"manual" }
interface FactorGroup { id: string; members: CID[]; loadings: Record<CID, number>; explainedVar: number; stability: number; asOf: string }   // soft; never a trade basis
interface Label { pair: [CID, CID] | string; label: "I"|"Dm"|"DM"|"X"; axes: string[]; rater: string; secondRater?: string; ruleHashes: Record<CID, string>; ts: string; stratum: string }
interface ResolutionLog { relationId: string; resolvedAt: Record<CID, string>; payout: Record<CID, string>; agree: boolean | "void"; lagH: number }
```

IDs are content hashes, so a membership change creates a new `HardCluster` id and forces re-approval of any partition or exhaustiveness claim. `Block.key` for parsed markets is the **story key** `(subject entity, metric, deadline day)` for threshold ladders and `(subject entity, metric, threshold)` for date ladders; it plays the role CoinRithm's "Event ID v1" is described to play across venues [14 V-A4, M], built by us from parsed fields rather than imported.

### 3.2 Link state machine and evidence vector

```
discovered --(S3 or S4)--> candidate --(S5/S6 pass)--> rule_checked --(S8 approve + pin hashes)--> verified
verified --(hash/status/close-time change, break alarm, or settlement disagreement)--> suspended --(re-review)--> verified | retired
candidate/rule_checked --(gap veto, sign contradiction, failed gate)--> quarantined --(human override with rule-level note)--> rule_checked
any --(market resolved)--> retired (+ ResolutionLog)
```

Evidence channels, each stored separately so a wrong channel can be audited: `native` (venue hooks: Limitless `externalSlug` + `rulesHash`, Predict.fun `polymarketConditionIds`/`kalshiMarketTicker`, Probable route, shared fixture ids), `text` (parsed-field equality, similarity), `rules` (offline judge output and deterministic diff), `stat` (PairStats and gap), `human` (approver, date, hashes), `outcome` (settlement agreement).

### 3.3 Clusters, blocks and factor groups (how interrelated markets are batched)

Three nested granularities, from certain to speculative:

1. **Venue-native event** (Polymarket event/negRisk market, Kalshi event ticker or milestone, XO `rootEventSlug` or earning-pool `eventSlug`, Limitless group). Free, but it says "belongs together", not "how" [16 §0.2].
2. **Block**: contracts that *could* be related because metadata says so (same story key, same native group, cross-search hit, same Kalshi milestone). Pairwise statistics run **only inside blocks** (target <= 50 contracts) because the unblocked null alone yields 0.2% spurious pairs at abs(rho_1d) >= 0.5 (M4), i.e. about 1,000 per 1,000 contracts.
3. **Hard cluster**: connected components over `verified` hard relations (identity, duplicate, partition, ladder, implication, exclusion). Owns the state space and the LP. Cross-venue sets are first-class: the October FOMC decision is one cluster of 15 contracts across three venues (M9), which prior studies never evaluated [17 V6].
4. **Factor group** (soft): hierarchical clustering of shrunk daily-change correlations inside a block union; used for risk aggregation and alerts; may suggest relation hypotheses for review; **never** a trade basis or an arbitrage label.

### 3.4 Storage, retention and record policy

| Store | Content | Retention | Notes |
|---|---|---|---|
| Observation files | top-of-book + depth5c per contract per sweep | 400 days raw; hourly and daily mids forever | About 1.2 MB per day per 1,000 contracts at hourly cadence (section 11) |
| `contracts.json`, `relations.json`, `clusters.json` | registry, git-versioned | forever | CI validates schemas; PR per link approval |
| `pairstats.json` | derived statistics with `asOf` | latest + 90 days | Shipped inside link records (Option B dataset) |
| `labels.jsonl`, `resolution.jsonl` | gold set and settlement log | forever | Labels re-validated on any rule-hash change |

`record_policy` per venue: `full` (Polymarket, XO, Limitless; polite polling, explicit User-Agent), `derived_only` (Kalshi until written permission: store ids, hashes, spreads, z-scores, not raw quotes; Developer Agreement s3.1 [AD §10], stale L), `none`. If `derived_only` is unworkable for correlation work, the fallback is per-user, on-demand reads in the agent's own environment (not the operator's server).

---

## 4. Pipeline

| Stage | Input | Output | Runs | Failure handling |
|---|---|---|---|---|
| **S0 Recorder** | Working set (XO ACTIVE types 0 to 4 about 421 + counterparts + contracts of all non-retired relations); venue adapters | `Observation` rows hourly; 15-minute for flagged legs (spot-linked, nearer ladder rung, Fed-type identities); venue clocks and fetch skew | Offline cron | Gaps recorded not interpolated; schema-drift alarm; per-host budget; 429 backoff; no Kalshi raw storage under `derived_only` |
| **S1 Parse and hash** | Title, full rules text (XO detail request per market; Kalshi `rules_primary/secondary`; Polymarket `description`) | `parsed`, `rules.sha256` (NFKC, whitespace-collapsed), exception clauses | Offline + plugin (regex/templates only) | Unparseable fields stay null; null never matches |
| **S2 Blocking** | Parsed contracts, native groups, cross-search (Polymarket `public-search` per XO title), Kalshi milestones | `Block`s <= 50 contracts | Offline | Oversize block is split by deadline day or entity; blocks are provenance-labelled |
| **S3 Structural candidates** | Blocks | `Relation` in `discovered`: native hooks (L0), templates for XO's templated families (football X/Draw/Y triples, central-bank decision sets, "Hit $K by date"), parsed-field equality with orientation; set-level mapping (whole 5-way set to whole 5-way set) | Offline | Entity/direction/date gates are necessary not sufficient (E9) |
| **S4 Statistical candidates and factor groups** (**experimental, day 90**) | Observations over >= 60 days (section 4.1) | `Relation` in `candidate` with `stat` evidence; `FactorGroup`s; lead/lag annotations | Offline | Gated by activity tier; BH within block; pre-registered kill criteria |
| **S5 Relation typing and constraint instantiation** | Candidate relations, parse, native structure | `type`, `params`, state-space generator, LP rows (section 5); 2-axis lattice for touch markets; ladder polarity and direction | Offline; **instantiation also in plugin** | Unknown polarity => `candidate` only; exhaustiveness unknown => short-basket direction only |
| **S6 Rule diff and divergence axes** | Rule texts of all members | `RuleDiff`: relation, axes, outcome map, void policies, cutoff delta, exceptions, quoted fragments | Offline LLM judge (cascade, unanimity) + deterministic checks | Any disagreement or non-allow-listed axis => `abstain`; market text delimited and tool-less |
| **S7 Trust posterior** | All evidence channels, gap at first sighting, calibration table | `trust.posterior` for ranking and veto (section 6.2) | Offline; **veto constants in plugin** | Calibrated on the gold set; reported with Wilson bounds |
| **S8 Human approval** | Queue ranked by posterior, rule diff with highlighted fragments | `verified` link, hashes pinned, reviewer, date, `validUntil` (earlier of closes) | Human, PR per link | Second rater on 20%; disagreement => adjudicate |
| **S9 Baseline fitting** | Observations of verified links | `PairStats` (instrumented AR(1), regime test, shrunk beta, OOS VR), `ttlDays` 7 | Offline weekly | Fit refused below activity gate; stats carry the window |
| **S10 Runtime verifier and edge engine** | Link record (with `PairStats`), live books and detail for each leg | Hash/status/close-time check; fee-adjusted depth walk; LP; gap veto; z against baseline; tier and reasons | **Plugin** | Any mismatch => `suspended` with reason; unknown fee model fails closed |
| **S11 Monitoring and settlement** | Rolling observations; both legs' resolutions | Break alarms (CUSUM on spread, rolling beta); `ResolutionLog`; delta updates; labels from disagreements | Offline daily | A single settlement disagreement retires the link |

### 4.1 S4 in detail (candidate generation inside blocks)

1. **Eligibility.** Both contracts tier A or B (>= 100 quote changes in 57 days), >= 60 overlapping days, >= 30 active days (M6), outside the first 6 hours of life, not resolved, no settlement point (drops the clamped payout artefact [18 §3.2]).
2. **Cheap screen.** Daily mid-change Pearson rho on a UTC-midnight grid; keep abs(rho) >= 0.3; Fisher-z p-values; **Benjamini-Hochberg q = 0.05 over all pairs in the block** (D). Hourly grid only for tier-A pairs.
3. **Full battery only for survivors** (about 1.7 core-minutes per relationship in doc 18's rerun, section 11): moving-block bootstrap CI (5-day blocks), instrumented AR(1) half-life on the level spread, Dickey-Fuller t, OLS and instrumented beta with chronological 60/40 split, sign concordance of co-moves, ordering share (`p_i <= p_j` in >= 99% of bins), sum-level deviation for sets.
4. **Signature to hypothesis** (table in 5.2). Output is a **hypothesis with a type**, written to `candidate`; it must still pass S5, S6, S7 and S8.
5. **Lead-lag annotation.** Cross-correlation asymmetry on 5-minute and hourly grids; label `faster_quoter_x` only if BH q = 0.10 and the bootstrap CI excludes zero, the sign is the same in both halves of the window, and each leg has >= 200 events [18 §3 item 4, V-C5]. Interpreted as quote speed (test T7), never information.
6. **Factor groups.** Distance `d = sqrt(0.5 (1 - rho_shrunk))`, `rho_shrunk = (1 - w) rho + w rho_prior` with `w = n0/(n0 + n_eff)`, `n0 = 30` (D) and `rho_prior` = 0.3 for same-block pairs and 0 otherwise; average linkage cut at rho 0.5; keep groups with bootstrap stability >= 0.8 (Jaccard over 100 five-day-block resamples); loadings from the first principal component.

Pre-registered test and kill criteria are in 13.4.

---

## 5. Relationship types: detection and constraints

### 5.1 The generic LP (the one place the constraints live)

Contracts `j` (YES side), ask ladder `(a_jl, u_jl)`, bid ladder `(b_jl, v_jl)`. Per-share taker fee `phi_j(p) = theta_j p (1-p)` read per market at quote time (Polymarket `feeSchedule`, Kalshi series `fee_type`/`fee_multiplier` plus event overrides, XO `max(/fee-rate, effectiveFeeConfig.takerFeeBps)` [AD §3.3]); lock rate `lambda_j = rho * T_j / 365` with `T_j` the latest plausible resolution including the dispute tail. Variables: `x_jl in [0, u_jl]` shares bought at ask level `l`, `y_jl in [0, v_jl]` shares sold at bid level `l` (equal to buying NO at `1 - b`; mirrored books are one liquidity pool, never two [15 §2]), `t` free.

```
effective buy cost   at_jl = a_jl + phi_j(a_jl) + lambda_j * a_jl
effective sell value bt_jl = b_jl - phi_j(b_jl) - lambda_j * (1 - b_jl)
maximize   t
s.t.  t <= sum_j A[w][j] * ( sum_l x_jl - sum_l y_jl )  -  sum_jl at_jl x_jl  +  sum_jl bt_jl y_jl     for every state w in Omega
      sum_jl at_jl x_jl + sum_jl (1 - bt_jl) y_jl <= K                                                (budget; caps)
      lot/tick rounding is applied after solving; the guarantee is re-checked with exact fees and rounding [15 §4.4]
```

- `x = y = 0` gives `t = 0`, so an arbitrage exists iff `t* > 0`. The dual of the state rows is a probability vector `pi` with `b <= E_pi[A_j] <= a` on every top-of-book quote when `t* = 0`: a **no-arbitrage certificate** stored with the evaluation [15 §4.2].
- **Reserve states.** Add rows for void and divergence states with the venue-specific payoff: Polymarket 50-50 `A = 0.5`; Kalshi scalar `A = last price`; XO `VOIDED` refunds funds, so in that row the coefficient of `x_jl` is the fill price `a_jl` (P&L equals minus fees), which keeps the LP linear because the payoff depends on the level bought. Divergence rows for a link with axes: `(i,j)` payoffs `(1,0)` and `(0,1)` with probability weight `delta` only in the expected-value variant; in the robust variant `t` is the worst case over all rows and a cross-venue pair is never riskless [15 §4.7 case D].
- Sequential leg risk (non-atomic fills, Polymarket reverted fills "ghost fills" [15 V3.2], XO taker delay 0.5 to 3 s, Limitless 1.25 s [17 V3]) enters as a legging reserve `eps` and a prefix-fill scenario, not as LP rows.

### 5.2 Per-type table

`a_i, b_i` are best ask and bid of YES; `phi` per-share fee; a violation is an executable edge > 0 after fees. State sets are generators, not stored matrices.

| Type | Structural detection (S3/S5) | Statistical signature (S4, hypothesis only) | Constraint on prices | State set Omega and payoff A | Risk class |
|---|---|---|---|---|---|
| **identical across venues** (a) | Native hook; parsed-field equality incl. orientation; set-level mapping; Oddpool-style `basis_class`/axes from the rule diff | rho_1d >= 0.5 (powered), beta in [0.75, 1.25], abs(mean spread) <= 3c, DF t <= -2.86, sign concordance >= 0.8. Evidence: Fed pairs rho 0.97, beta 1.03, mean +0.14c. Weakness: BTC reach vs Kalshi "above" passes (rho_1d 0.82, beta 0.79) though contracts differ | `p_i = p_j`; edges `b_i - a_j - phi_i(b_i) - phi_j(a_j) > 0` and mirror | `{(1,1),(0,0)}` plus divergence rows `(1,0)`,`(0,1)` and void rows per venue | Hedge with reserve unless approved link, `basis = identical`, axes empty |
| **duplicate in venue** (XO type 2 vs 4; Polymarket duplicate rungs) | Parse equality within one venue; same resolver | Same as identical; typically tiny spread | `p_i = p_j` | as identical, no divergence rows if same resolver and rules | Riskless in payoff space after fees if rules identical |
| **complement in one market** (b1) | Native (YES and NO tokens) | Not applicable (mirrored books) | `a_yes + a_no >= 1`, `b_yes + b_no <= 1` | `{Y,N}` | Riskless; a crossing is a data defect (fetch skew produced a fake one in doc 17: 15/25 mirrors identical at 1.5 to 2 minutes apart vs 24/25 back-to-back [17 §2.2]) |
| **exhaustive exclusive set / partition** (b2: negRisk, bucket set, FOMC decision set, cross-venue sets) | Polymarket `negRisk` and not `negRiskAugmented` + default rule read; XO/Kalshi sets only with an explicit exhaustiveness judgement; set-level cross-venue mapping | Sum of mids in [0.97, 1.03] for >= 95% of hours over >= 30 days; members' daily changes negatively correlated. **Cannot prove exhaustiveness**: it rejects obviously partial lists (next Pope sum 0.37) but not a set that is exhaustive except a 1% tie state, which is exactly the 10 Kalshi two-leg false positives (sum of asks 0.988) [17 §2.1] | `sum a_i + sum phi >= 1` (long edge `1 - sum a - sum phi`); `sum b_i - sum phi <= 1` (short edge `sum b - 1 - sum phi`) | `Omega = {1..n}`, `A = I_n`; add void rows | Riskless if exhaustive by rule and one resolver; cross-venue: hedged |
| **exclusive, not exhaustive** (b3: Kalshi `mutually_exclusive`, augmented negRisk) | Flag is exclusivity only [16 V-C] | none | `sum b_i - sum phi <= 1` only | `Omega = {0,1..n}`, `A = [0 column, I_n]` | Short basket only; long basket forbidden |
| **threshold ladder** (c1) | Parsed numeric strike + operator; Kalshi `strike_type`/`floor_strike`; same date and source | Ordering share >= 99%; rho_1d 0.3 to 0.95; beta in (0,1); nearer rung leads (4 of 12 ladders in doc 18 BH list) | `p(G_k1) >= p(G_k2)` for `k1 < k2`: edge `b(G_k2) - a(G_k1) - phi - phi > 0` | Intervals `(k_i, k_{i+1}]` plus tie atoms when `>` vs `>=` differ | Riskless inside one source and clock |
| **date ladder** (c2) | Equal strike, dates differ; **polarity must be inferred**: cumulative ("by D") increases with D, survival ("continues through D") decreases, "on D" point-in-time is not monotone [17 §2.3] | as ladder | cumulative `p(D_T1) <= p(D_T2)` for `T1 < T2`; survival reversed | First-hit atoms `T_1 < ... < T_m`, `never` | Riskless only if announcement-vs-occurrence semantics match [15 R3] |
| **2-D touch lattice** (c3) | Strike and date vary together; comparable only when `k_H >= k_E` and `T_H <= T_E` | as ladder on comparable pairs | `p_H <= p_E` for comparable pairs only ("ETH 2,900 by Oct 31" vs "ETH 3,000 by Dec 31" is **incomparable**) [16 §2] | Order polytope (5.3) | Riskless on comparable pairs |
| **bucket vs cumulative** (c4) | Same underlying, source, instant; bucket edges parsed | rho small intraday | `p(B[k1,k2)) = p(G_k1) - p(G_k2)` | Atoms = intervals + equality atoms | Riskless in one source; boundary ties matter [15 §3.3] |
| **barrier vs terminal** (c5) | "hit" vs "above at close" same level | none | `p(H_k) >= p(G_k)` | as ladder | Riskless if reference prices match |
| **implication / subset** (d) | Parse + rule text; LLM only proposes; never from price | **None**: rho_1d 0.04 to 0.18 even when powered (0/6 recovered, M4). Slack distribution (child below parent by 3.5 to 28c) is the only statistic | `p_A <= p_B`: edge `b_A - a_B - phi - phi > 0` | Remove state `A and not B` | Only if implication proven from both texts incl. edge states |
| **joint / conditional** (e) | Parse conjunction legs (combos) | none | `max(0, p_A + p_B - 1) <= p_C <= min(p_A, p_B)` | `C = A and B` | Same facts and time required; combos are RFQ quotes with last look [15 §3.5] |
| **exclusive across events** (f) | Provable from text only | none | `p_A + p_B <= 1`: sell both, edge `b_A + b_B - 1 - phi - phi` | remove `A and B` | As (d) |
| **correlated factor** (g) | Tags/entities as prior | abs(rho_1d) >= 0.5 without ordering or sum signature (BTC vs ETH 0.78; BTC vs Fed hike -0.14) | none | none (full product) | Never arbitrage; hedge only if OOS VR >= 0.30 |
| **cross-asset** (h) | Same underlying + strike with an external reference | Basis `p_PM - p*`, AR(1) half-life about 4 h (2023 sample, L) | `p_PM ~ -dC/dK` (present-value digital), model-dependent | none | `relative_value_signal` only; deferred |

### 5.3 Nested families need only pairwise rows (order polytope)

For a finite family of events with an implication order (`H <= E` meaning H implies E), the convex hull of the 0/1 indicator vectors consistent with the order is the **order polytope** `{p in [0,1]^P : p_H <= p_E for H <= E}` (Stanley 1986; the constraint matrix is a network matrix, so vertices are integral). If every monotone 0/1 pattern is realisable, the pairwise rows are *exactly* the no-arbitrage condition for fee-free mid prices; if some patterns are unrealisable, a violated pairwise row is still a genuine arbitrage (necessary direction), which is all the engine claims. So ladders, dates and the touch lattice need O(m) cover-relation rows rather than an exponential state enumeration. Mixed structures (bucket vs cumulative, partition + ladder) use the atom LP of 5.1 with 20 to 30 atoms [15 §4.6, §6.3: 23 atoms for 22 BTC contracts].

### 5.4 Soft relations: factor model and hedge ratios

For `(g)` and as a variance layer on hedged links: daily changes `Delta p_y = alpha + beta Delta p_x + eps`.

- Estimation: OLS and an instrumented estimator (lagged level difference) because quote noise biases OLS toward zero [18 V-C7]; chronological 60/40 split; `beta_shrunk = (1 - lambda) beta_0 + lambda beta_hat`, `lambda = n_eff/(n_eff + n0)`, `n0 = 60` active days (D), prior `beta_0 = 1` for identical, the finite-difference slope ratio for ladders (M7: MAE 0.13, so prior variance is large), 0 otherwise.
- **Accept a statistical hedge only if** OOS variance reduction at 1 day >= 0.30 **and** abs(beta_train - beta_test) <= 25% (M8: 8 of 30 pass; ladders 4 of 5; implication, factor and identity 0). Otherwise report "no stable hedge".
- Reference values from the panel (H): Fed pair beta 1.03, OOS VR 0.96 to 0.97 (daily); adjacent BTC reach rungs beta 0.51 to 0.52, VR 0.44 to 0.75; BTC vs ETH 34.5%; BTC vs rates about 0 to 1% [18 §2.8].

### 5.5 Tiers and labels (inherited from `[AD §5.7]`, with statistical conditions added)

| Tier | Condition | Statistical conditions |
|---|---|---|
| `structural_violation` | One venue and clock, LP `t* > 0` after fees, lock and void rows, all gates | burn-in passed; not in the first 6 hours of a leg; status filter |
| `executable_arbitrage` | Approved cross-venue link, basis identical, no axes, all gates | **disabled until D2**; plus gap not above the veto, baseline z computed |
| `hedged_discrepancy` | `t*` negative only in reserve states, EV after `delta` > `tau` | gap within plausible range or rule-diff record present; z reported |
| `indicative_discrepancy` | Candidate link or failed gate | includes every quarantined link, with reasons |
| `relative_value_signal` | Soft term only: `abs(z) >= 2`, `m_soft - costs > 2 * risk_res`, hedge gate passed | never executable-labelled |
| `model_edge` | Quotient or consensus fair value vs ask | shrinkage per `[AD §5.4]` |

---

## 6. False-link prevention (precision first)

### 6.1 Defence in depth

| Gate | Catches | Evidence | Limits |
|---|---|---|---|
| G0 structural filter (category, validity window, outcome kind) | Cross-category noise | Preserves essentially all true matches [10 §4.1] | Weak |
| G1 parse equality (entity ids, numeric threshold, direction, deadline +- tolerance, orientation) | Wrong strike or year, hike vs decrease, win vs advance | Plain Jaccard >= 0.5: 0.78; gated 1.00 in-sample, 5/8 out-of-sample [16 §7.9b, V-K2] | Misses entity swaps (Odyssey vs Digger), different institution; needs entity ids |
| G2 native hook corroboration | Topic identity for mirrors | Limitless `externalSlug` 8 of 8 probes resolved on Gamma [16 V-C] | Mirror is not rule-identical; `rulesHash` is a drift hook, not proof |
| G3 rule diff (typed axes, exceptions, void policies, cutoff delta) | Cancel/postpone clauses, tie-breaks, UTC vs ET cutoff, source differences | 14 of 43 true audited links carry a difference [17 §2.5]; all six XO/Polymarket title-identical pairs had a cutoff offset [16 §7.9c] | LLM judge needs unanimity and human check |
| **G4 gap-plausibility veto** (statistical) | Entity swaps, opposite brackets, wrong deadline, orientation inversion, anything that makes two probabilities differ | M1, M2: 28/30 false links above 300 bps, 0/17 true above 246 | In-sample; would also flag a real large dislocation, so it **escalates** to rule-level review instead of discarding |
| G5 co-movement and sign tests (statistical) | Inverted orientation (sign of co-moves), "related but not that related" | Cross-topic null 0.2% (M4); Fed-pair sign concordance of co-moves 0.82 to 0.88 across grids [18 results, X03] | Powered only for tier A/B pairs; absence says nothing |
| G6 human approval with pinned hashes | Judge errors | Required by `[16 §11]`, `[AD D2]` | Reviewer time NOT MEASURED |
| G7 runtime verifier (hash, status, close time, tick, fee model) | Drift, edits, clarifications | Limitless `rulesHash`, Kalshi `last_updated_ts`, Polymarket `updatedAt` [16 §7.8] | Detects change, not meaning |
| G8 settlement reconciliation | Any link that disagreed at resolution | Illinois monitor: 14,480 of 14,498 sports pairs settled alike (0.12% differ, fixture-matched, easy case) [16 §5.2] | Slow feedback |

### 6.2 The gap-plausibility prior (derivation, use, limits)

**Idea.** If two contracts are the same event, their prices differ by a small, regime-stable amount (tight where one venue quotes off the other: abs(mid gap) median 0.05c, p90 1.0c, 0/53 positive edges, M10; wider on long-dated politics, mean +0.9 to +5.0c [18 §2.5]). If they are not the same event, the gap is whatever the two probabilities happen to be. So an *unexpectedly large* net edge is likelihood evidence for a false link. The classic arbitrage-detection heuristic "a bigger edge is better" is inverted here: **a real inconsistency would not be 50x the fee-adjusted spread** [17 §2.4].

**Likelihood ratios** (Jeffreys +0.5 smoothing; true side = census of 17, false side = 30 audited X with positive edge; in-sample):

| Net edge at the profit-maximising size (bps of capital) | P(bin given true) | P(bin given false) | LR true:false | Posterior P(true) at prior odds 17:13 |
|---|---|---|---|---|
| <= 100 | 0.730 | 0.016 | 46 | 0.984 (>= 0.909 even if up to 3/30 false links hid in this bin) |
| 100 to 300 | 0.243 | 0.079 | 3.1 | 0.800 |
| > 300 | 0.027 | 0.905 | 0.030 | 0.038 |

The prior odds 17:13 are the census among sim >= 0.65 positive-edge links [17 §2.5]; for lower similarity the prior is far lower (strict precision 0 of 24 in the two bottom strata). M11 adds that the minor-difference links sit higher inside the true range (median 153.8 vs 41.9 bps), which motivates the middle band: 100 to 300 bps means "probably a rule difference", so a typed rule-diff record and a link-specific haircut are mandatory.

**Use.**
- `net > T_q = 300 bps` on a non-mirror link: state `quarantined`; no LLM spend; the link reappears only with a human override carrying a rule-level note. 
- `100 < net <= 300`: tier at most `hedged_discrepancy`; rule-diff record must exist; haircut `delta` from section 7 applies.
- `net <= 100`: no effect.
- **Class-specific scale** (D): `T_q(class) = max(300 bps, 7 sigma_class)` once a class has >= 30 verified links (`sigma_class` from the class's verified gap distribution; market-made sports pairs have sigma about 0.44c, M10, so a 3c gap on such a pair is outside the plausible range even though 3c = 300 bps).
- Limitless-declared Polymarket mirrors already carry a high prior (0 of 20 evaluated had a gross-positive pair [17 §2.4]), so a large gap there more likely means a stale Limitless quote or an edited rule than a false link; the veto routes it to `hold: re-verify rules` (see the longitudinal version below) instead of quarantine.
- **Longitudinal version** once `PairStats` exist: `z = (s_now - mu)/sigma`. `abs(z) >= 5` with unchanged rules and hashes means either a genuine dislocation or a silent clarification of one leg; the engine returns `hold: re-verify rules` before any tier above `indicative` (price jump as a rule-change detector).

**Failure.** (i) A true, large dislocation is quarantined: bounded by the rule of three, `P(gap > 300 | true) <= 3/17 = 0.18` (95%), unmeasured beyond. (ii) The thresholds were fitted on the same labels; re-estimate by cross-validation on the next labelled batch (13.3). (iii) Edge in bps depends on the walked depth and on horizon: long-dated true links can carry larger bps at low APR, so the veto escalates rather than rejects.

### 6.3 Orientation, co-movement and sign tests

Orientation inversion on head-to-head markets created fake edges of 2,000 to 47,000 bps and one USD 923,876-capital NFL "edge" in doc 17 [17 §5.1]. Independent checks, in order: parsed `orientation.yesMeans` (Limitless `metadata.homeTeam/awayTeam/outcomeLabels` exist [17 V2.2]); level test (`abs(p_A + p_B - 1) < abs(p_A - p_B)` suggests an inverted mapping when both are far from 0.5); **sign of co-moves** when powered (negative rho_1d between supposedly identical contracts). A conflict suspends the link.

### 6.4 Quarantine and promotion

`quarantined` is reached by: gap veto, failed G1 gate, sign contradiction, regime break, rule-hash change, or one settlement disagreement. Leaving it requires a human with a written reason; it never decays on its own. Promotion to `verified` requires S6 `verdict = link`, `basis`/axes recorded, S8 approval, hashes pinned, `validUntil`, and a trust posterior above the class threshold (D: 0.95) computed with calibrated coefficients. Candidate links are always shown as `indicative`.

---

## 7. Resolution risk, quantified

Price statistics cannot see payoff divergence (E10). The design therefore carries resolution risk as explicit, data-updatable parameters.

**Axes and states.** Each link has `axes` from the rule diff (`timing`, `source`, `condition_scope`), a `cutoffDeltaH`, `voidA/voidB`, and typed `exceptions`. Axes define reserve rows in the LP (5.1) and an expected-value haircut.

**Haircut.** For a hedged pair with unit payoff in the agreeing states, `EV = 1 - C - delta` where `delta` is the probability of adverse divergence; a pair breaks even when `delta` equals its net edge [AD §5.6]. Axis-level independence: `delta_link = 1 - prod_axis (1 - delta_axis)`.

**Priors (D, to be updated).** Starting values follow `[AD §5.6]`: identical basis, no axes, fixture-matched sports 0.25% to 0.5%; `timing` only 1% to 2%; `settlement_source` (XO MANUAL vs UMA or exchange) 5%; any `condition_scope` or unresolved axis: never labelled arbitrage. Anchors: sports 0.12% disagreement (Illinois monitor, easy case, mirror copies dominate); Polymarket 50-50 payouts 0.41% of protocol records [15 §7]; 33% of audited true links carry some rule difference (E8); two selected incidents with payout divergence (not a rate).

**Statistical update (the "statistics" part).** Maintain a Beta posterior per class `c` = (venue pair, basis class, axis set, category): `delta_c ~ Beta(a0 + k_c, b0 + n_c - k_c)` where `n_c` counts links whose both legs settled and `k_c` those that disagreed or voided on one side; prior pseudo-count `a0 + b0 = 100` (D) with the means above. The reserve uses the **95% upper quantile**, not the mean (fail closed). With a base rate near 0.1% to 0.5%, 300 resolved links in a class give only 1.5 expected divergences at 0.5% against 6 at 2%, so about that many are needed to tell them apart; until then the prior dominates, and the tool reports "reserve is a prior".

**Lock-up and dispute tail.** `T = T0 + P(dispute) * Delta` per leg. Polymarket: P(dispute) 7.6% across the top 1,000 closed 2026 markets by volume (16.2% of volume), 27.0% for geopolitics-keyword questions, 7.0% other, 1.2% sports-style; about 1% over the whole adapter history (1,604 disputes / 159,447 proposals) [15 §7, V1.13]; undisputed close median +3.6 h (p90 +34.8 h), disputed median +100.1 h (p90 +439 h). Use the category rate for volume-ranked markets and 1% otherwise. XO MANUAL markets and Trueo (council with no timeout) have no measured tail; the engine uses the market's own `expiresAt` + a wide default and says so. The hurdle `rho` is a parameter (8% APY is an assumption [15 V1.9]); the measured annualised settlement wedge of Gebele and Matthes (arXiv 2605.31431) is the better calibration and **I have not read it**.

**Reserve rows for divergences I can name** (from section 8 of note 15): exception clauses (death), state vs event semantics, announcement vs occurrence, different station or index, subset by trigger. Each becomes an `ExceptionClause` with `payoffEffect`; the LP gets a row per clause in which that leg pays the clause payoff.

**Settlement feedback.** Every retired link writes a `ResolutionLog`. Disagreement retires the link and creates a negative gold label with the divergence axis, closing the loop for G8.

---

## 8. Executable edge: depth, fees, lock, reserve, and the statistical decomposition

### 8.1 Algorithm (what S10 computes, in order)

1. **Verify.** Re-read both legs; compare `rules.sha256`, `closesAt`, status, tick, fee model; mismatch => `suspended` with reason. Reject if either leg is in a UMA proposal/dispute state, Kalshi `disputed`/`amended`, XO `PAUSED`, or within the configured window of close [AD §8.3].
2. **Fetch live books** (CLOB/orderbook, never Gamma `bestAsk`, listing quotes or `outcomePrices`; 7.1% of Kalshi listing asks and 5.5% of Polymarket differ from the book by > 1c after ~15 minutes [17 §0.8]); derive NO by complement and mark `derived`; sort explicitly (best-first on XO, best-last on Polymarket and Kalshi); reject empty-side encodings and tail legs (<= 2c or >= 98c) from `executable` labels.
3. **Skew.** Per-leg fetch skew <= 5 s for `executable`, <= 60 s for `hedged`, else `indicative` (D, [AD §8.3]).
4. **Build rows** for the link's type (5.2), fee-adjusted levels, lock charge, reserve rows; solve the LP (<= 30 variables, exact rational arithmetic) or the closed form; stop adding levels when the marginal net per share falls below `tau` (D: 0.5c).
5. **Gap veto and z.** Apply 6.2 to the net edge at the optimum; compute `z` against `PairStats` if fresh.
6. **Decompose** the observed spread `s_now = mu + (s_now - mu)` into baseline basis `mu` (rule, carry, structural) and transient deviation. Only the deviation is expected to revert; the basis is captured, if at all, by holding to resolution.
7. **Two exit modes.** *Hold to resolution:* entry fees only; edge is the LP value; capital locked to the latest resolution; annualise on locked capital. *Revert and close:* expected capture `dev * (1 - 2^(-H/hl))` against four fees and two spreads; reported but almost never positive (E4).
8. **Tier and reasons** (5.5), returning machine-readable reasons, the dual certificate for `t* = 0`, `PairStats` snapshot, and the exact rounding-corrected size.

### 8.2 Fees and execution frictions the walk must encode (M)

Polymarket `C x rate x p(1-p)` taker only with `rate` from the market `feeSchedule` (0.03 to 0.07 observed; docs table says Sports 0.05) [AD §3.3]; Kalshi `ceil_6dp(0.07 x mult x C x p(1-p))` plus cent-grid rounding (non-direct members), series `fee_type` and event overrides; XO `C x (bps/10,000) x p(1-p)` with bps = `max` of the two surfaces (`effectiveFeeConfig.takerFeeBps` read as 0 on the October Fed markets in M9, verified present on market 40266; 400 on sports and crypto markets elsewhere [10 V3]); Limitless table, paid in outcome tokens (no closed form) [17 §1.2]. Taker delays: XO 0.5 to 3 s, Limitless 1.25 s. Kalshi collateral netting (MECNET/DIRECNET) overstates capital for ME sets (edge unchanged). Polymarket negRisk conversion is not modelled.

### 8.3 Evidence that the decomposition matters

In 13 same-event pairs the apparent mid gap's surviving share is 50.6% after spread, 9.3% after fees, 3.0% after a 5% hurdle, 0.0% after 20% [18 §2.6]; the three 2028 pairs show 4.98c, 1.52c and 2.15c mean gaps yet at most 1.2% to 2.5% annualised because capital is locked 724 to 793 days.

### 8.4 Worked examples (baseline statistics are measured; quotes are synthetic and labelled)

**E1. Trust update from the gap.** A cross-venue candidate with similarity 0.75 and a net edge of 600 bps: prior odds 17:13 times LR 0.030 = 0.039 odds, posterior P(true) = 3.8%; quarantined with no LLM spend. The same candidate at 60 bps: 1.31 x 46 = 60 odds, P(true) = 98.4%, goes to rule review.

**E2. Fed October +25bp pair, assumed spread +4.6c (synthetic) against the measured baseline** (mean +0.14c, sd 1.54c, instrumented half-life 11.2 h [18 V-C7]): basis 0.14c + deviation 4.46c, `z = 2.90` (the sample's 5th to 95th percentile range is -2.0 to +2.5c, so this is a rare event). *Revert and close:* expected capture within 24 h `4.46c x (1 - 2^(-24/11.2)) = 3.45c` against an assumed round-trip cost of 6.95c (doc 18's X04 figure): **-3.50c**. *Hold to resolution* (sell Polymarket YES at the bid 0.171, buy Kalshi YES at the ask 0.135; Polymarket rate 0.05, Kalshi 0.07, 9 days): gross 3.60c, fees 1.53c, net 2.07c on capital 0.964 (2.15%); after an 8% APY lock (0.19c) and a 1% timing-axis reserve (1.00c): **+0.88c per share**, tier `hedged_discrepancy`. The statistics told us the gap is a transient deviation (not basis), which is why hold-to-resolution is credible; the rules (UMA vs exchange) are why it is not `executable`.

**E3. Persistent basis.** Vance 2028 nomination: measured mean +4.98c, sd 1.39c, half-life 68.5 h, 724 days to resolution. A spread of 5.5c has `z = +0.37`: no deviation, the "edge" is basis. At the mean spread with a synthetic p = 0.45: gross 3.98c after half-spreads, fees 2.72c, net 1.26c on capital 0.955 = 1.32% over 724 days = **0.66% a year**. Tier `indicative`.

**E4. Payoff hedge vs variance hedge.** Long 100 shares of "BTC reach $110k". The variance hedge sells `0.51 x 100 = 51` shares of "reach $100k" (measured beta 0.51, OOS VR 0.73): residual daily sd falls to `sqrt(1 - 0.73) = 0.52` of unhedged, but in the state "100k reached, 110k not" the hedge loses 51 shares of payout, so it is not an arbitrage. The arbitrage direction (long easy 100k, short hard 110k at 1:1) has payoff >= 0 in every state. The two ratios answer different questions.

**E5. Cross-venue complete set** (measured, M9): best-of-venue sum of asks 1.010; long set -2.3c per set after fees; short set +0.20c on 0.31 sets. The LP certificate is `t* = 0`.

---

## 9. Position sizing with hedge ratios

1. **Hard tiers:** size from the LP at depth, bounded by `min(cap, depth at tau, smaller leg's fillable depth)`; payoff ratios only [AD §6.3]. At the author's caps ($10 per order) a leg is about 31 shares and net P&L is cents [AD §0.1 item 2], so the machinery below matters only if caps are raised.
2. **Hedged and relative-value tiers:** target size `q` limited by a loss budget `L` at 99%: `q <= L / (2.33 * sigma_res * sqrt(H))`, with `sigma_res = sigma_y * sqrt(1 - VR_oos)` per share per day from `PairStats` and `H` the holding days capped at 5; hedge leg `q_h = beta_shrunk * q` with sign from `orient`.
3. **Refuse** a statistical hedge when the gate in 5.4 fails, when `PairStats` is stale, or when `regime.stable` is false.
4. **Maximum unhedged exposure** never exceeds the per-order cap; legging reserve `eps` and the unwind plan come from `[AD §6.3]`.
5. **Leg order** (execution hint from the lead-lag annotation, D): trade the *perishable* leg first, i.e. the follower's stale quote, then the leader's; otherwise least liquid leg first [10 §5.7]. This is a hint, since a faster quoter is not an information source (T7).

---

## 10. What runs where

| Component | Plugin (stateless, 10 s, <= 10 MiB, <= 16 hosts) | Offline / hosted | Notes |
|---|---|---|---|
| Venue reads, book normalisation, fee models, depth walk | yes | | `[AD §2]`; <= about 8 book fetches per call |
| Link verification (hash, status, close time, tick, fee model) | yes | | SHA-256 via Node `crypto` (M) |
| LP (<= 30 variables), closed forms, order-polytope rows, dual certificate | yes | | exact rationals |
| Gap-plausibility veto, class thresholds | yes (constants in the bundle) | calibrates them | 6.2 |
| z against shipped `PairStats`; basis/deviation decomposition; hedge ratio arithmetic | yes | fits `PairStats` | stats come inside the link record; stale (> TTL) or absent => ignored, never trusted |
| Signature check of the fetched links dataset (Ed25519) | verify | signs | Option B of `[16 §10.3]` |
| Recorder (S0), parse at scale, blocking, embeddings, LLM judge, review queue | no | yes | 10 s, no model, attacker-written text |
| Pair statistics, bootstrap, BH, CCF, clustering, factor groups, calibration | no | yes | stdlib or numpy; section 11 |
| Gold-set management, settlement reconciliation, drift alarms | no | yes | |
| Per-user state | none available | owner backend keyed by signed challenge | [AD §1.4] |

**Dataset size.** A link record with `PairStats` is about 0.7 KB of JSON; 500 active links = about 350 KB raw, about 70 KB gzip, inside the 300 KB gzip target of Option B [16 §10.3]. Only `verified` links ship; candidates stay offline.

**Never in the plugin:** any statistic computed from history (no state), any LLM call, any hosted-aggregator dependency (nine dead or dark items in 2026 [14 §8.3]).

New fields for the `pm_*` tools of `[AD §9.1]`: `pm_lookup_links` and `pm_compare_market` return `trust`, `evidence` (channel summary), `stats` (with `asOf`), `gap_check` (`ok | review | quarantined`), `cluster` and `block` ids; a new read-only `pm_cluster_view(market)` returns the relation graph around a market with typed edges and activity tiers; `pm_find_edge` returns the decomposition (basis, deviation, z), both exit modes, and the certificate.

---

## 11. Cost per 1,000 markets

Working set: XO ACTIVE rows across types 0 to 4 (421 on 2026-10-18 [16 V-K1]) plus counterparts and approved-link legs, about 1,000 to 1,500 contracts. "Per 1,000 markets" below.

| Item | Quantity | Cost | Tag |
|---|---|---|---|
| Recorder requests | 24,000 book GETs per day at hourly cadence (96,000 at 15 minutes); one sweep takes 200 s at the XO public limit of 5 req/s | API access free; host about USD 5 to 10 per month (assumption) | M (arithmetic from [AD §8.2]), L (hosting) |
| Storage | about 1.2 MB per day packed at 48 bytes per row, hourly (4.6 MB at 15 minutes); 0.4 GB per year | negligible | arithmetic (`power.py`) |
| Pair statistics | blocks of 50: 1,225 pairs per block; cheap screen is seconds; the full battery cost about 1.7 core-minutes per relationship in the verifier's rerun (4 min 15 s on 16 cores for 41 relationships) | for 300 surviving pairs about 8 core-hours, cents of compute | M [18 V] |
| Unblocked all-pairs (for comparison) | 499,500 pairs at 1,000 contracts; expected spurious candidates at abs(rho_1d) >= 0.5: about 1,000; at >= 0.3: about 11,000 (null rates 0.2% and 2.2%, M4) | which is why S2 blocking is mandatory | arithmetic |
| Embeddings (recall only) | 300 tokens per market | USD 0.006 (3-small) to 0.039 (3-large) | M [16 §7.3] |
| LLM judge, one pass, k = 5 candidates per market | 950 in / 150 out tokens per pair | Haiku 5.5 USD 0.85; Sonnet 5.5 USD 17; Opus 5.5 USD 34 (lower bounds: thinking tokens bill as output [16 V-K9]) | M |
| Cascade (Haiku titles k = 20, then Sonnet with rules on 3) | | about USD 11 (USD 5.5 batch) | M [16 §10.3] |
| With the unanimity rule (3 samples) and quoted fragments | Sonnet, k = 5, 3 samples | USD 51 at 150 output tokens per sample; USD 141 at 750 (my arithmetic, `power.py`) | M |
| Human review | candidates per 1,000 markets x minutes per link | **NOT MEASURED**; parametric: 150 candidates x 4 min = 10 hours (both numbers are assumptions) | D |

**Total per 1,000 markets:** USD 15 to 150 of compute and model spend per full pass, dominated by review labour. Only new or hash-changed markets are re-judged, so steady state is a fraction.

---

## 12. Failure modes

| Failure | Mechanism | Evidence | Handling |
|---|---|---|---|
| Spurious correlation at scale | N-squared pairs; null 0.2% at 0.5 | M4 | Blocking, BH within block, activity gate |
| Low power read as "no relation" | 14 of 41 relationships have a leg below 100 changes; long-dated identical events show rho_1d 0.06 to 0.30 | M3, M4 | Tri-state evidence: supports / neutral (insufficient power) / contradicts; absence is neutral |
| Regime shift | Fed pair hourly rho 0.015 vs 0.88 across halves; half-life 12.3 h vs 3.2 h | [18 V-C4, V-C7] | `regime.stable`, TTL 7 days, refit weekly, CUSUM alarm |
| Quote noise bias | OLS half-life biased short 1.3x to 1.6x; 0.5c noise can cut a 13.5 h half-life to 3.9 h | [18 V-C7] | Instrumented estimator |
| Faster quoter mistaken for information | Test T7 | [18 §1.5] | Label `faster_quoter`, never act |
| Manipulable evidence | Creators may trade their own XO markets; XO-created near-duplicates can be made to co-move | E16 | S8: no XO-only statistical evidence for XO-created links; require a non-XO anchor leg or independent maker diversity (unobservable today) |
| Gap veto misfire | A real large dislocation is quarantined | bounded by rule of three 0.18 | Escalate to rule-level review, never silent drop |
| Gap veto blind spot | A false link with a small gap (two entities priced alike; a near-tie) | M1: 2 of 30 false below 250 bps | Gates G1 and G3 remain mandatory; veto is additive |
| Fake edge from fetch skew | NO book fetched 1.5 to 2 minutes after YES | [17 §2.2] | Back-to-back or derived complement; skew limits |
| Stale or edited rules | Polymarket clarifications, Kalshi `rules_secondary` edits, `can_close_early` | [15 §10.8] | Hash re-check every call; price-jump tripwire |
| Wrong ladder polarity | Survival wording ("continues through D") decreases with D | [17 §5.1: 63 of 130 first-parser "violations"] | Polarity is a parsed field; unknown => no ladder rows |
| Orientation inversion | YES side of "A vs B - B" differs by venue | [17 §5.1] | Parsed orientation + level and sign checks |
| Non-exhaustive set treated as partition | Kalshi `mutually_exclusive` is not exhaustive; augmented negRisk "Other" | [17 §2.1: 10 false positives] | Long basket forbidden unless exhaustive by rule |
| Condition-scope mismatch in a set mapping | "50+ bps" (Polymarket) vs ">25 bps" (Kalshi) | M9 assumption | Rule diff records the mapping; the 25-bp grid is a stated assumption |
| Prompt injection | Creator-written titles and rules | [16 §13] | `Untrusted<>`, delimiters, no tools on the judge |
| Data-use restrictions | Kalshi Developer Agreement (2023, L); XO ToS bars scraping "for unauthorized purposes"; Quotient licence | E17 | `record_policy`, polite polling, ask for permission |
| Reviewer bottleneck | Time per link unmeasured | [16 §13] | Rank by posterior; batch set-level reviews (one call per set, not per pair) |
| Single-rater labels | All gold labels so far are one reader's | [17 §2.5] | Second rater on 20%, kappa target 0.8 |
| Ghost fills / non-atomic legs | Reverted `matchOrders` up to 24.3% in peak hours | [15 V3.2] | Legging reserve, prefix-fill scenario |
| Cold start | No history for XO; stats unusable before day 60 to 90 | M6 | Structural channel carries the MVP |
| Dead dependencies | Aggregators, directories die often | [14 §8.3] | No runtime dependency |

---

## 13. Evaluation plan

### 13.1 Gold-set procedure

1. **Seed** with what exists: the 108 labelled XO/Polymarket pairs (`xo_vs_polymarket_labelled_pairs_2026-10-18.json`, title level), the 78 audited and 30 census links (`audit_sample_labeled.json`, `link_labels_keyed.json`, rule level), 20 UCL triples (XO to Kalshi, structural), Limitless-declared mirrors as **silver** positives for recall (declared mirrors are not ground truth [17 §2.5]), and post-settlement disagreements as silver negatives.
2. **Sample what the system would surface**: stratified by trust-score band and relation claim, **not random pairs** (random pairs are almost all true negatives) [16 §8]; over-sample the positive-edge, large-gap and `abstain` strata.
3. **Label** on the Oddpool axes plus exception clauses: `I` identical, `Dm` minor rule difference (record the axis), `DM` major, `X` different; store the rule hashes at label time. **Second rater on 20%**, kappa >= 0.8, adjudicate disagreements, re-label on any rule-hash change. Do not reuse the existing label-policy inconsistency (cancel/postponement clauses counted as `I` in some rows and `Dm` in others [17 V2.6]); fix the policy in writing first.
4. **Size.** About 203 labelled links for 0.95 +- 0.03, 189 for 0.98 +- 0.02, 381 for 0.99 +- 0.01 [16 §8]. For a Wilson lower bound >= 0.97 per class: **125 links with 0 errors, 185 with 1, 239 with 2, 290 with 3**; for >= 0.99: 381, 563, 726 (my arithmetic, `gold_n.py`).
5. **Hold-out discipline.** Thresholds (gap veto, trust coefficients, hedge gates) are fitted on batch N and scored on batch N+1; no number is reported from the batch it was fitted on.

### 13.2 Targets

| Output | Metric | Target | What I expect (basis) |
|---|---|---|---|
| `verified` cross-venue links | Precision, Wilson LB per relation class | >= 0.97 at n >= 125 (0 errors) or n >= 185 (1 error) | Unknown until the gold set exists. Automated gated candidates alone: 5/8 strict out-of-sample [16 V-K2]; the human step is the precision source, not the models |
| Surfaced positive-edge candidates (before human review) | Precision | >= 0.85 after the gap veto | 17/30 = 0.57 before; if the veto leaves 1 to 3 of 13 false links, 0.85 to 0.94 (Wilson wide: 0.64 to 0.99); in-sample extrapolation |
| True links lost to the veto | Fraction of true positive-edge links quarantined | <= 5% (upper CI reported) | 0/17 observed; 95% upper bound 18% |
| Candidate recall, XO templated families | Share of true counterparts surfaced | >= 90% | 18/18 UCL matches [16 §7.9a]; one league and matchday |
| Candidate recall, generic | Against Limitless-declared mirrors (silver) | >= 80% with parse + judge | Plain linker 56% at sim >= 0.45, 13% at 0.85 [17 §2.5]; that linker only |
| **Incremental recall of the statistical channel** | New true links found that the structural channel missed, among powered pairs | **>= +3 points at day 90, hypothesis <= +10** | Not measured. Co-movement can only reach pairs with both legs powered (13 of 22 testable in M4) |
| Gap veto operating point | On >= 100 fresh labelled positive-edge candidates: flags >= 90% of false and keeps >= 95% of true | | M1 in-sample 93% and 100% |
| Baseline calibration | Coverage of z-based 95% predictive intervals of the next 14-day spread | 90% to 98% | Regimes shift (E12) |
| Hedge ratio | OOS variance reduction >= 0.30 at 1 day for >= 20 links that pass the gate; shrunk beta no worse than OLS | | 8 of 30 pass in M8 |
| Resolution reserve | Predictive log-loss of the Beta model vs the fixed prior on settled links | improvement or equal | needs hundreds of settled links |

### 13.3 Shadow log (edge realism)

Every surfaced tier is logged with inputs and outputs (`Surface` record). At +5 minutes, +1 hour and +1 day the books are re-fetched and the modelled edge recomputed (persistence); at settlement the realised P&L including fees is computed. This measures persistence per class, which today rests on 8 events and one 28-minute window [15 §6.3] and on standing quotes in illiquid books that persist whether or not the link is valid [17 §2.6].

### 13.4 Pre-registered test and kill criteria for the statistical channel

At day 90 (>= 60 days of recorder data for the working set), on a fixed list of blocks chosen before looking:

1. Run S4 on all blocks; freeze the candidate list. Label a stratified sample of >= 150 surfaced candidates plus a matched sample of structural-only candidates.
2. **Keep S4 as a candidate generator** only if (a) it finds true links the structural channel missed with a recall gain whose 95% lower bound is >= +3 points among powered pairs, and (b) precision of its candidates after S5 to S7 is not below the structural channel's, and (c) the BH-controlled false-candidate count per 1,000 contracts is <= 50.
3. **Otherwise** demote S4 to monitoring and ranking only (it is still used for G5, S9, S11), and drop factor groups from the roadmap.
4. The gap veto and trust posterior are re-fitted by cross-validation on the same labels; if cross-validated AUC of sim + gap is not >= 0.05 above sim only, the veto reverts to a hard threshold without a posterior.

### 13.5 Regression fixtures

Keep the named failure cases as tests: ECB hike vs decrease, wrong central bank, Mamdani vs Hansen, Digger vs The Odyssey, OpenAI vs Anthropic IPO bank, Bank of Korea "maintain" vs "25 bps cut" (158,984 bps), Khamenei death clause, "shutdown on Feb 14" vs "new shutdown by Feb 14", survival-wording date ladders, head-to-head orientation, "Other" fallbacks, UTC vs ET cutoff, ETH 2,900 by Oct 31 vs 3,000 by Dec 31 (incomparable lattice points). The 29 unit tests of doc 17 and the 25 synthetic tests of doc 18 are the model.

---

## 14. MVP cut and phasing

Aggregation tools are additive and must not delay the XO release (`[AD §11]`). Within the statistical-first subsystem:

| Phase | Build | Cut or defer | Exit criteria |
|---|---|---|---|
| **SF-0 (week 0 to 1)** | Recorder over the working set (hourly), schemas, `Contract`/`Relation`/`Observation`, parse + rule hash for XO, Polymarket, Kalshi (Kalshi under `record_policy: derived_only` until permission) | Everything statistical | 7 consecutive days of gap-free sweeps; schema CI green |
| **SF-1 (MVP, with AGG-1)** | S1 to S3, S5, S6 (offline judge + deterministic diff), S7 trust posterior (hand-set coefficients from M1/M2), S8 approval flow, S10 verifier + LP + fee/depth walk + **gap veto** + decomposition fields; links for XO UCL triples vs Kalshi, FOMC/ECB/BoE decision sets (including the cross-venue complete-set cluster of M9), crypto threshold ladders; within-XO duplicate links | S4, factor groups, lead-lag, hedge sizing, cross-asset | Gold set seeded; veto and verifier tests pass; links suspend on forced hash change |
| **SF-2 (day 30 to 60)** | S9 baselines for verified links with enough history (TTL 7 days), S11 break alarms and settlement log, Beta reserve update | Statistical discovery | `PairStats` on >= 20 links; first `ResolutionLog` rows |
| **SF-3 (day 90)** | Pre-registered S4 experiment (13.4); factor groups only if it passes | | Decision recorded |
| **SF-4 (after)** | Hedge sizing for raised caps; maker-side use of the signals; Deribit cross-asset; Quotient as prior mean with learned shrinkage | | |

**Cut list, with reasons:** lead-lag and reversion execution (E4); covariance-matrix sizing (caps make it moot); cross-asset (needs another host and another model); automatic promotion by any statistic (asymmetry rule); LLM inside the plugin; using XO history that does not exist.

### 14.1 Where this philosophy helps and where it loses (against text-first and rules-first designs; I have not read the other two panels)

**Helps.**
1. *An evidence channel that does not share the text channel's blind spots.* Entity swaps and opposite brackets pass title and number gates (Odyssey vs Digger passed all three [16 V-K2]); they show up as impossible price gaps. In the audit, 28 of 30 false positive-edge links exceed 300 bps (M1), so they can be stopped before any LLM or reviewer time is spent.
2. *Cheap, stateless, explainable veto.* A constant and one comparison inside the plugin.
3. *Monitoring beyond hashes.* A rule-hash check catches edited text; a spread that jumps by 5 baseline sigmas with unchanged hashes catches the venue-side event that text does not show (a clarification applied through resolution practice, a quote-maker leaving). Both are cheap.
4. *Hedge ratios.* Only a statistical design says how much of a non-identical leg offsets another, and refuses when the OOS check fails (8 of 30 pass, M8).
5. *A calibrated trust score* with Wilson-bounded reporting instead of hand rules, and a settlement-agreement loop that updates the divergence reserve with data.

**Loses.**
1. *Cold start.* Nothing statistical works before 60 to 90 days of recorded history; XO has none to borrow.
2. *Power.* 14 of 41 panel relationships have a leg with < 100 changes; implication pairs have no co-movement signature (0 of 6); long-dated identical events show rho_1d 0.06 to 0.30.
3. *Manipulability.* Thin XO markets that their creators may trade produce statistics that are cheap to fake (S8).
4. *Marginal return.* The two statistical features with measured value (the gap veto and the baseline z) are small; the larger machinery (S4 discovery, factor groups, lead-lag) is unproven and is gated behind a kill test (13.4). If the test fails, this design collapses to rules-first plus a veto, which is the intended fallback.

---

## 15. Existing aggregators and platform-level registries (context for the second user question)

**Nothing found aggregates the platforms and also tracks cross-venue market relations with rule-level semantics for XO or Trueo** [14 §0, V-A4; 16 §5]. What exists, by dimension:

- Platform registries: DefiLlama (133 "Prediction Market" rows, includes XO and Trueo, keyless; no fees/geo/oracle), Prediction Almanac (best schema: geo, data caps, status, `as_of`; CC0; no XO/Trueo), Prediction Index (314 projects, HTML-embedded JSON, stale entries), PM Wisdom (606, API returns a 10-row sample), PredictionTalk (names XO among six venues) [14 §2, 16 V-K11].
- Library and router layers: ccxt (9 prediction exchanges, none XO/Trueo), pmxt (15 venues; relation enum `identity/complement/subset/superset/overlap/disjoint`; personal use only on all plans), Synpath, AGG (11 venues, cross-venue matching, arbitrage WebSocket, per-venue geo/fee/void endpoints, no XO/Trueo), River Markets (`generic_asset_id` cross-venue groups), Predikt, CoinRithm (Event ID v1) [14 V-A1, V-A4].
- Matching services: Kairos (only independent audit: 99.1% to 99.5% aligned, sports), Prediction Hunt, Oddpool (`basis_class`, `divergence_axes`), Predictefy (only service that lists XO; closed beta; commercial use Enterprise only), PredictMarketCap, PreDex, SimpleFunctions, Struct [16 §5, V-K5, V-K11]. **None publishes precision at a threshold.**
- Cross-venue gap feeds: x402tap, x402-factory, clinkagent (single-source wrappers; none cover XO or Trueo) [14 V].

How this design uses them: as **benchmarks and silver labels**, never at runtime (nine dead or dark items in 2026). Oddpool's schema and pmxt's relation enum are the vocabulary for `Relation.type` and `basis`; Illinois/Kairos pairs are a cross-check set; CoinRithm's idea of a cross-venue event identifier is reproduced as our own story key.

---

## 16. Open questions and NOT FOUND

**Open (need the author or the venues).**
1. Does XO plan a list-level group id or an events endpoint? Without it each XO rule check costs one detail request (list rows carry `rules: {}` and no `rootEventSlug`) [16 V-K4]; the public earning-pools route exposes `eventSlug` for reward-enabled markets only.
2. May the operator store raw Kalshi quotes for statistics? (`record_policy: derived_only` is the fallback; the Developer Agreement may be superseded.)
3. Reviewer time per link, and who labels. This sets whether S4 is worth building.
4. How should cutoff offsets (UTC vs ET, 5 hours) be priced: as a `timing` reserve or by excluding the pair [16 §13]?
5. Which Kalshi series carry the death carve-out beyond Maduro and Khamenei [15 §11]?

**NOT FOUND (searched: ...).**
- A measured within-block false-positive rate of the co-movement screen (searched: all committed fixtures; the panel has only 5 factor pairs and no unrelated within-block pairs).
- Complement and partition-member statistical signatures (searched: doc 18 panel has no complement pair and no full partition series).
- Any public human-labelled rule-level corpus [16 §8].
- Published precision at a threshold for any hosted matcher [16 V].
- An XO price history usable as a time series [18 §2.10].
- The full text of Gebele and Matthes 2605.31431 (settlement wedge) and of Zhai and Shi: I did not read them.

**Suspicious or embedded-instruction content.** My live reads were JSON from public APIs only; none contained agent-directed text. Agent-directed text recorded by other notes (Mintlify banners, README "For AI agents" sections, Oddpool and Predictefy `llms.txt`) was not followed and was not re-read by me [16 §13, 10 V].

---

## 17. Sources

**Repo documents (read).** `docs/plan.md`; `docs/aggregation-design.md` §0 to 13; `docs/research/10-aggregation-landscape.md` §4 to 6 and verification; `docs/research/12-quotient.md` (top); `docs/research/14-platform-of-platforms.md` (via digest and verification list); `docs/research/15-relationship-taxonomy-literature.md` (all body sections and verification); `docs/research/16-linking-methods-services.md` (§0 to §13 and verification); `docs/research/17-empirical-constraint-study.md` (all); `docs/research/18-correlation-leadlag-study.md` (all).

**Short quotes relied on (<= 25 words).**
- "Arbitrage-free prices are exactly the convex combinations of valid payoff vectors." (Kroer et al., quoted in `[15 §0, V0]`)
- "a link that shows a profitable edge is a false link more often than not." `[17 §2.5]`
- "No taker-side edge survived frictions in any of the 41 relationships" `[18 §0]` (the verification confirms it, `[18 V reliability]`).
- "At most one market in this event can resolve to 'yes'" (Kalshi `mutually_exclusive`, `[16 V-C]`).

**Fixtures read as local files** (`docs/research/fixtures/linking/`): `census_true_links.csv`, `audit_sample_labeled.json`, `link_labels_keyed.json`, `cross_candidates_top.csv`, `final_summary.json`, `xo_kalshi_ucl_top_of_book_2026-10-18.json`, `correlation/registry.json`, `correlation/leg_diag.json`, `correlation/results/*.json`, `correlation/snapshot/*.json.gz`, `correlation/t0.txt`.

**My scripts** (scratchpad `<scratch>/design-C/`): `gap_gate.py` (M1, M2), `panel_stats.py` (M3, M5, M8), `null_comovement.py` (M4), `power.py` (M6, cost arithmetic), `structural_beta.py` (M7), `fomc_partition.py` with `phttp.py` and probe scripts (M9), `ucl_gap.py` (M10), `examples.py` (section 8.4), `gold_n.py` (section 13.1). They are not in the repo (task rule); the logic is described in section 1.3 and their inputs are committed fixtures.

**Live public GETs (M9, M12; 2026-10-18 about 19:35 to 19:45 UTC).** `https://external-api.kalshi.com/trade-api/v2/events/KXFEDDECISION-26OCT?with_nested_markets=true`, `.../markets/orderbooks?tickers=...` (repeated params); `https://gamma-api.polymarket.com/public-search?q=...`, `.../events?slug=fed-decision-in-october-20260617190323537`; `https://clob.polymarket.com/book?token_id=...` (5); `https://api-mainnet.xo.market/api/markets?marketType=2&statuses=ACTIVE&take=50&page=1..5` and `/api/markets/{id}` (6); `https://orderbooks.xo.market/book?token_id=...` (5). Explicit non-identifying User-Agent, >= 0.3 s spacing, 42 requests total (Kalshi 4, Gamma 2, CLOB 10, XO Data API 16, XO orderbooks 10; the 21-request FOMC script ran twice), no credentials, nothing signed, no PayBox tool called.

**External papers cited through the notes (not re-read by me).** Kroer et al. arXiv 1606.02825; Saguillo et al. arXiv 2508.03474 (2024-25 data, L); Gebele and Matthes arXiv 2601.01706; Gebele, Mutzel and Matthes arXiv 2608.00666; Cheng, Yang and Zou arXiv 2605.00864; Portnaya arXiv 2606.19517 (2023 contract, L); Shen et al. arXiv 2606.16852; Nechepurenko arXiv 2609.15368; Stanley, "Two poset polytopes" (1986, order polytope; cited from memory, not fetched, M).

---

## Appendix A. Compact specification of the trust posterior (starting coefficients, all D)

```
logit P(valid) = logit(prior_channel) + sum_f log LR_f
prior_channel : native hook 0.60 ; template-family 0.50 ; parse-equality gate pass 0.30 ; statistical candidate 0.10     (D; refit on gold)
LR_gap        : <=100 bps 46 ; 100-300 bps 3.1 ; >300 bps 0.030                                                          (M1, in-sample)
LR_sim        : isotonic fit of strict precision by stratum: >=0.95 ~0.90 ; 0.65-0.95 ~0.60 ; <0.65 ~0.04                  ([17 §2.5], noisy)
LR_gate_fail  : 0.02 for any failed parse gate (entity, number, direction, orientation)
LR_stat       : powered & rho_1d >= 0.5 (related) 20 ; powered & rho_1d < 0.1 with CI upper bound < 0.3 : 0.3 ; else 1       (D; the related-vs-unrelated ratio is 54%/0.2% = 270 in M4, discounted because 'related' is not 'identical')
LR_rules      : unanimous judge with empty non-allow-listed axes 5 ; any abstain 0.5 (informational only: human approval is the gate)
```

Coefficients are replaced by an L2 logistic fit on the gold set once it has >= 200 links; the posterior is used for ranking and veto only, and the `verified` state does not depend on it.

## Appendix B. Reproducing the key numbers

```
cd <scratchpad>/design-C
python3 -I gap_gate.py        # M1, M2: needs census_true_links.csv, audit_sample_labeled.json
python3 -I panel_stats.py     # M3, M5, M8: needs correlation/results/*.json, registry.json, leg_diag.json
python3 -I null_comovement.py # M4: needs correlation/snapshot/*.json.gz
python3 -I power.py ; python3 -I structural_beta.py ; python3 -I ucl_gap.py ; python3 -I examples.py ; python3 -I gold_n.py
python3 -I fomc_partition.py  # M9: 21 live GETs; numbers will differ on a fresh run
```
