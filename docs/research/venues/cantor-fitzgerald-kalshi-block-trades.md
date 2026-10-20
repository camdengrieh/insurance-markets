# Cantor Fitzgerald (Kalshi block trades)

Researched 2026-10-19. Tags: H = read first-hand this session in a primary or direct source, M = secondary/inferred, L = weak/stale.

## Verdict

Skip as an adapter. Cantor is a human-arranged broker channel into Kalshi, not a venue. It has no API, no public book, no price feed and no on-chain rail. Its liquidity is Kalshi's (clearing and settlement) plus Susquehanna's quotes, so it is NOT an independent arbitrage leg. The only useful pieces are on Kalshi's side: Kalshi's public trades endpoint flags block prints (`is_block_trade`), and Kalshi has its own block-trade proposal API. Both belong in the Kalshi adapter, not a Cantor adapter.

## What it is

- Cantor Fitzgerald & Co. (Global Markets) acts as introducing broker and arranges off-book block trades in Kalshi event contracts for roughly 3,000 institutional clients (hedge funds, family offices). Announced 2026-08-19. [H] financemagnates, thetradenews
- Susquehanna Predictions (SIG's prediction-markets arm) prices the trades and provides liquidity. [H]
- Terms are negotiated at one price away from the central order book. [H]
- Status: live per The TRADE ("has begun offering", article dated 2026-08-21) [H]. CoinDesk frames it as a "plan", and coverage disagrees on launch vs plan [M]. No volume, onboarding count, fee or minimum-size disclosure found in any coverage. [H]
- Cantor says it expects to add venues beyond Kalshi later, no timeline. [H] financemagnates
- Custom contracts: institutions can propose bespoke contracts (e.g. AI supply-chain risk); no timeline. [H] Kalshi's own page says listing existing certified specs can take days, new terms need CFTC recertification. [H] institutional.kalshi.com
- Contract categories named: weather, commodity prices, corporate results (iPhone sales), climate, economic indicators. [H]
- Similar channels already exist: Clear Street, Marex, Talos, Interactive Brokers, Greenlight Commodities/Jump (April block trade). [H] financemagnates, [M] CoinDesk

## Market model, chains, collateral

- Instruments are Kalshi binary event contracts, each settling at $1 or $0. [H] institutional.kalshi.com
- Off-chain, CFTC-regulated exchange (Kalshi), USD collateral, pre-funded Kalshi accounts. No chain, no token, no on-chain collateral. [H] (institutional page: "Pre-fund the Kalshi accounts")
- Cantor's own channel: NOT FOUND (searched: cantor.com returned HTTP 403 to WebFetch; no Cantor press release found via search).

## Read API

- Cantor: none. NOT FOUND (searched: cantor.com 403, news coverage, search for API). [H that coverage does not mention one]
- Kalshi (the underlying venue), relevant parts only:
  - Docs: https://docs.kalshi.com. Base URLs: `https://api.elections.kalshi.com/trade-api/v2`, `https://external-api.kalshi.com/trade-api/v2`; demo `https://demo-api.kalshi.co/trade-api/v2`. [H]
  - `GET /markets/trades?ticker=&min_ts=&max_ts=&limit<=1000&cursor=&is_block_trade=` is public and unauthenticated in practice (I got HTTP 200 without credentials). Docs: block trades are included by default; `is_block_trade` true = off-book (RFQ or negotiated block), false = order book. [H] docs.kalshi.com/api-reference/market/get-trades
  - Each trade row carries `is_block_trade`, `yes_price_dollars`, `no_price_dollars`, `count_fp`, `taker_side`, `created_time`, `ticker`, `trade_id`. Confirmed shape 2026-10-19; fixture: `docs/research/fixtures/cantor-fitzgerald-kalshi-block-trades/kalshi-markets-trades-sample.json`. [H]
  - Caveat: `is_block_trade=true` timed out (HTTP 504 `context_deadline_exceeded`) on 3 attempts (with and without `min_ts`; also `/historical/trades`), and 1000 consecutive recent trades contained zero block prints. Block prints are rare. A scanner should page the unfiltered feed and filter client-side. [H observation]
  - Block trades are published separately from regular trades. [H] help.kalshi.com/en/articles/15165864-block-trades
  - Rate limits: not stated on the trades page. See the Kalshi venue note.
- A block print cannot be attributed to Cantor. No broker field is documented in the trade row. [H, absence in the response shape]

## Trade path

- Via Cantor: human/desk relationship; negotiated off-exchange; both parties must be ECPs; Cantor's eligibility and onboarding not published. API/FIX for Cantor: NOT FOUND. [H]
- Via Kalshi directly (the actual programmatic route): authenticated API with `KALSHI-ACCESS-KEY`, `KALSHI-ACCESS-SIGNATURE` (RSA-PSS SHA-256 or Ed25519), `KALSHI-ACCESS-TIMESTAMP`. Endpoints: `POST /communications/block-trade-proposals` (fields: `buyer_user_id`, `seller_user_id`, `market_ticker`, `price_centi_cents`, `centicount`, `maker_side`, `expiration_ts`, optional subaccounts 0-63), `GET /communications/block-trade-proposals` (status, `buyer_accepted`, `seller_accepted`, `executed_ts`), `POST .../accept-block-trade-proposal`. Also RFQ/quote endpoints and a communications WebSocket. [H] docs.kalshi.com llms.txt and endpoint pages. The docs do not state who may call the block endpoints (403 "insufficient permissions"); access tier NOT FOUND.
- Not exercised: I made no authenticated or POST calls.
- Minimum sizes: 25,000 contracts (non-sports), 50,000 (sports); help center says 25,000 flat. Separate orders cannot be aggregated. Report within 15 minutes of agreement. [H] help.kalshi.com, institutional.kalshi.com. Sources differ on sports.

## PayBox reachability

No. USD fiat-margined, broker-intermediated, ECP-only, off-chain. No EVM or Solana transaction or signed order exists for it. Kalshi on-chain tokenisation routes (DFlow on Solana) are covered in other notes and are retail order-book access, not block access. [M]

## Fees

Block fees not published by Kalshi or Cantor. Kalshi says only that market makers may get reduced fees and points to kalshi.com/fee-schedule. Cantor commission: NOT FOUND. [H absence]

## Resolution and dispute risk

Identical to Kalshi (exchange-determined, `determined` -> `disputed` -> `finalized` lifecycle; see `docs/research/08-venues-polymarket-kalshi.md`). Trades settle $1/$0. [H]

## Geo / ToS / automation

ECP-only for block trades; counterparties must be eligible; customer must specifically direct the order as a block. [H] help.kalshi.com. Cantor ToS: NOT FOUND (site blocked). Automation by an unregistered third party through a Cantor desk is not a thing; no programmatic Cantor interface exists.

## Liquidity

No Cantor-specific figure. Block prints are rare in the public feed (0 of the latest 1000 trades, 2026-10-19). Kalshi first block trade completed April 2026 (Greenlight/Jump, a carbon-allowance auction outcome). [H] financemagnates. No post-launch block volume found (searched: news, "September October 2026"). Shared with: Kalshi (venue, clearing) and Susquehanna (quote provider).

## Event overlap for arbitrage

Same as Kalshi. Block interest is skewed to bespoke weather, climate, commodity, econ-indicator and corporate-result contracts. Blocks are privately priced, so they do not give a tradable cross-venue quote.

## Signal use

Weak signal at best: a Kalshi block print (`is_block_trade=true`) marks informed or hedging size at a negotiated price. Worth a boolean flag on the Kalshi adapter's trade feed. No separate adapter.

## Open questions

- Whether Cantor-routed blocks are distinguishable in any Kalshi feed.
- Who is eligible to call Kalshi's block-proposal endpoints.
- Why the `is_block_trade=true` filter 504s.

## Sources

- https://www.financemagnates.com/institutional-forex/cantor-fitzgerald-opens-kalshis-event-contracts-to-roughly-3000-institutional-clients/ (2026-08-19) H
- https://www.thetradenews.com/cantor-fitzgerald-launches-institutional-block-trading-in-prediction-markets/ (2026-08-21) H
- https://www.coindesk.com/markets/2026/08/19/cantor-opens-kalshi-prediction-markets-to-thousands-of-institutional-clients H (plan framing)
- https://help.kalshi.com/en/articles/15165864-block-trades H
- https://institutional.kalshi.com/asset-managers H
- https://docs.kalshi.com/llms.txt, /api-reference/communications/propose-block-trade, /get-block-trade-proposals, /api-reference/market/get-trades H
- https://api.elections.kalshi.com/trade-api/v2/markets/trades (unauthenticated GET, 2026-10-19) H
- WebSearch result summaries (predictionnews.com, cnbc.com 2026-08-19, others); predictionnews and cnbc returned HTTP 403 to fetch, so only search snippets M
- https://www.cantor.com/ HTTP 403, unread
