# cro.trade Predict (cro.trade/predict) - venue spec

Researched 2026-10-19 (probes ran about 00:35-01:15 UTC). READ-ONLY: public web pages, the GitBook `.md` mirrors, DefiLlama public API, `gh api` raw file reads of DefiLlama's adapter repo, Polymarket's public builder feeds (unauthenticated GET), and static reading of the site's own public JS chunks (downloaded as text, never executed). No account, no wallet, no POST, no signing, no payments, no browser automation. Generic User-Agent `insurance-markets-research/0.1` only. The app backend `api.cro.trade` is undocumented and was NOT probed beyond one root request (HTTP 403).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures: `docs/research/fixtures/cro-trade-predict/` (section 12).

---

## 0. Bottom line

1. **Not a venue. It is a Polymarket front end.** cro.trade's own Terms say it "provides a front-end interface to interact with Polymarket's Central Limit Order Book (CLOB) and smart contracts", with markets "settled based on the actual outcome of events as determined by Polymarket's oracle" (H, https://cro.trade/privacy, PrivacyPage chunk). DefiLlama registers it as a Polymarket **builder code** (`builder: "crotrade"`, start 2026-06-03) (H, dimension-adapters `factory/polymarket.ts`). The app's Predict module reads `https://gamma-api.polymarket.com`, signs orders in the `Polymarket CTF Exchange` EIP-712 domain on chainId 137 with a `builder` bytes32 field (H, app JS).
2. **The discovery hint (Hyperliquid HIP-4 backing) is wrong for Predict.** DefiLlama's description "cro.trade allows users to trade perps on Hyperliquid L1" is the generic parent-brand blurb (H, `api.llama.fi/protocol/cro.trade-predict`). The same app does have a separate Hyperliquid surface (perps, and apparently HIP-4 outcome markets, section 3), but that is not "Predict" and is not documented by cro.trade.
3. **No independent liquidity, no public API of its own, tiny volume.** Every order lands on Polymarket's book. DefiLlama volume 24h $37, 30d $43.4k, all-time $246.5k (H, 2026-10-19). Builder-attributed share notional in the last 7 days is $34.5k against $181.6M across all Polymarket builders (about 0.02%) (H, Polymarket data-api v2, computed).
4. **adapter_priority = skip.** An aggregator should read and trade Polymarket directly (covered by another workflow). cro.trade adds a 1% taker fee, a geo layer and no new price.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://cro.trade/predict | HTTP 200, SPA shell served with an edge-injected `cf-country` meta tag; HTML head dev comments carry recent dates (e.g. "2026-10-16", "since 2026-08-22") | H |
| Latest attributed trade | `clob.polymarket.com/builder/trades?builder_code=<crotrade>` newest row `createdAt 2026-10-19T00:40:15Z`, matchTime 1792370414 (fetched minutes later) | H |
| Daily activity | Polymarket builder feed: 67 of the last 90 days have a crotrade row, last row 2026-10-18 (rank ~100 of ~200 builders, 7 active users) | H |
| Docs | docs.cro.trade (GitBook) Welcome page "Last updated 25 days ago"; Predict, Sports, Fees, Legal pages present | H |
| DefiLlama | Protocol id 8868, category "Prediction Market", `listedAt` 1791029913 = 2026-10-03T12:18Z, parent "cro.trade" (Spot, Perps, Predict) | H |

Verdict: **still_live = true**, low usage (1-8 active users per day).

---

## 2. Kind and market model

- **Kind:** broker / front end for Polymarket (H, Terms; H, DefiLlama adapter). CroTrade LLC (Wyoming) "does not accept wagers, set odds, resolve markets, or hold user funds in connection with prediction market trading" (H, Terms s.20).
- **Market model (inherits Polymarket):** binary YES/NO outcome tokens ("binary outcome tokens representing the probability of real-world events", H Terms); price is probability, winning share redeems at $1 (H, docs Predict). Order book with Market and Limit orders, minimum order $1 (H, docs Predict). Sports matches shown as Home/Draw/Away (three binaries). Crypto "Up or Down" markets from 5 minutes to yearly, plus Pre-Market and ETF filters (H, docs).
- **Tokenisation:** the signed order carries `tokenId` and `makerAmount/takerAmount` on the Polymarket CTF Exchange (H, app JS); that is Polymarket's conditional-token model. Details belong to the Polymarket spec.
- **Extra product: combos.** `/api/pm/combo` and `/api/pm/rfq` plus an RFQ client posting to Polymarket's `/v1/builder/rfq/requests` (H, app JS). Quotes come from market makers on Polymarket's RFQ system, not from cro.trade.
- **Categories (H, docs):** Trending, Economy (Fed, inflation, GDP), Politics, Sports (30-odd leagues), Football, Crypto.

## 3. Hyperliquid in the same app (separate from Predict)

- Perps run through Hyperliquid: docs say 0.06% maker and taker fee (H docs Fees); the Terms call it "perpetual futures trading via Hyperliquid".
- The Terms and docs do NOT mention HIP-4 or outcome markets (H: grep for "HIP-4", "HIP4", "outcome market" returned 0 hits in the Terms chunk, the saved docs pages and llms.txt). But the app JS contains the Hyperliquid `outcomeMeta` info call, a `hl_outcome_builder_approved_v2` approval flow (approveBuilderFee, maxFeeRate 1%), `#<n>` coin names mapped to an asset-index offset, and an `hlOutcome` CSS module used by the HL trade page (H that the code exists; M that HIP-4 outcome trading is live in the UI, not tested).
- HIP-4 itself (M, Hyperliquid gitbook page via small-model summary): fully collateralised Yes/No outcome tokens on HyperCore, first market a daily BTC binary settling 06:00 UTC to HyperCore mark price, trading fees zero during initial testing, builder codes earn fees on sell orders. This is an independent on-chain venue and deserves its own spec if not already assigned. See `docs/research/venues/frenflow.md` for the same lead.

---

## 4. Chains and collateral

- **Settlement chain: Polygon (chainId 137)** (H, app JS `yEe=137`; DefiLlama chain "Polygon" in the dexs/fees overview, though the protocol record says "Cronos").
- **Collateral:** docs say "Predict settles in USDC" (H). App JS error strings reference "pUSD balance" and "Predict wallet" (H), consistent with Polymarket V2 collateral and a Polymarket deposit wallet (signatureType 3, `TypedDataSign` name `DepositWallet`) (M inference).
- **Funding (H, docs Predict/Fees):** Arbitrum USDC (direct), Cronos (CRO or USDC, converted), Ethereum, Base, Arbitrum, Polygon, Avalanche, or in-app transfer from Perps balance. Transfer cost table: Cronos free; Arbitrum 0.014%; Base 0.013%; Polygon and Avalanche free; Ethereum network fee. **Withdrawals** to Cronos, Arbitrum, Base, Polygon, HyperEVM, Avalanche, Ethereum.
- **Wallets:** MetaMask or Crypto.com Wallet, or email/Google/Apple/Telegram/passkey via Privy embedded self-custodial wallet with key export (H, docs Welcome and Terms s.6).

---

## 5. Read API

**cro.trade has no official public API.** NOT FOUND (searched: docs.cro.trade llms.txt index of 25 pages, Predict/Fees/Legal/Welcome pages, cro.trade/robots.txt, sitemap.xml, /docs, GitHub org `crotrade` -> 404, web search). `https://api.cro.trade/` root returns HTTP 403 (H).

- App-internal backend (undocumented, M, NOT probed): `https://api.cro.trade/api/pm` (+ `/access?address=&wallet=` returning `{viewOnly, grandfathered, country}`), `/api/pm/clob` (CLOB proxy), `/api/pm/rfq`, `/api/pm/combo`, `/api/pm-img`, `wss://api.cro.trade/ws/pm-sports` (sports scores). Do not build on these.
- **Use Polymarket directly** (the app itself does): Gamma `https://gamma-api.polymarket.com` (H, app JS constant; I confirmed `GET /events?limit=1&closed=false&order=volume24hr&ascending=false` returns 200 JSON, 1 MB, not saved because the Polymarket workflow owns those fixtures), CLOB `https://clob.polymarket.com`, Data API `https://data-api.polymarket.com` (v1 retired 2026-10-24 per a comment in DefiLlama's helper, H; use v2).
- **Only cro.trade-specific public data = Polymarket builder feeds** (both unauthenticated GET, both confirmed 2026-10-19):
  - `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90` -> `{data:[{date, rank, builder_name, builder_code, profile_image, verified, volume, active_users}]}`. Max 90 daily buckets. `volume` is **share notional**, not USD cash: on 2026-09-29 the sum of attributed trade `size` equals the feed `volume` (22,137) (H, computed). Filter `builder_name == "crotrade"`.
  - `GET https://clob.polymarket.com/builder/trades?builder_code=0x6b82257805a4732cbd432c88ff1c5137ce4038f82145ed6c67b5588b742f2ee4` -> `{data:[trade], next_cursor, limit:300, count}`. Trade fields: `id, tradeType (TAKER|MAKER), takerOrderHash, builder, market, assetId, side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker, transactionHash, matchTime, bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`. Paging by `next_cursor` (base64), end sentinel `LTE=`. Includes third-party maker addresses; redact before storing.
- Rate limits: none documented for cro.trade; Polymarket's limits are in the Polymarket spec. Websocket: none public.

## 6. Trade path

- **Via cro.trade: none.** No documented order endpoint, no API keys. Orders are signed in the browser or app by the Privy/MetaMask wallet and relayed through `api.cro.trade/api/pm/clob` (H, app JS). Scripts are also restricted by Terms (section 9).
- **Via Polymarket: yes**, with EIP-712 signed CLOB orders on Polygon. Attaching cro.trade's builder code would route 1% to cro.trade and Polymarket says builder codes "should only be attached to orders from apps you control" (M, search summary of docs.polymarket.com Order Attribution). Not recommended. If builder revenue is wanted, register the project's own code (caps 100 bps taker, 50 bps maker, one rate change per 7 days, effective after 3 days; Polymarket may disable a code) (H, https://docs.polymarket.com/builders/fees).

## 7. PayBox reachability

- **cro.trade itself: no.** No endpoint accepts a signed order or a transaction proposal from outside the app. A PayBox wallet could only be funded into a cro.trade-created Predict/deposit wallet and then be controlled by the app session, which defeats PayBox signing.
- **Underlying Polymarket: reachable in principle** by an EVM PayBox wallet via `request_wallet_sign` `typedData` (EIP-712, no chain restriction documented) plus USDC/pUSD approvals on Polygon (see `docs/research/06-paybox-platform.md`). That path belongs to the Polymarket adapter and does not need cro.trade.

---

## 8. Fees

- **Builder fee: 1% taker, 0.5% maker** of trade notional (H, docs.cro.trade/help-and-reference/fees: "1% taker, 0.5% maker. Your cost is the share price plus the fee"). Confirmed on 300 attributed trades 2026-09-24..2026-10-19: builderFee/sizeUsdc = 0.0100 on all 270 TAKER rows, 0.0050 on 29 of 30 MAKER rows (0.0049 on one) (H, computed from fixture). The user pays (H, Polymarket builder-fee docs).
- **Polymarket platform fee is additive** ("Builder fees never replace platform fees - they're always additive"; platform fees taker-only, formula `C x feeRate x p x (1-p)`, not builder-configurable) (H, https://docs.polymarket.com/builders/fees). The app hardcodes category rates `crypto .07, sports .03, politics .04, economy .04, business .04, science .04, pop-culture .05, all .05` (M, app JS; Polymarket's own docs are authoritative).
- Redeeming winners is free; minimum order $1 (H docs). Funding/withdrawal fees in section 4. Perps 0.06%, spot 0.9% (H docs, irrelevant here).
- Revenue: all builder fees go to CRONUS token holders (buyback/burn) per DefiLlama methodology (H). DefiLlama fees all-time $2,432, 30d $431 (H).

## 9. Geo, ToS, automation

- Predict "not available to, and must not be used by, residents of or persons located in": **United States**, **France**, **Singapore**, Cuba, Iran, North Korea, Syria, Crimea/Donetsk/Luhansk, and "any other jurisdiction where prediction market trading ... [is] prohibited, restricted, or require licensing" (H, Terms s.20; cro.trade/privacy).
- In-app gate: the client sets **Turkey (TR)** as view-only with a "grandfathered" exemption list, via `GET api.cro.trade/api/pm/access`; UI text: "View only in your region. Markets, prices and results stay open here. Opening a new position is not available." Country comes from a Cloudflare `cf-country` meta tag (H, app JS). A separate country set (AF, BA, BY, CN, GB, IQ, LY, MM, RU, TR, UA, VE, YE) makes the app swap its App Store download link for a TestFlight link (H that the set exists; M that it reflects App Store availability).
- Automation: prohibited activities include "Using automated bots, scripts, or tools to interact with the Service in a manner that degrades performance for other users" (H, Terms). Not a blanket ban, but there is no API to be compliant with. Polymarket's own geoblock and ToS also apply underneath (not re-verified here).
- Entity: CroTrade LLC, Wyoming, USA; disclaims all liability for resolution, oracle and smart-contract failures (H).

## 10. Resolution and dispute risk

Entirely Polymarket's: "Markets are resolved by Polymarket's oracle system (UMA Optimistic Oracle or similar). Resolution outcomes may be disputed, delayed, or resolved in ways you disagree with. CroTrade LLC has no ability to influence, challenge, or overturn market resolutions." (H, Terms s.20). Funds sit in Polymarket's contracts, "not by CroTrade LLC" (H). Extra frontend risk: cro.trade can restrict or suspend access "at our sole discretion and without prior notice" (H), and Polymarket can disable the builder code so the CLOB rejects its orders (H, Polymarket docs).

## 11. Liquidity, overlap, shared liquidity

- **Own liquidity: none.** (H, Terms and app JS.)
- Volume (H, 2026-10-19): DefiLlama `cro.trade Predict` 24h $37, 7d $2,495, 30d $43,398, all-time $246,541 (USD cash cost of attributed trades; adapter sums `sizeUsdc`). Polymarket builder feed, share notional: Jul 2026 $44.3k (from 07-23), Aug $7.9k, Sep $237.9k, Oct 1-18 $73.0k; last 7 days (10-12..10-18) $34.5k; last 30 days $174.3k. Lumpy: top September days were 09-19 $49.7k, 09-15 $32.5k, 09-29 $22.1k; median active day is $6.4k in September and $2.7k in October, with 1-8 active users per day. The newest 300 attributed trades (2026-09-24 to 2026-10-19) sum to $12.8k USD cash across 141 distinct markets (H, computed).
- Event overlap with other venues: whatever Polymarket lists (sports leagues, soccer, crypto up/down, Fed/economy, politics). That overlap exists, but it is **Polymarket's book re-shown**, so it is not an independent arbitrage leg. Any cross-venue edge involving cro.trade Predict is an edge on Polymarket, minus cro.trade's extra 1% / 0.5%.
- **liquidity_shared_with: Polymarket (global CLOB, Polygon).**

## 12. Fixtures (all real, each well under 50 KB)

`docs/research/fixtures/cro-trade-predict/`
- `defillama_protocol_cro-trade-predict.json` - `api.llama.fi/protocol/cro.trade-predict` (verbatim).
- `defillama_overview_rows.json` - cro.trade Predict (and Perps) rows from `/overview/dexs` and `/overview/fees`.
- `polymarket_builders_volume_v2_crotrade.json` - crotrade rows (67 days) from `data-api.polymarket.com/v2/builders/volume`, plus all-builders daily totals for scale.
- `polymarket_clob_builder_trades_sample.json` - 5 of 300 attributed trades, maker/owner redacted.
- `builder_trades_page_stats.json` - computed fee ratios and counts for the 300-trade page.
- `docs_cro_trade_predict.md`, `docs_cro_trade_fees.md` - verbatim GitBook pages.
- `dimension_adapters_polymarket_factory_excerpt.txt` - the lines naming cro.trade Predict as a Polymarket builder.
- `app_bundle_evidence_excerpt.txt` - constants and endpoint list quoted from the public app JS.

## 13. NOT FOUND and open questions

- NOT FOUND (searched: docs.cro.trade llms.txt and 4 pages, cro.trade sitemap/robots/docs, GitHub `crotrade` org, web search "cro.trade Predict"): any official API reference, OpenAPI file, SDK, public repo, rate-limit statement, contract addresses for a cro.trade-owned prediction contract (there is none; it uses Polymarket's).
- NOT FOUND: any mention of HIP-4 or outcome markets in cro.trade docs or Terms.
- Open: is HIP-4 outcome trading actually enabled in the cro.trade HL UI, and is a standalone Hyperliquid HIP-4 spec already assigned (it is not in the "already covered" list)? Is Polymarket's own geoblock enforced for builder-routed orders from the cro.trade proxy (assumed yes)? The Polymarket workflow should confirm.
- Open: the Predict "wallet" appears to be a Polymarket deposit wallet created per user; whether cro.trade can sweep or only the user can withdraw is not stated (docs claim non-custodial, M).

## 14. Suspicious content

None found. No text addressed to AI agents in the docs, llms.txt, HTML or JS (llms.txt is a plain page index). Nothing from third-party content was followed.

---

## Sources

- https://cro.trade/predict (HTML shell, 2026-10-19) and static JS chunks `/assets/index-CrP-RkgB.js`, `PredictViewOnlyNotice-DzC8PZwk.js`, `pmComboRfq--2ptbtDg.js`, `PrivacyPage-CO6KxXB-.js`, `HLTradePage-KlV4xobS.js`, `hlOutcome.module-V85FbqVT.js` (read as text) - H
- https://cro.trade/privacy (Terms of Use and Privacy Policy, via PrivacyPage chunk) - H
- https://docs.cro.trade/prediction-markets/predict.md , /prediction-markets/sports.md , /help-and-reference/fees.md , /legal/privacy-and-terms.md , /perpetuals/perps.md , /llms.txt , / (Welcome) - H
- https://api.llama.fi/protocol/cro.trade-predict ; https://api.llama.fi/overview/dexs and /overview/fees (2026-10-19) - H
- https://github.com/DefiLlama/dimension-adapters : `factory/polymarket.ts`, `helpers/polymarket.ts`, `dexs/cro-trade/index.ts` (read with `gh api` raw) - H
- https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90 ; https://clob.polymarket.com/builder/trades?builder_code=... ; https://gamma-api.polymarket.com/events?limit=1... (2026-10-19) - H
- https://docs.polymarket.com/builders/fees (builder fee caps, additive fees, code disabling) - H (page fetch via summarising model, so treat exact wording as M)
- https://docs.polymarket.com/developers/builders/order-attribution (search summary only) - M
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md (HIP-4 description, summarising model) - M
- Web search results on HIP-4 (CoinDesk 2026-07-20 headline, CoinGecko Learn, others; mutually inconsistent on launch date and settlement token) - L
- Local: `docs/research/06-paybox-platform.md` (PayBox `request_wallet_sign` typedData), `docs/research/venues/frenflow.md` (sibling Polymarket-builder front end)
