# Phoenix Prediction (phoenixverse) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Phoenix Prediction is a B2B white-label iframe product sold to iGaming/betting operators, not a venue with a public market-data API. Markets are served per operator behind Ed25519-signed operator credentials. Cash settles in the operator's own wallet ledger (KES, USD, ETB, USDT, BTC... fiat or operator-ledger currencies), not on a public chain. There is no way for an agent or a PayBox wallet to read or trade it without being an onboarded operator. (H)

## Is it live?

- docs.prediction.phoenixverse.io returns 200, 240 KB llms-full.txt, content current (Operator API, wallet API 1.1 "Positions", Scout feature). (H) https://docs.prediction.phoenixverse.io/llms-full.txt
- Backend `https://prediction.phoenixverse.io/health` returned 200 body `ok` on 2026-10-19. (H)
- npm `@phoenix-games-io/pmm-embed` 0.1.0 published 2026-10-05, license UNLICENSED, repo `phoenix-games-io/phoenix-pmm-embed-web` (GitHub API returns 404, so private). (H) https://registry.npmjs.org/@phoenix-games-io/pmm-embed
- Vendor site phoenix-games.io shows only a tagline ("Every betting site runs the same games. Yours won't."): no volume, customers, licences or jurisdictions stated. (H) https://phoenix-games.io
- No independent third-party coverage found (one WebSearch only returned unrelated crypto "Phoenix" tokens; a second search was blocked by the session search budget). NOT FOUND: any press, volume figures, named operators. Whether any production operator has real players is unknown. (H for the absence in one search; L overall)
- Verdict: live software, apparently very new (npm package created 2026-10-05, API version 0.1.0), no public liquidity.

## Kind and market model

- Kind: other / white-label prediction-market-as-a-service for operators. (H) https://docs.prediction.phoenixverse.io/developers
- Markets are **binary only**, sides canonical `A` and `B` (labels may be Yes/No, team names, etc). Listings group markets (simple question, outright, fight page, sports match page, price ladder, collection). No categorical or scalar market type documented, though outright pages hold several binary markets. (H) https://docs.prediction.phoenixverse.io/operators/guides/trading-models
- Trading engine: **central limit order book** by default; price tick fixed at 0.01; sizes depend on currency decimals. AMM/LMSR exists as an optional configuration ("Some environments can be configured ... assume order-book behavior unless Phoenix tells you"). (H)
- Outcomes are not tokenised: positions are rows in Phoenix's subledger ("Phoenix owns the prediction-market trading subledger"). No ERC-20/1155/SPL tokens. (H) https://docs.prediction.phoenixverse.io/developers/wallet/model
- **Per-operator books**: "Your book" is each operator's own market on an event: price, orders, positions. Suspending it affects only that operator. So liquidity is fragmented per operator and not one global book. (H) https://docs.prediction.phoenixverse.io/operators/guides/your-events (Whether operator books are linked/shared on platform events is not documented: NOT FOUND, searched llms-full.txt for shared/pool/aggregate.)

## Chains and collateral

- No chain. Wallet is operator-hosted via signed callbacks (`reserve_cash`, `capture_cash`, `release_cash`, `credit_cash`, `balance`, `transaction_status`). Currency is chosen per launch token; examples in docs: KES, USD, ETB, USDT (6 dp), BTC/ETH (8 dp), JPY. (H) https://docs.prediction.phoenixverse.io/developers/wallet/operations
- No on-chain settlement contracts found. NOT FOUND (searched docs llms-full.txt for chain/contract/Solana/Base/Polygon: no hits other than currency codes; GitHub org not public).

## Read API

- exists: **official-authenticated**, operator-scoped only. (H)
- Docs: https://docs.prediction.phoenixverse.io/developers/operator-api/overview ; Redoc `https://prediction.phoenixverse.io/docs`; OpenAPI `https://prediction.phoenixverse.io/openapi.json` (public, saved as fixture).
- Base: `https://prediction.phoenixverse.io` ; embed host `https://embed.prediction.phoenixverse.io/o/{operator_code}?token={JWT}`.
- The entire public/operator HTTP surface (OpenAPI v0.1.0, title "backend_v2") is 6 paths: `GET /health`, `GET /embed/api/config`, `GET /o/{operator_code}/embed/api/config`, `GET /operator/api/categories`, `GET /operator/api/settings`, `GET /operator/api/stats`. (H) No endpoints for markets, books, prices or trades. The OpenAPI description states the player and admin realtime surface is WebSocket-only (Phoenix Channels at `/player/websocket`) and not described. (H)
- Auth: Ed25519 request signatures with headers `X-Operator-Code`, `X-Operator-Environment`, `X-Signature-Timestamp`, `X-Signature-Nonce`, `X-Signature`. Keys are issued/registered via onboarding with Phoenix; hostnames are assigned per operator during onboarding. Rate limits: NOT FOUND (searched llms-full.txt). (H)
- Unauthenticated probes 2026-10-19: `GET /embed/api/config` -> 401 `{"error":"missing_token"}`; `GET /operator/api/settings` -> 401 `{"error":"unauthorized"}`. (H)
- Websocket: Phoenix Channels `/player/websocket` for the iframe player, requires launch JWT; protocol undocumented. Using it would require a minted operator launch token, i.e. being an operator. (H for existence, NOT FOUND for protocol)
- No public market data to sample, so only fixture is the OpenAPI document.

## Trade path

- None for third parties. Player orders originate from the hosted iframe after the operator mints a visitor/player JWT (Ed25519 signed with the operator's key); Phoenix then calls the operator's wallet for funds. There is no documented REST order-placement API. (H) https://docs.prediction.phoenixverse.io/developers/foundation/launch-tokens
- Hosts are fixed to the operator's players; an outside agent would need an operator relationship, a player account at that operator, and operator-side KYC/cashier.

## PayBox reachability

paybox_reachable: **no**. No wallet-signed orders or on-chain transactions exist; funds move through an operator's private ledger. An EVM/Solana wallet cannot trade this venue via transaction proposals. (H, by absence of any chain/contract/signature scheme for end users)

## Fees

- Set by Phoenix per operator; read via `GET /operator/api/settings` `fee_schedule`. Shapes: `kalshi_curve`: `fee = taker_coefficient * price * (1 - price) * quantity` (docs example coefficient 0.07, maker rebate 0), or `flat`: `fee = taker_coefficient * price * quantity`. Charged per fill at trade time on notional (not on profit); taker pays, maker rebate (a share of taker fee) possible. Rounded in the house's favour (taker fee up, rebate down, payouts down). No orders possible if fee_schedule is null. (H) https://docs.prediction.phoenixverse.io/developers/operator-api/settings-and-categories
- Operator-level markups, deposit/withdrawal costs are outside Phoenix and unknown.

## Resolution and dispute risk

- Platform events: Phoenix resolves "from the data feed or the desk" (football fixtures from a data feed, crypto rounds). Operator events: operator staff enters the result with a source link and reason; Phoenix can enter as fallback; an AI "Scout" can propose results which an operator confirms. Results are final; settled markets cannot be re-settled, corrections are new credits. Void options: refund stakes or settle 50/50. (H) https://docs.prediction.phoenixverse.io/operators/guides/resolution-guide
- No on-chain oracle, no public dispute process. Counterparty and resolution risk is centralised in Phoenix plus the operator (payouts also depend on the operator wallet honouring `credit_cash`; failed payouts after 3 refusals wait for manual handling). (H)
- Data feed provider is not named. NOT FOUND.

## Geo / ToS / automation

- Compliance is delegated to operators ("Confirm the fee is allowed in the operator's jurisdiction"; visibility is not a compliance control). No end-user ToS found for scraping or bots. NOT FOUND (searched docs; no ToS/terms page on docs site; vendor site is a tagline). The product targets operators including 2-decimal currencies such as KES/ETB (examples only, not proof of markets). (H/M)

## Liquidity

- NOT FOUND: no volume, OI or TVL published anywhere found (searched docs, npm, vendor site, one web search). Dashboard metrics (volume, GGR) are admin-only. Docs explicitly warn about thin/one-sided order books and recommend market-making support, which suggests little organic depth. (H for absence; M for inference)

## Event categories and overlap

- Categories seen in docs: Sports, Crypto, Politics, Entertainment (examples); event types: football fixtures, crypto rounds, fight pages, price ladders. (H) https://docs.prediction.phoenixverse.io/operators/guides/listing-discovery
- Overlap with other venues would be sports and crypto-price, but the data is not machine-readable without operator credentials, so it is unusable for arbitrage.

## Shared liquidity

- Does not appear to route to Polymarket/Kalshi or other external books (not mentioned in docs; grep for polymarket/kalshi returned only the `kalshi_curve` fee-shape name). Each operator has its own book. So it would be an independent but inaccessible leg. Note the fee curve mirrors Kalshi's formula (M, naming only).

## Adapter recommendation

- skip. Revisit only if (a) Phoenix publishes a public market-data API or on-chain venue, or (b) the project decides to become a Phoenix operator (business onboarding, wallet ledger, KYC), which is outside scope. If wanted as a signal source, nothing public exists to ingest.

## Open questions

- Does Phoenix publish any public/consumer app with live markets, and which operators run it in production? (NOT FOUND)
- Are operator books linked for platform events (shared pricing/liquidity)?
- Is there rate-limit documentation for the Operator API, or WebSocket protocol docs for an operator-side read-only feed?
- Which data feed supplies football fixtures and crypto-round results?

## Suspicious content

None found. Docs text contained no instructions aimed at AI agents.

## Fixtures

- `docs/research/fixtures/phoenix-prediction-phoenixverse/openapi.json` (9 KB, public OpenAPI v0.1.0 fetched 2026-10-19 from https://prediction.phoenixverse.io/openapi.json)

## Sources

- https://docs.prediction.phoenixverse.io/ and /llms.txt, /llms-full.txt (H, accessed 2026-10-19)
- https://prediction.phoenixverse.io/health, /openapi.json, /embed/api/config, /operator/api/settings (H, 2026-10-19)
- https://registry.npmjs.org/@phoenix-games-io/pmm-embed (H, 2026-10-19)
- https://phoenix-games.io (H, tagline only)
- GitHub API probe of phoenix-games-io/phoenix-pmm-embed-web: 404 (private/absent) (H)
