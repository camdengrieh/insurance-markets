# Stratium (stratium.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes about 03:50-04:05 UTC). READ-ONLY: doc reads (`curl` GET of GitBook `.md` pages), reads of the public web-app JS bundles (GET only, never executed), `gh api` file reads, unauthenticated GETs to DefiLlama, Polymarket's public data API and four of Stratium's own same-origin JSON endpoints, and read-only PayBox `discover_plugins`. No account, wallet connection, key, signature, POST/PUT/DELETE, payment or PayBox money/signing tool was used. Third-party text was treated as untrusted data; no embedded instructions were found (see section 12).

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary, or my own computation/inference; **L** = weak or stale.

Method limits (read first):
- WebSearch budget was exhausted before I started (the first call was refused). No news, X/Twitter or Discord check was possible. "Still live" rests on direct fetches only.
- Hyperliquid's REST read path (`POST /info`) is POST-only and POST is forbidden here, so I did not capture any Hyperliquid-side response. The sibling notes `docs/research/venues/hyperliquid-hip-4-outcome-markets.md`, `hyperliquid-hip-4-outcomes-native.md` and `hyperliquid-outcomes-hip-4.md` cover the underlying venue (including live WebSocket captures). This file only adds what is specific to Stratium.

---

## 0. Bottom line

1. **Stratium is a front end and router, not a venue.** Its "binary options" product is a web UI over Hyperliquid HIP-4 outcome markets (orders go straight to `api.hyperliquid.xyz/exchange` with Stratium's builder code attached), plus a newer Polymarket tab (orders go to Polymarket's CLOB with Stratium's Polymarket builder code). It owns no order book, no collateral pool and no resolution logic for these markets. (H: Stratium docs say "frontend ... on Hyperliquid's HIP-4 infrastructure"; H: bundle code.)
2. **Liquidity is shared, so it is not an independent arbitrage leg.** Every HIP-4 book Stratium shows is Hyperliquid's; every Polymarket book is Polymarket's. Stratium's own FAQ says the HIP-4 and Polymarket legs "settle separately and do not share collateral" (H).
3. **Barely used as a channel.** DefiLlama's "Stratium Binary Options" builder-attributed volume is $111,233 all time, $0 for 24h / 7d / 30d, last non-zero day 2026-09-07 (H, fixture `defillama_stratium_binary_options.json`). For comparison the whole Hyperliquid HIP-4 venue did $3.13M on 2026-10-18 and $47.0M over 30d (H, DefiLlama).
4. **Live but low-confidence docs.** Website, docs and app respond (HTTP 200) and show current markets expiring 2026-10-19 to 2027-06. But the docs contradict each other (FAQ says HIP-4 is "on testnet"; the HIP-4 pages and the app bundle say mainnet) and the Terms still describe the product as "built on HIP-3" and were last updated 2026-01-15 (about 9 months ago, possibly stale).
5. **One useful by-product for the project.** `GET https://markets.stratium.xyz/api/hip4/markets` is a keyless GET (no POST) that returns the whole HIP-4 universe with human-readable titles, categories, deployer, expiry and resolution-source text. The sibling notes could not read titles without `POST /info outcomeMeta`. It is undocumented and must not be a production dependency (section 3). Use it for discovery and for a first look at market titles only.
6. **Recommendation: `adapter_priority = skip` for a Stratium adapter.** Build the Hyperliquid HIP-4 adapter (talks to Hyperliquid directly) and the Polymarket adapter instead. Optionally treat Stratium's "Opportunities" page (live HIP-4 vs Polymarket price differences) as a competitor/sanity-check, not a data source.

---

## 1. Identity, status, products

| Item | Finding | Tag / source |
|---|---|---|
| Operator | HorizonX Ltd, incorporated in the Abu Dhabi Global Market (ADGM); it "operates the informational website, user interface, and documentation layer" and "does not own, control, or operate the underlying smart contracts" | H, https://docs.stratium.xyz/legal/terms-of-use.md |
| Website | https://stratium.xyz ("Trade anything, Predict Everything") | H, WebFetch of https://stratium.xyz/ |
| Products | (a) Perps terminal at trade.stratium.xyz via Hyperliquid Builder Code; (b) "binary options" at markets.stratium.xyz via HIP-4; (c) srHYPE liquid staking on HyperEVM at app.stratium.xyz; (d) "The Pot" fee-funded reward draw (20% of builder fees; 7 distinct trading days to qualify; 20 winners per period; drand seed) | H, https://stratium.xyz/ , https://docs.stratium.xyz/support/faq.md |
| markets.stratium.xyz tabs | Hyperliquid (HIP-4), Polymarket (badge "Beta"/"New"), Opportunities (badge "Live"), Portfolio, Collectibles ("New"), Leaderboard, Analytics. "Opportunities" subtitle: "Live price differences for markets available on both Polymarket and Hyperliquid." "Hybrid" (FAQ) shows the same event priced on both venues side by side | H, WebFetch https://markets.stratium.xyz/opportunities and /hyperliquid; FAQ |
| "Collectibles" | NOT FOUND (searched: docs llms.txt/sitemap, FAQ, nav text, bundle strings; no description) | - |
| Live? | Site, docs, app: HTTP 200 on 2026-10-19; `/api/hip4/markets` returned 208 market rows, expiries from 2026-10-19 to 2027-06; response header `x-vercel-cache: MISS` (fresh) | H, my GETs |
| Network flag | App bundle: default `mainnet` (HyperEVM chain id 999, `api.hyperliquid.xyz`), `IS_TESTNET = false`, badge label "Mainnet". Docs contradiction: FAQ says "Binary options through HIP-4 are running on testnet ... ahead of mainnet deployment"; `hip-4-markets.md` and `accessing-stratium.md` say live on mainnet | H (bundle + docs), contradiction noted |
| Usage | DefiLlama "Stratium Binary Options" (id 8136, category Interface, parent "Stratium"): totalAllTime $111,233; 24h/7d/30d = 0; daily data 2026-05-26..2026-09-07 with only a handful of days above $1,000 (peak $11,661 on 2026-07-15). "Stratium Spot" $101 all time | H, https://api.llama.fi/summary/dexs/stratium-binary-options?dataType=dailyVolume (fixture) |
| Polymarket-routed volume | Stratium's Polymarket builder code (`0x1a2a2abc...1c0e`, taken from the public bundle) does not appear in Polymarket's builder leaderboard top 250 for the last month (rank 250 = $85K/month) | M, https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH (5 pages of 50) |
| Audit | Halborn audited only the srHYPE vault and token; no audit of the HIP-4 / Polymarket front end is claimed (nothing to audit, it is a UI) | H, https://docs.stratium.xyz/support/security.md |
| Repos | Docs footer links the org `github.com/horizonx-tech`. It has no Stratium front-end repo (only Aptos/Internet-Computer tooling, `Stratium-upptime` status monitor, a `hyperliquid-rust-sdk` repo, `openstrat`). `Stratium-upptime/.upptimerc.yml` monitors only app.stratium.xyz and trade.stratium.xyz (not markets.stratium.xyz) | H, `gh api orgs/horizonx-tech/repos`, `.upptimerc.yml` |

---

## 2. Market model and tokenisation

- **Stratium adds no model of its own.** What it lists are Hyperliquid HIP-4 outcome markets (HyperCore, native CLOB). Per the official HIP-4 page: each outcome has two tokens (`sideSpecs`, usually Yes/No); YES and NO books are **merged** (buy YES at p == sell NO at 1-p); settlement converts Yes to `settleFraction` quote tokens and No to `1 - settleFraction`; "questions" are sets where exactly one outcome settles Yes; outcomes link via `negate` and `merge` actions. H, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md
- **Tokenisation (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids.md):** `encoding = 10 * outcome + side` (side 0 or 1); spot coin `#<encoding>`; token name `+<encoding>`; order asset id `100_000_000 + encoding`. Stratium's JSON uses the same: market "Hoffenheim v Lyon" has `outcomeId 14198`, `yesCoin "#141980"`, `noCoin "#141981"` (H, fixture `hip4_markets_sample.json`).
- **Stratium docs describe only binary:** "Positions settle to 0 or 1 at expiry ... fully collateralized outcome contracts denominated in USDC ... No leverage. No liquidation." (H, `accessing-stratium.md`, `hip-4-markets.md`). The live list also has categorical sets (34 `multi` rows holding 125 outcomes) and `priceBucket` / `priceTouch` classes (H, `hip4_markets_summary.json`). No scalar markets seen in the Stratium list.
- **Collateral token conflict (unresolved):** Stratium docs say USDC. The official Hyperliquid HIP-4 page says only "quote token". Project note `docs/research/09-venues-onchain-clob.md` cites a Chainstack page for USDH. I did not settle this; see the sibling Hyperliquid notes. Do not hard-code until verified via `outcomeMeta`/spot metadata.
- **Stratium list vs. Hyperliquid:** Stratium's list had 299 outcomes (174 single + 125 inside 34 multi rows) while sibling notes counted 334 to 350 outcomes in Hyperliquid's own `allMids`. So the Stratium list is a filtered or lagging subset (M). Do not use it for completeness.
- **"EVM custom markets" claim:** Stratium's `hip-4-markets.md` says "Binary YES/NO markets and speed markets (15-minute expiry) on BTC, ETH, SOL deployed on HyperEVM ... Gasless after initial wallet setup." I found no trace of such a product in the current web-app bundle or the markets list (searched bundle for speed/gasless/EVM-market strings; only Polymarket's gasless relayer code matched). Treat as roadmap or stale text: **unverified (L)**.
- **Polymarket tab:** uses Polymarket's own CLOB and relayer (`clob.polymarket.com`, `gamma-api.polymarket.com`, `relayer-v2.polymarket.com` found in the bundle), collateral token `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` labelled `POLYMARKET_COLLATERAL_TOKEN` (the UI calls it "pUSD"), Polygon CAIP-2 `eip155:137`; a Stratium relay (`/api/relay/hypercore-polymarket/{quote,authorize,status}`, POST, not called) moves HyperCore spot USDC to the Polymarket balance. H (bundle strings). Market model is whatever Polymarket's is; see the Polymarket notes.

---

## 3. Read API

**Official:** none. The docs index (`https://docs.stratium.xyz/llms.txt` and `sitemap.md`) has no API, developer or endpoint page. NOT FOUND (searched: llms.txt, sitemap.md, introduction, accessing, HIP-4 pages, FAQ, support, security, contracts pages, terms, footer links). Also no WebSocket, rate-limit or SLA statement.

**Undocumented same-origin JSON endpoints used by the web app** (found in the public JS bundles at `https://markets.stratium.xyz/_next/static/chunks/*.js`; each requested with generic UA `insurance-markets-research/0.1`). Treat as L for stability:

| Endpoint | Verb / my probe | Shape (H, fixtures in `docs/research/fixtures/stratium/`) |
|---|---|---|
| `/api/hip4/markets` | GET, 200, 279,129 B, `cache-control: no-store` | `{"markets":[{id ("q-483" for questions), name, description (pipe-delimited `key:value` spec, e.g. `class:priceBinary|underlying:SOL|expiry:20261019-0600|targetPrice:103.46|period:1d`, or `officialSource:...|resolutionDeadline:...` for sports), type ("single"/"multi"), outcomeId, yesCoin, noCoin, yesPrice, noPrice, markPx, volume24h, totalFills, outcomes[] (per-outcome yes/no coin and price), underlying, targetPrice, priceThresholds, expiry (ISO), scheduledStart, period, outcomeClass (priceBinary / priceTouch / priceBucket / custom / null), questionName, isSettled, deployer {id,name,venue,address}, category, imageUrl}]}`. 208 rows. `volume24h` was 0 on all rows and `yesPrice` was exactly 0.5 on 15 rows, so treat price/volume fields as indicative, not executable (M) |
| `/api/hip4/sparklines?coins=%23141980` | GET, 200, 247 B | `{"sparklines":{"#141980":{"points":[{"t":<unix s>,"c":<price>},...hourly],"change24h":-0.001}}}` |
| `/api/hip4/recent-fills?limit=3` | GET, 200 after 30 s (first try timed out at 20 s) | `{"fills":[{user,outcomeId,marketName,side,dir,px,sz,timeMs,coin,tid}]}`; `user` is a third-party wallet address (redacted in my fixture); `marketName` was a generic label ("Sports Contest Participant2") |
| `/api/hip4/upcoming-votes` | GET, 200, 39 B | `{"upcoming":[],"validatorsJoined":true}` (meaning not documented; likely validator votes on upcoming deployments, M) |
| `/api/hip4/leaderboard?sortBy=volume&period=all&offset=0&limit=50` | **not called** (trader PnL data; no need) | - |
| `/api/referral/{bind,resolve}`, `/api/relay/hypercore-polymarket/{quote,authorize,status}` | **not called** (POST / state-changing) | - |

Auth: none needed for the four GETs I made. Rate limits: NOT FOUND for these endpoints. They proxy Hyperliquid (the 30 s `recent-fills` latency suggests an upstream call).

**The authoritative read path is Hyperliquid itself** (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits.md): `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `l2Book`, `allMids`, ...), `wss://api.hyperliquid.xyz/ws`; REST aggregated weight 1200 per minute per IP (`l2Book`, `allMids` weight 2; most others 20), max 10 WS connections, 1000 subscriptions, 2000 messages per minute. Details and live WS captures: sibling Hyperliquid notes. Docs for the Stratium-visible parts of the Polymarket tab: Polymarket notes.

For the Polymarket legs use Polymarket's public APIs directly, not Stratium.

---

## 4. Trade path

- **Stratium itself offers no programmatic trading API (NOT FOUND).** Orders are built and signed in the browser (H, bundle):
  1. Wallet login through Privy (embedded or external wallets). Stratium's supported-chain list in the Privy config includes HyperEVM, Polygon, Arbitrum, Optimism, Base, Ethereum, BSC, Avalanche (for deposits). Minimum deposit constant `MIN_DEPOSIT_USD = 5`.
  2. One-time Hyperliquid actions signed by the user's wallet: `approveAgent` (agent name "Stratium"; the browser generates an agent key and keeps it in `localStorage` under `stratium_hl_agent_<address>`) and `approveBuilderFee` for builder `0xcBd0AB1f5872dbA6667C23765613dE93453e3320` with a max fee rate.
  3. Orders: `{"type":"order","orders":[{a: 100000000+encoding, b, p, s, r, t:{limit:{tif}}}],"grouping":"na","builder":{"b":"0xcBd0...3320","f":100}}` signed by the agent key and POSTed to `https://api.hyperliquid.xyz/exchange`. So the "venue" of record is Hyperliquid.
- **An aggregator should skip Stratium and trade Hyperliquid directly**: same books, same asset ids, and no 10 bps Stratium builder fee. Signing scheme, split/merge/negate actions and agent-wallet rules are covered in the sibling Hyperliquid notes (EIP-712 L1 actions on `/exchange`; agent wallets supported).
- **Polymarket tab:** order signing is Polymarket's (EIP-712 orders plus builder code and a "deposit wallet" / relayer flow). Trade Polymarket directly.

**PayBox reachability: partial (for the underlying Hyperliquid venue; Stratium adds nothing).**
- PayBox's chain catalog includes Hyperliquid (999) (H, `docs/research/06-paybox-platform.md`, re-listed 2026-10-19). PayBox's `hyperliquid` plugin exists but is described as "Browse Hyperliquid spot markets, prices, and token metadata", is not enabled on this account, and is read-only spot browsing (H, `discover_plugins` query "hyperliquid" today; I did not read its contract or call it).
- HIP-4 orders are Hyperliquid **L1 actions** (msgpack-hashed phantom-agent EIP-712 payload, domain chain id 1337), not EVM transactions on HyperEVM, so a transaction proposal cannot place them. Whether `request_wallet_sign` typed-data signing accepts that payload is **unproven**. Funding USDC to HyperCore through an EVM transfer (Arbitrum bridge or HyperEVM) is plausible via PayBox but not tested here.
- Stratium-specific blocker: none beyond Hyperliquid's. Its own Terms exclude US persons (section 7).

---

## 5. Fees

| Layer | Finding | Tag / source |
|---|---|---|
| Stratium docs | "HIP-4 charges zero fees to open or mint positions. Fees apply only on close or settlement, following Hyperliquid's standard schedule." | H, https://docs.stratium.xyz/hip-4-binary-options/hip-4-how-to-trade.md |
| Stratium builder fee | Bundle constant `NEXT_PUBLIC_HL_BUILDER_FEE_TENTHS_BPS = 100` (default message says "using default 100 (0.1%)") and builder address `0xcBd0AB1f5872dbA6667C23765613dE93453e3320`; sent as `builder:{b,f:100}` on every HIP-4 order, i.e. 10 bps = 0.10% of notional. Docs never state this number (docs say only that 20% of fees go to stakers / The Pot). Baked in at build time, so M that it is the live value | H (bundle), M (live) |
| Hyperliquid rule | Official fees page: "Outcome trading only charges fees when closing or settling, not when opening ... does not support rebates. Users who would receive rebates ... pay zero fees on maker orders." Fee rate for outcomes is **NOT FOUND** (searched `trading/fees.md`: tier tables cover perps and spot only; the fee formula has no outcome branch; rates come from the `userFees` info endpoint) | H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees.md |
| Hyperliquid builder codes on outcomes | Official HIP-4 page: "builder codes do work the same as normal spot trading, where builders earn builder fees on **sell** orders that specify their builder code." This resolves the "NOT FOUND" in `docs/research/14-platform-of-platforms.md` | H, HIP-4 page |
| Timing | The same HIP-4 page still says "Fees are currently zero for outcome markets for initial testing" (undated, possibly stale). DefiLlama's methodology says "Hyperliquid charged no outcome fee of its own before 15 Aug 2026", implying fees since then | H (both texts), M (inference) |
| Who pays | Taker/closer pays the Hyperliquid fee; builder fee is added on sells and paid by the seller to the builder | H/M |

Net: for an aggregator the cost of using Stratium is Hyperliquid's closing/settlement fee plus 10 bps on sells; going direct removes the 10 bps.

---

## 6. Resolution and dispute risk

- **Hyperliquid-canonical price markets** (deployer "Hyperliquid", 5 rows): settle on HyperCore mark price with linear interpolation around the settlement timestamp: YES iff `markPrice0 + (settlementTime - t0)/(t1 - t0) * (markPrice1 - markPrice0) >= targetPrice`. Series: BTC/ETH/SOL/HYPE daily at 06:00 UTC and 15-minute buckets. H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications.md#recurring-outcomes
- **Builder-deployed markets** (deployers in the Stratium list: Outcome 80 rows, Tradexyz 62, Skew 61): rules sit in each market's `description` string, e.g. sports `officialSource:Union of European Football Associations`, `countedPlay:regulation time, 90 minutes plus stoppage time`, `resolutionDeadline:20261023-1900`; Skew price markets `perp:xyz:XYZ100|priceDescription:the Pyth US100 index price|seconds:90|threshold:29890|time:20261021-2000`; FOMC market `decisionDeadline:20261209-2300|institution:...|officialSource:...`. H (fixture `hip4_markets_sample.json`). Who judges the outcome and any dispute window: **NOT FOUND** in Stratium docs (searched all docs pages). Stratium docs say deployers stake 500,000 HYPE, slashable, and each slot "can be recycled after settlement" (H, `hip-4-markets.md`). Slashing is validator stake-weighted voting (H, `security.md`, about HIP-3 but same mechanism claim). Inference (M): custom-outcome truth is set by the deployer, with only slashing as recourse; no UMA-style dispute. Treat as higher resolution risk than Polymarket's UMA process for the same event, and check rule wording before pairing.
- Settlement: automatic, USDC credited to the Hyperliquid account (H, how-to-trade).
- Stratium's own Oracle Architecture page (SEDA + Pyth) concerns its planned HIP-3 perps, not HIP-4 settlement (M).

---

## 7. Geo, ToS, automation

From Terms of Use (HorizonX Ltd, "Last Updated: January 15, 2026", so about 9 months old, possibly stale):
- Eligibility: not a citizen/resident of, nor accessing from, "a restricted or sanctioned jurisdiction, including the United States, Iran, North Korea, Cuba, Syria, Russia", or any UN/OFAC/EU/UAE sanctioned country; 18+. (H)
- Prohibited: "bypass geo-restrictions or access controls, including by using VPNs or proxy servers"; wash trading, spoofing, manipulation; "reverse engineer or modify Platform code". (H)
- Automation / bots / API scraping: NOT FOUND (searched the Terms for bot, automat, scrap, API, rate limit, crawl). The Terms also never mention outcome, prediction or Polymarket products.
- Governing law ADGM; arbitration in the ADGM Arbitration Centre; liability cap USD 100. (H)
- Hyperliquid's own outcome-market terms (open-ended "Excluded Persons" list) apply on top: see `docs/research/09-venues-onchain-clob.md` section on Hyperliquid terms (H there).
- Note on my probing: I read public JS bundles and made four unauthenticated GETs of the site's own endpoints. The "reverse engineer" clause is aimed at users of the platform. An integration should not depend on Stratium's undocumented endpoints at all.

---

## 8. Liquidity

| Metric | Value | Date / source |
|---|---|---|
| Stratium Binary Options builder-attributed volume | all time $111,233; 24h/7d/30d $0; last non-zero day 2026-09-07 ($132) | 2026-10-19, DefiLlama (H) |
| Stratium Spot builder volume | $101 all time | same (H) |
| Hyperliquid Outcomes (the real liquidity) | 24h $3,128,093; 7d $17,900,930; 30d $47,014,618; all time $261,084,367; daily 2026-10-11..18: $3.72M, $2.99M, $2.70M, $2.08M, $1.90M, $2.26M, $2.85M, $3.13M | 2026-10-19, https://api.llama.fi/summary/dexs/hyperliquid-outcomes (H) |
| Outcome.xyz front end (for scale) | 24h $5.29M, 30d $79.4M, all time $153.4M (builder-attributed; larger than the venue line because of attribution method) | 2026-10-19, DefiLlama `/overview/dexs` (H) |
| Stratium TVL / OI | NOT FOUND (srHYPE vault TVL is irrelevant to prediction liquidity; not checked) | - |
| Depth in the Stratium list | `volume24h` field 0 on all 208 rows; 15 rows priced exactly 0.5 (likely empty books) | 2026-10-19 03:57Z, fixture (H) |

---

## 9. Event coverage and arbitrage overlap

Stratium itself: none unique. The HIP-4 universe it displays (snapshot 2026-10-19 03:57Z, 208 rows; H, `hip4_markets_summary.json`):

| Category | Rows | Examples | Overlap with other venues (M) |
|---|---|---|---|
| Sports | 64 (Outcome 50, Tradexyz 14) | UEFA Europa/Champions League matchday 3, EPL Matchday 7, NFL game winners and spreads, 2027 NFL winner, 2026 MLB champion | Polymarket, Kalshi, SX Bet (match winner, futures). Strongest overlap |
| Crypto | 64 (Skew 43, Outcome 12, Tradexyz 4, Hyperliquid 5) | BTC/ETH/SOL/HYPE/ZEC daily "above $X" binaries, "touches $X by Nov 1" | Polymarket / Kalshi / Limitless / Predict.fun crypto up-down and price-threshold markets. Settlement sources differ (HyperCore mark vs Chainlink / Pyth / Coinbase), so resolution basis risk |
| Macro | 64 (Tradexyz 35, Skew 18, Outcome 11) | SP500, XYZ100, GOLD, crude oil (CL), single stocks (META, INTC, IBM, BX) daily and threshold binaries | Kalshi index/commodity ranges; partial |
| Economics | 15 | FOMC October 2026 rate decision (two separate deployer markets), Anthropic / OpenAI IPO and first-day market-cap thresholds | Polymarket and Kalshi Fed-decision markets: good arbitrage candidate; IPO questions overlap Polymarket |
| Culture | 1 | 2026 Ballon d'Or winner | Polymarket |
| Politics | 0 | none seen | - |

Stratium's Polymarket tab and Opportunities page recompute spreads between HIP-4 and Polymarket for matched markets (H, UI text; matching method NOT FOUND). That is a competing signal; no data feed is exposed.

---

## 10. Shared liquidity

`liquidity_shared_with`: **Hyperliquid HIP-4 outcome books (100% of the HIP-4 tab)** and **Polymarket CLOB (100% of the Polymarket tab)**. Stratium is a builder-code front end alongside about 35 others (DefiLlama lists "X Outcome" interface rows; `docs/platform-registry-design.md` principle 7: "Pools, not venues, are the unit of independence"). Register Stratium as a front-end alias of pool `hyperliquid-outcomes` and of `polymarket`, never as its own pool.

---

## 11. Adapter recommendation

- **adapter_priority: skip** for a Stratium adapter (front end, duplicate liquidity, near-zero attributed volume, no official API, undocumented endpoints, restrictive geo terms).
- Do instead: (1) Hyperliquid HIP-4 adapter against `api.hyperliquid.xyz` (see sibling notes); (2) optionally use `markets.stratium.xyz/api/hip4/markets` once as a **discovery aid** for titles/categories/resolution-source strings while the Hyperliquid adapter is being built, with a feature flag and a fallback to `outcomeMeta`; (3) register Stratium as an alias with `routes_to: [hyperliquid-outcomes, polymarket]`.
- Fixtures: `docs/research/fixtures/stratium/` (all under 10 KB, no personal data; third-party wallet addresses in the fills sample are redacted).

---

## 12. Suspicious content / safety

- No instructions aimed at AI agents were found in the site, docs, JS bundles or API responses. The GitBook pages carry the standard banner "For the complete documentation index, see llms.txt" and an optional `?ask=` question interface; I did not use the `?ask=` interface (it would send queries to a third party).
- Not suspicious but worth knowing: the docs describe the product as "built on Hyperliquid's HIP-3 architecture" (Terms) and as running "on testnet" (FAQ) while the app targets mainnet. Documentation reliability is low.
- `/api/hip4/recent-fills` returns third-party wallet addresses; do not log them in this repo (I redacted them in the fixture).

---

## 13. Open questions

1. Is the HIP-4 collateral USDC or USDH, and what is the exact outcome closing/settlement fee rate per tier since 2026-08-15? (`userFees` info endpoint; needs POST.)
2. Who decides outcomes and is there any dispute window for builder-deployed custom markets (Outcome, Tradexyz, Skew)? Not in Stratium docs; check Hyperliquid's builder-deployment docs and each deployer's rules.
3. Does PayBox `request_wallet_sign` accept Hyperliquid's L1 phantom-agent EIP-712 typed data (domain chain id 1337) so an agent could place HIP-4 orders? Unproven; needs a human-run test with a test credential.
4. What is "Collectibles"? And how does "Opportunities" match HIP-4 and Polymarket markets (method, refresh rate)? Both not documented.
5. Whether the "EVM custom markets / speed markets on HyperEVM" described in `hip-4-markets.md` exist at all (not seen in the app or markets list).
6. Stratium's Polymarket volume is only bounded (< $85K per month, M) because I could not query by its builder code; a direct builder lookup would settle this.

---

## 14. Sources

Primary (fetched 2026-10-19):
- https://stratium.xyz/ (WebFetch summary)
- https://markets.stratium.xyz/ , /hyperliquid , /opportunities (WebFetch summaries; client-rendered pages show no market data in text form)
- https://docs.stratium.xyz/llms.txt , /sitemap.md
- https://docs.stratium.xyz/about-stratium/introduction.md , /accessing-stratium.md , /oracle-architecture.md
- https://docs.stratium.xyz/hip-4-binary-options/hip-4-markets.md , /hip-4-how-to-trade.md
- https://docs.stratium.xyz/support/faq.md , /security.md , /contracts-and-addresses.md
- https://docs.stratium.xyz/legal/terms-of-use.md (last updated 2026-01-15)
- https://markets.stratium.xyz/_next/static/chunks/*.js (public bundles, read as text only; builder address and fee constant, Polymarket builder code, API paths, network config)
- Stratium GET endpoints listed in section 3
- https://github.com/horizonx-tech (`gh api orgs/horizonx-tech/repos`; `Stratium-upptime/.upptimerc.yml`)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids.md
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits.md
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees.md
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications.md
- https://api.llama.fi/overview/dexs , /summary/dexs/stratium-binary-options , /summary/dexs/stratium , /summary/dexs/hyperliquid-outcomes (the `/summary/derivatives/*` calls returned HTTP 402, recorded and stopped; no payment made)
- https://data-api.polymarket.com/v1/builders/leaderboard (public GET)
- PayBox `discover_plugins` query "hyperliquid" (read-only)

Project cross-references: `docs/research/09-venues-onchain-clob.md`, `docs/research/14-platform-of-platforms.md`, `docs/research/06-paybox-platform.md`, `docs/platform-registry-design.md`, sibling notes `docs/research/venues/hyperliquid-*.md`, `outcome-xyz.md`, `skew-markets-hip-4-deployer.md`, `trade-xyz.md`.

Claims I could not source: nothing was inferred without a tag. Items tagged M are my inference or a small-model summary.

---

## 15. Privacy check

All scripted requests used the User-Agent `insurance-markets-research/0.1`. My fixture-building script was grepped for `@` and for the user's name before running (no hits). No personal identifier appears in any request, query string, note or fixture.
