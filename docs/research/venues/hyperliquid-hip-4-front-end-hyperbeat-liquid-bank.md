# Hyperliquid HIP-4 front end: Hyperbeat Liquid Bank - venue spec

Researched 2026-10-19. READ-ONLY (page/doc fetches, unauthenticated GETs to DefiLlama, no account, wallet, key, signature, POST or payment, no PayBox money tools). Third-party text treated as untrusted data.
Tags: H = read first-hand in a primary source this session; M = secondary/summary/inferred; L = weak/stale.

This is the same underlying subject as the earlier note `docs/research/venues/hyperbeat-liquid-bank.md` (parallel workflow, written today). I re-verified its key numbers below and agree with its conclusion. Detail on the underlying venue lives in `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`.

## Bottom line

- Hyperbeat is a builder-code front end on Hyperliquid HIP-4 outcome markets, not a venue. Liquidity is 100% shared with native Hyperliquid HIP-4, so it is NOT an independent arbitrage leg.
- Still live in 2026 (site up, DefiLlama listed 2026-10-08), but flow is negligible: $49.67 builder-routed volume in 30 days, $0 in 24h/7d, $150,404 all-time (H, DefiLlama, data to 2026-10-18).
- No Hyperbeat market-data or trading API for outcomes. Use Hyperliquid's own API instead.
- Terms prohibit unauthorized bots. adapter_priority = skip (build the native Hyperliquid HIP-4 adapter).

## 1. Still live?

| Evidence | Tag |
|---|---|
| DefiLlama protocol id 8993 "Hyperbeat Liquid Bank Outcome", category Interface, tag "Hyperliquid HIP4 Builder", description "provides access to outcome-based prediction markets through Hyperliquid", `listedAt` 1791497893 (2026-10-08), parent Hyperbeat. https://api.llama.fi/protocol/hyperbeat-liquid-bank-outcome | H |
| `https://app.hyperbeat.org` serves the Hyperbeat app (Earn vaults, Stake, Trade, Win/Beatpot, Pay; status "Operational"). The rendered text does not mention outcomes or HIP-4. `https://app.hyperbeat.org` answers 308 (redirect) to curl; `/predict` returned 404 to a plain GET (SPA route, likely client-side) | H (site up) / M (outcome UI) |
| Hyperbeat blog 2026-07-24: prediction markets "live on their own page at /predict ... and settle in USDC". https://hyperbeat.org/blog/predict-markets-explained | M (page summarised by a small model) |
| Underlying HIP-4 live: Hyperliquid outcomes $3.13M volume on 2026-10-18 | H |
| defillama.com page itself returned 403 to WebFetch; API used instead | H |

still_live = true.

## 2. Kind and market model

- Kind: interface/front end (builder). Hyperbeat Terms say of Trade: executed on Hyperliquid infrastructure, "We are not a counterparty, broker, exchange" (https://hyperbeat.org/terms, updated 2026-03-01, predates outcome launch) (H via earlier note's raw-HTML read; M here).
- Model (H, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets): fully collateralized outcomes settling `settleFraction` (Yes) / `1 - settleFraction` (No); Yes and No books merged (buy Yes at p == sell No at 1-p); "Questions" group outcomes where exactly one settles Yes (categorical); first market a daily BTC binary settling 06:00 UTC to HyperCore mark price. Central limit order book, not AMM.
- Tokenisation (from native note, H there): `encoding = 10*outcome + side`, coin `#enc`, token `+enc`, asset id `100000000 + enc`.
- Hyperbeat UX (M): shares 0 to 1 USDC, "Settles In / Awaiting Settlement / Market Settled", Rules dialog per market.
- Whether Hyperbeat lists all HIP-4 markets or a subset: NOT FOUND (searched: blog, docs llms.txt, rendered app text).

## 3. Chains and collateral

- Trading venue: Hyperliquid HyperCore ("Hyperliquid L1" in DefiLlama) (H). Collateral/quote: USDC per Hyperbeat blog (M); the HIP-4 doc page does not name the quote token (H, absence); other press says USDH/USDC migration, unresolved (L). See native note.
- Hyperbeat account is described as a self-custodial smart wallet on HyperEVM; its mapping to the HyperCore account holding outcome tokens: NOT FOUND (searched: hyperbeat.org, docs liquid-banking).

## 4. Read API

- Hyperbeat outcome API: none. `https://docs.hyperbeat.org/llms.txt` lists only builder codes for vaults/staking, Hyperfolio API (portfolio), liquid banking, Pay, Beatpot; grep for predict/outcome/HIP-4 finds nothing (H absence). GitHub org 0xhyperbeat has no outcome repos (H, per earlier note).
- Use Hyperliquid: `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `settledOutcome`, `l2Book`), `wss://api.hyperliquid.xyz/ws` (`l2Book`, `trades`, `bbo`, `outcomeMetaUpdates`); docs https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api ; limits ~1200 weight/min per IP REST, WS 10 connections / 1000 subs (H per native note). No live shape captured here (POST forbidden).
- Public aggregate API (H, no key): `GET https://api.llama.fi/summary/dexs/hyperbeat-liquidbank-outcome`, `/summary/dexs/hyperliquid-outcomes`, `/protocol/hyperbeat-liquid-bank-outcome`. Shape: metadata + `total24h/total7d/total30d/total1y/totalAllTime` + `totalDataChart` = `[[unix_ts, usd_volume], ...]` daily (170 points, 2026-05-02 to 2026-10-18).
- Builder-fill attribution: Hyperliquid publishes `stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4`; Hyperbeat's builder address NOT FOUND (searched: docs, llms.txt), so not fetched.

Fixtures (`docs/research/fixtures/hyperliquid-hip-4-front-end-hyperbeat-liquid-bank/`): `defillama_protocol_hyperbeat-liquid-bank-outcome.json`, `defillama_summary_dexs_hyperbeat-liquidbank-outcome.json` (full daily series, breakdown removed), `defillama_summary_dexs_hyperliquid-outcomes_last30d.json`.

## 5. Trade path and PayBox

- Via Hyperbeat: no documented order API; consumer app only. Bots barred (section 8).
- Mechanism underneath (H): Hyperliquid `order` action with `builder: {b, f}`; user pre-approves max builder fee via `ApproveBuilderFee` signed by main wallet (https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes). Native route: `POST /exchange` with EIP-712 / msgpack L1-action signature, asset id `100000000 + enc`.
- paybox_reachable = partial, and only via the native Hyperliquid route: an EVM wallet can sign typed data (`request_wallet_sign`) and fund through Arbitrum USDC, but orders are off-chain HyperCore signed actions, not EVM transaction proposals. Via Hyperbeat: no.

## 6. Fees

- Hyperbeat builder fee: "0.025 percent on trades" per blog "Fees on Hyperbeat Trade" (2026-07-14); applicability to outcome trades unconfirmed (M). Paid by user. Hyperbeat is strictly costlier than the native leg.
- Builder cap: 0.1% perps / 1% spot (H, builder-codes doc); builders earn on sell orders (H, HIP-4 doc).
- Hyperliquid outcome fee: HIP-4 doc says "Fees are currently zero for outcome markets for initial testing" (H, fetched today, undated); DefiLlama/fees doc indicate a fee on close/settle since mid-Aug 2026, rate NOT FOUND (see native note). DefiLlama Hyperbeat fees: cumulative $2.
- Terms reserve a "Platform Fee", amount not stated (M).

## 7. Resolution

Same as Hyperliquid HIP-4: recurring markets settle to HyperCore mark price; deployer/template markets settle per validator-approved template, malformed ones slashable (H via native note). Hyperbeat blog does not say who resolves (H, absence in fetched article). No recourse against Hyperbeat (it disclaims counterparty role). Dispute risk: no trader dispute window for deployer-settled markets (M).

## 8. Geo / ToS / automation

Hyperbeat Terms (https://hyperbeat.org/terms, updated 2026-03-01, from earlier note's raw read, H there): bans "bots ... not expressly authorized by the Company"; bans disguising location via VPN; restricts "binary options (including prediction-market transactions)" where non-compliant; not available to Ontario or sanctioned jurisdictions; US eligibility for Trade not stated. The Terms predate the outcome launch. Hyperliquid's own terms (US/Ontario excluded per native note) returned 403 here.

## 9. Liquidity (DefiLlama API, fetched 2026-10-19, data through 2026-10-18)

| Metric | Value | Tag |
|---|---|---|
| Hyperbeat builder-routed HIP-4 volume | 24h $0, 7d $0, 30d $49.67, all-time $150,404 | H |
| Hyperbeat TVL/OI | none (tvl empty) | H |
| Underlying HIP-4 | 24h $3.13M, 7d $17.9M, 30d $47.0M, all-time $261.1M (since 2026-05-02) | H |
| Hyperbeat share of HIP-4 | ~0.0001% (30d), ~0.06% (all-time) | M (arithmetic) |

## 10. Event coverage

Equals Hyperliquid HIP-4 (subset on Hyperbeat NOT FOUND): crypto price binaries/buckets (BTC daily/15m), rate decisions (macro), plus sports/awards templates per native note (M). Overlaps with other venues are real, but the arbitrageable leg is the Hyperliquid book.

## 11. Liquidity shared with

Hyperliquid HIP-4 native book, fully (also Phantom, BasedApp, Floatout, Outcome.xyz and other `*-outcome` builder listings). Treat all as one venue.

## 12. Adapter recommendation

skip. Duplicate liquidity, no API, negligible volume, bot clause. Build the native Hyperliquid HIP-4 adapter; optionally label Hyperbeat in fill data if its builder address is learned.

## Open questions

1. Hyperbeat builder address and outcome builder fee.
2. Why ~$101k of its all-time volume appears on 2026-05-02..04 (before the 2026-10-08 listing and 2026-07-24 blog).
3. Mapping of Liquid Bank smart wallet to HyperCore account.
4. Whether /predict is geo or feature gated.

## Suspicious content

None found in fetched pages (no instructions aimed at AI agents).

## Sources

- https://api.llama.fi/protocol/hyperbeat-liquid-bank-outcome (H)
- https://api.llama.fi/summary/dexs/hyperbeat-liquidbank-outcome (H)
- https://api.llama.fi/summary/dexs/hyperliquid-outcomes (H)
- https://api.llama.fi/summary/fees/hyperbeat-liquidbank-outcome (H)
- https://api.llama.fi/protocols (H, Hyperbeat sibling entries)
- https://defillama.com/protocol/hyperbeat-liquid-bank-outcome (403, hint only)
- https://app.hyperbeat.org (H)
- https://hyperbeat.org/blog/predict-markets-explained (M)
- https://hyperbeat.org/terms (H via earlier note; M here)
- https://docs.hyperbeat.org/llms.txt (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes (H via earlier note)
- Web search results (M): coingecko, across.to, cryptobriefing etc. on HIP-4 launch 2026-05-02; none mention Hyperbeat.
- Repo: docs/research/venues/hyperbeat-liquid-bank.md, docs/research/venues/hyperliquid-hip-4-outcomes-native.md
