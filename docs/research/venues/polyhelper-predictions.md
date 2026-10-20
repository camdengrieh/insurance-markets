# PolyHelper Predictions (polyhelper.io) - venue spec

Researched 2026-10-19. Verdict: NOT a venue. It is a Polymarket browser extension / builder-attributed frontend. Priority: skip.

## Summary
- H: polyhelper.io is "Poly Helper - Browser Extension for Polymarket Traders", a free Chrome/Brave extension that overlays information panels (crypto context, X news, top-holder PnL, sports stats, macro) on the Polymarket UI. Not a market or exchange. (https://polyhelper.io/ , https://polyhelper.gitbook.io/polyhelper-docs)
- H: Site is live as of 2026-10-19 (HTTP 200, last-modified 2026-09-29). Landing page counters showed "0" (placeholders); a points/airdrop ($POLY, "just assumptions") program is advertised.
- H: DefiLlama lists it as category "Interface", chain Polygon, tag "Polymarket Builder", description "prediction platform powered by Polymarket", no TVL. (https://api.llama.fi/protocol/polyhelper-predictions; fixture saved)
- M: DefiLlama dexs volume: totalAllTime $130,495,742 (tagged doublecounted: true), total24h null, start 2026-01-01. It is Polymarket volume attributed to PolyHelper as a builder, i.e. a subset of Polymarket's own volume. The DefiLlama adapter comment says PolyHelper "is absent from" Polymarket's builder volume dump, so it has no builder code and volume is "notional-only" (inferred/unclear attribution). (https://api.llama.fi/overview/dexs ; https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts)

## Market model, chains, collateral
- Own markets: none. All markets/order books are Polymarket's (binary/categorical CTF outcome tokens on Polygon, USDC collateral). H that PolyHelper is Polygon-only per DefiLlama; M on the Polymarket details (covered by the parallel Polymarket workflow).

## Read API
- Official: none. NOT FOUND (searched: homepage, gitbook docs, /docs, /api and /llms.txt (the SPA returns the HTML shell for /docs and /api; llms.txt 404), robots.txt, sitemap.xml which lists only `/`). WebSearch was unavailable (session budget exhausted), so no third-party coverage was searched.
- Use Polymarket's own Gamma/CLOB/data APIs instead (other workflow).

## Trade path
- Not documented. The extension sits beside Polymarket's own UI; the docs/site do not say it places orders or uses a builder code. A testimonial mentions a trading bot and a fee refund after a "CLOB v2 update" (user comments, L). Any trading goes through Polymarket (EIP-712 signed CLOB orders), so PayBox reachability is only via Polymarket, not via PolyHelper.
- paybox_reachable: no (nothing to integrate).

## Fees
- Extension: free, no fee schedule published (H, site). Any builder fee on Polymarket orders: NOT FOUND (searched: site, gitbook).

## Resolution, geo/ToS, automation
- Resolution: Polymarket's (UMA-based) - not PolyHelper's. 
- ToS/privacy page: NOT FOUND on site. Geo restrictions: none stated. Site claims "Supported & approved by Polymarket" (self-claim, L). Analytics script loaded from analytics.polyhelper.io.
- No AI-agent-directed instructions found.

## Liquidity / overlap
- Shares 100% of liquidity with Polymarket: NOT an independent arbitrage leg. Categories (crypto, sports, politics, macro) are simply Polymarket's.

## Adapter recommendation
- skip. Nothing to adapt. If useful, treat PolyHelper only as a Polymarket builder-attribution label. Its panels (crypto/sports/macro context) are product features, not data feeds we can consume.

## Fixtures
- docs/research/fixtures/polyhelper-predictions/defillama-protocol.json (656 B; DefiLlama protocol metadata).

## Sources
- https://polyhelper.io/ (H)
- https://polyhelper.gitbook.io/polyhelper-docs (H)
- https://polyhelper.io/robots.txt , /sitemap.xml (H)
- https://api.llama.fi/protocol/polyhelper-predictions (H)
- https://api.llama.fi/overview/dexs (H, volume numbers; undated snapshot fetched 2026-10-19)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts (H)
- https://defillama.com/protocol/polyhelper-predictions (403 to WebFetch; not read directly)
