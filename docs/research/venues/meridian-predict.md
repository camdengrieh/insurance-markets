# Venue spec: Meridian Predict (meridian.xyz)

Researched 2026-10-19. Read-only: GET requests, official docs, the public site's JS bundle read as text (never executed), no wallet, no signing. Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "NOT FOUND (searched: ...)" means exactly that.

## Verdict

| Item | Value |
|---|---|
| Adapter priority | **skip** (revisit only if 30d volume passes roughly $5M) |
| Still live (2026)? | Yes. Newest on-chain prediction seen was created 2026-10-18T23:10Z; app build dated 2026-10-15 [H] |
| Independent leg? | **No.** Every market is a mirror of a Polymarket or Kalshi market. Price, outcome and resolution all come from the underlying venue [H] |
| Read API | Official-public GraphQL, no auth, schema undocumented [H] |
| Trade path | RFQ auction over WebSocket plus on-chain `mint()`; not a plain order API [H/M] |
| PayBox reach | Partial: chain 4663 is in the PayBox catalog, but the flow is hard to run through PayBox (see Trade path) |

Why skip: Meridian Predict is a thin RFQ wrapper over Polymarket and Kalshi events. About $189k of 30d volume and about $21k of open interest, against $24M volume on a single Polymarket market it mirrors. It adds no independent price discovery and no independent resolution. Its price field is a copy of Polymarket's. An arbitrage scanner gets nothing from it that Polymarket and Kalshi do not already give. It is also geoblocked for US and Australian residents.

One reuse worth keeping: each Meridian condition carries `similarMarket.markets`, a URL to the exact Polymarket event or Kalshi ticker it mirrors. That is a free, venue-authored cross-venue link table. It could validate the market-linking design (docs/market-linking-design.md) as a one-off pull. It does not need a live adapter.

## What it is

- Product: prediction markets inside Meridian, "an onchain trading venue on Robinhood Chain" with two products, perps and prediction markets. Predict is "settled in USDe" [H, docs.meridian.xyz/index]. Launch: Meridian said it was a "day-one launch partner" for Robinhood Chain (post of 2026-07-01, date decoded from the post ID) [M]. DefiLlama volume adapter starts 2026-06-26, listed 2026-07-07 [H].
- Lineage: the app config names its backend `SAPIENCE_API_URL` / `SAPIENCE_WS_URL`, its GraphQL schema is Sapience's (conditions, condition groups, clusters, `PredictionMarketEscrow`), and the terms text still says "Ethereal". Meridian migrated from Ethereal ("Migrate from Ethereal" docs page) [H on strings; M on the inference that it is a Sapience protocol deployment]. Sapience is the upstream open-source protocol that used to run on Ethereal.
- Do not confuse with Robinhood's own "Predict" (CFTC-regulated, mobile only) [H, search results]. Unrelated.

### Market model
- Binary only. Each question has two sides ("Yes"/"No" in docs; the `outcomes` field also holds team names, e.g. `["Dallas","Green Bay"]` for moneyline). `marketType` seen: `moneyline`, `totals`, `both_teams_to_score`, or null for plain Yes/No [H, GraphQL]. No scalar markets.
- Not an order book and not an AMM. It is a **short RFQ auction**: the user broadcasts a size and pick, market makers return signed quotes, the best quote is taken, the escrow contract holds both sides' collateral, and the winner takes the whole pool [H, docs /trading/predictions]. Odds are locked at mint. Implied probability = `stake / (stake + counterparty stake)` [H, docs /odds-and-payouts].
- Singles and **combos** (up to 10 picks, all must hit; minimum stake 1 USDe) [H, docs /predictions-and-picks].
- Outcome tokenisation: not a YES/NO token per market. Each prediction mints a predictor ERC-20 and a counterparty ERC-20 (`predictorToken`, `counterpartyToken`) tied to a `pickConfig`. The docs say positions are "fungible ERC-20 tokens", transferable, sellable on a secondary-market auction, and bridgeable to Arbitrum [H, docs + GraphQL fields].
- Non-decisive results (ties, voided markets) **count against the predictor**. The counterparty wins. For a combo, one non-decisive leg loses the whole position [H, docs /resolution-and-settlement]. Note Polymarket normally refunds 50/50 on voided markets, so the two venues pay differently on the same event.

### Chains and collateral
- Chain: Robinhood Chain mainnet, chainId **4663** (testnet 46630) [H, docs /contracts]. Every condition scanned reported `chainId: 4663` [H].
- Collateral: **USDe** (Ethena), 18 decimals; all GraphQL amounts are 18-decimal wei strings (e.g. `10100000000000000000` = 10.1 USDe) [H].
- Gas is paid in the chain's native asset, separate from collateral [H, docs migration page on perps; the app's mainnet bundler URL is flagged `selfFunded=true`, M for Predict].
- Collateral token address: NOT FOUND (searched: docs, app bundle chunks, DefiLlama). Warning: PayBox's token search for "USDe" on 4663 returns several look-alike tokens with different addresses (only one has real liquidity). Never resolve the collateral by name; read it from the escrow contract.
- Contracts, mainnet [H, docs /protocol-reference/contracts]: Vault `0x79cB914f3F336426E89FaB55A9488AB25770552D`, Prediction Market Escrow `0xE4cea507b19796362A5a28Fa7cb705A3F1866213`, Secondary Market Escrow `0x7E318ef37c3bC3d0cBA205Af2D1Fc9F9CeFEB5df`. Events used by DefiLlama's adapter: `PredictionCreated(predictionId, predictor, counterparty, predictorToken, counterpartyToken, predictorCollateral, counterpartyCollateral, refCode, pickConfigId)` and `TradeExecuted(tradeHash, seller, buyer, token, collateral, tokenAmount, price, refCode)` [H, DefiLlama adapter source].
- Contract verification: NOT checked. Blockscout returned a Cloudflare 403 challenge (not bypassed); Sourcify has no match for the escrow or resolver addresses (404).

## Read API

| Item | Detail |
|---|---|
| Exists | Official-public GraphQL. Endpoint listed in the docs' API Hosts page; **no developer guide or schema docs for Predict** (the dev guides cover the perps API only) [H] |
| Base URL | `https://api.predict.meridian.xyz/graphql` (testnet `api.predict.meridiantest.net/graphql`) [H] |
| Docs | https://docs.meridian.xyz/protocol-reference/api-hosts , https://docs.meridian.xyz/llms-full.txt [H] |
| Auth | None for reads. Plain GET with `?query=` works [H] |
| Rate limit | Response headers `RateLimit-Policy: 200;w=60` (200 per 60 s; per-IP presumed) and `RateLimit-Limit/Remaining/Reset`. Not in the docs [H headers] |
| Pagination | `first` max **25** (`PAGINATION_LIMIT_EXCEEDED` above that), cursor via `after` / `pageInfo.endCursor` [H] |
| Introspection | **Disabled** (`INTROSPECTION_DISABLED`). Schema below is reverse-read from the app's own JS bundle (official front-end code, read as text) plus validation errors. Treat as unstable [H on strings; M on stability] |
| Websocket | `wss://relayer.predict.meridian.xyz/auction` is the RFQ relayer, not a passive market-data feed; subscribing needs an `auctionId` [M]. No public market-data stream found. |

Key queries (names verified by successful GET; field lists from the bundle):
- `conditions(first, after, filter:{settled, conditionIds}, orderBy:{field: OPEN_INTEREST|..., direction})` returns `conditionId, resolver, question, shortName, optionName, endTime, chainId, settled, resolvedToYes, nonDecisive, estimatedPrice, openInterest, similarMarketVolume(1h/4h/24h/7d), marketType, outcomes, tags, similarMarket{markets,image}, conditionGroup{groupId,externalEventId}, category{name,slug}` [H].
- `conditionGroups`, `questions` (union of Condition / ConditionGroup / ConditionGroupCluster), `categories`, `tags` [M, in bundle only].
- `predictions(first, after, filter:{participant,predictor,conditionIds,settled,...}, orderBy:{field: ON_CHAIN_CREATED_AT, direction})` returns `predictionId, predictorCollateral, counterpartyCollateral, settled, result (PREDICTOR_WINS|COUNTERPARTY_WINS|...), createdAt, settledAt, pickConfig{picks{conditionId, predictedOutcome}}` [H]. This is the trade tape: the stake pair gives realised RFQ odds.
- `trades(filter:{executedAt, seller})` for secondary-market trades [M, bundle only; not called].
- Resolution state is on the condition: `settled`, `resolvedToYes`, `nonDecisive` [H].

Fixtures (docs/research/fixtures/meridian-predict/):
- `graphql_conditions_open_top25_by_oi_2026-10-19.json` (+ `.query.graphql`): top 25 unsettled conditions by open interest.
- `graphql_predictions_recent5_2026-10-19.json` (+ query): five newest primary trades, wallet fields deliberately not requested.
- `graphql_conditions_first3_settled_2026-10-19.json` (+ query): shape of settled conditions.
- `defillama_summary_dexs_meridian-predict_2026-10-19.json`, `derived_open_interest_summary_2026-10-19.json` (my aggregation, 125 conditions), `crosscheck_estimatedPrice_vs_polymarket_2026-10-19.json`.

### Adapter field mapping (if ever built)
- Venue key: `meridian-predict`, chain `eip155:4663`, id = `conditionId` (bytes32).
- Link to the underlying: parse `similarMarket.markets[0]`. Polymarket: `https://polymarket.com/event/<event-slug>#<market-slug>`. Kalshi: `https://kalshi.com/markets/...?op_market_ticker=<TICKER>&op_order_side=yes`, where the ticker is the Kalshi market ticker [H].
- Which source: the `resolver` address. In the OI-sorted scan, `0xe42847ee...4d70475` carried 115 Polymarket-linked conditions and `0xf756feea...1466a21338fe60` carried 10 Kalshi-linked ones (the address-to-source mapping is inferred from the URLs, M).
- `estimatedPrice` is YES price in [0,1]. **It is a copy of the underlying price, not Meridian price discovery**: for "Clarity Act (H.R.3633) signed into law in 2026?" it was 0.0505, identical to Polymarket's `outcomePrices[0]` = 0.0505 (bid 0.05, ask 0.051) fetched at the same time; the Levante/Athletic BTTS market matched at 0.565 on both [H, two checks].
- `openInterest` / collateral fields: divide by 1e18.
- Do not trust `endTime`: the docs call it an estimate; the Levante vs Athletic markets showed `endTime` 2026-09-16 while Polymarket's `endDate` was 2026-10-21 and still active [H].

## Trade path

1. Predictor opens the relayer WebSocket and sends `auction.start` carrying picks, `predictorCollateral`, `predictor`, `predictorNonce`, `predictorDeadline` (the app uses now+300 s), `chainId`, `escrowContract`, `mode:"blind"`, optional sponsor fields. The app's code also uses `auction.subscribe/unsubscribe`, `auction.accept` (with `predictorSignature`), `auction.filled/expired/pending/result` [H, bundle strings].
2. Makers answer with signed quotes (`counterparty`, `counterpartyCollateral`, `counterpartyDeadline`, `counterpartySignature`, `counterpartyNonce`). The docs say quotes "expire quickly, so the auction completes in seconds" [H].
3. The best quote is picked and the predictor confirms with the wallet. "The smart contract collects collateral from both you and the winning market maker and issues your position" [H, docs /placing-a-prediction].
4. Upstream Sapience docs (a different deployment; the message set differs from Meridian's app, which uses `auction.accept` while upstream says there is none) describe an EIP-712 `AuctionIntent` signature from the predictor, an EIP-712 `MintApproval` from the maker, and a client-side call to `PredictionMarketEscrow.mint()` with both signatures; limits 100 msgs/10 s, 64 KB, 5 min idle [M/L, https://docs.sapience.xyz/builder-guide/api/auction-relayer]. Meridian publishes none of this.
5. Meridian's app is built around ZeroDev smart accounts and session keys (bundler config, `*SessionKeyData` fields) [H strings]. Whether a plain EOA can call `mint()` directly: NOT FOUND (searched: Meridian docs, bundle, Sapience docs).

Documented SDK or trading guide for Predict: NOT FOUND (searched: docs.meridian.xyz llms.txt, sitemap, llms-full.txt). Perps has a Python SDK and OpenAPI; Predict does not.

### Reachable through PayBox?
**Partial.**
- Robinhood Chain (eip155:4663) is in PayBox's chain catalog and token search returns USDe-named tokens there [H, discover_tokens call 2026-10-19; also docs/research/06-paybox-platform.md section 5]. An EVM MPC wallet shares one address across all `eip155:*` chains [H, same file].
- Plausible route: `io.paybox/transactionProposal` for ERC-20 approve and the escrow call, plus `request_wallet_sign` typedData for the two EIP-712 intents. Problems: (a) a plugin cannot hold a WebSocket or span more than one 10 s sandbox call, so the auction must be agent-orchestrated; quotes live seconds to minutes; (b) transaction proposals allow one call each; (c) `request_wallet_sign` carries no `value_cents`, so spend policy cannot see typedData stakes; (d) gas needs native balance on 4663; (e) geoblock and ToS below. None of this was tested (no money tools used).

## Fees
- **No trading fee**: "Meridian Predict does not charge trading fees... the protocol does not take a cut" [H, docs /fees-and-collateral]. DefiLlama: "Fees are set to 0 at the moment" [H].
- Real cost is the maker's spread inside the RFQ quote, plus gas. Single illustrative sample (L): a two-leg NO/NO Kalshi NFL combo staked 10.1 USDe against 72.47 USDe implied a 12.2% win probability, versus about 10.4% from the product of the two legs' mirrored prices, so roughly 15% negative expected value for the taker at those mids. One sample, mid-prices fetched about an hour after creation; do not generalise. The `predictions` tape gives the data to measure this properly.
- A `refCode` field exists on both events (referrals); no schedule found. Promotions: "Predict Competitions" and monthly reload boosts [H, docs /rewards-and-bonuses].

## Resolution and dispute risk
- "Meridian Predict does not decide outcomes itself; it reads the resolved result from the underlying market" and "surfaces questions from established prediction markets" [H, docs]. Polymarket-sourced conditions therefore inherit Polymarket's UMA optimistic-oracle process (and its disputes); Kalshi-sourced ones inherit Kalshi's centralised settlement [M].
- How the result reaches Robinhood Chain (permissioned keeper, LayerZero relay, other): NOT FOUND (searched: docs, GraphQL, bundle; explorer blocked by Cloudflare; Sourcify no match). Upstream Sapience ABIs show resolver types `ConditionalTokensConditionResolver`, `LZConditionResolver` (LayerZero OApp, owner-settable peers), `PythConditionResolver`, `ManualConditionResolver` [M, upstream repo]; which one `0xe428...`/`0xf756...` are is unverified.
- Extra risks on top of the underlying's own: resolver or relayer liveness and trust, the non-decisive-loses rule, combo early settlement for the counterparty ("can claim the entire pool right away" once one leg loses) [H], and redemption is a manual claim step [H].
- Audits: the docs' audit page covers only "the perpetual futures exchange contracts" (Guardian, ChainSecurity) [H]. No Predict audit found (searched: docs Audits page). Sapience claims a 0xMacro audit of its contracts [L, upstream, different deployment].

## Geo, ToS, automation
- App geoblock modal: "Meridian is not available to residents, citizens or companies incorporated in the United States of America, Australia and other restricted regions." [H, app bundle]
- Terms (in-app `/terms`, text still references "Ethereal"): Restricted Users include anyone "located in or under the control of any individual, organization, or group located in, the United States" plus sanctioned jurisdictions; "We reserve the right to enforce geo-blocking"; VPN circumvention prohibited [H].
- Automation: the terms bar using "any robot, spider, or other automatic device, process, or means to access the Services for any purpose, including monitoring or copying any of the material on the Services" [H]. The GraphQL host is nevertheless listed in the official docs and answers unauthenticated GETs, and there is no Predict-specific API policy. Treat read polling as gray-area, keep it light, and ask Meridian before any production use. NOT FOUND (searched: docs, app terms): an explicit API or bot policy for Predict.
- Implication for this project: if the operator or agent is US-based, trading is not permitted. Reading public data is not obviously prohibited but sits under the same terms.

## Liquidity (all small)
| Metric | Value | Source and date |
|---|---|---|
| Volume 24h / 7d / 30d / all-time | $3.3k / $53.5k / $188.7k / $560.1k (since 2026-06-26) | DefiLlama `summary/dexs/meridian-predict`, fetched 2026-10-19, last full day 2026-10-18 [H] |
| Daily volume, last 8 days | 8.3k, 13.5k, 6.8k, 6.1k, 4.8k, 9.7k, 4.3k, 3.3k | same, falling trend [H] |
| Open interest | $32.8k (24h row) | DefiLlama `overview/open-interest`, 2026-10-19 [H] |
| Open interest, my scan | $20.8k over 111 unsettled conditions with OI > 0 (125 scanned); largest single condition $2.56k | GraphQL, 2026-10-19 [H] |
| TVL | about $1.03M, all USDe | DefiLlama, 2026-10-18 [H]; composition unverified, likely idle maker or vault capital (M) |
| Mirrored Polymarket market for comparison | $24.1M volume, $324k liquidity | gamma-api.polymarket.com, 2026-10-19 [H] |

The discovery hint (DefiLlama OI about $33k) and the earlier project note (under $5M / 30d, docs/research/09-venues-onchain-clob.md) are both consistent with these figures.

## Event overlap
By construction 100% of markets duplicate Polymarket (115 of 125 scanned) or Kalshi (10 of 125). Open interest by category in the scan: Sports $8.7k (56 conditions; NFL moneyline, soccer totals and BTTS), Crypto $3.7k (including 15-minute BTC up/down), Other $3.5k, Geopolitics $2.8k, Economy & Finance $1.7k (Fed decision), Culture and Tech & Science under $0.3k [H]. Everything overlaps; nothing here is unique.

## Shares liquidity?
Partly. Collateral is its own (maker capital escrowed on Robinhood Chain), so it is not a literal liquidity pool shared with Polymarket. But price is a direct copy of the underlying and the payoff is settled by the underlying outcome, so it is **not an independent arbitrage leg**. The only edge versus Polymarket or Kalshi would be the maker's spread, and the maker side is unknown (whether makers hedge on those venues: NOT FOUND).

## Open items
- Verify the resolver and escrow code (needs an explorer that is not Cloudflare-challenged, or an RPC call; neither used here).
- Confirm whether an EOA can `mint()`.
- Sapience (the upstream protocol, previously on Ethereal): `api.sapience.xyz` showed an SSL name mismatch on 2026-10-19 (not bypassed). Possibly wound down after the Ethereal-to-Meridian migration; unconfirmed, and it is a separate candidate venue.
- I did not record the bundler URLs with embedded project IDs found in the app config.

## Sources
- [H] https://app.meridian.xyz/predict (HTML, CSP, `assets/index-JE15kRaS.js`, `config-CJMamCkX.js`, `sapienceTypes-Djvr2e6E.js`, `prediction-CGKWAGm4.js`, `terms.lazy-DTq8WbPQ.js`), read 2026-10-19; last-modified 2026-10-15
- [H] https://docs.meridian.xyz/llms.txt , /llms-full.txt , /sitemap.xml (Predict pages: /trading/predictions/*; /protocol-reference/api-hosts, /contracts, /audits)
- [H] https://api.predict.meridian.xyz/graphql (GET queries, 2026-10-19; headers: RateLimit-Policy 200;w=60)
- [H] https://api.llama.fi/protocol/meridian-predict , /summary/dexs/meridian-predict , /overview/open-interest ; https://raw.githubusercontent.com/DefiLlama/dimension-adapters/master/dexs/meredian-predict.ts
- [H] https://gamma-api.polymarket.com/events?slug=clarity-act-signed-into-law-in-2026 and ...lal-lev-bil-2026-09-16-more-markets (price cross-check)
- [H] PayBox `discover_tokens` (search USDe on eip155:4663), 2026-10-19; docs/research/06-paybox-platform.md
- [M] https://x.com/meridiandotxyz/status/2072407641545134458 (title seen in search results only; date decoded from the ID)
- [M/L] https://docs.sapience.xyz/builder-guide/api/auction-relayer , /user-guide/trading/resolution , https://docs.sapience.xyz/llms.txt , https://github.com/sapiencexyz/sapience (upstream protocol, different deployment)
- Not reachable: https://robinhoodchain.blockscout.com (Cloudflare 403 challenge), https://sourcify.dev (no match), https://api.sapience.xyz (certificate mismatch)
