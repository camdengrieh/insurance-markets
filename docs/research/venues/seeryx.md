# Seeryx venue spec (adapter research)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.
Fixtures: `docs/research/fixtures/seeryx/` (unauthenticated GET samples, captured 2026-10-19).

## Verdict

- Live, BETA, brand new (GitHub org created 2026-10-02). [H: https://seeryx.com, https://api.github.com/orgs/Seeryx]
- Has a real, documented, public read API and a documented signed trade API. Technically good, easy to integrate.
- Liquidity is effectively nil: 30-day volume about $616, 24h about $5, zero traded volume on every event market, order books are small 5-share ladders (likely house market-making). [H: GET /api/stats, GET /api/volume/:slug, 2026-10-19]
- adapter_priority: **P2** (signal-only / thin). Cheap to build a read-only adapter because the API is clean; revisit as P1 if volume grows. Not an arbitrage leg today because depth is about $65-85 per market at the displayed prices and no trades occur.

## Identity

- Name: Seeryx. Site https://seeryx.com, tagged BETA. Org description "Solana-native prediction market"; two public repos only (`.github`, `brand`), no contract or SDK source published. [H: GitHub API]
- Not related to "SeerDEX / SEERX" presale (web search surfaced it; unverified, different project, ignore). [L]
- llms.txt itself states the name is unrelated to the YouTuber SeeReax. [H: https://seeryx.com/llms.txt]
- Third-party coverage: NOT FOUND (searched: WebSearch extended "Seeryx prediction market Solana"; only an unrelated presale site appeared).

## Market model

- Three product lines [H: llms.txt, /developers]:
  1. Crypto Up/Down rounds: BTC, ETH, BNB; 5m, 15m, 1h, 1d. Resolves on Binance spot mid (best bid/ask) at open vs close second. Close == open is a tie and every share pays 50c (llms.txt says "unchanged price resolves Down" but market-integrity and help say tie = 50c void after 15 min: the pages conflict; treat tie handling as ambiguous). [H, conflicting]
  2. Stock/ETF Up/Down rounds: 11 tickers (NVDA, GOOGL, AMZN, SpaceX, SPY, META, MSFT, AVGO, TSM, QQQ, MU), 15m rounds during NYSE regular hours, Chainlink data stream vs USDT. [H: llms.txt]
  3. Event markets: Yes/No questions. Multi-outcome questions ("Venezuela leader", "Fed cuts 2026") are modelled as a group of independent binary Yes/No markets (`groupId`, `/api/event-groups`). No neg-risk / mutual-exclusion conversion documented, so group sums may not equal 100% and the scanner must not assume they do. [H for structure; M for "no neg-risk"]
- Mechanism: central limit order book, price-time priority, market + limit + post-only, plus `split`/`merge` (mint/redeem Up+Down pair for $1). Up and Down are one book seen from two sides (Up bid p = Down ask 100-p). For events, up = YES, down = NO. Shares cost 1-99c (tenths of a cent allowed where `tenths:true`), pay $1.00. Min order 5 shares (min is also in `GET /api/fees`: `minOrderShares:5`). [H: /developers, /developers/market-data, /api/fees]
- Tokenisation: positions are accounts inside the Seeryx Solana program (balances of the user's program account), not SPL tokens, so they are not transferable/composable by other programs as far as documented. [M, inferred from "Your USDC sits in your own account of the Seeryx program"]
- Selling stops 5 seconds before close. [H]

## Chains and collateral

- Solana mainnet, USDC (mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, the standard Solana USDC mint). Program id `2uUbvYHqBH1HDVzABGPcqrjHodoBVcNkq6Nrv6MABaiv`, vault `VoytgWPLSMJmwW1ExAuicaxwZQ7Hd3T5EC6pNSoVLDi`. [H: GET /api/funds, fixtures/funds.json]
- Event resolution crosses to Polygon (UMA OOv3, chainId 137) and returns via Wormhole: relay `0x82012f7f38730f983ff5e612e4a7e1c68a64f810`, asserter `0x7c8bcf7abf3cb8e652dee110050b926dbbb25c24`, Wormhole core `worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth`. [H: /api/funds]. Note `/api/events` oracle block reports `chain:5` (an internal id, not 137), and bond currency `0x3c499c...3d03` (Polygon USDC.e-style address, unverified). [H raw value, M interpretation]
- Deposits: USDC/USDT from Solana "and other networks" via a bridge deposit-address flow (`GET /api/deposit/options`, `POST /api/deposit/address`, signed in). Deposit fee 0. [H: llms.txt, /developers/endpoints]. Per-network options not read (needs no auth but not fetched; NOT CHECKED).

## Read API

- exists: official-public. Docs https://seeryx.com/developers (sub-pages /developers/endpoints, /trading, /signing, /market-data, /fees, /limits, /websocket). [H]
- Base URLs: REST `https://seeryx.com/api`; WS `wss://seeryx.com/ws`. CORS blocks browsers on other origins; server-side use is fine. [H]
- robots.txt (for `*`) explicitly allows `/api/events`, `/api/event-groups`, `/api/markets`, `/api/stats`, `/api/rounds/`, `/api/orderbook/`, `/api/trades/`, `/api/volume/`, `/api/leaderboard`, `/api/fees`, `/api/funds$`, `/api/notice`, and disallows the rest of `/api/`, `/ws`, `/health`. The documented public endpoints and the WS are officially meant for bots (developers page), but robots.txt disallows `/ws` for generic crawlers; ToS is silent on bots. (I made one request to `/health` before reading robots.txt; it returned `{"status":"ok"}`. Not repeated.) [H]
- Public (no auth) endpoints [H: /developers/endpoints]:
  - `GET /api/markets`, `/api/markets/upcoming`, `/api/markets/summary`, `/api/markets/:asset/:tf/current`, `/api/markets/:asset/:tf/rounds`
  - `GET /api/rounds/:slug`, `/rounds/:slug/holders`, `/rounds/:slug/activity`
  - `GET /api/orderbook/:slug?side=up|down` -> `{bids:[[priceCents,shares]...], asks:[...]}`, best first, full depth (confirmed live)
  - `GET /api/trades/:slug` (last 100: `id, side, action, shares, price, time(ms)`; side/action/price are the taker's), `GET /api/volume/:slug` -> `{volume,trades}`
  - `GET /api/events`, `/api/events/:slug`, `/api/event-groups`, `/api/event-groups/:id?range=1h|1d|1w|1m|max`, `/api/event-groups/:id/holders`
  - `GET /api/fees` -> `{rateBps:700, rebateBps:2000, minOrderShares:5}`; `GET /api/funds` (program/mint/oracle config); `GET /api/stats`; `GET /api/leaderboard`; `GET /api/profiles...` (public P&L, positions, trades of every trader)
- Event fields confirmed live: `slug, group, groupId, title, question, rules, closesAt(s), createdAt(ms), status(open|closed|resolved), outcome(yes|no|null), resolution, category, tenths, oracle{kind:"uma-oov3",chain,address,currency,minBond:"500000000",minLiveness:7200}, yesClaim, noClaim, label, position, image`. 44 open event markets in 12 groups on 2026-10-19: politics 27, finance 13, sports 4. [H: fixtures/events.sample.json]
- Event-group payload carries per-outcome best `yes/no` bid/ask, `chance`, `change24h`, 1-week `history` (units of chance/change24h undocumented). [H docs; fixtures/event-groups.sample.json]
- WebSocket `wss://seeryx.com/ws`: send `{"subscribe":"round","slug":...}` within 10s (works for event slugs too; full book both sides + last 100 trades + volume, then pushed on change). One round + one account sub per connection, so N markets = N connections. Account channel needs a sign-in token. [H: /developers/websocket; WS not connected by me]
- Rate limits (per IP, public): markets/rounds 1,200/min; orderbook/trades/volume/summary 3,000/min; stats/leaderboard/profiles/holders 300/min; auth nonce/verify 30/min. Orders/cancels 250 per 10s per account; 200 resting orders (100 per market). 429 includes `Retry-After`. [H: /developers/limits]
- Round slugs: `{asset}-updown-{tf}-{startUnix}`, e.g. `btc-updown-5m-1791916200`; event slugs `ev-...`. [H]
- Units: prices in cents (floats allowed with tenths), sizes in shares (4 dp), money USDC with 6 dp, times Unix seconds (rounds) / ms (trades, account). [H]
- Resolution data: `status`, `outcome`, `resolution` on events; `outcome` up|down|tie on rounds. [H]

## Trade path

- Official, documented, programmatic. [H: /developers/trading, /developers/signing]
- Auth: wallet sign-in (`POST /api/auth/nonce` then `/api/auth/verify`) gives a token, sent as `X-Auth-Token` or `Authorization: Bearer`. Every trading POST/DELETE needs `Idempotency-Key` (8-128 chars, remembered 24h).
- Session key: agent generates an Ed25519 keypair locally; `POST /api/relay {action:"session", key, expiresAt (<= maxSessionTtl 31,536,000s), limit (total USDC), maxTrade}` returns a base64 Solana v0 transaction (Seeryx fee payer); the owner wallet signs it (without sending) and it is submitted via `POST /api/relay/submit`. The session key then signs each order offline (byte string with prefix `PMO2`/`PMO3`/`PMO4`, `PMS1` for split/merge; borsh little-endian; fields include owner pubkey, market PDA, u64 id, side, action, limit, shares/budget, expiresAt, maxFeeBps) and the signature goes in the `signed` field of `POST /api/orders` as 128 hex chars. The docs' form-byte table looked inconsistent; verify against the reference sample code before implementing. [H docs; the sample code itself was not read]
- Endpoints: `POST /api/orders`, `POST /api/orders/batch` (1-15), `DELETE /api/orders/:id`, `DELETE /api/orders[?slug=]`, `POST /api/split`, `POST /api/merge`, `GET /api/orders|positions|balance|account`. Body: `slug, side(up|down), action(buy|sell), type(limit|market), shares|amount, limit, cap, postOnly, signed`. Response `{order, filled, remaining, spent, proceeds}`. Errors: `below_minimum, would_take, open_orders_limit, trading_paused, price_tick, rate_limited(429), trading_halted(503)`. [H]
- Session key may withdraw only to the owner wallet (`sessionWithdraw:true` in /api/funds); limits are on-chain bounded by `limit`/`maxTrade`. [H docs, M on enforcement]
- Withdraw: immediate 1 USDC fee, or free after 60s delay. [H]

## PayBox reachability

- paybox_reachable: **partial**. [M]
- It is Solana-only. An EVM-only wallet (Base/Ethereum/BNB/Arbitrum/Polygon) cannot sign orders or the session-setup transaction; there is no EVM order path. Funding from EVM chains is possible through the bridge deposit-address flow (`/api/deposit/address`), and returns come back via bridge withdrawal (not tested, M).
- A PayBox Solana wallet could in principle (a) sign the one-off session transaction (needs a "sign this Solana tx without sending" capability: not verified, I did not call PayBox tools) and (b) fund the program account with USDC. After that, orders are signed by a locally held Ed25519 session key, so no per-order PayBox approval is needed, which is good for scanning bots but means a hot key exists with a USDC `limit` bound. Whether PayBox supports the signing primitive and the wallet sign-in message is OPEN.
- Not a proposal-per-trade integration: orders are off-chain signed messages to Seeryx's matcher, not user transactions.

## Fees

- Taker: `shares x 7% x p x (1-p)` in USDC, p in dollars, rounded down to micro-USDC; max about 1.75c/share at 50c. Buys pay it on top, sells take it from proceeds; market-buy `amount` includes fee. Integer form: `units*rateBps*tenths*(1000-tenths)/100_000_000`. [H: /developers/fees, /api/fees]
- Maker: no fee, receives 20% of the taker fee (`rebateBps:2000`) immediately. `maxFeeBps` in signed orders caps the rate. [H]
- Deposit 0; withdrawal 1 USDC immediate / free after 60s; split/merge/payout free; Solana network fees paid by Seeryx. [H]
- For arbitrage: a 50c round costs about 1.75c/share round-trip entry for the taker (3.5% of notional), a major hurdle; cheaper near extremes.

## Resolution and dispute risk

- Crypto/stock rounds: a single Seeryx-run signing server holds the oracle key and signs the result computed from its own Binance feed (candle fallback if feed >10s stale); program accepts one result after close. Void with 50c payout if no result in 15 min or if the server and exchange disagree. This is a centralised, trusted oracle: key compromise or feed bug is the risk. [H: /transparency, /market-integrity]
- Event markets: UMA Optimistic Oracle v3 on Polygon, proposer bond >= 500 USDC, liveness >= 2h (`minLiveness:7200`), disputes go to a UMA token-holder vote, Wormhole guardians relay the settled answer to Solana. Void (50c) if UMA unsettled 30 days after close. "No key of Seeryx can set or change an event's outcome." Same oracle family as Polymarket, so UMA dispute risk is correlated with Polymarket event legs (same-event arbitrage across the two shares resolver risk, though resolution rules text may differ per market). [H]
- No audit report found; upgrade authority of the program not stated. NOT FOUND (searched: /transparency, /help, /terms, /market-integrity, GitHub org). Treat smart-contract risk as high (beta, unaudited as far as published).
- Rules text for events is free-form per market (e.g. MLB: "official information from MLB; a consensus of credible reporting may also be used"). Mapping to other venues needs rule-level comparison, not title matching.

## Geo, ToS, automation

- Terms: must be 18+ and "allowed to use prediction markets where you live"; no restricted-jurisdiction list found; Fair use bars market manipulation, self-trading to fake volume, exploiting errors, overloading the service. [H: https://seeryx.com/terms]
- Developers page explicitly invites bots ("Use it from a server, script, or bot") and provides sample code; Terms and market-integrity say nothing separate about bots. Seeryx's own market-making accounts quote in the same book and may be exempt from rate limits. [H]
- Privacy: P&L, positions and trades of all traders are public via `/api/profiles`; balances and open orders private. Useful as a signal (copy/flow source). [H]
- Geo-blocking behaviour (IP block) NOT TESTED / NOT FOUND (searched: terms, help, developers).

## Liquidity (2026-10-19)

- `GET /api/stats`: volume24h $4.99 (1 trade, 2 traders), volume30d $615.52 (301 trades). All visible 24h volume was `btc-5m`. [H: fixtures/stats.json]
- Event markets: `/api/volume/:slug` is 0 volume / 0 trades for all 44 open event markets (sampled all). Books are small: typically 5-share clips along a ladder (e.g. `ev-house26-dem` bid 91 / ask 94, 5 shares each; a few outsized resting orders such as 1,149 shares at 0.6c on `ev-trump-out26`). Approximate book value per market about $65-85. This looks like seeded house liquidity, not organic flow. [H data, M interpretation]
- OI / TVL: NOT FOUND (searched: /api/stats, /api/funds, /transparency "On-chain funds" section renders "Loading" only).
- Staleness: all data is same-day; the platform is 17 days old.

## Event overlap with other venues (where arb could exist)

- Politics: US House/Senate 2026 control (D/R), Trump impeached / out before 2027, Netanyahu out, Pahlavi/Iran, Venezuela leader (16 candidates), US aliens, CLARITY Act signed: overlap with Polymarket/Kalshi/PredictIt/Limitless. [H: /api/events]
- Finance/macro: Fed cuts 2026 (0-12 cuts, 13 outcomes). Overlaps Kalshi/Polymarket Fed markets. [H]
- Sports: MLB World Series 2026 (4 teams listed). Overlaps Polymarket/Kalshi. [H]
- Crypto: BTC/ETH/BNB 5m/15m/1h/1d Up/Down: overlaps Polymarket's 5m/15m crypto Up/Down and Kalshi/Limitless short-dated crypto; Binance-mid based resolution differs from Chainlink-based resolution used elsewhere, so basis risk. Stock/ETF 15m Up/Down overlaps Polymarket/Limitless equity rounds. [M: venue overlap claims from my general knowledge, not checked this session]

## Shared liquidity

- liquidity_shared_with: none found. Seeryx runs its own on-chain order book and house market-making accounts; no routing to Polymarket or others documented. [H: market-integrity "liquidity comes from Seeryx's own market-making accounts"; M that no hidden mirroring]
- Oracle (UMA) is shared with Polymarket but liquidity is not.

## Adapter notes

- Read adapter is trivial: poll `/api/event-groups` (best bid/ask per outcome, one call) for cheap top-of-book; use `/api/orderbook/:slug` for depth; `/api/events` for rules/close/oracle; WS only if needed (1 connection per market).
- Normalise: cents -> probability p/100; Up=YES, Down=NO; fractional-cent tenths; fees per formula; min order 5 shares.
- Do not treat group outcomes as a mutually exclusive set for sum-to-1 arbitrage until neg-risk behaviour is confirmed (Venezuela group had 15 outcomes quoting ask 2c each with no bids).
- Crypto/stock rounds are ultra-short (5m/15m); not suitable for cross-venue arb given execution latency, a 3.5% round-trip taker fee and near-zero liquidity.
- Treat as a signal source only (public per-trader P&L and positions) plus an eventual thin leg.

## Open questions

- Does PayBox expose a "sign arbitrary Solana v0 transaction without broadcasting" and "sign message" primitive for the session-setup and sign-in steps? (not tested; no PayBox tools were called)
- Exact byte layout of `PMO2/3/4/PMS1` (docs table looked inconsistent; sample code not read).
- Is there any program audit, upgrade authority or multisig? Where is on-chain TVL?
- Does the event group use neg-risk style conversion?
- Tie handling for crypto rounds: llms.txt says Down, market-integrity says 50c void.
- Geo-blocking and any KYC at deposit time.

## Sources

- https://seeryx.com (home, 2026-10-19) [H]
- https://seeryx.com/llms.txt [H]
- https://seeryx.com/robots.txt [H]
- https://seeryx.com/developers, /developers/endpoints, /trading, /signing, /market-data, /fees, /limits, /websocket [H, fetched via WebFetch summarisation; paths and field lists subject to summariser error, spot-checked against live JSON]
- https://seeryx.com/transparency, /market-integrity, /terms, /help [H, via WebFetch]
- Live GETs 2026-10-19: /api/stats, /api/fees, /api/funds, /api/events, /api/event-groups, /api/markets, /api/markets/summary, /api/orderbook/:slug, /api/trades/:slug, /api/volume/:slug [H]
- https://api.github.com/orgs/Seeryx and /repos [H]
- WebSearch "Seeryx prediction market Solana" (no relevant third-party coverage) [L]
