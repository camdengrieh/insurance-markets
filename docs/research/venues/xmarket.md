# Xmarket (xmarket.app) - venue adapter spec

Researched 2026-10-19 (fetches between 00:17 and 00:30 UTC). Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "NOT FOUND (searched: ...)" means I looked and found nothing, not that it does not exist.

Name warning: this is **Xmarket** (xmarket.app, operated per its Terms by "TB Tech Ltd", BVI). It is not **XO Market** (xo.market), the project's primary target. No link between them found (M).

**Verdict: skip (adapter_priority).** The site and a public JSON backend are up and the newest market was created 2026-10-15, but the venue is practically empty: 24h volume 0, 7d about $1.2K, DefiLlama TVL $609, DefiLlama fees $1.80 in 30 days, every live order book is a formulaic ~1-share ladder (looks platform-seeded from sportsbook odds, so it carries no independent signal), there is **no documented API** (the docs host has no DNS record), and the trade path needs a Privy-authenticated browser session with server-side signing, so no third party can place an order programmatically. It is also unclear whether the production build is real-money or a demo (section 1). Revisit only if volume revives.

## 1. Is it still live? (H unless noted)

- `https://xmarket.app/` returns HTTP 200 (Next.js behind Cloudflare). Sitemap `lastmod` 2026-10-15. `GET /api/v1/markets` returned 477 public markets; newest created 2026-10-15; 10 `live` and 5 `proposed` as of 2026-10-19.
- Activity is almost all platform-generated sports match markets. Of the 219 non-rejected markets, 129 carry the tag `AI-generated` and 125 have a `sgoEventId` (SportsGameOdds feed id); the last non-sports market (an esports match) was created **2026-07-20**. Community "creator" markets in crypto/politics/economics peaked in March 2026 (161 created that month) and stopped by mid-summer.
- `docs.xmarket.app` (the Documentation link on the site) has **no DNS record** (`dig` empty, curl "could not resolve host"). `landing.xmarket.app` returns 503 with the DigitalOcean "archived app" offline page. So there is no official docs site.
- Launch: private beta on BNB Chain mainnet announced 2026-02-27 (press release via GlobeNewswire, read through secondary summaries because GlobeNewswire returned 403: M). DefiLlama listed it 2026-03-23 (H, API `listedAt` 1774296139). Terms page last updated 2025-09-25 (older than 6 months, predates launch: possibly stale).
- **Real money or demo? Unresolved.** Evidence both ways:
  - Real: DefiLlama's fee adapter tracks real BSC USDT flowing from the FeeManagement and Exchange contracts to fee recipients since 2026-02-09 (all-time $55.46); DefiLlama TVL is real USDT ($609.48, 2026-10-18). Addresses in the site's client config match DefiLlama's adapter (FeeManagement `0xEdcC0B26...`), so the client config does point at the BSC deployment DefiLlama tracks. (H)
  - Demo: the production client bundle contains a welcome popup "Welcome to BNB Live ... You're on our live version. All tokens and trades are for demonstration only" and an "Xmarket Demo" modal ("Get N USDT to Start Trading ... Practice trading on live markets ... No risk") backed by `POST /api/v1/airdrop/mint`. The Terms define both a "Live Environment" (real assets) and a "Demo Environment" (simulated, no monetary value) (Terms 4.3). A faucet cannot mint real BSC USDT, so the UI token behind the faucet is not the same asset as the real USDT address in the config. (H for the strings, M for interpretation)
  - The statistics endpoint reports `totalVolume` 2,190,353 while the sum of per-market `volume` across all 477 public markets is only 11,537.56 (H, both computed this session). The 190x gap may be demo-token or presale volume. Unexplained.
  - Net: treat any price on xmarket.app as possibly non-economic until someone confirms from the UI or on-chain that a fill moves real USDT.

## 2. Kind and market model

- **Kind:** onchain-other. Hybrid central limit order book: orders matched off-chain by a "trading engine" service, settled on-chain through an Exchange contract (`matchOrders`, `matchMergeOrder`, `matchReddemOrder` events/functions in the ABI embedded in the client bundle). Press release also says CLOB, not AMM (M). The `Order` struct in the ABI is the Polymarket CTF-Exchange layout: `salt, maker, signer, taker, tokenId, makerAmount, takerAmount, createdAt, expiration, nonce, feeRateBps, side, signatureType, signature` (H bundle, M interpretation as a CTF-exchange fork).
- **Tokenisation:** Gnosis Conditional Tokens (ERC-1155) positions; markets carry `conditionId`, `questionId`, per-outcome `positionId` (uint256 as decimal string). The client calls `splitPosition`/`mergePositions`/`redeemPositions` style flows (H bundle). Each outcome has its **own order book** (YES book and NO book), and book entries expose `isHaveMirrorOrder`, i.e. a YES bid can be satisfied by a NO ask at 100-p (M).
- **Types seen in the API:** `type` = `YES/NO` (314), `SPORTS` (149), `ESPORTS` (14) over 477 public markets. All binary (two outcomes). A `childMarkets` array and `/markets/{id}/multiple-outcome` endpoint exist (multi-outcome events), but I did not see a populated example (NOT FOUND: a live categorical market).
- **Prices:** integer cents 1-99 in order books, shares are floats, `total` is cumulative USDT. In the markets list, `outcomes[].lastPrice` is a decimal string in cents and is the last trade of that outcome's own book, so YES and NO `lastPrice` do **not** sum to 100 (observed 36 + 68). Use the books or `100 - p` for the complement.
- **Presale (market creation):** creators open a presale pool with a soft cap; if the cap is met the market goes live, otherwise funds are refunded (press release, M; contract ABI has `createPresale`, `getSoftCap`, `getHardCap`, `refund`, `MIN/MAX_PRESALE_DURATION`, H). A "QT" (question token) NFT/token holds the creator's fee share (`feesShareQTHolders`, `qtAddress`; M).
- **Sports outcome quirk for the adapter:** outcome `name` is always `yes`/`no`; `displayName` is a team abbreviation, which can collide (New Orleans Saints displays as `NO` on the outcome named `yes`). Key on `name`, never on `displayName`. The `yes` outcome is the first-named team; the `no` outcome also wins on a tie/draw (EPL rule below), so `yes` = "first team wins outright" and `no` = complement, comparable to a Polymarket/Kalshi "Will X win?" binary but NOT to a 3-way 1X2 market.

## 3. Chains and collateral

- **Chain:** BNB Smart Chain (56) only. Client config `CHAIN_KEY: BSC_MAINNET`. (H)
- **Collateral:** USDT (BEP-20) `0x55d398326f99059fF775485246999027B3197955` (the standard BSC-USD address, from the client config; H). Minimum order size shown in UI: $1.
- **Contracts (client config + DefiLlama adapter; NOT verified on an explorer, see section 11):**
  - Exchange (matchOrders) `0xF05c3f1605Ce40e8030718755FA1f84eA01DF1A9` (DefiLlama dimension adapter, H for the adapter, M that it is the live exchange)
  - FeeManagement `0xEdcC0B26dEC24eCb718d92eAA8c56Fb5e13d34b8` (client config NEXT_PUBLIC_FEE_ADDRESS and DefiLlama, H)
  - QuestionMarket `0xD7290f78d3EA6F5030648728683ec6FaC9b77330`, Router `0xBA1d31aCc6a92a73Dc3eFB2AbA07A52661677bA3`, XEF `0x0a34227c15117aD69E662679A74b6CbE44D5a059` (purpose unknown), Staking `0xb1759F45561079D360f255542E1985a48a097f6a` (client config, H)
  - ERC-4337: EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032`, SimpleAccount factory `0xE19C25e3fB0A39d29808647BDE92AE37E6B1fb26`, plus an Xmarket bundler and paymaster (gas-sponsored user operations). (H config)
- Smart accounts: each user trades from an ERC-4337 smart account (`contractAddress` on the user profile) owned by a Privy embedded wallet. (H bundle)

## 4. Read API

**Status: no official or documented API.** The docs URL on the site is dead. What exists is the website's own backend-for-frontend, reachable without authentication on the same origin. It works today but is undocumented, unversioned in practice, and covered by a Terms clause that requires written consent for scraping (section 8). Treat as "unofficial-only". (H for behaviour, M for stability)

Base (same origin as the site): `https://xmarket.app/api/v1`. Responses are JSON, behind Cloudflare, `cache-control: private`. No rate-limit headers seen over ~70 GETs at ~1 req/s (no 429). No auth needed for the reads below.

| Endpoint (GET) | Purpose | Verified |
|---|---|---|
| `/markets?pageIndex=&pageSize=` (pageSize 100 worked; also accepts sort/search/status/tag/category params seen in the client) | market list: `{data:[{market, category, outcomes[], resolutionOutcome, auction, childMarkets, tags, topics, userBuyerCount, commentCount, user}], pageInfo, total, totalMyMarkets}` | H, fixture |
| `/markets/statistic` | platform totals (`totalVolume`, `last24HoursVolume`, `last7DaysVolume`, `last30DaysVolume`, `marketCount`, `userCount`, `totalLiquidity`) | H, fixture |
| `/order/orderbook?marketId=&outcomeId=` | per-outcome book: `{success, data:{asks[],bids[],lastPrice,spread,totalOpenVolume}}`, each level `{price(cents),shares,total,isHaveMyOrder,isHaveMirrorOrder}` | H, fixture |
| `/markets/{marketId}/price` | `{yes:{lastBuyPrice,lastSellPrice}, no:{...}}` (null with no trades) | H |
| `/markets/{marketId}/chart-data?outcomeId=&timeframe=10m` | price history (`{success,data:[]}` empty for a market with no recent trades; `timeframe=1d` returned HTTP 500, valid values unknown) | H partial |
| `/markets/categories`, `/markets/leaderboard`, `/markets/{id}/top-holders`, `/markets/{id}/recent-activity`, `/markets/{id}/multiple-outcome`, `/markets/{id}/check`, `/positions`, `/trades/pnl` | seen in the client bundle; categories returned HTTP 400 (needs `sortBy`,`sortOrder`,`searchBy`), others not called (several are user-scoped) | H bundle only |

Key fields on `market`: `id, slug, name, type, status, rules (HTML incl. resolution criteria and sources), expiresAt, orderbookClosesAt, volume (USDT, decimal string), conditionId, questionId, marketAddress, creatorAddress, sgoEventId, homeOdds/awayOdds (American odds from the SGO feed), leagueName, sportName, isPauseOrder`. Statuses observed: `proposed`, `live`, `resolution_proposed`, `resolved`, `rejected` (counts 5/10/7/197/258 of 477). `orderbookClosesAt` is typically 2-5 hours before `expiresAt` for sports markets (trading closes before the event).

**Data hygiene warning:** each list item includes a `user` object (the market creator) containing an email address, Privy user id and wallet address. An adapter must drop `user` at the edge and never log it. The fixtures in this repo have it removed. (H)

Other hosts found in the client bundle (not probed beyond a root GET):
- Trading engine REST + WebSocket: `https://bnb-trading-engine-sw2bn.ondigitalocean.app` and `wss://...` (root returns 404; REST calls from the client carry a Bearer token from Privy; WebSocket token minted by `POST /api/v1/auth/websocket/generate-token`). Not public. (H bundle)
- Indexer: `https://bnb-graphql-indexer-n5z5b.ondigitalocean.app/graphql` is a **Ponder** GraphQL indexer (GET serves the Ponder playground page; queries need POST, which I did not send). It is the likely source for on-chain trades but its schema is NOT FOUND. (H for Ponder, no schema)
- No SDK, no OpenAPI, no public GitHub repo (see section 12).

## 5. Trade path and PayBox reachability

- **Placing orders:** the client builds a MARKET or LIMIT (also SPLIT and MERGE) request and `POST`s it to the trading engine (`/api/v1/order`) with a Privy-issued Bearer JWT; cancel-all, split/merge/redeem have same-origin `/api/v1/order/...` routes (H bundle). The request body, and the signature scheme the engine expects, are NOT FOUND (not inspected without a session; I will not authenticate).
- **Who signs:** for merge, the client obtains `{signature, signTime, salt}` from an Xmarket endpoint rather than signing locally, and the bundle references a Privy signer id plus server-side secrets named `PRIVY_AUTHORIZATION_KEY`, `RELAYER_PRIVATE_KEY`, `KMS_SIGNER_URL` (names only; values were not present and I did not look for them). This suggests Xmarket's backend holds delegated signing authority over users' embedded wallets (M, inferred), which sits oddly with the Terms' "Non-Custodial Technology Provider" language. User operations are sponsored by an Xmarket paymaster.
- **Auth to Xmarket:** Privy (email, social, passkey, SIWE external wallet, Telegram). Account state lives in Privy + Xmarket DB. No API-key mechanism found. (H bundle)
- **PayBox reachability: no** for trading. PayBox's chain catalog includes BNB Smart Chain (56) (H per `docs/research/06-paybox-platform.md`, 2026-10-19), so a PayBox EVM wallet could in principle send BEP-20 USDT to a user's Xmarket smart-account address, but (a) the account must first be created by a human in a browser login, (b) every order needs the Privy session and Xmarket-side signing, so a PayBox transaction proposal or signed typed-data order cannot place or cancel orders, (c) funds would then sit in a smart account whose signing is delegated to Xmarket. Funding is possible; trading is not. No money-moving or signing tool was called.

## 6. Fees

- **Formula in client (H bundle):** percentage fee `f` (from chain, fallback 0) on notional: limit buy total = amount + amount*f/100; sell or market = amount - amount*f/100. Minimum order $1.
- **Source of `f`:** FeeManagement contract per `conditionId`: `getQuestionFee(conditionId)` returns `swapFee`, `mergeFee`, `redeemFee`, scaled by `getMaxFee()` (H bundle). Orders also carry `feeRateBps`.
- **Actual rates: NOT FOUND** (searched: site, bundle, press coverage, Alchemy/Bitget/BriefGlance/CryptoBriefing pages, DefiLlama adapter; reading them needs eth_call, a JSON-RPC POST, which I skipped under the read-only/no-POST rule). Press says no base rate was disclosed (M).
- **Split (press, M):** creators earn up to 50% of trading and redemption fees (Alchemy dapp page, BriefGlance, CryptoBriefing; Bitget says up to 30%, L and the page contradicts itself). Referrers got 70%/100% during a 60-day launch promo. During the beta 100% of platform revenue was said to be returned to users, so early fee data understates real fee rates. DefiLlama methodology: fees go to platform, company, treasury, admin wallet, presale-revenue address and referral address.
- **Who pays:** trader pays the percentage fee. The Terms say users pay gas and third-party fees, but the client uses a paymaster (gas sponsored), so gas is likely free to the user (M).

## 7. Resolution mechanism and dispute risk

- **Terms 6.3/6.4 (H, paraphrased):** resolution comes from creator validation, administrative action, or data feeds/oracles; it is "final and binding". Xmarket may approve, reject, pause or cancel any market at its sole discretion, and may re-adjudicate or cancel for manifest error, fraud, oracle failure, forks or security incidents.
- **Observed pipeline (H API):** `live` -> `resolution_proposed` (an automated proposer writes a natural-language `reason` with the final score, typically 1 minute to 2 hours after `expiresAt`) -> `resolved` after an admin step (reason text "Approved pending resolution by admin"). Admin UI strings in the bundle: "Step 1: Report Result to Oracle", "Step 2: Report Payout to Conditional Tokens". Payout ratios are basis points (`winningPayoutRatio` 10000), so 50-50 settlement is supported and is used for postponed/cancelled events.
- **Oracle:** an owner-set oracle address (`setOracle` in the ABI), i.e. a centrally controlled reporter, not UMA/Chainlink/optimistic. (M)
- **Dispute:** an in-app form (`POST /api/v1/disputes`) that is "under review" by the team; no bond, no on-chain challenge window found. Legal disputes go to BVI arbitration (Terms 17). (H)
- **Risk:** high centralisation. Resolution sources are named per market (NFL.com, premierleague.com, ufc.com, official F1 standings), which is good for mapping to other venues, but the operator can pause or cancel at will.

## 8. Geo, ToS, automation (Terms: Google Doc embedded at xmarket.app/terms, last updated 2025-09-25, so possibly stale)

- Live Environment not offered to residents of the **United States, United Kingdom, Ontario (Canada), Singapore**, or anywhere prediction markets or remote gambling are prohibited or require an unheld licence; VPN or proxy circumvention prohibited (3.2, 3.3). Age 18+ (3.1).
- Automation: "Scraping, crawling, and data harvesting require prior written consent" (sections 8 and 15); APIs, where offered, are subject to rate limits and additional terms; trading bots are not explicitly addressed, wash trading, spoofing and front-running are prohibited (8). Reverse engineering the Services or smart contracts is also listed as prohibited conduct. Consequence: an adapter that reads the BFF endpoints in section 4 at scale is not clearly permitted without written consent. My own probing was about 70 GETs at about 1 per second against the same public endpoints the pages call.
- Entity: TB Tech Ltd (BVI), law of the BVI, BVI International Arbitration Centre.

## 9. Liquidity (all dated)

| Metric | Value | Source | Date |
|---|---|---|---|
| DefiLlama TVL | $609.48 USDT (series peak $1,696; first point $1,062 on 2026-03-23) | api.llama.fi/protocol/xmarket (H) | 2026-10-18 |
| DefiLlama fees | all-time $55.46; 30d $1.80; 7d $0.80; 24h $0 | api.llama.fi/summary/fees/xmarket (H) | 2026-10-19 |
| Platform statistic endpoint | 24h $0; 7d $1,242.76; 30d $9,397.10; lifetime $2,190,353.73 (suspect); markets 596; users 3,049; totalLiquidity $8,514.30 | xmarket.app/api/v1/markets/statistic (H) | 2026-10-19 |
| Sum of per-market lifetime `volume` | $11,537.56 over 477 public markets; largest single market $350.22; live markets: F1 champion $93.87, UFC $6.17, rest $0 | computed from /markets (H) | 2026-10-19 |
| Live order books | 18 of 20 outcome books have 7-10 levels per side; open notional per outcome book $7.8 to $119.8; about $430 total across all 10 live markets | /order/orderbook (H) | 2026-10-19 |

Book shape (H, fixture `orderbook_live_sports_2026-10-19.json`): asks 36,39,...,63 and bids 32,29,...,5 in 3-cent steps with sizes 0.7 to 10 shares, touch spread 4 cents. The regular ladder looks bot-generated (the admin UI has a "Market Bot" section: M). Executable size at the touch is under $1.

## 10. Event coverage and overlap

- Current live/proposed markets (2026-10-19): NFL (Cardinals-Broncos, Lions-Packers, Eagles-Cowboys, Bears-Patriots, Falcons-49ers, Saints-Steelers), NHL (Stars-Bruins), NBA (Heat-Timberwolves), EPL-style match (Tottenham-Coventry), UFC bouts (Evloev-Volkanovski, Yan-Dvalishvili), F1 2026 drivers' champion (Russell; duplicate listings exist), plus 3 never-launched proposals (Iran leadership, MicroStrategy BTC sales). No live crypto price, politics or macro market now. (H)
- Overlap with Polymarket/Kalshi: team and fight moneyline-style binaries and the F1 champion are the only overlap. Mapping caution: tie/draw settles to the `no` outcome (EPL: draw resolves to the away team; NFL: tie resolves to the second team); postponed games stay open; cancelled games settle 50-50; UFC draw/no-contest settles 50-50. (H rules text)
- Historical (resolved) coverage was broader: 106 crypto, 34 politics, 32 economics, 29 entertainment, 23 esports, 10 tech markets, e.g. WTI crude price on a date, Samsung above a KRW level, Iran items, FIFA World Cup winner, EPL winner. None remain open.
- **Independence:** own contracts, own matching engine, USDT collateral on BSC. No evidence of shared liquidity with another venue (liquidity_shared_with: none found). But sports `homeOdds`/`awayOdds` come from the SGO sportsbook feed and the books are seeded, so quotes are derived from external prices, not an independent view. As an arbitrage leg it is unusable at this depth.

## 11. Adapter notes (only if someone insists)

- A read-only adapter is about a day of work: page `/markets` (pageSize 100), keep `status in {live}`, fetch two `/order/orderbook` calls per market (one per outcome id), convert cents to probability, drop `user`. Poll no faster than 1 req/s. Expect rate limiting and schema drift without notice.
- Fixture-based test data in `docs/research/fixtures/xmarket/`.
- Not done: any on-chain read. BscScan returned 403 to the fetcher, Routescan does not index chain 56 (its control query for the standard BSC-USDT address also 404s), and public RPC reads are JSON-RPC POSTs, which this run excluded. So contract names, verification status, fee settings and the oracle owner are unverified on-chain.

## 12. NOT FOUND (searched)

- Official docs, API reference, OpenAPI, SDK, rate limits, websocket public channels (searched: docs.xmarket.app DNS, landing.xmarket.app, site nav and footer, sitemap, client bundle, web search).
- Public GitHub repo (searched: `gh search repos` for xmarket/Xmarketapp; only an unrelated 2023 Algorand project "xMarkets" turned up).
- Audit reports (searched: Alchemy dapp page, DefiLlama `audits: "0"`, press coverage). DefiLlama lists 0 audits.
- Actual fee rates, oracle owner, whether the production deployment settles real USDT (sections 6, 7, 1).
- Official X account content: `x.com/Xmarketapp/status/...` returned HTTP 402 to the fetcher (no payment terms in the response body; stopped there).
- Team identities (press release names none; Terms name only the BVI company).
- The `XMRK` token: press release says a token generation event is planned; a Bitget dapp page claims the TGE is complete on Solana (page contradicts itself on chain and carries an AI-assisted notice: L, not relied on).

## 13. Sources

- H `https://xmarket.app/` (home, nav, footer links), `https://xmarket.app/sitemap.xml`, `https://xmarket.app/terms` (embeds the Google Doc below), fetched 2026-10-19.
- H Terms: Google Doc `docs.google.com/document/d/e/2PACX-1vQgag26.../pub` (published copy linked from /terms), last updated 2025-09-25.
- H Live API responses: `https://xmarket.app/api/v1/markets`, `/markets/statistic`, `/order/orderbook`, `/markets/{id}/price`, `/markets/{id}/chart-data`, `/markets/categories`, 2026-10-19.
- H Client JavaScript bundles served by xmarket.app (config constants, ABIs, endpoint paths, popup strings), read as data only, not executed; secret env names present, values not recorded; an RPC-provider key embedded in the public bundle was deliberately not copied.
- H DefiLlama: `https://api.llama.fi/protocol/xmarket`, `https://api.llama.fi/summary/fees/xmarket`, adapter source `DefiLlama/dimension-adapters/fees/xmarket.ts` (read with `gh api`), 2026-10-19. `https://defillama.com/protocol/xmarket` itself returned 403 to the fetcher.
- M Press release 2026-02-27 "Xmarket Launches Beta on BNB Chain Mainnet" (GlobeNewswire; direct fetch 403, read through BriefGlance `briefglance.com/articles/xmarket-aims-to-pay-creators-shaking-up-prediction-market-economics` and CryptoBriefing `cryptobriefing.com/prediction-markets-have-a-creator-problem-2/`, which notes the release was commissioned by commercial partners).
- M Alchemy dapp page `https://www.alchemy.com/dapps/xmarket` (CLOB, USDT, non-custodial, creators up to 50%).
- L Bitget dapp page `https://web3.bitget.com/dapp/xmarket-32713` (contradictory chain, AI-assisted notice).
- Hint from discovery: DefiLlama PM list listing 2026-03 (consistent with `listedAt` 2026-03-23).
- Internal: `docs/research/06-paybox-platform.md` (PayBox chain catalog includes BNB Smart Chain 56).

## 14. Fixtures (docs/research/fixtures/xmarket/, all under 50KB, creator `user` objects removed)

- `markets_list_sample_2026-10-19.json` (3 of 477 items: a proposed NFL game, a live NFL game, the live F1 market)
- `market_resolution_proposed_sample_2026-10-19.json`
- `orderbook_live_sports_2026-10-19.json`
- `markets_statistic_2026-10-19.json`
- `defillama_xmarket_2026-10-19_trimmed.json`
