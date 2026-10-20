# Heisenberg AI (Seshat Labs) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Not a venue. Heisenberg is a read-only market-data and wallet-intelligence API over Polymarket, Kalshi and Hyperliquid. It has no order book of its own, no tokens, no collateral, no execution and no resolution. It cannot be an arbitrage leg. It could only be an optional paid or free data and signal source (smart-money / H-Score / wallet analytics for Polymarket), and it duplicates the first-party Polymarket and Kalshi APIs for plain prices.

adapter_priority: skip as a trading venue. P2 at best as an optional signal/data source (see "Signal-source use").

## Liveness

- Live as of 2026-10-19. Docs site returns 200; page last-modified 2026-10-16 (H, https://prediction.heisenberg.so/docs/sdk).
- npm `heisenberg-ai` created 2026-07-10, 1.0.0 published 2026-07-20 (H, https://registry.npmjs.org/heisenberg-ai). GitHub repo SeshatLabs/heisenberg-sdk, not archived, last push 2026-07-20, 1 star (H, gh api). So the SDK has been quiet for about 3 months and has almost no adoption (M).
- Probes on 2026-10-19: `https://ripple.heisenberg.so/event-types` unauthenticated returned HTTP 503 and `https://ripple.heisenberg.so/` also 503 (H, curl). An auth-protected endpoint would normally give 401, so the streaming gateway may be down or may just reject bare requests. Unresolved (see open questions). `https://narrative.agent.heisenberg.so/` returned 404 (expected, the API is a single POST path).

## Kind and market model

- Kind: aggregator-or-data. Not a trading venue (H, SDK page: "Read-only ... no custody or signing"; https://prediction.heisenberg.so/docs/sdk).
- Product: "prediction market intelligence platform" with a REST API, MCP server, TypeScript and Python SDKs generated from one spec (H, https://prediction.heisenberg.so/llms.txt).
- Venues covered (H, https://prediction.heisenberg.so/docs/concepts/data-foundation.md and SDK page):
  - Polymarket: markets, trades, orderbook snapshots (historical), candlesticks, price jumps, PnL, wallet analytics, Market 360.
  - Kalshi: market catalog and trade history only (no orderbook endpoint listed).
  - Hyperliquid: perpetual, spot and "outcome" (binary) markets plus wallet and market trades. Hyperliquid outcome markets are a newer HL product; the docs show fields like `yes_coin`, `no_coin`, `priceBinary` class, `underlying`, `target_price`, `expiry` (H, https://prediction.heisenberg.so/docs/api-reference/hyperliquid-outcome-markets.md). Note: Hyperliquid outcome markets are not on the already-covered list and might deserve their own venue-spec.
  - Social sentiment (X/Twitter, Reddit).
- Outcome tokenisation is whatever the underlying venue does (Polymarket `side_a_token_id`/`side_b_token_id` CLOB token ids; Kalshi tickers). Heisenberg adds none.

## Chains and collateral

None of its own (H). Underlying: Polymarket on Polygon USDC, Kalshi USD, Hyperliquid on its own L1 (M, not verified here, covered by other venue specs).

## Read API

- Exists: official, authenticated (bearer token). Access is NOT self-serve: "Accounts are provisioned after a short conversation rather than through self-serve signup" via an email request; key then generated in dashboard (H, https://prediction.heisenberg.so/docs/getting-started/authentication.md). Pricing page lists Explorer (free, "all public endpoints"), Growth (contact), Enterprise (custom) (H, .../pricing.md). SDK page says some endpoints (smart money, sports, audience, some leaderboards) are plan-gated with a `PlanError` (H).
- Docs: https://prediction.heisenberg.so/docs/api-reference ; index https://prediction.heisenberg.so/llms.txt ; full text https://prediction.heisenberg.so/llms-full.txt ; every page available as markdown by appending `.md` (H).
- Base URL (single endpoint for everything): `POST https://narrative.agent.heisenberg.so/api/v2/semantic/retrieve/parameterized` (H, .../getting-started/direct-api.md). Request body: `{agent_id, params{string values}, pagination{limit,offset}, formatter_config{format_type:"raw"}}`. Response: `{timestamp, params, pagination{limit,offset,has_more}, data{results[]}, request_id}`. Quirk: all params are strings (`"closed":"False"`), orderbook `asks`/`bids` are JSON-encoded strings inside the JSON (H, docs example).
- Endpoints are selected by `agent_id` (H, docs): Polymarket markets = 574, Polymarket orderbook = 572, Kalshi markets = 565, Hyperliquid outcome markets = 615. Others in llms.txt: Polymarket trades, candlesticks, price jumps, PnL, PnL leaderboard, wallet stats, Heisenberg leaderboard, Wallet 360, Market 360; Hyperliquid wallet/market trades, perp/spot/outcome markets; Kalshi trades; sports, smart-money, audience, social (H, llms.txt).
- Orderbook: Polymarket only, and it is a PAST snapshot query by `token_id` + `start_time`/`end_time` (H, .../polymarket-orderbook.md), not documented as a live top-of-book. No current-price endpoint listed (H, SDK page). Kalshi market rows carry `last_price`, `volume`, `volume_24h`, `status`, `result` (H, .../kalshi-markets.md).
- Resolution: Polymarket market rows give `closed`, `winning_outcome`, `end_date`; Kalshi rows give `status` and `result` (H). No dispute data.
- WebSocket: `wss://ripple.heisenberg.so/ws`, bearer in upgrade header; only live event type is `polymarket.trade`; `GET https://ripple.heisenberg.so/event-types` lists types; plan-governed throughput, `rate_limit` notice frames (H, https://prediction.heisenberg.so/docs/websockets.md). No Kalshi stream.
- Rate limits: NOT FOUND numeric limits (searched: pricing.md, llms-full.txt, websockets). Docs only say Growth tier has "higher rate limits" and that the SDK retries 429/5xx with backoff, default 2 retries (H). Docs claim "No rate limit concerns" and sub-300ms latency, seconds-fresh data (H, vendor claim, unverified).
- MCP: `https://narrative.agent.heisenberg.so/sse` (H, llms.txt).
- Unauthenticated sample: none possible. All data endpoints are POST + bearer. I did not POST. Fixtures saved are copies of official docs pages, not live responses (see fixtures README).

## Trade path

None (H, "Read-only ... no custody or signing"). Orders must be placed on the underlying venues directly. Reachability via PayBox is therefore moot: `paybox_reachable = no`. The API is a plain HTTPS bearer API with no wallet/signing and no x402 (H, SDK page: no mention of x402; no 402 observed because no request was made).

## Fees

No trading fees (no trading). API cost: free "Explorer" tier for public endpoints; paid tiers by contact, no public prices (H, pricing.md). The docs mention "credit weights" in llms.txt description of the pricing page, but the page itself shows no numbers (M).

## Resolution mechanism

Not applicable; resolution is the underlying venue's. Heisenberg only mirrors outcomes. Mirror lag and correctness not documented.

## Geo / ToS / automation

- Automation is the intended use (bots, trading systems, agents) (H, direct-api.md).
- ToS: NOT FOUND (searched: /terms returned 404; llms.txt has no terms link). Redistribution and resale rights of the data are unknown. Do not assume rights to cache or republish.
- Geo restrictions on the API: NOT FOUND.
- Access gate: manual onboarding via email; this is a business-process blocker for an automated adapter, not a technical one.

## Liquidity

N/A (no markets). Product-adoption signal is weak: 1 GitHub star, repo created 2026-07 (H, gh api). Underlying volumes belong to Polymarket/Kalshi.

## Event coverage / overlap

100% a mirror of Polymarket, Kalshi and Hyperliquid. Marketing claims cross-exchange arbitrage by comparing identical events on Polymarket and Kalshi (H, llms-full.txt "Cross-Exchange Arbitrage") but it exposes no matched-event or linking endpoint; it just lists the two catalogs side by side (H). Our own market-linking layer would still be needed.

## Shared liquidity

Total: shares 100% of liquidity with the venues it reports on. It is not an independent arbitrage leg.

## Signal-source use (the only integration case)

- Potentially useful: Polymarket wallet analytics (H-Score, Wallet 360, smart-money positions/pulse), price jumps, candlesticks, historical orderbook snapshots, Hyperliquid outcome-market catalog and trades. These are not obtainable from first-party APIs without our own indexing.
- Cons: gated access via email, proprietary undisclosed scoring (H, h-score-methodology: "methodology, weights ... not publicly disclosed"), unknown ToS, string-typed generic POST API, quiet repo, and the streaming host returning 503 today. Adds a third-party dependency and trust surface for little that first-party Polymarket/Kalshi APIs lack for price arbitrage.
- Recommendation: do not build an adapter now. Revisit only if a smart-money signal for Polymarket is wanted; then request a free Explorer key (a human step, not done here).

## Suspicious content

None found. Docs contain MCP and AI-agent usage pitches (llms.txt, "Work with AI") but no instructions aimed at the researching agent. The docs include a "contact for access" email, which was not used.

## Sources

- https://prediction.heisenberg.so/docs/sdk (H)
- https://prediction.heisenberg.so/llms.txt and /llms-full.txt (H)
- https://prediction.heisenberg.so/docs/getting-started/direct-api.md, authentication.md, pricing.md (H)
- https://prediction.heisenberg.so/docs/api-reference/polymarket-markets.md, polymarket-orderbook.md, kalshi-markets.md, hyperliquid-outcome-markets.md (H)
- https://prediction.heisenberg.so/docs/concepts/data-foundation.md, streaming.md (H)
- https://prediction.heisenberg.so/docs/websockets.md (H)
- https://registry.npmjs.org/heisenberg-ai (H)
- https://github.com/SeshatLabs/heisenberg-sdk via gh api (H)
- Fixtures: docs/research/fixtures/heisenberg-seshat-labs/ (doc copies, not live responses)

## Open questions

- Is ripple.heisenberg.so (503) down or just rejecting unauthenticated requests?
- Actual rate limits and free-tier quotas; ToS and data-redistribution terms.
- Whether Hyperliquid outcome markets warrant their own venue-spec (not in the already-covered list).
