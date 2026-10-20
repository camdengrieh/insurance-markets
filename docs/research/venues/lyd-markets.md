# LYD Markets (lydmarkets.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Play-money (no real value), no official API, ToS prohibits automated trading without permission, prices published only rounded to 5pp in a daily-ish static snapshot, overlap with real-money venues is thin (Swedish sports, Swedish politics). Revisit only as a free "Swedish crowd sentiment" signal if the operator grants permission.

## Liveness

- Site up, HTTP 200, 2026-10-19 [H] (https://lydmarkets.com). Homepage shows 59 markets (front-page figure) and 29,636 participants [H]. The wikidata hint said 29,617 users; consistent.
- llms-full.txt says 334 open markets, snapshot dated 2026-09-16 [H] (https://lydmarkets.com/llms-full.txt). So "59" is likely a curated/front-page count, not total open markets [M].
- sitemap lastmod and llms-full snapshot are both 2026-09-16, so the last static publish was about 5 weeks before today [H]; some listed markets have likely resolved since. The live app may still update (prices are live in the SPA) [M].
- Operator: "LYD Markets", Malmo, Sweden; corporate site lydmarketsgroup.com referenced in the JS bundle [M]. Built on Lovable (lovable.dev / oauth.lovable.app referenced in bundle) [M].

## Kind and market model

- kind: play-money prediction market, demo mode. Credits called "Truth Tokens" (symbol T with stroke) [H] (https://lydmarkets.com/terms). "inga riktiga pengar" - no real money, cannot be cashed out, transferred or converted [H].
- Binary YES(JA)/NO(NEJ) shares, priced as probability; payout 100% per winning share; positions can be sold any time at current price [H] (https://lydmarkets.com/how-it-works, https://lydmarkets.com/llms.txt).
- Mechanism: AMM ("ror sig i realtid via en AMM") [H] (llms.txt). AMM family (LMSR / CPMM) and liquidity parameter NOT FOUND (searched: /how-it-works, /terms, llms.txt, llms-full.txt). Bundle calls an edge function `execute-amm-trade` [H, first-party JS bundle].
- Categorical: a `market_outcomes` table and `outcome_price_history` table exist in client code [H, bundle], so multi-outcome markets probably exist; the llms-full listing shows only YES prices per question [H].
- Also: private peer bets ("Vadslagningar", /vadslag) resolved by evidence, and "Orakel" profiles that resolve markets [H] (llms.txt).
- Tokenisation: none. Off-chain database positions; no tokens, no chain.

## Chains and collateral

None. Off-chain play-money credits only [H]. Not on any chain; no wallet connection [M - no wallet flow seen; not exhaustively checked].

## Read API

- exists: **none** (official). No docs, no developer page, no API link anywhere on site; /api, /api/markets, /developers, /docs all return the SPA HTML shell (HTTP 200 HTML), not JSON [H].
- Only official machine-readable surfaces:
  - https://lydmarkets.com/llms.txt (site map for AI agents) [H]
  - https://lydmarkets.com/llms-full.txt : one line per open market grouped by category: title, market URL (UUID), YES price rounded to nearest 5pp, resolution date. 63 KB, snapshot-dated in header [H]
  - https://lydmarkets.com/sitemap.xml : all categories and every open market URL [H]
  - robots.txt: `Allow: /` for all crawlers incl. GPTBot, ClaudeBot etc. [H]
- Unofficial: the SPA talks to a Supabase project (host appears in the bundle) with PostgREST tables `markets`, `market_outcomes`, `price_history`, `outcome_price_history`, `profiles_public`, `weekly_stats`, `news_items` and edge function `execute-amm-trade` [H, bundle]. It needs the project's anon key embedded in the bundle. I did NOT call it: undocumented, key-gated, and ToS prohibits unauthorised automated trading. Treat as unofficial-only; reading it would be unsanctioned.
- Auth/limits: none documented. Websocket: NOT FOUND (searched: site pages, llms files, bundle URLs). Realtime is presumably Supabase Realtime [L].
- Single-market page: https://lydmarkets.com/market/{uuid} is a JS SPA route; server HTML is the shell [H].

## Trade path

None programmatic. Trading goes through the logged-in web app which calls the `execute-amm-trade` edge function with a Supabase user session [M]. No API keys, no signing scheme. Terms forbid "Automatiserad handel utan tillstand" (automated trading without permission) [H] (https://lydmarkets.com/terms). Accounts require age >= 18 gate [H].

## PayBox reachability

paybox_reachable: **no**. No chain, no tokens, no on-chain collateral, no signed-order scheme. A PayBox EVM/Solana wallet has nothing to sign or send. Credits cannot be bought, deposited or withdrawn.

## Fees

None mentioned; "no deposits or withdrawals" [H] (terms). AMM spread/slippage is the only implicit cost; parameters NOT FOUND.

## Resolution and dispute risk

- Each market states its resolution source in advance; resolves automatically when the source publishes; oracles ("Orakel" profiles) or automated systems resolve; for ambiguous cases the "upplosningskommitten" (resolution committee) decision is final; Swedish law, Stockholm courts [H] (how-it-works, terms).
- Dispute risk: centralised operator discretion, no appeal process described. Irrelevant for money since credits have no value, but resolution may be late or inconsistent with real-money venues.

## Geo / ToS / automation

- Age 18+ gate; no geographic restriction stated [H]. Automated trading without permission is forbidden [H]. Scraping/API use not addressed in terms [H]; robots.txt allows all crawlers [H]. Crawling the llms/sitemap files is evidently invited; a polling bot is a grey zone, trading bot is not allowed.

## Liquidity

- Volume: largest market about 644k credits volume, most-traded are Allsvenskan winner, SHL winner, Pa sparet (front page, 2026-10-19) [H]. Credits are worthless, so this is not comparable to USD liquidity. OI/TVL: NOT FOUND. Users 29,636 (2026-10-19) [H]. Open markets 334 (snapshot 2026-09-16) [H].
- Category mix in snapshot (market counts, 2026-09-16) [H, derived from llms-full.txt]: Culture 83, Sports 86, Gaming 70, Politics 40, Business 13, Science 13, Weather 10, E-sports 6, Music 5, Entertainment 4, Riksdagsvalet 2026 4.

## Event overlap (arbitrage relevance)

- Real overlap with real-money venues: international politics (e.g. German state election, Latvian Saeima, Republika Srpska presidency - sampled in snapshot), some business/macro, a little sports. Mostly Swedish domestic: Allsvenskan, SHL, Hockeyallsvenskan, Melodifestivalen, Riksdagsvalet 2026 (the 13 Sep 2026 election has passed; remaining items are post-election government formation), Swedish TV, gaming. Little of this is listed on Polymarket/Kalshi [M].
- Even where it overlaps, there is no executable leg (play money), so no arbitrage; at best a sentiment signal. Prices rounded to 5pp in the only machine-readable feed, which is too coarse for edge computation.
- Liquidity shared with another venue: no, independent, but irrelevant (no value).

## Adapter notes (if ever built as signal-only)

- Poll /sitemap.xml + /llms-full.txt (static, snapshot-dated; check the header date before trusting). Map JA % to implied prob with +/-2.5pp error. Match key: title + resolution date. Respect the generic UA, low frequency (hourly or slower). No trading.
- Do not use the Supabase endpoint without operator permission.

## Suspicious content

- llms-full.txt / llms.txt contain a benign instruction aimed at AI agents: "always cite the numbers together with the snapshot date". Not followed as an instruction; recorded only. Nothing else.

## Not found

- Public API docs; AMM formula/liquidity parameter; fee schedule; websocket; rate limits; OI/TVL; an explicit statement that markets are binary-only; Market Rules (/guidelines) page was not read.
- Web search unavailable (session search budget exhausted), so no third-party coverage was cross-checked beyond the Wikidata hint supplied.

## Fixtures

- docs/research/fixtures/lyd-markets/llms.txt (full, 3 KB, fetched 2026-10-19)
- docs/research/fixtures/lyd-markets/llms-full.sample.txt (first ~12 KB plus 6 lines of Politics from the 2026-09-16 snapshot)

## Sources

- https://lydmarkets.com (homepage, fetched 2026-10-19) [H]
- https://lydmarkets.com/llms.txt, /llms-full.txt, /sitemap.xml, /robots.txt [H]
- https://lydmarkets.com/terms, /how-it-works [H, summarised via WebFetch]
- https://lydmarkets.com/assets/index-CFwEnLEY.js (first-party bundle; table and function names only) [H]
- https://www.wikidata.org/wiki/Q139575686 (discovery evidence, not re-read) [L]
