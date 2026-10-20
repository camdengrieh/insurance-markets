# Sports.com Predict (predict.sports.com) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (about 01:00-01:20 UTC). Read-only: public pages, public unauthenticated GETs (the site's own static files, `api.predict.sports.com`, Polymarket `clob` and `data-api` hosts, `docs.polymarket.com`), `gh api` metadata/raw reads of the operator's public legal-docs repo, one WebFetch of the PredictReport review. No account, wallet, key or signature; no POST/PUT/DELETE; no PayBox money or signing tools; no third-party code cloned or run (the SPA bundle was downloaded and read as text only).
Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or inferred; **L** = weak or stale.
Web search budget ran out after one search (shared session limit), so there is no independent press coverage beyond the PredictReport page the discovery step gave us.

## Verdict

- **adapter_priority: skip.**
- **Sports.com Predict is not a venue. It is a sports-only front end that routes orders into Polymarket's CLOB with a Polymarket builder code.** Same Polygon contracts, same pUSD collateral, same outcome tokens, same order books. It is never an independent arbitrage leg (H, site bundle + docs.polymarket.com/resources/contracts, section 3 and 11).
- **The product looks dormant.** `api.predict.sports.com` returned HTTP 503 (AWS load balancer, "Service Temporarily Unavailable") on every path across repeated probes between about 01:11 and 01:19 UTC on 2026-10-19 (H, fixture). Polymarket's builder statistics attribute only **$5,606.54 all-time** volume and 6 users to its builder code, and **nothing since 2026-07-22** (H, section 8).
- **No public API, no docs, and the ToS bans bots/scrapers** and bars market makers, prop firms and similar from using its data (H, section 9). Even if it were healthy, the right read and trade path is Polymarket itself.
- The discovery hint (kind = regulated-exchange, operator undisclosed, no CFTC status) is wrong on kind and incomplete on operator: the operator is Sports Predicts Limited (Malta), and its own terms say it does "not run an exchange, a clearing house, or a brokerage" and lists the United States as a Restricted Jurisdiction (H).

## 1. Liveness (2026-10-19)

| Evidence | Value | Tag |
|---|---|---|
| `https://sports.com/` | HTTP 301 to `https://predict.sports.com/` (CloudFront). `www.sports.com` 301s to `sports.com`. | H |
| `https://predict.sports.com/` | HTTP 200, static React SPA shell (title "SPORTS.COM - Home of Sports Predictions"), S3 object `last-modified: Wed, 22 Jul 2026 17:13:08 GMT`. Routes in bundle: `/`, `/markets`, `/markets/:slug`, `/portfolio`, `/geoblocked`, `/subscribe/*`. | H |
| `https://api.predict.sports.com/*` (`/api/sports/categories`, `/api/markets/sports`, `/api/clob/time`, `/api/health`, `/`) | HTTP 503, `server: awselb/2.0`, body "503 Service Temporarily Unavailable". Repeated 01:11 to 01:19 UTC. An ELB 503 normally means no healthy targets behind the listener (M inference). Not a Cloudflare or WAF block, not a geo 403. | H (observation), M (cause) |
| Operator legal docs repo `WSBDev/sportsdotcom-public-assets` | created 2026-06-01, last push 2026-10-06; Terms dated "Last updated: June 11, 2026". Org `WSBDev` created 2025-08-08, updated 2026-10-13. So the company is alive. | H |
| Polymarket builder stats for code `0xdb31...7777` ("Sports.com", verified) | monthly volume June 2026 $3,751.82 (6 users), July 2026 $1,854.72 (3 users); no August, September or October rows; last attributed day 2026-07-22 ($3.10). All-time $5,606.54, 6 users, rank 430. | H |
| PredictReport review dated 2026-07-22 | "founded 2025, relaunched under prediction markets branding", operator "TBD", no confirmed CFTC DCM status, rated 2.5/5, "no public API or bot infrastructure has been confirmed" (third-party; did not link the official site) | M |
| Subdomains `prediction.`, `predictions.`, `pm.`, `api.` of sports.com | do not resolve (DNS) | H |

Conclusion: the company and the web shell exist; the trading backend is not serving and no flow has been routed since late July. `still_live = false` as a venue (medium confidence: a 503 could be maintenance, but the three-month zero in builder volume points the same way).

## 2. Kind and market model

- **Kind**: non-custodial web interface plus sports "Information Service" run by **Sports Predicts Limited dba Sports.com Predict, Valletta, Malta** (H, Terms section 1). Terms: "We do not run an exchange, a clearing house, or a brokerage; we do not match, execute, settle, or clear trades; and we are never a counterparty" (H, Terms 2.1). Not a CFTC DCM; no licence of any kind is named in the terms (NOT FOUND).
- **Market model**: whatever Polymarket lists, filtered to sports. Binary outcome tokens (ERC-1155 conditional tokens), one CLOB book per outcome token, multi-outcome events through neg-risk (`negRisk` flag in the event schema), three-way sides `home | away | draw` for soccer (H, bundle schema). Backend endpoints take `tag_id` and `liquidity_min`, i.e. Polymarket Gamma query vocabulary (H, bundle; M that the backend proxies Gamma, since the backend is down and cannot be inspected).
- Not an AMM, not parimutuel, no own contracts: the Sports.com-specific app code (last ~170 KB of the bundle) contains no 0x-address at all, and the Polymarket client config carries only Polymarket's system contracts (H, grep of the bundle).

## 3. Chains and collateral

- **Polygon (137) only.** The bundle sets `CLOB_CHAIN = Chain.POLYGON`, builds the relay client with `polygon.id`, and filters bridge assets to `chainId === "137"` (H, bundle).
- **Collateral: pUSD** `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` (proxy), 6 decimals. Contract set in the bundle equals Polymarket's published set: CTF Exchange `0xE111...996B`, Neg Risk CTF Exchange `0xe222...0F59`, ExchangeV3 `0xe333...00Aa`, Conditional Tokens `0x4D97...6045` (H, bundle `MATIC_CONTRACTS` vs `https://docs.polymarket.com/resources/contracts`, fetched 2026-10-19).
- Deposits and withdrawals go through Polymarket's bridge, proxied by the Sports.com backend (`/api/bridge-proxy/{supported-assets,quote,deposit,withdraw,status}`, with an `x-builder-code` header) (H, bundle). Account is a Polymarket "deposit wallet" derived from the user's EOA via Polymarket's `DepositWalletFactory` (H, bundle).

## 4. Read API: **none official; undocumented private backend, currently down**

| Item | Finding | Tag |
|---|---|---|
| Official docs / OpenAPI / llms.txt / robots.txt / sitemap | NOT FOUND. Every path under `predict.sports.com` returns the same 1,400-byte SPA shell (HTTP 200, `text/html`), including `/docs`, `/api`, `/robots.txt`, `/llms.txt`, `/sitemap.xml`. | H |
| GitHub | `WSBDev` has 4 public repos: `sportsdotcom-public-assets` (legal docs only), `legal-documents`, `social-tools`, `clickup-pr-link-action`. No API, SDK or contract repo. | H |
| Base URL used by the SPA | `https://api.predict.sports.com` | H |
| Market list | `GET /api/markets/sports?tag_id=&liquidity_min=` returns `{events[], count, fetchedAt, tagSlug?, tagId?}`; each event has `id,title,slug,endDate,volume,markets[{id,question,outcomes[],prices[],tokenIds[],volume,active,closed}],outcomes[{tokenId,label,price,side?,team?}],tags[],teams[],gameId?,negRisk?,sport?` | M (client-side zod schema in bundle; no live response) |
| Categories / one event / titles | `GET /api/sports/categories`; `GET /api/sports/event/{slug}` (404 => not found); `GET /api/markets/titles?conditions=<conditionIds>` | M |
| Streaming | SSE `GET /api/markets/sports/stream` with named events `snapshot`, `price` (`assetId,bid,ask,ts`), `trade`, plus score frames (`slug,live,ended,score,period,elapsed`); `POST /api/markets/sports/stream/{connectionId}/visibility` with `{assetIds}`. No websocket of its own. | M |
| Pass-through to Polymarket | `/api/clob/*` (CLOB proxy, e.g. `/api/clob/fees/builder-fees/{code}`), `/api/data-proxy/positions?user=&sizeThreshold=`, `/api/relayer-proxy`, `POST /api/relayer/sign` (builder-signing for the relayer) | M |
| Auth / rate limits | none documented; ToS 3.3 reserves the right to apply "transaction caps or rate limits" at will | H (ToS), NOT FOUND (numbers) |
| Live response shapes from Sports.com | NOT OBTAINABLE: all paths 503 (fixture `redirect_and_api_503_captures.txt`) | H |

Shapes I could confirm with real GETs are Polymarket's, and they are what an adapter would use to watch this builder: `GET https://clob.polymarket.com/fees/builder-fees/{code}` and `GET https://data-api.polymarket.com/v1/builders/{leaderboard,volume}` (fixtures `polymarket_builder_fee_sports_com_2026-10-19.json`, `polymarket_builders_sports_com_rows_2026-10-19.json`).
Market data for the same events should be read from Polymarket Gamma/CLOB directly (see the Polymarket spec), not from this host.

## 5. Trade path

- Programmatic placement via Sports.com: **none offered**. ToS prohibits bots and scrapers without written consent (H, 4.2); backend is down.
- Under the hood (H, bundle): the browser signs **Polymarket CLOB V2 orders** (EIP-712, EIP-712 domain "Polymarket CTF Exchange"; `builder` field set to Sports.com's builder code `0xdb314f4dcc697487aa9f311a649b726a99dc404cc412fedf2bb9cbd09bb57777`), derives L2 API credentials with `createOrDeriveApiKey` using signature type `POLY_1271` and the deposit wallet as funder, stores `{key,secret,passphrase}` in `localStorage`, posts to `https://api.predict.sports.com/api/clob` (a proxy to Polymarket's CLOB), and opens Polymarket's user websocket `wss://ws-subscriptions-clob.polymarket.com/ws/user`. Wallet deploy/approvals/withdrawals use Polymarket's relayer, authorised by a Sports.com-run builder-signing endpoint.
- Therefore the trade path for an agent is Polymarket's own (derive creds, sign orders, POST to the CLOB). An agent should NOT attach Sports.com's builder code to its own orders: it would pay Sports.com's 1.75% fee (section 7) for nothing.

## 6. PayBox reachability

- `paybox_reachable`: **partial** (only via Polymarket, nothing specific to Sports.com). The underlying venue is an EVM-wallet CLOB on Polygon with EIP-712 order and `ClobAuth` signing; PayBox's `request_wallet_sign` has a `typedData` intent and Polygon is in its chain catalogue per repo notes (docs/research/06-paybox-platform.md, 08-venues-polymarket-kalshi.md; not re-tested here, no signing tools used). That path belongs to the Polymarket adapter. Sports.com's wrapper is unusable: backend 503, no API, ToS bans automation, and its builder-signing relayer endpoint is for its own front end.

## 7. Fees

- **Polymarket platform fee (taker only)**: `fee = C x feeRate x p x (1 - p)`; Sports category `feeRate = 0.05`, makers never charged (H, `https://docs.polymarket.com/trading/fees`, fetched 2026-10-19). The Sports.com UI reads the per-token rate and exponent and nets fees out of sell proceeds (H, bundle `feePerStake`).
- **Sports.com builder fee, additive**: `GET https://clob.polymarket.com/fees/builder-fees/0xdb31...7777` returned `{"builder_maker_fee_rate_bps":175,"builder_taker_fee_rate_bps":175,"enabled":true}` on 2026-10-19 (H). Formula `builder_fee = notional x bps / 10000`, so **1.75% of notional on both maker and taker fills** that carry the code (H, `https://docs.polymarket.com/programs/builders/fees`). It applies only to orders that carry the code, so Polymarket-direct trading avoids it.
- Discrepancy to note: the Polymarket builder-fees page states maximums of 100 bps taker and 50 bps maker; the live endpoint shows 175/175 (both H, unexplained; the docs page may be stale or limits may differ by tier).
- Gas: sponsored by Polymarket's relayer for wallet deploy and approvals (H, Polymarket builder overview). Bridge fees: whatever `/api/bridge-proxy/quote` returns; not observable (backend down).
- Sports.com's own platform fee: NOT FOUND (searched: Terms, Privacy, bundle; the terms never mention a fee schedule).

## 8. Liquidity

- Sports.com-attributed volume on Polymarket (H, `data-api.polymarket.com/v1/builders/volume` and `/leaderboard`, read 2026-10-19): all-time **$5,606.54**, 6 users, leaderboard rank 430, series rank 424; at least 550 builders listed; 2026-06 $3,751.82 (6 users, monthly rank 228); 2026-07 $1,854.72 (3 users, rank 252); weekly rows from week of 2026-06-07 to week of 2026-07-19; daily rows from 2026-06-10 to 2026-07-22 (last: $3.10, 1 user). No rows after 2026-07-22. Leaderboard can lag up to 24 h per Polymarket's docs, which does not explain a three-month gap.
- Depth Sports.com users could see is Polymarket's sports books, which the Polymarket spec covers. Own TVL/OI: none (no own contracts).
- Self-reported or press volume: NOT FOUND (searched: site shell, bundle, Terms, PredictReport, one web search).

## 9. Geo, ToS, automation

- Terms (H, `https://raw.githubusercontent.com/WSBDev/sportsdotcom-public-assets/main/terms.md`, dated 2026-06-11, governing law Malta, mandatory arbitration in Valletta):
  - Restricted Jurisdictions include **the United States, the United Kingdom**, Australia, Belgium, France, Germany, Italy, the Netherlands, Ontario, Russia, Iran and others; Japan, Poland, Singapore, Taiwan and Thailand are "restricted functionality". Restricted persons get the Information Service only; VPN/proxy use is forbidden; wallets may be put in "close-only mode".
  - Prohibited: "Deploy bots, scrapers, crawlers, or similar tools to extract data from the Features ... without our prior written consent", and access to the "Data" by a "Capital Markets Client" (broker-dealer, market maker, proprietary trading firm, fund, exchange, index provider) or a market-data redistributor "unless we agree otherwise in writing". Also bars wash trading, spoofing, front-running and "any other trading we consider ... manipulative".
  - Reserved right to change or withdraw any Feature, limit it to close-only, or apply rate limits at any time (3.2, 3.3).
- The front end calls `https://polymarket.com/api/geoblock` and redirects to `/geoblocked` (H, bundle), so Polymarket's geoblock list applies on top.
- Practical reading: an automated scanner or market maker that touched this host would breach its ToS. There is no reason to; read Polymarket directly.

## 10. Resolution and dispute risk

- Not Sports.com's: "Contracts are settled by a decentralised, smart-contract-based optimistic oracle according to each Contract's published rules"; Sports.com "does not control the oracle" and will not "intervene in, alter, reverse, or override" any outcome (H, Terms 4.1 and 14). In practice that is Polymarket's UMA Optimistic Oracle process for market resolution (M for the identification: the terms name no oracle, the identification follows from the contracts being Polymarket's; mechanics are in the repo's Polymarket notes, docs/research/08 and 09).
- Risk specific to sports: postponement, abandonment, void and 50/50 outcomes under each market's published rules (Terms 14). Dispute risk is Polymarket's, not an extra layer.

## 11. Event coverage, overlap and shared liquidity

- Coverage: sports only in the UI (routes and endpoints are all `sports`); football/soccer-style 3-way markets via `home/away/draw`. Politics, crypto-price and macro markets are not exposed (H for what the bundle exposes; whether Polymarket non-sports events are filtered server-side is unknowable while the backend is down).
- Overlap: every market is a Polymarket market, so it overlaps Kalshi, Limitless, Predict.fun and others only through Polymarket.
- **Shared liquidity: 100% Polymarket's CLOB.** Evidence: Polymarket contract addresses, Polymarket EIP-712 exchange domain, Polymarket `ClobClient`, Polymarket relayer, Polymarket user websocket, Polymarket builder attribution (H). Sports.com as an extra price source for the same token ids adds nothing but its 1.75% builder fee.

## 12. Value as signal

None. Prices are Polymarket's. The only mildly useful thing is the builder-volume series as a "retail routing" gauge, and at $5.6k all-time it carries no information.

## Open questions

- Is the 503 an outage, a scale-to-zero, or an intentional soft shutdown? A look at the live UI would tell; skipped (no browser automation, no accounts).
- Why does the live builder fee (175 bps both sides) exceed the 100/50 bps maximums in Polymarket's docs?
- Does the Sports.com backend filter Polymarket events to sports, or expose more? Needs the backend to be up.
- PredictReport (2026-07-22) could not find the operator or official URL; this note supplies both (predict.sports.com; Sports Predicts Limited, Malta). Only a registry lookup (Malta) could confirm the entity; not done.

## NOT FOUND

- Official API docs, OpenAPI, rate limits, auth scheme (searched: predict.sports.com paths incl. /docs /api /robots.txt /llms.txt /sitemap.xml, `WSBDev` repos, SPA bundle, Terms, Privacy).
- Own smart contracts, audits, TVL (searched: bundle address grep, GitHub org).
- Any regulatory licence or registration (searched: Terms, Privacy, PredictReport).
- Independent press or launch coverage (searched: one web search "Sports.com prediction market launch" returned only an unrelated Genius Sports product, Prediction.com; a second search was blocked by the shared search budget).
- Sports.com's own platform fee schedule, bridge fee schedule.

## Suspicious content

- None found in the Terms, Privacy, README, SPA bundle or PredictReport page. No text aimed at AI agents.
- Tool boilerplate only: web-search results end with a line telling the assistant to cite sources with markdown links, and the budget-exhausted search message told the assistant to stop searching; neither was treated as a directive beyond the research rules (the search limit was respected).
- Unrelated name collision to avoid: "Prediction.com" by Genius Sports (launched 2026-09-17 per search snippets, M) is not this venue.

## Fixtures

`docs/research/fixtures/sports-com-prediction-market/`
- `predict_sports_com_root_index.html` - SPA shell (1.4 KB), H.
- `redirect_and_api_503_captures.txt` - headers/bodies for the sports.com 301 and the API 503s, 2026-10-19, H.
- `frontend_bundle_extracts.txt` - verbatim minified excerpts proving the Polymarket routing (contracts, builder code, endpoints, schemas), H for strings present.
- `polymarket_builder_fee_sports_com_2026-10-19.json` - live builder fee response, H.
- `polymarket_builders_sports_com_rows_2026-10-19.json` - Sports.com rows filtered from Polymarket's builder volume/leaderboard endpoints, H.
No Sports.com market or order-book response could be saved: the host returns 503.

## Sources

- https://sports.com/ (301 to predict.sports.com), https://predict.sports.com/ and `/assets/index-CocEx0NS.js` (H, fetched 2026-10-19; bundle read as text only)
- https://api.predict.sports.com/api/sports/categories, /api/markets/sports, /api/clob/time, /api/health (H: 503)
- https://raw.githubusercontent.com/WSBDev/sportsdotcom-public-assets/main/terms.md (H, "Last updated: June 11, 2026"), privacy.md and README.md (H); GitHub API metadata for `WSBDev` and its repos (H)
- https://docs.polymarket.com/resources/contracts (H), https://docs.polymarket.com/trading/fees (H), https://docs.polymarket.com/programs/builders/fees and /overview (H), https://docs.polymarket.com/developers/builders/builder-intro (H)
- https://clob.polymarket.com/fees/builder-fees/0xdb314f4dcc697487aa9f311a649b726a99dc404cc412fedf2bb9cbd09bb57777 (H)
- https://data-api.polymarket.com/v1/builders/leaderboard and /v1/builders/volume (H, public GET, 2026-10-19; the endpoints are used by sibling notes, not listed in Polymarket's llms.txt)
- https://polymarket.com/api/geoblock (H that the endpoint exists and responds with a JSON block verdict; the verdict for the research host is not recorded)
- https://predictreport.io/ecosystem/sports-com-prediction-market-review (M, third-party, dated 2026-07-22 per page)
- Web search "Sports.com prediction market launch" (M: found no Sports.com product; surfaced Genius Sports' Prediction.com via sportcal.com, igamingbusiness.com, geniussports.com)
- Repo context: docs/research/06-paybox-platform.md, 08-venues-polymarket-kalshi.md, 09-venues-onchain-clob.md, venues/betmoar-fun.md (same pattern: Polymarket builder front end)
