# Alpaca Derivatives LLC (Alpaca, alpaca.markets) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: Alpaca and Kalshi web pages and docs (WebFetch, which returns a small-model summary of each page, so quotes below are as returned by that tool), raw `llms.txt` files, `gh api` reads of the public `alpacahq` repos (OpenAPI specs only; nothing cloned or executed), and a few unauthenticated GETs to Alpaca API hosts (all 401). No account, key, wallet, signature, POST/PUT/DELETE, payment or browser automation. No PayBox tool was called. All third-party text was treated as untrusted data; nothing in it tried to instruct an agent. The shared WebSearch budget ran out after the first two searches, so news coverage after 2026-08-31 could not be searched (gaps listed in section 13).

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model summary of a secondary page, or my inference from first-hand data; **L** = weak or stale.

Fixtures: `docs/research/fixtures/alpaca-derivatives-llc/` holds (a) an excerpt of the one first-party machine-readable trace of event contracts (an empty tag in Alpaca's Market Data OpenAPI spec) and (b) the unauthenticated probe results. There is no public read API to sample.

---

## 0. Verdict

**adapter_priority = skip.** Confidence: high.

1. **Pre-launch.** Alpaca announced a Kalshi partnership on 2026-08-31 and its own disclosure says "Alpaca Derivatives LLC has not yet commenced regulated business operations as a Futures Commission Merchant" (H). As of 2026-10-19 I found no event-contract docs, no endpoints, no changelog entry and no launch post (H, section 1). The tracker's "launched Aug 2026 via Kalshi" is an over-read: Aug 2026 is the FCM registration and partnership announcement, not a trading launch.
2. **Not an independent leg even after launch.** "Kalshi will provide the regulated marketplace, event contracts, and clearing services." Alpaca Derivatives only does custody, money movement, statements and account management (H). Prices and depth will be Kalshi's. At best it is another execution route to Kalshi liquidity, same pattern as Webull, Robinhood and Moomoo (see `webull-event-contracts.md`).
3. **No read API for event contracts exists yet.** The Market Data OpenAPI spec carries an empty tag "Event contracts" ("Endpoints for event contract (prediction market) assets metadata.") with no operations behind it (H, fixture). Alpaca says builders "will be able to use Alpaca's existing order, position, activity, and market data interfaces, extended for event contracts" (H). Kalshi's own public API is the correct read source and is already covered by the parallel Kalshi workflow.
4. **Not reachable from a PayBox wallet**: USD in a KYC'd FCM account, no chain, no token, no on-chain signature (section 6).
5. **Worth keeping:** a watch trigger. Re-check after Q4 2026 for (a) paths attached to the "Event contracts" tag in `alpacahq/alpaca-java` `specs/data/openapi.yaml`, (b) a new `AssetClass` value in the Trading API spec, (c) any "event" entry in `https://docs.alpaca.markets/us/llms.txt`. If those appear, Alpaca could matter as a Broker-API route for a partner's own users to execute the Kalshi leg of an arbitrage. Nothing else is actionable now.

---

## 1. Is it still live? (2026)

The company is live; the prediction-market product is not.

| Evidence | Date | Tag |
|---|---|---|
| Alpaca blog: "Alpaca Partners with Kalshi to Expand Prediction Market Access Through Its Global Brokerage Infrastructure" (author Luke West). "More details about the partnership and prediction markets at Alpaca are coming soon." Disclosure: Alpaca Derivatives "has not yet commenced regulated business operations as a Futures Commission Merchant." https://alpaca.markets/blog/alpaca-partners-with-kalshi-to-expand-prediction-market-access-through-its-global-brokerage-infrastructure/ | 2026-08-31 | H |
| Kalshi newsletter post, same partnership, same disclosure, no launch date. https://news.kalshi.com/p/alpaca-kalshi-prediction-market-partnership | 2026-08-31 | H |
| Yahoo Finance repost of Covers.com: CFTC/NFA registration of Alpaca Derivatives LLC as FCM; Alpaca "is now able to broker and clear prediction market and event contract trading"; "cannot list markets in-house without receiving its Designated Contract Market status"; "will slowly introduce new products". https://finance.yahoo.com/markets/options/articles/alpaca-enters-prediction-markets-arms-181500535.html | 2026-08-18/19 | M |
| gamblingnews.com: Alpaca "yet to officially start its FCM operations"; no launch date; quote from Tony Lee (chief brokerage officer): "By adding event contracts to our platform, we can give partners a simpler way to expand their offerings". https://www.gamblingnews.com/news/alpaca-braces-for-prediction-markets-foray/ | 2026-08-18 | M |
| Alpaca blog index page 1 (newest posts 2026-10-02 to 2026-10-14: BingX, Ajaib, ChatGPT integration, Bybit, data protection): none mention prediction markets, Kalshi, event contracts, futures or FCM. https://alpaca.markets/blog/ | 2026-10-19 | H |
| Docs changelog, entries 2026-10-02 to 2026-10-16: none concern event contracts. https://docs.alpaca.markets/us/changelog | 2026-10-19 | H |
| alpaca.markets homepage: lists US Stocks & ETFs, Options, Cryptocurrency; no mention of prediction markets, event contracts or Kalshi. https://alpaca.markets | 2026-10-19 | H |
| Discovery tracker (mickbransfield.com) lists "Alpaca Derivatives LLC broker platform - Aug 2026 - Kalshi partner - NFA ID 0576042" and "Alpaca" among "Front-ends routing through KalshiEX"; no launch date or status given. https://mickbransfield.com/cftc-regulated-pms/ | 2026-10-19 | M |

Verdict: **still_live = false for the prediction-market product** (announced, FCM registered, not yet trading). The parent company is operating normally (blog and changelog active through 2026-10-16).

NFA registration: the NFA ID 0576042 and "registered with the CFTC as a Futures Commission Merchant ... NFA member" are stated by Alpaca and Kalshi (H for the statement). I could not verify the register itself: the NFA BASIC URL from the tracker returned only an empty search form (NOT FOUND: NFA BASIC firm record; searched: the tracker's BASIC link).

---

## 2. Kind and market model

- **Kind (H):** broker / FCM front end. Alpaca Derivatives LLC is an Alpaca subsidiary that "integrates directly with Kalshi"; Kalshi is the exchange (DCM) and clearing house. Alpaca's pitch is to offer event contracts to its 300+ institutional partners and builders "via the same agent-first infrastructure partners and builders already use for stocks, options, fixed income, and crypto" (H, both announcements).
- **Market model:** not described in any Alpaca source (NOT FOUND, searched: the announcement, docs, llms.txt, OpenAPI specs). By construction (Kalshi lists the contracts) it will be Kalshi's: binary YES/NO event contracts on a central limit order book, $1 payout (M, inference; Kalshi's model is documented in the parallel Kalshi spec and `docs/research/08-venues-polymarket-kalshi.md`). Do not model Alpaca separately.
- **Categories named by Kalshi for this partnership (H):** "Economic indicators, financial markets, weather, sports, and cultural events". Alpaca: "Kalshi markets trade 24/7" (H).
- **Tokenisation:** none. Positions would be cleared futures-style event-contract positions held through the FCM (M, by structure; no token or chain appears in any source).
- **Possible second intermediary:** the Covers/Yahoo piece names CME Group as another possible intermediary (M). No Alpaca source mentions CME. Unconfirmed.

---

## 3. Chains and collateral

- **Chains: none.** Custody and money movement are done by Alpaca Derivatives LLC (H). USD collateral in an FCM customer account (M, inferred from the FCM structure; no source states the funding rails for event contracts).
- Alpaca's existing stock-brokerage funding features (the Broker API docs index lists Instant Funding; the changelog mentions funding wallet withdrawals) are documented for the stock brokerage; whether any apply to event contracts is NOT FOUND.

---

## 4. Read API

**Official: none for event contracts today.** (`exists = none`.)

| Check | Result | Tag |
|---|---|---|
| `https://docs.alpaca.markets/us/llms.txt` (81,867 bytes) grep for prediction, event contract, kalshi, futures, derivativ | no match | H |
| `https://docs.alpaca.markets/llms.txt` (India GIFT City index, 152,632 bytes) same grep | no match | H |
| `https://docs.alpaca.markets/us/docs/alpaca-api-platform` | lists only stocks, options, crypto; no event contracts | H |
| `https://docs.alpaca.markets/us/docs/trading-api-mcp` | tools for stocks/ETFs, crypto, options, fixed income quotes; no event contracts | H |
| Guessed docs URLs `/us/docs/prediction-markets`, `/us/docs/event-contracts`, `/us/reference/get-events` | 404 | H |
| Market Data OpenAPI v1.1 (`alpacahq/alpaca-java` `specs/data/openapi.yaml`, 44 paths, pinned 2026-10-05) | has a top-level tag `Event contracts` ("Endpoints for event contract (prediction market) assets metadata.") but **no path uses it**; the same tag is in `alpacahq/alpaca-trade-api-js` `tooling/specs/market-data-api.json`. The tag is already present in the pin from 2026-08-05 (before the announcements) | H (existence), M (inference that the product was being prepared) |
| Trading API `AssetClass` enum (same repo, `specs/trading/openapi.yaml`) | `us_equity, us_option, crypto, crypto_perp, treasury, corporate, global_equity, us_index, us_equity_chain, ipo`; no event-contract class | H |
| Code search of `alpacahq` org for "kalshi" | 0 hits; "event contract" only in the two spec files above | H |
| Unauthenticated GETs to `api.alpaca.markets`, `data.alpaca.markets`, `broker-api.sandbox.alpaca.markets` (incl. `/v2/events`, `/v1beta1/events`) | all 401 | H (fixture) |

What exists for other asset classes (so the shape to expect): Trading API on `api.alpaca.markets` / `paper-api.alpaca.markets`, Broker API on `broker-api.alpaca.markets` / `broker-api.sandbox.alpaca.markets`, Market Data on `data.alpaca.markets` (H, https://docs.alpaca.markets/us/docs/authentication). Auth is a key pair (`APCA-API-KEY-ID` + `APCA-API-SECRET-KEY` headers or HTTP Basic) for the Trading API, and for the Broker API either Basic or OAuth 2.0 client-credentials bearer tokens from `https://authx.alpaca.markets/v1/oauth2/token` (H). Even market data needs credentials (401 unauthenticated). Rate limits for event contracts: NOT FOUND (the authentication page lists none; the spec defines `ratelimit_*` response headers with an example of 100/min, which is an example value, not a policy). WebSocket/SSE for event contracts: NOT FOUND (the SSE docs cover Broker API account/trade events only).

Conclusion for the aggregator: **read Kalshi directly** (public, unauthenticated market data). Alpaca will not add a price, only possibly a second order route.

---

## 5. Trade path

**None today.** Alpaca's stated future path (H, announcement): event contracts through the existing order, position, activity and market-data interfaces, i.e. REST via Trading/Broker API with Alpaca key or OAuth credentials, for KYC'd Alpaca (or partner) accounts held at Alpaca Derivatives LLC. Order types, signing and the product's API shape are NOT FOUND.

Plumbing guess (L): Kalshi's docs list an "FCM member" API group (`Create FCM Subtrader`, `Get FCM Orders`, `Get FCM Fills`, per-subtrader daily premium caps and blocked categories; "requires FCM member access") (H that the endpoints exist, https://docs.kalshi.com/llms.txt). Alpaca Derivatives is plausibly such a member, but no source says so (L).

---

## 6. PayBox reachability

`paybox_reachable = no`. An EVM or Solana wallet cannot hold, fund or trade this: there is no contract, no chain, no token and no signed-order scheme. Access requires a KYC'd account with a regulated US FCM, USD funding, and API keys issued by Alpaca; PayBox transaction proposals or `request_wallet_sign` have nothing to sign. The only PayBox-adjacent route would be an off-chain card/bank funding flow into an Alpaca account, which is outside the plugin scope and not documented for event contracts.

---

## 7. Fees

NOT FOUND (searched: the announcement, Kalshi post, `alpaca.markets/disclosures` which links an "Alpaca Clearing Brokerage Fee Schedule" and "Alpaca Crypto LLC Fee Disclosure" but has no event-contract or Alpaca Derivatives fee text). Neither announcement mentions fees. Upstream Kalshi exchange fees (see the Kalshi spec) will presumably apply, and Alpaca may add commission or $0 commission like Webull; unknown.

---

## 8. Resolution and dispute risk

Resolution is Kalshi's (marketplace and contract rules), not Alpaca's (M, by the role split). Alpaca's own risk text: event contracts "involve risk", a customer "may lose the entire amount paid", prices may be volatile and "settlement may be delayed or disputed" (H, announcement). Added counterparty layer: customer assets sit with Alpaca Derivatives LLC as FCM (customer-segregated funds regime, M), so FCM-level operational risk is on top of Kalshi's.

---

## 9. Geo, ToS, automation

- "Availability depends on Kalshi's listed markets, regulatory requirements, and geographic eligibility"; Kalshi VP Max Crowley: access "in the US and around the world" (H). No country list (NOT FOUND).
- Alpaca serves "over 10 million accounts in more than 40 countries" (M, Yahoo/Covers), so non-US reach is plausible but event-contract eligibility by country is not stated.
- US state-level litigation risk is live: the Covers/Yahoo piece says Connecticut, New York, Washington, Wisconsin and Utah have recently ruled against prediction market platforms (M).
- Automation: Alpaca is "API-first" / "agent-first" and sells programmatic access (H), so API trading is the intended use; but there is no event-contract customer agreement or ToS to read yet (NOT FOUND).

---

## 10. Liquidity

- **Alpaca-originated volume/OI/TVL: none** (not trading; NOT FOUND for any figure).
- Underlying venue: Kalshi says "Kalshi trading exceeded $40 billion in July" 2026 (H as Kalshi's self-reported claim, https://news.kalshi.com/p/alpaca-kalshi-prediction-market-partnership, dated 2026-08-31). That is Kalshi's liquidity, not additional liquidity.
- Distribution claims: Alpaca "supports more than 300 financial institutions, many serving millions of end customers" (H, Kalshi post); a third-party estimate of "about 14 million" connected brokerage accounts (L, reported by a search summary I could not trace to a first-hand page; the companies do not give that figure).

---

## 11. Event-category overlap (arbitrage relevance)

Everything Alpaca will offer is Kalshi's catalogue: economic indicators (Fed, CPI, jobs), financial markets (index/FX/crypto-price ranges), weather, sports, culture (H, Kalshi post). These overlap Polymarket, XO, Limitless, Opinion and others, but the arbitrage leg is **Kalshi**; Alpaca adds none. If Alpaca later carries CME Group event contracts (unconfirmed, M) that would be a distinct catalogue worth revisiting.

## 12. Shared liquidity

**Shares liquidity with Kalshi (100% by design; Kalshi is the exchange and clearing house).** Same family as Webull, Robinhood, Moomoo (the tracker lists Alpaca beside them, M). Not an independent arbitrage leg.

---

## 13. Not found / open questions

- Launch date and eligibility for event-contract trading at Alpaca (searched: Alpaca blog index, changelog, docs llms.txt, announcements; the WebSearch budget was exhausted so Oct 2026 news was not searched).
- Event-contract API reference, order model, fees, rate limits, WebSocket (none published).
- Whether access will be Broker-API-partners only or also retail Trading API accounts (the announcement targets "partners and builders"; the Trading API MCP does not list it).
- Whether routing is Kalshi-only or also CME Group.
- NFA BASIC record verification for NFA ID 0576042.
- The original X post https://x.com/AlpacaHQ/status/2094413542317277252 (not fetchable via WebFetch; only seen as a search-result snippet, L).

## Sources

- Alpaca partnership announcement (2026-08-31): https://alpaca.markets/blog/alpaca-partners-with-kalshi-to-expand-prediction-market-access-through-its-global-brokerage-infrastructure/ (H)
- Kalshi partnership post (2026-08-31): https://news.kalshi.com/p/alpaca-kalshi-prediction-market-partnership (H)
- Business Wire copy via Morningstar (search result only, not fetched): https://www.morningstar.com/news/business-wire/20260831508238/alpaca-partners-with-kalshi-to-expand-prediction-market-access-through-its-global-brokerage-infrastructure (L)
- Covers.com via Yahoo Finance (2026-08-18/19): https://finance.yahoo.com/markets/options/articles/alpaca-enters-prediction-markets-arms-181500535.html (M)
- gamblingnews.com (2026-08-18): https://www.gamblingnews.com/news/alpaca-braces-for-prediction-markets-foray/ (M)
- Discovery tracker: https://mickbransfield.com/cftc-regulated-pms/ (M)
- Alpaca homepage, blog index, disclosures: https://alpaca.markets , https://alpaca.markets/blog/ , https://alpaca.markets/disclosures (H)
- Alpaca docs: https://docs.alpaca.markets/us/llms.txt , https://docs.alpaca.markets/llms.txt , https://docs.alpaca.markets/us/docs/alpaca-api-platform , https://docs.alpaca.markets/us/docs/authentication , https://docs.alpaca.markets/us/docs/trading-api-mcp , https://docs.alpaca.markets/us/changelog (H)
- OpenAPI specs: `gh api repos/alpacahq/alpaca-java/contents/specs/{data,trading,broker}/openapi.yaml`, `repos/alpacahq/alpaca-trade-api-js/contents/tooling/specs/market-data-api.json` (H)
- Kalshi docs index (FCM member endpoints): https://docs.kalshi.com/llms.txt (H)
- NFA BASIC link from tracker (returned an empty search form): https://www.nfa.futures.org/BasicNet/basic-profile.aspx?nfaid=LMD12CTZA2Y%3D
