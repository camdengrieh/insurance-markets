# Tradoor0 (tradoor0.xyz) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source (URL given), M = secondary or inferred, L = weak or stale. "NOT FOUND (searched: ...)" means searched and absent, not guessed.

## 1. Verdict

**adapter_priority: skip. Tradoor0 is not a venue.** It is a bot-trading front end (a "perp aggregator"/market-making terminal) that also routes users onto Hyperliquid HIP-4 outcome markets with a Hyperliquid builder code attached. It has no book, no markets, no resolution and no custody of its own. Every outcome price, fill and settlement it shows lives on Hyperliquid HIP-4 (HyperCore). It is therefore not an independent arbitrage leg, and it has no public market-data or order API. Anything worth building belongs in the Hyperliquid HIP-4 adapter (see `docs/research/venues/outcome-xyz.md` and `docs/research/fixtures/hyperliquid-outcomes-hip-4/`, produced by a parallel run).

Only residual value: (a) Tradoor-tagged flow is one of ~35 DefiLlama-listed HIP-4 front ends and is about 1% of HIP-4 volume (section 9), (b) its UI shows which HIP-4 deployers exist (Hyperliquid native, outcome.xyz, trade.xyz, Skew).

## 2. Identity and liveness

- Name Tradoor / TRADOOR / Tradoor0; X `@tradoor0`; app `https://tradoor0.xyz`; docs `https://tradoor0.xyz/docs`; ToS `/tos`. No GitHub org, no contracts of its own. (H: homepage and docs fetched 2026-10-19; docs say "Tradoor deploys none")
- kind: `broker-or-frontend`. Docs call it "best categorized as a Perp Aggregator ... does not custody user funds and does not operate its own order book" (H, docs section 1). The docs describe perps only (Hyperliquid, Kinetiq HIP-3, Trade.xyz, Nado on Ink, Extended on Starknet) and never mention HIP-4 or outcome markets (H: docs text searched for outcome/HIP-4/prediction; zero hits). The docs look stale versus the app (their stats example is dated 2026-05-14).
- The app does have an outcomes product (H, from the HTML/JS the site serves, read as data, nothing executed): `/market-making` HTML contains a section "OUTCOME MARKETS (HIP-4, design Tradoor) - /outcomes", a "HIP-4 bot" mode ("Volume Engine", `/hip4vol`), a "HIP-4 Volume Calculator" (CSV of your Hyperliquid trades) and a Tools-menu entry commented as "HIP-4 PREDICTION MARKETS ... /predictions route". `outcomes.js` (v 20261003_1) badges deployers `out` = outcome.xyz, `txyz` = trade.xyz, `skew` = Skew, and unbadged = Hyperliquid native.
- Still live (H): site returns HTTP 200 on 2026-10-19; asset version stamps `styles.css?v=20261011_1`, `app.js?v=20261011_1`; DefiLlama "Tradoor Outcome" shows volume on 130 of 160 days up to 2026-10-17 (section 9). DefiLlama listed the row on 2026-10-08 (`listedAt` 1791497956), with data backfilled to 2026-05-02/04 (H, fixtures).
- Trust note: Tradoor's own stats are self-reported and "Season 1 points" (from 2026-06-02) reward volume ("Your trading volume now earns tPoints", H app HTML). The bots are explicitly volume-farming tools ("Farm volume and funding", "Volume target", "Cost / $10k"). Tradoor-tagged volume is therefore partly incentive-driven churn, not informed flow (M, inference from UI wording).

## 3. Market model and tokenisation

Tradoor has none of its own. Underlying Hyperliquid HIP-4 (H, `https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets`, read 2026-10-19; page is undated):
- Each outcome has two sides, Yes and No, each its own token; they share one merged central limit order book (buy Yes at p == sell No at 1-p). Fully collateralised; at settlement Yes pays `settleFraction`, No pays `1 - settleFraction`; binary Yes = 1 / No = 0. Split/merge/negate operations exist; "questions" group outcomes. Multi-outcome markets "are not part of the initial mainnet release".
- Identity (M, repo `docs/research/09-venues-onchain-clob.md` section 2.6 citing the asset-ids docs page; not re-read this session): `encoding = 10*outcome + side` (0 = Yes, 1 = No); coin `#<enc>`, token `+<enc>`, asset id `100_000_000 + enc`; contract spec lives in the outcome `description` string, e.g. `class:priceBinary|underlying:BTC|expiry:20260526-0600|targetPrice:77363|period:1d` (H: docs example reproduced in `fixtures/hyperliquid-outcomes-hip-4/DOCS_NOT_LIVE_outcomeMeta_settledOutcome_shapes.json`).
- Binary and price-bucket (categorical-ish) shapes only; scalar not offered.

## 4. Chains and collateral

- Settlement chain: Hyperliquid L1 / HyperCore (DefiLlama chain "Hyperliquid L1", tag "Hyperliquid HIP4 Builder"; H fixture `defillama_protocol_tradoor-outcome_2026-10-19.json`). Tradoor also touches HyperEVM, but only to read Hypurr NFT balances for a fee discount (H, docs).
- Collateral: user funds sit in the user's own Hyperliquid account; Tradoor "never holds user collateral" (H, docs). The app's outcome code calls an `usdc_balance` endpoint, and the HIP-4 docs example shows `quoteToken: "USDC"` (H: fixture above). A third-party source says USDH (M, repo doc 09, Chainstack); unresolved, treat the quote token as read from `settledOutcome.spec.quoteToken` at runtime.

## 5. Read API

- Official public market-data API: **none** (NOT FOUND: searched `/docs`, homepage, `/market-making` HTML, `outcomes.js`; no API reference, no OpenAPI, no llms.txt linked).
- Documented public endpoints, both stats-only and perps-and-outcomes-blended, unauthenticated with open CORS (H, docs section 8): `GET https://tradoor0.xyz/api/admin/stats/overview` and `GET https://tradoor0.xyz/api/admin/stats/daily_volume?days=N` (N 7..180; "canonical source for the DefiLlama adapter"). Documented shape (docs examples only): overview `{unique_connected_addresses, active_users, daily_volume_usd, daily_fees_usd, all_time_volume_usd, all_time_fees_usd, avg_pnl_per_million_usd, top_wallets[], as_of}`; daily_volume `{days, series:[{date, volume_usd, fees_usd}]}`. **I did not verify these live**: my one curl attempt was refused by the session permission layer (path contains `/admin/`) and I did not retry or route around it. Saved as `fixtures/tradoor0/tradoor_docs_stats_api_examples_NOT_LIVE.json`. They carry no prices, books or markets, so they are irrelevant to a scanner anyway.
- The app's own backend calls (H as to what the JS references; **not probed**, undocumented, session-auth, no stability promise): `/api/markets?mode=hip4&exchange=hyperliquid_mainnet`, `/api/hip4/book?coin=`, `/api/hip4/outcome/<id>`, `/api/hip4/positions`, `/api/hip4/open_orders`, `/api/hip4/usdc_balance` (the last three take `?subaccount=`), `/api/hip4/taker_order`, `/api/hip4/cancel_order`. Do not build on these; use Hyperliquid directly.
- The real read surface is Hyperliquid's: `https://api.hyperliquid.xyz` `POST /info` (`outcomeMeta`, `l2Book` with `coin: "#<enc>"`, ...) and the WebSocket (`l2Book`, `trades`, `allMids`, `activeSpotAssetCtx`, `outcomeMetaUpdates`). `/info` is POST-only so I sent nothing (ground rules); shapes are in the sibling fixtures directory. Rate limits (H via repo doc 09 citing the official rate-limit page): 1200 REST weight/min/IP; `l2Book` and `allMids` weight 2, most other info requests weight 20.
- Third-party GET sources for Tradoor-attributed numbers (all M, not market data): DefiLlama `https://api.llama.fi/protocol/tradoor-outcome`, `/summary/dexs/tradoor-outcome`, `/summary/fees/tradoor-outcome` (200, fixtures saved); Hyperliquid's public builder-fills archive `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/0x92345453ce2000642d7d4ceeae4fcc6c2e41d23/<YYYYMMDD>.csv.lz4` (HEAD 2026-10-19: 20261017 = 200, 10,010 bytes; 20261018 = 403 not yet published; the files contain third-party user addresses, so I did not download them). DefiLlama's `hl-indexer.llama.rip/v2/data/builder/<addr>/daily/<date>` returned **all zeros** for this builder on 2026-10-16/17/18 while the adapter shows $15-33k/day: the indexer apparently does not track this builder, or lags (unresolved; fixture `hl-indexer_builder_tradoor_daily_20261017_ALL_ZERO.json`).

## 6. Trade path

- Via Tradoor: **no programmatic order API.** Flow in the app (H, app HTML): connect wallet -> "Approve builder fee" -> "Approve TRADOR agent" (a Hyperliquid agent/API wallet that lets Tradoor's server sign orders for you; it cannot withdraw by HL design, M). Docs: wallet signature is verified server-side and bound to a session token; "the server starts a per-user, per-slot bot subprocess" (H, docs). The HIP-4 volume bot sits behind an invite/access-code lock (H, app HTML "Invite-only / Enter your access code"). Operational risk: the UI warns "The server restarted: the bot was stopped and all positions were closed" (H, app HTML).
- Via Hyperliquid directly (what an agent should do): signed `POST /exchange` actions using Hyperliquid's L1-action EIP-712 scheme (msgpack "phantom agent" hash), asset id `100_000_000 + enc` for outcome sides; optional `builder: {"b": <addr>, "f": <tenths of bp>}` on orders, which only works after the user's main wallet signs `ApproveBuilderFee` (H, builder-codes page: `https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes`). Attaching Tradoor's builder code buys nothing and costs the user a fee.
- PayBox reachability: **partial, and only for the underlying Hyperliquid venue, not Tradoor.** PayBox's `request_wallet_sign` can return EVM `typedData`/`raw` signatures with no domain or chain allowlist found, and PayBox lists Hyperliquid (chain 999, HyperEVM) in its chain catalog; there is also a `hyperliquid` plugin, spot only (all M/H per repo `docs/research/06-paybox-platform.md`, not re-tested). Gaps: every order needs a PayBox signing request unless an agent wallet key lives outside PayBox; funding is USDC to HyperCore (Arbitrum bridge) which is a separate step; HyperCore orders are not HyperEVM transactions. No transaction-proposal path exists because HyperCore is not an EVM contract surface. Tradoor itself needs a browser wallet session and an invite code for the bot, so it is not agent-drivable.

## 7. Fees

- Tradoor docs (perps, H): "10 tenths of a basis point (0.001%) on maker volume, deducted from the venue rebate"; 20% discount for Hypurr NFT holders; no taker surcharge; no deposit/custody/subscription fee. The docs contradict themselves: 10 tenths of a bp is 1 bp = 0.01%, not 0.001%. App shows "Tradoor Fees (1 bps)" and referral discounts of 10/20/25% (H, app HTML).
- Tradoor's builder fee on HIP-4 outcomes: **NOT FOUND** (searched docs, app HTML, ToS). Derived by me (M/L): DefiLlama fees divided by volume is about 0.16% (16 bps) on 2026-10-10..17 (e.g. $52 / $32,558 on 10-17; $563 / $352,028 on 10-10), but DefiLlama's fee series has gaps and its volume metric may not equal the fee-bearing base, so do not hard-code it.
- Hyperliquid side (H, `https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees`, read 2026-10-19): "Outcome trading only charges fees when closing or settling, not when opening"; no outcome-specific rate is given; no maker rebates on outcomes. HIP-4 page: "Trading fees are currently zero for initial testing" (undated, possibly stale; conflicts with the fees page). Builder codes: builders earn on sell orders that carry their code (H, HIP-4 page); the builder-codes page itself is silent on outcomes; caps are perps 0.1%, spot 1%.
- Edge model: use Hyperliquid's own fee fields at runtime; treat any builder markup as venue-front-end specific.

## 8. Resolution and dispute risk

Tradoor has no resolution layer. Resolution is Hyperliquid's: recurring BTC binaries settle at 06:00 UTC (daily) to the HyperCore mark price (H, HIP-4 page for the daily case; 15-minute buckets and linear interpolation are M, repo doc 09). Permissionless deployers (outcome.xyz, trade.xyz, Skew) post markets from validator-approved templates from ~2026-08-29; deployers stake HYPE that can be slashed for oracle manipulation or downtime (M: secondary articles disagree on the stake, 500k vs 1M HYPE; the HIP-4 page I read is silent on staking, slashing and disputes). No UMA-style dispute window is documented; risk is deployer/oracle risk plus Hyperliquid validator-set risk. Tradoor adds operational risk only (server-side bots, agent-wallet trust).

## 9. Liquidity (Tradoor-attributed only)

Source: DefiLlama `api.llama.fi/summary/dexs/tradoor-outcome` and `/summary/fees/tradoor-outcome`, fetched 2026-10-19; latest data day 2026-10-17 UTC (H, fixtures). Methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code"; the row is flagged `doublecounted: true`, category Interface, and TVL is empty.
- Volume: 24h (2026-10-17) $32,558; 7d $205,314; 30d $1,178,757; all-time $10,718,706 since 2026-05-04. Peak day 2026-06-28 $821,028. Monthly: May $87,941; Jun $2,666,226; Jul $3,909,698; Aug $900,460; Sep $2,257,750; Oct 1-17 $896,631 (of which $616k came on 10-10 and 10-11). Trend is down and spiky.
- Fees (builder, DefiLlama): 24h $52; 30d $1,302; all-time $8,882 (sparse series).
- Scale versus the venue it routes to: HIP-4 outcome volume on 2026-10-18 was $3.13M and 24h Yes-side volume summed to $2.49M in sibling fixtures (`fixtures/outcome-xyz/hl-indexer_volume_daily_2026-10-18.json`, `fixtures/hyperliquid-outcomes-hip-4/derived_outcome_liquidity_ranking.json`; different days, different metrics, M). So Tradoor-tagged flow is about 1% of HIP-4 volume. No OI or book depth for Tradoor (not applicable).

## 10. Event overlap and shared liquidity

- Categories: whatever HIP-4 lists: mainly crypto-price binaries (BTC daily and 15-minute buckets, HYPE and others) that map onto Polymarket / Limitless / Predict.fun "BTC up/down at time T" markets (M, repo doc 09). I did not enumerate live markets (info API is POST).
- **Liquidity is 100% shared with Hyperliquid HIP-4** (including the outcome.xyz, trade.xyz and Skew deployments), and with ~35 other DefiLlama-listed HIP-4 front ends (M, repo doc 14). It is not an independent arbitrage leg; ingest HIP-4 once and treat Tradoor as a tag.

## 11. Geo / ToS / automation

- Tradoor ToS (H, `https://tradoor0.xyz/tos`, summarised by the fetch tool): 18+; unavailable where "such services are prohibited or restricted" (no country list); software only, not advice or brokerage; no reverse-engineering, no multiple or shared accounts, no use "to manipulate markets or wash trade"; may suspend access at any time; user solely responsible for wallet, keys and API credentials; liability capped at fees paid in the prior 12 months. Wording on custody is silent in the ToS but the docs say non-custodial.
- Automation is the product, but only through Tradoor's own bots. Scraping its undocumented `/api/hip4/*` is not addressed in the ToS and would breach the reverse-engineering clause in spirit; do not.
- Hyperliquid geo/ToS for HIP-4: NOT FOUND this session (app terms page is a JS shell; repo doc 09 reached the same result). Assume US persons are excluded.

## 12. Adapter implications

1. No Tradoor adapter. Add a venue-registry alias `tradoor0 -> hyperliquid-hip4 (front end, builder 0x9234...2d23)` marked `independent_liquidity: false`.
2. If the scanner ever wants front-end flow stats, use DefiLlama `tradoor-outcome` (daily, lagging, M) or the Hyperliquid builder-fills archive; neither is a price feed.
3. Never route orders through Tradoor; sign directly to Hyperliquid, optionally with no builder code.

## 13. NOT FOUND and open questions

- NOT FOUND: Tradoor public market-data or order API; Tradoor outcome builder-fee schedule; Tradoor GitHub (searched: homepage links, docs, DefiLlama `github: null`); Tradoor outcomes in the docs; Tradoor audits (DefiLlama `audits: "0"`); Hyperliquid ToS text; any Tradoor mention in third-party HIP-4 coverage (my one web search for it returned nothing about Tradoor; later searches were blocked by the shared search budget).
- Not verified live: the two `/api/admin/stats/*` endpoints (permission layer refused the GET; not retried).
- Open: why `hl-indexer.llama.rip` shows zero for this builder; whether the fee base is notional or premium; which HIP-4 deployers Tradoor surfaces beyond the three badges; whether HIP-4 outcome fees are still zero (fees page and HIP-4 page differ).

## 14. Suspicious content

None found. I looked for text addressed to AI agents in the docs, homepage and app HTML (greps for "ignore previous", "assistant", "LLM", "system prompt", etc.: zero hits). I read the app HTML and `outcomes.js` by targeted greps, not line by line, so this is a bounded check. The docs ask readers not to request the points formula; that is addressed to users, not agents.

## 15. Sources

- https://tradoor0.xyz (homepage, WebFetch + curl, 2026-10-19) H
- https://tradoor0.xyz/docs (WebFetch + curl; sections 1-11) H
- https://tradoor0.xyz/tos (WebFetch summary) H
- https://tradoor0.xyz/market-making (app shell HTML, 128 KB) and https://tradoor0.xyz/web/outcomes.js?v=20261003_1 (93 KB; read as data, not executed) H
- https://api.llama.fi/protocol/tradoor-outcome, https://api.llama.fi/summary/dexs/tradoor-outcome, https://api.llama.fi/summary/fees/tradoor-outcome, https://api.llama.fi/protocol/tradoor, https://api.llama.fi/protocol/tradoor-perps-aggregator H (fixtures in `docs/research/fixtures/tradoor0/`). The page https://defillama.com/protocol/tradoor-outcome returned HTTP 403 to WebFetch; the API gives the same record.
- https://github.com/DefiLlama/dimension-adapters `factory/hyperliquid.ts` (via `gh api`): `tradoor-perps` builder address and `tradoor-outcome` mapping H
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets H
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees H
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes H
- https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/ (HEAD only) H
- https://hl-indexer.llama.rip/v2/data/builder/... (3 GETs, all-zero results) M
- Repo notes (not re-verified): `docs/research/09-venues-onchain-clob.md` section 2.6; `docs/research/06-paybox-platform.md` sections 4 and 5; `docs/research/14-platform-of-platforms.md` (35 HIP-4 front ends); `docs/research/venues/outcome-xyz.md`
- Web search (extended, 1 call): returned secondary HIP-4 coverage (Datawallet, CoinGecko, KuCoin, Arrakis, Quicknode) with no Tradoor mention; used only for the staking caveat in section 8 (M/L).

## 16. Confidence

High that Tradoor0 is a front end on shared Hyperliquid HIP-4 liquidity and not an independent venue (builder address in DefiLlama's adapter, the Tradoor docs and the app code agree). Medium on volume and fee figures (single third-party aggregator, one source for fees). Low on HIP-4 deployer staking and on the current outcome fee schedule.

## 17. Privacy check

Requests used only the User-Agent `insurance-markets-research/0.1`. No identifiers were sent. Scratch scripts contained no `@` characters and no personal data.
