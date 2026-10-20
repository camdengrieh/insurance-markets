# OrderbookTrade (orderbook.trade) venue spec

Date researched: 2026-10-19. Verdict: **skip** (not a venue; matching-engine vendor / market-making shop with no public live market data).
Tags: H = read first-hand this session in primary source, M = secondary/inferred, L = weak/stale.

## Summary
- Marketing site title and meta: "The Execution Layer for Prediction Markets"; "One API to trade, make markets, and provide liquidity across every prediction market. Built for AI agents, market makers, and platforms." [H, https://www.orderbook.trade/ HTML + JS bundle]
- Docs describe it as "the matching engine and liquidity infrastructure behind prediction markets", i.e. white-label CLOB-as-a-service for new L1/L2/prediction projects; the docs site calls itself a litepaper with performance targets, not measured results. [H, https://docs.orderbook.trade/orderbooktrade-litepaper.md]
- The site copy claims one SDK that routes orders to Polymarket, Rain, Seer "and more", and shows a "Live Market Making on Polymarket" card (market "US x Iran Ceasefire (May 31)", "production market-making bot running since March 2026"). [H, site bundle] No supporting API, docs or code for the routing/aggregation exists: the docs pages "Aggregation Architecture", "Integration Guide for AI Agents", "Agent Order Types", "Market Maker Integration", "OrderbookTrade SDK" are empty headings. [H, https://docs.orderbook.trade/llms.txt and each .md]
- Still live as a website (HTTP 200, docs and GitHub org active: last push 2026-05-29 on org repos; org created 2025-12-01). [H] The product itself has no confirmed live market: the demo app shows "Engine Offline / Postgres Disconnected". [H, https://app.orderbook.trade, cached ~17 days per Age header]

## Kind and market model
- kind: infrastructure vendor + market maker (not an independent exchange). [M]
- Binary YES/NO CLOB per market (orderbook snapshot has yes_bids/yes_asks/no_bids/no_asks, mid_price, last_price); docs also claim multi-outcome support. Order fields mention CTF token IDs (`token_id_yes`, `token_id_no`, `condition_id`), maker_amount/taker_amount uint256, signature_type, fee_rate_bps: this is a Polymarket CTF-Exchange-style schema. [H, OpenAPI at https://docs.orderbook.trade/developer/orderbooktrade-api-docs.md; M for the "Polymarket-derived" inference]
- Hybrid: off-chain Go matching engine, on-chain custody and batch settlement; "Escape Hatch" forced withdrawal after timelock. [H, https://docs.orderbook.trade/tech/how-it-works.md] Untested claims.

## Chains and collateral
- Docs: "Arbitrum, Solana, Monad, etc." as target settlement chains. [H, how-it-works] No deployed contract addresses, chain IDs or collateral token documented. NOT FOUND (searched: docs.orderbook.trade llms.txt pages, litepaper, API docs, GitHub org repos).
- Side repos: `orderbooktrade-yellow` (ETHGlobal HackMoney 2026 hackathon project on Yellow Network state channels) and `prediction-market-protocol` (generic Solidity module set, UMA/manual oracle adapters). [H, GitHub READMEs] Hackathon/template quality.

## Read API
- exists: official docs describe an API, but the OpenAPI `servers` entry is `http://localhost:8080/`, so no public base URL exists in docs. NOT FOUND (searched: docs, README of go-sdk, site bundle URLs: only app., docs., github, twitter, t.me). Guessed host api.orderbook.trade returns Railway 404 "Application not found". [H]
- Documented endpoints (self-hosted engine, v2.0.0): GET /health; GET /auth/nonce; POST /auth/login (EIP-712, JWT 24h); GET /v1/markets?status=; GET /v1/markets/{id}; GET /v1/markets/{id}/orderbook; /trades?limit=; /candles?limit=; /onchain-status; WS /ws (subscribe/unsubscribe, channels orderbook and trades, market_id); authenticated /v1/me/{balances,deposits,withdrawals,orders,positions,trades,deposit,withdraw}; POST /v1/orders, DELETE /v1/orders/{id}; admin: /v1/admin/{deposit,resolve,resolutions/{id}}, /bot/{start,stop,status}. [H]
- Market-data GETs appear unauthenticated in the spec. Rate limits: NOT FOUND.
- Go SDK exists (github.com/orderbooktrade/orderbooktrade-go-sdk). [H]
- No live response shapes could be confirmed; fixture saved only documents the 404 probe.

## Trade path
- Per spec: EIP-712 signed orders (Polymarket-style order struct: salt, maker, signer, taker, token_id, maker_amount, taker_amount, expiration, nonce, fee_rate_bps, side, signature_type) sent via POST /v1/orders; JWT via EIP-712 login for account endpoints. [H] Admin-only market creation/resolve use X-Admin-Key. [H]
- PayBox reachability: **partial/theoretical**. An EVM wallet could sign EIP-712 orders if PayBox exposes typed-data signing (request_wallet_sign), but there is no public deployment, deposit contract address or chain to target. [M] No SDK-free trade path is verifiable. paybox_reachable: unknown/partial.

## Fees
- NOT FOUND. Only: B2B "Revenue Share Model: a small basis point fee (bps) on trading volume"; order schema carries `fee_rate_bps`. [H, https://docs.orderbook.trade/build/cost-compration.md] "Zero gas" for order placement/cancel. [H]

## Resolution
- Admin-key `POST /v1/admin/resolve` with winning_outcome YES/NO/INVALID: centralised, operator-decided resolution in the reference engine. The prediction-market-protocol repo offers UMA optimistic or manual oracle adapters as options. [H] Dispute risk: high (operator discretion) for any OrderbookTrade-hosted market.

## Geo / ToS / automation
- NOT FOUND (searched: site, docs index, GitHub org). No ToS or restricted-jurisdiction page located. API is explicitly designed for bots/agents ("Agents as first-class citizens"). [H]

## Liquidity
- NOT FOUND. Docs cite no volume/OI/TVL. Case study ("$10M Volume in Month 1", "ProTrade Sports") is an unnamed hypothetical illustration, not data. [H/L] "Shared Liquidity Pool" is a pitch claim. The only concrete activity is the operator's own Polymarket market-making bot (since March 2026, self-reported). [H/L]

## Event overlap and shared liquidity
- Any real liquidity lives on Polymarket (per the site's own claims, routing target and MM activity) and Rain/Seer; OrderbookTrade would be a routing/execution layer over them, so it is **not an independent arbitrage leg**. [M] Own hosted markets: none verifiable.

## Adapter recommendation
- adapter_priority: skip. No public live endpoint, no confirmed markets, no liquidity data, aggregation claims unsubstantiated, and any liquidity is duplicative of Polymarket. Revisit only if a public base URL with live markets appears (check docs.orderbook.trade changelog, app.orderbook.trade "Engine" status). As a design reference only: its order schema equals Polymarket CTF-Exchange, nothing new to integrate.

## Suspicious content
- None directed at AI agents found. Docs header: "Markdown versions available by appending .md" (navigation hint only). Unsubstantiated marketing claims (100k+ TPS, $10M month-1 case study, "audited contracts") noted as unverified.

## Not searched / limits
- WebSearch budget exhausted at session level; no independent third-party coverage checked (Twitter/X, Telegram, DefiLlama). All claims are from the vendor's own materials.

## Sources
- https://www.orderbook.trade/ (HTML + /assets/index-DAQrk3Ia.js as text)
- https://app.orderbook.trade
- https://docs.orderbook.trade/llms.txt
- https://docs.orderbook.trade/orderbooktrade-litepaper.md
- https://docs.orderbook.trade/tech/how-it-works.md, /tech/order-process.md
- https://docs.orderbook.trade/developer/orderbooktrade-api-docs.md
- https://docs.orderbook.trade/build/cost-compration.md, /build/case-study.md
- https://github.com/OrderBookTrade (repos: orderbooktrade-api-docs, OrderbookTrade-go-sdk, orderbooktrade-yellow, prediction-market-protocol, OrderBookTrade)
