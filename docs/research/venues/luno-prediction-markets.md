# Luno Prediction Markets - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.
Read-only: public unauthenticated GETs only (User-Agent `insurance-markets-research/0.1`), no accounts, no signing.
Note: the shared WebSearch budget was exhausted, so no open-web searching was possible. Press facts come from direct fetches of two weetracker articles (M).

## Verdict

**adapter_priority = skip.** Luno Prediction Markets is a closed, custodial retail front-end inside the Luno app (South Africa and Nigeria only). It states "Powered by Limitless" and that Luno "uses the Limitless platform", so its liquidity is Limitless liquidity, not an independent arbitrage leg. It has no public read API and no programmatic trade path. Everything useful for an aggregator is reachable directly on Limitless, whose adapter is covered by the parallel Limitless workflow.

The one thing worth keeping: the Luno product page documents a retail fee schedule and resolution framing that is a *view* of Limitless markets, not a separate price surface.

## 1. Still live? (yes, M-H)

- `https://www.luno.com/prediction-markets` returned HTTP 200 on 2026-10-19 with live nav item "Trade prediction markets" and a current-month promo banner ("Buy Tether Gold (XAUT) with 0% fees this October"), so the site is actively maintained. (H)
- `en-za` and `en-ng` variants both 200 and carry the same FAQ. (H)
- Launch article on the Luno newsroom is dated **24 Mar 2026** ("Turn your crypto market insights into actionable outcomes with Prediction Markets on Luno"). (H)
- weetracker 2026-03-17 article covers the Nigeria launch (M); weetracker 2026-08-17 says Luno "launched a structured Crypto Prediction Market in Nigeria and South Africa in March 2026" and calls it the first step in a derivatives plan (perps/futures later in 2026). (M)
- Not verified: that the in-app trading flow (`https://luno.com/wallet/predictions/markets`) is operating today. It is behind login and I did not authenticate. (NOT FOUND: no public status page; no volume or user figures.)

## 2. Kind and market model

- Kind: broker/front-end (custodial retail app wrapper) over Limitless. (H for "Powered by Limitless"; M for the "custodial" characterisation.)
- Product copy: "take a position on whether an asset will be above or below a specific price at a set time"; assets BTC, ETH, SOL, DOGE, XRP; "Trade new markets every hour"; users can "Enter early, adjust positions or sell anytime". (H, Luno page)
- Internal inconsistency on the Luno page: the hero says hourly, the FAQ and the March article say "daily markets" only. (H)
- Binary, two-outcome, order-book based at the underlying layer (Limitless CLOB `tradeType: clob`, `marketType: single`; YES/NO outcome tokens as ERC-1155-style `tokens.yes/no` ids; collateral USDC 6 decimals). (H, Limitless API, fixtures below)
- Luno's launch-day press says users "can't hold both sides of the same bet" (weetracker, M); not checked in-app.
- Luno wraps this in a separate "Predictions wallet" (account type `PREDICTION`) funded by internal transfer from the user's USDC wallet; transfers in/out are free. (H)
- Which exact Limitless markets Luno surfaces is NOT FOUND (the in-app list is not public). Inference (M): the five assets match Limitless "X Up or Down Hourly/Daily" series for BTC, ETH, SOL, DOGE, XRP with BNB and equities omitted. Sampled Limitless slugs: `btc-up-or-down-hourly-p-*`, `eth-up-or-down-daily-p-*`, `solana-up-or-down-daily-p-*`, `dogecoin-up-or-down-daily-p-*`, `xrp-up-or-down-daily-p-*`. Note these are "Up or Down vs. the window's open price", while Luno's copy says "above or below a specific price" - strike-style wording may just be marketing simplification (M, unresolved).

## 3. Chains and collateral

- Collateral: USDC. Luno does not name the chain. (H: "NOT FOUND" on Luno pages for the network; FAQ says only "settled via the blockchain", payout carries a network fee set by congestion.)
- Underlying Limitless markets: Base mainnet USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals; CLOB venue contract `0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5`. (H, `fixtures/luno-prediction-markets/limitless_market_detail_btc_daily.json`)
- Luno user never holds outcome tokens directly as far as the docs show; positions live in a Luno-managed account. (M, inference from "Predictions wallet", "claim your payout", "If a payout remains unclaimed for 30 days, it will be automatically sent to your USDC Predictions wallet, minus the applicable network fee".)

## 4. Read API

- Luno prediction markets: **none**. The Luno developer docs (`https://www.luno.com/en/developers/api`, v1.2.5, changelog last entry 2026-10-01) cover spot exchange, wallets, transfers, streaming; no market/price/trade/resolution endpoints for predictions. The `/api/1/balance` endpoint lists `PREDICTION` in its `account_type` enum, so an authenticated user can read their own Predictions-wallet balance only. (H)
- Luno API facts for reference: base `https://api.luno.com`, HTTP basic auth with API key id and secret, rate limit 300 calls/min (429 beyond), streaming `wss://ws.luno.com/api/1/stream/:pair` capped at 50 sessions. Official Go SDK `luno/luno-go` and MCP server `luno/luno-mcp` (pushed 2026-10-15) - none mention predictions. (H)
- Underlying market data is the Limitless public API (no key): `GET https://api.limitless.exchange/markets/active`, `/markets/{slug}`, `/markets/{slug}/orderbook`. Confirmed live 2026-10-19. (H) See the Limitless venue note for the full endpoint list; not repeated here.
- Websocket for Luno predictions: NOT FOUND (searched Luno API docs, product page, luno-go, luno-mcp).

### Confirmed response shapes (Limitless, the actual data source)

Fixtures saved under `docs/research/fixtures/luno-prediction-markets/`:
- `limitless_active_crypto_hourly_daily_trimmed.json` - `GET /markets/active?limit=25&sortBy=ending_soon`, filtered to the five assets' hourly/daily Up/Down series. Envelope `{data:[...], totalMarketsCount:510}`.
- `limitless_market_detail_btc_daily.json`, `limitless_market_detail_btc_hourly.json` - `GET /markets/{slug}`. Key fields: `slug`, `conditionId`, `collateralToken`, `tokens.{yes,no}`, `prices[yes,no]`, `tradePrices.{buy,sell}.{market,limit}`, `venue.exchange`, `settings.{minSize,maxSpread,takerDelayMs,creatorFeePct}`, `expirationTimestamp` (ms), `description` (HTML rules), `priceOracleMetadata`, `metadata.{openPrice,chart.source,isPolyArbitrage,externalSlug,externalProvider,externalRulesWatch}`, `winningOutcomeIndex`/`payoutNumerators` (null until resolved).
- `limitless_orderbook_btc_daily.json`, `limitless_orderbook_btc_hourly.json` - `GET /markets/{slug}/orderbook`: `{bids[],asks[],tokenId,adjustedMidpoint,midpoint,maxSpread,minSize,lastTradePrice}`; price float 0-1, size int with 1e6 = 1 share (YES side).
- `luno_prediction_markets_page_text_en-za_2026-10-19.txt` - visible FAQ text of the Luno page (third-party content, kept as evidence).

## 5. Trade path

- **Luno side: none programmatic.** Trading happens only in the Luno mobile/web app after Luno KYC, inside the in-app Predictions wallet. No order API, no wallet-signed orders, no on-chain contract of Luno's own to call. (H for absence in docs: Luno API page lists no prediction trading; M for the app being the only route.)
- Probable plumbing (M, inference, unconfirmed by Luno): Luno almost certainly uses Limitless's **Programmatic API** for partners - HMAC-scoped tokens, partner sub-accounts with server wallets and delegated signing, partner withdrawals/redemption endpoints. Limitless docs say this is for "platforms and partners" and requires an application form; individual traders are not approved. (H for the Limitless doc; M that Luno is such a partner - no page names Luno on the Limitless side: grep of Limitless llms.txt, changelog and homepage found no "Luno".)
- So an external agent cannot trade "via Luno". An external agent that wants this liquidity trades on **Limitless directly** (self-serve `trading`-scope HMAC token or EOA EIP-712 signed orders on Base), which is the Limitless adapter's job.

## 6. PayBox reachability

- Luno itself: **no**. Custodial, KYC-gated by country, no wallet interface, no transaction proposals or signed orders to submit. A PayBox EVM wallet cannot place orders on Luno. (M)
- The same liquidity via Limitless on Base: technically reachable by a PayBox EVM wallet (EIP-712 orders, ERC-20 approvals) but needs a human-created Limitless API token and geo eligibility - see the Limitless note and `docs/research/09-venues-onchain-clob.md`. (M)

## 7. Fees

Luno published (identical on product page and March article): (H)
- Buy: 0.03% to 3%, generally lower at higher probability. Sell: starts at 0%, rises to 1.5% as probability approaches 50%. Estimated fee shown before confirming; final fee recorded in Predictions-wallet history.
- Wallet transfers in/out: free. Payout claim: blockchain network fee (set by protocol congestion, "not set by Luno"). Unclaimed payouts auto-sent to Predictions wallet after 30 days, less network fee.
- weetracker (2026-08-17) says "Luno earns buy and sell fees of 0.03% to 3%" (M) - i.e. Luno appears to take or share the Limitless adaptive fee rather than add a separate markup; not confirmed.

Limitless published CLOB fee schedule (H, `docs.limitless.exchange/user-guide/fees.md`): buy 0.40%-3.00% (3.00% for price 0.01-0.50, 0.40% at 0.999; paid in outcome tokens), sell 0.42%-1.50% (peak 1.50% at 0.50; paid in USDC), takers only, makers 0%, no closed-form formula published. A per-profile fee cap can apply.

Discrepancy (M): Luno quotes a **lower floor** (0.03% buy, 0% sell) than Limitless's public floor (0.40% buy, 0.42% sell). Possible explanations: a partner/profile fee cap for Luno sub-accounts, or copy imprecision. For arbitrage modelling use the worst case (Limitless public schedule) unless a Luno fill record shows otherwise.

## 8. Resolution and dispute risk

- Luno pages state no price source, oracle, or dispute process (H, NOT FOUND on product page, newsroom article, ToU list). The only recourse reference is Luno's generic Complaints policy.
- Underlying Limitless rules (H, `limitless_market_detail_btc_*.json` descriptions, fetched 2026-10-19):
  - Hourly: resolves Up if the Binance BTC/USDT 1h candle close >= open, otherwise Down. Source: Binance BTC/USDT chart; "not according to other exchanges or trading pairs".
  - Daily: compares Binance BTC/USDT 1-minute "Close" at 12:00 ET on day D vs 12:00 ET on D+1; **50-50 if exactly equal**.
  - `metadata.isPolyArbitrage: true`, `externalProvider: polymarket`, `externalSlug` (e.g. `bitcoin-up-or-down-on-october-19-2026`), `externalRulesWatch.rulesHash`: Limitless deliberately mirrors Polymarket's Bitcoin Up/Down series.
- Risk: centralised-ish resolution (Limitless operator reading Binance candles), tie handling differs (hourly >= = Up vs daily 50-50), Luno may not forward Limitless clarifications, and Luno's own terms for this product were NOT FOUND (see section 9). Basis risk vs a Polymarket twin is small but nonzero (different candle conventions, tie rules, time zone: Polymarket hourly uses ET noon/hour labels).

## 9. Geo, ToS, automation

- Availability: "Prediction Markets are currently available to Luno customers in South Africa and Nigeria." (H) Regulatory footer (ZA page only): Luno (Pty) Ltd authorised FSP and registered credit provider, "Juristic Rep of Black Onyx CurrencyHub (Pty) Ltd (FSP 50850) for derivatives". Page says "Trading in prediction markets is high risk." (H) The FSP number is printed inconsistently on the same page (55314 vs 53314). (H, trivial)
- Nigeria: weetracker notes SEC Nigeria's treatment of prediction markets is unclear and critics call the category gambling dressed as finance (M). Peer product Busha Signal is licensed by the Lagos State Lottery and Gaming Authority (M).
- ToS: country-specific Terms of Use (ZA/NG ToU dated 14 May 2026) have no prediction-market section; no terms specific to the Predictions wallet or Limitless were found in the terms list. (NOT FOUND: searched `legal/terms-list`, `en-za/legal/terms-of-use`, `en-ng/legal/terms-of-use`, `legal/risks` (last updated 17 Mar 2022).) The ToU contains no bot/automation clause (0 matches for "bot", 0 for "manipulat").
- Automation: none possible on Luno's prediction product (no API). Luno's exchange API is allowed for the spot product with permissioned keys. (H)
- Limitless-side ToS (separate): US, "Republic of China", Ontario and Alberta excluded; bots allowed with rules - per the Limitless note (M here, H there).

## 10. Liquidity

- Luno-specific volume, OI, user counts: NOT FOUND (searched Luno product page, newsroom article, weetracker x2; no figures anywhere). weetracker 2026-03-17 only says "thousands" of Nigerian users in reach (potential, not usage).
- Underlying Limitless markets, snapshot 2026-10-19 ~03:28Z (H, unauthenticated API; cumulative per-market `volumeFormatted`, USDC):
  - Daily Up/Down: BTC $320, ETH $1,095, SOL $125, DOGE $136, XRP $187.
  - Hourly Up/Down: BTC $55, ETH $1.6, SOL/XRP/DOGE $0 (newly opened windows).
  - Sampled books: BTC daily best bid/ask 0.894/0.919; about $1.3K bid and $1.6K ask within 5c of mid. BTC hourly 0.168/0.177; about $177 bid and $225 ask within 5c.
  - 510 active markets on Limitless in total at snapshot.
- Venue-level context from repo note `docs/research/09-venues-onchain-clob.md` (DefiLlama dimensions, fetched 2026-10-18): Limitless roughly $15.6K daily, $0.14M weekly, $3.3M monthly - tiny, and Luno's South Africa/Nigeria retail flow is a subset of that. (M)
- Conclusion: thin; hourly books are shallow tens-to-hundreds of dollars.

## 11. Event-category overlap (where arbitrage could exist)

- Crypto price Up/Down, hourly and daily, for BTC, ETH, SOL, XRP, DOGE. Overlaps: Polymarket (explicitly mirrored: `isPolyArbitrage`), Predict.fun, Hyperliquid HIP-4 outcomes, and Limitless itself. (H for the Polymarket mirror flag; M for the others per repo notes.)
- No sports, politics or macro on the Luno product as documented. (H)
- Because Luno is Limitless, any arbitrage versus Polymarket/Predict.fun is a **Limitless** leg, to be executed on Limitless, not on Luno.

## 12. Shared liquidity

- **Shares liquidity with Limitless: yes (H-M).** Evidence: "Powered by Limitless" badge; "Luno uses the Limitless platform to power prediction markets inside the Luno app"; Limitless described as "a peer-to-peer decentralised exchange" whose "adaptive fee structure" Luno quotes; the five assets and hourly/daily cadence match Limitless's Up/Down series; Limitless offers partner sub-accounts and "partner-restricted market pages" (changelog), the obvious integration mechanism. (H for the statements; M for the architectural conclusion.)
- Residual uncertainty: Luno flow could land on partner-gated markets with separate books on the same Limitless matching engine; in either case the operator and settlement rails are Limitless's, so it is not an independent venue.
- Treat Luno quotes and fills as a duplicate of Limitless; do not count it as a second leg.

## 13. Adapter guidance

- Do not build a Luno adapter. Add nothing to the registry beyond an alias: `luno-prediction-markets -> limitless (duplicate liquidity, no API)`.
- If Luno's retail fee floor matters for modelling a South Africa/Nigeria user's path, store `luno_fee_buy_range=[0.0003,0.03]`, `luno_fee_sell_range=[0,0.015]` as metadata on Limitless markets, flagged M.
- Optional low-value use: Luno `GET /api/1/balance?account_type=PREDICTION` (authenticated) could show a Luno user's own prediction-wallet balance in a personal-portfolio view. Needs a user-created Luno API key; out of scope for edge-finding.

## Open questions

1. Which chain does Luno use for the USDC payout transfer? (Likely Base to match Limitless, M; unconfirmed.)
2. Does Luno's fee floor (0.03%/0%) reflect a negotiated Limitless fee cap?
3. Are Luno's markets the public Limitless series or partner-gated copies with separate books?
4. Are strike-style "above $X at time T" markets actually shown in-app, versus Limitless's open-vs-close Up/Down?
5. Does Luno publish prediction-specific terms and a resolution/dispute process inside the app (not on public pages)?

## Suspicious content

None observed. No embedded instructions in Luno, Limitless docs or press pages.

## Sources

- https://www.luno.com/prediction-markets - H, fetched 2026-10-19 (also `/en-za/prediction-markets`, `/en-ng/prediction-markets`)
- https://www.luno.com/newsroom/turn-your-crypto-market-insights-into-actionable-outcomes-with-prediction-markets-on-luno - H, body dated 24 Mar 2026
- https://www.luno.com/en-za/campaign/prediction-markets/product-d - M (summary fetch; marketing page)
- https://www.luno.com/legal/terms-list, https://www.luno.com/en-za/legal/terms-of-use, https://www.luno.com/en-ng/legal/terms-of-use (14 May 2026), https://www.luno.com/legal/risks (17 Mar 2022, stale) - H for absence of prediction terms
- https://www.luno.com/en/developers/api (Luno API v1.2.5), https://www.luno.com/api - H
- https://github.com/luno/luno-go, https://github.com/luno/luno-mcp - H (no prediction endpoints)
- https://weetracker.com/2026/03/17/prediction-markets-nigeria-luno-launch/ - M
- https://weetracker.com/2026/08/17/african-crypto-exchanges-prediction-markets-bet/ - M
- https://docs.limitless.exchange/llms.txt, https://docs.limitless.exchange/user-guide/fees.md, https://docs.limitless.exchange/developers/programmatic-api.md, https://docs.limitless.exchange/changelog.md - H
- https://api.limitless.exchange/markets/active, /markets/{slug}, /markets/{slug}/orderbook - H, 2026-10-19
- docs/research/09-venues-onchain-clob.md (repo note, DefiLlama figures) - M
