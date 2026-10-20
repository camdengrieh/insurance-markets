# Oddscreener (oddscreener.xyz) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Kind: read-only analytics front-end (a "DexScreener for prediction markets"), NOT a venue. It has no market model, order book, collateral, resolution or fees of its own.
- adapter_priority: **skip** as a venue/arbitrage leg. It re-displays Polymarket data (Kalshi listed but not visibly populated), so it is not independent liquidity, and it exposes no documented API.
- Optional: P2-style "signal only" idea (whale/insider lists), but those features are unverified; better to take the same data from Polymarket's own public APIs.

## Is it live? (H)

- https://www.oddscreener.xyz/ returned HTTP 200 on 2026-10-19 and rendered a "Beta" screener showing October 2026 markets (e.g. "Fed rates after the October 2026 meeting", "ceasefire continues through October 31") - so data is current. [H]
- Header stats on the page: "24H VOL $753.1M", "24H POSITIONS 7.5M", "MARKETS 700" (the fetched summary read 674, and the table said "Showing 1-50 of 53"; the counters are inconsistent and look aggregate/Polymarket-wide rather than the site's own volume). [H]
- Manifund funding page created 2026-01-05 (self-reported, solo developer, MVP live, $0 raised). [H] https://manifund.org/projects/oddscreener---real-time-analytics-for-prediction-markets
- X account @oddscreener joined December 2025 (per search snippet; X page itself returned 402 to WebFetch, not read). [M]
- Not listed in the visible part of https://predictionindex.xyz/ecosystem (page truncated in fetch; could not confirm the discovery evidence). [L]

## What it does (H, homepage)

- Views: Trending (1H/6H/24H), Biggest Movers, New Markets, Top Volume.
- Tools: Watchlist, Alerts, Whale Tracker, News; Insider Tracker marked "Soon" (routes /whales, /insiders appear in nav).
- Platform filter: All / Polymarket / Kalshi. Every market link in the SSR HTML is `/market/polymarket-<gamma id>`; none were `kalshi-*`. The Manifund page (Jan 2026) says Kalshi was "in development, Q1". So Kalshi coverage is NOT confirmed. [H for observation, M for conclusion]
- Table columns: category (Politics, Sports, Crypto, Finance, World, Tech, Culture), implied probability, 1H/6H/24H change, 24h volume, a spread figure with dollar depth, time to resolution.
- Manifund page also lists "integrated trading within the platform" and a "copy-trades" style product; the live homepage shows no order entry, only a "Connect" button. [M]

## Market model, chains, collateral

- Own market model: none. Markets are mirrors of Polymarket binary/categorical markets (Polymarket gamma market ids as keys). Outcome tokens, collateral (USDC on Polygon) and CLOB are Polymarket's. [H that ids are Polymarket's; M for the rest, covered by the parallel Polymarket workflow]
- Bundle constants include the Polygon USDC.e contract address and a Polygon Alchemy RPC URL, confirming Polygon-only on-chain reads. [H] (An embedded third-party RPC key is present in the public JS; deliberately not recorded here.)

## Read API

- exists: **none documented**. No /api, /docs, /terms, /privacy or /robots.txt (all return 404 or the SPA shell). Manifund lists "API access for power users" only as a future milestone. [H]
- Data path observed in the client JS bundle (not documented, do not rely on it):
  - Browser calls Polymarket public endpoints directly: `https://clob.polymarket.com/prices-history`, `wss://ws-subscriptions-clob.polymarket.com/ws/market`, `wss://ws-live-data.polymarket.com`, `wss://sports-api.polymarket.com/ws`. [H]
  - A private backend on AWS API Gateway (ap-south-1, `/prod/api/markets/prices`, `/prod/api/copy-trades/sanity-check`). Undocumented and not a documented API host, so NOT probed. [H for URL string]
  - Shared constants reference another product ("tradefoxai" X/Telegram links, `/docs`, `/start`), suggesting shared code with a Polymarket copy-trading tool. [L]
- Consequence: an adapter should go to Polymarket (gamma/CLOB/WS) and Kalshi directly. Scraping Oddscreener would only add a fragile middleman.
- Fixtures: none saved (no public API; the only "response" is an HTML app shell, not useful).

## Trade path

- None (no order placement API). The homepage has no order entry; any "integrated trading" would route through Polymarket's own CLOB with the user's own Polygon wallet. A PayBox EVM wallet could only trade via Polymarket directly (signed orders + approvals), never via Oddscreener. paybox_reachable = no (via this site). [M]

## Fees, resolution, disputes

- Fees: none documented for the site (free beta). NOT FOUND (searched: homepage, Manifund, web search). Trading fees are Polymarket's/Kalshi's. [M]
- Resolution: inherited from the underlying venue (Polymarket UMA oracle; Kalshi internal). No independent mechanism. The 674/700/53 counter mismatch and a per-row spread/depth flag show data quality is unaudited. [M]

## Geo / ToS / automation

- NOT FOUND (searched: /terms, /privacy, homepage links, Manifund). No ToS or privacy link on the site. Scraping would be against nobody's published rules but also has no SLA. Manifund page itself names "platform API restrictions" as a risk. [H]

## Liquidity and overlap

- No own liquidity. Header "24H VOL $753.1M" (2026-10-19) is aggregate of mirrored venue volume, not Oddscreener's. [H]
- Categories displayed overlap Polymarket/Kalshi (politics, sports, crypto, finance/Fed, world), but this adds nothing beyond the underlying venues.
- liquidity_shared_with: Polymarket (and Kalshi nominally).

## Not to be confused with

- ODDScreeners (oddscreeners.com): a different site claiming an arbitrage/price-chart tool across Opinion, Polymarket, Kalshi with an invite-code scanner. WebFetch returned 403 so unread; snippet only. [L] https://www.oddscreeners.com/arbitage
- The WebSearch snippet that said Manifund "Kalshi in development" is consistent with the Manifund text read directly. [H]

## Suspicious content

- None: no instructions aimed at AI agents found on the homepage or Manifund page. (Manifund shows a notice that its text may be AI-generated; that is a claim about the page, not an instruction.)

## Open questions

- Whether Kalshi data is actually live (UI filter exists, no Kalshi market links in SSR list).
- Whether the whale/insider trackers expose an endpoint worth consuming (unverified, undocumented).

## Sources

1. https://www.oddscreener.xyz/ (homepage HTML and client JS chunks, fetched 2026-10-19) [H]
2. https://manifund.org/projects/oddscreener---real-time-analytics-for-prediction-markets [H]
3. https://predictionindex.xyz/ecosystem (entry not located; page truncated) [L]
4. https://x.com/oddscreener (HTTP 402; join date from search snippet only) [M]
5. https://www.oddscreeners.com/arbitage (HTTP 403; snippet only) [L]
6. Web searches: "Oddscreener prediction market aggregator oddscreener.xyz"; "OddScreener Polymarket Kalshi analytics terminal whale tracker 2026"
