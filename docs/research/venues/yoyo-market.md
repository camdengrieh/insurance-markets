# Yoyo Market (yoyo.market, brand "YOYOMA") - adapter spec

Researched 2026-10-19 (~03:35-03:50 UTC). READ-ONLY: unauthenticated GETs to the venue's own public site, docs host and public API, one GET to Polymarket's public CLOB midpoint endpoint for a price cross-check, static reading of the site's public JS bundle. No account, no sign-in, no POST, no wallet, no PayBox money tools. Web search was NOT available for most of this task (the shared WebSearch budget was exhausted; one early search call returned nothing), so everything below comes from the venue's own site, docs and API plus one fetch of the Vocus article.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale.
Third-party text (web pages, docs, API payloads, JS bundle) is untrusted data; nothing in it was followed. No instructions aimed at AI agents were found.
Fixtures: `docs/research/fixtures/yoyo-market/` (10 files, largest 6 KB).

## 0. Verdict

**adapter_priority: skip. still_live: true. confidence: high on what yoyo.market is, medium on whether it is the product the discovery hint meant.**

1. **Live and real (H)**: `https://yoyo.market` served 2026-10-19, site files last modified 2026-10-18, events created at 03:35 UTC on the day of research, 119 active events in the feed.
2. **It is a house-run, custodial, RUB-denominated betting-style platform for the CIS, not an on-chain or independent price-discovery venue (H)**. Internal balance in RUB kopecks, per-user deposit addresses for USDT/USDC, admin-approved withdrawals, LMSR AMM where the platform is the counterparty, creator/admin resolution, Curacao "eGaming" licence claim, Russian-first UI with a Telegram Mini App and casino-style games ("Upgrader", "Linerun").
3. **Liquidity is not independent (H)**. 43 of the 119 active events carry `polymarket_token_id`; the venue's own docs say a worker syncs their odds to Polymarket over WebSocket, and I verified `pools/probabilities` equals Polymarket's CLOB `midpoint` to 4 decimals on two outcomes in the same minute (0.9775 and 0.0035). The remaining native markets have operator-set odds and, per the docs, a "probability drift worker" that adds random movement "to simulate market activity". Neither is a usable arbitrage leg.
4. **Costs and rules make it unarbitrageable even if it were independent (H)**: 3% fee each way (live `fee_bps` 300 on 105 of 109 pools) plus an undocumented "early sell haircut" of up to 35% (`early_sell_haircut_bps` 3500; a live 10,000-share sell preview paid 6,544 against a 9,775 mid), Terms section 10.1 bans bots/automation, section 7.3-7.4 lets the operator annul trades and adjust quotes, withdrawals need admin approval.
5. **Identity caveat (M)**: the Vocus article describes a different-sounding product (US startup, Asian team, CFTC application, no politics or military topics, "swipe to trade"). yoyo.market carries politics, war and conflict tags, targets Russia and the CIS, and cites a Curacao licence. The article gives no URL, so the link between the two is the discovery agent's guess and looks wrong. Section 9 has the detail. Re-check once web search is available.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://yoyo.market/` | HTTP 200, nginx, `last-modified: Sun, 18 Oct 2026 09:31:34 GMT`, `date: Mon, 19 Oct 2026 03:38 GMT`. Title "Yoyo Market - рынок прогнозов", `lang=ru`, SPA (Vite/React), service worker, Telegram Mini App loader. | H |
| `sitemap.xml` | 7 static routes, `lastmod 2026-10-18T09:31Z`: `/`, `/sports`, `/about`, `/terms`, `/search`, `/games`, `/games/upgrader`. | H |
| `sitemap-events.xml` (served by the backend) | 285 event URLs, `lastmod` up to 2026-10-18T01:48Z, highest id 301694. | H |
| `GET /api/v1/events/feed` | 119 active events, 148 markets; newest loop-event markets created 2026-10-19T03:35:04Z. | H |
| About page history (own claim) | MVP 2024 Q1, LMSR + sports 2024 Q3, 10,000+ users in 2025, "largest prediction market in the CIS" in 2026. Marketing claims, not verified. | L |
| Operator identity | NOT FOUND. Terms section 13 says "the jurisdiction where the Platform operator is registered" without naming it. Docs footer: "Curacao eGaming, License #365/JAZ" (unverified; I did not check the Curacao register). | M |
| Related domains | `yoyoma.io` 301 to `yoyo.market` (H). JSON-LD lists `t.me/yoyomrt`, `t.me/yoyomarket_ru`, `t.me/yoyoex_en`, `instagram.com/yoyoma.io`, `x.com/yoyomarket_` (H; not fetched). | H |

## 2. What it is

- **Kind**: custodial off-chain prediction/betting platform. The Terms call it "YOYOMA", say it "is not a bookmaker, gambling operator, betting operator, or casino" (section 1.3), and in the same breath refer to "bets" and "odds" (sections 7.3, 7.4). The docs call it a prediction market where users trade YES/NO tokens. The front page also sells casino-style "games". **H** (Terms bundle `assets/TermsPage-BFJsAfAK.js`, docs overview).
- **Market model**: binary YES/NO markets grouped in pools inside events. A multi-outcome event is several binary markets in one pool (`independent_outcomes:false`, only one wins; `pool.won_side` index). Two `market_type` values exist: `lmsr` (every market in the live feed: 130 of 130 sampled) and `orderbook` (documented; the sampled orderbook endpoint returned empty `bids`/`asks`). Docs describe a hybrid where unfilled limit-order remainder routes to the AMM. **H** (live feed + docs `concepts/markets`, `concepts/lmsr-amm`).
- **Tokenisation**: none on-chain. Positions are rows in the operator's ledger; shares are integers ("share cents", 100 = 1 share). **H**
- **LMSR**: `C(q)=b*ln(sum e^(q_i/b))`, `b` per market in kopecks (loop markets b=5,000,000 = RUB 50,000; the largest sampled markets b=500,000,000 = RUB 5M). Price = `e^(q_yes/b)/(e^(q_yes/b)+e^(q_no/b))`, which I recomputed from `q_yes`/`q_no` for the BTC loop market and matched `yes_probability`. **H**
- **Loop events** (the short crypto up/down markets): BTC, ETH, SOL "Up or Down" re-created every 5 minutes (`loop_interval_minutes:5`, pinned to 2030). Price source for resolution is Bybit per the docs (`market-data/asset-prices`). **H**
- **Event categories (active feed, tag counts)**: russia 41, media 41, politics 38, social 28, finance 18, culture 16, usa 12, entertainment 12, gaming 10, conflicts 9, crypto 9, sport 7, war/svo/ukraine/iran/middleeast tags, esports. League counters (`/leagues/active-counts`): ATP 62, CSGO 33, UFC 22, WTA 15, Dota2 12, LoL 9, UCL 8. **H**
- **Event creation**: users with an `is_creator` flag create events and resolve them (`/events/create-full`, `/events/{id}/pools/{pool_id}/close`). Creators can import Polymarket outcomes by URL (`/creators/polymarket-outcomes`) and pass `polymarket_token_ids` so odds sync. **H** (docs `event-creation/*`, `api/creators/polymarket-outcomes`)

## 3. Chains and collateral

- **No on-chain market, no smart contracts, no chain for trading (H)**. Trading collateral is an internal RUB balance in kopecks (`10000 = 100.00 RUB`). Prices are integers 0-10000 in docs but floats 0-1 in the live `yes_probability`.
- **Funding rails (H, docs `deposits/*` and wallet bundle)**: per-user custodial deposit addresses (generated at account creation, "private keys for crypto wallets are encrypted at rest" per docs `advanced/security`). Docs list Tron (USDT), BSC, Polygon, Ethereum, Avalanche (USDT/USDC). The shipped wallet dialog also lists Solana and TON. Credited at the platform's own USD/RUB rate (`GET /currency/rate?currency=USD&type=deposit` returned 82.78 RUB per USD, 2026-10-19). Card/SBP (RUB) and P2P USDT-RUB exchange also exist.
- **Withdrawals**: USDT/USDC to any listed network, "administrator reviews and approves", max 3 per day, one pending at a time, 0.3% fee (Tron: flat 1 USDT, min $2), withdrawal needs total deposits of at least 1,000 RUB and a 1,200 RUB turnover if a cashback bonus was taken. **H**

## 4. Read API

**Official docs exist: `https://docs.yoyo.market` (Docusaurus, H).** Sections: Getting Started, Core Concepts, Trading, Market Data, Deposits, Event Creation, Advanced, FAQ, and an API Reference (`/api/overview`, 116 endpoint pages in the docs sitemap). The docs are partly a copy of a sibling brand's template: several pages say "InTots" and use `api.intots.com` (does not resolve) and example ids like `mkt_001`, which do not match the live API (H).

- **Base URL (H)**: `https://yoyo.market/api/v1/`. WebSocket: `wss://yoyo.market/api/v1/ws/...`. B2B partner API: `https://api.yoyo.market` (docs say "confirm the host"; DNS for `api.yoyo.market` returned nothing from my resolver, so treat as unverified).
- **Public endpoints I called without auth (all HTTP 200, H)**, fixtures saved:

| Endpoint | What it returns | Fixture |
|---|---|---|
| `GET /events/feed?limit=N&last_id=ID&tag=&sort=volume24h&closed=1&is_live=true` | `{events:[{event, main_pool, markets[], total_volume}], next_cursor, has_more}`; `total_volume` is cumulative kopecks across pools | `events_feed_limit3.json` |
| `GET /events/{id}` | full event with `pools[].markets[]`, `market_context` (machine-written blurb), `status`, `tags`, `creator_id` | `event_232954_polymarket_mirror.json` |
| `GET /events/featured?limit=7`, `GET /search_events?q=&limit=<=20&category=&status=&type=` | same shape as feed (featured called, search not called) | - |
| `GET /markets?pool_id=ID` | array of markets: `yes_probability`, `volume`, `b`, `q_yes`, `q_no`, `outcome_index`, `resolved`, `winning_outcome`, `polymarket_token_id`, `yes_probability_change` | `markets_by_pool_240732.json` |
| `GET /market/orderbook/{market_id}` | for LMSR markets: `price_yes`, `price_no`, `sell_price_yes`, `sell_price_no`, `fee_bps`, `sell_fee_bps`, `early_sell_haircut_bps`, `polymarket_priced`, empty `bids`/`asks` | `market_orderbook_302534.json` |
| `GET /lmsr/preview?market_id=&side=buy_yes\|sell_yes\|buy_no\|sell_no&amount_type=spend\|shares&amount=` | `{cost_or_payout, shares_delta, fee_bps, early_sell_haircut_bps}`; computes a quote with no side effect | `lmsr_preview_buy_yes_302534.json`, `lmsr_preview_sell_yes_302534.json` |
| `GET /pools/probabilities?ids=` | `{pools:{id:{market_ids[], probabilities[]}}}` | `pools_probabilities_240732.json` |
| `GET /leagues/active-counts`, `GET /currency/rate`, `GET /version` | counters, RUB rate, build info (`dev`) | `leagues_active_counts.json`, `currency_rate_usd_deposit.json` |

- **Not called**: charts (`/markets/{id}/chart`, `/pools/{id}/charts`), `/events/{id}/loop-history`, WebSocket feeds (`/ws/trades`, `/ws/events/{event_id}/chart`, `/ws/assets/{symbol}/price`; docs say no auth, 10,000 connections per hub, 50 s ping). Per docs the trade feed shows only amount, nickname, token, event, market, avatar; there is no per-market public trade history with prices (NOT FOUND in docs or bundle).
- **Resolution data**: `resolved`, `winning_outcome` on markets, `won_side` on pools, event `status` new/started/paid. **H**
- **Docs vs live mismatches (H)**: docs paginate with `cursor`; the live API ignores `cursor` (eight calls returned the same first page) and paginates with `last_id=<next_cursor>` (found in the shipped bundle, confirmed: page 2 returned the remaining 19 events, `has_more:false`). Docs say prices are 0-10000 integers; live market objects use floats 0-1. Docs show a 2% fee example; live pools report 300 bps. The early-sell haircut is not in the docs.
- **Auth and limits (H, docs `advanced/rate-limiting`, `api/authentication`)**: reads are public. Per IP and normalised path, per minute: feed/events/pools 120, search 60, `/lmsr/preview` 60, `/lmsr/trade` 30, `/market/orders` 30, `/currency/rate` 120, `/ws/trades` 480, unknown paths 30. Headers `X-RateLimit-Limit/Remaining/Reset` (reset in ms), `Retry-After` on 429. Behind Cloudflare (`CF-Connecting-IP`). Observed `x-ratelimit-limit: 120` on the feed. No API keys for the public product; account auth is JWT in HTTP-only cookies (`access_token` 20 min, `refresh_token` 72 h) or `Authorization: Bearer`.
- **Volume units**: all money is integer kopecks (RUB). USD conversion in this note uses the venue's own 82.78 RUB/USD.

## 5. Trade path

- **Programmatic placement exists but only through a custodial account (H, docs)**: `POST /api/v1/lmsr/trade {market_id, side, amount_type, amount, use_bonus}` and `POST /api/v1/market/orders {market_id, type, kind, token_type, amount, amount_type}`, `DELETE /market/orders/{id}`, `POST /market/positions/{market_id}/close`. Auth is email+password (`/auth/sign-up` needs email verification), OAuth (Google, GitHub, VK, Yandex), or Telegram Mini App `initData`. No wallet signatures, no EIP-712, no order signing. I did not create an account or call any of these.
- **B2B partner API (H, docs `api/partner/overview`)**: casino/bookmaker partners fund a "float", get an `X-Partner-Key` from a "B2B bot", and place bets for their own users (`POST /api/v1/partner/bets`, `/partner/sell`). Partner onboarding requires registration with the operator; not an option for an arbitrage bot.
- **Automation is prohibited**: Terms section 10.1 bans "bots, automation, or other technical means to gain an advantage", multi-accounting, collusion, and "exploiting errors ... including incorrect odds or prices". Section 10.2: account blocked and funds withheld "without prior notice". **H** (Terms bundle, English block).

## 6. PayBox reachability

**paybox_reachable: no (funding only).** There are no transaction proposals or signed orders that trade this venue. The most a PayBox EVM wallet could do is an ERC-20 transfer of USDT/USDC on BSC, Polygon, Ethereum or Avalanche to the per-user custodial deposit address of an account somebody has registered by email or Telegram, after which every trade is an off-chain call using that account's session, against Terms that forbid automation. Withdrawal is manual-approval, so capital is trapped behind an operator decision. Solana or Base are not listed in the docs (the app UI lists Solana and TON for deposits; Base not found). **H/M**

## 7. Fees

All **H** unless stated (docs `trading/fees-and-commissions`, live API).

| Item | Value |
|---|---|
| Trade fee, buy | `cost = price*(1+fee%)`, charged to the buyer on top. Live `lmsr_fee_bps` per pool across the 109 feed events that expose a `main_pool`: 300 (3%) on 105, 400 on 1, 500 on 2, 600 on 1, so the fee is per pool, not only global. Docs say the rate is the global setting `lmsr.FeePercent` and show a 2% example. |
| Trade fee, sell | `payout = price*(1-fee%)`. |
| Early-sell haircut | Live `early_sell_haircut_bps: 3500` and `sell_fee_bps/fee_bps: 3305` on a sell of the GTA VI "November 30, 2026" market (its pool had no `finish_at`). Sell preview: 10,000 shares paid 6,544 against a 9,775 mid. How 3305 is composed from 300 and 3500 is NOT FOUND (undocumented, likely time-dependent). Terms 7.4: operator may "restrict or disable the premature sale of positions". |
| Effective cost of a near-certain buy | Buy preview: spend 10,000, receive 9,932 shares of a market priced 0.9775, i.e. 1.0068 paid per 1.00 payout (negative edge even if you are right). |
| Referral split of fees | L1 15%, L2 4%, L3 1%, platform 80%. |
| Deposits | Crypto 0%; card fee shown in the app (percentage not captured; NOT FOUND); P2P is peer-priced. |
| Withdrawals | 0.3% (Tron flat 1 USDT), min $1 ($2 Tron). |
| Bonuses | Sign-up and cashback bonuses carry deposit and turnover conditions on withdrawal (docs). Bonus-funded AMM trades blocked within 2 h of sport start. |

## 8. Resolution and dispute risk

- **Mechanism (H)**: the event creator or an admin closes a market, pool or event by setting the winning index; settlement is automatic (winner 10,000 per share, loser 0). Cancellation refunds cost. Loop crypto events are closed by a worker that compares the Bybit price with the cycle's `asset_base_price`. Sources "specified in the prediction pool rules" (Terms 7.1) are not machine-readable beyond `market_context` text; mirrored events copy Polymarket's rules text (`rules` in `/creators/polymarket-outcomes`).
- **Dispute risk is high**: no dispute process, no oracle, no on-chain evidence. Terms 7.2: if the outcome is unclear the operator may cancel, refund, or "apply an alternative calculation method". 7.3-7.4: operator can annul results after technical errors and adjust quotes, "final". Resolution can differ from Polymarket's UMA outcome on a mirrored market, so a cross-venue hedge carries basis risk. **H/M**
- **Price integrity risk (H, docs `concepts/markets`)**: the hidden `base_yes_probability` plus a drift worker "introduces small random movements to simulate market activity". Odds can also be set by hand (`PUT /events/{id}/pools/{pool_id}/probabilities`).

## 9. Geo, ToS, identity

- **Geo**: no country block list or restricted-jurisdiction text found in Terms, docs or FAQ (NOT FOUND, searched: Terms bundle, docs FAQ/security/overview). Product is Russian-first (RUB, SBP, Yandex/VK login, Telegram Mini App); Terms 1.3 references Russian Federation law. US availability: NOT FOUND. Age 18+. **H**
- **Licence**: Curacao eGaming "#365/JAZ" in the docs footer; unverified; a Curacao sublicence number does not make it a CFTC- or MiFID-regulated venue. **M**
- **Vocus mismatch (M)**: Vocus (a promotional listicle; the page gives no date, author or URL for yoyo market) says "yoyo market" is a US startup run by an Asian team, funded by a Meitu co-founder's fund, applying for a CFTC licence, with no election, politics or military markets and a 5-second "swipe to trade" UI. yoyo.market shows none of that: politics/conflict markets are among its largest, there is no swipe UI text in the bundle, and it cites Curacao. Two different products sharing a name is likelier than one product with two stories. Product behind the Vocus article: **unidentified**.

## 10. Liquidity (all self-reported by the venue's API, 2026-10-19, kopecks converted at 82.78 RUB/USD)

| Metric | Value | Tag |
|---|---|---|
| Active events / markets in the default feed | 119 / 148 | H |
| Sum of cumulative `total_volume` over those 119 events | 4,307,721,329 kopecks = RUB 43.08M = about USD 520k (lifetime volume of events still open, not 24h) | H (unaudited) |
| Largest single events | Telegram unblock in Russia about USD 23.7k; a Russian blogger police-report market about USD 22.8k; Zhurik vs Milokhin fight about USD 19.8k; GTA VI release dates about USD 18.6k (sum of two markets) | H |
| BTC 5-minute up/down, one cycle at 03:39 UTC | cumulative 23.26M kopecks (about USD 2.8k) four minutes after creation; unusually high, could include operator-seeded or bot flow; unverifiable | L |
| Depth (`b`) | 5M kopecks on loop markets, up to 500M on the largest; max AMM loss per binary market is `b*ln2` (RUB 3.47M for b=500M), borne by the operator | H (computed) |
| TVL / OI | NOT FOUND (no endpoint). No independent source (no DefiLlama entry checked this session because search was unavailable). | - |

## 11. Overlap and independence (the arbitrage view)

- **Polymarket mirror (H)**: 43 events / 72 markets have `polymarket_token_id` (e.g. "GTA VI released by...?", "US confirm aliens exist by...?", "Reza Pahlavi enter Iran by...?", "NATO x Russia military clash by...?"). Prices are slaved to Polymarket's midpoint, so Yoyo = Polymarket price + 3% fee + haircut. **Not an independent leg; do not count its liquidity.**
- **Crypto up/down loops (BTC/ETH/SOL, 5-minute)**: overlap in concept with Polymarket's short-horizon crypto markets, but different reference price (Bybit vs Polymarket's own source), the operator's LMSR is skewed by flow (BTC loop at `yes_probability` 0.015 vs the `market_probabilities` metadata 0.655), 3% fee, 30 orders per minute cap, no automation allowed. Not tradeable at scale. **H/M**
- **Sports**: ATP 62, CSGO 33, UFC 22 counters, but `volume` is small and odds are operator-managed. Overlap with sportsbooks and Polymarket sports exists in principle; no usable edge after fees. **M**
- **Native Russian/CIS events** (Telegram ban, celebrity and blogger events, Wildberries bankruptcy): little or no overlap with other venues. A possible CIS-retail sentiment signal, but odds are admin-set with a random drift worker, so signal quality is doubtful. **M**
- **Shares liquidity with**: Polymarket (price-only, not pooled liquidity) for the mirrored subset; sibling white-label brand "InTots" appears only in docs text (api host does not resolve). No evidence of a shared pool with another live venue. **H/M**

## 12. Integration notes (if ever wanted as a signal only)

- A read-only poller needs only `GET /events/feed?limit=100&last_id=...` (about 2 calls for the whole book), `GET /pools/probabilities?ids=` and `GET /lmsr/preview`. Respect 120/min. Normalise kopecks to RUB, then to USD at `/currency/rate`. Use `polymarket_token_id` to drop mirrored markets (they add nothing over Polymarket itself) and keep `polymarket_priced:false` native markets only if a CIS signal is wanted.
- Do not build a trade adapter: no non-custodial path, Terms prohibit it, odds are not market-derived, exit costs up to about 36% on a sell.

## 13. NOT FOUND

- Operator legal entity, company registration, real jurisdiction (searched: Terms, About, docs footer, JSON-LD).
- Geo-block list or US policy (searched: Terms, FAQ, security).
- Independent volume/TVL data (search unavailable this session).
- Formula for `sell_fee_bps` 3305 / early-sell haircut schedule (searched: docs trading and AMM pages, live API).
- Card deposit fee percentage and P2P spreads.
- Public per-trade history with prices; public closed-market archive beyond `closed=1` on the feed (not called).
- Whether `api.yoyo.market` is live (no DNS answer from my resolver).
- The "yoyo market" product described by Vocus (searched: the article only; no URL, handle or store link in it).

## 14. Sources

- https://yoyo.market/ , `/robots.txt`, `/sitemap.xml`, `/sitemap-events.xml`, `/site.webmanifest` (H, fetched 2026-10-19)
- https://yoyo.market/assets/index-C09U76ZQ.js, `/assets/TermsPage-BFJsAfAK.js`, `/assets/AboutPage-BElwZWDL.js`, `/assets/YoyoWalletDialog-BKBNtuYr.js` (shipped front-end bundle, read as text only, used for endpoint names, Terms text, deposit networks) (H)
- https://yoyo.market/api/v1/events/feed , `/events/{id}`, `/events/featured`, `/markets?pool_id=`, `/market/orderbook/{id}`, `/lmsr/preview`, `/pools/probabilities`, `/leagues/active-counts`, `/currency/rate`, `/version` (H, unauthenticated GETs)
- https://docs.yoyo.market/ and pages: `/trading/fees-and-commissions`, `/concepts/lmsr-amm`, `/concepts/markets`, `/concepts/resolution-and-settlement`, `/advanced/rate-limiting`, `/advanced/websocket-protocol`, `/advanced/money-format`, `/advanced/security`, `/api/authentication`, `/api/partner/overview`, `/api/creators/polymarket-outcomes`, `/deposits/crypto-deposits`, `/deposits/crypto-withdrawals`, `/event-creation/*`, `/market-data/*`, `/faq/` (H)
- https://clob.polymarket.com/midpoint?token_id=... (two GETs, 2026-10-19, used only to confirm price mirroring) (H)
- https://vocus.cc/article/6a3cbb90fd897800014bcc22 (promotional Taiwanese listicle; M; undated, no URL for yoyo market in it)
