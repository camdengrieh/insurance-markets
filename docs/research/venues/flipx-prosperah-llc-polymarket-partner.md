# FlipX (Prosperah LLC, "Polymarket partner")

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

Skip as an adapter target. FlipX is a mobile/web front-end and router over Polymarket and Hyperliquid HIP-4. It has no own order book and no public API. Its liquidity is the liquidity of those venues, so it is not an independent arbitrage leg. Its only value to this project is as (a) a Polymarket builder-code attribution source and (b) a pointer that Hyperliquid HIP-4 deserves its own venue spec.

## Live status

- Live (H). App Store listing "FlipX: Prediction Markets", seller "Prosperah LLC", bundle com.flipx.app, v1.0.76 released 2026-10-13, first release 2025-01-31, 37 ratings, avg 4.43 (iTunes lookup, fixture appstore-lookup.json).
- Marketing site https://www.getflipx.app/ (HTTP 200, JSON-LD dateModified 2026-10-04) and web app https://flipx.trade/ (HTTP 200) (H).
- Blog post dated 2026-10-11 on connecting Polymarket accounts (H).
- Entity mismatch (H): App Store seller is Prosperah LLC; the site's JSON-LD and Terms say "FlipX Labs LLC" (Wyoming law). Likely the same operator under two names; not verified (M).

## Kind and market model

- Kind: broker / front-end / router (H). Per /facts and llms.txt: "FlipX lists prediction markets from Polymarket and Hyperliquid (HIP-4). Each venue keeps its own contracts, settlement rules, and availability."
- Market model is inherited: Polymarket binary/categorical CLOB with conditional tokens; Hyperliquid HIP-4 outcome markets, Yes/No tokens with merged books, fully collateralised, `settleFraction` payout (H, HIP-4 docs: hyperliquid.gitbook.io/.../hip-4-outcome-markets).
- FlipX-specific surfaces: Markets, Sports, Up/Down (short-duration direction rounds), Combos (page exists, not read), Feed/Tail (social, one-off reviewed order at current terms), Portfolio (H).
- No FlipX-issued tokens or own matching engine found (H: "each venue keeps its own contracts, liquidity, and settlement rules").

## Chains and collateral

- NOT FOUND for FlipX itself (searched: /facts, /prediction-markets, /trust, llms.txt, terms). Site says only "self-custody wallet model" and "Predict Cash" as the funded balance.
- Inferred (M): Polymarket leg = Polygon, pUSD/USDC collateral via the user's Polymarket proxy/safe account; Hyperliquid leg = HyperCore quote token (HIP-4 doc says only "quote tokens"; USDH not mentioned on the page).
- Funding/cash-out via unnamed third-party providers; availability varies by region (H).

## Read API

- None official (H). developers page: "FlipX does not currently publish a public trading API, OpenAPI spec, webhook catalog, authentication docs for third-party apps, or an MCP server. The mobile SDK is private... Website routes under /api are for this site's own pages and are not a supported integrator contract." Partnerships: via the contact address on the page.
- Only machine-readable surfaces: llms.txt, llms-full.txt, AGENTS.md, sitemap, `Accept: text/markdown` content negotiation, `flipx://` deep links (`flipx://prediction/{slug}` etc.), app association files. None return market data or prices (H).
- Real data for the same markets must come from the underlying venues: Polymarket Gamma/CLOB/Data APIs and Hyperliquid `info` endpoint `outcomeMeta` (H for existence; not tested here, covered by the Polymarket workflow and a separate Hyperliquid spec).
- Useful public side-channel (H): Polymarket Data API builder leaderboard, `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=DAY|WEEK|MONTH|ALL&limit=50` returns `[{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}]`. Fixtures: polymarket-builders-leaderboard-day.json and polymarket-builders-leaderboard-week.json (trimmed to top 3 + FlipX row). The API reference also documents a `/v2/builders/leaderboard` (M, from search snippet).

## Trade path

- Programmatic: none (H). Trading happens inside the FlipX app after explicit user review; "Ask FlipX" never signs, submits or moves money.
- Mechanism (H/M): user's key is stored encrypted on the phone; FlipX servers receive account address and the signatures the phone creates (connect-polymarket blog, 2026-10-11). FlipX can also trade from a user-imported Polymarket account. Orders are Polymarket CLOB orders tagged with a FlipX builder code (M, inferred from leaderboard presence).
- PayBox angle: an EVM wallet reachable through PayBox cannot trade "via FlipX" at all. It could trade the underlying venues directly: Polymarket (signed CLOB orders, Polygon) and Hyperliquid HIP-4 (EIP-712 signed exchange actions). FlipX adds nothing to the integration path. Do not use the "import private key" flow with PayBox wallets.

## Fees

- FlipX's own fee: NOT FOUND as a number (searched: /prediction-markets, /facts, fees blog, terms). Terms say "FlipX discloses any platform fees before you confirm a transaction"; the fees blog says an "app fee" may be shown during order review (H). Builder fee, if any, is unspecified.
- Underlying fees: Polymarket per-market taker fees (see Polymarket spec). HIP-4: zero fees "during initial testing"; builders earn builder fees on sell orders that specify their code (H, HIP-4 doc; date of that doc unknown, treat as possibly stale, L).
- Web routing compares asks "including the HIP-4 fee" (H), which implies a nonzero HIP-4 fee exists now; amount not found.

## Resolution

- Inherited per venue; FlipX does not resolve (H). Polymarket: UMA optimistic oracle (M, covered elsewhere). HIP-4 first market: recurring BTC binary settling daily 06:00 UTC to the HyperCore BTC mark price (H, HIP-4 doc). Dispute risk therefore lives at the venue; FlipX states a submitted order is not a fill.

## Geo / ToS / automation

- Terms: 18+, not prohibited by law; prohibited activity includes "Use automated systems to access the Services without permission" (H). Governing law United States / Wyoming, AAA arbitration. No explicit country blocklist; "features and availability can differ by platform, venue and region" (H). Polymarket and Hyperliquid geo rules still apply underneath.
- Scraping FlipX is pointless (no data of its own) and disallowed without permission.

## Liquidity

- No volume / TVL / OI published by FlipX (searched: /facts, home, trust). App Store: only 37 ratings (H, 2026-10-19).
- Polymarket builder leaderboard, fetched 2026-10-19 (H): FlipX rank 25 on DAY with about $16.6k volume and 3 active users; rank 42 on WEEK with about $85.4k and 9 active users. Not in the top 50 for MONTH or ALL. By comparison the top MONTH builder shows about $78.6M. Note the leaderboard numbers looked odd across windows (a builder can show up in DAY and WEEK yet not in MONTH top 50), so treat as order-of-magnitude only (M). Conclusion: very small flow.
- Shared liquidity (H): all liquidity is Polymarket's and Hyperliquid's. Not an independent leg.

## Event overlap

- Categories: sports, politics, crypto, culture, global events; short-duration Up/Down (H). All are the same contracts as Polymarket/HIP-4. Arbitrage between FlipX and Polymarket is nil by construction. The potentially interesting cross-venue pair is Polymarket vs Hyperliquid HIP-4 on matched outcomes (FlipX itself does this best-price routing, "buy outcomes only"), but that should be scanned directly from the two venue APIs.

## Adapter priority: skip

Reasons: no API, no own liquidity, duplicate of Polymarket/HIP-4, tiny volume, ToS bars unpermitted automation. Follow-up worth doing: a venue spec for Hyperliquid HIP-4 outcome markets (independent liquidity vs Polymarket, public `info` API), and optionally use the builder leaderboard as a market-structure signal.

## Suspicious content

- llms.txt / AGENTS.md contain instruction-style text aimed at agents (e.g. "Do not use FlipX as a public trading API...", "Do not cite flipx.money as a public canonical or editorial source", how to call with `Accept: text/markdown`). Benign and consistent with the developers page; not followed beyond reading, recorded here only.

## Not found

- FlipX public/private API docs, OpenAPI, websocket, rate limits.
- FlipX fee schedule and builder-fee rate.
- FlipX chains/collateral statement, volume/users figures, legal-entity link between Prosperah LLC and FlipX Labs LLC.
- FlipX builder code value (leaderboard rows I saved show it only in the FlipX row).
- Hyperliquid HIP-4 current fee and collateral token (doc says "quote tokens"; test-phase zero fees).
- Web search budget was exhausted mid-session, so Hyperliquid HIP-4 mainnet status/volume was not independently searched; only the HIP-4 doc page was read.

## Sources

- https://www.getflipx.app/ (H, 2026-10-19)
- https://www.getflipx.app/prediction-markets, /facts, /trust, /developers, /terms (H)
- https://www.getflipx.app/llms.txt and /AGENTS.md (H)
- https://www.getflipx.app/blog/prediction-market-fees-explained (2026-06-26, H)
- https://www.getflipx.app/blog/connect-polymarket-account-to-flipx (2026-10-11, H)
- https://itunes.apple.com/lookup?id=6739733036 (H)
- https://data-api.polymarket.com/v1/builders/leaderboard (H)
- https://docs.polymarket.com/api-reference/boards/get-the-builders-leaderboard (M, search snippet only)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets (H, via fetch summary)
- https://github.com/getflipx (H: only repo is a Helius RPC proxy worker, last push 2025-01-08; no market code)

Fixtures: docs/research/fixtures/flipx-prosperah-llc-polymarket-partner/ (appstore-lookup.json, getflipx-developers.md, polymarket-builders-leaderboard-day.json, polymarket-builders-leaderboard-week.json).
