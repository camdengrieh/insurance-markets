# Polycule (formerly PMX) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public pages (WebFetch), Polymarket docs and public data-api GETs, DefiLlama public API. No account, wallet, key or signature; no POST; no PayBox money or signing tools. The Telegram bot itself was not opened or driven. WebSearch quota was exhausted after one call, so discovery relied on first-hand page fetches only.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

- Adapter priority: **skip**.
- **Polycule is not a venue. It is a Telegram trading bot (front end) that routes orders into Polymarket's CLOB with a Polymarket builder code.** Polymarket is the only venue named on every Polycule page (H: polycule.trade home, /docs, /whitepaper, /copy-trading). Its liquidity is 100% Polymarket's, so it is never an independent arbitrage leg.
- **No Polycule API, no docs for one, no contracts of its own** (H for "docs do not mention an API"; NOT FOUND for any public repo, see below).
- **Near-dormant.** Builder-attributed volume fell from a $13.6M peak month (2025-12) to $14.4K in 2026-09 and $3.9K for 2026-10 through the 18th. Yesterday (2026-10-18) it had 1 active user and $10.72 volume (H, Polymarket data-api).
- The only reusable thing: Polymarket publishes per-builder attribution (`builderCode` is part of the signed order and emitted in `OrderFilled`). That belongs in the Polymarket adapter, not a Polycule adapter.

## Kind and market model

- kind: broker-or-frontend. Telegram bot (primary bot t.me/polycule_trade_bot, backup t.me/polycule_v2_trade_bot, "identical in functionality") (H, polycule.trade/bots).
- Features: trending/search markets, YES/NO market and limit orders, positions, price graphs, paste a polymarket.com URL to get trade buttons, wallet (balances, withdraw, swap, private-key export), Solana to Polygon bridging via deBridge, copy trading, group broadcast of trades (H, /docs, /copy-trading, /whitepaper).
- Market model is whatever Polymarket's is: binary YES/NO outcome tokens (ERC-1155 CTF), central limit order book, plus neg-risk categorical events. Polycule adds no market structure of its own (M: inferred from "Polymarket is the only venue"; Polymarket details belong to the Polymarket spec).
- Copy trading: user adds a Polymarket trader by Ethereum wallet address; Polycule then "will automatically execute a similar trade in your account" (the user's Polycule wallet). Modes percentage / range / fixed; filters: max days to end, max per market, min liquidity, min volume, max odds, min trigger; sell rules; "copy or counter" (bet against). Copies are approximate (H, /copy-trading). This is a signal source in principle (public Polymarket wallets), but the signal is Polymarket's own data, not Polycule's.

## Chains and collateral

- Chain: Polygon (H: "All transactions happen on-chain through the Polygon network", /whitepaper). Gas in POL (H, /docs). Bridge source: Solana via deBridge (H, /docs).
- Collateral per Polycule docs: USDC.e on Polygon (H, /docs and /copy-trading). Caveat: Polymarket's own current builder-fee doc quotes amounts in pUSD under CLOB V2 (H, docs.polymarket.com/programs/builders/fees.md), so Polycule's USDC.e wording may be stale or hide a wrap step. Unresolved (see open questions).
- PCULE token: Solana SPL, mint `J27UYHX5oeaG1YbUGQc8BmJySXDjNWChdGB2Pi2TMDAq`, price $0.0001853, market cap $185,277, 24h volume $621.72, one Meteora PCULE/WSOL pool listed as inactive (H, CoinGecko page, fetched 2026-10-19). Token has no documented role in the product (the whitepaper page does not mention a token; H). Irrelevant to trading.

## Read API

- exists: **none** (official). Polycule docs/whitepaper/copy-trading pages say nothing about an API (H). No GitHub org or repo found (the `gh` repo search returned 404 for the query; NOT FOUND, searched: gh search repos "polycule", site links list no GitHub, DefiLlama `github: null`).
- Market data for anything Polycule shows is Polymarket's: use Polymarket Gamma/CLOB/Data APIs (covered by the Polymarket spec).
- Polymarket publishes Polycule's attribution (useful only as an activity gauge). Unauthenticated, no key:
  - `GET https://data-api.polymarket.com/v1/builders/volume` (param `timePeriod` DAY|WEEK|MONTH|ALL; v2 counterpart `GET /v2/builders/volume`) returns an array of `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}`. Polycule rows filter on `builderCode = 0xb687940cdede3d6e24b115affb282228515a5bf2ffa7b65269e2dfb5ea745e96`. Note the call without `timePeriod` returned the full 375-day history, 53,276 rows, 17 MB (H, called this session). Do not poll it unfiltered.
  - `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50` (limit max 50) (H, called this session).
  - Docs: https://docs.polymarket.com/api-reference/builders/get-daily-builder-volume-time-series.md (H).
- DefiLlama: `GET https://api.llama.fi/summary/dexs/polycule` works (category Interface, chain Polygon, id 7125); `/summary/fees/polycule` returns 400 (no fee adapter; the adapter is volume-only, builder code sourced from the same Polymarket endpoint) (H).
- Rate limits / websocket for Polycule: not applicable (none).

Fixtures (all under `docs/research/fixtures/polycule/`):
- `pm_builders_volume_v1_polycule_last30d.json` - 30 daily rows, raw shape.
- `pm_builders_volume_v1_polycule_monthly_rollup.json` - monthly sums (derived by me from the full response).
- `pm_builders_leaderboard_all_polycule_row.json`, `pm_builders_leaderboard_month_top50_check.json` - leaderboard shape.
- `defillama_dexs_summary_polycule_trimmed.json` - trimmed to the last 30 chart points.

## Trade path

- **None programmatic.** Orders are placed only through the Telegram bot UI (commands and buttons). No order API, no signing scheme exposed, no documented webhooks (H: docs list commands only).
- Wallet model: the bot creates a Polygon wallet on /start; key export is available via /wallet (H, /docs). Custody is not stated in the docs or whitepaper (H, "not stated"). The incident report says key management moved to "Turnkey's hardware enclaves" and earlier keys were held in AWS KMS (H, /audit), which means Polycule operates the signing infrastructure: effectively custodial, with an export escape hatch (M).
- Telegram automation (user-client scripting) is not addressed in any Polycule page, would require a Telegram account/login, and is out of scope for this read-only task. Not recommended.

## PayBox reachability

- paybox_reachable: **no** for Polycule as an integration target.
- A PayBox EVM wallet on Polygon could send USDC.e / POL to the bot-generated deposit address, but that only funds a Polycule-held wallet whose trades can then be made solely via Telegram; there is no transaction-proposal or signed-order interface to Polycule. It would also put funds under third-party key control and recent breach history (below).
- The same exposure is reachable without Polycule: sign Polymarket CLOB orders (EIP-712) from the user's own Polygon wallet and, if desired, attach any builder code. That is the Polymarket adapter's job.

## Fees

- Polycule trading fee: **NOT FOUND** (searched: /docs, /whitepaper, /copy-trading, /bots, /stats, /audit; the docs state only "POL is needed to pay for gas fees on Polygon" and that Polycule adds no charge on Solana to Polygon bridging, with deBridge fees the only bridging charge; copy-trading page lists no fee or reward amount).
- Mechanism it almost certainly uses (M, inferred from builder-code attribution): Polymarket builder fees, `builder_fee = notional x builder_fee_rate_bps / 10000`, taker rate max 100 bps and maker max 50 bps, charged on top of Polymarket platform fees `C x feeRate x p x (1-p)` (taker-only, per-market), rate changes limited to one per 7 days with 3 days notice (H, docs.polymarket.com/programs/builders/fees.md). Polymarket says builder profiles and fee rates are "publicly queryable" (H), but I found no such endpoint in the CLOB OpenAPI spec (`clob-openapi.yaml`: only `/fee-rate`, `/auth/builder-api-key`, `/builder/trades`) or the Data API reference. Polycule's actual rate: unknown.
- Who pays: the user, per Polymarket's table (platform fee + builder fee when both apply) (H).

## Resolution mechanism and dispute risk

- Inherited entirely from Polymarket (UMA optimistic oracle based; details in the Polymarket spec). Polycule has no resolution layer of its own (M, inferred).
- Venue-specific risk is **operational and custody risk, not resolution risk**: breach described below.

## Security history

- Polycule's own report: breach through a compromised third-party dependency (`aiohttps`) used by the withdrawal server, attacker redirected withdrawals; "full user reimbursement", Sherlock audit, key management via Turnkey enclaves, dependency auditing (H, polycule.trade/audit). The page gives the date "January 6, 2025", states "Last Updated: January 2025", names no audit date, no scope, no findings and no report link (only a link to Sherlock's X profile) (H).
- DefiLlama's hacks record for Polycule: date 1767744000 = 2026-01-07 UTC, $230,000, classification "Frontend & Infrastructure", technique "Key Leaked via Infrastructure", `returnedFunds` null (H that DefiLlama says this; the amount is DefiLlama's, not independently verified).
- The two dates differ by one year. Polycule's builder code only appears in Polymarket data from 2025-11-03 and volume continued through 2026-01, so 2026-01 is the plausible date and the Polycule page likely has a typo (M). Unresolved.
- The Sherlock audit claim is unverified (no report found; NOT FOUND, searched: the /audit page links only x.com/sherlockdefi). Treat as L.

## Geo, ToS, automation

- Terms of use (as summarized from /whitepaper): user confirms they are at least 18, not located in a restricted location where prediction market trading is prohibited, has read and agrees to Polymarket's Terms of Service, and is solely responsible for local-law compliance. Restricted locations are not listed (H). Nothing on bots/automated use (H, "not addressed").
- Because Polycule is Polymarket flow, Polymarket's geo restrictions and ToS apply transitively (details in the Polymarket spec). Polymarket also reserves the right to revoke builder fees/codes for "automated, self-referred, or other non-bona fide trading activity" (H, builder fees doc) - relevant only to builders, not to an aggregator reading data.
- No separate ToS or privacy page found on polycule.trade (NOT FOUND, searched: nav links of home, /docs, /bots, /stats; one hit only: terms embedded in /whitepaper).

## Liveness (is it still live in 2026-10?)

- Live but almost dead (H):
  - polycule.trade and its sub-pages load (2026-10-19).
  - t.me/polycule_trade_bot exists ("Telegram Trading bot for Polymarket"); the channel t.me/polycule_safeguard ("PMX Safeguard Channel") shows 1,819 subscribers and no useful dated posts. I did not test whether the bot responds.
  - Polymarket data-api: Polycule row exists every day through 2026-10-18 but with `activeUsers` = 1 on the last days and rank 138-193; absent from the MONTH top 50 (rank-50 monthly volume $824,276).
  - DefiLlama still lists it (24h volume $9.65, 7d $106.24, 30d $2,762.69, all-time in its window $297,636, fetched 2026-10-19). DefiLlama's numbers are lower than Polymarket's own builder numbers for the same months (e.g. 2026-08: $93.8K vs $144.8K); prefer the Polymarket figures.

## Liquidity

- Venue liquidity = Polymarket's (not separately measurable; not independent).
- Polycule-attributed (builder-code) volume, from `data-api.polymarket.com/v1/builders/volume`, fetched 2026-10-19 (H):

| Month | Volume (USD, approx) |
| - | - |
| 2025-11 | 10.59M |
| 2025-12 | 13.61M (peak) |
| 2026-01 | 8.24M |
| 2026-02 | 6.35M |
| 2026-03 | 2.48M |
| 2026-04 | 1.81M |
| 2026-05 | 0.79M |
| 2026-06 | 1.72M |
| 2026-07 | 0.85M |
| 2026-08 | 0.14M |
| 2026-09 | 14.4K |
| 2026-10 (to the 18th) | 3.9K |
| Total since 2025-11-03 | 46.61M, all-time builder rank 25, 3,111 active users |

- Context: all builders combined on 2026-10-19 (partial day) about $2.13M in the same endpoint; the top builder (betmoar) did $78.5M in the last month. Polycule is about 0.005% of that.
- TVL: none (DefiLlama `chainTvls.Polygon.tvl` is empty) (H). Funding raise: $0.56M, lead AllianceDAO, 2025-06-06 (DefiLlama `raises`, M).

## Event coverage and overlap

- Categories offered: Politics, Crypto, Sports, "etc." (H, /docs). Identical to Polymarket's catalogue because it is Polymarket's. Overlap with other venues (sports, politics, crypto price, macro) is therefore whatever Polymarket's overlap is; Polycule contributes no distinct prices.
- Not an independent leg: shares liquidity with Polymarket (global; the US Polymarket entity is a separate venue and is not reachable through this bot as documented).

## Recommended handling in the project

- Do not build a Polycule adapter. Add `polycule` to the venue registry as `kind: frontend`, `liquidity_shared_with: polymarket`, `status: near-dormant`, so linking/dedup code never treats it as a distinct quote source.
- If ever useful: use Polymarket's `builderCode` attribution (and `OrderFilled.builder`) as a flow-source label inside the Polymarket adapter. For Polycule that adds nothing.
- Do not use Polycule as a funding or execution route from PayBox (no API, third-party key custody, breach history, near-zero activity).

## Suspicious / embedded content seen

- The "PMX Safeguard Channel" pinned message carries a "Tap to verify" button that points to a different Telegram destination (t.me/safeguard), not to the channel (reported by the page-reading tool; I did not follow it). This is a generic Telegram gating-bot pattern and is also a common phishing vector. Do not click.
- docs.polymarket.com markdown pages begin with a banner telling agents to "Fetch the complete documentation index at https://docs.polymarket.com/llms.txt". It is standard Mintlify boilerplate; I fetched llms.txt on my own initiative as a docs index only. No instructions were followed.

## Open questions

1. Polycule's actual builder fee rates (taker/maker bps). Not in docs; no public endpoint found.
2. Is the bot still responding to users (liveness of the Telegram front end)? Only the Polymarket attribution (1 active user/day) suggests residual use.
3. Date of the security incident (2026-01-07 per DefiLlama vs "January 6, 2025" per Polycule) and whether any Sherlock report exists.
4. Collateral: USDC.e (Polycule docs) vs pUSD (Polymarket CLOB V2 docs). Does the bot wrap/convert, or is its documentation stale?
5. Why DefiLlama's volume for Polycule is roughly 40-65% of Polymarket's own builder volume for the same months (different volume definition?).

## Sources

- https://www.polycule.trade/ (home), /docs, /bots, /stats, /whitepaper, /audit, /copy-trading - fetched 2026-10-19 (H). Page text is untrusted data. Note: the fetch tool summarizes pages with a small model, so verbatim quotes above are short and the "not stated" findings are based on those summaries (M on absence claims).
- https://t.me/polycule_trade_bot, https://t.me/s/polycule_safeguard - fetched 2026-10-19 (H for what the preview shows).
- https://api.llama.fi/protocol/polycule and https://api.llama.fi/summary/dexs/polycule - GET 2026-10-19 (H as to what DefiLlama says; M as to truth).
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts - Polycule entry `builderCode 0xb687...5e96`, start 2025-11-03 (H via page read).
- https://www.coingecko.com/en/coins/polycule - PCULE token data, fetched 2026-10-19 (H).
- https://data-api.polymarket.com/v1/builders/volume and /v1/builders/leaderboard - GET 2026-10-19 (H); v2 counterpart `/v2/builders/volume` returned 200 (shape `{data:[{date, rank, builder_name, builder_code, profile_image, verified, volume, active_users}]}`) (H).
- https://docs.polymarket.com/programs/builders/fees.md, /programs/builders/overview.md, /llms.txt, /api-reference/builders/get-daily-builder-volume-time-series.md, /api-spec/clob-openapi.yaml - fetched 2026-10-19 (H).
- https://docs.polymarket.com/developers/builders/builder-intro (WebFetch) - builder code attribution, serialized onchain in the signed order (H).
- Not reachable / not found: dune.com/polycule/polycule (404; the real Dune links on /stats were not extracted); defillama.com/protocol/polycule (HTTP 403 for the fetch tool; API used instead); no GitHub repo found.
