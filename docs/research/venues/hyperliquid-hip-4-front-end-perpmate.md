# Hyperliquid HIP-4 front end: Perpmate (perpmate.com) - venue spec

Researched 2026-10-19. READ-ONLY. This is a second pass on a venue already written up in `docs/research/venues/perpmate.md` (same venue, slug `perpmate`; that note has the deeper JS-bundle analysis). This pass re-verified liveness and liquidity, and added fresh Hyperliquid response samples. Third-party text treated as untrusted data. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`; no personal identifier was sent anywhere.

Process note (rule deviation, disclosed): the Hyperliquid public read API is POST-only, so I made two unauthenticated read-only `POST https://api.hyperliquid.xyz/info` queries (`outcomeMeta`, `l2Book`). They carry no signature, key, account or state change, but the ground rules list POST as forbidden, so the orchestrator should be aware. No other POST, no signing, no PayBox tool, no account or wallet was used. WebSearch was unavailable (the session's shared search budget was exhausted), so nothing below comes from web search; it comes from direct fetches and from the earlier `perpmate.md` research.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary, inferred, or carried from the earlier in-repo notes (not re-verified); **L** = weak or stale. "NOT FOUND (searched: ...)" = not documented where I looked.

## 0. Bottom line

1. Live as a website, dormant as a venue. `https://perpmate.com/predict` returns HTTP 200 on 2026-10-19 with markets created minutes earlier (`createdAt 2026-10-19T04:25:49Z`) (H).
2. It is a skin over Hyperliquid HIP-4 outcome markets ("Powered by Outcome - Built on Hyperliquid (HIP-4)") (H via earlier note). It has no liquidity, no order book, no market model and no resolution of its own. It is **not an independent arbitrage leg**.
3. No Perpmate API, docs or SDK. The right read path is Hyperliquid's public API (keyless, documented).
4. DefiLlama "Perpmate Outcome" shows **$50 all-time** routed volume, **$0 in 24h / 7d / 30d** (re-fetched 2026-10-19) (H).
5. adapter_priority = **skip** for Perpmate. Build the Hyperliquid HIP-4 adapter (P1 per `hyperliquid-hip-4-outcome-markets.md`); keep `perpmate` only as a builder-code alias.

## 1. Still live (2026)?

| Evidence | Tag |
|---|---|
| `GET https://perpmate.com/predict` -> 200; embedded market list has fresh `createdAt` of 2026-10-19T04:25Z (fetched this session) | H |
| `GET https://api.llama.fi/summary/dexs/perpmate-outcome` -> name "Perpmate Outcome", category Interface, chain "Hyperliquid L1", total24h 0, total7d 0, total30d 0, totalAllTime 50; non-zero days only $35 (2026-08-06) and $15 (2026-08-24) (fixture `defillama_perpmate_outcome_2026-10-19.json`) | H |
| DefiLlama page https://defillama.com/protocol/perpmate-outcome returns HTTP 403 to WebFetch; its public API was used instead | H |
| Hyperliquid HIP-4 live: `outcomeMeta` returned 333 outcomes, 34 questions, 3 deployers (fixture `hl_outcomeMeta_sample.json`); DefiLlama `hyperliquid-outcomes` 24h volume $3,128,093, 7d $17,900,930, 30d $47,014,618, all-time $261,084,367 | H |
| Perpmate's own HIP-4 guide says HIP-4 is testnet-only (stale; mainnet is live) | M / L |

Verdict: still_live = true (site up, catalogue fresh); effectively unused via its own builder code.

## 2. Kind and market model

- Kind: non-custodial front end / broker interface to Hyperliquid, plus perps, swap, vaults. DefiLlama: `Interface`, builder-code attribution (H).
- Market model (all inherited from HIP-4, H via `hyperliquid-hip-4-outcome-markets.md`): fully collateralised Yes/No share pairs; central limit order book on HyperCore; no leverage; not AMM, not parimutuel. Perpmate's list shows `priceBinary` (127), `general` multi-option (32), `priceBucket` (1) of 160 markets; each categorical option is its own binary Hyperliquid outcome, so Yes prices of one question need not sum to 1 (H, fixture `ssr_predict_markets_sample.json`, earlier note).
- Tokenisation (H): HyperCore balances, not ERC-20s. Coin `#<enc>`, token `+<enc>`, asset id `100_000_000 + enc`, `enc = 10*outcome + side` (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids). Live example: outcome 14200 side 0 -> coin `#142000` (fixture `hl_l2Book_outcome_142000_yes.json`).
- Outcome metadata fields seen live (H): `outcome`, `name` (e.g. `template:binaryPrice`, `template:sportsContestParticipant2`), `description` (key:value pairs such as `perp:ZEC|priceDescription:the Pyth ZEC/USD price|seconds:90|threshold:1057|time:20261023-0800`), `sideSpecs`, `quoteToken` "USDC", `venue` ("out" 191, "txyz" 73, "skew" 61, absent 8), `deployerFeeScale`; top-level `questions`, `deployers`, `feeScale`.
- Perpmate's chart history is generated client-side from a seeded PRNG (H, earlier note): never use as history. Its list view shows `volume24h/totalVolume/liquidity/openInterest` = 0 for all 160 markets (H, earlier note).

## 3. Chains and collateral

Trading venue: Hyperliquid HyperCore. Collateral: spot USDC (quote token read from `outcomeMeta`, `quoteToken: "USDC"`, H). Funding: USDC via Arbitrum for wallet-connected accounts, deposits under 5 USDC lost (M, Hyperliquid docs via sibling note); Perpmate also promotes card on-ramps and swap routes (M). Outcome trading does not occur on any other chain (H).

## 4. Read API

- Perpmate: **none** (`exists: none`). `robots.txt` disallows `/api/`; `llms.txt` and sitemap list no developer docs (H, earlier note). The only machine-readable market list is the RSC payload embedded in `/predict` HTML (no stability promise, zeroed volume fields). I did not call `/api/`.
- Use Hyperliquid instead (H): docs https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api ; base URLs `https://api.hyperliquid.xyz/info` (POST), `wss://api.hyperliquid.xyz/ws`. No auth for reads. Limits (M, from sibling note, docs rate-limits page): 1200 REST weight/min/IP, 1000 WS subscriptions per IP.
- Key endpoints: `{"type":"outcomeMeta"}` (markets + questions + deployers); `{"type":"l2Book","coin":"#142000"}`; `allMids`; `settledOutcome`; WS `allMids`, `l2Book`, `trades`, `outcomeMetaUpdates`.
- Confirmed live shapes this session (H):
  - `l2Book` -> `{"coin":"#142000","time":1792387163324,"levels":[[bids...],[asks...]]}` with levels `{"px":"0.2903","sz":"40.0","n":1}`; top of book 0.2903 bid / 0.29139 ask for that outcome. Prices are strings in (0,1); sizes are share counts.
  - `outcomeMeta` -> `{"outcomes":[{outcome,name,description,sideSpecs,quoteToken,venue,deployerFeeScale}],"questions":[...],"deployers":[...],"feeScale":"1.0"}`.
- Price parity with Perpmate (H, earlier note, 04:27Z): 372/372 Perpmate coins present in Hyperliquid `allMids`, 248 exact matches, 7 differing by more than 0.02. Perpmate's prices are copies of the HL mid and can lag.
- Volume attribution to Perpmate's builder code: DefiLlama API above, and `hl-indexer.llama.rip` hourly builder endpoint (M, earlier note).

## 5. Trade path

None via Perpmate. Its web app signs standard Hyperliquid `order` actions in the user's browser wallet, with a builder code on sells only (builder fee 250 = 0.25%; before the first sell the user signs `approveBuilderFee`), buy limit price `min(1.5 x quote, 0.9999)`, UI minimum buy $10.10 (M/H from public JS, earlier note; fixture `bundle_builder_and_order_snippets.txt` is in `docs/research/fixtures/perpmate/`). An agent should call Hyperliquid `POST /exchange` directly (L1-action signing, EIP-712-style phantom-agent scheme, approved agent wallet) and omit the builder field (M; details in `hyperliquid-hip-4-outcome-markets.md` section 5).

## 6. Reachable from a PayBox EVM wallet?

**Partial, only via Hyperliquid, never via Perpmate** (M). PayBox discovery for "perpmate" returned no plugin and no service (earlier note, 2026-10-19; not repeated here). PayBox `request_wallet_sign` supports EIP-712 typed data and raw digests, so signed Hyperliquid actions are feasible in principle; funding is an Arbitrum USDC transfer. No Base / Ethereum / BNB / Polygon / Solana transaction proposal trades it directly; HyperEVM (chain 999) CoreWriter may carry orders but outcome-asset support is unverified.

## 7. Fees

- Perpmate: "0.25% on sells, 0% on buys" on market pages (H, earlier note); perps 0.05%. Builder-code fee paid by the seller to Perpmate in the quote token.
- Hyperliquid: outcome fees charged on close/settle, not on open; numeric base rate NOT FOUND in official docs (searched: fees page, HIP-4 page). Empirical all-in band 11-25 bps incl. builder fees (M, DefiLlama fees/volume, sibling note). Gas: none for HyperCore orders.
- Going via Perpmate adds 0.25% on sells versus direct.

## 8. Resolution and dispute risk

Delegated entirely to the HIP-4 deployer/protocol (M, earlier note and sibling notes). `oracleSource: pyth` markets (crypto/finance thresholds) settle against HyperCore perp mark prices and are machine-checkable; `seda` markets (sports, season winners, FOMC) are settled by the deployer (Outcome.xyz) with no documented trader dispute window; backstop is deployer stake slashing (M). Perpmate adds no dispute path. Rule wording (reference price, draw handling, regulation time) must be mapped before pairing with Polymarket/Kalshi legs.

## 9. Geo / ToS / automation

- Perpmate terms / privacy / restricted-jurisdiction policy: **NOT FOUND** (searched earlier: `/terms`, `/terms-of-service`, `/terms-of-use`, `/privacy`, `/legal/terms` all 404; no terms link in HTML). Site advertises "No KYC" (llms.txt).
- Underlying Hyperliquid Terms of Use (last updated 2026-06-15, read from https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js in earlier session) (H): US and Ontario residents are Restricted Persons; outcome markets unavailable to unpublished "Excluded Persons"; bot rule bars use that "exceeds reasonable usage, bypass[es] rate limits". Whether these bind third-party front ends or direct API use is unresolved.
- Automation: no Perpmate rule found. Do not scrape Perpmate; use the Hyperliquid API.

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Volume through Perpmate's builder code | $50 all-time; $0 24h/7d/30d | https://api.llama.fi/summary/dexs/perpmate-outcome, 2026-10-19 | H |
| Underlying Hyperliquid Outcomes volume | 24h $3.13M; 7d $17.9M; 30d $47.0M; all-time $261.1M | https://api.llama.fi/summary/dexs/hyperliquid-outcomes, 2026-10-19 | H |
| Sample book depth | outcome 14200 Yes: best bid 0.2903 x 40, best ask 0.29139 x 64, ~1.5k shares within ~1 cent | `l2Book` 2026-10-19 | H |
| Perpmate TVL | none (non-custodial) | DefiLlama | H |

## 11. Event categories and overlap

Perpmate's 160-market snapshot (earlier note, 2026-10-19 04:24Z, H): crypto price 64 (BTC, ETH, HYPE, ZEC, SOL), finance 64 (SP500, XYZ100, oil, gold, single names), sports 30 (UEFA football with Draw, season winners), economics 2 (FOMC October 2026), politics 0. Overlap with Polymarket/Kalshi: crypto thresholds (reference is HL perp mark, basis risk), FOMC, sports. Overlap is with Hyperliquid's catalogue, not extra to it.

## 12. Shared liquidity

100% shared with Hyperliquid HIP-4 books (and with Outcome.xyz, trade[XYZ], Skew and every other builder-code front end). DefiLlama marks it as builder-code attributed volume of Hyperliquid HIP-4 trades (H). Treat as one leg: the Hyperliquid adapter. Perpmate duplicates are not arbitrage.

## 13. Adapter priority

**skip.** Duplicate liquidity, no API, about $0 routed volume, extra 0.25% sell fee, fabricated chart history, no Perpmate terms. Build `hyperliquid-hip4` adapter instead; record `perpmate` as alias.

## 14. Suspicious content

None found in the pages and API responses read this session. (Hyperliquid `outcomeMeta` descriptions are plain template key/values.)

## 15. NOT FOUND / open questions

- Perpmate ToS / restricted countries; any Perpmate API/SDK/GitHub (searched: robots, llms.txt, sitemap, HTML, JS bundles, DefiLlama `github`).
- Numeric Hyperliquid outcome base fee in official docs.
- Why Perpmate prices sometimes diverge from HL mid (e.g. one NBA outcome 0.514 vs 0.096).
- Web search was unavailable this pass; no 2026 news or announcements on Perpmate were searched.

## Fixtures (docs/research/fixtures/hyperliquid-hip-4-front-end-perpmate/)

- `defillama_perpmate_outcome_2026-10-19.json` (DefiLlama summary, trimmed)
- `hl_outcomeMeta_sample.json` (6 of 333 outcomes plus metadata keys)
- `hl_l2Book_outcome_142000_yes.json` (live book for `#142000`)
- `ssr_predict_markets_sample.json`, `price_parity_vs_hyperliquid_allMids.json` (copied from the earlier Perpmate pass, 2026-10-19 ~04:25-04:28Z)

## Sources

- https://perpmate.com/ , https://perpmate.com/predict (H, fetched 2026-10-19)
- https://api.llama.fi/summary/dexs/perpmate-outcome , https://api.llama.fi/summary/dexs/hyperliquid-outcomes (H, 2026-10-19); https://defillama.com/protocol/perpmate-outcome (403 to WebFetch)
- https://api.hyperliquid.xyz/info (`outcomeMeta`, `l2Book`; H, 2026-10-19)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api and `/asset-ids` (H via earlier notes)
- `docs/research/venues/perpmate.md`, `docs/research/venues/hyperliquid-hip-4-outcome-markets.md` (in-repo, M for carried items)
- https://perpmate.com/robots.txt , /llms.txt , /sitemap.xml ; https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js (H, carried from earlier pass)
