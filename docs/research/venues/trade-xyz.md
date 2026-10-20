# Trade[XYZ] (trade.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 02:35-03:05 UTC). READ-ONLY: doc `.md` GETs, static HTML GETs, one free-tier DefiLlama GET, short unauthenticated Hyperliquid WebSocket read subscriptions (subscribe messages only), PayBox read-only `discover_*` calls. No account, wallet, key, signature, POST/PUT/DELETE (no POST-over-WS either), payment or money/signing PayBox tool. All third-party pages were treated as untrusted data. One endpoint answered HTTP 402 with a subscription upsell (not an x402 payment requirement) and I stopped there (section 16).

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, summariser output, or my computation from first-hand data; **L** = weak, stale or single-source.

Overlap warning: a sibling note already covers the Events half in depth: `docs/research/venues/events-by-tradexyz-hip-4-deployer-venue-txyz.md`, on top of `docs/research/venues/hyperliquid-outcomes-hip-4.md`. This note re-verifies its key facts first-hand today, resolves what "Trade[XYZ]" is as a whole, and adds the perps half (the part that is new).

---

## 0. Bottom line

1. **Live, but it is not an independent prediction market.** trade[XYZ] is (a) the dominant HIP-3 perp-DEX deployer on Hyperliquid (dex `xyz`: stocks, indices, commodities, FX, pre-IPO perps) and (b) a HIP-4 outcome deployer (venue `txyz`, "Events", launched about 2026-09-10) plus (c) a non-custodial web interface. Everything matches, settles and is served on Hyperliquid's HyperCore. (H docs; launch date M)
2. **The EventTracker hint "prices only" is wrong.** The raw coverage table row reads `TRADE.XYZ | Now ✓ | Prices ✓ | Volume ✓ | Depth ✓ | OI - | Free >=15 min | ET& >=15 min`. Outcome.xyz is a separate row, so the TRADE.XYZ row is almost certainly the `txyz` Events slice of HIP-4 (M, inference; EventTracker does not say how it sources it). (H row, M inference)
3. **Prediction-market part is tiny and duplicates Hyperliquid HIP-4:** about 71 live outcome coins, ~$22k Yes-side 24h notional on 2026-10-19 01:35Z, Loris 30d notional $3.27M, OI about $0.2M (sibling note, M). Resolution is issuer-controlled with no appeal (Terms 1.6, H). US, Canada and UK persons are barred from the Interface (Terms 2.2, H).
4. **The perps part is huge but is not a prediction market:** `xyz` dex 24h notional **$1.72B** and OI **$3.87B** at 2026-10-19 02:51Z (my WS computation, weekend session, M), roughly 97% of all non-first HIP-3 dex volume and OI. Value to us is as a **signal / hedge / reference-price source** (24/7 prices for equity indices, oil, gold, single stocks, and pre-IPO perps that can inform IPO-timing and market-cap markets on Polymarket/Kalshi), not as an arbitrage leg.
5. **adapter_priority = P2 (signal-only). Do NOT build a standalone trade.xyz adapter.** Build the Hyperliquid HIP-4 adapter (P1 in its own note), tag txyz legs with `deployer_venue="txyz"`, and optionally let the same adapter subscribe to `xyz:*` perp mids/ctx as a reference-price feed (near-zero marginal work: same WS, same keyless access). The Events leg on its own is `skip` (duplicate liquidity, thin, issuer-resolved).

---

## 1. Is it still live? (2026)

| Evidence | Tag |
|---|---|
| docs.trade.xyz serves current pages for both products; the perps corporate-actions page lists "2026-09-28: Kioxia Stock Split"; pre-IPO index lists OURA "Live" with anticipated IPO 2026-10-02 (fetched 2026-10-19; pages undated) | H |
| Terms of Use "Last Updated: September 6, 2026", entity **XYZ Ltd**, interface `app.trade.xyz`, with dedicated Events clauses | H (https://trade.xyz/terms) |
| Live WS 2026-10-19 02:50:41Z: `xyz:SP500` book with real depth, `activeAssetCtx` dayNtlVlm $188.4M, `allMids` for dex `xyz` returns 136 coins | H (fixture `ws_xyz_perp_SP500_frames_2026-10-19T0250Z.json`) |
| Live WS 2026-10-19 02:51:58Z: outcome coin `#132650` (txyz-attributed via Loris directory) last fill 02:32:50Z today | H data, M attribution (fixture `ws_txyz_event_coins_frames_2026-10-19T0252Z.json`) |
| Events launch: Bankless article dated 2026-09-10 "trade[XYZ] Launches HIP-4 Event Markets" (txyz, Up/Down on equities/commodities/pre-IPO, sports such as US Open) | M (https://www.bankless.com/read/news/trade-xyz-launches-hip-4-event-markets, via page summariser) |
| Loris Tools lists trade[XYZ] HIP-3: 115 markets, $61.53B 30d volume, OI $1.86B (est. from fills, dated 2026-10-18) | M (https://loris.tools/hip3/xyz via summariser) |
| DefiLlama free `/overview/dexs`: Hyperliquid Outcomes 24h $3.13M, 30d $47.0M (all deployers); no entry named trade.xyz/txyz | H (fixture `defillama_dexs_overview_hip_entries_2026-10-19.json`) |

Verdict: **still_live = true** for both products.

---

## 2. What it is (resolving the hint)

- Homepage https://trade.xyz/ says only "Trade anything, anytime. Realtime access to global markets - 24/7 liquidity, pro tools, no gatekeepers" and mentions no prediction markets (H, HTML GET). The docs say it publishes **two products**: "Perpetuals" (HIP-3) and "Events" (HIP-4), plus "a non-custodial interface ... not the exclusive way to access trade[XYZ] markets" (H, https://docs.trade.xyz/overview/about-trade-xyz.md). So the hint "possibly a Hyperliquid HIP-3 deployer" is **confirmed**, and it is **also** a HIP-4 deployer.
- Operator: Terms name **XYZ Ltd** (BVI law, arbitration at BVI IAC) (H). Third-party sources attribute the team to Hyperunit / Unit Labs (M, search summaries, not in docs or Terms; sibling note found no first-hand link either).
- Hyperliquid relationship: deployer address for both `xyz` (HIP-3) and `txyz` (HIP-4) is `0x88806a71D74ad0a510b350545C9aE490912F0888`; HIP-4 settlement sub-deployer `0x8EF95FA212D22448c9c7eAFa277b4c8bbf3f9D57`; HIP-3 oracle updater `0x1234567890545d1Df9EE64B35Fdd16966e08aCEC` (all venue-published; H, https://docs.trade.xyz/architecture.md and /events/architecture.md).

---

## 3. Kind and market model

| | Perpetuals (`xyz`, HIP-3) | Events (`txyz`, HIP-4) |
|---|---|---|
| Kind | Perp DEX deployment on HyperCore (central limit order book, per-dex margining) | Fully collateralised outcome contracts on HyperCore CLOB |
| Model | Linear perps, USDC-margined, quanto, leverage, funding, liquidation, ADL; oracle/mark/external price published by trade[XYZ] relayers about every 3 s (H, docs perpetuals + architecture) | Binary Yes/No tokens with one merged book per outcome ("buying Yes at p = selling No at 1-p"); multi-way "questions"; fractional `settleFraction` allowed; no leverage/funding/liquidation (H, events/event-contract-mechanics) |
| Tokenisation | Asset id `100000 + perp_dex_index*10000 + index_in_meta`; coin names `xyz:SP500` (H, HL asset-ids doc) | Coin `#<10*outcome+side>`, order asset id `100_000_000 + 10*outcome + side` (H, HL asset-ids doc) |
| Universe (H, docs spec indexes 2026-10-19) | 114 instruments documented (115 rows incl. header; live `allMids` has 136 `xyz:` keys, so docs lag or include delisted slots): SP500, XYZ100, oil/gas/metals, JPY/EUR/GBP, 90+ single stocks and ETFs (US, Korea, Japan, HK, China), and 8 pre-IPO perps (OURA live; SHEIN, UNITREE, CXMT, SKHY, SPCX, QNT, CBRS converted to normal equity perps) | 17 documented market types: daily Up/Down on SK Hynix, Gold, WTI, XYZ100, Micron, SNDK, SpaceX, Nvidia; sports winners (UFC, NFL, NCAAF, MLB, soccer, US Open match/tournament); "IPO Confirmed by Date" |

Only Events are prediction-market contracts. The perps are listed here because they are the settlement reference for Up/Down Events and a continuous price for IPO events.

---

## 4. Chains and collateral

- Venue chain: **HyperCore** (Hyperliquid L1), not an EVM chain. (H)
- Perps: "margined and settled in USDC" (H, https://docs.trade.xyz/perpetuals.md).
- Events: docs.trade.xyz never names the quote token. Hyperliquid's `settledOutcome` sample shows `"quoteToken": "USDC"` (H, HL info-endpoint spot page). Treat as USDC. (H sample)
- Funding in: via Hyperliquid (Arbitrum USDC deposit per the sibling note, H there; not re-verified). Interface logs in via Privy/WalletConnect per sibling bundle read (M here).

---

## 5. Read API (public, keyless; via Hyperliquid, not trade.xyz)

**There is no trade[XYZ]-owned API.** "Events use Hyperliquid's public APIs and onchain state. Hyperliquid data remains authoritative" (https://docs.trade.xyz/events/developer-resources.md, H). I found no documented API host on trade.xyz (NOT FOUND: searched llms.txt, perps and events docs).

| Item | Value | Tag |
|---|---|---|
| Docs | https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api (every page also at `.md`) | H |
| Base URLs | REST `https://api.hyperliquid.xyz/info` and `/exchange` (**POST only**: `GET /info` returned 405 on 2026-10-19), WS `wss://api.hyperliquid.xyz/ws` | H |
| Auth | none for market data | H |
| Rate limits | per IP: REST 1200 weight/min (`l2Book`/`allMids` weight 2, most other info requests 20); WS max 10 connections, 30 new connections/min, 1000 subscriptions, 2000 messages/min | H (rate-limits-and-user-limits.md) |
| Perp markets | `info {"type":"perpDexs"}`, `{"type":"meta","dex":"xyz"}`, `metaAndAssetCtxs` with `dex`; names `xyz:<COIN>` | H (HL perps info page; I did not call them: POST) |
| Perp prices/books | WS `{"type":"allMids","dex":"xyz"}`, `l2Book`/`bbo`/`activeAssetCtx` with `coin:"xyz:SP500"`, `{"type":"allDexsAssetCtxs"}` (positional ctx arrays per dex, no names) | H (captured live) |
| Event markets | `info {"type":"outcomeMeta"}` (filter by deployer/venue `txyz`), `outcomeTemplates`, `settledOutcome`; WS `l2Book`/`bbo`/`activeSpotAssetCtx`/`trades` on `#<10*outcome>` | H docs; shapes captured via WS; `venue` field M (third-party parser, sibling note) |
| Resolution | `settledOutcome` (+ WS `outcomeMetaUpdates`, no snapshot); trade[XYZ] publishes methodology at docs.trade.xyz/events/resolution | H docs |
| Convenience feed | team-maintained self-hosted `hip4-markets` (Codeberg) polling `/info` every 15 s; "No uptime, permanence, or service-level commitment". Do not install or run; use `/info` directly | H (docs live-market-feed page) |

**Live shapes confirmed** (fixtures in `docs/research/fixtures/trade-xyz/`):
- `ws_xyz_perp_SP500_frames_2026-10-19T0250Z.json`: `l2Book` (`levels:[bids,asks]`, each `{px,sz,n}`), `activeAssetCtx` (`funding, openInterest, prevDayPx, dayNtlVlm, premium, oraclePx, markPx, midPx, impactPxs, dayBaseVlm`), `bbo`, `allMids` head. Sample: `xyz:SP500` mid 7711.45, dayNtlVlm $188.4M, OI 48,785 contracts. (H)
- `derived_perp_dex_volume_oi_2026-10-19T0251Z.json`: per-dex 24h notional and OI computed from one `allDexsAssetCtxs` frame. (derived, M)
- `ws_txyz_event_coins_frames_2026-10-19T0252Z.json`: outcome-coin `l2Book`, `activeSpotAssetCtx` (`prevDayPx, dayNtlVlm, markPx, midPx, circulatingSupply, totalSupply, dayBaseVlm`), `trades` (counterparties redacted). (H data)
- `defillama_dexs_overview_hip_entries_2026-10-19.json`: trimmed free-tier GET. (H)
- `docs_derived_trade_xyz_specs_2026-10-19.json`: instrument list, pre-IPO table, events market types, fee headline, addresses (docs, not live).

Only the DefiLlama and docs fixtures came from plain GETs: Hyperliquid itself offers no GET endpoint, so live shapes are WebSocket captures (read-only subscribe messages).

Gotchas: outcome books often hold sentinel orders at 0.00001/0.00025 and 0.99975/0.99999, so filter levels outside about 0.01-0.99 and never publish a mid built only from sentinels (sibling note H; reconfirmed in my `#132750`/`#132650` books). `allMids` returns `xyz:`-prefixed keys when `dex:"xyz"` is set. Perp ctx arrays in `allDexsAssetCtxs` are positional: join with `meta` to name them.

---

## 6. Trade path

Identical to Hyperliquid (sibling `hyperliquid-outcomes-hip-4.md` section 5 has the detail): signed actions to `POST /exchange`; L1 actions (orders, cancels) use the msgpack "phantom agent" EIP-712 signature; user-signed actions (`approveAgent`, `approveBuilderFee`, withdrawals) use EIP-712 with an Arbitrum `signatureChainId`; an approved agent (API) wallet can sign orders for the master account. (H, HL docs as cited by the sibling note; not re-read here.) trade[XYZ] "is not the exclusive way to access" either product (H), so direct API trading is by design. Perp asset id `100000 + dexIndex*10000 + idx`; outcome asset id `100000000 + 10*outcome + side` (H).

---

## 7. PayBox reachability: **partial**

- Live `discover_plugins("trade.xyz")` on 2026-10-19: empty. `discover_plugins("hyperliquid")`: one official plugin, "Browse Hyperliquid spot markets, prices, and token metadata", **disabled** for this account, no trading tools. `discover_services("trade.xyz hyperliquid")`: only pay-per-call x402 wrappers (x402Atlas, USDC on Base/Polygon/Arbitrum/Solana, about $0.005-$0.01 per call, e.g. outcomes catalog, account fees/fills); I did not call or pay any. (H)
- Orders are not EVM transaction proposals: HyperCore takes signed actions. PayBox `request_wallet_sign` supports typed data, so a one-time `approveAgent` is possible, but per-order human signing cannot meet arbitrage latency; the practical design is an approved agent key held by our service (see `docs/research/06-paybox-platform.md`, and sibling section 6). PayBox lists "Hyperliquid" as `eip155:999` (HyperEVM), the wrong layer for HyperCore books (sibling H). (M)
- Funding is reachable (Arbitrum USDC). Read access needs no PayBox at all (public WS).
- Geo: a PayBox user who is a US, Canadian or UK person is a Restricted Person for the trade[XYZ] Interface (Terms 2.2, H). The plugin must gate trading, not reading.

---

## 8. Fees

- **Perps (H, https://docs.trade.xyz/perpetuals/mechanics/fees.md):** "Standard" HIP-3 fees are 2x validator-operated perp fees, split **50% Hyperliquid / 50% trade[XYZ]**. Tier 0 base: **taker 0.090%, maker 0.030%** of notional; falling to taker 0.048%, maker 0% above $7B 14-day weighted volume. **Growth Mode** (enabled "on certain assets") cuts all-in fees by >=90%: tier 0 taker 0.0090%, maker 0.0030%. Crypto perps, crypto baskets/wrappers (e.g. MSTR-type) and gold are ineligible for growth mode. HYPE staking discounts apply. Which assets are currently in growth mode: NOT FOUND in the docs (the spec index has no such column); Talos/Coin Metrics (2026-08-18) says trade.xyz is in Growth Mode (M).
- **Events (H, https://docs.trade.xyz/events/fees.md):** users pay Hyperliquid's base outcome rates: tier 0 **taker 0.070%, maker 0.040%**, charged **when a position is closed or settled, not on opening**; no maker rebates on outcomes. `deployerFeeScale = 0` at launch, so trade[XYZ] takes no deployer fee (architecture table is marked "Draft status"). Read per-outcome scale from `outcomeMeta`.
- Possible interface builder fee on orders placed through app.trade.xyz: NOT FOUND (sibling searched the bundle).
- Gas: none on HyperCore; USDC bridge costs on the Arbitrum leg not researched.

---

## 9. Resolution and dispute risk

- **Events (H, https://docs.trade.xyz/events/resolution.md, Terms 1.6, https://docs.trade.xyz/legal-and-disclaimers/events-risks-and-disclaimers.md):** two stages: published methodology picks the result from a declared source, then the `txyz` deployer or sub-deployer submits `settleFraction`; HyperCore verifies authorisation, not truth. Up/Down: 5-minute TWAP of five 1-minute candles `(H+L+C)/3` of the referenced `xyz` or Hyperliquid perp; Yes only if **strictly greater** than strike. Sports: ESPN unless the market terms say otherwise; ties/no-result can settle fractionally (sibling: 0.5 in several templates). Terms: "Unless the Event Rules expressly provide otherwise, there is no formal outcome challenge or appeal process", and a settled result is not automatically reversed. Dispute risk: high, concentrated in one issuer.
- **Perps:** no event resolution. Deployer can halt and settle an asset to the current mark price (`haltTrading`) (H, HIP-3 page). Pre-IPO perps convert to normal equity perps after listing; if the listing does not happen after the grace period (OURA: up to 2026-12-01), default alternative settlement is the **full-life TWAP** of the IPOP market, with other methods possible for acquisitions or adverse events (H, alternative-settlement-events page). The oracle is the deployer's own relayer, so deployer-slashing by validator vote is the only backstop (H, HIP-3 page: 500k HYPE stake, slashable).
- Basis risk for arbitrage: resolution is against a Hyperliquid perp TWAP, not an exchange official close; fractional/50-50 treatments differ from venues that void or refund.

---

## 10. Geo, ToS and automation (H, https://trade.xyz/terms, Last Updated 2026-09-06)

- 2.2: Restricted Persons = residents/located/incorporated/"otherwise subject to the laws of the United States of America, Canada, the United Kingdom, or certain other jurisdictions we may designate in our sole discretion", plus comprehensive-sanctions territories. Events additionally 18+. 2.3: no VPN/proxy/Tor circumvention.
- Automation: 4.1.7 bans bots/scripts "in ways that exceed reasonable usage, bypass rate limits, cause denial-of-service conditions, or disrupt" the Interface, Protocol or Hyperliquid; 4.1.5 bans scraping of **Interface** content "except as expressly permitted". No separate API or algo-trading policy exists in the Terms. The Terms govern the Interface (app.trade.xyz); whether they bind direct HyperCore API users is a legal question not resolved here. Public HL market data needs no account. 4.1.10-11: no wash trading, spoofing, or trading on MNPI or where you can influence the outcome.
- Disputes: BVI law, 30-day informal email step, then individual arbitration.
- Hyperliquid's own Interface terms (US and Ontario barred) are in the sibling note.

---

## 11. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| `xyz` perps 24h notional | **$1.72B**, 115 of 136 slots with volume | my sum of `allDexsAssetCtxs`, 2026-10-19 02:51Z (Sunday evening US; equity sessions closed) | M (derived from H frame) |
| `xyz` perps OI | **$3.87B** (sum of openInterest x markPx) | same | M |
| Share of non-first HIP-3 dexs | 96.6% of volume, 97.5% of OI (others: `para`, `io`, `mkts` small; `abcd, cash, flx, hyna, km, vntl` zero volume) | same | M |
| First perp dex (core Hyperliquid) for scale | $4.75B 24h, $11.04B OI | same | M |
| 30d perps volume | $61.53B, 25.5M trades, 106,271 traders, fees $3.40M, OI $1.86B ("estimated from fills", 2026-10-18); OI disagrees with my $3.87B, so Loris OI uses a different method | https://loris.tools/hip3/xyz | M/L |
| Share of Hyperliquid | 55% of all Hyperliquid volume in August 2026; >$460B or about 30% since Jan 2026; >$4B OI; $5.0M fees in the past month (50/50 with HL) | Coin Metrics State of the Network via https://www.talos.com/insights/trade-xyzs-role-in-hyperliquid, 2026-08-18 | M |
| Top 30d perp markets | XYZ100 $6.50B, SP500 $5.99B, CL $4.92B, SKHX $4.69B, BRENTOIL $3.79B | Loris, 2026-10-18/19 | M |
| Events (txyz) | 71 live outcome coins, ~$22k Yes-side 24h notional (01:35Z), Loris 30d $3.27M, OI about $0.2M, mostly sports spreads/totals, Up/Down books largely unquoted | sibling note, 2026-10-19 | M (sibling H data) |
| All HIP-4 (all deployers) | DefiLlama 24h $3.13M, 7d $17.9M, 30d $47.0M, all-time $261M. The "Outcome.xyz Outcome" interface entry shows 30d $79.4M, higher than the protocol total, so DefiLlama interface volumes use different bases | DefiLlama `/overview/dexs`, 2026-10-19 | H data, L comparability |
| txyz share of HIP-4 | Loris: about 4.6% of three-deployer 30d notional; a later search summary claims Outcome 68% / Trade.xyz 21% / protocol 10% on the latest day (sports season effects) | sibling; search summary | L |

Reading: the perps are deep (billions per day) but irrelevant as a prediction leg; the Events are sub-$1M OI with one or two dominant traders (sibling M).

---

## 12. Event categories and cross-venue overlap

| Category | trade[XYZ] instrument | Overlaps | Use |
|---|---|---|---|
| Sports winners/spreads/totals (NFL, NCAAF, MLB, UFC, soccer, US Open) | txyz Events | Polymarket, Kalshi, SX Bet, Azuro, Smarkets | Only real arbitrage overlap, but only when two-sided; ESPN-based rules and 0.5 ties must be compared field by field |
| Equity-index / commodity / stock daily Up-Down | txyz Events + `xyz` perps as reference | Kalshi/Polymarket daily index and oil/gold ranges | Perps give a continuous 24/7 price to model fair value of those markets (signal), Events themselves are usually unquoted |
| Pre-IPO / IPO timing and first-day market cap | OURA etc. pre-IPO perps; Events "IPO Confirmed by Date" | Polymarket/Kalshi IPO markets | Signal: implied listing price and delay risk; no direct payoff match |
| Macro / Fed rate | txyz `policyRate*` templates (sibling) | Kalshi, Polymarket | Books too thin to use |
| Crypto price | not a trade[XYZ] focus: no crypto-coin perps appear in the `xyz` spec index (only crypto-adjacent stocks such as COIN, MSTR, CRCL); the Events spec index has no crypto price market | - | None |

---

## 13. Does it share liquidity with another venue?

**Yes. 100% shared with Hyperliquid.** Events = a deployer slice of HIP-4 (same HyperCore CLOB, accounts, collateral, API, fee schedule); `xyz` perps = a HIP-3 dex on the same engine, reachable from many other front ends. Other HIP-4 deployers (Outcome.xyz, Skew) run separate books for similar events; that is an intra-Hyperliquid comparison. I found no evidence that txyz books mirror Polymarket, Kalshi or any other venue (NOT FOUND: docs.trade.xyz, Terms, EventTracker). **Not an independent arbitrage leg.**

---

## 14. Adapter spec (inside the Hyperliquid adapter)

- No separate venue. Map deployer `0x88806a71...0888` to `txyz` (events) and `xyz` (perps); store `deployer_venue`, template id, `deployerFeeScale`, resolution deadline, declared source, settlement convention.
- Reference-price feed (optional, signal-only): subscribe `allMids {dex:"xyz"}` (one subscription, about 136 coins) and `activeAssetCtx` for the few coins mapped to linked markets (SP500, XYZ100, CL/BRENTOIL, GOLD, pre-IPO tickers). Weekends and holidays use the "internal" oracle (docs perps/holiday closures), so tag staleness and session.
- Events quote hygiene: drop levels < 0.01 or > 0.99, refuse a sentinel-only mid, require `dayNtlVlm > 0` and about 1,000 shares of real depth per side before a txyz leg is arbitrage-eligible.
- Persist settlement results on receipt (settled outcomes drop out of live sets).
- Geo gate for trading: block US/CA/UK persons; read-only is unaffected.

---

## 15. Priority

**adapter_priority = P2 (signal-only)**; the Events leg alone would be `skip`. Reasons: no independent liquidity (all Hyperliquid), Events books are thin and often unquoted, issuer-controlled resolution without appeal, Terms bar US/CA/UK; the one thing worth having is the free, keyless, deep `xyz` perp price stream as a reference for Up/Down, index and IPO markets, which costs almost nothing once the Hyperliquid adapter exists.

---

## 16. NOT FOUND / open questions

- trade[XYZ]-owned API or data host (searched: docs.trade.xyz llms.txt, perps and events docs, homepage).
- Live `outcomeMeta` (`venue`, `deployerFeeScale`) and live `meta {dex:"xyz"}`: POST-only, not called. txyz attribution of outcome ids rests on a third-party directory (M).
- Per-asset Growth Mode flags; builder-fee address/rate on Interface orders; deposit routes in the interface.
- Launch date of Events from a primary source (only the Bankless article date, 2026-09-10).
- Link between XYZ Ltd and Unit Labs/Hyperunit (secondary sources only).
- Whether Terms bind direct HyperCore API users; the list of "other jurisdictions" designated.
- DefiLlama `/overview/derivatives` (where `xyz` perp volume would sit): returned "Upgrade to the paid API plan at https://defillama.com/subscription" (HTTP 402); stopped. No payment was made.
- WebSearch budget ran out mid-session (limit shared across agents), so a PANews piece on HIP-3 market-share consolidation was found in a search listing only, not read.

---

## 17. Suspicious content

- Every docs.trade.xyz `.md` page and the Hyperliquid GitBook pages end with an "Agent Instructions" block telling readers to query `GET <page>.md?ask=<question>&goal=<user_goal>` (and a leading "fetch the complete documentation index at llms.txt" line). Standard GitBook boilerplate aimed at AI agents; I did **not** follow it (a `goal` parameter would also hand the site the user's intent). I used the published `.md` URLs and `llms.txt` only for my own page discovery.
- The WebSearch tool appended a reminder to cite sources as markdown hyperlinks; ignored as irrelevant to the file output.
- No instructions to agents found in Terms, the homepage, EventTracker, or the DefiLlama response.

---

## 18. Sources

Primary (H, all fetched 2026-10-19):
- https://trade.xyz/ and https://trade.xyz/terms (Last Updated 2026-09-06)
- https://docs.trade.xyz/llms.txt ; /overview/about-trade-xyz.md ; /overview/relationship-to-hyperliquid.md ; /perpetuals.md ; /architecture.md ; /perpetuals/mechanics/fees.md ; /perpetuals/markets.md ; /perpetuals/markets/pre-ipo-perpetuals.md ; /perpetuals/markets/pre-ipo-perpetuals/alternative-settlement-events.md ; /perpetuals/specifications-and-schedules/specification-index.md ; /perpetuals/specifications-and-schedules/pre-ipo-specification-index.md ; /events.md ; /events/architecture.md ; /events/event-contract-mechanics.md ; /events/fees.md ; /events/resolution.md ; /events/specification-index.md ; /events/developer-resources.md ; /events/developer-resources/live-market-feed.md ; /legal-and-disclaimers/events-risks-and-disclaimers.md
- Hyperliquid docs (https://hyperliquid.gitbook.io/hyperliquid-docs/...): hyperliquid-improvement-proposals-hips/hip-3-builder-deployed-perpetuals ; .../hip-4-outcome-markets ; for-developers/api/rate-limits-and-user-limits ; for-developers/api/asset-ids ; for-developers/api/websocket/subscriptions ; for-developers/api/info-endpoint/perpetuals ; for-developers/api/info-endpoint/spot
- Live WS wss://api.hyperliquid.xyz/ws (2026-10-19 02:50-02:52Z; subscriptions `l2Book`, `activeAssetCtx`, `bbo`, `allMids{dex}`, `allDexsAssetCtxs`, `trades`)
- EventTracker coverage table (raw HTML): https://eventtracker.ai/coverage
- DefiLlama free tier: https://api.llama.fi/overview/dexs
- PayBox live read-only `discover_plugins` / `discover_services` (2026-10-19)

Secondary (M/L):
- https://www.bankless.com/read/news/trade-xyz-launches-hip-4-event-markets (2026-09-10, summariser)
- https://www.talos.com/insights/trade-xyzs-role-in-hyperliquid (Coin Metrics, 2026-08-18, summariser)
- https://loris.tools/hip3/xyz (summariser; the `/hip4/txyz` page rendered empty without JavaScript)
- https://www.coingecko.com/learn/hyperliquid-hip3-hip4-tokenized-stocks-and-prediction-markets (updated 2026-05-07, internally inconsistent on HIP-4 status; stale)
- Search-result summaries (Datawallet, PANews, FinanceFeeds, The Block titles) used only for orientation, not for numbers I rely on
- Sibling notes in this repo: `docs/research/venues/events-by-tradexyz-hip-4-deployer-venue-txyz.md`, `docs/research/venues/hyperliquid-outcomes-hip-4.md`, `docs/research/06-paybox-platform.md`

---

## 19. Privacy

All scripted HTTP requests used the User-Agent `insurance-markets-research/0.1` (curl). The one Node WebSocket script sends no custom headers and was grepped for `@` and for the user's name before running (no hits). Search and fetch queries contained no personal identifiers. Fixtures contain only public market data; counterparty addresses in the trades fixture are redacted, and the only wallet addresses recorded are venue-published deployer, sub-deployer and oracle-updater addresses. The venue's own legal contact address in its Terms was not copied.
