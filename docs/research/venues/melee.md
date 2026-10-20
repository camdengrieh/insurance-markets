# Melee (melee.markets) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 03:38-04:00 UTC). READ-ONLY: page and static-asset reads, `gh api` reads, unauthenticated GETs (including GraphQL read queries sent as HTTP GET, never POST), no account, wallet, key, signature, on-chain call or PayBox tool. Third-party pages, repo text, JS bundles and API responses were treated as untrusted data; nothing in them was followed. WebSearch hit its shared session budget after the first query, so only one search was run and no third-party press beyond the pages fetched directly was read (the hint's QQ News and Dune items were therefore not verified).

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference/arithmetic from first-hand data; **L** = weak or stale (older than 6 months counts as L unless re-confirmed).

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/melee/` (listed in section 13).

---

## 0. Bottom line

1. **The live "beta" runs on Solana DEVNET with a test token.** The API itself reports `deploymentCluster: "devnet"` for program `Bz4AoAXL8vkTSFPqR52GwNxFixAbKPJ3VShhgoS2eV2G` in a buy quote, the front end is wired to a devnet RPC and `explorer.solana.com/?cluster=devnet`, the data host is `api.stg.melee.markets` ("stg" = staging), and the app has a daily "free play" faucet system. The collateral is a mint with ticker "USD" (6 decimals), not USDC. (H, section 3)
2. **Its prices are not informative.** All 55 sampled markets are mirrors of **Polymarket** events (`publicationSource.label = "Polymarket"`, resolution "Settles on the source market's result"). Yet on "Bank of Korea decision in October?" Melee's pool-implied likelihood for "50+ bps cut" is 20.35% while Polymarket prices it at 0.05% and "hold" at 96.35% versus Melee 20.2%. (H, same minute, section 10)
3. **Headline volume is test-token volume.** About $94.6M cumulative "USD" volume across 1,428 live and resolved markets, but on devnet with free-play credits; one mirrored market shows $328k of Melee volume against $42.9k on the real Polymarket event. (H data; "play money" is M, inferred from devnet plus faucet)
4. **A real-money mainnet product was not found.** A V1 "alpha" (SOL-denominated bonding-curve pools, program `HK4ai9cQ...` listed under Solana in Jupiter's platform-list) last created a market on 2026-03-02 and the prod-named host `api.melee.markets` now has zero active schedules. (H for dates, M for "mainnet")
5. **Not an arbitrage leg today:** devnet, Solana-only (no EVM path), no published API (docs say "API Docs (soon)"; `docs.melee.markets` is behind Vercel SSO), ToS bans bots and US persons, payouts are parimutuel (not a fixed $1 share), and resolution depends on Polymarket. **adapter_priority = skip.** Revisit only if a mainnet launch with the V3 program is announced (section 12).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Marketing site | `https://melee.markets` -> 308 -> `www.melee.markets` (Vercel). Text "Melee Beta Is Live", access "drops in waves" via Twitter/Discord codes, footer "API Docs (soon)" with no link, "49,247 predictors" (marketing figure) | H (WebFetch of homepage, hrefs listed) |
| Beta app | `https://beta.melee.markets` HTTP 200 (Next.js on Vercel), reading is open ("Anyone can read."), login via Privy / Solana wallet | H |
| Data freshness | `activeMoonshotSchedules` on `api.stg.melee.markets`: BTC/USD 5-minute schedule has `lastMarketCreatedAt` 2026-10-19T03:39:03Z, 11,730 rounds created; ANSEM 7,601, SOL 6,960, SI 3,556. 401 markets LIVE, 188 PRESALE at probe time. | H (fixtures) |
| Devnet launch marker | Bundle constant `NEXT_PUBLIC_DEVNET_LAUNCH_AT = "2026-09-08T18:00:00Z"` | H |
| Prod-named API | `api.melee.markets/graphql/` answers but has an older schema, `activeMoonshotSchedules = []`, `moonshotMarkets = []`; `latestMarket` = "U.S. Regular Gas Price (March 8, 2026)", created 2026-03-02, V1 contract, RESOLVED | H |
| Funding / launch history | $3.5M seed led by Variant announced 2025-09-24, "open waiting list phase" (ChainCatcher, 2025-09-26) | M, stale (> 6 months) |
| Social | `x.com/MeleeMarkets` returned HTTP 402 to WebFetch (not read, no payment attempted); Discord and Telegram links exist (not read) | H (link existence) |

Verdict: **still_live = true as a devnet beta/test network**, not as a confirmed real-money venue.

---

## 2. Kind and market model

- **Kind (H, litepaper + API):** Solana on-chain "Parimutuel Market Maker" (PMM). Marketing: "Introducing the Parimutuel Market Maker (PMM). A new trading mechanism designed specifically for permissionless prediction markets. Only possible on Solana." (search snippet of Melee's X post, M).
- **Mechanism (H, `pmm.melee.markets/litepaper`):** parimutuel with 2+ mutually exclusive outcomes; each outcome has its own curve that depends on the whole pool state; at resolution the pool is divided pro rata among holders of the realised outcome. Each entry gets a **minimum-return floor** set at entry ("deterministic and monotonically increasing", applies only to winning positions held to resolution). Positions can be **switched** between outcomes (new floor as for a fresh entry) and **cashed out** early through a cashout LP vault at a "risk-adjusted discount" (not slippage). Optional **presale** clears at a constant price, scaled down pro rata if oversubscribed; presale depositors get the largest share of "counterparty-liquidity rewards". Without presale the market starts as a plain parimutuel and moves to continuous PMM trading at a configurable liquidity threshold. The curve family and parameters are stated to be proprietary ("not disclosed"). No formulas published.
- **Not a fixed-$1 share market (H):** payouts depend on the final pool, so there is no clean 0-1 price per outcome. The API exposes two numbers per outcome: `likelihoodBps` (sums to about 10,000 across outcomes; e.g. 2035+2032+2019+1709+2203 = 9,998) and `probabilityBps` (`oddsBasis: "IMPLIED_MIN_PAYOUT"`, does not sum to 10,000: the same five outcomes sum to 14,504). For arbitrage, only the quoted floor/cost is conservative (section 7).
- **Market types (H, enums in bundle + API):** `marketType: TRADITIONAL` only. `resolutionType`: `EXTERNAL_SOURCE` (all 589 current listed markets: Polymarket mirrors), `CREATOR_RESOLVED` (0 listed), `MOONSHOT` (5-minute "Up or Down" price rounds, served by a separate `moonshotMarkets` query). Outcomes: 2 to 32 (V1 docs, M/L) and categorical examples with 5 outcomes (central-bank decision), 3-way soccer (home/draw/away), 8-bucket ranges.
- **Tokenisation (M):** per-outcome "shares" tracked in program accounts (`outcomeTotalShares`, position `totalShares`); no evidence of a tradable SPL share token. Positions are claimed with an action (`claim-traditional-market-v3`).
- **Identifiers (H):** market `publicKey` = Solana account (base58); program `contractAddress`; `contractVersion` V1 (alpha) or V3 (current).
- **Legacy V1 (H docs, undated so L):** per-outcome bonding curve, SOL collateral, no selling ("No. Once you buy, you hold your position until the market expires"), winners get stake back plus pro-rata share of losing pools (`melee-1.gitbook.io/melee-docs`, "Alpha").

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain (beta) | Solana **devnet**. `deploymentCluster: "devnet"` in `traditionalMarketV3BuyQuote.context.quoteBasis`; bundle uses a Helius devnet RPC, wallet cluster auto-detect via genesis hash, `explorer.solana.com/?cluster=devnet` | H |
| V3 program | `Bz4AoAXL8vkTSFPqR52GwNxFixAbKPJ3VShhgoS2eV2G` (= every V3 market's `contractAddress`; `contractDeploymentId: "5"`). A third-party GitHub repo about Solana devnet also references it (untrusted, corroboration only) | H (API), M (GitHub hit) |
| Collateral (beta) | Mint `Aj1qyqJRvi7VFdCriNvLiiCvjkLW3pTRgFCKSyGtAbsk`, ticker "USD", 6 decimals; hard-coded default `NEXT_PUBLIC_CREATE_MARKET_TOKEN_MINT` in the bundle. "Free play" credits (daily case, welcome case, faucet flag, `cashoutBlocked`) are spendable. | H |
| V1 alpha | SOL (wrapped SOL mint, 9 decimals), program `HK4ai9cQNxF9Btu2aUXNiqGLKF88p3ep2cVEtYo7uK4m` (also in Jupiter `platform-list/src/platforms/melee.ts` with `NetworkId.solana`) | H (API), M (mainnet inference) |
| Wallets / auth | Privy embedded Solana wallets ("solana-only") plus external Solana wallets (Phantom etc.); sign-in with Solana (`logInWithSolanaWallet`) | H (bundle) |
| EVM | Bundle ships Privy/viem chain tables and MoonPay on-ramp mappings (Base, Arbitrum, Polygon, Avalanche...) but these are generic library code; no Melee market or token exists on any EVM chain | H (negative, M strength) |

---

## 4. Read API

**Exists: unofficial-only (undocumented first-party GraphQL).** The site says "API Docs (soon)". `https://docs.melee.markets/` returns HTTP 401 behind Vercel SSO (no way in without credentials; not attempted). The only public docs are the legacy V1 GitBook (`melee-1.gitbook.io/melee-docs`, no API pages) and the PMM litepaper (no API). (H)

| Item | Value | Tag |
|---|---|---|
| Staging GraphQL (used by the beta app) | `https://api.stg.melee.markets/graphql/` (HotChocolate on Kestrel). Answers plain HTTP GET: `?query={__typename}` -> `{"data":{"__typename":"RootQuery"}}`. Content type `application/graphql-response+json`. Introspection is **disabled** (`HC0046`), so operations come from the bundle (`beta.melee.markets/_next/static/chunks/6055-*.js`). | H |
| Subscriptions | `wss://api.stg.melee.markets/graphql/` (URL and operations in bundle: `OnMarketOdds`, `OnMarketStats`, `OnMarketEvent`, `OnPositionUpdate`, `OnMoonshotSchedulePrice`, ...). Not connected. | H (URL), untested |
| Solana-Actions-style tx builder | `https://api.stg.melee.markets/api/actions/<action>` (section 5) | H (bundle) |
| Prod-named GraphQL | `https://api.melee.markets/graphql/` older schema (no `markets`, `me`, `freePlayBalance`; has `market`, `latestMarket`, `moonshotMarkets`, `leaderboard`) | H |
| Auth / keys | None for the queries below. Mutations and `me`-style queries need a bearer token from `logInWithSolanaWallet` / `logInWithPrivy`. | H |
| Page size | `first` max is below 100 ("The maximum allowed items per page were exceeded"); 50 worked. Cursor paging via `pageInfo.endCursor`. | H |
| Rate limits | NOT FOUND (searched: homepage, litepaper, response headers on both GraphQL hosts show no rate-limit headers). About 130 GETs over roughly 20 minutes were not throttled. | M |
| Stability warning | It is a **staging** host used by a first-party front end; schema and host can change without notice. | M |

Key read operations (all H, from bundle documents; the first four were run live):

| Need | Query |
|---|---|
| Market list | `markets(input:{statuses:[LIVE], resolutionTypes:[EXTERNAL_SOURCE], sortBy:VOLUME, category:"politics"}, first:50, after:$c){totalCount pageInfo{hasNextPage endCursor} nodes{publicKey title lifecycleState resolutionType marketType contractVersion categories startDate endDate tradedVolumeUsd uniqueTraders marketTotalTokens token{tokenMint metadata{ticker decimals}} outcomes{... on TraditionalMarketsOutcome{title outcomeTotalTokens v3{odds{available likelihoodBps probabilityBps oddsBasis}}}}}}`. Enums: `MarketLifecycleState` = PRESALE, LIVE, RESOLVED, VOID, CANCELLED, FAILED, CLOSED, PENDING_RESOLVE, ARBITRATION, INITIALIZED, IN_PROGRESS, NOT_STARTED, PENDING; `sortBy` = NEWEST, VOLUME, CLOSING_SOON. `resolutionTypes:[MOONSHOT]` is rejected on `markets` ("served by moonshotMarkets"). |
| One market | `market(input:{marketPublicKey}){publicationSource{label url description rules sourceRules{sourceMarketId question outcomeIndexes}} settlementReadyAt market{... stats{volume buyVolume presaleVolume switchVolume cashoutVolume volumeUsd trades uniqueTraders lastTradeAt} resolution{outcomeIndex}}}` |
| Prices / quote (no order book) | `traditionalMarketV3BuyQuote(input:{marketPubkey, outcomeIndex, maxBudget, walletPubkey?}){success context{quoteBasis{deploymentCluster deploymentProgramId}} quote{totalCost expectedShares totalShareFloor currentPrice maxSharePrice currentPayoutOdds currentEventLikelihood} accounting{totalCostForShares actualTradingFee unusedBudget} availability{available minViableBudget maxSafeBudget}}` works without a wallet. Also `traditionalMarketV3SwitchPositionQuote`. |
| Odds history | `marketOddsHistory(input:{marketPublicKey, historyTimeFrame}){history{odds payoutOdds timestamp}}` (not run) |
| Trades | `marketActivity(input:{marketPublicKey}, first, after){edges{node{... on MarketBuyActivity{outcomeIndex sharesIssued tokensSpent signature slot userPublicKey} ... on MarketSwitchActivity ... on MarketCashoutActivity ... on MarketPresaleBidActivity}}}` (not run; exposes wallet addresses) |
| 5-minute price rounds | `activeMoonshotSchedules{...}`, `moonshotMarkets(input:{includeActive:true,includeResolved:true}, first)` with `startPrice endPrice resolutionMethod(SPOT|TWAP) winningOutcomeIndex`, `moonshotPriceHistory` |
| Resolution | `market.market.resolution.outcomeIndex`, `lifecycleState`, `settlementReadyAt`; Moonshot `winningOutcomeIndex` |
| Categories | `marketCategories(resolutionTypes, statuses){category count}`; `marketsByCategory` |

---

## 5. Trade path

**Programmatic only through the first-party server; not executed here (H, bundle code).**

1. Sign in: GraphQL `logInWithSolanaWallet(input)` (Sign-In-With-Solana style signature plus timestamp; errors `InvalidSignature`/`InvalidTimestamp`) or `logInWithPrivy`; returns a bearer `authorization.token`. Entry/invite codes (`submitEntryCode`) gate onboarding. (H)
2. Quote: `traditionalMarketV3BuyQuote`; the client then builds an "accepted quote" (marketPubkey, walletPubkey, outcomeIndex, maxBudget, `type` PHASE0/ACTIVATED, `toleranceBps`, `quoteBasis`) and optional `protections`. (H)
3. Build: `POST https://api.stg.melee.markets/api/actions/buy-traditional-market-v3` with `Authorization: Bearer ...` and `{account, orderId, outcomeIndex, maxBudget, ...}` returns an unsigned transaction. Similar actions: `bid-presale`, `claim-presale`, `claim-traditional-market-v3`, `switch-position-traditional-market-v3`, `claim-creator-rewards-traditional-market-v3`, `create-traditional-market-v3`. (H)
4. Sign with the Solana wallet, then either submit through any RPC or `POST /api/actions/sponsor/submit` (sponsored fee payer; Bearer + `signedTransaction` + `intentId`). The client reports back with `reportTradeExecution`. (H)
5. Cashout/switch exist but are capacity-limited ("Cashout capacity reached", "Cashout isn't available in this market phase"). (H, UI strings)

Signing scheme: Solana ed25519 transaction and message signatures. No EIP-712, no off-chain order book, no API keys. The program source/IDL is not published (NOT FOUND: searched GitHub code for the program IDs, `gh api` org/user `meleemarkets`).

---

## 6. PayBox reachability

- **EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon): no.** Melee has no EVM contracts. (H, section 3)
- **Solana: not usable in practice.** PayBox has Solana wallets (earlier research `docs/research/06-paybox-platform.md`), but (a) the live deployment is devnet with a worthless test token, (b) trades need a SIWS bearer login plus a server-built transaction, which is a custom flow rather than a plain proposal, and (c) the ToS forbids bots and unauthorised integrations (section 9). No PayBox tool was called.
- **paybox_reachable = no.**

---

## 7. Fees

| Fee | Value | Who pays | Tag |
|---|---|---|---|
| Trading fee on buys | **2.00%** of the cost-for-shares: a $10 budget on Bank of Korea outcome index 2 gave `totalCostForShares` 9,691,991, `actualTradingFee` 193,840 (= 2.0000%), `totalCost` 9,885,831, `unusedBudget` 114,169 (micro-USD). One sample; may vary by market or phase. | buyer, added on top | H (fixture), M (generality) |
| Minimum-return floor in that quote | `totalShareFloor` 15,678,235 micro-USD (about 1.59x of total cost) is the guaranteed minimum if the outcome wins; actual payout depends on the final pool | n/a | H |
| Creator share | "a portion of the platform fees" (litepaper); a secondary summary says up to 20% of trading fees (not verifiable, page blocked) | taken from fees | L |
| Cashout | "risk-adjusted discount to expected value" via cashout vault; no number published | seller | H (text), no value |
| Terms | "Fee amounts and structures may change at any time without prior notice, and the precise fee ... may not be disclosed in advance." | | H (ToS PDF) |
| Gas | Solana network fees; sponsored submission exists | | H |

---

## 8. Resolution and dispute risk

- **EXTERNAL_SOURCE (all current listed markets):** UI string "Settles on the source market's result." The market stores the source (`publicationSource`: label "Polymarket", event URL, per-sub-market `sourceMarketId`, rules). So Melee outcomes inherit **Polymarket's resolution (UMA oracle path) and its dispute risk**; Melee adds its own settlement latency (`settlementReadyAt`). (H)
- **CREATOR_RESOLVED:** "Independent resolver ... selected at market creation" / "A resolver you trust covers this market" (UI strings, H). The V1 docs said "Creator led resolution at first. Soon decentralized network of resolvers", unclear outcomes are voided and refunded (H, L age).
- **MOONSHOT 5-minute rounds:** price at round start vs end; BTC via `CHAINLINK_DATA_STREAMS`, ANSEM/SOL/SI via `BIRDEYE` with 60 s TWAP; `resolutionDelaySeconds` 5; the enum list also names PYTH, COIN_GECKO, COIN_MARKET_CAP, NBA/NFL/SOCCER feeds and `CUSTOM_API`. (H)
- **Disputes:** lifecycle state `ARBITRATION` and a client flag `NEXT_PUBLIC_DISPUTE_FILING_ENABLED` exist, but no documented dispute process and 0 markets were in ARBITRATION. Terms: "ALL MARKET RESULTS, DETERMINATIONS, AND RESOLUTIONS ARE FINAL AND MADE IN THE DISCRETION OF THE CREATOR OR COMPANY" and users waive the right to challenge. (H)
- Outcome states seen in the API: 1,027 RESOLVED, 35 VOID, 1,050 CANCELLED, 1,293 FAILED (presales that never launched). A high void/failed share is itself a counterparty risk for any hedge. (H)

---

## 9. Geo, ToS, automation

Source: `https://www.melee.markets/docs/melee-terms-of-use.pdf` (Melee Markets Inc.; text extracted with macOS PDFKit; no effective date found in the text). (H)

- **US excluded:** services "are not offered to persons or entities who reside in, are citizens of, are located in, are incorporated in, or have a registered office or principal place of business in the United States or any restricted jurisdiction" (also Crimea, Cuba, Iran, North Korea, Syria, Russia, sanctioned and crypto-restricted countries). 18+. "There are no exceptions."
- **Automation banned:** prohibited uses include "any robot, spider, or other automatic device, process, or means to access the Services for any purpose, including monitoring or copying", manual monitoring or copying "without our prior written consent", and "unauthorized integrations or smart-contract calls". Also bans wash trading, spoofing, front-running, interfering with resolution. A scraper or trading bot would breach these terms.
- Markets "creators or Company" decide results; Cayman governing law; JAMS arbitration in George Town, no class actions.
- Beta access is invite-code gated per the homepage, but the app and API read endpoints worked without any code (H).
- The privacy policy (`melee-privacy-policy.pdf`) was downloaded but not read.

---

## 10. Liquidity

All figures from `api.stg.melee.markets`, 2026-10-19, **test-token USD on devnet**.

| Metric | Value | Tag |
|---|---|---|
| Markets by state | PRESALE 188, LIVE 401, RESOLVED 1,027, VOID 35, CANCELLED 1,050, FAILED 1,293 (`totalCount` per `statuses` filter) | H |
| Cumulative traded volume | LIVE markets $43.79M; RESOLVED $50.80M (sum of `tradedVolumeUsd`/100; the field is in cents: `stats.volume` 328,059,135,531 raw / 1e6 = $328,059 vs `volumeUsd` 32,804,347) | H (arithmetic M) |
| Largest live market | "Bank of Korea decision in October?" pool `marketTotalTokens` 321,620,696,883 raw = $321.6k, 4,443 trades, 4,130 unique traders, 1,307 presale bidders, presale about $15.0k | H |
| Depth | A $10 buy on that market costs $9.89 and moves payout odds from 3888 to 3907 bps (about 0.2 pt) | H |
| Real-venue comparison | Same event on Polymarket (Gamma API, one GET, same hour): volume $42.9k, liquidity $13.5k | H |
| Price consistency vs Polymarket | Polymarket: hold 96.35%, 25 bps cut 0.15%, 50+ cut 0.05%, 25 hike 3.5%, 50+ hike 0.1%. Melee `likelihoodBps`: 50+ cut 20.35%, 25 cut 20.32%, hold 20.19%, 25 hike 17.09%, 50+ hike 22.03% (near-uniform) | H |
| Users | Homepage "49,247 predictors" (marketing); leaderboard and Melee Score system exist ("the foundation of all future rewards and point systems") | M |
| DefiLlama | Not listed in `api.llama.fi/protocols` (8,758 protocols scanned, no "melee") | H |
| V1 alpha scale | Last market pool 1,666,229,448 lamports = 1.67 SOL | H |

Interpretation (M): the volume is incentive farming for the points/airdrop programme on a faucet-funded test token. It has no price-discovery value.

---

## 11. Event coverage and overlap with other venues

Categories (market counts, LIVE set, from `categories`): politics 166, sports 110, finance 85, soccer 53, world 51, geopolitics 27, culture 18, tennis 15, football 12, NFL 11, basketball 9, tech 9. PRESALE adds esports, tennis, LoL. RESOLVED is sports-heavy (sports 846, soccer 280, tennis 221). (H)

- Almost everything is a **Polymarket mirror**: central-bank decisions, UMich sentiment, soccer 1X2, elections, earnings questions ("Will MSCI beat quarterly earnings?"). So overlap with Polymarket (and indirectly Kalshi, Limitless, etc.) is near 100% by construction; this is why Melee is a derivative leg, not an independent source of information. (H sample of 55)
- 5-minute BTC, SOL, ANSEM, SI "Up or Down" rounds overlap with crypto price markets elsewhere (Polymarket/Limitless/9lives-style short rounds). (H)
- No creator-originated (original) markets are live.

---

## 12. Shared liquidity, dependencies and revisit triggers

- **Liquidity:** each Melee market has its own PMM pool; it does **not** pool with Polymarket. Not shared in the CLOB sense. (H)
- **Information and resolution dependency:** outcomes and settlement are copied from Polymarket, so a Melee position is correlated 1:1 with the source market and inherits its resolution risk. For "independent arbitrage leg" purposes treat Melee as a dependent venue. (H)
- **Revisit if:** (a) Melee announces a mainnet V3 launch with a real collateral token (USDC), (b) docs.melee.markets or an API reference becomes public, (c) ToS adds an API/automation allowance, (d) markets show non-faucet volume and prices that track their sources. Re-run the fixture queries in section 13 against the production host.

---

## 13. Fixtures

All in `docs/research/fixtures/melee/` (creator wallet and username removed from the market-detail fixture; long rule texts truncated):

- `stg_graphql_markets_top_live_by_volume_2026-10-19.json` - `markets(...sortBy:VOLUME...)`, 3 nodes with outcomes and odds.
- `stg_graphql_market_detail_polymarket_mirror_2026-10-19.json` - `market(...)` with `publicationSource` (Polymarket) and stats.
- `stg_graphql_traditionalMarketV3BuyQuote_10usd_2026-10-19.json` - quote showing `deploymentCluster: "devnet"`, program ID and the 2% fee.
- `stg_graphql_activeMoonshotSchedules_2026-10-19.json` - four 5-minute schedules (Chainlink Data Streams / Birdeye).
- `stg_graphql_moonshotMarkets_2026-10-19.json` - three BTC rounds in PRESALE.
- `stg_graphql_market_counts_and_volume_summary_2026-10-19.json` - counts per lifecycle state and volume sums (cents).
- `prod_graphql_latestMarket_V1_2026-10-19.json` - older host, V1 SOL market from 2026-03-02.

---

## 14. NOT FOUND

- Official API documentation (searched: homepage footer, `docs.melee.markets` (401), litepaper, GitBook index, GitHub).
- Source code, IDL or audit for programs `Bz4AoAXL...` and `HK4ai9cQ...` (searched: `gh search code` by address, `gh api` for org/user `meleemarkets`; only a Jupiter platform-list entry and an unrelated devnet-study repo matched).
- PMM formulas, fee split, creator share, cashout discount (litepaper: "proprietary and not disclosed").
- Rate limits, websocket behaviour (not connected).
- Mainnet V3 deployment, TVL, DefiLlama or Dune data. The hint's January 2026 QQ News article and the Dune "#melee" query were not located (web search budget exhausted after one query).
- Privacy policy contents (not read); ToS effective date.
- `x.com/MeleeMarkets` (HTTP 402, not paid or bypassed), Medium and Solana Compass pages (HTTP 403).

---

## 15. Suspicious content / embedded instructions (recorded, not followed)

- `https://docs.melee.markets/` (Vercel "Protected Page", HTTP 401) contains a `<script type=text/llms.txt>` block "Note to agents accessing this page" that tells agents to use `vercel curl`, the Vercel MCP `web_fetch_vercel_url` tool, a Trusted Sources OIDC header, or to ask the user for a Protection Bypass token. This is Vercel's standard deployment-protection boilerplate, but following it would circumvent an access control on a private docs site, so it was ignored.
- The legacy GitBook welcome page mentions its `llms.txt` index and Markdown versions; this was used only as a page list (no instructions).
- The front-end bundle contains third-party Privy, WalletConnect and MoonPay client code and a dedicated-subdomain devnet RPC URL; the RPC URL and client IDs are deliberately not copied here.

---

## 16. Sources

Primary (H):
- https://melee.markets (homepage; hrefs: beta.melee.markets, pmm.melee.markets, x.com/MeleeMarkets, discord, t.me/meleealpha, terms and privacy PDFs)
- https://beta.melee.markets (HTML and `/_next/static/chunks/*.js` bundles, read as static text)
- https://pmm.melee.markets and https://pmm.melee.markets/litepaper
- https://api.stg.melee.markets/graphql/ and https://api.melee.markets/graphql/ (unauthenticated GET queries, 2026-10-19)
- https://www.melee.markets/docs/melee-terms-of-use.pdf and /docs/melee-privacy-policy.pdf
- https://melee-1.gitbook.io/melee-docs (welcome, FAQ, market structure, payouts, resolution, glossary, llms.txt) - legacy V1, undated (L)
- https://gamma-api.polymarket.com/events?slug=bank-of-korea-decision-in-october (one GET, comparison only)
- https://api.llama.fi/protocols (negative check)
- https://github.com/jup-ag/platform-list (`src/platforms/melee.ts`, via `gh api`)

Secondary (M/L):
- https://www.chaincatcher.com/en/article/2208752 (2025-09-26, $3.5M seed led by Variant; stale)
- WebSearch result summary (2026-10-19) citing Solana Compass, a Medium post and Melee X posts on the PMM; not opened (403/402)
- https://solanacompass.com/projects/melee-markets (HTTP 403, not read)
