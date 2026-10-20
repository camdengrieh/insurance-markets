# Bodega Market (bodegamarket.io / v3.bodegamarket.io) - venue adapter spec

Researched 2026-10-19. Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "NOT FOUND (searched: ...)" means I looked and found nothing; it does not mean it does not exist. Third-party pages were treated as untrusted data; no instructions were found in them.

**Verdict: skip (adapter priority), revisit only for catalogue completeness (P2 at best).** The venue is live and has independent liquidity, and its web app exposes a simple unauthenticated JSON read API that returns clean prices. But: (a) the API is an undocumented front-end API, not an official public one; (b) total liquidity is tiny (about 43.5K ADA, roughly $9.4K, sitting in 13 "Active" markets, 3 of which are still open for trading); (c) lifetime volume is roughly 3.5M ADA (about $0.75M at today's ADA price) and recent flow is about $12K per month; (d) it is Cardano-only (UTXO, ed25519, CIP-30), and PayBox has no Cardano chain, so a PayBox-based agent cannot fund or trade it; (e) all-in friction is about 4% of notional plus 0.7 ADA per order plus LMSR price impact; (f) there was an "oracle manipulation" incident on 2026-08-14 and activity has dropped sharply since. There is no arbitrage capacity here.

## 1. Is it still live? (H)

- `bodegamarket.io` (marketing site) HTTP 200, `last-modified: 2026-10-18 04:54:55 GMT`. `bodegacardano.org` 308-redirects to `www.bodegamarket.xyz` (same page, same etag). The landing page links "Launch V3" (current) and older V2 and V1. The page copy still says "© 2024" and a roadmap ending Jan 2025 (stale text).
- App: `https://v3.bodegamarket.io/` (Next.js on Vercel, `last-modified: 2026-10-16 08:13:30 GMT`). `https://beta.bodegamarket.io/` and `.xyz` are also linked from the landing page (not read).
- Live data from the app's own API at fetch time (2026-10-19 00:16 UTC): newest market created 2026-10-18 05:30 UTC; newest on-chain trade/claim 2026-10-18 23:47 UTC (about 33 minutes before the fetch); 13 markets "Active". (H, fixtures `getMarketConfigs_trimmed_2026-10-19.json`, `getRecentActivity_trimmed_2026-10-19.json`)
- Press cross-check: Coinotag, 2026-10-18, reports Bodega opened a market on RealFi's USDrf reaching $1M deposits on Strike Finance (the same market, `A813_SUSDRF_TO_1_MILL`, is in the API). (M)
- GitHub `bodega-market/*` is stale: `bodega-market-smart-contracts` (v1) and `-v2` last pushed 2025-07-05 (MIT licence added that day); v3 launched 2025-07-22 and **no v3 contract source is published** (M for the launch date, via TapTools article snippets; see section 9). (H for repo dates)
- DefiLlama: listed 2025-04-08, category Prediction Market, chain Cardano. TVL $1,297 on 2026-10-18; peak $1.404M on 2025-06-13. Monthly TVL fell from $680K (2025-07-01) to $16K (2026-08-01) to $1.6K (2026-09-01). So "live but a fraction of its former size". (H, fixture `defillama_bodega-market_2026-10-19_trimmed.json`)
- The DefiLlama TVL adapter clearly counts only part of the pools: the Active markets' reserves sum to about 43.5K ADA (about $9.4K) from the app API, versus DefiLlama's $1.3K (which is mostly 100K BODEGA tokens plus about 1.9K ADA). Treat DefiLlama TVL as a lower bound. (H computed, M interpretation)

## 2. Kind and market model

- **Kind:** on-chain binary prediction market AMM on Cardano. DefiLlama and the site call it a "prediction market"; the discovery label "sportsbook-exchange" is loosely right (about 90% of markets are sports moneyline/spread/total), but it is not an order book. Coinotag's phrase "tradable order book" is journalistic, not the mechanism.
- **Pricing is LMSR (logarithmic market scoring rule), per market.** (H, derived from live data plus first-party JS)
  - Each market config carries `bParam`. The app JS computes cost as `C(q) = b*ln(e^(qYes/b) + e^(qNo/b))` (Taylor-series approximations in BigInt rationals) and `price = |C(q') - C(q)| / delta_shares`; the header shows `bParam*ln 2` as the market maker's maximum loss.
  - I recomputed `yesPrice = 1/(1+exp((qNo-qYes)/b))` for all 13 Active markets from `bParam` and `totalShares`; every one matched the API `yesPrice` to 6 decimals (e.g. `57F4_EAGLES_WIN_VS_PA`: b=4328, qYes=569, qNo=1937 -> 0.421631 = API 421631). So `yesPrice + noPrice = 1` (within rounding) always. There is no Yes/No overround.
  - Initial pool liquidity equals the market maker's seed: `liquidity` 2,999,940,999 lovelace at the first history snapshot for b=4328, which is `b*ln2` ADA (3,000 ADA, about $644). The seed is the whole depth of a game market.
- **Binary only in practice:** all 1,616 markets have exactly one "option" with Yes/No (`yesTokenName`/`noTokenName`). Multi-outcome questions are not supported in v3; the v1/v2 contracts had `candidates: List<ByteArray>` (parimutuel pool, `reward = shares * total_pool / winning_pool`), but v3 replaced that. (H)
- **Tokenisation (H):** Cardano native assets. `sharePolicyId` (one per market config) with asset names `B_<id4>_YES` / `B_<id4>_NO`. The user's stake is held as share tokens in their wallet. A script address (`positionsAddress`) receives buy/sell/reward "position" UTxOs which an off-chain **batcher** applies to the pool UTxO (v2 design, README; M that v3 is the same shape, since the app says "Please allow up to 5 minutes for your bet to confirm").
- **Order types in the UI:** Market (buy/sell shares with slippage default 2%) and a "Limit Order" tab with a price field. How limit orders are enforced (batcher-held? off-chain?) is NOT FOUND (searched: docs, v2 repo README/validators, app JS). `/api/buyPosition` takes `price` and `slippage`. (H that the UI exists, L on mechanism)
- **Aggregator consequences:**
  - Quote = LMSR curve, not a book. For an arbitrage scanner you must integrate along the curve: cost to buy `d` Yes shares = `C(qY+d,qN) - C(qY,qN)` (all in payment-token units, 1 winning share = 1 unit before fee). Depth is `b`; a 100-share buy on b=2164 moves price roughly `d/(4b)` = 1.2 points.
  - `volumes.yesVolume/noVolume` in `predictionInfo` are **outstanding net shares** (they return to 0/0 if everyone sells; see the history fixture), not traded volume. Use `totalVolume` (cumulative cash, 1e6 units) for volume.
  - Market-to-market data is returned in 1e6 fixed point: `prices.yesPrice=421631` means 0.421631 of one payment unit per share; `liquidity` and `totalVolume`/`totalFees` are in 1e6 units of the payment token (lovelace for ADA markets).

## 3. Chains and collateral

- **Chain:** Cardano mainnet only. (H: site, docs, DefiLlama `chains: ["Cardano"]`.) No EVM or Solana presence found.
- **Collateral/payment token (H, from live `getMarketConfigs`, 1,616 markets):**

| Payment token | Markets | Note |
|---|---|---|
| ADA (empty policy id) | 1,593 | The overwhelming default, including every current sports market. |
| NIGHT (asset name `NIGHT` = hex `4e49474854`) | 22 | Midnight-ecosystem token wagers (e.g. "England wins ... (Night wager)"), Dec 2025 era. |
| USDM (asset name prefix `0014df10`+`USDM`) | 1 | `E7D2_CNIGHT`. |

  The marketing site and the docs say all wagers are in USDM ("USDM - The Token of Choice"). **That is stale/contradicted by live data**: only 1 of 1,616 markets is USDM. Collateral is volatile (ADA about $0.2148 on 2026-10-18, derived from DefiLlama `tokensInUsd/tokens`: 406.47/1892.71), so edge versus USD-denominated venues includes ADA/USD risk over the market's life. (H)
- Market creator can pick any Cardano token as payment token (v2 README: "supports payments with any type of token on Cardano"). (H for v2 README)
- Flat per-order costs (client constants, H): `ENVELOPE_AMOUNT = 2,000,000` lovelace and `BATCHER_FEE = 700,000` lovelace; the UI total is `baseCost + fees + slippage + 2.7 ADA`. The 2 ADA envelope is the min-UTxO that the v2 contract returns to the user with their shares/payout (so net fixed cost about 0.7 ADA, about $0.15; M since v3 source is not public).

## 4. Read API

**There is no documented API.** (H: `docs.bodegacardano.org/llms.txt` lists 14 pages, none about an API; the docs index and the GitHub org have no API/SDK repo.) NOT FOUND (searched: docs llms.txt and all pages, GitHub org repos, landing page, web search "Bodega Market API"). What exists is the **app's own Next.js route handlers**, found by reading the public JS bundles and then confirmed with unauthenticated GETs. They are unofficial and can change without notice. Classification: `unofficial-only`.

Base URL: `https://v3.bodegamarket.io` (Vercel, no auth, no cookies, `cache-control: public, max-age=0, must-revalidate`).

| Endpoint | Method used by app | Called by me | Returns (H unless noted) |
|---|---|---|---|
| `/api/getMarketConfigs` | POST `{}` | **GET** worked (HTTP 200, 2.07MB, 1,616 markets, all history) | `{marketConfigs:[{id,time,creatorAddress,img,name,description,tags[],deadline,status("Active"/"Closed"),winningSide("Yes"/"No"/null),paymentPolicyId,paymentTokenName,protocolConfigIndex,options:[{title,description,yesLabel,noLabel,yesTokenName,noTokenName,bParam,seedOutRef,fee,sharePolicyId,positionsAddress,predictionInfo:{volumes,prices,totalShares,liquidity,totalVolume,totalFees}}]}]}`. 68 closed markets have no `predictionInfo`. |
| `/api/getPredictionInfo?id=<marketId>` | GET | GET (200, about 230 bytes) | `{predictionInfo:{volumes:{yesVolume,noVolume},prices:{yesPrice,noPrice},totalShares:{totalYes,totalNo},liquidity,totalVolume,totalFees}}`. The app polls it every 30 s (`PREDICTION_INFO_REFRESH_INTERVAL=30000`). |
| `/api/getPredictionsHistory?id=<marketId>` | GET | GET (200, 3.8KB) | `{predictionsHistory:[{time(ms),projectPredictionInfo:{...same shape...}}]}`; sparse snapshots (one per applied batch), not a candle feed. |
| `/api/stats/getGlobalStats` | GET | GET (200) | `{totalAddresses:871,totalTradeVolume:3883406,totalBuys:16235,totalSells:2182,totalRewards:4955,totalBuyVolume:3421152,totalSellVolume:462254,totalRewardVolume:2916768}` (units not stated; same order as the sum of per-market `totalVolume`/1e6 = 3.78M, so about ADA-equivalent units; M). |
| `/api/stats/getRecentActivity` | GET | GET (200) | `{data:[{id,side,time,asset,price,action("Buy Position"/"Sell Position"/"Reward Position"),amount,option,address,txHash}]}`; only the latest 10 events; contains wallet addresses (redacted in the fixture). A usable public trade tape of the last few hours, nothing deeper. |
| `/api/stats/getTopVolumes[?period=]`, `/api/stats/getTopProfits` | GET | not called | Leaderboards of wallets; not needed for an aggregator. |
| `/api/transactions/getTransactions?address=`, `getTransaction?txHash=`, `/api/wallet/balance?address=` | GET | not called | Per-wallet data. |
| `/api/buyPosition`, `/api/sellPosition` | POST | **not called** (write path, out of scope) | Body `{request:{id,option:0,side,amount,slippage,address,price,canonical}}` -> `{cbor, transaction}` (see section 6). |

- **Auth / rate limits:** none required. Rate limits NOT FOUND (searched: docs, response headers show no `x-ratelimit-*`; Vercel default). The 2MB `getMarketConfigs` is the only listing endpoint, so a poller should call it sparingly (the app itself caches it for 120 s in localStorage) and use `getPredictionInfo` per open market for fresh prices (13 Active markets, 3 with deadlines in the future at fetch time).
- **WebSocket / streaming:** NOT FOUND (searched: app JS for `WebSocket`/`wss://`, docs). Polling only.
- **Resolution data:** `status` + `winningSide` in `getMarketConfigs`. Rule text is only the free-text `description`.
- **On-chain alternative (not tested):** pool state lives in a UTxO at the project-prediction script with an inline datum (v2: `ProjectPredictionDatum {outref_id,total_fee,predictions}`; v3 datum layout not published). A Cardano indexer (Koios/Kupo/Blockfrost) could read it, but needs the v3 script addresses (the `positionsAddress` and `seedOutRef` fields in the market config help) and the v3 datum schema, which I could not find. L.
- **Data-quality notes for the adapter:** (1) markets past their `deadline` can remain `Active` until someone resolves them (e.g. NFL games dated 2026-10-15/16/18 still Active at fetch time); filter on `deadline > now` and `status == "Active"`, and check `winningSide` first: `57F4_EAGLES_WIN_VS_PA` is `status: "Active"` with `winningSide: "No"` and reward claims at 0.98 already on the tape, so `status` lags resolution. (2) 110 of 1,616 markets (6.8%) are `Closed` with `winningSide: null`, which looks like void/cancelled (mechanism unverified). (3) 2026-08-14 20:48-21:11 UTC: 10 markets, including long-dated ones (Fed cuts 2026, Vance vs Newsom 2028, China/Taiwan, BTC $110K in 2026), had their `deadline` set within minutes of each other and ended `Closed` with no winner. That coincides with DefiLlama's hack record (below). Admin appears able to force-close markets. (H for the data, M for the link to the incident.)

## 5. Trade path and PayBox reachability

- **Programmatic path (observed from the app JS; not executed):**
  1. `POST /api/buyPosition` (or `/api/sellPosition`) with `{id, option:0, side:"Yes"|"No", amount (shares), slippage (default 0.02), address (bech32 Cardano address), price, canonical}`. Server builds an **unsigned Cardano transaction** and returns CBOR plus a `transaction` record.
  2. The client signs with a CIP-30 wallet (`signTx(cbor, partial)`), assembles via a helper (the app calls a utxos.dev SDK helper, `@utxos/sdk`, for `assemble`/`submit`), and submits (`wallet.submitTx` or remote submit).
  3. The position UTxO sits at `positionsAddress`; a batcher applies it to the pool "up to 5 minutes" later (UI toast).
  So trading is `POST for unsigned tx -> sign ed25519 witness -> submit`. No API key, no off-chain signed order. (H for the flow in the JS; the contract that enforces it is unpublished.)
- **PayBox reachability: no.** (H for the PayBox side from `docs/research/06-paybox-platform.md`, live `discover_tokens mode=chains` on 2026-10-19: Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid; wallet families are `evm` and `solana` only.) Cardano is not a chain PayBox supports, so there is no way to hold ADA (or NIGHT/USDM) in a PayBox wallet or bridge into one via `request_swap`. EVM transaction proposals and EIP-712 signed orders are irrelevant here. A theoretical route (sign the Cardano tx-body hash with the PayBox Solana MPC ed25519 key via `solanaMessage`, from a Cardano address derived from that key) is unverified and untested (signing tools are out of scope), and funding the address would still require an off-PayBox ADA purchase. Not a basis for a plan.

## 6. Fees

- **Rate:** `fee: 0.02` on every market option (all 1,616; H). Formula in the app JS: `fees = shares * pricePerShare * fee` (i.e. 2% of the LMSR base cost, **added on top**); `slippage` is a separate reserved buffer (`shares*price*slippage`, default 2%) included in the UI "total". (H)
- **Redemption haircut:** a winning share pays `min(pool_liquidity / winning_shares_outstanding, 1.0) * (1 - fee)`. Live claims show reward price 980000 (0.98) in `getRecentActivity` (H). So there is a second 2% on the way out; selling early also carries a fee line (`sellFeeValue` in the UI; rate presumed the same, M).
- Round trip to resolution is therefore about 4% of notional (DefiLlama's methodology also says "4% of total protocol volume", M), plus the 0.7 ADA batcher fee per order (and 2 ADA min-UTxO envelope, normally returned, M).
- **Who pays:** the trader. Protocol fee destination: DefiLlama says holders of BODEGA get 100% after 2025-06-12 (75% before) (M); docs "Staking" page says "typically, 50% of collected fees" go to stakers and 50% to treasury, with governance able to change the ratio (H as a docs statement, probably older than the DefiLlama note). The v2 README says market creators and the protocol share fees by `share_ratio` (H for the README).
- **`totalFees/totalVolume` observed per market:** 3.6% (Eagles), 5.6% (BTC $90K), 10.6% (a low-volume market). The definition of `totalFees` and `totalVolume` is NOT FOUND, so do not use them as a fee rate.

## 7. Resolution mechanism and dispute risk

- **Official statement is thin.** Cardano.org's app listing: "Settles outcomes on-chain using oracle data and Plutus smart contracts" (H). The docs have a "Mainnet V1 Market Resolution" page with 2024 election/SNEK/Tyson-Paul rules only (stale) and a "Security Assumptions" page that says V1 "is unaudited" and "purposely centralized" (H). Terms: "Winnings are automatically distributed via smart contracts once the outcome of an event is verified and settled" and disputes "will first be addressed through our internal dispute resolution process" (H, T&C last updated 2024-11-26).
- **v2 contract (H, source read):** each project stores an `oracle_policy_id` and `oracle_token_name`; the `Reward` redeemer requires a reference input holding that NFT with an inline `OracleDatum {candidate}`, and only shares of that candidate may be redeemed. So resolution = whoever controls the oracle NFT posts the winner. No on-chain dispute window or bond exists in the v2 validator. Whether v3 is the same: NOT FOUND (v3 source not published).
- **Per-market rules (H):** market `description` is free text, e.g. "Yes Eagles win / No any other outcome", "Source: Coingecko" on a BTC price market, "official statement from the U.S. SEC" for the ETF market. No resolver identity, no tie/postponement/cancellation language on sports markets (NOT FOUND, searched all 13 Active descriptions).
- **Search summaries (M, Medium pages return 403 to my fetches so unread):** the litepaper reportedly describes an internal oracle system and community/governance-token dispute resolution; a Torram case study proposes validator-based oracles; TapTools' V3 piece reportedly says a market creator must lock a BODEGA pledge (50,000, M/L, one of two searches could not find it) that is returned after resolution. The landing page shows `charli3.io` (a Cardano oracle network) among partner logos; no statement that it resolves markets (L).
- **Incident (M):** DefiLlama records a hack for Bodega Market on 2026-08-14, classification "Oracle Manipulation", amount $3,600, technique "Unknown", source field empty, language Aiken. My web search found no report of it. Ten markets were force-closed with no winner at the same time (section 4). Treat resolution risk as **high**: admin-controlled oracle, historic manipulation, mass voids, unaudited (docs say audit "partners will be announced"; DefiLlama `audits: 0`).

## 8. Geo, ToS, automation

- T&C (H, last updated 2024-11-26, operator "Bodega Labs", governing law Dubai): users must be 18+, "You are not allowed to use the Services if you are located in a country where participating in prediction markets or betting activities is illegal"; "Betting on illegal activities or creating markets for illegal events is strictly prohibited"; can terminate "for any reason". No named country list, no KYC, and no explicit rule about bots, APIs or automated trading (NOT FOUND, searched T&C and Privacy Policy headings). The T&C also still says bets are in ADA/"Cardano native tokens", which differs from the site's "USDM only".
- No geo-block seen in the app HTML/JS or from my fetches (I did not load the app in a browser). The roadmap mentions a future "U.S. operating license" (stale, Q1 2025).
- Using `/api/*` outside the web UI is unsanctioned (undocumented), and the batcher/buy API trusts the caller-supplied `address`. Compliance exposure for an automated trader is therefore unknown.

## 9. Liquidity (all fetched 2026-10-19 unless stated)

| Metric | Value | Source |
|---|---|---|
| Lifetime volume | 3.47M ADA across 1,525 ADA-denominated markets (about $0.75M at 2026-10-18 ADA price; USD at trade time was higher because ADA was pricier in 2025). App global stat `totalTradeVolume` 3,883,406 (units unstated). | H (computed from `getMarketConfigs`; `getGlobalStats`) |
| Lifetime participants / trades | 871 addresses; 16,235 buys, 2,182 sells, 4,955 reward claims | H |
| Recent flow | Markets created in the last 30 days: 34, total volume to date 57K ADA (about $12.3K); last 60 days 100K ADA ($21.5K); last 90 days 126K ADA ($27K). Median market in the last 90 days: 521 ADA (about $112) of volume; max 16.6K ADA (a BTC/ADA price market). | H (computed) |
| Volume by creation month | peak 2025-12: 484K ADA over 167 markets; 2026-07: 262K; 2026-08: 40K over 38 markets; 2026-09: 48K over 34; 2026-10 (to 18th): 28K over 22 | H (computed) |
| Current pool reserves (13 Active markets) | 43.5K ADA (about $9.4K). Only 3 have deadlines still in the future: sUSDrf TVL 766 ADA, Knicks/76ers 2,507 ADA, Cowboys/Packers 2,155 ADA. The other 10 are finished games awaiting resolution. | H |
| Per-game depth | b of 2,164-7,213 for NFL/NBA games; max market-maker loss `b*ln2` = 1,500-5,000 ADA ($320-$1,070) | H |
| DefiLlama TVL | $1,297 (2026-10-18); peak $1.404M (2025-06-13) | H |
| DefiLlama fees | cumulative $80.9K, series ends 2025-08-22 (adapter stalled) | H (stale) |
| BODEGA token | CoinGecko: market cap about $174K, 24h volume about $16.9K (no timestamp; page uses relative times) | M |

Market creation is shrinking (22 markets created 2026-10-01..18 versus 120-167 per month in late 2025 / early 2026).

## 10. Event-category overlap (where arbitrage could exist)

By count of markets (H, tag of first tag; ADA markets): sports 1,379 (2.0M ADA lifetime volume), crypto 108 (1.13M ADA), politics 20, finance 7, stocks 4, pop culture 4. Name hits: NBA 463, NFL 206, ADA-related 69, UFC 43, NCAA 39, NHL 34, MLB 31, BTC 10, ETH 10, EPL 10, Fed 4.

- **Sports (US leagues, EPL, UFC):** moneyline and point-spread/total markets on the same games Polymarket, Kalshi, SX Bet, Overtime and others list. These are the only recurring overlap. But per-game depth is $320-$1,070, a trade over about 100 shares moves price over a point, and fees are about 4% round trip. A spread of 5-10 points versus a deep venue would barely cover costs on tickets of tens of dollars.
- **Crypto price:** BTC/ETH/ADA threshold-by-date markets (e.g. "BTC reaches $90,000 before October 20th 2026", source CoinGecko) overlap Polymarket/Kalshi/Limitless ladders; ADA/SNEK/NIGHT price markets are Cardano-ecosystem specific and have no equivalent elsewhere.
- **Politics/macro:** a handful (Fed cuts, Senate control, Vance vs Newsom); the largest were force-closed on 2026-08-14.
- **Cardano-native event markets (unique):** SEC Cardano ETF, SNEK treasury loan, RealFi sUSDrf TVL. No overlap, so no arbitrage, but they are signals about the Cardano community only.

## 11. Shared liquidity

None found. Each market is its own LMSR pool seeded by the market creator/protocol on Cardano (`seedOutRef`, `liquidity` = b*ln2 at start). It does not route to or mirror another venue's book (NOT FOUND, searched: docs, v2 README, app JS, DefiLlama `forkedFrom: null`). So it would be an independent leg if it were liquid and reachable, which it is not.

## 12. Adapter notes (if built anyway)

- Listing: GET `/api/getMarketConfigs` (2MB; once per few minutes), keep `status=="Active" && deadline>now`. Map `yesPrice/1e6` -> Yes probability; No is `1 - Yes` (sum is 1).
- Fresh price: GET `/api/getPredictionInfo?id=<id>` every 30 s per open market. Recompute from `bParam`, `totalShares` if you want to validate: `p = 1/(1+exp((qNo-qYes)/b))`.
- All-in executable price for `d` Yes shares: `(C(qY+d,qN)-C(qY,qN)) * (1+0.02)` plus 0.7 ADA batcher; payout per winning share `0.98 * min(1, liquidity/winningShares)`. Convert ADA to USD with a price feed and carry ADA/USD risk.
- Resolution: poll `status`/`winningSide`; treat `Closed` with `winningSide==null` as void/refund (unverified).
- Fixtures for tests: `docs/research/fixtures/bodega-market/*`.

## 13. Not found / open questions

- Official API docs, rate limits, WebSocket, SLA: NOT FOUND (searched: docs.bodegacardano.org llms.txt and pages, GitHub org, landing page, app JS, web search).
- v3 smart contract source and audit: NOT FOUND (org has v1 and v2 only; DefiLlama `audits: 0`).
- v3 resolver identity, dispute window, void/refund rules: NOT FOUND for v3 (v2 oracle-NFT design read; litepaper unreadable, Medium returned 403).
- Limit-order mechanism and whether `fee` is paid on sells: NOT FOUND.
- Exact definition of `totalVolume`/`totalFees` and of the global stat units: NOT FOUND.
- Whether bots/automation are permitted, and any geo-block list: NOT FOUND.
- The 2026-08-14 incident: only DefiLlama's hack record plus the market closures; no write-up found. The `x.com/BodegaCardano` status page I tried returned HTTP 402 to the fetch tool (no payment terms in the body); I stopped there and did not retry.
- Whether `getMarketConfigs` GET (the app uses POST) is intentionally supported or an accident: unknown. I only used GET.

## Sources

1. https://www.bodegamarket.io (H: product, links, V3/V2/V1, roadmap text, headers/`last-modified` 2026-10-18; also reached via https://www.bodegamarket.xyz)
2. https://docs.bodegacardano.org/llms.txt and `.md` pages: protocol (empty), features, staking, mainnet-v1-market-resolution, mainnet-v1-security-assumptions, roadmap, terms-and-conditions (H; most pages 2024-era, stale)
3. https://github.com/bodega-market (H: repos and push dates); https://github.com/bodega-market/bodega-market-smart-contracts-v2 (README, `lib/bodega/types.ak`, `validators/project_prediction.ak`; H, last push 2025-07-05, so stale for v3)
4. https://v3.bodegamarket.io (H: Next.js app; public JS chunks read as text for API routes, LMSR code, constants `ENVELOPE_AMOUNT`, `BATCHER_FEE`, `DEFAULT_SLIPPAGE`; GETs of `/api/getMarketConfigs`, `/api/getPredictionInfo`, `/api/getPredictionsHistory`, `/api/stats/getGlobalStats`, `/api/stats/getRecentActivity` on 2026-10-19)
5. https://api.llama.fi/protocol/bodega-market and https://api.llama.fi/summary/fees/bodega-market (H for what the API returned; M for what it implies; website defillama.com returned 403)
6. https://cardano.org/apps/bodega-market/ (H: oracle/settlement sentence, link to v3)
7. https://www.coingecko.com/en/coins/bodega (M: token market data, no timestamp)
8. https://en.coinotag.com/cardano-ada-stablecoin-1m-strike-vault-bet (M: 2026-10-18 article)
9. Web search summaries (M/L): TapTools "Bodega V3 Launches on Cardano" (https://medium.com/tap-in-with-taptools/bodega-v3-launches-on-cardano-22d4bc0903a7), Bodega litepaper (https://medium.com/@bodegacardano/bodega-market-litepaper-a-new-frontier-for-prediction-markets-7fe052093c6a), Torram case study (https://torram.xyz/case-study-bodega-market-x-torram/), LBank overview. Medium pages were not readable (HTTP 403).
10. PayBox chain/wallet support: `docs/research/06-paybox-platform.md` (H, from live `discover_tokens` on 2026-10-19).

Fixtures (docs/research/fixtures/bodega-market/): `getMarketConfigs_trimmed_2026-10-19.json` (6 of 1,616 markets, wallet addresses redacted), `getPredictionInfo_57F4_EAGLES_2026-10-19.json`, `getPredictionsHistory_57F4_EAGLES_trimmed_2026-10-19.json`, `getGlobalStats_2026-10-19.json`, `getRecentActivity_trimmed_2026-10-19.json` (5 of 10, addresses redacted), `defillama_bodega-market_2026-10-19_trimmed.json`, `defillama_fees_bodega-market_2026-10-19_trimmed.json`.
