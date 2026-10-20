# Perpmate (perpmate.com) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 04:15-04:30 UTC). READ-ONLY: unauthenticated GETs of public web pages, public JS bundles (read as text, never executed), DefiLlama public APIs, Hyperliquid docs, one unauthenticated WebSocket `subscribe` (`allMids`), and read-only PayBox discovery (`discover_plugins`, `discover_services`). No account, wallet, key, signature, POST, payment or PayBox money/signing tool was used. All third-party text was treated as untrusted data. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`; no personal identifier was sent anywhere.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary, my own computation or inference; **L** = weak or stale. "NOT FOUND (searched: ...)" = not documented where I looked.

Method limits: the WebSearch budget ran out partway through the session (shared across agents), so I did no further web searching after the first query; everything below comes from pages fetched directly.

---

## 0. Bottom line

1. **Live, but only as a skin.** perpmate.com serves a fresh "Predict" catalogue (markets created 2026-10-19 04:20Z) (H). It is a Hyperliquid front end whose prediction section is labelled "Powered by Outcome · Built on Hyperliquid (HIP-4)" (H).
2. **No liquidity of its own.** All 372 outcome coins on its 160 markets exist in Hyperliquid's live `allMids` frame, and 248 of 372 prices equal the Hyperliquid mid exactly (median difference 0) (H, fixture `price_parity_vs_hyperliquid_allMids.json`). It is **not an independent arbitrage leg**; it is the same HyperCore order books that Hyperliquid, Outcome.xyz and dozens of builder codes use.
3. **No API.** Perpmate publishes no API, docs or SDK for markets, books or orders (H: `robots.txt` disallows `/api/`; `llms.txt` and the sitemap list none). Its market list is only server-rendered into the page HTML. The right read path is Hyperliquid's public API.
4. **Negligible routed volume.** DefiLlama attributes **$50 all-time** (two days, last on 2026-08-24, zero for 7d/30d) to Perpmate's outcome builder code (H).
5. **Costs more than going direct.** The UI adds a 0.25% builder fee on sells (H). An agent that trades through Hyperliquid directly pays no Perpmate fee.
6. **adapter_priority = skip.** Build one `hyperliquid-hip4` adapter (see `docs/research/venues/hyperliquid-hip-4-outcome-markets.md` and `outcome-xyz.md`). Record Perpmate only as an alias / builder-code label and a UI-level price source.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `https://perpmate.com/predict` -> HTTP 200 on 2026-10-19 04:25Z; embedded list has 160 `active` markets, e.g. `createdAt 2026-10-19T04:20:53Z`, expiring 2026-10-19 04:30Z through 2027-06-30 | H |
| Market detail pages (e.g. `/predict/policy-rate-decision-october-2026`) render with prices, "Volume $264,505.30", oracle and fee text | H |
| Hyperliquid HIP-4 itself is live on mainnet (668 outcome coins in a live `allMids` frame 2026-10-19 04:27Z) | H |
| DefiLlama lists "Perpmate Outcome" (id 9034, category Interface, tag "Hyperliquid HIP4 Builder"), `listedAt` 2026-10-08T22:18Z (https://api.llama.fi/protocol/perpmate-outcome) | H |
| **But usage via Perpmate's builder code is ~zero**: outcome volume $35 on 2026-08-06 and $15 on 2026-08-24, nothing since (fixture `defillama_perpmate_outcome_trimmed.json`). DefiLlama's parent `perpmate` entry totals $14,019 all-time (last non-zero day 2026-08-27) and `perpmate-spot` $13,969 (H). `hl-indexer.llama.rip/v1/data/hourly?builder=<Perpmate builder>` shows `volumeUsd` 0 for every hour of 2026-10-10, 10-17 and 10-18 (fixture `hl_indexer_builder_hourly_2026-10-18_zero.json`) | H |
| Perpmate's own guide https://perpmate.com/learn/prediction-markets-hyperliquid-hip-4 is **stale**: it says HIP-4 is testnet-only (as of March 2026) with mainnet "planned" while also saying "prediction markets are live on Perpmate"; mainnet went live 2026-05-02 per DefiLlama's adapter comment (see sibling note) | M / L (stale) |

Verdict: **still_live = true** as a website; effectively dormant as a trading venue (by builder-routed volume).

---

## 2. Kind and market model

- **Kind (H):** non-custodial interface / broker front end. Perpmate describes itself as "a decentralized perpetual futures trading platform built on Hyperliquid" with swap, vaults, staking, and a Predict tab (https://perpmate.com/llms.txt). DefiLlama classes it "Interface" with `doublecounted: true` (H).
- **Underlying model (H):** Hyperliquid HIP-4 outcome contracts: fully collateralised Yes/No share pairs on a **central limit order book on HyperCore**, merged Yes/No book, no leverage. Not an AMM, not parimutuel. Full model in the sibling Hyperliquid note.
- **Tokenisation (H, JS + HL docs):** Perpmate computes the order asset as `1e8 + (10*outcomeId + sideIndex)` and reads positions from spot balances keyed `"+" + (10*outcomeId + sideIndex)`. This is exactly Hyperliquid's documented scheme: `#<enc>` coin, `+<enc>` token, `100_000_000 + enc` asset id (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids).
- **Market classes in the list payload (H, 160 markets at 2026-10-19 ~04:24Z):** `priceBinary` 127 (2 outcomes), `general` 32 (3-8 outcomes: match results with Draw, season winners, FOMC), `priceBucket` 1 (3 outcomes). Fields per market: `id, slug, title, description, category, imageUrl, status, marketClass, outcomes[{label,price,color,outcomeId,sideIndex}], volume24h, totalVolume, liquidity, openInterest, expiresAt, createdAt, oracleSource, tags` (fixture `ssr_predict_markets_sample.json`).
  - For `general` markets `id` is an Outcome.xyz question id (images load from `cdn.outcome.xyz/assets/question/<id>.png`); for price markets `id` is the Hyperliquid outcome id. Each categorical option is its own Hyperliquid outcome with its own Yes price (`sideIndex 0`), so Yes prices of one set need not sum to 1 (e.g. FOMC October: 0.74 + 0.1275 + 0.497 = 1.36 for id 331) (H).
  - Two separate FOMC October 2026 markets are listed (ids 289 and 331, different outcome ids) with very different prices (No change 0.869 vs 0.740) (H): Hyperliquid itself holds duplicate books for one event.
- **Price history is fake (H, JS):** the chart on each market page is generated client-side from a seeded PRNG around the current price. Never use Perpmate chart data as history.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading venue | Hyperliquid HyperCore (outcome tokens are HyperCore spot-style balances, not ERC-20s) | H |
| Collateral | Spot **USDC** on Hyperliquid: the Predict header reads token `USDC_SPOT`; errors map to "Insufficient spot USDC" (JS). Sibling note: quote token is read at runtime from `outcomeMeta`; do not hard-code | H (JS) / M |
| Deposit | Perpmate's guide: "deposit USDC on Arbitrum"; as low as 5 USDC; buy with card via MoonPay / Trust Wallet / Gem Wallet; Perpmate Swap for BTC, ETH, SOL; THORChain or NEAR Intents for other chains (https://perpmate.com/learn/docs/guides/deposit-crypto-to-trade-perps). Hyperliquid's own FAQ (via sibling note): wallet-connected accounts deposit USDC via Arbitrum only, deposits below 5 USDC are lost | M (small-model summary of the guide) |
| Withdraw | NOT FOUND (Perpmate's "Withdraw Profit" guide not read). Hyperliquid `withdraw3` per sibling note | - |
| Other chains | Bundle references Hyperliquid, HyperEVM (`rpc.hyperliquid.xyz/evm`), Base, Polygon, BNB RPCs for wallet/swap features; no outcome trading outside HyperCore | H |

---

## 4. Read API

**Perpmate has no public read API of its own (`exists: none`).**

- `https://perpmate.com/robots.txt`: `Disallow: /api/` (H). I did not call `/api/`.
- `https://perpmate.com/llms.txt` and the sitemap list pages, calculators and comparison articles, no API or developer docs (H). Docs link on the site: only a deposit guide. GitHub / SDK / developer docs: NOT FOUND (searched: homepage, predict page, market pages, llms.txt, sitemap, JS bundles; DefiLlama `github: null`).
- The only machine-readable market data is the Next.js RSC payload embedded in `/predict` HTML (`markets` prop). It is not an API, carries no stability promise, and in the list view `volume24h`, `totalVolume`, `liquidity`, `openInterest` are **0 for all 160 markets** (H) even though detail pages show non-zero volume for some (e.g. $264,505.30 on the October FOMC market, $50,083.64 on Tottenham v Coventry; whether "Volume" is lifetime or 24h is not stated). Because Perpmate-routed volume is ~$50, those figures are market-wide Hyperliquid volumes (M, inference).
- **Use Hyperliquid's API instead** (H via sibling notes; fees and asset-id pages re-read this session): `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `l2Book`, `allMids`, `settledOutcome`, ...) and `wss://api.hyperliquid.xyz/ws` (`allMids`, `l2Book`, `trades`, `outcomeMetaUpdates`). Docs https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api. No auth for reads; limits 1200 REST weight/min/IP, 1000 WS subscriptions per IP. Live check this session: one `allMids` subscribe frame returned 668 `#<enc>` outcome coins, covering all 372 Perpmate coins (H).
- To attribute volume to Perpmate's builder code: DefiLlama `https://api.llama.fi/summary/dexs/perpmate-outcome` and `https://hl-indexer.llama.rip/v1/data/hourly?date=YYYY-MM-DD&builder=<addr>` (public GET, no auth; H).
- Resolution data: Hyperliquid `settledOutcome` / WS `outcomeSettled`; Perpmate exposes none.

Fixtures: `docs/research/fixtures/perpmate/` (list below).

---

## 5. Trade path (programmatic)

- **Perpmate offers none.** It is a browser UI that signs and submits directly from the user's wallet (wagmi / RainbowKit / viem bundle) (H).
- **What the UI does (H, public JS, excerpt in `bundle_builder_and_order_snippets.txt`):** `exchange.order({orders:[{a: 1e8+(10*outcomeId+sideIndex), b: isBuy, s: size, p: price, r:false, c: cloid, t:{limit:{tif:"Gtc"}}}], grouping:"na", builder: {b: <Perpmate builder address>, f: 250}})`, with `builder` attached to **sell** orders only. Buy price = `min(1.5 x quoted price, 0.9999)`; sell price = 0.0001 (marketable limits). UI minimum buy order **$10.10** (constant `N=10.1`). Before the first sell the user signs `approveBuilderFee` (EIP-712 `HyperliquidTransaction:ApproveBuilderFee`, `maxFeeRate` string).
- **Implication:** an agent should call Hyperliquid's `/exchange` itself (signed L1 `order` action, agent-wallet pattern; details in the sibling note) and omit the `builder` field. There is nothing to gain from Perpmate's rails.
- Cancellation, order status, positions: Hyperliquid APIs only.

---

## 6. Reachability from a PayBox wallet

**Verdict: partial, and only via Hyperliquid, never via Perpmate.**

- PayBox catalogues: `discover_plugins("perpmate")` -> `plugins: []`; `discover_services("perpmate")` -> empty curated catalog (H, 2026-10-19). I did not retry with `raw=true`.
- An EVM wallet in PayBox could sign Hyperliquid typed data (`request_wallet_sign` supports EIP-712) for `approveAgent` and per-order `Agent` signatures, and could fund the account by sending Arbitrum USDC. No Base / Ethereum / BNB / Polygon / Solana transaction proposal trades it directly; HyperEVM CoreWriter is the only on-chain-tx route and does not clearly accept outcome orders (see sibling note section 6; not re-verified here).
- Geo: see section 9.

---

## 7. Fees

- **Perpmate (H):** market pages state "Fees: 0.25% on sells, 0% on buys." The bundle sets `fPredict: 250` (Hyperliquid builder fee units are tenths of a basis point, so 0.25%) and `f: 50` (0.05%) for perps. It is Hyperliquid's builder-code mechanism: paid by the seller to Perpmate's builder address, charged in the quote token. A hold-to-expiry position places no sell order, so I expect no Perpmate fee at settlement (M, inference: settlement is not an order).
- **Hyperliquid (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees, "Outcome tokens"):** outcome trading charges fees only when closing or settling, not when opening; no maker rebates on outcomes. The numeric base rate is NOT FOUND in the official docs; deployer fees scale per market (`deployerFeeScale`). Sibling note's empirical all-in band: 11-25 bps (M, includes builder fees).
- **Round trip through Perpmate:** buy 0 + sell 0.25% + Hyperliquid's closing fee. Direct on Hyperliquid: only the Hyperliquid fee. Gas: none for orders (HyperCore).

---

## 8. Resolution mechanism and dispute risk

Perpmate resolves nothing. Everything is delegated to the HIP-4 deployer / protocol (H on the label, M on the rules, which come from the sibling Hyperliquid and Outcome.xyz notes).

- `oracleSource: "pyth"` (128 markets: crypto and finance price thresholds). The description says "Resolves YES if the BTC-USDC perp mark is at or above $X at <time>": settlement is against the HyperCore perp mark price (linear interpolation at the timestamp per Hyperliquid contract specs; Outcome docs also mention a TWAP variant, so pin the rule per series). HIP-3 `xyz:` equity / commodity / index perps (SP500, XYZ100, CL, GOLD, META ...) settle on those perps' mark prices. Protocol-settled, machine-checkable.
- `oracleSource: "seda"` (32 markets: sports results, season winners, FOMC). Settled by the deployer (Outcome.xyz) with its own resolution system; **no on-chain dispute or challenge window** documented; backstop is a validator-slashable deployer stake (500,000 HYPE per the sibling notes) (M).
- Edge-case differences vs other venues (draw handling, regulation time only, "No change" definition) are in the sibling notes; map rules text before pairing any leg.

---

## 9. Geo, ToS, automation

- **Perpmate's own terms / privacy / restricted-jurisdiction policy: NOT FOUND** (searched: `/terms`, `/terms-of-service`, `/terms-of-use`, `/privacy`, `/legal/terms` all 404; no terms link in homepage, predict or market page HTML; no geo check found in the JS bundles; market pages show no disclaimer or restricted-region notice). The site advertises "No KYC" (llms.txt, H).
- **Underlying Hyperliquid Terms of Use ("Last updated on June 15, 2026", read first-hand this session from https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js) (H):** Restricted Persons include those who reside, are located or are incorporated in "the United States of America or Ontario, Canada" and sanctioned jurisdictions; clause 1.7: outcome markets are "not available to 'Excluded Persons'" defined by "certain jurisdictions that we designate from time to time" (list NOT FOUND); clause 1.8: may block the outcome-markets tab. These bind the Hyperliquid Interface; whether they bind a third-party interface or direct API use is a legal question I did not resolve.
- Automation: no Perpmate rule found. robots.txt allows `/` and disallows `/api/` and some `/learn` feeds (H). Hyperliquid's terms prohibit usage that "exceeds reasonable usage, bypass[es] rate limits..." (sibling note, M).

---

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Volume routed via Perpmate's outcome builder code | **$50 all-time** ($35 on 2026-08-06, $15 on 2026-08-24); 24h / 7d / 30d = $0; fees $0.05 all-time | https://api.llama.fi/summary/dexs/perpmate-outcome and /summary/fees/perpmate-outcome, fetched 2026-10-19 | H |
| Perpmate parent / spot builder volume | $14,019 / $13,969 all-time; 30d $0 | https://api.llama.fi/summary/dexs/perpmate, /perpmate-spot, fetched 2026-10-19 | H |
| Perpmate TVL | none (DefiLlama `tvl: []`; non-custodial) | api.llama.fi/protocol/perpmate-outcome | H |
| Market-wide volume shown on detail pages | FOMC Oct 2026 (id 289): $264,505.30; Tottenham v Coventry: $50,083.64; short-dated BTC / sample markets: $0.00 (period label unstated) | perpmate.com market pages, 2026-10-19 ~04:25Z | H (text) / M (meaning) |
| Underlying Hyperliquid HIP-4 | ~$3.13M daily (2026-10-18), ~$17.9M 7d per sibling note | https://api.llama.fi/summary/dexs/hyperliquid-outcomes via `hyperliquid-hip-4-outcome-markets.md` | M (not re-fetched) |
| Depth | Not Perpmate's; per sibling note the best book holds roughly $2-3k within 1 cent of mid | sibling note, 2026-10-19 | M |

Price parity (H, fixture `price_parity_vs_hyperliquid_allMids.json`, 04:27:59Z): 372 of 372 Perpmate coins found in Hyperliquid `allMids`; 248 exact matches; 52 differ by more than 0.001; 7 by more than 0.02 (4 crypto and 2 finance threshold markets expiring within minutes, 1 NBA outcome: Perpmate 0.514 vs Hyperliquid 0.096, cause unknown). Treat Perpmate's displayed prices as stale-able copies of the Hyperliquid mid, not as tradable quotes.

---

## 11. Event categories and overlap with other venues

Snapshot of the 160 listed markets (H, 2026-10-19 ~04:24Z): crypto 64, finance 64, sports 30, economics 2, politics 0 (the UI has a politics filter but no politics market was listed).

| Category | What is listed | Overlap for arbitrage |
|---|---|---|
| Crypto price | BTC (32, incl. the 1 price-bucket), ETH (16), HYPE (11), ZEC (4), SOL (1): "above $X at <time>" from minutes to days, plus 13 "touch before <date>" markets | Polymarket / Kalshi BTC & ETH thresholds, but reference price is the **Hyperliquid perp mark**, not Binance / CF Benchmarks / Coinbase: basis risk, short horizons |
| Finance | SP500 (10), XYZ100 (10), CL (8), GOLD (4), SILVER (2), single names (META, TSLA, NFLX, IBM, INTC, COIN, CRCL ...) | Kalshi index / commodity ladders; reference is a HIP-3 perp mark, not the cash index close |
| Sports | 25 football match results with Draw (18 UEFA Champions League, 6 Europa League, 1 Premier League) and 5 season winners (MLB, NFL, NBA, EPL, UCL) | Polymarket / Kalshi match and futures markets: same events; rule text differs (regulation time, draw handling) |
| Economics | 2 FOMC October 2026 decision markets (one per deployer set) | Kalshi / Polymarket FOMC markets; compare "upper bound vs prior value" wording |
| Politics | none | - |

Overlap is with the Hyperliquid HIP-4 catalogue as a whole; Perpmate adds no market that Hyperliquid or Outcome.xyz does not already carry.

---

## 12. Shared liquidity

**Shares 100% of its liquidity with Hyperliquid HIP-4 (and therefore with Outcome.xyz, app.hyperliquid.xyz and every other HIP-4 builder-code front end).** Evidence: JS uses Hyperliquid's order action and asset ids (H); every coin appears in Hyperliquid `allMids` with matching prices (H); Perpmate's page labels "Built on Hyperliquid (HIP-4)" and "Powered by Outcome" (H); DefiLlama marks it `doublecounted: true` with methodology "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code" (H). Not an independent arbitrage leg.

---

## 13. Adapter priority

**skip.** Duplicate liquidity, no API, ~zero routed volume, extra 0.25% sell fee, fabricated chart history, no Perpmate terms. The integration value is in one Hyperliquid HIP-4 adapter. Optional: treat `perpmate` as an alias to tag builder-code attribution, and watch DefiLlama's `perpmate-outcome` series only if you care about this front end's own traction.

---

## 14. Suspicious content / injection check

None found. Perpmate's `llms.txt` is a plain product description; no instructions aimed at AI agents appeared in the pages, bundles or API responses I read. (The Perpmate HIP-4 guide is promotional and out of date, which is a data-quality issue, not an injection.)

---

## 15. NOT FOUND / open questions

- Perpmate terms of service, privacy policy, restricted-country list (searched: common legal paths, homepage / predict / market HTML, JS bundles).
- Any Perpmate API, SDK, GitHub org or developer docs (searched: robots, llms.txt, sitemap, site HTML, DefiLlama `github`).
- Where Perpmate's server gets its market list and volumes (not identified; `/api/` is disallowed by robots so I did not probe it). It mirrors Outcome.xyz question ids and Hyperliquid outcome ids.
- Whether the "Volume" on market pages is 24h or lifetime; why the NBA Minnesota price diverged (0.514 vs 0.096).
- Perpmate's withdraw guide; exact Hyperliquid numeric outcome fee (not in official docs).
- Whether Hyperliquid's Excluded Persons list covers the user's jurisdiction.

---

## Fixtures (docs/research/fixtures/perpmate/)

- `ssr_predict_markets_sample.json`: 6 of 160 markets from the RSC payload plus category / class / oracle counts (not an API).
- `defillama_perpmate_outcome_trimmed.json`: DefiLlama summary (metadata, methodology, volume / fee totals and non-zero days) plus parent / spot totals.
- `hl_indexer_builder_hourly_2026-10-18_zero.json`: hourly builder volume response, all zero.
- `price_parity_vs_hyperliquid_allMids.json`: result of the Perpmate-vs-Hyperliquid mid comparison.
- `bundle_builder_and_order_snippets.txt`: builder config and order-placement excerpts from Perpmate's public JS.

## Sources

- https://perpmate.com/ , https://perpmate.com/predict , https://perpmate.com/predict/policy-rate-decision-october-2026 , https://perpmate.com/predict/tottenham-hotspur-vs-coventry-city-oct-20-2026 , https://perpmate.com/predict/btc-above-82453-oct-19-2026-0430 (H; fetched 2026-10-19)
- https://perpmate.com/robots.txt , https://perpmate.com/llms.txt , https://perpmate.com/sitemap.xml (H)
- https://perpmate.com/_next/static/chunks/ (constants chunk `362-*.js`, `app/[locale]/predict/page-*.js`, `app/[locale]/predict/[slug]/page-*.js`) (H, read as text)
- https://perpmate.com/learn/docs/guides/deposit-crypto-to-trade-perps (M, fetch-model summary)
- https://perpmate.com/learn/prediction-markets-hyperliquid-hip-4 (M / L, stale promotional guide)
- https://defillama.com/protocol/perpmate-outcome (403 to WebFetch; data read via the public API below); https://api.llama.fi/protocol/perpmate-outcome , /summary/dexs/perpmate-outcome , /summary/fees/perpmate-outcome , /summary/dexs/perpmate , /summary/dexs/perpmate-spot (H, 2026-10-19)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts (`gh api` raw read; Perpmate builder entry and `perpmate-outcome` listing, start 2026-05-02) (H)
- https://hl-indexer.llama.rip/llms.txt and `/v1/data/hourly?date=...&builder=...` (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets (M, fetch-model summary), .../trading/fees.md and .../for-developers/api/asset-ids.md (H)
- https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js (Terms of Use, last updated June 15, 2026) (H)
- `wss://api.hyperliquid.xyz/ws` unauthenticated `allMids` subscribe, 2026-10-19 04:27Z (H)
- PayBox `discover_plugins` / `discover_services` for "perpmate", 2026-10-19 (H)
- Sibling project notes: `docs/research/venues/hyperliquid-hip-4-outcome-markets.md`, `outcome-xyz.md` (secondary for resolution, fee-band, geo and PayBox-route details; they carry their own tags)
