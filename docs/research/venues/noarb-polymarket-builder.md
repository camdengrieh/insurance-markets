# NoArb (Polymarket builder) - adapter spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

- NoArb is NOT a venue. It is a builder code (order-attribution tag) on Polymarket's CLOB. All of its orders match on the Polymarket book. [H] [M for the "same book" inference, see below]
- Not an independent arbitrage leg. adapter_priority: skip. Polymarket itself is covered by a parallel workflow.
- Only residual value: a public, per-day/week/month volume and active-user signal for one builder (an arb-flavoured flow). Marginal as a signal. [M]

## Liveness (2026)

- Builder leaderboard (live API, fetched 2026-10-19), NoArb entry [H]:
  - ALL: rank 30, volume 33,248,504 USD, 56 active users, verified=true.
  - MONTH: rank 9, volume 10,592,198 USD, 11 active users.
  - WEEK: rank 10, volume 796,220 USD, 10 active users.
  - DAY: rank 8, volume 136,911 USD, 9 active users.
  - Source: https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0 (and timePeriod=MONTH/WEEK/DAY with limit=100).
- Builder volume time series: NoArb appears only in the 2026-01-01 bucket (volume 33.25M), none in 2025 buckets, so it started trading in 2026. [H] Bucket granularity for timePeriod=ALL is yearly.
- Interpretation: roughly 10M of the 33M ALL volume landed in the last 30 days, so it is active and growing, with a handful of users (likely a few bots/accounts). [M]
- Standalone product: NOT FOUND. noarb.xyz returns 200 then a JS redirect to /lander, which redirects to a GoDaddy/Afternic "for sale" page (parked). www.noarb.xyz behaves the same. [H] Searched: noarb.xyz, www.noarb.xyz, /lander. WebSearch was unavailable (session search budget exhausted), so no website, X/Twitter, GitHub or docs for NoArb was found. [NOT FOUND (searched: noarb.xyz, Polymarket builder leaderboard; web search budget exhausted)]
- Builder code (public identifier from the leaderboard): `0x9fb680eff2c1a05610864e3c892b020cb4fd1e11440836cceacae84eda294352`. [H]

## Kind and market model

- kind: broker-or-frontend (builder code on Polymarket). [H]
- Market model: identical to Polymarket - binary/categorical via CTF outcome tokens, central limit order book (CLOB). Not re-researched here; covered by the Polymarket workflow. [M]
- Builder code is a 32-byte hex field `builder` inside the signed order struct (default zeros); SDKs take `builderCode` (TS) / `builder_code` (Python). [H] https://docs.polymarket.com/developers/builders/order-attribution

## Chains and collateral

- Same as Polymarket (Polygon, pUSD/USDC collateral per Polymarket docs). Not independently verified here. [M]

## Read API

- Official public API exists only at the Polymarket level; none specific to NoArb. [H]
- Docs: https://docs.polymarket.com/api-reference/introduction . Hosts: Gamma https://gamma-api.polymarket.com, Data https://data-api.polymarket.com, CLOB https://clob.polymarket.com, Relayer https://relayer-v2.polymarket.com, Bridge https://bridge.polymarket.com. [H] Rate-limit reference at /api-reference/rate-limits (not read).
- NoArb-relevant endpoints (unauthenticated GET worked, 2026-10-19) [H]:
  - `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={ALL|MONTH|WEEK|DAY}&limit=&offset=` returns array of `{rank (string), builder, builderCode, volume (number, USD), activeUsers, verified, builderLogo}`. limit=100 accepted.
  - `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=ALL` returns array of `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}` per time bucket (694 rows for ALL; yearly buckets 2025-2026 plus monthly buckets seen for 2025-12). Large (not saved in full).
- There is no documented endpoint filtering trades or orders by builder code publicly; per-builder trade flow is not exposed in what was read. [NOT FOUND (searched: builder docs pages above, api-reference intro)]
- Fixtures: docs/research/fixtures/noarb-polymarket-builder/builders-leaderboard-ALL-limit50.json (15KB) and noarb-entries.json (NoArb rows for DAY/WEEK/MONTH/ALL plus volume time series).

## Trade path

- Not a separate venue. Orders go to Polymarket CLOB (`clob.polymarket.com`) with `builder` set to NoArb's code before signing. Nobody except the NoArb operator can attach their code, and attaching it has no benefit to us. For our own execution we would use our own (or no) builder code on Polymarket, handled in the Polymarket adapter.
- PayBox reachability: no NoArb-specific path. Polymarket reachability is assessed by the Polymarket workflow. paybox_reachable: no (nothing to reach).

## Fees

- Builder program: builders may charge builder taker fees on top of platform fees ("Applicable platform fees and builder taker fees are charged on top" for market BUYs). Rate/cap not specified on the page; NoArb's own fee level: NOT FOUND. [H for existence, NOT FOUND for NoArb rate] https://docs.polymarket.com/developers/builders/order-attribution
- Tiers: Unverified (100 relayer txns/day), Verified (10,000/day, manual approval, leaderboard visibility, weekly USDC rewards), Partner (unlimited). NoArb shows verified=true. [H] https://docs.polymarket.com/developers/builders/builder-tiers

## Resolution

- Same as Polymarket markets (UMA optimistic oracle; covered by the Polymarket workflow). No NoArb-specific risk beyond the platform's. [M]

## Geo / ToS / automation

- Governed by Polymarket's terms. NoArb has no terms or site (parked domain). [H]

## Liquidity and overlap

- Liquidity: 33.2M USD cumulative builder-attributed volume (leaderboard ALL, fetched 2026-10-19); 10.6M last 30 days; 0.8M last 7 days; 0.14M last day. This is a slice of Polymarket volume, not additional liquidity. [H]
- liquidity_shared_with: Polymarket CLOB. All order types use the same clob.polymarket.com endpoints and match against the same book per the docs (docs do not say it explicitly; inferred). [M]
- Event overlap: identical to Polymarket's catalogue.

## Open questions

- What is NoArb actually (bot, cross-venue arb tool, retail frontend)? No public footprint found; web search was unavailable.
- Does Polymarket expose per-builder trade attribution publicly (e.g., builderCode on trades)? Not seen in docs read.

## Suspicious content

- None encountered. The noarb.xyz page is a domain-parking redirect (GoDaddy/Afternic) that sets tracking cookies; nothing aimed at AI agents.

## Sources

- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0 (fetched 2026-10-19) [H]
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=DAY|WEEK|MONTH&limit=100&offset=0 [H]
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=ALL [H]
- https://docs.polymarket.com/developers/builders/builder-intro [H]
- https://docs.polymarket.com/developers/builders/builder-tiers [H]
- https://docs.polymarket.com/developers/builders/order-attribution [H]
- https://docs.polymarket.com/api-reference/introduction [H]
- https://noarb.xyz (redirects to /lander, then GoDaddy for-sale page) [H]
