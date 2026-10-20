# Trust Wallet Predictions (trustwallet.com/prediction-markets) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads (WebFetch and plain GET with `insurance-markets-research/0.1`), public `gh api` raw reads of `trustwallet/*` and `DefiLlama/dimension-adapters`, unauthenticated GETs to `data-api.polymarket.com`, `docs.polymarket.com`, `docs.predict.fun`, `docs.swaps.xyz`, `api.llama.fi`, `stats-data.hyperliquid.xyz`, `itunes.apple.com`. No account, wallet, key, signature, POST/PUT/DELETE, payment, PayBox tool or browser automation. Third-party text was treated as untrusted data; nothing in it was followed. The WebSearch budget (shared by all agents) ran out after two queries, so press coverage beyond those was not read; everything below rests on first-hand reads of official pages and public data endpoints.

Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale (older than 6 months is flagged). "Plain GET" means the raw server HTML was fetched and converted to text locally.

Fixtures (7 files, each under 7 KB): `docs/research/fixtures/trust-wallet-prediction-markets/` (section 12).

Sibling notes in this repo are cited where they own the detail: `metamask-polymarket-integration.md`, `binance-wallet-prediction-markets-via-predict-fun.md`, `hyperliquid-outcomes-hip-4.md`, `docs/research/06-paybox-platform.md`.

---

## 0. Verdict

**adapter_priority: skip** (as a venue or arbitrage leg). Keep a registry record only (section 13).

1. **Live, but it is a wallet front end, not a venue.** Trust Wallet's "Predictions" tab routes to third-party venues: Polymarket (via MoonPay's Swaps.xyz), Predict.fun (BNB Chain) and Hyperliquid HIP-4. Its Dec 2025 launch post also names Myriad (H). "All events, outcome tokens, pricing and resolution logic are operated by external partners" (H, Trust Wallet's own FAQ).
2. **Not an independent arbitrage leg.** It has no book, oracle, token or API of its own. Each exposure is 100% the underlying venue's liquidity, so it must not be counted next to Polymarket, Predict.fun or HIP-4 (section 11).
3. **No integrable interface.** No public or private API, SDK or docs for Predictions were found. Trust Wallet's developer docs (`trustwallet/developer`, excluding its wallet-core, barz-smart-wallet and assets sections) and its official agent-skills repo contain no mention of predictions, Polymarket, Hyperliquid or HIP-4 (H, grep, section 14). The only access is the mobile app UI.
4. **Its marketing is partly wrong or stale** and must not feed the fee model: "Polymarket charges zero trading fees" contradicts Polymarket's own fee page, and "Hyperliquid fees are currently zero for outcome markets" predates HIP-4 fees (section 6).
5. **Measurable flow looks small and shrinking.** Swaps.xyz-attributed Polymarket volume fell from $8.5M (Jul 2026) to $0.02M (1-19 Oct), and Trust Wallet's Hyperliquid builder address shows zero HIP-4 outcome fills on 8 sampled days (section 9).
6. **Correction to a sibling note:** `binance-wallet-prediction-markets-via-predict-fun.md` (Press bullet) attributes "125k users / 3.7M transactions" to Trust Wallet. In Trust Wallet's own posts those figures are **Predict.fun's** all-time totals (H, section 9). I did not edit that file (this task writes only this note and fixtures).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://trustwallet.com/prediction-markets (plain GET 2026-10-19) | Page up; footer "Last updated: May 6, 2026"; JSON-LD `dateModified` 2026-05-29. Banner "This feature is not available in your region" is in the server HTML (also seen via WebFetch) | H |
| Region banner | Rendered as a separate section in the SSR output, so it is probably conditional on the requester's region; I could not test other regions (and have not named mine) | M |
| Blog posts (plain GET) | "Introducing Predictions" published 2025-12-02, updated 2026-07-17 ("Predictions is now live for eligible users"); Polymarket post 2026-02-10; Predict.fun posts 2026-03-18 and 2026-03-24; HIP-4 post 2026-05-29; sitemap `lastmod` 2026-07-17 for the three posts whose URLs contain "prediction"; the HIP-4 post itself says updated 2026-07-17 | H |
| App | iTunes lookup: "Trust: Crypto & Bitcoin Wallet" v26.42.4 released 2026-10-16, 199,124 ratings. Release notes are generic and do not mention Predictions | H (fixture) |
| DefiLlama | `trust-wallet-perps` (id 7769, tag Hyperliquid Builder) has fee data to 2026-10-18; there is **no prediction-market row** for Trust Wallet | H |
| In-app state | Not testable without the app. The page content is 5.4 months old, close to the 6-month stale line | M |
| Polymarket routing health | Swaps.xyz-attributed Polymarket volume collapsed after July (section 9). Either routing changed, builder attribution changed, or the leg is dormant | M |

**still_live = true** for the product page and the wallet; the live state of each in-app venue is unverified.

---

## 2. Kind and market model

- **Kind (H):** broker / front end inside a self-custody wallet (mobile app, "designed to feel familiar, simple, and mobile-native"). The product page says "your keys, your positions, your payout"; "Only curated, vendor-supported events are available at launch" (curated subset of each venue).
- **Market model (H, official pages):** YES/NO outcome shares priced $0-$1, winners pay $1. Multi-outcome ("non-binary") events are shown. The model is the underlying venue's:
  - Polymarket: binary CLOB plus neg-risk multi-outcome groups (see Polymarket spec / `metamask-polymarket-integration.md`).
  - Predict.fun: binary and multi-outcome order book on BNB Chain.
  - Hyperliquid HIP-4: binary and multi-outcome, merged CLOB on HyperCore. Trust Wallet's HIP-4 post describes a recurring daily BTC price-range market settling at 06:00 UTC to Hyperliquid's BTC-USDC mark price (H).
- **Tokenisation:** the venue's own tokens, held "on-chain through the vendor's smart contracts" (H). Trust Wallet issues no token. Exact token standards belong to each venue's spec.
- **Venue list is inconsistent across Trust Wallet's own pages (H):** the product page lists three venues (Polymarket, Predict.fun, HIP-4) but its fees paragraph still mentions Myriad; the Dec 2025 post lists four (adds Myriad). Myriad is covered by another workflow.

---

## 3. Chains and collateral

| Leg | Chain / collateral as stated by Trust Wallet | Tag |
|---|---|---|
| Polymarket | "tradable from 14 chains using USDC or USDT, routed via MoonPay's Swaps.xyz infrastructure". Chains: Polygon, Ethereum, BNB Chain, Optimism, Arbitrum, Base, Avalanche, Celo, Blast, Scroll, zkSync, Mantle, Sonic, Plasma (the Feb 2026 post spells "Stroll"). Settlement chain is Polygon | H (pages); settlement per Swaps.xyz docs below |
| Swaps.xyz mechanics | Docs: "Polymarket positions settle using pUSD on Polygon (chain ID 137), contract `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`"; each user gets a "deposit (proxy) wallet" tied to their EOA; any-chain funding is swapped into collateral. Whether Trust Wallet uses exactly this documented flow is inferred from its statement that it routes via Swaps.xyz | H (docs) / M (inference) |
| Predict.fun | BNB Chain; "Predict.fun markets use USDT stablecoins on BNB Chain"; collateral earns yield via Venus while a position is open (Trust Wallet's description) | H (Trust Wallet blog); Predict.fun spec owns the rest |
| Hyperliquid HIP-4 | Hyperliquid L1 (HyperCore); "The assets you deposit can be converted to $USDC in one click"; positions shown next to Trust Wallet's Hyperliquid perps | H |
| Platform | Mobile app. Browser-extension support for Predictions: NOT FOUND (the posts refer only to the app) | H (absence) |

---

## 4. Read API

**Official public read API for Trust Wallet Predictions: none.** NOT FOUND (searched: product page and four blog posts; `developer.trustwallet.com` source repo `trustwallet/developer` including the MCP/API-gateway and agent-sdk pages; `trustwallet/tw-agent-skills`; DefiLlama protocol list). The Trust Wallet page links only Developer Docs, Wallet Core and Support; the developer-doc repos grep clean for "predict", "polymarket", "hyperliquid", "hip-4" (H, grep of all downloaded `.md`/`.json`; the wallet-core, barz-smart-wallet and assets sections of `trustwallet/developer` were not downloaded because they are chain-library and token-listing docs).

What exists instead, none of it Trust Wallet's:

- **Polymarket** public Gamma / CLOB / Data APIs (Polymarket spec).
- **Predict.fun** official API (Predict.fun spec); Predict.fun docs mention no Trust Wallet integration, only a Binance Wallet referral program (H, `docs.predict.fun/llms.txt` grep).
- **Hyperliquid** keyless WS and `POST /info` (HIP-4 spec `hyperliquid-outcomes-hip-4.md`).
- **Swaps.xyz Prediction Market API** (keyed): Polymarket discovery, prices, positions and trading for any-chain funding. Base `https://api-v2.swaps.xyz/api/...`, auth header `x-api-key` from `console.swaps.xyz`, endpoints include `POST /createOrFetchPolymarketUser`, `GET /getAction` (`actionType=polymarket`), `POST /placeOrder` (EIP-712 `signatureByEvmEoa`), `GET /workflows/getStatus`, plus market and position reads. Rate limits only described as "highly ratelimited" for the test key; no numbers; no fee statement (H, `docs.swaps.xyz/prediction-market-reference/overview.md` and `integration-patterns.md`; fixture). It is a generic B2B API, not evidence of Trust Wallet's private integration, and it adds nothing the Polymarket CLOB does not give directly.
- **Public attribution data** (usable as a weak signal, section 9): Polymarket `GET /v1/builders/leaderboard` and `/v1/builders/volume` (undocumented, under `/v1/`; sibling notes record that Data API v1 is retired on 2026-10-24, M, not re-verified); Hyperliquid bulk `stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4`; DefiLlama `api.llama.fi/summary/fees/trust-wallet-perps`.

WebSocket: none from Trust Wallet. Rate limits: none documented (NOT FOUND).

---

## 5. Trade path

- **No programmatic path for Trust Wallet Predictions.** The only interface is the mobile UI ("Open Trust Wallet, tap Trade, then open the Predictions tab"; H). There is no order API, signing scheme or SDK to adapt.
- **Trust Wallet's agent tooling does not cover it (H):** the `twak` CLI skills in `trustwallet/tw-agent-skills` (`wallet/` references: alerts, automations, balance, compete, erc20, erc8004, erc8183, history, market, onramp, send, swap, token-risk, wallet, x402) contain no prediction commands.
- **Reachable through PayBox? No, for Trust Wallet itself** (nothing to call; PayBox cannot drive another wallet's app). The **same exposures are reachable only through the underlying venues' own adapters**:
  - Polymarket on Polygon: EIP-712 typed-data orders and pUSD approvals; PayBox's chain catalogue lists Polygon 137 (per sibling `06-paybox-platform.md`, M here). Funding from Ethereum, BNB, Optimism, Arbitrum, Base or Avalanche is also in that catalogue; Celo, Blast, Scroll, zkSync, Mantle, Sonic and Plasma are not (M, inference from the sibling catalogue).
  - Predict.fun on BNB Chain (56 is in the PayBox catalogue, M): Predict.fun spec.
  - HIP-4 on HyperCore: not an EVM transaction path; needs typed-data signing and realistically an approved agent key; PayBox reach is "partial" per `hyperliquid-outcomes-hip-4.md` (M).
- Using Swaps.xyz as a funding hop would add a keyed third party and no extra liquidity; the direct Polymarket route dominates.

---

## 6. Fees

| Component | Statement / formula | Payer -> receiver | Tag |
|---|---|---|---|
| Trust Wallet platform fee | "$0 Trust Wallet fee"; "Trust Wallet doesn't charge a platform fee"; HIP-4: "does not charge any markup" | - | H (3 official pages) |
| Trust Wallet comparison | Page claims MetaMask discloses 4%; consistent with `metamask-polymarket-integration.md` | - | H |
| Polymarket | Trust Wallet says "Polymarket charges zero trading fees". **Wrong or stale.** Polymarket fee page: taker fee `fee = C x feeRate x p x (1 - p)`, rates Crypto 0.07, Sports 0.05, Economics/Culture/Weather/Other 0.05, Finance/Politics/Mentions/Tech 0.04, Geopolitics 0; makers pay nothing | taker -> Polymarket | H (https://docs.polymarket.com/trading/fees.md) |
| Predict.fun | Makers free; takers pay base fee (up to 2%) x min(p, 1-p) x shares, 10% discount optional | taker -> Predict.fun | H (https://docs.predict.fun/the-basics/predict-fees-and-limits.md) |
| Hyperliquid HIP-4 | Trust Wallet (post updated 2026-07-17) says outcome fees are zero. Sibling note records fees enabled from 2026-08-15 (fee on close/settle, deployer scale), about 12-16 bps effective | closer -> Hyperliquid / deployer | M (stale claim); see `hyperliquid-outcomes-hip-4.md` |
| Routing / swap cost | Cross-chain funding via Swaps.xyz: any spread, swap or builder fee is **not stated** on Trust Wallet pages or in the Swaps.xyz docs. Swaps.xyz does hold a Polymarket builder code (section 9), so a builder fee is possible; Polymarket caps builder fees at 100 bps taker (per `metamask-polymarket-integration.md`, H there) | user -> Swaps.xyz/MoonPay? | NOT FOUND |
| Gas | "you pay only network gas" on the funding chain | user | H (page) |

**Arbitrage consequence:** model each leg with the underlying venue's fee schedule read live; treat Trust Wallet's "$0" as unverified for the Polymarket and HIP-4 legs. A Trust Wallet-routed leg can only be equal to or worse than going direct.

---

## 7. Resolution and dispute risk

- Trust Wallet: "No. All events, outcome tokens, pricing and resolution logic are operated by external partners." (H). It cannot resolve, override or reverse anything.
- Polymarket: Trust Wallet's explainer says decentralized oracles with a Market Integrity Committee for ambiguous cases (H, its own text); UMA detail is in the Polymarket spec / `metamask-polymarket-integration.md`.
- Predict.fun: Trust Wallet's explainer describes "AI-assisted proposals and human verification" plus UMA's Optimistic Oracle with a challenge window (M: Trust Wallet's description of another party; Predict.fun spec owns the primary source).
- HIP-4: the recurring BTC market settles by code; most other outcomes are deployer-settled with no trader dispute process (per `hyperliquid-outcomes-hip-4.md`, M).
- Extra operational risk (M, inference): the app can hide a market or geo-block a region while the venue keeps trading; "curated" means the app shows a subset.

Dispute and ambiguity risk is identical to, and perfectly correlated with, the underlying leg.

---

## 8. Geo, ToS, automation

- **Trust Wallet product page / FAQ (H):** "Availability is set by each venue, not by Trust Wallet... Trust Wallet automatically geofences markets where the venue restricts access." The Dec 2025 FAQ: "Access varies by region and is determined by each external vendor... Learn more... in their Terms of Service." HIP-4 post: "Availability may vary by country or region."
- **Trust Wallet Terms of Service (fetch-tool summary, last updated Jan 1, 2024 per that summary, M):** do not mention Predictions or Perps. Generic clauses: use "strictly for your personal or internal business use"; no "competitive analysis purposes"; no "unreasonable or disproportionately large load"; comprehensively sanctioned jurisdictions barred; Trust Wallet may change eligibility. No API or bot clause by name. There is no automation licence for the Predictions UI, and no API to automate. Terms are old (older than 6 months, L).
- **Venue terms apply on top:** Polymarket International (US and many other regions blocked; see Polymarket spec); Predict.fun ToS `https://docs.predict.fun/terms-of-service` (linked from Trust Wallet's post, not read here); Hyperliquid blocks US and Ontario residents and has an open-ended "Excluded Persons" list for outcome markets (per `hyperliquid-outcomes-hip-4.md`, H there). The plugin should treat the **union** of venue restrictions as the Trust Wallet restriction, and cannot see Trust Wallet's own geofence list (NOT FOUND).

---

## 9. Liquidity

Trust Wallet publishes **no** Predictions volume, OI or user figure (NOT FOUND, searched: product page, four blog posts). Figures on its pages are venue totals:

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| Predict.fun totals quoted by Trust Wallet | "$1.7B+ trading volume, 125K+ users, 3.7M+ transactions" (Mar 2026 post says "$1.7 billion... since its December 2025 launch"; its "About" paragraph says $1.5B). These are **Predict.fun's** totals, not Trust Wallet's | Trust Wallet pages, updated 2026-07-17 / page 2026-05-06 | H (as quoted); figures themselves M |
| Polymarket "$18B+ total volume" | Venue total quoted on the page | same | M |
| Polymarket flow attributed to Swaps.xyz (builder `swaps.xyz`) | All-time $28.85M, 4,274 active users, rank 34. Monthly: Dec 2025 $2.8K; Jan $6.9K; Feb $1.55M; Mar $3.62M; Apr $4.06M; May $6.12M; Jun $4.58M; **Jul $8.50M** (1,290 users); Aug $0.25M (93); Sep $0.14M (13); **Oct 1-19 $0.02M** (15). Not in the top 50 for MONTH, WEEK or DAY windows. Swaps.xyz serves other integrators, so Trust Wallet's share is unknown and at most this | `data-api.polymarket.com/v1/builders/{leaderboard,volume}`, 2026-10-19; fixture | H (data) / M (attribution to Trust Wallet) |
| Hyperliquid HIP-4 via Trust Wallet | Trust Wallet's builder address (from DefiLlama's adapter `trust-wallet-perps`, start 2026-04-08) has **zero outcome (`#`) fills** on 2026-06-02, 07-05, 08-02, 09-01, 10-01, 10-16, 10-17 and 10-18, while a known outcome builder (Outcome.xyz) shows ~190k outcome fills / $2.92M notional on 2026-10-18. The same Trust Wallet address does carry perps and HIP-3 flow (e.g. 2026-10-18: perps $5.4M, HIP-3 $0.44M notional, 568 and 89 distinct users). So either HIP-4 orders carry no builder code (consistent with "no markup") or flow is negligible; **Trust Wallet's HIP-4 volume is not measurable from public data** | `stats-data.hyperliquid.xyz/Mainnet/builder_fills/...`, sampled days; fixture (addresses dropped) | H (data) / M (reading) |
| Trust Wallet Perps (context) | DefiLlama fees 24h $27,960 (2026-10-18), 30d $1.52M, all-time $3.47M; perps only. DefiLlama fee units not reconciled with the builder-fill file | `api.llama.fi/summary/fees/trust-wallet-perps`, 2026-10-19; fixture | H |
| Trust Wallet user base | Page cites app ratings 4.7 (197K) and 4.6 (2.5M); "125K users" in posts is Predict.fun's. No Predictions user count | pages; iTunes 199,124 ratings | H |
| TVL / OI | none; no DefiLlama prediction row | `api.llama.fi/protocol/trust-wallet-perps` | H |
| Order-book depth | the underlying venue's book | - | H |

**Scale read (M):** Polymarket International does about $2.25B per 30 days (per `metamask-polymarket-integration.md`, DefiLlama 2026-10-19); even the July Swaps.xyz peak is under 0.5% of that.

---

## 10. Event coverage and overlap

Trust Wallet's claim: "Politics, sports (NFL, NBA, global leagues), crypto milestones, financial markets, weather, and pop culture. Available markets vary by venue." (H, page FAQ). Everything is a curated subset of the three venues, so categories are exactly theirs: sports, politics, crypto price ladders, macro/Fed (Polymarket and HIP-4), culture. All overlap Kalshi, Polymarket US, Limitless, Opinion, XO and others. **No category exists only on Trust Wallet** (M, inference). A Trust Wallet-visible market is a strict duplicate of the venue's own market.

## 11. Shared liquidity

**Shares 100% of its liquidity with, and is not independent of:** Polymarket International (via Swaps.xyz/MoonPay), Predict.fun (same book also surfaced by Binance Wallet, see `binance-wallet-prediction-markets-via-predict-fun.md`), Hyperliquid HIP-4 (same HyperCore books as every HIP-4 front end), and Myriad if still integrated. A mid read from Trust Wallet would equal the venue mid plus any routing wedge. (H for the mechanism: Trust Wallet's own "operated by external partners" statements.)

---

## 12. Fixtures

In `docs/research/fixtures/trust-wallet-prediction-markets/` (all fetched 2026-10-19 by unauthenticated GET; no user or counterparty addresses kept):

| File | Source | Shows |
|---|---|---|
| `trustwallet_prediction-markets_page_excerpt_2026-10-19.txt` | plain GET of the product page | venues, chains, "$0" fee claims, geo FAQ |
| `trustwallet_blog_excerpts_2026-10-19.txt` | plain GET of 4 official posts | launch dates, MoonPay/Swaps.xyz routing, HIP-4 and Predict.fun details |
| `swaps-xyz_prediction-market_docs_excerpt_2026-10-19.txt` | `docs.swaps.xyz/prediction-market-reference/{overview,integration-patterns}.md` | keyed API, endpoints, pUSD on Polygon |
| `polymarket_builders_swaps-xyz_2026-10-19.json` | Polymarket builder leaderboard and volume | Swaps.xyz monthly series and rank |
| `hyperliquid_builder_fills_trust-wallet_aggregate_2026-10-19.json` | Hyperliquid bulk builder fills, aggregated | zero outcome fills for Trust Wallet's builder, control builder |
| `defillama_trust-wallet-perps_trimmed_2026-10-19.json` | `api.llama.fi/summary/fees/trust-wallet-perps` | Hyperliquid builder, perps fees, no prediction row |
| `appstore_lookup_trust_2026-10-19.json` | iTunes lookup | app v26.42.4 released 2026-10-16 |

---

## 13. Adapter recommendation

- **skip** for trading and for a market-data adapter (duplicate liquidity, no API).
- **Registry record only**, per the pool-graph rule in `docs/platform-registry-design.md`: `kind: wallet_frontend`, `routes_to: [polymarket-international (via swaps.xyz), predict-fun, hyperliquid-hip4, myriad?]`, `independent_liquidity: false`, `pool: <each underlying pool>`, `fee_stack: {front_end: 0 stated, plus underlying venue fees, routing cost unknown}`, `geo: union of venue lists plus Trust Wallet geofence`, `platform: mobile`, `api: none`, `state: live (unverified in-app)`, `swaps_xyz_polymarket_builder_code: 0x0debb5b45680834ad97e99f6a4730791f5cf731237ac1bcf9fb1247254998322` (H, Polymarket builder data), `hl_builder_address: 0x5af1b5f44207784dcb850bbb4143c5dcd1885f71` (H via DefiLlama adapter; public protocol identifiers, not user wallets).
- **Optional weak signal (P2-style, not recommended to build):** Swaps.xyz builder volume as a proxy for wallet-originated Polymarket flow. It is not a fair-value input and rides on an undocumented Polymarket path that may vanish with Data API v1.

## 14. NOT FOUND

- Any Trust Wallet API, SDK, OpenAPI, rate limit or developer terms for Predictions (searched: product page, 4 blog posts, `trustwallet/developer`, `trustwallet/tw-agent-skills`, `trustwallet/trust-connect-sdk` file lists, DefiLlama).
- How Trust Wallet signs and submits orders (EOA direct vs Swaps.xyz proxy wallet vs agent key) (searched: same).
- Any Trust Wallet, Swaps.xyz or MoonPay fee/spread statement for prediction trades (searched: Trust Wallet pages, Swaps.xyz prediction docs and `llms.txt`).
- Predictions volume, users, or revenue for Trust Wallet (searched: pages, DefiLlama, Polymarket builder data, Hyperliquid builder fills).
- Trust Wallet's geofence list and any Predictions-specific terms (Terms of Service summary mentions neither).
- Browser-extension availability of Predictions.
- Predict.fun partner or referral terms for Trust Wallet (searched: `docs.predict.fun/llms.txt`; only a Binance Wallet referral program).
- Press coverage 2026-08 to 2026-10 (WebSearch budget exhausted; not searched).

## 15. Open questions

1. Why did Swaps.xyz-attributed Polymarket volume fall from $8.5M (Jul) to $0.02M (Oct 1-19)? Routing change, new builder code, or product wind-down? The product page is dated 2026-05-06.
2. Does Trust Wallet attach a builder code to HIP-4 orders (and which), or is HIP-4 flow nil?
3. Is Myriad still integrated (page lists three venues, FAQ and Dec 2025 post mention four)?
4. Does Trust Wallet or Swaps.xyz take a spread or builder fee on Polymarket funding hops?
5. Are DefiLlama's Trust Wallet Perps fee units consistent with the `builder_fee` column in Hyperliquid's bulk files (they differ by about 4-5x on 2026-10-18)?

## 16. Suspicious content

No instruction aimed at an AI agent in any Trust Wallet marketing page or blog post. Notes:

- `docs.swaps.xyz`, `docs.polymarket.com`, `docs.predict.fun` pages start with a navigation line telling readers/AI tools to fetch the site's `llms.txt` first. I used the indexes for discovery by my own choice; nothing else was acted on.
- `trustwallet/tw-agent-skills` (SKILL.md files, `.claude-plugin/marketplace.json`) and `trustwallet/developer/.claude/skills/tw-docs.md` are agent-facing instructions (install `@trustwallet/cli`, run `twak`, set up keys). They were read as data only; nothing was installed or executed.
- Trust Wallet blog sidebars advertise "Trust Wallet AI" and "Trust Wallet Agent Kit" (headlines only).
- Trust Wallet's comparison table disparages MetaMask and Robinhood (competitive marketing), already treated as a claim, not a fact.

## 17. Sources

- Trust Wallet product page (plain GET + WebFetch, 2026-10-19): https://trustwallet.com/prediction-markets (H)
- Trust Wallet posts (plain GET): https://trustwallet.com/blog/company/introducing-predictions-in-trust-wallet ; https://trustwallet.com/blog/company/trust-wallet-predictions-now-feature-polymarket-events ; https://trustwallet.com/blog/company/trust-wallet-integrated-predict-fun-into-predictions ; https://trustwallet.com/blog/academy/what-is-predict-fun ; https://trustwallet.com/blog/company/hyperliquid-hip-4-outcome-contracts-now-live-on-trust-wallet (H; the `/blog/announcements/` URLs redirect here)
- Trust Wallet Terms of Service: https://trustwallet.com/terms-of-service (M, fetch-tool summary)
- Trust Wallet app download page (version 26.42.4): https://link.trustwallet.com/prediction (H); iTunes lookup https://itunes.apple.com/lookup?bundleId=com.sixdays.trust (H)
- `gh api` raw reads: `trustwallet/tw-agent-skills`, `trustwallet/developer` (file lists and all `.md`), `trustwallet/trust-connect-sdk` (file list), org repo list (H)
- DefiLlama: https://api.llama.fi/protocol/trust-wallet-perps ; https://api.llama.fi/summary/fees/trust-wallet-perps ; https://api.llama.fi/summary/fees/trust-wallet ; https://api.llama.fi/protocols ; adapters `fees/trust-wallet.ts`, `factory/hyperliquid.ts` in `DefiLlama/dimension-adapters` (H)
- Polymarket: https://docs.polymarket.com/trading/fees.md ; https://docs.polymarket.com/llms.txt ; https://data-api.polymarket.com/v1/builders/leaderboard ; https://data-api.polymarket.com/v1/builders/volume (H)
- Predict.fun docs: https://docs.predict.fun/the-basics/predict-fees-and-limits.md ; https://docs.predict.fun/llms.txt (H)
- Swaps.xyz docs: https://docs.swaps.xyz/prediction-market-reference/overview.md ; https://docs.swaps.xyz/prediction-market-reference/integration-patterns.md ; https://docs.swaps.xyz/llms.txt (H)
- Hyperliquid bulk builder fills: https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4 (H)
- Search results, summaries only (the tool's page summaries were not opened): crypto-economy.com, bitget.com news, beincrypto.com, cryptobriefing.com on Trust Wallet's HIP-4, Predict.fun and MoonPay integrations (L; superseded by the official pages above)
- Sibling notes (M for anything not re-checked here): `docs/research/venues/metamask-polymarket-integration.md`, `docs/research/venues/binance-wallet-prediction-markets-via-predict-fun.md`, `docs/research/venues/hyperliquid-outcomes-hip-4.md`, `docs/research/06-paybox-platform.md`

Privacy: every outbound request used the User-Agent `insurance-markets-research/0.1`; the helper scripts were grepped for `@` (one hit, a Hyperliquid spot-coin prefix literal in a classifier, not an address) and for personal names before running; no personal identifier appears in any request, query string, note or fixture. User and counterparty addresses in Hyperliquid's bulk files were aggregated away and never written.
