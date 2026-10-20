# Sawa Predictions (sawapredictions.com) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.
Verdict: **skip** (adapter_priority). Live, but the native markets are a virtual-coin social game, and the "real money" layer appears to relay Polymarket/Kalshi, so it is not an independent arbitrage leg.

## Summary
- Live: yes. Site up 2026-10-19, sitemap lastmod 2026-10-19, ~687 UUID prediction pages plus ~160 MLB/UFC pages. [H] https://www.sawapredictions.com/sitemap.xml
- Self-description: "Social prediction markets for you and your friends." [H] https://www.sawapredictions.com/ . GitHub org "Prediction market for your group chat", created 2026-06-19, 0 public repos. [H] gh api orgs/Sawa-Predictions
- JSON-LD says "Free social prediction market platform ... win Sawa coins" and "foundingDate 2024". [H] homepage HTML
- Contradiction: /rules says "Sawa uses virtual Sawa coins only. There is no real money involved". [H] https://www.sawapredictions.com/rules . But /how-money-works describes real-money markets: custodial-free wallet, USDC on Base, deposits by card or USDC transfer, withdrawals to any address. [H] https://www.sawapredictions.com/how-money-works . Homepage Discover shows a "Real money" label and USDC-tagged markets (e.g. an Anthropic IPO market). [H via WebFetch summary] /rules is likely stale relative to the real-money rollout [M].

## Kind and market model
- Two tiers [H]:
  1. Native social markets in virtual Sawa coins. Parimutuel: "you receive a share of the total pool proportional to your stake"; payouts shown while open are estimates; 2.5% fee deducted from winnings; early-trader bonus. Binary or multi-option, user-created, creator resolves. (rules page; prediction page fd0ab363 shows Yes/No pool shares and "Winners split the pool in proportion to their predictions".)
  2. Real-money USDC markets (Base). Per how-money-works: each winning share pays $1, price is locked at confirm and trade fails if price moved ("To win $X"). Underlying mechanism (AMM/book/parimutuel) NOT FOUND (searched: how-money-works, rules, faqs, terms; faqs/terms/pricing pages are client-rendered and returned only nav shell).
- Outcome tokenisation: NOT FOUND. No contract addresses, no GitHub code (org has 0 public repos).

## Chains and collateral
- Real-money: USDC on Base only ("Transfers must be sent on the Base network"). [H] how-money-works. Embedded wallet created "in one tap, no seed phrases"; "Sawa never holds your money". Wallet provider NOT FOUND.
- Virtual: Sawa coins (100 on signup), off-chain. [H] rules.

## Read API
- Official public docs: NOT FOUND (searched: homepage, sitemap, /help, /faqs shell, robots.txt, GitHub org). No developer docs, no OpenAPI.
- One undocumented but robots-allowed endpoint: `GET https://www.sawapredictions.com/api/markets/search?q=<term>` (unauthenticated, 200 JSON; 400 `{"error":"Missing required query param 'q'"}` without q). robots.txt: `Allow: /api/markets/search`, `Disallow: /api/`. [H]
  - Response: `{query, source:"direct", results[], comparisons[], cached, errored, timings}`. Each result: `venue, sourceLabel, realMoney, title, url, imageUrl, volume24h, top{label,price}, relevance, closesAt, closesAtISO, closesAtLabel`. `comparisons[]` groups the same question across venues with `venues[{venue,price,url,volume24h}]`. [H] fixtures below.
  - Every result observed (queries bitcoin, anthropic, election; 8 results each) had `venue` = polymarket or kalshi, `realMoney:true`, and `url` pointing at polymarket.com / kalshi.com. Zero Sawa-native results. So this is a relay/aggregator search over third-party venues, not Sawa's own book. [H]
- Native market data: only public HTML pages `/predictions/<uuid>` (Allow in robots) listing pool shares, volume (coins), status, resolution text. No JSON API found for these (`/api/` disallowed; not probed further). Rate limits, websocket: NOT FOUND.
- Sitemap enumerates market pages: https://www.sawapredictions.com/sitemap.xml [H].

## Trade path
- None programmatic. Account signup + embedded wallet via the web/app UI; no API keys, no order signing scheme documented, "Text our agent" link in footer (SMS/iMessage-style agent; not investigated) [H footer text]. Not reachable by a PayBox transaction proposal: no contract address or EIP-712 order scheme published. PayBox reachable: no. Funding would be a USDC transfer on Base to a Sawa-created embedded wallet, which is manual and out of scope; no way to place trades from PayBox.

## Fees
- Virtual markets: 2.5% of winnings; creator stakes 10% safety deposit, returned on honest resolution. [H] rules + prediction page.
- Real money: "one small trading fee, included in the total you pay"; amount per market shown on ticket info icon; Sawa pays network fees; withdrawals free. Formula NOT FOUND. [H] how-money-works.

## Resolution and dispute risk
- Creator resolves; 24h challenge window; participants can dispute and vote; successful dispute refunds all; unresolvable markets voided. [H] rules, how-money-works, prediction page.
- High dispute/semantic risk for arbitrage: resolution is creator-judgment, no named oracle ("No external data source is named" on the sample market). Native markets are not comparable with UMA/exchange-settled markets.

## Geo / ToS / automation
- Terms, FAQs, pricing pages are client-rendered; text not retrievable via fetch. NOT FOUND (searched: /terms, /faqs, /privacy HTML). Geo restrictions and bot/scraping rules unknown. robots.txt disallows /api/ except market search. [H]
- Rules page: "Manipulating outcomes ... or exploiting the platform is prohibited" (could cover arbitrage bots) [H].

## Liquidity
- Sample market page: 335 Sawa coins total volume (resolved, 2026-10-19 snapshot). Virtual coins have no cash value per /rules. [H]
- Real-money volume/TVL: NOT FOUND. Search-endpoint `volume24h` figures are the underlying Polymarket/Kalshi volumes, not Sawa's (e.g. Polymarket Anthropic IPO by Nov 30: $58.6k 24h on 2026-10-19). [H]
- Third-party stats (DefiLlama etc.): not searched (web search budget exhausted this session).

## Event categories / overlap
- Native: social/user questions, MLB, UFC, tech/news; coins only, so no arbitrage value. [H sitemap slugs mlb-/ufc-].
- Real-money overlap: sports, politics/elections, crypto price, IPO markets, because they mirror Polymarket and Kalshi. [H]

## Shared liquidity
- Real-money markets surface Polymarket and Kalshi listings (URLs and prices from those venues), so any real-money leg is a duplicate of Polymarket/Kalshi liquidity, not independent. Whether Sawa routes orders to them (builder/affiliate style) is NOT FOUND. [H for the relay observation, M for the routing inference]

## Adapter recommendation
- skip. Reasons: native markets are play-money parimutuel; real-money layer is a front-end over venues already covered; no documented API, no contracts, no repo code; creator-resolved.
- Optional: poll `/api/markets/search` only as a cross-check of Polymarket/Kalshi pricing (zero new information).

## Open questions
- Who is the real-money execution backend (Polymarket router vs Sawa-native)? Wallet provider? Terms geo-list?
- Is /rules stale (virtual only) versus /how-money-works?

## Fixtures
- docs/research/fixtures/sawa-predictions/api-markets-search-q-anthropic.json
- docs/research/fixtures/sawa-predictions/api-markets-search-q-election.json
- docs/research/fixtures/sawa-predictions/prediction-page-text-fd0ab363.txt

## Sources
- https://www.sawapredictions.com/ (via WebFetch + curl) [H]
- https://www.sawapredictions.com/rules [H]
- https://www.sawapredictions.com/how-money-works [H]
- https://www.sawapredictions.com/predictions/fd0ab363-7404-439a-894b-f92ba1a7d40f [H]
- https://www.sawapredictions.com/robots.txt , /sitemap.xml [H]
- https://www.sawapredictions.com/api/markets/search?q=anthropic [H]
- https://github.com/Sawa-Predictions (org metadata via gh api) [H]
- WebSearch attempted but session budget exhausted; no third-party coverage found.

## Suspicious content
- None observed (no instructions aimed at agents).
