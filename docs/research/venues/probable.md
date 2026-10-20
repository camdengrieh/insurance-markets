# Probable (probable.markets) - venue spec

Researched 2026-10-19. Read-only: public pages, GitBook `.md` mirrors, unauthenticated GETs to the documented API hosts, DefiLlama public API, Sourcify public API (verified source), static reading of the site's own JS bundles, `gh api` for the third-party pmxt OpenAPI spec. No accounts, no wallet, no POST, no browser automation, no signing, no payments.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak, stale or ambiguous.

## Verdict

- Adapter priority: **skip**.
- **The venue was acquired by Predict.fun on 2026-03-04 and has been functionally dead since.** Probable's own site shows a banner "Probable has been acquired by predict.fun ... claim a 2x refund on your USDT fees, plus a conversion to Predict Points" (H, site JS). No new event has been created since 2026-02-27 (event id 820). DefiLlama volume: 7d $73, 30d $2.2K. The public trade feed shows about 20 trade rows between 2026-10-01 and 2026-10-14 (about $1.8K counting both sides of each fill), last row 2026-10-14. The official developer docs host is switched off.
- The 1-year volume of $2.97B in the discovery hint is incentive/points-farming volume concentrated in Jan-Feb 2026 (peak day 2026-01-25, $171.6M). It is not real liquidity.
- The API is good and Polymarket-shaped, so a generic "Polymarket-CLOB clone" read adapter would cover it nearly free, but nothing tradable is there. Revisit only if Predict.fun announces that Probable's books are merged into predict.fun (then the liquidity is Predict.fun's, which is covered by the other workflow).

## Liveness (still live in 2026?)

- **Operating company: absorbed.** Predict.fun announced "Predict.fun Completes Strategic Acquisition of Probable" on 2026-03-04; team, tech stack and user base fold into Predict.fun. Quote: "No immediate changes to Probable user accounts or open positions are expected during the initial transition phase." No shutdown date, no statement on whether probable.markets keeps operating, no statement on order-book or liquidity merge. H (https://predict.fun/news/predict-fun-completes-strategic-acquisition-of-probable, read via WebFetch summary 2026-10-19). Corroborated by TradeInformer and KuCoin flash news dated 2026-03-04 (M).
- **Site banner (H):** the deployed probable.markets Next.js bundle (chunk that renders an "Important" banner) contains the string "Probable has been acquired by predict.fun - You can claim a 2x refund on your USDT fees, plus a conversion to Predict Points. Check the details for migration" linking to a predict.fun tweet. The tweet id decodes to 2026-03-04 13:56 UTC (snowflake arithmetic, M).
- **Backend still answers (H):** `market-api.probable.markets` and `api.probable.markets` return 200 on 2026-10-19; `/book` returns a fresh timestamp; 109 markets still flagged `active`.
- **But no new markets (H):** `GET /events/` (newest first) returns event 820 `nba-bkn-bos-2026-02-27` created 2026-02-27 as the newest. Newest `startDate` among the 109 active markets is 2026-03-31 except one placeholder dated 2027-01-01. Docs say users cannot create markets; the team adds them (https://docs.probable.markets/markets/how-are-markets-created.md).
- **Trading activity collapsed (H, DefiLlama + own paging):** monthly DefiLlama volume: 2026-01 $1.459B, 2026-02 $1.277B, 2026-03 $79.2M (nearly all in the first days), 2026-04 $33.6K, 05 $31.0K, 06 $6.3K, 07 $11.4K, 08 $378, 09 $1.5K, 10 (to the 15th) $900. My own paging of `GET api.probable.markets/public/api/v1/trades` (400 newest rows) spans 2026-06-25 to 2026-10-14: by month June 26 rows, July 234, Aug 90, Sep 30, Oct 20; the newest is a 6-share fill at 0.80 on 2026-10-14. Rows appear twice per fill (buy and sell side), so halve the notional.
- **Developer docs host is disabled (H):** `developer.probable.markets` returns Cloudflare "Just a moment" challenge (HTTP 403, `cf-mitigated: challenge`) on `/`, and HTTP 402 with `x-vercel-error: DEPLOYMENT_DISABLED` and body "Payment required / DEPLOYMENT_DISABLED" on `/llms.txt` and `/llms-full.txt`. This is Vercel's "deployment disabled" error, not an x402 payment challenge (no payment requirements were offered). I stopped querying that host after four requests. The doc content below therefore comes from a third-party Context7 mirror (see Sources) and is tagged M/L.
- DefiLlama TVL: $203.9K on 2026-10-18, flat at $207K-$242K since May (peak $3.96M on 2026-01-26). Static balance, consistent with stranded/unused collateral. H for the number; M for the interpretation.

## Kind and market model

- Kind: on-chain CTF order-book venue, **Polymarket clone** (Gnosis ConditionalTokens + a CTFExchange fork + Safe-based proxy wallets), off-chain matching by an operator. H (Sourcify verified source, see Chains).
- Binary Yes/No. Docs also mention "multiple choice" and the API has `marketStructure` ("single" seen) and `neg_risk` on the book (all samples `false`); the 2028 US President event (id 737) is a group of separate Yes/No markets (13 of them active; 109 active markets sit in 50 events). H (live rows). No scalar markets.
- Order book (CLOB): limit orders GTC/IOC, market orders; `tick_size` 0.001, `min_order_size` 1 share, prices 0.001-0.999 (H, live `/book`). Docs say price range $0.01-$0.99 (H docs) - the live book shows 0.001 ticks, so docs are stale on that point.
- Tokenisation: each outcome is an ERC-1155 position in the ConditionalTokens contract; `clobTokenIds` are the decimal uint256 token ids (Yes first, No second). The outcomes/clobTokenIds fields are **JSON-encoded strings**, not arrays. H (live).
- Split/merge: USDT <-> YES+NO 1:1, no fee, no order book (https://docs.probable.markets/trade-on-probable/merge-and-split.md). H. This makes complete-set arbitrage possible in principle (buy both sides below 1.00).

## Chains and collateral

- Chain: BNB Smart Chain only (chainId 56). Testnet 97 also present in the site config. H.
- Collateral: **BSC USDT** (0x55d3...7955 appears in site JS as the chain-56 token; docs: "Trades on Probable use USDT as collateral", "more collateral options to be supported soon"). H docs, M for the address mapping (minified JS).
- Contracts, chain 56 (addresses from the site's config chunk; each verified on Sourcify, so they exist on chain 56): CTFExchange `0xF99F5367ce708c66F0860B77B4331301A5597c86` (src/exchange/CTFExchange.sol, solc 0.8.15, verified 2026-05-20), ConditionalTokens `0x364d05055614B506e2b9A287E4ac34167204cA83` (solc 0.5.10), UmaCtfCrossChainAdapter `0x7cD31c0d0122FE881F429342e3841E2F08753234`, SafeProxyFactory `0xB99159aBF0bF59a512970586F38292f8b9029924`. H for existence and names (Sourcify); the minified config maps two address sets to "testnet" and "mainnet" and I resolved that by the on-chain verification on chain 56, so L for the exact role labels of the non-exchange addresses.
- Users trade from a **proxy wallet** (Safe) that differs from the connected EOA; creation gas is sponsored; trades are gasless (Probable pays); deposit and withdraw need gas. H (https://docs.probable.markets/get-started/create-an-account.md, overview).
- Deposits: in-app swap/bridge into USDT on BSC from "any supported chain", or a temporary deposit address; withdrawals to any supported token/chain, no Probable withdrawal fee. H docs (providers unnamed).

## Read API

Official docs: GitBook https://docs.probable.markets (product docs only, no API reference). The API reference was on https://developer.probable.markets/api/... (official, now disabled; see Liveness). The reference below is cross-checked against live responses and the pmxt OpenAPI spec.

- `exists`: official-public (market data, order books and trades need no key; the developer site is down, so the docs are no longer reachable first-hand).
- Base URLs (H, live): market catalogue `https://market-api.probable.markets/public/api/v1`; order book and trading `https://api.probable.markets/public/api/v1`. Both sit behind CloudFront/Tengine; CORS headers expose `Prob_address, Prob_api_key, Prob_passphrase, Prob_signature, Prob_timestamp, Prob_nonce`.
- Market host, no auth (H, live 2026-10-19):
  - `GET /markets/?active=true&page=N` -> `{markets:[...], pagination:{page,limit:20,totalResults:109,totalPages:6,hasMore,hasPrevPage}}`. Other filters per spec: `event_id`. Rows carry `id, event_id, condition_id, question_id, market_slug, outcomes, clobTokenIds, tokens[{token_id,outcome}], volume24hr, liquidity, startDate, endDate, resolved, liveness, disputed, proposal_history[{proposed_price, price_expiration_ts}], tags, description`.
  - `GET /events/?status=active|closed|all&limit=&page=&tag_id=&sort=` -> bare array of events with nested `markets[]` (default order newest first), `/events/{id}`, `/events/slug/{slug}` (cached 2 min per docs), `/events/{id}/tags`.
  - `GET /markets/{id}`, `/markets/polymarket/{polymarketId}`, `/markets/bsc/{bscQuestionId}` (cross-reference lookups; **not-found returns HTTP 500** with body "Market not found with Polymarket ID: ...", observed for Polymarket id 620682, so Probable's mirror of that Polymarket question is not mapped), `/public-search/?q=&limit=`, `/tags/` (96 tags; 31 open "Crypto" events, 3 Basketball, 3 AI; the rest 0-2).
- Order-book host, no auth (H, live): `GET /book?token_id=` -> `{market, asset_id, timestamp, hash, bids[{price,size}], asks[{price,size}], min_order_size, tick_size, neg_risk}` (decimal strings, 6 dp; **sides are not sorted**: sort client-side); `GET /price?token_id=&side=BUY|SELL` -> `{"price":"0.160000"}` (BUY = best ask); `GET /midpoint?token_id=` -> `{"mid":"0.155000"}`; `POST /prices` (batch, body array of `{token_id, side}`; documented, not called); `GET /prices-history?market=<TOKEN id>&interval=max|1w|...&fidelity=` -> `{history:[{t,p}]}` (600 s default for `max`; `1w` needs fidelity >= 5 else HTTP 400 `CLOB-4005`); `GET /trades?limit=&offset=&market=<conditionIds>&eventId=&user=&side=&takerOnly=` (default `takerOnly=true`; timestamp in epoch **milliseconds**; includes trader proxy wallet, name, pseudonym).
- Authenticated reads: `GET /trade/{chainId}?tokenId=` (cursor pagination), `GET /orders/{chainId}/open`, `GET /orders/{chainId}/{orderId}` - L2 auth. M (Context7 mirror, pmxt spec).
- Rate limits: **NOT FOUND** (searched: docs.probable.markets llms.txt and all 14 pages, response headers, Context7 snapshot, pmxt spec). A burst of 10 sequential `GET /midpoint` calls with no delay returned 10x 200 and no rate-limit headers.
- WebSocket: **NOT FOUND** (searched: docs, Context7 snapshot, all 42 site JS chunks for `wss://` - only unrelated chain RPC URLs). Polling only.
- On-chain: the exchange emits standard CTF events; no subgraph found (NOT FOUND, searched: docs, site JS).
- Bulk/volume caveats: `volume24hr` on market rows is junk (e.g. 166,932,833 on market 460 with 2.4K liquidity). Use `/trades` or DefiLlama for activity. The `liquidity` field on a row is the notional of resting orders and can be a single static order (market 1243: one bid of 658,311.6 shares at 0.15 = $98.7K; its price history is flat at 0.15 for weeks, so it is almost certainly an incentive/points order, not executable intent; treat as non-real).

## Trade path

- Programmatic order placement exists in principle and is a Polymarket-style two-level scheme. M (official docs via Context7 mirror, last indexed about May 2026; header names also confirmed H by the live CORS allow-list).
  1. `GET /auth/nonce` -> nonce.
  2. L1: EOA signs a login message/typed data; `POST /auth/login`; then `POST /auth/api-key/{chainId}` with headers `prob_address, prob_signature, prob_timestamp, prob_nonce` -> `{apiKey, secret, passphrase}`. This is wallet-signature only, no web UI step in the docs (contradicts the earlier note in 09 that a human-created credential is needed). Not tested (POST).
  3. L2: every trading call carries `prob_address, prob_signature, prob_timestamp, prob_api_key, prob_passphrase`, where signature = HMAC-SHA256 hex over `timestamp + method + path + body` keyed with `secret`.
  4. `POST /order/{chainId}` body `{deferExec, order:{salt, maker (proxy wallet), signer (EOA), taker 0x0, tokenId, makerAmount, takerAmount, side, expiration, nonce, feeRateBps, signatureType, signature}, owner (proxy wallet), orderType: "GTC"|"IOC"}`; `DELETE /order/{chainId}/{orderId}` to cancel.
- **EIP-712 order signing, H (verified contract source on Sourcify):** domain `{name: "Probable CTF Exchange", version: "1", chainId: 56, verifyingContract: 0xF99F...5c86}`; type `Order(uint256 salt,address maker,address signer,address taker,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint256 nonce,uint256 feeRateBps,uint8 side,uint8 signatureType)`. Max signable `feeRateBps` = 1000 (10%).
- Matching is operator-driven (`matchOrders`, `fillOrder` gated by operator role; `pauseTrading` exists, H from ABI). Positions are ERC-1155 held by the user's Safe proxy wallet.
- Onboarding transactions (all on BSC, from the EOA): create the proxy (factory `createProxy` with an EIP-712 `CreateProxy(paymentToken,payment,paymentReceiver)` signature, docs example), approve USDT to the ConditionalTokens contract and the exchange and `setApprovalForAll` for the exchange, executed as Safe transactions signed by the EOA (docs use `@safe-global/protocol-kit`). M. A relayer host `relayer-api.probable.markets` exists in the site bundle; its API is NOT FOUND (undocumented).
- Official TypeScript SDK `@prob/clob` (`createClobClient({baseUrl, chainId, wallet}).generateApiKey()`). M. I did not inspect the package.
- Gas: Probable pays for trade execution/settlement. H docs.

## PayBox reachability

- **partial.** Everything above needs only an EVM EOA on BSC (chain 56): EIP-712 typed data (order, login, CreateProxy, Safe tx) and ordinary BSC transactions. PayBox lists BNB Smart Chain (56) in its chain catalog and exposes `message`/`typedData`/`transaction` intents (local notes docs/research/06-paybox-platform.md and 09, M). So a PayBox EVM wallet could in principle trade it via signed orders plus transaction proposals.
- Blockers: (a) the L2 HMAC secret and API passphrase must be held by the adapter process, not PayBox; (b) API key creation and order placement are POSTs I did not exercise, so the flow is unverified end to end; (c) funding means BSC USDT into a Safe proxy; (d) the venue is a US/UK/etc. restricted jurisdiction and effectively dead. Not worth building.

## Fees

- Docs: "Only takers pay fees. Makers trade free." Taker fee 0.01%-1.75% depending on price, highest at 50%; fees charged in USDT or in the CTF token; makers also earn points. Withdrawals free. Probable pays gas. H (https://docs.probable.markets/trade-on-probable/fees.md).
- **Contract formula, H (verified CalculatorHelper.sol):** with `feeRateBps` signed into the order and `p` the order price (0-1):
  - BUY: fee (in outcome tokens) = rate x min(p, 1-p) x tokens_received / p.
  - SELL: fee (in USDT) = rate x min(p, 1-p) x tokens_sold.
  - With the docs' example rate 175 bps: for p <= 0.5 the fee is 1.75% of notional, for p > 0.5 it shrinks toward 0 (about 0.19% of notional at p = 0.9). Per-share dollar fee peaks at p = 0.5 (0.875 cents), which is what "highest at 50%" means.
  - Maker orders presumably carry `feeRateBps` 0 so they are free; the enforcement lives in the operator, not in the contract. L.
- Also the 2x fee refund and points conversion offered by Predict.fun at acquisition are migration incentives, not ongoing fees.

## Resolution mechanism and dispute risk

- UMA Optimistic Oracle via an `UmaCtfCrossChainAdapter` contract (H name; docs: "Probable uses UMA oracle service"). Per-question challenge window `liveness` = 7200 s on every sampled row (H live). Dispute goes to UMA token-holder vote, "typically 24 to 48 hours"; if unclear after the vote the market resolves 50/50. Users must click Claim to redeem. H docs (https://docs.probable.markets/markets/how-are-markets-resolved.md).
- Rows expose `proposal_history[{proposed_price, price_expiration_ts}]` (sampled `proposed_price` values: "0" and "1000000000000000000"), `disputed`, `resolved`.
- Risks: resolution is operator-initiated (the team creates the questions), so after a corporate absorption nobody may be monitoring or initiating resolution of the 109 still-open markets. All 109 active markets have `endDate` on or after 2026-12-31 except market 1100 ("Israel and Syria normalize relations by December 31, 2026?"), whose `endDate` is 2026-01-01, before its own `startDate` (a data-entry error; it is still `active`), so end-of-life resolution has not been exercised since the acquisition and `endDate` cannot be trusted as a close time. The question text is Polymarket-style prose (UMA-compatible), so basis risk against Polymarket (also UMA) is low for exact mirrors.

## Geo, ToS and automation

- Restricted jurisdictions (H, https://docs.probable.markets/legal/restricted-jurisdictions.md, undated): Iran, Syria, Cuba, North Korea, Crimea/Donetsk/Luhansk, "as well as the United States, United Kingdom, China, France, Canada, Singapore, Poland, Thailand, and Taiwan".
- Terms of service: **NOT FOUND** (searched: probable.markets /terms /privacy /terms-of-service /tos all 404; no legal links in the site bundle; GitBook legal section has only the jurisdiction page). Bot/automation policy: NOT FOUND. Read endpoints were not geo-blocked from my network.
- Official docs publicly document the API and SDK, so API use is clearly intended (M).

## Liquidity (with dates)

- DefiLlama (fetched 2026-10-19): TVL $203.9K (2026-10-18); volume 24h $0, 7d $72.8, 30d $2,168, 1y $2.97B, all-time $2.97B (https://api.llama.fi/summary/dexs/probable, https://api.llama.fi/protocol/probable). H.
- Live books (2026-10-19): sum of the `liquidity` field over 109 active markets = $227.3K, of which $202K is two markets (698 Opensea FDV > $5B: $103.5K; 1243 Rabby token launch: $98.7K), 28 markets have more than $100. Everything else is single-digit to hundreds of dollars. Sampled market 698 Yes: best bid 0.042 for 1,044 shares (about $44), best ask 0.35 for 152,426 shares; Polymarket's same question (gamma id 620682) showed Yes 0.039 the same day. A 0.3 cent gap on $44 of depth is not tradable. H (live).
- No open-interest endpoint. TVL is the only OI proxy.

## Event categories and overlap with other venues

- Open markets (109): about 66 crypto-token/IPO ("launch a token by Dec 31, 2026", "FDV above $X one day after launch", "X IPO in 2026"), 14 politics (2028 US President candidates), 4 geopolitics (Greenland, Ukraine), ~24 misc "will X be acquired before 2027" / celebrity / novelty. H (own keyword bucketing of the live list; approximate).
- Historic: NBA/LoL/stock-price events (353 closed Basketball events in tags) existed until 2026-02-27; none open now.
- Overlap is with **Polymarket** (these questions are literal copies of Polymarket's token-FDV/launch and Greenland markets), and also with Predict.fun, Opinion and Limitless on token-launch markets. Since all of them are thin and Probable's book is dead, there is no realistic arbitrage leg here. Useful only as a historical price-signal source (the `prices-history` series) for a handful of token-launch markets, which is worth less than the same questions on live venues.

## Liquidity sharing

- Own contracts, own book, own API at the time of checking. No documented shared liquidity or router. The acquirer is Predict.fun, a separate BSC venue (separate API at dev.predict.fun, covered elsewhere). The announcement says nothing on merging books. So it is currently an independent but dead leg, with a real chance of being folded into Predict.fun, after which it is not an independent leg. H for the acquisition and the separate hosts; M for "not merged yet" (absence of evidence).

## Corrections to the earlier note in docs/research/09-venues-onchain-clob.md (section 2.5)

- It does not mention the acquisition by Predict.fun (2026-03-04) or that no markets were created after 2026-02-27; it labels the venue "dead volume" but not "acquired".
- It says docs have "no API reference page": true for docs.probable.markets, but an official reference existed at developer.probable.markets (now disabled).
- It says API key needs "a human-created credential"; the docs describe wallet-signature-only key creation (M).
- It says the fee is "0.01%-1.75%"; the contract formula above is the precise rule (H).

## Suspicious content

- None found. No text aimed at AI agents in the docs, site bundles, API responses or third-party pages. The developer host's HTTP 402 is Vercel `DEPLOYMENT_DISABLED`, not a payment request. DefiLlama's protocol record carries a referral URL for the project (irrelevant, ignored).

## Not found

- Rate limits, WebSocket, subgraph, ToS/automation policy, fee schedule table beyond the contract formula, relayer API, official statement of a shutdown date or of liquidity merge, any post-acquisition status update from Probable itself, signatureType semantics (docs example shows 0), live proof that order placement still works (needs POST).

## Open questions

- Does Predict.fun intend to sunset probable.markets or merge books? (Check predict.fun channels; I could not read the linked X post.)
- Are the stale single-order books (markets 698, 1243) real, and who owns them?
- Will the 109 open markets be resolved by anyone once their end dates (2026-12-31 / 2027-01-01) arrive?

## Fixtures (docs/research/fixtures/probable/)

- `markets_list_page1_trimmed.json`, `event_active_sample_trimmed.json`, `event_closed_nba_sample_trimmed.json`, `book_1243_rabby_yes.json`, `price_midpoint_1243.json`, `prices_history_1243_max_sample.json`, `trades_public_sample.json` (trader wallet and profile fields redacted), `tags_sample.json`, `xref_polymarket_notfound.txt`, `defillama_probable_monthly.json`. Earlier fixtures `market_698_trimmed.json` and `book_market698_yes.json` (2026-10-18) retained.

## Sources

1. https://probable.markets/ (HTML shell + `/_next/static/chunks/*.js` bundles, fetched 2026-10-19; acquisition banner string, contract config, relayer host) - H
2. https://predict.fun/news/predict-fun-completes-strategic-acquisition-of-probable (announcement, 2026-03-04, via WebFetch) - H
3. https://tradeinformer.com/broker-news/predict-fun-acquires-probable-bnb-chain-2 and https://www.kucoin.com/news/flash/predict-fun-acquires-probable-a-prediction-market-incubated-by-pancakeswap-and-yzi-labs (2026-03-04) - M
4. https://docs.probable.markets/llms.txt and the pages overview/what-is-probable, overview/how-it-works, get-started/create-an-account, get-started/funding-your-wallet, trade-on-probable/{trading-basics, how-to-place-orders, withdraw-funds, merge-and-split, fees}, markets/{how-are-markets-created, how-are-markets-resolved}, legal/restricted-jurisdictions, points/points-program (all fetched as `.md`, 2026-10-19, undated pages) - H
5. https://market-api.probable.markets/public/api/v1/{markets,events,tags,public-search,markets/polymarket/..} and https://api.probable.markets/public/api/v1/{book,price,midpoint,prices-history,trades} (unauthenticated GETs, 2026-10-19) - H
6. https://developer.probable.markets/ (403 Cloudflare challenge; /llms.txt and /llms-full.txt 402 `DEPLOYMENT_DISABLED`) - H for the disabled state
7. https://context7.com/websites/developer_probable_markets_api (+ `/llms.txt?tokens=10000`): third-party index of the official developer docs, "last updated 5 months ago" (about May 2026), 296 snippets, 41 KB read - M/L (stale, third-party)
8. https://github.com/pmxt-dev/pmxt `core/specs/probable/probable.yaml` (read with `gh api`, MIT, third-party OpenAPI) - M
9. https://sourcify.dev/server/v2/contract/56/0xF99F5367ce708c66F0860B77B4331301A5597c86 (verified CTFExchange source, EIP-712 domain, order typehash, fee math, ABI); same for ConditionalTokens, UmaCtfCrossChainAdapter, SafeProxyFactory - H
10. https://api.llama.fi/protocol/probable and https://api.llama.fi/summary/dexs/probable?dataType=dailyVolume (2026-10-19) - H
11. https://gamma-api.polymarket.com/public-search (one query for the Opensea FDV event, 2026-10-19) - H
12. WebSearch (extended) results for the acquisition and developer-docs discovery, 2026-10-19 - M
13. Local notes: docs/research/09-venues-onchain-clob.md section 2.5; docs/research/06-paybox-platform.md (PayBox chain catalog incl. BNB 56) - M
