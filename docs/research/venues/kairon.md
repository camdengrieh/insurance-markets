# Kairon (kairon.trade) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Kairon is not a venue. It is a Polymarket analytics/intelligence layer (feed, whale tracker, "K-Score", paper trading on a $10K notional bankroll, AI assistant). It has no order book, no real-money execution, no markets of its own, and no documented public data API. Its liquidity is entirely Polymarket's, so it can never be an independent arbitrage leg. At most it is a weak, human-oriented signal source (whale clusters, K-Score), and Polymarket's own APIs/on-chain data give the same underlying information directly.

## Is it live?

- Site is up: https://kairon.trade/ returns 200 (via redirect), /status returns 200, robots.txt present. H - https://kairon.trade/ , https://kairon.trade/status , https://kairon.trade/robots.txt
- Labelled beta; footer (c) 2026. H (site) - https://kairon.trade/
- Wikidata item Q139848801 (last modified 2026-05-19) describes it as "Polymarket intelligence and AI agent governance platform"; aliases Kairon Trade / Forge / Media; official website P856 = https://kairon.trade/. Entry is thin and probably self-created, so it is not independent evidence of traction. H/M - https://www.wikidata.org/wiki/Special:EntityData/Q139848801.json
- No independent usage, user-count or volume figures found. NOT FOUND (searched: site pages; WebSearch extended was unavailable, the session search budget was exhausted).

## Kind and market model

- kind: aggregator-or-data (analytics/intelligence on top of Polymarket data), not a trading venue. H - homepage: describes itself as a "technology and information services platform", "not affiliated with Polymarket".
- Product family: Kairon Trade (Polymarket feed, whale tracking, AI takes), Kairon Forge (AI agent OS, Guardian connects to agents via MCP), Kairon Media (analysis/briefings). H - https://kairon.trade/ , https://kairon.trade/forge/quickstart
- No market model of its own: no outcomes tokenised, no order book/AMM/parimutuel. "Paper-only on a fixed $10K bankroll"; "Real-money execution is not available." Three score-bots run paper trades with a public 90-day P&L page at /lab. H - homepage
- K-Score: tier grade (A+, B, S...) per market. The homepage describes its inputs inconsistently (liquidity/edge/calibration/momentum/recency in one place, Volume/Momentum/Whale/News in another). The hint's "5-input scoring" matches the first. The /methodology page fetched returned only the sign-in shell, so the methodology is NOT FOUND in fetched content. H (homepage) / L (methodology)
- Whale tracker: trades of $200+ and flags clusters of 3+ whales agreeing within 60 minutes. H - homepage

## Chains and collateral

- None of its own. Underlying data is Polymarket (Polygon, USDC). Kairon says it does not hold, custody or manage funds. H (disclaimer text) / M (Polymarket chain facts from general knowledge; Polymarket is covered by another workflow).

## Read API

- exists: **none documented** (no official public API). 
- Homepage "Docs" link goes to /docs/sdk, but the fetched page is just the sign-in page with no endpoints, auth or rate limits. H - https://kairon.trade/docs/sdk
- Forge quickstart lists an "Intel API" as a waitlist item and gives a support address api@kairon.trade (this is a vendor address, not a personal identifier; I did not contact it). So any data API is not generally available. H - https://kairon.trade/forge/quickstart
- robots.txt allows `/api/datasets/` and `/lab/calibration-data` but disallows `/api/`. `/api/datasets/` returns 404 as a bare path; I did not probe `/api/*` further out of respect for robots.txt. No JSON fixtures were captured. H - https://kairon.trade/robots.txt
- No sitemap.xml (404), no llms.txt (404). H
- Websocket: NOT FOUND.
- Fixtures saved: none (no public API to sample). docs/research/fixtures/kairon/ is empty.
- If Kairon signals were wanted, the data they repackage (Polymarket Gamma/CLOB/data API trades) should be consumed directly from Polymarket instead.

## Trade path

- none. Paper trading only, no execution, no signing, no order placement. H - homepage ("Real-money execution is not available"; Forge "does not execute trades, hold funds, or provide financial advice").
- paybox_reachable: no. Nothing to trade. To act on a Kairon signal, a PayBox EVM wallet would trade on Polymarket itself (covered by the other workflow).

## Fees

- Free tier (dashboard, whale feed, rankings, paper trading); Pro $19/month adds score breakdowns, alerts, server-side "LossCut" for paper positions. Forge Personal plan has a 50 tasks/month limit. No trading fees since nothing is traded. H - homepage, forge/quickstart. Pricing/refunds pages were not captured.

## Resolution and dispute risk

- None of its own; resolution is whatever Polymarket's (UMA-based) resolution does. Kairon's paper P&L is self-reported and the homepage showed a "+24.3%" card while live numbers appeared as placeholders, so treat performance claims as unverified. H (observation) / M

## Geo / ToS / automation

- Terms, Privacy, Security, Refunds, Financial Compliance, Disclosure, AI Disclosure, EU Withdrawal Notice, Cookies and Do Not Sell links exist. The /legal/terms fetch returned only the sign-in shell, so terms text, geo limits and automation rules are NOT FOUND (searched: homepage, /legal/terms, /docs/sdk, /forge/quickstart). Content is stated as informational/educational, not financial advice. H
- robots.txt disallows `/api/`, `/account/`, `/admin`, `/portfolio`; explicit allow-list for public pages. Scraping the site is not an appropriate integration path. H

## Liquidity

- No liquidity of its own. No volume/OI/TVL (nothing is traded). Shares 100% of liquidity with Polymarket. liquidity_shared_with: Polymarket. H

## Event coverage / arbitrage overlap

- Mirrors Polymarket's catalogue (politics, crypto, sports, macro, etc.), so any overlap with other venues is Polymarket's overlap. Not an independent arbitrage leg. H/M

## Open questions

- Whether the "Intel API" waitlist ever becomes a documented public/paid API; whether K-Score or whale-cluster signals have any measured predictive value (/lab/calibration-data is robots-allowed and could be reviewed for calibration claims, but is likely rendered client-side).
- Terms text on automation/data redistribution was not retrievable.

## Suspicious content

- None. No instructions aimed at AI agents found on any fetched page (the site has an in-product AI chat widget and an MCP-connected "Guardian" for Forge, which are product features).

## Sources

- https://kairon.trade/ (H)
- https://kairon.trade/robots.txt (H)
- https://kairon.trade/status (H, HTTP 200 only)
- https://kairon.trade/docs/sdk (H, sign-in shell only)
- https://kairon.trade/forge/quickstart (H)
- https://kairon.trade/methodology , https://kairon.trade/legal/terms (H, sign-in shell only)
- https://www.wikidata.org/wiki/Special:EntityData/Q139848801.json (H, thin and likely self-authored)
- Limitation: WebSearch budget exhausted for this session, so no third-party coverage was checked.
