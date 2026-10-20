# Whalidate (whalidate.com) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

## Verdict

**Not a venue. A custodial Polymarket copy-trading front end.** Orders execute on Polymarket's CLOB and settle on Polygon; Whalidate adds wallet scoring plus an automated copier, and attaches its Polymarket builder code to orders. It has no markets, no order book, no resolution layer and no public API of its own. It shares 100% of its liquidity with Polymarket, so it can never be an independent arbitrage leg. Volume is tiny ($1,360 all-time, 2 active users). **adapter_priority: skip.** Only reusable idea: Polymarket's public builder-attribution endpoints (below) can identify flow tagged with a given builder code, but that belongs to the Polymarket adapter, not a Whalidate adapter.

## Liveness

- Live as of 2026-10-19. [H] https://whalidate.com/ (200), sitemap lastmod up to 2026-10-18, methodology page "last updated Oct 18, 2026".
- Very new. Domain registered 2026-09-29 (RDAP, https://rdap.verisign.com/com/v1/domain/whalidate.com) [H]. First builder-attributed trade 2026-10-01; marked Verified in Polymarket's builder program 2026-10-08 (vendor's own blog https://whalidate.com/blog/polymarket-builders-program/, and `verified: true` in Polymarket data-api rows) [H]. DefiLlama listing created 2026-10-09 17:22 UTC (`listedAt` 1791566579) [H].
- Operating entity not named on About/Terms pages ("the team that runs Whalidate"); hosting EU (Contabo) per https://whalidate.com/about/ [H]. Code is not open source (DefiLlama PR #9991) [H].

## Kind and market model

- Kind: broker-or-frontend (copy-trading bot + wallet scorer "WhaleFinder"). [H] https://whalidate.com/llms.txt
- No markets of its own. Markets are Polymarket binary and categorical (neg-risk) markets, order-book CLOB, outcomes tokenised as Polymarket conditional tokens. Fixture rows carry `market` (condition id), `assetId` (outcome token id), `outcome`, `outcomeIndex` [H] fixtures/whalidate/clob_builder_trades_sample.json. Details of the market model are covered by the Polymarket workflow.
- Copy behaviour: only whale BUYs trigger copies (whale sells do not close copies); fill-or-kill orders for the full copy amount; order book re-read before sending; optional take-profit, stop-loss, breakeven-stop exits. Signal-to-order latency "seconds to a minute" (methodology page), median 3.1 s claimed (llms.txt) [H for claim existence, L for claim accuracy]. https://whalidate.com/methodology/

## Chains and collateral

- Polygon only; collateral USDC or USDC.e on Polygon (deposits "must be" these). [H] https://whalidate.com/terms/ , DefiLlama chain = Polygon.
- Subscription paid in crypto; monthly subscription is a USDC-on-Polygon allowance to a payment contract (up to 12 pulls of the plan price every 30 days); exchange accounts cannot subscribe. [H] https://whalidate.com/pricing/
- No token, no pool or vault, no audit (DefiLlama PR #9991: "Whalidate does not deploy a pool or vault in the trading path") [H]. No contract addresses published (payment contract address NOT FOUND).

## Read API

- **Official/public API: none.** Terms forbid accessing the service by automated means other than those Whalidate provides, and scraping or reselling data in bulk; no API is described anywhere. [H] https://whalidate.com/terms/ , https://whalidate.com/methodology/ ("does not offer a public API or data feed")
- whalidate.com robots.txt: `Disallow: /api/` for all agents (so any /api path is explicitly off limits to crawlers) [H] https://whalidate.com/robots.txt . I did not probe app.whalidate.com (the signed-in cabinet).
- What exists publicly: HTML pages of ~1,292 scored wallets at https://whalidate.com/whales/ and /whales/{address}/ (derived entirely from Polymarket public data, ToS-restricted from bulk scraping) [H via llms.txt/sitemap]. Same underlying data is available directly from Polymarket's data API, so there is no incremental signal.
- Third-party observability of Whalidate flow (these are Polymarket endpoints, unauthenticated GET, response shapes confirmed 2026-10-19):
  - `GET https://clob.polymarket.com/builder/trades?builder_code=0x7043f01555796d800d711fd807cbb367bd260d85ba45b052ac472b1e049d596f` -> `{data:[...], next_cursor, limit:300, count:135}`; row fields: id, tradeType, takerOrderHash, builder, market, assetId, side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker, transactionHash, matchTime, bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt [H]. Fixture: docs/research/fixtures/whalidate/clob_builder_trades_sample.json (maker/owner redacted).
  - `GET https://data-api.polymarket.com/v2/builders/volume` -> `{data:[{date, rank, builder_name, builder_code, profile_image, verified, volume (shares), active_users}]}`; 6,099 rows across all builders (about 1.9 MB), Whalidate rows filtered in fixture [H]. v1 equivalents (`/v1/builders/volume`, `/v1/builders/leaderboard`) still respond but Polymarket retires Data API v1 on 2026-10-24 (per DefiLlama PR #9990 title, https://github.com/DefiLlama/dimension-adapters/pull/9990) [M]. Fixture: data_api_v2_builders_volume_whalidate_rows.json.
  - `GET https://api.llama.fi/summary/dexs/whalidate?dataType=dailyVolume` (DefiLlama) -> id 9068, category Interface, `doublecounted: true`, daily series. Fixture: defillama_dexs_whalidate.json [H]. `/summary/fees/whalidate` returns "not found" (no fee revenue: builder fee is 0 bps).
- Rate limits / websocket: none documented for Whalidate (NOT FOUND). Polymarket limits are out of scope here.

## Trade path

- **None for third parties.** Only route is the Whalidate web app (app.whalidate.com) with a Whalidate-generated custodial trading wallet. There is no order-placement API, no signing scheme exposed. [H] https://whalidate.com/terms/ , https://whalidate.com/risk/
- Custody: "The trading wallet is custodial: we hold its private keys and sign its transactions." [H] https://whalidate.com/risk/ ; Terms say the same (Polygon trading wallet, keys held, used to sign trades and withdrawals) [H]. The listing PR text says instead "each user's funds stay in their own Polymarket deposit wallet" [H that PR says it, but contradicted by the vendor's own Terms/Risk pages; treat as custodial]. Withdrawal steps are not documented on the pricing page (NOT FOUND); Terms list withdrawal delays (new-address waiting period, email confirmation, 24 h limit, hold rights).
- Builder-code mechanics (Polymarket side): the code is attached to each order and is part of the signed order; volume is credited per matched trade carrying it. [H] https://docs.polymarket.com/builders/overview

## PayBox reachability

- **No** as a trading venue. A PayBox EVM wallet on Polygon could only (a) send USDC to Whalidate's custodial wallet (giving up custody) or (b) pay the subscription. Neither is a transaction proposal or signed order against a market. If the aggregator wants Polymarket exposure from PayBox it should use the Polymarket adapter directly (own keys, no custodian, no subscription). [M, inference from H facts above]

## Fees

- No per-trade fee or profit share; subscriptions only: Free $0 (paper only), Starter $49/mo ($490/yr), Pro $149/mo ($1,490/yr), Elite $349/mo ($3,490/yr); live budget caps $5k/$25k/$50k per single live strategy. [H] https://whalidate.com/pricing/
- Polymarket builder fee is 0 bps maker and taker (set 2026-10-08); Polymarket cap is 50 bps maker / 100 bps taker. [H] https://whalidate.com/blog/polymarket-builders-program/ ; every fixture row has `builderFee: "0"` (135/135) [H].
- Polymarket's own trading fee passes through to the user (`feeUsdc` is non-zero on 113 of 135 builder rows, `feeUsdc` e.g. 0.00303 on a 43.4-share SELL at 0.999) [H]. Fee formula is covered by the Polymarket workflow, not re-derived here.
- Subscription is paid by the user; Whalidate does not take a cut of trades.

## Resolution and dispute risk

- Inherited entirely from Polymarket (UMA optimistic oracle). Whalidate's Terms and Risk page say resolutions can be disputed, delayed or go against the user, capital is locked until resolution, and Polymarket can restrict access which may strand open positions. [H] https://whalidate.com/risk/ , https://whalidate.com/terms/
- Extra Whalidate-specific risk: custodial key holding (breach, bug, shutdown), no insurance/guarantee, liability cap = greater of 12 months of fees or $100 with an exception for gross negligence of wallet funds. [H] https://whalidate.com/terms/

## Geo / ToS / automation

- Restricted: Cuba, Iran, North Korea, Syria, Crimea, Donetsk, Luhansk; anyone on UN/OFAC/EU/UK sanctions lists; 18+ only; VPN or false info to circumvent breaks the Terms. The page adds that Polymarket restricts further countries and the user must check. [H] https://whalidate.com/restricted-countries/ , https://whalidate.com/terms/
- Automation: users "may not access the Service by automated means other than those Whalidate provides, or scrape or resell data in bulk" (paraphrase of Terms) [H]. So no bot integration, no data harvesting.

## Liquidity (all small, all Polymarket-routed)

- DefiLlama (fetched 2026-10-19, series through 2026-10-18): all-time builder-attributed volume **$1,360**; 24h $96; 7d $707; 30d $1,360; `doublecounted: true`; no TVL. [H] https://api.llama.fi/summary/dexs/whalidate?dataType=dailyVolume
- Polymarket CLOB builder feed (2026-10-19): 135 trades (89 BUY, 46 SELL, all TAKER, all confirmed) across 58 markets, $1,413.86 USDC total from 2026-10-01 to 2026-10-19 01:34 UTC, **2 distinct trading wallets**; zero trading days on 2026-10-05, 07, 08-10. [H] computed from the unauthenticated feed.
- Polymarket v2 daily builder rank for Whalidate: 98 to 183 (of roughly 190+ builders), `active_users` 1-2. [H] fixtures/whalidate/data_api_v2_builders_volume_whalidate_rows.json
- No OI, no order book depth of its own.

## Event categories and overlap

- Whatever Polymarket lists (sports heavy: methodology filters mention share of sports trading and blocked sports leagues; politics, crypto, macro etc.). Overlap with other venues is therefore identical to Polymarket's. Arbitrage must be taken against Polymarket itself, not "Whalidate". [M]

## Shared liquidity

- **Shares liquidity with Polymarket: 100%.** Orders hit the Polymarket CLOB; Whalidate is an interface, flagged `doublecounted: true` on DefiLlama. NOT an independent leg. [H]

## Signal value (for the Quotient-style signal layer)

- Wallet scores are derived from public Polymarket leaderboards, per-wallet activity and the Polygon chain (methodology page) [H], so the same raw data is available directly. The scoring output is HTML-only and bulk use is restricted by ToS. The firm's own claim stats (166 of 1,346 scored wallets "pass", 9,883 replayed copies, 58% win, ~$1.50 per $100) are marketing research of unknown rigor [L].

## Discrepancies and red flags

1. Custody: listing PR says non-custodial deposit wallet; Terms and Risk pages say Whalidate holds the keys. Went unaddressed in the awesome-polymarket review (https://github.com/arnaudknobloch/awesome-polymarket/pull/20) [H]. Use the vendor's own legal pages.
2. llms.txt claims "955 live fills over 60 days", but builder-attributed Polymarket trades total 135 since 2026-10-01 and the domain was registered 2026-09-29. The two cannot be reconciled from public data (could be pre-builder-code or unattributed fills) [M]. Treat all usage claims as unverified.
3. Very young, anonymous operator, tiny real volume (2 wallets), custodial keys. Not suitable to route agent funds through.
4. The submitter of the third-party directory/DefiLlama listings states they work for the company (conflict of interest disclosed in PR #20) [H].

## Adapter recommendation

- **skip.** Dead end for integration: no API, ToS bans automation, custodial, tiny, duplicate liquidity. If the aggregator wants Polymarket coverage use the Polymarket adapter; if it wants to track builder-routed flow, use Polymarket's `/builder/trades` and `/v2/builders/volume` endpoints in that adapter.

## Not found

- Public/official API, API docs, websocket, rate limits (searched: site pages, llms.txt, robots.txt, sitemap, Terms, methodology).
- Smart-contract addresses for the subscription payment contract (searched: pricing, terms, DefiLlama PR).
- Operating company name, jurisdiction, governing law (Terms name none).
- Withdrawal procedure details, wallet creation mechanics.
- GitHub org/repo (DefiLlama lists none).
- Independent reviews (searched: web search; only an AlternativeTo stub with no reviews).
- Suspicious/embedded AI-directed instructions: none seen in fetched pages. (robots.txt lists AI crawlers by name with `Allow: /`; the site includes a referral link to launchpoly.com in its footer. Neither is an instruction.)

## Sources

- https://whalidate.com/ [H] (landing, plans, restricted-countries note)
- https://whalidate.com/llms.txt [H] (saved: docs/research/fixtures/whalidate/whalidate_llms.txt)
- https://whalidate.com/methodology/ , /terms/ , /risk/ , /about/ , /pricing/ , /restricted-countries/ , /blog/polymarket-builders-program/ [H]
- https://whalidate.com/robots.txt , /sitemap.xml , https://app.whalidate.com/robots.txt [H]
- https://rdap.verisign.com/com/v1/domain/whalidate.com [H] (registration 2026-09-29)
- https://api.llama.fi/summary/dexs/whalidate?dataType=dailyVolume , https://api.llama.fi/protocol/whalidate [H] (https://defillama.com/protocol/whalidate itself returned HTTP 403 to the fetch tool)
- https://github.com/DefiLlama/dimension-adapters/pull/9991 [H] (merged 2026-10-08; builder code, 0 bps, methodology); PR #9990 title only [M]
- https://clob.polymarket.com/builder/trades?builder_code=... , https://data-api.polymarket.com/v2/builders/volume , https://data-api.polymarket.com/v1/builders/leaderboard [H]
- https://docs.polymarket.com/builders/overview [H]
- https://github.com/arnaudknobloch/awesome-polymarket/pull/20 [H]
- Web search "Whalidate Polymarket builder" and "Whalidate copy trading Polymarket review custody" [M] (no independent review found)

## Fixtures

- docs/research/fixtures/whalidate/defillama_dexs_whalidate.json (2 KB)
- docs/research/fixtures/whalidate/clob_builder_trades_sample.json (3 KB; 3 of 135 rows; third-party wallets redacted)
- docs/research/fixtures/whalidate/data_api_v2_builders_volume_whalidate_rows.json (5 KB; Whalidate rows only)
- docs/research/fixtures/whalidate/whalidate_llms.txt (6 KB; vendor support address redacted)
