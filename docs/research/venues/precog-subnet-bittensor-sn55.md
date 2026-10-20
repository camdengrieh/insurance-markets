# Precog Subnet (Bittensor SN55, Coin Metrics) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: doc reads, `gh api` file reads, WebFetch page reads, and unauthenticated GETs to documented hosts. No account, wallet, key, signature, POST/PUT/DELETE or money-moving PayBox tool was used (one read-only PayBox `discover_tokens mode=chains` call). Third-party pages were treated as untrusted data; nothing in them was followed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each well under 50 KB): `docs/research/fixtures/precog-subnet-bittensor-sn55/` (listed in section 12).

Not to be confused with **Precog Markets** (Base/Arbitrum AMM prediction market, `docs/research/venues/precog-markets.md`). Different product, different company.

---

## 0. Bottom line

1. **Not a market, never was.** Precog is a Bittensor subnet where miners submit BTC (later BTC/ETH/TAO) price forecasts and validators score them against Coin Metrics reference rates. There is no order book, no AMM, no outcome token, no trading, no settlement of user money. (H, repo README and source.)
2. **It no longer looks live as "Precog on SN55".** As of 2026-10-19, three independent Bittensor aggregator pages (taostats, taomarketcap, subnetalpha) show **netuid 55 = NIOME** (a genomic-data subnet), and NIOME's own repo calls itself "Bittensor Subnet(SN55)". Precog's repo says "Mainnet UID: 55" but its last commit is **2025-10-07** (v3.0.0), and Coin Metrics' own end-user API repo carries a **"Precog API is currently not supported"** notice (2025-12-08). The Precog API host answers **HTTP 503** on every path I tried. (All H, section 1.) I did **not** find a Coin Metrics statement of sunset or migration, and I could not find the date SN55 changed hands (section 1).
3. **Even when it ran, the output was not exposed publicly.** The forecast API needed a Bittensor wallet challenge-signature plus a minimum alpha stake on SN55 (H, client source). So it was never a free signal feed for an aggregator.
4. **adapter_priority = skip.** Dead or at best dormant, no usable API, no tradable surface, and the only overlap with other venues (short-horizon crypto price) is better served by a plain price oracle. Side note for the crypto-price leg of the scanner: Coin Metrics' **Community API** serves reference rates with no key (section 6b, fixture), which is a useful fair-value anchor for BTC/ETH price-threshold markets. That is a data source, not this venue.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Launch | Coin Metrics announced Precog on 2025-01-14 with Yuma (DCG subsidiary); repo release `1.0.0` "Release to mainnet" 2025-01-14 (https://github.com/coinmetrics/precog `docs/Release Notes.md`; announcement via search snippet of https://coinmetrics.io/company-news/precog-coin-metrics-bittensor-subnet/, which now 301-redirects to https://www.talos.com/insights, a listing page that does not mention Precog) | H (release notes), M (announcement text; page no longer served) |
| Repo activity | `coinmetrics/precog` default branch `master`, last push **2025-10-07**, latest release **v3.0.0 (2025-10-07)**; `dev` branch last commit the same day; 2 open issues (one is a user asking about "immune miner status", 2025-08-26, no reply). GitHub `updated_at` 2026-01-05 is metadata, not code. (`gh api repos/coinmetrics/precog`, `.../commits`, `.../releases`) | H |
| Roughly 12 months with no commit | Stale. | H |
| Consumer API repo | `coinmetrics/precog-api-utility` ("Documentation for end-users to utilize Subnet 55 API"), last push **2025-12-08**, commit "Add notice about Precog API support status". README top: "The Precog API is currently not supported. Breaking changes in the Subnet Incentive and later changes in the backend infrastructure require coordination between different teams to bring it back and they are currently blocked with other tasks." | H |
| API host health | `GET https://precog-api.coinmetrics.io/`, `/docs`, `/openapi.json` all returned **HTTP 503** (Cloudflare edge, `openresty` / APISIX gateway body "503 Service Temporarily Unavailable") on 2026-10-19 02:37 GMT. Gateway answers, no upstream behind it. (fixtures `precog-api-root-503.txt`, `precog-api-docs-503.txt`) | H |
| **Netuid 55 now belongs to NIOME** | taostats.io/subnets/55 header: "SN55 - NIOME"; taomarketcap.com/subnets/55: "Subnet 55 (NIOME) ... a decentralized AI subnet that enables privacy-safe genomic intelligence"; fetching subnetalpha.ai/subnet/precog/ returned the NIOME page (navigation: previous subnet "Yanez", next "Gradients"; no separate Precog page found); NIOME repo `genomesio/subnet-niome-v2` README line 1: "NIOME : Bittensor Subnet(SN55) for Privacy-Safe Genomic Inteligence" (last push 2026-07-30). subnetalpha says NIOME public testnet launched "Q1 2026" and mainnet alpha emissions for SN55 "went live shortly thereafter"; whitepaper v1.1 Feb 2026. All of this is page content read via WebFetch summaries plus the raw README line. | H (README line, taostats/taomarketcap headers), M (subnetalpha dates) |
| How a netuid changes hands | Bittensor BIT-0004 "Subnet Deregistration" (Status: Final, updated 2026-04-13) re-enables pruning: when the subnet limit (128) is reached and a new subnet registers, the non-immune subnet with the lowest moving alpha price is deregistered. So a low-price Precog subnet being pruned and netuid 55 being re-registered is consistent with the mechanism, but **I found no source naming Precog as pruned** and no date. (https://github.com/opentensor/bits `bits/BIT-0004-subnet-deregistration.md`) | H (BIT text), L (inference that Precog was pruned) |
| "Active" claim in the discovery source | SoK supplementary catalogue lists "Precog Subnet ... Bittensor (Subnet 55) ... Active ... no order book" (`protocol_catalogue_verification.csv` line 29, repo pushed 2026-07-04). It cites only the 2025-01 Coin Metrics announcement, so it does not show 2026 liveness. | H (what the CSV says), L (as evidence of liveness) |
| Coin Metrics corporate state | coinmetrics.io pages now redirect to talos.com; talos.com/insights lists "Talos's Coin Metrics Data" articles (2026-09-08, 2026-06-17) and no Precog/Bittensor item. Substack archive shows 2026 issues (latest 2026-10-13) with no Precog mention. | M |

Verdict: **still_live = false** for the thing the discovery label describes (a Precog forecast subnet on SN55 that a consumer can read). Residual uncertainty: Precog could in principle run under another netuid or be dormant-but-registered; I found no evidence of either (NOT FOUND, searched: taostats, taomarketcap, subnetalpha, GitHub `coinmetrics` org, GitHub repo search "precog subnet"; web search was unavailable, its session budget was exhausted).

---

## 2. Kind and market model

- **Kind (H):** AI forecasting subnet, "forecasting-nonmoney". Miners run a model and answer validator queries; validators score and set on-chain weights; TAO/alpha emissions flow to good forecasters. README: "an arena to identify the analysts with the best strategies and information to anticipate Bitcoin price movements" (https://github.com/coinmetrics/precog).
- **Query/response (H, `precog/protocol.py`):** a Bittensor `Synapse` called `Challenge` with `timestamp`, `assets` (default `["btc"]`, up to `btc`, `eth`, `tao_bittensor`), and miner outputs `predictions: Dict[asset, float]` and `intervals: Dict[asset, [min, max]]`.
- **What is forecast (H, README + `constants/__init__.py`, v3.0.0):** every `PREDICTION_INTERVAL_MINUTES = 5` minutes, for each asset, (a) a **point estimate** of the USD price 1 hour ahead (`PREDICTION_FUTURE_HOURS = 1`) and (b) an **interval** [min, max] that the price will trade within over the next hour. Scoring uses a rolling `EVALUATION_WINDOW_HOURS = 6`. v3.0.0 (2025-10-07) added ETH and TAO with equal task weights (`0.166` per asset per task type).
- **Market model:** none. Not binary/categorical/scalar in the contract sense, no order book, no AMM, no parimutuel, no outcome tokens. The "outcome" is a real-valued price forecast. The SoK classification calls it "Distributional" (point + interval), consistent with the code.
- **Output as a signal:** a point forecast plus an interval is a (crude) distribution for BTC/ETH/TAO 1h-ahead price. It is not a probability for any binary event, so mapping it onto a "BTC above X at time T" market needs a model (e.g. treat interval as a ~quantile range) that Precog does not provide. (M, my inference.)

---

## 3. Chains and collateral

- **Chain (H):** Bittensor mainnet ("finney"), subnet `netuid 55`; testnet netuid 256 (README). Substrate-based Subtensor chain with its own keypairs (coldkey/hotkey). Value token: TAO, with per-subnet "alpha" tokens since dTAO (README and API-access guide refer to staking "Alpha" on SN55).
- **Collateral for a "trade":** none, because there are no trades. Participation costs are miner/validator registration burn and, for API access, an alpha stake (section 4). Amounts: NOT FOUND (the client says run `precog requirements`, which needs the dead API).
- **EVM/Solana presence:** none found (NOT FOUND, searched: repo tree, README, API client).

---

## 4. Read API

**Official docs / sources**
- Subnet design and incentive: https://github.com/coinmetrics/precog (README, `precog/validators/reward.py`, `docs/Release Notes.md`). The README points to `https://docs.coinmetrics.io/bittensor/precog-methodology`, which now returns a **404** (WebFetch 2026-10-19). (H)
- Consumer client: https://github.com/coinmetrics/precog-api-utility (README + `precog_api/client.py`, `precog_api/auth.py`). Swagger was advertised at `https://precog-api.coinmetrics.io/docs`, which now returns 503. (H)

**Base URL (documented):** `https://precog-api.coinmetrics.io` (README `API_URL` example). Status 2026-10-19: **503 on `/`, `/docs`, `/openapi.json`**. (H)

**Endpoints (from client source, H; NOT live-verifiable):**
- `GET /auth/challenge` -> `{challenge_id, challenge_text}`; the client signs `challenge_text` with the user's Bittensor **coldkey** and `POST /auth/authenticate {challenge_id, signature(hex)}`; `POST /auth/refresh {refresh_token}`.
- `GET /predictions/recent` (params: `limit`, `asset_type` in BTC/ETH/TAO, pagination)
- `GET /predictions/recent/uid/{miner_uid}`
- `GET /predictions/recent/hotkey/{miner_hotkey}`
- `GET /predictions/historical` (+ `/uid/{uid}`, `/hotkey/{hotkey}`; `start_date`, `end_date`, `page`, `page_size`)
- Response schemas: NOT FOUND (the Swagger page is down; the client returns `predictions['count']` and a list, nothing else is documented).

**Auth (H):** Bittensor-wallet challenge/response, short-lived access token + refresh token, and a **minimum alpha stake on SN55** ("To gain access to the Precog API, you must stake Alpha to a hotkey on subnet 55"). Not usable by an automated, wallet-less aggregator without custody of a Bittensor coldkey that holds stake. Terms: "the same terms as our Coin Metrics Community Data: https://coinmetrics.io/terms-of-use/", which now redirects to a Talos marketing page; the actual terms text was NOT FOUND (see 8).

**Rate limits / websocket:** NOT FOUND for the Precog API (searched: README, client, Swagger unreachable). No websocket documented.

**Alternative read path (on-chain / subnet-level):** Bittensor metagraph and weights (who ranks well) are readable via Subtensor RPC or aggregators such as taostats, but taostats' API needs a key (`GET https://api.taostats.io/api/subnet/latest/v1?netuid=55` -> 401 "Authorization Token is missing", fixture). Raw miner forecasts are exchanged peer-to-peer between validators and miners over Bittensor axons and logged to Weights & Biases (project `yumaai`, validators only; `WANDB_PROJECT` in constants); neither is a public consumer feed. (H for the constant and the 401, M for the characterisation.) Subtensor JSON-RPC is POST-based, so I did not call it.

---

## 5. Trade path

**None.** There is no order, bet, position or settlement object a user can create against Precog. (H.) The only "write" actions are subnet operations: register a miner/validator hotkey, stake alpha, submit forecasts (miner), set weights (validator), all via Bittensor wallet signatures (`btcli`, `make register`, `make miner`, README).

**PayBox reachability: no.** The live PayBox chain catalog (`discover_tokens mode=chains`, 2026-10-19) has 11 chains: Solana, Ethereum (1), Base (8453), Arbitrum (42161), OP (10), Polygon (137), BNB Smart Chain (56), Avalanche (43114), Robinhood (4663), Arc (5042), Hyperliquid (999). A `query=bittensor` search of the catalog returned 0 chains. Bittensor's native chain uses SS58/sr25519 keys, which PayBox's EVM/Solana signing does not cover; even on an EVM-compatible Bittensor layer (not verified here) there is nothing to trade. (H for catalog, M for the rest; catalog is "not a support allowlist" per the tool's own notice.)

---

## 6. Fees

- **Trading fees:** n/a (no trading).
- **Subnet economics (H, README/release notes):** emissions (TAO/alpha) to miners/validators; reward is rank-based with `decay = 0.8` over ranked miners (code), moving-average `alpha = 0.05` (release 2.5.3); miner "immunity" after registration (the open issue refers to it). Registration burn, validator take, owner cut: NOT FOUND (searched: repo; requires chain/taostats data).
- **API access cost:** a minimum alpha stake on SN55 (amount NOT FOUND; section 4).

### 6b. Truth source and a useful side feed (not Precog itself)
The scoring truth is the **Coin Metrics Reference Rate** at 1s frequency (`CM_ReferenceRate`, `precog/utils/cm_data.py`, H). Coin Metrics' Community API serves it unauthenticated:
`GET https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=ReferenceRateUSD&frequency=1h&limit_per_asset=3&paging_from=end` returned HTTP 200 on 2026-10-19 with `{"data":[{"asset":"btc","time":"2026-10-19T02:00:00.000000000Z","ReferenceRateUSD":"82384.5109131648"}, ...]}` (BTC about $82.4k). Response headers: `x-ratelimit-plan: download`, `x-ratelimit-limit: 6000, 6000;w=20;comment="sliding window"`. Community-tier coverage of frequencies (1s/1m/1h/1d), history depth and licence for commercial use: NOT FOUND (the terms page redirects to a Talos marketing page). (H for shape and limit header; fixtures `coinmetrics-community-reference-rate-*.{json,txt}`.)

---

## 7. Resolution mechanism and dispute risk

- **Scoring (H, `reward.py` + `constants`):** for each miner, asset and prediction time: point error = `|prediction - actual| / actual` vs the CM reference rate at the target time (missing/invalid -> `inf`); interval score = `inclusion_factor * width_factor`, where `inclusion_factor` = share of the hour's 1s prices inside the miner's [min, max] and `width_factor` = (effective range covered) / (predicted range) (rewards tight intervals that still contain the price). Miners are ranked per task (`{asset}_point`, `{asset}_interval`), rank -> weight with decay `0.8`, tasks weighted equally (`0.166` each, 6 tasks), then smoothed by a moving average.
- **Who decides:** Coin Metrics' price data (centralised, trusted) and validators' code (auto-updating from GitHub by default, README), then Bittensor's Yuma consensus. No user funds are at stake, so "dispute" means incentive gaming (e.g. copying other miners, the "top 20 miners" averaging in the Coin Metrics simulation), not payout disputes.
- **Track record (M):** Coin Metrics' own simulated-trading study (State of the Network #308, 2025-04-22) averaged the top 20 miners' BTC point forecast and ran a $1-per-5-min buy/sell rule; it reported gains over 1-24 March 2025 and a mixed April; it is self-published and short-window. Treat any claim of predictive edge as unproven. (https://coinmetrics.substack.com/p/state-of-the-network-issue-308, fetched 2026-10-19, page summary, M; older than 6 months, possibly stale.)

---

## 8. Geo / ToS / automation

- Precog API terms point to Coin Metrics' terms of use, which now redirect (301) to https://www.talos.com/our-solutions/data/overview, not a terms document. Terms text: NOT FOUND (searched: coinmetrics.io/terms-of-use, repo README). The repo code is MIT licensed (H, GitHub licence field). Geo-blocking for the API: NOT FOUND.
- Bittensor itself is permissionless; participation requires a funded wallet and acceptance of the chain's own risks. No geo restriction found for the protocol (NOT FOUND, not exhaustively searched).
- Automation: the API was designed for programmatic clients (the Python client with auto token refresh) but is currently unsupported (section 1).

---

## 9. Liquidity

Not applicable: no order book, pool or open interest. Reference points for completeness:
- SN55 alpha price shown on taostats header: "0.0021" with no label and no date (taostats.io/subnets/55, fetched 2026-10-19), **and that is now NIOME's subnet, not Precog's**. Do not read it as Precog liquidity. (M/L)
- Precog-era TAO staked / market cap: NOT FOUND (the only dated datapoint is Coin Metrics' April 2025 remark that stake had "more than tripled" since its research report, M, stale).
- TVL / volume / OI: none applicable. I did not check DefiLlama or other TVL trackers for a Precog subnet entry.

---

## 10. Event-category overlap and arbitrage relevance

- Asset coverage: BTC, ETH, TAO price 1 hour ahead (point + range), nothing else (H).
- Overlap with other venues: crypto-price markets only (e.g. "BTC above X at T" on Polymarket, Kalshi, Limitless, Predict.fun, Myriad, Opinion). Horizon 1h and 5-minute refresh could in theory support intraday fair-value signals, but: (a) the feed is gone/unsupported, (b) forecasts are point+interval, not calibrated event probabilities, (c) a direct price oracle (section 6b) gives the same anchor with lower noise.
- Sports, politics, macro: no overlap.
- **Shared liquidity:** none (no liquidity). Not an independent arbitrage leg because it is not a leg at all.

---

## 11. Adapter recommendation

- **adapter_priority: skip.**
- Rationale: SN55 is now NIOME; Precog's own API is "not supported" and returns 503; last code commit 2025-10-07; nothing tradable; any revived feed would still need a Bittensor wallet with SN55 stake; and the signal is a price forecast, not an event probability.
- If the project later wants a crypto-price anchor: use a **price-oracle adapter** (Coin Metrics Community API `ReferenceRateUSD`, no key, 6000 req / 20 s sliding window per header), not a Precog adapter. Licence for redistribution must be checked first (terms NOT FOUND).
- Re-check trigger: a Coin Metrics/Talos announcement that Precog relaunches under a netuid, or `precog-api.coinmetrics.io/docs` returning 200.

---

## 12. Fixtures

In `docs/research/fixtures/precog-subnet-bittensor-sn55/`:
- `precog-api-root-503.txt`, `precog-api-docs-503.txt` - headers + body of the 503 from the Precog API host (2026-10-19).
- `coinmetrics-community-reference-rate-btc-1h.json` - real 200 response (BTC ReferenceRateUSD, 3 hourly points).
- `coinmetrics-community-reference-rate-response-headers.txt` - rate-limit headers of that response.
- `taostats-api-subnet55-401.json` - taostats API needs a key.
- `github-coinmetrics-precog-repo-meta.json` - trimmed repo metadata (last push 2025-10-07, MIT).
- `precog-constants-v3.0.0.py` - subnet constants from the repo (assets, windows, task weights).

No fixture of a Precog forecast exists because the API is down and needs wallet auth.

---

## 13. Open questions

1. When was Precog removed from netuid 55 and was it pruned or voluntarily deregistered? (Needs chain history or taostats subnet-registration history; the taostats tabs are JS-rendered and returned no data via WebFetch.)
2. Does Coin Metrics/Talos plan to relaunch Precog (possibly under a different netuid)? No announcement found.
3. Coin Metrics Community API licence terms for redistribution/commercial use (terms URL redirects to a marketing page).
4. Whether any third party republishes Precog consensus forecasts publicly (NOT FOUND).

---

## Sources

- https://github.com/coinmetrics/precog - README, `docs/Release Notes.md`, `precog/protocol.py`, `precog/constants/__init__.py`, `precog/validators/reward.py`, `precog/utils/cm_data.py`; `gh api` metadata, commits, releases, issues (H)
- https://github.com/coinmetrics/precog-api-utility - README, `precog_api/client.py`, `precog_api/auth.py`, commit history (H)
- https://precog-api.coinmetrics.io/ , /docs , /openapi.json - 503 on 2026-10-19 (H)
- https://coinmetrics.io/company-news/precog-coin-metrics-bittensor-subnet/ - 301 to https://www.talos.com/insights (listing, no Precog) (H for redirect); announcement content only via search snippet (M, 2025-01-14, stale)
- https://coinmetrics.substack.com/p/state-of-the-network-issue-308 (2025-04-22, M, stale) and https://coinmetrics.substack.com/archive (M)
- https://taostats.io/subnets/55 and tabs (`/chart`, `/metagraph`, `/registration`) - header "SN55 - NIOME" (H); https://taomarketcap.com/subnets/55 (H); https://subnetalpha.ai/subnet/niome/ and /subnet/precog/ (M)
- https://github.com/genomesio/subnet-niome-v2 README line 1 (H)
- https://github.com/opentensor/bits `bits/BIT-0004-subnet-deregistration.md` (H)
- https://github.com/admnov38/SoK-Onchain_Prediction_Markets-Supplementary_Materials - `protocol_catalogue*.csv` (H for content, L for liveness)
- https://community-api.coinmetrics.io/v4/timeseries/asset-metrics (unauthenticated GET, H)
- https://api.taostats.io/api/subnet/latest/v1?netuid=55 (401, H)
- PayBox `discover_tokens mode=chains` (read-only, 2026-10-19, H)
- NOT FOUND (searched): Coin Metrics statement on Precog sunset/migration; Precog API response schema; Precog liquidity/stake figures for 2026; Coin Metrics Community API terms of use; docs.coinmetrics.io/bittensor/precog-methodology (404); any fiat or on-chain market on Precog forecasts. Web search was unavailable for the second half of the session (budget exhausted), so the 2026 status rests on page reads and GitHub, not on news search.

## Odd redirects (recorded, not followed)
- `https://www.coinmetrics.io/precog` (the repo's `homepage`) 301s to `https://fsarsmka.elementor.cloud/precog`, an unrelated-looking staging host; not fetched.
- `coinmetrics.io/company-news/...` and `coinmetrics.io/terms-of-use/` 301 to talos.com pages (consistent with a Talos/Coin Metrics merger, M).
- No instructions aimed at AI agents were found in any page, repo or response.
