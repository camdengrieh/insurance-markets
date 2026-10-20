# Hyperliquid HIP-4 front-end: PerpFlow - venue spec

Researched 2026-10-19. Read-only: unauthenticated GETs (User-Agent `insurance-markets-research/0.1`), two failed WebFetches, one WebSearch refused (session search budget exhausted). No account, wallet, key, signature, POST, payment or PayBox tool used.

Tags: H = read first-hand this session (URL cited); M = secondary/inferred or taken from an earlier project note; L = weak/stale.

This is a duplicate-subject of `docs/research/venues/perpflow.md` (written earlier today by a parallel step, far more detailed). I re-verified the key liveness and volume facts and otherwise defer to it (facts taken from it are tagged M).

## 0. Bottom line

- PerpFlow is NOT an independent prediction venue. It is a Hyperliquid builder-code attribution entry ("PerpFlow Outcome", category Interface, tag "Hyperliquid HIP4 Builder") (H, https://api.llama.fi/protocol/perpflow-outcome).
- Not demonstrably live: `https://perpflow.xyz/` returned HTTP 522 and `https://app.perpflow.xyz/` HTTP 521 on 2026-10-19 (H, fixture `site_probe_2026-10-19.txt`); WebFetch of the site also 522 (H).
- Lifetime outcome volume routed through it is $232; 24h/7d/30d are 0 (H, https://api.llama.fi/summary/dexs/perpflow-outcome).
- 100% shared liquidity with Hyperliquid HIP-4 books. Never a separate arbitrage leg.
- adapter_priority = skip.

## 1. Still live?

| Evidence | Tag |
|---|---|
| perpflow.xyz 522, app.perpflow.xyz 521 on 2026-10-19 (origin not answering behind Cloudflare) | H |
| DefiLlama listing exists (id 9032, listedAt 1791497932 = 2026-10-08, twitter `perpflow`, module `dummy.js`, no TVL), description "Perpflow provides access to outcome-based prediction markets through Hyperliquid." A listing is not proof of a working product | H |
| totalAllTime $232, 24h/7d/30d 0 | H |
| Earlier note: builder address had no fills after 2026-05-06 while the archive is current to ~2026-10-17 | M (prior note `perpflow.md`) |
| docs./api. subdomains NXDOMAIN; GitHub org `Perpflow` has 0 public repos | M (prior note) |
| x.com/perpflow returned HTTP 402 in the earlier step; I did not retry or pay | M |

Verdict: still_live = false (no working outcome product found). The 522 could be transient; re-probe once before permanently closing.

## 2. Kind and market model

- Kind: broker/front-end via Hyperliquid builder code (H, DefiLlama methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code"). No PerpFlow-owned markets, engine, token or contract found.
- Market model: whatever Hyperliquid HIP-4 provides - fully collateralised outcome contracts on HyperCore's central limit order book, binary/question (categorical)/scalar-capable via settleFraction; outcome sides tokenised as `#<10*outcome+side>` coins and asset id `100000000+enc` (M, from prior note citing https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets). Defer to `hyperliquid-hip-4-outcome-markets.md`.

## 3. Chains and collateral

Hyperliquid L1 / HyperCore only (H, DefiLlama chain). Collateral is Hyperliquid's quote token (USDC per sibling note, M).

## 4. Read API

- PerpFlow's own API: NOT FOUND (searched: perpflow.xyz root, subdomains, GitHub org, DefiLlama metadata).
- Usable data is Hyperliquid's: `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `l2Book`, `allMids`, `recentTrades`), `wss://api.hyperliquid.xyz/ws`, no key, ~1200 weight/min/IP (M, prior note citing Hyperliquid docs). I did not POST, so no live Hyperliquid response shape captured here.
- Public aggregate data confirmed by GET: DefiLlama `https://api.llama.fi/summary/dexs/perpflow-outcome` and `/protocol/perpflow-outcome` (H; fixtures saved).
- Builder attribution archive `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4` (M, prior note; fixture of redacted fills lives in `docs/research/fixtures/perpflow/`).

## 5. Trade path / PayBox

- Via PerpFlow: none (site down, no API).
- Via Hyperliquid directly: EIP-712-signed actions to `/exchange`, optional `builder` field requiring prior `approveBuilderFee` (M, prior note). Signed L1 actions, not EVM transaction proposals, so a PayBox EVM wallet cannot trade via transaction proposals; at best signed-order via a signing tool (not exercised).
- paybox_reachable = no (for PerpFlow as a venue).

## 6. Fees

PerpFlow outcome builder rate: no published schedule (NOT FOUND). Prior note computed 0.1% to 1.0% on sells from 16 fills (M). Hyperliquid's own outcome fees live in the Hyperliquid note; the DefiLlama methodology says fees began after 15 Aug 2026 (M, prior note). Lifetime builder fees $0.28 (M, prior note).

## 7. Resolution

Entirely Hyperliquid's (protocol-settled recurring markets; deployer-settled template markets). PerpFlow has no role. No trader dispute window found (M).

## 8. Geo / ToS / automation

PerpFlow terms: NOT FOUND (site down). Hyperliquid terms (updated 2026-06-15) exclude US and Ontario residents and prohibit abusive automation (M, prior note). Not legal advice.

## 9. Liquidity

| Measure | Value | Date | Source | Tag |
|---|---|---|---|---|
| PerpFlow-routed outcome volume | $232 lifetime, 0 in last 30d | 2026-10-19 | https://api.llama.fi/summary/dexs/perpflow-outcome | H |
| TVL / OI | none | 2026-10-19 | https://api.llama.fi/protocol/perpflow-outcome | H |
| Underlying Hyperliquid HIP-4 | $3.13M 24h (2026-10-18), $17.9M 7d | 2026-10-18 | https://api.llama.fi/summary/dexs/hyperliquid-outcomes | M (prior note) |

## 10. Event coverage / overlap

Same as Hyperliquid HIP-4 (recurring BTC price binaries/buckets overlap crypto-price markets on Polymarket/Kalshi/Limitless). PerpFlow adds no leg.

## Suspicious content

None encountered this session. (Prior note records AI-agent-directed text on Hyperliquid GitBook pages, an x.com 402, and phishing lookalike domains perpflow.com/.org/.live/.app/.net; do not treat as official.)

## NOT FOUND

PerpFlow website content, docs, API, ToS, fee schedule, contracts, repos, press (searched: WebFetch of perpflow.xyz and DefiLlama page (403), curl of both hosts, DefiLlama API; WebSearch unavailable due to exhausted budget).

## Open questions

1. Is perpflow.xyz permanently down? Re-probe.
2. Was an outcome UI ever shipped, or only a builder code used for tests?
3. Is DefiLlama's builder-address attribution correct?

## Sources

- https://defillama.com/protocol/perpflow-outcome (WebFetch 403; used API)
- https://api.llama.fi/protocol/perpflow-outcome, https://api.llama.fi/summary/dexs/perpflow-outcome (H, 2026-10-19)
- https://perpflow.xyz/ and https://app.perpflow.xyz/ (HTTP 522 / 521, H)
- Local: `docs/research/venues/perpflow.md`, `docs/research/venues/hyperliquid-hip-4-outcome-markets.md` (M)
- Fixtures: `docs/research/fixtures/hyperliquid-hip-4-front-end-perpflow/` (site_probe_2026-10-19.txt, defillama_dexs_perpflow-outcome_summary.json, defillama_protocol_perpflow-outcome.json)
