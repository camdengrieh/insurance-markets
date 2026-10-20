# Tradovate Event Contracts - adapter spec

Researched 2026-10-19. READ-ONLY: WebFetch of public pages plus unauthenticated GETs (generic User-Agent `insurance-markets-research/0.1`, nothing else in any request). No account, key, signing, wallet, POST or PayBox money tool. WebSearch was used once (initial lookup); the session's search budget was then exhausted, so no further search-engine cross-checks were possible (section 12).
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary / inferred / sibling research note; **L** = weak or stale.
All third-party text is untrusted data; nothing in it was followed as an instruction.
Fixtures: `docs/research/fixtures/tradovate-event-contracts/` (4 small text files; there is no public data API, so no response sample exists).

## 0. Verdict

**adapter_priority: skip.** Confidence: medium-high.

1. Tradovate is a **retail futures broker (FCM front end)**, owned by NinjaTrader Group / Payward (Kraken). "Tradovate Event Contracts" is a broker mobile app for **CME Group's legacy daily event contracts** (options on futures, 10 benchmark markets). It is not a venue with its own book. Liquidity is CME Globex's, so it is a duplicate of the CME Group event contracts leg (`docs/research/venues/cme-group-event-contracts.md`, already P2 signal-only) and shares with NinjaTrader Connect (`ninjatrader-connect.md`, skip).
2. Product is **narrow and not overlapping** with most prediction venues: same-day close-above/below-strike on E-mini indices, WTI, natgas, EUR/USD, gold, silver, copper (H). Only overlap is index/commodity/FX daily closes with Kalshi's equivalent daily range/close markets.
3. **Liveness of the app is doubtful**: Play Store listing last updated **2023-10-17** (3 years old, H); the iOS search shows no separate event-contracts app (M). The underlying CME contracts still appear in CME docs in 2026 (M). The Tradovate marketing page is still up but undated (H).
4. **No public read API**; the Tradovate trading API (REST/WebSocket) is authenticated, needs a funded live account (> $1,000) plus a paid API add-on, forbids acting for others, and its spec has no event-contract product type (H). Not PayBox-reachable.

## 1. Is it still live? (2026)

| Evidence | Value | Tag |
|---|---|---|
| tradovate.com home | Pricing section lists "Nano & Event Contracts" commissions; footer: copyright 2011-2026 Payward; NTC (NinjaTrader Clearing LLC d/b/a NinjaTrader, Kraken Derivatives US, and Tradovate) is an FCM, NFA ID 0309379 | H (https://www.tradovate.com/ , https://www.tradovate.com/pricing/) |
| Event-contracts landing page | https://info.tradovate.com/event-contracts-education returns HTTP 200 with FAQ, hours, "top 10 markets". No date on page; footer is site-wide boilerplate (so it does not prove the product is current) | H for existence, L for currency |
| Android app | `com.tradovate.ec` "Tradovate - Event Contracts", 10,000+ installs, **Updated on Oct 17, 2023**, other date Sep 9, 2022 | H (https://play.google.com/store/apps/details?id=com.tradovate.ec). **Stale > 6 months, 36 months.** |
| iOS | Public iTunes search for "tradovate event contracts" / "tradovate" returned `com.tradovate.pulse` "Tradovate: Trade & Invest" (v2.6.0, updated 2026-09-25) and NinjaTrader apps; no event-contracts-named app in the top 5 | M (search is not exhaustive) |
| Tradovate to NinjaTrader consolidation | "Your Tradovate login now unlocks all NinjaTrader platforms ... accounts are already connected" | H (https://ninjatrader.com/tradovate-to-ninjatrader-login/ via WebFetch summary) |
| CME legacy event contracts in 2026 | Event Contracts Master File wiki page modified 2026-06-02 describing next-day product list (`ECES` etc.); sibling note read MDP channel 329 "Event-based contracts" in a 2026-10-13 channel guide and a plan to move `ECBTC` to 24/7 from 2026-05-29 | H (https://cmegroupclientsite.atlassian.net/wiki/rest/api/content/457088455) for the page date; M for current trading |
| Tradovate support article "Event Contracts" | https://support.tradovate.com/s/article/Tradovate-Event-Contracts : WebFetch failed (certificate error); curl returned a Salesforce SPA shell with no article text | NOT READ |

Verdict: **still_live = true for the broker and the CME product; the dedicated app is probably dormant (unverified).** I could not confirm that new accounts can currently trade event contracts at Tradovate. Possibly folded into NinjaTrader accounts: NOT FOUND.

## 2. Kind and market model

- **Kind: broker-or-frontend** (retail FCM app) over a **regulated-exchange** (CME Globex, a CFTC DCM). H for the broker/CME relationship: "Tradovate is one of the first regulated US brokers to offer Event-Based Contracts offered by CME Group" (https://info.tradovate.com/event-contracts-education). The 2022 press release names CME and Tradovate/NinjaTrader as launch partner (H, https://www.tradovate.com/press-releases/ninjatrader-event-contracts-announcement/, dated 2022-09-19, **stale 4 years**).
- **Market model**: binary above/below-strike contracts on a single daily close, per underlying, a ladder of strikes ("Pick a level (strike), then decide if the market will close above or below"). "You win if you select below and the price is at or below the strike price" (H). Per CME's master-file wiki these are technically **cash-settled options on futures**, product code `EC` + underlying code (`ECES`, `ECNQ`, `ECRTY`, `ECYM`, `EC6E`, `ECGC`, `ECSI`, `ECHG`, `ECCL`, `ECNG`), subtype `EVENT` (H wiki, product codes also H on the Tradovate page). Central limit order book at CME (sibling note); no AMM, no parimutuel. Outcome tokenisation: none (broker ledger position in a USD FCM account).
- **Payout size conflict**: Tradovate FAQ says a winner "earn[s] $100" per contract (H, current page); the 2022 launch PR says a $20 payout with prices $0.25 to $20 (H, 2022). The CME wiki says fixed payout 20.00 "at launch" (sibling note). Treat `fixPayout` as per-contract and read it from CME Reference Data (auth required); do not hard-code.
- **Product list** (H, Tradovate page): E-mini S&P 500, Nasdaq-100, Russell 2000, Dow, WTI crude, natural gas, EUR/USD, gold, silver, copper. Hours Sun-Fri CT, open 5:00 PM, close between 12:00 PM and 3:00 PM depending on product (fixture).

## 3. Chains and collateral

No chain, no token. Collateral is USD cash in an NTC (NinjaTrader/Tradovate) futures account (H: "Complete the online application process and fund through the Event Contract app"). Funding method details (ACH/wire/card/crypto on-ramp): NOT FOUND. Base, Ethereum, BNB, Arbitrum, Polygon and Solana wallets have no role.

## 4. Read API

- **exists: official-authenticated** (for account-holders only) and, for event-contract prices, effectively `none`.
- Tradovate trading/market-data API: docs https://api.tradovate.com/ (Redoc SPA, OpenAPI embedded in the JS bundle, no `/openapi.json`; H). Servers in the spec: `https://live.tradovateapi.com/v1`, `https://demo.tradovateapi.com/v1`, WebSocket `wss://live.tradovateapi.com/v1/websocket`, `wss://demo.tradovateapi.com/v1/websocket`, `wss://replay.tradovateapi.com/v1/websocket`, and `md.tradovateapi.com` for the market-data feed (H, bundle text). Key REST paths seen: `/auth/accesstokenrequest`, `/product/find`, `/contract/items`, `/contract/find`, `/order/*`, `/fill/list`, `/position/deps`, `/account/list` (H).
- **Event contracts in the API spec**: the License Agreement lists "event contracts" among tradable categories (H), but `Product.productType` enum is only CommonStock, Continuous, Cryptocurrency, Futures, MarketInternals, Options, Spread, Swap (H). Whether `EC*` products are returned by `/product/find` or `/contract/find`, and whether the market-data feed quotes them: **NOT FOUND** (needs an authenticated call, which I may not make).
- **Auth**: POST `/auth/accesstokenrequest` with `{name, password, appId, appVersion, cid, sec}` then Bearer token (H). Prereqs to get an API key (H, community post https://community.tradovate.com/t/how-do-i-access-the-api/2380; date unknown): LIVE account, **> $1,000 balance**, purchase of the "API Access" add-on, click-through agreement and attestations.
- **Rate limits**: no numeric figures in the docs bundle; it describes penalty responses `{"p-ticket","p-time"}` (retry after p-time with p-ticket), a `p-captcha` flag, and **one simultaneous client connection per customer** unless subscribed for more (H, bundle). Numeric limits: NOT FOUND (docs point to https://github.com/tradovate/example-api-faq, not read).
- **Unauthenticated probes (2026-10-19, fixture `unauthenticated_probes_2026-10-19.txt`)**: `GET live.tradovateapi.com/v1/auth/accesstokenrequest` returns 400 "Invalid JSON"; `product/list`, `contract/find`, `product/find` on live/demo and `md.tradovateapi.com/v1/` return empty 404. No public market data.
- Real price source for these contracts: CME Market Data (licensed, OAuth WebSocket `wss://markets.api.cmegroup.com/marketdatastream/v1`, MDP 3.0 channel 329) per `cme-group-event-contracts.md` section 4 (M here). That is the right adapter, not Tradovate.
- Resolution endpoint: none; CME final settlement via MDP 3.0 (sibling note).

## 5. Trade path

- **Retail**: the Tradovate Event Contracts mobile app (Android/iOS) and web/desktop platforms; account opened in-app (H).
- **Programmatic**: Tradovate REST/WebSocket order API (`/order/placeorder` family; H paths exist) under the API License Agreement; whether it can route `EC*` contracts is NOT FOUND. Signing: OAuth-style access token from username/password + API key (cid/sec); no wallet signature, no EIP-712.
- **Agent constraint (H)**: "You may not access or control customer accounts through the API integration ... You may not, under any circumstances, act on behalf of a customer." So a third-party agent/aggregator cannot trade on a user's behalf; only the account holder may run their own program. The agreement also lets NinjaTrader/the exchange halt event contracts at any time (s26).

## 6. PayBox reachability

**paybox_reachable: no.** USD FCM account, KYC'd, username/password + API-key auth, no on-chain contract or signed-order scheme (H/M). A PayBox wallet could at best be a funding source if Tradovate accepted crypto deposits (NOT FOUND), which would not make the position tradable from PayBox. I did not run PayBox discovery in this pass (the CME note records `discover_plugins` empty for CME on 2026-10-19; not re-checked).

## 7. Fees

- Tradovate commission, "Nano & Event Contracts", per side (H, https://www.tradovate.com/pricing/): Free plan **$0.20**, Monthly plan **$0.15** ($99/mo), Lifetime plan **$0.05** ($1,499 once). "Exchange, clearing, and NFA fees still apply" (amounts not stated).
- **Conflict**: the event-contracts landing page says "Event Contracts at Tradovate are commission-free. Standard fees apply." (H). Which is current is unresolved; the pricing page is the more recent-looking surface but neither is dated.
- Exchange fee for CME event contracts: other brokers report $0.01 per contract at IBKR (M, sibling note), $0.02 at DraftKings (M). Tradovate's exchange-fee schedule: NOT FOUND (pricing FAQ on tradovate.zendesk.com not read).
- Payer: customer, per side. For a contract that pays $100 and trades at e.g. $50, $0.20 + exchange fees is under 1 percent; for the $20-payout structure it would be several percent. Exact payout unresolved, so net edge cannot be computed.

## 8. Resolution and dispute risk

Exchange-determined cash settlement by CME against the true underlying future's daily settlement; ties at the strike go to "below"/No (H Tradovate FAQ; wiki `TrueUnd` text, M). Final prices via CME (MDP 3.0 settlement channel; sibling note). No oracle, no on-chain dispute process; corrections follow CME rules (rulebook not read, NOT FOUND). Dispute risk is low in practice (standard futures settlement), but cross-venue matching must use the same settlement source and timestamp (CME settlement vs the close print other venues use).

## 9. Geo, ToS and automation

- US regulated broker; eligibility "U.S. regulated broker" (H). Non-US availability: NOT FOUND. Risk disclaimers as standard FCM (H).
- Automation: only through the Tradovate API under an API License Agreement (H, quotes above): no acting for customers, no redistribution of NinjaTrader content/market data to third parties, exchange data licensing obligations (s2(v)), changes at any time. Scraping the apps: not appropriate; none attempted.

## 10. Liquidity

NOT FOUND. No Tradovate-specific volume, open interest or price-depth figures exist publicly (searched: tradovate.com, pricing, info.tradovate.com landing page, Play listing). Only datapoints: Android app **10,000+ installs** (H, Play, but a 2023 snapshot) and CME's aggregate "100 million event contracts in about eight weeks" (2026-02-13, from sibling note, M; includes the new swap-based family and sports, not this product). Both stale or not attributable.

## 11. Event categories and overlap

Daily close above/below a strike for S&P 500, Nasdaq-100, Russell 2000, Dow futures; WTI, natural gas, EUR/USD, gold, silver, copper (H). Overlap with other venues: Kalshi (and Polymarket sparsely) list daily index/commodity/FX range or above-below markets (M, Kalshi is covered by another workflow; ForecastEx also settles index contracts on CME E-mini settlement per `forecastex.md`, so the oracle is shared). No sports, politics, or macro (CPI/Fed) in this product. **Shares liquidity with: CME Group Globex** (the book), and the same CME legacy contracts are reachable via IBKR, other FCMs and NinjaTrader. Not an independent arbitrage leg; if the scanner ever needs the CME leg, source it from CME market data directly, not via Tradovate.

## 12. Gaps and open questions

- Is the Tradovate Event Contracts app still supported for new users in late 2026 (last Play update 2023-10-17)? Support article unreadable (cert error / SPA shell).
- Current contract payout ($20 vs $100) and fee ($0 vs $0.20) conflicts between Tradovate pages.
- Whether `EC*` products are exposed through the Tradovate API or market-data feed (requires an authenticated call).
- Web search was unavailable after the first query, so I could not look for news of a sunset or migration of Tradovate event contracts into NinjaTrader's app; recommend a search "Tradovate event contracts discontinued" later.

## Suspicious content

None. The API agreement and landing page contain no instructions aimed at AI agents. The Tradovate/NinjaTrader press release lists a PR contact email address (third-party text, not reproduced).

## Sources

- [H] https://www.tradovate.com/ (WebFetch 2026-10-19; "Nano & Event Contracts" pricing, footer, NFA ID)
- [H] https://www.tradovate.com/pricing/ (WebFetch summary 2026-10-19)
- [H] https://info.tradovate.com/event-contracts-education (curl 2026-10-19; product list, FAQ, hours, $100 payout, commission-free)
- [H, 2022 stale] https://www.tradovate.com/press-releases/ninjatrader-event-contracts-announcement/ (curl; 2022-09-19)
- [H, 2022 stale] https://www.tradovate.com/press-releases/cme-event-contracts-announcement/ (WebFetch; 2022-03-14)
- [H] https://play.google.com/store/apps/details?id=com.tradovate.ec (curl; 10,000+ installs, updated 2023-10-17)
- [M] https://itunes.apple.com/search (public iTunes search, 2026-10-19)
- [H] https://ninjatrader.com/tradovate-to-ninjatrader-login/ (WebFetch summary)
- [H] https://api.tradovate.com/ and bundle https://api.tradovate.com/assets/index-DN1KkyXi.js (servers, endpoints, productType enum, rate-limit text, API License Agreement)
- [H] https://community.tradovate.com/t/how-do-i-access-the-api/2380 (API key requirements; undated)
- [H] https://live.tradovateapi.com/v1/... unauthenticated probes (fixture)
- [H] https://cmegroup client wiki page "Event Contracts Master File" https://cmegroupclientsite.atlassian.net/wiki/rest/api/content/457088455 (modified 2026-06-02)
- [M] `docs/research/venues/cme-group-event-contracts.md`, `docs/research/venues/ninjatrader-connect.md`, `docs/research/venues/forecastex.md` (sibling notes, this repo)
- Not read: https://support.tradovate.com/s/article/Tradovate-Event-Contracts (cert error / SPA shell); Tradovate pricing FAQ on zendesk.
