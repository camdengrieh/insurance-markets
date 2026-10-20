# GoMarket (gomarket.io) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

- Live but tiny: a Solana LMSR-AMM prediction market with USDC collateral, one open published-looking event (about $3.0k lifetime volume) and one cancelled event. [H]
- Official docs: none found. No public repos, no developer docs, no OpenAPI. The only API is the site's own backend (`prod-api.gomarket.io`), which is undocumented. [H]
- Adapter priority: **skip** (revisit if volume grows). At most P2 signal-only.
- Identity caveat [M]: the GitHub org `gomarketx` (created 2026-04-09, 0 public repos, no website listed) says "Building GoMarket, a global prediction market platform". I matched it to gomarket.io by name and product description only. Nothing on gomarket.io links to `gomarketx`, and the org links to no site. Treat the match as probable, not proven.

## Sources

1. https://github.com/gomarketx and `gh api orgs/gomarketx` - org description, created 2026-04-09, updated 2026-04-17, 0 public repos, no blog field. [H]
2. https://gomarket.io (HTML head and manifest) - title "GoMarket | Predict Anything"; description "next generation prediction market platform ... Explore, trade, and participate in markets across real world events". [H]
3. https://gomarket.io/assets/index-CjOTG48J.js - the site's public frontend bundle (3.1 MB, untrusted data, only grepped; not executed). Contains API route names, the Anchor IDL of the on-chain program, Privy auth usage, social handles. [H for what the bundle contains; M for what is deployed on-chain]
4. https://prod-api.gomarket.io/api/markets/events/ and `/api/markets/events/trending/` - unauthenticated GETs on 2026-10-19, HTTP 200. [H]
5. https://gomarket.com - "Premium Domain For Sale" (unrelated). Other guessed domains (gomarket.xyz, gomarket.app) had no relevant content. [H]
6. Not usable: WebSearch budget was exhausted in this session, so no third-party coverage (Twitter, news, DefiLlama) was checked. Solscan returned 403.

## Kind and market model

- On-chain Solana program built with Anchor, name `high_market_program` v0.1.0, address in the IDL `4Pe4r9FpaAtdU2fkyVLgNSKqhULXs6udKvDZf7Wm1yVE`. [H that the bundle declares it; M that it is the mainnet deployment, not verified on-chain]
- Binary YES/NO markets plus multi-outcome "events" made of several binary markets (event_type `multi`, one winner market per event). [H]
- AMM, not an order book. API field `venue: "amm"`. Create instructions take a liquidity parameter `b` and `initial_liquidity`, which indicates LMSR (logarithmic market scoring rule). [M for LMSR; H for `b` and `amm`]
- Trading is by share quantity: `buy_shares(outcome, shares, max_cost)` and `sell_shares(outcome, shares, min_payout)`. Outcomes are tracked as per-user position accounts, not tradable SPL tokens (a `close_position` instruction reclaims rent on a "user position account"). [H from IDL; M on token vs. account]
- Prices in the API sum to 1: `price_yes` + `price_no` = 1 (e.g. 0.014565 + 0.985435). [H]

## Chains and collateral

- Solana. USDC collateral (instructions say "Buy YES or NO shares using USDC"; the dispute bond is in USDC, example 50 USDC). [H from IDL docs]
- Auth and wallets via Privy (embedded wallets, external Solana wallets such as Phantom, Backpack, Solflare, OKX). The bundle also carries many EVM chains because of the Privy SDK, but markets are Solana (market `on_chain_address` values are base58). [H]
- Gas sponsorship: `/api/markets/sponsor-tx/` takes a Privy token and wallet address and returns a signature, so the backend co-signs/pays fees. [M, inferred from client code]

## Read API

- Exists: **unofficial-only** (the site's own backend; no docs). Auth for GET list endpoints: none needed. The frontend sends a static `x-api-key` header and Bearer JWT for user routes; I did NOT use or record the key, and the unauthenticated GETs worked without it. [H]
- Base URL: `https://prod-api.gomarket.io` (Django REST style, Cloudflare in front, `allow: GET, HEAD, OPTIONS`). [H]
- Docs URL: NOT FOUND (searched: /docs and /openapi.json on the API host return 404; gomarket.io has no docs link; no GitHub repos).
- Endpoints seen in the bundle (only the first two were called): [H for existence in the client, H for the two called]
  - `GET /api/markets/events/` - paginated (`count`, `current_page`, `total_pages`, `results`), events with nested `markets`. Confirmed.
  - `GET /api/markets/events/trending/` - `{"status":"success","data":[]}` (empty on 2026-10-19). Confirmed.
  - `GET /api/markets/events/{id}/`, `/api/markets/search/?q=`, `/api/markets/search/markets/`, `/api/markets/activity/`, `/api/markets/leaderboard/`, `/api/markets/parlay-suggestions/` - public-looking, not called.
  - User routes (need login, not called): `/api/markets/user/portfolio/`, `/api/markets/user/claimable/`, `/api/user/request-claim/`, `/api/user/claim-requests/`, `/api/markets/sponsor-tx/`.
- Key response fields per market: `market_id`, `on_chain_address`, `question`, `status` (open/cancelled/...), `is_tradable`, `price_yes`, `price_no`, `total_volume`, `end_time`, `last_trade_at`, `winning_outcome`, `proposed_outcome`, `dispute_window_end`, `dispute_bond`, `disputer_address`, `settlement_information`. Event fields: `liquidity_param`, `initial_liquidity`, `on_chain_event_id`, `winner_market_id`, `total_volume`, `is_published`. [H]
- Order book / depth: none (AMM). Quote must be computed from LMSR state (`b` and share counts held in the on-chain Market account) or by simulating `buy_shares`. Trade history: only `/api/markets/activity/` (not called) or on-chain events (the IDL emits events such as EventResolved, FeeBpsChanged, FeesWithdrawn). [M]
- Rate limits and websocket: NOT FOUND (searched: response headers show no rate-limit headers; no websocket URL in the bundle grep).
- Fixtures saved (real unauthenticated responses, 2026-10-19):
  - `docs/research/fixtures/gomarket-gomarket/events-list.json` (42 KB)
  - `docs/research/fixtures/gomarket-gomarket/events-trending.json` (30 B)

## Trade path

- Programmatic path exists in principle: the Anchor program accepts `buy_shares` / `sell_shares` signed by the user's Solana wallet, with slippage guards (`max_cost`, `min_payout`). Anyone could build the transaction from the public IDL. [H for IDL; no program verification on-chain]
- No official SDK, no REST order endpoint. Frontend flow is Privy-authenticated and uses backend sponsorship. [M]
- PayBox reachability: **partial**. Only a Solana wallet reachable through PayBox could trade, via a transaction-proposal that calls the program (needs the IDL-derived instruction, USDC ATA, PDAs). No EVM route exists. Whether PayBox can propose arbitrary-program Solana instructions is a PayBox question, not answered here. [M]

## Fees

- A protocol fee in basis points is configured on-chain: `fee_bps` (IDL doc example "200 = 2%"), paid into a PDA treasury; admin can change it via a 48h-timelocked config update and withdraw fees. Actual live value: NOT FOUND (needs Config account read, which requires Solana RPC; I did not make RPC calls because they are POST). [H for existence, L for the 2% example]
- Who pays: trader (fee goes to treasury). Exact formula (on cost, payout, or both): NOT FOUND.
- LMSR also implies slippage proportional to size/`b`. Max loss to the market maker is bounded by `initial_liquidity`-funded `b`. [M]

## Resolution mechanism and dispute risk

- Centralised propose, then optimistic dispute window (from IDL, [H]):
  1. Admin/resolver proposes an outcome (`resolve_market` "admin only", or `resolve_event` for the multi-outcome event, which propagates per market via the permissionless `resolve_market_for_event`).
  2. Dispute window (configurable up to 30 days; example 48h). Anyone can `dispute_resolution` by posting a USDC bond (example 50 USDC).
  3. `finalize_resolution` is permissionless after the window. The IDL notes admin can re-resolve a disputed market with a different outcome.
- No decentralised oracle (no UMA/Pyth shown in the IDL). The admin/resolver key is the trust root. Admin can also cancel a market (users then refund) and `withdraw_vault_residual`. Config changes are timelocked 48h. The IDL mentions "audit finding #12 / #22" so some audit exists; report not found. [M]
- Dispute risk: high key-person risk; subjective resolution wording is short (`description` often empty in the fixture). Example of operational risk: event 11 (World Cup continent) is `cancelled` with all markets at 0.5 and zero volume. [H]

## Geo, ToS, automation

- NOT FOUND (searched: gomarket.io HTML and bundle for terms/restricted-jurisdiction strings; nothing located; the legal pages are in the SPA and were not fetched). Treat as unknown. No documented stance on bots or API use. The static `x-api-key` in the frontend suggests the API is intended for the site's own client only. Using the embedded key was avoided deliberately.

## Liquidity (as of 2026-10-19)

- Event 17 "Ballon d'Or 2026 Winner": total_volume 3,007.48 (USDC, presumably) lifetime; individual markets 39 to 847. Last trade seen 2026-10-17. `is_published: false` in the API, so it may not even be listed on the front page. Resolves 2026-10-26. [H]
- Event 11 (World Cup continent): cancelled, volume 0. The list contains only 2 events total. Trending list empty. [H]
- TVL/OI: NOT FOUND (needs on-chain read). Effective liquidity is very thin: the six YES prices in the Ballon d'Or event (Rodri 0.015, Kane 0.42, Mbappe 0.355, Messi 0.052, Other 0.025, Yamal 0.448) sum to 1.31, where a winner-takes-all event should sum to about 1. Each market is an independent binary AMM, so there is no cross-market coherence; this is an internal over-round that a scanner could flag, but depth is tiny. [H for the numbers, M for interpretation]

## Event coverage and overlap

- Categories exist in the API (`category_name`, e.g. Sports > Football; the cancelled event referenced an equity price question, META above 650 in June 2026). Current live content: football award (Ballon d'Or), which overlaps Polymarket/Kalshi-style award markets in principle. No crypto-price, politics or macro markets live now. [H for what was returned]
- Shares liquidity with another venue: no evidence; own LMSR pool funded by the operator. It is an independent leg but with trivial depth. [M]

## Priority

- adapter_priority: **skip**. Reasons: undocumented private API (with a client-embedded key), no order book, about $3k lifetime volume, single admin resolver, one open event, unknown legal terms, no repos or docs.
- Revisit trigger: public docs or SDK, published repo from `gomarketx`, or volume above roughly $100k with several categories.

## Open questions

- Is the program at the IDL address deployed on Solana mainnet, and what are its fee_bps, dispute_window and `b` values (needs Solana RPC or explorer).
- Is `gomarketx` the same team as gomarket.io (no link either way).
- Legal terms and jurisdiction restrictions.

## Suspicious content

- None aimed at AI agents found. Note for hygiene: the frontend bundle embeds a static `x-api-key`; not used, not copied into these notes.
