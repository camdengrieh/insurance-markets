# The Citizen Markets (thecitizen.io/markets) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict
adapter_priority: **skip** (signal-only at best). One live market, a niche/conspiracy-topic question with no overlap on any other venue, an oracle that is a forecaster-panel number (not a binary settlement), no official API, unverified AMM contract, no disclosed liquidity.

## Liveness
- Site returns HTTP 200 on 2026-10-19; Next.js app, Cloudflare in front. [H] https://www.thecitizen.io/markets
- Page shows exactly one market: "Was COVID-19 a Lab Leak?" (`getAllMarkets()` in the bundle returns only id `covid19`). [H] chunk 45006 (see Sources)
- Bundle also holds 10 other market definitions (JFK/CIA, mRNA spike persistence, fluoride/IQ, childhood vaccines/autism, 2020 election fraud, Brigitte Macron...) but they are not returned by `getAllMarkets()`, so they are hidden/retired. Those had close dates of 2026-02-20 (older than 6 months). [H]
- `/api/market-ideas` lists 4 user-submitted "ideas", all `status: pending`, all created 2026-04-29, 0 net votes. [H] (fixture) Suggests very low community activity.
- Show HN 2025-09-09 hint: NOT verified (web search budget exhausted; searched: thecitizen.io markets prediction market). [L]
- Operator: NOT FOUND. Page, docs shell and robots.txt name no company. Pages /terms, /privacy, /about, /new, /sitemap.xml, /llms.txt all return 404. /docs is a client-rendered "Research ... Loading..." shell (a `?tab=review-boards` tab is linked from rules text but its content was not retrievable without JS). [H]
- Footer/wallet modal says "By connecting, you agree to the Terms of Service & Privacy Policy" but this is the generic thirdweb Connect modal string; no ToS URL found. [M]

## Kind and market model
- kind: on-chain binary prediction market, AMM (no order book). [M/H]
- Binary Yes/No. Outcomes are ERC-1155 positions of a Gnosis Conditional Tokens contract (verified on Sourcify as `ConditionalTokens`, matches `@gnosis.pm/conditional-tokens-contracts`). Position IDs are hard-coded per market in the bundle. [H] https://sourcify.dev/server/v2/contract/8453/0x441b85F16D590553169357195CEc8C17a4f8A957
- Market maker contract: frontend ABI strings are `buy(uint256 investmentAmount,uint256 outcomeIndex,uint256 minOutcomeTokensToBuy)`, `sell(uint256 returnAmount,uint256 outcomeIndex,uint256 maxOutcomeTokensToSell)`, `calcBuyAmount`, `calcSellAmount`, `calcMarginalPrice(uint8)` - this is the Gnosis/Omen FPMM interface. The sell quote code in the bundle uses the FPMM constant-product quadratic (outcome1+outcome2+shares)^2 - 4*... and takes a `feeBps` param (passed as 0n). [H for ABI strings; M for "FPMM" label]. The market contract (0x0842...35A1) is NOT verified on Sourcify (404), so real fee and bytecode are unconfirmed. [H]
- Price = `calcMarginalPrice(0|1)` read on-chain; collateral decimals 6 (USDC), outcome token decimals 6 for covid19 (18 for the retired markets). [H]

## Chains and collateral
- Base mainnet (8453), USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. [H] Deposit page: "Add USDC on Base to your wallet to start trading". https://www.thecitizen.io/deposit
- covid19 market contract `0x0842897551AD876979CcbcEeaDCAfA730DC435A1`; CTF `0x441b85F16D590553169357195CEc8C17a4f8A957`. [H] (fixtures/the-citizen-markets/onchain_config_covid19.json)
- Wallet connect via thirdweb (in-app/embedded + external wallets, WalletConnect). The thirdweb clientId in the bundle is a public client key; deliberately not recorded here.

## Read API
- exists: **onchain-or-subgraph-only** (no official API). No API docs found; /docs is a research/article shell.
- Only HTTP endpoint found: `GET https://www.thecitizen.io/api/market-ideas` (unofficial, internal, JSON list of proposed ideas; fields id,title,description,rules,netVotes,walletAddress,status,createdAt). CORS allows GET/POST/PATCH (POST for submitting ideas; not touched). [H] sample: fixtures/the-citizen-markets/api_market-ideas.sanitized.json (third-party wallet redacted).
- Market list is a static array compiled into the JS bundle, not served by an API. Aggregator would need to either hard-code the contract list or poll the bundle (fragile). [H]
- Prices/depth: `eth_call` to market contract `calcMarginalPrice(uint8)`, `calcBuyAmount`, `calcSellAmount`; reserves via `balanceOf(market, positionId)` on the CTF. I did NOT run eth_call (JSON-RPC is POST; project rule is no POST) so live prices were not sampled. [H for method names]
- Trades history: no endpoint; would need event logs (FPMM `FPMMBuy`/`FPMMSell` if standard - unconfirmed because contract is unverified). The app itself reads history via thirdweb Insight (`insight` host) with a 90-day lookback. [M]
- Rate limits/websocket: NOT FOUND. Explorer routes tried: Blockscout API (Cloudflare 403), Routescan (chain/endpoint not supported), so on-chain stats (balance, tx count) were not obtained.

## Trade path
- Programmatic via direct on-chain transactions only: `USDC.approve(market, amt)` then `market.buy(investment, outcomeIndex, minTokens)`; sell via `market.sell(...)` after `CTF.setApprovalForAll(market,true)`; redeem via `CTF.redeemPositions(USDC, 0x0, conditionId, indexSets)`. [H for ABI strings from the app bundle; semantics M]
- No signed-order scheme, no API key, no relayer observed.
- PayBox reachability: **yes in principle** - any Base EVM wallet can send these transactions as transaction proposals (approve + buy). The generic PayBox path would be contract calls on Base; not tested (no money-moving tools used). Note market contract unverified, so simulate before use.

## Fees
- NOT FOUND. Frontend quotes use `feeBps = 0n`; actual contract fee is unverified. If standard FPMM, fee stays in pool and accrues to LPs. [M] Plus Base gas.

## Resolution
- covid19: rule text says Yes if "clear and convincing evidence" of lab leak, else No; but the operative mechanism described is a **price oracle**: reference price = Good Judgment Project superforecasters' current published probability for Yes, updated continuously with no fixed schedule; exchange price may deviate. "Not a final determination". [H] (bundle rules text). There is no stated final settlement date or payout path for this market; whether `reportPayouts` is ever called is unknown.
- Retired markets used a "WSJ review board" (history/scientific) to decide Yes/No within 3 days of 2026-02-20 close; the name "WSJ" is as written in the bundle; affiliation with any news org is unverified and implausible (M/L). 
- Another (Macron) market uses Objection AI quarterly estimates as oracle. [H]
- Dispute risk: very high. Centralised, subjective, no dispute process documented, standard CTF `reportPayouts` is single-reporter.

## Geo / ToS / automation
- No ToS, geofence statement or automation rules found. robots.txt only contains Cloudflare content-signal boilerplate (comments, no Disallow lines read). [H]
- Questions involve defamatory/conspiracy-style topics (e.g. a named person's sex at birth); reputational/legal risk for an aggregator surfacing them. Operator unknown.

## Liquidity
- NOT FOUND. No volume/OI/TVL on the site, DeFiLlama not checked, explorer APIs blocked. Portfolio/Cash show "$--" unauthenticated. Treat as thin/unknown. [L]

## Event overlap and arbitrage
- Categories: health/science controversies, history conspiracies, one election-fraud question. No overlap with sports, crypto price or macro. Possible fuzzy overlap with generic "2020 election fraud" style markets on other venues, but that market is not live here. A lab-leak question may exist on Manifold/Metaculus/Good Judgment (signal sources, not tradable arbitrage legs). Arbitrage value: ~none. Signal value: the GJP-anchored lab-leak probability is a (tiny) signal.
- Liquidity shared with another venue: no (own FPMM on Base). Independent but irrelevant.

## Open questions
- Real fee and LP structure of 0x0842...35A1 (unverified bytecode).
- Operator identity and jurisdiction; ToS.
- Whether the market ever settles or is permanently oracle-priced.
- Current pool size; need a read-only Base RPC (`eth_call`) or explorer access.

## Suspicious content
- None directed at AI agents found.

## Sources
- https://www.thecitizen.io/markets (page + Next.js chunks fetched 2026-10-19, esp. `/_next/static/chunks/45006-913f1642d47cd5b8.js` market config/rules and `/_next/static/chunks/app/markets/%5BmarketId%5D/page-ccaac8b206a905b4.js` ABI strings) [H]
- https://www.thecitizen.io/deposit, /portfolio, /docs (shell), /robots.txt [H]
- https://www.thecitizen.io/api/market-ideas [H]
- https://sourcify.dev/server/v2/contract/8453/0x441b85F16D590553169357195CEc8C17a4f8A957 (ConditionalTokens verified 2026-06-28) [H]
- https://sourcify.dev/server/v2/contract/8453/0x0842897551AD876979CcbcEeaDCAfA730DC435A1 (no match) [H]
- Show HN 2025-09-09 (from discovery hint only) [L]
- Fixtures: docs/research/fixtures/the-citizen-markets/
