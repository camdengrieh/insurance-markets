# Polycool (polycoolapp.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

## Verdict

- Adapter priority: **skip** as a trading venue. Polycool is not a market. It is a Polymarket front-end (Telegram mini-app, iOS, Android) that attaches a Polymarket "builder code" to orders and sends them to the Polymarket CLOB. It has the same books and the same liquidity as Polymarket, so it is never an independent arbitrage leg. It has no public API of its own, and it adds fees on top of Polymarket's. [H]
- Only residual value: a wallet-tracking / copy-trading flow signal. The Polycool-attributed flow can be isolated from Polymarket's own public endpoints by builder code (see "Read API"). That belongs inside the Polymarket adapter as an optional signal, not as a Polycool adapter.
- Still live: yes, as of 2026-10-19. Evidence: site returns HTTP 200 with `last-modified: Sun, 18 Oct 2026`; Polymarket data API shows Polycool builder volume on every day 2026-07-22 to 2026-10-19; DefiLlama shows $723 fees on the latest full day. [H]

## Kind and market model

- Kind: broker-or-frontend (analytics, wallet tracking, copy trading, parlay UI on top of Polymarket). [H]
- Its own terms say: "Polycool is an independent interface, research, and portfolio tracking application... orders... executed on the Polymarket platform through Polymarket's publicly available APIs and smart contracts. We are not Polymarket." They also say it is "not an exchange, broker, dealer, money transmitter, or custodian". [H] (site terms, in JS bundle https://polycoolapp.com/assets/index-BimEBjVm.js)
- Market model: inherited from Polymarket. Order book (CLOB) with binary Yes/No outcome tokens, plus Polymarket's multi-outcome events built from binary markets. Order types in the app: market order (min about $1) and limit order (min 5 shares). [H for order types: site docs text in bundle; M for token model, which is Polymarket's and is covered by the parallel Polymarket workflow]
- Parlays: the app has a BETA "Parlays" feature ("3+ legs, AI picks, capped stake and payout", "Max return (payout)... capped at $500", odds quote can be refreshed on a 409). It is not documented whether a parlay is a bundle of CLOB orders or a Polycool-side or Polymarket-side product. See open questions. [H that it exists; settlement mechanics NOT FOUND]
- Polycool's own FAQ: "Polycool is a Certified Polymarket Partner, built on Polymarket's infrastructure. You trade the same markets and liquidity". [H] (FAQ text in the JS bundle)

## Chains and collateral

- Chain: Polygon (DefiLlama lists chain "Polygon", category "Interface", tag "Polymarket Builder"). [H] https://api.llama.fi/protocol/polycool
- Collateral: USDC.e until Polymarket's pUSD migration, pUSD since. The DefiLlama adapter says USDC.e until the pUSD migration and "pUSD since"; the first Polycool fee was 2026-02-02. [H via adapter source; the migration date itself is not verified here]
- Funding: the app creates a per-user embedded wallet through Privy and says funds stay in it ("non-custodial", private key exportable from Settings per the terms). Deposits are accepted from Polygon (USDC.e direct), Ethereum, Arbitrum, Base and Solana (SOL and USDC), bridged to Polygon with Polymarket's cross-chain bridge, minimum about $5. Fiat withdrawal via MoonPay (about 2-3% plus KYC per the docs text). Gas is paid by Polymarket's relayer. [H: site docs strings in the bundle]

## Read API

- Official Polycool API: **none found.** The `/docs` pages (about 35 routes, listed in the bundle) are end-user help: getting started, copy-trading, fees, parlays, portfolio, earn, Telegram bot. There is no developer or API section. The GitHub org PolycoolApp exists but has 0 public repos. The site `/data` page is a dashboard that calls a private Supabase function (`.../functions/v1/dune-proxy`). Other `*.polycoolapp.com` hosts in the bundle (ai., alerts., mmscore., leaderboard-rewards., sponsored-rewards.) are internal and undocumented; I did not probe them. NOT FOUND (searched: sitemap.xml, robots.txt, JS bundle strings for api/webhook/mcp/developer, GitHub org and repo search, DefiLlama listing). [H]
- Only usable public data is Polymarket's, filtered by Polycool's builder code `0x9700262d1ce6bbfde7247f0f849a0814f7faa7496674a221622e06fdb25b0f61` (this code is in the DefiLlama adapter source, and the Polymarket volume API returns the same code for builder_name "Polycool"). [H]
  - `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90` - no auth, HTTP 200, 5.9 MB, 18,707 rows covering 383 builders over the last 90 daily buckets. Row shape: `date, rank, builder_name, builder_code, profile_image, verified, volume, active_users`. Only 90 days are served. Per a comment in DefiLlama's adapter, the v1 Data API is retired on 2026-10-24 and v2 is the replacement (https://docs.polymarket.com/migrate/data-api-v1-to-v2); I did not open that page. [H for shape; M for the retirement date]
  - `GET https://clob.polymarket.com/builder/trades?builder_code=<code>` - no auth, HTTP 200, 300 rows per page, cursor pagination (`next_cursor`, `limit`, `count`). Row fields: `id, tradeType, takerOrderHash, builder, market, assetId, side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker, transactionHash, matchTime, bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`. This is per-trade data for Polycool users' orders and includes their maker wallet addresses. [H]
- Auth and rate limits for those two endpoints: none needed for the GETs I made. Rate limits NOT FOUND for them; the DefiLlama helper sleeps 500 ms between pages. Polymarket's own docs mention builder tiers with rate limits at `/programs/builders/tiers` (not read). [H/M]
- Websocket: none from Polycool. (Polymarket's CLOB websocket is covered by the Polymarket workflow.)
- Docs URL: https://polycoolapp.com/docs (user help only). Builder program: https://docs.polymarket.com/developers/builders/builder-intro (builder code is "serialized onchain as part of the signed order"). [H]

Fixtures saved (all under docs/research/fixtures/polycool/):
- `polymarket-v2-builders-volume-polycool-sample.json` - last 14 daily rows for Polycool, from the v2 builders volume endpoint.
- `polymarket-clob-builder-trades-sample.json` - 3 trade rows from the builder trades endpoint, with id, owner, maker and hash fields redacted (they identify third-party users).
- `defillama-fees-summary-polycool.json` - DefiLlama fee summary (about 20 KB) with the methodology text and daily series.

## Trade path

- Programmatic trade path via Polycool: **none.** No API, no bot-facing endpoint. The only entry points are the Telegram mini-app / bot (https://t.me/PolycoolApp_bot), iOS and Android apps. [H]
- Mechanism underneath: the user's Privy embedded wallet signs Polymarket CLOB orders with the builder code attached; Polymarket's relayer submits gasless transactions. [H via terms, adapter and builder-program docs]
- For the aggregator, trading Polycool's markets means trading Polymarket directly (signed CLOB orders, covered by the Polymarket workflow). You can attach your own builder code there if you want attribution.

## PayBox reachability

- Polycool itself: **no.** Its wallet is a Privy embedded wallet inside the app and there is no way to submit signed orders or transaction proposals to Polycool. [M, from the lack of any API]
- The underlying venue (Polymarket on Polygon) is the reachable target for an EVM wallet. Funding a Polycool wallet from a PayBox EVM wallet is possible in principle (the docs list Polygon, Ethereum, Arbitrum, Base, Solana deposits), but there is no reason to, since it only adds fees. [M]

## Fees

All fees are paid by the trader. [H: DefiLlama adapter methodology]

- Polycool service fee: 1.00% of notional on every buy and sell for a new user, falling with lifetime volume ("Volume Ladder", Shrimp to Whale) to 0.50% above $100K. Collected after each successful trade as a stablecoin transfer from the user's wallet to the Polycool treasury. The marketing line is "Free to download. 1% fee per trade. No subscription." [H]
- Polymarket builder fee: charged inside Polymarket's trade fee and paid out to Polycool daily. In the 300-row sample fetched 2026-10-19, `builderFee / sizeUsdc` was 0.0075 (0.75%) on 299 rows and 0.0074 on 1 row, all `TAKER` trades. Example row: sizeUsdc 2.1, feeUsdc 0.07455, builderFee 0.01575. Whether `feeUsdc` already includes `builderFee` is not confirmed. [H for the numbers; M for the "0.75% flat" reading]
- Standard Polymarket fees also apply ("Standard third-party market fees may also apply"). [H]
- Referrals: referrers earn 25% of service fees (docs text also lists "25% / 5% / 3% commission tiers" and a 10% fee discount for referred friends). [H]
- Net effect for the scanner: executing through Polycool costs roughly 1.25-1.75% of notional more than executing on Polymarket directly (0.50-1.00% service plus about 0.75% builder fee on takers). That is arithmetic on the numbers above. [M]

## Resolution mechanism and dispute risk

- Polycool does not create or resolve markets: "We do not create, operate, resolve, or manage any prediction markets". Resolution is whatever Polymarket's resolution process does (covered by the Polymarket workflow). Polycool offers "Resolution Tracking" and "Auto Redeem" (redemptions are gasless via Polymarket's relayer). [H]
- Extra risk layers on top of Polymarket: Privy wallet infrastructure, Polycool's app-side order handling and its parlay product (settlement unknown). Terms: no guarantee that an order is accepted or filled at any price; arbitration agreement, class-action waiver and jury-trial waiver (terms section 19). [H]

## Geo, ToS and automation

- Users must meet "all eligibility and geographic requirements imposed by Polymarket and any other third-party platform". "Using a VPN or any other tool to conceal your location or circumvent geographic or eligibility restrictions... is strictly prohibited." [H] (terms section 3)
- The site's explainer text says Polymarket "is restricted in the United States". [H]
- Prohibited conduct includes use from a restricted jurisdiction and "market manipulation of any kind, including wash trading, self-trading, spoofing, layering, front-running..." (list truncated in my extraction). An automation-specific rule for bots was not seen; there is no bot API anyway. [H/M]
- robots.txt allows all crawlers including AI crawlers, and disallows only `/assets/`. [H]

## Liquidity

- Polycool has no liquidity of its own. All depth is Polymarket's. [H]
- Polycool-attributed volume, from Polymarket's builder volume endpoint (fetched 2026-10-19; field `volume`; DefiLlama's adapter says the unit is shares, so USD volume may differ slightly): 90 daily buckets (2026-07-22 to 2026-10-19) sum to about 3.27M; last 30 full days about 1.63M; last 7 full days about 289K; daily values 2026-10-06 to 2026-10-18 ranged 25K to 109K; `active_users` 21-53 per day; builder rank 35-54 of 383 over the same days. All builders together were about 22-32M per day on 2026-10-16 to 10-18, so Polycool is about 0.1-0.3% of builder-attributed volume. [H for the numbers, M for the unit]
- Polycool fees (DefiLlama, fetched 2026-10-19): 24h $723, 7d $2,748, 30d $13,979.91, 1y $60,753.32, all time $61,476.32, series starting 2026-02-02. DefiLlama flags the series as double counted (the builder-fee part is also inside Polymarket's own fees). DefiLlama reports no TVL for it. [H] https://api.llama.fi/summary/fees/polycool
- Marketing claims such as "30,000+ markets" are Polycool's own and are Polymarket's market count. [L]

## Event coverage and arbitrage overlap

- Same universe as Polymarket: politics, sports (soccer, basketball, tennis, NHL, esports), crypto price (including Up/Down markets), finance and macro, culture, weather (these are the leaderboard categories on the site). [H]
- Shares liquidity with Polymarket: **yes, entirely.** It is not an independent arbitrage leg. Any cross-venue edge Polycool "has" is Polymarket's edge at a worse price after fees. [H]

## Open questions

- How parlays are priced and settled (CLOB legs vs a Polymarket or Polycool product), and who bears the $500 cap. Not documented in the pages I could read.
- Whether `feeUsdc` in the builder-trades rows includes `builderFee`, and whether the builder fee is a flat 0.75% for takers only (makers were absent in the sample).
- Polycool's X account (@PolycoolApp) and Telegram channels were not checked. WebSearch was unavailable (the session's search budget was exhausted), so no third-party coverage, incident reports or user complaints were searched.
- WebFetch of https://defillama.com/protocol/polycool returned 403; the DefiLlama API was used instead.

## Suspicious content

- None seen that targets AI agents. The site's robots.txt lists AI crawlers as allowed, which is a policy statement and not an instruction. The page embeds ad and analytics pixels (Google Ads, X pixel, Meta pixel, DataFast), which I did not execute.

## Sources

- https://polycoolapp.com/ (HTML, meta tags, JSON-LD, noscript content; fetched 2026-10-19) [H]
- https://polycoolapp.com/assets/index-BimEBjVm.js (first-party JS bundle read as text only, not executed: terms, FAQ, docs strings, fees ladder, funding table) [H]
- https://polycoolapp.com/robots.txt and https://polycoolapp.com/sitemap.xml (sitemap lastmod 2026-03-17) [H]
- https://api.llama.fi/protocol/polycool and https://api.llama.fi/summary/fees/polycool (DefiLlama id 9109, listedAt 1791933797 = 2026-10-13 23:23 UTC) [H]
- https://github.com/DefiLlama/dimension-adapters/blob/master/fees/polycool.ts and helpers/polymarket.ts (read with `gh api`; treasury address, builder code, fee methodology, Polymarket endpoints) [H]
- https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90 (unauthenticated GET, 2026-10-19) [H]
- https://clob.polymarket.com/builder/trades?builder_code=... (unauthenticated GET, 2026-10-19) [H]
- https://docs.polymarket.com/developers/builders/builder-intro (builder program overview, via WebFetch summary) [M]
