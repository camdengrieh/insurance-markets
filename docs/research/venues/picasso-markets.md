# Picasso Markets - venue spec (2026-10-19)

Verdict: **skip**. Pre-launch waitlist landing page only. No docs, no API, no contracts, no repo found. Not a prediction-market venue that can be integrated today. Re-check only if a launch announcement appears.

Confidence legend: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

## Is it live?

- [H] https://www.picasso.markets/ returns HTTP 200 (2026-10-19). Visible content is only: title "Picasso Markets", tagline "The Stock Market. Reimagined.", buttons "Join the beta waitlist" and "Claim your username", and a ticker marquee (NVDA, TSLA, AAPL, AMZN, META, MSFT, GOOG, COIN, MSTR, CRWD, BTC). No markets, prices, docs link, or app link.
- [H] Subdomains docs./api./app.picasso.markets do not resolve (DNS failure). https://picasso.markets/docs gives 308 redirect to the same landing site (no docs). /sitemap.xml returns the landing HTML (no sitemap).
- [M] AirdropAlert (https://airdropalert.com/airdrops/picasso-markets-waitlist/) describes it as a daily stock-prediction game: users predict next-day moves of those tickers and earn rewards by accuracy; beta waitlist with username reservation and referral rewards; "market launch is upcoming", no launch date. It lists chain as Sei Network and status Active. Page dates look old (search snippet suggested roughly 590-600 days, i.e. around early 2025), so possibly stale.
- [M] Prediction Index ecosystem page (https://predictionindex.xyz/ecosystem): entry "Picasso Market" @PicassoMarkets, chain Base, status Inactive, outcome type Scalar, total volume n/a, no description. Conflicts with AirdropAlert on chain (Base vs Sei).
- X account https://x.com/picassomarkets: WebFetch returned HTTP 402 Payment Required (body not retrieved, no payment requirements recorded). Not read. Recent activity unknown.
- RootData profile exists (a search snippet said it mentions leverage, "users never have to buy or sell a stock"); the page fetched empty, so [L] only.
- NOT FOUND (searched: web search extended x2, GitHub repo search for "picasso.markets", candidate doc/api hosts, site JS bundles): official docs, whitepaper, GitHub org, contract addresses, audit, launch announcement, any 2026 news.

## Market model / chains / collateral

- Market model: NOT FOUND in a primary source. Inferred (M) from the third-party description: daily next-day price-direction/magnitude prediction on a fixed list of US stocks plus BTC; Prediction Index tags it "scalar". Order book vs AMM vs parimutuel unknown. Tokenisation unknown.
- Chain: conflicting (Base per Prediction Index [M]; Sei per AirdropAlert [M]). Unverified. Collateral: NOT FOUND.
- The site's JS bundle (Next.js, wallet library chain lists, Dynamic auth calls, a Pyth Hermes price-feed fetch) hints at an embedded-wallet login and Pyth prices [L]; the bundle is dominated by generic wallet-library chain tables, so it proves nothing about Picasso's chain.

## Read API / trade path

- Read API: **none** (exists = none). No base URL, no docs. Fetched only the homepage and its static assets; no Picasso-specific API host found in the bundle (only third parties: Pyth Hermes, Dynamic, Farcaster relay, ip-api geo lookup [L]).
- Trade path: none. Nothing to sign or propose.
- PayBox reachable: no. Nothing is deployed that a wallet could transact with (waitlist only).
- Fixtures: none saved (no API to sample).

## Fees / resolution / geo-ToS

- Fees: NOT FOUND. Resolution mechanism: NOT FOUND (a stock/BTC daily game would presumably resolve on a price oracle, possibly Pyth; speculation, L). Dispute risk: unknown.
- Geo/ToS/automation: NOT FOUND (no ToS or terms page located). The site's robots.txt contains Cloudflare content-signal boilerplate (not examined beyond the header) [H]. The site runs a client-side IP geolocation call [L].

## Liquidity and overlap

- Liquidity: none observable; Prediction Index lists total volume n/a (date of listing unknown) [M].
- Category overlap if it ever launches: US single-stock daily price moves and BTC; would overlap with Kalshi/Polymarket daily equity and crypto-price markets, and with perps/options, which is where an arbitrage leg would exist. Shared liquidity with another venue: unknown.

## Adapter priority: skip

Reason: no live product, no API, no contracts, conflicting chain claims, last-known third-party status "Inactive". Revisit only if (a) docs/API appear, or (b) the X account shows a mainnet launch.

## Open questions

- Did it ever launch beyond the waitlist? What chain (Base vs Sei)? Is the X account active in 2026?

## Sources

- [H] https://www.picasso.markets/ (fetched with curl, 2026-10-19)
- [H] https://www.picasso.markets/robots.txt, /sitemap.xml, /docs (redirect), and homepage JS chunks
- [M] https://predictionindex.xyz/ecosystem (via WebFetch summary)
- [M] https://airdropalert.com/airdrops/picasso-markets-waitlist/ (via WebFetch summary, possibly stale)
- [L] https://www.rootdata.com/Projects/detail/Picasso%20Markets?k=MTY0NTc%3D (empty on fetch; snippet only)
- https://x.com/picassomarkets (HTTP 402 on fetch, not read)

## Security note

No embedded instructions aimed at AI agents were found on the pages fetched.
