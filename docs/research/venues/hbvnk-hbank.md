# HBVNK (HBANK) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads, static-asset reads, unauthenticated GETs to DefiLlama and the DefiLlama Hyperliquid indexer. No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool used. WebSearch budget was exhausted this session (one attempt, refused), so no web search was done. Third-party text treated as untrusted data.

This note is a re-verified, condensed spec. It builds on the fuller earlier note `docs/research/venues/hbank.md` (same date, other session; its sections 4-10 hold the detailed evidence) and on the native venue note `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`.

Tags: H = read first-hand in a primary source this session (URL cited); M = secondary or inferred; L = weak or stale.

## 0. Bottom line

1. HBVNK/HBANK is a wallet front-end, not a venue. It attaches a Hyperliquid builder code to orders. DefiLlama files "HBANK Outcome" (id 8991) as category Interface, tag "Hyperliquid HIP4 Builder", chain "Hyperliquid L1", no TVL (H, https://api.llama.fi/protocol/hbank-outcome).
2. Liquidity is 100% shared with Hyperliquid HIP-4 outcome books. It is not an independent arbitrage leg. Cover Hyperliquid natively instead.
3. Outcome activity through it is negligible and dormant: all-time $1,533, last non-zero day 2026-07-14, 24h/7d/30d all 0 (H, re-fetched 2026-10-19).
4. No public API of its own.
5. adapter_priority = skip.

## 1. Still live? (2026)

- `https://app.hbank.cash/home/holdings` returns HTTP 200 with `<title>Home | HBVNK</title>` (H, fetched 2026-10-19). The product rebranded from HBANK (earlier a Hedera DeFi app) to HBVNK; DefiLlama still carries the old name and URL.
- Per the earlier note: `/predict` route returns 200 (JS shell), marketing site www.hbvnk.com "Confidential trading on Hyperliquid" with waitlisted mobile app, Terms v1.3.0 effective 2026-09-24 (H, see hbank.md section 1).
- Verdict: still_live = true as a front-end; the outcome function is effectively unused. DefiLlama listing date 2026-10-08 (listedAt 1791497891, computed) reflects the DefiLlama adapter, not product launch (adapter data starts 2026-05-02).

## 2. Kind and market model

- Kind: broker-or-frontend (self-custodial wallet app). Terms s.1/s.6: HBVNK is not an exchange; orders execute through Hyperliquid (H, https://www.hbvnk.com/legal/terms/ as captured in hbank.md).
- Market model: none of its own. Uses Hyperliquid HIP-4: binary Yes/No outcome tokens on a merged on-chain CLOB, fully collateralised, no leverage; asset id encoding `100000000 + 10*outcome + side` (H via app JS and Hyperliquid docs, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets).

## 3. Chains and collateral

HyperCore (Hyperliquid L1), USDC collateral (H for HIP-4 per native note). Funding in the app goes via Arbitrum (chain 42161), HyperLink, MoonPay (H, app JS config). Legacy Hedera pieces are stale (L).

## 4. Read API

- exists = none (for HBVNK). NOT FOUND (searched: hbvnk.com site links; `docs.hbvnk.com` returns Vercel DEPLOYMENT_NOT_FOUND; app JS routes; GitHub org HBANK-Org has only a `.github` profile repo). The app's internal `/api/*` routes are undocumented wallet back-end calls: do not use.
- Market data = Hyperliquid: `wss://api.hyperliquid.xyz/ws` (l2Book, bbo, trades, allMids, outcomeMetaUpdates), `POST https://api.hyperliquid.xyz/info` (outcomeMeta). Details and fixtures: native note and `docs/research/fixtures/hyperliquid-hip-4-outcomes-native/`.
- Attribution telemetry only (not market data): `GET https://hl-indexer.llama.rip/v2/data/builder/0x0ca900e83d99a55206873fbf5b872453b032d970/daily/<YYYY-MM-DD>` (public, keyless; fields builderOutcomeVolumeUsd, builderOutcomeFees etc.) and `https://api.llama.fi/summary/dexs/hbank-outcome` (H). The builder address is public in the app config and DefiLlama adapter, not a user address.

## 5. Trade path

None specific to HBVNK. Orders are signed in-app by the user's wallet (local or Privy embedded) and sent to Hyperliquid `/exchange` with a builder field; builder fee requires prior `approveBuilderFee` by the main wallet (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes). An aggregator trading Hyperliquid directly has no reason to use HBVNK's builder code.

## 6. PayBox reachability

paybox_reachable = no for HBVNK as a distinct venue (no endpoint or contract to call; the app is a closed UI and browser automation is out of scope). The underlying Hyperliquid books are only partially reachable (signed HyperCore actions, not EVM transaction proposals); see the native note section 6. Route any trading via the Hyperliquid adapter.

## 7. Fees

- HBVNK Fee Schedule v2.2.0 (2026-09-24): 2 bps builder fee on eligible orders routed through HyperLink after wallet approval; zero on spot buys (H, https://www.hbvnk.com/legal/fees/). The schedule does not mention outcome markets; outcome-specific fee NOT FOUND (searched: fee page, terms, availability page, app JS; JS constants `DEFAULT_BUILDER_FEE:100` conflict with 2 bps, treat as legacy, L).
- Hyperliquid's own outcome fees: see native note section 7 (not formally documented in numeric form there). Builder fees on outcomes accrue on sell orders only (H, HIP-4 doc).

## 8. Resolution and dispute risk

HBVNK has no role. Settlement is Hyperliquid's (protocol auto-settle for recurring series, validator-voted templates, or deployer-settled markets with no trader dispute window); see native note section 8. No HBVNK-specific resolution risk beyond front-end availability (Terms lets HBVNK suspend interfaces).

## 9. Geo, ToS, automation

- Availability v1.2.0 (2026-09-24): new or increased Perps exposure restricted for US, UK, Belgium, Ontario; silent on outcomes (H, https://www.hbvnk.com/legal/availability/). Hyperliquid's own Terms bar US and Ontario residents for outcome markets (native note, H).
- Terms s.12 prohibit "abusive automation"; no bot/API clause because there is no API.

## 10. Liquidity (dated)

| Metric | Value | Source, date | Tag |
|---|---|---|---|
| HBANK-outcome volume all-time | $1,533, 17 non-zero days 2026-05-27..2026-07-14, peak $894 on 2026-07-14 | https://api.llama.fi/summary/dexs/hbank-outcome, re-fetched 2026-10-19 | H |
| 24h / 7d / 30d | 0 / 0 / 0 | same | H |
| Builder outcome volume 2026-10-17 and 2026-10-18 | 0 (also 0 perps/spot) | hl-indexer, 2026-10-19 | H |
| TVL | none | https://api.llama.fi/protocol/hbank-outcome | H |
| Context: Hyperliquid HIP-4 volume 2026-10-18 | $3.13M | native note, indexer | H |

## 11. Event categories

Whatever Hyperliquid lists (crypto price ladders, sports, macro/central bank etc.; see native note section 11). HBVNK adds no markets or categories of its own. NOT FOUND: any HBVNK-specific market list (the /predict screen is a JS shell; not executed).

## 12. Shared liquidity

Yes, 100% with Hyperliquid HIP-4 (HyperCore books). Never add HBVNK volume to Hyperliquid's; DefiLlama marks it double-counted.

## 13. Adapter spec

No adapter. Optional: none worth building. Do not attach HBVNK's builder code when trading Hyperliquid.

## 14. Priority

skip: dormant front-end, no API, duplicate liquidity, about $1.5k lifetime outcome volume.

## 15. NOT FOUND / open questions

- Which markets `/predict` shows in production, and whether it is enabled.
- Whether the waitlisted mobile app supports outcomes.
- Outcome-specific HBVNK fee and whether geo controls cover outcomes.
- Whether HyperLink supports HIP-4 orders.
- Why outcome volume stopped after 2026-07-14.

## 16. Suspicious content

None aimed at AI agents found. The www.hbvnk.com noscript text ("You can explore this page without JavaScript. Open HBVNK.") is human-facing.

## 17. Sources

- https://app.hbank.cash/home/holdings (title "Home | HBVNK", HTTP 200 on 2026-10-19)
- https://api.llama.fi/protocols ; https://api.llama.fi/protocol/hbank-outcome ; https://api.llama.fi/summary/dexs/hbank-outcome
- https://hl-indexer.llama.rip/v2/data/builder/0x0ca900e83d99a55206873fbf5b872453b032d970/daily/2026-10-18
- https://www.hbvnk.com/legal/terms/ , /legal/fees/ , /legal/availability/ (as captured in earlier note fixtures)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets ; https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes
- Local: `docs/research/venues/hbank.md`, `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`

## 18. Fixtures (docs/research/fixtures/hbvnk-hbank/)

Copied from the earlier hbank fixture set (12 small files: DefiLlama protocol/dexs/fees samples, indexer builder daily rows for 2026-07-14 and 2026-10-18, legal-page excerpts, app JS config excerpt, derived 30d volume). The 2026-10-17/18 zero-volume rows and DefiLlama totals were re-fetched this session and match. Scanned for email addresses and personal names: none. No HBVNK-specific market-data response exists to capture.

## 19. Privacy

All scripted requests used User-Agent `insurance-markets-research/0.1`. No personal identifiers in requests, queries or notes.
