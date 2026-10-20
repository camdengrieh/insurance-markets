# Bloxwap - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch/WebSearch, plain `curl` GETs to documented public hosts (generic User-Agent `insurance-markets-research/0.1`), `gh api` file reads and code search. No account, wallet, key, signature, POST/PUT/DELETE, payment, browser automation, PayBox tool, or execution of third-party code. The Bloxwap web-app JavaScript bundle was downloaded as text and grepped, never run. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, inference, or my own computation; **L** = weak or stale. Where WebFetch (a small summarising model) was the only reader I say so.

---

## 0. Bottom line

1. **Bloxwap is a live mobile/web front-end for Hyperliquid perpetuals (plus HIP-3 perps and a third-party "Papertrade" pool). It is NOT a prediction-market venue and has no market model of its own.** Its own docs, API, FAQ, Terms and fee page never mention prediction, outcome or HIP-4 markets (H, section 2).
2. The DefiLlama entry "Bloxwap Outcome" (id 8965) is a **mechanical per-market split of Bloxwap's Hyperliquid builder code** (`"bloxwap-outcome": { builder: "bloxwap-perps", market: "outcome" }` in DefiLlama's factory adapter), not evidence of a product. Its description ("provides access to outcome-based prediction markets through Hyperliquid") is DefiLlama's wording (H).
3. The production web app **does contain a HIP-4 buy path** for `#<enc>` outcome coins ("{asset} above {target}", "Market too thin" toast), but it is undocumented and **not listed in Bloxwap's own market list** (79 markets, categories `perp` and `hip3` only). Measured use is negligible: **$220.80 of HIP-4 volume all-time, on 5 days, zero in the last 30 days** (DefiLlama, data to 2026-10-18) against **$261.1M** for all of Hyperliquid HIP-4 (H/M, section 10).
4. **Not an independent arbitrage leg.** Any Bloxwap outcome trade is an order on the Hyperliquid HIP-4 CLOB (same book, same settlement). The right integration is the Hyperliquid HIP-4 adapter (see `docs/research/venues/hyperliquid-hip-4-outcome-markets.md`, a sibling note I did not re-verify beyond the lines quoted below).
5. **adapter_priority = skip.** Record `bloxwap` in the platform registry only as a **frontend/alias of venue `hyperliquid-hip4`** (builder code address in section 5) so volume attribution and de-duplication work.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `bloxwap.com`, `bloxwap.app`, `bloxwap.pro` all answer HTTP 200 on 2026-10-19; public API `GET https://bloxwap.app/api/v1/assets` returns 79 markets | H |
| Terms "Effective: October 16, 2026"; FAQ "Last updated: October 16, 2026"; fee page "As of October 13, 2026" (https://bloxwap.com/docs/terms, /docs/faq, /docs/fees) | H |
| GitHub org `bloxwap`: repos pushed 2026-10-18/19 (`hyperliquid`, `chart`, `agent-cli`, `hig`, ...) (`gh api orgs/bloxwap/repos`) | H |
| DefiLlama `bloxwap-perps` (id 8050): 171 non-zero fee days of 177; 24h fees $2.23 on 2026-10-18 (https://api.llama.fi/summary/fees/bloxwap-perps) | H |
| Marketing says early access/waitlist for the mobile app (https://bloxwap.com) | H (WebFetch summary) |
| The "outcome" listing: DefiLlama `listedAt` 2026-10-08, but trading effectively dormant (section 10) | H |

Verdict: **still_live = true as a Hyperliquid perps front-end; effectively dormant as an outcome-market front-end.**

---

## 2. Kind and market model

- **Kind (H):** "mobile-first, non-custodial trading app for crypto perpetual futures and 24/7 tokenized stocks - a one-tap front-end on Hyperliquid" (https://bloxwap.app/llms.txt). Order flow: app -> Hyperliquid, "orders execute on Hyperliquid from your wallet" (https://bloxwap.com/docs/compare, via llms-full.txt).
- **Its own markets (H, https://bloxwap.app/api/v1/assets, fixture `bloxwap_api_v1_assets.json`):** `{"assets":[{symbol,name,category}...],"count":79}`; categories seen: `perp` (33) and `hip3` (46). No `outcome`/`prediction` category. Docs also list crypto, stocks, commodities, indices, pre-IPO perps, and "Papertrade" pt-BTC / pt-ETH (third-party HyperEVM LP pool, 1000x, "no order book", settles against an LP) (https://bloxwap.com/docs/assets).
- **Prediction/outcome markets in Bloxwap's docs:** NOT FOUND (searched: llms.txt, llms-full.txt (183 KB, only hit is an FAQ sentence "It doesn't make outcomes more certain"), /docs/terms, /docs/developers, /docs/faq, /docs/fees, /docs/listing, OpenAPI spec, bloxwap.com and bloxwap.app home pages; GitHub code search in `bloxwap/hyperliquid` and `bloxwap/dimension-adapters` for "outcome" = 0 hits, `bloxwap/agent-cli` for "HIP-4" and "prediction" = 0 hits, its 4 "outcome" hits are test-report wording).
- **What the app bundle shows (M - client code read as text, fixture `bloxwap_app_bundle_outcome_evidence.txt`):**
  - decodes Hyperliquid outcome tokens (`enc = 10*outcome + side`, Yes/No) and maps order asset id `100_000_000 + 10*outcome + side`;
  - parses outcome `description` strings (`class:priceBinary|underlying|targetPrice|expiry|period`, also `priceBucket`) into a display string "{asset} above {target} in {time}" - so only **crypto price-threshold** outcomes are understood;
  - order path handles `"long"` on an outcome coin, price clamp 0.00001..0.99999, and a "Market too thin" toast when the book cannot fill;
  - calls `outcomeMeta` / `outcomeTemplates`, bundles the generic `userOutcome` split/merge/negate action schema.
  - A frozen sample `outcomeId: 9999, expiry 2099` in the bundle is a UI fixture, not a market.
  - Conclusion (M): outcome trading is a latent/unlisted capability, reachable at most by deep link; I did not open the app (no browser automation), so whether any UI surface exposes it is unverified.
- **Tokenisation:** Hyperliquid HyperCore spot-style outcome tokens, not ERC-20 (H for the id scheme in the bundle; Hyperliquid docs per sibling note M).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading venue | Hyperliquid L1 (HyperCore) via `https://api.hyperliquid.xyz` and `wss://api.hyperliquid.xyz/ws` (bundle default config, builder fee 50 tenths-of-bps = 5 bps) | H (bundle text) |
| Collateral | USDC on Hyperliquid (HIP-4 settles in USDC per sibling note M; HIP-4 page itself says "fully collateralized contracts that settle within a fixed range" H, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md) | H/M |
| Funding in | Cash App Bitcoin, on-ramps, Solana SOL/USDC (guides listed in llms.txt); withdraw to Base (guide) | H (titles only; I did not read the guides) |
| Wallet | Privy embedded wallet (email/passkey) or an external wallet; user approves a Hyperliquid **agent key** stored on the device (Terms s.1) | H |
| Token | `$BLOXWAP`, Solana SPL `2u3ufZ5defxwPXMixvvQpSs68PDNzHTdE52t9Crspump` (pump.fun launch); fee-discount token, not a trading collateral | H (CoinGecko + DefiLlama) |

---

## 4. Read API

**Bloxwap's own API is public, unauthenticated and read-only, but it carries no market data.**

- Docs: OpenAPI 3.1 https://bloxwap.app/openapi.json (fixture `bloxwap_openapi_v1.json`), overview https://bloxwap.app/developers, deprecation policy https://bloxwap.app/developers/deprecation. Base URL `https://bloxwap.app`, paths under `/api/v1/` (H).
- Endpoints (H): `GET /api/v1/assets` (list of listed markets; no prices/books; edge-cached 1 h), `/price/bloxwap`, `/supply/bloxwap`, `/burn/status?address=`, `/subscription/status?address=`, `/tournament`, `/relay/fee-config`, `/treasury`, `/signals/trend`, `/signals/swing`.
- Live probes 2026-10-19 (H): `assets` 200; `tournament` 200 (`{"status":"ended","isRunning":false,"startAt":1792157100000,"endAt":1792158900000}`); `treasury` 200; `relay/fee-config` 200 (`{"appFees":[{"recipient":"0x71b09A...","fee":"50"}]}`); **`signals/trend` and `signals/swing` returned HTTP 500 "Internal Server Error" on two attempts** (fixture `bloxwap_api_v1_signals_trend_HTTP500_body.txt`).
- Auth/limits (H): no key; 600 requests/min per client, headers `ratelimit-limit: 600`, `ratelimit-policy: "public-read";q=600;w=60` seen live; `429` + `Retry-After` when throttled; CORS `*`.
- Explicitly out of scope per the spec (H): "Live prices and per-market leverage caps are intentionally out of scope ... they belong to Hyperliquid's own `info` API."
- MCP: `https://bloxwap.app/mcp` (Streamable HTTP, unauthenticated; tools `search_docs`, `get_doc`, `quote_fees`; read-only, cannot trade) per llms.txt (H); a bare GET returns 405 (expected for a POST-only MCP endpoint). I did not call it.
- Websocket: none from Bloxwap. (Its Trend/Swing signal feeds are consumed by the app from `wss://tapsiren-*.fly.dev/ws` hosts seen in the bundle - undocumented, not probed.)
- **Outcome/prediction data in the API:** NOT FOUND. For HIP-4 books, trades, resolution use the Hyperliquid API directly (REST `POST /info`, WS `l2Book` / `allMids` / `activeAssetCtx` on `#<enc>` coins; see the sibling Hyperliquid note).
- Third-party: DefiLlama dimension API gives builder-attributed outcome volume (`https://api.llama.fi/summary/dexs/bloxwap-outcome`, `.../fees/bloxwap-outcome`; fixtures `defillama_summary_dexs_bloxwap-outcome.json`, `defillama_summary_fees_bloxwap-outcome.json`) (H).

---

## 5. Trade path

- **Bloxwap has no order API (H):** "There is deliberately no trading API: Bloxwap is non-custodial, every position is signed by the user's own embedded wallet and settles on Hyperliquid ... To trade programmatically, talk to Hyperliquid directly." (https://bloxwap.app/llms-full.txt, "Bloxwap API").
- **Mechanism inside the app (H, Terms s.1; M bundle):** user approves a Hyperliquid agent key; Bloxwap client software signs `order` actions and posts to Hyperliquid, attaching builder code `{b: <address>, f: <tenths of bps>}` (default 50 = 5 bps).
- **Builder code address (M):** `0x71b09a08257078a4d642f7dd7315e656c837329a` is the address DefiLlama uses for `bloxwap-perps` (https://github.com/DefiLlama/dimension-adapters, `factory/hyperliquid.ts`) and the `recipient` returned by Bloxwap's own `/api/v1/relay/fee-config`. Company-level public address; no user data.
- **Developer tooling (H):** `@bloxwap/hyperliquid` (TypeScript SDK; code search for "outcome" in `bloxwap/hyperliquid` returned 0 hits, M) and `@bloxwap/agent-cli` (Hyperliquid perps CLI with Privy managed agents; no HIP-4 mention) at https://github.com/bloxwap. Third-party code: not cloned, not run.
- **Verdict:** for an aggregator, routing through Bloxwap adds a 5 bps builder fee and gives nothing (no API, no outcome list). Trade HIP-4 directly with Hyperliquid signed actions and, if wanted, our own builder code.

---

## 6. Reachability from a PayBox wallet

**paybox_reachable = no** (as a distinct venue).

1. Bloxwap exposes no programmatic order surface (section 5); its signing lives in its own Privy/agent-key client flow. A PayBox wallet cannot drive the app (no browser automation; no API).
2. A PayBox EVM wallet could sign Hyperliquid EIP-712 actions itself and trade HIP-4 **directly on Hyperliquid, bypassing Bloxwap** - that is the "partial" case analysed in the sibling Hyperliquid note (signed orders via `request_wallet_sign` typed data; HyperEVM CoreWriter for split/merge; Base/Ethereum/BNB/Polygon/Solana wallets can only fund, not trade) (M, not re-verified here).
3. Bloxwap's Solana fund-in and Base withdrawal are Relay-routed consumer guides, not a PayBox-usable interface.

---

## 7. Fees

- **Bloxwap builder fee (H, https://bloxwap.com/docs/fees, "As of October 13, 2026"):** 0.05% (5 bps) per fill; 0.025% for Genesis ($BLOXWAP burn >= 1,000,000); paid by the user on position value, on opening and closing fills. Hyperliquid taker fee in the example: 0.045% base tier. Total 9.5 bps per fill (7 bps Genesis). Bloxwap keeps none of funding. The fee page describes perpetual orders only.
- **Outcome-market fee on Bloxwap:** NOT FOUND (searched: /docs/fees, /docs/faq, Terms, llms-full.txt). Bundle default `builderFeeTenthsBps: 50` (M) suggests the same 5 bps would be attached. DefiLlama shows $0.04 fees on $220.80 volume (about 1.8 bps of reported volume, M - the dimension's volume/notional definitions make this ratio unreliable).
- **Hyperliquid side (H for the quoted line):** the HIP-4 page says "Fees are currently zero for outcome markets for initial testing. However, builder codes do work the same as normal spot trading, where builders earn builder fees on sell orders that specify their builder code." The sibling note records this as stale and the numeric outcome fee as undocumented (M).
- Papertrade markets: no builder fee; 2% fee on profit plus deadband and haircut (H). Irrelevant to prediction markets.

---

## 8. Resolution mechanism and dispute risk

- Bloxwap does not create, settle or resolve any market (H, by absence; it is an interface).
- HIP-4 outcomes settle on Hyperliquid: recurring BTC binary "settles daily at 06:00 UTC to the BTC mark price on HyperCore mark prices" (H, HIP-4 page). Deployer-settled templated markets and the absence of a documented trader dispute window are in the sibling note (M, not re-verified).
- Bloxwap Terms: Delaware law, binding AAA arbitration (Wilmington), class waiver, 30-day pre-arbitration notice; liability capped at USD $100 (H, Terms s.10 and dispute section; WebFetch summary plus raw-HTML grep).

---

## 9. Geo / ToS / automation

- **Blocked (Tier 1) (H, https://bloxwap.com/docs/terms, Effective 2026-10-16):** citizens/residents/persons located in the United States, United Kingdom, EU member states, Singapore, Japan, Australia, Brazil, South Korea. Tier 2 sanctions list (Cuba, Iran, North Korea, Syria, Russia, Belarus, Crimea/Donetsk/Luhansk). Tier 3 watchlist: UAE, Hong Kong, India, U.S. territories. VPN/proxy to bypass is prohibited.
- **Automation (H):** "Normal algorithmic trading through Hyperliquid is allowed if it follows these Terms, the Protocol's rules, and any promotion rules"; bots/scrapers are barred except "the public APIs we expressly make available" (WebFetch summary of s.7; raw HTML confirms the first sentence).
- Hyperliquid's own outcome-market geo rules (US/Ontario barred, per sibling note, M) apply on top.
- robots.txt allows all crawlers incl. AI crawlers and advertises the OpenAPI/llms.txt (H).

---

## 10. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Bloxwap HIP-4 outcome volume, all-time | **$220.80** (5 non-zero days: 2026-05-04 $62, 05-05 $62, 05-06 $21, 07-23 $74, 07-24 $1.80); 24h/7d/30d = $0 | https://api.llama.fi/summary/dexs/bloxwap-outcome, data to 2026-10-18 | H |
| Bloxwap HIP-4 builder fees, all-time | $0.04 | .../summary/fees/bloxwap-outcome, 2026-10-18 | H |
| Hyperliquid HIP-4 (all frontends) | 24h $3.13M; 7d $17.9M; 30d $47.0M; all-time $261.1M | https://api.llama.fi/summary/dexs/hyperliquid-outcomes, 2026-10-18 | H |
| Bloxwap share of HIP-4 volume | about 0.00008% all-time | computed | M |
| Bloxwap perps builder fees | 24h $2.23, 30d $158.59, all-time $3,330.84 (implies roughly $6.7M all-time perps notional at 5 bps) | .../summary/fees/bloxwap-perps, 2026-10-18 | H / M (implied volume) |
| `$BLOXWAP` token | price about $0.0000633, market cap about $61.7k, 24h volume $62.56 | CoinGecko API, 2026-10-19 | H |
| TVL | none (builder interface, non-custodial) | DefiLlama category "Interface" | H |

CoinGecko tags `BLOXWAP` with category "Prediction Markets" (H, fixture `coingecko_bloxwap_trimmed.json`), but its description of the product mentions only perps and tokenized stocks - the category tag appears to be a classification artifact, not a product statement (M).

---

## 11. Event coverage and arbitrage overlap

- Bloxwap itself: none distinct. Through the latent HIP-4 path the app understands only **crypto price-threshold outcomes** ("{asset} above {target}"), which overlap Polymarket / Kalshi / Limitless crypto-price markets - but those are the same Hyperliquid books you would read directly.
- Bloxwap's HIP-3 perps (46 `hip3` assets: stocks, commodities, indices) and perps (33) are **derivatives price references**, potentially useful as a hedge/price oracle for crypto/macro/commodity-linked prediction markets, but they too are available straight from Hyperliquid.
- Bloxwap's Trend/Swing signals are perps technical-momentum signals (UP/DOWN/WATCH; entry/stop/target), unrelated to prediction-market probabilities; the endpoints were returning HTTP 500 at probe time. Not a Quotient-like signal source.

---

## 12. Shared liquidity

**Fully shared.** Bloxwap -> Hyperliquid HIP-4 order books (HyperCore CLOB, merged Yes/No book). Treat `bloxwap` as a **frontend/alias of `hyperliquid-hip4`**. It must never be counted as a separate arbitrage leg or add depth to the aggregate book. (H for "no Bloxwap-side book exists": the app talks to `api.hyperliquid.xyz` directly and Bloxwap has no order server.)

---

## 13. Priority

**skip.** No independent liquidity, no prediction-market catalogue or data API of its own, no trading API, negligible measured HIP-4 volume ($220.80 all-time), geo-blocked for the US/UK/EU, signals endpoints erroring. Revisit only if (a) Bloxwap documents an outcome-markets product, or (b) DefiLlama shows its HIP-4 volume rising materially (a cheap re-check: `https://api.llama.fi/summary/dexs/bloxwap-outcome`). Integration effort belongs in the Hyperliquid HIP-4 adapter.

---

## 14. NOT FOUND

- Any Bloxwap documentation of outcome / prediction / HIP-4 markets (searched: all llms.txt pages, Terms, FAQ, fees, developers, listing, OpenAPI, GitHub code search, WebSearch "Bloxwap Hyperliquid HIP-4 outcome markets prediction" returned no Bloxwap result).
- Outcome-specific builder fee or any Bloxwap-side outcome market list/volume endpoint.
- A Bloxwap-published explanation of the CoinGecko "Prediction Markets" tag or the DefiLlama "outcome-based prediction markets" description.
- Direct DefiLlama protocol page (https://defillama.com/protocol/bloxwap-outcome returned HTTP 403 to WebFetch; the API at api.llama.fi was used instead).

## 15. Open questions

1. Does any Bloxwap UI surface (market picker, deep link `/trade/%23<enc>`) expose HIP-4 outcomes to users? Needs an in-app check; not done (no browser automation).
2. What generated the five non-zero outcome days (2026-05-04..06, 2026-07-23..24)? Likely internal testing (M, inference from size).
3. Is the outcome builder fee 5 bps like perps? Unverified.

## 16. Suspicious / agent-directed content (recorded, not followed)

- `robots.txt`, the OpenAPI description and `llms.txt` contain text addressed to AI agents/crawlers (e.g. "an agent that fetches this can call the whole surface without asking anyone for a key"; "AI answer-engine and training crawlers are explicitly welcomed"). Benign marketing/discoverability language; I only made ordinary documented unauthenticated GETs as the task allows.
- No hidden or coercive instructions found on any page read. The pages' JSON-LD is plain organisation/app metadata.

---

## Sources

- https://bloxwap.com (home; WebFetch summary, H) and https://bloxwap.app (app; HTML + JS bundle read as text)
- https://bloxwap.com/robots.txt (H)
- https://bloxwap.app/llms.txt and https://bloxwap.app/llms-full.txt (H)
- https://bloxwap.app/openapi.json and https://bloxwap.app/api/v1/assets, `/tournament`, `/relay/fee-config`, `/treasury`, `/signals/*` (H, live probes 2026-10-19)
- https://bloxwap.com/docs/terms, /docs/fees, /docs/faq, /docs/developers, /docs/listing, /docs/assets (H)
- https://github.com/bloxwap (org repos `hyperliquid`, `agent-cli`, `chart`; `gh api` listing and code search) (H)
- https://api.llama.fi/summary/dexs/bloxwap-outcome, https://api.llama.fi/summary/fees/bloxwap-outcome, https://api.llama.fi/summary/fees/bloxwap-perps, https://api.llama.fi/summary/dexs/hyperliquid-outcomes (H)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts (`gh api` raw read; builder address and `builderMarketListings` entry) (H)
- https://defillama.com/protocol/bloxwap-outcome (HTTP 403 to WebFetch; not read)
- https://api.coingecko.com/api/v3/coins/bloxwap (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md (H, quoted lines only)
- docs/research/venues/hyperliquid-hip-4-outcome-markets.md (sibling project note; M, lead only)

## Fixtures (docs/research/fixtures/bloxwap/)

- `bloxwap_api_v1_assets.json` - live `GET /api/v1/assets` (79 markets, categories perp/hip3)
- `bloxwap_openapi_v1.json` - the OpenAPI 3.1 spec as served
- `bloxwap_api_v1_signals_trend_HTTP500_body.txt` - body of the failing signals endpoint
- `bloxwap_app_bundle_outcome_evidence.txt` - short excerpts of the client bundle showing latent HIP-4 handling
- `defillama_summary_dexs_bloxwap-outcome.json`, `defillama_summary_fees_bloxwap-outcome.json` - DefiLlama dimension summaries
- `defillama_hyperliquid-outcomes_snapshot_trimmed.json` - Hyperliquid HIP-4 totals for comparison
- `coingecko_bloxwap_trimmed.json` - token metadata and categories
