# Cipher (app.cipher.gg, "Predict" tab) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: doc reads, `gh api` file reads, unauthenticated GETs to DefiLlama / Hyperliquid stats / Cipher's own public static pages, and reading Cipher's static JS bundles as text (nothing executed). No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox money/signing tool was used. Third-party pages and bundles were treated as untrusted data; nothing in them was followed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (each <= 50 KB), all under `docs/research/fixtures/cipher/`:
- `defillama_cipher-outcome_protocol.json` - DefiLlama listing record (category Interface, tag "Hyperliquid HIP4 Builder", parent cipher.gg)
- `defillama_cipher-outcome_dexs_summary.json` - daily volume series and methodology
- `defillama_factory_hyperliquid_cipher_lines.txt` - builder address and `cipher-outcome` mapping from DefiLlama's adapter source
- `hyperliquid_builder_fills_cipher-builder_20261018_REDACTED.csv` - Hyperliquid public builder-fills archive shape (addresses redacted)
- `app_bundle_excerpts.txt` - excerpts of Cipher's static JS (builder fee, min notional, order action, builder address, private API base)

---

## 0. Bottom line

1. **Cipher is not a venue. It is a Solana-first trading terminal whose "Predict" tab is a thin front-end over Hyperliquid HIP-4 outcome markets**, attributing its trades with a Hyperliquid *builder code*. It has no order book, no liquidity, no oracle, no resolution logic and no public API of its own. (H: DefiLlama lists it as category "Interface", tag "Hyperliquid HIP4 Builder", description "Cipher provides access to outcome-based prediction markets through Hyperliquid"; the app's own bundle posts `l2Book` to `api.hyperliquid.xyz/info` and signs a plain Hyperliquid `order` action with a `builder` field.)
2. **Not an independent arbitrage leg.** Every Cipher fill is a fill on the same HyperCore books that the Hyperliquid HIP-4 adapter already reads. Treat it as an attribution tag, not a source of prices. (H)
3. **Usage is negligible.** Lifetime Hyperliquid outcome volume routed through Cipher's builder code is **$939** over 12 non-zero days (DefiLlama, through 2026-10-18); the last meaningful day was 2026-06-18, then a single $15 day on 2026-10-18. That is ~0.0004% of Hyperliquid's $261M all-time outcome volume. (H, computed)
4. **Hard blockers for using it as a trade path:** no API; the order ticket signs in-browser with an approved Hyperliquid agent wallet (Privy-style embedded wallet stack); Cipher's own terms bar US, "Republic of China" and Singapore users, on top of Hyperliquid's own US/Ontario bar. A PayBox wallet that wants HIP-4 exposure should go to Hyperliquid directly (see `hyperliquid-outcomes-hip-4.md`), paying no extra 5 bps.
5. **adapter_priority = skip** (duplicate liquidity, no API, trivial volume). Nothing to build for Cipher itself. If the aggregator ever wants to attribute its own HIP-4 orders, that is a Hyperliquid builder-code decision, not a Cipher integration.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://app.cipher.gg/predict` | HTTP 200, title "Prediction Markets \| Cipher", nav "Perpetuals / Predict / Multi Chart", "Connect Wallet" (market list is client-rendered, so the SSR HTML has no market data). Fetched 2026-10-19 | H |
| Predict order ticket is deployed | `placeOutcomeOrder` code path, "Min notional", "Builder fee 0.05%", "Your HIP-4 share holdings will appear here." in the current JS chunks (fixture `app_bundle_excerpts.txt`) | H |
| Cipher still operating as a company | Builder-code perp fills on 2026-10-17 and 2026-10-18 exist in Hyperliquid's public stats archive (fixture `hyperliquid_builder_fills_cipher-builder_20261018_REDACTED.csv`); DefiLlama parent "Cipher.gg" lists Cipher Perps, Cipher Spot, Cipher Outcome | H |
| Outcome usage | DefiLlama `cipher-outcome` daily volume: non-zero on only 12 days (2026-05-13 .. 2026-06-18, then 2026-10-18); zero 2026-06-19 .. 2026-10-17 | H |
| DefiLlama listing | `cipher-outcome` id 8971, `listedAt` 1791497871 = Thu 2026-10-08 22:17:51 UTC (computed); the sibling `hyperliquid-outcomes` listing is 1791495619 = 2026-10-08 21:40:19 UTC. Both were listed the same day, consistent with the "DefiLlama Interface (2026-10-08)" hint | H |
| Underlying venue live | Hyperliquid Outcomes: 24h $3.13M, 7d $17.9M, 30d $47.0M, all-time $261.1M; daily volume non-zero through 2026-10-18 (api.llama.fi `summary/dexs/hyperliquid-outcomes`, fetched 2026-10-19) | H |
| Cipher docs / ToS mention Predict | **No.** GitBook index (`llms.txt`) has no prediction/outcome/API page; FAQ says only "Solana ecosystem for spot, Hyperliquid network for perpetuals"; Terms (effective June 1st, 2025) never mention prediction markets or Hyperliquid | H |
| Cipher's own announcement of Predict | NOT FOUND (searched: web search "tradeonCipher Predict HIP-4", "cipher.gg Hyperliquid prediction", cipher.gg landing page, docs index). Launch date of the tab is unknown; first builder-attributed outcome volume is 2026-05-13, eleven days after HIP-4 mainnet (2026-05-02) | M |

Verdict: **still_live = true** as an interface (the tab and order ticket exist and Cipher is operating), but effectively unused for outcomes.

---

## 2. Kind and market model

- **Kind (H):** broker / front-end ("Interface") over Hyperliquid HIP-4. Cipher says of itself "the ultimate crypto trading terminal built for high-performance execution and high-reward trading" (docs readme) and "the all-in-one trading platform built for onchain markets" (cipher.gg).
- **Market model: inherited entirely from Hyperliquid HIP-4 (H via bundle, M for the details):** binary Yes/No outcomes on a merged central limit order book on HyperCore; questions group outcomes into categoricals; collateral USDC. The bundle special-cases `priceBucket` questions (bucket colouring, "< $X" / ">= $Y" labels) and shows "Resolution: <expiry UTC>" for parsed price markets; anything it cannot parse is treated as "freeform" and shows no expiry. For tokenisation (`#<10*outcome+side>` coins, asset id `100_000_000 + encoding`), the full mechanics are in `docs/research/venues/hyperliquid-outcomes-hip-4.md` section 2 (H there; I did not re-verify them).
- **What Cipher adds:** nothing to the market itself. UI conveniences only: market/limit, slippage control (default constant unresolved), a $10 minimum notional, share-count rounding to integers, a "Resolution" row.
- **Price clamp in UI (H, bundle):** market orders are priced as `mid * (1 +/- slippage)` clamped to [0.0001, 0.9999] and sent as `Ioc`; limit orders must satisfy 0 < p < 1 and `tif` defaults `Gtc`.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading venue | Hyperliquid L1 (HyperCore) via `api.hyperliquid.xyz`. DefiLlama chain: "Hyperliquid L1". | H |
| Collateral | USDC ("Available USDC" in the order ticket). The wallet picker also shows a "Legacy USDH" bucket for pre-migration HIP-4 balances. | H (bundle strings) |
| Funding path in the Cipher UX | Docs: click the "Sol - USDC" button, Bridge, "SOL -> USDC on Hyperliquid"; withdrawal converts HL USDC back to SOL, "After ~5 minutes you will receive SOL". The bundle also references Arbitrum RPC / USDC addresses, MoonPay and a `hyperliquid-spot` transfer destination. | H (docs), M (bundle inference) |
| Wallet stack | Privy (`auth.privy.io`, TEE-wallet migration guide link), WalletConnect, Phantom/Solflare deep links, viem. Orders are signed client-side by an **approved Hyperliquid agent wallet** (error string: "Enable trading first: approve your agent wallet to continue."). | H (strings), M (stack inference) |
| Builder address | `0x32F6940795d6D484A6d29b6B628ebaFf80A0c779` (module constant `dd`; same address in DefiLlama `factory/hyperliquid.ts` as `cipher-perps`) | H |

---

## 4. Read API

- **Cipher public API: none.** Docs index (https://cipher-6.gitbook.io/tradeoncipher/llms.txt) lists Getting started, Fees, Cipher Swaps, Perpetuals (deposit / trading on Hyperliquid / withdraw), Wallet tracking; no API page. The Terms list "APIs" among Services but give no terms or endpoints. (H)
- **Cipher private backend:** the bundle creates an axios client for `https://api.cipher.gg` with `withCredentials: true` and a route `/v1/hyperliquid/metadata`. It is undocumented and cookie-authenticated, so **I did not probe it** (not a documented API host). (H that it exists, NOT probed)
- **Where the data really comes from (H, bundle):** the Predict view POSTs `{"type":"l2Book","coin":...}` straight to `https://api.hyperliquid.xyz/info` and reads `allMids` from Hyperliquid. So the correct read adapter for these markets is the Hyperliquid one: docs https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api, WS `wss://api.hyperliquid.xyz/ws`, keyless, per-IP limits (details and live fixtures in the sibling note, which I did not re-verify).
- **Cipher-specific data a scanner could use:** none of value. The only public Cipher-attributed data is aggregate (DefiLlama) and the per-fill builder CSV in Hyperliquid's stats archive (below).
- **Public per-fill archive (H, GET 200):** `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/0x32f6940795d6d484a6d29b6b628ebaff80a0c779/YYYYMMDD.csv.lz4`, columns `time,user,coin,side,px,sz,crossed,special_trade_type,tif,is_trigger,counterparty,closed_pnl,twap_id,builder_fee`. 2026-10-18 holds 3 fills, all HYPE perps (0.07 to 0.15 USD builder fee each), none in an outcome (`#...`) coin. The file reveals trader addresses, so the fixture is redacted.
- **Rate limits / websocket for Cipher:** n/a (no API). Hyperliquid's apply for the underlying.

Sample response shapes captured: DefiLlama protocol and dimension summaries, builder-fills CSV (fixtures listed at the top of this note).

---

## 5. Trade path (programmatic)

- **Via Cipher: none.** No API, no SDK, no documented bot interface. The order ticket runs in the browser: `submitExchangeAction` builds the SDK call `exchange.order({...action, builder: {b: <builder address>, f: 50}})` for `type: "order"` and signs with the locally held agent wallet (H, bundle). The order body is a standard Hyperliquid action: `{type:"order", grouping:"na", orders:[{a: <asset id>, b: <is buy>, p, s, r:false, t:{limit:{tif}}}]}`, posted to Hyperliquid, not to Cipher's server.
- **Implication:** Cipher is not required for anything. Any account that can sign Hyperliquid actions can place the same order with or without the builder object. For the signing scheme (L1 action phantom-agent EIP-712, `approveAgent`, `approveBuilderFee`) see sibling note section 5 (H there).

---

## 6. Reachability from a PayBox wallet

**Verdict: no (for Cipher as a venue). Partial for the underlying Hyperliquid venue.**

1. Cipher has no programmatic interface, and its signing key is an agent wallet created inside the Cipher web app and tied to the user's Cipher wallet (Privy-style, Solana-first). A PayBox EVM wallet cannot propose a transaction to "trade on Cipher": there is no Cipher contract on any EVM chain (Cipher's own Terms say it is "built on the Solana blockchain ecosystem").
2. The only thing a PayBox wallet could do is bypass Cipher and trade Hyperliquid directly: HyperCore takes signed actions, not EVM transactions. PayBox reach to that is **partial** (typed-data signing plus an agent key; funding USDC on Arbitrum), as analysed in `hyperliquid-outcomes-hip-4.md` section 6. That analysis applies unchanged and Cipher adds nothing to it.
3. Embedding Cipher's builder code in our own orders would require the user's main wallet to sign `approveBuilderFee` for Cipher's address and would send them a 5 bp fee for no benefit. Not recommended.

---

## 7. Fees

- **Cipher's builder fee on outcome orders (H):** the Predict order ticket shows "Builder fee 0.05%" and the code attaches `builder: {b: 0x32F6...c779, f: 50}` to every `order` action. Hyperliquid's builder `f` is in tenths of a basis point (sibling note section 5, H there), so 50 = 5 bps = 0.05%, which agrees with the UI string. Max builder fee on spot is 1% per the HL builder-codes page (sibling note).
- **Not an additional "Cipher fee" tier:** the docs "Cipher Fees" page lists reward tiers (Iron "Net fee 0.90% / cashback 0.10%" ... Master "Net fee 0.30% / cashback 0.70%", up to 80% cashback) in the context of Solana swaps and points. The docs do not say whether any of this applies to Hyperliquid perps or HIP-4. Treat as unknown for outcomes (M).
- **Observed vs expected:** DefiLlama shows all-time Cipher Outcome fees of $0.12 against $939 of volume (about 1.3 bps), versus 5 bps expected on volume if the fee were charged on every fill. Likely explained by DefiLlama's volume counting convention or because HIP-4 builder fees apply on selected sides only; unresolved (M/L).
- **Hyperliquid's own outcome fees** (charged on close/settle only, deployer fee scale, no maker rebate) are in the sibling note section 7 and apply on top. The rate was not published numerically in HL docs when that note was written.
- **Who pays:** the user, on top of HL's fee.

---

## 8. Resolution mechanism and dispute risk

Identical to Hyperliquid HIP-4, because the contracts are Hyperliquid's: protocol-recurring crypto markets settle by code against the HyperCore mark price; template/question markets are deployer-settled with no trader dispute process; see `hyperliquid-outcomes-hip-4.md` section 8. **Cipher itself has no resolution role and no dispute channel** (Terms: "Cipher provides software services and does not custody assets or broker trades"). A mis-resolved market on Hyperliquid would leave Cipher users with no recourse via Cipher. (M, inference from the terms and the architecture)

---

## 9. Geo, ToS and automation (primary source, H)

Source: https://cipher.gg/terms, read as page text on 2026-10-19. "Effective Date: June 1st, 2025" (so **older than 16 months: possibly stale**; no mention of prediction markets or Hyperliquid).

- **Prohibited jurisdictions:** "These include, but are not limited to: United States, Republic of China, Singapore", plus Myanmar, Cote D'Ivoire, Cuba, Crimea/Sevastopol, DRC, Iran, Iraq, Libya, Mali, Nicaragua, North Korea, Somalia, Sudan, Syria, Yemen, Zimbabwe and any area under U.S., U.K. or E.U. sanctions.
- **Circumvention:** "The use of VPNs or other methods to bypass these restrictions is strictly forbidden and will lead to account termination."
- **KYC/AML:** Cipher "reserves the right ... to perform Know Your Customer (KYC) and Anti-Money Laundering (AML) checks".
- **Automation / bots / API:** no specific rules. Acceptable use bars "circumventing security measures or technological safeguards". "APIs" are named as part of the Services with no terms. A bot driving the web app is not documented as allowed; there is nothing to automate against anyway.
- **Beta:** "currently in a limited beta phase and is provided 'as-is'... Cipher may terminate or modify any beta feature without notice."
- **Stacked restrictions:** Hyperliquid's own terms (US and Ontario barred from the Interface, plus open-ended "Excluded Persons" for outcome markets; bots only barred when they exceed reasonable usage) also apply to the underlying venue; see sibling note section 9.

---

## 10. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Cipher Outcome volume, 24h / 7d / 30d (to 2026-10-18) | $15 / $15 / $15 | api.llama.fi `summary/dexs/cipher-outcome`, 2026-10-19 | H |
| Cipher Outcome volume, all time | **$939**, 12 non-zero days, peak $235 on 2026-05-26 | same | H |
| Cipher Outcome fees, all time | $0.12 | `summary/fees/cipher-outcome` | H |
| Cipher Spot (HL spot via builder), all-time volume | $294 | `summary/dexs/cipher-spot` | H |
| Cipher Perps builder fees, all-time / 30d / 24h | $11,195 / $108.51 / $0.39 | `summary/fees/cipher-perps` | H |
| Underlying Hyperliquid Outcomes | 24h $3.13M, 7d $17.9M, 30d $47.0M, all-time $261.1M | `summary/dexs/hyperliquid-outcomes` | H |
| Cipher share of HL outcome volume | 939 / 261,084,367 = 0.00036% | computed | H (computed) |
| TVL / OI | n/a (no pool, no custody); DefiLlama `tvl: []` | `api.llama.fi/protocol/cipher-outcome` | H |

DefiLlama's own `doublecounted: true` flag on the dimension record confirms it is a re-attribution of Hyperliquid volume. Cipher's depth is Hyperliquid's depth; see sibling note section 10.

---

## 11. Event categories and cross-venue overlap

Same as Hyperliquid HIP-4 (crypto-price ladders, Fed/rate decisions, sports, stocks, awards, etc.; sibling note section 11). Cipher adds no categories and curates nothing of its own that I could see: the view is populated from `outcomeMeta`-style data pulled from Hyperliquid and filtered by `kind` (`priceBinary`, `priceBucket`, freeform). Overlap with Polymarket / Kalshi / Limitless / Predict.fun exists at the Hyperliquid level only.

---

## 12. Does it share liquidity with another venue?

**Yes: 100% shared with Hyperliquid HIP-4 outcomes.** It is therefore **NOT an independent arbitrage leg**. Same books, same fills, same settlement; only the builder-code attribution differs. The same applies to the other front-ends DefiLlama lists as "Interface" over Hyperliquid outcomes (Outcome.xyz, Based, Liquid, Phantom, Dreamcash and others in `factory/hyperliquid.ts`). (H)

---

## 13. Adapter spec for the aggregator

- **Do not build a Cipher adapter.** Build/keep the Hyperliquid HIP-4 adapter; give it a `routes_via` / `attribution` field if you want to model front-ends, with `cipher` carrying builder address `0x32F6...c779` and `fee_bps = 5`.
- **Fee model add-on (only if our own flow ever routes via Cipher's builder code):** `total_fee = HL_outcome_fee(close/settle) + 5 bps builder`. We should not.
- **Monitoring:** if desired, poll `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/<builder>/<YYYYMMDD>.csv.lz4` filtered to coins starting `#` to measure Cipher's outcome flow; it is currently ~0.

---

## 14. Priority

**adapter_priority = skip.** Reasons: duplicate liquidity (100% Hyperliquid); no public API; $939 lifetime volume; terms bar US, "Republic of China" and Singapore users and are silent on prediction markets; no PayBox path of its own. Only reason to revisit: if Cipher builds an independent liquidity layer (nothing suggests it) or if a user's own flow is attributed to it.

---

## 15. NOT FOUND / open questions

- Cipher's announcement or docs for Predict: NOT FOUND (searched docs `llms.txt`, FAQ, cipher.gg, cipher.gg/terms, web search x3). Docs still describe the product as spot (Solana) plus HL perps.
- Cipher's X/Discord posts: not readable (no browser automation, X is not fetchable); NOT FOUND.
- Why DefiLlama books a $15 outcome volume on 2026-10-18 while the builder-fills CSV for that date shows only HYPE perp fills: unresolved (different source/timestamp rule or the CSV is partial). L.
- Why builder fees are $0.12 on $939: see section 7. L.
- Default slippage constant in the UI (`sp`) and exactly which Privy wallet type holds the agent key: not extracted. L.
- Whether Cipher's reward tiers (cashback) apply to HIP-4 trades: NOT FOUND.
- `api.cipher.gg` endpoints: deliberately not probed.

---

## 16. Suspicious content

None found in Cipher's docs, terms or bundles targeting AI agents. The static bundles contain a Google Tag Manager id and Umami analytics script (normal analytics); nothing was executed.

---

## 17. Sources

All fetched 2026-10-19.

| # | URL | What | Tag |
|---|---|---|---|
| 1 | https://app.cipher.gg/perpetuals , https://app.cipher.gg/predict | App shell, nav, title "Prediction Markets \| Cipher" | H |
| 2 | https://app.cipher.gg/_next/static/chunks/ (predict page chunk, chunks 995, 5145, 3689, 141, 2790, 6719 and others; excerpts in fixtures) | Order ticket, builder fee 0.05%, `f: 50`, min notional $10, builder address, agent-wallet signing, api.cipher.gg base, HL `/info` use | H (code read as text) |
| 3 | https://cipher-6.gitbook.io/tradeoncipher/llms.txt , `/readme.md`, `/readme-1.md` (FAQ), `/getting-started/fees/cipher-fees.md`, `/perpetuals/deposit.md`, `/perpetuals/withdraw.md`, `/perpetuals/trading-on-hyperliquid.md` | Official docs; no API or prediction page | H |
| 4 | https://cipher.gg , https://cipher.gg/terms | Landing page and Terms (effective 2025-06-01) | H |
| 5 | https://api.llama.fi/protocol/cipher-outcome ; `/summary/dexs/cipher-outcome` ; `/summary/fees/cipher-outcome` ; `/summary/dexs/cipher-spot` ; `/summary/fees/cipher-perps` ; `/summary/dexs/hyperliquid-outcomes` ; `/protocol/cipher.gg` | Listing metadata, volumes, fees | H |
| 6 | `gh api repos/DefiLlama/dimension-adapters/contents/factory/hyperliquid.ts` | `cipher-perps` builder address; `cipher-outcome` = builder `cipher-perps`, market `outcome`, start 2026-05-02 | H |
| 7 | https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/0x32f6940795d6d484a6d29b6b628ebaff80a0c779/20261018.csv.lz4 (and 20261017) | Per-fill builder archive | H |
| 8 | `docs/research/venues/hyperliquid-outcomes-hip-4.md` (sibling note, same day) | HIP-4 mechanics, fees, API, resolution, geo (not re-verified by me) | M |
| 9 | Web searches ("tradeonCipher Predict prediction markets Hyperliquid HIP-4", "cipher.gg Hyperliquid terminal prediction markets Predict tab") | Nothing about Cipher Predict; general HIP-4 background | L |

---

## 18. Privacy

Requests used the User-Agent `insurance-markets-research/0.1` only. No personal identifier was sent in any request, header, URL or search query. The builder-fills fixture has trader and counterparty addresses redacted. Fixtures and this note were grepped for the user's name, email handle and home-directory path: no hits.
