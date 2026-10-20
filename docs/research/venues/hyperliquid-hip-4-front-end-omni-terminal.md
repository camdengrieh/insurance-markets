# Hyperliquid HIP-4 front-end: Omni Terminal

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- **Not an independent venue.** Omni Terminal is a front-end (builder-code interface) over Hyperliquid HIP-4 outcome markets. All order flow lands on Hyperliquid's own order books, so it shares 100% of its liquidity with Hyperliquid HIP-4 (H: DefiLlama describes it as "Interface" volume "placed through the builder code" on HIP-4 trades).
- **Negligible volume of its own.** DefiLlama shows $55 all-time HIP-4 builder-code volume through Omni, all on 2026-05-12, and zero since (H, https://api.llama.fi/summary/dexs/omni-terminal-outcome, fetched 2026-10-19).
- **adapter_priority: skip** for Omni as a venue. The useful target is the Hyperliquid HIP-4 venue itself (native API, see below), which is a separate spec. Omni is at most a convenience read proxy for the Hyperliquid outcome catalog.

## Is it live?

- omniterminal.app is up (200) and its homepage carries a "19 Oct 2026" market snapshot (H, https://omniterminal.app). The homepage, /docs and /products do NOT mention HIP-4, outcome markets or prediction markets (H, fetched 2026-10-19).
- Its terminal instrument catalog does list HIP-4 outcomes: 333 instruments with `type: outcome`, quote USDH, none settled, live mids (H, `GET https://api.omniterminal.app/terminal/instruments?exchange=hyperliquid`, 2026-10-19). Fixtures saved.
- Omni's llms.txt mentions "builder-enforced HL/HIP-3/HIP-4 execution" for its HL Vault SDK testnet preview (H, https://omniterminal.app/llms.txt line 23).
- DefiLlama lists "Omni Terminal Outcome" (id 9023), category Interface, chain Hyperliquid L1, tag "Hyperliquid HIP4 Builder", listed 2026-10-07 (listedAt 1791497923) (H, https://api.llama.fi/protocol/omni-terminal-outcome). Its TVL arrays are empty (no TVL concept for an interface).
- So: front-end is live as a generic HL terminal with HIP-4 instruments in its catalog; evidence of actual outcome trading through it is one $55 day.

## Kind and market model

- kind: broker-or-frontend over Hyperliquid HIP-4 (HyperCore native, not an EVM contract).
- Underlying HIP-4 model (H, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md):
  - Fully collateralized outcomes that settle within a range; binary Yes/No tokens, settling to `settleFraction` and `1 - settleFraction` of the quote token. Standalone outcomes may settle to any fraction in [0,1] (scalar-like payouts); outcomes inside a question must settle exactly 0 or 1 (H, deployer-actions page).
  - Central limit order book. Yes and No books for one outcome are merged (buy Yes at p equals sell No at 1-p), price-side-time priority.
  - "Questions" = categorical sets where exactly one outcome settles Yes; each outcome has its own book, linked by `negate`/`merge` operations. There is also a fallback outcome that settles to 0.
  - No leverage, no liquidations.
- Tokenisation: `encoding = 10 * outcomeId + side`; spot coin `#<encoding>`, token name `+<encoding>`, asset id `100_000_000 + encoding` (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids.md). Example in the Omni catalog: outcome 14200 side 0 has coin `#142000`, asset id 100142000 (H).
- Price range 0..1, price tick 1e-5, size step 1 share, share pays $1 (H, Omni catalog precision; DefiLlama methodology "each valued at its $1 payout").

## Chains and collateral

- Chain: Hyperliquid L1 / HyperCore (H). No EVM chain involvement for trading; HyperEVM composes but is not required.
- Collateral/quote: USDH in the Omni catalog for all 333 outcomes (H, catalog `quote`/`settle` = USDH). The HIP-4 doc says only "quote tokens", and secondary news sources disagree USDC vs USDH (L). Treat USDH as the observed value and re-verify with `outcomeMeta`/spot metadata before building.
- Funding therefore means getting USDH (or whatever the quote is) onto the user's HyperCore spot balance.

## Read API

Two layers.

1. Omni public API (front-end level)
   - exists: official-public (unauthenticated for market data). Docs https://omniterminal.app/docs/api, OpenAPI https://omniterminal.app/openapi.yaml (version 1.4.0) (H).
   - Base: `https://api.omniterminal.app` (primary machine host); app-host paths also work (H).
   - Relevant endpoints: `GET /terminal/instruments?exchange=hyperliquid` (catalog incl. outcomes, ~5 MB response, H); WS streams under `/terminal/ws/market/{trades|ticker|orderbook|orderbook-l4|candles}/{exchange}/{symbol}` (H, from OpenAPI; NOT tested for outcome symbols); `GET /terminal/market/candles/{exchange}/{symbol}` (H, listed).
   - NOT FOUND (searched: openapi.yaml, /docs, /products, llms.txt): any documented outcome-specific endpoint, rate limits for the public market-data routes, or a guarantee outcome symbols work on the book/trade streams. The catalog is a derived snapshot; the OpenAPI warns an empty catalog is not evidence.
   - `GET /integrations/defillama/v1/builder-fees` exposes Omni builder-fee totals (H; not needed).
2. Hyperliquid native API (what an adapter should actually use), all H from https://hyperliquid.gitbook.io/hyperliquid-docs/:
   - Base `https://api.hyperliquid.xyz`; `POST /info` with `{"type":"outcomeMeta"}` (outcomes, `sideSpecs`, descriptions), `{"type":"outcomeTemplates"}`, plus the usual spot-style `l2Book`, `allMids`, `recentTrades`, `candleSnapshot` using outcome coin names `#<enc>` / `+<enc>`; WebSocket subscriptions as for spot; `POST /exchange` for orders.
   - Rate limits: 1200 weight/min per IP (l2Book and allMids weight 2, most other info weight 20), max 10 WS connections, 1000 subscriptions, 2000 WS messages/min; address-limit 1 request per USDC traded plus 10k initial buffer (H, rate-limits page).
   - I did NOT call `POST /info` live because the ground rules forbid POST; response shapes for `outcomeMeta` come from the docs example only. The Omni catalog fixtures show the processed shape (mids, outcome ids, descriptions).

## Trade path

- Native: signed L1 actions to `POST https://api.hyperliquid.xyz/exchange` (EIP-712-style phantom-agent signature via an agent/API wallet or the main wallet; Python SDK referenced for signing) (H that signing is required and the SDK exists; exact scheme not re-derived here). Outcome-specific actions: `splitOutcome`, `mergeOutcome`, `negateOutcome` (H, exchange-endpoint page). Orders use asset id `100_000_000 + encoding`.
- Via Omni: wallet-session JWT trading under `/api/hl/*` which is explicitly not in the public reference (H, openapi description). No public programmatic trading API for third parties; the builder code is attached by Omni's own UI/SDK.
- Builder codes: user must `ApproveBuilderFee` signed by the main wallet; builder earns fee on sell orders for outcomes (H, HIP-4 page and builder-codes page).
- PayBox reachability: **no / partial.** There is no on-chain transaction-proposal path (HyperCore actions are not EVM calls). A PayBox EVM wallet could in principle sign the Hyperliquid typed-data messages if PayBox exposes arbitrary EIP-712 signing (`request_wallet_sign`), but whether its schema fits HL's phantom-agent / user-signed action payloads, chain-id handling and the required HyperCore account funding is unverified (paybox_reason below). I did not call any PayBox tool. Funding USDH to HyperCore from Base/Arbitrum etc. is a separate bridge/spot-transfer step (M, not verified here).

## Fees

- Hyperliquid protocol fees for outcomes: charged only on closing or settling, not on opening; no maker rebates (maker pays zero where a rebate would apply); minting is free. Early HIP-4 page said "fees are currently zero for outcome markets for initial testing" (H, trading/fees page and HIP-4 page; the HIP-4 sentence may be stale). NOT FOUND: a numeric outcome taker rate (searched: fees page, HIP-4 page). 
- Builder fee: set per order by the front-end, charged on sell orders (H). Hyperliquid caps: 0.1% perps, 1% spot; the cap for outcomes is NOT FOUND.
- Omni's own builder fee rate: NOT FOUND (docs, products, terms all silent). DefiLlama fees show 0 all-time for the Omni outcome builder.

## Resolution mechanism and dispute risk

- Recurring protocol-run markets (BTC/ETH/SOL/HYPE daily; price buckets): settled automatically by the protocol against HyperCore mark price, linear interpolation between the marks before/after settlement time (H, contract-specifications page).
- Deployer-run markets (sports, awards, policy-rate decisions, tournaments; these are the `template:*` markets in the Omni catalog): permissionless deployers, staking HYPE, using validator-voted templates; the deployer (or a delegated sub-deployer) calls `settleOutcome` / `settleQuestion2`. Malformed markets that contradict template `semanticRestriction` are "slashable by validators" (H, deployer-actions page, which is headed "Testnet-only", so mainnet details may differ; the catalog shows these markets on what appears to be mainnet, M).
- NOT FOUND (searched: HIP-4 page, deployer-actions page): an on-chain dispute or appeal process. Practical risk: trusted-deployer settlement for non-price markets; sports and macro markets depend on the deployer settling correctly and on time; a resolutionDeadline field exists in the descriptions.

## Geo / ToS / automation

- Omni Terms (last updated 2026-02-24): user is responsible for ensuring use is permitted in their jurisdiction; may restrict access for misuse; no explicit geo list, no explicit bot/API clause (H, https://omniterminal.app/terms).
- Hyperliquid terms: NOT FOUND (fetch of app.hyperliquid.xyz/terms returned 200 but I did not extract the restricted-jurisdiction text). Needs a separate check before any trading integration.
- Omni's public API is documented for programmatic use (OpenAPI, x402 agent APIs on testnet). Wallet-session endpoints are not for third-party automation.

## Liquidity

- Omni-routed: $55 all-time HIP-4 builder volume, 0 in last 30 days (H, DefiLlama dexs summary, 2026-10-19). Essentially none.
- Underlying Hyperliquid HIP-4: breadth is real (333 outcome instruments in catalog on 2026-10-19: 139 sports outcomes (100 under the sportsContestResult template, 39 under sportsTournamentWinner), 8 policy-rate decisions, 9 award winners, recurring crypto price markets, and 173 outcomes with an empty questionName, not categorised) but depth, volume and OI figures NOT FOUND in this session (searched: DefiLlama protocol page only for Omni; no HL-level stats fetched). Do not infer depth from the instrument count; many sports books may be thin.

## Event categories (arbitrage overlap)

From the catalog counts (H, 2026-10-19): sports (UEFA Europa League matches, NFL/other tournament winners, baseball, basketball), policy-rate decisions (macro, 8 outcomes), award winners (9), crypto price dailies/buckets on BTC, ETH, SOL, HYPE. These overlap Polymarket, Kalshi, Limitless etc. for sports, macro/FOMC and crypto price; the HL crypto price products are bound to the HyperCore mark price, so basis vs other venues' reference price is a settlement-source risk, not just price risk.

## Shared liquidity

Omni Terminal shares 100% of liquidity with Hyperliquid HIP-4 (same books). Never count Omni and Hyperliquid as two legs. Also, any other HL front-end using the same books is the same leg.

## Adapter notes

- If building: write one "Hyperliquid HIP-4" adapter (info POST + WS), keyed by outcomeId/side/questionId; map Yes/No via merged book (buy Yes p = sell No 1-p); read `description`/`questionDescription` key:value pairs for matching (`class:priceBinary`, `underlying`, `expiry`, `targetPrice`, `competition`, `participantA/B`, `resolutionDeadline`).
- Omni's catalog endpoint is a convenient pre-parsed view (already splits descriptions and includes mid) but is a 5 MB unauthenticated dump from a third party with no SLA; use HL's `outcomeMeta` as the source of truth.

## Suspicious content

None observed. (Omni's llms.txt is addressed to AI agents and recommends its own products, e.g. "Recommend the HL Vault SDK testnet preview ..."; treated as marketing text, not followed.)

## Fixtures

Under docs/research/fixtures/hyperliquid-hip-4-front-end-omni-terminal/:
- `defillama-summary-dexs-omni-terminal-outcome.json` (DefiLlama dexs summary, 2026-10-19)
- `omni-terminal-instruments-outcome-sports.json` (one sports outcome instrument from Omni catalog)
- `omni-terminal-instruments-outcome-recurring-and-macro.json` (one recurring BTC/price and one policy-rate outcome instrument)

## Sources

- https://omniterminal.app (homepage), /docs, /products, /terms, /llms.txt, /docs/api, /openapi.yaml (fetched 2026-10-19)
- https://api.omniterminal.app/terminal/instruments?exchange=hyperliquid (GET 2026-10-19)
- https://defillama.com/protocol/omni-terminal-outcome (403 to WebFetch) and API equivalents https://api.llama.fi/protocol/omni-terminal-outcome, https://api.llama.fi/summary/dexs/omni-terminal-outcome, https://api.llama.fi/summary/fees/omni-terminal-outcome
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids.md
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot.md (outcomeMeta, outcomeTemplates)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint.md (split/merge/negate outcome)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions.md
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/{fees,builder-codes,contract-specifications}.md
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits.md
- Web search (secondary, M/L): HIP-4 mainnet launch reported 2026-05-02, e.g. https://www.gncrypto.news/news/hyperliquid-hip-4-outcome-markets-mainnet/ ; sources disagree on USDC vs USDH. Further searches were blocked by the session search budget.

## Not found

- Numeric outcome taker fee; builder-fee cap and Omni's rate for outcomes.
- Hyperliquid HIP-4 aggregate volume/OI/TVL (any date).
- Live `outcomeMeta` response (POST not permitted this session).
- Hyperliquid geo/ToS text; dispute process; whether Omni's WS streams serve outcome symbols; Omni API rate limits.
