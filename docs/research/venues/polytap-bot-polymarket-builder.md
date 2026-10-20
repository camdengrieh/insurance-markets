# PolyTap Bot (Polymarket builder) - venue spec

Researched 2026-10-19. Read-only. Verdict: **skip** (adapter_priority). It is a Telegram trading bot that attaches a Polymarket builder code to orders. It has no markets, books or API of its own and no independent liquidity: every fill happens on Polymarket's CLOB.

## Summary

- "PolyTap Bot" is a verified entry in Polymarket's public Builder Leaderboard (builder code `0xc95d2e7e...f90683`): rank 44 all-time, $15.88M cumulative volume, 326 all-time active users. [H, data-api.polymarket.com, 2026-10-19]
- The product is a Telegram bot, @PolyTapBot. Its Telegram profile reads: "Fastest Bot for PolyMarket. Custom automations, copy trade with TP/SL, presets, detailed reports." [H, t.me/PolyTapBot og:description]
- Third-party listing (secondary, repeats the project's own promo posts): in-chat market search and orders, take-profit/stop-loss, a "Volume Builder" spread engine, automations/presets, copy trading incl. "consensus" mode, basket buys, "rolling parlays". Claims a non-custodial setup where the user grants execution permissions only. [M, polymart.app/polytap-bot; directory entry in github wzsg/polytrading.dev dated lastVerified 2026-08-01, marked closed-source, risk "high"]
- Linking the leaderboard entry "PolyTap Bot" to the Telegram bot @PolyTapBot is by name match plus the polymart listing's claim that the bot holds builder verification. Not independently confirmed (the builder API gives no URL). [M]
- Not to be confused with: polytap.net ("POLYTAP - Forecast Exchange", a white-label-looking page, no stated Polymarket link) and polytap.ai (GoDaddy "Launching Soon" placeholder). Neither is connected to this bot on any evidence found. [H that they exist, L on any relation]
- No official docs, website, or API for the bot were found. WebSearch was unavailable this session (budget exhausted), so discovery relied on GitHub search, domain probes, Telegram public preview, polymart.app.

## Live status

- Still live in Oct 2026: appears on the MONTH leaderboard at rank 42 with $1.08M volume (month to date) and only 11 active users. [H, builders/leaderboard?timePeriod=MONTH, 2026-10-19]
- Monthly volume (USD) / active users / rank [H, builders/volume?timePeriod=MONTH]:
  - 2026-02: 1.14M / 201 / 27
  - 2026-03: 0.64M / 111 / 45
  - 2026-04: 1.62M / 41 / 33
  - 2026-05: 4.22M / 63 / 26 (peak)
  - 2026-06: 3.19M / 38 / 37
  - 2026-07: 1.97M / 18 / 56
  - 2026-08: 0.67M / 11 / 63
  - 2026-09: 1.35M / 13 / 48
  - 2026-10 (partial): 1.08M / 11 / 42
- Reading: first volume Feb 2026 (daily series starts 2026-02-11). User count has collapsed from ~200 to ~11 per month while volume per user rose sharply, i.e. a handful of heavy (probably automated/volume-farming) users now. [M, inference]

## Kind and market model

- kind: broker / front-end (Telegram trading bot, Polymarket builder-code router). No own markets.
- Market model is Polymarket's: binary and categorical (neg-risk) markets on a CLOB, ERC-1155 conditional tokens. See docs/research/08-venues-polymarket-kalshi.md; not re-researched here.

## Chains and collateral

- Settles on Polymarket's chain (Polygon) with Polymarket collateral, per the parallel Polymarket spec. The bot's own chain/collateral handling (does it create a Polymarket proxy wallet for the user? import a key? use a delegated session signer?): NOT FOUND (searched: t.me preview, polymart.app listing, polytrading.dev entry).

## Read API

- exists: none for the bot itself. NOT FOUND (searched: github search for polytap org/repos (only unrelated repos: a rhythm game, "PolyTape" order-book recorders), gh users polytap/polytapgm (empty, no repos), candidate domains polytap.{io,xyz,bot,app,trade,gg,fun,pro,so,me,live,tech,org,finance,link} and polytapbot.{com,io,xyz} (no resolve/timeouts)).
- Only attribution data, via Polymarket public unauthenticated endpoints [H, shapes confirmed 2026-10-19]:
  - `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL|MONTH|WEEK|DAY&limit=50&offset=0` -> array of `{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}`
  - `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH` -> `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}` rows per builder per period (2,920 rows, ~930KB total)
  - Docs: https://docs.polymarket.com/developers/builders/builder-intro [H]
- Market data (books, prices, trades, resolution) comes from Polymarket's own Gamma/CLOB/data APIs, covered by the parallel Polymarket workflow.
- Fixtures: `docs/research/fixtures/polytap-bot-polymarket-builder/builders-leaderboard-ALL-ranks43-45.json`, `.../builders-volume-MONTH-polytap.json` (PolyTap rows only).

## Trade path

- The bot exposes no programmatic API. NOT FOUND. It is a human-in-chat tool.
- A PayBox agent wanting Polymarket exposure should sign Polymarket orders directly (EIP-712 on Polygon) via the Polymarket adapter. Per Polymarket docs, the builder code is a field inside the signed order and volume is credited to that builder on matched trades. [H, builder-intro] Nothing is gained by routing through this bot, and it would add a custodial/permission risk.

## PayBox reachability

- paybox_reachable: no (as a distinct venue). The only reachable thing is Polymarket itself, tracked in its own spec.

## Fees

- No official schedule found. NOT FOUND (searched: t.me preview, polymart.app, polytrading.dev entry).
- Promotional figures quoted on polymart.app, originating from the project's own posts: roughly $2-3 per $1K volume (~0.2-0.3%) and ~$20 per $10K. [L, marketing claim]
- Polymarket's builder-intro page does not describe how builders charge fees. [H] Polymarket's own fee schedule applies on top; see Polymarket spec.

## Resolution

- Identical to Polymarket (UMA-based per Polymarket docs; see docs/research/08). The bot adds no resolution layer.

## Geo / ToS / automation

- Bot ToS: NOT FOUND. Polymarket geoblocks and builder rules apply (see docs/research/08).
- Directory flags: closed source, "high" risk, "review permissions, custody and fees before use". [M, polytrading.dev entry]
- Any new Telegram trading bot that asks for a key or a delegated permission is a custody risk; not appropriate to route PayBox funds through.

## Liquidity

- Bot-attributed Polymarket volume: $15.88M all-time, ~$1.08M Oct 2026 month-to-date, peak $4.22M in May 2026. [H, data-api.polymarket.com, 2026-10-19]
- Liquidity shared with: Polymarket (100%). Not an independent arbitrage leg. Its flow is a sliver of Polymarket's volume.

## Event coverage overlap

- Whatever Polymarket lists (sports, politics, crypto price, macro). Overlap with other venues only through Polymarket itself.

## Adapter priority: skip

- No API, no own liquidity, tiny and shrinking user base, custody risk, ties to the leaderboard entry only by name.
- Minor optional use: builder leaderboard rows as a retail-flow-share signal across front-ends. Handled generically by a single "Polymarket builders" signal feed, not a per-bot adapter.

## Suspicious content

- None observed. The polytrading.dev entry's website field carries a referral parameter in the Telegram link; it is not reproduced here.

## Sources

- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0 [H]
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH&limit=50&offset=0 [H]
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH [H]
- https://docs.polymarket.com/developers/builders/builder-intro [H]
- https://t.me/PolyTapBot (public preview page) [H]
- https://polymart.app/polytap-bot [M, third-party listing built from project's own posts]
- https://github.com/wzsg/polytrading.dev (src/content/resources/polytap-bot.json, lastVerified 2026-08-01) [M]
- https://polytap.net and https://polytap.ai (unrelated placeholder pages) [H that content is sparse]
- Searches not possible: WebSearch budget exhausted this session.
