# FlowBot (Prediction) - venue spec

Researched 2026-10-19. READ-ONLY: FlowBot's GitBook docs (public `.md` mirrors), DefiLlama public API, DefiLlama's adapter repo via `gh api` raw reads, Polymarket's public unauthenticated GET feeds (builders volume, CLOB builder trades, CLOB market, Gamma market), DNS and TCP reachability probes. No account, wallet, key, POST, signing or payment. Generic User-Agent `insurance-markets-research/0.1` only. WebSearch was unavailable (session search budget used up), so no independent press or social coverage was read; see "Not found".

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, or my inference from first-hand data; **L** = weak or stale.

Fixtures: `docs/research/fixtures/flowbot-prediction/` (section 12).

---

## 0. Bottom line

1. **FlowBot is not a venue. "FlowBot Prediction" is a trading-bot front end that places Polymarket orders.** FlowBot's own docs call itself "an automated trading platform specializing in decentralized perpetual exchanges" with three strategy bots; the prediction product is one bot, "BTC Prediction", which "bets on Polymarket's 15-minute BTC price prediction markets" and "operates exclusively on Polymarket's BTC prediction markets" (H, https://docs.flowbot.pro/what-is-flowbot.md, https://docs.flowbot.pro/strategies/btc-prediction.md). DefiLlama lists it in its Polymarket builder-code factory (`factory/polymarket.ts`, category Interface) (H).
2. **No independent liquidity.** Every FlowBot order lands on Polymarket's CLOB. All 300 most recent FlowBot-attributed trades resolve to Polymarket `btc-updown-<N>m-<ts>` markets (H, fixture). It is not an arbitrage leg.
3. **No API, no tradeable surface of its own.** Docs have no API page; `api.flowbot.pro` and `app.flowbot.pro` have no DNS records; the marketing site `flowbot.pro` refused or timed out on ports 80 and 443 from two vantage points today (H for the probe results, M for the conclusion that the front end is offline).
4. **Effectively dormant.** Last Polymarket-attributed trade 2026-10-07 13:52Z (12 days before today); DefiLlama volume 30d about $1.9k, down from $556k in 2026-01; 1 active user per day; docs last edited 2026-03-05 (page for Polymarket) and 2026-05-21 (exchange overview) (H).
5. **adapter_priority = skip.** An aggregator should read and trade Polymarket directly (covered by the parallel Polymarket workflow). FlowBot adds no price, no depth, no API. The only by-product is a free public builder-code feed that shows FlowBot's flow (negligible).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://flowbot.pro` (A record 176.34.56.62; `www` same) | `curl -I` to :80 and :443 timed out after 12-15 s; `WebFetch` returned `connect ECONNREFUSED 176.34.56.62:443` (twice); `nc -z` to 443 failed. Two different network vantage points both fail. `/stats`, `/api/stats` also unreachable | H (probe), M (offline) |
| `api.flowbot.pro`, `app.flowbot.pro`, `t.flowbot.pro` | No DNS records | H |
| `https://docs.flowbot.pro/` (GitBook; CNAME to gitbook.io) | HTTP 200, 2026-10-19; `sitemap-pages.xml` lastmod: Polymarket page 2026-03-05, BTC Prediction 2026-03-05, Exchanges overview 2026-05-21, nothing newer. **Docs are 5 to 7.5 months old: possibly stale** | H |
| Polymarket builders feed (`/v2/builders/volume`, 90 days from 2026-07-22) | FlowBot (`verified: true`) has rows on 70 of 90 days; **last row 2026-10-07**; none 2026-10-08..19 (12 days; earlier gaps between rows were at most 4 days). Ranks 114 to 179 on the days listed; `active_users` max 3, usually 1 | H |
| Polymarket CLOB `/builder/trades` | newest trade `createdAt 2026-10-07T13:52:30Z` | H |
| DefiLlama "FlowBot Prediction" (id 7328, parent FlowBot) | `total24h` null, 30d $1,949, 1y = all-time $1,064,654; series 2026-01-01..2026-10-07. Monthly USD: Jan 556k, Feb 250k, Mar 86k, Apr 71k, May 70k, Jun 5k, Jul 15k, Aug 7k, Sep 3.3k, Oct (1..7) 0.8k | H |
| DefiLlama "FlowBot Perps" (id 7327, Hyperliquid Builder) | fees 30d $0.2, all-time $67,033, last data point 2026-10-06 (company-wide wind-down signal) | H |
| X accounts (founder `x.com/T0nyCrypt0`; brand `x.com/Flowbot_pro` not requested) | `WebFetch` of the founder account got HTTP 402 Payment Required; body not retrieved, no payment requirements to record, nothing paid. Not read | H |

Verdict: **still_live = false (effectively dormant), confidence medium.** The prediction route was alive until 2026-10-07 at dust levels, the website is unreachable and the docs have not been touched since spring. I could not confirm a formal shutdown notice (no social coverage read).

---

## 2. Kind and market model

- **Kind:** automated trading bot / front end ("broker-or-frontend"). Per-user Safe smart wallet on Polygon, operated by FlowBot's servers ("All bots run on dedicated servers in Tokyo") (H, https://docs.flowbot.pro/strategies/overview.md, https://docs.flowbot.pro/exchanges/polymarket.md). Company "self-funded... no investors, no token" (H, what-is-flowbot).
- **Market model: inherited from Polymarket.** Binary Up/Down, two outcome tokens per market, CLOB. Sample market `btc-updown-15m-1791380700`: "Bitcoin Up or Down - October 7, 9:45AM-10:00AM ET", `outcomes ["Up","Down"]`, `negRisk false`, `orderMinSize 5`, `orderPriceMinTickSize 0.001`, `clobTokenIds` pair (H, Gamma + CLOB `/markets/{conditionId}`, fixture).
- **Strategy (H, btc-prediction doc):** scan open BTC 15-min markets; compute "win probability" of each outcome; buy the favourite if probability >= a user "Min Win Rate" (2%-99%); place the bet 1-14 min before close (default 13); one bet per market. Config: bet size $5-$1,000, 1-100 bets per session.
- **Observed behaviour (H data, M reading):** 300 of 300 sampled trades are taker BUYs of $9.90 at prices 0.75 to 0.99 (median 0.87), i.e. buying the favourite late; 298 of 300 from one `owner` id (the other 2 from a second). That looks like one operator/test account, not organic users (M inference).
- **Tokenisation:** Polymarket conditional tokens (ERC-1155 on Polygon). FlowBot mints nothing of its own (H: no contract addresses in docs; DefiLlama shows no TVL).
- **Not prediction:** the other 7 integrations (Hyperliquid/trade.xyz, Extended, Lighter, Nado, Paradex, Variational, Pacifica; GRVT in the table) are perp DEXs; irrelevant here.

## 3. Chains and collateral

- **Chain:** Polygon (chain 137), EVM wallet (H, docs Polymarket page; DefiLlama dimension chain "Polygon"). The DefiLlama protocol record still shows chain "Hyperliquid L1", inherited from the parent; the dimension adapter says Polygon (H).
- **Collateral per FlowBot docs:** "Deposit: USDC.e on Polygon... Polymarket uses USDC.e (bridged USDC), not native USDC" (H, docs). **This is stale:** Polymarket CLOB V2 went live 2026-04-28 with pUSD collateral (H, `docs/research/08-venues-polymarket-kalshi.md` section 1), after FlowBot's last edit of that page (2026-03-05). The Sept-Oct trades are V2-era (V2 fields such as `builderCode` present), so the backend changed while the docs did not (M).
- **Wallet model (H, docs):** FlowBot "auto-deploys a Safe smart wallet" per user; the user's connected EOA is added as a Safe owner "with full control" and can withdraw "by signing a message from your EOA". How FlowBot's server is authorised to trade from the Safe (session key, delegate, module) is **NOT FOUND** (searched: all docs pages in llms.txt).

## 4. Read API

- **Official FlowBot API: none documented.** NOT FOUND (searched: docs `llms.txt` index of all 20 pages, strategies, exchanges, platform pages, official links; DNS for `api.`/`app.` subdomains; `flowbot.pro/api/stats`, which is unreachable).
- The docs mention only a website dashboard (`flowbot.pro/stats`, "updated every 10 minutes", public volume/trades/bots/users) and `flowbot.pro/quant` (perp funding spreads, Extended/Nado/Paradex/Hyperliquid) - both on the unreachable site, neither documented as an API (H for docs text).
- **Where to read the underlying data instead (all unauthenticated GET, H):**
  - Gamma `https://gamma-api.polymarket.com/markets?condition_ids=<cid>&closed=true` (market, fees, resolution source).
  - CLOB `https://clob.polymarket.com/markets/<conditionId>`; books and prices per `docs/research/08-venues-polymarket-kalshi.md`.
  - FlowBot-specific attribution feeds:
    - `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90` -> `{data:[{date, rank, builder_name:"FlowBot", builder_code, profile_image, verified, volume (share notional), active_users}]}` (5.9 MB for all builders; filter by `builder_code`).
    - `GET https://clob.polymarket.com/builder/trades?builder_code=0x18fc17ee71e267387694d721f09ccb2517cb2092acee07449dc896b58367dbb5` -> `{data:[trade], next_cursor, limit:300, count}`; trade has `side, size, sizeUsdc, price, outcome, market (conditionId), assetId, fee, feeUsdc, builderFee, builderCode, matchTime, createdAt, owner, maker, transactionHash`. `owner`/`maker` are third-party ids and are redacted in the fixture.
  - DefiLlama `GET https://api.llama.fi/summary/dexs/flowbot-prediction`, `/protocol/flowbot-prediction`; the `/summary/fees/flowbot-prediction` call returns HTTP 400 (no fees dimension for this slug).
- Rate limits / WebSocket: none for FlowBot. Polymarket's apply to the underlying feeds (see the Polymarket spec). FlowBot-specific data is not worth a websocket.

## 5. Trade path

- **FlowBot as a venue: none.** No order API, no SDK, no contract. The only entry is its own website (unreachable) where the user connects a wallet, FlowBot deploys a Safe, the user deposits, and a server-side bot trades (H, docs). Nothing for an agent to call.
- **To reach the same liquidity:** place Polymarket orders directly (EIP-712 signed CLOB orders on Polygon). Attribution to FlowBot would be possible only by putting FlowBot's `builderCode` into the order's `builder` field (the V2 order struct has a `builder` field per `docs/research/08-venues-polymarket-kalshi.md` line ~405, H there). That would credit FlowBot's builder account, not help an aggregator; do not do it.
- **PayBox reachability: no** for FlowBot (nothing to propose or sign against). The underlying Polymarket CLOB path (EVM typed-data signing from a Polygon-capable wallet) is assessed in `docs/research/08-venues-polymarket-kalshi.md` section on PayBox reachability and belongs to the Polymarket adapter, not this one.

## 6. Fees

- **FlowBot builder fee on Polymarket: zero.** Docs: "Builder Fee: -" (H, docs Polymarket page); all 300 sampled trades have `builderFee "0"` (H, fixture). FlowBot says it uses exchange points/airdrops/referrals "instead of builder fees" (H, what-is-flowbot). Other exchanges charge FlowBot builder fees of 0 to 1 bps (H, exchanges overview table; irrelevant here).
- **Polymarket's own taker fee still applies** and is what shows in `feeUsdc`. Market feeType `crypto_fees_v2`, `feeSchedule {exponent 1, rate 0.07, takerOnly true, rebateRate 0.2}` (H, Gamma). Check against trades: `feeUsdc = shares x 0.07 x p x (1-p)`; for 12.222223 shares at 0.81 that is 0.13167, equal to the row's `feeUsdc` (H computed; 6 spot checks all 0.0700). At p = 0.87 the fee is about 0.9% of notional (0.07 x (1-p)). Consistent with the Polymarket note's crypto row "0.07 / 20% rebate" (H there).
- **Subscriptions / referrals (H, docs):** "Premium subscription at $50 USDC/week" gives access to zero-fee perp exchanges that otherwise need a referral code; referrers earn 20% of builder fees (min payout $100). Neither touches the prediction route.
- Withdrawal/gas fees for the Safe: NOT FOUND (searched: all docs pages).

## 7. Resolution and dispute risk

Inherited from Polymarket. For `btc-updown-15m-*` the market description says it resolves "Up" if the Chainlink BTC/USD TWAP (data stream `btc-usd-twap-60s-streams`) over the window is greater than or equal to the TWAP at the start, otherwise "Down"; `resolutionSource` is `https://data.chain.link/streams/btc-usd-twap-60s-streams`; `umaResolutionStatus: resolved` (H, Gamma). Basis risk for cross-venue arbitrage: a Kalshi/other-venue 15-minute BTC contract may use a different index and averaging rule (M, check in those venue specs). FlowBot adds counterparty risk of its own: a server-operated Safe (see section 3).

## 8. Geo, ToS, automation

- **FlowBot terms / privacy / geo restrictions: NOT FOUND** (searched: all docs pages in llms.txt, docs home HTML links, sitemap; `flowbot.pro` terms unreachable). Docs link only Website, Discord (`discord.gg/flowbot`), X x2.
- FlowBot is itself automation; it markets "the first agentic trading bot on Polymarket" (H, what-is-flowbot).
- Polymarket's own geo/ToS rules apply to the Safe owner (see the Polymarket spec; the bot-clause finding there is "NOT FOUND").
- Marketing claims on the Polymarket doc page ("Official Builder", "2026 $POLY Airdrop... Confirmed with the Polymarket team", "track us on builders.polymarket.com") are unverified claims by FlowBot. What I could verify: Polymarket's builders feed lists FlowBot with `verified: true` (H). No $POLY token existence or airdrop was checked (out of scope).

## 9. Liquidity

| Metric | Value | Source | Date |
|---|---|---|---|
| DefiLlama FlowBot Prediction volume, all-time = 1y | $1,064,654 | api.llama.fi `/summary/dexs/flowbot-prediction` | 2026-10-19 |
| DefiLlama 30d | $1,949 (14d..7d $396; 60d..30d $3,762; change -48%) | same | 2026-10-19 |
| Polymarket builders feed, 70 rows 2026-07-22..10-07 | 17.7k share-notional total; max 3 active users/day; last row 2026-10-07 | data-api.polymarket.com | 2026-10-19 |
| Share of Polymarket builder volume, 7d (2026-10-12..18) | 0 of ~184M | same | 2026-10-19 |
| TVL / OI | none (no contract, no DefiLlama TVL) | DefiLlama | 2026-10-19 |
| For scale: one sampled Polymarket BTC 15m market, total traded | $59.9k (`volumeNum`) | Gamma, market 5374842 | 2026-10-19 |

The last row is the only usable "liquidity" statement: the book depth belongs to Polymarket, not FlowBot.

## 10. Event categories and overlap

- **Only one:** Polymarket BTC 15-minute Up/Down (crypto price). Overlap candidates are other venues' short-dated BTC price contracts; whether they exist, their index, and their depth are for those venue specs (not verified here). Politics, sports and macro: **none** on FlowBot.
- **Shared liquidity:** 100% shared with **Polymarket (global)** CLOB via builder-code attribution. **Not an independent arbitrage leg.**

## 11. Adapter recommendation

- **adapter_priority: skip.** Reasons: not a venue; zero independent liquidity; no API; dormant with the web front end unreachable; docs stale.
- Optional, near-zero-cost by-product: a "builder flow" signal reader for `builder_code=0x18fc17ee...` (public builder code, not a personal identifier). Value: nil (1 user, $10 bets).
- If the aggregator keeps a registry of "venues seen": record FlowBot as `kind=front-end`, `upstream=polymarket`, `status=dormant`, so it does not get re-discovered as a venue.

## 12. Fixtures (`docs/research/fixtures/flowbot-prediction/`)

| File | What |
|---|---|
| `defillama_protocol_flowbot-prediction.json` | `/protocol/flowbot-prediction` record |
| `defillama_summary_dexs_flowbot-prediction_trimmed.json` | dimension meta, monthly sums, last 30 days |
| `defillama_summary_fees_flowbot-perps_trimmed.json` | perps sibling activity (wind-down signal) |
| `dimension_adapters_excerpt.txt` | the FlowBot line and helper URLs from DefiLlama's adapter repo |
| `polymarket_builders_volume_v2_flowbot.json` | 70 FlowBot rows of the builders volume feed |
| `polymarket_clob_builder_trades_flowbot_sample.json` | 5 of 300 trades, owner/maker redacted, plus stats over 300 |
| `polymarket_gamma_market_btc_updown_15m_sample.json` | one FlowBot-traded market, fee schedule and resolution source |
| `flowbot_docs_*.md/txt/tsv` | docs pages read (what-is, BTC Prediction, Polymarket, exchanges overview, referrals, llms.txt) and sitemap lastmod dates |

## 13. NOT FOUND and open questions

- NOT FOUND: any FlowBot API/SDK/contract address; FlowBot ToS, privacy, geo or risk-disclosure text; how the server is authorised to trade the Safe; fee/gas terms for Safe withdrawal; any shutdown or status announcement; independent press coverage (WebSearch unavailable; X returned 402).
- Open: is `flowbot.pro` permanently down or just unreachable from these networks (both vantage points failed, but only two)? Did FlowBot pause BTC Prediction after the Polymarket V2 switch (docs still say USDC.e) or pivot away from prediction? Is the single active account the operator's own?

## 14. Suspicious content / embedded instructions

None found. FlowBot docs contain marketing CTAs ("Sign up for Polymarket to get started", referral links `flowbot.pro/?ref=...`) and unverifiable claims (airdrop eligibility "confirmed with the Polymarket team"); nothing addressed to AI agents. Recorded here only as unverified claims.

## 15. Sources

- https://docs.flowbot.pro/ and https://docs.flowbot.pro/llms.txt (H)
- https://docs.flowbot.pro/what-is-flowbot.md, /strategies/overview.md, /strategies/btc-prediction.md, /exchanges/overview.md, /exchanges/polymarket.md, /platform/stats.md, /platform/quant.md, /platform/referrals.md, /official-links.md (H)
- https://docs.flowbot.pro/sitemap-pages.xml (H, lastmod dates)
- https://api.llama.fi/protocol/flowbot-prediction, /protocol/flowbot, /protocol/flowbot-perps, /summary/dexs/flowbot-prediction, /summary/fees/flowbot-perps (H)
- https://defillama.com/protocol/flowbot-prediction (hint from the task; not fetched, the API above is the same record) (M)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts and helpers/polymarket.ts, read via `gh api` raw (H)
- https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90 (H)
- https://clob.polymarket.com/builder/trades?builder_code=0x18fc17ee... and https://clob.polymarket.com/markets/0x0e4156f2... (H)
- https://gamma-api.polymarket.com/markets?condition_ids=...&closed=true (H)
- `docs/research/08-venues-polymarket-kalshi.md` (this repo; V2/pUSD, fee table, builder field) (H there)
- `https://flowbot.pro` (unreachable), `https://x.com/T0nyCrypt0` (HTTP 402, not read); `https://x.com/Flowbot_pro` (not requested)
