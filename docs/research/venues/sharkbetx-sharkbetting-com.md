# SharkBetX (Sharkbetting.com) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: unauthenticated GETs of public pages, public static JS and documented public API hosts (Polymarket Gamma and CLOB, for the underlying-data check only), `gh api` search of GitHub. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation. Generic User-Agent `insurance-markets-research/0.1` only. All third-party text was treated as untrusted data; no instructions aimed at AI agents were found.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak, stale or unresolved.

Limits of this research (read first):
- **WebSearch was unavailable** (the shared session budget was exhausted), so there was no independent press, review or regulator coverage. Everything below is first-party operator material plus Polymarket's public API.
- **The `sharkbetx.com` robots.txt says `Disallow: /api/`.** I fetched `GET /api/health` and `GET /api/markets` before I had read robots.txt (two requests; `/api/markets` returned 404). After reading it I made no further `/api/` calls. The health response also listed third-party wallet addresses; I did not record or store them and deleted my local copy. I name only aggregate counts below. No SharkBetX API response is saved as a fixture for that reason.
- The `Terms` and `Privacy` pages of `sharkbetx.com` redirect to a login (307), so only the docs-hosted Wallet Terms were read.
- On-chain checks of the vault were not possible: Blockscout answered HTTP 403 (Cloudflare challenge), Polygonscan was not tried, and JSON-RPC needs POST. Contract addresses below are copied from the operator's docs and are **not independently verified**.

---

## 0. Bottom line

1. **SharkBetX is live (2026-10-19) but it is a front end on Polymarket, not an independent venue.** Its "Exchange" mode is a back/lay UI over the Polymarket sports CLOB. The operator's own FAQ says it routes orders to "the Polymarket CLOB" as "an official Polymarket Builder", and the site's CSP allows connections to `*.polymarket.com` (H). Its stream pool ids are 25 of 25 Polymarket sports series ids (H, fixture `sharkbetx_stream_series_ids_to_polymarket_sports_2026-10-19.json`). **Liquidity is Polymarket's. It is not an independent arbitrage leg.** Register it as an alias/front end of `polymarket` with `independent=false`.
2. **No public API.** No developer docs, no API key programme, no OpenAPI. The web app calls undocumented `/api/*` routes, most behind a wallet-signed session token, and robots.txt disallows `/api/`. Neither SharkBetX nor sharkbetting.com sells data access.
3. **A second, smaller product exists: "SharkBetX Classic"** (`/classic`, 440 markets in its stream pool at the time of the health snapshot). The Wallet Terms say it routes offers to "a betting exchange operated by our exchange partner", unnamed. Its stream and orders are authenticated. My inference from the operator's own comparison table and from client-bundle field names is that the partner is an Orbit-pool exchange (Betfair-equivalent, "96ex") (L). Even if so, that liquidity is Betfair-like, not independent of Betfair.
4. **sharkbetting.com** is a matched-betting/odds-comparison SaaS (30+ bookmakers, Betfair, SharkBetX lay prices; free tier, EUR 49/month Pro). It is an odds-comparison competitor, not a data source: no API, and its Terms prohibit scraping for commercial or competitive use.
5. **Verdict: adapter_priority = skip.** Duplicate liquidity (Polymarket), no API, custodial operator vault in the middle, extra commission. The correct integration for this liquidity is the Polymarket adapter. Two small leads are noted in section 12.

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://sharkbetx.com/` 2026-10-19 | HTTP 200, 20,311 bytes, Next.js app, `server: Apache`. Headline: "An official Polymarket Builder for sports betting". Fixture `sharkbetx_landing_text_2026-10-19.txt` | H |
| `GET https://sharkbetx.com/docs/` and its pages | HTTP 200 (VitePress docs). Wallet Terms version `v5-2026-09-21-classic`, effective 21 September 2026, i.e. edited within the last month | H |
| `GET https://www.sharkbetting.com/` | HTTP 200 (63,925 bytes). `https://sharkbetting.com/` 308-redirects to `www`. `/visit/sharkbetx` 307-redirects to `https://sharkbetx.com`. Fixture `sharkbetx_robots_and_redirects_2026-10-19.txt` | H |
| Public health JSON on the SharkBetX host, 2026-10-19T03:52Z (see limits above) | `ok:true`; 12 live stream clients from 8 distinct IPs; 6 stream pools; the "classic" pool carried 440 markets; dependencies listed: `sb-odds-service`, `sharkbetting-wallet`, `gamma-api` (Polymarket's Gamma host), all ok | H (snapshot) |
| Sharkbetting page dates | Methodology updated 2026-04-29; SharkBetX guide and exchange-liquidity article "updated September 17, 2026"; Polymarket fee calculator "rates verified July 25, 2026" | H |
| GitHub (`gh api search/repositories`, `search/code`) for `sharkbetx`, `sharkbetting`, `UserVault sharkbetx` | 0 results each. No public source repo | H |

**still_live: true.** Beta service per its own terms ("The Service is currently in beta ... betting limits may apply").

## 2. Kind and market model

- **Kind:** (a) "SharkBetX Exchange" = Polymarket Builder front end plus an operator-run custodial vault (UserVault on Polygon). (b) "Poly Direct" = same UI, but you trade your own Polymarket Safe wallet with your own CLOB credentials. (c) "Classic" = routed to an unnamed partner exchange. (d) sharkbetting.com = SaaS odds comparison. The discovery label `sportsbook-exchange` is a loose fit.
- **Market model (Exchange/Poly Direct):** inherited from Polymarket: binary YES/NO outcome tokens on a CLOB with decimal-odds display. "Back" = buy the outcome; "Lay" = bet against it (on Polymarket this is the opposite token, M inference). A 3-way soccer match is three binary markets (Home/Draw/Away); the live Gamma sample shows three `moneyline` markets for one match (H, fixture `polymarket_gamma_event_epl_not_ars_ended_2026-10-18.json`). Tick size 0.001 on that sample.
- **Coverage claimed:** "20+ leagues"; the operator's guide lists match winner (2-way and 3-way), full-time Over/Under 2.5, Both Teams To Score, "To Advance / To Qualify", and winner/outright markets for football, NBA, NFL, NHL, MLB, tennis, UFC. Not covered: handicaps/Asian lines, Draw No Bet, half-time, player props (H, https://www.sharkbetting.com/guides/sharkbetx). Polymarket itself lists many more market types (spreads, totals, props) than SharkBetX exposes.
- **Order types (docs):** GTC (default) and FAK. A bet can be cancelled only before it fills (H, https://sharkbetx.com/docs/placing-bets.html). Minimum bet "typically around 1 USDC".
- **Netting:** all bets on one event form one "position"; opposite bets on the same outcome offset and commission applies to the net profit only (H, https://sharkbetx.com/docs/settlement.html).
- **Classic:** back/lay ladder with live-betting delay, dead-heat rules, "bad trade" voiding at the operator's discretion, in USDC (H, Wallet Terms section 12).

## 3. Chains and collateral

- **Chain:** Polygon PoS mainnet (chainId 137) only (H, https://sharkbetx.com/docs/faq.html).
- **Collateral:** bridged USDC (USDC.e) `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`; native USDC `0x3c49...3359` is explicitly "will not work" (H, https://sharkbetx.com/guides/getting-started). Gas in POL. Gas for Poly Direct Safe creation is covered by the operator.
- **Operator contracts (copied from docs, NOT independently verified):** UserVault proxy `0xeF6dd84e30D49d0CF1C69b96dE4F1cA2d507Fd6b`, UserVault V8 implementation `0xF9741EA7632d09adB30382cc89DBd1760618A79A`, Governance Safe `0x60676e7C0fAb393B8Fe5596694048F665f5A789b` (H as to what the docs say; https://sharkbetx.com/docs/fund-security.html).
- **Custody model (Exchange mode):** deposits go to the UserVault. "Client funds released for execution can only go through the configured Trading Safe ... The Trading Safe is the Polymarket funder wallet used for CLOB orders and settlement liquidity." So user money is pooled in an operator-controlled Polymarket account while bets are open; the contract enforces withdrawal-address binding (change needs a 48 h wait), a lock on open risk, and atomic settlement transfers. "The backend calculates trading and settlement results"; the contract enforces custody boundaries. A TimelockController exists "but it is not the active upgrade owner today"; upgrades are by the Governance Safe (H, fund-security page). Trust is therefore in the operator's backend and Safe signers, not purely in code.

## 4. Read API

**Official public API: none.** (NOT FOUND, searched: sharkbetx.com landing page and nav, `/docs/` sidebar (Getting Started, Placing Bets, FAQ, Settlement, Deposits, Fund Security, On-Chain Audit, Wallet Terms), `/guides`, sharkbetting.com nav/footer/help/pricing/about/sitemap (2,376 URLs), GitHub org/code search. The sharkbetting.com comparison pages list "API access" as a criterion but publish no SharkBetting API.)

| Item | Finding | Tag |
|---|---|---|
| Docs URL | https://sharkbetx.com/docs/ is user documentation only (no endpoints) | H |
| Undocumented app routes | String literals in public client bundles, none called by me: `/api/bet-stream/public`, `/api/bet-stream/top-events`, `/api/classic/bet-stream/public`, `/api/classic/stream` (EventSource, needs a `?ticket=` from `POST /api/auth/classic-stream-ticket`), `/api/classic/catalogue`, `/api/classic/order-preview`, `/api/classic/orders`, `/api/bets/clob`, `/api/balances`, `/api/vault/*`, `/api/auth/challenge`, `/api/auth/session`, `/api/config`, `/api/polymarket/book`, `/api/polymarket/fx`. Full name list in fixture `sharkbetx_client_api_route_names_not_called_2026-10-19.txt` | H (names), unknown (behaviour) |
| Auth on those routes | Wallet-signed challenge/session, then header `x-wallet-token`; Classic stream uses a one-time ticket | H (from bundle) |
| robots.txt | `User-agent: *  Allow: /  Disallow: /api/` on both sharkbetx.com and www.sharkbetting.com (which also disallows `/clerk/`, `/admin/`, etc.). Fixture `sharkbetx_robots_and_redirects_2026-10-19.txt` | H |
| Rate limits | Server-side "fair use" limits exist for the live odds stream (health JSON: `liveBytesPerDay` 64,424,509,440, `liveOpensPerHour` 600, `liveConcurrent` 8, `maxConnectionsPerIpLimit` 64) but are not published as a contract; delayed odds refresh every 30 s for non-qualifying clients | H (numbers), M (meaning) |
| WebSocket | Not offered; the app uses Server-Sent Events | H |
| Sharkbetting odds feed | Pro "10-second refresh", Free "8-minute refresh" inside the web app only; Terms section 11 prohibits scraping | H |

**Where to read the same prices legitimately:** the Polymarket Gamma and CLOB public APIs (documented, keyless). Confirmed 2026-10-19 (these are Polymarket's shapes, fixtures saved):
- `GET https://gamma-api.polymarket.com/sports` returns 484 league rows `{id, sport, name, resolution, ordering, tags, primaryTagId, series, createdAt}` (153,804 bytes; first 5 saved).
- `GET https://gamma-api.polymarket.com/events?series_id=12185&closed=false&limit=6&order=startDate&ascending=true` returns events with `markets[]` carrying `sportsMarketType`, `clobTokenIds`, `outcomePrices`, `bestBid/bestAsk`, `feesEnabled`, `feeSchedule`, `resolutionSource`. Trimmed fixture `polymarket_gamma_event_nfl_was_sf_trimmed_2026-10-19.json`.
- `GET https://clob.polymarket.com/book?token_id=<id>` returns `{market, asset_id, timestamp, hash, bids[], asks[]}` with string price/size. Fixture `polymarket_clob_book_nfl_was_sf_moneyline_2026-10-19.json`.

## 5. Trade path and PayBox reachability

- **Programmatic trading via SharkBetX:** none documented. The only route is to drive the web app's private API with a wallet-signed session (terms-acceptance message "SharkBetX Wallet Terms v5-2026-09-21-classic / Address / Vault", then challenge/session signatures, then `POST /api/bets/clob`). Message formats beyond the terms text were not read. Doing this would be scripting an undocumented, robots-disallowed API of a beta product (not recommended).
- **Poly Direct** is literally Polymarket: "Click Activate trading (creates a Safe wallet) ... Generate credentials (one MetaMask signature) ... you sign every order directly". An agent that wants this should use the Polymarket CLOB client directly and attach its own Builder code.
- **PayBox:** Polygon (137) is in PayBox's chain catalog (H, `docs/research/06-paybox-platform.md`, "not a support allowlist"). Deposits would be ordinary EVM transactions (USDC.e approve + vault deposit + POL gas). Message and typed-data signing exist via `request_wallet_sign` (H, same file). So an EVM wallet could in principle deposit and sign the session messages, but no documented order API exists. **paybox_reachable = partial** (funding path yes, trading path only through an undocumented API). It is pointless to take this path: the same liquidity is reachable on Polymarket directly without the operator vault, the 3% commission or the omnibus-account risk.

## 6. Fees

| Fee | Value | Tag |
|---|---|---|
| SharkBetX commission (marketing, help, guide, calculators) | "Flat 3% on net winnings only; losing bets pay nothing; no premium charge" | H (as stated) https://www.sharkbetting.com/help |
| SharkBetX commission (product docs) | **2%** of net position profit "locked in at bet placement"; weighted average if several rates | H https://sharkbetx.com/docs/settlement.html |
| SharkBetX commission (docs FAQ) | "set per account and locked in when you place the bet" | H https://sharkbetx.com/docs/faq.html |
| Classic commission | "at the rate shown in the order review before you confirm"; a portion of winnings may be held after settlement | H Wallet Terms, Classic rules s.7 |
| Poly Direct | no SharkBetX commission; "only standard exchange fees apply" | H |
| Polymarket taker fee underneath | Gamma `feeSchedule` on 2026-10-19: NFL moneyline `{rate 0.03, exponent 1, takerOnly true, rebateRate 0.15}`; EPL moneyline `rate 0.05` (H, fixtures). Formula per Sharkbetting's calculator: shares x rate x p x (1 - p) (M) | H / M |
| Who pays | The bettor. Whether Polymarket's taker fee is charged in addition to SharkBetX commission in Exchange mode is **NOT FOUND** (the client config carries `polymarketFeeRateBps` and `oddsDisplayMode: gross`, which suggests the displayed odds account for it) | L |
| Volume rewards | "SharkRewards": USD 25,000 counted monthly volume = 50% off Pro; USD 50,000 = free Pro; each bet counts the smaller of win and liability; a variable "SBX" reward "from 100,000 a month" is "coming soon" (token/points details NOT FOUND) | H |
| Gas | POL, typically under USD 0.01 per tx (operator claim) | M |

**Conflict to flag:** 3% vs 2% vs "per account". The adapter must not hard-code a rate. For arbitrage maths use Polymarket's schedule plus a conservative 3%, and treat any SharkBetX figure as unverified.

## 7. Resolution and dispute risk

- **Exchange/Poly Direct:** resolution is Polymarket's. The operator: "the exchange resolves the market", then PnL, commission, balance update and a "settlement receipt hash" are recorded. Sample Gamma markets show `resolutionSource` = the league's official site (e.g. `nfl.com/scores`, `premierleague.com`) and `umaResolutionStatus: resolved` on the finished EPL match (H, fixtures). Voided/postponed matches: "bet is cancelled and locked funds are returned".
- **Operator layer risk:** "settlement" in the vault is computed off-chain by the operator's backend and then applied atomically on-chain, with a hash fingerprint of each bet. That makes records auditable, not the calculation trustless. Wallet Terms: Service "as is", liability capped at the greater of 12 months of fees or USD 100, may suspend or terminate "at any time, with or without cause or notice" (H).
- **Classic:** operator/partner rules: grading from "designated information providers", late-start trades voided, "bad trade" voiding, "SharkBetX's determination is final", "where a rule is not covered ... the rules of the exchange on which the bet was matched apply" (H, Wallet Terms s.12, Classic rules s.2 and s.6).
- Dispute risk is therefore Polymarket's plus a layer of operator discretion; the "on-chain settlement you can verify" claim is true of deposits, withdrawals and logged PnL only.

## 8. Geo, ToS and automation

- **Wallet Terms (v5-2026-09-21-classic):** must be 18+ and "not located in, resident in, or a citizen of any jurisdiction where use of the Service or prediction-market trading is prohibited". No country list. Governing law "the jurisdiction designated by SharkBetX for this version" (unnamed). Third parties: "Use of those venues [incl. Polymarket] is subject to their own terms". Operator legal entity: **NOT FOUND**.
- **Polymarket's geo rules apply underneath** (covered by the parallel Polymarket workflow). No SharkBetX geo-block behaviour was tested.
- **Automation:** no explicit bot/API clause found in the Wallet Terms (NOT FOUND). robots.txt disallows `/api/`.
- **sharkbetting.com Terms (Malta law):** "strictly prohibited from scraping, harvesting, copying, or otherwise extracting data from Sharkbetting ... automated systems (e.g., bots, crawlers, scripts, or scraping tools) ... for commercial or competitive purposes" (H, https://www.sharkbetting.com/terms section 11). A competing aggregator must not scrape it.
- Sharkbetting says it is "not a gambling operator" and holds no licence (H, /about).

## 9. Liquidity (with dates)

- **SharkBetX's own volume, OI or TVL: NOT FOUND.** No volume figure on any page; vault balance not checked (see limits).
- **Usage signal (M):** 12 concurrent streaming clients and 12 wallets in the fair-use table on 2026-10-19 03:52Z implies a very small active user base. A single snapshot says nothing about daily volume.
- **Underlying Polymarket liquidity (H, Gamma and CLOB, 2026-10-19, not SharkBetX's):**
  - NFL Commanders vs 49ers (2026-10-20): event volume USD 229,673, open interest USD 180,144; moneyline market volume USD 15,632. CLOB snapshot (timestamp 1792382209886): best bid 0.21 for 859,968 shares, best ask 0.22 for 228,031 shares; about USD 359k of bid notional and USD 590k of ask-side notional on the book.
  - EPL Nottingham Forest vs Arsenal (ended 2026-10-18): event volume USD 13.73M, OI USD 5.84M.
  - UCL match `ucl-sf-bvb-2026-10-20` (2026-10-20): event volume USD 8,315 pre-match, so thin outside the top fixtures.

## 10. Event-category overlap (where arbitrage exists)

Sports only (football incl. top European leagues and UCL/UEL, NBA, NFL, NHL, MLB, tennis, UFC, cricket series exist in the Polymarket feed). No politics, crypto-price or macro surface on SharkBetX. Overlap is with: Polymarket (identical), Kalshi sports, SX Bet, Betfair/Smarkets/Matchbook, and the 30+ bookmakers Sharkbetting compares. Any cross-venue edge involving SharkBetX is really an edge involving Polymarket; no separate price exists to scan.

## 11. Shared liquidity

**Exchange and Poly Direct: 100% shared with Polymarket** (same CLOB, same tokens, same order book; the operator also nets users internally before routing). **Classic: unnamed partner, likely Betfair-equivalent pool (L)**, and thus not independent of Betfair. `liquidity_shared_with = polymarket` (and, for Classic, probably Betfair via an Orbit pool).

## 12. Priority and leads

**adapter_priority: skip.** Do not build a SharkBetX adapter. Instead:
1. Add `sharkbetx` to the platform registry as an alias/front end of `polymarket` (`independent=false`, no separate pricing).
2. Lead (M): the operator's Builder programme claim suggests a Polymarket Builder code is how it earns on routed volume. If this project's plugin ever routes Polymarket orders, attribution via its own Builder code is a revenue/branding lever (Polymarket docs: the code "is serialized onchain as part of the signed order"; https://docs.polymarket.com/developers/builders/builder-intro). Whether builders can add fees: **NOT FOUND** on that page.
3. Adjacent venue the discovery list may not have: **96ex** (formerly BFB247), a Betfair-equivalent exchange described by Sharkbetting as sharing a pool "via Orbit" (M, operator comparison table). Likely `independent=false` vs Betfair, fiat/crypto custodial, probably skip.

## 13. NOT FOUND and open questions

- Operator identity, jurisdiction, licences (searched: Wallet Terms, docs, About, sharkbetting.com Terms).
- The real commission rate (3% vs 2% vs per-account) and whether Polymarket's taker fee is added.
- The partner exchange behind Classic, its liquidity, and whether Classic is retired (client bundle labels old transfers "Moved to Classic (retired)", yet the Terms v5 dated 2026-09-21 are Classic-specific and the stream pool had 440 markets) (L).
- Client-bundle fields `sxBetScenarioPnl`, `orbitScenarioPnl`, `externalHedgeScenarioPnl`, `matchedHouseAccountBetCount`, `protectedPositionUsd` suggest house-account hedging on SX Bet and an Orbit exchange (L inference; could be admin code shipped to the client). If true, the operator can take the other side of user bets, which contradicts "pure order-book" marketing.
- Vault TVL and solvency figure ("platform's on-chain solvency coverage" page): not read, Blockscout blocked.
- Behaviour of the private API; not probed (robots, auth).

## 14. Fixtures (all under `docs/research/fixtures/sharkbetx-sharkbetting-com/`, each <= 19 KB)

- `sharkbetx_landing_text_2026-10-19.txt`, `sharkbetx_docs_settlement_faq_deposits_text_2026-10-19.txt`, `sharkbetx_docs_fund_security_text_2026-10-19.txt`, `sharkbetting_guide_sharkbetx_text_2026-10-19.txt`, `sharkbetx_robots_and_redirects_2026-10-19.txt`
- `sharkbetx_client_api_route_names_not_called_2026-10-19.txt`, `sharkbetx_stream_series_ids_to_polymarket_sports_2026-10-19.json`
- Polymarket underlying data: `polymarket_gamma_sports_first5_of_484_2026-10-19.json`, `polymarket_gamma_event_nfl_was_sf_trimmed_2026-10-19.json`, `polymarket_gamma_event_epl_not_ars_ended_2026-10-18.json`, `polymarket_clob_book_nfl_was_sf_moneyline_2026-10-19.json`

## 15. Sources (all fetched 2026-10-19)

- https://sharkbetx.com/ ; https://sharkbetx.com/robots.txt ; https://sharkbetx.com/guides ; https://sharkbetx.com/guides/getting-started ; https://sharkbetx.com/exchange ; https://sharkbetx.com/classic ; https://sharkbetx.com/polydirect (H)
- https://sharkbetx.com/docs/ , `/docs/getting-started.html`, `/docs/placing-bets.html`, `/docs/settlement.html`, `/docs/deposits.html`, `/docs/fund-security.html`, `/docs/on-chain-audit.html`, `/docs/faq.html`, `/docs/wallet-terms-v5-classic.html` (H)
- Public client JS under `https://sharkbetx.com/_next/static/chunks/` (route names and field names only) (H)
- https://www.sharkbetting.com/ , `/guides/sharkbetx`, `/help`, `/about`, `/pricing-public`, `/terms`, `/robots.txt`, `/sitemap.xml`, `/calculators/polymarket-fee`, `/methodology`, `/alternatives/prediction-markets` (H as to what the operator says; promotional, so claims are M)
- https://gamma-api.polymarket.com/sports , `/events?...` ; https://clob.polymarket.com/book?token_id=... (H)
- https://docs.polymarket.com/developers/builders/builder-intro (via WebFetch summary, M)
- Local: `docs/research/06-paybox-platform.md` (PayBox chain catalog and `request_wallet_sign`, H from that note)
