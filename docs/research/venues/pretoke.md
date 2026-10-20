# PreToke (adapter spec)

Researched 2026-10-19. Verdict: **skip** (Polymarket mirror with custodial TON deposits and no native liquidity; not an independent arbitrage leg).

Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Summary

PreToke is a Telegram mini-app prediction market on TON. Its catalogue is auto-imported from Polymarket, and the live quotes and "volume" it serves are Polymarket's own numbers. The native order book is empty and native 24h volume is 0 on the market I checked. Trades are matched off-chain on a custodial platform ledger. TON settlement is only a background mirror. It is live (API answering, Sports events synced minutes before my check), but it adds no independent price information. [H]

## Is it still live (2026)?

- `GET https://predict.pretoke.xyz/health` returned `{"status":"ok"}` on 2026-10-19. [H]
- Sports events had `lastSyncedAt` 2026-10-19T05:02Z. Crypto and Politics events had `lastSyncedAt` of 2026-06-26 to 2026-06-30, so those categories are stale and show no prices. [H]
- Repo `PreToke/ton-prediction-market` was created 2026-06-27, last pushed 2026-07-01 (a single "audit contract" commit), 0 stars, Apache-2.0, and not archived. [H] https://github.com/PreToke/ton-prediction-market
- Landing page https://www.pretoke.xyz/ lists docs, a Telegram channel (t.me/pretoke) and a mini-app bot (t.me/pretoke_bot/pretoke_app). It shows no volume or user stats. [H]
- Intermittent `503 SERVICE_UNAVAILABLE` on `/events?category=Sports&pageSize=100`. The same query with `pageSize=50` succeeded a few seconds later. [H]

## Kind and market model

- Binary YES/NO markets only (`outcomes: ["Yes","No"]`). Prices run 0.01 to 0.99 with `tickSize` 0.01. Winning shares pay 1 USDT. [H] https://docs.pretoke.xyz/introduction.md
- Events contain several binary markets (for example one per team in a "Champion" event). There is no scalar or native categorical type. [H]
- Pricing uses a hybrid: an off-chain CLOB (GTC and FOK limit orders, with mint-match and merge-match) plus an LMSR AMM. Market orders are smart-routed and the trade response reports `venue` as CLOB, AMM or HYBRID. [H] https://docs.pretoke.xyz/how-it-works/orderbook-vs-amm.md
- Outcome tokens follow the Conditional Tokens Framework (split/merge/redeem on a ConditionRegistry contract, with Q64.64 fixed-point math). Per the settlement docs, on-chain settlement is queued after the off-chain fill. [H] https://docs.pretoke.xyz/how-it-works/settlement-explained.md
- The repo has no mainnet addresses, and the only Jetton in it is a test USDT. I could not tie the docs to a deployed mainnet contract. [H for repo contents; mainnet deployment NOT FOUND (searched: README, Acton.toml, deployment-guide.md)]

## Chains and collateral

- Chain: TON only. Collateral: USDT as a TON Jetton. [H] https://docs.pretoke.xyz/getting-started/depositing-funds.md
- Funds are custodial. A deposit goes to a per-user deposit address that "only the platform's infrastructure can move funds out of", swept into the platform's main custody wallet. Withdrawals are USDT transfers from the platform wallet. [H] https://docs.pretoke.xyz/how-it-works/settlement-explained.md
- Inconsistency: the landing page says winning shares "pay 1 TON each", while the docs say 1 USDT. [H] I trust the docs, but the question is unresolved.
- The repo README calls the protocol "decentralized", but the docs describe a custodial off-chain ledger. [H]

## Read API (official, public for market data)

- Docs: https://docs.pretoke.xyz/api-reference/overview.md (index at https://docs.pretoke.xyz/llms.txt). [H]
- Base URL: `https://predict.pretoke.xyz/api/v1`. WebSocket: `wss://predict.pretoke.xyz/ws` (Socket.IO). [H]
- Public endpoints, no auth:
  - `GET /events?category=<Sports|Crypto|Politics|E-sports|Culture|Economics|Tech>&page=&pageSize=` (pageSize 1-100). `category=all` is rejected with a 400, even though the docs list `all` as the default. [H]
  - `GET /events/search?query=<text>`. The docs say `q`, but the live API wants `query` (`q` returns a validation error). [H]
  - `GET /events/:id` returns the event with its markets and live prices.
  - `GET /markets/:id` (5s cache) returns `buyYesPrice`, `buyNoPrice`, `sellYesPrice`, `sellNoPrice`, `volume`, `rulesPrimary` and an inline `orderbook`.
  - `GET /markets/:id/orderbook?outcome=YES|NO` (top 10 levels, `price` and `quantity` in micro-units, `numOrders`).
  - `GET /markets/:id/price-history` (OHLC candles).
- Not public: portfolio, trades, balances and orders (Bearer JWT).
- Rate limits: reads 100 req/60s, trades 10 req/60s, with `X-RateLimit-*` headers and 429 plus `Retry-After`. The limit is per user, or per IP if unauthenticated. [H]
- WebSocket channels are `market` (price updates), `book` (snapshot, then incremental) and `user` (JWT needed). The server drops clients that do not send `ping` within 10s. [H]
- Shape drift versus the docs:
  - The live list response nests one level deeper (`data.data[]`, `data.total`, `data.hasNext`), whereas the docs show a top-level `pagination` object. [H]
  - Fixtures are in `docs/research/fixtures/pretoke/`.
- The status enum is `open|closed|resolved|resolution_failed|cancelled`. [H]
- Stale-data quirk: Crypto and Politics events (last synced in June) report `volumeUsd` in micro-units (about 4.5e13), and their markets have null prices. Live Sports events report `volumeUsd` in dollars (about 4.5e7). Any adapter must gate on `lastSyncedAt` freshness and null prices. [H]
- Warning: `buyYesPrice` and `buyNoPrice` do not sum to 1 (0.63 + 0.39). They look like ask quotes per side. A scanner must use the correct side. [H]

## Why it is not independent (key finding)

- Every Crypto and Politics event has `externalEventId` "POLY-<n>", and Sports events carry bare Polymarket ids. The system overview says the Autofill Service imports events "currently sourced from Polymarket's public event catalog". [H] https://docs.pretoke.xyz/how-it-works/system-overview.md
- Side-by-side check at 2026-10-19 ~05:03Z for "Will the Milwaukee Brewers win the 2026 World Series?":

| | Polymarket (Gamma `/markets/1235568`) | PreToke (`/markets/a24c06ea...`) |
|---|---|---|
| Best bid / ask | 0.615 / 0.628 | sell 0.61 / buy 0.63 |
| Volume | 2,035,984.69 | 2,035,984 |

  - The volume matches to the dollar, so PreToke republishes Polymarket's volume. [H]
  - The orderbook for that market is empty on both outcomes, and `price-history` shows `volume24h: 0` and no candles. [H]
- Sports sample: 56 of 134 markets in the first 50 events had prices. Many of those were at 0.00/1.00 or 1.00/0.00 extremes, which means resolved or decided on Polymarket while PreToke still shows `open`. [H]
- Conclusion: quotes are a lagging echo of Polymarket (sync interval about 30 to 60 minutes, `updatedAt` 04:30Z against a 05:03Z check). There is no price discovery and no usable independent liquidity. [M, inferred from the above]

## Trade path

- Auth is TON Connect login: `POST /auth/connect` with an ed25519 proof from a TON wallet (public key, domain, payload, timestamp), giving a 24h JWT. There are no API keys. [H] https://docs.pretoke.xyz/api-reference/auth.md
- Orders are placed through `POST /orders` (GTC/FOK limit), `POST /trade/amm`, `POST /trade/market` and `DELETE /orders/:id`, and `POST /redeem/:marketId` redeems. Deposits go to an assigned deposit address, and `POST /withdraw` withdraws. [H] https://docs.pretoke.xyz/api-reference/trading.md
- I did not call any of these (read-only research). The domain the proof must match is a configured value, and the docs example shows `ton-prediction.app`. I could not verify the real value.
- Programmatic order placement is therefore possible only with a TON ed25519 wallet that can sign TON Connect proofs. Orders themselves are authorised by the JWT, not by per-order signatures. [H]

## PayBox reachability

- **No.** The venue needs a TON wallet and TON USDT. The known PayBox chains (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) do not include TON. I did not check the live PayBox chain list, so this rests on the chain list given in the task. [M]
- An EVM wallet could not trade here, because there are no EVM contracts and no signed-order scheme for EVM. Bridging USDT to a TON deposit address would also hand funds to a custodial hot wallet. [H on venue design]

## Fees

- AMM fee: `fee = abs(netCost) * feeRate / 10^18`, paid by the trader on top of cost and accumulated to the contract owner. The example `POST /trade/amm` response shows `fee: 158750` on `totalCost: 31810000` (about 0.5%, a docs example, not a live trade). [H]
- The live platform fee rate, the CLOB maker/taker fees, and the deposit/withdrawal fees: **NOT FOUND** (searched: docs introduction, placing-a-trade, trading API, landing page). TON gas is paid by the user.

## Resolution mechanism and dispute risk

- Each condition has a designated oracle address that reports payout numerators on-chain, and holders redeem against it. "The oracle... can be the platform itself, or an external data source." [H] https://docs.pretoke.xyz/using-the-platform/market-resolution-and-redemption.md
- The oracle identity, dispute process and timeline are NOT FOUND in the docs.
- Because the markets are Polymarket mirrors, resolution will probably follow Polymarket's outcome, but that is unverified [L]. Rules text is copied from Polymarket. Both venues mapping to the same outcome is not guaranteed.
- The owner can pause, close and change the fee on the AMM contract. [H] The oracle and owner are centralised and trusted, and funds are in platform custody.
- The status enum includes `resolution_failed` and `cancelled`, so failure modes exist. [H]

## Geo, ToS and automation

- The landing page claims "no geographic restrictions". No Terms of Service or privacy policy link was found on the page. [H]
- The docs have no policy on bots, though they explicitly invite "bots, dashboards, or third-party integrations" in the API reference. [H]
- The mirrored Polymarket content has its own terms (US restrictions apply to Polymarket global), and I did not assess redistribution rights.

## Liquidity

- Native liquidity: effectively none observed. Empty book and zero 24h volume on a high-volume mirrored market, checked 2026-10-19. [H]
- No TVL, OI or user counts are published anywhere I could find (landing page, docs, repo). The `volume` and `volumeUsd` fields are copies of Polymarket numbers and must not be read as PreToke volume. [H]
- I did not scan all 3,390 Sports, 624 Crypto and 3,473 Politics events for any non-empty native book. I checked only the Brewers book and one other market's book (Barcelona). A native-liquidity check at scale would need many calls.

## Category overlap (arbitrage relevance)

- Categories: Sports, Crypto, Politics, E-sports, Culture, Economics, Tech. Everything overlaps because everything is copied from Polymarket. [H]
- Overlap with other venues is therefore the same Polymarket liquidity (see below), which makes this a duplicate, not an arbitrage leg.

## Liquidity shared with

- Polymarket (quotes, volume and catalogue are all sourced from it). **Not an independent leg.** [H]

## Adapter notes (only if it is ever used as a signal)

- Could serve only as a delayed Polymarket echo, so there is no reason to build it. If someone insists: poll `/events?category=Sports&pageSize=50`, key on `externalEventId` (maps to Polymarket ids), ignore events whose `lastSyncedAt` is older than about 2h, and drop any market with null prices or with 0/1 extreme quotes.
- To detect any genuine native liquidity in future, watch `GET /markets/:id/orderbook` for non-empty books and `price-history.volume24h > 0`, or subscribe to the WebSocket `book` channel.

## Suspicious content

- Every docs page and `llms.txt` end with an "Agent Instructions" block (standard GitBook boilerplate) telling AI agents to call `GET https://docs.pretoke.xyz/<page>.md?ask=<question>&goal=<user_goal>`. I did not call it. I read the plain `.md` pages instead. [H]
- The repo contains `AGENTS.md` and `.kiro` files. I did not read or follow them.

## Sources

- https://docs.pretoke.xyz/llms.txt (page index) [H]
- https://docs.pretoke.xyz/introduction.md [H]
- https://docs.pretoke.xyz/api-reference/overview.md, `auth.md`, `events-and-markets.md`, `trading.md`, `websocket.md`, `errors-and-rate-limits.md` [H]
- https://docs.pretoke.xyz/how-it-works/system-overview.md, `orderbook-vs-amm.md`, `settlement-explained.md` [H]
- https://docs.pretoke.xyz/getting-started/depositing-funds.md, https://docs.pretoke.xyz/using-the-platform/placing-a-trade.md, `market-resolution-and-redemption.md` [H]
- https://docs.pretoke.xyz/smart-contracts/lmsr-market-maker.md, `condition-registry.md`, `architecture-overview.md` [H]
- https://www.pretoke.xyz/ (landing, via fetch summary) [H, but a summarised extraction]
- Live API GETs against https://predict.pretoke.xyz/api/v1 on 2026-10-19 (unauthenticated) [H]
- https://gamma-api.polymarket.com/markets/1235568 (one unauthenticated GET, for the mirror check) [H]
- https://github.com/PreToke/ton-prediction-market (via `gh api`: metadata, commits, README, Acton.toml, deployment-guide.md) [H]
- WebSearch was unavailable (session search budget exhausted), so there are no independent third-party sources for volume, users or reputation. Everything here is from PreToke itself or direct API reads. Nothing independently corroborates the venue's claims.

## Fixtures

Under `docs/research/fixtures/pretoke/`:
- `events-list-sports-trimmed.json`
- `event-detail-trimmed.json`
- `market-detail.json`
- `orderbook-empty.json`
- `price-history-empty.json`

No personal identifiers were put into any request. All requests used the User-Agent `insurance-markets-research/0.1`.
