# Predictcoin (predictcoin.finance) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 03:49-03:56 UTC). READ-ONLY: doc, `gh api` file reads and unauthenticated GETs only. No account, wallet, key, signature, POST, on-chain call or PayBox tool. Third-party pages, repo text and API responses were treated as untrusted data. WebSearch was used twice, then the session budget ran out, so there is no further press coverage beyond those two searches.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, search-result snippet, or my inference/arithmetic from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/predictcoin/` (listed in section 13).

---

## 0. Bottom line

1. **This is not a prediction market in the aggregator sense.** It is a 2021-22 BNB Chain "predict-to-earn" game plus a staking/farm/NFT-lending suite. The user pays a fixed PRED amount per round to call a token up or down (Chainlink price), the stake goes to the operator treasury, and winners/losers get PRED farm emissions. There is **no price, no odds, no order book, no AMM, no outcome token** to quote or trade. (H, contract source)
2. **Effectively dormant.** Last commit anywhere in the GitHub org is 2022-10-06; the sports-oracle backend (Heroku) is deleted; the gitbook is an empty "Initial page" (last edit 2021-07-01); the whitepaper PDF is a 2021 image scan; DefiLlama TVL is $0 for staking (last non-zero $11.3k on 2024-03-04) and $129 of pool2 liquidity; the PRED token has had $302 of DEX volume in 2026 (last trade day 2026-10-08, $0.37). I could not confirm that the Predict contract still opens rounds (needs a JSON-RPC POST, disallowed here). (H data; "dormant" is M)
3. **adapter_priority = skip.** Even if rounds were live, nothing is priced and the whole venue's liquidity is about $250 of PRED dust.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Homepage `https://predictcoin.finance/` | HTTP 200 from Netlify, 3,889-byte Create-React-App shell (`<title>Predictcoin</title>`, `<div id="root">`), webpack name `predictcoin`. Edge cache age about 9.2 h at fetch. No server-rendered content (fixture `predictcoin_finance_homepage_2026-10-19.html`). | H |
| JS bundle `d33wubrfki0l68.cloudfront.net/bundles/f9de8464...js` | 4.9 MB, still served. It is the 2022 frontend (WalletConnect v1 bridge, `bridge.walletconnect.org`, Cronos/Crypto.com wallet code). Hard-codes `https://predictcoin-production.herokuapp.com/football-api` | H |
| That Heroku API | `GET https://predictcoin-production.herokuapp.com/` -> HTTP 404 "No such app". The sports feed the UI depends on is gone (fixture `herokuapp_football_api_root_2026-10-19.txt`) | H |
| GitHub org `predictcoin` | 20 repos, none archived, org `updated_at` 2021-10-04. Newest pushes: `FarmingContract` 2022-10-01, `Predictverse` 2022-10-01, `Predictcoin-React-Frontend` 2022-10-06 (commit "update roadmap"), `predictcoin-server` 2022-09-04. Nothing in 2023-2026 | H |
| Gitbook `predictcoin.gitbook.io/predictcoin` | One page, "Initial page", empty; site-index lists only that page; `updatedAt` 2021-07-01 | H |
| Whitepaper `predictcoin.finance/images/whitepaper.pdf` | 10-page PDF, image scan, producer iLovePDF, created 2021-10-21; no text layer, so not read. (Same file is in the frontend repo.) | H (metadata) |
| DefiLlama `api.llama.fi/protocol/predictcoin` | Category "Prediction Market", chain Binance. Latest series point 2026-10-18 23:42 UTC: staking TVL $0, pool2 $128.87. Peak staking TVL $300,675 on 2022-01-30. Last non-zero staking TVL $11,333 on 2024-03-04. `misrepresentedTokens: true` (fixture `defillama_protocol_predictcoin_summary_2026-10-19.json`) | H |
| GeckoTerminal token + pools (BSC) | PRED price $0.01023, FDV $1,017.89, total supply 100,000, 24h volume $0, 7 pools (PancakeSwap v2/v3, BabySwap, AutoShark, Uniswap v4); two pools were created in 2025 (PancakeSwap v3 2025-04-18, Uniswap v4 2025-09-17) | H |
| Daily candles PRED/WBNB (PancakeSwap v2) | 183 daily candles 2026-01-04 to 2026-10-08, summing to $302.5 of volume in total; last day with any volume 2026-10-08 ($0.37) | H data, M arithmetic |
| DexScreener `/latest/dex/tokens/<PRED>` and `/search?q=predictcoin` | `{"pairs":null}` / `{"pairs":[]}` (not indexed there) | H |
| CoinGecko `/api/v3/coins/predictcoin` | `{"error":"coin not found"}` (DefiLlama lists `gecko_id: predictcoin`, so the CoinGecko listing was removed or renamed; GeckoTerminal reports `coingecko_coin_id: null`) | H |
| X account `@PredictcoinFin` | WebFetch returned HTTP 402 Payment Required; I stopped there and recorded nothing from the body. A search-result summary (not a primary read) said the account promotes staking for BNB rewards and an "AI agent" announced April 2025 | L |
| BscScan token page | HTTP 403 Cloudflare challenge to curl and WebFetch. A search snippet claimed "Price $0.3875, on-chain market cap $38,750, 2,022 holders, as at Sep-29-2026"; that conflicts with GeckoTerminal's $0.0102 and is unverified | L |
| Whether the Prediction contract still starts rounds | **NOT FOUND** (searched: BscScan, Etherscan V2 free tier "not supported for this chain", BscScan V1 301, Blockscout BSC 404, GeckoTerminal trades; reading `currentEpoch` needs JSON-RPC POST, not allowed) | - |

Verdict: **still_live = false** for the purpose of this project. The website and a token with dust trading exist, but I found no evidence of a functioning, priced prediction product in 2026, and the sports backend is deleted.

---

## 2. Kind and market model

Kind: BNB Chain (BSC) "price prediction DAO": PRED-staking, LP-farming, round-based up/down prediction game, sports score prediction, and an NFT ("Predictverse") staking/borrow suite. DefiLlama description: "all-in-one price prediction DAO. Stake, Farm, Vote and Predict" (H, DefiLlama).

### 2a. Price prediction ("Predict") - H, source `predictcoin/Prediction-Pools` `contracts/Prediction.sol`
- Forked from PancakePrediction V2 (docstring `@title PancakePredictionV2`), upgradeable (UUPS), pausable.
- Round (epoch) machine: operator calls `startRound()` (records Chainlink `AggregatorV3` `latestRoundData` for every listed token as `lockedPrices`) and `endRound()` (records `closePrices`) after `intervalSeconds`; bets are accepted only for `betSeconds` after the round locks.
- Entry: `predictBull(epoch, token)` / `predictBear(epoch, token)`. **One bet per address per round, fixed `betAmount` of PRED** (admin-set; "10 PRED" and "5 coins, 10 seats per coin, weekly" appear in a search-result description of the site, M, not confirmed in source), capped per token by `tokenMaxBet`. Both functions are `notContract` (`msg.sender == tx.origin` and not a contract).
- Listed tokens in the frontend config: BNB, ETH, DOGE, CAKE, BTC (H, `addresses.ts` `PREDICTION_TOKEN_ADDRESSES`).
- **Payout is not parimutuel.** `endRound()` does `treasuryAmount += rounds[currentEpoch].totalAmount`, i.e. all stakes become operator treasury (admin `claimTreasury()`). `claim()` only refunds when the operator never called the oracle within `bufferSeconds` of close. Winners get nothing from the stakes.
- What winners get: `wonRound(user, epoch)` is true if the locked-to-close price moved in the user's direction (equal price counts as a loss). A winner may then `deposit` PRED into the per-epoch **WinnerPredictionPool** (`0x29C0...5406`), a MasterChef-style farm paying `predPerBlock` from a `PredictionWallet`; losers can do the same in the **LoserPredictionPool** (`0x5D83...03B6`) using `lostRound`. `maxPredDeposit` caps each deposit. So the "payout" is a PRED emission, not a share of a pool.
- Outcomes are not tokenised. State is `ledger[epoch][address] = {position, token, amount, claimed}`.
- The repo source hard-codes PRED = `0xB2d7...1f0d`, which is the **testnet** PRED in the frontend config; the mainnet build is therefore not source-verified here (M).

### 2b. Sports prediction - H, source `predictcoin/PRED-Sports-Prediction`
- User calls `predict(eventId, teamAScore, teamBScore)`: exact final score, fixed `predictAmount` of PRED transferred to a treasury contract, one prediction per event, `maxPredictions` per event.
- Reward is `predictAmount * multiplier` (admin `setMultiplier`; the value is **NOT FOUND**), paid from the treasury only if the exact score is right; a cancelled event refunds the stake. This is a house-banked fixed-multiplier product, not a market.
- Events and results are written by an admin: `SportOracle.addSportEvent(s)` and `declareOutcome` are `onlyAdmin`. The 2022 UI fetched fixtures from the (now deleted) Heroku football API.

### 2c. Not a market
No outcome tokens, no prices, no order book, no AMM, no binary/categorical/scalar market objects, no market creation by users. The "Predictverse" NFT staking/borrow part is irrelevant to this project.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | BNB Smart Chain (56). The org also has Cronos "CRO*" repos (CroPredict etc., 2022); not in the current bundle's addresses | H |
| Collateral | PRED (BEP-20, 18 decimals, total supply 100,000) `0xbdD2E3fdb879AA42748E9D47b7359323f226BA22`. No stablecoin collateral | H |
| Prediction (mainnet) | `0xBf9C36E0852B62Ac730E6BA8EAa5022Ed97cBBE8` | H (frontend `addresses.ts` and live bundle) |
| WinnerPredictionPool / LoserPredictionPool | `0x29C06EB1320BBc32A6891889A3dF56d8422f5406` / `0x5D83EF52661Baa67c9a7d60BF61b8339622603B6` | H |
| SportPrediction / SportOracle | `0x552F384af601d1Fda3998d7dDB417d993Beef34b` / `0x4dca40cd29Af8B98478F1314743220B01A246E2B` | H |
| Staking / PRED NFT / Predictverse / PredictverseMarket | `0x4b74C42b7aB96fEec003563c355f2fEfD0C80ee7` / `0x87aeCaCc249985C305A569930a2058D08218F2Fc` / `0xBf5036d29F9EF09C42d667742b68Ddfa1C82095a` / `0xE77c8eEFc98465fC803882FDE2e8DDa2346862EC` | H |
| LP tokens | BUSD-PRED `0xf38d...6980`, BNB-PRED `0x3e4d...e820d`, USDT-PRED `0x4789...09B9` | H |
| Audit | TechRate "Predictcoin Full Smart Contract Security Audit", August 2021 (link in DefiLlama and the bundle; PDF not read) | L |

---

## 4. Read API

**None.** `exists = none` (no official API, no subgraph, no docs).

- No REST/GraphQL/websocket host is documented anywhere (gitbook empty; no `docs.` host resolves; `app.` host does not resolve).
- The only backend the frontend references is `predictcoin-production.herokuapp.com/football-api`, which is deleted (404 "No such app").
- Market data would have to come from direct BSC contract reads (`Prediction.getRound(epoch)`, `getStats(epoch)`, `getUserRounds`, events `StartRound/PredictBull/PredictBear/EndRound`) via JSON-RPC, which I did not call (POST). Even then the data are round metadata and bet counts, not prices.
- Third-party data that exists: GeckoTerminal public API for the PRED token (`/api/v2/networks/bsc/tokens/<addr>`, `/pools`, `/pools/<pool>/ohlcv/day`) - useful only to show the venue is dead. Free tier returned HTTP 429 on rapid repeat calls (2 of 3 pool OHLCV requests inside about 6 s).
- Rate limits, auth: n/a. Websocket: none.

Real response shapes confirmed (H): see fixtures `geckoterminal_*` (token, pools, ohlcv), `dexscreener_tokens_PRED_*` (null pairs), `defillama_protocol_predictcoin_summary_*`. None of these is a market-data feed for the venue's own contracts.

---

## 5. Trade path and PayBox reachability

- **Programmatic trading:** only by direct contract calls on BSC: `PRED.approve(Prediction, betAmount)` then `Prediction.predictBull/predictBear(epoch, token)`. No signed-order API, no relayer, no off-chain signature scheme. (H, source)
- `notContract` blocks ERC-4337 smart accounts and any contract caller (`msg.sender == tx.origin`), so only a plain EOA can place a bet. A PayBox EVM MPC wallet is an EOA shared across `eip155:*` chains and BNB Smart Chain (56) is in PayBox's chain catalog (project note `docs/research/06-paybox-platform.md`, H there), so a PayBox EOA could in principle send those two calls as transaction proposals.
- **paybox_reachable = partial:** chain and caller type are compatible, but there is nothing worth trading: no price, an operator-controlled round clock that I could not confirm is running, and PRED liquidity of about $250 (a PRED balance would first have to be bought through pools each under $100 deep). I did not test anything with PayBox.

---

## 6. Fees

- No explicit fee parameter in the Predict flow. The *entire stake* (`betAmount` per bet) is swept into `treasuryAmount` at `endRound()` and withdrawn by the admin with `claimTreasury()`. Winners/losers are compensated only by farm emissions (`predPerBlock`, value NOT FOUND) from the rewards wallet. (H, source)
- `MAX_TREASURY_FEE = 1000` (10%) is declared but I saw no use of it in the file (inherited from PancakePrediction). (H, absence M)
- Sports: house-banked; payout `predictAmount * multiplier`, multiplier value NOT FOUND. (H, source)
- Who pays gas: the bettor, in BNB. Trading PRED on AMMs costs the usual pool fee (PancakeSwap v2 0.25%, unverified here). (M)

---

## 7. Resolution mechanism and dispute risk

- Price rounds: Chainlink BSC aggregator per token (`AggregatorV3Interface.latestRoundData`), read on `startRound`/`endRound`, both `onlyOperator`. Guards: `oracleUpdateAllowance`, round id must increase. If the operator misses the `bufferSeconds` window, the round never gets `oraclesCalled` and bettors can refund. Tie (locked == close) is a loss for the bettor. (H)
- Admin powers (H): UUPS upgradeable (`_authorizeUpgrade` onlyOwner), `pause`, change `betAmount`, buffers, oracles, `claimTreasury`, `setOperator`, `recoverToken` (except PRED). No timelock or multisig found. Sports outcomes are set by one `onlyAdmin` address with no dispute path.
- Dispute risk: no dispute process; operator liveness and trust risk dominate. Not a venue where a hedge can be assumed to settle.

---

## 8. Geo, ToS, automation

- Terms of service, privacy policy, geo-block statement, API/automation policy: **NOT FOUND** (searched: homepage HTML, gitbook, 4.9 MB frontend bundle strings for "terms/privacy/jurisdiction/restricted/disclaimer", GitHub README files). No geo check visible in the static shell (the app is client-side only, so a geo block would appear only after the app loads, which I did not run).
- Automation: `notContract` forbids contract callers; EOA scripts are not prohibited by anything I found.

---

## 9. Liquidity (all with source and date)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Prediction volume / OI | **NOT FOUND**. No indexer or API; on-chain reads not done | - | - |
| DefiLlama TVL | $0 (staking), $128.87 (pool2); peak staking $300,675 on 2022-01-30 | api.llama.fi, series point 2026-10-18 23:42 UTC | H |
| PRED price / FDV | $0.01023 / $1,017.89 (100,000 supply) | GeckoTerminal 2026-10-19 | H |
| DEX liquidity | token endpoint `total_reserve_in_usd` $129.32; sum of 7 pools' `reserve_in_usd` about $254 (92.3 + 52.4 + 51.0 + 28.8 + 29.6 + 0.12 + 0.02) | GeckoTerminal 2026-10-19 | H data, M sum |
| DEX 24h volume | $0 | GeckoTerminal 2026-10-19 | H |
| 2026 DEX volume | $302.5 over 183 daily candles (2026-01-04 to 2026-10-08), main PRED/WBNB pool only | GeckoTerminal OHLCV 2026-10-19 | H data, M sum |
| BscScan view | price $0.3875, market cap $38,750, 2,022 holders, 2026-09-29 | search snippet only; page blocked; conflicts with the row above | L |

---

## 10. Event categories overlapping other venues

- Crypto price direction (BNB, ETH, DOGE, CAKE, BTC) over a round (weekly per site text, M). Superficially similar to short-dated crypto up/down markets elsewhere, but there is no price or odds to compare, the stake is not recoverable, and the "payout" is an emission. **No arbitrage leg.**
- Football exact-score predictions: same, house-banked fixed multiplier, no live fixtures source. **No arbitrage leg.**
- Politics, macro, other: none.

## 11. Shared liquidity

None with another venue. Chainlink feeds are the only external dependency. (H)

---

## 12. Adapter recommendation

**skip.** Dead or dormant, no read API, no price, no outcome tokens, operator-banked stakes, ~$250 of token liquidity. Revisit only if the team ships a new priced market product; re-check the GitHub org and `api.llama.fi/protocol/predictcoin` TVL.

---

## 13. Sources and fixtures

Sources (all fetched 2026-10-19):
- https://predictcoin.finance/ (HTML shell) and bundle https://d33wubrfki0l68.cloudfront.net/bundles/f9de84641385fce1c1e65de93fc98dda915a3eb6.js (H)
- https://predictcoin.finance/images/whitepaper.pdf (H metadata; image-only, not read)
- https://predictcoin.gitbook.io/predictcoin/ , `/llms.txt`, `/master.md`, `/~gitbook/site-index` (H)
- https://api.llama.fi/protocols and https://api.llama.fi/protocol/predictcoin (H)
- https://api.geckoterminal.com/api/v2/networks/bsc/tokens/0xbdD2E3fdb879AA42748E9D47b7359323f226BA22 , `/pools`, and `/pools/0x3e4dfc6a8f2f1851b0694592d06de5254afe820d/ohlcv/day?limit=1000&currency=usd` (H)
- https://api.dexscreener.com/latest/dex/tokens/0xbdD2E3fdb879AA42748E9D47b7359323f226BA22 and `/latest/dex/search?q=predictcoin` (H)
- https://api.coingecko.com/api/v3/coins/predictcoin (H, 404)
- https://predictcoin-production.herokuapp.com/ (H, 404 "No such app")
- GitHub (via `gh api`, raw): `predictcoin/Prediction-Pools` (`contracts/Prediction.sol`, `WinnerPredictionPool.sol`, `LoserPredictionPool.sol`, `deployments.json`), `predictcoin/PRED-Sports-Prediction` (`SportPrediction.sol`, `SportOracle.sol`), `predictcoin/Predictcoin-React-Frontend` (`src/views/Dapp/constants/addresses.ts`, commits), org metadata `orgs/predictcoin` and its repo list (H)
- Search-result summaries (M/L): coinmarketcap.com/currencies/predictcoin, coinbase.com/price/predictcoin, bscscan.com token page snippet, x.com/PredictcoinFin snippet
- Project notes: `docs/research/06-paybox-platform.md` (PayBox chain catalog, EVM MPC wallet model)

Tried and blocked: bscscan.com (403 Cloudflare), medium.com/predictcoin (403), x.com (402, nothing read), Etherscan V2 free tier (no BSC), Blockscout BSC host (404). CoinMarketCap page (WebFetch) returned only supply: 87K circulating, 100K max (self-reported).

Fixtures saved in `docs/research/fixtures/predictcoin/`:
- `geckoterminal_token_PRED_2026-10-19.json`
- `geckoterminal_token_pools_PRED_2026-10-19.json`
- `geckoterminal_ohlcv_day_PRED-WBNB_pancakev2_2026-10-19.json`
- `dexscreener_tokens_PRED_2026-10-19.json`
- `coingecko_coin_predictcoin_404_2026-10-19.json`
- `defillama_protocol_predictcoin_summary_2026-10-19.json` (trimmed from the 1.5 MB response: metadata plus first/last/peak/last-non-zero TVL points)
- `predictcoin_finance_homepage_2026-10-19.html`
- `gitbook_master_2026-10-19.md`
- `herokuapp_football_api_root_2026-10-19.txt` (one-line record of the 404)

## 14. Suspicious / agent-aimed content

- The GitBook page and its `.md` variant carry a standard GitBook banner aimed at AI readers ("For the complete documentation index, see llms.txt ... append .md"). The WebFetch summarizer repeated it. I followed it only to read the same host's public `llms.txt` and `master.md`, both of which turned out to be empty ("Initial page"). Nothing else instructed anything. No other embedded instructions found.
- Process note: the X.com fetch returned HTTP 402 Payment Required; no payment terms were read and I stopped.

## 15. Privacy

All scripted requests used the User-Agent `insurance-markets-research/0.1`. No identifier, contact address or home path was sent in any header, URL or search query. The fixtures were grepped for `@`, the user's name and username; the only `@` hits are CDN version tags (`bootstrap@5.1.3`, `boxicons@2.1.1`) in the homepage HTML.
