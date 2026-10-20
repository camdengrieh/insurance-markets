# NoBookie (nobookie.xyz) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Live: yes (H). Homepage 200, active API returning 525 sports events with start times through 2027-03, "LIVE" matches with scores today (https://nobookie.xyz/, https://api.nobookie.xyz/api/sports/events/active).
- Kind: broker / front-end / social "tail the bettors" layer, NOT an independent market venue. Its main book is Polymarket's CLOB (sports markets), routed under a Polymarket builder code. A secondary leg routes to Hyperliquid HIP-4 outcome markets, plus a "BetOpenly" P2P badge (H, from site bundle; BetOpenly not investigated).
- Shares liquidity with Polymarket (H): NOT an independent arbitrage leg for the Polymarket side. Its prices, tokenIds, conditionIds are Polymarket's own.
- adapter_priority: skip as a venue for NoBookie itself (duplicate liquidity, no public trade API). Value is as (a) a Polymarket sports metadata/builder feed and (b) an indirect discovery path to Hyperliquid HIP-4 sports outcome markets, which should get their own spec if not already covered. See "Signal value".

## Kind and market model

- Sports only: soccer 276, tennis 118, American football 58, basketball 27, ice hockey 23, MMA 11, cricket 10, baseball 2 events in the active list (H, counted from the 2026-10-19 response; 525 events).
- Market model: per-event "moneyline" (binary or 3-way) is the default; bundle shows spreads/totals markets (marketType moneyline/totals, line) in the bet feed (H). Outcomes tokenised as Polymarket CTF ERC-1155 token ids (`tokenId`, `noTokenId`, `conditionId`), order book (Polymarket CLOB) (H).
- Hyperliquid leg: `hlMoneyline` market, `tokenId` like "#132280" / "#132281" (Yes/No sides of outcome 13228), `conditionId` "hl:o13228", order book with `bestBid`, `topNotional`, `nearNotional`. 11 of 525 events carry it today, plus ~41 standalone HL events and EPL-champion style outrights (H).
- HIP-4 model per Hyperliquid docs: fully collateralized, Yes/No token per outcome, merged book, a "question" groups outcomes where exactly one settles Yes; Yes pays settleFraction, No pays 1-settleFraction (H, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md; doc undated, says fees zero "for initial testing" - may be stale, L).

## Chains and collateral

- Polymarket leg: Polygon, USDC (bundle references Polygon RPCs, USDC.e 0x2791..., Polymarket relayer-v2 and CLOB hosts; signatureType POLY_1271 deposit wallet/funder) (H bundle, M interpretation).
- Hyperliquid leg: HyperCore/HyperEVM, funded from Arbitrum USDC (config: arbitrumChainId 42161, arbitrumUsdc 0xaf88d065e77c8cC2239327C5EDb3A432268e5831, bridge 0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7, signatureChainId 0xa4b1) (H, https://api.nobookie.xyz/api/hyper/config).
- Login: Privy (auth/privy) or external wallet. Non-custodial per site FAQ (claim, M).

## Read API

- Official/public docs: NOT FOUND (searched: homepage, /docs 200 but is the SPA shell, /llms.txt SPA shell, robots.txt, sitemap.xml, site search, bundle). The API is the site's private backend; unofficial-only (H it works unauthenticated, no stability promise).
- Base: `https://api.nobookie.xyz/api` (H, from index.html `__early` preload).
- Unauthenticated GETs confirmed 200 (H):
  - `/sports/events/active` - 525 events, ~1.25MB. Fields: slug, venue, polymarketId, title, home/away, sportSlug, competitionSlug, startTime, status, score, live, markets.moneyline.selections[{price, outcome, tokenId, noTokenId, marketId, conditionId, feeSchedule{rate, exponent, takerOnly, rebateRate}}], volume, volume24hr, liquidity.
  - `/feed/nobookie`, `/feed/big-money` - recent bets by users incl. external Polymarket wallets: wallet, name, pnl, stake, entryPrice, pick, selection.tokenId/conditionId, eventSlug. Contains third-party wallet addresses (public Polymarket data); fixtures redact them.
  - `/hyper/config`, `/hyper/events`, `/hyper/outcome/events` (41 events), `/hyper/outcome/outrights`, `/hyper/rewards` (outcome-rewards program stats).
  - `/sports/events/stream` - SSE (connects, `: connected`), 200 text/event-stream (H).
- Other endpoints seen in the bundle (M, not called): `/leaderboard`, `/wallet-activity/:id`, `/wallet-pnl/:id`, `/wallet-positions/:id`, `/wallet-card/:id`, `/positions`, `/positions-v2`, `/search/profiles`, `follows*`, `polymarket/markets-information` (POST).
- 401 "Authentication required": `/hyper/move/active` (H). Wrong guesses (`/book`, `/books`, `/sports`, `/leaderboard`) return 404 on this host (H).
- Auth/limits: none for GETs above; response header `ratelimit: limit=1200; policy 1200;w=60` per IP (H). CORS `vary: Origin`.
- Order books/trades: not served by NoBookie (bundle points to `clob.polymarket.com`); use Polymarket's own CLOB/Gamma/data APIs (covered by parallel workflow) and Hyperliquid `api.hyperliquid.xyz` / `wss://api.hyperliquid.xyz/ws` (from config, H).
- Join key to Polymarket: `polymarketId` (Gamma event/market id) and `conditionId`/`tokenId` are identical to Polymarket's. Hyperliquid join: `hlOutcomeId`, `conditionId` "hl:o<ID>"/"hl:q<ID>", tokenId "#<N>".

## Trade path

- Programmatic public order API: none documented (NOT FOUND). Frontend flow (H, bundle): Privy auth -> `polymarket/api-key/bootstrap` -> client builds and signs Polymarket CLOB order locally (createOrder/createMarketOrder with builderConfig {builderCode}, POLY_1271 funder) -> `POST polymarket/orders` to NoBookie backend (with `order-intents`) which forwards to Polymarket. Hyperliquid: `POST hyper/exchange` with locally signed actions incl. `approveBuilderFee`.
- Not usable by an agent via PayBox as a NoBookie API (requires Privy session). But the underlying venues are directly tradable: Polymarket by an EVM (Polygon) key signing EIP-712 orders / proposal-style approvals (covered elsewhere), and Hyperliquid by an EVM-key-signed EIP-712 action (Arbitrum chain id for user-signed actions) - M, not verified against HL docs this session. Paybox reachability: partial, only via the underlying venues, not NoBookie.

## Fees

- Polymarket sports feeSchedule per selection (H): rate 0.03 or 0.05, exponent 1, takerOnly true, rebateRate 0.15. Interpret as taker fee formula from Polymarket (fee = rate * f(price)); exact formula is in Polymarket docs (covered elsewhere); M on interpretation.
- NoBookie builder fee on Polymarket: NOT FOUND in the site. Hyperliquid `builderFeeTenthsBp` 0, `maxBuilderFeeRate` 0.1%, `moveFeeUsd` 0 (H). Polymarket builder-code fee: unknown. Site rules text says HL "fees are charged only when a position is closed or settled" (H).

## Resolution and dispute risk

- Polymarket leg: UMA/Polymarket sports resolution (inherits Polymarket; documented elsewhere).
- HL leg: per-market `rules` text, "Resolved against <official source>" (e.g. UEFA, NFL), `resolutionDeadline` ~1 day after start. Settlement by HL deployer "out" (outcome.xyz), a third-party deployer, not Hyperliquid itself (H deployer field "out"; operator identity M). Dispute process: NOT FOUND. Higher oracle/deployer risk than Polymarket.
- Matching quirk: `cancelled`, `cancelledReason` fields exist on events; 3-way soccer results exclude extra time per HL rules while other venues may differ - rules diffing required before cross-venue arb.

## Geo / ToS / automation

- Frontend calls `https://polymarket.com/api/geoblock` and hard-blocks countries; bundle sets a blocked-country set including SG, PL, TH, TW and a US set (H, M on exact semantics). Signup text requires 18+, not in a restricted/sanctioned jurisdiction (H, bundle). "Not available in <region>" gating.
- Site claims "no limits, no bans" (marketing; H it is the site's claim). Terms page is client-rendered; operator identity, automation/bot/scraping rules: NOT FOUND (searched: /terms via WebFetch, bundle strings). No documented permission for third-party use of the private API; treat as unofficial and be gentle (rate limit 1200/min).
- Operator: not stated. Twitter/X: @nobookie_xyz (H from page metadata).

## Liquidity

- Own volume via Polymarket builder leaderboard (H, https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=150, 2026-10-19): builder "nobookie.xyz" rank 170, all-time volume $717,247, 13 active users, verified. Very small.
- The `volume`/`liquidity` fields in /sports/events/active (sum volume $5.58M, 24h $1.39M across 525 events) are Polymarket's market totals, not NoBookie's flow; the summed `liquidity` ($55.9M) is not meaningful (M).
- HL leg: per-market liquidity $2k-$14k typical (e.g. NFL WAS@SF `liquidity` 14,129; soccer q480 2,480) (H, 2026-10-19). Outcome Rewards program: $1M programme, $394.5K awarded, 3,661 wallets (H, /hyper/rewards) - liquidity may be incentive-driven.

## Event coverage and arbitrage relevance

- Sports (soccer top European leagues, UEL, NFL, tennis ATP, NBA, NHL, MMA, cricket). Overlap with Polymarket (identical), Kalshi/others sports, offshore books. No politics/crypto/macro.
- Arbitrage: Polymarket-vs-NoBookie is meaningless (same book). The genuine independent pair is Polymarket vs Hyperliquid HIP-4 for the same fixture; NoBookie already maps them (`hyper/config.sync`: 48 fixtures, 44 mapped, 13 matched, 30 unmatched, 2026-10-19), which is a free fixture-matching hint. HL depth is thin (thousands of dollars), so edges are small.

## Signal value

- `/feed/big-money` and `/leaderboard` expose sharp-wallet flows with wallet, pnl, stake, entry price, tokenId: a ready-made "smart-money tail" signal for Polymarket sports markets, derivable also from Polymarket data API directly. P2 signal-only at best.

## Open questions

- Does Polymarket builder code apply a NoBookie fee on top of Polymarket's taker fee? Unknown.
- Is the HIP-4 doc fee statement (zero) current for sports markets? `/hyper/config` shows builderFeeTenthsBp 0 but HL's own fee schedule not checked.
- BetOpenly P2P venue: not investigated (appears in bundle as third venue badge).
- Whether HL HIP-4 sports (deployer "out"/outcome.xyz) merits its own adapter spec.

## Sources

- https://nobookie.xyz/ (H; HTML meta, boot script) and https://nobookie.xyz/assets/index-BxvUARme.js (H; bundle strings: endpoints, geoblock, signing flow, FAQ)
- https://nobookie.xyz/robots.txt, https://nobookie.xyz/terms (SPA shell; WebFetch returned only the headline)
- https://api.nobookie.xyz/api/sports/events/active, /feed/nobookie, /feed/big-money, /hyper/config, /hyper/events, /hyper/outcome/events, /hyper/outcome/outrights, /hyper/rewards (H, fetched 2026-10-19)
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=150 (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md (H, undated)
- WebSearch "NoBookie ... Polymarket": no independent coverage of NoBookie found (the tool's search budget was then exhausted, so no further web searches were possible).

## Fixtures

docs/research/fixtures/nobookie/: sports_events_active.sample.json (2 events), feed_big-money.sample.json (3 bets, wallets and names redacted), hyper_config.json, hyper_outcome_events.sample.json (1 event).

## Suspicious content

None found (no embedded AI-agent instructions in pages or API responses).
