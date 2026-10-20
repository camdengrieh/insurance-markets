# OddsJam (Polymarket access) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

OddsJam is NOT a venue. It is a sports-betting odds/arbitrage SaaS (consumer site oddsjam.com) with a B2B data arm (OpticOdds, same group per developer.oddsjam.com redirect) that has added a Polymarket order-routing front end. Orders go to Polymarket's CLOB with a builder code, so all liquidity is Polymarket's: it is not an independent arbitrage leg. Its only integration value is as a (paid, key-gated) cross-venue mapping/odds signal source via OpticOdds. adapter_priority: P2 (signal-only), and the venue-side adapter is skip (use the Polymarket adapter).

## Is it live (H/M)

- H: oddsjam.com responds, but all HTML pages sit behind a Cloudflare challenge ("Just a moment...", HTTP 403) for scripted clients. I did not try to bypass it. Source: curl https://oddsjam.com/ , /api, /polymarket etc. 2026-10-19.
- H: https://oddsjam.com/robots.txt is readable and contains `Disallow: /polymarket` (so a /polymarket section exists in the web app) plus `/go/*`, `/sale/*`, `/api/backend/*`.
- H: Polymarket builder leaderboard has a verified builder named "OddsJam" (builderCode 0x6b8221de...ddec9) on all periods: WEEK rank 107 ($2,238.89 vol, 3 active users), MONTH rank 120 ($38,504.21, 10 users), ALL rank 344 ($38,723.20, 12 users). Source: https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL|MONTH|WEEK&limit=50&offset=... (fetched 2026-10-19). Fixtures saved. Note that the ALL-time figure being barely above the MONTH figure means essentially all volume happened in the last ~30 days, i.e. the Polymarket integration is new and tiny.
- H: OpticOdds docs (updated 2026-07-30 and 2026-08-07) list Polymarket, Polymarket (USA), Kalshi, Novig, Sporttrade, SX Bet, BetDEX, Betfair Exchange, DraftKings Predictions as tracked exchanges; sportsbook/league lists "Refreshed October 2026". So the data business is live in 2026.
- NOT FOUND: OddsJam's own marketing copy about Polymarket access, pricing, launch date, supported geographies, fee markup (searched: oddsjam.com pages blocked by Cloudflare; WebFetch 403; WebSearch budget exhausted for the session, so no third-party coverage was read).

## Kind and market model

- Kind: aggregator-or-data (sportsbook odds screener / +EV and arbitrage tool; B2B odds API; Polymarket front end). No own markets, no own settlement. (M, from hint plus OpticOdds docs.)
- Market model: inherited from the underlying venue. Polymarket = binary outcome tokens on a CLOB (ERC-1155 conditional tokens, CLOB token ID per outcome). OpticOdds normalises everything into decimal-odds `Odd` objects with an `order_book` array of [price,size] and `source_ids` {market_id, selection_id}; for Polymarket the source ids are the CLOB token ids; for Kalshi they are ticker + yes/no (H, https://developer.opticodds.com/docs/opticodds-for-prediction-market-makers.md).

## Chains and collateral

Whatever Polymarket uses (Polygon, pUSD/USDC collateral). Not independently verified here; see the Polymarket spec. For the OddsJam front end specifically: NOT FOUND (whether users hold their own Polymarket wallet, an OddsJam-provisioned proxy wallet, or a Polymarket-USA account). The builder program docs say builders may provision accounts for users and use the gasless relayer (H, https://docs.polymarket.com/programs/builders/overview.md).

## Read API

Two distinct things:

1. OddsJam consumer product: no public API found. developer.oddsjam.com 301-redirects to https://developer.opticodds.com/ (H, curl -I). oddsjam.com/api and /odds-api are Cloudflare-blocked (could not read).
2. OpticOdds API v3 (official, authenticated, paid): 
   - Docs: https://developer.opticodds.com/ ; index https://developer.opticodds.com/llms.txt (H)
   - Base URL: https://api.opticodds.com/api/v3 (H)
   - Auth: API key in `X-Api-Key` header (docs say do not use ?key=). Unauthenticated call returned HTTP 401 `{"error": "API key is required."}` (H, fixture saved). Non-sport prediction-market endpoints are enabled per key; 403 otherwise (H).
   - Rate limits per 15 s window: historical odds 10 req, new streaming connections 250, everything else 2500 (H, https://developer.opticodds.com/docs/api-faq.md).
   - Streaming: SSE only, no WebSocket or webhooks (H, same FAQ). `GET /stream/prediction-markets?category=...` sends full order-book snapshots (not deltas), no replay (H, prediction-markets-streaming-guide).
   - Key endpoints: `/prediction-markets/categories`, `/prediction-markets/canonical-events/ids`, `/prediction-markets/canonical-events`, `/prediction-markets/events`, `/prediction-markets/events/ids`, `/stream/prediction-markets`; sports via `/fixtures`, `/fixtures/odds` with `sportsbook=polymarket|kalshi|...` (max 5 per request) (H).
   - Canonical matching: `canonical_id` (event), `canonical_market_id` (outcome), per-platform `confidence` 0-1, Kalshi and Polymarket only; non-sport only (politics, economics, finance, crypto, tech, culture, climate, health, geopolitics, companies) (H, https://developer.opticodds.com/docs/non-sport-prediction-markets.md, updated 2026-08-07). Sports PM markets are matched through the normal fixture flow.
   - Pricing / free tier: NOT FOUND (searched: developer.opticodds.com llms index and FAQ; FAQ mentions a "free trial" only). Likely contact-sales (L).
   - An MCP integration guide exists (https://developer.opticodds.com/docs/opticodds-mcp-integration-guide.md); not read.
- For real data, our aggregator should read Polymarket/Kalshi directly (free), not through OpticOdds. The only unique OpticOdds value is the maintained cross-venue canonical mapping, which we are building ourselves in docs/market-linking-design.md.

## Trade path

- Programmatic trade path via OddsJam: none documented. NOT FOUND (no public API for its Polymarket access). 
- Underlying path: Polymarket CLOB signed orders with the OddsJam builder code serialized into the signed order (H, https://docs.polymarket.com/programs/builders/overview.md). An agent wanting that venue should trade Polymarket directly via the Polymarket adapter (EIP-712 signed orders, builder attribution optional). Whether PayBox can sign for it belongs to the Polymarket spec, not this one.
- PayBox reachability of OddsJam itself: no (no contract or API to propose transactions against). Read-only OpticOdds data would be reachable only by a paid API key, which cannot be obtained under this research's rules.

## Fees

- OddsJam markup on Polymarket orders: NOT FOUND. Polymarket builder fees exist (https://docs.polymarket.com/programs/builders/fees.md, listed in llms index, not read this session). Subscription pricing for the OddsJam tool: NOT FOUND (site blocked).
- Venue fees: those of Polymarket.

## Resolution

Inherited entirely from Polymarket (UMA-style oracle and its dispute risk, per Polymarket spec). OpticOdds also grades sports itself for its sportsbook data (settlement rules pages at developer.opticodds.com/docs/settlement-rules.md), but that does not settle PM positions. (H for existence, M for relevance.)

## Geo / ToS / automation

- OddsJam site is bot-protected (Cloudflare managed challenge); scripted scraping is not an option and would breach intent. robots.txt disallows /polymarket, /go/, /api/backend/*. (H)
- OddsJam ToS: NOT FOUND (page blocked).
- OpticOdds terms for caching/redistributing data: NOT FOUND; assume restricted (L).

## Liquidity

- Own liquidity: none. Builder-attributed Polymarket volume: $38.7k all-time, $38.5k month, $2.2k week, 12 users all-time (H, Polymarket data-api, 2026-10-19). Negligible.
- Shared with: Polymarket (100%). Not an independent leg.

## Event coverage / arbitrage overlap

All of it is Polymarket's catalogue (sports, politics, crypto, macro). OpticOdds canonical events cover Kalshi+Polymarket for the ten non-sport categories above and sports through fixtures; this is exactly the overlap where cross-venue edge exists, and is useful as a cross-check on our own linking (confidence field) if a key ever becomes available. Quotient-as-signal use: OpticOdds consensus price / "OpticOdds AI" single-price product exists (H, api-faq) but is not needed.

## Sources

- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH&limit=50&offset=100 (H)
- https://docs.polymarket.com/programs/builders/overview.md (H)
- https://oddsjam.com/robots.txt (H); https://oddsjam.com/ (403 Cloudflare challenge)
- https://developer.oddsjam.com/ -> https://developer.opticodds.com/ (H)
- https://developer.opticodds.com/llms.txt, /docs/non-sport-prediction-markets.md, /docs/prediction-markets-streaming-guide.md, /docs/opticodds-for-prediction-market-makers.md, /docs/api-faq.md (H)
- https://api.opticodds.com/api/v3/prediction-markets/categories unauthenticated -> 401 (H)

## Fixtures

docs/research/fixtures/oddsjam-polymarket-access/: builders-leaderboard-{WEEK,MONTH,ALL}.json, oddsjam-robots.txt, opticodds-llms.txt, opticodds-non-sport-prediction-markets-doc.md, opticodds-prediction-markets-categories-unauth-401.json.

## Open questions

- How does OddsJam's Polymarket flow custody keys/wallets (user's own wallet, builder-provisioned, Polymarket USA)?
- OpticOdds pricing and whether canonical-event access is obtainable and redistributable.
- OddsJam markup/builder fee level.
- Limitations of this run: oddsjam.com unreadable (Cloudflare), WebSearch budget exhausted, so no news or third-party corroboration.
