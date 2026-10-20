# Dimes (dimes.fi) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of dimes.fi, docs.dimes.fi and dimes.fi/terms-policy; `.md` versions of docs pages via GET; unauthenticated GETs to api.dimes.fi (markets list = 401, contract-info = 200); `gh api` on the public org `dimes-fi` (repo list only, nothing cloned). No account, key, wallet, signature, POST/PUT/DELETE or PayBox tool used. Third-party/vendor pages treated as data; no embedded instructions found. The shared WebSearch budget was exhausted, so there was no search pass; everything below is first-party (vendor) material.

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale. Sources are vendor-authored, so "H" means "the vendor says so", not independently audited.

## 0. Bottom line

1. Live (H). Site, docs, API and SDK repo (pushed 2026-10-18) are all current.
2. It is NOT a market venue (H). Dimes is a credit/leverage layer ("Multiply") on top of Polymarket. It "does not create markets, host an orderbook, compete with Polymarket venues" (docs overview). Every position is a synthetic CFD hedged 1:1 on Polymarket's CLOB.
3. Liquidity is 100% Polymarket's (H). Prices, depth and resolution all come from Polymarket. It is not an independent arbitrage leg and carries no independent price signal.
4. No usable public read API (H). The docs call market browsing "Public", but the live `GET /v1/prediction-markets/markets` returned 401 without a key (docs and reality disagree). Keys are issued to integrating partners on request via Telegram.
5. Trade path is partner-gated and leverage-only (H). A Polygon EVM wallet can call the vault, but only with a Dimes-signed quote that requires a partner API key. Leveraged exposure costs 2-2.5% entry plus ~18-20% APR on borrowed capital: strictly worse than trading Polymarket directly for any arbitrage purpose.
6. adapter_priority = skip.

## 1. Live status

| Evidence | Result | Tag |
|---|---|---|
| https://dimes.fi | Describes "embedded leverage infrastructure for prediction market front-ends". Leverage live; Smart margin "Coming soon"; named partners Kreo, Preddy, SuperPumped, Olympus, Ares, Stride; backers Strobe, White Star Capital, Coinbase Ventures, Accel | H |
| https://docs.dimes.fi/llms.txt | 200, full doc index; sandbox/prod environments documented | H |
| `GET https://api.dimes.fi/v1/prediction-markets/contract-info` | 200 (2026-10-19), returns the production vault | H |
| github.com/dimes-fi: `dimes-sdk` pushed 2026-10-18, `dimes-demo-ui` pushed 2026-10-15, `.github` 2026-07-09 | Active | H |
| Quickstart example timestamp `2026-04-16` | Docs written/maintained since at least April 2026 | M |

Verdict: still_live = true.

## 2. Kind and market model

- Kind: leverage / credit middleware (B2B) for Polymarket front-ends. "Dimes extends credit from its Underwriting Facility and handles margining, hedging, and liquidations" (site). Docs: "Multiply acts as an aggregation and risk management layer rather than a replacement trading surface" (cfd-abstraction). H.
- Market model: synthetic Contract-for-Difference on binary and "simple categorical" Polymarket markets. `CFD PnL = (P_now - P_entry) x Leverage x Size`, bounded to the 0-1 range (docs cfd-abstraction). No order book of its own. H.
- Outcome tokenisation: positions are on-chain records in `LeveragedPredictionVaultV1` on Polygon. Underlying exposure is held as Polymarket CTF (ERC-1155 conditional) tokens that Dimes buys as the hedge (contract-addresses lists the "Polymarket CTF" and says the vault takes "position tokens in"). Market identifiers expose Polymarket `condition_id`, `yes_token_id`, `no_token_id` and `slug` (api-reference sample). H.
- Eligibility: markets from category "no jump-to-settlement" or "short, defined jump window" are supported (e.g. S&P close, Fed meeting); unpredictable-resolution markets (e.g. court confirmations) are not (docs supported-markets). Hazard-window deleveraging is mandatory (J-factor). H.
- Venues: docs say Polymarket only ("Future integrations may include Kalshi, Opinion, Hyperliquid, and Limitless"). The Terms page says eligible markets "must trade on Kalshi or Polymarket" and that Dimes hedges on Kalshi and Polymarket. Docs and Terms disagree; the API `provider` filter lists only `polymarket`. Treat Kalshi as not live. H for each statement, conflict flagged.

## 3. Chains and collateral

- Chain: Polygon mainnet, EVM chain id 137 (H, contract-addresses + live contract-info).
- Collateral and settlement: pUSD (Polymarket USD) at `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`. The site says "USDC-settled"; the contract-info field is named `polygon_usdc_token_address` but holds the pUSD address. H.
- Vault `LeveragedPredictionVaultV1`: `0xECF933ccDf7ebc6a0658c77E070cFe51ebe5328A`; Polymarket CTF `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`; quote signer `0x2bdeA27111B606551a1D3c19c0e8c73e0081ecBA` (all from the live public `contract-info`, fixture saved). H.
- Sandbox is also on Polygon mainnet with test pUSD and a fake CTF; the sandbox vault differs. H.

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Exists | Official, partner-authenticated (not public) | H |
| REST base | `https://api.dimes.fi/v1` (prod); `https://api-sandbox.dimes.fi/v1` (sandbox) | H |
| Docs | https://docs.dimes.fi/for-developers/api-and-events/api-reference.md ; Swagger UI `https://api.dimes.fi/v1/customer-docs` (HTTP 200); OpenAPI JSON at `https://api.dimes.fi/v1/customer-docs-json` (HTTP 200, not read in detail) | H |
| Auth | Two tiers: partner API key (`Authorization: Api-Key dm_live_skey_...`) mints 1-hour user JWTs (`POST /prediction-markets/tokens` with `wallet_address`); JWT used as `Bearer`. Keys "issued by the Dimes team on request" via Telegram | H |
| Public access | Docs' auth table lists "Public: Market browsing" and the quickstart shows `curl .../markets` with no header; the live endpoint returned HTTP 401 `AUTHENTICATION_ERROR` for `/markets`, `/markets?limit=2`, `/events/x/markets`, `/fee-rates` on 2026-10-19. The endpoint reference itself says "Auth: User JWT or partner API key". Only `/contract-info` was open | H |
| Rate limits | API key 120 req/min per partner; JWT 60 req/min per wallet; unauthenticated 30 req/min per IP; `/tokens` 1800/min; headers `X-RateLimit-*`, `Retry-After` on 429 | H |
| WebSocket | Socket.IO. Partner gateway `wss://api.dimes.fi/v1/ws/prediction-markets/positions` (API key, all partner positions); user gateway `/v1/ws/prediction-markets/user-positions` (JWT). Position events (`position.opened`, `position.closed`, ...) plus a `MarketSocket` in the SDK. Position-lifecycle data, not a public price feed | H |
| Key endpoints | `GET /prediction-markets/markets` (filters: query, category, provider, status active/closed/determined/finalized/disputed, sort incl. `depth_desc`; `expand=prices`), `GET .../markets/{ticker}`, `.../events/{event_ticker}/markets`, `.../series/{series_ticker}/markets`, `GET .../contract-info`, `POST .../quotes`, `.../draft-quotes`, `.../promoted-quotes/{id}`, `GET .../positions` (+ unwinds, transactions, partial-closes), `.../partner-limits`, `.../user-limits`, `.../fee-rates`, `POST .../fee-reports` | H |
| Market payload | Includes Polymarket `slug`/`condition_id`/`yes_token_id`/`no_token_id`, `category`, `event`, `close_time`, `leverage` caps, `fees`, per-side capacity caps and `prices` (yes/no bid/ask) | H (from docs sample; live shape NOT confirmed because of the 401) |
| SDK | `@dimes-dot-fi/sdk` (github.com/dimes-fi/dimes-sdk, viem builders, React hooks) | H |

Aggregator note: the only price data Dimes exposes is Polymarket's own bid/ask relayed through an auth wall. There is nothing here to add that the Polymarket adapter does not already supply. Useful side-signals (M, speculative): partner-level open interest and leverage caps per market could proxy demand, but they require a partner key and no public aggregate exists.

## 5. Trade path

- Programmatic, but only via a partner key (H). Flow: (1) partner backend mints JWT; (2) `POST /prediction-markets/quotes` returns a firm, signed, expiring quote; (3) wallet approves pUSD to the vault; (4) wallet calls `createPosition()` on the vault with the signed quote; (5) backend detects the event, hedges on Polymarket first, finalises on-chain; (6) `requestClose()` / `requestPartialClose()` to exit. Close is also on-chain.
- Signing scheme: server-side authority key signs the quote hash (verify signer equals `polygon_signer_address`); user wallet only sends ordinary EVM transactions (approve + createPosition), so no off-chain order signing by the user. Smart-contract wallets (Polymarket Safe, Proxy, Deposit Wallet), Privy and Turnkey wallets supported; `wallet_address` must equal `msg.sender`. H.
- PayBox reachability: partial (M). A Polygon EVM wallet reachable through PayBox could send the approve and createPosition transactions as proposals, but quotes require a partner API key that is not self-serve, so the plugin cannot start the flow alone. Even if it could, this is a leveraged CFD, not an arbitrage leg.

## 6. Fees (H)

- Entry fee: `Collateral x Leverage x f_entry`, f_entry 2.0-2.5% scaled with leverage (fees page). The API sample in the reference shows 1.00/1.25/1.50% tiers (sample, may be illustrative). Terms say 2.0-2.5%. Conflict flagged.
- Time fee: `BorrowedCapital x f_time x elapsed`, `BorrowedCapital = Collateral x (Leverage - 1)`; fees page says 0.05% per day, API field `lifetime_fee_apr_bps` sample 2000 (20% APR) and Terms say 20% APY. 0.05%/day = 18.25% APR: minor discrepancy, flagged.
- Liquidation fee: 10% of protocol-provided capital (fees page) vs "10% of remaining equity" (Terms); API sample shows 250 bps. Conflict flagged.
- External: Polymarket taker fee on the hedge trades (surfaced as `polymarket_trading_fee_bps`), plus any front-end/builder fee and gas. All paid by the user out of collateral. Partners add their own origination fee on incremental volume (site).

## 7. Resolution and dispute risk

- Settlement is by the underlying venue: Polymarket CTF resolution (UMA oracle, per the Polymarket adapter research; not re-verified here). Dimes: "Settlement at resolution is handled by the underlying venue" (Terms). Dimes redeems tokens and distributes pUSD on-chain. H for the Dimes statement, M for UMA.
- Extra risks layered on top: counterparty risk on Dimes (Terms: "Dimes is the counterparty ... holds operational control of positions"), automatic liquidation with no warning or grace period, mandatory deleveraging before hazard windows, close-only mode when a market becomes ineligible, circuit breakers during venue outages. Delayed or corrected Polymarket resolutions are passed through to PnL (docs position-management). Max loss is posted collateral. Market status enum includes `disputed`. H.
- Liquidation proofs published on-chain (docs); no audit report found. NOT FOUND (searched: docs index, dimes.fi, GitHub org repo list; no search engine available).

## 8. Geo / ToS / automation

- Geo: the Terms "do not mention geographic restrictions" beyond complying with local law; front-ends handle user verification (WebFetch summary of /terms-policy, M). Underlying Polymarket geo rules presumably still apply (see Polymarket spec).
- Automation: Terms silent on bots/API; the product is explicitly for programmatic partner integration and offers a CLI for AI trading agents (site: `dimes portfolio|quote|credit|repay`). The CLI is not in the public docs index (NOT FOUND, searched: llms.txt, github.com/dimes-fi repo list). H/M.
- Governing law BVI; LCIA arbitration in London. "Most leveraged traders lose money" (Terms s.11.9, quoted). H.
- Access requires an Integration Agreement (`/legal/integration-agreement`, not read).

## 9. Liquidity

- Own volume/OI/TVL: NOT FOUND (searched: dimes.fi, docs index, Terms; no public stats page or API). The docs claim an Underwriting Facility able to underwrite "$50m+ in monthly volume" (docs overview, vendor claim, undated, L-M) and the site claims "#1 most integrated leverage provider across Polymarket front-ends" (vendor claim, H as a statement, unverified).
- Market liquidity is Polymarket's CLOB. Dimes adds none that is independently priced.

## 10. Event-category overlap

Same as Polymarket (crypto price, macro/Fed, indices, sports, politics) because every market is a Polymarket market; the doc examples are S&P close and Fed meeting. Unpredictable-resolution political questions are excluded. Overlap with other venues exists only through Polymarket, so it adds no arbitrage legs.

## 11. Shared liquidity

Shares 100% with Polymarket (H). Not independent. Kalshi hedging is mentioned in the Terms only (conflict noted in section 2).

## 12. Adapter recommendation

skip. Duplicate liquidity, no public data, partner-gated trading, leveraged and costly. Revisit only if (a) Dimes opens an unauthenticated aggregate-stats endpoint or (b) Kalshi routing becomes real and it publishes cross-venue basis data. Do not build a trade adapter. If a Polymarket front-end integration (builder code) is ever planned, Dimes is a possible add-on for leverage, not a venue.

## Open questions

- Which of Terms vs docs fee numbers is current (entry 2.0-2.5% vs 1.0-1.5% sample; time fee 0.05%/day vs 20% APR; liquidation fee base).
- Whether `/markets` is intended to be public (docs say yes, live says 401).
- Whether Kalshi hedging is live.
- Total volume / TVL of Multiply.

## Fixtures (docs/research/fixtures/dimes/)

- `contract-info.json`: live unauthenticated response of `GET https://api.dimes.fi/v1/prediction-markets/contract-info` (public vault/token/signer addresses).
- `markets-unauth-401.json`: shape of the 401 error returned for unauthenticated market-list requests (trace id redacted).

## Sources

- https://dimes.fi (H)
- https://dimes.fi/terms-policy (H, via small-model summary)
- https://docs.dimes.fi/llms.txt (H)
- https://docs.dimes.fi/overview/readme.md , /overview/supported-markets.md , /overview/position-management.md (H)
- https://docs.dimes.fi/positions/position-lifecycle.md , /positions/fees-and-revenue-share.md , /positions/cfd-abstraction.md , /positions/integration-with-front-ends.md (H)
- https://docs.dimes.fi/leverage-and-risk/liquidation-trigger.md , /liquidation-proofs.md (H)
- https://docs.dimes.fi/for-developers/getting-started/quickstart.md , /environments.md (H)
- https://docs.dimes.fi/for-developers/api-and-events/authentication.md , /api-reference.md , /websocket.md (H)
- https://docs.dimes.fi/for-developers/wallet-integration/contract-addresses.md , /on-chain-integration.md (H)
- https://api.dimes.fi/v1/prediction-markets/contract-info (H, live GET 2026-10-19); /markets etc. (401)
- https://api.dimes.fi/v1/customer-docs (HTTP 200 only, content not read)
- github.com/dimes-fi (org repo list: dimes-sdk, dimes-demo-ui, .github) (H, metadata only)
