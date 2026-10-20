# Hyperliquid HIP-4 front-end: Infinex (infinex.xyz) - venue spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs only (api.llama.fi, Hyperliquid gitbook, pro.app.infinex.xyz status), plus reuse of same-day first-hand work in `docs/research/venues/infinex.md` (the full Infinex spec; this file is the registry-slug summary and re-verifies the key facts). No account, wallet, key, signature, POST or payment. Third-party text treated as untrusted data; no instructions aimed at AI agents were seen.

Tags: H = read first-hand in a primary source this session (URL cited); M = secondary/inferred; L = weak/stale.

Limits: `https://infinex.xyz/` returns HTTP 429 (Vercel bot challenge) to scripted GET and WebFetch; I did not try to bypass it, so Infinex's Terms of Use and marketing copy were NOT READ this session. `https://defillama.com/protocol/infinex-outcome` returned 403 to WebFetch (the same data was read from api.llama.fi instead). The WebSearch budget was exhausted, so only one search (Hyperliquid HIP-4 generally) was done here.

## 0. Bottom line

- Infinex is a **non-custodial superapp / front end**, not a venue. Its prediction product is an interface over **Hyperliquid HIP-4** order books via a builder code (Polymarket announced, disabled). It has no order book, market data or API of its own. (H, DefiLlama + `venues/infinex.md` front-end code reading)
- **Prediction product is not publicly live**: Pro's "Predictions" item is feature-flagged ("Coming soon"), and lifetime builder-routed outcome volume is **$322** (29 fills, 2026-08-05 and 08-06 only; $0 in the last 24h/7d/30d). (H)
- **Liquidity is 100% shared with Hyperliquid HIP-4** -> NOT an independent arbitrage leg. Everything readable or tradable via Infinex is readable and tradable directly on Hyperliquid without Infinex's extra builder fee.
- **adapter_priority = skip.** Registry alias: `infinex.xyz -> routes_to: hyperliquid-outcomes-hip-4` (kind frontend). Model the Hyperliquid HIP-4 book once (`venues/hyperliquid-hip-4-outcomes-native.md`, `venues/hyperliquid-outcomes-hip-4.md`).

## 1. Still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://pro.app.infinex.xyz/` | HTTP 200 on 2026-10-19 (Infinex Pro app) | H |
| `GET https://infinex.xyz/` | HTTP 429 bot challenge (not bypassed) | H |
| `GET https://api.llama.fi/protocol/infinex-outcome` | id 9002 "Infinex Outcome", category Interface, tag "Hyperliquid HIP4 Builder", chain "Hyperliquid L1", `listedAt` 1791497902 (2026-10-08), parent Infinex (siblings: Infinex Perp, Spot, Hyperliquid Spot), description "Infinex provides access to outcome-based prediction markets through Hyperliquid.", `tvl: []`, `doublecounted: true` | H |
| `GET https://api.llama.fi/summary/dexs/infinex-outcome` | total24h 0, total7d 0, total30d 0, totalAllTime 322; only two nonzero days: 1785888000 (2026-08-05) = $89, 1785974400 (2026-08-06) = $233 | H |
| UI gating and blog (from `venues/infinex.md`, front-end JS read 2026-10-19) | flag `enablePredictionMarkets` off -> "Coming soon"; exchange picker shows "Polymarket (coming soon)" disabled; Infinex blog dated 2026-07-31: "Coming up: ... prediction markets powered by HIP-4 on Hyperliquid and Polymarket"; no later launch post | H (there) |

Verdict: still_live = **false for the prediction product** (company and Pro app live; outcome trading gated, early access at best, no volume since 2026-08-06, i.e. 74 days).

## 2. Kind and market model

- Kind: broker-or-frontend (DefiLlama "Interface"). Infinex's own Perps terms dialog says Hyperliquid and Lighter are not owned or controlled by Infinex (H, per `venues/infinex.md`).
- Market model = Hyperliquid HIP-4, quoted from the official page (H, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md, read this session): "fully collateralized contracts that settle within a fixed range"; each outcome has two side tokens (`sideSpecs` in `outcomeMeta`, often Yes/No); Yes settles to `settleFraction` quote tokens, No to `1 - settleFraction`; Yes and No books are merged (buy Yes at p == sell No at 1-p); "questions" group outcomes so exactly one settles Yes; central limit order book on HyperCore, not an AMM. Coin `#<10*outcome+side>`, asset id `100_000_000 + encoding` (M here; H in the HL native note).
- Infinex adds no markets; which HIP-4 markets it would list: NOT FOUND (searched: Pro bundle excerpts, docs; no docs site exists).

## 3. Chains and collateral

HyperCore (Hyperliquid L1, not an EVM chain); collateral USDC (H, `venues/infinex.md` capability schema; Hyperliquid docs call it "quote token"). Infinex accounts span many chains for deposits, but the outcome leg is HyperCore only. Polymarket leg (Polygon) not live.

## 4. Read API

- Infinex: **none** (read_api.exists = none). No developer docs (`docs.infinex.xyz` does not resolve), no public API; the app uses an undocumented authenticated backend. (H, per `venues/infinex.md`; searched: docs domain, `infinex-xyz` GitHub org, app bundles)
- Use Hyperliquid directly: `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `l2Book`, `allMids`, `settledOutcome`), `wss://api.hyperliquid.xyz/ws` (`l2Book`, `bbo`, `trades`, `outcomeMetaUpdates`); keyless; docs https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api. Shapes and fixtures: `venues/hyperliquid-hip-4-outcomes-native.md`, `fixtures/hyperliquid-hip-4-outcomes-native/`. POST not repeated here (out of scope).
- Infinex-attributable public data only: DefiLlama keyless GETs above, and the Hyperliquid public builder-fill archive `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/<builder>/<YYYYMMDD>.csv.lz4` (H, per `venues/infinex.md`).
- Confirmed by unauthenticated GET this session and saved in `docs/research/fixtures/hyperliquid-hip-4-front-end-infinex/`:
  1. `llama_protocol_infinex_outcome.json`, `llama_summary_dexs_infinex_outcome.json`, `llama_summary_fees_infinex_outcome.json` (real responses; shape: `total24h/7d/30d/totalAllTime`, `totalDataChart` as `[unixTs, usd]`, `methodology` strings).
  2. `llama_summary_dexs_hyperliquid_outcomes_trimmed.json` (underlying venue: 2026-10-18 volume 3,128,093; 7d 17,900,930; 30d 47,014,618; all-time 261,084,367).
  3. `hyperliquid_hip4_gitbook_page.md` (official HIP-4 page text).

## 5. Trade path

- Via Infinex: none programmatic (UI session only, passkey/EOA login; no order API). (H "undocumented"; backend NOT FOUND)
- Underneath (H, front-end code per `venues/infinex.md`): standard Hyperliquid builder-code flow - user EOA signs `approveAgent` and `approveBuilderFee`, orders are Hyperliquid `order` actions with `builder:{b,f}` signed by an agent wallet and POSTed to `https://api.hyperliquid.xyz/exchange`.
- Better path: trade Hyperliquid directly (EIP-712 signed L1 actions, agent wallet, no Infinex fee).

## 6. PayBox reachability

**no** for Infinex (read-only `discover_plugins` / `discover_services` for "infinex" returned nothing on 2026-10-19, per `venues/infinex.md`; not re-run). Via Hyperliquid directly it is **partial**: HyperCore is not EVM, so EVM transaction proposals cannot place orders; a PayBox EVM wallet could fund USDC to Hyperliquid (Arbitrum etc.) and would need typed-data signing or a locally held agent key for orders (M).

## 7. Fees

- Infinex builder fee: 5.0 bps of notional on **sells/closing fills only** (measured: 17 of 17 sell fills = 0.0005 exactly; 12 buys = 0). Default config 50 tenths-of-bp, approval cap "0.1%". (H, fixtures in `fixtures/infinex/`; build-time env so production may differ, M)
- Hyperliquid: "Fees are currently zero for outcome markets for initial testing. However, builder codes do work the same as normal spot trading, where builders earn builder fees on sell orders that specify their builder code." (H, HIP-4 gitbook page, undated; "currently" may be stale. `venues/infinex.md` notes HL fees on closing/settling fills from about 2026-08-15, M.)
- Borne by the trader. Cashback program (a share of builder fees returned): applicability to outcomes unknown.

## 8. Resolution and dispute risk

Entirely Hyperliquid's: settlement automatic by protocol (recurring BTC mark-price series) or deployer-settled for other markets with no trader dispute window; validator vote as backstop (M, HL native note). Infinex has no resolution role. Polymarket leg, if ever enabled, would be UMA-based (covered elsewhere).

## 9. Geo, ToS, automation

- Infinex inherits Hyperliquid's region gate: Pro calls Hyperliquid `/info legalCheck` per address and blocks restricted regions (H, per `venues/infinex.md`). US and Ontario restricted per HL note (M).
- Infinex Terms of Use: NOT READ (blocked by bot challenge). Automation rules: NOT FOUND (searched: infinex.xyz legals, blocked).
- Automation via Infinex is not offered; use Hyperliquid directly.

## 10. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Infinex-routed outcome volume | $322 all-time; $0 in 24h/7d/30d; 29 fills by 3 wallets on 2026-08-05/06 | api.llama.fi 2026-10-19; archive scan in `venues/infinex.md` | H |
| TVL / OI | none (interface) | DefiLlama, 2026-10-19 | H |
| Underlying HL HIP-4 | $3.13M volume 2026-10-18; $17.9M 7d; $47.0M 30d; $261.1M all-time | `api.llama.fi/summary/dexs/hyperliquid-outcomes`, 2026-10-19 | H |

## 11. Event categories / overlap

Whatever HIP-4 lists (crypto price ladders, rates, sports, awards, others per HL native note); the official page says the first market is a daily BTC binary settling 06:00 UTC to the HyperCore mark price, with multi-outcome markets "not part of the initial mainnet release" (H, page undated; later expansion per HL note). Crypto-price overlap with Polymarket/Kalshi/Limitless exists but via Hyperliquid, not Infinex. Infinex adds no categories.

## 12. Shared liquidity

**100% shared with Hyperliquid HIP-4** (orders land in HL's CLOB tagged with Infinex's builder address; fills visible in HL's builder archive). Announced Polymarket leg would share with Polymarket. Never count Infinex as a separate leg or as extra depth.

## 13. Open questions

1. Is `enablePredictionMarkets` on for any cohort (Aug 5-6 fills suggest an internal or early test)? Needs an account; not allowed.
2. Infinex Terms of Use (automation, geo, prediction clauses): blocked.
3. Production outcome builder fee after August.
4. Polymarket integration design and date: nothing public.

## Sources

- https://api.llama.fi/protocol/infinex-outcome (H, GET 2026-10-19)
- https://api.llama.fi/summary/dexs/infinex-outcome (H) ; https://api.llama.fi/summary/fees/infinex-outcome (H)
- https://api.llama.fi/summary/dexs/hyperliquid-outcomes (H)
- https://defillama.com/protocol/infinex-outcome (WebFetch 403, not read; hint only)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts (H, via `gh api`, in `venues/infinex.md`)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md (H)
- https://pro.app.infinex.xyz/ (HTTP 200 only); https://infinex.xyz/ (HTTP 429 challenge, not read)
- Local, same-day first-hand notes: `docs/research/venues/infinex.md` (front-end JS, builder-fill archive, PayBox discovery), `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, `docs/research/venues/hyperliquid-outcomes-hip-4.md`
- WebSearch (extended) 2026-10-19 on "Hyperliquid HIP-4 outcome markets prediction markets launch": HIP-4 mainnet launch reported 2026-05-02 (M, secondary press: Chainstack, QuickNode, CryptoBriefing); sources conflicted on settlement currency (USDC vs USDH) - resolved in HL native note as USDC, treat as M here.
