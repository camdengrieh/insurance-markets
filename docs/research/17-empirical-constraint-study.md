# 17. Empirical constraint study: how much arbitrage-like inconsistency exists in public prediction-market data, and how reliably can it be detected

Task `empirical-constraint-study`. Hands-on measurement, 2026-10-18 18:06-18:43 UTC (the task calendar says 2026-10-19; the sandbox clock was still on 2026-10-18 UTC). Public unauthenticated GETs only (no POST, no keys, no signing, no PayBox call, no third-party code run, no `.env` or key file read). All code is my own stdlib Python under `docs/research/fixtures/linking/code/`; result files are next to it under `docs/research/fixtures/linking/`.

Confidence tags: **H** = measured by me this session (script + file cited) or read first-hand in a primary source; **M** = secondary or inferred; **L** = weak/stale. Older-than-6-months sources are flagged. "NOT FOUND (searched: ...)" marks documented absence.

---

## 0. Answer in ten lines

1. **Within-venue structural arbitrage is essentially absent once taker fees are charged.** Mutually-exclusive (ME) sets: 706 sell-side sets with full books (24 Polymarket negRisk + 682 Kalshi), 50 had a positive gross edge, **0 had a positive net edge** (a further 379 random un-screened Kalshi/Polymarket sets, used to calibrate the pre-screen: 2 gross-positive, 0 net). Fees were about 4.9x the gross edge on the Kalshi ones (USD 1,413 fees vs USD 289 gross at each set's best size). With fees set to zero the ceiling for the whole 682-set Kalshi sample is USD 402.5 of depth-limited gross profit. [H] (`analysis_summary.json`, `fee_sensitivity.json`)
2. **"Buy every outcome for less than 1" does show net-positive rows (10 Kalshi sets, 31 bps median) but none is a proven arbitrage**: Kalshi gives `mutually_exclusive` but no exhaustive flag, and all 10 are two-leg state/House race sets (Attorney General, State Senate, House districts), where a tie, third candidate or write-in would pay 0 on every leg; exhaustiveness cannot be proven from the API, and the one State Senate rule I read states that a tie resolves every leg to No ("If both parties are tied, then the market resolves to No", audit pair Oregon/Iowa/Alaska State Senate). On the 8 Polymarket sets I could verify as exhaustive (negRisk, all legs tradable): 2 gross-positive, 0 net-positive. [H]
3. **Within-market complement edges cannot exist on these venues**: back-to-back YES/NO book fetches showed the NO book is the exact price/size mirror of the YES book on Polymarket (24/25 identical, timestamps equal; the 1 miss is an intervening change) and XO (20/20); Kalshi has one book by construction. 0 crossed books in 6,937 books fetched. [H] (`mirror_test_results.json`)
4. **Threshold/date ladders: 8,583 families, about 278,000 adjacent-or-not pairs with two-sided quotes; only 12 inverted in the listing quotes and 10 inverted on real books; 3 survive fees, worth USD 13.4 in total** (one is a USD 1,798 date-ladder 74 bps for a 2030/2031 AGI deadline = about 0.2% APR; two are USD 5 trades at 0.1-0.5c prices). A random 298 un-screened Kalshi pairs showed 0 violations. [H]
5. **Cross-venue is where all the apparent edge is, and almost all of it is a false link.** 868 candidate link pairs with books on both sides: 485 look net-positive, median 826 bps, p90 9,897 bps. Reading the rules of 78 sampled links plus 30 more positive-edge links: precision of the title matcher is 18% strict / 34% lenient at sim>=0.45, 72% / 90% at sim>=0.65, and **among links that look profitable only 13 of 30 (sim>=0.65) are identical contracts**; in the 12-link random "positive-edge" audit stratum (sim>=0.55) only 1 was identical. [H]
6. **After verification the true cross-venue edge is small, long-dated and thin.** 17 verified-true links (13 identical, 4 with minor rule differences) have positive net edge: median 46 bps, p90 164 bps, median capital USD 991 (p90 USD 20.9k), and they lock capital 10-751 days (most 74-751). None survives "no tail leg + still there on re-fetch + >= USD 10 + >= 5% APR" (0 of 13 identical), and none survives a 300 bps resolution-risk haircut. Best three clean ones: Rubio 2028 nominee 164 bps / USD 970 (0.8% APR), Yamal Ballon d'Or 47 bps / USD 3,968 (2.3% APR), Beshear 46 bps / USD 991 (0.2% APR). [H] (`census_true_links.csv`)
7. **Stale or crossed books explain almost nothing here; fees, false links, non-exhaustive sets and tail-price legs explain nearly everything.** Gross-positive attribution: cross pairs 84% unverified low-similarity links + 11% confirmed false; ME rows 70% fees + 27% non-exhaustive + 3% already-ended; ladders 70% fees. Crossed books: 0. Edges persisted on re-fetched books 10-13 minutes later in 187 of 188 cases (these are standing quotes in illiquid books, not transient glitches). [H]
8. **Listing top-of-book is a poor executable signal after about 15 minutes**: the best ask in the Kalshi listing differed from the order book by more than 1 cent for 7.1% of 5,743 markets (Polymarket 5.5% of 361). Use listings only as a pre-screen and walk real depth. [H]
9. **A pre-screen on listing quotes did not hide anything in the sets and ladders I could test**: random un-screened samples (420 Kalshi sets + 8 Polymarket sets; 298 Kalshi ladder pairs) gave 0 net-positive sell-side sets and 0 violations. [H, small samples]
10. **Fuzzy title linking is not a detector.** Against Limitless's 496 declared Polymarket mirrors (`metadata.externalSlug`), my linker recovered 56% of them at sim>=0.45 and 13% at sim>=0.85, while precision was only 72-90% at sim>=0.65. Orientation (which side is YES) on head-to-head markets broke the first version (spurious edges of 2,000-47,000 bps on soccer pairs, up to 489,503 bps in the first run) and a second orientation bug still showed a USD 923,876-capital NFL "edge" of 23,642 bps until reading audit pair #14 caught it; the largest apparent edge left in the final data (158,984 bps) is a Bank of Korea "maintain" vs "25 bps cut" false link. Native ids, rule-text comparison and an orientation check are mandatory gates. [H]

---

## 1. Method

### 1.1 Snapshot (UTC, 2026-10-18)

| Phase | Window | Requests | Notes |
|---|---|---|---|
| Listings | 18:06:30-18:09:10 | Gamma 294 (74 keyset pages + 220 event fetches), Kalshi 67, XO Data API 9, Limitless 21 (each host also has 1-4 manual probe requests from before the scripts) | Four venues in parallel; Kalshi series list (15,188 series, 19 MB) was fetched once by `curl` at about 18:03Z and re-used from the cache (same URL) |
| Order books | 18:21:21-18:23:50 (+ 18:43 for 11 books that a later parser fix made necessary) | CLOB 390 + 25 time-skewed mirror + 2, Kalshi 59 batches of 100 + 1, XO orderbook 411 + 25, Limitless 300 + 2 | |
| XO fee configs | 18:28 | api-mainnet.xo.market 111 | `effectiveFeeConfig.takerFeeBps` of every linked XO market |
| Re-check (persistence) | 18:33:46-18:34:47 | CLOB 46, Kalshi 5 batches (411 markets), XO 9, Limitless 40 | 10-13 minutes after the first books |
| Screen calibration | 18:36:01-18:36:51 | Kalshi 33 batches (3,277 markets), CLOB 19 | random un-screened sets/pairs |
| Back-to-back mirror tests | 18:40-18:41 | CLOB 50, XO 40 | |

Total requests per host (cap 600): `clob.polymarket.com` 536, `orderbooks.xo.market` 487, `api.limitless.exchange` 364, `gamma-api.polymarket.com` 296, `external-api.kalshi.com` 169, `api-mainnet.xo.market` 121. HTTP statuses: all 200 except 16 CLOB 404 (closed markets: "No orderbook exists"), 5 Limitless 400 `{"message": "Market is not active"}`; **no 429 or 5xx on any host**. Request interval >= 0.3 s per host. [H] (`snapshot_manifest.json`; the first-request timestamps in it are my seeded probe lines.)

Universe sizes [H]: Polymarket 13,209 normalised markets (4,563 from four Gamma orderings: 24h volume top 3,000, liquidity top 2,000, lifetime volume top 1,200, 1-week volume top 1,200; plus 10,770 inside 220 completed events), 10,995 tradable (`active && !closed && acceptingOrders && enableOrderBook`). Kalshi 13,335 open events / 133,553 markets / 130,180 `active`. XO 411 ACTIVE markets of type 2 and 4 (`marketType=2,4`; type 3 Pulse rounds excluded). Limitless 501 top-level markets (226 groups, 269 single CLOB, 6 AMM) = 1,402 flattened, 1,330 tradable CLOB.

### 1.2 Units, sides and fees (docs first, then checked against live payloads)

| Venue | Price / size units | YES vs NO and executable side | Fee model used (taker only, each leg crosses) |
|---|---|---|---|
| Polymarket CLOB | decimal-string USD per share in [0,1]; sizes in shares; tick 0.01 or 0.001; min order 5 sh (H, `08`) | YES = `clobTokenIds[0]` (= `outcomes[0]`, not always "Yes"). Book arrays are best-LAST (I sort explicitly). NO book = exact mirror of the YES book (measured, section 2.2) so one `GET /book` per market is enough. `POST /books` is the only batch call (`GET /books?token_ids=` answered 400 `Invalid payload`, tested), so under the GET-only rule one request = one market | `fee = C * rate * p * (1-p)`, rounded to 5 dp per match, `rate`/`exponent` from the market's Gamma `feeSchedule` (live: 0.03 / 0.04 / 0.05 / 0.07, `feesEnabled:false` on some) (H: `https://docs.polymarket.com/trading/fees.md`, tables reproduced in unit tests) |
| Kalshi | `*_dollars` 4-dp strings, `*_fp` 2-dp counts; `GET /markets/orderbooks?tickers=` (<=100 per call) is public and anonymous (H, tested) | One book of YES bids and NO bids, both best-last. **YES ask = 1 - best NO bid** (size carries over). An empty side is encoded in listings as price `0.0000`/size `0.00` (or ask `1.0000`): treated as missing (a bug I hit, see 5.1) | `ceil_6dp(0.07 * mult * sum C*P*(1-P))`, then cash paid is aligned **up** to $0.01 (non-direct member; $0.0001 for direct): `net fee = paid - P*C`. `mult` and `fee_type` from `GET /series` (15,188 series: 14,993 quadratic x1, 159 quadratic_with_maker_fees x1, 18 quadratic x0.5, 14 quadratic x0, 3 combo-maker x1, 1 maker x0.5). The 0.07 coefficient is **verified by the docs' own worked example** (P=0.055, C=1: model fee 0.00363825 = 0.07*0.055*0.945; net fee exactly $0.005 on a cent grid) (H: `https://docs.kalshi.com/getting_started/fee_rounding.md`) |
| XO | orderbook: dollar strings, sizes in human shares, tick 0.001, best-FIRST (H, `02`). Data API prices are micro-USDC strings and are **last-trade, never used** | YES = outcome index 0 token. NO book mirror verified (section 2.2) | `fee = C * bps/10000 * p * (1-p)` floored to 1e-6 per fill (H: `docs.xo.market/guides/fees`, 200 sh @ 0.50 @ 4% = $2.00, unit-tested). `bps` = `effectiveFeeConfig.takerFeeBps` from the Data API detail: 92 of 111 linked XO markets were 400 bps (Conviction curve), 19 were 0 (flat). `GET /fee-rate` returned 0 for a Conviction market in `02`; I used the Data API value (conservative) |
| Limitless | price float, size int in 1e6 units (`12362000` = 12.362 sh) (H: fixture + `09`), YES-side book only | NO derived (NO ask = 1 - YES bid) | CLOB buy fee table 3.00% for price <= 0.50 falling to 0.40% at 0.999, interpolated, charged as a % of notional in USD (the docs say it is paid in outcome tokens and give no closed form: approximation) (H: `https://docs.limitless.exchange/user-guide/fees.md`) |

Every package is "buy each leg at its executable ask (a NO leg = hit the YES bid at 1 - bid), collect the guaranteed MINIMUM payoff": `net = payoff*q - cost - fees`, with `q` chosen by scanning every cumulative-depth breakpoint (profit is piecewise linear). **No midpoints, last trades or Gamma `outcomePrices` are used.** Reported capital = total cost of the legs.

Payoff conventions: complement 1; ME sell side (buy NO of each leg that has a bid) >= n-1 (valid for any mutually-exclusive set, exhaustive or not); ME buy side (buy YES of every leg) 1 **only if exhaustive**; ladder (buy easy YES + hard NO) >= 1; cross-venue (YES_A + NO_B) = 1 only if the contracts are identical.

### 1.3 Detection pipeline

1. `fetch_listings.py` -> `universe.py` normalises 4 venues to one schema.
2. `ladders.py`/`textproc.py`: threshold and date families inside an event (Kalshi: structured `strike_type`/`floor_strike`/`cap_strike` preferred; Polymarket, Limitless, XO: regex templates). `screen.py`: ME sets (Polymarket `negRisk` events; Kalshi `mutually_exclusive`), near-violation ladder pairs (within 2c on listing quotes), and cross-venue links; it chooses which books to fetch.
3. `linking.py`: blocking (idf-weighted rare-token inverted index, end date within 60 days), `sim = 0.55*cosine(idf) + 0.25*SequenceMatcher + 0.20*date score`, x0.6 if both sides carry different number tokens, x0.5 if the market-type signature differs (O/U, spread, draw, house/senate, republican/democratic ...), x(1-0.5*rare-token mismatch); NFL/NBA/NHL/MLB nickname<->city aliases; head-to-head orientation check (`same`/`inverse`/`unknown`/`different_outcome`). Links below 0.45 are dropped.
4. `analyze.py`: depth-walking with the fee models above. `make_recheck.py` + `fetch_books.py --fresh --tag recheck`: persistence. `make_calibration.py`: random un-screened sets/pairs. `audit_prepare.py` + human labels: false-link audit. `finalize.py`: all headline numbers.

### 1.4 Adversarial checks

* `test_logic.py`: 29 unit tests, all pass (`unit_tests_output.txt`). Fee vectors come from the venues' docs: Polymarket 100-share tables (crypto 0.07: $1.75 at 50c, $0.33 at 5c; sports 0.05: $1.25; symmetric around 50c), Kalshi doc example, XO doc example, Limitless table points. Side logic: Kalshi YES ask = 1 - best NO bid with sizes; best-last (Polymarket, Kalshi) vs best-first (XO) sorting; Limitless 1e6 units; crossed-book detection; NO leg = 1 - YES bid; ladder package; optimiser on hand-made books (including a case where fees flip a USD 2.00 gross edge to negative).
* Parser tests exist because they caught real errors (section 5.1): bare "hit" has no direction, "Under Trump Administration" is not a threshold, "continues through Oct 22" is a survival market (opposite monotonicity), "be above X by D" is point-in-time (not monotone in D), a bare "Jan 1" read in October is next January, empty-side Kalshi quotes, `dip to $80,000` was wrongly dropped as a "range" (found by a unit test, fixed, pipeline re-run).
* Independent hand check of one cross-venue edge outside the code: PM YES 0.265 (3,674 sh at the touch) + Kalshi NO 0.71 for the Yamal Ballon d'Or pair, q=4,069.23: hand-walked costs USD 1,079.14 + 2,889.15, gross 100.94, fees 23.79 (PM, rate 0.03) + 58.65 (Kalshi) -> net 18.50 vs pipeline 18.49. [H]
* Corroboration from a sibling workflow's listing-level scan (`within_venue_consistency_scan_2026-10-18.json`, snapshot 17:59-18:00Z, top-of-book only): Polymarket negRisk 421 sets, sell gross-positive 7 / net 0; Kalshi ME 410 sets, sell gross-positive 6 / net 0; Kalshi threshold ladders 63,832 pairs, 2 gross violations, 0 net. Same conclusion by an independent method. [M, other workflow's file]

---

## 2. Results by analysis

### 2.1 Mutually-exclusive sets

Listing level (all sets, top-of-book): Polymarket 494 negRisk events with >= 2 tradable legs (13 with listing sum of bids > 1, 159 with sum of all quoted asks < 1); Kalshi 4,936 ME events with >= 2 quoted legs (48 with sum of bids > 1, 158 with sum of asks < 1). [H]

Books were fetched for sets that passed a listing pre-screen (sum bids >= 0.985, or sum asks <= 1.02-1.03) and **depth-walked**:

| | sets with all books | gross > 0 | net > 0 | note |
|---|---|---|---|---|
| Sell side, Polymarket | 24 | 5 | **0** | fees USD 29.85 vs gross USD 10.21 on the 5 |
| Sell side, Kalshi | 682 | 45 | **0** | fees USD 1,413.5 vs gross USD 289.0 on the 45 |
| Sell side, random un-screened (420 Kalshi + 8 PM sets) | 379 | 2 | 0 | pre-screen calibration |
| Buy side, Polymarket, exhaustive verified (negRisk, all legs tradable, complete event) | 8 | 2 | **0** | |
| Buy side, Polymarket, all | 24 | 2 | 0 | 16 flagged not exhaustive (augmented / untradable / unfetched legs) |
| Buy side, Kalshi (exhaustiveness unknown) | 701 | 22 | 10 | **not arbitrage**: median 31.6 bps, p90 82.8 bps, max 810 bps, capital median USD 3,051, p90 USD 8,258, e.g. "Oklahoma Attorney General winner?" 2 legs, sum of asks 0.988; two-candidate races where a tie or third candidate pays 0 |
| Buy side, random un-screened | 415 | 15 | 12 | same non-exhaustive pattern |

Fee sensitivity on the same Kalshi books (`fee_sensitivity.json`): direct-member rounding changes nothing (still 0/45 net-positive sell-side); a hypothetical quarter-size fee turns 32/45 sets and all 10 gross-positive ladder rows net-positive (USD 72.8 total); zero fees gives the gross ceiling USD 402.5. **The only lever that matters is the taker coefficient, i.e. maker execution on most legs**, which is not an immediate-arbitrage strategy. [H]

Polymarket specifics: markets that are `closed:false` but already proposed/resolved still trade near 0.999 (e.g. an Arsenal match at 0.9995 with `umaResolutionStatus: proposed` in `08`); 2 of 74 gross-positive ME rows carried `past_end_date`. negRisk "convert" (1 NO -> 1 YES in every other leg) could lower the cost of the sell side below "n taker NO purchases"; I did not model it (limitation).

### 2.2 Complement inside one market

* Kalshi: one book; YES ask + NO ask < 1 is equivalent to a crossed book. 0 crossed among 5,825 non-empty books (4,151 two-sided) and 0 among 81,874 two-sided listing quotes. [H]
* Polymarket and XO: separate NO-token books exist, but they are mirrors. Back-to-back fetch (about 0.3 s apart, `mirror_test.py`): Polymarket 24/25 identical in levels and sizes with identical `timestamp` fields (the one miss had book timestamps 1.2 s apart, i.e. the book changed between the two requests), XO 20/20 (XO `timestamp` is request time, so it differs by about 0.3 s while the levels are identical). My first mirror sample (NO books fetched about 1.5-2 minutes after the YES books) showed only 15/25 identical, entirely a timing artefact, and one of those pairs looked like `YES bid + NO bid = 1.06`: **a naive "independent books" arbitrage detector would have reported false complement arbitrage from fetch skew alone.** [H]
* Limitless: YES-side book only (NO derived), so no independent NO book to cross.
* Result: 0 crossed books in 6,937 fetched (Polymarket 378, Kalshi 5,851, XO 411, Limitless 297), 0 complement opportunities. [H]

### 2.3 Threshold and date ladders

Families found (regex/structured): Kalshi 7,925 (7,542 threshold, 383 date), Polymarket 606 (553 / 53), Limitless 49, XO 3. Pairs with two-sided listing quotes: Kalshi 266,832, Polymarket 11,245. Violations on listing quotes (bid of the harder leg > ask of the easier leg): Polymarket 3, Kalshi 9. Books fetched for the 2,718 pairs within 2c of a violation; 1,849 pairs had both books non-empty: **10 violated on real books (Kalshi 8, Polymarket 2), 3 net-positive**:

| Net-positive ladder row | q | Capital | Net | bps | Comment |
|---|---|---|---|---|---|
| Kalshi "any company achieves AGI" Before Jan 1 2031 (ask 0.78) vs Before Jan 1 2030 (bid 0.81) | 1,853 | USD 1,798 | USD 13.36 | 74 | rules identical except the deadline; 4-5 years of lock-up = 0.2% APR; persisted at re-fetch |
| Polymarket ETH above $2,800 vs above $3,000 on Oct 20 | 5 | USD 4.98 | USD 0.018 | 36 | 0.1c vs 0.5c prices, minimum size |
| Polymarket ETH above $2,900 vs $3,000 | 5 | USD 4.99 | USD 0.007 | 14 | falls to USD 0.0019 on re-fetch |

The other 7 inversions are fee-negative or dust (e.g. crude-oil inventory "Above 411m" ask 0.67 vs "Above 412m" bid 0.68: gross USD 52, fees USD 160). Un-screened calibration: 0 of 298 random Kalshi pairs violated. [H]

Polarity traps found in my first parser version (all would have produced false "violations", see 5.1): survival wording ("US x Iran ceasefire continues through Oct 22?" decreases with the date; 63 of the 130 Polymarket listing-level "violations" of the first parser version; successive fixes took Polymarket 130 -> 3 and Kalshi 265 -> 9), Kalshi ME "exactly N" bins, negative spread numbers ("Player -6.5 games"), `hit (LOW)` markets, empty ask encoded as 0.0000 (HYPE price ladder: "ask 0.00 vs bid 0.62"), year roll-over ("Before Jan 1" parsed as the past).

### 2.4 Cross-venue identical markets

Candidate generation: about 70,000 raw candidates over six venue pairs, 4,896 with sim >= 0.45, plus 496 Limitless-declared mirrors = 5,392 link records (orientation: 4,517 `same`, 108 `inverse`, 767 `unknown`). 951 link records (868 unique pairs; 82 hint duplicates) had non-empty books on both sides and a usable orientation and entered the edge calculation. Skipped: 4,032 with no fetched book, 347 orientation `unknown`, 40 `inverse` without a verified two-way contest, 21 empty books, 1 ambiguous Polymarket side.

| Venue pair | link pairs with books | gross > 0 | net > 0 | of which sim >= 0.65: pairs / net > 0 |
|---|---|---|---|---|
| Kalshi / Limitless | 683 | 468 | 451 | 113 / 15 |
| Kalshi / XO | 61 | 11 | 8 | 37 / 3 |
| Polymarket / Limitless | 62 | 1 | 1 | 58 / 0 |
| Polymarket / Kalshi | 41 | 18 | 15 | 20 / 7 |
| Polymarket / XO | 18 | 9 | 9 | 9 / 5 |
| XO / Limitless | 3 | 1 | 1 | 0 / 0 |

Net edge of net-positive pairs, by similarity bin (`final_summary.json`):

| sim | pairs | net > 0 | median net bps | p90 bps | median capital USD | p90 capital USD |
|---|---|---|---|---|---|---|
| < 0.55 | 413 | 332 | 637 | 6,099 | 429 | 980 |
| 0.55-0.65 | 218 | 123 | 2,059 | 14,062 | 440 | 938 |
| 0.65-0.75 | 83 | 17 | 40 | 1,258 | 72 | 20,902 |
| 0.75-0.85 | 35 | 7 | 2,716 | 10,920 | 489 | 974 |
| 0.85-0.95 | 39 | 3 | 246 | 845 | 179 | 481 |
| >= 0.95 | 60 | 3 | 59 | 164 | 991 | 991 |
| Limitless-declared mirrors (Polymarket<->Limitless) | 20 | 0 | - | - | - | - |

Histogram of net bps over the 485 net-positive pairs: 0-25: 11, 25-50: 24, 50-100: 24, 100-250: 50, 250-500: 88, 500-1000: 73, 1000-5000: 143, > 5000: 72. The fat tail is false links: **a real inconsistency would not be 50x the fee-adjusted spread**. All of the 72 pairs above 5,000 bps are label X or low-similarity links. Polymarket<->Limitless mirrors, which Limitless market-makes against Polymarket, were consistent: 1 gross-positive of 62.

### 2.5 False-link audit

**Sample**: 78 links drawn with seed 20261019 from the 868 evaluated pairs: 12/12/12/10/10/10 random pairs in six similarity strata, plus 12 from a "positive-edge" stratum (sim >= 0.55, best net edge > 0, not otherwise sampled; population 141). I read the actual rules text of both sides (Kalshi `rules_primary`/`rules_secondary`, Polymarket `description` + `resolutionSource`, Limitless description, XO detail `rules.description`/`outcomeRules`/`resolutionSources`). Single rater (me): no legal or domain second opinion. **Label policy** (`audit_results.json`): `I` identical; `Dm` looks identical but resolution differs (minor: documented cancel/void/postponement, tie-break, cut-off or source difference that could change this leg's payout in an uncommon case); `DM` major (none seen); `X` different event, scope, deadline or direction. Labels are in `link_labels_keyed.json` (keyed by market ids) and `audit_sample_labeled.json` (texts and rule heads).

| Stratum (sim) | population | audited | I | Dm | X | strict precision (95% CI) | lenient (I+Dm) |
|---|---|---|---|---|---|---|---|
| 0.45-0.55 | 415 | 12 | 0 | 1 | 11 | 0% (0-24%) | 8% |
| 0.55-0.65 | 221 | 12 | 0 | 3 | 9 | 0% (0-24%) | 25% |
| 0.65-0.75 | 84 | 12 | 10 | 1 | 1 | 83% (55-95%) | 92% |
| 0.75-0.85 | 35 | 10 | 3 | 5 | 2 | 30% (11-60%) | 80% |
| 0.85-0.95 | 39 | 10 | 6 | 2 | 2 | 60% (31-83%) | 80% |
| >= 0.95 | 60 | 10 | 9 | 1 | 0 | 90% (60-98%) | 100% |
| positive-edge (sim >= 0.55) | 141 | 12 | 1 | 1 | 10 | 8% | 17% |

**Precision at a threshold** (population-weighted over the six random strata; n per bin is 10-12, so the intervals are wide and the non-monotone bins are noise plus category mix):

| sim >= | pairs in population | strict | lenient |
|---|---|---|---|
| 0.45 | 854 | 18% | 34% |
| 0.55 | 439 | 36% | 57% |
| 0.65 | 218 | 72% | 90% |
| 0.75 | 134 | 66% | 89% |
| 0.85 | 99 | 78% | 92% |
| 0.95 | 60 | 90% | 100% |

Across all 78 audited links: 29 identical, 14 minor-difference, 35 different. **Of the 43 true links, 14 (33%) carry a documented rule difference.**

**Positive-edge census** (not a sample): all 30 net-positive link pairs with sim >= 0.65 labelled by hand (`apply_census_labels.py` refuses to run if any pair is unlabelled): 13 I, 4 Dm, 13 X -> precision 43% strict / 57% lenient exactly where the arbitrage appears. Combined with the audit's positive-edge stratum (2 of 12 true at sim 0.55-0.65 and above), **a link that shows a profitable edge is a false link more often than not.**

**Most common false-match patterns** (`false_link_patterns.json`; counts in the 35 X of the sample, then in the 13 X of the census):

1. *Same market template, different entity* (player, team, candidate, party, bank, minister): 26 / 1. Boilerplate rules dominate tf-idf, e.g. Kalshi "Champions League Golden Boot - Luis Diaz" vs Limitless "Champions League Golden Boot Erling Haaland", "2028 Democratic presidential nominee" lists crossing each other, "Who will leave their role in the Trump administration" (Rubio vs Wiles).
2. *Near-identical wording, different subject or scope*: 6 / 8. OpenAI IPO vs Anthropic IPO lead bank (rules identical except the company, sim 0.79-0.81, edge 109-113%), "on the ballot" vs "to win" the French election, La Liga / EPL golden boot vs Champions League golden boot, Oregon/Iowa State Senate vs US Senate, Ligue 1 vs Champions League.
3. *Same question, different deadline*: 2 / 1 (Comey case dismissed before Jul 1 2027 vs Jan 1 2027; SAVE Act). Calendar spreads, not identical contracts.
4. *Opposite direction or a different bracket of the same decision market*: 1 / 3 (Fed "cuts by 25 bps" vs "hikes by exactly 25 bps"; Draw vs team win; Republican vs Democratic control). The single largest apparent edge in the whole dataset, 158,984 bps (USD 94 net on USD 5.90 of capital), is Kalshi "Bank of Korea rate decision in October - Maintain current rate" vs Limitless "Bank of Korea decision in October? 25 bps cut" (sim 0.47; judged from titles, not in the audit sample): same decision, different bracket.
5. *Orientation inversion on head-to-head markets* (not in the final audit, found while building): the YES side of "A vs B - B" on one venue is "A to win" on another; the first linker turned this into cross-venue "edges" of 2,000-47,000 bps. An orientation check plus an explicit `different_outcome` for Draw markets removed it, but 767 of 5,392 links remained `unknown` (347 of them had books and were skipped) and Limitless head-to-head markets have no subject field at all.
6. Remaining minor differences among true links: soccer 90-minute markets (Kalshi "fair price if cancelled or rescheduled > 48 h" vs XO void/secondary-source clauses), Nigerian Senate tie-break (Kalshi: government entry; Limitless: alphabetical), Venezuela head-of-state (Kalshi pins Dec 31 10:00 ET), Trump-Kim meeting definition, OPEC "another country" (Limitless excludes the UAE announcement), NFL postponement (Polymarket stays open; Kalshi pays fair price after 48 h), Polymarket "Other" fallbacks vs Kalshi silence.

**Recall of the linker** against Limitless's own declared mirrors (`metadata.externalSlug` = a Polymarket slug; the declaration is not ground truth): of 475 declared mirrors with both sides in my universe, 393 appeared as a candidate at any similarity; recall at sim >= 0.45 / 0.55 / 0.65 / 0.75 / 0.85 = 56% / 47% / 41% / 22% / 13% (`linker_recall_vs_limitless_mirrors.json`). Misses are mostly formatting ("Bitcoin Up or Down on October 19?" vs "BTC Up or Down Daily", "Will Juventus FC win on 2026-10-18?" vs "Serie A, Juventus vs Lazio Juventus"). [H]

### 2.6 Summary statistics

| Family | Candidates evaluated | Gross > 0 | Net > 0 | Net bps (median / p90 / max) of net-positive | Executable capital USD (median / p90) of net-positive | Survives after filters |
|---|---|---|---|---|---|---|
| ME sell side | 706 (+379 random) | 50 (+2) | 0 | - | - | 0 |
| ME buy side | 725 (+415 random) | 24 (+15) | 10 (+12), none proven exhaustive | 31.6 / 82.8 / 810 | 3,051 / 8,258 | 0 (Polymarket verified-exhaustive: 0/8) |
| Complement | 6,937 books | 0 | 0 | - | - | 0 |
| Ladders | 1,849 (of about 278k listed pairs) | 10 | 3 | 25 / 36 / 74 | 5 / 1,798 | 1 (USD 13.4, 0.2% APR) |
| Cross-venue (all links) | 868 pairs, 1,644 directions | 508 pairs | 485 pairs | 826 / 9,897 / 158,984 | 450 / 979 | 6 survive the generic funnel, all 6 confirmed false links |
| Cross-venue (verified true links, sim >= 0.65) | 17 | 17 | 17 | 46 / 164 / 246 | 991 / 20,902 | 0 under 5% APR and 300 bps haircut |

**Generic funnel on the 485 net-positive link pairs** (`final_summary.json: cross_venue.funnel`): 485 -> sim >= 0.65: 30 -> no crossed/past-end/proposed flag: 30 -> no leg priced <=2c or >=98c: 15 -> still positive on re-fetched books: 14 -> capital >= USD 10: 12 -> net APR on locked capital >= 5%: 7 -> positive after a 300 bps haircut: 6. The 6 survivors are the Kalshi/XO "on the ballot" vs "to win" pair, two OpenAI-vs-Anthropic bank pairs, two La Liga/EPL vs Champions League golden boot pairs and the Comey deadline pair: **0 of 6 are true links.**

**Verified-true funnel** (17 true links): 13 strictly identical -> 5 without a tail-price leg -> 4 persist on re-fetch (Roma Serie A did not: +42 bps became -150 bps on USD 77) -> 3 with capital >= USD 10 -> **0** with net APR >= 5% -> 0 after a 300 bps haircut. With no APR hurdle the three survivors (Rubio, Yamal, Beshear) total about USD 39 of net profit on USD 5,930 of locked capital.

**Haircut sensitivity** (net-positive pairs whose net bps still exceeds the haircut): all pairs 485 / 426 / 362 / 288 / 215 at 0 / 100 / 300 / 500 / 1000 bps; sim >= 0.65: 30 / 13 / 9 / 9 / 8; sim >= 0.85: 6 / 3 / 1 / 1 / 0. The haircut does not rescue the screen because the surviving large numbers are false links, not mispriced true links. The "right" haircut is a rule-diff score per link, not a constant; among audited true links 33% need one.

**Attribution of gross-positive rows** (first cause that applies; `final_summary.json: attribution_of_gross_positive`): cross pairs (508): unverified low-similarity link 426 (84%), confirmed false by reading rules 58 (11%), fees exceed gross 7, tail-price leg 9, APR below 5% 5, vanished on re-fetch 1, capital < USD 10 1, remaining 1 (Nigerian Senate, 246 bps, 6.8% APR, but a label-Dm tie-break difference and below a 300 bps haircut). ME rows (74): fees exceed gross 52 (70%), set not proven exhaustive 20 (27%), already ended / resolution proposed 2 (3%). Ladder rows (10): fees 7, tail legs 2, remaining 1. **Crossed books: 0. Stale-flagged (untouched book > 6 h): 0. Past-end/proposed: 2 of 594 gross-positive rows.**

**Persistence**: of 188 net-positive cross rows re-fetched 10-13 minutes later, 187 stayed net-positive (median absolute change in net bps: 0); ME 55/55 and ladders 10/10 stayed gross-positive. Persistence is therefore **not** evidence of validity: illiquid standing quotes do not move, and a false link persists as long as a true one.

---

## 3. Limitations (read before quoting any number)

1. **One snapshot, 18:06-18:43 UTC on a Sunday evening.** NFL Sunday games were finished; sports 3-way and prop markets dominate Polymarket/Kalshi volume. No time series, so nothing here estimates how often or how long edges appear.
2. **Selection**: books exist only for markets chosen by a listing-quote pre-screen (ME sets near-arbitrage; ladder pairs within 2c; top-liquid and cross-link candidates). Calibration on random un-screened samples (420 Kalshi + 8 PM sets, 298 Kalshi ladder pairs) found nothing missed, but the Polymarket calibration is only 8 sets, and Polymarket CLOB books are capped by the GET-only rule (one request per market): only 378 Polymarket books were fetched in total.
3. **Latency**: listings (18:06-18:09) are about 15 minutes older than the books (18:21-18:25). Cross-venue legs were fetched seconds to minutes apart, and the Kalshi batch endpoint is one snapshot per 100 tickers. An executable system needs synchronous streams (Kalshi WebSocket needs an API key even for public channels, `08`).
4. **API caching**: Gamma `bestBid/bestAsk` and Kalshi listing quotes are cached and drift (7.1% of Kalshi best asks differ by > 1c from the book; 5.5% on Polymarket); the CLOB `timestamp` is the last change, not the fetch time, so "book age" is not observable. Polymarket `/price` BUY = bid (not used).
5. **Rule nuance**: the audit reads the displayed rules text only (Kalshi `rules_secondary` is partly truncated in my 1,100-character view; XO detail text was fetched for sampled markets only); one rater; no check of the venues' rulebooks (Kalshi rulebook and fee PDF were blocked in `08`; UMA / Kalshi dispute procedures not modelled). A "looks-identical-but-differs" label is a judgement.
6. **Fee models**: Polymarket `exponent` other than 1 is assumed to be an exponent on `p(1-p)` (all live values were 1); Kalshi accumulator rebates ignored (slightly conservative), fee-free promotions and Polymarket taker/maker rebate programs ignored; Limitless fee approximated from a table and charged in USD; XO uses the Data API fee (the `/fee-rate` endpoint disagreed in `02`). I did not model Polymarket negRisk `convert`, gas, bridge fees, or Kalshi/Polymarket funding frictions.
7. **Exhaustiveness** is only verifiable for Polymarket negRisk events (flags `negRisk`, `negRiskAugmented`, `negRiskOther`, tradable status); Kalshi gives no such flag, so every Kalshi buy-side result is "unverified" by construction.
8. **Orientation and ambiguity**: 347 head-to-head links that had books were dropped as `unknown`, and Limitless sports markets have no subject field, so some real cross-venue opportunities were not evaluated; recall is 13-56% (section 2.5).
9. **Capital and time value**: lock-up uses the later of the two expected resolutions (Kalshi `expected_expiration_time`, else close); APR uses net bps only. Kalshi and Polymarket pay holding yields on some long-dated positions that I did not model. Legal/eligibility constraints (US excluded from Polymarket global and Limitless; Kalshi's aggregation clause in `08`) mean no single account can trade most of these pairs.
10. **Labels are mine.** 78 + 30 pairs, 108 distinct labels; the strict precision per bin has 10-12 observations (CIs in the table above are Wilson 95%).

---

## 4. Design implications for the aggregation layer (all M, derived from the measurements)

1. Treat cross-venue edge as a three-gate pipeline: (a) venue-declared or id-based link (Limitless `externalSlug`, Predict.fun `polymarketConditionIds`/`kalshiMarketTicker`, Probable `/markets/polymarket/{id}` from `09`), (b) rule-text diff with a typed difference list, (c) orientation check. Title similarity is a candidate generator only; a similarity score alone had 18-72% precision.
2. Store a per-link **rule-difference record** (cancel/void/postponement, tie-break, cut-off timestamp, source, early determination, "Other" fallback) and subtract a link-specific haircut; do not use a global constant.
3. Always compute executable depth-walked edge with per-venue fees, not midpoints: fees exceeded the gross edge about 5:1 on Kalshi ME sets, and a USD 2.00 gross edge flips negative in the unit test.
4. Use listing top-of-book only for a pre-screen; the listing and the book disagreed by > 1c on about 6-7% of markets after 15 minutes.
5. Flag and exclude: empty-side encodings (`0.0000`), tail legs (<=2c / >=98c), already-resolved-but-open markets, non-exhaustive sets, long-dated carry (report APR on locked capital, not bps).
6. Adversarial parser tests are cheap and found six edge-polarity bugs; keep them as regression fixtures.
7. Value proposition: the data shows few free-lunch arbitrages; the useful products are (i) a verified link graph with rule diffs, (ii) price-discovery and consistency dashboards (ladder and set sums), (iii) maker-side strategies where the 4-7% taker coefficient does not apply. That is consistent with `10`, `14` and `16` (aggregator landscape, platform-of-platforms, linking methods).

---

## 5. Notes on what went wrong on the way (kept because they are the findings)

### 5.1 Bugs the checks caught (each changed the numbers)

| # | Symptom | Cause | Fix |
|---|---|---|---|
| 1 | "Date ladder violations" on a ceasefire market (63 pairs) | "continues through D" is a survival market: P falls with D | cumulative wording excludes persistence/negation words |
| 2 | HYPE price ladder "ask 0.0000 < bid 0.62" | listing encodes an empty ask as `0.0000` with size 0 | treat price<=0 / size 0 / ask>=1 as missing |
| 3 | "Game Spread - X -6.5 games" violations | negative parsed numbers invert the ordering | prefer Kalshi `floor_strike`/`cap_strike` |
| 4 | "exactly N launches" treated as a lower ladder | `strike_type` is `less` but the event is ME with disjoint bins | skip threshold families inside ME events |
| 5 | WTI `hit (LOW)` and "Under Trump Administration" | direction words | direction only when followed by a number, plus (HIGH)/(LOW)/arrows; bare "hit" has no direction |
| 6 | "Before Jan 1" parsed as past | no year | roll forward when more than 45 days before the snapshot |
| 7 | Cross-venue edges of 20,000-47,000 bps on soccer/NFL | the YES side of "A vs B - B" differs by venue | orientation resolver with `same/inverse/unknown/different_outcome` |
| 8 | Same NFL game flagged `inverse` (edge 23,642 bps on USD 923,876) | opponent set polluted by the other nickname in the event title | split event title at "vs/at" and take the other half; found while reading audit pair #14 |
| 9 | `dip to $80,000` ladders missing | regex treated "to <digit>" as a range | range regex tightened (found by a unit test) |
| 10 | Mirror test 15/25 | YES and NO books fetched minutes apart | back-to-back fetch (24/25) |

### 5.2 Not found / not done

* NOT FOUND (searched: Kalshi docs index, rate-limits page in `08`): any documented anonymous rate limit; I observed no 429 at about 0.3 s spacing.
* NOT FOUND (searched: Limitless docs `fees.md`): a closed-form CLOB fee formula; table only.
* NOT DONE: Polymarket US, Opinion, Predict.fun, SX Bet, Myriad, Probable, Manifold (not requested); Hyperliquid outcomes; a time series; WebSocket feeds (Kalshi's requires an API key).
* NOT DONE: second rater for the audit; a longer persistence interval than 10-13 minutes; recall of PM<->Kalshi or Kalshi<->XO links (no declared-link reference exists for them).

---

## 6. Reproduce

Everything below is public GET only. `RAW` is a scratch directory (it fills with about 0.8 GB of cached responses; do not put it in the repo). A fresh run sees a different market state, so numbers will differ; the saved JSON/CSV are the record of the 2026-10-18 run.

```bash
cd docs/research/fixtures/linking/code
export RAW=/tmp/linking_raw; mkdir -p "$RAW"          # use the session scratchpad if you have one
python3 -I test_logic.py                                 # 29 unit tests (fees, sides, parsers, ladders, orientation)

# A. listings (about 3 min; Kalshi events are 4 MB per page, series list is 19 MB)
python3 -I fetch_listings.py --raw "$RAW"
# B. screen: families, ME sets, links, which books to fetch (no network)
python3 -I screen.py --raw "$RAW"
# C. books (four hosts in parallel, about 3 min)
for v in polymarket kalshi xo limitless; do python3 -I fetch_books.py --raw "$RAW" --venue $v & done; wait
python3 -I fetch_xo_fees.py --raw "$RAW"                 # effectiveFeeConfig.takerFeeBps of linked XO markets
python3 -I fetch_books.py --raw "$RAW" --venue kalshi --only "$RAW/screen/targets_missing.json" --merge   # only if screen reports missing books
# D. measurements
python3 -I analyze.py --raw "$RAW" --out "$RAW/out"      # writes RAW/{opps_full,cross_all,me_all,ladder_all}.json
python3 -I make_recheck.py --raw "$RAW"
for v in polymarket kalshi xo limitless; do python3 -I fetch_books.py --raw "$RAW" --venue $v --tag recheck --only "$RAW/recheck_$v.json" --fresh --mirror-sample 0; done
python3 -I analyze.py --raw "$RAW" --out "$RAW/out" --books-tag recheck
python3 -I make_calibration.py --raw "$RAW"
python3 -I fetch_books.py --raw "$RAW" --venue kalshi --tag calib --only "$RAW/calib_kalshi.json"
python3 -I fetch_books.py --raw "$RAW" --venue polymarket --tag calib --only "$RAW/calib_polymarket.json" --mirror-sample 0
python3 -I analyze.py --raw "$RAW" --out "$RAW/out" --books-tag calib
python3 -I mirror_test.py --raw "$RAW" --venue polymarket --n 25 --out "$RAW/mirror_polymarket_b2b.json"
python3 -I mirror_test.py --raw "$RAW" --venue xo --n 20 --out "$RAW/mirror_xo_b2b.json"
python3 -I recall_check.py --raw "$RAW" --out ../linker_recall_vs_limitless_mirrors.json
python3 -I fee_sensitivity.py --raw "$RAW" --out ../fee_sensitivity.json
# E. false-link audit: draws the sample (seed 20261019), prints both sides' rules to RAW/audit_sheet.txt
python3 -I audit_prepare.py --raw "$RAW" --out "$RAW/out"
#    read RAW/audit_sheet.txt and label; to reuse my 2026-10-18 labels for pairs that reappear:
python3 -I restore_labels.py --raw "$RAW"                # writes RAW/audit_labels_all.json and RAW/census_labels.json
python3 -I apply_census_labels.py --raw "$RAW"           # exits non-zero if a net-positive sim>=0.65 pair is unlabelled
# F. headline numbers + compact files (all <= 100 KB)
python3 -I finalize.py --raw "$RAW" --fixtures ..
```

Files (all in `docs/research/fixtures/linking/`; none above 100 KB): `final_summary.json` (every number in this note), `analysis_summary.json` (analyses 1-4 raw summary; its Polymarket `mirror_test` block is empty because a later `--merge` fetch overwrote the first, time-skewed, sample; use `mirror_test_results.json`), `audit_results.json`, `audit_sample_labeled.json`, `link_labels_keyed.json`, `census_true_links.csv`, `cross_candidates_top.csv`, `me_sets_results.csv`, `ladder_results.csv`, `false_link_patterns.json`, `fee_sensitivity.json`, `linker_recall_vs_limitless_mirrors.json`, `mirror_test_results.json`, `snapshot_manifest.json`, `unit_tests_output.txt`, `code/*.py`. (Other files in that folder belong to sibling workflows and were not touched.)

---

## 7. Sources

Primary docs read this session [H]:
* Polymarket fees: `https://docs.polymarket.com/trading/fees.md` (formula, category rates, 100-share tables used as unit-test vectors).
* Kalshi: `https://docs.kalshi.com/llms.txt`, `.../getting_started/fee_rounding.md` (rounding mechanics + worked example), `.../api-reference/market/get-multiple-market-orderbooks.md` (`GET /markets/orderbooks`, `tickers` max 100, bids only), `.../api-reference/market/get-markets.md` (`limit` <= 1000, `mve_filter`), `.../api-reference/market/get-series.md` (`fee_type`, `fee_multiplier`).
* XO: xo-docs MCP `/guides/fees.mdx` (curve `fee = C * feeBps/10000 * p * (1-p)`, floor per fill), `product/trading/fees` (4% example), `guides/smart-accounts`.
* Limitless: `https://docs.limitless.exchange/user-guide/fees.md` (buy 0.40-3.00%, sell 0.42-1.50%, table).
* Live endpoints (public GET): `gamma-api.polymarket.com/markets/keyset`, `/events/{id}`; `clob.polymarket.com/book`; `external-api.kalshi.com/trade-api/v2/{events,series,markets/orderbooks}`; `api-mainnet.xo.market/api/{markets,markets/contract/{conditionId}}`; `orderbooks.xo.market/book`; `api.limitless.exchange/{markets/active,markets/{slug}/orderbook}`.

Repo notes built on: `docs/plan.md` (context only), `docs/research/08-venues-polymarket-kalshi.md` (units, ordering, fees, ToS), `docs/research/02-xo-read-api.md` (XO endpoints, units, fee conflict), `docs/research/09-venues-onchain-clob.md` (Limitless units, mirror hooks), `docs/research/fixtures/linking/within_venue_consistency_scan_2026-10-18.json` (sibling listing-level scan, corroboration only).

My scripts: `docs/research/fixtures/linking/code/*.py` (20 files); raw responses were cached outside the repo (RAW directory) and are not committed.


---

## Verification (2026-10-19)

Adversarial verifier pass. Method: copied the saved code (`fixtures/linking/code/`) to a scratch directory, ran it unchanged (`python3 -I`, public GET only, 1,952 requests in 2026-10-18 19:00-19:18 UTC; per host CLOB 556 (+3 manual curl probes), XO orderbook 456, Limitless 360, Gamma 294, Kalshi 165, XO Data API 121; no 429/5xx; 4 CLOB 404 and 4 Limitless 400), audited the code for classic arbitrage-detection bugs, re-derived fee models from the venue docs, and re-labelled 16 audit pairs blind from the rules text. Tags: H = measured/read by me this session. All 29 unit tests pass (also after my one-line fix below).

### V1. Reproduction on a fresh snapshot (qualitatively reproducible, numbers within a few percent)

Listings 19:00:32Z, books 19:05:57-19:08Z (about 6-8 min later), recheck 19:14Z. Universe: Polymarket 13,097 (10,039 tradable), Kalshi 129,166, XO 407, Limitless 1,407 (1,335 tradable). Books: 7,020 (PM 386, Kalshi 5,931, XO 407, Limitless 296).

| Quantity | Researcher (18:06-18:43Z) | Fresh run (19:00-19:18Z) |
|---|---|---|
| ME sell-side sets with books / gross>0 / net>0 | 706 / 50 / 0 | 720 / 54 / 0 (PM 26/6/0, Kalshi 694/48/0) |
| Kalshi fees vs gross on gross-positive sell sets | USD 1,413.5 vs 289.0 (4.9x) | USD 1,418.7 vs 300.5 (4.7x) |
| Zero-fee ceiling / quarter-fee net-positive sets | USD 402.5 / 32 of 45 | USD 437.7 / 35 of 48 (direct-member grid: still 0) |
| ME buy-side net>0 | 10 Kalshi (two-leg, unverified) | 10 Kalshi two-leg + 1 PM flagged `not_exhaustive`; PM verified-exhaustive 9 evaluated / 2 gross / 0 net |
| Random un-screened calibration | 379 sell sets 2 gross / 0 net; 0/298 ladder pairs | 393 sell sets 1 gross / 0 net; 0/296 ladder pairs violated; buy-side 14 "net-positive" all flagged non-exhaustive (51st state, etc.) |
| Crossed books / crossed listing quotes | 0 / 0 | 0 of 7,020 books; 0 of 80,931 Kalshi and 0 of 7,279 PM two-sided listing quotes |
| Mirror test (back-to-back) | PM 24/25, XO 20/20 | PM 25/25 price levels, 24/25 sizes (the miss: timestamps 0.2 s apart); XO 20/20 |
| Ladders evaluated / gross>0 / net>0 | 1,849 / 10 / 3 (USD 13.4) | 2,164 / 9 / 2 (USD 14.45: Kalshi AGI date ladder USD 14.07 at 74.4 bps on USD 1,892, and a PM tail-priced date ladder USD 0.38) |
| Cross-venue unique pairs with books / gross>0 / net>0 | 868 / 508 / 485 | 867 / 498 / 476; median 873 bps, p90 10,016, max 158,984 (same Bank of Korea "Maintain" false link) |
| Net-positive by sim bin (pairs / net>0) | <.55 413/332, .55-.65 218/123, .65-.75 83/17, .75-.85 35/7, .85-.95 39/3, >=.95 60/3 | 407/324, 218/120, 84/19, 35/8, 40/2, 59/3 |
| Persistence on re-fetch (~8 min) | cross 187/188, ME 55/55, ladders 10/10 | cross 189/189, ME 58/60 gross>0 (0 net>0), ladders 9/9 |
| Linker recall vs Limitless-declared mirrors, sim>=.45/.55/.65/.75/.85 | 56/47/41/22/13% | 55.7/46.0/40.0/21.3/13.0% (504 declared, 483 usable, 395 found) |
| Listing vs book best-ask >1c | Kalshi 7.1%, PM 5.5% (~15 min) | Kalshi 3.8% (222/5,835), PM 3.3% (12/368) at 6-8 min, consistent with a time-dependent drift |
| Kalshi fee-type table | 15,188 series; 14,993 quadratic x1 ... | 15,189; 14,994 ... (same shape) |
| Kalshi empty-side encoding | bid 0.0000/size 0, ask 1.0000 | 43,586 markets bid 0.0000/size 0; 8,804 ask 1.0000; 150 ask 0.0000 |

Specific edges reproduce to the cent on the fresh books: Yamal Ballon d'Or PM+Kalshi net USD 18.95 (hand-walked: costs 1,095.46 + 2,933.31, gross 102.65, fees 24.15 + 59.55); Rubio 2028 Kalshi/Limitless 164.1 bps on USD 970 (exactly the saved value; the edge is the 1,000-contract Limitless depth); Beshear 45.7 bps on USD 991. The AGI date-ladder inversion is real on the book (hard "before 2030" bid 0.81 x 1,950 vs easy "before 2031" ask 0.78 x 4,939, collateral_return_type empty, so capital is not netted). Census statistics recomputed from `census_true_links.csv`: 17 rows, median 45.7 bps, p90 164.1, capital median USD 990.6, p90 20,902, lock 10.4-751.5 days (all match). Population-weighted precision recomputed from the stratum counts: 18.5%/33.5% at >=0.45 and 72.4%/90% at >=0.65 (match).

### V2. Corrected / refuted / unverifiable items

1. **CORRECTED - "stale-flagged (untouched book > 6 h): 0" and "stale or crossed books explain almost nothing" (section 0 item 7, section 2.6).** The staleness flag cannot fire on any venue. Measured on 386 PM books: fetch time minus book `timestamp` has median 11 s, p90 84 s, max 408 s, i.e. the CLOB `timestamp` behaves like a snapshot time and is NOT the time of the last change (limitation 4's statement "the CLOB `timestamp` is the last change" is wrong); XO `timestamp` = request time (median 0.07 s); Kalshi and Limitless books carry no timestamp. So the "0 stale" result is vacuous. Only "0 crossed" is a real measurement; resting-order age is unobservable from public GETs. [H]
2. **REFUTED - NOT FOUND "public subject/outcome field for Limitless head-to-head sports markets" (and limitation 8: "Limitless sports markets have no subject field").** The public listing has `metadata.outcomeLabels` = {"0": team, "1": team} on 13 NFL-style markets and `metadata.homeTeam/awayTeam/player1Name/player2Name` with `binaryMarketType: "moneyline"` on 91 markets (homeTeam == player1Name in all 91; YES = outcome 0), and the Limitless get-market doc mentions `metadata.homeTeam`/`awayTeam`/`outcomeLabels` in prose (https://docs.limitless.exchange/api-reference/markets/get-market.md; the YES-to-home mapping itself is not documented). 338 of the 356 orientation-`unknown` links that had books involve Limitless. Using these fields I re-oriented 76 of 356 (39 same, 37 inverse) and evaluated 75 pairs: 2 gross-positive, 1 net-positive (a false link, India-Zimbabwe vs Afghanistan-Zimbabwe); the correctly oriented identical pairs show -200 to -440 bps. Conclusion unchanged, coverage claim wrong. [H]
3. **CORRECTED - "485 of 868 link pairs are net-positive" counts link pairs, not opportunities.** The fresh 476 net-positive pairs involve only 293 distinct markets (187 Kalshi); one Limitless market (Raphinha Golden Boot) sits in 30 net-positive pairs, others in 25-26, because the linker is many-to-many. [H]
4. **CORRECTED (scope) - Polymarket-involved cross-venue links are almost unevaluated; the headline verdict does not say so.** Fresh snapshot: only 150 of 2,863 PM-involved link records (5.2%) have non-empty books on both sides (sim>=0.85: 10 of 165; declared mirrors: 64 of 504), versus 133 of 134 for non-PM links at >=0.85. The "true link" census is therefore mostly Kalshi/Limitless. Extension test: for the 94 PM-Kalshi links (sim>=0.65, orientation resolved) with a listing-level gross edge and no books, I fetched books for the top 35 (30 CLOB + 35 Kalshi GETs): 61 pairs evaluated, 41 net-positive, and the top 20 are all false links or definition differences (ballot access vs win; Hormuz traffic with different dates/thresholds; Maduro "pardon" vs "leader"; GTA VI Best Narrative vs Game of the Year; "hottest year": PM = rank 1 on the GISS table vs Kalshi = above 2025 AND above 1.28 C, 748 bps on USD 563; Exponent token: PM "governance token" vs Kalshi any token with a liquidity pool, 1,014 bps on USD 178). The thesis is supported, but the other ~2,700 PM-involved link records and about 177 of the 201 PM negRisk sets with a listing bid-sum >= 0.985 (24 got books; `listing_sum_bid_ge_0.985` in `final_summary.json`) were never priced. [H]
5. **CORRECTED - "Fuzzy title linking is not a detector" (section 0 item 10) over-generalises.** Recall 13-56% and precision 18-72% are properties of this tf-idf + SequenceMatcher blend. The declared-mirror misses are structurally easy (e.g. "Will Borussia Moenchengladbach be the 2026-27 Bundesliga champion?" vs "Bundesliga: 2027 Champion Borussia Moenchengladbach"; "Will Villarreal CF win on 2026-10-20?" vs "UCL, Liverpool vs Villarreal Villarreal") and would be recovered by a parse-to-(event, outcome) matcher. Say "this linker", not "title linking". [H]
6. **CORRECTED - label policy applied inconsistently; strict precision and "13 identical" are slightly overstated.** Blind re-label of 16 audit pairs from the rules text (ids 6, 10, 15, 16, 30, 35, 37, 44, 48, 50, 57, 58, 69, 74, 76, 77): 15 of 16 agree. The one disagreement (id 48, Kalshi Serie A champion Juventus vs Limitless): Limitless adds "cancelled or postponed after May 28, 2027 -> Other" and early-NO on elimination, Kalshi is silent, so by the note's own Dm policy (documented cancel/postponement difference) it is Dm, not I. The same clause is on Limitless Europa League/Serie A pages (census rows Juventus Europa League, Roma Serie A) and PM Ballon d'Or has "no winner by Dec 31 -> Other" (Yamal row). Counting those as Dm gives about 9-10 identical rather than 13 of 17 true links and a 0.85-0.95 stratum strict precision of about 50% rather than 60%. The funnel result (0 survive) is unchanged. Single rater remains a limitation. [H]
7. **UNVERIFIABLE / fee-schedule sensitivity - the "clean" true links sit inside fee uncertainty.** (a) Gamma `feeSchedule` gives rate 0.03 to 4,689 of 13,097 PM markets (`sports_fees_v2`, `sports_fees_nfl_cfb_oct26`) while the current docs table (https://docs.polymarket.com/trading/fees) lists Sports 0.05; the study used the per-market value (reasonable) but the Yamal pair then nets USD 18.95 and would net about USD 2.9 at 0.05 (PM fee 24.15 -> 40.25). (b) Limitless says buy fees are "paid in outcome tokens" with no closed form (https://docs.limitless.exchange/user-guide/fees.md); if the 3% applies to contracts rather than notional the Rubio row (1,000 contracts at 0.14) pays about USD 30 instead of USD 4.2 and its USD 15.9 net becomes negative. The note already calls the Limitless model an approximation; it should also say the 5-164 bps true-link edges are within this uncertainty. Direction of all fee errors found makes arbitrage rarer, not more common. [H for the facts, edge impact computed by me]
8. **UNVERIFIABLE - historical items I could not re-run within the request cap.** Time-skewed mirror result 15/25 and the "fake bid sum 1.06" (CLOB budget exhausted; the b2b result supports the explanation); the 18:21-18:43 timings; the exact 6,937 count (components sum correctly: 378+5,851+411+297). The summary phrase "0 net-positive in ~2,900 sets/pairs/books" is not derivable from the note (706 + 379 + 1,849 = 2,934 is one reading); treat as approximate.
9. **MINOR numeric inconsistency.** Audit-stratum populations (415/221/84 = 854) differ from the evaluated-pair bins (413/218/83) by 6 pairs and exclude the 20 declared-mirror pairs; immaterial.

### V3. Code audit (analyze.py, common.py, screen.py, universe.py, ladders.py, linking.py, finalize.py, fee_sensitivity.py)

Checked and found correct: executable prices only (no last price, mid or Gamma `outcomePrices`); Kalshi YES ask = 1 - best NO bid with sizes carried over, NO ask = 1 - YES bid, `*_dollars` units, Polymarket best-last / XO best-first sorting, Limitless size/1e6 (docs: single YES-side book, price not scaled), `oriented()` flip swaps and complements both sides, PM `pm_side` flip, NO leg = 1 - bid on every venue; ME sell payoff n-1 (valid for any at-most-one set, subset-safe) and ME buy payoff 1 only when exhaustive (PM flags; Kalshi unknown); ladder direction (monotone polarity; a polarity bug would have produced thousands of violations, observed 12 in 278k); cross-venue payoff 1 only for identical contracts, and the Comey calendar-spread "edge" is correctly excluded (the profitable direction, Kalshi NO "before Jul 2027" + Limitless YES "before Jan 2027", pays 0 in the Jan-Jul window; the opposite direction is -USD 76). Fee models match the docs: Kalshi coefficient 0.07 is derived (not stated) from the doc's own example 0.00363825 = 0.07 x 0.055 x 0.945 and the order-level accumulator/rebate is conservative; Polymarket `fee = C x feeRate x p x (1-p)` (docs: "Taker fees are calculated in USDC", no exponent term; all live exponents are 1); XO example USD 2.00; Limitless table matches code.

Bugs / gaps found:
- **Fixed (small):** `linking.py` H2H regex matched `\bat\b` inside "at least/at most", so two "win at least N games" markets were both flagged head-to-head and dropped as orientation `unknown`. I changed it to `\bat\b(?!\s+(?:least|most)\b)` (line 258, commented). Impact on saved results: 1 of 356 orientation-unknown links with books; the saved fixtures were generated before this fix. 29/29 unit tests still pass.
- Not fixed, documented: the `book_untouched_6h` flag is dead code in practice (V2.1); `fee_polymarket` returns 0 when `feesEnabled` is true but `feeSchedule.rate` is missing (2 markets in the fresh listing); `orientation()` returns `same` whenever only one side looks head-to-head (relies on the text score); the study ignores taker delays (XO holds marketable orders 500 ms, 3 s on in-play sports, https://docs.xo.market/guides/order-types; Limitless listing shows `settings.takerDelayMs` 1250), which matters for any multi-leg cross-venue execution; Kalshi ME events are `MECNET` and threshold events can be `DIRECNET` collateral-return netting, so capital for those sets is overstated (net edge unaffected).

### V4. NOT FOUND items re-searched with different keywords

- Kalshi exhaustiveness flag: **confirmed absent.** The Kalshi get-events doc states `mutually_exclusive` is true when `collateral_return_type` is `MECNET` and means "at most one market in this event can resolve to yes"; "No field states whether an event's outcomes are exhaustive" (https://docs.kalshi.com/api-reference/events/get-events.md). Fresh listing event keys: category, collateral_return_type, event_ticker, exchange_index, last_updated_ts, markets, mutually_exclusive, product_metadata, series_ticker, settlement_sources, strike_date, strike_period, sub_title, title.
- Kalshi anonymous rate limit: **stands.** The rate-limits page documents authenticated token tiers only (Basic 200 read tokens/s, about 20 default reads/s); nothing for unauthenticated calls (https://docs.kalshi.com/getting_started/rate_limits.md).
- Limitless closed-form fee: **stands.** "The curve is not published as a closed-form formula"; read `effectiveFeeBps`/`usdFee`/`contractsFee` from execution responses. Buy fees paid in outcome tokens, sell fees in USDC.
- Polymarket public batch book GET: **stands.** GET `/books`, `/prices`, `/midpoints` with `token_ids` all returned 400 `Invalid payload` (3 probes, 2026-10-18 19:09Z); the docs index lists no GET batch.
- PM<->Kalshi / Kalshi<->XO declared-link reference: **stands for venue-declared links**, but third-party matched-market services exist and could serve as an independent (unaudited) reference set: Prediction Hunt v2 matching endpoint, pmxt `find_same_market`, matchwire, an Apify matched-markets actor (web search 2026-10-19, vendor claims only).
- Limitless head-to-head subject field: **REFUTED** (V2.2).

### V5. Confirmed without change

ME sell-side "0 net-positive" and fee dominance; complement/mirror result (NO book is an exact mirror; XO docs say its engine matches Complementary, MINT and MERGE, so a mirror is expected); 0 crossed books; ladders (one real but economically trivial Kalshi date-ladder inversion, 74 bps over 4.2 years); cross-venue false-link dominance (all 6 funnel survivors are false by title alone: OpenAI vs Anthropic IPO, EPL/La Liga vs Champions League golden boot, ballot vs win, Comey Jan vs Jul); verified-true edges 5-246 bps, thin and long-dated; request counts and absence of 429s; Kalshi series fee table; Polymarket/Kalshi/Limitless unit conventions; recall numbers.

### V6. Missed findings (for the aggregation design)

- Cross-venue **ladders and exhaustive sets** were never evaluated (only identical-contract pairs): e.g. Kalshi "Maintain" + the Limitless Bank of Korea brackets form a partition, and date/threshold pairs across venues obey the same monotonicity as within-venue ladders; the Comey pair shows the code can already tell the valid direction.
- Taker delays (XO 0.5-3 s, Limitless 1.25 s) and per-venue collateral netting (Kalshi MECNET/DIRECNET) are execution constraints the study does not model.
- Limitless exposes `metadata.externalProvider/externalSlug/polymarketSeriesId/isPolyArbitrage` and, for sports, `externalSlug` in Polymarket sports-slug form (e.g. `crint-pak-lka-2026-10-18`), which is a second native-id source beyond the 496 mirrors used.
