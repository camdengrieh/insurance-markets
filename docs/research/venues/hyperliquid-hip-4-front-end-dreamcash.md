# Hyperliquid HIP-4 front end: Dreamcash - venue spec

Researched 2026-10-19. READ-ONLY (page reads, keyless GETs to DefiLlama, no accounts, wallets, signatures, POSTs or PayBox money tools). Web search budget was exhausted, so no news searches were run. Third-party text treated as untrusted data.

Tags: H = read first-hand in a primary source this session (URL cited); M = secondary or inferred; L = weak or stale.

This note is the slug-specific companion to the fuller earlier write-up `docs/research/venues/dreamcash.md` (same day, same conclusions) and to the pool spec `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`. Key figures below were re-fetched this session.

## 0. Bottom line

- Dreamcash is a live Hyperliquid trading front end (perps, spot, stocks/commodities/forex, "prediction markets"), not a venue with its own markets. Its outcome markets are Hyperliquid HIP-4 outcomes. (H)
- It is NOT an independent arbitrage leg: books, settlement and liquidity are Hyperliquid's. Dreamcash is only a builder-code attribution tag on the shared pool. (H)
- Volume through Dreamcash's outcome builder code is trivial: $1,198 in 30 days, $12,480 all-time vs $47.0M / $261.1M for the whole Hyperliquid Outcomes pool (about 0.003% / 0.005%, my arithmetic). (H)
- adapter_priority = skip for Dreamcash as a venue. Build one Hyperliquid HIP-4 adapter; record Dreamcash as `front_end` metadata.
- Correction to the discovery hint: the DefiLlama row "Dreamcash Markets" is the retired HIP-3 CASH perps deployer (dead from 2026-07-03, M, see earlier note citing the DefiLlama adapter); only "Dreamcash Outcome" concerns outcomes.

## 1. Still live (2026)?

- https://www.dreamcash.xyz/ fetched 2026-10-19: describes a trading app on Hyperliquid for Android, iOS, web, macOS with perps, spot, real-world assets and "Prediction markets"; the page itself never mentions HIP-4. (H)
- https://docs.dreamcash.xyz/ intro: "mobile trading interface for Hyperliquid", self-custodial wallets, fiat on-ramps; no mention of outcome markets, fees, API. (H)
- Terms of Use, "Last Updated: 1 July 2026", contain Outcome Markets clauses: access restricted from certain jurisdictions "together with the United States and Canada"; "SLL does not create, sponsor, operate, administer, or resolve any Outcome Market". https://www.dreamcash.xyz/terms-of-use (H)
- DefiLlama `dreamcash-outcome` daily series has a non-zero day on 2026-10-17 ($950) and $0 on 2026-10-18. https://api.llama.fi/summary/dexs/dreamcash-outcome?dataType=dailyVolume (H)
- Verdict: still_live = true, but outcome use is near-idle.

## 2. Kind and market model

- Kind: broker / front end (interface layer, not counterparty). (H, Terms)
- Market model: whatever HIP-4 provides: fully collateralised binary outcomes on a native Hyperliquid CLOB (Yes/No pair), plus multi-outcome "questions". Dreamcash creates, lists and resolves nothing. Details in the pool note (M here).
- Tokenisation in Dreamcash's web-app cache: outcome 12722 -> yesCoin `#127220`, noCoin `#127221` (`#<10*outcome+side>`). 231 entries (21 questions + 210 standalone) at 2026-10-18T06:30Z, i.e. the whole HIP-4 universe, not a curated subset. Fixture `web_app_outcome_metas_sample.json`. (H for data seen; M for inference). That cache is an app-internal format; scraping it is not a supported interface.

## 3. Chains and collateral

- Hyperliquid L1 / HyperCore only (DefiLlama chain "Hyperliquid L1"). (H)
- Collateral for outcomes not stated on any Dreamcash page. HIP-4 quote is USDC per the pool note (M). Wallet: Privy email wallet or imported/WalletConnect wallet (earlier note, M).

## 4. Read API

- exists: none from Dreamcash. NOT FOUND (searched: docs.dreamcash.xyz intro, llms.txt index, dreamcash.xyz home; earlier note also /build and the Terms). `api.dreamcash.xyz` exists in the public JS (points, geo, funding, favourites) but is an undocumented account backend; not called. (M)
- For data use Hyperliquid directly: `POST https://api.hyperliquid.xyz/info` (outcomeMeta, l2Book, settledOutcome) and `wss://api.hyperliquid.xyz/ws`. Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api . Shapes and rate limits are in the pool note. `/info` is POST-only, so no live shape was captured here (ground rules forbid POST).
- Verified GET shape (H): DefiLlama summary `{name:"Dreamcash Outcome", category:"Interface", chains:["Hyperliquid L1"], total24h, total7d, total30d, totalAllTime, totalDataChart:[[unix_day, usd],...]}`. Fixtures: `defillama_dreamcash-outcome_trimmed.json`, `defillama_hyperliquid-outcomes_pool_trimmed_2026-10-19.json`.

## 5. Trade path

- Only via Hyperliquid: signed `order` action to `POST https://api.hyperliquid.xyz/exchange`, optionally with Dreamcash's builder code (documented at https://www.dreamcash.xyz/build, M from earlier note). Outcome asset id = 100000000 + 10*outcome + side (pool note, M). No Dreamcash order API, sandbox or keys.
- An aggregator gains nothing from the builder code (it only adds a 2-4.5 bps fee, M).

## 6. PayBox reachability

partial: same as Hyperliquid HIP-4, no extra benefit from Dreamcash. Orders are HyperCore signed actions (EIP-712 over a msgpack hash), not EVM transaction proposals; PayBox lists Hyperliquid as HyperEVM only. A PayBox EVM wallet could in principle sign orders or `approveAgent` via `request_wallet_sign` and fund HyperCore via Arbitrum (pool note, M). Driving the Dreamcash UI is prohibited automation.

## 7. Fees

- Dreamcash builder fee 0.045% mobile / 0.025% web, paid by the trader on top of Hyperliquid fees (earlier note, M-H from docs.dreamcash.xyz/trading/fees). Whether it applies to outcomes: NOT FOUND on Dreamcash pages. DefiLlama fees all-time for outcome row $2.81 on $12,480 volume (0.0225%), consistent with 0.045% on sells only (M inference).
- Hyperliquid's own outcome fee: see pool note.

## 8. Resolution and dispute risk

Entirely Hyperliquid's (mostly deployer-settled, little or no dispute window; pool note, M). Terms: SLL "does not determine, verify, or guarantee the accuracy, timeliness, or finality of any outcome or resolution source". (H) Dreamcash adds no dispute channel.

## 9. Geo / ToS / automation

- Operator Supreme Liquid Labs (Cayman); UK and Cayman residents excluded; Outcome Markets additionally restricted for the United States and Canada plus an unpublished list, IP geoblocked. (H, Terms, 1 July 2026)
- Prohibited: "any robot, spider, or other automatic device, process or means to access Dreamcash for any purpose". (H, Terms) Only sanctioned programmatic path is Hyperliquid's API.

## 10. Liquidity (DefiLlama, fetched 2026-10-19)

| Metric | Value | Tag |
|---|---|---|
| Dreamcash Outcome volume 24h / 7d / 30d / all-time | $0 / $1,003 / $1,198 / $12,480 | H |
| Hyperliquid Outcomes pool 24h / 7d / 30d / all-time | $3.13M / $17.9M / $47.0M / $261.1M | H |
| Dreamcash share of pool (30d / all-time) | about 0.003% / 0.005% | M |
| Book depth / OI / TVL attributable to Dreamcash | none; shared HIP-4 book | H |

## 11. Category overlap

The UI exposes the whole HIP-4 universe (name heuristic over 231 entries, M): price thresholds about 127 (BTC, ETH, HYPE, gold, oil, S&P, single stocks), sports about 88, company events about 13, macro 2 (FOMC October 2026), awards 1, politics none. Overlap with Polymarket, Kalshi, Predict.fun, Limitless exists for crypto price, FOMC and sports, but the leg to scan is HIP-4 itself.

## 12. Shared liquidity

Fully shared with Hyperliquid HIP-4 (H). Dozens of other front ends use the same books (DefiLlama "X Outcome" rows). Model as pool `hyperliquid-outcomes` with `front_ends[]`; not an independent leg.

## 13. Adapter recommendation

skip as a venue. Build the single Hyperliquid HIP-4 adapter; in the platform registry add Dreamcash as `kind: front_end`, `routes_to: hyperliquid-outcomes`. Revisit only if Dreamcash launches its own outcome deployer with distinct liquidity (NOT FOUND so far).

## 14. NOT FOUND

- Any Dreamcash docs page on outcome/prediction markets or HIP-4 (searched docs intro, llms.txt, home).
- Dreamcash official API, WebSocket, SDK, rate limits.
- Outcome-specific builder fee and collateral statements.
- Dreamcash GitHub org or contracts.
- Whether mobile apps expose outcomes (iOS text silent; earlier note).
- Live outcomeMeta/l2Book shapes (POST-only).

## 15. Suspicious content (recorded, not followed)

docs.dreamcash.xyz `llms.txt` and GitBook pages carry an "Agent Instructions" block telling agents to query `index.md?ask=...`; standard GitBook boilerplate, not used (earlier note, H). The web-app JS bundle contains unrelated third-party wallet-SDK prediction-feed strings; not called.

## 16. Sources

- https://www.dreamcash.xyz/ (H, WebFetch summary)
- https://docs.dreamcash.xyz/ (H, WebFetch summary)
- https://www.dreamcash.xyz/terms-of-use (H, WebFetch summary; Last Updated 1 July 2026)
- https://api.llama.fi/summary/dexs/dreamcash-outcome and /hyperliquid-outcomes (H, GET 2026-10-19)
- https://defillama.com/protocol/dreamcash-outcome (listing, from discovery)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api (via pool note, M)
- Earlier same-day notes: `docs/research/venues/dreamcash.md`, `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (M here)
- Press, titles only (L, Feb and Jun 2026): theblock.co 2026-02-13 Tether invests in Dreamcash; cryptotimes.io 2026-06-26 CASH markets cut.

## 17. Fixtures (`docs/research/fixtures/hyperliquid-hip-4-front-end-dreamcash/`)

`defillama_dreamcash-outcome_trimmed.json`, `defillama_hyperliquid-outcomes_pool_trimmed_2026-10-19.json`, `web_app_outcome_metas_sample.json`, `defillama_adapter_dreamcash_excerpt.txt`, `terms_of_use_excerpts.txt`. All under 50 KB; scanned for "@", none.

## 18. Privacy

Scripted requests used User-Agent `insurance-markets-research/0.1`; no personal identifiers in requests or files.
