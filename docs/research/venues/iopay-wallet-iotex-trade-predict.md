# ioPay Wallet (IoTeX) - Trade & Predict

Researched 2026-10-19. Verdict: **skip** as an adapter. Wallet distribution channel for Polymarket, not an independent venue.

## Summary
- Kind: broker-or-frontend (self-custody mobile wallet by MachineFi Inc / IoTeX). [H]
- Still live: yes. App Store listing v6.0.0, "Last updated Sep 28" (year not shown, so 2026 is inferred), 4.7 stars / 255 ratings. [H] (Sources 1)
- Prediction feature: shipped in ioPay 5.2 on 2026-02-15 ("Prediction markets are now fully supported in ioPay"). The announcement does not name Polymarket. [H] (Source 3)
- The store listing says "native access to Polymarket". [H] (Source 1)
- The "How to Use Polymarket" guide (dated 2025-10-31) describes connecting ioPay to polymarket.com via WalletConnect ("search ioPay"), then deploying a proxy wallet, signing an agreement and approving tokens. That is the standard Polymarket onboarding done with ioPay as the signer, so it shares Polymarket's liquidity and order book. [H for the guide's text; M for the inference that the in-app tab is Polymarket's own CLOB or a builder-code frontend, because no page states the integration mechanism] (Source 4)

## Market model / tokenisation
No ioPay-owned markets. All markets are Polymarket's (binary and categorical outcome tokens on a CLOB, Polygon). See the Polymarket venue note, researched separately. [M]

## Chains and collateral
- ioPay supports IoTeX, Base, Fantom, Ethereum, Bitcoin, BNB Chain, Avalanche, Solana, Arbitrum, Linea, Polygon and Gravity as wallet chains. [H] (Source 2)
- Prediction trading runs on Polygon (Polymarket). The guide does not name the collateral token; funds come from the wallet balance. [H] (Source 4)

## Read API
- **None** (no ioPay market data API). [H: docs.iopay.me is a single welcome page with no API/Polymarket/prediction content; the blog posts have none]
- Price and book data must come from Polymarket's own APIs. See the Polymarket note.
- Fixtures: none saved (nothing to fetch).

## Trade path
- None as an ioPay API. The wallet app is a closed mobile UI, and there is no developer interface. [H]
- Programmatic trading means going direct to Polymarket (CLOB signed orders, EIP-712). Not an ioPay matter.

## PayBox reachability
- paybox_reachable: no. There is no ioPay endpoint to call. A PayBox EVM wallet would trade Polymarket directly (Polygon), not via ioPay.

## Fees
NOT FOUND (searched: ioPay 5.2 post, Polymarket guide post, docs.iopay.me, App Store listing). Whether ioPay adds a builder fee on top of Polymarket's fees is undocumented. Polymarket's own fees are covered in its note.

## Resolution
Polymarket's (UMA optimistic oracle, per the Polymarket note). ioPay has no resolution role. [M]

## Geo / ToS / automation
- The ioPay Polymarket guide has no geo restrictions, risk warnings or legal notices. [H]
- App Store terms: only Apple's standard terms; ioPay terms at iotex.io/terms. [H] (Sources 1, 2)
- The app's Terms of Use were not read. Polymarket geo-blocks apply to the underlying venue.

## Liquidity
No ioPay-specific volume. Liquidity is 100% shared with Polymarket, so it is not an independent arbitrage leg.

## Event coverage
Same as Polymarket (sports, politics, crypto, macro).

## Adapter priority: skip
Duplicate liquidity, no API. Useful only as evidence that a Polymarket builder or frontend channel exists.

## Caveats and gaps
- WebSearch quota was exhausted this session, so no independent news confirmation of the 6.0.0 release or the Polymarket integration was possible. The Play Store page was truncated and unreadable by the fetch tool.
- I did not confirm whether the in-app prediction tab uses a Polymarket builder code, a webview of polymarket.com, or Polymarket's API. The blog post "How to Use Polymarket" dates from Oct 2025, before the 5.2 launch, so the in-app integration may differ from it.
- An unrelated item: IoTeX's ioTube bridge was exploited in Feb 2026 (IoTeX blog titles, 2026-02-23 to 2026-03-28). It is not relevant to ioPay prediction trading but affects IoTeX-chain counterparty trust. [M, headlines only]
- The ioPay site (iopay.me) homepage does not mention Polymarket. [H]

## Sources
1. https://apps.apple.com/us/app/iopay-wallet-ai-trade-predict/id1478086371 (fetched 2026-10-19)
2. https://iopay.me (homepage, features, chains list) and https://docs.iopay.me/
3. https://iopay.me/blog/iopay-5-2-prediction-markets-go-live-smarter-market-insights/ (2026-02-15)
4. https://iopay.me/blog/how-to-use-polymarket/ (2025-10-31; older than 6 months, possibly stale)
5. https://iotex.io/blog (2026 post list)
6. https://iopay.me/blog/rss/ (post index)
