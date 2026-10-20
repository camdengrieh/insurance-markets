# Match-Trader prediction markets (Match-Trade Technologies) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. This is not a venue. It is a white-label software product (platform front end) sold to brokers and prop firms for about $4,500/month. Each licensee runs its own branded site. Liquidity appears to come from a single principal market maker (FX-EDGE), not an open order book. No public read API, no public trade API, no chain or on-chain settlement, institutional-only, and geo-restricted. Predictory.com, the one known public deployment, is "not available in your country" to visitors and lists about 40 markets. There is nothing to arbitrage against that is reachable programmatically.

## Is it live?

- Product page returns HTTP 200 on 2026-10-19. H - https://match-trader.com/prediction-markets/
- Launch announced 2026-04-02 ("Match-Trader brings prediction markets to brokers"). H - https://match-trader.com/match-trader-brings-prediction-markets-to-brokers/ , https://www.financemagnates.com/forex/products/match-trader-enters-prediction-markets-with-white-label-offering-for-brokers/ , https://fxnewsgroup.com/forex-news/platforms/match-trader-expands-into-prediction-markets/ (dated 2026-04-03)
- Product page claims a UF Award at iFX Expo International 2026. H (self-reported) - product page.
- predictory.com returns HTTP 200 (HTML, Cloudflare). H - curl headers 2026-10-19. Page says "40+ markets" and shows an "Access restricted ... not available in your country yet" notice. H - https://predictory.com (WebFetch)

## Kind and market model

- Kind: white-label broker/prop-firm front end (PWA web/desktop/mobile) sold as standalone or as an FX/Prop add-on. Not a venue with its own public liquidity. H - product page ("Event-based trading platform deployable as a standalone service or as an FX or Prop extension").
- Markets: binary and multi-outcome ("Grouped event view"); "Simple YES/NO trading flow"; probability-style pricing with charts. H - product page and https://match-trader.com/prediction-markets-offer/
- Pricing: contracts trade between $0 and $1 (FX-EDGE says $0.01-$0.99), settle at $1.00 or $0. H - https://predictory.com , https://fx-edge.com/predictions-liquidity/
- Engine: runs on Match-Trade's FX/CFD engine; "handles pricing, binary contract logic, and settlement". H - Finance Magnates article (WebFetch summary).
- Book vs AMM vs parimutuel: NOT FOUND (searched: product page, offer page, press release, FX-EDGE page, Predictory). Operator sets spreads, so it is a quote-driven (dealer/market-maker) model, not a public CLOB. M (inferred from FX-EDGE "FX-EDGE makes the market, the broker sets the client-facing spread").
- Outcome tokenisation: no tokens described; positions are broker-ledger positions in the FX/CFD engine (open/close positions like CFDs). M (inferred from Brokers API: positions, orders, ledger entries).

## Chains and collateral

- No chain. No smart contracts found. NOT FOUND (searched: product page, offer page, FX-EDGE page, press, web search).
- Predictory accepts deposits in "USDT, USDC, Bitcoin, Ethereum" from "any wallet", min deposit "as little as $10". H - https://predictory.com . This is a custodial deposit address, not a trading contract.
- Match-Trade states it "does not hold client funds" and "does not trade cryptocurrencies"; custody sits with the licensee broker. H - product page disclaimer. Match2Pay (crypto payment processor) is listed as an add-on. H - offer page.
- FX-EDGE settlement: "USD or stablecoins (USDC, USDT)" via one counterparty. H - https://fx-edge.com/predictions-liquidity/

## Read API

- exists: none (for prediction markets). The generic Match-Trader Platform API (REST, Theneo-hosted) covers login, market watch, balance, symbols, candles, positions, orders; the docs show no event/prediction section. M - search summary of https://app.theneo.io/match-trade/platform-api and https://docs.match-trade.com/docs/match-trader-api-documentation/ (page lists no events/prediction content, H that it is not mentioned).
- Brokers API (REST + gRPC): accounts, deposits/withdrawals, positions, orders, ledger, candles. No prediction/event endpoints mentioned. Token auth with partnerID embedded in the token; access via sales contact. H - https://match-trader.com/brokers-api/
- Offer page claims "Access to all APIs available" and "Access to All Databases" (platform and back-office data) for licensees. H - https://match-trader.com/prediction-markets-offer/ . Event endpoints not documented publicly.
- FIX: Match-Trader QFX FIX 2.2 PDF listed under Liquidity. H (link exists) - docs page. Not shown to cover events.
- Websocket: NOT FOUND (searched: docs landing page, Brokers API page).
- Rate limits: NOT FOUND.
- Docs: https://docs.match-trade.com/docs/ , https://match-trader.com/platform-api/ , https://match-trader.com/admin-api/ , https://match-trader.com/fix-api/ (links only; not exhaustively read).
- Predictory.com API: not mentioned on site. H (absence). I did not probe undocumented endpoints.
- Fixtures: none saved. No documented public prediction API exists to GET (only HTML pages respond).

## Trade path

- None for an outside agent. Trading requires an account on a licensee site (KYC, fiat/crypto deposit to the broker) and any programmatic access goes through broker-gated Platform/Broker API tokens. Event-specific order endpoints undocumented. H/M.
- PayBox reachability: **no**. No chain, no on-chain settlement, no signed-order scheme; an EVM wallet could at most send a USDT/USDC/ETH deposit to a custodial address, which is a transfer, not a trade. Predictory is also country-restricted and institutional-only licensing implies KYC.

## Fees

- Platform: Basic white-label tier $4,500/month; combined FX+prediction pricing via sales. H - offer page.
- Trading fees: set by each operator ("admins retain direct control over fee structures and risk parameters"); revenue from spreads and trading fees. No amounts. H - press release. Predictory fee schedule: NOT FOUND (searched: predictory.com, web search).
- FX-EDGE wholesale: "flat wholesale commission per contract, regardless of price or category" (amount not stated); broker markup is broker revenue. H - FX-EDGE page.

## Resolution

- "System-driven outcome settlement with no manual steps"; automatic 0/1 settlement; early exit before resolution allowed. H - offer page.
- Who determines outcomes / source of truth / dispute process: NOT FOUND (searched: product page, offer page, press release, FX-EDGE page, Predictory). Dispute risk is high and operator-dependent: a single operator/market maker both prices and settles.

## Geo / ToS / automation

- Match-Trade products "provided for corporate and institutional customers only"; product page says not directed at residents of jurisdictions where FX trading is restricted. H.
- FX-EDGE (FX-EDGE V Ltd, Vanuatu) is for licensed brokers/professional counterparties, not retail; restricted jurisdictions include USA, Canada, Australia; onboarding/due diligence required. H - FX-EDGE page.
- Predictory: "24/7 trading for non-US residents" yet shows an "access restricted" notice to the fetcher. H.
- Automation/bot rules: NOT FOUND.

## Liquidity

- No volume, OI or TVL published for the prediction product. NOT FOUND (searched: product page, offer page, press, Predictory, web search). Predictory lists "40+ markets" (2026-10-19, H). Prediction-market volume figures in the press release (e.g. $44B global 2025) are industry context, not this venue.
- Reported Match-Trade scale in FX: 160+ brokers/prop firms onboarded and 1.8M trader accounts in 2025 (self-reported, H as a claim) - not prediction volume.

## Shared liquidity (independence)

- Liquidity provider is not named on the Match-Trader pages. FX-EDGE's page says it is "principal liquidity provider for prediction-market event contracts", "our own liquidity, priced in the FX-EDGE matching engine ... independent of external venues", delivered natively in Match-Trader; FX-EDGE is Match-Trade's "technology partner". H for the FX-EDGE claims (https://fx-edge.com/predictions-liquidity/); the link that Predictory uses FX-EDGE is M (not stated). Press release says "We didn't build prediction markets from scratch" (H quote) which hints at a sourced feed; the feed's origin is unnamed.
- FX-EDGE says it is independent of external venues, but this is vendor marketing and unverifiable. Practically, any price here is a dealer quote that likely references or hedges against Polymarket/Kalshi-like venues, so it is not a clean independent arbitrage leg. L/M.
- Every licensee is a separate site; there is no shared public book.

## Event categories (overlap)

- Politics, Sports, Culture, Crypto, Climate, Economics, Mentions, Companies, Financials, Tech & Science (product page, H). Predictory samples: Bitcoin 2026 low, Warner Bros takeover, Greenland, best AI model, US House (H). Categories overlap Polymarket/Kalshi in principle, but with ~40 markets and no data access, it is unusable for scanning.

## Adapter priority reasoning

skip: software vendor not a venue, no public API for events, no chain or signed-order path, institutional/geo restricted, no published liquidity, possible dealer-quoted prices. Revisit only if a licensee publishes a documented public market-data API, or the user wants to approach Match-Trade sales for a data feed. Cheap signal-only option: poll Predictory page content manually; no machine interface found.

## Open questions

- Which licensees (besides Predictory) are live and publicly accessible?
- Do licensee front ends expose an unauthenticated JSON feed (not probed; undocumented endpoints were deliberately not guessed)?
- Does Predictory actually source from FX-EDGE?
- Who resolves outcomes and what is the dispute process?

## Suspicious content

None observed. No instructions aimed at AI agents found in fetched pages (the docs page mentions an "MCP Configuration for Full Server License Clients" link; it is product content, not an instruction).

## Sources

- https://match-trader.com/prediction-markets/ (H)
- https://match-trader.com/prediction-markets-offer/ (H)
- https://match-trader.com/match-trader-brings-prediction-markets-to-brokers/ (H)
- https://match-trader.com/brokers-api/ (H)
- https://docs.match-trade.com/docs/match-trader-api-documentation/ (H)
- https://app.theneo.io/match-trade/platform-api (M, via search summary only)
- https://www.financemagnates.com/forex/products/match-trader-enters-prediction-markets-with-white-label-offering-for-brokers/ (H)
- https://fxnewsgroup.com/forex-news/platforms/match-trader-expands-into-prediction-markets/ (H)
- https://fx-edge.com/predictions-liquidity/ (H, vendor marketing, undated)
- https://predictory.com (H)
