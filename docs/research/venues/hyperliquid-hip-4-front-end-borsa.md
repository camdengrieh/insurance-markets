# Hyperliquid HIP-4 front-end: Borsa (borsa.cc) - venue spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs only (borsa.cc homepage, api.llama.fi), plus reuse of the same-day first-hand research in `docs/research/venues/borsa.md` (the full, detailed Borsa spec; this file is the registry-slug summary and re-verifies the key facts). No account, wallet, key, signature, POST or payment was used. Third-party text treated as untrusted data.

Tags: H = read first-hand in a primary source this session (URL cited); M = secondary/inferred; L = weak/stale.

## 0. Bottom line

- Borsa is a **Hyperliquid trading terminal (front end plus strategy tooling)**, not a venue. Orders route to Hyperliquid HyperCore order books through a builder code; collateral stays in the user's own Hyperliquid account (H: https://www.borsa.cc FAQ, quoted in `venues/borsa.md`).
- **100% shared liquidity with Hyperliquid HIP-4** -> NOT an independent arbitrage leg. Model the Hyperliquid HIP-4 book once (`venues/hyperliquid-outcomes-hip-4.md`).
- **Attributed outcome volume is about zero**: DefiLlama `borsa-outcome` all-time $50, 24h/7d/30d $0 (H, re-fetched this session).
- **No public read API / websocket.** Only a partner-key Execution API (order intents; outcome coins undocumented).
- **adapter_priority = skip.** Registry alias `borsa.cc -> routes_to: hyperliquid-outcomes-hip-4` (kind frontend).

## 1. Still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://www.borsa.cc` | HTTP 200 on 2026-10-19; Framer page "Published Oct 1, 2026"; title "Borsa - Your edge in every market"; description "The Hyperliquid trading terminal. Trade perps, stocks, commodities, forex and prediction markets from one non-custodial account" | H |
| `GET https://api.llama.fi/protocol/borsa-outcome` | id 8966 "Borsa Outcome", category Interface, tag "Hyperliquid HIP4 Builder", chain "Hyperliquid L1", `listedAt` 1791497866 (2026-10-08), parent "Borsa" (siblings Borsa Perps, Borsa Spot), twitter Borsa_HL, `tvl: []` | H |
| Perps flow under same builder code (from `venues/borsa.md`, indexer reads 2026-10-19) | $14.8M (2026-10-18), $88.9M (2026-10-15) | H (there) |
| Borsa ToS | "Last updated: March 13, 2026" - possibly stale (>6 months) | H (there) |

Verdict: still_live = true (terminal live and growing on perps); the prediction-market part is live in UI but unused.

## 2. Kind and market model

- Kind: broker-or-frontend (non-custodial terminal, operator "HYBRIDGE FOR COMPUTER SERVICES") (H, `venues/borsa.md`).
- Market model is Hyperliquid HIP-4's: fully collateralised binary Yes/No contracts on HyperCore's merged central limit order book. Yes and No books of an outcome are merged (buy Yes at p == sell No at 1-p); questions group outcomes so exactly one settles Yes; `outcomeMeta` info endpoint returns `sideSpecs` (H: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md, read this session). Token encoding `10*outcome + side`, coin `#<encoding>`, order asset id `100_000_000 + encoding` (H in `venues/hyperliquid-outcomes-hip-4.md`, not re-read here).
- Borsa UI only lists `priceBinary` contracts on perp underlyings ("BTC >= strike", 3m/15m/1d). No categorical/scalar/event markets documented (H: https://app.borsa.cc/docs/outcomes, per `venues/borsa.md`; page undated, M for "today"). Its "ref" probability is a crude vol proxy, not a usable signal.

## 3. Chains and collateral

HyperCore (Hyperliquid L1, not EVM); settles in USDC. Borsa deposits: USDC from Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche via CCTP; card on-ramp to Arbitrum (H, https://app.borsa.cc/docs/get-started-with-borsa, per `venues/borsa.md`). Solana/BNB not named (a Jupiter host appears in the CSP, M).

## 4. Read API

- Borsa: **none documented** (official-public: none). `indexer.borsa.cc`, `ws.borsa.cc` appear only in the CSP; `/api/` is robots-disallowed; not probed (H, per `venues/borsa.md`).
- Use Hyperliquid directly: `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `l2Book`, `allMids`, `settledOutcome`) and `wss://api.hyperliquid.xyz/ws` (`l2Book`, `trades`, `bbo`, `outcomeMetaUpdates`); keyless. Shapes and fixtures in `venues/hyperliquid-outcomes-hip-4.md` and `fixtures/hyperliquid-outcomes-hip-4/` (M here; POST not repeated, out of scope).
- Confirmed by unauthenticated GET this session and saved under `docs/research/fixtures/hyperliquid-hip-4-front-end-borsa/`:
  1. `llama_protocol_borsa_outcome.json` (protocol metadata above).
  2. `llama_summary_dexs_borsa_outcome.json`: `total24h 0, total7d 0, total30d 0, totalAllTime 50`; `totalDataChart` 170 daily `[unixTs, usd]` points, only `[1777680000 (2026-05-02), 50]` non-zero. Methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code." (H, https://api.llama.fi/summary/dexs/borsa-outcome)
- Only developer API: Borsa Execution API `https://app.borsa.cc/api/exec/v1` (`POST /intents` etc.), `Bearer bx_...` key issued by the Borsa team, 20 req/s per key (H, https://app.borsa.cc/docs/execution-api, per `venues/borsa.md`). Whether it accepts outcome coins: NOT FOUND.

## 5. Trade path

- Borsa programmatic: partner-key Execution API only (needs `approveAgent`, builder-fee approval, EIP-712 `Delegation`); nothing public.
- Real programmatic path: Hyperliquid `POST /exchange` with signed L1 actions (agent/API wallet or phantom-agent EIP-712), optional builder code (H in sibling note).
- **PayBox reachability: no via Borsa; partial via Hyperliquid.** HyperCore is not an EVM chain, so EVM transaction proposals cannot place orders; a PayBox EVM wallet could only fund USDC (Arbitrum/Base/Ethereum/Polygon deposit routes) and would need an agent key or typed-data signing for orders (M). Do not copy Borsa's browser-held "trading agent" pattern.

## 6. Fees

- Layers: Hyperliquid exchange fee + Borsa builder fee 0.025% (0.01% on HIP-3 and for accounts approved before 2026-10-14) + spread (H: https://app.borsa.cc/docs/fees-referrals-and-rewards, per `venues/borsa.md`). Volume and brsHYPE-staking reductions up to 100%; not applied to Execution API orders.
- HIP-4 official page: "Fees are currently zero for outcome markets during initial testing. Builder codes work as they do for spot. Builders earn builder fees on sell orders that specify their builder code." (H, Hyperliquid gitbook, read this session; "currently" = undated, possibly stale.)
- Builder fee actually charged on Borsa outcome orders: NOT FOUND.

## 7. Resolution and dispute risk

Entirely Hyperliquid's: settlement automatic, Yes converts to `settleFraction` USDC, No to `1 - settleFraction` (H, HIP-4 page). Borsa's `priceBinary` contracts settle on the underlying perp **mark price** vs strike at expiry (H, Borsa outcomes doc via `venues/borsa.md`) - lowest-risk tier, but the reference is HyperCore's mark, not Binance/Chainlink/Coinbase spot, and 3m/15m/1d expiries do not align with other venues (basis risk). Borsa adds no resolution layer and disclaims data accuracy.

## 8. Geo, ToS, automation

Borsa ToS (March 13, 2026, possibly stale): no jurisdiction list ("You are responsible for determining whether access is lawful in your jurisdiction"), no prediction-market clause, bars scraping that degrades service and market manipulation; robots.txt disallows `/api/` (H, per `venues/borsa.md`). Hyperliquid's interface terms bar US and Ontario residents and "Excluded Persons" from outcomes; bots allowed within reasonable usage (H in `venues/hyperliquid-outcomes-hip-4.md`, M here). Geo-blocking behaviour untested.

## 9. Liquidity (with dates)

| Quantity | Value | Source / date | Tag |
|---|---|---|---|
| Borsa-attributed HIP-4 outcome volume, all time | $50 (single day 2026-05-02) | api.llama.fi/summary/dexs/borsa-outcome, 2026-10-19 | H |
| Last 24h / 7d / 30d | $0 / $0 / $0 | same | H |
| Borsa TVL | none (collateral stays in user's Hyperliquid account) | api.llama.fi/protocol/borsa-outcome | H |
| Hyperliquid-wide HIP-4 volume (shared pool, not additive) | $3.13M 24h (2026-10-18), 30d $47.0M, all-time $261M | DefiLlama `hyperliquid-outcomes`, via `venues/borsa.md` | H (there) |

Caveat: zero means zero builder-code-attributed volume; it cannot tell "no usage" from "orders sent without the builder code". Either way no separate liquidity.

## 10. Event-category overlap

Borsa shows only crypto price-threshold binaries (BTC, ETH, SOL, HYPE...; 3m/15m/1d). Overlaps crypto-price ladders on Polymarket/Kalshi/Limitless-type venues with different references and expiries. Sports/politics/macro: not on Borsa; Hyperliquid itself lists some, reached via the Hyperliquid adapter.

## 11. Shared liquidity

Shares 100% with Hyperliquid HIP-4 HyperCore books (same as other HIP-4 front ends in DefiLlama's Interface category). **Not an independent arbitrage leg.**

## 12. Adapter recommendation

skip. Registry alias `borsa.cc -> routes_to: hyperliquid-outcomes-hip-4`, kind frontend. Optional fill attribution via Borsa's public builder address `0x74c362cd3a141769f38c48d66ee51b1938ea4bd0` (public protocol address, M, from `venues/borsa.md`). Re-check only if attributed outcome volume becomes material, the Execution API goes public with outcome coins, or Borsa publishes a market-data API.

## NOT FOUND (searched)

- Public Borsa market-data API, websocket, OpenAPI, SDK, GitHub org (searched: homepage, docs, CSP, DefiLlama `github`; detail in `venues/borsa.md`).
- Builder fee on Borsa outcome orders; whether Execution API accepts outcome coins; Borsa-specific geo block or bot policy; independent news/audit.
- Official HIP-4 fee rate after the "initial testing" zero-fee period.

## Suspicious content

None found. The Borsa homepage head and HIP-4 doc page fetched this session contained no text addressed to AI agents. (Earlier docs pages were scanned in `venues/borsa.md`: none.)

## Open questions

1. Does the Borsa UI attach its builder code to outcome orders (would explain $0 attributed)?
2. Is the Execution API open to third parties for outcome coins?
3. Does Borsa geo-block US/Ontario in practice?

## Sources

- https://www.borsa.cc (H, HTTP 200, 2026-10-19)
- https://api.llama.fi/protocol/borsa-outcome and https://api.llama.fi/summary/dexs/borsa-outcome (H, 2026-10-19; https://defillama.com/protocol/borsa-outcome is the human page)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md (H, 2026-10-19, via WebFetch summary, so M for exact wording)
- Same-day first-hand notes in this repo: `docs/research/venues/borsa.md` (Borsa docs, ToS, fees, Execution API, indexer data; fixtures in `docs/research/fixtures/borsa/`) and `docs/research/venues/hyperliquid-outcomes-hip-4.md`
- Fixtures: `docs/research/fixtures/hyperliquid-hip-4-front-end-borsa/`

## Privacy

Scripted requests used User-Agent `insurance-markets-research/0.1` only. No personal identifier was sent in any request or search query.
