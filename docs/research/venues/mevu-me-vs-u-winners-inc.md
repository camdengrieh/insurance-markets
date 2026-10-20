# MeVu (Me vs. U) / Winners, Inc. - venue spec

Researched 2026-10-19. Verdict: **skip** (frontend/broker on top of Polymarket and Kalshi; not an independent leg; no public API).

Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Summary
- MeVu is a consumer sports-first front end (Privy login, embedded wallets) that routes orders to Polymarket (Polygon) and Kalshi (Solana tokenised path, inferred). It has no order book of its own. [H, bundle + SEC filing]
- Site is live at https://mevu.com (HTTP 200, SPA, title "MeVu ( Me Vs You) Prediction Markets Execution Platform"). [H]
- Its backend is `dev.api.mevu.com` (a "dev" host used by the production bundle), undocumented, and per-user endpoints require a Privy JWT. [H]
- Liquidity is 100% shared with Polymarket and Kalshi, so it is NOT an independent arbitrage leg. It adds nothing the adapters for those two venues will not already give us.

## Kind and market model
- kind: broker/frontend/aggregator. No own book. [H: SEC filing text "trading and execution platform aggregator for Polymarket and Kalshi"; bundle toggles "Poly"/"Kalshi" modes]
- Market model: binary, per-game moneyline style (home/away buyPrice/sellPrice in cents, `probability`), mirrored from Polymarket CLOB and Kalshi. Feed objects carry `kalshiTicker` (e.g. `KXLALIGAGAME-...`) and `kalshiBuyPrice/kalshiSellPrice` next to Polymarket-derived `buyPrice/sellPrice`. [H, fixture]
- Outcome tokenisation: inherited from underlying venue (Polymarket CTF ERC-1155 outcome tokens on Polygon; Kalshi contracts). [M]

## Chains and collateral
- Polymarket side: user "proxyWalletAddress" (Polygon, USDC); Kalshi side: user `solanaWalletAddress` (Solana). Embedded wallets via Privy; a Privy "session signer" is added server-side via `POST /api/users/add-session-signer` so the MeVu backend can sign on the user's behalf. [H, bundle] This means trades are authorised by MeVu's backend, not by user-signed orders per request.
- Deposits: crypto (USDC), card/onramp (Topper, MoonPay, Coinbase onramp, Mesh) [H, bundle strings].

## Read API
- Official public API / docs: **NOT FOUND** (searched: mevu.com/api, mevu.com/terms (both return SPA shell), docs.mevu.com (NXDOMAIN), bundle strings; WebSearch budget exhausted so no web search was done).
- Unofficial: the web app's own backend `https://dev.api.mevu.com`. [H, bundle]
  - `GET /api/games/frontend` - unauthenticated, 200 JSON, paginated (`page`, `limit` 50, `total` 605, `hasMore`). Fields: id, slug, sport, league, isLive, ended, endDate, volume ("$219.7k" strings), liquidity (string), traders, spread, homeTeam/awayTeam {abbr,name,record,buyPrice,sellPrice,probability,kalshiBuyPrice,kalshiSellPrice}, kalshiTicker, chartData, percentChange. Fixture: `docs/research/fixtures/mevu-me-vs-u-winners-inc/games-frontend-sample.json`. [H]
  - Streams: `GET /api/games/stream` (SSE), `wss://dev.api.mevu.com/ws/games`, `/ws/activity`. Not exercised. [H bundle only]
  - Authenticated (Privy JWT, `X-Privy-User-Id`): `/api/trading/positions`, `/api/kalshi-trading/{balance,portfolio}`, `/api/positions/portfolio/{id}`, `/api/balances/*`, `/api/geo/access`, `/api/crypto-markets/{activity,series}`. [H bundle only, not called]
- Data quality: the feed is stale/noisy. 48 of the first 50 games are tennis doubles with endDate months in the past or weeks away but flagged `isLive: true`, volumes of $29-$242. Only 2 non-tennis games on page 1 (one La Liga with "$219.7k" volume / "$98.4k" liquidity, which is just mirrored Polymarket/Kalshi numbers). [H, fixture]
- Better: use Polymarket and Kalshi APIs directly (covered elsewhere).

## Trade path
- Programmatic order API: **none documented**. Orders are placed through the web app with Privy auth and a MeVu-held session signer. A third-party agent cannot trade through MeVu without a Privy-authenticated user session (would require account creation / login; not attempted).
- Not reachable via PayBox: no on-chain venue contract of its own and no user-signed order scheme to hand to a PayBox wallet. paybox_reachable = no. Direct Polymarket/Kalshi paths are the right route.

## Fees
- NOT FOUND (searched: bundle strings for fee/builder/referral terms, SEC filing). SEC filing discloses no fee structure; it lists revenue targets only ($100k Phase One, $1M monthly Phase Two). [H via SEC page, partial read: first 100k of 138k chars]
- A referral programme exists (`/referrals`, 8-char codes). [H bundle]

## Resolution
- Inherited from Polymarket (UMA optimistic oracle) and Kalshi (exchange determined). MeVu adds no resolution layer; extra risk is counterparty/custody risk on MeVu's backend signer. [M]

## Geo / ToS / automation
- App calls `GET /api/geo/access` before trading, so geofencing exists. Terms of service: NOT FOUND (the /terms route is an SPA shell). SEC filing says target audience is the US and international, minimum age 18 to 21 where gaming is permitted. [H]
- robots.txt allows all. [H]

## Liquidity
- Own liquidity: none. Displayed volume/liquidity strings mirror underlying venues. No independent TVL/OI. Company is "pre-revenue, early development-stage" per Reg A filing; gross revenue for nine months to 2025-09-30 was $495, none attributed to MeVu. [H, SEC filing]
- Status mismatch to flag: the March 2026 SEC filing describes the app as planned/in development, while the site and API are serving a working product by Oct 2026. [H both]

## Event overlap
- Sports (NBA, NFL, NHL, MLB, CBB, CFB, soccer incl. EPL/La Liga/WC, UFC, tennis), plus crypto series. All identical to Polymarket/Kalshi events, i.e. a duplicate, not a new leg.

## Shares liquidity with
Polymarket (CLOB) and Kalshi.

## Adapter priority: skip
No independent liquidity, no public API, session-signer custody model, dev-grade backend. One possible use: as a signal that the `kalshiTicker` <-> Polymarket game-id mapping in `/api/games/frontend` gives pre-matched cross-venue pairs (M, low value; we should build our own matcher per docs/market-linking-design.md).

## Not found
- Public API docs, ToS text, fee schedule, order-placement endpoints, contract addresses, volume/OI statistics with dates, WebSearch corroboration (budget exhausted).

## Suspicious content
- None observed. (Bundle and pages contained no AI-directed instructions.)

## Sources
- https://mevu.com (HTTP 200, SPA shell and JS bundle `/assets/index-DpFWSKGn.js`) [H]
- https://dev.api.mevu.com/api/games/frontend (unauthenticated GET 2026-10-19) [H]
- https://www.sec.gov/Archives/edgar/data/1587603/000149315226012984/partiiandiii.htm (Winners, Inc. Reg A Part II/III; read via WebFetch summary, first 100k chars) [H]
- https://x.com/MeVumarkets, https://t.me/mevubeta (links in bundle, not visited) [L]
