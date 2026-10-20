# Drazill - venue spec (researched 2026-10-19)

Verdict: SKIP. The docs describe a full exchange, but the operator's own homepage says "Waitlist only. No public product is available today." The public API serves seed/synthetic-looking data. Revisit only if the homepage changes.

## Liveness (is it a live venue?)
- H: https://drazill.com (fetched 2026-10-19): "Waitlist only · Founding list open ... No public product is available today. Joining does not guarantee access." The page describes "collecting public opinions and predictions ... aggregate statistics" and says "Waitlist research stays separate from any future trading product." Example questions are labelled "Concept preview".
- H: https://docs.drazill.com/documentation/compliance-regions : real-money trading is "available to verified Canadian residents", but "the exact launch province list is an owner/legal decision and is not finalized here". API terms are "PENDING LEGAL REVIEW ... not a binding agreement". "No SLA yet".
- H: GET https://api.drazill.com/api/v1/stats returns 404 `{"detail":"Public stats are disabled"}`; the docs (platform-stats) say the endpoint is behind a flag and "not switched on yet". `status.json` shows `monitoring_configured:false`, `history:[]`.
- H: https://api.drazill.com (production host) and https://staging.drazill.com return the same market data (same ETag; 2559 ACTIVE markets on both). Production is not showing a separate real dataset.
- H (inconsistency evidence): the first ACTIVE market has outcome price 0.4550 but order book best_bid 0.68 / best_ask 0.72, `total_shares` 10 against outcome volume 460,388, `total_liquidity` "0.00" everywhere, and per-market `total_volume` of 600-850k with `open_interest` of 0-400. Book levels are a uniform ladder (500/800/1100/1400/1700 at 0.02 steps). Trades have `buyer_id`/`seller_id` null and fees 0.0. M: this looks like seeded or simulated data, not organic trading.
- H: no news coverage found for "Drazill" (WebSearch extended, 2026-10-19). No regulator, CSA/CIRO registration, chain or company named anywhere.
- L: npm `drazill` 0.2.0 "Official alpha TypeScript SDK", created and last modified 2026-07-26; repo URL github.com/IshreetB/drazill returns 404 to `gh api` (private or removed).
- Still live? As an API: yes (reachable, HTTP 200). As a venue anyone can trade: no.

## Kind and market model
- H: centralized, off-chain, CAD-denominated exchange with a hybrid CLOB + LMSR-AMM engine; "a quote and a fill can never disagree" (docs/concepts/how-pricing-works). Market orders fall back to the AMM when the book is thin.
- H: market types `BINARY`, `MULTIPLE`, `SPORTS_GAME`, `CRYPTO_PRICE`; `SCALAR` defined but "not yet live" (docs/concepts/markets-settlement).
- H: outcomes are database rows (UUID `outcome_id`, `price` decimal string in [0,1], prices sum to 1). There is no on-chain tokenisation.
- H: complete-set redemption: a full set is redeemable for $1 (docs/concepts/complete-set-redemption).

## Chains and collateral
- H: none on-chain. Money is CAD (`_cents` fields are "in Canadian dollars"; winning share pays CAD 1.00). The homepage CSP lists Stripe, so deposits are presumably fiat. No crypto deposit path found: NOT FOUND (searched docs index llms.txt, compliance, authentication).

## Read API
- Exists: official-public for market data (no key), authenticated for trading.
- H docs: https://docs.drazill.com (Fern site; `.md` suffix per page; index https://docs.drazill.com/llms.txt; MCP at https://docs.drazill.com/_mcp/server, not used).
- Base URLs (H): prod `https://api.drazill.com/api/v1`, `wss://api.drazill.com/ws`; staging `https://staging.drazill.com/api/v1`.
- Key endpoints (H, docs/concepts/market-data; first three confirmed live with unauthenticated GET):
  - `GET /markets?status=ACTIVE&limit=50&sort_by=total_volume` (envelope `items,total,page,limit,pages`; limit max seems 50). Also `/markets/cursor`, `/markets/{id}`, `/markets/slug/{slug}`.
  - `GET /orders/book/{outcome_id}?depth=5` -> `{outcome_id,bids[{price,quantity,num_orders}],asks[...],spread}`.
  - `GET /markets/{id}/trades?limit=3`, `/trades/cursor`, `/markets/{id}/price-history`, `/markets/{id}/ohlc` (the last three not called).
  - `GET /status.json`; `GET /stats` (disabled, 404).
- Doc drift (H): the docs quickstart uses `sort_by=volume`, which the live API rejects (422; allowed: total_volume, created_at, closes_at, num_traders, quality, updated_at, change_24h, volume_24h, spread, total_liquidity).
- Auth and limits (H, docs/rate-limits-quotas): public reads need no key, per-IP `markets` bucket 600/min (live header `x-ratelimit-limit: 600`). Keys: FREE 60/min and 1,000/day; PRO 600/min; ENTERPRISE 6,000/min. WebSocket feed exists (not tested). Historical export, premium realtime feed and bulk datasets are separate licensable "data products" (not read in depth).

## Trade path
- H: REST `POST /orders` (60/min), batch (10/min, up to 20 legs), `POST /orders/quote`, amend/cancel; advanced orders (bracket, TWAP, etc.). Auth is a single header `X-API-Key` (`drzl_live_` real money, `drzl_test_` paper), optional per-key HMAC-SHA256 (`X-Drazill-Timestamp`, `X-Drazill-Signature: v1=...`). "no wallet to connect, no EIP-712 payloads."
- Real-money orders require a KYC-verified Canadian-resident account passing the gate sequence KYC -> sanctions -> age -> province -> terms -> responsible gaming -> geo (H, compliance-regions). Fails closed.
- I did not create keys or call any authenticated endpoint.

## PayBox reachability
- No. There is no on-chain settlement, no wallet signature path, and funding is by KYC'd CAD fiat rails. An EVM/Solana wallet in PayBox cannot trade it via transaction proposals or signed orders. A PayBox card/x402 route is not documented either (NOT FOUND). Paper keys could be used only for dry-run testing of an adapter, and require creating an account (out of scope here).

## Fees (H, docs/concepts/fees)
- Percent of traded notional, by 30-day CAD volume tier: Bronze 1.00% maker / 2.00% taker; Silver (>=1k) 0.80/1.50; Gold (>=10k) 0.50/1.00; Platinum (>=50k) 0.20/0.50; Diamond (>=250k) -0.05/0.30. Per-market/category schedules and promos exist (feature-flagged). The docs warn that fills are still priced from the volume tier. Observed trade tape shows fees 0.0 (H, fixture).

## Resolution
- H: lifecycle DRAFT -> PENDING -> ACTIVE -> CLOSED -> RESOLVED, plus CANCELLED (refund) and DISPUTED. "Resolution is dual-controlled and evidenced on the platform side" - i.e. operator-resolved, centralized. Disputes can change the outcome and re-run payouts. Some markets show `auto_resolve_enabled` and `external_provider` (ESPN, API-Sports, CoinGecko are named in the redistribution section). Dispute and counterparty risk: high (single unregulated-as-far-as-known operator).

## Geo / ToS / automation
- H: Canadian residents only; province allow-list not published. API terms are an unapproved draft; terms acceptance for keys "not enforced". Market-data redistribution limits: provider-sourced markets excluded from exports until cleared. Programmatic trading via API keys is the intended use (it is an API-first product), but nothing is open to non-Canadian or non-KYC'd users.

## Liquidity
- H (2026-10-19, API): 2,559 ACTIVE markets; top 50 by volume sum `total_volume` about 32.2M (unit presumably CAD), but `total_liquidity` is "0.00" and open interest is 0-400 per market. M/L: figures are not credible as real traded volume (see liveness). Official stats endpoint is disabled, so no verified volume/OI/TVL. Treat as zero real liquidity.

## Event overlap (would matter only if real)
- Categories seen (H): ETH price, US governors, S&P 500, UK election, FDA approvals, NFL/NBA/MLB, Canadian economy (BoC), Olympics. These overlap Polymarket/Kalshi (sports, politics, crypto, macro), but quotes here are not tradable by an outside agent and not credible, so they have no arbitrage value.
- Liquidity shared with another venue: none documented (own AMM + book). Not an independent leg anyway since nobody can trade it.

## Adapter priority: skip
Reasons: waitlist-only, KYC/Canadian-resident gating, fiat-only, no wallet path, seed-looking data, stats endpoints disabled. Possible later use: P2 signal-only read adapter if it launches; the public read API is clean and documented, so the cost to add is small (poll `/markets` and `/orders/book/{outcome_id}`).

## Open questions
- Who operates Drazill and under which regulator/registration? (not named anywhere)
- Does production hold real data distinct from staging after launch?
- Whether the unauthenticated market endpoints will stay public after launch.
- GitHub repo IshreetB/drazill is 404; SDK source cannot be inspected.

## Suspicious content
- None found in docs. The docs contain an "Instructions for AI Agents" section in llms.txt (append `.md`, connect to the MCP server); this is benign navigation advice and was not acted on beyond fetching `.md` pages.

## Fixtures (public unauthenticated GETs, UA `insurance-markets-research/0.1`, 2026-10-19)
- docs/research/fixtures/drazill/markets-list-limit2.json
- docs/research/fixtures/drazill/orders-book-depth5.json
- docs/research/fixtures/drazill/market-trades-limit3.json
- docs/research/fixtures/drazill/status.json

## Sources
- H https://drazill.com (homepage, waitlist-only)
- H https://docs.drazill.com/llms.txt
- H https://docs.drazill.com/documentation/quickstart.md
- H https://docs.drazill.com/documentation/authentication.md
- H https://docs.drazill.com/documentation/concepts/fees.md
- H https://docs.drazill.com/documentation/concepts/markets-settlement.md
- H https://docs.drazill.com/documentation/concepts/market-data.md
- H https://docs.drazill.com/documentation/concepts/paper-vs-live.md
- H https://docs.drazill.com/documentation/compliance-regions.md
- H https://docs.drazill.com/documentation/rate-limits-quotas.md
- H https://docs.drazill.com/documentation/platform-stats.md
- H https://docs.drazill.com/documentation/status.md
- H https://api.drazill.com/api/v1/markets, /orders/book/{id}, /markets/{id}/trades, /status.json, /stats
- L https://registry.npmjs.org/drazill (alpha SDK 0.2.0, 2026-07-26)
- M WebSearch (extended) "Drazill prediction market Canada launch": no mentions of Drazill; Canadian context only.
