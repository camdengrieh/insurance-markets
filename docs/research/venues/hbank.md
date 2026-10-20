# HBANK / HBVNK (app.hbank.cash) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page and static-asset reads, `gh api` file reads, unauthenticated GETs against DefiLlama and the DefiLlama Hyperliquid indexer. No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool was used. Third-party text was treated as untrusted data. Public JS of the app was downloaded as text and searched with grep; it was never executed.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my own inference/computation; **L** = weak or stale.

Method limits: WebSearch budget was exhausted before my first query (one attempt, refused), so no web search was done. `defillama.com/protocol/hbank-outcome` returned HTTP 403 to WebFetch; the same data was read from `api.llama.fi`. The mobile app is on a waitlist and the web app is a JS single-page app, so I could not see which markets (if any) its `/predict` screen lists without running it (not done).

---

## 0. Bottom line

1. **HBANK is not a venue.** It is a wallet/front-end that attaches a Hyperliquid **builder code** to orders. DefiLlama files it as category "Interface", tag "Hyperliquid HIP4 Builder", with no own TVL (H). The "HBANK Outcome" line is a mechanically generated per-market listing of one builder address, not evidence of a dedicated prediction product (H, DefiLlama adapter comment: "these are the builder's other markets, reusing its addresses").
2. **Liquidity is 100% shared with Hyperliquid HIP-4 outcomes** (HyperCore order books). It is not an independent arbitrage leg. Cover Hyperliquid natively; see `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (sibling note, same date).
3. **Outcome activity through HBANK is negligible and dormant.** DefiLlama all-time HBANK-outcome volume = **$1,533** over 17 non-zero days, the last one 2026-07-14 ($894); 30-day volume = 0 (H). The builder address had **zero** outcome volume 2026-09-19..2026-10-18 and zero volume of any kind on 2026-10-17 and 2026-10-18 (H, indexer). Hyperliquid-wide outcome volume on 2026-10-18 was $3.13M (H), so HBANK's share is ~0.
4. **Brand history:** the company/product has moved from a Hedera DeFi app ("HBANK", GitHub org created 2026-02-22) to a Hyperliquid wallet branded **HBVNK**. `app.hbank.cash/home/holdings` now serves a page titled "Home | HBVNK", `www.hbank.cash` serves the HBVNK landing page, and DefiLlama still lists the old name and URL (H).
5. **adapter_priority = skip.** Nothing to integrate that the native Hyperliquid adapter does not already give; no API of its own.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `https://app.hbank.cash/home/holdings` returns HTTP 200, `<title>Home \| HBVNK</title>`; `https://app.hbvnk.com/` redirects to `/home/holdings`; `/predict` returns 200 with title "Predict \| HBVNK" (body is a JS shell, no market text server-side) | H |
| `https://www.hbvnk.com/` (also served at `www.hbank.cash`): "Confidential trading on Hyperliquid", "Join Waitlist", mobile app "will be able to download it soon"; footer (c) 2026 SMG LABS LLC; legal docs are HBVNK LLC, Terms v1.3.0 effective 2026-09-24 | H |
| DefiLlama protocol 8991 "HBANK Outcome": `listedAt` 1791497891 = 2026-10-08T22:18:11Z (computed), category Interface, chain "Hyperliquid L1", `tvl` empty (`https://api.llama.fi/protocol/hbank-outcome`) | H |
| Builder address activity (see section 9): perps $22.3k and spot $0.67k over 2026-09-19..2026-10-18, zero on the last two days | H |

Verdict: **still_live = true as a front-end; the outcome function is effectively unused** (no outcome volume since 2026-07-14, and none of HBVNK's Terms, Fee Schedule or Availability pages mention outcome/prediction markets).

---

## 2. Kind and market model

- **Kind:** broker-or-frontend (self-custodial wallet app; web app plus a waitlisted mobile app). Terms s.1: HBVNK "is not a bank, custodian, broker, exchange ... or the operator of the independent protocols"; s.6: "HBVNK provides an interface to Hyperliquid spot and perpetual markets. Orders and positions execute through Hyperliquid, not on an exchange operated by HBVNK." (H, https://www.hbvnk.com/legal/terms/)
- **Market model:** none of its own. Its `/predict` screen is a client for Hyperliquid HIP-4: the app bundle calls Hyperliquid `outcomeMeta` and `allMids`, builds instrument ids with source `hip4`, and computes order asset ids as `1e8 + 10*outcome + side`, which is the documented HIP-4 encoding (H, static JS of `https://app.hbvnk.com`; encoding confirmed by the Hyperliquid asset-ids doc per the sibling note). So the model is Hyperliquid's: binary Yes/No on a merged on-chain CLOB, multi-outcome "questions", fully collateralised, no leverage (H, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets).
- Also shipped in the same app (irrelevant to prediction markets): perps/spot via HyperLink, Liminal yield, MoonPay on-ramp, LayerZero/Hedera bridge paths (H, site, Terms, JS).

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading venue | HyperCore (Hyperliquid L1), reached at `https://api.hyperliquid.xyz` and `wss://api.hyperliquid.xyz/ws` (JS config `API_URL`/`WS_URL`) | H |
| Outcome collateral | USDC (Hyperliquid, per sibling note, H there) | M here |
| Funding path in the app | Arbitrum (`ARBITRUM_CHAIN_ID: 42161`, signature chain `0xa4b1`), HyperLink deposits/withdrawals, MoonPay fiat, LayerZero ovault paths | H (JS, fee page) |
| Legacy | Hedera HTS swaps/bridge (GitHub org profile, last pushed 2026-04-22, so about 6 months old: possibly stale) | L |

## 4. Read API

- **HBANK/HBVNK has no public or documented API.** NOT FOUND (searched: `www.hbvnk.com` links, `docs.hbvnk.com` -> Vercel `DEPLOYMENT_NOT_FOUND` 404, app JS routes, GitHub search for `hbvnk`/`hbank.cash` repos -> only the `HBANK-Org/.github` profile repo). The app's `/api/*` routes (balances, bridge, earn, referrals, incentives, prices, tokens, perps relay) are internal wallet back-end calls, undocumented; do not build on them.
- **Market data comes from Hyperliquid**, not HBANK: `outcomeMeta` (REST POST /info), WebSocket `l2Book`, `trades`, `allMids`, `outcomeMetaUpdates`, rate limits, shapes: see the sibling note sections 4 and 13 and its fixtures in `docs/research/fixtures/hyperliquid-hip-4-outcomes-native/`. I did not re-capture them (POST is out of scope; WS shapes already captured there).
- **HBANK-attributed activity (third-party, public GET, no auth):** `GET https://hl-indexer.llama.rip/v2/data/builder/0x0ca900e83d99a55206873fbf5b872453b032d970/daily/<YYYY-MM-DD>` returns `builderFees`, `builderPerpsFees`, `builderSpotFees`, `builderOutcomeFees`, `builderVolumeUsd`, `builderPerpsVolumeUsd`, `builderSpotVolumeUsd`, `builderOutcomeVolumeUsd`, `builderOutcomeNotionalVolumeUsd` (H; docs `https://hl-indexer.llama.rip/llms.txt`; fixtures below). Also `https://api.llama.fi/summary/dexs/hbank-outcome` and `.../fees/hbank-outcome`. Hyperliquid itself documents a per-builder fills archive `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{lowercase builder}/{YYYYMMDD}.csv.lz4` (H, builder-codes doc); it returned 403 for HBANK's address on the two dates I tried (file absent or not public; not pursued). None of this is order-book data and none is needed for arbitrage.
- **Builder address (public, from the app's JS config and DefiLlama adapter):** `0x0ca900e83d99a55206873fbf5b872453b032d970`; JS also has `REFERRAL_CODE:"HBANK"`, `DEFAULT_BUILDER_FEE:100`, `MIN_ORDER_VALUE_USD:10`, `MAX_REQUESTS_PER_SECOND:10` (H, fixture `hbvnk_app_js_config_excerpt.txt`).

## 5. Trade path

- **None specific to HBANK.** Orders are signed by the user's wallet inside the app (local wallet, or a Privy embedded wallet for email/Google/Apple sign-in per Terms s.3) and sent to Hyperliquid `/exchange`. For perps/spot the fee page says eligible orders are "routed through HyperLink" (a TEE-based prime broker with its own `POST /exchange` mirror per docs.hyperlink.xyz, M: small-model page summary); HyperLink docs do not mention HIP-4 (H via summary: "Not mentioned"). The web bundle I grepped contains no "hyperlink" string, so outcome orders from the web app appear to go direct to `api.hyperliquid.xyz` with the builder field (M, absence of evidence in static JS).
- **The only HBANK-related protocol feature** is Hyperliquid's builder code: user pre-approves a max fee with `approveBuilderFee` (main wallet, not agent), orders carry `builder:{b:<addr>,f:<tenths of bp>}`; caps 0.1% perps / 1% spot; builder needs >= 100 USDC perps account value and "standard" account mode; max 10 approvals per user; builder fees on outcomes accrue on **sell** orders only ("builders earn builder fees on sell orders") (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes and the HIP-4 page). An aggregator trading Hyperliquid directly has no reason to include HBANK's builder code.
- The JS also contains the Hyperliquid SDK `outcomeMeta` info call and `order` action with `grouping:"na"` (H, static JS), nothing exposed to third parties.

## 6. Reachability from a PayBox wallet

**paybox_reachable = no (for HBANK as a distinct venue).** There is no HBANK order endpoint, contract or API for a PayBox EVM wallet to call; the app is a closed-loop wallet UI and PayBox cannot drive it (browser automation is out of scope). The underlying Hyperliquid HIP-4 books are **partially** reachable (signed HyperCore actions via `request_wallet_sign` typed data/raw, funding via Arbitrum USDC; HyperCore is not an EVM transaction target): see sibling note section 6. Conclusion: route any Hyperliquid trading through the native Hyperliquid adapter, not through HBANK.

## 7. Fees

- **HBVNK builder fee (H, https://www.hbvnk.com/legal/fees/, Fee Schedule v2.2.0 effective 2026-09-24):** "Eligible orders routed through HyperLink include a 2 basis point (0.02%) HBVNK builder fee after wallet approval"; zero on spot buys. Indicative HyperLink/Hyperliquid protocol rates "as documented by HyperLink on 23 August 2026": perps 0.28 bps maker / 2.1 bps taker, spot 0.7 / 2.8 bps. HyperLink withdrawals 5 bps capped at 1 USDC, minimum 1 USDC. **The schedule does not mention outcome markets.**
- **Outcome-specific HBANK fee: NOT FOUND** (searched: Fee Schedule, Terms, Availability, app JS for outcome/predict/hip4 fee constants). The app JS has `DEFAULT_BUILDER_FEE:100` and a table `{perp:{makerBps:50,takerBps:100},spot:{makerBps:50,takerBps:100}}`; with Hyperliquid's unit of tenths of a basis point, 100 would mean 10 bps, which contradicts the 2 bps fee page, so treat the JS values as legacy or differently scaled (L/M).
- **Hyperliquid's own outcome fee** (charged on close/settle only; numeric rate not in official docs; empirical all-in about 12-15 bps incl. builder fees) is in the sibling note section 7 (M).
- **Who pays:** user pays builder fee on sell/close side; Hyperliquid fees per the sibling note.

## 8. Resolution mechanism and dispute risk

HBANK has no role in resolution (Terms s.1, s.6; DefiLlama methodology). Settlement is Hyperliquid's: protocol auto-settle for recurring series, validator-voted templates, or deployer-settled markets with no trader dispute window; details and risks in the sibling note section 8. Extra HBANK-specific risk: none beyond front-end availability (Terms s.14 lets HBVNK suspend interfaces; exit functions kept separate).

## 9. Geo, ToS, automation (H, primary text)

- HBVNK Availability v1.2.0 (2026-09-24, https://www.hbvnk.com/legal/availability/): "New or increased Perps exposure is restricted for users located in or ordinarily resident in the United States (US), United Kingdom (GB), Belgium (BE), and Ontario, Canada (CA-ON)"; VPN/false residence prohibited. It speaks of Perps only; it does not say whether outcome markets are restricted (NOT FOUND). Hyperliquid's own Terms (2026-06-15) bar US and Ontario residents and an unpublished "Excluded Persons" list for outcome markets (sibling note section 9, H there).
- HBVNK Terms s.12 (v1.3.0): no "abusive automation, ... or interference with others or the service". No bot or API clause because there is no API. Contact addresses exist on the site but are not recorded here.

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| HBANK-outcome volume, all-time | **$1,533** (17 non-zero days 2026-05-27..2026-07-14; peak $894 on 2026-07-14; notional at $1 face for that day $1,262) | `https://api.llama.fi/summary/dexs/hbank-outcome`, `https://hl-indexer.llama.rip/v2/data/builder/.../daily/2026-07-14`, fetched 2026-10-19 | H |
| HBANK-outcome 24h / 7d / 30d | 0 / 0 / 0 | same, 2026-10-19 | H |
| HBANK-outcome fees | none recorded (all zero); builder fee on 2026-07-14 outcome volume was $0.25 | `.../summary/fees/hbank-outcome`; indexer | H |
| HBANK builder, all markets, 2026-09-19..2026-10-18 | perps $22,253; spot $666; outcome $0 | summed by me from indexer daily rows | M (derived) |
| TVL | none (empty arrays) | `https://api.llama.fi/protocol/hbank-outcome` | H |
| Context: Hyperliquid HIP-4 outcome volume 2026-10-18 | $3,128,093 (notional at $1 face $8,490,310) | `https://hl-indexer.llama.rip/v2/data/volume/daily/2026-10-18` | H |

HBANK's attributed outcome volume is about 0.00005% of Hyperliquid's on a day like 2026-10-18 (computation; HBANK's was 0 that day).

## 11. Event categories and cross-venue overlap

Whatever Hyperliquid lists (crypto price ladders, sports, central-bank decisions, etc.; see sibling note section 11). HBANK adds no markets, no market creation and no categories of its own (NOT FOUND: any HBANK-specific market list).

## 12. Shared liquidity?

**Yes, 100%.** All fills go to Hyperliquid HyperCore HIP-4 books; the builder code only tags and fee-routes them. Never add HBANK volume to Hyperliquid's (double count). DefiLlama marks it `doublecounted: true` (H).

## 13. Adapter spec (if anything)

No adapter. Optional telemetry only: none worth building. If PayBox/XO ever trades Hyperliquid outcomes, do not attach HBANK's builder code (it would add a fee for a third party with no benefit).

## 14. Priority

**skip.** Dormant front-end of one builder code, no API, fully duplicate liquidity with Hyperliquid HIP-4 (which has its own spec), lifetime outcome volume about $1.5k.

## 15. NOT FOUND / open questions

- Which markets the `/predict` screen shows in production, and whether it is enabled for users (JS shell only; not executed).
- Whether the waitlisted mobile app supports outcome markets (landing page and Terms silent).
- Outcome-specific HBVNK builder fee (fee page covers perps/spot only; JS constants conflict with the 2 bps page).
- Whether HBVNK's geo controls apply to outcomes (Availability page covers Perps only).
- Whether HyperLink supports HIP-4 orders (docs summary: not mentioned).
- Why the builder address went silent after 2026-07-14 for outcomes (rebrand, product pause, or routing via HyperLink's own builder code, `hyperlink-spot` exists in DefiLlama): unknown.
- Official X/Twitter content (not fetchable); WebSearch unavailable this session.

## 16. Suspicious content

None found aimed at AI agents. The Hyperliquid GitBook pages begin with a line pointing to `llms.txt` (benign index hint); the `llms.txt` of the DefiLlama indexer is plain API documentation. The www.hbvnk.com page says "You can explore this page without JavaScript. Open HBVNK." (human-facing noscript text).

## 17. Sources

Primary (H):
- App shell: https://app.hbank.cash/home/holdings (title "Home | HBVNK"); https://app.hbvnk.com/home/holdings ; https://app.hbvnk.com/predict ; static JS chunks under https://app.hbvnk.com/_next/static/chunks/ (downloaded as text 2026-10-19)
- Marketing site: https://www.hbvnk.com/ (also served at https://www.hbank.cash/)
- Legal: https://www.hbvnk.com/legal/terms/ (v1.3.0, 2026-09-24); https://www.hbvnk.com/legal/fees/ (v2.2.0, 2026-09-24); https://www.hbvnk.com/legal/availability/ (v1.2.0, 2026-09-24)
- DefiLlama: https://api.llama.fi/protocol/hbank-outcome ; https://api.llama.fi/summary/dexs/hbank-outcome ; https://api.llama.fi/summary/fees/hbank-outcome ; https://api.llama.fi/protocol/hbank ; adapter `gh api repos/DefiLlama/dimension-adapters/contents/factory/hyperliquid.ts` (entries `hbank-perps` start 2026-04-14, `hbank-spot`, `hbank-outcome` start 2026-05-02)
- Indexer: https://hl-indexer.llama.rip/llms.txt ; https://hl-indexer.llama.rip/v2/data/builder/{addr}/daily/{date} ; https://hl-indexer.llama.rip/v2/data/volume/daily/2026-10-18
- Hyperliquid docs: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md ; https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes.md
- GitHub org `HBANK-Org` (created 2026-02-22; one repo `.github`, profile README pushed 2026-04-22: possibly stale, describes the old Hedera DeFi product)

Secondary (M/L):
- HyperLink docs summary (small-model page summary, not read raw): https://docs.hyperlink.xyz/
- Sibling research note (same day, other session): `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`

## 18. Fixtures (docs/research/fixtures/hbank/)

`defillama_hbank-outcome_protocol.json`, `defillama_hbank-outcome_dexs_nonzero.json`, `defillama_hbank-outcome_fees_summary.json`, `defillama_adapter_excerpt.ts.txt`, `hl-indexer_hbank_builder_daily_2026-07-14.json`, `hl-indexer_hbank_builder_daily_2026-10-18.json`, `hl-indexer_hyperliquid_volume_daily_2026-10-18_head.json`, `derived_hbank_builder_30d_volume.json` (derived by me), `hbvnk_legal_fees_v2.2.0.txt`, `hbvnk_legal_availability_v1.2.0.txt`, `hbvnk_terms_v1.3.0_section6.txt` (contact emails removed), `hbvnk_app_js_config_excerpt.txt`. All well under 50 KB. No HBANK-specific market-data response exists to capture.

## 19. Privacy

All scripted requests used User-Agent `insurance-markets-research/0.1`. Scripts were grepped for `@` and personal names before running; a path hit in my fixture script was removed and the script rewritten with relative paths before it was run. Fixtures were scanned (no email addresses, names or user wallet addresses; the only address recorded is HBANK's public builder address). No search query contained personal identifiers.
