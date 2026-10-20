# Polyprophet (polyprophet.com) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs (the site, Wayback Machine captures, Verisign RDAP, Polymarket public data API, DexScreener, CoinGecko), WebFetch of public pages, WebSearch. No account, no wallet, no key, nothing signed, no POST/PUT/DELETE, no third-party code executed (archived JS was only read as text). WebSearch budget ran out after 3 queries, so third-party coverage is thin.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak/stale (>6 months).
All third-party text and code is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/polyprophet/domain_lifecycle_evidence.txt` (evidence excerpts only; there is no API to sample).

## 0. Verdict

**adapter_priority: skip.**

1. **Not a venue.** Polyprophet was a Chrome extension (AI Yes/No probabilities overlaid on Polymarket event pages) and, from about March 2026, a `/trade` front end that appears to route orders into Polymarket's CLOB (H for the archived page and JS, M for the interpretation). It never ran its own markets, order book or resolution. Anything quoted through it is Polymarket liquidity, so it can never be an independent arbitrage leg.
2. **Effectively dead.** As of 2026-10-19 `polyprophet.com` serves a Spaceship "for sale, Buy now $1,980" page (H). RDAP shows the domain was (re)registered 2026-09-16, two months after the last live Wayback capture (2026-07-11), so the original operator no longer controls the domain (M, inferred). The `$PP` token trades about $7 of volume in total (H).
3. **No API of any kind.** No docs, no api./docs./app. subdomains (they do not resolve), no repos (H / NOT FOUND).
4. **Do not rely on or load anything from polyprophet.com.** The Chrome Web Store listing still names `polyprophet.com` as the developer site and `/privacy` as its policy URL (H), but the domain is now owned by an unrelated reseller (M). Treat any traffic to it as untrusted.
5. Useful only as a pointer: to reach this liquidity, integrate Polymarket directly (covered by the parallel Polymarket workflow).

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://www.polyprophet.com` and `https://polyprophet.com` | 200, `<title>PolyProphet.com for sale \| Spaceship.com</title>`, `Last-Modified: Fri, 16 Oct 2026 21:00:59 GMT`; page text: Buy now $1,980, Make offer, Contact owner; no product, API, docs or terms links. Verified with curl and WebFetch. | H |
| `/privacy` on the live domain | connection closed with empty reply (curl error 52), 2026-10-19 | H |
| `api.`, `docs.`, `app.` subdomains | do not resolve (curl error 6) | H |
| Name servers | `launch1.spaceship.net`, `launch2.spaceship.net` | H |
| RDAP (https://rdap.verisign.com/com/v1/domain/polyprophet.com) | registration 2026-09-16T18:37:56Z, expiration 2027-09-16, last changed 2026-09-17, status `client transfer prohibited` (registrant data not read or recorded) | H |
| Wayback CDX for `polyprophet.com` | captures every month 2025-07 to 2026-07, all HTTP 200 and 1.2-1.9 KB (a small static Astro landing page); last capture 2026-07-11; no capture after the 2026-09 re-registration was listed | H (https://web.archive.org/cdx/search/cdx?url=polyprophet.com) |
| Chrome Web Store listing | v0.7, "last updated October 17, 2025", ~110 users, 4 ratings (5.0), developer is a "Non-trader", site `polyprophet.com`. Listing may still be up; whether the extension still works is unknown (its backend is not documented and the site is gone). | H (https://chromewebstore.google.com/detail/polyprophet/gnlabnglmffmcicfljgcompdidoifbhe), liveness of extension L |
| X account `@polyprophet_com` | HTTP 402 to WebFetch, not read | NOT FOUND (could not read) |
| Directory listings | polymark.et, polycatalog.io, launchpoly.com list it as a Polymarket browser extension; none dated after 2025 | M |

## 2. What it was

- **Extension (mid-2025)**: adds a "Use AI Prediction" button to Polymarket pages and shows Yes/No probabilities from GPT-5, Claude Sonnet 4, Gemini 2.5 Pro, Grok 4 and o4-mini plus a "proprietary" model "PP-1" (https://polymark.et/product/polyprophet) (M; marketing copy, accuracy claims unverified). Chrome Web Store description: "your personal forecasting assistant... predicts the outcomes of real-world events" (H). Landing page text (Nov 2025 and Jul 2026 captures): "Your Edge on Polymarket. Install the Chrome extension and get instant YES or NO probabilities" (H).
- **Privacy policy** (Wayback capture 2026-03-16, "Last updated: 30 Jun 2025"): operates only on polymarket.com event pages, collects event-page URLs and timestamps, claims all data stays in local browser storage and nothing is sent to external servers (H that it says so; the AI claims imply some backend, so the claim is doubtful, M).
- **`/trade` front end (2026)**: the landing page gained a "Trade" link; `/trade` was captured 2026-03-08, 03-16, 04-13, 05-13 and 06-14. Text: "Trending Markets - Trade on the most popular prediction markets", "Log In" (H). The archived bundle `_astro/MarketsWidget.Bfo7nh9x.js` (2026-06-14) contains Polymarket's official client patterns: `RelayClient` with the Safe wallet type, `ClobClient(...).createOrDeriveApiKey()`, a "token_approvals" step, `remoteBuilderConfig` pointing at its own `/a/builder-sign` endpoint (the Polymarket builder-signing pattern), and Gamma-style market fields (`outcomes`, `outcomePrices`, `groupItemTitle`) (H for the code contents, M for the conclusion that it was a Polymarket order-routing front end). Cross-check: no builder named "Polyprophet" appears in Polymarket's public builder list (`https://data-api.polymarket.com/v1/builders/volume`, ALL and MONTH, 592 distinct builder names; the only near match, `prophet`, is a different builder) (H list; attribution of this app to any code is therefore unproven).
- **Token**: `$PP`, Solana SPL, mint `FsPxXisr7W2mSipE62hXPeVMycDKrV2R1Jf7RQHBBAGS`, 9 decimals, supply ~967M. Project claim: subscriptions paid in `$PP` are 100% burned (M, claim). CoinGecko (read 2026-10-19, record updated 2026-10-17): price ~$0.00000215, market cap ~$2.1K, total volume ~$6.89, ATH $0.0001074 (2025-10-29), ATL 2026-08-07, -97.8% over 1 year; Rugcheck flags (creator can change metadata, disable sells, change fees, mint, transfer) as quoted by CoinGecko (H for the CoinGecko page, M for the flags). DexScreener `tokens/<mint>` returned `{"pairs":null}` (no DEX pair indexed) (H). MEXC tokenomics page showed ~$18.2K market cap as of 2026-01-26 (L, snippet only).

## 3. Market model, chains, collateral

NOT APPLICABLE as its own venue. If the `/trade` flow worked as the bundle suggests, it inherits Polymarket's model: binary ERC-1155 outcome tokens, hybrid CLOB, Polygon, USDC-family collateral (M, inferred from the Polymarket SDK usage; the Polymarket adapter covers the details). The `$PP` token is on Solana and is unrelated to market collateral.

## 4. Read API

| Item | Result | Tag |
|---|---|---|
| Official docs | NOT FOUND (searched: homepage, Wayback captures of `/`, `/trade`, `/privacy`, CoinGecko links, Chrome Web Store, `docs.`/`api.`/`app.` subdomains) | H |
| Public REST / WebSocket for markets, books, trades, resolution | NOT FOUND. The only fetch helper seen in the bundle (`api.ZgXyJObB.js`) issues JSON `fetch` calls to relative same-origin paths; no absolute API host appears in it or in the widget | H (bundle read), M (conclusion) |
| GitHub | CoinGecko lists no repos; no org found | M |
| Data a scanner could use | Everything shown is Polymarket data. Read it from Polymarket (Gamma, CLOB, Data API) directly | M |

No fixtures of API shapes were saved because there is no API.

## 5. Trade path

None. Orders from the `/trade` page, if it ever worked, used a Polymarket Safe wallet created from a login session (provider not identified; the bundle uses an `rpcProvider` from an embedded-wallet login) plus builder signatures from the app's own server (M). That server is gone with the domain. A PayBox EVM wallet cannot trade "through Polyprophet": to trade the underlying liquidity, use Polymarket's CLOB or on-chain contracts on Polygon from the Polymarket adapter. `paybox_reachable = no` for Polyprophet itself.

## 6. Fees

NOT FOUND (searched: homepage, Wayback captures, directory listings, Chrome Web Store). The extension was described as free by one directory (M) and `$PP` was positioned as the subscription currency (M). Any builder fee on the `/trade` flow is undocumented. Polymarket's own fees apply to the underlying trades (see the Polymarket note).

## 7. Resolution and dispute risk

Not applicable; Polyprophet had no resolution layer. Outcomes are Polymarket's (UMA-based resolution on Polymarket; see the Polymarket note). AI probabilities from the extension are opinions, not oracles, and their quality is unverified (L).

## 8. Geo, ToS and automation

NOT FOUND. No Terms of Service page exists in any capture I could read (only `/privacy`); the live domain now has none. Automation of a nonexistent service is moot.

Security note: the domain is controlled by a third party since 2026-09-16 (M). Anything still pointing at `polyprophet.com` (extension updates are served by Google, but any remote calls, links or the privacy-policy URL) should be treated as untrusted and not followed.

## 9. Liquidity

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| Own venue volume / OI / TVL | none (not a venue) | n/a | H |
| Builder-attributed Polymarket volume | no builder entry named Polyprophet | https://data-api.polymarket.com/v1/builders/volume, ALL + MONTH, 2026-10-19 (v1 retires 2026-10-24 per the Bullpen note, successor `/v2/builders/volume`) | H (list), M (attribution) |
| `$PP` token | market cap ~$2.1K, total volume ~$6.89 | CoinGecko API record, last_updated 2026-10-17 | H |
| Extension users | ~110 | Chrome Web Store, 2026-10-19 (page "updated" Oct 17, 2025) | H |

## 10. Event overlap and shared liquidity

- **Shares liquidity with: Polymarket (100%).** Every market it displayed or routed is a Polymarket market (H for the extension scope: policy says it operates only on polymarket.com; M for `/trade`). It is therefore **not** an independent arbitrage leg.
- Categories: whatever Polymarket lists (politics, crypto, sports, macro). No venue-specific events.
- Possible signal value: PP-1 / multi-LLM Yes/No probabilities. No API, no track record, vendor gone: not usable as a signal source (L).

## 11. Integration notes for the aggregator

- Do not build an adapter. Drop "Polyprophet" from the venue registry or mark `kind=extension`, `status=dead`, `liquidity_shared_with=polymarket`.
- If the registry ingests domain-based discovery (CoinGecko, directories), add a rule that domains re-registered after the last Wayback capture must not be fetched.

## Not found / open questions

- Official docs, API, repos, ToS, fee schedule: NOT FOUND.
- Whether the Chrome extension still functions (backend unknown); whether the Web Store listing is still published (the fetch may have been cached).
- Why the domain lapsed (project shutdown, sale, or oversight): not determinable.
- X account activity: not readable (HTTP 402).
- Which builder code, if any, the `/trade` flow used.

## Sources

- https://www.polyprophet.com (Spaceship sale page, 2026-10-19) - H
- https://rdap.verisign.com/com/v1/domain/polyprophet.com - H
- https://web.archive.org/cdx/search/cdx?url=polyprophet.com and `...?url=polyprophet.com/trade` - H
- https://web.archive.org/web/20251107085028/https://www.polyprophet.com/ ; https://web.archive.org/web/20260711080025/https://www.polyprophet.com/ - H (landing text)
- https://web.archive.org/web/20260316173341/https://www.polyprophet.com/privacy - H (privacy policy text)
- https://web.archive.org/web/20260614194450/https://www.polyprophet.com/trade and `.../_astro/MarketsWidget.Bfo7nh9x.js`, `.../_astro/api.ZgXyJObB.js` - H (code read as text only)
- https://chromewebstore.google.com/detail/polyprophet/gnlabnglmffmcicfljgcompdidoifbhe - H
- https://api.coingecko.com/api/v3/coins/polyprophet - H (token data; a second call was rate-limited with 429)
- https://api.dexscreener.com/latest/dex/tokens/FsPxXisr7W2mSipE62hXPeVMycDKrV2R1Jf7RQHBBAGS - H (`pairs: null`)
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=ALL and `MONTH` - H
- https://polymark.et/product/polyprophet - M (directory; model list and product description)
- https://www.polycatalog.io/project/polyprophet and https://launchpoly.com/tools/polyprophet - M (search results, not opened)
- https://www.mexc.com/price/polyprophet/tokenomics - L (search snippet, 2026-01-26)
- https://x.com/polyprophet_com - not readable (HTTP 402)
