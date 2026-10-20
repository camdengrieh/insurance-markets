# Kiyotaka Prediction Market (kiyotaka.ai, now openmarket.xyz)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session (URL cited), M = secondary or inferred, L = weak or stale. Read-only: only public unauthenticated GETs, no account, no key, no signing.

## Verdict

- **adapter_priority: skip.** Kiyotaka's "prediction market" was a Polymarket front-end (builder-code overlay), so it has no liquidity of its own. The Polymarket volume attributed to it stopped in the first week of July 2026, and the operator's current terms list Polymarket as a data source only, with order entry limited to Hyperliquid perps and Alpaca stocks. The company still exists and the domain is live, but it no longer offers a Polymarket trading venue to adapt.
- **Not an independent arbitrage leg.** 100% of fills went to Polymarket's own CLOB. A scanner reads Polymarket directly (covered by the parallel workflow) and gets nothing extra from Kiyotaka.
- **Only residual value:** OpenMarket's paid Polymarket analytics API (smart-money, leaderboard and position-distribution data) could be a signal source. It needs a paid Standard or Advanced key, and Polymarket's own data API gives similar position and leaderboard data for free, so it is not worth an adapter now.

## Is it live (2026)?

- **The domain is live but redirects.** `https://kiyotaka.ai/`, `/blog`, `/user-guides`, `/polymarket` and `/prediction-market` all return `301` to the same path on `https://openmarket.xyz/` on 2026-10-19 [H: curl -I]. On openmarket.xyz the `/prediction-market` path returns 404, so no dedicated prediction-market landing page survives [H]. `https://openmarket.xyz/` returns 200 with `last-modified: Thu, 15 Oct 2026` [H]. `docs.kiyotaka.ai` has an expired TLS certificate and `app.kiyotaka.ai` does not resolve [H].
- **OpenMarket is the same company's renamed product (inferred) [M].**
  - OpenMarket's terms name the operator as Thalamus Technologies, Inc. [H: https://openmarket.xyz/terms]. A web-search snippet states kiyotaka.ai is owned and operated by Thalamus Technologies, Inc. [M: search result, not opened].
  - OpenMarket's 404 page ships `localStorage` key `kiyotaka-theme` and a WebSocket config `wss://api.chart.ore.kiyotaka.ai/v2/` [H: page source of https://openmarket.xyz/llms-full.txt, which is a 404 page].
  - `api.kiyotaka.ai` and `api.openmarket.xyz` answer identically (302 to `/docs/`) [H].
  - The intro copy "a social, professional-grade charting platform ... across crypto, equities, and prediction markets" is the same on both brands [H: https://openmarket.xyz/learn/getting-started/introduction.md; M: search snippet for kiyotaka.ai].
  - I found no announcement of the rename [NOT FOUND, searched: openmarket.xyz docs and terms, one web search].
- **The Polymarket trading product looks discontinued.**
  - Polymarket's public builder volume feed shows Kiyotaka's builder code with $4,772 in June 2026 and $6.66 in July 2026, then nothing in Aug-Oct 2026 [H: https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH and WEEK]. Other builders are present in every later period (about 260-340 per month), so the gap is real. Fixture: `polymarket-builders-volume-rows.json`.
  - A second builder named "OpenMarket" (different code) has attributed volume of $160k (May), $3.65M (June) and $2.60M (July) with only 1-2 active users, and nothing after the week starting 2026-07-05 [H]. Two active users on millions suggests a couple of large accounts or the team's own flow [L]. I could not tell who they are.
  - DefiLlama shows 0 fees for the last 30 days and the last volume point on 2026-07-06 ($6.11) [H: https://api.llama.fi/summary/dexs/kiyotaka-prediction-market, .../fees/...].
  - OpenMarket's terms (last updated 28 September 2026) list "Polymarket (Prediction Market Data)" under third-party services, and say order entry is Hyperliquid (perps, "Wallet Execution") and Alpaca Securities LLC (stocks/ETFs, "Brokerage Execution") [H: https://openmarket.xyz/terms, read via WebFetch summary, not verbatim].
  - I did not log in, so I cannot rule out a Polymarket order ticket in the app UI. The evidence above says it is not active.
- DefiLlama still lists "Kiyotaka Prediction Market" (id 7888, category Interface, chain Polygon, tag "Polymarket Builder", twitter kiyotaka_ai) with an empty TVL series [H: https://api.llama.fi/protocol/kiyotaka-prediction-market]. The listing is stale rather than evidence of life. The DefiLlama web page itself returned 403 to WebFetch.

## Kind and market model

- Kind: broker-or-frontend (Polymarket builder-code front-end), now folded into a charting and analytics platform [H: DefiLlama description "a prediction platform powered by Polymarket"; DefiLlama methodology "Builder fees received by Kiyotaka from trades on Polymarket v2"].
- Market model: none of its own. Markets are Polymarket's: binary and neg-risk categorical outcome tokens on Polymarket's central limit order book. Polymarket specifics belong to the Polymarket spec.
- Mechanism: the front-end attaches its `bytes32` builder code to each order. The code is serialised into the signed order on-chain, and a builder fee is charged on matched volume [H: https://docs.polymarket.com/programs/builders/overview.md, https://docs.polymarket.com/programs/builders/fees.md].
- Kiyotaka's builder code: `0x2096c1dd5e4d0c660ce764ab20a3a95853d11e27724b3c73cad543352da1555f` (public on Polymarket's builder leaderboard) [H]. The "OpenMarket" builder code is `0xc1d36415252eaf505b23758bdf8f124f2e8661f65eb634b12064c629c475b290` [H]. That the second belongs to the same operator is an inference from the name [L].

## Chains and collateral

- Polygon (DefiLlama chain field) [H]. Collateral is whatever Polymarket CLOB V2 uses (the builder fee docs speak of pUSD). Not verified here, see the Polymarket spec.
- Nothing Kiyotaka-specific on-chain: no contracts of its own were found [NOT FOUND, searched: DefiLlama protocol record has `address: null`, no `github`, no `treasury`; GitHub repo search returned 404].

## Read API

- **Venue read API: NONE.** There is no Kiyotaka or OpenMarket order book, price feed or resolution feed for a trading venue, because there is no venue. Read Polymarket directly.
- **OpenMarket Data API (analytics / market-data mirror)**, docs: https://openmarket.xyz/docs/introduction.md (also in `llms.txt`) [H].
  - Base URL: `https://api.openmarket.xyz` (REST). `api.kiyotaka.ai` is an alias of the same backend [H].
  - Auth: header `X-OpenMarket-Key` on every request. Keys are generated in account settings and come with all plans (Free, Basic, Standard, Advanced). Keys are "server-side credentials" [H: https://openmarket.xyz/docs/authentication.md]. I did not create a key.
  - Unauthenticated check: `GET /v1/polymarket/analytics/platform-summary` returns `401` with body `missing or invalid api key` [H, fixture `openmarket-api-unauthenticated-401.txt`]. So there is no public response shape to sample.
  - Rate limits: weight-based per minute. Tiers: Free 10 weight/min and 1,000/day with 7 days of history; Basic $99/mo 150/min; Standard $199/mo 350/min; Advanced $599/mo 1,500/min (burst 20/300/700/3,000) [H: https://openmarket.xyz/docs/rate-limits.md]. Metadata endpoints weigh 0.
  - Prediction-market read endpoints:
    - `GET /v1/markets?exchange=POLYMARKET` returns a `predictionMarkets[]` array with `slug`, `question`, `outcomes`, `lastPrice`, `prices`, `totalVolume`, `buyVolume24H`, `sellVolume24H`, `openInterest`, `uniqueTraders`, `orderPriceMinTickSize`, `conditionId`, `closed`, `availableTo`, `sportsMarketType`, `line` [H: https://openmarket.xyz/docs/rest/metadata.md; fixture `openmarket-docs-markets-predictionMarkets-fields.md`]. Whether it is open to the Free tier is not stated [NOT FOUND].
    - `GET /v1/polymarket/analytics/{leaderboard,trader-profile,positions,market-summary,user-categories,platform-summary,platform-distribution}`. Weights 40-100 each. Standard and Advanced tiers only, GET only, no WebSocket. The page says these are analytics only: no live prices, no order books, no raw trade feed, no resolution feed [H: https://openmarket.xyz/docs/rest/polymarket-analytics.md].
  - WebSocket: exists for crypto channels (`TRADE`, `TRADE_AGG`, `BLOCK_BOOK_SNAPSHOT`, etc.) at `wss://ap-sin3.ws.api.openmarket.xyz/...` and `wss://eu-de3.ws.api.openmarket.xyz/...` [H: https://openmarket.xyz/docs/ws/overview.md]. No Polymarket channel is documented [NOT FOUND].
- **Independent public data about this venue** (what the fixtures come from): Polymarket's `data-api.polymarket.com/v1/builders/leaderboard` and `/v1/builders/volume` (unauthenticated GETs, parameters `timePeriod=DAY|WEEK|MONTH|ALL`, `limit`, `offset`). These endpoints were not listed in Polymarket's `llms.txt` doc index, so they are undocumented there and could change [H for behaviour, L for stability].
- Fixtures: `docs/research/fixtures/kiyotaka-prediction-market/`.

## Trade path

- **None.** No Kiyotaka or OpenMarket trading API exists for prediction markets. The product's own terms limit order entry to Hyperliquid and Alpaca [H].
- To trade the same liquidity programmatically, use Polymarket directly (EIP-712 signed CLOB orders), which is the Polymarket adapter's job. Attaching Kiyotaka's builder code would only route a fee to Kiyotaka and is pointless.
- **PayBox reachable: no, not through this venue.** There is nothing to propose or sign against Kiyotaka. A PayBox EVM wallet on Polygon could reach Polymarket itself, which is out of scope for this note.

## Fees

- Builder fee on Polymarket trades: a flat percentage of notional, `builder_fee = notional * rate_bps / 10000`, additive to Polymarket's platform fee. Maximum 100 bps taker and 50 bps maker, set by the builder, with a 7-day cooldown and 3 days' notice on changes [H: https://docs.polymarket.com/programs/builders/fees.md].
- Kiyotaka's actual rate: NOT FOUND (searched: DefiLlama methodology, OpenMarket terms, docs). Implied by DefiLlama data: $2,521 in fees over about $1.02M volume since 2026-04-28 is about 0.25% [M: my division, DefiLlama fee series starts 2026-04-28 and may not capture all trades].
- Current OpenMarket fees: 0.02% (2 bps) Hyperliquid builder fee, no per-trade fee on Alpaca brokerage orders [H: https://openmarket.xyz/terms]. Neither applies to prediction markets.

## Resolution mechanism and dispute risk

- Inherited entirely from Polymarket (UMA-style oracle and its dispute path, covered by the Polymarket spec). Kiyotaka adds no resolution layer and holds no funds, so its own dispute risk is nil.
- The OpenMarket terms (section 10) note that prediction markets rely on oracles for resolution [H, via WebFetch summary].

## Geo, ToS and automation

- OpenMarket terms (28 Sept 2026) [H, via WebFetch summary, not verbatim]: non-custodial software provider, not an exchange or broker. "Wallet Execution" (Hyperliquid) is unavailable to persons in the United States, Malaysia, comprehensively sanctioned jurisdictions, Ontario, and Crimea/Donetsk/Luhansk, enforced by network country checks, and VPN circumvention is prohibited. Charts and market data are open to everyone.
- Automation: the terms prohibit scraping or exploiting the platform's code or API, wash trading, spoofing, manipulation, and copy-trading into brokerage accounts. Orders are said to be "entered by you, one at a time". Bots are not addressed directly. The paid Data API with a key is the sanctioned programmatic route.
- Attribution risk if the old product is used: Polymarket may revoke a builder's fee ability for "fraudulent, deceptive, misleading, automated, self-referred" volume [H: Polymarket builder fees doc]. Not relevant to a scanner.

## Liquidity

- All-time attributed Polymarket volume for Kiyotaka's builder code: **$3,644,839.53** with 191 active users, rank 101 [H: https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL, fetched 2026-10-19]. DefiLlama's all-time dex volume for the listing is $3,644,092, which matches [H].
- By month (builder volume feed): Dec 2025 $2.5k; Jan 2026 $748k; Feb $587k; Mar $751k; Apr $598k; May $953k; Jun $4.8k; Jul $6.66; Aug-Oct nothing [H]. Peak was about $0.6-0.95M per month with 12-123 active users, which is small next to Polymarket's roughly $450M-$1.5B per month of builder-attributed volume across all builders in the same feed (sum of the feed's monthly rows: Jun 2026 about $1.5B, Oct 2026 month-to-date about $456M) [M: my sum].
- OpenMarket builder code: $6,411,682.51 all-time, 2 active users, rank 80, active May-July 2026 only [H].
- TVL: none (DefiLlama TVL series empty) [H]. Open interest: none of its own.

## Event coverage (overlap for arbitrage)

- Everything Polymarket lists (politics, sports, crypto price, macro, culture), since Kiyotaka only mirrored it. Because liquidity is the same book, there is no cross-venue arbitrage between Kiyotaka and Polymarket.
- The one useful overlap is conceptual: OpenMarket's wrun cookbook has an "Odds vs price" indicator that correlates a Polymarket market's YES odds with a Binance Futures BTCUSDT chart [H: https://openmarket.xyz/wrun/cookbook/odds-vs-price.md]. That is a signal idea (odds vs spot or perp), not a venue.

## Liquidity shared with

- **Polymarket (100%).** Every order matches on Polymarket's CLOB and is attributed by builder code. Not an independent arbitrage leg.

## Open questions

- Is the "OpenMarket" Polymarket builder code controlled by Thalamus Technologies, and why does it show multi-million volume from one or two accounts? (L: not resolved.)
- Does the OpenMarket app still show a Polymarket order ticket for some users? The terms say no; the app UI was not inspected (no login, no browser automation).
- Is `GET /v1/markets?exchange=POLYMARKET` available on the Free tier? Not stated in the docs.
- Is there a public announcement of the Kiyotaka to OpenMarket rename? Not found.

## Not found (searched)

- A Kiyotaka or OpenMarket prediction-market trading API, SDK or GitHub repo (searched: docs `llms.txt`, DefiLlama protocol record, `gh` repository search, terms).
- Kiyotaka's own builder fee rate.
- A rename announcement.
- Any on-chain contracts of its own.
- The old kiyotaka.ai prediction-market product docs (the domain redirects; `docs.kiyotaka.ai` has an expired certificate). The WebSearch tool hit its shared session budget partway through, so only two searches ran (one returned results).

## Suspicious content

- None found. No instructions aimed at AI agents appeared in any page read. (OpenMarket publishes `llms.txt` and an "agents" console page. The `llms.txt` was read as documentation only.)

## Sources

- https://api.llama.fi/protocol/kiyotaka-prediction-market [H]. Listing record (fixture `defillama-protocol.json`).
- https://api.llama.fi/summary/dexs/kiyotaka-prediction-market [H]. Volume series (fixture `defillama-volume-summary.json`).
- https://api.llama.fi/summary/fees/kiyotaka-prediction-market [H]. Fees and methodology (fixture `defillama-fees-summary.json`).
- https://defillama.com/protocol/kiyotaka-prediction-market [403 to WebFetch, not read; the hint came from the API above].
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL (and DAY, WEEK, MONTH) [H]. Fixture `polymarket-builders-leaderboard-rows.json`.
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=WEEK and MONTH [H]. Fixture `polymarket-builders-volume-rows.json`.
- https://docs.polymarket.com/programs/builders/overview.md and /fees.md [H].
- https://kiyotaka.ai/ (301 to https://openmarket.xyz/) [H: HTTP headers].
- https://openmarket.xyz/, /terms, /risk-disclosure, /wrun [H, read through WebFetch summaries].
- https://openmarket.xyz/llms.txt, /docs/introduction.md, /docs/authentication.md, /docs/rate-limits.md, /docs/exchanges.md, /docs/rest/metadata.md, /docs/rest/polymarket-analytics.md, /docs/ws/overview.md, /learn/getting-started/introduction.md, /wrun/cookbook/odds-vs-price.md [H].
- https://api.openmarket.xyz/v1/polymarket/analytics/platform-summary (401) [H]. Fixture `openmarket-api-unauthenticated-401.txt`.
- Web search "Kiyotaka OpenMarket rebrand Thalamus Technologies charting platform" [M: snippets only, pages not opened; produced the "owned by Thalamus Technologies" statement and kScript/V3 mentions].
