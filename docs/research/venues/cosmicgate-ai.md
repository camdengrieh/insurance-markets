# CosmicGATE.ai (CosmicGATEAI) - venue spec

Researched 2026-10-19. Read-only. Verdict: NOT a venue. Marketing site for an AI "prediction intelligence" product; no order book, no API, no contracts, no chain named. adapter_priority = skip.

## Summary
- kind: aggregator-or-data / AI signal vendor (pre-product). [H]
- Site is live (HTTP 200, (c) 2026 Cosmicgate AI Labs, header "NETWORK DEVNET LIVE"). [H] https://www.cosmicgate.ai/
- Products named on homepage: Legendz ("In BETA"; basketball fantasy trading, YES/NO markets, micro-click execution), Fans Pro Terminal ("IN DEVELOPMENT"), Prediction Intelligence Infra (private beta, staged access). [H]
- /prediction-intel: 4-stage multi-agent pipeline (Evidence, Scenarios, Verify, Signal), synthetic persona simulation (OASIS cohorts), "signed work receipts" from compute partners; sells "prediction outcomes" and "in-depth reports" for a "small intelligence fee"; sports basketball/football/baseball/soccer/tennis (listed as planned); all demo numbers labelled illustrative. [H]
- Token $GATEAI with "Community Presale" / "Community Access" page. No ticker contract, chain or tokenomics found. [H absence]

## Market model / chains / collateral
NOT FOUND (searched: homepage, /prediction-intel, /gateai page title only, WebSearch). Chain is not named anywhere; "devnet" suggests Solana but this is inference only [L]. No collateral, outcome tokenisation, order book/AMM info.

## Read API
exists: none. No docs, SDK, GitHub org, Discord, OpenAPI found. docs.cosmicgate.ai does not resolve. api.cosmicgate.ai resolves but TLS certificate is expired (curl error 60); not probed further (no -k). robots.txt disallows everything except /, /tokensale, /prediction-intel and two link-preview paths [H] (fixture: docs/research/fixtures/cosmicgate-ai/robots.txt). /llms.txt and /sitemap.xml return the SPA HTML shell (no real file).
Whitepaper link https://cosmicgate.notion.site/ returned only the word "Notion" to WebFetch (JS-rendered, unread) [open question].
GitHub repo search for "cosmicgate" returned nothing (gh api search/repositories). [H absence]

## Trade path
None documented. No order placement, signing scheme, or contract addresses. PayBox reachability: no (nothing to call; chain unknown).

## Fees
Only "small intelligence fee" for outcomes/reports (no number). Trading fees: NOT FOUND.

## Resolution
NOT FOUND. "Verifiable outputs"/signed work receipts relate to compute verification, not market resolution.

## Geo / ToS / automation
Terms not read. robots.txt disallows crawling beyond listed paths; I did not crawl disallowed paths beyond one page title fetch of /gateai (noted). Contact on site is a generic info@ address (not recorded here beyond the domain).

## Liquidity
No volume/OI/TVL claims anywhere. WebSearch (2026-10-19) found zero independent coverage of CosmicGATE or its Legendz product. Note: a different "Legendz" (free-to-play sweepstakes sportsbook, no event contracts) appears in an Oct 2026 ranking at https://www.rotowire.com/prediction-markets/platforms (via search snippet) - likely unrelated [L].

## Overlap / shared liquidity
Intended: sports (NBA etc.). Liquidity currently nil/unknown; no evidence it routes to another venue.

## Use for this project
Possibly a future paid signal source (sports probabilities) if private beta opens; do not build an adapter. Revisit if docs/API/contract addresses appear.

## Suspicious content
None found; no text aimed at AI agents.

## Sources
- https://www.cosmicgate.ai/ (H)
- https://www.cosmicgate.ai/prediction-intel (H)
- https://www.cosmicgate.ai/gateai (title only) (H)
- https://cosmicgate.ai/robots.txt (H)
- https://cosmicgate.notion.site/ (unreadable)
- WebSearch 2026-10-19 (no relevant hits) (M)
