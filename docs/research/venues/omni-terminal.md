# Omni Terminal / "Omni Outcomes" (omniterminal.app) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ~04:15-04:35 UTC). READ-ONLY: unauthenticated GETs of public pages, static JS read as text (nothing executed), documented public API GETs, DefiLlama GETs, `gh api` raw file reads. No account, sign-up, wallet, key, signature, POST/PUT/DELETE, payment or PayBox money/signing tool was used. No browser automation. WebSearch budget was exhausted when I tried one extended search, so there is **no independent news/social check** (recorded under NOT FOUND). I did not call any `omniterminal.app/api/*` route (robots.txt disallows `/api/`; the outcomes routes are undocumented).

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, inferred or my computation from first-hand data; **L** = weak or stale.

---

## 0. Bottom line

1. **Omni Terminal is a Hyperliquid trading terminal and data business; "Omni Outcomes" is its front end for Hyperliquid HIP-4 outcome markets.** It has no order book, contracts, tokens or settlement of its own. Orders would go to Hyperliquid with Omni's builder code attached (H: builder address, fee and `approveBuilderFee` flow in the shipped page and bundle; DefiLlama tags the listing "Hyperliquid HIP4 Builder").
2. **Liquidity is 100% shared with Hyperliquid HIP-4. It is NOT an independent arbitrage leg.** Counting it would double-count the same books as `docs/research/venues/hyperliquid-outcomes-hip-4.md`.
3. **Actual usage through Omni is nil.** DefiLlama's builder-code accounting shows **$55.11 of outcome volume, on a single day (2026-05-12), and $0 on every other day to 2026-10-18** (H, fixtures). Other Omni Terminal volume is also small (perps builder volume ranges from $0 to ~$117k/day in samples; H).
4. **No outcome-specific public API.** Omni's documented public API (OpenAPI 1.4.0) covers news, market regimes, builder-fee totals, a wallet profile, Ask Omni and an instruments catalogue. The catalogue (`GET /terminal/instruments`) mirrors HyperCore's outcome universe (334 contracts) but adds nothing a direct Hyperliquid read does not give (H).
5. **Verdict: adapter_priority = skip.** Build the Hyperliquid HIP-4 adapter (rated P1 in the sibling note) and ignore Omni, except as (a) a builder-code attribution label and (b) a secondary, human-readable decoding of HL outcome titles and rule text (only available from the HTML page, see section 4).
6. The DefiLlama row "Omni Terminal Outcome" (listed 2026-10-08) is **auto-split from the builder's single address** in DefiLlama's Hyperliquid factory adapter: every builder gets Perps/Spot/Outcome rows (H, `factory/hyperliquid.ts`: `"omni-terminal-outcome": { builder: "omni-terminal", market: "outcome", start: "2026-05-02" }`). It is not evidence of an independently launched outcome venue.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://omniterminal.app/outcomes` (not in sitemap, not robots-disallowed) | HTTP 200, title "Omni Outcomes - Hot markets", meta "Discover live Hyperliquid outcome markets. Clear choices, wallet trading and reconciled results." Server-rendered data stamped `discoveredAt` 1792383819166 = **2026-10-19 04:23:39 UTC**; badge "HIP-4 - mainnet"; "208 listed events, 334 / 334 contracts covered"; 542 `status:"active"` strings | H (fixture `omni_outcomes_page_ssr_config_excerpt.txt`) |
| Sitemap `lastmod` | 52 URLs listed; 17 share the newest `lastmod` 2026-10-15; Privacy and Cookies "Last updated 15 October 2026"; **Terms last updated 2/24/2026** | H |
| Public repos `InTheta/omni-universe-sdks` (MIT, created 2026-08-04, pushed 2026-10-15) and `InTheta/hl-vault-sdk` (MIT, created 2026-08-01, pushed 2026-10-15), both 0 stars, not archived | Active development | H (`gh api`) |
| DefiLlama protocol list (8,758 rows) | Three Omni rows (Perps, Spot, Outcome), category "Interface", parent `parent#omni-terminal`; Outcome and Spot `listedAt` 1791497922/3 = 2026-10-08 22:18 UTC | H |
| Hint "[H] DefiLlama Interface (2026-10-08)" | Confirmed, but see 0.6 (auto-split row) | H |

Verdict: **still_live = true** (site, catalogue and outcomes UI are up and refreshed). Real outcome trading through Omni is **not evidenced** (section 10).

---

## 2. Kind and market model

- **Kind:** `broker-or-frontend`. Omni Terminal = "trader-built market intelligence and execution platform": Hyperliquid terminal (charts, orderbook, funding, liquidations, wallet clustering, AI news), x402 pay-per-request APIs, Hyperliquid Data API, upcoming hosted node, invite-only IBKR paper beta (H, `llms.txt`, `/products`). The trading-terminal landing page lists "Live execution: Hyperliquid perps, HIP-3 markets, outcomes, and predictions" (H, https://omniterminal.app/hyperliquid-trading-terminal). The terminal docs say "Outcomes and Pro have different flows ... availability is network, territory and permission dependent" (H, /docs/guides/getting-started).
- **Market model = Hyperliquid HIP-4, not Omni's:** fully collateralised binary outcomes, Yes/No tokens on a merged CLOB on HyperCore, categorical via "questions" (Omni shows 174 outcome events + 34 question events = 208 events over 334 contracts, H). Tokenisation as in the HL note: `encoding = 10*outcome + side`, coin `#<encoding>`, token `+<encoding>`, order asset id `100_000_000 + encoding`. Omni's page shows the same fields per choice (`coin:["#142890","#142891"], token:["+142890","+142891"], asset:[100142890,100142891]`, H fixture).
- **Venue/deployer labels Omni attaches (H, page filter "Venue"):** `out` (Outcome.xyz) 80 events, `txyz` (trade.xyz) 62, `skew` 61, `protocol` (Hyperliquid's recurring markets) 5. These are the HIP-4 deployers; resolution is theirs (section 7).
- **Templates present in the catalogue (H, counts of 334 contracts):** binaryPrice 110, sportsContestParticipant2 50, sportsTournamentParticipant 34, fallback 33, sportsContestDraw2 25, sportsContestWinner 24, priceTouch 13, companyIpoFirstDayMarketCap 10, awardCandidate 7, sportsSpread 5, sportsTotal 5, companyIpoConfirmed 3, policyRateDecrease/Increase/NoChange 2 each, Recurring 4, plus a few others.
- **Tick / min order:** catalogue precision `price_step 1e-05`, `size_step 1` (integer shares); page config `minimumNotional "10"` (units presumably USDC) and `slippageBps 100` (H, fixtures). Official HL docs do not state tick or min notional (see HL note).

---

## 3. Chains and collateral

- **Venue chain:** Hyperliquid L1 / HyperCore (not an EVM chain). Omni adds no chain of its own (H).
- **Collateral:** page data says `quoteToken:"USDC"`, `collateralDecimals:8` per choice (H). **Conflict:** Omni's own instruments API labels the same contracts `quote: "USDH"` / symbol `hyperliquid:outcome-<id>:USDH:outcome` (H). The HL note concludes USDC is current and USDH retired (M). Treat the instruments API quote label as stale and read the collateral from Hyperliquid, not Omni.
- **Funding path (H, /docs/guides/fund-and-withdraw, /getting-started):** native bridge = **Arbitrum** (mainnet) / Arbitrum Sepolia (testnet); an embedded LI.FI route with "a narrow live-proven source/destination contract" also exists. "In Outcomes, wallet bridge funding first credits Core perps; a separate move funds Outcomes." Withdraw from Core via the Pro terminal.
- **Login/auth:** wallet-signature login (+ optional 2FA), or Google/email session (which cannot authorise funding). "Enable Trading" needs an agent approval and a builder-fee approval; "Omni API stores the agent key encrypted" (H: bundle string; docs: "Stored agent keys are trading authority only"). That is a **custodial-ish trust point** (Omni holds a trading-only agent key).

---

## 4. Read API

- **Docs:** https://omniterminal.app/docs/api and OpenAPI https://omniterminal.app/openapi.yaml (v1.4.0, 54 KB, H). Primary host `https://api.omniterminal.app` (app-host compatibility route `https://omniterminal.app`; dev `https://dev.omniterminal.app`). robots.txt `Disallow: /api/` applies to the app host.
- **Public, unauthenticated, documented (H):**
  - `GET /health` -> `{"status":"running"}`.
  - `GET /terminal/instruments?exchange=hyperliquid` -> `{symbols[], instruments{}}`; **HTTP 200, 5.19 MB** (1,008 symbols: 341 perp, 333 spot, **334 outcome**). Outcome symbol `hyperliquid:outcome-<outcomeId>:USDH:outcome`; each carries `asset_id` (100,000,000 + encoding), `coin_name` (`#114220`), precision, and `outcome_market.outcome{outcomeId, sideIndex, outcomeName (template id), outcomeDescription (raw HL key:value string), questionId, isSettled, mid}` plus both `outcomeSides`. **Many mids are the 0.5 default (no book)**; `mid` is a mirrored HyperCore mid, not a quote with depth. The doc itself says "Catalog presence does not prove prices or trading readiness." Fixture: `omni_terminal_instruments_outcome_sample.json` (trimmed, 14 KB; full body not saved).
  - `GET /terminal/market/candles/{exchange}/{symbol}`, `GET /terminal/news`, `GET /terminal/news/{symbol}`, `GET /integrations/defillama/v1/builder-fees`, `GET /api/hl/public-profile` (wallet profile; not used here), `GET /api/market-regimes/*`.
  - WebSockets (`/terminal/ws/market/{trades|ticker|orderbook|orderbook-l4|candles|liquidations|funding}/{exchange}/{symbol}`) are documented for Hyperliquid perps; **outcome coverage not stated** (NOT FOUND).
- **Hyperliquid Data API** (`https://api-data.omniterminal.app`): public `GET /api/v1/health` (-> `{"status":"healthy","service":"hyperliquid-data-api"}`, H) and `GET /api/v1/ws/topics` (2.6 KB catalogue of typed WS routes: trades, bbo, L2/L4 books, candles, liquidations, positions, fills, twap; symbols shown are perps, **no outcome topic listed**, H). Positions and clearinghouse reads need a provisioned `x-api-key` with `hl_data:read` (commercial product, H).
- **Authenticated / paid:** News API (`x-api-key`, Pro 2 / Enterprise 10 concurrent sockets, rate-limit headers documented only for news), x402 gateway on Base (13 paid HTTP products, none outcome-related; OpenAPI https://omniterminal.app/openapi-x402.yaml, 59 KB, grep for outcome/HIP-4/prediction: no hits), Ask Omni (API key). I did not trigger any 402.
- **Undocumented first-party outcome routes:** the Outcomes page bundle calls `/api/outcomes/{id}`, `/api/outcomes/community/{id}`, `/api/outcomes/masters?network=`, `/api/outcomes/time` and `/api/hl/agent/key?masterAddress=` (H, static JS read as text). They are under robots-disallowed `/api/`, undocumented and some are session-bound. **Not called.** Not a supported integration surface.
- **Best read path for the aggregator:** go to Hyperliquid directly (WS `l2Book`, `trades`, `bbo`, `allMids`, `outcomeMetaUpdates`; REST `POST /info`), per the HL note. The only Omni-unique data is the per-event title/category/rules text decoded from HL's raw descriptions, available only in the HTML page's server-rendered data (not a stable API).
- **Rate limits for the instruments/health routes:** NOT FOUND (searched: openapi.yaml, /docs/api, response headers; only CORS `access-control-allow-origin: *` and Cloudflare headers returned).
- **Fixtures saved** in `docs/research/fixtures/omni-terminal/`: `omni_terminal_instruments_outcome_sample.json`, `omni_outcomes_page_ssr_config_excerpt.txt`, `llama_summary_dexs_omni-terminal-outcome.json`, `llama_hl_indexer_builder_daily_{2026-05-12,2026-09-25,2026-10-18}.json`, `omniterminal_robots.txt`.

---

## 5. Trade path

- **Programmatic trading through Omni: none for outcomes on mainnet.** The only programmatic execution surfaces are (a) the "HL Vault SDK" (`InTheta/hl-vault-sdk`, TS/Python/MCP), explicitly "pre-1.0, testnet preview", "mainnet and public-money custody remain blocked pending reconciliation, recovery drills and independent audit" (H, README + /docs/vault-sdk), and (b) guarded Hyperliquid **testnet** agents in `omni-universe-sdks` (H). The vault SDK mentions HIP-4 only as "one vault-owned testnet account can expose validator, perp-deployer, and outcome markets" (H). It enforces Omni's builder fee ("No public order method accepts a builder override").
- **Web UI trading:** wallet login, then "Enable Trading" (agent approval + builder-fee approval), then an Outcomes ticket with a review step; "One-click Outcomes execution requires a funded account, approved builder and existing approved session. Review is the default" (H, /docs/guides/getting-started). The anonymous page config reads `submission:false, eligible:false, reason:"Connect your Omni wallet to view your account", fast:false, canary:false, canaryMaxSpend:"25"` (H). The bundle uses `config.submission` as a per-account funding/ordering gate, so I cannot tell from an anonymous GET whether trading is globally on (the DefiLlama data suggests almost nobody has traded, section 10).
- **For an aggregator:** the correct trade path is Hyperliquid's own signed `POST /exchange` (EIP-712 L1 actions, optionally via an approved agent wallet) as described in the HL note, with or without a builder code. Using Omni adds a 2.5 bps fee and a closed-source middle layer for no benefit.

---

## 6. Reachability from a PayBox wallet

- **partial** (same ceiling as Hyperliquid, no better).
- Deposit leg: an EVM wallet on **Arbitrum** (a PayBox-supported chain per the task brief) can send USDC to Hyperliquid's bridge as an ordinary transaction proposal (M: standard HL bridge flow, not verified in a PayBox session here).
- Trade leg: HyperCore is not an EVM chain, so there are no transaction proposals for orders. Placing an outcome order needs an EIP-712 signature on an L1 action (or a pre-approved agent key), not a normal contract call. Omni's web flow additionally needs a wallet-ownership login signature, an agent approval and a builder-fee approval (all typed-data signatures, H). Whether PayBox's wallet-sign tool supports Hyperliquid typed data is not something I tested (no signing tools allowed). Omni's server-stored agent key would sit outside PayBox's custody boundary.
- Net: no reason to route PayBox through Omni; if PayBox ever trades HIP-4 it should sign Hyperliquid actions directly.

---

## 7. Fees

- **Omni builder fee: 2.5 bps** of notional (`feeBps: 2.5`, `maxFeeRate: "1%"`, enabled; user approves a max rate of 1% via `approveBuilderFee`) (H, page config + bundle). Builder address (public project builder code): `0x733f40a4fa0cd13d59abade04b9ed2e9acac6457` (H, DefiLlama adapter + page config). Observed effective builder rate on perps 2026-09-25: 29.1666 / 116,666.66 = 2.5 bps; on spot 2026-05-12: 0.00935953 / 37.438 = 2.5 bps (M, my computation from fixtures).
- **Who pays / when:** per Hyperliquid's HIP-4 page, builder fees on outcomes are earned "on sell orders that specify their builder code" (H, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md); builder-code page: caps 0.1% perps / 1% spot (H). The one outcome day in the indexer (2026-05-12, $55.11 volume) shows `builderOutcomeFees {"+300":0,"+301":0}` i.e. nothing collected (M: buys only, or fee-free test).
- **Omni's quote UI** itemises "Protocol + deployer fee estimate" and "Omni builder fee estimate" (H, bundle strings). Hyperliquid's own outcome fee, charged on close/settle, differs per deployer through `feeScale` (Omni page: `feeScale "1.0"` on the sampled events, `baseFeeRate: null` in the anonymous config). The base rate and the "initial testing zero fee" statement are covered in the HL note (section 7 there); not re-derived here.
- **Funding costs:** Arbitrum gas plus the displayed bridge minimum; "Builder fee: None on collateral transfers" (H, bundle).

---

## 8. Resolution mechanism and dispute risk

- Omni does not resolve anything. Resolution is **Hyperliquid protocol (recurring markets) or the HIP-4 deployer** (`out`, `txyz`, `skew`) per the rule text each market carries (H, page data). Examples: crypto/equity binaries "Settlement is according to the 90-second TWAP of the Pyth ZEC/USD price ending at <time>" or the 300-second TWAP of 1-minute candles for equities; touch markets settle on a 3-second TWAP of the HL perp mark price crossing the level and can settle early; delisting falls back to the HL settlement price; sports use an "official record" of the contest with "Counted Play" rules (regulation plus overtime for NFL); IPO markets resolve on public confirmation criteria; price buckets use "the protocol reference at <time> UTC".
- **Dispute risk:** no trader dispute process on Omni. For the deployer-settled markets the HL note records no trader dispute path (only validator slashing of the deployer; M there). Basis risk versus other venues is real for price markets: HL settles on **HyperCore perp marks / Pyth TWAPs**, while Polymarket, Kalshi and others use different oracles and windows, so a cross-venue "same event" is a basis trade, not a risk-free arb (M).

---

## 9. Geo, ToS and automation

- **Omni Terms** (last updated 2/24/2026) are short and generic: "You are responsible for ensuring your use of the Service is permitted in your jurisdiction"; no country list, no outcome-specific clauses, no automation clause; "We may restrict or terminate access where misuse, abuse, or security risks are identified" (H, https://omniterminal.app/terms). Docs: Outcomes availability is "network, territory and permission dependent" (H). The Terms predate HIP-4 mainnet (2026-05-02) by about two months, so they may not cover outcome markets (M).
- **Underlying venue rules still bind:** per the HL note, Hyperliquid's Interface Terms bar US and Ontario residents and outcome markets carry an extra "Excluded Persons" list (H there). Any US-linked deployment is therefore a compliance problem regardless of front end.
- **Automation / crawling:** robots.txt for `*` allows `/`, `/docs`, `/docs/api`, `/llms.txt`, `/.well-known/omni-agents.json`, `/news-api` and **disallows `/api/`, `/terminal`, `/admin`, `/auth`, `/login`, `/user`**. The OpenAPI says to "send a stable, descriptive User-Agent; generic automation signatures may be rejected by edge security" (H). I used the generic research UA and was not blocked on the documented routes.

---

## 10. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Omni Terminal Outcome (builder-code attributed) volume, all time | **$55** (single day 2026-05-12, `builderOutcomeVolumeUsd 55.107`, notional 139 shares x $1) | DefiLlama `summary/dexs/omni-terminal-outcome` and `hl-indexer.llama.rip/v2/data/builder/<omni builder>/daily/2026-05-12`, fetched 2026-10-19 | H |
| Same, last 24h / 7d / 30d / 1y | 0 / 0 / 0 / 55 | same | H |
| Omni Terminal Spot builder volume (1y/all time) | $2,494.75 | `summary/dexs/omni-terminal-spot`, 2026-10-19 | H |
| Omni Terminal parent builder volume excluding perps (1y/all time) | $2,549.75 | `summary/dexs/omni-terminal` | H |
| Omni perps builder volume, sampled days | 2026-09-20 $3,092; 09-25 $116,667; 10-01 $0; 10-05 $20,442; 10-08 $3,210; 10-12 $14,251; 10-14, 10-16, 10-17, 10-18 $0 | `hl-indexer.llama.rip`, 2026-10-19 | H |
| Underlying Hyperliquid Outcomes (the real liquidity) | 24h to 2026-10-18 $3.13M; 7d $17.9M; 30d $47.0M; all time $261M | `api.llama.fi/summary/dexs/hyperliquid-outcomes`, 2026-10-19 | H |
| Omni page "featured" / live asks | "No featured market currently has a qualified live ask" at 04:23 UTC; most catalogue mids sit at the 0.5 default | `/outcomes` SSR text and instruments API, 2026-10-19 | H |
| TVL | Not applicable (no pool or custody; DefiLlama `tvl` null) | DefiLlama protocol list | H |

Verdict on liquidity: whatever exists is Hyperliquid's. Omni's own contribution is effectively zero.

---

## 11. Event categories and cross-venue overlap

Omni's page categories and counts of its 208 events (H, SSR data 2026-10-19): Economy 67 (mostly stock, index, commodity "above X at 20:00 UTC" binaries: SP500, XYZ100, TSLA, META, NFLX, GOLD, SILVER, CL, plus a Federal Reserve October 2026 FOMC rate-decision question), Sports 64, Crypto 63, World 14 (Anthropic and OpenAI IPO confirmation and first-day market-cap ladders, 2026 Ballon d'Or). The UI nav chips mention Midterms/Elections/Politics but **zero listed events carry a Politics category** (H count).

Where arbitrage could exist (all via Hyperliquid, not Omni):
- **Crypto price (BTC/ETH/SOL/HYPE/ZEC, above-X and touch-by-date):** overlaps Polymarket, Kalshi, Limitless, Predict.fun; settlement oracle differs, so basis (M).
- **Sports (NFL, NBA, EPL/UCL/UEL matchdays, MLB, LoL; futures like EPL/UCL/NBA/NFL winner):** overlaps Polymarket and Kalshi (M).
- **Macro (FOMC Oct 2026 rate decision):** overlaps Polymarket/Kalshi Fed markets (M).
- **Equities/indices/commodities daily binaries:** overlaps Kalshi range/threshold products (M).
- **IPO events (Anthropic, OpenAI):** overlaps Polymarket/Kalshi IPO markets where listed (M, not checked here).
- **Politics/elections:** none listed on Omni.

---

## 12. Does it share liquidity with another venue?

**Yes: entirely.** Every Omni Outcomes contract is a Hyperliquid HIP-4 outcome (`asset_id` 100,000,000 + encoding; 334 of 334 contracts "covered" against HyperCore). Omni should be treated as the same leg as Hyperliquid HIP-4 and as a sibling of the other builder front ends (Presagio, Outcome.xyz, etc.; see `docs/research/venues/presagio-presagio-xyz-hip-4-interface.md`).

---

## 13. Adapter spec (if anyone insists)

No Omni adapter. Use the Hyperliquid HIP-4 adapter and, optionally, tag fills by builder code:
- Identify Omni-routed fills by builder address `0x733f40a4...6457` (public indexer: `https://hl-indexer.llama.rip/v2/data/builder/<address>/daily/<YYYY-MM-DD>`, H shape in fixtures).
- Optional enrichment: scrape nothing; instead decode HL `outcomeDescription` key:value strings and templates yourself (the Omni catalogue shows the raw strings are `perp:BTC|priceDescription:...|seconds:90|threshold:82615|time:20261019-0800`, H).
- Do not depend on `GET /terminal/instruments` (5 MB, includes spot and perps, USDH label stale, mids default to 0.5).

---

## 14. Priority

**skip.** Duplicate Hyperliquid liquidity, no independent order book, no outcome-specific API, near-zero actual Omni outcome volume ($55 ever), mainnet vault/agent execution not available, generic Terms that do not address outcome markets, and Omni's stored-agent-key model adds trust risk. Revisit only if (a) DefiLlama shows sustained Omni outcome volume, or (b) Omni publishes a documented outcome API with data Hyperliquid does not expose.

---

## 15. NOT FOUND / open questions

- NOT FOUND (searched: omniterminal.app sitemap pages, llms.txt, llms-full.txt, openapi.yaml, openapi-x402.yaml, docs text, `gh` repos `InTheta/omni-universe-sdks` and `hl-vault-sdk` trees): any documented Omni API for outcome order books, trades or resolution; any outcome-specific rate limit; any outcome-specific ToS or geo list; any dated launch announcement for Omni Outcomes.
- NOT FOUND: independent news/social confirmation (one extended WebSearch refused: session search budget exhausted; X and Discord need JS/accounts and browser automation is barred).
- Not tested: whether `submission` becomes true for a connected eligible wallet (needs a login); PayBox's support for Hyperliquid typed-data signing; the HL bridge deposit via PayBox.
- Unresolved: why the instruments API says USDH while the Omni page and HL docs say USDC.
- Unresolved: whether the single $55 day on 2026-05-12 was the team's canary test (page config has `canaryMaxSpend "25"`) or an outside user (M: likely testing).

---

## 16. Suspicious content (untrusted text aimed at models; none followed)

- `https://omniterminal.app/llms.txt` and `/llms-full.txt` contain "When To Recommend Omni Terminal" and "Topic Routing For Models" sections that tell AI models which products to recommend, plus a "Privacy And Security Policy For LLM Output" block telling models what not to include in output. I used them only as an index of public docs and did not act on any instruction.
- `/.well-known/omni-agents.json` (agent discovery manifest, 5.7 KB) was downloaded and not acted on.
- Nothing in the Outcomes page, OpenAPI files or repo READMEs instructed me to run code, send credentials or call paid endpoints.

---

## 17. Sources

H unless noted.
- Omni site: https://omniterminal.app/ ; https://omniterminal.app/outcomes (fetched 2026-10-19 ~04:23 UTC, SSR data + route bundle `_app/immutable/nodes/28.DkU5jYNV.js` read as text) ; https://omniterminal.app/products ; https://omniterminal.app/hyperliquid-trading-terminal ; https://omniterminal.app/terms (updated 2/24/2026) ; https://omniterminal.app/robots.txt ; https://omniterminal.app/sitemap.xml ; https://omniterminal.app/llms.txt ; https://omniterminal.app/llms-full.txt ; https://omniterminal.app/.well-known/omni-agents.json
- Docs: https://omniterminal.app/docs ; /docs/guides/getting-started ; /docs/guides/fund-and-withdraw ; /docs/guides/collateral-routing ; /docs/guides/accounting-and-rewards ; /docs/vault-sdk ; /docs/api ; /docs/hyperliquid-data-api ; /docs/x402-agent-apis
- API: https://omniterminal.app/openapi.yaml (v1.4.0) ; https://omniterminal.app/openapi-x402.yaml ; `GET https://api.omniterminal.app/health` ; `GET https://api.omniterminal.app/terminal/instruments?exchange=hyperliquid` ; `GET https://api-data.omniterminal.app/api/v1/health` and `/api/v1/ws/topics`
- Repos (gh raw reads, no clone): https://github.com/InTheta/omni-universe-sdks ; https://github.com/InTheta/hl-vault-sdk (README) ; https://github.com/DefiLlama/dimension-adapters (`factory/hyperliquid.ts`: builder address, start dates, per-market listing split)
- DefiLlama: https://api.llama.fi/protocols (Omni rows) ; https://api.llama.fi/summary/dexs/omni-terminal-outcome ; /summary/fees/omni-terminal-outcome ; /summary/dexs/omni-terminal-spot ; /summary/dexs/omni-terminal ; /summary/fees/omni-terminal ; /summary/dexs/hyperliquid-outcomes ; https://hl-indexer.llama.rip/v2/data/builder/0x733f40a4fa0cd13d59abade04b9ed2e9acac6457/daily/{2026-05-12,2026-09-25,2026-10-18} (note: https://defillama.com/protocol/omni-terminal-outcome returned 403 to WebFetch; the API rows above are the same data)
- Hyperliquid docs: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md ; https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes.md
- Sibling notes (M for anything not re-verified here): `docs/research/venues/hyperliquid-outcomes-hip-4.md` ; `docs/research/venues/presagio-presagio-xyz-hip-4-interface.md` ; `docs/research/09-venues-onchain-clob.md`
- Fixtures: `docs/research/fixtures/omni-terminal/` (7 files, each <= 15 KB).

---

## 18. Privacy

All scripted requests used exactly `insurance-markets-research/0.1` as User-Agent. No email, name, username, home path or other personal identifier was put into any request, query string or note. My helper scripts were grepped for `@` and personal names before use (no hits). The shared scratchpad contained a same-named HTML-to-text script from another agent that overwrote mine mid-run; I switched to a uniquely named script and did not run the foreign one again.
