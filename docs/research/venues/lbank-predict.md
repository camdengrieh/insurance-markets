# LBank Predict (LBank Prediction Market / Prediction Futures + Flash Futures)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale. WebSearch budget was exhausted for this session, so discovery relied on direct fetches only.

## Verdict

- Adapter priority: **P2** (signal-only / thin). Live and real, but: centralized CEX account, no documented prediction API, no official trade path, US blocked, thin books, and Prediction Futures resolve off **Polymarket results** (so it is a correlated mirror leg, not an independent oracle).
- One useful quirk: the **public, unauthenticated** perp-style depth endpoint serves real order books for prediction symbols once you know the symbol id (see Read API). That makes it a cheap read-only signal source, but market discovery is not available from that host.

## Liveness [H]

- `https://www.lbank.com/futures/prediction` returns HTTP 200 with a live event list (Senate 2026, Balance of Power 2026 midterms, House 2026, NBA 2027 champion, Ballon d'Or 2026), fetched 2026-10-19. `https://www.lbank.com/futures/prediction/flash` is live with a Flash Futures BTC 4h market (symbol `BTCF4H26101904USDT`, i.e. 2026-10-19 04h expiry code). The `lbank.com/en-US/predict` URL in the lead is a 301 to a non-existent path; the real routes are `/futures/prediction` and `/futures/prediction/flash` (`/futures/predict` also serves the futures UI with a "Prediction Market" tab).
- Launch PR 2026-06-08 (paid, Chainwire) [M]: "Prediction Futures" up to 5x isolated leverage; "Fast/Flash Futures" 5m/15m/1h/4h windows on BTC/ETH; built into the LBank futures account; "no decentralized wallets, cross-chain transfers or gas". No liquidity source, settlement, fees, regions or API stated. https://chainwire.org/2026/06/08/lbank-launches-lbank-predict-bringing-next-gen-prediction-markets-to-crypto-trading/
- PR 2026-08-06 (paid) [M]: Chainlink Data Streams supplies resolution data for short-term BTC/ETH contracts (5m/15m named). https://chainwire.org/2026/08/06/lbank-adopts-chainlink-to-power-crypto-prediction-markets-with-high-speed-data-for-25-million-users/

## Kind and market model

- Kind: centralized exchange (CEX) product. Prediction contracts are listed as futures instruments inside the LBank futures (CFD/perp) engine, in the same futures account as perps. [H: help article + site UI]
- Model: central limit order book per outcome token. Each outcome is its own instrument (e.g. `3510100USDT` = Senate / Democratic Party, `3510101USDT` = Republican Party). Price 0 to 1 USDT = implied probability; Long = Yes, Short = No; Long settles at 1, Short settles at 0 if correct. Multi-option events are modelled as independent binary-style instruments per option (the Democratic and Republican prices on one page summed to 102%, so there is no enforced complementarity). [H: help article + embedded page data]
- Symbol scheme observed [H]: `<eventId><2-digit option index>USDT` for Prediction Futures (e.g. event 1285 option 00 -> `128500USDT`); `BTCF4H<yymmddhh>USDT` for Flash (derived; the expiry code is rolling so symbols churn every period).
- Categories seen [H]: US politics (Senate/House/midterms), sports futures (NBA 2027), awards (Ballon d'Or), and per the PR/site copy macro, geopolitics, AI, World Cup match markets, crypto narratives [M for those not directly seen]. Flash Futures: BTC/ETH up/down.
- Market orders match only the top 10 book levels; remainder canceled. [H: help article]
- Leverage: Prediction Futures up to 5x, set per event by the platform (all five featured events showed maxLeverage 1). Flash Futures 1x, no liquidation. Isolated margin only for prediction positions; ADL possible. [H]

## Chains and collateral

- No chain. Fully custodial; collateral is USDT in the LBank futures account (PR: "eligible futures bonuses and USDT"). [M/H] Contracts are `...USDT`-quoted. Deposits come via ordinary LBank deposit addresses (many chains) and require an LBank account.
- Not an on-chain venue: no market contracts, no tokenised outcomes, no gas. [H: PR says no on-chain interaction]

## Read API

Exists: **official-authenticated for trading; a small public market-data slice that happens to work for prediction symbols; prediction-specific endpoints are internal frontend only.**

Official docs [H]:
- Spot REST + WS: https://www.lbank.com/docs/index.html (base `https://api.lbank.info/`, WS `wss://api.lbank.info/ws/V2/`). Rate limits: create/cancel order 500 per 10s, everything else 200 per 10s. Signed with `api_key` + `sign` (RSA or HmacSHA256 over uppercase MD5 of sorted params), params `timestamp`, `echostr` (30-40 chars). No prediction endpoints.
- Contract (perp) REST + WS: https://www.lbank.com/docs/contract.html (REST base `https://lbkperp.lbank.com/`, WS `wss://lbkperpws.lbank.com/ws`). Public: `GET /cfd/openApi/v1/pub/instrument?productGroup=`, `GET /cfd/openApi/v1/pub/marketData?productGroup=`, `GET /cfd/openApi/v1/pub/marketOrder?symbol=&depth=`, `GET /cfd/openApi/v1/pub/getTime`. Numeric rate limits NOT documented (only error codes 183/184/10012). Keys not IP-bound expire after 30 days. The doc contains no mention of "predict", "event" or "flash".

Confirmed with unauthenticated GETs on 2026-10-19 [H]:
- `GET https://lbkperp.lbank.com/cfd/openApi/v1/pub/marketOrder?symbol=128500USDT&depth=10` returns a real book (`data.symbol`, `data.asks[]`/`bids[]` with `price`, `volume`, `orders`) for a Prediction Futures symbol. Same for `3460800USDT`, `2191124USDT`, and the Flash symbol `BTCF4H26101904USDT`; an empty book returns empty arrays (Senate Democratic `3510100USDT`). Fixtures: `docs/research/fixtures/lbank-predict/marketOrder_*.json`.
- A delisted/unknown symbol returns `error_code 20156 "This product has been delisted"`.
- `instrument?productGroup=SwapU` returns 842 perps only. Tried `Prediction`, `PREDICT`, `PM`, `Event`, `SwapC`, `Flash`, `PredictionFutures`: all empty. `marketData?productGroup=SwapU` is perps only. So **there is no documented public market-listing endpoint for prediction markets**. NOT FOUND (searched: contract docs, productGroup guesses).
- Internal frontend endpoints exist in the site JS bundle (read from page chunks, not executed): GET `/cfd/pevent/v1/events`, `/banners`, `/tabs`, `/tags`, `/instrument/current`, `/prediction/instrument`-family, `/prediction/Trade`, K-line POST `/cfd/pevent/v1/KLineBatchQuery`. Probing them on `lbkperp.lbank.com` returned `10006 "not open path"`; on `www.lbank.com` the path returns the HTML app shell. Treat them as non-public and unstable. [H for existence in JS, M for "not usable"].
- Practical discovery fallback: the `/futures/prediction` page server-renders an embedded Next.js payload with featured events (`eventId`, `eventCode`, `title`, per-option `symbol`, `lastPrice`, `buyVolume`, `sellVolume`, `turnover24h`, `endTime`). Only about 5 featured events are in the HTML. Sample: `docs/research/fixtures/lbank-predict/web_embedded_featured_events.json`. Scraping HTML is brittle and may breach ToS (see below); use only as a one-off seed list.
- Websocket: contract WS exists (`wss://lbkperpws.lbank.com/ws`) for perps; whether prediction symbols are subscribable is NOT FOUND/untested (no subscription made).
- Resolution/trades history: only via authenticated or internal endpoints. NOT FOUND for public.

## Trade path

- Programmatic order placement: **no documented path for prediction instruments.** The documented contract trade API (authenticated, `api_key` + HMAC/RSA `sign`, JSON headers `timestamp`, `signature_method`, `echostr`) targets perps; whether it accepts prediction symbols is untested and undocumented. The site's own order calls (`/cfd/pevent/v1/prediction/order`, `.../order/cancelAll`, `.../position/closeAll`) are internal and session-token authenticated. [H for names; M for implication]
- Requires an LBank account, KYC possibly region-dependent ("Based on the policy requirements of your country/region, it is required to complete KYC...", UI string [H]), API key creation. Not performed.

## PayBox reachability

- paybox_reachable: **no** (for trading). A PayBox EVM/Solana wallet could only fund an LBank deposit address with a plain transfer; there are no transaction proposals, no signed on-chain orders and no EIP-712 flow. Order entry needs a custodial account and API key held outside PayBox. Not a candidate for a PayBox trading plugin.

## Fees

- Manual open/close: fee "at the configured rate" (rate not published in the help article; the fee row on the market page shows "--" unauthenticated). Normal automatic settlement at expiry: no fee. Funding fees may apply at higher leverage; at 1x the funding rate is 0. [H: help article https://www.lbank.com/en-US/support/articles/2049820752386981888]
- Perp fee schedule is separate; per-user fee endpoint `/cfd/user/v1/userFee` is authenticated (internal). Exact prediction maker/taker numbers: NOT FOUND.

## Resolution mechanism and dispute risk

- Prediction Futures: "event sources and results come from Polymarket" [H, help article]. So an LBank market resolves on the Polymarket outcome; UMA dispute behaviour on Polymarket therefore flows through, plus LBank's own override.
- Flash Futures: Chainlink price (latest Chainlink price as benchmark; Data Streams per PR) [H/M].
- Disputed/ambiguous/undeterminable results "may settle at 0.5" and the article also says "may also be 0" (inconsistent) ; "the platform may intervene manually if third-party data is abnormal"; statuses Pending Confirmation / Pending Settlement lock closing/adjusting. No dispute process described; support is service@lbank.com. [H]
- Risk for arbitrage vs Polymarket: LBank's discretionary 0.5 settlement and manual intervention break the lock-in of a hedge; plus custodial counterparty risk.

## Geo, ToS, automation

- Contract-trading risk text on lbank.com: "LBank does not support users from Iran, North Korea, Syria, Cuba, Crimea, the United States, China and their territories to trade with contracts." [H, UI string in site bundle]. US/CN excluded; prediction-specific region list NOT FOUND (help article is silent; `/cfd/user/v1/regionLimitConfig` exists internally).
- Automation: API keys are officially supported for spot/perps; no ToS text was reviewed for prediction. NOT FOUND (searched: help article, docs pages).

## Liquidity (all 24h turnover from the site's own embedded data, 2026-10-19, units are USDT-denominated per page) [H for the number, M for interpretation]

- House 2026 (Democratic `128500USDT`): turnover24h 437,578; book last seen 0.88 bid / 0.93 ask, very large resting size at 0.83-0.88 (about 14.6M contracts at 0.85), buyVolume/sellVolume figures in the tens of millions look like open-interest or cumulative volume of unclear definition.
- Senate 2026: D 143,337 / R 83,595 (24h); book empty on both sides in my probe.
- Balance of Power: D-Sen/D-House 142,466; R/D 62,386; R/R 19,280. Bids only, a few hundred to ~1.6k contracts per level.
- NBA 2027 champion: Spurs 54,604 / Thunder 53,504 / Knicks 23,078; Spurs book 0.17 bid vs 0.25 ask (8c spread).
- Ballon d'Or 2026: Kane 210,736; Yamal 88,274; Messi 11,296.
- Flash BTC 4h: 24h volume 72,034 (page); book had bids 0.91-0.96 of about 1,000 each and no asks.
- Exchange-wide volume claims ($10.5B and $23.81B daily, 20M and 25M users) are paid-PR company claims across two PRs that disagree with each other; not prediction-specific. [L]
- Verdict: thin, one-sided books and wide spreads on most markets; a few headline markets show six-figure daily turnover.

## Event coverage overlap (arbitrage-relevant)

- US midterms (Senate/House/Balance of Power), NBA/NFL/World Cup-type sports, awards, and BTC/ETH short-interval up/down. These overlap Polymarket, Kalshi and others. Event list appears to be a curated subset mirrored from Polymarket. Crypto Flash markets overlap Polymarket/Kalshi/Limitless short-term crypto markets and plain perp/option strategies.

## Shared liquidity

- **Own order book (separate from Polymarket's CLOB), but price anchoring and resolution source are Polymarket.** Not documented whether LBank hedges on Polymarket or market-makes against it; the PR names no liquidity source. If a market maker quotes the 0.83-0.88 wall, it is likely a hedged MM. Treat as a separate book with a **correlated resolution**: arbitrage against Polymarket is possible in principle but LBank's 0.5/manual settlement clause and the US exclusion limit it. For aggregation, tag `resolution_source=polymarket`, so the aggregator does not double-count it as independent evidence.

## Adapter notes (if built, read-only P2)

- Seed symbols from the `/futures/prediction` HTML payload (low frequency) and poll `marketOrder?symbol=...&depth=10` on `lbkperp.lbank.com`; no auth. Respect an assumed low rate (limit not documented); one request per symbol per few seconds.
- Normalise: price p in [0,1] = probability; each option is its own book; do not assume option prices sum to 1.
- Do not build a trade leg without confirming prediction symbols against the authenticated contract API on a throwaway account (out of scope here).

## Open questions

- Does the authenticated contract trade API accept prediction symbols and 0-1 pricing?
- Real maker/taker fee for prediction orders?
- Is there a public events listing (cleaner than HTML scrape)?
- Can the contract WS subscribe to prediction symbols?
- Does LBank hedge on Polymarket (shared liquidity)?

## Not found

- Public events/markets list endpoint, prediction fee schedule, prediction-specific region list, resolution history endpoint, any official prediction API docs, ToS clause on automation.

## Suspicious content

- None found. (Page JS contained ordinary telemetry/Sentry/analytics bundles only; none executed.)

## Sources

- https://chainwire.org/2026/06/08/lbank-launches-lbank-predict-bringing-next-gen-prediction-markets-to-crypto-trading/ [M, paid PR]
- https://chainwire.org/2026/08/06/lbank-adopts-chainlink-to-power-crypto-prediction-markets-with-high-speed-data-for-25-million-users/ [M, paid PR]
- https://www.lbank.com/futures/prediction and https://www.lbank.com/futures/prediction/flash [H, fetched 2026-10-19, incl. embedded payload and JS chunks]
- https://www.lbank.com/en-US/support/articles/2049820752386981888 (Prediction Market rules help article) [H]
- https://www.lbank.com/docs/index.html (spot API) [H]
- https://www.lbank.com/docs/contract.html (contract API) [H]
- https://lbkperp.lbank.com/cfd/openApi/v1/pub/marketOrder, `/instrument`, `/marketData` [H, unauthenticated GET 2026-10-19]
- Fixtures: `docs/research/fixtures/lbank-predict/`
