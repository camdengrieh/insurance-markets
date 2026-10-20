# Sharktool (sharktool.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

Sharktool is NOT a venue. It is a desktop trading-terminal client (Windows/macOS/Linux) with separate builds for Odd Justa (Brazilian Betfair-exchange-style front end), Oddrs, a coming Betfair build, and Polymarket. The Polymarket build routes orders to Polymarket's CLOB with a Polymarket builder code, which is why it appears on the Polymarket builders leaderboard. All liquidity is Polymarket's. It is not an independent arbitrage leg. adapter_priority = skip (no adapter; at most track its builder code as an attribution signal).

## Liveness (H)

- Site live, HTTP 200, 2026-10-19: https://sharktool.com/ (title "Sharktool - Trade Like a Shark"; page in Portuguese). [H]
- Installer version 1.0.83; Polymarket MSI at downloads.sharktool.com last-modified Sat 3 Oct 2026 (HEAD request). [H]
- Polymarket leaderboard shows active flow: builder "Sharktool", verified. [H, fixture below]

## Kind and market model

- kind: broker-or-frontend (desktop client). [H]
- Site copy: modules per product - "Odd Justa", "Oddrs", "Mercados Preditivos / SharkTool Polymarket", and a Betfair version "coming" with a waitlist of the first 500 sign-ups. [H, https://sharktool.com/]
- Features described: ladder UI, percentage staking, multi-market windows, hedge/freebet one-click sequences, "Shark Mode" for cross-matching markets, order cancel helpers, live latency readout. These are exchange-trader features (back/lay ladder) ported to Polymarket. [H]
- Market model on the Polymarket build: whatever Polymarket offers (binary/categorical CLOB, outcome tokens as ERC-1155 conditional tokens on Polygon). The Sharktool site does not document this itself; it is covered by the Polymarket venue spec. [M]

## Chains and collateral

NOT FOUND on Sharktool site (searched: homepage text, /docs, /faq, /terms - these paths return the same SPA homepage, no separate content). Inherited from Polymarket (global): Polygon, pUSD/USDC collateral. [M, see Polymarket spec]. Site states "SharkTool does not access or store your credentials" and "your Odd Justa or Betfair account is your access". [H] It does not say how Polymarket keys/wallets are handled.

## Read API

- exists: none (public). No public docs, no OpenAPI, no GitHub org found. [H for site paths; M for GitHub - not searched beyond web search, which returned nothing]
- Probe: GET https://api.sharktool.com/ returns HTTP 401 JSON `{"error":"SHARKTOOL_CLIENT_KEY_MISSING","message":"Send header X-SharkTool-Client-Key on all SharkTool Web API requests."}`. So a private web API exists and requires a client key issued to the app. Not documented, not for third parties. I did not try to obtain or guess a key. [H]
- docs.sharktool.com and app.sharktool.com do not resolve. [H]
- For market data use Polymarket's own APIs (Gamma/CLOB/Data API), covered elsewhere.

## Trade path

- Programmatic trading via Sharktool: none (GUI desktop app; no documented API). [H]
- Order flow goes to Polymarket with builder code `0x873590b3...544418` attached (builder codes are serialized in the signed order). [H: leaderboard row; builder-code mechanism per https://docs.polymarket.com/developers/builders/builder-intro]
- PayBox reachability: paybox_reachable = no for Sharktool itself (nothing to call). An EVM wallet could trade the same liquidity directly on Polymarket by signing orders there; that is the Polymarket adapter's job, with or without a builder code.

## Fees

- Sharktool: "no monthly fee, no trial, no fine print" for Odd Justa account holders (site copy, Portuguese). [H] Polymarket-build pricing/builder fee: NOT FOUND (searched: homepage, Polymarket builder intro page which says it does not cover builder fees). Any builder fee, if charged, would be a Polymarket-side parameter set by the builder and paid by the trader; unverified. [L]

## Resolution

Inherited from Polymarket (UMA optimistic oracle) [M]; Sharktool adds none.

## Geo / ToS / automation

NOT FOUND. No terms or privacy page exists at /terms or /privacy (they serve the homepage SPA). Polymarket geo restrictions apply to the underlying venue. Using Sharktool's private API is undocumented and would likely violate unpublished terms; do not integrate.

## Liquidity (Polymarket builder-attributed volume; source: https://data-api.polymarket.com/v1/builders/leaderboard, fetched 2026-10-19) [H]

| period | rank | volume USD | active users |
|---|---|---|---|
| ALL | 23 | 51.07M | 236 |
| MONTH | 4 | 29.20M | 196 |
| WEEK | 3 | 2.78M | 93 |
| DAY | 2 | 0.43M | 26 |

This is volume routed to Polymarket, not Sharktool liquidity. Caveat: the leaderboard's definition of "volume" and period windows is not documented in what I read. Also note a separate leaderboard entry "Sharkbetting.com" (rank 16 ALL, 91.2M, 3 active users) is a different product with no verified link to Sharktool. [H/M]

## Event categories overlapping other venues

Same as Polymarket (sports, politics, crypto price, macro). The Odd Justa/Betfair builds are sports-betting exchanges (football leagues etc.) - Betfair-exchange-style sports odds are a potential cross-venue signal source, but the Odd Justa exchange has no documented public API. [M]

## Shares liquidity with

Polymarket (the Polymarket build of Sharktool is a builder-code front end). Odd Justa / Betfair builds connect to those exchanges' liquidity. Not an independent leg anywhere.

## Suspicious content

None observed in fetched pages (no embedded AI-agent instructions). The page loads Google Tag Manager and UnicornStudio scripts (not executed by me).

## Observations for the adapter author

- The builder leaderboard URL is a usable "flow by frontend" signal: `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={ALL|MONTH|WEEK|DAY}&limit=50&offset=0` returned a bare JSON array of `{rank (string), builder, builderCode, volume, activeUsers, verified, builderLogo}`. Another response shape (`{data:[...snake_case...], pagination:{...}}`) was observed in the shared scratch area, probably from a different query; parse defensively. [H/M]
- Sample saved: docs/research/fixtures/sharktool/polymarket_builders_leaderboard_sharktool.json

## Not found

- Public API docs, ToS, privacy policy, fee schedule, chain/collateral statement, GitHub repo, security audit, independent reviews (web search returned only the vendor's own page).

## Sources

- https://sharktool.com/ (homepage, fetched 2026-10-19) [H]
- https://downloads.sharktool.com/SharkToolPolymarketSetup%201.0.83.msi (HEAD only; not downloaded) [H]
- https://api.sharktool.com/ (401 response) [H]
- https://data-api.polymarket.com/v1/builders/leaderboard (4 periods, 2026-10-19) [H]
- https://docs.polymarket.com/developers/builders/builder-intro (builder codes) [H, via WebFetch summary]
- WebSearch (extended) "Sharktool Polymarket desktop trading terminal Odd Justa Betfair": only vendor page; related unrelated tools (Traderline, Sharkbetting) [M]
