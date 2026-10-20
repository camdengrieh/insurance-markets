# Nansen (app.nansen.ai, HIP-4 outcome-market front end) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: GET requests to public docs, legal pages, DefiLlama and one keyless Nansen API GET; no account, API key, wallet, signature, POST/PUT/DELETE, payment or PayBox tool. Third-party text is untrusted data. WebSearch budget ran out after the first search, so everything else is direct page/API reads.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary, inferred, or taken from a sibling note in this repo; **L** = weak or stale. "NOT FOUND (searched: ...)" = not documented where I looked.

---

## 0. Bottom line

1. **Nansen is a front end, not a venue.** Since 2026-08-30/31 the Nansen web app lets eligible users trade Hyperliquid HIP-4 outcome markets from an embedded Nansen (Privy) Hyperliquid wallet. Nansen runs no order book, collateral pool or resolver of its own; its Terms say it does not "issue, operate, manage, or control any Outcome Contract, any underlying market, or the oracle, resolver, or dispute process" (H).
2. **Liquidity is 100% shared with Hyperliquid HIP-4, so it is NOT an independent arbitrage leg.** DefiLlama flags the row `doublecounted: true` and attributes it by builder code (H). The adapter for this liquidity is the Hyperliquid HIP-4 adapter (`docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, P1 there), not a Nansen adapter.
3. **Nansen's own flow is negligible.** DefiLlama builder-code-attributed volume: **$12,460 all-time, $7,587 in 30 days, $0 in the last 7 days** (to 2026-10-18), versus $261.1M all-time and $3.13M on 2026-10-18 for all of HIP-4 (H). That is 0.005% of all-time HIP-4 volume.
4. **No API for the outcome side.** The Nansen API (api.nansen.ai) is key-authenticated and credit-priced. Its prediction-market endpoints cover **Polymarket only**; its trading endpoints cover Hyperliquid **perps** and Solana/Base spot swaps. No outcome / HIP-4 endpoint appears in the docs index, API overview, CLI source or x402 discovery (H).
5. **No PayBox trade path through Nansen.** The Nansen app has no external-wallet option (embedded Privy wallet only), and the outcome side is not in the trading API (H). Anything tradeable is better reached directly on Hyperliquid (see the HL note, PayBox reach "partial" there).
6. **Geo is strict:** outcome trading is barred in the US, UK, Singapore and 20+ other jurisdictions, with a no-VPN clause (H).
7. **adapter_priority = skip** for Nansen as a venue leg (duplicate liquidity, no outcome API, negligible volume). One optional side idea: Nansen's Polymarket smart-money analytics (paid API) could be a signal source, but that is a separate "signals" integration with licence limits (section 4), not a venue adapter.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| Changelog "Outcome Markets Now Available on Nansen Web", dated **Aug 31, 2026**: "HIP-4 markets are now live on Nansen - one of the first front-end to support them." https://release.nansen.ai/changelog/hip-4-market-trading-now-live-on-nansen-web | H |
| Academy: "Hyperliquid outcome market trading has officially been available for all eligible users since August 30th, 2026." https://academy.nansen.ai/en/articles/9072054-hyperliquid-outcome-markets | H |
| Terms of Service listed "Updated on Aug 10, 2026" contain a dedicated "Outcomes and Prediction Markets Feature" clause. https://nansen.ai/legal/terms-of-services | H |
| DefiLlama row "Nansen Outcome" (id 9019, category Interface, chain Hyperliquid L1, parent Nansen), `listedAt` 2026-10-08T22:18:39Z; fits the discovery hint. https://api.llama.fi/protocol/nansen-outcome | H |
| DefiLlama volume series nonzero on 48 of 81 daily points from 2026-07-30 to 2026-10-11; last nonzero day 2026-10-11 ($53); **zero on 2026-10-12..10-18**. https://api.llama.fi/summary/dexs/nansen-outcome | H |
| Press: crypto.news 2026-09-08 "Nansen becomes first front end to support Outcome.xyz HIP-4 markets" (stock and crypto markets at launch, politics and sports "expected" later). https://crypto.news/nansen-becomes-first-front-end-to-support-outcome-xyz-hip-4-markets/ | M |
| `app.nansen.ai` returns a Cloudflare 403 challenge to scripted GETs (a login-gated SPA; I did not try to bypass it), so I could not view the in-app outcome markets page. | H |
| Nansen API host live: keyless `GET https://api.nansen.ai/api/v1/account` -> 401 JSON (fixture). Docs changelog has entries to 2026-10-15. | H |

Verdict: **still_live = true** as a product feature. It is not dead, but usage is tiny (section 10).

---

## 2. Kind and market model

- **Kind:** `broker-or-frontend`. Trading terminal plus analytics. Nansen Trading = "agentic trading" (chat agent) and a "trading terminal"; spot on Solana/Base/Robinhood/BNB/Arc, perps and outcome markets on Hyperliquid only (H, https://academy.nansen.ai/en/articles/0162796-about-nansen-trading).
- **Market model = Hyperliquid HIP-4 (not Nansen's):** fully collateralised Yes/No outcome tokens on HyperCore's central limit order book, merged Yes/No book, no leverage/funding/liquidation, integer shares paying $1; multi-outcome "questions" exist; settlement fraction can be fractional (M here, H in the HL sibling note: `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, citing the Hyperliquid gitbook HIP-4 page). Nansen's Terms say the same in plain words: "fully collateralized and does not involve leverage, margin, funding, or liquidation" (H).
- **Which markets Nansen lists:** the press says Outcome.xyz's markets, stock and crypto first (M). Nansen's own pages give no market list or category list (NOT FOUND: changelog, academy article, docs index). Whether Nansen shows every HIP-4 deployer's markets or only Outcome.xyz's is **unknown**; the in-app page is behind login/Cloudflare.
- **Nansen extras:** outcome tokens are discoverable in Token Screener and search; "Token God Mode" shows who holds each side (changelog H; crypto.news M: "seeing who holds positions on each outcome and where conviction is concentrated"). Not exposed in the public API docs.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Execution / settlement | HyperCore (Hyperliquid L1); not an EVM chain | H (Nansen academy "Hyperliquid only"); M detail from HL note |
| Collateral | Same Hyperliquid account balance as perps: "Fund your Hyperliquid account and then your balance can be used to trade perps and outcome markets." Quote token is USDC on mainnet per the HL note (M); Nansen's pages do not say | H / M |
| Wallet | Embedded **Nansen Wallet powered by Privy**; "there are currently no options for external wallets"; one wallet per supported chain | H |
| Custody | Academy does not say self-custodial or custodial. Terms: Nansen does "not hold, control or have access to your assets" (legal boilerplate; not verified technically) | H (statement) / unresolved (reality) |
| Deposit | Via HyperCore only; "Nansen does not support HyperEVM deposits yet". Nansen's perps bridge endpoint (docs): deposits from Ethereum, Base, Arbitrum, Polygon, BNB Chain; withdrawals to Ethereum, Base, Arbitrum | H |
| Gas | Gasless transactions "for trades with a balance over $10" (academy; spot context) | H |

---

## 4. Read API

**There is no Nansen read API for outcome markets.** What exists:

- **Docs:** https://docs.nansen.ai (machine index https://docs.nansen.ai/llms.txt; every page also serves `.md`). Base URL `https://api.nansen.ai`, paths `/api/v1/...`; request bodies are JSON POSTs. (H)
- **Auth:** header `apikey: <key>` (key from the Nansen account); key permissions `data`, `trading`, `account`. Alternative **pay-per-call** with no key: x402 (USDC on Base, Solana or Monad) or MPP (Tempo). A keyless request to an eligible endpoint returns **402** with a payment challenge; discovery document `https://api.nansen.ai/.well-known/x402` (fixture). Pricing tiers: Basic $0.01, Premium $0.05, Smart Money $0.05 per call (docs); first-100-calls 50% promotion "when enabled". I made **no** paid or POST call. (H)
- **Credits / plans:** Free = 100 trial credits then top-up to 10/day; Pro = $49/month annual or $69/month monthly with 2,000 credits/month. Prediction-market endpoints cost 1 credit (market-screener, event-screener, orderbook, ohlcv, trades-by-market, trades-by-address, pnl-by-address, address-summary, categories) or 5 credits (top-holders, pnl-by-market, position-detail). https://docs.nansen.ai/getting-started/credits.md (H)
- **Rate limits (H, https://docs.nansen.ai/getting-started/rate-limits.md):** Free 15 req/s and 300/min; Pro 75 req/s and 1,500/min; extra per-endpoint caps on a few perp/search endpoints; headers `RateLimit-*`, `X-RateLimit-*`, 429 with `Retry-After`. Observed on a keyless 401: `x-ratelimit-limit-second: 5`, `-minute: 60`.
- **WebSocket:** NOT FOUND (searched: docs index, API overview). Everything is request/response; credit-metered.
- **Prediction Market endpoints (all `POST /api/v1/prediction-market/...`):** `categories`, `market-screener`, `event-screener`, `orderbook`, `ohlcv` (1-hour candles), `top-holders`, `position-detail`, `trades-by-market`, `pnl-by-market`, `pnl-by-address`, `address-summary`, `trades-by-address`. "Nansen currently only supports data across Polymarket." History from Nov 2022. https://docs.nansen.ai/api/prediction-market.md and /api/data-coverage.md (H). Documented item fields (OpenAPI, fixture): market screener item = `market_id, question, slug, event_id, event_title, active, closed, end_date, neg_risk, tags, volume, volume_24hr, volume_1wk, volume_1mo, liquidity, volume_change_pct, open_interest, best_bid, best_ask, last_trade_price, one_day_price_change, unique_traders_24h, created_at, age_hours`; orderbook level = `market_id, event_id, outcome, outcome_index, asset_id, side, price, size, cumulative_size, snapshot_timestamp`. **These are documented schemas, not live captures** (no key, no payment).
- **Hyperliquid endpoints** (`/api/v1/hyperliquid/...`, `/tgm/perp-*`, `/profiler/perp-*`, `/smart-money/perp-trades`): perp positions, trades, leaderboards, smart-money perp trades (H). Perps only; no outcome tokens documented.
- **Outcome / HIP-4 in the API: NOT FOUND** (searched: llms.txt index, API overview, Hyperliquid section, data-coverage, MCP tool catalog, x402 discovery, `nansen-ai/nansen-cli` README/CHANGELOG/`src/perp.js`). So Nansen's outcome analytics ("who holds each side") are UI-only.
- **Licence limits (H, https://nansen.ai/legal/api, "Updated on Jun 1, 2026"):** no robots/scrapers except as permitted in writing; no merging Nansen Data with other datasets "for external distribution, commercial products, or public-facing applications" without permission; no redistribution of raw, bulk or aggregated data; competitors may be blocked. Internal analysis is allowed. Consequence: using Nansen Polymarket analytics inside a commercial aggregator product needs written consent.
- **Better source for the same Polymarket data:** Polymarket's own public APIs (covered by the parallel workflow); Nansen adds only the wallet-label / PnL layer.
- **Better source for the HIP-4 data Nansen fronts:** Hyperliquid's keyless WS/REST (HL note, section 4).

Fixtures (all in `docs/research/fixtures/nansen/`): `nansen_api_401_account_keyless.json` (live), `nansen_api_well-known_x402.json` (live), `nansen_docs_prediction_market_openapi_excerpt.json` (docs, not live), `defillama_nansen-outcome_protocol.json`, `defillama_nansen-outcome_dexs_trimmed.json`, `defillama_nansen-outcome_fees_trimmed.json`, `defillama_hyperliquid-outcomes_totals.json`, `nansen_primary_text_excerpts.txt`.

---

## 5. Trade path (programmatic)

- **Via the Nansen app:** only through the web/mobile UI with the embedded Privy wallet. No external wallet; no documented order API for outcomes. Driving the UI by script would breach the Terms' ban on "scripts, ... agents, ... or other means ... whether manual or automated" (H) and is out of scope for this research anyway.
- **Via the Nansen Trading API (perps only):** `prepare -> sign locally -> POST /api/v1/perp/execute`; Nansen builds the unsigned action + EIP-712 payload, you sign with your own key (wallet key or an approved Hyperliquid agent wallet), "no endpoint ever accepts a private key". Orders carry Nansen's builder code; the wallet must first approve the builder fee (`POST /perp/approve-builder-fee`, must be signed by the wallet's own key). Endpoints: `/perp/builder-fee`, `/perp/approve-builder-fee`, `/perp/bridge/quote`, `/perp/bridge/execute`, `/perp/bridge/status`, `/perp/meta`, `/perp/leverage`, `/perp/order`, `/perp/close`, `/perp/cancel`, `/perp/transfer`, `/perp/account`, `/perp/positions`, `/perp/orders`, `/perp/execute`. Trading endpoints do not consume credits; region-blocked requests return 451 and unverifiable regions 503; wallets are sanctions-screened. All documented as **perpetuals**; none takes an outcome asset id. https://docs.nansen.ai/api/trade/perp-trading.md (H)
- **Spot swaps API:** Solana and Base (plus supported Solana<->Base bridge routes), quote -> prepare -> sign -> execute (H, https://docs.nansen.ai/api/trade.md). Irrelevant to outcome arbitrage.
- **Whether `/perp/order` or `/perp/execute` would accept a HIP-4 order** (asset id >= 100,000,000): NOT FOUND (searched: perp-trading guide, CLI source). Do not assume.
- **Practical route to the same books:** sign Hyperliquid `order` actions directly (asset id `100_000_000 + 10*outcome + side`), optionally with a builder code. That is the HL adapter's job (HL note, section 5).

---

## 6. Reachability from a PayBox wallet

**Verdict: no (for Nansen itself); partial for the underlying Hyperliquid venue.**

- Nansen's app takes no external wallet, so a PayBox EVM wallet cannot "connect" to Nansen to trade outcomes (H).
- The Nansen trading API is sign-it-yourself for perps (EIP-712 typed data), which a PayBox `request_wallet_sign` typedData flow could in principle sign, but it exposes no outcome orders and adds Nansen's builder fee plus geo/KYT checks (H doc, M inference about PayBox; I made no PayBox call).
- Funding a Hyperliquid account from an EVM chain is reachable on paper (Nansen's own bridge docs list Ethereum, Base, Arbitrum, Polygon, BNB Chain deposits), but there is no reason to route through Nansen when Hyperliquid accepts USDC deposits directly (M).
- Nansen API payments (x402) use USDC on Base/Solana/Monad: a PayBox `pay_x402` flow could pay for analytics calls, but I did not attempt any (rule: no payments).

---

## 7. Fees

- **Outcome-market fee on Nansen: NOT FOUND** (searched: Trading Fees academy article, Outcome Markets academy article, changelog, Terms, docs). The Trading Fees page lists only perps and spot and says nothing about outcomes (H).
- **What a user pays in practice (inferred, M):** Hyperliquid's own outcome fees (charged on close/settle, not on open; numeric rate undocumented officially; empirical all-in about 12-15 bps per the HL note) plus a Nansen builder fee if Nansen attaches its builder code to outcome sells (DefiLlama methodology: builder fees are "charged on outcome sells", H). Nansen's builder fee for perps, by Points tier: Unranked 0.08%, Green/Pro 0.05%, Ice 0.03%, North 0.02%, Star 0.01% (H, Trading Fees article, updated ~2 months before 2026-10-19). Whether the same tier schedule applies to outcomes is unknown.
- **Weak data point (L):** DefiLlama fees for "Nansen Outcome" total $0.03 (one day, 2026-10-11) against $53 volume that day, about 6 bps; one observation, series only starts 2026-10-08. Do not use as a rate.
- **Spot swaps (not relevant here):** 0.10-0.75% by tier. API: credits or $0.01-$0.05 per call (section 4).
- For the aggregator: treat Nansen-routed execution as strictly worse than direct Hyperliquid execution on cost (extra builder fee), unless the builder fee is zero for outcomes.

---

## 8. Resolution mechanism and dispute risk

- Nansen has no resolution role. Terms: Nansen does not control "the oracle, resolver, or dispute process", does not guarantee it is "accurate, timely, uninterrupted, or free from manipulation", and "settlement occurs only once the relevant market has been finally resolved, including the outcome of any dispute or challenge process" (H, Terms 2026-08-10).
- Actual resolution = Hyperliquid HIP-4: protocol-settled recurring series (mark-price based), validator-voted canonical markets, and the large majority **deployer-settled** markets (Outcome.xyz is the main deployer) with **no trader-initiated dispute window** (HL note section 8, M here; H there).
- Arb rule: compare the resolution text and reference price (HL perp mark TWAP) with the counter-venue before pairing; Nansen adds no extra protection.

---

## 9. Geo, ToS, automation

Source: Nansen Terms of Service, "Updated on Aug 10, 2026" (H, https://nansen.ai/legal/terms-of-services); same list in the academy article (H).

- **General restriction:** Gelephu Mindfulness City SAR and Bhutan, Singapore, Cuba, Iran, North Korea, Syria, Crimea/Donetsk/Luhansk.
- **Perpetuals feature adds:** United States, United Kingdom.
- **Outcomes feature adds:** United States, United Kingdom, Australia, Thailand, China, India, Brazil, Indonesia, Poland, Hungary, Netherlands, Belgium, Switzerland, Argentina, Ireland.
- Changelog: "OFAC countries and other Polymarket banned area can see the data, but CANNOT trade." VPN circumvention "not permissible" (academy). Sanctions screening of wallets on the API (H).
- **Automation:** the Services' Acceptable Use bars extracting data or interacting "using scripts, ... agents, ... or other means ... whether manual or automated" without written consent, and bars building "a similar product, service or API" or benchmarking for competitive purposes. API use is governed by the separate API Terms (key required; no scrapers/robots; redistribution limits). A cross-venue aggregator that resells or republishes Nansen data would likely need a licence (H text; legal conclusion not drawn).
- Other documents: Master Services Agreement (Jun 1, 2026), Privacy Policy (Jun 1, 2026) exist; I read only the Terms and API Terms.

---

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Nansen-attributed outcome volume, all-time | **$12,460** (first nonzero day 2026-07-30) | https://api.llama.fi/summary/dexs/nansen-outcome, through 2026-10-18 | H |
| Nansen 30d / 7d / 24h | $7,587 / $0 / $0 | same | H |
| Largest Nansen days | 2026-10-05 $3,137; 2026-09-22 $2,295; 2026-09-21 $1,969; 2026-09-01 $871; 2026-08-31 $726 | same | H |
| Nansen fees (builder-code) | $0.03 all-time in that row | https://api.llama.fi/summary/fees/nansen-outcome | H |
| Whole HIP-4 pool (shared) | 2026-10-18 $3.13M; 7d $17.9M; 30d $47.0M; all-time $261.1M | https://api.llama.fi/summary/dexs/hyperliquid-outcomes, fetched 2026-10-19 | H |
| Nansen share of pool | 0.005% all-time; 0.016% of 30d | my computation | M |
| Outcome volume for the HIP-4 market as a whole, per press | daily avg $545k in August 2026; $1.97M on 2026-08-31; Outcome ~85% of reported HIP-4 volume | crypto.news 2026-09-08 | M |
| Incentive | $1M rewards pool for eligible Outcome.xyz trades made through Nansen | crypto.news / coinspectator 2026-09-08 (terms not published there) | M |
| TVL | DefiLlama shows no TVL for the row | protocol record | H |

Reading: the Nansen channel is effectively a rounding error on top of Hyperliquid. The $1M rewards pool (a campaign, terms unread) did not produce visible volume by builder-code attribution.

---

## 11. Event categories and cross-venue overlap

Nansen itself: none of its own. What it exposes is HIP-4 inventory (HL note section 11): crypto price ladders (BTC/ETH/SOL/HYPE; best overlap with Polymarket/Kalshi/Limitless/Predict.fun/Opinion), sports futures and match markets, central-bank rate decisions, stock/commodity price templates. Press says Nansen launched with "stock and crypto" markets and expects "politics and sports" (M). Use the HL adapter's category map.

Signal-source angle (separate from venue): Nansen's Prediction Market API labels Polymarket wallets (PnL, win rate, wallet age, top holders, positions) and Nansen's Hyperliquid endpoints show smart-money perp positioning. Either could feed a "smart-money flow" feature for crypto-price and politics markets. Cost: 1-5 credits per call on a $49-69/month plan, or $0.01-$0.05 per x402 call; licence limits as in section 4. The raw Polymarket orderbook/price data in that API duplicates Polymarket's free endpoints.

---

## 12. Shared liquidity?

**Yes: Nansen has no liquidity of its own. All its outcome orders are Hyperliquid HIP-4 orders**, so it is not an independent leg and must be deduplicated with Hyperliquid, Outcome.xyz and the other ~35 HIP-4 front ends (DefiLlama "X Outcome" interface rows, per `docs/research/14-platform-of-platforms.md`). DefiLlama marks the row `doublecounted: true` and uses the shared `factory/hyperliquid.ts` adapter, where `"nansen-outcome": { builder: "nansen-perps", market: "outcome" }` attributes volume by Nansen's perps builder-code address (H, https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts). Model it as `front_ends[]` metadata on the single `hyperliquid-hip4` pool, with `builder_code` = Nansen's address (a public protocol attribute, not a user wallet).

---

## 13. Adapter implications

- **No Nansen venue adapter.** Add Nansen to the HIP-4 adapter's `front_ends[]` list (name, DefiLlama slug `nansen-outcome`, builder-code address from the DefiLlama factory file, geo list above, "embedded wallet only", fee unknown).
- **Geo gate:** if the project ever recommends executing "via Nansen", gate on the Outcomes jurisdiction list; but prefer direct Hyperliquid.
- **Optional signal feed (P2-style, separate module):** Nansen `prediction-market/*` and `hyperliquid/*` endpoints. Needs a paid key (or x402), written permission for redistribution, and Polymarket market-id mapping. Only worth it if the linking layer wants wallet-quality weighting.

---

## 14. Priority

**adapter_priority = skip** (venue). Duplicate liquidity (fully shared with Hyperliquid HIP-4), negligible attributable volume ($7.6k in 30 days), no outcome API, no external-wallet trade path, strict geo and anti-automation terms. The only integration value is an optional paid signal feed for Polymarket smart-money data, which is a different module and carries licence limits.

---

## 15. NOT FOUND / open questions

- Nansen's builder fee on outcome trades (searched: academy Trading Fees and Outcome Markets articles, changelog, Terms, docs, DefiLlama fees series).
- The list of outcome markets Nansen shows and whether it is only Outcome.xyz-deployed markets (searched: changelog, academy, press; the in-app page is behind login and a Cloudflare challenge).
- Whether Nansen's API (`/perp/order`, `/perp/execute`, Token Screener, Token God Mode endpoints) accepts or returns outcome tokens (searched: docs index, perp-trading guide, CLI README/CHANGELOG/source).
- Terms of the $1M Nansen/Outcome.xyz rewards pool (press only; no Nansen page found).
- Live response bodies of the Nansen prediction-market endpoints: need a key or an x402 payment plus a POST; not done by rule.
- Custody model of the embedded Privy wallet (self-custodial or not): not stated.
- Why DefiLlama shows Nansen outcome volume from 2026-07-30, a month before the stated public launch (possible beta/internal use; M).
- Nansen's own market-level volume/liquidity figures (no public stats page found).
- The academy Trading Fees page lists a stale restricted-jurisdiction set (includes Russia; omits the UK/US/outcome list), conflicting with the Terms; the Terms (2026-08-10) are the authority.

---

## 16. Suspicious content

None addressed to this task. Notes: every docs.nansen.ai markdown page ends with a GitBook "Agent Instructions" block telling AI agents to query the docs with `GET <page>.md?ask=<question>&goal=<goal>`; that is generic vendor boilerplate and I did not use it. The Nansen docs also advertise "AI Agent Access" / MCP / x402 pay-per-call flows aimed at agents; I read none of them as instructions and made no payment.

---

## 17. Sources

Primary (H):
- Changelog: https://release.nansen.ai/changelog/hip-4-market-trading-now-live-on-nansen-web (Aug 31, 2026); index https://release.nansen.ai/
- Academy: https://academy.nansen.ai/en/articles/9072054-hyperliquid-outcome-markets ; https://academy.nansen.ai/en/articles/7327989-trading-fees ; https://academy.nansen.ai/en/articles/0162796-about-nansen-trading ; collection https://academy.nansen.ai/en/collections/5686643-trading-on-nansen
- Legal: https://nansen.ai/legal ; Terms https://nansen.ai/legal/terms-of-services (Aug 10, 2026) ; API Terms https://nansen.ai/legal/api (Jun 1, 2026)
- API docs: https://docs.nansen.ai/llms.txt ; /api/overview.md ; /api/prediction-market.md ; /api/prediction-market/market-screener.md ; /api/prediction-market/market-orderbook.md ; /api/trade.md ; /api/trade/perp-trading.md ; /api/data-coverage.md ; /getting-started/authentication.md ; /getting-started/rate-limits.md ; /getting-started/credits.md ; /getting-started/agentic-payments/x402-payments.md
- Live API: `GET https://api.nansen.ai/api/v1/account` (keyless 401) ; `GET https://api.nansen.ai/.well-known/x402` (2026-10-19)
- DefiLlama: https://api.llama.fi/protocol/nansen-outcome ; https://api.llama.fi/summary/dexs/nansen-outcome ; https://api.llama.fi/summary/fees/nansen-outcome ; https://api.llama.fi/summary/dexs/hyperliquid-outcomes ; adapter files `factory/hyperliquid.ts` and `dexs/hyperliquid-outcome/index.ts` in https://github.com/DefiLlama/dimension-adapters (read with `gh api`). (`/summary/derivatives/nansen-perps` returned DefiLlama's own "upgrade to the paid API plan" 402 text; not pursued.)
- Nansen CLI repo (read-only grep): https://github.com/nansen-ai/nansen-cli (README, CHANGELOG.md, src/perp.js)
- App: https://app.nansen.ai/ (Cloudflare 403 to scripted GET; not read)

Secondary (M/L):
- crypto.news 2026-09-08: https://crypto.news/nansen-becomes-first-front-end-to-support-outcome-xyz-hip-4-markets/ (page summary via fetch tool; mirrors at coinspectator.com and bitcoinethereumnews.com seen in search results, not opened)
- Sibling notes in this repo (reused, not re-verified live beyond DefiLlama totals): `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, `docs/research/venues/outcome-xyz.md`, `docs/research/14-platform-of-platforms.md`

---

## 18. Privacy

All scripted requests (curl) used User-Agent `insurance-markets-research/0.1`. The helper script was grepped for `@` before running (no hits) and contains no personal identifiers. The fixtures and this note were scanned for email addresses and the user's name before finishing. No wallet addresses of the user were read or written; the only address mentioned is Nansen's public builder-code address, referenced by pointer to the DefiLlama source rather than copied.
