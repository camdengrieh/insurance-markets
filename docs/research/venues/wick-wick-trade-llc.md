# Wick (Wick Trade LLC) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip**. Wick is a mobile front-end (wallet + router) over Hyperliquid (perps/spot/HIP-3) and Polymarket (sports only, Polygon). It has no public API, no own liquidity and no own market data. Its prediction liquidity IS Polymarket's order book, so it is not an independent arbitrage leg. The Polymarket adapter (covered elsewhere) already reaches the same markets. At most it is a (very weak) usage signal; nothing to ingest.

## Liveness

- Live: wick.trade returns a marketing page; iOS via Apple TestFlight link, Android via Google Play; meta description "Available now on TestFlight for iOS and on the Google Play Store for Android" [H, https://wick.trade, fetched 2026-10-19]. Docs say "the app is in beta on iOS and Android" [H, https://wickdottrade.gitbook.io/wick/get-started/introduction.md].
- The discovery hint's "App Store release 11 Sep 2026" was not confirmed on the site (it shows TestFlight) [M/unverified].
- Legal entity: Wick Trade LLC, Wyoming [H, https://wick.trade/terms].

## Kind and market model

- Kind: self-custodial mobile trading front-end / router. "mobile-first, self-custodied trading application built on Hyperliquid" [H, docs intro]. Terms: "non-custodial software interface... not an exchange, broker, custodian, or settlement agent" [H, /terms s1.3].
- Prediction part ("Wick Sports"): "built on Polymarket", currently sports only, "designed to support a broader range of prediction markets over time" [H, https://wickdottrade.gitbook.io/wick/prediction/introduction.md]. Binary Yes/No outcome shares on the Polymarket CLOB (order book), default 8% slippage on market orders [H, prediction-trading-overview.md].
- Other markets (perps up to 40x, spot, HIP-3 e.g. XYZ-100, stocks/forex via HIP-3) are Hyperliquid products, not prediction markets. All positions use isolated margin [H, automatic-collateral-management.md]. Hyperliquid's own outcome/prediction markets are not mentioned in the docs [NOT FOUND in the Wick docs index].

## Chains and collateral

- Trade balance: USDC on Hyperliquid Core (L1); deposits via debit card/Apple Pay (Coinbase), native-token deposits on Ethereum/Solana/Base auto-converted to USDC, Unit (BTC/ETH/SOL) [H, fund-your-account.md]. Deposits to HyperEVM do not arrive.
- Predict balance: USDC on Polygon in Safe wallets; "do NOT transfer funds directly to your Polygon address"; Wick moves funds Trade->Predict in-app, "typically under 15 seconds" [H, funding-your-prediction-account.md, getting-started.md].
- Wallet: Privy embedded wallet, created at sign-up (Apple ID / email) [H, faqs.md]. The hint's "no-email" claim conflicts with docs mentioning email login; not resolved.

## Read API

- Official public API: **none documented**. NOT FOUND (searched: wick.trade, /docs, /api, /fees (404s), wickdottrade.gitbook.io llms.txt full index, Terms, GitHub repo search for wick.trade / wickdottrade; no org repos found).
- Site loads scripts from `op.service.wick.trade` and `opapi.service.wick.trade` (appear to be analytics/attribution hosts, not a trading API) [M, seen in wick.trade HTML]; not probed further. `api.wick.trade` returns 403 (Cloudflare-style plain text) to an unauthenticated HEAD; `docs.wick.trade` does not resolve [H].
- Market data for an aggregator should come directly from the underlying venues: Polymarket (Gamma + CLOB APIs) and Hyperliquid info API. No fixtures saved (no Wick API exists).

## Trade path

- None programmatic via Wick. Orders are placed by the mobile app (hold-to-confirm) signed through the user's Privy wallet. No bot/API/SDK program is described in Terms [H, /terms]. Terms prohibit scraping and automated requests that degrade the service and mention rate limiting / anti-automation (s1.1, s2.9) [H].
- An agent wanting the same exposure should trade Polymarket directly (CLOB with Safe/proxy wallet on Polygon) or Hyperliquid directly; Wick adds only a fee and a Privy-held key it does not give out. Wick's Privy wallet is not reachable by PayBox.

## PayBox reachability

- **no.** The wallet is a Privy embedded wallet held in the app; no exported key, no WalletConnect/API described [M: nothing found in docs]. A PayBox EVM wallet cannot place orders "through Wick". It could trade the underlying venues directly (Polymarket on Polygon; Hyperliquid) - those are covered by other specs.

## Fees

- Prediction markets: "currently no fees when trading prediction markets on Wick or when moving funds from trade balance to predict balance" (Polymarket's own fee schedule still applies on its side; not stated by Wick) [H, prediction/fees.md].
- Perps/spot: Wick flat 0.05% maker and 0.05% taker + Hyperliquid base (perp 0.015% maker / 0.045% taker; spot 0.04% / 0.07%) [H, trading/fees.md].
- Terms: builder/routing fees may apply, may change with notice; Wick may receive rebates/revenue shares (s3.1, 3.3, 3.4) [H, /terms]. Other possible fees: Coinbase on-ramp, Unit.

## Resolution

- Inherited from Polymarket (UMA optimistic oracle -> on-chain resolution; the docs just say "Polymarket waits for official results, an oracle confirms the outcome"). Settlement "may take several hours"; winnings must be manually redeemed in the app ("Redeem All") [H, prediction docs]. Dispute risk = Polymarket's. Live scores delayed ~2 min in app [H, faq.md].

## Geo / ToS / automation

- Sanctions list: Cuba, Iran, North Korea, Syria, Crimea/Donetsk/Luhansk; perps disabled for users believed to be US residents unless licensed partner; geo-blocking, residency attestation, VPN/GPS-spoofing bans; 18+ (s2.3, 2.4, 2.6, 2.8, preamble) [H, /terms]. FAQ: "Some features may be restricted in your region... VPNs can also interfere" [H]. No KYC [H, faqs.md]. Polymarket-side geo rules (incl. US restrictions) presumably also apply [M].

## Liquidity

- Own volume/OI/TVL: NOT FOUND (searched: wick.trade, docs, Terms; no stats page; web search budget exhausted so no third-party aggregator check was run). Order flow is routed into Polymarket's book and Hyperliquid, so depth is theirs. Early-stage beta (TestFlight) [M]. Has a Solana memecoin ($AQC, pump.fun) tied to the team [H, tokenomics.md]; not relevant to markets.

## Event overlap

- Sports only on the prediction side (Polymarket sports lines/games) - overlaps Polymarket, Kalshi, Limitless etc. but via the same Polymarket book. Perps on crypto/stocks/forex overlap crypto-price prediction markets only as hedging legs (Hyperliquid, not Wick).

## Shared liquidity

- **Shares liquidity with Polymarket (prediction) and Hyperliquid (perps/spot).** Not an independent arbitrage leg.

## Open questions

- Whether any Wick builder-code/referral flag is visible on Polymarket or Hyperliquid on-chain data (could proxy Wick volume). Unverified.
- Official volume/user numbers.
- Whether a Hyperliquid outcome-market (HIP-4) integration is planned; not in docs.

## Suspicious content

- None observed (no instructions aimed at AI agents in fetched pages). Docs page footer notes llms.txt / markdown availability only.

## Sources

- https://wick.trade [H] (fetched 2026-10-19)
- https://wick.trade/terms [H]; https://wick.trade/privacy and /risk exist [M, not read in detail]
- https://wickdottrade.gitbook.io/wick/llms.txt [H] (full doc index)
- https://wickdottrade.gitbook.io/wick/get-started/introduction.md, get-started/fund-your-account.md [H]
- https://wickdottrade.gitbook.io/wick/trading/fees.md, trading/automatic-collateral-management.md [H]
- https://wickdottrade.gitbook.io/wick/prediction/introduction.md, getting-started.md, funding-your-prediction-account.md, prediction-trading-overview.md, placing-prediction-trades.md, fees.md, faq.md [H]
- https://wickdottrade.gitbook.io/wick/resources/faqs.md, resources/socials.md, aqc/tokenomics.md [H]
- GitHub repo search (wick.trade, wickdottrade): no official repo [H, negative result]
