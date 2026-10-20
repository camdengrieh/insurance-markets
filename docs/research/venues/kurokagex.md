# KuroKageX - venue spec (2026-10-19)

Verdict: site and API are live, but the production frontend is wired to **Ethereum Sepolia testnet with a mintable test "USDT"**. No real-money market was found. adapter_priority = **skip** (revisit only if a mainnet deployment appears).

Confidence tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Liveness
- https://www.kurokagex.io returns HTTP 200, Next.js app, `<title>KuroKageX</title>`, description "Prediction markets on-chain" (H, fetched 2026-10-19). Page is client-rendered, so there is no readable marketing text, docs or ToS.
- https://api.kurokagex.io/health returns `{"ok":true,"db":true,"redis":true}` (H).
- Latest trade seen on any market: 2026-10-02 (market 15653, 7 trades total); most other markets last traded Jul-Aug 2026 (H, trades endpoint). Newest market created 2026-08-13. So it is alive but near-dormant.
- GitHub Sealva-Devs/Prediction-Market-Web3 (created 2026-05-06, last push 2026-06-22, 32 stars, homepage = kurokagex.io) (H). Its README describes a **different, simpler codebase**: `WagerContract.sol`, a peer-to-peer wager/multi-sig escrow on Polygon Amoy testnet, "Dispute Resolution - submit disputes to Polymarket (ready for integration)". It does not describe the live YES/NO AMM contract. Treat it as an older template or sibling project, not the live venue source (M: inferred from comparing README function names with the live ABI).
- Web search for a mainnet launch was not possible (session search budget exhausted). NOT FOUND (searched: homepage, site JS bundle, GitHub README/commits, API). No evidence of any mainnet deployment.

## Kind and market model
- kind: onchain AMM, binary YES/NO only (H: API fields `yesReserve`, `noReserve`, `yesTokenId`, `noTokenId`; ABI `buyYes/buyNo/sellYes/sellNo`).
- Outcomes are ERC-1155 token IDs in one market contract (ABI has `balanceOfBatch`, `safeBatchTransferFrom`, `uri`) (H).
- Pricing: constant-product style reserves. Observed `getYesPrice(23684)` on chain = 0.448937e18 and API `/price` = `{"yes":0.448937,"no":0.551063}`; equals `noReserve/(yesReserve+noReserve)` from the market row (H, my calculation matches).
- `marketKind`: all 18 listed are `ADMIN`; an "agent" market type (user-hosted "clubs", tiers, LP stages, backstop) exists in code (H: ABI + API fields) but none are listed publicly.
- Categories: esports, crypto, entertainment, politics, ai, others (H, `/markets/categories`).

## Chains and collateral
- Frontend bundle default chain id `11155111` (Ethereum Sepolia). Public RPC `eth_chainId` returned `0xaa36a7` for the same RPC the app uses (H). The bundle can also target 1, 56 and 97 via config, but production is compiled for Sepolia (H).
- Market contract (proxy, UUPS): `0xd070F8790a69872a360A53C52aF4Ee2D797bd987` on Sepolia; has code (H, eth_getCode). `getMarketCount()` = 25245 (testnet churn; only 18 are public via API) (H).
- Collateral: `usdt()` = `0x50a52805Cb9D13D5645a16912499624788d0D138`, name/symbol "USDT", **18 decimals**, total supply 1e25 (10M units) (H, eth_call). A faucet/minter ABI (`mint`, `configureMinter`, `minterAllowance`) is present in the bundle, so this is a test token with no value (M).
- Admin address read from `admin()` is a single EOA-style address (not recorded here as it is not needed).

## Read API
- exists: **unofficial-only** (undocumented but public, unauthenticated, used by the frontend; no docs/OpenAPI found: `/docs`, `/openapi.json` return 404).
- base URL: `https://api.kurokagex.io` (Fastify-style 404 JSON).
- Verified unauthenticated GETs (H, fixtures saved):
  - `GET /health`
  - `GET /markets` (array of all public markets, ~35KB for 18 markets; `?limit=N` works)
  - `GET /markets/categories`
  - `GET /markets/{slug}/price` -> `{"yes":0.448937,"no":0.551063}` (note: numeric id returns 404/500; slug required)
  - `GET /markets/{slug}/stats` -> `{"volumeWei":"3000000000000000000000","traders":2}`
  - `GET /markets/{slug}/trades?limit=3` -> `{total,page,limit,trades:[{direction,side,usdtIn,tokensOut,feePaid,txHash,blockNumber,createdAt,walletAddress,username}]}`
  - `GET /markets/{slug}/comments` -> `[]`
- Auth-only (401): `/markets/{slug}/position`, `/markets/{slug}/claim-preview`. Other app routes seen in bundle: `/positions`, `/auth/*` (Privy plus social login), `/agents/*`, `/leaderboard` (404 on GET).
- Rate limit headers: `x-ratelimit-limit: 1000`, resets in about 60s (H). Websocket: NOT FOUND for the API (the app uses a wss Sepolia RPC for chain events only).
- Order book / depth: none, it is an AMM; quote from reserves plus fee formula.
- Fixtures: `docs/research/fixtures/kurokagex/{markets,markets_categories,market_price,market_stats,market_trades,health}.json`.

Market row shape (key fields): `id`, `chainMarketId`, `slug`, `question`, `description` (includes resolution source text), `status` (ACTIVE...), `outcome` (UNRESOLVED...), `yesTokenId`, `noTokenId`, `yesReserve`, `noReserve`, `totalCollateral`, `yesSupply`, `noSupply`, `chainTradingVolume` (all wei strings, 18 dec), `startTime`, `endTime`, `closedAt`, `settlementTxHash`, `category`, `marketTags`, `visibility`.

## Trade path
- Direct on-chain calls (H, ABI from the site bundle): `buyYes(uint256 marketId, uint256 usdtAmount, uint256 minTokensOut)`, `buyNo(...)`, `sellYes(marketId, tokenAmount, minUsdtOut)`, `sellNo(...)`, `claim(marketId)`, `timeoutCancel(marketId)`. Needs ERC-20 `approve` on the test USDT first. Slippage via `minTokensOut`/`minUsdtOut`.
- No signed-order API. The app logs in with Privy and derives a "user deposit address" (`getUserDepositAddress`), so the UI may route through a platform-managed wallet; not investigated (M).
- PayBox reachable: **no**. An EVM wallet could technically send proposals on Sepolia, but PayBox targets mainnets (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) and there is nothing of value on a testnet.

## Fees (on-chain reads at 2026-10-19, H)
- `buyFeeBps` 100 (1%), `sellFeeBps` 100 (1%), `settlementFeeBps` 200 (2%), `creatorFeeBps` 50, `lpFeeSplitBps` 5000.
- Imbalance surcharge tiers: `imbalanceFee1Bps` 100, `imbalanceFee2Bps` 200, `imbalanceFee3Bps` 300 (UI: "trades that increase the imbalance may pay a higher fee").
- Observed: a 1000 USDT buy paid `feePaid` = 10 USDT (1%) (H, trades fixture).
- Limits: `minBet` 1e18 (1 USDT), `maxBet` 1e21 (1000 USDT), `reserveFloorBps` 100, `finalLockSeconds` 60 (trading locks 60s before end).

## Resolution
- Admin-driven: `closeMarket(marketId, closeType, winnerSide)` is called by the protocol admin; `timeoutCancel` after `timeoutGracePeriod` = 259200s (3 days) voids and refunds if unresolved (H, ABI + chain read). Market descriptions name sources (e.g. official tournament results cross-checked against Liquipedia) and say cancelled events resolve void.
- No oracle, no dispute window found in ABI (NOT FOUND: dispute function). Single-admin trust risk is high; contract is upgradeable (UUPS) and has `rescueTokens`, `pauseProtocol`.

## Geo / ToS / automation
- NOT FOUND: /terms, /privacy, /docs, /about, /faq all 404. The bundle has only "By continuing you agree to our Terms of Use and Privacy Policy" with no linked page. No automation or geo policy published. Public API is rate limited at 1000 req/window.

## Liquidity (API, 2026-10-19)
- 18 public markets, all ACTIVE and all ADMIN-created. Sum of `chainTradingVolume` about 18,711 test-USDT; sum of `totalCollateral` about 18,524 test-USDT; 10 of 18 have zero volume (H, markets fixture). Protocol-wide `totalLockedCollateral` 192,988 test-USDT incl. non-public markets (H). **All of this is testnet token with no monetary value.**
- Trades appear seeded by a few accounts (3 trades of 1000 USDT in the top market, 2 traders).

## Event overlap (for reference only)
Listed questions overlap other venues: ETH $10k by Oct 31 / Dec 31, BTC $150k, SOL $500, XRP $5, crypto cap $6T, US Senate/House 2026 midterms, US shutdown, Russia-Ukraine ceasefire, Trump approval above 45%, GPT-6 by Dec 31, LoL Worlds 2026 Korean winner, plus Japanese-language VTuber markets. Mid prices are mostly 0.50 (untraded), so they are not usable as a signal. Independent liquidity: yes (own AMM), but valueless.

## Suspicious content
None found (no embedded instructions aimed at agents in API responses or bundle).

## Open questions
- Is there a mainnet deployment planned or live (BNB `56` is in the chain config list)? Could not search.
- Whether agent/club markets ever go public.

## Sources
- https://www.kurokagex.io (homepage + its static JS chunks) - H
- https://api.kurokagex.io/health, /markets, /markets/categories, /markets/{slug}/price|stats|trades|comments - H
- Sepolia public RPC https://ethereum-sepolia-rpc.publicnode.com (eth_chainId, eth_getCode, read-only eth_call on contract and token) - H
- https://github.com/Sealva-Devs/Prediction-Market-Web3 (README, repo metadata, commit list) - H for what it says; M for relevance to the live site
