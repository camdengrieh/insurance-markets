# Tailgate (Polymarket builder) - venue spec

Researched 2026-10-19. Read-only: WebFetch/WebSearch, unauthenticated GETs to `data-api.polymarket.com`, `docs.polymarket.com`, `trytailgate.com`, generic User-Agent `insurance-markets-research/0.1`. No account, wallet, key, signature, POST/PUT/DELETE, no browser automation. The session web-search budget ran out after the first query, so only one search was possible. `x.com/thetailgateapp` returned HTTP 402 and was not read (no payment attempted). Third-party text was treated as untrusted data; none contained instructions aimed at agents.

Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## 1. Verdict

- **Live, but a front end, not a venue.** Tailgate is a consumer sports-prediction social/copy-trading app that routes orders to Polymarket (Polygon) and, per a third-party listing, to Kalshi via DFlow (Solana). Its Polymarket flow is attributed by a builder code, and builder-attributed orders match on Polymarket's own CLOB (H: Polymarket builder docs). (H live: `trytailgate.com` returns the app shell, builder code has volume every day for the last 30 days.)
- **Not an independent arbitrage leg for Polymarket flow.** It shares 100% of that liquidity with Polymarket. The Kalshi leg (if real) shares liquidity with Kalshi. Both are covered by the parallel workflow. Tailgate adds no liquidity of its own that we could find. (H for Polymarket sharing, M for Kalshi.)
- **No public API, no docs, no developer program found.** Adapter priority: **skip** as a venue. Only residual value: the Polymarket builder-code row as a flow/attribution signal (P2-ish, and trivially replaced by Polymarket's own data).

## 2. Identity

| Item | Finding | Tag |
|---|---|---|
| Name | Tailgate (builder name on Polymarket) | H |
| Official site | `https://trytailgate.com` (Next.js web app; Discover page shows Home / Feed / Leaderboard / Rewards, Deposit button, Value Picks, sports tabs NFL, CFB, NBA, WNBA, NHL, MLB, soccer, tennis, golf, UFC, esports). The earlier lead "tailgate.xyz" is a Spaceship domain-for-sale page, unrelated. | H |
| Official X | `https://x.com/thetailgateapp` (HTTP 402, not read). Identified via search result only | M |
| Developer / backers | OverHerd Inc. (Mount Pleasant, SC); "backed by Alliance and CB Ventures". From a third-party listing page (polymart.app), a promotional directory | M |
| Distinct from | `thetailgate.app` ("TailGate - Know Your Slip's Worth", a different product), `tailgate.app` (domain for sale) | H (page titles) |
| Listing dates | PolyMart listing dated 2026-07-12, last updated 2026-08-08; "invite-only for now" at that time | M |
| Builder code (public bytes32 attribution tag, not a secret) | `0x03d53e4e8daed156c80448931d72b3b6b0b57e1565bfa2855fca74a055f24c08` | H |
| Builder verified flag | `verified: true` | H |
| OpticOdds lead | An existing note in this repo lists a venue id `tailgate_exchange` in OpticOdds' sports prediction-market reference table (Oct 2026). Suggests Tailgate may be treated as a distinct "exchange" in third-party odds feeds. Not verified here; could simply be its routed aggregate. | M (secondary, from `docs/research/venues/opticodds.md`) |

Source for site content: `https://trytailgate.com` HTML fetched directly and via WebFetch; robots.txt is a template (`Sitemap: https://yourdomain.com/sitemap.xml`), `/terms` and `/privacy` return 404 (H). The profile link renders `/profile/undefined`, so the web app looks unfinished (H, WebFetch summary).

## 3. Kind and market model

- Kind: broker/front end (social copy-trading, "cross exchange routing engine" claimed). No own markets, order book, or settlement found. (M: marketing description on polymart.app; H: no own market surface on trytailgate.com).
- Market model is inherited: Polymarket binary outcome (ERC-1155 conditional tokens, CLOB) and, per the listing, tokenised Kalshi markets on Solana via DFlow. Sports only in the app tabs. (M)
- Claims such as "negative vig" fills and best-price routing across venues are marketing text from a promotional page, unsubstantiated. (L)

## 4. Chains and collateral

- Polymarket leg: Polygon, pUSD/USDC-class collateral per Polymarket (out of scope here; see the Polymarket note). (M for Tailgate's use of it; per polymart.app listing)
- Kalshi leg: Solana via DFlow tokenised markets (M, listing only; not confirmed on `trytailgate.com`).
- How users fund Tailgate (card, USDC deposit, which chain) and who holds keys/custody: NOT FOUND (searched: trytailgate.com home, polymart.app listing; the site has a Deposit button but no docs).

## 5. Read API

- **Tailgate itself: none found.** NOT FOUND (searched: trytailgate.com HTML/robots, `/terms`, `/privacy`, polymart.app, WebSearch). No docs, OpenAPI, SDK, GitHub org, or websocket located. The web app's internal API is undocumented and was not probed.
- **What is available is Polymarket's builder data (public, unauthenticated, H, fetched 2026-10-19):**
  - `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={ALL|MONTH|WEEK|DAY}&limit=50&offset=0`
  - `GET https://data-api.polymarket.com/v2/builders/leaderboard?timePeriod=ALL&limit=50` (snake_case fields)
  - `GET https://data-api.polymarket.com/v2/builders/volume?interval=day` (daily rows per builder, about 90 buckets; returns all builders so the payload is large, filter client-side by `builder_code`)
  - Docs for the program: `https://docs.polymarket.com/programs/builders/overview.md`, `.../fees.md`, `.../tiers.md`. The Data API endpoints above are not listed in `llms.txt` under the builder pages (NOT FOUND in docs index; shapes confirmed empirically, treat as semi-documented). (H)
  - Auth/limits for these endpoints: no key needed; rate limits not documented in what I read. Volume unit (USD vs shares) is not stated; a sibling note in this repo found the v2 volume behaves like shares for another builder. Here v2 30-day sum is about 7.26M vs v1 MONTH 4.45M, so the two feeds are not directly comparable. Treat all volume figures as indicative.
- Underlying market data (markets, books, trades, resolution) for the Tailgate leg comes from Polymarket Gamma/CLOB/Data APIs, i.e. the Polymarket adapter. Per-user or per-order Tailgate attribution on trades: NOT FOUND (not searched in depth; the builder code is serialized in the signed order on-chain, so it may be recoverable from order-matched events, M).

### Confirmed response shapes (fixtures in `docs/research/fixtures/tailgate-polymarket-builder/`)

v1 leaderboard row (ALL, 2026-10-19):
`{"rank":"36","builder":"Tailgate","builderCode":"0x03d5...4c08","volume":27276183.9005,"activeUsers":6026,"verified":true,"builderLogo":"..."}`

v2 daily volume row:
`{"date":"2026-10-19","rank":21,"builder_name":"Tailgate","builder_code":"0x03d5...4c08","verified":true,"volume":34159.2257,"active_users":146}`

Files: `polymarket_builders_leaderboard_v1_tailgate_rows.json` (ALL/MONTH/WEEK/DAY rows), `polymarket_builders_volume_v2_day_tailgate_rows.json` (30 daily rows, 2026-09-20 to 2026-10-19).

## 6. Trade path

- Via Tailgate: none programmatic. Mobile/web app with invite/login; no API (see 5). Automating the web app would be UI automation, out of scope. (H for absence)
- The underlying exposure is reachable only through Polymarket directly (and Kalshi / DFlow directly). Polymarket orders are signed EIP-712 orders posted to the CLOB, with an optional `builder` field (bytes32 builder code) serialized in the signed order. (H, `docs.polymarket.com/programs/builders/overview.md`)
- PayBox: an EVM wallet on Polygon could in principle sign Polymarket orders, but that belongs to the Polymarket adapter, and there is no reason to go through Tailgate. A PayBox wallet cannot become a Tailgate user without the app's own login/custody flow (NOT FOUND). `paybox_reachable`: no for Tailgate itself.
- Tailgate's own builder code is not something we would attach; using another party's code would misattribute volume and fees.

## 7. Fees

| Component | Formula | Payer | Tag |
|---|---|---|---|
| Polymarket platform fee (when the market has one) | per Polymarket fee docs; independent of builder | trader | H (`docs.polymarket.com/programs/builders/fees.md`: builder and platform fees are independent and additive) |
| Polymarket builder fee (Tailgate's possible cut) | flat percentage of trade notional; taker default 0 bps, max 100 bps; maker default 0, max 50 bps; 1 bp granularity; rate changes once per 7 days, effective 3 days after scheduling | trader | H |
| Tailgate's actual builder rate | NOT FOUND (searched: trytailgate.com, polymart.app; the rate is set on the builder profile and is not exposed by the Data API endpoints I used) | | |
| Tailgate app fee / routing fee / deposit fee | NOT FOUND. polymart.app lists price "Free" (app itself) | | M |

Arbitrage consequence: a Tailgate leg costs Polymarket's fees plus an unknown builder fee of up to 1% taker; Polymarket direct dominates.

## 8. Resolution and dispute risk

Inherited from the underlying venue: Polymarket resolves via UMA's optimistic oracle (see the Polymarket note); Kalshi resolves per its own rulebook. Tailgate adds custody/app risk on top but no resolution logic of its own that I found. (M)

## 9. Geo, ToS, automation

- Tailgate terms of service / privacy: NOT FOUND (`/terms` and `/privacy` return 404 on trytailgate.com; searched home page and listing). Geo restrictions: not stated (polymart.app does not mention any). Invite-only status as of mid-2026 per a third-party listing (M).
- Polymarket's builder-fee page warns the platform may revoke builder fees for "automated, self-referred, or other non-bona fide trading activity" (H). Not a restriction on us, but a reminder not to route our own automated flow through someone else's builder code.
- No automation policy found for Tailgate itself.

## 10. Liquidity (Polymarket builder-attributed flow, `data-api.polymarket.com`, fetched 2026-10-19, H)

| Window | Rank | Volume | Active users |
|---|---|---|---|
| All time (v1) | 36 | 27.28M | 6,026 |
| Month (v1) | 25 | 4.45M | 2,311 |
| Week (v1) | 25 | 0.277M | 378 |
| Day (v1, 2026-10-19) | 20 | 0.032M | 143 |
| v2 daily, 2026-09-20 to 2026-10-19 | n/a | 30 daily rows, about 0.16M to 0.51M on sampled days; sum 7.26M | 146 to 551 per day |

This is flow it routed into Polymarket, not Tailgate-owned depth. Currency/unit uncertainty and the v1/v2 mismatch noted in section 5. The all-time board is dominated by far larger front ends (betmoar 2.34B, Gate 0.88B, etc.), so Tailgate is a mid-sized, sports-focused one.

## 11. Event overlap and shared liquidity

- Categories: sports only (NFL, CFB, NBA, WNBA, NHL, MLB, soccer, tennis, golf, UFC, esports in the UI; World Cup mentioned in listing). These overlap Polymarket, Kalshi, and sportsbooks/other PMs. (H for UI tabs, M for the rest)
- **Shares liquidity with: Polymarket (100% of the builder-coded flow) and, if the listing is right, Kalshi via DFlow.** NOT an independent arbitrage leg.

## 12. Adapter recommendation

- `adapter_priority`: **skip**. No API, no own liquidity, no independent pricing. Dedupe Tailgate under Polymarket/Kalshi; if the aggregator wants attribution analytics, poll the two builder endpoints for the builder code above (cheap, but low value).
- Any `tailgate_exchange` entries seen in third-party odds feeds (OpticOdds) should be mapped to the underlying venue before arbitrage detection, or flagged as duplicate liquidity.

## 13. Open questions

1. Does Tailgate actually route to Kalshi/DFlow, and does it ever cross venues at best price (the "cross exchange routing engine")? If so, are its quotes derived from Polymarket/Kalshi books (then purely derivative)?
2. What builder fee rate does Tailgate charge, and is there a separate app fee?
3. Custody model and funding rails; geo restrictions; terms of service.
4. Is `tailgate_exchange` in OpticOdds a real separate book or just routed flow?
5. Unit of Polymarket builder volume (USD vs shares) and why v1 MONTH (4.45M) and the v2 30-day sum (7.26M) differ.

## Sources

- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0 (also MONTH, WEEK, DAY) - H, fetched 2026-10-19
- https://data-api.polymarket.com/v2/builders/volume?interval=day - H, fetched 2026-10-19
- https://data-api.polymarket.com/v2/builders/leaderboard?timePeriod=ALL&limit=50 - H, fetched 2026-10-19
- https://docs.polymarket.com/programs/builders/overview.md - H
- https://docs.polymarket.com/programs/builders/fees.md - H
- https://docs.polymarket.com/programs/builders/tiers.md - H
- https://docs.polymarket.com/llms.txt - H (docs index; no builder Data API reference page found)
- https://trytailgate.com - H (app shell content), `/terms`, `/privacy` 404, `/robots.txt` template
- https://polymart.app/tailgate - M (third-party promotional listing; source of OverHerd Inc., Alliance / CB Ventures, Polymarket + Kalshi/DFlow, invite-only, dates)
- https://x.com/thetailgateapp - not read (HTTP 402); known from search result only
- https://tailgate.xyz - H (domain for sale, unrelated); https://thetailgate.app - H (different product)
- Repo note `docs/research/venues/opticodds.md` line 42 (`tailgate_exchange`) - M
- WebSearch (extended) "Tailgate Polymarket trading app prediction markets" - M, one search only (budget exhausted afterwards)
