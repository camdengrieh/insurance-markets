# Arena Predictions (arena-predictions.com)

Researched 2026-10-19. Read-only. Unauthenticated GETs only (UA `insurance-markets-research/0.1`). No account, key, signup or POST.

## Verdict
- Kind: paper-trading sandbox, quote/price-gap aggregator and (optionally) a thin live-order router to Kalshi and Polymarket International. It is NOT a market venue and has NO liquidity of its own. [H]
- adapter_priority: P2 (signal-only / sandbox / benchmark). Do not build it as a trading leg. Optional: poll the keyless `/api/gaps` as a cross-check signal for sports; paper-trade backtest target.
- Still live: yes. Homepage 200, `/api/v1/status` returns `{"ok":true,"version":"v1","mode":"paper","time":"2026-10-19T05:27:30Z"}`; status page built 2026-10-19; npm arena-core 0.5.0 and arena-prediction-cli 0.6.0 modified 2026-10-11; terms effective 2026-09-29; GitHub ZBGC/arena-agent-kit pushed 2026-10-07 (0 stars). [H]

## Market model
- No market creation. Arena mirrors Kalshi markets (primary price) and, for matched sports games, Novig, Polymarket (international) and ProphetX (sandbox exchange prices) as an "instrument" (`ins_` + 12 chars, permanent id) with a YES price per venue. Prices are fractions of 1; a contract pays $1 if its side wins. [H] https://arena-predictions.com/openapi-public.json
- Paper engine: market orders fill whole at one displayed price, no depth walk, no queue, no partial fills; limit orders checked about every 30 s and fill on touch; default balance $100,000 paper dollars. [H] https://arena-predictions.com/docs/execution
- Tokenisation: none (no on-chain). Venue refs are Kalshi tickers (e.g. `KXNHLGAME-26OCT20ANANYI-NYI`) and Polymarket conditionId plus CLOB token id (side_ref). [H] fixture quote-ins_RHMTTHNP59NQ.json
- Also lists Kalshi perpetuals (`arena perps`) as read-through. [M] llms-full.txt

## Chains and collateral
- None. Paper dollars; "never deposited, withdrawn, redeemed". Live orders settle in the user's own Kalshi (USD) or Polymarket Intl (Polygon USDC) account; Arena never holds funds. [H] https://arena-predictions.com/terms ; /docs/execution

## Read API
- exists: official-authenticated (keyed v1) plus a small official keyless route set.
- Docs: https://docs.arena-predictions.com ; spec https://arena-predictions.com/openapi.json (Arena API v1.13.0) ; keyless spec https://arena-predictions.com/openapi-public.json (v1.3.0) ; https://arena-predictions.com/llms.txt, /llms-full.txt, /agents.md. [H]
- Keyless (confirmed live, 200): `GET https://arena-predictions.com/api/quotes/{ins_id}` (per-venue yes_bid/yes_ask/mid/sizes, as_of, fungibility exact|condition_scope, reviewed flag); `GET /api/quotes/batch?ids=` (max 20); `GET /api/gaps?league=nfl|ncaaf|mlb|nhl|epl|nba|ucl|all&min_gap&limit<=50&size&us_only` (cross-venue pairs, per-leg fee formulas, edge, reasons such as rules_differ/not_reviewed/stale/no_edge); `GET /api/gaps/{ins_id}`. Cached about 10 s. [H]
- Keyed `https://arena-predictions.com/api/v1` (Bearer `arena_sk_...`; key creation needs a signed-in account, not done): `/status` (keyless, confirmed), `/instruments`, `/instruments/search`, `/instruments/{ref}/quotes`, `/quotes`, `/games`, `/leaderboard`, `/traders/{id}/track-record`, `/eval`, `/portfolio`, `/history*`, `/backtest`, `/portfolio/orders`. Unauthenticated `/instruments` and `/leaderboard` return 401 (confirmed). `/history` routes 403 until venue data enabled for keyed API. [H]
- Limits: keyless = per-IP budget shared by quotes+gaps, 429 with Retry-After (exact number NOT FOUND). Keyed: no plan 1,000 req/month and 30/min; Arena Basic 10,000/month and 60/min; higher tiers not on sale; limits "count and refuse nothing" today. [H] llms-full.txt "Rate limits"
- WebSocket / streaming: NOT FOUND (searched llms-full.txt for websocket/wss/stream; Arena itself ingests Novig over a live feed, but exposes only polling REST). MCP: local stdio `npx -y arena-mcp-server` and hosted Streamable HTTP `https://arena-predictions.com/mcp`. [H/M]
- Coverage of cross-venue instruments is sports only: NFL, college football, MLB, NHL, NBA, Premier League, Champions League game lines (moneyline/spread/total). Politics/economy/crypto/entertainment pages exist but are Kalshi-only prices. [H] openapi-public.json; llms-full.txt

## Fixtures (sampled 2026-10-19)
- docs/research/fixtures/arena-predictions/gaps-limit3.json (GET /api/gaps?limit=3, 18.7 KB)
- docs/research/fixtures/arena-predictions/quote-ins_RHMTTHNP59NQ.json (1.4 KB)
- Observation: in the sample all returned prices were >15 s old and flagged `fresh:false`; the sample NHL pair showed edge -3.98 points after fees (no arbitrage). Of 47 gap rows with `us_only=0&limit=50`, all were status `gap`, none arbitrage at that moment. [H]

## Trade path
- Via Arena: paper orders `POST /api/v1/portfolio/orders` (key with trade:write). Live: `execution:"kalshi"` (trade:write:kalshi, user saves a Kalshi trading key in Arena Settings) or `execution:"poly-intl"` (non-US only). Novig, Polymarket US and ProphetX orders are not sent. Live orders need Arena Basic ($9.99/mo or $49.99/yr). Giving a third party our Kalshi/Polymarket credentials is NOT advisable; use those venues' own adapters. [H] /docs/execution
- PayBox/EVM wallet: not applicable. Arena has no contracts, no signed-order or transaction-proposal interface. Any real execution happens at Kalshi (fiat, KYC) or Polymarket (Polygon), which are covered by their own specs. paybox_reachable = no. [H]

## Fees
- Arena: paper trades pay no fee; Basic $9.99/mo; Enterprise $200/mo (contact sales). API keys free. [H] https://arena-predictions.com/pro
- Fee formulas Arena applies when computing gaps (useful for our fee model, venue-sourced): Kalshi taker `0.07 x contracts x P x (1-P)` rounded up to the cent; Polymarket taker `0.05 x shares x p x (1-p)`. [H] fixture gaps-limit3.json (rule strings). Verify against the Kalshi/Polymarket specs; they are Arena's statements.

## Resolution
- Paper trades settle from the Kalshi market result, even if the trade was priced at another venue; contract differences (ties settle at 50 on Kalshi vs Novig void, postponement rules) are flagged and a tie settles every trade at 50. Arena itself says Polymarket rules are "not yet compared"; matches are made "by rule" with `reviewed:false` for Polymarket. Dispute risk therefore sits with the underlying venue; cross-venue pairs are explicitly "not risk-free". [H] /docs/execution; fixture

## Geo / ToS / automation
- Terms (effective 2026-09-29) say Arena is paper only, "no real money", and prohibit scraping/harvesting data and automation except via the CLI, MCP or API keys within documented rate limits. The keyless OpenAPI says the routes are "for looking at, not a feed to resell, and no download of other venues' prices". Note the contradiction: terms describe a pure simulator while llms.txt/docs describe live Kalshi/Polymarket-Intl routing. robots.txt allows crawlers but disallows `/api/kalshi/`, `/market/` etc. Minimum age 17. [H] https://arena-predictions.com/terms ; openapi-public.json
- Implication: polling keyless `/api/gaps` at low rate for internal signal use is within the stated routes but redistribution is not; a keyed account is the clean path (needs sign-in, not done here).

## Liquidity
- None of its own. Depth numbers are those of Kalshi/Polymarket/Novig/ProphetX books as relayed (e.g. sample sizes 22 to 1590 contracts at top of book, 2026-10-19). No volume/OI/TVL published. Public leaderboard/eval board exist (AI model records) but are paper results. [H]

## Overlap / shared liquidity
- Shares liquidity with: Kalshi (primary), Polymarket Intl, Novig, ProphetX. NOT an independent arbitrage leg. Value is as (a) a pre-computed sports cross-venue gap signal (Kalshi vs Novig vs Polymarket), and (b) a sandbox/backtest harness (backtesting early access, settled game-winner markets, 1-minute candles) and graded-record signal. Novig and ProphetX are not in the "already covered" list: Arena is an indirect read on their sports prices. [H/M]

## Suspicious content
- None found. llms.txt/agents.md contain operating instructions for agents (use the CLI, pass `--yes`, etc.). Not followed; informational only. The shared scratchpad file llms-full.txt was briefly overwritten by another process (contained a different venue's docs); re-fetched into a private subdirectory.

## Not found
- WebSocket feed; numeric keyless rate limit; volume/OI figures; on-chain contracts (none exist); fee schedule for Enterprise beyond $200/mo.

## Sources
- https://arena-predictions.com/ (200, 2026-10-19) [H]
- https://arena-predictions.com/llms.txt , /llms-full.txt , /agents.md [H]
- https://arena-predictions.com/openapi.json , /openapi-public.json [H]
- https://arena-predictions.com/docs/execution , /terms , /pro , /status , /robots.txt [H]
- https://arena-predictions.com/api/v1/status , /api/gaps , /api/quotes/{id} (live GETs) [H]
- npm view arena-core / arena-prediction-cli; gh api repos/ZBGC/arena-agent-kit [H]
