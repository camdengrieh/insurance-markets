# Hyperliquid HIP-4 front-end: supurr.app - venue spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs, page/doc reads, reuse of an earlier same-day deep note. No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox money/signing tool used. Third-party text treated as untrusted data.

Tags: **H** read first-hand in a primary source this session (URL cited); **M** secondary/inferred or taken from a sibling project note; **L** weak/stale.

Scope note: a deeper note on the same venue already exists at `docs/research/venues/supurr-app.md` (same day, includes JS-bundle and GitHub reads). This note re-verifies the decisive facts (liveness, volume, shared liquidity) and records the adapter verdict. Items marked "(sibling)" come from that note or `hyperliquid-hip-4-outcomes-native.md` and were not re-read here (M).

## 0. Bottom line

- **Not a venue: a front-end and bot host that routes into the native Hyperliquid HIP-4 order books through a builder code.** Shares liquidity with Hyperliquid Outcomes, so it is **not an independent arbitrage leg** (H, DefiLlama methodology below).
- **Live as an app, dormant for outcomes.** DefiLlama attributes **$944 all-time** HIP-4 volume to Supurr's builder code (zero 24h/7d/30d) against $261.08M all-time / $3.13M 24h for all Hyperliquid Outcomes (H, 2026-10-19).
- **No market-data API from Supurr.** Its APIs are bot-management plus an indexer status route (sibling, H there).
- **adapter_priority = skip.** Integrate the native Hyperliquid HIP-4 adapter instead; do not attach Supurr's builder code.

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `https://trade.supurr.app/algotrading` -> 301 Moved Permanently -> `https://supurr.app/algotrading`; page is a client-rendered SPA titled "Supurr App \| Hyperliquid Trading & AI Trading Agent" (WebFetch returned only the title; no outcome-market text visible). | H |
| `https://api.supurr.app/indexer/status/` -> 200 `{"hyperliquid-mainnet":{"block":{"number":48932677,"timestamp":1792387175},"ready":true}}` (timestamp = 2026-10-19 05:19 UTC; indexer tracking chain now). Fixture `supurr_indexer_status.json`. | H |
| Official docs `https://docs.supurr.app/README.md` "Supported markets": Perpetuals, HIP-3 DEX, Spot. **HIP-4 / outcome / prediction markets are not mentioned.** Fees, geo restrictions, terms also not mentioned. | H |
| DefiLlama line `supurr.app Outcome` (slug `supurr.app-outcome`), chain Hyperliquid L1; the human page `https://defillama.com/protocol/supurr.app-outcome` returned HTTP 403 to WebFetch, data read via `api.llama.fi`. | H |
| GitHub org Supurr-App: skill repo last push 2026-06-16, bot repo 2026-05-28 (sibling) - four months quiet. | M |

Verdict: **still_live = true** as a company/app; the outcome-markets feature is effectively inactive (last non-zero outcome volume day 2026-05-28 per sibling; 168 daily points all 0 in the latest 3 days re-checked here).

## 2. Kind and market model

- **Kind:** broker-or-frontend. UI for Hyperliquid perps/spot/outcomes, hosted algo bots (grid, DCA, market-making), open-source CLI, points/referral (sibling, H there).
- **Market model:** inherited from Hyperliquid HIP-4 - on-chain CLOB on HyperCore, fully collateralised binary Yes/No outcomes, no leverage. Tokenisation: `encoding = 10*outcome + side` (side 0 Yes, 1 No), coin `#<encoding>`, token `+<encoding>`, order asset id `100000000 + encoding` (sibling; matches Supurr's bundle and Hyperliquid docs there). Supurr has no own markets, books or tokens. NOT FOUND (searched: docs README, DefiLlama, sitemap per sibling).

## 3. Chains and collateral

HyperCore (Hyperliquid L1). Collateral USDC (canonical outcome markets quote USDC per sibling; Supurr's own GitHub tutorial still says USDH = stale, L). User funds deposit to Hyperliquid itself; Supurr is non-custodial in the UI path (M). Builder code address and fee approval details: see `supurr-app.md` sections 3 and 6.

## 4. Shared liquidity (decisive)

**Yes, shares liquidity with Hyperliquid HIP-4 Outcomes.** Evidence (H): DefiLlama methodology for `supurr.app Outcome`: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code." Fees: "Builder-code fees paid by users on Hyperliquid HIP-4 outcome trades placed through the builder code." And DefiLlama's Hyperliquid Outcomes methodology says its fees include "builder-code fees added by front-ends" (`https://api.llama.fi/summary/dexs/supurr.app-outcome`, `.../hyperliquid-outcomes`). Do not sum Supurr with the base venue (double count).

## 5. Read API

- **Official public market-data API from Supurr: none** (NOT FOUND: docs README lists only a Bot API, quote-currencies and markets pages; OpenAPI per sibling has bot create/stop/status/logs only, create requires an API-wallet private key).
- Market data for the same books comes from Hyperliquid: `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `l2Book`, `allMids`), `wss://api.hyperliquid.xyz/ws` (`l2Book`, `bbo`, `trades`, `outcomeMetaUpdates`), keyless; limits 1200 weight/min/IP, 1000 WS subs/IP (sibling, M). See `hyperliquid-hip-4-outcomes-native.md`.
- Supurr hosts: `https://api.supurr.app/` (ping, indexer status), `https://apiv2.supurr.app/` (Bot API), docs `https://docs.supurr.app`. Rate limits and websocket for Supurr: NOT FOUND (searched: docs README, sibling's OpenAPI/skill docs).
- Real response shapes confirmed this session (fixtures in `docs/research/fixtures/hyperliquid-hip-4-front-end-supurr-app/`): `supurr_indexer_status.json` (89 B), `defillama_supurr-outcome_trimmed.json`, `defillama_hyperliquid-outcomes_trimmed.json` (trimmed DefiLlama dex summaries: `total24h`, `total7d`, `total30d`, `totalAllTime`, `methodology`, last chart points as `[unix_ts, usd]`).

## 6. Trade path

Orders are Hyperliquid L1 `order` actions signed in the user's browser wallet (agent key after `approveAgent`), posted to `https://api.hyperliquid.xyz/exchange`, optionally carrying Supurr's builder field (sibling, H there from bundle). Bots/CLI need the API-wallet private key uploaded to Supurr - an agent must not do that. **Aggregator should trade on Hyperliquid directly and omit Supurr's builder code.** No Supurr trading API to integrate.

## 7. PayBox reachability

**Partial, via Hyperliquid only** (M, sibling). HyperCore takes signed EIP-712 actions, not EVM transaction proposals; a PayBox EVM wallet could in principle sign typed data (`request_wallet_sign`) for the Hyperliquid adapter. Nothing Supurr-specific; Supurr's hosted bot API is not reachable without a raw private key. No PayBox tool was called here.

## 8. Fees

- Hyperliquid outcome fees are charged on close/settle only, per-deployer `deployerFeeScale`; DefiLlama: "Hyperliquid charged no outcome fee of its own before 15 Aug 2026" (H, methodology above); empirical all-in ~12-15 bps (sibling, M). Numeric rate not in Hyperliquid official docs (sibling).
- Supurr builder fee on top: max approvable 0.1%; client config perps 0.03%, spot 0.08%; **outcome rate NOT FOUND** (sibling searched bundle/docs). Paid by the trader, kept by the builder. DefiLlama Supurr Outcome fees all 0 now (sibling H).

## 9. Resolution and dispute risk

Entirely Hyperliquid's: protocol auto-settle for recurring series, mostly deployer-settled otherwise with no trader dispute window (sibling, M). Supurr adds no resolution layer.

## 10. Geo, ToS, automation

Supurr Terms/Privacy and geo list: NOT FOUND (searched: docs README here; sitemap, `/terms`, bundle per sibling). Docs README mentions none. Hyperliquid Terms apply to the fills: US and Ontario residents barred plus unpublished excluded-persons list for outcome markets; bot clause present (sibling, M). Automation is Supurr's own product.

## 11. Liquidity (dated 2026-10-19, source `api.llama.fi`)

| Metric | Value | Tag |
|---|---|---|
| Supurr Outcome volume 24h / 7d / 30d | $0 / $0 / $0 | H |
| Supurr Outcome all-time | $944 | H |
| Hyperliquid Outcomes (whole venue) 24h / 7d / 30d / all-time | $3,128,093 / $17,900,930 / $47,014,618 / $261,084,367 | H |
| TVL | none | M |

## 12. Event categories / overlap

Whatever Hyperliquid lists (crypto-price ladders, rates, sports; sibling). Overlap with Polymarket/Kalshi/Limitless for crypto price - only through the native Hyperliquid leg.

## 13. Suspicious content

From sibling (not re-read): Supurr's agent "skill" repo contains instructions steering AI assistants to promote/copy Supurr bots and to `curl | bash` an installer; not followed. Nothing addressed to me found in the pages read this session.

## 14. Priority

**skip**: duplicate liquidity, ~$944 lifetime outcome volume, no market-data API, bot API needs private keys. Use native Hyperliquid HIP-4 adapter (P1).

## 15. NOT FOUND

- Supurr Terms/geo rules (searched docs README, sibling's sitemap/bundle).
- Outcome builder fee rate applied by Supurr.
- Official Supurr docs coverage of HIP-4 (README silent).
- Independent press on Supurr: WebSearch budget exhausted; one search earlier returned generic HIP-4 news only (L: HIP-4 mainnet launch 2026-05-02 per secondary press).
- Hyperliquid official HIP-4 docs URL guessed wrongly (404); relied on sibling note for Hyperliquid specifics.

## 16. Sources

- https://trade.supurr.app/algotrading (301) -> https://supurr.app/algotrading (H)
- https://docs.supurr.app/README.md (H)
- https://api.supurr.app/indexer/status/ (H)
- https://api.llama.fi/summary/dexs/supurr.app-outcome ; https://api.llama.fi/summary/dexs/hyperliquid-outcomes (H, 2026-10-19)
- https://defillama.com/protocol/supurr.app-outcome (403, not read)
- Sibling notes: `docs/research/venues/supurr-app.md`, `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (M)
- Secondary press (L): chainstack.com/hyperliquid-hip4-vs-polymarket-2026, quicknode.com guide to HIP-4 (search result titles only, not read)

## 17. Privacy

Scripted requests used User-Agent `insurance-markets-research/0.1` only. No personal identifiers or wallet addresses written.
