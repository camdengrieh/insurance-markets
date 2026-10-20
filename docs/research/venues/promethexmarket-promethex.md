# PromethexMarket (PrometheX) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip**. PrometheX is a white-label "PMaaS" vendor, not a trading venue with independent real-money liquidity. Its only public deployment is **Arbitrum Sepolia testnet** (play money, bot-driven trades, last trade 2026-07-27). Mainnet is "planned" and unconfirmed. Revisit only if (a) Arbitrum One contracts appear, or (b) a named white-label client ships real-money markets on its contracts (then integrate that client, using the CTF/UMA structure below).

## Liveness [H]

- Marketing site is live (HTTP 200, 2026-10-19): https://promethex.market (SPA; title "PrometheX - Prediction Market Infrastructure for Everyone"; "Deploy white-label prediction markets in 4 weeks"; JSON-LD lists a "Launch Engine" offer at USD 50,000). Footer/JSON-LD links: x.com/promethe_X, t.me/promethe_x, github.com/promethex2026, docs.promethex.market, app.promethex.market, demo.promethex.market, cdn.promethex.io/widget.js.
- Product app https://app.promethex.market returns 200. Public API https://api.promethex.market/api/v1/market/get-markets returns 5 markets (see fixtures).
- Testnet evidence [H]:
  - Docs say "currently live on Arbitrum Sepolia ... testnet"; Arbitrum One "Coming Soon" / "Mainnet deployment has not yet occurred" (https://github.com/promethex2026/app-docs, user-guide/faq/supported-chains.mdx, contracts/addresses.mdx; last commit 2026-03-15). Partner docs (GitBook repo, last commit 2026-04-21) say "Arbitrum One - Planned Q2 2026"; roadmap lists Arbitrum One under "On the Horizon (H2 2026+)" and "Last updated: April 2026" (platform-features/deployment-roadmap.md). Both timelines slipped or conflict (Q2 2026 vs H2 2026+): L for any mainnet date.
  - Market images are hosted in an S3 bucket path `arb-sepolia-usdc/`; I called `eth_getCode` on the Iranian-regime market address `0x768a...1F5B` on public RPCs: contract code (EIP-1167 minimal proxy) on Arbitrum Sepolia, empty (`0x`) on Arbitrum One. Base token `0x1A8da4...B490` on Arb Sepolia has `symbol()` = "WUSDC" (not a real USDC). Note this base token differs from the docs' tUSDC `0x52cb...6408` (docs may be stale).
  - All 5 live markets: every trade on the first 50 per market was from `bot_*` UIDs with persona names; latest trade 2026-07-27 21:13 UTC (about 12 weeks before today); a market titled "Iran closes Strait of Hormuz by September 30?" is still `marketStatus=1` after that date with a Dec-31 deadline (stale, not maintained). Market titles/images appear copied from Polymarket (one image URL is a polymarket-upload S3 file). [H for observations; M for interpretation "seeded demo content"].
- Independent coverage: WebSearch (extended) found no news, reviews or filings about PrometheX except its own site; a second search (CertiK/mainnet) was blocked by the shared search budget. Site and docs claim a CertiK audit / Skynet listing (https://skynet.certik.com/projects/promethex) but the roadmap says "Third-party smart contract audit in progress" - not verified, and the claims conflict [M]. GitHub org `promethex2026` created 2026-02-15, 3 repos (.github, app-docs, partner-docs), no code repos [H].

## Kind and market model

- Kind: white-label prediction-market infrastructure vendor (PMaaS) licensed to partners; reference app + public API run by PrometheX itself. [H] partner-docs service-tiers.md: Launch Engine USD 50k + 10% revenue share; Growth 80k / 8%; Operator 100k / 5%; "API Access & Data Exports" only in the top tier.
- Market model [H, docs + API]: binary and N-outcome (NegRisk) markets; outcomes are ERC-1155 Gnosis ConditionalTokens positions (fields `conditionId`, `questionId`, `outcomeSlotCount`, per-option `positionId`; also per-option "token address" synthetic addresses). Pricing by **APMM** (Automated Prediction Market Maker, a pool/bonding-curve AMM, "Yes + No = 1"). CLOB is a roadmap item ("Next Up Q2-Q3 2026") though `contracts/clob-settlement.mdx` exists in app-docs; not confirmed live.
- Price units: 6-decimal integers (`price: "46908"` = 0.046908). Volume `marketVolume` in 6-dp base units (e.g. 24026333140 = 24,026 test USDC).

## Chains and collateral

- Arbitrum Sepolia (chain 421614), test stablecoin (6 dp). Planned: Arbitrum One with native USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`; later Base, Polygon (roadmap, L). [H docs]
- Docs also claim white-label clients are "deployed on EVM mainnets" (partner roadmap "What's Live Now") but name none and give no addresses: NOT FOUND (searched: partner-docs, app-docs, site bundle, web search).
- Testnet contract addresses (docs, [H]): ConditionalTokens `0xf5E0891F0f5ba4C2b6034720b444eb79926e1DF0`, PredictionFactory proxy `0xD4840C6aAF2e098e6B736e28c3B87DfD7b84c2C4`, CTFOracle `0x982e18db6837D55297c39926dE86ae560cd96f99`, UmaOOV3ResolutionModule `0x4084526855cf8e6604623506dAB46A9d53941845`, EntryPoint v0.6 `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`. Testnet uses a MockOptimisticOracleV3.

## Read API

- Status: **official-public** for market data (unauthenticated GET works), authenticated for everything state-changing. [H]
- Docs: https://docs.promethex.market (static page, Chinese/English toggle) backed by Mintlify source https://github.com/promethex2026/app-docs (api-reference/*.mdx).
- Base URL: `https://api.promethex.market/api/v1/market/...` works (live). Docs say staging is `https://api-staging.promethex.market` - **does not resolve in DNS** [H]. Partner docs claim `https://app.promethex.market/api/v1` as base: that path returns 404 [H]. Docs are therefore partially wrong/stale.
- Envelope: `{code, reason, msg, data}`; code 0 = ok.
- Endpoints confirmed live (no auth): `GET get-markets?page&pageSize<=50` (also tag/status/sortType/categoryId filters per docs), `GET get-market-detail?marketAddress=`, `GET get-market-trades?marketAddress&page&pageSize`, `GET get-hot-markets`. `get-price-history` is documented as public but returned **404** [H].
- Response shapes differ from docs: live keys are `marketName`, `marketStatus` (int, 1 = running), `marketVolume`, `options[].tokenPrice`, `deadline` (unix seconds), `result`, `optionList[].price` in detail; docs show `title`, `status` string, `price` as 0-1 decimal. Adapter must be written from the live shapes (fixtures), not the docs. [H]
- No order book / depth endpoint (APMM: price is pool-derived; liquidity field only documented in detail response, absent in the live detail sample).
- Real-time: SSE, `POST /sse/connect` (requires Privy JWT), subscribe by `market:{address}` topics, events `market:price_change`, `market:new_trades`, `market:info_update`; 10-min timeout; 1 concurrent connection per user. No websocket. [H docs, not tested - needs auth]
- Auth: Privy JWT (ES256) for private endpoints; none for public reads. Rate limit: BBR adaptive; error 110103 / HTTP 429; guidance 30 req/s public reads. [H docs]
- On-chain alternative: conditions and balances readable via the ConditionalTokens contract on the chain RPC.

## Trade path

- Programmatic: `POST /api/v1/market/place-order` with a signed **ERC-4337 UserOperation** (EntryPoint v0.6, paymaster-sponsored gas, Privy-created smart account) plus `marketAddress, optionAddress, side (1 buy), price, amount, minReceiveAmount, deadline`. Auth = Privy JWT, which requires a Privy login (email/social/wallet) - cannot be obtained without signing up. [H docs]
- Direct on-chain: contracts are permissionless per docs; an EOA could call the APMM/market contract directly (ABI not in the docs read; `contracts/prediction-ctf.mdx`, `router.mdx` exist but were not parsed in depth). [M]
- PayBox reachability: **no (practically)**. Only testnet exists, so there is nothing to trade with real funds. If mainnet Arbitrum One launched, a PayBox EVM wallet on Arbitrum could in principle send direct contract calls (approve USDC + buy via router) as transaction proposals; the documented API path needs a Privy JWT plus a UserOp signed by the smart-account owner, which does not fit PayBox's flow. [M]
- No money-moving or signing tools were called; no accounts created.

## Fees [H docs: user-guide/trading/fees.mdx]

- 1% default trading fee (100 bps) on buy and sell, paid by the trader, 100% to liquidity providers; per-market configurable. Gas: sponsored by paymaster. Claim: free. Partner revenue share is on trading fees (above).

## Resolution and dispute risk [H docs]

- UMA Optimistic Oracle V3 (production target `0xa6147867264374F324524E30C02C331cF28aa879` on Arb One); market creator (or authorized party) asserts with a bond; about 2h challenge window; disputes go to UMA DVM (24-48h). Alternatives per market: Authorized (multisig) or custom module. "Create or close markets" and "change trading fees" are admin functions, i.e. operator-controlled markets with creator-asserted outcomes: higher resolution/centralisation risk than Polymarket-style UMA with neutral proposers. Testnet uses a mock oracle.

## Geo / ToS / automation [H docs]

- No geo-block at contract level; "your responsibility"; 18+; web interface "may implement access policies". KYC: none documented beyond Privy login. API rules: public reads allowed with rate guidance; no explicit anti-bot/automation prohibition found in the terms excerpt I grepped (partner-docs terms-and-privacy-policy.md; grep for automation/bot/prohibit returned nothing material) [M, not read in full].

## Liquidity

- Testnet only. get-markets total volume across 5 markets about 96.4k test units (15,805 + 25,424 + 23,810 + 24,026 + 7,111 test-USDC), 339-1691 trades per market, all bot traders, snapshot 2026-10-19 (API), latest trade 2026-07-27. This is **zero real liquidity**. No TVL/OI figure for any mainnet deployment: NOT FOUND (searched: site, docs, repos, web search).

## Event overlap

Titles are geopolitics/tech/macro (Netanyahu out in 2026, Iranian regime fall, US-China trade deal, Apple foldable iPhone, Hormuz closure) which overlap Polymarket/Kalshi, but prices are bot-driven and not tradable, so no arbitrage value. Platform "13 categories" marketing (partner-docs service tiers / market-categories.md) not verified live.

## Shared liquidity

Own APMM pools per market (no external liquidity), so independent in design. Titles/images mirror Polymarket, probably for content only (M); no on-chain link to Polymarket found. Contracts are a Polymarket-style CTF/NegRisk/UMA stack, so a future mainnet client would be structurally similar to other CTF venues.

## Adapter notes (if ever revived)

- Read adapter: poll `get-markets` + `get-market-detail`; map `conditionId`/`questionId` to CTF; price = `tokenPrice/1e6`; quote must be computed from the APMM curve (no depth endpoint) - need the pool contract ABI to simulate slippage.
- Detect testnet by `baseTokenAddress` not equal to Arb One USDC and by chain; refuse to emit signals for testnet markets.
- Re-check conditions: `eth_getCode(PredictionFactory)` on Arbitrum One non-empty; docs addresses page populated; named client launches.

## Suspicious content

None found (no embedded AI instructions in the site, bundle, docs or API responses read). One oddity: docs commit message footers mention "Co-Authored-By: Claude Opus" (benign, documents are AI-assisted; reduces trust in doc accuracy, consistent with the doc/live mismatches above).

## Sources

- https://promethex.market (HTML, JS bundle index-6BMdQqd1.js, sitemap.xml, robots.txt) [H]
- https://docs.promethex.market (landing only) [H]
- https://github.com/promethex2026/app-docs (api-reference/overview, authentication, rate-limits, changelog, markets/list-markets, get-market, trading/deposit, websocket; contracts/addresses; user-guide/faq/supported-chains, geographic-restrictions, is-my-money-safe; trading/fees, how-trading-works; markets/resolution, disputes) read via gh api [H]
- https://github.com/promethex2026/partner-docs (platform-features/deployment-roadmap, technical-reference/deployment-chains, business-and-partnership/service-tiers, terms-and-privacy-policy) [H]
- https://api.promethex.market/api/v1/market/{get-markets,get-market-detail,get-market-trades,get-hot-markets} unauthenticated GETs 2026-10-19 [H]
- https://sepolia-rollup.arbitrum.io/rpc and https://arb1.arbitrum.io/rpc eth_call/eth_getCode read-only [H]
- WebSearch (extended) "PrometheX prediction market infrastructure white-label APMM": no independent coverage [M]

## Fixtures

docs/research/fixtures/promethexmarket-promethex/get-markets-pageSize50.json, get-market-detail.json, get-market-trades-pageSize5.json

## Not found

Mainnet addresses or volume; any named white-label client; CLOB/order-book endpoint; price-history endpoint (404); working staging host; websocket; full ToS automation clause; independent audit confirmation.
