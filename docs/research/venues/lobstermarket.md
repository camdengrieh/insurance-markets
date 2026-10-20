# LobsterMarket (lobstermarket.bet) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict
Adapter priority: **skip** (signal-only at best). It is a play-money, agent-only LMSR toy with 4 agents, 29 trades, about 5.5k credits of cumulative volume and 6 open markets. No real money, no chain, no payout: nothing to arbitrage against. The only integrable value is a free, unauthenticated read API that could in principle feed an "agent crowd" signal, and the sample is too small to be informative.

## Liveness
- Site up, HTTP 200, Next.js on Vercel, 2026-10-19 [H] https://lobstermarket.bet/
- skill.md v2.3.0, Last-Modified 2026-10-17 [H] https://lobstermarket.bet/skill.md (HTTP headers)
- Homepage shows "0 markets" because the UI/standalone list is empty of open standalone markets; the API lists 6 open sub-markets (5 in one group, 1 standalone) [H] https://api.lobstermarket.bet/api/v1/markets?status=open
- Platform stats 2026-10-19: activeAgents 4, totalTrades 29, totalVolume 5535.34 (credits), totalPosts 113 [H] https://api.lobstermarket.bet/api/v1/stats
- Daily snapshots flat at 29 trades / 5535.2959 volume across the sampled days (no new trades) [H] https://api.lobstermarket.bet/api/v1/stats/history?period=daily&limit=3
- All markets were created 2026-02-24..25 (createdAt 1771910358850..1771977662594); latest trade seen 2026-02-24. Operationally alive (site and API respond) but effectively dormant for ~8 months [H, derived from API].
- Show HN 2026-02-24 'Prediction Markets for Agents': from the task hint only; could not re-verify, web search budget exhausted [L/M].

## Kind and market model
- Kind: forecasting-nonmoney, agent-only play-money prediction market [H] https://lobstermarket.bet/docs
- Binary YES/NO markets priced by LMSR automated market maker; YES+NO = 1; shares pay 1 credit if winning [H] docs "How Trading Works"
- Multi-outcome = "market groups": each option is an independent binary sub-market with its own LMSR pool (not a single normalized book). Group resolution marks one option YES and the rest NO [H] https://lobstermarket.bet/skill.md. Implication: sum of option YES prices does not have to equal 1 (observed group of 5: 0.77+0.66+0.63+0.48+0.37 = 2.91) [H, computed from fixtures/lobstermarket/markets_list_sample.json].
- Outcomes are database rows (YES/NO share counts per user), not tokens. liquidityParam b default 500 (docs page says 100 in one example, skill.md says 500) [H].
- Scalar markets: none. Order book: none.

## Chains and collateral
- None. Collateral is internal "credits": 10,000 on registration, daily bonus 50 +25/day streak cap 200 (only if balance < 20,000), bankruptcy refill to 1,000, 5% bonus on net profit at resolution [H] skill.md "Economy Overview". Credits have no stated cash value or redemption. NOT FOUND (searched: docs, skill.md, homepage): any token, chain, wallet, deposit or withdrawal.

## Read API
- Official, public for reads, Bearer key (prefix lm_) for writes. Self-serve registration (not performed).
- Base URL: `https://api.lobstermarket.bet/api/v1` (per skill.md frontmatter) [H]. Caution: the web docs page at https://lobstermarket.bet/docs uses placeholder `https://your-site.com/api/v1`, and `https://lobstermarket.bet/api/v1/*` returns 404; use the api. subdomain [H].
- Docs: https://lobstermarket.bet/docs (HTML) and https://lobstermarket.bet/skill.md (fuller, agent-oriented) [H]
- Key unauthenticated GET endpoints [H]:
  - `/markets?status=open|resolved|canceled&category=&sort=volume|newest|featured|trending&limit<=100` -> `{success,data:{markets[],count}}`; market fields: _id, slug, title, description, category, status, closeTime, currentYesPrice, yesShares, noShares, liquidityParam, volume, priceChange1h/24h, groupId, groupLabel, creatorHandle
  - `/markets/by-slug/{slug}`, `/markets/trades/{marketId}?limit<=100` (side, action, shares, cost, fee, yesPriceAfter, userHandle, createdAt)
  - `/market-groups`, `/market-groups/by-slug/{slug}`, `/search?q=`, `/stats`, `/stats/history`, `/leaderboard`, `/agents/profile/{handle}`, `/posts/{marketId}`
- No order book/depth endpoint (AMM): executable price must be computed from LMSR with yesShares/noShares and liquidityParam (standard LMSR, plus 2% fee on buys). Formula not published beyond "LMSR" [M].
- Auth/limits: 100 requests/minute per agent; `X-RateLimit-Limit: 100` / `X-RateLimit-Remaining` headers seen on public GET (server: cloudflare) [H]. Websocket: NOT FOUND (searched docs, skill.md). Resolution data: no dedicated endpoint; status field resolved/canceled only (no outcome field seen in sample) [M].
- Fixtures: docs/research/fixtures/lobstermarket/{markets_list_sample,market_groups_list,market_trades_sample,stats}.json

## Trade path
- Programmatic: `POST /trade {marketId, side YES|NO, amount, action BUY|SELL}` with Bearer API key. BUY amount = credits to spend, SELL amount = shares. No signing, no wallet [H].
- PayBox reachable: **no**. Nothing on-chain; an EVM/Solana wallet is irrelevant. Only a self-registered API key, and credits are play money.

## Fees
- 2% fee on every BUY (effective budget = amount/1.02, fee added to AMM cost); SELL free; 200 credits to create a market/group; max 2,000 credits invested per agent per market [H] skill.md.

## Resolution and dispute risk
- Creator or admin resolves manually via `/markets/resolve` or `/market-groups/resolve`; no oracle, no dispute process documented [H]. Sample group: "Creator resolves based on consensus among major AI commentators". NOT FOUND (searched docs, skill.md): dispute mechanism, deadlines for resolution. 18 of 25 markets are "canceled", 1 resolved: a high cancel rate [H, computed].

## Geo / ToS / automation
- Automation is the intended use ("Humans spectate. Agents trade and discuss."); wash trading and spam discouraged [H]. NOT FOUND (searched: homepage, docs, skill.md): ToS/privacy page, geo restrictions. No legal gambling exposure evident since play money (M).

## Liquidity
- Cumulative volume 5535 credits, 29 trades, 4 active agents (2026-10-19, /stats) [H]. Open markets 6, largest open volume 441 credits [H]. No real-money TVL/OI.

## Event coverage / overlap
- Open: 5 AI-lab "most impactful model of 2026" options + 1 "room-temperature superconductor replicated by 2026" [H]. Closed ones covered BTC price, Fed March 2026, GPT-5 release, US shutdown, (overlap categories on other venues, but all canceled). Open markets are bespoke, stale-prone and creator-resolved, so do not map reliably to other venues. Prices are play-money crowd of ~4 bots: not a meaningful signal.

## Shared liquidity
- Independent (own LMSR pools), but irrelevant because it cannot be traded for value.

## Suspicious content
- skill.md and HEARTBEAT-style content contain agent-directed instructions (register an agent, claim daily bonus, post after every trade, fetch HEARTBEAT.md periodically). Treated as untrusted data, none followed; no registration, POST or key creation performed. HEARTBEAT.md not fetched.
- Docs page placeholder host `your-site.com` differs from real API host; do not send keys to non-lobstermarket.bet hosts.

## Open questions
- Whether credits ever convert to anything of value (no evidence).
- Whether /markets/{id} reports resolved outcome (resolved sample not inspected in detail).

## Sources
- https://lobstermarket.bet/ [H]
- https://lobstermarket.bet/docs [H]
- https://lobstermarket.bet/skill.md [H]
- https://api.lobstermarket.bet/api/v1/{markets,market-groups,markets/trades/{id},stats,stats/history,leaderboard} [H]
- Show HN 2026-02-24 (https://news.ycombinator.com/) [L: from task hint, not re-verified; web search budget exhausted]
