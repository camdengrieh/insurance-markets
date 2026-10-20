# FlowBot Prediction (flowbot-prediction-687)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- NOT a venue. FlowBot Prediction is a front-end / automated-bot product that routes orders to **Polymarket** (Polygon CLOB) under a Polymarket **builder code**. It has no market model, order book, resolution or liquidity of its own. [H]
- Liquidity is 100% shared with Polymarket (already covered by another workflow). Not an independent arbitrage leg.
- adapter_priority: **skip**. Only residual value: the builder-attributed volume series is a cheap "is the bot still active" signal, and the BTC 15-minute prediction bot is a competitor/counterparty flow on Polymarket's 15-min BTC markets.

## What it is

- FlowBot (flowbot.pro) is "an automated trading platform specializing in decentralized perpetual exchanges": 3 strategies (Imbalance, Delta-Neutral funding arb, BTC Prediction) across 8 exchanges (Hyperliquid, Extended, Lighter, Nado, Paradex, Variational, Pacifica, Polymarket). Self-funded, no token. [H] https://docs.flowbot.pro/what-is-flowbot.md (fetched via https://docs.flowbot.pro, page "What is FlowBot")
- Polymarket is just one integration: "Unlike all other FlowBot exchanges, Polymarket trades binary outcomes, not perpetual futures." FlowBot is "an official builder providing agentic automated trading on Polymarket." [H] https://docs.flowbot.pro/exchanges/polymarket.md
- The only prediction product is the "BTC Prediction" bot: automated betting on Polymarket's 15-minute BTC price markets. Params: bet size $5-$1,000, 1-100 bets/session, timing 1-14 min before close, min win-rate threshold 2%-99% (it bets the favourite if probability meets threshold). [H] https://docs.flowbot.pro/strategies/btc-prediction.md
- The DefiLlama listing "FlowBot Prediction" (category Interface, id 7328) is a generated entry from DefiLlama's Polymarket **builder** factory adapter: key `flowbot-prediction`, builder "FlowBot", start 2025-12-31, builderCode `0x18fc17ee...dbb5`. Its description text is the generic FlowBot (perp-DEX points) blurb, which explains the "prediction link unclear" hint. The API lists chain Polygon (the older page record said Hyperliquid L1). [H] https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts ; https://api.llama.fi/summary/dexs/flowbot-prediction

## Is it still live (2026)?

- Docs site docs.flowbot.pro returns HTTP 200 on 2026-10-19 (CDN-cached, page "last updated 7 months ago"). [H]
- flowbot.pro main site: connection TIMED OUT from this host on 2026-10-19 (curl, 15-20 s, three attempts across apex and www). Could not confirm the app is up. DefiLlama's page returns 403 to WebFetch (bot block). [H for the timeout; cause unknown]
- Activity is almost dead: Polymarket's own builders leaderboard shows FlowBot with ~$117 volume and 1 active user on 2026-10-07 (rank ~155), 262 daily rows. DefiLlama daily volume peaked ~$42.6k (2026-01-11), fell to a few $k/day in Mar-May, then ~$100-500/day Jul-Oct; last 30d ~$1.9k, all-time ~$1.06M. [H] https://data-api.polymarket.com/v1/builders/volume ; https://api.llama.fi/summary/dexs/flowbot-prediction
- Verdict: nominally live front-end, effectively dormant (tiny residual volume).

## Market model, chains, collateral (all inherited from Polymarket)

- Binary outcomes, CLOB on Polygon, outcomes as ERC-1155 conditional tokens; collateral USDC.e on Polygon. FlowBot docs: chain Polygon, EVM wallet, deposit USDC.e to a FlowBot-deployed Safe. [H] https://docs.flowbot.pro/exchanges/polymarket.md. Note: Polymarket may have migrated collateral/exchange contracts (DefiLlama has a "polymarketV2BuilderFees" helper, M); treat the Polymarket workflow notes as authoritative.
- Custody model: FlowBot auto-deploys a Safe smart wallet per user; user's EOA is an owner and can withdraw by signing. FlowBot "handles all on-chain approvals automatically" (USDC.e + conditional token approvals to Polymarket exchange contracts). [H] same page. Implication: FlowBot's bot has operator access to the Safe; the exact key/permission arrangement is NOT FOUND (searched: docs.flowbot.pro llms.txt pages, exchanges/polymarket, strategies/btc-prediction).

## Read API

- exists: **none** (no FlowBot API, SDK, GitHub org or OpenAPI found; docs index in llms.txt has no API section). [H for docs index; GitHub org NOT FOUND, not searched exhaustively since WebSearch budget was exhausted]
- Public stats page flowbot.pro/stats is mentioned (volume, trades, users, per exchange, refreshed every 10 min) but unreachable from here; no documented JSON endpoint. [H docs; page not verified]
- Useful third-party read surfaces (not FlowBot's own): Polymarket Data API `GET https://data-api.polymarket.com/v1/builders/volume` (unauthenticated; returns rows `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}`, 53,291 rows in one response, filter builder=="FlowBot") and DefiLlama `GET https://api.llama.fi/summary/dexs/flowbot-prediction`. Fixtures saved. [H]
- Market data (books, prices, trades, resolution) must come from Polymarket's own APIs (Gamma, CLOB, Data), covered by the Polymarket spec.

## Trade path / PayBox reachability

- FlowBot: no programmatic order API. Orders are placed by FlowBot's backend bot from the user's configuration through the web dashboard (wallet connect, "3 clicks"). Not scriptable by an agent. [H docs; M no API]
- Equivalent exposure is reachable directly on Polymarket from an EVM wallet on Polygon (signed CLOB orders + Safe/proxy wallet), so FlowBot adds nothing.
- paybox_reachable: **no** (as FlowBot). Reason: no API and no contract surface to call; the underlying Polymarket venue is a separate adapter.

## Fees

- Docs list "Builder Fee: —" for Polymarket (none stated). Builder-code attribution on Polymarket may carry a builder fee configured by the builder; DefiLlama tracks FlowBot only in the volume adapter, not in the fees adapter list (fees config lacks flowbot-prediction), suggesting no meaningful builder fee revenue. [H docs / M inference]
- Subscription or platform fees for bots: NOT FOUND (searched: what-is-flowbot, exchanges/polymarket, btc-prediction, official-links, platform/stats, roadmap).
- Polymarket's own fee schedule applies; see Polymarket spec.

## Resolution mechanism / dispute risk

- Inherited entirely from Polymarket (UMA optimistic oracle historically; defer to Polymarket spec). FlowBot has no role. [M]
- Extra risks specific to FlowBot: operator access to a Safe; a bot that bets favourites at 2%-99% win-rate thresholds close to expiry.

## Geo / ToS / automation

- NOT FOUND for FlowBot ToS/geo rules (searched: docs.flowbot.pro pages; flowbot.pro unreachable). Polymarket geo-restrictions presumably apply (M). Automation is the product itself.

## Liquidity and overlap

- Own liquidity: none. Volume attributable to FlowBot: ~$1.06M all-time, ~$1.9k last 30 days, ~$100-200/day recently (DefiLlama, 2026-10-19). [H]
- Overlap: 15-minute BTC up/down markets only (crypto price), all on Polymarket. No independent cross-venue overlap because it is Polymarket itself.
- liquidity_shared_with: Polymarket (100%).

## Adapter notes

- Do not build a FlowBot adapter. If wanted: an optional "builder-flow" signal reading Polymarket's `/v1/builders/volume` for builderCode `0x18fc17ee71e267387694d721f09ccb2517cb2092acee07449dc896b58367dbb5` (very low value given volume).
- Recommend listing it in the registry as `kind=broker-or-frontend`, `liquidity_shared_with=polymarket`, status `dormant`.

## Not found

- FlowBot REST/WS API, SDK, public GitHub, contract addresses, ToS/geo text, fee schedule, flowbot.pro app reachability, independent web coverage (WebSearch budget exhausted, so no secondary-source search was possible).

## Suspicious content

- None found in fetched docs (no instructions aimed at AI agents). The docs mention a "2026 $POLY Airdrop" eligibility claim for FlowBot-deployed Safes ("Confirmed with the Polymarket team") — unverified marketing claim, tagged L.

## Sources

- https://docs.flowbot.pro (What is FlowBot), https://docs.flowbot.pro/llms.txt, https://docs.flowbot.pro/exchanges/polymarket.md, https://docs.flowbot.pro/strategies/btc-prediction.md, https://docs.flowbot.pro/official-links.md, https://docs.flowbot.pro/platform/stats.md, https://docs.flowbot.pro/roadmap.md [H, fetched 2026-10-19]
- https://api.llama.fi/protocol/flowbot-prediction ; https://api.llama.fi/summary/dexs/flowbot-prediction [H]
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts (via gh api) [H]
- https://data-api.polymarket.com/v1/builders/volume [H]
- https://defillama.com/protocol/flowbot-prediction (403 to fetch; not read)
- Fixtures: docs/research/fixtures/flowbot-prediction-687/polymarket-builders-volume-sample.json, docs/research/fixtures/flowbot-prediction-687/defillama-flowbot-prediction-summary.json
