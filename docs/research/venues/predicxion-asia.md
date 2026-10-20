# PredicXion (Asia) - venue adapter spec

Researched 2026-10-19. Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "NOT FOUND (searched: ...)" means I looked and found nothing, not that it does not exist. Third-party pages, the venue's JS and API responses were treated as untrusted data; no instructions aimed at AI agents were found.

**Verdict: skip (adapter_priority = skip).** "PredicXion" is a company/brand, not one venue. The only live trading surface that I could tie to it with primary evidence is **K25.ai**, a custodial, KYC-gated "watch-to-predict" app whose tradeable markets are **mirrors of Polymarket** (quotes literally equal Polymarket's top of book, `provider_id: "polymarket"`). It therefore shares liquidity with Polymarket and is not an independent arbitrage leg, its own volume is about $3.5K lifetime across 39 listed markets, there is no documented API or order-signing path, the Terms ban bots, and it is geo-restricted. The original June-2025 product at predicxion.io now 301-redirects to **NovaMarkets** (novamarkets.space), a custodial web app with zodiac "lottery-style" games and no documented read API (its public reads are POST-only, which I did not call). Neither is worth an adapter. Re-check in a quarter only if K25's own (non-mirror) stream markets ever get volume.

## 1. Is it still live? What is "PredicXion"? (H unless noted)

- **Origin (H):** PR Newswire release dated **2025-06-26** (Tokyo dateline; over 15 months old, so possibly stale): "PredicXion Launches Asia's First Creator-Led, AI-Powered Prediction Market" - "AI-powered, blockchain-based", "stables-backed forecasting", creator-launched markets, AI event sourcing, gamified formats (Alpha Arena, Prediction Cup, Hype Hunter), loss coverage, airdrops, yield-farming prediction pools. Website named: `predicxion.io`. No chain, token, regulator or investors named. Led by Andy Cheung (ex-COO OKEx/OKX).
- **Cointelegraph (H, article dated 2026-04-04):** "Prediction markets originating from the region, such as PredicXion, are attempting to localize content"; "newer entrants like PredicXion are focusing on local events"; founder/CEO Andy Cheung calls local gambling rules a "significant concern" and says platforms like it try to avoid "heavily restricted markets". The article links no website, only an X post (x.com/PredicXion). No regulator, volume or user numbers. This is the source of the discovery hint; it adds nothing technical.
- **predicxion.io is now a redirect (H):** `curl` 2026-10-19: `https://predicxion.io/` and `https://www.predicxion.io/` -> `301 https://www.novamarkets.space:443/` (server `awselb/2.0`).
- **NovaMarkets is the rebrand of that product (H):** the novamarkets.space page source still carries i18n keys `"About PredicXion":"About NovaMarkets"`, `"Welcome to PredicXion":"Welcome to NovaMarkets"`, referral text "earn USDT and PDX rewards", and its API namespace is `/pdx/...` (PDX = PredicXion token/abbreviation). Nova's own docs and terms never mention PredicXion (H, gitbook pages read). Who currently operates NovaMarkets, and whether it is still the same company, is NOT established (see section 14).
- **K25.ai is PredicXion's current platform (H):** NewGenIvf Group Ltd (Nasdaq: NIVF) Form 6-K filed 2026-05-21 (accession 0001213900-26-059849): "strategic investment agreement" with **PredicXion Group Limited** (British Virgin Islands, reg. no. 2199437, registered at Aegis Chambers, Road Town, Tortola), business described as "AI-powered prediction market platform (branded as K25.ai)". Exhibit 99.1 press release: K25.ai is an "APAC-focused, AI-powered live-streaming and watch-to-predict platform" led by Andy Cheung; initial investment US$2M at US$100M pre-money, option up to US$10M; target markets Thailand, Singapore, Japan; excluded: US persons, Mainland China, Hong Kong, Macau; services "will launch only where legally permitted", subject to "licensing, registration, approvals". The deal had closing conditions (due diligence, regulatory clearance "if any"); I did not find a closing notice (NOT FOUND, not searched on EDGAR beyond the 6-K list).
- **k25.ai is up (H):** `https://k25.ai/` HTTP 200 (Cloudflare Pages SPA, title "K25 | Watch-to-Predict", meta: "Free to play with points - no money, no deposit, no ID check - or trade real markets"). `GET https://api.k25.ai/api/public-config` -> `{"moneyPath":{"trading":true,"deposits":true,"withdrawals":true,"rails":{"cobo":{deposits:true,withdrawals:true},"nowpayments":{false},"privy":{false}}},"auth":{"discord":true}}`. Markets list shows 6 `open`, 14 `closed`, 19 `resolved` (2026-10-19). Real-money trading is flagged on, but activity is tiny (section 9).
- Other lookalike domains (H, curl 2026-10-19; not the venue): `predicxion.com` 301 -> `rewired.guru`; `predicxion.xyz` and `predicxion.ai` serve a 114-byte stub that redirects to `/lander` (parked; a third-party newly-registered-domain list shows predicxion.xyz registered 2026-10-10, L).
- Not listed on DefiLlama (H: scanned all 8,758 `api.llama.fi/protocols` entries by name/slug/url/twitter for `predicx|k25|novamarket|pdx`: no hit) and CoinGecko search for "predicxion" returned nothing (H). Social: `x.com/PredicXion` could not be read (WebFetch returned HTTP 402 from the fetcher/X side, not a venue payment requirement; stopped there).
- WebSearch budget for the session ran out after one search, so web coverage beyond direct page fetches is thin (limitation, not a finding).

## 2. Kind and market model

- **K25.ai (H for pieces):** custodial account-based app. Two market sources in `GET /api/markets`:
  - `resolutionType: "polymarket_mirror"` (28 of 39 listed): id `pm-<polymarketId>`, `externalRef: "polymarket:<id>"`, plus the Polymarket CLOB token ids `pmTokenYes` / `pmTokenNo` and `pmTickSize`. Binary YES/NO, central-limit-order-book liquidity borrowed from Polymarket (see sections 3, 5, 11). Category labels are broken: mirrored Politics/Crypto markets are labelled `"Football"` (H, 28 of 28), so do not trust `category`.
  - `resolutionType: "external_event"` (11 of 39): ids `ff_<uuid>`, tied to a `streamId` (e.g. news/finance streamers), questions like "Will the S&P 500 close higher this week", all `closed` with `closeTime 2026-09-06`, `volumeUsd 0`, no odds (seed/test-looking). `poolSize` is 0 everywhere; error strings (`pool_collateral`: "Not enough collateral behind this market right now") imply a house/pool-backed model for these, but the mechanism is NOT FOUND (no docs).
- **Order form (H, from public JS, not called):** RFQ-style quotes: `GET /api/markets/{id}/quotes` returns `{id, market_id, provider_id, side, price (cents), max_qty, remaining_qty, expires_at_ms}`; execution is `POST /api/markets/{id}/quotes/execute` with `{quote_id, qty, price, side, outcome, order_type, idempotency_key}`; open orders `/api/orders/open`, cancel `DELETE /api/orders/{id}`. Error strings mention `slippage_exceeded`, `price_off_tick`, `venue_rejected`, `polymarket_unreachable`, "The venue is at capacity".
- **Tokenisation:** none visible. Positions are rows in K25's ledger (`/api/positions`, `/api/account/positions`); no outcome token or on-chain position was seen. A "for fun" points mode exists (`forfun_unavailable`, `insufficient_points`) (H strings).
- **NovaMarkets (H for docs/pages read, M for model):** "Web3 prediction market" marketing; products: Event Predictions, Direction Predictions (up/down, high/low, odd/even over minutes-to-days), "Zodiac Prediction"/Lucky Stars (daily 9:30 PM draw, fixed-odds payouts "from 0.7x to 17,640x"; stake in internal `nUSD`), plus Nova Card (Visa/Mastercard crypto card), swap, savings ("Coming soon" tags). Fixed-odds / house-style, not an order book (M). Event cards on the home page are static HTML with hard-coded figures (BTC > $180k "18,842" participants / "$8.56M"; Apple 2027 iPhone; 2028 NBA) - marketing placeholders, not API data (H that they are static; treat the numbers as L).

## 3. Chains and collateral

- **K25.ai:** deposits via **Cobo** custody rail (`GET /api/cobo/deposit-address`, authenticated); NOWPayments and Privy (KYC / bank accounts) rails exist in code but are disabled in `public-config`. Chain and token for the Cobo deposit address: NOT FOUND (the address call is authenticated; I did not call it; searched: JS bundle, Terms). Terms: balances and limits are in **USD** ("deposits and withdrawals are denominated in United States Dollars", max single deposit/withdrawal US$10M) (H). The execution venue (Polymarket) has its own chain and collateral (see the Polymarket spec), but K25 users never touch it; K25 holds the balance (M).
- **NovaMarkets:** chain NOT FOUND (docs say nothing; searched: gitbook welcome, user agreement, zodiac page, landing page, JS). Internal unit `nUSD`; card fees quoted in USDT/USD/HKD. Login options include MetaMask connect (string "Disconnect MetaMask") but the account is email + password (`/pdx/auth/register`) with `/pdx/user/asset/list`, `/pdx/user/address/list` (deposit addresses), `/pdx/exchange/stablecoin` (H, paths from JS) - i.e. custodial, not a wallet-signed protocol (M).
- No smart-contract address was found for either (NOT FOUND; searched: both bundles, gitbook, 6-K, DefiLlama, `gh search repos/code predicxion`).

## 4. Read API

Classification: **K25 = `unofficial-only`** (undocumented front-end API, public GETs work with no auth); **NovaMarkets = `none`** confirmed (public reads are POST, undocumented).

**K25.ai (H, unauthenticated GETs sent with the generic UA, ~12 requests, 2026-10-19):**
- Base URL: `https://api.k25.ai` (Express behind Cloudflare; JSON; unknown paths return `{"error":"We couldn't find that.","code":"not_found"}`). No docs: NOT FOUND (searched: k25.ai, /sitemap.xml shows the SPA 404 shell, docs.k25.ai and app.k25.ai do not resolve, GitHub).
- Auth: reads need none; account/trading use a session cookie from better-auth style `/auth/v2/sign-in/{email,social}` (email/Google/Apple/Discord) (H from JS). Rate limits: NOT FOUND (no `x-ratelimit-*` / `retry-after` on responses; error code `rate_limited` exists). No WebSocket or SSE in the bundle (searched for WebSocket/EventSource/wss): polling only.
- Public endpoints confirmed:

| Endpoint | Returns |
|---|---|
| `GET /api/public-config` | feature flags: `moneyPath.{trading,deposits,withdrawals,rails}`, `auth.discord` |
| `GET /api/markets[?stream_id=]` | `{markets:[{id, streamId, question, category, status(open/closed/resolved), yesOdds, noOdds, poolSize, externalMatchId, externalRef, pmTokenYes, pmTokenNo, pmTickSize, resolutionType, resolvedOutcome(yes/no/void/null), closeTime, volumeUsd}]}` (20KB, 39 rows, no pagination seen) |
| `GET /api/markets/{id}` | one market `{market:{...same fields}}` |
| `GET /api/markets/{id}/quotes` | `{v:1, kind:"list_quotes", quotes:[{id, market_id, provider_id:"polymarket", side:"Buy"/"Sell", price:99 (cents), max_qty, remaining_qty, expires_at_ms}], bestBidUsd, bestAskUsd, tickSize}` |
| `GET /api/markets/{id}/fills?limit=` | `{fills:[{outcome, side, priceUsdc, size, createdAt}]}` (only one fill returned for pm-920401, dated 2026-08-13) |
| `GET /api/streams` | `{streams:[{id,title,category,streamer,viewers,activeMarkets,poolVolume,isLive,provider(youtube/twitch),...}], total, offset, limit, hasMore}` |
| `GET /api/schedule`, `/api/schedule/next` | FIFA World Cup schedule stub (`available:false`, `fixtures:[]`) |
| `GET /api/geo` | caller country code (not saved) |

- Authenticated-only (H from JS; NOT called): `/auth/me`, `/api/account*`, `/api/balances`, `/api/positions`, `/api/orders/*`, `/api/cobo/deposit-address`, `/api/privy/kyc`, `/api/privy/bank-accounts`, `/api/withdrawals*`, `/api/payments/*`, `POST /api/markets/{id}/quotes/execute`.
- Resolution data: `status` + `resolvedOutcome` only; no resolution source, timestamp, evidence or dispute fields. Note resolved mirror markets still show stale `yesOdds` of 0.5 (H, e.g. pm-2758338), so odds on non-open rows are not settlement prices.

**NovaMarkets (H for paths, not called):** same-origin proxy `https://www.novamarkets.space/api/pdx/...`; `robots.txt` disallows `/api/`. Public-flagged calls are `POST`: `/pdx/v2/event/list`, `/pdx/v2/event/info`, `/pdx/market/list`, `/pdx/event/position/list`, `/pdx/bet_order/list`; trading `/pdx/bet_order/create`; disputes `/pdx/dispute/{create,get}`. I did not POST, so no response shape is confirmed. No docs, no API terms (NOT FOUND; searched: gitbook llms.txt, 20 pages listed, none about an API).

## 5. Trade path and PayBox reachability

- **Programmatic trading: none offered.** K25: session-cookie REST used by its own front end (`/quotes/execute`); no API keys, no signed orders, no SDK, and the Terms prohibit "automatic playing of games by software, including bots ... AI software ... automatic betting" (clause 3.38, H). Nova: session-token REST (`/pdx/bet_order/create`), same custody model, no automation language but also no API offering.
- **PayBox reachability: no.** Custodial accounts need an email/social login and, per Terms 3.9, name/DOB/address verification "prior to being able to make a deposit". A PayBox EVM/Solana wallet could at most fund a deposit address (K25: Cobo, chain unknown; Nova: address list per `/pdx/user/address/list`) after a human has created and verified an account; there is no transaction-proposal or signed-order route to place or cancel orders. Funding-only at best; and the underlying K25 liquidity is Polymarket, which an agent can reach directly instead (see the Polymarket spec from the parallel workflow). (H for facts, M for the conclusion.)

## 6. Fees

- **K25:** no fee schedule published (NOT FOUND; searched: Terms bundle text, error strings, order flow). The quote prices equal Polymarket's best bid/ask exactly (0.994 / 0.996 vs K25 `bestBidUsd` 0.994 / `bestAskUsd` 0.996, H), so any trading fee or markup is applied elsewhere (execution or account level) and is unknown. Withdrawal: Terms 3.15/3.18 - "a processing fee if applicable"; code `amount_below_fee` confirms a withdrawal fee exists. Min order exists (`min_order`, `notional_too_small`), size unknown.
- **Nova:** prediction fees not documented (gitbook "Fees and Limits" is card-only: Flow card funding 1.9% / tx 0%; Pulse 0.95% / 0.8%; Roam 0.5% / 2.5%; issuance 10-99 USDT; H). Zodiac page: no fees mentioned, payout = stake x odds.

## 7. Resolution mechanism and dispute risk

- **K25 mirrors:** `resolutionType: polymarket_mirror` implies the K25 market follows the Polymarket market's resolution (M; K25 states no rule; Polymarket's own resolution/dispute process is covered by the parallel Polymarket spec). Operator risk on top: a custodial middleman can void/reject/cancel (`venue_rejected`, `void` outcome seen once among 19 resolved rows), and the Terms let K25 "void any affected bets or wagers" and withhold funds for restricted-territory or suspected violations (clauses 3.40-3.41, H).
- **K25 `external_event` markets:** resolver not documented. The SEC press release says AI is used for "outcome monitoring, and resolution workflows" (M for how that works). No oracle, bond or dispute window described.
- **Terms inconsistency (H, red flag):** K25's Terms of Complaint (in the site bundle) name the operator as **Bridge Technologies B.V.**, Willemstad, Curacao, "Licence OGL/2024/431/0231 issued by the Curacao Gaming Control Board" and use boilerplate casino language ("games", "players"), while the Terms are governed by BVI law and the SEC filing names **PredicXion Group Limited (BVI)** as the platform company. I did not verify the licence with the Curacao regulator (NOT CHECKED); treat the licence claim as unverified and the operator identity as unclear.
- **Nova:** Terms: "Disputes shall first be addressed through community governance or on-chain arbitration"; formal disputes under "the laws of the British Virgin Islands or another neutral jurisdiction"; no legal entity named (H, gitbook user agreement). In-app dispute endpoints exist (`/pdx/dispute/create`). Mechanism otherwise NOT FOUND ("announced" results for zodiac draws, source unspecified).

## 8. Geo, ToS, automation (quotes kept short)

- **K25 Terms clause 3.40 Restricted Territories (H):** Cuba, Iran, North Korea, Russia, Syria, Crimea/Donetsk/Luhansk, Ontario, Netherlands, **United States and territories**, France, Greece, **Singapore**, **China including Mainland, Hong Kong and Macau**, Australia, Germany, **United Kingdom**, **Japan**. This conflicts with the SEC press release's stated target markets (Thailand, Singapore, Japan), so the live list excludes two of the three announced launch countries. VPN/proxy use is banned (3.39). Account opening requires identity verification before deposit (3.9). Governing law BVI. 18+ implied.
- **Automation:** "automatic playing of games by software, including bots ... AI software ... or automatic betting ... is not permitted" (3.38). So bot trading is prohibited on the current record.
- **Crawling signals:** k25.ai `robots.txt` is a Cloudflare managed file with `Content-Signal: search=yes,ai-train=no,use=reference` and disallows ClaudeBot / anthropic-ai / Claude-Web training crawlers. I read the public landing page, one JS bundle and ~12 public JSON GETs for reference with the generic research User-Agent (no crawling, no training use), and saved only small samples. Nova's `robots.txt` disallows `/api/`; I made no calls to its `/api/`.
- **Nova:** user agreement names no restricted territories and no automation rule (H); that silence is not permission.
- Regulatory posture per the company itself: Cheung says gambling rules are a "significant concern" (Cointelegraph); the 6-K says services launch only "where legally permitted". No regulator licence is stated by PredicXion Group Limited anywhere I read (the Curacao claim appears only in the K25 complaint terms).

## 9. Liquidity (as of 2026-10-19 ~02:20 UTC)

- **K25 (H, computed from `GET /api/markets`):** sum of `volumeUsd` over all 39 listed markets = **$3,515**; open markets only = **$47.49**; largest single market = $1,709 (a resolved July BTC market); 6 markets open. Compare the same underlying Polymarket market 920401 ("Apple foldable iPhone before 2027"): Polymarket `volume` $734K, `liquidity` $23.5K, versus K25 `volumeUsd` $38.01 (H, both public GETs). TVL / user count / OI: NOT FOUND (searched: API, site, DefiLlama, SEC exhibits - no figures given in the 6-K either).
- **Nova:** nothing verifiable. Home-page "$8.56M" / "18,842" figures are static HTML (L). No DefiLlama/CoinGecko listing (H).
- **Funding/commitment (M):** NIVF's announced $2M initial investment at a $100M pre-money valuation is a corporate funding datapoint, not trading liquidity.

## 10. Event overlap with other venues

- **K25 mirror markets (H):** exactly the Polymarket markets they copy: Taiwan politics (Lai out as President, Premier Cho out, KMT/DPP local elections), BTC/ETH price ladders, "OpenAI achieves AGI before 2027", "Apple foldable iPhone", esports (LCK, EWC PUBG), 2026 FIFA World Cup winners, Iran. Overlap with Polymarket is 100% by construction; with Kalshi/Limitless etc. wherever those list the same events.
- **K25 original stream markets (H):** finance/crypto/Asia-politics/K-pop/UFC questions (S&P weekly close, BTC close above $95K, gold weekly, Hang Seng at 25,300, Taiwan central bank rate hold, BLACKPINK single, Song Yadong UFC) - all closed, zero volume, would overlap Kalshi/Polymarket crypto and macro lines but are not tradeable now.
- **Nova:** crypto price direction (up/down) overlaps conceptually with short-dated crypto markets elsewhere, but contract terms, source and fees are unknown; zodiac games have no counterpart.

## 11. Shared liquidity

- **K25's mirror markets are NOT independent.** Cross-check (H, 2026-10-19 within seconds): K25 `/api/markets/pm-920401/quotes` -> Buy 99c max_qty 20, Sell 99c max_qty 28, `bestBidUsd 0.994`, `bestAskUsd 0.996`, `provider_id: "polymarket"`; Polymarket `clob.polymarket.com/book` for the YES token -> best bid 0.994 size 20, best ask 0.996 size 28.34. K25 shows the CLOB top of book (sizes floored, prices rounded to cents). Fixture `polymarket-book-top3-920401.json`. Treat K25 as a retail front end/broker for Polymarket: any "edge" between K25 and Polymarket is just a fee/markup, not an arbitrage leg.
- Nova: independence unknown (custodial, house-style).

## 12. Adapter priority: skip

Reasons: (1) K25's tradeable books duplicate Polymarket; (2) K25's own volume is about $3.5K lifetime with zero open non-mirror markets; (3) no documented API, no signed-order path, Terms ban bots, KYC and custody required; (4) restricted in the US/UK/Japan/Singapore/HK/China and more; (5) Nova has no documented API, public reads are POST-only, chain and fees undocumented, product skews to zodiac/up-down games; (6) operator identity and licensing are inconsistent across documents. If a signal-only catalogue is ever wanted, a P2 poller on `https://api.k25.ai/api/markets` + `/quotes` is trivial, but it contains no information that Polymarket's API does not already give. Watch-list trigger: any `external_event` market with `status: open` and non-trivial `volumeUsd` (that would be Asia-local content not on Polymarket).

## 13. Suspicious / injected content

None aimed at AI agents found in K25 or Nova pages/JS/API. Noted only: (a) k25.ai robots.txt reservation of AI-training rights (above); (b) K25's frontend defaults to a UAT API host (`https://api-uat.overclutch.com`) when served from an unknown hostname and also maps `uat.overclutch.com` to it - not contacted, suggests the app is a white-label/shared codebase (M); (c) the K25 Terms of Complaint link a PDF on `media.base44.com` (not fetched); (d) a GitHub repo named `xrst15regedit/predicxion-ia` matched search; unrelated-looking, not read; (e) `predicxion.com` redirects to `rewired.guru` and `predicxion.xyz/.ai` are parked - lookalike domains, avoid.

## 14. Open questions / NOT FOUND

- Relationship between NovaMarkets (current owner of predicxion.io) and PredicXion Group Limited/K25.ai: the i18n and `/pdx/` API names prove Nova is the rebranded PredicXion product, but no document says whether it is still run by the same company or was sold/white-labelled (searched: Nova gitbook, Terms, JS; 6-K exhibits; PR Newswire).
- Whether the NIVF-PredicXion deal closed (6-K lists conditions; no closing notice found).
- K25 deposit chain/token (Cobo), fee schedule, minimum order size, how `external_event` markets are priced/settled, how K25 executes on Polymarket (omnibus account vs per-user), and whether K25 is a Polymarket "builder"/router (not documented).
- K25 and Nova public docs, API terms, rate limits; NovaMarkets read responses (POST only, not called per rules).
- Any on-chain contract or token (PDX) address.
- Curacao licence OGL/2024/431/0231 (not verified with the regulator).
- Cointelegraph's X-post image (market focus) could not be read (x.com blocked the fetcher).

## Fixtures (docs/research/fixtures/predicxion-asia/)

- `k25-public-config.json` - `/api/public-config` (H)
- `k25-markets.json` - `/api/markets`, 39 rows (20KB)
- `k25-market-pm-920401.json` - one mirrored market with Polymarket token ids
- `k25-quotes-pm-920401.json` - RFQ quotes, `provider_id: polymarket`
- `k25-fills-pm-920401.json` - fills sample (1 row)
- `k25-streams.json` - `/api/streams`
- `polymarket-book-top3-920401.json` - top 3 levels of Polymarket's public CLOB book, fetched alongside the K25 quote for the shared-liquidity check

## Sources

- https://cointelegraph.com/news/prediction-markets-testing-legal-limits-asia and https://cointelegraph.com/features/prediction-markets-testing-legal-limits-asia (article dated 2026-04-04; PredicXion quotes) (H)
- https://www.prnewswire.com/apac/news-releases/predicxion-launches-asias-first-creator-led-ai-powered-prediction-market-to-transform-63b-global-industry-302492108.html (2025-06-26 launch release; predicxion.io) (H); https://www.prnewswire.com/news/predicxion/ (list of releases) (H); https://itbusinesstoday.com/fintech/blockchain/predicxion-unveils-asias-first-ai-creator-prediction-market/ (M, syndicated copy)
- https://www.sec.gov/Archives/edgar/data/1981662/000121390026059849/ea0291826-6k_newgenivf.htm , `.../ea029182601ex10-1.htm` (PredicXion Group Limited, BVI 2199437, K25.ai), `.../ea029182601ex99-1.htm` (K25.ai press release, 2026-05-21) (H); https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=NewGenIvf&type=6-K (filing list) (H)
- https://predicxion.io/ and https://www.predicxion.io/ (301 to https://www.novamarkets.space/) (H); https://www.novamarkets.space/ , `/markets`, `/robots.txt`, and its `_next/static` chunks (i18n "About PredicXion", `/pdx/*` paths) (H)
- https://novamarkets-1.gitbook.io/docs (welcome page, `llms.txt`, `user-agreement`, `zodiac-prediction/zodiac-predictions.md`, `fees-and-limits.md`) (H)
- https://k25.ai/ , https://k25.ai/robots.txt , https://k25.ai/assets/index-ClY_UDYm.js (Terms/Complaints text embedded, API paths) (H)
- https://api.k25.ai/api/{public-config, markets, markets/pm-920401, markets/pm-920401/quotes, markets/pm-920401/fills, streams, schedule, schedule/next} (H, unauthenticated GETs, 2026-10-19)
- https://gamma-api.polymarket.com/markets/920401 and https://clob.polymarket.com/book?token_id=<YES token of 920401> (H, public GETs, shared-liquidity cross-check)
- https://api.llama.fi/protocols (no match for PredicXion/K25/Nova/PDX), https://api.coingecko.com/api/v3/search?query=predicxion (empty) (H)
- `gh search repos|code predicxion` (third-party mentions only; one YouTube-transcript index confirming Andy Cheung "PredicXion" interview; L)
- Web search (extended) "PredicXion prediction market Asia": surfaced the PR syndications, Cointelegraph feature and commentary pieces (M); later searches were blocked by the session search budget.
