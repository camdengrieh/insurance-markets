# Bagel (Predict on easy mode) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public pages (App Store listing, bagel.win marketing site, privacy policy, ToS, changelog), unauthenticated GETs to Polymarket's documented public hosts. No account, wallet, key or signature; no POST; no PayBox money or signing tools. The shared web-search budget was exhausted, so no web search was possible; everything below comes from direct page fetches.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

- Adapter priority: **skip**.
- **Bagel is a mobile front end (iOS/Android app) that routes orders into Polymarket's CLOB under a Polymarket builder code. It is not an independent venue.** Its liquidity is Polymarket's, so it can never be a separate arbitrage leg.
- Evidence for the link (the link is inferred, but the fit is tight):
  - Polymarket's builder API lists a verified builder named "Bagel" with logo and code `0xe8358d12...c72b87` (H, https://data-api.polymarket.com/v1/builders/leaderboard).
  - That builder code's public fee config is 50 bps maker / 100 bps taker (H, https://clob.polymarket.com/fees/builder-fees/<code>). Bagel's ToS charges 0.5% on limit orders and 1% on market orders (H, https://bagel.win/terms-of-service). 50/100 bps = 0.5%/1%: same numbers, same maker/taker split. Strong match (M-to-H that the two are the same operator).
  - App Store version 1.0.1 (7 May) is described as "Migrating to CLOB V2 Version", which is Polymarket's order-book version name (H text on listing, M that it means Polymarket).
  - Bagel's own pages never name Polymarket (H: not in listing, homepage, privacy policy, ToS, changelog). The privacy policy says Bagel uses "decentralized prediction market protocols"; the ToS says "underlying blockchain smart contracts" (H).
- Nothing integrable that the Polymarket adapter does not already give. The only Bagel-specific data worth keeping is the builder-attributed volume series that Polymarket publishes (a signal for retail flow / campaign activity), and it belongs in the Polymarket adapter.

## Liveness (still live in 2026-10?)

- App Store listing live; latest version 1.5.0 shown as "1 day ago" (H, https://apps.apple.com/gb/app/bagel-predict-on-easy-mode/id6760811152; exact date not shown). Version history: 1.0 on 2 May, 1.0.1 on 7 May, 1.2.0 on 17 Jul (limit orders), 1.3.0 19 Aug, 1.4.0 24 Sept (combo support) (H; listing gives no years, the site changelog confirms 2026 for 1.1.0-1.3.0).
- Site changelog's latest entry is v1.3.0, 14 Aug 2026, so the web changelog lags the App Store (H, https://bagel.win/changelog).
- Polymarket builder volume is still flowing: rank 3 builder on the DAY bucket, 13 on WEEK, 19 on MONTH, 29 on ALL on 2026-10-19 (H, data-api leaderboard). The current weekly bucket (week starting 2026-10-18) is partial.
- Developer: GM AI Singapore Pte. Ltd. (H, App Store). Hint said release 2026-05-06; App Store shows first version 2 May and CLOB V2 migration 7 May, so "early May 2026" (H).

## Kind and market model

- Kind: broker/front end (mobile app with social features) over Polymarket. Non-custodial per its ToS: "Bagel operates as a non-custodial platform" (H). Wallet management via Privy social login; Onramper for fiat on-ramp/KYC (H, https://bagel.win/privacy-policy).
- Features (H, App Store and changelog): For You feed, Live sports/esports data, Following/copy trading, group chat, leaderboards, rewards/campaigns (World Cup $20,000 prize pool, May 2026), limit orders (Jul 2026), slippage protection, crypto tab, "combo support" (Sept 2026, meaning not documented; unknown whether it is a Bagel-native parlay or a basket of Polymarket orders).
- Categories shown: sports, esports, crypto, trending events (H, bagel.win).
- Market model and outcome tokenisation: assumed identical to Polymarket's CLOB (binary Yes/No ERC-1155 conditional tokens, neg-risk for categorical, order book). NOT independently confirmed from Bagel; see the Polymarket spec.

## Chains and collateral

- Not stated anywhere on Bagel's pages. NOT FOUND (searched: App Store listing, homepage, privacy policy, ToS, changelog, regions page). Privacy policy says only "the blockchain" and lists "stablecoin, Apple Pay, Google Pay" processors (H).
- Inferred from the Polymarket builder link: Polygon, Polymarket collateral (pUSD / USDC.e per the Polymarket spec) (M).
- Funding paths advertised: stablecoin, Apple Pay, Google Pay, Onramper fiat (H, privacy policy). Withdrawal links appear in transaction history (H, changelog v1.3.0).

## Read API

- `exists`: **none** (no official Bagel API). NOT FOUND (searched: bagel.win homepage links, privacy policy, ToS, changelog; docs.bagel.win and app.bagel.win do not resolve; api.bagel.win returns 404 on `/`; no GitHub/developer link on the site). The homepage is a static marketing page with no JS bundles to inspect (H).
- Real read path for the same markets: Polymarket's public APIs (gamma-api, clob, data-api, websockets). Belongs in the Polymarket adapter.
- Public Polymarket endpoints that expose Bagel as a builder (all unauthenticated GET, H, fetched 2026-10-19):
  - `https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL|MONTH|WEEK|DAY&limit=50&offset=0` (limit appears capped at 50; returns `rank, builder, builderCode, volume, activeUsers, verified, builderLogo`).
  - `https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH|WEEK|ALL` (time series per builder, `dt` is the bucket start).
  - `https://clob.polymarket.com/fees/builder-fees/<builderCode>` returns `builder_maker_fee_rate_bps`, `builder_taker_fee_rate_bps`, `enabled`.
- Auth and rate limits for Bagel: n/a. Polymarket's limits: see the Polymarket spec.
- Fixtures saved (all from documented Polymarket hosts, none from Bagel):
  - `docs/research/fixtures/bagel-predict-on-easy-mode/polymarket_builders_leaderboard_bagel_2026-10-19.json`
  - `docs/research/fixtures/bagel-predict-on-easy-mode/polymarket_builder_volume_monthly_bagel_2026-10-19.json`
  - `docs/research/fixtures/bagel-predict-on-easy-mode/polymarket_builder_volume_weekly_bagel_2026-10-19.json`
  - `docs/research/fixtures/bagel-predict-on-easy-mode/polymarket_clob_builder_fees_bagel_2026-10-19.json`

## Trade path

- Programmatic order placement via Bagel: **none**. No API; ToS prohibits "unauthorized bots, spiders, or scripts to access or interact with the smart contracts or platform" (H, ToS).
- An agent that wants these markets should trade on Polymarket directly (L1/L2 CLOB credentials, EIP-712 signed orders, per the Polymarket spec). Do not attach Bagel's builder code to your own orders: that misattributes volume and would add 50/100 bps of builder fee if the builder code is enabled (H that the config says enabled, with those rates).

## PayBox reachability

- `paybox_reachable`: **partial**. Nothing to call on Bagel itself (mobile app, Privy-managed wallet, no API). The underlying Polymarket CLOB is EVM/Polygon, and a PayBox EVM wallet could in principle trade there via signed orders and approvals, independent of Bagel (M; see the Polymarket spec; not tested, no signing tools used).

## Fees

- Bagel fee schedule (H, https://bagel.win/terms-of-service): market orders of $5.00 or more 1%; market orders under $5.00 flat $0.05; limit orders 0.5% regardless of size; deducted automatically at execution; Bagel may change fees at any time. The payer is the end user.
- Matches the Polymarket builder-fee config for Bagel's code: 100 bps taker, 50 bps maker, enabled (H). So Bagel's fee appears to be the Polymarket builder fee, charged on top of Polymarket's own protocol fees (M; Polymarket's own fee formula is in the Polymarket spec). Net effect: users get strictly worse prices than on Polymarket direct.
- Trading rebate program for partners, ambassador program (H, homepage; terms NOT FOUND).

## Resolution mechanism and dispute risk

- Not stated by Bagel. Inherited from Polymarket (UMA optimistic oracle for most markets; see the Polymarket spec) (M). Dispute risk therefore equals Polymarket's, and is perfectly correlated with it.

## Geo / ToS / automation

- Restricted jurisdictions per ToS (H): Cuba, Iran, North Korea, Syria, Russia, Belarus, Crimea/Donetsk/Luhansk, Venezuela, Myanmar, the United States, Canada, the United Kingdom, France, Italy, Spain, Singapore, Australia, mainland China. VPN circumvention prohibited. Note the listing being visible on the UK App Store does not mean UK use is permitted.
- Age 18+ (H). Regions page lists supported countries for download, not a block list (H, https://bagel.win/regions).
- Automation: bots/scripts prohibited without authorization; multi-accounting to exploit rewards prohibited (H, ToS). No API terms exist.

## Liquidity (Polymarket builder-attributed volume, source data-api.polymarket.com, fetched 2026-10-19)

- Monthly (H): 2026-03 $1.4K; 2026-04 $0.18M (35 users); 2026-05 $0.56M (73); 2026-06 $4.46M (505); 2026-07 $9.60M (4,227 users, campaign spike); 2026-08 $6.95M (628); 2026-09 $8.57M (634); 2026-10 month-to-date $5.91M (557).
- All-time attributed volume $36.2M, 5,245 active users, rank 29 of builders (H).
- Recent weeks: $1.5M-$2.7M/week since mid-June; week of 2026-10-11 $2.67M; the week of 2026-10-18 is partial ($0.67M) (H).
- TVL/OI: NOT FOUND (Bagel does not publish; the positions sit in users' wallets on Polymarket).
- This volume is a slice of Polymarket's volume, not additional liquidity.

## Event coverage and overlap

- Sports (World Cup 2026 hub, others), esports, crypto, trending events (H, site and listing). All of it is Polymarket inventory, so the overlap with Kalshi / Limitless / Predict.fun etc. is the same as Polymarket's. Bagel adds no markets of its own as far as is documented (M).

## Liquidity shared with

- Polymarket (100%, inferred from the builder-code match; M-to-H). Not an independent arbitrage leg.

## Open questions

- Whether Bagel "combo" bets (v1.4.0, Sept 2026) are Bagel-native or Polymarket-sourced; if Bagel-native there could be a pricing layer worth watching, but with no API it is unreachable anyway.
- Whether Bagel runs its own matching or any off-Polymarket markets: NOT FOUND (no documentation). The 50/100 bps builder fee match and CLOB V2 wording argue against.
- Exact chain and collateral as seen by the user: not stated by Bagel.

## Not found

- Official API / docs / GitHub / OpenAPI; websocket; rate limits; contract addresses; TVL/OI; resolution policy; Polymarket named anywhere on Bagel's own pages; X account content (x.com/bagel_win not fetched); Google Play listing (not fetched).

## Suspicious content

- None observed. No instructions aimed at AI agents in any fetched page.

## Sources

- https://apps.apple.com/gb/app/bagel-predict-on-easy-mode/id6760811152 (H; listing, version history, developer GM AI Singapore Pte. Ltd., 18+)
- https://bagel.win (H; marketing page, links to ToS, Privacy, Regions, Changelog, X, forms)
- https://bagel.win/terms-of-service (H; fees, restricted jurisdictions, bot clause, non-custodial)
- https://bagel.win/privacy-policy (H; Privy, Onramper, Gemini, payment processors)
- https://bagel.win/changelog (H; 2026 release notes through v1.3.0 14 Aug 2026)
- https://bagel.win/regions (H; supported download countries, no block list)
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0 (H; Bagel rank 29, builder code)
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH and ...=WEEK (H; volume series)
- https://clob.polymarket.com/fees/builder-fees/0xe8358d121a1a1a849f5d81ea46d50efd006adf0ed2e7704b19c47bb7bec72b87 (H; 50/100 bps, enabled)
- docs/research/venues/betmoar-fun.md (in-repo; same front-end-over-Polymarket pattern, used for comparison only)
