# Futarchy.fi (Futarchy Labs) - venue adapter spec

Researched 2026-10-19. Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "NOT FOUND (searched: ...)" means I looked and found nothing; it does not mean it does not exist.

**Verdict: P2, signal-only. Do not build it as an arbitrage leg.** Futarchy.fi is live and has a public read API, but it is not a prediction market in the sense the aggregator needs. Each market is a pair of conditional token-price pools ("what will token X trade at if DAO proposal Y passes / fails"), not a priced probability of an event. It has no sports, politics, macro or generic crypto-price questions, so there is nothing to arbitrage against Polymarket, Kalshi or similar. Real activity is tiny (one live Gnosis market with about 540 sDAI of cumulative volume on 2026-10-19; one Ethereum-mainnet market whose pools I could not find). The only plausible use is a "governance impact" signal (YES price versus NO price) for DAO-token questions, and only if the project ever wants it.

## 1. Is it still live? (H)

- `https://futarchy.fi/` returns HTTP 200 (2026-10-19). The landing page says "Launch App -> /companies", links docs, status, X and GitHub. The `/companies` page is client-rendered and showed "No organizations found" to a non-JS fetch, so I could not read the company list from the site itself. (H: WebFetch + curl.)
- Status page JSON `https://status.futarchy.fi/api/status` says `overall: operational` at 2026-10-19T04:34Z: TWAP API, Charts API, Registry Indexer (Gnosis, gap 1 block), Candles Indexer (Gnosis, gap 4 blocks), plus a separate "Bond" product (Ethereum mainnet and Sepolia indexers, `bond.futarchy.ai`). Note: only the Gnosis candles indexer is listed; no Ethereum-mainnet candles indexer appears on the status page. (H, fixture `status_api_2026-10-19.json`.)
- GitHub org `futarchy-fi`: `interface` (the frontend) pushed 2026-09-27; last commits 2026-09-26 are a "Self-serve Create Market wizard" (#93, #94), 2026-08-18 "Fix active liquidity filtering across chains", 2026-08-17 "Hide active milestones below $1,000 liquidity". `futarchy-arb` pushed 2026-09-26, `futarchy-indexers` 2026-08-09, `futarchy-api` 2026-08-07, `docs` 2026-06-25. The core `futarchy` contracts repo last real commit is 2025-05-18 (the live contracts are Seer's, see section 3). (H: `gh api`.)
- Live market data: Gnosis market "impact on GNO price if GIP-153 is passed" (`0x4120de9931fd29c8a6effea4df57a7c8760c1677`) has hourly candles from 2026-08-17T07:00Z to 2026-10-18T13:00Z (YES) / 2026-10-15T12:00Z (NO). (H, fixture `charts_v2_chart_gip153_live_2026-10-19.json`.)
- Ethereum-mainnet market "impact on ETH price if EIP-8363 is Scheduled for Inclusion in Hegota" (`0x0d78b95fca9f3e1b588271a330b0d6f731ec38aa`): registry metadata says chain 1, closes `closeTimestamp 1792800000` = 2026-10-24T00:00Z. The address is a verified EIP-1167 clone of a `FutarchyProposal` implementation (`0x0956b70AC0Eca45DB9661a1cEE96B2e7062d8a1C`) on Ethereum mainnet. (H: `eth.blockscout.com/api/v2/addresses/...` GET, and `interface/src/config/markets.js`.) The public charts API cannot resolve its pools (section 5), so whether it has tradable liquidity is NOT FOUND.
- Caution on staleness: the public registry also lists junk (a "TEST4-..." market and "GIP-XX is lorem ipsum" flagged `isActive: true`) and stale actives (KIP-86 flagged active though its question deadline was end of March 2026). Of the 5 "active" markets in `markets.js` (generated 2026-08-07/17), at most 2 are real and current. (H for the file, M for my reading of staleness.)
- Traffic signal (M): `GET https://api.futarchy.fi/charts/warmer` returned `active: 0, entries: []` before I made any chart request, and the doc says entries stay 7 days after any chart hit. That suggests nobody loaded a market chart through the API in the previous 7 days. (Fixture `charts_warmer_before_my_calls_2026-10-19.json`; the endpoint filled with my own requests afterwards.)
- Related but separate products, not covered here: `bayes.futarchy.ai` (redirects to `futarchy.ai`; repo `bayes-market` is an in-memory LMSR engine that uses platform "credits", H: README), FAO (testnet, `testnet.futarchy.ai`), `fire-the-ceo` (Sepolia testnet, repo description). None is a real-money venue. (M/H as stated.)

## 2. Kind and market model

- **Kind:** on-chain conditional-token decision markets (futarchy), traded on concentrated-liquidity AMMs. Not an order book, not parimutuel, not a probability market. (H: docs `trading-in-futarchy`, `protocol/liquidity-pools`.)
- **Per proposal:** one binary condition (YES = proposal approved, NO = not approved) in the Gnosis Conditional Token Framework. Four ERC-20 wrapped conditional assets: `YES_TOKEN`, `NO_TOKEN` (the project token, e.g. GNO, PNK) and `YES_CURRENCY`, `NO_CURRENCY` (the trading currency, e.g. sDAI). Two primary pools: `YES_TOKEN/YES_CURRENCY` and `NO_TOKEN/NO_CURRENCY`. Wrapped outcome indices on the proposal contract: 0 = YES_COMPANY, 1 = NO_COMPANY, 2 = YES_CURRENCY, 3 = NO_CURRENCY. (H: docs; `futarchy-twap` README.)
- **Price semantics:** a pool price is "price of the token if the proposal passes" (or fails), in currency units. The signal is the YES/NO spread, `(YES - NO) / NO`. Docs: "Futarchy signals are derived by comparing prices across these pools, not by estimating outcome probabilities." (H.) Live sample: GIP-153 YES 91.2414 vs NO 90.3428, spread +0.99% against a documented 1% default approval threshold (H, fixture). The API field is named `price_usd` but the repo README says values are in the currency-token unit (sDAI) unless a `currency_rate` is applied; `currency_rate` was `null` in every response I saw. Treat as sDAI per token. (H on both statements; the mismatch is the API's naming.)
- **Probability pools:** the frontend's data model also defines `PREDICTION` pools (`YES_sDAI/sDAI`, `NO_sDAI/sDAI`, "probability pools") and `EXPECTED_VALUE` pools (`YES_GNO/sDAI`). The charts API returns only the two conditional company/currency pools. Whether live markets have funded probability pools: NOT FOUND (needs the candles GraphQL, which is POST-only; not called). If they exist, `YES_sDAI/sDAI` would be an implied approval probability. (H for the config, unknown for liquidity.)
- **Resolution output:** payout vector YES -> `[1,0]`, NO -> `[0,1]`. Binary only. (H: docs.)
- **Not scalar, not categorical.** Every market is the same two-world structure.

## 3. Chains and collateral

- **Gnosis Chain (id 100):** where nearly all history and the one confirmed live market sit. AMM is Swapr V3 (Algebra). Currency is **sDAI**; company tokens seen: GNO, PNK (Kleros), VLR (Velora), COW. (H: `interface/src/config/flm.json`, `markets.js`, API.)
- **Ethereum mainnet (id 1):** docs say pools are "typically created on Uniswap V3"; the frontend's chain config uses Uniswap V3 factory `0x1F98431c8aD98523631AE4a59f267346ea31F984`, position manager `0xC36442b4a4522E871399CD717aBDD847Ab11FE88`, `defaultFeeTier: 3000`. One mainnet market exists in the registry (EIP-8363, above). Its currency and company tokens: NOT FOUND (the API returned placeholder symbols `TOKEN` / `CURRENCY`). (H on the config, NOT FOUND on the market's tokens.)
- **Collateral custody:** the Gnosis CTF contract, not Futarchy-specific contracts. CTF: Ethereum `0xC59b0e4De5F1248C1140964E0fF287B192407E0C`, Gnosis `0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce`, Polygon `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` (the docs list Polygon for reference; I found no Futarchy.fi market on Polygon). (H: docs `protocol/custody-and-oracles`.)
- **Contracts are Seer's.** Futarchy.fi "is built on top of the Seer prediction market protocol and reuses several of its smart contracts." Gnosis `FutarchyFactory` `0xe789e4A240d153AC55e32106821e785E71f6b792` and `FutarchyRouter` `0xE2996f6BC88ba0f2Ad3a6E2A71ac55884ec9F74E` (docs). Both are verified contracts on Gnosis (H: gnosisscan Blockscout API GET, names `FutarchyFactory`, `FutarchyRouter`). The docs addresses are NOT contracts on Ethereum mainnet (same API, `is_contract: False`), so the **mainnet factory and router addresses are NOT FOUND** (searched: docs deployments page, protocol pages, interface constants). Older addresses in the frontend constants (`FutarchyFactory 0xa6cB18FC...`, `FutarchyRouter 0x7495a583...`) are also verified Gnosis contracts: treat as a previous deployment, current-vs-legacy not confirmed by any document (L). Registry aggregator: `0xC5eB43D53e2FE5FddE5faf400CC4167e5b5d4Fc1` (H: `subgraphEndpoints.js`). Seer's own docs label its futarchy factory "(test)" and list no audit for it (H, see `seer.md`); Futarchy Labs' own liquidity-manager README says the Algebra path is "a no-funds prototype". (H.)

## 4. Read API

**Verdict: official-public, partial.** There is a public gateway, `https://api.futarchy.fi`, documented in the `futarchy-api` repo (`docs/API_GATEWAY.md`). No key needed; "fully public"; the gateway injects a backend secret header itself. CORS is `*`. (H: repo doc, response headers.)

- Docs: `https://github.com/futarchy-fi/futarchy-api/blob/main/docs/API_GATEWAY.md` (also `futarchy-twap` README). `docs.futarchy.fi` documents the protocol, not the API.
- Base URLs: `https://api.futarchy.fi/charts/*`, `/registry/*`, `/candles/*`, and root-path TWAP routes. Status: `https://status.futarchy.fi/api/status`.
- **Worked with plain GET (H, 2026-10-19):**
  - `GET /health` -> `{"status":"ok","timestamp":...}`.
  - `GET /charts/api/v1/market-events/proposals/{proposal}/prices` -> YES/NO prices, pool ids, token symbols, cumulative volume per pool (sample: fixture `charts_v1_prices_gip153_live_2026-10-19.json`, 895 bytes). Response header `x-cache-ttl` 13 to 30 s.
  - `GET /charts/api/v2/proposals/{proposal}/chart?includeSpot=false` -> `market` object plus hourly `candles.yes[]` / `candles.no[]` (`periodStartUnix`, `close`) (fixture `charts_v2_chart_gip153_live_2026-10-19.json`, 26 KB). Query params `minTimestamp`, `maxTimestamp`, `includeSpot`, `applyCurrencyRate`.
- **Documented but did not work:** `GET /pools/{chainId}/{proposal}` and `GET /twap/{chainId}/{proposal}` returned 404 `Cannot GET ...` on the live host (both documented in two repos). `GET /registry/graphql` also 404 (GET not supported). Either the docs are ahead of the deployment or these routes are mounted elsewhere. (H on the 404s, cause unknown.)
- **GraphQL (not exercised):** `POST /registry/graphql` (proposals, organizations, aggregator hierarchy) and `POST /candles/graphql` (entities `candles`, `pools`, `swaps`, `proposals`; pool ids need a chain prefix, `100-0x...`, `?chainId=1` for mainnet). I did not call them because this task allows GET only. This is the only documented way to **list** markets and read pool TVL. (H for the docs, not tested.)
- **Mainnet gap (H):** the charts API resolves a proposal's chain through the registry and defaults to chain 100. For the EIP-8363 mainnet market both `/prices` and `/chart` (with or without `?chainId=1`) returned empty pools and placeholder symbols with `chain_id: 100` (fixture `charts_v1_prices_eip8363_mainnet_not_resolved_2026-10-19.json`). So a mainnet market is not readable through the public charts routes today. Reading it would need the candles GraphQL (POST) or on-chain reads (`wrappedOutcome(0..3)` on the proposal, Uniswap V3 `getPool`), per the `futarchy-twap` README.
- **Market discovery without POST:** none. Fallback (M): the frontend repo's auto-generated `src/config/markets.js` lists 40 registry markets with addresses, titles, chain and flags (I saved a reduced copy, `interface_markets_config_summary_2026-10-19.json`), but it is a build-time snapshot (last touched 2026-08-17).
- **Rate limits:** NOT FOUND (searched: API_GATEWAY.md, README, response headers; no `x-ratelimit-*` headers). Server-side caches: response 30 s, registry 5 min, candles 30 s. Spot prices come from GeckoTerminal and are 429-limited; use `includeSpot=false`. (H.)
- **Websocket / streaming:** NOT FOUND (searched: futarchy-api README, API_GATEWAY.md, interface repo tree). On-chain pool events via RPC are the only push-like route.
- **Volume only, no depth:** the API exposes cumulative pool volume, not TVL, order book or swap-quote depth. GeckoTerminal did not index the sampled pools (404). Pool TVL: NOT FOUND (needs the POST GraphQL or RPC).

## 5. Trade path

**Verdict: direct on-chain transactions only; no order signing, no off-chain order book, no trading API.**

1. Approve the currency (and/or company token) to the `FutarchyRouter`.
2. `FutarchyRouter.splitPosition(proposal, collateralToken, amount)` -> YES and NO ERC-20 wrappers (once per collateral token). `mergePositions` reverses it. (H: Seer docs.)
3. Swap `YES_TOKEN <-> YES_CURRENCY` (or the NO pair) in the proposal's pool through the AMM router: Swapr/Algebra V3 on Gnosis (frontend constant router `0xffb643e7...`), Uniswap V3 on mainnet. (H: docs, interface constants.)
4. After resolution, `redeemPositions` / `redeemProposal(proposal, amount1, amount2)` on the router; `FutarchyRealityProxy.resolve(proposal)` or `proposal.resolve()` finalises the condition once Reality.eth is final. (H: Seer docs.)
5. A buy of "token if YES" is therefore split currency into YES/NO currency, swap YES currency for YES token, keep NO currency as the refund leg. (H: docs "What Happens Under the Hood".)

Repos also contain helpers, none needed: `futarchy-arb` (Gnosis flash-loan arbitrage contract using Balancer V3, Swapr and the futarchy router) and an `interface/futarchy-sdk` folder. I did not read the SDK. An adapter would build calldata itself.

**PayBox reach: partial.** The wallet is an ordinary EVM account, so Ethereum-mainnet markets are reachable with transaction proposals (approve, split, swap, redeem), and Ethereum (1) is in PayBox's chain catalog. Gnosis Chain (100), where the live liquidity is, is **not** in the catalog that earlier research recorded (Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid; labelled "not a support allowlist"; see `docs/research/06-paybox-platform.md`). Whether a proposal on chain 100 would be simulated or signed is untested. The mainnet router address is unknown and there is no confirmed mainnet pool. No money tool was called for this note.

## 6. Fees

- **Protocol fee:** none documented. The Seer futarchy page and the docs mention none; split/merge/redeem are CTF operations. (H absence in: Seer futarchy docs, `protocol/*`, `trading-in-futarchy`. NOT FOUND otherwise.)
- **AMM fee (paid by the trader, goes to LPs):** Uniswap V3 `defaultFeeTier 3000` = 0.3% on mainnet in the frontend config (H, default only; per-pool tier unknown). Swapr/Algebra V3 on Gnosis uses a pool-level dynamic fee; the live value was not read (M). Docs: "The DAO earns LP fees back on its own liquidity." (H.)
- **Gas:** paid by the trader in native gas (xDAI on Gnosis, ETH on mainnet). A buy needs approve + split + swap, i.e. 3 transactions minimum; docs' "pilot" depth of about $100k means a $500 trade moves price about 2% (H: DAO FAQ, a design target, not an observation).
- **Oracle bond:** Reality.eth answers need a bond; the frontend's proposal-creation default `MIN_BOND` is `1e18` (1 unit of the chain's native token), labelled "1 ETH" in a code comment, from a legacy constants file (L).
- **Sponsored-proposal scheme** (DAO docs, 5% at-risk deposit, 33% discount, 12-month vesting) is a DAO governance programme, not a trading fee. (H, ignore for the adapter.)

## 7. Resolution and dispute risk

- Each proposal has a **Reality.eth question** ("was proposal approved?"). Anyone may post an answer with a bond; a challenge period applies; disputes escalate to **Kleros**. `FutarchyRealityProxy` (`0x03E1fCfE3F1edc5833001588fb6377cB50A61cfc`, per docs, chain not stated) is the only contract that may call `reportPayouts()` on the CTF for these proposals. (H: docs `protocol/custody-and-oracles`, `proposal-lifecycle`.)
- Question text is immutable once created and alone determines resolution. If a proposal is not approved by its deadline the correct answer is NO, but nothing resolves automatically: "conditional assets may remain unresolved until a valid answer is finalized". In practice the first answer usually comes from the DAO operator or Futarchy Labs. (H: docs.)
- Observed slowness (M): the Kleros KIP-90 market had a close timestamp of 2026-07-03 (`flm.json`) and was still `resolutionStatus: unresolved` in the 2026-08-17 snapshot of `markets.js`; I did not re-check later.
- Risks the docs themselves list: question wording, unclear resolution source, disputes delaying settlement, thin liquidity, smart-contract risk. Advisory by default: the market does not execute the decision. (H: `appendices/risks-and-guarantees`.)
- No dispute-rate or Kleros case data found. NOT FOUND (searched: docs, status page, repos).

## 8. Geo, ToS, automation

- No terms of service, privacy page or geo restriction found. `https://futarchy.fi/terms` and `/privacy` return 404; the landing page, `/companies` and the docs (all pages read) contain no such text; no KYC or wallet screening mentioned. NOT FOUND (searched: homepage HTML, docs repo files, WebFetch of `/companies`, direct paths). (H on the absence in those places.)
- The contracts are permissionless; the docs say trading "is permissionless and continuous" and liquidity provision permissionless. (H.)
- The API doc calls the gateway "fully public" and the frontend itself calls it. Nothing forbids automated reads or trades; nothing grants it either. Be gentle: the backend serves from an in-memory cache with 30 s TTLs and uses a rate-limited third party for spot prices. (H for the statements, no policy found.)

## 9. Liquidity

Everything here is cumulative volume from the charts API on 2026-10-19; pool TVL/depth is NOT FOUND.

- GIP-153 (live, Gnosis): YES pool 281.16 + NO pool 254.65 = **about 536 sDAI** cumulative volume since 2026-08-17 (H, fixture).
- GIP-145 (GNO, resolved; candles 2026-01-09 to 2026-02-27): YES 58,314 + NO 57,066 sDAI cumulative (H, fixture). This is the high-water mark among the markets I sampled (likely DAO-seeded liquidity, M).
- The frontend hides "active milestones" below $1,000 liquidity (commit message, 2026-08-17, H), which tells you typical live pools are often under that.
- Registry snapshot: 40 markets created since 2025-05-26 (Gnosis GIPs, Kleros KIPs, Velora, CoW, Aave, plus 2025 "predict TSLA / SBUX CEO event impact" experiments), of which at most 2 are real and live today. (H: `markets.js`, summarised in fixture `interface_markets_config_summary_2026-10-19.json`.)
- Docs target about $100k of DAO-seeded liquidity per pilot (design intent, H). No evidence found that live pools reach it now.

## 10. Event coverage and overlap with other venues

- **Categories:** DAO governance-impact on a token price (GNO/Gnosis, PNK/Kleros, VLR/Velora, COW, AAVE), and one Ethereum-protocol item (EIP-8363 scheduling, with the market priced as "ETH price if included"). Historical 2025 experiments on Tesla CEO award and Starbucks CEO exit, all closed. (H.)
- **Overlap with sports, politics, macro or generic crypto-price markets elsewhere: none.** These are "token price in the world where X happens", not "probability X happens". At best the matcher could link an EIP-8363-style market to a venue that lists the same Ethereum upgrade-inclusion question as a binary, but I did not check other venues (they are covered by a parallel workflow) and the Futarchy.fi price is still not a probability, so the match would be a weak signal only. (M.)
- **Arbitrage that does exist is internal:** YES/NO pool prices versus the token's spot price (split/merge plus swaps). The org ships its own bots (`futarchy-arb`, archived `futarchy-bots`). Not relevant to a cross-venue scanner. (H.)
- **Independence / shared liquidity:** pool liquidity is its own (wrapped conditional tokens per proposal, in Swapr V3 on Gnosis and Uniswap V3 on mainnet). Contracts and the CTF/Reality.eth stack are Seer's and shared infrastructure, but Seer's own market liquidity is separate. Whether the Seer UI lists Futarchy.fi proposals: NOT FOUND (Seer's docs call its futarchy deployment a test). Treat as independent but irrelevant. (M.)

## 11. Adapter notes (if ever built)

- **Role:** signal source only. Output record per market: `{venue: "futarchy-fi", chainId, proposal address, title, org, closeTimestamp, yesPrice, noPrice, spreadPct, cumulativeVolume, lastCandleTime}`. Never present YES/NO as outcome probabilities.
- **Discover** with the registry GraphQL (POST, needs a go-ahead since it is outside this task) or the `markets.js` build-time snapshot; **price** with `GET /charts/api/v1/market-events/proposals/{id}/prices` (gate on the 30 s cache TTL).
- **Filters needed:** drop `visibility != public`, titles starting `TEST`, "lorem ipsum", markets past `closeTimestamp`, markets whose `conditional_*.pool_id` is empty (mainnet today), and any market with cumulative volume under about 1,000 sDAI.
- **Staleness check:** compare `now` with the latest candle `periodStartUnix`; NO-side candles can lag YES by days (GIP-153 NO last candle 2026-10-15 vs YES 2026-10-18).

## 12. Not found / open questions

- NOT FOUND: Ethereum-mainnet `FutarchyFactory` and `FutarchyRouter` addresses; mainnet market tokens and pools; any pool TVL; rate limits; websocket; ToS/geo text; Kleros dispute statistics; which Gnosis factory/router is current (docs vs frontend constants).
- Not exercised by design: any POST (registry/candles GraphQL, JSON-RPC), wallet, signing or trade.
- WebSearch budget for the session was exhausted when this task started, so no news or third-party coverage was searched; all findings come from the site, docs, GitHub org, the project's own API and public block-explorer GETs. Prediction Index's tag (`Ethereum`, binary, live) matches the mainnet market but understates that most activity is on Gnosis and is not a binary probability market (M, `docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json`).

## Sources

- https://futarchy.fi/ and https://futarchy.fi/companies (WebFetch, 2026-10-19) [H]
- https://docs.futarchy.fi and docs repo https://github.com/futarchy-fi/docs, files `content/deployments-and-addresses.md`, `trading-in-futarchy.md`, `protocol/{README,custody-and-oracles,liquidity-pools,proposal-lifecycle,conditional-assets}.md`, `dao/{integration,faq,sponsorship,README}.md`, `appendices/risks-and-guarantees.md` [H]
- https://github.com/futarchy-fi/futarchy-api (`README.md`, `docs/API_GATEWAY.md`, `src/config/endpoints.js`, `src/routes/unified-chart.js`) [H]
- https://github.com/futarchy-fi/futarchy-twap `README.md` [H]
- https://github.com/futarchy-fi/interface (`src/config/{markets.js,flm.json,subgraphEndpoints.js}`, `src/constants/addresses.js`, `docs/SUBGRAPH_CREATE_POOL.md`, commit log) [H]
- https://github.com/futarchy-fi/futarchy-liquidity-manager `README.md`, https://github.com/futarchy-fi/futarchy-arb `README.md`, https://github.com/futarchy-fi/bayes-market `README.md`, org repo list (`gh api orgs/futarchy-fi/repos`) [H]
- https://seer-3.gitbook.io/seer-documentation/developers/interact-with-seer/futarchy-market (WebFetch) [H]
- Live GETs 2026-10-19: `https://api.futarchy.fi/{health,charts/warmer,charts/api/v1/...,charts/api/v2/...}`, `https://status.futarchy.fi/api/status`, `https://eth.blockscout.com/api/v2/addresses/...`, `https://gnosisscan.io/api/v2/addresses/...` (via 301 from `gnosis.blockscout.com`), `https://api.geckoterminal.com/api/v2/networks/xdai/pools/...` (404) [H]
- https://predictionindex.xyz/ecosystem as captured in `docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json` [M]
- Local: `docs/research/06-paybox-platform.md` (PayBox chain catalog), `docs/research/venues/seer.md`, `docs/research/venues/kleros-foresight-futarchy.md` [M, other agents' notes]

Fixtures in `docs/research/fixtures/futarchy-fi/`: `charts_v1_prices_gip153_live_2026-10-19.json`, `charts_v2_chart_gip153_live_2026-10-19.json`, `charts_v1_prices_gip145_resolved_2026-10-19.json`, `charts_v1_prices_eip8363_mainnet_not_resolved_2026-10-19.json`, `status_api_2026-10-19.json`, `charts_warmer_before_my_calls_2026-10-19.json` (transcribed verbatim from my first call, before the endpoint filled with my own requests), `interface_markets_config_summary_2026-10-19.json` (derived by me from `markets.js`, not an API response).
