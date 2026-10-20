# Drift BET (Solana) - adapter spec

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, unauthenticated GETs (generic User-Agent `insurance-markets-research/0.1`), `gh api` raw file reads of public repos. No account, no wallet, no signing, no POST/PUT/DELETE, no PayBox tools. No third-party code cloned or run. WebSearch budget ran out mid-session, so the search leg is thin (one extended search done early); the verdict rests on first-party Drift pages, Drift's own GitHub, and DefiLlama.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/drift-bet/` (3 files, each < 3 KB).

## 0. Verdict

**adapter_priority: skip. Drift BET is dead (H).** Do not build an adapter.

1. **Drift was exploited on 2026-04-01 (about $295M) and core functions were suspended** (H, Drift's own update posts, section 1). DefiLlama TVL fell from $318.6M (2026-03-26) to $6.2M (2026-04-09) to a flat $0.64M since 2026-07 (H, fixture).
2. **The BET product specifically was already dormant before that.** The `app.drift.trade` shell still embeds the BET config, and it lists only 15 mainnet BET markets, the newest being index 68 (NBA Finals 2025 series; resolution date 2025-02-13), while perp indexes continue to 85 (BP-PERP, launched 2026-03-25). No BET market was added after the early-2025 batch (H for the config, M for the inference "dormant"; fixture `app_drift_trade_embedded_prediction_markets.json`).
3. **The successor protocol has removed prediction markets.** Velocity (`app.velocity.exchange`, `docs.velocity.exchange`) is a fork of Drift v2 at SDK 2.163.0-beta.0 with a new program ID; its migration guide says "The Drift program is paused", and `initialize_prediction_market` is removed and `ContractType.PREDICTION` became `DEPRECATED_PREDICTION` (H). Velocity's app config lists only perps (SOL, BTC, ETH, HYPE, ZEC) (H).
4. **The old API hosts are gone.** `data.api.drift.trade`, `mainnet-beta.api.drift.trade`, `dlob.drift.trade`, `gateway.drift.trade` do not resolve (H, fixture `host_probe.txt`). `docs.drift.trade` 307-redirects to `docs.velocity.exchange` (H).
5. Even when live, BET was thin (about $310K open interest at launch, M) and was an election/sports/novelty book with no public market-data API of its own, so it would never have been a P0 leg.

The CryptoAdventure lead (Drift BET "launched on Solana in Aug 2024") is true historically, but the "status unknown" is now resolved: **not live**.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Exploit | "The exploit occurred on April 1, 2026"; stolen assets about $295.7M (JLP about $159.3M, USDC about $71.4M, cbBTC about $11.3M); "Drift is undergoing a full protocol reboot". Source: https://www.drift.trade/updates/incident-recovery-update-april-16-2026-now | H |
| Attribution / suspension | Post of 2026-05-05: DPRK-affiliated actor confirmed by Mandiant; Drift "temporarily suspended all core protocol functions including trading and borrowing"; relaunch aimed at Q2 2026 as "a leaner, perps-native exchange"; new program at a fresh address, USDT as primary stablecoin, "Earn products ... will be removed". Source: https://www.drift.trade/updates/recovery-plan-for-affected-users | H |
| Relaunch framing | Post of 2026-06-04: "Drift will relaunch as the largest USDT-based perpetual exchange on Solana". Prediction markets/BET not mentioned in any of the three posts. Source: https://www.drift.trade/updates/drift-recovery-update-june-3-2026 | H |
| Recovery token | Post of 2026-10-01: DFX recovery token (299.5M supply, one per verified USDT lost), pool funded from "Velocity's Net Protocol Revenue"; claim window closes 2028-01-01. The post does not explain the Drift/Velocity relationship. Source: https://www.drift.trade/updates/dfx-claim-and-redemptions | H |
| Drift -> Velocity | `drift-labs/protocol-v2` now redirects to `velocity-exchange/protocol-v2`, archived, last push 2026-07-08; commit 2026-06-23 "chore: rename drift-labs GitHub URLs to velocity-exchange"; ~20 Drift repos archived (driftpy, drift-rs, dlob-server, keeper-bots-v2, v2-teacher, ...). Velocity docs: "Velocity is a fork of Drift Protocol v2"; "The Drift program is paused ... no onchain state carries over". That Velocity is the Drift team's relaunch is **inferred** from the repo rename, the shared quote-asset (USDT) plan, and the DFX post tying Velocity revenue to Drift's recovery pool; no page states it outright. | H (facts), M (same-team inference) |
| TVL | DefiLlama `drift-trade`: $318.6M (2026-03-26) -> $6.24M (2026-04-09) -> $0.64M flat from 2026-07 to 2026-10-18 (daily values 642.4K-642.6K, i.e. a frozen residual). Source: `https://api.llama.fi/protocol/drift-trade`, fixture `defillama_drift_trade_tvl_and_hacks.json` | H |
| DefiLlama hack record | 2026-04-01, "Access Control / Proxy Upgrade Hijack", $295M, returned funds null. Same endpoint. (Earlier record: 2022-05, $14.5M, fully returned.) | H |
| `app.drift.trade` | Returns HTTP 200 but only the static Next.js shell (title "Drift", description "On-Chain Perpetual & Spot Trading with Leverage"); no banner text in the HTML; markets/prices load client-side from the now-dead API hosts. A 200 here is **not** evidence the product trades. | H |
| `drift.trade` homepage | Still shows marketing numbers ($826B deposits, $50B+ volume, 19.2M trades); no notice text visible to the fetch tool. | H (L value: stale marketing) |
| Third-party review | predictionmarketsindex.com "Drift BET review" (last reviewed 2026-06-28) still describes BET as live with a fee schedule "last updated 23 June 2026"; it gives no volume/OI and no API. Contradicts the first-party posts, so treat as unreliable/stale. | M/L |

## 2. What it was (historical, for the record)

- **Kind**: onchain-other, Solana. A feature of Drift v2 perps, not a separate protocol. Launched Aug 2024 with US-election markets (M: CoinMarketCap/CryptoSlate/Bitget coverage; the on-chain first BET index 36 has `launchTs` 2024-08-18 in the app config, H).
- **Market model (H, Drift's own v2 API docs, archived repo)**: "Prediction Markets are Perp Markets with the `contract_type` set as `Prediction`", with extra constraints: prices between 0 and 1; funding paused; margin ratios set to 1 so positions are fully collateralised; the margin system values shorts at `1 - oracle price`; they use prelaunch oracles (oracle price = mark TWAP). Source: `velocity-exchange/v2-teacher` `source/includes/_prediction_markets.md` (the renamed `drift-labs/v2-teacher`).
- **Binary only, one market per outcome.** "YES" = long the market, "NO" = short it. There are no outcome tokens: positions are signed base-asset amounts on a Drift `User` subaccount, not transferable SPL tokens. Examples of the 15 mainnet BET markets: `TRUMP-WIN-2024-BET`, `FED-CUT-50-SEPT-2024-BET`, `SUPERBOWL-LIX-LIONS-BET`, `NBAFINALS25-OKC-BET` (fixture).
- **Execution**: Drift's hybrid DLOB (keepers + JIT auctions + market-maker liquidity), shared with the perp book. Not an AMM and not parimutuel.
- **Collateral/chain**: Solana mainnet; cross-margin with 30+ collateral assets (M), USDC quote (pre-exploit). Successor Velocity quotes in USDT.

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Drift Data API `https://data.api.drift.trade` | DNS: CNAME to CloudFront but no address record; `curl` "Could not resolve host". Dead. | H |
| Drift DLOB `https://dlob.drift.trade` (+ `wss://dlob.drift.trade/ws`), gateway `mainnet-beta.api.drift.trade` | Do not resolve. Dead. | H |
| Drift docs `https://docs.drift.trade` | 307 redirect to `docs.velocity.exchange`. | H |
| Drift SDK repos (TS SDK lives in protocol-v2, plus driftpy, drift-rs, dlob-server, events-publisher) | GitHub repos archived 2026-06/07 (the npm package status was not checked). | H |
| On-chain (old Drift program `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH`) | Paused per Velocity migration guide; I did not query RPC (JSON-RPC is POST, outside this run's rules). | H (program id and "paused" text) |
| Successor `https://dlob.velocity.exchange/l2?marketName=SOL-PERP&depth=2` | Public GET, 200, returns a perp L2 book (`bids/asks/marketName/marketType/oracle/slot`). **Perps only; no prediction markets exist on Velocity.** Not useful for a prediction-market scanner. | H |

Nothing to fixture from a live BET API. Saved instead: embedded market config, DefiLlama TVL/hack record, host probe.

## 4. Trade path, PayBox reachability

- Historically: Solana transactions signed by an ed25519 key against the Drift program (SDK `DriftClient.placePerpOrder`; also a Swift off-chain order API for makers). Not EVM; an EVM PayBox wallet could not sign these. A PayBox Solana wallet could in principle have been used through a Solana plugin, but this is moot because the program is paused and the BET markets are gone.
- **paybox_reachable: no** (dead venue).

## 5. Fees, resolution, geo/ToS

- **Fees (L/M)**: only a secondary June 2026 review gives numbers (entry-tier taker 0.0350% of notional, maker rebate 0.0025%, tiered by 30-day volume; Solana network fees extra). Not verified at a Drift primary source, and the venue is paused, so do not rely on it. Drift's own docs host now redirects to Velocity.
- **Resolution (M)**: per the same review, an elected security-council multisig under Drift realms governance initialised markets and acted as resolver; at resolution the oracle is fixed to 0 or 1, the market goes reduce-only, positions settle at that price, and a shortfall not covered by fees/insurance can be socialised (a winner can settle below 1). Centralised-resolver dispute risk. Not verified at a primary source.
- **Geo/ToS**: NOT FOUND at a primary source (searched: `www.drift.trade/legal/terms-of-service` returned 404; Velocity terms page grep found no jurisdiction list). Review says Drift terms restrict certain jurisdictions and the US standing is unsettled (M). No automation rule found.

## 6. Liquidity and overlap

- **Liquidity today: effectively zero for BET.** DefiLlama TVL for the whole Drift protocol is $0.64M (2026-10-18) and frozen; BET specifically has no volume or OI source (NOT FOUND; searched: DefiLlama prediction-market category, app config, Drift data API (dead)).
- Historic: about $310K open interest at launch in Aug 2024 (M, secondary news summary); no later figure found.
- **Category overlap (historical only)**: US politics (2024 election, Michigan), Fed decision (Sept 2024 50bp cut), NFL Super Bowl LIX, NBA Finals 2025, F1 race winners/driver championship, one UFC-style fight market. All overlapped Polymarket/Kalshi, and none of those markets are open now. Market list in the fixture.
- **Shared liquidity**: BET shared collateral and the DLOB/market-maker infrastructure with Drift perps (same cross-margin accounts); it did not mirror another venue's book. Moot now.

## 7. If it ever returns

Re-check (cheap) before any build: (1) does `https://app.velocity.exchange` or a relaunched Drift app list a "Prediction" category; (2) is `initialize_prediction_market` back in the Velocity IDL; (3) does `https://api.llama.fi/protocol/drift-trade` show TVL growth; (4) does `data.api.drift.trade` resolve. If BET returns, it would be Solana-only with positions as perp-style subaccount balances (not tokens), a Solana signer rather than an EVM wallet, and a multisig resolver, so it would be at most a P2 signal source.

## 8. Oddities noted (not followed)

- The `drift-labs` GitHub org now hosts unrelated repos (`drift-fork-rehearsal`, `drift-labs.github.io`, created 2026-07-27) whose README talks about a different project's "standing rules" and a `triage.py`; it appears the old org name was reassigned or repurposed. Not an instruction to me, ignored; do not treat `github.com/drift-labs` as Drift's canonical org any more (use `velocity-exchange`).
- `velocity-docs` contains an AI-tooling skill file under `.claude/`; not read, not followed.

## Sources

- https://www.drift.trade/updates/incident-recovery-update-april-16-2026-now (H, 2026-04-16 with 2026-07-07 addendum)
- https://www.drift.trade/updates/recovery-plan-for-affected-users (H, 2026-05-05)
- https://www.drift.trade/updates/drift-recovery-update-june-3-2026 (H, 2026-06-04)
- https://www.drift.trade/updates/dfx-claim-and-redemptions (H, 2026-10-01)
- https://www.drift.trade/updates (H, post index; no BET post)
- https://app.drift.trade/ (H, static shell with embedded BET config; fixture)
- https://docs.drift.trade/ -> https://docs.velocity.exchange/ (H, 307 redirect; Velocity docs home)
- https://github.com/velocity-exchange/velocity-docs, file `content/developers/migrate-from-drift/index.mdx` (H, via `gh api`)
- https://github.com/velocity-exchange/protocol-v2 (formerly drift-labs/protocol-v2; H, archived, commit log via `gh api`)
- https://github.com/velocity-exchange/v2-teacher, file `source/includes/_prediction_markets.md` (H, BET market model)
- https://app.velocity.exchange/ and https://dlob.velocity.exchange/l2?marketName=SOL-PERP&depth=2 (H, perps only)
- https://api.llama.fi/protocol/drift-trade (H, TVL and hack record; fixture)
- https://predictionmarketsindex.com/platforms/drift-bet/ (M/L, review dated 2026-06-28, contradicted by first-party posts)
- WebSearch summary citing CoinMarketCap Academy, CryptoSlate, Bitget, Delphi Digital on the Aug 2024 launch (M): https://coinmarketcap.com/academy/article/solana-based-drift-protocol-launches-bet-prediction-market-challenging-polymarket , https://cryptoslate.com/drifts-bet-platform-brings-prediction-markets-to-solana-blockchain/ (not opened first-hand)
- Lead from discovery: https://cryptoadventure.com/community/articles/top-crypto-prediction-market-platforms/ (not re-read)

## NOT FOUND

- Any BET-specific volume/OI after Aug 2024 (searched: DefiLlama protocol and hacks endpoints, app config, Drift data API (dead), predictionmarketsindex review).
- Any first-party statement on the fate of BET specifically (searched: all four Drift incident/recovery posts, Velocity docs and migration guide; the only signal is the removal of `initialize_prediction_market`).
- Primary-source Drift terms of service / restricted-jurisdiction list (searched: `www.drift.trade/legal/terms-of-service` 404).
- Direct on-chain confirmation of the Drift program's paused state (JSON-RPC is POST; not run).
- Whether Velocity is formally the same legal entity/team as Drift (only inferred).
