# Valiant Trade (Outcomes tab) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (~04:20-04:45 UTC). READ-ONLY: public GETs of the site, its static JS bundles (read as text, never executed), docs markdown, DefiLlama public API, `gh api` file reads, WebSearch/WebFetch. No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool was used. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or inferred; **L** = weak/stale.

---

## 0. Bottom line

1. **Not a venue. It is a front-end ("builder") on Hyperliquid HIP-4.** Valiant's Outcomes tab lists whatever Hyperliquid's `outcomeMeta` returns, takes prices from Hyperliquid `allMids`, and submits ordinary Hyperliquid `order` actions with a builder-code fee attached. It has no books, listings, oracle or resolution of its own (H, bundle code below; DefiLlama tags it "Hyperliquid HIP4 Builder").
2. **Effectively dead and officially being sunset.** The site's own current bundle (page last-modified 2026-10-15) carries the notice: "Valiant Perps and Outcome markets will be sunset on September 30th. Please withdraw any funds. Valiant pools and spot markets are not impacted and will continue functioning." Year is not in the string, but the same bundle contains a campaign dated "Apr. 1 - Apr. 30, 2026" and was deployed 2026-10-15, so 30 Sept = 2026-09-30, already past (H string / M year inference). Independently, DefiLlama shows builder-attributed outcome volume of **$1,026 all-time**, last non-zero day **2026-07-26**, and **zero for every day since** (H).
3. **Not an independent arbitrage leg.** Any price or fill on Valiant is a price or fill on Hyperliquid HIP-4 (H). Adding it would double-count one book.
4. **adapter_priority = skip.** The only integration worth doing is the Hyperliquid HIP-4 adapter, which is covered in `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (P1 there). Optionally record Valiant's builder address as a known alias for attribution, nothing more.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `https://valiant.trade/perps/` returns HTTP 200, a Vite SPA shell titled "Valiant", `last-modified: Thu, 15 Oct 2026 22:16:13 GMT` (fixture `http_headers_valiant.trade_perps.txt`). The shell is not evidence the Outcomes product works. | H |
| Bundle `https://valiant.trade/assets/index-DiG92gwS.js` defines `VALIANT_SUNSET_MESSAGE` (quoted above) and a `ValiantSunsetBanner` component, rendered on at least the Affiliates and Campaign pages (fixture `valiant_bundle_excerpts.txt`). | H |
| Same bundle still ships the Outcomes UI code (`Outcomes-*.js`, `OutcomeMarket-*.js`) with feature flag `outcomes:["local","preview","production"]`. Whether the live UI actually disables trading after the sunset date: **NOT FOUND** (no browser automation allowed; the shell is client-rendered). | H (code) / NOT FOUND (runtime state) |
| DefiLlama `valiant-trade-outcome` (parent `valiant-trade`): `total24h`, `total7d`, `total30d` all 0; `totalAllTime` 1026; non-zero days only 2026-06-04..2026-07-26 (20 days, max $209/day); series ends 2026-10-18 with 0 (fixture `defillama_dexs_valiant-trade-outcome.json`, `https://api.llama.fi/summary/dexs/valiant-trade-outcome`). | H |
| DefiLlama fees for the same slug: 24h/7d/30d/all-time all 0 (fixture `defillama_fees_valiant-trade-outcome.json`). | H |
| DefiLlama listing created 2026-10-08 (`listedAt` 1791497961) with url `https://valiant.trade/perps/`, category "Interface", chain "Hyperliquid L1", description "Valiant Trade provides access to outcome-based prediction markets through Hyperliquid." The listing was added after volume had already stopped. | H |
| Official docs (`https://docs.valiant.trade/llms.txt`) have Perpetuals pages and Fogo spot/AMM pages but **no outcome/prediction-market page at all** (searched the whole index). | H |
| WebSearch (2 queries, standard + extended) found no news, X post or blog about Valiant outcomes or the sunset. WebFetch of `x.com/ValiantTrade` returned HTTP 402 Payment Required (recorded, not paid, stopped). | H (negative) |

Verdict: **still_live = false** (announced sunset date 2026-09-30 passed; zero volume since 2026-07-26; the shell page still loads). Confidence high on "not usable as a venue", medium on the exact runtime state of the UI.

Side note (L): a WebSearch snippet said a Fogo mainnet halt after a bad-actor transfer froze $268,095 at Valiant Trade. I read The Defiant article (`https://thedefiant.io/news/security/fogo-halts-mainnet-after-400-million-fogo-sent-to-bad-actor`): it is undated, mentions the halt ("no blocks since Saturday") and did not mention Valiant in the text I received. It concerns Fogo spot/pools, not Hyperliquid outcomes. Not relied on.

---

## 2. Kind and market model

- **Kind:** broker-or-frontend / builder-code interface for Hyperliquid HIP-4 outcome markets (H, below). Valiant's company description: "Institutional trading in your browser ... CEX speed. DEX freedom. Building the future of trading on Fogo." Core product is a Fogo spot DEX (Vortex CLMM pools), plus Hyperliquid-routed perps (docs `https://docs.valiant.trade/welcome-to-valiant.md`, DefiLlama parent).
- **Market model = Hyperliquid's** (H, same bundle code): coin `#<10*outcome+side>`, order asset id `100000000 + 10*outcome + side` (`OUTCOME_ASSET_ID_BASE=1e8`), integer share sizes (`OUTCOME_SZ_DECIMALS=0`), price up to 8 decimals. Binary Yes/No order book on HyperCore, collateralised, no leverage. Questions (categorical) come through `outcomeMeta.questions`. Full model, merged-book rule and `outcomeMeta`/`description` parsing are in the Hyperliquid note.
- **Valiant adds no markets.** `useOutcomeMarkets` = `outcomeMeta` (poll 60 s) + `allMids`; `buildMarket` maps `sideSpecs` to prices and reads `probability = sides[0].price`. The Outcomes chunk has country-flag handling and a "World Cup / Sports" icon, i.e. the UI was themed around the FIFA World Cup 2026 markets that Hyperliquid listed (M).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Where trades settle | HyperCore (Hyperliquid L1). `HL_CONFIG.mainnet` = `https://api.hyperliquid.xyz` + `wss://api.hyperliquid.xyz/ws`; signing chain id 1337 | H |
| Collateral / quote | USDC on HyperCore (Hyperliquid outcomes; see sibling note) | M |
| User identity on Valiant | Fogo Sessions with any SVM wallet; Valiant then creates **Privy embedded wallets** (an Arbitrum address for bridging and a Hyperliquid trading address). Private keys are "not exposed by design". | H (`https://docs.valiant.trade/perpetuals/references/faqs.md`) |
| Deposit chains offered | Fogo, Solana, Ethereum, BNB Chain, Arbitrum (USDC, USDT via LayerSwap; native HL bridge for Arbitrum USDC). $1 one-time HL account-creation fee on first deposit | H (same FAQ) |
| Withdraw | HL $1 flat withdrawal fee; LayerSwap fee "usually under $1" for non-Arbitrum routes | H (`.../withdrawing-funds.md`) |

---

## 4. Read API

- **Valiant: no public read API for outcomes. NOT FOUND** (searched: docs index, FAQs, terms, bundle). The ToU only says "If you use any Valiant APIs or SDKs, you must comply with posted documentation and rate limits" and there is no posted API documentation (H, `https://docs.valiant.trade/legal/terms-of-use.md`).
- **Private/undocumented hosts seen in the bundle (do not use):** `https://mainnet-api.valiant.trade` (REST root returned 404 on GET), `wss://mainnet-api.valiant.trade/ws`, `wss://browser-api.valiant.trade/market-api/ws`. These serve Valiant's Fogo pools/market-data and are called with client tokens/keys embedded in the public JS. I did not copy or use those credentials (see section 12).
- **What an aggregator should read instead:** Hyperliquid directly (`wss://api.hyperliquid.xyz/ws`, `POST https://api.hyperliquid.xyz/info` `{"type":"outcomeMeta"}`, keyless, documented rate limits). Valiant's own UI does exactly this (`getOutcomeMeta` posts `{type:"outcomeMeta"}`; `allMids` for prices). See the Hyperliquid note section 4.
- **Fixtures captured (public GETs):** `docs/research/fixtures/valiant-trade/defillama_dexs_valiant-trade-outcome.json`, `defillama_fees_valiant-trade-outcome.json`, `docs_valiant_llms.txt`, `docs_valiant_perps_fees.md`, `http_headers_valiant.trade_perps.txt`, `valiant_bundle_excerpts.txt` (sunset string, builder constants, endpoints). No outcome book/market fixture exists because Valiant has no such API and Hyperliquid's REST is POST-only (forbidden here).

---

## 5. Trade path

- **Valiant:** the UI signs nothing itself for orders. Flow (H, bundle): user's Privy-embedded EVM wallet signs `approveAgent` (agent wallet) and `ApproveBuilderFee` (EIP-712 types in bundle, `maxFeeRate "0.05%"`); orders are then sent as Hyperliquid `order` actions via `placeOrder(signer, orders, grouping, vaultAddress, {b: BUILDER_ADDRESS, f: 38})`; code throws "Builder fee not approved. Please approve builder fees before placing orders." if approval is missing. Outcome orders use the shared `use-place-order` hook (the Outcomes chunk imports it).
- **No Valiant order API for third parties.** Programmatic trading means calling Hyperliquid's `/exchange` directly with your own signed actions; Valiant is not needed and adds a 3.8 bps fee.
- **Builder address (public, from bundle and DefiLlama adapter):** `0x751d254c07f7a4b454eb5c2a23ebe3adf1a4eaec` (H: `gh api repos/DefiLlama/dimension-adapters/contents/factory/hyperliquid.ts`, entry `"valiant-perps"`; `"valiant-outcome": { builder: "valiant-perps", market: "outcome", start: "2026-05-02" }`). Useful only to recognise Valiant-routed fills in HL builder-fill dumps.

---

## 6. Reachable from a PayBox EVM wallet?

**no** for Valiant itself. There is nothing to propose or sign against Valiant for outcomes: no contract, no order API, and the Outcomes product is sunset. The real route is Hyperliquid HIP-4, where a PayBox EVM wallet could only sign typed-data/raw digests for HyperCore actions (not EVM transaction proposals); that is "partial" and analysed in `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` section 6. I made no PayBox calls for this venue.

---

## 7. Fees

- **Valiant builder fee: 3.8 bps** (`BUILDER_FEE=38` in tenths of a bp; approval cap `0.05%` = 5 bps) (H, bundle). Valiant docs: "Valiant charges a fee of 3.8 basis points (0.038%) on perp trades"; the fee page covers perps only and **says nothing about outcome markets** (H, `https://docs.valiant.trade/perpetuals/references/fees.md`; note the page's own worked example computes 0.03888%, an internal inconsistency).
- **Who pays / when:** per Hyperliquid's HIP-4 page, builder codes on outcomes "work the same as normal spot trading, where builders earn builder fees on sell orders that specify their builder code" (H, `https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets`). Builder fee caps are 0.1% perps / 1% spot (H, `.../trading/builder-codes`); the cap for outcome orders is not stated (NOT FOUND).
- **Hyperliquid base fee:** "Outcome trading only charges fees when closing or settling, not when opening ... does not support rebates" (H, `https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees`). The HIP-4 page's "Fees are currently zero" is stale; the numeric rate is in the Hyperliquid note (about 11-25 bps all-in, M).
- **Withdraw:** $1 HL fee plus LayerSwap fee on cross-chain routes (H).

---

## 8. Resolution and dispute risk

Identical to Hyperliquid HIP-4 because Valiant lists HL markets verbatim: protocol-recurring, validator-set and deployer-settled markets, with deployer-settled markets having no trader dispute window (see Hyperliquid note section 8, M here). Valiant has no resolution role; the ToU says it "does not broker trades, execute orders as agent, or custody assets" and that "the presence of any ... market ... does not imply endorsement, vetting" (H, ToU section 3).

---

## 9. Geo, ToS, automation

- Valiant ToU "Last Updated: 14 Oct 2025" (H), i.e. **predates HIP-4 (2026-05-02) and has no outcome/prediction-market clause**: searched the full text for "outcome", "prediction", "Hyperliquid" - no hits.
- Restricted territories (ToU 2.3): "the United States or its territories, Cuba, Iran, North Korea, Syria, the Crimea, Donetsk, or Luhansk regions, or any jurisdiction subject to comprehensive sanctions", with possible "geo-blocking, wallet/IP screening" (H). Hyperliquid's own Terms (2026-06-15) additionally exclude certain persons from outcome markets (sibling note, H there).
- Automation: no bot/scraping clause in Valiant ToU; API clause as above. NOT FOUND otherwise. Hyperliquid's terms govern the underlying trading.

---

## 10. Liquidity (dated)

| Metric | Value | Source | Tag |
|---|---|---|---|
| Valiant outcome builder-attributed volume, all time | $1,026 (20 non-zero days 2026-06-04..2026-07-26, max $209/day) | `https://api.llama.fi/summary/dexs/valiant-trade-outcome`, read 2026-10-19 | H |
| Valiant outcome 24h / 7d / 30d volume (to 2026-10-18) | 0 / 0 / 0 | same | H |
| Hyperliquid outcomes volume for scale | $3,128,093 on 2026-10-18; $17,900,930 7d; $261,084,367 all-time | `https://api.llama.fi/summary/dexs/hyperliquid-outcomes`, read 2026-10-19 | H |
| Valiant share of HL outcome volume | about 0.0004% all-time (1,026 / 261,084,367, my arithmetic) | derived | M |
| Valiant TVL / OI for outcomes | none (no custody; collateral sits in each user's HyperCore account) | n/a | M |

For context, Valiant (Fogo spot, parent) showed 24h volume $10,557 and 30d $476,462 on DefiLlama - irrelevant to outcomes (H, `https://api.llama.fi/summary/dexs/valiant-trade`).

---

## 11. Event categories and overlap

Whatever Hyperliquid lists: crypto price binaries/buckets, policy-rate decisions, sports (World Cup, NFL), awards, company/AI (sibling note; not re-verified here). Overlap with Polymarket/Kalshi exists for crypto price, central-bank decisions and sports, but **those overlaps are exploited through the Hyperliquid adapter, not through Valiant.**

---

## 12. Shared liquidity

**100% shared with Hyperliquid HIP-4 (H).** Valiant is a builder-code front-end: reads HL `outcomeMeta`/`allMids`, writes HL `order` actions. It must not be treated as a separate leg. Other builders routing the same books include Outcome.xyz, TrueNorth and similar (DefiLlama factory entries `*-outcome`; M).

---

## 13. Adapter spec (what to do with this)

- Do **not** build a `valiant-trade` adapter. Register it in the platform registry as `aliasOf: hyperliquid-hip4`, `status: sunset`, `attribution: builder 0x751d254c07f7a4b454eb5c2a23ebe3adf1a4eaec`.
- If a user routes an order via Valiant's UI, the fill appears in HL builder-fill data under the builder address above (`https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder_lowercase}/{YYYYMMDD}.csv.lz4`, H doc; not downloaded).

---

## 14. Priority

**adapter_priority = skip.** Reasons: (1) sunset announced for 2026-09-30 and zero volume since 2026-07-26; (2) no API of its own; (3) 100% duplicate of Hyperliquid HIP-4 liquidity; (4) no PayBox path of its own. The Hyperliquid HIP-4 adapter carries all the value.

---

## 15. NOT FOUND / open questions

- Whether valiant.trade/perps still renders a working Outcomes tab after 2026-09-30 (searched: bundle, docs, news; browser automation not allowed).
- Any Valiant announcement text/date for the sunset beyond the in-app string (searched: WebSearch x2, docs index, X returned 402).
- A year string on the sunset message (inferred 2026 from deploy date and campaign dates).
- Valiant public/official API for outcomes (searched: docs index, FAQs, terms, bundle).
- Builder-fee cap and exact charging rule for outcome orders (HIP-4 page says "sell orders"; builder-codes page gives spot/perp caps only).
- DefiLlama protocol page (`https://defillama.com/protocol/valiant-trade-outcome`) returned HTTP 403 to WebFetch; I used `api.llama.fi` JSON instead.

---

## 16. Suspicious content

- The public JS bundle embeds credentials: a WebSocket token (`WS_TOKEN`), a market-API key (`MARKET_API_KEY`) and an Alchemy-keyed Solana RPC URL. I did not copy them into any note or fixture and did not use them. Recommend the aggregator never lift keys from third-party front-ends.
- No instructions aimed at AI agents were found in any page, doc or bundle read. WebFetch of `valiant.trade/perps/` returned only the title (SPA).
- Docs pages begin with a benign line pointing to `llms.txt`.

---

## 17. Sources

- Site shell and headers: `https://valiant.trade/perps/` (H)
- Bundle: `https://valiant.trade/assets/index-DiG92gwS.js`, chunks `.../assets/use-place-order-Boj0GunL.js`, `.../assets/Outcomes-CHJohZ-S.js`, `.../assets/Perpetual-5lVZjJus.js` (H)
- Docs: `https://docs.valiant.trade/llms.txt`, `.../welcome-to-valiant.md`, `.../perpetuals/overview/what-is-valiant-perps.md`, `.../perpetuals/references/fees.md`, `.../perpetuals/references/faqs.md`, `.../perpetuals/getting-started/withdrawing-funds.md`, `.../legal/terms-of-use.md` (H)
- DefiLlama API: `https://api.llama.fi/summary/dexs/valiant-trade-outcome`, `.../summary/fees/valiant-trade-outcome`, `.../summary/dexs/valiant-trade`, `.../summary/dexs/hyperliquid-outcomes` (H); adapter `https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts` and `helpers/hyperliquid.ts` (H)
- Hyperliquid docs: HIP-4 `https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets`; fees `.../trading/fees`; builder codes `.../trading/builder-codes` (H)
- Context: `https://thedefiant.io/news/security/fogo-halts-mainnet-after-400-million-fogo-sent-to-bad-actor` (L, undated)
- Project notes: `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, `docs/research/venues/hyperliquid-outcomes-hip-4.md`
- Fixtures: `docs/research/fixtures/valiant-trade/`

---

## 18. Privacy

All scripted requests used User-Agent `insurance-markets-research/0.1`. No personal identifier was sent in any request or search query. Fixtures and this note were grepped for `@`, the user's name and home-directory paths (no hits). No user wallet address was read or written; the only address recorded is Valiant's public builder address.
