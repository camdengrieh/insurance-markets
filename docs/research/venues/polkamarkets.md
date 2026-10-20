# Polkamarkets (polkamarkets.com) - venue adapter spec

Researched 2026-10-19. Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "NOT FOUND (searched: ...)" means I looked and found nothing; it does not mean it does not exist.

**Verdict: skip as a separate adapter (duplicate liquidity). Build the Myriad adapter instead.** Polkamarkets is not a single trading venue. It is a protocol and white-label toolkit (contracts, JS SDK, Rails API, web app) from Polkamarkets Labs. The company's own hosted app and API hosts are gone (dangling DNS), the only deployment with real money flow is Myriad Markets (covered by a separate spec), and the remaining "lands" (Africasters/Topcasters on MiniPay, Foreland) are social or play-money products with no public API. Treat Polkamarkets as the contract and SDK lineage behind Myriad, useful as a reference for the Myriad adapter (AMM math, CLOB order struct, resolution) and nothing more.

## 1. Is it still live? (partly)

- **Marketing site live (H):** `https://www.polkamarkets.com` HTTP 200 on 2026-10-19 (Heroku-hosted). It says "Prediction Markets for Everyone, Powered by Web 3" and lists live projects **Myriad, Africasters, Foreland**, protocol metrics across V1/V2/V3 of 742,584 users, 27,574 questions, 13.9M predictions, EUR 146.7M total volume, EUR 50.7K POLK bonded. Page footer is dated 2025, so those numbers are not dated precisely (M for freshness).
- **Hosted app and API are dead (H):** `app.polkamarkets.com` (named in the Terms as the operator's web app) and `api.polkamarkets.com` are CNAMEs to Heroku DNS targets (`*.herokudns.com`) that have no A record; curl fails with "Could not resolve host". Fixture: `docs/research/fixtures/polkamarkets/dns_check_2026-10-19.txt`.
- **Docs live but stale (H):** `help.polkamarkets.com` HTTP 200 (Vercel). Its developer pages describe V1/V2 era (Moonriver/Moonbeam/Ethereum, `bepro-js`, Truffle, `RealitioERC20.sol`) and say nothing about Abstract, BNB, the order book, or V3.4. Treat as L for current behaviour.
- **Blog quiet (H):** Medium RSS (`https://medium.com/feed/polkamarkets`) latest posts 2025-09-25 ("POLK: a new on-chain era begins" and a 2023/2024 retrospective). Nothing in 2026. That is 13 months old, so possibly stale.
- **Code active (H, `gh api`):**
  - `Polkamarkets/polkamarkets-js` (SDK plus all Solidity contracts): last push 2026-08-18; "Release 4.0.0" commit 2026-04-22 ("add CLOB settlement alongside the existing AMM lifecycle"). 8 stars, no license field on the repo (contract files carry `SPDX-License-Identifier: MIT`).
  - `polkamarkets-rpc` (HTTP web3 wrapper): pushed 2026-08-11, last default-branch commit 2026-02-02 ("multicall").
  - `polkamarkets-api` (Ruby on Rails): pushed 2026-02-16, last default-branch commit 2025-06-10 ("market templates").
  - `polkamarkets-web`: last push 2024-05-31 (stale).
- **Operator (H):** POLKAMARKET OU, Estonia (Terms: `https://www.polkamarkets.com/legal/terms-conditions`).
- **Token (H):** POLK (ERC-20, Ethereum `0xd478161c952357f05f0292b56012cd8457f1cfbf`, bridged to Celo, Moonbeam, Moonriver, Polygon). Used for market creation, resolution, curation and dispute rights per the docs. DefiLlama mcap about 259.7K USD on 2026-10-18 (H, API).

## 2. Kind and market model

- **Kind:** protocol / white-label toolkit. "Lands" are self-contained prediction communities created through a factory (`LandFactory`, `PredictionMarketV3Factory`, `PredictionMarketV3Controller`); creating a new ecosystem requires locking "1M POLK (initially)" per the V3 docs page (H, `https://help.polkamarkets.com/polkamarkets-v3`).
- **AMM (V1/V2/V3.x), H from `contracts/PredictionMarketV3_4.sol`:**
  - Fixed-product market maker (Omen/Gnosis FPMM style), up to `MAX_OUTCOMES = 2**5 = 32` outcomes per market, so binary and categorical, no scalar type in the contract.
  - Outcome shares are internal accounting (`Shares.holders` mapping), not ERC-20 or ERC-1155. Winnings are claimed with `claimWinnings(marketId)`; voided markets pay back at closing prices via `claimVoidedOutcomeShares`.
  - Buy: `amountMinusFees = amount - amount*fee/1e18`; ending balance of the bought outcome `= pool_i * prod_{j!=i} ceil(pool_j / (pool_j + amountMinusFees))` (code iterates `(ending*pool_j).ceildiv(pool_j + a)`); shares out `= pool_i + a - ending/1e18`. Prices from the SDK (`getMarketPrices`) sum to 1 (example `0.893 + 0.107`).
  - Liquidity providers hold `liquidityShares` and share a per-market fee pool (`feeAccumulator`).
- **Order book (V4, new in 2026), H from `contracts/MyriadCTFExchange.sol`, `PredictionMarketV3ManagerCLOB.sol`, `NegRiskAdapter.sol`:**
  - Binary markets only (`outcomeId` 0 or 1) with Gnosis `ConditionalTokens` ERC-1155 positions. Multi-outcome events are built from binary markets through a `NegRiskAdapter` (event-level `mintAllYesTokens`, cross-market matching).
  - EIP-712 signed orders `Order(trader, marketId, outcomeId, side, amount, price, minFillAmount, nonce, expiration)`; price is collateral per share at 1e18 precision. On-chain settlement of operator-matched orders with partial fills; match types direct, mint, merge.
  - EIP-712 domain `name = "MyriadCTFExchange"`, `version = "1"`, `chainId = 56` in the public Myriad docs examples (H, `https://docs.myriad.markets/builders/myriad-order-book`); exchange address is a placeholder on that page (NOT FOUND there).
- **Which model each deployment uses:** the existing Myriad fixture in this repo (`docs/research/fixtures/myriad/market_ob_1237.json`, written by another workflow) shows `tradingModel: "ob"`, `networkId: 56`, `token: USD1` for a live market, so the live flagship is now partly on the order book (M, secondary to this note).

## 3. Chains and collateral

- **Chains listed on polkamarkets.com (H):** Linea, Abstract, Arbitrum, Celo, Gnosis, Moonbeam, Moonriver, Polygon. DefiLlama tracks only legacy chains for this slug: Moonriver, Moonbeam, xDai, Celo, Ethereum, Polygon (H, API).
- **SDK-documented production addresses (H, `polkamarkets-js` README):** Abstract mainnet (explorer `abscan.org`): `PredictionMarketV3_4` `0x4f4988a910f8ae9b3214149a8ea1f2e4e3cd93cc`, Querier `0x710F30AbDADB86A33faE984d6678d4Ed31517B18`; collateral `USDC.e` `0x84A71ccD554Cc1b02749b35d22F684CC8ec987e1`, plus `PENGU` and `PTS` (points) tokens. The SDK README tells integrators to "reach out to Myriad support" for staging tokens, i.e. this Abstract deployment is Myriad's.
- **BNB Chain (chain 56):** CLOB exchange domain chainId 56 (H, Myriad docs); the Myriad fixture market is collateralised in USD1 (M). Contract addresses for BNB, Linea, Celo, Gnosis, Polygon, Arbitrum: NOT FOUND (searched: polkamarkets-js repo tree, README, help.polkamarkets.com security/FAQ/V3 pages; the docs name "Contract Addresses" subpages that I could not load).
- Collateral is per-market (`IERC20 token` in `CreateMarketDescription`), so USDC.e, USD1, play-money `FantasyERC20` and POLK-bonded markets can coexist.

## 4. Read API

**Official public Polkamarkets REST API: none currently reachable.** (H for the dead hosts, see section 1.)

- `polkamarkets-api` is a self-hosted Rails + Postgres + Redis app; routes seen in `config/routes.rb` (H): `GET /markets`, `GET /markets/:id`, `/markets/:id/feed|comments|holders`, `GET /portfolios/:address`, `/leaderboards`, `/tournaments`, `/lands`, `/stats`. Create/update/reload routes exist. No public base URL, no auth scheme, and no rate limits are documented. The README is a two-screen setup guide.
- `polkamarkets-rpc` is an HTTP wrapper for contract reads: `GET /call?contract=predictionMarket&method=...&args=...&address=...` and `GET /events?...`; the README says to protect "execute calls" with an RSA key pair. Self-hosted; no public instance known.
- **On-chain reads work without any API (H, SDK + contracts):** `getMarketPrices({marketId})`, `getPortfolio({user})`, `calcBuyAmount`, `calcSellAmount`, plus the `PredictionMarketV3Querier` which batches market ids ("avoid making N RPC calls") for decimals, positions, outcome prices; events `MarketActionTx`, `MarketResolved`, `OrdersMatched`. I did not execute any RPC call (a JSON-RPC `eth_call` is a POST; ground rules forbid POST), so no on-chain response shape was confirmed this session.
- **The live public HTTP API for these markets is Myriad's** (`https://docs.myriad.markets/builders`, "Myriad API Reference", M via search snippet: AMM endpoints plus order book orders/positions/events and WebSocket; session JWT via Sign-In With Ethereum or API key + HMAC; "legacy auth sunset" 2026-08-15). That belongs in the Myriad spec, not here.
- WebSocket for Polkamarkets itself: NOT FOUND (searched: polkamarkets-api routes, polkamarkets-rpc README, help.polkamarkets.com).
- Fixtures: no Polkamarkets API response could be captured. Saved instead `docs/research/fixtures/polkamarkets/defillama_polkamarkets_2026-10-19_trimmed.json` (DefiLlama TVL, shows the legacy-chain footprint) and the DNS check above.

## 5. Trade path

- **AMM (H, SDK README):** `erc20.approve(spender = PredictionMarketV3 contract)`, then `pm.buy({marketId, outcomeId, value, minOutcomeSharesToBuy, wrapped})` where `minOutcomeSharesToBuy` comes from `calcBuyAmount`; `pm.sell(marketId, outcomeId, value, maxOutcomeSharesToSell, wrapped)`; `pm.claimWinnings`. All plain EVM transactions signed by the user's wallet (or `web3PrivateKey` in the SDK, which an agent must not use).
- **Order book (H, contracts + Myriad docs):** sign the EIP-712 `Order` off-chain (polkamarkets-js `MyriadCTFExchangeContract` / `hashOrder`, or ethers v6 `signTypedData`), then submit to Myriad's HTTP API, which routes to the operator that calls `matchOrders` on-chain. Cancel is an on-chain `OrderCancelled`/nonce invalidation or via API (API detail: see Myriad spec).
- **Not a venue-wide order book:** each land/deployment has its own contract set; an adapter must be configured per deployment (address book is NOT FOUND for most).

## 6. PayBox reachability (verdict: partial, effectively Myriad only)

- AMM `approve` + `buy`/`sell`/`claimWinnings` are ordinary contract calls and fit transaction proposals on any EVM chain PayBox supports. CLOB orders need an EIP-712 typed-data signature, which fits a wallet-sign request if PayBox exposes typed data (not verified; I did not call PayBox).
- Chain support is the open item: BNB Chain, Polygon and Arbitrum are on the task's list; Abstract (zkSync-stack), Linea, Celo and Gnosis I could not confirm (M/unknown). Collateral USDC.e/USD1 on those chains must also be fundable.
- Geo: the Terms exclude the USA among others (section 9), so a US-resident PayBox user should not be trading it.

## 7. Fees

- **AMM (H, `PredictionMarketV3_4.sol`):** per-market `buyFees` and `sellFees`, each a struct `{fee, treasuryFee, distributorFee}`, each component capped at `MAX_FEE = 5%`. On buy the fee comes off the stake (`fee` accrues to the LP fee pool, `treasuryFee` and `distributorFee` are transferred out); on sell the fee is added on top (`valuePlusFees = value/(1-fee)`). The trader pays; LPs earn `fee`. Actual rates on live AMM markets: NOT FOUND (searched: SDK README, help.polkamarkets.com, V3 page).
- **CLOB (H, `FeeModule.sol`, `MyriadCTFExchange.sol`):** tiered by trade price: `FeeTier{maxPrice, makerFeeBps, takerFeeBps}`, max 1000 bps (10%) per side; buyer fee added on top of notional, seller fee deducted from proceeds; shares always transfer in full. One live example from the Myriad fixture: maker 0 bps, taker 176 bps at price about 0.035 (M, secondary). An arbitrage scanner must read `getFeesAtPrice(marketId, price)` per market rather than assume a flat rate.
- Gas: paid by the trader (plain EVM); Abstract/BNB/Linea gas is low (M).

## 8. Resolution and dispute risk

- **AMM V3.4 (H):** `resolveMarketOutcome(marketId)` reads the result from Reality.eth (`realitio.resultFor(questionId)`, permissionless once finalised; minimum Reality timeout 3600 s), OR `adminResolveMarketOutcome(marketId, outcomeId)` callable by anyone `manager.isAllowedToEditMarket` allows. Admin pause (`adminPauseMarket`) and close-date edit (`adminSetMarketCloseDate`) also exist.
- **CLOB (H, `PredictionMarketV3ManagerCLOB.sol`):** pluggable oracle per market (`IMarketOracle`); the shipped `RealitioOracle` maps Reality.eth answers to YES(0)/NO(1) and **INVALID or any non-binary answer to VOIDED**. `resolveMarket(marketId)` is permissionless once the oracle is final; `adminResolveMarket` and `adminVoidMarket` need `RESOLUTION_ADMIN_ROLE`; admins can also `updateMarketOracle` (until resolved), `pauseMarket`, `adminSetClosesAt`. UUPS-upgradeable proxies guarded by an `AdminRegistry`.
- **Risk read:** Reality.eth bond-escalation plus arbitrator is the intended path (arbitrator address is a creation parameter; which arbitrator each live market uses: NOT FOUND), but a privileged admin can override or void, so resolution is centralised in practice and upgradeable contracts add admin-key risk (M, inferred from the code). The Myriad fixture market lists `resolutionSource: sec.gov` with a prose resolution criteria block (M). Docs say POLK is used for "managing disputes" (Terms and help pages) but never describe the mechanism (the V3 contracts do not use POLK in resolution that I could see; M).
- Audits: homepage lists Red4sec (V1, V2), Hacken (V1, 2021-10), Certik (V1). Nothing listed for V3.4 or the CLOB exchange (H that none is listed; the Security page is a landing page with no dates).

## 9. Geo, ToS, automation

- **Excluded jurisdictions (H, Terms):** includes **United States of America**, Singapore, Cayman Islands, BVI, Panama, Iran, DPRK, Syria, Sudan, Libya and others "or any jurisdiction where the Services are prohibited"; VPN or anonymisation use to circumvent restrictions is prohibited; 18+.
- **Automation (H):** the Terms do not prohibit bots or API use explicitly; they ban copying, reverse engineering or modifying the Website/Services. The operator disclaims responsibility for the open-source protocols ("can change suddenly"). Myriad has its own terms (not read here).
- Tension: the project's goal includes a US-adjacent audience; geo-blocking on the Myriad front end and API is not confirmed here (NOT FOUND).

## 10. Liquidity (with dates)

| Metric | Value | Source and date |
|---|---|---|
| DefiLlama "Polkamarkets" TVL | about $12,977 (Ethereum $12,384, Polygon $593; staking-only $1,299) | H, `api.llama.fi/protocol/polkamarkets`, snapshot 2026-10-18 |
| Same series a year ago / peak | $22,252 (2025-10-19) / $747,709 (2025-09-24) | H, same API |
| DefiLlama "Myriad Markets" TVL, 30d volume | $229,000; $1,886,544 (24h $203, 7d $19,204) | M, existing repo fixture `docs/research/fixtures/defillama/*_2026-10-18.json` |
| Protocol lifetime (all dApps, V1-V3) | 742,584 users; 13.9M predictions; EUR 146.7M volume | M, polkamarkets.com homepage, undated; likely includes play-money markets |
| Myriad lifetime USDC volume | $20M as of September 2025 | H, Medium 2025-09-25 (stale, 13 months) |
| Featured Myriad markets | "Up or Down?" 17.4M USDC.e volume; "Polymarket or Kalshi?" 15.1M USDC.e volume | M, polkamarkets.com homepage, undated; inconsistent with the Myriad 30d number, treat as lifetime or double-counted |

The homepage totals and DefiLlama TVL do not reconcile, and the DefiLlama Polkamarkets adapter misses the Abstract/BNB/Linea deployments entirely (its methodology names V1/V2 contracts and V3 manager balances), so do not use that slug for sizing.

## 11. Event coverage and overlap

- Polkamarkets-powered Myriad lists crypto price ("Up or Down?"), corporate and crypto-holdings questions (Strategy BTC holdings), and meta-markets such as "Polymarket or Kalshi?" (M). That overlaps Polymarket, Kalshi, Limitless, Predict.fun on crypto price, macro and politics, which is where arbitrage exists, but the leg is Myriad, not Polkamarkets.
- Africasters/Topcasters (daily prediction app on MiniPay/Celo; tweet 2024-12-02 claimed 69,420 active users) and Foreland (web2 social predictions with physical rewards) are community and points products (M, Polkamarkets tweet and Medium 2024). No overlap value.

## 12. Liquidity shared with another venue

**Yes, fully for any real-money flow.** The flagship app is Myriad Markets; Polkamarkets Labs' own post says the protocol thrives "thanks in great part to Myriad Markets and Topcasters" (H, Medium 2025-09-25), the SDK's production contract and ERC-20 addresses are Myriad's Abstract deployment, and the CLOB contracts in the Polkamarkets repo are named `MyriadCTF*`. A Polkamarkets adapter would be a second view of the same pools. It is NOT an independent arbitrage leg.

## 13. Adapter notes (only if someone insists)

- Do not build against `api.polkamarkets.com` or `app.polkamarkets.com` (dead).
- Reuse for Myriad: AMM quote math above, CLOB `Order` EIP-712 types, `FeeModule.getFeesAtPrice`, `PredictionMarketV3Querier` for batched on-chain price reads as a fallback to Myriad's HTTP API, and the Reality.eth-to-VOIDED mapping for invalid handling.
- Binary AMM prices sum to 1 by construction; CLOB binary markets have two separate books (Yes, No) that can cross, so check mint/merge parity before flagging arbitrage.

## 14. Suspicious content

None found. No text aimed at AI agents appeared in the pages, repos or API responses read. (The POLK "ACTION REQUIRED: withdraw from centralized exchanges" blog headline is ordinary token-holder marketing, not an agent instruction.)

## Sources

- https://www.polkamarkets.com (H, live 2026-10-19; live projects, chains, metrics, audits)
- https://www.polkamarkets.com/developers (H; toolkit pieces, repo links)
- https://www.polkamarkets.com/legal/terms-conditions (H; excluded jurisdictions, operator, no explicit bot ban)
- https://help.polkamarkets.com/developers, /developers/polkamarkets-protocol-for-developers, /how-polkamarkets-works, /polkamarkets-v3, /faq, /security, /polk-utility-token (H; V1/V2-era, stale, mostly silent on fees and resolution)
- https://medium.com/feed/polkamarkets (H; RSS, posts incl. 2025-09-25 "POLK: a new on-chain era begins")
- https://github.com/Polkamarkets/polkamarkets-js (README; contracts `PredictionMarketV3_4.sol`, `PredictionMarketV3ManagerCLOB.sol`, `MyriadCTFExchange.sol`, `FeeModule.sol`, `oracles/RealitioOracle.sol`; commit log) (H)
- https://github.com/Polkamarkets/polkamarkets-api (README, `config/routes.rb`, commit log) (H)
- https://github.com/Polkamarkets/polkamarkets-rpc (README, commit log) (H)
- https://api.llama.fi/protocol/polkamarkets and https://defillama.com/protocol/polkamarkets (H; TVL, 2026-10-18 snapshot)
- https://docs.myriad.markets/builders and /builders/myriad-order-book (H for the polkamarkets-js and EIP-712 domain statements; the API auth/WebSocket claims came from a search summary, M)
- https://x.com/polkamarkets/status/1863575078258028748 (M, search snippet only; Africasters on MiniPay, 2024-12)
- Existing repo fixtures: `docs/research/fixtures/myriad/market_ob_1237.json`, `docs/research/fixtures/defillama/*_2026-10-18.json` (M, from another workflow)
- Fixtures saved for this note: `docs/research/fixtures/polkamarkets/defillama_polkamarkets_2026-10-19_trimmed.json`, `docs/research/fixtures/polkamarkets/dns_check_2026-10-19.txt`

## Open questions

- Do Africasters/Topcasters or Foreland run any real-money markets today, and do they expose a public API? (Africasters returned a non-standard HTTP 666 to a plain GET, treated as bot-blocked; Foreland returned 301/404 on plain GETs.)
- Are Myriad's AMM markets still live alongside the order book, or fully migrated? Which contract set is current on BNB, Linea, Abstract?
- Does PayBox support Abstract, Linea, Celo, Gnosis for transaction proposals, and typed-data signing for EIP-712 orders?
- Which Reality.eth arbitrator do live markets use, and who holds `RESOLUTION_ADMIN_ROLE`?
