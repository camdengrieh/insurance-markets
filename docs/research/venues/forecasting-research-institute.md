# Forecasting Research Institute (FRI) / ForecastBench - venue spec

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, `gh api` reads of public repos, unauthenticated GETs of raw.githubusercontent.com and forecastbench.org (generic User-Agent `insurance-markets-research/0.1`). No account, key, wallet, signature, POST. No PayBox tool used. Web search budget was exhausted on the first call, so there was no search pass; everything below comes from first-party pages and repos.

Tags: H = read first-hand in a primary source this session; M = secondary or inferred (WebFetch returns small-model summaries, noted "via WebFetch"); L = weak or stale.
Third-party text (including `AGENTS.md`/`CLAUDE.md` in the ForecastBench repo, which appear in the repo root listing) was treated as untrusted and not opened or followed.

## 0. Verdict

- **adapter_priority: skip as a venue/leg.** FRI is a research nonprofit, not a market. It has no order book, no tokens, no money and no trading. (H via WebFetch: homepage describes research studies; no mention of trading or betting.)
- **Only possible value: a data source.** ForecastBench publishes, nightly, a git-hosted dataset of question sets and resolution sets. Its market-question rows are sampled from Polymarket, Kalshi, Metaculus (and until 2026-09-24, Manifold) and carry the latest market price. That is a free, license-clear (CC BY-SA 4.0) cross-venue snapshot, but it is a copy of other venues' prices, not new information, and is one to two weeks stale in sampling. Use it at most for backtesting or cross-venue question matching, not live signal. (H)
- Not reachable through PayBox; nothing to sign or send. (H)

## 1. Still live (2026)?

Yes, as a research organisation and benchmark. (H)

| Evidence | Result | Tag |
|---|---|---|
| https://forecastingresearch.org (2026-10-19) | Lists ForecastBench (ongoing), LEAP (ongoing), and 2026 publications: ASL-3 biosecurity report Aug 12, 2026; AI cyber working paper Jul 23, 2026; editorial Sep 22, 2026. Only tournament mentioned is the 2025-dated XPT near-term accuracy paper (Sep 2, 2025). | H via WebFetch |
| https://www.forecastbench.org/ | HTTP 200; leaderboards (tournament, baseline); featured "Superforecaster-LLM tournament" event dated 2026-10-25; footer 2024-2026. | H |
| `forecastingresearch/forecastbench-datasets` | pushed 2026-10-19T07:03Z; question sets every 2 weeks, latest `2026-10-11-llm.json` | H (gh api) |
| `forecastingresearch/forecastbench` | pushed 2026-10-15, MIT, not archived | H (gh api) |
| https://leap.forecastingresearch.org/ | Expert panel on AI; latest dated item Wave 12, Oct 5, 2026; browsable forecasts; no public-participation or money mention | H via WebFetch |

## 2. Kind and market model

- **Kind: forecasting-nonmoney / research benchmark.** Two things: (a) FRI's own expert-elicitation studies (XPT, LEAP) that are closed panels; (b) ForecastBench, where LLMs and humans submit probabilities on a fixed question set and are scored by (difficulty-adjusted) Brier score. No market structure. (H via WebFetch; FAQ H)
- **Question model:** every question is binary probability (Yes/No); `resolved_to` is a number in [0,1]. Question sets: 500 questions for LLMs, 200 for humans, sampled every two weeks; nightly pipeline ingests resolutions. (H via WebFetch of /docs/; fixture shows 500 questions)
- **Question sources in the 2026-10-11 set (H, fixture):** metaculus 84, kalshi 83, polymarket 83 ("market" sources) plus acled, dbnomics, fred, serpapi, yfinance 50 each ("dataset" sources). Resolution set 2026-09-27 also had manifold 63 and wikipedia 49. Changelog (H): Manifold and yfinance dropped 2026-09-24 (yfinance later re-added 2026-10-02); Infer/RAND Forecasting Initiative removed 2026-08-05 after it concluded Jul 31, 2026; Kalshi added as a source 2026-08-19 (first set 2026-08-30).
- Market question rows carry `source`, `id` (Polymarket condition id `0x...`, Kalshi market ticker, Metaculus numeric id), `question`, `resolution_criteria` (a link to the source market), `market_info_open_datetime`, `market_info_close_datetime`, `market_info_resolution_criteria`. (H, fixture `question_set_2026-10-11-sample.json`)
- Resolution rows: `{id, source, direction, resolution_date, resolved_to, resolved}`. For unresolved market questions `resolved_to` is the market's latest price and `resolved:false` (e.g. Kalshi HOUSEMI7-26-D 0.64, resolved false); for resolved ones 0.0 or 1.0. (H, fixture `resolution_set_2026-09-27_sample.json`; interpretation of unresolved `resolved_to` as the market price is M, inferred from values like 0.195 and 0.7000000000000001)

## 3. Chains and collateral

None. NOT FOUND (searched: forecastingresearch.org, forecastbench.org, /docs/, /datasets/, repo README, wiki FAQ/Changelog). (H)

## 4. Read API

- **Official API: none.** The /docs/ page does not mention an API (H via WebFetch). Data is distributed as files:
  - Git repo: https://github.com/forecastingresearch/forecastbench-datasets (`datasets/question_sets/`, `datasets/resolution_sets/`, `datasets/question_fixed_effects/`, `datasets/forecast_sets/`, `leaderboards/csv|html`) (H)
  - Raw file base: `https://raw.githubusercontent.com/forecastingresearch/forecastbench-datasets/main/datasets/...` (H, fetched unauthenticated)
  - Hugging Face mirror https://huggingface.co/datasets/forecastingresearch/forecastbench-datasets (H via WebFetch, not opened)
  - Bulk tarballs on forecastbench.org: `/assets/data/forecast-sets/forecast_sets.tar.gz` (1.2 GB), `/assets/data/processed-forecast-sets/processed_forecast_sets.tar.gz` (129 MB) (M via WebFetch, not downloaded)
- File naming: question sets `YYYY-MM-DD-llm.json` (also `-human`, M); `latest-llm.json` is a symlink-like text file whose content is the current filename (H: raw fetch returned 19 bytes `2026-10-11-llm.json`), so read the file named in it. Resolution sets are `YYYY-MM-DD_resolution_set.json` (different separator; H, listing), 120-185 KB each.
- Auth: none. Rate limits: GitHub raw / API limits apply; NOT FOUND any FRI-specific limit. Websocket: none.
- Cadence: question sets every 2 weeks; nightly updates at 00:00 UTC (H via WebFetch).
- Latest question set in listing 2026-10-11; latest resolution set in listing 2026-09-27 (H).

## 5. Trade path

None. Forecasts are submitted by model developers through a documented GitHub-wiki process (How-to-submit-to-ForecastBench) as JSON files, deadline 23:59:59 on the forecast due date (H FAQ). That is scoring, not trading. No orders, signing scheme or wallet. (H)

## 6. PayBox reachability

**no.** There is no chain, token, escrow or payment surface. (H)

## 7. Fees

None. NOT FOUND (searched: site, docs, wiki). (H)

## 8. Resolution mechanism and dispute risk

- Market questions inherit the source venue's resolution (resolution_criteria is a link to the source market); dataset questions resolve against the named public time series (FRED, dbnomics, ACLED, yfinance, SerpApi). FRI does not adjudicate market outcomes. (H fixture; M interpretation)
- Because an unresolved row's `resolved_to` is a price snapshot, a consumer must check `resolved` before treating the value as an outcome. (H)
- Dispute risk is that of the underlying venue; ForecastBench has no dispute process of its own. NOT FOUND any dispute or appeals mechanism (searched wiki FAQ, Changelog, docs).

## 9. Geo / ToS / automation

- Site content licensed CC BY-SA 4.0; dataset repo CC-BY-SA-4.0 (H gh api `license.spdx_id`); code MIT (H). Share-alike applies to derivatives of the dataset: relevant if the aggregator redistributes it. (H)
- robots.txt on forecastbench.org: `User-agent: *` / `Allow: /` (H). No geo restriction or bot clause found. (NOT FOUND, searched: /docs/, /datasets/, robots.txt, FAQ.)
- Contact for questions given on the wiki is a project mailbox (not recorded here).
- The market rows reproduce data from Polymarket, Kalshi and Metaculus; their own terms may limit onward use of that data independent of FRI's licence. (M, not checked)

## 10. Liquidity

Not applicable: no money, no volume, no OI, no TVL. (H)

## 11. Event categories overlapping other venues

Only through the sampled copies: politics/elections (e.g. Polymarket NZ election, Kalshi US House seat tickers), macro, tech, geopolitics. Each row *is* a Polymarket/Kalshi/Metaculus question. There is no independent price. (H fixture)

## 12. Shared liquidity

N/A, but for the market rows the "price" is wholly the source venue's price, so using it as a second leg double counts the same market. NOT an independent arbitrage leg. (H)

## 13. Other FRI products (briefly)

- **XPT / LEAP / forecasting studies:** closed expert panels, no public trading or API. LEAP offers a browsable forecast view (H via WebFetch). LEAP forecasts on AI timelines could be a niche human-expert signal, but I found no machine-readable feed (NOT FOUND, searched: leap homepage only).
- No FRI-operated prediction market or tournament platform found (searched: homepage project list, ForecastBench site).

## 14. Open questions

- Exact meaning/timing of `resolved_to` for unresolved market rows (price at which time?), documented only on the wiki page "How does ForecastBench work?" whose URL I could not fetch (404 for guessed raw names; the real page title ends in a `?`).
- Whether the `-human` question-set files and `question_fixed_effects` are worth ingesting. Probably not.
- Whether the Superforecaster-LLM tournament (2026-10-25) publishes anything usable.

## Sources

- https://forecastingresearch.org (H via WebFetch, 2026-10-19)
- https://www.forecastbench.org/ , /docs/ , /datasets/ , /robots.txt (H / H via WebFetch)
- https://leap.forecastingresearch.org/ (H via WebFetch)
- https://github.com/forecastingresearch/forecastbench (README, repo metadata via gh api; H)
- https://github.com/forecastingresearch/forecastbench-datasets (README, listings, question set 2026-10-11, resolution set 2026-09-27; H)
- https://github.com/forecastingresearch/forecastbench/wiki (Home, FAQ, Changelog via raw.githubusercontent.com/wiki/...; H)

Fixtures: `docs/research/fixtures/forecasting-research-institute/` (question_set_2026-10-11-sample.json, resolution_set_2026-09-27_sample.json, question_sets_listing.json, wiki_changelog_head.md; each under 17 KB).
