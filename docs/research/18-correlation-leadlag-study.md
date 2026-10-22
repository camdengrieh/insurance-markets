# 18. Correlation and lead-lag study of related prediction markets

Task `correlation-leadlag-study`. Hands-on statistical study, run 2026-10-19 (session date). All price series were cut at one snapshot time, **T0 = 2026-10-18 18:10:00 UTC** (epoch 1792347000); the venue clocks read 2026-10-18 18:10 to 18:45 UTC while I worked. Read-only: public unauthenticated GETs only, throttled (>= 0.3 s between calls per host, backoff on 429/5xx, hard cap 600 requests per host). No account, key, wallet or signature was used, no PayBox tool was called, no third-party code was cloned or executed, no HTTP 402 was met. Third-party responses were parsed as JSON data only. Every number below comes from my own stdlib-only Python 3 scripts (`docs/research/fixtures/linking/correlation/scripts/`, run with `python3 -I`).

Confidence tags: **H** = measured first-hand this session on public data (script and file cited) or read in a primary source; **M** = secondary or inferred; **L** = weak or stale. "NOT FOUND (searched: ...)" marks a documented absence. All venue facts are from 2026 sources; nothing older than 6 months is relied on, except where flagged.

Companion docs read and built on (not edited): `docs/plan.md`, `02-xo-read-api.md`, `08-venues-polymarket-kalshi.md`, `09-venues-onchain-clob.md`, `15-relationship-taxonomy-literature.md`, `16-linking-methods-services.md` and its fixtures `fixtures/linking/*`. Their within-venue scan (doc 16: about 64,000 Kalshi ladder pairs and 1,692 Polymarket touch-ladder pairs with essentially no net-positive violation) agrees with section 2.7 of this study.

---

## 0. Bottom line

**Question.** Is there a viable latency or statistical edge beyond pure arbitrage, at what horizon, and which relationship types carry it?

**Answer. No taker-side edge survived frictions in any of the 41 relationships or at any horizon from 1 minute to 84 days.** The signals that exist are real but 10 to 100 times smaller than the round-trip cost of two venues, and they are best used as inputs to a pricing/alerting layer, not as trades.

1. **Panel (H).** 41 relationships built from 50 legs (31 Polymarket YES tokens, 19 Kalshi YES markets): 11 live same-event Polymarket-Kalshi pairs plus 2 resolved same-event controls, 12 ladder pairs (10 live, 2 resolved), 7 implication pairs, 3 sum identities, 6 correlated-factor pairs. Added: 3 Limitless-vs-Polymarket mirror rungs and an XO same-instant snapshot. Samples: 2,016 hourly bins (84 days), 16,416 5-minute bins (57 days, Polymarket) or 8,640 (30 days, anything with Kalshi), 9,900 1-minute bins (6.9 days).
2. **Quotes barely move (H).** The mid changes in only 3.8% (median of 31 Polymarket legs) and 2.1% (median of 17 live Kalshi legs) of 5-minute bins; the range is 0.02% to 21%. A leg has a median of 408 changes in the 57-day window (quartiles 151 and 647, range 4 to 2,532). Return statistics are therefore driven by a few hundred jumps per leg, not by a dense process (section 2.2).
3. **Co-movement appears with horizon, the Epps effect (H).** Same-event Fed pair: rho 0.75 (5 min), 0.85 (1 h), 0.97 (1 day). Senate pair: 0.00, 0.10, 0.54. BTC vs ETH rungs: 0.06, 0.24, 0.78. The long-dated 2028 pairs are 0.00 hourly and 0.06 to 0.30 daily. Median hourly rho by type: ladders 0.35, identities 0.22, same-event 0.09, factor -0.04, implication 0.00 (section 2.3).
4. **Cross-venue lead-lag on the same event is below the data resolution (H).** Only the Fed-decision pairs have enough 1-minute events (225 to 309 per week). Their contemporaneous rho is 0.57 to 0.77 and the lead-lag asymmetry CIs include zero at 1 min, 5 min and 1 h. The Polymarket 5-minute bucket value equals the 1-minute value at its label time in 100% of 3,398 informative buckets, so the alignment is pinned to the minute and a lead longer than about 1 minute (1-minute grid) or 5 minutes (5-minute grid) would have shown (section 1.3, 2.4).
5. **Lead-lag that does exist (H, small).** (a) Polymarket moves first on the crypto basis pair BTC "reach $100k in 2026" vs Kalshi "above $99,999.99": 5-min asymmetry 0.17, CI [0.07, 0.26], BH-significant; hourly rho(0) 0.31 and rho(+1 h) 0.16 (CI [0.10, 0.21]), so about half of the co-movement reaches Kalshi an hour later. (b) Inside ladders the rung nearer the money leads the farther one (Polymarket BTC $90k to $100k: 0.19, CI [0.03, 0.35] hourly). (c) Event-based test: for the Fed +25bp pair, Polymarket moves are followed by a same-sign Kalshi move within 1 h in 74% of cases and preceded in 61% (p = 0.001, the only BH-significant event test of 112).
6. **The lead-lag is not tradeable (H).** Following a leader's move for one bin in the follower, paying the follower's spread and two taker fees: 273 directed rule variants with n >= 30, **2 positive net, both on resolved Iran date rungs whose assumed spread is the post-resolution book (0.05-cent half-spread) and whose category is fee-free (a cost-model artifact)**; 17 variants have gross t > 3 and none of those has positive net. Among the 17, the largest mean gross edges are +0.17 cent (t = 4.75, Polymarket BTC $90k to $100k, hourly) and +0.68 cent (t = 3.82, Polymarket BTC $100k leading Kalshi, hourly, 2-cent trigger), against a cost of about 3.4 to 4 cents per round trip (section 2.9).
7. **Same-event spreads (H).** Two regimes. Fed-decision pairs: mean about 0, sd 1.3 to 1.5 cents, hourly AR(1) half-life 6.0 to 8.5 h (1.4 to 1.5 h on the 5-minute grid), gap exceeds entry fees in 6% to 12% of hours and exceeds all round-trip costs in 0%. Seven political and long-dated pairs: persistent basis of +0.9 to +5.0 cents (Polymarket above Kalshi), hourly half-life 19 to 69 h, DF t-stat -3.2 to -6.0; rule differences explain part of it (doc 08, headline 7). The BTC basis pair sits the other way (-2.5 cents, half-life 8.9 h) and OKC West is about 0 with half-life 103 h (unit root not rejected).
8. **Edge attrition (H, with stated assumptions).** Dollar-weighted share of the apparent mid-gap that survives, mean over 13 same-event pairs (median): spread 50.6% (59.2%); taker fees 9.3% (3.9%); a 5% annualised hurdle 3.0% (0.1%); a 20% hurdle 0.0% (0.0%); a close-out (convergence) trade 0.3% (0.0%). The apparent edge is largest on the 2028 pairs (up to 5 cents) but the capital is locked about 724 to 793 days, so even the best hour yields at most 2.5% annualised (section 2.6).
9. **Logical pairs (H, mid prices, NOT executable).** Of 19 strict constraints (child <= parent), 17 are never violated by more than 1 cent in any hour; two show a violation in 0.3% and 0.14% of hours (3 h and 1 h runs) that disappear on the 5-minute grid or are creation artifacts. Typical slack is 3.5 to 28 cents. Sum identities (parent = sum of children) deviate by more than 1 cent in 27% to 60% of hours for days at a time, but that is rule/composition basis: the T0 book gives -2.2 and -0.8 cents executable. One intra-Kalshi identity (rate above 4.00% vs hike 25 + hike more than 25) shows 42 of 8,640 5-minute bins (0.49%) with positive edge after fees, up to 5.5 cents, from wide parent quotes; depth is unknown (section 2.7).
10. **Hedging (H, out-of-sample).** Residual-variance reduction on a chronological 60/40 split: ladders 7% (1 h) and 54% (1 day) median; Fed pair 4% to 38% (1 h) and 97% (1 day); BTC vs ETH 7.5% and 34.5%; BTC vs rates and politics vs rates about 0% to 1%. A hedge only helps at the daily horizon, where its benefit is variance, not profit (section 2.8).
11. **Survivorship and look-ahead (H).** The panel is chosen on current liquidity, which flatters efficiency. Four resolved (non-survivor) controls give the same answers: Fed September pairs hourly rho 0.78, half-life 4.5 h, 0.2% to 1.2% of the gap surviving fees; resolved Iran date rungs show zero violations (slack 3.5 to 4.1 cents). Hedge ratios are fitted on the first 60% and scored on the last 40%; the pairs back-test uses only trailing data (section 3).
12. **Types that carry something.** Ladders (nearer rung leads, daily hedge works, constraint never binds), crypto-spot-driven pairs (Polymarket leads Kalshi by up to an hour), the Fed-decision same-event pair (tight, efficient, 0.4% to 0.9% of hours net positive). Implication pairs and cross-topic factor pairs carry nothing measurable intraday.

**What this means for the build.** Treat statistical relationships as signal and risk features, not as an execution engine: hourly polling is enough for correlation/basis signals; 1 to 5 minute polling only to flag a leader move on crypto-linked markets; always show spread, fee, depth and capital-lock-adjusted returns next to any gap; keep your own history because Polymarket keeps 1-minute data only about 7 days (section 4).

---

## 1. Data, panel and methods

### 1.1 Endpoints, units, granularity, retention

| Venue | Endpoint (public, no key) | Unit and granularity | Retention and limits | Source |
|---|---|---|---|---|
| Polymarket | `GET https://data-api.polymarket.com/v2/prices-history?token_id=&start=&end=&bucket_seconds=&limit=&cursor=` | price 0..1 JSON number; bucket-start timestamps; per-point `resolution_seconds`; 60 to 86,400 s buckets | "1-minute data at least 7 days, 5-minute at least 60, 30-minute at least 90"; explicit `start`/`end` windows capped at 15 days; page size <= 10,000. Resolved markets get a clamped payout point at the end of each window (artifact, dropped) | `https://data-api.polymarket.com/v2/openapi.json` (H) |
| Polymarket | `GET https://data-api.polymarket.com/v2/trades?condition=&limit=` | taker fills; block timestamp (seconds) | newest first, keyset cursor | same OpenAPI (H) |
| Kalshi | `GET https://external-api.kalshi.com/trade-api/v2/series/{s}/markets/{t}/candlesticks?start_ts=&end_ts=&period_interval=1\|60\|1440` | OHLC of `price` (trades), `yes_bid`, `yes_ask`; `end_period_ts` = "the inclusive end of the candlestick period"; `volume_fp` | at most **5,000 candles per request** (HTTP 400 "max candlesticks: 5000"), so 3.4 days of 1-minute data per call; 1-minute data served back at least 85 days; candles exist only for minutes with activity (1,966 of 4,320 minutes in 3 days for CONTROLS-2026-D) | `docs.kalshi.com/api-reference/market/get-market-candlesticks.md` and probes (H) |
| Kalshi | `GET .../events?status=open&with_nested_markets=true`, `GET .../events/{ticker}` | market discovery | cursor pagination (13,319 open events crawled in 67 requests) | probes (H) |
| XO | `GET https://orderbooks.xo.market/prices-history?token_id=&interval=&fidelity=` (documented `t` unix seconds, `p` string) | irregular trade ticks | **not a usable time series** (section 2.10) | `docs.xo.market/api-reference/market-data/get-price-history` via xo-docs MCP, and probes (H) |
| Limitless | `GET https://api.limitless.exchange/markets/{slug}/historical-price?interval=5m\|1h\|6h\|1d\|1w\|1m\|all` | about 30-minute points over the market life, ms timestamps | whole life (6.6 days for the ETH weekly market); labels are one 30-minute bin early relative to Polymarket (section 2.10) | `https://api.limitless.exchange/api-json` and probes (H) |

Requests used (my per-host counters, cap 600): data-api.polymarket.com 243, external-api.kalshi.com 270, gamma-api.polymarket.com 13, clob.polymarket.com 2, orderbooks.xo.market 37, api-mainnet.xo.market 12, api.limitless.exchange 22 (plus a handful of `curl` doc fetches from docs.kalshi.com and docs.polymarket.com).

### 1.2 Panel construction and selection bias

* **Discovery.** Polymarket Gamma `events/keyset` ordered by 24 h volume (1,200 events) and the full Kalshi open-events list (13,319 events), both snapshotted 2026-10-18 about 18:00 UTC. Pairs were then chosen **by hand to cover the four relationship types**, favouring liquid, long-lived markets (>= 30 days of history), and requiring a counterpart on the other venue for same-event pairs. XO has no usable history (2.10); Limitless is covered only through its Polymarket mirrors.
* **Selection is on current liquidity, which is look-ahead.** Surviving, still-liquid markets are likely to be more efficient than the average listed market. Four resolved controls (`XR1`, `XR2`, `LR1`, `LR2`) test this and agree (section 3). Near-the-money ladder rungs were picked with hindsight about where BTC is now; I did not test far-out-of-the-money rungs.
* **"Same event" is not "same contract".** The Senate pair has different rule text (VP tie-break, independents, early call; doc 08 headline 7). `X11` (BTC $100k) compares Polymarket "reach" (Binance 1-minute high) with Kalshi "above $99,999.99 by Dec 31" (different source and clock); I label it a basis pair. I did not read the full rules of the other pairs.
* **Equivalence and direction.** All legs are YES-equivalent; same-event spread is Polymarket mid minus Kalshi mid.

Panel (T1): `x` is the first leg listed, `y` the second; for parent/child and ladder rows the parent (or nearer rung) is `x`.

| id | type | x (first leg) | y (second leg) | venues | note |
|---|---|---|---|---|---|
| X01_senate_D | same-event | PM_SEN_D | K_SEN_D | K+PM | Senate control, Democratic. Rule text differs (VP tiebreak / independents / early call) - see 08-venues notes |
| X02_house_D | same-event | PM_HOU_D | K_HOU_D | K+PM | House control, Democratic |
| X03_fed_oct_hold | same-event | PM_FED_H0 | K_FED_H0 | K+PM | FOMC Oct 2026, no change |
| X04_fed_oct_hike25 | same-event | PM_FED_H25 | K_FED_H25 | K+PM | FOMC Oct 2026, +25bp |
| X05_bop_dem_sweep | same-event | PM_BOP_DD | K_BOP_DD | K+PM | Balance of power: Democrats sweep |
| X06_tx_senate_D | same-event | PM_TX_D | K_TX_D | K+PM | Texas Senate race, Democratic nominee wins |
| X07_vance_nominee | same-event | PM_VANCE_NOM | K_VANCE_NOM | K+PM | Vance GOP 2028 nomination |
| X08_newsom_nominee | same-event | PM_NEWSOM_NOM | K_NEWSOM_NOM | K+PM | Newsom Dem 2028 nomination |
| X09_vance_winner | same-event | PM_VANCE_WIN | K_VANCE_WIN | K+PM | Vance wins 2028 presidency |
| X10_okc_west | same-event | PM_NBA_OKC_W | K_NBA_OKC_W | K+PM | OKC wins 2027 West title (thin on PM) |
| X11_btc_100k_2026 | same-event | PM_BTC_100K | K_BTC_100K | K+PM | BTC reaches $100k in 2026. NOT the same contract: PM = Binance 1m high 'reach', Kalshi = max-in-year rule; treat as basis pair |
| XR1_fed_sep_hike25_resolved | same-event | PM_FEDSEP_H25 | K_FEDSEP_H25 | K+PM | RESOLVED control: FOMC Sep 2026 +25bp (resolved YES on both venues) |
| XR2_fed_sep_hold_resolved | same-event | PM_FEDSEP_H0 | K_FEDSEP_H0 | K+PM | RESOLVED control: FOMC Sep 2026 no change (resolved NO) |
| L01_pm_btc_100_110 | ladder | PM_BTC_100K | PM_BTC_110K | PM | P(reach 110k) <= P(reach 100k) |
| L02_pm_btc_110_120 | ladder | PM_BTC_110K | PM_BTC_120K | PM | P(reach 120k) <= P(reach 110k) |
| L03_pm_btc_90_100 | ladder | PM_BTC_90K | PM_BTC_100K | PM | P(reach 100k) <= P(reach 90k) |
| L04_k_btc_100_110 | ladder | K_BTC_100K | K_BTC_110K | K | Kalshi max-BTC-2026 rungs |
| L05_k_btc_110_120 | ladder | K_BTC_110K | K_BTC_120K | K | Kalshi max-BTC-2026 rungs |
| L06_pm_iran_oct31_nov15 | ladder | PM_IRAN_OCT31 | PM_IRAN_NOV15 | PM | ceasefire through later date <= earlier date |
| L07_pm_iran_nov15_nov30 | ladder | PM_IRAN_NOV15 | PM_IRAN_NOV30 | PM | date ladder |
| L08_pm_iran_nov30_dec31 | ladder | PM_IRAN_NOV30 | PM_IRAN_DEC31 | PM | date ladder |
| L09_pm_iran_oct22_oct31 | ladder | PM_IRAN_OCT22 | PM_IRAN_OCT31 | PM | date ladder |
| L10_pm_wti_105_110 | ladder | PM_WTI_H105 | PM_WTI_H110 | PM | WTI HIGH hit ladder, October |
| LR1_iran_oct9_oct12_resolved | ladder | PM_IRAN_OCT9 | PM_IRAN_OCT12 | PM | RESOLVED control: ceasefire date ladder (both resolved YES), analysed until 1 day before the earlier rung resolves |
| LR2_iran_oct12_oct15_resolved | ladder | PM_IRAN_OCT12 | PM_IRAN_OCT15 | PM | RESOLVED control: ceasefire date ladder |
| P01_pm_vance_win_le_nom | parent/child | PM_VANCE_NOM | PM_VANCE_WIN | PM | win presidency => nominee (ignores independent runs) |
| P02_pm_newsom_win_le_nom | parent/child | PM_NEWSOM_NOM | PM_NEWSOM_WIN | PM | win presidency => nominee |
| P03_k_vance_win_le_nom | parent/child | K_VANCE_NOM | K_VANCE_WIN | K | Kalshi version |
| P04_k_newsom_win_le_nom | parent/child | K_NEWSOM_NOM | K_NEWSOM_WIN | K | Kalshi version |
| P05_pm_okc_champ_le_west | parent/child | PM_NBA_OKC_W | PM_NBA_OKC_CH | PM | NBA champion => conference champion (PM, thin West market) |
| P06_xv_pm_vance_win_le_k_nom | parent/child | K_VANCE_NOM | PM_VANCE_WIN | K+PM | cross-venue implication |
| P07_xv_k_vance_win_le_pm_nom | parent/child | PM_VANCE_NOM | K_VANCE_WIN | K+PM | cross-venue implication |
| I01_pm_senateD_identity | identity | PM_SEN_D | PM_BOP_DD+PM_BOP_DSRH | PM | P(D Senate) = P(D sweep) + P(D Senate, R House) |
| I02_k_senateD_identity | identity | K_SEN_D | K_BOP_DD+K_BOP_RD | K | Kalshi: D Senate = DD + 'R-House, D-Senate' |
| I03_k_fed_hike_identity | identity | K_FED_T400 | K_FED_H25+K_FED_H26 | K | 'rate > 4.00% after Oct' = hike 25 + hike >25 (assuming upper bound is 4.00% now) |
| F01_btc100k_vs_fed_hike25 | factor | PM_BTC_100K | PM_FED_H25 | PM | crypto level vs rates (both PM) |
| F02_btc100k_vs_eth3500 | factor | PM_BTC_100K | PM_ETH_3500 | PM | crypto vs crypto (both PM) |
| F03_iran_oct31_vs_wti110 | factor | PM_IRAN_OCT31 | PM_WTI_H110 | PM | geopolitics vs oil (both PM) |
| F04_senateD_vs_fed_hike25 | factor | PM_SEN_D | PM_FED_H25 | PM | politics vs rates (both PM) |
| F05_k_btc100k_vs_k_fed_hike25 | factor | K_BTC_100K | K_FED_H25 | K | crypto vs rates (both Kalshi) |
| F06_pm_btc100k_vs_k_fed_hike25 | factor | PM_BTC_100K | K_FED_H25 | K+PM | cross-venue factor pair |

### 1.3 What the series are, and how they are aligned

* **Polymarket history value = book mid, known at its label time (H).** The spec says "A raw tick reports the tick; an aggregate reports its bucket start." Calibration against 535 taker trades on the Fed +25bp YES token (script `calib_pm_alignment.py`, file `calib_pm_PM_FED_H25.json`): a taker BUY executes at the ask, a SELL at the bid, so with a one-tick spread the implied mid is price -/+ 0.5 cent. Mean absolute residual between that implied mid and the 1-minute bucket at offset k from the trade's minute: k=-2 0.00438, k=-1 0.00295, **k=0 0.00174**, k=+1 0.00247, k=+2 0.00343, k=+3 0.00397. The series is the mid, and bucket b describes the book for trades inside [b, b+60 s). Second check (`check_pm_tier_consistency.py`): the 5-minute bucket value labelled t equals the 1-minute value labelled t in **3,398 of 3,398 informative buckets (100%)**, vs 62% at t+1 min, 16% at t+4 min and 80% at t-1 min. So the label time is the observation time: alignment convention **alpha = 0** (value known at its label) is the primary one; the conservative alternative alpha = 1 (known one bucket later) is reported as a sensitivity only, and is shown to be wrong by this check.
* **Kalshi (H).** `mid = (yes_bid_close + yes_ask_close)/2` of each candle, known at `end_period_ts`. Between candles the last bid/ask is carried forward; this is safe because LOCF of the 1-minute candle bid/ask equals the 60-minute candle bid/ask close in **11,454 of 11,454 hourly comparisons (17 legs, 100% for bid and ask)** (`check_kalshi_locf.py`), i.e. sparse 1-minute candles do not miss quote updates.
* **Cross-venue alignment.** Polymarket bucket label t is paired with the Kalshi candle that ends at t (both ~ state at instant t).
* **Not documented (NOT FOUND, searched: OpenAPI text of `/v2/prices-history`, docs index):** the aggregation function inside a Polymarket bucket beyond the tier-subsampling evidence above; any historical Polymarket bid/ask; Kalshi candle semantics when only a quote (no trade) changes (covered indirectly by the LOCF check).

### 1.4 Statistical methods

* **Grids and gaps.** Hourly (84 days; Polymarket 30-minute tier for days 85-58 and 5-minute tier after; Kalshi 60-minute candles), 5-minute (57 days Polymarket-only; 30 days when a Kalshi leg is present), 1-minute (6.9 days), daily (hourly grid at 00:00 UTC, 83 points). A value at grid time g is the last observation known at or before g (no look-ahead). The first 6 hours after a leg's first observation are dropped (price-discovery burn-in). **Non-trading gaps:** a quote that does not change gives a zero return; I do not drop zero bins for the headline numbers, but also report the share of bins with a change and a "joint-active" correlation (bins where either leg moved; biased upward by construction).
* **Returns and bid-ask bounce.** First differences of **mid** prices in probability points, not trade prices, so there is no trade-price bounce by construction. Residual quote flicker is measured: lag-1 autocorrelation of 5-minute mid changes has median -0.059 on Kalshi legs against -0.114 for last-trade-price changes (17 legs), i.e. bounce is roughly halved by using mids (T9). I also give 10-minute non-overlapping correlations.
* **Correlation CIs.** Moving-block bootstrap on paired changes (24-bin blocks for the 5-minute and hourly series, 12 for the 10-minute, 5 for daily; 300 resamples).
* **Lead-lag (CCF).** `rho(k) = corr(x_t, y_{t+k})`, k in -K..K (K = 10 at 1 min, 6 at 5 min and 1 h). Asymmetry `LAM = sgn * sum_{k=1..K} [rho(k) - rho(-k)]` with sgn the sign of the total cross-correlation, so **LAM > 0 means the first-listed leg x leads y**; 95% CI by fixed-block bootstrap (2 h blocks at 1 and 5 min, 1 day at 1 h; 400 resamples) and a circular-shift permutation test (1,000 shifts; preserves each series' autocorrelation). Reported in minutes: 1 bin = 1, 5 or 60 minutes. Because every table has many tests, **Benjamini-Hochberg at q = 0.10 is applied over the whole family** (90 CCF tests, 112 event tests).
* **Event-response lead-lag (sparse quotes).** For each leg-x change of sign s, does leg y change with the same sign in the next W bins ("followed") or in the previous W bins ("preceded")? `S = (F_xy - P_xy) - (F_yx - P_yx)`, S > 0 means x leads; circular-shift null with 1,500 shifts. W = 5 and 30 bins at 1 min, 3 and 12 bins at 5 min.
* **Same-event spread.** Mean, sd, 5-95% range, AR(1) with intercept (`phi`, OLS interval; the block bootstrap of AR(1) is biased near a unit root so it is not used), half-life `-ln2 / ln(phi) * step`, Dickey-Fuller t (critical about -2.86), and fractions of hours with `|gap|` above entry fees, 2x fees, and all round-trip costs.
* **Frictions.** Executable edge per hour: buy YES on the cheaper venue at its ask and buy NO on the other (= sell YES at its bid): `e = bid_other - ask_cheap`. Kalshi bid/ask from candle closes; **Polymarket historic bid/ask is not published, so I use mid +/- the T0 snapshot half-spread (0.5 to 0.6 cent) as a constant (assumption)**. Taker fees: Polymarket `feeSchedule.rate * p(1-p)` per market (0.03 to 0.07 here, H from Gamma); Kalshi `0.07 * p(1-p)` (coefficient M, secondary sources; doc 08 4.10). Hold to resolution: entry fees only; capital = cost of both legs (about 1 - e); annualised `(1 + net/capital)^(365/days) - 1` with the actual days to resolution at each hour. The close-out (convergence) trade crosses both spreads again and pays four fees. Hurdles: 0, 5%, 20% per year.
* **Logical pairs.** Violation = `mid(child) - mid(parent) > 0` (ladders, implications) or `|sum(children) - parent|` (identities), on mids; run lengths of consecutive violating bins; cost-aware survival with T0 half-spreads and fees; a one-shot executable check on the T0 book. **All of these are labelled NOT executable.**
* **Hedge.** OLS of y on x (differences). In-sample beta, then beta fitted on the first 60% and variance reduction measured on the last 40%.
* **Lead-lag economics.** Fixed rule, no fitting: if the leader moved by at least theta (0.5, 1, 2 cents) in the last bin and the follower has not already moved as much, trade the follower in that direction at its ask/bid at the close of the bin, exit at the opposite quote one bin later; pay both spreads and two taker fees. All 456 rows (pair x direction x grid x theta) are reported; hold-out = last 40%.
* **Pairs back-test.** Hourly spread, z-score against the trailing 168 hours only, enter at |z| > 2, exit at |z| < 0.5 or after 48 h, cost = spreads plus four fees.

### 1.5 Unit tests on synthetic data (adversarial self-check)

`selftest.py` runs 25 tests on simulated data with known answers; all pass (`selftest_results.json`). Highlights: a planted lead of 3 bins is recovered (peak lag 3, rho(3) = 0.865, CI [0.850, 0.879], swapping series flips the sign, an extra delay moves the peak by exactly one bin, the permutation test p = 0.005); under independence the 95% bootstrap CI excludes zero in 2 of 60 trials and the permutation test rejects in 2 of 60; volatility-clustered independent series give 2 of 40 false positives; a negatively related pair (y = -x lagged) is handled by the sign-aware statistic; locf never uses an observation before it is known; an Ornstein-Uhlenbeck spread with phi = 0.90 gives phi_hat 0.891 and a half-life 6.0 h vs 6.6 h true, and the Dickey-Fuller test rejects the unit root for it (t = -13.1) but rejects 0 of 50 random walks; OOS variance reduction 0.502 vs 0.50 true; the event-response statistic recovers a planted lead (S = 1.34, p = 0.005), flips sign when swapped, and has 2 of 30 false positives. **Test T7 shows a real bias worth remembering**: a venue that merely quotes faster (the other sees the same news 0 to 3 bins late) looks like a "leader" with LAM = 0.76, CI [0.71, 0.82]. "Leads" below are therefore speed of quote incorporation, not information.

---

## 2. Results

Full tables (all 41 relationships) are in `fixtures/linking/correlation/tables.md`; per-relationship JSON in `fixtures/linking/correlation/results/`.

### 2.1 Sample sizes

Hourly differences: 2,015 for most relationships (84 days); shorter for young markets: Iran Oct 22 rung 93, Oct 31 rung 93 in L09 and 399 in L06/L07, Nov 30 / Dec 31 rungs 706, WTI October rungs 546, Kalshi Fed identity 761 (restricted to after 2026-09-17), resolved controls 99 to 1,247. Daily differences: 83 for 33 relationships (the rest have fewer than 30 days of overlap and are not reported). Five-minute differences: 16,415 (Polymarket only) or 8,639 (any Kalshi leg); 1-minute: 9,899 in 6.9 days. The count that matters for statistical power is the number of quote changes (section 2.2): 4 to 2,532 per leg in the 5-minute window, median 408.

### 2.2 Microstructure: most bins have no quote change (H)

Over 5-minute bins, the share with zero mid change is 96.2% median (range 78.9% to 99.98%) for the 31 Polymarket legs and 97.9% median (83.6% to 99.95%) for the 17 live Kalshi legs (the two resolved Sept legs have no 5-minute grid) (T9, `leg_diag.json`). Polymarket quoted spreads at T0 (Gamma best bid/ask): median 1.0 cent, range 0.1 to 3 cents. Kalshi candle spreads: median 1.0 cent, range 0.2 to 1.8 cents (the tight books are House D 0.27c, Newsom win 0.45c, BoP R-House/D-Senate 0.18c). Consequence: 5-minute correlation tables are estimated from tens to a few hundred non-zero moves (column "share of bins with a change"), and 1-minute lead-lag is possible only for the handful of legs with hundreds of changes per week.

### 2.3 Correlation of mid-price changes (H)

Same-event pairs (full set in T2; 95% block-bootstrap CI in brackets):

| id | 5m rho [CI] (n) | share bins with x/y change | 10m non-overlap rho | 1h rho [CI] (n) | 1d rho [CI] (n) |
|---|---|---|---|---|---|
| X01_senate_D | -0.00 [-0.06, 0.06] (8639) | 0.003 / 0.009 | 0.02 | 0.10 [0.01, 0.19] (2015) | 0.54 [0.12, 0.76] (83) |
| X02_house_D | 0.01 [-0.01, 0.02] (8639) | 0.002 / 0.063 | 0.01 | -0.00 [-0.03, 0.02] (2015) | 0.29 [-0.05, 0.52] (83) |
| X03_fed_oct_hold | 0.77 [0.51, 0.86] (8639) | 0.038 / 0.063 | 0.81 | 0.84 [0.58, 0.92] (2015) | 0.97 [0.89, 0.98] (83) |
| X04_fed_oct_hike25 | 0.75 [0.51, 0.84] (8639) | 0.040 / 0.056 | 0.81 | 0.85 [0.62, 0.93] (2015) | 0.97 [0.90, 0.99] (83) |
| X05_bop_dem_sweep | 0.02 [-0.00, 0.05] (8639) | 0.006 / 0.018 | 0.02 | 0.09 [-0.01, 0.22] (2015) | 0.59 [0.37, 0.70] (83) |
| X06_tx_senate_D | 0.01 [-0.00, 0.02] (8639) | 0.017 / 0.021 | 0.03 | 0.04 [-0.01, 0.08] (2015) | 0.29 [0.09, 0.46] (83) |
| X07_vance_nominee | -0.00 [-0.00, 0.00] (8639) | 0.021 / 0.005 | -0.00 | -0.00 [-0.01, 0.00] (2015) | 0.06 [-0.41, 0.36] (83) |
| X08_newsom_nominee | 0.00 [-0.00, 0.00] (8639) | 0.042 / 0.001 | 0.00 | 0.01 [-0.00, 0.03] (2015) | 0.23 [-0.03, 0.49] (83) |
| X09_vance_winner | -0.00 [-0.00, 0.00] (8639) | 0.019 / 0.012 | -0.00 | 0.01 [-0.03, 0.06] (2015) | 0.30 [0.09, 0.45] (83) |
| X10_okc_west | 0.00 [-0.00, 0.00] (8639) | 0.000 / 0.009 | -0.00 | 0.00 [-0.00, 0.00] (2015) | 0.00 [-0.06, 0.04] (83) |
| X11_btc_100k_2026 | 0.14 [0.06, 0.22] (8639) | 0.099 / 0.038 | 0.15 | 0.31 [0.20, 0.41] (2015) | 0.82 [0.68, 0.90] (83) |
| XR1_fed_sep_hike25_resolved | n/a (n=0) | n/a | n/a | 0.78 [0.54, 0.88] (1247) | 0.96 [0.91, 0.98] (51) |
| XR2_fed_sep_hold_resolved | n/a (n=0) | n/a | n/a | 0.79 [0.55, 0.89] (1247) | 0.96 [0.94, 0.98] (51) |

Epps ladder for the ten strongest relationships (rho of price changes at 5 min, 1 h, 1 day; 1-day n = 83 or fewer):

| relationship | 5 min | 1 h | 1 day |
|---|---|---|---|
| X04 Fed Oct +25bp, Polymarket vs Kalshi | 0.75 | 0.85 | 0.97 |
| X03 Fed Oct hold, Polymarket vs Kalshi | 0.77 | 0.84 | 0.97 |
| I03 Kalshi rate>4.00% vs hike 25 + hike>25 | 0.47 | 0.75 | 0.96 |
| L03 Polymarket BTC reach 90k vs 100k | 0.16 | 0.47 | 0.90 |
| L01 Polymarket BTC reach 100k vs 110k | 0.11 | 0.33 | 0.84 |
| X11 BTC $100k, Polymarket vs Kalshi (basis) | 0.14 | 0.31 | 0.82 |
| F02 BTC vs ETH reach rungs (Polymarket) | 0.06 | 0.24 | 0.78 |
| L02 Polymarket BTC reach 110k vs 120k | 0.08 | 0.24 | 0.72 |
| X05 Balance of power Dem sweep, PM vs Kalshi | 0.02 | 0.09 | 0.59 |
| X01 Senate D control, PM vs Kalshi | 0.00 | 0.10 | 0.54 |

By relationship type (medians over the relationships with n >= 30; share of hourly CIs that exclude zero):

| type | n | median rho 5 min | median rho 1 h | median rho 1 day | hourly CI excludes 0 | median OOS variance reduction 1 h / 1 day |
|---|---|---|---|---|---|---|
| ladder (threshold or date rungs) | 12 | 0.128 | 0.351 | 0.721 (5 with daily n) | 12 of 12 | 7.1% / 54.2% |
| sum identity | 3 | 0.054 | 0.215 | 0.698 | 3 of 3 | 4.7% / 44.1% |
| same-event, two venues | 13 | 0.007 | 0.094 | 0.539 | 6 of 13 | 0.3% / 12.7% |
| correlated factor | 6 | -0.021 | -0.043 | -0.072 | 3 of 6 | 0.3% / 1.2% |
| implication (child <= parent) | 7 | 0.000 | 0.001 | 0.093 | 1 of 7 | 0.0% / 0.0% |

Reading it: co-movement between related markets is a **daily-to-hourly phenomenon driven by the few markets where price discovery is active** (Fed decision, BTC rungs). Two markets can be tied by a hard logical or rule link and still show rho of 0 intraday because one of them hardly quotes (Vance nomination vs win, Newsom, Senate seats). The factor pairs that are economically motivated (BTC vs Fed hike probability: hourly -0.12 [-0.20, -0.01], daily -0.14; BTC vs Kalshi Fed hike -0.04; Iran ceasefire vs WTI -0.05 [-0.24, 0.10]; Senate vs Fed hike 0.01) are weak and have out-of-sample variance reduction of about 0% to 1%.

### 2.4 Lead-lag: which leg moves first (H)

**Same-event pairs, cross-correlation asymmetry** (x = Polymarket, y = Kalshi; LAM > 0 means Polymarket first; "sens." = the wrong-by-construction alpha = 1 alignment, kept to show that one bucket of alignment error can fake a 5-minute lead of the opposite sign):

| id | grid | events x/y | rho0 | LAM [CI] | p_shift | BH | peak lag (bins; unit) | sens. alignment LAM [CI] |
|---|---|---|---|---|---|---|---|---|
| X01_senate_D | 5m | 30/77 | -0.00 | 0.000 [-0.06, 0.07] | 0.824 |  | +1 (5 min) | -0.02 [-0.11, 0.09] |
| X01_senate_D | 1h | 59/112 | 0.10 | 0.052 [-0.20, 0.25] | 0.460 |  | +0 (1 h) | 0.05 [-0.20, 0.25] |
| X02_house_D | 1h | 70/200 | -0.00 | -0.020 [-0.15, 0.10] | 0.743 |  | +4 (1 h) | -0.02 [-0.15, 0.10] |
| X03_fed_oct_hold | 1m | 238/309 | 0.60 | 0.130 [-0.52, 0.59] | 0.020 |  | +0 (1 min) | -0.59 [-1.00, -0.21] |
| X03_fed_oct_hold | 5m | 328/548 | 0.77 | -0.003 [-0.16, 0.19] | 0.912 |  | +0 (5 min) | -0.73 [-0.91, -0.40] |
| X03_fed_oct_hold | 1h | 187/358 | 0.84 | 0.003 [-0.12, 0.29] | 0.911 |  | +0 (1 h) | 0.00 [-0.12, 0.29] |
| X04_fed_oct_hike25 | 1m | 225/285 | 0.57 | 0.176 [-0.54, 0.77] | 0.024 |  | +0 (1 min) | -0.64 [-1.32, -0.17] |
| X04_fed_oct_hike25 | 5m | 349/485 | 0.75 | 0.005 [-0.11, 0.18] | 0.821 |  | +0 (5 min) | -0.77 [-0.91, -0.45] |
| X04_fed_oct_hike25 | 1h | 212/355 | 0.85 | 0.031 [-0.13, 0.45] | 0.385 |  | +0 (1 h) | 0.03 [-0.13, 0.45] |
| X05_bop_dem_sweep | 5m | 49/153 | 0.02 | 0.078 [0.01, 0.16] | 0.013 | * | +1 (5 min) | 0.02 [-0.03, 0.08] |
| X05_bop_dem_sweep | 1h | 77/87 | 0.09 | -0.123 [-0.30, 0.05] | 0.079 |  | -1 (1 h) | -0.12 [-0.30, 0.05] |
| X06_tx_senate_D | 5m | 143/183 | 0.01 | 0.010 [-0.09, 0.09] | 0.740 |  | +4 (5 min) | 0.01 [-0.09, 0.09] |
| X06_tx_senate_D | 1h | 152/204 | 0.04 | -0.059 [-0.22, 0.12] | 0.343 |  | +1 (1 h) | -0.06 [-0.22, 0.12] |
| X07_vance_nominee | 5m | 183/42 | -0.00 | 0.016 [-0.00, 0.04] | 0.410 |  | +6 (5 min) | 0.02 [-0.00, 0.05] |
| X07_vance_nominee | 1h | 301/32 | -0.00 | 0.063 [-0.14, 0.27] | 0.255 |  | +5 (1 h) | 0.06 [-0.14, 0.27] |
| X08_newsom_nominee | 1h | 322/115 | 0.01 | 0.028 [-0.13, 0.17] | 0.565 |  | +6 (1 h) | 0.03 [-0.13, 0.17] |
| X09_vance_winner | 1m | 164/29 | -0.00 | 0.021 [-0.00, 0.12] | 0.212 |  | +5 (1 min) | 0.01 [-0.00, 0.08] |
| X09_vance_winner | 5m | 160/105 | -0.00 | 0.003 [-0.00, 0.01] | 0.650 |  | -4 (5 min) | 0.00 [-0.01, 0.01] |
| X09_vance_winner | 1h | 213/125 | 0.01 | 0.054 [-0.02, 0.16] | 0.255 |  | +5 (1 h) | 0.05 [-0.02, 0.16] |
| X11_btc_100k_2026 | 1m | 280/82 | 0.00 | 0.030 [-0.03, 0.08] | 0.391 |  | -9 (1 min) | -0.01 [-0.06, 0.04] |
| X11_btc_100k_2026 | 5m | 852/326 | 0.14 | 0.167 [0.07, 0.26] | 0.001 | * | +0 (5 min) | -0.02 [-0.13, 0.09] |
| X11_btc_100k_2026 | 1h | 540/369 | 0.31 | 0.163 [0.02, 0.31] | 0.032 |  | +0 (1 h) | 0.16 [0.02, 0.31] |
| XR1_fed_sep_hike25_resolved | 1h | 272/334 | 0.78 | -0.009 [-0.08, 0.11] | 0.934 |  | +0 (1 h) | -0.01 [-0.08, 0.11] |
| XR2_fed_sep_hold_resolved | 1h | 288/346 | 0.79 | -0.063 [-0.13, 0.03] | 0.433 |  | +0 (1 h) | -0.06 [-0.13, 0.03] |

Not estimable (fewer than 20 quote changes on at least one leg): X01_senate_D 1m; X02_house_D 1m; X02_house_D 5m; X05_bop_dem_sweep 1m; X06_tx_senate_D 1m; X07_vance_nominee 1m; X08_newsom_nominee 1m; X08_newsom_nominee 5m; X10_okc_west 1h; X10_okc_west 1m; X10_okc_west 5m; XR1_fed_sep_hike25_resolved 1m; XR1_fed_sep_hike25_resolved 5m; XR2_fed_sep_hold_resolved 1m; XR2_fed_sep_hold_resolved 5m.

Reading the Fed pairs, the only same-event pairs with enough events at 1-minute resolution (225 to 309 events per leg in 6.9 days): rho(0) = 0.60 / 0.57 at 1 min (hold / hike), rho(+1) 0.14 / 0.23, rho(+2) 0.14 / 0.18 against rho(-1) 0.05 / 0.20, rho(-2) 0.13 / 0.10: the response is **contemporaneous with a roughly symmetric spill of 1 to 2 minutes both ways** (a mild Polymarket-first tilt on the hold market, none on the hike market). The 1-minute permutation test gives p = 0.02, the block-bootstrap CI for LAM spans zero ([-0.52, 0.59] and [-0.54, 0.77]); 5-minute LAM = -0.003 [-0.16, 0.19] and 0.005 [-0.11, 0.18]; hourly 0.003 [-0.12, 0.29] and 0.031 [-0.13, 0.45]. **Conclusion: no detectable lead by either venue on the Fed decision markets down to the 1-minute grid.** The sensitivity alignment would "find" Kalshi leading by exactly one bin (LAM -0.59 to -0.77), which is the artifact the tier-consistency check rules out.

**Family-wise view.** CCF asymmetry tests: 90 in the family, 22 with raw p < 0.05 (about 4.5 expected under the null), 14 BH-significant at q = 0.10. Event-response tests: 112 in the family, 22 raw p < 0.05 (about 5.6 expected), 1 BH-significant.

BH-significant CCF results at q = 0.10 (x leads when LAM > 0):

- BH-significant: L04_k_btc_100_110 5m_primary LAM=0.145 [-0.02, 0.34] p=0.001 (x=K_BTC_100K -> y=K_BTC_110K) x leads
- BH-significant: L10_pm_wti_105_110 1m_primary LAM=0.193 [0.04, 0.37] p=0.001 (x=PM_WTI_H105 -> y=PM_WTI_H110) x leads
- BH-significant: X11_btc_100k_2026 5m_primary LAM=0.167 [0.07, 0.26] p=0.001 (x=PM_BTC_100K -> y=K_BTC_100K) x leads
- BH-significant: L09_pm_iran_oct22_oct31 1m_primary LAM=-0.159 [-0.32, 0.08] p=0.002 (x=PM_IRAN_OCT22 -> y=PM_IRAN_OCT31) y leads
- BH-significant: F02_btc100k_vs_eth3500 1m_primary LAM=-0.103 [-0.18, -0.01] p=0.003 (x=PM_BTC_100K -> y=PM_ETH_3500) y leads
- BH-significant: L03_pm_btc_90_100 5m_primary LAM=0.071 [0.00, 0.14] p=0.003 (x=PM_BTC_90K -> y=PM_BTC_100K) x leads
- BH-significant: L08_pm_iran_nov30_dec31 5m_primary LAM=0.141 [-0.04, 0.36] p=0.005 (x=PM_IRAN_NOV30 -> y=PM_IRAN_DEC31) x leads
- BH-significant: I03_k_fed_hike_identity 1m_primary LAM=-0.236 [-0.44, 0.08] p=0.006 (x=K_FED_T400 -> y=K_FED_H25+K_FED_H26) y leads
- BH-significant: L07_pm_iran_nov15_nov30 5m_primary LAM=-0.122 [-0.26, 0.02] p=0.007 (x=PM_IRAN_NOV15 -> y=PM_IRAN_NOV30) y leads
- BH-significant: F03_iran_oct31_vs_wti110 5m_primary LAM=0.089 [0.02, 0.18] p=0.009 (x=PM_IRAN_OCT31 -> y=PM_WTI_H110) x leads
- BH-significant: L03_pm_btc_90_100 1h LAM=0.194 [0.03, 0.35] p=0.013 (x=PM_BTC_90K -> y=PM_BTC_100K) x leads
- BH-significant: X05_bop_dem_sweep 5m_primary LAM=0.078 [0.01, 0.16] p=0.013 (x=PM_BOP_DD -> y=K_BOP_DD) x leads
- BH-significant: L08_pm_iran_nov30_dec31 1m_primary LAM=0.117 [0.04, 0.21] p=0.014 (x=PM_IRAN_NOV30 -> y=PM_IRAN_DEC31) x leads
- BH-significant: P06_xv_pm_vance_win_le_k_nom 1h LAM=0.167 [-0.05, 0.48] p=0.015 (x=K_VANCE_NOM -> y=PM_VANCE_WIN) x leads

Patterns in that list: eight of fourteen are **within-venue ladders** (L03 twice, L04, L07, L08 twice, L09, L10); in L03, L04, L08 and L10 the nearer rung (or the earlier date) leads the farther one; L07 and L09 point the other way and are best read as noise; one is the **BTC basis pair PM -> Kalshi** (X11); one is the **Balance-of-Power sweep PM -> Kalshi** (X05, 5 min only, vanishes in the sensitivity alignment); the rest are single-grid results with no companion on the other grids: the Iran-vs-WTI factor pair (F03), BTC-vs-ETH (F02, 1 min, ETH first), the Kalshi Fed identity (I03, 1 min) and the cross-venue implication pair P06 (hourly, only 32 events on one leg). With 22 raw p < 0.05 against 4.5 expected under the null, there is real structure, but it sits in crypto-linked and ladder pairs, not in political same-event pairs.

**Event-response test (sparse quotes).** Of 112 tests only one is BH-significant: Fed +25bp, 5-minute grid, 12-bin window (1 h): PM events followed by same-sign Kalshi events 74% vs preceded 61%; Kalshi events followed 47% vs preceded 58%; S = 0.24, p = 0.001. The same direction appears for the hold market (5-minute, 1 h window: S = 0.12, p = 0.015, not BH-significant), for the hike market at 1 minute with a 5-minute window (S = 0.07, p = 0.027) and for the Balance-of-Power sweep (S = 0.19, p = 0.012, 49 events). Interpretation (M): a weak tendency for the Polymarket quote to move first within an hour on the Fed decision; it is not detectable in the continuous CCF and cannot be monetised (2.9).

**Crypto basis pair in detail (X11, H).** rho(k) at 5 min for k = -3..+3: 0.007, 0.019, -0.015, **0.135**, 0.064, 0.039, 0.012 (CI of rho(+1) [0.02, 0.10]); hourly: 0.006, 0.033, 0.037, **0.313**, 0.156, 0.049, 0.042 (CI of rho(+1) [0.097, 0.207]). Kalshi's response to a Polymarket BTC-rung move is spread over the next 5 to 60 minutes; the reverse direction is flat. Both react to BTC spot, so this is the slower book catching up with the spot, not information flowing from Polymarket to Kalshi (M).

**Context from doc 15 (M, via that doc).** Ng et al. (SSRN 5331995, abstract as quoted in doc 15) report Polymarket leading Kalshi in price discovery in the 2024 election window; I find no detectable Polymarket-first lead on the 2026 Senate, House, Texas or 2028 pairs (they hardly quote), a weak one only for the Fed-hike event test and a clearer one only for the spot-driven BTC pair. Portnaya (arXiv 2606.19517, via doc 15) reports an AR(1) half-life of about 4 h for BTC threshold contracts against option-implied prices; my BTC basis pair gives 4.6 h (5-minute grid) and 8.9 h (hourly), the same order of magnitude. Doc 15's 3-cent average Polymarket-Kalshi gap is within my +0.9 to +5.0 cent political bases.

### 2.5 Same-event spread: size, persistence, how often it beats fees (H)

Spread = Polymarket mid - Kalshi mid, probability points. `phi` is the hourly AR(1) coefficient (OLS 95% interval); half-lives in hours. The two rows ending "resolved" are the survivorship controls.

| id | hourly n | mean (c) | sd (c) | 5-95% (c) | AR(1) phi hourly [95% CI] | half-life 1h-grid (h) | phi 5m (30d) | half-life 5m-grid (h) | DF t (1h) | frac hours gap>entry fees | gap>2x fees | gap>all round-trip costs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| X01_senate_D | 2016 | +1.81 | 1.91 | -2.0..5.0 | 0.987 [0.981, 0.994] | 54.7 | 0.994 | 9.0 | -3.6 | 0.37 | 0.00 | 0.00 |
| X02_house_D | 2016 | +2.05 | 1.25 | 0.4..4.0 | 0.985 [0.977, 0.993] | 45.8 | 0.994 | 9.5 | -3.9 | 0.80 | 0.36 | 0.04 |
| X03_fed_oct_hold | 2016 | -0.12 | 1.30 | -2.0..2.0 | 0.890 [0.870, 0.910] | 6.0 | 0.961 | 1.4 | -10.8 | 0.06 | 0.00 | 0.00 |
| X04_fed_oct_hike25 | 2016 | +0.14 | 1.54 | -2.0..2.5 | 0.922 [0.905, 0.939] | 8.5 | 0.961 | 1.5 | -9.1 | 0.12 | 0.01 | 0.00 |
| X05_bop_dem_sweep | 2016 | +1.73 | 1.44 | -1.0..4.0 | 0.976 [0.967, 0.985] | 28.6 | 0.993 | 7.9 | -5.0 | 0.27 | 0.01 | 0.00 |
| X06_tx_senate_D | 2016 | +0.86 | 1.58 | -2.0..3.0 | 0.964 [0.953, 0.976] | 19.1 | 0.994 | 9.5 | -6.0 | 0.20 | 0.00 | 0.00 |
| X07_vance_nominee | 2016 | +4.98 | 1.39 | 2.5..6.8 | 0.990 [0.984, 0.996] | 68.5 | 0.994 | 10.0 | -3.2 | 0.92 | 0.49 | 0.00 |
| X08_newsom_nominee | 2016 | +1.45 | 1.16 | -0.4..3.2 | 0.970 [0.960, 0.981] | 23.1 | 0.999 | 50.7 | -5.5 | 0.52 | 0.07 | 0.02 |
| X09_vance_winner | 2016 | +1.92 | 1.61 | -1.5..4.5 | 0.987 [0.980, 0.994] | 54.5 | 0.993 | 8.1 | -3.5 | 0.55 | 0.13 | 0.02 |
| X10_okc_west | 2016 | +0.11 | 1.06 | -2.0..1.0 | 0.993 [0.988, 0.998] | 103.1 | 0.998 | 27.3 | -2.6 | 0.01 | 0.00 | 0.00 |
| X11_btc_100k_2026 | 2016 | -2.51 | 2.11 | -6.0..1.0 | 0.925 [0.908, 0.942] | 8.9 | 0.987 | 4.6 | -8.9 | 0.51 | 0.29 | 0.12 |
| XR1_fed_sep_hike25_resolved | 1248 | -0.34 | 1.57 | -3.0..2.5 | 0.856 [0.827, 0.884] | 4.5 | n/a | n/a | -10.0 | 0.11 | 0.00 | 0.00 |
| XR2_fed_sep_hold_resolved | 1248 | +0.09 | 1.57 | -3.0..2.0 | 0.857 [0.828, 0.885] | 4.5 | n/a | n/a | -9.9 | 0.11 | 0.00 | 0.00 |

* **Two time scales.** For the Fed pairs the 5-minute AR(1) half-life is 1.4 to 1.5 h and the hourly one 6.0 to 8.5 h: a fast component (stale quotes, a few cents) on top of a slower drift; one AR(1) does not describe both. For the political pairs both are 8 to 10 h (5-minute, 30 days) and 19 to 69 h (hourly, 84 days), with Dickey-Fuller t between -3.2 and -6.0 (stationary at the 5% level, barely so for the 2028 pairs) and OKC West at -2.6 (not rejected).
* **Fraction of time the gap exceeds fees (mid, before spreads).** Entry-only fees (hold to resolution): Fed 6% to 12%, Senate 37%, House 80%, BoP 27%, Texas 20%, Vance nomination 92%, Newsom nomination 52%, Vance win 55%, BTC basis 51%. Twice the fees (open and close, fees only): 0% to 1% for Fed, Senate, BoP, Texas; 29% BTC; 36% House; 49% Vance nomination. All round-trip costs (spreads plus 4 fees): 0% to 4% (House), 12% (BTC), 2% (Newsom, Vance win). So **a gap bigger than the fee is common on the long-dated political pairs, but only because they carry persistent bases that cost-wise cannot be arbitraged by closing out.**

### 2.6 How much of the apparent edge disappears (H, stated assumptions)

Dollar-weighted share of the apparent hourly mid-gap `|PM mid - Kalshi mid|` that remains positive after each friction, best direction chosen each hour, hold to resolution. "Hours net > 0" counts hours with positive edge after spread and fees; "net ann > 5%" additionally requires an annualised return above 5%. Capital lock uses the real days to resolution (median shown).

| id | mean gap (c) | median days to resolution | after spread | after taker fees | after 5% ann. hurdle | after 20% ann. hurdle | close-out trade | hours net>0 | hours net ann>5% | best net ann. |
|---|---|---|---|---|---|---|---|---|---|---|
| X01_senate_D | 2.25 | 58 | 59.2% | 5.3% | 3.3% | 0.0% | 0.0% | 23.4% | 6.1% | 18.1% |
| X02_house_D | 2.05 | 58 | 59.4% | 20.7% | 15.4% | 0.0% | 0.7% | 37.7% | 17.6% | 19.6% |
| X03_fed_oct_hold | 0.98 | 51 | 27.6% | 0.3% | 0.1% | 0.0% | 0.0% | 0.4% | 0.1% | 21.3% |
| X04_fed_oct_hike25 | 1.10 | 51 | 28.8% | 0.5% | 0.1% | 0.0% | 0.0% | 0.9% | 0.1% | 7.0% |
| X05_bop_dem_sweep | 1.84 | 58 | 52.9% | 3.9% | 2.7% | 0.0% | 0.0% | 11.5% | 3.2% | 19.6% |
| X06_tx_senate_D | 1.42 | 58 | 44.7% | 0.7% | 0.0% | 0.0% | 0.0% | 3.4% | 0.1% | 8.3% |
| X07_vance_nominee | 4.98 | 724 | 77.9% | 26.9% | 0.0% | 0.0% | 0.1% | 80.4% | 0.0% | 2.5% |
| X08_newsom_nominee | 1.52 | 724 | 68.1% | 16.4% | 0.0% | 0.0% | 0.8% | 39.3% | 0.0% | 2.2% |
| X09_vance_winner | 2.15 | 793 | 74.8% | 20.6% | 0.0% | 0.0% | 0.2% | 41.9% | 0.0% | 1.2% |
| X10_okc_west | 0.92 | 267 | 11.3% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | n/a |
| X11_btc_100k_2026 | 2.75 | 115 | 65.7% | 24.3% | 16.9% | 0.0% | 2.6% | 38.5% | 17.4% | 15.4% |
| XR1_fed_sep_hike25_resolved | 1.25 | 26 | 64.4% | 1.2% | 0.7% | 0.1% | 0.0% | 2.8% | 1.2% | 54.9% |
| XR2_fed_sep_hold_resolved | 1.22 | 26 | 22.8% | 0.2% | 0.1% | 0.0% | 0.0% | 0.4% | 0.2% | 18.1% |
| **mean over pairs** | | | 50.6% | 9.3% | 3.0% | 0.0% | 0.3% | | | |
| **median over pairs** | | | 59.2% | 3.9% | 0.1% | 0.0% | 0.0% | | | |

Sensitivity to the two non-first-hand assumptions (`sensitivity_frictions.json`, mean over 13 pairs):

| scenario | after spread | after fees | after 5% ann. hurdle | after 20% ann. hurdle | close-out trade | hours net>0 | hours net ann>5% |
|---|---|---|---|---|---|---|---|
| base (PM half-spread 0.5c, Kalshi coefficient 0.07) | 50.6% | 9.3% | 3.0% | 0.0% | 0.3% | 21.6% | 3.5% |
| Polymarket spread 0 | 71.2% | 12.8% | 5.6% | 0.6% | 1.2% | 26.5% | 6.8% |
| Kalshi fee coefficient halved | 50.6% | 15.9% | 6.6% | 0.6% | 1.6% | 32.1% | 8.2% |
| both | 71.2% | 21.9% | 10.1% | 1.5% | 4.2% | 35.6% | 11.3% |
| zero fees and zero Polymarket spread (only Kalshi spread left) | 71.2% | 71.2% | 44.8% | 17.2% | 46.5% | 80.2% | 42.5% |

Even under favourable assumptions at most about a fifth of the apparent gap survives fees and about a tenth survives a 5% annualised hurdle; the **fee layer is the largest single drain, then the spread, then capital lock** on the long-dated pairs. The largest raw gap (Vance nomination, 5.0 cents, positive after fees in 80% of hours) returns at most 2.5% annualised because the capital is locked for about 724 days; the three 2028 pairs return 1.2% to 2.5% at best.

**Statistical (pairs) strategy on the hourly spread** (trailing 168 h z-score, trailing data only):

| id | trades | mean gross (c) | hit rate gross | mean hold (h) | assumed round-trip cost (c) | mean net (c) | share trades gross>cost |
|---|---|---|---|---|---|---|---|
| X01_senate_D | 17 | +1.29 | 0.76 | 28.9 | 7.36 | -6.06 | 0.00 |
| X02_house_D | 14 | +0.78 | 0.71 | 28.9 | 4.10 | -3.32 | 0.00 |
| X03_fed_oct_hold | 25 | +1.88 | 0.80 | 17.1 | 7.41 | -5.53 | 0.00 |
| X04_fed_oct_hike25 | 25 | +1.68 | 0.80 | 20.1 | 6.95 | -5.27 | 0.00 |
| X05_bop_dem_sweep | 13 | +0.77 | 0.62 | 39.5 | 7.38 | -6.61 | 0.00 |
| X06_tx_senate_D | 13 | +1.19 | 0.77 | 35.6 | 7.41 | -6.22 | 0.00 |
| X07_vance_nominee | 12 | +0.21 | 0.67 | 41.8 | 7.63 | -7.42 | 0.00 |
| X08_newsom_nominee | 18 | +0.66 | 0.72 | 35.2 | 3.93 | -3.27 | 0.00 |
| X09_vance_winner | 15 | +0.68 | 0.87 | 40.5 | 4.77 | -4.09 | 0.00 |
| X10_okc_west | 7 | -0.29 | 0.29 | 48.0 | 6.69 | -6.98 | 0.00 |
| X11_btc_100k_2026 | 33 | +3.06 | 1.00 | 12.5 | 6.86 | -3.79 | 0.03 |
| XR1_fed_sep_hike25_resolved | 20 | +2.25 | 0.95 | 12.8 | 6.55 | -4.30 | 0.00 |
| XR2_fed_sep_hold_resolved | 24 | +2.60 | 1.00 | 12.5 | 8.48 | -5.88 | 0.00 |

The mean reversion is real (gross hit rate 62% to 100% on 12 of 13 pairs, +0.2 to +3.1 cents per trade) but the round trip costs 3.9 to 8.5 cents; only 1 trade of 33 on the BTC basis pair earned more than its cost.

### 2.7 Logical pairs: how often and how long constraints are violated (mid prices, NOT executable)

Strict constraints (child <= parent: ladders, implications; 19 pairs including the two resolved Iran controls):

* Mean slack `mid(child) - mid(parent)` ranges from -3.5 cents (resolved Iran rungs) and -4.3 / -4.6 cents (BTC 110k vs 120k on Polymarket and Kalshi) to -28.3 cents (Kalshi Vance win vs Polymarket nomination).
* Hours with a violation larger than 1 cent: **0 of 2,016 in 17 of the 19 pairs**. Two exceptions: Kalshi BTC 110k vs 120k (6 of 2,016 hours = 0.30%, two runs of 3 h, absent on the 5-minute grid) and the Iran Nov 30 vs Dec 31 rungs (1 of 707 hours = 0.14%, a 1 h run; two 5-minute runs of at most 1.1 h). Before I dropped the first 6 hours of each leg's life, the new Iran Oct 22 rung showed a 55-cent violation for 20 minutes at creation (a placeholder price): a data artifact, and a reason why "violation counts" in naive scans overstate edge.
* T0 executable check (`bid(child) - ask(parent)`): negative for all 19 (-0.1 to -32 cents).

Sum identities (parent = sum of children):

| identity | hours | mean (sum of children - parent) | hours with abs deviation > 1c | run length > 1c (median, max) | hours > spreads + fees (T0 cost model) | T0 executable edge |
|---|---|---|---|---|---|---|
| I01 Polymarket: D Senate = D sweep + (D Senate, R House) | 2,016 | +0.12c | 59.7% | 12 h, 384 h | 3.2% | -2.2c |
| I02 Kalshi: D Senate = DD + (R House, D Senate) | 2,016 | +0.30c | 26.5% | 3 h, 147 h | 0.0% | -0.8c |
| I03 Kalshi: rate > 4.00% after Oct = hike 25 + hike > 25 (valid from 2026-09-17) | 762 | -0.04c | 59.1% | 4 h, 67 h | 11.2% | 0.0c |

* I01/I02 are long, slowly changing deviations of 1 to 3 cents: composition and rule basis (ties, "other" outcomes, the BoP combo's own definitions), not arbitrage.
* **I03, the one place with a real intra-venue dislocation in the data** (`identity_exec.py`, bid/ask from candle closes, 8,640 5-minute bins): gross executable edge is positive in 21.0% of bins; after the 0.07*p(1-p) fee on all three legs it is positive in **42 bins (0.49%)**, in 14 episodes, median positive-gross run 15 minutes (max 1,285), maximum net edge 5.5 cents. The positive bins are mostly a wide stale-looking parent quote (e.g. 0.22/0.28 against a 0.17/0.18 child pair). Depth and queue position are unknown (candles carry no size), so this is a lead for the aggregator to monitor live, not a measured opportunity. I02: 11.3% of bins positive before fees, 0 after.

### 2.8 Hedge ratios and variance reduction (H)

Selected rows (OLS of the second leg on the first, beta fitted on the first 60% and scored on the last 40%; full table in T7):

| id | 5m beta / OOS VR | 1h beta (train, test) / OOS VR | 1d beta (train, test) / OOS VR |
|---|---|---|---|
| X01_senate_D | -0.00 / -0.3% | 0.13 (0.09, 0.16) / 1.4% | 0.51 (0.46, 0.52) / 31.7% |
| X03_fed_oct_hold | 0.83 / 68.4% | 0.84 (0.02, 0.87) / 4.0% | 1.03 (0.99, 1.03) / 96.5% |
| X04_fed_oct_hike25 | 0.82 / 63.9% | 0.88 (0.25, 0.90) / 38.0% | 1.02 (0.98, 1.02) / 97.1% |
| X11_btc_100k_2026 | 0.11 / -4.0% | 0.33 (0.41, 0.28) / 6.5% | 0.79 (0.89, 0.72) / 64.0% |
| L01_pm_btc_100_110 | 0.07 / 0.0% | 0.19 (0.20, 0.19) / 12.3% | 0.51 (0.54, 0.49) / 72.9% |
| L03_pm_btc_90_100 | 0.11 / 3.4% | 0.29 (0.27, 0.31) / 24.6% | 0.52 (0.53, 0.52) / 75.3% |
| L08_pm_iran_nov30_dec31 | 0.36 / 8.3% | 0.60 (0.62, 0.40) / 8.2% | n/a |
| P01_pm_vance_win_le_nom | 0.03 / -0.0% | 0.08 (0.08, -0.01) / -0.1% | 0.16 (0.15, 0.09) / 0.2% |
| P02_pm_newsom_win_le_nom | 0.01 / -0.3% | 0.02 (0.13, 0.00) / -14.6% | 0.06 (0.01, 0.06) / 1.3% |
| I01_pm_senateD_identity | 0.03 / -0.1% | 0.24 (0.11, 0.34) / 4.7% | 0.57 (0.26, 0.71) / 34.2% |
| I03_k_fed_hike_identity | 0.36 / 26.5% | 0.68 (0.60, 0.79) / 61.9% | n/a |
| F01_btc100k_vs_fed_hike25 | -0.06 / 0.0% | -0.19 (-0.04, -0.30) / 0.5% | -0.16 (-0.07, -0.24) / 1.2% |
| F02_btc100k_vs_eth3500 | 0.06 / 0.6% | 0.20 (0.21, 0.20) / 7.5% | 0.65 (0.84, 0.52) / 34.5% |
| F03_iran_oct31_vs_wti110 | -0.01 / -0.0% | -0.06 (-0.02, -0.37) / 0.5% | n/a |
| F05_k_btc100k_vs_k_fed_hike25 | -0.08 / -0.1% | -0.06 (-0.02, -0.09) / 0.1% | -0.09 (-0.05, -0.13) / 0.3% |

### 2.9 Is the lead-lag tradeable? (H)

Rule: follow the leader's move one bin in the follower, pay follower spread plus two taker fees (section 1.4). 456 rows were run; 273 have n >= 30.

* Positive mean net PnL: **2 of 273**, both on the resolved Iran Oct 12 / Oct 15 rungs (prices 0.70 to 0.97, median 0.88 to 0.92): the geopolitics category carries no taker fee (Gamma `feesEnabled` false; doc 08: geopolitics rate 0) and the assumed spread for a resolved market is its post-resolution book (0.999/1.0, half-spread 0.05 cent), so the modelled cost is 0.1 cent against gross +0.37 cent (net +0.27 cent, n = 45, t = 2.06) and +0.17 cent (net +0.07 cent, t = 0.52). With the 0.5-cent half-spread used for live markets both are negative. With 273 tests, about 14 nominal false positives are expected anyway.
* **Closest live case to break-even:** the fee-free Iran date ladder, Nov 30 leading Dec 31, hourly, 2-cent trigger: gross +0.57 cent (t = 1.93, n = 45) against a 1.0-cent round-trip spread, net -0.43 cent (hold-out 18 trades: gross +0.28, net -0.72). In fee-free categories the hurdle is the spread alone, so a latency/lead-lag strategy there is within about a factor of two of break-even, not 15 to 100 times away; it is not significant after the multiple-testing burden.
* Positive mean gross: 190 of 273; gross t > 3: 17; gross t > 3 and net > 0: **0**.
* Top rows by gross t-statistic (hold-out columns are the last 40% of trades):

| cluster | leader -> follower | grid | theta (c) | n | mean gross (c) | t gross | mean net (c) | OOS n | OOS gross (c) | OOS net (c) |
|---|---|---|---|---|---|---|---|---|---|---|
| L03_pm_btc_90_100 | PM_BTC_90K -> PM_BTC_100K | 5m_pm | 0.5 | 2357 | +0.03 | 4.91 | -3.82 | 943 | +0.03 | -3.84 |
| L03_pm_btc_90_100 | PM_BTC_90K -> PM_BTC_100K | 1h | 0.5 | 633 | +0.17 | 4.75 | -3.54 | 254 | +0.13 | -3.84 |
| L03_pm_btc_90_100 | PM_BTC_100K -> PM_BTC_90K | 5m_pm | 0.5 | 1147 | +0.06 | 4.39 | -5.08 | 459 | +0.08 | -4.94 |
| L01_pm_btc_100_110 | PM_BTC_100K -> PM_BTC_110K | 1h | 1.0 | 258 | +0.14 | 4.02 | -3.60 | 104 | +0.08 | -3.66 |
| L01_pm_btc_100_110 | PM_BTC_110K -> PM_BTC_100K | 5m_pm | 0.5 | 613 | +0.06 | 3.95 | -3.79 | 246 | +0.02 | -3.89 |
| X11_btc_100k_2026 | PM_BTC_100K -> K_BTC_100K | 1h | 1.0 | 252 | +0.25 | 3.89 | -3.73 | 101 | +0.25 | -3.90 |
| X11_btc_100k_2026 | PM_BTC_100K -> K_BTC_100K | 1h | 2.0 | 71 | +0.68 | 3.82 | -3.36 | 29 | +0.74 | -3.37 |
| L03_pm_btc_90_100 | PM_BTC_90K -> PM_BTC_100K | 1h | 1.0 | 373 | +0.20 | 3.74 | -3.57 | 150 | +0.14 | -3.84 |
| L03_pm_btc_90_100 | PM_BTC_100K -> PM_BTC_90K | 1h | 1.0 | 201 | +0.37 | 3.59 | -4.76 | 81 | +0.17 | -4.83 |
| L01_pm_btc_100_110 | PM_BTC_100K -> PM_BTC_110K | 5m_pm | 0.5 | 1297 | +0.02 | 3.59 | -3.80 | 519 | +0.01 | -3.75 |
| L03_pm_btc_90_100 | PM_BTC_90K -> PM_BTC_100K | 5m_pm | 1.0 | 713 | +0.05 | 3.48 | -3.84 | 286 | +0.00 | -3.87 |
| F02_btc100k_vs_eth3500 | PM_BTC_100K -> PM_ETH_3500 | 1h | 0.5 | 469 | +0.11 | 3.48 | -4.58 | 188 | +0.04 | -4.72 |

The best statistically significant case (Polymarket BTC $90k leads $100k, hourly, theta 0.5 cent) earns +0.17 cent gross (t = 4.75) and loses 3.54 cents net. The cross-venue crypto case (Polymarket BTC $100k leads Kalshi, hourly, 1 cent) earns +0.25 cent gross and loses 3.73 cents net. On fee-bearing markets per-trade costs run 3.4 to 5.1 cents. **On fee-bearing markets the lead-lag is 15 to 100 times too small for a taker.** It would still matter for a maker who is already posting on the lagging venue and wants to avoid being picked off, which is a quoting question not tested here.

### 2.10 XO and Limitless coverage

* **XO public history is not a time series (H).** `prices-history` returns trade ticks in **descending** order with duplicate timestamps; `interval` and `fidelity` do not behave as bucket widths (the same 208 points came back for fidelity 300 and 3,600 and for 30-day and 90-day intervals). The most active market (Fed hike 25bp, volume about 1.1 million USD) returned 208 ticks spanning **59 minutes**; sparse markets returned 1 to 7 points reaching back up to 80 days (e.g. Ballon d'Or Kane, 7 points). The XO trades route needs L2 credentials (doc 02: live 401 on `/trades`). **So XO is excluded from the statistics.** Same-instant snapshot, 2026-10-18 18:42:52 UTC (`triple_snapshot_fed_oct.json`), YES token best bid / ask (sizes in contracts for the best level):

| market | XO | Polymarket | Kalshi |
|---|---|---|---|
| Fed Oct +25bp | 0.125 / 0.145 | 0.13 (38,608) / 0.14 (391,671) | 0.12 (1,307) / 0.13 (2,333) |
| Fed Oct no change | 0.855 / 0.875 | 0.86 (296,794) / 0.87 (425,449) | 0.86 (55,802) / 0.87 (188,421) |

  Polymarket bid equals Kalshi ask (0.13), so the gross edge is zero; XO's 2-cent-wide quote straddles Polymarket's with no crossing. XO taker fee 4% (`takerFeeBps` 400, doc 16).
* **Limitless is a Polymarket mirror (H, metadata).** The ETH weekly group market carries `externalProvider: "polymarket"`, `externalSlug: "what-price-will-ethereum-hit-october-12-18-2026"`, `isPolyArbitrage: true` and per-rung `externalRulesWatch.rulesHash` (my fetch of `GET /markets/active`, consistent with doc 16 finding 1). History for the same week is available (317 points, 30-minute spacing, 6.6 days). Raw timestamps give rho(-1) = 0.968 between the two venues' changes and rho(0) = -0.11, i.e. Limitless labels sit one 30-minute bin early; shifting them by +30 minutes (alignment assumption, M) gives:

| rung (same week) | 30-min change corr (rho0) | level corr | spread mean / sd | share of bins with abs gap > 1c / 2c / 5c | LAM Polymarket->Limitless [CI] |
|---|---|---|---|---|---|
| ETH dip to $2,300 | 0.968 | 0.997 | -0.18c / 1.05c | 22.4% / 4.8% / 0.3% | -0.07 [-0.29, 0.30] |
| ETH dip to $2,200 | 0.397 | 0.630 | -0.69c / 5.03c | 7.4% / 2.6% / 1.3% | -0.29 [-0.53, 0.07] |
| ETH reach $2,600 | 0.384 | 0.982 | -0.47c / 4.52c | 11.2% / 2.2% / 1.0% | 0.02 [-0.17, 0.17] |

  Limitless trades the same prices with a wide book: for the $2,300 rung `tradePrices` showed buy 0.25 / sell 0.14 against a 0.195 mid (an 11-cent round trip) at the crawl, far above the 1-cent gaps; volume was about 4,000 USD for the whole group. No lead-lag is detectable at 30-minute resolution (N = 312).

---

## 3. Adversarial review: bias, error and limitations

1. **Alignment (resolved).** The first pass used alpha = 1 (Polymarket known one bucket late). It manufactured a Kalshi lead of exactly one bin on the Fed pairs (LAM -0.59 to -0.77, p = 0.005). The tier check (100% of 3,398 buckets) and the trade calibration showed alpha = 0 is right. Residual uncertainty: the 1-minute value could itself be sampled up to 60 s after its label; leads shorter than about 1 minute are not resolvable with any public series.
2. **Resolved-market settlement artifact.** The spec says a resolved market's series carries a settlement point "placed one bucket edge past the last stored row and clamped to an explicit window's end"; in practice every explicit window of a resolved Polymarket market ended with a payout point (1.000); two spurious 1.000 hourly points appeared in the Fed-September series and distorted its spread sd (3.1 to 1.6 cents) until dropped. Rule: drop zero-width points.
3. **Burn-in.** Without the 6-hour burn-in a newly created rung showed a 55-cent ladder violation. The burn-in length is arbitrary (6 h); the conclusions on logic constraints do not depend on it (17 of 19 pairs have no violation at all).
4. **Multiple testing.** 90 CCF tests and 112 event tests are reported. Raw p < 0.05: 22 and 22 (about 4.5 and 5.6 expected under the null). BH q = 0.10 leaves 14 and 1. The permutation p and the bootstrap CI disagree in several cases (1-minute Fed pairs: p = 0.02, CI spans zero); I treat only results that pass BH **and** show a CI away from zero as firm (X11 5 min, L03 1 h, L08 1 min, L10 1 min, F02 1 min, F03 5 min, X05 5 min; X11 at 1 h has a CI away from zero but p = 0.03 does not pass BH).
5. **Stale-quote bias in "who leads".** Test T7: the venue that updates faster looks like a leader even if both see the same news. A lead here is quote speed.
6. **Survivorship and look-ahead in selection.** Markets were chosen on today's liquidity and, for BTC rungs, today's price. Controls: four resolved markets. The 6-hour burn-in was introduced after I saw a creation artifact (disclosed in item 3), not before. Not tested: delisted/voided markets, far-from-the-money rungs, markets with no counterpart on the other venue (those would be excluded by construction).
7. **Polymarket historic spread unknown.** I use the T0 half-spread. If spreads were wider earlier (likely for thinner periods), frictions are understated and the edge overstated. If Polymarket makers pay no fee and trade at mid, the "Polymarket spread 0" scenario is the bound. For the four resolved controls the T0 book is the post-resolution book (0.999/1.0), i.e. an assumed half-spread of 0.05 cent, which flatters the edge: their attrition and economics are upper bounds.
8. **Kalshi fee coefficient M.** 0.07 is from secondary sources (doc 08 4.10); the official fee PDF was not retrievable by doc 08 and I did not retry. Scenarios with 0.035 and 0 are in 2.6. Kalshi fee rounding (balance alignment to $0.01 for non-direct members) would raise small-order costs further and is ignored.
9. **Candles carry no size.** Kalshi bid/ask closes do not say how much can be traded; Polymarket history has no book at all. All executable-edge numbers are therefore **top-of-book edge per contract with unknown depth**; the only depth-aware data are the one-time T0 books (section 2.10 sizes).
10. **Contract equivalence.** Only a few pairs were rule-checked (doc 08, doc 16). Persistent bases (+1.7 to +5.0 cents) may be rule/cutoff basis (doc 16 finding 9: UTC vs ET cutoffs) and not a mispricing; hold-to-resolution on them is not riskless.
11. **Regime.** The window contains a Fed hike on 2026-09-16 (Kalshi September +25bp resolved YES, Polymarket likewise); relationships such as the Kalshi Fed identity are only valid after 2026-09-17 and I restrict them. Sample sizes are small for slow markets (30 to 300 changes), 1-minute data covers only 6.9 days, and Kalshi 5-minute analysis only 30 days.
12. **Bootstrap limits.** Blocks of 2 hours may be shorter than the persistence of news days; the CIs of 1-minute CCFs are wide (J = 82 blocks, heavy tails). AR(1) CIs are analytic OLS intervals, unreliable near a unit root (phi 0.98 to 0.99).
13. **Economic test optimism.** Entry at the close of the same bin in which the leader moved assumes simultaneous observation and instant execution (no latency), uses candle closes rather than a tape, ignores partial fills and price impact, and uses a constant Polymarket spread. All of these favour the strategy, which still loses.
14. **Not covered.** Maker strategies and rebates; NO-side books; depth-aware simulation; Polymarket US, Opinion, Predict.fun, Probable, Trueo (no public history comparable to the two main venues was checked); market-moving trades by the aggregator itself.

---

## 4. Conclusion and implications for the aggregation layer

**Is there a viable latency/statistical edge?**

* **Latency (seconds to minutes), taker: no.** Same-event lead-lag is not detectable at 1-minute resolution on the one liquid pair, and where it exists (BTC basis, nearer ladder rungs) the gross edge is 0.03 to 0.7 cent per trade against 3.4 to 5.1 cents of cost on fee-bearing markets. On the fee-free Iran date ladders the hurdle is the 1-cent spread alone and the best case is +0.57 cent gross (net -0.43), not significant after multiple-testing.
* **Statistical (hours to days), taker: no.** The spread mean-reverts (Fed pairs: half-life 6 to 8.5 h) and the reversion earns +0.2 to +3.1 cents gross, but costs 3.9 to 8.5 cents round trip; 0 of 13 pairs net positive. Hedging reduces variance at the daily horizon (34% to 97%) without creating profit.
* **What could still pay.** (1) Hold-to-resolution convergence on near-dated pairs when the gap exceeds all-in entry costs: that happens in 0.4% to 0.9% of hours on the Fed pair and 3% to 80% of hours on the political pairs, but annualised above 5% only in 0% to 18% of hours, and above 20% in at most a few individual hours. (2) Rare intra-venue dislocations such as the Kalshi Fed identity (0.49% of 5-minute bins), if depth exists. (3) Maker-side quoting informed by these signals (untested). (4) The signals themselves, as pricing and alert features.
* **Horizon.** The only horizon at which statistical structure is strong is **1 day or longer** (daily rho 0.5 to 0.97 on active markets, OOS variance reduction 34% to 97%). Below one hour the structure is thin (5-minute rho is 0 to 0.32 outside the Fed pairs and the Kalshi Fed identity at 0.47) and below ~5 minutes it is not distinguishable from simultaneity.
* **Which relationship types carry it.** In order: (a) active same-event pairs on a scheduled macro event (Fed decision): tight, efficient, consistent; (b) ladders on active underlyings (BTC): strongest hourly/daily co-movement and the clearest "nearer rung leads" pattern, constraint never binding; (c) crypto-spot-driven cross-venue basis pairs: Polymarket-first by up to an hour, still net negative; (d) sum identities: persistent 1 to 3 cents (composition basis), plus rare Kalshi intra-venue dislocations; (e) cross-topic factor pairs: only BTC-ETH at daily horizon; (f) implication pairs and long-dated political same-event pairs: nothing intraday, large slack or lock-limited bases.

**Design implications**

1. Model every "edge" with: top-of-book with sizes, per-venue fee curves read from live fee data (Polymarket `feeSchedule`, Kalshi series `fee_type`/`fee_multiplier`; coefficient to be verified), capital lock to the rule-defined resolution date, and an annualised net return. In this panel the first two layers remove about 90% of the apparent gap.
2. Poll hourly for correlation/basis signals; add 1 to 5 minute polling only for legs flagged as spot-linked or as the nearer rung of a ladder. Use a bigger window than 7 days: persist your own 1-minute data because Polymarket serves 1-minute history for roughly 7 days only (docs minimum) and Kalshi caps 1-minute pulls at 3.4 days per request.
3. Do not use a time-series feature unless the leg has hundreds of quote changes per month; gate relationship signals on event counts (the share of 5-minute bins with a change is in `leg_diag.json`).
4. Ship the logical-constraint checks as alerts with a mid-vs-executable label, a creation burn-in, a settlement-point filter and a market-status filter; expect almost no hits (17 of 19 constraints never violated by more than 1 cent in 84 days).
5. Watch intra-Kalshi identities (threshold market vs decision market on the same meeting) with live books and sizes; that is where the only net-positive episodes appeared.
6. Use Limitless/XO as price followers/quoters, not as an independent price signal: Limitless is flagged as a Polymarket mirror in its own metadata; XO has no usable public history and a 2-cent spread on the pair measured.

---

## 5. Reproduce

All files below are under `docs/research/fixtures/linking/correlation/`. Python 3 standard library only.

```sh
# A. exact reproduction offline from the frozen compact snapshot (identical results, verified by a clean-room run on 2026-10-19)
sh docs/research/fixtures/linking/correlation/reproduce.sh frozen      # ~5 min on 8+ cores; work files in ./work/out, tables in ./work/out/tables.md

# B. re-run live (numbers will differ: markets move; Polymarket 1-minute history is only kept ~7 days)
sh docs/research/fixtures/linking/correlation/reproduce.sh live

# the individual steps (cwd = a work directory containing out/; S = .../correlation/scripts)
python3 -I $S/selftest.py                                   # 25 synthetic-data tests
python3 -I $S/crawl_kalshi.py; python3 -I $S/crawl_poly.py  # discovery snapshots (live mode only)
python3 -I $S/registry.py                                   # 50 legs, 41 relationships -> out/registry.json
python3 -I $S/fetch_series.py pm; python3 -I $S/fetch_series.py kalshi
python3 -I $S/snapshot_tool.py compact|expand DIR           # frozen snapshot <-> out/series
cat out/cluster_ids.txt | xargs -P 8 -I{} python3 -I $S/run_study.py {}
python3 -I $S/leg_diagnostics.py; python3 -I $S/leadlag_econ.py; python3 -I $S/identity_exec.py
python3 -I $S/check_pm_tier_consistency.py; python3 -I $S/check_kalshi_locf.py; python3 -I $S/sensitivity_frictions.py
python3 -I $S/make_tables.py > out/tables.md
python3 -I $S/calib_pm_alignment.py PM_FED_H25 4            # live only (public trades)
python3 -I $S/limitless_pair.py                             # live only
```

Artifacts (each under 100 KB): `scripts/` (18 scripts), `snapshot/` (50 gzip files, 1.5 MB total, largest 76 KB), `results/` (41 JSON), `registry.json`, `t0.txt`, `tables.md`, `leadlag_econ_1h.json`, `leadlag_econ_5m.json`, `leg_diag.json`, `identity_exec.json`, `sensitivity_frictions.json`, `limitless_pair.json`, `triple_snapshot_fed_oct.json`, `calib_pm_*.json`, `check_*.json`, `selftest_results.json`, `reproduce.sh`. Not stored (too large): the Kalshi/Polymarket discovery crawls (65 MB, 30 MB) and the raw per-request cache.

---

## 6. Sources

Primary and live (all public GET, accessed 2026-10-18/19):

* `https://data-api.polymarket.com/v2/openapi.json` (prices-history and trades specs, retention, settlement-point behaviour); `https://data-api.polymarket.com/v2/prices-history`, `/v2/trades`; `https://gamma-api.polymarket.com/events/keyset`, `/public-search`; `https://clob.polymarket.com/book`; `https://docs.polymarket.com/llms.txt`.
* `https://docs.kalshi.com/llms.txt`, `/api-reference/market/get-market-candlesticks.md`, `/getting_started/rate_limits.md`; `https://external-api.kalshi.com/trade-api/v2/events`, `/events/{ticker}`, `/markets/{ticker}`, `/markets/trades`, `/series/{s}/markets/{t}/candlesticks`, `/exchange/status`.
* `https://docs.xo.market/api-reference/market-data/get-price-history` and neighbouring pages (xo-docs MCP search and filesystem queries); `https://api-mainnet.xo.market/api/markets`, `/markets/{id}`; `https://orderbooks.xo.market/prices-history`, `/price`, `/midpoint`, `/spread`.
* `https://api.limitless.exchange/markets/active`, `/markets/{slug}/historical-price`, `https://api.limitless.exchange/api-json`.

Repo files relied on: `docs/plan.md`; `docs/research/02-xo-read-api.md` (XO endpoint shapes); `08-venues-polymarket-kalshi.md` (fees, price-history retention, rule differences, headline 7, section 4.10); `09-venues-onchain-clob.md` (Limitless history endpoint); `15-relationship-taxonomy-literature.md` (published lead-lag and half-life evidence quoted in 2.4); `16-linking-methods-services.md` (Limitless mirror hooks, within-venue scans, cutoff offsets, XO fee); fixtures `fixtures/polymarket/data_v2_prices_history.json`, `fixtures/kalshi/candlesticks_controls_r.json`, `../../sdk/venues/xo/fixtures/orderbook-prices-history.json`.

My scripts: `docs/research/fixtures/linking/correlation/scripts/*.py` (list in section 5). Session-local copies: `<scratch>/correlation-leadlag-study/`.

**Open questions.** Kalshi fee coefficient and rounding (official schedule); intraday depth of Kalshi books behind the candle bid/ask (needs a live recorder); whether the Kalshi Fed identity dislocations carry size; whether Polymarket's 1-minute value is sampled at the label second or later in the minute; rule-level equivalence for the Fed, House and BoP pairs; a longer, self-recorded history to test lead-lag at 1-minute resolution over months; maker-side economics.


---

## Verification (2026-10-19)

Adversarial verifier pass. Method: (a) re-ran the researcher's saved code (`reproduce.sh frozen`, python3 -I, Python 3.14.6, 16 cores, 4 min 15 s) in a scratch directory and diffed every output against the repo; (b) re-implemented the loaders, grids, AR(1), CCF, hedge, constraint, attrition and identity calculations independently from the frozen snapshot (own code, not `lib.py`); (c) re-ran the researcher's functions on windows and pairs they did not report (first/second half of the sample; unreported cross-venue BTC 110k and 120k pairs); (d) probed the public APIs again (Polymarket Data API v2 spec and live 1m/5m/30m pulls, Kalshi series/candle/docs endpoints, XO prices-history, Limitless API). Public unauthenticated GETs only, under 40 requests per host, nothing signed, no credentials. The verifier host clock read 2026-10-18 19:0x UTC, i.e. about 55 minutes after T0, so **no genuinely post-T0 out-of-sample window existed**; "different window" below means sub-windows of the frozen sample plus unreported pairs. Verifier scratch code: `<scratch>/verify-leadlag/` (`vlib.py`, `va_spread.py`, `vb_leadlag.py`, `vc_tiers*.py`, `vd_logic.py`, `ve_bounce.py`, `vf_attr.py`, `vg_newpairs.py`, `vh_econ_new.py`, `vi_econ_synth.py`, `vj_hold.py`, `vk_hedge.py`, `vl_ident.py`).

**Overall.** The headline conclusion (no taker-side edge survives frictions) and nearly every number reproduce exactly. Six statements are over-stated or need a caveat (items C1 to C8 below); one code inconsistency was found (B1); no look-ahead bug in the statistics was found, but two data-snooping points and a PM-favourable timing convention are documented. No script or output file was edited.

### Reproduction result

* `reproduce.sh frozen` finished with `ALL 25 TESTS PASSED`. `tables.md` is byte-identical to the repo copy; all 41 `results/*.json`, `leg_diag.json`, `identity_exec.json`, `check_pm_tier.json`, `sensitivity_frictions.json` and all 456 rows of `leadlag_econ` (repo splits them into `_1h` and `_5m` files) are identical. `selftest_results.json` is identical.
* **One exception:** `check_kalshi_locf.json` is not identical. The frozen snapshot is compacted (repeated candle rows dropped), so the rerun compares 6,321 hourly pairs, not 11,454; agreement is still 100% for bid and ask on all 17 legs. So "a clean-room run from the frozen snapshot reproduces every output identically" (section 5, summary) is true for 40 of 41 output groups; the 11,454 figure is only reproducible from the original, non-compacted download (not stored).

### Items checked (verdicts)

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | PM prices-history: bucket-start timestamps, retention minimums 7 d / 60 d / 90 d, 15-day cap, 10,000-point page | confirmed (H) | `https://data-api.polymarket.com/v2/openapi.json` re-read: "1-minute data at least 7 days, 5-minute at least 60, 30-minute at least 90"; "explicit `start`/`end` windows cap at 15 days"; `limit` "defaults to the cap (10,000)"; "an aggregate reports its bucket start". |
| 2 | 5-minute (and 30-minute) bucket value equals the 1-minute value at its label in 100% of informative buckets | confirmed (H) | Independent live pull (fresh requests, own code): 5m vs 1m, PM_FED_H25 126/126, PM_FED_H0 127/127, PM_BTC_100K 108/108; 30m vs 5m (12-day window), 73/73, 65/65, 135/135, 6/6. The repo file `check_pm_tier.json` (3,398/3,398; 79.5% at -1 min, 62.4% at +1, 15.7% at +4) is arithmetically consistent with the claimed percentages. The 30-minute tier was never checked by the researcher and it supplies 27 of the 84 days of the hourly sample, so this closes a gap. |
| 3 | "The label time is the observation time (alpha = 0)" | **corrected** (C1) | see C1 |
| 4 | PM history value is the book mid (535 trades, k=0 residual 0.00174) | confirmed arithmetic (H); interpretation limited | `calib_pm_PM_FED_H25.json`: k=-1 0.00295, k=0 0.00174, k=+1 0.00247 (the k=0/k=+1 gap is small and the +1 side is closer than the -1 side, which fits a sampling instant inside the minute, not exactly at the label). |
| 5 | Kalshi 5,000-candle cap; 1-minute data back at least 85 days; sparse candles | confirmed (H) | live: `requested time range with candlesticks: 5040.000000, max candlesticks: 5000` (HTTP 400); 1-minute rows returned for windows 83 and 100 days back; CONTROLS-2026-D 1,965 candles in 3 days (claimed 1,966). Also note the doc "Historical Data": settled markets and trades older than the cutoff (live `GET /historical/cutoff` = 2026-08-19) are served only by `/historical/*` endpoints. |
| 6 | Kalshi LOCF of 1m bid/ask equals 60m closes in 11,454 of 11,454 hours | **corrected** (C2) | see rerun note above: 100% on 6,321 comparisons from the frozen snapshot; 11,454 only from the original download. |
| 7 | Resolved PM markets return a clamped payout point | confirmed (H) | spec text: "A RESOLVED market's series ends with one settlement point ... at `resolution_seconds` 0 ... clamped to an explicit window's `end`". |
| 8 | XO prices-history is not a usable series | confirmed (H) | live probe on the active "Fed hikes ... exactly 25 bps after October 2026 meeting?" market (id 40266): 211 ticks, descending, 143 duplicate timestamps, spanning 60.7 minutes, identical for `interval=86400&fidelity=3600`, `86400&300` and `2592000&300`. `GET /live-activity/events/{condition}` returned `[]` for that market. The XO OpenAPI lists only `/prices-history` and `/live-activity/events/{condition_id}` as public history-like routes. |
| 9 | Limitless markets are Polymarket mirrors; +30 min shift gives rho 0.968 | **corrected** (C3) | see C3 |
| 10 | Fed-decision pairs: no lead-lag at 1 min, 5 min, 1 h | **corrected** (C4) | see C4 |
| 11 | Polymarket leads Kalshi on the BTC $100k basis pair (5 min LAM 0.167 [0.07, 0.26]; hourly rho(+1) 0.156) | confirmed, and "only" is **corrected** (C5) | numbers reproduced exactly by an independent implementation (hourly rho(0) 0.313, rho(+1) 0.156, block-bootstrap CI of rho(+1) [0.101, 0.218]). |
| 12 | 90 CCF tests, 22 raw p<0.05, 14 BH-significant; 112 event tests, 22 raw, 1 BH | confirmed (H) | recounted from the rerun JSON with my own BH step-up. Extra: 6 tests survive BH at q=0.05, **0 survive Bonferroni**, and only 8 of the 14 BH hits have a bootstrap CI that excludes zero (F02 1m, F03 5m, L03 5m, L03 1h, L08 1m, L10 1m, X05 5m, X11 5m). The 112 is the event family after the >=20-events filter (140 before; same 22 raw and 1 BH). |
| 13 | Follow-the-leader: 0 of 273 net positive except 2 cost-model artifacts; 17 with gross t>3 | confirmed counts; magnitude **corrected** (C6) | recount: 456 rows, 273 with n>=30, 2 positive net (both LR2 resolved rungs, assumed half-spread 0.05 cent), 190 positive gross, 17 with t>3, 0 with t>3 and net>0. |
| 14 | Edge attrition: 50.6% after spread, 9.3% after fees, 3.0% after a 5% hurdle (13 pairs) | confirmed (H); code inconsistency B1 | independent re-implementation (own bid/ask grids, fee, annualisation) reproduces every per-pair row of T5 exactly and the means 50.6 / 9.3 / 3.0. |
| 15 | Sensitivity: 21.9% survives fees and 10.1% a 5% hurdle under favourable assumptions | confirmed (rerun) | `sensitivity_frictions.json` identical on rerun; I did not re-implement the sensitivity grid. |
| 16 | Strict constraints: 17 of 19 pairs never violated by more than 1 cent | confirmed (H) | independent hourly mids: only L05 (6 h, max +4.0c) and L08 (1 h, +1.5c) exceed 1c; slack means -3.5c to -28.3c reproduced. Caveat: most slack is huge by construction (Vance win vs nomination -26c), so only L02, L04, L05, L08 and the resolved rungs are informative tests. |
| 17 | Kalshi Fed identity: 42 of 8,640 bins net positive, 14 episodes, max 5.5c | confirmed (H) | independent re-implementation: 42 bins, 14 episodes, max net 0.055, gross>0 in 1,813 bins (21.0%). |
| 18 | Epps ladder, hedge OOS variance reduction | confirmed (H) | hedge: L03 24.6% / 75.3%, X04 38.0% / 97.1%, F02 7.5% / 34.5%, F05 0.1% / 0.3%, X11 6.5% / 64.0% (1 h / 1 d) reproduced independently. Epps table identical on rerun. Note X04 hourly 38% uses train beta 0.25 against test beta 0.90 (regime shift; see C4). |
| 19 | Same-event spread half-lives (Fed 6.0 / 8.5 h; BTC 8.9 h) | **corrected** (C7) | OLS values reproduce exactly (0.890 / 6.0 h, 0.922 / 8.5 h, 0.925 / 8.9 h; 5-minute 1.4 / 1.5 h). |
| 20 | Synthetic self-tests recover a known lag | confirmed with gaps (C8) | all 25 pass; planted lag 3 recovered with correct sign convention (k>0 = x leads, checked in code and by my own econ test). |
| 21 | Mid-vs-trade bounce: lag-1 autocorr -0.059 (mid) vs -0.114 (trade), 17 Kalshi legs | confirmed (H) | independent: -0.059 and -0.114 (medians). Residual reversal is still material: for consecutive non-zero mid changes the opposite-sign share is 54% to 100% on Kalshi legs and 33% to 72% on PM legs (a pure random walk would give 50%). |
| 22 | Kalshi taker fee 0.07*p*(1-p) is only secondary (M) | **corrected upward to H for the coefficient** | `https://docs.kalshi.com/getting_started/fee_rounding.md` worked example: revenue 0.055, "model fee of $0.00363825"; 0.07 x 0.055 x 0.945 = 0.00363825. `GET /series/KXBTCMAXY` -> `fee_type: quadratic`, `fee_multiplier: 1`. New: `GET /series/KXFEDDECISION` and `/series/KXFED` -> `fee_type: quadratic_with_maker_fees` (maker fees apply on the Fed series; matters for any maker-side idea and for the I03 identity legs). Polymarket Gamma `feeSchedule` for the Fed +25bp token: `{exponent: 1, rate: 0.05, takerOnly: true, rebateRate: 0.25}` (confirms the researcher's `rate*p*(1-p)` form). |
| 23 | Same-instant triple snapshot (XO / Polymarket / Kalshi) | unverifiable (point in time) | fixture is internally consistent with the notes; not re-fetched. |
| 24 | Published context (Ng et al.; Portnaya) and request counters (243 / 270 / ...) | unverifiable | quoted via doc 15; counters were in a cache not stored. |
| 25 | Panel "50 legs" | corrected (minor) | 49 legs are used; `PM_WTI_L85` is downloaded and counted in the 31 Polymarket legs but is in no relationship. |

### Corrections (replacement text)

* **C1. Alignment convention.** Notes 1.3 and section 3 item 1 say "the label time is the observation time (alpha = 0)" and call alpha = 1 "wrong by construction". The primary spec says the opposite about provenance: `resolution_seconds` is the "Width of the window this price was observed in ... the price was observed within `[timestamp, timestamp + resolution_seconds)`". What is verified (items 2 and 4) is that the 30-minute and 5-minute values are point samples of the 1-minute series at their label. The 1-minute value itself is observed somewhere in `[t, t+60 s)`. Corrected text: "alpha = 0 treats a bucket as known at its label, which is Polymarket-favourable by up to 60 seconds; the plausible range of the true Polymarket-minus-Kalshi offset is 0 to 1 one-minute bin. At 5-minute and hourly grids that is at most 0.2 bin and 0.02 bin and does not matter; at 1-minute resolution it decides the sign (C4)." The sensitivity run (alpha = 1 on the 5-minute grid) over-shoots by a factor of 5 and should not be read as a plausible alternative there.
* **C2.** Replace "11,454 of 11,454 hourly comparisons" by "11,454 of 11,454 on the original download; 6,321 of 6,321 on the compacted frozen snapshot".
* **C3. Limitless.** (i) The +30-minute shift was chosen on the same data to maximise the 30-minute change correlation (unshifted rho(0) -0.108, rho(-1) 0.968). After picking the shift that forces rho(0) to peak, the reported "no lead-lag detectable" (LAM -0.07 [-0.29, 0.30]) is true by construction and carries no information; the 0.968 is a consequence of the shift, not an independent finding. (ii) Only the $2,300 rung is a close mirror; the other two rungs have change correlation 0.40 and 0.38, level correlation 0.63 and 0.98, spread sd 5.0c and 4.5c. (iii) The metadata claim is confirmed live (`externalProvider: "polymarket"`, `externalSlug`, `isPolyArbitrage: true` on the ETH weekly group and its rungs), but a minority of active Limitless markets have no external link or `isPolyArbitrage: false`. (iv) The NOT FOUND "Limitless history finer than about 30 minutes" is **partly refuted**: `GET /markets/{slug}/events` ("Get Finalized Market Trades", live probe on `2300-1791777968538`) returns individual fills with millisecond `createdAt`, `price`, `matchedSize`, so a trade-level price series exists (sparse for this market) and `GET /markets/{slug}/get-feed-events` is also listed.
* **C4. Fed-decision lead-lag.** At 5 minutes and 1 hour the claim is robust (alignment error is at most 0.2 bin; LAM -0.003 to 0.031, CIs include zero). At **1 minute it is not identified**: LAM is +0.130 and +0.176 under alpha = 0 but -0.59 and -0.64 under alpha = 1 (CI excludes zero), and the true alignment lies between them (C1). The sharp CCF peak at lag 0 (rho 0.57 to 0.60 against 0.05 to 0.23 at lag +-1) argues for an offset well under one bin, so "simultaneous within roughly 15 to 30 seconds" is defensible, "no lead down to 1 minute" is not. Also, the full-sample hourly Fed rho (0.84 / 0.85) is a second-half property: on the first 42 days (2026-07-26 to 2026-09-06) hourly rho(0) is 0.015 (hold) and 0.113 (hike), because Polymarket had only 19 and 35 non-zero hourly changes (sd 0.2c) against 124 and 130 on Kalshi; on the last 42 days it is 0.882 and 0.891 (168 and 177 Polymarket changes, sd 1.5c). Quote it as regime-dependent.
* **C5. "Polymarket leads Kalshi only on the BTC basis pair."** Incorrect as stated, in the opposite direction from the researcher's own caution. Unreported cross-venue rungs whose legs were already in the snapshot show the same sign: `PM_BTC_110K -> K_BTC_110K` hourly LAM 0.213 [0.04, 0.38], p_shift 0.004, 5 min LAM 0.128, p 0.002; `PM_BTC_120K -> K_BTC_120K` hourly LAM 0.165 [-0.10, 0.44], p 0.022, 5 min none (p 0.40, only 178/151 changes). The notes also list X05 (Balance of Power) as a BH hit. Stability: the hourly X11 lead is present in both halves (rho(+1) 0.089 and 0.199; rho(0) 0.381 and 0.272) but the 5-minute lead sits in the first 15 days of the 30-day window (5m LAM 0.162 first half, -0.003 second half). Corrected: "Polymarket moves first on the three cross-venue BTC reach rungs available (hourly; 5-minute only on the two liquid ones, concentrated in the earlier half), and weakly on the BoP sweep; it is not a general same-event property."
* **C6. Size of the lead-lag relative to cost.** The economics test holds for exactly one bin. My synthetic test (`vi_econ_synth.py`) shows the rule returns +2.0c gross for a planted 1-bin lead but 0.0 for a planted 2-bin lead, so multi-bin catch-up (which the CCF shows for BTC: Kalshi responds over the next 5 to 60 minutes) is truncated. Re-running the researcher's own `leadlag_econ.run` with `hold` = 1, 3, 6, 12, 24 bins: PM BTC $100k -> Kalshi, hourly grid, theta 2c: gross +0.68c (hold 1), +1.04c (3), +1.10c (6), +1.56c (12), +1.86c (24), n = 71 (overlapping trades, no multiple-testing correction), net -3.36c ... -2.19c. 5-minute grid, theta 2c: gross +0.97c at 12 bins, net -3.18c. PM BTC $90k -> $100k (5 minute, theta 2c): gross up to +0.78c, net -3.18c. Fed +25bp PM -> Kalshi: gross up to +1.27c, t < 1. So conclusions stand (every variant remains net negative) but "15 to 100 times too small" should read "about 2x to 3x too small for the best BTC basis variants with a 12 to 24 bin hold, and more than 10x for one-bin holds"; and "0.03 to 0.7 cent gross" understates what a patient follower could capture (up to about 1.9 cents on the BTC basis).
* **C7. Half-lives.** (a) Instability: OLS hourly half-life by half of the sample, Fed hold 12.3 h (first 42 days) vs 3.2 h (last 42), Fed hike 17.4 h vs 4.8 h, BTC basis 10.5 h vs 6.2 h, Senate 91 h vs 28 h. The 5-minute half-lives are steadier (Fed 1.7/1.1 h, 1.8/1.0 h; BTC 3.5/4.1 h). (b) Measurement-noise bias: the spread is a difference of two quantised, partly stale mid series, which biases the OLS AR(1) coefficient down and the half-life short. Instrumenting with the second lag (s_{t-2}, robust to iid noise) gives Fed hold 9.5 h, Fed hike 11.2 h, BTC basis 11.0 h (hourly) and Fed 2.0 / 2.2 h (5-minute), i.e. 1.3x to 1.6x the OLS values. Simulation (`ve`/inline, 30 draws): true half-life 13.5 h with 0.5c iid noise and 0.5c quantisation is estimated by OLS at 3.9 h, by the IV estimator at 13.5 h. Corrected text: "spread mean-reversion half-lives are hours to about half a day (Fed pairs 6 to 11 h full-sample; 3 to 17 h across sub-windows), OLS values are biased short by quote noise". The trade conclusion (mean-reversion gross +0.2 to +3.1c vs 3.9 to 8.5c cost) is unaffected, and noise would only inflate the gross figure.
* **C8. Unit-test coverage.** The 25 tests are correct as far as they go (and the sign convention is right), but they do not test: (i) the half-life estimator under observation noise/quantisation (T5 uses a clean OU; see C7), (ii) timestamp alignment between venues (cannot be tested synthetically), (iii) the economics function, which I tested myself (planted 1-bin lead recovered exactly as +2.0c gross, net = gross - spread - fees; lag 0 gives no trades; lag 2 gives about 0), which exposed C6. T7 documents rather than fixes the faster-quoter bias: "nearer rung leads" and "Polymarket leads" may partly be quote frequency (PM BTC $90k had 2,532 changes vs 1,372 for $100k; PM BTC $100k 852 vs Kalshi 326 at 5 minutes).

### Bugs and inconsistencies found

* **B1. `pm_halfspread()` fallback (run_study.py lines 212 to 220).** When `snap_bid` is missing it returns 0.01 (a 1-cent half-spread). Resolved control XR2 (`PM_FEDSEP_H0`, `snap_bid` None, `snap_ask` 0.001) therefore uses a 1.0c half-spread while XR1 (0.999 / 1.0) uses 0.05c, contradicting section 3 item 7 ("assumed half-spread of 0.05 cent" for all four controls). Effect (my replication, both variants): with the researcher's behaviour 50.6% / 9.3% / 3.0%; with a consistent 0.05c, 53.7% / 9.4% / 3.1% (XR2 after-spread 22.8% -> 62.8%). Headline fee and hurdle shares are unaffected; the "after spread" mean moves by 3 points. **Not fixed**: a fix changes `tables.md`, `results/*.json` and the reproduce guarantee, and I may not regenerate those. Suggested one-line fix: in the `except` branch return 0.0005 when the leg is marked `resolved`, else 0.01, then re-run `reproduce.sh frozen`.
* **B2. Documentation overstatement.** See C2 (`check_kalshi_locf.json` not identical from the frozen snapshot).
* **B3. Data snooping, not a code bug.** Limitless shift (C3); `valid_to`/`valid_from` windows and the 6-hour burn-in were set after inspecting the data (burn-in disclosed). I tested the burn-in: without it (and without the `valid_to` cut) four pairs show an hour above 1 cent instead of two (L05 6 h, L07 1 h at +12c, L08 5 h, LR2 1 h at +54.5c; the large ones are creation or settlement placeholders), so the "17 of 19" figure depends on the burn-in/validity filters, which the notes do state; the substantive conclusion (violations are rare, short and artifact-prone) is unchanged.
* No look-ahead was found in `locf` (strictly `<=` grid time), in the pairs back-test (z uses data up to t-2), in the hedge split (chronological) or in `leadlag_econ.run` (entry at the bar the leader moved; the only forward information is the up-to-60-second Polymarket timing of C1, which flatters the follower strategy slightly and does not change a negative result).

### NOT FOUND items re-searched

* *Historical Polymarket bid/ask*: re-searched the full path list of the Data API v2 spec (21 routes: activity, holders, leaderboard, oi, positions, prices-history, resolutions, status, tokens, trades, ...) and `docs.polymarket.com/llms.txt` (grep for history / snapshot / spread / candle). Still NOT FOUND. The spec adds that `resolution_seconds` is "the ONLY thing the payload says about provenance, deliberately", which also explains the undocumented in-bucket aggregation.
* *XO usable history*: searched the XO OpenAPI specs (`/prices-history` and `/live-activity/events/{condition_id}` are the only public history-like routes) and probed both; still NOT FOUND (prices-history behaves as the researcher reported; live-activity returned `[]` for the Fed hike market).
* *Kalshi depth behind candle closes*: searched `docs.kalshi.com/llms.txt` for orderbook / depth / history. Only the live book (`/markets/{ticker}/orderbook`, `/markets/orderbooks`) and the authenticated WebSocket `orderbook_delta` exist; no historical depth. Still NOT FOUND.
* *Official Kalshi fee coefficient*: now found indirectly (item 22); the fee-schedule PDF was not retrieved.
* *Limitless finer history*: partly refuted (C3 iv).
* *Second-level timestamps*: Polymarket `/v2/trades` `timestamp` is integer seconds (live sample 1792350015); Kalshi has `GET /markets/trades` and `/historical/trades`; Limitless trades carry milliseconds. A trade-tape lead-lag study at second resolution is feasible for the liquid Fed and BTC legs (not done here, nor by the researcher).

### Findings the researcher missed

1. **Kalshi live/historical partition.** Settled markets and trades before the cutoff (`GET /historical/cutoff`: `market_settled_ts` and `trades_created_ts` = 2026-08-19) are only reachable through `GET /historical/markets/{ticker}/candlesticks` and `/historical/trades`. That gives a large settled-market sample for the survivorship test the notes list as "not tested" (delisted/settled markets), and the aggregation layer must call both tiers.
2. **Unreported pairs in the snapshot.** Cross-venue BTC 110k and 120k reach rungs (legs already downloaded) and an unused `PM_WTI_L85`; adding them strengthens (C5) rather than weakens the BTC conclusion and removes any suspicion that X11 alone was picked for its lead.
3. **Fed series carry maker fees on Kalshi** (`quadratic_with_maker_fees`), and Polymarket's `feeSchedule` has `takerOnly: true, rebateRate: 0.25`; relevant to the untested maker-side question.
4. **Sample composition.** Roughly half of the 84-day hourly sample (the Polymarket 30-minute-tier days) has 5 to 10x fewer Polymarket changes on the Fed legs than the last 6 weeks; pooled correlations and beta are dominated by the post-2026-09-06 regime.

### Reliability

Numbers: high (every re-derived figure matched to the printed precision). Interpretation: medium on the five points C1/C4/C5/C6/C7 above. The decision-relevant conclusions survive: no taker-side edge after frictions in any of the 41 relationships (all 456 follow-the-leader variants and the longer-hold variants I added are net negative except the two resolved-control artifacts), friction attrition of about 90% before capital lock, logical constraints essentially never violated, intra-Kalshi identity as the only net-positive episode source (depth unknown).
