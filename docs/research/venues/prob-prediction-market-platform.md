# Venue spec: "Prob" prediction market platform (= Probable, probable.markets)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- adapter_priority: **skip** (P2 at best as a signal-only feed). Technically integrable, but the venue looks dormant: no new market created since 2026-02-27 (about 7.5 months), TVL down about 95% from peak, and almost every "active" order book is empty or has a 99% spread.
- The discovery hint "distinct from Probable/Probly/Probo" is **wrong**. `@prob/core` is the official SDK of Probable (probable.markets, BNB Chain). Evidence: npm maintainer mailbox is on the probable.markets domain; the SDK README links docs.probable.markets and developer.probable.markets and hard-codes api.probable.markets URLs [H]. Any separate "Probable" venue-spec in the workflow is the same venue and should be de-duplicated.

## Is it live?

- Website and APIs respond today [H]: probable.markets (HTTP 200), docs.probable.markets (GitBook, 200), api.probable.markets and market-api.probable.markets return JSON. Order books carry timestamps of 2026-10-19 [H].
- Newest event created 2026-02-27; newest market start 2026-03-31 (a Loopscale market with endDate 2027-01-01); 1,254 markets and 678 events total, all `marketStructure: single` [H, own crawl of market-api 2026-10-19].
- 109 markets flagged `active && !closed` (54 active events). I fetched the YES-token book for all 109: only 4 had a spread of 5 cents or less, and just one had real size (Rabby token launch: bid 0.15 x 658k shares, ask 0.16 x 10.8) [H]. Typical active book: bid 0.001 / ask 0.989-0.999, i.e. no market (fixture `book_dead_jesus_yes.json`).
- Sum of `liquidity` over the active markets is about $227k [H, own crawl; field semantics unverified].
- DefiLlama (api.llama.fi/protocol/probable, category "Prediction Market", chain Binance, listed 2026-01-25) [H]: TVL peak $3.96M on 2026-01-26, $1.0M on 2026-03-06, $0.33M by 2026-04-07, $0.21M since about 2026-08, $203.9k on 2026-10-19. Flat for months, so no organic activity.
- No shutdown or sunset notice found on docs.probable.markets overview [H]. Dormant rather than formally closed; not checked: X (@0xProbable per DefiLlama), Discord.

## Kind and market model

- kind: on-chain CLOB prediction market on BNB Chain, Polymarket-style architecture [H for components, see Contracts].
- Binary Yes/No only in practice: every market has `outcomes` of two entries and two `clobTokenIds`; all events are `marketStructure: single`; `neg_risk: false` in books. SDK has no multi-outcome/neg-risk handling beyond the flag [H].
- Order book (central limit, off-chain matching, on-chain settlement through a CTF Exchange contract). Tick 0.001, min order size 1 share, price range 0.001-0.999 in books (docs say shares priced $0.01-$0.99) [H].
- Tokenisation: Gnosis Conditional Tokens (ERC-1155) positions; `condition_id` (bytes32) per market; `clobTokenIds` are the ERC-1155 position ids (uint256 decimal strings). Split/merge/redeem via CTF; docs have a "Merge and Split" page [H, SDK ABI + docs index].
- Market creation is team-curated only (users cannot create; suggestions via Discord) [H]. Many markets are crypto-native (token launches, FDV after launch, airdrops, IPOs) plus some sports (NBA, LoL) and politics (2028 election) [H].

## Chains and collateral

- Chain: BNB Smart Chain (chainId 56); testnet 97 also configured [H, SDK config].
- Collateral: USDT (BSC-USD) `0x55d398326f99059fF775485246999027B3197955`, **18 decimals** on BSC mainnet [H, SDK `@prob/core` 0.3.0]. Docs say more collateral options are planned [H].
- Contracts, BSC mainnet (from SDK constants, not independently verified on-chain) [H for SDK content / M for correctness]:
  - ConditionalTokens `0x364d05055614B506e2b9A287E4ac34167204cA83`
  - CTF Exchange `0xF99F5367ce708c66F0860B77B4331301A5597c86`
  - Safe proxy factory `0xB99159aBF0bF59a512970586F38292f8b9029924` (impl `0xb99edA5281a3d2BefeF2f2243Dc37183dD2999FF`)
  - UMA CTF cross-chain adapter `0x7cD31c0d0122FE881F429342e3841E2F08753234`
  - SDK also lists Polygon (137) and Polygon Amoy entries for a UMA-side contract (`0xa68F...`, `0xDdA9...`), consistent with UMA resolution happening on Polygon and being bridged [M].
- Each user trades through a Safe proxy wallet derived from the EOA (SDK `checkSafeProxyWalletExists`, `proxyApproveCollateral`, `proxyExecuteTx`) [H].
- Platform sponsors gas for trades; users pay gas for deposits/withdrawals [H].

## Read API

- exists: **official-public** for market data (unauthenticated), official-authenticated for orders/positions.
- Docs: https://developer.probable.markets (Cloudflare-challenged; HTTP 403 to WebFetch and a "Just a moment" page to curl, so I could not read it) [H that it is blocked]. SDK README points to https://developer.probable.markets/api/orderbook-api/orders and https://docs.probable.markets/trade-on-probable/fees. Endpoint list below therefore comes from the official SDK `@prob/clob` 0.5.0 bundle plus live probes, not from the docs site.
- Base URLs [H, SDK constants]:
  - `https://market-api.probable.markets/public/api/v1` (market metadata)
  - `https://api.probable.markets/public/api/v1` (order book / prices / trading; default `baseUrl`)
  - WebSocket `wss://ws.probable.markets/public/api/v1` (README example; only `executionReport` user stream documented, requires API key; no public book stream documented) [H README / not probed]
- Endpoints confirmed by live unauthenticated GET 2026-10-19 [H]:
  - market-api: `GET /events?limit&page&active&closed` (array of events with nested markets), `GET /markets?limit&page` (`{markets:[...],pagination:{page,limit,totalResults,totalPages,hasMore}}`). Note page past the end returns an empty result. Default ordering is oldest-first.
  - api: `GET /book?token_id=` (bids/asks as price+size strings, `timestamp`, `hash`, `tick_size`, `min_order_size`, `neg_risk`), `GET /midpoint?token_id=`, `GET /price?token_id=&side=BUY`, `GET /prices-history?market=<token_id>&interval=max` (`{history:[{t,p}]}`, 10-minute points).
  - Mirror calls on the market-api host returned HTTP 500 for book/midpoint/price/history, so use the api host for those [H].
- Endpoints seen in the SDK but not probed [M]: `events/{id}`, `events/slug/{slug}`, `markets/{id}`, `markets/bsc/{questionId}`, `markets/polymarket/{polymarketId}`, `info/token-ids-event`, `POST prices` (batch), `public-search`, `activity`, `pnl`, `position/*`, `trade/{chainId}`, `orders/{chainId}/open`, `order/{chainId}`, `auth/api-key/{chainId}`, `auth/verify/l2`.
- Resolution data is exposed in the markets payload: `resolved`, `resolved_outcomes`, `resolution_label`, `liveness`, `proposed_price`, `price_proposer`, `price_expiration_ts`, `resolved_timestamp`, `resolved_tx`, `disputed`, `proposal_history` [H].
- Trades: public trade tape not found (the `trade/{chainId}` and `activity` routes look authenticated; `GET /orders/56/open` unauthenticated returns HTTP 422 asking for headers) [H]. Last-trade price endpoints not confirmed.
- Auth and limits for public reads: none needed. Rate limits NOT FOUND (searched: SDK bundle, response headers not captured, developer docs blocked by Cloudflare).
- Field caveat: `volume`/`volume24hr` in the market payload look unreliable (a single NBA game shows 38,763; a "Satoshi move any BTC" market shows 166,932,833; sum over all markets is 2.98e9, which is not plausible against $0.2-4M TVL) and the 24h field is nonzero for markets closed for months. Treat these fields as lifetime or mis-scaled until confirmed. [H on values, L on meaning]
- Fixtures: `docs/research/fixtures/prob-prediction-market-platform/` (markets_active_sample.json, markets_resolved_sample.json, events_active_sample.json, book_rabby_yes.json, book_dead_jesus_yes.json, midpoint_dead_jesus_yes.json, book_scan_active_2026-10-19.json).

## Trade path

- Official TS SDK `@prob/clob` 0.5.0 (npm, last publish tags 2026-03-03) and `@prob/core` 0.3.0 (2026-02-03); `@prob/types` 0.0.1 [H, npm registry]. No source repo or homepage in npm metadata.
- Auth, two levels [H, SDK code]:
  - L1: EIP-712 typed data, domain `{name:"ClobAuthDomain", version:"1", chainId}`, primary type `ClobAuth{address, timestamp(string), nonce(uint256), message}` with message "This message attests that I control the given wallet". Headers `PROB_ADDRESS`, `PROB_SIGNATURE`, `PROB_TIMESTAMP`, `PROB_NONCE`. Used to `POST auth/api-key/{chainId}` which returns `{apiKey, secret, passphrase}`.
  - L2: HMAC-SHA256 over `timestamp + METHOD + requestPath + body`, key = base64-decoded secret, URL-safe base64 output. Headers `PROB_ADDRESS`, `PROB_SIGNATURE`, `PROB_TIMESTAMP`, `PROB_API_KEY`, `PROB_PASSPHRASE`.
- Orders: `createLimitOrder` (GTC/GTD/IOC) and `createMarketOrder` (FOK/FAK), signed order struct posted with `POST order/{chainId}` / `orders/{chainId}`; cancel via `DELETE order/{chainId}/{id}`, `orders/{chainId}`, `orders/{chainId}/all` [H]. Order struct signing details (EIP-712 exchange domain, signature type for the Safe) NOT verified here; read `@prob/clob`/`@prob/core` before implementing.
- On-chain extras: split, merge, redeem via CTF calldata, executed through the Safe proxy (`execTransaction`) [H].
- I did not create keys, sign anything, or POST anything.

## PayBox reachability

- paybox_reachable: **partial** (technically yes for an EVM wallet on BNB; not tested; venue is dormant anyway).
- A PayBox BNB-chain EVM wallet can in principle: (a) sign the L1 EIP-712 ClobAuth message with `request_wallet_sign`; (b) sign order structs (EIP-712) the same way; (c) submit approve/split/merge/redeem or Safe `execTransaction` as transaction proposals; (d) fund USDT on BSC. Complication: orders are filled from a Safe proxy derived from the EOA, so the signer/maker/signature-type relationship needs confirming in SDK code; HMAC L2 requests are plain HTTP and need the API secret held by the plugin [M].

## Fees

- Taker-only, makers free; taker fee 0.01% to 1.75% depending on price, peaking at 50% and falling toward 0/100; shown in order preview; charged in settlement asset (USDT) or CTF token; platform pays gas for trades [H, docs.probable.markets/trade-on-probable/fees].
- Formula not published in docs. SDK constants: `feeRateBps: 175`, `feeMultiplier: 7`, `minFeeRateBps: 1`, `maxFeeRate: 1000` bps (exchange cap) [H]; `calculateFee(order, pricePerShare)` exists in SDK. Exact curve NOT FOUND in docs; take it from SDK `calculateFee` if the venue is ever integrated.
- Deposit/withdraw/resolution fees: NOT FOUND (docs page silent).

## Resolution and dispute risk

- UMA optimistic oracle: proposal on UMA, dispute window "can vary and is set per question", UMA holders vote on dispute, typically 24-48h, and **unresolvable outcomes resolve 50/50** [H, docs how-are-markets-resolved]. Payload shows `liveness: "7200"` (2h) on sampled markets and the proposer address; sample sports markets resolved about 1 minute after the liveness expiry [H].
- Cross-chain adapter: the BSC contracts include a "UMA CTF cross-chain adapter" and the market-api has a `markets/polymarket/{id}` lookup; this suggests some markets may mirror/resolve with Polymarket questions [M, inferred from names only]. If true, resolution is correlated with Polymarket, which matters for arbitrage independence. Not verified.
- Risks: team-curated resolution wording, 50/50 fallback, short 2h liveness, no audit listed on DefiLlama (`audits: 0`) [H/M].

## Geo, ToS, automation

- Restricted jurisdictions [H, docs.probable.markets/legal/restricted-jurisdictions]: Iran, Syria, Cuba, North Korea, Crimea/Donetsk/Luhansk, **United States, United Kingdom**, China, France, Canada, Singapore, Poland, Thailand, Taiwan; list may change.
- Automation/bots/VPN rules: NOT FOUND (searched: restricted-jurisdictions page, fees page, overview; ToS not located; developer docs blocked). Official SDK with API-key flow implies programmatic trading is supported [M].

## Liquidity

- TVL $203.9k on 2026-10-19 (DefiLlama, H); peak $3.96M on 2026-01-26. Order-book depth on active markets: about $227k nominal `liquidity` sum, but only about 4 of 109 books are quoted within 5 cents [H, own scan 2026-10-19]. No reliable volume figure (see field caveat).

## Event overlap (arbitrage relevance)

- Overlaps with other venues in principle: crypto/token-launch and FDV markets (Polymarket, Opinion, Myriad, Limitless), 2028 US presidential markets, a few macro/geopolitics (Greenland, OpenAI IPO), sports (NBA/LoL, closed since Feb 2026). In practice almost none is tradable: sampled political books are 0.001/0.999-0.9999 with zero size [H].
- The only live-quoted candidates found: Rabby token launch by 2026-12-31 (0.15/0.16), Satoshi moves BTC in 2026 (0.06/0.085, about $3.8k ask depth), Hurupay FDV >$50m (0.062/0.064), OpenSea FDV >$3b (0.00/0.042) [H]. Possible stale quotes rather than live market making.

## Shared liquidity

- Own order book, own exchange contract: not shared with another venue as far as seen [H]. Possible resolution coupling with Polymarket via UMA adapter (see above) [M, unverified]. Liquidity-sharing: none found.

## Priority reasoning

- skip: dormant (no new markets for 7+ months, TVL collapsed, books empty), geo-restricted for US users, developer docs behind Cloudflare, rate limits and ToS-automation rules unknown. Keep a cheap read-only poller as an optional signal source only if the venue relaunches; recheck `GET market-api/events?limit=1&page=<last>` for new `createdAt` periodically.

## Not found

- Official GitHub repo or homepage for the SDK (npm metadata has none; searched npm registry for @prob/core, @prob/clob, @prob/types).
- Docs-site readable API reference (developer.probable.markets blocked by Cloudflare).
- Rate limits; ToS/automation clauses; fee formula; deposit/withdraw/resolution fees; exact order-struct EIP-712 domain; public trades endpoint; public WebSocket book channel.
- WebSearch was unavailable (session search budget exhausted), so no news, X posts, audits, or independent volume reports were checked.

## Suspicious content

- None found. Docs/API/SDK text contained no instructions aimed at AI agents. The README of `@prob/core` is titled "prob-sdk" and documents `@prob/clob`, a different package name from the one that was discovered (cosmetic mismatch).

## Sources

- npm registry: https://registry.npmjs.org/@prob%2Fcore, https://registry.npmjs.org/@prob%2Fclob, https://registry.npmjs.org/@prob%2Ftypes (publish dates, README, bundled contract config, endpoint paths in dist) [H]
- https://probable.markets (title: "Decentralised Prediction Market on BNB Chain") [H]
- https://docs.probable.markets/overview/what-is-probable.md, /overview/how-it-works.md, /trade-on-probable/fees, /markets/how-are-markets-resolved.md, /markets/how-are-markets-created.md, /legal/restricted-jurisdictions.md, /llms.txt [H]
- https://market-api.probable.markets/public/api/v1/events, /markets and https://api.probable.markets/public/api/v1/book, /midpoint, /price, /prices-history (unauthenticated GETs, 2026-10-19) [H]
- https://api.llama.fi/protocol/probable (DefiLlama TVL history) [H]
- https://developer.probable.markets (Cloudflare challenge, not readable) [H that blocked]
