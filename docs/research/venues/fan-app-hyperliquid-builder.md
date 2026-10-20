# Fan App (Hyperliquid builder) - venue spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs only (api.llama.fi, a TLS probe of fan.fun hosts), one WebFetch of the Hyperliquid builder-codes doc. No account, wallet, key, signature, POST or payment. Third-party text treated as untrusted data. The WebSearch budget for the session was exhausted, so no web search was possible; the X account page returned HTTP 200 but its content is not readable without JS and was not used.

Tags: H = read first-hand in a primary source this session (URL cited); M = secondary/inferred; L = weak/stale.

## 0. Bottom line

- Fan App (X: fanappX; previously "fan.fun", a Hyperliquid social/creator-token app) is a **Hyperliquid trading front end that collected builder-code fees**. It is not a venue and has no markets of its own. (H: DefiLlama protocol records, https://api.llama.fi/protocol/fan-app-perps)
- **Very likely shut down / dead.** DefiLlama marks both "Fan App Perps" and "Fan App Spot" `deadUrl: true`, `url: ""`, and describes Perps in past tense ("routed ... and collected builder-code fees"). `app.fan.fun` and `www.fan.fun` have an **expired TLS certificate**; `fan.fun` returns 404; `fan.app` returns 403 (unrelated or blocked); `fanapp.xyz` does not resolve. (H, curl 2026-10-19; the parent record `fan-app` still lists url https://app.fan.fun.)
- **No outcome / HIP-4 product listed.** DefiLlama has Fan App Perps and Fan App Spot but no "Fan App Outcome" sibling (the HIP-4 front ends such as Borsa have one, tag "Hyperliquid HIP4 Builder"). Both Fan App children carry tag "Hyperliquid Builder" only. (H, DefiLlama)
- Anything tradable through it is Hyperliquid liquidity -> **not an independent arbitrage leg**. Model Hyperliquid HIP-4 once (`venues/hyperliquid-outcomes-hip-4.md`).
- **adapter_priority = skip.** Registry alias `fanappX -> routes_to: hyperliquid-outcomes-hip-4` (kind frontend, status dead/unverified).

## 1. Still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://api.llama.fi/protocol/fan-app-perps` | id 8956, category Interface, tag "Hyperliquid Builder", chain "Hyperliquid L1", `listedAt` 1791497857 (2026-10-08), `deadUrl: true`, `url: ""`, parent "Fan App" (siblings Fan App Perps, Fan App Spot), twitter fanappX | H |
| `GET https://api.llama.fi/protocol/fan-app-spot` | id likewise, "Fan App provides access to spot trading through Hyperliquid.", `deadUrl: true`, `listedAt` 1791497881 | H |
| `GET https://api.llama.fi/protocol/fan-app` (parent) | url `https://app.fan.fun`, "Fan App provides access to trading markets through Hyperliquid." | H |
| `GET https://api.llama.fi/protocol/fan.fun` (older record, id 6081) | category SoFi, "enables creators to monetize exclusive content and engage in social trading, all built on Hyperliquid", `deadUrl: true`, listed 2025-04-23 (stale, >6 months), Halborn EVM audit link, TVL = native HYPE held by the fan.fun contract (about $36k per the protocols list) | H |
| `curl https://app.fan.fun`, `https://www.fan.fun` | TLS error "certificate has expired" | H |
| `curl https://fan.fun` | HTTP 404 | H |
| `https://fan.app` | HTTP 403 (WebFetch and curl); not shown to be this project | H (status only) |
| DefiLlama `/summary/dexs|fees/fan-app-*` | HTTP 400 "not found" - no volume or fee dimensions are published (the `derivatives` route returns 402, paid plan; recorded, not pursued) | H |

Verdict: still_live = false (probable; no first-hand evidence of an operating site). Caveat: the X account exists (HTTP 200) but its activity could not be read.

## 2. Kind and market model

- Kind: broker-or-frontend (Hyperliquid builder-code interface). Market model is whatever Hyperliquid exposes: perps (including HIP-3 deployer markets) and spot order books. If it ever routed HIP-4 outcomes they would be Hyperliquid's fully collateralised binary Yes/No contracts on the HyperCore central limit order book (M, from sibling notes `venues/hyperliquid-hip-4-front-end-borsa.md` / `hyperliquid-outcomes-hip-4.md`); no evidence it does. (H for the perps/spot/HIP-3 description: DefiLlama.)

## 3. Chains and collateral

HyperCore / Hyperliquid L1, USDC-denominated for perps and spot quotes (M; DefiLlama chain tag "Hyperliquid L1"). The earlier fan.fun contracts were on HyperEVM, holding native HYPE (H, DefiLlama methodology). Nothing else documented.

## 4. Read API

- Fan App: **none** (official-public: none). NOT FOUND (searched: DefiLlama records, fan.fun/app.fan.fun/fan.app/fanapp.xyz probes; the DefiLlama `github` field for fan.fun is "fandotfun", not opened).
- Use Hyperliquid directly: `POST https://api.hyperliquid.xyz/info` and `wss://api.hyperliquid.xyz/ws` (keyless). HIP-4 shapes/fixtures: `venues/hyperliquid-outcomes-hip-4.md`, `docs/research/fixtures/hyperliquid-outcomes-hip-4/`. Aggregate weight limit 1200 per minute (M, cited in `09-venues-onchain-clob.md`).
- Fixtures saved (DefiLlama metadata only, <2KB each) under `docs/research/fixtures/fan-app-hyperliquid-builder/`: `llama_protocol_fan_app_perps.json`, `llama_protocol_fan_app_spot.json`, `llama_protocol_fan_app_parent.json`.

## 5. Trade path

- Fan App: none. The front end is not reachable, and no developer API exists.
- Real path is Hyperliquid `POST /exchange` with signed L1 actions (agent wallet or EIP-712 phantom agent). A builder code, if used, requires the user's main wallet to sign `ApproveBuilderFee` (not an agent wallet). (H for approval: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes, read 2026-10-19.)
- **PayBox reachability: no.** HyperCore is not an EVM chain, so EVM transaction proposals cannot place orders, and there is nothing Fan-specific to route through. At most a PayBox EVM wallet could fund USDC to Hyperliquid (via Arbitrum), which is covered by the Hyperliquid venue note.

## 6. Fees

- Builder-code ceiling: **0.1% (10 bps) on perps, 1% on spot**; set per order; paid by the user on top of the exchange fee; credited to the builder; spot buys are excluded; the builder needs >=100 USDC perps account value (H, builder-codes page). The HIP-4 page (per sibling notes) says builders earn fees on sell orders and that outcome fees are currently zero (M, undated).
- Fan App's own builder fee level: NOT FOUND (searched: DefiLlama; no site reachable).

## 7. Resolution and dispute risk

None of its own. Any outcome market is settled by Hyperliquid (automatic settlement, no dispute process; M from sibling notes). Perps/spot have no resolution.

## 8. Geo / ToS / automation

NOT FOUND (site down). Hyperliquid's own terms govern; see the Hyperliquid venue note.

## 9. Liquidity

- Fan App volume: **not published** by DefiLlama (dexs/fees dimension routes return 400; H 2026-10-19).
- Old fan.fun: TVL about $36k (HYPE held by the contract), DefiLlama protocols list 2026-10-19 (H), but the record is dead-url and the product is a creator-token app, not a market.
- Hyperliquid HIP-4 for reference: $2.85M 24h / $18.5M 7d / $45.1M 30d (M, `09-venues-onchain-clob.md`, DefiLlama dimension fetched 2026-10-18).

## 10. Event overlap and shared liquidity

- No markets of its own, so no event overlap of its own. Shares **100%** of liquidity with Hyperliquid (HyperCore books). Not an independent arbitrage leg.

## 11. Priority

**skip**: dead or dying front end, no API, no outcome product, liquidity fully duplicated by Hyperliquid.

## Open questions

- Is the fanappX account still posting, and did Fan App announce a shutdown? (X not readable; no search budget.)
- Did Fan App ever expose HIP-4 outcomes? (No DefiLlama "Outcome" child; unverified.)

## Sources

- https://api.llama.fi/protocols (list; Fan App Perps/Spot, fan.fun entries) - H
- https://api.llama.fi/protocol/fan-app-perps, /fan-app-spot, /fan-app, /fan.fun - H
- https://api.llama.fi/summary/{dexs,fees}/fan-app-* (HTTP 400), /summary/derivatives/* (HTTP 402) - H
- https://app.fan.fun, https://www.fan.fun (expired certificate), https://fan.fun (404), https://fan.app (403), https://fanapp.xyz (no DNS) - H probes 2026-10-19
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes - H (WebFetch summary)
- Repo notes: `docs/research/09-venues-onchain-clob.md`, `docs/research/venues/hyperliquid-hip-4-front-end-borsa.md` - M
