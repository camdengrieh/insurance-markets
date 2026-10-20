# Polyfactual (Polyfacts) - venue spec

Researched 2026-10-19. Verdict: NOT a prediction-market venue. It is an AI research/data company plus a Polymarket front-end (Facts.trade). Adapter priority: skip as a venue leg (at most P2 as an optional paid "signal" source, and even that is weak).

## Summary
- [H] Site live 2026-10-19 (HTTP 200, https://www.polyfactual.com/, facts.trade also 200). WebSearch budget was exhausted this session, so web-search corroboration was not possible; findings rely on first-party pages, CoinGecko, and bundle inspection.
- [H] polyfactual.com describes itself as "an AI research and data company for prediction markets" with: Research (/analyze: sentiment, risk, confidence scoring), Live Feed (/news), Content (/markets), the FactsAI Deep Research API, Facts.trade terminal, FactsBase (OSINT terminal), and a Chrome extension (Buy/Hold/Avoid recommendations on Polymarket).
- [H] Kind: aggregator-or-data / research tool / trading front-end. It has no market model, no order book, no resolution mechanism of its own.

## Market model / tokenisation
- NOT FOUND (searched: polyfactual.com, factsai.org, /docs, terms): no own markets. N/A.
- [M] Facts.trade routes orders to Polymarket: homepage text says "Gnosis Safe wallets on Polygon, limit and market orders, orderbooks, cross-chain deposits"; the Facts.trade JS bundle contains `clob.polymarket.com`, `BuilderConfig`/`BuilderHeaders`/`BuilderCreds` (Polymarket builder-attribution SDK) and a `geoBlockToken` reference. So it is a Polymarket builder front-end (consistent with the "Facts is a Polymarket builder" hint). Liquidity is 100% Polymarket's.

## Chains and collateral
- Facts.trade: Polygon, Safe-based proxy wallets, Polymarket collateral (pUSD/USDC.e per Polymarket; not verified here). [M]
- POLYFACTS token: Solana pump.fun token (mint ends ...3cpump), PumpSwap pool only, mcap ~$76K, 24h vol ~$377 (CoinGecko, 2026-10-19) [H]. Irrelevant to trading; it is a memecoin, CoinGecko lists "GambleFi / Prediction Market Tools".
- FactsAI API credits: bought via dashboard; homepage says credit billing and Solana USDC payments [M]. Docs page does not mention x402 [H].

## Read API
- Exists: official-authenticated, but only an AI Q&A endpoint, NOT market data.
- Docs: https://factsai.org/docs [H]
- Base URL: https://deep-research-api.degodmode3-33.workers.dev [H] (a Cloudflare workers.dev host under what looks like an individual's account; weak production signal).
- Endpoint: `POST /answer` body `{query (<=1000 chars), text?: bool}`; response `{success, data:{answer, citations[{id,url,title,author,publishedDate,text,image,favicon}], costDollars:{total}}, timestamp}` [H, from docs].
- Auth: `Authorization: Bearer {title}_{key}` from dashboard after buying credits [H].
- Limits: 100 req/min per key; 1 credit = $0.012/request; packs $12/1000, $60/5000, $120/10000 [H]. 402 = insufficient credits [H].
- Market-data endpoints (markets, prices, books, trades, resolution): NOT FOUND in docs (searched factsai.org/docs, polyfactual.com). The homepage mentions a "Facts Pro Developer API" with structured market data; no docs located [M/L].
- Websocket: NOT FOUND.
- Unauthenticated probes: `GET /` and `GET /answer` on the API host return HTTP 500 `{"success":false,"error":"Service configuration error",...}` (2026-10-19). Saved as fixture. No useful response shape beyond the error envelope (matches the documented `success/error/timestamp` shape). No POSTs made.
- Fixture: docs/research/fixtures/polyfactual/factsai_root_get_500.json

## Trade path
- None as a venue. Facts.trade = browser terminal with email Magic Link login and an embedded Safe wallet on Polygon; no public trading API found. [M]
- Any programmatic trading should go directly to Polymarket CLOB (covered by another workflow), not through Facts.trade. PayBox reachability: no (nothing to integrate; for the underlying Polymarket legs see that spec).

## Fees
- FactsAI API: $0.012/request [H].
- Facts.trade fees / Polymarket builder fee: NOT FOUND (searched homepage, bundle strings; no schedule on terms page).

## Resolution / dispute
- N/A, inherited from Polymarket (UMA optimistic oracle per Polymarket docs, not re-verified here).

## Geo / ToS / automation
- Terms (https://polyfactual.com/terms) [H]: "Automated access to the site and data mining are prohibited"; Massachusetts law, AAA arbitration, class waiver; no explicit geo list; not investment advice. Scraping polyfactual.com or Facts.trade is thus ToS-barred; the paid API is the sanctioned route.
- Facts.trade bundle contains a geoblock token mechanism (Polymarket geoblock) [M].

## Liquidity
- None of its own. Token vol ~$377/24h (CoinGecko 2026-10-19) [H]. Homepage claims 700K+ API requests served, 12+ partners (self-reported, unverified) [L].

## Event overlap / shared liquidity
- Shares 100% liquidity with Polymarket => NOT an independent arbitrage leg [M].
- Signal value: Chrome extension and /analyze give AI Buy/Hold/Avoid on Polymarket markets; the FactsAI API is generic web-cited Q&A and could be a cheap LLM-research signal, but no structured edge output is documented.

## Suspicious content
- None found; no agent-directed instructions on polyfactual.com, factsai.org, or docs.

## Priority
- skip as venue; optionally P2 signal-only (FactsAI /answer, ~$0.012/call), not needed for v1.

## Open questions
- Facts Pro Developer API docs/URL (market data/research endpoints) not located.
- Facts.trade builder fee rate and Polymarket builder code.
- Whether Facts.trade is still the Polymarket builder under the current Polymarket exchange version (V2/pUSD).

## Sources
- https://polyfactual.com/ (H) - product descriptions, partner list, links
- https://polyfactual.com/terms (H)
- https://factsai.org/ and https://factsai.org/docs (H)
- https://www.coingecko.com/en/coins/polyfactual (H) - token data 2026-10-19
- https://www.facts.trade/ HTML + JS bundle strings (M) - Polymarket CLOB/builder usage
- https://deep-research-api.degodmode3-33.workers.dev/ unauthenticated GET (H) - 500 error envelope
