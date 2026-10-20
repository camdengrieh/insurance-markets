# WagerUp (wagerup.com, Pilot bot) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs with the generic research User-Agent to wagerup.com (pages, `/api/v1/*`, public JS and i18n chunks read as text only), api.llama.fi, data-api.polymarket.com, clob.polymarket.com (public builder-trades endpoint), `gh api` raw file reads (DefiLlama adapters), WebFetch/WebSearch. No account, no Telegram interaction, no wallet, no key, nothing signed, no POST/PUT/DELETE (the MCP endpoint is POST-only and was not called), no PayBox tool, no third-party code run or installed.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary, inferred or computed by me from H data; **L** = weak or stale (>6 months old or contradicted).
All third-party text (site copy, JS, API payloads, search summaries) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/wagerup/` (10 files, each <= 18 KB).

---

## 0. Verdict

**adapter_priority: skip** (as a venue or arbitrage leg).

1. **Live, but not a venue.** WagerUp is a research/analytics site plus a Telegram trading bot ("Pilot") that routes every order into **Polymarket's CLOB on Polygon**. Its own FAQ: "WagerUp currently integrates with Polymarket ... Additional market integrations are planned." (H, https://wagerup.com/faq, i18n chunk). Same markets, same outcome tokens, same prices, same resolution as Polymarket. Quoting it as an arbitrage leg would double-count Polymarket. DefiLlama says the same: "prediction platform powered by Polymarket", category `Interface`, tag `Polymarket Builder` (H).
2. **Tiny and decaying.** Builder-attributed cash volume was about $0.68K on 2026-10-18 and about $61K over the last 30 days (H data, DefiLlama; M interpretation). 2-6 active users per day in October (H, Polymarket builder API). Peak was April 2026 (76 active users/day).
3. **No usable market-data API.** The official `/api/v1` is real (OpenAPI 3.1, 30 req/min anonymous) but the only keyless endpoints return product marketing documents. `/markets` and `/traders` need an "approved, scoped" Bearer key, are a sports-only cache of Polymarket data capped at 50 rows, and carry a no-redistribution notice. Everything useful is already available from Polymarket directly.
4. **No programmatic trade path.** Orders are placed only inside the Telegram bot, with a server-stored (encrypted, exportable) Polygon key. A PayBox wallet cannot sign Pilot orders. To reach this liquidity use Polymarket directly (see `docs/research/08-venues-polymarket-kalshi.md`).
5. **Only residual value**: (a) a worked example of a Polymarket "builder" front end whose volume can be measured via builder-code attribution; (b) a lead on **TerminalUp**, a separate invite-only multi-venue terminal (competitor/prior art for the aggregation layer, not a data source). Both are in section 12.

---

## 1. Is it still live? (2026)

| Evidence | Value | Tag |
|---|---|---|
| `https://wagerup.com/pilot` | HTTP 200 on 2026-10-19 03:56Z; title "WagerUp Pilot \| Automated Sports Trading Bot \| Copy Top Traders" | H |
| `https://wagerup.com/api/v1` | 200, `{"name":"WagerUp Public API","version":"1.0.0","status":"beta","dataAccess":"restricted",...}` | H |
| Terms and Conditions | "Last updated: June 13, 2026" (faq i18n chunk) | H |
| Polymarket builder API (`builder_name` = `WagerUpPilot`) | rows for every day 2026-04-07 .. 2026-10-19; 2 active users on 10-19 | H |
| DefiLlama `wagerup-predictions` (id 8002) | category `Interface`, tag `Polymarket Builder`, chain Polygon, no TVL, volume series to 2026-10-18, no dead/deprecated flag | H |
| Site's own status wording | FAQ: "much of WagerUp is live right now ... while the full trading platform is in pre-launch. The ... Pilot bot is already live on Telegram" | H |
| Trend | cash volume fell from about $190K/day (2026-07-07) to under $1K/day (early October), with one blip (2026-10-15/16: $2.2K / $6.3K) | H (data) |

Verdict: **still_live = true**, as a small front end. The Telegram bot itself was not opened, so bot liveness is inferred from the builder rows.

---

## 2. Kind and market model

- **Kind: broker-or-frontend** (H). Three products (https://wagerup.com/trading-tools, `/terminal`, `/about`): *WagerUp* (research website: odds, volume, movers, whale feed, trader leaderboard, calculators, sports-data hubs), *Pilot* (Telegram bot: manual trading, copy trading, "Auto Pilot" rules, portfolio), *TerminalUp* (separate company site `terminalup.com`, invite-only).
- **Markets**: Polymarket's only. Docs: "Pilot currently trades on Polymarket (Polygon). Additional venues are on the roadmap" (H, docs chunk). About/terminal copy talks about "aggregated order book across all venues", but that is attributed to TerminalUp, which the site says "should not be assumed to apply to WagerUp" (H, about-us chunk).
- **Market model / tokenisation**: inherited from Polymarket: binary YES/NO outcome shares paying $1 or $0, price 0.01-0.99, CLOB, negative-risk multi-outcome events (H for the share description in WagerUp's FAQ; details in `08-venues-polymarket-kalshi.md`). No WagerUp token, no AMM, no parimutuel. A "$POLY airdrop" and a "WagerUp Rewards Program" are listed as "only a possibility" / "being considered" (H, fees chunk). The "Airdrop Calculator" is about Polymarket's rumoured token, "not affiliated with ... Polymarket".
- **Extras that are not market data**: sharp-money picks, market movers, whale watch ($1K+ Polymarket sports trades), trader ranking by sport, parlay/vig-free calculators (llms.txt, FAQ). The vig-free calculator uses proportional normalisation; the parlay picker uses Polymarket "YES best ask / NO = complement of YES best bid" (H, llms.txt).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Settlement chain | Polygon (137) via Polymarket | H (docs: "Polymarket, which runs on Polygon") |
| Collateral | USDC on Polygon per WagerUp copy; Polymarket's V2 collateral token is covered in the Polymarket spec | H (WagerUp copy), see sibling note |
| Funding wording conflict | docs/wallet-funding: "Send USDC on the Polygon network ... If you send funds on any other chain (Ethereum mainnet, Arbitrum, Base, etc.), Pilot will not see them". `/pilot` how-it-works: "Deposit crypto instantly. ETH, USDC, USDT, SOL, BNB, POL are all supported." Not reconciled (possible auto-swap/bridge, undocumented). | H (both texts), conflict unresolved |
| Wallet | Pilot generates a fresh Polygon wallet per Telegram user; key "encrypted and stored so the bot can sign trades on your behalf", exportable with `/export`; `/import` of an existing Polygon key is supported | H (docs chunk) |
| Gas | "Pilot covers gas for standard trade execution" (H, docs) |
| TVL | none (Interface; no custody of its own). DefiLlama `chainTvls.Polygon.tvl` is empty. | H |

---

## 4. Read API

### 4.1 WagerUp's own API (official, beta)

- Docs: https://wagerup.com/developers (page is a thin JS app; text recovered from its JS chunk). OpenAPI 3.1: https://wagerup.com/api/v1/openapi.json (fixture). Base URL `https://wagerup.com/api/v1`. robots.txt: `Allow: /api/v1/`, `Disallow: /api/` otherwise (H).
- Endpoints (H, OpenAPI):

| Method + path | Auth | Returns |
|---|---|---|
| `GET /` , `GET /status` | none | name, version `1.0.0`, `status:"beta"`, `dataAccess:"restricted"\|"available"`, links, limits. `/status` = API availability, "not an upstream data health check" |
| `GET /products`, `GET /search?q=`, `GET /documents/{id}` | none | marketing/product documents (`id,title,url,summary,text`). Sample: 3 products (wagerup, pilot, terminalup). Search for "fees" returned `results: []` |
| `GET /markets?limit<=50&offset<=1000&sport=` | **Bearer `wu_<64 hex>`**, scope `markets:read` | "Tracked sports market snapshot ... Not an exhaustive exchange feed." Fields: `id, question, sport, url, bidProbability, askProbability, midProbability, volume24hUsdc, volumeUsdc, liquidityUsdc, scheduledStart`. Sorted by 24h volume. `meta`: `asOf` (cache time, "not an exchange quote timestamp"), `stale`, `total`, `nextOffset`, `source`, `coverage` |
| `GET /traders?limit&offset` | Bearer | all-time sports leaderboard, up to 100 traders: `address, rank, name, pnlUsdc, pnlScope:"sports-realized", volumeShares` |
| `POST /mcp` | none for search/fetch tools | Streamable HTTP MCP; public tools read the same product documents; market and trader tools need the key |

- **Auth / access**: "Approved integrations receive a key scoped to markets, traders, or both." No self-serve key request found (NOT FOUND, searched: /developers JS chunk, OpenAPI, llms.txt, /support: "WagerUp does not currently publish a private support email or private support form"). Unauthenticated `/markets` and `/traders` return 401 `api_key_required` with `WWW-Authenticate: Bearer realm="WagerUp Public API"` (H, fixture `wagerup_api_v1_markets_401.txt`). I did not and will not request a key.
- **Rate limits** (H, OpenAPI description + live headers `ratelimit-limit: 30`): 30 req/min anonymous, 120/min per key, 180/min per IP, 600 global, "per serving instance", "not a paid service guarantee"; 429 carries `Retry-After`; 503 when no recent snapshot.
- **Licence note** (H): "Public access does not grant redistribution rights to third-party market data." and OpenAPI: "Data licensing and client approval are separate from API authentication."
- **Websocket**: none. NOT FOUND (searched: OpenAPI paths, developers page, llms.txt).
- **Resolution / trades endpoints**: none. NOT FOUND.
- **Value for an aggregator**: none beyond Polymarket. `/markets` is a lagged cache of Polymarket sports quotes with no depth, no token ids and no condition ids in the schema (the `id` format is not documented), so it cannot even be joined reliably to Polymarket rows.

### 4.2 Public Polymarket endpoints that expose WagerUp's footprint (useful to size it, not to trade it)

| Endpoint | Shape (H, fixtures) | Note |
|---|---|---|
| `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90` | `{"data":[{"date":"2026-10-19","rank":70,"builder_name":"WagerUpPilot","builder_code":"0xbc37cc54...45fb","verified":true,"volume":310.6,"active_users":2}, ...]}` | v1 (`/v1/builders/volume`) works today but **"Data API v1 is retired on October 24, 2026"** (H, https://docs.polymarket.com/migrate/data-api-v1-to-v2). v2 serves only the latest 90 daily buckets (H, DefiLlama helper comment). |
| `GET https://clob.polymarket.com/builder/trades?builder_code=<code>` | `{data:[{tradeType,side,size,sizeUsdc,price,status,outcome,outcomeIndex,builderCode,fee,feeUsdc,builderFee,matchTime,maker,owner,market,assetId,transactionHash,...}], next_cursor, limit:300, count:300}` | Answered 200 with no auth on 2026-10-19; includes third-party wallet addresses, so the fixture is redacted. |

**Units gotcha (M, computed from H data):** Polymarket's builder-volume `volume` is **share notional**, not dollars. For 2026-10-18 the builder API says 1,629.59 and the CLOB sample sums to 1,629.6 shares and $682.2 USDC; DefiLlama's USD figure for that day is $682. Anyone converting these fields to dollars will overstate by roughly 1/price (about 2.4x here). The monthly share-notional totals in the fixture are therefore upper bounds on cash volume.

---

## 5. Trade path

- **Programmatic order placement through WagerUp: none documented** (NOT FOUND, searched: OpenAPI, developers, docs, llms.txt: "The beta API is read-only"). The website's "trade" buttons open a pre-filled order in the Telegram bot; "Nothing is placed until you review ... and confirm inside the bot" (H, faq + pilot chunks).
- **Signing scheme**: Pilot holds an encrypted server-side key for the user's generated Polygon wallet and signs Polymarket CLOB orders itself ("Pilot signs and submits the order to Polymarket's order book") (H, docs). So WagerUp is effectively a hosted-key bot, even though its copy says "non-custodial"; ToS 4 puts safeguarding access on the user. The docs' "even with full database access, an attacker couldn't decrypt your key without also controlling your Telegram session" is an unaudited claim (L).
- **Equivalent direct path**: Polymarket CLOB with EIP-712 signed orders from the user's own wallet (no WagerUp involvement). Builder attribution (`builderCode`) is just a field on Polymarket orders.

---

## 6. Could an EVM wallet reachable through PayBox trade it?

**paybox_reachable = no** for WagerUp itself.

- No API accepts a signed order or a transaction proposal. The only trade surface is a Telegram chat bound to a Telegram identity.
- The only "wallet" WagerUp trades from is the one it generates (or one whose private key the user hands over with `/import`). PayBox is described as a non-custodial agent wallet and I saw no key-export tool in its tool list (names only; no PayBox tool was called), so there is no way to hand a PayBox key to Pilot's `/import`.
- Technically a PayBox EVM wallet could send USDC on Polygon to a Pilot deposit address, but that moves funds into a key WagerUp's servers can sign with. That defeats the point of PayBox and adds custody risk for zero extra liquidity.
- The same liquidity is reachable via Polymarket directly (EIP-712 `typedData` signing); that route and its caveats (Polygon as a PayBox network not verified at tool level, geoblocking by request IP) are in `docs/research/08-venues-polymarket-kalshi.md` sections 9 and 2.10, not repeated here.

---

## 7. Fees

| Fee | Value | Tag |
|---|---|---|
| WagerUp / Pilot platform fee | **0%** on manual and copy trades, "win or lose" ("Current WagerUp and Pilot bot fees are 0% ($0) ... Third-party venue and blockchain network fees may still apply") | H (https://wagerup.com/pilot meta description, /fees, /faq) |
| Observed builder fee on Polymarket orders | `builderFee = "0"` on all 300 most recent WagerUp-attributed trades (2026-10-17 23:40Z to 2026-10-19 03:33Z). DefiLlama has a builder-fee adapter for 13 other builders but none for WagerUp. | H (data) |
| Polymarket venue fee, paid by the taker | In that sample `feeUsdc = rate x shares x p x (1-p)` with `rate` = 0.03 on 163 trades and 0.05 on 135 trades (one 0.052 rounding case); effective 1.85% of notional overall | M (fit by me to H data) |
| Older fee model | A search-engine summary of older WagerUp copy said "1.9% fee on winning copy trades, 0.9% on other winning trades, zero on losses". The current /fees page has a lookup of "historical wallet transfers to the tracked platform address" and says these "are not the current WagerUp or Pilot fee rate". Consistent with a fee that was charged earlier and removed, not proven. | L |
| Network | Pilot sponsors gas for standard trades | H (docs) |
| Future | "No rewards or revenue-sharing terms are currently offered or guaranteed." Fee change risk: ToS 14 lets WagerUp modify or discontinue anything "without notice". | H |

For arbitrage maths, the effective cost is Polymarket's own schedule; WagerUp adds nothing today.

---

## 8. Resolution mechanism and dispute risk

Entirely Polymarket's. WagerUp is "never a counterparty", does not "control these platforms", and disclaims "resolution decisions of any third-party platform (including Polymarket)" (H, ToS 2, 3, 9). Polymarket's UMA Optimistic Oracle / Chainlink flow and dispute-tail risk are documented in `08-venues-polymarket-kalshi.md` section 2.10. Extra layer of risk specific to WagerUp: its own cached `/markets` data can be stale (`meta.stale`), and Pilot's auto-redemption/payout is a bot feature, not a protocol guarantee.

---

## 9. Geo, ToS and automation rules

- Geo (H, ToS 7): user "represents ... that you are not located in, a resident of, or accessing the Service from any prohibited or restricted jurisdiction"; no list is given, so Polymarket's list applies (US is close-only on Polymarket global; see sibling note section 2.10). Acceptable use (ToS 12): not "to circumvent geographic or eligibility restrictions".
- Automation / scraping (H, ToS 12): not to "interfere with, scrape, overload, reverse engineer, or attempt to gain unauthorized access to the Service or its infrastructure". The official API is the permitted read route, and it is key-gated for market data; no-key use is limited to product documents. The JS chunks I read to recover the site copy are publicly served assets, but a production adapter should not depend on scraping the UI.
- Data licence (H, developers page): no redistribution of third-party market data via the API.
- Liability (H, ToS 9): capped at "the greater of the fees you paid to WagerUp in the three (3) months before the claim or USD $100" (fees are $0). Binding individual arbitration, class-action waiver (ToS 16). Self-described: "not a sportsbook, bookmaker ... broker-dealer ... exchange ... money transmitter ... or custodian" (ToS 2).
- Privacy page: "not an owner-approved comprehensive legal privacy policy" (H).
- Telegram: the only trading surface is Telegram; Telegram's own bot/automation rules were not reviewed (NOT FOUND for any WagerUp statement on third-party automation of the bot).

---

## 10. Liquidity (volume / OI / TVL)

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| TVL | none, not applicable | DefiLlama, 2026-10-19 | H |
| Cash volume 24h | $682 (2026-10-18) | `api.llama.fi/summary/dexs/wagerup-predictions`, 2026-10-19 | H |
| Cash volume 7d / 30d | $11,353 / $61,331 | same | H |
| DefiLlama "all-time" | $1,283,433 | same (series only starts 2026-07-05 because Polymarket's builder API serves ~90 days; adapter `start` is 2026-04-07), so understated | H / M |
| Peak cash day in series | $189,569 on 2026-07-07 | same | H |
| Polymarket-reported builder volume (share notional, see 4.2) | Apr 2026 67.5M, May 27.1M, Jun 9.3M, Jul 2.8M, Aug 0.48M, Sep 0.195M, Oct 1-19 0.061M; peak day 7.68M on 2026-04-28 (60 active users) | `data-api.polymarket.com/v1/builders/volume`, 2026-10-19 | H (data), M (units) |
| Active users (Polymarket builder attribution) | 76 max/day in April; 2-6/day in October | same | H |
| Builder rank | 70 on 2026-10-19 (110 on 10-18); about 200 builders active that day | same | H |
| Share of Polymarket flow | 2026-10-18: $682 cash vs $31.7M share-notional across all builders (units not comparable, order of magnitude only) | same | M |
| Depth | n/a: no own book. Depth = Polymarket's | | |

---

## 11. Event categories and liquidity sharing

- Categories (H, FAQ/llms.txt): sports (NBA, NFL, MLB, NHL, MLS, NCAAF/NCAAB, EPL, La Liga, Bundesliga, Serie A, Ligue 1, UCL, UFC, boxing, F1, NASCAR, tennis, golf, esports), crypto price targets (BTC, ETH, SOL, XRP, DOGE ...), politics/elections/world events/economy/tech. Site emphasis is sports.
- Overlap with other venues: every category overlaps Polymarket by identity and overlaps Kalshi, Limitless, Predict.fun, Opinion etc. exactly where Polymarket does. WagerUp contributes no markets of its own.
- **liquidity_shared_with: Polymarket (100%).** Not an independent arbitrage leg.

---

## 12. Adapter recommendation

- **skip** for the venue adapter. Reasons: duplicate liquidity, no trade API, hosted-key Telegram-only execution, key-gated and licence-restricted read API, near-dormant volume.
- If a signal feed is ever wanted from this family: derive "sharp wallet" signals straight from Polymarket's public data (data-api v2 positions/trades), which is what WagerUp does ("Every trade is pulled directly from the Polygon blockchain and Polymarket's public API"). Do not integrate WagerUp for that.
- Monitoring-only use: track `builder_name = WagerUpPilot` in the Polymarket builders API (v2) if you want to know whether the front end revives; it costs nothing and is not an adapter.
- **Lead, not researched in depth (M):** TerminalUp (https://terminalup.com, "(c) 2026 Terminal Up Inc."). WebFetch summary: invite-only, "$10K minimum deposit", lists 27 venues (Kalshi, Polymarket, Pinnacle, DraftKings' DKeX, Betfair, Matchbook, Novig, ProphetX, SX Bet, Hyperliquid, predict.fun and sportsbook/exchanges), claims sub-100 ms multi-book execution; no API mentioned; custody not stated. WagerUp's own pages cite "23" venues. The two counts disagree (23 vs 27). A third-party search found no independent link between TerminalUp and WagerUp beyond their own cross-promotion. Relevant to the project only as a competing aggregator/prior art, and as a list of sportsbook-style venues that might deserve their own venue specs (Novig, ProphetX, SX Bet, Betfair, Matchbook, Pinnacle).

---

## 13. NOT FOUND / open questions

- NOT FOUND (searched: /developers JS chunk, OpenAPI, llms.txt, /support): any way to apply for an API key, key pricing, or the data-access criteria.
- NOT FOUND (searched: OpenAPI, site chunks): websocket, order-book, trades or resolution endpoints.
- NOT FOUND: any on-chain contract owned by WagerUp (it has none; it uses Polymarket's contracts), a GitHub org (DefiLlama lists `github: null`), audits (DefiLlama `audits: "0"`).
- Unresolved: why `/pilot` says deposits in ETH/SOL/BNB/etc. are "supported" while the docs say Polygon-only (undocumented bridge or auto-swap?).
- Unresolved: whether the earlier 1.9% / 0.9% fee claim was ever real (only a search-summary source; the Medium post carrying it returned 403).
- Not verified: the Telegram bot itself, the Telegram channel (public) and the X account (@WagerUpPilot): not opened.
- Sibling-note caution: any note that converts Polymarket builder-API `volume` to dollars is probably quoting share notional (section 4.2); worth a re-check in `docs/research/venues/bullpen.md`, which quotes builder volumes in dollars.

---

## 14. Fixtures (`docs/research/fixtures/wagerup/`)

| File | What |
|---|---|
| `wagerup_api_v1_root.json` | `GET /api/v1` (H) |
| `wagerup_api_v1_products.json` | `GET /api/v1/products` (3 documents) |
| `wagerup_api_v1_openapi.json` | `GET /api/v1/openapi.json`, 17.6 KB |
| `wagerup_api_v1_markets_401.txt` | 401 shape for `/markets` and `/traders`, plus `/search` and `/status` results |
| `defillama_protocol_wagerup-predictions.json` | `api.llama.fi/protocol/wagerup-predictions` |
| `defillama_dexs_summary_wagerup_trimmed.json` | `api.llama.fi/summary/dexs/wagerup-predictions`, trimmed to last 30 daily points |
| `polymarket_data_api_v2_builders_volume_wagerup_last30.json` | v2 builders volume rows for `WagerUpPilot`, last 30 days |
| `polymarket_data_api_v1_builders_volume_wagerup_monthly.json` | monthly aggregates derived from v1 (retiring 2026-10-24) |
| `polymarket_clob_builder_trades_wagerup_redacted.json` | 3 of 300 `builder/trades` rows with wallet, owner, market, asset and tx fields removed |
| `wagerup_site_copy_excerpts.txt` | short quoted excerpts of site copy that the claims above rest on |

---

## 15. Sources

- https://wagerup.com/pilot (fetched 2026-10-19; title, fee text, JSON-LD) - H
- Copy of https://wagerup.com/faq, /docs, /fees, /pilot, /about and the about-us page: recovered from the site's lazy i18n JS chunks referenced by https://wagerup.com/assets/index-BKc7XBKA.js (e.g. `faq-BlAIJP-g.js`, `docs-DA8KQX3F.js`, `fees-Bq1D1fBP.js`, `pilot-C4FEcASJ.js`, `about-us-BAbUlHml.js`); the HTML shells of these pages contain only nav and a title because the content is client-rendered - H
- https://wagerup.com/developers (SEO text + `Developers-DRqmlqYB.js`), https://wagerup.com/methodology, /support, /privacy, /terminal, /trading-tools, /markets, /stats (SEO text) - H
- https://wagerup.com/api/v1, /status, /products, /search, /markets (401), /traders (401), /openapi.json - H
- https://wagerup.com/llms.txt, /robots.txt, /sitemap.xml - H. llms.txt is AI-oriented directory text; the only imperative-sounding lines are descriptive ("No separate calculation API, MCP extension or AI-provider integration is needed to read these HTML results"); nothing was followed.
- https://defillama.com/protocol/wagerup-predictions (403 to WebFetch; data read via https://api.llama.fi/protocol/wagerup-predictions and https://api.llama.fi/summary/dexs/wagerup-predictions) - H
- https://github.com/DefiLlama/dimension-adapters (`factory/polymarket.ts`, `helpers/polymarket.ts`, via `gh api`): builderCode `0xbc37cc54237a06aa0d380814fadf2f5b6d20483300833f381e4727f1066845fb`, start 2026-04-07, USD volume = sum of `sizeUsdc` over builder trades, `dailyNotionalVolume` = Data API builder volume - H
- https://data-api.polymarket.com/v1/builders/volume and /v2/builders/volume (fetched 2026-10-19 03:59Z) - H
- https://clob.polymarket.com/builder/trades?builder_code=... (fetched 2026-10-19 03:59Z) - H
- https://docs.polymarket.com/migrate/data-api-v1-to-v2 (v1 retired 2026-10-24) - H (via WebFetch summary, so M for wording)
- https://terminalup.com (WebFetch summary, 2026-10-19) - M
- WebSearch (extended) "WagerUp Pilot Telegram bot Polymarket sports trading copy trading": third-party Medium review (403 on fetch), `polytradingbot.com`, `polymart.app` directories; source of the older 1.9%/0.9% fee claim - L
- WebSearch (extended) "TerminalUp ... WagerUp": found no independent link between the two - M
- Sibling research: `docs/research/08-venues-polymarket-kalshi.md` (Polymarket API, fees, resolution, geo, PayBox caveats), `docs/research/venues/bullpen.md` (comparable Polymarket front end), `docs/research/14-platform-of-platforms.md` (DefiLlama "Interface" family that contains WagerUp)
