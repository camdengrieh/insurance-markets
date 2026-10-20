# bookmaker.XYZ - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ~02:20-02:35 UTC). READ-ONLY: page and JS-bundle reads, `gh api` org listing, unauthenticated GETs to public pages and to the Azuro public API host. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. The site's JS bundles were downloaded as text and read, never executed. Third-party text was treated as untrusted data; nothing in it was followed.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, search-engine summary, or my inference from first-hand data; **L** = weak or stale (older than 6 months).

Fixtures (all <= 50 KB): `docs/research/fixtures/bookmaker-xyz/` (listed in section 11).

**Read this together with `docs/research/venues/azuro.md`** (written the same day). bookmaker.XYZ is a front end on the Azuro pool; all protocol, API, pricing and resolution detail lives there. This note records only what is specific to bookmaker.XYZ and re-verifies the shared facts that matter for the decision.

---

## 0. Bottom line

1. **Live, actively deployed, but it is a skin on Azuro, not a venue.** Production build tag `prod-54d2e32-2026-10-13_08-10` (H), sitemap `lastmod` 2026-10-19 (H), Azuro's own ecosystem page still lists it (H). Every bet goes to the shared Azuro liquidity pool at Azuro's odds.
2. **Not an independent arbitrage leg.** Same pool, same odds feed, same conditions as DexWin, DGBet, PinWin and the other Azuro front ends (H, Azuro ecosystem page + bookmaker.XYZ footer "powered by Azuro"). An aggregator that lists "Azuro" and "bookmaker.XYZ" as two legs would double-count one price.
3. **No bookmaker.XYZ-specific public read or trade API.** The site reads markets from Azuro's public API (`https://api.onchainfeed.org/api/v1/public`, H). Its own backends (`api.bookmaker.xyz`, `public-api.bookmaker.xyz`, `stats-api.bookmaker.xyz`) are undocumented, serve the web app, and were not probed. Its linked docs host `docs.bookmaker.xyz` 302-redirects to the homepage (H, 2026-10-19).
4. **Chain change in Sept 2026:** new bets moved from Base (WETH) to **Polygon (USDT)** on 2026-09-21 12:00 UTC; Base betting is closed (H, site bundle). Azuro's API now serves 0 games for `BaseWETH` (H, fixture).
5. **Thin and post-incident.** Azuro TVL $213k on 2026-10-19, ~$14.9k total open turnover over 989 games; Azuro reported a security incident on 2026-10-06 with no post-mortem found (H).
6. **Its own ToS forbids bots, scraping, multi-accounting and bonus abuse and excludes the US and UK** (H, but the ToS text is dated 2024-08-09, so L for currency).
7. **adapter_priority = skip** for a standalone bookmaker-xyz adapter. Whatever is built should be the single Azuro adapter (P2, signal-only per `azuro.md`). In the registry mark bookmaker.XYZ `kind=frontend`, `sharesLiquidityWith=azuro`, and exclude it from leg enumeration.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://bookmaker.xyz/` and `https://bookmakerxyz.app/` | Both HTTP 200, same app, title "Decentralized Sportsbook" (fetched 2026-10-19) | H |
| Build tag in SSR state / Sentry release | `prod-54d2e32-2026-10-13_08-10`: deployed six days before the probe | H |
| `https://bookmaker.xyz/sitemap.xml` | 15 sub-sitemaps, `lastmod` values 2026-10-18 to 2026-10-19 02:15 UTC (events refreshed continuously) | H |
| Feature flags in SSR state | `isMaintenance:false`, `withCasino:false`, `withEsports:true` (fixture `bookmaker_xyz_frontend_config_extract`) | H |
| Azuro ecosystem page | Lists bookmaker.XYZ as a "Predictions App": "The ultimate showcase of pure on-chain betting. No logins, no bans, no limits." (https://azuro.org/ecosystem, 2026-10-19) | H |
| Footer | "(c) 2026 bookmaker.XYZ" | H |
| Live market data | Azuro API serves 971 prematch games (989 active incl. live per navigation) on `PolygonUSDT` (fixtures) | H |
| Incident | Azuro banner (still shown 2026-10-19): "On October 6 2026, Azuro experienced a security incident. The team secured LP funds, and all operations have since been restored." No post-mortem link. (https://azuro.org/app/liquidity) | H |
| Any incident notice on bookmaker.XYZ itself | NOT FOUND (searched: SSR HTML and all downloaded app chunks for "incident", "exploit", "hack", "maintenance", "paused") | H (absence in bundle) |

Verdict: **still_live = true**.

Stale or contradictory items seen (do not trust): the site's SEO copy inside the bundle still describes Azuro as running on Gnosis/xDAI (L, old marketing text); `llms.txt` says "Supports multiple blockchains (Polygon, Base...)" and "no deposits required", while the About page describes a "deposit flow" with email/social login (M, marketing inconsistency; see section 3); a 2025 review says USDT on Polygon, DAI on Gnosis, WETH on Base (L).

---

## 2. Kind and market model

- **Kind (H):** consumer sports front end ("broker-or-frontend") for the Azuro Protocol. Footer: "We are powered by Azuro, the leading decentralized betting protocol". Betting rules link points to Azuro's Rules and Settlements Policy (https://gem.azuro.org/knowledge-hub/additional/rules-and-settlements-policy).
- **Market model (H, per `azuro.md`):** fixed-odds sportsbook against a shared LP pool. Not an order book, not an AMM that bettors trade against, not parimutuel p2p. Game -> Conditions (markets) -> Outcomes. A bet mints an `AzuroBet` token to the bettor; it is a claim, not a tradeable outcome token. Combos supported. Exit before resolution only via Cashout.
- **Catalogue today (H, navigation fixture):** 17 sports slugs: football (637 games), tennis (129), basketball (65), ice hockey (42), CS2 (36), American football (14), volleyball (13), snooker (13), MMA (11), boxing (7), rugby league (6), Dota 2 (5), handball (3), table tennis (3), cricket (2), formula-1 (2), baseball (1). The front-end code still has a `politics` sport slug (id 56) and a pinned politics game id, but the API lists **no politics sport today** (H, navigation) and `withCasino` is false.
- **Front-end-only features (M):** Telegram bot, VIP program, freebets, "50% back if your bet loses" promo (home page text), SideShift-based cross-chain deposit/withdraw flags on (`withSideShiftFullIntegration`, `withShiftWithdrawal`). None change the underlying market.

---

## 3. Chains and collateral

| Chain | Status | Collateral | Tag |
|---|---|---|---|
| **Polygon (137)** | Only chain accepting new bets. `initialAppChainId`, `preferredChainId`, `aaChainId` all 137. | **USDT** `0xc2132d05d31c914a87c6611c10748aeb04b58e8f`, 6 decimals | H (bundle config; matches Azuro docs) |
| Base (8453) | Listed in `supportedChainIds` but **betting closed 2026-09-21 12:00 UTC**; existing bets still redeemable; users told to "convert your WETH to Polygon USDT". Azuro API returns 0 games for `BaseWETH`. | was WETH | H (bundle strings + fixture) |
| Linea, Arbitrum | `stoppedChainIds` in client config | n/a | H |
| Gnosis, Chiliz, BSC | Not in `supportedChainIds` | n/a | H |

- **Account model (M):** login via Privy (email, Google, X, Discord or wallet; `auth.privy.io` and a bundled Privy SDK seen). `aaChainId: 137` implies an ERC-4337 smart account on Polygon for social-login users. "Betting is gasless" (About page, H as a claim; mechanism M: Azuro relayer fee is 0 on Polygon, see section 6). Deposit/withdraw across chains goes through a swap/bridge integration (SideShift flags on; M). The About page says users can alternatively "use your own non-custodial wallet".
- **Polygon contracts the live bundle points at (H that the bundle lists them; M that they are the deployed set after the 2026-10-06 incident, I did not read chain state):** LP `0x0FA7FB5407eA971694652E6E16C12A52625DE1b8`, Core `0xF9548Be470A4e130c90ceA8b179FCD66D2972AC7`, Relayer `0x8dA05c0021e6b35865FDC959c54dCeF3A4AbBa9d`, AzuroBet `0x7A1c3FEf712753374C4DCe34254B96faF2B7265B`, PayMaster `0xeD5760fC2d2f6d363d73e576173e5e8Ca6A877e1`, Cashout `0x4a2BB4211cCF9b9eA6eF01D0a61448154ED19095`. These are identical to `azuro.md`, so the front end did not move to a new deployment after the incident (the bundle is dated 2026-10-13, one week after).
- **Front-end affiliate address (M, taken from the public bundle, unverified on-chain):** `0x82875517c2B4bd534de4B2C0d21BFf5F40b25dA6`. This is the `affiliate` field of the signed `ClientData`; it would let a subgraph query attribute Azuro bets to bookmaker.XYZ. It is public client config, not a user address.

---

## 4. Read API

| Question | Answer | Tag |
|---|---|---|
| Official bookmaker.XYZ API docs | **NOT FOUND** (searched: homepage footer and nav, `/docs`, `/api` (both return HTTP 200 HTML of almost the same size as the SPA shell, so no separate docs content), `llms.txt`, `robots.txt`, sitemap, `docs.bookmaker.xyz` (302 to homepage), github.com/bookmakerxyz (one unrelated 2022 repo `gnosischain.world`, no SDK)) | H |
| `robots.txt` | `Allow: /`, `Disallow: /polygon/profile/`, `/base/profile/`, `/api/` | H |
| bookmaker.XYZ backends in client code | `https://api.bookmaker.xyz` (and `/v2`), `https://public-api.bookmaker.xyz/api/v1`, `https://stats-api.bookmaker.xyz/api/v1`, `https://cms.bookmaker.xyz/api`. Undocumented, for the web app; **not probed** (not documented API hosts). | H (hosts), NOT FOUND (contracts) |
| What the web app uses for market data | Azuro public gateway `https://api.onchainfeed.org/api/v1/public` (SSR cache key `["navigation","https://api.onchainfeed.org/api/v1/public",...]`) and `wss://streams.onchainfeed.org/v1/streams` | H |

**Use Azuro's API.** Docs: https://gem.azuro.org/hub/apps/APIs ; OpenAPI UI https://api.onchainfeed.org/api/v1/public/gateway/docs (details in `azuro.md` section 4). Verified again today with unauthenticated GETs:

- `GET /market-manager/games-by-filters?gameState=Prematch&environment=PolygonUSDT&orderBy=turnover&orderDirection=desc&page=1&perPage=10` -> HTTP 200, `{games[], page, perPage, total:971, totalPages:98}`. Each game: `id`/`gameId` (e.g. `1006000000000091648530`), `slug`, `title`, `startsAt` (unix seconds as string), `state`, `turnover` (decimal USDT string), `sport{sportId,slug,name,sporthub}`, `league{slug,name,isTopLeague}`, `country`, `participants[{name,image}]`. Fixture: `azuro_games_by_filters_PolygonUSDT_prematch_p1_perPage10_2026-10-19.json`. (H)
- Same call with `environment=BaseWETH` -> `{"page":1,"perPage":10,"total":0,"totalPages":0}`. Fixture `azuro_games_by_filters_BaseWETH_prematch_empty_2026-10-19.json`. (H)
- `GET /bet/gas-info?environment=PolygonUSDT` -> `{"gasLimit":715097,"gasPrice":0,"betTokenRate":1,"gasPriceInBetToken":0,"slippage":0.05,"gasAmount":0,"relayerFeeAmount":"0","beautyRelayerFeeAmount":"0.0","symbol":"USDT","decimals":6}`. Fixture `azuro_bet_gas_info_PolygonUSDT_2026-10-19.json`. (H)
- `GET /market-manager/navigation?environment=PolygonUSDT` -> 65 KB sports->countries->leagues tree with `turnover`, `activeGamesCount`. Stored as a derived per-sport summary only. (H)
- **Not fetched (POST rule):** `conditions-by-game-ids` (full odds per outcome, `margin`, `wonOutcomeIds`) and `bet/calculation` (max bet). Schemas are in `azuro.md`.
- Auth: none needed for the GETs above (H). Rate limits: **NOT FOUND** (searched: Azuro docs, response headers); keep <= 1-2 req/s. WebSocket: `wss://streams.onchainfeed.org/v1/streams/feed`, subscribe messages in `azuro.md` section 4.
- Resolution data: `wonOutcomeIds` / `state` on the conditions response (Azuro, M, not fetched here).

---

## 5. Trade path (programmatic)

- **Through bookmaker.XYZ itself: none.** The app is a browser SPA with Privy login; no documented order API. Its ToS prohibits "bots - automatized players" (section 8).
- **Through the protocol underneath (same pool, same odds): yes**, no API key, no account. Flow per `azuro.md` section 5 and confirmed by the bookmaker.XYZ bundle (its Azuro SDK config contains the EIP-712 domain `{name:"Live Betting", version:"1.0.0"}`, types `ClientBetData`/`ClientData`/`SubBet`, fields `attention, affiliate, core, expiresAt, chainId, relayerFeeAmount, isFeeSponsored, isBetSponsored, isSponsoredBetReturnable`): ERC-20 `approve` USDT to the Relayer -> sign EIP-712 `ClientBetData` -> `POST https://api.onchainfeed.org/api/v1/public/bet/orders/ordinar` -> poll `GET /bet/orders/{id}` -> after resolution `LP.withdrawPayout`. (H for the data structures in the bundle; the endpoint flow is H in `azuro.md`; nothing was posted here.)
- An agent using this path would put its **own** (or no) affiliate address in `ClientData`; it would not be "trading bookmaker.XYZ", it would be trading Azuro.

### PayBox reachability: **partial**

- bookmaker.XYZ as a product: **no** (browser login, no order API, bots barred).
- Azuro on Polygon via a PayBox EVM wallet: **yes, technically** (M, reasoned from `docs/research/06-paybox-platform.md`): one `transaction` (USDT approve), one `typedData` signature per bet, one `transaction` per redemption, plus an HTTPS POST from the agent or plugin. Needs USDT on Polygon and a little POL for gas on the approve/redeem. I called no PayBox tool, so funding was not checked.
- Because it is the same pool, this is the Azuro adapter's job, and it is gated by the concerns in `azuro.md` (thin, post-incident, void-on-stale-odds rule).

---

## 6. Fees

- **No bookmaker.XYZ trading fee found** (NOT FOUND: searched ToS, About, VIP page, home page, bundle constants). (H absence; M that none exists)
- **Cost of betting = the margin inside Azuro's odds** (per-condition `margin`, not observed because it needs the POST endpoint) plus a two-decimal odds grid (`azuro.md`). Relayer fee `relayerFeeAmount` is **0** on Polygon today (H, fixture). Front ends earn from the protocol's affiliate share of pool P&L (`azuro.md` section 6), not from a visible bettor fee (M).
- **Promotions that bend effective prices (H, page text):** "Get 50% Back IF YOUR BET LOSES" banner; VIP weekly cashback on net loss **paid in freebets**: 3% at $50k/month volume, 5% at $150k, 7.5% at $300k, 10% at $1M (Apex tier may choose USDT); the VIP page lists "Minimum Odds of 1.35", "No Negative Carryover", "Anti-abuse Rule" headings (bodies not rendered in the static HTML). An arbitrage scanner should ignore promo value and treat quoted odds as the price.

---

## 7. Resolution mechanism and dispute risk

Same as Azuro (H in `azuro.md`): permissioned Data Provider resolves Conditions, AzuroDAO is arbiter of last resort, typical settlement "within two hours of the event's end", postponed/interrupted events void at 1.00 under the Azuro Rules and Settlements Policy, and bets may be voided if the feed carried erroneous odds, wrong status or wrong start time. bookmaker.XYZ adds its own clause (H, https://bookmaker.xyz/docs/terms, "Errors or other defects"): if odds were set incorrectly "due to the incorrect provision of information", "the DAO has the right to call off any winnings and rates". For an arb scanner this is **cancel-the-stale-line risk** on exactly the mispriced quotes it would target. Settlement is on-chain, but front-end ToS can freeze or cancel winnings of "prohibited manner" users.

---

## 8. Geo, ToS, automation

All from https://bookmaker.xyz/docs/terms (H as read; **"Last updated: August 09, 2024" so L for currency**, more than 6 months old) unless stated.

- **Excluded jurisdictions (ToS list, quoted):** includes "Singapore", "Thailand", "Japan", "South Korea", "Russian Federation", "Turkey", "China", "Hong Kong", "Brazil", "United States of America", "UK" among ~50 countries, plus "any other country where online gambling is considered illegal". Users must not use VPN/proxy to override technical restrictions.
- **In-app sign-in message (H, current bundle, Rules version v.2.0.1):** "You are not accessing this app from China, Turkey, Russia, or the USA." plus legal-age confirmation. The two lists disagree, so the effective rule is the stricter ToS list (M).
- **Automation, quoted sparingly:** forbidden "use of 'bots' - automatized players" (fraudulent activities); "use any data mining tools, robots, crawlers, or similar data gathering and extraction tools to scrape or otherwise remove data from the Website"; "Use Multi accounting mechanics"; exploiting "bonuses, freebets, promotions"; and the smart contract may block wallets "using prohibited software". Remedies: terminate access, "freeze, limit and cancel any of your winnings".
- **Reads of Azuro's public API by an aggregator** are not obviously a "scrape of the Website" (the API is documented for third-party builders), but trading through a bot is a ToS violation on the bookmaker.XYZ front end, and `azuro.md` section 8 records similar language plus a US exclusion on the DAO site. Treat as gray for reads and prohibited for automated betting from a US-resident user.
- The scripted page fetches (generic User-Agent) were served normally; no geo-block page was returned to the research probe (H). Geo gating appears to be enforced at sign-in/terms level (M).
- Embedded text aimed at AI agents: `llms.txt` is a plain product description with no instructions (H).

---

## 9. Liquidity (with dates and sources)

bookmaker.XYZ has no separate pool. Numbers are for the shared Azuro pool.

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Azuro TVL | $213,068 total: Polygon $179,032, Linea $18,874, Arbitrum $9,170, Gnosis $4,120, Base $1,873 | `api.llama.fi/protocol/azuro`, 2026-10-19 | H |
| TVL history | peak $2,054,661 on 2026-06-17; $461,319 on 2026-10-06; $231,830 on 2026-10-07; $131-139k on 2026-10-09..12; $279,568 on 2026-10-13 | same | H |
| Settled-bet volume | 30d $2.05M, 1y $9.43M; daily $23k-$295k through 2026-10-06 (e.g. $42k on 10-06); **$0 on every day from 2026-10-07** | `api.llama.fi/summary/dexs/azuro`, 2026-10-19 (adapter counts settled bets only, so a lag is possible) | H, interpretation M |
| Open turnover, Polygon | $14,854 over 989 active games (football $7.9k, American football $3.0k, tennis $2.4k, basketball $1.3k) | `navigation?environment=PolygonUSDT`, 2026-10-19 ~02:30 UTC | H (sum), M (turnover = cumulative stake, not depth) |
| Flow check | Of the 9 games present in both top-10 lists on two probes ~2.5 h apart (~00:10 and ~02:30 UTC), 8 had **identical** turnover and one moved by $0.10 | this session's fixture vs `fixtures/azuro/games_by_filters_PolygonUSDT_prematch_p1_perPage10_2026-10-19.json` | H (data), M (inference: very little betting) |
| bookmaker.XYZ's share of Azuro volume | NOT FOUND (needs the bets subgraph, which is POST GraphQL, filtered by the affiliate address). A search summary of an old Messari report says bookmaker.XYZ accounted for $64.1M cumulative volume, the most among Azuro apps, ~2 years ago. | Messari via search summary | L |
| Max stake per selection | NOT FOUND (needs `POST /bet/calculation`) | | |

Against the P0 bar: far below it.

---

## 10. Event coverage and arbitrage relevance

- **Overlap with other venues:** moneyline / 1X2 / totals on mainstream football (UEFA, domestic leagues), NFL, NBA, tennis, MMA, boxing, which also trade on Polymarket, Kalshi, SX Bet, Overtime, Limitless and others. No politics, crypto-price, macro or weather markets listed today (H, navigation).
- **Price independence:** odds are a bookmaker feed shifted by Azuro's vAMM (`azuro.md`), so useful as a sharp-line reference, not a crowd price.
- **Liquidity sharing: YES** with Azuro and with every other Azuro front end (DexWin, DGBet, PinWin, Giraft, GambleF*kkers, Gamblr.xyz, YezBet). Same pool, same conditions. **Not an independent arbitrage leg.** Does not share liquidity with Polymarket, Kalshi or XO.
- **Integration advice:** one Azuro adapter, with `front_ends=[bookmaker.xyz, dexwin, ...]` as metadata only. If front-end attribution is wanted for analytics, filter Azuro bets by `affiliate` address.

---

## 11. Fixtures saved (each <= 50 KB, 2026-10-19)

In `docs/research/fixtures/bookmaker-xyz/`:
- `azuro_games_by_filters_PolygonUSDT_prematch_p1_perPage10_2026-10-19.json` (8.8 KB, real response)
- `azuro_games_by_filters_BaseWETH_prematch_empty_2026-10-19.json` (59 B, real response, `total:0`)
- `azuro_bet_gas_info_PolygonUSDT_2026-10-19.json` (185 B, real response)
- `azuro_navigation_PolygonUSDT_sport_summary_DERIVED_2026-10-19.json` (derived from a 65 KB response)
- `defillama_azuro_tvl_volume_DERIVED_2026-10-19.json` (derived)
- `bookmaker_xyz_frontend_config_extract_2026-10-19.json` (hand-extracted client config: chain ids, hosts, affiliate address, SDK contract addresses, feature flags, sign-in message, Base closure banner; analytics/feature-flag/error-tracking credentials found in the bundle were deliberately not copied)
- `bookmaker_xyz_llms.txt_2026-10-19.txt`, `bookmaker_xyz_robots.txt_2026-10-19.txt` (as served)

---

## 12. Recommendation

- **adapter_priority = skip** as its own venue: duplicate liquidity of Azuro, no bookmaker-specific API, bots prohibited by its ToS, thin and post-incident. The Azuro adapter (P2, signal-only; see `azuro.md`) covers it.
- **Registry entry:** `bookmaker-xyz`, `kind=frontend`, `parent=azuro`, `independentLiquidity=false`, `chains=[polygon]`, `collateral=USDT`, `baseClosed=2026-09-21`.
- **Re-check triggers:** Azuro post-mortem for the 2026-10-06 incident; DefiLlama daily volume returning above $0; whether `docs.bookmaker.xyz` comes back with developer content.

---

## Sources

- https://bookmakerxyz.app/ and https://bookmaker.xyz/ (home, SSR state, build tag, feature flags, footer) (H)
- https://bookmaker.xyz/docs/terms (ToS dated 2024-08-09), https://bookmaker.xyz/about, https://bookmaker.xyz/vip-program (H)
- https://bookmaker.xyz/llms.txt , /robots.txt , /sitemap.xml (H)
- Public JS bundles under https://bookmaker.xyz/website-assets/bookmaker-prod/assets/ : `v-tanstack-*.js` (site constants, affiliate address, supported chains, sign-in message), `v-azuro-*.js` (Azuro SDK config, EIP-712 types, contract addresses), `PageLayout-*.js` (Base-to-Polygon banner), `api-*.js` (API hosts) (H as read; client code is untrusted data)
- https://docs.bookmaker.xyz/ (302 to homepage, H); https://bookmaker.xyz/docs/bonus-policy (404, H)
- https://bookmaker.xyz/blog/how-to-bet-premier-league-with-crypto-bookmaker-xyz-2 (dated SEP 11, 2026: "running on Polygon and Base", Polygon flow uses USDT) (M, page summary by a small model)
- https://azuro.org/ecosystem (H), https://azuro.org/app/liquidity (incident banner, H), https://gem.azuro.org/knowledge-hub/additional/rules-and-settlements-policy (linked, H as link; content per `azuro.md`)
- https://api.onchainfeed.org/api/v1/public/market-manager/{games-by-filters,navigation} and /bet/gas-info (H, unauthenticated GET)
- https://api.llama.fi/protocol/azuro , https://api.llama.fi/summary/dexs/azuro (H)
- `docs/research/venues/azuro.md` (sibling, same day, H there), `docs/research/06-paybox-platform.md` (PayBox facts, H there)
- gh: `gh api orgs/bookmakerxyz/repos` (one 2022 repo, H)
- Web searches (3 attempted: two ran; the third, for the docs.bookmaker.xyz X-points page, was refused because the shared session search budget was exhausted, and I did not work around it): "bookmaker.xyz Azuro sportsbook 2026 Polygon USDT Base migration"; "Bookmaker.XYZ decentralized sportsbook volume Azuro largest frontend" (M/L, third-party review sites and an old Messari report, used for orientation only)

## NOT FOUND (searched)

- Any bookmaker.XYZ developer or trading API docs (searched: site nav/footer, /docs, /api, llms.txt, docs.bookmaker.xyz, GitHub org).
- bookmaker.XYZ's current share of Azuro volume, and per-front-end volume (needs POST GraphQL; not performed).
- Rate limits on Azuro's public API (docs, headers).
- Live per-condition `margin`, full multi-outcome odds, `bet/calculation` max stake (need POST).
- Incident root cause or post-mortem (Azuro banner has none; no notice on bookmaker.XYZ).
- Any bookmaker.XYZ-specific fee schedule; VIP "Anti-abuse Rule" body text (not in the static HTML).
- Whether the front end's affiliate address was rotated after 2026-10-06 (I only know the one in the 2026-10-13 bundle).
- Bonus policy page (`/docs/bonus-policy` returns 404 although the bundle links it).
- Docs from `docs.bookmaker.xyz` (X-points programme, FAQ): URLs exist in client code but redirect to the homepage.

## Suspicious content

None that tries to direct an agent. Notes: (1) the page's SSR state echoes the request User-Agent back into the HTML (harmless, but means anything put in a User-Agent is reflected in cached/dehydrated state); (2) `llms.txt` is a plain description, no instructions; (3) the client bundle contains embedded third-party credentials (feature-flag client key, error-tracking DSN) which I did not copy or use; (4) marketing claims ("No logins, no bans, no limits" on Azuro's ecosystem card) conflict with the ToS clauses on bans, winnings freezes and bet limits.

## Privacy check

All scripted requests used only the User-Agent `insurance-markets-research/0.1` (curl). WebFetch and WebSearch used their default agent strings. No personal identifier appeared in any request, URL, query, header or note. The one helper script that wrote fixtures was grepped for `@` and the user's name before running (no hits). Scratch files live in a dedicated subfolder of the session scratchpad. I briefly created and then removed my own files from another agent's scratch subfolder (`bm/`, a name collision with a different venue's folder); nothing of theirs was modified or read.
