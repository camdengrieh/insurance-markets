# Fortune Protocol (fortuneprotocol.io) - venue spec

Researched 2026-10-19. Read-only: WebFetch of public pages, `gh api` for public GitHub files, `curl` GETs of public static assets and Polymarket's public builder feeds, WebSearch (extended) for coverage. No account, wallet, key, POST, signing or payment. The Fortune-run backend hosts found in the site bundle are undocumented and were NOT probed (they are not documented API hosts). On-chain `eth_call` reads were not done (JSON-RPC is POST); BscScan-family GET APIs refused free access for BSC. A final WebSearch was refused (session search budget used up).

Confidence tags: H = read first-hand in a primary source this session (URL in Sources); M = secondary or inferred; L = weak or stale.

## Verdict

- Adapter priority: **skip**. Confidence: high.
- Fortune is a **front end, fee layer and AI-agent product on top of Predict.fun (BNB Chain) and Polymarket (Polygon)**, not an independent venue (H, S3 aggregator page: "Live Now: Predict.fun, Polymarket"; H, S5 on-chain source; H, S6 bundle). Prices, books and fills are the underlying venues'. It can never be an independent arbitrage leg.
- It has **no public or documented API** (H that none is documented, S3 to S7). Its "Prediction trading APIs" and "Institutional API / SDK" are listed as future revenue and a 2027 roadmap item (H, S3).
- Its only own market logic is a small **owner-created, owner-resolved LMSR contract on BNB Chain** (H for the repo source, S5; deployed bytecode not compared, M). Not integrable as a trustworthy price source.
- Its headline on-chain volume is **caller-asserted calldata, and campaign/points driven** (see Liquidity). Treat it as an upper bound at best.
- Residual value for the project: (a) a **registry alias** so Fortune-routed flow is labelled Polymarket / Predict.fun; (b) a tripwire if Opinion (Q4 2026) or Kalshi (2027) routes go live (still duplicates, H, S3); (c) a negative data point for "volume integrity" (points farming on BNB).

## Liveness (still live in 2026?)

Live, young, actively shipping.

- `https://fortuneprotocol.io` returns HTTP 200, `last-modified` 2026-09-19 (H, S1). It is a Vue single-page app; the HTML shell only has `<title>Fortune</title>` (this is why only the word "Fortune" was extractable; fixture saved). `https://bot.fortuneprotocol.io/` (Fortune Agent) returns 200, `last-modified` 2026-09-29 (H, S1).
- GitHub org `Fortune-Protocol` created 2026-04-07; contracts and front-end repos pushed 2026-09-16 (H, S4).
- Polymarket liquidity integration announced on X on 2026-08-25 (M, crypto.news, S9); roadmap ticks "Polymarket liquidity integration live" in Q3 2026 (H, S3).
- Pre-A round (investors reported: MH Ventures, Mapleblock, NewTribe, Basics, Everwood; size undisclosed) reported 2026-08-03 (M, S10); seed $1.25M and Pre-A $3M claimed in the roadmap (H that docs claim it, S3). AI Lightning Prediction feature reported 2026-09-18 (M, S11).
- Latest dated company metric: 15,000+ agent subscribers as of 2026-09-30 (H that the docs say it, S3; self-reported). Dune dashboard has data through 2026-10-18 (H, S8).
- No October 2026 independent news found (M; search pass was before the budget ran out).
- Token: `$FORTUNE` not launched. TGE and IEO are Q4 2026 roadmap items (H, S3). CoinMarketCap page is a "preview page" with zero circulating supply (H, S2).

## Kind and market model

- Kind: **aggregator / broker front end + AI trading agent + fee-per-action points system** (H, S3, S6).
- Routes:
  1. **Predict.fun route (BNB Chain):** the browser calls `https://api.predict.fun/` directly (`/v1/markets/{id}/orderbook`, `/v1/orders`, `/v1/auth/message`, `/v1/auth`), and separately calls Fortune's wrapper contract `buyShares(marketId, isYes, shares, cost, platform)` which only collects a BNB fee and emits an event (H, S5, S6). Platform code `2` = Predict.fun (H, source comment). A second call site passes `3` (probably Polymarket; M, not traced).
  2. **Polymarket route (Polygon):** the bundle uses Polymarket's builder/relayer client (`RelayClient`, `BuilderConfig`, deposit-wallet derivation and batch execution) against Fortune-hosted `poly.fortuneprotocol.io/{clob,relayer,builder/sign,proxy/*,order/place-raw}` (H that the strings are in the bundle, S6; behaviour M, not probed). Gamma API is used for market metadata (`gamma-api.polymarket.com/markets/slug/`).
  3. **Kalshi and Opinion:** the bundle has Fortune-run `kalshi.fortuneprotocol.io/api/` (categories, events) and `opinion.fortuneprotocol.io/api/` hosts and a `/kalshi-details/:slug` route, but the docs say Opinion is upcoming and Kalshi is 2027 (H, S3, S6). Read-only listing at most; no trading evidence.
  4. **Native LMSR markets (BNB Chain):** `FortuneMarketLMSR`. Binary YES/NO, logarithmic market scoring rule with liquidity parameter `b`, USDT collateral, shares are internal accounting (no ERC-20/1155 outcome tokens; `mapping(address => UserPosition)` inside the market struct). Owner-only `createMarket` and `resolveMarket` (H, S5). The front end has `/admin-predict` pages that call `resolveMarket`.
- Marketed but not live: "Dynamic pm-AMM" liquidity engine, perpetuals/options on prediction events (2027), staking and lending (Q4 2026) (H that docs describe them, S3). pm-AMM is described as "Implementation Architecture" with open market creation, but no contract for it exists in the public repo (H, S4 file list).
- LMSR payout detail (H on source, deployed code unverified): a winner is paid `shares * winningPool / totalWinningShares`, where the pool is what traders paid in (minus a 2% resolution fee and the founder refund). It is not a fixed 1.00 per share, so native prices are not cleanly comparable to 0-1 binary prices on other venues (M interpretation).
- Which markets Fortune lists: whatever Predict.fun and Polymarket list, plus a Sports Agent that trades football on Polymarket-style markets (moneyline, totals, spreads, both-teams-to-score) (H, S3). Full catalogue: NOT FOUND (no API probed).

## Chains and collateral

- **BNB Smart Chain (56):** native LMSR and the Predict.fun fee wrapper; collateral USDT (BSC-USD `0x55d3...7955`, 18 decimals) plus a BNB-denominated flat fee (H, S4, S5).
- **Polygon (137):** Polymarket route and agent trading account; deposits are bridged and swapped into Polymarket's USD collateral, withdrawals return to any chain/token (H, S3 user guide: gas, swap and bridging fees, "different address types create different trading accounts", Polygonscan for the trading account).
- Deposit sources named: Solana (SOL example) and others via a permanent per-user deposit address (H, S3).
- Contract addresses (from the front-end bundle and Dune; the repo README lists a different set, so it is stale or differently labelled):
  - Native LMSR `FortuneMarket`: `0xD179eD651a6863D1c9093EF4b7dd16B8CF4CBE92` (H, bundle calls `resolveMarket` and USDT `approve` on it, S6).
  - Predict.fun fee wrapper `Fortune2PredictFun`: `0xd84Cf9Fc929f7CA657d9762b5157515fF19C157E` (H, bundle `buyShares(..., 2)`; Dune names it the "main aggregated prediction contract", S6, S8).
  - Vote contract `0xebd0F63Acd642F451C2e80Ca3c04825B452F3B9a` (README lists it as "Voting Council", S4).
  - Deployed bytecode vs GitHub source: NOT VERIFIED (no explorer GET available, no `eth_call`).

## Read API

- Official public read API: **none documented**. NOT FOUND (searched: Gitbook `llms.txt` and `llms-full.txt` (33 index lines, all pages read), the three GitHub repos' file trees, the 7.2 MB site bundle, the whitepaper PDF listing, CoinMarketCap, press coverage).
- Docs URL: `https://fortuneprotocol.gitbook.io/fortune/` (product docs only, no API reference). Machine-readable index: `/llms.txt`, `/llms-full.txt` (H, S3).
- Undocumented Fortune-run backends visible in the bundle (not probed, not an integration surface): `api.fortuneprotocol.io/api/` (`marketEventLst`, `marketEvent/{id}`, `voteEventLst`, `balance/{addr}`, `predict_top`, `aicombo`, `aisign`, `bscLogin`, `withdraw`, referral/invite endpoints), `kalshi.fortuneprotocol.io/api/`, `opinion.fortuneprotocol.io/api/`, `poly.fortuneprotocol.io/*`. Auth, schema, limits and terms of use: NOT FOUND. A mirror host `*.fortuneweb4.com` exists for dev/other domains.
- On-chain: wrapper events `SharesBoughtThirdPaty(marketId, buyer, isYes, shares, cost, platform, price, bnbPaid)`; native events `MarketCreated`, `SharesBought`, `SharesSold`, `MarketResolved`, `WinningsClaimed`; views `getMarketInfo`, `getCostForShares`, `getRefundForShares`, `getUserPosition` (H, S5). These are usable by an indexer, but see the integrity caveat.
- Dune dashboard by the team (H, S8): `https://dune.com/fortune_protocol/prediction-market-growth-metrics-bnb-chain`. Dune API access needs a key (not used).
- The correct read sources for the underlying liquidity are Predict.fun's and Polymarket's own APIs (covered in the parallel workflow). Public Polymarket feeds that mention Fortune-like builders are in Liquidity.
- **No response-shape fixtures of a Fortune API exist** because none is documented. Fixtures saved are Polymarket feed rows and static artefacts (see Fixtures).
- Rate limits / websocket: NOT FOUND. The agent docs mention a websocket order book, but it is Polymarket's CLOB feed ("WebSocket Orderbook -> Polymarket CLOB API", H, S3).

## Trade path

- **No documented programmatic order API** (H that none is documented, S3). "Prediction trading APIs", "Smart routing & execution services" and an institutional API/SDK are future work (H, S3).
- Real order flow, by route:
  - Predict.fun: user signs Predict.fun's login message and orders with their own wallet; orders go to Predict.fun's API; Fortune adds a BNB fee transaction to its wrapper contract (H, S5, S6). To do the same without Fortune, use Predict.fun directly (needs a Predict.fun API key per the sibling research note).
  - Polymarket: wallet login with Fortune, then orders via Fortune's proxies using Polymarket's deposit-wallet and builder-signing flow. Fortune's server holds the builder signing credential (`/builder/sign`).
  - Agent: the user "delegate[s] your trading account to Fortune's agents" (H, S3 user guide). That is delegated, Fortune-controlled trading on the user's Polymarket-style trading account, with a per-trade cap (min 2 USD) and an on/off switch. Custody terms beyond that: NOT STATED.
  - Native LMSR: plain EOA transactions: USDT `approve` to the market, then payable `buyShares(marketId, isYes, shares, maxCost)`, `sellShares(marketId, isYes, shares, minRefund)`, `claim(marketId)` (H on source, S5).
- Limits in the native contract source: trade size 1 to 1000 shares, total payment must exceed 5 USDT (`MIN_USDT_NUM`), market `b` is validated against a safe ratio (H, S5).

## PayBox reachability

- **Partial, and not worth using.** Chain catalog per `docs/research/06-paybox-platform.md` (H there, 2026-10-19): BNB Smart Chain (56) and Polygon (137) are in PayBox's catalog, and an EVM wallet shares one address across `eip155:*` chains.
- Native LMSR: two plain EOA transactions (approve, payable `buyShares`) would fit PayBox's one-call `evm` proposal shape. USDT approvals and a BNB fee are required; the wallet needs BNB for gas and the fee (M, not tested; PayBox money tools were not called).
- Predict.fun / Polymarket via Fortune: would need a Fortune login (wallet signature), a delegated agent account, and Fortune's deposit address; it only adds a fee and a custodian-like intermediary compared with trading the venues directly. Reaching those venues directly is the right path and is covered elsewhere.
- Signed-order route: the Fortune flow uses the venues' own EIP-712 orders (Polymarket, Predict.fun), which PayBox `request_wallet_sign` `typedData` could sign in principle (M, see sibling notes). Nothing Fortune-specific to sign.

## Fees

- **Aggregator (docs):** trading fee on buy orders only; sells are free; part of fees goes to F Points holders; the rate is not disclosed ("Trading Fee Revenue = Aggregated Trading Volume x Effective Fee Rate") (H, S3).
- **Predict.fun wrapper (source):** per buy a flat `feeUsdtValue` = 0.5 USDT, charged in BNB, converted at the PancakeSwap V2 USDT/WBNB pair's spot reserves (`getRequiredBNB`), split 62% to an EOA recipient and 38% to the vote contract; excess BNB is refunded; owner can change `feeUsdtValue` with no cap (H, S5; deployed values not read). This is on top of Predict.fun's own fees. The fee is flat per transaction, not a percentage of notional.
- **Fortune Agent subscription:** 15-day pack 100 F (new users, once), 30-day 4,000 F, 360-day 40,000 F, where F is Fortune's points/credit unit (H, S3). Trading fee 1% (0.36% strategy provider, 0.64% platform); profit fee 10% (4% strategy provider, 1% platform, 5% direct referral rewards) (H, S3).
- **Native LMSR (source):** `tradeFeeBps` 50 (0.5%) on buy cost AND on sell refund; `resolutionFeeBps` 200 (2% of the pool at resolution); founder share up to 20% refunded to the owner; plus the flat BNB fee per buy (H, S5). The aggregator doc's "sells are free" does not match the native source (different products).
- Deposits/withdrawals: gas + swap + bridge fees, "Fortune does not charge any additional fees" on withdrawal (H, S3).
- Who pays: the trader in every case.

## Resolution mechanism and dispute risk

- Predict.fun and Polymarket routes: resolution is the underlying venue's (see their notes). Fortune "automatically redeems" resolved positions for agent accounts (H, S3).
- Native LMSR: **the contract owner calls `resolveMarket(marketId, winningOutcome)` after `endTime`**, no oracle, no dispute window, no timeout; the owner can also pause markets, change `b` hourly, and `emergencyWithdraw` from a resolved market's pool (H on source, S5). The front end has an admin UI for it (H, S6). High centralisation risk. CertiK's Skynet page lists an audit of `FortunateVote.sol` only (requested 2026-06-04, delivered 2026-06-16; 8 findings, all "acknowledged": 1 centralization, 4 medium logical, 3 informational; Skynet score 69.59, BB), with no resolved findings (H, S12). Docs claim audits by Beosin and CertiK for check-in, voting, NFT and prediction contracts (H that docs claim it, S3); only the CertiK vote-contract audit was verified. Beosin: NOT FOUND (search budget exhausted).
- Dispute process: none documented.

## Geo / ToS / automation

- Wallet-enabled features are **not permitted** for persons or entities in or organised in: United States, United Kingdom, France, Ontario, Singapore, Poland, South Korea, Thailand, Australia, Belgium, Taiwan, the Netherlands; VPN circumvention "strictly prohibited"; restricted users may see public content and previews only (H, S7, quoted list). The page is under the Fortune Agent section, so whether it also binds the aggregator front end is not stated (M).
- Standalone terms of service or API/automation policy: NOT FOUND (searched: Gitbook index, site bundle strings, GitHub repos). The only automation described is Fortune's own delegated agent trading. Undocumented backends have no stated terms, so scraping them is unsanctioned by default.
- The Predict.fun and Polymarket geo rules also apply on those routes (see their notes).

## Liquidity

All figures are self-reported by Fortune unless noted; none is independently verified order-book depth.

| Metric | Value | Date | Tag |
|---|---|---|---|
| "Aggregated trading volume" (docs business model and roadmap) | 15.8M+ USDT | roadmap Q3 2026, undated | H that docs say it (S3); self-reported |
| Dune: cumulative "buy-share USDT volume", main wrapper contract | about 23.6M USDT, 2026-06-17 to 2026-10-17; dashboard note: "calldata cost only" | 2026-10-18 view | H (S8); unverified |
| Dune: cumulative transactions to the main contract | 849,162 | through 2026-10-18 | H (S8) |
| Dune: tx last 7 complete days / previous 7 | 10,490 / 2,730 | 2026-10-18 view | H (S8) |
| Dune: peak day | 55,016 tx on 2026-09-05, attributed by the dashboard to a "marketing prediction campaign" | 2026-09-05 | H (S8) |
| Dune: average daily unique wallets (main contract, last 7 days) | about 982 | 2026-10-18 view | H (S8) |
| Dune: all six contracts, DAU / WAU / MAU | 2,469 / 4,893 / 7,954 | 2026-10-15 | H (S8) |
| Dune: unique wallets all six contracts, all time | 161,912 | 2026-10-18 view | H (S8) |
| Fortune Node NFT sale | 2,500 NFTs, 549,700 USDT gross, sold out | through 2026-09-22 | H (S8) |
| Agent subscribers | 15,000+ | 2026-09-30 | H that docs say it (S3) |
| Native LMSR TVL / open markets / depth | NOT FOUND (needs `eth_call` or the undocumented API) | n/a | n/a |

- **Why the BNB volume is not liquidity:** in the wrapper source, `buyShares` takes `shares` and `cost` from the caller, moves no tokens, and does not call Predict.fun; the only value moved is the ~0.5 USDT BNB fee (H, S5). The "volume" is therefore caller-asserted calldata. Combined with the points system (F Points for "prediction trading", daily check-ins, referrals; airdrop eligibility; H, S3), the 55k-tx campaign day, and the vote contract that also charges 0.5 USDT in BNB per vote (up to 2/day, H, S13), the BNB-side numbers look like fee-per-action points farming (M interpretation). The sibling note `docs/research/09-venues-onchain-clob.md` already flags Predict.fun volume itself as points-driven.
- **Polymarket-side attribution (public feed, H, S14, fixtures saved):** two Polymarket builders have near-identical names. Neither is confirmed to be Fortune (the builder code lives server-side in Fortune's `/builder/sign` service; it is not in the bundle).
  - `FortunaProtocol`, code `0x1f1283d7...906f`: all-time rank 342, volume 39,455, 48 active users; **no rows in the last 90 daily buckets** (2026-07-22 to 2026-10-19). Dormant or pre-launch (M).
  - `Fortuna`, code `0xa4a19c16...f39f9`: all-time rank 88, volume 4,567,742, 62 users; last 90 days: 53 active days, 497k total, 1 to 5 active users per day, five days above 70k (2026-07-25, 08-05, 09-10, 09-12, 09-13); calendar-month October: rank 139, 18,349, 2 users. Looks like a few large traders, not a 15,000-subscriber retail front end (M). Relation to Fortune: unknown (L).
  - Builder-feed "volume" is share notional rather than USDC cost per the sibling Gate note (M), so compare cautiously.
  - Conclusion: Fortune's Polymarket flow, if routed through its own builder code, is small or not attributable. NOT FOUND (searched: leaderboard ALL/MONTH, 90-day daily feed, bundle strings).

## Event categories and overlap

- Fortune lists verticals: sports, esports, crypto assets and on-chain metrics, tech/AI/policy, financial/macro (H, S3). These are the underlying venues' categories; the Sports Agent covers football; "AI Lightning Prediction" shows UP/DOWN probabilities (probably short crypto up/down markets, M, S11 does not name the market).
- All overlap with Polymarket and Predict.fun by construction, so any "edge" between Fortune and them is the same book. Cross-venue edge must be computed between Polymarket / Predict.fun and other independent venues, not Fortune.

## Shared liquidity

- **Shares liquidity with Polymarket and Predict.fun (100% of aggregator volume).** Not an independent leg. Upcoming Opinion and Kalshi routes would also be pass-throughs (H, S3).
- Native LMSR liquidity is Fortune-seeded and owner-resolved; exclude it from price comparison.

## Integration value and recommendation

- Do not build a venue adapter. Add a **registry entry** `fortune-protocol`: `kind: front-end/router`, `underlying: [polymarket, predict.fun]`, `independent_liquidity: false`, `skip_reason: duplicate liquidity, no API`.
- Optional (low value): record the two Polymarket builder codes as "possible Fortune" in the builder-flow watcher, flagged unconfirmed.
- Do not reuse anything from Fortune's bundle (see Suspicious content).
- Re-check if: the pm-AMM or derivatives launch with a real contract and a public API; the TGE happens and docs add an API reference; Opinion/Kalshi routes go live (still duplicates).

## Suspicious content / security observations

- No text aimed at AI agents or prompt injection found in the docs, README, site HTML or whitepaper listing (H for what was read; the PDF itself could not be rendered here: no PDF tooling, so its contents are NOT READ).
- **The public front-end bundle hard-codes a Predict.fun `x-api-key` in an axios request interceptor** (H, S6). The value is deliberately not recorded here and was not used. Do not harvest or reuse it; use your own key under Predict.fun's terms.
- The business structure has several risk markers worth knowing (facts, not accusations): referral tree endpoints (`sons`, `inviteRecord`) and a 5% direct referral reward on profit fees; node NFT sale of 549,700 USDT; "package" purchases of an AI trading agent paid in a points unit; biweekly "profit-sharing and refund" reports (M, S11); fee-per-action points on-chain; owner-controlled fee recipients (62% of each BNB fee goes to an EOA); owner-resolved native markets; CertiK findings all unresolved on the vote contract.
- The wrapper's fee oracle is a PancakeSwap V2 spot reserve ratio (`getReserves`), which is manipulable within a transaction (M interpretation; low stakes at 0.5 USDT).

## Not found

- Public API reference, OpenAPI, SDK, rate limits, websocket (searched: Gitbook index and full text, GitHub repos, bundle, whitepaper listing).
- Standalone ToS / automation policy (searched: Gitbook index, bundle).
- Native LMSR TVL, open market count, depth; deployed bytecode vs source (no `eth_call`; explorer GET APIs refused BSC free access).
- Which Polymarket builder code Fortune uses, and its true volume.
- Beosin audit report; audit for the prediction contracts (search budget exhausted).
- Whitepaper PDF contents (`https://fortuneprotocol.io/Fortune_202606011023.pdf`, 2.4 MB, last-modified 2026-06-22): fetched but not readable with available tools.
- Independent (non-Fortune, non-Dune) volume verification.

## Open questions

1. Does Fortune route Polymarket orders under `Fortuna`, `FortunaProtocol`, or another builder code? (A signed header sample would settle it; not obtainable read-only.)
2. How many native LMSR markets are live and funded on `0xD179...`, and who is the owner (EOA vs multisig)?
3. Does the wrapper's platform code `3` mean Polymarket?
4. Will a public API / SDK ship with the TGE as the business model implies?
5. Are Agent-account trades subject to the BNB flat fee, or only manual Predict.fun buys?

## Fixtures

Saved under `docs/research/fixtures/fortune-protocol/`:

- `polymarket_builder_leaderboard_fortuna_rows_2026-10-19.json` - the `Fortuna` (MONTH, ALL) and `FortunaProtocol` (ALL) leaderboard rows.
- `polymarket_builders_volume_v2_fortuna_daily_2026-10-19.json` - 53 daily rows for `Fortuna`, and the count (0) for `FortunaProtocol` in the 90-day window.
- `fortune_gitbook_llms_txt_2026-10-19.txt` - Gitbook docs index (4 KB).
- `fortune_home_spa_shell_2026-10-19.html` - the site's HTML shell (explains the empty extraction).
- `Fortune-Predict.fun-Polymarket.sol.txt` - the public wrapper contract source (third-party code, stored as data, never executed).

## Sources

- S1 [H] https://fortuneprotocol.io (HTTP 200, `last-modified` 2026-09-19; SPA shell) and https://bot.fortuneprotocol.io/ (HTTP 200, `last-modified` 2026-09-29); plus the site bundle `https://fortuneprotocol.io/assets/index-XUz4cQCX.js` read as text for hosts, routes, contract addresses and function names.
- S2 [H] https://coinmarketcap.com/currencies/fortune-protocol/ - preview page, links to site, X `fortuneglobal_`, GitHub, Telegram; chain not stated; read through a summariser.
- S3 [H] https://fortuneprotocol.gitbook.io/fortune/llms-full.txt and `/llms.txt` - official docs, all pages (About, Aggregator, Fortune Agent and user guide, Sports Agent, Business Model, F Points, Tokenomics, Roadmap).
- S4 [H] https://github.com/Fortune-Protocol (org created 2026-04-07; repos `Fortune`, `Fortune-contracts`, `Fortune-frontend-ui`) via `gh api`, including the README contract table.
- S5 [H] https://github.com/Fortune-Protocol/Fortune-contracts - `Fortune-Predict.fun-Polymarket.sol`, `Fortune-Prediction.sol` (FortuneMarketLMSR), `Fortune-Vote.sol`, read via `gh api` raw.
- S6 [H] https://github.com/Fortune-Protocol/Fortune-frontend-ui and S1 bundle - API wrappers, hosts, routes, contract call sites.
- S7 [H] https://fortuneprotocol.gitbook.io/fortune/fortune-ecosystem/fortune-agent/eligibility-and-important-notice - restricted jurisdictions.
- S8 [H] https://dune.com/fortune_protocol/prediction-market-growth-metrics-bnb-chain - team Dune dashboard (read through a summariser; the last 14k characters of the page were retrieved separately, no methodology there).
- S9 [M] https://crypto.news/fortune-protocol-integrates-polymarket-liquidity-into-fortune-markets/ - Polymarket integration announced 2026-08-25.
- S10 [M] https://cryptorank.io/news/feed/fortune-protocol-pre-series-a-2026-08-03 and https://app.dealroom.co/news/note/fortune-protocol-lands-pre-a-for-ai-prediction-derivatives-ahead-of-token-launch - Pre-A coverage; https://www.caplight.com/company/fortuneprotocol - seed round listing (L, not opened).
- S11 [M] https://www.kucoin.com/news/flash/fortune-protocol-launches-ai-lightning-prediction-and-upgrades-earnings-mechanism - 2026-09-18, republishing ChainCatcher.
- S12 [H] https://skynet.certik.com/projects/fortune-protocol - CertiK Skynet page (audit of `FortunateVote.sol`, delivered 2026-06-16; read through a summariser).
- S13 [H] `Fortune-Vote.sol` in S5 - 0.5 USDT BNB fee per vote, 2 votes/day.
- S14 [H] https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL|MONTH and https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90 - live GETs 2026-10-19.
- S15 [M] `docs/research/09-venues-onchain-clob.md`, `docs/research/06-paybox-platform.md`, `docs/research/venues/gate-polymarket-integration-gate-app.md` - sibling notes (Predict.fun API key requirement, PayBox chain catalog, builder-feed volume semantics).
