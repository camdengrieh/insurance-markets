# Probly (probly.com) - venue spec

Researched 2026-10-19. Read-only: public web pages, GitBook `.md` mirrors, static reading of the site's own JS bundles (downloaded as text, never executed), unauthenticated GETs to the site's own backend, one unauthenticated read-only WebSocket subscription, public Polymarket and DefiLlama GETs for cross-checks. No accounts, no wallet, no POST, no signing, no payments, no browser automation. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak, stale or ambiguous.

## Verdict

- Adapter priority: **skip**.
- Probly is live (2026) but it is **not an independent liquidity venue**. Its catalogue is a copy of Polymarket's: every market row carries Polymarket's own `pm_market_id`, `condition_id` and `clob_token_ids`, resolution is labelled `uma` (Polymarket's UMA flow) or `chainlink`, and its live order books reproduce Polymarket's CLOB level by level (three side-by-side comparisons, see "Shared liquidity"). H.
- There is **no documented API**: TxFlow's "Platform API" page says "Coming Soon..." (H). The data/trading endpoints are the website's private backend, found by reading the site JS. Trading needs a Privy-issued bearer token plus an agent-key scheme. Both Probly's and TxFlow's Terms forbid bots and scrapers without written permission.
- Probly's own traded volume is tiny (event-level volume fields mostly 0, max $1.2K in a 90-object sample). Fees are a curve of up to 1.75% of notional at p=0.5 for crypto, so routing the same exposure through Probly is strictly worse than routing it through Polymarket.
- Revisit only if (a) TxFlow publishes the Platform API and (b) evidence appears that Probly's book is its own and not a relay of Polymarket's.

## Liveness (still live in 2026?)

- **Live.** probly.com/en/crypto returned HTTP 200 on 2026-10-19 with rolling 5m/15m/1h Up-or-Down events for the current time window; `api.probly.com` answers; `GET /api/v1/basic_data/live-count` returned `{"total_events":29}` (H, fixture `live_count.json`).
- Launch: TxFlow L1 announced Probly as its second "Channel" and "the first prediction-market application built on TIP3" on 2026-07-14 (GlobeNewswire release, read via crypto.news and WebSearch summary; the GlobeNewswire page itself returned 403). A second release dated 2026-07-20 repeats it. M. So the venue is about 3 months old. The bug-bounty policy page is dated "Last updated: July 10, 2026" (H).
- Operator: **WisdomBayes Inc.** per the Terms (H, https://www.probly.com/en/term-of-use). Place of incorporation not stated; governing law Panama, arbitration HKIAC Hong Kong. The press releases name no team. No financial licence claimed (Terms, and CoinGape table "No regulatory licence disclosed", M).
- Third-party listing: CoinGape "Best Crypto Prediction Markets", updated 2026-09-15, lists Probly with primary chain "TxFlow L1", USDC, "CLOB", no volume stated (H read; the discovery hint is consistent).
- Counts disagree: release 1 says 172 live markets/event pages across 15 categories and "more than 7,000 events"; release 2 / Bitget say "5,000+ events and 12,000 markets" and "172 active live markets as of July 13" (M, unreconciled). API tag trees on 2026-10-19: crypto parent_event_count 323 (178 pre-market, 43 bitcoin), sports parent_event_count 637 (436 games, 201 props) (H, fixtures `tag_tree_*.json`).

## Kind and market model

- Kind: Polymarket-mirroring CLOB front-end on an app-chain (TxFlow L1, a Hyperliquid-style L1). Docs say "Trading on Probly runs on a Central Limit Order Book ... matched transparently against a public, user-to-user order book" (H, https://docs.probly.com/markets-and-trading/overview.md). Whether the resting liquidity is user-to-user or a relay of Polymarket's book is exactly the open question (see Shared liquidity).
- Binary YES/NO plus "category markets" (multi-outcome, exactly one wins; each outcome has its own YES/NO; `neg_risk` / `enable_neg_risk` flags exist) (H docs, H API field names). No scalar markets. Crypto "Up or Down" markets use outcome labels `Up`/`Down`.
- Order book (CLOB) with price-time priority, market and limit orders, limit expiry (5m/1h/12h/24h/EOD/custom); split/merge USDC <-> YES+NO 1:1 by the protocol with no spread (H docs, merging-and-splitting.md).
- Limits: min 5 shares (docs and `min_limit_order_size: "5.0"`), share precision 2 dp, `min_market_order_notional` 1 USDC, docs price range 1c-99c with 1c ticks (REST `order_price_min_tick_size: "0.01"`; REST also shows `price_tick: "0.001"` and WS prices carry 3 dp, so the real tick is ambiguous). H.
- Tokenisation: the API exposes Polymarket's ERC-1155 CTF token ids (`clob_token_ids`, decimal uint256, Yes first) and `condition_id`. On Probly itself positions are L1 account state, not ERC-1155s the user holds on an EVM chain (M: no Probly outcome-token contract found; TxFlow docs describe account/position state, "Account Interface: User State, Balance State, Position State"). The order wire uses a numeric `symbolIndex` (`a`) per market, not the CTF token id (M, minified JS).
- Per-market config fields (H, event detail): `fee_rate`, `maker_rebate_rate` (0.2-0.25), `fee_type` (`crypto_fees_v2`, `mentions_fees`, `economics_fees`, `culture_fees`), `fee_code` (`PBLCRY`, `PBLMEN` ...), `exponent`, `resolution_mechanism`, `uma_resolution_status`, `oracle_outcome`, `accepting_orders`.

## Chains and collateral

- Execution/settlement chain: **TxFlow L1** (own L1; claims 250K+ TPS, DAG-parallel execution; no chain-id/RPC/explorer documented in TxFlow docs, M). The site SDK config names `TxFlow-Mainnet` with chainId **869** as the effective default (a literal `"869"` overrides an unused `production` default of 2602) and `signatureChainId` **42161** (Arbitrum One). M (minified JS, chunk `1ssx2xqt-jfq8.js`).
- Collateral: **USDC** only (H docs). Deposits (docs.txflow.com mainnet-onboarding, H) accept native USDC on **Arbitrum, Base, Ethereum, Polygon PoS, Solana** (not USDC.e); site docs also say only USDC on listed networks. Deposit via the TxFlow bridge on Arbitrum (OpenZeppelin audit of the bridge contract claimed, docs.txflow.com/resources/audits, M; report not read). Email/social users get a Privy embedded wallet; EOA wallets (MetaMask, Rabby, Coinbase Wallet, Phantom, Uniswap Wallet) supported; **Account-Abstraction wallets are not supported and may lock funds** (H docs).
- Withdrawals (H docs): min 4 USDC (FAQ says 10 USDC: docs disagree), fee 0.1 USDC (Arbitrum/Base/Polygon), 0.3 (Solana), 0.5 (Ethereum), plus a one-time 1 USDC fee per new destination address. Deposits free. FAQ says minimum deposit 10 USDC, CoinGape says $3.
- SDK defaults seen in the JS (L, unverified on-chain, not needed for an adapter): USDC permit token `0x38B7e73D559EA81963380Ad1bA10529c67AFf9C1` and deposit receiver `0x93F3d0c6018179d9b4C527294C3EE8E3c69e9d94`, both read on chain 42161 for the embedded-wallet "depositWithPermit" flow. These do not match Arbitrum's native USDC (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, docs), so treat them as unresolved.
- Custody: Probly's FAQ says "non-custodial"; the Terms say Probly never takes custody. But deposited USDC sits in TxFlow's platform/bridge contract (docs warn funds "may become permanently locked in the platform contract"), so it is custodial-by-L1 in practice. M.

## Read API

- `exists`: **unofficial-only** (undocumented site backend). TxFlow docs: "Platform API - Coming Soon..." (H, https://docs.txflow.com/api-reference/readme.md). The Probly docs (GitBook, https://docs.probly.com/llms.txt, 17 pages) contain no API section (H).
- Base URL (H, live): `https://api.probly.com`. Envelope `{"code":200,"msg":"success","data":...}`. No auth or special headers needed for the GETs below. Behind Cloudflare.
- Public GETs verified 2026-10-19 (H):
  - `/api/v1/basic_data/live-count` -> `{data:{total_events}}`.
  - `/api/v1/basic_data/event/front-page?page=1&limit=N` -> `{data:{records:[event...],total,page,limit,has_more}}`; only 4 curated events in total, so it is not a catalogue.
  - `/api/v1/basic_data/event/detail/{slug}` -> one event with nested `markets[]` (each with `pm_market_id`, `condition_id`, `question_id`, `clob_token_ids`, `outcomes`, `outcome_prices`, `best_bid`, `best_ask`, `spread`, fee fields, `resolution_mechanism`, `resolution_source`, `end_date` ms) and `series[]`. Slugs equal Polymarket slugs (`btc-updown-5m-<epoch>`).
  - `/api/v1/basic_data/home/v3`, `/api/v1/basic_data/tag/childrenTree2?parent_tag_slug=crypto`, `/api/v1/basic_data/tag/sportsChildrenTree` (event counts per tag), `/api/v1/geo/check` -> `{"blocked":false}`.
  - `/api/v1/prices-history?market=<clob token id>&interval=1d|max&fidelity=` -> `{"history":[]}` for the Fed market I tried (empty; semantics Polymarket-shaped, but no data to confirm).
  - Note: `best_bid`/`best_ask` in REST rows can disagree with the live book and with `spread` (BTC 5m row: bid 0.35, ask 0.66, spread 0.01), so they are cached or inconsistent. Use the WebSocket book.
- Public WebSocket (H, live): `wss://api.probly.com/ws/market`; send `{"type":"market","assets_ids":["<clob token id>"]}`; first frames are `{"event_type":"book","asset_id","market"(condition id),"bids":[{price,size}],"asks":[...],"timestamp"(ms),"hash","seq","prevSeq"}` then `{"event_type":"bbo","bestBidPrice","bestBidSize","bestAskPrice","bestAskSize"}`; server also sends bare text `Ping`. The JS also handles `price_change` and `ticker` events (M) and crypto-price and platform-recent-trades subscriptions (`action:"subscribe", subscriptions:[{topic,type,filters}]`, M). This is Polymarket's market-channel format plus `seq`/`prevSeq`. Sides are unsorted. Fixture `ws_market_frames_sample.json`.
- Private/other endpoints found in JS, **not called** (POST or authenticated): `POST /api/v1/basic_data/event/list|list-by-tag|sports-list|global-search`, `POST /api/v1/basic_data/market/list {event_slug}`, `POST /api/v1/market/best-bid-ask {marketIds[<=20]}`, `POST /api/v1/basic_data/market/resolution_process {market_id}`, `POST /api/info` (Hyperliquid-style info endpoint, e.g. `{type:"approvedAgents",user}`), `POST /api/trade/orders|trades|open_orders|positions|closed-positions`, `GET /api/uc/v1/user/:wallet/position`, `wss://api.probly.com/ws/user` (channels orderUpdates, trades, userNotification; needs token). M.
- A full read-only catalogue enumeration by GET is not possible; list endpoints are POST. Practical join: enumerate on Polymarket Gamma and map by `pm_market_id`/`condition_id` (identical on both sides).
- Auth/limits: no key for the reads above. Rate limits NOT FOUND (searched: docs.probly.com, docs.txflow.com, response headers (no ratelimit headers seen), JS). The bug-bounty policy tells testers to avoid "denial-of-service, stress tests, spam, scraping, and high-volume automation" (H, https://docs.probly.com/bug-bounty-program/program-policy.md, section 11). I made about 10 REST GETs and 3 short WS connections to `api.probly.com` in total.

## Trade path

- Programmatic placement exists only through the website's private API (M, minified JS), **not documented, not supported**:
  1. User logs in via Privy (email/social/SIWE) -> `POST /api/uc/v1/auth/privy-login` -> bearer token (cookie `token`, header `Token` / `Authorization: Bearer`). Wallet-signature-only login without Privy: NOT FOUND (searched: JS, docs).
  2. "Enable Trading": the browser generates a random agent key, the user's EOA signs EIP-712 `ApproveAgent{txflowNetwork:string, chainId:uint32, apiVersion:uint32, agentAddress:address, agentName:string, nonce:uint64}` (domain `name=TxFlow-Mainnet`, `version="1"`, `chainId=42161`, `verifyingContract` = zero address by default), then `POST /api/exchange` `{action:{type:"approveAgent",...}, nonce, signature, signatureChainId}` with headers `x-channel: 1`, `x-api-version: 2026-02-04` and the bearer token. Agent key is stored in browser `localStorage`.
  3. Orders: `POST /api/trade/orders {action:{type:"order",grouping:"na",orders:[{a:symbolIndex,b:isBuyOnYesBook,p:price,s:size,r:reduceOnly,t:{limit:{tif:"gtc"}},expiresAt?}]}, signature, nonce, vaultAddress:null}`; also `splitShares`/`mergeShares` actions on the same path. Buying NO is encoded as a non-reduce-only sell on the YES symbol (M, inferred). Signature is Hyperliquid-style: connectionId = keccak256(msgpack(action) || nonce u64 BE || vault flag byte [+ vault address]), signed by the **agent key** as EIP-712 `Agent{txflowNetwork,chainId,apiVersion,connectionId}` with domain `{name:"TxFlow-Mainnet", version:"1", chainId:869, verifyingContract:0x0}`. M/L: I read minified code only and never executed or tested any of it.
  4. Order status via `wss://api.probly.com/ws/user` or `POST /api/trade/...`.
- Open: how the 5-minute "Enable Trading" gate and TxFlow's mainnet "Access Code" (docs.txflow.com mainnet onboarding: "Mainnet is currently open to users with an Access Code", possibly stale, L) apply to API users.

## PayBox reachability

- **partial.** All user-side signatures are EIP-712 typed data or plain EVM calls from an ordinary EOA: the `ApproveAgent` signature (domain chainId 42161, Arbitrum is in PayBox's chain catalog per docs/research/06-paybox-platform.md) maps to a `request_wallet_sign` `typedData` intent, and funding is native USDC on Arbitrum/Base/Ethereum/Polygon (all in the catalog; Solana too). Orders themselves are signed by a separate agent key that the adapter would hold, not by PayBox.
- Blockers: (a) the Privy bearer token and the browser-style login are not a signing flow PayBox can provide; (b) no documented API and ToS ban on automation; (c) PayBox wallets must be plain EOAs (AA wallets lock funds); (d) restricted-jurisdiction rules; (e) nothing here was tested end to end (all POSTs). Not worth building given the duplicate liquidity.

## Fees

- Docs (H, https://docs.probly.com/fees-and-settlement/fees.md): taker only, paid in USDC on top of the share price (shares received are exact). `takerFee = C x p x takerFeeRate x (p x (1-p))^exponent` (C shares, p fill price, exponent 1). Maker fee 0. Rates by category: General 0.05, Weather 0.05, Culture 0.05, Economics 0.05, Mentions 0.04, Tech 0.04, Politics 0.04, Finance & Prices 0.04, **Crypto 0.07**, Sports 0.05, Others 0.04. Worked check: 5 shares at p=0.5 General -> 5 x 0.5 x 0.05 x 0.25 = 0.031 (docs say "about $0.03").
- Effective taker cost as a fraction of notional = rate x p(1-p): crypto 1.75% at p=0.5, 1.12% at p=0.8; politics 1.0% at p=0.5. Fees round to 4 dp (0.0001 USDC minimum charged).
- API per-market rates mostly match the docs table (crypto 0.07, mentions 0.04, culture 0.05) but economics rows show `fee_rate: "0.0425"` against the docs' 0.05 (H, fixture `frontpage_limit3.json`): use the per-market field. `maker_rebate_rate` 0.2-0.25 appears in the API but not in the docs (maker fee "currently set to 0").
- Fee labels/codes (`mentions_fees`) are identical to Polymarket Gamma's `feeType` for the same market (H cross-check).
- Observed price markup: in one of three book comparisons Probly's book was one tick wider than Polymarket's on both sides (bids -1c, asks +1c); the other two showed none. M (small sample).
- Funding costs: deposits 0; withdrawals 0.1-0.5 USDC plus 1 USDC one-time per new address (H docs). Referral: 10%/5% of fees to referrers, cashback to invitees (H docs; irrelevant to arbitrage).

## Resolution mechanism and dispute risk

- Per-market `resolution_mechanism` (H, API): crypto Up/Down = `chainlink` (resolve "Up" if the Chainlink Data Streams 60s-TWAP at the end of the window >= price at the start; sources e.g. `https://data.chain.link/streams/btc-usd-twap-60s-streams`, same for ETH, SOL, XRP, DOGE, BNB, HYPE); mentions, politics, economy, culture = `uma`, with `uma_resolution_status`, `oracle_outcome` and a `pm_market_id`, i.e. the outcome is imported from Polymarket's UMA process (M: inferred from field names; I did not observe a resolution).
- Docs (H): automated price feeds resolve at the deadline; manual markets "typically take 24-72 hours"; settlement automatic, USDC credited, no claim. Open orders are cancelled at the deadline.
- Dispute/void: "A resolution consistent with the published rules is final"; disputes go to support@ (no on-chain challenge); Probly may void a market at its discretion and refunds only initial cost (H, docs refund policy, Terms 1.2, 2.12). The Terms say Probly "is not involved in nor responsible for the resolution" (Terms 2.12, H).
- Arbitrage consequence: a Probly leg hedged on Polymarket shares the same oracle (good), but Probly can void or settle on its own timetable while Polymarket does not (basis risk on odd markets), and Probly pays out only via TxFlow L1 withdrawal (fees, delay, "large or unusual withdrawals may be held for manual review").

## Geo, ToS and automation

- Restricted jurisdictions (Terms 2.5, H, verbatim list): Iran, Syria, Cuba, North Korea, Crimea/Donetsk/Luhansk, **United States, United Kingdom, Argentina, France, Canada, Singapore, Poland, Netherlands, Thailand, People's Republic of China (including Hong Kong), Hungary, Portugal, Brazil**. No exceptions; VPN circumvention prohibited (2.6); restricted persons' wallets may be frozen. The site calls `GET /api/v1/geo/check` and redirects blocked users to `/restricted`. Note the discovery hint's list was short (it omitted Argentina, Poland, Netherlands, Thailand, Hungary, Portugal, Brazil).
- Automation: Terms 3.5 prohibit "data mining tools, robots, crawlers, or similar data gathering and extraction tools to scrape ... data" and manual copying "without our prior written consent", plus "unreasonable or disproportionately large load". TxFlow's Terms prohibit "any automated means, including ... bots, scrapers" without written permission (H). No API terms exist because no API is offered; arbitrage is not mentioned. Market manipulation, wash trading and front-running are prohibited.
- Regulatory: no licence claimed; Terms 8(a) concede regulatory uncertainty. M.

## Liquidity

- Probly's own traded volume (event `volume`, tooltip "Total volume traded on this market"): in the 90 event/series objects of `home/v3` on 2026-10-19 the maximum was $1,172.84 (`bitcoin-all-time-high-by`), Fed-decision event $907.82, most events 0 (H). No platform-wide volume or TVL figure is published by Probly (H, absent from site and docs). DefiLlama has no Probly entry; its only TxFlow entries are "TxFlow Bridge" (Arbitrum, TVL $32.4M on 2026-10-19 00:10 UTC, mostly perps, so not attributable to Probly) and "TxFlow Perps" (H, `api.llama.fi/protocols`; fixture `defillama_txflow_bridge_tail.json`).
- Displayed "liquidity" is mirrored from Polymarket, not Probly's: BTC 5m event 780775 shows $10,581.61 on Probly vs $10,291.02 on Polymarket for the same window; series-level figures such as 1,220,752 (BTC 5m series) and 12.1M (Premier League series) are Polymarket-sized (H cross-check, fixtures). Event cards on /en/crypto showed "liq." from $10 to $6,743 for 5m/15m/1h markets (H).
- Do not treat displayed depth as executable depth: Probly book sizes were floored/scaled copies of Polymarket sizes (e.g. 385,425 -> 28,866 at 0.87 on the Fed YES token).

## Shared liquidity (is it an independent leg?)

**No.** Evidence (all H unless noted):
1. Identifiers: Probly market 4900835 has `pm_market_id 5887877`, `condition_id 0x367c...7136` and the same two `clob_token_ids` as Polymarket Gamma market 5887877 ("Will Trump say Fertilizer or Rural ... Kansas"). Same for the BTC 5m market (`pm_market_id 5847979`, same condition id). Fixtures `xref_polymarket_gamma_market_5887877.json`, `event_detail_btc_updown_5m.json`.
2. Books: for the same token id, Probly's `ws/market` book matched Polymarket's `GET clob.polymarket.com/book` price level for price level in three markets (Trump rally market: Polymarket bids 0.41/0.40/0.30/0.26/0.08/0.05/0.03/0.02 vs Probly 0.40/0.39/0.29/0.25/0.07/0.04/0.02/0.01 with sizes floored to integers; Fed YES: identical prices 0.87..0.82 bids and 0.88..0.93 asks with Probly sizes roughly 6-23% of Polymarket's; BTC 5m near expiry: asks 0.01..0.07 with near-equal sizes). Fixture `book_compare_probly_vs_polymarket.json`.
3. Resolution source labelled `uma` with `pm_market_id`; market rules text quotes Polymarket's rules PDF (`polymarket-upload.s3...`); `maker_rebate_rate` and `feeType` names copied from Polymarket.
- What is **not** known: whether orders are actually routed to Polymarket (builder/relay), hedged there by a market maker, or matched in a separate Probly book that a market maker keeps aligned. Docs claim "user-to-user". Either way a Probly price is a function of Polymarket's price, so Probly-vs-Polymarket "spread" is cost/markup/latency, not edge, and a Probly leg does not diversify. Use Polymarket directly. Confidence in "not independent": high; in the exact mechanism: low.

## Event coverage (overlap for arbitrage)

Because the catalogue is Polymarket's, everything overlaps with Polymarket and, through it, with other venues' equivalents: crypto price (BTC/ETH/SOL/XRP/DOGE/BNB/HYPE Up-or-Down at 5m/15m/1h/4h/daily/weekly/monthly/yearly, pre-market, ETF), sports (soccer incl. EPL/La Liga/UCL/Ligue 1 and World Cup, basketball, UFC, tennis, F1, esports), politics (Trump mentions, midterms, press secretary), macro/economy (Fed decision, central banks, gas price), finance (daily Up/Down for SPY, WTI, natural gas, silver), culture/mentions (Elon tweet counts, trailer views). H (site and API).

## Not found

- Official API documentation, OpenAPI, SDK, rate limits: NOT FOUND (searched: docs.probly.com llms.txt and all 17 pages, docs.txflow.com llms.txt and API page, site JS, response headers).
- Probly or TxFlow GitHub, contract addresses for the TIP3 channel, TxFlow RPC/explorer URL and an on-chain data feed: NOT FOUND (searched: docs, TxFlow official links page, press releases, JS). A "txflowExplorerTxUrl" helper exists in the JS but I did not extract its host.
- Platform-wide volume/OI/TVL for Probly: NOT FOUND (searched: site, docs, DefiLlama, CoinGape). Further WebSearch was unavailable (session search budget exhausted after one query), so no independent news beyond the fetched pages.
- OpenZeppelin audit PDF (linked only as an attachment in TxFlow docs): not read.

## Open questions

1. Is flow routed or hedged on Polymarket? A tiny real trade would show (not allowed here).
2. Is there a wallet-signature-only path to the bearer token (Privy SIWE) that an adapter could use?
3. Does the Probly book lag Polymarket (quote-latency) and by how much? Would need continuous capture over both feeds.
4. Real 24h volume and number of active traders.
5. Will TxFlow's promised "Platform API" legitimize automated access?

## Suspicious content / embedded instructions

- docs.probly.com and docs.txflow.com (GitBook) append an "Agent Instructions" block to every markdown page telling AI agents to query `?ask=<question>&goal=<user_goal>` endpoints. It is GitBook platform boilerplate, benign in content, but it is text aimed at agents. I did not follow it. H.
- No other embedded instructions found.

## Sources

Primary (H unless noted)
- https://www.probly.com/en/crypto (site, HTML and 64 JS chunks under static.probly.com, read as text)
- https://www.probly.com/en/term-of-use (Terms: operator, 2.5 restricted list, 2.12, 3.5)
- https://docs.probly.com/llms.txt and pages: get-started/readme, sign-up-and-wallet, deposits-and-withdrawals, first-trade; markets-and-trading/overview, market-orders, limit-orders, matching-logic, category-markets, merging-and-splitting; fees-and-settlement/fees, market-resolution, referrals; bug-bounty-program/program-policy; resources/faq, refund-policy; contact-us (all `.md` mirrors)
- https://docs.txflow.com/llms.txt; /prediction/overview, /prediction/market-types, /prediction/trading-prediction-markets, /prediction/market-resolution-and-settlement, /api-reference/readme ("Coming Soon..."), /txflow-l1/shared-liquidity, /txflow-l1/settlement, /txflow-l1/tip-standards/*, /getting-started/mainnet-onboarding, /resources/audits, /resources/official-links, /terms/terms-of-use
- https://txflow.com/ (WebFetch summary)
- https://api.probly.com (GETs and WS listed under Read API)
- https://gamma-api.polymarket.com/markets/5887877 and /events?slug=btc-updown-5m-1792373100; https://clob.polymarket.com/book?token_id=... (public cross-checks)
- https://api.llama.fi/protocols and /protocol/txflow-bridge (DefiLlama)

Secondary (M)
- https://crypto.news/txflow-l1-introduces-probly-marking-the-next-stage-of-its-multi-application-ecosystem-with-prediction-markets/ (2026-07-15 release; GlobeNewswire original returned 403)
- https://crypto.news/probly-announces-its-prediction-market-integration-with-txflow-l1/ (2026-07-20 release)
- WebSearch result snippets: AMBCrypto, ChainCatcher, Bitget, CryptoSlate, ZyCrypto (titles only; Bitget figure of 5,000 events/12,000 markets)
- https://coingape.com/best-crypto-prediction-markets/ (updated 2026-09-15)

## Fixtures (docs/research/fixtures/probly/)

`live_count.json`, `frontpage_limit3.json`, `event_detail_btc_updown_5m.json`, `tag_tree_crypto.json`, `tag_tree_sports.json`, `geo_check.json`, `prices_history_empty.json`, `ws_market_frames_sample.json`, `book_compare_probly_vs_polymarket.json`, `xref_polymarket_gamma_market_5887877.json`, `defillama_txflow_bridge_tail.json`. All under 20 KB. The frontpage fixture contains one third-party YouTube handle in a market description; no personal data.

## Method notes

- Hosts contacted: probly.com, docs.probly.com, api.probly.com (about 10 GETs, 3 WS connects), static.probly.com (JS chunks), docs.txflow.com, txflow.com, gamma-api.polymarket.com (2 GETs), clob.polymarket.com (3 GETs), api.llama.fi (3 GETs). One GET to api.yesorno.trade (the white-label stack name seen in the JS; returned a 403 "Access Restricted" page) was not pursued.
- `api.probly.com` is not a documented API host; the GETs are the same anonymous requests the website makes. They are low volume, but Probly's Terms 3.5 would not permit an automated adapter built on them without written consent.
- No personal identifiers were used in any request; scripts were checked for `@` and for the user's name before running.
