# PlotX (plotx.io, token PLOT) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: official site and docs (curl/WebFetch GETs), GitHub files via `gh api`, public unauthenticated GETs to CoinGecko and DefiLlama, public Telegram channel preview. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages were treated as untrusted data; nothing in them was followed. The WebSearch budget for the session was exhausted at the start of this task (no web search was possible, and I did not work around it), so liveness rests on first-party artefacts and public APIs rather than news.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or inferred; **L** = weak or stale.

---

## 0. Bottom line

1. **PlotX is not a prediction-market venue any more in any usable sense. It rebranded in 2022 to a "skill-based fantasy trivia game"** (H, https://docs.plotx.io and https://plotx.io). The crypto "Forecast" product is still documented as one tab inside that game, but every first-party artefact is frozen in 2022: docs "Last updated 4 years ago", site build `Last-Modified: 22 Oct 2022`, sitemap `lastmod 2022-09-29`, Terms "Last updated: 29 June, 2022", official announcement channel's newest visible post 2022-11-18, GitHub last push 2022-09-16.
2. **I could not confirm any live market.** There is no public market-data API, the web app host `app.plotx.io` serves the same static marketing page as `plotx.io`, the Google Play listing URL returns 404, DefiLlama has no PlotX entry, and the Polygon market contract addresses are not published in the docs or GitHub. Only the PLOT token still trades, on tiny DEX volume (24h ~ $1.15k).
3. **Even if it were running, it would not be an arbitrage leg**: in-app "Game Wallet" funded in PLOT (deposits non-withdrawable), parimutuel pool with 3 options (up / flat / down) on short crypto price windows, ToS bans bots/automation and US/India/Singapore users, no API, and PLOT-denominated pools of unknown size.
4. **adapter_priority = skip.** Revisit trigger in section 12.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| plotx.io homepage | `<title>PlotX - Fantasy Trivia Game</title>`; Angular SPA with empty meta tags; HTTP 200 from S3/CloudFront, `Last-Modified: Sat, 22 Oct 2022 09:51:38 GMT`, cached copy dated 2026-10-05 (https://plotx.io) | H |
| app.plotx.io | Returns the **same** 8,882-byte index.html with the same `Last-Modified` 2022-10-22 as plotx.io; "Launch App" links point at it, so the separate web app is not served from there (curl GET, 2026-10-19). I cannot render JS, so I cannot rule out a client-side redirect. | M |
| Site copy | "PlotX is an all new crypto-based fantasy trivia game! Join contests about what you love - crypto, cricket, football, pop culture ..." (footer, in https://plotx.io/main.*.js) | H |
| Pre-rendered `/categories/crypto-forecast/` page | Static stats "235,405 Contest Held / 2,141,141 Answers Collected / $13,903,638 Rewards Paid" and a leaderboard; these are hard-coded 2022 values, not live (https://plotx.io/categories/crypto-forecast/) | H (page) / L (as live data) |
| Roadmap page | Items through 2024 ("Start of project transformation into PlotXDAO ... Full transfer of project control to the PlotXDAO"); no 2025-2026 entries (https://plotx.io/roadmap/) | H |
| Docs | "PlotX v2.5", every page "Last updated 4 years ago"; no mention of 2025/2026 (https://docs.plotx.io, https://docs.plotx.io/llms.txt) | H |
| Terms of Use | "Last updated: 29 June, 2022" (https://plotx.io/terms/) | H |
| Telegram announcements preview | 20 visible posts span 2022-07-09 to **2022-11-18**; the main group's preview shows no posts, 1,733 members (https://t.me/s/plotx_ann, https://t.me/s/plotx_official) | H |
| Google Play listing | `https://play.google.com/store/apps/details?id=com.plotx.plotx` (link taken from the docs) returned HTTP 404 via WebFetch. May be geo-dependent. | M |
| GitHub org `plotx` | 6 repos; newest push `smart-contracts-L2` 2022-09-16; no archive flag; org itself last updated 2021 (`gh api orgs/plotx/repos`) | H |
| DefiLlama | `api.llama.fi/protocol/plotx` -> "Protocol not found"; `/protocols` list (8,758 entries) has no PlotX/PLOT entry | H |
| Token still trades | CoinGecko: price $0.00341671, mcap $356,180, 24h volume $1,152, last updated 2026-10-19T01:07Z; all-time low $0.00259 set **2026-06-27**; categories include "Prediction Markets" (fixture) | H |
| Snapshot of CMC/CG tagging | The "prediction markets" tag that put it on the discovery list is a CoinGecko/CMC token-category tag, not evidence of an operating venue | M |

Verdict: **still_live = false** in the sense that matters (no verifiable, operating market venue). The PLOT token and the legacy contracts exist; whether the Polygon market contracts or the relayer still run could not be verified (explorer APIs I tried were behind a Cloudflare challenge, and I did not try to bypass it).

---

## 2. Kind and market model

- **Kind (H, docs):** originally "DeFi prediction market protocol" (v1 on Ethereum 2020-10-13, v2 on Polygon 2021; https://docs.plotx.io/plot-token/token-insights.md). By v2.5 (2022) it was repositioned as a play-to-earn fantasy trivia game with two products:
  1. **Sports/NFT/pop-culture "Challenges"**: 10 questions per challenge, entry-fee "Contests", points scoring (+10 correct, -4 wrong, 2X multiplier and Zero-Loss power-ups), leaderboard payouts. This is a skill contest, not a tradable market. (H, https://docs.plotx.io/calculation/sports-challenges.md)
  2. **Crypto "Forecasts"**: Rapid (15 min live), Hourly, Daily, Weekly markets on ~9 assets (BTC, ETH, MATIC, BNB ...). Three options per market: **Going Up / Staying Flat / Going Down**. (H, https://docs.plotx.io/gameplay/crypto.md, https://docs.plotx.io/faqs/crypto.md)
- **Pool model (H, docs + contract source):** parimutuel. "The winning option gets the sum of the amount at stake in the other two options" and is split by "Pool Share" (https://docs.plotx.io/calculation/crypto.md). The contract is more nuanced: a stake buys **prediction points = stake / optionPrice**, where `getOptionPrice` is a time-and-stake-weighted curve (`MarketUtility.calculatePredictionPoints`, `getOptionPrice`), so early entries get more points per PLOT, and rewards are pro rata to points on the winning option (`AllMarkets._addUserReward`). The v2.5 docs describe a plain share-of-stake formula; I did not reconcile the two (L on exact payout math).
- **No tokenised outcomes, no order book, no secondary market.** Positions are rows in contract storage (`userData[...]`), not ERC-20/1155 tokens. (H, `contracts/AllMarkets.sol` in https://github.com/plotx/smart-contracts-L2, branch `dev-l2-version`)
- **Market strikes:** neutral band set at market creation (`neutralMinValue`/`neutralMaxValue`, `optionRangePerc`); result = option 1 if price < min, 3 if price > max, else 2. (H, `_postResult`)
- **Scalar/categorical:** none. A 3-way (down/flat/up) price-band bet is the only on-chain market type.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chains | Ethereum (v1, 2020; PLOT token only now) and **Polygon** (v2 markets). BSC / Polkadot / rollups were "next milestones" and never documented as shipped. | H |
| PLOT token (Ethereum) | `0x72f020f8f3e8fd9382705723cd26380f8d0c66bb`, 200M supply, ~104.2M circulating (CoinGecko, 2026-10-19) | H |
| PLOT token (Polygon) | `0xe82808eaa78339b06a691fd92e1be79671cad8d3` | H |
| Collateral | **PLOT only** for staking. Deposits in MATIC, USDC, USDT, WETH, DAL, WMATIC are "converted to $PLOT" on entering the Game Wallet. (https://docs.plotx.io/managing-funds/game-wallet.md, getting-started.md) | H |
| Withdrawal | Only "Winnings Funds" are withdrawable, on Polygon only; "Deposit Fund" and "Bonus Funds" are not withdrawable. | H |
| Market contract addresses (Polygon) | **NOT FOUND** (searched docs.plotx.io pages, README/migrations/scripts of the `plotx` GitHub repos). The README lists only the 2020 Ethereum L1 set (Master `0x03c4...7275`, AllMarkets `0xb944...c29A`), which predates v2. | H (absence) |

---

## 4. Read API

- **Official/public API: none found.** `api.plotx.io` does not resolve. The site bundle contains no backend base URL (only Mixpanel analytics and social links). The docs have no API reference. NOT FOUND (searched: docs.plotx.io llms.txt index and all pages, plotx.io bundle strings, GitHub org READMEs).
- **On-chain read (theory only):** the contract exposes views that would be enough for a scanner if the Polygon address were known and the contract live: `getMarketData`, `getAllOptionPrices` (MarketUtility), `getMarketResults`, `getReturn`, `getTotalStakedWorthInPLOT`, events `PlacePrediction`, `MarketResult`, `DisputeRaised`. (H, source of `contracts/AllMarkets.sol`, `MarketUtility.sol`). I did not call any RPC.
- Websocket: none.
- Fixtures: no PlotX API response exists to save. Two third-party **token** snapshots are saved instead (see section 11).

---

## 5. Trade path (programmatic)

- **None supported.** Entry is through the PlotX app (email/Google/Facebook "Magiclink" embedded wallet, or a Web3 wallet) and an in-app Game Wallet. (H, https://docs.plotx.io/getting-started.md)
- On-chain, the contract supports `depositAndPlacePrediction(tokenDeposit, marketId, asset, stake, option)` and `withdraw`, with `_msgSender()` meta-transaction support so a relayer can pay gas ("gasless"). (H, source.) In principle any EVM wallet on Polygon could call it.
- **PayBox reachability: no.** (1) No verified-live Polygon market address. (2) Stakes are PLOT, which a PayBox wallet would have to swap into first. (3) Docs say Game Wallet deposits cannot be withdrawn, only winnings. (4) ToS prohibits bots and automation (section 8). So even a technically possible transaction proposal is not a sensible leg.

---

## 6. Fees

- **2% transaction fee on crypto forecasts**; "no gas fees" because of meta-transactions. Contest entry fees apply to Challenges. (H, https://docs.plotx.io Overview "Cost of interacting with PlotX")
- Contract: `cummulativeFeePercent` (basis points of stake, taken from the stake at entry), split into DAO fee, market-creator fee, referrer/referee fees, and the remainder to the relayer. Values are governance parameters (`updateUintParameters` codes CMFP, DAOF, MCF, RFRRF, RFREF); the live values are not in the source. (H, `_deductFee`, L on the live numbers.) The 2% figure is the only documented value.
- Fiat on-ramp via Transak has its own fees (not PlotX's). (M, docs)

---

## 7. Resolution mechanism and dispute risk

- Cycle (H, https://docs.plotx.io/faqs/crypto.md): Live -> In Settlement -> **Cooling** (1/4 of the cycle) -> Settled. Anyone can raise a dispute during Cooling (stake PLOT; contract `raiseDispute`, `getDisputeResolutionParams`).
- **Oracle conflict (flag):** the docs FAQ says the protocol "will note down the price of ETH from the Binance ETH/USDT market". The contract reads a **Chainlink** feed via `getSettlemetPrice(feed, settleTime)` (rounds walked back to `settleTime`), or lets an `authorizedMultiSig` post the result by hand when no feed is configured (`postMarketResult`). So resolution has a centralised fallback. (H, source; docs vs code unreconciled, and the deployed Polygon version may differ.)
- Disputes: `resolveDispute` is `onlyAuthorizedToGovern` (the team/governance, not a decentralised oracle). Dispute stake is burned if rejected. Wrong-resolution risk is therefore a governance/trust risk. (H, source)
- Void/refund rules for an empty winning option: not documented in the pages I read (NOT FOUND).

---

## 8. Geo, ToS, automation

From Terms of Use, last updated 2022-06-29 (H, https://plotx.io/terms/):

- Restricted Territories (access prohibited, incl. VPN circumvention): "... India, ... Singapore, ... United States of America, ..." plus sanctioned jurisdictions. "PlotX reserves the right to enforce geo-blocking".
- Automation: users may not "design or assist in designing cheats, exploits, automation software, bots, hacks ..." or "scrape, spider, or crawl the Content". An aggregator that trades or scrapes would breach this.
- 18+ only. Offers/bonuses can be revoked at any time.
- Site `robots.txt`: `Allow: /` for all agents; Googlebot disallowed from `/categories/crypto-game` and `/*?*` (H).

---

## 9. Liquidity (with dates and sources)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Market TVL / OI | **Unknown / not tracked.** No DefiLlama entry. No on-chain query possible without the Polygon market address. | DefiLlama `/protocols` checked 2026-10-19 | H (absence) |
| Historical claim | "$13,903,638 Rewards Paid" cumulative; v1 TVL "up to $220K in about 2 months" of launch (Oct 2020) | pre-rendered 2022 page; docs token-insights | M (stale, 2022) |
| PLOT token 24h volume | $1,152 total: Quickswap (Polygon) PLOT/USDC.e-type pair $689 (quote token `0x2791...4174`), Uniswap V3 (Ethereum) PLOT/WETH $456, Quickswap PLOT/QUICK-type pair $8 (quote token `0x8317...DC13`), Uniswap V2 (Ethereum) PLOT/WETH $7 | CoinGecko, 2026-10-19 | H |
| PLOT market cap | $356,180 (price $0.00341671; ATL $0.00259 on 2026-06-27; ATH $0.377 on 2021-03-19) | CoinGecko, 2026-10-19 | H |
| Community | Discord ~2,690 members and Telegram group 1,733 members (stale, as of the 2022 posts and the 2026 preview) | t.me preview | M |

Conclusion: no evidence of any market liquidity in 2026; if markets still run, the pools are in PLOT-denominated tokens worth a fraction of a $356k cap.

---

## 10. Event coverage and arbitrage relevance

- Overlap with other venues would be **crypto price direction** (BTC, ETH, MATIC, BNB ... over 15 min / 1 h / 1 d / 1 w) against Polymarket/Kalshi/Limitless/Myriad up-or-down markets. But the outcome is 3-way with a band set by PlotX and a parimutuel, time-weighted payout, so prices are not comparable to a binary share price without simulating the points curve.
- Sports/NFT/pop-culture challenges are skill contests with leaderboard prizes: no price, not arbitrageable.
- **Independent liquidity?** Yes, PlotX has its own pools (no shared liquidity with another venue found). Moot because the liquidity is effectively nil/unknown.
- Signal value for the aggregator: none (no price feed, no volume).

---

## 11. Fixtures saved (<= 50 KB each; third-party token data, because PlotX has no read API)

- `docs/research/fixtures/plotx/coingecko-plot-token-2026-10-19.json` - trimmed CoinGecko coin record (price, mcap, volume, platforms, categories).
- `docs/research/fixtures/plotx/coingecko-plot-tickers-2026-10-19.json` - the four DEX tickers and their 24h volumes.

---

## 12. Integration recommendation

- **adapter_priority: skip.** No API, no verified-live market, bot-prohibiting ToS that excludes US users, PLOT-only collateral, unknown liquidity, centralised resolution fallback.
- **Revisit trigger (cheap, scriptable):** if a Polygon `AllMarkets` address is ever published, `GET` a Polygon Blockscout/Polygonscan `addresses/<addr>` and `logs` for `PlacePrediction`/`MarketResult` events in the last 7 days. Absence of events after 2022-11 would confirm that the markets are dead. Also watch https://docs.plotx.io/llms.txt for a changed index and https://plotx.io for a new `Last-Modified`.
- To close the "is it running" question for certain, the cheapest primary-source check is a Polygon explorer event query for the PLOT token transfers to/from the market contract; I could not do it here because Blockscout was behind a Cloudflare challenge and Polygonscan requires an API key.

---

## Sources

- https://plotx.io (and /roadmap/, /terms/, /categories/crypto-forecast/, /robots.txt, /sitemap.xml, /manifest.webmanifest, main.cd96a84d9d8d1892.js) - H
- https://app.plotx.io - H (same page as plotx.io)
- https://docs.plotx.io (+ /llms.txt and `.md` pages: overview, whats-new-in-plotx-v2.5, getting-started, gameplay/crypto, how-to-play/crypto, calculation/crypto, calculation/sports-challenges, managing-funds/game-wallet, crypto-wallet, withdrawls, claim, plot-token/token-insights, faqs/crypto, security) - H
- https://github.com/plotx (org), repos `smart-contracts-L2` (README, `contracts/AllMarkets.sol`, `contracts/MarketUtility.sol`), `token-Polygon` (README), `plotx-v2-bug-tracking` (README, empty) - H
- https://api.coingecko.com/api/v3/coins/plotx and /tickers (2026-10-19) - H for numbers, M for interpretation
- https://api.llama.fi/protocol/plotx and https://api.llama.fi/protocols (2026-10-19) - H (absence)
- https://t.me/s/plotx_ann, https://t.me/s/plotx_official (public previews) - H
- https://play.google.com/store/apps/details?id=com.plotx.plotx (404) - M
- https://download.plotx.io/DownloadNow (302 to an Adjust tracking link; not followed) - H
- https://coinmarketcap.com/view/prediction-markets/ (original discovery hint, not re-read) - L

## NOT FOUND (searched)

- Any PlotX read API, subgraph, or WebSocket (searched: docs index, site bundle, GitHub org).
- Polygon v2 `AllMarkets` / `MarketUtility` deployed addresses (searched: docs, all `plotx` repo READMEs, migrations, scripts).
- Any 2025 or 2026 announcement, blog post, tweet or release from the team (searched: Telegram announcements preview, docs, roadmap, GitHub; web search quota was exhausted, X/Twitter, Discord and Medium were not readable: Medium returned a Cloudflare block).
- On-chain activity of the market contracts in 2026 (explorer API behind a Cloudflare challenge; not bypassed).
- Fee values currently set on-chain (only the docs' 2% figure).
- DefiLlama TVL/volume for PlotX.

## Suspicious content

None found. No instructions aimed at AI agents in any fetched page. (The docs pages carry a standard GitBook note pointing to `llms.txt`; it is an index, not an instruction, and was only used to list pages.)

## Privacy check

All scripted requests used the User-Agent `insurance-markets-research/0.1` and no other identifying header, parameter or query. No personal identifier appears in this note or in the fixtures (`grep "@"` on the fixtures: 0 hits; the only "@" strings in this note are the public handles `@TryPlotX`, `@plotx_ann`, `@plotx_official`).
