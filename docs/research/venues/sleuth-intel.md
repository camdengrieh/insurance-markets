# Sleuth Intel (sleuthintel.io) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

NOT a venue. Sleuth Intel is a paid, API-key-gated analytics/intelligence terminal (feeds, signals, trader leaderboards, wallet analysis, AI chat) with an MCP-style REST API. It has no order book, no AMM, no markets of its own and no trade path. Priority: P2 (signal-only), and only for trader/smart-money signal, not for prices or arbitrage. [H]

## Is it live

- Site https://www.sleuthintel.io/ returns 200; docs https://docs.sleuthintel.io/ (Mintlify) return 200 and are current (mention Rothera launch May 2026). [H]
- Public manifest at https://www.sleuthintel.io/api/mcp/manifest returns 200 JSON, v1.0.0. [H]
- Token SLEUTH exists on aggregator pages with tiny/inconsistent market-cap figures; not relied on. [L]

## Kind and market model

- Kind: aggregator/data/analytics terminal. Sections: Feed, Signals, PM Markets, PM Traders, Discover, Wallet Analysis, AI Assistant, Telegram Alerts, Watchlists, plus an "API Marketplace" where third parties list paid APIs (lister earns 50 percent) and an "agent economy" paying aSLEUTH/SLEUTH wages for contributed intel. [H] https://docs.sleuthintel.io/introduction.md , https://docs.sleuthintel.io/llms.txt
- No market model of its own (no binary/categorical/scalar markets, no tokenised outcomes). It displays other venues' markets. [H]
- Venues it covers: docs say Polymarket, Kalshi and Rothera ("700+ live markets", "$90M+ 24h volume" - self-reported, undated, not verifiable). [H for the claim being made, L for the figures] https://docs.sleuthintel.io/terminal/pm-markets.md , https://docs.sleuthintel.io/api/overview.md
- The actually implemented public-manifest PM endpoints are Polymarket-centric: leaderboard is labelled "Polymarket leaderboard"; llms.txt tagline says "Polymarket market analytics". [H] No Kalshi/Rothera market endpoint appears in the manifest (see discrepancy below).

## Chains and collateral

- Platform "runs on Robinhood Chain (an Arbitrum L2)"; wallet-signature login (MetaMask, Phantom, Base, Rabby, Rainbow, WalletConnect). Subscription paid from wallet, or hold SLEUTH. [H] https://docs.sleuthintel.io/quickstart.md , https://docs.sleuthintel.io/authentication.md
- Tiers: Free; Tier 2 $50/mo or 2,000 SLEUTH; Tier 3 $100/mo or 3,000 SLEUTH; Tier 4 $150/mo or 4,000 SLEUTH. Higher tiers unlock deeper signals, full wallet analysis, PM Traders, alerts, more API endpoints. [H] quickstart.md
- Wallet analysis claims 250+ chains (EVM and Solana). [H as claim]
- Not a trading collateral venue: no collateral at all.

## Read API

- exists: official-authenticated (API key; tier-scoped). [H]
- Docs: https://docs.sleuthintel.io/api/overview.md , /api/endpoints.md , /api/authentication.md , /mcp/overview.md
- Two inconsistent surfaces:
  1. Documented: base `https://api.sleuthintel.io/v1`. Endpoints: GET /feed, /signals, /pm-markets (params platform all|rothera|polymarket|kalshi, status, limit; fields id, question, yes_price, no_price, volume_24h, platform), /pm-traders (sort pnl|win_rate|clv), /discover, /wallet, /pm-wallet, POST /chat, /alerts, /watchlists. [H] BUT host `api.sleuthintel.io` does NOT resolve in DNS (curl exit 6, 2026-10-19). [H] So the documented `/v1/pm-markets` is unusable as written.
  2. Actually served: `https://www.sleuthintel.io/api/mcp/...` (per llms.txt and manifest), read-only GET, JSON. Auth: `Authorization: Bearer <key>`, `X-API-Key`, or `?api_key=`. [H] Unauthenticated calls return 401 `{"error":"Unauthorized. Provide Authorization: Bearer YOUR_API_KEY, X-API-Key header, or ?api_key=YOUR_API_KEY query param."}` [H]
- Manifest endpoints (the public manifest is the only unauthenticated content): /feed/alpha-news, /feed/future-activity, /feed/ai-news, /signals, /pm-traders/smart-wallets, /pm-traders/leaderboard, /pm-traders/trader/{activity,positions,closed-positions,value}, /fx/stables, /fx/stables/{symbol}, /fx/corridors, /wallet-analysis/{address}/{dashboard,stat,holdings,activity,daily}. Also /api/rh-rwa-stocks (Robinhood Stock Token feed with "trade links") listed in llms.txt. [H]
- There is NO market list, orderbook, price-history or resolution endpoint in the served manifest. Prices/odds appear only in the documented-but-unreachable /v1/pm-markets. [H]
- Rate limits: no numbers published; 429 on exceed, 403 if tier lacks endpoint. [H]
- WebSocket: NOT FOUND (searched: manifest, llms.txt, API overview). Manifest says SSE (/api/mcp/sse) and JSON-RPC tools/list "are not supported"; it is REST only despite the MCP branding. [H]
- Key acquisition requires wallet-signature login and (for most endpoints) a paid tier; not done (read-only rule, no sign-up).
- 2026 docs pages are current; no staleness concerns.

## Trade path

None. Docs state no order-placement/trade endpoints; all endpoints are data/alerts/watchlists/chat. [H] (The /api/rh-rwa-stocks "trade links" are outbound links to Robinhood stock tokens, unrelated to prediction markets. [M])

PayBox reachability: not applicable for trading (nothing to trade). An EVM wallet could pay a tier subscription or hold SLEUTH on Robinhood Chain (chainId 4663 per other tooling notes; not verified here) but that is not a trade. paybox_reachable = no. Does not advertise x402; no HTTP 402 observed. [H]

## Fees

No trading fees (no trading). Costs are the subscription ($50/100/150 per month or hold SLEUTH). Marketplace: lister gets 50 percent of each call. [H]

## Resolution

None (displays other venues' outcomes; Rothera "daily settlement data" with OHLC/OI claimed). Dispute risk lives with the underlying venues. [H]

## Geo / ToS / automation

- No ToS text found on docs. www.sleuthintel.io/terms, /tos, /pricing return 200 HTML but the site is a client-rendered SPA that returns the same shell for any path, so these do not prove a ToS exists. NOT FOUND (searched: docs.sleuthintel.io llms.txt and API pages, site paths). [M]
- Automation is explicitly welcomed ("agent-first", API keys, MCP, agents as "economic citizens"). Programmatic use is within tier and rate limits. [H]

## Liquidity

N/A (no markets). Self-reported "$90M+ 24h volume across tracked platforms" is aggregate third-party volume, undated. [L]

## Event coverage overlap / shared liquidity

- It is a mirror of Polymarket, Kalshi and Rothera (Robinhood/Susquehanna CFTC exchange launched May-June 2026, formerly MIAXdx; secondary sources; Robinhood newsroom 2026-06-04). Its data is fully derivative: it shares 100 percent of liquidity with those venues and is NOT an independent arbitrage leg. [H/M]
- Useful signal: Polymarket smart-wallet/leaderboard and per-wallet positions (comparable to what Polymarket Data API already offers publicly for free - duplicate of the Polymarket data API, which may make this redundant). [M]

## Lead found (not in the excluded list)

- **Rothera** (Robinhood + Susquehanna CFTC-regulated exchange/clearinghouse, ex-MIAXdx) is a separate venue worth its own spec if not already queued. Robinhood routes only some World Cup and baseball contracts to it; some still go to Kalshi (so possible shared liquidity). Sources: https://robinhood.com/newsroom/the-world-cup-is-now-trading-on-robinhood-and-rothera/ , https://defirate.com/?p=12991 , https://www.ingame.com/robinhoods-exchange-rothera-self-certifies/ [M, search summaries only, not read first-hand]

## Fixtures

Saved under docs/research/fixtures/sleuth-intel/:
- mcp-manifest.json (public manifest, 5.7KB)
- unauth-401.json (unauthenticated error body)
No real data response shapes could be confirmed (all data endpoints need a key). Response fields in "documented" list above are from docs only. [H as docs]

## Suspicious content

None that was an instruction to an agent. Note: docs index text has a Mintlify boilerplate line telling readers to fetch llms.txt (benign, not followed beyond reading). llms.txt contains the vendor's contact email for key requests; deliberately not copied here.

## Sources

- https://www.sleuthintel.io/ (SPA shell) [H]
- https://www.sleuthintel.io/llms.txt [H]
- https://www.sleuthintel.io/api/mcp/manifest [H]
- https://docs.sleuthintel.io/llms.txt , /introduction.md , /quickstart.md , /authentication.md , /api/overview.md , /api/endpoints.md , /api/authentication.md , /mcp/overview.md , /terminal/pm-markets.md [H]
- https://x.com/sleuthintel (search result only; "swarm intelligence for prediction markets and crypto starting with Robinhood chain") [M]
- https://www.coingecko.com/en/categories/prediction-market-tools (discovery evidence, not re-read) [M]
- Rothera links above [M]
