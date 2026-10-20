# Hyperliquid HIP-4 front end: GTR.trade - venue spec

Researched 2026-10-19. READ-ONLY (page and static-asset GETs, keyless GETs to DefiLlama, no accounts, wallets, signatures, POSTs or PayBox money tools). The session web-search budget was exhausted, so no news searches were run. Third-party text treated as untrusted data; nothing in it was followed.

Tags: H = read first-hand in a primary source this session (URL cited); M = secondary or inferred; L = weak or stale.

Companion notes: pool spec `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`; sibling front-end specs (Dreamcash, Borsa, Cipher, etc.).

## 0. Bottom line

- GTR.trade is live (2026) as a social trading front end on Hyperliquid (perps, stocks, memes, "Prediction Markets" in the marketing copy). It has no markets of its own. (H)
- Its outcome-market volume via the DefiLlama "GTR.trade Outcome" row is negligible and has been zero since 2026-07-14: $1,749 all-time, $0 over 30d, last non-zero day $18 on 2026-07-14. The shipped web bundle has no HIP-4 code strings (see 4). (H)
- It is NOT an independent arbitrage leg. Books, settlement and liquidity are Hyperliquid HIP-4's; GTR is only a builder-code attribution tag. (H)
- adapter_priority = skip for GTR. Build one Hyperliquid HIP-4 adapter and record GTR as `front_end` metadata only.

## 1. Still live (2026)?

- https://gtr.trade/ returns HTTP 200 (Vercel, Next.js) on 2026-10-19; title "GTR - Your Edge in Real-Time Trading". (H)
- Bundle copy: "GTR is a social trading platform to trade Crypto Perps, Stocks, Memes, & Prediction Markets alongside the best traders in real time." (H, static JS, https://gtr.trade/_next/static/chunks/*.js). The HTML is cached since about 2026-09-25 (response `age` about 2.06M s), so the deployed app is at least 3 weeks old. (H)
- DefiLlama protocol `gtr.trade-outcome` (id 8989): category Interface, chain Hyperliquid L1, tag "Hyperliquid HIP4 Builder", description "GTR.trade provides access to outcome-based prediction markets through Hyperliquid.", listed 2026-10-08 (listedAt 1791497889), parent "GTR.trade" with sibling rows Perps, Spot, Outcome. https://api.llama.fi/protocol/gtr.trade-outcome (H). The listing date is a DefiLlama listing, not the first trade: volume history starts 2026-05-13.
- Verdict: still_live = true for the front end; outcome use is dormant (no volume since 2026-07-14).

## 2. Kind and market model

- Kind: broker / front end (interface layer, not counterparty). Parent brand relies on Privy wallets and hosts a social/copy-trading layer (`/feeds`, `/clans`, `/leaderboard`, `/affiliate` routes in the bundle). (H for routes, M for characterisation)
- Market model is Hyperliquid HIP-4, not GTR's: "fully collateralized contracts that settle within a fixed range"; each outcome has two sides (Yes/No, `sideSpecs`) that share one merged order book (buy Yes at p equals sell No at 1-p, priority price-side-time); a Question groups outcomes where exactly one settles Yes. https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets (H)
- Tokenisation: `encoding = 10*outcome + side` (side 0 or 1); spot coin `#<encoding>`, token name `+<encoding>`, asset id `100000000 + encoding`; e.g. outcome 1 side 0 gives `#10`, `+10`, 100000010. https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids (H)
- Split/merge/negate operations convert between primary and dual balances and across a question's outcomes (exchange endpoint `userOutcome` actions `splitOutcome`, `mergeOutcome`, `mergeQuestion`, `negateOutcome`). https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint (H)
- Whether GTR's UI exposes outcomes at all today: NOT FOUND (searched: gtr.trade home HTML, all 45 static JS chunks for "outcomeMeta", "HIP-4", "hip4"; 0 hits; support.gtr.trade index lists no prediction-market article).

## 3. Chains and collateral

- Hyperliquid L1 / HyperCore only (DefiLlama chain "Hyperliquid L1"). (H)
- Collateral: quote token USDC per the `settledOutcome` doc sample (`"quoteToken":"USDC"`). https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot.md (H)
- The bundle also references Ostium perps (api.ostium.io, Arbitrum signature chain id 0xa4b1 for the builder-fee approval), unrelated to outcomes. (H)

## 4. Read API

- GTR itself: official public API NOT FOUND. `https://api.gtr.trade/v1` answers HTTP 200 to a bare GET but is an undocumented app backend (referenced in the bundle); not explored. (M)
- Use Hyperliquid directly (official-public, no key):
  - Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api (H)
  - REST: `POST https://api.hyperliquid.xyz/info` with `{"type":"outcomeMeta"}` (outcomes, `sideSpecs`, `description` as `class:priceBinary|underlying:BTC|expiry:YYYYMMDD-HHMM|targetPrice:N|period:1d` or `class:priceBucket|...|priceThresholds:lo,hi`), `{"type":"outcomeTemplates"}`, `{"type":"settledOutcome","outcome":<n>}`, `{"type":"outcomeDeployerLimits","venue":...}`, `l2Book` with coin `#<encoding>`. (H, docs)
  - WebSocket: `wss://api.hyperliquid.xyz/ws` (subscriptions page in docs index). Limits: 10 connections, 30 new connections/min, 1000 subscriptions. (H)
  - Rate limit: 1200 REST weight/min per IP; `l2Book` weight 2, most other `info` requests 20. https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits (H)
- `/info` is POST-only; ground rules forbid POST, so no live Hyperliquid response shape was captured. Fixture contains the docs sample only, labelled as such. Live GET shapes captured: DefiLlama (see fixtures).
- Builder-fill dumps (GET, LZ4 CSV): `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{lowercase_builder_address}/{YYYYMMDD}.csv.lz4`. https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes (H, docs; not downloaded). Useful only to measure GTR's attributed flow.

## 5. Trade path

- Only via Hyperliquid: signed `order` actions to `POST https://api.hyperliquid.xyz/exchange` (outcome asset id as above), optionally with a builder object `{"b": address, "f": tenths-of-bp}` after the user signs `ApproveBuilderFee` with their main wallet. https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes (H). The trading API for outcomes is "similar to spot" per the HIP-4 page. (H)
- GTR's bundle approves builder `0x5EF4DeeB76F87d979D0Ddc8c51f5b4F65d1c972A` with `maxFeeRate:"0.05%"` (H, static JS). The DefiLlama row's address field is a different address (`0x684618c70480a70637692a51a3a9398dfd7ab0f5`); which one is the outcome builder code is NOT FOUND. (M)
- An aggregator gains nothing from GTR's builder code (it only adds a fee). No GTR order API, sandbox or keys.

## 6. PayBox reachability

partial (same as any Hyperliquid HIP-4 venue, no extra from GTR). Orders are HyperCore signed actions (EIP-712 over a msgpack action hash, or user-signed typed data for approvals), not EVM transaction proposals. PayBox's chain catalog lists Hyperliquid as HyperEVM only (M, `docs/research/06-paybox-platform.md`). A PayBox EVM wallet could in principle sign orders or an `approveAgent` through `request_wallet_sign` typedData/raw (documented with no domain allowlist, M), then an agent submits to `/exchange`; funding HyperCore from Arbitrum is separate. Driving the GTR UI would be automation of a Privy-wallet web app; not recommended.

## 7. Fees

- Hyperliquid outcome fees: "Outcome trading only charges fees when closing or settling, not when opening outcome positions"; no maker rebates for outcomes. https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees (H). The HIP-4 page said fees were zero during initial testing; the fees page is the later source. (H)
- Builder fee on outcomes: builders earn fees on sell orders carrying their code; cap 1% on spot-type fees. GTR's actual outcome builder fee rate: NOT FOUND (searched: home page, bundle, support index; terms are client-rendered and returned no text). Cap in its approval is 0.05%. (M)
- DefiLlama fees all-time for the outcome row: $0.05 (single day 2026-06-21) on $1,749 volume. (H)

## 8. Resolution and dispute risk

Entirely Hyperliquid's. Recurring price outcomes settle on the underlying perp mark price at expiry (`priceBinary`: Yes if mark above `targetPrice`); template markets (e.g. central-bank rate decisions) carry long rule text with a named official source and fallback to No. No separate oracle or dispute process is described. (H, HIP-4 page and `outcomeTemplates` doc sample). GTR adds no resolution layer or dispute channel. Deployer-created markets inherit deployer-written rules, a rules-quality risk for cross-venue arbitrage (M).

## 9. Geo / ToS / automation

- GTR Terms: https://gtr.trade/terms/ and the help center footer points to a Terms of Service at getrabbit.app/terms. The /terms page is rendered client-side and returned no text to a plain GET; jurisdiction and bot rules NOT FOUND (searched: gtr.trade/terms HTML, support.gtr.trade index). Not read; treat automated UI access as unpermitted. (M)
- Hyperliquid's own terms page (app.hyperliquid.xyz/terms) returned only a title to the fetch tool; restricted-jurisdiction text NOT FOUND this session. The documented programmatic path (API/WebSocket, rate limits above) is the sanctioned one. (M)

## 10. Liquidity (DefiLlama, fetched 2026-10-19)

| Metric | Value | Tag |
|---|---|---|
| GTR.trade Outcome volume 24h / 7d / 30d / all-time | $0 / $0 / $0 / $1,749 | H |
| Active days | 2026-05-13 ($20), 05-14 ($19), 06-20 ($287), 06-21 ($905), 06-23 ($500), 07-14 ($18) | H |
| Hyperliquid Outcomes pool 24h / 7d / 30d / all-time | $3.13M / $17.9M / $47.0M / $261.1M | H |
| GTR share of pool, all-time | about 0.0007% (my arithmetic) | M |
| Book depth / OI / TVL attributable to GTR | none; shared HIP-4 book | H |

Sources: https://api.llama.fi/summary/dexs/gtr.trade-outcome?dataType=dailyVolume, https://api.llama.fi/summary/dexs/hyperliquid-outcomes?dataType=dailyVolume. Volume is only flow carrying the builder code. DefiLlama's Spot/Perps rows for GTR are also small ($21.9k and $12.8k all-time, H).

## 11. Category overlap

Same as the whole HIP-4 universe (see pool note): crypto/asset price thresholds, some sports, macro (rate decisions), and company/awards events. Overlap with Polymarket, Kalshi, Limitless and Predict.fun exists for crypto price and macro, but the leg to scan is HIP-4 itself. GTR contributes no categories of its own.

## 12. Shared liquidity

Fully shared with Hyperliquid HIP-4 (H). Dozens of front ends use the same books (DefiLlama "X Outcome" rows). Model as pool `hyperliquid-outcomes` with `front_ends[]`; not an independent leg.

## Fixtures

`docs/research/fixtures/hyperliquid-hip-4-front-end-gtr-trade/`
- `defillama_protocol_gtr.trade-outcome_2026-10-19.json` (protocol metadata, live GET)
- `defillama_gtr_outcome_volume_trimmed.json`, `defillama_gtr_outcome_fees_trimmed.json` (non-zero days only)
- `defillama_hyperliquid-outcomes_pool_trimmed_2026-10-19.json`
- `gtr_bundle_excerpt_and_hl_doc_samples.txt` (bundle excerpt and Hyperliquid docs samples; docs samples are not live responses)

## Sources

- https://gtr.trade/ (H) and its static JS chunks (H)
- https://support.gtr.trade/en/ (H, index only)
- https://api.llama.fi/protocol/gtr.trade-outcome (H)
- https://api.llama.fi/summary/dexs/gtr.trade-outcome and /summary/fees/gtr.trade-outcome (H)
- https://api.llama.fi/summary/dexs/hyperliquid-outcomes (H)
- https://api.llama.fi/overview/dexs and /overview/fees (H, GTR sibling rows)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot.md (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint.md (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits.md (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes.md (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees (H)
- `docs/research/06-paybox-platform.md` (M, internal)

## Open questions

- Does the live GTR app still list HIP-4 outcomes? (needs a human look; the bundle suggests no.)
- Which builder address carries GTR outcome flow, and at what fee?
- GTR and Hyperliquid terms text (client-rendered / not fetched).
