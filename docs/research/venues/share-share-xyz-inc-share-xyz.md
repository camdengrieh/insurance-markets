# Share (Share [XYZ] Inc., share.xyz): venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale. WebSearch was unavailable (session budget exhausted), so everything below comes from direct fetches of share.xyz, docs.share.xyz, the App Store page and AGG's public docs.

## Verdict

- Live: yes. share.xyz serves a working site (HTTP 200, event cards with Hyperliquid markets) [H, https://share.xyz]; App Store version 1.0.42 "updated Oct 9" (year not shown on page; app requires iOS 26) [H, https://apps.apple.com/us/app/share-polymarket-predictions/id6475958100]; robots.txt comments cite traffic samples dated 2026-09-16 to 2026-09-22 and describe 2026-09-16 as "launch day" (probably the web launch, not the app launch, which is older) [H, https://share.xyz/robots.txt; interpretation M].
- Kind: broker / front-end and router, NOT a venue. No order book, no resolution, no own token. Adapter priority **skip** (see Priority).
- Liquidity is shared: every market is a Polymarket or Hyperliquid market, so Share is not an independent arbitrage leg [H for venues listed: site meta description "across Polymarket and Hyperliquid"].

## What it is

- Site title "Share | The Best Odds and Fees in Prediction Markets"; meta description: "Share gets you the best prediction market odds and up to 100X lower fees across Polymarket and Hyperliquid." [H, https://share.xyz]
- Venues shown: Polymarket and Hyperliquid (outcome markets). The App Store listing still says only "Polymarket Predictions", so the Hyperliquid routing is newer than the app name [H, App Store + site].
- Operator: Share [XYZ] Inc. (App Store seller), developer Share.xyz, listed "Official Polymarket Partner"; sign in with an existing Polymarket account, positions are shared with polymarket.com; Apple Pay funding, copy trading, alerts, live scores; 18+; 4.5/5 from 44 ratings; later release notes add limit orders and order books [H, App Store page].
- Likely built on the AGG white-label aggregator [M]: the page loads market images from `assets.agg.market/events/hyperliquid/outcome:<id>/...` (8 hits on the homepage, all Hyperliquid) and the client JS opens `wss://ws.agg.market/ws?appId=<partner id>` [H that these strings are in share.xyz's HTML/JS; the inference that Share is an AGG partner app is M]. AGG's public docs do not name Share (searched llms-full.txt for "share.xyz": no partner mention) [H]. See `docs/research/venues/agg-agg-market-white-label-prediction-market-aggregator.md` for AGG itself. We did NOT use the app id embedded in Share's client; it is another party's credential.

## Market model and tokenisation

- Inherited from the underlying venue. Polymarket: binary and negRisk categorical on a CLOB, ERC-1155 outcome tokens on Polygon (covered by the parallel Polymarket workflow). Hyperliquid HIP-4 outcome markets: binary-style outcomes settled on HyperCore, with a deployer-set fee scale [M, via AGG docs https://docs.agg.market/recipes/venue-fees.md]. Share issues no tokens of its own [M].
- Many Hyperliquid markets are short-window crypto "Up/Down" markets: robots.txt says a new Up/Down window opens "every 5 or 15 minutes" and disallows crawling them [H].

## Chains and collateral

- NOT FOUND in Share's own pages (searched: share.xyz homepage, docs.share.xyz llms.txt and geo pages, App Store). Inferred from the underlying venues: Polymarket on Polygon (USDC.e wrapped to pUSD per AGG docs), Hyperliquid on HyperCore USDC [M, AGG docs]. Share's Apple Pay / fiat on-ramp and Cash balance are custodial-style UX details we could not confirm [L].

## Read API

- Exists: **none** public or documented. docs.share.xyz is a GitBook whose only content is five geographic-restriction pages (llms.txt lists exactly those) [H, https://docs.share.xyz/llms.txt]. No developer, API, fee or terms docs. `api.share.xyz` does not resolve [H]. share.xyz/terms and /docs return the same SPA shell (no readable terms text via unauthenticated fetch) [H].
- `/api/` is disallowed in robots.txt [H], so internal endpoints exist but are not for third parties.
- Practical read path for an aggregator: go to the source venues directly (Polymarket Gamma/CLOB, Hyperliquid info API), which are covered or coverable elsewhere. Share adds no data that is not on those venues, except possibly its own copy-trading/points data (undocumented).
- If ever needed: AGG's REST (`https://api.agg.market`) and WebSocket require a partner app id created in AGG's admin dashboard (see AGG note); unauthenticated calls returned 403 in our earlier probe.
- Rate limits, websocket: NOT FOUND for Share (searched: docs.share.xyz, share.xyz).

## Trade path

- No programmatic trade API for third parties. Trading is via the iOS app / web UI with a Polymarket account login [H, App Store]. Auth/signing scheme: NOT FOUND (searched: App Store, docs.share.xyz, site).
- Good for us: since Share is a front-end, any trade it could do is available more directly on the underlying venue (Polymarket CLOB with EIP-712 signed orders from an EVM wallet; Hyperliquid with API wallet signing). Share fees are an add-on, not a benefit, for a bot.

## PayBox reachability

- Share itself: **no** (no API, UI-only, geo-gated).
- Underlying venues: Polymarket via a Polygon EVM wallet signing orders, and Hyperliquid via EVM signatures, are plausibly reachable, but that is the job of the Polymarket / Hyperliquid venue notes, not this one. Hyperliquid was not in the already-covered list; it deserves its own venue-spec if not done [M].

## Fees

- Share publishes no fee schedule. Marketing claims only: "Save up to 100X on Polymarket Fees"; per-event badges "Save 71× in fees on Hyperliquid" (9 cards) and "Save 100× in fees on Hyperliquid" (2 cards) on the homepage fetched 2026-10-19 [H, https://share.xyz]. Baseline for the multiplier is not stated [H that it is unstated].
- Hyperliquid HIP-4 fee, per AGG docs: exit-basis, `0.0007 * (s + max(s,1))` of notional on sell or of the $1 payout on a winning hold, where `s` is the deployer fee scale 0-10 (14 bps at scale 1, up to 140 bps at 10), base tier; opening a position is free [M, https://docs.agg.market/recipes/venue-fees.md]. Polymarket taker fee `feeRate * (p*(1-p))^feeExponent` per share, makers pay nothing [M, same page].
- A router on these venues can add a builder fee (Polymarket and Hyperliquid builder codes) and an app fee; whether Share charges either: NOT FOUND (searched: site, App Store, docs.share.xyz). A reviewer on the App Store asked for clearer fee details [H].

## Resolution

- Inherited from Polymarket (UMA optimistic oracle, dispute risk covered in the Polymarket note) and Hyperliquid (deployer-defined HIP-4 outcome settlement) [M]. Share's own resolution role: none found. Share's own docs say nothing on disputes (NOT FOUND).

## Geo / ToS / automation

- Docs explicitly block these (H, https://docs.share.xyz/geographic-restrictions/*): North America: United States, Canada, Cuba, Nicaragua. Europe page: blocked includes United Kingdom, Germany, France, Italy (full list truncated in our read). Asia: blocked includes Japan, China, North Korea, Iran, Singapore, Thailand, Taiwan, Hong Kong, India, Korea, Philippines (list as seen; country-level status of each not individually verified). South America: Brazil, Venezuela. Africa/Oceania: Australia, New Zealand, Ethiopia, Sudan, South Sudan, Libya, Zimbabwe, plus others not fully read.
- Quote: "Share strictly prohibits the use of VPNs or similar tools to bypass geographic restrictions." [H]
- Terms of Service text and automation rules: NOT FOUND (searched: share.xyz/terms returns an unrendered shell; docs.share.xyz has no ToS page). The US App Store lists the app while the docs block US users; treat as an inconsistency to verify [M].
- robots.txt asks several AI/SEO crawlers to stay out and rate-limits others; `/api/` is disallowed for all [H].

## Liquidity

- No volume, OI or TVL published by Share (NOT FOUND, searched: site, App Store, docs). Underlying Polymarket / Hyperliquid liquidity is covered elsewhere. Any Share volume is a subset of those venues' volume.

## Event overlap and independence

- Categories (App Store): sports, politics, crypto, culture, news, music [H]. Homepage categories: Trending, Sports, Politics, eSports, Crypto, Finance, Geopolitics, Tech, Culture, World, Economy, Climate & Science, Mentions, Elections [H].
- Overlap with other venues exists by construction, but because it is a router on Polymarket + Hyperliquid, it is the same liquidity: **not an independent leg**. Its one analytic use: the Polymarket-vs-Hyperliquid price gap on the same event, which can be measured from the two venues directly.

## Priority

**skip.** Front-end with no API, duplicate liquidity, US geo-blocked, no fee/ToS documentation. Recommend instead: (a) a Hyperliquid HIP-4 venue-spec if not already done (new venue not on the covered list), (b) AGG as signal only (already P2). Share can be dropped from the platform registry as "alias of Polymarket + Hyperliquid pool".

## Open questions

- Does Share charge a builder/app fee on top of venue fees, and what is the baseline for its "100X" claim?
- Is Share's Cash balance custodial or non-custodial (Apple Pay on-ramp)?
- Hyperliquid HIP-4 market count and volume (belongs to a Hyperliquid note).

## Sources

- https://share.xyz (homepage, meta, event-card badges, JS/HTML references to agg.market) [H]
- https://share.xyz/robots.txt [H]
- https://docs.share.xyz/llms.txt and https://docs.share.xyz/geographic-restrictions/{north-america,europe,asia,south-america,africa-and-oceania} [H]
- https://apps.apple.com/us/app/share-polymarket-predictions/id6475958100 [H]
- https://docs.agg.market/recipes/venue-fees.md , https://docs.agg.market/concepts/fees (in llms-full.txt) [H for what AGG says; M for applying it to Share]
- Fixtures: `docs/research/fixtures/share-share-xyz-inc-share-xyz/` (docs-llms.txt, share-robots.txt, docs-geo-north-america.md, home-meta-extract.txt)
- Searched and not found: Share API docs, fee schedule, terms of service, liquidity stats, press coverage (web search unavailable this session).
