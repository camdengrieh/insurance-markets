# Cobot (cobot.gg) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in primary source this session; M = secondary/inferred; L = weak/stale.

## Verdict

- Kind: front-end aggregator + custodial-style execution terminal + AI agent runner. NOT a market venue. It lists no markets of its own. [H] ToS: "We do not create, list, host, operate, or settle markets ourselves." (https://cobot.gg/terms, effective 4/9/2026)
- Adapter priority: **P2 / signal-only**. Every market it exposes is a re-skin of Polymarket, Kalshi (via dFlow), Limitless, Myriad (and Opinion per a hackathon post). Those venues should be integrated directly. Its only unique value is whale feed, AI signals and news, none of which has a documented public API.
- Liquidity: shares 100% with the underlying venues, so it is never an independent arbitrage leg.

## Is it live (2026)?

- [H] cobot.gg returns 200, title "Cobot - Prediction Market Aggregator", footer "Cobot 2025" (https://cobot.gg/).
- [H] app.cobot.gg returns 200 (Angular PWA). docs.cobot.gg returns 200; sitemap lastmods run 2026-03-17 to 2026-05-05; tokenomics page last modified 2026-05-05 (https://docs.cobot.gg/sitemap.xml). Terms effective 2026-04-09.
- [M] Newest dated evidence of activity is May 2026 (docs). No Oct 2026 activity signal found. Treat as live but possibly low-activity.
- [H] Roadmap says Phases 1-2 (aggregation, execution) are live; Phases 3-6 (agents, perps, DeFi, "autonomous capital layer") are Q2 2026 to Q4 2026+ (https://docs.cobot.gg/roadmap). Roadmap dates may be stale; not verified delivered.

## Market model and venues covered

[H] https://docs.cobot.gg/introduction "Supported Platforms":

| Platform | Type | Chain |
|---|---|---|
| Polymarket | CLOB | Polygon |
| Kalshi | Regulated exchange | Solana (via dFlow) |
| Limitless | AMM + CLOB | Base (8453), USDC, CTF `0xC9c98965297Bc527861c898329Ee280632B76e18` (public contract per docs) |
| Myriad | prediction market | "Multi-chain" |

- [M] A Seedify hackathon post lists Myriad and Opinion as well; marketing site lists only Polymarket, Kalshi, Limitless ("live spreads"). Opinion is not in the docs, so treat as unconfirmed.
- Binary Yes/No only in the docs (order payload `side: yes|no`). No categorical or scalar handling documented. [H]
- Cobot adds no tokenisation of its own; outcomes are the underlying venue tokens (Polymarket CTF via Safe, Limitless CLOB tokens/FPMM positionIds, Kalshi via dFlow on Solana).

## Chains and collateral

- [H] Wallets auto-created at sign-up: EVM wallet (Ethereum, Base, Polygon, BSC, Arbitrum), Solana wallet, and a Polymarket Gnosis Safe on Polygon derived from the EVM address (https://docs.cobot.gg/getting-started/wallets).
- [H] Collateral is USDC: Polymarket in Safe, Kalshi in Solana wallet, Limitless in Base EVM wallet (https://docs.cobot.gg/getting-started/fund-wallet).
- [H] Swaps/bridges via LiFi across Ethereum, Base, Polygon, BSC, Arbitrum, Solana (https://docs.cobot.gg/features/token-swaps).
- [H] Polymarket deposit bridge accepts 9 chains (Ethereum, Polygon, Arbitrum, Base, Optimism, BSC, Solana, Bitcoin, Tron).
- Cobot's own token: docs say "$COBOT", total supply 1,000,000,000 (page also writes "CBT") [H] (https://docs.cobot.gg/tokenomics). Chain conflict: X profile says Base; Seedify post says BNB Chain (CBT); CoinGecko snippet shows Base pools (Aerodrome, Uniswap V4) [M/L]. Not relevant to trading collateral.

## Read API

- Classification: **official-authenticated** (and undocumented base URL). [H] All requests require `Authorization: Bearer <jwt>` obtained via Firebase phone OTP or Google OAuth; MCP uses a user-created API key (https://docs.cobot.gg/api-reference/authentication).
- Docs URL: https://docs.cobot.gg (Mintlify; machine index https://docs.cobot.gg/llms.txt and https://docs.cobot.gg/llms-full.txt, both fetched).
- Base URL: **NOT FOUND** (searched: all docs pages, llms-full.txt, app.cobot.gg main + chunk bundles, web search). Docs give only relative paths. DNS: api.cobot.gg and mcp.cobot.gg do not resolve; backend.cobot.gg resolves and returns an nginx 404 at `/` (unconfirmed whether it is the API) [H as observation, L as inference].
- Documented relative endpoints [H], all behind JWT:
  - Polymarket `/api/polymarket/`: `GET /markets/`, `/markets/events`, `/markets/events/:id`, `/markets/series`, `GET /token/:id/orderbook/`, `GET /holding/`, `GET /whale-txs/`, `POST/GET/DELETE /order/`, `POST /token/claim/`, bridge deposit-addresses/supported-assets/status, `POST /safe/withdraw/`.
  - Kalshi `/api/kalshi/`: `GET /markets/`, `/markets/:id`, `/markets/:id/orderbook`, `/markets/:id/candlesticks`, `/events/`, portfolio balance/positions/fills/settlements; `POST /order/`, `DELETE /order/:id`, `POST /order/close-position`.
  - Limitless `/api/limitless/`: `GET /markets/active`, `/markets/:slug`; `POST /order/?orderType=market|limit`; portfolio endpoints; `POST /portfolio/claim-position`.
  - Web3 `/api/web3/`: wallet view, `GET /export-private-key` (!), LiFi quote/execute, token search, pump.fun launch, `/realtime/`, `/bsc/`.
  - No documented endpoints for AI signals, news feed, or aggregated cross-venue spreads (the site's headline features). Whale data exists only for Polymarket (`/whale-txs/`).
- MCP server: tools `markets_list`, `market_get`, `events_list`, `orders_create`, `orders_list`, `positions_list`, `position_close` (Kalshi); `polymarket_markets`, `polymarket_events`, `polymarket_market_orderbook`; web3 `balances_get`, `wallet_addresses`, `swap_quote`, `swap_execute`, etc. MCP endpoint URL NOT FOUND in docs. [H] (https://docs.cobot.gg/features/mcp-server)
- Rate limits: MCP 60 req/min per API key; backend "standard rate limiting applies" (no numbers). [H]
- WebSocket: Polymarket page mentions real-time orderbook over WebSocket in the UI; no WS endpoint documented. [H for mention, endpoint NOT FOUND]
- No public unauthenticated response shapes could be confirmed. No fixtures of API responses saved. Docs snapshots saved instead: `docs/research/fixtures/cobot/docs-llms.txt` and `docs-api-reference-and-mcp.md` (verbatim from llms-full.txt, 2026-10-19).
- Practical note: for the aggregation layer, the underlying venues' own public APIs are strictly better data sources than Cobot's wrapper.

## Trade path

- [H] Execution is through Cobot's backend, using wallets Cobot provisions. There is an endpoint `GET /api/web3/export-private-key`, which indicates Cobot holds (or can derive) the private keys server-side, i.e. custodial/server-managed keys, contradicting the ToS line "We do not hold customer funds" in practice [M inference; flag as a risk]. Polymarket orders "signed by your EOA but executed through the Safe".
- Sign-in is phone OTP / Google / Farcaster. No "connect your own wallet" flow documented. [H]
- Programmatic: API key -> MCP server (60 rpm) or JWT REST. API keys are created in the app UI (`POST /api/user/keys/`). Not done here (no account creation allowed).
- PayBox reachability: **partial**. A PayBox EVM/Solana wallet cannot sign Cobot orders (no external-wallet signing). The only integration is funding: send USDC from a PayBox wallet to the Cobot-provisioned deposit address (Polygon Safe, Base EVM, Solana) via normal transfers, then trade through Cobot's API with a Cobot API key. That puts funds in a third party's key custody; strongly inferior to trading Polymarket/Limitless/Kalshi directly from the PayBox wallet using their own signed-order APIs.

## Fees

- [H] Docs state no fee schedule. Tokenomics: fees from "swaps, copy trading, automated agent execution"; 30% of platform revenue to buyback/burn; $COBOT holders get discounted trading fees. Rate NOT FOUND (searched: all docs, terms, tokenomics). Underlying venue fees apply on top (Polymarket/Kalshi/Limitless schedules are covered by other workflows). LiFi swap fees apply to swaps.
- Fee payer: user, implicitly. Possible hidden builder/routing fee on orders: unknown.

## Resolution and dispute risk

- Cobot does not resolve anything [H, ToS]. Resolution = underlying venue (UMA for Polymarket, Kalshi internal, etc.). Additional Cobot-layer risk: custodial wallets, backend outage while positions are open; agents auto-redeem winners [H]. Dispute risk with Cobot itself: ToS says arbitration/courts of unnamed "jurisdiction where Cobot is organized" (jurisdiction NOT FOUND).

## Geo / ToS / automation

- [H] ToS: user responsible for legality in their jurisdiction; "Do not attempt to circumvent geoblocking, eligibility checks, or access controls." Kalshi trading requires KYC (dFlow Proof of Personhood) [H]. Must be 18+.
- Automation: officially supported via MCP and agents; API keys are first-class. 60 rpm cap. Auto-trading is allowed for own account; scraping their backend not addressed.

## Liquidity

- Cobot's own: effectively none; it routes. Self-reported beta (Seedify post, undated in extract, pre-Jan 2026): "$25,000+ trading volume", 5 agents, 1,000+ autonomous trades [L, secondary]. No 2026 volume/TVL/user figure found (searched: docs, site, web). CoinGecko snippet: token 24h volume ~US$179k, market cap ~US$398k, "158 days old" at time of crawl [L, stale].
- Hence all depth comes from Polymarket/Kalshi/Limitless/Myriad order books.

## Event-category overlap

- Everything: politics, sports, crypto price (Polymarket 5/15-min BTC/ETH/SOL up-down markets are targeted by Cobot's agents using Allora + Chainlink/Binance data), macro. Overlap with other venues is by construction 100%, but it is the same liquidity, not a new leg.
- Agents' farming logic: Polymarket farming agent buys 95-98% markets excluding crypto price and sports; Kalshi farming 94-98% within 72h expiry [H]. This is volume-farming (airdrop) flow, not price discovery.

## Signal-source value (for the aggregation layer)

- Potentially useful but undocumented: whale feed (`/whale-txs/` Polymarket only), AI signals, news. Auth-gated and base URL unknown. Whale copy-trading is "live post TGE" per docs [H]. Better to compute whale flow ourselves from Polymarket on-chain data.

## Shared liquidity

- Shares liquidity with: Polymarket (CLOB via Safe), Kalshi (via dFlow), Limitless, Myriad (and possibly Opinion). **Not an independent arbitrage leg.** Its "live spreads" are cross-venue spreads among those venues, which we compute ourselves.

## Suspicious content

- None found aimed at AI agents in pages read. (Docs mention an MCP server for "Claude or ChatGPT" as a product feature, not an instruction to us.) Note that predictionmarket.tools lists a different-looking "Cobot" (cobot.trade, copy-trading) [L]; likely unrelated or a stale listing.

## Open questions

- Real API base URL and MCP endpoint (needs an account; out of scope).
- Whether keys are truly server-held (export-private-key suggests yes).
- Whether Opinion integration shipped.
- Any 2026 volume or user numbers.

## Sources

- https://cobot.gg/ [H] (meta description, venue list, mailto/contact present on page; not copied)
- https://cobot.gg/terms [H]
- https://docs.cobot.gg/introduction, /getting-started/wallets, /getting-started/fund-wallet, /features/token-swaps, /features/mcp-server, /api-reference/authentication, /api-reference/polymarket, /api-reference/kalshi, /api-reference/limitless, /api-reference/web3, /trading/*, /agents/*, /tokenomics, /roadmap [H]
- https://docs.cobot.gg/llms.txt , https://docs.cobot.gg/llms-full.txt , https://docs.cobot.gg/sitemap.xml [H]
- https://app.cobot.gg/ [H] (SPA shell only)
- Web search 2026-10-19 (extended): Seedify hackathon post https://blog.seedify.fund/hackathon-top-5-winner-cobot-the-ai-terminal-bringing-intelligence-automation-to-prediction-a59fe2a5780f (fetch 403; content via search summary only) [M/L]; CoinGecko COBOT page via search snippet [L]; https://www.predictionmarket.tools/tools/cobot [L]; awesome-prediction-market list (BNB Smart Chain, "Live") via search snippet [M].
