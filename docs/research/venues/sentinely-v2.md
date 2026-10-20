# Sentinely V2 (a.k.a. NeuralMarket V2) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict
SKIP. Not a venue. It is a hobby/grant-stage front-end and AI-agent wrapper around Kalshi (REST via a platform-held API key; DFlow/Jupiter mentioned for Solana side). It has no market model, order book or liquidity of its own, no public data API, and the on-chain program is on Solana devnet. Any edge must be taken from Kalshi directly (already covered by the parallel workflow). Quotient-style "signal" value: none verified (the "AI signal" is an unvalidated marketing claim).

## Is it live?
- Listed URL https://neural-market-atomic.vercel.app returns HTTP 404 `DEPLOYMENT_NOT_FOUND` (Vercel) on 2026-10-19. [H] (curl)
- Alternate deployment https://sentinely.vercel.app returns 200 and shows "SYSTEM STATUS: LIVE", but the linked contract and latest tx are on Solana devnet; volume ticker shows $0.0M; no developer docs link. [H] (WebFetch of the page; page text is marketing, treated as data)
- GitHub repo DarkMagician256/Sentinely: created 2026-04-07, last push 2026-04-11, 0 stars, homepage set to the dead neural-market-atomic URL. No commits for ~6 months. [H] (gh api)
- npm @sentinelysolana/sdk: v1.0.0 and 1.0.1 published 2026-04-11, nothing since. [H] (registry.npmjs.org)

## Kind and market model
- Kind: broker-or-frontend / analytics dashboard + "NeuralVault" Anchor program (devnet) that records agent trades and holds USDC. [H] (README, executeTrade.ts)
- Market model: none of its own. Markets shown are Kalshi events/markets (binary YES/NO priced in dollars, Kalshi tickers); `getMarkets.ts` pulls Kalshi events and re-buckets by category. [H] (app/actions/getMarkets.ts)
- Outcome tokenisation: none. The trade-building server action only creates a Solana Memo instruction plus a `recordTradeStandalone` call into the vault program (a bookkeeping record, not a position). [H] (app/actions/executeTrade.ts)

## Chains and collateral
- Solana devnet; USDC in NeuralVault PDAs; program id appears in source (public, not a user secret). [H]
- Real order placement uses Kalshi's USD account behind the platform's API credentials, not on-chain collateral. [H] (kalshiTrading.ts docstring: "Orders are placed under the platform's API key")
- Kalshi client defaults to the DEMO base (demo-api.kalshi.co) unless KALSHI_TRADING_ENV=production. [H] (lib/kalshi.ts)

## Read API
- Official public API: NONE. NOT FOUND (searched: site footer/links, README, repo tree, /api/markets on both hosts returned 404). The README mentions an "MPP / x402 gateway" in `packages/api` charging 0.05 USDC per prediction call via HTTP 402, but no endpoint is documented and the package is not in the repo tree listing I read. [M]
- Underlying data is Kalshi's `https://api.elections.kalshi.com/trade-api/v2` (docs https://docs.kalshi.com), which should be consumed directly. [H] (lib/kalshi.ts)
- Websocket: none documented.
- Fixtures: none saved (no Sentinely response shapes to capture; the only live host returns HTML or 404).

## Trade path
- None for an external agent. Orders go through the operator's Kalshi credentials; users are supposed to pass a "DFlow Proof" KYC gate. A builder code `ORACULO_V2` is attached to orders for Kalshi Builders Program revenue attribution. [H] (KALSHI_APPLICATION.md, kalshiTrading.ts)
- PayBox reachability: no. Nothing to sign for the venue itself; the vault is devnet; an EVM wallet could not trade it. Trading Kalshi markets via DFlow on Solana is a Kalshi/DFlow question, not Sentinely.

## Fees
- 0.5% NeuralVault protocol fee (auto-collected), 0.05 USDC per prediction API call (HTTP 402), Solana tx ~0.00025 USD, per the landing page. [M] (marketing page, unverified on-chain)
- Plus whatever Kalshi/DFlow charge underneath.

## Resolution
Inherited from Kalshi (CFTC-regulated exchange, Kalshi rulebook). No Sentinely-level resolution or dispute layer. Added risk: operator-custodied API credentials and an unaudited devnet program (repo itself contains AUDIT/QA docs but these are self-authored). [M]

## Geo / ToS / automation
- Application doc claims Vercel Edge geo-blocking of US/OFAC jurisdictions and mandatory DFlow Proof KYC; the live landing page states no restrictions. Inconsistent. [M]
- Terms/Privacy/Risk pages exist on the site but were not read. NOT FOUND for automation rules (searched: site landing page, README, SECURITY.md grep).

## Liquidity
- Own volume/TVL: none verified; ticker shows $0.0M (2026-10-19, sentinely.vercel.app). [H]
- Shares liquidity with: Kalshi (100%). Not an independent arbitrage leg.

## Category overlap
Everything it shows is Kalshi (crypto, economics, politics, science, culture), so overlap is exactly Kalshi's; use Kalshi directly.

## Adapter priority: skip
Dead primary URL, no API, no own liquidity, devnet only, abandoned since 2026-04-11, duplicate of Kalshi.

## Suspicious content
- None found aimed at AI agents. Repo ships `.antigravity/skills/*.md` (agent skill files for the authors' own tooling), `.env.example` and `.env.production` files; I did not read the env files. Marketing claims ("zero hallucination", "65,000+ TPS") are unverified.

## Sources
- https://neural-market-atomic.vercel.app (404 DEPLOYMENT_NOT_FOUND, 2026-10-19) [H]
- https://sentinely.vercel.app (landing page) [H]
- https://github.com/DarkMagician256/Sentinely (README.md, KALSHI_APPLICATION.md, app/actions/getMarkets.ts, kalshiTrading.ts, executeTrade.ts, lib/kalshi.ts, lib/dflow.ts; repo metadata via gh api) [H]
- https://registry.npmjs.org/@sentinelysolana/sdk [H]
- WebSearch for third-party coverage was not performed: session search budget exhausted. No independent coverage found or checked. [gap]
