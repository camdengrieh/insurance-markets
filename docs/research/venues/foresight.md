# Foresight (foresight.now) - venue spec

Researched 2026-10-19. Read-only: official docs (docs.foresight.now, Mintlify `.md` mirrors), unauthenticated GETs to `api.foresight.now`, `gh api` for the Predict.fun SDK constants, web search. No accounts, no wallet, no POST, no signing, no payments, no browser automation. The marketing site (foresight.now) is behind a Vercel bot checkpoint and was not bypassed.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak, stale or ambiguous.

## Verdict

- Adapter priority: **P2** (thin / signal-only today; cheap to add later).
- The venue is live and has a real, public, Polymarket-shaped CLOB read API plus an EIP-712 signed-order trade API that bots are explicitly invited to use. That makes it technically easy to integrate. H.
- But liquidity is near zero. Cumulative CLOB notional is about $93K since launch (2026-07-03), almost all in July (World Cup). October to date (through 2026-10-15) is about $150 across 63 trades. Only 11 markets are open (10 on BSC, 1 mirrored on Base), and every book looks like one algorithmic quoter (same 110.58-share top level everywhere, fixed 8-cent spread). H for the data, M for the "algorithmic quoter" inference.
- Fee is 3% to 7% per market (`fee_rate_bps` 300 to 700), formula undocumented. A 3% fee plus an 8-cent spread on about $100 of depth leaves no practical arbitrage capacity.
- Revisit if Foresight's open-market count or volume recovers, or if its legacy Katana AMM markets turn out to hold real TVL (not observable: that API now needs a partner key).

## Liveness (still live in 2026?)

- Yes, but quiet. `GET https://api.foresight.now/v1/markets?chain_id=56` returned 200 on 2026-10-19 04:35 UTC with markets created as late as 2026-10-18 16:00 UTC (a daily "BTC Up or Down" market is auto-created each day). H (live).
- Newest public trade print: 2026-10-15T15:17Z (one $97 print); before that, single prints of $1-5 on 2026-10-06 to 2026-10-14. H (own paging of `/v1/markets/{id}/trades`, fixture `crawl_summary_2026-10-19.json`).
- Earliest CLOB market created 2026-06-30, first trade 2026-07-03. So the CLOB is about 3.5 months old. H.
- Older history: Katana launch announced on X about 611 days before the search snapshot (about Feb 2025, L, search snippet, stale); ChainCulture partnership post 2025 says "live on Katana and PulseChain" (L); an ETHGlobal Superhack 2024 entry describes an earlier Superchain/Base version (L, possibly an earlier iteration). Ormi case study published 2026-03-03 says Foresight is a Katana prediction market focused on Asia that planned to expand to Base and BNB and launch an order book (H, https://blog.ormilabs.com/real-time-blockchain-indexing-katana-prediction-market/). That matches what is now live.
- Prediction Markets Index lists it as live / Katana / binary / AMM, volume n/a on the ecosystem page (H, https://predictionindex.xyz/ecosystem); a search snippet of the same index said "Total Volume <$100k" (M, undated, probably stale).
- Foresight GitHub org `foresightnow` exists (created 2025-09-09) with 0 public repos, so there is no public contract or client source. H (gh api).

## Kind and market model

- Kind: on-chain, multi-chain, **two generations of trading engine**:
  1. **Legacy AMM** (liquidity pool, YES/NO shares). Default experience on Katana (and Citrea). H (https://docs.foresight.now/guides/platform-markets/market-types.md).
  2. **CLOB (central limit order book)**, launched mid-2026 on BSC and Base. Off-chain matching worker, EIP-712 signed orders, on-chain settlement through a "CTF Exchange" contract. H (https://docs.foresight.now/foresight-apis/clob/introduction.md and live API).
- Binary YES/NO only in the CLOB (`outcome` 1 = YES, 0 = NO). "Multi markets" are groups of independent binary submarkets under one umbrella (`group_slug`, `group_question` in the API), not a single categorical market. Ties/draws resolve at 50/50 (`resolution_outcome` = -1; 2 of 490 closed markets). No scalar markets. H.
- Tokenisation: each outcome is an ERC-1155 position in a Gnosis-style ConditionalTokens contract; `tokens[].token_id` is a decimal uint256. Split/merge available: 1 collateral <-> 1 YES + 1 NO. H (docs market-types; live `/tokens`).
- Price: 2-decimal ticks, 0.01 to 1.00; amounts are BigInt wei with BUY-ceil / SELL-floor integer-tick math. H (signing-orders doc).
- Order types `LIMIT`, `MARKET`, `GTD` (GTD needs non-zero expiration). Batch place up to 15 orders, cancel up to 100 by hash. H.
- Market creation: "Platform-curated" by the team, plus "Arena" user-generated markets (creator seeds >= $100, market needs $1,000 seeded within a >= 2-day seeding phase, then >= 3 days trading; approved and launched within 12 h; creators/seeders get 50% of trading fees). H (docs arena-market-creation). Arena may be AMM-seeded; not verified.

## Chains and collateral

- **CLOB live chains (H, live `/v1/markets?chain_id=`):**
  - BSC mainnet (56): collateral `0x55d398326f99059fF775485246999027B3197955` (BSC-Peg USDT, 18 decimals; address matches the `USDT` constant in the Predict.fun SDK, H gh api PredictDotFun/sdk src/Constants.ts). CTF Exchange `0x36e6ECda5E730FfFcDC018B6b6766623e8F86E61` (a second exchange `0x9a8f1F54eaB44Db900179cdDA45b034076096ce0` appears on 5 closed markets), ConditionalTokens `0x559a02478D3Fac6ba7aBB82439a380362B78e785`.
  - Base (8453): collateral native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals per `/tokens`), CTF Exchange `0x1577b2BFa6d213E1B882Eed3c97E93b128B58742`, ConditionalTokens `0xfaa2AdbA8956aea50e12EeC136a7f62b860bbfCb`. The docs say the CLOB is BSC-only; live data shows Base too (166 closed + 1 open). H.
  - Katana (747474), Citrea (4114), BSC testnet (97), Ethereum (1): `/v1/markets` returns an empty list. H (live).
- **Legacy AMM chains (docs only, no live enumeration possible):** Katana 747474 collateral vbUSDC `0x203A662b0BD271A6ed5a60EdFbd04bFce608FD36`; Base USDC; Citrea ctUSD `0x8D82c4E3c936C7B5724A382a9c5a4E6Eb7aB6d5D`. "Each network has its own markets, balances, and liquidity, and funds cannot move between them." H (https://docs.foresight.now/guides/getting-started/introduction-to-foresight.md).
- Doc drift: the docs list BSC as "chain ID 97, USDT `0x524bC9...`", which is the BSC testnet id, while the CLOB docs and live API use chain 56 / `0x55d398...`. Trust the live API. H.
- Verified source / audit of the exchange contracts: NOT FOUND (searched: gh org, docs, search; did not call an explorer API because none was available without a key).

## Read API

- `exists`: **official-public** for the CLOB (L0 tier, no key). The legacy `/trade/*` AMM API now needs a platform API key even for reads. H.
- Docs: https://docs.foresight.now/foresight-apis/clob/introduction.md ; index https://docs.foresight.now/llms.txt ; OpenAPI https://docs.foresight.now/api-reference/openapi-clob-v1.yaml (H, 35 KB, matches live responses). `https://docs.foresight.now/api-reference/openapi.json` is a Mintlify "Plant Store" placeholder, ignore it.
- Base URLs: `https://api.foresight.now` (REST, all CLOB routes under `/v1`), `wss://api.foresight.now/v1/ws`. H.
- Key public endpoints (all confirmed live with unauthenticated GET, 2026-10-19):
  - `GET /v1/markets?chain_id=56|8453&status=open|closed|resolved|paused&limit<=100&cursor=` : paginated `{data, next_cursor, has_more}`; fields: `condition_id, chain_id, question, summary, rules, group_slug, group_question, collateral_token, ctf_exchange_address, conditional_tokens_address, status, resolution_outcome, resolved_at, end_date, tags[], tokens[], ticker{bestBid,bestAsk,lastPrice,spread,displayPriceYES,displayPriceNO}, fee_rate_bps, created_at`. `chain_id` is required. `X-Language: en|cn` for summary/rules. Fixture `clob_markets_open_limit5_chain56.json`.
  - `GET /v1/markets/{condition_id}?chain_id=` : any status. Fixture `clob_market_closed_resolved.json`.
  - `GET /v1/markets/{condition_id}/book?chain_id=` : `{bids:[{price:"0.89",remainingSize:110.58}], asks:[...]}` (price is a string, `remainingSize` is a JSON number in the live book although the OpenAPI says string). Fixture `clob_book_btc_daily_open.json`.
  - `GET /v1/markets/{condition_id}/ticker?chain_id=` : snake_case strings, `volume_24h` is null. Fixture `clob_ticker_btc_daily_open.json`.
  - `GET /v1/markets/{condition_id}/trades?chain_id=&limit=&cursor=` : public prints `{trade_id, price, size, created_at}`, **no side or outcome**. Fixture `clob_trades_closed_market_limit5.json`.
  - `GET /v1/markets/{condition_id}/tokens?chain_id=` : token ids and `decimals` (18 on BSC, 6 on Base). Fixtures `clob_tokens_btc_daily_open.json`, `clob_tokens_btc_daily_base8453.json`.
- Resolution data: `status` (OPEN / CLOSED / PAUSED / SEEDING), `resolution_outcome` (0 NO, 1 YES, -1 draw), `resolved_at`. Quirk: resolved markets show `status: "CLOSED"` (the `status=resolved` filter returns 0 rows although the schema lists RESOLVED); one PAUSED market already carries `resolution_outcome: 0`. H (live).
- No volume or open-interest field on CLOB markets; volume must be summed from trades. The legacy `/trade/markets` had `volume`, `transactionCount` but now returns 401 `Missing X-Platform-API-Key header` (fixture `legacy_trade_markets_401.json`; docs still say public). H.
- WebSocket: `wss://api.foresight.now/v1/ws[?token=]`. Public channels `book` (snapshot then `book_delta_batch` with per-market `seq`), `ticker`, `trades`, subscribe per `{condition_id, chain_id}`; private `user` channel needs a single-use 60-second token. Client must ping itself; slow consumers dropped at about 1 MiB (code 1013). H docs, **not tested** (no WS client used).
- Rate limits: response headers `x-ratelimit-limit: 1500`, `x-ratelimit-remaining`, `x-ratelimit-reset` (epoch ms, fell on the next minute boundary, so likely a 1-minute window, M). API keys carry `rate_limit_tier` STANDARD or ELEVATED (what ELEVATED means is NOT FOUND). My crawl of about 600 requests ran with no throttling. H headers, M window.
- CORS exposes `X-Predictfun-Token` (and `X-Platform-*`, `X-Partner-API-Key`). Why a Predict.fun header is whitelisted is NOT FOUND (L). See Shared liquidity.
- Subgraph / indexer: Foresight uses Ormi (GraphQL) internally for Katana (H, Ormi case study); no public endpoint or schema documented. NOT FOUND.

## Trade path

- CLOB (BSC / Base): **programmatic**. Flow (H, docs):
  1. L1: a human logs in to the Foresight web app (Privy: email, Google, or wallet) and mints an API key with `POST /v1/auth/api-keys` using the **Privy JWT** (`Authorization: Bearer`); keys cannot be created with a key. Secret shown once; permissions `read` and/or `trade`.
  2. L2 headers on every private call: `fs-api-key`, `fs-api-secret`. Key is bound to the creating wallet; order `signer` must equal that wallet, else `WALLET_MISMATCH`.
  3. Read `ctf_exchange_address` and `token_id` from the market; sign EIP-712 typed data: domain `{name:"ForesightExchange", version:"1", chainId:56 (or 8453), verifyingContract: ctf_exchange_address}`; primary type `Order` with 12 fields (`salt, maker, signer, taker, tokenId, makerAmount, takerAmount, expiration, nonce, feeRateBps, side, signatureType`); `signatureType` 0 = EOA, 1 = EIP-1271.
  4. `POST /v1/orders` (<= 15 orders, header `fs-idempotency-key` optional). Always returns `status: OPEN`; matching and settlement are asynchronous and arrive on the `user` WebSocket channel (`order_*`, `fill`, `settlement_update` with `tx_hash`).
  5. Cancel: `POST /v1/orders/cancel` (off-chain) or `POST /v1/orders/{hash}/cancel-onchain` (returns unsigned calldata; user pays gas).
  6. Prerequisites on chain: ERC-20 `approve` of collateral to the exchange for buys; ERC-1155 `setApprovalForAll` for sells (docs describe this for the AMM API; the CLOB docs do not restate it, M that the same applies); native gas token for approvals and redeems.
  7. After resolution the user must send a claim/redeem transaction (no expiry on claims). H.
- Legacy AMM: `POST /trade` returns calldata (`tx`) to send from the user's wallet; **requires a platform API key** (`X-Platform-API-Key`), not self-serve. So not integrable for us. H.

## PayBox reachability

- **partial.** PayBox's chain catalog (this repo, `docs/research/06-paybox-platform.md`, re-listed live 2026-10-19) contains BNB Smart Chain (56) and Base (8453); it does not contain Katana (747474) or Citrea (4114). H (from that note).
- Order signing: `request_wallet_sign` with op `typedData` signs arbitrary EIP-712 domains with no documented chain allowlist (same note, H absence of restriction), so a PayBox EOA could in principle produce the `ForesightExchange` order signature for chain 56 or 8453. Signature type 0 (EOA) fits. The signature call carries no `value_cents`, so grant spend policy cannot see order size (same guardrail gap as in that note).
- On-chain steps (ERC-20 approve, ERC-1155 approval, claim) are plain EVM calls on BSC/Base, which fit `io.paybox/transactionProposal`. Gas is BNB / ETH-on-Base. M.
- Blockers: (a) the API key needs a Privy JWT, i.e. a human login in the Foresight web app, and the key is bound to the logging-in wallet, so the PayBox EOA must be the wallet used for Privy "wallet login" (SIWE-style signature; embedded email/Google wallets are Privy-custodial and PayBox cannot sign for them). Whether a clean headless Privy wallet login works is NOT FOUND (L). (b) 18-decimal BSC collateral needs careful BigInt math (a documented rejection source). (c) The legacy Katana AMM is unreachable (chain not in PayBox, platform key needed).

## Fees

- Per-market `fee_rate_bps` is returned by the API and also goes into the signed order as `feeRateBps`. Live distribution over 502 market rows: 300 bps (365), 500 (132), 320 (3), 700 (2); all 11 open markets are 300. The docs' examples use 100 (illustrative). H (live).
- Formula (flat on notional vs Polymarket-style price-dependent), maker vs taker split, and who pays: NOT FOUND (searched: all docs.foresight.now guide + API pages, OpenAPI). Treat as up to 3% of notional until read from the exchange contract.
- Arena: 50% of trading fees go to creators and seeders; failed seeding withdraws with a 5% penalty. H (docs).
- Gas: users with external wallets pay gas for approvals and claims; matched trades are settled by the operator (a `tx_hash` is reported on the `user` channel), so trade gas is probably operator-paid (M, inferred). Fiat on-ramp fees depend on a third-party provider (H docs, unnamed).
- KAT incentives (Katana only): 0.025 KAT per $1 held per day on eligible markets, boosts 2x to 50x, claimed via Merkl. H (docs). Not relevant to BSC/Base CLOB.

## Resolution mechanism and dispute risk

- Centralised. The Foresight team resolves markets "according to its published rules and resolution source". Market `rules` text (example, BTC daily) names Binance 1-minute BTC/USDT candle closes, a CoinGecko fallback, an averaging rule if sources differ by more than 0.1%, and a fixed resolution deadline. H (live `rules`).
- The platform may "publish clarifications" after launch and may PAUSE a market pending verification; paused markets can resume or resolve. H (docs market-states, market-rules).
- Outcome is confirmed on-chain; winners claim manually, no expiry. H docs.
- Dispute process / bond / oracle contract: NOT FOUND (searched: docs, search). A PulseChain ecosystem listing mentions an "advanced AI oracle" (L, third-party snippet, not in Foresight's docs).
- Latency from live data (490 closed rows): `resolved_at - end_date` median about 1 minute, p90 6.4 h, max 77 h; some touch-style markets resolve up to 586 h before `end_date`. H (own computation, see `crawl_summary_2026-10-19.json`).
- Dispute risk: medium to high for edge cases (single operator, discretionary clarifications, thin markets). Normal daily BTC / sports markets resolved quickly.

## Geo / ToS / automation

- Terms of Service and geo restrictions: NOT FOUND. The marketing site returns a Vercel "Security Checkpoint" (HTTP 429 to curl and WebFetch); I did not attempt to bypass it. No terms or jurisdiction list is linked from the docs (searched: all guide pages, llms.txt). Web search found nothing for foresight.now.
- Automation: explicitly allowed for the CLOB. Docs: "lets bots and integrations trade", "API keys are how bots authenticate", L2 tier "Bots or users". H.
- Signals of an Asia focus: Ormi case study ("focuses on Asia"), MYT times in docs, `X-Language: cn`, Malaysian market topics. M. Whether US persons are blocked is unknown. Treat as geo-unverified.

## Liquidity (with dates)

- All-time CLOB trade notional about **$93K** (8,657 public prints; BSC about $70K / 7,496 prints, Base about $23K / 1,161 prints), 2026-07-03 to 2026-10-15. Approximation: sum of `price * size` over public prints, which carry no side/outcome; 2 markets capped at 600 prints. By month of each market's last trade: July $63.6K, Aug $24.4K, Sep $5.0K, Oct (to the 15th) $0.15K. H data, M method. Fixture `crawl_summary_2026-10-19.json`.
- Largest markets: "Argentina vs Egypt - 2026 FIFA World Cup" about $7.8K (BSC), "VCT: BBL Esports vs Gentle Mates" about $5.4K (Base). H.
- Resting depth on 2026-10-19 across the 10 open BSC markets: about $2.5K of bids and $3.6K of asks in total (top 5 levels each); two WTI books and one Gold book have no bids. The BTC daily book is 0.89 / 0.97 (8-cent spread, top level 110.58 shares, then sizes growing about 1.3x per level). The Base copy of the same market has a byte-identical book. M: looks like one algorithmic house quoter mirrored across chains. H for the numbers.
- TVL / open interest: NOT FOUND (no API field; DefiLlama not checked for this venue). Legacy Katana AMM volume: "<$100K" per an undated index snippet (L).

## Event coverage and arbitrage overlap

- Categories seen in 502 market rows (tags): sports (football incl. 2026 World Cup, WNBA/NBA, tennis, esports VCT / CS / LoL; 138+62 markets, 70% of notional), crypto (185, BTC daily Up/Down plus others), finance (68: gold XAUUSD touch markets with Pyth as a source, WTI, single stocks like NVDA), climate (49: earthquake counts, Malaysia air-pollution index, weather). H.
- Open today: BTC daily Up/Down (2026-10-19), 4 Gold touch ladders, 5 WTI touch ladders (Oct 2026). These overlap in kind with crypto-price and commodity markets on large venues (M, from general knowledge of other venues, not re-verified here). Sports/esports overlap exists historically but nothing sports is open now.
- Weather / earthquake / Malaysian API markets are rarely listed elsewhere (M), but they are closed or paused.

## Shared liquidity (is it an independent leg?)

- Own contracts: Foresight's CTF Exchange, ConditionalTokens, and EIP-712 domain name (`ForesightExchange`) differ from Predict.fun's (`predict.fun CTF Exchange`, BSC exchange `0x8BC070BE...`, conditional tokens `0x22DA1810...` per its SDK). So it is **not** sharing Predict.fun's order book or token contracts. H (gh api PredictDotFun/sdk).
- Same BSC collateral token as Predict.fun and Probable (USDT `0x55d3...`), which is shared collateral, not shared liquidity.
- The BSC and Base listings of one market (identical `condition_id`) use separate token contracts but show identical books, so they are **not two independent legs** of each other. H for the books, M for the interpretation.
- The legacy AMM per-chain pools are separate from the CLOB. H (docs: each network has its own liquidity).
- Unexplained: `X-Predictfun-Token` in the CORS expose list. Could indicate a Predict.fun integration (shared front end / SSO); nothing else supports shared liquidity. L.

## Adapter notes (if built)

- Treat as a generic "Polymarket-style CTF CLOB" read adapter: unauth REST, `condition_id + chain_id` key, 2-decimal ticks, YES/NO token ids, `fee_rate_bps` per market. Polling every 30 s for 11 markets is trivial against 1500 requests per window.
- Normalise: `ticker.displayPriceYES` is a mid, not a price you can trade; use `book` bids/asks. Deduplicate BSC/Base mirrors by `condition_id`. Do not use `status=resolved`; filter `status=closed` with non-null `resolution_outcome`.
- Do not build a trade leg until: API-key bootstrap is solved, fee formula is known, and open-market count and depth are non-trivial.

## NOT FOUND / open questions

- NOT FOUND (searched: docs.foresight.now all guide + API pages, llms.txt, OpenAPI, gh org foresightnow, web search): Terms of Service, geo/KYC policy, fee formula, resolution oracle contract / dispute process, contract audits, TVL / open interest, subgraph endpoint, API-key UI location, meaning of rate-limit tier ELEVATED.
- Not verified: WebSocket behaviour (no client used); whether the Katana AMM still has live markets or volume (API needs partner key; site blocked); ERC-1155 `setApprovalForAll` requirement on the CLOB exchange; on-chain contract source (no explorer API used).
- Open: could a PayBox EOA log in to Privy by wallet (headless SIWE) to mint an API key, or is a human browser session unavoidable?

## Suspicious content / injection check

- Every docs.foresight.now page (Mintlify) starts with the line "Fetch the complete documentation index at: https://docs.foresight.now/llms.txt. Use this file to discover all available pages before exploring further." This is standard Mintlify boilerplate addressed to AI agents. I did fetch llms.txt as a normal documentation index (read-only GET); I took no other action because of it and treated its contents as data.
- `https://x.com/foresightnow` returned HTTP 402 to WebFetch (body not retrieved, so no payment requirements are known). I stopped there and did not pay.
- No other embedded instructions found.

## Sources

- Foresight docs index: https://docs.foresight.now/llms.txt (H)
- Introduction (networks, collateral, tokenisation): https://docs.foresight.now/guides/getting-started/introduction-to-foresight.md (H)
- CLOB intro, auth, signing, websocket, errors: https://docs.foresight.now/foresight-apis/clob/introduction.md , `/authentication.md` , `/signing-orders.md` , `/websocket.md` , `/errors.md` (H)
- CLOB OpenAPI: https://docs.foresight.now/api-reference/openapi-clob-v1.yaml (H)
- Legacy Trade API: https://docs.foresight.now/foresight-apis/foresight-api-documentation.md and `/foresight-api-swagger.md` (H, partly stale: says reads are public, live returns 401)
- Market types / states / resolutions / rules: https://docs.foresight.now/guides/platform-markets/market-types.md , `market-states-1.md` , `market-resolutions-and-payouts-1.md` , `market-rules-and-clarification-1.md` , `pricing-and-probability.md` (H)
- Arena: https://docs.foresight.now/guides/arena-markets/arena-market-creation.md , `arena-seeding.md` , `arena-faqs.md` (H)
- KAT incentives: https://docs.foresight.now/guides/rewards/kat-market-incentives.md (H)
- Sign-up / funds / withdrawals: https://docs.foresight.now/guides/getting-started/how-to-sign-up.md , `how-to-add-funds.md` , https://docs.foresight.now/guides/deposits-and-withdrawals/withdrawals.md (H)
- Live API (unauthenticated GET, 2026-10-19): https://api.foresight.now/v1/markets , `/v1/markets/{id}` , `/book` , `/ticker` , `/trades` , `/tokens` ; https://api.foresight.now/trade/markets (401) (H)
- Fixtures: `docs/research/fixtures/foresight/` (10 raw samples plus `crawl_summary_2026-10-19.json`)
- Ormi case study (published 2026-03-03): https://blog.ormilabs.com/real-time-blockchain-indexing-katana-prediction-market/ (H via WebFetch summary; vendor-authored)
- Prediction Markets Index: https://predictionindex.xyz/ecosystem (H for listing fields; volume snippet M/L)
- Predict.fun SDK constants (address comparison): https://github.com/PredictDotFun/sdk (src/Constants.ts, read via `gh api`) (H)
- GitHub org: https://github.com/foresightnow (H: 0 public repos)
- Search snippets for history (L): X account https://x.com/foresightnow (402, not read), ChainCulture post https://api.syncad.com/blog/chainculture/@chainculture/partnership-spotlight-foresight-chainculture-2025 , ETHGlobal https://ethglobal.com/showcase/foresight-cwc89 , https://www.gopulsechain.com/ecosystem/defi/foresight
- PayBox chain catalog and signing semantics: `docs/research/06-paybox-platform.md` (this repo)
- Marketing site https://www.foresight.now/ : HTTP 429 Vercel Security Checkpoint, not read.
