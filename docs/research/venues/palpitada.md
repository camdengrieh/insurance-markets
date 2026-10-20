# Palpitada (palpitada.com.br) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock 03:25-03:40 UTC). READ-ONLY: page and JS-bundle reads, unauthenticated GETs against the venue's own API host, `gh` search, public GETs to Sourcify and DefiLlama. No account, wallet, signature, API key, POST/PUT/DELETE, on-chain call or PayBox tool. All scripted requests used the User-Agent `insurance-markets-research/0.1`. Third-party pages and API responses were treated as untrusted data; nothing in them was followed.

Limits of this pass: the WebSearch budget ran out after the first query, so press and analytics coverage is limited to the pages WebSearch returned and I then fetched (BNLData x2, Tokeniza, Gazeta do Povo). The venue publishes **no developer docs**; the API surface below is read out of the site's own client bundle plus live GETs. The market list lives behind a GraphQL subgraph that only answers POST, so I could not enumerate markets (see section 4).

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, or my inference from first-hand data (including inference from the venue's client code); **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/palpitada/` (listed in section 13).

---

## 0. Bottom line

1. **Live, but tiny, and blocked in Brazil.** The site, API and subgraph answer on 2026-10-19; ToS were updated 2026-04-15. A weekly-ranking endpoint shows 4 users and about $85 staked. The global "recent orderbook trades" endpoint is empty. Anatel's April 2026 block list names Palpitada. (H/M, sections 1 and 10)
2. **Real structure, three market types on Arbitrum One.** (a) legacy pool markets: per-market contract, share price from a curve, payout is a pro-rata slice of the whole pool (parimutuel-like), not $1 per share; (b) a YES/NO central-limit order book with prices 1-99 cents, EIP-712 signed orders matched off-chain by the operator and settled on-chain by `PalpitadaOrderbookExchange`; (c) a ternary (YES/NO/DRAW) variant of (b). Collateral is native USDC. (H for existence, M for mechanics)
3. **There is a usable read API for the order-book markets** (REST + WebSocket), keyless for books, prices, trades and volume. But **market discovery needs a POST GraphQL subgraph**, which I did not send under the read-only rules. (H)
4. **Resolution is centralised**: operator-proposed, multisig-executed; ToS let the operator declare "draw" and refund when the outcome is not "100% certain", cancel a market on a technical error, and change fees and rules unilaterally. That is leg risk for an arbitrage hedge. (H)
5. **adapter_priority = P2** (bottom of P2). Independent liquidity and a real API, but no measurable depth, no market list I could read, Brazil-specific events, and regulatory risk. Revisit only if volume appears. (M)

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Site | `https://palpitada.com.br/` 200 OK on 2026-10-19 03:28 UTC (Next.js behind Cloudflare). The home page is a client-rendered shell: only the title "Palpitada - Mercado Preditivo Descentralizado" and meta tags are in the HTML. `age` header 6,223,601 s means the cached shell is about 72 days old; that says nothing about activity | H |
| API | `https://api.palpitada.com.br/` returns `{"status":"OK","message":"API is running"}`; `/api/` returns "Hello World" | H |
| Subgraph | `https://subgraph.palpitada.com.br/subgraphs/name/palpitada-subgraph/graphql` returns 200 (GraphiQL page on GET) | H |
| ToS | "Ultima Atualizacao: 15 de abril de 2026" at `/terms-and-conditions` | H |
| Activity | `GET /api/ranking/weekly?limit=100` (2026-10-19 03:31 UTC) returned 4 users, 104 predictions, $85.42 total invested (window definition not documented) | H data, M interpretation |
| Banners | 2025-12-08: "Palpitada ta aqui! ... agora na Arbitrum ... Limite temporario de US$ 50 por carteira/mercado"; 2025-07-22: "Palpitada + Chiliz ... integrada com a Chiliz" | H (API `/banners`) |
| Press | BNLData 2026-01-30 and 2026-02-18 mention it as operating; Gazeta do Povo 2026-04-27 lists it as item 20 of sites Anatel began blocking on Friday 2026-04-24 ("lista apenas com os nomes contidos na imagem", so the listing rests on an image) | M (WebFetch summaries) |
| Not on DefiLlama | `api.llama.fi/protocols` (8,758 protocols) has no `palpit`/`metamatch` match | H |

Verdict: **still_live = true** (small, narrow, with a stated block in Brazil since April 2026; the effect of the block on the API was not testable from here, M).

Operator: **MetaMatch** (the ToS name MetaMatch as the operator; Palpitada is "gerenciada pela MetaMatch"). A Tokeniza page describes a Palpitada token offer (R$ 200,000 raise, pre-launch, 3% of transacted value shared with stakers) with no date; the site's own pages talk about "PPT" points and an airdrop (H: `/como-funciona`; M: Tokeniza page is promotional and undated).

---

## 2. Kind and market model

- **Kind:** hybrid on-chain prediction market, Brazil-focused, Portuguese UI. Three market types, identified by `marketType` in the subgraph: `"1"` LMSR (name in client code), `"2"` ORDERBOOK, `"3"` TERNARY (H: bundle chunk `7624-...js`).
- **Type 1, pool markets (H existence, M mechanics):** one contract per market (address = market id). Binary (`sideA`/`sideB`, with names and images). Contract methods used by the client: `predict(sideA, shares, maxPrice, permit)`, `sellPosition(sideA, shares, minOut)`, `getPrice(sideA)`, `calculateAmountRequiredInUSDC(shares, sideA)`, `getMaxSellAmount`, `getSellReturn`, `withdraw()`, `withdrawCuratorFees()`. The client's expected-gain formula is `pool * boughtShares / (outstandingWinningShares)`, i.e. **a share is worth `pool / winning shares` at resolution, not a fixed $1**. The site copy says the same in words: "o pool do lado perdedor e distribuido entre os vencedores de forma proporcional" (`/mercado-preditivo`, `/como-funciona`; the pages say "AMM"). So price is not a clean probability and hedging against another venue is imprecise. (M: inferred from client code and marketing copy; contract source not read)
- **Type 2, order book (H):** YES (tokenId 0) and NO (tokenId 1) outcome tokens; type 3 adds DRAW (tokenId 2). Prices in cents, valid range 1-99 (client error "Preco invalido. Deve estar entre 1c e 99c"). The REST book returns `{yes:{bids,asks}, no:{bids,asks}, draw?}`. Operations: place/cancel limit orders, **split** (USDC to YES+NO), **merge** (YES+NO to USDC), **redeem**, each as an EIP-712 signed message (section 5). Outcome tokens: the REST layer exposes balances/positions per market; whether they are ERC-1155 or internal ledger entries is NOT FOUND. Order sizes: shares have 6 decimals and are rounded to multiples of 100 raw units (H: client `buildOrder`).
- **Not scalar.** No categorical (more than 3 outcomes) type seen; multi-outcome events are modelled as several binary markets grouped by a trailing "(date)" in the subtitle (M: client grouping code).
- **Identifiers (H):** market id is the lower/upper-case hex address of the market contract (`0x41E4...` style); API accepts addresses; WebSocket expects lower-cased addresses.
- **Categories (H, `/api/categories`):** Esportes(1), E-Sports(2), Politica(3), Cultura Pop(4), Cripto(5), Ciencia(6), Noticias(7), Negocios(8), Outros(9).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Arbitrum One. Evidence: native-USDC address below is the Arbitrum One USDC; the wallet config uses the Arbitrum network object and the Arbitrum logo; banner 2025-12-08 "agora na Arbitrum". I did not read a literal `42161` constant next to the Palpitada config, so the chain id is inferred | H (USDC address, banner), M (chain id 42161) |
| Earlier chain | Chiliz (banner 2025-07-22 "integrada com a Chiliz"; Pix on-ramp code still lists a CHZ target currency). Old Chiliz-chain markets may still exist; not investigated | M |
| Collateral | Native USDC on Arbitrum `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, 6 decimals; supports EIP-2612 permit (client signs a `Permit` with domain from `eip712Domain()`, fallback name "USD Coin" v2) | H (bundle) |
| Credits | "Credit manager" contract `0xD0BE640021DDe1eC1308818f7570589e878d8f81` holds promotional credits that can be spent on pool markets; positions bought with credits cannot be sold | H (bundle), M (purpose) |
| Orderbook exchange | `PalpitadaOrderbookExchange` v1; address comes from the subgraph (`orderbookFactoryStats.exchangeAddress`), not hard-coded. Not read | H (name), NOT FOUND (address) |
| Verification | Sourcify has no match for the credit manager or for a hidden-market address on chain 42161; Blockscout API returned 403 to the generic UA (not worked around). Contract source NOT FOUND (no repo: `gh search repositories palpitada` finds only an unrelated 2014 repo) | H |
| Audit | ToS and banner claim a Nethermind audit using "Audit Agent" (AI tooling) plus expert review, with "nova auditoria em andamento" (Dec 2025). No report link found | M (self-reported) |
| Gas | Pool-market trades are normal Arbitrum txs paid in ETH (client error text: no ETH for gas). Order-book trades are signed messages; the operator submits settlement (M, inferred: no user tx in the order flow except USDC approval) | H / M |
| Fiat | Pix on/off-ramp via Transfero (`/api/kyc/transfero/ramp`, `/offramp`), CPF and Veriff KYC; default limits R$ 4,000/month deposit, USDC 1,000/month withdraw (client fallbacks). ToS (2026-04-15) say "no momento, a plataforma nao disponibiliza servico de on-ramp integrado", which conflicts with the bundle and the banner copy; treat Pix as human-only and possibly not current | H (code), conflicting |

---

## 4. Read API

No developer documentation exists (NOT FOUND: `/docs`, `/api/docs`, `/swagger`, `/openapi.json`, `/health` all 404; no GitHub org or repo; no docs subdomain). Everything below comes from the site's JS bundle (`/_next/static/chunks/8943-...js`, `7624-...js`, `3385-...js`, `layout-...js`) and live GETs.

- **REST base:** `https://api.palpitada.com.br/api` (Express/Node behind Cloudflare). JSON envelope `{success?, message, data}`.
- **WebSocket:** `wss://api.palpitada.com.br/ws/orderbook`. Client messages: `{"type":"subscribe","channel":"orderbook"|"prices"|"trades","market":"<lowercase address>"}`, `{"type":"ping"}` every 25 s. Server types: `subscribed`, `orderbook_snapshot`, `orderbook_update`, `price_update`, `trade`, `order_update`, `pong`, `error`. (H: code; not connected to by me)
- **Subgraph (market discovery, history, resolution state):** `https://subgraph.palpitada.com.br/subgraphs/name/palpitada-subgraph` (Graph Node style). GET returns a 302 to `/graphql` and the GraphiQL page even with a `query` parameter, so **queries need POST**; I did not send one. Entities seen in the client queries: `markets` (fields below), `predictions`, `positionSales`, `marketPriceHistories(interval: hour)`, `users`, `factoryStats {marketFactoryAddress}`, `orderbookFactoryStats {factoryAddress exchangeAddress}`. Market fields include `id, slug, name, subtitle, description, rules, category, subcategory, marketType, enableDraw, sideA/B/C, priceA/B, oddsA/B, eventDate, status, resolved, winningOutcome, resolvedAt, resolvedBy, marketResolution{date,outcome}, usdcToken, predictionsPoolBalance, protocolPoolBalance, totalUSDCSideA/B, totalCreditsUsedSideA/B, usdcDeposited, protocolFee, curator, curatorFeeRate, sellsEnabled, minLiquidityRatio, baseSellFee, minHoldingPeriod, multisigController{signers,threshold,operations}, tokenDiscounts`. (H)

Public GET endpoints (authentication not required; "confirmed" = I called it):

| Endpoint | Purpose | Status |
|---|---|---|
| `GET /api/categories` | category list | confirmed 200 (fixture) |
| `GET /api/banners` | site banners with dates | confirmed 200 (fixture) |
| `GET /api/ranking/weekly?limit=&category=` | per-user weekly invested/gains/count | confirmed 200 (fixture, addresses masked) |
| `GET /api/orderbook/book?market=&depth=` | YES/NO(/DRAW) bids and asks | confirmed 200, empty on a hidden market (fixture) |
| `GET /api/orderbook/prices?market=` | per outcome `{bid,ask,mid,spread,lastPrice}` | confirmed 200, all null on hidden market (fixture) |
| `GET /api/orderbook/trades/volume?market=` | `volume24h, tradeCount24h, totalVolume, totalTradeCount` | confirmed 200, zeros (fixture) |
| `GET /api/orderbook/trades/recent?limit=` | global recent trades | confirmed 200, **`data: []`** (fixture) |
| `GET /api/orderbook/trades?market=&limit=`, `/trades/last?market=&tokenId=`, `/trades/probability-history?market=&timeframe=&tokenId=`, `/trades/ternary-probabilities?market=` | trades and history | in client code, not called (no active market id) |
| `GET /api/orderbook/referral/config` | referral and maker-rebate parameters | confirmed 200 (fixture) |
| `GET /api/public/hidden-markets/ids` | 14 market addresses the UI hides | confirmed 200 (fixture) |
| `GET /api/markets/{id}/context` | AI/context blurb for a market | endpoint exists (404 `MARKET_NOT_FOUND` for an unknown id) |
| `GET /api/comments/count`, `/comments/by-market/{id}`, `/prices/simple?ids=usd-coin&vs_currencies=usd,brl` | misc | `comments/count` and `prices/simple` confirmed |
| `POST /api/markets/calculate-shares` | quote for pool markets (`marketAddress, investmentAmount, sideA, userAddress` returns `sharesToBuy, cost, totalFees, totalRequired`) | in client code, not called (POST) |

There is **no REST "list markets" endpoint**: `GET /api/markets` returns 404 (H). Resolution state, winner and history come from the subgraph; resolution proposals (`/api/proposals`) need a token (401 `NO_TOKEN`, fixture).

- **Auth for private reads/writes:** `Authorization: Bearer <JWT>`. Error codes `NO_TOKEN`, `TOKEN_EXPIRED`, `INVALID_TOKEN` (H). Token obtained by `POST /api/auth` after the wallet signs the fixed string `"Metamatch Message"` (`personal_sign`); the client sends `{message, signature, userAddress, refBy}` (M: body inferred from the `init` thunk). **The message has no nonce or timestamp**, so a signature is reusable. Token lifetime NOT FOUND.
- **Rate limits:** NOT FOUND (no `RateLimit-*` or `Retry-After` headers on 200s; no docs).
- **Pagination:** order lists take `limit/skip` (referral) or page cursors; not characterised.

Response shapes confirmed (details in fixtures): `prices` returns `{success, message, data:{market, yes:{bid,ask,mid,spread,lastPrice}, no:{...}, draw:{...}}}`; `book` returns `{data:{market, yes:{bids:[],asks:[]}, no:{...}, lastUpdated:<ms>}}`; bid/ask entries have a `price` (0-1 float, per client code) - populated entries NOT seen because no market had depth.

---

## 5. Trade path

**Order-book markets (types 2/3)** - H for the signing scheme, from the client bundle (`3385-...js`, chunk module `66357`):

1. One-time: `USDC.approve(exchangeAddress, MaxUint256)` (client `ensureApproval`; needs ETH for gas) (H).
2. Authenticate: `personal_sign("Metamatch Message")` then `POST /api/auth` for a JWT (section 4).
3. Place an order: sign EIP-712 typed data and `POST /api/orderbook/orders`.
   - Domain: `{name:"PalpitadaOrderbookExchange", version:"1", chainId:<Arbitrum>, verifyingContract:<exchangeAddress>}`.
   - Type `Order(bytes32 salt,address maker,address taker,address market,uint8 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint256 nonce,uint8 side)`; `tokenId` 0 YES / 1 NO / 2 DRAW; `side` 1 BUY / 2 SELL; `taker` = zero address; `nonce` = 0; `salt` = random 32 bytes.
   - Amounts per client `buildOrder`: `makerAmount = round(shares*1e6)` floored to a multiple of 100, `takerAmount = makerAmount * priceInCents / 100` (for both sides; M: semantics undocumented, verify against a live fill before trusting).
   - Body: the order fields plus `signature` and `marketName`. Response: `{orderHash, status, matches, fullyFilled, remainingAmount}`.
   - Expiry presets in client: `1m, 5m, 1h, 12h, 24h` or end of day; `0` = no expiry.
4. Cancel: `DELETE /api/orderbook/orders/{orderHash}` (Bearer). Lists: `GET /api/orderbook/orders?userAddress=...` (Bearer). Balances/positions: `GET /api/orderbook/balances`, `/balances/usdc`, `/positions`, `/positions/{market}` (Bearer).
5. Split/merge/redeem: `GET /api/orderbook/{split|merge|redeem}/nonce`, then sign `SplitOrder(salt,maker,market,amount,nonce)` / `MergeOrder(...)` / `RedeemOrder(salt,maker,market,nonce)` with the same domain and `POST /api/orderbook/{split|merge|redeem}`.

**Pool markets (type 1)** (H code, M mechanics): `permit` (EIP-2612 typed data over USDC, spender = market contract, deadline now+24h) then `market.predict(sideA, shares, maxPrice, {deadline,v,r,s})`, with `maxPrice = getPrice * (100 + slippage%)/100` (default 5%). Selling: `sellPosition(sideA, shares, 0)`; the client passes `minOut = 0`, so an agent must set its own bound. Payout: `withdraw()` after resolution.

Constraints seen in client error table (H): selling is disabled in the last 3 days before the event ("TooCloseToEvent"), after a minimum holding period (`minHoldingPeriod`, placeholder default 3600 s), when selling would breach `minLiquidityRatio` (placeholder 3000 bps), when `sellsEnabled` is false, and for positions bought with credits. Minimum stake 1.00 USDC, maximum 999,999 (client check). Temporary US$50 per wallet per market cap announced 2025-12-08 (may be stale).

---

## 6. Reachable through PayBox?

**partial (leaning yes for order-book markets).** Basis: the project's own PayBox notes (`docs/research/06-paybox-platform.md`) record a live chain catalog that includes **Arbitrum (42161)**, and `request_wallet_sign` intents for `message` and `typedData` with no domain/chainId allowlist found. Mapping:

| Step | PayBox primitive | Concern |
|---|---|---|
| USDC approve to the exchange | EVM transaction proposal on Arbitrum | needs ETH for gas on the PayBox wallet |
| `Metamatch Message` auth | `request_wallet_sign` `message` | static message, replayable signature |
| Order / split / merge / redeem | `request_wallet_sign` `typedData` (domain `PalpitadaOrderbookExchange`) then plugin submits the HTTPS POST | needs the exchange address (from the subgraph) and a plugin allowlist for `api.palpitada.com.br`; sign-then-submit pattern per the project notes |
| Pool-market `predict` | EIP-2612 `typedData` + contract-call proposal | contract-call proposals for arbitrary contracts: not verified |

Not tested (no PayBox tools may be called in this task). The blockers that matter are not technical: no market list I could read, no depth, and ToS/regulatory risk (section 9).

---

## 7. Fees

| Fee | Value | Who pays | Tag |
|---|---|---|---|
| Platform fee | "uma porcentagem de cada transacao ... deduzida automaticamente dos ganhos antes de serem transferidos"; rate "claramente informado ao usuario antes da conclusao da transacao"; operator may change the fee structure at will | winners (deducted from winnings) | H (ToS), rate NOT FOUND |
| Pool markets, per market | `protocolFee` (bps), `curatorFeeRate` (bps, to the market creator/curator), `baseSellFee` (client placeholder default 300 bps), `minHoldingPeriod`, `minLiquidityRatio`; the client only shows the fee once the smaller side holds at least 100 tokens (units uncertain) | buyer/seller; creator earns curator fee | H (fields), M (values, formulas) |
| Order book | referral config (live): MLM `baseRewardBps 200`, `decayFactor 0.5`, `minRewardBps 1`, `maxTotalRewardPct 5000`, `referralBonusDiscountBps 100`, `maxReferralDiscountBps 5000`, `makerRebateEnabled true`, `makerRebateBps 50`. The base taker/maker fee schedule is NOT FOUND, but this config implies one (rebates and referral rewards are paid out of it) | taker (M) | H (config), NOT FOUND (schedule) |
| Market creation | "pequena taxa percentual" charged to the creator (BNLData 2026-01-30; no figure) | creator | M |
| Gas | ETH on Arbitrum for approvals and pool-market trades | user | H |
| Fiat ramp | Transfero spread/fees (not characterised) | user | NOT FOUND |

Gotcha: pool-market fees are applied at the contract level and the exact formula for `calculateAmountRequiredInUSDC` is unread, so an adapter must call `/markets/calculate-shares` or the contract to get an executable cost; do not derive it from `priceA`.

---

## 8. Resolution

- **Who decides (H):** the operator. The client has admin routes `/api/proposals` (create, sign, execute, cancel) and each market has a `multisigController {signers, threshold, operations{executeAfter, executor, status}}` in the subgraph, with function-level `functionConfigs{selector, threshold, delay}`. Flow: a resolution proposal is created by an admin (OTP-gated), co-signers sign, then it is executed on-chain after a timelock (`executeAfter`). Signers and thresholds per market NOT FOUND (subgraph unread).
- **Dispute (H, ToS 9.3.1):** users "podem levantar uma disputa", the operator gives a deadline for official recognition; **"se ... nao for possivel determinar com 100% de certeza um vencedor, a MetaMatch considerara o evento como empatado"** and refunds stakes minus gas. There is no bond, no external oracle and no on-chain dispute process.
- **Other outcomes the operator can force (H, ToS 9.5, 9.7):** cancel a market on a technical error and declare a draw; annul a market and refund on suspected manipulation. Draw refunds for DRAW-enabled markets (`enableDraw`).
- **Sources:** "fontes publicas e verificaveis"; each market has a `rules` text field (H, `/como-funciona`; rules text not read).
- **Risk for arbitrage:** high. A draw/void path means one leg can be refunded at cost while the hedge leg on another venue settles. Resolution rules may differ from Polymarket/Kalshi on the same real-world event.

---

## 9. Geo, ToS and automation

- **Eligibility (H, ToS 4):** 18+; use only where prediction markets are legal or not prohibited, "responsabilidade" of the user; the operator may restrict access by jurisdiction. No named country blocklist found (NOT FOUND for US/OFAC lists). Brazilian law and the courts of Sao Paulo govern.
- **Non-custodial (H):** "A MetaMatch nao atua como custodiante"; funds stay in user wallets/contracts.
- **KYC (H):** wallet identity only; KYC/AML (CPF, Veriff, Transfero) applies to users who deposit via Pix. Wallet-only trading needs none. ToS 9.8: no personal data collected beyond wallet addresses.
- **Automation (H, ToS 7):** no explicit bot/API clause. Prohibited: "dispositivo, software ou rotina que interfira ou tente interferir com o funcionamento normal da Plataforma"; "atividades de teste ou carga que possam prejudicar outros usuarios"; manipulation. The operator can suspend or end any account without notice and may modify rules and fees unilaterally. Programmatic order placement through the same REST API the front end uses is not expressly allowed or banned.
- **Regulatory (M):** listed among sites Anatel began blocking on 2026-04-24 (Gazeta do Povo, 2026-04-27); BNLData (2026-02-18) says regulators are still debating whether CVM, Banco Central or the Finance Ministry supervise; the venue's own `/legalidade` page says the law for decentralised prediction markets "ainda esta em desenvolvimento". Treat as a live takedown/legal risk that could change API availability.
- **Prompt-injection check:** no instructions aimed at AI agents seen in pages, bundle or API responses.

---

## 10. Liquidity (all figures dated)

| Measure | Value | Source | Tag |
|---|---|---|---|
| Recent order-book trades (global) | none (`data: []`) | `GET /api/orderbook/trades/recent?limit=3`, 2026-10-19 03:29 UTC | H |
| Weekly ranking (users / predictions / invested) | 4 / 104 / $85.42 (category filters: Esportes 2 users $25.25; Politica 3 users $9.91; Cripto 2 users $3.41) | `GET /api/ranking/weekly`, 2026-10-19 03:31 UTC; window undocumented, may include pool markets | H data, M meaning |
| Largest weekly staker | $65.20 over 85 predictions | same | H |
| Stake cap | US$ 50 per wallet per market (temporary) | banner 2025-12-08 | H, possibly stale |
| TVL / open interest | NOT FOUND (not on DefiLlama; market list not readable without a POST) | - | - |
| Hidden markets | 14 addresses hidden from the UI; one probed had zero book, zero volume | `GET /api/public/hidden-markets/ids` | H |
| Users / volume claims | none on the site; Tokeniza page gives none; "milhares de brasileiros" is marketing copy | - | L |

Conclusion: effectively no measurable depth. Prices on thin pool markets are set by a handful of small stakes.

---

## 11. Event categories and overlap

- Venue categories (H): sports, e-sports, politics, pop culture, crypto, science, news, business, other. Marketing emphasises Brasileirao, Copa do Brasil, Libertadores, BBB (reality show), Brazilian elections (`/palpitada-vs-polymarket`, `/mercado-preditivo`, M-level marketing copy).
- **Where arbitrage could exist (M, unverified because the market list was unreadable):** Brazilian election markets (the 2026 presidential runoff is scheduled for 2026-10-25, M from general knowledge) against Polymarket/Kalshi; crypto price markets (`/mercado-preditivo` mentions BTC/ETH price forecasts); macro (inflation, rates). Brazilian domestic football and BBB have little cross-venue overlap (the site itself says Polymarket "raramente cria mercados sobre futebol brasileiro").
- Resolution wording, draw semantics and the pool payout make a clean hedge hard even where the event matches.

---

## 12. Shared liquidity

None identified. The order book is the operator's own off-chain matcher with on-chain settlement, pool markets are per-contract, no sign of routing to Polymarket or another venue (NOT FOUND). Palpitada is an **independent** leg, but not a liquid one.

---

## 13. Adapter notes, fixtures and priority

**adapter_priority: P2 (signal-only, thin).**

If built (read-only signal adapter):
1. Discover markets by a read-only GraphQL POST to the subgraph (`markets(where:{status:"active"})`, filter `marketType` 2/3 for books, 1 for pools); read `orderbookFactoryStats.exchangeAddress` once.
2. Poll `GET /api/orderbook/prices?market=` and `/orderbook/book?market=&depth=` or subscribe to `wss://.../ws/orderbook` (`prices`, `orderbook`, `trade` channels); poll `/orderbook/trades/volume` for the activity gate. Skip any market with zero 24h volume and an empty book.
3. For pool markets, do not treat `priceA/priceB` as probabilities; use `/markets/calculate-shares` for a quote and apply the pool-payout formula.
4. Flag `status`, `resolved`, `winningOutcome`, `enableDraw` and the multisig state; treat every Palpitada position as exposed to operator void/draw.
5. Do not add a trading path until (a) a market shows depth, (b) the fee schedule and exchange address are confirmed, and (c) a fill is observed to validate `makerAmount/takerAmount` semantics.

Fixtures saved in `docs/research/fixtures/palpitada/` (all fetched 2026-10-19, UA `insurance-markets-research/0.1`):

- `api_root_2026-10-19.json`: `{"status":"OK","message":"API is running"}` from the API host root.
- `api_categories_2026-10-19.json`: nine categories.
- `api_banners_2026-10-19.json`: two banners (Arbitrum migration 2025-12-08, Chiliz 2025-07-22).
- `api_orderbook_book_hidden_market_empty_2026-10-19.json`, `api_orderbook_prices_hidden_market_empty_2026-10-19.json`, `api_orderbook_trades_volume_hidden_market_zero_2026-10-19.json`: the exact shapes, empty because the probed market is on the UI's hidden list. **No populated book was available; entry shapes (`price`, `size`) are not confirmed.**
- `api_orderbook_trades_recent_empty_2026-10-19.json`: global recent trades, empty.
- `api_orderbook_referral_config_2026-10-19.json`: referral and maker-rebate config.
- `api_ranking_weekly_masked_2026-10-19.json`: weekly ranking; third-party wallet addresses masked by me.
- `api_public_hidden_markets_ids_2026-10-19.json`: 14 hidden market addresses.
- `api_prices_simple_usdc_2026-10-19.json`: USDC/BRL price proxy.
- `api_auth_required_401_example_2026-10-19.json`: `NO_TOKEN` error shape.

---

## 14. NOT FOUND and open questions

- NOT FOUND (searched: site pages, JS bundle, API root, `/docs` variants, GitHub repo/org/code search, Sourcify, DefiLlama): developer docs, OpenAPI, contract source, contract addresses for factory/exchange/market implementation, audit report, rate limits, token lifetime, base fee schedule, per-market rules text, TVL, volume totals, Telegram/Discord stats.
- NOT FOUND (WebSearch budget exhausted): independent coverage beyond BNLData, Tokeniza and Gazeta do Povo; any confirmation of the Anatel block's effect on `palpitada.com.br` or the API.
- Open: which markets are active now and what is on them (needs a POST GraphQL read to the subgraph; the read-only rules for this task forbid POST; an orchestrator decision can allow it). Whether "weekly ranking" includes pool markets. Whether order-book fills exist at all (recent-trades empty suggests none recently). Whether the $50 cap is still in force. Exact `makerAmount/takerAmount` semantics for SELL orders. Who the multisig signers are and the timelock length.

---

## 15. Sources

Primary (venue):
- https://palpitada.com.br/ (title, meta, canonical; 2026-10-19) H
- https://palpitada.com.br/terms-and-conditions (updated 2026-04-15) H
- https://palpitada.com.br/faq, /legalidade, /como-funciona, /mercado-preditivo, /palpitada-vs-polymarket H (marketing copy)
- https://palpitada.com.br/_next/static/chunks/ (bundle files `8943-9155bf4384136ee4.js`, `7624-8952240180cf4caa.js`, `3385-5067b99da6f18557.js`, `3921-f5f0b0178f821144.js`, `6560-d615af34265c4abc.js`, `layout-b5b22a86f1db29a9.js`) H (client code read as data, not executed)
- https://api.palpitada.com.br/api/... (live GETs listed in section 4) H
- https://subgraph.palpitada.com.br/subgraphs/name/palpitada-subgraph (GET only) H

Secondary:
- https://bnldata.com.br/en/mercados-preditivos-avancam-no-brasil-e-operam-na-fronteira-entre-derivativos-financeiros-e-apostas/ (2026-01-30; Pix and creator-fee statements) M
- https://bnldata.com.br/en/mercado-preditivo-chega-ao-brasil-com-autorizacao-da-cvm-para-apostas-em-eventos/ (2026-02-18; regulatory context) M
- https://tokeniza.com.br/captacao-live-palpitada-lp/ (undated token offer) M/L
- https://www.gazetadopovo.com.br/economia/maiores-sites-de-compra-e-venda-de-previsoes-do-mundo-estao-fora-do-ar-no-brasil-entenda-por-que/ (2026-04-27; Anatel list) M
- https://sourcify.dev/server/v2/contract/42161/<address> (no match) H
- https://api.llama.fi/protocols (no match) H
- Project notes `docs/research/06-paybox-platform.md` (PayBox chain catalog and `request_wallet_sign` capabilities) H (project doc)
