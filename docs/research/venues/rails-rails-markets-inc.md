# Rails (Rails Markets, Inc.) - venue spec

Researched 2026-10-19. Verdict: SKIP. Rails is a crypto perpetuals and options derivatives exchange infrastructure, not a prediction market. No event/binary/outcome markets found anywhere in its docs.

## Summary
- Kind: derivatives exchange (perps + options), "compliance-first derivatives infrastructure" for partners; not a prediction-market venue or frontend. [H]
- The "prediction-market link" came only from the Bransfield tracker, which lists "Rails Markets, Inc d/b/a Rails - perpetual trading platform - NFA ID 0570586" under "Registered Introducing Brokers intermediating prediction-market contracts". The row gives no status and no prediction-market detail. [H, tracker row read; the heading's implication is unverified]
- rails.xyz landing meta: "lightning-fast crypto perpetuals trading". [H]
- Docs (docs.rails.xyz): "Rails is a compliance-first derivatives infrastructure platform. It lets partners offer perpetuals and options across diverse asset classes through a single API integration." Only Perpetuals and Options products. [H]
- Liveness: marketing site and docs are up (HTTP 200). Docs say Production base URL "Coming soon"; only Sandbox (https://sandbox.rails.xyz) is documented; changelog says "we're getting ready for launch". Docs may be stale vs. a separate US launch reported in June 2025 press (Fortune/Yahoo, perps-only US exchange, M). Live trading status in Oct 2026 is NOT confirmed. [H docs, M press]

## Market model
- Perps: symbol like `BTC-USDT`, single order book per market over WebSocket, up to 5x leverage, cross/isolated margin, hourly funding, index from CCIX/CCCAGG/Hyperliquid/Kraken. [H]
- Options: symbol `BTC-24JUN26-62000-C`, weekly/monthly expiry, cash settled 08:00 UTC, Black-76. [H]
- No binary/categorical/scalar event contracts. NOT FOUND (searched: docs.rails.xyz llms.txt/introduction/perps-vs-options, rails.xyz JS bundle for "prediction|event contract|polymarket|kalshi", web search).

## Chains and collateral
- Sandbox deposits use Stellar (Freighter wallet, test smart contract). Production: "the DCO's responsibility to custody funds" (DCO = derivatives clearing organization, so a clearing-house/partner-custody model). Earlier press describes a "self-custodial" hybrid. Collateral type for production NOT FOUND; symbols are USDT-quoted. [H docs, M press]

## Read API
- Docs: https://docs.rails.xyz (Mintlify; index at /latest/introduction; llms.txt at /llms.txt). [H]
- Sandbox base: https://sandbox.rails.xyz; production "coming soon". [H]
- Auth: API key/secret (`X-Api-Key`/`X-Api-Secret`) exchanged for a 30-minute access token (token endpoint 20 req/min/key); needed for HTTP and WebSocket APIs "where required". Access requires onboarding as a partner/market maker/retail; not public. [H]
- Endpoints (perps): Get Market Data (INDEX, MARK, BID, ASK, FUNDING, OPEN_INTEREST, 24H_VOLUME), order book, recent trades, WebSocket order creation stream. [H]
- Rate limits: WS 20 new connections/min retail (60 MM); order create/modify 250/min (10,000 MM). [H]
- Unauthenticated sample: none captured; sandbox root returned an HTML app shell only. No fixtures saved.

## Trade path
- WebSocket order stream with API token; accounts are institutional/partner-onboarded. No wallet-signed orders or on-chain transaction proposals documented, so an EVM wallet via PayBox cannot trade it directly. SDK: Go (github.com/rails-xyz/exchange-go-sdk). [H]

## Fees, resolution, geo/ToS
- Fees: NOT FOUND (not examined beyond docs index; perps formulas pages exist for mark price/margin).
- Resolution: n/a (no event contracts). Options cash-settle at expiry.
- Geo/ToS/automation: NOT FOUND; API is partner/onboarding gated and regulated (NFA-listed per tracker, M).

## Liquidity and overlap
- Volume/OI: NOT FOUND (no public stats; production not documented as live).
- Event-category overlap with other venues: none for event arbitrage. Only theoretical overlap is BTC/ETH price-level hedging (crypto options and perps could back out implied probabilities of "BTC above X" markets on Polymarket/Kalshi). That would be a signal-only use, and requires production access.
- Shared liquidity: no known sharing with another venue.

## Adapter priority
skip. Not a prediction market, no public API, production not live per docs. Revisit only if Rails publicly launches event contracts.

## Open questions
- Is the tracker's "prediction market intermediating" classification based on a planned product?
- Has production launched; is any market data public?

## Anomalies / suspicious content
- https://docs.rails.xyz/llms.txt returned a Kalshi API docs index (docs.kalshi.com links) on one fetch and the correct Rails index on another. Treated as inconsistent hosting/caching; no instructions found in it. [H]

## Sources
- https://rails.xyz/ (meta, SPA shell) [H]
- https://docs.rails.xyz/latest/introduction.md, /latest/environments.md, /latest/perps-vs-options.md, /latest/authorization.md, /latest/perps/guides/rate-limits.md, /latest/perps/guides/market-data.md, /latest/changelog.md [H]
- https://mickbransfield.com/cftc-regulated-pms/ [H for row text, M for classification]
- Press: https://fortune.com/crypto/2025/06/04/rails-crypto-perps-exchange-slow-ventures-kraken-ftx-bitcoin (search result snippets only; Yahoo/AOL syndications of the same story exist; older than 6 months, L-M)
