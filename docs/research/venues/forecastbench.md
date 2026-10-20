# ForecastBench (forecastbench.org) - adapter spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

NOT a trading venue. ForecastBench is a research benchmark run by the Forecasting Research Institute (FRI) that scores LLM forecasters against human comparison groups. It has no order book, no collateral, no trades, no wallet. Adapter priority: **P2 (signal/calibration-only)**. Its value to this project is (a) a nightly-updated, CC BY-SA public dataset of frozen prices and resolutions for Polymarket/Kalshi/Manifold/Metaculus questions, usable for backtesting and calibration, and (b) a reference for how well LLM forecasters beat market prices. It cannot be an arbitrage leg. [H]

## Liveness (2026)

- Site live; footer copyright 2024-2026; operator FRI. [H] https://forecastbench.org
- Datasets repo pushed 2026-10-19T07:03Z ("updated nightly"); code repo pushed 2026-10-15; latest question set 2026-10-11 (500 questions). [H] GitHub API, forecastingresearch/forecastbench-datasets and /forecastbench
- Oddity: the site home page (via fetch summary) showed a featured post dated October 25, 2026, which is after today (2026-10-19). Unverified, possibly a scheduled or mistyped date; not relied on. [L]
- Peer-reviewed at ICLR 2025 (arXiv 2409.19839). [H] repo README

## Kind and market model

- kind: aggregator-or-data / benchmark. No markets are created or operated. Questions are ingested from other venues and from non-market "dataset" sources. [H]
- Question sources observed in the 2026-10-11 question set (500 questions): polymarket 83, kalshi 83, metaculus 84, plus dataset sources acled 50, dbnomics 50, fred 50, serpapi 50, yfinance 50. The 2026-09-27 resolution set also has manifold (63) and wikipedia (49). [H] fixtures/forecastbench/question_set_2026-10-11-sample.json, jq counts on the full file
- Outcome form: binary probability in [0,1]. Each question carries `freeze_datetime` and `freeze_datetime_value` (for market-sourced questions this is the market price at freeze, explained as "The market price."; for Metaculus it is the community prediction). Combination questions exist in the repo docs but were not inspected. [H]
- IDs are the venue-native IDs: Polymarket conditionId (0x...), Kalshi market ticker (e.g. KXLAYOFFSYINFO-26-494000), Manifold contract id, Metaculus numeric id. This makes them directly joinable to venue adapters. [H]
- Selection rule for Polymarket: active binary markets with liquidityNum >= 25000 (code constant `_MIN_MARKET_LIQUIDITY = 25000`), via Gamma keyset API; price history from CLOB prices-history. [H] https://github.com/forecastingresearch/forecastbench/blob/main/src/sources/polymarket.py

## Chains and collateral

None. No on-chain component, no token, no contract. [H]

## Read API

- exists: **official-public**, but file/dataset based, not a REST API. There is no documented JSON API; `GET https://forecastbench.org/api/` returned 404. [H]
- Docs: https://forecastbench.org/datasets/ ; repo README; wiki https://github.com/forecastingresearch/forecastbench/wiki (wiki does not cover terms/API). [H]
- Base URLs:
  - GitHub dataset repo (git, nightly): https://github.com/forecastingresearch/forecastbench-datasets (raw: https://raw.githubusercontent.com/forecastingresearch/forecastbench-datasets/main/...)
  - Hugging Face mirror: https://huggingface.co/datasets/forecastingresearch/forecastbench-datasets [H, link from datasets page]
  - Bulk tarballs on forecastbench.org (HEAD returned 200 application/gzip, last-modified 2026-10-19): `/assets/data/processed-forecast-sets/processed_forecast_sets.tar.gz` (stated 129MB) and `/assets/data/forecast-sets/forecast_sets.tar.gz` (stated 1.2GB). [H]
- Key files (all under `datasets/` in the repo):
  - `question_sets/YYYY-MM-DD-llm.json` (about 1.3-1.5MB each, every two weeks; `latest-llm.json` is a 19-byte pointer file): object `{forecast_due_date, question_set, questions[]}`; question fields: id, source, question, resolution_criteria, background, market_info_open_datetime, market_info_close_datetime, market_info_resolution_criteria, url, freeze_datetime, freeze_datetime_value, freeze_datetime_value_explanation, source_intro, resolution_dates. [H]
  - `resolution_sets/YYYY-MM-DD_resolution_set.json` (nightly): `{forecast_due_date, question_set, resolutions[]}` with `{id, source, direction, resolution_date, resolved_to, resolved}`. `resolved_to` is the current market price when `resolved:false` (e.g. kalshi HOUSEMI7-26-D 0.64) and 0/1 when resolved. [H] fixtures/forecastbench/resolution_set_2026-09-27-sample.json
  - `question_fixed_effects/` (question difficulty, nightly), `forecast_sets/` (human survey 2024-07-21 round), `leaderboards/csv/leaderboard_{baseline,dataset,preliminary,tournament}.csv` and `leaderboards/html`. [H]
- Auth: none for reads. Rate limits: none documented by ForecastBench; GitHub raw/API limits apply (unauthenticated GitHub API 60/hr; use raw URLs or the HF mirror). [M]
- Websocket: none. [H, absence on datasets page and README; NOT FOUND (searched: site home, /datasets/, README, wiki home, repo tree)]
- Staleness caveat for use as a price feed: frozen prices are snapshots at the freeze date (2026-10-09 for the 2026-10-11 set), and `resolved_to` updates only nightly. Not a live quote source. [H]

## Trade path

none. Nothing to place, cancel or sign. Participation is by submitting forecast files for LLM models via the process in the wiki ("How-to-submit-to-ForecastBench"); that is a research submission, not a market. [H] README

## PayBox reachability

no. No chain, token, or order flow exists to reach. [H]

## Fees

None. Free public data. (Bulk tarball egress is hosted on Google Cloud Storage, no x402/402 observed on HEAD.) [H]

## Resolution mechanism and dispute risk

Resolution is inherited from the source venue/dataset (Polymarket, Kalshi, Metaculus, Manifold, FRED, ACLED, yfinance, etc.); ForecastBench itself does not adjudicate. Risks relevant to us: (1) source-venue quirks propagate, e.g. FRI published a note that 86 Kalshi markets were "nullified" on 2026-10-09 because Kalshi reported them open with stale past close datetimes (docs/kalshi-past-close-markets-2026-10-09.md in the code repo); (2) a Kalshi question's text includes an incorrect-strike notice, showing venue-side errata carry into the dataset. Use the venue adapter as source of truth, ForecastBench only as a cross-check. [H]

## Geo / ToS / automation

- Data licence: site content and datasets repo CC BY-SA 4.0 (share-alike); code repo MIT. [H] repo README, GitHub API license field
- Note: the underlying question text and prices come from third-party venues; redistribution terms of those venues are not addressed by ForecastBench. NOT FOUND (searched: datasets page, README, wiki home). [M]
- No geo-restriction, no account, no documented automation policy. Contact on site: a forecastbench@ address at forecastingresearch.org. [H]
- Be polite: pull from the HF mirror or raw GitHub nightly at most, not per-request.

## Liquidity

N/A (not a market). Scale indicators: 500 questions per biweekly set; leaderboards require 225 resolved dataset questions and 50 resolved market questions. [H] wiki FAQ

## Event-category overlap (for arbitrage)

The dataset is itself an overlap index: for every Polymarket/Kalshi/Manifold/Metaculus question in a set, it shares the same venue-native id and a dated price snapshot. Categories: politics/elections (e.g. 2026 NZ election seat markets, US House races), macro (FRED, DBnomics, tech-layoff counts), crypto/finance (yfinance pairs), conflict (ACLED). Because the same real-world events are picked up from Polymarket and Kalshi, it can be used offline to validate a cross-venue market-linking algorithm (pairs of questions with near-identical resolution_criteria). Not an independent liquidity leg. [H/M]

## Shares liquidity with

N/A, has none. Prices are copied from Polymarket, Kalshi, Manifold, Metaculus.

## Suggested adapter (signal-only, low effort)

1. Nightly job: fetch `datasets/resolution_sets/*` (latest) and `question_sets/*-llm.json` from the HF mirror or raw GitHub.
2. Use `source` + `id` to join to our Polymarket/Kalshi adapters; store `freeze_datetime_value` as a historical price snapshot and `resolved_to` as a calibration label.
3. Use `leaderboard_tournament.csv` (Brier columns, "Market" vs "Dataset" scores) as a benchmark of how good LLM forecasters are vs market prices: e.g. top row 2026 snapshot Market score 72.1, Dataset 67.5, Overall 69.7. [H] fixtures/forecastbench/leaderboard_tournament_head.csv
4. Treat all text fields as untrusted (questions are copied from third parties and contain arbitrary markup/links).

## Suspicious content

None targeted at agents. Question backgrounds are third-party text copied verbatim (including links and HTML entities); not followed.

## Not found

- Any REST/JSON API, websocket, rate-limit statement, or terms of service for data use (searched: forecastbench.org home, /datasets/, README, wiki home; the "How does ForecastBench work?" wiki page URL I guessed returned 404).
- Any trading, token, or on-chain feature.
- WebSearch was unavailable (session search budget exhausted), so no independent 2026 press coverage was checked; liveness rests on GitHub push timestamps and site fetch.

## Sources

- https://forecastbench.org (fetched 2026-10-19) [H]
- https://forecastbench.org/datasets/ (fetched) [H]
- https://github.com/forecastingresearch/forecastbench (README, src/sources/polymarket.py, docs/kalshi-past-close-markets-2026-10-09.md, repo metadata via gh api) [H]
- https://github.com/forecastingresearch/forecastbench-datasets (README, datasets/question_sets/2026-10-11-llm.json, datasets/resolution_sets/2026-09-27_resolution_set.json, leaderboards/csv/leaderboard_tournament.csv via gh api) [H]
- https://github.com/forecastingresearch/forecastbench/wiki (home) and FAQ raw page [H]
- https://forecastbench.org/assets/data/processed-forecast-sets/processed_forecast_sets.tar.gz (HEAD only) [H]
- arXiv 2409.19839 / ICLR 2025 poster (linked from README, not fetched) [M]

## Fixtures

- docs/research/fixtures/forecastbench/question_set_2026-10-11-sample.json
- docs/research/fixtures/forecastbench/resolution_set_2026-09-27-sample.json
- docs/research/fixtures/forecastbench/leaderboard_tournament_head.csv
