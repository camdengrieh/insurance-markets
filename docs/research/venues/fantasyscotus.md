# FantasySCOTUS - venue spec (2026-10-19)

Adapter priority: **P2** (signal-only). Not a market, no money, no tradeable price.

## Summary
- [H] Free, non-money Supreme Court prediction contest at https://fantasyscotus.net ("100% FREE", prizes only for the Elect League; rules say "No cash prizes will be awarded"). Operated under "Josh Blackman LLC" (footer; copyright text still reads 2014-2019).
- [H] Live on 2026-10-19: header shows Term 2026; 25 OT2026 cases listed (id 909-934), arguments 2026-10-05 through 2026-12-09, plus 5 undated cases. Oct 5-14 cases are already argued but undecided; Nov 2-10 cases are upcoming.
- [H] Users predict AFFIRM/REVERSE/RECUSE per justice (and a case outcome); predictions editable until decision day (generally 10:00 AM ET). Scoring: 10 points per correct justice vote, +10 for case outcome.
- Value to the aggregator: a crowd + "Marshall+" algorithmic legal-outcome signal for SCOTUS cases that could be compared to Polymarket/Kalshi SCOTUS markets. Not an arbitrage leg.

## Market model
- [H] Not a market. No prices, no order book, no AMM, no tokens. Each user submits a vote vector (9 justices x A/R/recuse + overall outcome). "Price" would be derived by the adapter: share of crowd predicting affirm (see Metaforecast approach).
- [H] Metaforecast's fantasyscotus.ts derives P(affirm) = (#users with percent_affirm > 50) / (#users), titled "In <case>, the SCOTUS will affirm the lower court's decision". That is a headcount of majority-affirm voters, not a calibrated probability.
- Site page also shows a per-justice crowd % and a "{Marshall}+ Algorithmic Prediction" column [H].

## Chains / collateral
None. No wallet, no on-chain component [H].

## Read API
- [H] No official API: no /api/, /swagger/, /robots.txt (all 404); Terms do not mention an API. exists = unofficial-only.
- [H] Unofficial JSON endpoints used by the site's own jqWidgets grids (unauthenticated GET, `Content-Type: application/json`, no auth, no rate-limit headers seen). Base URL `https://fantasyscotus.net`.
  - `GET /case/list/?filterscount=0&groupscount=0&pagenum=0&pagesize=20&recordstartindex=0&recordendindex=12` -> `{object_list:[...25 cases], stats:{...}}`. Case fields: `id, docket_number, short_name, date_argued, date_decided, prediction ("Reverse 5-3" = crowd consensus outcome + justice split), outcome, accuracy, m_accuracy, predicted, docket_url, stats_url`. `accuracy == ""` means undecided. Observed: pagesize had no effect, all 25 current-term cases returned. Fixture: docs/research/fixtures/fantasyscotus/case-list.json. [H]
  - `GET /user-predictions/case/<slug>/?pagenum=0&pagesize=1000` -> JSON array, one row per forecaster: `username, 1..13 (justice id -> "A"/"R"/""), affirm, reverse, percent_affirm, outcome ("A"/"R"/null), created_date, points`. Without paging params it returned all rows (44 for Suncor, id 909: 27 R / 16 A / 1 null). Note the Metaforecast URL has the form `/user-predictions` + docket_url (i.e. `/user-predictions/case/<slug>/`). Fixture (usernames redacted): docs/research/fixtures/fantasyscotus/user-predictions-sample.json. [H]
  - HTML per-case page `/case-prediction/<slug>/` shows aggregate per-justice crowd % and the {Marshall}+ prediction (server-rendered). [H]
- [H] Endpoints return public usernames of individual forecasters: treat as personal data, do not store usernames.
- No websocket [H as far as page source shows; NOT FOUND in HTML]. Page is old stack (jQuery 1.10, Django-like, nginx 1.10.3) - fragile, endpoints could change without notice [M].
- Metaforecast source (https://github.com/quantified-uncertainty/metaforecast/blob/master/src/backend/platforms/fantasyscotus.ts) confirms the same two endpoints [H, read via gh api]. It sends a spoofed browser User-Agent; I did not. Whether metaforecast still runs it in 2026: NOT FOUND (not checked).

## Trade path
None. No orders, no signing, no money [H]. Only a logged-in web form for human predictions (account sign-up required; not tested, not done).

## PayBox reachability
No. Nothing to trade; no on-chain or x402 surface.

## Fees
None [H]. Free to enter.

## Resolution
- [H] Resolution = actual SCOTUS decision; per-justice scoring. Edge cases (DIG, equally-divided, vacate and remand) earn no points; split decisions decided by a sponsor-appointed panel whose decision is final (rules page). That differs from how Polymarket/Kalshi would define "affirm"/"reverse", so mapping risk is high for cross-venue linking.
- Rules page text is stale: it references "October 2017 Term" and contest dates Oct 7, 2019 - Jul 1, 2020 [H, stale].

## Geo / ToS / automation
- Terms (effective 2019-10-07, [L] stale): restrict obtaining site materials "through any means, programmatic or otherwise" without written consent; no modify/derive; no overburdening; content for personal use only, prediction data is owned by the operator. Scraping is therefore not clearly permitted; an adapter would need written permission or low-frequency polling at own risk. Operated from USA, Texas law. Prizes only for US citizens/residents, 18+.

## Liquidity
- No volume/OI/TVL concept. Participation size: site says "thousands" of users overall [H]; observed 44 forecasters on Suncor (arg. 2026-10-05) on 2026-10-19 [H]. Thin sample -> noisy signal.
- Historical accuracy stats are zeroed for the new term; no 2026 accuracy figure found. WebSearch budget was exhausted, so no independent 2026 coverage was checked (NOT FOUND, searched: none possible).

## Event overlap / arbitrage
- Categories: US Supreme Court case outcomes only. Overlaps only with SCOTUS-case markets on Polymarket / Kalshi / others (outcome-of-case markets, e.g. tariff-type or high-profile cases) - which are a different venue class. Use as a prior/signal for linked markets, not as a leg. Share of cases with a matching market: NOT FOUND (not researched here).
- Shared liquidity: none (independent, no money).

## Adapter notes (if built)
- Poll /case/list/ every few hours, then /user-predictions/case/<slug>/ for undecided cases (accuracy == ""); emit signal: crowd P(affirm), n forecasters, justice-level votes, `prediction` consensus string. Cache heavily; identify with generic UA; seek operator permission first (ToS).

## Open questions
- Does the operator permit programmatic access? (ToS ambiguous/stale.)
- How are the {Marshall}+ algorithmic prediction values exposed (HTML only?).
- Is the case-outcome field ("A"/"R") the same as majority of justices?

## Sources
- https://fantasyscotus.net (home, Term 2026) [H]
- https://fantasyscotus.net/rules/ [H, stale text]
- https://fantasyscotus.net/terms/ [H, effective 2019-10-07]
- https://fantasyscotus.net/case/list/ (JSON via XHR) [H]
- https://fantasyscotus.net/user-predictions/case/suncor-energy-inc-v-county-commissioners-of-boulder-county/ (JSON) [H]
- https://fantasyscotus.net/case-prediction/suncor-energy-inc-v-county-commissioners-of-boulder-county/ [H]
- https://github.com/quantified-uncertainty/metaforecast (src/backend/platforms/fantasyscotus.ts) [H]
