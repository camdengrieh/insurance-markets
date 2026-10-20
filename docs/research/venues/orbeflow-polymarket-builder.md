# Orbeflow (Polymarket builder) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Orbeflow is not a venue. It is a verified Polymarket Builder Program code (an order-attribution tag) used by a small, high-volume account set, probably a bot or desk. Every order it routes is matched on Polymarket's own CLOB, so it has no independent liquidity, prices or markets. The only value is as a (weak) flow signal; Polymarket is covered by the parallel workflow.

## Is it live?

- Live as a builder code, as of 2026-10-19: appears in the Polymarket builders leaderboard with `verified: true`, DAY volume of $14.9k with 14 active users, WEEK $1.30M / 39 users, MONTH $16.3M / 69 users. H - https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=DAY (fixture saved)
- Activity is lumpy and falling: monthly matched volume 2026-07 $1.0M (10 users), 2026-08 $23.2M (26), 2026-09 $17.2M (38), 2026-10 (partial month to the 19th) $16.3M (69). All-time $57.76M with 87 active users, rank 21 overall. The months sum to the ALL figure. H - https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH and `/v1/builders/leaderboard?timePeriod=ALL`
- First appearance in July 2026, so the code is about 3-4 months old. H (volume series starts 2026-07-01; earlier months absent from the series, which I take to mean no volume).
- builderCode (public attribution tag): `0x8c06be3657737a03e0b2b9e27f1f82efb2c10a2d1563fdedf6e6997412009ea9`. builderLogo is empty (no branding uploaded). H
- No website, docs, social, repo or app found. `orbeflow.com`, `.xyz`, `.io`, `.app`, `.ai`, `.trade`, plus `www.` and `app.` on .com, do not resolve in DNS (curl error 6). NOT FOUND (searched: DNS for 8 candidate hostnames; grep of this repo's docs only finds the builder leaderboard fixtures; WebSearch extended could not be run because the shared session search budget was exhausted, so no web-search negative is claimed).
- Interpretation: very few users (87 all-time) with ~$660k volume per user suggests a trading bot/desk or a private product, not a consumer frontend. M

## Kind and market model

- kind: broker-or-frontend (Polymarket builder code). H for "it is a builder code", M for "bot/desk".
- Market model = Polymarket's: binary and neg-risk categorical markets on a central limit order book, outcomes as ERC-1155 conditional tokens (CTF), USDC-denominated. Not verified again here; see docs/research/08-venues-polymarket-kalshi.md in this repo and the parallel Polymarket spec. M
- Builder docs: orders are submitted to Polymarket's CLOB and matched there; the builder code "is serialized onchain as part of the signed order" and volume is credited per matched trade carrying the code. H - https://docs.polymarket.com/developers/builders/builder-intro (via WebFetch summary; the page does not state shared liquidity in so many words, it is implied by "submitted to Polymarket's CLOB").

## Chains and collateral

- Polymarket's: Polygon, pUSD/USDC collateral as per the Polymarket spec. Not independently checked for Orbeflow. M
- Builder docs also mention gasless on-chain operations via Polymarket's relayer. H (same page).

## Read API

- exists: **official-public**, but only for builder-level stats; there is no Orbeflow API. Market data comes from Polymarket's own Gamma / CLOB / Data APIs (out of scope; covered elsewhere).
- Base URL: `https://data-api.polymarket.com` H
- Endpoints confirmed with unauthenticated GET, 2026-10-19:
  - `GET /v1/builders/leaderboard?timePeriod={DAY|WEEK|MONTH|ALL}&limit=&offset=` returns rows `{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}`. H (fixture `builders_leaderboard_orbeflow_2026-10-19.json`, four rows, one per timePeriod)
  - `GET /v1/builders/volume?timePeriod=MONTH` returns a per-builder time series `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}`; 2920 rows total for all builders. H (fixture `builders_volume_MONTH_orbeflow_2026-10-19.json`, Orbeflow rows only)
- Not found: any endpoint that lists orders/trades/positions by builder code publicly. NOT FOUND (searched: the two endpoints above only; I did not exhaustively probe other paths). The on-chain order struct carries the builder code, so trades could in principle be attributed by decoding CTF Exchange `OrderFilled` data, M and unverified.
- Auth/limits: the builder endpoints above needed no auth. Numeric rate limits for CLOB/Gamma are "Standard" or "Highest" only, no numbers published (Unverified 100 relayer txns/day, Verified 10,000/day, Partner unlimited). H - https://docs.polymarket.com/developers/builders/builder-tiers (WebFetch summary)
- Websocket: none specific to Orbeflow; Polymarket's own WS belongs to the Polymarket spec.

## Trade path

- None specific to Orbeflow. There is no public Orbeflow order API. An agent would trade by placing Polymarket CLOB orders directly (EIP-712-signed orders, per Polymarket docs); the builder code is optional attribution, and the only reason to use Orbeflow's would be if its owner shared it, which is not applicable. M
- PayBox reachability: **partial/no for this entity**. paybox_reachable = no. Reason: nothing to integrate; the underlying Polymarket route is a separate question handled in the Polymarket spec.

## Fees

- NOT FOUND for Orbeflow. Builder fees exist as a Polymarket feature ("builders ... can charge fees and monetize on flow"), but the docs page gives no rates or caps and is internally inconsistent on which tier unlocks them. H for the doc statement; Orbeflow's own fee, if any, is unknown. - https://docs.polymarket.com/developers/builders/builder-tiers
- Polymarket's own fee schedule is out of scope.

## Resolution and dispute risk

- Same as Polymarket (UMA optimistic oracle based, per prior research in docs/research/08). Orbeflow adds no resolution layer. M

## Geo / ToS / automation

- No Orbeflow ToS exists to read (no site). Polymarket's geo restrictions and ToS apply to the order flow. NOT FOUND for Orbeflow-specific rules.

## Liquidity

- Orbeflow-routed matched volume: $57.76M all-time, $16.33M in Oct 2026 to date, $1.30M in last 7 days, $14.9k last 24h (Polymarket Data API, 2026-10-19). H
- This is a slice of Polymarket volume, not additional liquidity. Shares liquidity with: **Polymarket CLOB (100%)**.

## Event coverage overlap

- Inherits whatever Polymarket lists (sports, politics, crypto price, macro). The category mix of Orbeflow's flow is unknown. Any arbitrage between Orbeflow and Polymarket is nil by construction (same book).

## Adapter notes

- Do not build a venue adapter. If wanted, consume `/v1/builders/leaderboard` and `/v1/builders/volume` as a low-value "who is routing flow" signal; Orbeflow ranked 6th-10th by monthly volume in Aug-Oct 2026 with only 26-69 users, which is consistent with a single large automated trader and could be worth a look only if the project wants smart-money attribution (would need on-chain decoding of the builder field).
- The existing hint "orbeflow.com/.xyz do not resolve" is confirmed (plus six more candidates).

## Suspicious content

- None observed. No instructions aimed at AI agents in any response read.

## Sources

- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL|MONTH|WEEK|DAY (GET, 2026-10-19) H
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH (GET, 2026-10-19) H
- https://docs.polymarket.com/developers/builders/builder-intro (WebFetch, 2026-10-19) H
- https://docs.polymarket.com/developers/builders/builder-tiers (WebFetch, 2026-10-19) H
- DNS probes of orbeflow.{com,xyz,io,app,ai,trade} and www./app.orbeflow.com (all unresolved) H
- Fixtures: docs/research/fixtures/orbeflow-polymarket-builder/
