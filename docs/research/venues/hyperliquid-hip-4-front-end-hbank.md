# Hyperliquid HIP-4 front-end: HBANK / HBVNK - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads and unauthenticated GETs only (DefiLlama API, DefiLlama Hyperliquid indexer, Hyperliquid GitBook docs, HBVNK pages). No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool. Third-party text treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or inferred; **L** = weak or stale.

Method limits: the WebSearch budget was exhausted (searches refused), so no web search was done. `defillama.com/protocol/hbank-outcome` returns 403 to WebFetch; the same record was read from `api.llama.fi`. `app.hbank.cash` is a JS single-page app, so the markets its `/predict` screen shows (if any) could not be seen without executing it (not done). A sibling note on the same venue from another session exists (`docs/research/venues/hbank.md`, written the same day); I re-verified its key numbers first-hand below and reuse its static-JS findings as M.

---

## 0. Bottom line

1. **HBANK is not a venue. It is a front-end that attaches a Hyperliquid builder code.** DefiLlama: category "Interface", tag "Hyperliquid HIP4 Builder", chain "Hyperliquid L1", description "HBANK provides access to outcome-based prediction markets through Hyperliquid", empty TVL (H, https://api.llama.fi/protocol/hbank-outcome).
2. **Liquidity is 100% shared with Hyperliquid HIP-4 outcome books** (HyperCore). Not an independent arbitrage leg. DefiLlama marks the line `doublecounted: true` (H). Cover Hyperliquid natively (`docs/research/venues/hyperliquid-hip-4-outcomes-native.md`).
3. **Outcome activity through HBANK is dormant.** All-time attributed outcome volume $1,533 over 17 non-zero days, last non-zero day 2026-07-14 ($894); 24h/7d/30d all 0 (H). On 2026-10-18 the HBANK builder address had zero volume of any kind while Hyperliquid-wide outcome volume was $3.13M (H).
4. **Rebrand:** `app.hbank.cash/home/holdings` now serves `<title>Home | HBVNK</title>`; DefiLlama still carries the old name/URL (H).
5. **No API, no trade path, no PayBox route of its own.** adapter_priority = **skip**.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `https://app.hbank.cash/home/holdings` HTTP 200, `<title>Home \| HBVNK</title>`, Next.js app (fetched 2026-10-19) | H |
| `https://app.hbvnk.com/predict` HTTP 200, `<title>Predict \| HBVNK</title>` (JS shell; no market text server-side) | H |
| `https://hbank.cash` 307 -> `https://www.hbank.cash/` (Vercel) | H |
| DefiLlama protocol id 8991 "HBANK Outcome", `listedAt` 1791497891 (= 2026-10-08, computed), parent "hbank", siblings HBANK Perps / HBANK Spot | H |
| Builder-address volume: perps/spot small but non-zero in the last 30 days; zero on 2026-10-18 | H (indexer) |

Verdict: **still_live = true as a front-end; the outcome function is effectively unused** (no outcome volume since 2026-07-14).

## 2. Kind and market model

- **Kind:** broker-or-frontend (self-custodial wallet app, web plus waitlisted mobile). No own market model, no market creation.
- **Market model = Hyperliquid's:** fully collateralised outcomes, two tokens per outcome (`sideSpecs`, usually Yes/No) that settle to `settleFraction` / `1 - settleFraction` of the quote token; "Questions" group outcomes where exactly one settles Yes; each outcome has its own order book (H, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md). Order book (CLOB) on HyperCore. Details in the native sibling note.
- The app bundle reportedly calls `outcomeMeta`/`allMids` and encodes outcome asset ids as `1e8 + 10*outcome + side` (M: from the sibling note's reading of static JS; I did not re-download the bundle).

## 3. Chains and collateral

- Trading venue: HyperCore (Hyperliquid L1), not an EVM contract. Collateral USDC (M here; H in the native note).
- Funding into the app: Arbitrum / HyperLink / MoonPay / LayerZero paths (M, sibling note from JS and fee page). Legacy Hedera product (L, old GitHub org profile).

## 4. Read API

- **HBANK/HBVNK: none official.** NOT FOUND (searched: hbvnk.com and hbank.cash pages, docs subdomain per sibling note -> 404, DefiLlama record). The app's `/api/*` routes are internal; do not build on them.
- **Market data comes from Hyperliquid** (`https://api.hyperliquid.xyz`, `POST /info` incl. `outcomeMeta`; `wss://api.hyperliquid.xyz/ws` with `l2Book`, `bbo`, `trades`, `allMids`, `outcomeMetaUpdates`): documented in the native sibling note with captured WS fixtures. I did not call `POST /info` (POST out of scope).
- **HBANK-attributed activity (third party, unauthenticated GET, H):**
  - `GET https://api.llama.fi/protocol/hbank-outcome` (fixture `defillama_hbank-outcome_protocol.json`)
  - `GET https://api.llama.fi/summary/dexs/hbank-outcome` (trimmed fixture `defillama_hbank-outcome_dexs_trimmed.json`)
  - `GET https://hl-indexer.llama.rip/v2/data/builder/0x0ca900e83d99a55206873fbf5b872453b032d970/daily/YYYY-MM-DD` returns `builderOutcomeVolumeUsd`, `builderOutcomeNotionalVolumeUsd`, `builderOutcomeFees`, etc. (fixtures `hl-indexer_builder_daily_2026-07-14.json`, `..._2026-10-18.json`). Builder address is public (from DefiLlama adapter / sibling note, M).
  - Context: `GET https://hl-indexer.llama.rip/v2/data/volume/daily/2026-10-18` (trimmed fixture).
  - Auth: none. Rate limits: NOT FOUND (undocumented). This is attribution analytics, not order-book data; useless for arbitrage.

## 5. Trade path

- **None specific to HBANK.** Orders are signed by the user's wallet in the app and sent to Hyperliquid `/exchange`. The only protocol-level HBANK feature is the builder code: the user pre-approves a max fee via `ApproveBuilderFee`, signed by the main wallet (not an agent wallet); builder needs >= 100 USDC perps account value and standard account mode; fee caps 0.1% perps, 1% spot; builder codes "apply to ... sell orders" for outcomes (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes.md and the HIP-4 page line 25: "builders earn builder fees on sell orders that specify their builder code").
- An aggregator should trade on Hyperliquid directly (EIP-712 signed actions) and gains nothing from HBANK's builder code (it only adds a third-party fee).

## 6. Reachability from a PayBox wallet

**paybox_reachable = no** for HBANK as a distinct venue: no order endpoint, contract or API to call; the app is a closed-loop wallet UI (browser automation out of scope). The underlying Hyperliquid books are only **partially** reachable (HyperCore takes signed actions rather than EVM transaction proposals; USDC funding via Arbitrum) - see the native note section 6.

## 7. Fees

- HBVNK fee schedule v2.2.0 (effective 2026-09-24): "Eligible orders routed through HyperLink include a 2 basis point (0.02%) HBVNK builder fee after wallet approval"; zero on spot buys; separate from protocol fees (H, https://www.hbvnk.com/legal/fees/, re-read 2026-10-19). The schedule covers perps/spot and **does not mention outcome markets**.
- Outcome-specific HBANK builder fee: NOT FOUND (searched: fee page, availability page, DefiLlama fees series which is all zero). Real example: on 2026-07-14, $894 of outcome volume produced $0.25 of builder fees (H, fixture), about 2.8 bps of volume (computed, M).
- Hyperliquid's own outcome fee (charged on close/settle only; no numeric rate in official docs; empirical all-in ~12-15 bps) is in the native note (M).
- Who pays: the seller/closer (builder fee on sell orders); opening buys carry no builder fee.

## 8. Resolution mechanism and dispute risk

HBANK has no role in resolution. Settlement is Hyperliquid's: auto-settle for recurring series (e.g. daily BTC mark at 06:00 UTC), validator-voted templates, or deployer-settled markets with no trader dispute window (native note section 8: ~98% of open markets deployer-settled, M). Extra HBANK risk: front-end availability only.

## 9. Geo, ToS, automation

- HBVNK Feature Availability v1.2.0 (2026-09-24): "New or increased Perps exposure is restricted for users located in or ordinarily resident in the United States (US), United Kingdom (GB), Belgium (BE), and Ontario, Canada (CA-ON)"; VPN/false residence prohibited. Says nothing about outcome markets (H, https://www.hbvnk.com/legal/availability/).
- Hyperliquid's own Terms (2026-06-15) bar US and Ontario residents and an unpublished "Excluded Persons" list for outcome markets (M here via sibling note; H there).
- HBVNK has no API and no bot clause that matters; automation of Hyperliquid is via its own API.

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| HBANK-outcome volume all-time | **$1,533** (17 non-zero days; last 2026-07-14 = $894, notional at $1 face $1,262) | https://api.llama.fi/summary/dexs/hbank-outcome and indexer, fetched 2026-10-19 | H |
| 24h / 7d / 30d | 0 / 0 / 0 | same | H |
| TVL | none | https://api.llama.fi/protocol/hbank-outcome | H |
| Context: Hyperliquid outcome volume 2026-10-18 | $3,128,093 (notional at $1 face $8,490,310) | https://hl-indexer.llama.rip/v2/data/volume/daily/2026-10-18 | H |

## 11. Event categories and overlap

Whatever Hyperliquid lists (crypto price ladders, sports, central-bank decisions, etc.; native note section 11). HBANK adds no markets or categories (NOT FOUND: any HBANK-specific market list; the `/predict` screen could not be read without running JS).

## 12. Shared liquidity?

**Yes, 100%** with Hyperliquid HIP-4 books. Never add HBANK-attributed volume to Hyperliquid's (double count). Not an independent arbitrage leg.

## 13. Adapter spec

No adapter. Use the native Hyperliquid adapter. Optional telemetry only (poll the builder daily endpoint) - not worth building.

## 14. Priority

**skip.** Dormant front-end of one builder code, no API, duplicate liquidity, lifetime outcome volume about $1.5k.

## 15. NOT FOUND / open questions

- Which markets the `/predict` screen lists in production (JS shell; not executed).
- Outcome-specific HBVNK builder fee; whether HBVNK geo controls apply to outcomes.
- Whether the mobile app supports outcomes.
- Why outcome volume stopped after 2026-07-14.
- Official X/Twitter and web search results (search budget exhausted).

## 16. Suspicious content

None aimed at AI agents found in the pages read this session. (Hyperliquid GitBook pages are plain docs.)

## 17. Sources

- https://defillama.com/protocol/hbank-outcome (403 to fetch; evidence page named in the task)
- https://api.llama.fi/protocol/hbank-outcome ; https://api.llama.fi/summary/dexs/hbank-outcome (H)
- https://hl-indexer.llama.rip/v2/data/builder/0x0ca900e83d99a55206873fbf5b872453b032d970/daily/2026-07-14 and /2026-10-18 ; https://hl-indexer.llama.rip/v2/data/volume/daily/2026-10-18 (H)
- https://app.hbank.cash/home/holdings ; https://app.hbvnk.com/predict ; https://www.hbvnk.com/legal/fees/ ; https://www.hbvnk.com/legal/availability/ (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes.md ; https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md (H)
- Sibling notes (M): `docs/research/venues/hbank.md`, `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`

## 18. Fixtures (docs/research/fixtures/hyperliquid-hip-4-front-end-hbank/)

`defillama_hbank-outcome_protocol.json`, `defillama_hbank-outcome_dexs_trimmed.json`, `hl-indexer_builder_daily_2026-07-14.json`, `hl-indexer_builder_daily_2026-10-18.json`, `hl-indexer_hyperliquid_volume_daily_2026-10-18_trimmed.json`. All under 2 KB.

## 19. Privacy

All requests used User-Agent `insurance-markets-research/0.1`; no personal identifiers in any request; fixtures scanned for `@` and personal names (none).
