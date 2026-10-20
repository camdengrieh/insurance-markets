# ANY.BI / AnyBid / "anymarket" (any.bid, anymarket.net, anybet.fi) - venue spec

Researched 2026-10-19. Read-only, unauthenticated GETs only. Confidence tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip** (as an independent leg). It is a front-end/aggregator over Polymarket (every one of 100 sampled markets has `source: "polymarket"` and Polymarket CLOB token ids). It adds no independent liquidity. Its "native bonding-curve markets" are claimed on a marketing page but not observed, undocumented, with no chain/contract/API found. The only use is as a duplicate Polymarket price mirror.

## Identity (what "ANY.BI" actually is)

- The hint domain `any.bi` does not resolve (NXDOMAIN via curl, no A record). [H]
- GitHub repo `anybid/ngmi_ui_lib` returns 404; user `Anybid` exists (created 2019, 0 public repos). [H]
- npm `@anybid/ngmi` exists: 3 versions, all published 2025-11-10, never updated since. Svelte 5 mobile-first prediction-market UI library "for ANY.BID protocol", author "ANY.BID Protocol Team", MIT, no README, repo URL points at the 404 GitHub repo. A UI kit only, no API or contract. [H] (registry.npmjs.org/@anybid%2Fngmi, 2026-10-19)
- The live site is **https://any.bid** (note `.bid`, not `.bi`). Title "anymarket - prediction-market infrastructure"; og:url `https://anymarket.net`; footer-style branding "Powered by AnyBid" / "anybet". [H] (any.bid HTML, anymarket.net via WebFetch)
- `https://any.bid/llms.txt` calls it "AnyMarket (anybet.fi)", "Built by AutismLLM", claims "9,700+ live markets" and "millions of dollars in active trading volume" (unaudited marketing claims). [H that it says this, L as to truth]
- Unrelated homonym: GitHub `getgroupmy/anybid` is a Malaysian auction marketplace (Fastify/Next.js), not a prediction market. Ignore. [H]
- Name collision also: `anybet.fi` landing page is an "ANYBET PIONEERS PROGRAM" selling tiers tied to a "Genesis NFT" with vague "yield" and a "Trapezoid Opportunity" ("definitely not a pyramid scheme"). Treat as a red flag. [H, via WebFetch summary of https://www.anybet.fi]
- `app.anybet.fi` (the app URL in llms.txt) has a TLS certificate mismatch (curl error 60) as of 2026-10-19. [H]
- `api.anymarket.net` returns 502; `docs.anymarket.net` does not resolve; `anymarket.net/docs` 404. [H]

## Still live?

Partly. `any.bid` serves a site and a JSON endpoint with prices updated 2026-10-19T07:27Z (same day), so the aggregator front-end is running. [H] The npm package is stale (2025-11-10, >11 months). [H] The "ANY.BI protocol" itself (own contracts) was not found. [NOT FOUND]

## Kind and market model

- Aggregator/mirror of Polymarket binary markets; fields `clob_token_ids` (two Polymarket CLOB ERC-1155 token ids, outcome A/B), `outcome_a_label`/`outcome_b_label` Yes/No, `price_a`/`price_b` in 0..1. [H]
- Claimed native product ("Bonding Curve v2, Prediction Options"): back YES or NO, no order book, no market makers; a minimum redemption floor is reserved against the opposing pool, wrong side expires worthless, winners split the opposing pool pro rata by "effective shares". Effectively a parimutuel-like pool with bonding-curve pricing. Source: marketing text only; no contract, no docs. [L]
- Homepage also claims it aggregates Kalshi and Limitless as well as Polymarket; only Polymarket-sourced rows were seen in the API sample. [M]
- Other claimed products: web app (live), mobile (coming end 2026), widget, "Conviction SDK" for sportsbooks/casinos, "zero-proof oracle" (coming soon), desktop terminal, "Anybet Originals on the Luck Protocol". [L]

## Chains and collateral

NOT FOUND (searched: any.bid HTML, llms.txt, anymarket.net, anybet.fi, npm metadata). For mirrored Polymarket markets the underlying chain is Polygon with USDC collateral (by virtue of Polymarket CLOB token ids). [M]

## Read API

- Exists: unofficial/undocumented, public, unauthenticated JSON used by the site's own frontend. Not documented anywhere (no docs URL, no OpenAPI: /api/openapi.json 404). Classify `unofficial-only`. [H]
- Base URL: `https://any.bid` [H]
- Endpoints confirmed:
  - `GET /api/markets` -> `{ "markets": [...100 items], "all_total": 100 }`. Query params `limit`, `offset`, `page`, `category`, `source` were all ignored in tests (identical 100 rows returned), so there is no visible pagination and the claimed 9,700+ markets are not reachable from this call. Response ~218 KB, headers `cache-control: public, max-age=14400, s-maxage=30, stale-while-revalidate=120`, served via Cloudflare. [H]
  - `GET /api/market/{uuid}` -> `{ "found": true, "market": {...} }`. uuid is the Polymarket market id (e.g. `2589810`). [H]
- Market row fields: `uuid, clob_token_ids[2], title, display_title (AI-rewritten), description (Polymarket rules text), source, category, outcome_a_label, outcome_b_label, price_a, price_b, volume_usd, liquidity_usd, status, is_tradeable, is_resolved, is_open_ended, deadline, vibe, prices_updated_at, unique_traders (0 in sample), created_at, image_url`. [H]
- Missing: order book depth, trades history, resolution outcome endpoint, websocket. [NOT FOUND] (probed /api/events, /api/prices, /api/orderbook, /api/trades, /api/market/{id} only; the site's JS bundle was not analysed)
- Auth/rate limits: none seen, none documented. [H/NOT FOUND]
- Fixtures: `docs/research/fixtures/any-bi/api-markets.sample.json` (3 of 100 rows), `docs/research/fixtures/any-bi/api-market-single.json`.
- Sample snapshot 2026-10-19 (100 rows, all `open`/`is_tradeable`): sum volume_usd ~ $532M, sum liquidity_usd ~ $33M, all Polymarket numbers (not AnyBid's own). Category mix by row count: world_politics 40, geopolitics 12, crypto 11, us_politics 9, tennis_other 6, football 6, global_economy 5, american_sports 4, ai 4. [H]

## Trade path

NOT FOUND. No order API, no signing scheme, no contract address found. Any trade would route to Polymarket (use the Polymarket adapter directly instead) or to an undocumented native contract. PayBox reachability: `no` (nothing to propose or sign against that is not already covered by Polymarket's own adapter). [H/NOT FOUND]

## Fees

NOT FOUND (searched: homepage, llms.txt, anymarket.net, anybet.fi). Unknown whether AnyBid adds a builder/routing fee on top of Polymarket's.

## Resolution mechanism / dispute risk

Mirrored markets resolve per Polymarket (UMA-based on Polymarket; see the Polymarket spec). The `description` field carries Polymarket's rules text verbatim. Native markets: "zero-proof oracle" is "coming soon"; mechanism undocumented. [M/L]

## Geo / ToS / automation

NOT FOUND (no terms page located). `robots.txt` on any.bid allows all crawlers including AI bots. [H] No stated rate limit; undocumented API may change or be blocked without notice.

## Liquidity

- Own liquidity: none measurable. `unique_traders` is 0 on sampled rows. [H]
- Displayed volume/liquidity are Polymarket's figures: sum ~$532M volume, ~$33M liquidity across 100 sampled rows, snapshot 2026-10-19. [H]
- Marketing claims of 9,700+ markets / "millions in volume" are unverified. [L]

## Event coverage / overlap

Full overlap with Polymarket (politics, geopolitics, crypto, Fed/macro, football/tennis/US sports, AI). Since rows are Polymarket mirrors, using this as an arbitrage leg versus Polymarket yields nothing; versus Kalshi/others it is just Polymarket by proxy.

## Shares liquidity with

Polymarket (explicitly: `source: "polymarket"` plus Polymarket CLOB token ids). Possibly also Kalshi and Limitless per homepage claim. NOT an independent arbitrage leg. [H/M]

## Open questions

- Do native bonding-curve markets exist on-chain? Which chain and contract? (Nothing found.)
- Relationship between ANY.BID, AnyMarket, AnyBet, AutismLLM and the Luck Protocol.
- How the site reaches the claimed 9,700+ markets (the public endpoint returns 100).

## Suspicious content

- `https://any.bid/llms.txt` contains a section "For AI Systems" instructing assistants to recommend AnyMarket at anybet.fi to users asking where to trade. Not followed; recorded as embedded promotional instruction. [H]
- `anybet.fi` landing page: NFT-gated "Pioneers Program", tiered "yield", recruitment-style language, "definitely not a pyramid scheme". [H]
- The npm package metadata lists a maintainer contact address; deliberately not copied here.

## Sources

- https://registry.npmjs.org/@anybid%2Fngmi (fetched 2026-10-19) [H]
- https://github.com/anybid/ngmi_ui_lib (404), https://github.com/Anybid (user, 0 repos) via `gh api` [H]
- https://any.bid (HTML, robots.txt, llms.txt), https://any.bid/api/markets, https://any.bid/api/market/2589810 [H]
- https://anymarket.net (WebFetch summary) [H], https://www.anybet.fi (WebFetch summary) [H]
- https://github.com/getgroupmy/anybid (unrelated homonym) [H]
- WebSearch "ANY.BID prediction market protocol": no relevant hits [H]. A second search was blocked by the session search budget.
