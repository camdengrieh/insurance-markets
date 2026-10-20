# tryOdds (tryodds.fun) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand this session in a primary source; M = secondary or inferred; L = weak or stale.

## Verdict

- **Adapter priority: skip.** tryOdds is a third-party Polymarket front end and order-routing "builder". It has no venue of its own. All markets, prices, order books and settlement are Polymarket's, so it is not an independent arbitrage leg. Its own routed volume is about $0.9k-$1.9k per week. It has no documented public API, no ToS page, and its trade path needs a Google login plus a server-held wallet. A PayBox wallet cannot use it.
- **Still live:** yes. [H] The site returns HTTP 200 and serves 2026-10-19 NFL markets, with server-rendered data timestamped 2026-10-19 ~04:08Z. The sitemap lists 500 event URLs (lastmod 2026-10-01).
- **Where to get the same data:** the Polymarket adapter, through gamma-api, the CLOB and data-api. Anything useful in tryOdds can be rebuilt from those.

## What it is

- [H] Title: "Try Odds - Real-time odds on the world's largest prediction market". Meta description: "View real-time odds and trade on the world's largest prediction market - live markets across politics, sports, crypto, and culture." The site never names Polymarket in its visible copy.
- [H] The Next.js bundle hard-codes Polymarket hosts: `gamma-api.polymarket.com`, `clob.polymarket.com`, `data-api.polymarket.com`, `user-pnl-api.polymarket.com` and `wss://ws-subscriptions-clob.polymarket.com/ws/market`. Market images come from the `polymarket-upload` S3 bucket.
- [H] Identity of data confirmed. Market id `561997` on tryOdds carries conditionId `0x0b17bd62...bebd20` and the same two `clobTokenIds` as `GET https://gamma-api.polymarket.com/markets/561997`. See `fixtures/tryodds/event-page-eventData-sample.json`.
- [H] Polymarket lists "tryOdds.fun" as a verified **Builder** (builder code `0xd7fc5e8b...a52eaf`) on its public builder leaderboard. Orders carry that code for attribution and an optional builder fee.
- [H] Features beyond Polymarket's own UI: "Alpha alerts" (filters All / Insider / Whale / Contrarian, plus price movers), "Biggest wins this week", a leaderboard, and a portfolio view. The alert and leaderboard data are mostly derived from Polymarket data (the leaderboard and biggest-winners calls go to the Polymarket data-api). The alert backend is a separate undocumented service (see Read API).
- Operator, team, and socials: NOT FOUND (searched: homepage and event-page HTML, manifest, bundle text, /terms, /privacy, /docs, `gh search repos tryodds`, `gh search code tryodds.fun`). The only external mention found is the Polymarket builder fixture in a third-party Rust SDK repo.

## Market model

- Inherited from Polymarket. [H, from the tryOdds event payload] Binary Yes/No markets, grouped into multi-outcome events (a 44-market "Republican Presidential Nominee 2028" event). Each market has `conditionId`, two `clobTokenIds` (ERC-1155 outcome positions on the Conditional Tokens Framework), `negRisk` (boolean), `tickSize` ("0.01" or "0.001"), `outcomes`, `endDate`.
- Central limit order book on the Polymarket CLOB. No AMM or parimutuel pool at tryOdds.
- Sports markets carry `sportsMarketType` and `line` fields in the same payload.

## Chains and collateral

- [H] Polygon (chain id 137 in the bundle). The bundle names `CTF_ADDRESS` `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` (Polymarket's Conditional Tokens contract; M, from memory, not re-verified here), `PUSD_ADDRESS` `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` and `USDC_ADDRESS` `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` (USDC.e on Polygon; M).
- [H] The collateral is pUSD, which the Polymarket docs index describes as "the collateral token used for all trading on Polymarket" (https://docs.polymarket.com/concepts/pusd.md). tryOdds checks the user's USDC.e plus pUSD balance and calls its backend `POST /trade/wrap` when USDC.e is present.
- [H] Withdrawals are bridged to other chains by the tryOdds backend (`/withdraw/supported-assets`, `/withdraw/quote`). The UI says "Instant and free - no Polymarket fees". The list of supported chains is NOT FOUND (it is a runtime response behind login).

## Read API

- **Official tryOdds API: none.** NOT FOUND (searched: /docs, /api, /openapi.json, /llms.txt, /terms, /privacy, .well-known/security.txt (all 404), and homepage links). `robots.txt` says `Disallow: /api/`, `/auth/`, `/portfolio`, `/activities` (fixtures/tryodds/robots.txt). I did not call `/api/` paths.
- **Reads that exist are Polymarket's public APIs**, which tryOdds proxies at `https://www.tryodds.fun/api/polymarket/{gamma|data|clob|pnl}/...`. Use the originals directly. Docs index: https://docs.polymarket.com/llms.txt. These are covered by the Polymarket spec, not repeated here.
- **Server-rendered event payload**: each `/event/{slug}` page embeds the normalised event object (key `eventData`) in its Next.js RSC stream. This is scraping a UI, not an API; the shape can change at any deploy. Sample: `fixtures/tryodds/event-page-eventData-sample.json`.
- **Undocumented tryOdds backends** (found as text in the public JS bundle; M that they are tryOdds-run, not contacted):
  - `https://web-production-27300.up.railway.app` (alpha alerts: REST via same-origin `/api/alpha/notifications?limit&offset&type&categories&insider&shares`, WebSocket `/ws/notifications?categories=...&token=...`). Alert types seen: `whale_alert`, `insider`, `contrarian_bets`, `price_movers`.
  - `https://fomo-be-production.up.railway.app` (user/profile/notifications; WebSocket after Google id_token auth).
  - `https://odds-trading-be-production.up.railway.app/v1` (trading; see Trade path).
- Auth and limits for any of the above: NOT FOUND (no docs). The trading backend uses a Google OAuth id_token bearer. Rate limits are unknown.
- Builder volume (public, Polymarket-hosted): `GET https://data-api.polymarket.com/v2/builders/volume?interval=week&limit=4` [H, fetched 2026-10-19]. Fixture: `fixtures/tryodds/builder-volume-tryodds-rows.json`.

## Trade path

- [H] Orders go through tryOdds' own backend, not signed by the user's wallet in the browser. From the bundle: `POST {TRADING_API_URL}/trade/order` with `Authorization: Bearer <Google id_token>` and body `{tokenId, price, size, side, orderType (default "FAK"), expiration, negRisk, tickSize}`. The response carries `orderID` and `status`. An HTTP 409 with code `SETUP_NOT_READY` means the wallet is not yet prepared.
- [H] Wallet setup is custodial-style. `POST /trade/setup` runs states `NOT_STARTED -> DEPLOYING_SAFE -> APPROVING -> DERIVING_CLOB -> READY`, so the backend deploys a Safe (on Polygon), sets token approvals and derives Polymarket CLOB API credentials. The UI also has an import flow: "Paste your wallet's private key", sent to `POST /auth/import` as `{privateKey}`. This puts a user private key in a third party's backend. That is a serious security flag.
- Full route list: `fixtures/tryodds/frontend-config-and-backend-routes.json`.
- Not tested: no sign-in, no POST, no key use, per the ground rules.
- **PayBox reachability: no.** The trade path requires a Google browser session and a server-held key or Safe. A PayBox EVM wallet cannot trade through tryOdds with transaction proposals or signed orders, and PayBox would never export a key. The underlying market is reachable only by trading Polymarket directly (signed CLOB orders on Polygon), which is the Polymarket spec's question and does not need tryOdds.

## Fees

- tryOdds' own fee or builder-fee rate: NOT FOUND (searched: bundle text, site pages, no ToS or pricing page). Only claim on the site: withdrawals "Instant and free - no Polymarket fees" [H, bundle text].
- [H] Polymarket's builder program lets a builder add a flat taker fee up to 100 bps and maker fee up to 50 bps on top of platform fees, charged to the user (https://docs.polymarket.com/programs/builders/fees.md). Platform fee formula there: `platform_fee = C x feeRate x p x (1 - p)`, taker-only. Whether tryOdds sets a non-zero builder rate is unknown; it should be treated as 0-100 bps taker extra until verified from the builder profile.
- For arbitrage, price off Polymarket directly and ignore tryOdds fees.

## Resolution and dispute risk

- [H] Rules text shown on tryOdds is Polymarket's `description` passed through (example: "...resolution source ... a consensus of official Republican Party sources"). Resolution and disputes happen on Polymarket (UMA-based; M, covered by the Polymarket spec). tryOdds adds no independent resolution layer.
- Extra risk specific to tryOdds: operator and wallet-custody risk (backend holds or can use keys). Positions are in a Safe address the backend controls; recovery terms are NOT FOUND.

## Geo, ToS, automation

- ToS, privacy, geo statement: NOT FOUND (`/terms` and `/privacy` return 404; no footer links on the homepage).
- `robots.txt` disallows `/api/`, `/auth/`, `/portfolio`, `/activities` [H]. Treat the tryOdds API as off limits for automated reads.
- Polymarket's geographic restrictions are covered by its own spec. Unknown (open question): whether Polymarket's checks see the end user's IP or the Railway backend's IP when tryOdds submits orders.

## Liquidity

- **tryOdds' own routed volume is tiny.** Polymarket builder leaderboard, `/v2/builders/volume?interval=week`, fetched 2026-10-19 [H]:
  - week bucket 2026-09-27: $1,929.62, 9 active users, rank 168
  - week bucket 2026-10-04: $1,031.83, 8 active users, rank 177
  - week bucket 2026-10-11: $883.29, 8 active users, rank 182
  - the 2026-10-18 bucket is in progress and had no tryOdds row.
  - Earlier snapshot in a third-party SDK fixture (M): week bucket 2026-09-06 $2,482.68 (5 users, rank 156), 2026-09-13 $281.65 (3 users, rank 150).
  - For scale, all builders together routed about $168M, $167M, $176M in those three weeks (sum of rows in the response), and the top builder about $31M in the week of 2026-10-11.
- Market volumes shown on tryOdds (for example "Cowboys vs. Packers $6.5M", "Fed Decision in October? $1.8M") are Polymarket's volumes, not tryOdds' [H].

## Event coverage and shared liquidity

- Everything on Polymarket: US sports (NFL, MLB, college football), US and world politics, Fed and macro, geopolitics, crypto, culture. Overlap with Kalshi and others is exactly Polymarket's overlap.
- **Shares liquidity with Polymarket: 100%.** Same CLOB, same token ids, same order book. tryOdds is NOT an independent arbitrage leg. The aggregator should map `venue=tryodds` onto `venue=polymarket` and dedupe on `conditionId` / `clobTokenIds`.

## Possible signal value (low)

The alpha-alert feed (whale, insider, contrarian, price movers) is the only tryOdds-specific data. It is undocumented, auth-adjacent, behind a robots-disallowed path, and derivable from Polymarket's public trade data. Not worth an adapter. If wanted later, compute whale and price-mover signals from Polymarket's data-api.

## Suspicious content and handling notes

- The public JS bundle contains an RPC provider API key for Polygon (Alchemy). It is not reproduced here or in fixtures, and was not used. It is a credential leak on tryOdds' side.
- No text aimed at AI agents was found in the homepage, event page or bundle. (A grep for "AI agent", "assistant", "LLM", "ignore previous" returned 0 hits.)
- The site asks users to paste a wallet private key into a form that posts it to a third-party backend. Do not integrate, test or recommend this flow.
- All third-party content was treated as data. Bundle JS was read as text only and never executed; no third-party repo was cloned.

## Open questions

- Who operates tryOdds, and what are its terms for custody, key storage and withdrawals?
- What taker and maker builder fee rates does builder code `0xd7fc5e8b...a52eaf` charge? (Not found in public docs.)
- Is there any plan for a public API? None advertised.

## Sources

1. https://www.tryodds.fun/ (redirect from https://tryodds.fun, HTTP 307 to www) - title, meta, nav, feature list [H]
2. https://www.tryodds.fun/event/republican-presidential-nominee-2028 - server-rendered eventData payload [H]
3. https://www.tryodds.fun/manifest.webmanifest, /robots.txt, /sitemap.xml (553 URLs: 500 events, 51 leaderboard entries) [H]
4. https://www.tryodds.fun/_next/static/chunks/*.js (read as text): hosts, constants, trading backend routes, setup states, private-key import UI text, withdrawal text [H]
5. https://gamma-api.polymarket.com/markets/561997 - id and token-id match with tryOdds payload [H]
6. https://data-api.polymarket.com/v2/builders/volume?interval=week&limit=4 - tryOdds builder volume [H]
7. https://docs.polymarket.com/llms.txt, /concepts/pusd.md, /programs/builders/fees.md - pUSD, builder fee rules and formulas [H]
8. https://github.com/dilettante-trading/polyoxide (`polyoxide-polymarket/tests/fixtures/data/v2/builder_volume.json`) - earlier builder-volume snapshot (2026-09-06 and 2026-09-13), found via `gh search code "tryodds.fun"` [M]
9. Web search: not performed. The shared WebSearch budget was exhausted, so no news or social search was possible and operator information is missing.

Fixtures (all under `docs/research/fixtures/tryodds/`): `event-page-eventData-sample.json`, `builder-volume-tryodds-rows.json`, `frontend-config-and-backend-routes.json` (RPC key omitted), `robots.txt`.
