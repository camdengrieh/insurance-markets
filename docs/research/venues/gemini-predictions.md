# Gemini Predictions (Gemini Titan DCM) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public unauthenticated GETs, one public WebSocket market-data subscription, official docs. No account, no API key, no POST, no order/terms-accept calls, no PayBox money or signing tools (only read-only `discover_plugins` / `discover_services`).
Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or inferred; **L** = weak, stale or rough estimate.
Limitation: the shared WebSearch budget ran out mid-session, so web-search confirmation of the Connecticut order, state restrictions and launch coverage was not possible; those items rest on one affiliate page (M) and are flagged.

## Verdict

- **Adapter priority: P1.** Live, regulated (CFTC DCM), its own order book (independent leg), the best-documented public read API of any venue so far (OpenAPI + AsyncAPI, no key needed for events, prices, depth, trades). Real overlap with Kalshi / Polymarket on sports moneylines, crypto price ladders and 5/15-minute up/down, US midterms, Fed and S&P.
- Why not P0: depth is shallow outside live sports (a $619k-volume House-control market showed about $1.0k bid / $0.46k ask at the touch), execution needs a custodial, KYC'd, USD-funded Gemini account with an HMAC API key (no wallet-signed orders, so no PayBox EVM path), state/geo limits, and the API Agreement forbids "derivative products from our API" and ties market data to a separate Market Data Agreement.
- Best use now: a **read/price adapter** (cheap, stable) feeding the scanner; execution is a separate decision and needs the user's own Gemini credentials outside PayBox signing.

## 1. Liveness

- **Live as of 2026-10-19 (H).** `GET https://api.gemini.com/v1/prediction-markets/events?status=active` returned 200 on 2026-10-19 01:08 UTC with `pagination.total = 934` active events (fixture). Crypto 15-minute events settled at 2026-10-19T01:15:05Z (H, fixture `events_recently_settled_crypto_limit3_2026-10-19.json`). Public daily volume endpoint returned data for every day 2026-09-18..2026-10-18.
- Docs are actively maintained: changelog entries for Prediction Markets on 2026-10-08, 10-06, 10-01, 09-28, 09-24, 09-16 (H: https://developer.gemini.com/changelog/revision-history.md); llms.txt "Last Updated: 2026-10-16T20:26Z" (H).
- Product start: the public volume endpoint says "Prediction-market volume begins at `2025-12-15`" (H: https://developer.gemini.com/specs/openapi/prediction-markets.yaml). The DeFi Rate affiliate page gives no launch date.

## 2. Kind and market model

- **kind: regulated-exchange** (CFTC-registered DCM, centralised, USD, off-chain). H: "Gemini Titan, LLC is a designated contract market ('DCM') registered with the CFTC ... a separate entity from those that operate Gemini's crypto exchange" (https://www.gemini.com/titan/event-contracts).
- **Mechanism: central limit order book**, price 0.01 to 0.99 in dollars, $1.00 settlement per contract (H: https://developer.gemini.com/prediction-markets/core-concepts.md). Per-instrument increments come from the contract object: sampled sports contract `priceIncrement 0.01`, `priceMinimum 0.01`, `quantityIncrement 0.01`, `quantityMinimum 0.01` (H, fixture); the docs say not to assume a fixed grid.
- **Event types: `binary` and `categorical`** (H: OpenAPI `EventType` enum). No scalar markets; numeric questions are emulated with ladders of "X or above" contracts (`prices-ladder` template, e.g. `BTC2610232100-HI82000`) or Up/Down contracts (`crypto-up-down` template, 5 and 15 minute BTC/ETH/SOL/XRP) (H, fixture).
- **Instrument model:** each *contract* is one proposition in YES space with symbol `GEMI-{EVENT}-{CONTRACT}` (e.g. `GEMI-CTRLUSHOU-DEM`). An order picks `outcome: yes|no` and `side: buy|sell` on that one symbol; the public book is YES-normalised (NO price = 1 - YES price). Categorical winner events (sports game, party control, "which party") are mutually exclusive groups of such contracts; ladders are not exclusive (H: core-concepts.md, collateral-return.md).
- **Tokenisation: none.** Positions are account-ledger entries cleared by the DCO; no on-chain token, no chain.
- **Statuses** (H, OpenAPI `MarketStatus`): `approved, active, closed, under_review, settled, invalid`. Contract `marketState` is `open` or closed; settled contracts carry `resolutionSide` (`yes`/`no`) and `resolvedAt` (H, fixture).
- **Combos:** multi-leg combo contracts via a sealed-bid RFQ over WebSocket, "available in production for beta testing" (H: https://developer.gemini.com/prediction-markets/combos-rfq/overview.md). Ignore for v1.
- Categories (H, `GET /v1/prediction-markets/categories?status=active`): Live, Sports, Pro Football, Pro Baseball, Midterms, Crypto, Commodities, Economics, Politics, Tech, Business, Weather, Culture. Active events by category (H, `pagination.total`, 2026-10-19): Sports 489, Politics 221 (Midterms 201 overlaps), Weather 98, Crypto 95, Commodities 18, Economics 10, Business 6, Culture 4, Tech 3.

## 3. Chains and collateral

- **No chain.** Collateral is **USD** held in the Gemini account; positions settle in `usd` (H: WebSocket `settlement_payout` carries `c: "usd"`, https://developer.gemini.com/prediction-markets/websocket/streams.md).
- Funding is a Gemini-account matter. Prediction-market docs say only "The account is funded" (H: trading-quickstart.md). DeFi Rate lists ACH and wire free, debit card 3.49%, PayPal 2.5%, ACH withdrawal free, wire $25 (M, affiliate page). Crypto deposit into Gemini then conversion is a generic Gemini function, **not documented for Predictions** (NOT FOUND in the PM docs).
- Clearing: market participants must also sign an "Olympus user agreement" that lets them "clear and settle their Gemini Titan transactions through Gemini Titan's DCO" (H: https://www.gemini.com/titan/agreements). DeFi Rate names the DCO "Gemini Olympus" (M).

## 4. Read API

**Official, public, no key for market data (H).** Docs: https://developer.gemini.com/prediction-markets/market-data.md and https://developer.gemini.com/rest-api/prediction-markets/events. Machine-readable: https://developer.gemini.com/specs/openapi/prediction-markets.yaml (OpenAPI 3.0.3, v1.0.0) and https://developer.gemini.com/specs/asyncapi/websocket.yaml. Spec warning: "Only fields documented in this specification are considered stable."

Base URLs: REST `https://api.gemini.com`; WebSocket `wss://ws.gemini.com` (v0.10.7, "Production"); sandbox REST `https://api.sandbox.gemini.com`, sandbox WS `wss://ws.sandbox.gemini.com` (H: get-started/sandbox.md). Whether prediction markets are enabled in the sandbox: NOT CONFIRMED.

Key public REST endpoints (all GET, confirmed 200 unauthenticated unless noted):

| Purpose | Endpoint |
|---|---|
| List events (+contracts, prices) | `/v1/prediction-markets/events?status=active&category=&search=&limit=&offset=` (confirmed) |
| One event | `/v1/prediction-markets/events/{eventTicker}` (confirmed, e.g. `CTRLUSHOU`) |
| Newly listed / recently settled / upcoming | `/v1/prediction-markets/events/newly-listed`, `/recently-settled` (confirmed), `/upcoming` |
| Strike for Up/Down | `/v1/prediction-markets/events/{eventTicker}/strike` |
| Categories | `/v1/prediction-markets/categories` (confirmed) |
| Exchange-wide volume by category | `/v1/prediction-markets/volume/{YYYY-MM-DD}` and `/volume/{date}/hourly` (completed UTC days, rolling one-year window; confirmed) |
| Maker-rebate schedule | `/v1/prediction-markets/maker-rebate/rates` (confirmed) |
| Combos | `/v1/prediction-markets/combos`, `/combos/{instrumentSymbol}` |
| Reference-price candles (crypto) | `GET /v2/klines?agency=lukka&index=LS-LRRR-XBTUSD&interval=1m&startTime=&endTime=` (documented, not called) |

Real response shapes confirmed (fixtures under `docs/research/fixtures/gemini-predictions/`):
- Events list: `{data:[event...], pagination:{limit,offset,total}}`. Event fields seen: `id, title, slug, type (binary|categorical), category, subcategory{id,slug,name,path}, ticker, status, createdAt, effectiveDate, expiryDate, startTime, isLive, volume, volume24h, volumeDelta24hPct, tags, participants, description, termsLink, sourceDetails{agency,index}, template, sportsMarket{sport,type,subject,scope,team}, contracts[], events[]`.
- Contract: `id, label, description (rich-text doc incl. resolution rules), status, marketState, ticker, instrumentSymbol, prices{buy{yes,no}, sell{yes,no}, bestBid, bestAsk, lastTradePrice}, expiryDate, priceIncrement, priceMinimum, quantityIncrement, quantityMinimum, isCombo, resolutionSide, resolvedAt, termsAndConditionsUrl`. All prices and quantities are strings. Semantics checked on `CTRLUSHOU-DEM`: `buy.yes` = ask 0.92, `sell.yes` = bid 0.88, `buy.no` = 1 - bid = 0.12, `sell.no` = 1 - ask = 0.08.
- **Gotcha 1: payload size.** Sports game events embed every child market (spreads, totals, props, quarters) in `events[]`; `limit=3` returned 1.1 MB, one NFL game carried 26 child events. Use `category`/`sportsMarketType` filters, small `limit`, and `offset` paging; stay at 1 request/s.
- **Gotcha 2: no REST depth.** The doc mentions `contractOrderbooks`, but it was `null` on every sampled contract; depth is WebSocket only.
- **Gotcha 3: symbol case.** REST returns `GEMI-CTRLUSHOU-DEM`; WebSocket frames echo `gemi-ctrlushou-dem`. Normalise case.
- No public REST trade-history endpoint in the OpenAPI (NOT FOUND; trades only via the `@trade` WebSocket stream). Authenticated: `/v1/prediction-markets/orders/active|history`, `/positions`, `/positions/settled`, `/metrics/volume`.

**WebSocket (public, no key) confirmed live 2026-10-19:** connect `wss://ws.gemini.com?snapshot=-1`, send `{"id":"1","method":"SUBSCRIBE","params":["<sym>@bookTicker","<sym>@depth10","<sym>@depth@100ms"]}` -> `{"id":"1","status":200}` then frames. Streams: `@bookTicker`, `@depth5|10|20[@100ms]`, `@depth[@100ms]` (differential; with `snapshot=-1` the first `depthUpdate` is the full snapshot; if `U` skips ahead, resubscribe), `@trade`, `{agency}:{index}@indexPrice` (Lukka crypto reference prices), `contractStatus` (lifecycle + strike). Authenticated: `orders@account`, `balances@account`, `positions@account`. Sample frames in `ws_public_book_samples_2026-10-19.json`. Docs: https://developer.gemini.com/prediction-markets/websocket/streams.md.

**Rate limits (H: https://developer.gemini.com/rate-limit.md and API Agreement):** public 120 req/min (recommended 1/s); private 600 req/min (recommended 5/s); burst of 5 queued requests then HTTP 429 (WS error code -1003). Higher limits by support form. WebSocket connection / subscription caps: NOT FOUND (searched introduction.md, streams.md, message-format.md, AsyncAPI).

## 5. Trade path (documented, not exercised)

- **Programmatic: yes**, REST and WebSocket (docs prefer WS `order.place` for active trading). REST: `POST /v1/prediction-markets/order` (limit or stop-limit; `side`, `outcome`, `quantity`, `price`, `timeInForce` = `good-til-cancel|immediate-or-cancel|fill-or-kill`, optional `makerOrCancel: true`), `/order/batch`, `/order/cancel`, `/order/batch/cancel`; queries `/orders/active`, `/orders/history`, `/positions`, `/positions/settled` (H: OpenAPI).
- **Auth/signing:** account-scoped API key with `Trader` role (WS also requires "time-based nonce" key); headers `X-GEMINI-APIKEY`, `X-GEMINI-PAYLOAD` (base64 of the JSON incl. `request` and `nonce`), `X-GEMINI-SIGNATURE = hex(HMAC_SHA384(base64 payload, api_secret))`, empty HTTP body; time-based nonce must be within +/- 30 s (H: https://developer.gemini.com/authentication/api-key.md). OAuth 2.0 bearer alternative with scopes such as `orders:create`, `positions:read` / `predictions:positions:read` (H: authentication/oauth.md). Master/group keys are rejected on WS. (A third-party wrapper page says HMAC-SHA512; the official docs say SHA-384, so treat that page as wrong.)
- **Pre-trade gates:** the account must have accepted the latest PM terms (`GET /v1/prediction-markets/terms/status`, then `POST .../terms/accept`); errors `ACCOUNT_GROUP_BLOCKED` ("This account is not permitted to trade prediction markets"), `TERMS_NOT_ACCEPTED`, `ACCOUNT_RESTRICTED_SELL_ONLY` (H: OpenAPI). WS option `cancelOnDisconnect=true`.
- Third parties already relay into Gemini with the user's own key (Delphi Markets API; FCM access via the FCM Member Agreement) (M/H, see Sources).

## 6. PayBox reachability: **partial (read yes, trade no)**

- A PayBox EVM/Solana wallet **cannot** place Gemini orders by transaction proposal or signed order: there is no on-chain contract, and orders are authenticated by an HMAC secret tied to a KYC'd custodial account.
- Reads need no wallet at all.
- Possible, unverified: store the user's Gemini API key as a PayBox secret and call the API from a plugin/service, or fund the user's own Gemini account by sending crypto to a Gemini deposit address via `request_transfer`. Neither is documented for Predictions, and neither was tested.
- PayBox discovery on 2026-10-19: `discover_plugins("gemini")` returned no plugins (H); `discover_services("gemini prediction markets")` first page returned only third-party data resellers (Polymarket, Hyperliquid and generic aggregators), nothing Gemini-specific (H, first page only).

## 7. Fees

- **Official schedule (H: https://www.gemini.com/fees/predictions, for contracts listed on/after 2026-03-18):** Taker Fee = 0.07 x C x P x (1 - P); Maker Fee = 0.0175 x C x P x (1 - P); P in dollars, C contracts; rounded **up** to the next cent; no settlement fee, no membership fee; maker fee only charged when the resting order is matched, cancel is free; partial fills pay taker on the immediate part. Peak taker cost is $0.0175 per contract at P = 0.50 (e.g. 100 @ $0.40 taker = $1.68). Users through a third-party FCM may pay FCM fees.
- **Maker fee currently $0.00:** "Maker Fee-Free Trading Promo", 2026-09-02 through 2026-12-31, all event contracts (H: https://developer.gemini.com/prediction-markets/maker-fee-free-trading-promo.md). Gemini Titan may end it at any time.
- **Rebates/rewards (H):** Maker rebate = Rebate Rate x Taker Rate x C x P x (1 - P) inside a $0.20-$0.80 band, current rate 0.30 for all categories from 2026-06-11 (API schedule shows earlier 0.5/0.7 periods, now ended; whether a rebate is still paid while the maker fee is waived is NOT FOUND). Taker Rewards: 0.5% / 1.0% / 1.5% of trailing-30-day taker volume at $0.5M / $2M / $10M plus monthly bonuses, in the $0.10-$0.90 band, pool replenished to $1.5M on 2026-10-01, runs through 2026-12-31 (https://developer.gemini.com/prediction-markets/taker-rewards-program.md). These incentives can inflate reported volume (L, unquantified).
- Collateral return (H): for mutually exclusive groups, `returned_collateral = sum(|No_i|) - max(|No_i|)`, enabled for pro football, college football and pro baseball by request; "Direct Sell No is not supported" for those accounts.
- **Arb implication:** a taker round trip costs up to 1.75c per contract per leg before spread; a maker leg is currently fee-free.

## 8. Resolution mechanism and dispute risk

- **Centralised, exchange-determined, CFTC-regulated.** Each contract class has a PDF terms document (`termsAndConditionsUrl`); the rule text rides in the contract `description`. Sample (NFL moneyline): resolves by "the official result"; source agencies "in order, the league governing the event, ESPN, Fox Sports, and the broadcast partner"; if the value cannot be determined (cancellation, forfeit) "the Exchange may determine payouts pursuant to the Market Outcome Review Process"; ties go to "50/50 draw resolution rules" (H, fixture). Sports data feed in `sourceDetails`: `statscore-rest-api`.
- Crypto ladders: "Outcome verified against the LS-LRRR-XBTUSD index" (Lukka); if no eligible trade in the window, "resolve based on the most recent traded price prior" (H, fixture). Up/Down 5 and 15 minute contracts auto-settle about 5 seconds after expiry (H, fixture: expiry 01:15:00, `resolvedAt` 01:15:05).
- Politics (sample, House control): resolves on seats won after 2026-11-03, ties by who elects the Speaker (H, fixture).
- **No on-chain dispute or UMA-style bonding.** Dispute risk is rulebook discretion (Market Outcome Review) rather than oracle manipulation. Rulebook PDF itself was not retrievable as text (NOT FOUND); read `https://www.gemini.com/titan/rulebook` by hand before any execution.
- **Cross-venue risk:** tie and cancellation rules differ from Polymarket / Kalshi (e.g. 50/50 on draws), so rule-equivalence checks are mandatory before treating two contracts as hedges.

## 9. Geo, ToS, automation

- **Access:** US-focused, KYC'd Gemini account; users sign a Gemini Titan user agreement (Self-Clearing Member or FCM Member) plus the matching Olympus clearing agreement (H: titan/agreements).
- **State availability (M, DeFi Rate, internally inconsistent, not verified):** "All states and DC except Arizona, Illinois, Maryland, Massachusetts, Michigan, Montana, Nevada and Ohio", while another section says "Available in all 50 states" and a table lists Nevada and Michigan as Restricted. Primary source for the list: NOT FOUND (gemini.com/predictions and /predictions/faq render only a JS error to non-browser fetches; support center returned 403).
- **Connecticut (M, unverified):** DeFi Rate says the Connecticut DCP announced a cease-and-desist on 2026-09-10 directing Gemini to stop making sports event contracts available to Connecticut residents; Gemini's response unconfirmed. I could not reach the primary press release.
- **Automation (H):** API trading is the documented path; API Agreement: public 120/min, private 600/min; "You shall not ... create any derivative products from our API"; "Gemini Market Data is proprietary to us" and subject to a separate Market Data Agreement; OEMS service providers need an OEMS Service Provider Agreement (https://www.gemini.com/legal/api-agreement). Market-data redistribution terms themselves: NOT FOUND (Market Data Agreement text not located; the Titan "Trade and Market Data" page has no terms). **Legal check needed before redistributing Gemini prices in a product.**
- Titan Market Maker Program exists (review of financial resources, quoting and volume obligations) (H: titan/market-makers). Participants affiliated with Gemini Titan are excluded from the fee promo.

## 10. Liquidity

Source: Gemini's own public volume API `GET /v1/prediction-markets/volume/{date}` (H, fetched 2026-10-19; values are decimal strings with no unit stated, treated as USD notional, M). Totals computed by summing top-level categories.

| Window | Total |
|---|---|
| 2026-10-18 (Sunday, NFL + CFB) | $2.25M |
| 2026-10-12..10-18 (7 days) | $8.95M |
| 2026-09-18..10-18 (31 days) | **$45.1M** (avg $1.45M/day) |

31-day split: Sports $31.1M (69%), Crypto $12.7M (28%), Politics $0.85M, Economics $0.21M, Weather $0.10M, Tech $0.06M, everything else under $0.02M. Single-day spot samples (L, weekday-dependent): 2025-12-20 $0.04M; 2026-01-15 $0.57M; 02-15 $0.53M; 03-15 $0.46M; 04-15 $0.86M; 05-15 $1.68M; 06-15 $1.85M; 07-15 $1.58M; 08-15 $1.09M.

- **Open interest / TVL: NOT FOUND** (searched: events schema `liquidity` field was null on all sampled events; no public OI endpoint; `/metrics/volume` is authenticated).
- **Per-event cumulative volume (H, event `volume` field, unit M):** US House control $619k (24h $37k); crypto market-structure law $434k; Michigan Senate $205k; 2028 Dem nominee $201k; California governor $160k; Fed October decision $152k; Hormuz traffic $192k; XRP/ETH/BTC "price on October 31" ladders $63k / $46k / $40k.
- **Depth (H, public WS snapshot 2026-10-19 ~01:20 UTC):** live NFL Dallas v Green Bay moneyline: top 3 bid levels about $6.9k, top 6 ask levels about $12.9k (YES notional), 1c-2c spread; House-control Dem YES 0.88 x 1,178 / 0.92 x 500 (4c wide, about $1.0k / $0.46k); BTC Oct-23 "$82,000 or above" 0.57 x 350 / 0.61 x 450 (4c wide, about $0.9k bid / $1.5k ask in the first levels). Conclusion: workable for small-size arbitrage in sports and crypto, thin elsewhere.
- Trend (L, single-day samples only): ramped from Dec 2025, crypto-led in May-June 2026 (2026-05-15: $1.44M of $1.68M was crypto), now sports-led and rising with the NFL season.
- Volume-quality caveat: taker rewards and zero maker fees reward churn (L).

## 11. Event coverage and overlap (where arbitrage could exist)

| Category | Gemini | Likely overlap |
|---|---|---|
| Sports (NFL, college football, MLB, NHL, soccer incl. EPL/MLS/La Liga, MMA, F1/NASCAR) | game moneylines, spreads, totals, props, quarter/inning markets, futures | Kalshi, Polymarket US, Polymarket global. Highest liquidity and the clearest arb. Check tie handling (50/50) |
| Crypto price | daily/weekly/monthly threshold ladders for BTC, ETH, SOL, XRP, ZEC, HYPE; 5 and 15 minute Up/Down | Kalshi, Polymarket (15-minute up/down), Limitless, Opinion; reference index is Lukka, others differ |
| Politics / midterms | House and Senate control, Senate and governor races, 2028 nominees, crypto legislation | Kalshi, Polymarket, PredictIt, Manifold |
| Economics | Fed October decision, recession 2026, S&P high/low/close, Hormuz traffic | Kalshi, Polymarket |
| Commodities, weather, tech, culture | small (weather 98 active events, about $100k/31d) | Kalshi weather and commodities |

(Category list and counts H; overlap judgement M.)

## 12. Liquidity sharing

- **Independent.** Own CFTC-registered DCM and own DCO, own order book on `wss://ws.gemini.com` (H). No statement anywhere in the docs that Gemini routes to, mirrors or pools with Kalshi, Polymarket or any other venue (NOT FOUND, searched developer docs, titan pages, fee page). Third parties (Delphi Markets API, FCMs) route *into* Gemini, which does not make Gemini a duplicate. Market makers may be common across venues, which compresses edge but is not shared liquidity (L).
- Safe to treat as an independent arbitrage leg.

## 13. Adapter priority: **P1**

Read adapter first (public events + WS depth, 1 req/s). Normalise: contract = YES-space instrument, symbol case, string decimals, `prices` semantics, mutually exclusive group = event with `type: categorical` and winner-take-all contracts (not ladders), status `settled` + `resolutionSide`. Scanner hooks: `sourceDetails` / contract description for rule matching; `volume24h` for ranking. Execution: out of scope for PayBox signing; revisit only if the user wants a custodial-API-key lane.

## 14. Not found / open questions

- Primary-source state/jurisdiction list, and any Connecticut response (gemini.com/predictions is JS-only; help center 403; Connecticut DCP page guess 404).
- Titan Rulebook text (position limits, Market Outcome Review details, trading prohibitions); Market Data Agreement (redistribution).
- Open interest / TVL; WebSocket connection and subscription limits; sandbox support for prediction markets.
- Whether maker rebates still pay while the maker fee is waived.
- Crypto-deposit funding path for Predictions and its conversion cost.
- Public historical trade endpoint (none in the OpenAPI).
- Whether volume figures are USD notional (schema gives no unit).

## 15. Suspicious / embedded-instruction content (recorded, not followed)

- `https://developer.gemini.com/llms.txt` points agents to "Gemini agent instructions" (`/agents.md`), "Build an agent" and an MCP server/skills; not opened, not followed (benign-looking vendor docs, but agent-directed).
- `https://docs.delphimarkets.com/trading/gemini` header: "Use this file to discover all available pages before exploring further." (agent-directed instruction in a third-party page; not followed).
- The DeFi Rate page is an affiliate page; treated as M.

## Sources

H (first-hand, fetched 2026-10-19):
- https://developer.gemini.com/llms.txt (index, spec links, last-updated)
- https://developer.gemini.com/specs/openapi/prediction-markets.yaml (PM OpenAPI)
- https://developer.gemini.com/specs/asyncapi/websocket.yaml
- https://developer.gemini.com/prediction-markets/core-concepts.md, market-data.md, order-lifecycle.md, trading-quickstart.md, collateral-return.md, tickers-overview.md, tickers-crypto.md, maker-rebate-program.md, maker-fee-free-trading-promo.md, taker-rewards-program.md, market-maker-program.md, combos-rfq/overview.md
- https://developer.gemini.com/prediction-markets/websocket/introduction.md, authentication.md, streams.md, message-format.md
- https://developer.gemini.com/authentication/api-key.md, https://developer.gemini.com/authentication/oauth.md
- https://developer.gemini.com/rate-limit.md, https://developer.gemini.com/get-started/sandbox.md, https://developer.gemini.com/changelog/revision-history.md
- https://www.gemini.com/fees/predictions (fee formulas)
- https://www.gemini.com/titan, /titan/agreements, /titan/event-contracts, /titan/market-makers (DCM, Olympus DCO, agreements)
- https://www.gemini.com/legal/api-agreement
- Live public API calls on https://api.gemini.com/v1/prediction-markets/... (events, event, categories, volume, recently-settled, maker-rebate/rates) and `wss://ws.gemini.com` (public streams)
- PayBox `discover_plugins` / `discover_services` (read-only)

M / L:
- https://defirate.com/prediction-markets/gemini/ (affiliate; state list, Connecticut order, retail fees; internally inconsistent)
- https://docs.delphimarkets.com/trading/gemini (third-party relay; says HMAC-SHA512, contradicted by official docs)
- https://github.com/pmxt-dev/pmxt `core/COMPLIANCE.md` via `gh api` (a `GeminiTitan` adapter exists using `GEMINI_API_KEY` / `GEMINI_API_SECRET`; confirms key-based trading)
- Repo notes: `docs/research/09-venues-onchain-clob.md`, `10-aggregation-landscape.md`, `14-platform-of-platforms.md` (Gemini mentioned as a regulated venue covered by several aggregators)

## Fixtures (`docs/research/fixtures/gemini-predictions/`)

- `events_list_active_limit3_first_event_trimmed_2026-10-19.json` (list shape; nested `events[]` trimmed from 1.1 MB)
- `event_CTRLUSHOU_get-event_2026-10-19.json` (single event, full)
- `events_crypto_btc_ladder_and_updown_2026-10-19.json` (ladder and Up/Down shapes)
- `events_recently_settled_crypto_limit3_2026-10-19.json` (settlement fields)
- `categories_active_2026-10-19.json`, `volume_daily_2026-10-18.json`, `maker_rebate_rates_2026-10-19.json`
- `ws_public_book_samples_2026-10-19.json` (bookTicker, depthUpdate, depth10 frames for 3 contracts)
- `volume_summary_derived_2026-10-19.json` (derived by this session: 31-day, 7-day and category sums, monthly spot samples)
