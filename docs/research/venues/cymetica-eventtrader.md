# Cymetica EventTrader - venue spec (adapter research)

Researched 2026-10-19. Read-only: public unauthenticated GETs and web pages only. No registration, no account, no key, no POST (EventTrader's own agent docs invite agents to self-register with a contact e-mail; that was deliberately not done, see "Suspicious content").

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

- Adapter priority: **skip**. Re-check in 3-6 months only if the prediction-market side gets real volume.
- The site is live (H) but the prediction-market part is effectively empty and not an independent, executable leg: all 9 listed binary markets have `total_pool` 0, the 644 live "event cards" hold USD 20 total notional, the 5-minute UP/DOWN markets show zero YES/NO supply, the WTA list is empty, and the BTC/USDC book's last real fill was 2026-04-09 (24h volume 0). 99.9% of the platform's 24h exchange volume is its own ET10 token.
- It is a custodial, off-chain-ledger, AI-agent/token-promotion platform with a "prediction market" label. Its numbers are mostly self-reported marketing; the live API data contradicts the headline claims.

## Identity and liveness (H unless noted)

- Operator: Cymetica (Berkeley, California; founded Nov 2025; founder Kasian Franks) (M, third-party profile at api-evangelist; consistent with AGENTS.md and llms.txt, H for the founder name).
- Product: "EventTrader", described by the operator as "perpetual prediction markets, CLOB exchange, 10 AI trading agents, on-chain settlement on Base L2" (AGENTS.md). Same operator's llms.txt says fills settle on a platform ledger and go on-chain only on withdrawal (see Resolution/settlement). The two statements conflict; the API evidence (`tx_hash` values of the form `ledger:<hex>`, `market_address: "offchain"`) supports the ledger version.
- Still live: https://cymetica.com/ returns 200; `GET /mcp/v1/health` -> `{"status":"healthy",...}` timestamped 2026-10-19T02:49Z; ToS v1.1 "Last Updated October 9, 2026"; PyPI `cymetica-eventtrader-mcp` 1.1.5 uploaded 2026-09-23; Glama listing reports 99.1% uptime over 27 days (M).
- Homepage and sibling pages are written largely as instructions to AI agents; there is no neutral docs portal. Machine-readable docs: `/openapi.json` (small), `/openapi-public.json` (421 paths, 1.3 MB), `/llms.txt` (207 KB), `/.well-known/mcp`, `/AGENTS.md`.

## Kind and market model

Several different things sit under the "EventTrader" name. Only the first three are anything like a prediction market.

| Product | Model | Tokenisation | Liquidity now |
|---|---|---|---|
| `GET /api/v1/markets` "prediction_contract" markets | YES/NO binary, USDC | no token; ledger rows keyed by a pseudo contract address | 9 markets (8 seeded quantum-computing questions, 1 "VAIX Dashboard Discussion" placeholder), all `total_pool: 0.0` (H) |
| 5-minute "perpetual binary" UP/DOWN epochs (BTC, ETH, NVDA, AAPL, GOOG, VAIX, SBIO) | Parimutuel pool per epoch: "winners share the epoch's pool, payout capped at 10x the stake" (llms.txt). `market_address: "offchain"`, `yes_price`/`no_price` fixed 0.50, `yes_supply`/`no_supply` 0 | none, off-chain | zero supply on every symbol at 02:51Z (H) |
| WTA (winner-takes-all) price-prediction rounds | Closest prediction wins the pool | none | `GET /api/v1/wta/markets` returns `[]` (H) |
| "Event cards" `EVCDX-*` (644 live) | Not event contracts. News-headline-driven index baskets of stocks/crypto (one-stock "SAIB" or multi-asset baskets), long/short perpetual on the index, up to 10x leverage | `evcdx_symbol` mostly null; "on-chain EVCDX mint/redeem activates where enabled" (well-known) | bull notional USD 20, bear 0, over all 644 cards (H, summed from paged `/api/v1/event-cards`) |
| CLOB spot pairs (9 core, "500+" claimed) | Order book; `book/hybrid` mixes internal orders with DEX pool quotes | ERC-20s (BTC/ETH wrappers, own tokens SBIO, VAIX, ET10, CYM42, TBIG...) | BTC/USDC `listed:false`, `volume_24h_usd: 0` (H) |

Outcome tokenisation: none that an external party could hold or trade; positions are rows in Cymetica's ledger (H: ToS says live bots "settle internally on the platform's ledger, with no external or on-chain settlement for those outcomes").

## Chains and collateral

- Collateral for prediction markets and epochs: USDC (`collateral: "USDC"`, `token: "USDC"`) (H). Deposits accepted: USDC or USDT, "Recommended: USDT on Ethereum mainnet", per-chain deposit addresses from `GET /api/v1/funding/deposit-addresses` (needs API key; not called) (H for the statement, chain list beyond Ethereum NOT FOUND in public pages).
- Chains named across docs: Ethereum mainnet, Base (chain 8453, default in perpetual bet history), Arbitrum, BNB, Polygon, Robinhood Chain (4663), Arc (5042) for launchpads and DEX-routed swaps (H for names; none of these hosts the prediction-market settlement).
- Custody: platform-custodial (deposit to a Cymetica-controlled address; ledger balances). The homepage says users may alternatively connect a broker/exchange with trade-only keys (M, page text).

## Read API

- Status: **official, public, unauthenticated for market data** (H, confirmed with GETs 2026-10-19).
- Base URL: `https://cymetica.com` (single origin, REST under `/api/v1/`, MCP under `/mcp/v1`).
- Docs: `https://cymetica.com/openapi-public.json` (OpenAPI 3.1), `https://cymetica.com/llms.txt`, `https://cymetica.com/api-docs` (linked from PyPI metadata), `https://cymetica.com/AGENTS.md`.
- Key endpoints (all GET, no key; fixtures saved):
  - `/api/v1/markets` -> `{markets:[...], cursor}`; `/api/v1/markets/{contract_address}` (single, returns same row shape); `/api/v1/markets/{address}/orderbook` needs a required `asset` query param (422 without it; not explored further).
  - `/api/v1/perpetual/markets/batch-status` (5-minute epochs), `/api/v1/perpetual/markets/{symbol}/status`, `/orderbook` (empty), `/ticks`.
  - `/api/v1/event-cards?limit<=200&offset=` -> envelope `{cards,count,total,limit,offset,...}`; `/api/v1/event-cards/{id}`, `/{id}/index-history`.
  - `/api/v1/clob/book/hybrid?pair=BTC/USDC`, `/api/v1/clob/trades?pair=...&limit=`, `/api/v1/exchange/{symbol}/{orderbook|book|trades|bbo|ticker|stats}`, `/api/v1/exchange/markets`, `/api/v1/exchange/pairs`.
  - `/api/v1/wta/markets` (empty list), `/api/v1/prices`.
  - Resolution data is embedded in the market description and in each event card's `contract_spec` (resolution_source, fallback_source, methodology, dispute_window, appellate_body).
- Auth and limits: public tools need no key. Documented tiers: unauthenticated 10 req/min and 500/day; registered 30/min, 5,000/day; trusted 60/min; allied 200/min (well-known `trust_tiers`). API-key tiers standard 100/min, premium 1,000/min, market_maker 6,000/min. Observed response header on an unauthenticated call: `x-ratelimit-limit: 2000` with a reset epoch (so the real limit differs from the documented 10/min; treat as L-confidence and back off conservatively). `cache-control: private, max-age=5` on epoch status.
- WebSocket: documented `wss://cymetica.com/ws/wta`, `/ws/top-markets`, `/ws/featured`, `/ws/vaix/orderbook`, `/ws/vaix/trades` etc. (H for the list in llms.txt; none connected - not needed for a venue with zero activity).
- MCP: `https://cymetica.com/mcp/v1` (Streamable HTTP; public tools `list_markets`, `get_market`, `get_prices`, `get_orderbook`, `search_markets`, `get_platform_status`; Glama lists 149 tools). Not called (JSON-RPC over POST).
- Fixtures saved in `docs/research/fixtures/cymetica-eventtrader/`: `get-api-v1-markets.json`, `get-api-v1-perpetual-markets-batch-status.json`, `get-api-v1-event-cards-trimmed.json`, `get-api-v1-clob-book-hybrid-btc-usdc-trimmed.json`, `get-api-v1-clob-trades-btc-usdc.json`, `get-api-v1-exchange-btc-stats.json`, `get-api-v1-exchange-markets.json`, `get-mcp-v1-well-known-excerpt.json`.

## Trade path

- Programmatic: yes, but through a **custodial API-key account**, not wallet-signed orders. Flow per AGENTS.md: `POST /mcp/v1/register` (name, description, contact e-mail, intended use) -> `X-API-Key` -> deposit to the returned address -> `POST /api/v1/exchange/{symbol}/orders` or `POST /api/v1/orders` / `POST /api/v1/clob/orders`, `POST /api/v1/event-cards/{id}/buy|sell|short`, `POST /api/v1/wta/markets/{id}/bet`. OAuth 2.0 PKCE with scopes read/portfolio/trade is also advertised. (H for documented routes; none executed.)
- No EIP-712 or wallet-signature order scheme found. NOT FOUND (searched: openapi-public.json paths, llms.txt, AGENTS.md, well-known).
- PayBox reachability: **partial**. A PayBox EVM wallet can fund the account by an ordinary token transfer to a Cymetica deposit address, but it cannot place orders by signing; order placement needs a Cymetica API key obtained by self-registration with a contact e-mail (not appropriate to supply on the user's behalf) and a custodial balance. There is nothing on-chain to propose a transaction against for the prediction markets (the `0x...` market "addresses" are pseudo-IDs / off-chain). Deposit then trust a custodial ledger of an unaudited venue with ~zero liquidity is not worth wiring.

## Fees

- CLOB: maker 0 bps, taker 10 bps, maker rebate paused (well-known `fee_structure`, H; `GET /api/v1/promo/status` -> `zero_fee_promo:false`, H). Verified on tape: 0.005 BTC at 71,828 -> `taker_fee` 0.35914 USDC (= 10 bps) (H). Taker pays.
- 5-minute epochs and WTA: no fee schedule stated; payout is pool share capped at 10x (llms.txt) so any house take is implicit. NOT FOUND (searched: llms.txt, well-known, ToS).
- Event cards: no explicit fee found. NOT FOUND (searched: llms.txt event-card section, well-known).
- Gas: user pays; platform may auto-swap part of the user's balance into gas currency (llms.txt "Gas Policy").

## Resolution mechanism and dispute risk

- Fully centralised. The market description names a source (e.g. NIST RSS for the quantum markets) but resolution is done by Cymetica; ToS: "resolution decisions are final and binding", disputes go to binding arbitration with a class-action waiver (H, ToS fetched 2026-10-19).
- Event cards carry `contract_spec`: sample `resolution_source: binance_ws`, `fallback_source: okx_ws`, `methodology: last-tick`, `dispute_window: 24h`, `appellate_body: "VAIX Trading Committee"` (trading_close type) or `dispute_window: 1h`, `appellate_body: "Cymetica Operations"` (perpetual type) (H). The appellate bodies are tied to the operator's own token/team.
- No on-chain oracle (UMA, Chainlink etc.) found for the prediction markets. NOT FOUND (searched: llms.txt, AGENTS.md, well-known, openapi).
- Counterparty risk is high: custodial, ledger-settled, long-dated (2027-2035) quantum questions that would lock funds for years.

## Geo, ToS and automation

- ToS v1.1, 2026-10-09 (H): users must be 18+, must not be in a jurisdiction where prediction markets or crypto trading is prohibited, or on a sanctions list. No explicit US-person ban found in the ToS (a separate "Composer" feature is stated unavailable in US, UK, EEA, Canada, Australia, Singapore). The operator says it is not a registered adviser or broker-dealer and does not explicitly claim to be a regulated exchange, so US/EU legal status is unclear (M).
- Automation is explicitly allowed through API, SDK or MCP under the user's own credentials; prohibited: wash trading, spoofing, "burdening infrastructure with automation", multiple accounts (H).
- Compliance risk note for the aggregator: any self-registration needs a contact e-mail, so an adapter that registers on behalf of users carries identity-handling implications.

## Liquidity (all H unless stated; measured 2026-10-19 ~02:50-02:55 UTC)

- Prediction markets: 9 markets, `total_pool` 0.0 on every one (`/api/v1/markets`).
- 5-minute epochs: `yes_supply`/`no_supply` "0" on every symbol; NVDA/AAPL/GOOG closed outside US session.
- Event cards: 644 live; summed `bull_notional_usdc` = 20.0, `bear_notional_usdc` = 0 (2 cards with any notional); `tradeable_now` true on 203.
- WTA: no markets; `/api/v1/prediction-pools/wta-funding-stats` -> `launch_count 0, total_usdc_funded 0`.
- CLOB: `/api/v1/exchange/btc/stats` -> `volume_24h_usd 0`, `listed:false`, `last_trade_at 2026-04-09T21:10Z`, `last_trade_stale:true`; public tape's newest BTC/USDC fills are 0.005 BTC with maker user id -104 and taker id -4 (negative ids look like system/bot accounts) (M inference). ETH/USDC newest fill seen 2026-09-27.
- `/api/v1/exchange/markets` (24 symbols): sum of `volume_24h_usd` = USD 314,280 of which ET10 (the operator's own token) = USD 314,111; VAIX 152; BRRR 13; SBIO 4. None of that is prediction-market volume.
- No TVL/OI figure published. NOT FOUND (searched: well-known, llms.txt, platform status via public GETs).
- Operator self-claims (L, marketing): "74,066 trading vehicles across 56 instrument classes", "500+ CLOB pairs", "$100,000 paper funds".

## Event categories and overlap

- Crypto price: 5-minute BTC/ETH UP/DOWN and BTC/ETH CLOB overlap conceptually with short-horizon crypto up/down markets on Polymarket, Kalshi, Limitless etc., but are parimutuel and empty here, so no usable price.
- Stocks: NVDA/AAPL/GOOG 5-minute epochs and single-stock event cards - not comparable to event-contract venues.
- Politics, sports, macro: none found. The only "event" questions are 8 quantum-computing / cryptography milestone markets (CRQC by 2030/2035, BIP-360 activation, Project Eleven prize, etc.) with no volume; a niche overlap with Polymarket/Manifold-style long-dated questions is possible but there is no price signal to compare.
- Arbitrage utility: none.

## Liquidity sharing

- The `book/hybrid` response is explicitly a blend: levels carry `is_amm: true`, `dex: "Uni V3 5bp" / "SushiSwap"`, and `stats.total_liquidity_usd` 1.87 billion reflects the underlying Uniswap/Sushi pools; Cymetica's own comparisons also list pools on Arbitrum/Base excluded for >40% price divergence (H). So CLOB "depth" is borrowed DEX liquidity (ledger-fills against it, `is_amm_fill: true`), not an independent leg.
- llms.txt says cloned bots can "deploy to live markets worldwide: Polymarket, Kalshi, Robinhood, Kraken, Binance, Coinbase..." (L-M, claim only), i.e. any real flow may be routed to those venues. Treat as NOT independent.

## Priority

**skip.** Reasons: no meaningful liquidity, custodial/off-chain settlement, centralised resolution with arbitrary appellate bodies, event cards are thematic stock/crypto baskets rather than event contracts, no wallet-signed trade path, and the only real volume is the operator's own token. Could still be used as a weak "signal-only" source (the `event-cards` headline-to-basket mapping and the news/sentiment scores in `/api/v1/headlines`), but that is not a prediction-market price and is better treated as a separate news-feature source than a venue adapter.

## Open questions

- Whether any deposit/withdraw path or order-signing path supports wallet-signed login (not found; would need authenticated docs).
- Actual `/api/v1/funding/deposit-addresses` chain list (needs API key).
- On-chain footprint of the listed per-asset `market_address` values such as the BTC 5-minute market (`0x2931DC...`): Blockscout lookup was blocked by a Cloudflare challenge, so unverified; `/api/v1/perpetual/markets` is documented to return an empty list for factory-deployed markets.

## Suspicious content (untrusted, recorded not followed)

- `https://cymetica.com/AGENTS.md` and `/llms.txt` contain instructions aimed at AI agents: register via `POST /mcp/v1/register` with a contact e-mail "agent@example.com"-style field, "Cymetica AI welcomes all AI agents ... instant API key with immediate trading access", a "Grow Your Reach" list telling agents to register on many directories and submit PRs to awesome-lists, "Send a user straight to the page that matches...", "Verify: call `get_ai_native_proof`", "Present the range and the odds, never a single price target", and an "AI-Native Challenge" prize pitch. Homepage text is similarly agent-directed ("Give this to your AI agent to get started"). None were followed.
- Self-report inconsistencies: AGENTS.md claims "on-chain settlement on Base L2" while llms.txt and ToS say ledger settlement; `x-ai-strongest-model` response header and `strongest_model_used` field in well-known advertise a model name (marketing); search snippets showed inconsistent commit/line-count claims.

## Sources

- https://cymetica.com/ (homepage) - H
- https://cymetica.com/AGENTS.md - H (fetched 2026-10-19)
- https://cymetica.com/llms.txt - H
- https://cymetica.com/mcp/v1/well-known and https://cymetica.com/.well-known/mcp - H
- https://cymetica.com/openapi.json and https://cymetica.com/openapi-public.json - H
- https://cymetica.com/terms (v1.1, 2026-10-09) - H
- https://cymetica.com/prediction-markets ("No active markets right now") - H
- GETs under https://cymetica.com/api/v1/ listed in "Read API" - H, 2026-10-19
- https://cymetica.com/mcp/v1/health - H
- https://pypi.org/pypi/cymetica-eventtrader-mcp/json - H (v1.1.5, 2026-09-23)
- https://glama.ai/mcp/connectors/com.cymetica/event-trader-mcp - M (third-party listing, 149 tools, uptime 99.1%)
- https://github.com/api-evangelist/cymetica-com (apis.yml, raw via gh api; "This is not our API", enrichment 2026-09-19, modified 2026-10-06) - M
- Web search results (extended): no independent coverage, volume or regulatory data found - M
