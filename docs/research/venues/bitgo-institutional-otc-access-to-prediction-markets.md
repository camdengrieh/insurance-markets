# BitGo (institutional OTC access to prediction markets) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public web pages and unauthenticated GETs to bitgo.com and developers.bitgo.com only. No account, wallet, key, signature, POST/PUT/DELETE, browser automation or PayBox tool was used. Third-party pages were treated as untrusted data. The WebSearch budget was exhausted for this session, so no independent news coverage was searched (see section 11).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Fixture (derived evidence table, not an API response, <= 50 KB): `docs/research/fixtures/bitgo-institutional-otc-access-to-prediction-markets/launch-post-evidence.json`.

---

## 0. Bottom line

1. **Live, but it is a distribution channel, not a market.** BitGo's OTC desk sells bilateral "event-linked derivatives" with BitGo as counterparty and Susquehanna Crypto providing "back-end liquidity" (H). There is no order book, no market list, no price feed and no venue named anywhere in BitGo's material.
2. **No API of any kind for it.** Entry point is a "Request Access" / "Connect with our team" form (H). BitGo's developer docs (REST, Trade WebSocket, FIX) cover spot trading pairs such as BTC-USD; I found zero mentions of prediction, event-linked or Susquehanna in the 147 KB `llms.txt` index (H, absence).
3. **Not reachable from a PayBox wallet.** Institutional KYB, bilateral contract, collateral held in BitGo custody, minimum $100k per trade (H).
4. **Not an independent liquidity leg.** Price comes from one LP (Susquehanna Crypto) and is probably hedged on or derived from the same regulated venues the aggregator already covers (L, inference; hedge venue NOT FOUND). Susquehanna is also the partner in the Rothera JV (M, see `rothera-exchange-and-clearing.md`).
5. **adapter_priority = skip.** Nothing to read, nothing to trade programmatically, no public liquidity figure.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| BitGo press page lists "BitGo and Susquehanna Crypto Launch First-of-Its-Kind Institutional OTC Access to Prediction Markets", dated Mar 24, 2026 (https://www.bitgo.com/press/ , linking to businesswire.com/news/home/20260324484384/...) | Press release exists | H (headline and date only) |
| BitGo blog launch post: JSON-LD datePublished 2026-03-25, dateModified 2026-07-21; text: "BitGo's offering is now live" (https://www.bitgo.com/resources/blog/bitgo-launches-prediction-markets/) | Launched, page maintained into July 2026 | H |
| Product page https://www.bitgo.com/products/prediction-markets/ and the OTC page https://www.bitgo.com/products/otc-trading/ ("Trade event-linked contracts to express market views, hedge unique risks, and pursue tactical trading strategies") are in the current sitemap and fetch OK | Still advertised on 2026-10-19 | H |
| Any evidence of actual volume, client count, or contract list | NOT FOUND (searched: product page, blog post, press list, developer docs) | - |

Verdict: **still_live = true as a marketed product** (M on actual activity: only vendor marketing, no usage evidence). The CoinLaw (coinlaw.io/top-prediction-market-platforms/) claim is confirmed in substance by BitGo's own site; CoinLaw itself is a listicle that cites BusinessWire (M).

I could not read the BusinessWire release body (HTTP 403 via WebFetch; curl timed out). The facts below come from BitGo's own blog post and product pages instead.

---

## 2. Kind and market model

- **Kind (H):** custodian/prime-broker OTC desk offering bilateral OTC derivatives. Not a venue, exchange, AMM or protocol. BitGo OTC desk "serves as the trusted counterparty for trades with liquidity for offering supported by Susquehanna Crypto" (blog post).
- **Market model:** NOT FOUND. The post says only "take direct positions on specific outcomes with defined payoffs" and "any listed contract". Binary vs categorical vs scalar is not stated; the contract list is not public. Execution is "bilateral OTC execution"; there is no order book, AMM or parimutuel pool (H, by description).
- **Tokenisation (H, by absence):** none described; positions are bilateral derivatives on BitGo's books, collateral held in BitGo custody.

---

## 3. Chains and collateral

- Collateral: "clients can post USD, stablecoins, BTC or other crypto as collateral"; assets are "already held within the BitGo platform"; "No liquidation or fiat conversions required" (H, blog post).
- Chains: NOT FOUND. No on-chain contract, no settlement chain, no token addresses. Collateral sits in BitGo custody (any chain BitGo supports), not in a user-controlled EVM/Solana wallet.
- Collateral ratios, haircuts, margin rules: NOT FOUND (product page says they are unspecified).

---

## 4. Read API

**Verdict: `exists = none`.**

- No market, price, book, trade or resolution endpoint for event-linked derivatives (H, absence: the developer index https://developers.bitgo.com/llms.txt contains no "predict", "event-linked" or "Susquehanna"; Trading Overview https://developers.bitgo.com/docs/trade-overview, List Products https://developers.bitgo.com/reference/tradeproducts, Trade WebSocket https://developers.bitgo.com/docs/trade-funded-websocket, and Electronic Trading product page https://www.bitgo.com/products/electronic-trading/ do not mention them).
- What BitGo does expose (spot only, H): Prime Trading REST under `/api/prime/trading/v1/...` (accounts, products, level1/level2 order book, orders, RFQ order), a Trade WebSocket at `GET /api/prime/trading/v1/ws` with `level2` and `orders` channels, and FIX 4.4. All need a Bearer access token with `trade_view` / `trade_trade` scope from an enterprise user with the Trade role. The products schema is spot pairs (example `BTC-USD`). Whether any event contract ever appears in List Products for an onboarded client is NOT FOUND (needs an account, which I did not create).
- Docs MCP server (https://developers.bitgo.com/mcp) is documentation search only; no trading tools (H, https://developers.bitgo.com/docs/get-started-mcp-server).
- Rate limits: NOT FOUND.
- No public unauthenticated response shape to capture, so no API fixtures.

---

## 5. Trade path

**None programmatic (for event contracts).** Access is: fill in the "Request Access" form, onboard as an institution, post collateral at BitGo, then trade "any listed contract for $100k or greater" via the OTC desk, bilateral (H). Whether quotes arrive by chat, phone, RFQ or the API is NOT FOUND. The Prime Trading RFQ endpoint (`POST /api/prime/trading/v1/accounts/{accountId}/rfq/order`) exists but is documented for spot products only (H on endpoint; M that it is not used for these contracts, since nothing links them).

---

## 6. PayBox reachability

**No.** Not an EVM/Solana contract and no signed-order scheme. A PayBox wallet could at most fund a BitGo deposit address (a plain transfer), but the account itself needs institutional onboarding, a bilateral agreement, and a $100k minimum per trade. Nothing an agent could propose as a transaction places or cancels an order.

---

## 7. Fees

NOT FOUND (searched: launch post, product page, OTC page, press list). The OTC page speaks of "competitive all-in pricing" for spot block trades (H) - i.e. the spread is the fee. Who pays what on event contracts, funding or collateral costs: unknown.

---

## 8. Resolution mechanism and dispute risk

NOT FOUND. Product page: settlement "not described"; the post lists "settlement" only as part of the BitGo product suite. Contract terms, resolution source, and dispute process are presumably in the bilateral documentation, which is not public. Risk for an aggregator: resolution may not match Kalshi/Polymarket wording, and counterparty risk sits on BitGo (an OCC-chartered national trust bank subsidiary plus affiliates; "Digital assets held in custody are not guaranteed by BitGo and are not subject to the insurance protections of the FDIC or SIPC" - footer, H).

---

## 9. Geo, ToS, automation

- Audience wording varies: "Hedge funds, family offices, and high-net-worth individuals (HNW)" (blog, H); "Institutional traders and investors" (product page structured data, H); "institutions and high net-worth individuals" (OTC page, H). Retail is explicitly excluded: "not targeted at retail users" and minimum "$100,000" (the sister blog post https://www.bitgo.com/resources/blog/polymarket-crypto-price-prediction/, H).
- Footer: "Product availability and client eligibility will vary by jurisdiction. Services listed may be provided by one of BitGo's affiliated entities." No jurisdiction list for this product (H).
- Automation rules for this product: NOT FOUND (no ToS or API terms seen; none needed without an API).
- bitgo.com robots.txt: Content-Signal `search=yes, ai-input=yes, ai-train=no`; Claude-User and Claude-SearchBot allowed (H). No training or bulk-collection use of site content.

---

## 10. Liquidity and overlap

- **Volume / OI / TVL:** NOT FOUND (searched: product page, launch post, press list). The only figure in the post, "$44 billion" 2025 prediction market volume, is industry-wide, not BitGo's (H). Minimum ticket $100k; that is the only size information.
- **Event categories (H, product page):** Elections (global and domestic), Sports, Crypto ("outcomes beyond simple price exposure"), Macro (rates, policy, global market-moving events). These overlap Kalshi/Polymarket/Rothera categories, but no actual contract list is public, so no cross-venue matching is possible.
- **Shared liquidity:** Single LP, Susquehanna Crypto, which BitGo says brings "decades of expertise in event and sports markets". Where Susquehanna hedges is NOT FOUND. Susquehanna also co-owns Rothera (Rothera note, M). Treat any BitGo quote as derived from the same underlying market prices, not as an independent arbitrage leg (L inference).

---

## 11. Gaps, caveats, open questions

- BusinessWire press release body unread (403 / timeout). WebSearch budget was exhausted, so no independent press coverage (e.g. CoinDesk, The Block) was checked; there may be details (venues, launch clients) I missed.
- Whether quotes are exposed through BitGo's Prime/FIX API after onboarding; whether the LP hedges on a CFTC venue; contract structure (binary?) and resolution source; fees; any live volume.
- A call to BitGo's sales desk would be the only way to answer these; out of scope for read-only research.
- Not an adapter candidate. If the project later wants institutional-flow signals, nothing BitGo publishes would feed that.

---

## Sources

1. BitGo press page, lists the Mar 24, 2026 release - https://www.bitgo.com/press/ (H)
2. BitGo blog "BitGo's Launches the First OTC Event-Linked Derivatives Offering", published 2026-03-25, modified 2026-07-21 - https://www.bitgo.com/resources/blog/bitgo-launches-prediction-markets/ (H)
3. BitGo Prediction Markets product page - https://www.bitgo.com/products/prediction-markets/ (H)
4. BitGo OTC Trading product page - https://www.bitgo.com/products/otc-trading/ (H)
5. BitGo blog (undated) - https://www.bitgo.com/resources/blog/polymarket-crypto-price-prediction/ and https://www.bitgo.com/resources/blog/crypto-prediction-markets/ (H, marketing)
6. BitGo Electronic Trading page - https://www.bitgo.com/products/electronic-trading/ (H)
7. BitGo developer portal index - https://developers.bitgo.com/llms.txt ; Trading Overview https://developers.bitgo.com/docs/trade-overview ; List Products https://developers.bitgo.com/reference/tradeproducts ; Trade WebSocket https://developers.bitgo.com/docs/trade-funded-websocket ; MCP server https://developers.bitgo.com/docs/get-started-mcp-server (H)
8. BitGo robots.txt - https://www.bitgo.com/robots.txt ; sitemap https://www.bitgo.com/sitemap-0.xml (H)
9. CoinLaw listicle (discovery lead, secondary) - https://coinlaw.io/top-prediction-market-platforms/ (M)
10. BusinessWire release (could not read, 403) - https://www.businesswire.com/news/home/20260324484384/en/BitGo-and-Susquehanna-Crypto-Launch-First-of-Its-Kind-Institutional-OTC-Access-to-Prediction-Markets
11. Related repo note - `docs/research/venues/rothera-exchange-and-clearing.md`
