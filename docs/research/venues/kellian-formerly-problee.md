# Kellian (formerly Problee) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: skip as a trading leg; at most P2 as a signal-only feed. Kellian is a PLAY-MONEY venue. Its markets are clones of Polymarket markets that settle off Polymarket's prices and results, and (per llms.txt) trade against Polymarket's live book. Nothing real can be traded, nothing is independent liquidity, and PM cannot be cashed out. (H)

## Still live? (H)

- kellian.app returns 200, footer "(c) 2026 Problee, Inc.", status page "Operational" as of 2026-10-18 02:43 UTC, 188 open markets on the home page 2026-10-19. https://kellian.app/ , https://kellian.app/status
- Rename: API error bodies still carry `https://problee.com/errors/...` and `data-ui="problee"`; MCP tool names in the OpenAPI text still say `problee_get_fees`. Show HN "Problee - play-money prediction markets" dated 2026-09-29 (HN id 49888671, found via the HN Algolia API). (H)
- Very young (about 3 weeks public). v1 API stability promise starts 2026-10-14. (H)

## Kind and market model (H)

- Kind: play-money prediction market with a research/AI-analyst layer. Not a broker for real orders. Page text: "Play Money (PM) is for play. It can't be cashed out or moved." (https://kellian.app/protocol)
- Markets: BINARY, pricingModel ORDERBOOK (the fee schedule also lists an LMSR lane, but all 20 markets sampled were ORDERBOOK). Outcome 1 / Outcome 2 shares, price in basis points 1-9999, winning share pays 1 PM. Sports markets resolve 50-50 on cancel. (discover/markets sample, fixtures)
- Market id format `chainId:address` (e.g. `base:0x...`, chainId 8453); each market is an on-chain address on Base. Also an opaque `marketReference` `mkt_<uuid>`.
- Each sampled market carries `resolutionSource.type = "polymarket"` with Polymarket `conditionId`, `eventSlug`, `slug`, `sourceUrl`, and `theirYesIndex`. This gives a ready-made mapping to Polymarket markets (useful for linking, but also proves the duplication).

## Chains and collateral (H)

- Base (8453) only. Collateral token "PM" at 0xee43b54517430804fc1d3de00c19c32b46923c10 (6 decimals, settlement "committed"), which is the same address as the "commit ledger". PM is a ledger balance, not a transferable ERC-20: Terms say no contract holds PM or has a transfer function. (discover/collateral, legal terms)
- Kellian-operated ledger settles fills off-chain, then publishes batches (Merkle-chained roots) to Base via `commitBatch`. Factory 0xD542aD0856E3c00366634668570446fd4358b92e. (https://kellian.app/protocol, https://api.kellian.app/api/v1/ledger/contract)
- PM is bought with card, or by agents via x402 USDC (`POST /pm/buy`); it cannot be withdrawn. Real money only buys PM or Insights Plus. (llms.txt, terms)

## Read API (official, public + authenticated)

Docs: https://kellian.app/developer ; https://kellian.app/llms.txt ; OpenAPI https://api.kellian.app/api/agent/v1/openapi.json (151 paths, 1.2MB) ; also consumer and builder OpenAPI at /api/v1/openapi.json and /api/builder/v1/openapi.json (listed in llms.txt, not fetched). (H)

Base URLs: `https://api.kellian.app/api/agent/v1` (Agent API), `https://api.kellian.app/api/v1` (context/ledger), MCP `https://mcp.kellian.app` (tool `kellian_get_context` etc.; not tested).

Unauthenticated GETs I confirmed work (H, fixtures saved):
- `GET /api/agent/v1/discover/markets` -> `{markets[20], hasMore, nextCursor}`; rejects unknown params (`limit` gave 400 INVALID_PAYLOAD; cursor paging; `category`, `search` documented in llms.txt). Fields include question, category, marketState, pricingModel, closeTime, resolutionCriteria, resolutionSource{type:polymarket,...}, prices{outcome1,outcome2} (0-1), volumePm, volume24h.
- `GET /discover/markets/{address}/depth` -> orderbook bids/asks (price, priceBps, amountWei, orderCount), bestBid/bestAsk, spread, seq, takerFeeBps.
- `GET /discover/markets/{address}/trades` (empty for the sample market), `/resolution-state`, `/discover/fees`, `/discover/collateral`, `/discover/capabilities`, `/discover/settled-markets` (+ `.csv`), `/discover/leaderboard`, `/discover/markets/{address}/chart`.
- `GET /api/v1/context` -> per-market research record: `market{chance, move24h, closes, rules, polymarket URL}`, `facts`, `headlines`, `analysts{average,gap,count}`, `topTraders`. Unauthenticated/free tier is a limited preview (5 markets/call). Response headers `x-ratelimit-limit: 120`, tier standard.
- `GET /api/v1/ledger/contract` -> ABI of commit ledger.
- Websocket: NOT FOUND (searched: llms.txt, developer page, OpenAPI path list; only `/orderbook/events` "replay private order lifecycle events" exists, authenticated).

Auth and limits (H): Bearer API key (created in account settings after sign-in; shown once) for the Agent API/MCP; wallet-proof only for elevation. Keyless context: 10 calls/day, free account 20 calls/day, Plus 600/day, API Pro higher. Agent API: flat per-tier 60-second sliding window, 429 with RateLimit-* headers; live ceilings at `GET /me`. Changes additive-only from 2026-10-14, 90-day deprecation notice.

## Trade path (H)

Programmatic order placement exists but only in PM: `/orderbook/place-order` (EIP-712 typed data, user-signed limit orders, resubmit after signing), `/orderbook/plan-pm-order`, `/trade/prepare`, `/trade/execute-intent`, batch place, cancel, cancel-all, quote-set replacement, heartbeat. Takers are delayed (`takerDelayMs`, order answered `DELAYED`). Free fill allowance per 7-day period, then 402 `FILL_ALLOWANCE_EXHAUSTED` until PM/credits are bought via x402 (`POST /pm/buy`; I did not call it, so the payment requirements are not recorded).

PayBox reachability: no. Nothing here involves real value, so there is no useful transaction proposal. An EVM wallet could in theory sign the EIP-712 PM orders, but the play-money result has no cash value, and an agent key/registration flow needs account creation (not done; read-only rule). paybox_reachable: no (no money-bearing trade path).

## Fees (H)

PM fees only, charged to the economic taker; placement free; settlement of winners 0%. Factory defaults `routerTakerFeeBps` 1000 / `operatorBatchFeeBps` 1000 with `fee = shares x rate x price x (10000 - price) / 10000^3` (peaks at 2.5% of a share at 50c; a market sampled showed takerFeeBps 500). LMSR lane: buy 0, sell exit 200 bps, winnings exit 200 bps. Per-market rates are stamped at creation. (https://kellian.app/fees, /discover/fees fixture)

## Resolution (H)

Market creator posts the result from the named source; markets that follow a source (Polymarket) settle as that source does; rare "Final Review" by bounded protocol roles; resolution lifecycle exposed at `/discover/markets/{address}/resolution-state` (creatorResolveBy, challengeBy, humanVote, councilReview). Dispute risk is moot for money (PM only) but matters for label quality: resolutions follow Polymarket's, so they add no independent information.

## Geo / ToS / automation (H)

18+, sanctions list (Cuba, Iran, North Korea, Russia, Belarus), server-side location checks, no VPN circumvention. Section 9 prohibits abusing the agent API, exceeding published limits and scraping. Plus content (research, prices, AI analysts' odds) may not be copied, resold, republished, used to build datasets/products or train models, and capital-markets firms/prop traders are barred from Plus. Programmatic play is governed by "Developer Terms" (https://kellian.app/legal?tab=developers), which I did not read. Implication: the paid research layer cannot be redistributed or used in a commercial aggregator without a separate agreement. (https://kellian.app/legal?tab=terms)

## Liquidity (H, 2026-10-19)

- Real-money volume/OI/TVL: none (PM is non-redeemable). 
- PM activity is small: in the first 20 markets only one had volume (293.1 PM lifetime); the sample CS2 market showed an order book of about 0.3-1.9k PM per level, which is play money seeded by market makers/source book. No usage totals are published (status page lists none).
- The order book for source-following markets is derived from "source books" (`PUT /source-books`, llms.txt says "markets that trade against their source's live book"), so prices track Polymarket.

## Event categories (H)

Politics/elections (US midterms), sports (CS2, WNBA, football), crypto price dips, macro/finance (S&P, Netflix margin), AI/tech, climate, entertainment. All of it mirrors Polymarket events. For arbitrage there is nothing here that is not already on Polymarket.

## Shared liquidity

Shares price discovery with Polymarket (clone/mirror, `resolutionSource.type = polymarket`). NOT an independent leg. (H)

## Where it could still be useful (P2 at best)

- Signal source: `analysts.average` / `gap` (AI analyst odds vs market) and `topTraders` counts per side from `/api/v1/context`. This is an Quotient-like research layer, but free access is 5 markets/call, 20 calls/day, and ToS bans redistributing Plus data and capital-markets use. M: not worth an adapter before the core venues.
- Market-linking aid: `polymarket` URL and `resolutionSource.conditionId` per market is a free mapping table of Kellian-to-Polymarket, but it is of no value to us since we read Polymarket directly.

## Suspicious content

None found. Pages and llms.txt contain instructions aimed at agents (e.g. "Do not request, expose, log, or post API keys..."), which are benign and I did not act on them besides not requesting keys. The homepage links an agent starter repo `github.com/pprotocol-us/agent-starter` (not opened).

## Open questions

- Developer Terms (legal?tab=developers) not read.
- Full per-tier limits table and whether API Pro allows commercial aggregation.
- Whether the "kellian" / "pprotocol" / "Problee" names indicate other operator brands.
- `/pm/buy` x402 payment requirements (not requested; read-only rule).

## Sources

- https://kellian.app/ (H, 2026-10-19)
- https://kellian.app/protocol , /fees , /business , /developer , /status , /legal?tab=terms (H)
- https://kellian.app/llms.txt (H)
- https://api.kellian.app/api/agent/v1/openapi.json (H)
- https://api.kellian.app/api/agent/v1/discover/{markets,fees,collateral,capabilities}, /discover/markets/{address}/{depth,trades,resolution-state} (H)
- https://api.kellian.app/api/v1/context , /api/v1/ledger/contract (H)
- https://hn.algolia.com/api/v1/search?query=problee&tags=story (H, Show HN 2026-09-29)
- Fixtures: docs/research/fixtures/kellian-formerly-problee/
