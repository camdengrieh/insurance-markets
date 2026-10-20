# Hyperliquid HIP-4 front end: Nansen - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: public GETs only; no account, key, wallet, signature, POST, payment or PayBox call. Third-party text is untrusted data. The WebSearch budget was exhausted in this session, and DefiLlama's HTML page returned 403, so this note re-verifies the key numbers live via the DefiLlama JSON API and otherwise builds on the fuller sibling note `docs/research/venues/nansen.md` (same venue, researched earlier today with direct reads of Nansen's changelog, academy, Terms, API docs and CLI repo). Claims taken from that note and not re-read this session are tagged M.

Tags: H = read first-hand in a primary source this session (URL cited); M = secondary, inferred, or carried from the sibling note; L = weak/stale. "NOT FOUND (searched: ...)" = not documented where looked.

Fixtures: `docs/research/fixtures/hyperliquid-hip-4-front-end-nansen/` (copies of the fixtures captured earlier today; DefiLlama totals re-checked live this session and match).

---

## 0. Bottom line

1. Nansen is a front end, not a venue. Since 2026-08-30/31 eligible users can trade Hyperliquid HIP-4 outcome markets in the Nansen web app using an embedded Privy wallet. Nansen runs no book, collateral pool or resolver (M, Terms 2026-08-10).
2. Liquidity is 100% shared with Hyperliquid HIP-4. It is NOT an independent arbitrage leg. DefiLlama marks the row `doublecounted: true` (H, https://api.llama.fi/summary/dexs/nansen-outcome, fetched 2026-10-19).
3. Nansen's own flow is negligible: builder-code-attributed volume $12,460 all-time, $7,587 over 30 days, $0 in 24h and 7d (H, same URL, fetched 2026-10-19), versus $261.1M all-time and $3.13M in 24h for all HIP-4 (H, https://api.llama.fi/summary/dexs/hyperliquid-outcomes, 2026-10-19). Latest nonzero day was 2026-10-11 ($53).
4. No outcome API. Nansen's API (api.nansen.ai) is key- or x402-authenticated; its prediction-market endpoints cover Polymarket only; its trading endpoints cover Hyperliquid perps and Solana/Base spot (M).
5. No PayBox path through Nansen (embedded wallet only, no external wallets). Reach the same books directly on Hyperliquid (see `hyperliquid-hip-4-outcomes-native.md`).
6. Geo: outcome trading barred in US, UK, Singapore and ~20 other jurisdictions, no VPN (M).
7. adapter_priority = skip as a venue leg. Add it to the HIP-4 adapter's `front_ends[]` metadata. Optional separate signal feed (Nansen Polymarket smart-money data) is a different module with licence limits.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| DefiLlama JSON for "Nansen Outcome": category Interface, chain Hyperliquid L1, `doublecounted: true`; 81 daily points, final point 2026-10-18 (timestamp 1792281600) = 0. https://api.llama.fi/summary/dexs/nansen-outcome | H |
| Changelog "Outcome Markets Now Available on Nansen Web", Aug 31, 2026: https://release.nansen.ai/changelog/hip-4-market-trading-now-live-on-nansen-web (HTTP 200 this session; content from sibling note) | H (reachable) / M (content) |
| Academy: trading available for eligible users since 2026-08-30. https://academy.nansen.ai/en/articles/9072054-hyperliquid-outcome-markets | M |
| Terms updated 2026-08-10 include an Outcomes feature clause. https://nansen.ai/legal/terms-of-services | M |
| Press: crypto.news 2026-09-08, "Nansen becomes first front end to support Outcome.xyz HIP-4 markets". | M |
| app.nansen.ai gives Cloudflare 403 to scripted GETs and is login-gated; in-app market list not seen. https://defillama.com/protocol/nansen-outcome also 403 to WebFetch this session (the JSON API worked). | H |

Verdict: still_live = true as a product feature, but usage has been near zero for the last week.

---

## 2. Kind and market model

- Kind: broker-or-frontend (trading terminal plus analytics). Hyperliquid-only for perps and outcomes (M).
- Market model is Hyperliquid HIP-4, not Nansen's: fully collateralised Yes/No outcome tokens on HyperCore's central limit order book, no leverage/funding/liquidation, integer shares paying $1, multi-outcome "questions" (M; see `hyperliquid-hip-4-outcomes-native.md` for the primary-source detail).
- Nansen's Terms describe it as "fully collateralized and does not involve leverage, margin, funding, or liquidation" (M).
- Which HIP-4 markets Nansen lists is unknown. Press says stock and crypto markets at launch, politics and sports expected later (M). NOT FOUND (searched: changelog, academy, docs index) for a market list.
- UI extras: outcome tokens in Token Screener; holder breakdown per side in Token God Mode. Not in the public API docs (M).

---

## 3. Chains and collateral

- Execution and settlement on HyperCore (Hyperliquid L1), not an EVM chain (M).
- Collateral is the Hyperliquid account balance shared with perps; USDC quote per the HL sibling note (M).
- Wallet: embedded Nansen Wallet (Privy), "no options for external wallets" (M). Custody model unstated.
- Deposits through HyperCore only (no HyperEVM deposits); Nansen's perps bridge lists deposits from Ethereum, Base, Arbitrum, Polygon, BNB Chain (M).

---

## 4. Read API

- No Nansen read API for outcome markets. NOT FOUND (searched earlier today: docs llms.txt index, API overview, Hyperliquid section, data coverage, MCP tool catalog, x402 discovery, nansen-ai/nansen-cli README/CHANGELOG/source).
- Docs: https://docs.nansen.ai (index https://docs.nansen.ai/llms.txt). Base URL https://api.nansen.ai, paths `/api/v1/...`, JSON POST bodies (M).
- Auth: `apikey` header, or pay-per-call via x402 (USDC on Base/Solana/Monad) / MPP; keyless call returns 401 (fixture `nansen_api_401_account_keyless.json`) or a 402 challenge on eligible endpoints (`nansen_api_well-known_x402.json`). No payment made (M, fixtures captured earlier today).
- Rate limits: Free 15 req/s, 300/min; Pro 75 req/s, 1,500/min; credit-metered (1-5 credits per prediction-market call); Pro $49-69/month (M).
- WebSocket: NOT FOUND (searched: docs index, API overview).
- Prediction-market endpoints (`POST /api/v1/prediction-market/*`: categories, market-screener, event-screener, orderbook, ohlcv, top-holders, position-detail, trades-by-market, pnl-by-market, pnl-by-address, address-summary, trades-by-address): "currently only supports data across Polymarket" (M). Fixture `nansen_docs_prediction_market_openapi_excerpt.json` is a documented schema, not a live capture.
- Hyperliquid endpoints cover perps only (M).
- Licence: API Terms (Jun 1, 2026) bar scrapers and merging/redistributing Nansen data in commercial or public-facing products without written permission (M).
- Better source for the HIP-4 data: Hyperliquid's own keyless REST/WS (HL sibling note). Better source for Polymarket data: Polymarket's own APIs.
- Confirmed response shapes this session: only the DefiLlama JSON (`defillama_*` fixtures; live re-check matched `total30d` 7586.99, `totalAllTime` 12459.97).

---

## 5. Trade path

- Nansen app: UI only, embedded Privy wallet. Scripting the UI would breach the Terms' ban on scripts/agents (M) and is out of scope.
- Nansen Trading API for perps: prepare -> sign locally (EIP-712) -> `POST /api/v1/perp/execute`, builder-fee approval required. Documented for perps only. Whether it accepts an outcome asset id (>= 100,000,000): NOT FOUND (searched: perp-trading guide, CLI source). Do not assume (M).
- Practical route: sign Hyperliquid `order` actions directly against the outcome asset ids, optionally with a builder code (HL adapter's job).

---

## 6. PayBox reachability

paybox_reachable = no for Nansen itself (no external-wallet option, no outcome order API). Partial for the underlying Hyperliquid venue (typed-data signing plus USDC funding from EVM chains; see HL sibling note). Nansen's own bridge accepts deposits from Ethereum, Base, Arbitrum, Polygon and BNB Chain, but there is no reason to route through Nansen. No PayBox tool was called (M).

---

## 7. Fees

- Nansen outcome fee: NOT FOUND (searched earlier today: academy Trading Fees and Outcome Markets articles, changelog, Terms, docs, DefiLlama fees series).
- Likely: Hyperliquid's outcome fee (charged on close/settle; empirical all-in ~12-15 bps per HL note) plus a Nansen builder fee on outcome sells (DefiLlama methodology) (M). Nansen perps builder fee by Points tier: 0.08% unranked down to 0.01% (M); applicability to outcomes unknown.
- DefiLlama fees: $0.03 on $53 volume on 2026-10-11 (about 6 bps; one observation, L).
- Aggregator rule: Nansen-routed execution is no cheaper than direct Hyperliquid.

---

## 8. Resolution and dispute risk

Nansen has no role: Terms disclaim control of "the oracle, resolver, or dispute process" and say settlement occurs after the market is finally resolved (M). Actual resolution is Hyperliquid HIP-4: protocol-settled recurring series, validator-voted canonical markets, and mostly deployer-settled markets (Outcome.xyz main) with no trader-initiated dispute window (M; H in the HL note). Compare resolution text and reference price with the counter-venue before pairing.

---

## 9. Geo / ToS / automation

- Outcomes feature barred in: US, UK, Australia, Thailand, China, India, Brazil, Indonesia, Poland, Hungary, Netherlands, Belgium, Switzerland, Argentina, Ireland, plus the general list (Bhutan/Gelephu, Singapore, Cuba, Iran, North Korea, Syria, Crimea/Donetsk/Luhansk) (M, Terms updated 2026-08-10).
- VPN circumvention not permitted; wallets sanctions-screened (M).
- Automation: Acceptable Use bars interacting "using scripts, ... agents, ... or other means ... whether manual or automated" without written consent, and bars building a similar product or benchmarking (M, quoted sparingly).

---

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Nansen-attributed volume, all-time | $12,459.97 | https://api.llama.fi/summary/dexs/nansen-outcome, fetched 2026-10-19 | H |
| 30d / 7d / 24h | $7,586.99 / $0 / $0 | same | H |
| Last nonzero day | 2026-10-11, $53 | same | H |
| Whole HIP-4 pool (shared) | 24h $3,128,093; 7d $17,900,930; 30d $47,014,618; all-time $261,084,367 | https://api.llama.fi/summary/dexs/hyperliquid-outcomes, fetched 2026-10-19 | H |
| Nansen share | ~0.005% all-time, ~0.016% of 30d | computed | M |
| Rewards | $1M Outcome.xyz rewards pool for trades via Nansen, terms unread; no visible volume effect | crypto.news 2026-09-08 | M |
| TVL | none listed | DefiLlama | M |

---

## 11. Event categories and overlap

Nansen has none of its own; it exposes HIP-4 inventory: crypto price ladders (BTC/ETH/SOL/HYPE; best overlap with Polymarket, Kalshi, Limitless, Predict.fun, Opinion), sports, central-bank rates, stock/commodity templates (M, HL note). Signal angle: Nansen's Polymarket wallet labels/PnL and Hyperliquid smart-money perps could feed a flow feature for crypto and politics markets; paid and licence-limited.

---

## 12. Shared liquidity

Yes, fully. All Nansen outcome orders are Hyperliquid HIP-4 orders and must be deduplicated with Hyperliquid, Outcome.xyz and the other HIP-4 front ends. DefiLlama attributes by builder code in `factory/hyperliquid.ts` (`"nansen-outcome": { builder: "nansen-perps", market: "outcome" }`) (M). Model as `front_ends[]` metadata on the single `hyperliquid-hip4` pool.

---

## 13. Adapter implications

- No Nansen venue adapter. Record in HIP-4 `front_ends[]`: slug `nansen-outcome`, builder-code pointer, geo list, embedded wallet only, fee unknown.
- Optional separate signal module (Nansen prediction-market and hyperliquid endpoints): paid key or x402, written permission needed for redistribution, Polymarket id mapping.

---

## 14. Priority

adapter_priority = skip (venue leg). Duplicate liquidity, negligible volume, no outcome API, no external-wallet path, strict geo and anti-automation terms.

---

## 15. NOT FOUND / open questions

- Nansen outcome builder fee (searched: academy, changelog, Terms, docs, DefiLlama fees).
- Whether Nansen lists all HIP-4 deployers' markets or only Outcome.xyz's (in-app page gated).
- Whether `/perp/order`, `/perp/execute` or Token God Mode endpoints handle outcome tokens.
- Terms of the $1M rewards pool.
- Privy wallet custody model.
- Why DefiLlama shows volume from 2026-07-30, a month before stated launch (possibly beta).
- Live bodies of Nansen prediction-market endpoints (need key/payment; not done by rule).
- Web search was unavailable (budget exhausted), so no fresh press check beyond the sibling note.

---

## 16. Suspicious content

None aimed at this task. Nansen docs pages carry a generic GitBook "Agent Instructions" footer and advertise agent/x402/MCP flows (M, from sibling note); none followed, no payment made.

---

## 17. Sources

- H: https://api.llama.fi/summary/dexs/nansen-outcome ; https://api.llama.fi/summary/dexs/hyperliquid-outcomes (fetched 2026-10-19) ; https://release.nansen.ai/changelog/hip-4-market-trading-now-live-on-nansen-web (HTTP 200)
- Not readable this session: https://defillama.com/protocol/nansen-outcome (403), https://app.nansen.ai/ (Cloudflare 403)
- M (via `docs/research/venues/nansen.md`, which read these first-hand on 2026-10-19): https://academy.nansen.ai/en/articles/9072054-hyperliquid-outcome-markets ; https://academy.nansen.ai/en/articles/7327989-trading-fees ; https://nansen.ai/legal/terms-of-services ; https://nansen.ai/legal/api ; https://docs.nansen.ai/llms.txt ; https://docs.nansen.ai/api/prediction-market.md ; https://docs.nansen.ai/api/trade/perp-trading.md ; https://github.com/DefiLlama/dimension-adapters (factory/hyperliquid.ts) ; https://github.com/nansen-ai/nansen-cli
- M: https://crypto.news/nansen-becomes-first-front-end-to-support-outcome-xyz-hip-4-markets/
- Sibling notes: `docs/research/venues/nansen.md`, `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, `docs/research/14-platform-of-platforms.md`

## 18. Privacy

Scripted requests used User-Agent `insurance-markets-research/0.1` only. Fixtures and this note were scanned for personal identifiers; none found. No wallet addresses recorded.
