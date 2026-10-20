# DFlow Prediction Markets (tokenised Kalshi on Solana)

Researched 2026-10-19. Read-only research: public unauthenticated GETs, Wayback captures, `gh api` reads of public repos. No accounts, keys, wallets, signing or payments. Tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale.

## Verdict (read this first)

- **The venue is not live in 2026. adapter_priority = skip.** DFlow (now owned by MoonPay) sunset its Kalshi prediction-market product in July 2026. Five independent signals agree (see "Is it still live?").
- Even when it was live, it was **not an independent leg**: every DFlow prediction market was a tokenised mirror of a Kalshi market, filled by liquidity providers against Kalshi's own order book (H, archived DFlow docs, March 2026). Prices and depth equal Kalshi's. It would have been a second route to Kalshi liquidity, not a second price.
- DFlow itself continues as a **spot** DEX aggregator and a "Proof" KYC service on Solana. Those are out of scope for an event-contract scanner.
- Practical value for this project: (a) do not build an adapter, (b) the Kalshi read adapter already covers everything DFlow ever exposed, (c) a successor on the same chain, **World Prediction Markets** (see "Leads"), is a different, unresearched venue.

## Is it still live? Evidence (all dated)

| # | Signal | Date | Tag |
|---|---|---|---|
| 1 | MoonPay announced it was acquiring DFlow (stock deal reported at about 100M USD by Fortune via press coverage). The announcement still described the Kalshi tokenisation API as a DFlow product. | 2026-05-05 | H (moonpay.com/newsroom/dflow) for the announcement, M for the price |
| 2 | Phantom wallet stopped routing new prediction-market positions through Kalshi/DFlow: positions opened on or after 2026-06-01 use "World Prediction Markets"; older positions stay on Kalshi via DFlow and need a manual settlement trade. | 2026-06-01 | H (phantom.com/prediction-market-disclosures) |
| 3 | DFlow-tracked settlement vault (DefiLlama "TVL") fell from 1,406,306 USD on 2026-07-06 to **0 on 2026-07-07**; it is 741 USD on 2026-10-18. Peak was 2,233,846 USD on 2026-03-07. | 2026-07-07 | H (api.llama.fi, fixture) |
| 4 | DFlow's own `DFlowProtocol/dflow-skills` repo, commit `1c546209`, message **"Sunset Kalshi and Proof; spot-only skill set"**: deletes the four Kalshi skills (trading, market-scanner, market-data, portfolio). Proof was re-added on 2026-07-28; Kalshi skills were not. | 2026-07-11 | H (gh api, fixture) |
| 5 | DFlow docs (`pond.dflow.net`): the 2026-07-06 Wayback capture still says "Integrate prediction markets and spot trading"; the 2026-08-07 capture says "Integrate spot trading" and has zero prediction-market pages. Live `llms.txt` and `llms-full.txt` on 2026-10-19 contain **zero** occurrences of "prediction" or "kalshi". Old PM doc URLs return 404. | 2026-07-06 to 2026-08-07 | H (fixture) |
| 6 | DefiLlama daily volume is 0 every day from 2026-07-03 to 2026-10-18 (last non-zero day 2026-07-02, 12,806 USD). 30-day volume 0. | 2026-10-18 | H |
| 7 | The consumer app at dflow.net now shows only "Spot" and "Equities" tabs (bundle string `mJe=[{key:"spot"...},{key:"equities"...}]`), plus a "Legacy Desktop" link. | 2026-10-19 | H (read of served JS as text, not executed) |
| 8 | Hosts: `dev-prediction-markets-api.dflow.net` (the documented dev Metadata API host) does **not resolve** (NXDOMAIN). `prediction-markets-api.dflow.net` still resolves but returns **HTTP 403 with an empty body** to unauthenticated GETs, including `/api/v1/events?limit=1`. | 2026-10-19 | H for the observations, M for the inference that the dev host was decommissioned |

No official DFlow or Kalshi announcement of the shutdown was found in search (NOT FOUND, searched: DFlow sunset Kalshi July 2026, DFlow Kalshi terminated, MoonPay DFlow prediction markets plans). The conclusion rests on the repo commit and the docs/volume/vault signals above, which is H for "DFlow removed Kalshi from its public product and docs" and M for "no way to trade tokenised Kalshi markets on DFlow today". Existing pre-June-1 positions can still be settled (Phantom disclosure, H), which implies some backend remained for wind-down.

## Kind and market model

- **Kind**: broker / tokenisation layer in front of Kalshi (CFTC-regulated centralised exchange). Not an independent market. (H, archived docs `learn/prediction-markets`, 2026-03-14 Wayback of llms-full.txt; L as current because it was removed.)
- **Model**: binary only, YES/NO per market, with Kalshi scalar markets represented via `scalarOutcomePct`. Events group markets; a market maps to Kalshi tickers (`eventTicker`, `seriesTicker`, `ticker`). (H, archived data-model page.) The on-chain settlement list (below) also shows 237 `S` (scalar) outcomes among about 89k records (H, live fixture).
- **Tokenisation**: each market has `yesMint` and `noMint` SPL tokens plus a `marketLedger` account; tokens are minted on fill and burned or redeemed after resolution; markets are tokenised on demand on first DFlow trade (`isInitialized`). (H, archived docs.)
- **Execution**: not an AMM, not an on-chain order book. "Concurrent Liquidity Program" (CLP): user writes a limit-priced intent on-chain, off-chain liquidity providers fill asynchronously over one or more follow-up transactions, backed by Kalshi's order book. (H, archived `learn/clp`.) Orders are always async and multi-transaction.
- **Price scale**: orderbook ladders are maps of 4-decimal price strings to integer sizes (`yes_bids`, `no_bids`, `sequence`); trades use a 0-10000 price scale. (H, archived docs; not re-verified live because the API is gone.)

## Chains and collateral

- Solana only. Settlement mints: **USDC** `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` and **CASH** `CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH` (H, archived error-codes page, March 2026). Any spot token could be the input; the route always went input -> settlement mint -> outcome token.
- Each trade creates token accounts and protocol accounts, so SOL rent is the largest user cost (H, archived fees page).

## Read API

| Item | Finding | Tag |
|---|---|---|
| Existence (historical) | Official "Prediction Market Metadata API", `prediction-markets-api` OpenAPI v0.1.0, 28 GET/POST paths | H (fixture `metadata-api_openapi.paths-only.json`) |
| Docs URL | `https://pond.dflow.net/build/metadata-api/introduction` existed in March 2026; the spec file `https://pond.dflow.net/build/metadata-api/openapi.json` is still served, but the rendered docs pages are gone (404) | H |
| Base URLs | dev: `https://dev-prediction-markets-api.dflow.net` (NXDOMAIN now), WS `wss://dev-prediction-markets-api.dflow.net/api/v1/ws`; prod: `https://prediction-markets-api.dflow.net` (403 without key now) | H |
| Key endpoints (spec) | `/api/v1/events`, `/api/v1/event/{event_id}`, `/api/v1/markets`, `/api/v1/markets/batch` (POST), `/api/v1/market/{market_id}`, `/api/v1/market/by-mint/{mint}`, `/api/v1/orderbook/{market_ticker}`, `/api/v1/orderbook/by-mint/{mint}`, `/api/v1/trades`, `/api/v1/onchain-trades`, `/api/v1/outcome_mints`, `/api/v1/filter_outcome_mints` (POST), `/api/v1/search`, `/api/v1/series`, `/api/v1/live_data` (Kalshi pass-through), candlesticks and forecast-percentile-history | H |
| WebSocket | channels `prices`, `trades`, `orderbook` on `/api/v1/ws` | H (archived docs) |
| Auth and limits | dev endpoints needed no key and were rate limited; prod needed an API key from a Google Form, "2-5 days"; header `x-api-key`. Volume for fee tiers was tracked per API key | H (archived docs) |
| Live now | Metadata API: **not reachable** (see above). Trade API dev host `https://dev-quote-api.dflow.net` is up, rate limit header `x-ratelimit-limit: 60`, but its published OpenAPI (`pond.dflow.net/resources/trading-api/openapi.json`) lists only spot paths (`/order`, `/quote`, `/swap`, `/venues`, ...) | H |
| Undocumented leftover | `GET https://dev-quote-api.dflow.net/prediction-markets` returns HTTP 200, a 15,760,501-byte JSON array of 89,114 records `{address, market_id, is_funded, outcome_val, scalar_outcome_pct}`; 1,499 have no `outcome_val`. It carries no tickers, prices or timestamps, so it is not usable for pricing. The meaning (on-chain settlement or ledger accounts keyed by a 32-byte market id) is inferred from field names | H for the response shape, L for the interpretation |

Unauthenticated response shapes confirmed 2026-10-19 and saved in `docs/research/fixtures/dflow-prediction-markets/`: `dev-quote-api_prediction-markets.sample.json` (trimmed), `dev-quote-api_venues.json` (spot venue list, includes the unrelated "BisonFi Predictions" AMM venue). No live Metadata API sample exists because the host is gone; the example order book above is from archived documentation, not a live response.

## Trade path

- **Historical**: Trade API `GET /order` returned a Solana transaction for the user to sign (spot token -> settlement mint -> outcome token, with on-demand market tokenisation); the user signs with their own Solana key and submits; LPs fill afterwards. `GET /order-status` for tracking; `outcomeAccountRentRecipient` and `destinationWallet` parameters; redemption via the same `/order` for winners. (H, archived docs; M for the exact parameter semantics, not re-checked.)
- **Compliance gate**: buying outcome tokens required the receiving wallet to be verified through DFlow **Proof** (KYC); `/order` returned an error for unverified buyers; selling needed no KYC. (H, archived `kyc` page.)
- **Now**: no prediction-market trade path is documented or advertised. (H)

## PayBox reachability

- **No.** The product is sunset. Even when live it was Solana-only (PayBox EVM wallets on Base, Ethereum, BNB, Arbitrum or Polygon cannot sign Solana programs), required a Proof-verified Solana wallet, and used multi-transaction async fills that do not fit a single-proposal agent flow. A Solana-credential PayBox wallet could in principle have signed `/order` transactions after KYC; moot now. (M)

## Fees (historical, archived docs March 2026, H as documentation, L as current)

- Formula: `fees = roundup(0.07 * c * p * (1 - p)) + 0.01 * c * p * (1 - p)` where p is fill price and c contracts. Builder tiers by rolling 30-day volume: Frost (<50M) taker scale 0.09, maker 0.0225; Glacier 0.0875/0.021875; Steel 0.085/0.02125; Obsidian (>300M) 0.08/0.02. Rebate program above 100k 30-day volume. Charged to the builder/user on top of Solana account rent. The DefiLlama methodology states the same shape: "Fee formula: scale * p * (1 - p) * c" (H). Kalshi's own schedule uses the same p(1-p) shape (M, from general knowledge; see the Kalshi venue note for the primary source), so DFlow was at best equal-cost to trading Kalshi directly.

## Resolution and dispute risk

- Resolution follows **Kalshi** (Kalshi's database as reindexed by DFlow). Lifecycle `initialized -> active -> inactive -> closed -> determined -> finalized`, only `active` trades. (H, archived docs; Phantom disclosure H for "Resolution relies on Kalshi's database and DFlow's reindexing of it".)
- Extra risk on top of Kalshi's own: indexing delay or error at DFlow, manual settlement trade at a quoted price for legacy positions ("may differ from the original contract price", H, Phantom), Kalshi clearing maintenance window Thursdays 03:00-05:00 ET when orders revert (H, archived error-codes page).

## Geo, ToS, automation

- Builders had to geoblock the **United States** and a long list (Australia, Canada, France, Singapore, UK, Switzerland, Thailand, Taiwan, UAE, Russia, China and more) and could lose API access for failure (H, archived `legal/prediction-market-compliance`: "Failure to comply may result in enforcement actions, including revocation of API access"). Automation by API key was allowed and normal; there was an Agent CLI for spot (H, live docs) but no PM support.

## Liquidity (DefiLlama, fetched 2026-10-19)

- All-time volume 17,311,389 USD (H, api.llama.fi). Monthly: Dec 2025 1.84M, Jan 2026 3.61M, **Feb 2026 6.11M (peak; peak day 2026-02-22 378,439)**, Mar 3.56M, Apr 0.44M, May 0.90M, Jun 0.72M, Jul 0.13M, Aug-Oct 0.
- Methodology caveat: DefiLlama measures "CASH/USDC transfers to the settlement vault", an on-chain proxy, so treat it as a lower bound or approximation (M). It is far below Kalshi's own volume (Kalshi lifetime volume passed 100B USD in June 2026 per TechTimes, M), so DFlow was a rounding error even at peak.
- TVL (vault balance): peak 2,233,846 USD on 2026-03-07, 0 on 2026-07-07, 741 USD on 2026-10-18 (H).
- DFlow's marketing figure "tens of billions in transacted volume" (MoonPay, 2026-05-05) refers to the spot aggregator, not prediction markets (M; the announcement text covers both products).

## Event categories that overlapped other venues

- Everything that Kalshi lists (sports, politics, crypto price ladders incl. 15-minute markets, macro/economics) because it was a 1:1 mirror ("100% market coverage" is DFlow's own claim, L). The overlap is with **Kalshi itself** (same prices) and, through Kalshi, with Polymarket, Limitless, etc. There was no price independent of Kalshi, so no arbitrage leg.

## Shares liquidity with

- **Kalshi** (100%). Excluded from independent-leg analysis. (H, archived docs: "The trade executes through Kalshi's prediction market liquidity.")

## Leads for the orchestrator (not researched here)

- **World Prediction Markets** (world.xyz), a non-custodial Solana protocol that replaced Kalshi/DFlow inside Phantom for positions opened from 2026-06-01; public launch reported 2026-07-01; SPL position tokens; settles in CASH; Chainlink Data Streams plus Chainlink Runtime Environment for resolution; team not publicly identified; not a CFTC DCM; no public developer docs or API found; coverage mentions crypto price, World Cup and "more than 150,000 markets" (all M, secondary press: TechTimes, Crypto Briefing, Crowdfund Insider, Solana Compass, search summaries). Worth its own venue-spec: independent liquidity, Solana, possible read access via on-chain accounts.
- **Jupiter prediction markets**: December 2025 coverage named Jupiter as a second institutional client of Kalshi's tokenisation alongside DFlow (L, search summary of Cointelegraph/Blockhead). Not verified.
- MoonPay bought Dawn Labs and launched "Dawn CLI" for prediction-market strategies (2026-05-11, M). MoonPay owns DFlow and may relaunch PM under a different design; watch `DFlowProtocol` repos.

## Not found

- Any official DFlow or MoonPay statement of the sunset (searched: DFlow sunset Kalshi, DFlow Kalshi terminated, MoonPay DFlow prediction markets plans, news 2026).
- A working production Metadata API sample (no key; dev host NXDOMAIN; prod 403).
- Why the vault dropped on 2026-07-07 (migration versus wind-down): inferred from the commit four days later, M.
- Triad Markets "DFlow waitlist" claim from the discovery hint: not checked, Triad is out of scope for this task.
- Current DFlow terms of service text for prediction markets (page removed).

## Suspicious content

- None found. The DFlow docs ship `llms.txt`, `llms-full.txt`, an MCP server and Agent Skills aimed at AI agents; their content was read as data only and no instruction in them was followed. The `Co-Authored-By` trailer in a DFlow commit is not an instruction.

## Sources

- https://pond.dflow.net/llms.txt and https://pond.dflow.net/llms-full.txt (live 2026-10-19; no PM pages) - H
- https://pond.dflow.net/get-started/endpoints and https://pond.dflow.net/resources/trading-api/openapi.json (live; spot only, `quote-api.dflow.net`, `dev-quote-api.dflow.net`) - H
- https://pond.dflow.net/build/metadata-api/openapi.json (still served; Metadata API spec) - H
- Wayback captures of https://pond.dflow.net/llms-full.txt (20260314004758, source for archived PM docs: endpoints, data model, fees, KYC, lifecycle, CLP, compliance, error codes), https://pond.dflow.net/prediction-markets/prediction-markets-101 (20260608080805), https://pond.dflow.net/introduction (20260617135732, 20260706115243, 20260807200547, 20260911213538, 20260919064137, 20261012010149) - H for what they said at capture time, L as current
- https://github.com/DFlowProtocol/dflow-skills commit `1c546209` (2026-07-11) and README (read via gh api) - H
- https://github.com/DFlowProtocol/cookbook (still has `src/prediction-markets`, last PM-era code; maintenance-only commits since 2026-07-30) - H
- https://api.llama.fi/protocol/dflow-prediction-market and https://api.llama.fi/summary/dexs/dflow-prediction-market (page https://defillama.com/protocol/dflow-prediction-market returned 403 to WebFetch, the API worked) - H
- https://dflow.net/ and its served bundle `/assets/index-giKo87aB.js` (read as text) - H
- https://phantom.com/prediction-market-disclosures (provider split at 2026-06-01, legacy settlement) - H
- https://www.moonpay.com/newsroom/dflow (2026-05-05) - H
- https://www.techtimes.com/articles/319560/20260702/prediction-market-world-launches-phantom-chainlink-oracles-auto-settle-solana-trades.htm, https://cryptobriefing.com/phantom-taps-world-to-replace-kalshi-for-prediction-markets/, https://www.crowdfundinsider.com/2026/06/288594-phantom-wallet-moves-prediction-market-backend-to-world-prediction-markets-enabling-automatic-on-chain-settlement/ - M
- https://cointelegraph.com/news/moonpay-dawn-labs-ai-prediction-markets - M
- https://solana.com/news/dflow-prediction-markets-api, https://www.blockhead.co/2025/12/02/kalshi-launches-tokenized-prediction-markets-on-solana-through-dflow-integration/ (launch coverage, 2025-12) - M, stale
- BeInCrypto article on World was blocked by a Cloudflare challenge (403); not used directly.

## Fixtures

`docs/research/fixtures/dflow-prediction-markets/`: `dev-quote-api_prediction-markets.sample.json`, `dev-quote-api_venues.json`, `metadata-api_openapi.paths-only.json`, `defillama_dflow-prediction-market_volume.trimmed.json`, `defillama_dflow-prediction-market_tvl.trimmed.json`, `dflow-skills_commit_1c546209_sunset-kalshi.json`, `wayback_pond-dflow-introduction_prediction-mentions.json`, `pond-dflow_llms.txt`.
