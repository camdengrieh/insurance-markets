# Hyperliquid HIP-4 front-end: Bloxwap - venue spec (registry-slug summary)

Researched 2026-10-19. READ-ONLY: unauthenticated GETs (bloxwap.com, bloxwap.app, api.llama.fi) with generic User-Agent `insurance-markets-research/0.1`, plus reuse of same-day first-hand research in `docs/research/venues/bloxwap.md` (the full Bloxwap spec; this file is the registry-slug summary and re-verifies the key numbers). No account, wallet, key, signature, POST or payment. WebSearch budget was exhausted this session, so no new searches were run. Third-party text treated as untrusted data.

Tags: H = read first-hand in a primary source this session (URL cited); M = secondary/inferred; L = weak/stale.

## 0. Bottom line

- Bloxwap is a live mobile/web front-end for **Hyperliquid perps and HIP-3 perps**. It is not a prediction-market venue and has no market model, books or settlement of its own (H: https://bloxwap.com home lists only crypto, stocks, commodities, indices; no mention of outcome/prediction/HIP-4).
- The DefiLlama entry "Bloxwap Outcome" (id 8965, category Interface, tag "Hyperliquid HIP4 Builder", listed 2026-10) is a per-market split of Bloxwap's Hyperliquid builder-code volume (H: https://api.llama.fi/protocol/bloxwap-outcome).
- Measured outcome volume is negligible: **$220.80 all-time, 5 non-zero days (last 2026-07-24), $0 in 24h/7d/30d** (H: https://api.llama.fi/summary/dexs/bloxwap-outcome, fetched 2026-10-19). Hyperliquid HIP-4 in total: 24h $3.13M, 7d $17.9M, 30d $47.0M, all-time $261.1M (H: https://api.llama.fi/summary/dexs/hyperliquid-outcomes, 2026-10-19).
- **Not an independent arbitrage leg**: any Bloxwap outcome order is an order on the Hyperliquid HIP-4 order book. Integrate Hyperliquid HIP-4 directly (see `hyperliquid-hip-4-outcome-markets.md`); register `bloxwap` as a frontend alias of that venue.
- adapter_priority = **skip**.

## 1. Still live (2026)?

- `bloxwap.com` fetched OK 2026-10-19 (app in early access/waitlist per page) (H). `https://bloxwap.app/api/v1/assets` returned HTTP 200 with `count: 79` on 2026-10-19 (H). Terms effective 2026-10-16, fees page "as of October 13, 2026" (H per `bloxwap.md`).
- Live as a perps front-end; dormant as an outcome front-end (last outcome volume 2026-07-24).

## 2. Kind and market model

- Kind: broker-or-frontend (non-custodial UI over Hyperliquid) (H: bloxwap.app/llms.txt via `bloxwap.md`).
- Own markets: 79 listed, categories `perp` and `hip3` only; no outcome/prediction category (H: fixture `bloxwap_api_v1_assets.json`, live GET 2026-10-19).
- Outcome market docs/product: NOT FOUND (searched: bloxwap.com home, /docs/terms, llms.txt, llms-full.txt, OpenAPI, /docs/fees, /docs/faq, GitHub org `bloxwap` code search; details in `bloxwap.md`).
- Latent capability (M, client bundle read as text in `bloxwap.md`): app code decodes Hyperliquid outcome coins (`enc = 10*outcome + side`) and understands only crypto price-threshold outcomes ("{asset} above {target}"). Unlisted, undocumented.
- Underlying HIP-4 model (M, from sibling notes; not re-verified here): binary Yes/No fully collateralised outcome tokens on the HyperCore CLOB; price 0..1.

## 3. Chains and collateral

- Hyperliquid L1 (HyperCore); collateral USDC (M, sibling note). Wallet: Privy embedded or external wallet plus Hyperliquid agent key (H per `bloxwap.md`, Terms s.1). Fund-in via Solana/on-ramps through third-party routers (guide titles only). `$BLOXWAP` is a Solana pump.fun SPL token `2u3ufZ5defxwPXMixvvQpSs68PDNzHTdE52t9Crspump` used for fee discounts, not collateral (H: DefiLlama protocol JSON, fixture-free field `address`).

## 4. Read API

- Bloxwap's own API is public/unauthenticated but contains **no market data**: `GET https://bloxwap.app/api/v1/assets` returns `{"assets":[{symbol,name,category}],"count":79}` (H, fixture `bloxwap_api_v1_assets.json`). Other endpoints (`/price/bloxwap`, `/tournament`, `/relay/fee-config`, `/treasury`, signals) are app-support only; OpenAPI at https://bloxwap.app/openapi.json; limit 600 req/min (H per `bloxwap.md`). Live prices explicitly out of scope: "they belong to Hyperliquid's own info API" (H per `bloxwap.md`).
- Websocket: none from Bloxwap.
- Outcome data: use Hyperliquid directly (`POST https://api.hyperliquid.xyz/info`, `wss://api.hyperliquid.xyz/ws`; outcome metadata/books) (M, sibling note).
- Builder-attributed volume (third party): `https://api.llama.fi/summary/dexs/bloxwap-outcome` (H, fixture `defillama_summary_dexs_bloxwap-outcome.json`, shape: `name,total24h,total7d,total30d,totalAllTime,totalDataChart[[unix_ts,usd]]`).

## 5. Trade path

- None via Bloxwap: "There is deliberately no trading API ... To trade programmatically, talk to Hyperliquid directly." (H, bloxwap.app/llms-full.txt per `bloxwap.md`). Signing happens in the client with a Hyperliquid agent key and attaches builder code (default 5 bps).

## 6. PayBox reachability

- **no** (as a distinct venue). No order surface; PayBox cannot drive the app. An EVM PayBox wallet could at most sign Hyperliquid typed-data actions and trade HIP-4 directly on Hyperliquid, bypassing Bloxwap (that is the Hyperliquid adapter's question, M, see sibling note).

## 7. Fees

- Bloxwap builder fee 0.05% per fill (0.025% Genesis), on top of Hyperliquid fees; fee page describes perps only (H per `bloxwap.md`, https://bloxwap.com/docs/fees). Outcome-specific fee: NOT FOUND. Hyperliquid HIP-4 page said outcome fees zero for initial testing (H per `bloxwap.md`, possibly stale).

## 8. Resolution

- Bloxwap does not create or resolve markets. Resolution is Hyperliquid HIP-4's (recurring BTC binary settles daily 06:00 UTC to HyperCore mark price per HIP-4 page, H per `bloxwap.md`). Bloxwap Terms: Delaware law, AAA arbitration, liability cap USD 100 (H per `bloxwap.md`).

## 9. Geo / ToS / automation

- Terms (effective 2026-10-16) bar US, UK, EU, Singapore, Japan, Australia, Brazil, South Korea, sanctioned regions; VPN bypass prohibited. Algorithmic trading through Hyperliquid allowed; scraping barred except documented public APIs (H per `bloxwap.md`, https://bloxwap.com/docs/terms).

## 10. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Bloxwap outcome volume | all-time $220.80; 24h/7d/30d $0; non-zero days 2026-05-04 $62, 05-05 $62, 05-06 $21, 07-23 $74, 07-24 $1.80 | api.llama.fi dexs/bloxwap-outcome, 2026-10-19 | H |
| Hyperliquid HIP-4 total | 24h $3.13M, 7d $17.9M, 30d $47.0M, all-time $261.1M | api.llama.fi dexs/hyperliquid-outcomes, 2026-10-19 | H |
| TVL | none (interface) | DefiLlama | H |

## 11. Event coverage and overlap

- Only crypto price-threshold outcomes are understood by the app (M); those overlap Polymarket/Kalshi/Limitless crypto-price markets, but the book is Hyperliquid's own. No sports/politics/macro.

## 12. Shared liquidity

- **Fully shared with Hyperliquid HIP-4** (same CLOB, same settlement). Never count as a separate arbitrage leg or add depth to aggregate books. Alias `bloxwap` -> `hyperliquid-hip4` for attribution.

## 13. Priority: skip

No outcome product documented, no data or trading API, $220.80 lifetime volume, duplicate liquidity, geo-blocked for US/UK/EU. Cheap re-check: `https://api.llama.fi/summary/dexs/bloxwap-outcome`.

## 14. NOT FOUND

- Any Bloxwap documentation of outcome/prediction/HIP-4 markets (searched: bloxwap.com home, terms, llms.txt, llms-full.txt, OpenAPI, GitHub org).
- Outcome-specific fee schedule; Bloxwap-side outcome market list or book endpoint.
- defillama.com/protocol/bloxwap-outcome page (not fetched; API used instead).
- New web search results this run (search budget exhausted).

## 15. Open questions

1. Does any Bloxwap UI surface expose HIP-4 outcomes (deep link)? Not checked (no browser automation).
2. Source of the five non-zero 2026 outcome days (likely testing, M).

## 16. Suspicious content

- None found in pages read this run (bloxwap.com home, DefiLlama JSON, assets JSON). Prior note records benign AI-crawler-friendly language in robots.txt/llms.txt/OpenAPI; not followed.

## Sources

- https://bloxwap.com (WebFetch summary, H)
- https://bloxwap.com/docs/terms (grep for "outcome"/"prediction": only the "outcome" in a warranty disclaimer, H)
- https://bloxwap.app/api/v1/assets (H, live 2026-10-19)
- https://api.llama.fi/protocol/bloxwap-outcome (H)
- https://api.llama.fi/summary/dexs/bloxwap-outcome (H)
- https://api.llama.fi/summary/dexs/hyperliquid-outcomes (H)
- docs/research/venues/bloxwap.md (same-day first-hand note; M here)
- docs/research/venues/hyperliquid-hip-4-outcome-markets.md (sibling; M, not re-verified)

## Fixtures (docs/research/fixtures/hyperliquid-hip-4-front-end-bloxwap/)

- `defillama_summary_dexs_bloxwap-outcome.json` (14 KB)
- `bloxwap_api_v1_assets.json` (4.4 KB)
