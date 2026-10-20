# Hyperliquid HIP-4 front-end: GDEX (gdex.pro) - venue spec

Researched 2026-10-19. READ-ONLY: page and docs reads, `gh api` file reads, unauthenticated GETs with User-Agent `insurance-markets-research/0.1`. No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox money/signing tool used. WebSearch was unavailable (shared budget exhausted), so there is no search-engine corroboration.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, inferred, or taken from a sibling repo note; **L** = weak/stale.

A fuller sibling note exists at `docs/research/venues/gdex.md` (same conclusion; it also greps the public JS bundle and SDK). Facts below marked "(M, sibling note)" were not re-verified in this pass.

## 0. Bottom line

- GDEX is a Hyperliquid **builder-code front-end** for HIP-4 outcome markets, not a venue. DefiLlama: category "Interface", tag "Hyperliquid HIP4 Builder", methodology "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code" (H, https://api.llama.fi/summary/dexs/gdex-outcome). Its books ARE Hyperliquid's books: 100% shared liquidity, not an independent arbitrage leg.
- Product is live; the outcome feature is effectively dormant: $3,507 lifetime volume, zero in the last 100 days (H).
- Its backend API is gated (403 to non-browser clients). Read and trade Hyperliquid directly instead.
- **adapter_priority: skip.** Treat GDEX only as an attribution alias on the Hyperliquid HIP-4 adapter (see `docs/research/venues/hyperliquid-outcomes-hip-4.md`).

## 1. Still live (2026)?

| Evidence | Tag |
|---|---|
| https://gdex.pro/ loads; describes a multi-chain trading terminal (swaps, copy trading, perps up to 50x claimed, analytics). The landing page does NOT mention outcomes or prediction markets, lists no fees, no API/docs links, no geo statement. | H |
| Official docs "Outcomes": "Outcomes on GDEX Pro are Hyperliquid prediction markets - browse crypto and event markets, then open one to trade." (https://docs.gemach.io/gemach-dao/products/gdex-pro/features/outcomes.md, undated) | H |
| Docs Canonical Facts lists "Outcomes (Hyperliquid prediction / event markets)" and outcome trading agents "live" (https://docs.gemach.io/gemach-dao/products/gdex-pro/canonical-facts.md) | H |
| DefiLlama protocol `gdex-outcome` (id 8985), listedAt 1791497885 (= 2026-10-08), chain "Hyperliquid L1", parent GDEX (https://api.llama.fi/protocol/gdex-outcome) | H |
| SDK repo `GemachDAO/gdex-skill` last pushed 2026-10-15 (`gh api repos/GemachDAO/gdex-skill`) | H |
| DefiLlama outcome volume: 22 non-zero days of 167; first 2026-05-05 ($30); last non-zero 2026-07-11 ($20); 24h/7d/30d = 0 at data end 2026-10-18 | H |

Verdict: `still_live = true` (front-end), outcome flow dormant.

## 2. Kind and market model

- Kind: broker/front-end over Hyperliquid HIP-4 (H, DefiLlama description: "GDEX provides access to outcome-based prediction markets through Hyperliquid."). Operator Gemach DAO (X handle `gemach_io`, per DefiLlama).
- Market model: it lists whatever Hyperliquid lists. HIP-4 = fully collateralised Yes/No outcome tokens on the HyperCore central limit order book, coins `#<outcomeId><side>` (M, sibling note: `#1010` = outcome 101 side 0). Not AMM, not parimutuel. GDEX deploys no markets of its own (NOT FOUND in docs/SDK; sibling note searched the bundle too).
- Doc inconsistency: GDEX SDK text calls these "HIP-3" markets; DefiLlama and the product code say HIP-4 (M, sibling note).

## 3. Chains and collateral

- Venue chain: Hyperliquid L1/HyperCore; "Perps / Outcomes: HyperLiquid (USDC collateral; deposit path on Arbitrum)" (H, Canonical Facts).
- GDEX's many spot chains (Solana, Base, Ethereum, Arbitrum, Optimism, BNB, Sonic, Sui...) are for spot/swaps only and irrelevant to outcomes (H, Canonical Facts).
- Per-market quote token (USDC/USDH/USDE/USDT0) is claimed by the SDK but unresolved against Hyperliquid's own docs (M, sibling note). NOT FOUND in GDEX primary docs.

## 4. Read API

- GDEX public/documented API: **none** (landing page has no API link; no API reference on docs). Closest: SDK `GemachDAO/gdex-skill` and base `https://trade-api.gemach.io/v1` (H, Canonical Facts: "API base: https://trade-api.gemach.io/v1"). Endpoints seen in the SDK: `GET /v1/hl/outcomes`, `/v1/hl/outcome_account`, `/v1/hl/builder_referral` (M, sibling note).
- Probe (H, 2026-10-19): `GET https://trade-api.gemach.io/v1/hl/outcomes` -> `403 {"error":"Access denied: Invalid client"}` with the generic UA. I did not spoof a browser UA or use the shared keys the SDK repo publishes. Fixture: `docs/research/fixtures/hyperliquid-hip-4-front-end-gdex/gemach_trade_api_403_headers.txt`. Rate limits and websocket: NOT FOUND (searched docs, canonical facts, SDK per sibling note).
- Use instead: Hyperliquid's public API (`POST https://api.hyperliquid.xyz/info` with `outcomeMeta`, `allMids`, `l2Book`; `wss://api.hyperliquid.xyz/ws`) - shapes in `docs/research/fixtures/hyperliquid-outcomes-hip-4/` (M, sibling).
- Only live, readable GDEX-related data: DefiLlama (public, no key): `https://api.llama.fi/protocol/gdex-outcome`, `/summary/dexs/gdex-outcome`, `/summary/fees/gdex-outcome` (H). Shapes saved: `defillama_gdex-outcome_protocol.json`, `defillama_gdex-outcome_dexs_summary.json` (daily `totalDataChart` as `[unix_ts, usd]`; `total24h/7d/30d/1y/allTime`).

## 5. Trade path

- Via GDEX: agents use "server-side managed wallets after control-wallet sign-in" with the API above (H, Canonical Facts: "Agent execution uses server-side managed wallets after control-wallet sign-in"). Order endpoints `/v1/hl/outcome/create_order` etc. take an encrypted `computedData` body (M, sibling note). This is a custodial proxy, not raw Hyperliquid signing. Same docs claim "Private keys remain user-controlled and are exportable" for the terminal, so custody posture is ambiguous (H quotes, conflict).
- Direct (recommended): sign Hyperliquid L1 actions (agent wallet via `approveAgent`) and POST to `https://api.hyperliquid.xyz/exchange` - see Hyperliquid note.
- **PayBox reachability: partial, worse than direct.** HyperCore is not EVM, so no transaction proposal places an order. PayBox could only send Arbitrum USDC to a funding address and maybe sign a one-time EIP-191 login message; no GDEX PayBox plugin (M, sibling note: `discover_plugins "gdex"` empty). Not re-run here.

## 6. Fees

- Builder fee on HIP-4 outcomes: **50 bps** (perps 5 bps), paid by the user on top of Hyperliquid fees - source is a code comment in the DefiLlama adapter: "5 bps on perps (incl. HIP-3), 50 bps on HIP-4 outcome markets" (M, https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts, read via gh api). Builder address in that file: `0x60e26ec284d4cd118547611f109f84207fa4bb14` (public).
- Observed: all-time fees $6.90 on $3,507.1 volume (~0.20%), i.e. below 50 bps; unexplained (maybe one leg only) (H data, M reading).
- GDEX docs publish no outcome fee (NOT FOUND; landing page FAQ fee answer is blank). Sibling note found FAQ "on-chain swaps ~1%".
- Hyperliquid's own fees apply too (see Hyperliquid note).

## 7. Resolution

GDEX resolves nothing. Resolution and dispute risk are Hyperliquid's (deployer/validator-settled, no trader dispute process per sibling Hyperliquid note, M). GDEX Terms of Use: NOT FOUND (searched landing page, docs pages above), so frontend-specific withdrawal or liability terms are unknown.

## 8. Geo / ToS / automation

- GDEX: landing-page KYC and safety FAQ entries are empty; sibling note found FAQ "No identity verification (KYC) is required" (M). Geo restrictions: NOT FOUND.
- Underlying Hyperliquid restrictions (US, Ontario, outcome-market excluded persons) still bind the user (M, sibling Hyperliquid note).
- Automation: GDEX markets an SDK, MCP server and agent skills (H, Canonical Facts "Open-source gdex-skill plus an MCP server"), yet the backend rejects non-browser clients (H, probe above).

## 9. Liquidity (DefiLlama via api.llama.fi, fetched 2026-10-19, data to 2026-10-18)

| Metric | Value | Tag |
|---|---|---|
| Outcome volume all-time | $3,507.1 | H |
| 24h / 7d / 30d | 0 / 0 / 0 | H |
| Non-zero days | 22 of 167 | H |
| Fees all-time | $6.90 | H |
| TVL/OI | none (empty arrays; Interface listing) | H |
| Flag | `doublecounted: true` | H |

## 10. Event-category overlap

Whatever Hyperliquid HIP-4 lists (crypto price ladders, sports, macro/rates, etc. per sibling note, M). No GDEX-exclusive markets found. Arbitrage should use the Hyperliquid book directly.

## 11. Shared liquidity

**Yes, 100%, with Hyperliquid HIP-4** (and every other HIP-4 builder front-end, e.g. Borsa, Presagio, Cipher). DefiLlama methodology states the volume is Hyperliquid trades placed with the builder code (H). Not an independent leg.

## 12. Adapter recommendation

Do not build a GDEX adapter. At most map builder address `0x60e26ec...bb14` to a "gdex" attribution label on Hyperliquid fills (M). Never route orders through GDEX (+50 bps, custodial proxy, scripted access blocked).

## 13. NOT FOUND / open questions

- GDEX Terms/Privacy/geo statement (searched: landing page, docs pages above).
- Formal API reference and rate limits (searched: landing page, docs Outcomes and Canonical Facts pages).
- A real GDEX API response shape (403; not bypassed).
- Whether 50 bps applies to both buy and sell.
- Why volume stopped 2026-07-11.

## 14. Suspicious content (untrusted; not followed)

- Docs "Canonical Facts" is written as directives to AI agents/SEO writers ("Single source of truth for public product claims across docs, agents, and affiliate/SEO pages"). Treated as marketing data.
- Docs/SDK direct agents to install `GemachDAO/gdex-skill` and an MCP server, and (per sibling note) the SDK repo commits shared API keys and says the client UA must match a browser. Not executed, not used, not copied.

## 15. Sources

- https://gdex.pro/ (H, 2026-10-19)
- https://docs.gemach.io/gemach-dao/products/gdex-pro/features/outcomes.md (H)
- https://docs.gemach.io/gemach-dao/products/gdex-pro/canonical-facts.md (H)
- https://api.llama.fi/protocol/gdex-outcome , /summary/dexs/gdex-outcome , /summary/fees/gdex-outcome (H, 2026-10-19)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts (H file; M for the fee claim)
- https://api.github.com/repos/GemachDAO/gdex-skill (pushed_at 2026-10-15; H)
- https://trade-api.gemach.io/v1/hl/outcomes (403; H)
- https://defillama.com/protocol/gdex-outcome (evidence URL; data taken from API endpoints)
- Repo: `docs/research/venues/gdex.md`, `docs/research/venues/hyperliquid-outcomes-hip-4.md` (M)

Fixtures: `docs/research/fixtures/hyperliquid-hip-4-front-end-gdex/` (scanned for personal identifiers: none).
