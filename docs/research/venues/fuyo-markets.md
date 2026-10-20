# Fuyo Markets - venue spec (researched 2026-10-19)

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.
Verdict: LIVE, but a centralised, off-chain-engine, treasury-seeded, tiny-liquidity venue with no documented public API and no order/signing path an agent could use. Adapter priority: **skip** (optionally P2 read-only signal later).

## 1. Identity and live status
- Name: Fuyo Markets (previously "Maiga"; same team as maiga.ai DeFAI agent on BNB Chain). [H] https://docs.fuyo.markets/about/investors.md , https://docs.fuyo.markets/about/team.md
- Operator: Services "made available from the BVI" (British Virgin Islands); arbitration in BVI. [H] https://docs.fuyo.markets/terms-of-service.md (Last Updated 28 Feb 2026)
- Live: yes. Site published 2026-10-16 (Framer comment) [H https://fuyo.markets/]; trending-list `generatedAt` 2026-10-19T05:03Z and 209 live manual markets returned by the API on 2026-10-19 [H, see fixtures]. App: https://predict.fuyo.markets/markets (SEA/Asia-focused, UI in 10 languages).
- GitHub org `Fuyomarket` is the old ThirdFi org renamed/re-used (created 2026-07-02 per task hint; repos are ThirdFi forks/DeFi adapters plus `maiga-token-api`, `xp-token-contract`, all forks, last pushed 2025). NO Fuyo prediction-market contract or API repo found. [H, `gh api orgs/Fuyomarket/repos`]
- Investors claimed: Amber Group, Chainlink (build program), CoinMarketCap, Red Beard Ventures, IBC Group, TBV Ventures [H, docs; claims not verified].
- Socials: X @fuyomarkets, Telegram t.me/fuyomarketsofficial [H https://docs.fuyo.markets/official-links.md].

## 2. Kind and market model
- Kind: centralised-engine prediction market with on-chain deposits/withdrawals and "on-chain receipts". Not an on-chain AMM, not an order book. [H]
- Docs say: "pricing engine runs off-chain, blockchain records confirmed transactions as proof, and the treasury seeds initial liquidity." [H https://docs.fuyo.markets/markets/what-is-fuyos-lmsr/decentralization.md]. Homepage claim "every accepted trade is anchored on-chain" [H https://fuyo.markets/]; contract addresses/receipt tx format NOT FOUND (searched docs llms.txt index, welcome, FAQ, ToS; GitHub org). The app JS links to bscscan/polygonscan/etherscan/solscan/basescan tx explorers (likely deposit/withdraw tx links) [M].
- Binary YES/NO or UP/DOWN only. Multi-outcome questions are decomposed into one binary market per outcome with `parentMarketId`/`childMarkets` (e.g. "Where does $TLKM close...: 3,000 and above") and football 1X2 is three separate YES/NO markets per fixture sharing `fixtureId`. [H API fixtures]
- Pricing engines (inconsistent across docs and API - treat per-market `pricingEngine` field as truth):
  - `LMSR` on manual/long-dated, and 1/5/15-min candle markets in API (`b` = 10-20, `poolSize` 100 USDT per market). [H API]
  - `CPMM` on football 1X2 markets in API (`poolSize` null, volume ~0). [H API]
  - Docs FAQ claims crypto/commodity fast markets moved from CPMM to a parimutuel market maker (PMM): pool built from stakes, floating multiplier, one-sided pool (<$3 opposite side) is voided/refunded. [H https://docs.fuyo.markets/faq/parimutuel-market-maker.md] but the API still reports LMSR for candle markets. Unresolved discrepancy.
- Tokenisation: none visible. Positions are rows in Fuyo's database (`/market/{id}/bets`, `trades` with `sharesReceived`); no ERC-1155/ERC-20 outcome tokens documented. [M, from endpoint shapes; NOT FOUND any token contract]
- Quote semantics: displayed `yesProbability` and `noProbability` are fee-inclusive buy prices and sum to >100% (e.g. 48.36 + 54.64 = 103.0 on one market; 51.5 + 51.5 on fresh markets). `yesMultiplier` = payout per $1. [H fixtures]. Selling early is supported (re-quoted, pays spread again; locked in final seconds). [H https://docs.fuyo.markets/trading/can-i-sell-early-and-profit.md]
- Market creation: team-curated only; permissionless creation "in the near future". [H https://docs.fuyo.markets/markets/how-are-markets-created.md]

## 3. Chains and collateral
- Collateral: USDT, USDC, USDG (internal balance in USD terms). Withdrawals: select USDT, BEP-20 address (BNB Chain). [H https://docs.fuyo.markets/faq/chains-deposits-and-withdrawals.md]
- Deposit chains: BNB Chain (USDT, USDC), Arbitrum (USDT, USDC), Polygon (USDT, USDC), Ethereum (USDT, USDC), Solana (USDT, USDC), Base (USDC), Arc (USDC), Robinhood Chain (USDG). [H https://docs.fuyo.markets/deposit-and-withdrawal/how-to-deposit.md]
- "Live on BNB Chain Mainnet" is the home chain. Deposit flow: UI "Create Order" -> a per-order deposit address with a 5-minute window; send funds there; balance credited off-chain. (Matches "MPC vault wallets" claim on homepage.) [H docs; MPC detail M]
- Fiat on/off-ramp via Binance Connect. [H]

## 4. Read API
- Official public docs: NOT FOUND (searched docs.fuyo.markets llms.txt index of ~60 pages, welcome, FAQ, ToS; no "API"/"developers" page; GitHub org has no API repo). Status = **unofficial-only** (undocumented backend used by the web app; discovered by reading the app's public JS bundle statically, no code executed).
- Base URLs [H, from app bundle + live responses]:
  - REST + WS: `https://prediction-market-prod.maiga.ai/backend` (NestJS; 400/404 JSON error style)
  - Price feed: `https://prediction-market-prod.maiga.ai/data-engine` (+ `/health` returns `{"status":"ok"}`; WS `wss://prediction-market-prod.maiga.ai/data-engine/ws`, JSON `{"type":"subscribe","channels":[...]}`)
  - Note domain is `maiga.ai` (legacy brand), not fuyo.markets. `api.fuyo.markets` and `app.fuyo.markets` do not resolve.
- Unauthenticated GETs confirmed working (HTTP 200) [H]:
  - `GET /market/trending-list` -> `{generatedAt, footballDisplayMode, items[10]}`
  - `GET /market/details?market_type=<MarketType>&status=LIVE[&category=&topic=&base_symbol=]` -> array of full market objects (id, title, description incl. resolution rules, category, closesAt, yesPool/noPool, b, poolSize, pricingEngine, yesProbability, noProbability, yesMultiplier, noMultiplier, lastRoundVolume, lastRoundTradeCount, parentMarketId, childMarkets, fixtureId). `market_type` is required.
  - `GET /market/{id}` -> single market (adds qYes/qNo, k, marketKind, resolvedOutcome, resolvedAt)
  - `GET /market/{id}/odds` -> `{id,status,yesProbability,noProbability,yesMultiplier,noMultiplier}`
  - `GET /market/{id}/trades` -> recent trades INCLUDING counterparty `userAddress` (public wallet addresses); `GET /market/activity/recent` similar. Not saved to fixtures (third-party addresses).
  - `GET /market/live/base-symbols?market_type=`, endpoints seen in bundle but not exercised: `/market/{id}/odds/history`, `/market/{id}/bets`, `/market/{id}/activity`, `/market/{id}/next`, `/market/past`, `/market/past/by-token-type`, `/market/futures/{id}/odds-history`, `/market/fixture/{id}/trades`.
- Known `market_type` values: `MANUAL_CREATION` (209 live), `FOOTBALL_MATCH_1X2` (342 live), `ONE_MINS_CANDLE` (5), `FIVE_MINS_CANDLE` (5), `FIFTEEN_MINS_CANDLE` (5), `FEAR_OR_GREED` (1), `ONE_HOUR_CANDLE`/`DAILY_CANDLE`/`LIQUIDATION_HEATMAP` (0 live today). [H API counts 2026-10-19]
- Auth/limits: public reads need no key; authenticated routes (`/user/profile`, `/user/portfolio/summary`, `/market/positions/bets/live`, ...) use a Bearer token from the web login. Rate limits NOT FOUND (no documentation; no headers checked beyond single requests). Unofficial endpoints can change without notice and ToS may prohibit scraping (see section 8).
- WebSocket: backend WS at same `/backend` base (used for live odds) [M, from bundle]; message schema not captured.

## 5. Trade path
- None usable for an agent. Trading is an authenticated call to Fuyo's backend against an internal custodial balance (no on-chain order, no signed order object, no tx to a market contract). Login = Google, email 6-digit code, or wallet (SIWE-style: "sign a message to connect", "sign another message to enable trading"). [H https://docs.fuyo.markets/getting-started/how-to-sign-up.md] POST endpoints for bets not captured/exercised (read-only mandate); documented trade API: NOT FOUND.
- Max stake on fast markets is $10 per trade (docs) [H https://docs.fuyo.markets/trading/how-do-trading-credits-work.md]; not sized for arbitrage.
- PayBox reachability: **partial/no**. A PayBox EVM wallet could only fund the account by plain token transfer (USDT/USDC on BNB, Arbitrum, Polygon, Ethereum, Base; or Solana wallet) to a per-order deposit address obtained from an authenticated UI/API call with a 5-minute expiry; placing trades needs a Fuyo session (Google/email/wallet-signature login) and an undocumented API. No transaction-proposal or signed-order trade route exists. Withdrawals are BEP-20 USDT to a user address (Fuyo-side processing, "withdrawable" status flag exists in the profile endpoint).

## 6. Fees
[H https://docs.fuyo.markets/markets/market-types-and-fees.md , https://docs.fuyo.markets/faq/pricing-and-fees.md]
- Trading fee 2% of volume + market-making spread 3% of volume, both charged on entry and again on early sell (about 5% each way; "10% per round trip"); 10% fee on profit only (never on stake) when profitable. Hold-to-expiry pays the 2% + 3% once (baked into the odds line) plus 10% of profit. Losers pay no extra fee at settlement. Voided market = full refund (gas not refunded).
- Effect for arbitrage: ~5% entry cost plus 10% profit skim means a cross-venue edge must exceed roughly 5-8% to net positive, before withdrawal fees.

## 7. Resolution and dispute risk
- Centralised, rule-based, automatic at expiry; data sources per market Rules: Binance live feed, Bybit websocket, Chainlink Data Streams, "other third-party providers"; manual/long-dated markets use a "committee finalization" fallback and a provisional-result + 48h dispute window (seen in market description text). "no user-proposed resolution bonding process; Fuyo Markets resolves centrally". [H docs resolve/disputed pages; API descriptions]
- Dispute policy: on any data-quality dispute Fuyo may declare the market Refunded/Invalid and refund all traders. [H] High operator-discretion risk; resolution rules are bespoke per market (e.g. HYPE market text says Binance "BTC/USDT pair" while naming HYPEUSDT - sloppy wording seen in a live market [H fixture]), so rule mismatch vs other venues is likely.
- No on-chain oracle verification of outcomes found.

## 8. Geo / ToS / automation
- ToS (28 Feb 2026): "Restricted Jurisdictions" exist but are not enumerated in the ToS text read; geolocation checks and VPN circumvention may lead to account limits. [H https://docs.fuyo.markets/terms-of-service.md]. The app bundle calls `ipapi.co/json` (geo check) [M].
- Automation: ToS section 9 forbids exploiting/manipulating markets and "bots or scripts to abuse promotions or rewards"; FAQ: "Automated activity intended to exploit, manipulate, or farm promotions may be restricted. Normal usage is welcome." Fee design explicitly intended to be "expensive for ... bots that flip in and out". [H https://docs.fuyo.markets/faq/safety-and-fair-play.md , pricing-and-fees]. No sanctioned API terms. Arbitrage trading against a treasury-seeded LMSR is likely to be treated as abuse -> account restriction risk.
- robots.txt on fuyo.markets contains Cloudflare content-signal text (no read-API policy). Backend has no stated terms.

## 9. Liquidity
- Treasury-seeded, capped: LMSR `b` = 10-20 and `poolSize` 100 USDT per market; docs: "Phase 1 - protocol treasury seeds all markets with capped risk parameter; external LPs and market makers are future phases". [H docs + API]
- Volume (API field `lastRoundVolume`, USDT, snapshot 2026-10-19; semantics of "round" unclear [M]): MANUAL_CREATION 209 live markets sum ~12.0k, largest single market ~348 (a $ZK year-end price market), typical 130-155 on Asian equities/commodities; FOOTBALL_MATCH_1X2 342 markets sum ~120; candle markets ~0-1.5 each. Example HYPE>$80 market: yesPool 42.5, noPool 44.9, 48 trades, ~$41 volume. [H fixtures]
- No TVL/OI/volume figure published by Fuyo or aggregators found (WebSearch budget was exhausted in this session, so no third-party coverage was checked: NOT FOUND).
- Order-of-magnitude: a few $k of stake total and ~$10 max per fast trade. Not tradeable at arbitrage size.

## 10. Event overlap with other venues (arbitrage relevance)
- Crypto price thresholds by date (BTC>$80k Dec 31 2026, ETH>$2,500, HYPE>$80, COIN/MSTR year-end close) overlap Polymarket/Kalshi/Limitless-style markets, but resolution rules differ and size is minuscule. [H API]
- Football 1X2 (Serie A, Premier League/EFL, La Liga fixtures, e.g. Tottenham v Coventry, Getafe v Rayo) overlaps sportsbooks/Polymarket sports; Fuyo prices are CPMM, ~0 volume, so likely derived from an odds feed (M) and are poor as a tradable leg.
- Asia equities/indices/commodities at year-end (TSMC, Samsung, Nikkei, IDX stocks, WTI, silver), "Fed rate hike in 2026?" (1 economics market) - mostly unique to this venue, little cross-venue overlap.
- Fast 1/5/15-min crypto up/down (BTC, ETH, SOL, BNB, XRP) overlap Polymarket 5/15-min crypto products in concept; Fuyo's are $10-capped parimutuel/LMSR with Binance price-to-beat rules.

## 11. Liquidity sharing
- Independent: treasury-seeded, own pools; no sign of routing to or mirroring another venue's order book. Chainlink Data Streams/Binance are price oracles only. [M] Football odds might be mirrored from an external odds feed (not confirmed).

## 12. Adapter recommendation
- adapter_priority: **skip**. Reasons: no official/public API (reverse-engineered backend on a legacy domain), no programmatic trade path, custodial off-chain balance, ~5% round fees plus 10% profit fee, $10 fast-market cap, aggregate liquidity in the low thousands of USDT, automation-hostile ToS language, discretionary refund/centralised resolution.
- If ever wanted as a P2 "signal-only" source: poll `/market/details?market_type=MANUAL_CREATION&status=LIVE` and `/market/{id}/odds` unauthenticated; but the prices are LMSR/seeded and carry little information, so low signal value.

## Sources
- https://fuyo.markets/ [H]
- https://docs.fuyo.markets/llms.txt and pages: welcome-to-fuyo-markets, official-links, markets/market-types-and-fees, markets/how-are-markets-resolved, markets/how-are-markets-disputed, markets/how-are-markets-created, markets/what-is-fuyos-lmsr (+ /decentralization), faq/chains-deposits-and-withdrawals, faq/pricing-and-fees, faq/settlement-oracle-and-disputes, faq/safety-and-fair-play, faq/parimutuel-market-maker, faq/upcoming-roadmap, trading/can-i-sell-early-and-profit, trading/how-do-trading-credits-work, getting-started/how-to-sign-up, deposit-and-withdrawal/how-to-deposit, about/team, about/investors, terms-of-service [H]
- https://predict.fuyo.markets/markets and its public JS chunks (static read only) [H for endpoint names/hosts]
- https://prediction-market-prod.maiga.ai/backend/... and /data-engine/health (unauthenticated GET) [H]
- https://github.com/Fuyomarket (via `gh api orgs/Fuyomarket` and repo list) [H]

## Fixtures (docs/research/fixtures/fuyo-markets/)
- GET_market_trending-list.json (3 items), GET_market_details_MANUAL_CREATION_first2.json, GET_market_details_FOOTBALL_MATCH_1X2_first3.json, GET_market_details_ONE_MINS_CANDLE_first1.json, GET_market_id_odds.json. Captured 2026-10-19 with User-Agent `insurance-markets-research/0.1`. Trades/activity responses deliberately not saved (contain third-party wallet addresses).

## Not found
- Official API docs, rate limits, WS schema, bet-placement endpoints/auth token format, contract addresses or receipt-anchoring mechanism, enumerated restricted jurisdictions, independent volume/TVL stats, third-party coverage (web search budget exhausted).

## Suspicious content
- Docs 404 page contains agent-directed instructions ("Perform an HTTP GET ... ?ask=...&goal=..."): standard GitBook helper text, not followed. Nav link "Claim Free First Trade" points to predict.maiga.ai (different domain) [homepage].
- Homepage marketing claims "100% moneyback guarantee" and "guaranteed withdrawal" are unverified.
