# OmniBazaar - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs of static pages (app.omnibazaar.com HTML shell, robots.txt, llms.txt, sitemaps, three static JS bundles), the DefiLlama public API (api.llama.fi), and `gh api` repository search. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party content was treated as untrusted data.

Research limits (be aware):
- The shared WebSearch budget was exhausted before my first search, so there was NO web search pass. Discovery relies on the DefiLlama API, first-party probing, and reading the site's public JS bundles.
- The site is a client-rendered SPA. WebFetch returns only the title ("OmniBazaar") for every page, including /docs/predictions-marketplace, /docs/api-access-for-developers, /terms, /fees, /faq. I could not read the written docs, terms, geo rules or fee page. Their slugs are listed in the docs sitemap.
- `https://app.omnibazaar.com/api/` is `Disallow`ed in robots.txt for all user agents (including `*`, with `Crawl-delay: 5`). I did NOT probe any `/api/v1/predictions/*` endpoint, so there are no market-data response fixtures. The endpoint list below comes from reading the shipped client JS, not from calling the API.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred from first-hand data; **L** = weak or stale.

---

## 0. Bottom line

1. **Live: yes (H).** `https://app.omnibazaar.com` returns 200; `sitemap-predictions-1.xml` has `lastmod` values up to 2026-10-19T05:20Z. DefiLlama lists it (listedAt 1783467927 = 2026-07-08).
2. **It is a front-end and fee-taking router over other venues, not an independent market (H).** Every one of the 5,049 prediction URLs in the sitemap is prefixed `kalshi:` (3,745) or `polymarket:` (1,304). The shipped trade code routes Polymarket orders to Polymarket's own CLOB and sends Kalshi users out to Kalshi via a deep link. The client also contains an `omen` (Gnosis) settlement path and an Azuro resolution label.
3. **Shares liquidity with Polymarket and Kalshi (H) -> NOT an independent arbitrage leg.** Prices shown are those venues' prices; fills happen on their books.
4. **Own on-chain footprint is tiny (H).** DefiLlama TVL is $0 for the main metric; the only counted TVL is the XOM/USDC "pool2" LP at $3,283.96 total on 2026-10-19 (Base 1,112; Arbitrum 1,100; Ethereum 622; Polygon 450). That LP is the project's own token, unrelated to prediction liquidity.
5. **Recommendation: `skip` as an adapter.** At most, it is a possible secondary route for reaching Polymarket with a different fee layer, which has no value for an aggregator that can already hit Polymarket and Kalshi directly. Its public API is undocumented in anything I could read, robots-disallowed, and its read endpoints for positions need a signed message.

---

## 1. Identity and liveness

| Item | Value | Tag / source |
|---|---|---|
| Name | OmniBazaar (OmniCoin L1 network, token XOM) | H https://app.omnibazaar.com/llms.txt |
| App | https://app.omnibazaar.com (marketing site https://omnibazaar.com, 200) | H probed |
| Self-description | "a marketplace and exchange where you keep hold of your own money. Buy and sell goods ...; swap one kind of money for another; follow prediction markets; earn on what you are not using" | H llms.txt |
| DefiLlama | category "DEX Aggregator", chains Ethereum/Base/Arbitrum/Polygon, "Non-custodial cross-vertical DeFi aggregator (DEX, prediction markets, yield/RWA) and P2P marketplace running its own Avalanche-subnet L1 (OmniCoin)" | H https://api.llama.fi/protocol/omnibazaar |
| Prediction markets page | https://app.omnibazaar.com/predictions ("what the world expects to happen, priced") | H llms.txt |
| Companion verticals | P2P marketplace with escrow, spot swap/DEX (own order book), perps, RWA, yield, mobile app, browser wallet | H llms.txt, docs sitemap |
| GitHub | `gh api search/repositories?q=omnibazaar` returned 404 (search not usable); no repo link found in the pages I could read | NOT FOUND (searched: gh repo search, llms.txt, HTML shell) |

Signals the project is young and small: DefiLlama listed it July 2026, TVL series is 105 points, no non-zero total TVL point ever recorded (first_nonzero_tvl_point = null; pool2 is reported separately).

## 2. Kind and market model

- **Kind:** aggregator / front-end router with a fee layer (H, from client code), inside a broader marketplace + own L1 product.
- **Market model:** inherits the upstream venue's model. Polymarket: binary/categorical CLOB with CTF outcome tokens on Polygon (H: client references `polymarket-clob` settlement mode, chain 137, USDC). Kalshi: CFTC-regulated exchange contracts, no on-chain tokens, no OmniBazaar position tracking ("Positions on Kalshi, Azuro, and Omen aren't shown here - view them on the platform where you placed the bet." H PredictionPositionsPage bundle). Omen: Gnosis chain, WXDAI collateral, Reality.eth oracle (H: `omen:{chainId:100,chainName:"Gnosis",symbol:"WXDAI"}`).
- **Market IDs:** `<platform>:<upstream id>`, e.g. `kalshi:KXHIGHMIA-26OCT18-B82.5` (Kalshi ticker) and `polymarket:0x<64 hex>` (Polymarket condition id). This is directly useful for de-duplication: the upstream id is embedded in the OmniBazaar id. (H sitemap-predictions-1.xml)
- **Own AMM/order-book for predictions:** NOT FOUND. The only OmniBazaar-native order book mentioned is for token swaps ("taking a price off the book", llms.txt).

## 3. Chains and collateral

| Path | Chain | Collateral | Tag |
|---|---|---|---|
| Polymarket trades | Polygon (137) | USDC | H PredictionDetailPage bundle |
| Omen trades | Gnosis (100) | WXDAI | H same |
| Kalshi | off-chain, redirect to Kalshi | USD at Kalshi | H |
| Polymarket funding helper | Ethereum (1) -> Polygon via LI.FI bridge; or direct on Polygon | USDC | H PredictionsDashboardPage bundle |
| OmniBazaar L1 (OmniCoin, Avalanche-subnet), token XOM | own chain; CSP also allows many other chains' RPCs for the wallet | XOM | H CSP header, llms.txt |

DefiLlama chains list: Ethereum, Base, Arbitrum, Polygon (for the XOM/USDC LP only).

## 4. Read API

- **Official public documentation:** a docs page "api-access-for-developers" exists (https://app.omnibazaar.com/docs/api-access-for-developers; H it is in https://app.omnibazaar.com/sitemap-docs-1.xml) but I could not render it (SPA). Contents NOT READ.
- **robots.txt:** `Disallow: /api/` for every UA group including `*`; `Crawl-delay: 5`. Allowed: `/predictions/`, `/docs`, `/faq`, `/about`, `/yield/`, `/dex/rwa/`. (H https://app.omnibazaar.com/robots.txt). Also states a plain-language assistant summary is at /llms.txt (read; it contains no instructions aimed at agents, only a site map and fee summary).
- **Endpoints visible in the shipped client (H, read from `/assets/PredictionDetailPage-pzoRLxts.js`, `PredictionsDashboardPage-LIo4pAhX.js`, `PredictionPositionsPage-ZQmLmfpt.js`, `predictionsReadAuth-DyGT-rOn.js`; NOT called by me):**
  - `GET /api/v1/predictions/markets/{id}/trades?limit=25` (called without auth headers by the client)
  - `GET /api/v1/predictions/markets/{id}/comments?limit&offset&sort` (no auth in client)
  - `GET /api/v1/predictions/ohlcv/{id}?interval=1h|1d&limit=N` (no auth in client)
  - `GET /api/v1/predictions/trade/quote?marketId&outcome&amountUsd&userAddress`
  - `GET /api/v1/predictions/trade/positions/{address}` with headers `x-auth-message: OmniBazaar.Predictions.read:<addr>:<ts>` and `x-auth-signature` (wallet-signed, "omnicoin" key type) - authenticated
  - Market list/search endpoints for the dashboard: not extracted (NOT FOUND in the three bundles I grepped; likely in another chunk or served through the validator "httpRequest" gateway).
- **Host/gateway:** the client talks through an "APIGateway"/validator layer (`httpRequest`), and the CSP lists validator nodes by raw IP on :3001 (HTTP/WS). Base URL for API calls is the app origin `https://app.omnibazaar.com/api/v1/...` (H, `${yt()}/api/v1/predictions/claim` pattern + relative fetches).
- **Rate limits / auth for reads:** NOT FOUND. WebSocket: CSP allows `ws:`/`wss:` and `ws://65.108.205.x:3001`, but no documented prediction-market WS channel (L).
- **Fixtures:** none of market data (I did not call /api/). Saved in `docs/research/fixtures/omnibazaar/`: `defillama-protocol-summary.json` (DefiLlama public API, trimmed), `llms.txt` (official), `sitemap-predictions-sample.xml` (first 3 KB of the 1.18 MB official sitemap, showing the id scheme).

For an aggregator this means: do not integrate OmniBazaar's read API. Read Kalshi and Polymarket directly; both are upstream of these listings.

## 5. Trade path

(H, client bundles; I did not execute any of it)
1. `GET /api/v1/predictions/trade/quote` returns total/fee/net amount and `feeRateBps`.
2. `POST /api/v1/predictions/trade/build-tx` returns a settlement envelope with `settlementMode`: `polymarket-clob`, `platform-deep-link`/`external-deep-link` (Kalshi), or an Omen/other on-chain mode; for fee-paying mode it includes a `feeTx` (USDC transfer of the OmniBazaar fee) and sometimes an `approvalTx`.
3. User's wallet sends `feeTx` first, then signs a Polymarket order as EIP-712 typed data (`signTypedData`), derives Polymarket L2 API credentials (`getOrCreateApiKey`, `buildL2Headers`), submits the order to Polymarket's CLOB (`clobApiUrl` from the envelope), then POSTs to `/api/v1/predictions/clob/submit-order` with `typedData`, `signature`, `feeTxHash`, `submitSignature` and `signedAt`.
4. Sell: same flow with `side:"sell"`, `sizeShares`, `maxPrice`; only supported for `polymarket-clob` settlement.
5. Claim winnings: signed message POST `/api/v1/predictions/claim`; client restricts claim targets to canonical Polymarket/Omen CTF contracts on Polygon (137) or Gnosis (100).
6. Kalshi: no programmatic trade; the user is sent to Kalshi (`deepLinkUrl`), and a `POST /api/v1/predictions/trade/submit` records the redirect.

Client also gates trading behind a feature check `predictions.trade` (a server-side "allowed" flag, `!j.loading && !j.allowed` disables trading) - presumably geo/KYC/feature gating, details NOT FOUND.

**PayBox reachability: partial, but pointless.** The Polymarket leg is an EVM wallet doing a USDC transfer plus EIP-712 order signing on Polygon, which PayBox could in principle do - but an aggregator would call Polymarket's own CLOB directly (same orders, no extra fee). There is no OmniBazaar-specific venue to reach. Kalshi needs a Kalshi account.

## 6. Fees

- **Platform fee on prediction trades:** a USDC fee tx precedes each trade; `feeRatePercent` shown in the UI is server-quoted. The only constant I could read: the Polymarket funding adapter charges 25 bps (`gross*10000/10025`, `Vt=25n`) and the bridge-and-fund path adds a LI.FI fee estimate (H PredictionsDashboardPage bundle). The per-trade fee rate: NOT FOUND (served by `/trade/quote`; not called).
- **Other site fees (H llms.txt):** seller fee 1% of sale; swap 0.2% taker, 0.05% maker rebate; privacy conversion free; "ordinary use costs you no network fee - the validators pay it."
- **Net effect on arbitrage:** routing via OmniBazaar adds a fee layer versus going direct to Polymarket. Never a better leg.

## 7. Resolution and dispute

Inherited from the underlying venue (H, PredictionDetailPage bundle default strings): Polymarket -> UMA Optimistic Oracle; Kalshi -> "CFTC-Regulated Settlement"; Azuro -> Azuro Data Provider; Omen -> Reality.eth. OmniBazaar has no resolution role for these. Dispute risk is therefore exactly Polymarket's UMA risk and Kalshi's rule-based settlement risk. A separate docs page on marketplace escrow/arbitration exists but concerns P2P goods, not predictions.

## 8. Geo, ToS, automation

- robots.txt: `/api/` disallowed to all crawlers, 5s crawl delay (H). An automated scanner should honour this; no sanctioned machine API is evidenced.
- /terms, /risk, /faq: NOT READ (SPA, WebFetch returns only the title). Geo restrictions: NOT FOUND (searched: llms.txt, robots, bundles; only a `predictions.trade` permission gate found).
- Inherited restrictions apply: Polymarket's geoblocks and Kalshi's US-only/KYC rules.

## 9. Liquidity

| Metric | Value | Date | Tag / source |
|---|---|---|---|
| DefiLlama main TVL | $0 (all four chains) | 2026-10-19 | H api.llama.fi/protocol/omnibazaar |
| DefiLlama pool2 (XOM/USDC LP) | $3,283.96 | 2026-10-19 | H same |
| Prediction OI / volume attributable to OmniBazaar | NOT FOUND (searched: llms.txt, DefiLlama; "Network figures" page /platform/protocol-stats is SPA-only and unread) | - | - |
| Markets listed | 5,049 sitemap entries (3,745 Kalshi, 1,304 Polymarket); 2,562 touched in the last 7 days (2,146 Kalshi, 416 Polymarket) by `lastmod` | 2026-10-19 | H sitemap-predictions-1.xml (a mirror/cache index, not liquidity) |

Verdict: negligible own liquidity; any depth displayed is upstream.

## 10. Event-category overlap and independence

Kalshi tickers in the sitemap are weather (KXHIGHMIA, KXRAIN), tennis challenger/ATP matches, and similar - all categories Kalshi and Polymarket already cover. Overlap with other venues is 100% by construction because the listings are the same contracts. **Shares liquidity with: Polymarket (CLOB, Polygon) and Kalshi; nominally Omen (Gnosis) and Azuro.** It is therefore not an independent leg. Useful only as a possible cross-check that Kalshi/Polymarket market ids map as `kalshi:<ticker>` / `polymarket:<conditionId>`.

## 11. Adapter priority

**skip** - duplicate liquidity (pure router over Polymarket and Kalshi), no documented/permitted machine API, extra fee layer, negligible own TVL.

## 12. Open questions

1. What do /docs/api-access-for-developers and /docs/predictions-marketplace say (public API? keys? limits)? Needs a rendering fetch or the site owner's confirmation; WebFetch cannot read the SPA.
2. What is the per-trade fee rate returned by `/trade/quote`? (Not called because of the robots disallow.)
3. Does OmniBazaar run any native (non-mirrored) prediction markets on its OmniCoin L1? None seen in the sitemap; Terms/FAQ unread.
4. What is behind the `predictions.trade` gate (geo? KYC?).

## 13. Suspicious content

None found. llms.txt, robots.txt and the HTML contain no instructions aimed at AI agents. The index HTML has a developer comment about CSP/Turnstile; irrelevant.

## 14. Sources

- DefiLlama protocol API (H): https://api.llama.fi/protocol/omnibazaar ; page https://defillama.com/protocol/omnibazaar returned 403 to WebFetch.
- Official site llms.txt (H): https://app.omnibazaar.com/llms.txt
- robots.txt (H): https://app.omnibazaar.com/robots.txt
- Sitemaps (H): https://app.omnibazaar.com/sitemap.xml, https://app.omnibazaar.com/sitemap-predictions-1.xml, https://app.omnibazaar.com/sitemap-docs-1.xml
- Client bundles (H, static assets): https://app.omnibazaar.com/assets/index-DSXZbNna.js, /assets/PredictionDetailPage-pzoRLxts.js, /assets/PredictionsDashboardPage-LIo4pAhX.js, /assets/PredictionPositionsPage-ZQmLmfpt.js, /assets/predictionsReadAuth-DyGT-rOn.js
- Marketing site (H): https://omnibazaar.com (200)
- Fixtures: `docs/research/fixtures/omnibazaar/{defillama-protocol-summary.json, llms.txt, sitemap-predictions-sample.xml}`
