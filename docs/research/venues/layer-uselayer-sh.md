# Layer (uselayer.sh) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

## Verdict

- Layer is NOT a venue. It is a hosted cross-venue market-matching service (plus an MIT Python SDK that trades on Kalshi and Polymarket US with the user's own keys). It has no order book, no collateral, no resolution of its own. [H]
- It shares 100% of its liquidity with Kalshi and Polymarket (US and .com), both covered by the parallel workflow. It is NOT an independent arbitrage leg. [H]
- Its value to this project: a signal/seed source for market linking ("is this the same bet", confidence, rule caveats, settlement track record) and a reference implementation of the same idea we are building. Needs an API key (account sign-up), which this research did not create.
- adapter_priority: P2 (signal-only). Do not build a trading adapter. A thin optional "match-hints" client is the most it merits.

## Still live? [H]

- https://uselayer.sh/ serves "LIVE - Works today with Kalshi and Polymarket US" (homepage, fetched 2026-10-19). Footer "(c) 2026".
- GET https://uselayer.sh/v0/health (no key) returned ok:true, database reachable, on 2026-10-19T07:33Z. Last venue pulls were within about 1.5 hours. Open markets seen by Layer: Kalshi 119,796 (12,705 events); polymarket.com 376,442 (43,319 events); Polymarket US 91,917 (13,581 events). live_market_pairs (matches with polymarket.com) 53,766; with Polymarket US 88,403. Fixture: docs/research/fixtures/layer-uselayer-sh/v0-health.json
- Rapid growth: the docs' own sample health response shows 14 / 9 live pairs, while the live endpoint shows 53,766 / 88,403, so the doc sample is stale and the service has scaled up quickly. [H]
- Terms of service version 2026-09-28; "early access ... may change, be interrupted or stop without notice". [H] The GitHub org uselayer has 3 repos (layer-spread-bot, uselayer-sdk, signals), SDK pushed 2026-10-18. [H, gh api]
- The Show HN (2026-10-09) from the discovery hint was NOT independently verified: web search budget was exhausted. NOT FOUND (searched: WebSearch "Show HN Layer uselayer.sh..." - refused, budget).

## Kind and market model

- kind: aggregator-or-data (matching service) with a client-side trading SDK. No own markets. [H]
- Underlying markets: binary yes/no contracts on Kalshi, Polymarket US, and polymarket.com (Polymarket global is matched, but see Trade path). Matches are pairs "one Kalshi market + one Polymarket (US or .com) market" that pay out identically; "side" is always "same" (YES pays like YES). Polymarket and Polymarket US are never paired with each other directly (two-hop via Kalshi). [H, docs/api, docs/matching]
- Each match carries: confidence 0-1 (1 = human approved), basis identical | equivalent_with_caveats, caveats (source_differs, timing_differs, rounding_differs, carveout_differs, definition_differs), caveat_notes (one sentence per caveat), tier human_verified | auto_verified. [H]
- Market object carries ids and links only (venue, market_id, group_id, url, series, and for polymarket.com slug + yes_token_id = the CLOB YES token id). No titles, prices or rules text; those must be read from the venue. [H]
- Settlement-policy differences are explicitly NOT listed per match: cancelled/postponed games and inactive-player props can pay differently (Kalshi often settles at fair price; Polymarket may wait, 50-50 or resolve No/Under). This is a real hedge-break risk for arbitrage. [H, docs overview]

## Chains and collateral

- None of its own. Collateral is whatever the underlying venue uses: Kalshi (USD, off-chain, KYC'd account), Polymarket US (USD, regulated US exchange, off-chain account), polymarket.com (USDC on Polygon; M, from general knowledge covered by the other workflow, not asserted by Layer docs). [Layer-specific claims H; Polygon/USDC is M]
- Layer "never holds your funds, places trades for you or executes orders". [H, terms]

## Read API (official, authenticated) [H]

- exists: official-authenticated. Docs: https://uselayer.sh/docs/api (also /docs, /docs/quickstart, /docs/matching, /docs/sdk, /docs/sandbox, /docs/backtest-data).
- Base URL: https://uselayer.sh . JSON. Auth: `Authorization: Bearer lyr_...` or `x-api-key: lyr_...`. Key obtained by sign-up (GitHub, Google, Discord, wallet or email) at the dashboard; shown once. Rate limit 60 req/min per key (429 rate_limited with retry-after). Prices/orders go direct to venues and do not count. No pricing/plan page found; ToS says early access. NOT FOUND (searched: /docs, /terms, homepage: any paid tier, quota beyond 60/min, SLA).
- Unauthenticated check: GET /v0/matches?limit=1 returned HTTP 401 {"error":"unauthorized"} (fixture v0-matches-unauthenticated-401.json). Only /v0/health is public. Therefore NO real /v0/matches response sample was captured; shapes below are from the docs only.
- Endpoints:
  - GET /v0/health (public) - status, per-venue open counts and last_pull, live_market_pairs.
  - GET /v0/matches - live matches, soonest event first. Params: limit (1-200, default 50), offset, category (sports, politics, economics, crypto, finance, climate, tech, culture, world, other), from/to (YYYY-MM-DD), q (up to 10 words), venue=polymarket_us (default) | polymarket.
  - GET /v0/match?venue=&market_id=[&with=] and POST /v0/match (up to 50 lookups, counts as 1 request) - twin of one market, or reason (not_indexed, no_candidate, pending_review, rejected, outcome_unmapped, rules_changed_pending_review, specify_outcome); includes settlement once both resolved. Polymarket ids: conditionId, slug or numeric id; Polymarket US: slug, with ":long"/":short" for two-sided markets.
  - GET /v0/settlements - track record (agreed / disagreed / edge_case), filters since, outcome, series, polymarket_series, category, venue.
  - POST /v0/profit - net profit of a Kalshi leg + one Polymarket leg after each venue's fees, optional return/day; can auto-fill fee params from kalshi.market_id (reads venue fees live).
  - POST /v0/size - walks two ask ladders you send and returns max contracts clearing min_edge, slippage, fills.
  - Webhooks: POST/GET/DELETE /v0/webhooks, POST /v0/webhooks/{id}/test; events match.live, match.pulled, match.settled; max 5 endpoints; HMAC secret whsec_; retries over about 28h. Layer discovers new matches hourly and settlements every 6h.
- Prices: "Layer serves which markets are the same bet, not prices." Live prices/books come from each venue directly (SDK client.prices(); Polymarket US prices need no key, Kalshi book reads need a Kalshi key). [H]
- Websocket: none from Layer. The SDK uses the venues' own WebSockets in live mode. [H]
- Data-use terms (ToS 2026-09-28): use internally or inside own app; credit and link the venue; "Don't redistribute, resell or republish Layer data as a standalone data feed, or use it to build a competing market-data aggregator or historical database." [H] This conflicts in spirit with our venue-agnostic aggregation goal if we persist Layer matches as a product; fine as an internal hint, but get explicit permission or keep it ephemeral. Also: "We may stop serving a venue's data at any time."
- Matching method (docs/matching): candidate search (+/-1 day games, +/-7 days otherwise, top 5), hard code checks (market type, line, outcome count, dates, singles/doubles), two independent LLM graders (live at >=90% from grader 1 or both >=80%), rules-change re-check, post-settlement audit. Tracked record from docs sample: Polymarket US totals settled 4053, agreed 4052, disagreed 1; polymarket.com NFL series 5405 settled, 5405 agreed (docs examples, date unstated, M). Core series tracked: NFL, CFB, NBA, WNBA, NHL, MLB, top soccer, UCL, MLS, ATP/WTA, UFC, Fed decisions, CPI/jobs, House/Senate control. [H as quoted from docs]

## Trade path

- Hosted API: none. "The API never places a real order." [H]
- SDK (uselayer, PyPI, MIT, github.com/uselayer/uselayer-sdk): live mode sends orders from the user's machine with the user's own venue keys, only to Kalshi (Kalshi API key; RSA or Ed25519) and Polymarket US (key id + secret key file from polymarket.us/developer; requests signed locally). Order shape: client.buy(venue, market, side, price, size), cancel, trade(pair) with two legs, IOC thinner-leg-first, unwind on miss; guardrails (max position, budget, daily loss, allowlist, approve_above, stop-loss, kill switch). [H]
- polymarket.com (global, on-chain) is matched but the docs describe live trading only on Kalshi and Polymarket US; no live polymarket.com order path found in the SDK docs. The Market object exposes yes_token_id, so a different adapter could trade it on the CLOB itself. [H for docs statements; "no path found" is NOT FOUND in docs read]

## PayBox / EVM wallet reachability

- paybox_reachable: no. Layer has no on-chain contracts or transaction proposals. Its only tradable legs are Kalshi and Polymarket US, which are off-chain, account-and-API-key venues (USD, KYC, geo-restricted) - not reachable by EVM or Solana signing. The only on-chain leg in its matches is polymarket.com (Polygon CLOB), which is covered by the Polymarket adapter work, not by Layer. [H/M]
- A PayBox plugin would use Layer purely as a read-only hint provider (needs a Layer API key, held as a secret, not via wallet signing).

## Fees

- Layer itself: none documented. NOT FOUND (searched: homepage, /docs, /docs/api, /terms).
- Venue fees encoded in /v0/profit, /v0/size and SDK (useful reference math, H, from docs): Kalshi = multiplier x 0.07 x contracts x p x (1-p), rounded up to the cent for takers (makers 0.0175 only on series with maker-fee types; some multipliers 0.5 or 0); Polymarket.com = contracts x fee_rate x (p(1-p))^exponent, takers only, default category rates crypto 0.07; sports/economics/culture/weather/other 0.05; finance/politics/mentions/tech 0.04; geopolitics 0; Polymarket US = feeCoefficient (default 0.0695) x contracts x p x (1-p), rounded to cent, maker rebate 0.0125 ended 2026-10-19 except makers with >= $10M prior-month maker volume. Fees exclude deposit/withdraw costs. Venue schedules win over Layer's.

## Resolution mechanism and dispute risk

- Each underlying venue resolves its own market by its own rules (Kalshi rulebook sources; Polymarket US per its rules; polymarket.com via UMA, M). Layer does not resolve anything; it audits agreement after both settle (poll every 6h). [H]
- Matching risk: Layer's matches are LLM-graded plus checks; wrong match = one leg pays Yes, other No (both lose). Layer reports 1 disagreement in about 4,053 settled Polymarket US matches (docs example, M on date). Edge cases (one venue voids, other resolves) are counted separately. The ToS puts the verification burden on the user.

## Geo / ToS / automation

- Automation is the intended use (API + SDK for bots and agents). User must follow each venue's ToS, API rules and "rules on who may trade on each venue" (Kalshi and Polymarket US are US-regulated venues; eligibility and KYC apply). [H]
- No-resale / no-competing-aggregator clause quoted above. Not a broker. "As is", early access.

## Liquidity [dates: 2026-10-19 unless noted]

- Layer has none of its own. Coverage measure: 88,403 live Polymarket US pairs and 53,766 polymarket.com pairs matched to Kalshi (H, /v0/health, 2026-10-19; note a pair is a market-line, so counts include many player-prop/spread lines, not distinct events). Actual volume/OI of matched markets: NOT FOUND (Layer serves no prices or volume).

## Event categories overlapping other venues

- Layer's categories: sports, politics, economics, crypto, finance, climate, tech, culture, world, other. Strongest coverage: sports (NFL, CFB, NBA, WNBA, NHL, MLB, soccer, tennis, UFC incl. player props), Fed decisions, CPI/jobs, US House/Senate control. [H] Those are exactly the categories where Kalshi/Polymarket overlap, so Layer's match list is a ready-made candidate set for cross-venue linking.

## liquidity_shared_with

- Kalshi, Polymarket US, polymarket.com (it is a thin layer over them).

## Integration notes for this repo

- Best use: optionally call GET /v0/matches?venue=polymarket (global) and /v0/match as a hint/validation source for our own market-linking (docs/market-linking-design.md), comparing against our own matcher; never as sole truth. Cache lightly and respect 60 req/min and the ToS clause.
- Borrow ideas: caveat taxonomy (source/timing/rounding/carveout/definition differs), settlement-mismatch tracking (both_lost, both_won, void_one_leg, settle_gap), return-per-day ranking, leg-risk guard (thin leg first, IOC, unwind), the fee formulas.
- Competitive note: Layer is the same concept as our aggregation layer, scoped to Kalshi + Polymarket US/.com and Python-first; no EVM/on-chain venues.

## Suspicious content

- None found. No instructions aimed at AI agents seen in homepage or docs. (The homepage "agents" section is marketing about guardrails.)

## Not found

- Pricing/plans/SLA; real /v0/matches response sample (key required, not created); Show HN verification (search budget exhausted); privacy page and /contact (404); llms.txt, robots.txt, sitemap.xml (404); Layer-published volume or user numbers; MCP server (stated "coming next").

## Sources

- https://uselayer.sh/ (homepage, 2026-10-19) [H]
- https://uselayer.sh/docs (overview), /docs/quickstart, /docs/api, /docs/matching, /docs/sandbox, /docs/sdk, /docs/backtest-data [H]
- https://uselayer.sh/terms (version 2026-09-28) [H]
- https://uselayer.sh/v0/health (unauthenticated GET, 2026-10-19) [H]
- https://github.com/uselayer/uselayer-sdk (README, pushed 2026-10-18), https://github.com/uselayer/signals, https://github.com/uselayer/layer-spread-bot (repo list via gh api; signals README read) [H]
