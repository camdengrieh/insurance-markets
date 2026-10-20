# TerminalUp (Polymarket builder) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- **Not a venue.** TerminalUp is a software vendor (Terminal Up Inc.) whose "Terminal" is an invite-only multi-venue order router for sports traders. It is also a Polymarket "builder": its orders carry a builder code and settle on the normal Polymarket CLOB. All its Polymarket liquidity IS Polymarket liquidity (H). It is not an independent arbitrage leg.
- **Still live (H):** terminalup.com returns 200 (2026-10-19); the Polymarket builder leaderboard shows activity today.
- **Adapter priority: skip** as a venue. Useful only as a minor signal: its builder-attributed trades are a public feed of what one (apparently single) sports desk trades on Polymarket.
- Search note: the WebSearch budget was exhausted this session, so no independent news or third-party coverage was checked. Everything below comes from first-party pages and APIs.

## Kind and market model

- Kind: broker/frontend/router (H, terminalup.com; Terms say "software only", does not hold funds, take bets, or act as broker). Products listed in the Terms: Trading Terminal (multi-platform routing), WagerUp Pilot (Telegram alerts and Polymarket copy trading), WagerUp Enterprise (white-label), ArbTaker (HFT for qualified institutional clients) (H, terminalup.com/terms).
- Market model: none of its own. Underlying Polymarket markets are binary/categorical CLOB markets, ERC-1155 conditional tokens (M; Polymarket is covered by a parallel workflow).
- Trades seen under its builder code are overwhelmingly sports (team names, Over/Under; NFL, college football, NBA) (H, own sample of 300 trades, see fixtures).

## Chains and collateral

- Inherited from Polymarket: Polygon, USDC collateral (M, covered elsewhere). Other venues in its network (Kalshi, Hyperliquid, predict.fun, sportsbooks) use their own rails (H partners page, no connection details given).

## Read API

- **TerminalUp itself: no public API.** Homepage mentions none; robots.txt disallows /api/; llms.txt is marketing only and "does not grant additional content-use or AI-training rights"; Terms bar bots/scrapers except through APIs Terminal Up provides (H). NOT FOUND (searched: terminalup.com home, /terms, /partners, /llms.txt, /robots.txt; docs.terminalup.com and api.terminalup.* not probed beyond terminalup.com).
- **Polymarket builder attribution feeds (official, public, unauthenticated; H, probed 2026-10-19):**
  - `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL|MONTH|WEEK|DAY&limit=&offset=` - TerminalUp row: rank 63 ALL, volume 9,517,641 USD, activeUsers 2, verified true, builderCode `0x055df238...c720f`.
  - `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH` - monthly series per builder.
  - `GET https://clob.polymarket.com/builder/trades?builder_code=<bytes32>&next_cursor=` - matched trades attributed to the code, 300 per page, no auth (docs: docs.polymarket.com/developers/builders/order-attribution). Filter works (bogus code returns empty). Fields: tradeType, takerOrderHash, market (condition id), assetId, side, size, sizeUsdc, price, outcome, outcomeIndex, owner (CLOB owner uuid), maker, transactionHash, matchTime, fee, feeUsdc, builderFee, builderCode.
  - Leaderboard UI: builders.polymarket.com; volume can lag up to 24h (H docs).
- **WagerUp (affiliated research site, wagerup.com):** read-only beta API, base `https://wagerup.com/api/v1`, OpenAPI 3.1 at `/api/v1/openapi.json`, MCP at `/api/v1/mcp` (H). Docs and product search are keyless; `/markets` (tracked sports market snapshot) and `/traders` require an approved Bearer key and enabled data access. Limits: 30 req/min anonymous, 120/key, 180/IP, 600 global, no SLA; "data licensing and client approval are separate from API authentication" (H). Underlying venue sources are not stated (NOT FOUND). Not useful as a price source: derived and gated.
- Websocket: none for TerminalUp. Polymarket's own WS is covered by the Polymarket workflow.

## Trade path

- None for TerminalUp: no documented API, invite-only, $10K minimum deposit (H, homepage meta). A third party cannot become a TerminalUp user programmatically.
- To trade the same liquidity, use Polymarket directly. Optionally an agent can register its own builder code (Settings > Builders, per docs) to get attribution; the code goes in the signed order's `builder` bytes32 field (H, docs order-attribution). Orders need CLOB L2 headers. This is outside this venue's scope.
- PayBox reachability: **no** for TerminalUp itself. Any Polymarket route is the Polymarket spec's concern (EIP-712 signed orders / wallet on Polygon).

## Fees

- TerminalUp trading fees: not published; Pilot "currently fee-free" (H homepage). Terms contain no pricing.
- On Polymarket, builders may charge a builder fee (docs say on all tiers; the same page is inconsistent and lists it as a Verified unlock; rates not stated) (H, docs builder-tiers). In the 300 sampled trades `builderFee` = 0 on every row, and `feeUsdc` is a Polymarket taker fee (e.g. 0.30 USDC on a ~337 USDC fill) (H sample).

## Resolution and dispute risk

- Inherited entirely from Polymarket (UMA-based, covered elsewhere). No TerminalUp-specific mechanism.

## Geo / ToS / automation

- Terms (effective 2025-04-07, so >6 months old): users must be 18+; user alone responsible for legality in their jurisdiction; no named restricted countries; arbitration under AAA, Delaware law; no scraping/bots except via provided APIs; no bulk dataset creation or model training (H terminalup.com/terms). Treat scraping terminalup.com as prohibited; the Polymarket public APIs above are the correct data source.
- No product eligibility is established by site language (H llms.txt).

## Liquidity (all Polymarket-routed)

- Builder volume ALL-time 9.52M USD, rank 63 of the leaderboard (H, data-api, 2026-10-19). Monthly: Aug 2026 0.27M, Sep 3.49M, Oct (MTD) 5.76M, rank 87 -> 30 -> 20; 7-day 0.97M (rank 9), 1-day 73K (H).
- activeUsers = 2 (month and all-time), 1 in day/week (H). The 300 most recent trades: all TAKER, 292 BUY / 8 SELL, 1 distinct owner, 126 markets, ~775K USD notional over roughly 3 days (2026-10-16 to 2026-10-19) (H own computation from fixture source). Strong evidence of a single desk.
- Growing fast but tiny relative to the top builder (betmoar 2.34B USD, 4,006 users, H).

## Event overlap and shared liquidity

- Sports (NFL, NCAAF, NBA moneylines/totals) overlap Kalshi, sportsbooks and others, but only through Polymarket. **Shares liquidity with Polymarket: yes, 100%** - not an independent leg.
- Network venues named by TerminalUp (H /partners): confirmed Kalshi, Polymarket, 4casters, Pinnacle, ProphetX, predict.fun, Hyperliquid; ~20 more (DKeX, Betfair, Matchbook, Novig, SX Bet, Overtime, BetDEX, etc.) with no connection details. Useful only as a lead list of sports venues that other workflows may cover.

## Signal value

- Builder-attributed fills are a free, unauthenticated stream of one sharp-ish sports desk's Polymarket takes (price, side, market, time). Whether it is "sharp" is unverified (L). Could feed a low-weight signal in the aggregator; not worth a dedicated adapter beyond a poll of `/builder/trades`.

## Suspicious content

- None found. No text aimed at AI agents on terminalup.com, /terms, /partners, wagerup.com, wagerup.com/developers.

## Open questions

- Does the desk's flow lead price moves? (needs history analysis)
- Builder-trades pagination depth and retention are unverified.
- ArbTaker/Enterprise access terms unknown (contact only).

## Sources

- https://data-api.polymarket.com/v1/builders/leaderboard (H, probed 2026-10-19)
- https://data-api.polymarket.com/v1/builders/volume (H)
- https://clob.polymarket.com/builder/trades (H)
- https://docs.polymarket.com/developers/builders/builder-intro (H)
- https://docs.polymarket.com/developers/builders/builder-tiers (H)
- https://docs.polymarket.com/developers/builders/order-attribution (H)
- https://terminalup.com/ , /terms , /partners , /robots.txt , /llms.txt (H)
- https://wagerup.com/ , /developers , /api/v1/openapi.json , /api/v1/products (H)
- Fixtures: docs/research/fixtures/terminalup-polymarket-builder/ (clob-builder-trades.sample.json, data-api-builders-leaderboard.ALL.TerminalUp-row.json, data-api-builders-volume.MONTH.TerminalUp.json, wagerup-openapi.json)
