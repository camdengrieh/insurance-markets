# Venue spec: PredictEX (predictex.com)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale. Where nothing was found the note says NOT FOUND with what was searched.

## Verdict

- **Adapter priority: P2 (signal-only or thin).** Live, has a real official REST API, but: pool TVL about $239K, about $16K/day volume, 7 fixtures listed today, prices are only available via an authenticated quote call limited to 10 per hour per wallet, per-user KYC and server-side custody, and ToS section 18(12) bans bots/automation. [H]
- It is not a price-discovery venue. Its price is an index of sportsbook moneylines (Genius Sports / Sportradar feeds) with a small spread, executed against its own AMM pool. As an arbitrage leg it is an independent pool, but the price it shows is a derived sportsbook consensus, so it is closer to a reference-price signal than to a source of mispricing. [H docs, M inference]
- Do not confuse it with **Pred** (pred.app, Accel-backed $2.5M peer-to-peer sports exchange, also on Base). Different company. [H, search results]

## 1. Liveness [H]

- Mainnet launch post on X: "Public Mainnet is now live! PredictEX is a sports prediction market built on @base ... Available to non-US, verified users only." Tweet id 2067246293349470375 decodes to 2026-06-17 14:01 UTC (snowflake arithmetic); text from a search-result snippet, the tweet itself was not fetched [M]. Consistent with DefiLlama daily volume peaking on 2026-06-17.
- Live today: `GET https://api.predictex.com/health` returned `{"ok":true}`, `/versions` returned app `1.1.1`, `/fixtures` returned 7 open fixtures (NHL x5, EPL x1, NFL x1) with start times 2026-10-19. [H]
- DefiLlama (listing id 8530, category "Prediction Market", chain Base): volume series is non-zero on 186 days from 2026-04-07 to 2026-10-18; last 24h (2026-10-18) $16,420. TVL series 2026-08-28 to 2026-10-19. [H]
- Testnet exists: `https://api-testnet.predictex.com`, app `https://test.predictex.com`. [H, OpenAPI servers block + site bundle]

## 2. Kind and market model

- Kind: on-chain, KYC-gated, centralized-operator **leveraged sports exchange**. Built on the **D8X perpetual-futures engine** (the front-end bundle ships `d8x-futures-node-sdk`, IPerpetualManager ABI, D8X broker/history/websocket hosts). One perpetual per fixture; price is quoted on-chain as `1 + P(home)` in [1,2] (ABDK 64.64 fixed point); the API presents it as a probability in [0,1]. [H: DefiLlama dimension adapter source + bundle; "built on D8X" is M inference from code reuse]
- Model: **binary moneyline per game, AMM pool counterparty** (docs: "dual exchange architecture, AMM + CLOB ... Initially, only the AMM will be live"). Taker-only: `orderType` is MARKET only, LIMIT "not supported yet". No order book to read. [H: `https://predictex.gitbook.io/docs/exchange-architecture.md`, OpenAPI]
- Outcomes: not tokenised. A position is a margin position in the perp keyed by (fixture, team). API leg = `{contractId, outcome=<team code>, side BUY|SELL, market=DRAW_NO_BET, boost 0..100}`. One outcome per fixture per wallet (`-2030` if you hold the other side). SELL only closes, never shorts. Single-leg only, parlays "not live yet". [H: OpenAPI, agents.md]
- `market` accepts only `DRAW_NO_BET` for every league, including baseball/hockey. Draw handling for EPL under this label: NOT FOUND (searched: gitbook docs, ToS, OpenAPI, API docs). Treat EPL as unmappable to 3-way markets until confirmed. [H for the enum, NOT FOUND for draw semantics]
- Boost (leverage) 0 to 100; boosted positions have a `knockout` index price at which the position is lost; unboosted positions have none. League-specific initial margin cap (example in docs: 8 cents per contract). For arbitrage use boost 0 only. [H]
- Markets listed 8-12 hours before game start; in-game trading live. Moneyline only for now (spreads/totals/props "over time"). [H: gitbook event-windows, market-types, FAQ]
- Leagues seen: NFL, NBA, MLB, NHL, EPL (fixtures: NHL, EPL, NFL today). [H]

## 3. Chains and collateral [H]

- Base mainnet (chain 8453) only. Exchange = D8X-style **perpetual manager proxy `0x38c4E93bac87b2fb96931dAB876Bb683D388f1A8`**; DefiLlama's TVL adapter says all collateral (LP pool cash and trader margin) sits in this contract and every market's trades/liquidations are emitted from it. Source: `https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/predictex/index.js`. (Same address appears in the venue's own front-end bundle.)
- Collateral: native USDC on Base (6 decimals). Fiat and other crypto deposits are converted to USDC (FAQ, M).
- Planned token $PREX / vePREX / "Predict-Net" vault: contract addresses "coming soon" per docs; not live. [H: gitbook contract-address]
- Wallet type: front-end uses Privy plus RainbowKit and an ERC-4337 bundler client; API docs say wallet custody and order signing are handled server side via a grant that can be revoked (`-4002`). Whether the account wallet is an embedded EOA or a smart account: NOT FOUND (searched: API docs, gitbook). [H for statements, NOT FOUND for wallet type]

## 4. Read API [H unless noted]

- Docs: `https://api.predictex.com/` (mkdocs), OpenAPI 3.0.3 `https://api.predictex.com/openapi.yaml` (v1.1.1, saved as fixture), Swagger `https://api.predictex.com/swagger`, agent guide `https://api.predictex.com/agents.md`. Gitbook product docs at `https://predictex.gitbook.io/docs`.
- Base URLs: `https://api.predictex.com` (mainnet), `https://api-testnet.predictex.com` (testnet). Version pin header `X-Api-Version: 1`.
- **Unauthenticated** (no key): `GET /`, `/health`, `/time`, `/versions`, `/fixtures`, `/openapi.yaml`, `/swagger`.
  - `GET /fixtures?limit<=100&offset&league&team&bettingOpen` returns `{fixtures[], total, limit, offset}`. Fixture fields: `contractId` (`LEAGUE_AWAY_HOME_YYMMDD`, e.g. `NFL_DAL_GB_261018`), `league`, `homeTeam`, `awayTeam`, full names, `startTime`, `refTime`, `acceptingBets`, `gameEnded`, `minContracts`, optional `homeScore`/`awayScore`/`period1-3`. **No prices.** Only fixtures with a tradable market are listed. Live sample verified 2026-10-19 (fixture `fixtures-list.json`).
- **Authenticated, read permission** (HMAC signed): `POST /order/rfq` (the only way to get a price: `entryPrice`, `indexPrice`, `contracts`, `cost`, `maxWin`, `exitValue`, `knockout`, `minContracts`, `exchangeCapacity`, `quoteExpiresAt`), `GET /order`, `/orders`, `/orders/updates?since=`, `/positions`, `/balance`, `/settlements`, `/limits`.
- Prices / book: no public price, book, or last-trade endpoint in the official API. NOT FOUND (searched: OpenAPI paths, endpoint summary page, agents.md, gitbook "API" page). Websocket in the official API: NOT FOUND (same sources).
- Trades history (public alternative): on-chain `Trade` and `Liquidate` events on the perpetual manager give per-trade `price` (1+P(home), ABDK 64.64), `newPositionSizeBC`, `fFeeCC`, `brokerFeeTbps`; event ABI is in the DefiLlama dimension adapter `https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/predictex/index.ts`. Using these for a last-trade price signal is a design option, not tested here (no RPC calls made, since JSON-RPC is POST). [M]
- Front-end uses undocumented hosts (D8X `ws-8453.d8x.xyz`, `history-8453.d8x.xyz`, `api-8453.d8x.xyz`, `broker-8453.d8x.xyz`, `sports-base.d8x.xyz`, plus `sportsline-api.quantena.org` for scores/websocket). They are not documented by PredictEX; not probed. Treat as unofficial. [H that they exist in the bundle, hosts unprobed]
- **Auth**: API key created by a logged-in user in the web app (Account, API Keys); permissions `read` or `trade`. Headers `X-Api-Key`, `X-Timestamp` (ms), `X-Recv-Window` (100..60000, recommended 5000), `X-Signature` = hex HMAC-SHA256(secret, timestamp + apiKey + recvWindow + METHOD + path + payload) where payload = raw body, or raw query string for GETs. Each signature is single-use. `GET /time` for clock sync. Key management endpoints need a web session (`-1023`) and are not documented. [H]
- **Rate limits** [H, `https://api.predictex.com/ratelimit/`]: per IP 100 rps burst 200; per wallet per group: `quotes` (POST /order/rfq) **10 per hour, burst 5**; `positions` 10/hour burst 5; `balance` 10/hour burst 3; `orders` (POST /order) 120/min burst 20; `reads` 60/min burst 10; `fixtures` 120/min burst 20 keyed by IP. Basic quote rates need the wallet funded with at least $5. Every $100 of opening notional earns +10 extra calls on quotes/positions/balance for 12 hours (cap 3600 outstanding). Unfunded wallet gets 2 free balance checks per hour. A scanner polling prices for many fixtures through RFQ is therefore infeasible without trading volume.
- Money fields are strings with 2 decimals; prices are probability strings; sizes are whole contracts; timestamps are Unix ms (except `/settlements` RFC 3339).

## 5. Trade path [H]

1. Human signs up in the web app: KYC at signup (name, DOB, country, address); enhanced Persona verification when cumulative deposits+withdrawals reach about $2,000, trading frozen until done. Create API key (secret shown once).
2. Fund the account wallet with USDC on Base (minimum $5 for quotes/orders).
3. `POST /order/rfq` (read key) to price; `POST /order` (trade key) with `rfqId` (valid 30 to 60 s, docs disagree: OpenAPI text says 30 s in one place and "one minute" in another, agents.md says 60 s) or inline FAK. `clientOrderId` is the idempotency key. Response `202 SUBMITTED` means broadcast, not filled; poll `GET /order` or `/orders/updates`. Statuses: CLAIMED, SUBMITTED, OPEN, FILLED, CANCELED, EXPIRED, REJECTED, FAILED. FOK only with a quote and `marketUnit QUOTE`; FAK either unit. No cancel endpoint (market orders only). Closing = `side SELL`, `marketUnit BASE`, no boost.
4. Signing happens **server side**: PredictEX's broker signs the order and submits the tx on Base (`-2023` "broker refused to sign"; on-chain order struct carries `brokerSignature`). The client never signs an order or a transaction. [H for API text, M for the broker-signature inference from the ABI]

## 6. PayBox reachability: **partial** (funding only)

- A PayBox EVM wallet on Base can send USDC to the PredictEX account wallet (plain ERC-20 transfer), but cannot place orders: there are no client-side signed orders or user transaction proposals to the exchange contract, because the on-chain order needs the operator's broker signature and the API signs for the user. [M]
- Trading needs a per-user HMAC key+secret created after a human web login and KYC. PayBox plugin secrets are host-scoped brokered static headers and shared owner-level (see `docs/research/06-paybox-platform.md` section 8), which cannot compute a per-request HMAC; a per-user HMAC adapter would need the same author-operated relay design as XO. Passing the secret as a tool argument is rejected there. [M]
- Whether the account wallet can be an external wallet connected through RainbowKit and then granted to the server signer: NOT FOUND.

## 7. Fees [mixed, conflicting sources]

- Gitbook "Trading Fees" page: flat **0.6%** of notional (and FAQ says 0.6%). Second gitbook page (`trading-fees-1`): flat **0.2%** platform fee **plus a Platform Stability Adjustment** on boosted positions only (dynamic in price, boost, time left, score, league), charged partly up front and baked into Max Payout; and a "Performance Adjustment" on winners' gains (risk-management page). The ToS also lists taker/maker fees, spread costs, leverage activation fees, withdrawal fees, inactivity fees via a "Fee Schedule published on the Platform" (not located). Which gitbook figure is current: unresolved (L).
- In API terms: `cost = margin + fees`, `exitValue` is net of "broker and exit fees"; spread is `entryPrice` vs `indexPrice` (doc example 0.5928 vs 0.5910, about 18 bp of probability on a $100 boosted quote, M). Per-trade fee is observable on-chain (`fFeeCC`, `brokerFeeTbps`).
- Payer: trader (taker). Unboosted trades should not pay the stability adjustment. Cross-venue edge model should use a quote (RFQ) rather than a formula until the fee schedule is resolved.

## 8. Resolution and dispute risk [H docs, M on risk]

- Index price = weighted average of live sportsbook moneylines from Genius Sports and Sportradar. At the end of the event it settles to 100 cents (home wins) or 0 (away wins). [H: gitbook index-price]
- ToS (v2.0, last updated 2026-05-28, operator Sportsline Technologies N.V., Curaçao licence): the Company decides handling of postponed/suspended/cancelled/abandoned games, data-provider errors and scoring corrections, may void bets or refund, settle to a defined outcome, or cancel markets, and its determinations are "final and binding". No on-chain or third-party dispute path. Governing law: courts of Curaçao (arbitration clause left as a template placeholder in the PDF). [H]
- Additional counterparty risk: ToS section 15 says a shortfall in leveraged markets may lead to payouts being "reduced, delayed, capped, haircut, socialized" across users; the platform maintains a stability reserve and liquidation vault. [H]
- Centralised settlement source differs from Polymarket (UMA) and Kalshi (rulebook): resolution can diverge on ties, OT/shootout, postponed games and corrections, so cross-venue pairs are not risk-free. [M]
- Audit: gitbook says the Exchange contract was audited by "Clarified Labs"; the report was not located. [H claim, NOT FOUND report]

## 9. Geo, ToS, automation [H, `https://app.predictex.io/policies/terms-and-conditions.pdf`]

- Restricted jurisdictions include the US and territories, UK, Australia, Singapore, Curaçao, Netherlands and constituent territories, France, Belgium, Spain, Russia, Belarus, comprehensively sanctioned places; enforced via geofencing, IP screening, VPN/proxy detection, device fingerprinting, KYC.
- Section 4: use only "for your own account, in your personal non-professional capacity". Section 18(11): one account per natural person (KYC deduplication; forfeiture of all related accounts on breach).
- Section 18(12): "use bots, scripts, crawlers, scrapers, automation, latency-arbitrage systems, quote stuffing, wash trading ..." is prohibited. Section 18(13): no exploiting "stale prices ... oracle errors". Section 18(18): no resale or unauthorised access.
- This conflicts with the official trading API and its agent guide. The ToS does not carve the API out of 18(12) (the PDF mentions "API" only in definitions and the right to discontinue it). Ambiguity should be resolved with the operator before building a trading adapter. [H text, M interpretation]
- robots.txt allows all; the API and docs are public. [H]

## 10. Liquidity [dated]

| Metric | Value | Source and date |
|---|---|---|
| TVL (USDC held by exchange contract, pool plus margin) | $238,588 | DefiLlama `api.llama.fi/protocol/predictex`, 2026-10-19 [H] |
| TVL range since 2026-08-28 | $238.2K to $242.0K | same [H] |
| Volume 24h (USDC committed) | $16,420 | DefiLlama dexs, day 2026-10-18 [H] |
| Volume 7d / 30d | $142,463 / $685,070 | same [H] |
| Volume all time | $4.61M (first non-zero 2026-04-07, peak $151,083 on 2026-06-17) | same [H] |
| Listed tradable fixtures | 7 (all accepting bets) | `GET /fixtures`, 2026-10-19 [H] |
| Per-quote capacity | `exchangeCapacity` field per RFQ (live value not read; needs key) | OpenAPI [H for field, value NOT FOUND] |

DefiLlama volume is "USDC committed" (price-1 per contract long, 2-price short), not notional; max payout traded is reported separately as notional contracts. Flat TVL suggests a mostly static LP pool with little user margin. Open interest: NOT FOUND (DefiLlama open-interest endpoint returned 400, searched).

## 11. Event overlap for arbitrage

- Categories: US pro sports moneylines (NFL, NBA, MLB, NHL) and EPL. Overlaps with Polymarket, Kalshi, Limitless, Azuro/Overtime-style sports venues and, by construction, with sportsbook lines. No politics, crypto-price or macro markets (FAQ mentions a future "non-sporting events Yes/No" type, nothing live). [H]
- Matching key: `contractId` embeds league, away code, home code and date (UTC date, `LEAGUE_AWAY_HOME_YYMMDD`), which makes fixture-level matching to other venues straightforward; team codes follow the league's abbreviations. [H]
- Edge shape: PredictEX price tracks the sportsbook index, so differences versus Polymarket/Kalshi prices are mostly those venues' deviation from sportsbook consensus. Capacity is small (pool $239K, taker fee, spread). Price freshness for EPL is complicated by the DNB label.

## 12. Does it share liquidity with another venue?

- It has its own USDC pool in its own contract (independent counterparty). It does **not** read liquidity from Polymarket/Kalshi; its overview calls itself "the derivatives layer" on top of spot event markets, which is marketing language, not a liquidity link. [H]
- Price source = Genius Sports/Sportradar moneylines per docs. The bundle also contains a generic D8X "polymarket" price-feed type (used for other-chain configs and a `clob.polymarket.com/midpoint` fetch helper); the Base mainnet config references an "odin" feed. Whether the Base index ever incorporates Polymarket prices: NOT FOUND. If it did, its price would be partly derived from the leg you would hedge on. [M]

## 13. Suggested adapter scope (if built)

1. Read-only, unauthenticated: `GET /fixtures` for inventory and schedule (cheap: 120/min per IP) to know which games PredictEX lists and when `acceptingBets`.
2. Optional price signal: on-chain `Trade` event indexer on Base (`price` field) instead of RFQ.
3. No trading adapter until (a) the ToS automation clause is clarified with the operator, (b) fee schedule resolved, (c) a per-user HMAC custody story exists.

## Not found (searched)

- Public price/book/last-trade endpoint and websocket in the official API (OpenAPI, endpoint summary, agents.md, gitbook API page).
- Draw handling for `DRAW_NO_BET` on EPL fixtures (gitbook, ToS, OpenAPI).
- Fee Schedule page referenced by the ToS; current authoritative fee number.
- Audit report from "Clarified Labs" and verified source/proxy implementation address (Blockscout is behind a Cloudflare challenge, Basescan needs a key; WebFetch got 403).
- Open interest, per-market volume, `exchangeCapacity` live values (needs authenticated RFQ, not attempted).
- Public GitHub repo for the exchange (DefiLlama lists none).
- Per-user position data publicly (positions are on-chain via events, but no indexed endpoint).

## Open questions

- Is the Base index purely sportsbook-derived, or Polymarket-fed (odin feed)? Affects independence as an arb leg.
- Is automated API trading permitted under ToS 18(12) despite the published API?
- Is the PredictEX account wallet an external EOA / smart account that PayBox could own, or a Privy-embedded wallet only the server can sign for?
- What is the real all-in cost (fee schedule, stability adjustment on boost 0, spread) per $100 unboosted?

## Suspicious or agent-directed content

- The API intro page and OpenAPI instruct agentic clients to fetch `/agents.md`. I fetched it as documentation; its content was ordinary API usage (signing, quotas, error handling, an "earn extra calls by trading" mechanic) with no instructions beyond that. No instruction was followed.
- The bundled front-end JS embeds third-party client keys and IDs (chat, Privy, Persona). Not recorded here.

## Sources

- https://www.predictex.com/ (SPA shell, 301 from predictex.com; meta: "Trade on NFL, NBA, MLB, NHL and more with leverage") [H]
- https://api.predictex.com/ , /authentication/ , /endpoints/ , /fixtures/ , /orders/ , /positions/ , /balance/ , /settlements/ , /ratelimit/ , /errors/ [H]
- https://api.predictex.com/openapi.yaml (v1.1.1) and https://api.predictex.com/agents.md [H]
- https://predictex.gitbook.io/docs/llms.txt and pages: predictex/overview, index-price, index-price-1, trading-fees, trading-fees-1, risk-management, exchange-architecture, market-types, event-windows, security, regulatory-and-compliance, faq, sporting-event-example, contract-address, other/api (append `.md`) [H]
- https://app.predictex.io/policies/terms-and-conditions.pdf (v2.0, 2026-05-28) [H]
- https://www.predictex.com/assets/index-BytJUcJA.js (front-end bundle: D8X SDK config, Base proxy address, hosts) [H for contents]
- https://defillama.com/protocol/predictex (page returned 403 to WebFetch); data via https://api.llama.fi/protocol/predictex and https://api.llama.fi/summary/dexs/predictex?dataType=dailyVolume [H]
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/predictex/index.js and https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/predictex/index.ts [H]
- https://x.com/PredictEX/status/2067246293349470375 (launch post; seen via search snippet only) [M]
- Search results distinguishing Pred (pred.app): https://dailycoin.com/pred-raises-2-5m-high-speed-sports-prediction-exchange-base/ [M]
- Fixtures saved under `docs/research/fixtures/predictex/`: `fixtures-list.json`, `system-endpoints.json`, `defillama-volume-summary.json`, `defillama-tvl-summary.json`, `openapi-v1.1.1.yaml`.
